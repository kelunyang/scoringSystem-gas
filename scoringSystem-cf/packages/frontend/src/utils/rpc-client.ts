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
 * Create typed RPC client
 * This client provides full type safety for all API calls
 * ✅ Includes automatic token renewal via X-New-Token header
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
      const errorData = await response.json();
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
 * const data = await callRpc(() => rpcClient.system.info.$get());
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
