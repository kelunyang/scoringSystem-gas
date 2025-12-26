/**
 * Submission Version Control Handlers
 * Migrated from GAS scripts/submissions_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';
import { queueBatchNotifications } from '../../queues/notification-producer';
import { getGroupMemberEmails } from '@utils/notifications';

/**
 * Extract unique participant emails from participationProposal
 * Returns only emails (no percentages) to protect group internal work distribution privacy
 */
function extractParticipants(participationProposal: any): string[] {
  if (!participationProposal || typeof participationProposal !== 'object') {
    return [];
  }
  return Object.keys(participationProposal).filter(email => participationProposal[email] > 0);
}

/**
 * Get all versions of submissions for a stage/group
 */
export async function getSubmissionVersions(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  options: {
    groupId?: string;
    includeWithdrawn?: boolean;
    includeActive?: boolean;
  } = {}
): Promise<Response> {
  try {
    // Check user's permissions first
    const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(userEmail).first();
    if (!user) {
      return errorResponse('ACCESS_DENIED', 'User not found');
    }

    // Check if user is project creator
    const project = await env.DB.prepare('SELECT createdBy FROM projects WHERE projectId = ?').bind(projectId).first();
    const isCreator = project && project.createdBy === user.userId;

    // Check if user is teacher/observer
    const projectViewer = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).first();
    const isTeacherOrObserver = projectViewer && (projectViewer.role === 'teacher' || projectViewer.role === 'observer');

    // Check if user has global PM permissions
    const hasGlobalPM = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      WHERE gug.userEmail = ? AND gug.isActive = 1
    `).bind(userEmail).first();
    const hasAdminAccess = hasGlobalPM && JSON.parse(hasGlobalPM.globalPermissions as string).includes('create_project');

    const hasElevatedPermissions = isCreator || isTeacherOrObserver || hasAdminAccess;

    // If user is a regular group member (not admin/teacher), restrict to their own group
    if (!hasElevatedPermissions) {
      // Get user's group in this project
      const userGroupMembership = await env.DB.prepare(`
        SELECT groupId FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND isActive = 1
      `).bind(userEmail, projectId).first();

      if (!userGroupMembership) {
        return errorResponse('ACCESS_DENIED', 'You are not a member of any group in this project');
      }

      // Force groupId to user's own group
      options.groupId = userGroupMembership.groupId as string;
    } else if (options.groupId) {
      // Admin/teacher requested specific groupId, validate it exists
      const groupExists = await env.DB.prepare(`
        SELECT groupId FROM groups WHERE projectId = ? AND groupId = ?
      `).bind(projectId, options.groupId).first();

      if (!groupExists) {
        return errorResponse('GROUP_NOT_FOUND', 'Specified group does not exist');
      }
    }
    // If admin/teacher didn't specify groupId, they can see all groups

    let query = `
      SELECT
        s.submissionId, s.stageId, s.groupId, s.contentMarkdown,
        s.actualAuthors, s.participationProposal,
        s.submitTime, s.status,
        s.updatedAt, s.withdrawnTime, s.withdrawnBy,
        pg.groupName,
        s.submitterEmail, u.displayName as submitterName,
        u.avatarSeed as submitterAvatarSeed,
        u.avatarStyle as submitterAvatarStyle,
        u.avatarOptions as submitterAvatarOptions,
        uw.displayName as withdrawnByName
      FROM submissions_with_status s
      JOIN groups pg ON s.groupId = pg.groupId
      LEFT JOIN users u ON s.submitterEmail = u.userEmail
      LEFT JOIN users uw ON s.withdrawnBy = uw.userEmail
      WHERE s.projectId = ? AND s.stageId = ?
    `;

    const bindings: any[] = [projectId, stageId];

    if (options.groupId) {
      query += ` AND s.groupId = ?`;
      bindings.push(options.groupId);
    }

    // NOTE: For getSubmissionVersions, we return ALL submissions for the group in this stage
    // This includes submitted, approved, and withdrawn status
    // No additional filtering by status - users can see full submission history

    query += ` ORDER BY s.groupId, s.submitTime ASC`;

    // 🔍 DEBUG: Log SQL query before execution
    console.log('🔍 [getSubmissionVersions] Executing SQL:', {
      query,
      bindings,
      options
    });

    const result = await env.DB.prepare(query).bind(...bindings).all();

    // 🔍 DEBUG: Log query results
    console.log('📊 [getSubmissionVersions] Query results:', {
      success: result.success,
      resultCount: result.results?.length || 0,
      results: result.results,
      meta: result.meta
    });

    // Check if user is a member of the queried group (for privacy protection)
    let isGroupMember = false;
    if (options.groupId) {
      const userGroupCheck = await env.DB.prepare(`
        SELECT groupId FROM usergroups
        WHERE userEmail = ? AND projectId = ? AND groupId = ? AND isActive = 1
      `).bind(userEmail, projectId, options.groupId).first();
      isGroupMember = !!userGroupCheck;
    }

    // Determine if user should see participationProposal (percentages)
    // Show if: user has elevated permissions OR user is a member of the group
    const canSeeParticipation = hasElevatedPermissions || isGroupMember;

    // Map to flat array (matching GAS format)
    const versions = result.results.map((sub: any) => {
      const parsedProposal = parseJSON(sub.participationProposal as string, {});

      const baseVersion = {
        submissionId: sub.submissionId,
        stageId: sub.stageId,
        groupId: sub.groupId,
        groupName: sub.groupName,
        content: sub.contentMarkdown,
        submitter: sub.submitterEmail,
        submitterName: sub.submitterName || null,
        submitterAvatarSeed: sub.submitterAvatarSeed || null,
        submitterAvatarStyle: sub.submitterAvatarStyle || null,
        submitterAvatarOptions: sub.submitterAvatarOptions || null,
        submittedTime: sub.submitTime,
        status: sub.status,
        updatedAt: sub.updatedAt || null,
        withdrawnTime: sub.withdrawnTime || null,
        withdrawnBy: sub.withdrawnBy || null,
        withdrawnByName: sub.withdrawnByName || null,
        actualAuthors: parseJSON(sub.actualAuthors as string, []),
        participants: extractParticipants(parsedProposal)
      };

      // Add participationProposal only if user has permission
      if (canSeeParticipation) {
        return {
          ...baseVersion,
          participationProposal: parsedProposal
        };
      }

      return baseVersion;
    });

    // Count unique groups with submissions (excluding withdrawn) for this stage
    const activeGroupsWithSubmissions = new Set(
      result.results
        .filter((sub: any) => !sub.withdrawnTime)
        .map((sub: any) => sub.groupId)
    ).size;

    // Create metadata
    const metadata = {
      totalVersions: versions.length,
      withdrawnCount: versions.filter(v => v.withdrawnTime).length,
      activeCount: versions.filter(v => !v.withdrawnTime).length,
      groupId: options.groupId || null,
      stageId,
      activeGroupsWithSubmissions  // 該階段有提交的組數（不含已撤回）
    };

    return successResponse({
      versions,
      metadata
    });

  } catch (error) {
    console.error('Get submission versions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get submission versions');
  }
}

/**
 * Restore a previous version of submission
 */
export async function restoreSubmissionVersion(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  submissionId: string
): Promise<Response> {
  try {
    // 1. 取得要 restore 的 submission（完整資料用於複製）
    const oldSubmission = await env.DB.prepare(`
      SELECT submissionId, groupId, stageId, submitterEmail, status,
             contentMarkdown, actualAuthors, participationProposal
      FROM submissions_with_status
      WHERE submissionId = ? AND projectId = ? AND stageId = ?
    `).bind(submissionId, projectId, stageId).first();

    if (!oldSubmission) {
      return errorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // 2. 檢查權限
    const userGroup = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND groupId = ? AND isActive = 1
    `).bind(userEmail, projectId, oldSubmission.groupId).first();

    if (!userGroup && oldSubmission.submitterEmail !== userEmail) {
      return errorResponse('ACCESS_DENIED', 'You can only restore your own group submissions');
    }

    // ========== PARTICIPANT VALIDATION ==========
    // Check if user is a participant in the OLD submission being restored
    // This prevents non-participating group members from restoring old versions
    const proposedParticipation = parseJSON(oldSubmission.participationProposal as string, {}) as Record<string, number>;
    const userParticipation = proposedParticipation[userEmail];

    if (userParticipation === undefined || userParticipation <= 0) {
      return errorResponse(
        'NOT_PARTICIPANT',
        'You cannot restore this submission because you are not listed as a participant in the original version. Only participants who contributed to this submission can restore it.'
      );
    }
    // ========== END PARTICIPANT VALIDATION ==========

    // 3. 檢查用戶是否已經投過票（只檢查當前活躍版本）
    const userVote = await env.DB.prepare(`
      SELECT voteId FROM submissionapprovalvotes
      WHERE projectId = ? AND voterEmail = ?
        AND submissionId = (
          SELECT submissionId FROM submissions_with_status
          WHERE projectId = ? AND stageId = ? AND groupId = ?
            AND withdrawnTime IS NULL
            AND approvedTime IS NULL
          ORDER BY submitTime DESC
          LIMIT 1
        )
      LIMIT 1
    `).bind(projectId, userEmail, projectId, stageId, oldSubmission.groupId).first();

    if (userVote) {
      return errorResponse(
        'RESTORE_BLOCKED_VOTED',
        'Cannot restore: you have already voted on the current active submission'
      );
    }

    // 4. 檢查是否有任何 approved 的版本
    const approvedVersion = await env.DB.prepare(`
      SELECT submissionId FROM submissions_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ?
        AND approvedTime IS NOT NULL
      LIMIT 1
    `).bind(projectId, stageId, oldSubmission.groupId).first();

    if (approvedVersion) {
      return errorResponse(
        'RESTORE_BLOCKED_APPROVED',
        'Cannot restore: a version has already been approved'
      );
    }

    const timestamp = Date.now();

    // 5. 創建新的 submission（複製舊版本內容）並將當前活躍版本標記為 withdrawn
    // Use D1 batch for atomic transaction
    const newSubmissionId = generateId('sub');

    const statements = [
      // Insert new submission (copy of old version)
      env.DB.prepare(`
        INSERT INTO submissions (
          submissionId, projectId, stageId, groupId,
          contentMarkdown, actualAuthors, participationProposal,
          submitterEmail, submitTime, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newSubmissionId,
        projectId,
        stageId,
        oldSubmission.groupId,
        oldSubmission.contentMarkdown,
        oldSubmission.actualAuthors,
        oldSubmission.participationProposal,
        userEmail, // 執行 restore 的用戶成為新的 submitter
        timestamp,
        timestamp,
        timestamp
      ),

      // Mark current active version as withdrawn (replaced by restored version)
      // withdrawnBy = 'system' indicates automatic withdrawal due to new version
      env.DB.prepare(`
        UPDATE submissions
        SET withdrawnTime = ?,
            withdrawnBy = 'system',
            updatedAt = ?
        WHERE projectId = ? AND stageId = ? AND groupId = ?
          AND submissionId != ?
          AND withdrawnTime IS NULL
          AND approvedTime IS NULL
      `).bind(
        timestamp,
        timestamp,
        projectId,
        stageId,
        oldSubmission.groupId,
        newSubmissionId
      )
    ];

    // Execute atomically
    await env.DB.batch(statements);

    // 6. 記錄操作
    await logProjectOperation(env, userEmail, projectId, 'submission_version_restored',
      'submission', newSubmissionId, {}, {
        relatedEntities: {
          sourceSubmission: submissionId,
          group: oldSubmission.groupId as string,
          stage: oldSubmission.stageId as string
        }
      });

    // 7. 發送通知給組員（除了恢復者）
    try {
      // Get stage name for notification
      const stage = await env.DB.prepare(`
        SELECT stageName FROM stages WHERE stageId = ? AND projectId = ?
      `).bind(stageId, projectId).first();

      const stageName = (stage as any)?.stageName || '未命名階段';

      // Get group members
      const groupMembers = await getGroupMemberEmails(env, projectId, oldSubmission.groupId as string);
      const otherMembers = groupMembers.filter(email => email !== userEmail);

      if (otherMembers.length > 0) {
        await queueBatchNotifications(env, otherMembers.map(email => ({
          targetUserEmail: email,
          type: 'submission_updated',
          title: '組員恢復了作品版本',
          content: `${userEmail} 已恢復您的組在 ${stageName} 階段的作品版本`,
          projectId,
          stageId,
          submissionId: newSubmissionId,
          groupId: oldSubmission.groupId as string,
          metadata: {
            restoredBy: userEmail,
            sourceSubmissionId: submissionId,
            restoredAt: timestamp
          }
        })));
      }
    } catch (notifError) {
      console.error('[restoreSubmissionVersion] Failed to send notifications:', notifError);
      // 通知失敗不應影響主要操作
    }

    return successResponse({
      submissionId: newSubmissionId,
      sourceSubmissionId: submissionId,
      updatedAt: timestamp
    }, 'Submission version restored successfully');

  } catch (error) {
    console.error('Restore submission version error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to restore submission version');
  }
}

/**
 * Compare two submission versions
 */
export async function compareSubmissionVersions(
  env: Env,
  userEmail: string,
  projectId: string,
  submissionId1: string,
  submissionId2: string
): Promise<Response> {
  try {
    const submissions = await env.DB.prepare(`
      SELECT
        s.submissionId, s.contentMarkdown, s.submitTime,
        s.submitterEmail, u.displayName as submitterName
      FROM submissions_with_status s
      LEFT JOIN users u ON s.submitterEmail = u.userEmail
      WHERE s.submissionId IN (?, ?) AND s.projectId = ?
    `).bind(submissionId1, submissionId2, projectId).all();

    if (submissions.results.length !== 2) {
      return errorResponse('SUBMISSION_NOT_FOUND', 'One or both submissions not found');
    }

    const [sub1, sub2] = submissions.results;

    return successResponse({
      version1: {
        submissionId: sub1.submissionId,
        content: sub1.contentMarkdown,
        submitTime: sub1.submitTime,
        submitterEmail: sub1.submitterEmail,
        submitterName: sub1.submitterName
      },
      version2: {
        submissionId: sub2.submissionId,
        content: sub2.contentMarkdown,
        submitTime: sub2.submitTime,
        submitterEmail: sub2.submitterEmail,
        submitterName: sub2.submitterName
      }
    });

  } catch (error) {
    console.error('Compare submission versions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to compare submission versions');
  }
}

/**
 * Get version history for a group's submissions in a stage
 */
export async function getGroupVersionHistory(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  groupId: string
): Promise<Response> {
  try {
    // Validate user has access to this group's history
    const userGroup = await env.DB.prepare(`
      SELECT ug.role, ug.isActive
      FROM usergroups ug
      WHERE ug.userEmail = ? AND ug.projectId = ? AND ug.groupId = ? AND ug.isActive = 1
    `).bind(userEmail, projectId, groupId).first();

    if (!userGroup) {
      // Check if user is system admin or project creator/teacher
      const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(userEmail).first();
      if (!user) {
        return errorResponse('ACCESS_DENIED', 'You do not have permission to view this group\'s history');
      }

      // Check if user is project creator
      const project = await env.DB.prepare('SELECT createdBy FROM projects WHERE projectId = ?').bind(projectId).first();
      const isCreator = project && project.createdBy === user.userId;

      // Check if user is teacher or observer (Level 1-2)
      const projectViewer = await env.DB.prepare(`
        SELECT role FROM projectviewers
        WHERE projectId = ? AND userEmail = ? AND isActive = 1
      `).bind(projectId, userEmail).first();
      const isTeacherOrObserver = projectViewer && (projectViewer.role === 'teacher' || projectViewer.role === 'observer');

      // Check if user has global PM permissions
      const hasGlobalPM = await env.DB.prepare(`
        SELECT gg.globalPermissions
        FROM globalusergroups gug
        JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
        WHERE gug.userEmail = ? AND gug.isActive = 1
      `).bind(userEmail).first();
      const hasAdminAccess = hasGlobalPM && JSON.parse(hasGlobalPM.globalPermissions as string).includes('create_project');

      if (!isCreator && !isTeacherOrObserver && !hasAdminAccess) {
        return errorResponse('ACCESS_DENIED', 'You do not have permission to view this group\'s history');
      }
    }

    const versions = await env.DB.prepare(`
      SELECT
        s.submissionId, s.contentMarkdown, s.submitTime, s.status,
        s.submitterEmail, u.displayName as submitterName,
        (SELECT COUNT(*) FROM comments WHERE targetType = 'submission' AND targetId = s.submissionId) as commentCount
      FROM submissions_with_status s
      LEFT JOIN users u ON s.submitterEmail = u.userEmail
      WHERE s.projectId = ? AND s.stageId = ? AND s.groupId = ?
      ORDER BY s.submitTime DESC
    `).bind(projectId, stageId, groupId).all();

    const versionHistory = versions.results.map((v: any) => ({
      submissionId: v.submissionId,
      content: v.contentMarkdown,
      submitTime: v.submitTime,
      status: v.status,
      submitterEmail: v.submitterEmail,
      submitterName: v.submitterName,
      commentCount: v.commentCount || 0
    }));

    return successResponse({
      groupId,
      versions: versionHistory,
      totalVersions: versionHistory.length
    });

  } catch (error) {
    console.error('Get group version history error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get version history');
  }
}

/**
 * Helper: Log operation
 */
// Logging is now handled by centralized utils/logging module
