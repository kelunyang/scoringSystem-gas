/**
 * Group Member Management Handlers
 * Migrated from GAS scripts/groups_api.js
 */

import type { Env} from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { generateId } from '@utils/id-generator';
import { parseJSON, stringifyJSON } from '@utils/json';
import { hasProjectPermission as checkProjectPermission, hasGlobalPermission } from '@utils/permissions';
import { logProjectOperation } from '@utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { getConfigValue } from '@utils/config';

/**
 * Add user to group
 */
export async function addUserToGroup(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  userEmail: string,
  role: string = 'member'
): Promise<Response> {
  try {
    console.log('[addUserToGroup] Starting with params:', { currentUserEmail, projectId, groupId, userEmail, role });

    // Validate role
    if (!['member', 'leader'].includes(role)) {
      console.log('[addUserToGroup] Invalid role:', role);
      return errorResponse('INVALID_INPUT', 'Invalid role. Must be "member" or "leader"');
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      console.log('[addUserToGroup] Invalid email format:', userEmail);
      return errorResponse('INVALID_INPUT', 'Invalid email format');
    }

    // Check permissions
    // Allow: group leaders (role=member in projectviewers + role=leader in usergroups)
    // Allow: system admins (for UserManagement.vue)
    // Allow: users with 'manage' permission (teachers)
    console.log('[addUserToGroup] Checking permissions...');
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    console.log('[addUserToGroup] isAdmin:', isAdmin);

    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');
    console.log('[addUserToGroup] hasManagePermission:', hasManagePermission);

    const isGroupLeader = await checkGroupLeadership(env, currentUserEmail, projectId, groupId);
    console.log('[addUserToGroup] isGroupLeader:', isGroupLeader);

    if (!isAdmin && !hasManagePermission && !isGroupLeader) {
      console.log('[addUserToGroup] Access denied - no permissions');
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to add users to groups');
    }

    // Get group
    console.log('[addUserToGroup] Fetching group...');
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      console.log('[addUserToGroup] Group not found');
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }
    console.log('[addUserToGroup] Group found:', { groupName: group.groupName, allowChange: group.allowChange });

    // Check if group allows changes (allowChange is stored as 0/1 in database)
    // Admin and users with manage permission can bypass this restriction
    const canBypassLock = isAdmin || hasManagePermission;
    if ((group.allowChange === 0 || group.allowChange === false) && !canBypassLock) {
      console.log('[addUserToGroup] Group locked and user cannot bypass');
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }
    if (group.allowChange === 0 || group.allowChange === false) {
      console.log('[addUserToGroup] Group locked but user can bypass (admin or manage permission)');
    }

    // Check if user exists
    console.log('[addUserToGroup] Checking if user exists...');
    const user = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ? AND status = 'active'
    `).bind(userEmail).first();

    if (!user) {
      console.log('[addUserToGroup] User not found:', userEmail);
      return errorResponse('USER_NOT_FOUND', 'Active user not found');
    }
    console.log('[addUserToGroup] User found:', user.userId);

    // Check if target user has role='member' in projectviewers (unless admin or has manage permission)
    // Group leaders can only add users who are already members of the project
    if (!isAdmin && !hasManagePermission) {
      console.log('[addUserToGroup] Checking if target user is a project member...');
      const targetUserViewer = await env.DB.prepare(`
        SELECT role FROM projectviewers
        WHERE projectId = ? AND userEmail = ? AND isActive = 1
      `).bind(projectId, userEmail).first();

      console.log('[addUserToGroup] Target user viewer role:', targetUserViewer?.role);

      if (!targetUserViewer || targetUserViewer.role !== 'member') {
        console.log('[addUserToGroup] Target user is not a project member');
        return errorResponse('ACCESS_DENIED', 'Can only add users with member role to groups');
      }
    } else {
      console.log('[addUserToGroup] Skipping member role check (admin or manage permission)');
    }

    // Check if user is already in this group
    console.log('[addUserToGroup] Checking existing membership...');
    const existingMembership = await env.DB.prepare(`
      SELECT membershipId FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail = ?
    `).bind(projectId, groupId, userEmail).first();

    if (existingMembership) {
      console.log('[addUserToGroup] User already in group');
      return errorResponse('USER_ALREADY_IN_GROUP', 'User is already a member of this group');
    }

    // CRITICAL: Check if user has a teacher/observer role in projectViewers
    // Each user can only have ONE role per project (teacher/observer OR student, not both)
    // Note: 'member' role in projectviewers should be allowed (it's for group members)
    console.log('[addUserToGroup] Checking project viewer role...');
    const viewerRole = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).first();

    if (viewerRole) {
      console.log('[addUserToGroup] Found projectviewers role:', viewerRole.role);
      // Only block if the role is teacher or observer (not member/student)
      if (viewerRole.role === 'teacher' || viewerRole.role === 'observer') {
        console.log('[addUserToGroup] Role conflict - teacher/observer cannot join groups');
        return errorResponse(
          'ROLE_CONFLICT',
          `User is already assigned as a ${viewerRole.role} for this project. Teachers and observers cannot join student groups.`
        );
      }
      console.log('[addUserToGroup] Role is member/student, allowing group membership');
    }

    // Check if user is in another group in this project
    console.log('[addUserToGroup] Checking other group membership...');
    const otherGroupMembership = await env.DB.prepare(`
      SELECT pg.groupName
      FROM usergroups pug
      JOIN groups pg ON pug.groupId = pg.groupId
      WHERE pug.projectId = ? AND pug.groupId != ? AND pug.userEmail = ?
        AND pug.isActive = 1
    `).bind(projectId, groupId, userEmail).first();

    if (otherGroupMembership) {
      console.log('[addUserToGroup] User in another group:', otherGroupMembership.groupName);
      return errorResponse(
        'USER_ALREADY_IN_PROJECT_GROUP',
        `User is already a member of ${otherGroupMembership.groupName} in this project`
      );
    }

    // Check group member limit
    console.log('[addUserToGroup] Checking member limit...');
    const maxMembersPerGroup = await getConfigValue(env, 'MAX_MEMBERS_PER_GROUP', { parseAsInt: true });
    const currentMembersCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM usergroups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    console.log('[addUserToGroup] Current members:', currentMembersCount?.count, 'Max:', maxMembersPerGroup);
    if (currentMembersCount && (currentMembersCount.count as number) >= maxMembersPerGroup) {
      console.log('[addUserToGroup] Member limit exceeded');
      return errorResponse('LIMIT_EXCEEDED', `Maximum members per group limit (${maxMembersPerGroup}) reached`);
    }

    // Add user to group
    console.log('[addUserToGroup] Adding user to group...');
    const membershipId = generateId('member');
    const timestamp = Date.now();

    await env.DB.prepare(`
      INSERT INTO usergroups (
        membershipId, projectId, groupId, userEmail, role, joinTime
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      membershipId,
      projectId,
      groupId,
      userEmail,
      role,
      timestamp
    ).run();

    console.log('[addUserToGroup] User added successfully, membershipId:', membershipId);

    // Log member addition
    console.log('[addUserToGroup] Logging operation...');
    await logProjectOperation(env, currentUserEmail, projectId, 'member_added', 'group', groupId, {
      role
    }, {
      relatedEntities: {
        user: userEmail
      }
    });

    if (role === 'leader') {
      await logProjectOperation(env, currentUserEmail, projectId, 'leader_assigned_by_admin', 'group', groupId, {}, {
        relatedEntities: {
          leader: userEmail
        }
      });
    }

    // 通知被添加的用戶
    try {
      const groupName = (group as any).groupName || '未命名群組';
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'group_member_added',
        title: '您已被加入群組',
        content: `您已被加入 ${groupName} 群組${role === 'leader' ? '，並擔任組長' : ''}`,
        projectId,
        groupId
      });
    } catch (error) {
      console.error('[addUserToGroup] Failed to send notification:', error);
    }

    console.log('[addUserToGroup] Completed successfully');
    return successResponse({
      membershipId,
      groupId,
      userEmail,
      role,
      joinTime: timestamp
    }, 'User added to group successfully');
  } catch (error) {
    console.error('[addUserToGroup] Error occurred:', error);
    console.error('[addUserToGroup] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', 'Failed to add user to group');
  }
}

/**
 * Remove user from group
 */
export async function removeUserFromGroup(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  userEmail: string
): Promise<Response> {
  try {
    // Check permissions
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');
    const isGroupLeader = await checkGroupLeadership(env, currentUserEmail, projectId, groupId);
    const isSelfRemoval = userEmail === currentUserEmail;

    if (!isAdmin && !hasManagePermission && !isGroupLeader && !isSelfRemoval) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to remove users from groups');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }

    // Check if group allows changes (except for self-removal)
    if (!group.allowChange && !isSelfRemoval) {
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }

    // Find user
    const user = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Find membership
    const membership = await env.DB.prepare(`
      SELECT membershipId FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail = ?
    `).bind(projectId, groupId, userEmail).first();

    if (!membership) {
      return errorResponse('USER_NOT_IN_GROUP', 'User is not a member of this group');
    }

    // Remove membership
    await env.DB.prepare(`
      DELETE FROM usergroups WHERE membershipId = ?
    `).bind(membership.membershipId).run();

    // Log member removal
    await logProjectOperation(env, currentUserEmail, projectId, 'member_removed', 'group', groupId, {
      removalType: isSelfRemoval ? 'self' : 'by_manager'
    }, {
      relatedEntities: {
        user: userEmail
      }
    });

    // 通知被移除的用戶（如果不是自己移除自己）
    try {
      if (!isSelfRemoval) {
        const groupName = (group as any).groupName || '未命名群組';
        await queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'group_member_removed',
          title: '您已被移出群組',
          content: `您已被從 ${groupName} 群組中移除`,
          projectId,
          groupId
        });
      }
    } catch (error) {
      console.error('[removeUserFromGroup] Failed to send notification:', error);
    }

    return successResponse(null, 'User removed from group successfully');
  } catch (error) {
    console.error('Remove user from group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to remove user from group');
  }
}

/**
 * List groups in project
 */
export async function listProjectGroups(
  env: Env,
  userEmail: string,
  projectId: string,
  includeInactive: boolean = false
): Promise<Response> {
  try {
    // Check access
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    const hasViewPermission = await hasProjectPermission(env, userEmail, projectId, 'view');

    const userId = await getUserId(env, userEmail);
    const isProjectMember = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM usergroups WHERE projectId = ? AND userEmail = ?
    `).bind(projectId, userEmail).first();

    if (!isAdmin && !hasViewPermission && (!isProjectMember || (isProjectMember.count as number) === 0)) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view groups');
    }

    // Get groups with creator display name
    const statusFilter = includeInactive ? '' : " AND g.status = 'active'";
    const groups = await env.DB.prepare(`
      SELECT
        g.*,
        u.displayName as creatorDisplayName
      FROM groups g
      LEFT JOIN users u ON g.createdBy = u.userId
      WHERE g.projectId = ?${statusFilter}
      ORDER BY g.createdTime
    `).bind(projectId).all();

    // Enrich groups with details
    const groupsWithDetails = await Promise.all(
      groups.results.map(async (group: any) => {
        // Get members
        const members = await env.DB.prepare(`
          SELECT pug.membershipId, u.userId, u.userEmail, u.displayName, pug.role, pug.joinTime,
                 u.avatarSeed, u.avatarStyle, u.avatarOptions
          FROM usergroups pug
          JOIN users u ON pug.userEmail = u.userEmail
          WHERE pug.projectId = ? AND pug.groupId = ? AND pug.isActive = 1
        `).bind(projectId, group.groupId).all();

        // Check if current user is group leader
        const isGroupLeader = members.results.some((m: any) =>
          m.userEmail === userEmail && m.role === 'leader'
        );

        // Include member details if user is leader or admin
        const memberDetails = (isGroupLeader || isAdmin) ? members.results.map((m: any) => ({
          membershipId: m.membershipId,
          userId: m.userId,
          userEmail: m.userEmail,
          displayName: m.displayName,
          role: m.role,
          joinTime: m.joinTime,
          avatarSeed: m.avatarSeed,
          avatarStyle: m.avatarStyle,
          avatarOptions: m.avatarOptions
        })) : [];

        // Calculate member and leader counts separately
        const memberCount = members.results.filter((m: any) => m.role === 'member').length;
        const leaderCount = members.results.filter((m: any) => m.role === 'leader').length;

        return {
          groupId: group.groupId,
          groupName: group.groupName,
          description: group.description,
          status: group.status,
          allowChange: Boolean(group.allowChange),
          memberCount: memberCount,
          leaderCount: leaderCount,
          members: memberDetails
        };
      })
    );

    return successResponse(groupsWithDetails);
  } catch (error) {
    console.error('List project groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to list project groups');
  }
}

/**
 * Helper functions
 */

async function checkGroupLeadership(
  env: Env,
  userEmail: string,
  projectId: string,
  groupId: string
): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM usergroups
    WHERE projectId = ? AND groupId = ? AND userEmail = ? AND role = 'leader'
  `).bind(projectId, groupId, userEmail).first();

  return result ? (result.count as number) > 0 : false;
}

async function getUserId(env: Env, userEmail: string): Promise<string | null> {
  const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail).first();
  return user ? (user.userId as string) : null;
}

async function checkGlobalPermission(env: Env, userEmail: string, permission: string): Promise<boolean> {
  const userId = await getUserId(env, userEmail);
  if (!userId) return false;
  return await hasGlobalPermission(env.DB, userId, permission);
}

// Wrapper for hasProjectPermission that handles userEmail -> userId conversion
async function hasProjectPermission(
  env: Env,
  userEmail: string,
  projectId: string,
  permission: string
): Promise<boolean> {
  const userId = await getUserId(env, userEmail);
  if (!userId) return false;
  return await checkProjectPermission(env.DB, userId, projectId, permission);
}

// Legacy function - should be phased out
async function _checkGlobalPermission_OLD(env: Env, userEmail: string, permission: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT gg.globalPermissions
    FROM globalusergroups gug
    JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
    JOIN users u ON gug.userEmail = u.userEmail
    WHERE u.userEmail = ?
  `).bind(userEmail).all();

  for (const row of result.results) {
    const permissions = parseJSON<string[]>(row.globalPermissions as string, []);
    if (permissions.includes(permission)) {
      return true;
    }
  }

  return false;
}

// Logging is now handled by centralized utils/logging module

/**
 * Get group members for mentioned groups (batch query)
 * Used for resolving @group mentions in comments
 */
export async function getGroupMentionData(
  env: Env,
  userEmail: string,
  projectId: string,
  groupIds: string[]
): Promise<Response> {
  try {
    console.log('[getGroupMentionData] Starting with groupIds:', groupIds);

    if (!groupIds || groupIds.length === 0) {
      return successResponse({ userEmailToDisplayName: {} });
    }

    // Build query with IN clause for multiple groupIds
    const placeholders = groupIds.map(() => '?').join(',');
    const query = `
      SELECT DISTINCT
        ug.userEmail,
        u.displayName
      FROM usergroups ug
      JOIN users u ON ug.userEmail = u.userEmail
      WHERE ug.projectId = ?
        AND ug.groupId IN (${placeholders})
        AND ug.isActive = 1
    `;

    console.log('[getGroupMentionData] Executing query with', groupIds.length, 'groups');

    const result = await env.DB.prepare(query)
      .bind(projectId, ...groupIds)
      .all();

    // Build email → displayName mapping
    const userEmailToDisplayName: Record<string, string> = {};

    if (result.results) {
      for (const row of result.results) {
        const email = row.userEmail as string;
        const displayName = row.displayName as string;

        if (email && displayName) {
          userEmailToDisplayName[email] = displayName;
        }
      }
    }

    console.log('[getGroupMentionData] Found', Object.keys(userEmailToDisplayName).length, 'users');

    return successResponse({
      userEmailToDisplayName,
      groupCount: groupIds.length,
      userCount: Object.keys(userEmailToDisplayName).length
    });

  } catch (error) {
    console.error('[getGroupMentionData] Error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get group mention data');
  }
}

/**
 * Batch remove multiple users from a group
 * Optimized version that uses single D1 batch transaction instead of sequential API calls
 */
export async function batchRemoveUsersFromGroup(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  userEmails: string[]
): Promise<Response> {
  try {
    console.log('[batchRemoveUsersFromGroup] Starting batch remove with', userEmails.length, 'users');

    if (!userEmails || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'No user emails provided');
    }

    // Validate all emails first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of userEmails) {
      if (!emailRegex.test(email)) {
        return errorResponse('INVALID_INPUT', `Invalid email format: ${email}`);
      }
    }

    // Check permissions (same as single remove)
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');
    const isGroupLeader = await checkGroupLeadership(env, currentUserEmail, projectId, groupId);

    // For batch removal, we don't allow self-removal (must be admin/manager/leader)
    if (!isAdmin && !hasManagePermission && !isGroupLeader) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to remove users from groups');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }

    // Check if group allows changes (admins and users with manage permission can bypass)
    const canBypassLock = isAdmin || hasManagePermission;
    if ((group.allowChange === 0 || group.allowChange === false) && !canBypassLock) {
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }

    // Batch query: find all memberships
    const placeholders = userEmails.map(() => '?').join(',');
    const existingMemberships = await env.DB.prepare(`
      SELECT membershipId, userEmail FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail IN (${placeholders})
    `).bind(projectId, groupId, ...userEmails).all();

    if (existingMemberships.results.length === 0) {
      return errorResponse('USER_NOT_IN_GROUP', 'None of the specified users are members of this group');
    }

    const foundEmails = new Set(existingMemberships.results.map((m: any) => m.userEmail));
    const missingUsers = userEmails.filter(email => !foundEmails.has(email));

    // Prepare batch DELETE statements
    const deleteStatements = existingMemberships.results.map((membership: any) =>
      env.DB.prepare(`
        DELETE FROM usergroups WHERE membershipId = ?
      `).bind(membership.membershipId)
    );

    // Execute all deletes in a single batch transaction
    console.log('[batchRemoveUsersFromGroup] Executing batch delete for', deleteStatements.length, 'members');
    await env.DB.batch(deleteStatements);

    // Log the batch operation
    await logProjectOperation(env, currentUserEmail, projectId, 'members_batch_removed', 'group', groupId, {
      memberCount: existingMemberships.results.length,
      userEmails: Array.from(foundEmails).join(', ')
    });

    // Queue notifications for all removed users
    try {
      const groupName = (group as any).groupName || '未命名群組';
      const notificationPromises = existingMemberships.results.map((membership: any) =>
        queueSingleNotification(env, {
          targetUserEmail: membership.userEmail,
          type: 'group_member_removed',
          title: '您已被移出群組',
          content: `您已被從 ${groupName} 群組中移除`,
          projectId,
          groupId
        })
      );
      await Promise.allSettled(notificationPromises);
    } catch (error) {
      console.error('[batchRemoveUsersFromGroup] Failed to send notifications:', error);
      // Don't fail the entire operation if notifications fail
    }

    console.log('[batchRemoveUsersFromGroup] Successfully removed', existingMemberships.results.length, 'members');
    return successResponse({
      successCount: existingMemberships.results.length,
      failureCount: missingUsers.length,
      removedMembers: Array.from(foundEmails),
      notFoundMembers: missingUsers
    }, `Successfully removed ${existingMemberships.results.length} members from group`);

  } catch (error) {
    console.error('[batchRemoveUsersFromGroup] Error occurred:', error);
    console.error('[batchRemoveUsersFromGroup] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', 'Failed to batch remove users from group');
  }
}

/**
 * Batch add multiple users to a group
 * Optimized version that uses single D1 batch transaction instead of sequential API calls
 */
export async function batchAddUsersToGroup(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  members: Array<{ userEmail: string; role: string }>
): Promise<Response> {
  try {
    console.log('[batchAddUsersToGroup] Starting batch add with', members.length, 'members');

    if (!members || members.length === 0) {
      return errorResponse('INVALID_INPUT', 'No members provided');
    }

    // Validate all roles first
    for (const member of members) {
      if (!['member', 'leader'].includes(member.role)) {
        return errorResponse('INVALID_INPUT', `Invalid role "${member.role}". Must be "member" or "leader"`);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(member.userEmail)) {
        return errorResponse('INVALID_INPUT', `Invalid email format: ${member.userEmail}`);
      }
    }

    // Check permissions (same as single add)
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');
    const isGroupLeader = await checkGroupLeadership(env, currentUserEmail, projectId, groupId);

    if (!isAdmin && !hasManagePermission && !isGroupLeader) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to add users to groups');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }

    // Check if group allows changes
    const canBypassLock = isAdmin || hasManagePermission;
    if ((group.allowChange === 0 || group.allowChange === false) && !canBypassLock) {
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }

    // Check member limit
    const maxMembersPerGroup = await getConfigValue(env, 'MAX_MEMBERS_PER_GROUP', { parseAsInt: true });
    const currentMembersCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM usergroups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    const currentCount = (currentMembersCount?.count as number) || 0;
    if (currentCount + members.length > maxMembersPerGroup) {
      return errorResponse(
        'LIMIT_EXCEEDED',
        `Adding ${members.length} members would exceed maximum limit (${maxMembersPerGroup}). Current: ${currentCount}`
      );
    }

    // Batch validation: check all users exist and get their conflicts in one go
    const userEmails = members.map(m => m.userEmail);
    const placeholders = userEmails.map(() => '?').join(',');

    // Check all users exist
    const existingUsers = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail IN (${placeholders}) AND status = 'active'
    `).bind(...userEmails).all();

    const existingUserEmails = new Set(existingUsers.results.map((u: any) => u.userEmail));
    const missingUsers = userEmails.filter(email => !existingUserEmails.has(email));

    if (missingUsers.length > 0) {
      return errorResponse('USER_NOT_FOUND', `Users not found: ${missingUsers.join(', ')}`);
    }

    // Check for existing memberships in this group
    const existingMemberships = await env.DB.prepare(`
      SELECT userEmail FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail IN (${placeholders})
    `).bind(projectId, groupId, ...userEmails).all();

    if (existingMemberships.results.length > 0) {
      const duplicates = existingMemberships.results.map((m: any) => m.userEmail).join(', ');
      return errorResponse('USER_ALREADY_IN_GROUP', `Users already in group: ${duplicates}`);
    }

    // Check for teacher/observer roles
    const viewerRoles = await env.DB.prepare(`
      SELECT userEmail, role FROM projectviewers
      WHERE projectId = ? AND userEmail IN (${placeholders}) AND isActive = 1
    `).bind(projectId, ...userEmails).all();

    const conflicts = viewerRoles.results.filter((v: any) =>
      v.role === 'teacher' || v.role === 'observer'
    );

    if (conflicts.length > 0) {
      const conflictList = conflicts.map((c: any) => `${c.userEmail} (${c.role})`).join(', ');
      return errorResponse(
        'ROLE_CONFLICT',
        `Users with teacher/observer roles cannot join groups: ${conflictList}`
      );
    }

    // Check for memberships in other groups
    const otherGroupMemberships = await env.DB.prepare(`
      SELECT pug.userEmail, pg.groupName
      FROM usergroups pug
      JOIN groups pg ON pug.groupId = pg.groupId
      WHERE pug.projectId = ? AND pug.groupId != ? AND pug.userEmail IN (${placeholders})
        AND pug.isActive = 1
    `).bind(projectId, groupId, ...userEmails).all();

    if (otherGroupMemberships.results.length > 0) {
      const conflicts = otherGroupMemberships.results
        .map((m: any) => `${m.userEmail} (in ${m.groupName})`)
        .join(', ');
      return errorResponse('USER_ALREADY_IN_PROJECT_GROUP', `Users already in other groups: ${conflicts}`);
    }

    // All validations passed - create batch insert
    const timestamp = Date.now();
    const insertStatements = members.map(({ userEmail, role }) => {
      const membershipId = generateId('member');
      return env.DB.prepare(`
        INSERT INTO usergroups (
          membershipId, projectId, groupId, userEmail, role, joinTime
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(membershipId, projectId, groupId, userEmail, role, timestamp);
    });

    // Execute all inserts in a single batch transaction
    console.log('[batchAddUsersToGroup] Executing batch insert for', insertStatements.length, 'members');
    await env.DB.batch(insertStatements);

    // Log the batch operation
    await logProjectOperation(env, currentUserEmail, projectId, 'members_batch_added', 'group', groupId, {
      memberCount: members.length,
      roles: members.map(m => m.role),
      userEmails: userEmails.join(', ')
    });

    // Queue notifications for all added users
    try {
      const groupName = (group as any).groupName || '未命名群組';
      const notificationPromises = members.map(({ userEmail, role }) =>
        queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'group_member_added',
          title: '您已被加入群組',
          content: `您已被加入 ${groupName} 群組${role === 'leader' ? '，並擔任組長' : ''}`,
          projectId,
          groupId
        })
      );
      await Promise.allSettled(notificationPromises);
    } catch (error) {
      console.error('[batchAddUsersToGroup] Failed to send notifications:', error);
      // Don't fail the entire operation if notifications fail
    }

    console.log('[batchAddUsersToGroup] Successfully added', members.length, 'members');
    return successResponse({
      successCount: members.length,
      groupId,
      addedMembers: members.map(m => ({
        userEmail: m.userEmail,
        role: m.role,
        joinTime: timestamp
      }))
    }, `Successfully added ${members.length} members to group`);

  } catch (error) {
    console.error('[batchAddUsersToGroup] Error occurred:', error);
    console.error('[batchAddUsersToGroup] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', 'Failed to batch add users to group');
  }
}

/**
 * Update a member's role in a group
 * Permission: System admin or project manager only (NOT group leader)
 */
export async function updateMemberRole(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  userEmail: string,
  newRole: 'member' | 'leader'
): Promise<Response> {
  try {
    console.log('[updateMemberRole] Starting with params:', { currentUserEmail, projectId, groupId, userEmail, newRole });

    // Validate role
    if (!['member', 'leader'].includes(newRole)) {
      return errorResponse('INVALID_INPUT', 'Invalid role. Must be "member" or "leader"');
    }

    // Check permissions - ONLY system admin and project managers allowed
    // Group leaders are NOT allowed to update roles
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');

    console.log('[updateMemberRole] Permission check:', { isAdmin, hasManagePermission });

    if (!isAdmin && !hasManagePermission) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators and project managers can update member roles');
    }

    // Prevent self-role modification
    if (userEmail === currentUserEmail) {
      return errorResponse('ACCESS_DENIED', 'You cannot modify your own role');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }

    // Check if group allows changes (admins and managers can bypass)
    const canBypassLock = isAdmin || hasManagePermission;
    if ((group.allowChange === 0 || group.allowChange === false) && !canBypassLock) {
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }

    // Find membership
    const membership = await env.DB.prepare(`
      SELECT membershipId, role FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail = ?
    `).bind(projectId, groupId, userEmail).first();

    if (!membership) {
      return errorResponse('USER_NOT_IN_GROUP', 'User is not a member of this group');
    }

    // Check if role is already the same
    if (membership.role === newRole) {
      return successResponse(null, 'Role is already set to ' + newRole);
    }

    const oldRole = membership.role as string;

    // Update role
    await env.DB.prepare(`
      UPDATE usergroups SET role = ? WHERE membershipId = ?
    `).bind(newRole, membership.membershipId).run();

    console.log('[updateMemberRole] Role updated successfully:', { oldRole, newRole });

    // Log role update
    await logProjectOperation(env, currentUserEmail, projectId, 'member_role_updated', 'group', groupId, {
      oldRole,
      newRole
    }, {
      relatedEntities: {
        user: userEmail
      }
    });

    // Notify the user about role change
    try {
      const groupName = (group as any).groupName || '未命名群組';
      const roleText = newRole === 'leader' ? '組長' : '成員';
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'group_role_updated',
        title: '群組角色已更新',
        content: `您在 ${groupName} 的角色已更新為${roleText}`,
        projectId,
        groupId
      });
    } catch (error) {
      console.error('[updateMemberRole] Failed to send notification:', error);
    }

    return successResponse({
      userEmail,
      groupId,
      oldRole,
      newRole
    }, 'Member role updated successfully');

  } catch (error) {
    console.error('[updateMemberRole] Error occurred:', error);
    console.error('[updateMemberRole] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', 'Failed to update member role');
  }
}

/**
 * Batch update multiple members' roles in a group
 * Permission: System admin or project manager only (NOT group leader)
 */
export async function batchUpdateMemberRoles(
  env: Env,
  currentUserEmail: string,
  projectId: string,
  groupId: string,
  updates: Array<{ userEmail: string; newRole: 'member' | 'leader' }>
): Promise<Response> {
  try {
    console.log('[batchUpdateMemberRoles] Starting batch update with', updates.length, 'updates');

    if (!updates || updates.length === 0) {
      return errorResponse('INVALID_INPUT', 'No role updates provided');
    }

    // Validate all roles first
    for (const update of updates) {
      if (!['member', 'leader'].includes(update.newRole)) {
        return errorResponse('INVALID_INPUT', `Invalid role "${update.newRole}". Must be "member" or "leader"`);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(update.userEmail)) {
        return errorResponse('INVALID_INPUT', `Invalid email format: ${update.userEmail}`);
      }

      // Prevent self-role modification
      if (update.userEmail === currentUserEmail) {
        return errorResponse('ACCESS_DENIED', 'You cannot modify your own role');
      }
    }

    // Check permissions - ONLY system admin and project managers allowed
    const isAdmin = await checkGlobalPermission(env, currentUserEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, currentUserEmail, projectId, 'manage');

    console.log('[batchUpdateMemberRoles] Permission check:', { isAdmin, hasManagePermission });

    if (!isAdmin && !hasManagePermission) {
      return errorResponse('ACCESS_DENIED', 'Only system administrators and project managers can update member roles');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ? AND status = 'active'
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }

    // Check if group allows changes (admins and managers can bypass)
    const canBypassLock = isAdmin || hasManagePermission;
    if ((group.allowChange === 0 || group.allowChange === false) && !canBypassLock) {
      return errorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }

    // Batch query: find all memberships
    const userEmails = updates.map(u => u.userEmail);
    const placeholders = userEmails.map(() => '?').join(',');
    const existingMemberships = await env.DB.prepare(`
      SELECT membershipId, userEmail, role FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail IN (${placeholders})
    `).bind(projectId, groupId, ...userEmails).all();

    if (existingMemberships.results.length === 0) {
      return errorResponse('USER_NOT_IN_GROUP', 'None of the specified users are members of this group');
    }

    const membershipMap = new Map(
      existingMemberships.results.map((m: any) => [m.userEmail, { membershipId: m.membershipId, oldRole: m.role }])
    );

    const missingUsers = userEmails.filter(email => !membershipMap.has(email));
    if (missingUsers.length > 0) {
      return errorResponse('USER_NOT_IN_GROUP', `Users not in group: ${missingUsers.join(', ')}`);
    }

    // Prepare batch UPDATE statements (only for members whose role is actually changing)
    const updateStatements: any[] = [];
    const updatedMembers: Array<{ userEmail: string; oldRole: string; newRole: string }> = [];

    for (const update of updates) {
      const membership = membershipMap.get(update.userEmail);
      if (membership && membership.oldRole !== update.newRole) {
        updateStatements.push(
          env.DB.prepare(`
            UPDATE usergroups SET role = ? WHERE membershipId = ?
          `).bind(update.newRole, membership.membershipId)
        );

        updatedMembers.push({
          userEmail: update.userEmail,
          oldRole: membership.oldRole as string,
          newRole: update.newRole
        });
      }
    }

    if (updateStatements.length === 0) {
      return successResponse({
        successCount: 0,
        message: 'No role changes needed (all users already have the specified roles)'
      });
    }

    // Execute all updates in a single batch transaction
    console.log('[batchUpdateMemberRoles] Executing batch update for', updateStatements.length, 'members');
    await env.DB.batch(updateStatements);

    // Log the batch operation
    await logProjectOperation(env, currentUserEmail, projectId, 'members_roles_batch_updated', 'group', groupId, {
      updateCount: updatedMembers.length,
      updates: updatedMembers.map(u => `${u.userEmail}: ${u.oldRole} → ${u.newRole}`).join(', ')
    });

    // Queue notifications for all updated users
    try {
      const groupName = (group as any).groupName || '未命名群組';
      const notificationPromises = updatedMembers.map(({ userEmail, newRole }) => {
        const roleText = newRole === 'leader' ? '組長' : '成員';
        return queueSingleNotification(env, {
          targetUserEmail: userEmail,
          type: 'group_role_updated',
          title: '群組角色已更新',
          content: `您在 ${groupName} 的角色已更新為${roleText}`,
          projectId,
          groupId
        });
      });
      await Promise.allSettled(notificationPromises);
    } catch (error) {
      console.error('[batchUpdateMemberRoles] Failed to send notifications:', error);
      // Don't fail the entire operation if notifications fail
    }

    console.log('[batchUpdateMemberRoles] Successfully updated', updatedMembers.length, 'member roles');
    return successResponse({
      successCount: updatedMembers.length,
      skippedCount: updates.length - updatedMembers.length,
      updatedMembers: updatedMembers.map(m => ({
        userEmail: m.userEmail,
        oldRole: m.oldRole,
        newRole: m.newRole
      }))
    }, `Successfully updated ${updatedMembers.length} member roles`);

  } catch (error) {
    console.error('[batchUpdateMemberRoles] Error occurred:', error);
    console.error('[batchUpdateMemberRoles] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', 'Failed to batch update member roles');
  }
}
