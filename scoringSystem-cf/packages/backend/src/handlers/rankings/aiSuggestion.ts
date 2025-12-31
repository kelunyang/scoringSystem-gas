/**
 * @fileoverview AI Ranking Suggestion handler
 * Queues AI ranking requests for async processing
 *
 * Architecture (refactored 2025-12-30):
 * - All AI ranking requests now go through Queue + WebSocket
 * - Supports both direct mode and Bradley-Terry (BT) mode
 * - Progress updates via WebSocket (Durable Object NotificationHub)
 * - Results stored in aiservicecalls table
 */

import type { Env } from '../../types';
import type { AIRankingItem } from '@repo/shared';
import { successResponse, errorResponse, ERROR_CODES } from '../../utils/response';
import {
  getAIProviderById,
  getEnabledAIProviders
} from '../../utils/ai-provider';
import { checkIsTeacherOrAbove } from '../../middleware/permissions';
import { logProjectOperation } from '../../utils/logging';
import { queueDirectRanking, queueBTRanking, queueMultiAgentRanking } from '../../queues/ai-ranking-producer';
import { getExpectedComparisonCount } from '../../utils/bradley-terry';

/**
 * Get list of enabled AI providers for ranking suggestions
 *
 * @param env - Cloudflare Workers environment
 * @returns List of enabled AI providers
 */
export async function getAIProvidersForRanking(env: Env): Promise<Response> {
  try {
    const providers = await getEnabledAIProviders(env.KV);

    return successResponse({
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        model: p.model
      }))
    });
  } catch (error) {
    console.error('Get AI providers for ranking error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get AI providers'
    );
  }
}

/**
 * Submit AI ranking suggestion request (direct mode)
 * Now queues the request for async processing
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Request data
 * @returns Task ID for tracking progress via WebSocket
 */
export async function submitAIRankingSuggestion(
  env: Env,
  userEmail: string,
  data: {
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerId: string;
    items: AIRankingItem[];
    customPrompt?: string;
  }
): Promise<Response> {
  try {
    const { projectId, stageId, rankingType, providerId, items, customPrompt } = data;

    // Validate required fields
    if (!projectId || !stageId || !rankingType || !providerId || !items || items.length === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Missing required fields'
      );
    }

    // Validate ranking type
    if (rankingType !== 'submission' && rankingType !== 'comment') {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid ranking type. Must be "submission" or "comment"'
      );
    }

    // Check permission - must be teacher or above (admin, project creator, or teacher)
    const isTeacherOrAbove = await checkIsTeacherOrAbove(env.DB, userEmail, projectId);
    if (!isTeacherOrAbove) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'Only teachers can use AI ranking suggestions'
      );
    }

    // Get AI provider
    const provider = await getAIProviderById(env.KV, providerId);
    if (!provider) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI provider not found'
      );
    }

    if (!provider.enabled) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'AI provider is disabled'
      );
    }

    // Validate customPrompt length (max 100 chars)
    if (customPrompt && customPrompt.length > 100) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Custom prompt must be 100 characters or less'
      );
    }

    // Queue the task for async processing
    const { taskId, callId } = await queueDirectRanking(
      env,
      userEmail,
      projectId,
      stageId,
      rankingType,
      provider.id,
      provider.name,
      provider.model,
      items,
      customPrompt
    );

    // Log the request
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'ai_ranking_query_start',
      rankingType,
      callId,
      {
        stageId,
        mode: 'direct',
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        itemCount: items.length,
        hasCustomPrompt: !!customPrompt
      },
      { relatedEntities: { stage: stageId } }
    );

    return successResponse({
      taskId,
      callId,
      mode: 'direct',
      message: 'AI ranking request queued. Listen to WebSocket for progress updates.',
      estimatedTime: '10-30 seconds'
    });
  } catch (error) {
    console.error('Submit AI ranking suggestion error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to queue AI ranking request'
    );
  }
}

/**
 * Submit Bradley-Terry AI ranking suggestion request
 * Queues a BT ranking task with multiple pairwise comparisons
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Request data
 * @returns Task ID for tracking progress via WebSocket
 */
export async function submitBTRankingSuggestion(
  env: Env,
  userEmail: string,
  data: {
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerId: string;
    items: AIRankingItem[];
    customPrompt?: string;
    pairsPerItem?: number;
  }
): Promise<Response> {
  try {
    const { projectId, stageId, rankingType, providerId, items, customPrompt, pairsPerItem = 3 } = data;

    // Validate required fields
    if (!projectId || !stageId || !rankingType || !providerId || !items || items.length < 2) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Missing required fields or need at least 2 items for BT comparison'
      );
    }

    // Validate ranking type
    if (rankingType !== 'submission' && rankingType !== 'comment') {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid ranking type. Must be "submission" or "comment"'
      );
    }

    // Validate pairsPerItem range
    if (pairsPerItem < 2 || pairsPerItem > 5) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'pairsPerItem must be between 2 and 5'
      );
    }

    // Check permission - must be teacher or above
    const isTeacherOrAbove = await checkIsTeacherOrAbove(env.DB, userEmail, projectId);
    if (!isTeacherOrAbove) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'Only teachers can use AI ranking suggestions'
      );
    }

    // Get AI provider
    const provider = await getAIProviderById(env.KV, providerId);
    if (!provider) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND,
        'AI provider not found'
      );
    }

    if (!provider.enabled) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'AI provider is disabled'
      );
    }

    // Validate customPrompt length (max 100 chars)
    if (customPrompt && customPrompt.length > 100) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Custom prompt must be 100 characters or less'
      );
    }

    // Calculate expected comparisons
    const expectedComparisons = getExpectedComparisonCount(items.length, pairsPerItem);

    // Queue the BT ranking task
    const { taskId, callId } = await queueBTRanking(
      env,
      userEmail,
      projectId,
      stageId,
      rankingType,
      provider.id,
      provider.name,
      provider.model,
      items,
      pairsPerItem,
      customPrompt
    );

    // Log the request
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'ai_ranking_query_start',
      rankingType,
      callId,
      {
        stageId,
        mode: 'bt',
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        itemCount: items.length,
        pairsPerItem,
        expectedComparisons,
        hasCustomPrompt: !!customPrompt
      },
      { relatedEntities: { stage: stageId } }
    );

    // Estimate time (roughly 3-5 seconds per comparison)
    const estimatedSeconds = expectedComparisons * 4;
    const estimatedTime = estimatedSeconds < 60
      ? `${estimatedSeconds} 秒`
      : `${Math.ceil(estimatedSeconds / 60)} 分鐘`;

    return successResponse({
      taskId,
      callId,
      mode: 'bt',
      expectedComparisons,
      message: 'BT ranking request queued. Listen to WebSocket for progress updates.',
      estimatedTime
    });
  } catch (error) {
    console.error('Submit BT ranking suggestion error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to queue BT ranking request'
    );
  }
}

/**
 * Submit Multi-Agent AI ranking suggestion request
 * Uses Free-MAD style 2-round debate with multiple providers
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Request data
 * @returns Task ID for tracking progress via WebSocket
 */
export async function submitMultiAgentRankingSuggestion(
  env: Env,
  userEmail: string,
  data: {
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerIds: string[];
    items: AIRankingItem[];
    customPrompt?: string;
  }
): Promise<Response> {
  try {
    const { projectId, stageId, rankingType, providerIds, items, customPrompt } = data;

    // Validate required fields
    if (!projectId || !stageId || !rankingType || !providerIds || !items || items.length === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Missing required fields'
      );
    }

    // Validate provider count (2-5 providers for Multi-Agent)
    if (!Array.isArray(providerIds) || providerIds.length < 2 || providerIds.length > 5) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Multi-Agent mode requires 2-5 AI providers'
      );
    }

    // Validate ranking type
    if (rankingType !== 'submission' && rankingType !== 'comment') {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid ranking type. Must be "submission" or "comment"'
      );
    }

    // Check permission - must be teacher or above
    const isTeacherOrAbove = await checkIsTeacherOrAbove(env.DB, userEmail, projectId);
    if (!isTeacherOrAbove) {
      return errorResponse(
        ERROR_CODES.ACCESS_DENIED,
        'Only teachers can use AI ranking suggestions'
      );
    }

    // Validate all providers exist and are enabled
    const providerNames: string[] = [];
    for (const providerId of providerIds) {
      const provider = await getAIProviderById(env.KV, providerId);
      if (!provider) {
        return errorResponse(
          ERROR_CODES.NOT_FOUND,
          `AI provider ${providerId} not found`
        );
      }
      if (!provider.enabled) {
        return errorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          `AI provider ${provider.name} is disabled`
        );
      }
      providerNames.push(provider.name);
    }

    // Validate customPrompt length (max 100 chars)
    if (customPrompt && customPrompt.length > 100) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Custom prompt must be 100 characters or less'
      );
    }

    // Queue the Multi-Agent ranking task
    const { taskId, callId } = await queueMultiAgentRanking(
      env,
      userEmail,
      projectId,
      stageId,
      rankingType,
      providerIds,
      providerNames.join('、'),
      items,
      customPrompt
    );

    // Log the request
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'ai_ranking_query_start',
      rankingType,
      callId,
      {
        stageId,
        mode: 'multi_agent',
        providerIds,
        providerNames: providerNames.join('、'),
        providerCount: providerIds.length,
        itemCount: items.length,
        hasCustomPrompt: !!customPrompt
      },
      { relatedEntities: { stage: stageId } }
    );

    // Estimate time (2 rounds, parallel calls, roughly 15-30 seconds total)
    const estimatedTime = '30-60 秒';

    return successResponse({
      taskId,
      callId,
      mode: 'multi_agent',
      providerCount: providerIds.length,
      message: 'Multi-Agent ranking request queued. Listen to WebSocket for progress updates.',
      estimatedTime
    });
  } catch (error) {
    console.error('Submit Multi-Agent ranking suggestion error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to queue Multi-Agent ranking request'
    );
  }
}
