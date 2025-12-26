/**
 * @fileoverview Forgot password composable
 * Handles three-step password reset flow: email verification → 2FA → project selection
 */

import { ref, computed, onBeforeUnmount } from 'vue';
import { rpcClient } from '@/utils/rpc-client';
import type { Ref, ComputedRef } from 'vue';
import type { ForgotPasswordData, EmailVerificationResponse, Project, TwoFactorData } from '../../types/auth';

export interface UseForgotPasswordReturn {
  loading: Ref<boolean>;
  resendLoading: Ref<boolean>;
  emailVerified: Ref<boolean>;
  codeVerified: Ref<boolean>;
  resetSent: Ref<boolean>;
  errorMessage: Ref<string>;
  projects: Ref<Project[]>;
  userEmail: Ref<string>;
  selectedProjectIds: Ref<string[]>;
  allParticipated: Ref<boolean>;
  canVerifyEmail: ComputedRef<boolean>;
  canVerifyCode: ComputedRef<boolean>;
  canResetPassword: ComputedRef<boolean>;
  verifyEmail: (email: string, turnstileToken: string) => Promise<boolean>;
  verifyCode: (code: string, turnstileToken: string) => Promise<boolean>;
  resendCode: (turnstileToken: string) => Promise<boolean>;
  resetPassword: (turnstileToken: string) => Promise<boolean>;
  reset: () => void;
}

/**
 * Composable for password reset flow management
 *
 * Handles the three-step password reset process:
 * Step 1: Email verification → sends 2FA code with IP/country info
 * Step 2: 2FA verification → receives project list
 * Step 3: Project selection verification → password reset
 *
 * Security feature: Always shows success message regardless of actual result
 * to prevent user enumeration attacks.
 *
 * @param apiClient - API client instance
 * @returns Forgot password state and methods
 *
 * @example
 * // In ForgotPasswordForm.vue
 * import { useForgotPassword } from '@/composables/auth/useForgotPassword';
 * import { inject } from 'vue';
 *
 * const {
 *   emailVerified,
 *   codeVerified,
 *   projects,
 *   verifyEmail,
 *   verifyCode,
 *   resetPassword
 * } = useForgotPassword();
 *
 * // Step 1: Verify email and send 2FA
 * await verifyEmail(userEmail);
 *
 * // Step 2: Verify 2FA code
 * await verifyCode(verificationCode);
 *
 * // Step 3: Reset password
 * await resetPassword(turnstileToken);
 */
export function useForgotPassword(): UseForgotPasswordReturn {
  const loading = ref(false);
  const resendLoading = ref(false);
  const emailVerified = ref(false);
  const codeVerified = ref(false);
  const resetSent = ref(false);
  const errorMessage = ref('');
  const projects = ref<Project[]>([]);
  const userEmail = ref('');
  const selectedProjectIds = ref<string[]>([]);
  const allParticipated = ref(false);

  // Store timeout ID for cleanup
  const resetTimeoutId = ref<number | null>(null);

  const canVerifyEmail = computed(() => {
    return userEmail.value.trim().length > 0 && !loading.value && !emailVerified.value;
  });

  const canVerifyCode = computed(() => {
    return emailVerified.value && !loading.value && !codeVerified.value;
  });

  const canResetPassword = computed(() => {
    return codeVerified.value &&
           !loading.value &&
           (allParticipated.value || selectedProjectIds.value.length > 0);
  });

  /**
   * Step 1: Verify email and send 2FA code
   */
  async function verifyEmail(email: string, turnstileToken: string): Promise<boolean> {
    if (!email) {
      errorMessage.value = '請輸入電子郵件';
      return false;
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorMessage.value = '請輸入有效的電子郵件地址';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['verify-email-for-reset'].$post({
        json: {
          userEmail: email.trim(),
          turnstileToken
        }
      });

      const response: EmailVerificationResponse = await httpResponse.json();

      if (response.success && response.data) {
        emailVerified.value = true;
        userEmail.value = email;
        // No longer receives projects here - moved to step 2
        return true;
      } else {
        errorMessage.value = response.error?.message || 'Email 驗證失敗';
        return false;
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      errorMessage.value = '網路錯誤，請重試';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Step 2: Verify 2FA code and get project list
   */
  async function verifyCode(code: string, turnstileToken: string): Promise<boolean> {
    if (!code) {
      errorMessage.value = '請輸入驗證碼';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['password-reset-verify-code'].$post({
        json: {
          userEmail: userEmail.value.trim(),
          code: code.trim().toUpperCase(),
          turnstileToken
        }
      });

      const response = await httpResponse.json();

      if (response.success && response.data) {
        codeVerified.value = true;
        projects.value = response.data.projects || [];
        return true;
      } else {
        errorMessage.value = response.error?.message || '驗證碼錯誤';

        // If code verification fails, restart the entire flow
        if (response.error?.code === 'INVALID_CODE' ||
            response.error?.code === 'CODE_NOT_FOUND' ||
            response.error?.code === 'TOO_MANY_ATTEMPTS') {
          // Allow user to try again or restart
          return false;
        }

        return false;
      }
    } catch (error: any) {
      console.error('2FA verification error:', error);
      errorMessage.value = '網路錯誤，請重試';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Resend 2FA verification code
   */
  async function resendCode(turnstileToken: string): Promise<boolean> {
    resendLoading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['verify-email-for-reset'].$post({
        json: {
          userEmail: userEmail.value.trim(),
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
      console.error('Resend code error:', error);
      errorMessage.value = '網路錯誤，請重試';
      return false;
    } finally {
      resendLoading.value = false;
    }
  }

  /**
   * Step 2: Reset password with project verification
   *
   * Security note: Always returns success to prevent user enumeration
   */
  async function resetPassword(turnstileToken: string): Promise<boolean> {
    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any)['reset-password'].$post({
        json: {
          userEmail: userEmail.value.trim(),
          selectedProjectIds: selectedProjectIds.value,
          allParticipated: allParticipated.value,
          turnstileToken
        }
      });

      const response = await httpResponse.json();

      // Always show success (security feature)
      resetSent.value = true;

      // Auto-reset form after 3 seconds (store timeout ID for cleanup)
      resetTimeoutId.value = setTimeout(() => {
        reset();
        resetTimeoutId.value = null;
      }, 3000) as unknown as number;

      return true;
    } catch (error: any) {
      console.error('Password reset error:', error);

      // Still show success message (security feature)
      resetSent.value = true;

      // Auto-reset form after 3 seconds (store timeout ID for cleanup)
      resetTimeoutId.value = setTimeout(() => {
        reset();
        resetTimeoutId.value = null;
      }, 3000) as unknown as number;

      return true; // Always return true for security
    } finally {
      loading.value = false;
    }
  }

  /**
   * Handle "all participated" checkbox change
   */
  function handleAllParticipatedChange(checked: boolean) {
    if (checked) {
      // Clear project selection when checking "all participated"
      selectedProjectIds.value = [];
    }
  }

  /**
   * Reset forgot password state
   */
  function reset() {
    // Clear timeout if exists
    if (resetTimeoutId.value !== null) {
      clearTimeout(resetTimeoutId.value);
      resetTimeoutId.value = null;
    }

    loading.value = false;
    resendLoading.value = false;
    emailVerified.value = false;
    codeVerified.value = false;
    resetSent.value = false;
    errorMessage.value = '';
    projects.value = [];
    userEmail.value = '';
    selectedProjectIds.value = [];
    allParticipated.value = false;
  }

  /**
   * Cleanup timeout on component unmount
   */
  onBeforeUnmount(() => {
    if (resetTimeoutId.value !== null) {
      clearTimeout(resetTimeoutId.value);
      resetTimeoutId.value = null;
    }
  });

  return {
    loading,
    resendLoading,
    emailVerified,
    codeVerified,
    resetSent,
    errorMessage,
    projects,
    userEmail,
    selectedProjectIds,
    allParticipated,
    canVerifyEmail,
    canVerifyCode,
    canResetPassword,
    verifyEmail,
    verifyCode,
    resendCode,
    resetPassword,
    reset
  };
}
