/**
 * @fileoverview AI Ranking Suggestion handler
 * Calls external AI APIs to get ranking suggestions
 */

import type { Env } from '../../types';
import type { AIRankingItem, AIRankingSuggestionResult } from '@repo/shared';
import { successResponse, errorResponse, ERROR_CODES } from '../../utils/response';
import {
  getAIProviderById,
  buildSystemPrompt,
  buildUserPrompt,
  callAIProvider,
  generateQueryId,
  getEnabledAIProviders
} from '../../utils/ai-provider';
import { checkIsTeacherOrAbove } from '../../middleware/permissions';
import { logProjectOperation } from '../../utils/logging';

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
 * Submit AI ranking suggestion request
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param data - Request data
 * @returns AI ranking suggestion result
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

    // Fetch stage description for context
    const stage = await env.DB.prepare(
      `SELECT description FROM stages WHERE stageId = ?`
    ).bind(stageId).first<{ description: string | null }>();
    const stageDescription = stage?.description || '';

    // Build prompts (pass customPrompt and stageDescription to system prompt builder)
    const systemPrompt = await buildSystemPrompt(env.KV, rankingType, customPrompt, stageDescription);
    const userPrompt = buildUserPrompt(items, rankingType);

    // Call AI API
    let aiResponse;
    try {
      aiResponse = await callAIProvider(
        provider.baseUrl,
        provider.apiKey,
        provider.model,
        systemPrompt,
        userPrompt
      );
    } catch (apiError) {
      console.error('AI API call failed:', apiError);
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        `AI API call failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
      );
    }

    // Validate that all returned IDs are in the original items
    const itemIds = new Set(items.map(item => item.id));
    const validRanking = aiResponse.ranking.filter(id => itemIds.has(id));

    // If AI missed some items, append them at the end
    const missingIds = items
      .map(item => item.id)
      .filter(id => !validRanking.includes(id));

    const finalRanking = [...validRanking, ...missingIds];

    // Generate result
    const queryId = generateQueryId();
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const result: AIRankingSuggestionResult = {
      queryId,
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
      reason: aiResponse.reason,
      ranking: finalRanking,
      createdAt: Date.now(),
      // Include DeepSeek thinking process if available
      thinkingProcess: aiResponse.thinkingProcess,
      // Include custom prompt used in this query
      customPrompt: customPrompt?.trim() || undefined,
      // Include full prompt for transparency
      fullPrompt
    };

    // Audit log the AI query
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'ai_ranking_query',
      rankingType === 'submission' ? 'submission' : 'comment',
      queryId,
      {
        stageId,
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        itemCount: items.length,
        hasCustomPrompt: !!customPrompt,
        hasThinkingProcess: !!aiResponse.thinkingProcess
      },
      { relatedEntities: { stage: stageId } }
    );

    return successResponse(result);
  } catch (error) {
    console.error('Submit AI ranking suggestion error:', error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to get AI ranking suggestion'
    );
  }
}
