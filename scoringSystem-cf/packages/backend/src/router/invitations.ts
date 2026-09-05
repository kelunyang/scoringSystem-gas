import type { Env, HonoVariables } from '../types';
/**
 * Invitation Code Router
 * Migrated from GAS scripts/invitation.js and invitation_verification_api.js
 * Migrated to Hono RPC format with Zod validation
 *
 * Permission Requirements:
 * - POST /invitations/generate - Requires generate_invites OR system_admin permission
 * - POST /invitations/generate-batch - Requires generate_invites OR system_admin permission
 * - POST /invitations/list - Requires generate_invites OR system_admin OR manage_users permission
 * - POST /invitations/deactivate - Requires generate_invites OR system_admin permission
 * - POST /invitations/resend-email - Requires generate_invites OR system_admin permission
 * - POST /invitations/verify - Public endpoint (no auth required)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { guardActorEmailQuota, rateLimitResponse } from '../middleware/rate-limit';
import { guardEmailTrigger } from '../utils/email-budget';
import { hasGlobalPermission, GLOBAL_PERMISSIONS } from '../utils/permissions';
import {
  generateInvitationCode,
  generateBatchInvitationCodes
} from '../handlers/invitations/generate';
import {
  getUserInvitations,
  deactivateInvitation,
  reactivateInvitation
} from '../handlers/invitations/manage';
import { resendInvitationEmail } from '../handlers/invitations/resend';
import { verifyInvitationCode } from '../handlers/invitations/validate';
import { getInvitationEmailStatus } from '../handlers/invitations/email-status';
import {
  GenerateInvitationRequestSchema,
  GenerateBatchInvitationsRequestSchema,
  ListInvitationsRequestSchema,
  DeactivateInvitationRequestSchema,
  ResendInvitationEmailRequestSchema,
  VerifyInvitationRequestSchema
} from '@repo/shared/schemas/invitations';
import { z } from 'zod';
import { errorResponse } from '../utils/response';


const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * POST /invitations/verify
 * Verify invitation code (public endpoint, no auth required)
 * Body: { invitationCode: string, userEmail: string, turnstileToken?: string }
 */
app.post(
  '/verify',
  zValidator('json', VerifyInvitationRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    const response = await verifyInvitationCode(
      c.env,
      body.invitationCode,
      body.userEmail
    );

    return response;
  }
);

// Apply authentication middleware to all routes below
app.use('*', authMiddleware);

/**
 * Generate invitation code
 * Body: { targetEmail, validDays?, defaultTags?, defaultGlobalGroups? }
 */
app.post(
  '/generate',
  zValidator('json', GenerateInvitationRequestSchema),
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to generate invitations');
    }

    const body = c.req.valid('json');
    const {
      targetEmail,
      validDays = 7,
      defaultTags = [],
      defaultGlobalGroups = []
    } = body;

    // An invitation always sends a mail, so charge before creating the code.
    // The per-recipient rule is what stops "resend the invite 50 times to
    // annoy someone"; channel 'verified' because the caller is an
    // authenticated staff account, and no per-IP rule for the same reason.
    const quota = await guardActorEmailQuota(c.env, user.userEmail, 1);
    if (!quota.allowed) {
      return rateLimitResponse(quota, 'RATE_LIMIT_EXCEEDED', '寄信次數已達每小時上限，請稍後再試');
    }
    const recipientGuard = await guardEmailTrigger(c.env, {
      recipient: targetEmail,
      channel: 'verified'
    });
    if (!recipientGuard.allowed) {
      return rateLimitResponse(
        recipientGuard,
        'EMAIL_RATE_LIMITED',
        '這個信箱最近已收過邀請信，請稍後再試'
      );
    }

    const response = await generateInvitationCode(
      c.env,
      user.userEmail,
      targetEmail,
      validDays,
      defaultTags,
      defaultGlobalGroups
    );

    return response;
  }
);

/**
 * Generate batch invitation codes
 * Body: { targetEmails[], validDays?, defaultTags?, defaultGlobalGroups? }
 */
app.post(
  '/generate-batch',
  zValidator('json', GenerateBatchInvitationsRequestSchema),
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to generate invitations');
    }

    const body = c.req.valid('json');
    const {
      targetEmails,
      validDays = 7,
      defaultTags = [],
      defaultGlobalGroups = []
    } = body;

    // Charge the whole batch. No per-recipient check here: a batch sends each
    // address exactly one mail, so the actor quota plus the system-wide daily
    // budget are the controls that matter, and looping the per-recipient rule
    // over 400 addresses would cost 400 extra round trips for nothing.
    const quota = await guardActorEmailQuota(c.env, user.userEmail, targetEmails.length);
    if (!quota.allowed) {
      return rateLimitResponse(
        quota,
        'RATE_LIMIT_EXCEEDED',
        `這批 ${targetEmails.length} 封邀請信會超過每小時寄信上限（剩餘 ${quota.remaining ?? 0} 封），請分批寄送`
      );
    }

    const response = await generateBatchInvitationCodes(
      c.env,
      user.userEmail,
      targetEmails,
      validDays,
      defaultTags,
      defaultGlobalGroups
    );

    return response;
  }
);

/**
 * List user's invitations
 * Body: { includeUsed?, includeExpired?, limit?, offset? }
 */
app.post(
  '/list',
  zValidator('json', ListInvitationsRequestSchema),
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin OR manage_users
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.MANAGE_USERS);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view invitations');
    }

    const response = await getUserInvitations(
      c.env,
      user.userEmail
    );

    return response;
  }
);

/**
 * Deactivate invitation
 * Body: { invitationId }
 */
app.post(
  '/deactivate',
  zValidator('json', DeactivateInvitationRequestSchema),
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to deactivate invitations');
    }

    const body = c.req.valid('json');
    const { invitationId } = body;

    const response = await deactivateInvitation(
      c.env,
      invitationId,
      user.userEmail
    );

    return response;
  }
);

/**
 * Reactivate invitation
 * Body: { invitationId }
 */
app.post(
  '/reactivate',
  zValidator('json', DeactivateInvitationRequestSchema), // Same schema as deactivate
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to reactivate invitations');
    }

    const body = c.req.valid('json');
    const { invitationId } = body;

    const response = await reactivateInvitation(
      c.env,
      invitationId,
      user.userEmail
    );

    return response;
  }
);

/**
 * Resend invitation email
 * Body: { invitationId }
 */
app.post(
  '/resend-email',
  zValidator('json', ResendInvitationEmailRequestSchema),
  async (c) => {
    const user = c.get('user');

    // Check permission: generate_invites OR system_admin
    const hasPermission = await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.GENERATE_INVITES) ||
                          await hasGlobalPermission(c.env.DB, user.userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to resend invitation emails');
    }

    const body = c.req.valid('json');
    const { invitationId } = body;

    const quota = await guardActorEmailQuota(c.env, user.userEmail, 1);
    if (!quota.allowed) {
      return rateLimitResponse(quota, 'RATE_LIMIT_EXCEEDED', '寄信次數已達每小時上限，請稍後再試');
    }

    // The per-recipient guard lives inside resendInvitationEmail, which is
    // where the target address is looked up.
    const response = await resendInvitationEmail(
      c.env,
      invitationId,
      user.userEmail
    );

    return response;
  }
);

/**
 * Get email send status for invitation codes (batch query)
 * Body: { invitationCodes: string[] }
 * Permissions: Requires system_admin OR generate_invites
 */
const EmailStatusRequestSchema = z.object({
  invitationCodes: z.array(z.string()).min(1).max(100)
});

app.post(
  '/email-status',
  zValidator('json', EmailStatusRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getInvitationEmailStatus(
      c.env,
      user.userEmail,
      body.invitationCodes
    );

    return response;
  }
);

export default app;
