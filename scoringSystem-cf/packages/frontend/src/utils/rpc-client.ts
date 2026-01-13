/**
 * @fileoverview Hono RPC Client for type-safe API calls
 * Provides a typed client for calling backend APIs with full type safety
 */

import { hc } from 'hono/client';
import type { AppType } from '../types/backend';

/**
 * Get the API base URL based on environment
 */
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    // 開發環境：空字串，Vite proxy 會處理
    return '';
  }

  // 生產環境：使用 API URL
  return import.meta.env.VITE_API_URL || '';
}

/**
 * 確保 URL 路徑包含 /api 前綴
 * 處理前端代碼混用 rpcClient.api.* 和 rpcClient.projects.* 的情況
 */
function ensureApiPrefix(url: string | URL | Request): string | URL | Request {
  if (typeof url === 'string') {
    // 檢查是否已經有 /api 前綴
    const urlObj = new URL(url, window.location.origin);
    if (!urlObj.pathname.startsWith('/api/') && !urlObj.pathname.startsWith('/api')) {
      // 加上 /api 前綴
      urlObj.pathname = '/api' + urlObj.pathname;
      return urlObj.toString();
    }
    return url;
  }
  if (url instanceof URL) {
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api')) {
      url.pathname = '/api' + url.pathname;
    }
    return url;
  }
  if (url instanceof Request) {
    const reqUrl = new URL(url.url);
    if (!reqUrl.pathname.startsWith('/api/') && !reqUrl.pathname.startsWith('/api')) {
      reqUrl.pathname = '/api' + reqUrl.pathname;
      return new Request(reqUrl.toString(), url);
    }
  }
  return url;
}

/**
 * Custom fetch wrapper with token renewal support and API prefix handling
 * Intercepts responses to check for X-New-Token header
 */
const fetchWithTokenRenewal: typeof fetch = async (input, init) => {
  // 確保 URL 有 /api 前綴（處理混用問題）
  const normalizedInput = ensureApiPrefix(input);
  const response = await fetch(normalizedInput, init);

  // ✅ Check for X-New-Token header (sliding expiration)
  const newToken = response.headers.get('X-New-Token');
  if (newToken) {
    console.log('🔄 Token refreshed via RPC client (sliding expiration)');
    sessionStorage.setItem('sessionId', newToken);

    // ✅ Dispatch event to notify other parts of the app
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:token-renewed', {
        detail: { newToken, renewedAt: Date.now() }
      }));
    }
  }

  return response;
};

/**
 * Get sudo headers from session storage
 * Sudo state is stored in session storage by the sudo store
 */
function getSudoHeaders(): Record<string, string> {
  try {
    const sudoActive = sessionStorage.getItem('sudo_active')
    const sudoTarget = sessionStorage.getItem('sudo_target')
    const sudoProject = sessionStorage.getItem('sudo_project')

    if (sudoActive === 'true' && sudoTarget && sudoProject) {
      const target = JSON.parse(sudoTarget)
      return {
        'X-Sudo-As': target.userEmail,
        'X-Sudo-Project': sudoProject
      }
    }
  } catch {
    // Ignore errors
  }
  return {}
}

/**
 * Create RPC client
 *
 * NOTE: Due to Hono RPC type limitations (route types are lost in declaration files),
 * the client is cast to `any`. Runtime type safety is maintained through:
 * - Zod validation on backend
 * - TanStack Query for data fetching
 * - Manual type annotations where needed in consuming code
 *
 * ✅ Includes automatic token renewal via X-New-Token header
 * ✅ Includes automatic sudo headers when in sudo mode
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rpcClient: any = hc<AppType>(getApiBaseUrl(), {
  headers: () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add session token if available
    const sessionId = sessionStorage.getItem('sessionId');
    if (sessionId) {
      headers['Authorization'] = `Bearer ${sessionId}`;
    }

    // Add sudo headers if in sudo mode
    const sudoHeaders = getSudoHeaders();
    Object.assign(headers, sudoHeaders);

    return headers;
  },
  fetch: fetchWithTokenRenewal  // ✅ Use custom fetch with token renewal
});

/**
 * Helper function to handle RPC responses
 * Automatically checks response status and parses JSON
 */
export async function handleRpcResponse<T>(
  responsePromise: Promise<Response>
): Promise<T> {
  const response = await responsePromise;

  if (!response.ok) {
    // Try to parse error response
    try {
      const errorData = await response.json() as { error?: { message?: string } };
      throw new Error(errorData.error?.message || 'API request failed');
    } catch (e) {
      throw new Error(`API request failed with status ${response.status}`);
    }
  }

  return response.json();
}

/**
 * Type-safe wrapper for RPC calls with automatic error handling
 *
 * @example
 * const data = await callRpc(() => rpcClient.api.system.info.$get());
 */
export async function callRpc<T>(
  fn: () => Promise<Response>
): Promise<T> {
  return handleRpcResponse<T>(fn());
}

/**
 * Update session token in headers
 * Call this after login or when token is refreshed
 */
export function updateSessionToken(token: string | null) {
  if (token) {
    sessionStorage.setItem('sessionId', token);
  } else {
    sessionStorage.removeItem('sessionId');
  }
}

/**
 * Get current session token
 */
export function getSessionToken(): string | null {
  return sessionStorage.getItem('sessionId');
}

/**
 * Clear session token (on logout)
 */
export function clearSessionToken() {
  sessionStorage.removeItem('sessionId');
}
