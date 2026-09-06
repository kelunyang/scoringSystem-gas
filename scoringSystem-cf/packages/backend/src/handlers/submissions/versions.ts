/**
 * Submission Version Control Handlers
 * Migrated from GAS scripts/submissions_api.js
 */

import type { Env, SqlBindValue } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';
import { queueBatchNotifications } from '../../queues/notification-producer';
import { getGroupMemberEmails } from '@utils/notifications';

/**
 * Extract unique participant emails from participationProposal
 * Returns only emails (no percentages) to protect group internal work distribution privacy
 */
function extractParticipants(participationProposal: Record<string, number> | null | undefined): string[] {
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
) {
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

    // Reads a global permission, so both isActive flags matter: a membership
    // in a deactivated group must not grant anything. `.all()` rather than
    // `.first()` because a user can belong to several global groups and the
    // permission may sit in any of them — taking only the first row silently
    // denied access to anyone whose PM group was not the first returned.
    const globalGroups = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      WHERE gug.userEmail = ? AND gug.isActive = 1 AND gg.isActive = 1
    `).bind(userEmail).all();
    const hasAdminAccess = (globalGroups.results || []).some(row =>
      JSON.parse((row.globalPermissions as string) || '[]').includes('create_project')
    );

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

    const bindings: SqlBindValue[] = [projectId, stageId];

    if (options.groupId) {
      query += ` AND s.groupId = ?`;
      bindings.push(options.groupId);
    }

    // NOTE: For getSubmissionVersions, we return ALL submissions for the group in this stage
    // This includes submitted, approved, and withdrawn status
    // No additional filtering by status - users can see full submission history

    query += ` ORDER BY s.groupId, s.submitTime ASC`;


    const result = await env.DB.prepare(query).bind(...bindings).all();

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
    const versions = result.results.map(sub => {
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
        .filter(sub => !sub.withdrawnTime)
        .map(sub => sub.groupId)
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
) {
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
      `).bind(stageId, projectId).first<{ stageName: string }>();

      const stageName = stage?.stageName || '未命名階段';

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
 * Helper: Log operation
 */
// Logging is now handled by centralized utils/logging module
