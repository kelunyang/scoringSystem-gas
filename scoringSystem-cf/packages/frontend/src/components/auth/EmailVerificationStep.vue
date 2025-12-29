<template>
  <div class="email-verification-step">
    <div class="form-group">
      <label for="resetEmail">電子郵件</label>
      <div class="email-input-group">
        <el-tooltip
          :visible="hasUppercase"
          content="你輸入了大寫，請注意大小寫"
          placement="top"
        >
          <el-input
            id="resetEmail"
            v-model="email"
            type="email"
            placeholder="請輸入註冊時的電子郵件"
            :disabled="loading"
            :class="{ 'uppercase-warning': hasUppercase }"
            @keyup.enter="handleSubmit"
          />
        </el-tooltip>
        <button
          class="btn btn-secondary"
          @click="handleSubmit"
          :disabled="!canSubmit || loading"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin"></i>
          <span v-else>驗證email</span>
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
interface Props {
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

// Uppercase detection for warning
const hasUppercase = computed(() => /[A-Z]/.test(email.value));

// Turnstile
const { token: turnstileToken, onVerify, onError, onExpired } = useTurnstile();

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
    email: email.value,
    turnstileToken: turnstileToken.value || ''
  });
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
