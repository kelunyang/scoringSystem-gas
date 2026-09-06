// ============================================
// Notification Queue Consumer
// ============================================

import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { NotificationQueueMessageSchema } from './types';
import { generateId } from '../utils/id-generator';
import { logGlobalOperation } from '../utils/logging';

/**
 * Notification Queue Consumer
 * Processes notification messages from the NOTIFICATION_QUEUE
 *
 * Workflow:
 * 1. 寫入 notifications 表 (數據庫為 single source of truth)
 * 2. 通過 NotificationHub DO 廣播給在線用戶 (WebSocket real-time push)
 */
export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    console.log(`[Notification Consumer] Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      const messageId = message.id;
      const timestamp = message.timestamp.getTime();

      try {
        // Validate message schema
        const parsedMessage = NotificationQueueMessageSchema.parse(message.body);
        console.log(`[Notification Consumer] Processing ${parsedMessage.type} notification (message.id: ${messageId})`);

        // Process based on message type
        if (parsedMessage.type === 'single_notification') {
          await processSingleNotification(env, parsedMessage.data, messageId);
        } else if (parsedMessage.type === 'batch_notifications') {
          await processBatchNotifications(env, parsedMessage.data.notifications, messageId);
        }

        // ACK message
        message.ack();
        console.log(`[Notification Consumer] ✅ Message ${messageId} ACKed successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error(`[Notification Consumer] ❌ Error processing message ${messageId}:`, {
          error: errorMessage,
          stack: errorStack,
          messageBody: JSON.stringify(message.body).substring(0, 500),
          timestamp
        });

        // Typed error handling instead of string matching
        if (shouldRetryError(error)) {
          message.retry();
          console.log(`[Notification Consumer] 🔄 Message ${messageId} will be retried`);
        } else {
          // ACK on validation errors or non-retryable errors
          message.ack();
          console.log(`[Notification Consumer] ⚠️ Message ${messageId} ACKed despite error (non-retryable)`);
        }
      }
    }

    console.log(`[Notification Consumer] Batch processing complete`);
  },
};

/**
 * Determine if error should trigger retry
 */
function shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true; // Unknown errors should retry (at-least-once semantics)
  }

  // Validation errors - don't retry (bad data)
  if (error.name === 'ZodError') {
    return false;
  }

  // D1 database errors - retry
  if (error.message.includes('D1_ERROR') ||
      error.message.includes('database') ||
      error.message.includes('SQLITE')) {
    return true;
  }

  // Durable Object errors - retry
  if (error.message.includes('Durable Object')) {
    return true;
  }

  // Default: retry unknown errors (at-least-once delivery guarantee)
  return true;
}

/**
 * 處理單條通知
 */
async function processSingleNotification(
  env: Env,
  data: {
    targetUserEmail: string;
    notificationType: string;
    title: string;
    content?: string;
    projectId?: string;
    stageId?: string;
    commentId?: string;
    submissionId?: string;
    groupId?: string;
    transactionId?: string;
    settlementId?: string;
    rankingProposalId?: string;
    metadata?: Record<string, unknown>;
  },
  queueMessageId: string
): Promise<void> {
  const now = Date.now();

  // 🔥 FIX: Idempotency check BEFORE generating ID (deterministic key)
  const idempotencyKey = `notif_${queueMessageId}_${data.targetUserEmail}_${data.notificationType}`;
  const existing = await env.DB.prepare(`
    SELECT notificationId FROM notification_idempotency WHERE idempotencyKey = ?
  `).bind(idempotencyKey).first();

  if (existing) {
    console.log(`[Notification Consumer] ⏭️ Skipping duplicate message ${queueMessageId} (already created notification ${existing.notificationId})`);

    // Log duplicate detection to sys_logs
    await logGlobalOperation(
      env,
      'system',
      'queue_duplicate_detected',
      'notification_queue',
      queueMessageId,
      {
        queueMessageId,
        existingNotificationId: existing.notificationId,
        targetUserEmail: data.targetUserEmail,
        notificationType: data.notificationType,
        reason: 'Idempotency protection prevented duplicate notification creation'
      },
      { level: 'info' }
    ).catch(err => console.error('[Notification Consumer] Failed to log duplicate detection:', err));

    return;
  }

  // Validate user exists and is active (defense-in-depth)
  const user = await env.DB.prepare(`
    SELECT userEmail FROM users WHERE userEmail = ? AND status = 'active'
  `).bind(data.targetUserEmail).first();

  if (!user) {
    console.log(`[Notification Consumer] ⚠️ Skipping notification for invalid/inactive user: ${data.targetUserEmail}`);
    return;
  }

  // 🔥 FIX: Generate ID only AFTER passing idempotency check
  const notificationId = generateId('notif');

  // 🔥 FIX: Use atomic D1 batch for notification + idempotency insert
  const notificationInsert = env.DB.prepare(`
    INSERT INTO notifications (
      notificationId, targetUserEmail, type, title, content,
      projectId, stageId, commentId, submissionId, groupId,
      transactionId, settlementId, rankingProposalId,
      isRead, isDeleted, emailSent, metadata,
      createdTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notificationId,
    data.targetUserEmail,
    data.notificationType,
    data.title,
    data.content || null,
    data.projectId || null,
    data.stageId || null,
    data.commentId || null,
    data.submissionId || null,
    data.groupId || null,
    data.transactionId || null,
    data.settlementId || null,
    data.rankingProposalId || null,
    0, // isRead
    0, // isDeleted
    0, // emailSent
    data.metadata ? JSON.stringify(data.metadata) : null,
    now  // createdTime
  );

  const idempotencyInsert = env.DB.prepare(`
    INSERT INTO notification_idempotency (idempotencyKey, notificationId, queueMessageId, processedAt, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).bind(idempotencyKey, notificationId, queueMessageId, now, now);

  // Atomic batch insert
  await env.DB.batch([notificationInsert, idempotencyInsert]);

  console.log(`[Notification Consumer] Created notification ${notificationId} for ${data.targetUserEmail}`);

  // 2. 通過 NotificationHub DO 廣播給在線用戶 (使用 per-user DO instance)
  try {
    // Query userId from userEmail
    const targetUser = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ? AND status = 'active'
    `).bind(data.targetUserEmail).first();

    if (!targetUser) {
      console.warn(`[Notification Consumer] ⚠️ Cannot push notification: user not found or inactive for email ${data.targetUserEmail}`);
      return; // User doesn't exist or is inactive, skip WebSocket push
    }

    // Get user's NotificationHub Durable Object (per-user instance)
    const notificationHubId = env.NOTIFICATION_HUB.idFromName(targetUser.userId as string);
    const stub = env.NOTIFICATION_HUB.get(notificationHubId);

    // 通過 /broadcast 端點發送消息給 Durable Object
    await stub.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'notification',
        data: {
          title: data.title,
          message: data.content || '',
          type: 'info',
          timestamp: now,
          notificationId,
          userEmail: data.targetUserEmail,
          notificationType: data.notificationType,
          projectId: data.projectId,
          stageId: data.stageId,
          commentId: data.commentId,
          submissionId: data.submissionId,
          groupId: data.groupId,
          transactionId: data.transactionId,
          settlementId: data.settlementId,
          rankingProposalId: data.rankingProposalId,
          metadata: data.metadata,
        },
      })
    }));

    console.log(`[Notification Consumer] ✅ Broadcasted notification to user ${targetUser.userId}'s NotificationHub`);
  } catch (error) {
    // DO broadcast 失敗不影響通知創建 (用戶下次登入會通過 Ajax 拉取)
    console.error('[Notification Consumer] Failed to broadcast to DO:', error);
  }
}

/**
 * 處理批量通知
 */
async function processBatchNotifications(
  env: Env,
  notifications: Array<{
    targetUserEmail: string;
    notificationType: string;
    title: string;
    content?: string;
    projectId?: string;
    stageId?: string;
    commentId?: string;
    submissionId?: string;
    groupId?: string;
    transactionId?: string;
    settlementId?: string;
    rankingProposalId?: string;
    metadata?: Record<string, unknown>;
  }>,
  queueMessageId: string
): Promise<void> {
  console.log(`[Notification Consumer] Processing batch of ${notifications.length} notifications (message.id: ${queueMessageId})`);

  // 🔥 FIX: Idempotency check using queueMessageId only (deterministic)
  const existingBatch = await env.DB.prepare(`
    SELECT notificationId FROM notification_idempotency WHERE queueMessageId = ?
  `).bind(queueMessageId).first();

  if (existingBatch) {
    console.log(`[Notification Consumer] ⏭️ Skipping duplicate batch message ${queueMessageId} (already processed)`);

    // Log duplicate batch detection to sys_logs
    await logGlobalOperation(
      env,
      'system',
      'queue_duplicate_detected',
      'notification_queue',
      queueMessageId,
      {
        queueMessageId,
        batchSize: notifications.length,
        reason: 'Idempotency protection prevented duplicate batch processing'
      },
      { level: 'info' }
    ).catch(err => console.error('[Notification Consumer] Failed to log duplicate detection:', err));

    return;
  }

  // Validate all target users exist and are active (defense-in-depth)
  const userEmails = Array.from(new Set(notifications.map(n => n.targetUserEmail)));
  const placeholders = userEmails.map(() => '?').join(',');
  const validUsersResult = await env.DB.prepare(`
    SELECT userEmail FROM users WHERE userEmail IN (${placeholders}) AND status = 'active'
  `).bind(...userEmails).all<{ userEmail: string }>();

  const validUserSet = new Set(validUsersResult.results?.map(r => r.userEmail) || []);
  const invalidCount = userEmails.length - validUserSet.size;

  if (invalidCount > 0) {
    const invalidUserEmails = userEmails.filter(e => !validUserSet.has(e));
    console.log(`[Notification Consumer] ⚠️ Filtered out ${invalidCount} invalid/inactive users`);

    // 🔥 NEW: Log filtered users to sys_logs
    await logGlobalOperation(
      env,
      'system',
      'queue_users_filtered',
      'notification_queue',
      queueMessageId,
      {
        queueMessageId,
        totalUsers: userEmails.length,
        invalidUsers: invalidCount,
        invalidUserEmails,
        validUsers: validUserSet.size,
        reason: 'Users inactive or not found in database'
      },
      { level: 'warning' }
    ).catch(err => console.error('[Notification Consumer] Failed to log filtered users:', err));
  }

  // Filter notifications for valid users only
  const validNotifications = notifications.filter(n => validUserSet.has(n.targetUserEmail));

  if (validNotifications.length === 0) {
    console.log(`[Notification Consumer] ⚠️ No valid users in batch, skipping`);
    return;
  }

  // 使用 D1 batch 操作提高性能
  const now = Date.now();

  // Generate notification records with IDs upfront (to ensure consistency)
  const notificationRecords = validNotifications.map(data => ({
    notificationId: generateId('notif'),
    userEmail: data.targetUserEmail,
    type: data.notificationType,
    title: data.title,
    content: data.content,
    projectId: data.projectId,
    stageId: data.stageId,
    commentId: data.commentId,
    submissionId: data.submissionId,
    groupId: data.groupId,
    transactionId: data.transactionId,
    settlementId: data.settlementId,
    rankingProposalId: data.rankingProposalId,
    metadata: data.metadata,
    isRead: false,
    isDeleted: false,
    emailSent: false,
    createdAt: now,
    updatedAt: now,
  }));

  // Prepare batch statements using pre-generated IDs
  const statements = notificationRecords.map(record =>
    env.DB.prepare(`
      INSERT INTO notifications (
        notificationId, targetUserEmail, type, title, content,
        projectId, stageId, commentId, submissionId, groupId,
        transactionId, settlementId, rankingProposalId,
        isRead, isDeleted, emailSent, metadata,
        createdTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.notificationId,
      record.userEmail,
      record.type,
      record.title,
      record.content || null,
      record.projectId || null,
      record.stageId || null,
      record.commentId || null,
      record.submissionId || null,
      record.groupId || null,
      record.transactionId || null,
      record.settlementId || null,
      record.rankingProposalId || null,
      0, // isRead
      0, // isDeleted
      0, // emailSent
      record.metadata ? JSON.stringify(record.metadata) : null,
      now  // createdTime
    )
  );

  // Add idempotency records for each notification
  const idempotencyStatements = notificationRecords.map(record =>
    env.DB.prepare(`
      INSERT INTO notification_idempotency (idempotencyKey, notificationId, queueMessageId, processedAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      `notif_${record.notificationId}_${queueMessageId}`,
      record.notificationId,
      queueMessageId,
      now,
      now
    )
  );

  // 🔥 FIX: D1 batch size limiting (max 100 statements per batch)
  const allStatements = [...statements, ...idempotencyStatements];
  const MAX_BATCH_SIZE = 100;

  if (allStatements.length <= MAX_BATCH_SIZE) {
    // Single batch
    await env.DB.batch(allStatements);
  } else {
    // Split into multiple batches
    console.log(`[Notification Consumer] Splitting ${allStatements.length} statements into chunks of ${MAX_BATCH_SIZE}`);
    for (let i = 0; i < allStatements.length; i += MAX_BATCH_SIZE) {
      const chunk = allStatements.slice(i, i + MAX_BATCH_SIZE);
      await env.DB.batch(chunk);
    }
  }

  console.log(`[Notification Consumer] Created ${validNotifications.length} notifications in database`);

  // 2. 通過 NotificationHub DO 廣播給在線用戶 (使用 per-user DO instances)
  // 注意：批量通知可能針對多個用戶，需要逐個用戶獲取其 DO 並廣播
  try {
    // 按用戶分組通知 (使用已生成的 notificationRecords)
    const notificationsByUser = new Map<string, typeof notificationRecords>();
    notificationRecords.forEach(record => {
      if (!notificationsByUser.has(record.userEmail)) {
        notificationsByUser.set(record.userEmail, []);
      }
      const userNotifs = notificationsByUser.get(record.userEmail);
      if (userNotifs) {
        userNotifs.push(record);
      }
    });

    // 逐個用戶廣播（每個用戶使用獨立的 NotificationHub DO）
    let successCount = 0;
    for (const [userEmail, userNotifications] of Array.from(notificationsByUser.entries())) {
      try {
        // Query userId from userEmail
        const targetUser = await env.DB.prepare(`
          SELECT userId FROM users WHERE userEmail = ? AND status = 'active'
        `).bind(userEmail).first();

        if (!targetUser) {
          console.warn(`[Notification Consumer] ⚠️ Cannot push notifications: user not found or inactive for email ${userEmail}`);
          continue; // Skip this user
        }

        // Get user's NotificationHub Durable Object (per-user instance)
        const notificationHubId = env.NOTIFICATION_HUB.idFromName(targetUser.userId as string);
        const stub = env.NOTIFICATION_HUB.get(notificationHubId);

        // Broadcast all notifications for this user
        for (const notification of userNotifications) {
          await stub.fetch(new Request('https://internal/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'notification',
              data: {
                title: notification.title,
                message: notification.content || '',
                type: 'info',
                timestamp: now,
                notificationId: notification.notificationId,
                userEmail: notification.userEmail,
                notificationType: notification.type,
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
            })
          }));
          successCount++;
        }

        console.log(`[Notification Consumer] ✅ Broadcasted ${userNotifications.length} notifications to user ${targetUser.userId}'s NotificationHub`);
      } catch (userError) {
        console.error(`[Notification Consumer] Failed to broadcast notifications for user ${userEmail}:`, userError);
        // Continue with other users even if one fails
      }
    }

    console.log(`[Notification Consumer] ✅ Broadcasted ${successCount}/${notifications.length} notifications to NotificationHub`);
  } catch (error) {
    // DO broadcast 失敗不影響通知創建
    console.error('[Notification Consumer] Failed to broadcast to DO:', error);
  }
}
