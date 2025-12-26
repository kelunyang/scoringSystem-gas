import type { Env } from '../types';
/**
 * Event Logs Router
 * Migrated from GAS scripts/eventlogs_api.js
 *
 * Endpoints:
 * - POST /eventlogs/project - Get project event logs
 * - POST /eventlogs/user - Get user project event logs
 * - POST /eventlogs/resource - Get event resource details
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission } from '../middleware/permissions';
import {
  getProjectEventLogs,
  getUserProjectEventLogs,
  getEventResourceDetails,
  EventLogFilters
} from '../handlers/eventlogs/query';
import {
  GetProjectEventLogsRequestSchema,
  GetUserProjectEventLogsRequestSchema,
  GetEventResourceDetailsRequestSchema
} from '@repo/shared/schemas/eventlogs';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);

/**
 * Get event logs for a project with optional filters
 * Body: { sessionId, projectId, filters?: EventLogFilters }
 */
app.post(
  '/project',
  zValidator('json', GetProjectEventLogsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, filters } = body;

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view event logs',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getProjectEventLogs(
      c.env,
      projectId,
      filters as EventLogFilters
    );

    return response;
  }
);

/**
 * Get event logs for current user in a project
 * If user is a group leader, shows events for all group members
 * If user is just a member, shows only their own events
 * Body: { sessionId, projectId, filters?: EventLogFilters }
 */
app.post(
  '/user',
  zValidator('json', GetUserProjectEventLogsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, filters } = body;

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view event logs',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getUserProjectEventLogs(
      c.env,
      user.userEmail,
      projectId,
      filters as EventLogFilters
    );

    return response;
  }
);

/**
 * Get resource details (submission or comment) for event log expansion
 * Body: { sessionId, projectId, resourceType, resourceId }
 */
app.post(
  '/resource',
  zValidator('json', GetEventResourceDetailsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, resourceType, resourceId } = body;

    // Check permission: need at least 'view' permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view resource details',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getEventResourceDetails(
      c.env,
      user.userEmail,
      projectId,
      resourceType,
      resourceId
    );

    return response;
  }
);

export default app;
