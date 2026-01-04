/**
 * @fileoverview Teacher Comprehensive Vote Handler
 * Handles teacher voting for both submissions and comments
 * Uses shared validation utilities to enforce identity restrictions
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { validateSubmissionEligibility, validateSubmissionRankingData } from '../../utils/submissionVotingUtils';
import { validateCommentEligibility, validateRankingData } from '../../utils/commentVotingUtils';
import { generateId } from '../../utils/id-generator';
import { logProjectOperation, logApiAction } from '../../utils/logging';
import { getEffectiveScoringConfig } from '../../utils/scoring-config';

interface RankingItem {
  type: 'submission' | 'comment';
  targetId: string;
  rank: number;
  groupId?: string;      // For submissions
  authorEmail?: string;  // For comments
}

interface ComprehensiveVoteRequest {
  rankings: {
    submissions: RankingItem[];
    comments: RankingItem[];
  };
}

/**
 * Submit teacher comprehensive vote (submissions + comments)
 * Teachers can vote independently on submissions and comments
 */
export async function submitTeacherComprehensiveVote(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  requestData: ComprehensiveVoteRequest
): Promise<Response> {
  try {
    const { rankings } = requestData;
    const now = Date.now();

    // Load scoring configuration (for dynamic maxCommentSelections)
    const scoringConfig = await getEffectiveScoringConfig(env.DB, env.KV, env, projectId);
    const maxCommentSelections = scoringConfig.maxCommentSelections;

    // Verify user is a teacher
    const teacherCheck = await env.DB.prepare(`
      SELECT role
      FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND role = 'teacher'
    `).bind(projectId, userEmail).first();

    if (!teacherCheck) {
      return errorResponse('NOT_AUTHORIZED', '只有教師可以提交綜合投票');
    }

    // ========== DEDUPLICATION: Prevent duplicate teacher votes ==========
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `teacher_ranking:${projectId}:${stageId}:${userEmail}:${timeBucket}`;

    // Get userId for logging
    const userResult = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();
    const userId = userResult?.userId as string | undefined;

    // Check if this vote action is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'teacher_ranking_submit',
      userId,
      projectId,
      entityType: 'stage',
      entityId: stageId,
      message: `Teacher ${userEmail} submitted comprehensive ranking for stage ${stageId}`,
      context: {
        projectId,
        stageId,
        teacherEmail: userEmail,
        submissionRankingsCount: rankings.submissions?.length || 0,
        commentRankingsCount: rankings.comments?.length || 0,
        timeBucket
      },
      relatedEntities: {
        stage: stageId
      }
    });

    // If duplicate vote detected, return success (idempotent behavior)
    if (!isNewAction) {
      console.log(`[submitTeacherComprehensiveVote] Duplicate vote prevented: ${dedupKey}`);

      // Find most recent teacher rankings
      const recentSubmissionRankings = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM teachersubmissionrankings
        WHERE projectId = ? AND stageId = ? AND teacherEmail = ?
        ORDER BY createdTime DESC
        LIMIT 10
      `).bind(projectId, stageId, userEmail).first();

      const recentCommentRankings = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM teachercommentrankings
        WHERE projectId = ? AND stageId = ? AND teacherEmail = ?
        ORDER BY createdTime DESC
        LIMIT 10
      `).bind(projectId, stageId, userEmail).first();

      return new Response(JSON.stringify({
        success: true,
        message: 'Teacher ranking already recorded (duplicate prevented)',
        data: {
          deduped: true,
          submissionRankingsCount: recentSubmissionRankings?.count || 0,
          commentRankingsCount: recentCommentRankings?.count || 0
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    const submissionRankings = rankings.submissions || [];
    const commentRankings = rankings.comments || [];

    // === Process Submission Rankings ===
    if (submissionRankings.length > 0) {
      // Validate submission ranking data format
      const submissionValidation = validateSubmissionRankingData(submissionRankings);
      if (!submissionValidation.valid) {
        return errorResponse('INVALID_SUBMISSION_RANKING', submissionValidation.error || '成果排名資料格式錯誤');
      }

      // Validate each submission (teachers don't exclude any group)
      for (const item of submissionRankings) {
        const validation = await validateSubmissionEligibility(
          env.DB,
          projectId,
          item.targetId
          // No excludeGroupId for teachers - they can rank all groups
        );

        if (!validation.valid) {
          return errorResponse('INVALID_SUBMISSION', validation.error || '成果不符合排名資格');
        }
      }

      // Insert new submission rankings (multi-version support: append instead of delete+insert)
      for (const item of submissionRankings) {
        const teacherRankingId = generateId('tsubrank');
        await env.DB.prepare(`
          INSERT INTO teachersubmissionrankings (
            teacherRankingId, projectId, stageId, submissionId,
            groupId, teacherEmail, rank, createdTime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          teacherRankingId,
          projectId,
          stageId,
          item.targetId,
          item.groupId,
          userEmail,
          item.rank,
          now
        ).run();
      }

      console.log(`✅ [submitTeacherComprehensiveVote] Saved ${submissionRankings.length} submission rankings`);

      // Log teacher submission voting event
      try {
        await logProjectOperation(env, userEmail, projectId, 'teacher_submission_voted', 'stage', stageId, {
          submissionCount: submissionRankings.length,
          submissions: submissionRankings.map(r => ({
            submissionId: r.targetId,
            groupId: r.groupId,
            rank: r.rank
          }))
        });
      } catch (logError) {
        console.error('[submitTeacherComprehensiveVote] Failed to log submission voting:', logError);
      }
    }

    // === Process Comment Rankings ===
    if (commentRankings.length > 0) {
      // Business rule: Teachers can rank maximum N comments (configurable via maxCommentSelections)
      if (commentRankings.length > maxCommentSelections) {
        return errorResponse('TOO_MANY_COMMENTS', `教師最多只能排名${maxCommentSelections}個評論`);
      }

      // Validate comment ranking data format
      const commentValidation = validateRankingData(
        commentRankings.map(r => ({ commentId: r.targetId, rank: r.rank }))
      );
      if (!commentValidation.valid) {
        return errorResponse('INVALID_COMMENT_RANKING', commentValidation.error || '評論排名資料格式錯誤');
      }

      // Business rule: All comment ranks must be within top N (configurable)
      for (const item of commentRankings) {
        if (item.rank > maxCommentSelections) {
          return errorResponse('INVALID_RANK', `所有評論排名必須在前${maxCommentSelections}名內（1-${maxCommentSelections}）`);
        }
      }

      // Track authors to prevent duplicate authors in rankings
      const votedAuthors = new Set<string>();

      // Validate each comment using shared utility
      for (const item of commentRankings) {
        const validation = await validateCommentEligibility(
          env.DB,
          projectId,
          item.targetId,
          userEmail  // Teachers also can't vote for their own comments
        );

        if (!validation.valid) {
          return errorResponse('INVALID_COMMENT', validation.error || '評論不符合排名資格');
        }

        // Check for duplicate author
        const author = validation.comment.authorEmail as string;
        if (votedAuthors.has(author)) {
          return errorResponse('DUPLICATE_AUTHOR', `不可重複投票給同一作者：${author}`);
        }
        votedAuthors.add(author);
      }

      // Insert new comment rankings (multi-version support: append instead of delete+insert)
      for (const item of commentRankings) {
        const rankingId = generateId('tcmtrank');
        await env.DB.prepare(`
          INSERT INTO teachercommentrankings (
            rankingId, projectId, stageId, commentId,
            authorEmail, teacherEmail, rank, createdTime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          rankingId,
          projectId,
          stageId,
          item.targetId,
          item.authorEmail,
          userEmail,
          item.rank,
          now
        ).run();
      }

      console.log(`✅ [submitTeacherComprehensiveVote] Saved ${commentRankings.length} comment rankings`);

      // Log teacher comment voting event
      try {
        await logProjectOperation(env, userEmail, projectId, 'teacher_comment_voted', 'stage', stageId, {
          commentCount: commentRankings.length,
          comments: commentRankings.map(r => ({
            commentId: r.targetId,
            authorEmail: r.authorEmail,
            rank: r.rank
          }))
        });
      } catch (logError) {
        console.error('[submitTeacherComprehensiveVote] Failed to log comment voting:', logError);
      }
    }

    return successResponse({
      message: '教師投票已成功提交',
      submissionCount: submissionRankings.length,
      commentCount: commentRankings.length,
      timestamp: now
    });

  } catch (error: any) {
    console.error('❌ [submitTeacherComprehensiveVote] Error:', error);

    // Handle SUDO mode write blocked error (check both name and message for robustness)
    if (error?.name === 'SudoWriteBlockedError' || error?.message?.includes('SUDO_NO_WRITE')) {
      return errorResponse('SUDO_NO_WRITE', 'SUDO 模式為唯讀，無法進行寫入操作');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('SUBMIT_VOTE_FAILED', `Failed to submit teacher comprehensive vote: ${errorMessage}`);
  }
}
