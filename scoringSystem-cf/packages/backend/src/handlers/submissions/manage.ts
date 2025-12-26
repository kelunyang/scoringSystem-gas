/**
 * Submission Management Handlers
 * Migrated from GAS scripts/submissions_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation, logApiAction } from '@utils/logging';
import { checkIsAdminTeacherOrObserver, checkIsTeacherOrObserver } from '@utils/permissions';
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
 * Submit a deliverable for a stage
 */
export async function submitDeliverable(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  submissionData: {
    content: string;
    authors?: string[];
    participationProposal?: any;
  }
): Promise<Response> {
  try {
    // Get user's group membership
    const userGroup = await env.DB.prepare(`
      SELECT pug.groupId, pug.role, pg.groupName
      FROM usergroups pug
      JOIN groups pg ON pug.groupId = pg.groupId
      WHERE pug.userEmail = ? AND pug.projectId = ?
    `).bind(userEmail, projectId).first();

    if (!userGroup) {
      return errorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Check stage status from VIEW (auto-calculated)
    const stage = await env.DB.prepare(`
      SELECT status, startTime, endTime, stageName FROM stages_with_status
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    if (!stage) {
      return errorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    if (stage.status !== 'active') {
      return errorResponse('STAGE_NOT_ACTIVE', 'Stage is not currently active');
    }

    // Check deadline
    const now = Date.now();
    if (now > (stage.endTime as number)) {
      return errorResponse('SUBMISSION_DEADLINE_PASSED', 'Submission deadline has passed');
    }

    // ========== DEDUPLICATION: Prevent duplicate submissions ==========
    const timestamp = Date.now();
    const timeBucket = Math.floor(timestamp / 60000);
    const groupId = userGroup.groupId as string;
    // Include userEmail in dedupKey to allow multiple group members to submit
    const dedupKey = `submission_submit:${projectId}:${stageId}:${groupId}:${userEmail}:${timeBucket}`;

    // Get userId for logging
    const userResult = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();
    const userId = userResult?.userId as string | undefined;

    // Check if this submission action is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'submission_submit',
      userId,
      projectId,
      entityType: 'submission',
      entityId: '',  // Will be set after creation
      message: `Group ${groupId} submitted deliverable for stage ${stageId}`,
      context: {
        projectId,
        stageId,
        groupId,
        submitterEmail: userEmail,
        timeBucket,
        contentLength: submissionData.content?.length || 0
      },
      relatedEntities: {
        stage: stageId,
        group: groupId
      }
    });

    // If duplicate submission detected, return success with existing submission (idempotent behavior)
    if (!isNewAction) {
      console.log(`[submitDeliverable] Duplicate submission prevented: ${dedupKey}`);

      // Find most recent submission from this group for this stage
      const recentSubmission = await env.DB.prepare(`
        SELECT submissionId, submitTime, status FROM submissions_with_status
        WHERE projectId = ? AND stageId = ? AND groupId = ?
        ORDER BY submitTime DESC
        LIMIT 1
      `).bind(projectId, stageId, groupId).first();

      return new Response(JSON.stringify({
        success: true,
        message: 'Submission already recorded (duplicate prevented)',
        data: {
          deduped: true,
          submissionId: recentSubmission?.submissionId || 'unknown',
          groupId,
          stageId,
          status: recentSubmission?.status || 'submitted'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    // ========== VALIDATE PARTICIPATION PROPOSAL ==========
    // Phase 2 Enhancement: Validate all emails belong to the group
    if (submissionData.participationProposal && Object.keys(submissionData.participationProposal).length > 0) {
      // Get all group members
      const groupMembers = await env.DB.prepare(`
        SELECT userEmail FROM usergroups
        WHERE groupId = ? AND projectId = ? AND isActive = 1
      `).bind(userGroup.groupId, projectId).all();

      const validEmails = new Set(groupMembers.results.map((m: any) => m.userEmail));
      const proposalEmails = Object.keys(submissionData.participationProposal);

      // Check for invalid emails
      const invalidEmails = proposalEmails.filter(email => !validEmails.has(email));

      if (invalidEmails.length > 0) {
        return errorResponse('INVALID_DATA', `Invalid group members in participation proposal: ${invalidEmails.join(', ')}`);
      }

      console.log(`✅ [submitDeliverable] Participation proposal validated: ${proposalEmails.length} members`);
    }
    // ========== END VALIDATION ==========

    // ========== CHECK FOR EXISTING ACTIVE SUBMISSION ==========
    // Prevent race condition: reject if group already has a 'submitted' submission
    // This handles multi-user concurrent access where different group members submit simultaneously
    const existingSubmission = await env.DB.prepare(`
      SELECT submissionId, submitterEmail, submitTime
      FROM submissions_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ?
        AND status = 'submitted'
      ORDER BY submitTime DESC
      LIMIT 1
    `).bind(projectId, stageId, groupId).first();

    if (existingSubmission) {
      console.log(`[submitDeliverable] Rejected: Group ${groupId} already has active submission ${existingSubmission.submissionId}`);
      return errorResponse(
        'GROUP_HAS_ACTIVE_SUBMISSION',
        `Your group already has an active submission (submitted by ${existingSubmission.submitterEmail}). Please withdraw it first before submitting a new one.`
      );
    }
    // ========== END CHECK ==========

    // Create submission
    const submissionId = generateId('sub');

    await env.DB.prepare(`
      INSERT INTO submissions (
        submissionId, projectId, stageId, groupId, submitterEmail,
        contentMarkdown, actualAuthors, participationProposal,
        submitTime, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      submissionId,
      projectId,
      stageId,
      userGroup.groupId,
      userEmail,
      submissionData.content,
      stringifyJSON(submissionData.authors || [userEmail]),
      stringifyJSON(submissionData.participationProposal || {}),
      timestamp,
      timestamp,
      timestamp
    ).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'submission_created', 'submission', submissionId, {
      submitTime: timestamp,
      contentLength: submissionData.content.length,
      contentPreview: submissionData.content.substring(0, 200),
      participantCount: Object.keys(submissionData.participationProposal || {}).length,
      participantEmails: Object.keys(submissionData.participationProposal || {}),
      hasParticipationProposal: !!(submissionData.participationProposal && Object.keys(submissionData.participationProposal).length > 0)
    }, {
      relatedEntities: {
        stage: stageId,
        group: userGroup.groupId as string
      }
    });

    // 發送通知給組員（除了提交者）
    try {
      const groupMembers = await getGroupMemberEmails(env, projectId, userGroup.groupId as string);
      const otherMembers = groupMembers.filter(email => email !== userEmail);

      if (otherMembers.length > 0) {
        const stageName = (stage as any).stageName || '未命名階段';
        await queueBatchNotifications(env, otherMembers.map(email => ({
          targetUserEmail: email,
          type: 'submission_created',
          title: '組員提交了作品',
          content: `${userEmail} 已為您的組提交了 ${stageName} 階段的作品`,
          projectId,
          stageId,
          submissionId,
          groupId: userGroup.groupId as string
        })));
      }
    } catch (error) {
      console.error('[submitSubmission] Failed to send notifications:', error);
      // 通知失敗不應影響提交流程
    }

    return successResponse({
      submissionId,
      submitTime: timestamp,
      status: 'submitted'
    }, 'Submission created successfully');

  } catch (error) {
    console.error('Submit deliverable error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to submit deliverable');
  }
}

/**
 * Get all submissions for a stage
 */
export async function getStageSubmissions(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  options: {
    includeWithdrawn?: boolean;
    groupId?: string;
  } = {}
): Promise<Response> {
  try {
    let query = `
      SELECT
        s.submissionId, s.stageId, s.groupId, s.contentMarkdown,
        s.actualAuthors, s.participationProposal,
        s.submitTime, s.status,
        pg.groupName,
        s.submitterEmail, u.displayName as submitterName
      FROM submissions_with_status s
      JOIN groups pg ON s.groupId = pg.groupId
      LEFT JOIN users u ON s.submitterEmail = u.userEmail
      WHERE s.projectId = ? AND s.stageId = ?
    `;

    const bindings: any[] = [projectId, stageId];

    if (!options.includeWithdrawn) {
      query += ` AND s.withdrawnTime IS NULL`;
    }

    if (options.groupId) {
      query += ` AND s.groupId = ?`;
      bindings.push(options.groupId);
    }

    query += ` ORDER BY s.submitTime DESC`;

    const result = await env.DB.prepare(query).bind(...bindings).all();

    const submissions = result.results.map(sub => ({
      submissionId: sub.submissionId,
      stageId: sub.stageId,
      groupId: sub.groupId,
      groupName: sub.groupName,
      content: sub.contentMarkdown,
      actualAuthors: parseJSON(sub.actualAuthors as string, []),
      participants: extractParticipants(parseJSON(sub.participationProposal as string, {})),
      submitTime: sub.submitTime,
      submitterEmail: sub.submitterEmail,
      submitterName: sub.submitterName,
      status: sub.status,
      commentCount: 0  // Removed subquery - comments table has no targetType/targetId fields
    }));

    // Count unique groups with active submissions (not withdrawn)
    const activeGroupsWithSubmissions = new Set(
      result.results
        .filter((sub: any) => !sub.withdrawnTime)
        .map((sub: any) => sub.groupId)
    ).size;

    return successResponse({
      submissions,
      total: submissions.length,
      activeGroupsWithSubmissions  // 有提交的組數（不含已撤回）
    });

  } catch (error) {
    console.error('Get stage submissions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get stage submissions');
  }
}

/**
 * Get submission details
 */
export async function getSubmissionDetails(
  env: Env,
  userEmail: string,
  projectId: string,
  submissionId: string
): Promise<Response> {
  try {
    const submission = await env.DB.prepare(`
      SELECT
        s.submissionId, s.projectId, s.stageId, s.groupId, s.contentMarkdown,
        s.actualAuthors, s.participationProposal,
        s.submitTime, s.status,
        pg.groupName,
        s.submitterEmail, u.displayName as submitterName,
        st.stageName, st.status as stageStatus
      FROM submissions_with_status s
      JOIN groups pg ON s.groupId = pg.groupId
      LEFT JOIN users u ON s.submitterEmail = u.userEmail
      JOIN stages st ON s.stageId = st.stageId
      WHERE s.submissionId = ? AND s.projectId = ?
    `).bind(submissionId, projectId).first();

    if (!submission) {
      return errorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Comments count removed - comments table has no targetType/targetId fields
    // Comments are associated with stages, not individual submissions
    const commentCount = 0;

    const submissionData = {
      submissionId: submission.submissionId,
      projectId: submission.projectId,
      stageId: submission.stageId,
      stageName: submission.stageName,
      stageStatus: submission.stageStatus,
      groupId: submission.groupId,
      groupName: submission.groupName,
      content: submission.contentMarkdown,
      actualAuthors: parseJSON(submission.actualAuthors as string, []),
      participants: extractParticipants(parseJSON(submission.participationProposal as string, {})),
      submitTime: submission.submitTime,
      submitterEmail: submission.submitterEmail,
      submitterName: submission.submitterName,
      status: submission.status,
      commentCount
    };

    return successResponse(submissionData);

  } catch (error) {
    console.error('Get submission details error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get submission details');
  }
}

/**
 * Update submission content or metadata
 *
 * @deprecated This function is not used by the frontend and should be removed.
 * Current design philosophy: submissions are immutable after creation.
 * Users should withdraw and resubmit instead of editing.
 *
 * DO NOT use this function in new code.
 */
export async function updateSubmission(
  env: Env,
  userEmail: string,
  projectId: string,
  submissionId: string,
  updates: {
    content?: string;
    authors?: string[];
    participationProposal?: any;
  }
): Promise<Response> {
  try {
    // Get submission to verify ownership
    const submission = await env.DB.prepare(`
      SELECT s.submissionId, s.groupId, s.status, s.submitterEmail
      FROM submissions_with_status s
      WHERE s.submissionId = ? AND s.projectId = ?
    `).bind(submissionId, projectId).first();

    if (!submission) {
      return errorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Check if user is in the same group or is admin
    const userGroup = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ?
        AND projectId = ? AND groupId = ?
    `).bind(userEmail, projectId, submission.groupId).first();

    if (!userGroup && submission.submitterEmail !== userEmail) {
      return errorResponse('ACCESS_DENIED', 'You can only update your own group submissions');
    }

    if (submission.withdrawnTime) {
      return errorResponse('SUBMISSION_WITHDRAWN', 'Cannot update withdrawn submission');
    }

    const allowedUpdates: any = {};

    if (updates.content !== undefined) {
      allowedUpdates.content = updates.content;
    }

    if (updates.authors !== undefined) {
      allowedUpdates.actualAuthors = stringifyJSON(updates.authors);
    }

    if (updates.participationProposal !== undefined) {
      allowedUpdates.participationProposal = stringifyJSON(updates.participationProposal);
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(allowedUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(allowedUpdates);

    await env.DB.prepare(`
      UPDATE submissions
      SET ${setClause}
      WHERE submissionId = ? AND projectId = ?
    `).bind(...values, submissionId, projectId).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'submission_updated', 'submission', submissionId, {
      updatedFields: Object.keys(allowedUpdates)
    });  // No related entities needed for update

    return successResponse(null, 'Submission updated successfully');

  } catch (error) {
    console.error('Update submission error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update submission');
  }
}

/**
 * Withdraw submission (soft delete - sets status to 'withdrawn')
 * Follows append-only design principle - no actual deletion
 */
export async function withdrawSubmission(
  env: Env,
  userEmail: string,
  projectId: string,
  submissionId: string
): Promise<Response> {
  try {
    // Get submission to verify ownership
    const submission = await env.DB.prepare(`
      SELECT submissionId, groupId, stageId, status, submitterEmail, submitTime,
             withdrawnTime, approvedTime, participationProposal
      FROM submissions_with_status
      WHERE submissionId = ? AND projectId = ?
    `).bind(submissionId, projectId).first();

    if (!submission) {
      return errorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Check if user is in the same group
    const userGroup = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ?
        AND projectId = ? AND groupId = ?
    `).bind(userEmail, projectId, submission.groupId).first();

    if (!userGroup && submission.submitterEmail !== userEmail) {
      return errorResponse('ACCESS_DENIED', 'You can only withdraw your own group submissions');
    }

    // ========== PARTICIPANT VALIDATION ==========
    // Check if user is a participant in the submission
    // This prevents non-participating group members from deleting submissions
    const proposedParticipation = parseJSON(submission.participationProposal as string, {}) as Record<string, number>;
    const userParticipation = proposedParticipation[userEmail];

    if (userParticipation === undefined || userParticipation <= 0) {
      return errorResponse(
        'NOT_PARTICIPANT',
        'You cannot delete this submission because you are not listed as a participant. Only participants who contributed to this submission can delete it.'
      );
    }
    // ========== END PARTICIPANT VALIDATION ==========

    if (submission.withdrawnTime) {
      return errorResponse('ALREADY_WITHDRAWN', 'Submission already withdrawn');
    }

    if (submission.approvedTime) {
      return errorResponse('CANNOT_WITHDRAW_APPROVED', 'Cannot withdraw approved submission');
    }

    // Check if user has voted on this specific submission
    const userVote = await env.DB.prepare(`
      SELECT voteId FROM submissionapprovalvotes
      WHERE projectId = ? AND submissionId = ? AND voterEmail = ?
      LIMIT 1
    `).bind(projectId, submissionId, userEmail).first();

    if (userVote) {
      return errorResponse(
        'WITHDRAW_BLOCKED_VOTED',
        'Cannot withdraw: you have already voted on this submission'
      );
    }

    // ========== DEDUPLICATION: Prevent duplicate withdrawals ==========
    const now = Date.now();
    const timeBucket = Math.floor(now / 60000);
    const dedupKey = `submission_withdraw:${submissionId}:${userEmail}:${timeBucket}`;

    // Get userId for logging
    const userResult = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();
    const userId = userResult?.userId as string | undefined;

    // Check if this withdrawal is duplicate
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'submission_withdraw',
      userId,
      projectId,
      entityType: 'submission',
      entityId: submissionId,
      message: `User ${userEmail} withdrawing submission ${submissionId}`,
      context: { submissionId, groupId: submission.groupId, stageId: submission.stageId },
      relatedEntities: { stage: submission.stageId as string, group: submission.groupId as string }
    });

    if (!isNewAction) {
      // Duplicate withdrawal attempt - return already withdrawn submission
      return new Response(JSON.stringify({
        success: true,
        message: 'Submission already withdrawn (duplicate prevented)',
        data: {
          deduped: true,
          submissionId,
          status: 'withdrawn',
          groupId: submission.groupId,
          stageId: submission.stageId
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Soft delete with atomic check:
    // Only withdraw if this is still the latest non-withdrawn version
    // Use subquery to avoid TOCTOU race condition
    const result = await env.DB.prepare(`
      UPDATE submissions
      SET withdrawnTime = ?,
          withdrawnBy = ?,
          updatedAt = ?
      WHERE submissionId = ? AND projectId = ?
        AND withdrawnTime IS NULL
        AND approvedTime IS NULL
        -- Atomic check: only update if this is still the latest version
        AND submissionId = (
          SELECT submissionId FROM submissions_with_status
          WHERE projectId = ? AND stageId = ? AND groupId = ?
            AND withdrawnTime IS NULL
          ORDER BY submitTime DESC
          LIMIT 1
        )
    `).bind(now, userEmail, now, submissionId, projectId, projectId, submission.stageId, submission.groupId).run();

    // Check if any rows were actually updated
    if (!result.meta.changes || result.meta.changes === 0) {
      return errorResponse('CAN_ONLY_DELETE_FINAL_VERSION', 'Can only withdraw current active version. It may have been replaced by a newer submission, already withdrawn, or already approved.');
    }

    // Log operation (using 'submission_deleted' event name for compatibility with GAS)
    await logProjectOperation(env, userEmail, projectId, 'submission_withdrawn', 'submission', submissionId, {
      reason: 'user_withdrawal',
      originalSubmitTime: submission.submitTime,
      withdrawalDuration: Date.now() - (Number(submission.submitTime) || Date.now()),
      groupId: submission.groupId,
      stageId: submission.stageId
    }, {
      relatedEntities: {
        stage: submission.stageId as string,
        group: submission.groupId as string
      }
    });

    // 通知群組其他成員（撤回者除外）
    try {
      const groupMembers = await getGroupMemberEmails(env, projectId, submission.groupId as string);
      const otherMembers = groupMembers.filter(email => email !== userEmail);

      if (otherMembers.length > 0) {
        // Get stage name for better notification message
        const stage = await env.DB.prepare(`
          SELECT stageName FROM stages WHERE stageId = ? AND projectId = ?
        `).bind(submission.stageId, projectId).first();

        const stageName = (stage as any)?.stageName || '未命名階段';

        await queueBatchNotifications(env, otherMembers.map(email => ({
          targetUserEmail: email,
          type: 'submission_updated',
          title: '組員撤回了作品',
          content: `${userEmail} 已撤回您的組在 ${stageName} 階段的作品提交，需要重新提交並進行共識投票`,
          projectId,
          stageId: submission.stageId as string,
          submissionId,
          groupId: submission.groupId as string
        })));

        console.log(`✅ [withdrawSubmission] Sent withdrawal notifications to ${otherMembers.length} group members`);
      }
    } catch (notificationError) {
      console.error('[withdrawSubmission] Failed to send withdrawal notifications:', notificationError);
      // 通知失敗不應影響撤回流程
    }

    return successResponse(null, 'Submission withdrawn successfully');

  } catch (error: any) {
    console.error('Withdraw submission error:', error);

    // Handle specific D1 errors
    if (error.message?.includes('FOREIGN KEY constraint failed')) {
      return errorResponse('INVALID_REFERENCE', 'Invalid submission reference');
    }

    if (error.message?.includes('database is locked') ||
        error.message?.includes('timeout')) {
      return errorResponse('DATABASE_BUSY', 'Database is busy, please try again');
    }

    return errorResponse('SYSTEM_ERROR', `Failed to withdraw submission: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Delete submission (alias for withdrawSubmission)
 * Following GAS design: deleteSubmission is just an alias for withdrawSubmission
 * Both functions perform soft delete (status='withdrawn'), never hard delete
 *
 * @deprecated Use withdrawSubmission instead for clarity
 *
 * Permission Rules:
 * - Same group members can withdraw in active stage
 */
export async function deleteSubmission(
  env: Env,
  userEmail: string,
  projectId: string,
  submissionId: string
): Promise<Response> {
  // deleteSubmission is just an alias for withdrawSubmission (following GAS pattern)
  return withdrawSubmission(env, userEmail, projectId, submissionId);
}

/**
 * Get participation confirmations (approval votes) for a submission
 * Used for group self-governance voting on participation proposals
 */
export async function getParticipationConfirmations(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  submissionId: string
): Promise<Response> {
  try {
    console.log('🔍 [getParticipationConfirmations] Starting with params:', {
      userEmail,
      projectId,
      stageId,
      submissionId
    });

    // Find the submission
    const submission = await env.DB.prepare(`
      SELECT submissionId, groupId, participationProposal
      FROM submissions_with_status
      WHERE submissionId = ? AND projectId = ? AND stageId = ?
    `).bind(submissionId, projectId, stageId).first();

    console.log('📦 [getParticipationConfirmations] Submission query result:', submission);

    if (!submission) {
      console.log('❌ [getParticipationConfirmations] Submission not found');
      return errorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Check permissions early - Teacher/Observer don't need a group
    // Check if user can see voting details (Admin/Teacher/Observer - Level 0-2)
    const canSeeVotingDetails = await checkIsAdminTeacherOrObserver(env.DB, userEmail, projectId);

    // Check if user can see participation percentages (Teacher/Observer - Level 1-2 only)
    // Admin (Level 0) cannot see percentages - administrative role separation
    const canSeePercentages = await checkIsTeacherOrObserver(env.DB, userEmail, projectId);

    // Find user's group (only required for students, not for Teacher/Observer)
    const userGroup = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    console.log('👥 [getParticipationConfirmations] User group query result:', userGroup);

    // Allow access if:
    // 1. User is Admin/Teacher/Observer (Level 0-2), OR
    // 2. User is a student with an active group (Level 3-4)
    if (!userGroup && !canSeeVotingDetails) {
      console.log('❌ [getParticipationConfirmations] User is not Teacher/Observer and has no active group');
      return errorResponse('NOT_IN_GROUP', 'User is not in any active group and has no teacher/observer permissions');
    }

    // Check if user is in the same group as the submission
    // Teacher/Observer don't have a group, so isSameGroup is always false for them
    const isSameGroup = userGroup ? (userGroup.groupId === submission.groupId) : false;

    console.log('🔐 [getParticipationConfirmations] Permission check:', {
      userGroupId: userGroup?.groupId || 'N/A (Teacher/Observer)',
      submissionGroupId: submission.groupId,
      isSameGroup,
      canSeeVotingDetails,
      canSeePercentages
    });

    // Get all votes for this submission with voter details
    console.log('🗳️ [getParticipationConfirmations] Querying votes...');
    const votes = await env.DB.prepare(`
      SELECT
        v.voteId, v.voterEmail, v.agree, v.comment, v.createdTime,
        u.displayName as voterDisplayName,
        u.avatarSeed as voterAvatarSeed,
        u.avatarStyle as voterAvatarStyle,
        u.avatarOptions as voterAvatarOptions
      FROM submissionapprovalvotes v
      LEFT JOIN users u ON v.voterEmail = u.userEmail
      WHERE v.projectId = ? AND v.submissionId = ?
      ORDER BY v.createdTime ASC
    `).bind(projectId, submissionId).all();

    console.log('📊 [getParticipationConfirmations] Votes query result:', {
      hasResults: !!votes.results,
      count: votes.results?.length || 0
    });

    // Get all group members (use submission's groupId, not user's groupId)
    console.log('👥 [getParticipationConfirmations] Querying group members...');
    const allGroupMembers = await env.DB.prepare(`
      SELECT userEmail, role FROM usergroups
      WHERE projectId = ? AND groupId = ? AND isActive = 1
    `).bind(projectId, submission.groupId).all();

    console.log('👥 [getParticipationConfirmations] Group members query result:', {
      hasResults: !!allGroupMembers.results,
      count: allGroupMembers.results?.length || 0
    });

    // Defensive null checks
    if (!votes.results) {
      console.error('❌ [getParticipationConfirmations] Votes query returned no results array');
      return errorResponse('QUERY_ERROR', 'Failed to retrieve votes data');
    }

    if (!allGroupMembers.results) {
      console.error('❌ [getParticipationConfirmations] Group members query returned no results array');
      return errorResponse('QUERY_ERROR', 'Failed to retrieve group members data');
    }

    // Parse participation proposal with error handling
    let proposedParticipation = {};
    try {
      proposedParticipation = parseJSON(submission.participationProposal as string, {});
      console.log('✅ [getParticipationConfirmations] Parsed participation proposal:', proposedParticipation);
    } catch (parseError) {
      console.error('⚠️ [getParticipationConfirmations] Failed to parse participation proposal:', parseError);
      // Continue with empty object rather than failing
    }

    // Mask participation percentages for cross-group access
    // Only Teacher/Observer (Level 1-2) or same-group students can see percentages
    // Admin (Level 0) cannot see percentages - enforces role separation
    const shouldMaskPercentages = !isSameGroup && !canSeePercentages;

    if (shouldMaskPercentages) {
      console.log('🔒 [getParticipationConfirmations] Masking participation percentages - user is not Teacher/Observer or same group');
      const maskedParticipation: Record<string, null> = {};
      Object.keys(proposedParticipation).forEach(email => {
        maskedParticipation[email] = null; // Keep email, hide percentage
      });
      proposedParticipation = maskedParticipation;
      console.log('🔒 [getParticipationConfirmations] Masked participation:', proposedParticipation);
    } else if (!isSameGroup && canSeePercentages) {
      console.log('🔓 [getParticipationConfirmations] Teacher/Observer viewing cross-group - percentages visible');
    }

    const agreeVotes = votes.results.filter((v: any) => v.agree).length;
    const totalVotes = votes.results.length;
    const userVote = votes.results.find((v: any) => v.voterEmail === userEmail) as any;
    const hasUserVoted = !!userVote;

    // ========== CONSENSUS THRESHOLD FIX ==========
    // Calculate totalMembers from participationProposal (participants only)
    // NOT from usergroups table (all group members)
    // This ensures consensus threshold matches voting eligibility
    const participants = Object.keys(proposedParticipation).filter(
      email => typeof proposedParticipation[email] === 'number' && proposedParticipation[email] > 0
    );
    const totalMembers = participants.length;
    // ========== END CONSENSUS THRESHOLD FIX ==========

    // Check if all members have voted agree (unanimous consent)
    const isFullyApproved = agreeVotes === totalMembers && agreeVotes > 0;

    console.log('📈 [getParticipationConfirmations] Voting summary calculated:', {
      agreeVotes,
      totalVotes,
      totalMembers,
      isFullyApproved,
      hasUserVoted,
      isSameGroup
    });

    // Mask voting details for cross-group students
    // Admin/Teacher/Observer (Level 0-2) see full voting details for all groups
    const shouldMaskVotingDetails = !isSameGroup && !canSeeVotingDetails;
    const maskedVotes = shouldMaskVotingDetails ? [] : votes.results;
    const maskedCurrentUserVote = (isSameGroup || canSeeVotingDetails) && userVote ? {
      voteId: userVote.voteId,
      agree: userVote.agree,
      comment: userVote.comment,
      createdTime: userVote.createdTime
    } : null;

    if (shouldMaskVotingDetails) {
      console.log('🔒 [getParticipationConfirmations] Masking voting details and statistics for cross-group student');
    }

    const votingSummary = {
      votes: maskedVotes, // Empty for cross-group students; full for admin/teacher/observer or same group
      agreeVotes: shouldMaskVotingDetails ? 0 : agreeVotes, // Mask for cross-group students
      totalVotes: shouldMaskVotingDetails ? 0 : totalVotes, // Mask for cross-group students
      totalMembers: shouldMaskVotingDetails ? 0 : totalMembers, // Mask for cross-group students
      isApproved: shouldMaskVotingDetails ? false : isFullyApproved, // Mask for cross-group students
      hasUserVoted: (isSameGroup || canSeeVotingDetails) ? hasUserVoted : false, // Visible for same group or Level 0-2
      currentUserVote: maskedCurrentUserVote, // Visible for same group or Level 0-2
      participationProposal: proposedParticipation, // Masked for cross-group students/admin; unmasked for teacher/observer
      isSameGroup, // Flag: user is in same group
      canSeeVotingDetails, // Flag: user can see voting details (Level 0-2)
      canSeePercentages // Flag: user can see percentages (Level 1-2 only, NOT admin)
    };

    console.log('✅ [getParticipationConfirmations] Returning success response');
    return successResponse(votingSummary);

  } catch (error) {
    console.error('❌ [getParticipationConfirmations] Caught error:', error);
    console.error('❌ [getParticipationConfirmations] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return errorResponse('SYSTEM_ERROR', `Failed to get participation confirmations: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get all voting history for a group in a stage (across all submission versions)
 */
export async function getGroupStageVotingHistory(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  groupId?: string
): Promise<Response> {
  try {
    // Find user's group if groupId not provided
    const userGroup = await env.DB.prepare(`
      SELECT groupId, role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    const targetGroupId = groupId || (userGroup ? userGroup.groupId as string : null);

    if (!targetGroupId) {
      return errorResponse('NOT_IN_GROUP', 'User is not in any active group and no group specified');
    }

    // Verify user has access to this group
    if (targetGroupId !== userGroup?.groupId) {
      // Check if user is admin/teacher
      const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(userEmail).first();
      if (!user) {
        return errorResponse('ACCESS_DENIED', 'Cannot access other group\'s data');
      }

      const project = await env.DB.prepare('SELECT createdBy FROM projects WHERE projectId = ?').bind(projectId).first();
      const isCreator = project && project.createdBy === user.userId;

      // Check if user is teacher or observer (Level 1-2)
      const projectViewer = await env.DB.prepare(`
        SELECT role FROM projectviewers
        WHERE projectId = ? AND userEmail = ? AND isActive = 1
      `).bind(projectId, userEmail).first();
      const isTeacherOrObserver = projectViewer && (projectViewer.role === 'teacher' || projectViewer.role === 'observer');

      const hasGlobalPM = await env.DB.prepare(`
        SELECT gg.globalPermissions
        FROM globalusergroups gug
        JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
        WHERE gug.userEmail = ? AND gug.isActive = 1
      `).bind(userEmail).first();
      const hasAdminAccess = hasGlobalPM && JSON.parse(hasGlobalPM.globalPermissions as string).includes('create_project');

      if (!isCreator && !isTeacherOrObserver && !hasAdminAccess) {
        return errorResponse('ACCESS_DENIED', 'Cannot access other group\'s data');
      }
    }

    // Get all submissions for this group in this stage
    // Include participationProposal to calculate per-submission totalMembers
    const groupSubmissions = await env.DB.prepare(`
      SELECT submissionId, status, submitTime, submitterEmail, participationProposal
      FROM submissions_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ?
      ORDER BY submitTime ASC
    `).bind(projectId, stageId, targetGroupId).all();

    // Get submission IDs
    const submissionIds = groupSubmissions.results.map((s: any) => s.submissionId);

    // Get all votes for these submissions
    let allVotes: any[] = [];
    if (submissionIds.length > 0) {
      // D1 doesn't support IN with array binding, so we need to build the query
      const placeholders = submissionIds.map(() => '?').join(',');
      const votesResult = await env.DB.prepare(`
        SELECT
          v.voteId, v.submissionId, v.voterEmail, v.agree, v.createdTime,
          u.displayName as voterDisplayName,
          u.avatarSeed as voterAvatarSeed,
          u.avatarStyle as voterAvatarStyle,
          u.avatarOptions as voterAvatarOptions
        FROM submissionapprovalvotes v
        LEFT JOIN users u ON v.voterEmail = u.userEmail
        WHERE v.projectId = ? AND v.submissionId IN (${placeholders})
        ORDER BY v.createdTime ASC
      `).bind(projectId, ...submissionIds).all();
      allVotes = votesResult.results as any[];
    }

    // ========== CONSENSUS THRESHOLD FIX ==========
    // Calculate totalMembers per submission from participationProposal
    // NOT from usergroups table (all group members)
    // Build response with all submission data and their votes
    const versionsWithVotes = groupSubmissions.results.map((submission: any) => {
      const submissionVotes = allVotes.filter(v => v.submissionId === submission.submissionId);

      // Calculate totalMembers from this submission's participationProposal
      let totalMembers = 0;
      try {
        const proposedParticipation = parseJSON(submission.participationProposal as string, {});
        const participants = Object.keys(proposedParticipation).filter(
          email => typeof proposedParticipation[email] === 'number' && proposedParticipation[email] > 0
        );
        totalMembers = participants.length;
      } catch (error) {
        console.error('Failed to parse participationProposal for submission:', submission.submissionId, error);
        totalMembers = 0; // Fallback to 0 if parsing fails
      }

      return {
        submissionId: submission.submissionId,
        status: submission.status,
        submittedTime: submission.submitTime,
        submitter: submission.submitterEmail,
        votes: submissionVotes.map(v => ({
          voteId: v.voteId,
          voterEmail: v.voterEmail,
          voterDisplayName: v.voterDisplayName || null,
          voterAvatarSeed: v.voterAvatarSeed || null,
          voterAvatarStyle: v.voterAvatarStyle || null,
          voterAvatarOptions: v.voterAvatarOptions || null,
          agree: v.agree,
          createdTime: v.createdTime
        })),
        votesSummary: {
          totalVotes: submissionVotes.length,
          agreeVotes: submissionVotes.filter(v => v.agree).length,
          disagreeVotes: submissionVotes.filter(v => !v.agree).length
        },
        totalMembers // Add per-submission totalMembers
      };
    });
    // ========== END CONSENSUS THRESHOLD FIX ==========

    const currentActive = groupSubmissions.results.find((s: any) => !s.withdrawnTime);

    // Get totalMembers from current active version (for backward compatibility)
    // Each version now has its own totalMembers field
    const currentActiveVersion = versionsWithVotes.find(v => v.submissionId === currentActive?.submissionId);
    const globalTotalMembers = currentActiveVersion?.totalMembers || 0;

    return successResponse({
      groupId: targetGroupId,
      stageId,
      totalMembers: globalTotalMembers, // For backward compatibility, use current active version's totalMembers
      versions: versionsWithVotes, // Each version has its own totalMembers field
      currentActiveVersion: currentActive ? (currentActive as any).submissionId : null
    });

  } catch (error) {
    console.error('Get group stage voting history error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get voting history');
  }
}

/**
 * Vote on participation proposal for group's submission
 * Only group members who are listed as participants can vote
 */
export async function voteParticipationProposal(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  agree: boolean
): Promise<Response> {
  try {
    // SECURITY: Backend determines which submission to vote on (not frontend)
    // Step 1: Find user's active group
    const userGroup = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (!userGroup) {
      return errorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Step 2: Find the latest SUBMITTED submission for user's group
    // CRITICAL: Only query submissions with status='submitted' to prevent:
    // - Voting on already approved submissions (status='approved')
    // - Voting on withdrawn submissions (status='withdrawn')
    const submission = await env.DB.prepare(`
      SELECT submissionId, groupId, status, participationProposal, stageId
      FROM submissions_with_status
      WHERE projectId = ? AND stageId = ? AND groupId = ?
        AND status = 'submitted'
      ORDER BY submitTime DESC
      LIMIT 1
    `).bind(projectId, stageId, userGroup.groupId).first();

    if (!submission) {
      return errorResponse('NO_ACTIVE_SUBMISSION', 'No active submission found for your group in this stage');
    }

    // Defensive check: Verify submission belongs to the correct stage
    if (submission.stageId !== stageId) {
      return errorResponse('INVALID_STAGE', 'Submission does not belong to the specified stage');
    }

    // Extract submissionId from backend query result (secure)
    const submissionId = submission.submissionId as string;

    // Parse the participation proposal
    const proposedParticipation = parseJSON(submission.participationProposal as string, {}) as Record<string, number>;

    // Check if user has participation percentage in the proposal
    const userParticipation = proposedParticipation[userEmail];
    if (userParticipation === undefined || userParticipation <= 0) {
      return errorResponse('NOT_PARTICIPANT', 'You are not listed as a participant in this submission');
    }

    // ========== CONSENSUS THRESHOLD FIX ==========
    // Calculate totalMembers from participationProposal (participants only)
    // NOT from usergroups table (all group members)
    // This ensures consensus threshold matches voting eligibility
    const participants = Object.keys(proposedParticipation).filter(
      email => proposedParticipation[email] > 0
    );
    const totalMembers = participants.length;
    // ========== END CONSENSUS THRESHOLD FIX ==========

    // Create vote record
    const voteId = generateId('vote');
    const timestamp = Date.now();

    // ========== DEDUPLICATION: Prevent duplicate votes ==========
    // Generate dedupKey with 60-second time bucket (same as security actions)
    const timeBucket = Math.floor(timestamp / 60000);
    const dedupKey = `approval_vote:${submissionId}:${userEmail}:${timeBucket}`;

    // Get userId for logging (optional, for better audit trail)
    const userResult = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();
    const userId = userResult?.userId as string | undefined;

    // Check if this vote action is duplicate using sys_logs.dedupKey
    const isNewAction = await logApiAction(env, {
      dedupKey,
      action: 'submission_approval_vote',
      userId,
      projectId,
      entityType: 'submission',
      entityId: submissionId,
      message: `User ${userEmail} voted ${agree ? 'approve' : 'reject'} on submission ${submissionId}`,
      context: {
        submissionId,
        stageId,
        groupId: submission.groupId,
        voterEmail: userEmail,
        agree,
        timeBucket
      },
      relatedEntities: {
        stage: stageId,
        group: submission.groupId as string
      }
    });

    // If duplicate vote detected, return success (idempotent behavior)
    if (!isNewAction) {
      console.log(`[voteParticipationProposal] Duplicate vote prevented: ${dedupKey}`);

      // Return existing voting status to maintain idempotency
      const existingVotes = await env.DB.prepare(`
        SELECT voteId, voterEmail, agree, createdTime
        FROM submissionapprovalvotes
        WHERE projectId = ? AND submissionId = ?
      `).bind(projectId, submissionId).all();

      const agreeCount = existingVotes.results.filter((v: any) => v.agree).length;
      const totalVotesCount = existingVotes.results.length;
      const isApproved = agreeCount >= totalMembers && agreeCount > 0;

      return new Response(JSON.stringify({
        success: true,
        message: 'Vote already recorded (duplicate prevented)',
        data: {
          deduped: true,
          votingSummary: {
            totalMembers,
            agreeVotes: agreeCount,
            disagreeVotes: totalVotesCount - agreeCount,
            totalVotes: totalVotesCount,
            isApproved
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ========== END DEDUPLICATION ==========

    // Use D1 batch for atomic transaction:
    // 1. Insert vote (will fail if duplicate due to unique constraint)
    // 2. Conditionally update submission to 'approved' if unanimous consent reached
    const statements = [
      // Insert the vote
      env.DB.prepare(`
        INSERT INTO submissionapprovalvotes (
          voteId, projectId, submissionId, stageId, groupId, voterEmail, agree, createdTime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        voteId,
        projectId,
        submissionId,
        stageId,
        submission.groupId,
        userEmail,
        agree ? 1 : 0,
        timestamp
      ),

      // Conditionally approve: only if this is latest version AND all members agreed
      env.DB.prepare(`
        UPDATE submissions
        SET approvedTime = ?,
            updatedAt = ?
        WHERE submissionId = ? AND projectId = ?
          AND withdrawnTime IS NULL
          AND approvedTime IS NULL
          -- Ensure this is still the latest version
          AND submissionId = (
            SELECT submissionId FROM submissions_with_status
            WHERE projectId = ? AND stageId = ? AND groupId = ?
              AND withdrawnTime IS NULL
            ORDER BY submitTime DESC
            LIMIT 1
          )
          -- Ensure unanimous consent: count agrees = total members
          AND (
            SELECT COUNT(*) FROM submissionapprovalvotes
            WHERE submissionId = ? AND projectId = ? AND agree = 1
          ) >= ?
      `).bind(
        timestamp,
        timestamp,
        submissionId,
        projectId,
        projectId,
        stageId,
        submission.groupId,
        submissionId,
        projectId,
        totalMembers
      )
    ];

    // Execute atomically - if vote already exists, the INSERT will fail
    try {
      await env.DB.batch(statements);
    } catch (batchError: any) {
      // Handle constraint violations gracefully
      if (batchError.message?.includes('UNIQUE constraint failed') ||
          batchError.message?.includes('already voted')) {
        return errorResponse('ALREADY_VOTED', 'You have already voted on this submission');
      }
      // Re-throw other errors
      throw batchError;
    }

    // Get updated voting summary (after atomic transaction)
    const allVotes = await env.DB.prepare(`
      SELECT voteId, voterEmail, agree, createdTime
      FROM submissionapprovalvotes
      WHERE projectId = ? AND submissionId = ?
    `).bind(projectId, submissionId).all();

    const agreeVotes = allVotes.results.filter((v: any) => v.agree).length;
    const totalVotes = allVotes.results.length;

    // Check if approval happened
    const isFullyApproved = agreeVotes >= (totalMembers as number) && agreeVotes > 0;

    // Log individual vote to eventlogs (for project participants to see)
    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'submission_participation_voted',
      'submission',
      submissionId,
      {
        voterEmail: userEmail,
        agree,
        groupId: submission.groupId,
        stageId,
        voteId,
        totalMembers,
        currentVotes: {
          agreeVotes,
          totalVotes
        }
      },
      {
        level: 'info',
        relatedEntities: {
          vote: voteId,
          stage: stageId,
          group: submission.groupId as string
        }
      }
    );

    // Log approval operation if it happened
    if (isFullyApproved) {
      await logProjectOperation(env, userEmail, projectId, 'submission_approved', 'submission', submissionId, {
        totalVotes,
        agreeVotes,
        approvalTime: Date.now(),
        approvalType: 'unanimous',
        allVoters: allVotes.results.map((v: any) => v.voterEmail),
        participantsList: Object.keys(proposedParticipation),
        groupId: submission.groupId,
        stageId
      }, {
        relatedEntities: {
          stage: stageId,
          group: submission.groupId as string
        }
      });

      // 發送審核通過通知給所有組員
      try {
        const groupMembers = await getGroupMemberEmails(env, projectId, submission.groupId as string);

        // Fetch stage name for notification
        const stage = await env.DB.prepare(`
          SELECT stageName FROM stages WHERE stageId = ? AND projectId = ?
        `).bind(stageId, projectId).first();
        const stageName = (stage as any)?.stageName || '未命名階段';

        await queueBatchNotifications(env, groupMembers.map(email => ({
          targetUserEmail: email,
          type: 'submission_approved',
          title: '作品審核通過',
          content: `您的組在 ${stageName} 階段的作品已通過全員審核`,
          projectId,
          stageId: submission.stageId as string,
          submissionId,
          groupId: submission.groupId as string
        })));
      } catch (error) {
        console.error('[approveSubmission] Failed to send approval notifications:', error);
      }
    }

    // Get proposed participants count
    const proposedParticipants = Object.keys(proposedParticipation).filter(
      email => proposedParticipation[email] > 0
    );

    const votingSummary = {
      votes: allVotes.results,
      agreeVotes,
      totalVotes,
      totalMembers,
      isApproved: isFullyApproved, // Set to true when all members agree
      hasUserVoted: true,
      allParticipantsAgreed: agreeVotes === proposedParticipants.length,
      participationProposal: proposedParticipation
    };

    return successResponse({
      vote: {
        voteId,
        submissionId,
        voterEmail: userEmail,
        agree,
        createdTime: timestamp
      },
      votingSummary
    }, 'Vote recorded successfully');

  } catch (error: any) {
    console.error('Vote participation proposal error:', error);

    // Handle specific D1 errors
    if (error.message?.includes('UNIQUE constraint failed') ||
        error.message?.includes('already voted')) {
      return errorResponse('ALREADY_VOTED', 'You have already voted on this submission');
    }

    if (error.message?.includes('FOREIGN KEY constraint failed')) {
      return errorResponse('INVALID_REFERENCE', 'Invalid submission or user reference');
    }

    if (error.message?.includes('database is locked') ||
        error.message?.includes('timeout')) {
      return errorResponse('DATABASE_BUSY', 'Database is busy, please try again');
    }

    return errorResponse('SYSTEM_ERROR', `Failed to record vote: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Helper: Log operation
 */
// Logging is now handled by centralized utils/logging module
