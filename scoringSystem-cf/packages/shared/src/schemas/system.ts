/**
 * @fileoverview Zod schemas for system-related API endpoints
 * Provides runtime type validation for system management APIs
 */

import { z } from 'zod';

/**
 * Turnstile configuration response schema
 */
export const TurnstileConfigSchema = z.object({
  enabled: z.boolean(),
  siteKey: z.string().nullable()
});

export type TurnstileConfig = z.infer<typeof TurnstileConfigSchema>;

/**
 * System information response schema
 */
export const SystemInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.string(),
  systemTitle: z.string(),
  brandingIcon: z.string().optional(),
  timestamp: z.number()
});

export type SystemInfo = z.infer<typeof SystemInfoSchema>;

/**
 * System logs query schema
 */
export const SystemLogsQuerySchema = z.object({
  level: z.enum(['info', 'warn', 'warning', 'error', 'critical', 'debug']).optional(),
  action: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  search: z.string().optional(),
  options: z.object({
    level: z.enum(['info', 'warn', 'warning', 'error', 'critical', 'debug']).optional(),
    action: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional()
  }).optional()
});

export type SystemLogsQuery = z.infer<typeof SystemLogsQuerySchema>;

/**
 * System log entry schema
 */
export const SystemLogEntrySchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  level: z.enum(['info', 'warn', 'warning', 'error', 'critical', 'debug']),
  action: z.string(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  projectId: z.string().optional(),
  details: z.string().optional(),
  ipAddress: z.string().optional()
});

export type SystemLogEntry = z.infer<typeof SystemLogEntrySchema>;

/**
 * System logs response schema
 */
export const SystemLogsResponseSchema = z.object({
  logs: z.array(SystemLogEntrySchema),
  total: z.number(),
  limit: z.number().optional(),
  offset: z.number().optional()
});

export type SystemLogsResponse = z.infer<typeof SystemLogsResponseSchema>;

/**
 * Log statistics schema
 * Matches backend getLogStatistics() output format
 */
export const LogStatisticsSchema = z.object({
  /** Total number of logs in the system */
  totalLogs: z.number(),
  /** Timestamp of the newest log entry (null if no logs) */
  newestLog: z.number().nullable(),
  /** Database identifier (legacy field from GAS migration) */
  spreadsheetName: z.string(),
  /** Count of logs by level (info, warning, error, critical, etc.) */
  levelCounts: z.record(z.string(), z.number())
});

export type LogStatistics = z.infer<typeof LogStatisticsSchema>;

/**
 * Secrets checklist item schema
 */
export const SecretChecklistItemSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  status: z.string(),
  setupCommand: z.string().optional(),
  description: z.string().optional()
});

export type SecretChecklistItem = z.infer<typeof SecretChecklistItemSchema>;

/**
 * Secrets checklist response schema
 */
export const SecretsChecklistSchema = z.object({
  required: z.array(SecretChecklistItemSchema),
  optional: z.array(SecretChecklistItemSchema),
  summary: z.object({
    totalRequired: z.number(),
    configuredRequired: z.number(),
    totalOptional: z.number(),
    configuredOptional: z.number()
  }).optional()
});

export type SecretsChecklist = z.infer<typeof SecretsChecklistSchema>;

// ============================================
// AI Provider Schemas
// ============================================

/**
 * AI Provider public info schema (without apiKey)
 */
export const AIProviderPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export type AIProviderPublicType = z.infer<typeof AIProviderPublicSchema>;

/**
 * Create AI provider request schema
 */
export const CreateAIProviderRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url('Invalid URL format'),
  model: z.string().min(1, 'Model is required'),
  apiKey: z.string().min(1, 'API Key is required'),
  enabled: z.boolean().default(true)
});

export type CreateAIProviderRequest = z.infer<typeof CreateAIProviderRequestSchema>;

/**
 * Update AI provider request schema
 */
export const UpdateAIProviderRequestSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required'),
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().optional(), // Empty string means no change
  enabled: z.boolean().optional()
});

export type UpdateAIProviderRequest = z.infer<typeof UpdateAIProviderRequestSchema>;

/**
 * Delete AI provider request schema
 */
export const DeleteAIProviderRequestSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required')
});

export type DeleteAIProviderRequest = z.infer<typeof DeleteAIProviderRequestSchema>;

/**
 * Test AI provider connection request schema
 */
export const TestAIProviderRequestSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required')
});

export type TestAIProviderRequest = z.infer<typeof TestAIProviderRequestSchema>;

/**
 * AI prompt configuration schema
 */
export const AIPromptConfigSchema = z.object({
  submissionPrompt: z.string().optional(),
  commentPrompt: z.string().optional()
});

export type AIPromptConfig = z.infer<typeof AIPromptConfigSchema>;

/**
 * Update AI prompt config request schema
 */
export const UpdateAIPromptConfigRequestSchema = z.object({
  submissionPrompt: z.string().optional(),
  commentPrompt: z.string().optional()
});

export type UpdateAIPromptConfigRequest = z.infer<typeof UpdateAIPromptConfigRequestSchema>;
