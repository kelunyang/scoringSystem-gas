// ============================================
// AI Ranking Queue Consumer
// ============================================

import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../types';
import type { AIRankingItem, BTComparison, MultiAgentRound1Result, MultiAgentRound2Result } from '@repo/shared';
import { AIRankingQueueMessageSchema } from './types';
import {
  getAIProviderById,
  buildSystemPrompt,
  buildUserPrompt,
  callAIProvider
} from '../utils/ai-provider';
import {
  generateComparisons,
  computeBTRanking,
  combineComparisonReasons
} from '../utils/bradley-terry';
import {
  computeFreeMadRanking,
  generateRound2Prompt,
  parseRound2Response
} from '../utils/free-mad';
import {
  updateAIServiceCall,
  completeAIServiceCall,
  failAIServiceCall,
  completeBTRankingCall,
  completeMultiAgentRankingCall,
  createMultiAgentSubCall
} from '../db/ai-service';
import { logProjectOperation } from '../utils/logging';

/**
 * AI Ranking Queue Consumer
 * Processes AI ranking tasks from the AI_RANKING_QUEUE
 *
 * Supports three modes:
 * 1. Direct Mode: Single AI call for ranking
 * 2. BT Mode: Multiple pairwise comparisons using Bradley-Terry model
 * 3. Multi-Agent Mode: Free-MAD style 2-round debate with multiple providers
 *
 * Progress updates are sent via WebSocket (Durable Object NotificationHub)
 */
export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    console.log(`[AI Ranking Consumer] Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      const startTime = Date.now();

      try {
        // Validate message schema
        const parsedMessage = AIRankingQueueMessageSchema.parse(message.body);
        console.log(`[AI Ranking Consumer] Processing ${parsedMessage.mode} ranking task ${parsedMessage.taskId}`);

        // Update status to processing
        await updateAIServiceCall(env.DB, parsedMessage.callId, {
          status: 'processing'
        });

        // Send initial progress via WebSocket
        const progressType = parsedMessage.mode === 'bt'
          ? 'bt_ranking_progress'
          : parsedMessage.mode === 'multi_agent'
            ? 'multi_agent_progress'
            : 'ai_ranking_progress';

        await broadcastProgress(env, parsedMessage.userEmail, {
          type: progressType,
          data: {
            taskId: parsedMessage.taskId,
            callId: parsedMessage.callId,
            projectId: parsedMessage.projectId,
            stageId: parsedMessage.stageId,
            status: 'processing',
            progress: 0,
            message: parsedMessage.mode === 'bt'
              ? '正在準備配對比較...'
              : parsedMessage.mode === 'multi_agent'
                ? '正在準備 Multi-Agent 辯論...'
                : '正在呼叫 AI...'
          }
        });

        if (parsedMessage.mode === 'direct') {
          await processDirectRanking(env, parsedMessage, startTime);
        } else if (parsedMessage.mode === 'bt') {
          await processBTRanking(env, parsedMessage, startTime);
        } else {
          await processMultiAgentRanking(env, parsedMessage, startTime);
        }

        // Log success to sys_logs
        await logProjectOperation(
          env,
          parsedMessage.userEmail,
          parsedMessage.projectId,
          'ai_ranking_query_complete',
          parsedMessage.rankingType,
          parsedMessage.callId,
          {
            stageId: parsedMessage.stageId,
            mode: parsedMessage.mode,
            taskId: parsedMessage.taskId,
            itemCount: parsedMessage.items.length,
            responseTimeMs: Date.now() - startTime
          },
          { relatedEntities: { stage: parsedMessage.stageId } }
        );

        message.ack();
        console.log(`[AI Ranking Consumer] Task ${parsedMessage.taskId} completed successfully`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[AI Ranking Consumer] Error processing message:', error);

        try {
          // Try to extract callId from message for error recording
          const body = message.body as any;
          if (body?.callId) {
            await failAIServiceCall(
              env.DB,
              body.callId,
              errorMessage,
              Date.now() - startTime
            );

            // Broadcast failure
            if (body?.userEmail) {
              await broadcastProgress(env, body.userEmail, {
                type: body.mode === 'bt' ? 'bt_ranking_progress' : 'ai_ranking_progress',
                data: {
                  taskId: body.taskId || '',
                  callId: body.callId,
                  projectId: body.projectId || '',
                  stageId: body.stageId || '',
                  status: 'failed',
                  progress: 0,
                  message: `AI 排名失敗: ${errorMessage}`
                }
              });
            }

            // Log failure to sys_logs
            if (body?.userEmail && body?.projectId) {
              await logProjectOperation(
                env,
                body.userEmail,
                body.projectId,
                'ai_ranking_query_failed',
                body.rankingType || 'submission',
                body.callId,
                {
                  stageId: body.stageId,
                  mode: body.mode,
                  taskId: body.taskId,
                  errorMessage
                },
                { relatedEntities: { stage: body.stageId }, level: 'error' }
              );
            }
          }
        } catch (cleanupError) {
          console.error('[AI Ranking Consumer] Error during cleanup:', cleanupError);
        }

        // Determine if we should retry
        if (shouldRetryError(error)) {
          message.retry();
          console.log('[AI Ranking Consumer] Message will be retried');
        } else {
          message.ack();
          console.log('[AI Ranking Consumer] Message ACKed despite error (non-retryable)');
        }
      }
    }

    console.log('[AI Ranking Consumer] Batch processing complete');
  }
};

/**
 * Process direct ranking mode (single AI call)
 */
async function processDirectRanking(
  env: Env,
  message: {
    callId: string;
    taskId: string;
    userEmail: string;
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerId: string;
    items: AIRankingItem[];
    customPrompt?: string;
  },
  startTime: number
): Promise<void> {
  // Get AI provider
  const provider = await getAIProviderById(env.KV, message.providerId);
  if (!provider || !provider.enabled) {
    throw new Error(`AI provider ${message.providerId} not found or disabled`);
  }

  // Fetch stage description
  const stage = await env.DB.prepare(
    `SELECT description FROM stages WHERE stageId = ?`
  ).bind(message.stageId).first<{ description: string | null }>();
  const stageDescription = stage?.description || '';

  // Build prompts
  const systemPrompt = await buildSystemPrompt(
    env.KV,
    message.rankingType,
    message.customPrompt,
    stageDescription
  );
  const userPrompt = buildUserPrompt(message.items, message.rankingType);

  // Broadcast processing status
  await broadcastProgress(env, message.userEmail, {
    type: 'ai_ranking_progress',
    data: {
      taskId: message.taskId,
      callId: message.callId,
      projectId: message.projectId,
      stageId: message.stageId,
      status: 'processing',
      progress: 30,
      message: `正在等待 ${provider.name} 回應...`
    }
  });

  // Call AI API
  const aiResponse = await callAIProvider(
    provider.baseUrl,
    provider.apiKey,
    provider.model,
    systemPrompt,
    userPrompt
  );

  // Validate and fix ranking
  const itemIds = new Set(message.items.map(item => item.id));
  const validRanking = aiResponse.ranking.filter(id => itemIds.has(id));
  const missingIds = message.items
    .map(item => item.id)
    .filter(id => !validRanking.includes(id));
  const finalRanking = [...validRanking, ...missingIds];

  // Calculate response time
  const responseTimeMs = Date.now() - startTime;

  // Complete the service call record
  await completeAIServiceCall(
    env.DB,
    message.callId,
    JSON.stringify(finalRanking),
    aiResponse.reason,
    {
      requestTokens: aiResponse.usage?.prompt_tokens,
      responseTokens: aiResponse.usage?.completion_tokens,
      totalTokens: aiResponse.usage?.total_tokens
    },
    responseTimeMs,
    aiResponse.thinkingProcess
  );

  // Broadcast completion
  await broadcastProgress(env, message.userEmail, {
    type: 'ai_ranking_progress',
    data: {
      taskId: message.taskId,
      callId: message.callId,
      projectId: message.projectId,
      stageId: message.stageId,
      status: 'completed',
      progress: 100,
      message: 'AI 排名完成',
      result: {
        ranking: finalRanking,
        reason: aiResponse.reason,
        thinkingProcess: aiResponse.thinkingProcess
      }
    }
  });
}

/**
 * Process Bradley-Terry ranking mode (multiple pairwise comparisons)
 */
async function processBTRanking(
  env: Env,
  message: {
    callId: string;
    taskId: string;
    userEmail: string;
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerId: string;
    items: AIRankingItem[];
    customPrompt?: string;
    pairsPerItem: number;
  },
  startTime: number
): Promise<void> {
  // Get AI provider
  const provider = await getAIProviderById(env.KV, message.providerId);
  if (!provider || !provider.enabled) {
    throw new Error(`AI provider ${message.providerId} not found or disabled`);
  }

  // Generate comparisons
  const itemIds = message.items.map(item => item.id);
  const comparisons = generateComparisons(itemIds, {
    pairsPerItem: message.pairsPerItem
  });

  const totalComparisons = comparisons.length;
  console.log(`[AI Ranking Consumer] BT mode: ${totalComparisons} comparisons for ${itemIds.length} items`);

  // Build item lookup map
  const itemMap = new Map(message.items.map(item => [item.id, item]));

  // Accumulate token usage
  let totalRequestTokens = 0;
  let totalResponseTokens = 0;
  let totalTokens = 0;

  // Process each comparison
  for (let i = 0; i < comparisons.length; i++) {
    const comparison = comparisons[i];
    const itemA = itemMap.get(comparison.itemA)!;
    const itemB = itemMap.get(comparison.itemB)!;

    // Broadcast progress
    const progress = Math.round(((i + 1) / totalComparisons) * 100);
    await broadcastProgress(env, message.userEmail, {
      type: 'bt_ranking_progress',
      data: {
        taskId: message.taskId,
        callId: message.callId,
        projectId: message.projectId,
        stageId: message.stageId,
        status: 'processing',
        progress,
        currentComparison: i + 1,
        totalComparisons,
        message: `正在比較 ${i + 1}/${totalComparisons}...`,
        currentPair: { itemA: comparison.itemA, itemB: comparison.itemB }
      }
    });

    // Build comparison prompt
    const systemPrompt = buildBTComparisonSystemPrompt(message.rankingType, message.customPrompt);
    const userPrompt = buildBTComparisonUserPrompt(itemA, itemB, message.rankingType);

    // Call AI for this comparison
    const result = await callBTComparison(
      provider.baseUrl,
      provider.apiKey,
      provider.model,
      systemPrompt,
      userPrompt
    );

    // Record comparison result
    comparison.winner = result.winner === 'A' ? comparison.itemA : comparison.itemB;
    comparison.reason = result.reason;

    // Accumulate tokens
    if (result.usage) {
      totalRequestTokens += result.usage.prompt_tokens || 0;
      totalResponseTokens += result.usage.completion_tokens || 0;
      totalTokens += result.usage.total_tokens || 0;
    }

    // Small delay to avoid rate limiting
    if (i < comparisons.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Compute BT ranking
  const { ranking, strengthParams } = computeBTRanking(comparisons, itemIds);

  // Combine reasons from all comparisons
  const combinedReason = combineComparisonReasons(comparisons);

  // Calculate response time
  const responseTimeMs = Date.now() - startTime;

  // Complete the service call record
  await completeBTRankingCall(
    env.DB,
    message.callId,
    JSON.stringify(ranking),
    combinedReason,
    JSON.stringify(comparisons),
    JSON.stringify(strengthParams),
    {
      requestTokens: totalRequestTokens,
      responseTokens: totalResponseTokens,
      totalTokens
    },
    responseTimeMs
  );

  // Broadcast completion
  await broadcastProgress(env, message.userEmail, {
    type: 'bt_ranking_progress',
    data: {
      taskId: message.taskId,
      callId: message.callId,
      projectId: message.projectId,
      stageId: message.stageId,
      status: 'completed',
      progress: 100,
      currentComparison: totalComparisons,
      totalComparisons,
      message: 'BT 排名完成',
      result: {
        ranking,
        reason: combinedReason,
        btComparisons: comparisons,
        btStrengthParams: strengthParams
      }
    }
  });
}

/**
 * Build system prompt for BT pairwise comparison
 */
function buildBTComparisonSystemPrompt(
  rankingType: 'submission' | 'comment',
  customPrompt?: string
): string {
  const entityName = rankingType === 'submission' ? '成果' : '評論';
  const basePrompt = `你是一個教育評分助手。你將看到兩個${entityName}，請選擇質量較高的一個。
你必須做出選擇，不允許平手。

評分標準：
1. 內容完整性和深度
2. 邏輯清晰度
3. 創新性和獨特見解
4. 表達質量${customPrompt ? `
5. ${customPrompt}` : ''}

請以 JSON 格式回覆：
{
  "winner": "A" 或 "B",
  "reason": "簡述選擇理由（50字內）"
}`;

  return basePrompt;
}

/**
 * Build user prompt for BT pairwise comparison
 */
function buildBTComparisonUserPrompt(
  itemA: AIRankingItem,
  itemB: AIRankingItem,
  rankingType: 'submission' | 'comment'
): string {
  const entityName = rankingType === 'submission' ? '成果' : '評論';
  const metaA = itemA.metadata.groupName
    ? `組別: ${itemA.metadata.groupName}`
    : itemA.metadata.authorName
      ? `作者: ${itemA.metadata.authorName}`
      : '';
  const metaB = itemB.metadata.groupName
    ? `組別: ${itemB.metadata.groupName}`
    : itemB.metadata.authorName
      ? `作者: ${itemB.metadata.authorName}`
      : '';

  return `請比較以下兩個${entityName}，選出較好的一個：

【A】
ID: ${itemA.id}${metaA ? `\n${metaA}` : ''}
內容: ${itemA.content.substring(0, 2000)}

---

【B】
ID: ${itemB.id}${metaB ? `\n${metaB}` : ''}
內容: ${itemB.content.substring(0, 2000)}`;
}

/**
 * Call AI for BT comparison
 */
async function callBTComparison(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{
  winner: 'A' | 'B';
  reason: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON response
  let parsed: { winner: string; reason: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: try to extract winner from text
    const winnerMatch = content.match(/"winner"\s*:\s*"([AB])"/);
    parsed = {
      winner: winnerMatch?.[1] || 'A',
      reason: '無法解析回應'
    };
  }

  return {
    winner: parsed.winner === 'B' ? 'B' : 'A',
    reason: parsed.reason || '',
    usage: data.usage
  };
}

/**
 * Broadcast progress via WebSocket (Durable Object)
 * Uses stub.fetch() to call the /broadcast endpoint on the Durable Object
 */
async function broadcastProgress(
  env: Env,
  userEmail: string,
  message: {
    type: string;
    data: any;
  }
): Promise<void> {
  try {
    // Get userId from userEmail
    const user = await env.DB.prepare(
      `SELECT userId FROM users WHERE userEmail = ? AND status = 'active'`
    ).bind(userEmail).first<{ userId: string }>();

    if (!user) {
      console.warn(`[AI Ranking Consumer] Cannot broadcast: user not found for email ${userEmail}`);
      return;
    }

    // Get user's NotificationHub Durable Object
    const notificationHubId = env.NOTIFICATION_HUB.idFromName(user.userId);
    const stub = env.NOTIFICATION_HUB.get(notificationHubId);

    // Broadcast message using fetch() to call the /broadcast endpoint
    // This is the correct way to call a Durable Object method from outside
    await stub.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    }));
  } catch (error) {
    // Don't let broadcast errors fail the task
    console.error('[AI Ranking Consumer] Failed to broadcast progress:', error);
  }
}

/**
 * Determine if error should trigger retry
 */
function shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  // Validation errors - don't retry
  if (error.name === 'ZodError') {
    return false;
  }

  // AI API rate limit errors - retry
  if (error.message.includes('429') || error.message.includes('rate limit')) {
    return true;
  }

  // AI API server errors - retry
  if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
    return true;
  }

  // D1 database errors - retry
  if (error.message.includes('D1_ERROR') || error.message.includes('database')) {
    return true;
  }

  // Provider not found - don't retry
  if (error.message.includes('not found') || error.message.includes('disabled')) {
    return false;
  }

  // Default: don't retry unknown errors for AI calls (to save costs)
  return false;
}

/**
 * Process Multi-Agent ranking mode (Free-MAD style 2-round debate)
 */
async function processMultiAgentRanking(
  env: Env,
  message: {
    callId: string;
    taskId: string;
    userEmail: string;
    projectId: string;
    stageId: string;
    rankingType: 'submission' | 'comment';
    providerIds: string[];
    items: AIRankingItem[];
    customPrompt?: string;
  },
  startTime: number
): Promise<void> {
  const { callId, taskId, userEmail, projectId, stageId, rankingType, providerIds, items, customPrompt } = message;

  // Get all providers
  const providers: Array<{
    id: string;
    name: string;
    baseUrl: string;
    model: string;
    apiKey: string;
  }> = [];

  for (const providerId of providerIds) {
    const provider = await getAIProviderById(env.KV, providerId);
    if (!provider || !provider.enabled) {
      throw new Error(`AI provider ${providerId} not found or disabled`);
    }
    providers.push({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: provider.apiKey
    });
  }

  const providerCount = providers.length;
  const itemIds = items.map(item => item.id);

  // Fetch stage description
  const stage = await env.DB.prepare(
    `SELECT description FROM stages WHERE stageId = ?`
  ).bind(stageId).first<{ description: string | null }>();
  const stageDescription = stage?.description || '';

  // Initialize provider results for progress tracking
  const providerResults: Array<{
    providerId: string;
    providerName: string;
    round1?: { ranking: string[]; reason: string };
    round2?: { ranking: string[]; reason: string; changed: boolean; critique?: string };
    status: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
  }> = providers.map(p => ({
    providerId: p.id,
    providerName: p.name,
    status: 'pending'
  }));

  // Accumulate token usage
  let totalRequestTokens = 0;
  let totalResponseTokens = 0;
  let totalTokens = 0;

  // ============================================
  // Round 1: Independent Rankings (Parallel)
  // ============================================
  await broadcastProgress(env, userEmail, {
    type: 'multi_agent_progress',
    data: {
      taskId,
      callId,
      projectId,
      stageId,
      status: 'round1',
      progress: 10,
      currentRound: 1,
      message: `Round 1: ${providerCount} 個 AI 正在獨立排名...`,
      providerResults: providerResults.map(r => ({ ...r, status: 'processing' }))
    }
  });

  // Build prompts for Round 1
  const systemPrompt = await buildSystemPrompt(env.KV, rankingType, customPrompt, stageDescription);
  const userPrompt = buildUserPrompt(items, rankingType);

  // Call all providers in parallel for Round 1
  const round1Promises = providers.map(async (provider) => {
    try {
      const result = await callAIProvider(
        provider.baseUrl,
        provider.apiKey,
        provider.model,
        systemPrompt,
        userPrompt
      );
      return {
        providerId: provider.id,
        providerName: provider.name,
        success: true,
        ranking: result.ranking,
        reason: result.reason,
        usage: result.usage
      };
    } catch (error) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  const round1RawResults = await Promise.all(round1Promises);

  // Process Round 1 results
  const round1Results: MultiAgentRound1Result[] = [];
  for (const result of round1RawResults) {
    const providerResult = providerResults.find(p => p.providerId === result.providerId);
    if (result.success && 'ranking' in result && result.ranking) {
      // Validate and fix ranking
      const validRanking = result.ranking.filter(id => itemIds.includes(id));
      const missingIds = itemIds.filter(id => !validRanking.includes(id));
      const finalRanking = [...validRanking, ...missingIds];
      const reason = result.reason || '';
      const providerId = result.providerId || '';
      const providerName = result.providerName || '';

      round1Results.push({
        providerId,
        providerName,
        ranking: finalRanking,
        reason
      });

      if (providerResult) {
        providerResult.round1 = { ranking: finalRanking, reason };
        providerResult.status = 'processing';
      }

      // Accumulate tokens
      if (result.usage) {
        totalRequestTokens += result.usage.prompt_tokens || 0;
        totalResponseTokens += result.usage.completion_tokens || 0;
        totalTokens += result.usage.total_tokens || 0;
      }
    } else if (providerResult) {
      providerResult.status = 'failed';
      providerResult.errorMessage = 'error' in result ? result.error : 'Unknown error';
    }
  }

  // Check if we have enough successful results
  if (round1Results.length < 2) {
    throw new Error(`Not enough providers succeeded in Round 1: ${round1Results.length}/${providerCount}`);
  }

  // Broadcast Round 1 completion
  await broadcastProgress(env, userEmail, {
    type: 'multi_agent_progress',
    data: {
      taskId,
      callId,
      projectId,
      stageId,
      status: 'round2',
      progress: 40,
      currentRound: 2,
      message: `Round 1 完成，${round1Results.length} 個 AI 正在相互審視...`,
      providerResults
    }
  });

  // ============================================
  // Round 2: Cross-Review (Parallel)
  // ============================================
  const round2Promises = round1Results.map(async (myResult) => {
    const provider = providers.find(p => p.id === myResult.providerId);
    if (!provider) {
      return {
        providerId: myResult.providerId,
        providerName: myResult.providerName,
        success: false,
        error: 'Provider not found'
      };
    }

    // Get other providers' results
    const othersResults = round1Results.filter(r => r.providerId !== myResult.providerId);

    // Generate Round 2 prompts
    const { systemPrompt: r2SystemPrompt, userPrompt: r2UserPrompt } = generateRound2Prompt(
      myResult,
      othersResults,
      rankingType
    );

    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: 'system', content: r2SystemPrompt },
            { role: 'user', content: r2UserPrompt }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';

      // Parse Round 2 response
      const parsed = parseRound2Response(
        content,
        myResult.providerId,
        myResult.providerName,
        myResult.ranking
      );

      return {
        providerId: myResult.providerId,
        providerName: myResult.providerName,
        success: true,
        result: parsed,
        usage: data.usage
      };
    } catch (error) {
      return {
        providerId: myResult.providerId,
        providerName: myResult.providerName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  const round2RawResults = await Promise.all(round2Promises);

  // Process Round 2 results
  const round2Results: MultiAgentRound2Result[] = [];
  for (const result of round2RawResults) {
    const providerResult = providerResults.find(p => p.providerId === result.providerId);
    if (result.success && 'result' in result && result.result && result.result.ranking) {
      // Validate and fix ranking
      const validRanking = result.result.ranking.filter(id => itemIds.includes(id));
      const missingIds = itemIds.filter(id => !validRanking.includes(id));
      const finalRanking = [...validRanking, ...missingIds];

      const r2Result: MultiAgentRound2Result = {
        providerId: result.result.providerId || result.providerId || '',
        providerName: result.result.providerName || result.providerName || '',
        ranking: finalRanking,
        reason: result.result.reason || '',
        changed: result.result.changed ?? false,
        critique: result.result.critique
      };
      round2Results.push(r2Result);

      if (providerResult) {
        providerResult.round2 = {
          ranking: finalRanking,
          reason: result.result.reason || '',
          changed: result.result.changed ?? false,
          critique: result.result.critique
        };
        providerResult.status = 'completed';
      }

      // Accumulate tokens
      if (result.usage) {
        totalRequestTokens += result.usage.prompt_tokens || 0;
        totalResponseTokens += result.usage.completion_tokens || 0;
        totalTokens += result.usage.total_tokens || 0;
      }
    } else {
      // Use Round 1 result as fallback
      const r1 = round1Results.find(r => r.providerId === result.providerId);
      if (r1) {
        round2Results.push({
          providerId: r1.providerId,
          providerName: r1.providerName,
          ranking: r1.ranking,
          reason: r1.reason,
          changed: false
        });
      }
      if (providerResult) {
        providerResult.status = 'completed'; // Still mark as completed with fallback
      }
    }
  }

  // ============================================
  // Aggregation: Free-MAD Scoring
  // ============================================
  await broadcastProgress(env, userEmail, {
    type: 'multi_agent_progress',
    data: {
      taskId,
      callId,
      projectId,
      stageId,
      status: 'aggregating',
      progress: 80,
      message: `正在整合 ${round2Results.length} 個 AI 的辯論結果...`,
      providerResults
    }
  });

  // Compute final ranking using Free-MAD algorithm
  const finalResult = computeFreeMadRanking(round1Results, round2Results, itemIds);

  // Calculate response time
  const responseTimeMs = Date.now() - startTime;

  // Complete the service call record
  await completeMultiAgentRankingCall(
    env.DB,
    callId,
    JSON.stringify(finalResult.ranking),
    finalResult.reason,
    JSON.stringify(finalResult.debateDetails),
    JSON.stringify(finalResult.scores),
    {
      requestTokens: totalRequestTokens,
      responseTokens: totalResponseTokens,
      totalTokens
    },
    responseTimeMs
  );

  // Broadcast completion
  await broadcastProgress(env, userEmail, {
    type: 'multi_agent_progress',
    data: {
      taskId,
      callId,
      projectId,
      stageId,
      status: 'completed',
      progress: 100,
      message: 'Multi-Agent 辯論完成',
      providerResults,
      result: {
        ranking: finalResult.ranking,
        reason: finalResult.reason,
        scores: finalResult.scores,
        debateDetails: finalResult.debateDetails
      }
    }
  });
}
