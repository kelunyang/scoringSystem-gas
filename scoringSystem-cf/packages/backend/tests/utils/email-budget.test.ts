/**
 * Email rate limiting policy tests.
 *
 * The scenario these are sized against: ~400 users, up to 40 logging in at
 * once when a class starts, all behind one school NAT address, sending through
 * a Google Workspace account capped at 2000 recipients a day.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { createD1FromMigration } from '../mocks/d1-sqlite';
import {
  guardEmailTrigger,
  checkEmailBudget,
  chargeEmailBudget,
  priorityForTrigger,
  EMAIL_PRIORITY_BY_TRIGGER
} from '../../src/utils/email-budget';
import { EmailTrigger } from '../../src/services/email-triggers';
import type { Env } from '../../src/types';

const MIGRATION = resolve(__dirname, '../../migrations/0006_add_rate_limit_counters.sql');

let env: Env;

/**
 * A test env with no KV, so config falls through to the defaults in
 * utils/config — the values this system will actually run with.
 */
function makeEnv(overrides: Record<string, string> = {}): Env {
  return {
    DB: createD1FromMigration(MIGRATION),
    ...overrides
  } as unknown as Env;
}

beforeEach(() => {
  env = makeEnv();
});

describe('trigger limits', () => {
  it('blocks a second mail to the same address inside the cooldown', async () => {
    const first = await guardEmailTrigger(env, { recipient: 'student@example.com', channel: 'open' });
    expect(first.allowed).toBe(true);

    const second = await guardEmailTrigger(env, { recipient: 'student@example.com', channel: 'open' });
    expect(second.allowed).toBe(false);
    expect(second.rule).toBe('recipient_cooldown');
  });

  it('treats addresses case- and whitespace-insensitively', async () => {
    await guardEmailTrigger(env, { recipient: 'Student@Example.com', channel: 'open' });

    const sameAddress = await guardEmailTrigger(env, { recipient: '  student@example.com ', channel: 'open' });
    expect(sameAddress.allowed).toBe(false);
  });

  it('keeps the open and verified channels in separate buckets', async () => {
    // The attack this closes: someone who knows a victim's address hammers the
    // 2FA resend endpoint (no password needed) until the victim's per-recipient
    // quota is gone, so the victim can no longer get their own login code. The
    // login path needs the password, so it charges a different bucket.
    //
    // Steps are 61s apart because the 60s cooldown is shared across channels
    // by design; the hour starts on a boundary so nothing rolls into the next
    // window mid-test.
    const victim = { recipient: 'victim@example.com' };
    const hourStart = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    const step = 61_000;

    // EMAIL_MAX_PER_RECIPIENT_HOUR defaults to 5 — exhaust the open channel.
    for (let i = 0; i < 5; i++) {
      const decision = await guardEmailTrigger(env, { ...victim, channel: 'open' }, hourStart + i * step);
      expect(decision.allowed, `open call ${i + 1}`).toBe(true);
    }

    const openExhausted = await guardEmailTrigger(env, { ...victim, channel: 'open' }, hourStart + 5 * step);
    expect(openExhausted.allowed).toBe(false);
    expect(openExhausted.rule).toBe('recipient_hour:open');

    // The victim's own password-verified login, in the same hour, still works.
    const verified = await guardEmailTrigger(env, { ...victim, channel: 'verified' }, hourStart + 6 * step);
    expect(verified.allowed).toBe(true);
  });

  it('does not apply the per-IP rule unless asked', async () => {
    // 40 students starting a class share one NAT address. The login path must
    // not count them against a per-IP rule, or the class locks itself out.
    const ip = '203.0.113.7';
    let allowed = 0;

    for (let i = 0; i < 40; i++) {
      const decision = await guardEmailTrigger(env, {
        recipient: `student${i}@example.com`,
        ip,
        channel: 'verified'
      });
      if (decision.allowed) allowed++;
    }

    expect(allowed).toBe(40);
  });

  it('is switched off in development', async () => {
    // A 60s cooldown between local login attempts is friction that gets the
    // whole mechanism disabled rather than worked around.
    const dev = makeEnv({ ENVIRONMENT: 'development' });

    for (let i = 0; i < 10; i++) {
      const decision = await guardEmailTrigger(dev, { recipient: 'dev@example.com', channel: 'open' });
      expect(decision.allowed, `dev call ${i + 1}`).toBe(true);
    }
  });

  it('applies the per-IP rule on password-free endpoints', async () => {
    const ip = '198.51.100.9';
    let allowed = 0;

    // Distinct recipients each time, so only the IP rule can bite.
    for (let i = 0; i < 80; i++) {
      const decision = await guardEmailTrigger(env, {
        recipient: `target${i}@example.com`,
        ip,
        channel: 'open',
        applyIpLimit: true
      });
      if (decision.allowed) allowed++;
    }

    // EMAIL_MAX_PER_IP_HOUR defaults to 60.
    expect(allowed).toBe(60);
  });
});

describe('daily budget', () => {
  it('lets every priority through while there is room', async () => {
    for (const priority of ['critical', 'normal', 'bulk'] as const) {
      expect((await checkEmailBudget(env, priority)).allowed).toBe(true);
    }
  });

  it('cuts bulk off first, then normal, and keeps critical last', async () => {
    // Defaults: budget 1500, bulk ceiling 50% (750), normal 65% (975).
    await chargeEmailBudget(env, 800);

    expect((await checkEmailBudget(env, 'bulk')).allowed).toBe(false);
    expect((await checkEmailBudget(env, 'normal')).allowed).toBe(true);
    expect((await checkEmailBudget(env, 'critical')).allowed).toBe(true);

    await chargeEmailBudget(env, 200); // 1000 used

    expect((await checkEmailBudget(env, 'normal')).allowed).toBe(false);
    expect((await checkEmailBudget(env, 'critical')).allowed).toBe(true);

    await chargeEmailBudget(env, 500); // 1500 used

    expect((await checkEmailBudget(env, 'critical')).allowed).toBe(false);
  });

  it('reserves enough headroom for a full day of logins', async () => {
    // The point of the tiers. A digest robot run plus a cohort's invitations
    // must not be able to starve 400 people out of logging in.
    const digestRun = 400;
    const invitationBatch = 400;

    await chargeEmailBudget(env, digestRun + invitationBatch); // 800

    const status = await checkEmailBudget(env, 'critical');
    expect(status.allowed).toBe(true);
    expect(status.limit - status.used).toBeGreaterThanOrEqual(400);
  });

  it('can be switched off entirely', async () => {
    const unlimited = makeEnv({ EMAIL_DAILY_BUDGET: '0' });
    await chargeEmailBudget(unlimited, 99999);

    expect((await checkEmailBudget(unlimited, 'bulk')).allowed).toBe(true);
  });

  it('honours a budget lowered in config', async () => {
    const tight = makeEnv({ EMAIL_DAILY_BUDGET: '100', EMAIL_BUDGET_BULK_PCT: '50' });
    await chargeEmailBudget(tight, 50);

    expect((await checkEmailBudget(tight, 'bulk')).allowed).toBe(false);
    expect((await checkEmailBudget(tight, 'critical')).allowed).toBe(true);
  });
});

describe('priority classification', () => {
  it('classifies every EmailTrigger', async () => {
    // A trigger with no entry silently falls back to `normal`, which would
    // quietly let a new bulk mail type compete with login codes.
    const unclassified = Object.values(EmailTrigger).filter(
      trigger => !(trigger in EMAIL_PRIORITY_BY_TRIGGER)
    );
    expect(unclassified).toEqual([]);
  });

  it('puts the mails that lock people out in critical', () => {
    expect(priorityForTrigger(EmailTrigger.TWO_FACTOR_LOGIN)).toBe('critical');
    expect(priorityForTrigger(EmailTrigger.PASSWORD_RESET_2FA)).toBe('critical');
    expect(priorityForTrigger(EmailTrigger.ACCOUNT_LOCKED)).toBe('critical');
    expect(priorityForTrigger(EmailTrigger.SECURITY_ALERT)).toBe('critical');
  });

  it('puts robot mail in bulk', () => {
    expect(priorityForTrigger(EmailTrigger.NOTIFICATION_PATROL)).toBe('bulk');
    expect(priorityForTrigger(EmailTrigger.ADMIN_NOTIFICATION)).toBe('bulk');
  });

  it('defaults an unknown trigger to normal, not critical', () => {
    expect(priorityForTrigger('something_new')).toBe('normal');
  });
});
