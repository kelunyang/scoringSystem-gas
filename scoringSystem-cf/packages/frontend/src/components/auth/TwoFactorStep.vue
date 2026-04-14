<template>
  <div class="two-factor-step">
    <!-- Email OTP mode -->
    <div v-if="method === 'email'" class="info-message">
      <p>驗證碼已發送到 <strong>{{ userEmail }}</strong></p>
      <p class="hint">請查收您的電子郵件並輸入12位驗證碼（連字號可省略）</p>
    </div>

    <!-- TOTP mode -->
    <div v-else class="info-message info-message--totp">
      <p>請開啟您的<strong>驗證器 App</strong>（如 Google Authenticator）</p>
      <p class="hint">輸入 6 位數驗證碼</p>
    </div>

    <div class="form-group">
      <label class="pin-label">驗證碼</label>
      <!-- Email OTP: 12-char input -->
      <PinCodeInput
        v-if="method === 'email'"
        v-model="code"
        :length="12"
        :disabled="loading"
        :theme-color="themeColor"
        @complete="handleSubmit"
      />
      <!-- TOTP: 6-digit numeric input (grouped as XXX-XXX) -->
      <PinCodeInput
        v-else-if="!showRecoveryInput"
        v-model="code"
        :length="6"
        :pin-group-size="3"
        :disabled="loading"
        :theme-color="themeColor"
        input-mode="numeric"
        @complete="handleSubmit"
      />
      <!-- Recovery code: 8-char text input -->
      <div v-else class="recovery-input-wrapper">
        <input
          v-model="recoveryCode"
          type="text"
          maxlength="8"
          :disabled="loading"
          class="recovery-input"
          placeholder="輸入 8 位備用碼"
          @keyup.enter="handleSubmitRecovery"
        />
      </div>
    </div>

    <div class="form-actions">
      <button
        class="btn btn-primary"
        :style="buttonStyle"
        @click="method === 'totp' && showRecoveryInput ? handleSubmitRecovery() : handleSubmit()"
        :disabled="!canSubmit || loading"
      >
        <div v-if="loading" class="spinner"></div>
        {{ loading ? '驗證中...' : '確認驗證碼' }}
      </button>
    </div>

    <!-- Resend button: only for email OTP -->
    <div v-if="method === 'email'" class="resend-section">
      <CountdownButton
        label="重新發送驗證碼"
        :duration="60"
        :loading="resendLoading"
        :auto-start="true"
        type="primary"
        size="normal"
        :full-width="true"
        :theme-color="themeColor"
        enable-smart-text
        @click="handleResend"
      />
    </div>

    <!-- Recovery code toggle: only for TOTP -->
    <div v-if="method === 'totp'" class="recovery-toggle">
      <button
        class="btn-link"
        @click="toggleRecoveryInput"
      >
        {{ showRecoveryInput ? '使用驗證器驗證碼' : '使用備用碼' }}
      </button>
    </div>

    <!-- Turnstile CAPTCHA -->
    <TurnstileWidget
      ref="turnstileRef"
      @success="handleTurnstileSuccess"
      @error="handleTurnstileError"
      @expired="handleTurnstileExpired"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import PinCodeInput from './PinCodeInput.vue';
import CountdownButton from '../shared/CountdownButton.vue';
import TurnstileWidget from '../TurnstileWidget.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';
import type { TwoFactorData, TwoFactorMethod } from '../../types/auth';

// Props
export interface Props {
  userEmail: string;
  method?: TwoFactorMethod;
  loading?: boolean;
  resendLoading?: boolean;
  themeColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  method: 'email',
  loading: false,
  resendLoading: false,
  themeColor: '#E17055'
});

// Emits
const emit = defineEmits<{
  submit: [TwoFactorData];
  resend: [{ turnstileToken: string }];
}>();

// Form data
const code = ref('');
const recoveryCode = ref('');
const showRecoveryInput = ref(false);

// Reset inputs when method changes
watch(() => props.method, () => {
  code.value = '';
  recoveryCode.value = '';
  showRecoveryInput.value = false;
});

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired, reset: resetTurnstile } = useTurnstile();

function handleTurnstileSuccess(token: string) {
  onVerify(token);
}

function handleTurnstileError() {
  onError();
}

function handleTurnstileExpired() {
  onExpired();
}

const canSubmit = computed(() => {
  if (props.loading || !turnstileToken.value) return false;

  if (props.method === 'totp') {
    if (showRecoveryInput.value) {
      return recoveryCode.value.length === 8;
    }
    return code.value.length === 6;
  }
  // email mode
  return code.value.length === 12;
});

function toggleRecoveryInput() {
  showRecoveryInput.value = !showRecoveryInput.value;
  code.value = '';
  recoveryCode.value = '';
}

// Color helper functions
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hexToRgb(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

// Dynamic button style based on theme color
const buttonStyle = computed(() => ({
  '--theme-color': props.themeColor,
  '--theme-color-dark': adjustColor(props.themeColor!, -20),
  '--theme-color-rgb': hexToRgb(props.themeColor!)
}));

function handleSubmit() {
  if (!canSubmit.value) return;

  emit('submit', {
    email: props.userEmail,
    code: code.value,
    turnstileToken: turnstileToken.value || ''
  });
}

function handleSubmitRecovery() {
  if (!canSubmit.value) return;

  emit('submit', {
    email: props.userEmail,
    code: recoveryCode.value,
    turnstileToken: turnstileToken.value || ''
  });
}

function handleResend() {
  emit('resend', {
    turnstileToken: turnstileToken.value || ''
  });
  // Reset turnstile for next use
  resetTurnstile();
}
</script>

<style scoped>
.two-factor-step {
  margin-top: 20px;
}

.info-message {
  padding: 16px;
  background-color: #f0f9ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  margin-bottom: 20px;
}

.info-message--totp {
  background-color: #f0fdf4;
  border-color: #bbf7d0;
}

.info-message p {
  margin: 4px 0;
  font-size: 14px;
  color: #1e40af;
}

.info-message--totp p {
  color: #166534;
}

.info-message .hint {
  font-size: 13px;
  color: #64748b;
}

.form-group {
  margin-bottom: 20px;
}

.pin-label {
  display: block;
  margin-bottom: 12px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
  text-align: center;
}

.recovery-input-wrapper {
  display: flex;
  justify-content: center;
}

.recovery-input {
  width: 280px;
  padding: 12px 16px;
  font-size: 18px;
  font-family: monospace;
  letter-spacing: 4px;
  text-align: center;
  text-transform: uppercase;
  border: 2px solid #d1d5db;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.recovery-input:focus {
  border-color: var(--theme-color, #E17055);
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
  background: linear-gradient(135deg, var(--theme-color, #E17055) 0%, var(--theme-color-dark, #D35400) 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(var(--theme-color-rgb, 225, 112, 85), 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.resend-section {
  margin-top: 16px;
  text-align: center;
}

.recovery-toggle {
  margin-top: 16px;
  text-align: center;
}

.btn-link {
  background: none;
  border: none;
  color: #6366f1;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
  padding: 4px 8px;
}

.btn-link:hover {
  color: #4f46e5;
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
</style>
