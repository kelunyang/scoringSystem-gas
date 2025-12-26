/**
 * @fileoverview Two-Factor Authentication system
 * @module TwoFactorAuth
 */

/**
 * Generate 6-character alphabetic verification code
 */
function generateVerificationCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

/**
 * Store verification code in two-factor auth sheet
 */
function storeVerificationCode(userEmail, verificationCode) {
  try {
    const twoFactorSheetId = PropertiesService.getScriptProperties().getProperty('TWOFACTOR_SHEET_ID');
    if (!twoFactorSheetId) {
      throw new Error('TWOFACTOR_SHEET_ID not found in properties');
    }
    
    const sheet = SpreadsheetApp.openById(twoFactorSheetId).getActiveSheet();
    const now = getCurrentTimestamp();
    const expiresAt = now + (10 * 60 * 1000); // 10 minutes from now
    
    // Clean up old/expired codes for this user
    cleanupExpiredCodes(userEmail);
    
    // Add new verification code
    const newRow = [
      userEmail,
      verificationCode,
      now,
      expiresAt,
      false, // isUsed
      0,     // attempts
      generateIdWithType('2fa')
    ];
    
    sheet.appendRow(newRow);
    
    return {
      success: true,
      expiresAt: expiresAt
    };
    
  } catch (error) {
    logErr('Store verification code error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verify two-factor authentication code
 */
function verifyTwoFactorCode(userEmail, inputCode) {
  try {
    // Trim whitespace from inputs to avoid copy-paste issues
    userEmail = (userEmail || '').trim();
    inputCode = (inputCode || '').trim();

    const twoFactorSheetId = PropertiesService.getScriptProperties().getProperty('TWOFACTOR_SHEET_ID');
    if (!twoFactorSheetId) {
      throw new Error('TWOFACTOR_SHEET_ID not found in properties');
    }
    
    const sheet = SpreadsheetApp.openById(twoFactorSheetId).getActiveSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find column indexes
    const emailCol = headers.indexOf('userEmail');
    const codeCol = headers.indexOf('verificationCode');
    const createdCol = headers.indexOf('createdTime');
    const expiresCol = headers.indexOf('expiresAt');
    const usedCol = headers.indexOf('isUsed');
    const attemptsCol = headers.indexOf('attempts');
    
    const now = getCurrentTimestamp();
    
    console.log('Verifying 2FA for user:', userEmail, 'Total rows:', data.length);
    
    // Find the most recent unused code for this user
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      
      if (row[emailCol] === userEmail && 
          (row[usedCol] === false || row[usedCol] === 'FALSE' || !row[usedCol]) && 
          Number(row[expiresCol]) > now) {
        
        // Check attempts limit (max 3 attempts)
        const attempts = row[attemptsCol] || 0;
        if (attempts >= 3) {
          continue; // Skip this code, too many attempts
        }
        
        // Increment attempts
        sheet.getRange(i + 1, attemptsCol + 1).setValue(attempts + 1);
        
        // Verify code (convert both to string for comparison)
        const storedCode = String(row[codeCol]);
        const userInputCode = String(inputCode);
        
        console.log('Verifying 2FA code - stored:', storedCode, 'input:', userInputCode);
        
        if (storedCode === userInputCode) {
          // Mark as used
          sheet.getRange(i + 1, usedCol + 1).setValue(true);
          
          return {
            success: true,
            codeId: row[6] // ID column
          };
        } else {
          return {
            success: false,
            error: 'INVALID_CODE',
            message: '驗證碼錯誤',
            attemptsLeft: 3 - (attempts + 1)
          };
        }
      }
    }
    
    return {
      success: false,
      error: 'CODE_NOT_FOUND',
      message: '驗證碼已過期或不存在'
    };
    
  } catch (error) {
    logErr('Verify two-factor code error', error);
    return {
      success: false,
      error: 'SYSTEM_ERROR',
      message: '驗證系統錯誤'
    };
  }
}

/**
 * Clean up expired verification codes for user
 */
function cleanupExpiredCodes(userEmail) {
  try {
    const twoFactorSheetId = PropertiesService.getScriptProperties().getProperty('TWOFACTOR_SHEET_ID');
    if (!twoFactorSheetId) return;
    
    const sheet = SpreadsheetApp.openById(twoFactorSheetId).getActiveSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const emailCol = headers.indexOf('userEmail');
    const expiresCol = headers.indexOf('expiresAt');
    const now = getCurrentTimestamp();
    
    // Delete expired codes for this user (iterate backwards to avoid index issues)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (row[emailCol] === userEmail && row[expiresCol] <= now) {
        sheet.deleteRow(i + 1);
      }
    }
    
  } catch (error) {
    logErr('Cleanup expired codes error', error);
  }
}

/**
 * Send verification code via email
 */
function sendVerificationCodeEmail(userEmail, verificationCode) {
  try {
    console.log('📧 [2FA Email] Starting email send process');
    console.log('📧 [2FA Email] Target:', userEmail);
    console.log('📧 [2FA Email] Code:', verificationCode);

    // Validate email address
    if (!userEmail || !userEmail.includes('@')) {
      console.error('❌ [2FA Email] Invalid email address:', userEmail);
      return {
        success: false,
        error: 'Invalid email address'
      };
    }

    const subject = '兩階段登入驗證碼';
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">兩階段登入驗證</h2>
        <p>您的登入驗證碼為（6位英文字母）：</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #2c3e50; letter-spacing: 8px; font-family: monospace;">${verificationCode}</span>
        </div>
        <p style="color: #666;">
          • 此驗證碼將在 <strong>10分鐘</strong> 後過期<br>
          • 請勿將此驗證碼分享給任何人<br>
          • 如果這不是您的操作，請忽略此email
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          此為系統自動發送的email，請勿回覆。
        </p>
      </div>
    `;

    console.log('📧 [2FA Email] Calling MailApp.sendEmail...');

    // Try sending email
    MailApp.sendEmail({
      to: userEmail,
      subject: subject,
      htmlBody: htmlBody
    });

    console.log('✅ [2FA Email] MailApp.sendEmail completed successfully');

    // Check remaining quota
    try {
      const quota = MailApp.getRemainingDailyQuota();
      console.log('📊 [2FA Email] Remaining daily quota:', quota);

      if (quota <= 0) {
        console.error('⚠️ [2FA Email] WARNING: Daily email quota exhausted!');
        return {
          success: false,
          error: 'Daily email quota exhausted. Please try again tomorrow.'
        };
      }

      if (quota < 10) {
        console.warn('⚠️ [2FA Email] WARNING: Low email quota remaining:', quota);
      }
    } catch (quotaError) {
      console.warn('⚠️ [2FA Email] Could not check quota:', quotaError.message);
    }

    return { success: true };

  } catch (error) {
    console.error('❌ [2FA Email] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    logErr('Send verification code email error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Password verification (Step 1 of 2FA login)
 */
function verifyPasswordAndSend2FA(userEmail, password) {
  try {
    // Validate input
    if (!userEmail || !password) {
      return createErrorResponse('INVALID_INPUT', '沒輸入帳號密碼你怎麼進來這裡的？');
    }
    
    // Sanitize email
    userEmail = sanitizeString(userEmail, 100);
    
    // Get user from database
    const globalData = readGlobalData();
    const user = globalData.users.find(u => 
      u.userEmail === userEmail && u.status === 'active'
    );
    
    if (!user) {
      // Log failed attempt
      logAuthEvent(userEmail, 'login_failed', 'user_not_found');
      return createErrorResponse('AUTHENTICATION_FAILED', '帳號或密碼錯誤，你忘記密碼了？');
    }
    
    // Verify password
    if (!verifyPassword(password, user.password)) {
      // Log failed attempt
      logAuthEvent(userEmail, 'login_failed', 'invalid_password');
      return createErrorResponse('AUTHENTICATION_FAILED', '帳號或密碼錯誤，你忘記密碼了？');
    }
    
    // Password is correct, generate and send 2FA code
    const verificationCode = generateVerificationCode();
    
    // Store verification code
    const storeResult = storeVerificationCode(userEmail, verificationCode);
    if (!storeResult.success) {
      return createErrorResponse('SYSTEM_ERROR', '系統錯誤，無法生成兩階段驗證碼');
    }
    
    // Send email
    const emailResult = sendVerificationCodeEmail(userEmail, verificationCode);
    if (!emailResult.success) {
      return createErrorResponse('EMAIL_ERROR', '系統錯誤，無法寄出兩階段驗證信');
    }
    
    // Log successful password verification
    logAuthEvent(userEmail, '2fa_code_sent', '密碼驗證成功');
    
    return createSuccessResponse({
      message: '兩階段密碼驗證信已寄出',
      expiresAt: storeResult.expiresAt
    });
    
  } catch (error) {
    logErr('兩階段密碼驗證發生錯誤：', error);
    return createErrorResponse('SYSTEM_ERROR', '兩階段驗證系統發生錯誤');
  }
}

/**
 * Complete 2FA login (Step 2 of 2FA login)
 */
function completeTwoFactorLogin(userEmail, verificationCode) {
  try {
    // Validate input
    if (!userEmail || !verificationCode) {
      return createErrorResponse('INVALID_INPUT', 'Email and verification code are required');
    }
    
    // Sanitize inputs
    userEmail = sanitizeString(userEmail, 100);
    verificationCode = sanitizeString(verificationCode, 10);
    
    // Verify 2FA code
    const verifyResult = verifyTwoFactorCode(userEmail, verificationCode);
    if (!verifyResult.success) {
      if (verifyResult.error === 'INVALID_CODE') {
        logAuthEvent(userEmail, '2fa_failed', 'invalid_code');
      } else {
        logAuthEvent(userEmail, '2fa_failed', 'code_expired');
      }
      return createErrorResponse(verifyResult.error, verifyResult.message);
    }
    
    // Get user data for session creation
    const globalData = readGlobalData();
    const user = globalData.users.find(u => 
      u.userEmail === userEmail && u.status === 'active'
    );
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Update last login time
    updateUserLastLogin(user.userId, user.userEmail);
    
    // Create session
    const sessionData = createSession(user.userEmail, user.userId);
    
    // Log successful login
    logAuthEvent(userEmail, 'login_success', sessionData.sessionId);
    
    // Get user's global permissions
    const userPermissions = getUserGlobalPermissions(user.userEmail);
    
    // Get user badges
    const badges = getUserBadges(user.userEmail);
    
    // Get session timeout configuration
    const sessionTimeout = getSessionTimeout();
    
    return createSuccessResponseWithSession(sessionData.sessionId, {
      message: 'Login successful',
      sessionId: sessionData.sessionId,
      user: {
        userId: user.userId,
        userEmail: user.userEmail,
        username: user.username,
        displayName: user.displayName,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
        avatarOptions: user.avatarOptions ? (typeof user.avatarOptions === 'string' ? JSON.parse(user.avatarOptions) : user.avatarOptions) : {},
        createdTime: user.createdTime,
        permissions: userPermissions,
        badges: badges
      },
      session: {
        sessionId: sessionData.sessionId,
        createdTime: sessionData.createdTime,
        lastAccessTime: sessionData.lastAccessTime,
        expiryTime: sessionData.expiryTime,
        sessionTimeout: sessionTimeout  // Include session timeout configuration
      }
    });
    
  } catch (error) {
    logErr('Complete two-factor login error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Login system error');
  }
}

/**
 * Resend verification code
 */
function resendVerificationCode(userEmail) {
  try {
    // Validate input
    if (!userEmail) {
      return createErrorResponse('INVALID_INPUT', 'Email is required');
    }
    
    // Sanitize email
    userEmail = sanitizeString(userEmail, 100);
    
    // Check if user exists
    const globalData = readGlobalData();
    const user = globalData.users.find(u => 
      u.userEmail === userEmail && u.status === 'active'
    );
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Generate new verification code
    const verificationCode = generateVerificationCode();
    
    // Store verification code
    const storeResult = storeVerificationCode(userEmail, verificationCode);
    if (!storeResult.success) {
      return createErrorResponse('SYSTEM_ERROR', 'Failed to generate verification code');
    }
    
    // Send email
    const emailResult = sendVerificationCodeEmail(userEmail, verificationCode);
    if (!emailResult.success) {
      return createErrorResponse('EMAIL_ERROR', 'Failed to send verification code');
    }
    
    // Log resend event
    logAuthEvent(userEmail, '2fa_code_resent', 'resend_requested');
    
    return createSuccessResponse({
      message: 'New verification code sent to your email',
      expiresAt: storeResult.expiresAt
    });
    
  } catch (error) {
    logErr('Resend verification code error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Resend system error');
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateVerificationCode,
    storeVerificationCode,
    verifyTwoFactorCode,
    sendVerificationCodeEmail,
    verifyPasswordAndSend2FA,
    completeTwoFactorLogin,
    resendVerificationCode
  };
}