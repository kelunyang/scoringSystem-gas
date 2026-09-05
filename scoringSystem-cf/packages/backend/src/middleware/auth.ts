/**
 * @fileoverview Authentication middleware for Hono
 * Verifies JWT tokens and checks user status in real-time
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, AuthUser, HonoVariables } from '../types';
import { verifyToken } from '../handlers/auth/jwt';
import { errorResponse, ERROR_CODES } from '../utils/response';
import { processSudoHeaders } from './sudo';
import { createSudoSafeDB } from '../utils/sudo-db-proxy';
import { assertAccountUsable } from '../handlers/auth/account-guard';

/**
 * How stale `users.lastActivityTime` may get before it is rewritten.
 * Only feeds "last seen" displays, so minutes of drift are harmless.
 */
const LAST_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Extract session ID from request
 * Checks body, query parameters, and headers
 */
async function getSessionId(c: Context<any>): Promise<string | null> {
  // 1. Try to get from request body (POST requests)
  try {
    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      // Clone the request to avoid consuming the original body stream
      const clonedRequest = c.req.raw.clone();
      const body = await clonedRequest.json() as Record<string, any>;
      if (body && typeof body === 'object' && 'sessionId' in body && typeof body.sessionId === 'string') {
        return body.sessionId;
      }
    }
  } catch {
    // Body parsing failed, continue to other methods
  }

  // 2. Authorization header (Bearer token) — the path the frontend uses
  //
  // Deliberately no `?sessionId=` query parameter: a session token in a URL
  // lands in Cloudflare request logs, browser history and Referer headers.
  // The WebSocket upgrade in router/websocket.ts still takes `?token=`
  // because the browser API allows no headers there.

  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 3. Custom header
  const sessionIdFromHeader = c.req.header('x-session-id');
  if (sessionIdFromHeader) {
    return sessionIdFromHeader;
  }

  return null;
}

/**
 * Authentication middleware
 * Verifies JWT token and checks user status
 *
 * @example
 * app.use('/api/*', authMiddleware);
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: HonoVariables }> = async (c, next) => {
  try {
    // 1. Get sessionId from body/query/header
    const sessionId = await getSessionId(c);

    if (!sessionId) {
      return errorResponse(ERROR_CODES.UNAUTHORIZED, 'Session ID is required');
    }

    // 2. Verify JWT token
    let payload;
    try {
      payload = await verifyToken(sessionId, c.env.JWT_SECRET);
    } catch {
      return errorResponse(ERROR_CODES.INVALID_SESSION, 'Invalid or expired session');
    }

    // 3. Check user status in database (real-time disabling)
    const user = await c.env.DB.prepare(
      'SELECT userId, userEmail, status, displayName, avatarSeed, avatarStyle, avatarOptions, lastActivityTime, lockUntil, lockReason FROM users WHERE userId = ?'
    )
      .bind(payload.userId)
      .first();

    if (!user) {
      return errorResponse(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    // Disabled *and* temporarily locked accounts lose their existing sessions.
    // Checking only at login would leave an already-issued token working for the
    // whole lock window, which defeats the point of locking.
    const refusal = await assertAccountUsable(c.env, user);
    if (refusal) {
      return errorResponse(
        refusal.code === 'USER_DISABLED' ? ERROR_CODES.USER_DISABLED : ERROR_CODES.FORBIDDEN,
        refusal.message
      );
    }

    // 4. Get user's global permissions
    const { getUserGlobalPermissions } = await import('../utils/permissions');
    const permissions = await getUserGlobalPermissions(c.env.DB, payload.userId);

    // 5. Check if token needs refresh (sliding expiration)
    // If token is more than halfway through its lifetime, issue a new one
    const now = Date.now();
    const tokenAge = now - (payload.iat * 1000);
    const tokenLifetime = (payload.exp * 1000) - (payload.iat * 1000);
    const shouldRefresh = tokenAge > (tokenLifetime / 2);

    let newToken: string | null = null;
    if (shouldRefresh) {
      // Generate new token with fresh expiration
      const { generateToken } = await import('../handlers/auth/jwt');
      const { getConfigValue } = await import('../utils/config');
      const sessionTimeout = await getConfigValue(c.env, 'SESSION_TIMEOUT');
      newToken = await generateToken(
        payload.userId,
        payload.userEmail,
        c.env.JWT_SECRET,
        parseInt(sessionTimeout)
      );
    }

    // 6. Update lastActivityTime (session extension), throttled.
    //
    // This used to write to D1 on *every* authenticated request. The column is
    // only read to show "last seen", so per-request precision buys nothing while
    // costing a D1 write per request — the whole class hitting the app at once
    // turned that into the busiest write in the system.
    const lastActivity = (user.lastActivityTime as number) || 0;
    if (now - lastActivity > LAST_ACTIVITY_THROTTLE_MS) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
          .bind(now, payload.userId)
          .run()
      );
    }

    // 7. Set user in context for handlers to use
    c.set('user', {
      userId: user.userId as string,
      userEmail: user.userEmail as string,
      displayName: user.displayName as string,
      status: user.status as string,
      avatarSeed: user.avatarSeed as string | undefined,
      avatarStyle: user.avatarStyle as string | undefined,
      avatarOptions: user.avatarOptions as string | undefined,
      permissions: permissions
    });

    // 8. Store new token in context for response interceptor
    if (newToken) {
      c.set('newToken', newToken);
    }

    // 9. Process sudo headers if present
    const sudoResult = await processSudoHeaders(c);
    if (sudoResult) {
      return sudoResult;
    }

    // 10. If in sudo mode, block write operations immediately
    if (c.get('sudoMode')) {
      const method = c.req.method.toUpperCase();
      const path = c.req.path;

      // Whitelist of POST endpoints that are actually read operations
      // These use POST to send query parameters in body, but don't modify data
      const safePostPaths = [
        // Auth
        '/api/auth/current-user',
        '/api/auth/validate',
        // Notifications
        '/api/notifications/count',
        '/api/notifications/list',
        // Rankings (read-only queries)
        '/api/rankings/proposals',
        '/api/rankings/stage-rankings',
        '/api/rankings/all-stages-rankings',
        '/api/rankings/teacher-vote-history',
        '/api/rankings/voting-status',
        '/api/rankings/teacher-rankings',
        '/api/rankings/teacher-ranking-versions',
        '/api/rankings/ai-providers',
        '/api/rankings/list',
        // Projects
        '/api/projects/core',
        '/api/projects/content',
        // Stages
        '/api/stages/list',
        '/api/stages/get',
        // Settlement (read-only queries)
        '/api/settlement/stage-rankings',
        '/api/settlement/comment-rankings',
        // Scoring (read-only queries)
        '/api/scoring/submission-voting-data',
        '/api/scoring/comment-voting-data',
        // Wallets
        '/api/wallets/project-ladder',
        '/api/wallets/balance',
        '/api/wallets/transactions',
        // Groups
        '/api/groups/list',
        '/api/groups/members',
        // Submissions
        '/api/submissions/list',
        '/api/submissions/detail',
        '/api/submissions/participation-status',
        '/api/submissions/versions',
        '/api/submissions/voting-history',
        // Comments
        '/api/comments/list',
        '/api/comments/stage',
        '/api/comments/details',
        '/api/comments/all-stages',
        '/api/comments/voting-eligibility',
        '/api/comments/ranking-history',
        // Event logs
        '/api/eventlogs/project',
        '/api/eventlogs/user',
        '/api/eventlogs/resource',
      ];

      // Check if this is a write operation (not in safe list)
      // Use exact match or prefix+slash to prevent "/comments/list-evil" matching "/comments/list"
      const isSafePost = safePostPaths.some(safePath =>
        path === safePath || path.startsWith(safePath + '/')
      );

      // Block write operations in SUDO mode (PUT/DELETE/PATCH always, POST only if not safe)
      if (['PUT', 'DELETE', 'PATCH'].includes(method) ||
          (method === 'POST' && !isSafePost)) {
        return c.json({
          success: false,
          error: {
            code: 'SUDO_NO_WRITE',
            message: 'SUDO 模式為唯讀，無法進行寫入操作'
          }
        }, 403);
      }
      // Wrap DB for reads, as a safety net behind the path whitelist above.
      //
      // Replaces `c.env` with a per-request copy rather than assigning
      // `c.env.DB`. Measured on workerd (2026-09-05): `env` is a fresh object
      // per invocation — a probe endpoint that set a marker on `c.env` read it
      // back as absent on the next request, and the previous in-place version
      // did not break writes on subsequent requests. So the in-place assignment
      // was NOT leaking, contrary to what an earlier note here claimed.
      //
      // The copy is kept anyway because it costs one object spread and does not
      // depend on that runtime detail staying true. Do not "simplify" it back
      // to mutating the binding.
      (c as any).env = { ...c.env, DB: createSudoSafeDB(c.env.DB) };
    }

    // Continue to next handler
    await next();

    // 11. After handler completes, add new token to response header if available
    if (newToken && c.res) {
      c.res.headers.set('X-New-Token', newToken);
    }

    return;
  } catch (error) {
    console.error('Auth middleware error:', error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Authentication error');
  }
};

/**
 * Optional authentication middleware
 * Allows both authenticated and unauthenticated requests
 * Sets user in context if authenticated, otherwise continues
 *
 * @example
 * app.use('/api/public/*', optionalAuthMiddleware);
 */
export const optionalAuthMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: HonoVariables }> = async (c, next) => {
  try {
    const sessionId = await getSessionId(c);

    if (sessionId) {
      try {
        const payload = await verifyToken(sessionId, c.env.JWT_SECRET);

        const user = await c.env.DB.prepare(
          'SELECT userId, userEmail, status, displayName, avatarSeed, avatarStyle, avatarOptions, lastActivityTime FROM users WHERE userId = ?'
        )
          .bind(payload.userId)
          .first();

        if (user && user.status === 'active') {
          // Get user's global permissions
          const { getUserGlobalPermissions } = await import('../utils/permissions');
          const permissions = await getUserGlobalPermissions(c.env.DB, payload.userId);

          c.set('user', {
            userId: user.userId as string,
            userEmail: user.userEmail as string,
            displayName: user.displayName as string,
            status: user.status as string,
            avatarSeed: user.avatarSeed as string | undefined,
            avatarStyle: user.avatarStyle as string | undefined,
            avatarOptions: user.avatarOptions as string | undefined,
            permissions: permissions
          });

          // Update lastActivityTime, throttled the same way as authMiddleware
          const now = Date.now();
          const lastActivity = (user.lastActivityTime as number) || 0;
          if (now - lastActivity > LAST_ACTIVITY_THROTTLE_MS) {
            c.executionCtx.waitUntil(
              c.env.DB.prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
                .bind(now, payload.userId)
                .run()
            );
          }
        }
      } catch {
        // Invalid token - continue without user
      }
    }

    return await next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    return await next();
  }
};

/**
 * Get authenticated user from context
 * Helper function for handlers
 *
 * @example
 * const user = getAuthUser(c);
 * console.log('User ID:', user.userId);
 */
export function getAuthUser(c: Context<{ Bindings: Env; Variables: HonoVariables }>): AuthUser {
  const user = c.get('user');
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user as AuthUser;
}
