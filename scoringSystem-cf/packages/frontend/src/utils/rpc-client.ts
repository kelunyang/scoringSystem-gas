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
  // In development, use the Vite proxy
  if (import.meta.env.DEV) {
    return '';  // Vite proxy will handle /auth, /projects, etc.
  }

  // In production, use the actual API URL
  // This should be configured based on your deployment
  const apiUrl = import.meta.env.VITE_API_URL || '';
  return apiUrl;
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
