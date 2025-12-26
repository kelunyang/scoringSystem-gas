/**
 * @fileoverview Common Zod schemas used across the application
 * Provides reusable validation schemas for common data structures
 */

import { z } from 'zod';

/**
 * Common response wrapper schema
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional()
  });

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  })
});

/**
 * Generic API response that can be either success or error
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([
    SuccessResponseSchema(dataSchema),
    ErrorResponseSchema
  ]);

/**
 * Common error codes
 */
export const ErrorCode = z.enum([
  'UNAUTHORIZED',
  'INVALID_SESSION',
  'USER_NOT_FOUND',
  'USER_DISABLED',
  'INSUFFICIENT_PERMISSIONS',
  'INVALID_INPUT',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'INTERNAL_ERROR',
  'SYSTEM_ERROR',
  'DATABASE_ERROR',
  'ACCESS_DENIED',
  'INVALID_CREDENTIALS',
  'INVALID_2FA_CODE',
  'ALREADY_INITIALIZED',
  'PROJECT_NOT_FOUND',
  'STAGE_NOT_FOUND',
  'SUBMISSION_NOT_FOUND',
  'GROUP_NOT_FOUND',
  'INVALID_OPERATION',
  'RATE_LIMIT_EXCEEDED',
  'FILE_TOO_LARGE',
  'INVALID_FILE_TYPE',
  'ROLE_CONFLICT',
  'STATUS_CONFLICT',
  'ALREADY_REVERSED'
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

/**
 * Common ID validation patterns
 * Format: prefix_<UUID v4>
 * UUID v4 format: 8-4-4-4-12 hexadecimal characters with hyphens
 * Example: proj_123e4567-e89b-12d3-a456-426614174000
 */
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export const UserIdSchema = z.string().regex(new RegExp(`^usr_${UUID_PATTERN}$`, 'i'), 'Invalid user ID format');
export const ProjectIdSchema = z.string().regex(new RegExp(`^proj_${UUID_PATTERN}$`, 'i'), 'Invalid project ID format');
export const GroupIdSchema = z.string().regex(new RegExp(`^grp_${UUID_PATTERN}$`, 'i'), 'Invalid group ID format');
export const StageIdSchema = z.string().regex(new RegExp(`^stg_${UUID_PATTERN}$`, 'i'), 'Invalid stage ID format');
export const SubmissionIdSchema = z.string().regex(new RegExp(`^sub_${UUID_PATTERN}$`, 'i'), 'Invalid submission ID format');
export const CommentIdSchema = z.string().regex(new RegExp(`^cmt_${UUID_PATTERN}$`, 'i'), 'Invalid comment ID format');
export const InvitationCodeSchema = z.string().regex(new RegExp(`^(inv_|ic_)${UUID_PATTERN}$`, 'i'), 'Invalid invitation code format');
// Accept both old format (stl_timestamp_random) and new format (settle_UUID/reversal_UUID)
export const SettlementIdSchema = z.string().regex(/^(settle|reversal|stl)_[0-9a-zA-Z_-]+$/i, 'Invalid settlement ID format');

/**
 * Common field validations
 * OWASP 2023: Minimum 8 characters for passwords
 */
export const EmailSchema = z.string().email('Invalid email format');
export const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters');
export const DisplayNameSchema = z.string().min(1, 'Display name is required').max(100, 'Display name too long');
export const TimestampSchema = z.number().int().positive();

/**
 * Pagination schemas
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().optional()
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasMore: z.boolean()
  });

/**
 * Common status enums
 */
export const UserStatus = z.enum(['active', 'disabled']);
export const ProjectStatus = z.enum(['active', 'archived', 'deleted']);
export const StageStatus = z.enum(['not_started', 'active', 'ended', 'settled']);
export const SubmissionStatus = z.enum(['draft', 'submitted', 'archived']);

/**
 * Common settings schema (JSON stringified)
 */
export const JsonStringSchema = z.string().transform((str, ctx) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid JSON string'
    });
    return z.NEVER;
  }
});

/**
 * Optional JSON schema that accepts both string and object
 */
export const OptionalJsonSchema = z.union([
  z.string(),
  z.record(z.string(), z.any())
]).optional();

/**
 * Session validation schema
 */
export const SessionIdSchema = z.string().min(1, 'Session ID is required');

/**
 * Turnstile token schema (optional)
 */
export const TurnstileTokenSchema = z.string().optional();

/**
 * Avatar configuration schema
 */
export const AvatarConfigSchema = z.object({
  avatarSeed: z.string().optional(),
  avatarStyle: z.string().optional(),
  avatarOptions: z.record(z.string(), z.string()).optional()
});

export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;
