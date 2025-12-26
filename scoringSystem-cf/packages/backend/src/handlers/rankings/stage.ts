/**
 * Rankings Handler - Stage Rankings
 * Migrated from GAS scripts/submissions_api.js getStageRankings()
 *
 * Returns voting rankings for a stage:
 * - teacherRank: Teacher/PM assigned ranks
 * - voteRank: User's group voting ranks
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Get stage rankings (teacher ranks + user group's vote ranks)
 */
export async function getStageRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  try {
    console.log(`🚀 [getStageRankings] Starting: projectId=${projectId}, stageId=${stageId}, userEmail=${userEmail}`);

    // Check if user is Global PM (can access all projects)
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%create_project%'
    `).bind(userEmail).first();

    const isGlobalPM = !!globalPMCheck;
    console.log(`🔍 [getStageRankings] Is Global PM:`, isGlobalPM);

    // Check project access (if not Global PM)
    if (!isGlobalPM) {
      // Check if user is project member OR project viewer
      const projectAccess = await env.DB.prepare(`
        SELECT 'member' as accessType FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND isActive = 1
        UNION
        SELECT 'viewer' as accessType FROM projectviewers
        WHERE userEmail = ? AND projectId = ?
        LIMIT 1
      `).bind(userEmail, projectId, userEmail, projectId).first();

      console.log(`🔍 [getStageRankings] Project access check result:`, projectAccess);

      if (!projectAccess) {
        console.log(`❌ [getStageRankings] Access denied for user ${userEmail} to project ${projectId}`);
        return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view rankings');
      }

      console.log(`✅ [getStageRankings] User has access as: ${projectAccess.accessType}`);
    }

    console.log(`✅ [getStageRankings] Permission check passed`);

    // Get current user's group IDs
    const userGroupsResult = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).all();

    const currentUserGroupIds = (userGroupsResult.results || []).map((ug: any) => ug.groupId);
    console.log(`🔍 [getStageRankings] User groups:`, currentUserGroupIds);

    const rankings: Record<string, any> = {};

    // 1. Get teacher rankings (from TeacherSubmissionRankings) with metadata
    // Each teacher may have multiple versions; we only keep the latest per teacher
    const teacherRankingsResult = await env.DB.prepare(`
      SELECT
        tsr.groupId,
        tsr.rank,
        tsr.createdTime,
        tsr.teacherEmail,
        tsr.teacherRankingId,
        u.displayName as teacherDisplayName
      FROM teachersubmissionrankings tsr
      LEFT JOIN users u ON tsr.teacherEmail = u.userEmail
      WHERE tsr.stageId = ? AND tsr.projectId = ?
      ORDER BY tsr.teacherEmail ASC, tsr.createdTime DESC
    `).bind(stageId, projectId).all();

    const teacherRankingsRaw = teacherRankingsResult.results || [];
    console.log(`🔍 [getStageRankings] Teacher rankings count: ${teacherRankingsRaw.length}`);

    // Aggregate: Keep only latest version per teacher
    const teacherLatestRankings = new Map<string, Map<string, { rank: number; metadata: any }>>();
    const teacherLatestTime = new Map<string, number>();

    for (const tsr of teacherRankingsRaw) {
      const teacherEmail = tsr.teacherEmail as string;
      const groupId = tsr.groupId as string;
      const rank = tsr.rank as number;
      const createdTime = tsr.createdTime as number;

      // Initialize teacher's latest time
      if (!teacherLatestTime.has(teacherEmail)) {
        teacherLatestTime.set(teacherEmail, createdTime);
        teacherLatestRankings.set(teacherEmail, new Map());
      }

      // Only keep records with same createdTime (same submission)
      if (teacherLatestTime.get(teacherEmail) === createdTime) {
        teacherLatestRankings.get(teacherEmail)!.set(groupId, {
          rank,
          metadata: {
            createdTime,
            teacherEmail,
            teacherDisplayName: tsr.teacherDisplayName || (teacherEmail?.split('@')[0]) || 'Unknown',
            teacherRankingId: tsr.teacherRankingId
          }
        });
      }
    }

    // Aggregate all teachers' rankings to average
    const groupRankSums = new Map<string, { sum: number; count: number; latestMetadata: any }>();

    for (const [, groupRankings] of teacherLatestRankings) {
      for (const [groupId, data] of groupRankings) {
        if (!groupRankSums.has(groupId)) {
          groupRankSums.set(groupId, { sum: 0, count: 0, latestMetadata: data.metadata });
        }
        const existing = groupRankSums.get(groupId)!;
        existing.sum += data.rank;
        existing.count += 1;
        // Keep the latest metadata (by createdTime)
        if (data.metadata.createdTime > existing.latestMetadata.createdTime) {
          existing.latestMetadata = data.metadata;
        }
      }
    }

    // Build final rankings with averaged rank
    for (const [groupId, data] of groupRankSums) {
      if (!rankings[groupId]) {
        rankings[groupId] = {};
      }
      rankings[groupId].teacherRank = {
        rank: Math.round(data.sum / data.count),
        ...data.latestMetadata
      };
    }

    // 2. Get user group's vote rankings (from RankingProposals) with metadata
    if (currentUserGroupIds.length > 0) {
      // Find the latest ranking proposal from user's group for this stage
      // Build dynamic SQL with proper placeholders
      const placeholders = currentUserGroupIds.map(() => '?').join(',');
      const sql = `
        SELECT
          rp.proposalId,
          rp.groupId,
          rp.rankingData,
          rp.status,
          rp.votingResult,
          rp.createdTime,
          rp.proposerEmail,
          u.displayName as proposerDisplayName
        FROM rankingproposals_with_status rp
        LEFT JOIN users u ON rp.proposerEmail = u.userEmail
        JOIN usergroups ug ON ug.userEmail = rp.proposerEmail AND ug.projectId = rp.projectId
        WHERE rp.stageId = ?
          AND rp.projectId = ?
          AND rp.status IN ('pending', 'approved')
          AND ug.groupId IN (${placeholders})
          AND ug.isActive = 1
        ORDER BY rp.createdTime DESC
        LIMIT 1
      `;

      const proposalsResult = await env.DB.prepare(sql)
        .bind(stageId, projectId, ...currentUserGroupIds)
        .first();

      if (proposalsResult) {
        console.log(`🔍 [getStageRankings] Found proposal: ${proposalsResult.proposalId}`);

        try {
          const rankingData = JSON.parse((proposalsResult.rankingData as string) || '[]');

          // Store proposal metadata for reference
          const proposalMetadata = {
            status: proposalsResult.status,
            votingResult: proposalsResult.votingResult,
            createdTime: proposalsResult.createdTime,
            proposerEmail: proposalsResult.proposerEmail,
            proposerDisplayName: proposalsResult.proposerDisplayName || (proposalsResult.proposerEmail as string | undefined)?.split('@')[0] || 'Unknown',
            proposalId: proposalsResult.proposalId
          };

          // Handle array format: [{rank: 1, groupId: "grp_xxx"}]
          if (Array.isArray(rankingData)) {
            rankingData.forEach((item: any) => {
              if (item.groupId && item.rank) {
                if (!rankings[item.groupId]) {
                  rankings[item.groupId] = {};
                }
                rankings[item.groupId].voteRank = {
                  rank: item.rank,
                  ...proposalMetadata
                };
              }
            });
          }
          // Handle object format: { "grp_xxx": 1 }
          else if (typeof rankingData === 'object') {
            Object.entries(rankingData).forEach(([groupId, rank]) => {
              if (!rankings[groupId]) {
                rankings[groupId] = {};
              }
              rankings[groupId].voteRank = {
                rank: rank as number,
                ...proposalMetadata
              };
            });
          }
        } catch (parseError) {
          console.error(`❌ [getStageRankings] Failed to parse ranking data:`, parseError);
        }
      } else {
        console.log(`🔍 [getStageRankings] No proposals found for user groups`);
      }
    }

    console.log(`✅ [getStageRankings] Rankings collected:`, Object.keys(rankings).length, 'groups');

    return successResponse({
      rankings
    });

  } catch (error) {
    console.error('❌ [getStageRankings] Error:', error);
    console.error('❌ [getStageRankings] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', `Failed to get stage rankings: ${errorMessage}`);
  }
}
