/**
 * Change-email cascade tests, against a real in-memory SQLite database.
 *
 * Emails are loose foreign keys here: `users` has no FK pointing at it, so a
 * rename has to rewrite ~30 columns across 22 tables or the account silently
 * loses its wallet balance, its permissions and its work. The two things worth
 * proving are therefore behavioural, not unit-level:
 *
 *  1. the pre-flight scan an admin approves equals the rewrite that happens
 *  2. the rewrite is all-or-nothing, so a collision can never leave a login
 *     email pointing at data that stayed behind
 *
 * A regex-driven D1 mock could not express `REPLACE()`, `instr()`, UNIQUE
 * constraint failures or batch rollback, so this runs the real SQL against the
 * real schema (tests/fixtures/email-cascade-schema.sql, dumped from D1).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolve } from 'node:path';
import { createD1FromMigration } from '../../mocks/d1-sqlite';
import { changeUserEmail, getUserEmailImpact } from '../../../src/handlers/admin/users';
import type { Env } from '../../../src/types';

const SCHEMA = resolve(__dirname, '../../fixtures/email-cascade-schema.sql');

const OLD = 'old@school.tw';
const NEW = 'new@school.tw';
const ADMIN = 'admin@school.tw';
const OTHER = 'other@school.tw';

let env: Env;
let db: ReturnType<typeof createD1FromMigration>;
let queued: unknown[];

interface ImpactBody {
  success: boolean;
  data: {
    walletBalance: number;
    totals: { wallet: number; permission: number; record: number; all: number };
    items: Array<{ key: string; label: string; category: string; count: number }>;
  };
}

interface ChangeBody {
  success: boolean;
  error?: { code: string; message: string };
  data: { oldEmail: string; newEmail: string; rewritten: Record<string, number>; totalRows: number };
}

function insertUser(email: string, userId: string, displayName: string) {
  db._raw.prepare(`
    INSERT INTO users (userId, password, userEmail, displayName, status, createdAt, updatedAt)
    VALUES (?, 'hash', ?, ?, 'active', 1000, 1000)
  `).run(userId, email, displayName);
}

/** FK parents the seeded rows point at */
function seedScaffolding() {
  const raw = db._raw;
  raw.prepare(`INSERT INTO projects (projectId, projectName, createdBy, createdTime, lastModified, createdAt, updatedAt)
               VALUES ('prj_1', '測試專案', 'usr_admin', 1000, 1000, 1000, 1000)`).run();
  raw.prepare(`INSERT INTO stages (stageId, projectId, stageName, stageOrder, createdTime)
               VALUES ('stg_1', 'prj_1', '第一階段', 1, 1000)`).run();
  raw.prepare(`INSERT INTO groups (groupId, projectId, groupName, createdBy, createdTime)
               VALUES ('grp_1', 'prj_1', '第一組', 'usr_admin', 1000)`).run();
  raw.prepare(`INSERT INTO globalgroups (globalGroupId, groupName, createdAt, updatedAt)
               VALUES ('ggrp_1', '一般使用者', 1000, 1000)`).run();
}

/**
 * Seed one row in every table the cascade touches, so a column dropped from
 * EMAIL_REFERENCES shows up as a count going down rather than as silence.
 */
function seedReferences(email: string) {
  const raw = db._raw;

  // Permissions & access
  raw.prepare(`INSERT INTO globalusergroups (globalUserGroupId, globalGroupId, userEmail, joinedAt, isActive)
               VALUES (?, 'ggrp_1', ?, 1000, 1)`).run(`gug_${email}`, email);
  raw.prepare(`INSERT INTO usergroups (membershipId, projectId, groupId, userEmail, role, joinTime, isActive)
               VALUES (?, 'prj_1', 'grp_1', ?, 'member', 1000, 1)`).run(`ug_${email}`, email);
  raw.prepare(`INSERT INTO projectviewers (projectId, userEmail, role, assignedBy, assignedAt, isActive)
               VALUES ('prj_1', ?, 'member', ?, 1000, 1)`).run(email, email);

  // Wallet - two rows so the balance is a sum, not a single value
  raw.prepare(`INSERT INTO transactions (transactionId, projectId, userEmail, transactionType, amount, timestamp)
               VALUES (?, 'prj_1', ?, 'reward', 400, 1000)`).run(`txn_a_${email}`, email);
  raw.prepare(`INSERT INTO transactions (transactionId, projectId, userEmail, transactionType, amount, timestamp)
               VALUES (?, 'prj_1', ?, 'penalty', -150, 2000)`).run(`txn_b_${email}`, email);

  // Submissions, including the two JSON shapes: array element and object key
  raw.prepare(`INSERT INTO submissions
                 (submissionId, projectId, stageId, groupId, contentMarkdown, actualAuthors,
                  participationProposal, submitTime, submitterEmail, withdrawnBy, createdAt)
               VALUES (?, 'prj_1', 'stg_1', 'grp_1', 'x', ?, ?, 1000, ?, ?, 1000)`)
    .run(`sub_${email}`, JSON.stringify([email]), JSON.stringify({ [email]: 0.7 }), email, email);

  // Ranking & voting
  raw.prepare(`INSERT INTO rankingproposals
                 (proposalId, projectId, stageId, groupId, proposerEmail, rankingData, createdTime, withdrawnBy)
               VALUES (?, 'prj_1', 'stg_1', 'grp_1', ?, '{}', 1000, ?)`).run(`prop_${email}`, email, email);
  raw.prepare(`INSERT INTO proposalvotes (voteId, projectId, proposalId, voterEmail, groupId, agree, timestamp)
               VALUES (?, 'prj_1', ?, ?, 'grp_1', 1, 1000)`).run(`pv_${email}`, `prop_${email}`, email);
  raw.prepare(`INSERT INTO submissionapprovalvotes
                 (voteId, projectId, submissionId, stageId, groupId, voterEmail, agree, createdTime)
               VALUES (?, 'prj_1', ?, 'stg_1', 'grp_1', ?, 1, 1000)`)
    .run(`sav_${email}`, `sub_${email}`, email);
  raw.prepare(`INSERT INTO commentrankingproposals
                 (proposalId, projectId, stageId, authorEmail, rankingData, createdTime)
               VALUES (?, 'prj_1', 'stg_1', ?, '{}', 1000)`).run(`crp_${email}`, email);
  raw.prepare(`INSERT INTO teachercommentrankings
                 (rankingId, stageId, projectId, teacherEmail, commentId, authorEmail, rank, createdTime)
               VALUES (?, 'stg_1', 'prj_1', ?, ?, ?, 1, 1000)`)
    .run(`tcr_${email}`, email, `cmt_${email}`, email);
  raw.prepare(`INSERT INTO teachersubmissionrankings
                 (teacherRankingId, stageId, projectId, teacherEmail, submissionId, groupId, rank, createdTime)
               VALUES (?, 'stg_1', 'prj_1', ?, ?, 'grp_1', 1, 1000)`)
    .run(`tsr_${email}`, email, `sub_${email}`);

  // Settlement, including the JSON member list and the per-member payout map
  raw.prepare(`INSERT INTO settlementhistory
                 (settlementId, projectId, stageId, settlementType, settlementTime, operatorEmail, reversedBy)
               VALUES (?, 'prj_1', 'stg_1', 'stage', 1000, ?, ?)`).run(`stl_${email}`, email, email);
  raw.prepare(`INSERT INTO commentsettlements
                 (settlementDetailId, projectId, settlementId, stageId, commentId, authorEmail)
               VALUES (?, 'prj_1', ?, 'stg_1', ?, ?)`)
    .run(`cst_${email}`, `stl_${email}`, `cmt_${email}`, email);
  raw.prepare(`INSERT INTO stagesettlements
                 (settlementDetailId, projectId, settlementId, stageId, groupId, memberEmails, memberPointsDistribution)
               VALUES (?, 'prj_1', ?, 'stg_1', 'grp_1', ?, ?)`)
    .run(`sst_${email}`, `stl_${email}`, JSON.stringify([email]), JSON.stringify({ [email]: 400 }));

  // Comments: authored, mentioned in the JSON list, and mentioned in the body
  raw.prepare(`INSERT INTO comments (commentId, projectId, stageId, authorEmail, content, mentionedUsers, createdTime)
               VALUES (?, 'prj_1', 'stg_1', ?, ?, ?, 1000)`)
    .run(`cmt_${email}`, email, `同意 @${email} 的看法`, JSON.stringify([email]));
  raw.prepare(`INSERT INTO reactions (reactionId, projectId, targetType, targetId, userEmail, reactionType, createdAt)
               VALUES (?, 'prj_1', 'comment', ?, ?, 'like', 1000)`)
    .run(`rct_${email}`, `cmt_${email}`, email);

  // Delivery & misc
  raw.prepare(`INSERT INTO notifications (notificationId, targetUserEmail, type, title, createdTime)
               VALUES (?, ?, 'system_announcement', 'hi', 1000)`).run(`ntf_${email}`, email);
  raw.prepare(`INSERT INTO aiservicecalls
                 (callId, projectId, userEmail, serviceType, providerId, providerName, model, status, createdAt)
               VALUES (?, 'prj_1', ?, 'ranking', 'p1', 'p', 'm', 'success', 1000)`)
    .run(`ai_${email}`, email);
  raw.prepare(`INSERT INTO two_factor_codes (codeId, userEmail, verificationCode, createdTime, expiresAt)
               VALUES (?, ?, '123456', 1000, 9999999999999)`).run(`tfc_${email}`, email);
  raw.prepare(`INSERT INTO announcements
                 (announcementId, title, content, startTime, endTime, type, createdBy, createdAt, updatedAt, isActive)
               VALUES (?, 't', 'c', 1000, 2000, 'info', ?, 1000, 1000, 1)`).run(`ann_${email}`, email);
}

/** Every column that should still be able to find the account after a rename */
function countLiveReferences(email: string): number {
  const raw = db._raw;
  const quoted = `"${email}"`;
  const plain: Array<[string, string]> = [
    ['globalusergroups', 'userEmail'], ['usergroups', 'userEmail'],
    ['projectviewers', 'userEmail'], ['projectviewers', 'assignedBy'],
    ['transactions', 'userEmail'],
    ['submissions', 'submitterEmail'], ['submissions', 'withdrawnBy'],
    ['rankingproposals', 'proposerEmail'], ['rankingproposals', 'withdrawnBy'],
    ['proposalvotes', 'voterEmail'], ['submissionapprovalvotes', 'voterEmail'],
    ['commentrankingproposals', 'authorEmail'],
    ['teachercommentrankings', 'teacherEmail'], ['teachercommentrankings', 'authorEmail'],
    ['teachersubmissionrankings', 'teacherEmail'],
    ['settlementhistory', 'operatorEmail'], ['settlementhistory', 'reversedBy'],
    ['commentsettlements', 'authorEmail'],
    ['comments', 'authorEmail'], ['reactions', 'userEmail'],
    ['notifications', 'targetUserEmail'], ['aiservicecalls', 'userEmail'],
    ['two_factor_codes', 'userEmail'], ['announcements', 'createdBy']
  ];
  const json: Array<[string, string]> = [
    ['submissions', 'actualAuthors'], ['submissions', 'participationProposal'],
    ['stagesettlements', 'memberEmails'], ['stagesettlements', 'memberPointsDistribution'],
    ['comments', 'mentionedUsers']
  ];

  let total = 0;
  for (const [table, column] of plain) {
    total += (db._raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
      .get(email) as { n: number }).n;
  }
  for (const [table, column] of json) {
    total += (raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE instr(${column}, ?) > 0`)
      .get(quoted) as { n: number }).n;
  }
  total += (raw.prepare('SELECT COUNT(*) AS n FROM comments WHERE instr(content, ?) > 0')
    .get(`@${email}`) as { n: number }).n;
  return total;
}

function walletBalance(email: string): number {
  return (db._raw.prepare('SELECT COALESCE(SUM(amount), 0) AS b FROM transactions WHERE userEmail = ?')
    .get(email) as { b: number }).b;
}

beforeEach(() => {
  db = createD1FromMigration(SCHEMA);
  queued = [];
  env = {
    DB: db,
    NOTIFICATION_QUEUE: { send: vi.fn(async (m: unknown) => { queued.push(m); }) }
  } as unknown as Env;

  insertUser(ADMIN, 'usr_admin', '管理員');
  insertUser(OLD, 'usr_target', '目標帳號');
  seedScaffolding();
  seedReferences(OLD);
});

describe('getUserEmailImpact', () => {
  it('counts wallet, permission and activity rows, and reports the ledger balance', async () => {
    const body = await (await getUserEmailImpact(env, OLD)).json() as ImpactBody;

    expect(body.success).toBe(true);
    // 2 ledger rows: +400 and -150
    expect(body.data.totals.wallet).toBe(2);
    expect(body.data.walletBalance).toBe(250);
    // globalusergroups + usergroups + projectviewers.userEmail + .assignedBy
    expect(body.data.totals.permission).toBe(4);
    expect(body.data.totals.record).toBeGreaterThan(0);
    expect(body.data.totals.all).toBe(
      body.data.totals.wallet + body.data.totals.permission + body.data.totals.record
    );
  });

  it('lists only references that actually have rows', async () => {
    const body = await (await getUserEmailImpact(env, OLD)).json() as ImpactBody;

    expect(body.data.items.every(item => item.count > 0)).toBe(true);
    expect(body.data.items.map(i => i.key)).toContain('transactions.userEmail');
    expect(body.data.items.map(i => i.key)).toContain('comments.content');
  });

  it('changes nothing', async () => {
    const before = countLiveReferences(OLD);
    await getUserEmailImpact(env, OLD);
    expect(countLiveReferences(OLD)).toBe(before);
  });

  it('rejects an unknown account', async () => {
    const body = await (await getUserEmailImpact(env, 'nobody@school.tw')).json() as ChangeBody;
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('USER_NOT_FOUND');
  });
});

describe('changeUserEmail', () => {
  it('rewrites exactly what the scan promised', async () => {
    const scan = await (await getUserEmailImpact(env, OLD)).json() as ImpactBody;
    const body = await (await changeUserEmail(env, ADMIN, OLD, NEW)).json() as ChangeBody;

    expect(body.success).toBe(true);
    // The scan does not count users.userEmail itself, the rewrite does
    expect(body.data.totalRows).toBe(scan.data.totals.all + 1);

    for (const item of scan.data.items) {
      expect(body.data.rewritten[item.key], `${item.key} 的改寫筆數與掃描不符`).toBe(item.count);
    }
  });

  it('carries the wallet balance over instead of orphaning it', async () => {
    expect(walletBalance(OLD)).toBe(250);

    await changeUserEmail(env, ADMIN, OLD, NEW);

    expect(walletBalance(NEW)).toBe(250);
    expect(walletBalance(OLD)).toBe(0);
  });

  it('leaves no live reference pointing at the old address', async () => {
    const before = countLiveReferences(OLD);
    expect(before).toBeGreaterThan(20);

    await changeUserEmail(env, ADMIN, OLD, NEW);

    expect(countLiveReferences(OLD)).toBe(0);
    expect(countLiveReferences(NEW)).toBe(before);
  });

  it('keeps JSON columns parseable, rewriting array elements and object keys', async () => {
    await changeUserEmail(env, ADMIN, OLD, NEW);

    const submission = db._raw.prepare(
      'SELECT actualAuthors, participationProposal FROM submissions WHERE submissionId = ?'
    ).get(`sub_${OLD}`) as { actualAuthors: string; participationProposal: string };

    expect(JSON.parse(submission.actualAuthors)).toEqual([NEW]);
    expect(JSON.parse(submission.participationProposal)).toEqual({ [NEW]: 0.7 });

    const settlement = db._raw.prepare(
      'SELECT memberEmails, memberPointsDistribution FROM stagesettlements WHERE settlementDetailId = ?'
    ).get(`sst_${OLD}`) as { memberEmails: string; memberPointsDistribution: string };

    expect(JSON.parse(settlement.memberEmails)).toEqual([NEW]);
    expect(JSON.parse(settlement.memberPointsDistribution)).toEqual({ [NEW]: 400 });
  });

  it('rewrites @mentions in comment bodies', async () => {
    await changeUserEmail(env, ADMIN, OLD, NEW);

    const comment = db._raw.prepare('SELECT content FROM comments WHERE commentId = ?')
      .get(`cmt_${OLD}`) as { content: string };

    expect(comment.content).toBe(`同意 @${NEW} 的看法`);
  });

  it('does not touch a longer address that merely starts with the old one', async () => {
    // @old@school.tw is a prefix of @old@school.tw.uk - a substring REPLACE()
    // would corrupt the second one
    const longer = `${OLD}.uk`;
    db._raw.prepare(`INSERT INTO comments (commentId, projectId, stageId, authorEmail, content, mentionedUsers, createdTime)
                     VALUES ('cmt_prefix', 'prj_1', 'stg_1', ?, ?, '[]', 1000)`)
      .run(OTHER, `找 @${longer} 確認`);

    await changeUserEmail(env, ADMIN, OLD, NEW);

    const comment = db._raw.prepare("SELECT content FROM comments WHERE commentId = 'cmt_prefix'")
      .get() as { content: string };
    expect(comment.content).toBe(`找 @${longer} 確認`);
  });

  it('leaves audit trails on the old address', async () => {
    db._raw.prepare(`INSERT INTO sys_logs (logId, level, functionName, userId, action, message, createdAt)
                     VALUES ('log_seed', 'info', 'f', 'usr_target', 'a', ?, 1000)`)
      .run(`sent to ${OLD}`);

    await changeUserEmail(env, ADMIN, OLD, NEW);

    const seeded = db._raw.prepare("SELECT message FROM sys_logs WHERE logId = 'log_seed'")
      .get() as { message: string };
    expect(seeded.message).toBe(`sent to ${OLD}`);
  });

  it('writes an audit entry recording both addresses', async () => {
    await changeUserEmail(env, ADMIN, OLD, NEW);

    const log = db._raw.prepare(
      "SELECT context FROM sys_logs WHERE action = 'user_email_changed_by_admin'"
    ).get() as { context: string } | undefined;

    expect(log, '沒有寫下稽核記錄').toBeTruthy();
    const context = JSON.parse(log!.context);
    expect(context.changes.userEmail).toEqual({ from: OLD, to: NEW });
  });

  it('notifies the account holder at the new address', async () => {
    await changeUserEmail(env, ADMIN, OLD, NEW);

    expect(queued).toHaveLength(1);
    const message = queued[0] as { data: { targetUserEmail: string } };
    expect(message.data.targetUserEmail).toBe(NEW);
  });

  it('normalises the new address to lowercase, like registration does', async () => {
    await changeUserEmail(env, ADMIN, OLD, '  MiXeD@School.TW  ');

    const user = db._raw.prepare("SELECT userEmail FROM users WHERE userId = 'usr_target'")
      .get() as { userEmail: string };
    expect(user.userEmail).toBe('mixed@school.tw');
  });

  it('refuses an address another account already owns', async () => {
    insertUser(OTHER, 'usr_other', '別人');

    const body = await (await changeUserEmail(env, ADMIN, OLD, OTHER)).json() as ChangeBody;

    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(countLiveReferences(OLD)).toBeGreaterThan(20);
  });

  it('refuses an address that differs only by capitalisation', async () => {
    insertUser(OTHER, 'usr_other', '別人');

    const body = await (await changeUserEmail(env, ADMIN, OLD, OTHER.toUpperCase())).json() as ChangeBody;

    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rolls everything back when a collision surfaces mid-batch', async () => {
    // A project-access row already sits on the target address without a matching
    // account, so projectviewers' UNIQUE(projectId, userEmail) fires during the
    // batch - past the uniqueness pre-check
    db._raw.prepare(`INSERT INTO projectviewers (projectId, userEmail, role, assignedBy, assignedAt, isActive)
                     VALUES ('prj_1', ?, 'member', ?, 1000, 1)`).run(NEW, ADMIN);

    const before = countLiveReferences(OLD);
    const body = await (await changeUserEmail(env, ADMIN, OLD, NEW)).json() as ChangeBody;

    expect(body.success).toBe(false);
    // Nothing moved: crucially the login email did not change while the data stayed
    const user = db._raw.prepare("SELECT userEmail FROM users WHERE userId = 'usr_target'")
      .get() as { userEmail: string };
    expect(user.userEmail).toBe(OLD);
    expect(countLiveReferences(OLD)).toBe(before);
    expect(walletBalance(OLD)).toBe(250);
  });

  it('refuses a no-op rename', async () => {
    const body = await (await changeUserEmail(env, ADMIN, OLD, OLD)).json() as ChangeBody;
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_INPUT');
  });

  it('leaves other accounts alone', async () => {
    insertUser(OTHER, 'usr_other', '別人');
    seedReferences(OTHER);
    const before = countLiveReferences(OTHER);

    await changeUserEmail(env, ADMIN, OLD, NEW);

    expect(countLiveReferences(OTHER)).toBe(before);
  });
});
