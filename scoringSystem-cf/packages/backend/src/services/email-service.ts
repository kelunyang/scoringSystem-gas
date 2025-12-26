/**
 * Centralized Email Service
 * All email sending operations should use this service for consistent logging and error handling
 */

import type { Env } from '../types';
import { generateId } from '../utils/id-generator';
import { sendEmail as sendSmtpEmail } from '../utils/email';

/**
 * Email trigger sources (which module triggered the email)
 */
export enum EmailTrigger {
  NOTIFICATION_PATROL = 'notification_patrol',
  INVITATION = 'invitation',
  PASSWORD_RESET = 'password_reset',
  PASSWORD_RESET_2FA = 'password_reset_2fa',
  TWO_FACTOR_LOGIN = 'two_factor_login',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  SECURITY_PATROL = 'security_patrol',
  ADMIN_NOTIFICATION = 'admin_notification',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  MANUAL_ADMIN = 'manual_admin',
  RESEND = 'resend'
}

/**
 * Trigger source types
 */
export type TriggerSource = 'manual' | 'auto' | 'scheduled';

/**
 * Email send options
 */
export interface SendEmailOptions {
  trigger: EmailTrigger | string;
  triggeredBy?: string;  // User email or 'system'
  triggerSource?: TriggerSource;
  recipient: string;
  recipientUserId?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  emailContext?: Record<string, any>;
}

/**
 * Email send result
 */
export interface SendEmailResult {
  success: boolean;
  logId?: string;
  emailId?: string;
  error?: string;
  errorType?: string;
  statusCode?: number;
  durationMs?: number;
}

/**
 * Batch email send result
 */
export interface BatchSendResult {
  success: number;
  failed: number;
  results: Array<{
    recipient: string;
    success: boolean;
    logId?: string;
    error?: string;
  }>;
}

/**
 * Send email with automatic logging to globalemaillogs
 */
export async function sendEmail(
  env: Env,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const startTime = Date.now();
  const emailId = generateId('email');
  const logId = generateId('log');
  const now = Date.now();

  // Default values
  const triggeredBy = options.triggeredBy || 'system';
  const triggerSource = options.triggerSource || 'auto';

  try {
    // Calculate email size (using Web API - TextEncoder)
    const encoder = new TextEncoder();
    const htmlSize = encoder.encode(options.htmlBody).length;
    const textSize = encoder.encode(options.textBody || '').length;
    const emailSize = htmlSize + textSize;

    // Send email via SMTP
    const sendResult = await sendSmtpEmail(env, {
      to: options.recipient,
      subject: options.subject,
      html: options.htmlBody,
      text: options.textBody
    });

    const durationMs = Date.now() - startTime;

    // Prepare log entry
    const logEntry = {
      logId,
      emailId,
      trigger: options.trigger,
      triggeredBy,
      triggerSource,
      recipient: options.recipient,
      recipientUserId: options.recipientUserId || null,
      subject: options.subject,
      htmlBody: options.htmlBody,
      textBody: options.textBody || null,
      emailSize,
      status: sendResult.success ? 'sent' : 'failed',
      statusCode: sendResult.statusCode || null,
      error: sendResult.error || null,
      errorType: sendResult.errorType || null,
      retryCount: 0,
      emailContext: options.emailContext ? JSON.stringify(options.emailContext) : null,
      timestamp: now,
      durationMs,
      createdAt: now,
      updatedAt: now
    };

    // Log to database
    await env.DB.prepare(`
      INSERT INTO globalemaillogs (
        logId, emailId, trigger, triggeredBy, triggerSource,
        recipient, recipientUserId, subject, htmlBody, textBody, emailSize,
        status, statusCode, error, errorType, retryCount, emailContext,
        timestamp, durationMs, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logEntry.logId,
      logEntry.emailId,
      logEntry.trigger,
      logEntry.triggeredBy,
      logEntry.triggerSource,
      logEntry.recipient,
      logEntry.recipientUserId,
      logEntry.subject,
      logEntry.htmlBody,
      logEntry.textBody,
      logEntry.emailSize,
      logEntry.status,
      logEntry.statusCode,
      logEntry.error,
      logEntry.errorType,
      logEntry.retryCount,
      logEntry.emailContext,
      logEntry.timestamp,
      logEntry.durationMs,
      logEntry.createdAt,
      logEntry.updatedAt
    ).run();

    return {
      success: sendResult.success,
      logId,
      emailId,
      error: sendResult.error,
      errorType: sendResult.errorType,
      statusCode: sendResult.statusCode,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed attempt
    await env.DB.prepare(`
      INSERT INTO globalemaillogs (
        logId, emailId, trigger, triggeredBy, triggerSource,
        recipient, recipientUserId, subject, htmlBody, textBody, emailSize,
        status, statusCode, error, errorType, retryCount, emailContext,
        timestamp, durationMs, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      emailId,
      options.trigger,
      triggeredBy,
      triggerSource,
      options.recipient,
      options.recipientUserId || null,
      options.subject,
      options.htmlBody,
      options.textBody || null,
      0,
      'failed',
      null,
      errorMessage,
      'internal_error',
      0,
      options.emailContext ? JSON.stringify(options.emailContext) : null,
      now,
      durationMs,
      now,
      now
    ).run();

    return {
      success: false,
      logId,
      emailId,
      error: errorMessage,
      errorType: 'internal_error',
      durationMs
    };
  }
}

/**
 * Send batch emails
 */
export async function sendBatchEmails(
  env: Env,
  emails: SendEmailOptions[]
): Promise<BatchSendResult> {
  const results: BatchSendResult['results'] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const emailOptions of emails) {
    const result = await sendEmail(env, emailOptions);

    results.push({
      recipient: emailOptions.recipient,
      success: result.success,
      logId: result.logId,
      error: result.error
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    results
  };
}

/**
 * Resend email from log record
 */
export async function resendEmail(
  env: Env,
  logId: string,
  triggeredBy: string
): Promise<SendEmailResult> {
  // Get original email log
  const originalLog = await env.DB.prepare(`
    SELECT * FROM globalemaillogs WHERE logId = ?
  `).bind(logId).first();

  if (!originalLog) {
    return {
      success: false,
      error: 'Email log not found',
      errorType: 'not_found'
    };
  }

  // Resend email with RESEND trigger
  return await sendEmail(env, {
    trigger: EmailTrigger.RESEND,
    triggeredBy,
    triggerSource: 'manual',
    recipient: originalLog.recipient as string,
    recipientUserId: originalLog.recipientUserId as string | undefined,
    subject: originalLog.subject as string,
    htmlBody: originalLog.htmlBody as string,
    textBody: originalLog.textBody as string | undefined,
    emailContext: {
      originalLogId: logId,
      originalTrigger: originalLog.trigger,
      originalTimestamp: originalLog.timestamp,
      resendReason: 'manual_resend'
    }
  });
}

/**
 * Batch resend emails
 */
export async function resendBatchEmails(
  env: Env,
  logIds: string[],
  triggeredBy: string
): Promise<BatchSendResult> {
  const results: BatchSendResult['results'] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const logId of logIds) {
    const result = await resendEmail(env, logId, triggeredBy);

    // Get recipient from original log
    const originalLog = await env.DB.prepare(`
      SELECT recipient FROM globalemaillogs WHERE logId = ?
    `).bind(logId).first();

    results.push({
      recipient: originalLog?.recipient as string || 'unknown',
      success: result.success,
      logId: result.logId,
      error: result.error
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    results
  };
}
