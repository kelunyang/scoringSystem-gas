/**
 * @fileoverview Permission checking middleware for Hono
 * Checks global permissions in middleware
 * Resource-level permissions should be checked in business logic
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, HonoVariables } from '../types';
import { getAuthUser } from './auth';
import { hasGlobalPermission, GLOBAL_PERMISSIONS } from '../utils/permissions';
import { errorResponse, ERROR_CODES } from '../utils/response';

/**
 * Create a middleware that requires specific global permissions
 *
 * @param permissions - Array of permission strings (user needs ANY of them)
 * @returns Middleware handler
 *
 * @example
 * // Require system admin permission
 * app.post('/api/admin/*', requireGlobalPermission([GLOBAL_PERMISSIONS.SYSTEM_ADMIN]));
 *
 * // Require either system admin OR manage users
 * app.post('/api/users/create',
 *   requireGlobalPermission([
 *     GLOBAL_PERMISSIONS.SYSTEM_ADMIN,
 *     GLOBAL_PERMISSIONS.MANAGE_USERS
 *   ])
 * );
 */
export function requireGlobalPermission(
  permissions: string[]
): MiddlewareHandler<{ Bindings: Env; Variables: HonoVariables }> {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next) => {
    try {
      // Get authenticated user from context (set by authMiddleware)
      const user = getAuthUser(c);

      // Check if user has any of the required permissions
      let hasPermission = false;
      for (const permission of permissions) {
        if (await hasGlobalPermission(c.env.DB, user.userId, permission)) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        return errorResponse(
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          `Required permission: ${permissions.join(' or ')}`
        );
      }

      // User has permission, continue
      return await next();
    } catch (error) {
      console.error('Permission check error:', error);
      return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Permission check failed');
    }
  };
}

/**
 * Create a middleware that requires ALL specified global permissions
 *
 * @param permissions - Array of permission strings (user needs ALL of them)
 * @returns Middleware handler
 *
 * @example
 * // Require both system admin AND manage users
 * app.post('/api/admin/dangerous',
 *   requireAllGlobalPermissions([
 *     GLOBAL_PERMISSIONS.SYSTEM_ADMIN,
 *     GLOBAL_PERMISSIONS.MANAGE_USERS
 *   ])
 * );
 */
export function requireAllGlobalPermissions(
  permissions: string[]
): MiddlewareHandler<{ Bindings: Env; Variables: HonoVariables }> {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next) => {
    try {
      const user = getAuthUser(c);

      // Check if user has ALL required permissions
      for (const permission of permissions) {
        const hasPermission = await hasGlobalPermission(
          c.env.DB,
          user.userId,
          permission
        );

        if (!hasPermission) {
          return errorResponse(
            ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            `Missing required permission: ${permission}`
          );
        }
      }

      // User has all permissions, continue
      return await next();
    } catch (error) {
      console.error('Permission check error:', error);
      return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Permission check failed');
    }
  };
}

/**
 * Middleware: Require system admin permission
 * Shorthand for common use case
 *
 * @example
 * app.use('/api/admin/*', requireSystemAdmin);
 */
export const requireSystemAdmin = requireGlobalPermission([
  GLOBAL_PERMISSIONS.SYSTEM_ADMIN
]);

/**
 * Middleware: Require create project permission
 *
 * @example
 * app.post('/api/projects/create', requireCreateProject);
 */
export const requireCreateProject = requireGlobalPermission([
  GLOBAL_PERMISSIONS.CREATE_PROJECT
]);

/**
 * Middleware: Require generate invites permission
 *
 * @example
 * app.post('/api/invitations/generate', requireGenerateInvites);
 */
export const requireGenerateInvites = requireGlobalPermission([
  GLOBAL_PERMISSIONS.GENERATE_INVITES
]);

/**
 * Middleware: Require manage users permission
 *
 * @example
 * app.use('/api/users/manage/*', requireManageUsers);
 */
export const requireManageUsers = requireGlobalPermission([
  GLOBAL_PERMISSIONS.MANAGE_USERS
]);

/**
 * Check if current user has a specific global permission
 * Helper for use in route handlers (not middleware)
 *
 * @param c - Hono context
 * @param permission - Permission to check
 * @returns true if user has permission
 *
 * @example
 * // In a route handler
 * app.post('/api/something', async (c) => {
 *   if (await checkGlobalPermission(c, GLOBAL_PERMISSIONS.SYSTEM_ADMIN)) {
 *     // User is admin, allow special action
 *   }
 * });
 */
export async function checkGlobalPermission(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  permission: string
): Promise<boolean> {
  try {
    const user = getAuthUser(c);
    return await hasGlobalPermission(c.env.DB, user.userId, permission);
  } catch {
    return false;
  }
}

/**
 * Get all global permissions for current user
 * Helper for use in route handlers
 *
 * @param c - Hono context
 * @returns Array of permission strings
 *
 * @example
 * // In a route handler
 * app.get('/api/user/permissions', async (c) => {
 *   const permissions = await getCurrentUserPermissions(c);
 *   return c.json({ permissions });
 * });
 */
export async function getCurrentUserPermissions(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>
): Promise<string[]> {
  try {
    const user = getAuthUser(c);
    const { getUserGlobalPermissions } = await import('../utils/permissions');
    return await getUserGlobalPermissions(c.env.DB, user.userId);
  } catch {
    return [];
  }
}

/**
 * Check if user has a specific project permission
 * Helper for use in route handlers
 *
 * Permission Levels:
 * - Level 0 (system_admin): All permissions
 * - Level 1 (teacher via projectViewers): manage, view, comment
 * - Level 2 (observer via projectViewers): view only
 * - Level 3 (student via userGroups): submit, vote, comment (based on group permissions)
 *
 * @param env - Environment bindings
 * @param userEmail - User's email
 * @param projectId - Project ID
 * @param permission - Required permission (e.g., 'view', 'manage', 'comment', 'submit', 'vote')
 * @returns true if user has permission
 *
 * @example
 * if (await checkProjectPermission(c.env, user.userEmail, projectId, 'manage')) {
 *   // User can manage this project
 * }
 */
export async function checkProjectPermission(
  env: Env,
  userEmail: string,
  projectId: string,
  permission: string
): Promise<boolean> {
  try {
    // Get user ID
    const userId = (await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(userEmail).first())?.userId;
    if (!userId) return false;

    // Level 0: System admins and project creators have management permissions only
    // They can: manage, view (but NOT comment or vote - those are teacher/student privileges)
    const isAdmin = await hasGlobalPermission(env.DB, userId as string, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    const project = await env.DB.prepare(`
      SELECT createdBy FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    const isCreator = project && project.createdBy === userId;

    if (isAdmin || isCreator) {
      // Admins/Creators can: manage, view
      // They CANNOT: comment, vote, submit (those are teacher/student privileges)
      if (['manage', 'view'].includes(permission)) {
        return true;
      }
      // If requesting other permissions, check if they also have teacher/student roles below
    }

    // Level 1-2: Check projectViewers (teacher/observer roles)
    const viewerResult = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (viewerResult) {
      const role = viewerResult.role as string;

      // Level 1: Teacher permissions
      if (role === 'teacher') {
        // Teachers can: manage, view, comment
        if (['manage', 'view', 'comment'].includes(permission)) {
          return true;
        }
      }

      // Level 2: Observer permissions
      if (role === 'observer') {
        // Observers can only: view (read-only)
        if (permission === 'view') {
          return true;
        }
      }

      // IMPORTANT: If we found a viewer role but permission doesn't match, continue to check userGroups
      // This is intentional fallthrough behavior, BUT it should never trigger in practice because:
      // 1. addProjectViewer() handler checks userGroups and rejects if user is already a student
      // 2. addUserToGroup() handler checks projectViewers and rejects if user is already teacher/observer
      // Therefore, a user should NEVER have both viewer role AND student membership simultaneously.
      // This fallthrough exists only as a safety mechanism for legacy data or edge cases.
    }

    // Level 3: Check userGroups (student permissions via group membership)
    // Students who are active members of a group have: submit, vote, comment permissions
    const groupResult = await env.DB.prepare(`
      SELECT role FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (groupResult) {
      // Active group members have standard student permissions
      const studentPermissions = ['submit', 'vote', 'comment', 'view'];
      if (studentPermissions.includes(permission)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Check project permission error:', error);
    return false;
  }
}

/**
 * Generic permission check (alias for checkGlobalPermission)
 * @deprecated Use checkGlobalPermission or checkProjectPermission directly
 */
export const checkPermission = checkGlobalPermission;

/**
 * Check if user is Teacher level or above (Level 0-2)
 * Includes: Admin, Project Creator, Teacher, Observer
 *
 * This is used for permissions that should be granted to teachers and observers,
 * such as viewing other users' wallets or monitoring student progress.
 *
 * @param db - D1 Database instance
 * @param userEmail - User's email
 * @param projectId - Project ID
 * @returns true if user is Level 0 (Admin/Creator), Level 1 (Teacher), or Level 2 (Observer)
 *
 * @example
 * // Check if user can view other users' wallets
 * if (await checkIsTeacherOrAbove(c.env.DB, user.userEmail, projectId)) {
 *   // User is teacher or above, can view any wallet
 * }
 */
export async function checkIsTeacherOrAbove(
  db: D1Database,
  userEmail: string,
  projectId: string
): Promise<boolean> {
  try {
    // Get user ID
    const userResult = await db.prepare('SELECT userId FROM users WHERE userEmail = ?').bind(userEmail).first();
    if (!userResult) return false;
    const userId = userResult.userId as string;

    // Level 0: Check if system admin
    const isAdmin = await hasGlobalPermission(db, userId, GLOBAL_PERMISSIONS.SYSTEM_ADMIN);
    if (isAdmin) return true;

    // Level 0: Check if project creator
    const project = await db.prepare(`
      SELECT createdBy FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (project && project.createdBy === userId) return true;

    // Level 1-2: Check projectViewers (teacher or observer roles)
    const viewerResult = await db.prepare(`
      SELECT role FROM projectviewers
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).first();

    if (viewerResult) {
      const role = viewerResult.role as string;
      // Both teachers (Level 1) and observers (Level 2) qualify
      if (role === 'teacher' || role === 'observer') {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Check teacher or above error:', error);
    return false;
  }
}
