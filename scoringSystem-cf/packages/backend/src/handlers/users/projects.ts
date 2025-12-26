/**
 * User Projects and Statistics Handlers
 * Migrated from GAS scripts/users_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';

/**
 * Get user's project memberships
 */
export async function getUserProjects(
  env: Env,
  sessionUserId: string,
  sessionUserEmail: string,
  targetUserId?: string
): Promise<Response> {
  try {
    // Determine target user
    const userId = targetUserId || sessionUserId;

    let targetUserEmail: string;
    if (userId === sessionUserId) {
      targetUserEmail = sessionUserEmail;
    } else {
      const user = await env.DB.prepare(`
        SELECT userEmail FROM users WHERE userId = ?
      `).bind(userId).first();

      if (!user) {
        return errorResponse('USER_NOT_FOUND', 'User not found');
      }

      targetUserEmail = user.userEmail as string;
    }

    // Get all projects where user is a member or creator
    const userProjectMemberships: any[] = [];

    // Get projects created by user
    const createdProjects = await env.DB.prepare(`
      SELECT
        p.projectId, p.projectName, p.description, p.status, p.createdTime
      FROM projects p
      JOIN users u ON p.createdBy = u.userId
      WHERE u.userEmail = ?
    `).bind(targetUserEmail).all();

    for (const project of createdProjects.results) {
      userProjectMemberships.push({
        projectId: project.projectId,
        projectName: project.projectName,
        description: project.description,
        status: project.status,
        role: 'creator',
        joinTime: project.createdTime,
        isActive: true,
        groups: []
      });
    }

    // Get projects where user is a member through groups
    const memberProjects = await env.DB.prepare(`
      SELECT DISTINCT
        p.projectId, p.projectName, p.description, p.status
      FROM usergroups pug
      JOIN projects p ON pug.projectId = p.projectId
      WHERE pug.userEmail = ?
    `).bind(targetUserEmail).all();

    for (const project of memberProjects.results) {
      // Skip if already added as creator
      if (userProjectMemberships.some(p => p.projectId === project.projectId)) {
        continue;
      }

      // Get user's groups in this project
      const userGroups = await env.DB.prepare(`
        SELECT
          pug.groupId, pug.role, pug.assignedAt,
          pg.groupName, pg.permissions
        FROM usergroups pug
        JOIN groups pg ON pug.groupId = pg.groupId
        WHERE pug.userEmail = ?
          AND pug.projectId = ?
      `).bind(targetUserEmail, project.projectId).all();

      const groups = userGroups.results.map((ug: any) => ({
        groupId: ug.groupId,
        groupName: ug.groupName,
        role: ug.role,
        permissions: parseJSON(ug.permissions, [])
      }));

      const joinTimes = userGroups.results.map((ug: any) => ug.assignedAt as number);
      const minJoinTime = joinTimes.length > 0 ? Math.min(...joinTimes) : Date.now();

      userProjectMemberships.push({
        projectId: project.projectId,
        projectName: project.projectName,
        description: project.description,
        status: project.status,
        role: 'member',
        joinTime: minJoinTime,
        isActive: true,
        groups
      });
    }

    // Sort by join time (most recent first)
    userProjectMemberships.sort((a, b) => b.joinTime - a.joinTime);

    return successResponse(userProjectMemberships);
  } catch (error) {
    console.error('Get user projects error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user projects');
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(
  env: Env,
  sessionUserId: string,
  sessionUserEmail: string,
  targetUserId?: string
): Promise<Response> {
  try {
    const userId = targetUserId || sessionUserId;

    let targetUserEmail: string;
    if (userId === sessionUserId) {
      targetUserEmail = sessionUserEmail;
    } else {
      const user = await env.DB.prepare(`
        SELECT userEmail FROM users WHERE userId = ?
      `).bind(userId).first();

      if (!user) {
        return errorResponse('USER_NOT_FOUND', 'User not found');
      }

      targetUserEmail = user.userEmail as string;
    }

    // Get project memberships
    const projectMembershipsResponse = await getUserProjects(
      env,
      sessionUserId,
      sessionUserEmail,
      userId
    );

    if (!projectMembershipsResponse.ok) {
      return projectMembershipsResponse;
    }

    const responseData = await projectMembershipsResponse.json() as { data: any[] };
    const projectMemberships = responseData.data;

    // Calculate statistics
    const stats = {
      totalProjects: projectMemberships.length,
      activeProjects: projectMemberships.filter((p: any) => p.status === 'active').length,
      completedProjects: projectMemberships.filter((p: any) => p.status === 'completed').length,
      createdProjects: projectMemberships.filter((p: any) => p.role === 'creator').length,
      memberProjects: projectMemberships.filter((p: any) => p.role === 'member').length,
      totalGroups: projectMemberships.reduce((sum: number, p: any) => sum + p.groups.length, 0),
      totalSubmissions: 0 // Would require querying submissions across all projects
    };

    // Get total submissions count
    const submissionsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM submissions_with_status
      WHERE submittedBy = (SELECT userId FROM users WHERE userEmail = ?)
    `).bind(targetUserEmail).first();

    if (submissionsCount) {
      stats.totalSubmissions = submissionsCount.count as number;
    }

    return successResponse(stats);
  } catch (error) {
    console.error('Get user stats error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user statistics');
  }
}

/**
 * Helper: Get user email by ID
 */
export async function getUserEmailById(env: Env, userId: string): Promise<string | null> {
  try {
    const user = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userId = ?
    `).bind(userId).first();

    return user ? (user.userEmail as string) : null;
  } catch (error) {
    console.warn('Get user email by ID error:', error);
    return null;
  }
}
