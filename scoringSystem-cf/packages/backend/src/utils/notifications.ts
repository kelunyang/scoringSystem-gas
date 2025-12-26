/**
 * 集中式通知工具模組
 * 提供統一的通知創建接口
 */

import type { Env } from '@/types';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';

/**
 * 通知類型定義
 */
export type NotificationType =
  // A 類：作品相關
  | 'submission_created'
  | 'submission_updated'
  | 'submission_approved'
  | 'submission_rejected'
  | 'submission_commented'
  // B 類：評論互動
  | 'comment_mentioned'
  | 'comment_replied'
  | 'comment_reaction'
  // C 類：階段狀態
  | 'stage_started'
  | 'stage_voting'
  | 'stage_completed'
  | 'stage_settled'
  // D 類：認證與安全
  | 'user_registered'
  | 'password_reset'
  | 'two_factor_code_sent'
  // 其他
  | 'group_invitation'
  | 'group_member_added'
  | 'group_member_removed'
  | 'ranking_proposal_approved'
  | 'ranking_proposal_rejected'
  | 'transaction_received'
  | 'settlement_completed';

/**
 * 通知數據接口
 */
export interface NotificationData {
  targetUserEmail: string;
  type: NotificationType;
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
  metadata?: Record<string, any>;
}

/**
 * 創建通知
 *
 * @param env - Cloudflare 環境綁定
 * @param data - 通知數據
 * @returns 通知 ID
 */
export async function createNotification(
  env: Env,
  data: NotificationData
): Promise<string> {
  try {
    const notificationId = generateId('ntf');
    const timestamp = Date.now();

    await env.DB.prepare(`
      INSERT INTO notifications (
        notificationId, targetUserEmail, type, title, content,
        projectId, stageId, commentId, submissionId, groupId,
        transactionId, settlementId, rankingProposalId,
        isRead, isDeleted, emailSent, createdTime, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).bind(
      notificationId,
      data.targetUserEmail,
      data.type,
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
      timestamp,
      data.metadata ? JSON.stringify(data.metadata) : null
    ).run();

    // WebSocket 推送已禁用 - 改用 HTTP 輪詢機制
    // 通知只存儲在資料庫，前端通過定期輪詢獲取
    // 保留 WebSocket 用於：結算進度、強制登出等即時性要求高的場景

    // Log notification creation event
    try {
      // Use projectId from notification data, or 'system' if not provided
      const projectId = data.projectId || 'system';
      const entityType = data.submissionId ? 'submission' :
                         data.commentId ? 'comment' :
                         data.stageId ? 'stage' :
                         data.groupId ? 'group' :
                         'notification';
      const entityId = data.submissionId || data.commentId || data.stageId || data.groupId || notificationId;

      await logProjectOperation(env, data.targetUserEmail, projectId, 'notification_created', entityType, entityId, {
        notificationId,
        notificationType: data.type,
        title: data.title,
        targetUser: data.targetUserEmail
      });
    } catch (logError) {
      console.error('[createNotification] Failed to log notification creation:', logError);
      // Logging failure should not affect notification creation
    }

    return notificationId;
  } catch (error) {
    console.error('[createNotification] Error:', error);
    throw error;
  }
}

/**
 * 批量創建通知
 *
 * @param env - Cloudflare 環境綁定
 * @param notifications - 通知數據數組
 * @returns 通知 ID 數組
 */
export async function createBatchNotifications(
  env: Env,
  notifications: NotificationData[]
): Promise<string[]> {
  if (notifications.length === 0) return [];

  try {
    const notificationIds: string[] = [];
    const statements = [];
    const timestamp = Date.now();

    for (const data of notifications) {
      const notificationId = generateId('ntf');
      notificationIds.push(notificationId);

      statements.push(
        env.DB.prepare(`
          INSERT INTO notifications (
            notificationId, targetUserEmail, type, title, content,
            projectId, stageId, commentId, submissionId, groupId,
            transactionId, settlementId, rankingProposalId,
            isRead, isDeleted, emailSent, createdTime, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
        `).bind(
          notificationId,
          data.targetUserEmail,
          data.type,
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
          timestamp,
          data.metadata ? JSON.stringify(data.metadata) : null
        )
      );
    }

    // 批量執行
    await env.DB.batch(statements);

    // WebSocket 推送已禁用 - 批量通知改用 HTTP 輪詢機制
    // 前端會通過定期查詢獲取新通知

    // Log batch notification creation event
    try {
      // Group notifications by projectId for logging
      const notificationsByProject = new Map<string, any[]>();

      for (let i = 0; i < notifications.length; i++) {
        const data = notifications[i];
        const projectId = data.projectId || 'system';

        if (!notificationsByProject.has(projectId)) {
          notificationsByProject.set(projectId, []);
        }

        notificationsByProject.get(projectId)!.push({
          notificationId: notificationIds[i],
          type: data.type,
          targetUser: data.targetUserEmail
        });
      }

      // Log one event per project
      for (const [projectId, notifs] of notificationsByProject) {
        await logProjectOperation(env, 'system', projectId, 'notifications_batch_created', 'notification', 'batch', {
          count: notifs.length,
          notifications: notifs
        });
      }
    } catch (logError) {
      console.error('[createBatchNotifications] Failed to log batch notification creation:', logError);
      // Logging failure should not affect notification creation
    }

    return notificationIds;
  } catch (error) {
    console.error('[createBatchNotifications] Error:', error);
    throw error;
  }
}

/**
 * 推送通知到用戶的 WebSocket 連接
 *
 * @param env - Cloudflare 環境綁定
 * @param userEmail - 用戶郵箱
 * @param notification - 通知數據
 */
async function pushNotificationToUser(
  env: Env,
  userEmail: string,
  notification: any
): Promise<void> {
  try {
    // 獲取用戶 ID
    const user = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      console.warn(`[pushNotificationToUser] User not found: ${userEmail}`);
      return;
    }

    // 獲取用戶的 NotificationHub Durable Object
    const id = env.NOTIFICATION_HUB.idFromName(user.userId as string);
    const stub = env.NOTIFICATION_HUB.get(id);

    // 廣播通知消息
    await stub.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'notification',
        data: notification
      })
    }));
  } catch (error) {
    // 推送失敗不應影響通知創建
    console.error('[pushNotificationToUser] Error:', error);
  }
}

/**
 * 獲取群組所有成員的郵箱
 *
 * @param env - Cloudflare 環境綁定
 * @param projectId - 項目 ID
 * @param groupId - 群組 ID
 * @returns 成員郵箱數組
 */
export async function getGroupMemberEmails(
  env: Env,
  projectId: string,
  groupId: string
): Promise<string[]> {
  try {
    const result = await env.DB.prepare(`
      SELECT userEmail FROM usergroups
      WHERE projectId = ? AND groupId = ? AND isActive = 1
    `).bind(projectId, groupId).all();

    return result.results?.map((r: any) => r.userEmail) || [];
  } catch (error) {
    console.error('[getGroupMemberEmails] Error:', error);
    return [];
  }
}

/**
 * 獲取階段所有參與群組的成員郵箱
 *
 * @param env - Cloudflare 環境綁定
 * @param projectId - 項目 ID
 * @param stageId - 階段 ID
 * @returns 成員郵箱數組
 */
export async function getStageMemberEmails(
  env: Env,
  projectId: string,
  stageId: string
): Promise<string[]> {
  try {
    const result = await env.DB.prepare(`
      SELECT DISTINCT ug.userEmail
      FROM usergroups ug
      INNER JOIN groups g ON ug.groupId = g.groupId
      WHERE g.projectId = ? AND ug.projectId = ? AND ug.isActive = 1
    `).bind(projectId, projectId).all();

    return result.results?.map((r: any) => r.userEmail) || [];
  } catch (error) {
    console.error('[getStageMemberEmails] Error:', error);
    return [];
  }
}
