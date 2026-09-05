/**
 * Tests for revoking sessions on password change.
 *
 * The subtle part is the boundary. A JWT's `iat` claim has second resolution
 * while every timestamp in this schema is milliseconds, so a naive
 * `iat * 1000 < Date.now()` comparison refuses the very token issued to replace
 * the session — the user would be logged out by their own password change.
 */

import { describe, it, expect } from 'vitest'
import {
  passwordChangeCutoff,
  isTokenRevokedByPasswordChange
} from '../../src/utils/password-revocation'

/** Same instant a freshly signed token would record. */
const iatOf = (ms: number) => Math.floor(ms / 1000)

describe('passwordChangeCutoff', () => {
  it('aligns to a whole second so second-resolution iat can match it', () => {
    expect(passwordChangeCutoff(1788600000500)).toBe(1788600000000)
    expect(passwordChangeCutoff(1788600000999)).toBe(1788600000000)
    expect(passwordChangeCutoff(1788600000000)).toBe(1788600000000)
  })
})

describe('isTokenRevokedByPasswordChange', () => {
  it('leaves accounts alone that have never changed a password', () => {
    expect(isTokenRevokedByPasswordChange(1788600000, null)).toBe(false)
    expect(isTokenRevokedByPasswordChange(1788600000, undefined)).toBe(false)
    expect(isTokenRevokedByPasswordChange(1788600000, 0)).toBe(false)
  })

  it('revokes a token issued before the change', () => {
    const cutoff = passwordChangeCutoff(1788600000500)
    expect(isTokenRevokedByPasswordChange(iatOf(1788599999000), cutoff)).toBe(true)
    expect(isTokenRevokedByPasswordChange(iatOf(1788000000000), cutoff)).toBe(true)
  })

  it('keeps a token issued after the change', () => {
    const cutoff = passwordChangeCutoff(1788600000500)
    expect(isTokenRevokedByPasswordChange(iatOf(1788600001000), cutoff)).toBe(false)
  })

  it('keeps the replacement token minted in the same second as the change', () => {
    // The regression this whole design guards against: change password at
    // .500ms, immediately sign a new token whose iat floors to the same second.
    const changedAt = 1788600000500
    const cutoff = passwordChangeCutoff(changedAt)
    const replacementIat = iatOf(changedAt)

    expect(isTokenRevokedByPasswordChange(replacementIat, cutoff)).toBe(false)
  })

  it('refuses a token whose iat is missing or not a finite number', () => {
    // Fail closed: a token that cannot be shown to postdate the change must not
    // be allowed to bypass the cutoff. Infinity counts as malformed, not as a
    // token from the far future.
    const cutoff = passwordChangeCutoff(1788600000500)
    for (const iat of [undefined, NaN, Infinity, -Infinity]) {
      expect(isTokenRevokedByPasswordChange(iat, cutoff), `iat: ${iat}`).toBe(true)
    }
  })
})

describe('end to end: a real token against a real cutoff', () => {
  it('a token signed before the change is refused, one signed after is kept', async () => {
    const { generateToken, verifyToken } = await import('../../src/handlers/auth/jwt')
    const SECRET = 'test-secret-value-long-enough-for-hs256'

    const before = await generateToken('usr_1', 'a@example.invalid', SECRET)
    const beforePayload = await verifyToken(before, SECRET)

    // Password changes a full second later.
    const cutoff = passwordChangeCutoff((beforePayload.iat + 1) * 1000)

    expect(isTokenRevokedByPasswordChange(beforePayload.iat, cutoff)).toBe(true)

    // A token issued at or after the cutoff survives.
    expect(isTokenRevokedByPasswordChange(cutoff / 1000, cutoff)).toBe(false)
  })
})
