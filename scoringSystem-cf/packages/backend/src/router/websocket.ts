/**
 * @fileoverview WebSocket router for real-time notifications
 * Handles WebSocket upgrade requests and routes to Durable Objects
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyToken } from '../handlers/auth/jwt';
import { errorResponse } from '../utils/response';

const router = new Hono<{ Bindings: Env }>();

/**
 * WebSocket upgrade endpoint
 * GET /ws?token=<jwt_token>
 *
 * Accepts WebSocket upgrade requests with JWT authentication.
 * Routes the connection to the user's NotificationHub Durable Object.
 */
router.get('/', async (c) => {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    // NOT_WEBSOCKET maps to 426 Upgrade Required
    return errorResponse('NOT_WEBSOCKET', 'Expected WebSocket upgrade request');
  }

  // Extract JWT token from query parameter or Authorization header
  let token = c.req.query('token');
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return errorResponse('NO_TOKEN', 'Missing authentication token');
  }

  try {
    // Verify JWT token
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (!payload.userId) {
      return errorResponse('INVALID_TOKEN', 'Invalid token payload');
    }

    // Get user's NotificationHub Durable Object
    const id = c.env.NOTIFICATION_HUB.idFromName(payload.userId);
    const stub = c.env.NOTIFICATION_HUB.get(id);

    // Forward the WebSocket upgrade request to the Durable Object
    // The Durable Object will handle the WebSocket connection
    return stub.fetch(c.req.raw);

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return errorResponse('AUTH_FAILED', 'Authentication failed', {
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * WebSocket status endpoint
 * GET /ws/status
 *
 * Returns the health status of the WebSocket service.
 */
router.get('/status', async (c) => {
  return c.json({
    success: true,
    data: {
      service: 'WebSocket',
      status: 'operational',
      timestamp: Date.now(),
      features: {
        realTimeNotifications: true,
        settlementProgress: true,
        permissionSync: true,
        systemAnnouncements: true
      }
    }
  });
});

export default router;
