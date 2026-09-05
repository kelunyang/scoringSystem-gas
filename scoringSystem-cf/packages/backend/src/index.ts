/**
 * @fileoverview Main entry point for Cloudflare Workers application
 * Hono-based routing for Scoring System
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './types';
import type { MessageBatch } from '@cloudflare/workers-types';

// Import routers
import authRouter from './router/auth';
import systemRouter from './router/system';
import usersRouter from './router/users';
import invitationsRouter from './router/invitations';
import projectsRouter from './router/projects';
import groupsRouter from './router/groups';
import stagesRouter from './router/stages';
import submissionsRouter from './router/submissions';
import walletsRouter from './router/wallets';
import commentsRouter from './router/comments';
import scoringRouter from './router/scoring';
// DISABLED: Tags system has been disabled
// import tagsRouter from './router/tags';
import activityRouter from './router/activity';
import notificationsRouter from './router/notifications';
import adminRouter from './router/admin';
import ipRouter from './router/ip';
import settlementRouter from './router/settlement';
import maintenanceRouter from './router/maintenance';
import websocketRouter from './router/websocket';
import rankingsRouter from './router/rankings';
import announcementsRouter from './router/announcements';

// Import queue consumers
import emailQueue from './queues/email-consumer';
import notificationQueue from './queues/notification-consumer';
import loginEventsQueue from './queues/login-events-consumer';
import aiRankingQueue from './queues/ai-ranking-consumer';

const app = new Hono<{ Bindings: Env }>();

/**
 * Global middleware
 */

// CORS - Allow cross-origin requests
// Security: Use explicit origin whitelist instead of '*' when credentials: true
app.use('*', cors({
  origin: ['https://scoring.kelunyang.online', 'http://localhost:5173', 'http://localhost:8787'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id', 'X-Sudo-As', 'X-Sudo-Project'],
  exposeHeaders: ['Content-Length', 'X-Request-Id', 'X-New-Token'],
  maxAge: 86400,
  credentials: true
}));

// Logger - Log all requests
app.use('*', logger());

/**
 * Root endpoint with database status
 */
app.get('/', async (c) => {
  try {
    // Check database initialization
    let dbInitialized = false;
    try {
      const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
      dbInitialized = ((result?.count as number) || 0) > 0;
    } catch {
      dbInitialized = false;
    }

    const response: any = {
      name: 'Scoring System API',
      version: '1.0.0',
      status: 'healthy',
      database: dbInitialized ? 'initialized' : 'not_initialized',
      timestamp: Date.now()
    };

    if (!dbInitialized) {
      response.setup = {
        message: '⚠  Database not initialized',
        instructions: [
          '1. pnpm --filter @repo/backend db:migrate      # create the schema',
          '2. pnpm --filter @repo/backend init:local      # create the first admin'
        ]
      };
    }

    return c.json(response);
  } catch (error) {
    return c.json({
      name: 'Scoring System API',
      version: '1.0.0',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, 500);
  }
});

app.get('/health', async (c) => {
  try {
    // Check if database is initialized
    let dbInitialized = false;
    let userCount = 0;

    try {
      const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
      userCount = (result?.count as number) || 0;
      dbInitialized = userCount > 0;
    } catch {
      // Table doesn't exist or database error
      dbInitialized = false;
    }

    if (!dbInitialized) {
      return c.json({
        status: 'healthy',
        database: 'not_initialized',
        message: '⚠  Database not initialized. Run `db:migrate` then `init:local`.',
        timestamp: Date.now()
      });
    }

    return c.json({
      status: 'healthy',
      database: 'connected',
      initialized: true,
      userCount: userCount,
      timestamp: Date.now()
    });
  } catch (error) {
    return c.json({
      status: 'error',
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, 500);
  }
});

/**
 * API version endpoint
 */
app.get('/api', (c) => {
  return c.json({
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      projects: '/api/projects',
      stages: '/api/stages',
      submissions: '/api/submissions',
      wallets: '/api/wallets',
      comments: '/api/comments',
      scoring: '/api/scoring',
      rankings: '/api/rankings',
      groups: '/api/groups',
      invitations: '/api/invitations',
      // DISABLED: tags: '/api/tags',
      activity: '/api/activity',
      notifications: '/api/notifications',
      admin: '/api/admin',
      settlement: '/api/settlement',
      maintenance: '/api/maintenance',
      announcements: '/api/announcements'
    }
  });
});

/**
 * Mount routers
 * Each router handles a specific module of the application
 */

// Authentication routes (COMPLETED) - Using /api prefix to avoid conflict with frontend routes
app.route('/api/auth', authRouter);

// Admin routes (COMPLETED) - mounted at /api/admin to avoid conflict with frontend /admin route
// NOTE: Registered BEFORE /users to ensure /api/admin/users/* matches before /users/*
app.route('/api/admin', adminRouter);

// System management routes (COMPLETED) - Using /api prefix to match frontend RPC client
app.route('/api/system', systemRouter);

// User management routes (COMPLETED)
app.route('/api/users', usersRouter);

// Invitation routes (COMPLETED)
app.route('/api/invitations', invitationsRouter);

// Project management routes (COMPLETED)
app.route('/api/projects', projectsRouter);

// Group management routes (COMPLETED)
app.route('/api/groups', groupsRouter);

// Stage management routes (COMPLETED)
app.route('/api/stages', stagesRouter);

// Submission management routes (COMPLETED)
app.route('/api/submissions', submissionsRouter);

// Wallet management routes (COMPLETED)
app.route('/api/wallets', walletsRouter);

// Comment management routes (COMPLETED)
app.route('/api/comments', commentsRouter);

// Scoring routes (COMPLETED)
app.route('/api/scoring', scoringRouter);

// Rankings routes (COMPLETED)
app.route('/api/rankings', rankingsRouter);

// DISABLED: Tag management routes - tags system has been disabled
// app.route('/tags', tagsRouter);

// Activity logs routes (COMPLETED) - renamed from eventlogs to avoid ad blocker interference
app.route('/api/activity', activityRouter);

// Notification routes (COMPLETED)
app.route('/api/notifications', notificationsRouter);

// Settlement routes (COMPLETED)
app.route('/api/settlement', settlementRouter);

// Maintenance routes (COMPLETED - admin only)
app.route('/api/maintenance', maintenanceRouter);

// IP detection routes (for frontend - no auth required)
app.route('/api/ip', ipRouter);

// Announcements routes (public + admin)
app.route('/api/announcements', announcementsRouter);

// WebSocket routes (real-time notifications)
app.route('/ws', websocketRouter);

/**
 * 404 handler
 */
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      path: c.req.path
    }
  }, 404);
});

// Import SudoWriteBlockedError for special handling
import { SudoWriteBlockedError } from './utils/sudo-db-proxy';

/**
 * Global error handler
 */
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  // Special handling for SudoWriteBlockedError - return 403 with clear message
  // Check both instanceof and error properties for robustness across module boundaries
  if (err instanceof SudoWriteBlockedError ||
      err.name === 'SudoWriteBlockedError' ||
      err.message?.includes('SUDO_NO_WRITE')) {
    return c.json({
      success: false,
      error: {
        code: 'SUDO_NO_WRITE',
        message: 'SUDO 模式為唯讀，無法進行寫入操作'
      }
    }, 403);
  }

  // Handle HTTPException - preserve original status code
  // This is important for validation errors (400), auth errors (401/403), etc.
  if (err instanceof HTTPException) {
    return c.json({
      success: false,
      error: {
        code: `HTTP_${err.status}`,
        message: err.message
      }
    }, err.status);
  }

  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(c.env.ENVIRONMENT === 'development' && {
        details: err.message,
        stack: err.stack
      })
    }
  }, 500);
});

// Note: Sudo DB proxy is now applied in auth middleware AFTER authentication
// This allows session maintenance (lastActivityTime update) to work

/**
 * Export the Worker handlers
 * - fetch: HTTP request handler (Hono app)
 * - queue: Queue message handler (routes to appropriate consumer)
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Create a mutable copy of env so auth middleware can swap DB with sudo-safe proxy
    // This allows session maintenance to work before sudo mode is activated
    const mutableEnv = { ...env };
    return app.fetch(request, mutableEnv, ctx);
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const queueName = batch.queue;

    console.log(`[Queue Router] Processing batch from queue: ${queueName} (${batch.messages.length} messages)`);

    try {
      switch (queueName) {
        case 'email-queue':
          await emailQueue.queue(batch as any, env);
          break;
        case 'notification-queue':
          await notificationQueue.queue(batch as any, env);
          break;
        case 'login-events-queue':
          await loginEventsQueue.queue(batch as any, env);
          break;
        case 'ai-ranking-queue':
          await aiRankingQueue.queue(batch as any, env);
          break;
        default:
          console.error(`[Queue Router] ❌ Unknown queue: ${queueName}`);
          throw new Error(`Unknown queue: ${queueName}`);
      }

      console.log(`[Queue Router] ✅ Successfully processed batch from ${queueName}`);
    } catch (error) {
      console.error(`[Queue Router] ❌ Error processing ${queueName}:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }
};

/**
 * Export app type for RPC client type inference
 * This allows the frontend to have full type safety when calling APIs
 */
export type AppType = typeof app;

/**
 * Export the Durable Object classes.
 *
 * REQUIRED: the runtime resolves `durable_objects.bindings` in wrangler.toml
 * against the classes this entry point exports. Dropping this line makes
 * `wrangler deploy` fail with "does not export class 'NotificationHub' which is
 * depended on by existing Durable Objects" — and nothing catches it earlier:
 * tsc is happy, the bundle builds, and `--dry-run` does not check it either.
 */
export { NotificationHub } from './durable-objects/NotificationHub';

/**
 * Export Queue Consumers (for type inference and testing)
 */
export { emailQueue, notificationQueue, loginEventsQueue, aiRankingQueue };
