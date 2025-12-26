/**
 * @fileoverview Zod schemas for project-related API endpoints
 * Provides runtime type validation for project management APIs
 */

import { z } from 'zod';
import { SessionIdSchema } from './common';

/**
 * Project data schema for creation
 */
export const ProjectDataSchema = z.object({
  projectName: z.string().min(1, 'Project name is required').max(200, 'Project name too long'),
  description: z.string().optional(),
  scoreRangeMin: z.number().optional(),
  scoreRangeMax: z.number().optional()
});

export type ProjectData = z.infer<typeof ProjectDataSchema>;

/**
 * Create project request schema
 */
export const CreateProjectRequestSchema = z.object({
  projectData: ProjectDataSchema
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/**
 * Get project request schema
 */
export const GetProjectRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type GetProjectRequest = z.infer<typeof GetProjectRequestSchema>;

/**
 * Project updates schema
 */
export const ProjectUpdatesSchema = z.object({
  projectName: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  scoreRangeMin: z.number().optional(),
  scoreRangeMax: z.number().optional()
});

export type ProjectUpdates = z.infer<typeof ProjectUpdatesSchema>;

/**
 * Update project request schema
 */
export const UpdateProjectRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  updates: ProjectUpdatesSchema
});

export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

/**
 * Delete project request schema
 */
export const DeleteProjectRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type DeleteProjectRequest = z.infer<typeof DeleteProjectRequestSchema>;

/**
 * Project list filters schema
 */
export const ProjectFiltersSchema = z.object({
  status: z.string().optional(),
  createdBy: z.string().optional(),
  tagId: z.string().optional(),
  includeStages: z.boolean().optional()
});

export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;

/**
 * List projects request schema
 */
export const ListProjectsRequestSchema = z.object({
  filters: ProjectFiltersSchema.optional()
});

export type ListProjectsRequest = z.infer<typeof ListProjectsRequestSchema>;

/**
 * Get project core request schema
 */
export const GetProjectCoreRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type GetProjectCoreRequest = z.infer<typeof GetProjectCoreRequestSchema>;

/**
 * Content type enum
 */
export const ContentTypeSchema = z.enum(['all', 'submissions', 'comments']);

export type ContentType = z.infer<typeof ContentTypeSchema>;

/**
 * Get project content request schema
 */
export const GetProjectContentRequestSchema = z.object({
  projectId: z.string().regex(/^proj_[a-f0-9-]{36}$/i, 'Invalid Project ID format'),
  stageId: z.string().regex(/^stg_[a-f0-9-]{36}$/i, 'Invalid Stage ID format'),
  contentType: ContentTypeSchema.optional().default('all'),
  excludeTeachers: z.boolean().optional(),
  excludeUserGroups: z.boolean().optional(),
  includeSubmitted: z.boolean().optional()
});

export type GetProjectContentRequest = z.infer<typeof GetProjectContentRequestSchema>;

/**
 * Clone project request schema
 */
export const CloneProjectRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  newProjectName: z.string().min(1, 'New project name is required').max(200, 'Project name too long')
});

export type CloneProjectRequest = z.infer<typeof CloneProjectRequestSchema>;

/**
 * List project viewers request schema
 */
export const ListProjectViewersRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});

export type ListProjectViewersRequest = z.infer<typeof ListProjectViewersRequestSchema>;

/**
 * Add project viewer request schema
 */
export const AddProjectViewerRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmail: z.string().email('Invalid email format'),
  role: z.enum(['teacher', 'observer', 'member'], {
    message: 'Role must be "teacher", "observer", or "member"'
  })
});

export type AddProjectViewerRequest = z.infer<typeof AddProjectViewerRequestSchema>;

/**
 * Remove project viewer request schema
 */
export const RemoveProjectViewerRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmail: z.string().email('Invalid email format')
});

export type RemoveProjectViewerRequest = z.infer<typeof RemoveProjectViewerRequestSchema>;

/**
 * Update project viewer role request schema
 */
export const UpdateProjectViewerRoleRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmail: z.string().email('Invalid email format'),
  role: z.enum(['teacher', 'observer', 'member'], {
    message: 'Role must be "teacher", "observer", or "member"'
  })
});

export type UpdateProjectViewerRoleRequest = z.infer<typeof UpdateProjectViewerRoleRequestSchema>;

/**
 * Add project viewers batch request schema
 */
export const AddProjectViewersBatchRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  viewers: z.array(
    z.object({
      userEmail: z.string().email('Invalid email format'),
      role: z.enum(['teacher', 'observer', 'member'], {
        message: 'Role must be "teacher", "observer", or "member"'
      })
    })
  ).min(1, 'At least one viewer is required').max(100, 'Maximum 100 viewers per batch')
});

export type AddProjectViewersBatchRequest = z.infer<typeof AddProjectViewersBatchRequestSchema>;

/**
 * Remove project viewers batch request schema
 */
export const RemoveProjectViewersBatchRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmails: z.array(
    z.string().email('Invalid email format')
  ).min(1, 'At least one viewer is required').max(100, 'Maximum 100 viewers per batch')
});

export type RemoveProjectViewersBatchRequest = z.infer<typeof RemoveProjectViewersBatchRequestSchema>;

/**
 * Update project viewers role batch request schema
 */
export const UpdateProjectViewersRoleBatchRequestSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  userEmails: z.array(
    z.string().email('Invalid email format')
  ).min(1, 'At least one viewer is required').max(100, 'Maximum 100 viewers per batch'),
  role: z.enum(['teacher', 'observer', 'member'], {
    message: 'Role must be "teacher", "observer", or "member"'
  })
});

export type UpdateProjectViewersRoleBatchRequest = z.infer<typeof UpdateProjectViewersRoleBatchRequestSchema>;
