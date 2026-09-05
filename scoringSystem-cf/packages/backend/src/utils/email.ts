/**
 * Generic Email Sending Utilities
 * Uses Cloudflare Email Service (primary) with SMTP fallback
 * @see https://developers.cloudflare.com/email-service/
 */

import { WorkerMailer } from 'worker-mailer';
import type { Env } from '../types';
import { getConfigValue } from './config';

/**
 * Email send result interface
 */
export interface EmailSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  errorType?: string;
  messageId?: string;  // Cloudflare Email Service returns messageId
}

/**
 * Get system title using KV-first strategy
 * Priority: KV > Environment Variable > Default Value
 * Uses getConfigValue() for consistent config management
 */
export async function getSystemTitle(env: Env): Promise<string> {
  try {
    return String(await getConfigValue(env, 'SYSTEM_TITLE') || '評分系統');
  } catch (error) {
    console.error('Error getting system title:', error);
    return '評分系統';
  }
}

/**
 * Get SMTP configuration using KV-first strategy
 * Priority: KV > Environment Variable > Default Value
 * Uses getConfigValue() for consistent config management
 */
export async function getSmtpConfig(env: Env): Promise<{
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
} | null> {
  try {
    // Use getConfigValue for KV-first config reading
    const host = String(await getConfigValue(env, 'SMTP_HOST'));
    const port = await getConfigValue(env, 'SMTP_PORT', { parseAsInt: true });
    const username = String(await getConfigValue(env, 'SMTP_USERNAME'));
    const password = String(await getConfigValue(env, 'SMTP_PASSWORD'));
    const fromName = String(await getConfigValue(env, 'SMTP_FROM_NAME'));
    const fromEmail = String(await getConfigValue(env, 'SMTP_FROM_EMAIL')) || username || 'noreply@example.com';

    if (!host || !username || !password) {
      console.warn('SMTP configuration incomplete (missing host, username, or password)');
      return null;
    }

    return { host, port, username, password, fromName, fromEmail };
  } catch (error) {
    console.error('Error getting SMTP config:', error);
    return null;
  }
}

/**
 * Send email via Cloudflare Email Service
 * @see https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
async function sendEmailViaCloudflare(
  env: Env,
  options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
  }
): Promise<EmailSendResult> {
  if (!env.EMAIL) {
    return {
      success: false,
      statusCode: 503,
      error: 'Cloudflare Email Service not configured',
      errorType: 'cloudflare_email_not_configured'
    };
  }

  try {
    const result = await env.EMAIL.send({
      to: options.to,
      from: { email: options.fromEmail, name: options.fromName },
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
      ...(options.replyTo && { replyTo: options.replyTo }),
    });

    console.log('Email sent via Cloudflare Email Service:', options.to, 'messageId:', result.messageId);
    return {
      success: true,
      statusCode: 200,
      messageId: result.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Cloudflare Email error';
    const errorCode = (error as any)?.code;

    // Map Cloudflare error codes to errorType
    let errorType = 'cloudflare_email_error';
    if (errorCode === 'E_SENDER_NOT_VERIFIED') errorType = 'sender_not_verified';
    else if (errorCode === 'E_RATE_LIMIT_EXCEEDED') errorType = 'rate_limit_exceeded';
    else if (errorCode === 'E_TOO_MANY_RECIPIENTS') errorType = 'too_many_recipients';
    else if (errorCode === 'E_DAILY_LIMIT_EXCEEDED') errorType = 'daily_limit_exceeded';
    else if (errorCode === 'E_RECIPIENT_SUPPRESSED') errorType = 'recipient_suppressed';
    else if (errorCode === 'E_VALIDATION_ERROR') errorType = 'validation_error';

    console.error('Cloudflare Email Service error:', errorCode, errorMessage);
    return {
      success: false,
      statusCode: 500,
      error: errorMessage,
      errorType,
    };
  }
}

/**
 * Send email via SMTP (worker-mailer)
 */
async function sendEmailViaSMTP(
  env: Env,
  options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
  }
): Promise<EmailSendResult> {
  try {
    const smtpConfig = await getSmtpConfig(env);

    if (!smtpConfig) {
      console.warn('SMTP not configured, skipping email send');
      return {
        success: false,
        statusCode: 503,
        error: 'SMTP not configured',
        errorType: 'smtp_not_configured'
      };
    }

    // Connect to SMTP server
    const mailer = await WorkerMailer.connect({
      credentials: {
        username: smtpConfig.username,
        password: smtpConfig.password,
      },
      authType: 'plain',
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465, // Use TLS for port 465, STARTTLS for 587
    });

    // Send email
    await mailer.send({
      from: {
        name: options.fromName || smtpConfig.fromName,
        email: options.fromEmail || smtpConfig.fromEmail,
      },
      to: {
        email: options.to,
      },
      ...(options.replyTo && { replyTo: { email: options.replyTo } }),
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
    });

    console.log('Email sent successfully via SMTP:', options.to);
    return {
      success: true,
      statusCode: 200
    };
  } catch (error) {
    console.error('Send email error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown SMTP error';
    return {
      success: false,
      statusCode: 500,
      error: errorMessage,
      errorType: 'smtp_error'
    };
  }
}

/**
 * Send a generic email using SMTP
 *
 * NOTE: Cloudflare Email Service is currently disabled (Beta limitations)
 * Will be re-enabled when CF Email Service supports sending to any recipient
 *
 * KV Configuration:
 * - EMAIL_FROM_EMAIL: Sender email address (e.g., noreply@kelunyang.online)
 * - EMAIL_FROM_NAME: Sender display name (e.g., 評分系統)
 * - EMAIL_REPLY_TO: Reply-to email address (optional, e.g., admin@school.edu.tw)
 */
export async function sendEmail(
  env: Env,
  options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }
): Promise<EmailSendResult> {
  // Get email configuration from KV (new keys) with fallback to SMTP keys
  const fromEmail = String(await getConfigValue(env, 'EMAIL_FROM_EMAIL'))
    || String(await getConfigValue(env, 'SMTP_FROM_EMAIL'))
    || String(await getConfigValue(env, 'SMTP_USERNAME'))
    || 'noreply@example.com';
  const fromName = String(await getConfigValue(env, 'EMAIL_FROM_NAME'))
    || String(await getConfigValue(env, 'SMTP_FROM_NAME'))
    || '評分系統';
  const replyTo = String(await getConfigValue(env, 'EMAIL_REPLY_TO'));

  // =========================================================================
  // Cloudflare Email Service - DISABLED (Beta limitations)
  // Re-enable when CF Email Service supports sending to any recipient
  // =========================================================================
  // if (env.EMAIL) {
  //   const result = await sendEmailViaCloudflare(env, {
  //     ...options,
  //     fromEmail,
  //     fromName,
  //     replyTo,
  //   });
  //
  //   if (result.success) {
  //     return result;
  //   }
  //
  //   // Only fallback to SMTP for certain error types
  //   const nonRecoverableErrors = [
  //     'sender_not_verified',
  //     'too_many_recipients',
  //     'recipient_suppressed',
  //     'validation_error',
  //   ];
  //
  //   if (nonRecoverableErrors.includes(result.errorType || '')) {
  //     // Don't fallback for non-recoverable errors
  //     return result;
  //   }
  //
  //   // Fallback to SMTP for rate limits or transient errors
  //   console.warn('Cloudflare Email failed, falling back to SMTP:', result.error);
  // }
  // =========================================================================

  // Use SMTP directly
  return await sendEmailViaSMTP(env, {
    ...options,
    fromEmail,
    fromName,
    replyTo,
  });
}

/**
 * Format notification email HTML template
 */
export function formatNotificationEmail(
  title: string,
  content: string,
  actionUrl?: string,
  actionText?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #FF6600; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; line-height: 1.6; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
        .button { display: inline-block; background: #FF6600; color: white; text-decoration: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>[提醒] ${title}</h2>
        </div>
        <div class="content">
          ${content}
          ${actionUrl && actionText ? `
            <div style="text-align: center;">
              <a href="${actionUrl}" class="button">${actionText}</a>
            </div>
          ` : ''}
        </div>
        <div class="footer">
          <p>這是系統自動發送的郵件，請勿直接回覆。</p>
          <p>評分系統 Scoring System</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send password reset email with new password
 * Returns boolean for backward compatibility with existing callers
 */
/**
 * Test Cloudflare Email Service connection
 * Sends a test email to verify the configuration is working
 */
export async function testCloudflareEmailService(
  env: Env,
  testEmail: string
): Promise<EmailSendResult> {
  // Get email configuration from KV
  const fromEmail = String(await getConfigValue(env, 'EMAIL_FROM_EMAIL'));
  const fromName = String(await getConfigValue(env, 'EMAIL_FROM_NAME')) || '評分系統';
  const replyTo = String(await getConfigValue(env, 'EMAIL_REPLY_TO'));

  if (!fromEmail) {
    return {
      success: false,
      statusCode: 400,
      error: '寄件者郵箱 (EMAIL_FROM_EMAIL) 未設定',
      errorType: 'email_not_configured'
    };
  }

  if (!env.EMAIL) {
    return {
      success: false,
      statusCode: 503,
      error: 'Cloudflare Email Service 未綁定',
      errorType: 'cloudflare_email_not_bound'
    };
  }

  const systemTitle = await getSystemTitle(env);
  const timestamp = new Date().toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #0085ff; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px; line-height: 1.6; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
        .success { color: #198754; font-weight: bold; }
        .info-box { background: #e7f5ff; border-left: 4px solid #0085ff; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✅ Cloudflare Email 測試成功</h2>
        </div>
        <div class="content">
          <p class="success">恭喜！Cloudflare Email Service 設定正確。</p>
          <div class="info-box">
            <p><strong>寄件者：</strong> ${fromName} &lt;${fromEmail}&gt;</p>
            ${replyTo ? `<p><strong>回覆地址：</strong> ${replyTo}</p>` : ''}
            <p><strong>測試時間：</strong> ${timestamp}</p>
          </div>
          <p>此郵件透過 Cloudflare Email Service 發送，表示您的郵件設定已正確配置。</p>
        </div>
        <div class="footer">
          <p>${systemTitle}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmailViaCloudflare(env, {
    to: testEmail,
    subject: `[${systemTitle}] Cloudflare Email 測試成功`,
    html,
    fromEmail,
    fromName,
    replyTo,
  });
}
