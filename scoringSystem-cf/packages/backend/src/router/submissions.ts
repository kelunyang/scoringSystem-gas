import type { Env } from '../types';
/**
 * Submission Management Router
 * Migrated from GAS scripts/submissions_api.js
 *
 * Endpoints:
 * - POST /submissions/submit - Submit a deliverable
 * - POST /submissions/list - List stage submissions
 * - POST /submissions/details - Get submission details
 * - POST /submissions/update - Update submission (DEPRECATED)
 * - POST /submissions/delete - Delete submission (admin)
 * - POST /submissions/versions - Get submission versions
 * - POST /submissions/versions/restore - Restore previous version
 * - POST /submissions/versions/compare - Compare two versions
 * - POST /submissions/force-withdraw - Force withdraw submission (teacher only)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import { requireActiveStage } from '../middleware/require-stage-status';
import {
  submitDeliverable,
  getStageSubmissions,
  getSubmissionDetails,
  // updateSubmission, // DEPRECATED - not used by frontend
  deleteSubmission,
  getParticipationConfirmations,
  getGroupStageVotingHistory,
  voteParticipationProposal,
  forceWithdrawSubmission
} from '../handlers/submissions/manage';
import {
  getSubmissionVersions,
  restoreSubmissionVersion
} from '../handlers/submissions/versions';
import {
  SubmitDeliverableRequestSchema,
  ListSubmissionsRequestSchema,
  GetSubmissionDetailsRequestSchema,
  DeleteSubmissionRequestSchema,
  GetSubmissionVersionsRequestSchema,
  RestoreSubmissionVersionRequestSchema,
  GetParticipationStatusRequestSchema,
  GetVotingHistoryRequestSchema,
  ConfirmParticipationRequestSchema,
  ForceWithdrawSubmissionRequestSchema
} from '@repo/shared/schemas/submissions';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Submit a deliverable
 * Body: { projectId, stageId, submissionData: { content, authors?, participationProposal? } }
 */
app.post(
  '/submit',
  requireActiveStage,
  zValidator('json', SubmitDeliverableRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check basic project access - handler will verify group membership
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to submit',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await submitDeliverable(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.submissionData
    );

    return response;
  }
);

/**
 * List stage submissions
 * Body: { projectId, stageId, options?: { includeWithdrawn?, groupId? } }
 */
app.post(
  '/list',
  zValidator('json', ListSubmissionsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view submissions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageSubmissions(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.options || {}
    );

    return response;
  }
);

/**
 * Get submission details
 * Body: { projectId, submissionId }
 */
app.post(
  '/details',
  zValidator('json', GetSubmissionDetailsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view submission',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getSubmissionDetails(
      c.env,
      user.userEmail,
      body.projectId,
      body.submissionId
    );

    return response;
  }
);


/**
 * Delete submission (same group members can delete, only in active stage)
 * Body: { projectId, submissionId }
 */
app.post(
  '/delete',
  requireActiveStage,
  zValidator('json', DeleteSubmissionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check basic project access - handler will verify group membership
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to delete submission',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await deleteSubmission(
      c.env,
      user.userEmail,
      body.projectId,
      body.submissionId
    );

    return response;
  }
);

/**
 * Get submission versions
 * Body: { projectId, stageId, options?: { groupId?, includeWithdrawn? } }
 */
app.post(
  '/versions',
  zValidator('json', GetSubmissionVersionsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view submission versions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getSubmissionVersions(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.options || {}
    );

    return response;
  }
);


/**
 * Restore submission version (alias for /versions/restore)
 * POST /submissions/restore
 */
app.post(
  '/restore',
  zValidator('json', RestoreSubmissionVersionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await restoreSubmissionVersion(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.submissionId
    );

    return response;
  }
);

/**
 * Get participation confirmations (approval votes)
 * Body: { projectId, stageId, submissionId }
 */
app.post(
  '/participation-status',
  zValidator('json', GetParticipationStatusRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Dual-layer permission defense (six-layer model):
    // Layer 1 (Router): Check basic project access ('view' permission)
    //   - Filters out Level 5 users (no group, canEnter=false)
    //   - Allows Level 0-4 users to proceed
    // Layer 2 (Handler): Role-based data visibility with separated permissions
    //   Voting Details (votes, hasUserVoted, currentUserVote):
    //     - Level 0 (Admin/Creator): ✅ Can see all groups
    //     - Level 1 (Teacher): ✅ Can see all groups
    //     - Level 2 (Observer): ✅ Can see all groups
    //     - Level 3-4 (Students): ✅ Own group only, ❌ other groups masked
    //   Participation Percentages (participationProposal):
    //     - Level 0 (Admin/Creator): ❌ Cannot see (role separation)
    //     - Level 1 (Teacher): ✅ Can see all groups (for grading)
    //     - Level 2 (Observer): ✅ Can see all groups (for monitoring)
    //     - Level 3-4 (Students): ✅ Own group only, ❌ other groups masked
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getParticipationConfirmations(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.submissionId
    );

    return response;
  }
);

/**
 * Get voting history for a group in a stage
 * Body: { projectId, stageId, groupId? }
 */
app.post(
  '/voting-history',
  zValidator('json', GetVotingHistoryRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check basic project access - handler will verify group access
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getGroupStageVotingHistory(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.groupId
    );

    return response;
  }
);

/**
 * Vote on participation proposal (confirm participation)
 * Body: { projectId, stageId, agree }
 *
 * SECURITY: submissionId is determined by backend, not frontend.
 * Backend automatically finds the latest 'submitted' submission for user's group.
 * Users can ONLY vote on their own group's submissions.
 */
app.post(
  '/confirm-participation',
  requireActiveStage,
  zValidator('json', ConfirmParticipationRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Check basic project access - handler will verify group membership and voting eligibility
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, body.projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await voteParticipationProposal(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.agree
    );

    return response;
  }
);

/**
 * Force withdraw submission (teacher only)
 * Body: { projectId, submissionId, reason }
 *
 * SECURITY: Only teachers can force withdraw submissions.
 * - Can withdraw any submission including approved ones
 * - Reason is sent via email to all group members
 * - withdrawnBy is set to 'teacher' literal (not teacher's email)
 * - Full details stored in eventlogs.metadata
 */
app.post(
  '/force-withdraw',
  zValidator('json', ForceWithdrawSubmissionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Permission check is done inside handler (checkProjectRole)
    // Handler verifies user is a teacher for this project

    const response = await forceWithdrawSubmission(
      c.env,
      user.userEmail,
      body.projectId,
      body.submissionId,
      body.reason
    );

    return response;
  }
);

export default app;
