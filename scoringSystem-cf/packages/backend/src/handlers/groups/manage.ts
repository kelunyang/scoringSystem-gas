/**
 * Group Management Handlers
 * Migrated from GAS scripts/groups_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { generateId } from '@utils/id-generator';
import { parseJSON, stringifyJSON } from '@utils/json';
import { hasProjectPermission as checkProjectPermission, hasGlobalPermission } from '@utils/permissions';
import { logProjectOperation, generateChanges } from '@utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { getGroupMemberEmails } from '@utils/notifications';

/**
 * Create a new group in a project
 */
export async function createGroup(
  env: Env,
  userEmail: string,
  projectId: string,
  groupData: {
    groupName: string;
    description?: string;
    allowChange?: boolean;
  }
): Promise<Response> {
  try {
    console.log('🔍 [createGroup] Entry:', { userEmail, projectId, groupData });
    console.log('  - groupData details:');
    console.log('    - groupName:', groupData.groupName);
    console.log('    - description:', groupData.description);
    console.log('    - allowChange:', groupData.allowChange, typeof groupData.allowChange);

    if (!groupData.groupName) {
      console.log('❌ [createGroup] Group name is missing');
      return errorResponse('INVALID_INPUT', 'Group name is required');
    }
    console.log('✅ [createGroup] Group name validation passed');

    // Check permissions
    console.log('🔍 [createGroup] Starting permission checks...');

    let hasManagePermission = false;
    try {
      console.log('🔍 [createGroup] Calling hasProjectPermission...');
      hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');
      console.log('✅ [createGroup] hasProjectPermission result:', hasManagePermission);
    } catch (error) {
      console.error('❌ [createGroup] hasProjectPermission error:', {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error; // Re-throw to be caught by outer catch
    }

    let isCreator = false;
    try {
      console.log('🔍 [createGroup] Calling isProjectCreator...');
      isCreator = await isProjectCreator(env, userEmail, projectId);
      console.log('✅ [createGroup] isProjectCreator result:', isCreator);
    } catch (error) {
      console.error('❌ [createGroup] isProjectCreator error:', {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error; // Re-throw to be caught by outer catch
    }

    console.log('🔍 [createGroup] Permission check results:', {
      hasManagePermission,
      isCreator,
      hasAccess: hasManagePermission || isCreator
    });

    if (!hasManagePermission && !isCreator) {
      console.log('❌ [createGroup] Access denied - insufficient permissions');
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to create groups');
    }
    console.log('✅ [createGroup] Permission checks passed');

    // Check group limit first
    console.log('🔍 [createGroup] Checking group limit...');
    const maxGroupsPerProject = parseInt(env.MAX_GROUPS_PER_PROJECT || '20');
    const activeGroupsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM groups WHERE projectId = ? AND status = 'active'
    `).bind(projectId).first();
    console.log('✅ [createGroup] Active groups count:', activeGroupsCount, 'max:', maxGroupsPerProject);

    if (activeGroupsCount && (activeGroupsCount.count as number) >= maxGroupsPerProject) {
      console.log('❌ [createGroup] Group limit exceeded');
      return errorResponse('LIMIT_EXCEEDED', `Maximum groups per project limit (${maxGroupsPerProject}) reached`);
    }

    // Generate unique group ID and system-generated group name
    console.log('🔍 [createGroup] Generating group ID and timestamp...');
    const groupId = generateId('group');
    const timestamp = Date.now();

    // System-generated unique group name: "分組" + groupId (without 'group' prefix)
    const systemGroupName = `分組${groupId.replace('group', '')}`;

    // User-provided name goes to description
    const userProvidedName = groupData.groupName.substring(0, 50);
    const description = groupData.description
      ? groupData.description.substring(0, 200)
      : userProvidedName;

    console.log('✅ [createGroup] Generated:', {
      groupId,
      systemGroupName,
      userProvidedName,
      description,
      timestamp
    });

    console.log('🔍 [createGroup] Getting userId...');
    const userId = await getUserId(env, userEmail);
    console.log('🔍 [createGroup] getUserId result:', { userEmail, userId });

    if (!userId) {
      console.error('❌ [createGroup] userId is null for userEmail:', userEmail);
      return errorResponse('SYSTEM_ERROR', 'Failed to get user ID');
    }

    console.log('🔍 [createGroup] Preparing to insert group:', {
      groupId,
      projectId,
      systemGroupName,
      description,
      userId,
      timestamp
    });

    const allowChangeValue = groupData.allowChange !== false ? 1 : 0;
    console.log('💾 [createGroup] Before DB insert:');
    console.log('  - groupData.allowChange:', groupData.allowChange, typeof groupData.allowChange);
    console.log('  - calculated allowChangeValue:', allowChangeValue);

    const insertResult = await env.DB.prepare(`
      INSERT INTO groups (
        groupId, projectId, groupName, description, createdBy,
        createdTime, status, allowChange
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      groupId,
      projectId,
      systemGroupName,
      description,
      userId,
      timestamp,
      'active',
      allowChangeValue
    ).run();

    console.log('✅ [createGroup] Group inserted successfully:', {
      groupId,
      insertResult: insertResult?.meta
    });

    // Log creation
    console.log('🔍 [createGroup] Calling logProjectOperation...');
    await logProjectOperation(env, userEmail, projectId, 'group_created', 'group', groupId, {});
    console.log('✅ [createGroup] logProjectOperation completed');

    console.log('🔍 [createGroup] Preparing successResponse...');
    return successResponse({
      groupId,
      groupName: systemGroupName,
      description: description,
      createdTime: timestamp,
      status: 'active',
      allowChange: groupData.allowChange !== false
    }, 'Group created successfully');
  } catch (error) {
    console.error('❌ [createGroup] FATAL ERROR:', {
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      userEmail,
      projectId,
      groupData
    });
    return errorResponse('SYSTEM_ERROR', 'Failed to create group');
  }
}

/**
 * Batch create multiple groups in a project
 */
export async function batchCreateGroups(
  env: Env,
  userEmail: string,
  projectId: string,
  params: {
    groupCount: number;
    allowChange?: boolean;
    namePrefix?: string;
  }
): Promise<Response> {
  try {
    console.log('🔍 [batchCreateGroups] Entry:', { userEmail, projectId, params });

    const { groupCount, allowChange = true, namePrefix = '學生分組' } = params;

    // Validate groupCount
    if (groupCount < 1 || groupCount > 20) {
      console.log('❌ [batchCreateGroups] Invalid group count:', groupCount);
      return errorResponse('INVALID_INPUT', 'Group count must be between 1 and 20');
    }

    // Check permissions
    console.log('🔍 [batchCreateGroups] Starting permission checks...');
    const hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');
    const isCreator = await isProjectCreator(env, userEmail, projectId);

    console.log('🔍 [batchCreateGroups] Permission check results:', {
      hasManagePermission,
      isCreator,
      hasAccess: hasManagePermission || isCreator
    });

    if (!hasManagePermission && !isCreator) {
      console.log('❌ [batchCreateGroups] Access denied - insufficient permissions');
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to create groups');
    }
    console.log('✅ [batchCreateGroups] Permission checks passed');

    // Check total group limit
    console.log('🔍 [batchCreateGroups] Checking group limit...');
    const maxGroupsPerProject = parseInt(env.MAX_GROUPS_PER_PROJECT || '20');
    const activeGroupsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM groups WHERE projectId = ? AND status = 'active'
    `).bind(projectId).first();

    const currentCount = (activeGroupsCount?.count as number) || 0;
    console.log('✅ [batchCreateGroups] Current active groups:', currentCount, 'max:', maxGroupsPerProject);

    if (currentCount + groupCount > maxGroupsPerProject) {
      console.log('❌ [batchCreateGroups] Group limit would be exceeded');
      return errorResponse('LIMIT_EXCEEDED',
        `Cannot create ${groupCount} groups. Current: ${currentCount}, Max: ${maxGroupsPerProject}`);
    }

    // Get userId
    console.log('🔍 [batchCreateGroups] Getting userId...');
    const userId = await getUserId(env, userEmail);
    console.log('🔍 [batchCreateGroups] getUserId result:', { userEmail, userId });

    if (!userId) {
      console.error('❌ [batchCreateGroups] userId is null for userEmail:', userEmail);
      return errorResponse('SYSTEM_ERROR', 'Failed to get user ID');
    }

    const timestamp = Date.now();
    const createdGroups: Array<{
      groupId: string;
      systemGroupName: string;
      userProvidedName: string;
      description: string;
    }> = [];

    const insertStatements = [];

    // Prepare batch insert statements
    console.log(`💾 [batchCreateGroups] Preparing ${groupCount} groups for insertion...`);
    const allowChangeValue = allowChange ? 1 : 0;

    for (let i = 1; i <= groupCount; i++) {
      const groupId = generateId('group');
      const systemGroupName = `分組${groupId.replace('group', '')}`;
      const userProvidedName = `${namePrefix}${i}`;
      const description = `第${i}組學生分組`;

      insertStatements.push(
        env.DB.prepare(`
          INSERT INTO groups (
            groupId, projectId, groupName, description, createdBy,
            createdTime, status, allowChange
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          groupId,
          projectId,
          systemGroupName,
          description,
          userId,
          timestamp,
          'active',
          allowChangeValue
        )
      );

      createdGroups.push({
        groupId,
        systemGroupName,
        userProvidedName,
        description
      });
    }

    // Execute batch insert
    console.log(`💾 [batchCreateGroups] Executing batch insert for ${groupCount} groups...`);
    await env.DB.batch(insertStatements);
    console.log('✅ [batchCreateGroups] Batch insert completed successfully');

    // Log batch creation operation with rich metadata
    console.log('🔍 [batchCreateGroups] Logging batch operation...');
    await logProjectOperation(env, userEmail, projectId, 'groups_batch_created', 'group', 'batch', {
      totalGroups: groupCount,
      namePrefix,
      allowChange,
      createdGroupIds: createdGroups.map(g => g.groupId),
      groupNames: createdGroups.map(g => g.systemGroupName),
      userProvidedNames: createdGroups.map(g => g.userProvidedName),
      descriptions: createdGroups.map(g => g.description),
      timestamp,
      operatorEmail: userEmail,
      operatorUserId: userId,
      firstGroupId: createdGroups[0].groupId,
      lastGroupId: createdGroups[groupCount - 1].groupId
    }, {
      level: 'info',
      relatedEntities: {
        firstGroup: createdGroups[0].groupId,
        lastGroup: createdGroups[groupCount - 1].groupId
      }
    });

    console.log('✅ [batchCreateGroups] Batch operation logged successfully');
    console.log(`✅ [batchCreateGroups] Successfully created ${groupCount} groups`);

    return successResponse({
      createdCount: groupCount,
      groups: createdGroups.map(g => ({
        groupId: g.groupId,
        groupName: g.systemGroupName,
        description: g.description,
        allowChange,
        status: 'active',
        createdTime: timestamp,
        memberCount: 0,
        leaderCount: 0
      }))
    }, `Successfully created ${groupCount} groups`);

  } catch (error) {
    console.error('❌ [batchCreateGroups] FATAL ERROR:', {
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      userEmail,
      projectId,
      params
    });
    return errorResponse('SYSTEM_ERROR', 'Failed to batch create groups');
  }
}

/**
 * Get group details
 */
export async function getGroup(
  env: Env,
  userEmail: string,
  projectId: string,
  groupId: string
): Promise<Response> {
  try {
    // Check access
    const hasAccess = await checkGroupAccess(env, userEmail, projectId, groupId);
    if (!hasAccess) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view group');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Group not found');
    }

    // Get members
    const members = await env.DB.prepare(`
      SELECT pug.membershipId, u.userId, u.userEmail, u.displayName, pug.role, pug.joinTime,
             u.avatarSeed, u.avatarStyle, u.avatarOptions
      FROM usergroups pug
      JOIN users u ON pug.userEmail = u.userEmail
      WHERE pug.projectId = ? AND pug.groupId = ? AND pug.isActive = 1
    `).bind(projectId, groupId).all();

    return successResponse({
      groupId: group.groupId,
      groupName: group.groupName,
      description: group.description,
      status: group.status,
      allowChange: Boolean(group.allowChange),
      createdBy: group.createdBy,
      createdTime: group.createdTime,
      memberCount: members.results.length,
      members: members.results.map((m: any) => ({
        membershipId: m.membershipId,
        userId: m.userId,
        userEmail: m.userEmail,
        displayName: m.displayName,
        role: m.role,
        joinTime: m.joinTime,
        avatarSeed: m.avatarSeed,
        avatarStyle: m.avatarStyle,
        avatarOptions: m.avatarOptions
      }))
    });
  } catch (error) {
    console.error('Get group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get group');
  }
}

/**
 * Update group details
 */
export async function updateGroup(
  env: Env,
  userEmail: string,
  projectId: string,
  groupId: string,
  updates: {
    groupName?: string;
    description?: string;
    allowChange?: boolean;
  }
): Promise<Response> {
  try {
    // Check permissions
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    const hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');

    // Check if user is the group leader
    const isGroupLeader = await env.DB.prepare(`
      SELECT role FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail = ? AND role = 'leader'
    `).bind(projectId, groupId, userEmail).first();

    const userGroupRole = await env.DB.prepare(`
      SELECT * FROM usergroups
      WHERE projectId = ? AND groupId = ? AND userEmail = ?
    `).bind(projectId, groupId, userEmail).first();

    console.log('🔍 [updateGroup] Permission check:', {
      userEmail,
      projectId,
      groupId,
      isAdmin,
      hasManagePermission,
      isGroupLeader,
      userGroupRole,
      canUpdateBasicInfo: !!(isAdmin || hasManagePermission || isGroupLeader)
    });

    // Permission levels
    const canUpdateAnyField = isAdmin || hasManagePermission;
    const canUpdateBasicInfo = canUpdateAnyField || !!isGroupLeader;

    if (!canUpdateBasicInfo) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to update groups');
    }

    // If group leader (but not admin/teacher), restrict to name/description only
    if (isGroupLeader && !canUpdateAnyField) {
      if (updates.allowChange !== undefined) {
        return errorResponse('ACCESS_DENIED', 'Group leaders cannot modify allowChange setting');
      }
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Group not found');
    }

    // Store old group name for notification
    const oldGroupName = (group as any).groupName;

    // Validate updates
    const allowedUpdates: any = {};

    if (updates.groupName !== undefined) {
      const newName = updates.groupName.substring(0, 50);

      // Check for conflicts
      const existingGroup = await env.DB.prepare(`
        SELECT groupId FROM groups
        WHERE projectId = ? AND groupId != ? AND LOWER(groupName) = LOWER(?) AND status = 'active'
      `).bind(projectId, groupId, newName).first();

      if (existingGroup) {
        return errorResponse('GROUP_EXISTS', 'Group name already exists in this project');
      }

      allowedUpdates.groupName = newName;
    }

    if (updates.description !== undefined) {
      allowedUpdates.description = updates.description.substring(0, 200);
    }

    if (updates.allowChange !== undefined) {
      allowedUpdates.allowChange = updates.allowChange ? 1 : 0;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Build UPDATE query
    const setClause = Object.keys(allowedUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(allowedUpdates);

    await env.DB.prepare(`
      UPDATE groups SET ${setClause} WHERE projectId = ? AND groupId = ?
    `).bind(...values, projectId, groupId).run();

    // Log update with full change tracking
    const changes = generateChanges(group, allowedUpdates);

    await logProjectOperation(env, userEmail, projectId, 'group_updated', 'group', groupId, {
      changes,  // Complete before/after comparison
      updatedFields: Object.keys(allowedUpdates)  // Kept for backward compatibility
    });

    // Notify all members if group name changed
    if (allowedUpdates.groupName) {
      try {
        const groupMembers = await getGroupMemberEmails(env, projectId, groupId);

        for (const memberEmail of groupMembers) {
          if (memberEmail !== userEmail) {
            await queueSingleNotification(env, {
              targetUserEmail: memberEmail,
              type: 'group_member_added',
              title: '群組資訊已更新',
              content: `您的群組「${oldGroupName}」已更名為「${allowedUpdates.groupName}」`,
              projectId,
              groupId,
              metadata: {
                oldGroupName,
                newGroupName: allowedUpdates.groupName,
                updatedBy: userEmail
              }
            });
          }
        }
      } catch (notifError) {
        console.error('[updateGroup] Failed to send notifications:', notifError);
      }
    }

    return successResponse(null, 'Group updated successfully');
  } catch (error) {
    console.error('Update group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update group');
  }
}

/**
 * Delete group (mark as inactive)
 */
export async function deleteGroup(
  env: Env,
  userEmail: string,
  projectId: string,
  groupId: string
): Promise<Response> {
  try {
    // Check permissions
    const hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');

    if (!hasManagePermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to delete groups');
    }

    // Get group
    const group = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    if (!group) {
      return errorResponse('GROUP_NOT_FOUND', 'Group not found');
    }

    // Store group name and get members for notification before deletion checks
    const groupName = (group as any).groupName || '未命名群組';
    const groupMembers = await getGroupMemberEmails(env, projectId, groupId);

    // Check for active members
    const activeMembers = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM usergroups WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    if (activeMembers && (activeMembers.count as number) > 0) {
      return errorResponse('GROUP_NOT_EMPTY', 'Cannot delete group with active members');
    }

    // Check for submissions
    const submissions = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM submissions_with_status WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).first();

    if (submissions && (submissions.count as number) > 0) {
      return errorResponse('GROUP_HAS_DATA', 'Cannot delete group with existing submissions');
    }

    // Mark as inactive
    await env.DB.prepare(`
      UPDATE groups SET status = 'inactive' WHERE projectId = ? AND groupId = ?
    `).bind(projectId, groupId).run();

    // Log deletion
    await logProjectOperation(env, userEmail, projectId, 'group_deleted', 'group', groupId, {});

    // Notify all members about group deletion
    // Note: In practice, this won't send notifications because deletion is only allowed for empty groups
    // This code is here for future-proofing in case the deletion logic changes
    if (groupMembers.length > 0) {
      try {
        for (const memberEmail of groupMembers) {
          if (memberEmail !== userEmail) {
            await queueSingleNotification(env, {
              targetUserEmail: memberEmail,
              type: 'group_member_removed',
              title: '群組已被刪除',
              content: `您所在的群組「${groupName}」已被刪除`,
              projectId,
              groupId,
              metadata: {
                groupName,
                deletedBy: userEmail
              }
            });
          }
        }
      } catch (notifError) {
        console.error('[deleteGroup] Failed to send notifications:', notifError);
      }
    }

    return successResponse(null, 'Group deleted successfully');
  } catch (error) {
    console.error('Delete group error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to delete group');
  }
}

/**
 * Helper functions
 */

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

async function isProjectCreator(env: Env, userEmail: string, projectId: string): Promise<boolean> {
  const userId = await getUserId(env, userEmail);
  const project = await env.DB.prepare('SELECT createdBy FROM projects WHERE projectId = ?')
    .bind(projectId).first();
  return project ? project.createdBy === userId : false;
}

async function checkGroupAccess(
  env: Env,
  userEmail: string,
  projectId: string,
  groupId: string
): Promise<boolean> {
  const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
  if (isAdmin) return true;

  const hasViewPermission = await hasProjectPermission(env, userEmail, projectId, 'view');
  if (hasViewPermission) return true;

  const membership = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM usergroups
    WHERE projectId = ? AND groupId = ? AND userEmail = ?
  `).bind(projectId, groupId, userEmail).first();

  return membership ? (membership.count as number) > 0 : false;
}

async function getUserId(env: Env, userEmail: string): Promise<string | null> {
  const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail).first();
  return user ? (user.userId as string) : null;
}

async function checkGlobalPermission(env: Env, userEmail: string, permission: string): Promise<boolean> {
  try {
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
  } catch (error) {
    console.warn('Check global permission error:', error);
    return false;
  }
}

/**
 * Batch update group status (activate/deactivate multiple groups)
 */
export async function batchUpdateGroupStatus(
  env: Env,
  userEmail: string,
  projectId: string,
  groupIds: string[],
  status: 'active' | 'inactive'
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupIds || groupIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupIds array is required');
    }

    if (groupIds.length > 50) {
      return errorResponse('INVALID_INPUT', 'Cannot update more than 50 groups at once');
    }

    if (!['active', 'inactive'].includes(status)) {
      return errorResponse('INVALID_INPUT', 'Status must be either "active" or "inactive"');
    }

    // Check if user has permission to manage groups in this project
    const hasPerm = await hasProjectPermission(env, userEmail, projectId, 'manage');
    if (!hasPerm) {
      return errorResponse('PERMISSION_DENIED', 'Insufficient permissions to manage groups');
    }

    const results: Array<{ groupId: string; success: boolean; error?: string }> = [];

    // Use D1 batch for better performance
    const statements = [];

    for (const groupId of groupIds) {
      // Verify group exists and belongs to this project
      const group = await env.DB.prepare(`
        SELECT groupId, groupName FROM groups WHERE projectId = ? AND groupId = ?
      `).bind(projectId, groupId).first();

      if (!group) {
        results.push({
          groupId,
          success: false,
          error: 'Group not found'
        });
        continue;
      }

      // Add update statement to batch
      statements.push(
        env.DB.prepare(`
          UPDATE groups
          SET status = ?
          WHERE projectId = ? AND groupId = ?
        `).bind(status, projectId, groupId)
      );

      results.push({
        groupId,
        success: true
      });
    }

    // Execute batch update
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    // Log the batch action
    await logProjectOperation(
      env,
      projectId,
      userEmail,
      `batch_groups_${status === 'active' ? 'activated' : 'deactivated'}`,
      'group',
      'batch',
      {
        totalGroups: groupIds.length,
        successCount,
        failedCount,
        status
      },
      { level: status === 'inactive' ? 'warning' : 'info' }
    );

    return successResponse({
      successCount,
      failedCount,
      errors: results.filter(r => !r.success).map(r => ({ groupId: r.groupId, error: r.error }))
    });

  } catch (error) {
    console.error('Batch update group status error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch update group status');
  }
}

/**
 * Batch update group allowChange (lock/unlock multiple groups)
 */
export async function batchUpdateGroupAllowChange(
  env: Env,
  userEmail: string,
  projectId: string,
  groupIds: string[],
  allowChange: boolean
): Promise<Response> {
  try {
    // Validate inputs
    if (!groupIds || groupIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'groupIds array is required');
    }

    if (groupIds.length > 50) {
      return errorResponse('INVALID_INPUT', 'Cannot update more than 50 groups at once');
    }

    if (typeof allowChange !== 'boolean') {
      return errorResponse('INVALID_INPUT', 'allowChange must be a boolean');
    }

    // Check if user has permission to manage groups in this project
    const hasPerm = await hasProjectPermission(env, userEmail, projectId, 'manage');
    if (!hasPerm) {
      return errorResponse('PERMISSION_DENIED', 'Insufficient permissions to manage groups');
    }

    const results: Array<{ groupId: string; success: boolean; error?: string }> = [];

    // Use D1 batch for better performance
    const statements = [];

    for (const groupId of groupIds) {
      // Verify group exists and belongs to this project
      const group = await env.DB.prepare(`
        SELECT groupId, groupName FROM groups WHERE projectId = ? AND groupId = ?
      `).bind(projectId, groupId).first();

      if (!group) {
        results.push({
          groupId,
          success: false,
          error: 'Group not found'
        });
        continue;
      }

      // Add update statement to batch
      statements.push(
        env.DB.prepare(`
          UPDATE groups
          SET allowChange = ?
          WHERE projectId = ? AND groupId = ?
        `).bind(allowChange ? 1 : 0, projectId, groupId)
      );

      results.push({
        groupId,
        success: true
      });
    }

    // Execute batch update
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    // Log the batch action
    await logProjectOperation(
      env,
      projectId,
      userEmail,
      `batch_groups_${allowChange ? 'unlocked' : 'locked'}`,
      'group',
      'batch',
      {
        totalGroups: groupIds.length,
        successCount,
        failedCount,
        allowChange
      },
      { level: 'info' }
    );

    return successResponse({
      successCount,
      failedCount,
      errors: results.filter(r => !r.success).map(r => ({ groupId: r.groupId, error: r.error }))
    });

  } catch (error) {
    console.error('Batch update group allowChange error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch update group allowChange setting');
  }
}

// Logging is now handled by centralized utils/logging module
