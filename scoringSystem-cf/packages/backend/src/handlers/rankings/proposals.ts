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
      SELECT ug.groupId, ug.role, g.groupName
      FROM usergroups ug
      LEFT JOIN groups g ON ug.groupId = g.groupId AND ug.projectId = g.projectId
      WHERE ug.userEmail = ? AND ug.projectId = ? AND ug.isActive = 1
    `).bind(userEmail, projectId).first();

    if (userGroupData) {
      // Count total members in this group
      const memberCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM usergroups
        WHERE projectId = ? AND groupId = ? AND isActive = 1
      `).bind(projectId, userGroupData.groupId).first();

      userGroupInfo = {
        groupId: userGroupData.groupId,
        groupName: userGroupData.groupName || userGroupData.groupId,
        isGroupLeader: userGroupData.role === 'leader',
        groupMemberCount: memberCountResult?.count || 0
      };
      console.log(`🔍 [getStageRankingProposals] User group info:`, userGroupInfo);
    }

    // For each proposal, get vote counts and complete votes array
    const proposalsWithVotes = await Promise.all(
      proposals.map(async (proposal: any, index: number) => {
        // Vote counts are already provided by rankingproposals_with_status VIEW
        // No need to recalculate - proposal.supportCount, proposal.opposeCount, proposal.totalVotes are available

        // Get complete votes array with timestamps and voter names for trend chart
        const votesQuery = await env.DB.prepare(`
          SELECT
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
          WHERE pv.proposalId = ?
          ORDER BY pv.timestamp ASC
        `).bind(proposal.proposalId).all();

        // Get current user's vote status
        const userVoteQuery = await env.DB.prepare(`
          SELECT agree FROM proposalvotes
          WHERE proposalId = ? AND voterEmail = ?
        `).bind(proposal.proposalId, userEmail).first();

        // Validate and filter rankingData to ensure only approved submissions are included
        let validatedRankingData = proposal.rankingData;
        try {
          const rankingDataParsed = typeof proposal.rankingData === 'string'
            ? JSON.parse(proposal.rankingData)
            : proposal.rankingData;

          if (Array.isArray(rankingDataParsed)) {
            // Filter out submissions that are not approved
            const validatedItems = [];
            for (const item of rankingDataParsed) {
              if (item.submissionId) {
                // Check if submission exists and is approved
                const submission = await env.DB.prepare(`
                  SELECT status FROM submissions_with_status
                  WHERE submissionId = ? AND projectId = ? AND stageId = ?
                `).bind(item.submissionId, proposal.projectId, proposal.stageId).first();

                // Only include items with approved submissions
                if (submission && submission.status === 'approved') {
                  validatedItems.push(item);
                } else {
                  console.warn(`⚠️ Filtered out non-approved submission ${item.submissionId} from proposal ${proposal.proposalId}`);
                }
              } else {
                // Include items without submissionId (shouldn't happen, but defensive)
                validatedItems.push(item);
              }
            }
            validatedRankingData = validatedItems;
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
          votes: votesQuery.results || [],     // Complete votes array for trend chart
          // 🔧 FIX: Enhanced userVote conversion with strict type checking
          userVote: userVoteQuery && typeof userVoteQuery.agree === 'number'
            ? (userVoteQuery.agree === 1 ? 'support' : userVoteQuery.agree === -1 ? 'oppose' : null)
            : null
        };
      })
    );

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
