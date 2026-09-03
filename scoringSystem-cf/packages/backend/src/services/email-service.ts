/**
 * Centralized Email Service
 * All email sending operations should use this service for consistent logging and error handling
 */

import type { Env } from '../types';
import { generateId } from '../utils/id-generator';
import { sendEmail as sendSmtpEmail } from '../utils/email';
import { EmailTrigger, type TriggerSource } from './email-triggers';

// Re-exported so the many `from '../services/email-service'` imports keep
// working; the definitions live in ./email-triggers.
export { EmailTrigger } from './email-triggers';
export type { TriggerSource } from './email-triggers';
import { checkEmailBudget, chargeEmailBudget, priorityForTrigger } from '../utils/email-budget';

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
 * Write one row to globalemaillogs.
 *
 * Extracted because sendEmail now has three exits that must all be logged
 * (sent, send failed, refused by the daily budget) and three copies of a
 * 21-column INSERT is three chances to drift.
 *
 * @param env - Worker bindings
 * @param entry - Everything the row needs; `options` supplies the message
 */
async function recordEmailLog(
  env: Env,
  entry: {
    logId: string;
    emailId: string;
    options: SendEmailOptions;
    triggeredBy: string;
    triggerSource: TriggerSource;
    emailSize: number;
    now: number;
    durationMs: number;
    status: 'sent' | 'failed';
    statusCode: number | null;
    error: string | null;
    errorType: string | null;
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO globalemaillogs (
      logId, emailId, trigger, triggeredBy, triggerSource,
      recipient, recipientUserId, subject, htmlBody, textBody, emailSize,
      status, statusCode, error, errorType, retryCount, emailContext,
      timestamp, durationMs, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.logId,
    entry.emailId,
    entry.options.trigger,
    entry.triggeredBy,
    entry.triggerSource,
    entry.options.recipient,
    entry.options.recipientUserId || null,
    entry.options.subject,
    entry.options.htmlBody,
    entry.options.textBody || null,
    entry.emailSize,
    entry.status,
    entry.statusCode,
    entry.error,
    entry.errorType,
    0,
    entry.options.emailContext ? JSON.stringify(entry.options.emailContext) : null,
    entry.now,
    entry.durationMs,
    entry.now,
    entry.now
  ).run();
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
    // ── System-wide SMTP budget ────────────────────────────────────────────
    // Every mail in the system funnels through here, including ones from cron
    // robots that never touch an HTTP route, so this is the only place the
    // daily quota can be enforced completely. Low-priority mail is refused
    // first, which keeps headroom for login codes: without that, one digest
    // robot run in the morning can eat the day's quota and lock everyone out.
    const priority = priorityForTrigger(String(options.trigger));
    let budgetBlocked = false;
    try {
      const budget = await checkEmailBudget(env, priority);
      budgetBlocked = !budget.allowed;
      if (budgetBlocked) {
        console.warn(
          `[Email] Budget exhausted for ${priority} mail: ${budget.used}/${budget.priorityCeiling} ` +
          `(daily budget ${budget.limit}), dropping ${options.trigger} to ${options.recipient}`
        );
      }
    } catch (budgetError) {
      // Fail open: a D1 hiccup must not stop password resets going out. The
      // provider's own quota is the remaining backstop.
      console.error('[Email] Budget check failed, allowing send:', budgetError);
    }

    if (budgetBlocked) {
      await recordEmailLog(env, {
        logId, emailId, options, triggeredBy, triggerSource,
        emailSize: 0, now, durationMs: Date.now() - startTime,
        status: 'failed',
        statusCode: 429,
        error: `Daily email budget exhausted for priority "${priority}"`,
        errorType: 'budget_exceeded'
      });

      return {
        success: false,
        logId,
        emailId,
        error: `Daily email budget exhausted for priority "${priority}"`,
        errorType: 'budget_exceeded',
        statusCode: 429,
        durationMs: Date.now() - startTime
      };
    }

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

    // Charge only successful sends: a failed send consumed no provider quota,
    // and the queue will retry it.
    if (sendResult.success) {
      try {
        await chargeEmailBudget(env, 1);
      } catch (chargeError) {
        console.error('[Email] Failed to charge budget (send already happened):', chargeError);
      }
    }

    const durationMs = Date.now() - startTime;

    await recordEmailLog(env, {
      logId, emailId, options, triggeredBy, triggerSource,
      emailSize, now, durationMs,
      status: sendResult.success ? 'sent' : 'failed',
      statusCode: sendResult.statusCode ?? null,
      error: sendResult.error ?? null,
      errorType: sendResult.errorType ?? null
    });

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
    await recordEmailLog(env, {
      logId, emailId, options, triggeredBy, triggerSource,
      emailSize: 0, now, durationMs,
      status: 'failed',
      statusCode: null,
      error: errorMessage,
      errorType: 'internal_error'
    });

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
