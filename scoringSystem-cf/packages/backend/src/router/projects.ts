import type { Env } from '../types';
/**
 * Project Management Router
 * Migrated from GAS scripts/projects_api.js
 *
 * Endpoints:
 * - POST /projects/create - Create new project
 * - POST /projects/get - Get project details
 * - POST /projects/update - Update project
 * - POST /projects/delete - Delete (archive) project
 * - POST /projects/list - List user's projects
 * - POST /projects/list-with-stages - List user's projects with stages
 * - POST /projects/core - Get project core data
 * - POST /projects/content - Get project content data
 * - POST /projects/clone - Clone existing project
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { createProject, cloneProject } from '../handlers/projects/create';
import {
  getProject,
  updateProject,
  deleteProject
} from '../handlers/projects/manage';
import {
  listUserProjects,
  getProjectCore,
  getProjectContent
} from '../handlers/projects/list';
import {
  listProjectViewers,
  addProjectViewer,
  addProjectViewersBatch,
  removeProjectViewer,
  removeProjectViewersBatch,
  updateProjectViewerRole,
  updateProjectViewersRoleBatch,
  markUnassignedMembers
} from '../handlers/projects/viewers';
import { scoringConfigRouter } from '../handlers/projects/scoring-config';
import {
  CreateProjectRequestSchema,
  GetProjectRequestSchema,
  UpdateProjectRequestSchema,
  DeleteProjectRequestSchema,
  ListProjectsRequestSchema,
  GetProjectCoreRequestSchema,
  GetProjectContentRequestSchema,
  CloneProjectRequestSchema,
  ListProjectViewersRequestSchema,
  AddProjectViewerRequestSchema,
  AddProjectViewersBatchRequestSchema,
  RemoveProjectViewerRequestSchema,
  RemoveProjectViewersBatchRequestSchema,
  UpdateProjectViewerRoleRequestSchema,
  UpdateProjectViewersRoleBatchRequestSchema
} from '@repo/shared/schemas/projects';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Create new project
 * Body: { projectData: { projectName, description, scoreRangeMin?, scoreRangeMax? } }
 */
app.post(
  '/create',
  zValidator('json', CreateProjectRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await createProject(
      c.env,
      user.userEmail,
      {
        ...body.projectData,
        description: body.projectData.description || ''
      }
    );

    return response;
  }
);

/**
 * Get project details
 * Body: { projectId }
 */
app.post(
  '/get',
  zValidator('json', GetProjectRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getProject(
      c.env,
      user.userEmail,
      body.projectId
    );

    return response;
  }
);

/**
 * Update project
 * Body: { projectId, updates: { projectName?, description?, status?, scoreRangeMin?, scoreRangeMax? } }
 */
app.post(
  '/update',
  zValidator('json', UpdateProjectRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await updateProject(
      c.env,
      user.userEmail,
      body.projectId,
      body.updates
    );

    return response;
  }
);

/**
 * Delete (archive) project
 * Body: { projectId }
 */
app.post(
  '/delete',
  zValidator('json', DeleteProjectRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await deleteProject(
      c.env,
      user.userEmail,
      body.projectId
    );

    return response;
  }
);

/**
 * List user's projects
 * Body: { filters?: { status?, createdBy?, tagId?, includeStages? } }
 */
app.post(
  '/list',
  zValidator('json', ListProjectsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await listUserProjects(
      c.env,
      user.userEmail,
      body.filters || {}
    );

    return response;
  }
);

/**
 * List user's projects with stages (convenience endpoint)
 * Body: { filters?: { status?, createdBy?, tagId? } }
 */
app.post(
  '/list-with-stages',
  zValidator('json', ListProjectsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Force includeStages to true
    const filtersWithStages = { ...(body.filters || {}), includeStages: true };

    const response = await listUserProjects(
      c.env,
      user.userEmail,
      filtersWithStages
    );

    return response;
  }
);

/**
 * Get project core data
 * Body: { projectId }
 */
app.post(
  '/core',
  zValidator('json', GetProjectCoreRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await getProjectCore(
      c.env,
      user.userEmail,
      body.projectId
    );

    return response;
  }
);

/**
 * Get project content data
 * Body: { projectId, stageId, contentType?, excludeTeachers?, excludeUserGroups?, includeSubmitted? }
 */
app.post(
  '/content',
  zValidator('json', GetProjectContentRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    console.log('📋 [GET /projects/content] Request:', {
      projectId: body.projectId,
      stageId: body.stageId,
      contentType: body.contentType,
      excludeTeachers: body.excludeTeachers || false,
      excludeUserGroups: body.excludeUserGroups || false,
      includeSubmitted: body.includeSubmitted || false,
      userEmail: user.userEmail
    });

    const response = await getProjectContent(
      c.env,
      user.userEmail,
      body.projectId,
      body.stageId,
      body.contentType || 'all',
      {
        excludeTeachers: Boolean(body.excludeTeachers),
        excludeUserGroups: Boolean(body.excludeUserGroups),
        includeSubmitted: Boolean(body.includeSubmitted)
      }
    );

    return response;
  }
);

/**
 * Clone existing project
 * Body: { projectId, newProjectName }
 */
app.post(
  '/clone',
  zValidator('json', CloneProjectRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await cloneProject(
      c.env,
      user.userEmail,
      body.projectId,
      body.newProjectName
    );

    return response;
  }
);

/**
 * List project viewers
 * Body: { projectId }
 */
app.post(
  '/viewers/list',
  zValidator('json', ListProjectViewersRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await listProjectViewers(
      c.env,
      user.userEmail,
      body.projectId
    );

    return response;
  }
);

/**
 * Add project viewer
 * Body: { projectId, userEmail, role }
 */
app.post(
  '/viewers/add',
  zValidator('json', AddProjectViewerRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await addProjectViewer(
      c.env,
      user.userEmail,
      body.projectId,
      body.userEmail,
      body.role as 'teacher' | 'observer' | 'member'
    );

    return response;
  }
);

/**
 * Add project viewers in batch
 * Body: { projectId, viewers: [{ userEmail, role }] }
 */
app.post(
  '/viewers/add-batch',
  zValidator('json', AddProjectViewersBatchRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await addProjectViewersBatch(
      c.env,
      user.userEmail,
      body.projectId,
      body.viewers as Array<{ userEmail: string; role: 'teacher' | 'observer' | 'member' }>
    );

    return response;
  }
);

/**
 * Remove project viewer
 * Body: { projectId, userEmail }
 */
app.post(
  '/viewers/remove',
  zValidator('json', RemoveProjectViewerRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await removeProjectViewer(
      c.env,
      user.userEmail,
      body.projectId,
      body.userEmail
    );

    return response;
  }
);

/**
 * Update project viewer role
 * Body: { projectId, userEmail, role }
 */
app.post(
  '/viewers/update-role',
  zValidator('json', UpdateProjectViewerRoleRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await updateProjectViewerRole(
      c.env,
      user.userEmail,
      body.projectId,
      body.userEmail,
      body.role as 'teacher' | 'observer' | 'member'
    );

    return response;
  }
);

/**
 * Remove project viewers in batch
 * Body: { projectId, userEmails: string[] }
 */
app.post(
  '/viewers/remove-batch',
  zValidator('json', RemoveProjectViewersBatchRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await removeProjectViewersBatch(
      c.env,
      user.userEmail,
      body.projectId,
      body.userEmails
    );

    return response;
  }
);

/**
 * Update project viewers role in batch
 * Body: { projectId, userEmails: string[], role }
 */
app.post(
  '/viewers/update-roles-batch',
  zValidator('json', UpdateProjectViewersRoleBatchRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await updateProjectViewersRoleBatch(
      c.env,
      user.userEmail,
      body.projectId,
      body.userEmails,
      body.role as 'teacher' | 'observer' | 'member'
    );

    return response;
  }
);

/**
 * Mark unassigned members - find members who are in projectviewers but not in any group
 * Body: { projectId }
 */
app.post(
  '/viewers/mark-unassigned',
  zValidator('json', ListProjectViewersRequestSchema), // Reuse schema (same { projectId })
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const response = await markUnassignedMembers(
      c.env,
      user.userEmail,
      body.projectId
    );

    return response;
  }
);

/**
 * Mount scoring configuration router
 * Provides endpoints for managing scoring system configuration:
 * - GET /:projectId/scoring-config
 * - PUT /:projectId/scoring-config
 * - GET /system/scoring-defaults
 * - PUT /system/scoring-defaults
 */
app.route('/', scoringConfigRouter);

export default app;
