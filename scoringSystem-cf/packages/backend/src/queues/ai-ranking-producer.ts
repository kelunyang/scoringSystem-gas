// ============================================
// AI Ranking Queue Producer
// ============================================

import type { Env } from '../types';
import type { AIRankingItem, AIServiceType } from '@repo/shared';
import { createAIServiceCall, generateCallId } from '../db/ai-service';
import { generateId } from '../utils/id-generator';

/**
 * Queue a direct AI ranking task
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param projectId - Project ID
 * @param stageId - Stage ID
 * @param rankingType - Ranking type (submission/comment)
 * @param providerId - AI provider ID
 * @param providerName - AI provider display name
 * @param model - AI model name
 * @param items - Items to rank
 * @param customPrompt - Optional custom prompt
 * @returns Task ID and Call ID for tracking
 */
export async function queueDirectRanking(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankingType: 'submission' | 'comment',
  providerId: string,
  providerName: string,
  model: string,
  items: AIRankingItem[],
  customPrompt?: string
): Promise<{ taskId: string; callId: string }> {
  const taskId = generateId('task');
  const callId = generateCallId();

  // Create database record
  await createAIServiceCall(env.DB, {
    callId,
    projectId,
    stageId,
    userEmail,
    serviceType: 'ranking_direct' as AIServiceType,
    rankingType,
    providerId,
    providerName,
    model,
    itemCount: items.length,
    customPrompt,
    status: 'pending'
  });

  // Queue the task
  await env.AI_RANKING_QUEUE.send({
    mode: 'direct',
    callId,
    taskId,
    userEmail,
    projectId,
    stageId,
    rankingType,
    providerId,
    items,
    customPrompt,
    timestamp: Date.now()
  });

  console.log(`[AI Ranking Producer] Queued direct ranking task ${taskId} (callId: ${callId})`);

  return { taskId, callId };
}

/**
 * Queue a Bradley-Terry AI ranking task
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param projectId - Project ID
 * @param stageId - Stage ID
 * @param rankingType - Ranking type (submission/comment)
 * @param providerId - AI provider ID
 * @param providerName - AI provider display name
 * @param model - AI model name
 * @param items - Items to rank
 * @param pairsPerItem - Number of comparisons per item (2-5)
 * @param customPrompt - Optional custom prompt
 * @returns Task ID and Call ID for tracking
 */
export async function queueBTRanking(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankingType: 'submission' | 'comment',
  providerId: string,
  providerName: string,
  model: string,
  items: AIRankingItem[],
  pairsPerItem: number = 3,
  customPrompt?: string
): Promise<{ taskId: string; callId: string }> {
  const taskId = generateId('task');
  const callId = generateCallId();

  // Create database record
  await createAIServiceCall(env.DB, {
    callId,
    projectId,
    stageId,
    userEmail,
    serviceType: 'ranking_bt' as AIServiceType,
    rankingType,
    providerId,
    providerName,
    model,
    itemCount: items.length,
    customPrompt,
    status: 'pending'
  });

  // Queue the task
  await env.AI_RANKING_QUEUE.send({
    mode: 'bt',
    callId,
    taskId,
    userEmail,
    projectId,
    stageId,
    rankingType,
    providerId,
    items,
    customPrompt,
    pairsPerItem,
    timestamp: Date.now()
  });

  console.log(`[AI Ranking Producer] Queued BT ranking task ${taskId} (callId: ${callId}, pairsPerItem: ${pairsPerItem})`);

  return { taskId, callId };
}

/**
 * Queue a Multi-Agent AI ranking task (Free-MAD style debate)
 *
 * @param env - Cloudflare Workers environment
 * @param userEmail - Requesting user's email
 * @param projectId - Project ID
 * @param stageId - Stage ID
 * @param rankingType - Ranking type (submission/comment)
 * @param providerIds - Array of AI provider IDs (2-5 providers)
 * @param providerNames - Display names joined by comma
 * @param items - Items to rank
 * @param customPrompt - Optional custom prompt
 * @returns Task ID and Call ID for tracking
 */
export async function queueMultiAgentRanking(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankingType: 'submission' | 'comment',
  providerIds: string[],
  providerNames: string,
  items: AIRankingItem[],
  customPrompt?: string
): Promise<{ taskId: string; callId: string }> {
  const taskId = generateId('task');
  const callId = generateCallId();

  // Create database record for the main call
  await createAIServiceCall(env.DB, {
    callId,
    projectId,
    stageId,
    userEmail,
    serviceType: 'ranking_multi_agent' as AIServiceType,
    rankingType,
    providerId: providerIds.join(','),  // Store all provider IDs comma-separated
    providerName: providerNames,
    model: 'multi-agent',  // Multiple models, so use placeholder
    itemCount: items.length,
    customPrompt,
    status: 'pending'
  });

  // Queue the task
  await env.AI_RANKING_QUEUE.send({
    mode: 'multi_agent',
    callId,
    taskId,
    userEmail,
    projectId,
    stageId,
    rankingType,
    providerIds,
    items,
    customPrompt,
    timestamp: Date.now()
  });

  console.log(`[AI Ranking Producer] Queued Multi-Agent ranking task ${taskId} (callId: ${callId}, providers: ${providerIds.length})`);

  return { taskId, callId };
}
