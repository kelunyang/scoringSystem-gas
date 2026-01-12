import type { Env } from '../types';
/**
 * Rankings Router
 * Handles voting and ranking-related endpoints
 *
 * Endpoints:
 * - POST /rankings/stage-rankings - Get stage rankings (teacher + user group votes)
 * - POST /rankings/all-stages-rankings - Get rankings for all stages (Batch API)
 * - POST /rankings/teacher-vote-history - Get teacher's voting history for a stage
 * - POST /rankings/teacher-ranking-versions - Get teacher ranking version history
 * - POST /rankings/proposals - Get all ranking proposals for a stage
 * - POST /rankings/teacher-comprehensive-vote - Submit teacher comprehensive vote (submissions + comments)
 * - POST /rankings/submit - Submit group ranking proposal (Level 3-4)
 * - POST /rankings/vote - Vote on ranking proposal (Level 3-4)
 * - POST /rankings/withdraw - Withdraw ranking proposal (Level 3-4)
 * - POST /rankings/reset-votes - Reset votes when tied (Group leader only, Level 3-4)
 * - POST /rankings/stage-vote - Submit individual stage ranking vote (Level 3-4)
 * - POST /rankings/voting-status - Get voting status for a stage
 * - POST /rankings/teacher-rankings - Get teacher rankings (Level 1)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission, checkIsTeacherOrAbove } from '../middleware/permissions';
import { checkStageAcceptsRankings } from '../utils/stage-validation';
import { getStageRankings, getAllStagesRankings } from '../handlers/rankings/stage';
import { getTeacherVoteHistory } from '../handlers/rankings/teacher-history';
import { getTeacherRankingVersions } from '../handlers/rankings/teacher-ranking-versions';
import { getStageRankingProposals } from '../handlers/rankings/proposals';
import { submitTeacherComprehensiveVote } from '../handlers/rankings/teacherVote';
import { submitGroupRanking } from '../handlers/rankings/submit';
import { voteOnRankingProposal } from '../handlers/rankings/vote';
import { withdrawRankingProposal } from '../handlers/rankings/withdraw';
import { resetProposalVotes } from '../handlers/rankings/reset-votes';
import { submitStageRankingVote } from '../handlers/rankings/stage-vote';
import { getStageVotingStatus } from '../handlers/rankings/voting-status';
import { getTeacherRankings } from '../handlers/rankings/teacher-rankings';
import {
  GetStageRankingsRequestSchema,
  GetAllStagesRankingsRequestSchema,
  GetTeacherVoteHistoryRequestSchema,
  GetRankingProposalsRequestSchema,
  SubmitTeacherComprehensiveVoteRequestSchema,
  SubmitGroupRankingRequestSchema,
  VoteOnRankingProposalRequestSchema,
  WithdrawRankingProposalRequestSchema,
  ResetProposalVotesRequestSchema,
  SubmitStageRankingVoteRequestSchema,
  GetVotingStatusRequestSchema,
  GetTeacherRankingsRequestSchema,
  GetTeacherRankingVersionsRequestSchema,
  AIRankingSuggestionRequestSchema,
  BTRankingSuggestionRequestSchema,
  AIRankingHistoryQuerySchema,
  MultiAgentRankingSuggestionRequestSchema
} from '@repo/shared/schemas/rankings';
import { getAIProvidersForRanking, submitAIRankingSuggestion, submitBTRankingSuggestion, submitMultiAgentRankingSuggestion } from '../handlers/rankings/aiSuggestion';
import { getAIRankingHistory, getAIRankingDetail } from '../handlers/rankings/aiHistory';
import { aiRateLimitMiddleware } from '../middleware/rate-limit';
import { getEffectiveUser } from '../middleware/sudo';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Get stage rankings
 * Returns teacher rankings and user's group vote rankings
 * Body: { projectId, stageId }
 */
app.post(
  '/stage-rankings',
  zValidator('json', GetStageRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Users with view access can see rankings
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view rankings',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Use effectiveUser for SUDO mode support
    // In SUDO mode, this returns the impersonated student's email
    const effectiveUser = getEffectiveUser(c);

    const response = await getStageRankings(
      c.env,
      effectiveUser.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Get all stages rankings (Batch API)
 * Returns rankings for multiple stages in a single request
 * This significantly reduces API calls from N to 1
 * Body: { projectId, stageIds: string[] }
 */
app.post(
  '/all-stages-rankings',
  zValidator('json', GetAllStagesRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Users with view access can see rankings
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view rankings',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    // Use effectiveUser for SUDO mode support
    const effectiveUser = getEffectiveUser(c);

    const response = await getAllStagesRankings(
      c.env,
      effectiveUser.userEmail,
      body.projectId,
      body.stageIds
    );

    return response;
  }
);

/**
 * Get teacher vote history
 * Returns teacher's voting history for a stage
 * Body: { projectId, stageId }
 */
app.post(
  '/teacher-vote-history',
  zValidator('json', GetTeacherVoteHistoryRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Users with view access can see their own vote history
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view vote history',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getTeacherVoteHistory(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Get ranking proposals for a stage
 * Returns all group ranking proposals with vote counts
 * Body: { projectId, stageId }
 */
app.post(
  '/proposals',
  zValidator('json', GetRankingProposalsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: Users with view access can see proposals
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view proposals',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageRankingProposals(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId
    );

    return response;
  }
);

/**
 * Submit teacher comprehensive vote
 * Allows teachers to vote on both submissions and comments
 * Body: { projectId, stageId, rankings: { submissions: [], comments: [] } }
 */
app.post(
  '/teacher-comprehensive-vote',
  zValidator('json', SubmitTeacherComprehensiveVoteRequestSchema),
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

    // Teacher role validation is handled in the handler function
    const response = await submitTeacherComprehensiveVote(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      {
        rankings: {
          submissions: (body.rankings as any).submissions || [],
          comments: (body.rankings as any).comments || []
        }
      }
    );

    return response;
  }
);

/**
 * Submit group ranking proposal
 * Permission: Level 3-4 (Active group members)
 * Body: { projectId, stageId, rankingData }
 */
app.post(
  '/submit',
  zValidator('json', SubmitGroupRankingRequestSchema),
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

    const response = await submitGroupRanking(c.env, user, body);
    return response;
  }
);

/**
 * Vote on ranking proposal
 * Permission: Level 3-4 (Same group members)
 * Body: { projectId, proposalId, agree, comment }
 */
app.post(
  '/vote',
  zValidator('json', VoteOnRankingProposalRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check if stage accepts rankings by looking up the proposal's stage
    const proposal = await c.env.DB.prepare(`
      SELECT stageId FROM rankingproposals
      WHERE proposalId = ? AND projectId = ?
    `).bind(body.proposalId, body.projectId).first();

    if (proposal) {
      const stageId = proposal.stageId as string;
      const stageCheck = await checkStageAcceptsRankings(c.env.DB, body.projectId, stageId);
      if (!stageCheck.valid) {
        return c.json({
          success: false,
          error: stageCheck.error,
          errorCode: stageCheck.errorCode
        }, 400);
      }
    }

    const response = await voteOnRankingProposal(c.env, user, body);
    return response;
  }
);

/**
 * Withdraw ranking proposal
 * Permission: Level 3-4 (Same group members as proposal)
 * Body: { proposalId }
 */
app.post(
  '/withdraw',
  zValidator('json', WithdrawRankingProposalRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await withdrawRankingProposal(c.env, user, body);
    return response;
  }
);

/**
 * Reset votes on a ranking proposal
 * Permission: Level 3-4 (Group leader only, when all voted and tied)
 * Body: { proposalId, reason? }
 */
app.post(
  '/reset-votes',
  zValidator('json', ResetProposalVotesRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await resetProposalVotes(c.env, user, body);
    return response;
  }
);

/**
 * Submit individual stage ranking vote
 * Permission: Level 3-4 (Active group members)
 * Body: { projectId, stageId, rankings }
 */
app.post(
  '/stage-vote',
  zValidator('json', SubmitStageRankingVoteRequestSchema),
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

    const response = await submitStageRankingVote(c.env, user, body);
    return response;
  }
);

/**
 * Get voting status for a stage
 * Permission: Level 1-4 (Teachers, observers, and group members)
 * Body: { projectId, stageId }
 */
app.post(
  '/voting-status',
  zValidator('json', GetVotingStatusRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getStageVotingStatus(c.env, user, body);
    return response;
  }
);

/**
 * Get teacher rankings for a stage
 * Permission: Level 1 (Teachers only) or project creator/admin
 * Body: { projectId, stageId }
 */
app.post(
  '/teacher-rankings',
  zValidator('json', GetTeacherRankingsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getTeacherRankings(c.env, user, body);
    return response;
  }
);

/**
 * Get teacher ranking version history
 * Returns all versions of a teacher's rankings (submission or comment)
 * Permission: Level 1 (Teachers only)
 * Body: { projectId, stageId, rankingType: 'submission' | 'comment' }
 */
app.post(
  '/teacher-ranking-versions',
  zValidator('json', GetTeacherRankingVersionsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Teacher role validation is handled in the handler function
    const response = await getTeacherRankingVersions(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.rankingType
    );

    return response;
  }
);

// ============================================
// AI Ranking Suggestion Routes
// ============================================

/**
 * Get list of enabled AI providers for ranking suggestions
 * Permission: Teachers (Level 0-2: Admin/Creator/Teacher/Observer)
 * Body: { projectId }
 */
app.post('/ai-providers', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { projectId } = body;

  if (!projectId) {
    return c.json({
      success: false,
      error: 'Missing projectId',
      errorCode: 'VALIDATION_ERROR'
    }, 400);
  }

  // Check permission: Must be teacher or above (Level 0-2)
  const isTeacherOrAbove = await checkIsTeacherOrAbove(c.env.DB, user.userEmail, projectId);
  if (!isTeacherOrAbove) {
    return c.json({
      success: false,
      error: 'Only teachers can access AI providers',
      errorCode: 'ACCESS_DENIED'
    }, 403);
  }

  return await getAIProvidersForRanking(c.env);
});

/**
 * Submit AI ranking suggestion request (direct mode)
 * Now queues the request for async processing
 * Permission: Teachers (Level 1)
 * Body: { projectId, stageId, rankingType, providerId, items, customPrompt? }
 * Rate limited: 10/minute, 60/hour per user
 */
app.post(
  '/ai-suggestion',
  aiRateLimitMiddleware,
  zValidator('json', AIRankingSuggestionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await submitAIRankingSuggestion(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

/**
 * Submit Bradley-Terry AI ranking suggestion request
 * Queues a BT ranking task with multiple pairwise comparisons
 * Permission: Teachers (Level 1)
 * Body: { projectId, stageId, rankingType, providerId, items, customPrompt?, pairsPerItem? }
 * Rate limited: 10/minute, 60/hour per user
 */
app.post(
  '/ai-bt-suggestion',
  aiRateLimitMiddleware,
  zValidator('json', BTRankingSuggestionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await submitBTRankingSuggestion(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

/**
 * Get AI ranking history for a stage
 * Returns all AI ranking calls made by any teacher for this stage
 * Permission: Teachers (Level 1)
 * Body: { projectId, stageId, rankingType?, limit? }
 */
app.post(
  '/ai-history',
  zValidator('json', AIRankingHistoryQuerySchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getAIRankingHistory(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

/**
 * Get AI ranking call detail
 * Returns a single AI ranking call with parsed fields
 * Permission: Teachers (Level 1)
 * Body: { projectId, callId }
 */
app.post(
  '/ai-detail',
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();

    const response = await getAIRankingDetail(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

/**
 * Submit Multi-Agent AI ranking suggestion request
 * Uses Free-MAD style 2-round debate with multiple providers
 * Permission: Teachers (Level 1)
 * Body: { projectId, stageId, rankingType, providerIds, items, customPrompt? }
 * Rate limited: 10/minute, 60/hour per user
 */
app.post(
  '/ai-multi-agent-suggestion',
  aiRateLimitMiddleware,
  zValidator('json', MultiAgentRankingSuggestionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await submitMultiAgentRankingSuggestion(
      c.env,
      user.userEmail,
      body
    );

    return response;
  }
);

export default app;
