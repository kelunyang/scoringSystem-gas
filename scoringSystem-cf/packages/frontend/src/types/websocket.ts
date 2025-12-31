/**
 * @fileoverview WebSocket Message Type Definitions
 * Provides type-safe WebSocket message handling with TypeScript discriminated unions
 */

/**
 * Notification data structure
 */
export interface NotificationData {
  type: string
  message?: string
  projectId?: string
  stageId?: string
  userId?: string
  data?: any
}

/**
 * Permission change data
 */
export interface PermissionChangeData {
  userId: string
  projectId?: string
  permissions: string[]
  reason?: string
}

/**
 * Account disabled data
 */
export interface AccountDisabledData {
  message: string
  reason?: string
  timestamp: string
}

/**
 * Force logout data
 */
export interface ForceLogoutData {
  reason: string
  message?: string
  timestamp: string
}

/**
 * System announcement data
 */
export interface SystemAnnouncementData {
  title: string
  message: string
  level: 'info' | 'warning' | 'error' | 'success'
  timestamp: string
  actionUrl?: string
}

/**
 * User data updated event
 */
export interface UserDataUpdatedData {
  userId: string
  fields: string[]
  reason?: string
}

/**
 * Settlement progress data
 */
export interface SettlementProgressData {
  projectId: string
  stageId: string
  progress: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  message?: string
  timestamp: string
}

/**
 * AI ranking progress data (for direct mode)
 */
export interface AIRankingProgressData {
  taskId: string
  callId: string
  projectId: string
  stageId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  message: string
  result?: {
    ranking: string[]
    reason: string
    thinkingProcess?: string
  }
}

/**
 * BT ranking progress data (for Bradley-Terry mode)
 */
export interface BTRankingProgressData {
  taskId: string
  callId: string
  projectId: string
  stageId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  currentComparison?: number
  totalComparisons?: number
  message: string
  currentPair?: { itemA: string; itemB: string }
  result?: {
    ranking: string[]
    reason: string
    btComparisons: Array<{
      index: number
      itemA: string
      itemB: string
      winner?: string
      reason?: string
    }>
    btStrengthParams: Record<string, number>
  }
}

/**
 * Multi-Agent provider result (for Free-MAD debate)
 */
export interface MultiAgentProviderResult {
  providerId: string
  providerName: string
  round1?: {
    ranking: string[]
    reason: string
  }
  round2?: {
    ranking: string[]
    reason: string
    changed: boolean
    critique?: string
  }
  status: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage?: string
}

/**
 * Multi-Agent debate detail (for final result)
 */
export interface MultiAgentDebateDetail {
  providerId: string
  providerName: string
  round1Ranking: string[]
  round1Reason: string
  round2Ranking: string[]
  round2Reason: string
  changed: boolean
  critique?: string
}

/**
 * Multi-Agent ranking progress data (for Free-MAD mode)
 */
export interface MultiAgentProgressData {
  taskId: string
  callId: string
  projectId: string
  stageId: string
  status: 'pending' | 'round1' | 'round2' | 'aggregating' | 'completed' | 'failed'
  progress: number
  currentRound?: 1 | 2
  message: string
  providerResults?: MultiAgentProviderResult[]
  result?: {
    ranking: string[]
    reason: string
    scores?: Record<string, number>
    debateDetails: MultiAgentDebateDetail[]
  }
}

/**
 * Connection error data
 */
export interface ConnectionErrorData {
  error: Event
  message?: string
}

/**
 * Disconnection data
 */
export interface DisconnectionData {
  code: number
  reason: string
}

/**
 * WebSocket Message Types (Discriminated Union)
 *
 * This provides full TypeScript type inference:
 * - When you check `message.type === 'notification'`, TypeScript knows `message.data` is NotificationData
 * - Auto-completion works for all message types
 * - Compile-time type safety for message handling
 */
export type WebSocketMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'connected'; data?: Record<string, never> }
  | { type: 'disconnected'; data: DisconnectionData }
  | { type: 'error'; data: ConnectionErrorData }
  | { type: 'reconnect_failed'; data?: Record<string, never> }
  | { type: 'notification'; data: NotificationData }
  | { type: 'permission_changed'; data: PermissionChangeData }
  | { type: 'account_disabled'; data: AccountDisabledData }
  | { type: 'force_logout'; data: ForceLogoutData }
  | { type: 'system_announcement'; data: SystemAnnouncementData }
  | { type: 'user_data_updated'; data: UserDataUpdatedData }
  | { type: 'settlement_progress'; data: SettlementProgressData }
  | { type: 'ai_ranking_progress'; data: AIRankingProgressData }
  | { type: 'bt_ranking_progress'; data: BTRankingProgressData }
  | { type: 'multi_agent_progress'; data: MultiAgentProgressData }
  | { type: 'token_expired'; data: { message: string; timestamp: string } }

/**
 * Extract message type from WebSocketMessage
 */
export type MessageType = WebSocketMessage['type']

/**
 * Extract data type for a specific message type
 */
export type MessageData<T extends MessageType> = Extract<
  WebSocketMessage,
  { type: T }
> extends { data: infer D }
  ? D
  : never

/**
 * Event handler type for specific message types
 */
export type WebSocketEventHandler<T extends MessageType = MessageType> = (
  data: MessageData<T>
) => void

/**
 * Type guard to check if a message has data
 */
export function hasMessageData(
  message: WebSocketMessage
): message is Extract<WebSocketMessage, { data: any }> {
  return 'data' in message && message.data !== undefined
}

/**
 * Example usage:
 *
 * ```typescript
 * import type { WebSocketMessage, MessageData } from '@/types/websocket'
 *
 * function handleMessage(message: WebSocketMessage) {
 *   switch (message.type) {
 *     case 'notification':
 *       // TypeScript knows message.data is NotificationData
 *       console.log(message.data.projectId)
 *       break
 *
 *     case 'force_logout':
 *       // TypeScript knows message.data is ForceLogoutData
 *       console.log(message.data.reason)
 *       break
 *   }
 * }
 *
 * // Type-safe event handlers
 * websocket.on('notification', (data: MessageData<'notification'>) => {
 *   // data is automatically typed as NotificationData
 *   console.log(data.message)
 * })
 * ```
 */
