/**
 * @fileoverview Authentication middleware for Hono
 * Verifies JWT tokens and checks user status in real-time
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, AuthUser, HonoVariables } from '../types';
import { verifyToken } from '../handlers/auth/jwt';
import { errorResponse, ERROR_CODES, jsonResponse } from '../utils/response';

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

  // 2. Try to get from query parameters
  const sessionIdFromQuery = c.req.query('sessionId');
  if (sessionIdFromQuery) {
    return sessionIdFromQuery;
  }

  // 3. Try to get from Authorization header (Bearer token)
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 4. Try to get from custom header
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
    } catch (error) {
      return errorResponse(ERROR_CODES.INVALID_SESSION, 'Invalid or expired session');
    }

    // 3. Check user status in database (real-time disabling)
    const user = await c.env.DB.prepare(
      'SELECT userId, userEmail, status, displayName, avatarSeed, avatarStyle, avatarOptions FROM users WHERE userId = ?'
    )
      .bind(payload.userId)
      .first();

    if (!user) {
      return errorResponse(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    if (user.status === 'disabled') {
      return errorResponse(ERROR_CODES.USER_DISABLED, 'User account is disabled');
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

    // 6. Update lastActivityTime (session extension)
    // Use waitUntil to not block the response
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
        .bind(now, payload.userId)
        .run()
    );

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

    // Continue to next handler
    await next();

    // 9. After handler completes, add new token to response header if available
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
          'SELECT userId, userEmail, status, displayName, avatarSeed, avatarStyle, avatarOptions FROM users WHERE userId = ?'
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

          // Update lastActivityTime
          const now = Date.now();
          c.executionCtx.waitUntil(
            c.env.DB.prepare('UPDATE users SET lastActivityTime = ? WHERE userId = ?')
              .bind(now, payload.userId)
              .run()
          );
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
