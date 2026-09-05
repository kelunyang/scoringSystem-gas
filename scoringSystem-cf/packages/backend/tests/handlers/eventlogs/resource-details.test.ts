/**
 * `getEventResourceDetails` — 「看事件記錄背後那筆成果／評論」的端點。
 *
 * 路由層只擋到專案層級的 view 權限（router/activity.ts）。真正把
 * 「組員只能看自己的、組長只能看自己組的」收窄的邏輯全在 handler 裡，
 * 而它從來沒有執行過：
 *
 *   const permissionData = await permissionCheckResponse.json();
 *   const userPermissionLevel = permissionData.userPermissionLevel;   // undefined
 *
 * `getUserProjectEventLogs` 回的是 `successResponse(data)`，body 是
 * `{ success, data: { …, userPermissionLevel } }`——值在 `.data` 底下。
 * 讀最外層永遠是 `undefined`，所以 `member_in_group` 和 `group_leader`
 * 兩個分支都不成立，程式直接落到「admin/teacher/observer 可以看全部」
 * 的預設路徑。同一個檔案裡另一處（第 206 行附近）就寫了
 * `responseData.data || responseData` 來處理這層包裝，這裡漏了。
 *
 * 第二個問題各自獨立：resourceType 為 'comment' 時，查詢
 * `LEFT JOIN users u ON c.authorId = u.userId` 用了 comments 資料表
 * 沒有的欄位（實際是 authorEmail），SQLite 直接報
 * 「no such column: c.authorId」，整條路徑必定回 SYSTEM_ERROR。
 *
 * 兩者都是 `any` 遮住的：`await response.json() as any` 讓少一層 `.data`
 * 讀起來完全正常，而 `.first()` 的結果沒有型別，欄位名錯了也沒人擋。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../../mocks/d1-sqlite';
import { getEventResourceDetails } from '../../../src/handlers/eventlogs/query';
import type { Env } from '../../../src/types';

if (!hasNodeSqlite) {
  console.warn(`[skip] resource-details.test.ts: ${NODE_SQLITE_SKIP_REASON}`);
}

const MIGRATIONS = resolve(__dirname, '../../../migrations');

function schema(): string {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf-8'))
    .join('\n');
}

const OWNER = 'owner@school.tw';
const OUTSIDER = 'outsider@school.tw';
const PROJECT = 'proj_test';
const STAGE = 'stg_test';
const OWNER_GROUP = 'grp_owner';
const OUTSIDER_GROUP = 'grp_outsider';
const SUBMISSION = 'sub_test';
const COMMENT = 'cmt_test';

let env: Env;
let db: ReturnType<typeof createSqliteD1>;

interface ResourceBody {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

/**
 * 兩位使用者、兩個組，各自是自己組的組員（不是 teacher/observer/admin）。
 * OWNER 交了一份成果並留了一則評論；OUTSIDER 和它們無關。
 */
async function seed() {
  const now = Date.now();

  for (const [email, id, name] of [
    [OWNER, 'usr_owner', '擁有者'],
    [OUTSIDER, 'usr_outsider', '外人']
  ]) {
    await db
      .prepare(
        `INSERT INTO users (userId, password, userEmail, displayName, status, registrationTime, lastActivityTime, createdAt, updatedAt)
         VALUES (?, 'x', ?, ?, 'active', ?, ?, ?, ?)`
      )
      .bind(id, email, name, now, now, now, now)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO projects (projectId, projectName, description, createdBy, createdTime, lastModified, status, createdAt, updatedAt)
       VALUES (?, '測試專案', '', ?, ?, ?, 'active', ?, ?)`
    )
    .bind(PROJECT, OWNER, now, now, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO stages (stageId, projectId, stageName, description, stageOrder, startTime, endTime, status, createdTime, updatedAt)
       VALUES (?, ?, '測試階段', '', 1, ?, ?, 'active', ?, ?)`
    )
    .bind(STAGE, PROJECT, now - 1000, now + 1000000, now, now)
    .run();

  for (const [groupId, name] of [
    [OWNER_GROUP, '第一組'],
    [OUTSIDER_GROUP, '第二組']
  ]) {
    await db
      .prepare(
        `INSERT INTO groups (groupId, projectId, groupName, description, createdBy, createdTime, status, allowChange)
         VALUES (?, ?, ?, '', ?, ?, 'active', 1)`
      )
      .bind(groupId, PROJECT, name, OWNER, now)
      .run();
  }

  // 兩人都只是 member，而且各在不同組。
  for (const [email, groupId] of [
    [OWNER, OWNER_GROUP],
    [OUTSIDER, OUTSIDER_GROUP]
  ]) {
    await db
      .prepare(
        `INSERT INTO projectviewers (projectId, userEmail, role, assignedBy, assignedAt, isActive)
         VALUES (?, ?, 'member', ?, ?, 1)`
      )
      .bind(PROJECT, email, OWNER, now)
      .run();
    await db
      .prepare(
        `INSERT INTO usergroups (membershipId, projectId, groupId, userEmail, role, joinTime, isActive)
         VALUES (?, ?, ?, ?, 'member', ?, 1)`
      )
      .bind(`ug_${email}`, PROJECT, groupId, email, now)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO submissions (submissionId, projectId, stageId, groupId, submitterEmail, contentMarkdown, submitTime, createdAt)
       VALUES (?, ?, ?, ?, ?, '成果內容', ?, ?)`
    )
    .bind(SUBMISSION, PROJECT, STAGE, OWNER_GROUP, OWNER, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO comments (commentId, projectId, stageId, authorEmail, content, isReply, replyLevel, createdTime)
       VALUES (?, ?, ?, ?, '一則評論', 0, 0, ?)`
    )
    .bind(COMMENT, PROJECT, STAGE, OWNER, now)
    .run();

  // 兩筆事件記錄，讓 handler 的「這個資源有沒有事件記錄」前置檢查通過。
  for (const [logId, entityType, entityId] of [
    ['log_sub', 'submission', SUBMISSION],
    ['log_cmt', 'comment', COMMENT]
  ]) {
    await db
      .prepare(
        `INSERT INTO eventlogs (logId, projectId, userId, eventType, entityType, entityId, details, timestamp)
         VALUES (?, ?, 'usr_owner', 'created', ?, ?, '{}', ?)`
      )
      .bind(logId, PROJECT, entityType, entityId, now)
      .run();
  }
}

describe.skipIf(!hasNodeSqlite)('getEventResourceDetails', () => {
  beforeEach(async () => {
    db = createSqliteD1(schema());
    env = { DB: db } as unknown as Env;
    await seed();
  });

  it('成果的擁有者看得到自己的成果', async () => {
    const res = await getEventResourceDetails(env, OWNER, PROJECT, 'submission', SUBMISSION);
    const body = (await res.json()) as ResourceBody;

    expect(body.success).toBe(true);
  });

  it('別組的組員看不到不屬於自己的成果', async () => {
    // 路由層只擋專案層級的 view，收窄靠的就是這裡。
    const res = await getEventResourceDetails(env, OUTSIDER, PROJECT, 'submission', SUBMISSION);
    const body = (await res.json()) as ResourceBody;

    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('PERMISSION_DENIED');
  });

  it('評論的路徑不會因為 SQL 欄位名寫錯而整條掛掉', async () => {
    const res = await getEventResourceDetails(env, OWNER, PROJECT, 'comment', COMMENT);
    const body = (await res.json()) as ResourceBody;

    // 舊版查詢 JOIN 在 c.authorId 上，這個欄位不存在，
    // SQLite 直接報錯，於是無論是誰、無論哪則評論都回 SYSTEM_ERROR。
    expect(body.error?.code).not.toBe('SYSTEM_ERROR');
    expect(body.success).toBe(true);
  });
});
