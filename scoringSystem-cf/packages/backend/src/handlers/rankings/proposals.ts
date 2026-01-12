/**
 * Rankings Handler - Ranking Proposals
 * Get all ranking proposals for a stage with vote counts
 *
 * Returns all group ranking proposals for a stage including:
 * - Proposal metadata (proposer, status, creation time)
 * - Vote counts (support/oppose)
 * - Ranking data
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Get all ranking proposals for a stage
 */
export async function getStageRankingProposals(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    console.log(`🚀 [getStageRankingProposals] Starting: projectId=${projectId}, stageId=${stageId}, userEmail=${userEmail}`);

    // First, check if user is a teacher (teachers can see all groups' proposals)
    const teacherCheck = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND role = 'teacher' AND isActive = 1
    `).bind(projectId, userEmail).first();

    const isTeacher = !!teacherCheck;
    console.log(`🔍 [getStageRankingProposals] User is teacher: ${isTeacher}`);

    let proposalsResult;

    if (isTeacher) {
      // Teachers can see all groups' proposals (use VIEW for correct status)
      proposalsResult = await env.DB.prepare(`
        SELECT
          rp.proposalId,
          rp.projectId,
          rp.stageId,
          rp.groupId,
          rp.proposerEmail,
          rp.rankingData,
          rp.status,
          rp.votingResult,
          rp.supportCount,
          rp.opposeCount,
          rp.totalVotes,
          rp.settleTime,
          rp.withdrawnTime,
          rp.withdrawnBy,
          rp.createdTime,
          rp.resetTime,
          u.displayName as proposerDisplayName
        FROM rankingproposals_with_status rp
        LEFT JOIN users u ON rp.proposerEmail = u.userEmail
        WHERE rp.projectId = ? AND rp.stageId = ?
        ORDER BY rp.createdTime ASC
      `).bind(projectId, stageId).all();
    } else {
      // Students can only see their own group's proposals
      // Get user's group ID
      const userGroup = await env.DB.prepare(`
        SELECT groupId FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND isActive = 1
      `).bind(userEmail, projectId).first();

      if (!userGroup) {
        console.log(`⚠️ [getStageRankingProposals] User not in any active group`);
        return successResponse({ proposals: [] });
      }

      const userGroupId = userGroup.groupId;
      console.log(`🔍 [getStageRankingProposals] User's groupId: ${userGroupId}`);

      // Get only proposals from user's group (use VIEW for correct status)
      proposalsResult = await env.DB.prepare(`
        SELECT
          rp.proposalId,
          rp.projectId,
          rp.stageId,
          rp.groupId,
          rp.proposerEmail,
          rp.rankingData,
          rp.status,
          rp.votingResult,
          rp.supportCount,
          rp.opposeCount,
          rp.totalVotes,
          rp.settleTime,
          rp.withdrawnTime,
          rp.withdrawnBy,
          rp.createdTime,
          rp.resetTime,
          u.displayName as proposerDisplayName
        FROM rankingproposals_with_status rp
        LEFT JOIN users u ON rp.proposerEmail = u.userEmail
        WHERE rp.projectId = ? AND rp.stageId = ? AND rp.groupId = ?
        ORDER BY rp.createdTime ASC
      `).bind(projectId, stageId, userGroupId).all();
    }

    const proposals = proposalsResult.results || [];
    console.log(`🔍 [getStageRankingProposals] Found ${proposals.length} proposals`);

    // Get user's group information (for vote reset feature)
    let userGroupInfo = null;
    const userGroupData = await env.DB.prepare(`
      SELECT ug.groupId, ug.role, g.groupName,
        (SELECT COUNT(*) FROM usergroups WHERE projectId = ug.projectId AND groupId = ug.groupId AND isActive = 1) as memberCount
      FROM usergroups ug
      LEFT JOIN groups g ON ug.groupId = g.groupId AND ug.projectId = g.projectId
      WHERE ug.userEmail = ? AND ug.projectId = ? AND ug.isActive = 1
    `).bind(userEmail, projectId).first();

    if (userGroupData) {
      userGroupInfo = {
        groupId: userGroupData.groupId,
        groupName: userGroupData.groupName || userGroupData.groupId,
        isGroupLeader: userGroupData.role === 'leader',
        groupMemberCount: userGroupData.memberCount || 0
      };
      console.log(`🔍 [getStageRankingProposals] User group info:`, userGroupInfo);
    }

    // Early return if no proposals
    if (proposals.length === 0) {
      return successResponse({
        proposals: [],
        userGroupInfo: userGroupInfo
      });
    }

    // ============ BATCH QUERIES FOR OPTIMIZATION ============
    // Instead of N queries per proposal, we do 3 batch queries total

    // Batch Query 1: Get ALL votes for ALL proposals in this stage
    const proposalIds = proposals.map((p: any) => p.proposalId);
    const proposalPlaceholders = proposalIds.map(() => '?').join(',');

    const allVotesResult = await env.DB.prepare(`
      SELECT
        pv.proposalId,
        pv.voteId,
        pv.voterEmail,
        pv.agree,
        pv.timestamp,
        u.displayName as voterDisplayName,
        u.avatarSeed as voterAvatarSeed,
        u.avatarStyle as voterAvatarStyle,
        u.avatarOptions as voterAvatarOptions
      FROM proposalvotes pv
      LEFT JOIN users u ON pv.voterEmail = u.userEmail
      WHERE pv.proposalId IN (${proposalPlaceholders})
      ORDER BY pv.proposalId, pv.timestamp ASC
    `).bind(...proposalIds).all();

    // Group votes by proposalId
    const votesByProposal = new Map<string, any[]>();
    for (const vote of (allVotesResult.results || [])) {
      const pid = vote.proposalId as string;
      if (!votesByProposal.has(pid)) {
        votesByProposal.set(pid, []);
      }
      votesByProposal.get(pid)!.push(vote);
    }
    console.log(`🔍 [getStageRankingProposals] Batch loaded ${allVotesResult.results?.length || 0} votes for ${proposalIds.length} proposals`);

    // Batch Query 2: Get current user's votes for ALL proposals
    const userVotesResult = await env.DB.prepare(`
      SELECT proposalId, agree FROM proposalvotes
      WHERE proposalId IN (${proposalPlaceholders}) AND voterEmail = ?
    `).bind(...proposalIds, userEmail).all();

    // Map user votes by proposalId
    const userVoteByProposal = new Map<string, number>();
    for (const uv of (userVotesResult.results || [])) {
      userVoteByProposal.set(uv.proposalId as string, uv.agree as number);
    }

    // Batch Query 3: Get ALL approved submissions for this stage (for validation)
    const approvedSubmissionsResult = await env.DB.prepare(`
      SELECT submissionId FROM submissions_with_status
      WHERE projectId = ? AND stageId = ? AND status = 'approved'
    `).bind(projectId, stageId).all();

    // Create a Set for fast lookup
    const approvedSubmissionIds = new Set(
      (approvedSubmissionsResult.results || []).map((s: any) => s.submissionId as string)
    );
    console.log(`🔍 [getStageRankingProposals] Found ${approvedSubmissionIds.size} approved submissions for validation`);

    // ============ PROCESS PROPOSALS (No more individual DB queries!) ============
    const proposalsWithVotes = proposals.map((proposal: any, index: number) => {
      // Get votes from batch result
      const votes = votesByProposal.get(proposal.proposalId) || [];

      // Get user vote from batch result
      const userAgree = userVoteByProposal.get(proposal.proposalId);
      const userVote = typeof userAgree === 'number'
        ? (userAgree === 1 ? 'support' : userAgree === -1 ? 'oppose' : null)
        : null;

      // Validate ranking data using pre-loaded approved submissions
      let validatedRankingData = proposal.rankingData;
      try {
        const rankingDataParsed = typeof proposal.rankingData === 'string'
          ? JSON.parse(proposal.rankingData)
          : proposal.rankingData;

        if (Array.isArray(rankingDataParsed)) {
          // Filter out submissions that are not approved (using Set lookup - O(1))
          validatedRankingData = rankingDataParsed.filter((item: any) => {
            if (item.submissionId) {
              const isApproved = approvedSubmissionIds.has(item.submissionId);
              if (!isApproved) {
                console.warn(`⚠️ Filtered out non-approved submission ${item.submissionId} from proposal ${proposal.proposalId}`);
              }
              return isApproved;
            }
            // Include items without submissionId (defensive)
            return true;
          });
        }
      } catch (e) {
        console.error(`❌ Error validating rankingData for proposal ${proposal.proposalId}:`, e);
        // Keep original data if validation fails
      }

      return {
        proposalId: proposal.proposalId,
        projectId: proposal.projectId,
        stageId: proposal.stageId,
        groupId: proposal.groupId,
        proposerEmail: proposal.proposerEmail,
        proposerDisplayName: proposal.proposerDisplayName || proposal.proposerEmail,
        version: index + 1, // Version number based on createdTime ASC order (1 = oldest)
        rankingData: validatedRankingData,
        status: proposal.status,
        votingResult: proposal.votingResult, // From VIEW: 'agree' | 'disagree' | 'tie' | 'no_votes'
        createdTime: proposal.createdTime,
        resetTime: proposal.resetTime || null, // Timestamp when this proposal was reset (if any)
        supportCount: proposal.supportCount, // From VIEW (guaranteed non-null)
        opposeCount: proposal.opposeCount,   // From VIEW (guaranteed non-null)
        totalVotes: proposal.totalVotes,     // From VIEW (guaranteed non-null)
        votes: votes,                        // From batch query
        userVote: userVote                   // From batch query
      };
    });

    console.log(`✅ [getStageRankingProposals] Successfully retrieved ${proposalsWithVotes.length} proposals with vote counts`);

    return successResponse({
      proposals: proposalsWithVotes,
      userGroupInfo: userGroupInfo // User's group information for vote reset feature
    });

  } catch (error) {
    console.error('❌ [getStageRankingProposals] Error:', error);
    console.error('❌ [getStageRankingProposals] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', `Failed to get ranking proposals: ${errorMessage}`);
  }
}
