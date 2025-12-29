/**
 * @fileoverview Admin 統計數據類型定義
 * 用於 SystemSettings 和相關的統計數據管理
 */

import type { LogStatistics } from '@repo/shared/types/admin'

/**
 * 系統統計數據
 */
export interface SystemStats {
  /** 總用戶數 */
  totalUsers: number
  /** 活躍用戶數 */
  activeUsers: number
  /** 停用用戶數 */
  inactiveUsers: number
  /** 總專案數 */
  totalProjects: number
  /** 進行中的專案數 */
  activeProjects: number
  /** 已完成的專案數 */
  completedProjects: number
  /** 總群組數 */
  totalGroups: number
  /** 活躍群組數 */
  activeGroups: number
  /** 系統運行時間 */
  uptime?: string
  /** 資料庫狀態 */
  dbStatus?: string
  /** 最後更新時間（由 composable 設定，總是有值）*/
  lastUpdate: number
}

/**
 * 邀請碼統計數據
 */
export interface InvitationStats {
  /** 總邀請碼數 */
  total: number
  /** 有效的邀請碼數 */
  active: number
  /** 已使用的邀請碼數 */
  used: number
  /** 已過期的邀請碼數 */
  expired: number
}

/**
 * 邀請碼項目
 */
export interface InvitationCode {
  /** 邀請碼 ID */
  inviteId: string
  /** 邀請碼字串 */
  inviteCode: string
  /** 狀態 */
  status: 'active' | 'used' | 'expired'
  /** 創建者 ID */
  creatorId: string
  /** 創建時間 */
  createdTime: number
  /** 過期時間 */
  expiryTime: number
  /** 受邀者 Email (可選) */
  inviteeEmail?: string
  /** 使用者 ID (如已使用) */
  usedById?: string
  /** 使用時間 (如已使用) */
  usedAt?: number
  /** 元數據 */
  metadata?: Record<string, any>
}

/**
 * 日誌統計數據
 * @deprecated Use `LogStatistics` from `@repo/shared/types/admin` instead.
 * This type is kept for backward compatibility only.
 */
export type LogStats = LogStatistics

/**
 * 系統日誌項目
 */
export interface SystemLog {
  /** 時間戳 */
  timestamp: number
  /** 日誌等級 */
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
  /** 函數名稱 */
  functionName: string
  /** 操作 */
  action: string
  /** 用戶 ID */
  userId?: string
  /** 詳細信息 */
  details: string
  /** 執行時間 (ms) */
  executionTime?: number
}

/**
 * 日誌過濾器
 */
export interface LogFilters {
  /** 顯示數量限制 */
  limit: number
  /** 等級篩選 */
  level: '' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
  /** 類型篩選 */
  category: '' | 'robot' | 'auth' | 'api' | 'other'
  /** 搜尋關鍵字 */
  search: string
}

/**
 * 日誌數據響應
 */
export interface LogDataResponse {
  /** 日誌列表 */
  logs: SystemLog[]
  /** 總數 */
  total: number
  /** 是否有更多 */
  hasMore: boolean
}

/**
 * 全部統計數據 (組合型別)
 */
export interface AllStats {
  /** 系統統計 */
  system: SystemStats
  /** 邀請碼統計 */
  invitations: InvitationStats
  /** 日誌統計 */
  logs: LogStatistics
}
