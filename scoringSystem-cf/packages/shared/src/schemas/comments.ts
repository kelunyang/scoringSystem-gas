/**
 * @fileoverview Zod schemas for comments-related API endpoints
 * Provides runtime type validation for comment and comment voting APIs
 */

import { z } from 'zod';

/**
 * Create comment request schema
 */
export const CreateCommentRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  commentData: z.object({
    stageId: z.string().min(1, 'Stage ID is required'),
    content: z.string().min(1, 'Content is required'),
    parentCommentId: z.string().optional()
  })
});

export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

/**
 * Get comment details request schema
 */
export const GetCommentDetailsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  commentId: z.string().min(1, 'Comment ID is required')
});

export type GetCommentDetailsRequest = z.infer<typeof GetCommentDetailsRequestSchema>;

/**
 * Get stage comments request schema
 */
export const GetStageCommentsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  excludeTeachers: z.boolean().optional().default(false),
  forVoting: z.boolean().optional().default(false)  // 用于投票时按作者去重
});

export type GetStageCommentsRequest = z.infer<typeof GetStageCommentsRequestSchema>;

/**
 * Add reaction request schema
 */
export const AddReactionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  commentId: z.string().min(1, 'Comment ID is required'),
  reactionType: z.string().min(1, 'Reaction type is required')
});

export type AddReactionRequest = z.infer<typeof AddReactionRequestSchema>;

/**
 * Remove reaction request schema
 * Note: No reactionType needed - removes user's reaction on this comment
 */
export const RemoveReactionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  commentId: z.string().min(1, 'Comment ID is required')
});

export type RemoveReactionRequest = z.infer<typeof RemoveReactionRequestSchema>;

/**
 * Get comment reactions request schema
 */
export const GetCommentReactionsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  commentId: z.string().min(1, 'Comment ID is required')
});

export type GetCommentReactionsRequest = z.infer<typeof GetCommentReactionsRequestSchema>;

/**
 * Check voting eligibility request schema
 */
export const CheckVotingEligibilityRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type CheckVotingEligibilityRequest = z.infer<typeof CheckVotingEligibilityRequestSchema>;

/**
 * Comment ranking item schema
 */
export const CommentRankingItemSchema = z.object({
  commentId: z.string().min(1, 'Comment ID is required'),
  rank: z.number().int().positive('Rank must be a positive integer')
});

/**
 * Submit comment ranking request schema
 */
export const SubmitCommentRankingRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingData: z.array(CommentRankingItemSchema).min(1, 'At least one ranking is required')
});

export type SubmitCommentRankingRequest = z.infer<typeof SubmitCommentRankingRequestSchema>;

/**
 * Get comment rankings request schema
 */
export const GetCommentRankingsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  commentId: z.string().min(1, 'Comment ID is required')
});

export type GetCommentRankingsRequest = z.infer<typeof GetCommentRankingsRequestSchema>;

/**
 * Get stage comment rankings request schema
 */
export const GetStageCommentRankingsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetStageCommentRankingsRequest = z.infer<typeof GetStageCommentRankingsRequestSchema>;

/**
 * Get comment settlement analysis request schema
 */
export const GetCommentSettlementAnalysisRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetCommentSettlementAnalysisRequest = z.infer<typeof GetCommentSettlementAnalysisRequestSchema>;

/**
 * Get comment ranking history request schema
 */
export const GetCommentRankingHistoryRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetCommentRankingHistoryRequest = z.infer<typeof GetCommentRankingHistoryRequestSchema>;

/**
 * Get all stages comments request schema (batch API)
 * Used to fetch comments for multiple stages in a single request
 */
export const GetAllStagesCommentsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageIds: z.array(z.string().min(1)).min(1, 'At least one stage ID is required'),
  excludeTeachers: z.boolean().optional().default(false),
  forVoting: z.boolean().optional().default(false)
});

export type GetAllStagesCommentsRequest = z.infer<typeof GetAllStagesCommentsRequestSchema>;
