/**
 * @fileoverview TypeScript type definitions for Cloudflare Workers environment
 */

// Import shared entity types
import type { AuthUser } from '@repo/shared';

/**
 * Cloudflare Email Service types
 * @see https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  content: string | ArrayBuffer;
  filename: string;
  type: string;
  disposition: 'attachment' | 'inline';
  contentId?: string;
}

export interface EmailMessage {
  to: string | string[] | EmailAddress | EmailAddress[];
  from: string | EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[] | EmailAddress | EmailAddress[];
  bcc?: string | string[] | EmailAddress | EmailAddress[];
  replyTo?: string | EmailAddress;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

export interface EmailSendResponse {
  messageId: string;
}

export interface SendEmail {
  send(message: EmailMessage): Promise<EmailSendResponse>;
}

/**
 * Cloudflare Workers environment bindings
 * These are configured in wrangler.toml
 */
export interface Env {
  // D1 Database
  DB: D1Database;

  // Durable Objects
  /**
   * 每位使用者一個實例，用來推 WebSocket 通知。
   * （舊註解寫「workers-types 沒有 DurableObjectNamespace」已經過時，
   * 現在的版本有這個型別。）
   */
  NOTIFICATION_HUB: DurableObjectNamespace;

  // Cloudflare Queues
  EMAIL_QUEUE: Queue<unknown>;
  NOTIFICATION_QUEUE: Queue<unknown>;
  LOGIN_EVENTS: Queue<unknown>;
  AI_RANKING_QUEUE: Queue<unknown>;

  // KV Namespaces
  // NOTE: SESSIONS is not used - system uses JWT instead
  KV: KVNamespace;  // Required for scoring system configuration (CONFIG binding in wrangler.toml)
  CONFIG?: KVNamespace;  // Legacy alias (deprecated, use KV instead)
  SYSTEM_CONFIG?: KVNamespace;  // System-wide configuration settings

  // Environment Variables
  JWT_SECRET: string;
  SESSION_TIMEOUT: string;
  PASSWORD_SALT_ROUNDS: string;
  INVITE_CODE_TIMEOUT: string;
  MAX_PROJECT_NAME_LENGTH: string;
  CONSOLE_LOGGING?: string;  // 'true' or 'false', default 'true'
  ENVIRONMENT?: string;  // 'development' or 'production'

  // Cloudflare Turnstile (CAPTCHA)
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_ENABLED?: string;

  // Gmail SMTP
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_NAME?: string;
  SMTP_FROM_EMAIL?: string;

  // Web App URL
  WEB_APP_URL?: string;

  // System Title (for branding/emails)
  SYSTEM_TITLE?: string;

  // System URL (for notifications)
  SYSTEM_URL?: string;

  // Gmail API (legacy - should use SMTP instead)
  GMAIL_API_KEY?: string;
  GMAIL_FROM_EMAIL?: string;

  // Resource limits
  MAX_GROUPS_PER_PROJECT?: string;
  MAX_MEMBERS_PER_GROUP?: string;
  MAX_CONCURRENT_PROJECTS?: string;
  MAX_STAGE_DURATION_DAYS?: string;

  // Scoring System Configuration (added 2025-12-08)
  DEFAULT_MAX_COMMENT_SELECTIONS: string;
  DEFAULT_STUDENT_RANKING_WEIGHT: string;
  DEFAULT_TEACHER_RANKING_WEIGHT: string;
  DEFAULT_COMMENT_REWARD_PERCENTILE: string;
  DEFAULT_MAX_VOTE_RESET_COUNT: string;

  // R2 Storage (for file uploads)
  FILES?: R2Bucket;

  // Cloudflare Email Service (native binding)
  // Optional to allow SMTP fallback during transition
  EMAIL?: SendEmail;
}

// Re-export AuthUser for external use
export type { AuthUser };

/**
 * Session data structure
 */
export interface SessionData {
  userId: string;
  userEmail: string;
  createdAt: number;
  lastActivityTime: number;
  expiryTime: number;
}


/**
 * Sudo target user info (the user being impersonated)
 */
export interface SudoTargetUser {
  userId: string;
  userEmail: string;
  displayName: string;
  avatarSeed?: string;
  avatarStyle?: string;
}

/**
 * What D1 accepts as a bound parameter.
 *
 * Anything else — `undefined`, a plain object, a Date — throws
 * `D1_TYPE_ERROR` at runtime, not at compile time, which is why the
 * hand-built parameter arrays are typed with this rather than `any[]`.
 * Optional values must be coerced (`?? null`) before they go in.
 */
export type SqlBindValue = string | number | boolean | null | ArrayBuffer;

/**
 * Extended Hono context type variables
 */
export interface HonoVariables {
  user: AuthUser;
  newToken?: string;

  // Sudo mode fields
  sudoMode?: boolean;           // Whether in sudo mode
  sudoAs?: SudoTargetUser;      // The user being impersonated
  actualUser?: AuthUser;        // The real user (preserved during sudo)
  sudoProjectId?: string;       // The project ID sudo is limited to
}

/**
 * Database entity types - Re-exported from shared package
 */
export type {
  User,
  Project,
  GlobalGroup,
  Group,
  Stage,
  Submission,
  Comment,
  Transaction,
  Criteria,
  Score,
  Invitation,
  EventLog,
  Notification,
  Ranking
} from '@repo/shared';

/**
 * 請求的形狀不定義在這裡。
 *
 * 這裡原本有 LoginRequest、CreateProjectRequest、CreateStageRequest…
 * 共七個介面，全庫零引用，而且欄位早已和實際的端點脫節。
 * 真正驗證請求的是 @repo/shared/schemas 的 Zod schema，
 * handler 拿到的型別由 `c.req.valid('json')` 從 schema 推導出來，
 * 所以再抄一份手寫介面只會多一個會過期的假契約。已於 2026-09-06 移除。
 */
