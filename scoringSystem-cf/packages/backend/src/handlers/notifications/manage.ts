/**
 * Notification Management Handlers
 * Migrated from GAS scripts/notifications_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON, stringifyJSON } from '../../utils/json';
import { generateId } from '../../utils/id-generator';
import { logProjectOperation } from '../../utils/logging';

/**
 * Get user's unread notification count
 */
export async function getUserNotificationCount(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    const result = await env.DB.prepare(`
      SELECT
        COUNT(*) as totalCount,
        SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) as unreadCount
      FROM notifications
      WHERE targetUserEmail = ? AND isDeleted = 0
    `).bind(userEmail).first();

    return successResponse({
      unreadCount: result?.unreadCount || 0,
      totalCount: result?.totalCount || 0
    });

  } catch (error) {
    console.error('Get notification count error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get notification count');
  }
}

/**
 * Filters for notifications query
 */
export interface NotificationFilters {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  searchText?: string;
  projectId?: string;
}

/**
 * Get user's notifications with pagination and filtering
 */
export async function getUserNotifications(
  env: Env,
  userEmail: string,
  filters: NotificationFilters = {}
): Promise<Response> {
  try {
    const {
      limit = 20,
      offset = 0,
      unreadOnly = false,
      searchText = '',
      projectId = null
    } = filters;

    // Build query
    let query = `
      SELECT
        n.*,
        p.projectName
      FROM notifications n
      LEFT JOIN projects p ON n.projectId = p.projectId
      WHERE n.targetUserEmail = ? AND n.isDeleted = 0
    `;

    const params: any[] = [userEmail];

    // Filter by read status
    if (unreadOnly) {
      query += ` AND n.isRead = 0`;
    }

    // Filter by project
    if (projectId) {
      query += ` AND n.projectId = ?`;
      params.push(projectId);
    }

    // Filter by search text
    if (searchText) {
      query += ` AND (n.content LIKE ? OR n.title LIKE ? OR p.projectName LIKE ?)`;
      const searchPattern = `%${searchText}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Order by creation time (newest first)
    query += ` ORDER BY n.createdTime DESC`;

    // Get total count before pagination
    const countQuery = query.replace(/SELECT n\.\*, p\.projectName/, 'SELECT COUNT(*) as count');
    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const totalCount = countResult?.count || 0;

    // Apply pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    // Enrich notifications
    const notifications = result.results?.map((n: any) => {
      // Parse metadata if it's a JSON string
      let metadata = n.metadata;
      if (typeof n.metadata === 'string') {
        metadata = parseJSON(n.metadata, {});
      }

      return {
        notificationId: n.notificationId,
        type: n.type,
        title: n.title,
        content: n.content,
        projectId: n.projectId,
        projectName: n.projectName || '未知專案',
        stageId: n.stageId,
        commentId: n.commentId,
        relatedEntityId: n.relatedEntityId,
        isRead: n.isRead === 1,
        emailSent: n.emailSent === 1,
        createdTime: n.createdTime,
        readTime: n.readTime,
        metadata: metadata
      };
    }) || [];

    // Get unread count
    const unreadResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE targetUserEmail = ? AND isDeleted = 0 AND isRead = 0
    `).bind(userEmail).first();

    const unreadCount = unreadResult?.count || 0;

    return successResponse({
      notifications,
      totalCount,
      unreadCount,
      hasMore: (offset + limit) < (totalCount as number)
    });

  } catch (error) {
    console.error('Get user notifications error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get notifications');
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  env: Env,
  userEmail: string,
  notificationId: string
): Promise<Response> {
  try {
    // Verify notification belongs to user
    const notification = await env.DB.prepare(`
      SELECT notificationId, projectId, type
      FROM notifications
      WHERE notificationId = ? AND targetUserEmail = ?
    `).bind(notificationId, userEmail).first();

    if (!notification) {
      return errorResponse('NOT_FOUND', 'Notification not found or access denied');
    }

    // Update notification
    const timestamp = Date.now();
    await env.DB.prepare(`
      UPDATE notifications
      SET isRead = 1, readTime = ?
      WHERE notificationId = ? AND targetUserEmail = ?
    `).bind(timestamp, notificationId, userEmail).run();

    // Log notification read event
    try {
      const projectId = notification.projectId as string || 'system';
      await logProjectOperation(env, userEmail, projectId, 'notification_read', 'notification', notificationId, {
        type: notification.type
      });
    } catch (logError) {
      console.error('[markNotificationAsRead] Failed to log read event:', logError);
      // Logging failure should not affect notification operation
    }

    return successResponse(null, 'Notification marked as read');

  } catch (error) {
    console.error('Mark notification as read error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to mark notification as read');
  }
}

/**
 * Mark all user notifications as read
 */
export async function markAllNotificationsAsRead(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    const timestamp = Date.now();

    // Update all unread notifications
    const result = await env.DB.prepare(`
      UPDATE notifications
      SET isRead = 1, readTime = ?
      WHERE targetUserEmail = ? AND isRead = 0 AND isDeleted = 0
    `).bind(timestamp, userEmail).run();

    const markedCount = result.meta.changes || 0;

    // Log notification batch read event
    try {
      await logProjectOperation(env, userEmail, 'system', 'notifications_marked_all_read', 'notification', 'batch', {
        count: markedCount
      });
    } catch (logError) {
      console.error('[markAllNotificationsAsRead] Failed to log batch read event:', logError);
      // Logging failure should not affect notification operation
    }

    return successResponse(
      { markedCount },
      `${markedCount} notifications marked as read`
    );

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to mark all notifications as read');
  }
}

/**
 * Delete notification (soft delete)
 */
export async function deleteNotification(
  env: Env,
  userEmail: string,
  notificationId: string
): Promise<Response> {
  try {
    // Verify notification belongs to user
    const notification = await env.DB.prepare(`
      SELECT notificationId, projectId, type
      FROM notifications
      WHERE notificationId = ? AND targetUserEmail = ?
    `).bind(notificationId, userEmail).first();

    if (!notification) {
      return errorResponse('NOT_FOUND', 'Notification not found or access denied');
    }

    // Soft delete
    const timestamp = Date.now();
    await env.DB.prepare(`
      UPDATE notifications
      SET isDeleted = 1, deletedTime = ?
      WHERE notificationId = ? AND targetUserEmail = ?
    `).bind(timestamp, notificationId, userEmail).run();

    // Log notification deletion event
    try {
      const projectId = notification.projectId as string || 'system';
      await logProjectOperation(env, userEmail, projectId, 'notification_deleted', 'notification', notificationId, {
        type: notification.type
      });
    } catch (logError) {
      console.error('[deleteNotification] Failed to log deletion event:', logError);
      // Logging failure should not affect notification operation
    }

    return successResponse(null, 'Notification deleted');

  } catch (error) {
    console.error('Delete notification error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to delete notification');
  }
}

// REMOVED: createNotification() duplicate implementation
// Use queueSingleNotification() from queues/notification-producer.ts instead
// All notifications now go through the Queue architecture for WebSocket push support
