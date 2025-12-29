// ============================================
// Email Templates for Queue Consumer
// ============================================

/**
 * 登入記錄詳情類型
 */
export interface LoginLogDetail {
  logId: string;
  timestamp: number;
  ipAddress: string;
  country: string;
  city: string | null;  // nullable, not optional
  timezone: string;
  userAgent: string;
  reason: string;
  attemptCount: number;
}

/**
 * 生成登入記錄 HTML 表格
 */
function generateLoginLogsTable(logs: LoginLogDetail[]): string {
  if (!logs || logs.length === 0) {
    return '';
  }

  const rows = logs.map(log => {
    const timestamp = new Date(log.timestamp).toLocaleString('zh-TW', {
      timeZone: log.timezone || 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const location = log.city ? `${log.country}, ${log.city}` : log.country;

    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${timestamp}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${log.ipAddress}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${location}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-size: 12px;">${log.userAgent}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${log.reason}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${log.attemptCount}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="margin: 20px 0;">
      <h4 style="color: #E74C3C; margin-bottom: 10px;">[查詢] 觸發帳號鎖定的登入記錄</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">時間</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">IP 地址</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">位置</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">設備/瀏覽器</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">失敗原因</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">嘗試次數</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * 生成登入記錄純文本列表
 */
function generateLoginLogsText(logs: LoginLogDetail[]): string {
  if (!logs || logs.length === 0) {
    return '';
  }

  const logsList = logs.map((log, index) => {
    const timestamp = new Date(log.timestamp).toLocaleString('zh-TW', {
      timeZone: log.timezone || 'Asia/Taipei'
    });
    const location = log.city ? `${log.country}, ${log.city}` : log.country;

    return `
${index + 1}. 登入嘗試 [${log.logId}]
   時間: ${timestamp}
   IP: ${log.ipAddress}
   位置: ${location}
   設備: ${log.userAgent}
   原因: ${log.reason}
   嘗試次數: ${log.attemptCount}
    `.trim();
  }).join('\n\n');

  return `
觸發帳號鎖定的登入記錄：
${logsList}
  `.trim();
}

/**
 * 構建邀請碼郵件內容
 */
export function buildInvitationEmailContent(
  targetEmail: string,
  invitationCode: string,
  validDays: number,
  createdBy: string,
  webAppUrl: string,
  systemTitle: string
): { subject: string; htmlBody: string; textBody: string } {
  const expiryDate = new Date(Date.now() + (validDays * 24 * 60 * 60 * 1000));
  const expiryDateString = expiryDate.toLocaleDateString('zh-TW');

  const subject = `[${systemTitle}] 註冊邀請`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #FF6600; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .code-box { background: #f8f9fa; border: 2px solid #FF6600; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .invitation-code { font-size: 24px; font-weight: bold; color: #FF6600; letter-spacing: 2px; font-family: monospace; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
    .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 15px 0; color: #856404; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${systemTitle}註冊邀請</h2>
      <p>您已受邀加入我們的${systemTitle}</p>
    </div>

    <div class="content">
      <h3>親愛的用戶，</h3>
      <p>您已收到來自 <strong>${createdBy}</strong> 的${systemTitle}註冊邀請。</p>

      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">您的專屬邀請碼：</p>
        <div class="invitation-code">${invitationCode}</div>
      </div>

      <div class="warning">
        <strong>⚠ 重要提醒：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>此邀請碼專屬於您的電子郵件地址 <strong>${targetEmail}</strong></li>
          <li>邀請碼將於 <strong>${expiryDateString}</strong> 到期</li>
          <li>每個邀請碼僅能使用一次</li>
          <li>請妥善保管您的邀請碼，勿與他人分享</li>
        </ul>
      </div>

      <h4>註冊步驟：</h4>
      <ol>
        <li>點擊下方連結前往註冊頁面</li>
        <li>在登入視窗選擇「我有邀請碼」</li>
        <li>輸入您的邀請碼並按下「驗證」</li>
        <li>完成註冊資訊填寫</li>
      </ol>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${webAppUrl}" style="display: inline-block; background: #FF6600; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">立即註冊</a>
      </div>
    </div>

    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
      <p>如有疑問，請聯繫邀請您的管理員。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
${systemTitle}註冊邀請

親愛的用戶，

您已收到來自 ${createdBy} 的${systemTitle}註冊邀請。

您的專屬邀請碼：${invitationCode}

重要提醒：
- 此邀請碼專屬於您的電子郵件地址 ${targetEmail}
- 邀請碼將於 ${expiryDateString} 到期
- 每個邀請碼僅能使用一次
- 請妥善保管您的邀請碼，勿與他人分享

註冊步驟：
1. 前往註冊頁面：${webAppUrl}
2. 在登入視窗選擇「我有邀請碼」
3. 輸入您的邀請碼並按下「驗證」
4. 完成註冊資訊填寫

---
這是系統自動發送的郵件，請勿直接回覆。
如有疑問，請聯繫邀請您的管理員。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建密碼重置 2FA 郵件內容
 */
export function buildPasswordReset2FAEmailContent(
  userEmail: string,
  code: string,
  ip: string,
  country: string | undefined,
  systemTitle: string,
  webAppUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 密碼重置安全驗證碼`;
  const location = country ? `${country} (${ip})` : ip;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #E74C3C; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .code-box { background: #f8f9fa; border: 2px solid #E74C3C; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .verification-code { font-size: 32px; font-weight: bold; color: #E74C3C; letter-spacing: 4px; font-family: monospace; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
    .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 15px 0; color: #856404; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>密碼重置安全驗證</h2>
      <p>您的帳號安全驗證碼</p>
    </div>

    <div class="content">
      <h3>安全驗證通知</h3>
      <p>我們收到了來自 <strong>${location}</strong> 的密碼重置請求。</p>

      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">您的驗證碼：</p>
        <div class="verification-code">${code}</div>
      </div>

      <div class="warning">
        <strong>⚠ 安全提醒：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>驗證碼有效期限為 <strong>10 分鐘</strong></li>
          <li>如果這不是您本人的操作，請立即聯繫管理員</li>
          <li>請勿將驗證碼告知他人</li>
        </ul>
      </div>

      <p><strong>請求資訊：</strong></p>
      <ul>
        <li>IP 位址：${ip}</li>
        ${country ? `<li>位置：${country}</li>` : ''}
        <li>時間：${new Date().toLocaleString('zh-TW')}</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${webAppUrl}" style="display: inline-block; background: #E74C3C; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">進入系統</a>
      </div>
    </div>

    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
      <p>如有疑問，請聯繫系統管理員。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
密碼重置安全驗證

我們收到了來自 ${location} 的密碼重置請求。

您的驗證碼：${code}

安全提醒：
- 驗證碼有效期限為 10 分鐘
- 如果這不是您本人的操作，請立即聯繫管理員
- 請勿將驗證碼告知他人

請求資訊：
- IP 位址：${ip}
${country ? `- 位置：${country}` : ''}
- 時間：${new Date().toLocaleString('zh-TW')}

進入系統：${webAppUrl}

---
這是系統自動發送的郵件，請勿直接回覆。
如有疑問，請聯繫系統管理員。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建密碼重置成功郵件內容
 */
export function buildPasswordResetEmailContent(
  userEmail: string,
  displayName: string,
  newPassword: string,
  systemTitle: string,
  webAppUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 密碼重置成功`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #27AE60; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .password-box { background: #f8f9fa; border: 2px solid #27AE60; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .new-password { font-size: 24px; font-weight: bold; color: #27AE60; letter-spacing: 2px; font-family: monospace; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
    .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 15px 0; color: #856404; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✓ 密碼重置成功</h2>
      <p>您的新密碼已生成</p>
    </div>

    <div class="content">
      <h3>${displayName}，您好</h3>
      <p>您的密碼已成功重置。請使用以下新密碼登入系統。</p>

      <div class="password-box">
        <p style="margin: 0 0 10px 0; color: #666;">您的新密碼：</p>
        <div class="new-password">${newPassword}</div>
      </div>

      <div class="warning">
        <strong>⚠ 安全建議：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>請立即登入並<strong>修改為您自己的密碼</strong></li>
          <li>請勿與他人分享您的密碼</li>
          <li>建議使用包含大小寫字母、數字和符號的強密碼</li>
          <li>定期更換密碼以保護帳號安全</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${webAppUrl}" style="display: inline-block; background: #27AE60; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">立即登入</a>
      </div>
    </div>

    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
      <p>如有疑問，請聯繫系統管理員。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
密碼重置成功

${displayName}，您好

您的密碼已成功重置。請使用以下新密碼登入系統。

您的新密碼：${newPassword}

安全建議：
- 請立即登入並修改為您自己的密碼
- 請勿與他人分享您的密碼
- 建議使用包含大小寫字母、數字和符號的強密碼
- 定期更換密碼以保護帳號安全

立即登入：${webAppUrl}

---
這是系統自動發送的郵件，請勿直接回覆。
如有疑問，請聯繫系統管理員。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建雙因素驗證碼郵件內容
 */
export function buildTwoFactorCodeEmailContent(
  userEmail: string,
  code: string,
  systemTitle: string,
  webAppUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 雙因素驗證碼`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #3498DB; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .code-box { background: #f8f9fa; border: 2px solid #3498DB; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .verification-code { font-size: 32px; font-weight: bold; color: #3498DB; letter-spacing: 4px; font-family: monospace; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>雙因素驗證</h2>
      <p>您的登入驗證碼</p>
    </div>

    <div class="content">
      <h3>驗證碼通知</h3>
      <p>請使用以下驗證碼完成登入。</p>

      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">您的驗證碼：</p>
        <div class="verification-code">${code}</div>
      </div>

      <p><strong>注意事項：</strong></p>
      <ul>
        <li>驗證碼有效期限為 <strong>10 分鐘</strong></li>
        <li>每個驗證碼僅能使用一次</li>
        <li>如果這不是您本人的操作，請立即聯繫管理員</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${webAppUrl}" style="display: inline-block; background: #3498DB; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">進入系統</a>
      </div>
    </div>

    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
雙因素驗證

請使用以下驗證碼完成登入。

您的驗證碼：${code}

注意事項：
- 驗證碼有效期限為 10 分鐘
- 每個驗證碼僅能使用一次
- 如果這不是您本人的操作，請立即聯繫管理員

進入系統：${webAppUrl}

---
這是系統自動發送的郵件，請勿直接回覆。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建帳號鎖定通知郵件內容
 */
export function buildAccountLockedEmailContent(
  userEmail: string,
  displayName: string,
  reason: string,
  lockType: 'temporary' | 'permanent',
  unlockTime: number | undefined,
  systemTitle: string,
  relatedLogsDetails?: LoginLogDetail[]
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 帳號安全鎖定通知`;
  const lockTypeText = lockType === 'permanent' ? '永久鎖定' : '臨時鎖定';
  const unlockTimeText = unlockTime
    ? new Date(unlockTime).toLocaleString('zh-TW')
    : '請聯繫管理員';

  // Generate login logs table/text if available
  const loginLogsTableHtml = relatedLogsDetails && relatedLogsDetails.length > 0
    ? generateLoginLogsTable(relatedLogsDetails)
    : '';
  const loginLogsText = relatedLogsDetails && relatedLogsDetails.length > 0
    ? `\n\n${generateLoginLogsText(relatedLogsDetails)}`
    : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #E74C3C; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .warning { background: #ffebee; border: 2px solid #E74C3C; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>帳號鎖定通知</h2>
    </div>
    <div class="content">
      <p>您好 <strong>${displayName}</strong>，</p>
      <div class="warning">
        <h3 style="margin-top: 0;">⚠ 您的帳號已被${lockTypeText}</h3>
        <p><strong>鎖定原因：</strong>${reason}</p>
        ${lockType === 'temporary' ? `<p><strong>解鎖時間：</strong>${unlockTimeText}</p>` : ''}
      </div>
      ${loginLogsTableHtml}
      <p>如有疑問，請聯繫系統管理員。</p>
    </div>
    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
${systemTitle} 帳號鎖定通知

您好 ${displayName}，

⚠ 您的帳號已被${lockTypeText}

鎖定原因：${reason}
${lockType === 'temporary' ? `解鎖時間：${unlockTimeText}` : ''}
${loginLogsText}

如有疑問，請聯繫系統管理員。

---
這是系統自動發送的郵件，請勿直接回覆。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建帳號解鎖通知郵件內容
 */
export function buildAccountUnlockedEmailContent(
  userEmail: string,
  displayName: string,
  unlockedBy: string,
  systemTitle: string,
  webAppUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 帳號已解鎖`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #27AE60; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .success { background: #d4edda; border: 2px solid #27AE60; border-radius: 8px; padding: 20px; margin: 20px 0; color: #155724; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✓ 帳號解鎖通知</h2>
    </div>
    <div class="content">
      <p>您好 <strong>${displayName}</strong>，</p>
      <div class="success">
        <h3 style="margin-top: 0;">✓ 您的帳號已被解鎖</h3>
        <p><strong>操作者：</strong>${unlockedBy}</p>
        <p>您現在可以正常登入使用系統。</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${webAppUrl}" style="display: inline-block; background: #27AE60; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">進入系統</a>
      </div>
    </div>
    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
${systemTitle} 帳號解鎖通知

您好 ${displayName}，

✓ 您的帳號已被解鎖

操作者：${unlockedBy}
您現在可以正常登入使用系統。

進入系統：${webAppUrl}

---
這是系統自動發送的郵件，請勿直接回覆。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建通知彙整郵件內容
 */
export function buildNotificationDigestEmailContent(
  userEmail: string,
  displayName: string,
  notifications: Array<{ title: string; content?: string; createdAt: number; type: string }>,
  unreadCount: number,
  periodStart: number,
  periodEnd: number,
  systemTitle: string,
  webAppUrl: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 您有 ${unreadCount} 則未讀通知`;
  const periodStartText = new Date(periodStart).toLocaleString("zh-TW");
  const periodEndText = new Date(periodEnd).toLocaleString("zh-TW");
  const notificationsHtml = notifications.map(n => `<div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #FF6600;"><h4 style="margin: 0 0 8px 0;">${n.title}</h4>${n.content ? `<p>${n.content}</p>` : ""}<small>${new Date(n.createdAt).toLocaleString("zh-TW")}</small></div>`).join("");
  const notificationsText = notifications.map(n => `- ${n.title}
  ${n.content || ""}
  ${new Date(n.createdAt).toLocaleString("zh-TW")}`).join("\n\n");
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; padding: 20px;"><h2>通知彙整</h2><p>${periodStartText} - ${periodEndText}</p><p>您好 <strong>${displayName}</strong>，您有 <strong>${unreadCount}</strong> 則未讀通知：</p>${notificationsHtml}<a href="${webAppUrl}" style="display: inline-block; background: #FF6600; color: white; padding: 12px 24px; margin-top: 20px; text-decoration: none;">查看所有通知</a></body></html>`;
  const textBody = `${systemTitle} 通知彙整
${periodStartText} - ${periodEndText}

您好 ${displayName}，您有 ${unreadCount} 則未讀通知：

${notificationsText}

查看所有通知：${webAppUrl}`.trim();
  return { subject, htmlBody, textBody };
}

/**
 * 構建安全巡邏報告郵件內容
 */
export function buildSecurityReportEmailContent(
  adminEmail: string,
  reportHtml: string,
  reportText: string,
  summary: { expiredCodesCount: number; failedAttemptsCount: number; issuesFound: number },
  systemTitle: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 安全巡邏報告 - ${summary.issuesFound} 個問題`;
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; padding: 20px;"><h2>安全巡邏報告</h2><div style="background: #ecf0f1; padding: 20px; margin: 20px 0;"><h3>摘要</h3><ul><li>過期驗證碼：${summary.expiredCodesCount} 個</li><li>失敗登入嘗試：${summary.failedAttemptsCount} 次</li><li>發現問題：${summary.issuesFound} 個</li></ul></div>${reportHtml}</body></html>`;
  const textBody = `${systemTitle} 安全巡邏報告

摘要：
- 過期驗證碼：${summary.expiredCodesCount} 個
- 失敗登入嘗試：${summary.failedAttemptsCount} 次
- 發現問題：${summary.issuesFound} 個

${reportText}`.trim();
  return { subject, htmlBody, textBody };
}

/**
 * 構建管理員通知郵件內容
 */
export function buildAdminNotificationEmailContent(
  adminEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  priority: "low" | "normal" | "high" | undefined,
  systemTitle: string
): { subject: string; htmlBody: string; textBody: string } {
  const priorityPrefix = priority === "high" ? "[緊急] " : priority === "low" ? "[一般] " : "";
  const finalSubject = `[${systemTitle}] ${priorityPrefix}${subject}`;
  const wrappedHtmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; padding: 20px;"><h2 style="color: ${priority === "high" ? "#E74C3C" : "#3498DB"};">${priorityPrefix}${subject}</h2><div>${htmlBody}</div></body></html>`;
  const wrappedTextBody = `${systemTitle} ${priorityPrefix}${subject}

${textBody}`.trim();
  return { subject: finalSubject, htmlBody: wrappedHtmlBody, textBody: wrappedTextBody };
}

/**
 * 構建安全警報郵件內容 (給管理員)
 */
export function buildSecurityAlertEmailContent(
  targetUser: string,
  alertType: string,
  reason: string,
  ipAddress: string,
  country: string,
  lockUntil: number | undefined,
  threats: any[] | undefined,
  systemTitle: string,
  relatedLogsDetails?: LoginLogDetail[]
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] [安全警報] ${alertType} - ${targetUser}`;

  // Generate login logs table/text if available
  const loginLogsTableHtml = relatedLogsDetails && relatedLogsDetails.length > 0
    ? generateLoginLogsTable(relatedLogsDetails)
    : '';
  const loginLogsText = relatedLogsDetails && relatedLogsDetails.length > 0
    ? `\n\n${generateLoginLogsText(relatedLogsDetails)}`
    : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #E74C3C; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .alert-box { background: #ffebee; border-left: 4px solid #E74C3C; padding: 20px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>安全警報</h2>
    </div>
    <div class="content">
      <div class="alert-box">
        <h3>${alertType}</h3>
        <p><strong>目標用戶：</strong>${targetUser}</p>
        <p><strong>原因：</strong>${reason}</p>
        <p><strong>IP 地址：</strong>${ipAddress}</p>
        <p><strong>國家：</strong>${country}</p>
        ${lockUntil ? `<p><strong>鎖定至：</strong>${new Date(lockUntil).toLocaleString('zh-TW')}</p>` : ''}
        ${threats && threats.length > 0 ? `<p><strong>威脅詳情：</strong><pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(threats, null, 2)}</pre></p>` : ''}
      </div>
      ${loginLogsTableHtml}
      <p style="color: #666; font-size: 14px; margin-top: 20px;">請審查上述安全事件並採取適當的行動。</p>
    </div>
    <div class="footer">
      <p>這是系統自動發送的安全警報郵件。</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
安全警報：${alertType}

目標用戶：${targetUser}
原因：${reason}
IP 地址：${ipAddress}
國家：${country}
${lockUntil ? `鎖定至：${new Date(lockUntil).toLocaleString('zh-TW')}` : ''}
${threats && threats.length > 0 ? `\n威脅詳情：\n${JSON.stringify(threats, null, 2)}` : ''}
${loginLogsText}

請審查上述安全事件並採取適當的行動。

---
這是系統自動發送的安全警報郵件。
  `.trim();

  return { subject, htmlBody, textBody };
}

/**
 * 構建成果被教師強制撤回通知郵件內容
 */
export function buildSubmissionForceWithdrawnEmailContent(
  targetEmail: string,
  displayName: string,
  projectName: string,
  stageName: string,
  groupName: string,
  reason: string,
  teacherEmail: string,
  wasApproved: boolean,
  systemTitle: string
): { subject: string; htmlBody: string; textBody: string } {
  const subject = `[${systemTitle}] 作品被教師撤回通知`;

  const approvedWarning = wasApproved
    ? `<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 15px 0; color: #856404;">
        <strong>⚠ 注意：</strong>此作品在撤回前已獲得核准，您的階段成績可能會受到影響。如有疑問，請聯繫授課教師。
      </div>`
    : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #E74C3C; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px; }
    .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .reason-box { background: #ffebee; border-left: 4px solid #E74C3C; padding: 20px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>作品撤回通知</h2>
      <p>您的組別作品已被教師強制撤回</p>
    </div>

    <div class="content">
      <h3>${displayName}，您好：</h3>
      <p>您所屬的組別在專案「<strong>${projectName}</strong>」中提交的作品已被教師強制撤回，詳細資訊如下：</p>

      <div class="info-box">
        <p><strong>📋 專案名稱：</strong>${projectName}</p>
        <p><strong>📌 階段名稱：</strong>${stageName}</p>
        <p><strong>👥 組別名稱：</strong>${groupName}</p>
        <p><strong>👨‍🏫 操作教師：</strong>${teacherEmail}</p>
        <p><strong>🕐 撤回時間：</strong>${new Date().toLocaleString('zh-TW')}</p>
      </div>

      <div class="reason-box">
        <strong>📝 撤回原因：</strong>
        <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${reason}</p>
      </div>

      ${approvedWarning}

      <h4>📌 後續步驟：</h4>
      <ol>
        <li>請詳閱撤回原因，了解作品被撤回的具體問題</li>
        <li>與組員討論如何修正作品內容</li>
        <li>在階段結束前重新提交符合要求的作品</li>
        <li>如有任何疑問，請聯繫授課教師</li>
      </ol>

      <p style="color: #666; margin-top: 20px;">如果您對此撤回決定有疑義，請直接與授課教師聯繫討論。</p>
    </div>

    <div class="footer">
      <p>這是系統自動發送的郵件，請勿直接回覆。</p>
      <p>如有疑問，請聯繫您的授課教師。</p>
    </div>
  </div>
</body>
</html>
  `;

  const approvedWarningText = wasApproved
    ? '\n⚠ 注意：此作品在撤回前已獲得核准，您的階段成績可能會受到影響。如有疑問，請聯繫授課教師。\n'
    : '';

  const textBody = `
作品撤回通知

${displayName}，您好：

您所屬的組別在專案「${projectName}」中提交的作品已被教師強制撤回。

詳細資訊：
- 專案名稱：${projectName}
- 階段名稱：${stageName}
- 組別名稱：${groupName}
- 操作教師：${teacherEmail}
- 撤回時間：${new Date().toLocaleString('zh-TW')}

撤回原因：
${reason}
${approvedWarningText}
後續步驟：
1. 請詳閱撤回原因，了解作品被撤回的具體問題
2. 與組員討論如何修正作品內容
3. 在階段結束前重新提交符合要求的作品
4. 如有任何疑問，請聯繫授課教師

如果您對此撤回決定有疑義，請直接與授課教師聯繫討論。

---
這是系統自動發送的郵件，請勿直接回覆。
如有疑問，請聯繫您的授課教師。
  `.trim();

  return { subject, htmlBody, textBody };
}

