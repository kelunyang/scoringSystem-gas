<template>
  <div class="auth-form">
    <!-- Steps Indicator -->
    <div class="steps-container">
      <el-steps
        :active="codeVerified ? 2 : (emailVerified ? 1 : 0)"
        finish-status="success"
        align-center
        role="navigation"
        aria-label="密碼重設流程步驟"
      >
        <el-step
          title="驗證帳號"
          description="輸入email確認身份"
          :status="step1Status"
        >
          <template #icon>
            <i v-if="emailVerified" class="fas fa-check-circle step-icon step-icon--success"></i>
            <i v-else class="fas fa-envelope step-icon step-icon--active"></i>
          </template>
        </el-step>
        <el-step
          title="兩階段驗證"
          description="輸入驗證碼"
          :status="step2Status"
        >
          <template #icon>
            <i v-if="codeVerified" class="fas fa-check-circle step-icon step-icon--success"></i>
            <i v-else-if="emailVerified" class="fas fa-shield-halved step-icon step-icon--active"></i>
            <i v-else class="fas fa-shield-halved step-icon step-icon--wait"></i>
          </template>
        </el-step>
        <el-step
          title="選擇專案"
          description="識別未參與專案"
          :status="step3Status"
        >
          <template #icon>
            <i v-if="codeVerified" class="fas fa-list-check step-icon step-icon--active"></i>
            <i v-else class="fas fa-list-check step-icon step-icon--wait"></i>
          </template>
        </el-step>
      </el-steps>
    </div>

    <!-- Success Message -->
    <div
      v-if="resetSent"
      class="success-message"
      role="status"
      aria-live="polite"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      密碼已重設，請收信並依據信中的新密碼登入
    </div>

    <!-- Step 1: Email Verification -->
    <EmailVerificationStep
      v-if="!emailVerified && !resetSent"
      key="email-verification-step"
      @submit="handleEmailSubmit"
      :loading="loading"
    />

    <!-- Step 2: Two-Factor Verification -->
    <TwoFactorStep
      v-else-if="emailVerified && !codeVerified && !resetSent"
      key="twofactor-step"
      :user-email="userEmail"
      theme-color="#E17055"
      @submit="handleTwoFactorSubmit"
      @resend="handleResendCode"
      :loading="loading"
      :resend-loading="resendLoading"
    />

    <!-- Step 3: Project Selection -->
    <ProjectSelectionStep
      v-else-if="codeVerified && !resetSent"
      key="project-selection-step"
      :projects="projects"
      @submit="handleProjectSubmit"
      :loading="loading"
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
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import EmailVerificationStep from './EmailVerificationStep.vue';
import TwoFactorStep from './TwoFactorStep.vue';
import ProjectSelectionStep from './ProjectSelectionStep.vue';
import { useForgotPassword } from '../../composables/auth/useForgotPassword';
import type { TwoFactorData } from '../../types/auth';

// Props & Emits
defineEmits<{
  passwordResetSuccess: [];
}>();

// Forgot password composable
const {
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
  verifyEmail,
  verifyCode,
  resendCode,
  resetPassword
} = useForgotPassword();

// Computed properties for step status
const step1Status = computed(() => {
  if (loading.value && !emailVerified.value) return 'process';
  if (emailVerified.value) return 'success';
  return 'wait';
});

const step2Status = computed(() => {
  if (loading.value && emailVerified.value && !codeVerified.value) return 'process';
  if (codeVerified.value) return 'success';
  return 'wait';
});

const step3Status = computed(() => {
  if (loading.value && codeVerified.value) return 'process';
  return 'wait';
});

/**
 * Handle email verification (Step 1)
 */
async function handleEmailSubmit(data: { email: string; turnstileToken: string }) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await verifyEmail(data.email, data.turnstileToken);

  if (success) {
    ElMessage({
      type: 'success',
      message: '驗證碼已發送到您的郵箱，請查收',
      duration: 3000
    });
  }
}

/**
 * Handle 2FA code verification (Step 2)
 */
async function handleTwoFactorSubmit(data: TwoFactorData) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await verifyCode(data.code, data.turnstileToken || '');

  if (success) {
    ElMessage({
      type: 'success',
      message: '驗證成功！請選擇您未參與的專案',
      duration: 2000
    });
  }
  // Error message is already displayed via errorMessage reactive ref
}

/**
 * Handle resend verification code
 */
async function handleResendCode(data: { turnstileToken: string }) {
  // Guard against concurrent calls
  if (resendLoading.value) return;

  const success = await resendCode(data.turnstileToken);

  if (success) {
    ElMessage({
      type: 'success',
      message: '驗證碼已重新發送',
      duration: 2000
    });
  }
  // Error message is already displayed via errorMessage reactive ref
}

/**
 * Handle password reset (Step 3)
 */
async function handleProjectSubmit(data: { selectedProjectIds: string[]; allParticipated: boolean; turnstileToken: string }) {
  // Guard against concurrent calls
  if (loading.value) return;

  // Update composable's reactive refs with form data
  // This ensures the resetPassword() function can read the correct values
  selectedProjectIds.value = data.selectedProjectIds;
  allParticipated.value = data.allParticipated;

  await resetPassword(data.turnstileToken);
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
  color: #FAB1A0;
}

.step-icon--active {
  color: #E17055;
}

.step-icon--wait {
  color: #94a3b8;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background-color: #fef5f0;
  border: 1px solid #FAB1A0;
  border-radius: 6px;
  color: #D35400;
  font-size: 14px;
}

.success-message svg {
  flex-shrink: 0;
  color: #FAB1A0;
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
