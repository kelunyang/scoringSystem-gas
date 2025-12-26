/**
 * @fileoverview Zod schemas for settlement-related data validation
 * Provides runtime type validation for WebSocket messages and API responses
 */

import { z } from 'zod';
import { ProjectIdSchema, StageIdSchema, SettlementIdSchema } from './common.js';

/**
 * Settlement step enum - defines valid settlement progress steps
 */
export const SettlementStepSchema = z.enum([
  'initializing',
  'lock_acquired',
  'votes_calculated',
  'distributing_report_rewards',
  'distributing_comment_rewards',
  'completed'
]);

export type SettlementStep = z.infer<typeof SettlementStepSchema>;

/**
 * Settlement progress details schema
 * Optional data sent with progress updates
 */
export const SettlementProgressDetailsSchema = z.object({
  teacherVoteCount: z.number().optional(),
  studentVoteCount: z.number().optional(),
  groupCount: z.number().optional(),
  totalRewardDistributed: z.number().optional(),
  participantCount: z.number().optional(),
  commentRewardPool: z.number().optional(),
  settlementId: z.string().optional(),
  rankings: z.record(z.string(), z.number()).optional(),
  scores: z.record(z.string(), z.number()).optional(),
  weightedScores: z.record(z.string(), z.number()).optional(),
  commentRankings: z.record(z.string(), z.number()).optional(),
  commentScores: z.record(z.string(), z.number()).optional(),
  groupNames: z.record(z.string(), z.string()).optional(),
  authorNames: z.record(z.string(), z.string()).optional(),
  groupMembers: z.record(z.string(), z.array(z.string())).optional() // groupId -> array of userEmails
}).optional();

export type SettlementProgressDetails = z.infer<typeof SettlementProgressDetailsSchema>;

/**
 * WebSocket settlement progress message data schema
 * Validates data structure sent via WebSocket
 */
export const SettlementProgressDataSchema = z.object({
  stageId: StageIdSchema,
  step: SettlementStepSchema,
  progress: z.number().min(0).max(100, 'progress must be between 0 and 100'),
  message: z.string().min(1, 'message is required'),
  details: SettlementProgressDetailsSchema
});

export type SettlementProgressData = z.infer<typeof SettlementProgressDataSchema>;

/**
 * Settlement API response data schema
 */
export const SettleStageDataSchema = z.object({
  stageId: StageIdSchema,
  stageName: z.string(),
  settlementId: SettlementIdSchema,
  finalRankings: z.record(z.string(), z.number()),
  scoringResults: z.record(z.string(), z.number()),
  weightedScores: z.record(z.string(), z.number()),
  totalPointsDistributed: z.number(),
  participantCount: z.number(),
  settledTime: z.number(),
  groupNames: z.record(z.string(), z.string()).optional(),
  authorNames: z.record(z.string(), z.string()).optional(),
  commentRankings: z.record(z.string(), z.number()).optional(),
  commentScores: z.record(z.string(), z.number()).optional()
});

export type SettleStageData = z.infer<typeof SettleStageDataSchema>;

/**
 * API error schema
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Settlement API response schema
 */
export const SettleStageResponseSchema = z.object({
  success: z.boolean(),
  data: SettleStageDataSchema.optional(),
  error: ApiErrorSchema.optional(),
  message: z.string().optional()
});

export type SettleStageResponse = z.infer<typeof SettleStageResponseSchema>;

/**
 * Preview scores scoring result schema
 */
export const ScoringResultSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  rank: z.number(),
  weightedScore: z.number(),
  totalPoints: z.number(),
  participantCount: z.number(),
  participantDistribution: z.array(z.object({
    userEmail: z.string(),
    percentage: z.number(),
    points: z.number()
  }))
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/**
 * Preview scores API response data schema
 */
export const PreviewScoresDataSchema = z.object({
  stageId: StageIdSchema,
  stageName: z.string(),
  scoringResults: z.array(ScoringResultSchema),
  totalVotes: z.number(),
  previewOnly: z.boolean()
});

export type PreviewScoresData = z.infer<typeof PreviewScoresDataSchema>;

/**
 * Preview scores API response schema
 */
export const PreviewScoresResponseSchema = z.object({
  success: z.boolean(),
  data: PreviewScoresDataSchema.optional(),
  error: ApiErrorSchema.optional(),
  message: z.string().optional()
});

export type PreviewScoresResponse = z.infer<typeof PreviewScoresResponseSchema>;

/**
 * Get settled stage results API response data schema
 */
export const SettledStageResultsDataSchema = z.object({
  stageId: StageIdSchema,
  stageName: z.string(),
  settledTime: z.number(),
  finalRankings: z.record(z.string(), z.number()),
  scoringResults: z.record(z.string(), z.number())
});

export type SettledStageResultsData = z.infer<typeof SettledStageResultsDataSchema>;

/**
 * Get settled stage results API response schema
 */
export const SettledStageResultsResponseSchema = z.object({
  success: z.boolean(),
  data: SettledStageResultsDataSchema.optional(),
  error: ApiErrorSchema.optional(),
  message: z.string().optional()
});

export type SettledStageResultsResponse = z.infer<typeof SettledStageResultsResponseSchema>;

/**
 * Reverse settlement request schema
 */
export const ReverseSettlementRequestSchema = z.object({
  projectId: ProjectIdSchema,
  settlementId: SettlementIdSchema,
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500, 'Reason too long')
});

export type ReverseSettlementRequest = z.infer<typeof ReverseSettlementRequestSchema>;

/**
 * Get reverse preview request schema
 */
export const GetReversePreviewRequestSchema = z.object({
  projectId: ProjectIdSchema,
  settlementId: SettlementIdSchema
});

export type GetReversePreviewRequest = z.infer<typeof GetReversePreviewRequestSchema>;

/**
 * Settlement history filters schema
 */
export const SettlementHistoryFiltersSchema = z.object({
  stageId: z.string().optional(),
  settlementType: z.string().optional(),
  status: z.string().optional()
}).optional();

export type SettlementHistoryFilters = z.infer<typeof SettlementHistoryFiltersSchema>;

/**
 * Get settlement history request schema
 */
export const GetSettlementHistoryRequestSchema = z.object({
  projectId: ProjectIdSchema,
  filters: SettlementHistoryFiltersSchema
});

export type GetSettlementHistoryRequest = z.infer<typeof GetSettlementHistoryRequestSchema>;

/**
 * Get settlement details request schema
 */
export const GetSettlementDetailsRequestSchema = z.object({
  projectId: ProjectIdSchema,
  settlementId: SettlementIdSchema
});

export type GetSettlementDetailsRequest = z.infer<typeof GetSettlementDetailsRequestSchema>;

/**
 * Get stage settlement rankings request schema
 */
export const GetStageSettlementRankingsRequestSchema = z.object({
  projectId: ProjectIdSchema,
  stageId: StageIdSchema
});

export type GetStageSettlementRankingsRequest = z.infer<typeof GetStageSettlementRankingsRequestSchema>;

/**
 * Get comment settlement rankings request schema
 */
export const GetCommentSettlementRankingsRequestSchema = z.object({
  projectId: ProjectIdSchema,
  stageId: StageIdSchema
});

export type GetCommentSettlementRankingsRequest = z.infer<typeof GetCommentSettlementRankingsRequestSchema>;
