/**
 * @fileoverview User registration with invitation code validation
 */

import type { Env } from '../../types';
import { hashPassword, validatePasswordStrength } from './password';
import { generateToken } from './jwt';
import { generateUserId } from '../../utils/id-generator';
import { errorResponse, successResponse, ERROR_CODES } from '../../utils/response';
import type { ApiResponse } from '../../utils/response';
import { safeJsonStringify } from '../../utils/json';
import { logGlobalOperation } from '../../utils/logging';
import { getUserGlobalPermissions } from '../../utils/permissions';

/**
 * Registration data interface
 */
interface RegistrationData {
  password: string;
  userEmail: string;
  displayName: string;
  invitationCode: string;
  avatarSeed?: string;
  avatarStyle?: string;
  avatarOptions?: Record<string, any>;
}

/**
 * Register a new user with invitation code
 *
 * @param env - Cloudflare environment bindings
 * @param data - Registration data
 * @param jwtSecret - JWT secret for token generation
 * @param sessionTimeout - Session timeout in milliseconds
 * @returns ApiResponse with session token or error
 *
 * @example
 * const result = await registerUser(env, {
 *   password: 'password123',
 *   userEmail: 'john@example.com',
 *   displayName: 'John Doe',
 *   invitationCode: 'ic_xxx'
 * }, env.JWT_SECRET, 86400000);
 */
export async function registerUser(
  env: Env,
  data: RegistrationData,
  jwtSecret: string,
  sessionTimeout: number = 86400000
): Promise<ApiResponse> {
  const db = env.DB;
  try {
    // Sanitize and validate input
    const sanitized = sanitizeRegistrationData(data);

    // Validate input
    const validation = validateRegistrationInput(sanitized);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: validation.error
        }
      };
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(sanitized.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: passwordValidation.errors.join(', ')
        }
      };
    }

    // Validate invitation code
    const invitationValidation = await validateInvitationCode(
      db,
      sanitized.invitationCode
    );

    if (!invitationValidation.valid) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INVITATION_CODE,
          message: invitationValidation.error
        }
      };
    }


    // Extract default tags and global groups from invitation
    // DISABLED: const defaultTags = invitationValidation.defaultTags || [];
    const defaultGlobalGroups = invitationValidation.defaultGlobalGroups || [];

    // Check if email already exists
    const emailExists = await checkEmailExists(db, sanitized.userEmail);
    if (emailExists) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.EMAIL_TAKEN,
          message: 'Email is already registered'
        }
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(sanitized.password);

    // Generate user ID
    const userId = generateUserId();
    const now = Date.now();

    // Create user record
    const userRecord = {
      userId,
      password: hashedPassword,
      userEmail: sanitized.userEmail,
      displayName: sanitized.displayName,
      registrationTime: now,
      lastActivityTime: now,
      status: 'active',
      preferences: safeJsonStringify({
        theme: 'light',
        lang: 'zh-TW'
      }),
      avatarSeed: sanitized.avatarSeed || crypto.randomUUID(),
      avatarStyle: sanitized.avatarStyle || 'avataaars',
      avatarOptions: safeJsonStringify(sanitized.avatarOptions || {}),
      createdAt: now,
      updatedAt: now
    };

    // Insert user into database with UNIQUE constraint handling
    try {
      await db
        .prepare(
          `INSERT INTO users (
            userId, password, userEmail, displayName,
            registrationTime, lastActivityTime, status,
            preferences, avatarSeed, avatarStyle, avatarOptions,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          userRecord.userId,
          userRecord.password,
          userRecord.userEmail,
          userRecord.displayName,
          userRecord.registrationTime,
          userRecord.lastActivityTime,
          userRecord.status,
          userRecord.preferences,
          userRecord.avatarSeed,
          userRecord.avatarStyle,
          userRecord.avatarOptions,
          userRecord.createdAt,
          userRecord.updatedAt
        )
        .run();
    } catch (insertError: any) {
      // Handle UNIQUE constraint violation (race condition)
      if (insertError.message?.includes('UNIQUE constraint failed') &&
          insertError.message?.includes('userEmail')) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.EMAIL_TAKEN,
            message: 'Email is already registered'
          }
        };
      }
      // Re-throw other errors to outer catch block
      throw insertError;
    }

    // Mark invitation code as used
    await useInvitationCode(db, sanitized.invitationCode, sanitized.userEmail);

    // DISABLED: Apply default tags from invitation - tags system has been disabled
    /*
    if (defaultTags && defaultTags.length > 0) {
      for (const tagId of defaultTags) {
        try {
          await db
            .prepare(
              `INSERT INTO user_tags (userId, tagId, assignedAt, assignedBy)
               VALUES (?, ?, ?, ?)`
            )
            .bind(userId, tagId, now, 'system')
            .run();
        } catch (error) {
          console.error(`Failed to assign tag ${tagId} to user ${userId}:`, error);
        }
      }
    }
    */

    // Apply default global groups from invitation (if any)
    if (defaultGlobalGroups && defaultGlobalGroups.length > 0) {
      for (const groupId of defaultGlobalGroups) {
        try {
          const globalUserGroupId = 'gug' + crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO globalusergroups (globalUserGroupId, globalGroupId, userEmail, joinedAt, isActive)
               VALUES (?, ?, ?, ?, ?)`
            )
            .bind(globalUserGroupId, groupId, sanitized.userEmail, now, 1)
            .run();
        } catch (error) {
          console.error(`Failed to add user ${sanitized.userEmail} to group ${groupId}:`, error);
        }
      }
    }

    // Log registration event using centralized logging
    await logGlobalOperation(
      env,
      sanitized.userEmail,
      'user_registered',
      'user',
      sanitized.userEmail,
      {
        userEmail: sanitized.userEmail,
        registrationTime: now,
        defaultGlobalGroupsApplied: defaultGlobalGroups.length
      },
      { level: 'info' }
    );

    // Generate session token
    const token = await generateToken(
      userId,
      sanitized.userEmail,
      jwtSecret,
      sessionTimeout
    );

    // Get user's global permissions
    const permissions = await getUserGlobalPermissions(db, userId);

    // Return success with token
    return {
      success: true,
      data: {
        sessionId: token,
        user: {
          userId,
          userEmail: sanitized.userEmail,
          displayName: sanitized.displayName,
          avatarSeed: userRecord.avatarSeed,
          avatarStyle: userRecord.avatarStyle,
          avatarOptions: userRecord.avatarOptions,
          registrationTime: now,
          permissions: permissions
        }
      }
    };
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
      type: typeof error,
      error: error
    });
    return {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An error occurred during registration. Please try again.'
      }
    };
  }
}

/**
 * Sanitize registration data
 */
function sanitizeRegistrationData(data: RegistrationData): RegistrationData {
  return {
    password: (data.password || '').trim(),
    userEmail: (data.userEmail || '').trim().toLowerCase().slice(0, 100),
    displayName: (data.displayName || '').trim().slice(0, 100),
    invitationCode: (data.invitationCode || '').trim(),
    avatarSeed: data.avatarSeed,
    avatarStyle: data.avatarStyle,
    avatarOptions: data.avatarOptions
  };
}

/**
 * Validate registration input
 */
function validateRegistrationInput(data: RegistrationData): {
  valid: boolean;
  error: string;
} {
  // Check required fields
  if (!data.password) {
    return { valid: false, error: 'Password is required' };
  }
  if (!data.userEmail) {
    return { valid: false, error: 'Email is required' };
  }
  if (!data.displayName) {
    return { valid: false, error: 'Display name is required' };
  }
  if (!data.invitationCode) {
    return { valid: false, error: 'Invitation code is required' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.userEmail)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, error: '' };
}

/**
 * Validate invitation code
 */
async function validateInvitationCode(
  db: D1Database,
  code: string
): Promise<{ valid: boolean; error: string; /* DISABLED: defaultTags?: string[]; */ defaultGlobalGroups?: string[]; invitationId?: string }> {
  try {

    // Get invitation code from database (using VIEW for auto-calculated status)
    const invitation = await db
      .prepare(
        `SELECT * FROM invitation_codes_with_status WHERE invitationCode = ? AND status = ?`
      )
      .bind(code, 'active')
      .first();

    if (!invitation) {
      return { valid: false, error: 'Invalid or expired invitation code' };
    }

    // Check if code is expired
    const now = Date.now();
    if (invitation.expiryTime && (invitation.expiryTime as number) < now) {
      return { valid: false, error: 'Invitation code has expired' };
    }

    // Note: Status is auto-calculated by invitation_codes_with_status VIEW
    // Status 'active' is already verified by the WHERE clause above
    // No need to check maxUses - invitations are single-use (status becomes 'used' after registration)

    // Parse defaultTags and defaultGlobalGroups from JSON
    // DISABLED: defaultTags parsing - tags system has been disabled
    // let defaultTags: string[] = [];
    let defaultGlobalGroups: string[] = [];

    /* DISABLED - Tags system
    try {
      if (invitation.defaultTags) {
        const parsed = typeof invitation.defaultTags === 'string'
          ? JSON.parse(invitation.defaultTags)
          : invitation.defaultTags;
        defaultTags = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('Failed to parse defaultTags:', e);
    }
    */

    try {
      if (invitation.defaultGlobalGroups) {
        const parsed = typeof invitation.defaultGlobalGroups === 'string'
          ? JSON.parse(invitation.defaultGlobalGroups)
          : invitation.defaultGlobalGroups;
        defaultGlobalGroups = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('Failed to parse defaultGlobalGroups:', e);
    }

    return {
      valid: true,
      error: '',
      // DISABLED: defaultTags,
      defaultGlobalGroups,
      invitationId: invitation.invitationId as string
    };
  } catch (error) {
    console.error('[validateInvitationCode] ❌ Exception during validation:', error);
    return { valid: false, error: 'Failed to validate invitation code' };
  }
}

/**
 * Mark invitation code as used
 */
async function useInvitationCode(
  db: D1Database,
  code: string,
  userEmail: string
): Promise<void> {
  try {
    const now = Date.now();

    // Mark invitation as used by setting usedTime
    // Status will be auto-calculated as 'used' by invitation_codes_with_status VIEW
    await db
      .prepare(
        `UPDATE invitation_codes
         SET usedCount = usedCount + 1, usedTime = ?
         WHERE invitationCode = ?`
      )
      .bind(now, code)
      .run();

    console.log('[useInvitationCode] ✅ Invitation marked as used:', code);

  } catch (error) {
    console.error('[useInvitationCode] ❌ Error marking invitation as used:', error);
    console.error('[useInvitationCode] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      code: code,
      userEmail: userEmail
    });
    // Don't throw - this shouldn't block registration
  }
}

/**
 * Check if email exists
 */
async function checkEmailExists(
  db: D1Database,
  email: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        'SELECT COUNT(*) as count FROM users WHERE LOWER(userEmail) = LOWER(?)'
      )
      .bind(email)
      .first();

    return (result?.count as number) > 0;
  } catch (error) {
    console.error('Error checking email:', error);
    return false;
  }
}

/**
 * Check email availability (API helper)
 */
export async function checkEmailAvailability(
  db: D1Database,
  email: string
): Promise<ApiResponse> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid email format'
        }
      };
    }

    const exists = await checkEmailExists(db, email);

    return {
      success: true,
      data: {
        userEmail: email,
        available: !exists
      }
    };
  } catch (error) {
    console.error('Check email availability error:', error);
    return {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to check email availability'
      }
    };
  }
}
