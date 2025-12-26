// ============================================
// Cloudflare Queue Message Type Definitions
// ============================================

import { z } from 'zod';

// ==================== Email Queue ====================

export const EmailQueueMessageSchema = z.discriminatedUnion('type', [
  // 邀請碼郵件
  z.object({
    type: z.literal('invitation'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      targetEmail: z.string().email(),
      code: z.string(),
      validDays: z.number(),
      createdBy: z.string(),
    }),
  }),

  // 密碼重置 2FA
  z.object({
    type: z.literal('password_reset_2fa'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      code: z.string(),
      ip: z.string(),
      country: z.string().optional(),
    }),
  }),

  // 密碼重置成功
  z.object({
    type: z.literal('password_reset'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      displayName: z.string(),
      newPassword: z.string(),
    }),
  }),

  // 雙因素驗證碼
  z.object({
    type: z.literal('two_factor_code'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      code: z.string(),
    }),
  }),

  // 帳號鎖定通知
  z.object({
    type: z.literal('account_locked'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      displayName: z.string(),
      reason: z.string(),
      lockType: z.enum(['temporary', 'permanent']),
      unlockTime: z.number().optional(),
      relatedLogsDetails: z.array(z.object({
        logId: z.string(),
        timestamp: z.number(),
        ipAddress: z.string(),
        country: z.string(),
        city: z.string().nullable(),
        timezone: z.string(),
        userAgent: z.string(),
        reason: z.string(),
        attemptCount: z.number(),
      })).optional(),
    }),
  }),

  // 帳號解鎖通知
  z.object({
    type: z.literal('account_unlocked'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      displayName: z.string(),
      unlockedBy: z.string(),
    }),
  }),

  // 通知彙整郵件
  z.object({
    type: z.literal('notification_digest'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      userEmail: z.string().email(),
      displayName: z.string(),
      notifications: z.array(z.object({
        title: z.string(),
        content: z.string().optional(),
        createdAt: z.number(),
        type: z.string(),
      })),
      unreadCount: z.number(),
      periodStart: z.number(),
      periodEnd: z.number(),
    }),
  }),

  // 安全巡邏報告
  z.object({
    type: z.literal('security_report'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      adminEmail: z.string().email(),
      reportHtml: z.string(),
      reportText: z.string(),
      summary: z.object({
        expiredCodesCount: z.number(),
        failedAttemptsCount: z.number(),
        issuesFound: z.number(),
      }),
    }),
  }),

  // 管理員通知
  z.object({
    type: z.literal('admin_notification'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      adminEmail: z.string().email(),
      subject: z.string(),
      htmlBody: z.string(),
      textBody: z.string(),
      priority: z.enum(['low', 'normal', 'high']).optional(),
    }),
  }),

  // 安全警報（管理員專用）
  z.object({
    type: z.literal('security_alert'),
    triggeredBy: z.string(),
    timestamp: z.number(),
    data: z.object({
      adminEmail: z.string().email(),
      targetUser: z.string(),
      alertType: z.string(),
      reason: z.string(),
      ipAddress: z.string(),
      country: z.string(),
      lockUntil: z.number().optional(),
      threats: z.array(z.any()).optional(),
      relatedLogsDetails: z.array(z.object({
        logId: z.string(),
        timestamp: z.number(),
        ipAddress: z.string(),
        country: z.string(),
        city: z.string().nullable(),
        timezone: z.string(),
        userAgent: z.string(),
        reason: z.string(),
        attemptCount: z.number(),
      })).optional(),
    }),
  }),
]);

export type EmailQueueMessage = z.infer<typeof EmailQueueMessageSchema>;

// ==================== Notification Queue ====================

// 通知類型枚舉
export enum NotificationType {
  // Submission 流程
  SUBMISSION_CREATED = 'submission_created',
  SUBMISSION_WITHDRAWN = 'submission_withdrawn',
  SUBMISSION_APPROVED = 'submission_approved',

  // Stage 管理
  STAGE_STATUS_CHANGED = 'stage_status_changed',

  // Ranking 流程
  RANKING_PROPOSAL_SUBMITTED = 'ranking_proposal_submitted',
  RANKING_PROPOSAL_WITHDRAWN = 'ranking_proposal_withdrawn',
  RANKING_PROPOSAL_APPROVED = 'ranking_proposal_approved',

  // 互動通知
  COMMENT_MENTIONED = 'comment_mentioned',
  COMMENT_REPLIED = 'comment_replied',

  // 結算管理
  SETTLEMENT_FAILED = 'settlement_failed',

  // 專案權限
  PROJECT_ROLE_ASSIGNED = 'project_role_assigned',
  PROJECT_ROLE_REMOVED = 'project_role_removed',
  GROUP_MEMBER_ADDED = 'group_member_added',
  GROUP_MEMBER_REMOVED = 'group_member_removed',

  // 帳號安全
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  PASSWORD_RESET_SUCCESS = 'password_reset_success',

  // 系統通知
  OPERATION_DEDUPLICATED = 'operation_deduplicated',  // 操作去重提示
}

// 單條通知數據
export interface NotificationData {
  targetUserEmail: string;
  type: NotificationType | string;
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

export const NotificationQueueMessageSchema = z.discriminatedUnion('type', [
  // 單條通知
  z.object({
    type: z.literal('single_notification'),
    timestamp: z.number(),
    data: z.object({
      targetUserEmail: z.string().email(),
      notificationType: z.string(),
      title: z.string(),
      content: z.string().optional(),
      projectId: z.string().optional(),
      stageId: z.string().optional(),
      commentId: z.string().optional(),
      submissionId: z.string().optional(),
      groupId: z.string().optional(),
      transactionId: z.string().optional(),
      settlementId: z.string().optional(),
      rankingProposalId: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }),
  }),

  // 批量通知
  z.object({
    type: z.literal('batch_notifications'),
    timestamp: z.number(),
    data: z.object({
      notifications: z.array(
        z.object({
          targetUserEmail: z.string().email(),
          notificationType: z.string(),
          title: z.string(),
          content: z.string().optional(),
          projectId: z.string().optional(),
          stageId: z.string().optional(),
          commentId: z.string().optional(),
          submissionId: z.string().optional(),
          groupId: z.string().optional(),
          transactionId: z.string().optional(),
          settlementId: z.string().optional(),
          rankingProposalId: z.string().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
        })
      ),
    }),
  }),
]);

export type NotificationQueueMessage = z.infer<typeof NotificationQueueMessageSchema>;

// ==================== Settlement Queue ====================

export const SettlementQueueMessageSchema = z.object({
  type: z.literal('settle_stage'),
  taskId: z.string(),
  operatorEmail: z.string().email(),
  projectId: z.string(),
  stageId: z.string(),
  timestamp: z.number(),
  force: z.boolean().optional(),
});

export type SettlementQueueMessage = z.infer<typeof SettlementQueueMessageSchema>;
