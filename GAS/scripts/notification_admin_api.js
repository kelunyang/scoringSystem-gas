/**
 * @fileoverview Admin API for notification management
 * @module NotificationAdminAPI
 */

/**
 * Check if we have email permissions
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
 * List all notifications for admin view
 * @param {string} sessionId - User session ID
 * @returns {Object} API response with all notifications
 */
function listAllNotifications(sessionId) {
  try {
    // Verify admin permissions
    const currentUserEmail = getCurrentUserEmail(sessionId);
    if (!currentUserEmail) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }
    
    const permissions = getUserGlobalPermissions(currentUserEmail);
    if (!permissions.includes('system_admin') && !permissions.includes('manage_users')) {
      return createErrorResponse('ACCESS_DENIED', 'Admin permissions required');
    }
    
    // Get all notifications from notification spreadsheet
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notificationData = readFullSheet(notificationSpreadsheet, 'Notifications');
    
    if (!notificationData || notificationData.length === 0) {
      return createSuccessResponse([]);
    }
    
    // Sort by creation time (newest first)
    notificationData.sort((a, b) => b.createdTime - a.createdTime);
    
    return createSuccessResponse(notificationData);
    
  } catch (error) {
    log('Error in listAllNotifications', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to list notifications');
  }
}

/**
 * Send email for a single notification
 * @param {string} sessionId - User session ID
 * @param {string} notificationId - Notification ID to send
 * @returns {Object} API response
 */
function sendSingleNotification(sessionId, notificationId) {
  try {
    // Verify admin permissions
    const currentUserEmail = getCurrentUserEmail(sessionId);
    if (!currentUserEmail) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }
    
    const permissions = getUserGlobalPermissions(currentUserEmail);
    if (!permissions.includes('system_admin') && !permissions.includes('manage_users')) {
      return createErrorResponse('ACCESS_DENIED', 'Admin permissions required');
    }
    
    // Get notification details
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notifications = readFullSheet(notificationSpreadsheet, 'Notifications');
    const notification = notifications.find(n => n.notificationId === notificationId);
    
    if (!notification) {
      return createErrorResponse('NOT_FOUND', 'Notification not found');
    }
    
    if (notification.emailSent) {
      return createErrorResponse('ALREADY_SENT', 'Email already sent for this notification');
    }
    
    // Get user info
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === notification.targetUserEmail);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'Target user not found');
    }
    
    // Check email permissions first
    const hasEmailPermission = checkEmailPermission();
    if (!hasEmailPermission) {
      return createErrorResponse('EMAIL_PERMISSION_DENIED', 'Email permissions not granted');
    }
    
    // Send email using MailApp with protection
    try {
      // Check remaining quota before attempting to send
      const remainingQuota = MailApp.getRemainingDailyQuota();
      if (remainingQuota <= 0) {
        log('Daily email quota exceeded for notification', { notificationId, remainingQuota });
        return createErrorResponse('EMAIL_QUOTA_EXCEEDED', 'Daily email quota exceeded');
      }
      
      const subject = `評分系統通知 - ${notification.title}`;
      const body = formatNotificationEmailAdmin(notification, user);
      
      // Small delay for rate limiting protection
      Utilities.sleep(1000); // 1 second delay
      
      MailApp.sendEmail({
        to: user.userEmail,
        subject: subject,
        htmlBody: body,
        name: '評分系統通知'
      });
      
      // Update notification as sent using updateSheetRow
      updateSheetRow(
        null,
        'Notifications',
        'notificationId',
        notificationId,
        {
          emailSent: true,
          emailSentTime: Date.now()
        },
        notificationSpreadsheet
      );
      
      log('Notification email sent successfully', { notificationId, userEmail: user.userEmail });
      
      return createSuccessResponse({
        notificationId: notificationId,
        emailSent: true,
        emailSentTime: Date.now()
      });
      
    } catch (emailError) {
      // Log detailed error for debugging
      log('MailApp send email failed for notification', { 
        notificationId,
        userEmail: user.userEmail,
        error: emailError.toString()
      });
      
      // Check if it's a rate limiting error
      if (emailError.toString().includes('Service invoked too many times')) {
        log('Rate limiting detected for notification email', { notificationId });
        return createErrorResponse('EMAIL_RATE_LIMITED', 'Email rate limit exceeded, please wait');
      }
      
      return createErrorResponse('EMAIL_FAILED', 'Failed to send email: ' + emailError.message);
    }
    
  } catch (error) {
    log('Error in sendSingleNotification', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to send notification');
  }
}

/**
 * Send emails for multiple notifications in batches
 * @param {string} sessionId - User session ID
 * @param {Array} notificationIds - Array of notification IDs to send
 * @returns {Object} API response with batch results
 */
function sendBatchNotifications(sessionId, notificationIds) {
  try {
    // Verify admin permissions
    const currentUserEmail = getCurrentUserEmail(sessionId);
    if (!currentUserEmail) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }
    
    const permissions = getUserGlobalPermissions(currentUserEmail);
    if (!permissions.includes('system_admin') && !permissions.includes('manage_users')) {
      return createErrorResponse('ACCESS_DENIED', 'Admin permissions required');
    }
    
    if (!notificationIds || notificationIds.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No notification IDs provided');
    }
    
    // Limit batch size
    const BATCH_SIZE = 50;
    if (notificationIds.length > BATCH_SIZE) {
      return createErrorResponse('BATCH_TOO_LARGE', `Maximum ${BATCH_SIZE} notifications per batch`);
    }
    
    // Check email permissions first
    const hasEmailPermission = checkEmailPermission();
    if (!hasEmailPermission) {
      return createErrorResponse('EMAIL_PERMISSION_DENIED', 'Email permissions not granted');
    }
    
    // Check remaining quota before starting batch
    const remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota <= 0) {
      return createErrorResponse('EMAIL_QUOTA_EXCEEDED', 'Daily email quota exceeded');
    }
    
    if (remainingQuota < notificationIds.length) {
      return createErrorResponse('EMAIL_QUOTA_INSUFFICIENT', `Insufficient quota: need ${notificationIds.length}, have ${remainingQuota}`);
    }
    
    // Get all notifications
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notifications = readFullSheet(notificationSpreadsheet, 'Notifications');
    const globalData = readGlobalData();
    const users = globalData.users;
    
    let successCount = 0;
    let errorCount = 0;
    const sentIds = [];
    const errors = [];
    
    // Process each notification
    for (let i = 0; i < notificationIds.length; i++) {
      const notificationId = notificationIds[i];
      const notification = notifications.find(n => n.notificationId === notificationId);
      
      if (!notification) {
        errorCount++;
        errors.push({ notificationId, error: 'Not found' });
        continue;
      }
      
      if (notification.emailSent) {
        // Skip already sent
        continue;
      }
      
      const user = users.find(u => u.userEmail === notification.targetUserEmail);
      if (!user) {
        errorCount++;
        errors.push({ notificationId, error: 'User not found' });
        continue;
      }
      
      // Send email
      try {
        const subject = `評分系統通知 - ${notification.title}`;
        const body = formatNotificationEmailAdmin(notification, user);
        
        // Add delay before sending to avoid rate limits
        Utilities.sleep(1000); // 1 second delay between emails
        
        MailApp.sendEmail({
          to: user.userEmail,
          subject: subject,
          htmlBody: body,
          name: '評分系統通知'
        });
        
        // Update notification as sent using updateSheetRow
        updateSheetRow(
          null,
          'Notifications',
          'notificationId',
          notificationId,
          {
            emailSent: true,
            emailSentTime: Date.now()
          },
          notificationSpreadsheet
        );
        
        successCount++;
        sentIds.push(notificationId);
        
        log('Batch notification email sent', { notificationId, userEmail: user.userEmail, batchIndex: i + 1 });
        
      } catch (emailError) {
        // Log detailed error
        log('Batch notification email failed', { 
          notificationId, 
          userEmail: user.userEmail,
          error: emailError.toString(),
          batchIndex: i + 1 
        });
        
        errorCount++;
        errors.push({ notificationId, error: emailError.message });
        
        // Check if it's a rate limiting error
        if (emailError.toString().includes('Service invoked too many times')) {
          log('Rate limiting detected in batch, stopping', { processedCount: i + 1 });
          break; // Stop processing on rate limit
        }
      }
    }
    
    return createSuccessResponse({
      totalRequested: notificationIds.length,
      successCount: successCount,
      errorCount: errorCount,
      sentIds: sentIds,
      errors: errors
    });
    
  } catch (error) {
    log('Error in sendBatchNotifications', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to send batch notifications');
  }
}

/**
 * Delete a notification (admin only)
 * @param {string} sessionId - User session ID
 * @param {string} notificationId - Notification ID to delete
 * @returns {Object} API response
 */
function deleteNotificationAdmin(sessionId, notificationId) {
  try {
    // Verify admin permissions
    const currentUserEmail = getCurrentUserEmail(sessionId);
    if (!currentUserEmail) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }
    
    const permissions = getUserGlobalPermissions(currentUserEmail);
    if (!permissions.includes('system_admin')) {
      return createErrorResponse('ACCESS_DENIED', 'System admin permissions required');
    }
    
    // Get notifications  
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notifications = readFullSheet(notificationSpreadsheet, 'Notifications');
    const notificationIndex = notifications.findIndex(n => n.notificationId === notificationId);
    
    if (notificationIndex === -1) {
      return createErrorResponse('NOT_FOUND', 'Notification not found');
    }
    
    // Remove notification by setting isDeleted flag
    updateSheetRow(
      null,
      'Notifications',
      'notificationId',
      notificationId,
      {
        isDeleted: true,
        deletedTime: Date.now()
      },
      notificationSpreadsheet
    );
    
    return createSuccessResponse({
      notificationId: notificationId,
      deleted: true
    });
    
  } catch (error) {
    log('Error in deleteNotificationAdmin', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete notification');
  }
}

/**
 * Format single notification for admin email sending
 * @param {Object} notification - Notification object
 * @param {Object} user - User object
 * @returns {string} Formatted HTML email body
 */
function formatNotificationEmailAdmin(notification, user) {
  const userName = user ? (user.displayName || user.username) : notification.targetUserEmail;
  const baseUrl = getWebAppUrl();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #FF6600; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .notification-item { border-left: 4px solid #FF6600; background: #f8f9fa; margin: 15px 0; padding: 15px; border-radius: 4px; }
        .notification-title { font-weight: bold; color: #2c3e50; margin-bottom: 8px; }
        .notification-content { color: #666; margin-bottom: 8px; line-height: 1.4; }
        .notification-meta { color: #999; font-size: 12px; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; font-size: 12px; }
        .btn { display: inline-block; background: #FF6600; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📢 評分系統通知</h2>
          <p>親愛的 ${userName}，您有一則新通知</p>
        </div>
        
        <div class="content">
          <div class="notification-item">
            <div class="notification-title">${notification.title}</div>
            <div class="notification-content">${notification.content}</div>
            <div class="notification-meta">
              時間: ${new Date(notification.createdTime).toLocaleString('zh-TW')}
              ${notification.projectId ? ` | 專案: ${getProjectNameById(notification.projectId) || '未知專案'}` : ''}
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${baseUrl}" class="btn">前往系統查看詳情</a>
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
  
  return html;
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    listAllNotifications,
    sendSingleNotification,
    sendBatchNotifications,
    deleteNotificationAdmin
  };
}