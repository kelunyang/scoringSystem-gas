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
 * Custom fetch wrapper with token renewal support
 * Intercepts responses to check for X-New-Token header
 */
const fetchWithTokenRenewal: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

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
 * 型別由 backend 的 AppType 推導，端點路徑、request body、response
 * 形狀都會被檢查。前提是 backend 的 router 全部用鏈式註冊
 * （`new Hono().post(...).post(...)`）——改成敘述式會讓 schema 退化成
 * BlankSchema，這裡就整個失去型別。見 plan/issue.md #011。
 *
 * ✅ Includes automatic token renewal via X-New-Token header
 * ✅ Includes automatic sudo headers when in sudo mode
 */
export const rpcClient = hc<AppType>(getApiBaseUrl(), {
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
 * Get current session token
 */
export function getSessionToken(): string | null {
  return sessionStorage.getItem('sessionId');
}

