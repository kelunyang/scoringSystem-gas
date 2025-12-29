// ============================================
// Email Queue Producer
// ============================================

import type { Env } from '../types';
import type { EmailQueueMessage } from './types';

/**
 * 推送邀請碼郵件到 Queue
 */
export async function queueInvitationEmail(
  env: Env,
  targetEmail: string,
  code: string,
  validDays: number,
  createdBy: string
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'invitation',
    triggeredBy: createdBy,
    timestamp: Date.now(),
    data: {
      targetEmail,
      code,
      validDays,
      createdBy,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued invitation email for ${targetEmail}`);
}

/**
 * 推送密碼重置 2FA 郵件到 Queue
 */
export async function queuePasswordReset2FAEmail(
  env: Env,
  userEmail: string,
  code: string,
  ip: string,
  country?: string
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'password_reset_2fa',
    triggeredBy: userEmail,
    timestamp: Date.now(),
    data: {
      userEmail,
      code,
      ip,
      country,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued password reset 2FA email for ${userEmail}`);
}

/**
 * 推送密碼重置成功郵件到 Queue
 */
export async function queuePasswordResetEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  newPassword: string
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'password_reset',
    triggeredBy: userEmail,
    timestamp: Date.now(),
    data: {
      userEmail,
      displayName,
      newPassword,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued password reset email for ${userEmail}`);
}

/**
 * 推送雙因素驗證碼郵件到 Queue
 */
export async function queueTwoFactorCodeEmail(
  env: Env,
  userEmail: string,
  code: string
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'two_factor_code',
    triggeredBy: userEmail,
    timestamp: Date.now(),
    data: {
      userEmail,
      code,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued 2FA code email for ${userEmail}`);
}

/**
 * 推送帳號鎖定通知郵件到 Queue
 */
export async function queueAccountLockedEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  reason: string,
  lockType: 'temporary' | 'permanent',
  unlockTime?: number,
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
  }>
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'account_locked',
    triggeredBy: 'system',
    timestamp: Date.now(),
    data: {
      userEmail,
      displayName,
      reason,
      lockType,
      unlockTime,
      relatedLogsDetails,  // 🔥 Pass to email consumer
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued account locked email for ${userEmail}`);
}

/**
 * 推送安全警報郵件給管理員
 * User requirement: "所有這些帳號變更，大於medium的，管理員也要收到email"
 */
export async function queueSecurityAlertEmail(
  env: Env,
  details: {
    adminEmail: string;
    targetUser: string;
    alertType: string;
    reason: string;
    ipAddress: string;
    country: string;
    lockUntil?: number;
    threats?: any[];
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
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'security_alert',
    triggeredBy: 'system',
    timestamp: Date.now(),
    data: {
      adminEmail: details.adminEmail,
      targetUser: details.targetUser,
      alertType: details.alertType,
      reason: details.reason,
      ipAddress: details.ipAddress,
      country: details.country,
      lockUntil: details.lockUntil,
      threats: details.threats,
      relatedLogsDetails: details.relatedLogsDetails,  // 🔥 Pass to email consumer
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued security alert email for admin ${details.adminEmail}`);
}

/**
 * 推送帳號解鎖通知郵件到 Queue
 */
export async function queueAccountUnlockedEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  unlockedBy: string
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'account_unlocked',
    triggeredBy: unlockedBy,
    timestamp: Date.now(),
    data: {
      userEmail,
      displayName,
      unlockedBy,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued account unlocked email for ${userEmail}`);
}

/**
 * 推送通知彙整郵件到 Queue
 */
export async function queueNotificationDigestEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  notifications: Array<{
    title: string;
    content?: string;
    createdAt: number;
    type: string;
  }>,
  unreadCount: number,
  periodStart: number,
  periodEnd: number
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'notification_digest',
    triggeredBy: 'system',
    timestamp: Date.now(),
    data: {
      userEmail,
      displayName,
      notifications,
      unreadCount,
      periodStart,
      periodEnd,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued notification digest email for ${userEmail}`);
}

/**
 * 推送安全巡邏報告郵件到 Queue
 */
export async function queueSecurityReportEmail(
  env: Env,
  adminEmail: string,
  reportHtml: string,
  reportText: string,
  summary: {
    expiredCodesCount: number;
    failedAttemptsCount: number;
    issuesFound: number;
  }
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'security_report',
    triggeredBy: 'system',
    timestamp: Date.now(),
    data: {
      adminEmail,
      reportHtml,
      reportText,
      summary,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued security report email for ${adminEmail}`);
}

/**
 * 推送管理員通知郵件到 Queue
 */
export async function queueAdminNotificationEmail(
  env: Env,
  adminEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  priority?: 'low' | 'normal' | 'high'
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'admin_notification',
    triggeredBy: 'system',
    timestamp: Date.now(),
    data: {
      adminEmail,
      subject,
      htmlBody,
      textBody,
      priority,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued admin notification email for ${adminEmail}`);
}

/**
 * 推送成果被教師強制撤回通知郵件到 Queue
 */
export async function queueSubmissionForceWithdrawnEmail(
  env: Env,
  targetEmail: string,
  displayName: string,
  projectName: string,
  stageName: string,
  groupName: string,
  reason: string,
  teacherEmail: string,
  wasApproved: boolean
): Promise<void> {
  const message: EmailQueueMessage = {
    type: 'submission_force_withdrawn',
    triggeredBy: teacherEmail,
    timestamp: Date.now(),
    data: {
      targetEmail,
      displayName,
      projectName,
      stageName,
      groupName,
      reason,
      teacherEmail,
      wasApproved,
    },
  };

  await env.EMAIL_QUEUE.send(message);
  console.log(`[Email Queue] Queued submission force withdrawn email for ${targetEmail}`);
}
