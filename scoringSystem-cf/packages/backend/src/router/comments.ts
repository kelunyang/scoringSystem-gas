import type { Env } from '../types';
/**
 * Comments Router
 * Migrated from GAS scripts/comments_api.js
 *
 * Endpoints:
 * - POST /comments/create - Create comment
 * - POST /comments/details - Get comment details (GAS-compatible)
 * - POST /comments/stage - Get stage comments
 * - POST /comments/reactions/add - Add reaction
 * - POST /comments/reactions/remove - Remove reaction
 * - POST /comments/reactions/get - Get comment reactions
 * - POST /comments/reactions/batch - Get batch reactions
 * - POST /comments/voting-eligibility - Check voting eligibility
 * - POST /comments/ranking - Submit comment ranking
 * - POST /comments/rankings - Get rankings for a comment
 * - POST /comments/stage-rankings - Get all rankings for a stage
 * - POST /comments/settlement-analysis - Get settlement analysis
 * - POST /comments/ranking-history - Get ranking history
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import { getProjectRole } from '../utils/permissions';
import { checkStageAcceptsRankings } from '../utils/stage-validation';
import {
  createComment,
  getStageComments,
  getCommentDetails
} from '../handlers/comments/manage';
import {
  addReaction,
  removeReaction,
  getCommentReactions
} from '../handlers/comments/reactions';
import {
  checkVotingEligibility,
  submitCommentRanking,
  getCommentRankings,
  getStageCommentRankings,
  getCommentRankingHistory
} from '../handlers/comments/voting';
import {
  getCommentSettlementAnalysis
} from '../handlers/comments/settlement';
import {
  CreateCommentRequestSchema,
  GetCommentDetailsRequestSchema,
  GetStageCommentsRequestSchema,
  AddReactionRequestSchema,
  RemoveReactionRequestSchema,
  GetCommentReactionsRequestSchema,
  CheckVotingEligibilityRequestSchema,
  SubmitCommentRankingRequestSchema,
  GetCommentRankingsRequestSchema,
  GetStageCommentRankingsRequestSchema,
  GetCommentSettlementAnalysisRequestSchema,
  GetCommentRankingHistoryRequestSchema
} from '@repo/shared/schemas/comments';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Create comment
 * Body: { sessionId, projectId, commentData: { stageId, content, parentCommentId? } }
 */
app.post(
  '/create',
  zValidator('json', CreateCommentRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need 'comment' permission
    // Level 0-1 (admin/teacher) and Level 3 (students with comment permission) can comment
    // Level 2 (observer) cannot comment
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'comment');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to create comments. Observers cannot post comments.',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Role-based stage status check
    // Teachers can comment during 'active' or 'voting' stages
    // Students can only comment during 'active' stage
    const userRole = await getProjectRole(c.env.DB, user.userEmail, body.projectId);
    const isTeacher = userRole === 'teacher';

    // Get stage status
    const stage = await c.env.DB.prepare(`
      SELECT status FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(body.commentData.stageId, body.projectId).first();

    if (!stage) {
      return c.json({
        success: false,
        error: 'Stage not found',
        errorCode: 'STAGE_NOT_FOUND'
      }, 404);
    }

    const allowedStatuses = isTeacher ? ['active', 'voting'] : ['active'];
    if (!allowedStatuses.includes(stage.status as string)) {
      return c.json({
        success: false,
        error: isTeacher
          ? 'Comments can only be created during active or voting stages'
          : 'Comments can only be created during active stage',
        errorCode: 'STAGE_STATUS_NOT_ALLOWED'
      }, 403);
    }

    const response = await createComment(
      c.env,
      user.userEmail,
      body.projectId,
      body.commentData
    );

    return response;
  }
);

/**
 * Get comment details (GAS-compatible alias endpoint)
 * Body: { sessionId, projectId, commentId }
 */
app.post(
  '/details',
  zValidator('json', GetCommentDetailsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view comment',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getCommentDetails(
      c.env,
      user.userEmail,
      body.projectId,
      body.commentId
    );

    return response;
  }
);





/**
 * Get stage comments (GAS-compatible endpoint)
 * Body: { sessionId, projectId, stageId, excludeTeachers? }
 */
app.post(
  '/stage',
  zValidator('json', GetStageCommentsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view comments',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageComments(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      {
        excludeTeachers: body.excludeTeachers || false,
        forVoting: body.forVoting || false
      }
    );

    return response;
  }
);

/**
 * Add reaction to comment
 * Body: { sessionId, projectId, commentId, reactionType }
 */
app.post(
  '/reactions/add',
  zValidator('json', AddReactionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: must be a student mentioned in the comment
    const { checkUserCanReactToComment } = await import('../utils/commentVotingUtils');
    const eligibility = await checkUserCanReactToComment(
      c.env.DB,
      user.userEmail,
      body.projectId,
      body.commentId
    );

    if (!eligibility.canReact) {
      const errorMessages: Record<string, string> = {
        'COMMENT_NOT_FOUND': 'Comment not found',
        'CANNOT_REACT_OWN_COMMENT': 'Cannot react to your own comment',
        'NOT_IN_REACTION_USERS': 'Only mentioned students can react to this comment'
      };
      return c.json({
        success: false,
        error: errorMessages[eligibility.reason || 'NOT_IN_REACTION_USERS'] || 'Cannot react to this comment',
        errorCode: eligibility.reason || 'ACCESS_DENIED'
      }, 403);
    }

    const response = await addReaction(
      c.env,
      user.userEmail,
      body.projectId,
      body.commentId,
      body.reactionType
    );

    return response;
  }
);

/**
 * Remove reaction from comment
 * Body: { sessionId, projectId, commentId }
 */
app.post(
  '/reactions/remove',
  zValidator('json', RemoveReactionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need project access (users can remove their own reactions)
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to remove reaction',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await removeReaction(
      c.env,
      user.userEmail,
      body.projectId,
      body.commentId
    );

    return response;
  }
);

/**
 * Get reactions for a comment
 * Body: { sessionId, projectId, commentId }
 */
app.post(
  '/reactions/get',
  zValidator('json', GetCommentReactionsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need view access
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view reactions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getCommentReactions(
      c.env,
      user.userEmail,
      body.projectId,
      body.commentId
    );

    return response;
  }
);

/**
 * Check voting eligibility
 * Body: { sessionId, projectId, stageId }
 */
app.post(
  '/voting-eligibility',
  zValidator('json', CheckVotingEligibilityRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need project access
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await checkVotingEligibility(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Submit comment ranking
 * Body: { sessionId, projectId, stageId, rankingData: Array<{commentId, rank}> }
 */
app.post(
  '/ranking',
  zValidator('json', SubmitCommentRankingRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check if stage accepts rankings (prevent during settlement)
    const stageCheck = await checkStageAcceptsRankings(c.env.DB, body.projectId, body.stageId);
    if (!stageCheck.valid) {
      return c.json({
        success: false,
        error: stageCheck.error,
        errorCode: stageCheck.errorCode
      }, 400);
    }

    // Check permission: need comment permission (Level 3 students)
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'comment');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to submit comment rankings',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await submitCommentRanking(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.rankingData
    );

    return response;
  }
);

/**
 * Get rankings for a single comment
 * Body: { sessionId, projectId, stageId, commentId }
 */
app.post(
  '/rankings',
  zValidator('json', GetCommentRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view rankings',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getCommentRankings(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.commentId
    );

    return response;
  }
);

/**
 * Get all comment rankings for a stage
 * Body: { sessionId, projectId, stageId }
 */
app.post(
  '/stage-rankings',
  zValidator('json', GetStageCommentRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view rankings',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageCommentRankings(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Get comment settlement analysis
 * Body: { sessionId, projectId, stageId }
 */
app.post(
  '/settlement-analysis',
  zValidator('json', GetCommentSettlementAnalysisRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need view access
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view settlement analysis',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getCommentSettlementAnalysis(
      c.env,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Get comment ranking history (version timeline)
 * Body: { sessionId, projectId, stageId }
 */
app.post(
  '/ranking-history',
  zValidator('json', GetCommentRankingHistoryRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need view access
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view ranking history',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getCommentRankingHistory(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

export default app;
