/**
 * @fileoverview Email notification system for sending notifications to users
 * @module NotificationMailer
 */

/**
 * Daily notification patrol - check for unread notifications and send emails
 * This function should be called by GAS trigger daily
 */
function runDailyNotificationPatrol() {
  try {
    log('Starting daily notification patrol');
    
    const startTime = new Date();
    let emailsSent = 0;
    let errors = 0;
    
    // Get all unread notifications
    const unreadNotifications = getUnreadNotifications();
    log('Found unread notifications', { count: unreadNotifications.length });
    
    if (unreadNotifications.length === 0) {
      log('No unread notifications to process');
      return createSuccessResponse({ emailsSent: 0 }, 'No notifications to send');
    }
    
    // Group notifications by user email
    const notificationsByUser = groupNotificationsByUser(unreadNotifications);
    
    // Send emails in batches of 50 to avoid rate limiting
    const userEmails = Object.keys(notificationsByUser);
    const BATCH_SIZE = 50;
    
    // Process emails in batches
    for (let batchStart = 0; batchStart < userEmails.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, userEmails.length);
      const batch = userEmails.slice(batchStart, batchEnd);
      
      log(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(userEmails.length / BATCH_SIZE)}`, {
        batchSize: batch.length,
        totalUsers: userEmails.length
      });
      
      // Process each email in the batch
      for (let i = 0; i < batch.length; i++) {
        const userEmail = batch[i];
        const notifications = notificationsByUser[userEmail];
        
        try {
          const emailSent = sendNotificationEmail(userEmail, notifications);
          if (emailSent) {
            emailsSent++;
            // Mark notifications as email sent
            markNotificationsAsEmailSent(notifications);
          }
        } catch (error) {
          logErr('Failed to send notification email', { userEmail, error: error.message });
          errors++;
        }
      }
      
      // If there are more batches to process, add a longer delay
      if (batchEnd < userEmails.length) {
        log(`Batch complete, waiting before next batch`, { 
          completedBatch: Math.floor(batchStart / BATCH_SIZE) + 1,
          nextBatch: Math.floor(batchStart / BATCH_SIZE) + 2
        });
        Utilities.sleep(30000); // 30 second delay between batches
      }
    }
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    const results = {
      emailsSent: emailsSent,
      errors: errors,
      totalNotifications: unreadNotifications.length,
      duration: `${duration}ms`,
      timestamp: endTime.toISOString()
    };
    
    log('Daily notification patrol completed', results);

    // Record last execution time for monitoring
    PropertiesService.getScriptProperties().setProperty(
      'LAST_NOTIFICATION_PATROL',
      endTime.toISOString()
    );

    return createSuccessResponse(results, 'Notification patrol completed');
    
  } catch (error) {
    logErr('Daily notification patrol failed', error);
    return createErrorResponse('NOTIFICATION_PATROL_ERROR', error.message);
  }
}

/**
 * Get all unread notifications that haven't been emailed
 */
function getUnreadNotifications() {
  try {
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notifications = readFullSheet(notificationSpreadsheet, 'Notifications');
    
    // Filter unread notifications that haven't been emailed
    return notifications.filter(n => 
      !n.isRead && 
      !n.isDeleted && 
      !n.emailSent &&
      n.targetUserEmail && 
      n.targetUserEmail.trim() !== ''
    );
    
  } catch (error) {
    logErr('Get unread notifications error', error);
    return [];
  }
}

/**
 * Group notifications by user email
 */
function groupNotificationsByUser(notifications) {
  const grouped = {};
  
  notifications.forEach(notification => {
    const userEmail = notification.targetUserEmail;
    if (!grouped[userEmail]) {
      grouped[userEmail] = [];
    }
    grouped[userEmail].push(notification);
  });
  
  return grouped;
}

/**
 * Send notification email to user
 */
function sendNotificationEmail(userEmail, notifications) {
  try {
    // Check remaining quota before attempting to send
    const remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota <= 3) { // Keep buffer for notifications
      logWrn('Low email quota for notifications', { userEmail, remainingQuota });
      return false;
    }
    
    // Get user info
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === userEmail);
    const userName = user ? (user.displayName || user.username) : userEmail;
    
    // Build email content
    const emailContent = buildNotificationEmailContent(userName, notifications);
    
    // Small delay between emails in the same batch
    Utilities.sleep(1000); // 1 second delay between emails
    
    // Use MailApp only (simpler and more reliable)
    try {
      MailApp.sendEmail({
        to: userEmail,
        subject: emailContent.subject,
        htmlBody: emailContent.htmlBody,
        name: '評分系統通知'
      });
      
      log('Notification email sent via MailApp', { userEmail, notificationCount: notifications.length });
      return true;
      
    } catch (error) {
      logErr('MailApp failed for notification', { 
        userEmail, 
        error: error.toString()
      });
      
      // Check if it's a rate limiting error
      if (error.toString().includes('Service invoked too many times')) {
        logWrn('Rate limiting detected - need to wait longer between emails', { userEmail });
      }
      
      return false;
    }
    
  } catch (error) {
    logErr('Send notification email error', { userEmail, error: error.message });
    return false;
  }
}

/**
 * Build detailed HTML email content
 */
function buildNotificationEmailContent(userName, notifications) {
  const notificationCount = notifications.length;
  const subject = `評分系統通知 - 您有 ${notificationCount} 則未讀通知`;
  
  // Sort notifications by creation time (newest first)
  notifications.sort((a, b) => b.createdTime - a.createdTime);
  
  const htmlBody = `
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
          <p>親愛的 ${userName}，您有 ${notificationCount} 則未讀通知</p>
        </div>
        
        <div class="content">
          ${notifications.map(notification => `
            <div class="notification-item">
              <div class="notification-title">${notification.title}</div>
              <div class="notification-content">${notification.content}</div>
              <div class="notification-meta">
                時間: ${new Date(notification.createdTime).toLocaleString('zh-TW')}
                ${notification.projectId ? ` | 專案: ${getProjectNameById(notification.projectId) || '未知專案'}` : ''}
              </div>
            </div>
          `).join('')}
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${getWebAppUrl()}" class="btn">前往系統查看詳情</a>
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
  
  return {
    subject: subject,
    htmlBody: htmlBody
  };
}

/**
 * Build simple email content (fallback)
 */
function buildSimpleEmailContent(notifications) {
  const content = notifications.map(n => 
    `• ${n.title}: ${n.content} (${new Date(n.createdTime).toLocaleString('zh-TW')})`
  ).join('\n');
  
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h3 style="color: #FF6600;">評分系統通知</h3>
      <p>您有 ${notifications.length} 則未讀通知：</p>
      <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #FF6600;">
        ${content.replace(/\n/g, '<br>')}
      </div>
      <p><a href="${getWebAppUrl()}" style="color: #FF6600;">前往系統查看</a></p>
    </div>
  `;
}

/**
 * Mark notifications as email sent
 */
function markNotificationsAsEmailSent(notifications) {
  try {
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const timestamp = getCurrentTimestamp();
    
    notifications.forEach(notification => {
      updateSheetRow(
        null,
        'Notifications',
        'notificationId',
        notification.notificationId,
        {
          emailSent: true,
          emailSentTime: timestamp
        },
        notificationSpreadsheet
      );
    });
    
    log('Marked notifications as email sent', { count: notifications.length });
    
  } catch (error) {
    logErr('Mark notifications as email sent error', error);
  }
}

/**
 * Get web app URL for email links
 */
function getWebAppUrl() {
  try {
    // Try to get the URL from properties first
    const properties = PropertiesService.getScriptProperties();
    const webAppUrl = properties.getProperty('WEB_APP_URL');

    if (webAppUrl) {
      return webAppUrl;
    }

    // Fallback: try to get the deployed web app URL
    try {
      const url = ScriptApp.getService().getUrl();
      if (url) {
        return url;
      }
    } catch (e) {
      // ScriptApp.getService() might fail if not deployed as web app
      logWrn('Unable to get web app URL from ScriptApp', { error: e.message });
    }

    // Last resort: return placeholder
    return '#';

  } catch (error) {
    logErr('Get web app URL error', error);
    return '#';
  }
}

/**
 * Archive old notifications and create new spreadsheet if needed
 */
function checkAndArchiveNotifications() {
  try {
    log('Checking notification spreadsheet for archival');
    
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const sheet = notificationSpreadsheet.getSheetByName('Notifications');
    const rowCount = sheet.getLastRow();
    
    const MAX_ROWS = 50000; // Archive when exceeding 50k rows
    
    if (rowCount > MAX_ROWS) {
      log('Archiving notification spreadsheet', { rowCount });
      
      // Rename current spreadsheet
      const currentDate = new Date().toISOString().split('T')[0];
      const archiveName = `${notificationSpreadsheet.getName()}_歷史檔案_${currentDate}`;
      notificationSpreadsheet.rename(archiveName);
      
      // Create new notification spreadsheet
      const newNotificationSpreadsheet = SpreadsheetApp.create(`系統通知_${currentDate}`);
      const newSpreadsheetId = newNotificationSpreadsheet.getId();
      
      // Create headers for new spreadsheet
      const headers = [
        'notificationId', 'targetUserEmail', 'type', 'title', 'content',
        'projectId', 'stageId', 'commentId', 'relatedEntityId',
        'isRead', 'isDeleted', 'emailSent', 'createdTime', 'readTime', 
        'deletedTime', 'emailSentTime', 'metadata'
      ];
      
      createSheetWithHeaders(newNotificationSpreadsheet, 'Notifications', headers);
      
      // Update properties with new spreadsheet ID
      const properties = PropertiesService.getScriptProperties();
      properties.setProperty('NOTIFICATION_SPREADSHEET_ID', newSpreadsheetId);
      
      // Move new spreadsheet to database folder
      const databaseFolderId = properties.getProperty('DATABASE_FOLDER');
      if (databaseFolderId) {
        const databaseFolder = DriveApp.getFolderById(databaseFolderId);
        DriveApp.getFileById(newSpreadsheetId).moveTo(databaseFolder);
      }
      
      // Update archive count
      const archiveCount = parseInt(properties.getProperty('NOTIFICATION_ARCHIVE_COUNT') || '0') + 1;
      properties.setProperties({
        'NOTIFICATION_ARCHIVE_COUNT': archiveCount.toString(),
        'LAST_NOTIFICATION_ARCHIVE_DATE': currentDate
      });
      
      log('Notification spreadsheet archived', { newSpreadsheetId });
      
      return {
        archived: true,
        newSpreadsheetId: newSpreadsheetId,
        archiveName: archiveName,
        archivedRows: rowCount
      };
    }
    
    log('Notification sheet archival not needed', { rowCount });
    return { archived: false, currentRows: rowCount };
    
  } catch (error) {
    logErr('Archive notifications error', error);
    throw error;
  }
}

/**
 * Get notification patrol status for monitoring
 */
function getNotificationPatrolStatus() {
  const properties = PropertiesService.getScriptProperties();
  
  try {
    const lastPatrol = properties.getProperty('LAST_NOTIFICATION_PATROL');
    const archiveCount = properties.getProperty('NOTIFICATION_ARCHIVE_COUNT') || '0';
    const lastArchiveDate = properties.getProperty('LAST_NOTIFICATION_ARCHIVE_DATE');

    return createSuccessResponse({
      lastPatrol: lastPatrol || null,
      archiveCount: parseInt(archiveCount),
      lastArchiveDate: lastArchiveDate,
      currentTime: new Date().toISOString()
    });
    
  } catch (error) {
    return createErrorResponse('STATUS_ERROR', error.message);
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runDailyNotificationPatrol,
    checkAndArchiveNotifications,
    getNotificationPatrolStatus
  };
}