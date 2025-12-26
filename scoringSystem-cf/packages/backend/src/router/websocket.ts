/**
 * @fileoverview WebSocket router for real-time notifications
 * Handles WebSocket upgrade requests and routes to Durable Objects
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyToken } from '../handlers/auth/jwt';

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
    return c.json({
      success: false,
      error: 'Expected WebSocket upgrade request',
      code: 'NOT_WEBSOCKET'
    }, 426); // 426 Upgrade Required
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
    return c.json({
      success: false,
      error: 'Missing authentication token',
      code: 'NO_TOKEN'
    }, 401);
  }

  try {
    // Verify JWT token
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (!payload.userId) {
      return c.json({
        success: false,
        error: 'Invalid token payload',
        code: 'INVALID_TOKEN'
      }, 401);
    }

    // Get user's NotificationHub Durable Object
    const id = c.env.NOTIFICATION_HUB.idFromName(payload.userId);
    const stub = c.env.NOTIFICATION_HUB.get(id);

    // Forward the WebSocket upgrade request to the Durable Object
    // The Durable Object will handle the WebSocket connection
    return stub.fetch(c.req.raw);

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return c.json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 401);
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
