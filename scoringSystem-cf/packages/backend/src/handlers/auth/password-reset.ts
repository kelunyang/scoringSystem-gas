/**
 * Password Reset Handler
 *
 * One step: the user types their email, and a new password is mailed to it.
 * Receiving that mail is the proof of identity.
 *
 * The new password does not replace the old one right away. It is parked in
 * `users.pendingPassword`, and login accepts either. The first login with the
 * pending one promotes it; a login with the old one discards it; otherwise it
 * expires after PENDING_PASSWORD_TTL_MS. This way anyone who knows a
 * classmate's email can still send them a reset mail, but cannot make their
 * current password stop working.
 *
 * Security features:
 * - Same response whether or not the account exists (no user enumeration)
 * - Password is hashed even for unknown accounts, so response time does not
 *   reveal existence either
 * - Turnstile and per-recipient / per-IP mail limits are applied by the router
 * - Promotion stamps passwordChangedAt, revoking every session issued before
 */

import { generateRandomPassword, hashPassword, verifyPassword } from './password';
import { logGlobalOperation } from '../../utils/logging';
import type { ApiResponse } from '../../utils/response';
import { validateEmail } from '../../utils/validation';
import { passwordChangeCutoff } from '../../utils/password-revocation';
import type { Env } from '../../types';
import { queuePasswordResetEmail } from '../../queues/email-producer';

/** How long a mailed password stays usable if nobody logs in with it. */
export const PENDING_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

const RESET_RESPONSE_MESSAGE = '如果這個電子郵件有註冊過，新密碼已寄到該信箱';

/**
 * Mail a new password to `userEmail`, parked as a pending password.
 *
 * Always answers with the same success message for well-formed addresses,
 * whether or not an account exists.
 *
 * @param env - Worker environment
 * @param userEmail - Address the user typed
 * @param ipAddress - Requester IP, quoted in the mail so the owner can tell if it was them
 * @param country - Requester country from Cloudflare, quoted in the mail
 * @returns Success response, or INVALID_EMAIL for a malformed address
 *
 * @example
 * const result = await requestPasswordReset(env, 'student@example.com', '1.2.3.4', 'TW');
 */
export async function requestPasswordReset(
  env: Env,
  userEmail: string,
  ipAddress?: string,
  country?: string
): Promise<ApiResponse> {
  if (!validateEmail(userEmail)) {
    return {
      success: false,
      error: {
        code: 'INVALID_EMAIL',
        message: '請輸入有效的電子郵件地址'
      }
    };
  }

  try {
    const user = await env.DB.prepare(`
      SELECT userId, displayName, userEmail
      FROM users
      WHERE userEmail = ? AND status = 'active'
    `).bind(userEmail).first<{ userId: string; displayName: string | null; userEmail: string }>();

    // Hash before knowing whether the account exists: PBKDF2 is the slow part
    // of this request, and skipping it for unknown addresses would make them
    // answer measurably faster.
    const passwordLength = 8 + Math.floor(Math.random() * 5); // 8 to 12
    const newPassword = generateRandomPassword(passwordLength);
    const hashedPassword = await hashPassword(newPassword);

    if (user) {
      // A second request replaces the first pending password; only the most
      // recent mail works.
      await env.DB.prepare(`
        UPDATE users
        SET pendingPassword = ?, pendingPasswordExpiresAt = ?
        WHERE userId = ?
      `).bind(hashedPassword, Date.now() + PENDING_PASSWORD_TTL_MS, user.userId).run();

      await queuePasswordResetEmail(
        env,
        user.userEmail,
        user.displayName || user.userEmail,
        newPassword,
        {
          pending: true,
          requestIp: ipAddress || 'unknown',
          requestCountry: country
        }
      );

      try {
        await logGlobalOperation(
          env,
          user.userEmail,
          'password_reset_requested',
          'user',
          user.userEmail,
          {
            userEmail: user.userEmail,
            ipAddress: ipAddress || 'unknown',
            country: country || 'unknown',
            expiresAt: Date.now() + PENDING_PASSWORD_TTL_MS
          },
          { level: 'info' }
        );
      } catch (logError) {
        console.error('[requestPasswordReset] Failed to log reset request:', logError);
      }
    }
  } catch (error) {
    // Swallow: a distinct error here would tell the caller the account exists.
    console.error('[requestPasswordReset] Error:', error);
  }

  return {
    success: true,
    data: {},
    message: RESET_RESPONSE_MESSAGE
  };
}

/**
 * Reconcile a login attempt with the user's pending (mailed) password.
 *
 * Call after checking the regular password:
 * - Regular password matched → any pending password is discarded; the owner
 *   evidently still knows the old one.
 * - Regular password failed but the pending one matches and has not expired →
 *   it is promoted to the real password, every older session is revoked, and
 *   this returns true so the caller treats the login as a success.
 *
 * @param env - Worker environment
 * @param user - Row from `SELECT * FROM users`
 * @param password - Password the user typed
 * @param regularPasswordValid - Result of checking it against `users.password`
 * @returns Whether the login should be accepted
 *
 * @example
 * let ok = await verifyPassword(body.password, user.password as string);
 * ok = await resolvePendingPassword(c.env, user, body.password, ok);
 */
export async function resolvePendingPassword(
  env: Env,
  user: Record<string, unknown>,
  password: string,
  regularPasswordValid: boolean
): Promise<boolean> {
  const pendingHash = typeof user.pendingPassword === 'string' ? user.pendingPassword : null;
  if (!pendingHash) return regularPasswordValid;

  if (regularPasswordValid) {
    await env.DB.prepare(`
      UPDATE users SET pendingPassword = NULL, pendingPasswordExpiresAt = NULL
      WHERE userId = ?
    `).bind(user.userId).run();
    return true;
  }

  const expiresAt = Number(user.pendingPasswordExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  if (!(await verifyPassword(password, pendingHash))) return false;

  // `AND pendingPassword = ?` keeps a reset requested a moment ago from being
  // overwritten by the promotion of the one it replaced.
  await env.DB.prepare(`
    UPDATE users
    SET password = pendingPassword,
        pendingPassword = NULL,
        pendingPasswordExpiresAt = NULL,
        passwordChangedAt = ?,
        updatedAt = ?
    WHERE userId = ? AND pendingPassword = ?
  `).bind(passwordChangeCutoff(), Date.now(), user.userId, pendingHash).run();

  try {
    await logGlobalOperation(
      env,
      String(user.userEmail),
      'password_reset_completed',
      'user',
      String(user.userEmail),
      { userEmail: user.userEmail, verificationMethod: 'emailed_password_first_login' },
      { level: 'info' }
    );
  } catch (logError) {
    console.error('[resolvePendingPassword] Failed to log promotion:', logError);
  }

  return true;
}
