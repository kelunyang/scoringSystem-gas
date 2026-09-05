/**
 * Guard: an invitation code only works for the address it was issued to.
 *
 * `validateInvitationCode` in register.ts did not take an email at all, so
 * possession of a code was the whole check — a code mailed to one student let
 * anyone register, with any address.
 *
 * What hid it: `/invitations/verify`, the pre-check the registration form calls
 * first, *does* compare targetEmail. The browser flow therefore always matched,
 * and production data agrees (147 of 147 used codes match their target, the one
 * apparent exception being an account that later changed its email). The guard
 * was simply on the wrong door: anything calling `/auth/register` directly
 * walked past it.
 *
 * These tests exercise registerUser, the real boundary.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSqliteD1, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../../mocks/d1-sqlite'
import { registerUser } from '../../../src/handlers/auth/register'
import type { Env } from '../../../src/types'

vi.mock('../../../src/utils/logging', () => ({
  logGlobalOperation: vi.fn(() => Promise.resolve()),
  logProjectOperation: vi.fn(() => Promise.resolve())
}))

if (!hasNodeSqlite) {
  console.warn(`[skip] invitation-target-email.test.ts: ${NODE_SQLITE_SKIP_REASON}`)
}

const INVITED = 'invited@example.invalid'
const OUTSIDER = 'outsider@example.invalid'
const CODE = 'INVITE-CODE-1'

/**
 * Minimum schema for registration: users, the invitation table, and the status
 * VIEW the handler actually queries.
 */
const SCHEMA = `
  CREATE TABLE users (
    userId TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    userEmail TEXT NOT NULL UNIQUE,
    displayName TEXT,
    registrationTime INTEGER,
    lastActivityTime INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    preferences TEXT,
    avatarSeed TEXT, avatarStyle TEXT, avatarOptions TEXT,
    createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE invitation_codes (
    invitationId TEXT PRIMARY KEY,
    invitationCode TEXT NOT NULL,
    displayCode TEXT,
    targetEmail TEXT,
    createdBy TEXT,
    createdTime INTEGER NOT NULL,
    expiryTime INTEGER,
    status TEXT DEFAULT 'active',
    usedTime INTEGER,
    deactivatedTime INTEGER,
    defaultTags TEXT,
    defaultGlobalGroups TEXT,
    metadata TEXT,
    usedCount INTEGER DEFAULT 0
  );
  CREATE VIEW invitation_codes_with_status AS
  SELECT *,
    CASE
      WHEN deactivatedTime IS NOT NULL THEN 'deactivated'
      WHEN usedTime IS NOT NULL THEN 'used'
      WHEN expiryTime IS NOT NULL AND expiryTime < (strftime('%s','now') * 1000) THEN 'expired'
      ELSE 'active'
    END AS computedStatus
  FROM invitation_codes;

  -- Registration also writes group membership and tag rows.
  CREATE TABLE globalusergroups (
    membershipId TEXT PRIMARY KEY,
    globalGroupId TEXT NOT NULL,
    userEmail TEXT NOT NULL,
    joinTime INTEGER,
    isActive INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE user_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userEmail TEXT NOT NULL,
    tagId TEXT NOT NULL,
    assignedAt INTEGER
  );

  INSERT INTO invitation_codes
    (invitationId, invitationCode, targetEmail, createdBy, createdTime, expiryTime, status)
  VALUES
    ('inv_1', 'INVITE-CODE-1', 'invited@example.invalid', 'admin@example.invalid',
     1788000000000, 1999999999000, 'active');
`

describe.skipIf(!hasNodeSqlite)('registerUser honours the invitation target address', () => {
  let env: Env

  beforeEach(() => {
    env = { DB: createSqliteD1(SCHEMA), JWT_SECRET: 'test-secret-long-enough-for-hs256' } as unknown as Env
  })

  const register = (userEmail: string) =>
    registerUser(
      env,
      {
        userEmail,
        password: 'ValidPass123',
        displayName: '測試使用者',
        invitationCode: CODE
      } as Parameters<typeof registerUser>[1],
      'test-secret-long-enough-for-hs256'
    )

  it('lets the invited address register', async () => {
    const result = await register(INVITED)
    expect(result.success, JSON.stringify(result.error)).toBe(true)
  })

  it('refuses a different address holding the same code', async () => {
    const result = await register(OUTSIDER)
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('different email address')
  })

  it('compares case-insensitively — generation lowercases, the form does not', async () => {
    const result = await register('INVITED@Example.Invalid')
    expect(result.success, JSON.stringify(result.error)).toBe(true)
  })

  it('ignores surrounding whitespace on the submitted address', async () => {
    const result = await register('  invited@example.invalid  ')
    expect(result.success, JSON.stringify(result.error)).toBe(true)
  })

  it('leaves a code with no target address usable by anyone', async () => {
    // Older rows may predate the required targetEmail. Refusing them outright
    // would lock out anyone still holding one, so an absent target imposes no
    // restriction — only a *mismatched* one is refused.
    await env.DB.prepare(
      `UPDATE invitation_codes SET targetEmail = NULL WHERE invitationId = 'inv_1'`
    ).run()

    const result = await register(OUTSIDER)
    expect(result.success, JSON.stringify(result.error)).toBe(true)
  })
})
