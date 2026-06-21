<template>
  <div class="two-factor-step">
    <!-- Method selector: show when multiple methods available -->
    <div v-if="availableMethods.length > 1" class="method-selector">
      <div class="method-tabs">
        <button
          v-if="availableMethods.includes('passkey')"
          class="method-tab"
          :class="{ active: currentMethod === 'passkey' }"
          @click="selectMethod('passkey')"
        >
          <i class="fas fa-fingerprint"></i> Passkey
        </button>
        <button
          v-if="availableMethods.includes('totp')"
          class="method-tab"
          :class="{ active: currentMethod === 'totp' }"
          @click="selectMethod('totp')"
        >
          <i class="fas fa-shield-alt"></i> 驗證器
        </button>
        <button
          v-if="availableMethods.includes('email')"
          class="method-tab"
          :class="{ active: currentMethod === 'email' }"
          @click="selectMethod('email')"
        >
          <i class="fas fa-envelope"></i> Email
        </button>
      </div>
    </div>

    <!-- Passkey mode -->
    <div v-if="currentMethod === 'passkey'" class="info-message info-message--passkey">
      <p>使用 <strong>Passkey</strong> 進行驗證</p>
      <p class="hint">請觸摸安全金鑰或使用生物辨識（指紋/Face ID）</p>
    </div>

    <!-- Email OTP mode -->
    <div v-else-if="currentMethod === 'email'" class="info-message">
      <p>驗證碼已發送到 <strong>{{ userEmail }}</strong></p>
      <p class="hint">請查收您的電子郵件並輸入12位驗證碼（連字號可省略）</p>
    </div>

    <!-- TOTP mode -->
    <div v-else class="info-message info-message--totp">
      <p>請開啟您的<strong>驗證器 App</strong>（如 Google Authenticator）</p>
      <p class="hint">輸入 6 位數驗證碼</p>
    </div>

    <!-- Passkey button -->
    <div v-if="currentMethod === 'passkey'" class="passkey-section">
      <button
        class="btn btn-passkey"
        :style="buttonStyle"
        @click="handlePasskeyAuth"
        :disabled="loading || passkeyLoading"
      >
        <div v-if="passkeyLoading" class="spinner"></div>
        <i v-else class="fas fa-fingerprint"></i>
        {{ passkeyLoading ? '驗證中...' : '使用 Passkey 登入' }}
      </button>
      <p v-if="passkeyError" class="passkey-error">
        <i class="fas fa-exclamation-circle"></i> {{ passkeyError }}
      </p>
    </div>

    <!-- Code input (for email and TOTP) -->
    <div v-else class="form-group">
      <label class="pin-label">驗證碼</label>
      <!-- Email OTP: 12-char input -->
      <PinCodeInput
        v-if="currentMethod === 'email'"
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

    <div v-if="currentMethod !== 'passkey'" class="form-actions">
      <button
        class="btn btn-primary"
        :style="buttonStyle"
        @click="currentMethod === 'totp' && showRecoveryInput ? handleSubmitRecovery() : handleSubmit()"
        :disabled="!canSubmit || loading"
      >
        <div v-if="loading" class="spinner"></div>
        {{ loading ? '驗證中...' : '確認驗證碼' }}
      </button>
    </div>

    <!-- Resend button: only for email OTP -->
    <div v-if="currentMethod === 'email'" class="resend-section">
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
    <div v-if="currentMethod === 'totp'" class="recovery-toggle">
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
import { usePasskey } from '../../composables/auth/usePasskey';
import type { TwoFactorData, TwoFactorMethod } from '../../types/auth';

// Props
export interface Props {
  userEmail: string;
  method?: TwoFactorMethod;
  availableMethods?: TwoFactorMethod[];
  loading?: boolean;
  resendLoading?: boolean;
  themeColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  method: 'email',
  availableMethods: () => ['email'],
  loading: false,
  resendLoading: false,
  themeColor: '#E17055'
});

// Emits
const emit = defineEmits<{
  submit: [TwoFactorData];
  resend: [{ turnstileToken: string }];
  passkeySuccess: [];
  methodChange: [TwoFactorMethod];
}>();

// Current method (can be changed by user)
const currentMethod = ref<TwoFactorMethod>(props.method);

// Watch for prop changes
watch(() => props.method, (newMethod) => {
  currentMethod.value = newMethod;
});

// Form data
const code = ref('');
const recoveryCode = ref('');
const showRecoveryInput = ref(false);

// Passkey state
const {
  loading: passkeyLoading,
  errorMessage: passkeyError,
  initAuthentication,
  verifyAuthentication
} = usePasskey();

// Reset inputs when method changes
watch(currentMethod, () => {
  code.value = '';
  recoveryCode.value = '';
  showRecoveryInput.value = false;
});

// Method selection
function selectMethod(method: TwoFactorMethod) {
  currentMethod.value = method;
  emit('methodChange', method);
}

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

  if (currentMethod.value === 'totp') {
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

// Passkey authentication
async function handlePasskeyAuth() {
  if (!turnstileToken.value) return;

  // Step 1: Get authentication options and trigger browser prompt
  const credential = await initAuthentication(props.userEmail);
  if (!credential) return;

  // Step 2: Verify with server
  const success = await verifyAuthentication(props.userEmail, turnstileToken.value);
  if (success) {
    emit('passkeySuccess');
  }
}
</script>

<style scoped>
.two-factor-step {
  margin-top: 20px;
}

/* Method selector */
.method-selector {
  margin-bottom: 20px;
}

.method-tabs {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.method-tab {
  flex: 1;
  max-width: 120px;
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.method-tab i {
  font-size: 18px;
}

.method-tab:hover {
  border-color: #94a3b8;
  color: #475569;
}

.method-tab.active {
  border-color: var(--theme-color, #E17055);
  background: linear-gradient(135deg, rgba(225, 112, 85, 0.1) 0%, rgba(225, 112, 85, 0.05) 100%);
  color: var(--theme-color, #E17055);
}

/* Info messages */
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

.info-message--passkey {
  background-color: #fdf4ff;
  border-color: #f0abfc;
}

.info-message p {
  margin: 4px 0;
  font-size: 14px;
  color: #1e40af;
}

.info-message--totp p {
  color: #166534;
}

.info-message--passkey p {
  color: #86198f;
}

.info-message .hint {
  font-size: 13px;
  color: #64748b;
}

/* Passkey section */
.passkey-section {
  margin-bottom: 20px;
}

.btn-passkey {
  width: 100%;
  padding: 16px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
}

.btn-passkey:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
  transform: translateY(-1px);
}

.btn-passkey:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-passkey i {
  font-size: 20px;
}

.passkey-error {
  margin-top: 12px;
  text-align: center;
  color: #dc3545;
  font-size: 13px;
}

/* Form group */
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
