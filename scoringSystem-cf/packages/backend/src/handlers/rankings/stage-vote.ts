/**
 * @fileoverview Individual stage ranking vote handler
 * Allows students to submit their personal rankings for groups in a stage
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { logApiAction } from '../../utils/logging';

/**
 * Submit individual stage ranking vote
 * Permission: Level 3-4 (Active group members only)
 */
export async function submitStageRankingVote(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    projectId: string;
    stageId: string;
    rankings: Array<{ groupId: string; rank: number }>;
  }
): Promise<Response> {
  const { userEmail, userId } = context;
  const { projectId, stageId, rankings } = requestData;

  try {
    // Validate required fields
    if (!projectId || !stageId || !rankings || !Array.isArray(rankings)) {
      return errorResponse('MISSING_FIELDS', 'Missing required fields: projectId, stageId, rankings (array)');
    }

    // Permission Check: Must be active group member in this project
    const membership = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (!membership) {
      return errorResponse('NOT_GROUP_MEMBER', 'Only project group members can submit rankings');
    }

    // Verify stage exists and belongs to project
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status, config FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found in this project');
    }

    // Check if voting is allowed for this stage
    const stageConfig = stage.config ? JSON.parse(stage.config as string) : {};
    if (stageConfig.allowStudentVoting === false) {
      return errorResponse('VOTING_NOT_ALLOWED', 'Student voting is not enabled for this stage');
    }

    // Validate rankings data
    if (rankings.length === 0) {
      return errorResponse('EMPTY_RANKINGS', 'Rankings array cannot be empty');
    }

    // Check for duplicate ranks
    const ranks = rankings.map(r => r.rank);
    const uniqueRanks = new Set(ranks);
    if (ranks.length !== uniqueRanks.size) {
      return errorResponse('DUPLICATE_RANKS', 'Each group must have a unique rank');
    }

    // Verify all groups exist in the project
    const groupIds = rankings.map(r => r.groupId);
    const groupPlaceholders = groupIds.map(() => '?').join(',');
    const groupsExist = await env.DB.prepare(`
      SELECT groupId FROM groups
      WHERE projectId = ? AND groupId IN (${groupPlaceholders})
    `).bind(projectId, ...groupIds).all();

    if (groupsExist.results.length !== groupIds.length) {
      return errorResponse('INVALID_GROUPS', 'One or more groups do not exist in this project');
    }

    // ========== DEDUPLICATION: Prevent duplicate stage votes ==========
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `stage_vote:${stageId}:${userId}:${timeBucket}`;

    // Check if this vote action is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'stage_ranking_vote',
      userId,
      projectId,
      entityType: 'stage',
      entityId: stageId,
      message: `User ${userEmail} submitted stage ranking vote for stage ${stageId}`,
      context: {
        stageId,
        groupId: membership.groupId,
        voterEmail: userEmail,
        rankingsCount: rankings.length,
        timeBucket
      },
      relatedEntities: {
        stage: stageId,
        group: membership.groupId as string
      }
    });

    // If duplicate vote detected, return success with existing vote (idempotent behavior)
    if (!isNewAction) {
      console.log(`[submitStageRankingVote] Duplicate vote prevented: ${dedupKey}`);

      // Find existing vote
      const existingVote = await env.DB.prepare(`
        SELECT proposalId, rankingData, lastModified FROM rankings
        WHERE stageId = ? AND proposerUserId = ?
      `).bind(stageId, userId).first();

      return new Response(JSON.stringify({
        success: true,
        message: 'Stage ranking vote already recorded (duplicate prevented)',
        data: {
          deduped: true,
          proposalId: existingVote?.proposalId || 'unknown',
          stageId,
          action: 'deduped'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    // ========== UPSERT: Replace check-then-act with atomic UPSERT ==========
    // This prevents race conditions between checking and inserting/updating
    // Generate proposalId upfront (will be used for INSERT, ignored for UPDATE)
    const proposalId = generateId('rnk');
    const rankingDataJson = JSON.stringify(rankings);

    // Use INSERT ... ON CONFLICT ... DO UPDATE for atomic upsert
    // SQLite will atomically check if (stageId, proposerUserId) exists:
    // - If exists: UPDATE rankingData and lastModified
    // - If not exists: INSERT new record
    const upsertResult = await env.DB.prepare(`
      INSERT INTO rankings (
        proposalId, stageId, groupId, proposerUserId,
        rankingData, status, createdAt, lastModified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stageId, proposerUserId)
      DO UPDATE SET
        rankingData = excluded.rankingData,
        lastModified = excluded.lastModified,
        status = 'submitted'
    `).bind(
      proposalId,
      stageId,
      membership.groupId as string,
      userId,
      rankingDataJson,
      'submitted',
      now,
      now
    ).run();

    // Determine if this was an insert or update based on changes count
    // Note: D1's meta.changes includes both INSERT and UPDATE operations
    const wasUpdate = upsertResult.meta.changes > 0;

    // Fetch the actual proposalId (in case of UPDATE, it's the existing one)
    const finalVote = await env.DB.prepare(`
      SELECT proposalId FROM rankings
      WHERE stageId = ? AND proposerUserId = ?
    `).bind(stageId, userId).first();

    return successResponse({
      message: wasUpdate ? 'Ranking vote updated successfully' : 'Ranking vote submitted successfully',
      proposalId: finalVote?.proposalId || proposalId,
      stageId,
      action: wasUpdate ? 'updated' : 'created'
    });

  } catch (error) {
    console.error('Submit stage ranking vote error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('VOTE_FAILED', `Failed to submit ranking vote: ${errorMessage}`);
  }
}
