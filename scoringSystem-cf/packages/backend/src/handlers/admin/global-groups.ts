/**
 * Admin Global Groups Management Handlers
 * Migrated from GAS scripts/system_admin_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON, stringifyJSON } from '../../utils/json';
import { generateId } from '../../utils/id-generator';
import { logGlobalOperation, generateChanges } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Get all global groups (admin function)
 * Supports server-side filtering, searching, and pagination
 */
export async function getGlobalGroups(
  env: Env,
  options?: {
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    limit?: number;
    offset?: number;
  }
): Promise<Response> {
  try {
    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    // Filter by status if provided (default: all)
    if (options?.status && options.status !== 'all') {
      conditions.push('gg.isActive = ?');
      params.push(options.status === 'active' ? 1 : 0);
    }

    // Search in groupName or description if provided
    if (options?.search && options.search.trim()) {
      const search = options.search.trim();

      // Validate search string length to prevent DoS
      if (search.length > 100) {
        return errorResponse('INVALID_INPUT', 'Search string too long (max 100 characters)');
      }

      // Escape LIKE wildcards (%, _) to prevent SQL injection
      const escapedSearch = search.replace(/[%_]/g, '\\$&');

      conditions.push('(gg.groupName LIKE ? ESCAPE "\\" OR gg.description LIKE ? ESCAPE "\\")');
      const searchPattern = `%${escapedSearch}%`;
      params.push(searchPattern, searchPattern);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build LIMIT/OFFSET clause (optional pagination support)
    let limitClause = '';
    const countParams = [...params]; // Save params for count query (without limit/offset)

    if (options?.limit !== undefined) {
      // Hard cap at 1000 to prevent DoS attacks
      const limit = Math.min(options.limit, 1000);
      const offset = options.offset || 0;

      if (limit <= 0) {
        return errorResponse('INVALID_INPUT', 'Limit must be a positive integer');
      }

      if (offset < 0) {
        return errorResponse('INVALID_INPUT', 'Offset must be a non-negative integer');
      }

      limitClause = `LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    // Get total count for pagination (run in parallel with main query)
    const countQuery = env.DB.prepare(`
      SELECT COUNT(*) as total FROM globalgroups gg ${whereClause}
    `).bind(...countParams).first<{ total: number }>();

    // Get global groups with member counts
    const groupsQuery = env.DB.prepare(`
      SELECT
        gg.*,
        COUNT(DISTINCT CASE WHEN gug.isActive = 1 THEN gug.userEmail END) as memberCount
      FROM globalgroups gg
      LEFT JOIN globalusergroups gug ON gg.globalGroupId = gug.globalGroupId
      ${whereClause}
      GROUP BY gg.globalGroupId
      ORDER BY gg.createdAt DESC
      ${limitClause}
    `).bind(...params).all();

    // Execute both queries in parallel
    const [countResult, groupsResult] = await Promise.all([countQuery, groupsQuery]);

    const totalCount = countResult?.total || 0;

    const groups = groupsResult.results?.map((g: any) => ({
      groupId: g.globalGroupId,  // Use globalGroupId as groupId for frontend consistency
      globalGroupId: g.globalGroupId,  // Also include for backward compatibility
      groupName: g.groupName,
      description: g.description,
      globalPermissions: g.globalPermissions, // Return raw JSON string for frontend parsing
      isActive: g.isActive === 1,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      memberCount: g.memberCount || 0
    })) || [];

    // Return with pagination metadata
    return successResponse({
      groups,
      totalCount,
      limit: options?.limit,
      offset: options?.offset || 0
    });

  } catch (error) {
    console.error('Get global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
}

/**
 * Create a new global group (admin function)
 */
export async function createGlobalGroup(
  env: Env,
  adminEmail: string,
  groupData: {
    groupName: string;
    description?: string;
    globalPermissions?: string[];
  }
): Promise<Response> {
  try {
    // Validate required fields
    if (!groupData.groupName) {
      return errorResponse('INVALID_INPUT', 'groupName is required');
    }

    // Sanitize input
    const groupName = groupData.groupName.substring(0, 50);
    const description = (groupData.description || '').substring(0, 200);

    // Validate global permissions
    const validPermissions = [
      // System administration
      'system_admin', 'manage_users', 'manage_global_groups',
      // Project management
      'create_project', 'delete_any_project', 'manage_any_project',
      // Invitation management
      'generate_invites', 'manage_invitations',
      // Global settings
      'manage_system_settings', 'view_system_logs',
      // DISABLED: Tags - tags system has been disabled
      // 'manage_tags',
      // Notifications
      'notification_manager'
    ];
    const permissions = Array.isArray(groupData.globalPermissions) ? groupData.globalPermissions : [];

    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return errorResponse('INVALID_INPUT', `Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    // Check if group name already exists
    const existingGroup = await env.DB.prepare(`
      SELECT globalGroupId FROM globalgroups
      WHERE LOWER(groupName) = LOWER(?) AND isActive = 1
    `).bind(groupName).first();

    if (existingGroup) {
      return errorResponse('GROUP_EXISTS', 'Global group name already exists');
    }

    // Create group record
    const groupId = generateId('globalgrp');
    const timestamp = Date.now();

    await env.DB.prepare(`
      INSERT INTO globalgroups (
        globalGroupId, groupName, description, globalPermissions,
        isActive, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(
      groupId,
      groupName,
      description,
      stringifyJSON(permissions),
      timestamp,
      timestamp
    ).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'global_group_created',
      'group',
      groupId,
      {
        groupName,
        permissions,
        createdAt: timestamp
      },
      { level: 'info' }
    );

    return successResponse({
      groupId,
      groupName,
      description,
      globalPermissions: permissions,
      isActive: true,
      createdAt: timestamp
    }, 'Global group created successfully');

  } catch (error) {
    console.error('Create global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to create global group');
  }
}

/**
 * Update a global group (admin function)
 */
export async function updateGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string,
  groupData: {
    groupName?: string;
    description?: string;
    globalPermissions?: string[];
  }
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId) {
      return errorResponse('INVALID_INPUT', 'groupId is required');
    }

    // Find the group (including all updatable fields for change tracking)
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName, description, globalPermissions
      FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    // Prepare updates
    const updates: string[] = [];
    const params: any[] = [];
    const actualUpdates: any = {};  // Track actual update values for change logging

    if (groupData.groupName !== undefined) {
      const newName = groupData.groupName.substring(0, 50);
      // Check if new name conflicts with existing groups
      const existingGroup = await env.DB.prepare(`
        SELECT globalGroupId FROM globalgroups
        WHERE globalGroupId != ? AND LOWER(groupName) = LOWER(?) AND isActive = 1
      `).bind(groupId, newName).first();

      if (existingGroup) {
        return errorResponse('GROUP_EXISTS', 'Global group name already exists');
      }

      updates.push('groupName = ?');
      params.push(newName);
      actualUpdates.groupName = newName;
    }

    if (groupData.description !== undefined) {
      const value = groupData.description.substring(0, 200);
      updates.push('description = ?');
      params.push(value);
      actualUpdates.description = value;
    }

    if (groupData.globalPermissions !== undefined) {
      // Validate permissions
      const validPermissions = [
        // System administration
        'system_admin', 'manage_users', 'manage_global_groups',
        // Project management
        'create_project', 'delete_any_project', 'manage_any_project',
        // Invitation management
        'generate_invites', 'manage_invitations',
        // Global settings
        'manage_system_settings', 'view_system_logs',
        // DISABLED: Tags - tags system has been disabled
        // 'manage_tags',
        // Notifications
        'notification_manager'
      ];
      const permissions = Array.isArray(groupData.globalPermissions) ? groupData.globalPermissions : [];

      const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        return errorResponse('INVALID_INPUT', `Invalid permissions: ${invalidPermissions.join(', ')}`);
      }

      const value = stringifyJSON(permissions);
      updates.push('globalPermissions = ?');
      params.push(value);
      actualUpdates.globalPermissions = value;
    }

    if (updates.length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Add groupId for WHERE clause
    params.push(groupId);

    // Update group
    await env.DB.prepare(`
      UPDATE globalgroups
      SET ${updates.join(', ')}
      WHERE globalGroupId = ?
    `).bind(...params).run();

    // Log the action with full change tracking
    const changes = generateChanges(group, actualUpdates);

    await logGlobalOperation(
      env,
      adminEmail,
      'global_group_updated',
      'group',
      groupId,
      {
        changes,  // Complete before/after comparison
        updatedFields: Object.keys(actualUpdates)  // Kept for backward compatibility
      },
      { level: 'info' }
    );

    return successResponse(null, 'Global group updated successfully');

  } catch (error) {
    console.error('Update global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update global group');
  }
}

/**
 * Deactivate a global group (admin function)
 */
export async function deactivateGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId) {
      return errorResponse('INVALID_INPUT', 'groupId is required');
    }

    // Find the group
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    const timestamp = Date.now();

    // Update group status
    await env.DB.prepare(`
      UPDATE globalgroups
      SET isActive = 0
      WHERE globalGroupId = ?
    `).bind(groupId).run();

    // Deactivate all user memberships in this group
    const result = await env.DB.prepare(`
      UPDATE globalusergroups
      SET isActive = 0
      WHERE globalGroupId = ? AND isActive = 1
    `).bind(groupId).run();

    const membersAffected = result.meta.changes || 0;

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'global_group_deactivated',
      'group',
      groupId,
      {
        groupName: group.groupName,
        membersAffected,
        deactivatedAt: timestamp
      },
      { level: 'warning' }
    );

    return successResponse(null, 'Global group deactivated successfully');

  } catch (error) {
    console.error('Deactivate global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to deactivate global group');
  }
}

/**
 * Activate a global group (admin function)
 */
export async function activateGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId) {
      return errorResponse('INVALID_INPUT', 'groupId is required');
    }

    // Find the group
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    const timestamp = Date.now();

    // Update group status
    await env.DB.prepare(`
      UPDATE globalgroups
      SET isActive = 1
      WHERE globalGroupId = ?
    `).bind(groupId).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'global_group_activated',
      'group',
      groupId,
      {
        groupName: group.groupName,
        activatedAt: timestamp
      },
      { level: 'info' }
    );

    return successResponse(null, 'Global group activated successfully');

  } catch (error) {
    console.error('Activate global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to activate global group');
  }
}

/**
 * Get global group members (admin function)
 */
export async function getGlobalGroupMembers(
  env: Env,
  groupId: string
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId) {
      return errorResponse('INVALID_INPUT', 'groupId is required');
    }

    // Check if group exists
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    // Get group members
    const result = await env.DB.prepare(`
      SELECT
        gug.globalUserGroupId,
        gug.userEmail,
        u.displayName,
        gug.joinedAt,
        gug.isActive
      FROM globalusergroups gug
      JOIN users u ON gug.userEmail = u.userEmail
      WHERE gug.globalGroupId = ? AND gug.isActive = 1
      ORDER BY gug.joinedAt DESC
    `).bind(groupId).all();

    const members = result.results?.map((m: any) => ({
      membershipId: m.globalUserGroupId,
      userEmail: m.userEmail,
      displayName: m.displayName || m.userEmail,
      role: 'member',
      joinTime: m.joinedAt,
      addedBy: null
    })) || [];

    return successResponse({
      groupId: group.globalGroupId,
      groupName: group.groupName,
      memberCount: members.length,
      members
    });

  } catch (error) {
    console.error('Get global group members error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get global group members');
  }
}

/**
 * Add user to global group (admin function)
 */
export async function addUserToGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string,
  userEmail: string
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId || !userEmail) {
      return errorResponse('INVALID_INPUT', 'groupId and userEmail are required');
    }

    // Check if group exists
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    // Check if user exists
    const user = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Check if user is already in the group
    const existingMembership = await env.DB.prepare(`
      SELECT globalUserGroupId FROM globalusergroups
      WHERE userEmail = ? AND globalGroupId = ? AND isActive = 1
    `).bind(userEmail, groupId).first();

    if (existingMembership) {
      return errorResponse('USER_ALREADY_IN_GROUP', 'User is already in this global group');
    }

    // Add user to group
    const membershipId = generateId('gug');
    const timestamp = Date.now();

    await env.DB.prepare(`
      INSERT INTO globalusergroups (
        globalUserGroupId, globalGroupId, userEmail, joinedAt, isActive
      ) VALUES (?, ?, ?, ?, 1)
    `).bind(
      membershipId,
      groupId,
      userEmail,
      timestamp
    ).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'user_added_to_global_group',
      'user',
      userEmail,
      {
        groupId,
        groupName: group.groupName,
        addedBy: adminEmail
      },
      { level: 'info' }
    );

    // Notify user about being added to global group
    try {
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'group_member_added',
        title: '已加入全局群組',
        content: `你已被管理員加入全局群組「${group.groupName}」`,
        groupId,
        metadata: {
          groupName: group.groupName,
          addedBy: adminEmail
        }
      });
    } catch (notifError) {
      console.error('[addUserToGlobalGroup] Failed to send notification:', notifError);
    }

    return successResponse(null, 'User added to global group successfully');

  } catch (error) {
    console.error('Add user to global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to add user to global group');
  }
}

/**
 * Remove user from global group (admin function)
 */
export async function removeUserFromGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string,
  userEmail: string
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId || !userEmail) {
      return errorResponse('INVALID_INPUT', 'groupId and userEmail are required');
    }

    // Find the membership
    const membership = await env.DB.prepare(`
      SELECT globalUserGroupId FROM globalusergroups
      WHERE userEmail = ? AND globalGroupId = ? AND isActive = 1
    `).bind(userEmail, groupId).first();

    if (!membership) {
      return errorResponse('MEMBERSHIP_NOT_FOUND', 'User is not in this global group');
    }

    // Get group name for logging
    const group = await env.DB.prepare(`
      SELECT groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    const groupName = group?.groupName || 'Unknown Group';

    // Mark membership as inactive
    await env.DB.prepare(`
      UPDATE globalusergroups
      SET isActive = 0
      WHERE globalUserGroupId = ?
    `).bind(membership.globalUserGroupId).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'user_removed_from_global_group',
      'user',
      userEmail,
      {
        groupId,
        groupName,
        removedBy: adminEmail
      },
      { level: 'warning' }
    );

    // Notify user about being removed from global group
    try {
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'group_member_removed',
        title: '已從全局群組移除',
        content: `你已被管理員從全局群組「${groupName}」中移除`,
        groupId,
        metadata: {
          groupName,
          removedBy: adminEmail
        }
      });
    } catch (notifError) {
      console.error('[removeUserFromGlobalGroup] Failed to send notification:', notifError);
    }

    return successResponse(null, 'User removed from global group successfully');

  } catch (error) {
    console.error('Remove user from global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to remove user from global group');
  }
}

/**
 * Batch add users to global group (admin function)
 */
export async function batchAddUsersToGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string,
  userEmails: string[]
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId || !Array.isArray(userEmails) || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupId and userEmails array are required');
    }

    // Check if group exists
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ? AND isActive = 1
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active global group not found');
    }

    const results = [];
    const timestamp = Date.now();

    // Batch validate all users in one query
    const emailPlaceholders = userEmails.map(() => '?').join(',');
    const validUsersResult = await env.DB.prepare(`
      SELECT userEmail FROM users
      WHERE userEmail IN (${emailPlaceholders}) AND status = 'active'
    `).bind(...userEmails).all();

    const validUserEmails = new Set(validUsersResult.results?.map((u: any) => u.userEmail) || []);

    // Batch check existing memberships in one query
    const existingMembershipsResult = await env.DB.prepare(`
      SELECT userEmail FROM globalusergroups
      WHERE globalGroupId = ? AND userEmail IN (${emailPlaceholders}) AND isActive = 1
    `).bind(groupId, ...userEmails).all();

    const existingEmails = new Set(existingMembershipsResult.results?.map((m: any) => m.userEmail) || []);

    // Prepare batch insert statements
    const insertStatements = [];

    for (const userEmail of userEmails) {
      if (!validUserEmails.has(userEmail)) {
        results.push({ userEmail, success: false, error: 'User not found or inactive' });
        continue;
      }

      if (existingEmails.has(userEmail)) {
        results.push({ userEmail, success: false, error: 'User already in group' });
        continue;
      }

      const membershipId = generateId('gug');
      insertStatements.push(
        env.DB.prepare(`
          INSERT INTO globalusergroups (
            globalUserGroupId, globalGroupId, userEmail, joinedAt, isActive
          ) VALUES (?, ?, ?, ?, 1)
        `).bind(membershipId, groupId, userEmail, timestamp)
      );
      results.push({ userEmail, success: true, membershipId });
    }

    // Execute all inserts in a single batch transaction
    if (insertStatements.length > 0) {
      await env.DB.batch(insertStatements);
    }

    // Log the batch operation using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'batch_add_users_to_global_group',
      'group',
      groupId,
      {
        groupName: group.groupName,
        userCount: userEmails.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      },
      { level: 'info' }
    );

    return successResponse({
      groupId,
      groupName: group.groupName,
      results,
      totalRequested: userEmails.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });

  } catch (error) {
    console.error('Batch add users to global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch add users to global group');
  }
}

/**
 * Batch remove users from global group (admin function)
 */
export async function batchRemoveUsersFromGlobalGroup(
  env: Env,
  adminEmail: string,
  groupId: string,
  userEmails: string[]
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupId || !Array.isArray(userEmails) || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupId and userEmails array are required');
    }

    // Check if group exists
    const group = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId = ?
    `).bind(groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }

    const results = [];

    // Batch fetch all memberships in one query
    const emailPlaceholders = userEmails.map(() => '?').join(',');
    const membershipsResult = await env.DB.prepare(`
      SELECT globalUserGroupId, userEmail FROM globalusergroups
      WHERE globalGroupId = ? AND userEmail IN (${emailPlaceholders}) AND isActive = 1
    `).bind(groupId, ...userEmails).all();

    const membershipsByEmail = new Map<string, string>();
    membershipsResult.results?.forEach((m: any) => {
      membershipsByEmail.set(m.userEmail, m.globalUserGroupId);
    });

    // Prepare batch update statements
    const updateStatements = [];

    for (const userEmail of userEmails) {
      const membershipId = membershipsByEmail.get(userEmail);

      if (!membershipId) {
        results.push({ userEmail, success: false, error: 'User not in group' });
        continue;
      }

      updateStatements.push(
        env.DB.prepare(`
          UPDATE globalusergroups
          SET isActive = 0
          WHERE globalUserGroupId = ?
        `).bind(membershipId)
      );
      results.push({ userEmail, success: true });
    }

    // Execute all updates in a single batch transaction
    if (updateStatements.length > 0) {
      await env.DB.batch(updateStatements);
    }

    // Log the batch operation using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'batch_remove_users_from_global_group',
      'group',
      groupId,
      {
        groupName: group.groupName,
        userCount: userEmails.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      },
      { level: 'warning' }
    );

    return successResponse({
      groupId,
      groupName: group.groupName,
      results,
      totalRequested: userEmails.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });

  } catch (error) {
    console.error('Batch remove users from global group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch remove users from global group');
  }
}

/**
 * Batch deactivate global groups (admin function)
 */
export async function batchDeactivateGlobalGroups(
  env: Env,
  adminEmail: string,
  groupIds: string[]
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupIds || groupIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupIds array is required');
    }

    if (groupIds.length > 50) {
      return errorResponse('INVALID_INPUT', 'Cannot deactivate more than 50 groups at once');
    }

    const timestamp = Date.now();
    const results: Array<{ groupId: string; success: boolean; error?: string }> = [];

    // Batch fetch all groups at once to avoid N+1 query problem
    const placeholders = groupIds.map(() => '?').join(',');
    const allGroupsResult = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId IN (${placeholders})
    `).bind(...groupIds).all();

    const existingGroups = allGroupsResult.results || [];
    const groupMap = new Map(existingGroups.map((g: any) => [g.globalGroupId, g]));

    // Process each group
    const updateStatements = [];
    const membershipUpdateStatements = [];

    for (const groupId of groupIds) {
      const group = groupMap.get(groupId);

      if (!group) {
        results.push({
          groupId,
          success: false,
          error: 'Group not found'
        });
        continue;
      }

      // Prepare UPDATE statements
      updateStatements.push(
        env.DB.prepare(`
          UPDATE globalgroups
          SET isActive = 0
          WHERE globalGroupId = ?
        `).bind(groupId)
      );

      membershipUpdateStatements.push(
        env.DB.prepare(`
          UPDATE globalusergroups
          SET isActive = 0
          WHERE globalGroupId = ? AND isActive = 1
        `).bind(groupId)
      );

      results.push({
        groupId,
        success: true
      });
    }

    // Execute all updates in a batch
    try {
      if (updateStatements.length > 0) {
        await env.DB.batch([...updateStatements, ...membershipUpdateStatements]);
      }
    } catch (error) {
      console.error('Error executing batch deactivation:', error);
      return errorResponse('BATCH_OPERATION_FAILED', 'Failed to deactivate groups');
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    // Log the batch action
    await logGlobalOperation(
      env,
      adminEmail,
      'batch_global_groups_deactivated',
      'group',
      'batch',
      {
        totalGroups: groupIds.length,
        successCount,
        failedCount,
        deactivatedAt: timestamp
      },
      { level: 'warning' }
    );

    return successResponse({
      successCount,
      failedCount,
      errors: results.filter(r => !r.success).map(r => ({ groupId: r.groupId, error: r.error }))
    });

  } catch (error) {
    console.error('Batch deactivate global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch deactivate global groups');
  }
}

/**
 * Batch activate global groups (admin function)
 */
export async function batchActivateGlobalGroups(
  env: Env,
  adminEmail: string,
  groupIds: string[]
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupIds || groupIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupIds array is required');
    }

    if (groupIds.length > 50) {
      return errorResponse('INVALID_INPUT', 'Cannot activate more than 50 groups at once');
    }

    const timestamp = Date.now();
    const results: Array<{ groupId: string; success: boolean; error?: string }> = [];

    // Batch fetch all groups at once to avoid N+1 query problem
    const placeholders = groupIds.map(() => '?').join(',');
    const allGroupsResult = await env.DB.prepare(`
      SELECT globalGroupId, groupName FROM globalgroups WHERE globalGroupId IN (${placeholders})
    `).bind(...groupIds).all();

    const existingGroups = allGroupsResult.results || [];
    const groupMap = new Map(existingGroups.map((g: any) => [g.globalGroupId, g]));

    // Process each group
    const updateStatements = [];

    for (const groupId of groupIds) {
      const group = groupMap.get(groupId);

      if (!group) {
        results.push({
          groupId,
          success: false,
          error: 'Group not found'
        });
        continue;
      }

      // Prepare UPDATE statement
      updateStatements.push(
        env.DB.prepare(`
          UPDATE globalgroups
          SET isActive = 1
          WHERE globalGroupId = ?
        `).bind(groupId)
      );

      results.push({
        groupId,
        success: true
      });
    }

    // Execute all updates in a batch
    try {
      if (updateStatements.length > 0) {
        await env.DB.batch(updateStatements);
      }
    } catch (error) {
      console.error('Error executing batch activation:', error);
      return errorResponse('BATCH_OPERATION_FAILED', 'Failed to activate groups');
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    // Log the batch action
    await logGlobalOperation(
      env,
      adminEmail,
      'batch_global_groups_activated',
      'group',
      'batch',
      {
        totalGroups: groupIds.length,
        successCount,
        failedCount,
        activatedAt: timestamp
      },
      { level: 'info' }
    );

    return successResponse({
      successCount,
      failedCount,
      errors: results.filter(r => !r.success).map(r => ({ groupId: r.groupId, error: r.error }))
    });

  } catch (error) {
    console.error('Batch activate global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch activate global groups');
  }
}
