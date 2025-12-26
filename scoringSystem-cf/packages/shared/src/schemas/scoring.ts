/**
 * @fileoverview Zod schemas for scoring-related API endpoints
 * Provides runtime type validation for scoring and settlement APIs
 */

import { z } from 'zod';

/**
 * Validate settlement request schema
 */
export const ValidateSettlementRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type ValidateSettlementRequest = z.infer<typeof ValidateSettlementRequestSchema>;

/**
 * Settle stage request schema
 */
export const SettleStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  forceSettle: z.boolean().optional().default(false)
});

export type SettleStageRequest = z.infer<typeof SettleStageRequestSchema>;

/**
 * Get submission voting data request schema
 */
export const GetSubmissionVotingDataRequestSchema = z.object({
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetSubmissionVotingDataRequest = z.infer<typeof GetSubmissionVotingDataRequestSchema>;

/**
 * Get comment voting data request schema
 */
export const GetCommentVotingDataRequestSchema = z.object({
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetCommentVotingDataRequest = z.infer<typeof GetCommentVotingDataRequestSchema>;
