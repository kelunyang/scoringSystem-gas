/**
 * @fileoverview Comment voting and ranking handlers
 * Handles comment ranking submissions, voting eligibility checks, and ranking queries
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';

/**
 * Check if user is eligible to vote on comments
 */
export async function checkVotingEligibility(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Check if user has commented in this stage (excluding replies)
    const commentsResult = await env.DB.prepare(`
      SELECT commentId, mentionedGroups, mentionedUsers
      FROM comments
      WHERE projectId = ? AND stageId = ? AND authorEmail = ? AND isReply = 0
    `).bind(projectId, stageId, userEmail).all();

    const commentsCount = commentsResult.results?.length || 0;
    const hasCommented = commentsCount > 0;

    // Check if user has mentioned at least one group or user
    let groupMentionCount = 0;
    let userMentionCount = 0;
    let hasMentionedGroup = false;
    let hasMentionedUser = false;

    if (commentsResult.results) {
      for (const comment of commentsResult.results) {
        // Check mentionedGroups
        const mentionedGroups = comment.mentionedGroups as string | null;
        if (mentionedGroups) {
          try {
            const groups = JSON.parse(mentionedGroups);
            if (Array.isArray(groups) && groups.length > 0) {
              groupMentionCount += groups.length;
              hasMentionedGroup = true;
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.warn('Failed to parse mentionedGroups:', errorMessage);
          }
        }

        // Check mentionedUsers
        const mentionedUsers = comment.mentionedUsers as string | null;
        if (mentionedUsers) {
          try {
            const users = JSON.parse(mentionedUsers);
            if (Array.isArray(users) && users.length > 0) {
              userMentionCount += users.length;
              hasMentionedUser = true;
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.warn('Failed to parse mentionedUsers:', errorMessage);
          }
        }
      }
    }

    // Check if user has already voted
    const voteResult = await env.DB.prepare(`
      SELECT proposalId, createdTime
      FROM commentrankingproposals
      WHERE projectId = ? AND stageId = ? AND authorEmail = ?
      ORDER BY createdTime DESC
      LIMIT 1
    `).bind(projectId, stageId, userEmail).first();

    const hasVoted = !!voteResult;
    const lastVoteTime = voteResult ? (voteResult.createdTime as number) : undefined;

    // Count total votes for this stage
    const voteCountResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM commentrankingproposals
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    const voteCount = (voteCountResult?.count as number) || 0;

    // Determine eligibility (Groups OR Users)
    const hasMentions = hasMentionedGroup || hasMentionedUser;
    const canVote = hasCommented && hasMentions;

    let message = '';
    if (!hasCommented) {
      message = '您尚未在本階段發表評論';
    } else if (!hasMentions) {
      message = '您的評論中尚未提及任何群組或用戶（使用 @群組名稱 或 @用戶名稱 格式）';
    } else if (hasVoted) {
      message = '您已提交評論排名（可重新提交以更新）';
    } else {
      message = '您符合投票資格';
    }

    return successResponse({
      canVote,
      hasCommented,
      hasMentionedGroup,
      hasMentionedUser,
      commentsCount,
      groupMentionCount,
      userMentionCount,
      message,
      hasVoted,
      lastVoteTime,
      voteCount
    });

  } catch (error) {
    console.error('Check voting eligibility error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('CHECK_ELIGIBILITY_FAILED', `Failed to check voting eligibility: ${errorMessage}`);
  }
}

/**
 * Submit comment ranking (student vote)
 */
import { validateCommentEligibility, validateRankingData } from '../../utils/commentVotingUtils';
import { logProjectOperation } from '../../utils/logging';

export async function submitCommentRanking(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankingData: Array<{ commentId: string; rank: number }>
): Promise<Response> {
  try {
    // 1. Check voting eligibility
    const eligibilityResponse = await checkVotingEligibility(env, userEmail, projectId, stageId);
    const eligibilityData = await eligibilityResponse.json() as { success: boolean; data: { canVote: boolean; message?: string } };

    if (!eligibilityData.success || !eligibilityData.data.canVote) {
      return errorResponse('NOT_ELIGIBLE', eligibilityData.data.message || '您不符合投票資格');
    }

    // 2. Validate ranking data format using shared util
    const validation = validateRankingData(rankingData);
    if (!validation.valid) {
      return errorResponse('INVALID_RANKING', validation.error || '排名資料格式錯誤');
    }

    // Track unique authors to prevent voting for same author multiple times
    const votedAuthors = new Set<string>();

    // Validate each ranking using shared utility
    for (const item of rankingData) {
      const { commentId } = item;

      // Use shared validation function
      const commentValidation = await validateCommentEligibility(
        env.DB,
        projectId,
        commentId,
        userEmail  // Exclude voter's own comments
      );

      if (!commentValidation.valid) {
        return errorResponse('INVALID_COMMENT', commentValidation.error || '評論不符合投票資格');
      }

      // Check for duplicate author
      const author = commentValidation.comment.authorEmail as string;
      if (votedAuthors.has(author)) {
        return errorResponse('DUPLICATE_AUTHOR', `不可重複投票給同一作者：${author}`);
      }
      votedAuthors.add(author);
    }

    // 3. Save ranking proposal
    const proposalId = generateId('cmtrank');
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO commentrankingproposals (
        proposalId, projectId, stageId, authorEmail,
        rankingData, createdTime, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      proposalId,
      projectId,
      stageId,
      userEmail,
      JSON.stringify(rankingData),
      now,
      JSON.stringify({ version: 1 })
    ).run();

    // Log comment voting event
    try {
      await logProjectOperation(env, userEmail, projectId, 'comment_voted', 'stage', stageId, {
        commentCount: rankingData.length,
        comments: rankingData.map(r => ({
          commentId: r.commentId,
          rank: r.rank
        }))
      });
    } catch (logError) {
      console.error('[submitCommentRanking] Failed to log voting event:', logError);
      // Logging failure should not affect voting operation
    }

    return successResponse({
      proposalId,
      message: '評論排名已成功提交',
      rankingCount: rankingData.length
    });

  } catch (error: any) {
    console.error('Submit comment ranking error:', error);

    // Handle SUDO mode write blocked error (check both name and message for robustness)
    if (error?.name === 'SudoWriteBlockedError' || error?.message?.includes('SUDO_NO_WRITE')) {
      return errorResponse('SUDO_NO_WRITE', 'SUDO 模式為唯讀，無法進行寫入操作');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('SUBMIT_RANKING_FAILED', `Failed to submit comment ranking: ${errorMessage}`);
  }
}

/**
 * Get rankings for a single comment (for current user)
 * NOTE: GAS-compatible - returns CURRENT USER's ranking, not all users' average
 */
export async function getCommentRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  commentId: string
): Promise<Response> {
  try {
    const rankings: any = {
      commentId,
      userVoteRank: null,
      teacherVoteRank: null,
      settlementRank: null
    };

    // Get CURRENT USER's vote rank (from their latest proposal)
    const userProposalResult = await env.DB.prepare(`
      SELECT rankingData
      FROM commentrankingproposals
      WHERE projectId = ? AND stageId = ? AND authorEmail = ?
      ORDER BY createdTime DESC
      LIMIT 1
    `).bind(projectId, stageId, userEmail).first();

    if (userProposalResult && userProposalResult.rankingData) {
      try {
        const rankingData = JSON.parse(userProposalResult.rankingData as string);
        const commentRanking = rankingData.find((r: any) => r.commentId === commentId);
        if (commentRanking) {
          rankings.userVoteRank = commentRanking.rank;
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('Failed to parse user ranking data:', errorMessage);
      }
    }

    // Get teacher vote rank (latest teacher ranking for this comment)
    const teacherRankResult = await env.DB.prepare(`
      SELECT rank
      FROM teachercommentrankings
      WHERE projectId = ? AND stageId = ? AND commentId = ?
      ORDER BY createdTime DESC
      LIMIT 1
    `).bind(projectId, stageId, commentId).first();

    if (teacherRankResult && teacherRankResult.rank) {
      rankings.teacherVoteRank = teacherRankResult.rank as number;
    }

    // Get settlement rank from comments.awardRank
    const commentResult = await env.DB.prepare(`
      SELECT awardRank
      FROM comments
      WHERE commentId = ?
    `).bind(commentId).first();

    if (commentResult && commentResult.awardRank) {
      rankings.settlementRank = commentResult.awardRank as number;
    }

    return successResponse(rankings);

  } catch (error) {
    console.error('Get comment rankings error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_RANKINGS_FAILED', `Failed to get comment rankings: ${errorMessage}`);
  }
}

/**
 * Get all comment rankings for a stage (batch processing to avoid N+1 queries)
 * NOTE: GAS-compatible batch processing - returns current user's rankings for all comments
 */
export async function getStageCommentRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Get all comments with awardRank (exclude teachers and replies)
    const commentsResult = await env.DB.prepare(`
      SELECT c.commentId, c.authorEmail, c.awardRank
      FROM comments c
      LEFT JOIN projectviewers pv
        ON pv.userEmail = c.authorEmail
        AND pv.projectId = c.projectId
      WHERE c.projectId = ? AND c.stageId = ? AND c.isReply = 0
        AND (pv.role IS NULL OR pv.role != 'teacher')
    `).bind(projectId, stageId).all();

    const rankingsMap: Record<string, any> = {};

    if (!commentsResult.results || commentsResult.results.length === 0) {
      return successResponse(rankingsMap);
    }

    // Batch query: Get user's latest comment ranking proposal
    const userProposalResult = await env.DB.prepare(`
      SELECT rankingData
      FROM commentrankingproposals
      WHERE projectId = ? AND stageId = ? AND authorEmail = ?
      ORDER BY createdTime DESC
      LIMIT 1
    `).bind(projectId, stageId, userEmail).first();

    const userRankings: Record<string, number> = {};
    if (userProposalResult && userProposalResult.rankingData) {
      try {
        const rankingData = JSON.parse(userProposalResult.rankingData as string);
        for (const item of rankingData) {
          userRankings[item.commentId] = item.rank;
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('Failed to parse user ranking data:', errorMessage);
      }
    }

    // Batch query: Get all teacher comment rankings with version info
    // Each teacher may have multiple versions; we only keep the latest per teacher
    const teacherRankingsResult = await env.DB.prepare(`
      SELECT teacherEmail, commentId, rank, createdTime
      FROM teachercommentrankings
      WHERE projectId = ? AND stageId = ?
      ORDER BY teacherEmail ASC, createdTime DESC
    `).bind(projectId, stageId).all();

    // Aggregate: Keep only latest version per teacher
    const teacherLatestRankings = new Map<string, Map<string, number>>();
    const teacherLatestTime = new Map<string, number>();

    if (teacherRankingsResult.results) {
      for (const row of teacherRankingsResult.results) {
        const teacherEmail = row.teacherEmail as string;
        const commentId = row.commentId as string;
        const rank = row.rank as number;
        const createdTime = row.createdTime as number;

        // Initialize teacher's latest time
        if (!teacherLatestTime.has(teacherEmail)) {
          teacherLatestTime.set(teacherEmail, createdTime);
          teacherLatestRankings.set(teacherEmail, new Map());
        }

        // Only keep records with same createdTime (same submission)
        if (teacherLatestTime.get(teacherEmail) === createdTime) {
          teacherLatestRankings.get(teacherEmail)!.set(commentId, rank);
        }
      }
    }

    // Aggregate all teachers' rankings to average
    const teacherRankings: Record<string, number> = {};
    const commentRankSums = new Map<string, { sum: number; count: number }>();

    for (const [, rankings] of teacherLatestRankings) {
      for (const [commentId, rank] of rankings) {
        if (!commentRankSums.has(commentId)) {
          commentRankSums.set(commentId, { sum: 0, count: 0 });
        }
        const data = commentRankSums.get(commentId)!;
        data.sum += rank;
        data.count += 1;
      }
    }

    for (const [commentId, data] of commentRankSums) {
      teacherRankings[commentId] = Math.round(data.sum / data.count);
    }

    // Assemble ranking info for each comment
    for (const comment of commentsResult.results) {
      const commentId = comment.commentId as string;
      const teacherVoteRank = teacherRankings[commentId] || null;
      const settlementRank = comment.awardRank ? (comment.awardRank as number) : null;

      rankingsMap[commentId] = {
        commentId,
        userVoteRank: userRankings[commentId] || null,
        teacherVoteRank: teacherVoteRank,
        settlementRank: settlementRank // Use awardRank as settlement ranking
      };
    }

    return successResponse(rankingsMap);

  } catch (error) {
    console.error('Get stage comment rankings error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_STAGE_RANKINGS_FAILED', `Failed to get stage comment rankings: ${errorMessage}`);
  }
}

/**
 * Get comment ranking history for current user
 * Returns all historical comment ranking proposals for version timeline
 */
export async function getCommentRankingHistory(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // Get all user's comment ranking proposals for this stage, ordered chronologically
    const proposalsResult = await env.DB.prepare(`
      SELECT proposalId, rankingData, createdTime, metadata
      FROM commentrankingproposals
      WHERE projectId = ? AND stageId = ? AND authorEmail = ?
      ORDER BY createdTime ASC
    `).bind(projectId, stageId, userEmail).all();

    const proposals = proposalsResult.results || [];

    return successResponse({
      proposals,
      count: proposals.length
    });

  } catch (error) {
    console.error('Get comment ranking history error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_RANKING_HISTORY_FAILED', `Failed to get comment ranking history: ${errorMessage}`);
  }
}
