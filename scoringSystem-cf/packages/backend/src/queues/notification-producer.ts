// ============================================
// Notification Queue Producer
// ============================================

import type { Env } from '../types';
import type { NotificationQueueMessage, NotificationData } from './types';

/**
 * Validate user emails exist in database
 * Returns only valid (existing, active) user emails
 */
async function validateUserEmails(env: Env, emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];

  try {
    // Query users table to check which emails exist
    const placeholders = emails.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT userEmail
      FROM users
      WHERE userEmail IN (${placeholders})
        AND isActive = 1
    `).bind(...emails).all();

    const validEmails = new Set(result.results?.map((row: any) => row.userEmail) || []);

    // Log invalid emails for debugging
    const invalidEmails = emails.filter(email => !validEmails.has(email));
    if (invalidEmails.length > 0) {
      console.log(`[Notification Queue] Filtered out ${invalidEmails.length} invalid/inactive user emails:`, invalidEmails);
    }

    return Array.from(validEmails);
  } catch (error) {
    console.error('[Notification Queue] Error validating user emails:', error);
    // On error, return empty array to avoid queuing notifications to non-existent users
    return [];
  }
}

/**
 * 推送單條通知到 Queue
 */
export async function queueSingleNotification(
  env: Env,
  notification: NotificationData
): Promise<void> {
  const message: NotificationQueueMessage = {
    type: 'single_notification',
    timestamp: Date.now(),
    data: {
      targetUserEmail: notification.targetUserEmail,
      notificationType: notification.type,
      title: notification.title,
      content: notification.content,
      projectId: notification.projectId,
      stageId: notification.stageId,
      commentId: notification.commentId,
      submissionId: notification.submissionId,
      groupId: notification.groupId,
      transactionId: notification.transactionId,
      settlementId: notification.settlementId,
      rankingProposalId: notification.rankingProposalId,
      metadata: notification.metadata,
    },
  };

  await env.NOTIFICATION_QUEUE.send(message);
  console.log(`[Notification Queue] Queued single notification for ${notification.targetUserEmail}: ${notification.type}`);
}

/**
 * 推送批量通知到 Queue (單條訊息包含多個通知)
 */
export async function queueBatchNotifications(
  env: Env,
  notifications: NotificationData[]
): Promise<void> {
  if (notifications.length === 0) {
    console.log('[Notification Queue] No notifications to queue');
    return;
  }

  const message: NotificationQueueMessage = {
    type: 'batch_notifications',
    timestamp: Date.now(),
    data: {
      notifications: notifications.map(notification => ({
        targetUserEmail: notification.targetUserEmail,
        notificationType: notification.type,
        title: notification.title,
        content: notification.content,
        projectId: notification.projectId,
        stageId: notification.stageId,
        commentId: notification.commentId,
        submissionId: notification.submissionId,
        groupId: notification.groupId,
        transactionId: notification.transactionId,
        settlementId: notification.settlementId,
        rankingProposalId: notification.rankingProposalId,
        metadata: notification.metadata,
      })),
    },
  };

  await env.NOTIFICATION_QUEUE.send(message);
  console.log(`[Notification Queue] Queued batch of ${notifications.length} notifications`);
}

// ============================================
// Convenience Functions for Common Scenarios
// ============================================

