/**
 * @fileoverview Forgot password composable
 * One step: submit an email, the server mails a new password to it.
 */

import { ref } from 'vue';
import { rpcClient } from '@/utils/rpc-client'
import { apiErrorMessage, errorOf } from '@/utils/api-types';
import type { Ref } from 'vue';

export interface UseForgotPasswordReturn {
  loading: Ref<boolean>;
  /** Address the last successful request was sent for; '' until then. */
  sentTo: Ref<string>;
  errorMessage: Ref<string>;
  requestReset: (email: string, turnstileToken: string) => Promise<boolean>;
  reset: () => void;
}

/**
 * Composable for the forgot-password request
 *
 * The server answers the same way whether or not the address has an account,
 * so a success here only means "if it exists, mail is on its way". The only
 * errors surfaced are a malformed address, the captcha, and the mail rate
 * limit.
 *
 * @returns Forgot password state and methods
 *
 * @example
 * const { loading, sentTo, errorMessage, requestReset } = useForgotPassword();
 * await requestReset('student@example.com', turnstileToken);
 */
export function useForgotPassword(): UseForgotPasswordReturn {
  const loading = ref(false);
  const sentTo = ref('');
  const errorMessage = ref('');

  /**
   * Ask the server to mail a new password to `email`.
   *
   * @param email - Address the user typed
   * @param turnstileToken - Single-use captcha token
   * @returns Whether the request was accepted
   */
  async function requestReset(email: string, turnstileToken: string): Promise<boolean> {
    const trimmed = email.trim();
    if (!trimmed) {
      errorMessage.value = '請輸入電子郵件';
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errorMessage.value = '請輸入有效的電子郵件地址';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await rpcClient.api.auth['reset-password'].$post({
        json: {
          userEmail: trimmed,
          turnstileToken
        }
      });

      const response = await httpResponse.json();

      if (response.success) {
        sentTo.value = trimmed;
        return true;
      }
      errorMessage.value = apiErrorMessage(errorOf(response)) || '送出失敗，請稍後再試';
      return false;
    } catch (error) {
      console.error('Password reset request error:', error);
      errorMessage.value = '網路錯誤，請重試';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Back to the empty form, e.g. to try another address
   */
  function reset() {
    loading.value = false;
    sentTo.value = '';
    errorMessage.value = '';
  }

  return {
    loading,
    sentTo,
    errorMessage,
    requestReset,
    reset
  };
}
