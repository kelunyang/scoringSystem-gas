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
import eventlogsRouter from './router/eventlogs';
import notificationsRouter from './router/notifications';
import adminRouter from './router/admin';
import ipRouter from './router/ip';
import settlementRouter from './router/settlement';
import maintenanceRouter from './router/maintenance';
import websocketRouter from './router/websocket';
// REMOVED: Security Patrol Robot (replaced with queue-based login security)
// import securityPatrolWsRouter from './router/security-patrol-ws';
import rankingsRouter from './router/rankings';
import announcementsRouter from './router/announcements';

// Import queue consumers
import emailQueue from './queues/email-consumer';
import notificationQueue from './queues/notification-consumer';
import settlementQueue from './queues/settlement-consumer';
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
          '1. Call POST /auth/init-system to initialize database',
          '2. Optional: Provide custom admin credentials in request body',
          '3. Default admin: email=admin@system.local, password=admin123456'
        ],
        endpoint: '/auth/init-system',
        exampleCurl: 'curl -X POST http://localhost:8787/auth/init-system -H "Content-Type: application/json"'
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
    } catch (error) {
      // Table doesn't exist or database error
      dbInitialized = false;
    }

    if (!dbInitialized) {
      return c.json({
        status: 'healthy',
        database: 'not_initialized',
        message: '⚠  Database not initialized. Please call POST /auth/init-system to initialize.',
        initEndpoint: '/auth/init-system',
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
      eventlogs: '/api/eventlogs',
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

// Event logs routes (COMPLETED)
app.route('/api/eventlogs', eventlogsRouter);

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
// REMOVED: Security Patrol Robot WebSocket endpoint
// app.route('/ws/security-patrol', securityPatrolWsRouter);

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
        case 'settlement-queue':
          await settlementQueue.queue(batch as any, env);
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
 * Scheduled Event Handler (Cron Triggers)
 * Uncomment this handler when you enable cron triggers in wrangler.toml
 *
 * This handler is called when a cron trigger fires
 * Currently configured for:
 * - Notification Patrol Robot (every 12 hours)
 * - Security Patrol Robot (daily, configurable interval via settings)
 *
 * IMPORTANT: The KV securityRobotInterval config provides a secondary throttling layer.
 * - wrangler.toml cron: Fixed schedule (e.g., daily at midnight)
 * - KV config: Dynamic interval check (e.g., only run every 3 days)
 * This allows admins to adjust frequency without redeployment.
 */
// export default {
//   ...app,
//   async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
//     console.log('Cron trigger fired at:', new Date(event.scheduledTime).toISOString());
//     const cron = event.cron; // Cron expression that triggered this execution
//
//     try {
//       // Execute Notification Patrol (runs every 12 hours)
//       if (cron === '0 */12 * * *') {
//         console.log('🔔 Executing Notification Patrol...');
//         const { executeNotificationPatrol } = await import('./handlers/robots/notification-patrol');
//
//         const result = await executeNotificationPatrol(env, {
//           timeWindowHours: 12,
//           dryRun: false
//         });
//
//         const response = await result.json();
//         console.log('Notification patrol result:', response);
//
//         if (response.success) {
//           console.log(`✅ Notification patrol completed: ${response.data.emailsSent} emails sent`);
//         } else {
//           console.error('❌ Notification patrol failed:', response.error);
//         }
//       }
//
//       // Execute Security Patrol (runs daily, checks interval config)
//       if (cron === '0 0 * * *') {
//         console.log('🔒 Checking Security Patrol schedule...');
//
//         // Check if it's time to run based on configured interval
//         const statusStr = await env.CONFIG.get('robot_status_security_patrol');
//         const configStr = await env.CONFIG.get('securityRobotInterval');
//
//         let shouldRun = false;
//
//         if (statusStr && configStr) {
//           const status = JSON.parse(statusStr);
//           const config = JSON.parse(configStr);
//           const intervalMs = (config.intervalDays || 1) * 24 * 60 * 60 * 1000;
//
//           if (!status.lastRun) {
//             // Never run before - execute now
//             shouldRun = true;
//           } else {
//             const timeSinceLastRun = Date.now() - status.lastRun;
//             if (timeSinceLastRun >= intervalMs) {
//               shouldRun = true;
//             }
//           }
//         } else {
//           // No config found - run with default (daily)
//           shouldRun = true;
//         }
//
//         if (shouldRun) {
//           console.log('⚡ Executing Security Patrol...');
//           const { executeSecurityPatrol } = await import('./handlers/robots/security-patrol');
//
//           const result = await executeSecurityPatrol(env, {
//             timeWindowHours: 24,
//             dryRun: false
//           });
//
//           const response = await result.json();
//           console.log('Security patrol result:', response);
//
//           if (response.success) {
//             console.log(`✅ Security patrol completed: ${response.data.suspiciousLogins.length} suspicious logins found, ${response.data.emailsSent} emails sent`);
//           } else {
//             console.error('❌ Security patrol failed:', response.error);
//           }
//         } else {
//           console.log('⏭️  Skipping security patrol - not yet time based on configured interval');
//         }
//       }
//     } catch (error) {
//       console.error('Cron handler error:', error);
//     }
//   }
// };

/**
 * Export Durable Objects
 */
export { NotificationHub } from './durable-objects/NotificationHub';

/**
 * Export Queue Consumers (for type inference and testing)
 */
export { emailQueue, notificationQueue, settlementQueue, loginEventsQueue, aiRankingQueue };
