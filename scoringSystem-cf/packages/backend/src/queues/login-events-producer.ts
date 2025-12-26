/**
 * @fileoverview Login events queue producer
 * Sends login events to the queue for security analysis
 */

import type { Env } from '../types';

/**
 * Login event data structure
 */
export interface LoginEvent {
  eventType: 'login_success' | 'login_failed';
  userEmail: string;
  userId?: string;
  ipAddress: string;
  country: string;
  city: string | null;
  timezone: string;
  userAgent: string;
  requestPath: string;
  timestamp: number;
  reason?: string; // For failed logins: 'invalid_password', 'user_not_found', etc.
}

/**
 * Queue a login event for security analysis
 *
 * @param env - Cloudflare environment bindings
 * @param event - Login event data
 *
 * @example
 * await queueLoginEvent(env, {
 *   eventType: 'login_success',
 *   userEmail: 'user@example.com',
 *   userId: 'usr_123',
 *   ipAddress: '1.2.3.4',
 *   country: 'US',
 *   city: 'New York',
 *   timezone: 'America/New_York',
 *   userAgent: 'Mozilla/5.0...',
 *   requestPath: '/api/auth/login-verify-2fa',
 *   timestamp: Date.now()
 * });
 */
export async function queueLoginEvent(
  env: Env,
  event: LoginEvent
): Promise<void> {
  try {
    console.log(`[LOGIN_EVENTS] Queuing ${event.eventType} for ${event.userEmail}`);

    await env.LOGIN_EVENTS.send(event);

    console.log(`[LOGIN_EVENTS] Successfully queued ${event.eventType} for ${event.userEmail}`);
  } catch (error) {
    console.error('[LOGIN_EVENTS] Failed to queue login event:', error);
    console.error('[LOGIN_EVENTS] Event data:', JSON.stringify(event, null, 2));
    // Don't throw - queue failure shouldn't block login flow
  }
}
