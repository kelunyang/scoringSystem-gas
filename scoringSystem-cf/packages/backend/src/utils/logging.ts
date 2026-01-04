/**
 * Centralized Logging Utility
 * Provides unified logging operations to sys_logs table
 *
 * CRITICAL: This module replaces all duplicate logOperation functions.
 * Two separate functions to avoid parameter ambiguity:
 * 1. logProjectOperation - for project-scoped operations (with projectId)
 * 2. logGlobalOperation - for global operations (without projectId)
 */

import type { Env } from '@/types';
import { generateId } from '@utils/id-generator';
import { stringifyJSON } from '@utils/json';

/**
 * Log an operation scoped to a specific project
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - Email of the user performing the action
 * @param projectId - ID of the related project
 * @param action - Action type (e.g., 'stage_forced_transition', 'submission_created')
 * @param entityType - Type of entity being acted upon (e.g., 'stage', 'submission')
 * @param entityId - ID of the entity
 * @param metadata - Additional context data (will be JSON stringified)
 * @param options - Optional configuration
 * @param options.level - Log level ('info', 'warning', 'error', 'critical'), defaults to 'info'
 * @param options.relatedEntities - Secondary related entities as key-value pairs (e.g., {stage: 'stg_xxx', group: 'grp_xxx'})
 */
export async function logProjectOperation(
  env: Env,
  userEmail: string,
  projectId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: any,
  options?: {
    level?: 'info' | 'warning' | 'error' | 'critical';
    relatedEntities?: Record<string, string>;
  } | 'info' | 'warning' | 'error' | 'critical'
): Promise<void> {
  // Backward compatibility: support old signature with level as 8th parameter
  const level = typeof options === 'string' ? options : (options?.level || 'info');
  const relatedEntities = typeof options === 'object' && options !== null ? options.relatedEntities : undefined;

  console.log('🔍 [logProjectOperation] Entry:', {
    userEmail,
    projectId,
    action,
    entityType,
    entityId,
    metadata,
    level,
    relatedEntities
  });

  try {
    // Generate log ID using centralized ID generator
    const logId = generateId('log');

    // Get userId from userEmail
    const userResult = await env.DB.prepare(
      'SELECT userId FROM users WHERE userEmail = ?'
    ).bind(userEmail).first();
    const userId = userResult?.userId || null;

    console.log('🔍 [logProjectOperation] userId lookup result:', {
      userEmail,
      userResult,
      userId
    });

    // Construct message with projectId
    const message = `${action} for ${entityType} ${entityId} in project ${projectId}`;

    // Prepare relatedEntities JSON (if provided)
    const relatedEntitiesJson = relatedEntities ? stringifyJSON(relatedEntities) : null;

    console.log('🔍 [logProjectOperation] Preparing to insert sys_logs:', {
      logId,
      level,
      functionName: action,
      userId,
      action,
      message,
      context: metadata,
      projectId,
      entityType,
      entityId,
      relatedEntitiesJson
    });

    // Insert log entry into sys_logs table
    const insertResult = await env.DB.prepare(`
      INSERT INTO sys_logs (
        logId, level, functionName, userId, action, message, context, createdAt,
        projectId, entityType, entityId, relatedEntities
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      level,
      action,        // functionName = action for consistency
      userId,
      action,
      message,
      stringifyJSON(metadata || {}),
      Date.now(),
      projectId,     // NEW: project ID
      entityType,    // NEW: entity type
      entityId,      // NEW: entity ID
      relatedEntitiesJson  // NEW: related entities
    ).run();

    console.log('✅ [logProjectOperation] sys_logs inserted successfully:', {
      logId,
      insertResult: insertResult?.meta
    });

    // ===== 同时写入 eventlogs 表（用户可见的项目事件日志）=====
    try {
      const eventLogId = generateId('evtlog');

      await env.DB.prepare(`
        INSERT INTO eventlogs (
          logId, projectId, eventType, userId, entityType, entityId, details, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        eventLogId,
        projectId,
        action,                           // eventType = action
        userId,
        entityType,
        entityId,
        stringifyJSON(metadata || {}),    // details = metadata
        Date.now()                        // timestamp
      ).run();

      console.log('✅ [logProjectOperation] eventlogs inserted successfully:', {
        eventLogId,
        projectId,
        action
      });
    } catch (eventLogError) {
      // EventLog 写入失败不应阻塞主流程，仅记录错误
      console.error('⚠️ [logProjectOperation] eventlogs insert failed (non-blocking):', {
        projectId,
        action,
        error: eventLogError instanceof Error ? eventLogError.message : String(eventLogError)
      });
    }

  } catch (error) {
    // Enhanced error tracking - logging should not break application flow
    console.error('❌ [LOGGING_ERROR] logProjectOperation failed:', {
      type: 'project_operation',
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      userEmail,
      projectId,
      action,
      entityType,
      entityId,
      level
    });
  }
}

/**
 * Log a global operation (not scoped to any specific project)
 *
 * @param env - Cloudflare environment bindings
 * @param userEmail - Email of the user performing the action
 * @param action - Action type (e.g., 'user_profile_updated', 'project_created')
 * @param entityType - Type of entity being acted upon (e.g., 'user', 'project')
 * @param entityId - ID of the entity
 * @param metadata - Additional context data (will be JSON stringified)
 * @param options - Optional configuration
 * @param options.level - Log level ('info', 'warning', 'error', 'critical'), defaults to 'info'
 * @param options.relatedEntities - Secondary related entities as key-value pairs
 */
export async function logGlobalOperation(
  env: Env,
  userEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: any,
  options?: {
    level?: 'info' | 'warning' | 'error' | 'critical';
    relatedEntities?: Record<string, string>;
  } | 'info' | 'warning' | 'error' | 'critical'
): Promise<void> {
  // Backward compatibility: support old signature with level as 7th parameter
  const level = typeof options === 'string' ? options : (options?.level || 'info');
  const relatedEntities = typeof options === 'object' && options !== null ? options.relatedEntities : undefined;
  try {
    // Generate log ID using centralized ID generator
    const logId = generateId('log');

    // Get userId from userEmail
    const userResult = await env.DB.prepare(
      'SELECT userId FROM users WHERE userEmail = ?'
    ).bind(userEmail).first();
    const userId = userResult?.userId || null;

    // Construct message without projectId
    const message = `${action} for ${entityType} ${entityId}`;

    // Prepare relatedEntities JSON (if provided)
    const relatedEntitiesJson = relatedEntities ? stringifyJSON(relatedEntities) : null;

    // Insert log entry into sys_logs table
    await env.DB.prepare(`
      INSERT INTO sys_logs (
        logId, level, functionName, userId, action, message, context, createdAt,
        projectId, entityType, entityId, relatedEntities
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).bind(
      logId,
      level,
      action,        // functionName = action for consistency
      userId,
      action,
      message,
      stringifyJSON(metadata || {}),
      Date.now(),
      // projectId is NULL for global operations
      entityType,    // NEW: entity type
      entityId,      // NEW: entity ID
      relatedEntitiesJson  // NEW: related entities
    ).run();

  } catch (error) {
    // Enhanced error tracking - logging should not break application flow
    console.error('[LOGGING_ERROR]', {
      type: 'global_operation',
      userEmail,
      action,
      entityType,
      entityId,
      level,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

/**
 * Log an API action with automatic deduplication using sys_logs.dedupKey
 *
 * This function prevents duplicate API operations (submissions, votes, etc.) caused by:
 * - Network retries
 * - Race conditions from concurrent requests
 * - Double-click / double-submission
 *
 * Uses the same atomic UNIQUE constraint mechanism as security actions:
 * - UNIQUE constraint on (dedupKey, createdAt/60000) prevents duplicates within 60-second buckets
 * - Database-level enforcement = no race conditions
 * - Returns boolean to indicate if action was new or duplicate
 *
 * @param env - Cloudflare environment bindings
 * @param details - Action details
 * @param details.dedupKey - Deduplication key (REQUIRED) - Format: "action_type:entity:user:bucket"
 * @param details.action - Action type (e.g., 'submission_submit', 'ranking_proposal_vote')
 * @param details.userId - User ID performing the action
 * @param details.projectId - Project ID (optional)
 * @param details.entityType - Primary entity type (e.g., 'submission', 'ranking_proposal')
 * @param details.entityId - Primary entity ID (e.g., 'sub_xxx', 'prop_xxx')
 * @param details.message - Human-readable message describing the action
 * @param details.context - Additional context data (will be JSON stringified)
 * @param details.level - Log level ('INFO', 'WARNING', 'ERROR', 'CRITICAL'), defaults to 'INFO'
 * @param details.relatedEntities - Secondary related entities (e.g., {stage: 'stg_xxx', group: 'grp_xxx'})
 *
 * @returns Promise<boolean> - true if new action was logged, false if duplicate was prevented
 *
 * @example
 * // Prevent duplicate submission approval votes
 * const bucket = Math.floor(Date.now() / 60000);
 * const dedupKey = `approval_vote:${submissionId}:${userEmail}:${bucket}`;
 *
 * const isNewAction = await logApiAction(env, {
 *   dedupKey,
 *   action: 'submission_approval_vote',
 *   userId: user.userId,
 *   projectId,
 *   entityType: 'submission',
 *   entityId: submissionId,
 *   message: `User ${userEmail} voted on submission ${submissionId}`,
 *   context: { submissionId, voterEmail: userEmail, agree: true }
 * });
 *
 * if (!isNewAction) {
 *   return c.json({ success: true, data: { deduped: true } });
 * }
 * // Continue with business logic...
 */
export async function logApiAction(
  env: Env,
  details: {
    dedupKey: string;          // REQUIRED: Deduplication key
    action: string;            // REQUIRED: Action type
    userId?: string;           // User ID
    projectId?: string;        // Project ID
    entityType?: string;       // Primary entity type
    entityId?: string;         // Primary entity ID
    message: string;           // REQUIRED: Human-readable message
    context?: any;             // Additional context data
    level?: 'info' | 'warning' | 'error' | 'critical'; // Log level
    relatedEntities?: Record<string, string>; // Secondary entities
  }
): Promise<boolean> {
  try {
    const now = Date.now();
    const logId = generateId('log');
    const level = details.level ?? 'info';

    // Prepare context JSON (include dedupKey for debugging)
    const contextData = {
      ...details.context,
      dedupKey: details.dedupKey
    };

    // Prepare relatedEntities JSON (if provided)
    const relatedEntitiesJson = details.relatedEntities
      ? stringifyJSON(details.relatedEntities)
      : null;

    // Attempt to insert - UNIQUE constraint will reject duplicates atomically
    await env.DB.prepare(`
      INSERT INTO sys_logs (
        logId, level, functionName, userId, action, message, context,
        createdAt, projectId, entityType, entityId, relatedEntities, dedupKey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      level,
      details.action,                  // functionName = action
      details.userId ?? null,          // userId (optional)
      details.action,                  // action
      details.message,                 // message
      stringifyJSON(contextData),      // context (includes dedupKey)
      now,                             // createdAt
      details.projectId ?? null,       // projectId (optional)
      details.entityType ?? null,      // entityType (optional)
      details.entityId ?? null,        // entityId (optional)
      relatedEntitiesJson,             // relatedEntities (optional)
      details.dedupKey                 // dedupKey (REQUIRED for deduplication)
    ).run();

    console.log(`[API_DEDUP] ✓ New action logged: ${details.action}, dedupKey: ${details.dedupKey}`);
    return true; // Successfully inserted = new action

  } catch (error: any) {
    // UNIQUE constraint violation = duplicate action (expected behavior, not an error)
    if (error?.message?.includes('UNIQUE constraint failed')) {
      console.log(`[API_DEDUP] ✗ Duplicate action blocked: ${details.dedupKey}`);
      return false; // Duplicate prevented
    }

    // SUDO mode - skip logging but allow operation to proceed
    // This prevents the logging INSERT from blocking the actual operation
    if (error?.name === 'SudoWriteBlockedError' || error?.message?.includes('SUDO_NO_WRITE')) {
      console.log(`[API_DEDUP] ⏭️ Skipping log in SUDO mode: ${details.action}`);
      return true; // Allow operation to proceed without logging
    }

    // All other errors should propagate (fail-closed security model)
    console.error('[API_DEDUP] Unexpected error:', {
      action: details.action,
      dedupKey: details.dedupKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Generate a changes object for audit logging
 *
 * Compares old data with new data and generates a structured record
 * of all changes with before/after values for complete audit trails.
 *
 * @param oldData - Original data object before updates
 * @param newData - New data object containing updates
 * @param excludeFields - Array of field names to exclude from change tracking (e.g., 'updatedAt', 'lastModified')
 * @returns Object mapping field names to {oldValue, newValue} pairs
 *
 * @example
 * const changes = generateChanges(
 *   { name: 'Old Name', status: 'active', updatedAt: 123 },
 *   { name: 'New Name', status: 'completed' },
 *   ['updatedAt']
 * );
 * // Result: { name: { oldValue: 'Old Name', newValue: 'New Name' },
 * //           status: { oldValue: 'active', newValue: 'completed' } }
 */
export function generateChanges<T extends Record<string, any>>(
  oldData: T,
  newData: Partial<T>,
  excludeFields: string[] = []
): Record<string, { oldValue: any; newValue: any }> {
  const changes: Record<string, { oldValue: any; newValue: any }> = {};

  for (const [key, newValue] of Object.entries(newData)) {
    // Skip excluded fields
    if (excludeFields.includes(key)) {
      continue;
    }

    const oldValue = oldData[key];

    // Record change (even if values are the same, to track all updated fields)
    changes[key] = {
      oldValue,
      newValue
    };
  }

  return changes;
}
