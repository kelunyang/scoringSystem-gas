/**
 * @fileoverview Zod schemas for submission-related API endpoints
 * Provides runtime type validation for submission management APIs
 */

import { z } from 'zod';

/**
 * Submission data schema for creating submissions
 *
 * Enhanced validation (Phase 2 optimization):
 * - authors: Must be valid email addresses
 * - participationProposal: Validates email format, ratio range (0-1), and total sum = 100%
 */
export const SubmissionDataSchema = z.object({
  content: z.string().min(1, 'Submission content is required'),

  // ✅ Validate authors must be valid emails
  authors: z.array(z.string().email('Invalid email format'))
    .min(1, 'At least one author required')
    .optional(),

  // ✅ Validate participation proposal
  participationProposal: z.record(
    z.string().email('Invalid email format'),  // Keys must be valid emails
    z.number()
      .min(0, 'Participation ratio must be >= 0')
      .max(1, 'Participation ratio must be <= 1')  // Ratio 0-1 (0-100%)
  )
    .refine(
      (proposal) => {
        // ✅ Validate total sum = 100% (allow floating point error)
        const total = Object.values(proposal).reduce((sum, val) => sum + val, 0);
        return Math.abs(total - 1) < 0.01;  // Tolerance: ±0.01 (±1%)
      },
      { message: 'Participation proposal must sum to 100%' }
    )
    .optional()
});

export type SubmissionData = z.infer<typeof SubmissionDataSchema>;

/**
 * Submit deliverable request schema
 */
export const SubmitDeliverableRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  submissionData: SubmissionDataSchema
});

export type SubmitDeliverableRequest = z.infer<typeof SubmitDeliverableRequestSchema>;

/**
 * List submissions options schema
 */
export const ListSubmissionsOptionsSchema = z.object({
  includeWithdrawn: z.boolean().optional(),
  groupId: z.string().optional()
});

export type ListSubmissionsOptions = z.infer<typeof ListSubmissionsOptionsSchema>;

/**
 * List submissions request schema
 */
export const ListSubmissionsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  options: ListSubmissionsOptionsSchema.optional()
});

export type ListSubmissionsRequest = z.infer<typeof ListSubmissionsRequestSchema>;

/**
 * Get submission details request schema
 */
export const GetSubmissionDetailsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required')
});

export type GetSubmissionDetailsRequest = z.infer<typeof GetSubmissionDetailsRequestSchema>;

/**
 * Delete submission request schema
 */
export const DeleteSubmissionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required')
});

export type DeleteSubmissionRequest = z.infer<typeof DeleteSubmissionRequestSchema>;

/**
 * Get submission versions request schema
 */
export const GetSubmissionVersionsRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  options: z.object({
    groupId: z.string().optional(),
    includeWithdrawn: z.boolean().optional(),
    includeActive: z.boolean().optional()
  }).optional()
});

export type GetSubmissionVersionsRequest = z.infer<typeof GetSubmissionVersionsRequestSchema>;

/**
 * Restore submission version request schema
 */
export const RestoreSubmissionVersionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required')
});

export type RestoreSubmissionVersionRequest = z.infer<typeof RestoreSubmissionVersionRequestSchema>;

/**
 * Get participation status request schema
 */
export const GetParticipationStatusRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required')
});

export type GetParticipationStatusRequest = z.infer<typeof GetParticipationStatusRequestSchema>;

/**
 * Get voting history request schema
 */
export const GetVotingHistoryRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  groupId: z.string().optional()
});

export type GetVotingHistoryRequest = z.infer<typeof GetVotingHistoryRequestSchema>;

/**
 * Confirm participation request schema
 *
 * SECURITY: submissionId is determined by backend, not frontend.
 * Backend automatically finds the latest 'submitted' submission for user's group.
 */
export const ConfirmParticipationRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  agree: z.boolean()
});

export type ConfirmParticipationRequest = z.infer<typeof ConfirmParticipationRequestSchema>;

/**
 * Force withdraw submission request schema (Teacher only)
 *
 * Allows teachers to force-withdraw any submission, including approved ones.
 * The reason is stored in eventlogs (not in submissions table) and sent via email.
 */
export const ForceWithdrawSubmissionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  submissionId: z.string().min(1, 'Submission ID is required'),
  reason: z.string()
    .min(10, '撤回原因至少需要 10 個字元')
    .max(500, '撤回原因不能超過 500 字元')
});

export type ForceWithdrawSubmissionRequest = z.infer<typeof ForceWithdrawSubmissionRequestSchema>;
