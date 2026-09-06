import type { Env, HonoVariables } from '../types';
/**
 * User Management Router
 * Migrated from GAS scripts/users_api.js
 *
 * Endpoints:
 * - POST /users/profile - Get user profile
 * - POST /users/profile/update - Update user profile
 * - POST /users/avatar/update - Update user avatar
 * - POST /users/avatar/regenerate - Regenerate avatar seed
 * - POST /users/search - Search users
 * - POST /users/stats - Get user statistics
 * - POST /users/deactivate - Deactivate user account
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import {
  getUserProfile,
  updateUserProfile,
  updateUserAvatar,
  regenerateAvatarSeed,
  generateAvatarData
} from '../handlers/users/profile';
import {
  searchUsers
} from '../handlers/users/search';
import {
  getUserDisplayNames
} from '../handlers/users/display-names';
import {
  getCommentPageSize,
  updateCommentPageSize,
  getAllUserSettings
} from '../handlers/users/settings';
import {
  GetUserProfileRequestSchema,
  UpdateUserProfileRequestSchema,
  UpdateUserAvatarRequestSchema,
  SearchUsersRequestSchema,
  GetUserDisplayNamesRequestSchema
} from '@repo/shared/schemas/users';
import { errorResponse } from '../utils/response';


// Public routes (no authentication required)
const publicApp = new Hono<{ Bindings: Env }>()

/**
 * Public: Generate avatar data
 * Body: { email: string }
 * No authentication required - used for registration
 */
  .post('/avatar/generate', async (c) => {
  const body = await c.req.json();
  const email = body.email || body.userEmail || `temp-${Date.now()}@example.com`;

  const response = await generateAvatarData(
    c.env,
    email,
    undefined // No userId for public access
  );

  return response;
});

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// Merge public routes BEFORE applying authentication middleware
  .route('/', publicApp)

// Apply authentication middleware to all authenticated routes
  .use('*', authMiddleware)

/**
 * Get user profile
 * Body: { sessionId, targetUserId? }
 */
  .post(
  '/profile',
  zValidator('json', GetUserProfileRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const targetUserId = body.targetUserId || undefined;

    const response = await getUserProfile(
      c.env,
      user.userId,
      user.userEmail,
      targetUserId
    );

    return response;
  }
)

/**
 * Update user profile
 * Body: { sessionId, updates: { displayName?, preferences? } }
 */
  .post(
  '/profile/update',
  zValidator('json', UpdateUserProfileRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const updates = body.updates || {};

    const response = await updateUserProfile(
      c.env,
      user.userId,
      user.userEmail,
      updates
    );

    return response;
  }
)

/**
 * Update user avatar
 * Body: { sessionId, avatarData: { avatarSeed?, avatarStyle?, avatarOptions? } }
 */
  .post(
  '/avatar/update',
  zValidator('json', UpdateUserAvatarRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const avatarData = body.avatarData || {};

    const response = await updateUserAvatar(
      c.env,
      user.userId,
      user.userEmail,
      avatarData
    );

    return response;
  }
)

/**
 * Regenerate avatar seed
 * Body: { sessionId }
 */
  .post('/avatar/regenerate', async (c) => {
  const user = c.get('user');

  const response = await regenerateAvatarSeed(
    c.env,
    user.userId,
    user.userEmail
  );

  return response;
})

/**
 * Search users
 * Body: { sessionId, query, limit? }
 */
  .post(
  '/search',
  zValidator('json', SearchUsersRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { query, limit } = body;

    const response = await searchUsers(
      c.env,
      user.userEmail,
      query,
      limit
    );

    return response;
  }
)



/**
 * Get user display names (batch query)
 * Body: { sessionId, projectId, userEmails: string[] }
 */
  .post(
  '/display-names',
  zValidator('json', GetUserDisplayNamesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, userEmails } = body;

    console.log('[POST /users/display-names] Request from', user.userEmail);

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view user data');
    }

    const response = await getUserDisplayNames(
      c.env,
      user.userEmail,
      projectId,
      userEmails
    );

    return response;
  }
)

// ============ User Settings Endpoints ============

/**
 * Get all user settings
 * Body: { sessionId }
 */
  .get('/settings', async (c) => {
  const user = c.get('user');
  return getAllUserSettings(c.env, user.userEmail);
})

/**
 * Get comment page size setting
 * Body: { sessionId }
 */
  .get('/settings/comment-page-size', async (c) => {
  const user = c.get('user');
  return getCommentPageSize(c.env, user.userEmail);
})

/**
 * Update comment page size setting
 * Body: { sessionId, pageSize: number (3-10) }
 */
  .put('/settings/comment-page-size', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const pageSize = body.pageSize;

  if (typeof pageSize !== 'number') {
    return errorResponse('INVALID_INPUT', 'pageSize must be a number');
  }

  return updateCommentPageSize(c.env, user.userEmail, pageSize);
});

export default app;
