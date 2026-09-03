/**
 * @fileoverview Email classification enums.
 *
 * Kept in their own module because they are plain data that several places
 * need — including utils/email-budget, which maps them to send priorities.
 * They used to live in email-service, which imports worker-mailer, so reading
 * an enum value dragged an SMTP client (and the Workers-only
 * `cloudflare:sockets` builtin) in with it.
 *
 * Re-exported from services/email-service, so existing imports keep working.
 */

/**
 * Which module triggered an email.
 * Every member must have an entry in `EMAIL_PRIORITY_BY_TRIGGER`; a test
 * enforces that.
 */
export enum EmailTrigger {
  NOTIFICATION_PATROL = 'notification_patrol',
  INVITATION = 'invitation',
  PASSWORD_RESET = 'password_reset',
  PASSWORD_RESET_2FA = 'password_reset_2fa',
  TWO_FACTOR_LOGIN = 'two_factor_login',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  ADMIN_NOTIFICATION = 'admin_notification',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  MANUAL_ADMIN = 'manual_admin',
  RESEND = 'resend',
  SUBMISSION_FORCE_WITHDRAWN = 'submission_force_withdrawn',
  /**
   * Security alerts to admins. Distinct from ADMIN_NOTIFICATION so they keep
   * their `critical` budget priority (and so they can be filtered in the email
   * log) — they used to be sent under ADMIN_NOTIFICATION, which is `bulk`.
   */
  SECURITY_ALERT = 'security_alert'
}

/** How an email came to be sent. */
export type TriggerSource = 'manual' | 'auto' | 'scheduled';
