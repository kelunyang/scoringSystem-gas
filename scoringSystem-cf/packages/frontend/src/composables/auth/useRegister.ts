/**
 * @fileoverview Registration composable
 * Handles two-step registration flow: invitation verification → user registration
 */

import { ref, computed } from 'vue';
import { rpcClient } from '@/utils/rpc-client';
import type { Ref, ComputedRef } from 'vue';
import type { RegisterData, InvitationVerificationResponse } from '../../types/auth';

export interface UseRegisterReturn {
  loading: Ref<boolean>;
  invitationVerified: Ref<boolean>;
  errorMessage: Ref<string>;
  availableTags: Ref<string[]>;
  targetEmail: Ref<string | undefined>;
  verifiedInvitationCode: Ref<string | undefined>;
  checkingInvitation: Ref<boolean>;
  invitationStatus: Ref<'idle' | 'checking' | 'valid' | 'invalid' | 'used' | 'expired'>;
  invitationStatusMessage: Ref<string>;
  canVerifyInvitation: ComputedRef<boolean>;
  canRegister: ComputedRef<boolean>;
  verifyInvitation: (invitationCode: string, userEmail: string, turnstileToken: string) => Promise<boolean>;
  checkInvitationStatus: (invitationCode: string, userEmail: string) => Promise<void>;
  register: (data: RegisterData) => Promise<boolean>;
  reset: () => void;
  backToInvitationStep: () => void;
}

/**
 * Composable for registration flow management
 *
 * Handles the two-step registration process:
 * Step 1: Invitation code verification
 * Step 2: User information registration
 *
 * @param apiClient - API client instance
 * @returns Registration state and methods
 *
 * @example
 * // In RegisterForm.vue
 * import { useRegister } from '@/composables/auth/useRegister';
 * import { inject } from 'vue';
 *
 * const {
 *   loading,
 *   invitationVerified,
 *   verifyInvitation,
 *   register
 * } = useRegister();
 *
 * // Step 1: Verify invitation
 * await verifyInvitation(code, email, turnstileToken);
 *
 * // Step 2: Register user
 * const success = await register(registerData);
 */
export function useRegister(): UseRegisterReturn {
  const loading = ref(false);
  const invitationVerified = ref(false);
  const errorMessage = ref('');
  const availableTags = ref<string[]>([]);
  const targetEmail = ref<string | undefined>();
  const verifiedInvitationCode = ref<string | undefined>();

  // Real-time invitation status checking
  const checkingInvitation = ref(false);
  const invitationStatus = ref<'idle' | 'checking' | 'valid' | 'invalid' | 'used' | 'expired'>('idle');
  const invitationStatusMessage = ref('');

  const canVerifyInvitation = computed(() => {
    return !loading.value && !invitationVerified.value;
  });

  const canRegister = computed(() => {
    return invitationVerified.value && !loading.value;
  });

  /**
   * Step 1: Verify invitation code
   */
  async function verifyInvitation(
    invitationCode: string,
    userEmail: string,
    turnstileToken: string
  ): Promise<boolean> {
    if (!invitationCode || !userEmail) {
      errorMessage.value = '請輸入邀請碼和電子郵件';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await rpcClient.invitations.verify.$post({
        json: {
          invitationCode: invitationCode.trim(),
          userEmail: userEmail.trim(),
          turnstileToken
        }
      });

      const response: InvitationVerificationResponse = await httpResponse.json();

      if (response.success && response.data) {
        invitationVerified.value = true;
        targetEmail.value = response.data.targetEmail;
        verifiedInvitationCode.value = invitationCode.trim();
        availableTags.value = response.data.availableTags || [];
        return true;
      } else {
        errorMessage.value = response.error?.message || '邀請碼驗證失敗';
        return false;
      }
    } catch (error: any) {
      console.error('Invitation verification error:', error);
      errorMessage.value = error.message || '驗證過程發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Check invitation code status in real-time (without Turnstile)
   * Used for providing immediate feedback as user types
   */
  async function checkInvitationStatus(
    invitationCode: string,
    userEmail: string
  ): Promise<void> {
    if (!invitationCode || !userEmail || invitationCode.length < 12) {
      invitationStatus.value = 'idle';
      invitationStatusMessage.value = '';
      return;
    }

    checkingInvitation.value = true;
    invitationStatus.value = 'checking';
    invitationStatusMessage.value = '';

    try {
      const httpResponse = await rpcClient.invitations.verify.$post({
        json: {
          invitationCode: invitationCode.trim(),
          userEmail: userEmail.trim(),
          turnstileToken: '' // Empty for real-time checks
        }
      });

      const response: InvitationVerificationResponse = await httpResponse.json();

      if (response.success) {
        invitationStatus.value = 'valid';
        invitationStatusMessage.value = '邀請碼有效';
      } else {
        // Parse error to determine specific status
        const errorMsg = response.error?.message || '';
        if (errorMsg.includes('already been used') || errorMsg.includes('maximum uses')) {
          invitationStatus.value = 'used';
          invitationStatusMessage.value = '此邀請碼已被使用';
        } else if (errorMsg.includes('expired')) {
          invitationStatus.value = 'expired';
          invitationStatusMessage.value = '邀請碼已過期';
        } else {
          invitationStatus.value = 'invalid';
          invitationStatusMessage.value = '請輸入正確的邀請碼+受邀Email組合';
        }
      }
    } catch (error) {
      invitationStatus.value = 'invalid';
      invitationStatusMessage.value = '驗證失敗';
    } finally {
      checkingInvitation.value = false;
    }
  }

  /**
   * Step 2: Register new user
   */
  async function register(data: RegisterData): Promise<boolean> {
    // Validate email format
    const email = data.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorMessage.value = '請輸入有效的電子郵件地址';
      return false;
    }

    // Validate password match
    if (data.password !== data.confirmPassword) {
      errorMessage.value = '密碼與確認密碼不符';
      return false;
    }

    // Validate required fields
    if (!data.displayName.trim()) {
      errorMessage.value = '請輸入顯示名稱';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await rpcClient.api.auth.register.$post({
        json: {
          invitationCode: verifiedInvitationCode.value || data.invitationCode.trim(),
          password: data.password,
          userEmail: email,
          displayName: data.displayName.trim(),
          avatarSeed: data.avatarSeed || generateDefaultSeed(),
          avatarStyle: data.avatarStyle,
          avatarOptions: data.avatarOptions,
          turnstileToken: data.turnstileToken || ''
        }
      });

      const response = await httpResponse.json();

      if (response.success) {
        return true;
      } else {
        errorMessage.value = response.error?.message || '註冊失敗';
        return false;
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      errorMessage.value = error.message || '註冊過程發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Go back to invitation step
   */
  function backToInvitationStep() {
    invitationVerified.value = false;
    targetEmail.value = undefined;
    verifiedInvitationCode.value = undefined;
    availableTags.value = [];
    errorMessage.value = '';

    // Clear real-time validation status
    checkingInvitation.value = false;
    invitationStatus.value = 'idle';
    invitationStatusMessage.value = '';
  }

  /**
   * Reset registration state
   */
  function reset() {
    loading.value = false;
    invitationVerified.value = false;
    errorMessage.value = '';
    availableTags.value = [];
    targetEmail.value = undefined;
    verifiedInvitationCode.value = undefined;

    // Clear real-time validation status
    checkingInvitation.value = false;
    invitationStatus.value = 'idle';
    invitationStatusMessage.value = '';
  }

  /**
   * Generate default seed for avatar
   */
  function generateDefaultSeed(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  return {
    loading,
    invitationVerified,
    errorMessage,
    availableTags,
    targetEmail,
    verifiedInvitationCode,
    checkingInvitation,
    invitationStatus,
    invitationStatusMessage,
    canVerifyInvitation,
    canRegister,
    verifyInvitation,
    checkInvitationStatus,
    register,
    reset,
    backToInvitationStep
  };
}
