<template>
  <div class="auth-form">
    <!-- Steps Indicator -->
    <div class="steps-container">
      <el-steps
        :active="emailPasswordVerified ? 1 : 0"
        finish-status="success"
        align-center
        role="navigation"
        aria-label="登入流程步驟"
      >
        <el-step
          title="驗證密碼"
          description="確認email和密碼"
          :status="step1Status"
        >
          <template #icon>
            <i v-if="emailPasswordVerified" class="fas fa-check-circle step-icon step-icon--success"></i>
            <i v-else class="fas fa-lock step-icon step-icon--active"></i>
          </template>
        </el-step>
        <el-step
          :title="stepTwoTitle"
          :description="stepTwoDescription"
          :status="step2Status"
        >
          <template #icon>
            <i v-if="emailPasswordVerified" :class="stepTwoIconClass + ' step-icon step-icon--active'"></i>
            <i v-else :class="stepTwoIconClass + ' step-icon step-icon--wait'"></i>
          </template>
        </el-step>
      </el-steps>
    </div>

    <!-- Step 1: Password Verification -->
    <PasswordStep
      v-if="!emailPasswordVerified"
      key="password-step"
      @submit="handlePasswordSubmit"
      :loading="loading"
    />

    <!-- Step 2: Two-Factor Verification -->
    <TwoFactorStep
      v-else
      key="twofactor-step"
      :user-email="userEmail"
      :method="twoFactorMethod"
      :available-methods="availableMethods"
      theme-color="#1A9B8E"
      @submit="handleTwoFactorSubmit"
      @resend="handleResendCode"
      @passkey-success="handlePasskeySuccess"
      @method-change="handleMethodChange"
      :loading="loading"
      :resend-loading="resendLoading"
    />

    <!-- Error Message -->
    <div
      v-if="errorMessage"
      class="error-message"
      role="alert"
      aria-live="assertive"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/>
        <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/>
      </svg>
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PasswordStep from './PasswordStep.vue';
import TwoFactorStep from './TwoFactorStep.vue';
import { useLogin } from '../../composables/auth/useLogin';
import type { LoginCredentials, TwoFactorData, TwoFactorMethod } from '../../types/auth';

// Props & Emits
const emit = defineEmits<{
  loginSuccess: [];
}>();

// Login composable
const {
  loading,
  resendLoading,
  emailPasswordVerified,
  devMode,
  twoFactorMethod,
  passkeyAvailable,
  availableMethods,
  errorMessage,
  userEmail,
  verifyPassword,
  verifyTwoFactor,
  resendVerificationCode,
  switchMethod
} = useLogin();

// Track current selected method (for display purposes)
const currentMethod = ref<TwoFactorMethod>('email');

// Computed properties for step status
const step1Status = computed(() => {
  if (loading.value && !emailPasswordVerified.value) return 'process';
  if (emailPasswordVerified.value) return 'success';
  return 'wait';
});

const step2Status = computed(() => {
  if (loading.value && emailPasswordVerified.value) return 'process';
  return 'wait';
});

// Step 2 title/description based on method
const stepTwoTitle = computed(() => {
  const method = currentMethod.value || twoFactorMethod.value;
  if (method === 'passkey') return 'Passkey 驗證';
  if (method === 'totp') return '驗證器驗證';
  return '兩階段驗證';
});

const stepTwoDescription = computed(() => {
  const method = currentMethod.value || twoFactorMethod.value;
  if (method === 'passkey') return '使用生物辨識';
  if (method === 'totp') return '輸入驗證器驗證碼';
  return '輸入驗證碼';
});

const stepTwoIconClass = computed(() => {
  const method = currentMethod.value || twoFactorMethod.value;
  if (method === 'passkey') return 'fas fa-fingerprint';
  if (method === 'totp') return 'fas fa-shield-alt';
  return 'fas fa-envelope';
});

/**
 * Handle method change from TwoFactorStep
 */
function handleMethodChange(method: TwoFactorMethod) {
  currentMethod.value = method;
  switchMethod(method);
}

/**
 * Handle password verification (Step 1)
 */
async function handlePasswordSubmit(data: { credentials: LoginCredentials; turnstileToken: string }) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await verifyPassword(data.credentials, data.turnstileToken);

  if (success) {
    // Update current method to match the preferred method
    currentMethod.value = twoFactorMethod.value;

    // In dev mode (SMTP not configured), auto-complete login
    // TOTP and Passkey users must always verify even in dev mode
    if (devMode.value && twoFactorMethod.value === 'email' && !passkeyAvailable.value) {
      ElMessage({
        type: 'info',
        message: '開發模式：自動完成登入...',
        duration: 1500
      });
      // Auto-call 2FA with dummy code
      const twoFactorSuccess = await verifyTwoFactor({
        email: data.credentials.email,
        code: '' // Will be replaced with dummy code in devMode
      });
      if (twoFactorSuccess) {
        ElMessage({
          type: 'success',
          message: '登入成功！',
          duration: 2000
        });
        emit('loginSuccess');
      }
    } else {
      ElMessage({
        type: 'success',
        message: '密碼驗證成功！請完成兩階段驗證',
        duration: 2000
      });
    }
  }
}

/**
 * Handle 2FA code verification (Step 2)
 */
async function handleTwoFactorSubmit(data: TwoFactorData) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await verifyTwoFactor(data);

  if (success) {
    ElMessage({
      type: 'success',
      message: '登入成功！',
      duration: 2000
    });

    // Emit success event to close modal
    emit('loginSuccess');
  }
}

/**
 * Handle successful passkey authentication
 */
function handlePasskeySuccess() {
  ElMessage({
    type: 'success',
    message: '登入成功！',
    duration: 2000
  });

  // Emit success event to close modal
  emit('loginSuccess');
}

/**
 * Handle resend verification code
 */
async function handleResendCode(data: { turnstileToken: string }) {
  // Guard against concurrent calls
  if (resendLoading.value) return;

  const success = await resendVerificationCode(data.turnstileToken);

  if (success) {
    ElMessage({
      type: 'success',
      message: '驗證碼已重新發送',
      duration: 2000
    });
  }
}
</script>

<style scoped>
.auth-form {
  padding: 20px 0;
}

.steps-container {
  margin-bottom: 30px;
  padding: 20px;
}

.step-icon {
  font-size: inherit;
}

.step-icon--success {
  color: #44B9A5;
}

.step-icon--active {
  color: #1A9B8E;
}

.step-icon--wait {
  color: #94a3b8;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-top: 16px;
  background-color: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 6px;
  color: #f56c6c;
  font-size: 14px;
}

.error-message svg {
  flex-shrink: 0;
}
</style>
