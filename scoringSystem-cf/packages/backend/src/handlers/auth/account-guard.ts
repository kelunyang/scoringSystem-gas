/**
 * @fileoverview The single place that decides whether an account may sign in.
 *
 * `lockUntil` used to be written by the Layer 2 risk consumer
 * (`queues/login-events-consumer.ts`) and by admin actions, but the only code
 * that ever *read* it lived in `authenticateUser()` — a function with no
 * callers. The live login path never mentioned it, so "temporarily locked for
 * 30 minutes" mailed an alert to the admins while the locked account carried on
 * signing in normally.
 *
 * Every path that issues a session token must call `assertAccountUsable` before
 * doing so: password step, 2FA step, and passkey. Checking it only at the
 * password step would let anyone already past step 1 straight through.
 */

import type { Env } from '../../types';
import { logGlobalOperation } from '../../utils/logging';

/** Why an account was refused, or null when it may proceed. */
export interface AccountRefusal {
  code: 'USER_DISABLED' | 'USER_LOCKED';
  message: string;
  status: 403;
}

/** The columns `assertAccountUsable` needs. Any `SELECT *` on users satisfies it. */
export interface GuardableUser {
  userId?: unknown;
  userEmail?: unknown;
  status?: unknown;
  lockUntil?: unknown;
  lockReason?: unknown;
}

/**
 * Render a remaining duration the way the login screen shows it.
 *
 * @param ms - Milliseconds left on the lock
 * @returns e.g. "2 小時 5 分鐘" or "12 分鐘"
 */
function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours} 小時 ${mins} 分鐘` : `${mins} 分鐘`;
}

/**
 * Decide whether an account may sign in right now.
 *
 * An expired lock is cleared as a side effect, so a user who waited out their
 * lock does not stay flagged, and the auto-unlock is recorded for audit.
 *
 * @param env - Worker bindings
 * @param user - A row from `users` (at minimum status/lockUntil/lockReason)
 * @returns null when the account may proceed, otherwise the refusal to return
 *
 * @example
 * const refusal = await assertAccountUsable(c.env, user);
 * if (refusal) {
 *   return c.json({ success: false, error: { code: refusal.code, message: refusal.message } }, refusal.status);
 * }
 */
export async function assertAccountUsable(
  env: Env,
  user: GuardableUser
): Promise<AccountRefusal | null> {
  if (user.status === 'disabled') {
    return {
      code: 'USER_DISABLED',
      message: '此帳號已被停用，請聯繫管理員',
      status: 403
    };
  }

  const lockUntil = typeof user.lockUntil === 'number' ? user.lockUntil : null;
  if (!lockUntil) return null;

  const now = Date.now();

  if (lockUntil > now) {
    return {
      code: 'USER_LOCKED',
      message: `帳號因安全因素暫時鎖定，請於 ${formatRemaining(lockUntil - now)} 後再試`,
      status: 403
    };
  }

  // Lock has expired — clear it so the row stops carrying a stale flag.
  try {
    await env.DB
      .prepare('UPDATE users SET lockUntil = NULL, lockReason = NULL WHERE userId = ?')
      .bind(user.userId)
      .run();

    await logGlobalOperation(
      env,
      String(user.userEmail ?? 'unknown'),
      'account_auto_unlocked',
      'user',
      String(user.userId ?? 'unknown'),
      { userEmail: user.userEmail, lockExpiredAt: lockUntil, unlockedAt: now },
      { level: 'info' }
    );
  } catch (error) {
    // Failing to clear the flag must not block a user whose lock has expired.
    console.error('[account-guard] Failed to clear expired lock:', error);
  }

  return null;
}
