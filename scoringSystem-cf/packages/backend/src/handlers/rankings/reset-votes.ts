/**
 * @fileoverview Reset ranking proposal votes handler
 * Allows group leaders to reset votes when proposal doesn't pass (tie or disagree)
 * Political science basis: "Division of the Assembly" - re-vote on the same motion
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { logProjectOperation, logApiAction } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Reset votes on a ranking proposal
 * Permission: Level 3-4 (Group leader only, when all members voted and proposal didn't pass)
 *
 * Requirements:
 * - User must be group leader
 * - All group members must have voted
 * - Proposal must not have passed (support <= oppose, i.e. tied or disagreed)
 * - Can only reset N times per stage (N = project.maxVoteResetCount, default 1)
 * - Proposal status must be 'pending'
 *
 * Actions:
 * - Mark old proposal as 'reset' and record resetTime
 * - Create new proposal with identical rankingData
 * - Keep all old votes for audit trail (no deletion)
 * - New proposal starts with status='pending' for fresh voting
 */
export async function resetProposalVotes(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    proposalId: string;
    reason?: string;
  }
): Promise<Response> {
  const { userEmail } = context;
  const { proposalId, reason } = requestData;

  try {
    // Validate required fields
    if (!proposalId) {
      return errorResponse('MISSING_FIELDS', 'Missing required field: proposalId');
    }

    // Get the proposal details (including rankingData for copying)
    const proposal = await env.DB.prepare(`
      SELECT proposalId, projectId, stageId, groupId, status, rankingData, proposerEmail
      FROM rankingproposals_with_status
      WHERE proposalId = ?
    `).bind(proposalId).first();

    if (!proposal) {
      return errorResponse('PROPOSAL_NOT_FOUND', 'Ranking proposal not found');
    }

    if (proposal.status !== 'pending') {
      return errorResponse('PROPOSAL_NOT_PENDING', 'Can only reset pending proposals');
    }

    const projectId = proposal.projectId as string;
    const stageId = proposal.stageId as string;
    const groupId = proposal.groupId as string;

    // Permission Check 1: Verify user is the group leader
    const membership = await env.DB.prepare(`
      SELECT role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND groupId = ? AND isActive = 1
    `).bind(userEmail, projectId, groupId).first();

    if (!membership) {
      return errorResponse('NOT_GROUP_MEMBER', 'Only group members can reset votes');
    }

    if (membership.role !== 'leader') {
      return errorResponse('NOT_GROUP_LEADER', 'Only group leaders can reset votes');
    }

    // Get project configuration for maxVoteResetCount
    const projectConfig = await env.DB.prepare(`
      SELECT maxVoteResetCount FROM projects WHERE projectId = ?
    `).bind(projectId).first<{ maxVoteResetCount: number | null }>();

    const maxResetCount = projectConfig?.maxVoteResetCount ?? 1;

    // Check reset count: only allow N resets per group per stage (N from project config)
    const resetCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM rankingproposals_with_status
      WHERE groupId = ? AND stageId = ? AND status = 'reset'
    `).bind(groupId, stageId).first();

    if (resetCount && (resetCount.count as number) >= maxResetCount) {
      return errorResponse(
        'RESET_LIMIT_EXCEEDED',
        `Each group can only reset votes ${maxResetCount} time(s) per stage`
      );
    }

    // Get all group members
    const groupMembers = await env.DB.prepare(`
      SELECT userEmail FROM usergroups
      WHERE groupId = ? AND projectId = ? AND isActive = 1
    `).bind(groupId, projectId).all();

    if (!groupMembers.results || groupMembers.results.length === 0) {
      return errorResponse('NO_GROUP_MEMBERS', 'No active group members found');
    }

    const totalMembers = groupMembers.results.length;

    // Get all votes for this proposal
    const votes = await env.DB.prepare(`
      SELECT voteId, voterEmail, agree
      FROM proposalvotes
      WHERE proposalId = ?
    `).bind(proposalId).all();

    if (!votes.results || votes.results.length === 0) {
      return errorResponse('NO_VOTES', 'No votes found for this proposal');
    }

    // Check if all members have voted
    if (votes.results.length !== totalMembers) {
      return errorResponse(
        'NOT_ALL_VOTED',
        `All group members must vote before reset. Current: ${votes.results.length}/${totalMembers}`
      );
    }

    // Calculate vote counts
    let supportCount = 0;
    let opposeCount = 0;

    for (const vote of votes.results) {
      if (vote.agree === 1) {
        supportCount++;
      } else {
        opposeCount++;
      }
    }

    // Check if proposal passed (support > oppose means proposal approved, cannot reset)
    // Allow reset when: tied (support == oppose) OR disagreed (oppose > support)
    if (supportCount > opposeCount) {
      return errorResponse(
        'PROPOSAL_PASSED',
        `Proposal passed with majority support (${supportCount} vs ${opposeCount}). Cannot reset.`
      );
    }
    // At this point: supportCount <= opposeCount (tied or disagreed), reset is allowed

    // ========== DEDUPLICATION: Prevent duplicate resets ==========
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `ranking_reset:${proposalId}:${userEmail}:${timeBucket}`;

    // Check if this reset is duplicate
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'ranking_proposal_vote_reset',
      userId: context.userId,
      projectId,
      entityType: 'ranking_proposal',
      entityId: proposalId,
      message: `Group leader ${userEmail} resetting votes for proposal ${proposalId}`,
      context: { proposalId, groupId, stageId, reason: reason || 'Vote tied' },
      relatedEntities: { stage: stageId, group: groupId }
    });

    if (!isNewAction) {
      // Duplicate reset attempt - find the newly created proposal
      const newProposal = await env.DB.prepare(`
        SELECT proposalId, createdTime FROM rankingproposals_with_status
        WHERE groupId = ? AND stageId = ? AND status = 'pending'
        ORDER BY createdTime DESC LIMIT 1
      `).bind(groupId, stageId).first();

      return successResponse({
        message: 'Votes already reset (duplicate prevented)',
        deduped: true,
        oldProposalId: proposalId,
        newProposalId: newProposal?.proposalId || 'unknown',
        reason: reason || 'Vote tied',
        voteSummary: {
          totalMembers,
          supportCount,
          opposeCount,
          voteCount: votes.results.length
        }
      });
    }

    // All checks passed - execute reset atomically using D1 batch
    // Step 1: Record resetTime in old proposal (status remains pending, determined by VIEW)
    // Step 2: Create a new proposal by copying the old one's rankingData
    const newProposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Execute both operations atomically
    await env.DB.batch([
      // UPDATE old proposal - only set resetTime (status calculated by VIEW)
      env.DB.prepare(`
        UPDATE rankingproposals
        SET resetTime = ?
        WHERE proposalId = ?
          AND settleTime IS NULL
          AND withdrawnTime IS NULL
      `).bind(now, proposalId),

      // INSERT new proposal
      env.DB.prepare(`
        INSERT INTO rankingproposals (
          proposalId, projectId, stageId, groupId, proposerEmail, rankingData, status, createdTime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newProposalId,
        projectId,
        stageId,
        groupId,
        userEmail, // Reset initiator becomes the new proposer
        proposal.rankingData, // Copy the same ranking data
        'pending',
        now
      )
    ]);

    // Step 3: Log the reset event using centralized logging
    try {
      await logProjectOperation(
        env,
        userEmail,
        projectId,
        'ranking_proposal_vote_reset',
        'rankingproposal',
        proposalId,
        {
          groupId,
          stageId,
          resetBy: userEmail,
          reason: reason || 'No reason provided',
          oldProposalId: proposalId,
          newProposalId: newProposalId,
          previousVoteCount: votes.results.length,
          supportCount,
          opposeCount
        },
        { level: 'warning' }
      );
    } catch (logError) {
      console.error('[resetProposalVotes] Failed to log vote reset:', logError);
      // Don't fail the reset if logging fails
    }

    // Notify all group members about the vote reset
    try {
      // Get all group member emails
      const memberEmails = groupMembers.results.map((m: any) => m.userEmail);

      // Send notification to all members
      for (const memberEmail of memberEmails) {
        const voteStatus = supportCount === opposeCount
          ? `票數持平（${supportCount}-${opposeCount}）`
          : `反對票多（贊成${supportCount}，反對${opposeCount}）`;
        await queueSingleNotification(env, {
          targetUserEmail: memberEmail,
          type: 'ranking_proposal_approved',
          title: '投票已重置',
          content: `因${voteStatus}，小組長已重置投票。請對新提案重新投票。`,
          projectId,
          stageId,
          metadata: {
            oldProposalId: proposalId,
            newProposalId,
            resetBy: userEmail,
            reason: reason || 'No reason provided'
          }
        });
      }
    } catch (notifError) {
      console.error('[resetProposalVotes] Failed to send notifications:', notifError);
      // Don't fail the reset if notification fails
    }

    const voteResult = supportCount === opposeCount ? 'Tie' : 'Disagree';
    console.log(`✅ Reset votes for proposal ${proposalId} by ${userEmail}. ${voteResult}: ${supportCount}-${opposeCount}`);
    console.log(`✅ Created new proposal ${newProposalId} with same ranking data`);

    return successResponse({
      message: 'Votes reset successfully. A new voting round has started with the same ranking.',
      oldProposalId: proposalId,
      newProposalId: newProposalId,
      status: 'reset',
      resetTime: now,
      previousVotes: {
        total: votes.results.length,
        support: supportCount,
        oppose: opposeCount
      }
    });

  } catch (error) {
    console.error('Reset proposal votes error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('RESET_FAILED', `Failed to reset votes: ${errorMessage}`);
  }
}
