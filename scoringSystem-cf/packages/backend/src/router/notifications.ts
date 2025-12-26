import type { Env } from '../types';
/**
 * Notifications Router
 * Migrated from GAS scripts/notifications_api.js & notification_admin_api.js
 *
 * User Endpoints:
 * - POST /notifications/count - Get unread notification count
 * - POST /notifications/list - Get user notifications with filters
 * - POST /notifications/mark-read - Mark notification as read
 * - POST /notifications/mark-all-read - Mark all notifications as read
 * - POST /notifications/delete - Delete notification
 *
 * Admin Endpoints:
 * - POST /notifications/admin/list - List all notifications (admin)
 * - POST /notifications/admin/send - Send single notification email (admin)
 * - POST /notifications/admin/send-batch - Send batch notification emails (admin)
 * - POST /notifications/admin/delete - Delete notification (admin hard delete)
 * - POST /notifications/admin/statistics - Get notification statistics (admin)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  getUserNotificationCount,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  NotificationFilters
} from '../handlers/notifications/manage';
import {
  listAllNotifications,
  sendSingleNotification,
  sendBatchNotifications,
  deleteNotificationAdmin,
  getNotificationStatistics
} from '../handlers/notifications/admin';
import {
  GetUserNotificationsRequestSchema,
  MarkNotificationAsReadRequestSchema,
  DeleteNotificationRequestSchema,
  AdminListNotificationsRequestSchema,
  AdminSendNotificationRequestSchema,
  AdminSendBatchNotificationsRequestSchema,
  AdminDeleteNotificationRequestSchema
} from '@repo/shared/schemas/notifications';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Get user's unread notification count
 * Body: { sessionId }
 */
app.post('/count', async (c) => {
  const user = c.get('user');

  const response = await getUserNotificationCount(
    c.env,
    user.userEmail
  );

  return response;
});

/**
 * Get user's notifications with pagination and filtering
 * Body: { sessionId, options?: { limit, offset, unreadOnly, searchText, projectId } }
 */
app.post(
  '/list',
  zValidator('json', GetUserNotificationsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getUserNotifications(
      c.env,
      user.userEmail,
      body.options as NotificationFilters
    );

    return response;
  }
);

/**
 * Mark notification as read
 * Body: { sessionId, notificationId }
 */
app.post(
  '/mark-read',
  zValidator('json', MarkNotificationAsReadRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await markNotificationAsRead(
      c.env,
      user.userEmail,
      body.notificationId
    );

    return response;
  }
);

/**
 * Mark all user notifications as read
 * Body: { sessionId }
 */
app.post('/mark-all-read', async (c) => {
  const user = c.get('user');

  const response = await markAllNotificationsAsRead(
    c.env,
    user.userEmail
  );

  return response;
});

/**
 * Delete notification (soft delete)
 * Body: { sessionId, notificationId }
 */
app.post(
  '/delete',
  zValidator('json', DeleteNotificationRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await deleteNotification(
      c.env,
      user.userEmail,
      body.notificationId
    );

    return response;
  }
);


export default app;
