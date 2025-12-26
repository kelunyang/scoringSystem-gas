/**
 * @fileoverview Comment settlement analysis handlers
 * Handles comment settlement analysis with enriched data
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Get comment settlement analysis with enriched data
 * Requires stage to be in 'completed' status
 */
export async function getCommentSettlementAnalysis(
  env: Env,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    // 1. Check stage status from VIEW (auto-calculated)
    const stage = await env.DB.prepare(`
      SELECT status FROM stages_with_status
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', '階段不存在');
    }

    if (stage.status !== 'completed') {
      return errorResponse('STAGE_NOT_COMPLETED', '只有已完成的階段才能查看結算分析');
    }

    // 2. Get settlement data with comment and author info
    const settlementsResult = await env.DB.prepare(`
      SELECT
        cs.settlementDetailId,
        cs.commentId,
        cs.authorEmail,
        cs.finalRank,
        cs.studentScore,
        cs.teacherScore,
        cs.totalScore,
        cs.allocatedPoints,
        cs.rewardPercentage,
        c.content,
        u.displayName
      FROM commentsettlements cs
      INNER JOIN comments c ON c.commentId = cs.commentId
      LEFT JOIN users u ON u.userEmail = cs.authorEmail
      WHERE cs.projectId = ? AND cs.stageId = ?
      ORDER BY cs.finalRank ASC
    `).bind(projectId, stageId).all();

    if (!settlementsResult.results || settlementsResult.results.length === 0) {
      return successResponse({
        settlements: [],
        message: '本階段尚無評論結算資料'
      });
    }

    // 3. Enrich settlement data
    const enrichedSettlements = settlementsResult.results.map((settlement: any) => {
      const content = settlement.content as string;
      const preview = content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : '';

      return {
        settlementDetailId: settlement.settlementDetailId,
        commentId: settlement.commentId,
        authorEmail: settlement.authorEmail,
        authorName: settlement.displayName || settlement.authorEmail.split('@')[0],
        finalRank: settlement.finalRank,
        studentScore: settlement.studentScore,
        teacherScore: settlement.teacherScore,
        totalScore: settlement.totalScore,
        allocatedPoints: settlement.allocatedPoints,
        rewardPercentage: settlement.rewardPercentage,
        commentPreview: preview,
        commentContent: content
      };
    });

    // 4. Calculate summary statistics
    const totalAllocated = enrichedSettlements.reduce(
      (sum: number, s: any) => sum + (s.allocatedPoints || 0),
      0
    );

    const avgStudentScore = enrichedSettlements.reduce(
      (sum: number, s: any) => sum + (s.studentScore || 0),
      0
    ) / enrichedSettlements.length;

    const avgTeacherScore = enrichedSettlements.reduce(
      (sum: number, s: any) => sum + (s.teacherScore || 0),
      0
    ) / enrichedSettlements.length;

    return successResponse({
      settlements: enrichedSettlements,
      summary: {
        totalComments: enrichedSettlements.length,
        totalAllocated,
        avgStudentScore: Math.round(avgStudentScore * 100) / 100,
        avgTeacherScore: Math.round(avgTeacherScore * 100) / 100
      }
    });

  } catch (error) {
    console.error('Get comment settlement analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_SETTLEMENT_FAILED', `Failed to get settlement analysis: ${errorMessage}`);
  }
}

/**
 * Calculate comment rankings based on student and teacher votes
 * Used by settlement system
 *
 * @param studentVotes - Array of {commentId, rank} from student proposals
 * @param teacherVotes - Array of {commentId, rank} from teacher rankings
 * @param studentWeight - Weight for student ranking (0-1, default 0.7)
 * @param teacherWeight - Weight for teacher ranking (0-1, default 0.3)
 * @returns Sorted array of {commentId, totalScore, studentScore, teacherScore}
 */
export function calculateCommentRankings(
  studentVotes: Array<{ commentId: string; rank: number }>,
  teacherVotes: Array<{ commentId: string; rank: number }>,
  studentWeight: number = 0.7,
  teacherWeight: number = 0.3
): Array<{ commentId: string; totalScore: number; studentScore: number; teacherScore: number }> {

  // Aggregate scores by comment
  const scoresMap = new Map<string, { studentScore: number; teacherScore: number; studentCount: number; teacherCount: number }>();

  // Process student votes (convert rank to score: 1st = 10 points, 10th = 1 point)
  for (const vote of studentVotes) {
    const score = 11 - vote.rank; // rank 1 = 10 points, rank 10 = 1 point
    const existing = scoresMap.get(vote.commentId) || { studentScore: 0, teacherScore: 0, studentCount: 0, teacherCount: 0 };
    existing.studentScore += score;
    existing.studentCount += 1;
    scoresMap.set(vote.commentId, existing);
  }

  // Process teacher votes
  for (const vote of teacherVotes) {
    const score = 11 - vote.rank;
    const existing = scoresMap.get(vote.commentId) || { studentScore: 0, teacherScore: 0, studentCount: 0, teacherCount: 0 };
    existing.teacherScore += score;
    existing.teacherCount += 1;
    scoresMap.set(vote.commentId, existing);
  }

  // Calculate weighted total scores
  const results: Array<{ commentId: string; totalScore: number; studentScore: number; teacherScore: number }> = [];

  for (const [commentId, scores] of scoresMap.entries()) {
    // Average scores
    const avgStudentScore = scores.studentCount > 0 ? scores.studentScore / scores.studentCount : 0;
    const avgTeacherScore = scores.teacherCount > 0 ? scores.teacherScore / scores.teacherCount : 0;

    // Weighted total (using configurable weights)
    const totalScore = (avgStudentScore * studentWeight) + (avgTeacherScore * teacherWeight);

    results.push({
      commentId,
      totalScore: Math.round(totalScore * 100) / 100,
      studentScore: Math.round(avgStudentScore * 100) / 100,
      teacherScore: Math.round(avgTeacherScore * 100) / 100
    });
  }

  // Sort by total score descending
  results.sort((a, b) => b.totalScore - a.totalScore);

  return results;
}
