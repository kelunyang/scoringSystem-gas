/**
 * User Search and Discovery Handlers
 * Migrated from GAS scripts/users_api.js
 *
 * Updated to use role-based permissions instead of tag-based filtering
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';

/**
 * Search users (for mentions, adding to groups, etc.)
 *
 * For admins: Returns all active users
 * For regular users: Returns all active users (simplified for now)
 *
 * Note: Project-specific filtering should be done at the API/component level
 * by checking projectviewers table
 */
export async function searchUsers(
  env: Env,
  sessionUserEmail: string,
  query: string,
  limit: number = 10
): Promise<Response> {
  try {
    if (!query || query.length < 2) {
      return errorResponse('INVALID_INPUT', 'Search query must be at least 2 characters');
    }

    // Sanitize query (max 50 chars, lowercase)
    const sanitizedQuery = query.substring(0, 50).toLowerCase();

    // Search all active users matching the query
    const users = await env.DB.prepare(`
      SELECT
        userId, userEmail, displayName,
        avatarSeed, avatarStyle, avatarOptions
      FROM users
      WHERE status = 'active'
        AND (
          LOWER(userEmail) LIKE ?
          OR LOWER(displayName) LIKE ?
        )
      LIMIT ?
    `).bind(
      `%${sanitizedQuery}%`,
      `%${sanitizedQuery}%`,
      limit
    ).all();

    // Get all user emails for batch badge query
    const userEmails = users.results.map((u: any) => u.userEmail as string);

    // Batch query badges for all users (2 queries instead of N*3 queries)
    const badgesMap = await getBatchUserBadges(env, userEmails);

    // Format results using pre-fetched badges
    const matchingUsers = users.results.map((user: any) => ({
      userId: user.userId,
      userEmail: user.userEmail,
      displayName: user.displayName,
      // DISABLED: tags,
      avatarSeed: user.avatarSeed || generateAvatarSeed(user.userEmail),
      avatarStyle: user.avatarStyle || 'avataaars',
      avatarOptions: parseJSON(user.avatarOptions, {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }),
      badges: badgesMap.get(user.userEmail) || []
    }));

    return successResponse(matchingUsers);
  } catch (error) {
    console.error('Search users error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to search users');
  }
}

/**
 * Helper: Get user tags for display
 * DISABLED: Tags system has been disabled
 */
/* DISABLED - Tags system
async function getUserTagsForDisplay(env: Env, userEmail: string): Promise<any[]> {
  try {
    const userId = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!userId) return [];

    const tags = await env.DB.prepare(`
      SELECT t.tagId, t.tagName
      FROM usertags ut
      JOIN globaltags t ON ut.tagId = t.tagId
      WHERE ut.userEmail = ? AND ut.isActive = 1 AND t.isActive = 1
    `).bind(userEmail).all();

    return tags.results.map((t: any) => ({
      tagId: t.tagId,
      tagName: t.tagName
    }));
  } catch (error) {
    console.warn('Get user tags for display error:', error);
    return [];
  }
}
*/

/**
 * Helper: Check if user is system admin
 */
async function checkIsSystemAdmin(env: Env, userEmail: string): Promise<boolean> {
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
      if (permissions.includes('system_admin')) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn('Check system admin error:', error);
    return false;
  }
}

/**
 * Helper: Get user badges (single user - kept for backward compatibility)
 */
async function getUserBadges(env: Env, userEmail: string): Promise<any[]> {
  try {
    const badges: any[] = [];

    // Check if user is system admin
    const isAdmin = await checkIsSystemAdmin(env, userEmail);
    if (isAdmin) {
      badges.push({
        type: 'admin',
        label: '系統管理員',
        color: '#e74c3c',
        icon: 'fas fa-crown'
      });
    }

    // Check if user is global PM
    const result = await env.DB.prepare(`
      SELECT gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      JOIN users u ON gug.userEmail = u.userEmail
      WHERE u.userEmail = ?
    `).bind(userEmail).all();

    for (const row of result.results) {
      const permissions = parseJSON<string[]>(row.globalPermissions as string, []);
      if (permissions.includes('create_project')) {
        badges.push({
          type: 'pm',
          label: '總PM',
          color: '#f39c12',
          icon: 'fas fa-star'
        });
        break;
      }
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
 * Helper: Get badges for multiple users in batch (optimized for search)
 * Reduces N+1 queries to just 2 queries regardless of user count
 */
async function getBatchUserBadges(
  env: Env,
  userEmails: string[]
): Promise<Map<string, any[]>> {
  const badgesMap = new Map<string, any[]>();

  if (userEmails.length === 0) return badgesMap;

  // Initialize all users with empty badges array
  userEmails.forEach(email => badgesMap.set(email, []));

  try {
    // Query 1: Get all global permissions (system_admin + create_project) in one query
    const placeholders = userEmails.map(() => '?').join(',');
    const permissionsResult = await env.DB.prepare(`
      SELECT u.userEmail, gg.globalPermissions
      FROM globalusergroups gug
      JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
      JOIN users u ON gug.userEmail = u.userEmail
      WHERE u.userEmail IN (${placeholders})
    `).bind(...userEmails).all();

    // Process permissions - track which badges each user already has to avoid duplicates
    const userAdminBadge = new Set<string>();
    const userPmBadge = new Set<string>();

    for (const row of permissionsResult.results) {
      const email = row.userEmail as string;
      const permissions = parseJSON<string[]>(row.globalPermissions as string, []);
      const badges = badgesMap.get(email) || [];

      if (permissions.includes('system_admin') && !userAdminBadge.has(email)) {
        userAdminBadge.add(email);
        badges.push({
          type: 'admin',
          label: '系統管理員',
          color: '#e74c3c',
          icon: 'fas fa-crown'
        });
      }
      if (permissions.includes('create_project') && !userPmBadge.has(email)) {
        userPmBadge.add(email);
        badges.push({
          type: 'pm',
          label: '總PM',
          color: '#f39c12',
          icon: 'fas fa-star'
        });
      }
      badgesMap.set(email, badges);
    }

    // Query 2: Get all leaders in active projects in one query
    const leaderResult = await env.DB.prepare(`
      SELECT DISTINCT pug.userEmail
      FROM usergroups pug
      JOIN projects p ON pug.projectId = p.projectId
      WHERE pug.userEmail IN (${placeholders})
        AND p.status = 'active'
        AND pug.role = 'leader'
    `).bind(...userEmails).all();

    for (const row of leaderResult.results) {
      const email = row.userEmail as string;
      const badges = badgesMap.get(email) || [];
      badges.push({
        type: 'leader',
        label: '組長',
        color: '#3498db',
        icon: 'fas fa-users'
      });
      badgesMap.set(email, badges);
    }
  } catch (error) {
    console.warn('Get batch user badges error:', error);
  }

  return badgesMap;
}

/**
 * Helper: Generate avatar seed
 */
function generateAvatarSeed(userEmail: string): string {
  const timestamp = Date.now().toString();
  const emailHash = userEmail.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${Math.abs(emailHash)}_${timestamp.slice(-6)}`;
}
