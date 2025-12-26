/**
 * User Profile Management Handlers
 * Migrated from GAS scripts/users_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { logGlobalOperation, generateChanges } from '@utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Get user profile by userId
 */
export async function getUserProfile(
  env: Env,
  sessionUserId: string,
  sessionUserEmail: string,
  targetUserId?: string
): Promise<Response> {
  try {
    // If no targetUserId provided, return current user's profile
    const userId = targetUserId || sessionUserId;

    // Get user data
    const user = await env.DB.prepare(`
      SELECT
        userId, userEmail, displayName, status,
        registrationTime, preferences,
        avatarSeed, avatarStyle, avatarOptions
      FROM users
      WHERE userId = ?
    `).bind(userId).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Parse JSON fields
    const preferences = parseJSON(user.preferences as string, {});
    const avatarOptions = parseJSON(user.avatarOptions as string, {
      backgroundColor: 'b6e3f4',
      clothesColor: '3c4858',
      skinColor: 'ae5d29'
    });

    // Get user badges
    const badges = await getUserBadges(env, user.userEmail as string);

    const profileData = {
      userId: user.userId,
      userEmail: user.userEmail,
      displayName: user.displayName,
      status: user.status,
      registrationTime: user.registrationTime,
      preferences,
      avatarSeed: user.avatarSeed || generateAvatarSeed(user.userEmail as string),
      avatarStyle: user.avatarStyle || 'avataaars',
      avatarOptions,
      badges
    };

    return successResponse(profileData);
  } catch (error) {
    console.error('Get user profile error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user profile');
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  env: Env,
  userId: string,
  userEmail: string,
  updates: { displayName?: string; preferences?: any }
): Promise<Response> {
  try {
    // Get current user profile for change tracking
    const user = await env.DB.prepare(`
      SELECT displayName, preferences FROM users WHERE userId = ?
    `).bind(userId).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Validate and sanitize updates
    const allowedUpdates: any = {};

    if (updates.displayName !== undefined) {
      // Sanitize display name (max 100 chars)
      allowedUpdates.displayName = updates.displayName.substring(0, 100);
    }

    if (updates.preferences !== undefined) {
      // Validate and stringify preferences
      if (typeof updates.preferences === 'object') {
        allowedUpdates.preferences = stringifyJSON(updates.preferences);
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(allowedUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(allowedUpdates);

    await env.DB.prepare(`
      UPDATE users
      SET ${setClause}
      WHERE userId = ?
    `).bind(...values, userId).run();

    // Log operation with full change tracking
    const changes = generateChanges(user, allowedUpdates);

    await logGlobalOperation(env, userEmail, 'profile_updated', 'user', userEmail, {
      changes,  // Complete before/after comparison
      updatedFields: Object.keys(allowedUpdates)  // Kept for backward compatibility
    });

    return successResponse(null, 'Profile updated successfully');
  } catch (error) {
    console.error('Update user profile error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update user profile');
  }
}

/**
 * Update user avatar settings
 */
export async function updateUserAvatar(
  env: Env,
  userId: string,
  userEmail: string,
  avatarData: { avatarSeed?: string; avatarStyle?: string; avatarOptions?: any }
): Promise<Response> {
  try {
    console.log('📝 Received avatar data:', avatarData);

    // Get current avatar data for change tracking
    const user = await env.DB.prepare(`
      SELECT avatarSeed, avatarStyle, avatarOptions FROM users WHERE userId = ?
    `).bind(userId).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    const allowedUpdates: any = {};

    if (avatarData.avatarSeed !== undefined) {
      allowedUpdates.avatarSeed = avatarData.avatarSeed.substring(0, 50);
    }

    if (avatarData.avatarStyle !== undefined) {
      const validStyles = ['avataaars', 'bottts', 'identicon', 'initials', 'personas', 'pixel-art', 'lorelei', 'micah'];
      if (validStyles.includes(avatarData.avatarStyle)) {
        allowedUpdates.avatarStyle = avatarData.avatarStyle;
      } else {
        console.warn('⚠️ Invalid avatar style received:', avatarData.avatarStyle);
      }
    }

    if (avatarData.avatarOptions !== undefined && typeof avatarData.avatarOptions === 'object') {
      allowedUpdates.avatarOptions = stringifyJSON(avatarData.avatarOptions);
    }

    console.log('✅ Updates to be saved:', allowedUpdates);

    if (Object.keys(allowedUpdates).length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid avatar updates provided');
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(allowedUpdates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(allowedUpdates);

    const query = `UPDATE users SET ${setClause} WHERE userId = ?`;
    console.log('🔍 SQL Query:', query);
    console.log('🔍 SQL Values:', [...values, userId]);

    await env.DB.prepare(query).bind(...values, userId).run();

    // Verify the update
    const updatedUser = await env.DB.prepare(`
      SELECT avatarSeed, avatarStyle, avatarOptions
      FROM users
      WHERE userId = ?
    `).bind(userId).first();

    console.log('✅ Verified saved data:', updatedUser);

    // Log operation with full change tracking
    const changes = generateChanges(user, allowedUpdates);

    await logGlobalOperation(env, userEmail, 'avatar_updated', 'user', userEmail, {
      changes,  // Complete before/after comparison
      updatedFields: Object.keys(allowedUpdates)  // Kept for backward compatibility
    });

    return successResponse(null, 'Avatar updated successfully');
  } catch (error) {
    console.error('Update user avatar error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update avatar');
  }
}

/**
 * Generate avatar data (public - no authentication required)
 * Used for registration and avatar preview
 */
export async function generateAvatarData(
  env: Env,
  userEmail: string,
  userId?: string
): Promise<Response> {
  try {
    const newSeed = generateAvatarSeed(userEmail);
    const avatarStyle = 'avataaars'; // Default style
    const avatarOptions = {}; // Default options

    // If userId is provided (authenticated user), update database
    if (userId) {
      await env.DB.prepare(`
        UPDATE users
        SET avatarSeed = ?, avatarStyle = ?, avatarOptions = ?
        WHERE userId = ?
      `).bind(newSeed, avatarStyle, JSON.stringify(avatarOptions), userId).run();

      // Log operation for authenticated users
      await logGlobalOperation(env, userEmail, 'avatar_regenerated', 'user', userEmail, {
        newSeed,
        avatarStyle
      });
    }

    // Return generated data (works for both authenticated and public access)
    return successResponse({
      avatarSeed: newSeed,
      avatarStyle,
      avatarOptions
    }, 'Avatar data generated successfully');
  } catch (error) {
    console.error('Generate avatar data error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to generate avatar data');
  }
}

/**
 * Regenerate user avatar seed (legacy - for backward compatibility)
 * @deprecated Use generateAvatarData instead
 */
export async function regenerateAvatarSeed(
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  return generateAvatarData(env, userEmail, userId);
}

/**
 * Deactivate user account
 */
export async function deactivateUser(
  env: Env,
  userId: string,
  userEmail: string,
  reason: string = 'user_request'
): Promise<Response> {
  try {
    await env.DB.prepare(`
      UPDATE users
      SET status = 'inactive', lastModified = ?
      WHERE userId = ?
    `).bind(Date.now(), userId).run();

    // Log deactivation
    await logGlobalOperation(env, userEmail, 'user_deactivated', 'user', userEmail, { reason });

    // Send notification to user about deactivation
    try {
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'user_registered', // closest available type for account status
        title: '帳號已停用',
        content: '您的帳號已被停用，請聯絡管理員了解詳情',
        metadata: {
          deactivatedAt: Date.now(),
          reason: reason || 'No reason provided'
        }
      });
    } catch (notifError) {
      console.error('[deactivateUser] Failed to send notification:', notifError);
      // Don't block main operation if notification fails
    }

    return successResponse(null, 'User account deactivated successfully');
  } catch (error) {
    console.error('Deactivate user error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to deactivate user account');
  }
}

/**
 * Generate random avatar seed
 */
export function generateAvatarSeed(userEmail: string): string {
  const timestamp = Date.now().toString();
  const emailHash = userEmail.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${Math.abs(emailHash)}_${timestamp.slice(-6)}`;
}

/**
 * Get user badges based on their roles
 */
async function getUserBadges(env: Env, userEmail: string): Promise<any[]> {
  try {
    const badges: any[] = [];

    // Check if user is system admin
    const isAdmin = await checkGlobalPermission(env, userEmail, 'system_admin');
    if (isAdmin) {
      badges.push({
        type: 'admin',
        label: '系統管理員',
        color: '#e74c3c',
        icon: 'fas fa-crown'
      });
    }

    // Check if user is global PM
    const isPM = await checkGlobalPermission(env, userEmail, 'create_project');
    if (isPM) {
      badges.push({
        type: 'pm',
        label: '總PM',
        color: '#f39c12',
        icon: 'fas fa-star'
      });
    }

    // Check if user is leader in any active projects
    const leaderCheck = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM usergroups pug
      JOIN projects p ON pug.projectId = p.projectId
      WHERE pug.userEmail = ?
        AND p.status = 'active'
        AND pug.role = 'leader'
    `).bind(userEmail).first();

    if (leaderCheck && (leaderCheck.count as number) > 0) {
      badges.push({
        type: 'leader',
        label: '組長',
        color: '#3498db',
        icon: 'fas fa-users'
      });
    }

    return badges;
  } catch (error) {
    console.warn('Get user badges error:', error);
    return [];
  }
}

/**
 * Helper: Check global permission
 */
async function checkGlobalPermission(env: Env, userEmail: string, permission: string): Promise<boolean> {
  try {
    const result = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      JOIN users u ON gug.userEmail = u.userEmail
      WHERE u.userEmail = ?
    `).bind(userEmail).all();

    for (const row of result.results) {
      const permissions = parseJSON<string[]>(row.globalPermissions as string, []);
      if (permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn('Check global permission error:', error);
    return false;
  }
}

// Logging is now handled by centralized utils/logging module
