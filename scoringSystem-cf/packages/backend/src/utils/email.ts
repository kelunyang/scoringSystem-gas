/**
 * Generic Email Sending Utilities
 * Uses worker-mailer with SMTP configuration
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
}

/**
 * Get system title using KV-first strategy
 * Priority: KV > Environment Variable > Default Value
 * Uses getConfigValue() for consistent config management
 */
export async function getSystemTitle(env: Env): Promise<string> {
  try {
    return await getConfigValue(env, 'SYSTEM_TITLE') || '評分系統';
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
    const host = await getConfigValue(env, 'SMTP_HOST');
    const port = await getConfigValue(env, 'SMTP_PORT', { parseAsInt: true });
    const username = await getConfigValue(env, 'SMTP_USERNAME');
    const password = await getConfigValue(env, 'SMTP_PASSWORD');
    const fromName = await getConfigValue(env, 'SMTP_FROM_NAME');
    const fromEmail = await getConfigValue(env, 'SMTP_FROM_EMAIL') || username || 'noreply@example.com';

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
 * Send a generic email using worker-mailer
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
        name: smtpConfig.fromName,
        email: smtpConfig.fromEmail,
      },
      to: {
        email: options.to,
      },
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
 * Send batch emails (sequential to avoid rate limiting)
 */
export async function sendBatchEmails(
  env: Env,
  emails: Array<{
    to: string;
    subject: string;
    html: string;
    text?: string;
  }>
): Promise<{
  success: number;
  failed: number;
  results: Array<{ to: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ to: string; success: boolean; error?: string }> = [];
  let successCount = 0;
  let failedCount = 0;

  for (const email of emails) {
    try {
      const result = await sendEmail(env, email);
      if (result.success) {
        successCount++;
        results.push({ to: email.to, success: true });
      } else {
        failedCount++;
        results.push({ to: email.to, success: false, error: result.error || 'Unknown error' });
      }
    } catch (error) {
      failedCount++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ to: email.to, success: false, error: message });
    }

    // Small delay to avoid overwhelming SMTP server
    if (emails.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    results: results
  };
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
 * Send 2FA verification code for password reset
 * Returns boolean for backward compatibility with existing callers
 */
export async function sendPasswordReset2FAEmail(
  env: Env,
  userEmail: string,
  verificationCode: string,
  ipAddress: string,
  country: string
): Promise<boolean> {
  const systemTitle = await getSystemTitle(env);
  const subject = `[${systemTitle}] 密碼重設驗證碼`;

  // Format timestamp
  const now = new Date();
  const timestamp = now.toLocaleString('zh-TW', {
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
        body {
          font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          background: #800000;
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.8;
        }
        .code-box {
          background: #f8f9fa;
          border: 2px solid #800000;
          border-radius: 8px;
          padding: 20px;
          margin: 30px 0;
          text-align: center;
        }
        .code-label {
          font-size: 14px;
          color: #666;
          margin-bottom: 10px;
          font-weight: bold;
        }
        .code-value {
          font-family: 'Courier New', Courier, monospace;
          font-size: 32px;
          font-weight: bold;
          color: #800000;
          letter-spacing: 8px;
          padding: 15px;
          background: white;
          border-radius: 5px;
        }
        .security-info {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 20px;
          margin: 20px 0;
        }
        .security-info h3 {
          margin-top: 0;
          color: #856404;
          font-size: 16px;
        }
        .security-info table {
          width: 100%;
          margin: 10px 0;
          border-collapse: collapse;
        }
        .security-info td {
          padding: 8px 0;
          color: #856404;
        }
        .security-info td:first-child {
          font-weight: bold;
          width: 120px;
        }
        .warning {
          background: #f8d7da;
          border-left: 4px solid #dc3545;
          padding: 20px;
          margin: 20px 0;
          color: #721c24;
        }
        .warning h3 {
          margin-top: 0;
          color: #721c24;
          font-size: 16px;
        }
        .warning ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .warning li {
          margin: 8px 0;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>[安全] 密碼重設驗證</h1>
        </div>
        <div class="content">
          <p>有人正在嘗試重設您的帳號密碼。請使用以下驗證碼完成身份驗證：</p>

          <div class="code-box">
            <div class="code-label">驗證碼（12位字元，包含字母與符號）</div>
            <div class="code-value">${verificationCode}</div>
            <p style="font-size: 12px; color: #666; margin-top: 8px; text-align: center;">
              提示：格式 XXXX-XXXX-XXXX（連字號可省略）
            </p>
          </div>

          <div class="security-info">
            <h3>[資訊] 請求資訊</h3>
            <table>
              <tr>
                <td>IP 地址：</td>
                <td>${ipAddress}</td>
              </tr>
              <tr>
                <td>國家/地區：</td>
                <td>${country}</td>
              </tr>
              <tr>
                <td>請求時間：</td>
                <td>${timestamp}</td>
              </tr>
            </table>
          </div>

          <div class="warning">
            <h3>⚠ 重要提醒</h3>
            <ul>
              <li><strong>此驗證碼將在 10分鐘 後過期</strong></li>
              <li>請勿將此驗證碼分享給任何人</li>
              <li><strong>如果這不是您的操作，請立即聯繫系統管理員</strong></li>
              <li>完成驗證後，您將需要選擇專案進行身份確認</li>
            </ul>
          </div>

          <p style="color: #666; font-size: 14px;">
            如果您沒有請求密碼重設，請忽略此郵件並確保您的帳號安全。
          </p>
        </div>
        <div class="footer">
          <p>這是系統自動發送的郵件，請勿直接回覆。</p>
          <p>如有任何問題，請聯繫系統管理員。</p>
          <p>${systemTitle}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail(env, {
    to: userEmail,
    subject: subject,
    html: html
  });
  return result.success;
}

/**
 * Send password reset email with new password
 * Returns boolean for backward compatibility with existing callers
 */
export async function sendPasswordResetEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  newPassword: string
): Promise<boolean> {
  const systemTitle = await getSystemTitle(env);
  const subject = `[${systemTitle}] 密碼已重設`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          background: #800000;
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.8;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .password-box {
          background: #f8f9fa;
          border: 2px solid #800000;
          border-radius: 8px;
          padding: 20px;
          margin: 30px 0;
          text-align: center;
        }
        .password-label {
          font-size: 14px;
          color: #666;
          margin-bottom: 10px;
          font-weight: bold;
        }
        .password-value {
          font-family: 'Courier New', Courier, monospace;
          font-size: 28px;
          font-weight: bold;
          color: #800000;
          letter-spacing: 2px;
          padding: 15px;
          background: white;
          border-radius: 5px;
          word-break: break-all;
        }
        .instructions {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 20px;
          margin: 20px 0;
        }
        .instructions h3 {
          margin-top: 0;
          color: #856404;
        }
        .instructions ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .instructions li {
          margin: 8px 0;
          color: #856404;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
        .warning {
          color: #dc3545;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>[安全] 密碼重設通知</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Dear <strong>${displayName}</strong>，
          </div>
          <p>您的密碼已成功重設。請使用以下新密碼登入系統：</p>

          <div class="password-box">
            <div class="password-label">新密碼</div>
            <div class="password-value">${newPassword}</div>
          </div>

          <div class="instructions">
            <h3>⚠ 重要提示：</h3>
            <ul>
              <li>請立即使用此密碼登入系統</li>
              <li>登入後，建議您前往個人設定修改為您自己的密碼</li>
              <li>請勿將此密碼分享給任何人</li>
              <li class="warning">如果您沒有請求密碼重設，請立即聯繫系統管理員</li>
            </ul>
          </div>

          <p>為了您的帳號安全，請務必在首次登入後更改密碼。</p>
        </div>
        <div class="footer">
          <p>這是系統自動發送的郵件，請勿直接回覆。</p>
          <p>如有任何問題，請聯繫系統管理員。</p>
          <p>評分系統 Scoring System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail(env, {
    to: userEmail,
    subject: subject,
    html: html
  });
  return result.success;
}
