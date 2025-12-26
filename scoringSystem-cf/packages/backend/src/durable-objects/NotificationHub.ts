/**
 * @fileoverview Durable Object for managing WebSocket connections
 * Handles real-time notifications, user updates, and system events
 */

import { verifyToken } from '../handlers/auth/jwt';
import type { SessionPayload } from '../handlers/auth/jwt';
import type { Env } from '../types';
import type { SettlementProgressData } from '@repo/shared/schemas/settlement';

/**
 * Notification data structure
 */
export interface NotificationData {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  timestamp?: number;
  [key: string]: any;
}

/**
 * System announcement data structure
 */
export interface SystemAnnouncementData {
  message: string;
  userId?: string;
  timestamp?: number;
  [key: string]: any;
}

/**
 * User data update structure
 */
export interface UserDataUpdate {
  field: string;
  value: any;
  timestamp?: number;
}

/**
 * WebSocket message types
 */
export type WebSocketMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'notification'; data: NotificationData }
  | { type: 'permission_changed'; data: { permissions: string[] } }
  | { type: 'account_disabled'; message: string }
  | { type: 'force_logout'; reason: string }
  | { type: 'system_announcement'; data: SystemAnnouncementData }
  | { type: 'user_data_updated'; data: UserDataUpdate }
  | { type: 'settlement_progress'; data: SettlementProgressData };

/**
 * Connection metadata
 */
interface ConnectionMetadata {
  userId: string;
  connectedAt: number;
  lastPing: number;
}

/**
 * Connection limits to prevent DoS attacks
 */
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_TOTAL_CONNECTIONS = 100;

/**
 * NotificationHub Durable Object
 * Manages WebSocket connections for a specific user
 * Supports Hibernatable WebSockets for cost optimization
 */
export class NotificationHub {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, ConnectionMetadata>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();

    // Restore hibernated connections
    const websockets = this.state.getWebSockets();
    if (websockets) {
      websockets.forEach((ws: WebSocket) => {
        const metadata = (ws as any).deserializeAttachment() as ConnectionMetadata;
        this.sessions.set(ws, metadata);
      });
    }
  }

  /**
   * Handle HTTP requests to establish WebSocket connections
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle internal broadcast requests (from settlement.ts, etc.)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const message = await request.json() as WebSocketMessage;
        console.log('[NotificationHub] Broadcasting to', this.sessions.size, 'connections');
        this.broadcast(message);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[NotificationHub] Broadcast error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Only accept WebSocket upgrade requests
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Check connection limits to prevent DoS
    if (this.sessions.size >= MAX_TOTAL_CONNECTIONS) {
      return new Response('Too many total connections', { status: 429 });
    }

    // Extract JWT token from query parameter or header
    const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return new Response('Missing authentication token', { status: 401 });
    }

    // Verify JWT token
    let payload: SessionPayload;
    try {
      payload = await verifyToken(token, this.env.JWT_SECRET);
    } catch (error) {
      return new Response('Invalid or expired token', { status: 401 });
    }

    // Check per-user connection limit
    const userConnections = Array.from(this.sessions.values())
      .filter(m => m.userId === payload.userId).length;

    if (userConnections >= MAX_CONNECTIONS_PER_USER) {
      return new Response(`Too many connections for user (max: ${MAX_CONNECTIONS_PER_USER})`, { status: 429 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    this.state.acceptWebSocket(server);

    // Store connection metadata
    const metadata: ConnectionMetadata = {
      userId: payload.userId,
      connectedAt: Date.now(),
      lastPing: Date.now()
    };

    this.sessions.set(server, metadata);
    (server as any).serializeAttachment(metadata);

    // Send welcome message
    this.send(server, {
      type: 'system_announcement',
      data: {
        message: '通知中心模組啟動',
        userId: payload.userId
      }
    });

    // Return the client WebSocket in the response
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const metadata = this.sessions.get(ws);
      if (!metadata) {
        ws.close(1008, 'Session not found');
        return;
      }

      // Parse message
      const data = typeof message === 'string' ? JSON.parse(message) : message;

      // Handle different message types
      switch (data.type) {
        case 'ping':
          // Respond with pong
          this.send(ws, { type: 'pong' });
          metadata.lastPing = Date.now();
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const metadata = this.sessions.get(ws);
    if (metadata) {
      console.log(`WebSocket closed for user ${metadata.userId}:`, { code, reason, wasClean });
      this.sessions.delete(ws);
    }
    ws.close(code, 'Connection closed');
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: Error) {
    const metadata = this.sessions.get(ws);
    if (metadata) {
      console.error(`WebSocket error for user ${metadata.userId}:`, error);
    }
    this.sessions.delete(ws);
  }

  /**
   * Send a message to a specific WebSocket
   */
  private send(ws: WebSocket, message: WebSocketMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  /**
   * Broadcast a message to all connected clients for this user
   */
  private broadcast(message: WebSocketMessage) {
    console.log('[NotificationHub] Broadcasting to', this.sessions.size, 'connections');
    this.sessions.forEach((metadata, ws) => {
      this.send(ws, message);
    });
  }

  /**
   * Public method for Queue consumers to broadcast messages
   * This replaces the previous HTTP /broadcast endpoint
   */
  broadcastMessage(message: WebSocketMessage): void {
    this.broadcast(message);
  }

  /**
   * Get active connection count
   */
  getConnectionCount(): number {
    return this.sessions.size;
  }

  /**
   * Alarm handler for periodic cleanup
   */
  async alarm() {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // Close stale connections
    this.sessions.forEach((metadata, ws) => {
      if (now - metadata.lastPing > TIMEOUT) {
        ws.close(1000, 'Connection timeout');
        this.sessions.delete(ws);
      }
    });

    // Schedule next alarm if there are active connections
    if (this.sessions.size > 0) {
      await this.state.storage.setAlarm(Date.now() + 60000); // 1 minute
    }
  }
}
