import type { Env } from '../types';
/**
 * Scoring Router
 * Migrated from GAS scripts/scoring_api.js
 *
 * Endpoints:
 * - POST /scoring/preview - Preview stage scores
 * - POST /scoring/validate-settlement - Validate pre-settlement conditions
 * - POST /scoring/settle - Settle stage
 * - POST /scoring/results - Get settled results
 * - POST /scoring/submission-voting-data - Get submission voting data for analysis
 * - POST /scoring/comment-voting-data - Get comment voting data for analysis
 *
 * DEPRECATED Endpoints (Individual Voting System - use /rankings API instead):
 * - POST /scoring/vote - Submit ranking vote (DEPRECATED)
 * - POST /scoring/status - Get voting status (DEPRECATED)
 * - POST /scoring/data - Get voting data (DEPRECATED)
 * - POST /scoring/analysis - Get voting analysis (DEPRECATED)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
/*
// DEPRECATED: Individual voting system handlers
import {
  submitRankingVote,
  getStageVotingStatus,
  getVotingData,
  getVotingAnalysis
} from '../handlers/scoring/voting';
*/
import {
  settleStage
} from '../handlers/scoring/settlement';
import { validatePreSettlement } from '../handlers/scoring/pre-settlement-validation';
import {
  getSubmissionVotingData,
  getCommentVotingData
} from '../handlers/scoring/voting-analysis';
import { clearStageVotes } from '../handlers/scoring/clear-stage-votes';
import {
  ValidateSettlementRequestSchema,
  SettleStageRequestSchema,
  GetSubmissionVotingDataRequestSchema,
  GetCommentVotingDataRequestSchema,
  ClearStageVotesRequestSchema
} from '@repo/shared/schemas/scoring';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);



/**
 * Validate pre-settlement conditions
 * Body: { projectId, stageId }
 */
app.post(
  '/validate-settlement',
  zValidator('json', ValidateSettlementRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Only teachers/admins (Level 0-1) can validate settlement
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to validate settlement',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const validation = await validatePreSettlement(c.env, body.projectId, body.stageId);

    return c.json({
      success: true,
      data: validation
    });
  }
);

/**
 * Settle stage
 * Body: { projectId, stageId, forceSettle?: boolean }
 */
app.post(
  '/settle',
  zValidator('json', SettleStageRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Only teachers/admins (Level 0-1) can settle stages
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to settle stage',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await settleStage(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.forceSettle
    );

    return response;
  }
);


/**
 * Force-clear all votes in a stage and roll it back to the pre-voting state.
 * Invalidates (作廢) every student ranking proposal in the stage, optionally
 * reverses any active stage settlement, and rolls the stage back to voting/active.
 * Body: { projectId, stageId, reason, targetState: 'voting'|'active', extendHours? }
 */
app.post(
  '/clear-stage-votes',
  zValidator('json', ClearStageVotesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission is enforced inside clearStageVotes via canManageSettlements
    // (Global PM or Project Teacher) — kept identical to /settlement/reverse so
    // that "清空投票" and "撤回結算" share the exact same permission class.
    return await clearStageVotes(c.env, user.userEmail, body.projectId, body.stageId, {
      reason: body.reason,
      targetState: body.targetState,
      extendHours: body.extendHours
    });
  }
);

/**
 * Get submission voting data for analysis
 * Body: { stageId }
 */
app.post(
  '/submission-voting-data',
  zValidator('json', GetSubmissionVotingDataRequestSchema),
  async (c) => {
    return await getSubmissionVotingData(c);
  }
);

/**
 * Get comment voting data for analysis
 * Body: { stageId }
 */
app.post(
  '/comment-voting-data',
  zValidator('json', GetCommentVotingDataRequestSchema),
  async (c) => {
    return await getCommentVotingData(c);
  }
);

export default app;
