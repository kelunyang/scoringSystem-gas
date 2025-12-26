/**
 * @fileoverview Teacher Ranking Versions Handler
 * Provides version history for teacher rankings (submissions and comments)
 * Supports multi-version tracking and comparison
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

interface RankingVersion {
  versionId: string;          // createdTime as version identifier
  createdTime: number;
  teacherEmail: string;
  teacherDisplayName: string;
  rankingType: 'submission' | 'comment';
  rankings: Array<{
    rankingId: string;
    targetId: string;        // submissionId or commentId
    groupId?: string;        // For submissions
    groupName?: string;      // For submissions
    authorEmail?: string;    // For comments
    rank: number;
    memberNames?: string[];  // For submissions
  }>;
  metadata: {
    totalItems: number;
  };
}

interface VersionsResponse {
  versions: RankingVersion[];
  latestVersion?: RankingVersion;
}

/**
 * Get all versions of teacher rankings for a specific stage
 * Groups rankings by createdTime (version identifier)
 */
export async function getTeacherRankingVersions(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankingType: 'submission' | 'comment'
): Promise<Response> {
  try {
    console.log(`📚 [getTeacherRankingVersions] Fetching ${rankingType} versions for teacher ${userEmail} in stage ${stageId}`);

    // Verify user is a teacher
    const teacherCheck = await env.DB.prepare(`
      SELECT role, displayName
      FROM projectviewers pv
      LEFT JOIN users u ON pv.userEmail = u.userEmail
      WHERE pv.projectId = ? AND pv.userEmail = ? AND pv.role = 'teacher'
    `).bind(projectId, userEmail).first();

    if (!teacherCheck) {
      return errorResponse('NOT_AUTHORIZED', '只有教師可以查看排名版本');
    }

    const teacherDisplayName = teacherCheck.displayName as string || userEmail;
    const versions: RankingVersion[] = [];

    if (rankingType === 'submission') {
      // Query all submission ranking versions
      const rankingsResult = await env.DB.prepare(`
        SELECT
          tsr.teacherRankingId,
          tsr.submissionId,
          tsr.groupId,
          tsr.rank,
          tsr.createdTime,
          g.groupName,
          s.participationProposal
        FROM teachersubmissionrankings tsr
        LEFT JOIN groups g ON tsr.groupId = g.groupId
        LEFT JOIN submissions s ON tsr.submissionId = s.submissionId
        WHERE tsr.projectId = ? AND tsr.stageId = ? AND tsr.teacherEmail = ?
        ORDER BY tsr.createdTime DESC, tsr.rank ASC
      `).bind(projectId, stageId, userEmail).all();

      if (!rankingsResult.success) {
        return errorResponse('DB_ERROR', '無法查詢成果排名版本');
      }

      // Group by createdTime (version)
      const versionMap = new Map<number, RankingVersion>();

      for (const ranking of rankingsResult.results) {
        const createdTime = ranking.createdTime as number;
        const versionId = createdTime.toString();

        if (!versionMap.has(createdTime)) {
          versionMap.set(createdTime, {
            versionId,
            createdTime,
            teacherEmail: userEmail,
            teacherDisplayName,
            rankingType: 'submission',
            rankings: [],
            metadata: {
              totalItems: 0
            }
          });
        }

        const version = versionMap.get(createdTime)!;

        // Parse participationProposal to get memberNames
        let memberNames: string[] = [];
        if (ranking.participationProposal) {
          try {
            const participation = typeof ranking.participationProposal === 'string'
              ? JSON.parse(ranking.participationProposal)
              : ranking.participationProposal;
            memberNames = Object.keys(participation);
          } catch (e) {
            console.warn('Failed to parse participationProposal:', e);
          }
        }

        version.rankings.push({
          rankingId: ranking.teacherRankingId as string,
          targetId: ranking.submissionId as string,
          groupId: ranking.groupId as string,
          groupName: ranking.groupName as string || `組別 ${ranking.groupId}`,
          rank: ranking.rank as number,
          memberNames
        });

        version.metadata.totalItems = version.rankings.length;
      }

      // Convert map to array (already sorted DESC by createdTime)
      versions.push(...Array.from(versionMap.values()));

    } else if (rankingType === 'comment') {
      // Query all comment ranking versions
      const rankingsResult = await env.DB.prepare(`
        SELECT
          tcr.rankingId,
          tcr.commentId,
          tcr.authorEmail,
          tcr.rank,
          tcr.createdTime,
          u.displayName as authorDisplayName
        FROM teachercommentrankings tcr
        LEFT JOIN users u ON tcr.authorEmail = u.userEmail
        WHERE tcr.projectId = ? AND tcr.stageId = ? AND tcr.teacherEmail = ?
        ORDER BY tcr.createdTime DESC, tcr.rank ASC
      `).bind(projectId, stageId, userEmail).all();

      if (!rankingsResult.success) {
        return errorResponse('DB_ERROR', '無法查詢評論排名版本');
      }

      // Group by createdTime (version)
      const versionMap = new Map<number, RankingVersion>();

      for (const ranking of rankingsResult.results) {
        const createdTime = ranking.createdTime as number;
        const versionId = createdTime.toString();

        if (!versionMap.has(createdTime)) {
          versionMap.set(createdTime, {
            versionId,
            createdTime,
            teacherEmail: userEmail,
            teacherDisplayName,
            rankingType: 'comment',
            rankings: [],
            metadata: {
              totalItems: 0
            }
          });
        }

        const version = versionMap.get(createdTime)!;

        version.rankings.push({
          rankingId: ranking.rankingId as string,
          targetId: ranking.commentId as string,
          authorEmail: ranking.authorEmail as string,
          rank: ranking.rank as number
        });

        version.metadata.totalItems = version.rankings.length;
      }

      // Convert map to array (already sorted DESC by createdTime)
      versions.push(...Array.from(versionMap.values()));
    }

    const response: VersionsResponse = {
      versions,
      latestVersion: versions.length > 0 ? versions[0] : undefined
    };

    console.log(`✅ [getTeacherRankingVersions] Found ${versions.length} versions`);
    return successResponse(response);

  } catch (error) {
    console.error('❌ [getTeacherRankingVersions] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('FETCH_VERSIONS_FAILED', `無法獲取排名版本: ${errorMessage}`);
  }
}
