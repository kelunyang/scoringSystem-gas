/**
 * @fileoverview AI Service database operations
 * CRUD operations for aiservicecalls table
 */

import type { AIServiceCallRecord, AIServiceType, AIServiceCallStatus } from '@repo/shared';

/**
 * Generate a unique call ID for AI service calls
 * Format: aisc_<timestamp>_<random>
 */
export function generateCallId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `aisc_${timestamp}_${random}`;
}

/**
 * Create a new AI service call record
 * @param db - D1 database instance
 * @param data - AI service call data
 * @returns Created record
 */
export async function createAIServiceCall(
  db: D1Database,
  data: Omit<AIServiceCallRecord, 'callId' | 'createdAt'> & { callId?: string }
): Promise<AIServiceCallRecord> {
  const callId = data.callId || generateCallId();
  const createdAt = Date.now();

  await db.prepare(`
    INSERT INTO aiservicecalls (
      callId, projectId, stageId, userEmail,
      serviceType, rankingType,
      providerId, providerName, model,
      itemCount, customPrompt,
      status, result, reason, thinkingProcess, errorMessage,
      btComparisons, btStrengthParams,
      requestTokens, responseTokens, totalTokens,
      responseTimeMs, createdAt, completedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    callId,
    data.projectId,
    data.stageId ?? null,
    data.userEmail,
    data.serviceType,
    data.rankingType ?? null,
    data.providerId,
    data.providerName,
    data.model,
    data.itemCount ?? null,
    data.customPrompt ?? null,
    data.status,
    data.result ?? null,
    data.reason ?? null,
    data.thinkingProcess ?? null,
    data.errorMessage ?? null,
    data.btComparisons ?? null,
    data.btStrengthParams ?? null,
    data.requestTokens ?? null,
    data.responseTokens ?? null,
    data.totalTokens ?? null,
    data.responseTimeMs ?? null,
    createdAt,
    data.completedAt ?? null
  ).run();

  return {
    ...data,
    callId,
    createdAt
  } as AIServiceCallRecord;
}

/**
 * Update an existing AI service call record
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param updates - Fields to update
 */
export async function updateAIServiceCall(
  db: D1Database,
  callId: string,
  updates: Partial<Omit<AIServiceCallRecord, 'callId' | 'createdAt'>>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  // Build dynamic update query
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.result !== undefined) {
    fields.push('result = ?');
    values.push(updates.result);
  }
  if (updates.reason !== undefined) {
    fields.push('reason = ?');
    values.push(updates.reason);
  }
  if (updates.thinkingProcess !== undefined) {
    fields.push('thinkingProcess = ?');
    values.push(updates.thinkingProcess);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('errorMessage = ?');
    values.push(updates.errorMessage);
  }
  if (updates.btComparisons !== undefined) {
    fields.push('btComparisons = ?');
    values.push(updates.btComparisons);
  }
  if (updates.btStrengthParams !== undefined) {
    fields.push('btStrengthParams = ?');
    values.push(updates.btStrengthParams);
  }
  if (updates.requestTokens !== undefined) {
    fields.push('requestTokens = ?');
    values.push(updates.requestTokens);
  }
  if (updates.responseTokens !== undefined) {
    fields.push('responseTokens = ?');
    values.push(updates.responseTokens);
  }
  if (updates.totalTokens !== undefined) {
    fields.push('totalTokens = ?');
    values.push(updates.totalTokens);
  }
  if (updates.responseTimeMs !== undefined) {
    fields.push('responseTimeMs = ?');
    values.push(updates.responseTimeMs);
  }
  if (updates.completedAt !== undefined) {
    fields.push('completedAt = ?');
    values.push(updates.completedAt);
  }

  if (fields.length === 0) {
    return; // Nothing to update
  }

  values.push(callId);

  await db.prepare(`
    UPDATE aiservicecalls
    SET ${fields.join(', ')}
    WHERE callId = ?
  `).bind(...values).run();
}

/**
 * Get AI service call by ID
 * @param db - D1 database instance
 * @param callId - Call ID to retrieve
 * @returns AI service call record or null
 */
export async function getAIServiceCallById(
  db: D1Database,
  callId: string
): Promise<AIServiceCallRecord | null> {
  const result = await db.prepare(`
    SELECT * FROM aiservicecalls WHERE callId = ?
  `).bind(callId).first<AIServiceCallRecord>();

  return result ?? null;
}

/**
 * Get AI service call history for a stage
 * @param db - D1 database instance
 * @param stageId - Stage ID to query
 * @param options - Query options
 * @returns List of AI service call records
 */
export async function getAIServiceCallsByStage(
  db: D1Database,
  stageId: string,
  options?: {
    rankingType?: 'submission' | 'comment';
    serviceType?: AIServiceType;
    status?: AIServiceCallStatus;
    limit?: number;
  }
): Promise<AIServiceCallRecord[]> {
  const conditions: string[] = ['stageId = ?'];
  const values: (string | number)[] = [stageId];

  if (options?.rankingType) {
    conditions.push('rankingType = ?');
    values.push(options.rankingType);
  }

  if (options?.serviceType) {
    conditions.push('serviceType = ?');
    values.push(options.serviceType);
  }

  if (options?.status) {
    conditions.push('status = ?');
    values.push(options.status);
  }

  const limit = options?.limit ?? 20;
  values.push(limit);

  const result = await db.prepare(`
    SELECT * FROM aiservicecalls
    WHERE ${conditions.join(' AND ')}
    ORDER BY createdAt DESC
    LIMIT ?
  `).bind(...values).all<AIServiceCallRecord>();

  return result.results ?? [];
}

/**
 * Get AI service call history for a project
 * @param db - D1 database instance
 * @param projectId - Project ID to query
 * @param options - Query options
 * @returns List of AI service call records
 */
export async function getAIServiceCallsByProject(
  db: D1Database,
  projectId: string,
  options?: {
    stageId?: string;
    rankingType?: 'submission' | 'comment';
    serviceType?: AIServiceType;
    status?: AIServiceCallStatus;
    limit?: number;
  }
): Promise<AIServiceCallRecord[]> {
  const conditions: string[] = ['projectId = ?'];
  const values: (string | number)[] = [projectId];

  if (options?.stageId) {
    conditions.push('stageId = ?');
    values.push(options.stageId);
  }

  if (options?.rankingType) {
    conditions.push('rankingType = ?');
    values.push(options.rankingType);
  }

  if (options?.serviceType) {
    conditions.push('serviceType = ?');
    values.push(options.serviceType);
  }

  if (options?.status) {
    conditions.push('status = ?');
    values.push(options.status);
  }

  const limit = options?.limit ?? 20;
  values.push(limit);

  const result = await db.prepare(`
    SELECT * FROM aiservicecalls
    WHERE ${conditions.join(' AND ')}
    ORDER BY createdAt DESC
    LIMIT ?
  `).bind(...values).all<AIServiceCallRecord>();

  return result.results ?? [];
}

/**
 * Mark AI service call as completed with results
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param result - Ranking result (JSON stringified)
 * @param reason - AI explanation
 * @param tokenUsage - Token usage stats
 * @param responseTimeMs - Response time in milliseconds
 * @param thinkingProcess - Optional thinking process
 */
export async function completeAIServiceCall(
  db: D1Database,
  callId: string,
  result: string,
  reason: string,
  tokenUsage: {
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
  },
  responseTimeMs: number,
  thinkingProcess?: string
): Promise<void> {
  await updateAIServiceCall(db, callId, {
    status: 'success',
    result,
    reason,
    thinkingProcess,
    requestTokens: tokenUsage.requestTokens,
    responseTokens: tokenUsage.responseTokens,
    totalTokens: tokenUsage.totalTokens,
    responseTimeMs,
    completedAt: Date.now()
  });
}

/**
 * Mark AI service call as failed
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param errorMessage - Error message
 * @param responseTimeMs - Response time in milliseconds
 */
export async function failAIServiceCall(
  db: D1Database,
  callId: string,
  errorMessage: string,
  responseTimeMs: number
): Promise<void> {
  await updateAIServiceCall(db, callId, {
    status: 'failed',
    errorMessage,
    responseTimeMs,
    completedAt: Date.now()
  });
}

/**
 * Update BT ranking progress with comparison results
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param btComparisons - BT comparisons (JSON stringified)
 * @param btStrengthParams - BT strength parameters (JSON stringified)
 */
export async function updateBTProgress(
  db: D1Database,
  callId: string,
  btComparisons: string,
  btStrengthParams?: string
): Promise<void> {
  await updateAIServiceCall(db, callId, {
    btComparisons,
    btStrengthParams
  });
}

/**
 * Complete BT ranking with final results
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param result - Final ranking result (JSON stringified)
 * @param reason - Combined reasoning from all comparisons
 * @param btComparisons - All BT comparisons (JSON stringified)
 * @param btStrengthParams - Final strength parameters (JSON stringified)
 * @param tokenUsage - Total token usage
 * @param responseTimeMs - Total response time
 */
export async function completeBTRankingCall(
  db: D1Database,
  callId: string,
  result: string,
  reason: string,
  btComparisons: string,
  btStrengthParams: string,
  tokenUsage: {
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
  },
  responseTimeMs: number
): Promise<void> {
  await updateAIServiceCall(db, callId, {
    status: 'success',
    result,
    reason,
    btComparisons,
    btStrengthParams,
    requestTokens: tokenUsage.requestTokens,
    responseTokens: tokenUsage.responseTokens,
    totalTokens: tokenUsage.totalTokens,
    responseTimeMs,
    completedAt: Date.now()
  });
}

/**
 * Complete Multi-Agent ranking with debate results
 * @param db - D1 database instance
 * @param callId - Call ID to update
 * @param result - Final ranking result (JSON stringified)
 * @param reason - Combined reasoning from debate
 * @param debateDetails - Debate details from all providers (JSON stringified)
 * @param scores - Final scores for each item (JSON stringified)
 * @param tokenUsage - Total token usage
 * @param responseTimeMs - Total response time
 */
export async function completeMultiAgentRankingCall(
  db: D1Database,
  callId: string,
  result: string,
  reason: string,
  debateDetails: string,
  scores: string,
  tokenUsage: {
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
  },
  responseTimeMs: number
): Promise<void> {
  const completedAt = Date.now();

  await db.prepare(`
    UPDATE aiservicecalls
    SET status = 'success',
        result = ?,
        reason = ?,
        thinkingProcess = ?,
        btStrengthParams = ?,
        requestTokens = ?,
        responseTokens = ?,
        totalTokens = ?,
        responseTimeMs = ?,
        completedAt = ?
    WHERE callId = ?
  `).bind(
    result,
    reason,
    debateDetails,   // Store debate details in thinkingProcess field
    scores,          // Store scores in btStrengthParams field (reusing for scores)
    tokenUsage.requestTokens ?? null,
    tokenUsage.responseTokens ?? null,
    tokenUsage.totalTokens ?? null,
    responseTimeMs,
    completedAt,
    callId
  ).run();
}

/**
 * Create a sub-call record for Multi-Agent mode
 * Each provider's individual call is recorded as a sub-call
 * @param db - D1 database instance
 * @param parentCallId - Parent call ID
 * @param data - Sub-call data
 * @returns Created sub-call record
 */
export async function createMultiAgentSubCall(
  db: D1Database,
  parentCallId: string,
  data: {
    projectId: string;
    stageId: string;
    userEmail: string;
    rankingType: 'submission' | 'comment';
    providerId: string;
    providerName: string;
    model: string;
    itemCount: number;
    debateRound: 1 | 2;
  }
): Promise<string> {
  const callId = generateCallId();
  const createdAt = Date.now();

  await db.prepare(`
    INSERT INTO aiservicecalls (
      callId, projectId, stageId, userEmail,
      serviceType, rankingType,
      providerId, providerName, model,
      itemCount, status,
      parentCallId, debateRound,
      createdAt
    ) VALUES (?, ?, ?, ?, 'ranking_multi_agent', ?, ?, ?, ?, ?, 'processing', ?, ?, ?)
  `).bind(
    callId,
    data.projectId,
    data.stageId,
    data.userEmail,
    data.rankingType,
    data.providerId,
    data.providerName,
    data.model,
    data.itemCount,
    parentCallId,
    data.debateRound,
    createdAt
  ).run();

  return callId;
}

/**
 * Update Multi-Agent sub-call with round result
 * @param db - D1 database instance
 * @param callId - Sub-call ID
 * @param result - Ranking result
 * @param reason - Reasoning
 * @param changed - Whether position changed (Round 2 only)
 * @param critique - Critique of other rankings (Round 2 only)
 */
export async function updateMultiAgentSubCall(
  db: D1Database,
  callId: string,
  result: string,
  reason: string,
  changed?: boolean,
  critique?: string
): Promise<void> {
  await db.prepare(`
    UPDATE aiservicecalls
    SET status = 'success',
        result = ?,
        reason = ?,
        debateChanged = ?,
        debateCritique = ?,
        completedAt = ?
    WHERE callId = ?
  `).bind(
    result,
    reason,
    changed !== undefined ? (changed ? 1 : 0) : null,
    critique ?? null,
    Date.now(),
    callId
  ).run();
}
