/**
 * Stage Pause/Resume Handlers
 * Provides functionality to pause and resume stages
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { logProjectOperation } from '@utils/logging';
import { queueBatchNotifications } from '../../queues/notification-producer';
import { getStageMemberEmails } from '@utils/notifications';

/**
 * Pause a stage
 * Only stages in 'active' or 'voting' status can be paused
 * Sets pausedTime timestamp to mark the stage as paused
 *
 * @param env - Environment bindings
 * @param userEmail - User's email performing the operation
 * @param projectId - Project ID
 * @param stageId - Stage ID to pause
 * @param reason - Required reason for pausing
 */
export async function pauseStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  reason: string
): Promise<Response> {
  try {
    // Get current stage with auto-calculated status
    const stage = await env.DB.prepare(`
      SELECT * FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const currentStatus = stage.status as string;
    const stageName = stage.stageName as string || '未命名階段';

    // Only allow pausing from 'active' or 'voting' status
    if (currentStatus !== 'active' && currentStatus !== 'voting') {
      return errorResponse(
        'INVALID_OPERATION',
        `無法暫停 ${currentStatus} 狀態的階段。只有「進行中」或「投票中」的階段可以暫停。`,
        {
          currentStatus,
          allowedStatuses: ['active', 'voting']
        }
      );
    }

    // Check if stage is already being settled
    if (stage.settlingTime) {
      return errorResponse(
        'INVALID_OPERATION',
        '階段正在結算中，無法暫停。',
        { currentStatus: 'settling' }
      );
    }

    // Check if stage is already paused (double-check)
    if (stage.pausedTime) {
      return errorResponse(
        'INVALID_OPERATION',
        '階段已經處於暫停狀態。',
        { currentStatus: 'paused' }
      );
    }

    const timestamp = Date.now();

    // Set pausedTime to pause the stage
    await env.DB.prepare(`
      UPDATE stages
      SET pausedTime = ?, updatedAt = ?
      WHERE stageId = ? AND projectId = ?
    `).bind(timestamp, timestamp, stageId, projectId).run();

    // Log the pause operation with reason
    await logProjectOperation(env, userEmail, projectId, 'stage_paused', 'stage', stageId, {
      stageName,
      previousStatus: currentStatus,
      reason,
      pausedTime: timestamp,
      pausedBy: userEmail
    });

    // Send notifications to project members
    try {
      const members = await getStageMemberEmails(env, projectId, stageId);

      if (members.length > 0) {
        await queueBatchNotifications(env, members.map(email => ({
          targetUserEmail: email,
          type: 'stage_paused' as const,
          title: '階段已暫停',
          content: `${stageName} 階段已暫停。原因：${reason}`,
          projectId,
          stageId,
          metadata: { reason }
        })));
      }
    } catch (notifyError) {
      console.error('[pauseStage] Failed to send notifications:', notifyError);
      // Don't fail the operation if notification fails
    }

    return successResponse({
      stageId,
      stageName,
      previousStatus: currentStatus,
      newStatus: 'paused',
      pausedTime: timestamp,
      reason
    }, '階段已暫停');

  } catch (error) {
    console.error('Pause stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to pause stage');
  }
}

/**
 * Resume a paused stage
 * Clears pausedTime timestamp to resume the stage
 * Stage will return to its calculated status (active/voting based on timestamps)
 *
 * @param env - Environment bindings
 * @param userEmail - User's email performing the operation
 * @param projectId - Project ID
 * @param stageId - Stage ID to resume
 */
export async function resumeStage(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Get current stage with auto-calculated status
    const stage = await env.DB.prepare(`
      SELECT * FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const currentStatus = stage.status as string;
    const stageName = stage.stageName as string || '未命名階段';

    // Only allow resuming from 'paused' status
    if (currentStatus !== 'paused') {
      return errorResponse(
        'INVALID_OPERATION',
        `無法恢復 ${currentStatus} 狀態的階段。只有「已暫停」的階段可以恢復。`,
        {
          currentStatus,
          allowedStatuses: ['paused']
        }
      );
    }

    // Check that pausedTime exists (should always be true if status is 'paused')
    if (!stage.pausedTime) {
      return errorResponse(
        'INVALID_OPERATION',
        '階段狀態異常，請重新整理後再試。'
      );
    }

    const timestamp = Date.now();

    // Calculate what the status will be after resuming
    // This is based on the VIEW logic: forceVotingTime > endTime > startTime
    let expectedStatus: string;
    const now = Date.now();
    const startTime = stage.startTime as number;
    const endTime = stage.endTime as number;
    const forceVotingTime = stage.forceVotingTime as number | null;

    if (forceVotingTime && forceVotingTime > 0) {
      expectedStatus = 'voting';
    } else if (now >= endTime) {
      expectedStatus = 'voting';
    } else if (now >= startTime) {
      expectedStatus = 'active';
    } else {
      expectedStatus = 'pending';
    }

    // Clear pausedTime to resume the stage
    await env.DB.prepare(`
      UPDATE stages
      SET pausedTime = NULL, updatedAt = ?
      WHERE stageId = ? AND projectId = ?
    `).bind(timestamp, stageId, projectId).run();

    // Log the resume operation
    await logProjectOperation(env, userEmail, projectId, 'stage_resumed', 'stage', stageId, {
      stageName,
      previousStatus: 'paused',
      newStatus: expectedStatus,
      resumedTime: timestamp,
      resumedBy: userEmail
    });

    // Send notifications to project members
    try {
      const members = await getStageMemberEmails(env, projectId, stageId);

      if (members.length > 0) {
        await queueBatchNotifications(env, members.map(email => ({
          targetUserEmail: email,
          type: 'stage_resumed' as const,
          title: '階段已恢復',
          content: `${stageName} 階段已恢復，目前狀態：${expectedStatus === 'active' ? '進行中' : expectedStatus === 'voting' ? '投票中' : expectedStatus}`,
          projectId,
          stageId
        })));
      }
    } catch (notifyError) {
      console.error('[resumeStage] Failed to send notifications:', notifyError);
      // Don't fail the operation if notification fails
    }

    return successResponse({
      stageId,
      stageName,
      previousStatus: 'paused',
      newStatus: expectedStatus,
      resumedTime: timestamp
    }, '階段已恢復');

  } catch (error) {
    console.error('Resume stage error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to resume stage');
  }
}
