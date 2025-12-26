/**
 * useDrawerAlerts - Drawer Alert 統一管理 Composable
 *
 * 提供統一的 drawer alert 狀態管理和操作方法
 * 支持多個 alerts、自動消失、手動關閉等功能
 *
 * @example
 * ```typescript
 * const { alerts, addAlert, removeAlert, clearAlerts } = useDrawerAlerts()
 *
 * // 添加警告
 * addAlert({
 *   type: 'warning',
 *   title: '操作警告',
 *   message: '此操作無法復原',
 *   closable: false
 * })
 *
 * // 添加錯誤（5秒後自動消失）
 * addAlert({
 *   type: 'error',
 *   message: '操作失敗',
 *   autoClose: 5000
 * })
 * ```
 */

import { ref, type Ref } from 'vue'

/**
 * Alert 類型定義
 */
export type AlertType = 'success' | 'warning' | 'error' | 'info'

/**
 * Alert Icon Map
 * FontAwesome icons for each alert type
 */
export const ALERT_ICONS: Record<AlertType, string> = {
  success: 'fas fa-check-circle',
  warning: 'fas fa-exclamation-triangle',
  error: 'fas fa-skull',
  info: 'fas fa-circle-info'
} as const

/**
 * Alert 物件介面
 */
export interface DrawerAlert {
  /** 唯一識別碼 */
  id: string

  /** Alert 類型 */
  type: AlertType

  /** 標題（可選） */
  title?: string

  /** 訊息內容 */
  message: string

  /** 是否可關閉（預設 true） */
  closable?: boolean

  /** 是否顯示圖示（預設 true） */
  showIcon?: boolean

  /** 自動關閉時間（毫秒），0 表示不自動關閉 */
  autoClose?: number

  /** 創建時間戳 */
  timestamp: number

  /** 自動關閉計時器 ID */
  timerId?: ReturnType<typeof setTimeout>
}

/**
 * 添加 Alert 的選項
 */
export interface AddAlertOptions {
  /** Alert 類型 */
  type: AlertType

  /** 標題（可選） */
  title?: string

  /** 訊息內容 */
  message: string

  /** 是否可關閉（預設 true） */
  closable?: boolean

  /** 是否顯示圖示（預設 true） */
  showIcon?: boolean

  /** 自動關閉時間（毫秒），0 表示不自動關閉
   * - 預設值：success/info = 5000ms，error/warning = 0（不自動關閉）
   */
  autoClose?: number
}

/**
 * Alert 列表（全域狀態）
 * 使用 reactive state 在整個應用中共享
 */
const alerts: Ref<DrawerAlert[]> = ref([])

/**
 * Alert ID 計數器
 */
let alertIdCounter = 0

/**
 * 生成唯一 Alert ID
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${++alertIdCounter}`
}

/**
 * 獲取預設自動關閉時間
 */
function getDefaultAutoClose(type: AlertType): number {
  // success 和 info 預設 5 秒後自動關閉
  if (type === 'success' || type === 'info') {
    return 5000
  }
  // error 和 warning 預設不自動關閉
  return 0
}

/**
 * Drawer Alert 管理 Composable
 */
export function useDrawerAlerts() {
  /**
   * 添加新的 Alert
   *
   * @param options - Alert 選項
   * @returns Alert ID
   *
   * @example
   * ```typescript
   * // 添加警告（不自動關閉）
   * addAlert({
   *   type: 'warning',
   *   title: '操作警告',
   *   message: '此操作無法復原',
   *   closable: false
   * })
   *
   * // 添加成功訊息（5秒後自動關閉）
   * addAlert({
   *   type: 'success',
   *   message: '操作成功'
   * })
   * ```
   */
  function addAlert(options: AddAlertOptions): string {
    const {
      type,
      title,
      message,
      closable = true,
      showIcon = true,
      autoClose = getDefaultAutoClose(type)
    } = options

    const id = generateAlertId()

    const alert: DrawerAlert = {
      id,
      type,
      title,
      message,
      closable,
      showIcon,
      autoClose,
      timestamp: Date.now()
    }

    // 設置自動關閉計時器
    if (autoClose > 0) {
      alert.timerId = setTimeout(() => {
        removeAlert(id)
      }, autoClose)
    }

    // 添加到列表（新的在前面）
    alerts.value.unshift(alert)

    return id
  }

  /**
   * 移除指定 Alert
   *
   * @param id - Alert ID
   *
   * @example
   * ```typescript
   * const alertId = addAlert({ type: 'info', message: 'Loading...' })
   * // 稍後移除
   * removeAlert(alertId)
   * ```
   */
  function removeAlert(id: string): void {
    const index = alerts.value.findIndex(alert => alert.id === id)
    if (index !== -1) {
      const alert = alerts.value[index]

      // 清除計時器
      if (alert.timerId) {
        clearTimeout(alert.timerId)
      }

      // 從列表移除
      alerts.value.splice(index, 1)
    }
  }

  /**
   * 清除所有 Alerts
   *
   * @example
   * ```typescript
   * // 清除所有 alerts
   * clearAlerts()
   * ```
   */
  function clearAlerts(): void {
    // 清除所有計時器
    alerts.value.forEach(alert => {
      if (alert.timerId) {
        clearTimeout(alert.timerId)
      }
    })

    // 清空列表
    alerts.value = []
  }

  /**
   * 快捷方法：添加成功訊息
   */
  function success(message: string, title?: string): string {
    return addAlert({ type: 'success', message, title })
  }

  /**
   * 快捷方法：添加警告訊息
   */
  function warning(message: string, title?: string): string {
    return addAlert({ type: 'warning', message, title })
  }

  /**
   * 快捷方法：添加錯誤訊息
   */
  function error(message: string, title?: string): string {
    return addAlert({ type: 'error', message, title })
  }

  /**
   * 快捷方法：添加資訊訊息
   */
  function info(message: string, title?: string): string {
    return addAlert({ type: 'info', message, title })
  }

  return {
    /** Alert 列表（最新的在前） */
    alerts,

    /** 添加 Alert */
    addAlert,

    /** 移除指定 Alert */
    removeAlert,

    /** 清除所有 Alerts */
    clearAlerts,

    /** 快捷方法：添加成功訊息 */
    success,

    /** 快捷方法：添加警告訊息 */
    warning,

    /** 快捷方法：添加錯誤訊息 */
    error,

    /** 快捷方法：添加資訊訊息 */
    info
  }
}

/**
 * HMR Cleanup
 * Clean up timers on hot module replacement to prevent memory leaks
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Clear all timers
    alerts.value.forEach(alert => {
      if (alert.timerId) {
        clearTimeout(alert.timerId)
      }
    })
    // Clear alerts array
    alerts.value = []
  })
}
