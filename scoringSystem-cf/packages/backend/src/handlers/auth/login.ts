/**
 * @fileoverview User login handler with malicious attempt detection
 * Tracks failed login attempts and auto-disables accounts after threshold
 */

import { verifyPassword, hashPassword } from './password';
import { generateToken } from './jwt';
import { errorResponse, successResponse, ERROR_CODES } from '../../utils/response';
import type { ApiResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { sendEmail, EmailTrigger } from '../../services/email-service';
import { queueAccountLockedEmail, queuePasswordResetEmail } from '../../queues/email-producer';
import type { Env } from '../../types';
import { notifyAdmins, logSecurityAction, disableUserAccount } from '../../utils/security';
import { PASSWORD_SECURITY, TWO_FA_SECURITY, SECURITY_ACTION } from '../../config/security';

/**
 * Failed login attempt tracking
 */
interface FailedAttempt {
  userEmail: string;
  timestamp: number;
}

/**
 * Request context from Cloudflare
 */
export interface RequestContext {
  ipAddress: string;
  country: string;
  city: string | null;
  timezone: string;
  userAgent: string;
  requestPath: string;
}

// Note: Login configuration moved to ../../config/security.ts
// Use PASSWORD_SECURITY and TWO_FA_SECURITY constants

/**
 * Authenticate user with userEmail and password
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - User email
 * @param password - Plain text password
 * @param jwtSecret - JWT secret for token generation
 * @param requestContext - Request context from Cloudflare (IP, country, city, timezone, user agent, path)
 * @param sessionTimeout - Session timeout in milliseconds
 * @returns ApiResponse with session token or error
 *
 * @example
 * const result = await authenticateUser(env, 'john@example.com', 'password123', env.JWT_SECRET, { ipAddress: '1.2.3.4', country: 'US', ... }, 86400000);
 * if (result.success) {
 *   console.log('Token:', result.data.sessionId);
 * }
 */
export async function authenticateUser(
  env: Env,
  userEmail: string,
  password: string,
  jwtSecret: string,
  requestContext: RequestContext,
  sessionTimeout: number = 86400000
): Promise<ApiResponse> {
  const db = env.DB;
  try {
    // Validate inputs
    if (!userEmail || !password) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'Email and password are required'
        }
      };
    }

    // Get user from database
    const user = await db
      .prepare('SELECT * FROM users WHERE userEmail = ?')
      .bind(userEmail)
      .first();

    // **FIX: Timing attack prevention**
    // Always hash the password even if user doesn't exist
    // This prevents timing-based user enumeration
    const dummyHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // dummy bcrypt hash
    let isValidPassword = false;

    if (!user) {
      // User not found - perform dummy hash to prevent timing attack
      await verifyPassword(password, dummyHash);
      // Record failed attempt
      await recordFailedAttempt(env, userEmail, 'user_not_found', requestContext);
      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid email or password'
        }
      };
    } else {
      // Verify actual password
      isValidPassword = await verifyPassword(password, user.password as string);
    }

    // Check if user is permanently disabled
    if (user.status === 'disabled') {
      return {
        success: false,
        error: {
          code: ERROR_CODES.USER_DISABLED,
          message: 'This account has been disabled. Please contact an administrator.'
        }
      };
    }

    // Check temporary lock status
    const now = Date.now();
    const lockUntil = user.lockUntil as number | null;

    if (lockUntil) {
      if (lockUntil > now) {
        // Account is still locked
        const remainingMinutes = Math.ceil((lockUntil - now) / 60000);
        const remainingHours = Math.floor(remainingMinutes / 60);
        const remainingMins = remainingMinutes % 60;

        let timeMessage = '';
        if (remainingHours > 0) {
          timeMessage = `${remainingHours} 小時 ${remainingMins} 分鐘`;
        } else {
          timeMessage = `${remainingMins} 分鐘`;
        }

        return {
          success: false,
          error: {
            code: ERROR_CODES.USER_DISABLED,
            message: `Account temporarily locked due to security reasons. Please try again in ${timeMessage}.`
          }
        };
      } else {
        // Lock has expired - auto unlock
        await db
          .prepare('UPDATE users SET lockUntil = NULL, lockReason = NULL WHERE userId = ?')
          .bind(user.userId)
          .run();

        // Log the auto-unlock event
        await logGlobalOperation(
          env,
          userEmail,
          'account_auto_unlocked',
          'user',
          user.userId as string,
          {
            userEmail,
            lockExpiredAt: lockUntil,
            unlockedAt: now,
            ipAddress: requestContext.ipAddress,
            country: requestContext.country,
            city: requestContext.city,
            timezone: requestContext.timezone,
            userAgent: requestContext.userAgent,
            requestPath: requestContext.requestPath
          },
          { level: 'info' }
        );
      }
    }

    // Password verification already done above (timing attack fix)
    if (!isValidPassword) {
      // Invalid password - record failed attempt and check if should disable
      await recordFailedAttempt(env, userEmail, 'invalid_password', requestContext);
      const shouldDisable = await shouldDisableAccount(db, userEmail);

      if (shouldDisable) {
        const reason = '短時間內多次登入失敗（Layer 1: 3 次失敗）';
        const dedupKey = `${SECURITY_ACTION.PASSWORD_LOCK}:${userEmail}`;

        // 🔥 Query related failed login records for email notification
        const windowStart = now - PASSWORD_SECURITY.PASSWORD_FAILURE_WINDOW_MS;
        const recentFailedLogsResult = await db
          .prepare(`
            SELECT logId, createdAt, action, message, context
            FROM sys_logs
            WHERE action = 'login_failed'
              AND entityId = ?
              AND createdAt > ?
            ORDER BY createdAt DESC
            LIMIT 10
          `)
          .bind(userEmail, windowStart)
          .all();

        // Extract logId list and construct detailed log entries
        const relatedLogIds: string[] = [];
        const relatedLogsDetails: Array<{
          logId: string;
          timestamp: number;
          ipAddress: string;
          country: string;
          city: string | null;
          timezone: string;
          userAgent: string;
          reason: string;
          attemptCount: number;
        }> = [];

        (recentFailedLogsResult.results || []).forEach((log: any) => {
          relatedLogIds.push(log.logId as string);

          try {
            const context = JSON.parse(log.context as string || '{}');
            relatedLogsDetails.push({
              logId: log.logId as string,
              timestamp: log.createdAt as number,
              ipAddress: context.ipAddress || 'Unknown',
              country: context.country || 'Unknown',
              city: context.city || null,
              timezone: context.timezone || 'Unknown',
              userAgent: context.userAgent || 'Unknown',
              reason: context.reason || 'login_failed',
              attemptCount: context.attemptCount || 1
            });
          } catch (e) {
            console.error('[authenticateUser] Failed to parse log context:', e);
          }
        });

        // **FIX: Deduplication** - Prevent duplicate actions
        const isNewAction = await logSecurityAction(env, {
          dedupKey,
          action: 'password_lock',
          userId: user.userId as string,
          userEmail,
          details: reason,
          severity: 'critical'
        });

        if (isNewAction) {
          // This is a NEW action (not duplicate), execute it
          // **FIX: Database transaction** - Use atomic operation
          try {
            await disableUserAccount(env, user.userId as string, reason, null);
          } catch (error) {
            // **FIX: Fail-closed security** - Log and alert on critical failure
            console.error('[authenticateUser] CRITICAL: Failed to disable account:', error);
            await logGlobalOperation(
              env,
              'SYSTEM',
              'CRITICAL_SECURITY_FAILURE',
              'system',
              'security',
              { error: String(error), userEmail, reason },
              { level: 'error' }
            );
            // Re-throw to prevent login
            throw new Error('Critical security operation failed');
          }

          // Send notification to user about account disable (WebSocket + Email)
          try {
            await queueSingleNotification(env, {
              targetUserEmail: userEmail,
              type: 'account_locked',
              title: '【重要安全警示】帳號已被停用',
              content: `由於您的帳號在短時間內多次登入失敗，系統偵測到異常登入嘗試。為了保護您的帳號安全，帳號已被停用。請聯絡系統管理員以解除鎖定。`,
              metadata: {
                reason: 'multiple_failed_login_attempts',
                ipAddress: requestContext.ipAddress,
                country: requestContext.country,
                city: requestContext.city,
                timezone: requestContext.timezone,
                userAgent: requestContext.userAgent,
                requestPath: requestContext.requestPath,
                timestamp: now
              }
            });

            // Send immediate email for critical security event
            await queueAccountLockedEmail(
              env,
              userEmail,
              user.displayName as string || userEmail,
              reason,
              'permanent',
              undefined,
              relatedLogsDetails  // 🔥 Pass related logs to email
            );

            // Notify admins (Layer 1 also notifies admins for ≥Medium severity)
            await notifyAdmins(env, {
              userEmail,
              reason,
              lockType: 'permanent',
              ipAddress: requestContext.ipAddress,
              country: requestContext.country,
              timestamp: now,
              severity: 'critical',
              relatedLogsDetails  // 🔥 Pass related logs to admin email
            });
          } catch (notifError) {
            console.error('[authenticateUser] Failed to send account disabled notification:', notifError);
            // Notification failures are logged but don't throw
          }
        } else {
          console.log('[authenticateUser] Duplicate password lock action ignored for', userEmail);
        }

        return {
          success: false,
          error: {
            code: ERROR_CODES.USER_DISABLED,
            message: 'Account disabled due to multiple failed login attempts. Please contact an administrator.'
          }
        };
      }

      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid email or password'
        }
      };
    }

    // **FIX: Don't clear failed attempts here** - Only clear after 2FA success
    // This prevents bypassing Layer 1 protection by stopping after password verification

    // NOTE: This function is deprecated in two-factor auth flow
    // Failed attempts are now cleared in /login-verify-2fa after successful 2FA

    // Generate JWT token (for backward compatibility with single-step login)
    const token = await generateToken(
      user.userId as string,
      user.userEmail as string,
      jwtSecret,
      sessionTimeout
    );

    // Update last activity time (reuse now from line 100)
    await db
      .prepare(
        'UPDATE users SET lastActivityTime = ? WHERE userId = ?'
      )
      .bind(now, user.userId)
      .run();

    // Log successful login to sys_logs
    await logGlobalOperation(
      env,
      userEmail,
      'login_success',
      'user',
      user.userId as string,
      {
        userEmail,
        userId: user.userId,
        ipAddress: requestContext.ipAddress,
        country: requestContext.country,
        city: requestContext.city,
        timezone: requestContext.timezone,
        userAgent: requestContext.userAgent,
        requestPath: requestContext.requestPath,
        timestamp: now,
        sessionId: token.substring(0, 16) + '...' // Only log partial token for security
      },
      { level: 'info' }
    );

    // Get user's global permissions
    const { getUserGlobalPermissions } = await import('../../utils/permissions');
    const permissions = await getUserGlobalPermissions(db, user.userId as string);

    // Parse JSON fields
    const avatarOptions = parseJSON(user.avatarOptions as string, {
      backgroundColor: 'b6e3f4',
      clothesColor: '3c4858',
      skinColor: 'ae5d29'
    });

    // Return success with token and user info
    return {
      success: true,
      data: {
        sessionId: token,
        user: {
          userId: user.userId,
          userEmail: user.userEmail,
          displayName: user.displayName,
          avatarSeed: user.avatarSeed,
          avatarStyle: user.avatarStyle,
          avatarOptions: avatarOptions,
          permissions: permissions
        }
      }
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An error occurred during login'
      }
    };
  }
}

/**
 * Record a failed login attempt
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - User email that failed login
 * @param reason - Reason for failure (user_not_found, invalid_password, etc.)
 * @param requestContext - Request context from Cloudflare
 */
async function recordFailedAttempt(
  env: Env,
  userEmail: string,
  reason: string,
  requestContext: RequestContext
): Promise<void> {
  try {
    const now = Date.now();

    // Count recent failed attempts
    const db = env.DB;
    const windowStart = now - PASSWORD_SECURITY.PASSWORD_FAILURE_WINDOW_MS;
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM sys_logs
         WHERE action = ?
           AND entityId = ?
           AND createdAt > ?`
      )
      .bind('login_failed', userEmail, windowStart)
      .first();

    const attemptCount = ((result?.count as number) || 0) + 1;

    // Log failed login attempt to sys_logs with full context
    await logGlobalOperation(
      env,
      userEmail,
      'login_failed',
      'user',
      userEmail,
      {
        userEmail,
        reason,
        ipAddress: requestContext.ipAddress,
        country: requestContext.country,
        city: requestContext.city,
        timezone: requestContext.timezone,
        userAgent: requestContext.userAgent,
        requestPath: requestContext.requestPath,
        timestamp: now,
        attemptCount
      },
      { level: 'warning' }
    );
  } catch (error) {
    console.error('Error recording failed attempt:', error);
    // Don't throw - logging failure shouldn't block login flow
  }
}

/**
 * Check if account should be disabled based on failed attempts
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @returns true if account should be disabled
 */
async function shouldDisableAccount(
  db: D1Database,
  userEmail: string
): Promise<boolean> {
  try {
    const windowStart = Date.now() - PASSWORD_SECURITY.PASSWORD_FAILURE_WINDOW_MS;

    // Count failed attempts in the time window from sys_logs
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM sys_logs
         WHERE action = ?
           AND entityId = ?
           AND createdAt > ?`
      )
      .bind('login_failed', userEmail, windowStart)
      .first();

    const attemptCount = (result?.count as number) || 0;
    return attemptCount >= PASSWORD_SECURITY.MAX_PASSWORD_FAILURES;
  } catch (error) {
    console.error('Error checking failed attempts:', error);
    return false;
  }
}

/**
 * Clear failed login attempts for a user
 * Called after successful login (after 2FA, not just password)
 *
 * @param db - D1 database instance
 * @param userEmail - User email to clear attempts for
 */
export async function clearFailedAttempts(
  db: D1Database,
  userEmail: string
): Promise<void> {
  try {
    // **FIX: Add time filter** - Only delete recent failures to avoid full table scan
    const cutoffTime = Date.now() - PASSWORD_SECURITY.FAILED_ATTEMPTS_RETENTION_MS;

    await db
      .prepare(
        `DELETE FROM sys_logs
         WHERE action = ?
           AND entityId = ?
           AND createdAt > ?`
      )
      .bind('login_failed', userEmail, cutoffTime)
      .run();
  } catch (error) {
    console.error('Error clearing failed attempts:', error);
    // Don't throw - clearing failure shouldn't block login
  }
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
): Promise<Response> {
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

    // Update password
    console.log('[changePassword] Updating password in database...');
    await db
      .prepare('UPDATE users SET password = ? WHERE userId = ?')
      .bind(hashedPassword, userId)
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

    console.log('[changePassword] Password changed successfully');
    return {
      success: true,
      data: { message: 'Password changed successfully' }
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

/**
 * Check 2FA failure count and apply progressive account locking
 * @param env Environment bindings
 * @param userEmail User's email
 * @param userId User's ID
 * @param failureReason Reason for 2FA failure
 * @param ipAddress IP address of the attempt
 * @returns Object with lock status and details
 */
export async function check2FAFailureAndLock(
  env: Env,
  userEmail: string,
  userId: string,
  failureReason: string,
  ipAddress: string | null = null
): Promise<{
  shouldLock: boolean;
  lockType: 'temporary' | 'permanent' | null;
  lockDuration: number | null;
  lockCount: number;
}> {
  const db = env.DB;

  try {
    // Use centralized configuration
    const maxAttempts = TWO_FA_SECURITY.MAX_2FA_FAILURES_PERMANENT;

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

    // Count recent 2FA failures (last 24 hours)
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentFailures = await db
      .prepare(`
        SELECT COUNT(*) as count
        FROM sys_logs
        WHERE userId = ?
          AND action = 'login_failed'
          AND JSON_EXTRACT(context, '$.reason') LIKE '2fa_%'
          AND createdAt > ?
      `)
      .bind(userId, twentyFourHoursAgo)
      .first();

    const failureCount = (recentFailures?.count as number) || 0;

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
        lockReason = '2fa_failures_first_lock';
      } else if (newLockCount === 2) {
        // Second lock: 1 hour
        lockDuration = TWO_FA_SECURITY.EXTENDED_LOCK_DURATION_MS;
        lockReason = '2fa_failures_second_lock';
      } else {
        // Third lock: Permanent disable
        lockType = 'permanent';
        lockReason = '2fa_failures_permanent_disable';
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
            content: `由於您的帳號在短時間內多次 2FA（雙因素認證）驗證失敗，系統偵測到異常登入嘗試。為了保護您的帳號安全，您的帳號已被永久停用。如果這不是您本人的操作，請立即聯絡系統管理員解除鎖定並進行安全檢查。`,
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
          console.error('[check2FAFailureAndLock] Failed to send permanent disable notification:', notifError);
          // Don't block main operation if notification fails
        }

        // Send email notification
        await sendAccountLockedEmail(env, userEmail, displayName, 'permanent', null, newLockCount);

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
            content: `由於您的帳號在短時間內多次 2FA（雙因素認證）驗證失敗，系統偵測到可疑登入嘗試。為了保護您的帳號安全，帳號已被暫時鎖定 ${durationText}。系統將在鎖定時間到期後自動解鎖。`,
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
          console.error('[check2FAFailureAndLock] Failed to send temporary lock notification:', notifError);
          // Don't block main operation if notification fails
        }

        // Send email notification
        await sendAccountLockedEmail(env, userEmail, displayName, 'temporary', lockDuration, newLockCount);

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
    console.error('[check2FAFailureAndLock] Error occurred:', error);
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
  lockCount: number
): Promise<void> {
  try {
    const reason = `2FA 驗證失敗次數過多 (${lockCount} 次)`;
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
