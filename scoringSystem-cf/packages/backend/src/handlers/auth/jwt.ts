/**
 * @fileoverview JWT token generation and verification
 * Uses jose library for JWT operations
 */

import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

/**
 * JWT payload structure for our sessions
 */
export interface SessionPayload extends JWTPayload {
  userId: string;
  userEmail: string;
  iat: number;  // Issued at
  exp: number;  // Expiry time
}

/**
 * Generate a JWT token for authenticated user
 *
 * @param userId - User ID
 * @param userEmail - User email
 * @param secret - JWT secret from environment
 * @param expiresIn - Token lifetime in milliseconds (default: 24 hours)
 * @returns Promise<string> - JWT token
 *
 * @example
 * const token = await generateToken('usr_123', 'john@example.com', env.JWT_SECRET);
 */
export async function generateToken(
  userId: string,
  userEmail: string,
  secret: string,
  expiresIn: number = 86400000 // 24 hours in milliseconds
): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);

  const now = Date.now();
  const exp = Math.floor((now + expiresIn) / 1000); // Convert to seconds for JWT

  const token = await new SignJWT({
    userId,
    userEmail
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(exp)
    .sign(secretKey);

  return token;
}

/**
 * Verify and decode a JWT token
 *
 * @param token - JWT token string
 * @param secret - JWT secret from environment
 * @returns Promise<SessionPayload> - Decoded payload
 * @throws Error if token is invalid or expired
 *
 * @example
 * try {
 *   const payload = await verifyToken(token, env.JWT_SECRET);
 *   console.log('User ID:', payload.userId);
 * } catch (error) {
 *   console.error('Invalid token:', error);
 * }
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<SessionPayload> {
  try {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);

    const { payload } = await jwtVerify(token, secretKey);

    return payload as SessionPayload;
  } catch (error) {
    // Token verification failed (expired, invalid signature, etc.)
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Token verification failed: ${message}`);
  }
}

/**
 * Refresh a JWT token (extend expiration)
 * Creates a new token with the same payload but updated expiry
 *
 * @param token - Current JWT token
 * @param secret - JWT secret from environment
 * @param expiresIn - New token lifetime in milliseconds
 * @returns Promise<string> - New JWT token
 * @throws Error if current token is invalid
 *
 * @example
 * const newToken = await refreshToken(oldToken, env.JWT_SECRET, 86400000);
 */
export async function refreshToken(
  token: string,
  secret: string,
  expiresIn: number = 86400000
): Promise<string> {
  // Verify current token
  const payload = await verifyToken(token, secret);

  // Generate new token with same user data
  return generateToken(
    payload.userId,
    payload.userEmail,
    secret,
    expiresIn
  );
}

/**
 * Extract user ID from token without full verification
 * Useful for logging or debugging, NOT for authorization
 *
 * @param token - JWT token
 * @returns userId or null if token is malformed
 *
 * @example
 * const userId = extractUserId(token);
 * // For logging only, don't use for auth decisions!
 */
export function extractUserId(token: string): string | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (base64url)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.userId || null;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired (without verifying signature)
 * Useful for client-side token refresh decisions
 *
 * @param token - JWT token
 * @returns true if token is expired
 *
 * @example
 * if (isTokenExpired(token)) {
 *   // Request new token
 * }
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = payload.exp;

    if (!exp) {
      return true;
    }

    // exp is in seconds, Date.now() is in milliseconds
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Get remaining time until token expires
 *
 * @param token - JWT token
 * @returns Remaining milliseconds, or 0 if expired/invalid
 *
 * @example
 * const remaining = getTokenRemainingTime(token);
 * console.log(`Token expires in ${remaining / 1000} seconds`);
 */
export function getTokenRemainingTime(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return 0;
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = payload.exp;

    if (!exp) {
      return 0;
    }

    const remaining = (exp * 1000) - Date.now();
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

/**
 * Create a session object from token payload
 * Used to store session data in response
 *
 * @param payload - JWT payload
 * @returns Session object
 *
 * @example
 * const session = createSessionObject(payload);
 * // Returns: { userId: 'usr_123', userEmail: 'john@example.com', ... }
 */
export function createSessionObject(payload: SessionPayload): {
  userId: string;
  userEmail: string;
  issuedAt: number;
  expiresAt: number;
} {
  return {
    userId: payload.userId,
    userEmail: payload.userEmail,
    issuedAt: payload.iat * 1000, // Convert to milliseconds
    expiresAt: payload.exp * 1000
  };
}
