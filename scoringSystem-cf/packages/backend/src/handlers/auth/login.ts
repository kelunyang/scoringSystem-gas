/**
 * @fileoverview Login-adjacent handlers: session validation, password change,
 * and the progressive failure lock shared by the password and 2FA steps.
 *
 * The old `authenticateUser()` single-step login lived here and was dead code —
 * nothing called it — which is why the lock and the `lockUntil` check it
 * contained never ran for real logins. The live flow is
 * `/auth/login-verify-password` → `/auth/login-verify-2fa` in `router/auth.ts`.
 */

import { verifyPassword } from './password';
import { passwordChangeCutoff } from '../../utils/password-revocation';
import { generateToken } from './jwt';
import { getConfigValue } from '../../utils/config';
import { errorResponse, successResponse, ERROR_CODES } from '../../utils/response';
import type { ApiResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { queueAccountLockedEmail } from '../../queues/email-producer';
import type { Env } from '../../types';
import { PASSWORD_SECURITY, TWO_FA_SECURITY } from '../../config/security';

// Note: Login configuration moved to ../../config/security.ts
// Use PASSWORD_SECURITY and TWO_FA_SECURITY constants

/**
 * Reset a user's login-failure streak after a successful sign-in.
 *
 * This used to `DELETE FROM sys_logs`, which destroyed the audit trail as a
 * side effect of ordinary business logic: every `login_failed` record for the
 * account vanished the moment the attacker (or the real user) got in. The
 * failure counters now bound their window by the most recent `login_success`
 * instead — see {@link countRecentFailures} — so nothing needs deleting and the
 * history survives.
 *
 * Kept as an explicit no-op rather than removed so the login flows still read
 * as "…and now the streak is cleared", which is where the reset conceptually
 * happens.
 *
 * @param _db - Unused; retained so call sites need no change
 * @param _userEmail - Unused
 */
export async function clearFailedAttempts(
  _db: D1Database,
  _userEmail: string
): Promise<void> {
  // Intentionally empty: the streak resets because countRecentFailures only
  // counts failures newer than the last successful login.
}

/**
 * Logout user (client-side only in JWT system)
 * This function is mainly for logging purposes
 *
 * @param env - Cloudflare environment bindings
 * @param userId - User ID
 * @param ipAddress - Client IP address
 * @returns Success response
 *
 * @example
 * const result = await logoutUser(env, 'usr_123', '1.2.3.4');
 */
export async function logoutUser(
  env: Env,
  userId: string,
  ipAddress: string | null = null
): Promise<ApiResponse> {
  try {
    const db = env.DB;

    // Get user email for logging
    const user = await db
      .prepare('SELECT userEmail FROM users WHERE userId = ?')
      .bind(userId)
      .first();

    if (!user) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      };
    }

    // Log logout event to sys_logs
    await logGlobalOperation(
      env,
      user.userEmail as string,
      'user_logout',
      'user',
      userId,
      {
        userId,
        ipAddress: ipAddress || 'unknown',
        timestamp: Date.now()
      },
      { level: 'info' }
    );

    return {
      success: true,
      data: { message: 'Logged out successfully' }
    };
  } catch (error) {
    console.error('Logout error:', error);
    return {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An error occurred during logout'
      }
    };
  }
}

/**
 * Validate session token and return user info
 * Also updates lastActivityTime for session extension
 *
 * @param db - D1 database instance
 * @param token - JWT token
 * @param jwtSecret - JWT secret
 * @returns ApiResponse with user info or error
 *
 * @example
 * const result = await validateSession(env.DB, token, env.JWT_SECRET);
 * if (result.success) {
 *   console.log('User:', result.data.user);
 * }
 */
export async function validateSession(
  db: D1Database,
  token: string,
  jwtSecret: string
) {
  try {
    const { verifyToken } = await import('./jwt');

    // Verify JWT token
    const payload = await verifyToken(token, jwtSecret);

    // Get current user status from database
    const user = await db
      .prepare('SELECT * FROM users WHERE userId = ?')
      .bind(payload.userId)
      .first();

    if (!user) {
      return errorResponse(
        ERROR_CODES.USER_NOT_FOUND,
        'User not found'
      );
    }

    if (user.status === 'disabled') {
      return errorResponse(
        ERROR_CODES.USER_DISABLED,
        'This account has been disabled'
      );
    }

    // Update lastActivityTime for session extension
    const now = Date.now();
    await db
      .prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
      .bind(now, user.userId)
      .run();

    // Get user's global permissions
    const { getUserGlobalPermissions } = await import('../../utils/permissions');
    const permissions = await getUserGlobalPermissions(db, user.userId as string);

    // Parse JSON fields
    const avatarOptions = parseJSON(user.avatarOptions as string, {
      backgroundColor: 'b6e3f4',
      clothesColor: '3c4858',
      skinColor: 'ae5d29'
    });

    // Return user info with permissions
    return successResponse({
      user: {
        userId: user.userId,
        userEmail: user.userEmail,
        displayName: user.displayName,
        status: user.status,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
        avatarOptions: avatarOptions,
        lastActivityTime: now,
        permissions: permissions
      }
    });
  } catch (error) {
    console.error('Session validation error:', error);
    return errorResponse(
      ERROR_CODES.INVALID_SESSION,
      'Invalid or expired session'
    );
  }
}

/**
 * Change user password
 *
 * @param env - Cloudflare environment bindings
 * @param userId - User ID
 * @param oldPassword - Current password
 * @param newPassword - New password
 * @param ipAddress - Client IP address
 * @returns ApiResponse with success or error
 *
 * @example
 * const result = await changePassword(env, 'usr_123', 'oldpass', 'newpass', '1.2.3.4');
 */
export async function changePassword(
  env: Env,
  userId: string,
  oldPassword: string,
  newPassword: string,
  ipAddress: string | null = null
): Promise<ApiResponse> {
  const db = env.DB;
  try {
    console.log('[changePassword] Starting password change for userId:', userId);

    const { hashPassword, validatePasswordStrength } = await import('./password');

    // Validate new password strength
    console.log('[changePassword] Validating new password strength...');
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      console.log('[changePassword] Password validation failed:', validation.errors);
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: validation.errors.join(', ')
        }
      };
    }

    // Get current user
    console.log('[changePassword] Fetching user from database...');
    const user = await db
      .prepare('SELECT userEmail, password FROM users WHERE userId = ?')
      .bind(userId)
      .first();

    if (!user) {
      console.log('[changePassword] User not found');
      return {
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      };
    }

    // Verify old password
    console.log('[changePassword] Verifying old password...');
    const isValid = await verifyPassword(
      oldPassword,
      user.password as string
    );

    if (!isValid) {
      console.log('[changePassword] Old password verification failed');
      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Current password is incorrect'
        }
      };
    }

    // Hash new password
    console.log('[changePassword] Hashing new password...');
    const hashedPassword = await hashPassword(newPassword);

    // Update password and stamp the revocation cutoff, so tokens issued before
    // this moment stop working. The caller is expected to swap in the fresh
    // token returned below, which keeps the current session alive while every
    // other one dies.
    console.log('[changePassword] Updating password in database...');
    const cutoff = passwordChangeCutoff();
    await db
      .prepare('UPDATE users SET password = ?, passwordChangedAt = ? WHERE userId = ?')
      .bind(hashedPassword, cutoff, userId)
      .run();

    // Log password change event to sys_logs
    console.log('[changePassword] Logging password change event...');
    const changeTimestamp = Date.now();
    await logGlobalOperation(
      env,
      user.userEmail as string,
      'password_changed',
      'user',
      userId,
      {
        userId,
        ipAddress: ipAddress || 'unknown',
        timestamp: changeTimestamp
      },
      { level: 'info' }
    );

    // Send notification about password change (WebSocket + Email)
    try {
      await queueSingleNotification(env, {
        targetUserEmail: user.userEmail as string,
        type: 'password_reset_success',
        title: '密碼已成功變更',
        content: `您的帳號密碼已於 ${new Date(changeTimestamp).toLocaleString('zh-TW')} 成功變更。變更 IP：${ipAddress || '未知'}。如果這不是您本人的操作，請立即聯絡管理員。`,
        metadata: {
          userId,
          ipAddress: ipAddress || 'unknown',
          timestamp: changeTimestamp
        }
      });

      // Send immediate email for critical security event
      // Note: Password is not available here, so we don't queue password reset email
      // The user already knows their new password since they just changed it
    } catch (notifError) {
      console.error('[changePassword] Failed to send password change notification:', notifError);
      // Don't block main operation if notification fails
    }

    // Hand back a token minted after the cutoff. Without it the caller's
    // current session dies on its next request — the user would be logged out
    // by their own password change, which is not what "change my password"
    // should do. Every *other* session still dies, which is the point.
    const sessionTimeout = await getConfigValue(env, 'SESSION_TIMEOUT', { parseAsInt: true });
    const newSessionId = await generateToken(
      userId,
      user.userEmail as string,
      env.JWT_SECRET,
      sessionTimeout
    );

    console.log('[changePassword] Password changed successfully');
    return {
      success: true,
      data: {
        message: 'Password changed successfully',
        sessionId: newSessionId
      }
    };
  } catch (error) {
    console.error('[changePassword] Error occurred:', error);
    return {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An error occurred while changing password'
      }
    };
  }
}

/** What a failure streak is being counted for. */
export type LoginFailureKind = 'password' | '2fa';

/**
 * Per-kind settings for the progressive lock.
 *
 * `pattern` is matched against `context.reason` in `sys_logs`, so every caller
 * must log a reason with the matching prefix or its failures are invisible to
 * the counter.
 */
const FAILURE_KINDS: Record<LoginFailureKind, {
  pattern: string;
  maxAttempts: number;
  label: string;
}> = {
  password: {
    pattern: 'password_%',
    maxAttempts: PASSWORD_SECURITY.MAX_PASSWORD_FAILURES,
    label: '密碼'
  },
  '2fa': {
    pattern: '2fa_%',
    maxAttempts: TWO_FA_SECURITY.MAX_2FA_FAILURES_PERMANENT,
    label: '2FA（雙因素認證）'
  }
};

/**
 * Count a user's failures of one kind since their last successful login.
 *
 * Bounding by the last `login_success` is what replaced the old
 * `DELETE FROM sys_logs`: the streak still resets on a good login, but the
 * audit records survive.
 *
 * @param db - D1 database
 * @param userId - Whose failures to count
 * @param pattern - SQL LIKE pattern for `context.reason`
 * @param windowStart - Ignore anything older than this timestamp
 * @returns Number of failures in the current streak
 */
async function countRecentFailures(
  db: D1Database,
  userId: string,
  pattern: string,
  windowStart: number
): Promise<number> {
  const row = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM sys_logs
      WHERE userId = ?
        AND action = 'login_failed'
        AND JSON_EXTRACT(context, '$.reason') LIKE ?
        AND createdAt > ?
        AND createdAt > COALESCE((
          SELECT MAX(createdAt) FROM sys_logs
          WHERE userId = ? AND action = 'login_success'
        ), 0)
    `)
    .bind(userId, pattern, windowStart, userId)
    .first();

  return (row?.count as number) || 0;
}

/**
 * Record a failed login of the given kind and apply progressive locking.
 *
 * Progression is per account, tracked in `users.lockCount`:
 * 1st lock 15 minutes, 2nd lock 1 hour, 3rd permanent disable.
 *
 * Fails open: if the bookkeeping throws, the caller is told not to lock, so a
 * logging outage cannot lock everybody out.
 *
 * @param env Environment bindings
 * @param userEmail User's email
 * @param userId User's ID
 * @param failureReason Reason string; must start with the kind's prefix
 *   (`password_` or `2fa_`) or the failure will not be counted
 * @param ipAddress IP address of the attempt
 * @param kind Which streak this failure belongs to
 * @returns Lock status and details
 */
async function checkFailureAndLock(
  env: Env,
  userEmail: string,
  userId: string,
  failureReason: string,
  ipAddress: string | null,
  kind: LoginFailureKind
): Promise<{
  shouldLock: boolean;
  lockType: 'temporary' | 'permanent' | null;
  lockDuration: number | null;
  lockCount: number;
}> {
  const db = env.DB;
  const { pattern, maxAttempts, label } = FAILURE_KINDS[kind];

  try {

    // Log the 2FA failure
    await logGlobalOperation(
      env,
      userEmail,
      'login_failed',
      'user',
      userId,
      {
        userEmail,
        userId,
        reason: failureReason,
        ipAddress: ipAddress || 'unknown',
        timestamp: Date.now()
      },
      { level: 'warning' }
    );

    // Count this kind's failures in the current streak (last 24 hours, and only
    // since the last successful login)
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const failureCount = await countRecentFailures(db, userId, pattern, twentyFourHoursAgo);

    // Check if threshold exceeded
    if (failureCount >= maxAttempts) {
      // Get user's current lockCount and displayName
      const user = await db
        .prepare('SELECT lockCount, userEmail, displayName FROM users WHERE userId = ?')
        .bind(userId)
        .first();

      const currentLockCount = (user?.lockCount as number) || 0;
      const displayName = (user?.displayName as string) || userEmail; // Fallback to email if no displayName

      // **FIX: Idempotent lockCount** - Only increment if not already locked
      let newLockCount: number;
      if (failureCount === maxAttempts) {
        // First time hitting threshold - increment
        newLockCount = currentLockCount + 1;
      } else {
        // Already exceeded threshold - use current lock count
        newLockCount = currentLockCount;
      }

      // Progressive locking logic (using centralized constants)
      let lockDuration: number | null = null;
      let lockType: 'temporary' | 'permanent' = 'temporary';
      let lockReason = '';

      if (newLockCount === 1) {
        // First lock: 15 minutes
        lockDuration = TWO_FA_SECURITY.TEMP_LOCK_DURATION_MS;
        lockReason = `${kind}_failures_first_lock`;
      } else if (newLockCount === 2) {
        // Second lock: 1 hour
        lockDuration = TWO_FA_SECURITY.EXTENDED_LOCK_DURATION_MS;
        lockReason = `${kind}_failures_second_lock`;
      } else {
        // Third lock: Permanent disable
        lockType = 'permanent';
        lockReason = `${kind}_failures_permanent_disable`;
      }

      const now = Date.now();

      if (lockType === 'permanent') {
        // Permanent disable
        await db
          .prepare(`
            UPDATE users
            SET status = 'disabled',
                lockUntil = NULL,
                lockReason = ?,
                lockCount = ?
            WHERE userId = ?
          `)
          .bind(lockReason, newLockCount, userId)
          .run();

        // Log permanent disable
        await logGlobalOperation(
          env,
          userEmail,
          'account_disabled',
          'user',
          userId,
          {
            reason: lockReason,
            failureCount,
            lockCount: newLockCount,
            ipAddress: ipAddress || 'unknown',
            timestamp: now
          },
          { level: 'error' }
        );

        // Send in-app notification (WebSocket)
        try {
          await queueSingleNotification(env, {
            targetUserEmail: userEmail,
            type: 'account_locked',
            title: '【重要安全警示】您的帳號已被永久停用',
            content: `由於您的帳號在短時間內多次${label}驗證失敗，系統偵測到異常登入嘗試。為了保護您的帳號安全，您的帳號已被永久停用。如果這不是您本人的操作，請立即聯絡系統管理員解除鎖定並進行安全檢查。`,
            metadata: {
              reason: lockReason,
              failureCount,
              lockCount: newLockCount,
              ipAddress: ipAddress || 'unknown',
              timestamp: now,
              permanent: true
            }
          });
          // Email already queued via sendAccountLockedEmail() below
        } catch (notifError) {
          console.error('[checkFailureAndLock] Failed to send permanent disable notification:', notifError);
          // Don't block main operation if notification fails
        }

        // Send email notification
        await sendAccountLockedEmail(env, userEmail, displayName, 'permanent', null, newLockCount, label);

        return {
          shouldLock: true,
          lockType: 'permanent',
          lockDuration: null,
          lockCount: newLockCount
        };
      } else {
        // Temporary lock
        const lockUntil = now + (lockDuration || 0);

        await db
          .prepare(`
            UPDATE users
            SET lockUntil = ?,
                lockReason = ?,
                lockCount = ?
            WHERE userId = ?
          `)
          .bind(lockUntil, lockReason, newLockCount, userId)
          .run();

        // Log temporary lock
        await logGlobalOperation(
          env,
          userEmail,
          'account_temporarily_locked',
          'user',
          userId,
          {
            reason: lockReason,
            failureCount,
            lockCount: newLockCount,
            lockUntil,
            lockDurationMinutes: (lockDuration || 0) / 60000,
            ipAddress: ipAddress || 'unknown',
            timestamp: now
          },
          { level: 'warning' }
        );

        // Send in-app notification
        try {
          const durationMinutes = Math.ceil((lockDuration || 0) / 60000);
          const durationHours = Math.floor(durationMinutes / 60);
          const durationMins = durationMinutes % 60;
          let durationText = '';
          if (durationHours > 0) {
            durationText = `${durationHours} 小時 ${durationMins} 分鐘`;
          } else {
            durationText = `${durationMins} 分鐘`;
          }

          await queueSingleNotification(env, {
            targetUserEmail: userEmail,
            type: 'account_locked',
            title: '【安全警示】帳號已被暫時鎖定',
            content: `由於您的帳號在短時間內多次${label}驗證失敗，系統偵測到可疑登入嘗試。為了保護您的帳號安全，帳號已被暫時鎖定 ${durationText}。系統將在鎖定時間到期後自動解鎖。`,
            metadata: {
              reason: lockReason,
              failureCount,
              lockCount: newLockCount,
              lockUntil,
              lockDurationMinutes: (lockDuration || 0) / 60000,
              ipAddress: ipAddress || 'unknown',
              timestamp: now
            }
          });
          // Email already queued via sendAccountLockedEmail() below
        } catch (notifError) {
          console.error('[checkFailureAndLock] Failed to send temporary lock notification:', notifError);
          // Don't block main operation if notification fails
        }

        // Send email notification
        await sendAccountLockedEmail(env, userEmail, displayName, 'temporary', lockDuration, newLockCount, label);

        return {
          shouldLock: true,
          lockType: 'temporary',
          lockDuration,
          lockCount: newLockCount
        };
      }
    }

    // No lock needed
    return {
      shouldLock: false,
      lockType: null,
      lockDuration: null,
      lockCount: 0
    };
  } catch (error) {
    console.error('[checkFailureAndLock] Error occurred:', error);
    // Don't throw - fail open for availability
    return {
      shouldLock: false,
      lockType: null,
      lockDuration: null,
      lockCount: 0
    };
  }
}

/**
 * Record a failed 2FA attempt and apply progressive locking.
 *
 * @param failureReason Must start with `2fa_` to be counted
 *
 * @example
 * const lock = await check2FAFailureAndLock(env, email, userId, '2fa_totp_invalid', ip);
 * if (lock.shouldLock) { ... }
 */
export async function check2FAFailureAndLock(
  env: Env,
  userEmail: string,
  userId: string,
  failureReason: string,
  ipAddress: string | null = null
) {
  return checkFailureAndLock(env, userEmail, userId, failureReason, ipAddress, '2fa');
}

/**
 * Record a failed password attempt and apply progressive locking.
 *
 * The live login path had no failure lockout at all: the only implementation
 * hung off `authenticateUser()`, which nothing called. Password failures were
 * logged and queued for async analysis, but nothing stopped a fourth attempt.
 *
 * @param failureReason Must start with `password_` to be counted
 *
 * @example
 * const lock = await checkPasswordFailureAndLock(env, email, userId, 'password_invalid', ip);
 * if (lock.shouldLock) { ... }
 */
export async function checkPasswordFailureAndLock(
  env: Env,
  userEmail: string,
  userId: string,
  failureReason: string,
  ipAddress: string | null = null
) {
  return checkFailureAndLock(env, userEmail, userId, failureReason, ipAddress, 'password');
}

/**
 * Send account locked email notification via Email Queue
 * @param env Environment bindings
 * @param userEmail User's email
 * @param displayName User's display name
 * @param lockType Type of lock (temporary or permanent)
 * @param lockDuration Duration of lock in milliseconds (for temporary locks)
 * @param lockCount Number of times account has been locked
 */
async function sendAccountLockedEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  lockType: 'temporary' | 'permanent',
  lockDuration: number | null,
  lockCount: number,
  label: string = '2FA（雙因素認證）'
): Promise<void> {
  try {
    const reason = `${label}驗證失敗次數過多 (${lockCount} 次)`;
    const unlockTime = lockDuration ? Date.now() + lockDuration : undefined;

    // Queue the email for asynchronous processing
    await queueAccountLockedEmail(
      env,
      userEmail,
      displayName,
      reason,
      lockType,
      unlockTime
    );

    console.log(`[sendAccountLockedEmail] Email queued for ${userEmail} (${lockType})`);
  } catch (error) {
    console.error('[sendAccountLockedEmail] Failed to queue email:', error);
    // Don't throw - email failure shouldn't break the lock flow
  }
}

// Note: notifyAdmins() has been refactored to ../../utils/security.ts
// to eliminate code duplication between login.ts and login-events-consumer.ts
