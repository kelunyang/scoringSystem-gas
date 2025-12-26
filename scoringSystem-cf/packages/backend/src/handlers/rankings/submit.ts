/**
 * @fileoverview Group ranking proposal submission handler
 * Allows active group members (Level 3-4) to submit ranking proposals for their stage
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { logApiAction, logProjectOperation } from '../../utils/logging';

/**
 * Submit a group ranking proposal
 * Permission: Level 3-4 (Active group members only)
 */
export async function submitGroupRanking(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    projectId: string;
    stageId: string;
    rankingData: any;
  }
): Promise<Response> {
  const { userEmail } = context;
  const { projectId, stageId, rankingData } = requestData;

  try {
    // Validate required fields
    if (!projectId || !stageId || !rankingData) {
      return errorResponse('MISSING_FIELDS', 'Missing required fields: projectId, stageId, rankingData');
    }

    // Permission Check: Must be active group member in this project (Level 3-4)
    const membership = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (!membership) {
      return errorResponse('NOT_GROUP_MEMBER', 'Only project group members can submit rankings');
    }

    const groupId = membership.groupId as string;

    // Verify stage exists and belongs to project
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found in this project');
    }

    // Check if stage is in appropriate status for ranking
    if (stage.status !== 'active' && stage.status !== 'voting') {
      return errorResponse('STAGE_NOT_ACTIVE', 'Cannot submit rankings for inactive stages');
    }

    // Check if group already has a settled proposal
    // CRITICAL: Groups cannot submit new proposals once one is settled
    const settledProposal = await env.DB.prepare(`
      SELECT proposalId FROM rankingproposals_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ? AND status = 'settled'
    `).bind(projectId, stageId, groupId).first();

    if (settledProposal) {
      return errorResponse(
        'SETTLED_PROPOSAL_EXISTS',
        'Your group already has a settled proposal for this stage. Cannot submit a new one.',
        400
      );
    }

    // ========== DEDUPLICATION: Prevent duplicate proposal submissions ==========
    // Generate dedupKey with 60-second time bucket to prevent network retry duplicates
    // Include userEmail to allow multiple group members to submit proposals
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `ranking_submit:${projectId}:${stageId}:${groupId}:${userEmail}:${timeBucket}`;

    // Check if this proposal submission is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'ranking_proposal_submit',
      userId: context.userId,
      projectId,
      entityType: 'ranking_proposal',
      entityId: '',  // Will be set after creation
      message: `Group ${groupId} submitted ranking proposal for stage ${stageId}`,
      context: {
        projectId,
        stageId,
        groupId,
        proposerEmail: userEmail,
        timeBucket,
        rankingItemsCount: Array.isArray(rankingData) ? rankingData.length : 0
      },
      relatedEntities: {
        stage: stageId,
        group: groupId
      }
    });

    // If duplicate submission detected, return success with existing proposal ID (idempotent behavior)
    if (!isNewAction) {
      console.log(`[submitGroupRanking] Duplicate submission prevented: ${dedupKey}`);

      // Find existing proposal submitted within the same time bucket
      const recentProposal = await env.DB.prepare(`
        SELECT proposalId, status, createdTime FROM rankingproposals_with_status
        WHERE projectId = ? AND stageId = ? AND groupId = ?
        ORDER BY createdTime DESC
        LIMIT 1
      `).bind(projectId, stageId, groupId).first();

      return new Response(JSON.stringify({
        success: true,
        message: 'Ranking proposal already submitted (duplicate prevented)',
        data: {
          deduped: true,
          proposalId: recentProposal?.proposalId || 'unknown',
          groupId,
          stageId,
          status: recentProposal?.status || 'pending'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    // Check if proposal already exists with pending status
    // Allow multiple proposals (multi-version support) except when approved
    // Only check for 'pending' status (not 'reset', 'rejected', or 'withdrawn')
    // This enables vote reset feature and resubmission after rejection
    const existingProposal = await env.DB.prepare(`
      SELECT proposalId FROM rankingproposals_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ? AND status = 'pending'
    `).bind(projectId, stageId, groupId).first();

    if (existingProposal) {
      return errorResponse('PROPOSAL_EXISTS', 'Your group already has an active ranking proposal for this stage');
    }

    // Validate ranking data structure
    if (typeof rankingData !== 'object' || Array.isArray(rankingData) === false) {
      return errorResponse('INVALID_RANKING_DATA', 'Ranking data must be an array');
    }

    // Validate that all submissions in rankingData are approved
    // This prevents users from including non-approved submissions in their rankings
    for (const item of rankingData) {
      if (item.submissionId) {
        const submission = await env.DB.prepare(`
          SELECT status, groupId FROM submissions_with_status
          WHERE submissionId = ? AND projectId = ? AND stageId = ?
        `).bind(item.submissionId, projectId, stageId).first();

        if (!submission) {
          return errorResponse(
            'INVALID_SUBMISSION',
            `Submission ${item.submissionId} does not exist in this stage`
          );
        }

        if (submission.status !== 'approved') {
          return errorResponse(
            'SUBMISSION_NOT_APPROVED',
            `Submission ${item.submissionId} is not approved (status: ${submission.status})`
          );
        }
      }
    }

    // Create new ranking proposal
    const proposalId = generateId('rkp');
    // Reuse 'now' from deduplication section (line 77)

    await env.DB.prepare(`
      INSERT INTO rankingproposals (
        proposalId, projectId, stageId, groupId, proposerEmail,
        rankingData, status, createdTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      proposalId,
      projectId,
      stageId,
      groupId,
      userEmail,
      JSON.stringify(rankingData),
      'pending',
      now
    ).run();

    // 记录排名提案创建到 eventlogs（让用户在 EventLogViewer 中看到）
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'ranking_proposal_created',
      'ranking_proposal',
      proposalId,
      {
        submissionCount: rankingData.length,
        submissionIds: rankingData.map((item: any) => item.submissionId).filter(Boolean),
        groupId,
        stageId,
        proposerEmail: userEmail,
        rankingPreview: rankingData.slice(0, 3).map((item: any) => ({
          submissionId: item.submissionId,
          rank: item.rank
        }))
      },
      {
        relatedEntities: {
          stage: stageId,
          group: groupId
        }
      }
    );

    return successResponse({
      message: 'Ranking proposal submitted successfully',
      proposalId,
      groupId,
      stageId,
      status: 'pending'
    });

  } catch (error) {
    console.error('❌ [submitGroupRanking] ERROR CAUGHT:', {
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      projectId,
      stageId,
      userEmail,
      rankingDataLength: Array.isArray(rankingData) ? rankingData.length : 'N/A'
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('SUBMIT_RANKING_FAILED', `Failed to submit ranking: ${errorMessage}`);
  }
}
