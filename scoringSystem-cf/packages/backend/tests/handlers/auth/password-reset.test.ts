/**
 * 忘記密碼：輸入 email → 新密碼寄到信箱，但新密碼先「掛著」不生效。
 *
 * 要守住的是：知道別人 email 的人可以幫對方申請重設，但不能讓對方原本的
 * 密碼失效。所以舊密碼要一直能用，直到有人用信裡的新密碼登入成功為止。
 *
 * 跑在由全部 migrations 建出來的 in-memory SQLite 上，因為整件事的重點
 * 就是 users 表那兩個新欄位怎麼被寫、怎麼被讀。只有寄信被換成 spy，
 * 好從裡面拿出明文的新密碼。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createSqliteD1, hasNodeSqlite } from '../../mocks/d1-sqlite';
import { createMockEnv } from '../../mocks/env';
import type { Env } from '../../../src/types';

vi.mock('../../../src/queues/email-producer', () => ({
  queuePasswordResetEmail: vi.fn(async () => {})
}));

import { queuePasswordResetEmail } from '../../../src/queues/email-producer';
import {
  requestPasswordReset,
  resolvePendingPassword,
  PENDING_PASSWORD_TTL_MS
} from '../../../src/handlers/auth/password-reset';
import { hashPassword, verifyPassword } from '../../../src/handlers/auth/password';

const MIGRATIONS = resolve(__dirname, '../../../migrations');
const USER = 'student@school.tw';
const USER_ID = 'usr_student';
const OLD_PASSWORD = 'OldPassw0rd!';

let env: Env;
let db: ReturnType<typeof createSqliteD1>;
let clock = new Date('2026-03-01T09:00:00Z').getTime();

function setClock(ms: number) {
  clock = ms;
  vi.setSystemTime(clock);
}

function readUser() {
  return db._raw
    .prepare('SELECT * FROM users WHERE userId = ?')
    .get(USER_ID) as Record<string, unknown>;
}

/** 從寄信 spy 拿出最後一封信裡的明文新密碼 */
function mailedPassword(): string {
  const calls = vi.mocked(queuePasswordResetEmail).mock.calls;
  return calls[calls.length - 1][3];
}

/** 照登入路由的順序：先比對正式密碼，再交給 resolvePendingPassword */
async function login(password: string): Promise<boolean> {
  const user = readUser();
  const regular = await verifyPassword(password, user.password as string);
  return resolvePendingPassword(env, user, password, regular);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setClock(new Date('2026-03-01T09:00:00Z').getTime());

  const schema = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf-8'))
    .join('\n');
  db = createSqliteD1(schema);
  env = createMockEnv({ DB: db });

  db._raw.prepare(`
    INSERT INTO users (userId, password, userEmail, displayName, status, createdAt, updatedAt)
    VALUES (?, ?, ?, '測試使用者', 'active', 1000, 1000)
  `).run(USER_ID, await hashPassword(OLD_PASSWORD), USER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe.skipIf(!hasNodeSqlite)('requestPasswordReset', () => {
  it('寄出新密碼，但舊密碼原封不動', async () => {
    const before = readUser().password;
    const result = await requestPasswordReset(env, USER, '203.0.113.9', 'TW');

    expect(result.success).toBe(true);
    expect(queuePasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(queuePasswordResetEmail).mock.calls[0][4]).toMatchObject({
      pending: true,
      requestIp: '203.0.113.9'
    });

    const user = readUser();
    expect(user.password).toBe(before);
    expect(user.pendingPassword).toBeTruthy();
    expect(user.pendingPasswordExpiresAt).toBe(clock + PENDING_PASSWORD_TTL_MS);
  });

  it('沒註冊的 email 回一樣的訊息，也不寄信', async () => {
    const known = await requestPasswordReset(env, USER);
    vi.mocked(queuePasswordResetEmail).mockClear();
    const unknown = await requestPasswordReset(env, 'nobody@school.tw');

    expect(unknown).toEqual(known);
    expect(queuePasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasNodeSqlite)('用信裡的新密碼登入', () => {
  it('第一次登入就讓它變成正式密碼，舊密碼從此失效', async () => {
    await requestPasswordReset(env, USER);
    const fresh = mailedPassword();

    expect(await login(fresh)).toBe(true);

    const user = readUser();
    expect(user.pendingPassword).toBeNull();
    expect(user.passwordChangedAt).toBeTruthy();
    expect(await login(OLD_PASSWORD)).toBe(false);
    expect(await login(fresh)).toBe(true);
  });

  it('超過 24 小時就不能用了，舊密碼照樣能登入', async () => {
    await requestPasswordReset(env, USER);
    const fresh = mailedPassword();

    setClock(clock + PENDING_PASSWORD_TTL_MS + 1);

    expect(await login(fresh)).toBe(false);
    expect(await login(OLD_PASSWORD)).toBe(true);
  });

  it('連續申請兩次，只有最新那封信的密碼有效', async () => {
    await requestPasswordReset(env, USER);
    const first = mailedPassword();
    await requestPasswordReset(env, USER);
    const second = mailedPassword();

    expect(await login(first)).toBe(false);
    expect(await login(second)).toBe(true);
  });
});

describe.skipIf(!hasNodeSqlite)('別人幫你按了重設，你照常用舊密碼登入', () => {
  it('舊密碼能登入，而且信裡那組新密碼跟著作廢', async () => {
    await requestPasswordReset(env, USER);
    const fresh = mailedPassword();

    expect(await login(OLD_PASSWORD)).toBe(true);
    expect(readUser().pendingPassword).toBeNull();
    expect(await login(fresh)).toBe(false);
  });

  it('沒有掛著的新密碼時，登入結果完全照正式密碼', async () => {
    expect(await login(OLD_PASSWORD)).toBe(true);
    expect(await login('wrong-password')).toBe(false);
  });
});
