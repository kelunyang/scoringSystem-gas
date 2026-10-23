<template>
  <div class="auth-form">
    <!-- Sent -->
    <div
      v-if="sentTo"
      class="success-message"
      role="status"
      aria-live="polite"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div>
        <p>如果 {{ sentTo }} 有註冊過，新密碼已經寄過去了，請收信後用新密碼登入。</p>
        <p class="hint">新密碼 24 小時內有效。在你用新密碼登入之前，原本的密碼也還能用。</p>
        <p class="hint">幾分鐘內沒收到的話，請看一下垃圾郵件匣。</p>
        <button type="button" class="link-button" @click="reset">換一個信箱</button>
      </div>
    </div>

    <template v-else>
      <p class="intro">輸入註冊時用的電子郵件，我們會把新密碼寄到這個信箱。</p>
      <EmailVerificationStep
        :loading="loading"
        @submit="handleSubmit"
      />
    </template>

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
import EmailVerificationStep from './EmailVerificationStep.vue';
import { useForgotPassword } from '../../composables/auth/useForgotPassword';

const { loading, sentTo, errorMessage, requestReset, reset } = useForgotPassword();

/**
 * Submit the email to receive a new password
 */
async function handleSubmit(data: { email: string; turnstileToken: string }) {
  // Guard against concurrent calls
  if (loading.value) return;
  await requestReset(data.email, data.turnstileToken);
}
</script>

<style scoped>
.auth-form {
  padding: 20px 0;
}

.success-message {
  display: flex;
  align-items: flex-start;
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

.success-message p {
  margin: 0 0 6px 0;
}

.success-message .hint {
  color: #6b4423;
  font-size: 13px;
}

.intro {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.link-button {
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  color: #D35400;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
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
