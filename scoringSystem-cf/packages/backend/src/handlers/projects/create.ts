/**
 * Project Creation Handlers
 * Migrated from GAS scripts/projects_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { generateId, ID_PREFIXES } from '@utils/id-generator';
import { stringifyJSON } from '@utils/json';
import { logGlobalOperation } from '@utils/logging';
import { sanitizePlainText, sanitizeDescription } from '@utils/sanitize';

/**
 * Create a new project
 */
export async function createProject(
  env: Env,
  userEmail: string,
  projectData: {
    projectName: string;
    description: string;
    scoreRangeMin?: number;
    scoreRangeMax?: number;
  }
): Promise<Response> {
  try {
    // Check if user has permission to create projects (must be Global PM)
    const isGlobalPM = await checkGlobalPermission(env, userEmail, 'create_project');
    if (!isGlobalPM) {
      return errorResponse('ACCESS_DENIED', 'Only Global PM can create projects');
    }

    // Validate required fields
    if (!projectData.projectName || !projectData.description) {
      return errorResponse('INVALID_INPUT', 'Project name and description are required');
    }

    // Sanitize input to prevent XSS
    const sanitizedName = sanitizePlainText(projectData.projectName).substring(0, 100);
    const sanitizedDescription = sanitizeDescription(projectData.description).substring(0, 1000);

    // Validate and set score range
    const scoreRangeMin = projectData.scoreRangeMin !== undefined ? Number(projectData.scoreRangeMin) : 65;
    const scoreRangeMax = projectData.scoreRangeMax !== undefined ? Number(projectData.scoreRangeMax) : 95;

    if (scoreRangeMin < 0 || scoreRangeMin > 100 || scoreRangeMax < 0 || scoreRangeMax > 100) {
      return errorResponse('INVALID_INPUT', 'Score range must be between 0 and 100');
    }

    if (scoreRangeMin >= scoreRangeMax) {
      return errorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
    }

    // Check concurrent projects limit
    const maxConcurrentProjects = parseInt(env.MAX_CONCURRENT_PROJECTS || '5');
    const userId = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
      .bind(userEmail).first();

    const activeProjectsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE createdBy = ? AND status = 'active'
    `).bind(userId?.userId).first();

    if (activeProjectsCount && (activeProjectsCount.count as number) >= maxConcurrentProjects) {
      return errorResponse('LIMIT_EXCEEDED', `Maximum concurrent projects limit (${maxConcurrentProjects}) reached`);
    }

    // Generate project ID
    const projectId = generateId(ID_PREFIXES.PROJECT);
    const timestamp = Date.now();

    // Create project record
    await env.DB.prepare(`
      INSERT INTO projects (
        projectId, projectName, description, scoreRangeMin, scoreRangeMax,
        totalStages, currentStage, status, createdBy, createdTime, lastModified, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      projectId,
      sanitizedName,
      sanitizedDescription,
      scoreRangeMin,
      scoreRangeMax,
      0,
      0,
      'active',
      userId?.userId,
      timestamp,
      timestamp,
      timestamp,
      timestamp
    ).run();

    // Log project creation
    await logGlobalOperation(env, userEmail, 'project_created', 'project', projectId, {});

    return successResponse({
      projectId,
      projectName: sanitizedName,
      description: sanitizedDescription,
      scoreRangeMin,
      scoreRangeMax,
      status: 'active',
      createdTime: timestamp
    }, 'Project created successfully');
  } catch (error) {
    console.error('Create project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to create project');
  }
}

/**
 * Clone an existing project
 */
export async function cloneProject(
  env: Env,
  userEmail: string,
  projectId: string,
  newProjectName: string
): Promise<Response> {
  try {
    // Check if user has permission to create projects
    const isGlobalPM = await checkGlobalPermission(env, userEmail, 'create_project');
    if (!isGlobalPM) {
      return errorResponse('ACCESS_DENIED', 'Only Global PM can clone projects');
    }

    if (!newProjectName || !newProjectName.trim()) {
      return errorResponse('INVALID_INPUT', 'New project name is required');
    }

    // Get original project
    const originalProject = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!originalProject) {
      return errorResponse('PROJECT_NOT_FOUND', 'Original project not found');
    }

    // Sanitize new project name
    const sanitizedName = newProjectName.trim().substring(0, 100);

    // Check concurrent projects limit
    const maxConcurrentProjects = parseInt(env.MAX_CONCURRENT_PROJECTS || '5');
    const userId = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
      .bind(userEmail).first();

    const activeProjectsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE createdBy = ? AND status = 'active'
    `).bind(userId?.userId).first();

    if (activeProjectsCount && (activeProjectsCount.count as number) >= maxConcurrentProjects) {
      return errorResponse('LIMIT_EXCEEDED', `Maximum concurrent projects limit (${maxConcurrentProjects}) reached`);
    }

    // Generate new project ID
    const newProjectId = generateId(ID_PREFIXES.PROJECT);
    const timestamp = Date.now();

    // Create cloned project
    await env.DB.prepare(`
      INSERT INTO projects (
        projectId, projectName, description, scoreRangeMin, scoreRangeMax,
        totalStages, currentStage, status, createdBy, createdTime, lastModified, createdAt, updatedAt,
        maxCommentSelections, studentRankingWeight, teacherRankingWeight, commentRewardPercentile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newProjectId,
      sanitizedName,
      `${originalProject.description} (複製自: ${originalProject.projectName})`,
      originalProject.scoreRangeMin,
      originalProject.scoreRangeMax,
      0,
      0,
      'active',
      userId?.userId,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      originalProject.maxCommentSelections,
      originalProject.studentRankingWeight,
      originalProject.teacherRankingWeight,
      originalProject.commentRewardPercentile
    ).run();

    // Copy project tags
    const assignmentId = generateId('asmt_');
    await env.DB.prepare(`
      INSERT INTO projecttags (assignmentId, projectId, tagId, assignedAt, isActive)
      SELECT ?, ?, tagId, ?, isActive
      FROM projecttags
      WHERE projectId = ?
    `).bind(assignmentId, newProjectId, timestamp, projectId).run();

    // Copy stages (exclude archived stages)
    const originalStages = await env.DB.prepare(`
      SELECT * FROM stages_with_status
      WHERE projectId = ? AND archivedTime IS NULL
      ORDER BY stageOrder
    `).bind(projectId).all();

    let stageCount = 0;

    for (const stage of originalStages.results) {
      const newStageId = generateId(ID_PREFIXES.STAGE);

      await env.DB.prepare(`
        INSERT INTO stages (
          stageId, projectId, stageName, description, stageOrder,
          startTime, endTime, reportRewardPool, commentRewardPool,
          status, createdBy, createdTime, lastModified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newStageId,
        newProjectId,
        (stage as any).stageName,
        (stage as any).description || '',
        (stage as any).stageOrder,
        (stage as any).startTime,
        (stage as any).endTime,
        (stage as any).reportRewardPool || 0,
        (stage as any).commentRewardPool || 0,
        'pending',
        userId?.userId,
        timestamp,
        timestamp
      ).run();

      stageCount++;
    }

    // Update total stages count
    if (stageCount > 0) {
      await env.DB.prepare(`
        UPDATE projects SET totalStages = ? WHERE projectId = ?
      `).bind(stageCount, newProjectId).run();
    }

    // Log project clone
    await logGlobalOperation(env, userEmail, 'project_cloned', 'project', newProjectId, {}, {
      relatedEntities: {
        originalProject: projectId
      }
    });

    return successResponse({
      projectId: newProjectId,
      projectName: sanitizedName,
      status: 'active',
      createdTime: timestamp
    }, 'Project cloned successfully');
  } catch (error) {
    console.error('Clone project error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to clone project');
  }
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
      const permissions = JSON.parse((row.globalPermissions as string) || '[]');
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

// Logging is now handled by centralized utils/logging module
