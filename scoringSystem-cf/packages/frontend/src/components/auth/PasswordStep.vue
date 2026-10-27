<template>
  <div class="password-step">
    <div class="form-group">
      <label for="loginEmail">電子郵件</label>
      <el-input
        id="loginEmail"
        v-model="email"
        type="email"
        placeholder="請輸入電子郵件"
        :disabled="loading"
        @keyup.enter="handleSubmit"
      />
    </div>

    <div class="form-group">
      <label for="loginPassword">密碼</label>
      <el-input
        id="loginPassword"
        v-model="password"
        type="password"
        placeholder="請輸入密碼"
        :disabled="loading"
        show-password
        aria-describedby="capsLockHint"
        @keydown="updateCapsLock"
        @keyup="updateCapsLock"
        @keyup.enter="handleSubmit"
        @blur="capsLockOn = false"
      />
      <p v-if="capsLockOn" id="capsLockHint" class="caps-lock-hint" role="status">
        <i class="fas fa-arrow-up" aria-hidden="true"></i>
        大寫鎖定（Caps Lock）已開啟
      </p>
    </div>

    <!-- Turnstile CAPTCHA -->
    <TurnstileWidget
      ref="turnstileRef"
      @success="handleTurnstileSuccess"
      @error="handleTurnstileError"
      @expired="handleTurnstileExpired"
    />

    <!-- Login Announcements -->
    <LoginAnnouncementBoard />

    <div class="form-actions">
      <button
        class="btn btn-primary"
        :disabled="!canSubmit || loading"
        @click="handleSubmit"
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
import LoginAnnouncementBoard from './LoginAnnouncementBoard.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';
import { rpcClient } from '@/utils/rpc-client';
import type { LoginCredentials } from '../../types/auth';

// Props
export interface Props {
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false
});

// Emits
const emit = defineEmits<{
  submit: [{ credentials: LoginCredentials; turnstileToken: string }];
}>();

// Form data
const email = ref('');
const password = ref('');

// Warn only when Caps Lock is actually on: a password that simply contains
// capitals is fine, and warning on it read as "capitals are not allowed".
// Most phone keyboards never report Caps Lock, so the hint stays hidden there.
const capsLockOn = ref(false);

function updateCapsLock(event: Event) {
  if (event instanceof KeyboardEvent) {
    capsLockOn.value = event.getModifierState('CapsLock');
  }
}

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired, reset: resetTurnstile } = useTurnstile();

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

    const apiPromise = rpcClient.api.system['turnstile-config'].$post();

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
      email: email.value.trim().toLowerCase(),
      password: password.value
    },
    turnstileToken: turnstileToken.value!
  });

  // Turnstile tokens are single-use. The server now redeems this one, so a
  // wrong-password retry must carry a fresh token or it would fail on the
  // captcha rather than on the password.
  resetTurnstile();
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

.caps-lock-hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: #b35900;
  display: flex;
  align-items: center;
  gap: 6px;
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
