/**
 * @fileoverview Turnstile CAPTCHA composable
 * Provides unified Turnstile token management for all authentication flows
 */

import { ref } from 'vue';
import type { Ref } from 'vue';

export interface UseTurnstileReturn {
  token: Ref<string | null>;
  isReady: Ref<boolean>;
  onVerify: (verifiedToken: string) => void;
  onError: () => void;
  onExpired: () => void;
  reset: () => void;
}

/**
 * Composable for Cloudflare Turnstile CAPTCHA management
 *
 * Eliminates code duplication - previously had 3 identical Turnstile handlers
 * in the monolithic GlobalAuthModal.vue (Evan You's criticism)
 *
 * @returns Turnstile state and handlers
 *
 * @example
 * // In LoginForm.vue
 * const { token, onVerify, reset } = useTurnstile();
 *
 * // Pass to TurnstileWidget
 * <TurnstileWidget
 *   @success="onVerify"
 *   @error="onError"
 *   @expired="onExpired"
 * />
 *
 * // Use token in API call
 * await login(email, password, token.value);
 */
export function useTurnstile(): UseTurnstileReturn {
  const token = ref<string | null>(null);
  const isReady = ref(false);

  function onVerify(verifiedToken: string) {
    token.value = verifiedToken;
    isReady.value = true;
  }

  function onError() {
    token.value = null;
    isReady.value = false;
    console.error('Turnstile verification failed');
  }

  function onExpired() {
    token.value = null;
    isReady.value = false;
    console.warn('Turnstile token expired');
  }

  function reset() {
    token.value = null;
    isReady.value = false;

    // Reset the widget if Turnstile API is available
    if (typeof window !== 'undefined' && (window as any).turnstile) {
      try {
        (window as any).turnstile.reset();
      } catch (error) {
        console.warn('Failed to reset Turnstile widget:', error);
      }
    }
  }

  return {
    token,
    isReady,
    onVerify,
    onError,
    onExpired,
    reset
  };
}
