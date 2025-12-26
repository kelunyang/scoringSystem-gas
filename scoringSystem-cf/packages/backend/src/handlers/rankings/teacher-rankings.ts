/**
 * @fileoverview Teacher rankings getter
 * Returns teacher ranking data for a stage
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Get teacher rankings for a stage
 * Permission: Level 1 (Teachers only), or project creator/admin
 */
export async function getTeacherRankings(
  env: Env,
  context: { userEmail: string; userId: string },
  requestData: {
    projectId: string;
    stageId: string;
  }
): Promise<Response> {
  const { userEmail } = context;
  const { projectId, stageId } = requestData;

  try {
    // Validate required fields
    if (!projectId || !stageId) {
      return errorResponse('MISSING_FIELDS', 'Missing required fields: projectId, stageId');
    }

    // Permission Check: Must be teacher or project creator
    const isTeacher = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND role = 'teacher' AND isActive = 1
    `).bind(projectId, userEmail).first();

    const project = await env.DB.prepare(`
      SELECT createdBy FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    const isCreator = project && project.createdBy === userEmail;

    // Check for system admin permission
    const globalPermissions = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups ug
      JOIN globalgroups gg ON ug.globalGroupId = gg.globalGroupId
      WHERE ug.userEmail = ? AND ug.isActive = 1 AND gg.isActive = 1
    `).bind(userEmail).all();

    let isSystemAdmin = false;
    if (globalPermissions.results.length > 0) {
      for (const row of globalPermissions.results) {
        const permissions = row.globalPermissions ? JSON.parse(row.globalPermissions as string) : [];
        if (permissions.includes('system_admin')) {
          isSystemAdmin = true;
          break;
        }
      }
    }

    if (!isTeacher && !isCreator && !isSystemAdmin) {
      return errorResponse('TEACHER_ONLY', 'Only teachers can view teacher rankings');
    }

    // Verify stage exists
    const stage = await env.DB.prepare(`
      SELECT stageId, stageName, status FROM stages_with_status
      WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    // Get teacher submission rankings
    const submissionRankings = await env.DB.prepare(`
      SELECT
        tsr.teacherRankingId,
        tsr.teacherEmail,
        tsr.submissionId,
        tsr.groupId,
        tsr.rank,
        tsr.createdTime,
        g.groupName,
        u.displayName as teacherName
      FROM teachersubmissionrankings tsr
      LEFT JOIN groups g ON tsr.groupId = g.groupId
      LEFT JOIN users u ON u.userEmail = tsr.teacherEmail
      WHERE tsr.stageId = ? AND tsr.projectId = ?
      ORDER BY tsr.teacherEmail, tsr.rank
    `).bind(stageId, projectId).all();

    // Get teacher comment rankings
    const commentRankings = await env.DB.prepare(`
      SELECT
        tcr.rankingId,
        tcr.teacherEmail,
        tcr.commentId,
        tcr.authorEmail,
        tcr.rank,
        tcr.createdTime,
        u.displayName as teacherName,
        ua.displayName as authorName
      FROM teachercommentrankings tcr
      LEFT JOIN users u ON u.userEmail = tcr.teacherEmail
      LEFT JOIN users ua ON ua.userEmail = tcr.authorEmail
      WHERE tcr.stageId = ? AND tcr.projectId = ?
      ORDER BY tcr.teacherEmail, tcr.rank
    `).bind(stageId, projectId).all();

    // Group rankings by teacher
    const teacherData = new Map<string, {
      teacherEmail: string;
      teacherName: string;
      submissionRankings: any[];
      commentRankings: any[];
      lastUpdated: number;
    }>();

    // Process submission rankings
    for (const ranking of submissionRankings.results) {
      const teacherEmail = ranking.teacherEmail as string;
      if (!teacherData.has(teacherEmail)) {
        teacherData.set(teacherEmail, {
          teacherEmail,
          teacherName: (ranking.teacherName as string) || teacherEmail,
          submissionRankings: [],
          commentRankings: [],
          lastUpdated: ranking.createdTime as number
        });
      }

      const teacher = teacherData.get(teacherEmail)!;
      teacher.submissionRankings.push({
        rankingId: ranking.teacherRankingId,
        submissionId: ranking.submissionId,
        groupId: ranking.groupId,
        groupName: ranking.groupName,
        rank: ranking.rank,
        createdTime: ranking.createdTime
      });

      if ((ranking.createdTime as number) > teacher.lastUpdated) {
        teacher.lastUpdated = ranking.createdTime as number;
      }
    }

    // Process comment rankings
    for (const ranking of commentRankings.results) {
      const teacherEmail = ranking.teacherEmail as string;
      if (!teacherData.has(teacherEmail)) {
        teacherData.set(teacherEmail, {
          teacherEmail,
          teacherName: (ranking.teacherName as string) || teacherEmail,
          submissionRankings: [],
          commentRankings: [],
          lastUpdated: ranking.createdTime as number
        });
      }

      const teacher = teacherData.get(teacherEmail)!;
      teacher.commentRankings.push({
        rankingId: ranking.rankingId,
        commentId: ranking.commentId,
        authorEmail: ranking.authorEmail,
        authorName: ranking.authorName,
        rank: ranking.rank,
        createdTime: ranking.createdTime
      });

      if ((ranking.createdTime as number) > teacher.lastUpdated) {
        teacher.lastUpdated = ranking.createdTime as number;
      }
    }

    return successResponse({
      stage: {
        stageId: stage.stageId,
        stageName: stage.stageName,
        status: stage.status
      },
      teachers: Array.from(teacherData.values()),
      statistics: {
        totalTeachers: teacherData.size,
        totalSubmissionRankings: submissionRankings.results.length,
        totalCommentRankings: commentRankings.results.length
      }
    });

  } catch (error) {
    console.error('Get teacher rankings error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('GET_RANKINGS_FAILED', `Failed to get teacher rankings: ${errorMessage}`);
  }
}
