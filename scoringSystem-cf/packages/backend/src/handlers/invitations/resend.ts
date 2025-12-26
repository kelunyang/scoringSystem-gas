/**
 * Resend Invitation Email Handler
 * Allows resending invitation emails for active invitations
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { sendInvitationEmail } from './email';
import { logGlobalOperation } from '../../utils/logging';

/**
 * Resend invitation email
 */
export async function resendInvitationEmail(
  env: Env,
  invitationId: string,
  userEmail: string
): Promise<Response> {
  try {
    // Get invitation from database (using VIEW for auto-calculated status)
    const invitation = await env.DB.prepare(`
      SELECT i.*, u.userEmail as creatorEmail
      FROM invitation_codes_with_status i
      LEFT JOIN users u ON i.createdBy = u.userId
      WHERE i.invitationId = ?
    `).bind(invitationId).first();

    if (!invitation) {
      return errorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }

    // Check if invitation is active
    if (invitation.status !== 'active') {
      return errorResponse('INVITATION_NOT_ACTIVE', `Cannot resend email for ${invitation.status} invitation`);
    }

    // Check if invitation has expired
    const now = Date.now();
    if (invitation.expiryTime && (invitation.expiryTime as number) < now) {
      return errorResponse('INVITATION_EXPIRED', 'Cannot resend email for expired invitation');
    }

    // Check if user has permission (creator or admin)
    // This check should be done in the router with proper permission middleware

    if (!invitation.targetEmail) {
      return errorResponse('NO_TARGET_EMAIL', 'Invitation has no target email');
    }

    // Get the full invitation code from database (now stored as plain text)
    const invitationCode = invitation.invitationCode as string;

    if (!invitationCode) {
      return errorResponse('NO_INVITATION_CODE', 'Cannot resend: invitation code not found in database');
    }

    // Calculate remaining valid days
    const remainingTime = (invitation.expiryTime as number) - now;
    const remainingDays = Math.ceil(remainingTime / (24 * 60 * 60 * 1000));
    const validDays = remainingDays > 0 ? remainingDays : 7; // fallback to 7 days

    // Queue invitation email (async, non-blocking)
    try {
      await sendInvitationEmail(
        env,
        invitation.targetEmail as string,
        invitationCode, // Use full invitation code instead of displayCode
        validDays,
        invitation.creatorEmail as string || 'System Administrator'
      );
      console.log(`[Resend] Invitation email queued for ${invitation.targetEmail}`);
    } catch (emailError) {
      console.error('[Resend] Failed to queue invitation email:', emailError);
      return errorResponse('EMAIL_QUEUE_FAILED', 'Failed to queue invitation email');
    }

    // Log email resend
    await logGlobalOperation(
      env,
      userEmail,
      'invitation_email_resent',
      'invitation',
      invitationId,
      {
        targetEmail: invitation.targetEmail,
        remainingDays,
        resentBy: userEmail
      },
      { level: 'info' }
    );

    return successResponse({
      invitationId,
      targetEmail: invitation.targetEmail
    }, 'Invitation email queued successfully');
  } catch (error) {
    console.error('Resend invitation email error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to resend invitation email');
  }
}
