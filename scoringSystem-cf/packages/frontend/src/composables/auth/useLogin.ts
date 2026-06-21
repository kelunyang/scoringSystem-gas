/**
 * @fileoverview Login composable
 * Handles two-step login flow: password verification → 2FA code verification
 */

import { ref, computed } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { rpcClient } from '@/utils/rpc-client';
import type { Ref, ComputedRef } from 'vue';
import type { LoginCredentials, TwoFactorData, TwoFactorMethod } from '../../types/auth';

export interface UseLoginReturn {
  loading: Ref<boolean>;
  resendLoading: Ref<boolean>;
  emailPasswordVerified: Ref<boolean>;
  devMode: Ref<boolean>;
  twoFactorMethod: Ref<TwoFactorMethod>;
  passkeyAvailable: Ref<boolean>;
  availableMethods: Ref<TwoFactorMethod[]>;
  errorMessage: Ref<string>;
  userEmail: Ref<string>;
  canSubmitPassword: ComputedRef<boolean>;
  canSubmitVerificationCode: ComputedRef<boolean>;
  verifyPassword: (credentials: LoginCredentials, turnstileToken: string) => Promise<boolean>;
  verifyTwoFactor: (twoFactorData: TwoFactorData) => Promise<boolean>;
  resendVerificationCode: (turnstileToken: string) => Promise<boolean>;
  switchMethod: (method: TwoFactorMethod) => void;
  reset: () => void;
}

/**
 * Composable for login flow management
 *
 * Handles the two-step authentication process:
 * Step 1: Email + Password verification
 * Step 2: 2FA code verification (supports email, TOTP, or Passkey)
 *
 * @param apiClient - API client instance
 * @returns Login state and methods
 *
 * @example
 * // In LoginForm.vue
 * import { useLogin } from '@/composables/auth/useLogin';
 * import { inject } from 'vue';
 *
 * const {
 *   loading,
 *   emailPasswordVerified,
 *   verifyPassword,
 *   verifyTwoFactor
 * } = useLogin();
 *
 * // Step 1: Verify password
 * await verifyPassword({ email, password }, turnstileToken);
 *
 * // Step 2: Verify 2FA code
 * const success = await verifyTwoFactor({ email, code });
 */
export function useLogin(): UseLoginReturn {
  const queryClient = useQueryClient();
  const loading = ref(false);
  const resendLoading = ref(false);
  const emailPasswordVerified = ref(false);
  const devMode = ref(false);
  const twoFactorMethod = ref<TwoFactorMethod>('email');
  const passkeyAvailable = ref(false);
  const availableMethods = ref<TwoFactorMethod[]>(['email']);
  const errorMessage = ref('');
  const userEmail = ref('');

  const canSubmitPassword = computed(() => {
    return userEmail.value.trim().length > 0 && !loading.value;
  });

  const canSubmitVerificationCode = computed(() => {
    return emailPasswordVerified.value && !loading.value;
  });

  /**
   * Step 1: Verify email and password
   */
  async function verifyPassword(
    credentials: LoginCredentials,
    turnstileToken: string
  ): Promise<boolean> {
    if (!credentials.email || !credentials.password) {
      errorMessage.value = '請輸入電子郵件和密碼';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['login-verify-password'].$post({
        json: {
          userEmail: credentials.email.trim(),
          password: credentials.password,
          turnstileToken
        }
      });

      const response = await httpResponse.json();

      if (response.success) {
        emailPasswordVerified.value = true;
        userEmail.value = credentials.email;
        // Check if dev mode (SMTP not configured)
        devMode.value = response.data?.devMode === true;
        // Track 2FA method
        const method = response.data?.twoFactorMethod;
        twoFactorMethod.value = method === 'passkey' ? 'passkey' : (method === 'totp' ? 'totp' : 'email');
        // Track passkey availability
        passkeyAvailable.value = response.data?.passkeyAvailable === true;
        // Track available methods
        availableMethods.value = response.data?.availableMethods || ['email'];
        return true;
      } else {
        errorMessage.value = response.error?.message || '密碼驗證失敗';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = error.message || '驗證過程發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Step 2: Verify 2FA code
   * In dev mode (SMTP not configured), a dummy code is used to pass schema validation
   * Note: Passkey authentication is handled separately via usePasskey composable
   */
  async function verifyTwoFactor(twoFactorData: TwoFactorData): Promise<boolean> {
    // In dev mode (email method only), use a dummy code that passes schema validation
    // TOTP users must always provide a real code regardless of dev mode
    const isDevBypass = devMode.value && twoFactorMethod.value === 'email';
    const codeToSend = isDevBypass ? 'DEVMODEBYPAS' : twoFactorData.code;

    if (!isDevBypass && !twoFactorData.code) {
      errorMessage.value = '請輸入驗證碼';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['login-verify-2fa'].$post({
        json: {
          userEmail: twoFactorData.email.trim(),
          code: codeToSend.trim(),
          turnstileToken: twoFactorData.turnstileToken || ''
        }
      });

      const response = await httpResponse.json();

      if (response.success) {
        // Save session to sessionStorage
        if (response.data.sessionId) {
          sessionStorage.setItem('sessionId', response.data.sessionId);
        }

        // Save devMode status for admin warning display
        sessionStorage.setItem('devMode', response.data.devMode ? 'true' : 'false');

        // Invalidate current user query to trigger refetch with deduplication
        // This ensures the showAuthModal closes and isSystemAdmin updates instantly
        // Using invalidateQueries instead of refetchQueries prevents race conditions
        await queryClient.invalidateQueries({
          queryKey: ['currentUser'],
          refetchType: 'active' // Only refetch active queries
        });

        return true;
      } else {
        errorMessage.value = response.error?.message || '驗證碼錯誤';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = error.message || '驗證過程發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Resend verification code to user's email
   */
  async function resendVerificationCode(turnstileToken: string): Promise<boolean> {
    if (!userEmail.value) {
      errorMessage.value = 'Email not found';
      return false;
    }

    resendLoading.value = true;

    try {
      const httpResponse = await (rpcClient.api.auth as any)['resend-2fa'].$post({
        json: {
          userEmail: userEmail.value,
          turnstileToken
        }
      });
      const response = await httpResponse.json();

      if (response.success) {
        return true;
      } else {
        errorMessage.value = response.error?.message || '重新發送失敗';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = '重新發送失敗';
      return false;
    } finally {
      resendLoading.value = false;
    }
  }

  /**
   * Switch 2FA method (e.g., from passkey to TOTP or email)
   */
  function switchMethod(method: TwoFactorMethod): void {
    if (availableMethods.value.includes(method)) {
      twoFactorMethod.value = method;
      errorMessage.value = '';
    }
  }

  /**
   * Reset login state
   */
  function reset() {
    loading.value = false;
    resendLoading.value = false;
    emailPasswordVerified.value = false;
    devMode.value = false;
    twoFactorMethod.value = 'email';
    passkeyAvailable.value = false;
    availableMethods.value = ['email'];
    errorMessage.value = '';
    userEmail.value = '';
  }

  return {
    loading,
    resendLoading,
    emailPasswordVerified,
    devMode,
    twoFactorMethod,
    passkeyAvailable,
    availableMethods,
    errorMessage,
    userEmail,
    canSubmitPassword,
    canSubmitVerificationCode,
    verifyPassword,
    verifyTwoFactor,
    resendVerificationCode,
    switchMethod,
    reset
  };
}
