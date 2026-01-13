/**
 * @fileoverview Permission checking utilities
 * Supports both global and project-level permissions
 */

import { parseJsonArray } from './json';

/**
 * Global permission types
 */
export const GLOBAL_PERMISSIONS = {
  // System administration
  SYSTEM_ADMIN: 'system_admin',
  MANAGE_USERS: 'manage_users',
  MANAGE_GLOBAL_GROUPS: 'manage_global_groups',

  // Project management
  CREATE_PROJECT: 'create_project',
  DELETE_ANY_PROJECT: 'delete_any_project',
  MANAGE_ANY_PROJECT: 'manage_any_project',

  // Invitation management
  GENERATE_INVITES: 'generate_invites',
  MANAGE_INVITATIONS: 'manage_invitations',

  // Global settings
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  VIEW_SYSTEM_LOGS: 'view_system_logs',
  VIEW_EMAIL_LOGS: 'view_email_logs',
  MANAGE_EMAIL_LOGS: 'manage_email_logs',
  VIEW_AI_SERVICE_LOGS: 'view_ai_service_logs',

  // DISABLED: Tags - tags system has been disabled
  // MANAGE_TAGS: 'manage_tags',

  // Notifications
  NOTIFICATION_MANAGER: 'notification_manager',

  // Announcements
  MANAGE_ANNOUNCEMENTS: 'manage_announcements'
} as const;

/**
 * Project-level permission types
 */
export const PROJECT_PERMISSIONS = {
  // Project management
  MANAGE_PROJECT: 'manage_project',
  DELETE_PROJECT: 'delete_project',
  EDIT_PROJECT_SETTINGS: 'edit_project_settings',

  // Member management
  MANAGE_MEMBERS: 'manage_members',
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',

  // Group management
  MANAGE_GROUPS: 'manage_groups',
  ASSIGN_GROUPS: 'assign_groups',

  // Stage management
  MANAGE_STAGES: 'manage_stages',
  CREATE_STAGES: 'create_stages',
  EDIT_STAGES: 'edit_stages',
  DELETE_STAGES: 'delete_stages',

  // Submission management
  VIEW_ALL_SUBMISSIONS: 'view_all_submissions',
  EDIT_ANY_SUBMISSION: 'edit_any_submission',
  DELETE_ANY_SUBMISSION: 'delete_any_submission',

  // Scoring management
  MANAGE_CRITERIA: 'manage_criteria',
  SCORE_SUBMISSIONS: 'score_submissions',
  VIEW_ALL_SCORES: 'view_all_scores',

  // Wallet management
  MANAGE_WALLETS: 'manage_wallets',
  AWARD_POINTS: 'award_points',
  REVERSE_TRANSACTIONS: 'reverse_transactions',

  // Comment management
  MODERATE_COMMENTS: 'moderate_comments',
  DELETE_ANY_COMMENT: 'delete_any_comment',

  // General
  VIEW_PROJECT: 'view_project'
} as const;

/**
 * Check if user has a global permission
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param permission - Permission to check
 * @returns true if user has the permission
 *
 * @example
 * const canCreate = await hasGlobalPermission(db, userId, GLOBAL_PERMISSIONS.CREATE_PROJECT);
 */
export async function hasGlobalPermission(
  db: D1Database,
  userId: string,
  permission: string
): Promise<boolean> {
  try {
    // First, get the user's email and check if user is active
    const user = await db
      .prepare('SELECT userEmail, status FROM users WHERE userId = ?')
      .bind(userId)
      .first();

    if (!user) {
      console.error('User not found:', userId);
      return false;
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.error('User is not active:', userId, user.status);
      return false;
    }

    const userEmail = user.userEmail as string;

    // Get user's global groups using email
    const userGroups = await db
      .prepare(
        `SELECT gg.globalPermissions
         FROM globalusergroups ug
         JOIN globalgroups gg ON ug.globalGroupId = gg.globalGroupId
         WHERE ug.userEmail = ? AND gg.isActive = 1`
      )
      .bind(userEmail)
      .all();

    if (!userGroups.results || userGroups.results.length === 0) {
      return false;
    }

    // Check if any group has the permission
    for (const group of userGroups.results) {
      const permissions = parseJsonArray(group.globalPermissions as string);
      if (permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking global permission:', error);
    return false;
  }
}

/**
 * Check if user has a project-level permission
 *
 * Permission hierarchy:
 * 1. Global permissions (system_admin) override project permissions
 * 2. Project creator has all permissions
 * 3. Project teacher role has teaching/management permissions
 * 4. Group leaders have limited management permissions
 * 5. Regular members have basic permissions
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param projectId - Project ID
 * @param permission - Permission to check
 * @returns true if user has the permission
 *
 * @example
 * const canManage = await hasProjectPermission(db, userId, projectId, PROJECT_PERMISSIONS.MANAGE_PROJECT);
 */
export async function hasProjectPermission(
  db: D1Database,
  userId: string,
  projectId: string,
  permission: string
): Promise<boolean> {
  try {
    // Check if user has system_admin global permission
    const hasSystemAdmin = await hasGlobalPermission(db, userId, 'system_admin');

    if (hasSystemAdmin) {
      return true; // System admins have all permissions
    }

    // Get user email for project role check
    const user = await db
      .prepare('SELECT userEmail FROM users WHERE userId = ?')
      .bind(userId)
      .first();

    if (!user) {
      return false;
    }

    const userEmail = user.userEmail as string;

    // Check if user is project creator
    const project = await db
      .prepare(`SELECT createdBy FROM projects WHERE projectId = ?`)
      .bind(projectId)
      .first();

    if (project && project.createdBy === userEmail) {
      return true; // Project creators have all permissions
    }

    // Check if user has teacher role in this project
    const projectRole = await getProjectRole(db, userEmail, projectId);

    if (projectRole === 'teacher') {
      const teacherPermissions = [
        'manage_project', 'manage_stages', 'manage_criteria',
        'score_submissions', 'view_all_scores', 'view_all_submissions',
        'manage_wallets', 'award_points', 'moderate_comments'
      ];
      if (teacherPermissions.includes(permission)) {
        return true;
      }
    }

    // Observer role has read-only permissions
    if (projectRole === 'observer') {
      const observerPermissions = [
        'view_project', 'view_all_submissions', 'view_all_scores'
      ];
      if (observerPermissions.includes(permission)) {
        return true;
      }
    }

    // Get user's group role in the project
    const userGroup = await db
      .prepare(
        `SELECT role FROM usergroups
         WHERE userEmail = ? AND projectId = ? AND isActive = 1`
      )
      .bind(userEmail, projectId)
      .first();

    if (!userGroup) {
      return false; // Not a project member
    }

    const groupRole = userGroup.role as string;

    // Leader permissions (group leader)
    if (groupRole === 'leader') {
      const leaderPermissions = [
        'view_project', 'view_all_submissions', 'invite_members'
      ];
      if (leaderPermissions.includes(permission)) {
        return true;
      }
    }

    // Member permissions (basic access)
    const memberPermissions = ['view_project'];
    if (memberPermissions.includes(permission)) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking project permission:', error);
    return false;
  }
}

/**
 * Get user's group membership in a project
 * Returns the group and role information
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param projectId - Project ID
 * @returns Object with groupId, groupName, and role, or null if not a member
 *
 * @example
 * const membership = await getUserProjectGroup(db, userId, projectId);
 * // Returns: { groupId: 'grp_123', groupName: 'Team A', role: 'leader' }
 */
export async function getUserProjectGroup(
  db: D1Database,
  userId: string,
  projectId: string
): Promise<{ groupId: string; groupName: string; role: string } | null> {
  try {
    const result = await db
      .prepare(
        `SELECT ug.groupId, g.groupName, ug.role
         FROM usergroups ug
         JOIN groups g ON ug.groupId = g.groupId
         WHERE ug.userId = ? AND ug.projectId = ? AND ug.isActive = 1`
      )
      .bind(userId, projectId)
      .first();

    if (!result) {
      return null;
    }

    return {
      groupId: result.groupId as string,
      groupName: result.groupName as string,
      role: result.role as string
    };
  } catch (error) {
    console.error('Error getting user project group:', error);
    return null;
  }
}

/**
 * Check if user is a member of a project
 * (Has any active group assignment in the project)
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param projectId - Project ID
 * @returns true if user is a project member
 *
 * @example
 * const isMember = await isProjectMember(db, userId, projectId);
 */
export async function isProjectMember(
  db: D1Database,
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM usergroups
         WHERE userId = ? AND projectId = ? AND isActive = 1`
      )
      .bind(userId, projectId)
      .first();

    return (result?.count as number) > 0;
  } catch (error) {
    console.error('Error checking project membership:', error);
    return false;
  }
}

/**
 * Check if user is the creator/owner of a project
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param projectId - Project ID
 * @returns true if user is the project creator
 *
 * @example
 * const isOwner = await isProjectCreator(db, userId, projectId);
 */
export async function isProjectCreator(
  db: D1Database,
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    const project = await db
      .prepare(
        `SELECT creatorId FROM projects WHERE projectId = ?`
      )
      .bind(projectId)
      .first();

    return project?.creatorId === userId;
  } catch (error) {
    console.error('Error checking project creator:', error);
    return false;
  }
}

/**
 * Check if user is a leader of a specific group
 *
 * @param db - D1 database instance
 * @param userId - User ID to check
 * @param projectId - Project ID
 * @param groupId - Group ID
 * @returns true if user is the group leader
 *
 * @example
 * const isLeader = await isGroupLeader(db, userId, projectId, groupId);
 */
export async function isGroupLeader(
  db: D1Database,
  userId: string,
  projectId: string,
  groupId: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `SELECT role FROM usergroups
         WHERE userId = ? AND projectId = ? AND groupId = ? AND isActive = 1`
      )
      .bind(userId, projectId, groupId)
      .first();

    return result?.role === 'leader';
  } catch (error) {
    console.error('Error checking group leader:', error);
    return false;
  }
}

/**
 * Get all global permissions for a user
 *
 * @param db - D1 database instance
 * @param userId - User ID
 * @returns Array of permission strings
 *
 * @example
 * const permissions = await getUserGlobalPermissions(db, userId);
 * // Returns: ['create_project', 'generate_invites']
 */
export async function getUserGlobalPermissions(
  db: D1Database,
  userId: string
): Promise<string[]> {
  try {
    console.log('🔍 [getUserGlobalPermissions] Starting for userId:', userId);

    // First, get the user's email and check if user is active
    const user = await db
      .prepare('SELECT userEmail, status FROM users WHERE userId = ?')
      .bind(userId)
      .first();

    console.log('🔍 [getUserGlobalPermissions] User found:', user);

    if (!user) {
      console.error('❌ [getUserGlobalPermissions] User not found:', userId);
      return [];
    }

    // Check if user is active
    if (user.status !== 'active') {
      console.error('❌ [getUserGlobalPermissions] User is not active:', userId, user.status);
      return [];
    }

    const userEmail = user.userEmail as string;
    console.log('🔍 [getUserGlobalPermissions] Looking up permissions for email:', userEmail);

    // Now query globalusergroups using the email
    const userGroups = await db
      .prepare(
        `SELECT gg.globalPermissions, gg.groupName, ug.globalGroupId
         FROM globalusergroups ug
         JOIN globalgroups gg ON ug.globalGroupId = gg.globalGroupId
         WHERE ug.userEmail = ? AND gg.isActive = 1`
      )
      .bind(userEmail)
      .all();

    console.log('🔍 [getUserGlobalPermissions] User groups query result:', {
      resultsCount: userGroups.results?.length || 0,
      results: userGroups.results
    });

    if (!userGroups.results || userGroups.results.length === 0) {
      console.warn('⚠️ [getUserGlobalPermissions] No global groups found for email:', userEmail);
      return [];
    }

    // Collect all unique permissions
    const permissionsSet = new Set<string>();
    for (const group of userGroups.results) {
      console.log('🔍 [getUserGlobalPermissions] Processing group:', {
        groupName: group.groupName,
        rawPermissions: group.globalPermissions
      });

      const permissions = parseJsonArray(group.globalPermissions as string);
      console.log('🔍 [getUserGlobalPermissions] Parsed permissions:', permissions);

      permissions.forEach(p => permissionsSet.add(p));
    }

    const finalPermissions = Array.from(permissionsSet);
    console.log('✅ [getUserGlobalPermissions] Final permissions:', finalPermissions);

    return finalPermissions;
  } catch (error) {
    console.error('❌ [getUserGlobalPermissions] Error getting user global permissions:', error);
    return [];
  }
}

/**
 * Get all project permissions for a user
 *
 * @param db - D1 database instance
 * @param userId - User ID
 * @param projectId - Project ID
 * @returns Array of permission strings
 *
 * @example
 * const permissions = await getUserProjectPermissions(db, userId, projectId);
 * // Returns: ['manage_project', 'manage_stages', 'score_submissions']
 */
export async function getUserProjectPermissions(
  db: D1Database,
  userId: string,
  projectId: string
): Promise<string[]> {
  try {
    const userGroups = await db
      .prepare(
        `SELECT pp.permissions
         FROM usergroups ug
         JOIN projectpermissions pp ON ug.groupId = pp.groupId
         WHERE ug.userId = ?
           AND ug.projectId = ?
           AND ug.isActive = 1
           AND pp.projectId = ?`
      )
      .bind(userId, projectId, projectId)
      .all();

    if (!userGroups.results || userGroups.results.length === 0) {
      return [];
    }

    // Collect all unique permissions
    const permissionsSet = new Set<string>();
    for (const group of userGroups.results) {
      const permissions = parseJsonArray(group.permissions as string);
      permissions.forEach(p => permissionsSet.add(p));
    }

    return Array.from(permissionsSet);
  } catch (error) {
    console.error('Error getting user project permissions:', error);
    return [];
  }
}

/**
 * Check if user has ANY of the specified global permissions
 *
 * @param db - D1 database instance
 * @param userId - User ID
 * @param permissions - Array of permissions to check
 * @returns true if user has at least one permission
 *
 * @example
 * const canManage = await hasAnyGlobalPermission(db, userId, [
 *   GLOBAL_PERMISSIONS.SYSTEM_ADMIN,
 *   GLOBAL_PERMISSIONS.MANAGE_USERS
 * ]);
 */
export async function hasAnyGlobalPermission(
  db: D1Database,
  userId: string,
  permissions: string[]
): Promise<boolean> {
  const userPermissions = await getUserGlobalPermissions(db, userId);
  return permissions.some(p => userPermissions.includes(p));
}

/**
 * Check if user has ALL of the specified global permissions
 *
 * @param db - D1 database instance
 * @param userId - User ID
 * @param permissions - Array of permissions to check
 * @returns true if user has all permissions
 *
 * @example
 * const hasAll = await hasAllGlobalPermissions(db, userId, [
 *   GLOBAL_PERMISSIONS.CREATE_PROJECT,
 *   GLOBAL_PERMISSIONS.GENERATE_INVITES
 * ]);
 */
export async function hasAllGlobalPermissions(
  db: D1Database,
  userId: string,
  permissions: string[]
): Promise<boolean> {
  const userPermissions = await getUserGlobalPermissions(db, userId);
  return permissions.every(p => userPermissions.includes(p));
}

/**
 * Project viewer role types
 */
export type ProjectRole = 'teacher' | 'observer' | 'member' | null;

/**
 * Get user's role in a project from projectviewers table
 * Returns the role if user is in projectviewers, otherwise checks usergroups for 'member'
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @returns Role string or null if not a viewer/member
 *
 * @example
 * const role = await getProjectRole(db, userEmail, projectId);
 * if (role === 'teacher') { // User can teach in this project }
 */
export async function getProjectRole(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<ProjectRole> {
  try {
    // First check projectviewers table for teacher/observer roles
    const viewer = await db
      .prepare(
        `SELECT role FROM projectviewers
         WHERE projectId = ? AND userEmail = ? AND isActive = 1`
      )
      .bind(projectId, userEmail)
      .first();

    if (viewer) {
      return viewer.role as ProjectRole;
    }

    // If not in projectviewers, check if user is a member through usergroups
    const member = await db
      .prepare(
        `SELECT COUNT(*) as count FROM usergroups
         WHERE projectId = ? AND userEmail = ? AND isActive = 1`
      )
      .bind(projectId, userEmail)
      .first();

    if (member && (member.count as number) > 0) {
      return 'member';
    }

    return null;
  } catch (error) {
    console.error('Error getting project role:', error);
    return null;
  }
}

/**
 * Check if user has a specific role in a project
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @param role - Role to check for ('teacher' | 'observer' | 'member')
 * @returns true if user has the specified role
 *
 * @example
 * const isTeacher = await checkProjectRole(db, userEmail, projectId, 'teacher');
 */
export async function checkProjectRole(
  db: D1Database,
  userEmail: string,
  projectId: string,
  role: 'teacher' | 'observer' | 'member'
): Promise<boolean> {
  const userRole = await getProjectRole(db, userEmail, projectId);
  return userRole === role;
}

/**
 * Check if user can view a project
 * User can view if:
 * - Has system_admin or create_project global permission
 * - Is in projectviewers (teacher/observer)
 * - Is a member through usergroups
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @returns true if user can view the project
 *
 * @example
 * const canView = await canViewProject(db, userEmail, projectId);
 */
export async function canViewProject(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  try {
    // Get userId from email
    const user = await db
      .prepare('SELECT userId FROM users WHERE userEmail = ?')
      .bind(userEmail)
      .first();

    if (!user) {
      return false;
    }

    const userId = user.userId as string;

    // Check for global permissions (system_admin or create_project)
    const hasGlobalAccess = await hasAnyGlobalPermission(
      db,
      userId,
      [GLOBAL_PERMISSIONS.SYSTEM_ADMIN, GLOBAL_PERMISSIONS.CREATE_PROJECT]
    );

    if (hasGlobalAccess) {
      return true;
    }

    // Check if user has any role in the project
    const role = await getProjectRole(db, userEmail, projectId);
    return role !== null;
  } catch (error) {
    console.error('Error checking project view permission:', error);
    return false;
  }
}

/**
 * Check if user is admin, teacher, or observer (Level 0-2 in the six-layer permission model)
 *
 * This is used to determine if user can see voting details for all groups.
 *
 * User is considered admin/teacher/observer if:
 * - Level 0: Has system_admin global permission
 * - Level 0: Is the project creator
 * - Level 1: Has 'teacher' role in projectviewers
 * - Level 2: Has 'observer' role in projectviewers
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @returns true if user is admin, creator, teacher, or observer
 *
 * @example
 * const canSeeVoting = await checkIsAdminTeacherOrObserver(db, userEmail, projectId);
 * if (canSeeVoting) {
 *   // User can see voting details for all groups
 * }
 */
export async function checkIsAdminTeacherOrObserver(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  try {
    // Get userId from email
    const user = await db
      .prepare('SELECT userId FROM users WHERE userEmail = ?')
      .bind(userEmail)
      .first();

    if (!user) {
      return false;
    }

    const userId = user.userId as string;

    // Level 0: Check if user has system_admin global permission
    const hasSystemAdmin = await hasGlobalPermission(db, userId, 'system_admin');
    if (hasSystemAdmin) {
      return true;
    }

    // Level 0: Check if user is project creator
    const project = await db
      .prepare('SELECT createdBy FROM projects WHERE projectId = ?')
      .bind(projectId)
      .first();

    if (project && project.createdBy === userEmail) {
      return true;
    }

    // Level 1-2: Check if user has teacher or observer role
    const viewer = await db
      .prepare(
        `SELECT role FROM projectviewers
         WHERE projectId = ? AND userEmail = ? AND isActive = 1`
      )
      .bind(projectId, userEmail)
      .first();

    if (viewer && (viewer.role === 'teacher' || viewer.role === 'observer')) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking admin/teacher/observer status:', error);
    return false;
  }
}

/**
 * Check if user is teacher or observer (Level 1-2 in the six-layer permission model)
 *
 * This is used to determine if user can see participation percentages.
 * Admin/Creator cannot see percentages (administrative role only).
 * Teacher/Observer can see percentages (for grading and monitoring).
 *
 * User is considered teacher/observer if:
 * - Level 1: Has 'teacher' role in projectviewers
 * - Level 2: Has 'observer' role in projectviewers
 *
 * Note: This explicitly excludes Level 0 (Admin/Creator) to enforce role separation.
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @returns true if user is teacher or observer (NOT admin)
 *
 * @example
 * const canSeePercentages = await checkIsTeacherOrObserver(db, userEmail, projectId);
 * if (canSeePercentages) {
 *   // User can see participation percentages for grading/monitoring
 * }
 */
export async function checkIsTeacherOrObserver(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  try {
    // Reuse existing getProjectRole function
    const role = await getProjectRole(db, userEmail, projectId);
    return role === 'teacher' || role === 'observer';
  } catch (error) {
    console.error('Error checking teacher/observer status:', error);
    return false;
  }
}

/**
 * Check if user can manage settlements (reverse settlements, view settlement history)
 *
 * User can manage settlements if:
 * - Has create_project global permission (Global PM)
 * - Has teacher role in the project
 *
 * @param db - D1 database instance
 * @param userEmail - User email to check
 * @param projectId - Project ID
 * @returns true if user can manage settlements
 *
 * @example
 * const canManage = await canManageSettlements(db, userEmail, projectId);
 * if (canManage) {
 *   // User can reverse settlements or view detailed settlement history
 * }
 */
export async function canManageSettlements(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  try {
    // Get userId from email
    const user = await db
      .prepare('SELECT userId FROM users WHERE userEmail = ? AND status = ?')
      .bind(userEmail, 'active')
      .first();

    if (!user) {
      return false;
    }

    const userId = user.userId as string;

    // Check if user has create_project global permission (Global PM)
    const hasGlobalPM = await hasGlobalPermission(db, userId, GLOBAL_PERMISSIONS.CREATE_PROJECT);
    if (hasGlobalPM) {
      return true;
    }

    // Check if user has teacher role in this project
    const role = await getProjectRole(db, userEmail, projectId);
    return role === 'teacher';
  } catch (error) {
    console.error('Error checking settlement management permission:', error);
    return false;
  }
}
