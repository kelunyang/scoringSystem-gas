/**
 * Event Logging Operations (DEPRECATED)
 * Migrated from GAS scripts/eventlogs_api.js
 *
 * @deprecated This module is deprecated. Use centralized logging from utils/logging instead:
 * - For global operations: logGlobalOperation()
 * - For project operations: logProjectOperation()
 *
 * This old logging system directly inserts into eventlogs table without
 * proper userEmail tracking and standardized event types.
 *
 * This file is kept for backward compatibility only.
 * DO NOT use logEvent() in new code.
 */

import { Env } from '../../types';
import { generateId } from '../../utils/id-generator';
import { stringifyJSON } from '../../utils/json';

/**
 * Log an event to the eventlogs table
 *
 * @deprecated Use centralized logging instead:
 * - logGlobalOperation() from utils/logging for global operations
 * - logProjectOperation() from utils/logging for project-scoped operations
 *
 * @param env - Cloudflare environment bindings
 * @param projectId - Project ID (optional)
 * @param userId - User ID (optional)
 * @param eventType - Event type (e.g., 'create', 'update', 'delete', 'login', 'logout')
 * @param entityType - Type of entity (e.g., 'project', 'stage', 'group', 'submission', 'comment', 'vote', 'settlement', 'user')
 * @param entityId - ID of the entity
 * @param details - Additional details (will be JSON stringified)
 */
export async function logEvent(
  env: Env,
  projectId: string | null,
  userId: string | null,
  eventType: string,
  entityType: string,
  entityId: string,
  details: any = {}
): Promise<void> {
  try {
    const logId = generateId('evtlog');
    const timestamp = Date.now();
    const detailsJson = stringifyJSON(details);

    await env.DB.prepare(`
      INSERT INTO eventlogs (
        logId, projectId, eventType, userId, entityType,
        entityId, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      projectId,
      eventType,
      userId,
      entityType,
      entityId,
      detailsJson,
      timestamp
    ).run();

  } catch (error) {
    // Log error but don't throw - event logging should not break main operations
    console.error('Event logging error:', error);
  }
}
