/**
 * @fileoverview Zod schemas for wallet-related API endpoints
 * Provides runtime type validation for wallet transaction APIs
 */

import { z } from 'zod';

/**
 * Get user transactions request schema
 */
export const GetUserTransactionsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  targetUserEmail: z.string().nullish(),
  limit: z.number().int().positive().optional().default(50),
  stageId: z.string().optional(),
  settlementId: z.string().optional(),
  relatedSubmissionId: z.string().optional(),
  groupId: z.string().optional()
});

export type GetUserTransactionsRequest = z.infer<typeof GetUserTransactionsRequestSchema>;

/**
 * Award points request schema
 */
export const AwardPointsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  targetUserEmail: z.string().min(1, 'Target user email is required'),
  amount: z.number(),
  transactionType: z.string().min(1, 'Transaction type is required'),
  source: z.string().min(1, 'Source is required'),
  relatedId: z.string().optional(),
  settlementId: z.string().optional(),
  stageId: z.string().optional()
});

export type AwardPointsRequest = z.infer<typeof AwardPointsRequestSchema>;

/**
 * Reverse transaction request schema
 */
export const ReverseTransactionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  reason: z.string().min(1, 'Reason is required')
});

export type ReverseTransactionRequest = z.infer<typeof ReverseTransactionRequestSchema>;

/**
 * Get project wallet ladder request schema
 */
export const GetProjectWalletLadderRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type GetProjectWalletLadderRequest = z.infer<typeof GetProjectWalletLadderRequestSchema>;

/**
 * Export wallet summary request schema
 */
export const ExportWalletSummaryRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type ExportWalletSummaryRequest = z.infer<typeof ExportWalletSummaryRequestSchema>;

/**
 * Get stage growth data request schema
 */
export const GetStageGrowthDataRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  targetUserEmail: z.string().nullish()
});

export type GetStageGrowthDataRequest = z.infer<typeof GetStageGrowthDataRequestSchema>;
