/**
 * @fileoverview Email rate-limiting policy: who may trigger a mail, and how
 * much of the SMTP quota each kind of mail is allowed to eat.
 *
 * Two independent controls, deliberately at different layers:
 *
 * 1. Trigger limits (producer side, before queueing) give the user immediate
 *    429 feedback and keep junk out of the queue.
 * 2. The daily budget (consumer side, before the actual send) is the backstop.
 *    The queue consumer is the single point every mail must pass, including
 *    ones from cron robots that never touch an HTTP route, so the quota guard
 *    belongs there and nowhere else.
 *
 * The budget degrades by priority rather than cutting off flat. Without that,
 * a digest robot run at 08:00 can eat the whole day's quota and nobody can log
 * in at 10:00 — the failure mode is a total lockout, caused by newsletters.
 *
 * Where to put a trigger limit: only where the mail *is* the operation — a 2FA
 * send, an invitation, a batch notification, a manual resend. Where the mail is
 * a side effect of a domain action (a teacher force-withdrawing a submission,
 * an admin resetting someone's password), do not guard the route: refusing the
 * action because of an email quota breaks the actual work. Those paths are
 * covered by the daily budget alone, which drops the mail and lets the
 * operation succeed.
 */

import type { Env } from '../types';
import { getTypedConfig } from './config';
import {
  consumeRateLimit,
  readRollingWindow,
  chargeRollingWindow,
  type RateLimitDecision,
  type RollingRule
} from './rate-limiter';

/** Scope used for per-recipient and per-IP trigger limits. */
export const EMAIL_TRIGGER_SCOPE = 'email_trigger';

/** Scope used for the system-wide SMTP budget. */
export const EMAIL_BUDGET_SCOPE = 'email_budget';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How much a mail is allowed to compete for the last of the daily quota.
 *
 * - `critical` blocks someone from using the system at all if it fails
 *   (login codes, password resets, account lock notices).
 * - `normal` has a person waiting on it, but nobody is locked out.
 * - `bulk` is robot-generated and can wait for tomorrow.
 */
export type EmailPriority = 'critical' | 'normal' | 'bulk';

/**
 * Priority of every `EmailTrigger`.
 *
 * Keyed on the enum's string values rather than the enum itself, because
 * services/email-service imports this module — importing the enum back would
 * make that cycle. A test asserts every EmailTrigger member appears here, so
 * the two cannot drift apart silently.
 */
export const EMAIL_PRIORITY_BY_TRIGGER: Record<string, EmailPriority> = {
  // Failing these locks someone out of the system entirely.
  two_factor_login: 'critical',
  password_reset: 'critical',
  password_reset_2fa: 'critical',
  account_locked: 'critical',
  account_unlocked: 'critical',
  security_alert: 'critical',

  // Someone is waiting, but nobody is locked out.
  invitation: 'normal',
  submission_force_withdrawn: 'normal',
  system_announcement: 'normal',
  manual_admin: 'normal',
  resend: 'normal',

  // Robot-generated; can wait for tomorrow.
  notification_patrol: 'bulk',
  admin_notification: 'bulk'
};

/**
 * Priority for an email trigger, defaulting to `normal` so a newly added
 * trigger nobody classified still leaves the critical reservation intact.
 *
 * @param trigger - An `EmailTrigger` value (or its string form)
 */
export function priorityForTrigger(trigger: string): EmailPriority {
  return EMAIL_PRIORITY_BY_TRIGGER[trigger] ?? 'normal';
}

export interface EmailTriggerLimits {
  cooldownMs: number;
  perRecipientHour: number;
  perRecipientDay: number;
  perIpHour: number;
}

/**
 * Load the trigger limits from KV-backed config.
 *
 * Disabled in development, matching the convention in middleware/rate-limit:
 * a 60-second cooldown between local login attempts is friction that gets the
 * whole mechanism switched off rather than worked around. The daily budget
 * stays on in development, since 1500 mails a day is not in anyone's way and
 * it is the part worth watching behave. Unit tests build an env with no
 * ENVIRONMENT, so they exercise the real limits.
 *
 * @param env - Worker bindings
 * @returns Effective limits; a value of 0 disables that rule
 */
export async function getEmailTriggerLimits(env: Env): Promise<EmailTriggerLimits> {
  if (env.ENVIRONMENT === 'development') {
    return { cooldownMs: 0, perRecipientHour: 0, perRecipientDay: 0, perIpHour: 0 };
  }

  const [cooldownSeconds, perRecipientHour, perRecipientDay, perIpHour] = await Promise.all([
    getTypedConfig(env, 'EMAIL_COOLDOWN_SECONDS') as Promise<number>,
    getTypedConfig(env, 'EMAIL_MAX_PER_RECIPIENT_HOUR') as Promise<number>,
    getTypedConfig(env, 'EMAIL_MAX_PER_RECIPIENT_DAY') as Promise<number>,
    getTypedConfig(env, 'EMAIL_MAX_PER_IP_HOUR') as Promise<number>
  ]);

  return {
    cooldownMs: cooldownSeconds * 1000,
    perRecipientHour,
    perRecipientDay,
    perIpHour
  };
}

/**
 * Which trust channel triggered the mail. Each channel counts into its own
 * per-recipient buckets, which is what stops a targeted denial of service:
 * an attacker who knows a victim's address can exhaust `open` by hammering
 * the 2FA resend endpoint, but `verified` needs the victim's password, so the
 * victim's own login still gets a code.
 */
export type EmailTriggerChannel = 'open' | 'verified';

export interface EmailTriggerOptions {
  /** Address the mail would be sent to; the identity that actually gets spammed */
  recipient: string;
  /** Caller IP, from CF-Connecting-IP */
  ip?: string;
  /** Trust channel; defaults to `open`, the stricter of the two */
  channel?: EmailTriggerChannel;
  /**
   * Apply the per-IP rule. Off for endpoints that already required a correct
   * password — see {@link guardEmailTrigger} for why that matters here.
   */
  applyIpLimit?: boolean;
  /** Units consumed, for batch sends */
  cost?: number;
}

/**
 * Check and consume the trigger limits for one outbound mail.
 *
 * The per-IP rule is opt-in because this deployment puts a whole school behind
 * one NAT address: 40 students starting a class share a single IP, so a per-IP
 * rule tight enough to stop an attacker would lock out the class. It is
 * therefore applied only to endpoints that send mail *without* proving who the
 * caller is (2FA resend, password-reset request). Endpoints that already
 * verified a password are limited per recipient only, so a class-start burst
 * of 40 logins from one IP passes untouched.
 *
 * Call this *after* any password check, never before: charging the recipient's
 * bucket on a failed password attempt would let an attacker with no
 * credentials burn a legitimate user's quota.
 *
 * @param env - Worker bindings
 * @param options - Recipient, caller IP, trust channel, per-IP rule toggle
 * @param now - Injectable clock, for tests
 * @returns Decision; nothing is consumed when it rejects
 *
 * @example
 * const decision = await guardEmailTrigger(env, {
 *   recipient: body.userEmail, ip, channel: 'open', applyIpLimit: true
 * });
 * if (!decision.allowed) return rateLimitResponse(decision, code, message);
 */
export async function guardEmailTrigger(
  env: Env,
  options: EmailTriggerOptions,
  now: number = Date.now()
): Promise<RateLimitDecision> {
  const limits = await getEmailTriggerLimits(env);
  const recipient = options.recipient.trim().toLowerCase();
  const channel = options.channel ?? 'open';
  const cost = options.cost ?? 1;

  const windows = [];
  if (limits.perRecipientHour > 0) {
    windows.push({
      name: `recipient_hour:${channel}`,
      identity: `email:${recipient}`,
      limit: limits.perRecipientHour,
      windowMs: HOUR_MS
    });
  }
  if (limits.perRecipientDay > 0) {
    windows.push({
      name: `recipient_day:${channel}`,
      identity: `email:${recipient}`,
      limit: limits.perRecipientDay,
      windowMs: DAY_MS
    });
  }
  if (options.applyIpLimit && options.ip && limits.perIpHour > 0) {
    windows.push({
      name: 'ip_hour',
      identity: `ip:${options.ip}`,
      limit: limits.perIpHour,
      windowMs: HOUR_MS
    });
  }

  // The cooldown is shared across channels on purpose: it exists to stop two
  // mails landing seconds apart in one inbox, and that is true regardless of
  // which endpoint asked for them.
  const cooldowns = limits.cooldownMs > 0
    ? [{
        name: 'recipient_cooldown',
        identity: `email:${recipient}`,
        minIntervalMs: limits.cooldownMs
      }]
    : [];

  return await consumeRateLimit(env, {
    scope: EMAIL_TRIGGER_SCOPE,
    windows,
    cooldowns,
    cost
  }, now);
}

/**
 * The system-wide budget rule, read from config.
 *
 * Rolling rather than midnight-reset because Gmail's own limit is a rolling 24
 * hours; a fixed window would allow a full budget just before reset and
 * another just after, roughly doubling usage inside one of Gmail's windows.
 */
async function getBudgetRule(env: Env): Promise<RollingRule> {
  const limit = (await getTypedConfig(env, 'EMAIL_DAILY_BUDGET')) as number;
  return {
    name: 'daily',
    identity: 'global',
    limit,
    bucketMs: HOUR_MS,
    lookbackMs: DAY_MS
  };
}

export interface EmailBudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  /** Ceiling this priority may consume up to */
  priorityCeiling: number;
  allowed: boolean;
}

/**
 * Check whether one more mail of this priority fits in the daily budget.
 *
 * Ceilings are cumulative thresholds on the shared total, which is what
 * reserves headroom for critical mail: with a 1500 budget and a 50% bulk
 * ceiling, digests stop at 750 and at least 750 is still there for login
 * codes. Set `EMAIL_DAILY_BUDGET` to 0 to disable the budget entirely.
 *
 * @param env - Worker bindings
 * @param priority - Priority of the mail about to be sent
 * @returns Usage and whether this mail is allowed
 */
export async function checkEmailBudget(
  env: Env,
  priority: EmailPriority
): Promise<EmailBudgetStatus> {
  const rule = await getBudgetRule(env);

  if (rule.limit <= 0) {
    return { used: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER, priorityCeiling: 0, allowed: true };
  }

  const [bulkPct, normalPct] = await Promise.all([
    getTypedConfig(env, 'EMAIL_BUDGET_BULK_PCT') as Promise<number>,
    getTypedConfig(env, 'EMAIL_BUDGET_NORMAL_PCT') as Promise<number>
  ]);

  const ceilings: Record<EmailPriority, number> = {
    bulk: Math.floor(rule.limit * bulkPct / 100),
    normal: Math.floor(rule.limit * normalPct / 100),
    critical: rule.limit
  };
  const priorityCeiling = ceilings[priority];

  const { used, remaining } = await readRollingWindow(env, EMAIL_BUDGET_SCOPE, rule);

  return {
    used,
    limit: rule.limit,
    remaining,
    priorityCeiling,
    allowed: used < priorityCeiling
  };
}

/**
 * Record that one mail was sent against the daily budget.
 *
 * Charged after a successful send, so failed sends do not burn quota the SMTP
 * provider never charged us for.
 *
 * @param env - Worker bindings
 * @param cost - Number of mails sent
 */
export async function chargeEmailBudget(env: Env, cost: number = 1): Promise<void> {
  const rule = await getBudgetRule(env);
  if (rule.limit <= 0) return;
  await chargeRollingWindow(env, EMAIL_BUDGET_SCOPE, rule, cost);
}
