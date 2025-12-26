/**
 * Stage Configuration Handlers
 * Migrated from GAS scripts/stages_api.js (updateStageConfig function)
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';

/**
 * Update stage configuration
 */
export async function updateStageConfig(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  configUpdates: {
    allowSubmissionEdit?: boolean;
    allowSubmissionDelete?: boolean;
    requireApproval?: boolean;
    maxSubmissionsPerUser?: number;
    allowComments?: boolean;
    allowVoting?: boolean;
    votingMethod?: string;
    minVotesRequired?: number;
    allowSelfVoting?: boolean;
    [key: string]: any;
  }
): Promise<Response> {
  try {
    // Get current stage
    const stage = await env.DB.prepare(`
      SELECT stageId, config FROM stages
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    // Parse existing config
    const currentConfig = parseJSON(stage.config as string, {});

    // Merge with updates
    const newConfig = { ...currentConfig, ...configUpdates };

    // Validate certain config values
    if (newConfig.maxSubmissionsPerUser !== undefined) {
      const maxSubs = parseInt(String(newConfig.maxSubmissionsPerUser));
      if (isNaN(maxSubs) || maxSubs < 1) {
        return errorResponse('INVALID_INPUT', 'maxSubmissionsPerUser must be a positive integer');
      }
      newConfig.maxSubmissionsPerUser = maxSubs;
    }

    if (newConfig.minVotesRequired !== undefined) {
      const minVotes = parseInt(String(newConfig.minVotesRequired));
      if (isNaN(minVotes) || minVotes < 0) {
        return errorResponse('INVALID_INPUT', 'minVotesRequired must be a non-negative integer');
      }
      newConfig.minVotesRequired = minVotes;
    }

    if (newConfig.votingMethod !== undefined) {
      const validMethods = ['simple', 'weighted', 'ranked', 'approval'];
      if (!validMethods.includes(newConfig.votingMethod)) {
        return errorResponse('INVALID_INPUT', `votingMethod must be one of: ${validMethods.join(', ')}`);
      }
    }

    // Update config in database
    await env.DB.prepare(`
      UPDATE stages
      SET config = ?
      WHERE stageId = ? AND projectId = ?
    `).bind(stringifyJSON(newConfig), stageId, projectId).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'stage_config_updated', 'stage', stageId, {
      updatedFields: Object.keys(configUpdates)
    });

    return successResponse(newConfig, 'Stage configuration updated successfully');

  } catch (error) {
    console.error('Update stage config error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update stage configuration');
  }
}

/**
 * Get stage configuration
 */
export async function getStageConfig(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    const stage = await env.DB.prepare(`
      SELECT config FROM stages
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const config = parseJSON(stage.config as string, getDefaultStageConfig());

    return successResponse(config);

  } catch (error) {
    console.error('Get stage config error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get stage configuration');
  }
}

/**
 * Reset stage configuration to defaults
 */
export async function resetStageConfig(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    const stage = await env.DB.prepare(`
      SELECT stageId FROM stages
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const defaultConfig = getDefaultStageConfig();

    await env.DB.prepare(`
      UPDATE stages
      SET config = ?
      WHERE stageId = ? AND projectId = ?
    `).bind(stringifyJSON(defaultConfig), stageId, projectId).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'stage_config_reset', 'stage', stageId, {
      resetTo: 'default'
    });

    return successResponse(defaultConfig, 'Stage configuration reset to defaults');

  } catch (error) {
    console.error('Reset stage config error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to reset stage configuration');
  }
}

/**
 * Get default stage configuration
 */
export function getDefaultStageConfig(): any {
  return {
    // Submission settings
    allowSubmissionEdit: true,
    allowSubmissionDelete: false,
    requireApproval: false,
    maxSubmissionsPerUser: 10,
    minSubmissionLength: 10,
    maxSubmissionLength: 10000,

    // Comment settings
    allowComments: true,
    allowCommentEdit: true,
    allowCommentDelete: false,
    maxCommentLength: 2000,
    requireCommentApproval: false,

    // Voting settings
    allowVoting: true,
    votingMethod: 'simple', // 'simple', 'weighted', 'ranked', 'approval'
    minVotesRequired: 3,
    maxVotesPerUser: 10,
    allowSelfVoting: false,
    allowVoteChange: true,

    // Scoring settings
    autoCalculateScores: true,
    scoringFormula: 'average', // 'average', 'median', 'weighted'
    minScorersRequired: 2,

    // Notification settings
    notifyOnSubmission: true,
    notifyOnComment: false,
    notifyOnVote: false,
    notifyOnStageStart: true,
    notifyOnStageEnd: true,

    // Advanced settings
    enableAnonymousSubmission: false,
    enableAnonymousVoting: false
  };
}

/**
 * Helper: Log operation
 */
// Logging is now handled by centralized utils/logging module
