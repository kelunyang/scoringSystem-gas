/**
 * Invitation Code Management Handlers
 * Migrated from GAS scripts/invitation.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';

/**
 * Invitation row type from invitation_codes_with_status VIEW
 */
interface InvitationRow {
  invitationId: string;
  invitationCode: string;
  targetEmail: string;
  creatorEmail: string;
  createdBy: string;
  status: string;
  usedTime: number | null;
  expiryTime: number;
  deactivatedTime: number | null;
}

/**
 * List invitations created by a user
 */
export async function getUserInvitations(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    const userId = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!userId) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    const invitations = await env.DB.prepare(`
      SELECT
        ic.*,
        u.displayName as creatorDisplayName,
        u.userEmail as creatorEmail
      FROM invitation_codes_with_status ic
      LEFT JOIN users u ON ic.createdBy = u.userId
      WHERE ic.createdBy = ?
      ORDER BY ic.createdTime DESC
    `).bind(userId.userId).all();

    const formattedInvitations = invitations.results.map((inv: any) => ({
      invitationId: inv.invitationId,
      invitationCode: inv.displayCode || '****-****-****',
      targetEmail: inv.targetEmail,
      createdBy: inv.creatorDisplayName && inv.creatorEmail
        ? `${inv.creatorDisplayName} (${inv.creatorEmail})`
        : inv.createdBy || 'Unknown',
      createdTime: inv.createdTime,
      expiryTime: inv.expiryTime,
      status: inv.status,
      usedTime: inv.usedTime,
      defaultTags: parseJSON(inv.defaultTags, []),
      defaultGlobalGroups: parseJSON(inv.defaultGlobalGroups, [])
    }));

    return successResponse(formattedInvitations);
  } catch (error) {
    console.error('Get user invitations error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user invitations');
  }
}

/**
 * Get all invitations (admin only)
 */
export async function getAllInvitations(env: Env): Promise<Response> {
  try {
    const invitations = await env.DB.prepare(`
      SELECT
        ic.*,
        u.displayName as creatorDisplayName,
        u.userEmail as creatorEmail
      FROM invitation_codes_with_status ic
      LEFT JOIN users u ON ic.createdBy = u.userId
      ORDER BY ic.createdTime DESC
    `).all();

    const formattedInvitations = invitations.results.map((inv: any) => ({
      invitationId: inv.invitationId,
      invitationCode: inv.displayCode || '****-****-****',
      targetEmail: inv.targetEmail,
      createdBy: inv.creatorDisplayName && inv.creatorEmail
        ? `${inv.creatorDisplayName} (${inv.creatorEmail})`
        : inv.createdBy || 'Unknown',
      createdTime: inv.createdTime,
      expiryTime: inv.expiryTime,
      status: inv.status,
      usedTime: inv.usedTime,
      defaultTags: parseJSON(inv.defaultTags, []),
      defaultGlobalGroups: parseJSON(inv.defaultGlobalGroups, [])
    }));

    return successResponse(formattedInvitations);
  } catch (error) {
    console.error('Get all invitations error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get invitations');
  }
}

/**
 * Deactivate an invitation code
 */
export async function deactivateInvitation(
  env: Env,
  invitationId: string,
  userEmail: string
): Promise<Response> {
  try {
    const invitation = await env.DB.prepare(`
      SELECT i.*, u.userEmail as creatorEmail
      FROM invitation_codes_with_status i
      JOIN users u ON i.createdBy = u.userId
      WHERE i.invitationId = ?
    `).bind(invitationId).first() as InvitationRow | null;

    if (!invitation) {
      return errorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }

    // Check if user is the creator
    if (invitation.creatorEmail !== userEmail) {
      return errorResponse('ACCESS_DENIED', 'Only the creator can deactivate this invitation');
    }

    // Mark as deactivated by setting deactivatedTime
    // Status will be auto-calculated as 'deactivated' by invitation_codes_with_status VIEW
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE invitation_codes
      SET deactivatedTime = ?
      WHERE invitationId = ?
    `).bind(now, invitationId).run();

    // Log deactivation
    await logGlobalOperation(
      env,
      userEmail,
      'invitation_deactivated',
      'invitation',
      invitationId,
      {
        targetEmail: invitation.targetEmail,
        originalStatus: invitation.status
      },
      { level: 'info' }
    );

    return successResponse(null, 'Invitation deactivated successfully');
  } catch (error) {
    console.error('Deactivate invitation error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to deactivate invitation');
  }
}

/**
 * Reactivate a deactivated invitation code
 */
export async function reactivateInvitation(
  env: Env,
  invitationId: string,
  userEmail: string
): Promise<Response> {
  try {
    const invitation = await env.DB.prepare(`
      SELECT i.*, u.userEmail as creatorEmail
      FROM invitation_codes_with_status i
      JOIN users u ON i.createdBy = u.userId
      WHERE i.invitationId = ?
    `).bind(invitationId).first() as InvitationRow | null;

    if (!invitation) {
      return errorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }

    // Check if user is the creator
    if (invitation.creatorEmail !== userEmail) {
      return errorResponse('ACCESS_DENIED', 'Only the creator can reactivate this invitation');
    }

    // Validate current status is 'deactivated'
    if (invitation.status !== 'deactivated') {
      return errorResponse('INVALID_STATUS', `Cannot reactivate invitation with status: ${invitation.status}`);
    }

    // Validate invitation is not used
    if (invitation.usedTime !== null) {
      return errorResponse('INVITATION_ALREADY_USED', 'Cannot reactivate a used invitation');
    }

    // Validate invitation is not expired
    const now = Date.now();
    if (now >= invitation.expiryTime) {
      return errorResponse('INVITATION_EXPIRED', 'Cannot reactivate an expired invitation');
    }

    // Reactivate by clearing deactivatedTime
    // Status will be auto-calculated as 'active' by invitation_codes_with_status VIEW
    await env.DB.prepare(`
      UPDATE invitation_codes
      SET deactivatedTime = NULL
      WHERE invitationId = ?
    `).bind(invitationId).run();

    // Log reactivation to sys_logs
    await logGlobalOperation(
      env,
      userEmail,
      'invitation_reactivated',
      'invitation',
      invitationId,
      {
        invitationCode: invitation.invitationCode,
        targetEmail: invitation.targetEmail,
        previousStatus: 'deactivated',
        newStatus: 'active',
        expiryTime: invitation.expiryTime
      },
      { level: 'info' }
    );

    return successResponse(null, 'Invitation reactivated successfully');
  } catch (error) {
    console.error('Reactivate invitation error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to reactivate invitation');
  }
}

/**
 * Delete an invitation code (soft delete)
 */
export async function deleteInvitation(
  env: Env,
  invitationId: string,
  userEmail: string,
  isAdmin: boolean
): Promise<Response> {
  try {
    const invitation = await env.DB.prepare(`
      SELECT i.*, u.userEmail as creatorEmail
      FROM invitation_codes_with_status i
      JOIN users u ON i.createdBy = u.userId
      WHERE i.invitationId = ?
    `).bind(invitationId).first() as InvitationRow | null;

    if (!invitation) {
      return errorResponse('INVITATION_NOT_FOUND', 'Invitation not found');
    }

    // Check if user has permission to delete
    if (invitation.creatorEmail !== userEmail && !isAdmin) {
      return errorResponse('ACCESS_DENIED', 'Only the creator or admin can delete this invitation');
    }

    // Soft delete
    await env.DB.prepare(`
      UPDATE invitation_codes
      SET status = 'deleted'
      WHERE invitationId = ?
    `).bind(invitationId).run();

    // Log deletion
    await logGlobalOperation(
      env,
      userEmail,
      'invitation_deleted',
      'invitation',
      invitationId,
      {
        targetEmail: invitation.targetEmail,
        deletedByAdmin: isAdmin && invitation.creatorEmail !== userEmail,
        originalStatus: invitation.status
      },
      { level: 'warning' }
    );

    return successResponse(null, 'Invitation deleted successfully');
  } catch (error) {
    console.error('Delete invitation error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to delete invitation');
  }
}

/**
 * Cleanup expired invitations
 * NOTE: This function is now a no-op since invitation_codes_with_status VIEW
 * automatically calculates 'expired' status based on expiryTime.
 * Kept for backward compatibility.
 */
export async function cleanupExpiredInvitations(env: Env): Promise<number> {
  try {
    // No-op: Status is auto-calculated by VIEW
    // Expired invitations are automatically shown as 'expired' in queries
    console.log('Cleanup expired invitations: No action needed (status auto-calculated by VIEW)');
    return 0;
  } catch (error) {
    console.error('Cleanup expired invitations error:', error);
    return 0;
  }
}
