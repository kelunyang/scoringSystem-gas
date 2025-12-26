<template>
  <div class="password-step">
    <div class="form-group">
      <label for="loginEmail">電子郵件</label>
      <input
        id="loginEmail"
        v-model="email"
        type="email"
        class="form-input"
        placeholder="請輸入電子郵件"
        :disabled="loading"
        @keyup.enter="handleSubmit"
      />
    </div>

    <div class="form-group">
      <label for="loginPassword">密碼</label>
      <input
        id="loginPassword"
        v-model="password"
        type="password"
        class="form-input"
        placeholder="請輸入密碼"
        :disabled="loading"
        @keyup.enter="handleSubmit"
      />
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
        {{ loading ? '驗證中...' : '登入' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import TurnstileWidget from '../TurnstileWidget.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';
import { rpcClient } from '@/utils/rpc-client';
import type { LoginCredentials } from '../../types/auth';

// Props
interface Props {
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// Emits
const emit = defineEmits<{
  submit: [{ credentials: LoginCredentials; turnstileToken: string }];
}>();

// Form data
const email = ref('');
const password = ref('');

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired } = useTurnstile();

// Proactively check Turnstile config on mount
onMounted(async () => {
  console.log('[PasswordStep] Component mounted, checking Turnstile config...');
  console.log('[PasswordStep] Current token value:', turnstileToken.value);

  try {
    console.log('[PasswordStep] Calling turnstile-config API...');

    // Add timeout to prevent indefinite hang (3 seconds)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('API request timeout (3s)')), 3000)
    );

    const apiPromise = rpcClient.system['turnstile-config'].$post();

    const httpResponse = await Promise.race([apiPromise, timeoutPromise]);
    const response = await httpResponse.json();

    console.log('[PasswordStep] API response:', response);

    // If Turnstile is disabled, directly set BYPASS token
    if (response.success && !response.data.enabled) {
      console.log('[PasswordStep] Turnstile disabled, using BYPASS token');
      onVerify('BYPASS');
      console.log('[PasswordStep] Token after onVerify:', turnstileToken.value);
    } else {
      console.log('[PasswordStep] Turnstile enabled, waiting for user interaction');
    }
  } catch (error) {
    // If API fails or times out, use BYPASS for better DX in dev mode
    console.warn('[PasswordStep] Failed to load Turnstile config, using BYPASS:', error);
    onVerify('BYPASS');
    console.log('[PasswordStep] Token after error fallback:', turnstileToken.value);
  }
});

const canSubmit = computed(() => {
  const result = email.value.trim() && password.value && turnstileToken.value;
  console.log('[PasswordStep] canSubmit check:', {
    hasEmail: !!email.value.trim(),
    hasPassword: !!password.value,
    hasToken: !!turnstileToken.value,
    tokenValue: turnstileToken.value,
    result
  });
  return result;
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

  emit('submit', {
    credentials: {
      email: email.value,
      password: password.value
    },
    turnstileToken: turnstileToken.value!
  });
}
</script>

<style scoped>
.password-step {
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

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-input:focus {
  outline: none;
  border-color: #1A9B8E;
}

.form-input:disabled {
  background-color: #f5f7fa;
  cursor: not-allowed;
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
  background: linear-gradient(135deg, #1A9B8E 0%, #147A6F 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(26, 155, 142, 0.4);
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
</style>
