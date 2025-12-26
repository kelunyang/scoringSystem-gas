/**
 * Invitation Code Validation Handlers
 * Migrated from GAS scripts/invitation.js and invitation_verification_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';

/**
 * Verify invitation code for a specific email (step 1 of registration)
 */
export async function verifyInvitationCode(
  env: Env,
  invitationCode: string,
  userEmail: string
): Promise<Response> {
  try {
    console.log('[Verify] Starting verification with:', { invitationCode, userEmail });

    if (!invitationCode) {
      console.log('[Verify] ❌ Missing invitation code');
      return errorResponse('INVALID_INPUT', 'Invitation code is required');
    }

    if (!userEmail) {
      console.log('[Verify] ❌ Missing user email');
      return errorResponse('INVALID_INPUT', 'User email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      console.log('[Verify] ❌ Invalid email format:', userEmail);
      return errorResponse('INVALID_INPUT', 'Invalid email format');
    }

    // Sanitize input - remove hyphens from invitation code for flexible matching
    const sanitizedCode = invitationCode.trim().toUpperCase().replace(/-/g, '');
    const sanitizedEmail = userEmail.trim().toLowerCase();
    console.log('[Verify] Sanitized input:', { sanitizedCode, sanitizedEmail });

    // Format code with hyphens for database query (XXXX-XXXX-XXXX)
    const formattedCode = sanitizedCode.length === 12
      ? `${sanitizedCode.slice(0, 4)}-${sanitizedCode.slice(4, 8)}-${sanitizedCode.slice(8, 12)}`
      : sanitizedCode; // If not 12 chars, keep as-is (will fail validation)
    console.log('[Verify] Formatted code for DB query:', formattedCode);

    // Get invitation from database (direct string comparison, no hash)
    console.log('[Verify] Querying database for invitation code:', formattedCode);
    const invitation = await env.DB.prepare(`
      SELECT *
      FROM invitation_codes_with_status
      WHERE invitationCode = ?
        AND status = 'active'
    `).bind(formattedCode).first();

    console.log('[Verify] Database query result:', invitation ? 'Found' : 'Not found');
    if (invitation) {
      console.log('[Verify] Invitation details:', {
        invitationId: invitation.invitationId,
        targetEmail: invitation.targetEmail,
        status: invitation.status,
        expiryTime: invitation.expiryTime,
        currentTime: Date.now()
      });
    }

    if (!invitation) {
      console.log('[Verify] ❌ Invalid invitation code');
      return errorResponse('INVALID_INVITATION', 'Invalid invitation code');
    }

    // Check if invitation is for this specific email
    console.log('[Verify] Checking email match:', {
      expected: invitation.targetEmail,
      provided: sanitizedEmail,
      match: invitation.targetEmail === sanitizedEmail
    });
    if ((invitation.targetEmail as string)?.toLowerCase() !== sanitizedEmail) {
      console.log('[Verify] ❌ Email mismatch');
      return errorResponse('EMAIL_MISMATCH', 'This invitation code is not for your email address');
    }

    // Check if expired
    const now = Date.now();
    const expiryTime = invitation.expiryTime as number;
    console.log('[Verify] Checking expiry:', { now, expiryTime, expired: now > expiryTime });
    if (now > expiryTime) {
      console.log('[Verify] ❌ Invitation expired');
      return errorResponse('INVITATION_EXPIRED', 'Invitation code has expired');
    }

    // Parse JSON fields
    console.log('[Verify] Parsing JSON fields...');
    const defaultTags = parseJSON(invitation.defaultTags as string, []);
    const defaultGlobalGroups = parseJSON(invitation.defaultGlobalGroups as string, []);
    console.log('[Verify] Parsed tags and groups:', { defaultTags, defaultGlobalGroups });

    // Log successful verification
    await logGlobalOperation(
      env,
      sanitizedEmail,
      'invitation_verified',
      'invitation',
      invitation.invitationId as string,
      {
        invitationCode: formattedCode,
        userEmail: sanitizedEmail,
        expiryTime,
        defaultTagsCount: defaultTags.length,
        defaultGlobalGroupsCount: defaultGlobalGroups.length
      },
      { level: 'info' }
    );

    // Return invitation details for registration
    console.log('[Verify] ✅ Verification successful');
    return successResponse({
      verified: true,
      invitationId: invitation.invitationId,
      targetEmail: invitation.targetEmail,
      expiryTime: invitation.expiryTime,
      createdBy: invitation.createdBy,
      defaultTags,
      defaultGlobalGroups
    }, 'Invitation code verified successfully');
  } catch (error) {
    console.error('[Verify] ❌ Exception caught:', error);
    console.error('[Verify] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Verify] Error message:', error instanceof Error ? error.message : String(error));
    return errorResponse('SYSTEM_ERROR', 'Failed to verify invitation code');
  }
}

/**
 * Validate invitation code for email (used by validateInvitationCodeForEmail)
 * This is called during user registration
 */
export async function validateInvitationCodeForEmail(
  env: Env,
  invitationCode: string,
  userEmail: string
): Promise<any> {
  try {
    if (!invitationCode || !userEmail) {
      return {
        success: false,
        error: 'Invitation code and email are required',
        errorCode: 'INVALID_INPUT'
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return {
        success: false,
        error: 'Invalid email format',
        errorCode: 'INVALID_INPUT'
      };
    }

    // Sanitize input - remove hyphens from invitation code for flexible matching
    const sanitizedCode = invitationCode.trim().toUpperCase().replace(/-/g, '');
    const sanitizedEmail = userEmail.trim().toLowerCase();

    // Format code with hyphens for database query (XXXX-XXXX-XXXX)
    const formattedCode = sanitizedCode.length === 12
      ? `${sanitizedCode.slice(0, 4)}-${sanitizedCode.slice(4, 8)}-${sanitizedCode.slice(8, 12)}`
      : sanitizedCode; // If not 12 chars, keep as-is (will fail validation)

    // Direct string comparison, no hash
    const invitation = await env.DB.prepare(`
      SELECT *
      FROM invitation_codes_with_status
      WHERE invitationCode = ?
        AND status = 'active'
    `).bind(formattedCode).first();

    if (!invitation) {
      return {
        success: false,
        error: 'Invalid invitation code',
        errorCode: 'INVALID_INVITATION'
      };
    }

    if ((invitation.targetEmail as string)?.toLowerCase() !== sanitizedEmail) {
      return {
        success: false,
        error: 'This invitation code is not for your email address',
        errorCode: 'EMAIL_MISMATCH'
      };
    }

    if (Date.now() > (invitation.expiryTime as number)) {
      return {
        success: false,
        error: 'Invitation code has expired',
        errorCode: 'INVITATION_EXPIRED'
      };
    }

    return {
      success: true,
      data: {
        invitationId: invitation.invitationId,
        targetEmail: invitation.targetEmail,
        expiryTime: invitation.expiryTime,
        createdBy: invitation.createdBy,
        defaultTags: parseJSON(invitation.defaultTags as string, []),
        defaultGlobalGroups: parseJSON(invitation.defaultGlobalGroups as string, [])
      }
    };
  } catch (error) {
    console.error('Validate invitation code for email error:', error);
    return {
      success: false,
      error: 'Failed to validate invitation code',
      errorCode: 'SYSTEM_ERROR'
    };
  }
}
