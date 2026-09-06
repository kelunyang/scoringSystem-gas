/**
 * @fileoverview 工具函数类型定义
 */

/**
 * JWT 载荷类型
 */
export interface JWTPayload {
  userId: string
  userEmail: string
  displayName: string
  status: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string
  permissions?: string[]
  iat?: number
  exp?: number
}

/**
 * 錯誤日誌條目
 */
export interface ErrorLogEntry {
  timestamp: Date
  type: string
  title: string
  action: string
  message: string
  error: unknown
}

/**
 * 通知日誌條目
 */
export interface NotificationEntry {
  id: number
  timestamp: Date
  message: string
  level: 'error' | 'warning' | 'success' | 'info'
  type: string
  context: Record<string, unknown>
  stack?: string | null
}
