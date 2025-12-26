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

/**
 * 通知提交創建
 */
export async function notifySubmissionCreated(
  env: Env,
  projectViewers: string[],
  submissionId: string,
  projectId: string,
  stageId: string,
  creatorEmail: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, projectViewers);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'submission_created',
    title: '新的提交',
    content: `${creatorEmail} 提交了新的作品`,
    projectId,
    stageId,
    submissionId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知提交撤回
 */
export async function notifySubmissionWithdrawn(
  env: Env,
  projectViewers: string[],
  submissionId: string,
  projectId: string,
  stageId: string,
  creatorEmail: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, projectViewers);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'submission_withdrawn',
    title: '提交已撤回',
    content: `${creatorEmail} 撤回了提交`,
    projectId,
    stageId,
    submissionId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知提交批准
 */
export async function notifySubmissionApproved(
  env: Env,
  submitterEmail: string,
  submissionId: string,
  projectId: string,
  stageId: string,
  approverEmail: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: submitterEmail,
    type: 'submission_approved',
    title: '提交已批准',
    content: `您的提交已被 ${approverEmail} 批准`,
    projectId,
    stageId,
    submissionId,
  });
}

/**
 * 通知階段狀態變更
 */
export async function notifyStageStatusChanged(
  env: Env,
  projectViewers: string[],
  stageId: string,
  projectId: string,
  newStatus: string,
  changedBy: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, projectViewers);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'stage_status_changed',
    title: '階段狀態變更',
    content: `階段狀態已變更為 ${newStatus} (由 ${changedBy})`,
    projectId,
    stageId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知排名提案提交
 */
export async function notifyRankingProposalSubmitted(
  env: Env,
  projectViewers: string[],
  rankingProposalId: string,
  projectId: string,
  stageId: string,
  proposerEmail: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, projectViewers);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'ranking_proposal_submitted',
    title: '新的排名提案',
    content: `${proposerEmail} 提交了排名提案`,
    projectId,
    stageId,
    rankingProposalId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知排名提案撤回
 */
export async function notifyRankingProposalWithdrawn(
  env: Env,
  projectViewers: string[],
  rankingProposalId: string,
  projectId: string,
  stageId: string,
  proposerEmail: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, projectViewers);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'ranking_proposal_withdrawn',
    title: '排名提案已撤回',
    content: `${proposerEmail} 撤回了排名提案`,
    projectId,
    stageId,
    rankingProposalId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知排名提案批准
 */
export async function notifyRankingProposalApproved(
  env: Env,
  proposerEmail: string,
  rankingProposalId: string,
  projectId: string,
  stageId: string,
  approverEmail: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: proposerEmail,
    type: 'ranking_proposal_approved',
    title: '排名提案已批准',
    content: `您的排名提案已被 ${approverEmail} 批准`,
    projectId,
    stageId,
    rankingProposalId,
  });
}

/**
 * 通知評論提及
 */
export async function notifyCommentMentioned(
  env: Env,
  mentionedEmail: string,
  commentId: string,
  projectId: string,
  authorEmail: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: mentionedEmail,
    type: 'comment_mentioned',
    title: '您被提及',
    content: `${authorEmail} 在評論中提及了您`,
    projectId,
    commentId,
  });
}

/**
 * 通知評論回覆
 */
export async function notifyCommentReplied(
  env: Env,
  originalAuthorEmail: string,
  commentId: string,
  projectId: string,
  replierEmail: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: originalAuthorEmail,
    type: 'comment_replied',
    title: '評論回覆',
    content: `${replierEmail} 回覆了您的評論`,
    projectId,
    commentId,
  });
}

/**
 * 通知結算失敗
 */
export async function notifySettlementFailed(
  env: Env,
  adminEmails: string[],
  settlementId: string,
  projectId: string,
  stageId: string,
  errorReason: string
): Promise<void> {
  // Validate user emails before queuing
  const validEmails = await validateUserEmails(env, adminEmails);

  const notifications: NotificationData[] = validEmails.map(email => ({
    targetUserEmail: email,
    type: 'settlement_failed',
    title: '結算失敗',
    content: `階段結算失敗: ${errorReason}`,
    projectId,
    stageId,
    settlementId,
  }));

  await queueBatchNotifications(env, notifications);
}

/**
 * 通知專案角色分配
 */
export async function notifyProjectRoleAssigned(
  env: Env,
  userEmail: string,
  projectId: string,
  roleName: string,
  assignedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'project_role_assigned',
    title: '專案角色分配',
    content: `您已被分配為 ${roleName} (由 ${assignedBy})`,
    projectId,
  });
}

/**
 * 通知專案角色移除
 */
export async function notifyProjectRoleRemoved(
  env: Env,
  userEmail: string,
  projectId: string,
  roleName: string,
  removedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'project_role_removed',
    title: '專案角色移除',
    content: `您的 ${roleName} 角色已被移除 (由 ${removedBy})`,
    projectId,
  });
}

/**
 * 通知群組成員加入
 */
export async function notifyGroupMemberAdded(
  env: Env,
  userEmail: string,
  groupId: string,
  projectId: string,
  groupName: string,
  addedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'group_member_added',
    title: '加入群組',
    content: `您已被加入群組 ${groupName} (由 ${addedBy})`,
    projectId,
    groupId,
  });
}

/**
 * 通知群組成員移除
 */
export async function notifyGroupMemberRemoved(
  env: Env,
  userEmail: string,
  groupId: string,
  projectId: string,
  groupName: string,
  removedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'group_member_removed',
    title: '移出群組',
    content: `您已被移出群組 ${groupName} (由 ${removedBy})`,
    projectId,
    groupId,
  });
}

/**
 * 通知帳號鎖定
 */
export async function notifyAccountLocked(
  env: Env,
  userEmail: string,
  reason: string,
  lockedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'account_locked',
    title: '帳號已鎖定',
    content: `您的帳號已被鎖定: ${reason} (由 ${lockedBy})`,
  });
}

/**
 * 通知帳號解鎖
 */
export async function notifyAccountUnlocked(
  env: Env,
  userEmail: string,
  unlockedBy: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'account_unlocked',
    title: '帳號已解鎖',
    content: `您的帳號已被解鎖 (由 ${unlockedBy})`,
  });
}

/**
 * 通知密碼重置成功
 */
export async function notifyPasswordResetSuccess(
  env: Env,
  userEmail: string
): Promise<void> {
  await queueSingleNotification(env, {
    targetUserEmail: userEmail,
    type: 'password_reset_success',
    title: '密碼重置成功',
    content: '您的密碼已成功重置',
  });
}
