// ============================================
// Email Queue Consumer
// ============================================

import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { EmailQueueMessageSchema } from './types';
import {
  buildInvitationEmailContent,
  buildPasswordReset2FAEmailContent,
  buildPasswordResetEmailContent,
  buildTwoFactorCodeEmailContent,
  buildAccountLockedEmailContent,
  buildAccountUnlockedEmailContent,
  buildNotificationDigestEmailContent,
  buildSecurityReportEmailContent,
  buildAdminNotificationEmailContent,
  buildSecurityAlertEmailContent,
} from './email-templates';
import { sendEmail, EmailTrigger } from '../services/email-service';
import { generateId } from '../utils/id-generator';
import { logGlobalOperation } from '../utils/logging';
import { getSystemTitle } from '../utils/email';
import { getConfigValue } from '../utils/config';

/**
 * Check if email has already been processed (idempotency)
 * Returns the existing emailId if found, null otherwise
 */
async function checkIdempotency(
  env: Env,
  emailType: string,
  recipient: string,
  queueMessageId: string
): Promise<{ emailId?: string } | null> {
  const idempotencyKey = `email_${emailType}_${recipient}_${queueMessageId}`;
  const existing = await env.DB.prepare(`
    SELECT emailId FROM email_idempotency WHERE idempotencyKey = ?
  `).bind(idempotencyKey).first();

  if (existing) {
    // Log duplicate detection to sys_logs
    await logGlobalOperation(
      env,
      'system',
      'queue_duplicate_detected',
      'email_queue',
      queueMessageId,
      {
        queueMessageId,
        emailType,
        recipient,
        existingEmailId: existing.emailId,
        reason: 'Idempotency protection prevented duplicate email send'
      },
      { level: 'info' }
    ).catch(err => console.error('[Email Consumer] Failed to log duplicate detection:', err));

    return { emailId: existing.emailId as string };
  }

  return null;
}

/**
 * Record email idempotency key after successful send
 */
async function recordIdempotency(
  env: Env,
  emailType: string,
  recipient: string,
  queueMessageId: string,
  emailId: string,
  logId?: string
): Promise<void> {
  const idempotencyKey = `email_${emailType}_${recipient}_${queueMessageId}`;
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO email_idempotency (idempotencyKey, emailId, queueMessageId, emailType, recipient, logId, processedAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(idempotencyKey, emailId, queueMessageId, emailType, recipient, logId || null, now, now).run();
}

/**
 * Determine if error should trigger retry
 */
function shouldRetryEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // D1 database errors - retry
  if (error.message.includes('D1_ERROR') ||
      error.message.includes('database') ||
      error.message.includes('SQLITE')) {
    return true;
  }

  // SMTP temporary failures - retry
  if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('Rate limit')) {
    return true;
  }

  // Validation errors - don't retry (bad data)
  if (error.name === 'ZodError') {
    return false;
  }

  // SMTP permanent failures - don't retry
  if (error.message.includes('Invalid recipient') ||
      error.message.includes('550') ||
      error.message.includes('Mailbox not found')) {
    return false;
  }

  // Default: retry on unknown errors
  return true;
}

/**
 * Email Queue Consumer
 * Processes email messages from the EMAIL_QUEUE
 */
export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    console.log(`[Email Consumer] Processing batch of ${batch.messages.length} messages`);

    // Get system configuration (KV-first: KV → env var → default)
    const systemTitle = await getSystemTitle(env);

    for (const message of batch.messages) {
      const messageId = message.id;
      const timestamp = message.timestamp.getTime();

      try {
        // Validate message schema
        const parsedMessage = EmailQueueMessageSchema.parse(message.body);
        console.log(`[Email Consumer] Processing ${parsedMessage.type} email (message.id: ${messageId})`);

        // Process based on message type
        switch (parsedMessage.type) {
          case 'invitation': {
            const { targetEmail, code, validDays, createdBy } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'invitation', targetEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate invitation email for ${targetEmail}`);
              break;
            }

            // Build email content
            const emailContent = buildInvitationEmailContent(
              targetEmail,
              code,
              validDays,
              createdBy,
              await getConfigValue(env, 'WEB_APP_URL'),
              systemTitle
            );

            // Send email
            const result = await sendEmail(env, {
              trigger: EmailTrigger.INVITATION,
              triggeredBy: createdBy,
              triggerSource: 'auto',
              recipient: targetEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                invitationCode: code,
                validDays,
                queueMessageType: 'invitation',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'invitation', targetEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent invitation email to ${targetEmail}`);
            break;
          }

          case 'password_reset_2fa': {
            const { userEmail, code, ip, country } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'password_reset_2fa', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate password_reset_2fa email for ${userEmail}`);
              break;
            }

            // Build email content
            const emailContent = buildPasswordReset2FAEmailContent(
              userEmail,
              code,
              ip,
              country,
              systemTitle,
              await getConfigValue(env, 'WEB_APP_URL')
            );

            // Send email
            const result = await sendEmail(env, {
              trigger: EmailTrigger.PASSWORD_RESET_2FA,
              triggeredBy: userEmail,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                ip,
                country,
                queueMessageType: 'password_reset_2fa',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'password_reset_2fa', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent password reset 2FA email to ${userEmail}`);
            break;
          }

          case 'password_reset': {
            const { userEmail, displayName, newPassword } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'password_reset', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate password_reset email for ${userEmail}`);
              break;
            }

            // Build email content
            const emailContent = buildPasswordResetEmailContent(
              userEmail,
              displayName,
              newPassword,
              systemTitle,
              await getConfigValue(env, 'WEB_APP_URL')
            );

            // Send email
            const result = await sendEmail(env, {
              trigger: EmailTrigger.PASSWORD_RESET,
              triggeredBy: userEmail,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                queueMessageType: 'password_reset',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'password_reset', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent password reset email to ${userEmail}`);
            break;
          }

          case 'two_factor_code': {
            const { userEmail, code } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'two_factor_code', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate two_factor_code email for ${userEmail}`);
              break;
            }

            // Build email content
            const emailContent = buildTwoFactorCodeEmailContent(
              userEmail,
              code,
              systemTitle,
              await getConfigValue(env, 'WEB_APP_URL')
            );

            // Send email
            const result = await sendEmail(env, {
              trigger: EmailTrigger.TWO_FACTOR_LOGIN,
              triggeredBy: userEmail,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                queueMessageType: 'two_factor_code',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'two_factor_code', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent 2FA login code email to ${userEmail}`);
            break;
          }

          case 'account_locked': {
            const { userEmail, displayName, reason, lockType, unlockTime, relatedLogsDetails } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'account_locked', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate account_locked email for ${userEmail}`);
              break;
            }

            const emailContent = buildAccountLockedEmailContent(
              userEmail,
              displayName,
              reason,
              lockType,
              unlockTime,
              systemTitle,
              relatedLogsDetails
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.ACCOUNT_LOCKED,
              triggeredBy: parsedMessage.triggeredBy,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                lockType,
                reason,
                relatedLogsCount: relatedLogsDetails?.length || 0,
                queueMessageType: 'account_locked',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'account_locked', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent account locked email to ${userEmail}`);
            break;
          }

          case 'account_unlocked': {
            const { userEmail, displayName, unlockedBy } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'account_unlocked', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate account_unlocked email for ${userEmail}`);
              break;
            }

            const emailContent = buildAccountUnlockedEmailContent(
              userEmail,
              displayName,
              unlockedBy,
              systemTitle,
              await getConfigValue(env, 'WEB_APP_URL')
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.ACCOUNT_UNLOCKED,
              triggeredBy: unlockedBy,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                unlockedBy,
                queueMessageType: 'account_unlocked',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'account_unlocked', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent account unlocked email to ${userEmail}`);
            break;
          }

          case 'notification_digest': {
            const { userEmail, displayName, notifications, unreadCount, periodStart, periodEnd } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'notification_digest', userEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate notification_digest email for ${userEmail}`);
              break;
            }

            const emailContent = buildNotificationDigestEmailContent(
              userEmail,
              displayName,
              notifications,
              unreadCount,
              periodStart,
              periodEnd,
              systemTitle,
              await getConfigValue(env, 'WEB_APP_URL')
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.NOTIFICATION_PATROL,
              triggeredBy: parsedMessage.triggeredBy,
              triggerSource: 'auto',
              recipient: userEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                notificationCount: unreadCount,
                periodStart,
                periodEnd,
                queueMessageType: 'notification_digest',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'notification_digest', userEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent notification digest email to ${userEmail}`);
            break;
          }

          case 'security_report': {
            const { adminEmail, reportHtml, reportText, summary } = parsedMessage.data;

            // 🔥 NEW: Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'security_report', adminEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate security_report email for ${adminEmail}`);
              break;
            }

            const emailContent = buildSecurityReportEmailContent(
              adminEmail,
              reportHtml,
              reportText,
              summary,
              systemTitle
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.SECURITY_PATROL,
              triggeredBy: parsedMessage.triggeredBy,
              triggerSource: 'auto',
              recipient: adminEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                summary,
                queueMessageType: 'security_report',
              },
            });

            // 🔥 NEW: Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'security_report', adminEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent security report email to ${adminEmail}`);
            break;
          }

          case 'admin_notification': {
            const { adminEmail, subject, htmlBody, textBody, priority } = parsedMessage.data;

            // Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'admin_notification', adminEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate admin_notification for ${adminEmail}`);
              break;
            }

            const emailContent = buildAdminNotificationEmailContent(
              adminEmail,
              subject,
              htmlBody,
              textBody,
              priority,
              systemTitle
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.ADMIN_NOTIFICATION,
              triggeredBy: parsedMessage.triggeredBy,
              triggerSource: 'auto',
              recipient: adminEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                priority,
                queueMessageType: 'admin_notification',
              },
            });

            // Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'admin_notification', adminEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent admin notification email to ${adminEmail}`);
            break;
          }

          case 'security_alert': {
            const { adminEmail, targetUser, alertType, reason, ipAddress, country, lockUntil, threats, relatedLogsDetails } = parsedMessage.data;

            // Idempotency check
            const alreadyProcessed = await checkIdempotency(env, 'security_alert', adminEmail, messageId);
            if (alreadyProcessed) {
              console.log(`[Email Consumer] ⏭️ Skipping duplicate security_alert for ${adminEmail}`);
              break;
            }

            // Build security alert email content using template
            const emailContent = buildSecurityAlertEmailContent(
              targetUser,
              alertType,
              reason,
              ipAddress,
              country,
              lockUntil,
              threats,
              systemTitle,
              relatedLogsDetails
            );

            const result = await sendEmail(env, {
              trigger: EmailTrigger.ADMIN_NOTIFICATION,
              triggeredBy: parsedMessage.triggeredBy,
              triggerSource: 'auto',
              recipient: adminEmail,
              subject: emailContent.subject,
              htmlBody: emailContent.htmlBody,
              textBody: emailContent.textBody,
              emailContext: {
                alertType,
                targetUser,
                ipAddress,
                country,
                relatedLogsCount: relatedLogsDetails?.length || 0,
                queueMessageType: 'security_alert',
              },
            });

            // Record idempotency
            if (result.emailId) {
              await recordIdempotency(env, 'security_alert', adminEmail, messageId, result.emailId, result.logId);
            }

            console.log(`[Email Consumer] Sent security alert email to ${adminEmail} for ${targetUser}`);
            break;
          }

          default:
            // TypeScript should ensure this is unreachable
            console.error('[Email Consumer] Unknown message type:', parsedMessage);
        }

        // ACK message (mark as successfully processed)
        message.ack();
        console.log(`[Email Consumer] ✅ Message ${messageId} ACKed successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error(`[Email Consumer] ❌ Error processing message ${messageId}:`, {
          error: errorMessage,
          stack: errorStack,
          messageBody: JSON.stringify(message.body).substring(0, 500),
          timestamp
        });

        // Typed error handling
        if (shouldRetryEmailError(error)) {
          message.retry();
          console.log(`[Email Consumer] 🔄 Message ${messageId} will be retried`);
        } else {
          // ACK on non-retryable errors (email send failures are already logged to globalemaillogs)
          message.ack();
          console.log(`[Email Consumer] ⚠️ Message ${messageId} ACKed despite error (non-retryable, logged to globalemaillogs)`);
        }
      }
    }

    console.log(`[Email Consumer] Batch processing complete`);
  },
};
