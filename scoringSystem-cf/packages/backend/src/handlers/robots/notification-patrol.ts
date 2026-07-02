/**
 * @fileoverview Notification Patrol Robot
 * Scans for unread and unsent notifications, then sends email digests to users
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { logGlobalOperation } from '@utils/logging';
import { queueNotificationDigestEmail } from '@/queues/email-producer';

/**
 * Notification patrol robot configuration
 * Time window: notifications created within the last N hours
 */
const NOTIFICATION_TIME_WINDOW_HOURS = 12; // Default: last 12 hours
const EMAIL_BATCH_SIZE = 5; // Send 5 emails concurrently at a time
const MAX_NOTIFICATIONS_PER_BATCH = 100; // Process notifications in batches to avoid memory issues

/**
 * Robot configuration interface
 */
export interface NotificationPatrolConfig {
  enabled: boolean;
  notificationRobotInterval: number; // Days between robot executions
  aggregateNotifications: boolean; // Aggregate multiple notifications into one email
  maxNotificationsPerEmail: number; // Max notifications to include in one email
  timeWindowHours: number; // How far back to check for unsent notifications
}

/**
 * Default robot configuration
 */
const DEFAULT_CONFIG: NotificationPatrolConfig = {
  enabled: true,
  notificationRobotInterval: 1,
  aggregateNotifications: true,
  maxNotificationsPerEmail: 10,
  timeWindowHours: 12
};

/**
 * Get notification patrol configuration from KV
 */
export async function getNotificationPatrolConfig(env: Env): Promise<NotificationPatrolConfig> {
  try {
    if (env.CONFIG) {
      const kvConfig = await env.CONFIG.get('robot_config_notification_patrol', 'json');
      if (kvConfig) {
        return { ...DEFAULT_CONFIG, ...kvConfig as Partial<NotificationPatrolConfig> };
      }
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('[NotificationPatrol] Error getting config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Update notification patrol configuration in KV
 */
export async function updateNotificationPatrolConfig(
  env: Env,
  config: Partial<NotificationPatrolConfig>
): Promise<{ success: boolean; config: NotificationPatrolConfig }> {
  try {
    // Get current config and merge with updates
    const currentConfig = await getNotificationPatrolConfig(env);
    const updatedConfig = { ...currentConfig, ...config };

    // Validate config values - must be positive integers within range
    if (!Number.isInteger(updatedConfig.notificationRobotInterval) ||
        updatedConfig.notificationRobotInterval < 1 ||
        updatedConfig.notificationRobotInterval > 30) {
      throw new Error('notificationRobotInterval must be an integer between 1 and 30 days');
    }
    if (!Number.isInteger(updatedConfig.maxNotificationsPerEmail) ||
        updatedConfig.maxNotificationsPerEmail < 1 ||
        updatedConfig.maxNotificationsPerEmail > 50) {
      throw new Error('maxNotificationsPerEmail must be an integer between 1 and 50');
    }
    if (!Number.isInteger(updatedConfig.timeWindowHours) ||
        updatedConfig.timeWindowHours < 1 ||
        updatedConfig.timeWindowHours > 168) {
      throw new Error('timeWindowHours must be an integer between 1 and 168 hours (1 week)');
    }

    // Save to KV
    if (env.CONFIG) {
      await env.CONFIG.put('robot_config_notification_patrol', JSON.stringify(updatedConfig));
    }

    await logGlobalOperation(
      env,
      'system@robot',
      'UPDATE_CONFIG',
      'robot',
      'notification_patrol_config',
      { updatedFields: Object.keys(config), newConfig: updatedConfig },
      'info'
    );

    return { success: true, config: updatedConfig };
  } catch (error) {
    console.error('[NotificationPatrol] Error updating config:', error);
    throw error;
  }
}


/**
 * Wrapper for robot logging - uses centralized logging module
 * Robot operations use 'system@robot' as userEmail
 */
async function logToSysLogs(
  env: Env,
  level: 'info' | 'warning' | 'error' | 'critical',
  functionName: string,
  action: string,
  message: string,
  context?: any
): Promise<void> {
  await logGlobalOperation(
    env,
    'system@robot',
    action,
    'robot',
    'notification_patrol',
    { functionName, message, ...context },
    level
  );
}

/**
 * Process notifications for a single user
 */
async function processUserNotifications(
  env: Env,
  userEmail: string,
  userNotifications: any[],
  dryRun: boolean,
  websocket?: WebSocket
): Promise<{ success: boolean; emailsSent: number; emailsFailed: number; notificationsProcessed: number; error?: string; notificationIds?: string[] }> {
  try {
    // Get user info
    const user = await env.DB.prepare(`
      SELECT displayName
      FROM users
      WHERE userEmail = ?
    `).bind(userEmail).first();

    const displayName = user ? (user as any).displayName : userEmail;

    if (!dryRun) {
      // Queue notification digest email
      const notifications = userNotifications.map((notif: any) => ({
        title: notif.title,
        content: notif.content,
        createdAt: notif.createdTime,
        type: notif.type
      }));

      const periodStart = Math.min(...userNotifications.map((n: any) => n.createdTime));
      const periodEnd = Math.max(...userNotifications.map((n: any) => n.createdTime));

      try {
        await queueNotificationDigestEmail(
          env,
          userEmail,
          displayName,
          notifications,
          userNotifications.length,
          periodStart,
          periodEnd
        );

        // Mark all notifications as emailSent
        const notificationIds = userNotifications.map((n: any) => n.notificationId);
        const emailSentTime = Date.now();
        await markNotificationsAsEmailSent(env, notificationIds);

        console.log(`[NotificationPatrol] Successfully queued email for ${userEmail} (${userNotifications.length} notifications)`);

        // Send WebSocket progress update for each notification
        if (websocket && websocket.readyState === WebSocket.READY_STATE_OPEN) {
          for (const notif of userNotifications) {
            try {
              websocket.send(JSON.stringify({
                type: 'notification_patrol_progress',
                data: {
                  notificationId: notif.notificationId,
                  emailSentTime,
                  targetUserEmail: userEmail,
                  success: true
                }
              }));
            } catch (wsError) {
              console.warn('[NotificationPatrol] WebSocket send failed:', wsError);
            }
          }
        }

        return {
          success: true,
          emailsSent: 1,
          emailsFailed: 0,
          notificationsProcessed: userNotifications.length,
          notificationIds
        };
      } catch (queueError) {
        // Email queueing failed
        const errorMsg = `Failed to queue email for ${userEmail}: ${queueError instanceof Error ? queueError.message : 'Unknown error'}`;
        console.error('[NotificationPatrol]', errorMsg);

        await logToSysLogs(
          env,
          'error',
          'processUserNotifications',
          'EMAIL_QUEUE_FAILED',
          errorMsg,
          { userEmail, notificationCount: userNotifications.length, error: errorMsg }
        );

        return {
          success: false,
          emailsSent: 0,
          emailsFailed: 1,
          notificationsProcessed: 0,
          error: errorMsg
        };
      }
    } else {
      // Dry run: just count
      return {
        success: true,
        emailsSent: 1,
        emailsFailed: 0,
        notificationsProcessed: userNotifications.length
      };
    }

  } catch (error) {
    const errorMsg = `Failed to process notifications for ${userEmail}: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[NotificationPatrol]', errorMsg);

    await logToSysLogs(
      env,
      'error',
      'processUserNotifications',
      'PROCESS_FAILED',
      errorMsg,
      { userEmail, error: error instanceof Error ? error.message : String(error) }
    );

    return {
      success: false,
      emailsSent: 0,
      emailsFailed: 1,
      notificationsProcessed: 0,
      error: errorMsg
    };
  }
}

/**
 * Execute notification patrol robot
 * Scans for notifications that are unread and not yet emailed, then sends digest emails
 * Supports WebSocket for real-time progress updates
 */
export async function executeNotificationPatrol(
  env: Env,
  options?: {
    timeWindowHours?: number;
    dryRun?: boolean; // If true, don't actually send emails or update database
    websocket?: WebSocket; // Optional WebSocket for real-time progress updates
    userId?: string; // User ID who triggered the execution
  }
): Promise<Response> {
  const startTime = Date.now();
  const websocket = options?.websocket;

  try {
    const timeWindowHours = options?.timeWindowHours || NOTIFICATION_TIME_WINDOW_HOURS;
    const dryRun = options?.dryRun || false;
    const now = Date.now();
    const timeWindowStart = now - (timeWindowHours * 60 * 60 * 1000);

    console.log('[NotificationPatrol] Starting patrol...');
    console.log('[NotificationPatrol] Time window:', timeWindowHours, 'hours');
    console.log('[NotificationPatrol] Dry run:', dryRun);

    await logToSysLogs(
      env,
      'info',
      'executeNotificationPatrol',
      'PATROL_START',
      `Starting notification patrol (timeWindow: ${timeWindowHours}h, dryRun: ${dryRun})`,
      { timeWindowHours, dryRun }
    );

    // Process notifications in batches with pagination to avoid memory issues
    let offset = 0;
    let hasMore = true;
    let totalNotificationsChecked = 0;
    const notificationsByUser = new Map<string, any[]>();

    console.log('[NotificationPatrol] Starting pagination query (batch size: ', MAX_NOTIFICATIONS_PER_BATCH, ')');

    while (hasMore) {
      // Query notifications in batches
      const notifications = await env.DB.prepare(`
        SELECT
          notificationId,
          targetUserEmail,
          type,
          title,
          content,
          projectId,
          createdTime
        FROM notifications
        WHERE isRead = 0
          AND emailSent = 0
          AND isDeleted = 0
          AND createdTime >= ?
        ORDER BY targetUserEmail, createdTime DESC
        LIMIT ? OFFSET ?
      `).bind(timeWindowStart, MAX_NOTIFICATIONS_PER_BATCH, offset).all();

      if (!notifications.results || notifications.results.length === 0) {
        hasMore = false;
        break;
      }

      const batchSize = notifications.results.length;
      totalNotificationsChecked += batchSize;
      console.log(`[NotificationPatrol] Fetched batch: ${batchSize} notifications (offset: ${offset})`);

      // Group notifications by user email
      for (const notification of notifications.results) {
        const email = (notification as any).targetUserEmail;
        if (!notificationsByUser.has(email)) {
          notificationsByUser.set(email, []);
        }
        notificationsByUser.get(email)!.push(notification);
      }

      // Check if there are more results
      if (batchSize < MAX_NOTIFICATIONS_PER_BATCH) {
        hasMore = false;
      } else {
        offset += MAX_NOTIFICATIONS_PER_BATCH;
      }
    }

    if (totalNotificationsChecked === 0) {
      console.log('[NotificationPatrol] No notifications to send');
      await logToSysLogs(env, 'info', 'executeNotificationPatrol', 'NO_NOTIFICATIONS', 'No notifications to send');

      return successResponse({
        message: 'No notifications to send',
        notificationsChecked: 0,
        emailsSent: 0,
        dryRun
      });
    }

    console.log(`[NotificationPatrol] Total notifications loaded: ${totalNotificationsChecked}`);
    console.log('[NotificationPatrol] Grouped into', notificationsByUser.size, 'users');

    let emailsSent = 0;
    let emailsFailed = 0;
    let notificationsProcessed = 0;
    const errors: string[] = [];

    // Process users in batches with parallelization
    const userEntries = Array.from(notificationsByUser.entries());
    const totalBatches = Math.ceil(userEntries.length / EMAIL_BATCH_SIZE);

    console.log(`[NotificationPatrol] Processing ${userEntries.length} users in ${totalBatches} batches (${EMAIL_BATCH_SIZE} concurrent emails per batch)`);

    for (let i = 0; i < userEntries.length; i += EMAIL_BATCH_SIZE) {
      const batch = userEntries.slice(i, i + EMAIL_BATCH_SIZE);
      const batchNumber = Math.floor(i / EMAIL_BATCH_SIZE) + 1;

      console.log(`[NotificationPatrol] Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);

      // Process batch in parallel using Promise.allSettled
      const results = await Promise.allSettled(
        batch.map(([userEmail, notifications]) =>
          processUserNotifications(env, userEmail, notifications, dryRun, websocket)
        )
      );

      // Aggregate results
      results.forEach((result, index) => {
        const [userEmail] = batch[index];

        if (result.status === 'fulfilled') {
          const data = result.value;
          emailsSent += data.emailsSent;
          emailsFailed += data.emailsFailed;
          notificationsProcessed += data.notificationsProcessed;

          if (data.error) {
            errors.push(data.error);
          }
        } else {
          // Promise rejected (should be rare since we catch errors in processUserNotifications)
          emailsFailed++;
          const errorMsg = `Unexpected error processing ${userEmail}: ${result.reason}`;
          console.error('[NotificationPatrol]', errorMsg);
          errors.push(errorMsg);
        }
      });

      // Check if we should stop early (circuit breaker logic)
      const failureRate = emailsFailed / (emailsSent + emailsFailed);
      if (emailsFailed > 0 && failureRate > 0.5 && (emailsSent + emailsFailed) >= 10) {
        const stopMsg = `Stopping patrol early: ${Math.round(failureRate * 100)}% failure rate (${emailsFailed} failed, ${emailsSent} sent). SMTP may be down.`;
        console.warn('[NotificationPatrol]', stopMsg);
        errors.push(stopMsg);

        await logToSysLogs(
          env,
          'warning',
          'executeNotificationPatrol',
          'CIRCUIT_BREAKER',
          stopMsg,
          { emailsSent, emailsFailed, failureRate, remainingUsers: userEntries.length - i - batch.length }
        );

        break;
      }
    }

    const duration = Date.now() - startTime;
    const resultMessage = dryRun ? 'Dry run completed' : 'Notification patrol completed';

    console.log(`[NotificationPatrol] ${resultMessage} in ${duration}ms`);
    console.log(`[NotificationPatrol] Emails sent: ${emailsSent}, Failed: ${emailsFailed}`);

    // Send WebSocket completion message
    if (websocket && websocket.readyState === WebSocket.READY_STATE_OPEN) {
      try {
        websocket.send(JSON.stringify({
          type: 'notification_patrol_complete',
          data: {
            totalProcessed: notificationsProcessed,
            emailsSent,
            emailsFailed,
            duration,
            success: emailsFailed === 0
          }
        }));
      } catch (wsError) {
        console.warn('[NotificationPatrol] WebSocket completion send failed:', wsError);
      }
    }

    await logToSysLogs(
      env,
      emailsFailed > 0 ? 'warning' : 'info',
      'executeNotificationPatrol',
      'PATROL_COMPLETE',
      `${resultMessage}: ${emailsSent} sent, ${emailsFailed} failed`,
      {
        notificationsChecked: totalNotificationsChecked,
        notificationsProcessed,
        usersNotified: notificationsByUser.size,
        emailsSent,
        emailsFailed,
        duration,
        dryRun
      }
    );

    // Update KV cache with latest execution status
    if (!dryRun && env.CONFIG) {
      try {
        const statusData = {
          enabled: true,
          lastRun: now,
          lastRunDetails: {
            timestamp: now,
            message: resultMessage,
            emailsSent,
            emailsFailed,
            notificationsProcessed,
            duration,
            success: emailsFailed === 0
          },
          lastError: emailsFailed > 0 ? {
            timestamp: now,
            message: `${emailsFailed} emails failed to send`
          } : null,
          status: emailsFailed > 0 ? 'error' : 'idle'
        };
        await env.CONFIG.put('robot_status_notification_patrol', JSON.stringify(statusData));
      } catch (error) {
        console.error('[NotificationPatrol] Failed to update KV cache:', error);
      }
    }

    return successResponse({
      message: resultMessage,
      notificationsChecked: totalNotificationsChecked,
      notificationsProcessed,
      usersNotified: notificationsByUser.size,
      emailsSent,
      emailsFailed,
      errors: errors.length > 0 ? errors : undefined,
      dryRun,
      timeWindowHours,
      duration
    });

  } catch (error) {
    const errorMsg = `Failed to execute notification patrol: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[NotificationPatrol]', errorMsg, error);

    await logToSysLogs(
      env,
      'critical',
      'executeNotificationPatrol',
      'PATROL_CRITICAL_ERROR',
      errorMsg,
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
    );

    return errorResponse('PATROL_ERROR', errorMsg);
  }
}



/**
 * Mark notifications as email sent
 */
async function markNotificationsAsEmailSent(
  env: Env,
  notificationIds: string[]
): Promise<void> {
  const now = Date.now();

  // Update in batches of 100
  const batchSize = 100;
  for (let i = 0; i < notificationIds.length; i += batchSize) {
    const batch = notificationIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');

    await env.DB.prepare(`
      UPDATE notifications
      SET emailSent = 1, emailSentTime = ?
      WHERE notificationId IN (${placeholders})
    `).bind(now, ...batch).run();
  }
}
