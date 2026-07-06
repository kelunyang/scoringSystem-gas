/**
 * Minimal API Client for Cloudflare Workers Backend
 *
 * @deprecated This module is being phased out in favor of rpc-client.ts
 * Please use rpc-client.ts for new code. This file is kept for backward compatibility.
 *
 * This is a streamlined version that only contains core functionality.
 * All API calls should use callWithAuth() or call() directly with endpoint paths.
 *
 * Migration from legacy api.js:
 * - Removed all 74 predefined method wrappers
 * - Kept only core authentication and HTTP methods
 * - ~800 lines reduced to ~320 lines (60% reduction)
 */

import { handleApiError } from './errorHandler'
import { getCachedClientIP } from './ip'
import { authEventBus } from './authEventBus'

interface SessionInfo {
  isValid: boolean
  message?: string
  remainingTime?: number
  expiryTime?: number
  sessionTimeout?: number
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  token?: string
  session?: SessionInfo
}

interface ApiCallOptions {
  silent?: boolean
}

class APIClient {
  private baseURL: string

  constructor() {
    // 開發環境使用相對路徑（通過 Vite 代理）
    // 生產環境使用完整 URL
    this.baseURL = import.meta.env.VITE_API_URL || ''

    // For development: allow custom API URL
    if (typeof window !== 'undefined' && (window as any).CLOUDFLARE_API_URL) {
      this.baseURL = (window as any).CLOUDFLARE_API_URL
    }
  }

  /**
   * Get current JWT token from sessionStorage
   */
  getToken(): string | null {
    return sessionStorage.getItem('sessionId')
  }

  /**
   * Save JWT token to sessionStorage
   *
   * Emits a token-renewal event so reactive consumers (e.g. useAuth().token)
   * stay in sync with the latest token.
   */
  saveToken(token: string): void {
    sessionStorage.setItem('sessionId', token)
    authEventBus.emitTokenRenewal(token)
  }

  /**
   * Remove JWT token (logout)
   *
   * Emits a session-expired event so reactive consumers clear their token state.
   */
  clearToken(): void {
    sessionStorage.removeItem('sessionId')
    sessionStorage.removeItem('sessionExpiryTime')
    sessionStorage.removeItem('sessionTimeout')
    authEventBus.emitSessionExpired('logout')
  }

  /**
   * Handle session information from backend
   * Note: With JWT, session is extended automatically on each request
   */
  handleSessionInfo(sessionInfo: SessionInfo | undefined): void {
    if (!sessionInfo) return

    if (!sessionInfo.isValid) {
      // Session invalid, clear local storage
      this.clearToken()
      console.warn('⚠️ Session 無效：', sessionInfo.message)

      // Redirect to login page
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login'
      }
      return
    }

    // Session valid, update local info
    const remainingMinutes = Math.floor((sessionInfo.remainingTime || 0) / (1000 * 60))
    const remainingHours = Math.floor(remainingMinutes / 60)

    // Show warning if less than 5 minutes remaining
    if (remainingMinutes < 5 && remainingMinutes > 0) {
      console.warn(`⚠️ Session 將在 ${remainingMinutes} 分鐘後過期`)

      // Trigger global event for UI warning
      if (typeof (window as any).showSessionWarning === 'function') {
        (window as any).showSessionWarning(remainingMinutes)
      }
    }

    // Update expiry time info
    if (sessionInfo.expiryTime) {
      sessionStorage.setItem('sessionExpiryTime', sessionInfo.expiryTime.toString())
    }

    // Session timeout is managed by JWT - no need for manual tracking
    if (sessionInfo.sessionTimeout) {
      sessionStorage.setItem('sessionTimeout', sessionInfo.sessionTimeout.toString())
    }

    // Log detailed time info
    if (remainingHours > 0) {
      console.log(`✅ Session 已延長，剩餘時間：${remainingHours} 小時 ${remainingMinutes % 60} 分鐘`)
    } else {
      console.log(`✅ Session 已延長，剩餘時間：${remainingMinutes} 分鐘`)
    }
  }

  /**
   * Core API call method using fetch
   *
   * @param endpoint - API endpoint path (e.g., '/projects/list')
   * @param data - Request payload
   * @param method - HTTP method (GET, POST, PUT, DELETE)
   * @param options - Additional options (e.g., { silent: true })
   * @returns API response
   *
   * @example
   * // GET request
   * await apiClient.call('/projects/list', {}, 'GET')
   *
   * @example
   * // POST request with data
   * await apiClient.call('/projects/create', { projectData: {...} }, 'POST')
   */
  async call<T = any>(
    endpoint: string,
    data: Record<string, any> = {},
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    options: ApiCallOptions = {}
  ): Promise<ApiResponse<T>> {
    const { silent = false } = options

    // Get client IP for auth-related operations
    const needsIP = endpoint.includes('/auth/') || endpoint.includes('login') || endpoint.includes('register')
    if (needsIP && !data.clientIP) {
      try {
        const ipInfo = await getCachedClientIP()
        data.clientIP = ipInfo.ip || 'unknown'
        data.city = ipInfo.city
        data.country = ipInfo.country
      } catch (error) {
        console.warn('Failed to get client IP:', error)
        data.clientIP = 'unknown'
      }
    }

    try {
      // Build fetch options
      const fetchOptions: RequestInit = {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      }

      // Add Authorization header if token exists
      const token = this.getToken()
      if (token) {
        (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
      }

      // Add body for POST/PUT requests
      if (method !== 'GET' && method !== 'DELETE') {
        fetchOptions.body = JSON.stringify(data)
      }

      // Build URL with query params for GET requests
      let url = `${this.baseURL}${endpoint}`
      if (method === 'GET' && Object.keys(data).length > 0) {
        const params = new URLSearchParams(data)
        url += `?${params.toString()}`
      }

      // Make fetch request
      const response = await fetch(url, fetchOptions)

      // Parse JSON response
      let result: ApiResponse<T>
      try {
        result = await response.json()
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError)
        throw new Error('Invalid JSON response from server', { cause: jsonError })
      }

      // Check response format
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from backend')
      }

      // Handle token refresh (sliding expiration)
      // Check for new token in response header
      const newToken = response.headers.get('X-New-Token')
      if (newToken) {
        console.log('🔄 Token refreshed (sliding expiration)')
        this.saveToken(newToken)
      }

      // Handle session info from response
      if (result.session) {
        this.handleSessionInfo(result.session)
      }

      // Handle new token from login/register
      if (result.success && result.token) {
        this.saveToken(result.token)
      }

      // Handle API error responses
      if (!response.ok || !result.success) {
        // Don't show errors for auth validation and system info endpoints (normal during initial load)
        const isAuthValidation = endpoint.includes('/auth/current-user') ||
                                endpoint.includes('/auth/validate') ||
                                endpoint.includes('/auth/session') ||
                                endpoint.includes('/system/info') ||
                                endpoint.includes('/system/turnstile-config')

        if (!silent && !isAuthValidation) {
          const action = this.getActionDescription(endpoint, method)
          handleApiError(result, action)
        }
      }

      return result

    } catch (error: any) {
      // Network or system error
      console.error('API call error:', error)

      // 判斷錯誤類型
      const isConnectionError = error.message === 'Failed to fetch' ||
                               error.name === 'TypeError' ||
                               error.message.includes('fetch')

      const isServiceUnavailable = error.status === 503 ||
                                   error.message.includes('503')

      // 特殊處理：冷啟動或服務暫時不可用
      if (isConnectionError || isServiceUnavailable) {
        console.warn('⚠️ 後端服務暫時不可用（可能是冷啟動），將自動重試')

        // 不顯示錯誤給用戶，讓 TanStack Query 處理重試
        return {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: '服務暫時不可用'
          }
        }
      }

      // 其他網絡錯誤：顯示給用戶
      if (!silent) {
        const action = this.getActionDescription(endpoint, method)
        handleApiError({
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: error.message || '網路連線錯誤'
          }
        }, action)
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.message || '網路錯誤，請重試'
        }
      }
    }
  }

  /**
   * API call with authentication (requires JWT token)
   *
   * @param endpoint - API endpoint path
   * @param data - Request payload
   * @param method - HTTP method
   * @param options - Additional options
   * @returns API response
   *
   * @example
   * // Simple authenticated call
   * await apiClient.callWithAuth('/projects/list')
   *
   * @example
   * // With data
   * await apiClient.callWithAuth('/projects/create', { projectData: {...} })
   *
   * @example
   * // Silent mode (no error messages)
   * await apiClient.callWithAuth('/projects/viewers/list', { projectId }, 'POST', { silent: true })
   */
  async callWithAuth<T = any>(
    endpoint: string,
    data: Record<string, any> = {},
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    options: ApiCallOptions = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken()

    if (!token) {
      const errorResponse: ApiResponse<T> = {
        success: false,
        error: {
          code: 'NO_SESSION',
          message: '尚未登入，請先登入'
        }
      }

      // Don't show error for missing session (normal initial state)
      return errorResponse
    }

    // Note: Token is added in call() via Authorization header
    // Keep sessionId in body for backward compatibility
    return this.call<T>(endpoint, { ...data, sessionId: token }, method, options)
  }

  /**
   * Get action description for error messages
   */
  private getActionDescription(endpoint: string, method: string): string {
    const actionMap: Record<string, string> = {
      '/api/auth/login': '登入',
      '/api/auth/logout': '登出',
      '/api/auth/register': '註冊',
      '/api/auth/change-password': '修改密碼',
      '/api/auth/validate': '驗證會話',
      '/api/auth/current-user': '驗證會話',
      '/api/auth/session': '驗證會話',
      '/api/users/profile': method === 'GET' ? '獲取個人資料' : '更新個人資料',
      '/api/users/avatar/update': '更新頭像',
      '/api/projects/create': '建立專案',
      '/api/projects/update': '更新專案',
      '/api/projects/delete': '刪除專案',
      '/api/projects/core': '載入專案資料',
      '/api/projects/list': '載入專案列表',
      '/api/projects/list-with-stages': '載入專案列表',
      '/api/submissions/submit': '提交報告',
      '/api/rankings/submit': '提交排名',
      '/api/rankings/stage-rankings': '獲取階段排名',
      '/api/rankings/teacher-vote-history': '獲取教師投票歷史',
      '/api/comments/create': '發表評論',
      '/api/comments/ranking': '評論投票',
      '/api/comments/rankings': '獲取評論排名',
      '/api/comments/stage-rankings': '獲取階段評論排名',
      '/api/comments/settlement-analysis': '獲取評論計票分析',
      '/api/wallets/transactions': '載入交易記錄',
      '/api/groups/create': '建立群組',
      '/api/groups/update': '更新群組',
      '/api/groups/details': '載入群組詳情',
      '/api/groups/add-member': '新增群組成員',
      '/api/groups/remove-member': '移除群組成員',
      '/api/stages/create': '建立階段',
      '/api/stages/update': '更新階段',
      '/api/invitations/generate': '生成邀請碼',
      '/api/system/logs': '獲取系統日誌',
      '/api/system/logs/stats': '獲取日誌統計',
      '/api/system/logs/archive': '日誌歸檔'
    }

    return actionMap[endpoint] || '操作'
  }

  // Project Viewer Management Methods
  async listProjectViewers(projectId: string | null): Promise<ApiResponse> {
    if (!projectId) {
      return { success: false, error: { code: 'INVALID_PROJECT', message: 'Project ID is required' } }
    }
    return this.callWithAuth(`/api/projects/${projectId}/viewers`, {}, 'GET')
  }

  async addProjectViewer(projectId: string, targetUserEmail: string, role: string): Promise<ApiResponse> {
    return this.callWithAuth(`/api/projects/${projectId}/viewers`, { targetUserEmail, role }, 'POST')
  }

  async removeProjectViewer(projectId: string, targetUserEmail: string): Promise<ApiResponse> {
    return this.callWithAuth(`/api/projects/${projectId}/viewers/${targetUserEmail}`, {}, 'DELETE')
  }

  async updateProjectViewerRole(projectId: string, targetUserEmail: string, newRole: string): Promise<ApiResponse> {
    return this.callWithAuth(`/api/projects/${projectId}/viewers/${targetUserEmail}`, { role: newRole }, 'PUT')
  }
}

// Create singleton instance
export const apiClient = new APIClient()
export default apiClient
