/**
 * API Helper Functions
 * Provides unified fetch wrappers with consistent error handling
 */

/**
 * Get the API base URL based on environment
 * Same logic as rpc-client.ts for consistency
 */
function getApiBaseUrl(): string {
  // In development, use the Vite proxy
  if (import.meta.env.DEV) {
    return ''
  }
  // In production, use the actual API URL
  return import.meta.env.VITE_API_URL || ''
}

/**
 * fetchWithAuth 收到非 2xx 時拋出的錯誤，帶著後端 errorResponse 的 code。
 * 呼叫端要依錯誤碼分流（例如 USER_NOT_LOCKED）就看 `code`。
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/**
 * Fetch with automatic authentication header injection
 * Use this for endpoints that have special characters in their paths
 * that cause issues with Hono RPC client type inference
 *
 * @param url - API endpoint URL (relative or absolute)
 * @param options - Fetch options (method, body, signal for AbortController, etc.)
 * @returns Parsed JSON response
 */
export async function fetchWithAuth<T = unknown>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    /** 會被 JSON.stringify，形狀由呼叫端決定 */
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {}
): Promise<T> {
  const sessionId = sessionStorage.getItem('sessionId')

  const fetchOptions: RequestInit = {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Authorization': `Bearer ${sessionId}` } : {}),
      ...options.headers
    },
    signal: options.signal
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  // Prepend API base URL for production
  const fullUrl = getApiBaseUrl() + url
  const response = await fetch(fullUrl, fetchOptions)

  if (!response.ok) {
    // 解析和 throw 要分開：throw 寫在 try 裡會被同一個 catch 接走，
    // 後端的 message / code 全被蓋成 "API request failed with status 400"。
    let error: { code?: string; message?: string } | undefined
    try {
      error = (await response.json() as { error?: { code?: string; message?: string } }).error
    } catch {
      // 非 JSON 回應（例如 Cloudflare 的 HTML 錯誤頁），只能報狀態碼
    }
    throw new ApiRequestError(
      error?.message || `API request failed with status ${response.status}`,
      response.status,
      error?.code
    )
  }

  return response.json()
}

/**
 * The one API response type. Defined in @repo/shared/types/api-responses,
 * re-exported here because most callers already import fetchWithAuth from
 * this module.
 */
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse
} from '@repo/shared/types/api-responses'
