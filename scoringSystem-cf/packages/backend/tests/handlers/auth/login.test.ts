/**
 * Regression tests for the login security fixes (2026-09-05).
 *
 * This file used to test `authenticateUser()`, a single-step login function
 * that nothing in the application called. Every guarantee it was asserting —
 * the `lockUntil` check, the 3-strikes lockout, the timing-attack defence —
 * was therefore proven only on a path no user ever took, while the live flow
 * (`/auth/login-verify-password` → `/auth/login-verify-2fa`) had none of them.
 * A green suite on dead code is worse than no suite, so the tests now cover the
 * pieces the live flow actually depends on.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/utils/logging', () => ({
  logGlobalOperation: vi.fn(() => Promise.resolve()),
  logProjectOperation: vi.fn(() => Promise.resolve())
}))

import { assertAccountUsable } from '../../../src/handlers/auth/account-guard'
import { issuePreAuthToken, verifyPreAuthToken, PRE_AUTH_TTL_MS } from '../../../src/handlers/auth/pre-auth'
import { DUMMY_PASSWORD_HASH, burnPasswordTiming, verifyPassword } from '@repo/shared/utils/password'
import type { Env } from '../../../src/types'

const SECRET = 'test-jwt-secret-value-long-enough'

/** A minimal env whose DB records the UPDATEs the guard issues. */
function envWithSpy(): { env: Env; runs: unknown[][] } {
  const runs: unknown[][] = []
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => { runs.push([sql, ...args]); return { success: true } }
        })
      })
    }
  } as unknown as Env
  return { env, runs }
}

describe('assertAccountUsable — the lockUntil check that was never wired up', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lets an ordinary active account through', async () => {
    const { env } = envWithSpy()
    const refusal = await assertAccountUsable(env, {
      userId: 'usr_1', userEmail: 'a@example.com', status: 'active', lockUntil: null
    })
    expect(refusal).toBeNull()
  })

  test('refuses a disabled account', async () => {
    const { env } = envWithSpy()
    const refusal = await assertAccountUsable(env, {
      userId: 'usr_1', userEmail: 'a@example.com', status: 'disabled', lockUntil: null
    })
    expect(refusal?.code).toBe('USER_DISABLED')
    expect(refusal?.status).toBe(403)
  })

  test('refuses an account whose lock has not expired', async () => {
    const { env } = envWithSpy()
    const refusal = await assertAccountUsable(env, {
      userId: 'usr_1',
      userEmail: 'a@example.com',
      status: 'active',
      lockUntil: Date.now() + 15 * 60 * 1000
    })
    expect(refusal?.code).toBe('USER_LOCKED')
    expect(refusal?.message).toContain('分鐘')
  })

  test('clears an expired lock and lets the account in', async () => {
    const { env, runs } = envWithSpy()
    const refusal = await assertAccountUsable(env, {
      userId: 'usr_1',
      userEmail: 'a@example.com',
      status: 'active',
      lockUntil: Date.now() - 1000
    })
    expect(refusal).toBeNull()
    expect(runs.some(r => String(r[0]).includes('lockUntil = NULL'))).toBe(true)
  })

  test('a disabled account is refused even while also locked', async () => {
    const { env } = envWithSpy()
    const refusal = await assertAccountUsable(env, {
      userId: 'usr_1',
      userEmail: 'a@example.com',
      status: 'disabled',
      lockUntil: Date.now() + 60_000
    })
    expect(refusal?.code).toBe('USER_DISABLED')
  })
})

describe('pre-auth token — binds step 2 of login to the password check', () => {
  test('a freshly issued token verifies for its own account', async () => {
    const token = await issuePreAuthToken('a@example.com', SECRET)
    expect(await verifyPreAuthToken(token, 'a@example.com', SECRET)).toBe(true)
  })

  test('email comparison ignores case but not identity', async () => {
    const token = await issuePreAuthToken('A@Example.com', SECRET)
    expect(await verifyPreAuthToken(token, 'a@example.com', SECRET)).toBe(true)
    expect(await verifyPreAuthToken(token, 'b@example.com', SECRET)).toBe(false)
  })

  test('a missing token is refused — this is the bypass that existed', async () => {
    expect(await verifyPreAuthToken(undefined, 'a@example.com', SECRET)).toBe(false)
    expect(await verifyPreAuthToken('', 'a@example.com', SECRET)).toBe(false)
  })

  test('a token signed with another secret is refused', async () => {
    const token = await issuePreAuthToken('a@example.com', 'a-different-secret-entirely')
    expect(await verifyPreAuthToken(token, 'a@example.com', SECRET)).toBe(false)
  })

  test('garbage is refused rather than throwing', async () => {
    expect(await verifyPreAuthToken('not.a.jwt', 'a@example.com', SECRET)).toBe(false)
  })

  test('a session token cannot be replayed as a pre-auth token', async () => {
    // generateToken issues { userId, userEmail } with no `typ` claim.
    const { generateToken } = await import('../../../src/handlers/auth/jwt')
    const session = await generateToken('usr_1', 'a@example.com', SECRET)
    expect(await verifyPreAuthToken(session, 'a@example.com', SECRET)).toBe(false)
  })

  test('the lifetime matches the verification code window', () => {
    // storeVerificationCode gives a code 10 minutes. The proof must not die
    // first, or a resend hands out a code that cannot be submitted.
    expect(PRE_AUTH_TTL_MS).toBe(10 * 60 * 1000)
  })
})

describe('timing-attack dummy hash — the previous one did no work at all', () => {
  test('is in the PBKDF2 format verifyPassword actually processes', () => {
    expect(DUMMY_PASSWORD_HASH.startsWith('pbkdf2-sha256$')).toBe(true)
    expect(DUMMY_PASSWORD_HASH.split('$')).toHaveLength(4)
  })

  test('no password matches it', async () => {
    expect(await verifyPassword('anything', DUMMY_PASSWORD_HASH)).toBe(false)
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false)
  })

  test('actually runs PBKDF2 rather than bailing out early', async () => {
    // The point of the dummy is to spend the work. Asserting on elapsed time
    // makes the suite flaky under load, so assert on the thing that costs the
    // time: a PBKDF2 derivation with the full iteration count.
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits')

    try {
      await burnPasswordTiming('wrong password')

      expect(deriveBits).toHaveBeenCalledTimes(1)
      const params = deriveBits.mock.calls[0][0] as Pbkdf2Params
      expect(params.name).toBe('PBKDF2')
      expect(params.iterations).toBe(100000)
      expect(params.hash).toBe('SHA-256')
    } finally {
      deriveBits.mockRestore()
    }
  })

  test('the previous bcrypt-shaped dummy would have skipped the work entirely', async () => {
    // Regression guard for the actual bug: a bcrypt string has 5 `$`-separated
    // parts, so verifyPassword routed it to the legacy MD5 branch, which
    // rejects anything that is not exactly 2 parts — returning false without
    // hashing at all, in microseconds.
    const bcryptShaped = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits')

    try {
      expect(await verifyPassword('anything', bcryptShaped)).toBe(false)
      expect(deriveBits).not.toHaveBeenCalled()
    } finally {
      deriveBits.mockRestore()
    }
  })
})
