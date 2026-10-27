<template>
  <div class="email-verification-step">
    <div class="form-group">
      <label for="resetEmail">電子郵件</label>
      <div class="email-input-group">
        <el-input
          id="resetEmail"
          v-model="email"
          type="email"
          placeholder="請輸入註冊時的電子郵件"
          :disabled="loading"
          @keyup.enter="handleSubmit"
        />
        <button
          class="btn btn-secondary"
          :disabled="!canSubmit || loading"
          @click="handleSubmit"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin"></i>
          <span v-else>寄送新密碼</span>
        </button>
      </div>
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
import { ref, computed } from 'vue';
import TurnstileWidget from '../TurnstileWidget.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';

// Props
export interface Props {
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// Emits
const emit = defineEmits<{
  submit: [{ email: string; turnstileToken: string }];
}>();

// Form data
const email = ref('');

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
  return email.value.trim() && !props.loading && turnstileToken.value;
});

function handleSubmit() {
  if (!canSubmit.value) return;
  emit('submit', {
    email: email.value.trim().toLowerCase(),
    turnstileToken: turnstileToken.value || ''
  });

  // Turnstile tokens are single-use: the server redeems this one, so a retry
  // after a failure needs a fresh token or it would fail on the captcha.
  resetTurnstile();
}
</script>

<style scoped>
.email-verification-step {
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

.email-input-group {
  display: flex;
  gap: 8px;
}

/* el-input in flex container needs flex: 1 */
.email-input-group :deep(.el-input) {
  flex: 1;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.btn-secondary {
  background-color: #64748b;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #475569;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
