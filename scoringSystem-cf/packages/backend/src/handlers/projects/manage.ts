/**
 * Project Management Handlers
 * Migrated from GAS scripts/projects_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { logGlobalOperation, generateChanges } from '@utils/logging';
import { sanitizePlainText, sanitizeDescription } from '@utils/sanitize';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Get project details
 */
export async function getProject(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Get project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Check if user has access
    const hasAccess = await checkProjectAccess(env, userEmail, projectId);
    if (!hasAccess) {
      return errorResponse('ACCESS_DENIED', 'No access to this project');
    }

    // Get user permissions
    const permissions = await getUserProjectPermissions(env, userEmail, projectId);

    // Get group count
    const groupCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM groups WHERE projectId = ? AND status = 'active'
    `).bind(projectId).first();

    // Get member count
    const memberCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT userEmail) as count FROM usergroups WHERE projectId = ?
    `).bind(projectId).first();

    return successResponse({
      projectId: project.projectId,
      projectName: project.projectName,
      description: project.description,
      totalStages: project.totalStages,
      currentStage: project.currentStage,
      status: project.status,
      createdBy: project.createdBy,
      createdTime: project.createdTime,
      lastModified: project.lastModified,
      userPermissions: permissions,
      groupCount: groupCount?.count || 0,
      memberCount: memberCount?.count || 0
    });
  } catch (error) {
    console.error('Get project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get project');
  }
}

/**
 * Update project details
 */
export async function updateProject(
  env: Env,
  userEmail: string,
  projectId: string,
  updates: {
    projectName?: string;
    description?: string;
    status?: string;
    scoreRangeMin?: number;
    scoreRangeMax?: number;
  }
): Promise<Response> {
  try {
    // Get project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Check permissions
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    const isCreator = project.createdBy === (await getUserId(env, userEmail));
    const hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');

    if (!isAdmin && !isCreator && !hasManagePermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to update this project');
    }

    // Validate and sanitize updates
    const allowedUpdates: any = {};

    if (updates.projectName !== undefined) {
      allowedUpdates.projectName = sanitizePlainText(updates.projectName).substring(0, 100);
    }

    if (updates.description !== undefined) {
      allowedUpdates.description = sanitizeDescription(updates.description).substring(0, 1000);
    }

    if (updates.status !== undefined && ['active', 'completed', 'archived'].includes(updates.status)) {
      allowedUpdates.status = updates.status;
    }

    if (updates.scoreRangeMin !== undefined) {
      const value = Number(updates.scoreRangeMin);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        allowedUpdates.scoreRangeMin = value;
      }
    }

    if (updates.scoreRangeMax !== undefined) {
      const value = Number(updates.scoreRangeMax);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        allowedUpdates.scoreRangeMax = value;
      }
    }

    // Validate score range
    const minScore = allowedUpdates.scoreRangeMin !== undefined ? allowedUpdates.scoreRangeMin : project.scoreRangeMin;
    const maxScore = allowedUpdates.scoreRangeMax !== undefined ? allowedUpdates.scoreRangeMax : project.scoreRangeMax;

    if (minScore >= maxScore) {
      return errorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Update timestamps
    allowedUpdates.lastModified = Date.now();

    // SECURITY: Whitelist allowed columns to prevent SQL injection
    const ALLOWED_PROJECT_COLUMNS = ['projectName', 'description', 'status', 'scoreRangeMin', 'scoreRangeMax', 'lastModified'];

    // Filter allowedUpdates to only include whitelisted columns
    const safeUpdates: Record<string, any> = {};
    for (const key of ALLOWED_PROJECT_COLUMNS) {
      if (key in allowedUpdates) {
        safeUpdates[key] = allowedUpdates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided after filtering');
    }

    // Build dynamic UPDATE query with whitelisted columns only
    const setClause = Object.keys(safeUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(safeUpdates);

    await env.DB.prepare(`
      UPDATE projects SET ${setClause} WHERE projectId = ?
    `).bind(...values, projectId).run();

    // Log update with full change tracking
    const changes = generateChanges(project, allowedUpdates, ['lastModified']);

    await logGlobalOperation(env, userEmail, 'project_updated', 'project', projectId, {
      changes,  // Complete before/after comparison
      updatedFields: Object.keys(allowedUpdates)  // Kept for backward compatibility
    });

    // Notify all project members if significant fields changed
    if (updates.projectName || updates.description) {
      try {
        // Get project name for notification
        const projectName = allowedUpdates.projectName || project.projectName;

        // Get all project members (from usergroups + projectviewers)
        const members = await getAllProjectMembers(env, projectId);

        // Determine what changed
        const changes: string[] = [];
        if (updates.projectName) changes.push('名稱');
        if (updates.description) changes.push('描述');
        const changesStr = changes.join('和');

        for (const memberEmail of members) {
          if (memberEmail !== userEmail) { // Don't notify the updater
            await queueSingleNotification(env, {
              targetUserEmail: memberEmail,
              type: 'group_member_added', // Reuse existing type
              title: '專案資訊已更新',
              content: `專案「${projectName}」的${changesStr}已更新`,
              projectId,
              metadata: {
                updatedBy: userEmail,
                updatedFields: Object.keys(allowedUpdates)
              }
            });
          }
        }
      } catch (notifError) {
        console.error('[updateProject] Failed to send notifications:', notifError);
        // Don't block the main operation if notification fails
      }
    }

    return successResponse(null, 'Project updated successfully');
  } catch (error) {
    console.error('Update project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update project');
  }
}

/**
 * Delete project (archive)
 */
export async function deleteProject(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Get project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Only creator or system admin can delete
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    const userId = await getUserId(env, userEmail);
    const isCreator = project.createdBy === userId;

    if (!isAdmin && !isCreator) {
      return errorResponse('ACCESS_DENIED', 'Only project creator or system admin can delete the project');
    }

    // Mark as archived
    await env.DB.prepare(`
      UPDATE projects SET status = 'archived', lastModified = ? WHERE projectId = ?
    `).bind(Date.now(), projectId).run();

    // Log archive
    await logGlobalOperation(env, userEmail, 'project_archived', 'project', projectId, {
      reason: 'deleted_by_creator'
    });

    // Notify all project members about archival
    try {
      // Get project name for notification
      const projectName = project.projectName;

      // Get all project members (from usergroups + projectviewers)
      const members = await getAllProjectMembers(env, projectId);

      for (const memberEmail of members) {
        if (memberEmail !== userEmail) { // Don't notify the archiver
          await queueSingleNotification(env, {
            targetUserEmail: memberEmail,
            type: 'group_member_added', // Reuse existing type
            title: '專案已封存',
            content: `專案「${projectName}」已被封存。該專案將不再可用。`,
            projectId,
            metadata: {
              archivedBy: userEmail,
              archivedAt: Date.now()
            }
          });
        }
      }
    } catch (notifError) {
      console.error('[deleteProject] Failed to send notifications:', notifError);
      // Don't block the main operation if notification fails
    }

    return successResponse(null, 'Project archived successfully');
  } catch (error) {
    console.error('Delete project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to delete project');
  }
}

/**
 * Export project data
 */
export async function exportProject(
  env: Env,
  userEmail: string,
  projectId: string,
  format: string = 'json'
): Promise<Response> {
  try {
    // Get project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Check permissions
    const isCreator = project.createdBy === (await getUserId(env, userEmail));
    const hasManagePermission = await hasProjectPermission(env, userEmail, projectId, 'manage');

    if (!isCreator && !hasManagePermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to export this project');
    }

    if (format !== 'json') {
      return errorResponse('INVALID_INPUT', 'Unsupported export format');
    }

    // Get complete project data
    const [groups, stages, submissions, comments] = await Promise.all([
      env.DB.prepare('SELECT * FROM groups WHERE projectId = ?').bind(projectId).all(),
      env.DB.prepare('SELECT * FROM stages WHERE projectId = ?').bind(projectId).all(),
      env.DB.prepare('SELECT * FROM submissions_with_status WHERE projectId = ?').bind(projectId).all(),
      env.DB.prepare('SELECT * FROM comments WHERE projectId = ?').bind(projectId).all()
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      exportedBy: userEmail,
      version: '1.0',
      projectId,
      project,
      data: {
        groups: groups.results.map((g: any) => ({
          ...g,
          allowChange: Boolean(g.allowChange)  // Convert 0/1 to boolean
        })),
        stages: stages.results,
        submissions: submissions.results,
        comments: comments.results
      }
    };

    return successResponse({
      format: 'json',
      data: exportData
    });
  } catch (error) {
    console.error('Export project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to export project');
  }
}

/**
 * Helper: Check if user has access to project
 */
async function checkProjectAccess(env: Env, userEmail: string, projectId: string): Promise<boolean> {
  try {
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    if (isAdmin) return true;

    const userId = await getUserId(env, userEmail);

    // Check if creator
    const project = await env.DB.prepare('SELECT createdBy FROM projects WHERE projectId = ?')
      .bind(projectId).first();
    if (project && project.createdBy === userId) return true;

    // Check if member
    const membership = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM usergroups WHERE projectId = ? AND userEmail = ?
    `).bind(projectId, userEmail).first();

    return membership ? (membership.count as number) > 0 : false;
  } catch (error) {
    console.warn('Check project access error:', error);
    return false;
  }
}

/**
 * Helper: Get user project permissions
 * Returns permissions based on user's role in the project:
 * - teacher: ['manage', 'view', 'comment']
 * - observer: ['view']
 * - student (group member): ['submit', 'vote', 'comment', 'view']
 */
async function getUserProjectPermissions(env: Env, userEmail: string, projectId: string): Promise<string[]> {
  try {
    // Check if user is a teacher or observer
    const viewerResult = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (viewerResult) {
      const role = viewerResult.role as string;
      if (role === 'teacher') {
        return ['manage', 'view', 'comment'];
      } else if (role === 'observer') {
        return ['view'];
      }
    }

    // Check if user is a student (group member)
    const groupResult = await env.DB.prepare(`
      SELECT role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (groupResult) {
      return ['submit', 'vote', 'comment', 'view'];
    }

    return [];
  } catch (error) {
    console.warn('Get user project permissions error:', error);
    return [];
  }
}

/**
 * Helper: Check if user has specific permission
 */
async function hasProjectPermission(
  env: Env,
  userEmail: string,
  projectId: string,
  permission: string
): Promise<boolean> {
  const permissions = await getUserProjectPermissions(env, userEmail, projectId);
  return permissions.includes(permission);
}

/**
 * Helper: Get user ID
 */
async function getUserId(env: Env, userEmail: string): Promise<string | null> {
  const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail).first();
  return user ? (user.userId as string) : null;
}

/**
 * Helper: Check global permission
 */
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
 * Helper: Get all project members (from usergroups + projectviewers)
 */
async function getAllProjectMembers(env: Env, projectId: string): Promise<string[]> {
  try {
    // Get all unique user emails from both usergroups and projectviewers
    const result = await env.DB.prepare(`
      SELECT DISTINCT userEmail FROM (
        SELECT userEmail FROM usergroups WHERE projectId = ? AND isActive = 1
        UNION
        SELECT userEmail FROM projectviewers WHERE projectId = ? AND isActive = 1
      )
    `).bind(projectId, projectId).all();

    return result.results?.map((r: any) => r.userEmail) || [];
  } catch (error) {
    console.error('[getAllProjectMembers] Error:', error);
    return [];
  }
}

// Logging is now handled by centralized utils/logging module
