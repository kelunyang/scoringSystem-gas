/**
 * Stage Status Requirement Middleware
 * Enforces stage status constraints on stage-dependent operations
 *
 * Refactored (2025-12-08): Now uses stages_with_status VIEW for auto-calculated status
 * No longer needs stageStatusMiddleware sync - status is calculated on-demand
 *
 * Usage:
 *   app.post('/submit', requireStageStatus(['active']), handler)
 *   app.post('/vote', requireStageStatus(['active', 'voting']), handler)
 */

import { Context, Next } from 'hono';
import { errorResponse } from '../utils/response';

/**
 * Extract stageId from request (supports both body and query params)
 */
function extractStageId(c: Context): string | null {
  // Try body first (POST/PUT requests)
  const body = c.req.query('body') ? JSON.parse(c.req.query('body') as string) : null;
  if (body?.stageId) return body.stageId;

  // Try route params
  const routeStageId = c.req.param('stageId');
  if (routeStageId) return routeStageId;

  // Try query params
  const queryStageId = c.req.query('stageId');
  if (queryStageId) return queryStageId;

  return null;
}

/**
 * Extract submissionId from request (to get stageId indirectly)
 */
function extractSubmissionId(c: Context): string | null {
  // Try route params
  const routeSubmissionId = c.req.param('submissionId');
  if (routeSubmissionId) return routeSubmissionId;

  // Try query params
  const querySubmissionId = c.req.query('submissionId');
  if (querySubmissionId) return querySubmissionId;

  return null;
}

/**
 * Create a middleware that requires specific stage statuses
 *
 * @param allowedStatuses - Array of allowed stage statuses (e.g., ['active'], ['active', 'voting'])
 * @returns Hono middleware function
 *
 * @example
 * // Only allow in active stage
 * app.post('/submit', requireStageStatus(['active']), submitHandler);
 *
 * @example
 * // Allow in both active and voting stages
 * app.post('/vote', requireStageStatus(['active', 'voting']), voteHandler);
 */
export function requireStageStatus(allowedStatuses: string[]) {
  return async (c: Context, next: Next) => {
    try {
      // Extract projectId from route params, query params, or body
      let projectId = c.req.param('projectId') || c.req.query('projectId');
      let body: any = null;

      // If not found in params/query, try body
      if (!projectId) {
        try {
          // Clone request to avoid consuming the body
          body = await c.req.json();
          projectId = body.projectId;
        } catch {
          // Body might not be JSON
        }
      }

      if (!projectId) {
        return errorResponse('MISSING_PROJECT_ID', 'Missing projectId');
      }

      // Extract stageId from request (either directly or via submissionId)
      let stageId = extractStageId(c);

      // If no direct stageId, try body
      if (!stageId && body) {
        stageId = body.stageId;
      }

      // Try nested commentData.stageId (for comments API)
      if (!stageId && body?.commentData?.stageId) {
        stageId = body.commentData.stageId;
      }

      // If still no stageId, try to get it from submissionId
      if (!stageId) {
        let submissionId = extractSubmissionId(c);

        // Try body if not found in params/query
        if (!submissionId && body) {
          submissionId = body.submissionId;
        }

        if (submissionId) {
          const submission = await c.env.DB.prepare(`
            SELECT stageId FROM submissions_with_status
            WHERE submissionId = ? AND projectId = ?
          `).bind(submissionId, projectId).first();

          if (submission) {
            stageId = submission.stageId as string;
          }
        }
      }

      if (!stageId) {
        return errorResponse('MISSING_STAGE_ID', 'Cannot determine stageId from request');
      }

      // Get current stage status from VIEW (auto-calculated)
      const stage = await c.env.DB.prepare(`
        SELECT status, stageName FROM stages_with_status
        WHERE stageId = ? AND projectId = ?
      `).bind(stageId, projectId).first();

      if (!stage) {
        return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
      }

      // Check if current status is in allowed list
      const currentStatus = stage.status as string;

      if (!allowedStatuses.includes(currentStatus)) {
        return c.json({
          success: false,
          error: `This operation requires stage status to be one of [${allowedStatuses.join(', ')}], but current status is '${currentStatus}'`,
          errorCode: 'STAGE_STATUS_NOT_ALLOWED',
          details: {
            currentStatus,
            allowedStatuses,
            stageName: stage.stageName
          }
        }, 403);
      }

      // Status check passed, continue to handler
      return await next();

    } catch (error) {
      console.error('[requireStageStatus Middleware Error]', error);
      return errorResponse('STAGE_STATUS_CHECK_FAILED', 'Failed to check stage status', {
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Convenience middleware for most common case: require active stage
 */
export const requireActiveStage = requireStageStatus(['active']);
