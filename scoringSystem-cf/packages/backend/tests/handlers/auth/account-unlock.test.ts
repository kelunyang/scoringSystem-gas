/**
 * 鎖定 → 解鎖 → 再登入，跑在真的 in-memory SQLite 上。
 *
 * 解鎖不是把 users 那三個欄位清掉就結束：失敗次數是從 sys_logs 數出來的，
 * 解鎖如果沒有把「起算點」往後推，使用者一被解鎖、再打錯一次密碼，
 * 就會被解鎖前那批舊紀錄立刻重新鎖住。`countRecentFailures` 原本只用
 * 「最後一次成功登入」當下界，那條線在「被鎖住、根本還沒成功登入過」時不存在。
 *
 * 這裡刻意讓 logging 與 security 兩個模組跑真的：失敗次數、去重、停用帳號
 * 全都是 SQL 行為，用假的實作等於什麼都沒測到。只有寄信與推播被換成 spy。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve } from 'node:path';
import { createD1FromMigration } from '../../mocks/d1-sqlite';
import { createMockEnv } from '../../mocks/env';
import type { Env } from '../../../src/types';

vi.mock('../../../src/queues/notification-producer', () => ({
  queueSingleNotification: vi.fn(async () => {}),
  queueBatchNotifications: vi.fn(async () => {})
}));

vi.mock('../../../src/queues/email-producer', () => ({
  queueAccountLockedEmail: vi.fn(async () => {}),
  queueAccountUnlockedEmail: vi.fn(async () => {}),
  queuePasswordResetEmail: vi.fn(async () => {}),
  queueSecurityAlertEmail: vi.fn(async () => {})
}));

import { checkPasswordFailureAndLock } from '../../../src/handlers/auth/login';
import { unlockUser } from '../../../src/handlers/admin/users';
import loginEventsConsumer from '../../../src/queues/login-events-consumer';
import type { LoginEvent } from '../../../src/queues/login-events-producer';

const SCHEMA = resolve(__dirname, '../../fixtures/email-cascade-schema.sql');

const USER = 'student@school.tw';
const USER_ID = 'usr_student';
const ADMIN = 'admin@school.tw';
const REASON = '使用者本人來電確認身分，確認是自己打錯密碼';

let env: Env;
let db: ReturnType<typeof createD1FromMigration>;

/** 目前時間，測試自己控制 */
let clock = new Date('2026-03-01T09:00:00Z').getTime();

function setClock(ms: number) {
  clock = ms;
  vi.setSystemTime(clock);
}

function insertUser(email: string, userId: string) {
  db._raw.prepare(`
    INSERT INTO users (userId, password, userEmail, displayName, status, createdAt, updatedAt)
    VALUES (?, 'hash', ?, '測試使用者', 'active', 1000, 1000)
  `).run(userId, email);
}

function readUser(email: string) {
  return db._raw
    .prepare('SELECT status, lockUntil, lockReason, lockCount FROM users WHERE userEmail = ?')
    .get(email) as { status: string; lockUntil: number | null; lockReason: string | null; lockCount: number };
}

/** 打錯一次密碼：記錄失敗並判斷要不要鎖（線上 /auth/login-verify-password 走的就是這支） */
function failPassword() {
  return checkPasswordFailureAndLock(env, USER, USER_ID, 'password_invalid', '203.0.113.9');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setClock(new Date('2026-03-01T09:00:00Z').getTime());

  db = createD1FromMigration(SCHEMA);
  env = createMockEnv({ DB: db });

  insertUser(USER, USER_ID);
  insertUser(ADMIN, 'usr_admin');
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('連續打錯密碼', () => {
  it('第三次失敗就暫時鎖定帳號', async () => {
    await failPassword();
    await failPassword();
    const third = await failPassword();

    expect(third.shouldLock).toBe(true);
    expect(third.lockType).toBe('temporary');
    expect(readUser(USER).lockUntil).toBeGreaterThan(clock);
  });
});

describe('unlockUser', () => {
  it('清掉鎖定狀態', async () => {
    await failPassword();
    await failPassword();
    await failPassword();

    const response = await unlockUser(env, ADMIN, USER, REASON);
    expect(response.status).toBe(200);

    const user = readUser(USER);
    expect(user.status).toBe('active');
    expect(user.lockUntil).toBeNull();
    expect(user.lockReason).toBeNull();
  });

  it('解鎖之後再打錯一次密碼，不會被解鎖前的舊紀錄重新鎖住', async () => {
    await failPassword();
    await failPassword();
    await failPassword();
    await unlockUser(env, ADMIN, USER, REASON);

    // 使用者從頭到尾沒成功登入過，所以「上次成功登入」那條下界不存在，
    // 解鎖前的 3 筆 password_invalid 全都還在 24 小時窗內
    setClock(clock + 30_000);
    const next = await failPassword();

    expect(next.shouldLock).toBe(false);
    expect(readUser(USER).lockUntil).toBeNull();
  });

  it('解鎖之後重新累積三次失敗，還是會再被鎖（而且是更長的第二段）', async () => {
    await failPassword();
    await failPassword();
    await failPassword();
    await unlockUser(env, ADMIN, USER, REASON);

    setClock(clock + 30_000);
    await failPassword();
    await failPassword();
    const third = await failPassword();

    expect(third.shouldLock).toBe(true);
    // lockCount 沒被重設，所以這次是第二段（1 小時），不是重頭來過的 15 分鐘
    expect(third.lockCount).toBe(2);
    expect(readUser(USER).lockUntil).toBeGreaterThan(clock);
  });

  it('不會順手把管理員停用（inactive）的帳號重新啟用', async () => {
    db._raw.prepare(`UPDATE users SET status = 'inactive', lockUntil = ?, lockReason = 'password_failures_first_lock' WHERE userEmail = ?`)
      .run(clock + 15 * 60 * 1000, USER);

    const response = await unlockUser(env, ADMIN, USER, REASON);
    expect(response.status).toBe(200);

    const user = readUser(USER);
    expect(user.lockUntil).toBeNull();
    expect(user.status).toBe('inactive');
  });

  it('沒被鎖的帳號回 USER_NOT_LOCKED', async () => {
    const body = await (await unlockUser(env, ADMIN, USER, REASON)).json() as {
      success: boolean;
      error?: { code: string };
    };

    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('USER_NOT_LOCKED');
  });
});

/**
 * Layer 2（登入事件佇列）是另一條會停用帳號的路：它讀「過去 24 小時」的登入紀錄，
 * 看到 3 個不同 IP 的失敗登入就永久停用。解鎖後如果不把起算點往後推，
 * 使用者解鎖後只要再登入一次（成功也算），就會被解鎖前那批紀錄重新永久停用。
 */
describe('Layer 2 威脅分析', () => {
  /** 在 sys_logs 塞一筆失敗登入（entityId 用 userId，consumer 是這樣查的） */
  function insertFailedLogin(ip: string, at: number) {
    db._raw.prepare(`
      INSERT INTO sys_logs (logId, level, functionName, userId, action, message, context, createdAt, entityType, entityId)
      VALUES (?, 'warning', 'login_failed', ?, 'login_failed', 'login_failed', ?, ?, 'user', ?)
    `).run(
      `log_${ip}_${at}`,
      USER_ID,
      JSON.stringify({ userEmail: USER, reason: 'password_invalid', ipAddress: ip, country: 'TW' }),
      at,
      USER_ID
    );
  }

  /** 丟一個事件給 consumer 跑 */
  async function consume(eventType: LoginEvent['eventType']) {
    const event: LoginEvent = {
      eventType,
      userEmail: USER,
      userId: USER_ID,
      ipAddress: '203.0.113.9',
      country: 'TW',
      city: 'Taipei',
      timezone: 'Asia/Taipei',
      userAgent: 'Test Agent/1.0',
      requestPath: '/api/auth/login-verify-password',
      timestamp: clock
    };

    await loginEventsConsumer.queue(
      {
        messages: [{ id: 'msg_1', timestamp: new Date(clock), body: event, ack: vi.fn(), retry: vi.fn() }],
        queue: 'login-events',
        ackAll: vi.fn(),
        retryAll: vi.fn()
      } as unknown as MessageBatch<LoginEvent>,
      env
    );
  }

  beforeEach(() => {
    // 三個不同 IP 的失敗登入 = distributed_attack（critical）→ 永久停用
    insertFailedLogin('198.51.100.1', clock - 60_000);
    insertFailedLogin('198.51.100.2', clock - 50_000);
    insertFailedLogin('203.0.113.7', clock - 40_000);
  });

  it('三個 IP 的失敗登入會把帳號永久停用', async () => {
    await consume('login_failed');

    expect(readUser(USER).status).toBe('disabled');
  });

  it('解鎖之後再登入一次，不會被解鎖前的紀錄重新停用', async () => {
    await consume('login_failed');
    await unlockUser(env, ADMIN, USER, REASON);

    // 跨過一分鐘，避開 distributed_attack 的去重桶，確定不是去重擋掉的
    setClock(clock + 61_000);
    await consume('login_success');

    expect(readUser(USER).status).toBe('active');
  });
});
