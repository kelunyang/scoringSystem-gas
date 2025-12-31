/**
 * @fileoverview TypeScript type definitions for Cloudflare Workers environment
 */

// Import shared entity types
import type { AuthUser } from '@repo/shared';

/**
 * Cloudflare Workers environment bindings
 * These are configured in wrangler.toml
 */
export interface Env {
  // D1 Database
  DB: D1Database;

  // Durable Objects
  NOTIFICATION_HUB: any; // DurableObjectNamespace type not available in current workers-types

  // Cloudflare Queues
  EMAIL_QUEUE: Queue<unknown>;
  NOTIFICATION_QUEUE: Queue<unknown>;
  SETTLEMENT_QUEUE: Queue<unknown>;
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

  // R2 Storage (for file uploads)
  FILES?: R2Bucket;
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
 * Request context with user information
 * Set by authentication middleware
 */
export interface RequestContext {
  user: AuthUser;
}

/**
 * Extended Hono context type variables
 */
export interface HonoVariables {
  user: AuthUser;
  newToken?: string;
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
 * Request parameter types
 */

// Login request
export interface LoginRequest {
  userEmail: string;
  password: string;
  turnstileToken?: string;
}

// Register request
export interface RegisterRequest {
  password: string;
  userEmail: string;
  displayName: string;
  invitationCode: string;
  avatarSeed?: string;
  avatarStyle?: string;
  avatarOptions?: Record<string, string>;
  turnstileToken?: string;
}

// Create project request
export interface CreateProjectRequest {
  projectName: string;
  description?: string;
  settings?: Record<string, any>;
}

// Create stage request
export interface CreateStageRequest {
  projectId: string;
  stageName: string;
  description?: string;
  startTime?: number;
  endTime?: number;
  settings?: Record<string, any>;
}

// Create submission request
export interface CreateSubmissionRequest {
  stageId: string;
  groupId: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

// Award points request
export interface AwardPointsRequest {
  projectId: string;
  userId: string;
  amount: number;
  description?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

// Create comment request
export interface CreateCommentRequest {
  submissionId: string;
  content: string;
  parentCommentId?: string;
}
