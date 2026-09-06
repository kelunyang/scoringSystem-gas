/**
 * @fileoverview Rate limiting middleware for email and AI operations.
 *
 * Backed by the D1 store in utils/rate-limiter, not KV. The previous KV
 * implementation could not have been correct even once wired up: KV allows
 * about one write per second to a given key and reads are eventually
 * consistent, so a counter shared by 40 simultaneous logins undercounts.
 *
 * Per-recipient and per-IP limits for *unauthenticated* mail triggers live in
 * utils/email-budget (`guardEmailTrigger`); this file covers limits keyed on
 * an authenticated actor.
 */

import type { Context, Next } from 'hono';
import type { Env, AuthUser } from '../types';
import { errorResponse, type JsonResponse } from '../utils/response';
import { getTypedConfig } from '../utils/config';
import {
  consumeRateLimit,
  peekWindow,
  resetRateLimitIdentity,
  type RateLimitDecision,
  type WindowRule
} from '../utils/rate-limiter';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Limits keyed on the authenticated account that triggered the mail. */
const EMAIL_ACTOR_SCOPE = 'email_actor';

/** Limits on AI API calls. */
const AI_SCOPE = 'ai';

/** Effectively unlimited, so local development never hits a wall. */
const DEV_LIMIT = 999999;

/** Default AI rate limit: 10 requests per minute */
const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 10;

/** Default AI rate limit: 60 requests per hour */
const DEFAULT_AI_RATE_LIMIT_PER_HOUR = 60;

/**
 * 429 的 body 形狀。比一般的 errorResponse 多帶 rule／retryAfter／resetTime，
 * 前端要靠它們顯示「還要等多久」。
 */
export interface RateLimitErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    rule?: string;
    retryAfter: number;
    resetTime?: number;
  };
}

/**
 * Build the 429 for a rejected decision.
 *
 * @param decision - The rejecting decision from the limiter
 * @param code - Error code the frontend switches on
 * @param message - Human-readable, user-facing (Traditional Chinese)
 * @returns A 429 Response carrying standard rate limit headers
 */
export function rateLimitResponse(
  decision: RateLimitDecision,
  code: string,
  message: string
): JsonResponse<RateLimitErrorBody> {
  const retryAfterSeconds = Math.max(1, Math.ceil((decision.retryAfterMs ?? 0) / 1000));

  return new Response(
    JSON.stringify({
      success: false as const,
      error: {
        code,
        message,
        rule: decision.rule,
        retryAfter: retryAfterSeconds,
        resetTime: decision.resetAt
      }
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(decision.limit ?? 0),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(decision.resetAt ?? Date.now())
      }
    }
  ) as JsonResponse<RateLimitErrorBody>;
}

/**
 * The hourly rule for one authenticated actor.
 *
 * @param env - Worker bindings
 * @param actorEmail - Account being charged
 * @returns The rule, or null when limiting is disabled (config value 0)
 */
async function getActorEmailRule(env: Env, actorEmail: string): Promise<WindowRule | null> {
  const limit = env.ENVIRONMENT === 'development'
    ? DEV_LIMIT
    : (await getTypedConfig(env, 'MAX_EMAILS_PER_HOUR')) as number;

  if (limit === 0) return null;

  return {
    name: 'actor_hour',
    identity: `actor:${actorEmail.trim().toLowerCase()}`,
    limit,
    windowMs: HOUR_MS
  };
}

/**
 * Check and consume an authenticated actor's hourly email quota.
 *
 * Called directly from routes rather than wrapped as middleware, because each
 * route knows its own cost: one mail for an invitation, `logIds.length` for a
 * batch resend, the configured cap for a filter-driven send.
 *
 * @param env - Worker bindings
 * @param actorEmail - Account triggering the mail
 * @param cost - Number of mails this operation will send
 * @returns Decision; nothing is consumed when it rejects
 *
 * @example
 * const decision = await guardActorEmailQuota(c.env, user.userEmail, ids.length);
 * if (!decision.allowed) return rateLimitResponse(decision, 'RATE_LIMIT_EXCEEDED', '...');
 */
export async function guardActorEmailQuota(
  env: Env,
  actorEmail: string,
  cost: number = 1
): Promise<RateLimitDecision> {
  const rule = await getActorEmailRule(env, actorEmail);
  if (!rule) return { allowed: true };

  return await consumeRateLimit(env, {
    scope: EMAIL_ACTOR_SCOPE,
    windows: [rule],
    cost
  });
}

/**
 * Reset an actor's email rate limit (admin action).
 *
 * @returns True when the buckets were cleared
 */
export async function resetRateLimit(env: Env, userEmail: string): Promise<boolean> {
  try {
    await resetRateLimitIdentity(env, EMAIL_ACTOR_SCOPE, `actor:${userEmail.trim().toLowerCase()}`);
    return true;
  } catch (error) {
    console.error('[RateLimit] Error resetting rate limit:', error);
    return false;
  }
}

/**
 * Read an actor's current email rate limit usage.
 *
 * @returns Usage, or null if it could not be read
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
    const rule = await getActorEmailRule(env, userEmail);
    if (!rule) {
      // Limiting disabled: report unlimited headroom rather than "0 used of 0".
      return { count: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER, resetTime: Date.now() + HOUR_MS };
    }

    const status = await peekWindow(env, EMAIL_ACTOR_SCOPE, rule);
    return {
      count: status.used,
      limit: status.limit,
      remaining: status.remaining,
      resetTime: status.resetAt
    };
  } catch (error) {
    console.error('[RateLimit] Error getting rate limit status:', error);
    return null;
  }
}

// ============================================
// AI API Rate Limiting
// ============================================

/**
 * The minute and hour rules for one actor's AI usage.
 *
 * @returns Both rules; an empty array means limiting is disabled
 */
async function getAIRules(env: Env, actorEmail: string): Promise<WindowRule[]> {
  const isDev = env.ENVIRONMENT === 'development';

  const maxPerMinute = isDev
    ? DEV_LIMIT
    : ((await getTypedConfig(env, 'AI_RATE_LIMIT_PER_MINUTE')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_MINUTE);
  const maxPerHour = isDev
    ? DEV_LIMIT
    : ((await getTypedConfig(env, 'AI_RATE_LIMIT_PER_HOUR')) as number ?? DEFAULT_AI_RATE_LIMIT_PER_HOUR);

  const identity = `actor:${actorEmail.trim().toLowerCase()}`;
  const rules: WindowRule[] = [];

  if (maxPerMinute > 0) {
    rules.push({ name: 'ai_minute', identity, limit: maxPerMinute, windowMs: MINUTE_MS });
  }
  if (maxPerHour > 0) {
    rules.push({ name: 'ai_hour', identity, limit: maxPerHour, windowMs: HOUR_MS });
  }
  return rules;
}

/**
 * AI rate limiting middleware.
 *
 * @example
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

    const rules = await getAIRules(c.env, user.userEmail);
    if (rules.length === 0) return next();

    const decision = await consumeRateLimit(c.env, { scope: AI_SCOPE, windows: rules });

    if (!decision.allowed) {
      const per = decision.rule === 'ai_minute' ? '分鐘' : '小時';
      return rateLimitResponse(
        decision,
        'AI_RATE_LIMIT_EXCEEDED',
        `AI 呼叫已達每${per}上限（${decision.limit} 次），請稍後再試`
      );
    }

    c.header('X-RateLimit-Limit', String(decision.limit ?? 0));
    c.header('X-RateLimit-Remaining', String(Math.max(0, decision.remaining ?? 0)));
    c.header('X-RateLimit-Reset', String(decision.resetAt ?? Date.now()));

    return next();
  } catch (error) {
    console.error('[RateLimit] AI middleware error, allowing request:', error);
    return next();
  }
}
