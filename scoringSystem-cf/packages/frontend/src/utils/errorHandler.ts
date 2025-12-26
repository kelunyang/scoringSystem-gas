/**
 * 統一錯誤處理系統
 * 提供一致的錯誤顯示和日誌記錄
 */

import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { ErrorHandlerOptions, ErrorLogEntry } from '@/types/utils'
import { getUserPreferences, setUserPreference } from './userPreferences'

interface ApiError {
  success: boolean
  error?: {
    code?: string
    message?: string
  }
}

interface HandleErrorOptions {
  type?: 'error' | 'warning' | 'info' | 'success'
  title?: string
  action?: string
  showNotification?: boolean
  showDialog?: boolean
  duration?: number
}

/**
 * 全局當前用戶 ID（用於錯誤日誌隔離）
 * 應由 App.vue 或認證系統設置
 */
let currentUserId: string | null = null

/**
 * 設置當前用戶 ID
 * @param userId - 用戶 ID
 */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId
}

/**
 * 獲取當前用戶 ID
 * @returns 當前用戶 ID
 */
export function getCurrentUserId(): string | null {
  return currentUserId
}

class ErrorHandler {
  private maxLogSize: number = 20 // 最多保留 20 筆錯誤

  /**
   * 統一錯誤輸出函數
   * @param error - 錯誤對象或訊息
   * @param options - 配置選項
   */
  handleError(error: Error | ApiError | string, options: HandleErrorOptions = {}): void {
    const {
      type = 'error',
      title = '操作失敗',
      action = '',
      showNotification = false,
      showDialog = false,
      duration = 3000
    } = options

    // 解析錯誤訊息
    let message = this.parseErrorMessage(error)

    // 記錄到錯誤日誌
    this.logError({
      timestamp: new Date(),
      type,
      title,
      action,
      message,
      error: error instanceof Error ? error.stack : error
    })

    // 根據錯誤類型選擇顯示方式
    if (showDialog) {
      // 使用對話框顯示嚴重錯誤（移除危險的HTML功能）
      ElMessageBox.alert(message, title, {
        type,
        confirmButtonText: '確定'
        // 已移除 dangerouslyUseHTMLString: true 以防止XSS攻擊
      })
    } else if (showNotification) {
      // 使用通知顯示重要錯誤
      ElNotification({
        title,
        message,
        type,
        duration,
        position: 'top-right'
      })
    } else {
      // 預設使用訊息提示
      ElMessage({
        message: action ? `${action}失敗: ${message}` : message,
        type,
        duration,
        showClose: true
      })
    }

    // 開發環境下在控制台輸出詳細錯誤
    if (import.meta.env.DEV) {
      console.error(`[${type.toUpperCase()}] ${title}`, {
        action,
        message,
        error
      })
    }
  }

  /**
   * 解析錯誤訊息
   * @param error - 錯誤對象
   * @returns 用戶友好的錯誤訊息
   */
  parseErrorMessage(error: Error | ApiError | string): string {
    // 字符串錯誤
    if (typeof error === 'string') {
      return error
    }

    // API 錯誤響應格式
    if (error && 'error' in error && error.error) {
      if (error.error.message) {
        return this.translateErrorMessage(error.error.message, error.error.code)
      }
      if (typeof error.error === 'string') {
        return error.error
      }
    }

    // 標準 Error 對象
    if (error instanceof Error) {
      return this.translateErrorMessage(error.message)
    }

    // 其他對象
    if (error && typeof error === 'object' && 'message' in error) {
      const err = error as any
      return this.translateErrorMessage(err.message, err.code)
    }

    // 預設錯誤訊息
    return '發生未知錯誤，請稍後再試'
  }

  /**
   * 錯誤訊息翻譯/映射
   * @param message - 原始錯誤訊息
   * @param code - 錯誤代碼
   * @returns 用戶友好的錯誤訊息
   */
  translateErrorMessage(message: string, code?: string): string {
    // 錯誤代碼映射
    const errorCodeMap: Record<string, string> = {
      'SESSION_INVALID': '登入已過期，請重新登入',
      'SESSION_EXPIRED': '登入已過期，請重新登入',
      'AUTHENTICATION_FAILED': '帳號或密碼錯誤',
      'ACCESS_DENIED': '您沒有權限執行此操作',
      'INVALID_INPUT': '輸入資料格式錯誤',
      'PROJECT_NOT_FOUND': '找不到指定的專案',
      'USER_NOT_FOUND': '找不到指定的用戶',
      'STAGE_NOT_FOUND': '找不到指定的階段',
      'GROUP_NOT_FOUND': '找不到指定的群組',
      'NETWORK_ERROR': '網路連線錯誤，請檢查網路狀態',
      'SYSTEM_ERROR': '系統錯誤，請稍後再試',
      'BACKEND_ERROR': '後端處理失敗，請稍後再試',
      'DUPLICATE_SUBMISSION': '您已經提交過了，無法重複提交',
      'DEADLINE_PASSED': '已超過截止時間',
      'INSUFFICIENT_PERMISSIONS': '權限不足',
      'NO_COMMENT': '您必須先發表評論才能進行投票',
      'NO_GROUP_MENTION': '您必須在評論中@提及至少一組才能投票',
      'VOTING_LOCKED': '該階段已有投票紀錄，無法進行此操作',
      'INVALID_PASSWORD': '密碼錯誤',
      'USERNAME_EXISTS': '用戶名已存在',
      'EMAIL_EXISTS': '電子郵件已被使用',
      'INVITATION_INVALID': '邀請碼無效或已過期',
      'INVITATION_USED': '邀請碼已達使用上限'
    }

    // 優先使用錯誤代碼映射
    if (code && errorCodeMap[code]) {
      return errorCodeMap[code]
    }

    // 常見錯誤訊息模式匹配
    const messagePatterns: Array<{ pattern: RegExp; message: string }> = [
      { pattern: /network\s*error/i, message: '網路連線錯誤' },
      { pattern: /timeout/i, message: '請求超時，請重試' },
      { pattern: /not\s*found/i, message: '找不到請求的資源' },
      { pattern: /unauthorized/i, message: '未授權的操作' },
      { pattern: /forbidden/i, message: '禁止訪問' },
      { pattern: /invalid.*session/i, message: '登入已過期' },
      { pattern: /google.*script.*not.*available/i, message: '無法連接到後端服務' }
    ]

    for (const { pattern, message: translatedMsg } of messagePatterns) {
      if (pattern.test(message)) {
        return translatedMsg
      }
    }

    // 返回原始訊息（如果已經是中文）或預設訊息
    return message || '操作失敗，請稍後再試'
  }

  /**
   * 記錄錯誤到日誌（用戶隔離）
   * @param errorInfo - 錯誤資訊
   */
  logError(errorInfo: ErrorLogEntry): void {
    // 只有當用戶已登入時才記錄
    if (!currentUserId) {
      // 未登入狀態下，僅在開發環境記錄到console
      if (import.meta.env.DEV) {
        console.warn('[ErrorHandler] Cannot log error: No user logged in')
      }
      return
    }

    try {
      // 讀取當前用戶的錯誤日誌
      const prefs = getUserPreferences(currentUserId)
      const log = prefs.errorLog || []

      // 添加新錯誤到日誌開頭
      log.unshift(errorInfo)

      // 限制日誌大小（最多 20 筆）
      const trimmedLog = log.slice(0, this.maxLogSize)

      // 保存到用戶偏好
      setUserPreference(currentUserId, 'errorLog', trimmedLog)
    } catch (e) {
      // 忽略存儲錯誤
      if (import.meta.env.DEV) {
        console.error('[ErrorHandler] Failed to save error log:', e)
      }
    }
  }

  /**
   * 獲取錯誤日誌（用戶隔離）
   * @param userId - 用戶 ID（可選，默認使用當前登入用戶）
   * @returns 錯誤日誌數組
   */
  getErrorLog(userId?: string): ErrorLogEntry[] {
    const targetUserId = userId || currentUserId
    if (!targetUserId) {
      return []
    }

    try {
      const prefs = getUserPreferences(targetUserId)
      return prefs.errorLog || []
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[ErrorHandler] Failed to load error log:', e)
      }
      return []
    }
  }

  /**
   * 清除錯誤日誌（用戶隔離）
   * @param userId - 用戶 ID（可選，默認使用當前登入用戶）
   */
  clearErrorLog(userId?: string): void {
    const targetUserId = userId || currentUserId
    if (!targetUserId) {
      return
    }

    try {
      setUserPreference(targetUserId, 'errorLog', [])

      // 清理舊的全局 errorLog（如果存在）
      if (localStorage.getItem('errorLog')) {
        localStorage.removeItem('errorLog')
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[ErrorHandler] Failed to clear error log:', e)
      }
    }
  }

  /**
   * 處理 API 調用錯誤的便捷方法
   * @param error - 錯誤對象
   * @param action - 動作描述
   */
  handleApiError(error: ApiError | Error | string, action: string): void {
    // 對於 NO_SESSION 錯誤（首次載入或登出狀態），不顯示錯誤訊息
    // 這是正常狀態，不是錯誤
    if (error && typeof error === 'object' && 'error' in error && error.error?.code === 'NO_SESSION') {
      console.log(`ℹ️ ${action}: 尚未登入`)
      return
    }

    this.handleError(error, {
      type: 'error',
      title: 'API 錯誤',
      action,
      showNotification: false
    })
  }

  /**
   * 處理表單驗證錯誤
   * @param errors - 驗證錯誤對象
   */
  handleValidationError(errors: Record<string, string[]>): void {
    const messages = Object.values(errors).flat().join('；')
    this.handleError(messages, {
      type: 'warning',
      title: '表單驗證失敗',
      duration: 4000
    })
  }

  /**
   * 顯示成功訊息（統一風格）
   * @param message - 成功訊息
   * @param options - 配置選項
   */
  showSuccess(message: string, options: { duration?: number; showClose?: boolean } = {}): void {
    const { duration = 3000, showClose = false } = options

    ElMessage({
      message,
      type: 'success',
      duration,
      showClose
    })
  }

  /**
   * 顯示警告訊息
   * @param message - 警告訊息
   * @param options - 配置選項
   */
  showWarning(message: string, options: HandleErrorOptions = {}): void {
    this.handleError(message, {
      type: 'warning',
      title: '警告',
      ...options
    })
  }

  /**
   * 顯示資訊訊息
   * @param message - 資訊訊息
   * @param options - 配置選項
   */
  showInfo(message: string, options: HandleErrorOptions = {}): void {
    this.handleError(message, {
      type: 'info',
      title: '提示',
      ...options
    })
  }
}

// 創建單例實例
const errorHandler = new ErrorHandler()

/**
 * Extract error message from unknown error type
 * Handles Error objects, ApiError objects, and string messages
 * @param error - Unknown error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  // Check for ApiError format
  if (error && typeof error === 'object' && 'error' in error) {
    const apiError = error as ApiError
    return apiError.error?.message || '未知錯誤'
  }

  // Fallback for other object types
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return '未知錯誤'
}

// 導出實例和便捷方法
export default errorHandler
export const handleError = errorHandler.handleError.bind(errorHandler)
export const handleApiError = errorHandler.handleApiError.bind(errorHandler)
export const handleValidationError = errorHandler.handleValidationError.bind(errorHandler)
export const showSuccess = errorHandler.showSuccess.bind(errorHandler)
export const showWarning = errorHandler.showWarning.bind(errorHandler)
export const showInfo = errorHandler.showInfo.bind(errorHandler)
export const getErrorLog = errorHandler.getErrorLog.bind(errorHandler)
export const clearErrorLog = errorHandler.clearErrorLog.bind(errorHandler)
