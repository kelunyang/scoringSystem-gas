<template>
  <div class="invitation-step">
    <div class="form-group">
      <label class="pin-label">邀請碼（12碼，格式：XXXX-XXXX-XXXX，不用輸入「-」連字號）</label>
      <PinCodeInput
        v-model="invitationCode"
        :length="12"
        :disabled="loading"
        theme-color="#9B59B6"
      />
      <!-- Real-time validation status -->
      <el-alert
        v-if="invitationStatusMessage"
        :type="alertType"
        :closable="false"
        show-icon
        class="validation-alert"
      >
        <template #default>
          <span class="alert-message">{{ invitationStatusMessage }}</span>
        </template>
      </el-alert>
    </div>

    <div class="form-group">
      <label for="registerEmail">電子郵件</label>
      <el-tooltip
        :visible="hasUppercase"
        content="你輸入了大寫，請注意大小寫"
        placement="top"
      >
        <el-input
          id="registerEmail"
          v-model="email"
          type="email"
          placeholder="請輸入電子郵件"
          :disabled="loading"
          :class="{ 'uppercase-warning': hasUppercase }"
          @keyup.enter="handleSubmit"
        />
      </el-tooltip>
    </div>

    <!-- Turnstile CAPTCHA -->
    <TurnstileWidget
      ref="turnstileRef"
      @success="handleTurnstileSuccess"
      @error="handleTurnstileError"
      @expired="handleTurnstileExpired"
    />

    <div class="form-actions">
      <button
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="!canSubmit || loading"
      >
        <div v-if="loading" class="spinner"></div>
        {{ loading ? '驗證中...' : '驗證邀請碼' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import TurnstileWidget from '../TurnstileWidget.vue';
import PinCodeInput from './PinCodeInput.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';

// Props
interface Props {
  loading?: boolean;
  checkingInvitation?: boolean;
  invitationStatus?: 'idle' | 'checking' | 'valid' | 'invalid' | 'used' | 'expired';
  invitationStatusMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  checkingInvitation: false,
  invitationStatus: 'idle',
  invitationStatusMessage: ''
});

// Emits
const emit = defineEmits<{
  submit: [{ invitationCode: string; userEmail: string; turnstileToken: string }];
  checkInvitation: [{ invitationCode: string; userEmail: string }];
}>();

// Form data
const invitationCode = ref('');
const email = ref('');

// Uppercase detection for warning
const hasUppercase = computed(() => /[A-Z]/.test(email.value));

// Debounce timer for real-time validation
let debounceTimer: number | null = null;

// Watch for changes in invitation code and email to trigger real-time validation
watch([invitationCode, email], ([newCode, newEmail]) => {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Skip if both fields are empty
  if (!newCode && !newEmail) {
    return;
  }

  // Debounce for 500ms
  debounceTimer = window.setTimeout(() => {
    // Email 格式驗證的正則表達式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (newCode && newEmail && newCode.length === 12 && emailRegex.test(newEmail)) {
      // Format code before checking
      const formattedCode = newCode
        .replace(/-/g, '')
        .match(/.{1,4}/g)
        ?.join('-')
        || newCode;

      emit('checkInvitation', {
        invitationCode: formattedCode,
        userEmail: newEmail
      });
    }
  }, 500);
});

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired } = useTurnstile();

// Computed property for el-alert type
const alertType = computed(() => {
  switch (props.invitationStatus) {
    case 'checking':
      return 'info';
    case 'valid':
      return 'success';
    case 'invalid':
    case 'used':
    case 'expired':
      return 'error';
    default:
      return 'info';
  }
});

const canSubmit = computed(() => {
  return invitationCode.value.trim() && email.value.trim() && turnstileToken.value;
});

function handleTurnstileSuccess(token: string) {
  onVerify(token);
}

function handleTurnstileError() {
  onError();
}

function handleTurnstileExpired() {
  onExpired();
}

function handleSubmit() {
  if (!canSubmit.value) return;

  // 格式化邀請碼：每 4 個字元加一個連字號 (XXXX-XXXX-XXXX)
  const formattedCode = invitationCode.value
    .replace(/-/g, '')  // 先移除所有連字號（以防使用者自己輸入了）
    .match(/.{1,4}/g)   // 每 4 個字元分組
    ?.join('-')         // 用連字號連接
    || invitationCode.value;  // 如果格式化失敗，使用原值

  emit('submit', {
    invitationCode: formattedCode,
    userEmail: email.value,
    turnstileToken: turnstileToken.value!
  });
}
</script>

<style scoped>
.invitation-step {
  margin-top: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.pin-label {
  display: block;
  margin-bottom: 16px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
  text-align: center;
}

/* Uppercase warning style */
.uppercase-warning :deep(.el-input__wrapper) {
  border-color: #800020 !important;
  border-width: 2px !important;
  background-color: #fff5f5 !important;
  animation: breathing 1.5s ease-in-out infinite !important;
}

@keyframes breathing {
  0%, 100% {
    box-shadow: 0 0 8px 2px rgba(128, 0, 32, 0.3);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 16px 6px rgba(128, 0, 32, 0.5);
    transform: scale(1.02);
  }
}

.form-actions {
  margin-top: 24px;
}

.btn {
  width: 100%;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #9B59B6 0%, #8E44AD 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(155, 89, 182, 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Real-time validation alert */
.validation-alert {
  margin-top: 12px;
}

.alert-message {
  font-size: 13px;
  font-weight: 500;
}
</style>
