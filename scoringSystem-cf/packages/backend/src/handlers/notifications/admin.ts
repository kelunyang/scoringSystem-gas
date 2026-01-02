/**
 * Notification Admin Handlers
 * Migrated from GAS scripts/notification_admin_api.js
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { formatNotificationEmail } from '../../utils/email';
import { generateId } from '../../utils/id-generator';
import { getTypedConfig } from '../../utils/config';
import { queueAdminNotificationEmail } from '../../queues/email-producer';

/**
 * List all notifications (admin only)
 */
export async function listAllNotifications(
  env: Env,
  userEmail: string,
  filters: {
    targetUserEmail?: string;
    type?: string;
    isRead?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can list all notifications');
    }

    // Build query with LEFT JOIN to get project name
    let query = `
      SELECT
        n.*,
        p.projectName
      FROM notifications n
      LEFT JOIN projects p ON n.projectId = p.projectId
      WHERE n.isDeleted = 0
    `;
    const params: any[] = [];

    if (filters.targetUserEmail) {
      query += ' AND n.targetUserEmail = ?';
      params.push(filters.targetUserEmail);
    }

    if (filters.type) {
      query += ' AND n.type = ?';
      params.push(filters.type);
    }

    if (filters.isRead !== undefined) {
      query += ' AND n.isRead = ?';
      params.push(filters.isRead ? 1 : 0);
    }

    query += ' ORDER BY n.createdTime DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const result = await env.DB.prepare(query).bind(...params).all();
    const notifications = result.results || [];

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE isDeleted = 0';
    const countParams: any[] = [];

    if (filters.targetUserEmail) {
      countQuery += ' AND targetUserEmail = ?';
      countParams.push(filters.targetUserEmail);
    }

    if (filters.type) {
      countQuery += ' AND type = ?';
      countParams.push(filters.type);
    }

    if (filters.isRead !== undefined) {
      countQuery += ' AND isRead = ?';
      countParams.push(filters.isRead ? 1 : 0);
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    return successResponse({
      notifications: notifications,
      totalCount: countResult?.total || 0,
      filters: filters
    });

  } catch (error) {
    console.error('List all notifications error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to list notifications: ${message}`);
  }
}

/**
 * Send single notification email (admin)
 */
export async function sendSingleNotification(
  env: Env,
  userEmail: string,
  notificationId: string
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can send notification emails');
    }

    // Get notification
    const notification = await env.DB.prepare(`
      SELECT * FROM notifications WHERE notificationId = ?
    `).bind(notificationId).first();

    if (!notification) {
      return errorResponse('NOT_FOUND', 'Notification not found');
    }

    // Format email
    const webAppUrl = env.WEB_APP_URL || 'https://your-worker.workers.dev';
    const actionUrl = notification.projectId
      ? `${webAppUrl}/project/${notification.projectId}`
      : webAppUrl;

    const htmlBody = formatNotificationEmail(
      notification.title as string,
      notification.content as string,
      actionUrl,
      '查看詳情'
    );

    // Queue email for asynchronous sending
    await queueAdminNotificationEmail(
      env,
      notification.targetUserEmail as string,
      notification.title as string,
      htmlBody,
      `通知詳情：${notification.content || '(無內容)'}`,
      'normal'
    );

    return successResponse({
      notificationId: notificationId,
      targetUserEmail: notification.targetUserEmail,
      queued: true,
      message: 'Email queued for sending',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Send single notification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to send notification: ${message}`);
  }
}

/**
 * Send batch notification emails (admin)
 */
export async function sendBatchNotifications(
  env: Env,
  userEmail: string,
  filters: {
    targetUserEmail?: string;
    type?: string;
    isRead?: boolean;
    limit?: number;
  } = {}
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can send batch notifications');
    }

    // Build query to get notifications
    let query = 'SELECT * FROM notifications WHERE isDeleted = 0';
    const params: any[] = [];

    if (filters.targetUserEmail) {
      query += ' AND targetUserEmail = ?';
      params.push(filters.targetUserEmail);
    }

    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.isRead !== undefined) {
      query += ' AND isRead = ?';
      params.push(filters.isRead ? 1 : 0);
    }

    query += ' ORDER BY createdTime DESC';

    // Get configurable batch size limit
    const maxBatchSize = (await getTypedConfig(env, 'MAX_BATCH_EMAIL_SIZE')) as number;

    if (filters.limit) {
      // Use the smaller of user-requested limit or configured max
      const effectiveLimit = Math.min(filters.limit, maxBatchSize);
      query += ' LIMIT ?';
      params.push(effectiveLimit);
    } else {
      // Use configured default limit
      query += ' LIMIT ?';
      params.push(maxBatchSize);
    }

    const result = await env.DB.prepare(query).bind(...params).all();
    const notifications = result.results || [];

    if (notifications.length === 0) {
      return successResponse({
        totalNotifications: 0,
        sentCount: 0,
        failedCount: 0,
        message: 'No notifications found matching the criteria'
      });
    }

    // Queue emails for asynchronous sending
    const webAppUrl = env.WEB_APP_URL || 'https://your-worker.workers.dev';
    let queuedCount = 0;
    let failedCount = 0;

    for (const notification of notifications) {
      try {
        const actionUrl = notification.projectId
          ? `${webAppUrl}/project/${notification.projectId}`
          : webAppUrl;

        const htmlBody = formatNotificationEmail(
          notification.title as string,
          notification.content as string,
          actionUrl,
          '查看詳情'
        );

        await queueAdminNotificationEmail(
          env,
          notification.targetUserEmail as string,
          notification.title as string,
          htmlBody,
          `通知詳情：${notification.content || '(無內容)'}`,
          'normal'
        );

        queuedCount++;
      } catch (error) {
        console.error(`[Admin Batch] Failed to queue email for ${notification.targetUserEmail}:`, error);
        failedCount++;
      }
    }

    return successResponse({
      totalNotifications: notifications.length,
      queuedCount,
      failedCount,
      message: `Successfully queued ${queuedCount} emails`,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Send batch notifications error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to send batch notifications: ${message}`);
  }
}

/**
 * Delete notification (admin)
 */
export async function deleteNotificationAdmin(
  env: Env,
  userEmail: string,
  notificationId: string
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can delete notifications');
    }

    // Check if notification exists
    const notification = await env.DB.prepare(`
      SELECT * FROM notifications WHERE notificationId = ?
    `).bind(notificationId).first();

    if (!notification) {
      return errorResponse('NOT_FOUND', 'Notification not found');
    }

    // Hard delete (admin privilege)
    await env.DB.prepare(`
      DELETE FROM notifications WHERE notificationId = ?
    `).bind(notificationId).run();

    return successResponse({
      notificationId: notificationId,
      deleted: true,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Delete notification admin error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to delete notification: ${message}`);
  }
}

/**
 * Get notification statistics (admin)
 */
export async function getNotificationStatistics(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can view notification statistics');
    }

    // Get various statistics
    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM notifications WHERE isDeleted = 0
    `).first();

    const unreadResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM notifications WHERE isDeleted = 0 AND isRead = 0
    `).first();

    const byTypeResult = await env.DB.prepare(`
      SELECT type, COUNT(*) as count FROM notifications WHERE isDeleted = 0 GROUP BY type
    `).all();

    const recentResult = await env.DB.prepare(`
      SELECT DATE(createdTime / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM notifications
      WHERE isDeleted = 0 AND createdTime > ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `).bind(Date.now() - 30 * 24 * 60 * 60 * 1000).all();

    return successResponse({
      total: totalResult?.total || 0,
      unread: unreadResult?.total || 0,
      byType: byTypeResult.results || [],
      last30Days: recentResult.results || [],
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Get notification statistics error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get notification statistics: ${message}`);
  }
}

/**
 * Get pending email notifications (unsent notifications)
 */
export async function getPendingEmailNotifications(
  env: Env,
  userEmail: string,
  filters: {
    limit?: number;
    offset?: number;
    targetUserEmail?: string;
    startDate?: number;
    endDate?: number;
    notificationType?: string;
  } = {}
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can view pending notifications');
    }

    // Build query for pending notifications (emailSent = 0, not deleted)
    let query = `
      SELECT
        n.*,
        u.displayName as userDisplayName
      FROM notifications n
      LEFT JOIN users u ON n.targetUserEmail = u.userEmail
      WHERE n.emailSent = 0
        AND n.isDeleted = 0
    `;

    const params: any[] = [];

    // Add filters
    if (filters.targetUserEmail) {
      query += ' AND n.targetUserEmail = ?';
      params.push(filters.targetUserEmail);
    }

    if (filters.startDate) {
      query += ' AND n.createdTime >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND n.createdTime <= ?';
      params.push(filters.endDate);
    }

    if (filters.notificationType) {
      query += ' AND n.type = ?';
      params.push(filters.notificationType);
    }

    query += ' ORDER BY n.createdTime DESC';

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ? OFFSET ?';
      params.push(filters.limit, filters.offset || 0);
    }

    const result = await env.DB.prepare(query).bind(...params).all();

    // Get statistics
    const statsQuery = `
      SELECT
        COUNT(DISTINCT notificationId) as totalPending,
        COUNT(DISTINCT targetUserEmail) as usersWaiting,
        MIN(createdTime) as oldestNotification
      FROM notifications
      WHERE emailSent = 0 AND isDeleted = 0
    `;
    const statsResult = await env.DB.prepare(statsQuery).first();

    return successResponse({
      notifications: result.results || [],
      stats: {
        totalPending: statsResult?.totalPending || 0,
        usersWaiting: statsResult?.usersWaiting || 0,
        oldestPending: statsResult?.oldestNotification || null
      },
      pagination: {
        limit: filters.limit || (result.results?.length || 0),
        offset: filters.offset || 0,
        total: statsResult?.totalPending || 0
      }
    });

  } catch (error) {
    console.error('Get pending email notifications error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get pending notifications: ${message}`);
  }
}

/**
 * Get notification patrol statistics
 */
export async function getNotificationPatrolStatistics(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Check if user is Global PM
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%system_admin%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators can view patrol statistics');
    }

    const stats = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN emailSent = 0 AND isDeleted = 0 THEN 1 END) as pendingCount,
        COUNT(CASE WHEN emailSent = 1 THEN 1 END) as sentCount,
        COUNT(DISTINCT CASE WHEN emailSent = 0 AND isDeleted = 0 THEN targetUserEmail END) as usersWaiting,
        MIN(CASE WHEN emailSent = 0 AND isDeleted = 0 THEN createdTime END) as oldestPending
      FROM notifications
    `).first();

    return successResponse({
      pendingCount: stats?.pendingCount || 0,
      sentCount: stats?.sentCount || 0,
      usersWaiting: stats?.usersWaiting || 0,
      oldestPending: stats?.oldestPending || null,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Get notification patrol statistics error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get patrol statistics: ${message}`);
  }
}
