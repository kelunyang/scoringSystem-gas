/**
 * @fileoverview WebSocket Pinia Store for real-time notifications
 * Handles WebSocket connection, auto-reconnect, and event handling
 *
 * Migration from composable to Pinia store fixes:
 * 1. Memory leak: eventHandlers now cleared on disconnect
 * 2. Type safety: Proper TypeScript interfaces for messages with discriminated unions
 * 3. SSR safety: Store-based state management
 * 4. Better DevTools integration
 * 5. Token expiry handling: Auto-disconnect on token_expired/force_logout
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import type {
  WebSocketMessage,
  WebSocketEventHandler,
  MessageType,
  MessageData
} from '@/types/websocket'

// Re-export types for backward compatibility
export type { WebSocketMessage, WebSocketEventHandler, MessageType, MessageData }

/**
 * WebSocket Store
 * Manages global WebSocket connection state and events
 */
export const useWebSocketStore = defineStore('websocket', () => {
  // Vue 3 Best Practice: Use unified useAuth() composable
  const { token, clearAuth } = useAuth()

  // State
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const reconnectAttempts = ref(0)

  // Configuration
  const maxReconnectAttempts = 5
  const baseReconnectDelay = 1000
  const heartbeatInterval = 30000

  // Timers
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // Event handlers registry
  // Use any type for handler storage to allow different handler types
  const eventHandlers = new Map<string, Set<WebSocketEventHandler<any>>>()

  /**
   * Connect to WebSocket server
   */
  const connect = () => {
    if (isConnecting.value || isConnected.value) {
      return
    }

    if (!token.value) {
      console.warn('No session token found, skipping WebSocket connection')
      return
    }

    isConnecting.value = true

    try {
      // Determine WebSocket URL based on environment
      // Development: use same-origin (Vite proxy handles /ws)
      // Production: derive from VITE_API_URL (backend is on different domain)
      let wsUrl: string
      const apiUrl = import.meta.env.VITE_API_URL || ''

      if (import.meta.env.DEV || !apiUrl) {
        // Development: use same-origin with Vite proxy
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token.value)}`
      } else {
        // Production: derive WS URL from VITE_API_URL
        const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:'
        const apiHost = new URL(apiUrl).host
        wsUrl = `${wsProtocol}//${apiHost}/ws?token=${encodeURIComponent(token.value)}`
      }

      if (import.meta.env.DEV) {
        console.log('Connecting to WebSocket:', wsUrl)
      }

      ws.value = new WebSocket(wsUrl)

      // Connection opened
      ws.value.onopen = () => {
        if (import.meta.env.DEV) {
          console.log('WebSocket connected')
        }
        isConnected.value = true
        isConnecting.value = false
        reconnectAttempts.value = 0

        // Start heartbeat
        startHeartbeat()

        // Trigger connected event
        triggerEvent('connected', {})
      }

      // Message received
      ws.value.onmessage = (event: MessageEvent) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          if (import.meta.env.DEV) {
            console.log('WebSocket message:', message)
          }

          // Handle pong responses
          if (message.type === 'pong') {
            return
          }

          // Handle token expiry and forced logout
          if (message.type === 'token_expired' || message.type === 'force_logout') {
            const data = 'data' in message ? message.data : undefined
            console.warn(`WebSocket: ${message.type}`, data)

            // Disconnect WebSocket
            disconnect()

            // Clear authentication state (Vue 3 Best Practice)
            clearAuth()

            // Trigger event handlers BEFORE navigation
            // This allows components to show notification or cleanup
            triggerEvent(message.type, data)

            // Navigate to login page
            // Note: Using window.location instead of router to ensure full page reload
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = '/login'
              }, 100) // Small delay to allow event handlers to complete
            }

            return
          }

          // Trigger event handlers for all other messages
          const messageData = 'data' in message ? message.data : undefined
          triggerEvent(message.type, messageData)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      // Connection closed
      ws.value.onclose = (event: CloseEvent) => {
        if (import.meta.env.DEV) {
          console.log('WebSocket closed:', { code: event.code, reason: event.reason })
        }
        isConnected.value = false
        isConnecting.value = false

        // Stop heartbeat
        stopHeartbeat()

        // Trigger disconnected event
        triggerEvent('disconnected', { code: event.code, reason: event.reason })

        // Auto-reconnect if not intentional close
        if (event.code !== 1000) {
          scheduleReconnect()
        }
      }

      // Connection error
      ws.value.onerror = (error: Event) => {
        console.error('WebSocket error:', error)
        isConnecting.value = false

        // Trigger error event
        triggerEvent('error', { error })
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      isConnecting.value = false
      scheduleReconnect()
    }
  }

  /**
   * Disconnect from WebSocket server
   * FIX: Now properly clears event handlers to prevent memory leak
   */
  const disconnect = () => {
    if (ws.value) {
      stopHeartbeat()
      ws.value.close(1000, 'Client disconnect')
      ws.value = null
    }

    isConnected.value = false
    isConnecting.value = false
    reconnectAttempts.value = 0

    // FIX: Clear all event handlers to prevent memory leak
    eventHandlers.clear()

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = () => {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      console.error('Max reconnect attempts reached, giving up')
      triggerEvent('reconnect_failed', {})
      return
    }

    reconnectAttempts.value++

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      baseReconnectDelay * Math.pow(2, reconnectAttempts.value - 1),
      30000
    )

    if (import.meta.env.DEV) {
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`)
    }

    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  /**
   * Start heartbeat ping/pong
   */
  const startHeartbeat = () => {
    stopHeartbeat()

    heartbeatTimer = setInterval(() => {
      if (isConnected.value && ws.value?.readyState === WebSocket.OPEN) {
        send({ type: 'ping' })
      }
    }, heartbeatInterval)
  }

  /**
   * Stop heartbeat
   */
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  /**
   * Send a message to the server
   * FIX: Improved type safety with WebSocketMessage interface
   */
  const send = (message: WebSocketMessage) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message')
    }
  }

  /**
   * Register an event handler
   * Enhanced type safety with MessageType and MessageData
   *
   * @example
   * websocket.on('notification', (data) => {
   *   // data is automatically typed as NotificationData
   *   console.log(data.message)
   * })
   */
  const on = <T extends MessageType>(
    eventType: T,
    handler: WebSocketEventHandler<T>
  ) => {
    if (!eventHandlers.has(eventType)) {
      eventHandlers.set(eventType, new Set())
    }
    eventHandlers.get(eventType)!.add(handler as any)
  }

  /**
   * Unregister an event handler
   * Enhanced type safety with MessageType and MessageData
   */
  const off = <T extends MessageType>(
    eventType: T,
    handler: WebSocketEventHandler<T>
  ) => {
    if (!eventHandlers.has(eventType)) {
      return
    }

    const handlers = eventHandlers.get(eventType)
    if (handlers) {
      handlers.delete(handler as any)
    }
  }

  /**
   * Trigger event handlers
   */
  const triggerEvent = (eventType: string, data: any) => {
    if (!eventHandlers.has(eventType)) {
      return
    }

    const handlers = eventHandlers.get(eventType)
    handlers?.forEach((handler) => {
      try {
        // Type assertion needed due to generic handler storage
        ;(handler as (data: any) => void)(data)
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error)
      }
    })
  }

  // HMR cleanup (development only)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disconnect()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    })
  }

  return {
    // State
    isConnected,
    isConnecting,
    reconnectAttempts,

    // Methods
    connect,
    disconnect,
    send,
    on,
    off
  }
})
