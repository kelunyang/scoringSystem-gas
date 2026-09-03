/**
 * @fileoverview Generic rate limiter backed by D1.
 *
 * Why D1 and not KV: KV limits writes to the same key to roughly one per
 * second and its reads are eventually consistent, so a counter shared by 40
 * simultaneous logins undercounts badly. D1 serialises writes and a
 * single-statement upsert is atomic, so the same burst is counted exactly.
 *
 * Concurrency trade-off, deliberate: limits are checked first and incremented
 * second, so N truly simultaneous requests can overshoot a limit by up to N.
 * The alternative (increment first, roll back on rejection) makes concurrent
 * requests see each other's temporary inflation and reject legitimate users.
 * In this system an extra mail or two costs nothing, while a false rejection
 * locks a student out at the start of a class — so overshoot is the safer bug.
 */

import type { Env } from '../types';

/** A fixed-window counter rule: at most `limit` hits per `windowMs`. */
export interface WindowRule {
  /** Stable id, surfaced in the 429 body and in logs, e.g. 'recipient_hour' */
  name: string;
  /** What is being limited, e.g. `email:alice@example.com` or `ip:1.2.3.4` */
  identity: string;
  limit: number;
  windowMs: number;
}

/** A minimum-interval rule: consecutive hits must be `minIntervalMs` apart. */
export interface CooldownRule {
  name: string;
  identity: string;
  minIntervalMs: number;
}

export interface RateLimitRequest {
  /** Groups rules that share a budget, e.g. 'email_trigger' */
  scope: string;
  windows?: WindowRule[];
  cooldowns?: CooldownRule[];
  /** How many units this request consumes (a batch of 30 mails costs 30) */
  cost?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** `name` of the first rule that rejected, absent when allowed */
  rule?: string;
  /** Wait at least this long before retrying */
  retryAfterMs?: number;
  limit?: number;
  remaining?: number;
  resetAt?: number;
}

/** Keeps a used window row readable for a while after it stops counting. */
const WINDOW_GRACE_MS = 5 * 60 * 1000;

/** How long an idle cooldown row is kept before the sweeper may drop it. */
const COOLDOWN_RETENTION_MS = 24 * 60 * 60 * 1000;

interface BucketRow {
  bucketKey: string;
  count: number;
  lastAt: number;
}

/** Start of the fixed window `now` falls into. */
function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function windowKey(scope: string, rule: WindowRule, now: number): string {
  return `w|${scope}|${rule.name}|${rule.identity}|${windowStart(now, rule.windowMs)}`;
}

function cooldownKey(scope: string, rule: CooldownRule): string {
  return `c|${scope}|${rule.name}|${rule.identity}`;
}

/**
 * Read every bucket a request touches in one round trip.
 * Returns an empty map (fail-open) if the table is missing or unreadable.
 */
async function readBuckets(env: Env, keys: string[]): Promise<Map<string, BucketRow>> {
  const found = new Map<string, BucketRow>();
  if (keys.length === 0) return found;

  const placeholders = keys.map(() => '?').join(', ');
  const result = await env.DB.prepare(
    `SELECT bucketKey, count, lastAt FROM rate_limit_counters WHERE bucketKey IN (${placeholders})`
  ).bind(...keys).all<BucketRow>();

  for (const row of result.results || []) {
    found.set(row.bucketKey, row);
  }
  return found;
}

/**
 * Check every rule without consuming anything.
 *
 * @param env - Worker bindings
 * @param request - Scope plus the window and cooldown rules to evaluate
 * @param now - Injectable clock, for tests
 * @returns The first rejection found, or `{ allowed: true }` with the
 *          tightest remaining headroom across all window rules
 *
 * @example
 * const decision = await checkRateLimit(env, {
 *   scope: 'email_trigger',
 *   cooldowns: [{ name: 'recipient_cooldown', identity: 'email:a@b.c', minIntervalMs: 60_000 }]
 * });
 */
export async function checkRateLimit(
  env: Env,
  request: RateLimitRequest,
  now: number = Date.now()
): Promise<RateLimitDecision> {
  const { scope, windows = [], cooldowns = [], cost = 1 } = request;

  const windowKeys = windows.map(rule => windowKey(scope, rule, now));
  const cooldownKeys = cooldowns.map(rule => cooldownKey(scope, rule));
  const buckets = await readBuckets(env, [...windowKeys, ...cooldownKeys]);

  // Cooldowns first: they carry the most actionable retry hint for a user.
  for (let i = 0; i < cooldowns.length; i++) {
    const rule = cooldowns[i];
    const row = buckets.get(cooldownKeys[i]);
    if (!row) continue;

    const elapsed = now - row.lastAt;
    if (elapsed < rule.minIntervalMs) {
      return {
        allowed: false,
        rule: rule.name,
        retryAfterMs: rule.minIntervalMs - elapsed,
        limit: 1,
        remaining: 0,
        resetAt: row.lastAt + rule.minIntervalMs
      };
    }
  }

  let tightest: RateLimitDecision = { allowed: true };
  let tightestRemaining = Number.POSITIVE_INFINITY;

  for (let i = 0; i < windows.length; i++) {
    const rule = windows[i];
    const used = buckets.get(windowKeys[i])?.count ?? 0;
    const resetAt = windowStart(now, rule.windowMs) + rule.windowMs;

    if (used + cost > rule.limit) {
      return {
        allowed: false,
        rule: rule.name,
        retryAfterMs: resetAt - now,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - used),
        resetAt
      };
    }

    const remaining = rule.limit - used - cost;
    if (remaining < tightestRemaining) {
      tightestRemaining = remaining;
      tightest = { allowed: true, rule: rule.name, limit: rule.limit, remaining, resetAt };
    }
  }

  return tightest;
}

/**
 * Consume the rules that `checkRateLimit` just approved.
 *
 * Split from the check so a caller can decide, act, and only then charge the
 * budget — the email consumer charges after a successful send, not before.
 *
 * @param env - Worker bindings
 * @param request - The same scope and rules passed to {@link checkRateLimit}
 * @param now - Injectable clock, for tests
 */
export async function commitRateLimit(
  env: Env,
  request: RateLimitRequest,
  now: number = Date.now()
): Promise<void> {
  const { scope, windows = [], cooldowns = [], cost = 1 } = request;
  const statements: D1PreparedStatement[] = [];

  const upsert = `
    INSERT INTO rate_limit_counters (bucketKey, scope, kind, identity, count, lastAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucketKey) DO UPDATE SET
      count = rate_limit_counters.count + excluded.count,
      lastAt = excluded.lastAt,
      expiresAt = excluded.expiresAt
  `;

  for (const rule of windows) {
    const resetAt = windowStart(now, rule.windowMs) + rule.windowMs;
    statements.push(
      env.DB.prepare(upsert).bind(
        windowKey(scope, rule, now), scope, 'window', rule.identity,
        cost, now, resetAt + WINDOW_GRACE_MS
      )
    );
  }

  for (const rule of cooldowns) {
    statements.push(
      env.DB.prepare(upsert).bind(
        cooldownKey(scope, rule), scope, 'cooldown', rule.identity,
        cost, now, now + COOLDOWN_RETENTION_MS
      )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}

/**
 * Check and consume in one call, for the common case.
 *
 * @returns The decision; nothing is consumed when it rejects.
 */
export async function consumeRateLimit(
  env: Env,
  request: RateLimitRequest,
  now: number = Date.now()
): Promise<RateLimitDecision> {
  const decision = await checkRateLimit(env, request, now);
  if (decision.allowed) {
    await commitRateLimit(env, request, now);
  }
  return decision;
}

/**
 * A rolling-window rule, summed from finer sub-buckets.
 *
 * Needed for the SMTP daily budget specifically: Gmail counts a *rolling* 24
 * hours, so a fixed midnight-reset window would let the system send a full
 * day's budget just before the reset and another full budget just after —
 * roughly double the quota inside one of Gmail's actual 24-hour windows.
 */
export interface RollingRule {
  name: string;
  identity: string;
  limit: number;
  /** Granularity of each sub-bucket, e.g. one hour */
  bucketMs: number;
  /** How far back to look, e.g. 24 hours */
  lookbackMs: number;
}

function rollingKeys(scope: string, rule: RollingRule, now: number): string[] {
  const newest = Math.floor(now / rule.bucketMs);
  const oldest = Math.floor((now - rule.lookbackMs) / rule.bucketMs);
  const keys: string[] = [];
  for (let bucket = oldest; bucket <= newest; bucket++) {
    keys.push(`r|${scope}|${rule.name}|${rule.identity}|${bucket * rule.bucketMs}`);
  }
  return keys;
}

/**
 * Sum a rolling window's sub-buckets.
 *
 * The oldest sub-bucket is counted whole even though only part of it falls
 * inside the lookback, so usage is slightly over-reported. That is the safe
 * direction for a hard external quota: it stops sending early rather than
 * late.
 *
 * @param env - Worker bindings
 * @param scope - Scope the rule belongs to
 * @param rule - The rolling rule to evaluate
 * @param now - Injectable clock, for tests
 * @returns Usage across the lookback window
 *
 * @example
 * const { used, limit } = await readRollingWindow(env, 'email_budget', {
 *   name: 'daily', identity: 'global', limit: 1500,
 *   bucketMs: 3_600_000, lookbackMs: 86_400_000
 * });
 */
export async function readRollingWindow(
  env: Env,
  scope: string,
  rule: RollingRule,
  now: number = Date.now()
): Promise<{ used: number; limit: number; remaining: number }> {
  const buckets = await readBuckets(env, rollingKeys(scope, rule, now));
  let used = 0;
  for (const row of buckets.values()) used += row.count;
  return { used, limit: rule.limit, remaining: Math.max(0, rule.limit - used) };
}

/**
 * Charge a rolling window, writing into the sub-bucket `now` falls into.
 *
 * @param env - Worker bindings
 * @param scope - Scope the rule belongs to
 * @param rule - The rolling rule to charge
 * @param cost - Units consumed
 * @param now - Injectable clock, for tests
 */
export async function chargeRollingWindow(
  env: Env,
  scope: string,
  rule: RollingRule,
  cost: number = 1,
  now: number = Date.now()
): Promise<void> {
  const bucketStart = Math.floor(now / rule.bucketMs) * rule.bucketMs;
  const key = `r|${scope}|${rule.name}|${rule.identity}|${bucketStart}`;

  await env.DB.prepare(`
    INSERT INTO rate_limit_counters (bucketKey, scope, kind, identity, count, lastAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucketKey) DO UPDATE SET
      count = rate_limit_counters.count + excluded.count,
      lastAt = excluded.lastAt
  `).bind(
    key, scope, 'rolling', rule.identity, cost, now,
    bucketStart + rule.bucketMs + rule.lookbackMs + WINDOW_GRACE_MS
  ).run();
}

/**
 * Delete buckets whose window has closed. Cheap indexed range delete.
 *
 * @returns Number of rows removed
 */
export async function sweepExpiredRateLimits(
  env: Env,
  now: number = Date.now()
): Promise<number> {
  const result = await env.DB
    .prepare('DELETE FROM rate_limit_counters WHERE expiresAt < ?')
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}

/**
 * Drop every bucket for one identity across a scope — the admin "unstick this
 * user" action.
 *
 * @param env - Worker bindings
 * @param scope - Scope the identity was limited under
 * @param identity - Exact identity string, e.g. `email:alice@example.com`
 * @returns Number of rows removed
 */
export async function resetRateLimitIdentity(
  env: Env,
  scope: string,
  identity: string
): Promise<number> {
  const result = await env.DB
    .prepare('DELETE FROM rate_limit_counters WHERE scope = ? AND identity = ?')
    .bind(scope, identity)
    .run();
  return result.meta?.changes ?? 0;
}

/**
 * Read a window rule's current usage without consuming it.
 *
 * @returns Usage for the window `now` falls into
 */
export async function peekWindow(
  env: Env,
  scope: string,
  rule: WindowRule,
  now: number = Date.now()
): Promise<{ used: number; limit: number; remaining: number; resetAt: number }> {
  const buckets = await readBuckets(env, [windowKey(scope, rule, now)]);
  const used = buckets.get(windowKey(scope, rule, now))?.count ?? 0;
  return {
    used,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - used),
    resetAt: windowStart(now, rule.windowMs) + rule.windowMs
  };
}
