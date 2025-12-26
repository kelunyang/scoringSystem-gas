/**
 * System Maintenance Router
 * Manual triggers for cleanup and maintenance tasks
 *
 * Note: Refactored (2025-12-08) - Stage status is now auto-calculated via VIEWs,
 * no sync needed. This router is reserved for future maintenance endpoints.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { requireSystemAdmin } from '../middleware/permissions';

const maintenanceRouter = new Hono<{ Bindings: Env }>();

// All maintenance routes require system admin permission
maintenanceRouter.use('*', authMiddleware, requireSystemAdmin);






export default maintenanceRouter;
