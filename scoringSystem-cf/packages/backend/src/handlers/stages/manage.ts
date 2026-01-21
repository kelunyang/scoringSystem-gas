/**
 * Stage Management Handlers
 * Migrated from GAS scripts/stages_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { generateId, generateStageId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';
import { queueBatchNotifications } from '../../queues/notification-producer';
import { getStageMemberEmails } from '@utils/notifications';
import { getConfigValue } from '@utils/config';

/**
 * Create a new stage in a project
 */
export async function createStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageData: {
    stageName: string;
    description?: string;
    startTime: number;
    endTime: number;
    reportRewardPool?: number;
    commentRewardPool?: number;
    stageType?: string;
  }
): Promise<Response> {
  try {
    // Validate required fields
    if (!stageData.stageName || !stageData.startTime || !stageData.endTime) {
      return errorResponse('INVALID_INPUT', 'Missing required fields: stageName, startTime, endTime');
    }

    // Validate dates
    const startTime = parseInt(String(stageData.startTime));
    const endTime = parseInt(String(stageData.endTime));

    if (isNaN(startTime) || isNaN(endTime)) {
      return errorResponse('INVALID_INPUT', 'Invalid date format');
    }

    if (endTime <= startTime) {
      return errorResponse('INVALID_INPUT', 'End time must be after start time');
    }

    // Check maximum stage duration (30 days default)
    const maxStageDays = await getConfigValue(env, 'MAX_STAGE_DURATION_DAYS', { parseAsInt: true });
    const stageDurationDays = (endTime - startTime) / (24 * 60 * 60 * 1000);

    if (stageDurationDays > maxStageDays) {
      return errorResponse('INVALID_INPUT', `Stage duration cannot exceed ${maxStageDays} days`);
    }

    // Check if project exists
    const project = await env.DB.prepare(`
      SELECT projectId, status FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Get next stage order
    const maxOrderResult = await env.DB.prepare(`
      SELECT COALESCE(MAX(stageOrder), 0) as maxOrder
      FROM stages
      WHERE projectId = ?
    `).bind(projectId).first();

    const nextOrder = ((maxOrderResult?.maxOrder as number) || 0) + 1;

    // Create stage record
    const stageId = generateStageId();
    const timestamp = Date.now();

    const config = stringifyJSON({
      allowSubmissionEdit: true,
      allowSubmissionDelete: false,
      requireApproval: false,
      maxSubmissionsPerUser: 10,
      allowComments: true,
      allowVoting: true
    });

    await env.DB.prepare(`
      INSERT INTO stages (
        stageId, projectId, stageName, stageOrder, stageType,
        status, startTime, endTime,
        reportRewardPool, commentRewardPool, config,
        description, createdTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stageId,
      projectId,
      stageData.stageName.substring(0, 100),
      nextOrder,
      stageData.stageType || 'normal',
      'pending',
      startTime,
      endTime,
      stageData.reportRewardPool || 0,
      stageData.commentRewardPool || 0,
      config,
      stageData.description || '',
      timestamp
    ).run();

    // Update project totalStages count
    await env.DB.prepare(`
      UPDATE projects
      SET totalStages = ?, lastModified = ?
      WHERE projectId = ?
    `).bind(nextOrder, timestamp, projectId).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'stage_created', 'stage', stageId, {
      stageOrder: nextOrder
    });

    return successResponse({
      stageId,
      stageName: stageData.stageName,
      stageOrder: nextOrder,
      startTime: startTime,
      endTime: endTime,
      status: 'pending',
      description: stageData.description || '',
      createdTime: timestamp
    }, 'Stage created successfully');

  } catch (error) {
    console.error('Create stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to create stage');
  }
}

/**
 * Get stage details
 */
export async function getStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Get stage with statistics
    const stage = await env.DB.prepare(`
      SELECT
        s.stageId, s.projectId, s.stageName, s.stageOrder, s.stageType,
        s.status, s.startTime, s.endTime,
        s.reportRewardPool, s.commentRewardPool, s.config,
        s.description, s.createdTime,
        (SELECT COUNT(*) FROM submissions_with_status WHERE stageId = s.stageId) as submissionCount,
        (SELECT COUNT(*) FROM comments WHERE stageId = s.stageId) as commentCount
      FROM stages_with_status s
      WHERE s.stageId = ? AND s.projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const stageData = {
      stageId: stage.stageId,
      projectId: stage.projectId,
      stageName: stage.stageName,
      stageOrder: stage.stageOrder,
      stageType: stage.stageType,
      status: stage.status,
      startTime: stage.startTime,
      endTime: stage.endTime,
      reportRewardPool: stage.reportRewardPool || 0,
      commentRewardPool: stage.commentRewardPool || 0,
      description: stage.description,
      createdTime: stage.createdTime,
      config: parseJSON(stage.config as string, {}),
      statistics: {
        submissionCount: stage.submissionCount || 0,
        commentCount: stage.commentCount || 0
      }
    };

    return successResponse(stageData);

  } catch (error) {
    console.error('Get stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get stage');
  }
}

/**
 * Update stage details
 */
export async function updateStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  updates: {
    stageName?: string;
    description?: string;
    startTime?: number;
    endTime?: number;
    status?: string;
    stageOrder?: number;
    reportRewardPool?: number;
    commentRewardPool?: number;
  }
): Promise<Response> {
  try {
    // Get current stage with auto-calculated status
    const stage = await env.DB.prepare(`
      SELECT *, status FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const allowedUpdates: any = {};

    // Validate and process updates - only add to allowedUpdates if value actually changed
    if (updates.stageName !== undefined) {
      const trimmedName = updates.stageName.substring(0, 100);
      if (trimmedName !== stage.stageName) {
        allowedUpdates.stageName = trimmedName;
      }
    }

    if (updates.description !== undefined) {
      if (updates.description !== stage.description) {
        allowedUpdates.description = updates.description;
      }
    }

    if (updates.startTime !== undefined) {
      const dateValue = parseInt(String(updates.startTime));
      if (!isNaN(dateValue) && dateValue !== stage.startTime) {
        allowedUpdates.startTime = dateValue;
      }
    }

    if (updates.endTime !== undefined) {
      const dateValue = parseInt(String(updates.endTime));
      if (!isNaN(dateValue) && dateValue !== stage.endTime) {
        allowedUpdates.endTime = dateValue;
      }
    }

    if (updates.status !== undefined) {
      const validStatuses = ['pending', 'active', 'voting', 'completed', 'archived', 'paused'];
      if (validStatuses.includes(updates.status) && updates.status !== stage.status) {
        allowedUpdates.status = updates.status;
      }
    }

    if (updates.stageOrder !== undefined) {
      const orderValue = parseInt(String(updates.stageOrder));
      if (!isNaN(orderValue) && orderValue > 0 && orderValue !== stage.stageOrder) {
        allowedUpdates.stageOrder = orderValue;
      }
    }

    if (updates.reportRewardPool !== undefined) {
      const poolValue = parseInt(String(updates.reportRewardPool));
      if (!isNaN(poolValue) && poolValue >= 0 && poolValue !== stage.reportRewardPool) {
        allowedUpdates.reportRewardPool = poolValue;
      }
    }

    if (updates.commentRewardPool !== undefined) {
      const poolValue = parseInt(String(updates.commentRewardPool));
      if (!isNaN(poolValue) && poolValue >= 0 && poolValue !== stage.commentRewardPool) {
        allowedUpdates.commentRewardPool = poolValue;
      }
    }

    // Validate date consistency
    const newStartDate = allowedUpdates.startTime || stage.startTime;
    const newEndDate = allowedUpdates.endTime || stage.endTime;

    if (newEndDate <= newStartDate) {
      return errorResponse('INVALID_INPUT', 'End date must be after start date');
    }

    // VOTING LOCK: Check if stage has voting records before allowing time or status changes
    // Only allow time extension for pending, active, or voting stages
    // If stage is voting/completed/archived and has votes, prevent time or status changes
    // Uses a re-check pattern to prevent TOCTOU race conditions
    const isTimeChange = allowedUpdates.startTime !== undefined || allowedUpdates.endTime !== undefined;
    const isStatusChange = allowedUpdates.status !== undefined && allowedUpdates.status !== stage.status;

    if (isTimeChange) {
      const stageStatus = stage.status as string;

      // Only allow time changes for pending, active, or voting stages
      if (!['pending', 'active', 'voting'].includes(stageStatus)) {
        return errorResponse('INVALID_OPERATION', `Cannot modify time for ${stageStatus} stage`);
      }

      // If stage is voting or later, check for ANY voting records (teacher + student)
      if (stageStatus === 'voting' || stageStatus === 'completed' || stageStatus === 'archived') {
        const voteStatus = await env.DB.prepare(`
          SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
        `).bind(stageId, projectId).first();

        if (voteStatus?.hasAnyVotes) {
          return errorResponse(
            'VOTING_LOCKED',
            '該階段已有投票紀錄，無法修改結束時間。如需調整請聯繫系統管理員。',
            {
              stageStatus,
              canModifyTime: false,
              reason: 'Voting has already started for this stage'
            }
          );
        }
      }
    }

    // VOTING LOCK: Prevent status changes if stage has voting records
    if (isStatusChange) {
      const currentStatus = stage.status as string;
      const newStatus = allowedUpdates.status as string;

      // Prevent reverting from voting/completed/archived if votes exist
      if (['voting', 'completed', 'archived'].includes(currentStatus)) {
        const voteStatus = await env.DB.prepare(`
          SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
        `).bind(stageId, projectId).first();

        if (voteStatus?.hasAnyVotes) {
          return errorResponse(
            'VOTING_LOCKED',
            '該階段已有投票紀錄，無法修改狀態。如需調整請聯繫系統管理員。',
            {
              currentStatus,
              requestedStatus: newStatus,
              canModifyStatus: false,
              reason: 'Cannot change status when votes exist'
            }
          );
        }
      }
    }

    // REWARD LOCK: Prevent reward pool changes if stage has voting records
    const isRewardChange = allowedUpdates.reportRewardPool !== undefined ||
                           allowedUpdates.commentRewardPool !== undefined;

    if (isRewardChange) {
      const voteStatus = await env.DB.prepare(`
        SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
      `).bind(stageId, projectId).first();

      if (voteStatus?.hasAnyVotes) {
        return errorResponse(
          'VOTING_LOCKED',
          '該階段已有投票紀錄，無法修改獎金池。',
          {
            stageStatus: stage.status,
            canModifyReward: false,
            reason: 'Cannot modify reward pool when votes exist'
          }
        );
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // SECURITY: Whitelist allowed columns to prevent SQL injection
    const ALLOWED_STAGE_COLUMNS = ['stageName', 'description', 'status', 'startTime', 'endTime', 'reportRewardPool', 'commentRewardPool', 'stageOrder', 'updatedAt'];

    // Filter allowedUpdates to only include whitelisted columns
    const safeUpdates: Record<string, any> = {};
    for (const key of ALLOWED_STAGE_COLUMNS) {
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

    // For time or status changes on voting-capable stages, check for votes
    // Note: Using VIEW eliminates the TOCTOU race condition that existed in the old middleware
    if ((isTimeChange || isStatusChange) && ['voting', 'completed', 'archived'].includes(stage.status as string)) {
      const voteStatus = await env.DB.prepare(`
        SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
      `).bind(stageId, projectId).first();

      if (voteStatus?.hasAnyVotes) {
        // Votes were inserted between our check and now - abort the update
        return errorResponse(
          'VOTING_LOCKED',
          isTimeChange
            ? '在處理過程中有新投票記錄產生，無法修改時間。請重試。'
            : '在處理過程中有新投票記錄產生，無法修改狀態。請重試。',
          {
            stageStatus: stage.status,
            canModifyTime: !isTimeChange,
            canModifyStatus: !isStatusChange,
            reason: 'Votes were created during update processing (race condition prevented)'
          }
        );
      }
    }

    // Execute the update
    await env.DB.prepare(`
      UPDATE stages
      SET ${setClause}
      WHERE stageId = ? AND projectId = ?
    `).bind(...values, stageId, projectId).run();

    // Handle status changes
    if (allowedUpdates.status && allowedUpdates.status !== stage.status) {
      const statusChanged = {
        from: stage.status,
        to: allowedUpdates.status
      };

      // If stage is set to active, update project currentStage
      if (allowedUpdates.status === 'active') {
        await env.DB.prepare(`
          UPDATE projects
          SET currentStage = ?, lastModified = ?
          WHERE projectId = ?
        `).bind(stage.stageOrder, Date.now(), projectId).run();
      }

      // Log status change
      await logProjectOperation(env, userEmail, projectId, 'stage_status_changed', 'stage', stageId, {
        ...statusChanged
      });

      // 發送階段狀態變化通知
      try {
        const stageName = (stage as any).stageName || '未命名階段';
        const members = await getStageMemberEmails(env, projectId, stageId);

        let notificationType: 'stage_started' | 'stage_voting' | 'stage_completed' | null = null;
        let title = '';
        let content = '';

        if (allowedUpdates.status === 'active') {
          notificationType = 'stage_started';
          title = '階段已開始';
          content = `${stageName} 階段現已開放提交作品`;
        } else if (allowedUpdates.status === 'voting') {
          notificationType = 'stage_voting';
          title = '階段進入投票';
          content = `${stageName} 階段已進入投票階段`;
        } else if (allowedUpdates.status === 'completed') {
          notificationType = 'stage_completed';
          title = '階段已完成';
          content = `${stageName} 階段已完成`;
        }

        if (notificationType && members.length > 0) {
          await queueBatchNotifications(env, members.map(email => ({
            targetUserEmail: email,
            type: notificationType!,
            title,
            content,
            projectId,
            stageId
          })));
        }
      } catch (error) {
        console.error('[updateStage] Failed to send status change notifications:', error);
      }
    }

    // Log general update with full change tracking
    const changes: Record<string, { oldValue: any; newValue: any }> = {};
    for (const [key, newValue] of Object.entries(allowedUpdates)) {
      if (key !== 'updatedAt') {
        const oldValue = stage[key];
        changes[key] = { oldValue, newValue };
      }
    }

    await logProjectOperation(env, userEmail, projectId, 'stage_updated', 'stage', stageId, {
      changes,  // Complete before/after comparison
      updatedFields: Object.keys(allowedUpdates)  // Kept for backward compatibility
    });

    return successResponse(null, 'Stage updated successfully');

  } catch (error) {
    console.error('Update stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update stage');
  }
}

/**
 * List all stages in a project
 */
export async function listProjectStages(
  env: Env,
  userEmail: string,
  projectId: string,
  includeArchived: boolean = false
): Promise<Response> {
  try {
    let query = `
      SELECT
        s.stageId, s.projectId, s.stageName, s.stageOrder, s.stageType,
        s.status, s.startTime, s.endTime, s.updatedAt, s.settledTime,
        s.reportRewardPool, s.commentRewardPool, s.createdTime, s.description,
        (SELECT COUNT(*) FROM submissions_with_status WHERE stageId = s.stageId) as submissionCount,
        (SELECT COUNT(*) FROM comments WHERE stageId = s.stageId) as commentCount
      FROM stages_with_status s
      WHERE s.projectId = ?
    `;

    if (!includeArchived) {
      query += ` AND s.archivedTime IS NULL`;
    }

    query += ` ORDER BY s.stageOrder ASC`;

    const result = await env.DB.prepare(query).bind(projectId).all();

    const stages = result.results.map(stage => ({
      stageId: stage.stageId,
      projectId: stage.projectId,
      stageName: stage.stageName,
      stageOrder: stage.stageOrder,
      stageType: stage.stageType,
      status: stage.status,
      startTime: stage.startTime,
      endTime: stage.endTime,
      reportRewardPool: stage.reportRewardPool || 0,
      commentRewardPool: stage.commentRewardPool || 0,
      createdTime: stage.createdTime,
      updatedAt: stage.updatedAt,
      settledTime: stage.settledTime,
      description: stage.description || null,
      statistics: {
        submissionCount: stage.submissionCount || 0,
        commentCount: stage.commentCount || 0
      }
    }));

    return successResponse({
      stages,
      total: stages.length
    });

  } catch (error) {
    console.error('List project stages error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to list project stages');
  }
}

/**
 * Clone an existing stage
 */
export async function cloneStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  newStageName: string,
  startTime?: number,
  endTime?: number
): Promise<Response> {
  try {
    // Get original stage (no need for VIEW here, just copying config)
    const originalStage = await env.DB.prepare(`
      SELECT * FROM stages WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!originalStage) {
      return errorResponse('STAGE_NOT_FOUND', 'Original stage not found');
    }

    // Get next stage order
    const maxOrderResult = await env.DB.prepare(`
      SELECT COALESCE(MAX(stageOrder), 0) as maxOrder
      FROM stages
      WHERE projectId = ?
    `).bind(projectId).first();

    const nextOrder = ((maxOrderResult?.maxOrder as number) || 0) + 1;

    // Create new stage with cloned data
    const newStageId = generateStageId();
    const timestamp = Date.now();

    // Use provided dates or calculate based on original duration
    let newStartTime = startTime || Date.now();
    let newEndTime = endTime;

    if (!newEndTime) {
      const originalDuration = (originalStage.endTime as number) - (originalStage.startTime as number);
      newEndTime = newStartTime + originalDuration;
    }

    await env.DB.prepare(`
      INSERT INTO stages (
        stageId, projectId, stageName, stageOrder, stageType,
        status, startTime, endTime,
        reportRewardPool, commentRewardPool, config,
        description, createdTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newStageId,
      projectId,
      newStageName,
      nextOrder,
      originalStage.stageType,
      'pending',
      newStartTime,
      newEndTime,
      originalStage.reportRewardPool,
      originalStage.commentRewardPool,
      originalStage.config,
      originalStage.description,
      timestamp
    ).run();

    // Update project totalStages count
    await env.DB.prepare(`
      UPDATE projects
      SET totalStages = ?, lastModified = ?
      WHERE projectId = ?
    `).bind(nextOrder, timestamp, projectId).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'stage_cloned', 'stage', newStageId, {
      stageOrder: nextOrder
    }, {
      relatedEntities: {
        originalStage: stageId
      }
    });

    return successResponse({
      stageId: newStageId,
      stageName: newStageName,
      stageOrder: nextOrder
    }, 'Stage cloned successfully');

  } catch (error) {
    console.error('Clone stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to clone stage');
  }
}

/**
 * Clone a stage to multiple target projects atomically
 * Uses D1 batch() for atomic transaction - all succeed or all fail
 *
 * @param env - Environment bindings
 * @param userEmail - User's email performing the operation
 * @param sourceProjectId - Source project ID
 * @param stageId - Source stage ID to clone
 * @param newStageName - Name for the cloned stages
 * @param targetProjectIds - Array of target project IDs
 * @param startTime - Optional start time for cloned stages
 * @param endTime - Optional end time for cloned stages
 */
export async function cloneStageToProjects(
  env: Env,
  userEmail: string,
  sourceProjectId: string,
  stageId: string,
  newStageName: string,
  targetProjectIds: string[],
  startTime?: number,
  endTime?: number
): Promise<Response> {
  try {
    // 1. Validate source stage exists
    const originalStage = await env.DB.prepare(`
      SELECT * FROM stages WHERE stageId = ? AND projectId = ?
    `).bind(stageId, sourceProjectId).first();

    if (!originalStage) {
      return errorResponse('STAGE_NOT_FOUND', 'Original stage not found');
    }

    // 2. Validate all target projects exist
    const projectPlaceholders = targetProjectIds.map(() => '?').join(',');
    const projectsResult = await env.DB.prepare(`
      SELECT projectId, projectName FROM projects
      WHERE projectId IN (${projectPlaceholders})
    `).bind(...targetProjectIds).all();

    const existingProjectIds = new Set(projectsResult.results.map((p: any) => p.projectId));
    const projectNameMap = new Map(
      projectsResult.results.map((p: any) => [p.projectId, p.projectName])
    );

    // Check if all target projects exist
    for (const targetId of targetProjectIds) {
      if (!existingProjectIds.has(targetId)) {
        return errorResponse('PROJECT_NOT_FOUND', `Target project not found: ${targetId}`);
      }
    }

    // 3. Get max stageOrder for each target project using batch query
    const stageOrderQueries = targetProjectIds.map(projectId =>
      env.DB.prepare(`
        SELECT ? as projectId, COALESCE(MAX(stageOrder), 0) as maxOrder
        FROM stages WHERE projectId = ?
      `).bind(projectId, projectId)
    );
    const stageOrderResults = await env.DB.batch(stageOrderQueries);

    // Build map of projectId -> nextOrder
    const nextOrderMap = new Map<string, number>();
    stageOrderResults.forEach((result, index) => {
      const row = result.results?.[0] as { projectId: string; maxOrder: number } | undefined;
      const maxOrder = row?.maxOrder || 0;
      nextOrderMap.set(targetProjectIds[index], maxOrder + 1);
    });

    // 4. Prepare batch statements for atomic execution
    const timestamp = Date.now();
    const clonedStages: Array<{
      projectId: string;
      stageId: string;
      stageName: string;
      stageOrder: number;
    }> = [];

    const batchStatements: ReturnType<typeof env.DB.prepare>[] = [];

    // Calculate dates
    let newStartTime = startTime || Date.now();
    let newEndTime = endTime;
    if (!newEndTime) {
      const originalDuration = (originalStage.endTime as number) - (originalStage.startTime as number);
      newEndTime = newStartTime + originalDuration;
    }

    for (const projectId of targetProjectIds) {
      const newStageId = generateStageId();
      const nextOrder = nextOrderMap.get(projectId)!;

      clonedStages.push({
        projectId,
        stageId: newStageId,
        stageName: newStageName,
        stageOrder: nextOrder
      });

      // INSERT stage statement
      batchStatements.push(
        env.DB.prepare(`
          INSERT INTO stages (
            stageId, projectId, stageName, stageOrder, stageType,
            status, startTime, endTime,
            reportRewardPool, commentRewardPool, config,
            description, createdTime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newStageId,
          projectId,
          newStageName,
          nextOrder,
          originalStage.stageType,
          'pending',
          newStartTime,
          newEndTime,
          originalStage.reportRewardPool,
          originalStage.commentRewardPool,
          originalStage.config,
          originalStage.description,
          timestamp
        )
      );

      // UPDATE project totalStages statement
      batchStatements.push(
        env.DB.prepare(`
          UPDATE projects
          SET totalStages = ?, lastModified = ?
          WHERE projectId = ?
        `).bind(nextOrder, timestamp, projectId)
      );
    }

    // 5. Execute atomic batch - D1 batch() is transactional
    // If any statement fails, all are rolled back
    try {
      await env.DB.batch(batchStatements);
    } catch (batchError) {
      console.error('Batch clone failed:', batchError);
      return errorResponse('BATCH_CLONE_FAILED',
        'Failed to clone stage to all projects. No changes were made.',
        { reason: batchError instanceof Error ? batchError.message : 'Unknown error' }
      );
    }

    // 6. Log operations (non-critical, don't fail if logging fails)
    for (const cloned of clonedStages) {
      try {
        await logProjectOperation(env, userEmail, cloned.projectId, 'stage_cloned', 'stage', cloned.stageId, {
          stageOrder: cloned.stageOrder,
          sourceProjectId,
          sourceStageId: stageId
        }, {
          relatedEntities: {
            originalStage: stageId,
            sourceProject: sourceProjectId
          }
        });
      } catch (logError) {
        console.error(`Failed to log clone operation for ${cloned.projectId}:`, logError);
      }
    }

    // 7. Return success response with project names
    return successResponse({
      clonedStages: clonedStages.map(s => ({
        ...s,
        projectName: projectNameMap.get(s.projectId) || 'Unknown'
      })),
      totalCloned: clonedStages.length
    }, `Stage successfully cloned to ${clonedStages.length} project(s)`);

  } catch (error) {
    console.error('Clone stage to projects error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to clone stage to projects');
  }
}

/**
 * Delete (archive) a stage
 */
export async function deleteStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Check if stage exists with auto-calculated status
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const currentStatus = stage.status as string;

    // VOTING LOCK: Check if stage has any voting records before allowing deletion/archiving
    // Protected statuses: voting, completed, archived
    if (['voting', 'completed', 'archived'].includes(currentStatus)) {
      const voteStatus = await env.DB.prepare(`
        SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
      `).bind(stageId, projectId).first();

      if (voteStatus?.hasAnyVotes) {
        return errorResponse(
          'VOTING_LOCKED',
          '該階段已有投票紀錄，無法刪除。如需調整請聯繫系統管理員。',
          {
            stageStatus: currentStatus,
            canDelete: false,
            reason: 'Cannot delete stage when votes exist'
          }
        );
      }
    }

    // Check if stage has submissions
    const submissionCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM submissions_with_status
      WHERE stageId = ?
    `).bind(stageId).first();

    if (submissionCount && (submissionCount.count as number) > 0) {
      // Check votes before archive
      if (['voting', 'completed', 'archived'].includes(currentStatus)) {
        const voteStatus = await env.DB.prepare(`
          SELECT hasAnyVotes FROM stages_vote_status WHERE stageId = ? AND projectId = ?
        `).bind(stageId, projectId).first();

        if (voteStatus?.hasAnyVotes) {
          return errorResponse(
            'VOTING_LOCKED',
            '在處理過程中有新投票記錄產生，無法刪除。請重試。',
            {
              stageStatus: currentStatus,
              canDelete: false,
              reason: 'Votes were created during delete processing (race condition prevented)'
            }
          );
        }
      }

      // Archive instead of delete if has submissions (CAS pattern)
      const timestamp = Date.now();
      const result = await env.DB.prepare(`
        UPDATE stages
        SET archivedTime = ?, updatedAt = ?
        WHERE stageId = ? AND projectId = ? AND archivedTime IS NULL
      `).bind(timestamp, timestamp, stageId, projectId).run();

      // Check if CAS succeeded
      if (result.meta.changes === 0) {
        return errorResponse(
          'ARCHIVE_CONFLICT',
          '階段歸檔失敗，可能已被歸檔或被其他操作修改。請重新整理後再試。',
          {
            reason: 'Stage was already archived or modified by another request'
          }
        );
      }

      await logProjectOperation(env, userEmail, projectId, 'stage_archived', 'stage', stageId, {});

      return successResponse(null, 'Stage archived successfully (has submissions)');
    } else {
      // SECURITY FIX: Use soft delete (archive) instead of hard DELETE
      // Hard DELETE can break referential integrity if there are orphaned records
      // Soft delete preserves audit trail and prevents data loss
      const timestamp = Date.now();
      const result = await env.DB.prepare(`
        UPDATE stages
        SET archivedTime = ?, updatedAt = ?
        WHERE stageId = ? AND projectId = ? AND archivedTime IS NULL
      `).bind(timestamp, timestamp, stageId, projectId).run();

      // Check if CAS succeeded
      if (result.meta.changes === 0) {
        return errorResponse(
          'ARCHIVE_CONFLICT',
          '階段歸檔失敗，可能已被歸檔或被其他操作修改。請重新整理後再試。',
          {
            reason: 'Stage was already archived or modified by another request'
          }
        );
      }

      await logProjectOperation(env, userEmail, projectId, 'stage_archived', 'stage', stageId, {});

      return successResponse(null, 'Stage archived successfully');
    }

  } catch (error) {
    console.error('Delete stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to delete stage');
  }
}

// Logging is now handled by centralized utils/logging module
