/**
 * Rankings Handler - Stage Rankings
 * Migrated from GAS scripts/submissions_api.js getStageRankings()
 *
 * Returns voting rankings for a stage:
 * - teacherRank: Teacher/PM assigned ranks
 * - voteRank: User's group voting ranks
 *
 * Batch API:
 * - getAllStagesRankings: Get rankings for multiple stages in one call
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Permission check result interface
 */
interface PermissionCheckResult {
  isGlobalPM: boolean;
  viewerRole: string | null;
  hasAccess: boolean;
  isTeacherOrObserver: boolean;
  currentUserGroupIds: string[];
}

/**
 * Shared permission check logic - extracted for reuse
 * Uses two separate queries to avoid SQLite CTE naming conflicts with 'usergroups' table
 */
async function checkUserPermissionAndGroups(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<PermissionCheckResult> {
  // Query 1: Get permission info
  const permissionResult = await env.DB.prepare(`
    SELECT
      CASE WHEN EXISTS (
        SELECT 1 FROM globalusergroups gu
        JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
        WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%create_project%'
      ) THEN 1 ELSE 0 END as isGlobalPM,
      (SELECT role FROM projectviewers WHERE userEmail = ? AND projectId = ?) as viewerRole,
      CASE WHEN EXISTS (
        SELECT 1 FROM usergroups WHERE userEmail = ? AND projectId = ? AND isActive = 1
        UNION SELECT 1 FROM projectviewers WHERE userEmail = ? AND projectId = ?
      ) THEN 1 ELSE 0 END as hasAccess
  `).bind(
    userEmail,                    // isGlobalPM check
    userEmail, projectId,         // viewerRole check
    userEmail, projectId,         // hasAccess check (usergroups)
    userEmail, projectId          // hasAccess check (projectviewers)
  ).first();

  // Query 2: Get user's group IDs
  const groupsResult = await env.DB.prepare(`
    SELECT GROUP_CONCAT(groupId) as groupIds
    FROM usergroups
    WHERE userEmail = ? AND projectId = ? AND isActive = 1
  `).bind(userEmail, projectId).first();

  const isGlobalPM = permissionResult?.isGlobalPM === 1;
  const viewerRole = permissionResult?.viewerRole as string | null;
  const hasAccess = permissionResult?.hasAccess === 1;
  const isTeacherOrObserver = isGlobalPM || viewerRole === 'teacher' || viewerRole === 'observer';

  // Parse group IDs from comma-separated string
  const groupIdsString = groupsResult?.groupIds as string | null;
  const currentUserGroupIds = groupIdsString ? groupIdsString.split(',') : [];

  return {
    isGlobalPM,
    viewerRole,
    hasAccess,
    isTeacherOrObserver,
    currentUserGroupIds
  };
}

/**
 * Get rankings for all stages in a project - Batch API
 * This reduces N API calls to 1, significantly improving load time
 *
 * @param env - Cloudflare environment
 * @param userEmail - User's email
 * @param projectId - Project ID
 * @param stageIds - Array of stage IDs to fetch rankings for
 * @returns Rankings for all requested stages
 */
export async function getAllStagesRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageIds: string[]
): Promise<Response> {
  try {
    console.log(`🚀 [getAllStagesRankings] Starting: projectId=${projectId}, stageCount=${stageIds.length}`);

    if (!stageIds.length) {
      return successResponse({ stageRankings: {} });
    }

    // Single permission check for all stages
    const permCheck = await checkUserPermissionAndGroups(env, userEmail, projectId);

    console.log(`🔍 [getAllStagesRankings] Permission check:`, {
      isGlobalPM: permCheck.isGlobalPM,
      hasAccess: permCheck.hasAccess,
      isTeacherOrObserver: permCheck.isTeacherOrObserver,
      groupCount: permCheck.currentUserGroupIds.length
    });

    if (!permCheck.isGlobalPM && !permCheck.hasAccess) {
      console.log(`❌ [getAllStagesRankings] Access denied for user ${userEmail}`);
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view rankings');
    }

    // Build stage ID placeholders for SQL IN clause
    const stagePlaceholders = stageIds.map(() => '?').join(',');

    // Batch query 1: Get all teacher rankings for all stages
    const teacherRankingsResult = await env.DB.prepare(`
      SELECT
        tsr.stageId,
        tsr.groupId,
        tsr.rank,
        tsr.createdTime,
        tsr.teacherEmail,
        tsr.teacherRankingId,
        u.displayName as teacherDisplayName
      FROM teachersubmissionrankings tsr
      LEFT JOIN users u ON tsr.teacherEmail = u.userEmail
      WHERE tsr.projectId = ? AND tsr.stageId IN (${stagePlaceholders})
      ORDER BY tsr.stageId, tsr.teacherEmail ASC, tsr.createdTime DESC
    `).bind(projectId, ...stageIds).all();

    const teacherRankingsRaw = teacherRankingsResult.results || [];
    console.log(`🔍 [getAllStagesRankings] Total teacher rankings: ${teacherRankingsRaw.length}`);

    // Batch query 2: Get user's group proposals for all stages (if user has groups)
    let proposalsRaw: any[] = [];
    if (permCheck.currentUserGroupIds.length > 0) {
      const groupPlaceholders = permCheck.currentUserGroupIds.map(() => '?').join(',');
      const proposalsResult = await env.DB.prepare(`
        SELECT
          rp.stageId,
          rp.proposalId,
          rp.groupId,
          rp.rankingData,
          rp.status,
          rp.votingResult,
          rp.createdTime,
          rp.proposerEmail,
          u.displayName as proposerDisplayName,
          ROW_NUMBER() OVER (PARTITION BY rp.stageId ORDER BY rp.createdTime DESC) as rn
        FROM rankingproposals_with_status rp
        LEFT JOIN users u ON rp.proposerEmail = u.userEmail
        JOIN usergroups ug ON ug.userEmail = rp.proposerEmail AND ug.projectId = rp.projectId
        WHERE rp.projectId = ?
          AND rp.stageId IN (${stagePlaceholders})
          AND rp.status IN ('pending', 'approved')
          AND ug.groupId IN (${groupPlaceholders})
          AND ug.isActive = 1
      `).bind(projectId, ...stageIds, ...permCheck.currentUserGroupIds).all();

      // Filter to keep only the latest proposal per stage (rn = 1)
      proposalsRaw = (proposalsResult.results || []).filter((p: any) => p.rn === 1);
    }
    console.log(`🔍 [getAllStagesRankings] User group proposals: ${proposalsRaw.length}`);

    // Batch query 3: Get proposal stats for teachers/observers
    let proposalStatsRaw: any[] = [];
    if (permCheck.isTeacherOrObserver) {
      const proposalStatsResult = await env.DB.prepare(`
        WITH ProposalCounts AS (
          SELECT
            stageId,
            groupId,
            COUNT(*) as versionCount
          FROM rankingproposals_with_status
          WHERE projectId = ? AND stageId IN (${stagePlaceholders})
          GROUP BY stageId, groupId
        ),
        LatestProposals AS (
          SELECT
            stageId,
            groupId,
            status,
            votingResult,
            ROW_NUMBER() OVER (PARTITION BY stageId, groupId ORDER BY createdTime DESC) as rn
          FROM rankingproposals_with_status
          WHERE projectId = ? AND stageId IN (${stagePlaceholders})
        )
        SELECT
          pc.stageId,
          pc.groupId,
          pc.versionCount,
          lp.status as latestStatus,
          lp.votingResult as latestVotingResult
        FROM ProposalCounts pc
        LEFT JOIN LatestProposals lp ON pc.stageId = lp.stageId AND pc.groupId = lp.groupId AND lp.rn = 1
      `).bind(projectId, ...stageIds, projectId, ...stageIds).all();

      proposalStatsRaw = proposalStatsResult.results || [];
    }
    console.log(`🔍 [getAllStagesRankings] Proposal stats: ${proposalStatsRaw.length}`);

    // Process results into stage-indexed structure
    const stageRankings: Record<string, Record<string, any>> = {};

    // Initialize empty rankings for each stage
    for (const stageId of stageIds) {
      stageRankings[stageId] = {};
    }

    // Process teacher rankings
    // Group by stageId -> teacherEmail -> groupId
    const teacherByStage = new Map<string, Map<string, Map<string, { rank: number; metadata: any }>>>();
    const teacherLatestTimeByStage = new Map<string, Map<string, number>>();

    for (const tsr of teacherRankingsRaw) {
      const stageId = tsr.stageId as string;
      const teacherEmail = tsr.teacherEmail as string;
      const groupId = tsr.groupId as string;
      const rank = tsr.rank as number;
      const createdTime = tsr.createdTime as number;

      if (!teacherByStage.has(stageId)) {
        teacherByStage.set(stageId, new Map());
        teacherLatestTimeByStage.set(stageId, new Map());
      }

      const teacherMap = teacherByStage.get(stageId)!;
      const timeMap = teacherLatestTimeByStage.get(stageId)!;

      if (!timeMap.has(teacherEmail)) {
        timeMap.set(teacherEmail, createdTime);
        teacherMap.set(teacherEmail, new Map());
      }

      if (timeMap.get(teacherEmail) === createdTime) {
        teacherMap.get(teacherEmail)!.set(groupId, {
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

    // Aggregate teacher rankings per stage
    for (const [stageId, teacherMap] of teacherByStage) {
      const groupRankSums = new Map<string, { sum: number; count: number; latestMetadata: any }>();

      for (const [, groupRankings] of teacherMap) {
        for (const [groupId, data] of groupRankings) {
          if (!groupRankSums.has(groupId)) {
            groupRankSums.set(groupId, { sum: 0, count: 0, latestMetadata: data.metadata });
          }
          const existing = groupRankSums.get(groupId)!;
          existing.sum += data.rank;
          existing.count += 1;
          if (data.metadata.createdTime > existing.latestMetadata.createdTime) {
            existing.latestMetadata = data.metadata;
          }
        }
      }

      for (const [groupId, data] of groupRankSums) {
        if (!stageRankings[stageId][groupId]) {
          stageRankings[stageId][groupId] = {};
        }
        stageRankings[stageId][groupId].teacherRank = {
          rank: Math.round(data.sum / data.count),
          ...data.latestMetadata
        };
      }
    }

    // Process user group proposals
    for (const proposal of proposalsRaw) {
      const stageId = proposal.stageId as string;
      try {
        const rankingData = JSON.parse((proposal.rankingData as string) || '[]');
        const proposalMetadata = {
          status: proposal.status,
          votingResult: proposal.votingResult,
          createdTime: proposal.createdTime,
          proposerEmail: proposal.proposerEmail,
          proposerDisplayName: proposal.proposerDisplayName || (proposal.proposerEmail as string)?.split('@')[0] || 'Unknown',
          proposalId: proposal.proposalId
        };

        if (Array.isArray(rankingData)) {
          rankingData.forEach((item: any) => {
            if (item.groupId && item.rank) {
              if (!stageRankings[stageId][item.groupId]) {
                stageRankings[stageId][item.groupId] = {};
              }
              stageRankings[stageId][item.groupId].voteRank = {
                rank: item.rank,
                ...proposalMetadata
              };
            }
          });
        } else if (typeof rankingData === 'object') {
          Object.entries(rankingData).forEach(([groupId, rank]) => {
            if (!stageRankings[stageId][groupId]) {
              stageRankings[stageId][groupId] = {};
            }
            stageRankings[stageId][groupId].voteRank = {
              rank: rank as number,
              ...proposalMetadata
            };
          });
        }
      } catch (e) {
        console.error(`Failed to parse ranking data for stage ${stageId}:`, e);
      }
    }

    // Process proposal stats for teachers/observers
    for (const stat of proposalStatsRaw) {
      const stageId = stat.stageId as string;
      const groupId = stat.groupId as string;
      if (!stageRankings[stageId][groupId]) {
        stageRankings[stageId][groupId] = {};
      }
      stageRankings[stageId][groupId].proposalStats = {
        versionCount: stat.versionCount as number,
        latestStatus: stat.latestStatus as string | null,
        latestVotingResult: stat.latestVotingResult as string | null
      };
    }

    console.log(`✅ [getAllStagesRankings] Completed for ${stageIds.length} stages`);

    return successResponse({ stageRankings });

  } catch (error) {
    console.error('❌ [getAllStagesRankings] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', `Failed to get all stages rankings: ${errorMessage}`);
  }
}

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

    // Use shared permission check function
    const permCheck = await checkUserPermissionAndGroups(env, userEmail, projectId);

    const { isGlobalPM, viewerRole, hasAccess, isTeacherOrObserver, currentUserGroupIds } = permCheck;

    console.log(`🔍 [getStageRankings] Permission check (combined):`, {
      isGlobalPM,
      viewerRole,
      hasAccess,
      isTeacherOrObserver,
      groupCount: currentUserGroupIds.length
    });

    // Check project access (if not Global PM)
    if (!isGlobalPM && !hasAccess) {
      console.log(`❌ [getStageRankings] Access denied for user ${userEmail} to project ${projectId}`);
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view rankings');
    }

    console.log(`✅ [getStageRankings] Permission check passed, user groups:`, currentUserGroupIds);

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

    // 3. Get proposal stats for teachers/observers
    if (isTeacherOrObserver) {
      console.log(`📊 [getStageRankings] Loading proposal stats for teacher/observer`);

      // Query proposal stats for all groups in this stage
      const proposalStatsResult = await env.DB.prepare(`
        WITH ProposalCounts AS (
          SELECT
            groupId,
            COUNT(*) as versionCount
          FROM rankingproposals_with_status
          WHERE projectId = ? AND stageId = ?
          GROUP BY groupId
        ),
        LatestProposals AS (
          SELECT
            groupId,
            status,
            votingResult,
            ROW_NUMBER() OVER (PARTITION BY groupId ORDER BY createdTime DESC) as rn
          FROM rankingproposals_with_status
          WHERE projectId = ? AND stageId = ?
        )
        SELECT
          pc.groupId,
          pc.versionCount,
          lp.status as latestStatus,
          lp.votingResult as latestVotingResult
        FROM ProposalCounts pc
        LEFT JOIN LatestProposals lp ON pc.groupId = lp.groupId AND lp.rn = 1
      `).bind(projectId, stageId, projectId, stageId).all();

      const proposalStats = proposalStatsResult.results || [];
      console.log(`📊 [getStageRankings] Proposal stats count: ${proposalStats.length}`);

      // Add proposal stats to rankings
      for (const stat of proposalStats) {
        const groupId = stat.groupId as string;
        if (!rankings[groupId]) {
          rankings[groupId] = {};
        }
        rankings[groupId].proposalStats = {
          versionCount: stat.versionCount as number,
          latestStatus: stat.latestStatus as string | null,
          latestVotingResult: stat.latestVotingResult as string | null
        };
        console.log(`📊 [getStageRankings] Group ${groupId} proposal stats:`, rankings[groupId].proposalStats);
      }
    }

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
