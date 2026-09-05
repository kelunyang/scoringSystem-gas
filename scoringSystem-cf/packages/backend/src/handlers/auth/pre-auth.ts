/**
 * @fileoverview Pre-authentication token: binds step 2 of login to step 1.
 *
 * Before this existed, `/auth/login-verify-2fa` accepted `{ userEmail, code }`
 * and never checked a password. The only trace step 1 left behind was a row in
 * `two_factor_codes`, and `/auth/resend-2fa` could create that row with no
 * password at all. Login was therefore single-factor: whoever held the mailbox
 * (or a TOTP code) could sign in without knowing the password.
 *
 * A pre-auth token is a short-lived JWT issued *only* after the password
 * verifies. Step 2 refuses to issue a session without it, so both factors are
 * now genuinely required.
 *
 * It is deliberately NOT a session token:
 * - `typ: 'pre_auth'` — `assertPreAuth` rejects anything else, so a real
 *   session token cannot be replayed here, and this token cannot be used as a
 *   session (authMiddleware reads `userId`, which this payload does not carry).
 * - Its lifetime matches the verification code's (10 minutes). Making it
 *   shorter than the code it guards was an inconsistency, not extra safety:
 *   a resend issued at minute 9 handed out a code good until minute 19 while
 *   the proof needed to submit that code died at minute 10, so the user was
 *   given a code they could not use.
 */

import { SignJWT, jwtVerify } from 'jose';

/**
 * How long a password proof stays good for.
 *
 * Deliberately equal to the verification code's lifetime
 * (`storeVerificationCode` uses 10 minutes) so the two expire together and a
 * user is never holding a live code with a dead proof.
 */
export const PRE_AUTH_TTL_MS = 10 * 60 * 1000;

/** Marks the token as a password proof rather than a session. */
const PRE_AUTH_TYPE = 'pre_auth';

/**
 * Issue a pre-auth token after a successful password check.
 *
 * @param userEmail - The account whose password was just verified
 * @param secret - JWT secret from environment
 * @returns Signed token the client must present to step 2
 *
 * @example
 * const preAuthToken = await issuePreAuthToken(user.userEmail, c.env.JWT_SECRET);
 */
export async function issuePreAuthToken(userEmail: string, secret: string): Promise<string> {
  const now = Date.now();
  const key = new TextEncoder().encode(secret);

  return await new SignJWT({ typ: PRE_AUTH_TYPE, userEmail })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + PRE_AUTH_TTL_MS) / 1000))
    .sign(key);
}

/**
 * Verify a pre-auth token and confirm it was issued for this account.
 *
 * The email is compared case-insensitively because the login form does not
 * normalise case, but it must match: a token minted for one account must never
 * unlock another.
 *
 * @param token - Token from the client, may be undefined
 * @param userEmail - Account step 2 is trying to sign in
 * @param secret - JWT secret from environment
 * @returns true only for a valid, unexpired, correctly-typed token for this account
 *
 * @example
 * if (!(await verifyPreAuthToken(body.preAuthToken, body.userEmail, c.env.JWT_SECRET))) {
 *   return c.json({ success: false, error: { code: 'PRE_AUTH_REQUIRED', ... } }, 401);
 * }
 */
export async function verifyPreAuthToken(
  token: string | undefined | null,
  userEmail: string,
  secret: string
): Promise<boolean> {
  if (!token) return false;

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });

    if (payload.typ !== PRE_AUTH_TYPE) return false;
    if (typeof payload.userEmail !== 'string') return false;

    return payload.userEmail.trim().toLowerCase() === userEmail.trim().toLowerCase();
  } catch {
    // Expired, wrong signature, malformed — all mean "no password proof".
    return false;
  }
}
