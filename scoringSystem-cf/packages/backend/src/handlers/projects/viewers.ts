/**
 * @fileoverview Project viewers management handlers
 * Manages teacher, observer, and member visibility for projects
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { hasAnyGlobalPermission } from '../../utils/permissions';
import { logProjectOperation } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { parseJSON } from '../../utils/json';

/**
 * List all viewers for a project
 */
export async function listProjectViewers(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Check if user has permission to view project viewers
    // This includes admins, teachers, and group leaders (who need to see available members)
    const canView = await canViewProjectViewers(env, userEmail, projectId);
    if (!canView) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to view project members');
    }

    // Get all active viewers for this project
    const result = await env.DB.prepare(`
      SELECT
        pv.id,
        pv.projectId,
        pv.userEmail,
        pv.role,
        pv.assignedBy,
        pv.assignedAt,
        u.displayName,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions
      FROM projectviewers pv
      LEFT JOIN users u ON pv.userEmail = u.userEmail
      WHERE pv.projectId = ? AND pv.isActive = 1
      ORDER BY pv.assignedAt DESC
    `).bind(projectId).all();

    // Parse avatarOptions with default values to match search.ts behavior
    const viewersWithParsedOptions = (result.results || []).map((viewer: any) => ({
      ...viewer,
      avatarOptions: parseJSON(viewer.avatarOptions, {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      })
    }));

    return successResponse(viewersWithParsedOptions);
  } catch (error) {
    console.error('List project viewers error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to list project viewers');
  }
}

/**
 * Add a viewer to a project
 */
export async function addProjectViewer(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail: string,
  role: 'teacher' | 'observer' | 'member'
): Promise<Response> {
  try {
    // Check if user has permission to manage this project
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to add project members');
    }

    // Validate role
    if (role !== 'teacher' && role !== 'observer' && role !== 'member') {
      return errorResponse('INVALID_ROLE', 'Role must be "teacher", "observer", or "member"');
    }

    // Check if target user exists
    const targetUser = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail = ?
    `).bind(targetUserEmail).first();

    if (!targetUser) {
      return errorResponse('USER_NOT_FOUND', 'Target user does not exist');
    }

    // Check if user already has a viewer role for this project (active or inactive)
    const existing = await env.DB.prepare(`
      SELECT id, role, isActive FROM projectviewers
      WHERE projectId = ? AND userEmail = ?
    `).bind(projectId, targetUserEmail).first();

    if (existing) {
      // Case 1: Reactivate inactive viewer with new role
      if (existing.isActive === 0) {
        // Reactivate the viewer record with the new role
        await env.DB.prepare(`
          UPDATE projectviewers
          SET role = ?, assignedBy = ?, assignedAt = ?, isActive = 1
          WHERE id = ?
        `).bind(role, userEmail, Date.now(), existing.id).run();

        // Log reactivation
        await logProjectOperation(
          env,
          userEmail,
          projectId,
          'project_viewer_reactivated',
          'user',
          targetUserEmail,
          {
            oldRole: existing.role,
            newRole: role,
            reactivatedBy: userEmail
          },
          { level: 'info' }
        );

        // Notify user about reactivation
        try {
          const project = await env.DB.prepare(`
            SELECT projectName FROM projects WHERE projectId = ?
          `).bind(projectId).first();

          await queueSingleNotification(env, {
            targetUserEmail,
            type: 'project_role_assigned',
            title: '你已重新加入專案',
            content: `你已重新加入專案「${project?.projectName || projectId}」，角色為 ${role}`,
            projectId,
            metadata: {
              role,
              reactivatedBy: userEmail
            }
          });
        } catch (notifError) {
          console.error('[addProjectViewer] Failed to send reactivation notification:', notifError);
        }

        return successResponse({ message: 'Viewer reactivated successfully', reactivated: true });
      }

      // Case 2: Active viewer with same role
      if (existing.role === role) {
        return successResponse({ message: 'User already has this role' });
      }

      // Case 3: Active viewer with different role - update it
      const oldRole = existing.role as string;

      // SECURITY FIX: Use CAS lock to prevent concurrent role updates
      const result = await env.DB.prepare(`
        UPDATE projectviewers
        SET role = ?, assignedBy = ?, assignedAt = ?
        WHERE id = ? AND role = ?
      `).bind(role, userEmail, Date.now(), existing.id, oldRole).run();

      // Check if CAS succeeded
      if (result.meta.changes === 0) {
        return errorResponse(
          'ROLE_CONFLICT',
          '該用戶的角色已被其他操作修改，請重新整理後再試。',
          {
            expectedRole: oldRole,
            reason: 'Role was modified by another request (CAS conflict)'
          }
        );
      }

      // Log role update
      await logProjectOperation(
        env,
        userEmail,
        projectId,
        'project_viewer_role_updated',
        'user',
        targetUserEmail,
        {
          oldRole: existing.role,
          newRole: role,
          assignedBy: userEmail
        },
        { level: 'info' }
      );

      // Notify user about role update
      try {
        // Get project name for notification
        const project = await env.DB.prepare(`
          SELECT projectName FROM projects WHERE projectId = ?
        `).bind(projectId).first();

        await queueSingleNotification(env, {
          targetUserEmail,
          type: 'project_role_assigned',
          title: '專案角色已更新',
          content: `你在專案「${project?.projectName || projectId}」的角色已從 ${existing.role} 更新為 ${role}`,
          projectId,
          metadata: {
            oldRole: existing.role,
            newRole: role,
            updatedBy: userEmail
          }
        });
      } catch (notifError) {
        console.error('[addProjectViewer] Failed to send role update notification:', notifError);
      }

      return successResponse({ message: 'User role updated successfully', updated: true });
    }

    // Note: userGroups table is for group membership within a project
    // projectViewers table is for project access control (teacher/observer/viewer)
    // A user can be both in userGroups AND projectViewers
    // - userGroups: defines which group the user belongs to (for submissions, scoring)
    // - projectViewers: defines access level to the project (teacher/observer/viewer)

    // Insert new viewer
    await env.DB.prepare(`
      INSERT INTO projectviewers (projectId, userEmail, role, assignedBy, assignedAt, isActive)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(projectId, targetUserEmail, role, userEmail, Date.now()).run();

    // Log viewer addition
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewer_added',
      'user',
      targetUserEmail,
      {
        role,
        assignedBy: userEmail
      },
      { level: 'info' }
    );

    // Notify user about being added
    try {
      // Get project name for notification
      const project = await env.DB.prepare(`
        SELECT projectName FROM projects WHERE projectId = ?
      `).bind(projectId).first();

      await queueSingleNotification(env, {
        targetUserEmail,
        type: 'project_role_assigned',
        title: '你已被添加到專案',
        content: `你已被添加為專案「${project?.projectName || projectId}」的 ${role}`,
        projectId,
        metadata: {
          role,
          addedBy: userEmail
        }
      });
    } catch (notifError) {
      console.error('[addProjectViewer] Failed to send notification:', notifError);
    }

    return successResponse({ message: 'Viewer added successfully' });
  } catch (error) {
    console.error('Add project viewer error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to add project viewer');
  }
}

/**
 * Remove a viewer from a project
 */
export async function removeProjectViewer(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail: string
): Promise<Response> {
  try {
    // Check if user has permission to manage this project
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove project members');
    }

    // Get viewer info before deletion
    const viewer = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, targetUserEmail).first();

    if (!viewer) {
      return errorResponse('VIEWER_NOT_FOUND', 'Viewer not found or already removed');
    }

    // Soft delete the viewer by setting isActive = 0
    await env.DB.prepare(`
      UPDATE projectviewers
      SET isActive = 0
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, targetUserEmail).run();

    // Log viewer removal
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewer_removed',
      'user',
      targetUserEmail,
      {
        role: viewer.role,
        removedBy: userEmail
      },
      { level: 'warning' }
    );

    // Notify user about removal
    try {
      // Get project name for notification
      const project = await env.DB.prepare(`
        SELECT projectName FROM projects WHERE projectId = ?
      `).bind(projectId).first();

      await queueSingleNotification(env, {
        targetUserEmail,
        type: 'project_role_removed',
        title: '你已被從專案中移除',
        content: `你已被從專案「${project?.projectName || projectId}」的 ${viewer.role} 角色中移除`,
        projectId,
        metadata: {
          role: viewer.role,
          removedBy: userEmail
        }
      });
    } catch (notifError) {
      console.error('[removeProjectViewer] Failed to send notification:', notifError);
    }

    return successResponse({ message: 'Viewer removed successfully' });
  } catch (error) {
    console.error('Remove project viewer error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to remove project viewer');
  }
}

/**
 * Update a viewer's role
 */
export async function updateProjectViewerRole(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail: string,
  newRole: 'teacher' | 'observer' | 'member'
): Promise<Response> {
  try {
    // Check if user has permission to manage this project
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to update project members');
    }

    // Validate role
    if (newRole !== 'teacher' && newRole !== 'observer' && newRole !== 'member') {
      return errorResponse('INVALID_ROLE', 'Role must be "teacher", "observer", or "member"');
    }

    // Get current role before update
    const currentViewer = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, targetUserEmail).first();

    if (!currentViewer) {
      return errorResponse('VIEWER_NOT_FOUND', 'Viewer not found');
    }

    const oldRole = currentViewer.role as string;

    // SECURITY FIX: Use CAS lock to prevent concurrent role updates
    const result = await env.DB.prepare(`
      UPDATE projectviewers
      SET role = ?, assignedBy = ?, assignedAt = ?
      WHERE projectId = ? AND userEmail = ? AND isActive = 1 AND role = ?
    `).bind(newRole, userEmail, Date.now(), projectId, targetUserEmail, oldRole).run();

    // Check if CAS succeeded
    if (result.meta.changes === 0) {
      return errorResponse(
        'ROLE_CONFLICT',
        '該用戶的角色已被其他操作修改，請重新整理後再試。',
        {
          expectedRole: oldRole,
          reason: 'Role was modified by another request (CAS conflict)'
        }
      );
    }

    // Log role update
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewer_role_updated',
      'user',
      targetUserEmail,
      {
        oldRole: currentViewer.role,
        newRole,
        updatedBy: userEmail
      },
      { level: 'info' }
    );

    // Notify user about role change
    try {
      // Get project name for notification
      const project = await env.DB.prepare(`
        SELECT projectName FROM projects WHERE projectId = ?
      `).bind(projectId).first();

      await queueSingleNotification(env, {
        targetUserEmail,
        type: 'project_role_assigned',
        title: '專案角色已更新',
        content: `你在專案「${project?.projectName || projectId}」的角色已從 ${currentViewer.role} 更新為 ${newRole}`,
        projectId,
        metadata: {
          oldRole: currentViewer.role,
          newRole,
          updatedBy: userEmail
        }
      });
    } catch (notifError) {
      console.error('[updateProjectViewerRole] Failed to send notification:', notifError);
    }

    return successResponse({ message: 'Viewer role updated successfully' });
  } catch (error) {
    console.error('Update project viewer role error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update viewer role');
  }
}

/**
 * Check if a user can manage project viewers
 * - system_admin: can manage all projects
 * - create_project: can manage all projects
 * - Project creator: can manage their own project
 * - Teacher role in project: can manage viewers for that project
 */
async function canManageProjectViewers(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  // Get userId from email first
  const userResult = await env.DB.prepare(`
    SELECT userId FROM users WHERE userEmail = ?
  `).bind(userEmail).first();

  if (!userResult) {
    return false;
  }

  const userId = userResult.userId as string;

  // Check for global permissions
  const hasGlobalPerms = await hasAnyGlobalPermission(
    env.DB,
    userId,
    ['system_admin', 'create_project']
  );

  if (hasGlobalPerms) {
    return true;
  }

  // Check if user is the project creator
  const project = await env.DB.prepare(`
    SELECT createdBy FROM projects WHERE projectId = ?
  `).bind(projectId).first();

  if (project && project.createdBy === userId) {
    return true;
  }

  // Check if user has teacher role for this project
  const viewerRole = await env.DB.prepare(`
    SELECT role FROM projectviewers
    WHERE projectId = ? AND userEmail = ? AND isActive = 1
  `).bind(projectId, userEmail).first();

  if (viewerRole && viewerRole.role === 'teacher') {
    return true;
  }

  return false;
}

/**
 * Check if a user can view project viewers list
 * More permissive than canManageProjectViewers - includes group leaders
 * who need to see available members to add to their groups
 *
 * Allowed roles:
 * - system_admin: can view all projects
 * - create_project: can view all projects
 * - Project creator: can view their own project
 * - Teacher role in project: can view viewers for that project
 * - Group leader: can view viewers to add members to their group
 */
async function canViewProjectViewers(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  // First check if they can manage (admin, creator, teacher)
  const canManage = await canManageProjectViewers(env, userEmail, projectId);
  if (canManage) {
    return true;
  }

  // Check if user is a group leader in this project
  const groupLeaderResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM usergroups
    WHERE projectId = ? AND userEmail = ? AND role = 'leader' AND isActive = 1
  `).bind(projectId, userEmail).first();

  if (groupLeaderResult && (groupLeaderResult.count as number) > 0) {
    return true;
  }

  return false;
}

/**
 * Check if user can view unassigned members (group leader or above)
 * @param env - Worker environment
 * @param userEmail - User's email
 * @param projectId - Project ID
 * @returns true if user is group leader or has higher permissions
 */
async function canViewUnassignedMembers(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  // Check if user has admin permissions (manage project viewers)
  const canManage = await canManageProjectViewers(env, userEmail, projectId);
  if (canManage) return true;

  // Check if user is a group leader in this project
  const groupLeaderCheck = await env.DB.prepare(`
    SELECT 1 FROM usergroups
    WHERE projectId = ? AND userEmail = ? AND role = 'leader' AND isActive = 1
    LIMIT 1
  `).bind(projectId, userEmail).first();

  return !!groupLeaderCheck;
}

/**
 * Mark unassigned members - find members who are in projectviewers but not in any group
 * Returns array of email addresses for members who haven't been assigned to a group yet
 */
export async function markUnassignedMembers(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Check if user can view unassigned members (group leader or above)
    const canView = await canViewUnassignedMembers(env, userEmail, projectId);
    if (!canView) {
      return errorResponse('PERMISSION_DENIED', '您沒有權限查看未分組成員');
    }

    // Query all members in projectviewers with role='member'
    const viewerMembers = await env.DB.prepare(`
      SELECT userEmail
      FROM projectviewers
      WHERE projectId = ? AND role = 'member' AND isActive = 1
    `).bind(projectId).all();

    // Query all members in usergroups for this project
    const groupedMembers = await env.DB.prepare(`
      SELECT DISTINCT userEmail
      FROM usergroups
      WHERE projectId = ? AND isActive = 1
    `).bind(projectId).all();

    // Find difference: members in projectviewers but not in usergroups
    const viewerEmails = new Set(
      (viewerMembers.results || []).map((r: any) => r.userEmail as string)
    );
    const groupedEmails = new Set(
      (groupedMembers.results || []).map((r: any) => r.userEmail as string)
    );

    const unassigned = Array.from(viewerEmails).filter(
      email => !groupedEmails.has(email)
    );

    // Log this operation
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_unassigned_members_marked',
      'project',
      projectId,
      {
        totalMembers: viewerEmails.size,
        groupedMembers: groupedEmails.size,
        unassignedCount: unassigned.length,
        unassignedMembers: unassigned
      },
      { level: 'info' }
    );

    // Debug log for API response
    console.log('🔍 [DEBUG] Mark Unassigned Members API Response:', {
      projectId,
      requester: userEmail,
      totalViewerMembers: viewerEmails.size,
      totalGroupedMembers: groupedEmails.size,
      ungroupedCount: unassigned.length,
      ungroupedMemberEmails: unassigned,
      viewerMembersSnapshot: Array.from(viewerEmails).slice(0, 5), // First 5 for debugging
      groupedMembersSnapshot: Array.from(groupedEmails).slice(0, 5) // First 5 for debugging
    });

    return successResponse(
      { ungroupedMemberEmails: unassigned },
      `找到 ${unassigned.length} 位未分組成員`
    );
  } catch (error) {
    console.error('Mark unassigned members error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to mark unassigned members');
  }
}

/**
 * Add multiple viewers to a project in batch
 * Optimized to use batch queries instead of N+1 individual inserts
 */
export async function addProjectViewersBatch(
  env: Env,
  userEmail: string,
  projectId: string,
  viewers: Array<{ userEmail: string; role: 'teacher' | 'observer' | 'member' }>
): Promise<Response> {
  try {
    // Validate input
    if (!viewers || viewers.length === 0) {
      return errorResponse('INVALID_INPUT', 'No viewers to add');
    }

    // Limit batch size to prevent abuse
    if (viewers.length > 100) {
      return errorResponse('INVALID_INPUT', 'Maximum 100 viewers per batch');
    }

    // Check permission once for all viewers
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to add project members');
    }

    // Validate all roles
    const validRoles = ['teacher', 'observer', 'member'];
    for (const viewer of viewers) {
      if (!validRoles.includes(viewer.role)) {
        return errorResponse('INVALID_ROLE', `Invalid role "${viewer.role}" for user ${viewer.userEmail}`);
      }
    }

    // Get unique emails
    const targetEmails = [...new Set(viewers.map(v => v.userEmail))];
    const emailToRole = new Map(viewers.map(v => [v.userEmail, v.role]));

    // Batch check: which users exist
    const placeholders = targetEmails.map(() => '?').join(',');
    const existingUsers = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail IN (${placeholders})
    `).bind(...targetEmails).all();

    const existingUserEmails = new Set(
      (existingUsers.results || []).map((u: any) => u.userEmail as string)
    );

    // Find non-existent users
    const nonExistentUsers = targetEmails.filter(e => !existingUserEmails.has(e));
    if (nonExistentUsers.length > 0) {
      return errorResponse('USER_NOT_FOUND', `Users not found: ${nonExistentUsers.join(', ')}`);
    }

    // Batch check: which users already have viewer roles
    const existingViewers = await env.DB.prepare(`
      SELECT userEmail, role, isActive FROM projectviewers
      WHERE projectId = ? AND userEmail IN (${placeholders})
    `).bind(projectId, ...targetEmails).all();

    const existingViewerMap = new Map<string, { role: string; isActive: number }>();
    for (const v of existingViewers.results || []) {
      existingViewerMap.set(v.userEmail as string, {
        role: v.role as string,
        isActive: v.isActive as number
      });
    }

    // Categorize viewers
    const toInsert: Array<{ email: string; role: string }> = [];
    const toReactivate: Array<{ email: string; role: string; oldRole: string }> = [];
    const toUpdate: Array<{ email: string; role: string; oldRole: string }> = [];
    const unchanged: string[] = [];

    for (const email of targetEmails) {
      const role = emailToRole.get(email)!;
      const existing = existingViewerMap.get(email);

      if (!existing) {
        // New viewer
        toInsert.push({ email, role });
      } else if (existing.isActive === 0) {
        // Reactivate inactive viewer
        toReactivate.push({ email, role, oldRole: existing.role });
      } else if (existing.role === role) {
        // Already has same role
        unchanged.push(email);
      } else {
        // Update role
        toUpdate.push({ email, role, oldRole: existing.role });
      }
    }

    const now = Date.now();

    // Batch INSERT new viewers
    if (toInsert.length > 0) {
      const insertStatements = toInsert.map(v =>
        env.DB.prepare(`
          INSERT INTO projectviewers (projectId, userEmail, role, assignedBy, assignedAt, isActive)
          VALUES (?, ?, ?, ?, ?, 1)
        `).bind(projectId, v.email, v.role, userEmail, now)
      );
      await env.DB.batch(insertStatements);
    }

    // Batch UPDATE reactivated viewers
    if (toReactivate.length > 0) {
      const reactivateStatements = toReactivate.map(v =>
        env.DB.prepare(`
          UPDATE projectviewers
          SET role = ?, assignedBy = ?, assignedAt = ?, isActive = 1
          WHERE projectId = ? AND userEmail = ?
        `).bind(v.role, userEmail, now, projectId, v.email)
      );
      await env.DB.batch(reactivateStatements);
    }

    // Batch UPDATE role changes
    if (toUpdate.length > 0) {
      const updateStatements = toUpdate.map(v =>
        env.DB.prepare(`
          UPDATE projectviewers
          SET role = ?, assignedBy = ?, assignedAt = ?
          WHERE projectId = ? AND userEmail = ? AND isActive = 1
        `).bind(v.role, userEmail, now, projectId, v.email)
      );
      await env.DB.batch(updateStatements);
    }

    // Log batch operation (single log entry)
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewers_batch_added',
      'project',
      projectId,
      {
        inserted: toInsert.map(v => ({ email: v.email, role: v.role })),
        reactivated: toReactivate.map(v => ({ email: v.email, role: v.role, oldRole: v.oldRole })),
        updated: toUpdate.map(v => ({ email: v.email, role: v.role, oldRole: v.oldRole })),
        unchanged: unchanged,
        summary: {
          inserted: toInsert.length,
          reactivated: toReactivate.length,
          updated: toUpdate.length,
          unchanged: unchanged.length,
          total: targetEmails.length
        }
      },
      { level: 'info' }
    );

    // Queue notifications in batch (async, don't wait)
    const project = await env.DB.prepare(`
      SELECT projectName FROM projects WHERE projectId = ?
    `).bind(projectId).first();
    const projectName = (project?.projectName as string) || projectId;

    // Queue notifications for new viewers
    const notificationPromises: Promise<void>[] = [];

    for (const v of toInsert) {
      notificationPromises.push(
        queueSingleNotification(env, {
          targetUserEmail: v.email,
          type: 'project_role_assigned',
          title: '你已被添加到專案',
          content: `你已被添加為專案「${projectName}」的 ${v.role}`,
          projectId,
          metadata: { role: v.role, addedBy: userEmail }
        }).catch(err => console.error('[addProjectViewersBatch] Notification error:', err))
      );
    }

    for (const v of toReactivate) {
      notificationPromises.push(
        queueSingleNotification(env, {
          targetUserEmail: v.email,
          type: 'project_role_assigned',
          title: '你已重新加入專案',
          content: `你已重新加入專案「${projectName}」，角色為 ${v.role}`,
          projectId,
          metadata: { role: v.role, reactivatedBy: userEmail }
        }).catch(err => console.error('[addProjectViewersBatch] Notification error:', err))
      );
    }

    for (const v of toUpdate) {
      notificationPromises.push(
        queueSingleNotification(env, {
          targetUserEmail: v.email,
          type: 'project_role_assigned',
          title: '專案角色已更新',
          content: `你在專案「${projectName}」的角色已從 ${v.oldRole} 更新為 ${v.role}`,
          projectId,
          metadata: { oldRole: v.oldRole, newRole: v.role, updatedBy: userEmail }
        }).catch(err => console.error('[addProjectViewersBatch] Notification error:', err))
      );
    }

    // Don't await notifications - let them run in background
    Promise.all(notificationPromises).catch(() => {});

    return successResponse({
      message: 'Viewers added successfully',
      summary: {
        inserted: toInsert.length,
        reactivated: toReactivate.length,
        updated: toUpdate.length,
        unchanged: unchanged.length,
        total: targetEmails.length
      }
    });
  } catch (error) {
    console.error('Add project viewers batch error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to add project viewers');
  }
}

/**
 * Remove multiple viewers from a project in batch
 */
export async function removeProjectViewersBatch(
  env: Env,
  userEmail: string,
  projectId: string,
  userEmails: string[]
): Promise<Response> {
  try {
    if (!userEmails || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'No viewers to remove');
    }

    if (userEmails.length > 100) {
      return errorResponse('INVALID_INPUT', 'Maximum 100 viewers per batch');
    }

    // Check permission once
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to remove project members');
    }

    // Get unique emails
    const targetEmails = [...new Set(userEmails)];
    const placeholders = targetEmails.map(() => '?').join(',');

    // Check which viewers exist and are active
    const existingViewers = await env.DB.prepare(`
      SELECT userEmail, role FROM projectviewers
      WHERE projectId = ? AND userEmail IN (${placeholders}) AND isActive = 1
    `).bind(projectId, ...targetEmails).all();

    const existingMap = new Map<string, string>();
    for (const v of existingViewers.results || []) {
      existingMap.set(v.userEmail as string, v.role as string);
    }

    // Find viewers that don't exist
    const notFound = targetEmails.filter(e => !existingMap.has(e));
    const toRemove = targetEmails.filter(e => existingMap.has(e));

    if (toRemove.length === 0) {
      return errorResponse('VIEWER_NOT_FOUND', 'No active viewers found to remove');
    }

    // Batch soft delete
    const removeStatements = toRemove.map(email =>
      env.DB.prepare(`
        UPDATE projectviewers
        SET isActive = 0
        WHERE projectId = ? AND userEmail = ? AND isActive = 1
      `).bind(projectId, email)
    );
    await env.DB.batch(removeStatements);

    // Log batch operation
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewers_batch_removed',
      'project',
      projectId,
      {
        removed: toRemove.map(e => ({ email: e, role: existingMap.get(e) })),
        notFound,
        summary: {
          removed: toRemove.length,
          notFound: notFound.length,
          total: targetEmails.length
        }
      },
      { level: 'warning' }
    );

    // Queue notifications
    const project = await env.DB.prepare(`
      SELECT projectName FROM projects WHERE projectId = ?
    `).bind(projectId).first();
    const projectName = (project?.projectName as string) || projectId;

    for (const email of toRemove) {
      queueSingleNotification(env, {
        targetUserEmail: email,
        type: 'project_role_removed',
        title: '你已被從專案中移除',
        content: `你已被從專案「${projectName}」中移除`,
        projectId,
        metadata: { role: existingMap.get(email), removedBy: userEmail }
      }).catch(err => console.error('[removeProjectViewersBatch] Notification error:', err));
    }

    return successResponse({
      message: 'Viewers removed successfully',
      summary: {
        removed: toRemove.length,
        notFound: notFound.length,
        total: targetEmails.length
      }
    });
  } catch (error) {
    console.error('Remove project viewers batch error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to remove project viewers');
  }
}

/**
 * Update multiple viewers' roles in batch
 */
export async function updateProjectViewersRoleBatch(
  env: Env,
  userEmail: string,
  projectId: string,
  userEmails: string[],
  newRole: 'teacher' | 'observer' | 'member'
): Promise<Response> {
  try {
    if (!userEmails || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'No viewers to update');
    }

    if (userEmails.length > 100) {
      return errorResponse('INVALID_INPUT', 'Maximum 100 viewers per batch');
    }

    // Validate role
    if (!['teacher', 'observer', 'member'].includes(newRole)) {
      return errorResponse('INVALID_ROLE', 'Role must be "teacher", "observer", or "member"');
    }

    // Check permission once
    const canManage = await canManageProjectViewers(env, userEmail, projectId);
    if (!canManage) {
      return errorResponse('PERMISSION_DENIED', 'You do not have permission to update project members');
    }

    // Get unique emails
    const targetEmails = [...new Set(userEmails)];
    const placeholders = targetEmails.map(() => '?').join(',');

    // Check which viewers exist and are active
    const existingViewers = await env.DB.prepare(`
      SELECT userEmail, role FROM projectviewers
      WHERE projectId = ? AND userEmail IN (${placeholders}) AND isActive = 1
    `).bind(projectId, ...targetEmails).all();

    const existingMap = new Map<string, string>();
    for (const v of existingViewers.results || []) {
      existingMap.set(v.userEmail as string, v.role as string);
    }

    // Categorize
    const notFound = targetEmails.filter(e => !existingMap.has(e));
    const unchanged = targetEmails.filter(e => existingMap.get(e) === newRole);
    const toUpdate = targetEmails.filter(e => existingMap.has(e) && existingMap.get(e) !== newRole);

    const now = Date.now();

    // Batch update
    if (toUpdate.length > 0) {
      const updateStatements = toUpdate.map(email =>
        env.DB.prepare(`
          UPDATE projectviewers
          SET role = ?, assignedBy = ?, assignedAt = ?
          WHERE projectId = ? AND userEmail = ? AND isActive = 1
        `).bind(newRole, userEmail, now, projectId, email)
      );
      await env.DB.batch(updateStatements);
    }

    // Log batch operation
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'project_viewers_role_batch_updated',
      'project',
      projectId,
      {
        updated: toUpdate.map(e => ({ email: e, oldRole: existingMap.get(e), newRole })),
        unchanged,
        notFound,
        summary: {
          updated: toUpdate.length,
          unchanged: unchanged.length,
          notFound: notFound.length,
          total: targetEmails.length
        }
      },
      { level: 'info' }
    );

    // Queue notifications for updated viewers
    if (toUpdate.length > 0) {
      const project = await env.DB.prepare(`
        SELECT projectName FROM projects WHERE projectId = ?
      `).bind(projectId).first();
      const projectName = (project?.projectName as string) || projectId;

      for (const email of toUpdate) {
        queueSingleNotification(env, {
          targetUserEmail: email,
          type: 'project_role_assigned',
          title: '專案角色已更新',
          content: `你在專案「${projectName}」的角色已從 ${existingMap.get(email)} 更新為 ${newRole}`,
          projectId,
          metadata: { oldRole: existingMap.get(email), newRole, updatedBy: userEmail }
        }).catch(err => console.error('[updateProjectViewersRoleBatch] Notification error:', err));
      }
    }

    return successResponse({
      message: 'Viewer roles updated successfully',
      summary: {
        updated: toUpdate.length,
        unchanged: unchanged.length,
        notFound: notFound.length,
        total: targetEmails.length
      }
    });
  } catch (error) {
    console.error('Update project viewers role batch error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update viewer roles');
  }
}
