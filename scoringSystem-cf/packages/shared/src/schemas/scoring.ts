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

/**
 * Clear stage votes request schema (force-revert a stage to the pre-voting state)
 * Invalidates all student ranking proposals in the stage (作廢), optionally reversing
 * any active stage settlement, and rolls the stage back to `voting` or `active`.
 */
export const ClearStageVotesRequestSchema = z
  .object({
    projectId: z.string().min(1, 'Project ID is required'),
    stageId: z.string().min(1, 'Stage ID is required'),
    reason: z.string().trim().min(1, '必須填寫撤回理由'),
    targetState: z.enum(['voting', 'active']),
    // Required only when targetState === 'active': hours to extend the active window.
    extendHours: z.number().int().positive().max(720).optional()
  })
  .refine(
    (data) => data.targetState !== 'active' || typeof data.extendHours === 'number',
    { message: '回到 active 時必須指定延長時數', path: ['extendHours'] }
  );

export type ClearStageVotesRequest = z.infer<typeof ClearStageVotesRequestSchema>;
