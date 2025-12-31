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
  /** Group name (for submissions) */
  groupName: z.string().optional(),
  /** Author name (for comments) */
  authorName: z.string().optional(),
  /** Team member names (for submissions) */
  memberNames: z.array(z.string()).optional(),
  /** Full reply content array (for comments) */
  replies: z.array(z.string()).optional(),
  /** Reaction user lists (for comments) */
  reactions: z.object({
    /** Array of user emails who marked helpful */
    helpful: z.array(z.string()).optional(),
    /** Array of user emails who disagreed */
    disagreed: z.array(z.string()).optional()
  }).optional()
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
  /** Custom prompt from user (max 100 chars) */
  customPrompt: z.string().max(100, 'Custom prompt must be 100 characters or less').optional(),
  /** For comment mode: how many comments AI should select and rank */
  maxCommentSelections: z.number().int().min(1).optional()
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

// ============================================
// Bradley-Terry Ranking Schemas
// ============================================

/**
 * BT ranking suggestion request schema
 */
export const BTRankingSuggestionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingType: z.enum(['submission', 'comment']),
  providerId: z.string().min(1, 'Provider ID is required'),
  items: z.array(AIRankingItemSchema).min(2, 'At least two items are required for BT comparison'),
  /** Custom prompt from user (max 100 chars) */
  customPrompt: z.string().max(100, 'Custom prompt must be 100 characters or less').optional(),
  /** Number of comparisons per item (2-5, default 3) */
  pairsPerItem: z.number().int().min(2).max(5).default(3).optional(),
  /** For comment mode: how many comments AI should select and rank */
  maxCommentSelections: z.number().int().min(1).optional()
});

export type BTRankingSuggestionRequest = z.infer<typeof BTRankingSuggestionRequestSchema>;

/**
 * BT comparison result schema
 */
export const BTComparisonSchema = z.object({
  index: z.number().int().positive(),
  itemA: z.string(),
  itemB: z.string(),
  winner: z.string().optional(),
  reason: z.string().optional()
});

export type BTComparison = z.infer<typeof BTComparisonSchema>;

// ============================================
// AI Service Call Schemas
// ============================================

/**
 * AI service type enum schema
 */
export const AIServiceTypeSchema = z.enum([
  'ranking_direct',
  'ranking_bt',
  'ranking_multi_agent',
  'summary',
  'translation',
  'feedback'
]);

export type AIServiceType = z.infer<typeof AIServiceTypeSchema>;

/**
 * AI service call status enum schema
 */
export const AIServiceCallStatusSchema = z.enum([
  'pending',
  'processing',
  'success',
  'failed',
  'timeout'
]);

export type AIServiceCallStatus = z.infer<typeof AIServiceCallStatusSchema>;

/**
 * AI service call record schema (for database)
 */
export const AIServiceCallRecordSchema = z.object({
  callId: z.string(),
  projectId: z.string(),
  stageId: z.string().optional(),
  userEmail: z.string(),
  serviceType: AIServiceTypeSchema,
  rankingType: z.enum(['submission', 'comment']).optional(),
  providerId: z.string(),
  providerName: z.string(),
  model: z.string(),
  itemCount: z.number().int().optional(),
  customPrompt: z.string().optional(),
  status: AIServiceCallStatusSchema,
  result: z.string().optional(),
  reason: z.string().optional(),
  thinkingProcess: z.string().optional(),
  errorMessage: z.string().optional(),
  btComparisons: z.string().optional(),
  btStrengthParams: z.string().optional(),
  requestTokens: z.number().int().optional(),
  responseTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  responseTimeMs: z.number().int().optional(),
  createdAt: z.number().int(),
  completedAt: z.number().int().optional()
});

export type AIServiceCallRecord = z.infer<typeof AIServiceCallRecordSchema>;

/**
 * AI ranking history query request schema
 */
export const AIRankingHistoryQuerySchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingType: z.enum(['submission', 'comment']).optional(),
  limit: z.number().int().min(1).max(50).default(20).optional()
});

export type AIRankingHistoryQuery = z.infer<typeof AIRankingHistoryQuerySchema>;

// ============================================
// Multi-Agent Ranking Schemas
// ============================================

/**
 * AI ranking item schema for queue messages (simplified)
 */
export const AIRankingItemQueueSchema = z.object({
  id: z.string().min(1, 'Item ID is required'),
  content: z.string().min(1, 'Content is required'),
  metadata: AIRankingItemMetadataSchema
});

export type AIRankingItemQueue = z.infer<typeof AIRankingItemQueueSchema>;

/**
 * Multi-Agent ranking suggestion request schema
 * For Free-MAD style debate mode with 2+ providers
 */
export const MultiAgentRankingSuggestionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  rankingType: z.enum(['submission', 'comment']),
  /** Provider IDs (2-5 providers for Multi-Agent mode) */
  providerIds: z.array(z.string().min(1)).min(2, 'At least 2 providers required').max(5, 'Maximum 5 providers allowed'),
  items: z.array(AIRankingItemSchema).min(1, 'At least one item is required'),
  /** Custom prompt from user (max 100 chars) */
  customPrompt: z.string().max(100, 'Custom prompt must be 100 characters or less').optional(),
  /** For comment mode: how many comments AI should select and rank */
  maxCommentSelections: z.number().int().min(1).optional()
});

export type MultiAgentRankingSuggestionRequest = z.infer<typeof MultiAgentRankingSuggestionRequestSchema>;

/**
 * Multi-Agent provider round 1 result schema
 */
export const MultiAgentRound1ResultSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  ranking: z.array(z.string()),
  reason: z.string()
});

export type MultiAgentRound1Result = z.infer<typeof MultiAgentRound1ResultSchema>;

/**
 * Multi-Agent provider round 2 result schema
 */
export const MultiAgentRound2ResultSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  ranking: z.array(z.string()),
  reason: z.string(),
  changed: z.boolean(),
  critique: z.string().optional()
});

export type MultiAgentRound2Result = z.infer<typeof MultiAgentRound2ResultSchema>;

/**
 * Multi-Agent debate detail schema (for final result)
 */
export const MultiAgentDebateDetailSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  round1Ranking: z.array(z.string()),
  round1Reason: z.string(),
  round2Ranking: z.array(z.string()),
  round2Reason: z.string(),
  changed: z.boolean(),
  critique: z.string().optional()
});

// Note: MultiAgentDebateDetail type is exported from types/ai.ts

/**
 * Multi-Agent final result schema
 */
export const MultiAgentFinalResultSchema = z.object({
  ranking: z.array(z.string()),
  reason: z.string(),
  scores: z.record(z.string(), z.number()).optional(),
  debateDetails: z.array(MultiAgentDebateDetailSchema)
});

export type MultiAgentFinalResult = z.infer<typeof MultiAgentFinalResultSchema>;
