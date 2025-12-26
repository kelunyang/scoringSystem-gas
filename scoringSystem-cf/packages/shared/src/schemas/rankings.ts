/**
 * @fileoverview Zod schemas for ranking-related API endpoints
 * Provides runtime type validation for ranking management APIs
 */

import { z } from 'zod';

/**
 * Get stage rankings request schema
 */
export const GetStageRankingsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetStageRankingsRequest = z.infer<typeof GetStageRankingsRequestSchema>;

/**
 * Get teacher vote history request schema
 */
export const GetTeacherVoteHistoryRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetTeacherVoteHistoryRequest = z.infer<typeof GetTeacherVoteHistoryRequestSchema>;

/**
 * Get ranking proposals request schema
 */
export const GetRankingProposalsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetRankingProposalsRequest = z.infer<typeof GetRankingProposalsRequestSchema>;

/**
 * Rankings data for teacher comprehensive vote
 */
export const RankingsDataSchema = z.object({
  submissions: z.array(z.any()).optional(),
  comments: z.array(z.any()).optional()
});

export type RankingsData = z.infer<typeof RankingsDataSchema>;

/**
 * Submit teacher comprehensive vote request schema
 */
export const SubmitTeacherComprehensiveVoteRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankings: RankingsDataSchema
});

export type SubmitTeacherComprehensiveVoteRequest = z.infer<typeof SubmitTeacherComprehensiveVoteRequestSchema>;

/**
 * Submit group ranking request schema
 */
export const SubmitGroupRankingRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingData: z.any() // Handler validates the specific structure
});

export type SubmitGroupRankingRequest = z.infer<typeof SubmitGroupRankingRequestSchema>;

/**
 * Vote on ranking proposal request schema
 */
export const VoteOnRankingProposalRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  proposalId: z.string().min(1, 'Proposal ID is required'),
  agree: z.boolean(),
  comment: z.string().optional()
});

export type VoteOnRankingProposalRequest = z.infer<typeof VoteOnRankingProposalRequestSchema>;

/**
 * Withdraw ranking proposal request schema
 */
export const WithdrawRankingProposalRequestSchema = z.object({
  proposalId: z.string().min(1, 'Proposal ID is required')
});

export type WithdrawRankingProposalRequest = z.infer<typeof WithdrawRankingProposalRequestSchema>;

/**
 * Reset proposal votes request schema
 */
export const ResetProposalVotesRequestSchema = z.object({
  proposalId: z.string().min(1, 'Proposal ID is required'),
  reason: z.string().optional()
});

export type ResetProposalVotesRequest = z.infer<typeof ResetProposalVotesRequestSchema>;

/**
 * Submit stage ranking vote request schema
 */
export const SubmitStageRankingVoteRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankings: z.any() // Handler validates the specific structure
});

export type SubmitStageRankingVoteRequest = z.infer<typeof SubmitStageRankingVoteRequestSchema>;

/**
 * Get voting status request schema
 */
export const GetVotingStatusRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetVotingStatusRequest = z.infer<typeof GetVotingStatusRequestSchema>;

/**
 * Get teacher rankings request schema
 */
export const GetTeacherRankingsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetTeacherRankingsRequest = z.infer<typeof GetTeacherRankingsRequestSchema>;

/**
 * Get teacher ranking versions request schema
 */
export const GetTeacherRankingVersionsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingType: z.enum(['submission', 'comment'])
});

export type GetTeacherRankingVersionsRequest = z.infer<typeof GetTeacherRankingVersionsRequestSchema>;

// ============================================
// AI Ranking Suggestion Schemas
// ============================================

/**
 * AI ranking item metadata schema
 */
export const AIRankingItemMetadataSchema = z.object({
  groupName: z.string().optional(),
  authorName: z.string().optional(),
  memberNames: z.array(z.string()).optional()
});

/**
 * AI ranking item schema
 */
export const AIRankingItemSchema = z.object({
  id: z.string().min(1, 'Item ID is required'),
  content: z.string().min(1, 'Content is required'),
  metadata: AIRankingItemMetadataSchema
});

/**
 * AI ranking suggestion request schema
 */
export const AIRankingSuggestionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingType: z.enum(['submission', 'comment']),
  providerId: z.string().min(1, 'Provider ID is required'),
  items: z.array(AIRankingItemSchema).min(1, 'At least one item is required'),
  /** Custom prompt from user (max 30 chars) */
  customPrompt: z.string().max(30, 'Custom prompt must be 30 characters or less').optional()
});

/**
 * AI ranking suggestion response schema
 */
export const AIRankingSuggestionResponseSchema = z.object({
  queryId: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  model: z.string(),
  reason: z.string(),
  ranking: z.array(z.string()),
  createdAt: z.number(),
  /** DeepSeek Thinking mode reasoning process (optional) */
  thinkingProcess: z.string().optional(),
  /** Custom prompt used in this query */
  customPrompt: z.string().optional()
});
