import type { Env } from '../types';
/**
 * Group Management Router
 * Migrated from GAS scripts/groups_api.js
 *
 * Endpoints:
 * - POST /groups/get - Get group details
 * - POST /groups/details - Get group details (alternative)
 * - POST /groups/update - Update group
 * - POST /groups/delete - Delete group
 * - POST /groups/deactivate - Deactivate group (set status to inactive)
 * - POST /groups/activate - Activate group (set status to active)
 * - POST /groups/add-member - Add user to group
 * - POST /groups/remove-member - Remove user from group
 * - POST /groups/list - List project groups
 * - POST /groups/mention-data - Get group mention data
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import {
  getGroup,
  updateGroup,
  deleteGroup,
  createGroup,
  batchCreateGroups,
  batchUpdateGroupStatus,
  batchUpdateGroupAllowChange
} from '../handlers/groups/manage';
import {
  addUserToGroup,
  removeUserFromGroup,
  listProjectGroups,
  getGroupMentionData,
  batchAddUsersToGroup,
  batchRemoveUsersFromGroup,
  updateMemberRole,
  batchUpdateMemberRoles
} from '../handlers/groups/members';
import {
  CreateGroupRequestSchema,
  BatchCreateGroupsSchema,
  GetGroupDetailsRequestSchema,
  UpdateGroupRequestSchema,
  DeleteGroupRequestSchema,
  AddMemberRequestSchema,
  RemoveMemberRequestSchema,
  ListGroupsRequestSchema,
  GetGroupMentionDataRequestSchema,
  BatchUpdateGroupStatusSchema,
  BatchUpdateGroupAllowChangeSchema,
  BatchAddMembersRequestSchema,
  BatchRemoveMembersRequestSchema,
  UpdateMemberRoleRequestSchema,
  BatchUpdateRolesRequestSchema
} from '@repo/shared/schemas/groups';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Create new group
 * Body: { projectId, groupData: { groupName, description?, allowChange? } }
 */
app.post(
  '/create',
  zValidator('json', CreateGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission to create groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to create groups',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await createGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupData
    );

    return response;
  }
);

/**
 * Batch create groups
 * Body: { projectId, groupCount, allowChange?, namePrefix? }
 */
app.post(
  '/batch-create',
  zValidator('json', BatchCreateGroupsSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission to create groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to create groups',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await batchCreateGroups(
      c.env,
      user.userEmail,
      body.projectId,
      {
        groupCount: body.groupCount,
        allowChange: body.allowChange,
        namePrefix: body.namePrefix
      }
    );

    return response;
  }
);

/**
 * Get group details
 * Body: { projectId, groupId }
 */
app.post(
  '/details',
  zValidator('json', GetGroupDetailsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission to view groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view group',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId
    );

    return response;
  }
);

/**
 * Update group
 * Body: { projectId, groupId, updates: { groupName?, description?, allowChange? } }
 */
app.post(
  '/update',
  zValidator('json', UpdateGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check moved to handler layer to support Group Leader permissions
    // Handler will check: Admin OR Teacher (manage) OR Group Leader (own group only)
    const response = await updateGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.updates
    );

    return response;
  }
);

/**
 * Delete group
 * Body: { projectId, groupId }
 */
app.post(
  '/delete',
  zValidator('json', DeleteGroupRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission to delete groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to delete group',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await deleteGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId
    );

    return response;
  }
);

/**
 * Deactivate group (set status to 'inactive')
 * Body: { projectId, groupId }
 */
app.post(
  '/deactivate',
  zValidator('json', z.object({
    projectId: z.string(),
    groupId: z.string()
  })),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission to deactivate groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to deactivate group',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Use batch handler for single group
    const response = await batchUpdateGroupStatus(
      c.env,
      user.userEmail,
      body.projectId,
      [body.groupId],
      'inactive'
    );

    return response;
  }
);

/**
 * Activate group (set status to 'active')
 * Body: { projectId, groupId }
 */
app.post(
  '/activate',
  zValidator('json', z.object({
    projectId: z.string(),
    groupId: z.string()
  })),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission to activate groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to activate group',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Use batch handler for single group
    const response = await batchUpdateGroupStatus(
      c.env,
      user.userEmail,
      body.projectId,
      [body.groupId],
      'active'
    );

    return response;
  }
);

/**
 * Add user to group
 * Body: { projectId, groupId, userEmail, role? }
 *
 * Permission check is done inside addUserToGroup() to support:
 * - System admins (global permission)
 * - Teachers (manage permission)
 * - Group leaders (specific group check)
 */
app.post(
  '/add-member',
  zValidator('json', AddMemberRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside addUserToGroup() handler
    // to support group leaders who don't have 'manage' permission
    const response = await addUserToGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.userEmail,
      body.role || 'member'
    );

    return response;
  }
);

/**
 * Batch add multiple users to group
 * Body: { projectId, groupId, members: [{ userEmail, role }] }
 *
 * Optimized endpoint that uses D1 batch transaction instead of sequential inserts.
 * Replaces the need for frontend to call /add-member in a loop.
 *
 * Permission check is done inside batchAddUsersToGroup() to support:
 * - System admins (global permission)
 * - Teachers (manage permission)
 * - Group leaders (specific group check)
 */
app.post(
  '/batch-add-members',
  zValidator('json', BatchAddMembersRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside batchAddUsersToGroup() handler
    const response = await batchAddUsersToGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.members
    );

    return response;
  }
);

/**
 * Remove user from group
 * Body: { projectId, groupId, userEmail }
 *
 * Permission check is done inside removeUserFromGroup() to support:
 * - System admins (global permission)
 * - Teachers (manage permission)
 * - Group leaders (specific group check)
 */
app.post(
  '/remove-member',
  zValidator('json', RemoveMemberRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside removeUserFromGroup() handler
    // to support group leaders who don't have 'manage' permission
    const response = await removeUserFromGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.userEmail
    );

    return response;
  }
);

/**
 * Batch remove multiple users from group
 * Body: { projectId, groupId, userEmails: string[] }
 *
 * Optimized endpoint that uses D1 batch transaction instead of sequential deletes.
 * Replaces the need for frontend to call /remove-member in a loop.
 *
 * Permission check is done inside batchRemoveUsersFromGroup() to support:
 * - System admins (global permission)
 * - Teachers (manage permission)
 * - Group leaders (specific group check)
 */
app.post(
  '/batch-remove-members',
  zValidator('json', BatchRemoveMembersRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside batchRemoveUsersFromGroup() handler
    const response = await batchRemoveUsersFromGroup(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.userEmails
    );

    return response;
  }
);

/**
 * Update member role in group
 * Body: { projectId, groupId, userEmail, newRole }
 *
 * Permission: ONLY system admins and project managers (NOT group leaders)
 * Allows changing a member's role between 'member' and 'leader'
 */
app.post(
  '/update-member-role',
  zValidator('json', UpdateMemberRoleRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside updateMemberRole() handler
    // Only system admins and project managers are allowed
    const response = await updateMemberRole(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.userEmail,
      body.newRole
    );

    return response;
  }
);

/**
 * Batch update member roles in group
 * Body: { projectId, groupId, updates: [{ userEmail, newRole }] }
 *
 * Optimized endpoint that uses D1 batch transaction instead of sequential updates.
 * Permission: ONLY system admins and project managers (NOT group leaders)
 */
app.post(
  '/batch-update-roles',
  zValidator('json', BatchUpdateRolesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside batchUpdateMemberRoles() handler
    // Only system admins and project managers are allowed
    const response = await batchUpdateMemberRoles(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupId,
      body.updates
    );

    return response;
  }
);

/**
 * List project groups
 * Body: { projectId, includeInactive? }
 */
app.post(
  '/list',
  zValidator('json', ListGroupsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission to list groups
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view groups',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await listProjectGroups(
      c.env,
      user.userEmail,
      body.projectId,
      body.includeInactive || false
    );

    return response;
  }
);

/**
 * Get group mention data (for comment mention resolution)
 * POST /groups/mention-data
 * Body: { projectId, groupIds: string[] }
 */
app.post(
  '/mention-data',
  zValidator('json', GetGroupMentionDataRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    console.log('[POST /groups/mention-data] Request from', user.userEmail);

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view group data',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getGroupMentionData(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupIds
    );

    return response;
  }
);

/**
 * Batch update group status (activate/deactivate)
 * Body: { projectId, groupIds: string[], status: 'active' | 'inactive' }
 */
app.post(
  '/batch-update-status',
  zValidator('json', BatchUpdateGroupStatusSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission for batch operations
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to manage groups',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await batchUpdateGroupStatus(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupIds,
      body.status
    );

    return response;
  }
);

/**
 * Batch update group allowChange (lock/unlock)
 * Body: { projectId, groupIds: string[], allowChange: boolean }
 */
app.post(
  '/batch-update-allow-change',
  zValidator('json', BatchUpdateGroupAllowChangeSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'manage' permission for batch operations
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to manage groups',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await batchUpdateGroupAllowChange(
      c.env,
      user.userEmail,
      body.projectId,
      body.groupIds,
      body.allowChange
    );

    return response;
  }
);

export default app;
