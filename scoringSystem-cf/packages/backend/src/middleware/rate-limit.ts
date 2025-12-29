/**
 * Rate Limiting Middleware
 * Implements KV-based rate limiting for email operations and AI API calls
 */

import type { Context, Next } from 'hono';
import type { Env, AuthUser } from '../types';
import { errorResponse } from '../utils/response';
import { getTypedConfig } from '../utils/config';

/**
 * Rate limit key prefix for KV storage
 */
const RATE_LIMIT_PREFIX = 'rate_limit:email:';
const AI_RATE_LIMIT_PREFIX = 'rate_limit:ai:';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxRequestsPerHour: number;
  windowMs: number;
}

/**
 * Get rate limit info from KV
 */
async function getRateLimitInfo(
  env: Env,
  key: string
): Promise<{ count: number; resetTime: number } | null> {
  if (!env.CONFIG) {
    return null;
  }

  const data = await env.CONFIG.get(key, 'json');
  return data as { count: number; resetTime: number } | null;
}

/**
 * Update rate limit counter in KV
 */
async function updateRateLimitCounter(
  env: Env,
  key: string,
  count: number,
  resetTime: number
): Promise<void> {
  if (!env.CONFIG) {
    return;
  }

  const ttl = Math.ceil((resetTime - Date.now()) / 1000);
  if (ttl > 0) {
    // Cloudflare KV requires minimum 60 second TTL
    const effectiveTtl = Math.max(ttl, 60);
    await env.CONFIG.put(
      key,
      JSON.stringify({ count, resetTime }),
      { expirationTtl: effectiveTtl }
    );
  }
}

/**
 * Email rate limiting middleware
 * Limits email sending operations based on configured hourly limit
 *
 * Usage:
 * app.post('/send-email', emailRateLimitMiddleware, async (c) => { ... })
 */
export async function emailRateLimitMiddleware(
  c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>,
  next: Next
): Promise<Response | void> {
  try {
    const user = c.get('user');
    if (!user || !user.userEmail) {
      return errorResponse('UNAUTHORIZED', 'User not authenticated');
    }

    // Get configured rate limit (skip in development)
    const maxEmailsPerHour = c.env.ENVIRONMENT === 'development'
      ? 999999
      : (await getTypedConfig(c.env, 'MAX_EMAILS_PER_HOUR')) as number;

    // Skip rate limiting if disabled (value set to 0)
    if (maxEmailsPerHour === 0) {
      return next();
    }

    // Create rate limit key (per user)
    const rateLimitKey = `${RATE_LIMIT_PREFIX}${user.userEmail}`;

    // Get current rate limit info
    const now = Date.now();
    let rateLimitInfo = await getRateLimitInfo(c.env, rateLimitKey);

    // Initialize or reset if window expired
    if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
      const resetTime = now + 3600000; // 1 hour from now
      rateLimitInfo = {
        count: 0,
        resetTime
      };
    }

    // Check if limit exceeded
    if (rateLimitInfo.count >= maxEmailsPerHour) {
      const retryAfterSeconds = Math.ceil((rateLimitInfo.resetTime - now) / 1000);

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Email rate limit exceeded. Maximum ${maxEmailsPerHour} emails per hour allowed.`,
            retryAfter: retryAfterSeconds,
            resetTime: rateLimitInfo.resetTime
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(maxEmailsPerHour),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitInfo.resetTime)
          }
        }
      );
    }

    // Increment counter
    rateLimitInfo.count += 1;
    await updateRateLimitCounter(
      c.env,
      rateLimitKey,
      rateLimitInfo.count,
      rateLimitInfo.resetTime
    );

    // Add rate limit headers to response
    c.header('X-RateLimit-Limit', String(maxEmailsPerHour));
    c.header('X-RateLimit-Remaining', String(maxEmailsPerHour - rateLimitInfo.count));
    c.header('X-RateLimit-Reset', String(rateLimitInfo.resetTime));

    return next();

  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // On error, allow the request (fail open)
    return next();
  }
}

/**
 * Batch email rate limiting middleware
 * Checks if the batch size would exceed hourly limit
 */
export async function batchEmailRateLimitMiddleware(
  c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>,
  next: Next
): Promise<Response | void> {
  try {
    const user = c.get('user');
    if (!user || !user.userEmail) {
      return errorResponse('UNAUTHORIZED', 'User not authenticated');
    }

    // Get request body to determine batch size
    const body = await c.req.json();
    let batchSize = 0;

    // Determine batch size based on request structure
    if (body.notificationIds && Array.isArray(body.notificationIds)) {
      batchSize = body.notificationIds.length;
    } else if (body.userEmails && Array.isArray(body.userEmails)) {
      batchSize = body.userEmails.length;
    } else {
      // For filter-based batch sends, we can't determine size beforehand
      // Let it proceed and count after sending
      return next();
    }

    // Get configured rate limit (skip in development)
    const maxEmailsPerHour = c.env.ENVIRONMENT === 'development'
      ? 999999
      : (await getTypedConfig(c.env, 'MAX_EMAILS_PER_HOUR')) as number;

    // Skip rate limiting if disabled
    if (maxEmailsPerHour === 0) {
      return next();
    }

    // Create rate limit key
    const rateLimitKey = `${RATE_LIMIT_PREFIX}${user.userEmail}`;

    // Get current rate limit info
    const now = Date.now();
    let rateLimitInfo = await getRateLimitInfo(c.env, rateLimitKey);

    // Initialize or reset if window expired
    if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
      const resetTime = now + 3600000; // 1 hour from now
      rateLimitInfo = {
        count: 0,
        resetTime
      };
    }

    // Check if batch would exceed limit
    const remainingQuota = maxEmailsPerHour - rateLimitInfo.count;
    if (batchSize > remainingQuota) {
      const retryAfterSeconds = Math.ceil((rateLimitInfo.resetTime - now) / 1000);

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Batch size (${batchSize}) exceeds remaining hourly quota (${remainingQuota}/${maxEmailsPerHour})`,
            retryAfter: retryAfterSeconds,
            resetTime: rateLimitInfo.resetTime,
            remainingQuota
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(maxEmailsPerHour),
            'X-RateLimit-Remaining': String(remainingQuota),
            'X-RateLimit-Reset': String(rateLimitInfo.resetTime)
          }
        }
      );
    }

    // Increment counter by batch size
    rateLimitInfo.count += batchSize;
    await updateRateLimitCounter(
      c.env,
      rateLimitKey,
      rateLimitInfo.count,
      rateLimitInfo.resetTime
    );

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(maxEmailsPerHour));
    c.header('X-RateLimit-Remaining', String(maxEmailsPerHour - rateLimitInfo.count));
    c.header('X-RateLimit-Reset', String(rateLimitInfo.resetTime));

    return next();

  } catch (error) {
    console.error('Batch rate limit middleware error:', error);
    // On error, allow the request (fail open)
    return next();
  }
}

/**
 * Reset rate limit for a user (admin function)
 */
export async function resetRateLimit(
  env: Env,
  userEmail: string
): Promise<boolean> {
  try {
    if (!env.CONFIG) {
      return false;
    }

    const rateLimitKey = `${RATE_LIMIT_PREFIX}${userEmail}`;
    await env.CONFIG.delete(rateLimitKey);
    return true;
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return false;
  }
}

/**
 * Get current rate limit status for a user
 */
export async function getRateLimitStatus(
  env: Env,
  userEmail: string
): Promise<{
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
} | null> {
  try {
    const maxEmailsPerHour = env.ENVIRONMENT === 'development'
      ? 999999
      : (await getTypedConfig(env, 'MAX_EMAILS_PER_HOUR')) as number;

    const rateLimitKey = `${RATE_LIMIT_PREFIX}${userEmail}`;
    const rateLimitInfo = await getRateLimitInfo(env, rateLimitKey);

    const now = Date.now();

    if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
      return {
        count: 0,
        limit: maxEmailsPerHour,
        remaining: maxEmailsPerHour,
        resetTime: now + 3600000
      };
    }

    return {
      count: rateLimitInfo.count,
      limit: maxEmailsPerHour,
      remaining: Math.max(0, maxEmailsPerHour - rateLimitInfo.count),
      resetTime: rateLimitInfo.resetTime
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return null;
  }
}

// ============================================
// AI API Rate Limiting
// ============================================

/** Default AI rate limit: 10 requests per minute */
const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 10;

/** Default AI rate limit: 60 requests per hour */
const DEFAULT_AI_RATE_LIMIT_PER_HOUR = 60;

/**
 * AI rate limiting middleware
 * Limits AI API calls based on minute and hourly limits
 *
 * Usage:
 * app.post('/ai-suggestion', aiRateLimitMiddleware, async (c) => { ... })
 */
export async function aiRateLimitMiddleware(
  c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>,
  next: Next
): Promise<Response | void> {
  try {
    const user = c.get('user');
    if (!user || !user.userEmail) {
      return errorResponse('UNAUTHORIZED', 'User not authenticated');
    }

    // Get configured rate limits (skip in development)
    const maxPerMinute = c.env.ENVIRONMENT === 'development'
      ? 999999
      : ((await getTypedConfig(c.env, 'AI_RATE_LIMIT_PER_MINUTE')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_MINUTE);

    const maxPerHour = c.env.ENVIRONMENT === 'development'
      ? 999999
      : ((await getTypedConfig(c.env, 'AI_RATE_LIMIT_PER_HOUR')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_HOUR);

    // Skip rate limiting if disabled (value set to 0)
    if (maxPerMinute === 0 && maxPerHour === 0) {
      return next();
    }

    const now = Date.now();
    const userEmail = user.userEmail;

    // Check minute limit
    const minuteKey = `${AI_RATE_LIMIT_PREFIX}minute:${userEmail}`;
    let minuteInfo = await getRateLimitInfo(c.env, minuteKey);

    if (!minuteInfo || minuteInfo.resetTime <= now) {
      minuteInfo = { count: 0, resetTime: now + 60000 }; // 1 minute window
    }

    if (minuteInfo.count >= maxPerMinute) {
      const retryAfterSeconds = Math.ceil((minuteInfo.resetTime - now) / 1000);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'AI_RATE_LIMIT_EXCEEDED',
            message: `AI API rate limit exceeded. Maximum ${maxPerMinute} requests per minute allowed.`,
            retryAfter: retryAfterSeconds,
            resetTime: minuteInfo.resetTime
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit-Minute': String(maxPerMinute),
            'X-RateLimit-Remaining-Minute': '0'
          }
        }
      );
    }

    // Check hour limit
    const hourKey = `${AI_RATE_LIMIT_PREFIX}hour:${userEmail}`;
    let hourInfo = await getRateLimitInfo(c.env, hourKey);

    if (!hourInfo || hourInfo.resetTime <= now) {
      hourInfo = { count: 0, resetTime: now + 3600000 }; // 1 hour window
    }

    if (hourInfo.count >= maxPerHour) {
      const retryAfterSeconds = Math.ceil((hourInfo.resetTime - now) / 1000);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'AI_RATE_LIMIT_EXCEEDED',
            message: `AI API rate limit exceeded. Maximum ${maxPerHour} requests per hour allowed.`,
            retryAfter: retryAfterSeconds,
            resetTime: hourInfo.resetTime
          }
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit-Hour': String(maxPerHour),
            'X-RateLimit-Remaining-Hour': '0'
          }
        }
      );
    }

    // Increment both counters
    minuteInfo.count += 1;
    hourInfo.count += 1;

    await Promise.all([
      updateRateLimitCounter(c.env, minuteKey, minuteInfo.count, minuteInfo.resetTime),
      updateRateLimitCounter(c.env, hourKey, hourInfo.count, hourInfo.resetTime)
    ]);

    // Add rate limit headers
    c.header('X-RateLimit-Limit-Minute', String(maxPerMinute));
    c.header('X-RateLimit-Remaining-Minute', String(maxPerMinute - minuteInfo.count));
    c.header('X-RateLimit-Limit-Hour', String(maxPerHour));
    c.header('X-RateLimit-Remaining-Hour', String(maxPerHour - hourInfo.count));

    return next();

  } catch (error) {
    console.error('AI rate limit middleware error:', error);
    // On error, allow the request (fail open)
    return next();
  }
}

/**
 * Get current AI rate limit status for a user
 */
export async function getAIRateLimitStatus(
  env: Env,
  userEmail: string
): Promise<{
  minute: { count: number; limit: number; remaining: number; resetTime: number };
  hour: { count: number; limit: number; remaining: number; resetTime: number };
} | null> {
  try {
    const maxPerMinute = env.ENVIRONMENT === 'development'
      ? 999999
      : ((await getTypedConfig(env, 'AI_RATE_LIMIT_PER_MINUTE')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_MINUTE);

    const maxPerHour = env.ENVIRONMENT === 'development'
      ? 999999
      : ((await getTypedConfig(env, 'AI_RATE_LIMIT_PER_HOUR')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_HOUR);

    const now = Date.now();

    // Get minute info
    const minuteKey = `${AI_RATE_LIMIT_PREFIX}minute:${userEmail}`;
    const minuteInfo = await getRateLimitInfo(env, minuteKey);

    // Get hour info
    const hourKey = `${AI_RATE_LIMIT_PREFIX}hour:${userEmail}`;
    const hourInfo = await getRateLimitInfo(env, hourKey);

    return {
      minute: {
        count: minuteInfo && minuteInfo.resetTime > now ? minuteInfo.count : 0,
        limit: maxPerMinute,
        remaining: minuteInfo && minuteInfo.resetTime > now
          ? Math.max(0, maxPerMinute - minuteInfo.count)
          : maxPerMinute,
        resetTime: minuteInfo && minuteInfo.resetTime > now
          ? minuteInfo.resetTime
          : now + 60000
      },
      hour: {
        count: hourInfo && hourInfo.resetTime > now ? hourInfo.count : 0,
        limit: maxPerHour,
        remaining: hourInfo && hourInfo.resetTime > now
          ? Math.max(0, maxPerHour - hourInfo.count)
          : maxPerHour,
        resetTime: hourInfo && hourInfo.resetTime > now
          ? hourInfo.resetTime
          : now + 3600000
      }
    };
  } catch (error) {
    console.error('Error getting AI rate limit status:', error);
    return null;
  }
}
