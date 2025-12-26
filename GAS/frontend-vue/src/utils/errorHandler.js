/**
 * 統一錯誤處理系統
 * 提供一致的錯誤顯示和日誌記錄
 */

import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'

class ErrorHandler {
  constructor() {
    this.errorLog = []
    this.maxLogSize = 100
  }

  /**
   * 統一錯誤輸出函數
   * @param {Error|Object|String} error - 錯誤對象或訊息
   * @param {Object} options - 配置選項
   * @param {String} options.type - 錯誤類型: 'error', 'warning', 'info'
   * @param {String} options.title - 錯誤標題
   * @param {String} options.action - 觸發錯誤的動作描述
   * @param {Boolean} options.showNotification - 是否顯示通知 (預設false)
   * @param {Boolean} options.showDialog - 是否顯示對話框 (預設false)
   * @param {Number} options.duration - 訊息顯示時長 (毫秒)
   */
  handleError(error, options = {}) {
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
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${type.toUpperCase()}] ${title}`, {
        action,
        message,
        error
      })
    }
  }

  /**
   * 解析錯誤訊息
   * @param {Error|Object|String} error - 錯誤對象
   * @returns {String} 用戶友好的錯誤訊息
   */
  parseErrorMessage(error) {
    // 字符串錯誤
    if (typeof error === 'string') {
      return error
    }

    // API 錯誤響應格式
    if (error && error.error) {
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
    if (error && error.message) {
      return this.translateErrorMessage(error.message, error.code)
    }

    // 預設錯誤訊息
    return '發生未知錯誤，請稍後再試'
  }

  /**
   * 錯誤訊息翻譯/映射
   * @param {String} message - 原始錯誤訊息
   * @param {String} code - 錯誤代碼
   * @returns {String} 用戶友好的錯誤訊息
   */
  translateErrorMessage(message, code) {
    // 錯誤代碼映射
    const errorCodeMap = {
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
    const messagePatterns = [
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
   * 記錄錯誤到日誌
   * @param {Object} errorInfo - 錯誤資訊
   */
  logError(errorInfo) {
    this.errorLog.unshift(errorInfo)
    
    // 限制日誌大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize)
    }

    // 存儲到 localStorage（可選）
    try {
      localStorage.setItem('errorLog', JSON.stringify(this.errorLog.slice(0, 20)))
    } catch (e) {
      // 忽略存儲錯誤
    }
  }

  /**
   * 獲取錯誤日誌
   * @returns {Array} 錯誤日誌數組
   */
  getErrorLog() {
    return this.errorLog
  }

  /**
   * 清除錯誤日誌
   */
  clearErrorLog() {
    this.errorLog = []
    localStorage.removeItem('errorLog')
  }

  /**
   * 處理 API 調用錯誤的便捷方法
   * @param {Error|Object} error - 錯誤對象
   * @param {String} action - 動作描述
   */
  handleApiError(error, action) {
    // 對於 NO_SESSION 錯誤（首次載入或登出狀態），不顯示錯誤訊息
    // 這是正常狀態，不是錯誤
    if (error && error.error && error.error.code === 'NO_SESSION') {
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
   * @param {Object} errors - 驗證錯誤對象
   */
  handleValidationError(errors) {
    const messages = Object.values(errors).flat().join('；')
    this.handleError(messages, {
      type: 'warning',
      title: '表單驗證失敗',
      duration: 4000
    })
  }

  /**
   * 顯示成功訊息（統一風格）
   * @param {String} message - 成功訊息
   * @param {Object} options - 配置選項
   */
  showSuccess(message, options = {}) {
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
   * @param {String} message - 警告訊息
   * @param {Object} options - 配置選項
   */
  showWarning(message, options = {}) {
    this.handleError(message, {
      type: 'warning',
      title: '警告',
      ...options
    })
  }

  /**
   * 顯示資訊訊息
   * @param {String} message - 資訊訊息
   * @param {Object} options - 配置選項
   */
  showInfo(message, options = {}) {
    this.handleError(message, {
      type: 'info',
      title: '提示',
      ...options
    })
  }
}

// 創建單例實例
const errorHandler = new ErrorHandler()

// 導出實例和便捷方法
export default errorHandler
export const handleError = errorHandler.handleError.bind(errorHandler)
export const handleApiError = errorHandler.handleApiError.bind(errorHandler)
export const handleValidationError = errorHandler.handleValidationError.bind(errorHandler)
export const showSuccess = errorHandler.showSuccess.bind(errorHandler)
export const showWarning = errorHandler.showWarning.bind(errorHandler)
export const showInfo = errorHandler.showInfo.bind(errorHandler)