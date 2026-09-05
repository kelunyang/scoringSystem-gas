/**
 * @fileoverview Session revocation on password change.
 *
 * JWTs cannot be recalled, so `users.passwordChangedAt` acts as a cutoff:
 * every token issued before it is refused. `authMiddleware` already loads the
 * user row on every request, so the check costs nothing extra.
 */

/**
 * The value to store in `users.passwordChangedAt`.
 *
 * Truncated to whole seconds because a JWT's `iat` claim has second
 * resolution. Storing the raw millisecond reading would make a token minted in
 * the same second as the change look older than the cutoff, so a user changing
 * their own password would be logged out by the very token issued to replace
 * their session.
 *
 * @param now - Current time in milliseconds (injectable for tests)
 * @returns Millisecond timestamp aligned to a second boundary
 *
 * @example
 * passwordChangeCutoff(1788600000500) // 1788600000000
 */
export function passwordChangeCutoff(now: number = Date.now()): number {
  return Math.floor(now / 1000) * 1000;
}

/**
 * Whether a token predates the account's last password change.
 *
 * @param issuedAtSeconds - The token's `iat` claim, in seconds
 * @param passwordChangedAt - `users.passwordChangedAt`, in milliseconds; null
 *   for accounts whose password has not changed since the column was added
 * @returns true when the token must be refused
 *
 * @example
 * isTokenRevokedByPasswordChange(1788599999, 1788600000000) // true  — older
 * isTokenRevokedByPasswordChange(1788600000, 1788600000000) // false — same second
 */
export function isTokenRevokedByPasswordChange(
  issuedAtSeconds: number | undefined,
  passwordChangedAt: number | null | undefined
): boolean {
  if (!passwordChangedAt) return false;

  // A token with no `iat` cannot be shown to postdate the change. Refuse it
  // rather than letting a malformed token bypass the cutoff.
  if (typeof issuedAtSeconds !== 'number' || !Number.isFinite(issuedAtSeconds)) {
    return true;
  }

  return issuedAtSeconds * 1000 < passwordChangedAt;
}
