/**
 * Differential tests for the comment mention helpers.
 *
 * Each of `calculateReactionUsers` and `calculateReplyUsers` has a "batch"
 * twin written to avoid N+1 queries. Two implementations of the same rule is
 * exactly the shape that drifts: the single version runs on one code path, the
 * batch version on another, and a divergence shows up as students silently
 * getting different credit depending on which screen loaded their comment.
 *
 * These tests run both against the same real SQLite database and assert the
 * answers are identical, rather than asserting each against a hand-written
 * expectation that could be wrong in the same way twice.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../mocks/d1-sqlite'
import {
  calculateReactionUsers,
  batchCalculateReactionUsers,
  calculateReplyUsers,
  batchCalculateReplyUsers,
  type CommentForBatch
} from '../../src/utils/commentVotingUtils'

if (!hasNodeSqlite) {
  console.warn(`[skip] comment-voting.test.ts: ${NODE_SQLITE_SKIP_REASON}`)
}

const PROJECT = 'proj_1'

const SCHEMA = `
  CREATE TABLE users (
    userEmail TEXT PRIMARY KEY,
    displayName TEXT,
    avatarSeed TEXT,
    avatarStyle TEXT,
    avatarOptions TEXT
  );
  CREATE TABLE usergroups (
    membershipId TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    userEmail TEXT NOT NULL,
    role TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE projectviewers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    userEmail TEXT NOT NULL,
    role TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1
  );

  -- Three students in group g1, one in g2, one teacher who is also in a group,
  -- one inactive membership, and one user who belongs to no project at all.
  INSERT INTO users (userEmail, displayName) VALUES
    ('s1@example.invalid', '學生一'),
    ('s2@example.invalid', '學生二'),
    ('s3@example.invalid', '學生三'),
    ('t1@example.invalid', '教師一'),
    ('gone@example.invalid', '已停用'),
    ('outside@example.invalid', '不在專案');

  INSERT INTO usergroups (membershipId, projectId, groupId, userEmail, role, isActive) VALUES
    ('m1', 'proj_1', 'g1', 's1@example.invalid', 'leader', 1),
    ('m2', 'proj_1', 'g1', 's2@example.invalid', 'member', 1),
    ('m3', 'proj_1', 'g2', 's3@example.invalid', 'member', 1),
    ('m4', 'proj_1', 'g1', 't1@example.invalid', 'member', 1),
    ('m5', 'proj_1', 'g1', 'gone@example.invalid', 'member', 0);

  INSERT INTO projectviewers (projectId, userEmail, role, isActive) VALUES
    ('proj_1', 't1@example.invalid', 'teacher', 1);
`

/** The comment shapes both implementations are compared on. */
const CASES: CommentForBatch[] = [
  { commentId: 'c_users', authorEmail: 's1@example.invalid',
    mentionedUsers: JSON.stringify(['s2@example.invalid', 's3@example.invalid']), mentionedGroups: null },
  { commentId: 'c_self', authorEmail: 's1@example.invalid',
    mentionedUsers: JSON.stringify(['s1@example.invalid', 's2@example.invalid']), mentionedGroups: null },
  { commentId: 'c_teacher', authorEmail: 's1@example.invalid',
    mentionedUsers: JSON.stringify(['t1@example.invalid']), mentionedGroups: null },
  { commentId: 'c_inactive', authorEmail: 's1@example.invalid',
    mentionedUsers: JSON.stringify(['gone@example.invalid']), mentionedGroups: null },
  { commentId: 'c_outside', authorEmail: 's1@example.invalid',
    mentionedUsers: JSON.stringify(['outside@example.invalid']), mentionedGroups: null },
  { commentId: 'c_group', authorEmail: 's3@example.invalid',
    mentionedUsers: null, mentionedGroups: JSON.stringify(['g1']) },
  { commentId: 'c_group_self', authorEmail: 's1@example.invalid',
    mentionedUsers: null, mentionedGroups: JSON.stringify(['g1']) },
  { commentId: 'c_both', authorEmail: 's2@example.invalid',
    mentionedUsers: JSON.stringify(['s3@example.invalid']), mentionedGroups: JSON.stringify(['g1']) },
  { commentId: 'c_empty', authorEmail: 's1@example.invalid',
    mentionedUsers: null, mentionedGroups: null },
  { commentId: 'c_malformed', authorEmail: 's1@example.invalid',
    mentionedUsers: 'not json', mentionedGroups: '{{{' },
  { commentId: 'c_unknown_group', authorEmail: 's1@example.invalid',
    mentionedUsers: null, mentionedGroups: JSON.stringify(['no_such_group']) }
]

describe.skipIf(!hasNodeSqlite)('comment mention helpers', () => {
  let db: D1Database

  beforeEach(() => {
    db = createSqliteD1(SCHEMA)
  })

  it('reaction users: batch agrees with the single-comment version on every case', async () => {
    const batch = await batchCalculateReactionUsers(db, PROJECT, CASES)

    for (const c of CASES) {
      const single = await calculateReactionUsers(
        db, PROJECT, c.mentionedGroups, c.mentionedUsers, c.authorEmail
      )
      expect(
        [...(batch.get(c.commentId) ?? [])].sort(),
        `reactionUsers disagreed for ${c.commentId}`
      ).toEqual([...single].sort())
    }
  })

  it('reply users: batch agrees with the single-comment version on every case', async () => {
    const batch = await batchCalculateReplyUsers(db, PROJECT, CASES)

    for (const c of CASES) {
      const single = await calculateReplyUsers(db, PROJECT, c.mentionedGroups, c.mentionedUsers)
      const key = (xs: { userEmail: string }[]) => xs.map(x => x.userEmail).sort()
      expect(
        key(batch.get(c.commentId) ?? []),
        `replyUsers disagreed for ${c.commentId}`
      ).toEqual(key(single))
    }
  })

  describe('the rules reactionUsers is meant to enforce', () => {
    const react = (c: CommentForBatch) =>
      calculateReactionUsers(db, PROJECT, c.mentionedGroups, c.mentionedUsers, c.authorEmail)

    it('never lets an author react to their own comment', async () => {
      expect(await react(CASES.find(c => c.commentId === 'c_self')!))
        .not.toContain('s1@example.invalid')
      expect(await react(CASES.find(c => c.commentId === 'c_group_self')!))
        .not.toContain('s1@example.invalid')
    })

    it('excludes teachers even when they are in a mentioned group', async () => {
      expect(await react(CASES.find(c => c.commentId === 'c_teacher')!)).toEqual([])
      expect(await react(CASES.find(c => c.commentId === 'c_group')!))
        .not.toContain('t1@example.invalid')
    })

    it('excludes inactive memberships and non-participants', async () => {
      expect(await react(CASES.find(c => c.commentId === 'c_inactive')!)).toEqual([])
      expect(await react(CASES.find(c => c.commentId === 'c_outside')!)).toEqual([])
    })

    it('expands a mentioned group to its active students', async () => {
      expect((await react(CASES.find(c => c.commentId === 'c_group')!)).sort())
        .toEqual(['s1@example.invalid', 's2@example.invalid'])
    })

    it('returns nothing rather than throwing on malformed JSON', async () => {
      expect(await react(CASES.find(c => c.commentId === 'c_malformed')!)).toEqual([])
    })
  })

  describe('replyUsers 的作用範圍：讀取路徑依賴寫入路徑把關', () => {
    // calculateReplyUsers takes a projectId, but its mentionedUsers branch
    // queries `users` globally and never applies it. Mentioning any address in
    // the system therefore returns that person's display name and avatar.
    //
    // This is not currently reachable: createComment validates mentions through
    // validateMentionedUsers (handlers/comments/manage.ts:335), which requires
    // an active group membership in the project, and comments have no edit
    // path — mentionedUsers is only ever written at creation.
    //
    // The tests below pin that split so the coupling is written down: if the
    // write-side validation is ever removed or loosened, the read side will not
    // catch it, and these tests say exactly where to look.

    it('does not scope mentioned users by project — the write path must', async () => {
      const outsider = await calculateReplyUsers(
        db, PROJECT, null, JSON.stringify(['outside@example.invalid'])
      )
      expect(outsider.map(u => u.userEmail)).toEqual(['outside@example.invalid'])
    })

    it('does scope mentioned groups by project', async () => {
      await db.prepare(
        `INSERT INTO usergroups (membershipId, projectId, groupId, userEmail, role, isActive)
         VALUES ('mX', 'proj_OTHER', 'gOTHER', 's3@example.invalid', 'member', 1)`
      ).run()

      const other = await calculateReplyUsers(db, PROJECT, JSON.stringify(['gOTHER']), null)
      expect(other).toEqual([])
    })
  })
})
