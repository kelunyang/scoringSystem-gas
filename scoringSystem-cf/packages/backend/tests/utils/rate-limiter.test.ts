/**
 * Rate limiter core tests, against a real in-memory SQLite database so the
 * atomic upsert the whole design rests on is actually exercised.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { createD1FromMigration, hasNodeSqlite, NODE_SQLITE_SKIP_REASON } from '../mocks/d1-sqlite';
import {
  checkRateLimit,
  commitRateLimit,
  consumeRateLimit,
  readRollingWindow,
  chargeRollingWindow,
  sweepExpiredRateLimits,
  resetRateLimitIdentity,
  peekWindow,
  type WindowRule,
  type RollingRule
} from '../../src/utils/rate-limiter';
import type { Env } from '../../src/types';

const MIGRATION = resolve(__dirname, '../../migrations/0010_add_rate_limit_counters.sql');
const HOUR = 60 * 60 * 1000;

let env: Env;

beforeEach(() => {
  env = { DB: createD1FromMigration(MIGRATION) } as unknown as Env;
});

const hourly = (limit: number, identity = 'email:a@example.com'): WindowRule => ({
  name: 'recipient_hour',
  identity,
  limit,
  windowMs: HOUR
});


if (!hasNodeSqlite) {
  console.warn(`[skip] ${'rate-limiter.test.ts'}: ${NODE_SQLITE_SKIP_REASON}`);
}

describe.skipIf(!hasNodeSqlite)('window counters', () => {
  it('allows up to the limit and rejects the next one', async () => {
    const rule = hourly(3);
    const now = 1_000_000_000_000;

    for (let i = 0; i < 3; i++) {
      const decision = await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
      expect(decision.allowed, `call ${i + 1} should be allowed`).toBe(true);
    }

    const rejected = await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
    expect(rejected.allowed).toBe(false);
    expect(rejected.rule).toBe('recipient_hour');
    expect(rejected.limit).toBe(3);
    expect(rejected.remaining).toBe(0);
  });

  it('does not consume anything when it rejects', async () => {
    const rule = hourly(1);
    const now = 1_000_000_000_000;

    await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
    await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
    await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);

    const status = await peekWindow(env, 'test', rule, now);
    expect(status.used).toBe(1);
  });

  it('starts fresh in the next window', async () => {
    const rule = hourly(2);
    const now = 1_000_000_000_000;

    await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
    await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now);
    expect((await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now)).allowed).toBe(false);

    const nextWindow = now + HOUR;
    expect((await consumeRateLimit(env, { scope: 'test', windows: [rule] }, nextWindow)).allowed).toBe(true);
  });

  it('keeps separate identities independent', async () => {
    const alice = hourly(1, 'email:alice@example.com');
    const bob = hourly(1, 'email:bob@example.com');
    const now = 1_000_000_000_000;

    await consumeRateLimit(env, { scope: 'test', windows: [alice] }, now);

    expect((await consumeRateLimit(env, { scope: 'test', windows: [alice] }, now)).allowed).toBe(false);
    expect((await consumeRateLimit(env, { scope: 'test', windows: [bob] }, now)).allowed).toBe(true);
  });

  it('charges the whole cost of a batch, and refuses one that would not fit', async () => {
    const rule = hourly(100);
    const now = 1_000_000_000_000;

    expect((await consumeRateLimit(env, { scope: 'test', windows: [rule], cost: 60 }, now)).allowed).toBe(true);

    const tooBig = await consumeRateLimit(env, { scope: 'test', windows: [rule], cost: 50 }, now);
    expect(tooBig.allowed).toBe(false);
    expect(tooBig.remaining).toBe(40);

    expect((await consumeRateLimit(env, { scope: 'test', windows: [rule], cost: 40 }, now)).allowed).toBe(true);
  });

  it('reports the tightest remaining headroom across several rules', async () => {
    const now = 1_000_000_000_000;
    const rules: WindowRule[] = [
      { name: 'hour', identity: 'email:a@example.com', limit: 5, windowMs: HOUR },
      { name: 'day', identity: 'email:a@example.com', limit: 20, windowMs: 24 * HOUR }
    ];

    const decision = await consumeRateLimit(env, { scope: 'test', windows: rules }, now);
    expect(decision.allowed).toBe(true);
    expect(decision.rule).toBe('hour');
    expect(decision.remaining).toBe(4);
  });
});

describe.skipIf(!hasNodeSqlite)('cooldowns', () => {
  const cooldown = { name: 'recipient_cooldown', identity: 'email:a@example.com', minIntervalMs: 60_000 };

  it('rejects a second hit inside the interval and reports the wait', async () => {
    const now = 1_000_000_000_000;

    expect((await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, now)).allowed).toBe(true);

    const tooSoon = await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, now + 30_000);
    expect(tooSoon.allowed).toBe(false);
    expect(tooSoon.rule).toBe('recipient_cooldown');
    expect(tooSoon.retryAfterMs).toBe(30_000);
  });

  it('allows the next hit once the interval has passed', async () => {
    const now = 1_000_000_000_000;
    await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, now);
    expect((await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, now + 60_000)).allowed).toBe(true);
  });

  it('has no fixed-window boundary hole', async () => {
    // A 60s fixed-window counter would allow these two: last millisecond of
    // one window, first of the next. A cooldown must not.
    const windowEdge = Math.ceil(1_000_000_000_000 / 60_000) * 60_000;

    await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, windowEdge - 1);
    const acrossEdge = await consumeRateLimit(env, { scope: 'test', cooldowns: [cooldown] }, windowEdge + 1);

    expect(acrossEdge.allowed).toBe(false);
  });
});

describe.skipIf(!hasNodeSqlite)('rolling windows', () => {
  const rule: RollingRule = {
    name: 'daily',
    identity: 'global',
    limit: 1500,
    bucketMs: HOUR,
    lookbackMs: 24 * HOUR
  };

  it('sums usage across sub-buckets', async () => {
    const now = 1_000_000_000_000;

    await chargeRollingWindow(env, 'budget', rule, 100, now - 5 * HOUR);
    await chargeRollingWindow(env, 'budget', rule, 200, now - 2 * HOUR);
    await chargeRollingWindow(env, 'budget', rule, 50, now);

    const status = await readRollingWindow(env, 'budget', rule, now);
    expect(status.used).toBe(350);
    expect(status.remaining).toBe(1150);
  });

  it('drops usage that has aged out of the lookback', async () => {
    const now = 1_000_000_000_000;

    await chargeRollingWindow(env, 'budget', rule, 900, now - 30 * HOUR);
    await chargeRollingWindow(env, 'budget', rule, 10, now);

    expect((await readRollingWindow(env, 'budget', rule, now)).used).toBe(10);
  });

  it('does not reset at a calendar boundary', async () => {
    // The reason this is a rolling window: Gmail's own quota is rolling, so a
    // midnight-reset counter would allow a full budget on either side of the
    // boundary and blow through the provider limit.
    const midnight = Math.ceil(1_000_000_000_000 / (24 * HOUR)) * (24 * HOUR);

    await chargeRollingWindow(env, 'budget', rule, 1400, midnight - HOUR);

    const justAfterMidnight = await readRollingWindow(env, 'budget', rule, midnight + 60_000);
    expect(justAfterMidnight.used).toBe(1400);
    expect(justAfterMidnight.remaining).toBe(100);
  });
});

describe.skipIf(!hasNodeSqlite)('housekeeping', () => {
  it('sweeps only expired buckets', async () => {
    const now = 1_000_000_000_000;

    await consumeRateLimit(env, { scope: 'test', windows: [hourly(10)] }, now - 48 * HOUR);
    await consumeRateLimit(env, { scope: 'test', windows: [hourly(10)] }, now);

    const swept = await sweepExpiredRateLimits(env, now);
    expect(swept).toBe(1);

    const status = await peekWindow(env, 'test', hourly(10), now);
    expect(status.used).toBe(1);
  });

  it('clears every bucket for one identity on reset', async () => {
    const now = 1_000_000_000_000;
    const rule = hourly(2, 'actor:teacher@example.com');

    await consumeRateLimit(env, { scope: 'email_actor', windows: [rule] }, now);
    await consumeRateLimit(env, { scope: 'email_actor', windows: [rule] }, now);
    expect((await consumeRateLimit(env, { scope: 'email_actor', windows: [rule] }, now)).allowed).toBe(false);

    await resetRateLimitIdentity(env, 'email_actor', 'actor:teacher@example.com');

    expect((await consumeRateLimit(env, { scope: 'email_actor', windows: [rule] }, now)).allowed).toBe(true);
  });
});

describe.skipIf(!hasNodeSqlite)('concurrency', () => {
  it('counts a burst of simultaneous requests without losing any', async () => {
    // The failure this guards against: KV allows ~1 write/sec to a key and
    // reads are eventually consistent, so 40 simultaneous logins used to be
    // counted as a handful. Every one must land.
    const rule = hourly(1000, 'ip:203.0.113.7');
    const now = 1_000_000_000_000;

    await Promise.all(
      Array.from({ length: 40 }, () =>
        commitRateLimit(env, { scope: 'test', windows: [rule] }, now)
      )
    );

    const status = await peekWindow(env, 'test', rule, now);
    expect(status.used).toBe(40);
  });

  it('lets a whole class through a limit sized for it', async () => {
    // 40 students starting a class, one shared school NAT address.
    const rule = hourly(60, 'ip:203.0.113.7');
    const now = 1_000_000_000_000;

    const decisions = [];
    for (let i = 0; i < 40; i++) {
      decisions.push(await consumeRateLimit(env, { scope: 'test', windows: [rule] }, now));
    }

    expect(decisions.every(d => d.allowed)).toBe(true);
  });
});

describe.skipIf(!hasNodeSqlite)('failure behaviour', () => {
  it('surfaces a broken database rather than silently allowing', async () => {
    // checkRateLimit itself must not swallow errors — callers decide whether
    // to fail open, and they log it when they do.
    const broken = { DB: { prepare: () => { throw new Error('D1 unavailable'); } } } as unknown as Env;

    await expect(
      checkRateLimit(broken, { scope: 'test', windows: [hourly(1)] })
    ).rejects.toThrow('D1 unavailable');
  });
});
