// ============================================
// Notification Queue Producer
// ============================================

import type { Env } from '../types';
import type { NotificationQueueMessage, NotificationData } from './types';

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

