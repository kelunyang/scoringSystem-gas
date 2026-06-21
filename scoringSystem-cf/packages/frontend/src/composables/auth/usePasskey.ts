/**
 * @fileoverview Passkey (WebAuthn) composable
 * Handles passkey registration, authentication, and management
 */

import { ref, computed } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { rpcClient } from '@/utils/rpc-client';
import type { Ref, ComputedRef } from 'vue';

// ─── Types ───

export interface PasskeyCredential {
  credentialId: string;
  deviceName: string;
  transports: string[];
  createdAt: number;
  lastUsedAt: number | null;
  backedUp: boolean;
}

export interface PasskeyStatus {
  enabled: boolean;
  credentialCount: number;
  credentials: PasskeyCredential[];
}

export interface UsePasskeyReturn {
  // State
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  isSupported: ComputedRef<boolean>;
  status: Ref<PasskeyStatus | null>;

  // Settings page methods
  fetchStatus: () => Promise<void>;
  registerPasskey: (deviceName?: string) => Promise<boolean>;
  renamePasskey: (credentialId: string, deviceName: string) => Promise<boolean>;
  deletePasskey: (credentialId: string, password: string) => Promise<boolean>;

  // Authentication methods
  initAuthentication: (userEmail: string) => Promise<any>;
  verifyAuthentication: (userEmail: string, turnstileToken: string) => Promise<boolean>;
}

// ─── Helper Functions ───

/**
 * Check if WebAuthn is supported in the current browser
 */
function checkWebAuthnSupport(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/**
 * Convert Base64URL to ArrayBuffer
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to Base64URL
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Composable ───

/**
 * Composable for Passkey (WebAuthn) operations
 *
 * @example
 * // In PasskeySetup.vue
 * import { usePasskey } from '@/composables/auth/usePasskey';
 *
 * const {
 *   isSupported,
 *   status,
 *   registerPasskey,
 *   deletePasskey
 * } = usePasskey();
 *
 * // Register a new passkey
 * await registerPasskey('My iPhone');
 *
 * // Delete a passkey
 * await deletePasskey(credentialId, password);
 */
export function usePasskey(): UsePasskeyReturn {
  const queryClient = useQueryClient();
  const loading = ref(false);
  const errorMessage = ref('');
  const status = ref<PasskeyStatus | null>(null);

  // Store credential for authentication flow
  let pendingCredential: PublicKeyCredential | null = null;

  const isSupported = computed(() => checkWebAuthnSupport());

  /**
   * Fetch passkey status for current user
   */
  async function fetchStatus(): Promise<void> {
    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any).passkey.status.$get();
      const response = await httpResponse.json();

      if (response.success) {
        status.value = response.data;
      } else {
        errorMessage.value = response.error?.message || '無法取得 Passkey 狀態';
      }
    } catch (error: any) {
      errorMessage.value = error.message || '取得狀態時發生錯誤';
    } finally {
      loading.value = false;
    }
  }

  /**
   * Register a new passkey
   */
  async function registerPasskey(deviceName?: string): Promise<boolean> {
    if (!isSupported.value) {
      errorMessage.value = '您的瀏覽器不支援 Passkey';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      // Step 1: Get registration options from server
      const initResponse = await (rpcClient.api.auth as any).passkey['register-init'].$post({
        json: {}
      });
      const initResult = await initResponse.json();

      if (!initResult.success) {
        errorMessage.value = initResult.error?.message || '初始化失敗';
        return false;
      }

      const options = initResult.data;

      // Convert base64url strings to ArrayBuffers for WebAuthn API
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64UrlToArrayBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64UrlToArrayBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation,
        timeout: options.timeout,
        excludeCredentials: options.excludeCredentials.map((cred: any) => ({
          id: base64UrlToArrayBuffer(cred.id),
          type: cred.type,
          transports: cred.transports
        }))
      };

      // Step 2: Create credential using browser WebAuthn API
      const credential = await navigator.credentials.create({
        publicKey: publicKeyOptions
      }) as PublicKeyCredential;

      if (!credential) {
        errorMessage.value = '建立 Passkey 失敗';
        return false;
      }

      const attestationResponse = credential.response as AuthenticatorAttestationResponse;

      // Step 3: Send credential to server for verification
      const verifyResponse = await (rpcClient.api.auth as any).passkey['register-verify'].$post({
        json: {
          id: credential.id,
          rawId: arrayBufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: arrayBufferToBase64Url(attestationResponse.clientDataJSON),
            attestationObject: arrayBufferToBase64Url(attestationResponse.attestationObject),
            transports: attestationResponse.getTransports?.() || ['internal', 'hybrid']
          },
          deviceName: deviceName || getDefaultDeviceName()
        }
      });

      const verifyResult = await verifyResponse.json();

      if (verifyResult.success) {
        // Refresh status
        await fetchStatus();
        return true;
      } else {
        errorMessage.value = verifyResult.error?.message || '驗證失敗';
        return false;
      }
    } catch (error: any) {
      // Handle user cancellation
      if (error.name === 'NotAllowedError') {
        errorMessage.value = '操作已取消';
      } else {
        errorMessage.value = error.message || '註冊時發生錯誤';
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Rename a passkey
   */
  async function renamePasskey(credentialId: string, deviceName: string): Promise<boolean> {
    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any).passkey.credentials[':credentialId'].$patch({
        param: { credentialId },
        json: { deviceName }
      });
      const response = await httpResponse.json();

      if (response.success) {
        // Refresh status
        await fetchStatus();
        return true;
      } else {
        errorMessage.value = response.error?.message || '重新命名失敗';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = error.message || '重新命名時發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Delete a passkey
   */
  async function deletePasskey(credentialId: string, password: string): Promise<boolean> {
    loading.value = true;
    errorMessage.value = '';

    try {
      const httpResponse = await (rpcClient.api.auth as any).passkey.credentials[':credentialId'].$delete({
        param: { credentialId },
        json: { password }
      });
      const response = await httpResponse.json();

      if (response.success) {
        // Refresh status
        await fetchStatus();
        return true;
      } else {
        errorMessage.value = response.error?.message || '刪除失敗';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = error.message || '刪除時發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Initialize passkey authentication (called during login)
   */
  async function initAuthentication(userEmail: string): Promise<any> {
    if (!isSupported.value) {
      errorMessage.value = '您的瀏覽器不支援 Passkey';
      return null;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      // Get authentication options from server
      const initResponse = await (rpcClient.api.auth as any).passkey['auth-init'].$post({
        json: { userEmail }
      });
      const initResult = await initResponse.json();

      if (!initResult.success) {
        errorMessage.value = initResult.error?.message || '初始化認證失敗';
        return null;
      }

      const options = initResult.data;

      // Convert base64url strings to ArrayBuffers
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64UrlToArrayBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentials: options.allowCredentials.map((cred: any) => ({
          id: base64UrlToArrayBuffer(cred.id),
          type: cred.type,
          transports: cred.transports
        }))
      };

      // Get assertion using browser WebAuthn API
      const credential = await navigator.credentials.get({
        publicKey: publicKeyOptions
      }) as PublicKeyCredential;

      if (!credential) {
        errorMessage.value = '認證失敗';
        return null;
      }

      // Store credential for verification step
      pendingCredential = credential;

      return credential;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        errorMessage.value = '操作已取消';
      } else {
        errorMessage.value = error.message || '認證時發生錯誤';
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Verify passkey authentication and complete login
   */
  async function verifyAuthentication(userEmail: string, turnstileToken: string): Promise<boolean> {
    if (!pendingCredential) {
      errorMessage.value = '請先進行 Passkey 認證';
      return false;
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      const assertionResponse = pendingCredential.response as AuthenticatorAssertionResponse;

      const httpResponse = await (rpcClient.api.auth as any).passkey['auth-verify'].$post({
        json: {
          userEmail,
          id: pendingCredential.id,
          rawId: arrayBufferToBase64Url(pendingCredential.rawId),
          type: pendingCredential.type,
          response: {
            clientDataJSON: arrayBufferToBase64Url(assertionResponse.clientDataJSON),
            authenticatorData: arrayBufferToBase64Url(assertionResponse.authenticatorData),
            signature: arrayBufferToBase64Url(assertionResponse.signature),
            userHandle: assertionResponse.userHandle
              ? arrayBufferToBase64Url(assertionResponse.userHandle)
              : undefined
          },
          turnstileToken
        }
      });

      const response = await httpResponse.json();

      if (response.success) {
        // Save session to sessionStorage
        if (response.data.sessionId) {
          sessionStorage.setItem('sessionId', response.data.sessionId);
        }

        // Invalidate current user query
        await queryClient.invalidateQueries({
          queryKey: ['currentUser'],
          refetchType: 'active'
        });

        pendingCredential = null;
        return true;
      } else {
        errorMessage.value = response.error?.message || '驗證失敗';
        return false;
      }
    } catch (error: any) {
      errorMessage.value = error.message || '驗證時發生錯誤';
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    errorMessage,
    isSupported,
    status,
    fetchStatus,
    registerPasskey,
    renamePasskey,
    deletePasskey,
    initAuthentication,
    verifyAuthentication
  };
}

// ─── Helper Functions ───

/**
 * Get default device name based on user agent
 */
function getDefaultDeviceName(): string {
  const ua = navigator.userAgent;

  if (/iPhone/.test(ua)) {
    return 'iPhone';
  } else if (/iPad/.test(ua)) {
    return 'iPad';
  } else if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) {
      return 'Android 手機';
    }
    return 'Android 平板';
  } else if (/Mac/.test(ua)) {
    return 'Mac';
  } else if (/Windows/.test(ua)) {
    return 'Windows 電腦';
  } else if (/Linux/.test(ua)) {
    return 'Linux 電腦';
  }

  return 'Passkey';
}
