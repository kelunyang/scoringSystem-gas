/**
 * @fileoverview Login events queue consumer (Layer 2 security defense)
 * Analyzes login patterns over 24 hours to detect sophisticated attacks
 *
 * This runs asynchronously (30s batch timeout) to perform deep security analysis
 * without blocking the login flow. Complements Layer 1 (immediate 3-failure check).
 */

import type { Env } from '../types';
import type { LoginEvent } from './login-events-producer';
import { queueSingleNotification } from './notification-producer';
import { queueAccountLockedEmail } from './email-producer';
import { logGlobalOperation } from '../utils/logging';
import { notifyAdmins, logSecurityAction, disableUserAccount } from '../utils/security';
import { THREAT_DETECTION, SECURITY_ACTION } from '../config/security';
import { generateId, ID_PREFIXES } from '../utils/id-generator';

/**
 * Threat detection result
 */
interface Threat {
  type: 'distributed_attack' | 'geo_anomaly' | 'device_anomaly';
  severity: 'critical' | 'high' | 'medium' | 'low';
  details: string;
  count: number;
}

/**
 * Security action to take
 */
interface SecurityAction {
  action: 'disable_permanent' | 'lock_temporary' | 'notify_only';
  lockDuration?: number; // milliseconds
  reason: string;
  threats: Threat[];
}

/**
 * Analyze login event for security threats
 *
 * @param env - Cloudflare environment
 * @param event - Current login event
 * @returns Security action to take (if any)
 */
async function analyzeLoginEvent(
  env: Env,
  event: LoginEvent
): Promise<SecurityAction | null> {
  try {
    const db = env.DB;
    const now = event.timestamp;
    const twentyFourHoursAgo = now - THREAT_DETECTION.ANALYSIS_WINDOW_MS;

    // Get recent login events for this user (last 24 hours)
    const recentEvents = await db
      .prepare(`
        SELECT
          action,
          JSON_EXTRACT(context, '$.ipAddress') as ipAddress,
          JSON_EXTRACT(context, '$.country') as country,
          JSON_EXTRACT(context, '$.city') as city,
          JSON_EXTRACT(context, '$.userAgent') as userAgent,
          JSON_EXTRACT(context, '$.reason') as reason,
          createdAt
        FROM sys_logs
        WHERE entityId = ?
          AND action IN ('login_success', 'login_failed')
          AND createdAt > ?
        ORDER BY createdAt DESC
        LIMIT 100
      `)
      .bind(event.userId || event.userEmail, twentyFourHoursAgo)
      .all();

    const recentLogins: LoginEvent[] = (recentEvents.results || []).map((row: any) => ({
      eventType: row.action === 'login_success' ? 'login_success' : 'login_failed',
      userEmail: event.userEmail,
      userId: event.userId,
      ipAddress: row.ipAddress || 'unknown',
      country: row.country || 'unknown',
      city: row.city || null,
      timezone: 'unknown',
      userAgent: row.userAgent || 'unknown',
      requestPath: '',
      timestamp: row.createdAt,
      reason: row.reason
    }));

    // Detect threats
    const threats = detectThreats(event, recentLogins);

    if (threats.length === 0) {
      return null; // No threats detected
    }

    // Determine security action based on highest severity
    const criticalThreats = threats.filter(t => t.severity === 'critical');
    const highThreats = threats.filter(t => t.severity === 'high');
    const mediumThreats = threats.filter(t => t.severity === 'medium');

    if (criticalThreats.length > 0) {
      // Critical: Permanent disable
      return {
        action: 'disable_permanent',
        reason: criticalThreats.map(t => t.details).join('; '),
        threats
      };
    } else if (highThreats.length > 0) {
      // High: Temporary lock (30 minutes)
      return {
        action: 'lock_temporary',
        lockDuration: 30 * 60 * 1000,
        reason: highThreats.map(t => t.details).join('; '),
        threats
      };
    } else if (mediumThreats.length > 0) {
      // Medium: Just notify (no lock)
      return {
        action: 'notify_only',
        reason: mediumThreats.map(t => t.details).join('; '),
        threats
      };
    }

    return null;
  } catch (error) {
    console.error('[analyzeLoginEvent] Error analyzing login event:', error);
    return null; // Fail open for availability
  }
}

/**
 * Detect security threats from login patterns
 *
 * @param event - Current login event
 * @param recent - Recent login events (last 24 hours)
 * @returns Array of detected threats
 */
function detectThreats(event: LoginEvent, recent: LoginEvent[]): Threat[] {
  const threats: Threat[] = [];

  // Critical: Distributed attack (≥3 different IPs with failed logins)
  const failedIPs = new Set(
    recent
      .filter(l => l.eventType === 'login_failed')
      .map(l => l.ipAddress)
  );

  // Add current event if it's a failure
  if (event.eventType === 'login_failed') {
    failedIPs.add(event.ipAddress);
  }

  if (failedIPs.size >= THREAT_DETECTION.DISTRIBUTED_ATTACK_THRESHOLD) {
    threats.push({
      type: 'distributed_attack',
      severity: 'critical',
      details: `檢測到 ${failedIPs.size} 個不同 IP 的登入失敗（分散式攻擊）`,
      count: failedIPs.size
    });
  }

  // Medium: Geo-location change (new country detected)
  // User requirement: "普通的更換地理位置，那就是medium給通知就好"
  if (event.eventType === 'login_success') {
    const successCountries = new Set(
      recent
        .filter(l => l.eventType === 'login_success')
        .map(l => l.country)
    );

    // Check if current country is new
    if (successCountries.size > 0 && !successCountries.has(event.country)) {
      threats.push({
        type: 'geo_anomaly',
        severity: 'medium',
        details: `檢測到從新國家登入：${event.country}（之前登入國家：${Array.from(successCountries).join(', ')}）`,
        count: 1
      });
    }
  }

  // Medium: Device change (new User-Agent detected)
  if (event.eventType === 'login_success') {
    const recentDevices = new Set(
      recent
        .filter(l => l.eventType === 'login_success')
        .map(l => l.userAgent)
    );

    // Check if current device is new
    if (recentDevices.size > 0 && !recentDevices.has(event.userAgent)) {
      // Extract browser/OS info for better UX
      const deviceInfo = extractDeviceInfo(event.userAgent);
      const prevDeviceInfo = Array.from(recentDevices).map(ua => extractDeviceInfo(ua));

      threats.push({
        type: 'device_anomaly',
        severity: 'medium',
        details: `檢測到新設備登入：${deviceInfo}（之前設備：${prevDeviceInfo.join(', ')}）`,
        count: 1
      });
    }
  }

  return threats;
}

/**
 * Extract simplified device info from User-Agent
 */
function extractDeviceInfo(userAgent: string): string {
  if (!userAgent || userAgent === 'unknown') {
    return '未知設備';
  }

  // Simplified browser detection
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';

  return '其他瀏覽器';
}

/**
 * Log entry detail for email notifications
 */
interface LogEntryDetail {
  logId: string;
  timestamp: number;
  ipAddress: string;
  country: string;
  city: string | null;
  timezone: string;
  userAgent: string;
  reason: string;
  attemptCount: number;
}

/**
 * Execute security action on user account
 */
async function executeSecurityAction(
  env: Env,
  event: LoginEvent,
  action: SecurityAction
): Promise<void> {
  const db = env.DB;
  const now = Date.now();

  // Get user details
  const user = await db
    .prepare('SELECT userId, userEmail, displayName FROM users WHERE userEmail = ?')
    .bind(event.userEmail)
    .first();

  if (!user) {
    console.error('[executeSecurityAction] User not found:', event.userEmail);
    return;
  }

  const userId = user.userId as string;
  const userEmail = user.userEmail as string;
  const displayName = (user.displayName as string) || userEmail;

  // 🔥 Query related failed login records for email notification
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const recentFailedLogsResult = await db
    .prepare(`
      SELECT logId, createdAt, action, message, context, userId
      FROM sys_logs
      WHERE entityId = ?
        AND action = 'login_failed'
        AND createdAt > ?
      ORDER BY createdAt DESC
      LIMIT 50
    `)
    .bind(userEmail, twentyFourHoursAgo)
    .all();

  // Extract logId list and construct detailed log entries
  const relatedLogIds: string[] = [];
  const relatedLogsDetails: LogEntryDetail[] = [];

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
      console.error('[executeSecurityAction] Failed to parse log context:', e);
    }
  });

  try {
    switch (action.action) {
      case 'disable_permanent': {
        const dedupKey = `${SECURITY_ACTION.DISTRIBUTED_ATTACK}:${userEmail}`;

        // **FIX: Deduplication** - Prevent duplicate actions from Layer 1/Layer 2 race
        const isNewAction = await logSecurityAction(env, {
          dedupKey,
          action: 'distributed_attack',
          userId,
          userEmail,
          details: action.reason,
          severity: 'critical'
        });

        if (!isNewAction) {
          console.log('[executeSecurityAction] Duplicate action skipped:', dedupKey);
          return; // Already processed by Layer 1
        }

        // **FIX: Database transaction** - Atomic disable operation
        try {
          await disableUserAccount(env, userId, action.reason, null);
        } catch (error) {
          // **FIX: Fail-closed** - Alert on critical security failure
          console.error('[executeSecurityAction] CRITICAL: Failed to disable account:', error);
          await logGlobalOperation(
            env,
            'SYSTEM',
            'CRITICAL_SECURITY_FAILURE',
            'system',
            'security',
            { error: String(error), userEmail, reason: action.reason },
            { level: 'error' }
          );
          throw error; // Re-throw to trigger retry
        }

        // Notify user (WebSocket + Email + Notifications)
        await queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'account_locked',
          title: '【重要安全警示】帳號已被永久停用',
          content: `由於系統偵測到異常登入模式，您的帳號已被永久停用。檢測原因：${action.reason}。如果這不是您本人的操作，請立即聯絡系統管理員。`,
          metadata: {
            reason: action.reason,
            threats: action.threats,
            ipAddress: event.ipAddress,
            country: event.country,
            timestamp: now,
            permanent: true
          }
        });

        await queueAccountLockedEmail(
          env,
          userEmail,
          displayName,
          action.reason,
          'permanent',
          undefined,
          relatedLogsDetails  // 🔥 Pass related logs to email
        );

        // Notify admins
        await notifyAdmins(env, {
          userEmail,
          reason: action.reason,
          lockType: 'permanent',
          ipAddress: event.ipAddress,
          country: event.country,
          timestamp: now,
          severity: 'critical',
          threats: action.threats,
          relatedLogsDetails  // 🔥 Pass related logs to admin email
        });

        break;
      }

      case 'lock_temporary': {
        const lockUntil = now + (action.lockDuration || 0);
        const dedupKey = `${SECURITY_ACTION.GEO_ANOMALY}:${userEmail}:${Math.floor(now / 60000)}`; // 1-min bucket

        // **FIX: Deduplication**
        const isNewAction = await logSecurityAction(env, {
          dedupKey,
          action: 'geo_anomaly',
          userId,
          userEmail,
          details: action.reason,
          severity: 'high'
        });

        if (!isNewAction) {
          console.log('[executeSecurityAction] Duplicate temp lock skipped:', dedupKey);
          return;
        }

        // **FIX: Database transaction**
        const batch = [
          db.prepare('UPDATE users SET lockUntil = ?, lockReason = ? WHERE userId = ?')
            .bind(lockUntil, action.reason, userId),
          db.prepare(`
            INSERT INTO sys_logs (logId, level, functionName, userId, action, message, context, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            generateId(ID_PREFIXES.LOG),
            'HIGH',
            'executeSecurityAction',
            userEmail,
            'account_temporarily_locked',
            action.reason,
            JSON.stringify({
              reason: action.reason,
              threats: action.threats,
              lockUntil,
              lockDurationMinutes: (action.lockDuration || 0) / 60000,
              ipAddress: event.ipAddress,
              country: event.country,
              timestamp: now,
              source: 'login_events_queue',
              relatedLogIds,  // 🔥 Store related log IDs
              relatedLogCount: relatedLogIds.length
            }),
            now
          )
        ];

        const results = await db.batch(batch);
        if (!results.every(r => r.success)) {
          throw new Error('Failed to lock account: Transaction failed');
        }

        const durationMinutes = Math.ceil((action.lockDuration || 0) / 60000);
        const durationHours = Math.floor(durationMinutes / 60);
        const durationMins = durationMinutes % 60;
        let durationText = '';
        if (durationHours > 0) {
          durationText = `${durationHours} 小時 ${durationMins} 分鐘`;
        } else {
          durationText = `${durationMins} 分鐘`;
        }

        // Notify user
        await queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'account_locked',
          title: '【安全警示】帳號已被暫時鎖定',
          content: `由於系統偵測到異常登入模式，您的帳號已被暫時鎖定 ${durationText}。檢測原因：${action.reason}。系統將在鎖定時間到期後自動解鎖。`,
          metadata: {
            reason: action.reason,
            threats: action.threats,
            lockUntil,
            lockDurationMinutes: (action.lockDuration || 0) / 60000,
            ipAddress: event.ipAddress,
            country: event.country,
            timestamp: now
          }
        });

        await queueAccountLockedEmail(
          env,
          userEmail,
          displayName,
          action.reason,
          'temporary',
          lockUntil,
          relatedLogsDetails  // 🔥 Pass related logs to email
        );

        // Notify admins
        await notifyAdmins(env, {
          userEmail,
          reason: action.reason,
          lockType: 'temporary',
          lockUntil,
          ipAddress: event.ipAddress,
          country: event.country,
          timestamp: now,
          severity: 'high',
          threats: action.threats,
          relatedLogsDetails  // 🔥 Pass related logs to admin email
        });

        break;
      }

      case 'notify_only': {
        // Just notify, no lock
        await logGlobalOperation(
          env,
          userEmail,
          'security_alert',
          'user',
          userId,
          {
            reason: action.reason,
            threats: action.threats,
            ipAddress: event.ipAddress,
            country: event.country,
            timestamp: now,
            source: 'login_events_queue',
            relatedLogIds,  // 🔥 Store related log IDs
            relatedLogCount: relatedLogIds.length
          },
          { level: 'info' }
        );

        // Notify user
        await queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'security_alert',
          title: '【安全提醒】偵測到異常登入模式',
          content: `系統偵測到您的帳號登入行為異常：${action.reason}。如果這是您本人的操作，請忽略此通知。否則，請立即變更密碼並聯絡管理員。`,
          metadata: {
            reason: action.reason,
            threats: action.threats,
            ipAddress: event.ipAddress,
            country: event.country,
            timestamp: now
          }
        });

        // Notify admins (Medium severity also gets email per user requirement)
        await notifyAdmins(env, {
          userEmail,
          reason: action.reason,
          // No lockType for notify-only actions
          ipAddress: event.ipAddress,
          country: event.country,
          timestamp: now,
          severity: 'medium',
          threats: action.threats,
          relatedLogsDetails  // 🔥 Pass related logs to admin email
        });

        break;
      }
    }
  } catch (error) {
    console.error('[executeSecurityAction] Error executing action:', error);
    throw error;
  }
}

// Note: notifyAdmins() has been refactored to ../utils/security.ts
// to eliminate code duplication between login.ts and login-events-consumer.ts

/**
 * Queue consumer handler
 * Processes batches of login events for security analysis
 */
export default {
  async queue(batch: MessageBatch<LoginEvent>, env: Env): Promise<void> {
    console.log(`[LOGIN_EVENTS_CONSUMER] Processing ${batch.messages.length} login events`);

    for (const message of batch.messages) {
      try {
        const event: LoginEvent = message.body;

        console.log(`[LOGIN_EVENTS_CONSUMER] Analyzing ${event.eventType} for ${event.userEmail}`);

        // Analyze event for threats
        const action = await analyzeLoginEvent(env, event);

        if (action) {
          console.log(`[LOGIN_EVENTS_CONSUMER] Threat detected for ${event.userEmail}:`, action.action);
          await executeSecurityAction(env, event, action);
          console.log(`[LOGIN_EVENTS_CONSUMER] Security action executed for ${event.userEmail}`);
        } else {
          console.log(`[LOGIN_EVENTS_CONSUMER] No threats detected for ${event.userEmail}`);
        }

        // Acknowledge message
        message.ack();
      } catch (error) {
        console.error('[LOGIN_EVENTS_CONSUMER] Error processing message:', error);
        console.error('[LOGIN_EVENTS_CONSUMER] Message body:', JSON.stringify(message.body, null, 2));

        // Retry message (don't ack)
        message.retry();
      }
    }

    console.log(`[LOGIN_EVENTS_CONSUMER] Batch processing complete`);
  }
};
