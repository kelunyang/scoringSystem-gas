/**
 * @fileoverview Invitation code verification API for new two-step registration process
 * @module InvitationVerificationAPI
 */

/**
 * Verify invitation code for a specific email (step 1 of registration)
 */
function verifyInvitationCode(invitationCode, userEmail) {
  try {
    // Validate inputs
    if (!invitationCode || !userEmail) {
      return createErrorResponse('INVALID_INPUT', 'Invitation code and email are required');
    }

    // Validate invitation code for this email
    const verificationResult = validateInvitationCodeForEmail(invitationCode, userEmail);
    if (!verificationResult.success) {
      return verificationResult;
    }

    // Return verification success with invitation details
    return createSuccessResponse({
      verified: true,
      invitationId: verificationResult.data.invitationId,
      targetEmail: verificationResult.data.targetEmail,
      expiryTime: verificationResult.data.expiryTime,
      createdBy: verificationResult.data.createdBy,
      defaultTags: verificationResult.data.defaultTags,
      defaultGlobalGroups: verificationResult.data.defaultGlobalGroups
    }, 'Invitation code verified successfully');

  } catch (error) {
    logErr('Verify invitation code error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to verify invitation code');
  }
}

/**
 * Handle verification request from frontend
 */
function handleVerifyInvitationCode(params) {
  try {
    const { invitationCode, userEmail } = params;
    return verifyInvitationCode(invitationCode, userEmail);
  } catch (error) {
    logErr('Handle verify invitation code error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to process verification request');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyInvitationCode,
    handleVerifyInvitationCode
  };
}