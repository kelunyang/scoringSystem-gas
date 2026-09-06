/**
 * Announcements Router
 *
 * Public Endpoints (no auth required):
 * - POST /announcements/active - Get active announcements for login page
 *
 * Admin Endpoints (requires auth + manage_announcements or system_admin):
 * - POST /announcements/admin/list - List all announcements with filters
 * - POST /announcements/admin/get - Get single announcement by ID
 * - POST /announcements/admin/create - Create new announcement
 * - POST /announcements/admin/update - Update announcement
 * - POST /announcements/admin/delete - Delete announcement (soft delete)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env, HonoVariables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { hasGlobalPermission, GLOBAL_PERMISSIONS } from '../utils/permissions';
import {
  AdminListAnnouncementsRequestSchema,
  AdminGetAnnouncementRequestSchema,
  AdminCreateAnnouncementRequestSchema,
  AdminUpdateAnnouncementRequestSchema,
  AdminDeleteAnnouncementRequestSchema
} from '@repo/shared/schemas/announcements';

// Import handlers
import { getActiveAnnouncements } from '../handlers/announcements/public';
import {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
} from '../handlers/announcements/admin';

// ============================================================================
// Admin Routes (requires auth + permissions)
// ============================================================================

// Create a sub-router for admin routes with authentication
const adminRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// Apply auth middleware to all admin routes
  .use('*', authMiddleware)

// Apply permission check
  .use('*', async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '請先登入' }
    }, 401);
  }

  // Check for system_admin or manage_announcements permission
  const isSystemAdmin = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
  if (isSystemAdmin) {
    return next();
  }

  const hasManageAnnouncements = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.MANAGE_ANNOUNCEMENTS);
  if (hasManageAnnouncements) {
    return next();
  }

  return c.json({
    success: false,
    error: { code: 'ACCESS_DENIED', message: '需要 manage_announcements 或 system_admin 權限' }
  }, 403);
})

/**
 * POST /announcements/admin/list
 * List all announcements with filters
 */
  .post(
  '/list',
  zValidator('json', AdminListAnnouncementsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const { options } = c.req.valid('json');
    return listAnnouncements(c.env, user.userEmail, options);
  }
)

/**
 * POST /announcements/admin/get
 * Get single announcement by ID
 */
  .post(
  '/get',
  zValidator('json', AdminGetAnnouncementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const { announcementId } = c.req.valid('json');
    return getAnnouncement(c.env, user.userEmail, announcementId);
  }
)

/**
 * POST /announcements/admin/create
 * Create new announcement
 */
  .post(
  '/create',
  zValidator('json', AdminCreateAnnouncementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    return createAnnouncement(c.env, user.userEmail, data);
  }
)

/**
 * POST /announcements/admin/update
 * Update announcement
 */
  .post(
  '/update',
  zValidator('json', AdminUpdateAnnouncementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    return updateAnnouncement(c.env, user.userEmail, data);
  }
)

/**
 * POST /announcements/admin/delete
 * Delete announcement (soft delete)
 */
  .post(
  '/delete',
  zValidator('json', AdminDeleteAnnouncementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const { announcementId } = c.req.valid('json');
    return deleteAnnouncement(c.env, user.userEmail, announcementId);
  }
);

// Mount admin router
// 宣告放在 adminRouter 之後，讓 app 的兩個註冊能連續串接
const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ============================================================================
// Public Routes (no auth required)
// ============================================================================

/**
 * POST /announcements/active
 * Get active announcements for public display (login page)
 */
  .post('/active', async (c) => {
  return getActiveAnnouncements(c.env);
})

  .route('/admin', adminRouter);

export default app;
