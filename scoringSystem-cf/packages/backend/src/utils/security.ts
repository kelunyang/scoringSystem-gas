/**
 * @fileoverview Security utility functions
 * Shared security operations including deduplication and notifications
 */

import type { Env } from '../types';
import { queueSecurityAlertEmail } from '../queues/email-producer';
import { ALERT_SEVERITY, LOCK_TYPE } from '../config/security';
import { generateId, ID_PREFIXES } from './id-generator';

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
  threats?: any[];
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
  } catch (error: any) {
    // UNIQUE constraint violation = duplicate action (expected, not an error)
    if (error?.message?.includes('UNIQUE constraint failed')) {
      console.log(`[SECURITY] Duplicate action blocked: ${details.dedupKey}`);
      return false;
    }
    // All other errors should propagate
    throw error;
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
    FROM Users u
    INNER JOIN global_user_groups gug ON u.userId = gug.userId
    INNER JOIN GlobalGroups gg ON gug.globalGroupId = gg.globalGroupId
    WHERE gg.globalPermissions LIKE '%system_admin%'
      AND u.userStatus = 'active'
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
    // Update user status
    env.DB.prepare(`
      UPDATE Users
      SET userStatus = ?,
          accountLockedUntil = ?,
          accountLockReason = ?,
          updatedAt = ?
      WHERE userId = ?
    `).bind('locked', lockUntil, reason, now, userId),

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
