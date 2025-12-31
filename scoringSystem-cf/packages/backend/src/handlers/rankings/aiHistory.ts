/**
 * @fileoverview AI Ranking History handler
 * Retrieves AI ranking call history from database
 */

import type { Env } from '../../types';
import { successResponse, errorResponse, ERROR_CODES } from '../../utils/response';
import { checkIsTeacherOrAbove } from '../../middleware/permissions';
import {
  getAIServiceCallsByStage,
  getAIServiceCallById
} from '../../db/ai-service';

/**
 * Get AI ranking history for a stage
 * Returns all AI ranking calls made by any teacher for this stage
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Query parameters
 * @returns List of AI service call records
 */
export async function getAIRankingHistory(
  env: Env,
  userEmail: string,
  data: {
    projectId: string;
    stageId: string;
    rankingType?: 'submission' | 'comment';
    limit?: number;
  }
): Promise<Response> {
  try {
    const { projectId, stageId, rankingType, limit = 20 } = data;

    // Validate required fields
    if (!projectId || !stageId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Project ID and Stage ID are required'
      );
    }

    // Check permission - must be teacher or above
    const isTeacherOrAbove = await checkIsTeacherOrAbove(env.DB, userEmail, projectId);
    if (!isTeacherOrAbove) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'Only teachers can view AI ranking history'
      );
    }

    // Get history from database
    const records = await getAIServiceCallsByStage(env.DB, stageId, {
      rankingType,
      limit: Math.min(limit, 50) // Cap at 50
    });

    // Parse JSON fields for each record
    const parsedRecords = records.map(record => ({
      ...record,
      result: record.result ? JSON.parse(record.result) : undefined,
      btComparisons: record.btComparisons ? JSON.parse(record.btComparisons) : undefined,
      btStrengthParams: record.btStrengthParams ? JSON.parse(record.btStrengthParams) : undefined
    }));

    return successResponse({
      records: parsedRecords,
      total: parsedRecords.length
    });
  } catch (error) {
    console.error('Get AI ranking history error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get AI ranking history'
    );
  }
}

/**
 * Get a single AI ranking call detail
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Call ID
 * @returns AI service call record with parsed fields
 */
export async function getAIRankingDetail(
  env: Env,
  userEmail: string,
  data: {
    projectId: string;
    callId: string;
  }
): Promise<Response> {
  try {
    const { projectId, callId } = data;

    // Validate required fields
    if (!projectId || !callId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Project ID and Call ID are required'
      );
    }

    // Check permission - must be teacher or above
    const isTeacherOrAbove = await checkIsTeacherOrAbove(env.DB, userEmail, projectId);
    if (!isTeacherOrAbove) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'Only teachers can view AI ranking details'
      );
    }

    // Get the record
    const record = await getAIServiceCallById(env.DB, callId);

    if (!record) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI ranking call not found'
      );
    }

    // Verify the record belongs to this project
    if (record.projectId !== projectId) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'AI ranking call does not belong to this project'
      );
    }

    // Parse JSON fields
    const parsedRecord = {
      ...record,
      result: record.result ? JSON.parse(record.result) : undefined,
      btComparisons: record.btComparisons ? JSON.parse(record.btComparisons) : undefined,
      btStrengthParams: record.btStrengthParams ? JSON.parse(record.btStrengthParams) : undefined
    };

    return successResponse(parsedRecord);
  } catch (error) {
    console.error('Get AI ranking detail error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get AI ranking detail'
    );
  }
}
