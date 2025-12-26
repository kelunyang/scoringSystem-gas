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
 * Fetch with automatic authentication header injection
 * Use this for endpoints that have special characters in their paths
 * that cause issues with Hono RPC client type inference
 *
 * @param url - API endpoint URL (relative or absolute)
 * @param options - Fetch options (method, body, signal for AbortController, etc.)
 * @returns Parsed JSON response
 */
export async function fetchWithAuth<T = any>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: any
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
    // Try to parse error response
    try {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`)
    } catch (e) {
      throw new Error(`API request failed with status ${response.status}`)
    }
  }

  return response.json()
}

/**
 * Type-safe API response
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}
