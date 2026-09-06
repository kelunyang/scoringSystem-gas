/**
 * Rankings Handler - Teacher Vote History
 * Returns teacher's voting history for a specific stage
 *
 * Used by TeacherVoteModal.vue to show:
 * - Whether teacher has voted before
 * - How many times they've voted (versions)
 * - Latest vote details (count and timestamp)
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

interface VoteHistorySummary {
  totalVersions: number;
  latestRankingCount: number;
  createdTime: number;
}

interface TeacherVoteHistoryResponse {
  displayName: string;
  submissionRanking: VoteHistorySummary | null;
  commentRanking: VoteHistorySummary | null;
}

/**
 * Get teacher's voting history for a stage
 */
export async function getTeacherVoteHistory(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    console.log(`🎓 [getTeacherVoteHistory] Starting: projectId=${projectId}, stageId=${stageId}, userEmail=${userEmail}`);

    // Get user's display name
    const userResult = await env.DB.prepare(`
      SELECT displayName
      FROM users
      WHERE userEmail = ?
    `).bind(userEmail).first();

    const displayName = userResult?.displayName || userEmail;

    // Initialize response
    const response: TeacherVoteHistoryResponse = {
      displayName: displayName as string,
      submissionRanking: null,
      commentRanking: null
    };

    // === Get Submission Ranking History ===

    // Get all distinct voting timestamps (versions) for submissions
    const submissionVersionsResult = await env.DB.prepare(`
      SELECT DISTINCT createdTime
      FROM teachersubmissionrankings
      WHERE projectId = ? AND stageId = ? AND teacherEmail = ?
      ORDER BY createdTime DESC
    `).bind(projectId, stageId, userEmail).all<{ createdTime: number }>();

    const submissionVersions = submissionVersionsResult.results || [];
    console.log(`📊 [getTeacherVoteHistory] Submission versions count: ${submissionVersions.length}`);

    if (submissionVersions.length > 0) {
      // Get the latest voting timestamp
      const latestSubmissionTime = submissionVersions[0].createdTime;

      // Get count of submissions ranked in the latest version
      const latestSubmissionCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM teachersubmissionrankings
        WHERE projectId = ?
          AND stageId = ?
          AND teacherEmail = ?
          AND createdTime = ?
      `).bind(projectId, stageId, userEmail, latestSubmissionTime).first();

      const latestSubmissionCount = (latestSubmissionCountResult?.count as number) || 0;

      response.submissionRanking = {
        totalVersions: submissionVersions.length,
        latestRankingCount: latestSubmissionCount,
        createdTime: latestSubmissionTime
      };

      console.log(`✅ [getTeacherVoteHistory] Submission ranking:`, response.submissionRanking);
    } else {
      console.log(`ℹ️ [getTeacherVoteHistory] No submission rankings found`);
    }

    // === Get Comment Ranking History ===

    // Get all distinct voting timestamps (versions) for comments
    const commentVersionsResult = await env.DB.prepare(`
      SELECT DISTINCT createdTime
      FROM teachercommentrankings
      WHERE projectId = ? AND stageId = ? AND teacherEmail = ?
      ORDER BY createdTime DESC
    `).bind(projectId, stageId, userEmail).all<{ createdTime: number }>();

    const commentVersions = commentVersionsResult.results || [];
    console.log(`💬 [getTeacherVoteHistory] Comment versions count: ${commentVersions.length}`);

    if (commentVersions.length > 0) {
      // Get the latest voting timestamp
      const latestCommentTime = commentVersions[0].createdTime;

      // Get count of comments ranked in the latest version
      const latestCommentCountResult = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM teachercommentrankings
        WHERE projectId = ?
          AND stageId = ?
          AND teacherEmail = ?
          AND createdTime = ?
      `).bind(projectId, stageId, userEmail, latestCommentTime).first();

      const latestCommentCount = (latestCommentCountResult?.count as number) || 0;

      response.commentRanking = {
        totalVersions: commentVersions.length,
        latestRankingCount: latestCommentCount,
        createdTime: latestCommentTime
      };

      console.log(`✅ [getTeacherVoteHistory] Comment ranking:`, response.commentRanking);
    } else {
      console.log(`ℹ️ [getTeacherVoteHistory] No comment rankings found`);
    }

    console.log(`✅ [getTeacherVoteHistory] Complete response:`, response);

    return successResponse(response);

  } catch (error) {
    console.error('❌ [getTeacherVoteHistory] Error:', error);
    console.error('❌ [getTeacherVoteHistory] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', `Failed to get teacher vote history: ${errorMessage}`);
  }
}
