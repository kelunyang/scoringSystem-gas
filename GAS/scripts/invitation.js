/**
 * @fileoverview Invitation code system for user registration
 * @module Invitation
 */

// In-memory cache for invitation codes
const invitationCache = new Map();
const INVITATION_CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a new invitation code for a specific email
 */
function generateInvitationCode(createdBy, targetEmail, validDays = 7, defaultTags = [], defaultGlobalGroups = []) {
  try {
    // Check email quota early to avoid creating invitations if we can't send emails
    const remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota <= 5) { // Keep some buffer
      logWrn('Low email quota, creating invitation but may not send email', { 
        remainingQuota, 
        targetEmail 
      });
    }
    
    // Validate input
    if (!createdBy) {
      return createErrorResponse('INVALID_INPUT', 'Creator email is required');
    }
    
    if (!targetEmail) {
      return createErrorResponse('INVALID_INPUT', 'Target email is required');
    }
    
    if (!validateEmail(createdBy)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid creator email format');
    }
    
    if (!validateEmail(targetEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid target email format');
    }
    
    // Check if target email already has an active invitation
    const existingInvitation = getActiveInvitationByEmail(targetEmail);
    if (existingInvitation) {
      return createErrorResponse('INVITATION_EXISTS', 'Active invitation already exists for this email');
    }
    
    // Check if target email is already registered
    const globalData = readGlobalData();
    const existingUser = globalData.users.find(u => u.userEmail === targetEmail);
    if (existingUser) {
      return createErrorResponse('USER_EXISTS', 'User with this email already exists');
    }
    
    // Check daily limit
    const today = new Date().toDateString();
    const dailyLimit = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_INVITES_PER_DAY') || '50');
    const todayCount = getTodayInvitationCount(createdBy, today);
    
    if (todayCount >= dailyLimit) {
      return createErrorResponse('LIMIT_EXCEEDED', `Daily invitation limit (${dailyLimit}) exceeded`);
    }
    
    // Generate invitation data
    const invitationCode = generateReadableCode();
    const hashedCode = hashInvitationToken(invitationCode);
    const timestamp = getCurrentTimestamp();
    const validityPeriod = parseInt(PropertiesService.getScriptProperties().getProperty('INVITE_CODE_TIMEOUT') || '604800000'); // 7 days
    
    // Create a masked version for display (show last 4 characters)
    const displayCode = invitationCode.substring(0, invitationCode.length - 4).replace(/[A-Z0-9]/g, '*') + invitationCode.substring(invitationCode.length - 4);
    
    const invitationData = {
      invitationId: generateIdWithType('invitation'),
      invitationCode: hashedCode, // Store hashed version
      displayCode: displayCode, // Store masked version for display
      targetEmail: targetEmail, // Store target email
      createdBy: createdBy,
      createdTime: timestamp,
      expiryTime: timestamp + (validDays * 24 * 60 * 60 * 1000),
      status: 'active',
      usedTime: null,
      emailSent: false,
      emailSentTime: null,
      defaultTags: Array.isArray(defaultTags) ? defaultTags : [], // Store default tags for new users
      defaultGlobalGroups: Array.isArray(defaultGlobalGroups) ? defaultGlobalGroups : [], // Store default global groups for new users
      metadata: safeJsonStringify({
        validDays: validDays,
        dailyCount: todayCount + 1,
        defaultTagCount: Array.isArray(defaultTags) ? defaultTags.length : 0,
        defaultGlobalGroupCount: Array.isArray(defaultGlobalGroups) ? defaultGlobalGroups.length : 0
      })
    };
    
    // Store in dedicated InvitationCodes table
    addRowToSheet(null, 'InvitationCodes', {
      invitationId: invitationData.invitationId,
      invitationCode: invitationData.invitationCode, // Store hashed code
      displayCode: invitationData.displayCode, // Store masked display version
      targetEmail: invitationData.targetEmail, // Store target email
      createdBy: invitationData.createdBy,
      createdTime: invitationData.createdTime,
      expiryTime: invitationData.expiryTime,
      status: invitationData.status,
      usedTime: invitationData.usedTime,
      emailSent: invitationData.emailSent,
      emailSentTime: invitationData.emailSentTime,
      defaultTags: safeJsonStringify(invitationData.defaultTags),
      defaultGlobalGroups: safeJsonStringify(invitationData.defaultGlobalGroups),
      metadata: invitationData.metadata
    });
    
    // Log invitation creation
    logInvitationEvent(createdBy, 'invitation_created', invitationData.invitationId);
    
    // Send invitation email (with permission check)
    let actualEmailSent = false;
    try {
      // Check if we have email permissions
      const hasEmailPermission = checkEmailPermission();
      if (hasEmailPermission) {
        const emailSent = sendInvitationEmail(targetEmail, invitationCode, validDays, createdBy);
        if (emailSent) {
          // Update invitation record to mark email as sent
          updateSheetRow(null, 'InvitationCodes', 'invitationId', invitationData.invitationId, {
            emailSent: true,
            emailSentTime: getCurrentTimestamp()
          });
          actualEmailSent = true;
          logInfo('Invitation email sent successfully', { targetEmail, invitationId: invitationData.invitationId });
        } else {
          logWrn('Email sending failed', { 
            targetEmail, 
            invitationId: invitationData.invitationId 
          });
        }
      } else {
        logWrn('Email permissions not granted, skipping email send', { 
          targetEmail, 
          invitationId: invitationData.invitationId
        });
      }
    } catch (emailError) {
      logWrn('Failed to send invitation email', { 
        targetEmail, 
        invitationId: invitationData.invitationId,
        error: emailError.message 
      });
    }
    
    return createSuccessResponse({
      invitationId: invitationData.invitationId,
      invitationCode: invitationCode, // Return the original readable code
      targetEmail: targetEmail,
      expiryTime: invitationData.expiryTime,
      validDays: validDays,
      defaultTags: invitationData.defaultTags,
      defaultGlobalGroups: invitationData.defaultGlobalGroups,
      emailSent: actualEmailSent // Report actual email sending status
    });
    
  } catch (error) {
    console.error('Generate invitation error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to generate invitation code');
  }
}

/**
 * Validate an invitation code for a specific email (new two-step process)
 */
function validateInvitationCodeForEmail(invitationCode, userEmail) {
  try {
    if (!invitationCode) {
      return createErrorResponse('INVALID_INPUT', 'Invitation code is required');
    }
    
    if (!userEmail) {
      return createErrorResponse('INVALID_INPUT', 'User email is required');
    }
    
    if (!validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    // Sanitize input
    invitationCode = invitationCode.trim().toUpperCase();
    userEmail = userEmail.trim().toLowerCase();
    
    // Hash the invitation code for comparison
    const hashedCode = hashInvitationToken(invitationCode);
    
    // Get invitation from database
    const globalData = readGlobalData();
    const invitation = globalData.invitationCodes.find(inv => 
      inv && 
      inv.invitationCode === hashedCode &&
      inv.status === 'active'
    );
    
    if (!invitation) {
      return createErrorResponse('INVALID_INVITATION', 'Invalid invitation code');
    }
    
    // Check if invitation is for this specific email
    if (invitation.targetEmail !== userEmail) {
      return createErrorResponse('EMAIL_MISMATCH', 'This invitation code is not for your email address');
    }
    
    // Check if expired
    if (Date.now() > invitation.expiryTime) {
      return createErrorResponse('INVITATION_EXPIRED', 'Invitation code has expired');
    }
    
    // Check if already used (simple status check)
    if (invitation.status === 'used') {
      return createErrorResponse('INVITATION_USED', 'Invitation code has already been used');
    }
    
    // Return invitation details for registration
    return createSuccessResponse({
      invitationId: invitation.invitationId,
      targetEmail: invitation.targetEmail,
      expiryTime: invitation.expiryTime,
      createdBy: invitation.createdBy,
      defaultTags: safeJsonParse(invitation.defaultTags, []),
      defaultGlobalGroups: safeJsonParse(invitation.defaultGlobalGroups, [])
    });
    
  } catch (error) {
    logErr('Validate invitation code for email error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to validate invitation code');
  }
}

/**
 * Validate an invitation code (original function - kept for compatibility)
 */
function validateInvitationCode(invitationCode) {
  try {
    if (!invitationCode) {
      return createErrorResponse('INVALID_INPUT', 'Invitation code is required');
    }
    
    // Sanitize input
    invitationCode = invitationCode.trim().toUpperCase();
    
    // Check cache first
    const cacheKey = 'invite_' + invitationCode;
    if (invitationCache.has(cacheKey)) {
      const cached = invitationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < INVITATION_CACHE_TIMEOUT) {
        if (cached.valid) {
          return createSuccessResponse(cached.data);
        } else {
          return createErrorResponse('INVALID_INVITATION', cached.reason);
        }
      }
    }
    
    // Get all invitations from database
    const globalData = readGlobalData();
    const invitations = globalData.invitationCodes
      .filter(invitation => invitation && invitation.status === 'active')
      .map(invitation => {
        return {
          ...invitation,
          usedCount: parseInt(invitation.usedCount) || 0,
          defaultTags: safeJsonParse(invitation.defaultTags) || [],
          defaultGlobalGroups: safeJsonParse(invitation.defaultGlobalGroups) || [],
          metadata: safeJsonParse(invitation.metadata) || {}
        };
      });
    
    // Find matching invitation
    const hashedCode = hashInvitationToken(invitationCode);
    const invitation = invitations.find(inv => 
      constantTimeEquals(inv.invitationCode, hashedCode)
    );
    
    if (!invitation) {
      const cacheData = { valid: false, reason: 'Invitation code not found' };
      invitationCache.set(cacheKey, { ...cacheData, timestamp: Date.now() });
      return createErrorResponse('INVALID_INVITATION', 'Invitation code not found');
    }
    
    // Check expiry
    if (invitation.expiryTime < getCurrentTimestamp()) {
      const cacheData = { valid: false, reason: 'Invitation code expired' };
      invitationCache.set(cacheKey, { ...cacheData, timestamp: Date.now() });
      return createErrorResponse('INVITATION_EXPIRED', 'Invitation code has expired');
    }
    
    // Check usage limit
    if (invitation.usedCount >= invitation.maxUses) {
      const cacheData = { valid: false, reason: 'Invitation code fully used' };
      invitationCache.set(cacheKey, { ...cacheData, timestamp: Date.now() });
      return createErrorResponse('INVITATION_USED', 'Invitation code has been fully used');
    }
    
    // Cache valid result
    const responseData = {
      invitationId: invitation.invitationId,
      createdBy: invitation.createdBy,
      remainingUses: invitation.maxUses - invitation.usedCount,
      expiryTime: invitation.expiryTime,
      defaultTags: invitation.defaultTags || [] // Include default tags for user assignment
    };
    
    invitationCache.set(cacheKey, {
      valid: true,
      data: responseData,
      timestamp: Date.now()
    });
    
    return createSuccessResponse(responseData);
    
  } catch (error) {
    console.error('Validate invitation error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to validate invitation code');
  }
}

/**
 * Use an invitation code (mark as used)
 */
function useInvitationCode(invitationCode, userEmail) {
  try {
    // First validate the code
    const validation = validateInvitationCode(invitationCode);
    if (!validation.success) {
      return validation;
    }
    
    const invitationId = validation.data.invitationId;
    
    // Get the invitation data
    const globalData = readGlobalData();
    const invitation = globalData.invitationCodes.find(inv => inv.invitationId === invitationId);
    
    if (!invitation) {
      return createErrorResponse('INVALID_INVITATION', 'Invitation not found');
    }
    
    // Calculate current usage count from usage records
    const usageRecordCount = globalData.invitationUsages
      .filter(usage => usage.invitationId === invitationId).length;
    
    // For backward compatibility: consider both stored count and usage records
    const storedCount = parseInt(invitation.usedCount) || 0;
    const currentUsageCount = Math.max(storedCount, usageRecordCount);
    
    // Double-check availability
    if (currentUsageCount >= invitation.maxUses) {
      return createErrorResponse('INVITATION_USED', 'Invitation code has been fully used');
    }
    
    // Update invitation usage count and status
    const usedTime = getCurrentTimestamp();
    const newUsedCount = currentUsageCount + 1;
    const newStatus = newUsedCount >= invitation.maxUses ? 'used' : 'active';

    updateSheetRow(null, 'InvitationCodes', 'invitationId', invitationId, {
      lastUsedTime: usedTime,
      usedCount: newUsedCount,
      status: newStatus
    });
    
    // Clear cache
    const cacheKey = 'invite_' + invitationCode.trim().toUpperCase();
    invitationCache.delete(cacheKey);
    
    // Log usage
    logInvitationEvent(userEmail, 'invitation_used', invitationId, invitation.createdBy);
    
    return createSuccessResponse({
      invitationId: invitationId,
      remainingUses: invitation.maxUses - newUsedCount,
      createdBy: invitation.createdBy,
      defaultTags: safeJsonParse(invitation.defaultTags) || [], // Return parsed default tags for user assignment
      defaultGlobalGroups: safeJsonParse(invitation.defaultGlobalGroups) || [] // Return parsed default global groups for user assignment
    });
    
  } catch (error) {
    console.error('Use invitation error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to use invitation code');
  }
}

/**
 * List invitations created by a user
 */
function getUserInvitations(userEmail) {
  try {
    if (!userEmail || !validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Valid user email is required');
    }
    
    const globalData = readGlobalData();
    const invitations = globalData.invitationCodes
      .filter(invitation => invitation && invitation.createdBy === userEmail)
      .map(invitation => {
        return {
          invitationId: invitation.invitationId,
          invitationCode: invitation.displayCode || '****-****-****', // Return display code, not the hash
          targetEmail: invitation.targetEmail, // Show target email
          createdTime: invitation.createdTime,
          expiryTime: invitation.expiryTime,
          status: invitation.status,
          usedTime: invitation.usedTime,
          emailSent: invitation.emailSent,
          emailSentTime: invitation.emailSentTime,
          defaultTags: safeJsonParse(invitation.defaultTags) || [],
          defaultGlobalGroups: safeJsonParse(invitation.defaultGlobalGroups) || []
        };
      })
      .sort((a, b) => b.createdTime - a.createdTime);
    
    return createSuccessResponse(invitations);
    
  } catch (error) {
    console.error('Get user invitations error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user invitations');
  }
}

/**
 * Get all invitations (admin only)
 */
function getAllInvitations() {
  try {
    const globalData = readGlobalData();
    const invitations = globalData.invitationCodes
      .filter(invitation => invitation && invitation.status !== 'deleted')
      .map(invitation => {
        return {
          invitationId: invitation.invitationId,
          invitationCode: invitation.displayCode || '****-****-****', // Return display code, not the hash
          targetEmail: invitation.targetEmail, // Show target email
          createdBy: invitation.createdBy,
          createdTime: invitation.createdTime,
          expiryTime: invitation.expiryTime,
          status: invitation.status,
          usedTime: invitation.usedTime,
          emailSent: invitation.emailSent,
          emailSentTime: invitation.emailSentTime,
          defaultTags: safeJsonParse(invitation.defaultTags) || [],
          defaultGlobalGroups: safeJsonParse(invitation.defaultGlobalGroups) || []
        };
      })
      .sort((a, b) => b.createdTime - a.createdTime);
    
    return createSuccessResponse(invitations);
    
  } catch (error) {
    console.error('Get all invitations error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get invitations');
  }
}

/**
 * Deactivate an invitation code
 */
function deactivateInvitation(invitationId, userEmail) {
  try {
    if (!invitationId) {
      return createErrorResponse('INVALID_INPUT', 'Invitation ID is required');
    }
    
    const globalData = readGlobalData();
    const invitation = globalData.invitationCodes.find(inv => inv.invitationId === invitationId);
    
    if (!invitation) {
      return createErrorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }
    
    // Check if user is the creator
    if (invitation.createdBy !== userEmail) {
      return createErrorResponse('ACCESS_DENIED', 'Only the creator can deactivate this invitation');
    }
    
    // Update status
    updateSheetRow(null, 'InvitationCodes', 'invitationId', invitationId, {
      status: 'deactivated'
    });
    
    // Clear cache
    invitationCache.clear();
    
    // Log deactivation
    logInvitationEvent(userEmail, 'invitation_deactivated', invitationId);
    
    return createSuccessResponse(null, 'Invitation deactivated successfully');
    
  } catch (error) {
    console.error('Deactivate invitation error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to deactivate invitation');
  }
}

/**
 * Delete an invitation code (soft delete)
 */
function deleteInvitation(invitationId, userEmail) {
  try {
    if (!invitationId) {
      return createErrorResponse('INVALID_INPUT', 'Invitation ID is required');
    }
    
    const globalData = readGlobalData();
    const invitation = globalData.invitationCodes.find(inv => inv.invitationId === invitationId);
    
    if (!invitation) {
      return createErrorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }
    
    // Check if user has permission to delete (creator or admin)
    const isAdmin = isSystemAdmin(userEmail);
    
    if (invitation.createdBy !== userEmail && !isAdmin) {
      return createErrorResponse('ACCESS_DENIED', 'Only the creator or admin can delete this invitation');
    }
    
    // Soft delete - mark as deleted
    updateSheetRow(null, 'InvitationCodes', 'invitationId', invitationId, {
      status: 'deleted',
      deletedTime: Date.now(),
      deletedBy: userEmail
    });
    
    // Clear cache
    invitationCache.clear();
    
    // Log deletion
    logInvitationEvent(userEmail, 'invitation_deleted', invitationId);
    
    return createSuccessResponse(null, 'Invitation deleted successfully');
    
  } catch (error) {
    console.error('Delete invitation error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete invitation');
  }
}

/**
 * Generate a readable invitation code
 */
function generateReadableCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Only letters, exclude confusing characters (I, O)
  const segments = 3;
  const segmentLength = 4;
  const code = [];
  
  for (let i = 0; i < segments; i++) {
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code.push(segment);
  }
  
  return code.join('-');
}

/**
 * Get today's invitation count for a user
 */
function getTodayInvitationCount(userEmail, today) {
  try {
    const globalData = readGlobalData();
    const todayStart = new Date(today).getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000);
    
    const count = globalData.invitationCodes
      .filter(invitation => 
        invitation && 
        invitation.createdBy === userEmail &&
        invitation.createdTime >= todayStart &&
        invitation.createdTime < todayEnd
      ).length;
    
    return count;
    
  } catch (error) {
    console.warn('Get today invitation count error:', error.message);
    return 0;
  }
}

/**
 * Clean up expired invitations
 */
function cleanupExpiredInvitations() {
  try {
    const currentTime = getCurrentTimestamp();
    const globalData = readGlobalData();
    let cleanupCount = 0;
    
    const expiredInvitations = globalData.invitationCodes
      .filter(invitation => 
        invitation && 
        invitation.expiryTime < currentTime && 
        invitation.status === 'active'
      );
    
    expiredInvitations.forEach(invitation => {
      updateSheetRow(null, 'InvitationCodes', 'invitationId', invitation.invitationId, {
        status: 'expired'
      });
      cleanupCount++;
    });
    
    // Clear cache
    invitationCache.clear();
    
    console.log(`Cleaned up ${cleanupCount} expired invitations`);
    return cleanupCount;
    
  } catch (error) {
    console.error('Cleanup expired invitations error:', error.message);
    return 0;
  }
}

/**
 * Log invitation events
 */
function logInvitationEvent(userEmail, action, invitationId, additionalInfo = null) {
  try {
    const logEntry = logOperation(userEmail, action, 'invitation', invitationId, {
      additionalInfo: additionalInfo
    });
    
    console.log('Invitation Event:', logEntry);
    
  } catch (error) {
    console.warn('Failed to log invitation event:', error.message);
  }
}

/**
 * Check if an email already has an active invitation
 */
function getActiveInvitationByEmail(targetEmail) {
  try {
    const globalData = readGlobalData();
    const currentTime = Date.now();
    
    return globalData.invitationCodes.find(invitation => 
      invitation && 
      invitation.targetEmail === targetEmail &&
      invitation.status === 'active' &&
      invitation.expiryTime > currentTime &&
      invitation.usedCount < invitation.maxUses
    );
  } catch (error) {
    logWrn('Get active invitation by email error', { error: error.message });
    return null;
  }
}

/**
 * Get web app URL from Properties Service
 */
function getWebAppUrlFromProperties() {
  try {
    const webAppUrl = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
    if (webAppUrl) {
      return webAppUrl;
    }
    
    // Fallback to ScriptApp method if not set in properties
    return ScriptApp.getService().getUrl();
  } catch (error) {
    console.warn('Failed to get web app URL from properties, using fallback:', error.message);
    return ScriptApp.getService().getUrl();
  }
}

/**
 * Check if we have email sending permissions
 */
function checkEmailPermission() {
  try {
    // Try to check if we can use MailApp
    // This is a lightweight check that won't throw permission errors
    const quotaRemaining = MailApp.getRemainingDailyQuota();
    return quotaRemaining >= 0;
  } catch (e) {
    // If we get a permission error, we don't have email access
    return false;
  }
}

/**
 * Send invitation email to target user
 */
function sendInvitationEmail(targetEmail, invitationCode, validDays, createdBy) {
  try {
    const expiryDate = new Date(Date.now() + (validDays * 24 * 60 * 60 * 1000));
    const expiryDateString = expiryDate.toLocaleDateString('zh-TW');
    
    const subject = '評分系統註冊邀請';
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
            <h2>🎯 評分系統註冊邀請</h2>
            <p>您已受邀加入我們的評分系統</p>
          </div>
          
          <div class="content">
            <h3>親愛的用戶，</h3>
            <p>您已收到來自 <strong>${createdBy}</strong> 的評分系統註冊邀請。</p>
            
            <div class="code-box">
              <p style="margin: 0 0 10px 0; color: #666;">您的專屬邀請碼：</p>
              <div class="invitation-code">${invitationCode}</div>
            </div>
            
            <div class="warning">
              <strong>⚠️ 重要提醒：</strong>
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
              <a href="${getWebAppUrlFromProperties()}" style="display: inline-block; background: #FF6600; color: white; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold;">立即註冊</a>
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

    // Try to send email with rate limiting protection
    try {
      // Check remaining quota before attempting to send
      const remainingQuota = MailApp.getRemainingDailyQuota();
      if (remainingQuota <= 0) {
        logWrn('Daily email quota exceeded', { targetEmail, remainingQuota });
        return false;
      }
      
      // Small delay between emails when processing in batch
      Utilities.sleep(1000); // 1 second delay between emails
      
      // Use MailApp only (simpler and more reliable)
      MailApp.sendEmail({
        to: targetEmail,
        subject: subject,
        htmlBody: htmlBody,
        name: '評分系統'
      });
      
      logInfo('Email sent successfully via MailApp', { targetEmail });
      return true;
      
    } catch (error) {
      // Log the specific error for debugging
      logErr('MailApp send email failed', { 
        targetEmail, 
        error: error.toString()
      });
      
      // Check if it's a rate limiting error
      if (error.toString().includes('Service invoked too many times')) {
        logWrn('Rate limiting detected - need to wait longer between emails', { targetEmail });
      }
      
      return false;
    }

  } catch (error) {
    logErr('Send invitation email error', { targetEmail, error: error.message });
    return false;
  }
}

/**
 * Generate batch invitation codes (for less than 50 emails)
 * This function handles multiple emails in a single request with automatic email sending
 */
function generateBatchInvitationCodes(createdBy, targetEmails, validDays = 7, defaultTags = [], defaultGlobalGroups = []) {
  try {
    // Validate inputs
    if (!createdBy) {
      return createErrorResponse('INVALID_INPUT', 'Creator email is required');
    }
    
    if (!targetEmails || !Array.isArray(targetEmails) || targetEmails.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'Target emails array is required');
    }
    
    if (targetEmails.length > 50) {
      return createErrorResponse('INVALID_INPUT', 'Maximum 50 emails allowed per batch');
    }
    
    const results = [];
    const errors = [];
    
    // Process each email
    for (let i = 0; i < targetEmails.length; i++) {
      const targetEmail = targetEmails[i];
      
      try {
        // Generate invitation for this email
        const response = generateInvitationCode(createdBy, targetEmail, validDays, defaultTags, defaultGlobalGroups);
        
        if (response.success) {
          results.push({
            email: targetEmail,
            invitationCode: response.data.invitationCode,
            expiryTime: response.data.expiryTime,
            emailSent: response.data.emailSent
          });
        } else {
          errors.push(`${targetEmail}: ${response.error?.message || '未知錯誤'}`);
        }
        
      } catch (error) {
        errors.push(`${targetEmail}: ${error.message}`);
        logErr('Batch invitation generation error for email', { targetEmail, error: error.message });
      }
    }
    
    return createSuccessResponse({
      results: results,
      errors: errors,
      totalRequested: targetEmails.length,
      totalGenerated: results.length,
      totalErrors: errors.length
    });
    
  } catch (error) {
    logErr('Generate batch invitation codes error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to generate batch invitation codes');
  }
}

/**
 * Test function to trigger email authorization
 * Run this in the GAS editor to grant email permissions
 */
function testEmailAuthorization() {
  try {
    // This will trigger the authorization prompt
    const testEmail = Session.getActiveUser().getEmail() || 'test@example.com';
    
    MailApp.sendEmail({
      to: testEmail,
      subject: '測試郵件授權',
      body: '這是一封測試郵件，用於授權 Google Apps Script 發送郵件功能。\n\n如果你收到這封郵件，表示授權成功！'
    });
    
    return '郵件發送成功！已獲得授權。';
  } catch (error) {
    return '需要授權：' + error.toString();
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateInvitationCode,
    generateBatchInvitationCodes,
    validateInvitationCode,
    validateInvitationCodeForEmail,
    useInvitationCode,
    getUserInvitations,
    getAllInvitations,
    deactivateInvitation,
    cleanupExpiredInvitations,
    getActiveInvitationByEmail,
    sendInvitationEmail
  };
}