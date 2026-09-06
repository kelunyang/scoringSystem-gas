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
/** 顯示在使用者名稱旁的身分標記。 */
export interface UserBadge {
  type: string;
  label: string;
  color: string;
  icon: string;
}

/** 使用者搜尋結果的一列。 */
interface UserSearchRow {
  userId: string;
  userEmail: string;
  displayName: string;
  avatarSeed: string | null;
  avatarStyle: string | null;
  /** JSON 字串，讀出來會補上預設色。 */
  avatarOptions: string | null;
}

export async function searchUsers(
  env: Env,
  sessionUserEmail: string,
  query: string,
  limit: number = 10
) {
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
    ).all<UserSearchRow>();

    // Get all user emails for batch badge query
    const userEmails = users.results.map(u => u.userEmail);

    // Batch query badges for all users (2 queries instead of N*3 queries)
    const badgesMap = await getBatchUserBadges(env, userEmails);

    // Format results using pre-fetched badges
    const matchingUsers = users.results.map(user => ({
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

/**
 * Helper: Get badges for multiple users in batch (optimized for search)
 * Reduces N+1 queries to just 2 queries regardless of user count
 */
async function getBatchUserBadges(
  env: Env,
  userEmails: string[]
): Promise<Map<string, UserBadge[]>> {
  const badgesMap = new Map<string, UserBadge[]>();

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
        AND gug.isActive = 1
        AND gg.isActive = 1
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
