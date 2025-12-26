/**
 * @fileoverview Voting status handler
 * Returns voting statistics and user's voting status for a stage
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Get voting status for a stage
 * Permission: Level 1-4 (Teachers, observers, and group members can view)
 */
export async function getStageVotingStatus(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    projectId: string;
    stageId: string;
  }
): Promise<Response> {
  const { userEmail, userId } = context;
  const { projectId, stageId } = requestData;

  try {
    // Validate required fields
    if (!projectId || !stageId) {
      return errorResponse('MISSING_FIELDS', 'Missing required fields: projectId, stageId');
    }

    // Permission Check: Must be group member, teacher, or admin
    const membership = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    const isTeacher = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND role = 'teacher' AND isActive = 1
    `).bind(projectId, userEmail).first();

    const isObserver = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND role = 'observer' AND isActive = 1
    `).bind(projectId, userEmail).first();

    const project = await env.DB.prepare(`
      SELECT createdBy FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    const isCreator = project && project.createdBy === userEmail;

    if (!membership && !isTeacher && !isObserver && !isCreator) {
      return errorResponse('NO_ACCESS', 'You do not have access to this project');
    }

    // Verify stage exists
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    // Get total number of active groups
    const groupCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT groupId) as count FROM usergroups
      WHERE projectId = ? AND isActive = 1
    `).bind(projectId).first();

    const totalGroups = (groupCount?.count as number) || 0;

    // Get total number of active members
    const memberCount = await env.DB.prepare(`
      SELECT COUNT(DISTINCT userEmail) as count FROM usergroups
      WHERE projectId = ? AND isActive = 1
    `).bind(projectId).first();

    const totalMembers = (memberCount?.count as number) || 0;

    // Get ranking proposals count (use VIEW for correct status)
    const proposalsCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM rankingproposals_with_status
      WHERE projectId = ? AND stageId = ? AND status != 'withdrawn'
    `).bind(projectId, stageId).first();

    const totalProposals = (proposalsCount?.count as number) || 0;

    // Get individual votes count (from rankings table)
    const individualVotesCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM rankings
      WHERE stageId = ? AND status = 'submitted'
    `).bind(stageId).first();

    const totalIndividualVotes = (individualVotesCount?.count as number) || 0;

    // Check if current user has voted (if they're a member)
    let userHasVoted = false;
    let userVoteData = null;

    if (membership) {
      const userVote = await env.DB.prepare(`
        SELECT proposalId, rankingData, createdAt, lastModified
        FROM rankings
        WHERE stageId = ? AND proposerUserId = ?
      `).bind(stageId, userId).first();

      if (userVote) {
        userHasVoted = true;
        userVoteData = {
          proposalId: userVote.proposalId,
          rankingData: userVote.rankingData ? JSON.parse(userVote.rankingData as string) : null,
          submittedAt: userVote.createdAt,
          lastModified: userVote.lastModified
        };
      }
    }

    // Get proposals with vote counts (use VIEW for correct status and counts)
    const proposals = await env.DB.prepare(`
      SELECT
        rp.proposalId,
        rp.groupId,
        rp.proposerEmail,
        rp.status,
        rp.votingResult,
        rp.createdTime,
        rp.agreeVotes,
        rp.disagreeVotes,
        rp.totalVotes,
        g.groupName
      FROM rankingproposals_with_status rp
      LEFT JOIN groups g ON rp.groupId = g.groupId
      WHERE rp.projectId = ? AND rp.stageId = ?
      ORDER BY rp.createdTime DESC
    `).bind(projectId, stageId).all();

    return successResponse({
      stage: {
        stageId: stage.stageId,
        stageName: stage.stageName,
        status: stage.status
      },
      statistics: {
        totalGroups,
        totalMembers,
        totalProposals,
        totalIndividualVotes,
        votingParticipationRate: totalMembers > 0 ? (totalIndividualVotes / totalMembers * 100).toFixed(1) : '0.0'
      },
      userStatus: {
        hasVoted: userHasVoted,
        voteData: userVoteData,
        canVote: !!membership,
        isTeacher: !!isTeacher,
        isObserver: !!isObserver
      },
      proposals: proposals.results.map(p => ({
        proposalId: p.proposalId,
        groupId: p.groupId,
        groupName: p.groupName,
        proposerEmail: p.proposerEmail,
        status: p.status,
        votingResult: p.votingResult, // From VIEW: 'agree' | 'disagree' | 'tie' | 'no_votes'
        createdTime: p.createdTime,
        votes: {
          agree: p.agreeVotes,    // From VIEW (guaranteed non-null)
          disagree: p.disagreeVotes, // From VIEW (guaranteed non-null)
          total: p.totalVotes     // From VIEW (guaranteed non-null)
        }
      }))
    });

  } catch (error) {
    console.error('Get voting status error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_STATUS_FAILED', `Failed to get voting status: ${errorMessage}`);
  }
}
