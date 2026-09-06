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
/** commentsettlements JOIN 出來的一列，用於結算明細。 */
interface CommentSettlementDetailRow {
  commentId: string;
  authorEmail: string;
  finalRank: number;
  studentScore: number;
  teacherScore: number;
  totalScore: number;
  allocatedPoints: number;
  rewardPercentage: number;
  [column: string]: unknown;
}

export async function getCommentSettlementAnalysis(
  env: Env,
  projectId: string,
  stageId: string
) {
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
    `).bind(projectId, stageId).all<CommentSettlementDetailRow>();

    if (!settlementsResult.results || settlementsResult.results.length === 0) {
      return successResponse({
        settlements: [],
        message: '本階段尚無評論結算資料'
      });
    }

    // 3. Enrich settlement data
    const enrichedSettlements = settlementsResult.results.map(settlement => {
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
      (sum, s) => sum + (s.allocatedPoints || 0),
      0
    );

    const avgStudentScore = enrichedSettlements.reduce(
      (sum, s) => sum + (s.studentScore || 0),
      0
    ) / enrichedSettlements.length;

    const avgTeacherScore = enrichedSettlements.reduce(
      (sum, s) => sum + (s.teacherScore || 0),
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
