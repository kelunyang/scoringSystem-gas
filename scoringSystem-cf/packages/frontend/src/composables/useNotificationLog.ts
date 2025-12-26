/**
 * 通知日誌 Composable（用戶隔離）
 * 提供響應式的通知日誌訪問和管理
 */

import { computed } from 'vue'
import { useAuth } from './useAuth'
import { getUserPreferences, setUserPreference } from '@/utils/userPreferences'
import type { NotificationEntry } from '@/types/utils'

/**
 * 最大通知數量
 */
const MAX_NOTIFICATIONS = 50

/**
 * 通知計數器（用於生成唯一ID）
 */
let notificationIdCounter = 0

/**
 * 全局當前用戶 ID（用於非 Vue 上下文）
 */
let globalCurrentUserId: string | null = null

/**
 * 用戶 ID 是否已就緒
 */
let isUserIdReady = false

/**
 * 待處理通知隊列（用於在 userId 初始化前暫存通知）
 */
let pendingNotifications: Array<Omit<NotificationEntry, 'id'>> = []

/**
 * 設置全局當前用戶 ID
 * @param userId - 用戶 ID
 */
export function setGlobalCurrentUserId(userId: string | null): void {
  globalCurrentUserId = userId

  // 當 userId 設置完成時，刷新待處理的通知
  if (userId && pendingNotifications.length > 0) {
    if (import.meta.env.DEV) {
      console.log(`[useNotificationLog] Flushing ${pendingNotifications.length} pending notifications for user ${userId}`)
    }

    // 刷新所有待處理通知
    pendingNotifications.forEach(entry => processNotification(entry))
    pendingNotifications = []
  }

  isUserIdReady = !!userId
}

/**
 * 內部函數：處理單個通知
 * @param entry - 通知條目
 */
function processNotification(entry: Omit<NotificationEntry, 'id'>): void {
  if (!globalCurrentUserId) {
    return
  }

  try {
    const newEntry: NotificationEntry = {
      ...entry,
      id: ++notificationIdCounter,
      timestamp: entry.timestamp || new Date()
    }

    const prefs = getUserPreferences(globalCurrentUserId)
    const currentLog = prefs.notificationLog || []
    const updatedLog = [newEntry, ...currentLog]
    const trimmedLog = updatedLog.slice(0, MAX_NOTIFICATIONS)

    setUserPreference(globalCurrentUserId, 'notificationLog', trimmedLog)
  } catch (error) {
    console.error('[processNotification] Failed:', error)
  }
}

/**
 * 全局添加通知函數（可在非 Vue 上下文中使用）
 * @param entry - 通知條目
 */
export function addNotificationGlobally(entry: Omit<NotificationEntry, 'id'>): void {
  // 如果 userId 尚未就緒，加入待處理隊列
  if (!globalCurrentUserId && !isUserIdReady) {
    if (import.meta.env.DEV) {
      console.log('[useNotificationLog] Queueing notification (userId not ready):', entry.message)
    }
    pendingNotifications.push(entry)
    return
  }

  // 如果 userId 已經初始化過但當前為 null（用戶已登出），直接返回
  if (!globalCurrentUserId) {
    return
  }

  // 正常處理通知
  processNotification(entry)
}

/**
 * 全局清除通知函數
 */
export function clearNotificationLogGlobally(): void {
  if (!globalCurrentUserId) {
    return
  }

  try {
    setUserPreference(globalCurrentUserId, 'notificationLog', [])
    if (localStorage.getItem('notificationLog')) {
      localStorage.removeItem('notificationLog')
    }
  } catch (error) {
    console.error('[clearNotificationLogGlobally] Failed:', error)
  }
}

/**
 * 通知日誌 Hook
 */
export function useNotificationLog() {
  const { userId } = useAuth()

  // 響應式通知日誌（從 userPreferences 計算）
  const log = computed<NotificationEntry[]>(() => {
    if (!userId.value) {
      return []
    }

    const prefs = getUserPreferences(userId.value)
    return prefs.notificationLog || []
  })

  /**
   * 添加通知到日誌
   * @param entry - 通知條目（不包含 id，會自動生成）
   */
  const addLog = (entry: Omit<NotificationEntry, 'id'>): void => {
    // 使用全局函數（會自動使用globalCurrentUserId）
    addNotificationGlobally(entry)
  }

  /**
   * 清除所有通知日誌
   */
  const clearLog = (): void => {
    // 使用全局函數
    clearNotificationLogGlobally()
  }

  /**
   * 刪除單個通知
   * @param id - 通知 ID
   */
  const removeLog = (id: number): void => {
    if (!userId.value) {
      return
    }

    try {
      const currentLog = log.value
      const updatedLog = currentLog.filter(entry => entry.id !== id)
      setUserPreference(userId.value, 'notificationLog', updatedLog)
    } catch (error) {
      console.error('[useNotificationLog] Failed to remove notification:', error)
    }
  }

  /**
   * 獲取通知數量
   */
  const count = computed(() => log.value.length)

  /**
   * 按級別過濾通知
   * @param level - 通知級別
   */
  const filterByLevel = (level: NotificationEntry['level']) => {
    return computed(() => log.value.filter(entry => entry.level === level))
  }

  return {
    /** 響應式通知日誌數組 */
    log,

    /** 通知數量 */
    count,

    /** 添加通知 */
    addLog,

    /** 清除所有通知 */
    clearLog,

    /** 刪除單個通知 */
    removeLog,

    /** 按級別過濾 */
    filterByLevel
  }
}
