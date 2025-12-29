/**
 * @fileoverview Zod schemas for stage-related API endpoints
 * Provides runtime type validation for stage management APIs
 */

import { z } from 'zod';

/**
 * Stage data schema for creation
 */
export const StageDataSchema = z.object({
  stageName: z.string().min(1, 'Stage name is required').max(200, 'Stage name too long'),
  description: z.string().optional(),
  startTime: z.number().int().positive('Start time must be a positive timestamp'),
  endTime: z.number().int().positive('End time must be a positive timestamp'),
  reportRewardPool: z.number().int().nonnegative().optional(),
  commentRewardPool: z.number().int().nonnegative().optional(),
  allowLateSubmit: z.boolean().optional(),
  maxSubmissionsPerUser: z.number().int().positive().optional(),
  requiresApproval: z.boolean().optional(),
  votingEnabled: z.boolean().optional(),
  votesPerUser: z.number().int().positive().optional(),
  autoApproveSubmissions: z.boolean().optional()
});

export type StageData = z.infer<typeof StageDataSchema>;

/**
 * Create stage request schema
 */
export const CreateStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageData: StageDataSchema
});

export type CreateStageRequest = z.infer<typeof CreateStageRequestSchema>;

/**
 * Get stage request schema
 */
export const GetStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetStageRequest = z.infer<typeof GetStageRequestSchema>;

/**
 * Stage updates schema
 */
export const StageUpdatesSchema = z.object({
  stageName: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  startTime: z.number().int().positive().optional(),
  endTime: z.number().int().positive().optional(),
  status: z.enum(['pending', 'active', 'voting', 'completed', 'archived']).optional(),
  stageOrder: z.number().int().positive().optional(),
  reportRewardPool: z.number().int().nonnegative().optional(),
  commentRewardPool: z.number().int().nonnegative().optional(),
  allowLateSubmit: z.boolean().optional(),
  maxSubmissionsPerUser: z.number().int().positive().optional(),
  requiresApproval: z.boolean().optional(),
  votingEnabled: z.boolean().optional(),
  votesPerUser: z.number().int().positive().optional(),
  autoApproveSubmissions: z.boolean().optional()
});

export type StageUpdates = z.infer<typeof StageUpdatesSchema>;

/**
 * Update stage request schema
 */
export const UpdateStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  updates: StageUpdatesSchema
});

export type UpdateStageRequest = z.infer<typeof UpdateStageRequestSchema>;

/**
 * List stages request schema
 */
export const ListStagesRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  includeArchived: z.boolean().optional().default(false)
});

export type ListStagesRequest = z.infer<typeof ListStagesRequestSchema>;

/**
 * Clone stage request schema
 */
export const CloneStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  newStageName: z.string().min(1, 'New stage name is required').max(200, 'Stage name too long'),
  startTime: z.number().int().positive().optional(),
  endTime: z.number().int().positive().optional()
});

export type CloneStageRequest = z.infer<typeof CloneStageRequestSchema>;

/**
 * Clone stage to multiple projects request schema
 * Allows cloning a stage to multiple target projects atomically
 */
export const CloneStageToProjectsRequestSchema = z.object({
  sourceProjectId: z.string().min(1, 'Source project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  newStageName: z.string().min(1, 'New stage name is required').max(200, 'Stage name too long'),
  targetProjectIds: z.array(z.string().min(1)).min(1, 'At least one target project is required'),
  startTime: z.number().int().positive().optional(),
  endTime: z.number().int().positive().optional()
});

export type CloneStageToProjectsRequest = z.infer<typeof CloneStageToProjectsRequestSchema>;

/**
 * Check voting lock request schema
 */
export const CheckVotingLockRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type CheckVotingLockRequest = z.infer<typeof CheckVotingLockRequestSchema>;

/**
 * Force stage transition request schema
 * Forces a stage into voting status by setting forceVotingTime timestamp
 * No longer requires newStatus parameter (implicitly sets status to 'voting')
 */
export const ForceStageTransitionRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type ForceStageTransitionRequest = z.infer<typeof ForceStageTransitionRequestSchema>;

/**
 * Get stage config request schema
 */
export const GetStageConfigRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type GetStageConfigRequest = z.infer<typeof GetStageConfigRequestSchema>;

/**
 * Update stage config request schema
 */
export const UpdateStageConfigRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  configUpdates: z.record(z.string(), z.any())
});

export type UpdateStageConfigRequest = z.infer<typeof UpdateStageConfigRequestSchema>;

/**
 * Reset stage config request schema
 */
export const ResetStageConfigRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type ResetStageConfigRequest = z.infer<typeof ResetStageConfigRequestSchema>;

/**
 * Pause stage request schema
 * Pauses a stage that is currently active or voting
 */
export const PauseStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required'),
  reason: z.string().min(1, '請輸入暫停原因').max(500, '暫停原因不可超過500字')
});

export type PauseStageRequest = z.infer<typeof PauseStageRequestSchema>;

/**
 * Resume stage request schema
 * Resumes a paused stage
 */
export const ResumeStageRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  stageId: z.string().min(1, 'Stage ID is required')
});

export type ResumeStageRequest = z.infer<typeof ResumeStageRequestSchema>;
