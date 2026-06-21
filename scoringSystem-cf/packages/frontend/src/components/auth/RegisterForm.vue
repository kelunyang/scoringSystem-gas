<template>
  <div class="auth-form">
    <!-- Steps Indicator -->
    <div class="steps-container">
      <el-steps
        :active="activeStep"
        finish-status="success"
        align-center
        role="navigation"
        aria-label="註冊流程步驟"
      >
        <el-step
          title="驗證邀請碼"
          description="確認邀請碼有效性"
          :status="step1Status"
        >
          <template #icon>
            <i v-if="invitationVerified" class="fas fa-check-circle step-icon step-icon--success"></i>
            <i v-else class="fas fa-envelope-open-text step-icon step-icon--active"></i>
          </template>
        </el-step>
        <el-step
          title="填寫資料"
          description="完成註冊資訊"
          :status="step2Status"
        >
          <template #icon>
            <i v-if="registrationComplete" class="fas fa-check-circle step-icon step-icon--success"></i>
            <i v-else-if="invitationVerified" class="fas fa-user-edit step-icon step-icon--active"></i>
            <i v-else class="fas fa-user-plus step-icon step-icon--wait"></i>
          </template>
        </el-step>
        <el-step
          title="驗證器設定"
          description="設定登入驗證方式"
          :status="step3Status"
        >
          <template #icon>
            <i v-if="registrationComplete" class="fas fa-shield-alt step-icon step-icon--active"></i>
            <i v-else class="fas fa-shield-alt step-icon step-icon--wait"></i>
          </template>
        </el-step>
      </el-steps>
    </div>

    <!-- Step 1: Invitation Verification -->
    <InvitationStep
      v-if="!invitationVerified"
      key="invitation-step"
      @submit="handleInvitationSubmit"
      @checkInvitation="handleInvitationCheck"
      :loading="loading"
      :checkingInvitation="checkingInvitation"
      :invitationStatus="invitationStatus"
      :invitationStatusMessage="invitationStatusMessage"
    />

    <!-- Step 2: User Information -->
    <UserInfoStep
      v-else-if="!registrationComplete"
      key="userinfo-step"
      :target-email="targetEmail"
      @submit="handleRegisterSubmit"
      @back="handleBack"
      :loading="loading"
    />

    <!-- Step 3: 2FA Setup (Passkey preferred) -->
    <div v-else class="twofa-setup-step">
      <!-- Passkey Setup (Default) -->
      <template v-if="setupMethod === 'passkey'">
        <div class="twofa-intro">
          <div class="twofa-intro-icon">
            <i class="fas fa-fingerprint"></i>
          </div>
          <h3>設定 Passkey（推薦）</h3>
          <p class="twofa-intro-text">
            使用 Face ID、指紋或安全金鑰快速登入，<br>
            比傳統驗證碼更安全、更方便。
          </p>
        </div>

        <PasskeySetup ref="passkeySetupRef" @setup-complete="handleSetupComplete" />

        <div class="twofa-step-actions">
          <el-button
            type="primary"
            size="large"
            @click="finishRegistration"
          >
            {{ setupDone ? '前往登入' : '跳過，稍後設定' }}
          </el-button>
          <el-button
            v-if="!setupDone"
            size="large"
            @click="switchToTotp"
          >
            <i class="fas fa-mobile-alt"></i> 改用驗證器 App
          </el-button>
        </div>
      </template>

      <!-- TOTP Setup (Alternative) -->
      <template v-else>
        <div class="twofa-intro">
          <div class="twofa-intro-icon">
            <i class="fas fa-shield-alt"></i>
          </div>
          <h3>設定驗證器 App</h3>
          <p class="twofa-intro-text">
            使用 Google Authenticator 等驗證器 App 進行登入驗證，<br>
            避免因信箱問題而無法收到驗證碼。
          </p>
        </div>

        <TotpSetup ref="totpSetupRef" @setup-complete="handleSetupComplete" />

        <div class="twofa-step-actions">
          <el-button
            type="primary"
            size="large"
            @click="finishRegistration"
          >
            {{ setupDone ? '前往登入' : '跳過，稍後設定' }}
          </el-button>
          <el-button
            v-if="!setupDone && passkeySupported"
            size="large"
            @click="switchToPasskey"
          >
            <i class="fas fa-fingerprint"></i> 改用 Passkey
          </el-button>
        </div>
      </template>

      <!-- Browser not supported warning -->
      <div v-if="!passkeySupported && setupMethod === 'passkey'" class="browser-warning">
        <i class="fas fa-exclamation-triangle"></i>
        <span>您的瀏覽器不支援 Passkey，請使用驗證器 App</span>
      </div>
    </div>

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
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import InvitationStep from './InvitationStep.vue';
import UserInfoStep from './UserInfoStep.vue';
import TotpSetup from '../settings/TotpSetup.vue';
import PasskeySetup from '../settings/PasskeySetup.vue';
import { useRegister } from '../../composables/auth/useRegister';
import type { RegisterData } from '../../types/auth';

// Props & Emits
const emit = defineEmits<{
  registerSuccess: [{ userEmail: string }];
}>();

// Register composable
const {
  loading,
  invitationVerified,
  registrationComplete,
  errorMessage,
  targetEmail,
  checkingInvitation,
  invitationStatus,
  invitationStatusMessage,
  verifyInvitation,
  checkInvitationStatus,
  register,
  clearRegistrationSession,
  backToInvitationStep,
  reset
} = useRegister();

const totpSetupRef = ref<InstanceType<typeof TotpSetup> | null>(null);
const passkeySetupRef = ref<InstanceType<typeof PasskeySetup> | null>(null);
const setupDone = ref(false);
const registeredEmail = ref('');

// 2FA setup method: 'passkey' (default) or 'totp'
const setupMethod = ref<'passkey' | 'totp'>('passkey');
const passkeySupported = ref(false);

// Check WebAuthn support on mount
onMounted(() => {
  passkeySupported.value = !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );

  // If Passkey not supported, default to TOTP
  if (!passkeySupported.value) {
    setupMethod.value = 'totp';
  }
});

function switchToPasskey() {
  setupMethod.value = 'passkey';
}

function switchToTotp() {
  setupMethod.value = 'totp';
}

function handleSetupComplete() {
  setupDone.value = true;
}

// Active step for the step indicator
const activeStep = computed(() => {
  if (registrationComplete.value) return 2;
  if (invitationVerified.value) return 1;
  return 0;
});

// Computed properties for step status
const step1Status = computed(() => {
  if (loading.value && !invitationVerified.value) return 'process';
  if (invitationVerified.value) return 'success';
  return 'wait';
});

const step2Status = computed(() => {
  if (registrationComplete.value) return 'success';
  if (invitationVerified.value) return 'process';
  return 'wait';
});

const step3Status = computed(() => {
  if (registrationComplete.value) return 'process';
  return 'wait';
});

/**
 * Handle real-time invitation status check
 */
async function handleInvitationCheck(data: { invitationCode: string; userEmail: string }) {
  await checkInvitationStatus(data.invitationCode, data.userEmail);
}

/**
 * Handle invitation verification (Step 1)
 */
async function handleInvitationSubmit(data: { invitationCode: string; userEmail: string; turnstileToken: string }) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await verifyInvitation(data.invitationCode, data.userEmail, data.turnstileToken);

  if (success) {
    ElMessage({
      type: 'success',
      message: '邀請碼驗證成功！請繼續填寫註冊資料',
      duration: 3000
    });
  }
}

/**
 * Handle registration (Step 2)
 */
async function handleRegisterSubmit(data: RegisterData) {
  // Guard against concurrent calls
  if (loading.value) return;

  const success = await register(data);

  if (success) {
    registeredEmail.value = data.email;
    ElMessage({
      type: 'success',
      message: '註冊成功！建議設定驗證器 App 以順利登入',
      duration: 4000
    });
  }
}

/**
 * Finish registration — clear temp session and go to login
 */
function finishRegistration() {
  clearRegistrationSession();
  emit('registerSuccess', { userEmail: registeredEmail.value });
}

/**
 * Go back to invitation step
 */
function handleBack() {
  backToInvitationStep();
}

/**
 * Reset registration form (exposed to parent)
 */
function resetForm() {
  reset();
  setupDone.value = false;
  registeredEmail.value = '';
  setupMethod.value = passkeySupported.value ? 'passkey' : 'totp';
}

// Expose reset method to parent component
defineExpose({
  reset: resetForm
});
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
  color: #BB8FCE;
}

.step-icon--active {
  color: #9B59B6;
}

.step-icon--wait {
  color: #94a3b8;
}

/* Step 3: 2FA Setup */
.twofa-setup-step {
  padding: 0 20px;
}

.twofa-intro {
  text-align: center;
  margin-bottom: 24px;
}

.twofa-intro-icon {
  font-size: 40px;
  color: #9B59B6;
  margin-bottom: 12px;
}

.twofa-intro h3 {
  margin: 0 0 8px;
  color: #2c3e50;
  font-size: 18px;
}

.twofa-intro-text {
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.twofa-step-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding-bottom: 16px;
}

.twofa-step-actions .el-button {
  min-width: 200px;
}

.browser-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 16px;
  background-color: #fef6e8;
  border: 1px solid #f0d49a;
  border-radius: 6px;
  color: #946a00;
  font-size: 13px;
}

.browser-warning i {
  color: #f39c12;
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
