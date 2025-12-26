/**
 * @fileoverview Withdraw ranking proposal handler
 * Allows group members to withdraw their own group's ranking proposal
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { logApiAction, logProjectOperation } from '../../utils/logging';

/**
 * Withdraw a ranking proposal
 * Permission: Level 3-4 (Active group members only, same group as proposal)
 */
export async function withdrawRankingProposal(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    proposalId: string;
  }
): Promise<Response> {
  const { userEmail } = context;
  const { proposalId } = requestData;

  try {
    // Validate required fields
    if (!proposalId) {
      return errorResponse('MISSING_FIELDS', 'Missing required field: proposalId');
    }

    // Get the proposal to verify it exists and get its groupId
    const proposal = await env.DB.prepare(`
      SELECT proposalId, projectId, stageId, groupId, status,
             settleTime, withdrawnTime, withdrawnBy
      FROM rankingproposals_with_status
      WHERE proposalId = ?
    `).bind(proposalId).first();

    if (!proposal) {
      return errorResponse('PROPOSAL_NOT_FOUND', 'Ranking proposal not found');
    }

    // Check proposal status - only pending proposals can be withdrawn
    if (proposal.withdrawnTime !== null) {
      return errorResponse('ALREADY_WITHDRAWN', 'This proposal has already been withdrawn', 400);
    }

    if (proposal.settleTime !== null) {
      return errorResponse(
        'CANNOT_WITHDRAW_SETTLED',
        'Cannot withdraw a settled proposal. Once settled, the proposal is finalized.',
        400
      );
    }

    if (proposal.status !== 'pending') {
      return errorResponse(
        'CANNOT_WITHDRAW',
        `Cannot withdraw a ${proposal.status} proposal. Only pending proposals can be withdrawn.`,
        400
      );
    }

    // Permission Check: Verify user is an active member of the same group
    const membership = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND groupId = ? AND isActive = 1
    `).bind(userEmail, proposal.projectId, proposal.groupId).first();

    if (!membership) {
      return errorResponse('NOT_AUTHORIZED', 'Only members of the proposal\'s group can withdraw it');
    }

    // ========== DEDUPLICATION: Prevent duplicate withdrawals ==========
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `ranking_withdraw:${proposalId}:${userEmail}:${timeBucket}`;

    // Check if this withdrawal is duplicate
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'ranking_proposal_withdraw',
      userId: context.userId,
      projectId: proposal.projectId as string,
      entityType: 'ranking_proposal',
      entityId: proposalId,
      message: `User ${userEmail} withdrawing ranking proposal ${proposalId}`,
      context: { proposalId, groupId: proposal.groupId, stageId: proposal.stageId },
      relatedEntities: { stage: proposal.stageId as string, group: proposal.groupId as string }
    });

    if (!isNewAction) {
      // Duplicate withdrawal attempt - return success response
      return successResponse({
        message: 'Ranking proposal already withdrawn (duplicate prevented)',
        deduped: true,
        proposalId,
        status: 'withdrawn',
        groupId: proposal.groupId,
        stageId: proposal.stageId
      });
    }

    // Update proposal to withdrawn (using CAS with timestamp fields)
    const result = await env.DB.prepare(`
      UPDATE rankingproposals
      SET withdrawnTime = ?, withdrawnBy = ?
      WHERE proposalId = ?
        AND withdrawnTime IS NULL
        AND settleTime IS NULL
    `).bind(now, userEmail, proposalId).run();

    // Check if any rows were actually updated
    if (!result.meta.changes || result.meta.changes === 0) {
      return errorResponse(
        'WITHDRAW_FAILED',
        'Failed to withdraw proposal - it may have already been withdrawn or changed status',
        400
      );
    }

    // Record withdrawal event to eventlogs (visible in EventLogViewer)
    try {
      await logProjectOperation(
        env,
        userEmail,
        proposal.projectId as string,
        'ranking_proposal_withdrawn',
        'ranking_proposal',
        proposalId,
        {
          groupId: proposal.groupId,
          stageId: proposal.stageId,
          withdrawnBy: userEmail,
          withdrawnTime: now
        },
        {
          level: 'warning',
          relatedEntities: {
            stage: proposal.stageId as string,
            group: proposal.groupId as string
          }
        }
      );
    } catch (logError) {
      console.error('[withdrawRankingProposal] Failed to log withdrawal event:', logError);
      // Log failure should not block withdrawal operation
    }

    console.log(`✅ Withdrew ranking proposal: ${proposalId} by user: ${userEmail}`);

    return successResponse({
      message: 'Ranking proposal withdrawn successfully',
      proposalId,
      status: 'withdrawn'
    });

  } catch (error) {
    console.error('Withdraw ranking proposal error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('WITHDRAW_FAILED', `Failed to withdraw proposal: ${errorMessage}`);
  }
}
