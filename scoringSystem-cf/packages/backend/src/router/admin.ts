/**
 * Admin Router
 * Migrated from GAS scripts/system_admin_api.js
 *
 * Permission Requirements:
 * - User Management endpoints: Require system_admin OR manage_users permission
 * - Global Group endpoints: Require system_admin OR manage_global_groups permission
 * - Notification endpoints: Require system_admin OR notification_manager permission
 * - System Logs endpoints: Require system_admin OR view_system_logs permission
 * - Properties/Robots endpoints: Require system_admin permission only
 *
 * User Management Endpoints:
 * - GET /admin/users - Get all users
 * - POST /admin/users/update-status - Update user status
 * - POST /admin/users/update-profile - Update user profile
 * - POST /admin/user-profile - Update user profile (alternative endpoint)
 * - POST /admin/users/reset-password - Reset user password
 * - POST /admin/users/unlock - Unlock a locked user account
 * - GET /admin/users/:userEmail/global-groups - Get user's global groups
 * - GET /admin/users/:userEmail/project-groups - Get user's project groups
 * - POST /admin/user-global-groups - Get user's global groups (body: { userEmail })
 * - POST /admin/user-project-groups - Get user's project groups (body: { userEmail })
 *
 * Global Group Management Endpoints:
 * - GET /admin/global-groups - Get all global groups
 * - POST /admin/global-groups/create - Create global group
 * - POST /admin/global-groups/update - Update global group
 * - POST /admin/global-groups/deactivate - Deactivate global group
 * - POST /admin/global-groups/activate - Activate global group
 * - GET /admin/global-groups/:groupId/members - Get group members
 * - POST /admin/global-groups/add-user - Add user to group
 * - POST /admin/global-groups/remove-user - Remove user from group
 * - POST /admin/global-groups/batch-add-users - Batch add users
 * - POST /admin/global-groups/batch-remove-users - Batch remove users
 *
 * System Management Endpoints:
 * - GET /admin/system/stats - Get system statistics
 * - POST /admin/system/stats - Get system statistics (POST version)
 * - GET /admin/system/event-logs - Get system event logs
 * - POST /admin/system/logs - Get system logs with filters
 * - GET /admin/system/log-statistics - Get log statistics
 * - POST /admin/logs/stats - Get log statistics (alternative endpoint)
 *
 * Properties Management Endpoints:
 * - POST /admin/properties/get-all - Get all system properties
 * - POST /admin/properties/update - Update system properties
 * - POST /admin/properties/reset - Reset properties to defaults
 *
 * Notification Management Endpoints:
 * - POST /admin/notifications/list - List all notifications with filters
 * - POST /admin/notifications/statistics - Get notification statistics
 * - POST /admin/notifications/send-single - Send a single notification email
 * - POST /admin/notifications/send-batch - Send batch notification emails
 * - POST /admin/notifications/delete - Delete a notification
 *
 * Email Logs Management Endpoints:
 * - POST /admin/email-logs/query - Query email logs with filters
 * - POST /admin/email-logs/statistics - Get email statistics
 * - POST /admin/email-logs/resend-single - Resend single email
 * - POST /admin/email-logs/resend-batch - Batch resend emails
 *
 * AI Service Logs Management Endpoints:
 * - POST /admin/ai-service-logs/query - Query AI service logs with filters
 * - POST /admin/ai-service-logs/statistics - Get AI service statistics
 * - GET /admin/ai-service-logs/:callId - Get single AI service log detail
 *
 * Robots Management Endpoints:
 * - POST /admin/robots/status - Get robot status
 * - POST /admin/robots/notification-patrol - Run notification patrol
 *
 * Security Management Endpoints:
 * - POST /admin/security/suspicious-logins - Check for suspicious login attempts
 *
 * SMTP Configuration Endpoints:
 * - POST /admin/smtp/get-config - Get SMTP configuration (password masked)
 * - POST /admin/smtp/update-config - Update SMTP configuration
 * - POST /admin/smtp/test-connection - Test SMTP connection
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env, HonoVariables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { hasGlobalPermission, GLOBAL_PERMISSIONS } from '../utils/permissions';
import { errorResponse } from '../utils/response';
import {
  GetAllUsersRequestSchema,
  UpdateUserStatusRequestSchema,
  UpdateUserProfileAdminRequestSchema,
  ResetUserPasswordRequestSchema,
  ChangeUserEmailRequestSchema,
  GetUserEmailImpactRequestSchema,
  UnlockUserRequestSchema,
  BatchUpdateUserStatusRequestSchema,
  BatchResetPasswordRequestSchema,
  GetUserGlobalGroupsRequestSchema,
  GetUserProjectGroupsRequestSchema,
  UserActivityRequestSchema,
  CreateGlobalGroupRequestSchema,
  UpdateGlobalGroupRequestSchema,
  DeactivateGlobalGroupRequestSchema,
  ActivateGlobalGroupRequestSchema,
  GetGlobalGroupMembersRequestSchema,
  AddUserToGlobalGroupRequestSchema,
  RemoveUserFromGlobalGroupRequestSchema,
  BatchAddUsersToGlobalGroupRequestSchema,
  BatchRemoveUsersFromGlobalGroupRequestSchema,
  BatchDeactivateGlobalGroupsRequestSchema,
  BatchActivateGlobalGroupsRequestSchema,
  GetSystemLogsRequestSchema,
  GetEntityDetailsRequestSchema,
  UpdatePropertiesRequestSchema,
  ListAllNotificationsRequestSchema,
  SendSingleNotificationRequestSchema,
  SendBatchNotificationsRequestSchema,
  DeleteNotificationAdminRequestSchema,
  NotificationPatrolRequestSchema,
  EmailLogsQueryRequestSchema,
  ResendEmailRequestSchema,
  ResendBatchEmailsRequestSchema,
  AIServiceLogsQueryRequestSchema
} from '@repo/shared/schemas/admin';

import {
  UpdateSmtpConfigRequestSchema,
  TestSmtpConnectionRequestSchema
} from '@repo/shared/schemas/smtp';

// User handlers
import {
  getAllUsers,
  updateUserStatus,
  updateUserProfile,
  resetUserPassword,
  changeUserEmail,
  getUserEmailImpact,
  unlockUser,
  batchUpdateUserStatus,
  batchResetPassword,
  getUserGlobalGroups,
  getUserProjectGroups
} from '../handlers/admin/users';

// User activity handler
import { getUserActivity } from '../handlers/admin/userActivity';

// Global group handlers
import {
  getGlobalGroups,
  createGlobalGroup,
  updateGlobalGroup,
  deactivateGlobalGroup,
  activateGlobalGroup,
  getGlobalGroupMembers,
  addUserToGlobalGroup,
  removeUserFromGlobalGroup,
  batchAddUsersToGlobalGroup,
  batchRemoveUsersFromGlobalGroup,
  batchDeactivateGlobalGroups,
  batchActivateGlobalGroups
} from '../handlers/admin/global-groups';

// System handlers
import {
  getSystemStats,
  getSystemLogs,
  getLogStatistics,
  getEntityDetails
} from '../handlers/admin/system';

// Robot handlers
import {
  executeNotificationPatrol,
  getNotificationPatrolConfig,
  updateNotificationPatrolConfig
} from '../handlers/robots/notification-patrol';

// Security handlers
import { checkSuspiciousLogins } from '../handlers/admin/security';

// Notification admin handlers
import {
  listAllNotifications,
  sendSingleNotification,
  sendBatchNotifications,
  deleteNotificationAdmin,
  getPendingEmailNotifications,
  getNotificationPatrolStatistics
} from '../handlers/notifications/admin';

// Email logs handlers
import {
  getEmailLogs,
  getEmailStatistics,
  resendSingleEmail,
  resendBatchEmailsHandler
} from '../handlers/admin/email-logs';

// AI service logs handlers
import {
  getAIServiceLogs,
  getAIServiceStatistics,
  getAIServiceLogDetail
} from '../handlers/admin/ai-service-logs';

// Email configuration
import { getSmtpConfig, testCloudflareEmailService } from '../utils/email';

// Logging utility
import { logGlobalOperation } from '../utils/logging';

// Configuration utility
import { getAllConfigValues, getConfigValue, setConfigValue, deleteConfigValue, UPDATABLE_CONFIG_KEYS } from '../utils/config';
import type { ConfigValue } from '../utils/config';

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

// Apply permission check to all routes
// Requires either system_admin OR specific management permissions depending on endpoint
app.use('*', async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required');
  }

  // Check if user has system_admin permission (grants access to everything)
  const isSystemAdmin = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);

  if (isSystemAdmin) {
    return next();
  }

  // For user activity endpoint, allow self-query (handler will check permissions)
  const path = c.req.path;
  if (path.includes('/users/activity')) {
    return next(); // Handler implements self-query + admin permission checks
  }

  // For user management endpoints, allow manage_users permission
  if (path.includes('/users') || path.includes('/user-')) {
    const hasManageUsers = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.MANAGE_USERS);
    if (hasManageUsers) {
      return next();
    }
  }

  // For global group endpoints, allow manage_global_groups permission
  if (path.includes('/global-groups')) {
    const hasManageGroups = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.MANAGE_GLOBAL_GROUPS);
    if (hasManageGroups) {
      return next();
    }
  }

  // For notification endpoints, allow notification_manager permission
  if (path.includes('/notifications')) {
    const hasNotificationManager = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.NOTIFICATION_MANAGER);
    if (hasNotificationManager) {
      return next();
    }
  }

  // For system logs endpoints, allow view_system_logs permission
  if (path.includes('/system/logs') || path.includes('/system/log-statistics') || path.includes('/system/entity-details')) {
    const hasViewSystemLogs = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.VIEW_SYSTEM_LOGS);
    if (hasViewSystemLogs) {
      return next();
    }
  }

  // For email logs endpoints, allow manage_email_logs permission
  if (path.includes('/email-logs')) {
    const hasManageEmailLogs = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.MANAGE_EMAIL_LOGS);
    if (hasManageEmailLogs) {
      return next();
    }
  }

  // For AI service logs endpoints, allow view_ai_service_logs permission
  if (path.includes('/ai-service-logs')) {
    const hasViewAIServiceLogs = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.VIEW_AI_SERVICE_LOGS);
    if (hasViewAIServiceLogs) {
      return next();
    }
  }

  // If no specific permission matched, deny access
  return errorResponse('ACCESS_DENIED', 'Insufficient permissions - requires system_admin or specific management permission');
});

/**
 * ========================================
 * USER MANAGEMENT ENDPOINTS
 * ========================================
 */


// Alternative endpoint for compatibility - with query parameters
app.get('/users/list', async (c) => {
  try {
    // Parse query parameters
    const search = c.req.query('search');
    const status = c.req.query('status') as 'active' | 'inactive' | undefined;
    // getAllUsers 會自己驗證白名單，不在白名單上直接回 INVALID_INPUT，
    // 所以這裡放行任意字串即可。
    const sortBy = c.req.query('sortBy') as
      | 'registrationTime' | 'email' | 'displayName' | 'lastActivityTime' | undefined;
    const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;

    const response = await getAllUsers(c.env, {
      search,
      status,
      sortBy,
      sortOrder,
      limit,
      offset
    });
    return response;
  } catch (error) {
    console.error('Get all users error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get users');
  }
});

// POST version for compatibility with frontend that sends filters in body
app.post(
  '/users/list',
  zValidator('json', GetAllUsersRequestSchema),
  async (c) => {
    try {
      const body = c.req.valid('json');
      const response = await getAllUsers(c.env, body);
      return response;
    } catch (error) {
      console.error('Get all users error:', error);
      return errorResponse('SYSTEM_ERROR', 'Failed to get users');
    }
  }
);

/**
 * Update user status
 * Body: { userEmail, status }
 */
app.post(
  '/users/update-status',
  zValidator('json', UpdateUserStatusRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmail, status } = body;

    const response = await updateUserStatus(
      c.env,
      user.userEmail,
      userEmail,
      status
    );

    return response;
  }
);


/**
 * Alternative endpoint for compatibility - Update user profile
 * Body: { userData: { userEmail, displayName?, status?, avatarSeed?, avatarStyle?, avatarOptions? } }
 */
app.post(
  '/user-profile',
  zValidator('json', UpdateUserProfileAdminRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // 這個端點同時接受三種格式（schema 三種都定義了）：
    // 巢狀的 userData、扁平的欄位、以及舊版前端快取送來的 avatarData。
    let userData = body.userData || body;

    if (body.avatarData && !body.userData) {
      userData = {
        ...userData,
        avatarSeed: body.avatarData.avatarSeed,
        avatarStyle: body.avatarData.avatarStyle,
        avatarOptions: body.avatarData.avatarOptions
      };
      delete (userData as { avatarData?: unknown }).avatarData;
    }

    const response = await updateUserProfile(
      c.env,
      user.userEmail,
      userData
    );

    return response;
  }
);

/**
 * Reset user password
 * Body: { userEmail }
 * Backend auto-generates random password and emails to user
 */
app.post(
  '/users/reset-password',
  zValidator('json', ResetUserPasswordRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmail } = body;

    const response = await resetUserPassword(
      c.env,
      user.userEmail,
      userEmail
    );

    return response;
  }
);

/**
 * Scan what a user's email is attached to (read-only)
 * Body: { userEmail }
 * Pre-flight for the change-email drawer - counts wallet, permission and
 * activity rows that a rename would rewrite
 */
app.post(
  '/users/email-impact',
  zValidator('json', GetUserEmailImpactRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    const response = await getUserEmailImpact(c.env, body.userEmail);

    return response;
  }
);

/**
 * Change a user's login email
 * Body: { userEmail, newEmail }
 * Rewrites every live reference to the old email in one transaction
 */
app.post(
  '/users/change-email',
  zValidator('json', ChangeUserEmailRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmail, newEmail } = body;

    const response = await changeUserEmail(
      c.env,
      user.userEmail,
      userEmail,
      newEmail
    );

    return response;
  }
);

/**
 * Unlock a locked user account
 * Body: { userEmail, unlockReason, resetLockCount? }
 */
app.post(
  '/users/unlock',
  zValidator('json', UnlockUserRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmail, unlockReason, resetLockCount } = body;

    if (!unlockReason) {
      return errorResponse('INVALID_INPUT', 'unlockReason is required');
    }

    const response = await unlockUser(
      c.env,
      user.userEmail,
      userEmail,
      unlockReason,
      resetLockCount || false
    );

    return response;
  }
);

/**
 * Batch update user status
 * Body: { userEmails: string[], status: 'active' | 'inactive' }
 */
app.post(
  '/users/batch-update-status',
  zValidator('json', BatchUpdateUserStatusRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmails, status } = body;

    const response = await batchUpdateUserStatus(
      c.env,
      userEmails,
      status,
      user.userEmail
    );

    return response;
  }
);

/**
 * Batch reset password
 * Body: { userEmails: string[], newPassword: string }
 */
app.post(
  '/users/batch-reset-password',
  zValidator('json', BatchResetPasswordRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { userEmails, newPassword } = body;

    const response = await batchResetPassword(
      c.env,
      userEmails,
      newPassword,
      user.userEmail
    );

    return response;
  }
);

/**
 * POST version for compatibility - Get user's global groups
 * Body: { userEmail }
 */
app.post(
  '/user-global-groups',
  zValidator('json', GetUserGlobalGroupsRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { userEmail } = body;

    const response = await getUserGlobalGroups(c.env, userEmail);
    return response;
  }
);

/**
 * POST version for compatibility - Get user's project groups
 * Body: { userEmail }
 */
app.post(
  '/user-project-groups',
  zValidator('json', GetUserProjectGroupsRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { userEmail } = body;

    const response = await getUserProjectGroups(c.env, userEmail);
    return response;
  }
);

/**
 * Get user activity statistics
 * POST /admin/users/activity
 * Body: { userEmail, startDate, endDate, timezone? }
 *
 * Permission: Self or manage_users/system_admin
 */
app.post(
  '/users/activity',
  zValidator('json', UserActivityRequestSchema, (result, c) => {
    // Log validation result
    console.log('[Backend Router] Zod validation result:', {
      success: result.success,
      data: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues
    });

    if (!result.success) {
      console.log('[Backend Router] ❌ Validation FAILED, issues:');
      console.log(JSON.stringify(result.error.issues, null, 2));
      return c.json({
        success: false,
        errors: result.error.issues,
        message: 'Validation failed'
      }, 400);
    } else {
      console.log('[Backend Router] ✅ Validation PASSED');
    }
    return;
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    console.log('[Backend Router] Handler executing with body:');
    console.log(JSON.stringify(body, null, 2));
    console.log('Types:', {
      userEmail: typeof body.userEmail,
      startDate: typeof body.startDate,
      endDate: typeof body.endDate
    });

    const result = await getUserActivity(
      c.env,
      user.userEmail,
      body.userEmail,
      body.startDate,
      body.endDate
    );

    const status = result.success ? 200 : (result.error?.code === 'PERMISSION_DENIED' ? 403 : 400);
    return c.json(result, status);
  }
);

/**
 * ========================================
 * GLOBAL GROUP MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * Get all global groups
 */
app.get('/global-groups', async (c) => {
  try {
    const response = await getGlobalGroups(c.env);
    return response;
  } catch (error) {
    console.error('Get global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
});

// Alternative endpoint for compatibility
app.get('/global-groups/list', async (c) => {
  try {
    const response = await getGlobalGroups(c.env);
    return response;
  } catch (error) {
    console.error('Get global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
});

// POST version for compatibility with frontend that sends sessionId in body
app.post('/global-groups/list', async (c) => {
  try {
    const response = await getGlobalGroups(c.env);
    return response;
  } catch (error) {
    console.error('Get global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
});

// POST version for direct /global-groups endpoint
app.post('/global-groups', async (c) => {
  try {
    // Parse request body for filtering options
    const body = await c.req.json().catch(() => ({}));
    const options = {
      search: body.search,
      status: body.status,
      limit: body.limit,
      offset: body.offset
    };

    const response = await getGlobalGroups(c.env, options);
    return response;
  } catch (error) {
    console.error('Get global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
});


/**
 * Alternative endpoint for compatibility - Create global group
 * Body: { groupName, description?, globalPermissions? } (frontend format)
 * OR: { groupData: { groupName, description?, globalPermissions? } } (wrapped format)
 */
app.post(
  '/create-global-group',
  zValidator('json', CreateGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Support both frontend format (flat) and wrapped format
    const groupData = body.groupData || body;

    const response = await createGlobalGroup(
      c.env,
      user.userEmail,
      groupData
    );

    return response;
  }
);


/**
 * Alternative endpoint for compatibility - Update global group
 * Body: { groupId, groupName?, description?, globalPermissions? } (frontend format)
 * OR: { groupId, groupData: { groupName?, description?, globalPermissions? } } (wrapped format)
 */
app.post(
  '/update-global-group',
  zValidator('json', UpdateGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const groupId = body.groupId;

    // Support both frontend format (flat) and wrapped format
    // Extract groupData from either format
    const groupData = body.groupData || {
      groupName: body.groupName,
      description: body.description,
      globalPermissions: body.globalPermissions
    };

    const response = await updateGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      groupData
    );

    return response;
  }
);


/**
 * Alternative endpoint for compatibility - Deactivate global group
 * Body: { groupId }
 */
app.post(
  '/deactivate-global-group',
  zValidator('json', DeactivateGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId } = body;

    const response = await deactivateGlobalGroup(
      c.env,
      user.userEmail,
      groupId
    );

    return response;
  }
);


/**
 * Alternative endpoint for compatibility - Activate global group
 * Body: { groupId }
 */
app.post(
  '/activate-global-group',
  zValidator('json', ActivateGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId } = body;

    const response = await activateGlobalGroup(
      c.env,
      user.userEmail,
      groupId
    );

    return response;
  }
);


/**
 * Alternative endpoint for compatibility - Get global group members (POST version)
 * Body: { groupId }
 */
app.post(
  '/global-groups/members',
  zValidator('json', GetGlobalGroupMembersRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { groupId } = body;

    const response = await getGlobalGroupMembers(c.env, groupId);
    return response;
  }
);

/**
 * Add user to global group
 * Body: { groupId, userEmail }
 */
app.post(
  '/global-groups/add-user',
  zValidator('json', AddUserToGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmail } = body;

    const response = await addUserToGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmail
    );

    return response;
  }
);

/**
 * Alternative endpoint for compatibility - Add user to global group
 * Body: { groupId, userEmail }
 */
app.post(
  '/add-user-to-global-group',
  zValidator('json', AddUserToGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmail } = body;

    const response = await addUserToGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmail
    );

    return response;
  }
);

/**
 * Remove user from global group
 * Body: { groupId, userEmail }
 */
app.post(
  '/global-groups/remove-user',
  zValidator('json', RemoveUserFromGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmail } = body;

    const response = await removeUserFromGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmail
    );

    return response;
  }
);

/**
 * Alternative endpoint for compatibility - Remove user from global group
 * Body: { groupId, userEmail }
 */
app.post(
  '/remove-user-from-global-group',
  zValidator('json', RemoveUserFromGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmail } = body;

    const response = await removeUserFromGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmail
    );

    return response;
  }
);

/**
 * Batch add users to global group
 * Body: { groupId, userEmails: string[] }
 */
app.post(
  '/global-groups/batch-add-users',
  zValidator('json', BatchAddUsersToGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmails } = body;

    const response = await batchAddUsersToGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmails
    );

    return response;
  }
);

/**
 * Batch remove users from global group
 * Body: { groupId, userEmails: string[] }
 */
app.post(
  '/global-groups/batch-remove-users',
  zValidator('json', BatchRemoveUsersFromGlobalGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupId, userEmails } = body;

    const response = await batchRemoveUsersFromGlobalGroup(
      c.env,
      user.userEmail,
      groupId,
      userEmails
    );

    return response;
  }
);

/**
 * Batch deactivate global groups
 * Body: { groupIds: string[] }
 */
app.post(
  '/batch-deactivate-global-groups',
  zValidator('json', BatchDeactivateGlobalGroupsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupIds } = body;

    const response = await batchDeactivateGlobalGroups(
      c.env,
      user.userEmail,
      groupIds
    );

    return response;
  }
);

/**
 * Batch activate global groups
 * Body: { groupIds: string[] }
 */
app.post(
  '/batch-activate-global-groups',
  zValidator('json', BatchActivateGlobalGroupsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { groupIds } = body;

    const response = await batchActivateGlobalGroups(
      c.env,
      user.userEmail,
      groupIds
    );

    return response;
  }
);

/**
 * ========================================
 * SYSTEM MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * Get system statistics
 */
app.get('/system/stats', async (c) => {
  try {
    const user = c.get('user');
    const response = await getSystemStats(c.env, user?.userEmail);
    return response;
  } catch (error) {
    console.error('Get system stats error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get system statistics');
  }
});

/**
 * POST version for compatibility - Get system statistics
 */
app.post('/system/stats', async (c) => {
  try {
    const user = c.get('user');
    const response = await getSystemStats(c.env, user?.userEmail);
    return response;
  } catch (error) {
    console.error('Get system stats error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get system statistics');
  }
});


/**
 * Get system logs with filters
 * Body: { options: { level?, action?, startTime?, endTime?, limit?, offset? } }
 */
app.post(
  '/system/logs',
  zValidator('json', GetSystemLogsRequestSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { options } = body;

    const response = await getSystemLogs(c.env, options || {});
    return response;
  }
);

/**
 * Get log statistics (GET)
 */
app.get('/system/log-statistics', async (c) => {
  try {
    const response = await getLogStatistics(c.env);
    return response;
  } catch (error) {
    console.error('Get log statistics error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get log statistics');
  }
});

/**
 * Get log statistics (POST)
 * Frontend uses POST for consistency with other RPC endpoints
 */
app.post('/system/log-statistics', async (c) => {
  try {
    const response = await getLogStatistics(c.env);
    return response;
  } catch (error) {
    console.error('Get log statistics error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get log statistics');
  }
});


/**
 * Get entity details by type and ID
 */
app.post(
  '/system/entity-details',
  zValidator('json', GetEntityDetailsRequestSchema),
  async (c) => {
    try {
      console.log('[entity-details] Request received');
      const user = c.get('user');
      console.log('[entity-details] User:', { userId: user?.userId, userEmail: user?.userEmail });

      // Permission check - requires system_admin permission
      const isSystemAdmin = await hasGlobalPermission(
        c.env.DB,
        user.userId,
        GLOBAL_PERMISSIONS.SYSTEM_ADMIN
      );
      console.log('[entity-details] Permission check result:', isSystemAdmin);

      if (!isSystemAdmin) {
        return errorResponse('FORBIDDEN', 'Insufficient permissions');
      }

      const body = c.req.valid('json');
      console.log('[entity-details] Request body validated:', body);
      const { entityType, entityId } = body;

      console.log('[entity-details] Calling getEntityDetails with:', { entityType, entityId, userEmail: user.userEmail });
      const response = await getEntityDetails(c.env, { entityType, entityId }, user.userEmail);
      console.log('[entity-details] Response received, status:', response.status);

      return response;
    } catch (error) {
      console.error('[entity-details] ERROR:', error);
      console.error('[entity-details] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      return errorResponse('SYSTEM_ERROR', 'Failed to get entity details', {
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
);

/**
 * ========================================
 * PROPERTIES MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * POST /admin/properties/get-all
 * Get all system properties configuration
 * Now reads from KV first, then environment variables, then defaults
 */
app.post('/properties/get-all', async (c) => {
  try {
    const user = c.get('user');
    const env = c.env;

    // Get all configuration values using KV-first strategy
    const properties = await getAllConfigValues(env);

    // Log admin access to system properties (audit trail)
    await logGlobalOperation(
      env,
      user.userEmail,
      'properties_viewed',
      'system_settings',
      'SYSTEM_PROPERTIES',
      {
        accessedFields: Object.keys(properties),
        fieldsCount: Object.keys(properties).length
      },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: properties
    });
  } catch (error) {
    console.error('Get all properties error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get properties');
  }
});

/**
 * POST /admin/properties/update
 * Update system properties - now supports all configurable parameters in KV
 * Body: { properties: { ... } }
 */
app.post(
  '/properties/update',
  zValidator('json', UpdatePropertiesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { properties } = body;

    const env = c.env;

    try {
      // Track changes with before/after values
      const changes: Array<{
        field: string;
        oldValue: ConfigValue | null;
        newValue: ConfigValue;
      }> = [];

      // Process all submitted properties
      for (const [key, newValue] of Object.entries(properties)) {
        // Validate that this is an updatable key
        if (!UPDATABLE_CONFIG_KEYS.includes(key)) {
          console.warn(`Ignoring unknown configuration key: ${key}`);
          continue;
        }

        try {
          // Get old value before updating
          const oldValue = await getConfigValue(env, key);

          // Update to new value in KV
          const success = await setConfigValue(env, key, newValue);

          if (!success) {
            throw new Error(`Failed to update ${key} in KV`);
          }

          console.log(`${key} updated in KV:`, newValue);

          // Record the change
          changes.push({
            field: key,
            oldValue: oldValue,
            newValue: newValue
          });

        } catch (error) {
          console.error(`Failed to update ${key} in KV:`, error);
          // Log error
          await logGlobalOperation(
            env,
            user.userEmail,
            'properties_update_failed',
            'system_settings',
            'SYSTEM_PROPERTIES',
            {
              updatedFields: [key],
              error: error instanceof Error ? error.message : String(error),
              attemptedValue: newValue
            },
            { level: 'error' }
          );
          throw error;
        }
      }

      // Filter out unchanged values (compare as strings for consistency)
      const actualChanges = changes.filter(c => String(c.oldValue) !== String(c.newValue));

      // Validate: Reject if no actual changes
      if (actualChanges.length === 0) {
        return errorResponse('NO_CHANGES', '沒有可更新的欄位', {
          message: '提交的欄位值與目前值相同，沒有需要更新的內容',
          submittedFields: Object.keys(properties),
          updatableFields: UPDATABLE_CONFIG_KEYS
        });
      }

      // Log successful update with detailed change tracking (only actual changes)
      await logGlobalOperation(
        env,
        user.userEmail,
        'properties_updated',
        'system_settings',
        'SYSTEM_PROPERTIES',
        {
          changesCount: actualChanges.length,
          changes: actualChanges.map(c => ({
            field: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue
          }))
        },
        { level: 'info' }
      );

      return c.json({
        success: true,
        message: `成功更新 ${actualChanges.length} 個配置項`,
        data: {
          updatedFields: actualChanges.map(c => c.field),
          updatedCount: actualChanges.length,
          changes: actualChanges.map(c => ({
            field: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue
          }))
        }
      });
    } catch (error) {
      console.error('Update properties error:', error);
      return errorResponse('UPDATE_FAILED', 'Failed to update properties');
    }
  }
);

/**
 * POST /admin/properties/reset
 * Reset properties to default values
 */
app.post('/properties/reset', async (c) => {
  try {
    const user = c.get('user');
    const env = c.env;

    // Track reset properties
    const resetProperties: string[] = [];
    const failedResets: string[] = [];

    // Reset all configurable properties in KV
    for (const key of UPDATABLE_CONFIG_KEYS) {
      try {
        const success = await deleteConfigValue(env, key);
        if (success) {
          console.log(`${key} reset to default (removed from KV)`);
          resetProperties.push(key);
        } else {
          failedResets.push(key);
        }
      } catch (error) {
        console.error(`Failed to reset ${key} in KV:`, error);
        failedResets.push(key);
      }
    }

    // Log the reset operation
    if (failedResets.length > 0) {
      // Partial failure
      await logGlobalOperation(
        env,
        user.userEmail,
        'properties_reset_partial',
        'system_settings',
        'SYSTEM_PROPERTIES',
        {
          resetFields: resetProperties,
          failedFields: failedResets,
          resetCount: resetProperties.length,
          failedCount: failedResets.length
        },
        { level: 'warning' }
      );

      return c.json({
        success: false,
        error: `Failed to reset ${failedResets.length} properties`,
        errorCode: 'PARTIAL_RESET_FAILURE',
        data: {
          resetFields: resetProperties,
          failedFields: failedResets
        }
      }, 500);
    }

    // Complete success - log with warning level because this is a significant operation
    await logGlobalOperation(
      env,
      user.userEmail,
      'properties_reset',
      'system_settings',
      'SYSTEM_PROPERTIES',
      {
        resetFields: resetProperties,
        resetCount: resetProperties.length
      },
      { level: 'warning' }
    );

    return c.json({
      success: true,
      message: `成功重設 ${resetProperties.length} 個配置項為預設值`,
      data: {
        resetFields: resetProperties,
        resetCount: resetProperties.length
      }
    });
  } catch (error) {
    console.error('Reset properties error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to reset properties');
  }
});

/**
 * ========================================
 * NOTIFICATION MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * POST /admin/notifications/list
 * List all notifications with filters
 * Body: { targetUserEmail?, type?, isRead?, limit?, offset? }
 */
app.post(
  '/notifications/list',
  zValidator('json', ListAllNotificationsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await listAllNotifications(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);


/**
 * POST /admin/notifications/send-single
 * Send a single notification email
 * Body: { notificationId }
 */
app.post(
  '/notifications/send-single',
  zValidator('json', SendSingleNotificationRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { notificationId } = body;

    const response = await sendSingleNotification(
      c.env,
      user.userEmail,
      notificationId
    );

    return response;
  }
);

/**
 * POST /admin/notifications/send-batch
 * Send batch notification emails with rate limiting
 * Body: { targetUserEmail?, type?, isRead?, limit? }
 */
app.post(
  '/notifications/send-batch',
  zValidator('json', SendBatchNotificationsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Charge this actor's hourly quota up front. The previous version only
    // *read* the counter, and nothing in the codebase ever incremented it, so
    // `remaining === 0` could never be true and the check never fired.
    //
    // The batch's real size is not known until the filter query runs, so
    // charge the configured ceiling for it; MAX_BATCH_EMAIL_SIZE is what the
    // handler will cap the query at anyway.
    const { guardActorEmailQuota, rateLimitResponse } = await import('../middleware/rate-limit');
    const { getTypedConfig } = await import('../utils/config');
    const maxBatchSize = (await getTypedConfig(c.env, 'MAX_BATCH_EMAIL_SIZE')) as number;
    const batchCost = Math.min(body.limit ?? maxBatchSize, maxBatchSize);

    const decision = await guardActorEmailQuota(c.env, user.userEmail, batchCost);
    if (!decision.allowed) {
      return rateLimitResponse(
        decision,
        'RATE_LIMIT_EXCEEDED',
        `這批最多 ${batchCost} 封信會超過每小時寄信上限（剩餘 ${decision.remaining ?? 0} 封），請稍後再試`
      );
    }

    const response = await sendBatchNotifications(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

/**
 * POST /admin/notifications/delete
 * Delete a notification (admin)
 * Body: { notificationId }
 */
app.post(
  '/notifications/delete',
  zValidator('json', DeleteNotificationAdminRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { notificationId } = body;

    const response = await deleteNotificationAdmin(
      c.env,
      user.userEmail,
      notificationId
    );

    return response;
  }
);

/**
 * ========================================
 * ROBOTS MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * POST /admin/robots/status
 * Get status of all automated robots/jobs
 * Uses KV cache to avoid repeated database queries
 */
/**
 * POST /admin/rate-limit/status
 * Read one account's email rate limit usage.
 * Body: { userEmail }
 */
app.post('/rate-limit/status', async (c) => {
  const body = await c.req.json<{ userEmail?: string }>();
  if (!body.userEmail) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: '缺少 userEmail' } }, 400);
  }

  const { getRateLimitStatus } = await import('../middleware/rate-limit');
  const status = await getRateLimitStatus(c.env, body.userEmail);

  if (!status) {
    return c.json({ success: false, error: { code: 'SYSTEM_ERROR', message: '無法讀取速率限制狀態' } }, 500);
  }
  return c.json({ success: true, data: status });
});

/**
 * POST /admin/rate-limit/reset
 * Clear one account's email rate limit buckets.
 *
 * The operational escape hatch for the limits added 2026-09-03: without it, a
 * user who hits the hourly cap has no recourse but to wait it out. Only clears
 * the actor bucket — the per-recipient and per-IP buckets are anti-abuse
 * controls and are left alone deliberately.
 *
 * Body: { userEmail }
 */
app.post('/rate-limit/reset', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ userEmail?: string }>();
  if (!body.userEmail) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: '缺少 userEmail' } }, 400);
  }

  const { resetRateLimit } = await import('../middleware/rate-limit');
  const ok = await resetRateLimit(c.env, body.userEmail);

  await logGlobalOperation(
    c.env,
    user.userEmail,
    'rate_limit_reset',
    'user',
    body.userEmail,
    { targetUser: body.userEmail, resetBy: user.userEmail, success: ok },
    { level: 'warning' }
  );

  return c.json({
    success: ok,
    data: { userEmail: body.userEmail, message: ok ? '已清除該帳號的寄信速率限制' : '清除失敗' }
  });
});

app.post('/robots/status', async (c) => {
  try {
    const user = c.get('user');
    interface RobotPatrolStatus {
      enabled: boolean;
      lastRun: number | null;
      lastRunDetails: unknown;
      lastError: string | null;
      status: string;
    }
    interface RobotStatus {
      notificationPatrol: RobotPatrolStatus;
    }
    let robotStatus: RobotStatus | undefined;

    // Try to get from KV cache first
    if (c.env.CONFIG) {
      const cachedStatus = await c.env.CONFIG.get('robot_status_notification_patrol', 'json') as RobotPatrolStatus | null;
      if (cachedStatus) {
        robotStatus = {
          notificationPatrol: cachedStatus
        };
      }
    }

    // If no cache, return default status
    if (!robotStatus) {
      robotStatus = {
        notificationPatrol: {
          enabled: true,
          lastRun: null,
          lastRunDetails: null,
          lastError: null,
          status: 'never_run'
        }
      };
    }

    // Log admin access to robot status
    await logGlobalOperation(
      c.env,
      user.userEmail,
      'robot_status_viewed',
      'system_robots',
      'ROBOT_STATUS',
      {
        robots: Object.keys(robotStatus),
        notificationPatrolStatus: robotStatus.notificationPatrol?.status || 'never_run'
      },
      { level: 'info' }
    );

    return c.json({
      success: true,
      data: robotStatus
    });
  } catch (error) {
    console.error('Get robot status error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get robot status');
  }
});

/**
 * POST /admin/robots/notification-patrol
 * Manually trigger notification patrol robot
 * Body (optional): { timeWindowHours?: number, dryRun?: boolean }
 */
app.post(
  '/robots/notification-patrol',
  zValidator('json', NotificationPatrolRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Execute notification patrol
    const result = await executeNotificationPatrol(c.env, {
      timeWindowHours: body.timeWindowHours,
      dryRun: body.dryRun
    });

    return result;
  }
);

/**
 * POST /admin/robots/notification-patrol/config
 * Get notification patrol robot configuration
 */
app.post('/robots/notification-patrol/config', async (c) => {
  try {
    const config = await getNotificationPatrolConfig(c.env);
    return c.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get notification patrol config error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get notification patrol configuration');
  }
});

/**
 * POST /admin/robots/notification-patrol/update-config
 * Update notification patrol robot configuration
 * Body: { config: Partial<NotificationPatrolConfig> }
 */
app.post('/robots/notification-patrol/update-config', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { config } = body;

    const result = await updateNotificationPatrolConfig(c.env, config);

    await logGlobalOperation(
      c.env,
      user.userEmail,
      'notification_patrol_config_updated',
      'system_robots',
      'NOTIFICATION_PATROL_CONFIG',
      { updatedFields: Object.keys(config) },
      { level: 'info' }
    );

    return c.json(result);
  } catch (error) {
    console.error('Update notification patrol config error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({
      success: false,
      error: `Failed to update configuration: ${message}`,
      errorCode: 'UPDATE_FAILED'
    }, 400);
  }
});

/**
 * POST /admin/robots/notification-patrol/pending
 * Get pending email notifications (unsent)
 * Body (optional): { filters?: { limit, offset, targetUserEmail, startDate, endDate, notificationType } }
 */
app.post('/robots/notification-patrol/pending', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { filters } = body;

    const result = await getPendingEmailNotifications(c.env, user.userEmail, filters || {});
    return result;
  } catch (error) {
    console.error('Get pending notifications error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get pending notifications');
  }
});

/**
 * POST /admin/robots/notification-patrol/statistics
 * Get notification patrol statistics
 */
app.post('/robots/notification-patrol/statistics', async (c) => {
  try {
    const user = c.get('user');
    const result = await getNotificationPatrolStatistics(c.env, user.userEmail);
    return result;
  } catch (error) {
    console.error('Get notification patrol statistics error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get patrol statistics');
  }
});

/**
 * ========================================
 * SECURITY MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * POST /admin/security/suspicious-logins
 * Check for suspicious login attempts
 * Body (optional): { timeWindowHours?: number }
 */
app.post('/security/suspicious-logins', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const timeWindowHours = body.timeWindowHours || 24;

    const response = await checkSuspiciousLogins(
      c.env,
      user.userEmail,
      timeWindowHours
    );

    return response;
  } catch (error) {
    console.error('Check suspicious logins error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to check suspicious logins');
  }
});

/**
 * ========================================
 * SMTP CONFIGURATION ENDPOINTS
 * ========================================
 */

/**
 * POST /admin/smtp/get-config
 * Get SMTP configuration (password will be masked for security)
 * Uses KV-first strategy via getSmtpConfig()
 */
app.post('/smtp/get-config', async (c) => {
  try {
    // Get SMTP config using KV-first strategy
    const smtpConfig = await getSmtpConfig(c.env);

    if (!smtpConfig) {
      return c.json({
        success: true,
        data: null // No configuration
      });
    }

    // Mask password for security
    return c.json({
      success: true,
      data: {
        host: smtpConfig.host,
        port: smtpConfig.port,
        username: smtpConfig.username,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.fromEmail,
        password: '***HIDDEN***' // Hide password from response
      }
    });
  } catch (error) {
    console.error('Get SMTP config error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get SMTP configuration');
  }
});

/**
 * POST /admin/smtp/update-config
 * Update SMTP configuration in KV
 * Body: { config: { host, port, username, password, fromName, fromEmail } }
 */
app.post(
  '/smtp/update-config',
  zValidator('json', UpdateSmtpConfigRequestSchema),
  async (c) => {
    // Note: SMTP configuration is managed via environment variables (.dev.vars or production env)
    // This endpoint returns success but actual config changes require env var updates
    return c.json({
      success: true,
      message: 'SMTP configuration is managed via environment variables. Please update .dev.vars or production environment settings.'
    });
  }
);

/**
 * POST /admin/smtp/test-connection
 * Test SMTP connection
 * Body (optional): { config?: {...}, testEmail?: 'admin@example.com' }
 * - If config provided: Test the provided config temporarily (without saving)
 * - If config not provided: Test current stored configuration
 */
app.post(
  '/smtp/test-connection',
  zValidator('json', TestSmtpConnectionRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    try {
      let success: boolean;

      if (body.config) {
        // Temporarily test provided config without saving
        const { WorkerMailer } = await import('worker-mailer');
        try {
          await WorkerMailer.connect({
            credentials: {
              username: body.config.username,
              password: body.config.password,
            },
            authType: 'plain',
            host: body.config.host,
            port: body.config.port,
            secure: body.config.port === 465,
          });
          success = true;
        } catch (error) {
          console.error('SMTP test connection failed:', error);
          success = false;
        }
      } else {
        // Test stored configuration using KV-first strategy
        const smtpConfig = await getSmtpConfig(c.env);
        if (!smtpConfig) {
          return errorResponse('NOT_CONFIGURED', 'SMTP not configured');
        }

        const { WorkerMailer } = await import('worker-mailer');
        try {
          await WorkerMailer.connect({
            credentials: {
              username: smtpConfig.username,
              password: smtpConfig.password,
            },
            authType: 'plain',
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.port === 465,
          });
          success = true;
        } catch (error) {
          console.error('SMTP test connection failed:', error);
          success = false;
        }
      }

      if (success) {
        return c.json({
          success: true,
          message: 'SMTP connection test successful'
        });
      } else {
        return errorResponse('CONNECTION_FAILED', 'SMTP connection test failed - please check your configuration');
      }
    } catch (error) {
      console.error('SMTP test error:', error);
      return errorResponse('CONNECTION_FAILED', 'SMTP connection test failed');
    }
  }
);

/**
 * POST /admin/email/test-cloudflare
 * Test Cloudflare Email Service connection
 * Sends a test email to the current admin user
 */
app.post('/email/test-cloudflare', async (c) => {
  const user = c.get('user');

  try {
    // Send test email to the current admin user
    const result = await testCloudflareEmailService(c.env, user.userEmail);

    if (result.success) {
      return c.json({
        success: true,
        message: `Cloudflare Email 測試成功！測試郵件已發送到 ${user.userEmail}`,
        messageId: result.messageId
      });
    } else {
      return c.json({
        success: false,
        error: result.error || 'Cloudflare Email 測試失敗',
        errorCode: result.errorType || 'CF_EMAIL_TEST_FAILED'
      }, 400);
    }
  } catch (error) {
    console.error('Cloudflare Email test error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Cloudflare Email 測試失敗',
      errorCode: 'CF_EMAIL_TEST_FAILED'
    }, 500);
  }
});

// ============================================
// Email Logs Management Routes
// ============================================

/**
 * Query email logs with filters
 * Permission: manage_email_logs
 */
app.post(
  '/email-logs/query',
  zValidator('json', EmailLogsQueryRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      }, 400);
    }
    return;
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    return await getEmailLogs(c.env, user.userEmail, body.filters || {});
  }
);

/**
 * Get email statistics
 * Permission: manage_email_logs
 */
app.post('/email-logs/statistics', async (c) => {
  const user = c.get('user');
  return await getEmailStatistics(c.env, user.userEmail);
});

/**
 * Resend single email
 * Permission: manage_email_logs
 */
app.post(
  '/email-logs/resend-single',
  zValidator('json', ResendEmailRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      }, 400);
    }
    return;
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { guardActorEmailQuota, rateLimitResponse } = await import('../middleware/rate-limit');
    const quota = await guardActorEmailQuota(c.env, user.userEmail, 1);
    if (!quota.allowed) {
      return rateLimitResponse(quota, 'RATE_LIMIT_EXCEEDED', '寄信次數已達每小時上限，請稍後再試');
    }

    return await resendSingleEmail(c.env, user.userEmail, body.logId);
  }
);

/**
 * Batch resend emails
 * Permission: manage_email_logs
 */
app.post(
  '/email-logs/resend-batch',
  zValidator('json', ResendBatchEmailsRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      }, 400);
    }
    return;
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { guardActorEmailQuota, rateLimitResponse } = await import('../middleware/rate-limit');
    const quota = await guardActorEmailQuota(c.env, user.userEmail, body.logIds.length);
    if (!quota.allowed) {
      return rateLimitResponse(
        quota,
        'RATE_LIMIT_EXCEEDED',
        `這批 ${body.logIds.length} 封信會超過每小時寄信上限（剩餘 ${quota.remaining ?? 0} 封），請稍後再試`
      );
    }

    return await resendBatchEmailsHandler(c.env, user.userEmail, body.logIds);
  }
);

/**
 * ========================================
 * AI SERVICE LOGS MANAGEMENT ENDPOINTS
 * ========================================
 */

/**
 * Query AI service logs with filters
 * Permission: view_ai_service_logs
 */
app.post(
  '/ai-service-logs/query',
  zValidator('json', AIServiceLogsQueryRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        }
      }, 400);
    }
    return;
  }),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    return await getAIServiceLogs(c.env, user.userEmail, body.filters || {});
  }
);

/**
 * Get AI service statistics
 * Permission: view_ai_service_logs
 */
app.post('/ai-service-logs/statistics', async (c) => {
  const user = c.get('user');
  return await getAIServiceStatistics(c.env, user.userEmail);
});

/**
 * Get AI service log detail
 * Permission: view_ai_service_logs
 */
app.get('/ai-service-logs/:callId', async (c) => {
  const user = c.get('user');
  const callId = c.req.param('callId');
  return await getAIServiceLogDetail(c.env, user.userEmail, callId);
});

export default app;
