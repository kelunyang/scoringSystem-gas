/**
 * Email Logs Admin Handlers
 * Provides admin functionality for querying and managing email logs
 *
 * Performance improvements:
 * - Database indexes on trigger, recipient, status, timestamp
 * - Optimized queries with proper type safety
 * - Consolidated count queries
 * - Reduced database round-trips
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { resendEmail, resendBatchEmails } from '../../services/email-service';
import type { EmailLog } from '@repo/shared/types/admin';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Database query parameter types
 */
type QueryParam = string | number;

/**
 * Email log filters (validated input)
 */
interface EmailLogFilters {
  trigger?: string;
  recipient?: string;
  status?: 'sent' | 'failed';
  startDate?: number;
  endDate?: number;
  limit: number;
  offset: number;
}

/**
 * Database result types
 */
interface CountResult {
  total: number;
}

interface AggregatedStatsResult {
  total: number;
  sent: number;
  failed: number;
}

interface TriggerStatsResult {
  trigger: string;
  count: number;
  status: string;
}

interface DateStatsResult {
  date: string;
  count: number;
  status: string;
}

/**
 * Permission check result
 */
interface PermissionCheckResult {
  hasPermission: number;
}

/**
 * Email log with total count from window function
 */
interface EmailLogWithCount extends EmailLog {
  totalCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user has email logs management permission
 * Uses EXISTS with json_each for efficient short-circuit evaluation
 * Stops at first matching group instead of processing all groups
 */
async function checkEmailLogsPermission(
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
          WHERE json_each.value IN ('manage_email_logs', 'system_admin')
        )
      LIMIT 1
    `).bind(userEmail).first<{ hasPermission: number }>();

    return result !== null;
  } catch (error) {
    console.error('[checkEmailLogsPermission] Error:', {
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Build email logs query with type-safe parameters
 * Returns query string and typed parameter array
 */
function buildEmailLogsQuery(
  filters: EmailLogFilters
): { query: string; params: QueryParam[] } {
  const params: QueryParam[] = [];
  const conditions: string[] = [];

  // Use explicit undefined checks to allow empty strings
  if (filters.trigger !== undefined) {
    conditions.push('trigger = ?');
    params.push(filters.trigger);
  }

  if (filters.recipient !== undefined) {
    conditions.push('recipient = ?');
    params.push(filters.recipient);
  }

  if (filters.status !== undefined) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  if (filters.startDate !== undefined) {
    conditions.push('timestamp >= ?');
    params.push(filters.startDate);
  }

  if (filters.endDate !== undefined) {
    conditions.push('timestamp <= ?');
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Query with window function for total count (eliminates second query)
  const query = `
    SELECT
      *,
      COUNT(*) OVER() as totalCount
    FROM globalemaillogs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;

  params.push(filters.limit, filters.offset);

  return { query, params };
}

/**
 * Normalize filters with defaults and validation
 */
function normalizeFilters(filters: any = {}): EmailLogFilters {
  return {
    trigger: filters.trigger,
    recipient: filters.recipient,
    status: filters.status,
    startDate: filters.startDate,
    endDate: filters.endDate,
    limit: Math.min(Math.max(1, filters.limit || 50), 1000), // Clamp 1-1000
    offset: Math.max(0, filters.offset || 0) // Non-negative
  };
}

// ============================================================================
// Main Handlers
// ============================================================================

/**
 * Get email logs with filters (admin only)
 * Optimized with window functions to eliminate duplicate count query
 */
export async function getEmailLogs(
  env: Env,
  userEmail: string,
  filters: {
    trigger?: string;
    recipient?: string;
    status?: 'sent' | 'failed';
    startDate?: number;
    endDate?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkEmailLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires manage_email_logs or system_admin permission');
    }

    // Normalize and validate filters
    const normalizedFilters = normalizeFilters(filters);

    // Build and execute optimized query
    const { query, params } = buildEmailLogsQuery(normalizedFilters);
    const result = await env.DB.prepare(query).bind(...params).all();

    // D1 returns Record<string, unknown>[], so we need intermediate unknown cast
    const logs = result.results as unknown as EmailLogWithCount[];
    const totalCount = logs.length > 0 ? logs[0].totalCount : 0;

    // Remove totalCount from each log entry
    const cleanLogs = logs.map(({ totalCount, ...log }) => log as EmailLog);

    return successResponse({
      logs: cleanLogs,
      totalCount,
      filters: normalizedFilters
    });

  } catch (error) {
    console.error('[getEmailLogs] Error:', {
      userEmail,
      filters,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get email logs: ${message}`);
  }
}

/**
 * Get email statistics (admin only)
 * Optimized: combines all count queries into one aggregated query
 */
export async function getEmailStatistics(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkEmailLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires manage_email_logs or system_admin permission');
    }

    // Single optimized query for overall stats
    const statsResult = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM globalemaillogs
    `).first<AggregatedStatsResult>();

    const total = statsResult?.total || 0;
    const sent = statsResult?.sent || 0;
    const failed = statsResult?.failed || 0;
    const successRate = total > 0 ? (sent / total) * 100 : 0;

    // Get stats by trigger
    const byTriggerResult = await env.DB.prepare(`
      SELECT trigger, COUNT(*) as count, status
      FROM globalemaillogs
      GROUP BY trigger, status
      ORDER BY count DESC
    `).all<TriggerStatsResult>();

    // Last 7 days statistics
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentResult = await env.DB.prepare(`
      SELECT
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as count,
        status
      FROM globalemaillogs
      WHERE timestamp > ?
      GROUP BY date, status
      ORDER BY date DESC
    `).bind(sevenDaysAgo).all<DateStatsResult>();

    return successResponse({
      total,
      sent,
      failed,
      successRate: Math.round(successRate * 100) / 100,
      byTrigger: byTriggerResult.results || [],
      last7Days: recentResult.results || [],
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[getEmailStatistics] Error:', {
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get email statistics: ${message}`);
  }
}

/**
 * Resend single email (admin only)
 */
export async function resendSingleEmail(
  env: Env,
  userEmail: string,
  logId: string
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkEmailLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires manage_email_logs or system_admin permission');
    }

    // Check if log exists
    const log = await env.DB.prepare(`
      SELECT * FROM globalemaillogs WHERE logId = ?
    `).bind(logId).first<EmailLog>();

    if (!log) {
      return errorResponse('NOT_FOUND', 'Email log not found');
    }

    // Resend email
    const result = await resendEmail(env, logId, userEmail);

    if (!result.success) {
      console.error('[resendSingleEmail] Resend failed:', {
        logId,
        recipient: log.recipient,
        error: result.error
      });
      return errorResponse('EMAIL_FAILED', result.error || 'Failed to resend email');
    }

    return successResponse({
      logId: result.logId,
      emailId: result.emailId,
      recipient: log.recipient,
      resent: true,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[resendSingleEmail] Error:', {
      logId,
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to resend email: ${message}`);
  }
}

/**
 * Resend batch emails (admin only)
 */
export async function resendBatchEmailsHandler(
  env: Env,
  userEmail: string,
  logIds: string[]
): Promise<Response> {
  try {
    // Check permission
    const hasPermission = await checkEmailLogsPermission(env, userEmail);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Requires manage_email_logs or system_admin permission');
    }

    if (!logIds || logIds.length === 0) {
      return errorResponse('INVALID_INPUT', 'No email logs selected');
    }

    // Enforce maximum batch size
    if (logIds.length > 100) {
      return errorResponse('INVALID_INPUT', 'Cannot resend more than 100 emails at once');
    }

    // Resend emails
    const result = await resendBatchEmails(env, logIds, userEmail);

    return successResponse({
      totalProcessed: logIds.length,
      successCount: result.success,
      failedCount: result.failed,
      results: result.results,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[resendBatchEmailsHandler] Error:', {
      batchSize: logIds?.length,
      userEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to resend emails: ${message}`);
  }
}
