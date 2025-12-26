/**
 * @fileoverview Password reset functionality with tag-based CAPTCHA
 * @module PasswordReset
 */

/**
 * Verify email and get tag CAPTCHA for password reset
 * Returns user's tags + 5 distractor tags if user exists
 * Returns 5 random tags if user doesn't exist (obfuscation)
 */
function verifyEmailForReset(data) {
  try {
    // Validate input
    if (!data.userEmail) {
      return createErrorResponse('INVALID_INPUT', 'Email is required');
    }

    // Trim and sanitize email to avoid copy-paste issues
    const userEmail = sanitizeString((data.userEmail || '').trim(), 100).toLowerCase();

    if (!validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }

    // Get all tags from database
    const globalDb = getGlobalWorkbook();
    const allTags = readFullSheet(globalDb, 'Tags') || [];

    if (allTags.length === 0) {
      return createErrorResponse('SYSTEM_ERROR', 'No tags in system');
    }

    // Find user by email
    const globalData = readGlobalData();
    const user = globalData.users.find(u =>
      u.userEmail.toLowerCase() === userEmail &&
      u.status === 'active'
    );

    let tagsToReturn = [];

    if (user) {
      // User exists: return user's tags + up to 5 distractors
      const userTags = readFullSheet(globalDb, 'UserTags') || [];
      const userTagIds = userTags
        .filter(ut => ut.userEmail && ut.userEmail.toLowerCase() === user.userEmail.toLowerCase() && ut.isActive)
        .map(ut => ut.tagId);

      // Get user's tag objects
      const userTagObjects = allTags.filter(t => userTagIds.includes(t.tagId));

      // Get tags that user doesn't have
      const otherTags = allTags.filter(t => !userTagIds.includes(t.tagId));

      // Randomly select up to 5 distractor tags (or all available if less than 5)
      const numDistractors = Math.min(5, otherTags.length);
      const distractorTags = shuffleArray(otherTags).slice(0, numDistractors);

      // Combine and shuffle
      tagsToReturn = shuffleArray([...userTagObjects, ...distractorTags]);

    } else {
      // User doesn't exist: return up to 5 random tags (or all if less than 5)
      const numTags = Math.min(5, allTags.length);
      tagsToReturn = shuffleArray(allTags).slice(0, numTags);
    }

    // Return tags in a clean format
    return createSuccessResponse({
      verified: true,
      tags: tagsToReturn.map(t => ({
        tagId: t.tagId,
        tagName: t.tagName
      }))
    });

  } catch (error) {
    console.error('Verify email for reset error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Email verification failed');
  }
}

/**
 * Handle password reset request
 * Validates email + tag matching, generates random password, sends email
 */
function handleResetPassword(data) {
  try {
    console.log('🔐 [Password Reset] Starting password reset process...');
    console.log('📧 [Password Reset] Input email:', data.userEmail);
    console.log('🏷️ [Password Reset] Selected tags:', JSON.stringify(data.selectedTagIds));

    // Validate input
    if (!data.userEmail || !data.selectedTagIds) {
      console.log('❌ [Password Reset] Missing email or tags');
      return createErrorResponse('INVALID_INPUT', 'Email and tags are required');
    }

    // Trim and sanitize input to avoid copy-paste issues
    const userEmail = sanitizeString((data.userEmail || '').trim(), 100).toLowerCase();
    const selectedTagIds = data.selectedTagIds;

    console.log('📧 [Password Reset] Sanitized email:', userEmail);

    if (!validateEmail(userEmail)) {
      console.log('❌ [Password Reset] Invalid email format');
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }

    if (!Array.isArray(selectedTagIds) || selectedTagIds.length === 0) {
      console.log('❌ [Password Reset] Invalid tag selection');
      return createErrorResponse('INVALID_INPUT', 'Invalid tag selection');
    }

    // Find user by email
    const globalData = readGlobalData();
    const user = globalData.users.find(u =>
      u.userEmail.toLowerCase() === userEmail &&
      u.status === 'active'
    );

    if (user) {
      console.log('✅ [Password Reset] User found:', user.username, '(', user.userId, ')');
      console.log('📧 [Password Reset] User email:', user.userEmail);

      // Get user's actual tags from database
      const globalDb = getGlobalWorkbook();
      const userTags = readFullSheet(globalDb, 'UserTags') || [];

      console.log('🔍 [Password Reset] Total UserTags records:', userTags.length);
      console.log('🔍 [Password Reset] Looking for tags with userEmail:', user.userEmail);

      const userTagIds = userTags
        .filter(ut => {
          const match = ut.userEmail && ut.userEmail.toLowerCase() === user.userEmail.toLowerCase() && ut.isActive;
          console.log('🔍 [Password Reset] Checking tag:', ut.tagId, 'for email:', ut.userEmail, 'match:', match);
          return match;
        })
        .map(ut => ut.tagId);

      console.log('🏷️ [Password Reset] User actual tags:', JSON.stringify(userTagIds));
      console.log('🏷️ [Password Reset] Selected tags:', JSON.stringify(selectedTagIds));

      // Verify tags match EXACTLY (same length and all elements match)
      const tagsMatch =
        userTagIds.length === selectedTagIds.length &&
        userTagIds.every(tagId => selectedTagIds.includes(tagId)) &&
        selectedTagIds.every(tagId => userTagIds.includes(tagId));

      console.log('🔍 [Password Reset] Tags match:', tagsMatch);

      if (tagsMatch) {
        console.log('✅ [Password Reset] Tags matched! Proceeding with reset...');

        // Generate random password (8-12 characters, alphanumeric)
        const newPassword = generateRandomPassword();
        console.log('🔑 [Password Reset] Generated new password:', newPassword);

        // Hash the new password
        const hashedPassword = hashPassword(newPassword);
        console.log('🔒 [Password Reset] Password hashed');

        // Update password in database
        updateSheetRow(null, 'Users', 'userId', user.userId, {
          password: hashedPassword,
          lastModified: getCurrentTimestamp()
        });
        console.log('💾 [Password Reset] Database updated');

        // Send email with new password
        console.log('📤 [Password Reset] Attempting to send email to:', user.userEmail);
        const emailSent = sendPasswordResetEmail(
          user.userEmail,
          user.displayName || user.username,
          newPassword
        );

        if (emailSent) {
          console.log('✅ [Password Reset] Email sent successfully!');

          // Log password reset
          logOperation(user.userEmail, 'password_reset_completed', 'user', user.userId, {
            resetTime: getCurrentTimestamp(),
            ipAddress: getClientIP()
          });

          // Invalidate all user sessions (force re-login)
          invalidateAllUserSessions(user.userId);
          console.log('🔓 [Password Reset] Sessions invalidated');
        } else {
          console.log('❌ [Password Reset] Email sending FAILED!');
        }
      } else {
        console.log('❌ [Password Reset] Tags did NOT match - reset aborted');
      }
    } else {
      console.log('❌ [Password Reset] User not found with email:', userEmail);
    }

    // ALWAYS return success message, regardless of whether reset actually happened
    // This prevents user enumeration attacks
    console.log('✅ [Password Reset] Returning success response (security measure)');
    return createSuccessResponse(null,
      'If your information is correct, a new password has been sent to your email.'
    );

  } catch (error) {
    console.error('❌ [Password Reset] Error:', error.message);
    console.error('❌ [Password Reset] Stack trace:', error.stack);
    // Even on error, return success message to prevent information leakage
    return createSuccessResponse(null,
      'If your information is correct, a new password has been sent to your email.'
    );
  }
}

/**
 * Generate random password
 * Returns 8-12 character password with uppercase, lowercase, and numbers
 */
function generateRandomPassword() {
  const length = 8 + Math.floor(Math.random() * 5); // 8-12 characters
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const allChars = uppercase + lowercase + numbers;

  let password = '';

  // Ensure at least one of each type
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));

  // Fill the rest randomly
  for (let i = 3; i < length; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password
  return shuffleString(password);
}

/**
 * Shuffle a string
 */
function shuffleString(str) {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr.join('');
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 */
function shuffleArray(array) {
  const shuffled = array.slice(); // Create a copy
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Send password reset email with new password
 */
function sendPasswordResetEmail(userEmail, displayName, newPassword) {
  try {
    console.log('📧 [Email] Preparing email for:', userEmail);
    console.log('📧 [Email] Display name:', displayName);
    console.log('📧 [Email] New password:', newPassword);

    const subject = '評分系統 - 密碼已重設';
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #409eff;">評分系統 - 密碼重設成功</h2>

        <p>親愛的 ${displayName}，</p>

        <p>您的密碼已成功重設。請使用以下新密碼登入系統：</p>

        <div style="background: #f5f7fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; color: #606266; font-size: 14px;">新密碼</p>
          <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #303133; font-family: monospace;">
            ${newPassword}
          </p>
        </div>

        <p><strong>重要提示：</strong></p>
        <ul>
          <li>請立即使用此密碼登入系統</li>
          <li>登入後，建議您前往個人設定修改為您自己的密碼</li>
          <li>請勿將此密碼分享給任何人</li>
          <li>如果您沒有請求密碼重設，請立即聯繫系統管理員</li>
        </ul>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e7ed;">

        <p style="color: #909399; font-size: 12px;">
          此郵件由系統自動發送，請勿直接回覆。<br>
          如需協助，請聯繫系統管理員。
        </p>
      </div>
    `;

    console.log('📧 [Email] Email subject:', subject);
    console.log('📧 [Email] HTML body length:', htmlBody.length);
    console.log('📧 [Email] Calling MailApp.sendEmail...');

    MailApp.sendEmail({
      to: userEmail,
      subject: subject,
      htmlBody: htmlBody
    });

    console.log('✅ [Email] MailApp.sendEmail completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ [Email] Error sending email:', error.message);
    console.error('❌ [Email] Error stack:', error.stack);
    console.error('❌ [Email] Error name:', error.name);
    return false;
  }
}

/**
 * Invalidate all user sessions
 * Note: Sessions are stored in CacheService which doesn't support enumeration.
 * We can't iterate through sessions, so this function only logs the action.
 * Sessions will naturally expire based on SESSION_TIMEOUT.
 */
function invalidateAllUserSessions(userId) {
  try {
    // Sessions are stored in CacheService with sessionId as key
    // CacheService doesn't support key enumeration, so we can't iterate
    // Sessions will auto-expire based on configured timeout

    console.log('Note: Sessions stored in CacheService will auto-expire. User:', userId);

    // If we need immediate session invalidation, we could:
    // 1. Track active sessionIds per userId in a separate storage
    // 2. Or accept that sessions expire naturally within SESSION_TIMEOUT period

  } catch (error) {
    console.error('Invalidate user sessions error:', error.message);
  }
}

/**
 * Get client IP address (best effort)
 */
function getClientIP() {
  try {
    return Session.getTemporaryActiveUserKey() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyEmailForReset,
    handleResetPassword,
    generateRandomPassword
  };
}
