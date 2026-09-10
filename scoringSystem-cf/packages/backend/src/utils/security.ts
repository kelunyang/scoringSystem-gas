/**
 * @fileoverview Security utility functions
 * Shared security operations including deduplication and notifications
 */

import type { Env } from '../types';
import { queueSecurityAlertEmail } from '../queues/email-producer';
import { ALERT_SEVERITY, LOCK_TYPE } from '../config/security';
import { generateId, ID_PREFIXES } from './id-generator';
import { isUniqueConstraintViolation } from '../utils/response';
import type { Threat } from '../queues/login-events-consumer';

/**
 * Notification details for admin alerts
 */
export interface AdminNotificationDetails {
  userEmail: string;
  reason: string;
  lockType?: typeof LOCK_TYPE.TEMPORARY | typeof LOCK_TYPE.PERMANENT; // Optional for notify-only actions
  ipAddress: string;
  country: string;
  timestamp: number;
  severity: typeof ALERT_SEVERITY.CRITICAL | typeof ALERT_SEVERITY.HIGH | typeof ALERT_SEVERITY.MEDIUM;
  threats?: Threat[];
  lockUntil?: number;
  relatedLogsDetails?: Array<{  // 🔥 Add relatedLogsDetails parameter
    logId: string;
    timestamp: number;
    ipAddress: string;
    country: string;
    city: string | null;
    timezone: string;
    userAgent: string;
    reason: string;
    attemptCount: number;
  }>;
}

/**
 * Log a security action with deduplication
 * Uses UNIQUE constraint on (dedupKey, createdAt/60000) for atomic deduplication
 *
 * @param env - Cloudflare environment bindings
 * @param details - Security action details
 * @returns true if logged successfully, false if duplicate (UNIQUE constraint violation)
 */
export async function logSecurityAction(
  env: Env,
  details: {
    dedupKey: string;
    action: string;
    userId?: string;
    userEmail: string;
    details: string;
    severity: string;
  }
): Promise<boolean> {
  try {
    // Trust the UNIQUE constraint for atomic deduplication
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO sys_logs (
        logId, level, functionName, userId, action, message, context, createdAt, dedupKey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(ID_PREFIXES.LOG),
      details.severity.toLowerCase(), // level: info, warning, error, critical
      details.action,                  // functionName
      details.userEmail,               // userId (now using userEmail)
      details.action,                  // action
      details.details,                 // message
      JSON.stringify({                 // context
        userEmail: details.userEmail,
        dedupKey: details.dedupKey,
        severity: details.severity
      }),
      now,                             // createdAt
      details.dedupKey                 // dedupKey
    ).run();

    console.log(`[SECURITY] Logged action: ${details.action} for ${details.userEmail}`);
    return true;
  } catch (error) {
    // UNIQUE constraint violation = duplicate action (expected, not an error)
    if (isUniqueConstraintViolation(error)) {
      console.log(`[SECURITY] Duplicate action blocked: ${details.dedupKey}`);
      return false;
    }
    // All other errors should propagate
    throw error;
  }
}

/**
 * 失敗次數的起算時間。
 *
 * 帳號解鎖之後（管理員手動解鎖、或暫時鎖定到期自動解鎖），解鎖之前的失敗紀錄
 * 就不該再算進來，否則使用者剛被解鎖、再打錯一次密碼就會被同一批舊紀錄重新鎖住。
 *
 * 解鎖事件記在 sys_logs：管理員解鎖寫 `account_unlocked`、entityId 是 userEmail；
 * 到期自動解鎖寫 `account_auto_unlocked`、entityId 是 userId，所以兩種 ID 都要比對。
 * 若這兩處的 entityId 寫法改了，這裡會無聲失效（失敗次數變回跨解鎖累加）。
 *
 * @param db - D1 database instance
 * @param defaultWindowStart - 原本的計算窗起點（now - window）
 * @param identifiers - 該帳號在 log 中可能出現的 entityId（userEmail / userId）
 * @returns 起算時間：預設窗起點與最後一次解鎖時間取較晚者
 *
 * @example
 * const windowStart = await getFailureWindowStart(db, Date.now() - 24 * 60 * 60 * 1000, [userId, userEmail]);
 */
export async function getFailureWindowStart(
  db: D1Database,
  defaultWindowStart: number,
  identifiers: Array<string | null | undefined>
): Promise<number> {
  const ids = identifiers.filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    return defaultWindowStart;
  }

  try {
    const placeholders = ids.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT MAX(createdAt) as lastUnlockAt
         FROM sys_logs
         WHERE action IN ('account_unlocked', 'account_auto_unlocked')
           AND entityId IN (${placeholders})
           AND createdAt > ?`
      )
      .bind(...ids, defaultWindowStart)
      .first();

    const lastUnlockAt = (result?.lastUnlockAt as number | null) || 0;
    return Math.max(defaultWindowStart, lastUnlockAt);
  } catch (error) {
    // Fail-safe: 查不到解鎖紀錄就用原本的窗，寧可鎖太嚴也不要漏鎖
    console.error('Error resolving failure window start:', error);
    return defaultWindowStart;
  }
}

/**
 * Notify all admin users about a security event
 * Uses batched notifications for better performance
 *
 * DB errors propagate (fail-closed), Queue errors only log (fail-open)
 *
 * @param env - Cloudflare environment bindings
 * @param details - Notification details
 * @throws Database errors (critical failures)
 */
export async function notifyAdmins(
  env: Env,
  details: AdminNotificationDetails
): Promise<void> {
  // Get all admin users (DB error = propagate)
  const admins = await env.DB.prepare(`
    SELECT DISTINCT u.userId, u.userEmail
    FROM users u
    INNER JOIN globalusergroups gug ON gug.userEmail = u.userEmail
    INNER JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
    WHERE gug.isActive = 1
      AND gg.isActive = 1
      AND u.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM json_each(gg.globalPermissions)
        WHERE json_each.value = 'system_admin'
      )
  `).all<{ userId: string; userEmail: string }>();

  if (!admins.results || admins.results.length === 0) {
    console.warn('[SECURITY] No active admin users found for notification');
    return;
  }

  console.log(`[SECURITY] Notifying ${admins.results.length} admins about ${details.reason}`);

  // Queue notifications (failures only logged, not thrown)
  const notificationPromises = admins.results.map(async admin => {
    try {
      await queueSecurityAlertEmail(env, {
        adminEmail: admin.userEmail as string,
        targetUser: details.userEmail,
        alertType: details.lockType || 'security_alert',
        reason: details.reason,
        ipAddress: details.ipAddress,
        country: details.country,
        lockUntil: details.lockUntil,
        threats: details.threats,
        relatedLogsDetails: details.relatedLogsDetails,
      });
    } catch (queueError) {
      // Queue failures are NOT critical - log and continue
      console.error(`[SECURITY] Failed to queue notification for ${admin.userEmail}:`, queueError);
    }
  });

  await Promise.all(notificationPromises);

  console.log(`[SECURITY] Successfully queued ${admins.results.length} admin notifications`);
}

/**
 * Disable user account with database transaction
 * Uses D1 batch for atomic operations
 *
 * @param env - Cloudflare environment bindings
 * @param userId - User ID to disable
 * @param reason - Reason for disabling
 * @param lockUntil - Optional lock expiration timestamp (null = permanent)
 * @returns true if successful, throws on failure
 */
export async function disableUserAccount(
  env: Env,
  userId: string,
  reason: string,
  lockUntil: number | null = null
): Promise<void> {
  const now = Date.now();
  const lockType = lockUntil ? LOCK_TYPE.TEMPORARY : LOCK_TYPE.PERMANENT;

  // Query userEmail for logging
  const user = await env.DB.prepare('SELECT userEmail FROM users WHERE userId = ?').bind(userId).first();
  const userEmail = (user?.userEmail as string) || 'unknown';

  // Use D1 batch for atomic transaction
  const batch = [
    // Update user status.
    // Column names must match the users table: status / lockUntil / lockReason.
    // A permanent lock sets status='disabled', which is what authMiddleware and the
    // login handler check; a temporary lock leaves status alone and relies on lockUntil.
    // This mirrors the 2FA lockout path in handlers/auth/login.ts.
    env.DB.prepare(`
      UPDATE users
      SET status = ?,
          lockUntil = ?,
          lockReason = ?,
          updatedAt = ?
      WHERE userId = ?
    `).bind(
      lockType === LOCK_TYPE.PERMANENT ? 'disabled' : 'active',
      lockUntil,
      reason,
      now,
      userId
    ),

    // Log the action
    env.DB.prepare(`
      INSERT INTO sys_logs (
        logId, level, functionName, userId, action, message, context, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(ID_PREFIXES.LOG),
      'critical',
      'disableUserAccount',
      userEmail,
      `ACCOUNT_${lockType.toUpperCase()}_LOCK`,
      reason,
      JSON.stringify({ lockType, lockUntil }),
      now
    ),
  ];

  const results = await env.DB.batch(batch);

  // Check if all operations succeeded
  if (!results.every(r => r.success)) {
    throw new Error(`Failed to disable account ${userId}: Transaction failed`);
  }

  console.log(`[SECURITY] Account ${userId} disabled (${lockType}): ${reason}`);
}
