/**
 * `userReaction` — the field that tells the UI 「你按過這則評論」.
 *
 * `getStageComments` and `getAllStagesComments` build it from the same
 * copy-pasted reaction-aggregation block, but only one of the two copies was
 * ever corrected. The stage-level copy looked for the current user by a column
 * its own SELECT does not return:
 *
 *   SELECT lr.commentId, lr.reactionType, lr.userEmail, u.displayName
 *   ...
 *   commentReactions.find(r => r.userId === currentUser.userId)   // no userId
 *
 * `r.userId` was always `undefined`, so the lookup never matched and
 * `userReaction` came back `null` for everyone, always. Two consequences in
 * StageComments.vue, which reads it through `getCommentUserReaction()`:
 *
 *  1. after a reload, your own reaction is not shown as selected
 *  2. `handleReaction()` toggles off only when the current reaction equals the
 *     one clicked — so clicking the same reaction again *added* it instead of
 *     removing it. You could not un-react without reacting again first.
 *
 * `any` on the row callbacks is what let a non-existent column read like a
 * real one, which is why this landed during the typing cleanup.
 *
 * Behavioural rather than a grep: the defect is a value that is silently null,
 * and the fix has to be checked against the actual SQL the handler runs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../../mocks/d1-sqlite';
import { getStageComments, getAllStagesComments } from '../../../src/handlers/comments/manage';
import type { Env } from '../../../src/types';

if (!hasNodeSqlite) {
  console.warn(`[skip] user-reaction.test.ts: ${NODE_SQLITE_SKIP_REASON}`);
}

const MIGRATIONS = resolve(__dirname, '../../../migrations');

/** The whole migration sequence, in the order wrangler applies it. */
function schema(): string {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf-8'))
    .join('\n');
}

const AUTHOR = 'author@school.tw';
const READER = 'reader@school.tw';
const PROJECT = 'proj_test';
const STAGE = 'stg_test';
const GROUP = 'grp_test';
const COMMENT = 'cmt_test';

let env: Env;
let db: ReturnType<typeof createSqliteD1>;

interface CommentsBody {
  success: boolean;
  data: {
    comments: Array<{ commentId: string; userReaction: string | null }>;
  };
}

/** Seed the smallest world in which a comment can carry a reaction. */
async function seed() {
  const now = Date.now();

  for (const [email, id, name] of [
    [AUTHOR, 'usr_author', '作者'],
    [READER, 'usr_reader', '讀者']
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
    .bind(PROJECT, AUTHOR, now, now, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO stages (stageId, projectId, stageName, description, stageOrder, startTime, endTime, status, createdTime, updatedAt)
       VALUES (?, ?, '測試階段', '', 1, ?, ?, 'active', ?, ?)`
    )
    .bind(STAGE, PROJECT, now - 1000, now + 1000000, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO groups (groupId, projectId, groupName, description, createdBy, createdTime, status, allowChange)
       VALUES (?, ?, '第一組', '', 'usr_author', ?, 'active', 1)`
    )
    .bind(GROUP, PROJECT, now)
    .run();

  await db
    .prepare(
      `INSERT INTO comments (commentId, projectId, stageId, authorEmail, content, isReply, replyLevel, createdTime)
       VALUES (?, ?, ?, ?, '一則評論', 0, 0, ?)`
    )
    .bind(COMMENT, PROJECT, STAGE, AUTHOR, now)
    .run();

  // READER 對這則評論按了 helpful。
  await db
    .prepare(
      `INSERT INTO reactions (reactionId, projectId, targetType, targetId, userEmail, reactionType, createdAt)
       VALUES ('rct_test', ?, 'comment', ?, ?, 'helpful', ?)`
    )
    .bind(PROJECT, COMMENT, READER, now)
    .run();
}

describe.skipIf(!hasNodeSqlite)('userReaction', () => {
  beforeEach(async () => {
    db = createSqliteD1(schema());
    env = { DB: db } as unknown as Env;
    await seed();
  });

  it('getStageComments 回報按過的人自己的 reaction', async () => {
    const res = await getStageComments(env, READER, PROJECT, STAGE);
    const body = (await res.json()) as CommentsBody;

    expect(body.success).toBe(true);
    const comment = body.data.comments.find(c => c.commentId === COMMENT);
    expect(comment).toBeDefined();
    expect(comment!.userReaction).toBe('helpful');
  });

  it('getStageComments 對沒按過的人回報 null', async () => {
    const res = await getStageComments(env, AUTHOR, PROJECT, STAGE);
    const body = (await res.json()) as CommentsBody;

    const comment = body.data.comments.find(c => c.commentId === COMMENT);
    expect(comment!.userReaction).toBeNull();
  });

  it('getAllStagesComments 給出和 getStageComments 相同的答案', async () => {
    // 兩份幾乎一模一樣的聚合程式碼，只有一份被修過。這裡把它們釘在一起。
    const stageRes = await getStageComments(env, READER, PROJECT, STAGE);
    const allRes = await getAllStagesComments(env, READER, PROJECT, [STAGE]);

    const stageBody = (await stageRes.json()) as CommentsBody;
    const allBody = (await allRes.json()) as {
      success: boolean;
      data: {
        stageComments: Record<
          string,
          { comments: Array<{ commentId: string; userReaction: string | null }> }
        >;
      };
    };

    const fromStage = stageBody.data.comments.find(c => c.commentId === COMMENT);
    const fromAll = Object.values(allBody.data.stageComments)
      .flatMap(s => s.comments ?? [])
      .find(c => c.commentId === COMMENT);

    expect(fromAll).toBeDefined();
    expect(fromAll!.userReaction).toBe(fromStage!.userReaction);
  });
});
