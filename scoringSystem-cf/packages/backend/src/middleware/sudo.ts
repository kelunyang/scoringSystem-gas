/**
 * @fileoverview Sudo middleware for Observer/Teacher impersonation
 *
 * Allows Observer (Level 2) and Teacher (Level 1) to impersonate
 * students (Level 3-5) for read-only viewing purposes.
 *
 * Security:
 * - Only allows read operations (whitelist approach)
 * - Sudo is limited to a specific project
 * - All sudo activities are logged for audit
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, HonoVariables, SudoTargetUser } from '../types';
import { errorResponse, ERROR_CODES } from '../utils/response';

// Note: Write operations are blocked by the D1 Proxy wrapper in sudo-db-proxy.ts
// This middleware only handles permission validation and context setup

/**
 * Core sudo processing logic
 * Called from auth middleware after authentication
 *
 * @returns null if no sudo or successful, Response if error
 */
export async function processSudoHeaders(c: Context<{ Bindings: Env; Variables: HonoVariables }>): Promise<Response | null> {
  // Get sudo headers
  const sudoAsEmail = c.req.header('X-Sudo-As');
  const sudoProjectId = c.req.header('X-Sudo-Project');

  // If no sudo headers, continue normally
  if (!sudoAsEmail || !sudoProjectId) {
    return null;
  }

  // Get the actual user (must be authenticated)
  const actualUser = c.get('user');
  if (!actualUser) {
    return errorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required for sudo');
  }

  try {
    // 1. Verify the actual user has permission to sudo in this project
    // Must be Teacher (Level 1) or Observer (Level 2)
    const viewerRole = await c.env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `)
      .bind(sudoProjectId, actualUser.userEmail)
      .first();

    // Also check if user is project creator (has admin rights)
    const projectCreator = await c.env.DB.prepare(`
      SELECT createdBy FROM projects WHERE projectId = ?
    `)
      .bind(sudoProjectId)
      .first();

    const isProjectCreator = projectCreator?.createdBy === actualUser.userId;
    const isGlobalAdmin = actualUser.permissions?.includes('system_admin');
    const isTeacher = viewerRole?.role === 'teacher';
    const isObserver = viewerRole?.role === 'observer';

    // Allow sudo for: global admin, project creator, teacher, or observer
    if (!isGlobalAdmin && !isProjectCreator && !isTeacher && !isObserver) {
      return errorResponse(ERROR_CODES.FORBIDDEN, 'Sudo permission denied: must be admin, teacher, or observer');
    }

    // 2. Verify the target user exists and is a student in this project (Level 3-5)
    const targetUser = await c.env.DB.prepare(`
      SELECT u.userId, u.userEmail, u.displayName, u.avatarSeed, u.avatarStyle
      FROM users u
      WHERE u.userEmail = ? AND u.status = 'active'
    `)
      .bind(sudoAsEmail)
      .first();

    if (!targetUser) {
      return errorResponse(ERROR_CODES.NOT_FOUND, 'Target user not found or inactive');
    }

    // Check that target user is a student in this project (member of usergroups)
    const targetGroupMembership = await c.env.DB.prepare(`
      SELECT ug.role, ug.groupId
      FROM usergroups ug
      JOIN groups g ON ug.groupId = g.groupId
      WHERE g.projectId = ? AND ug.userEmail = ? AND ug.isActive = 1
    `)
      .bind(sudoProjectId, sudoAsEmail)
      .first();

    // Also check if target is just a "member" in projectviewers (Level 5)
    const targetViewerRole = await c.env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `)
      .bind(sudoProjectId, sudoAsEmail)
      .first();

    // Target must be Level 3-5 (group leader, group member, or unassigned member)
    const isTargetStudent = targetGroupMembership ||
                           (targetViewerRole?.role === 'member');

    if (!isTargetStudent) {
      return errorResponse(ERROR_CODES.FORBIDDEN, 'Cannot sudo as this user: must be a student in the project');
    }

    // Note: Write operations are automatically blocked by D1 Proxy wrapper
    // No need to check path whitelist here

    // 3. Set sudo context
    c.set('sudoMode', true);
    c.set('actualUser', actualUser);
    c.set('sudoProjectId', sudoProjectId);
    c.set('sudoAs', {
      userId: targetUser.userId as string,
      userEmail: targetUser.userEmail as string,
      displayName: targetUser.displayName as string,
      avatarSeed: targetUser.avatarSeed as string | undefined,
      avatarStyle: targetUser.avatarStyle as string | undefined,
    } as SudoTargetUser);

    // 4. Log sudo activity (non-blocking)
    // IMPORTANT: Capture original DB before it gets wrapped with sudo-safe proxy
    // The waitUntil function runs after the response, by which time c.env.DB is wrapped
    const originalDB = c.env.DB;
    c.executionCtx.waitUntil(
      (async () => {
        const { logGlobalOperation } = await import('../utils/logging');
        await logGlobalOperation(
          { ...c.env, DB: originalDB },  // Use original DB for audit logging
          actualUser.userEmail,
          'sudo_access',
          'user',
          targetUser.userId as string,
          {
            sudoAs: sudoAsEmail,
            projectId: sudoProjectId,
            accessedPath: c.req.path,
            method: c.req.method
          },
          'info'
        );
      })()
    );

    // Success - continue normally
    return null;

  } catch (error) {
    console.error('Sudo processing error:', error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Sudo processing error');
  }
}

/**
 * Sudo middleware (standalone version)
 * Processes X-Sudo-As and X-Sudo-Project headers
 *
 * Must be used AFTER auth middleware
 */
export const sudoMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: HonoVariables }> = async (c, next) => {
  const result = await processSudoHeaders(c);
  if (result) {
    return result;
  }
  return await next();
};

/**
 * Helper to get the effective user in handlers
 * In sudo mode, returns the impersonated user's info
 * Otherwise returns the actual authenticated user
 */
export function getEffectiveUser(c: Context<{ Bindings: Env; Variables: HonoVariables }>): {
  userId: string;
  userEmail: string;
  displayName: string;
  isSudo: boolean;
  actualUser?: { userId: string; userEmail: string; displayName: string };
} {
  const sudoMode = c.get('sudoMode');
  const sudoAs = c.get('sudoAs');
  const actualUser = c.get('actualUser') || c.get('user');

  if (sudoMode && sudoAs) {
    return {
      userId: sudoAs.userId,
      userEmail: sudoAs.userEmail,
      displayName: sudoAs.displayName,
      isSudo: true,
      actualUser: actualUser ? {
        userId: actualUser.userId,
        userEmail: actualUser.userEmail,
        displayName: actualUser.displayName
      } : undefined
    };
  }

  const user = c.get('user');
  return {
    userId: user.userId,
    userEmail: user.userEmail,
    displayName: user.displayName,
    isSudo: false
  };
}

/**
 * Check if current request is in sudo mode
 */
export function isSudoMode(c: Context<{ Bindings: Env; Variables: HonoVariables }>): boolean {
  return c.get('sudoMode') === true;
}

/**
 * Get the sudo project ID (if in sudo mode)
 */
export function getSudoProjectId(c: Context<{ Bindings: Env; Variables: HonoVariables }>): string | undefined {
  return c.get('sudoProjectId');
}
