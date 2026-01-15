/**
 * Admin User Management Handlers
 * Migrated from GAS scripts/system_admin_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON, stringifyJSON } from '../../utils/json';
import { hashPassword, generateRandomPassword } from '../auth/password';
import { logGlobalOperation, generateChanges } from '../../utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';
import { queueAccountUnlockedEmail, queuePasswordResetEmail } from '../../queues/email-producer';

/**
 * Get all users (for admin use)
 * Supports server-side filtering, searching, and sorting
 */
export async function getAllUsers(
  env: Env,
  options?: {
    search?: string;
    status?: 'active' | 'inactive';
    groupIds?: string[];
    sortBy?: 'registrationTime' | 'email' | 'displayName' | 'lastActivityTime';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
): Promise<Response> {
  try {
    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    // Filter by status if provided
    if (options?.status) {
      conditions.push('u.status = ?');
      params.push(options.status);
    }

    // Search in email or displayName if provided
    if (options?.search && options.search.trim()) {
      const search = options.search.trim();

      // Validate search string length to prevent DoS
      if (search.length > 100) {
        return errorResponse('INVALID_INPUT', 'Search string too long (max 100 characters)');
      }

      // Escape LIKE wildcards (%, _) to prevent SQL injection
      const escapedSearch = search.replace(/[%_]/g, '\\$&');

      conditions.push('(u.userEmail LIKE ? ESCAPE "\\" OR u.displayName LIKE ? ESCAPE "\\")');
      const searchPattern = `%${escapedSearch}%`;
      params.push(searchPattern, searchPattern);
    }

    // Filter by groupIds if provided (users must belong to at least one of the groups)
    if (options?.groupIds && options.groupIds.length > 0) {
      // Validate groupIds count (max 50 to prevent DoS)
      if (options.groupIds.length > 50) {
        return errorResponse('INVALID_INPUT', 'Too many group IDs (max 50)');
      }

      const placeholders = options.groupIds.map(() => '?').join(', ');
      conditions.push(`u.userEmail IN (
        SELECT DISTINCT gug.userEmail
        FROM globalusergroups gug
        WHERE gug.globalGroupId IN (${placeholders})
        AND gug.isActive = 1
      )`);
      params.push(...options.groupIds);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Determine sort column and order with strict validation
    const sortBy = options?.sortBy || 'registrationTime';
    const sortOrder = options?.sortOrder || 'desc';

    // Strict validation to prevent SQL injection - only allow whitelisted values
    const validSortColumns = ['registrationTime', 'email', 'displayName', 'lastActivityTime'] as const;
    const validSortOrders = ['asc', 'desc'] as const;

    if (!validSortColumns.includes(sortBy as any)) {
      return errorResponse('INVALID_INPUT', `Invalid sortBy value: ${sortBy}`);
    }

    if (!validSortOrders.includes(sortOrder as any)) {
      return errorResponse('INVALID_INPUT', `Invalid sortOrder value: ${sortOrder}`);
    }

    // Map sortBy to actual column names (now safe after validation)
    const sortColumnMap: Record<string, string> = {
      'registrationTime': 'u.registrationTime',
      'email': 'u.userEmail',
      'displayName': 'u.displayName',
      'lastActivityTime': 'u.lastActivityTime'
    };

    const sortColumn = sortColumnMap[sortBy];
    const orderClause = `ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    // Build LIMIT/OFFSET clause (optional pagination support)
    let limitClause = '';
    if (options?.limit !== undefined) {
      // Hard cap at 1000 to prevent DoS attacks
      const limit = Math.min(options.limit, 1000);
      const offset = options.offset || 0;

      if (limit <= 0) {
        return errorResponse('INVALID_INPUT', 'Limit must be a positive integer');
      }

      if (offset < 0) {
        return errorResponse('INVALID_INPUT', 'Offset must be a non-negative integer');
      }

      limitClause = `LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    // Build count query params (without limit/offset params)
    const countParams = options?.limit !== undefined ? params.slice(0, -2) : [...params];

    // Get total count for pagination (run in parallel with main query)
    const countQuery = env.DB.prepare(`
      SELECT COUNT(*) as total FROM users u ${whereClause}
    `).bind(...countParams).first<{ total: number }>();

    // Get users with filters applied
    const usersQuery = env.DB.prepare(`
      SELECT
        u.userId,
        u.userEmail,
        u.displayName,
        u.status,
        u.registrationTime,
        u.lastActivityTime,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions,
        u.lockUntil,
        u.lockReason,
        u.lockCount
      FROM users u
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `).bind(...params).all();

    // Execute both queries in parallel
    const [countResult, usersResult] = await Promise.all([countQuery, usersQuery]);

    const totalCount = countResult?.total || 0;
    const users = usersResult.results || [];

    // DISABLED: Batch fetch all user tags - tags system has been disabled
    /*
    const allUserTags = await env.DB.prepare(`
      SELECT ut.userEmail, t.tagId, t.tagName
      FROM usertags ut
      JOIN globaltags t ON ut.tagId = t.tagId
      WHERE ut.isActive = 1 AND t.isActive = 1
    `).all();
    */

    // Batch fetch all user global groups in one query
    const allUserGroups = await env.DB.prepare(`
      SELECT gug.userEmail, gg.globalGroupId, gg.groupName, gg.description, gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      WHERE gug.isActive = 1 AND gg.isActive = 1
    `).all();

    // DISABLED: Organize tags by user email - tags system has been disabled
    /*
    const tagsByUser = new Map<string, any[]>();
    allUserTags.results?.forEach((tag: any) => {
      if (!tagsByUser.has(tag.userEmail)) {
        tagsByUser.set(tag.userEmail, []);
      }
      tagsByUser.get(tag.userEmail)!.push({
        tagId: tag.tagId,
        tagName: tag.tagName
      });
    });
    */

    // Organize groups by user email using Map for O(1) lookup
    const groupsByUser = new Map<string, any[]>();
    allUserGroups.results?.forEach((group: any) => {
      if (!groupsByUser.has(group.userEmail)) {
        groupsByUser.set(group.userEmail, []);
      }
      groupsByUser.get(group.userEmail)!.push({
        groupId: group.globalGroupId,
        groupName: group.groupName,
        description: group.description,
        globalPermissions: parseJSON(group.globalPermissions, [])
      });
    });

    // Combine data without additional database queries
    const enrichedUsers = users.map((user: any) => ({
      ...user,
      // DISABLED: tags: tagsByUser.get(user.userEmail) || [],
      globalGroups: groupsByUser.get(user.userEmail) || []
    }));

    // Return with pagination metadata
    return successResponse({
      users: enrichedUsers,
      totalCount,
      limit: options?.limit,
      offset: options?.offset || 0
    });

  } catch (error) {
    console.error('Get all users error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get users');
  }
}

/**
 * Update user status (activate/deactivate)
 */
export async function updateUserStatus(
  env: Env,
  adminEmail: string,
  userEmail: string,
  status: string
): Promise<Response> {
  try {
    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      return errorResponse('INVALID_INPUT', 'Invalid status value');
    }

    // Get user
    const user = await env.DB.prepare(`
      SELECT userEmail, status FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    const previousStatus = user.status;

    // Get admin user ID for logging
    const admin = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(adminEmail).first();

    // Update user status
    await env.DB.prepare(`
      UPDATE users
      SET status = ?, lastActivityTime = ?
      WHERE userEmail = ?
    `).bind(status, Date.now(), userEmail).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'user_status_updated',
      'user',
      userEmail,
      {
        newStatus: status,
        previousStatus,
        updatedBy: adminEmail
      },
      { level: 'warning' }
    );

    // Notify user about status change
    try {
      const statusText = status === 'active' ? '已啟用' : '已停用';
      await queueSingleNotification(env, {
        targetUserEmail: userEmail,
        type: 'user_status_changed',
        title: '帳戶狀態變更',
        content: `你的帳戶已被管理員${statusText}`,
        metadata: {
          newStatus: status,
          previousStatus,
          updatedBy: adminEmail
        }
      });
    } catch (notifError) {
      console.error('[updateUserStatus] Failed to send notification:', notifError);
    }

    return successResponse(null, `User status updated to ${status}`);

  } catch (error) {
    console.error('Update user status error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update user status');
  }
}

/**
 * Update user profile (admin function) - comprehensive user data update
 */
export async function updateUserProfile(
  env: Env,
  adminEmail: string,
  userData: {
    userEmail: string;
    displayName?: string;
    status?: string;
    avatarSeed?: string;
    avatarStyle?: string;
    avatarOptions?: any;
  }
): Promise<Response> {
  try {
    // Validate required userEmail
    if (!userData.userEmail) {
      return errorResponse('INVALID_INPUT', 'userEmail is required');
    }

    // Get user (including all updatable fields for change tracking)
    const user = await env.DB.prepare(`
      SELECT userEmail, displayName, status, avatarSeed, avatarStyle, avatarOptions
      FROM users WHERE userEmail = ?
    `).bind(userData.userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Prepare update object with allowed fields
    const updates: string[] = [];
    const params: any[] = [];
    const actualUpdates: any = {};  // Track actual update values for change logging

    if (userData.displayName !== undefined) {
      const value = userData.displayName.substring(0, 100);
      updates.push('displayName = ?');
      params.push(value);
      actualUpdates.displayName = value;
    }

    if (userData.status !== undefined) {
      if (['active', 'inactive'].includes(userData.status)) {
        updates.push('status = ?');
        params.push(userData.status);
        actualUpdates.status = userData.status;
      }
    }

    if (userData.avatarSeed !== undefined) {
      const value = userData.avatarSeed.substring(0, 50);
      updates.push('avatarSeed = ?');
      params.push(value);
      actualUpdates.avatarSeed = value;
    }

    if (userData.avatarStyle !== undefined) {
      const validStyles = ['avataaars', 'bottts', 'identicon', 'initials', 'personas', 'pixel-art'];
      if (validStyles.includes(userData.avatarStyle)) {
        updates.push('avatarStyle = ?');
        params.push(userData.avatarStyle);
        actualUpdates.avatarStyle = userData.avatarStyle;
      }
    }

    if (userData.avatarOptions !== undefined) {
      const value = typeof userData.avatarOptions === 'string' ?
        userData.avatarOptions : stringifyJSON(userData.avatarOptions);
      updates.push('avatarOptions = ?');
      params.push(value);
      actualUpdates.avatarOptions = value;
    }

    if (updates.length === 0) {
      return errorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Add timestamp
    updates.push('lastActivityTime = ?');
    params.push(Date.now());

    // Add userEmail for WHERE clause
    params.push(userData.userEmail);

    // Get admin user ID for logging
    const admin = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(adminEmail).first();

    // Update user record
    await env.DB.prepare(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE userEmail = ?
    `).bind(...params).run();

    // Log the action with full change tracking
    const changes = generateChanges(user, actualUpdates, ['lastActivityTime']);

    await logGlobalOperation(
      env,
      adminEmail,
      'user_profile_updated_by_admin',
      'user',
      userData.userEmail,
      {
        changes,  // Complete before/after comparison
        updatedFields: Object.keys(actualUpdates),  // Kept for backward compatibility
        updatedBy: adminEmail
      },
      { level: 'info' }
    );

    return successResponse(null, 'User profile updated successfully');

  } catch (error) {
    console.error('Update user profile error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to update user profile');
  }
}

/**
 * Reset user password (admin function)
 * Auto-generates a random password and emails it to the user
 */
export async function resetUserPassword(
  env: Env,
  adminEmail: string,
  userEmail: string
): Promise<Response> {
  try {
    // Get user (including displayName for email)
    const user = await env.DB.prepare(`
      SELECT userEmail, displayName FROM users WHERE userEmail = ?
    `).bind(userEmail).first<{ userEmail: string; displayName: string | null }>();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Generate random password (8-12 characters, cryptographically secure)
    const passwordLength = 8 + Math.floor(Math.random() * 5); // 8 to 12
    const newPassword = generateRandomPassword(passwordLength);

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await env.DB.prepare(`
      UPDATE users
      SET password = ?, lastActivityTime = ?
      WHERE userEmail = ?
    `).bind(hashedPassword, Date.now(), userEmail).run();

    // Log the action using centralized logging
    await logGlobalOperation(
      env,
      adminEmail,
      'password_reset_by_admin',
      'user',
      userEmail,
      {
        resetBy: adminEmail
      },
      { level: 'warning' }
    );

    // Send password reset email with new password
    try {
      await queuePasswordResetEmail(
        env,
        userEmail,
        user.displayName || userEmail,
        newPassword
      );
    } catch (emailError) {
      console.error('[resetUserPassword] Failed to send password reset email:', emailError);
      // Still return success since password was reset, but log the email failure
    }

    return successResponse(null, 'User password reset successfully');

  } catch (error) {
    console.error('Reset user password error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to reset user password');
  }
}

/**
 * Batch update user status (activate/deactivate multiple users)
 */
export async function batchUpdateUserStatus(
  env: Env,
  userEmails: string[],
  status: string,
  adminEmail: string
): Promise<Response> {
  try {
    if (!userEmails || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'userEmails array is required');
    }

    // Enforce batch size limit to prevent DoS
    const MAX_BATCH_SIZE = 100;
    if (userEmails.length > MAX_BATCH_SIZE) {
      return errorResponse('INVALID_INPUT', `Cannot update more than ${MAX_BATCH_SIZE} users at once`);
    }

    if (status !== 'active' && status !== 'inactive') {
      return errorResponse('INVALID_INPUT', 'Status must be either "active" or "inactive"');
    }

    // Validate all users exist
    const emailPlaceholders = userEmails.map(() => '?').join(',');
    const existingUsersResult = await env.DB.prepare(`
      SELECT userEmail, status FROM users
      WHERE userEmail IN (${emailPlaceholders})
    `).bind(...userEmails).all();

    const existingUsers = existingUsersResult.results || [];
    const existingUserEmails = new Set(existingUsers.map((u: any) => u.userEmail));

    // Build results array
    const results: Array<{
      userEmail: string;
      success: boolean;
      message?: string;
      error?: string;
    }> = [];

    const updateStatements = [];
    const now = Date.now();

    for (const userEmail of userEmails) {
      if (!existingUserEmails.has(userEmail)) {
        results.push({
          userEmail,
          success: false,
          error: 'User not found'
        });
        continue;
      }

      // Check if status is already the same
      const user = existingUsers.find((u: any) => u.userEmail === userEmail);
      if (user?.status === status) {
        results.push({
          userEmail,
          success: true,
          message: 'Status already set to ' + status
        });
        continue;
      }

      // Prepare UPDATE statement
      updateStatements.push(
        env.DB.prepare(`
          UPDATE users
          SET status = ?, lastActivityTime = ?
          WHERE userEmail = ?
        `).bind(status, now, userEmail)
      );

      results.push({
        userEmail,
        success: true,
        message: `Status updated to ${status}`
      });
    }

    // Execute batch update atomically
    // Note: D1 batch() is atomic - either all statements succeed or all fail
    if (updateStatements.length > 0) {
      try {
        await env.DB.batch(updateStatements);
      } catch (batchError) {
        console.error('[batchUpdateUserStatus] Batch update failed:', batchError);
        // Mark all pending updates as failed
        results.forEach(r => {
          if (r.success && r.message?.includes('updated')) {
            r.success = false;
            r.error = 'Database batch operation failed';
          }
        });
        // Return partial results
        return successResponse({
          successCount: results.filter(r => r.success).length,
          failureCount: results.filter(r => !r.success).length,
          results
        }, 'Batch status update failed - no users were updated');
      }
    }

    // Log operations (best-effort, failures don't rollback DB changes)
    for (const result of results) {
      if (result.success && result.message?.includes('updated')) {
        try {
          await logGlobalOperation(
            env,
            adminEmail,
            'user_status_updated_batch',
            'user',
            result.userEmail,
            {
              newStatus: status,
              updatedBy: adminEmail,
              batchOperation: true,
              totalUsers: userEmails.length
            },
            { level: 'info' }
          );
        } catch (logError) {
          console.error('[batchUpdateUserStatus] Failed to log operation:', logError);
        }

        // Create notification
        try {
          await queueSingleNotification(env, {
            targetUserEmail: result.userEmail,
            type: 'user_status_changed',
            title: '帳戶狀態變更',
            content: status === 'active' ? '你的帳戶已被管理員啟用' : '你的帳戶已被管理員停用',
            metadata: {
              newStatus: status,
              updatedBy: adminEmail
            }
          });
        } catch (notifError) {
          console.error('[batchUpdateUserStatus] Failed to send notification:', notifError);
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return successResponse({
      successCount,
      failureCount,
      results
    }, `Batch status update completed: ${successCount} succeeded, ${failureCount} failed`);

  } catch (error) {
    console.error('Batch update user status error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch update user status');
  }
}

/**
 * Batch reset password for multiple users
 */
export async function batchResetPassword(
  env: Env,
  userEmails: string[],
  newPassword: string,
  adminEmail: string
): Promise<Response> {
  try {
    if (!userEmails || userEmails.length === 0) {
      return errorResponse('INVALID_INPUT', 'userEmails array is required');
    }

    // Enforce batch size limit to prevent DoS
    const MAX_BATCH_SIZE = 100;
    if (userEmails.length > MAX_BATCH_SIZE) {
      return errorResponse('INVALID_INPUT', `Cannot reset password for more than ${MAX_BATCH_SIZE} users at once`);
    }

    // SECURITY: Reject batch password reset with same password for all users
    // This is a fundamental security flaw - each user must have a unique password
    // Admins should use individual password reset or generate unique passwords per user
    return errorResponse(
      'OPERATION_NOT_ALLOWED',
      'Batch password reset with same password is not allowed for security reasons. ' +
      'Please reset passwords individually or generate unique passwords for each user.'
    );

  } catch (error) {
    console.error('Batch reset password error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to batch reset password');
  }
}

/**
 * Get user's global groups (admin function)
 */
export async function getUserGlobalGroups(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Get user's global group memberships
    const result = await env.DB.prepare(`
      SELECT
        gug.globalGroupId,
        gg.groupName,
        gg.globalPermissions,
        gug.joinedAt
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      WHERE gug.userEmail = ? AND gug.isActive = 1
    `).bind(userEmail).all();

    const userGroupDetails = result.results?.map((g: any) => ({
      groupId: g.globalGroupId,
      groupName: g.groupName,
      globalPermissions: parseJSON(g.globalPermissions, []),
      joinedAt: g.joinedAt
    })) || [];

    return successResponse(userGroupDetails);

  } catch (error) {
    console.error('Get user global groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user global groups');
  }
}

/**
 * Get user's project groups with allowChange settings (admin function)
 */
export async function getUserProjectGroups(
  env: Env,
  userEmail: string
): Promise<Response> {
  try {
    // Validate userEmail
    if (!userEmail) {
      return errorResponse('INVALID_INPUT', 'userEmail is required');
    }

    // Get user's project group memberships
    const result = await env.DB.prepare(`
      SELECT
        pug.projectId,
        p.projectName,
        pug.groupId,
        g.groupName,
        pug.role,
        g.allowChange,
        pug.joinTime
      FROM usergroups pug
      JOIN projects p ON pug.projectId = p.projectId
      JOIN groups g ON pug.groupId = g.groupId
      WHERE pug.userEmail = ?
        AND pug.isActive = 1
        AND p.status NOT IN ('archived', 'deleted')
        AND g.status = 'active'
      ORDER BY p.projectName, g.groupName
    `).bind(userEmail).all();

    const userProjectGroups = result.results?.map((row: any) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      groupId: row.groupId,
      groupName: row.groupName,
      role: row.role,
      allowChange: row.allowChange !== 0,
      joinTime: row.joinTime
    })) || [];

    return successResponse(userProjectGroups);

  } catch (error) {
    console.error('Get user project groups error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user project groups');
  }
}

/**
 * Unlock a locked user account (admin function)
 */
export async function unlockUser(
  env: Env,
  adminEmail: string,
  userEmail: string,
  unlockReason: string,
  resetLockCount: boolean = false
): Promise<Response> {
  try {
    // Validate inputs
    if (!userEmail) {
      return errorResponse('INVALID_INPUT', 'userEmail is required');
    }
    if (!unlockReason || unlockReason.length < 10) {
      return errorResponse('INVALID_INPUT', 'Unlock reason must be at least 10 characters');
    }

    // Get user with lock information
    const user = await env.DB.prepare(`
      SELECT
        userId,
        userEmail,
        displayName,
        status,
        lockUntil,
        lockReason,
        lockCount
      FROM users
      WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Check if user is actually locked
    const now = Date.now();
    const lockUntil = user.lockUntil as number | null;
    const isTemporarilyLocked = lockUntil && lockUntil > now;
    const isPermanentlyDisabled = user.status === 'disabled';

    if (!isTemporarilyLocked && !isPermanentlyDisabled) {
      return errorResponse('USER_NOT_LOCKED', 'User is not currently locked');
    }

    // Store previous values for logging
    const previousLockUntil = user.lockUntil;
    const previousLockReason = user.lockReason;
    const previousLockCount = user.lockCount;

    // Prepare update query based on what needs to be unlocked
    let updateQuery = '';
    const updateParams: any[] = [];

    if (resetLockCount) {
      // Reset everything including lock count
      updateQuery = `
        UPDATE users
        SET lockUntil = NULL,
            lockReason = NULL,
            lockCount = 0,
            status = 'active',
            lastActivityTime = ?
        WHERE userEmail = ?
      `;
      updateParams.push(now, userEmail);
    } else {
      // Only clear lock but preserve lock count
      updateQuery = `
        UPDATE users
        SET lockUntil = NULL,
            lockReason = NULL,
            status = 'active',
            lastActivityTime = ?
        WHERE userEmail = ?
      `;
      updateParams.push(now, userEmail);
    }

    // Execute unlock
    await env.DB.prepare(updateQuery).bind(...updateParams).run();

    // Log the unlock operation
    await logGlobalOperation(
      env,
      adminEmail,
      'account_unlocked',
      'user',
      user.userEmail as string,
      {
        unlockedBy: adminEmail,
        unlockReason,
        previousLockUntil,
        previousLockReason,
        previousLockCount,
        resetLockCount,
        lockType: isPermanentlyDisabled ? 'permanent' : 'temporary'
      },
      { level: 'info' }
    );

    // Send unlock notification to user
    try {
      await sendAccountUnlockedEmail(
        env,
        user.userEmail as string,
        (user.displayName as string) || (user.userEmail as string),
        unlockReason,
        adminEmail,
        (previousLockCount as number) || 0,
        resetLockCount
      );
    } catch (emailError) {
      console.error('[unlockUser] Failed to send unlock email:', emailError);
      // Don't fail the unlock operation if email fails
    }

    // Send in-app notification
    try {
      await queueSingleNotification(env, {
        targetUserEmail: user.userEmail as string,
        type: 'account_unlocked',
        title: '帳戶已解鎖',
        content: `您的帳戶已被管理員解鎖，現在可以正常登入。解鎖理由：${unlockReason}`,
        metadata: {
          unlockedBy: adminEmail,
          unlockReason,
          unlockTime: now,
          resetLockCount
        }
      });
    } catch (notifError) {
      console.error('[unlockUser] Failed to send notification:', notifError);
    }

    return successResponse({
      userEmail,
      previousLockUntil,
      previousLockCount,
      resetLockCount
    }, 'User account unlocked successfully');

  } catch (error) {
    console.error('Unlock user error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to unlock user account');
  }
}

/**
 * Send account unlocked notification email via Email Queue
 */
async function sendAccountUnlockedEmail(
  env: Env,
  userEmail: string,
  displayName: string,
  unlockReason: string,
  unlockedBy: string,
  previousLockCount: number,
  resetLockCount: boolean
): Promise<void> {
  try {
    // Queue the email for asynchronous processing
    await queueAccountUnlockedEmail(
      env,
      userEmail,
      displayName,
      unlockedBy
    );

    console.log(`[sendAccountUnlockedEmail] Email queued for ${userEmail}`);
  } catch (error) {
    console.error('[sendAccountUnlockedEmail] Failed to queue email:', error);
    // Don't throw - email failure shouldn't break the unlock flow
  }
}
