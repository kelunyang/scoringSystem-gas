/**
 * @fileoverview Notifications API for managing user notifications
 * @module NotificationsAPI
 */

/**
 * Get user's unread notification count
 */
function getUserNotificationCount(sessionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }

    const userEmail = sessionResult.userEmail;
    const notifications = getAllUserNotifications(userEmail);
    
    const unreadCount = notifications.filter(n => !n.isRead).length;
    
    return createSuccessResponseWithSession(sessionId, { 
      unreadCount: unreadCount,
      totalCount: notifications.length 
    });

  } catch (error) {
    logErr('Get notification count error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get notification count');
  }
}

/**
 * Get user's notifications with pagination and filtering
 */
function getUserNotifications(sessionId, options = {}) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }

    const userEmail = sessionResult.userEmail;
    const {
      limit = 20,
      offset = 0,
      unreadOnly = false,
      searchText = '',
      projectId = null
    } = options;

    let notifications = getAllUserNotifications(userEmail);

    // Filter by read status
    if (unreadOnly) {
      notifications = notifications.filter(n => !n.isRead);
    }

    // Filter by project
    if (projectId) {
      notifications = notifications.filter(n => n.projectId === projectId);
    }

    // Filter by search text
    if (searchText) {
      const search = searchText.toLowerCase();
      notifications = notifications.filter(n => 
        n.content.toLowerCase().includes(search) ||
        n.projectName.toLowerCase().includes(search)
      );
    }

    // Sort by creation time (newest first)
    notifications.sort((a, b) => b.createdTime - a.createdTime);

    // Apply pagination
    const paginatedNotifications = notifications.slice(offset, offset + limit);

    return createSuccessResponseWithSession(sessionId, {
      notifications: paginatedNotifications,
      totalCount: notifications.length,
      unreadCount: notifications.filter(n => !n.isRead).length,
      hasMore: (offset + limit) < notifications.length
    });

  } catch (error) {
    logErr('Get user notifications error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get notifications');
  }
}

/**
 * Mark notification as read
 */
function markNotificationAsRead(sessionId, notificationId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }

    const userEmail = sessionResult.userEmail;
    
    // Update notification in the notification spreadsheet
    updateNotificationReadStatus(notificationId, userEmail, true);

    return createSuccessResponseWithSession(sessionId, null, 'Notification marked as read');

  } catch (error) {
    logErr('Mark notification as read error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to mark notification as read');
  }
}

/**
 * Mark all user notifications as read
 */
function markAllNotificationsAsRead(sessionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }

    const userEmail = sessionResult.userEmail;
    const notifications = getAllUserNotifications(userEmail);
    const unreadNotifications = notifications.filter(n => !n.isRead);

    // Update all unread notifications
    unreadNotifications.forEach(notification => {
      updateNotificationReadStatus(notification.notificationId, userEmail, true);
    });

    return createSuccessResponseWithSession(sessionId, { 
      markedCount: unreadNotifications.length 
    }, `${unreadNotifications.length} notifications marked as read`);

  } catch (error) {
    logErr('Mark all notifications as read error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to mark all notifications as read');
  }
}

/**
 * Delete notification
 */
function deleteNotification(sessionId, notificationId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Invalid session');
    }

    const userEmail = sessionResult.userEmail;
    
    // Soft delete by marking as deleted
    updateNotificationDeleteStatus(notificationId, userEmail, true);

    return createSuccessResponseWithSession(sessionId, null, 'Notification deleted');

  } catch (error) {
    logErr('Delete notification error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete notification');
  }
}

/**
 * Get all notifications for a user from the notification spreadsheet
 */
function getAllUserNotifications(userEmail) {
  try {
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const notifications = readFullSheet(notificationSpreadsheet, 'Notifications');
    
    // Filter notifications for this user
    const userNotifications = notifications.filter(n => 
      n.targetUserEmail === userEmail && !n.isDeleted
    );

    // Enrich notifications with additional data
    return userNotifications.map(notification => {
      const enrichedNotification = {
        ...notification,
        // Add formatted time
        formattedTime: new Date(notification.createdTime).toLocaleString('zh-TW'),
        // Add project name if available
        projectName: getProjectNameById(notification.projectId) || '未知專案'
      };

      return enrichedNotification;
    });

  } catch (error) {
    logErr('Get all user notifications error', error);
    return [];
  }
}

/**
 * Update notification read status
 */
function updateNotificationReadStatus(notificationId, userEmail, isRead) {
  try {
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const sheet = notificationSpreadsheet.getSheetByName('Notifications');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idColIndex = headers.indexOf('notificationId');
    const rowIndex = data.findIndex((row, index) => 
      index > 0 && row[idColIndex] === notificationId
    );
    
    if (rowIndex !== -1) {
      // Update isRead column
      const isReadColIndex = headers.indexOf('isRead');
      const readTimeColIndex = headers.indexOf('readTime');
      
      if (isReadColIndex !== -1) {
        sheet.getRange(rowIndex + 1, isReadColIndex + 1).setValue(isRead);
      }
      if (readTimeColIndex !== -1 && isRead) {
        sheet.getRange(rowIndex + 1, readTimeColIndex + 1).setValue(getCurrentTimestamp());
      }
    }

    // Log the action
    logOperation(
      userEmail,
      'notification_marked_read',
      'notification',
      notificationId,
      { isRead: isRead }
    );

  } catch (error) {
    logErr('Update notification read status error', error);
    throw error;
  }
}

/**
 * Update notification delete status
 */
function updateNotificationDeleteStatus(notificationId, userEmail, isDeleted) {
  try {
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const sheet = notificationSpreadsheet.getSheetByName('Notifications');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idColIndex = headers.indexOf('notificationId');
    const rowIndex = data.findIndex((row, index) => 
      index > 0 && row[idColIndex] === notificationId
    );
    
    if (rowIndex !== -1) {
      // Update isDeleted column
      const isDeletedColIndex = headers.indexOf('isDeleted');
      const deletedTimeColIndex = headers.indexOf('deletedTime');
      
      if (isDeletedColIndex !== -1) {
        sheet.getRange(rowIndex + 1, isDeletedColIndex + 1).setValue(isDeleted);
      }
      if (deletedTimeColIndex !== -1 && isDeleted) {
        sheet.getRange(rowIndex + 1, deletedTimeColIndex + 1).setValue(getCurrentTimestamp());
      }
    }

    // Log the action
    logOperation(
      userEmail,
      'notification_deleted',
      'notification',
      notificationId,
      { isDeleted: isDeleted }
    );

  } catch (error) {
    logErr('Update notification delete status error', error);
    throw error;
  }
}

/**
 * Create a notification in the notification spreadsheet
 */
function createNotification(data) {
  try {
    const notificationId = generateIdWithType('notification');
    const timestamp = getCurrentTimestamp();

    const notification = {
      notificationId: notificationId,
      targetUserEmail: data.targetUserEmail,
      type: data.type || 'mention',
      title: data.title,
      content: data.content,
      projectId: data.projectId || '',
      stageId: data.stageId || '',
      commentId: data.commentId || '',
      relatedEntityId: data.relatedEntityId || '',
      isRead: false,
      isDeleted: false,
      emailSent: false,
      createdTime: timestamp,
      readTime: null,
      deletedTime: null,
      emailSentTime: null,
      metadata: safeJsonStringify(data.metadata || {})
    };

    // Add to notification spreadsheet
    const notificationSpreadsheet = getNotificationSpreadsheet();
    const sheet = notificationSpreadsheet.getSheetByName('Notifications');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => notification[header] || '');
    sheet.appendRow(newRow);

    log('Created notification', { notificationId, targetUser: data.targetUserEmail });
    return notification;

  } catch (error) {
    logErr('Create notification error', error);
    throw error;
  }
}

/**
 * Get or create notification spreadsheet
 */
function getNotificationSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();
  let notificationSpreadsheetId = properties.getProperty('NOTIFICATION_SPREADSHEET_ID');
  
  if (!notificationSpreadsheetId) {
    // Create new notification spreadsheet
    const timestamp = new Date().toISOString().split('T')[0];
    const notificationSpreadsheet = SpreadsheetApp.create(`系統通知_${timestamp}`);
    notificationSpreadsheetId = notificationSpreadsheet.getId();
    
    // Create the Notifications sheet with headers
    const notificationHeaders = [
      'notificationId', 'targetUserEmail', 'type', 'title', 'content',
      'projectId', 'stageId', 'commentId', 'relatedEntityId',
      'isRead', 'isDeleted', 'emailSent', 'createdTime', 'readTime', 'deletedTime', 'emailSentTime', 'metadata'
    ];
    
    // Create sheet and add headers
    const sheet = notificationSpreadsheet.getActiveSheet();
    sheet.setName('Notifications');
    sheet.getRange(1, 1, 1, notificationHeaders.length).setValues([notificationHeaders]);
    
    // Store the ID in properties
    properties.setProperty('NOTIFICATION_SPREADSHEET_ID', notificationSpreadsheetId);
    
    // Move to database folder if it exists
    const databaseFolderId = properties.getProperty('DATABASE_FOLDER');
    if (databaseFolderId) {
      const databaseFolder = DriveApp.getFolderById(databaseFolderId);
      DriveApp.getFileById(notificationSpreadsheetId).moveTo(databaseFolder);
    }
    
    log('Created new notification spreadsheet', { notificationSpreadsheetId });
  }
  
  return SpreadsheetApp.openById(notificationSpreadsheetId);
}

/**
 * Get project name by ID (helper function)
 */
function getProjectNameById(projectId) {
  try {
    if (!projectId) return null;
    
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    return project ? project.projectName : null;
  } catch (error) {
    logErr('Get project name error', error);
    return null;
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getUserNotificationCount,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    createNotification,
    getNotificationSpreadsheet
  };
}