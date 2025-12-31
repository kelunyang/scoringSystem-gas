/**
 * AI Service Logs Admin Handlers
 * Provides admin functionality for querying AI service call logs
 *
 * Performance improvements:
 * - Database indexes on serviceType, status, userEmail, createdAt
 * - Optimized queries with proper type safety
 * - Window functions for total count
 * - Reduced database round-trips
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import type {
  AIServiceLog,
  AIServiceType,
  AIServiceStatus,
  AIRankingType
} from '@repo/shared/types/admin';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Database query parameter types
 */
type QueryParam = string | number;

/**
 * AI service log filters (validated input)
 */
interface AIServiceLogFilters {
  search?: string;
  serviceType?: AIServiceType;
  rankingType?: AIRankingType;
  status?: AIServiceStatus;
  providerId?: string;
  startDate?: number;
  endDate?: number;
  minTokens?: number;
  maxTokens?: number;
  minResponseTime?: number;
  maxResponseTime?: number;
  limit: number;
  offset: number;
}

/**
 * Database result types
 */
interface AggregatedStatsResult {
  total: number;
  totalTokens: number;
  avgResponseTime: number;
}

interface ServiceTypeStatsResult {
  serviceType: string;
  count: number;
  totalTokens: number;
  avgResponseTime: number;
}

interface ProviderStatsResult {
  providerId: string;
  providerName: string;
  count: number;
  totalTokens: number;
  avgResponseTime: number;
}

interface StatusStatsResult {
  status: string;
  count: number;
}

interface DateStatsResult {
  date: string;
  count: number;
  totalTokens: number;
}

/**
 * AI service log with total count from window function
 */
interface AIServiceLogWithCount extends AIServiceLog {
  totalCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user has AI service logs management permission
 * Uses EXISTS with json_each for efficient short-circuit evaluation
 */
async function checkAIServiceLogsPermission(
  env: Env,
  userEmail: string
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(`
      SELECT 1 as hasPermission
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ?
        AND g.isActive = 1
        AND EXISTS (
          SELECT 1
          FROM json_each(g.globalPermissions)
          WHERE json_each.value IN ('view_ai_service_logs', 'system_admin')
        )
      LIMIT 1
    `).bind(userEmail).first<{ hasPermission: number }>();

    return result !== null;
  } catch (error) {
    console.error('[checkAIServiceLogsPermission] Error:', {
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Build AI service logs query with type-safe parameters
 * Returns query string and typed parameter array
 */
function buildAIServiceLogsQuery(
  filters: AIServiceLogFilters
): { query: string; params: QueryParam[] } {
  const params: QueryParam[] = [];
  const conditions: string[] = [];

  // Search filter (searches in providerName, userEmail, projectId)
  if (filters.search) {
    conditions.push('(providerName LIKE ? OR userEmail LIKE ? OR projectId LIKE ?)');
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (filters.serviceType) {
    conditions.push('serviceType = ?');
    params.push(filters.serviceType);
  }

  if (filters.rankingType) {
    conditions.push('rankingType = ?');
    params.push(filters.rankingType);
  }

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  if (filters.providerId) {
    conditions.push('providerId = ?');
    params.push(filters.providerId);
  }

  if (filters.startDate !== undefined) {
    conditions.push('createdAt >= ?');
    params.push(filters.startDate);
  }

  if (filters.endDate !== undefined) {
    conditions.push('createdAt <= ?');
    params.push(filters.endDate);
  }

  if (filters.minTokens !== undefined) {
    conditions.push('totalTokens >= ?');
    params.push(filters.minTokens);
  }

  if (filters.maxTokens !== undefined) {
    conditions.push('totalTokens <= ?');
    params.push(filters.maxTokens);
  }

  if (filters.minResponseTime !== undefined) {
    conditions.push('responseTimeMs >= ?');
    params.push(filters.minResponseTime);
  }

  if (filters.maxResponseTime !== undefined) {
    conditions.push('responseTimeMs <= ?');
    params.push(filters.maxResponseTime);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Query with window function for total count (eliminates second query)
  const query = `
    SELECT
      *,
      COUNT(*) OVER() as totalCount
    FROM aiservicecalls
    ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `;

  params.push(filters.limit, filters.offset);

  return { query, params };
}

/**
 * Normalize filters with defaults and validation
 */
function normalizeFilters(filters: any = {}): AIServiceLogFilters {
  return {
    search: filters.search,
    serviceType: filters.serviceType,
    rankingType: filters.rankingType,
    status: filters.status,
    providerId: filters.providerId,
    startDate: filters.startDate,
    endDate: filters.endDate,
    minTokens: filters.minTokens,
    maxTokens: filters.maxTokens,
    minResponseTime: filters.minResponseTime,
    maxResponseTime: filters.maxResponseTime,
    limit: Math.min(Math.max(1, filters.limit || 50), 1000), // Clamp 1-1000
    offset: Math.max(0, filters.offset || 0) // Non-negative
  };
}

// ============================================================================
// Main Handlers
// ============================================================================

/**
 * Get AI service logs with filters (admin only)
 * Optimized with window functions to eliminate duplicate count query
 */
export async function getAIServiceLogs(
  env: Env,
  userEmail: string,
  filters: {
    search?: string;
    serviceType?: AIServiceType;
    rankingType?: AIRankingType;
    status?: AIServiceStatus;
    providerId?: string;
    startDate?: number;
    endDate?: number;
    minTokens?: number;
    maxTokens?: number;
    minResponseTime?: number;
    maxResponseTime?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAIServiceLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires view_ai_service_logs or system_admin permission');
    }

    // Normalize and validate filters
    const normalizedFilters = normalizeFilters(filters);

    // Build and execute optimized query
    const { query, params } = buildAIServiceLogsQuery(normalizedFilters);
    const result = await env.DB.prepare(query).bind(...params).all();

    // D1 returns Record<string, unknown>[], so we need intermediate unknown cast
    const logs = result.results as unknown as AIServiceLogWithCount[];
    const totalCount = logs.length > 0 ? logs[0].totalCount : 0;

    // Remove totalCount from each log entry
    const cleanLogs = logs.map(({ totalCount, ...log }) => log as AIServiceLog);

    return successResponse({
      logs: cleanLogs,
      totalCount,
      filters: normalizedFilters
    });

  } catch (error) {
    console.error('[getAIServiceLogs] Error:', {
      userEmail,
      filters,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get AI service logs: ${message}`);
  }
}

/**
 * Get AI service statistics (admin only)
 * Optimized: combines all count queries into one aggregated query
 */
export async function getAIServiceStatistics(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAIServiceLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires view_ai_service_logs or system_admin permission');
    }

    // Single optimized query for overall stats
    const statsResult = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(AVG(responseTimeMs), 0) as avgResponseTime
      FROM aiservicecalls
    `).first<AggregatedStatsResult>();

    const total = statsResult?.total || 0;
    const totalTokens = statsResult?.totalTokens || 0;
    const avgResponseTime = Math.round(statsResult?.avgResponseTime || 0);

    // Get stats by service type
    const byServiceTypeResult = await env.DB.prepare(`
      SELECT
        serviceType,
        COUNT(*) as count,
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(AVG(responseTimeMs), 0) as avgResponseTime
      FROM aiservicecalls
      GROUP BY serviceType
      ORDER BY count DESC
    `).all<ServiceTypeStatsResult>();

    // Get stats by provider
    const byProviderResult = await env.DB.prepare(`
      SELECT
        providerId,
        providerName,
        COUNT(*) as count,
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(AVG(responseTimeMs), 0) as avgResponseTime
      FROM aiservicecalls
      GROUP BY providerId, providerName
      ORDER BY count DESC
      LIMIT 20
    `).all<ProviderStatsResult>();

    // Get stats by status
    const byStatusResult = await env.DB.prepare(`
      SELECT status, COUNT(*) as count
      FROM aiservicecalls
      GROUP BY status
      ORDER BY count DESC
    `).all<StatusStatsResult>();

    // Last 7 days statistics
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentResult = await env.DB.prepare(`
      SELECT
        DATE(createdAt / 1000, 'unixepoch') as date,
        COUNT(*) as count,
        COALESCE(SUM(totalTokens), 0) as totalTokens
      FROM aiservicecalls
      WHERE createdAt > ?
      GROUP BY date
      ORDER BY date DESC
    `).bind(sevenDaysAgo).all<DateStatsResult>();

    return successResponse({
      total,
      totalTokens,
      avgResponseTime,
      byServiceType: (byServiceTypeResult.results || []).map(r => ({
        ...r,
        avgResponseTime: Math.round(r.avgResponseTime)
      })),
      byProvider: (byProviderResult.results || []).map(r => ({
        ...r,
        avgResponseTime: Math.round(r.avgResponseTime)
      })),
      byStatus: byStatusResult.results || [],
      last7Days: recentResult.results || [],
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[getAIServiceStatistics] Error:', {
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get AI service statistics: ${message}`);
  }
}

/**
 * Get single AI service log detail (admin only)
 */
export async function getAIServiceLogDetail(
  env: Env,
  userEmail: string,
  callId: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkAIServiceLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires view_ai_service_logs or system_admin permission');
    }

    // Get log detail
    const log = await env.DB.prepare(`
      SELECT * FROM aiservicecalls WHERE callId = ?
    `).bind(callId).first<AIServiceLog>();

    if (!log) {
      return errorResponse('NOT_FOUND', 'AI service log not found');
    }

    // Get related child calls if this is a multi-agent parent
    let childCalls: AIServiceLog[] = [];
    if (log.serviceType === 'ranking_multi_agent') {
      const childResult = await env.DB.prepare(`
        SELECT * FROM aiservicecalls
        WHERE parentCallId = ?
        ORDER BY debateRound ASC, createdAt ASC
      `).bind(callId).all();
      childCalls = childResult.results as unknown as AIServiceLog[];
    }

    // Get parent call if this is a child call
    let parentCall: AIServiceLog | null = null;
    if (log.parentCallId) {
      parentCall = await env.DB.prepare(`
        SELECT * FROM aiservicecalls WHERE callId = ?
      `).bind(log.parentCallId).first<AIServiceLog>();
    }

    return successResponse({
      log,
      childCalls: childCalls.length > 0 ? childCalls : undefined,
      parentCall: parentCall || undefined
    });

  } catch (error) {
    console.error('[getAIServiceLogDetail] Error:', {
      callId,
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get AI service log detail: ${message}`);
  }
}
