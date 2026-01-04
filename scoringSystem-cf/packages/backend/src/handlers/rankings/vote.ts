/**
 * @fileoverview Ranking proposal voting handler
 * Allows group members to vote on ranking proposals from their group
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { queueSingleNotification } from '../../queues/notification-producer';
import { logProjectOperation, logApiAction } from '../../utils/logging';

/**
 * Vote on a ranking proposal
 * Permission: Level 3-4 (Must be in same group as proposal)
 */
export async function voteOnRankingProposal(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    projectId: string;
    proposalId: string;
    agree: boolean;
    comment?: string;
  }
): Promise<Response> {
  const { userEmail } = context;
  const { projectId, proposalId, agree, comment } = requestData;

  try {
    // Validate required fields
    if (!projectId || !proposalId || agree === undefined) {
      return errorResponse('MISSING_FIELDS', 'Missing required fields: projectId, proposalId, agree');
    }
    // Get proposal details (use VIEW for correct status calculation)
    const proposal = await env.DB.prepare(`
      SELECT proposalId, projectId, stageId, groupId, proposerEmail,
             status, settleTime, withdrawnTime, resetTime
      FROM rankingproposals_with_status
      WHERE proposalId = ? AND projectId = ?
    `).bind(proposalId, projectId).first();

    if (!proposal) {
      return errorResponse('PROPOSAL_NOT_FOUND', 'Ranking proposal not found');
    }
    // Check proposal status - disallow voting on finalized proposals
    // Only allow voting on pending or reset proposals (not settled or withdrawn)
    if (proposal.settleTime !== null) {
      return errorResponse('PROPOSAL_SETTLED', 'This proposal has been settled and voting is closed', 400);
    }

    if (proposal.withdrawnTime !== null) {
      return errorResponse('PROPOSAL_WITHDRAWN', 'This proposal has been withdrawn', 400);
    }

    // Allow voting on pending and reset proposals
    if (proposal.status !== 'pending' && proposal.status !== 'reset') {
      return errorResponse('PROPOSAL_NOT_VOTABLE', `Can only vote on pending or reset proposals, current status: ${proposal.status}`, 400);
    }

    const proposalGroupId = proposal.groupId as string;
    const stageId = proposal.stageId as string;

    // Permission Check: Voter must be in same group as proposal
    const voterMembership = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (!voterMembership) {
      return errorResponse('NOT_GROUP_MEMBER', 'Only group members can vote on proposals');
    }

    const voterGroupId = voterMembership.groupId as string;

    if (voterGroupId !== proposalGroupId) {
      return errorResponse('NOT_SAME_GROUP', 'Can only vote on your own group\'s proposals');
    }

    // 組內排名提案投票：允許提案者投票
    // 理由：規格要求「多數決」，提案者也是組員，需要參與投票
    // 評論排名的自投限制在 commentVotingUtils.ts 中單獨處理

    // Get total active group members count
    const groupMemberCount = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM usergroups
      WHERE projectId = ? AND groupId = ? AND isActive = 1
    `).bind(projectId, proposalGroupId).first();

    const totalMembers = (groupMemberCount?.count as number) || 0;

    if (totalMembers === 0) {
      return errorResponse('NO_ACTIVE_MEMBERS', 'No active members found in the group');
    }

    // ========== DEDUPLICATION: Prevent duplicate votes ==========
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `ranking_vote:${proposalId}:${userEmail}:${timeBucket}`;

    // Check if this vote action is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'ranking_proposal_vote',
      userId: context.userId,
      projectId,
      entityType: 'ranking_proposal',
      entityId: proposalId,
      message: `User ${userEmail} voted ${agree ? 'agree' : 'disagree'} on ranking proposal ${proposalId}`,
      context: {
        proposalId,
        stageId,
        groupId: proposalGroupId,
        voterEmail: userEmail,
        agree,
        comment: comment || '',
        timeBucket
      },
      relatedEntities: {
        stage: stageId,
        group: proposalGroupId
      }
    });

    // If duplicate vote detected, return success with existing vote status (idempotent behavior)
    if (!isNewAction) {
      console.log(`[voteOnRankingProposal] Duplicate vote prevented: ${dedupKey}`);

      // Return existing voting summary
      const existingVotes = await env.DB.prepare(`
        SELECT voteId, voterEmail, agree, timestamp
        FROM proposalvotes
        WHERE proposalId = ? AND projectId = ?
      `).bind(proposalId, projectId).all();

      const agreeCount = existingVotes.results.filter((v: any) => v.agree).length;
      const disagreeCount = existingVotes.results.length - agreeCount;

      // Check current proposal status (use VIEW for correct status)
      const currentProposal = await env.DB.prepare(`
        SELECT status, votingResult FROM rankingproposals_with_status WHERE proposalId = ?
      `).bind(proposalId).first();

      return new Response(JSON.stringify({
        success: true,
        message: 'Vote already recorded (duplicate prevented)',
        data: {
          deduped: true,
          voteId: 'deduped',
          proposalId,
          votingSummary: {
            totalMembers,
            agreeVotes: agreeCount,
            disagreeVotes: disagreeCount,
            totalVotes: existingVotes.results.length,
            votingResult: currentProposal?.votingResult || 'no_votes',
            status: currentProposal?.status || 'pending'
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    // Check if already voted
    const existingVote = await env.DB.prepare(`
      SELECT voteId FROM proposalvotes
      WHERE proposalId = ? AND voterEmail = ?
    `).bind(proposalId, userEmail).first();

    const voteId = existingVote ? (existingVote.voteId as string) : generateId('rpv');
    const isUpdate = !!existingVote;
    // Use D1 batch for atomic transaction
    const statements = [
      // 1. Insert or update vote (agree=1, disagree=-1 encoding for SUM optimization)
      env.DB.prepare(`
        INSERT INTO proposalvotes (
          voteId, projectId, proposalId, voterEmail, groupId,
          agree, timestamp, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposalId, voterEmail)
        DO UPDATE SET agree = excluded.agree, timestamp = excluded.timestamp, comment = excluded.comment
      `).bind(
        voteId,
        projectId,
        proposalId,
        userEmail,
        voterGroupId,
        agree ? 1 : -1,  // Changed: agree=1, disagree=-1 (was 0)
        now,
        comment || null
      )

      // Removed: Auto-approval/rejection logic (moved to settlement API)
      // Voting API now only records votes, settlement determines final status
    ];

    // Execute atomic transaction
    try {
      await env.DB.batch(statements);
      console.log(`✅ ${isUpdate ? 'Updated' : 'Created'} vote ${voteId} for proposal ${proposalId} by ${userEmail}`);
    } catch (batchError: any) {
      console.error('Vote batch error:', batchError);

      // Handle SUDO mode write blocked error (check both name and message for robustness)
      if (batchError?.name === 'SudoWriteBlockedError' || batchError?.message?.includes('SUDO_NO_WRITE')) {
        return errorResponse('SUDO_NO_WRITE', 'SUDO 模式為唯讀，無法進行寫入操作');
      }

      if (batchError.message?.includes('UNIQUE constraint failed')) {
        return errorResponse('ALREADY_VOTED', 'Vote already recorded');
      }
      throw batchError;
    }

    // Query updated proposal status (use VIEW for correct status)
    const updatedProposal = await env.DB.prepare(`
      SELECT status, votingResult, settleTime FROM rankingproposals_with_status WHERE proposalId = ?
    `).bind(proposalId).first();

    // Get vote counts (agree=1, disagree=-1)
    const voteCounts = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN agree = 1 THEN 1 ELSE 0 END) as agreeCount,
        SUM(CASE WHEN agree = -1 THEN 1 ELSE 0 END) as disagreeCount,
        COUNT(*) as totalVotes
      FROM proposalvotes
      WHERE proposalId = ?
    `).bind(proposalId).first();

    // Log voting event (after getting vote counts for detailed logging)
    try {
      await logProjectOperation(env, userEmail, projectId, 'proposal_voted', 'rankingproposal', proposalId, {
        agree,
        isUpdate,
        comment: comment || null,
        proposerEmail: proposal.proposerEmail,
        currentVoteStatus: {
          supportCount: voteCounts?.agreeCount || 0,
          opposeCount: (voteCounts?.disagreeCount || 0),
          totalMembers: totalMembers,
          approvalProgress: `${voteCounts?.agreeCount || 0}/${totalMembers}`
        },
        groupId: proposal.groupId,
        stageId: proposal.stageId
      }, {
        relatedEntities: {
          proposal: proposalId,
          stage: proposal.stageId as string,
          group: proposal.groupId as string
        }
      });
    } catch (logError) {
      console.error('[voteOnRankingProposal] Failed to log voting event:', logError);
      // Logging failure should not affect voting operation
    }

    // Voting API only records votes, settlement determines final status
    // Success message shows voting result but does not imply final approval/rejection
    let message = isUpdate ? 'Vote updated successfully' : 'Vote recorded successfully';

    // Note: Auto-approval/rejection notifications removed - now handled by settlement API
    // Voting and settlement are separated in the new architecture

    return successResponse({
      message,
      voteId,
      proposalId,
      agree,
      isUpdate,
      proposalStatus: updatedProposal?.status || 'pending',
      voteCounts: {
        agree: voteCounts?.agreeCount || 0,
        disagree: voteCounts?.disagreeCount || 0,
        total: voteCounts?.totalVotes || 0,
        totalMembers
      }
    });

  } catch (error: any) {
    console.error('Vote on proposal error:', error);

    // Handle SUDO mode write blocked error (check both name and message for robustness)
    if (error?.name === 'SudoWriteBlockedError' || error?.message?.includes('SUDO_NO_WRITE')) {
      return errorResponse('SUDO_NO_WRITE', 'SUDO 模式為唯讀，無法進行寫入操作');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('VOTE_FAILED', `Failed to record vote: ${errorMessage}`);
  }
}
