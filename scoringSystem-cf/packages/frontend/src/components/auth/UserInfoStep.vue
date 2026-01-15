<template>
  <div class="user-info-step">
    <div class="form-group">
      <label for="displayName">顯示名稱</label>
      <input
        id="displayName"
        v-model="formData.displayName"
        type="text"
        class="form-input"
        placeholder="請輸入顯示名稱"
        :disabled="loading"
      />
    </div>

    <div class="form-group">
      <label for="password">密碼</label>
      <input
        id="password"
        v-model="formData.password"
        type="password"
        class="form-input"
        placeholder="請輸入密碼（至少8個字元）"
        :disabled="loading"
        @input="checkPasswordStrength"
      />
      <div class="password-strength" v-if="passwordStrength">
        <el-progress
          :percentage="getPasswordStrengthPercentage()"
          :color="getPasswordStrengthColor()"
          :stroke-width="6"
          :show-text="false"
        />
        <span class="strength-text">{{ passwordStrength.message }}</span>
      </div>
    </div>

    <div class="form-group">
      <label for="confirmPassword">確認密碼</label>
      <input
        id="confirmPassword"
        v-model="formData.confirmPassword"
        type="password"
        class="form-input"
        placeholder="請再次輸入密碼"
        :disabled="loading"
        @input="checkPasswordMatch"
      />
      <div class="field-status" v-if="passwordMatchStatus">
        <span :class="passwordMatchStatus.type">{{ passwordMatchStatus.message }}</span>
      </div>
    </div>

    <!-- Avatar Selection -->
    <div class="form-group">
      <label>頭像設定</label>
      <AvatarEditor
        v-model="avatarData"
        :size="80"
        shape="circle"
        customization-layout="inline"
        :show-regenerate-button="true"
        :show-save-button="false"
        :user-name="formData.displayName || formData.email"
        @regenerate="handleAvatarRegenerate"
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
        class="btn btn-secondary"
        @click="handleBack"
        :disabled="loading"
      >
        返回上一步
      </button>
      <button
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="!canSubmit || loading"
      >
        <div v-if="loading" class="spinner"></div>
        {{ loading ? '註冊中...' : '註冊' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import type { RegisterData, AvatarStyle } from '../../types/auth';
import * as AvatarConfig from '../../utils/avatarConfig';
import AvatarEditor from '@/components/shared/AvatarEditor.vue';
import type { AvatarData } from '@/components/shared/AvatarEditor.vue';
import { useAvatarGenerator } from '../../composables/auth/useAvatarGenerator';
import { rpcClient } from '@/utils/rpc-client';
import TurnstileWidget from '../TurnstileWidget.vue';
import { useTurnstile } from '../../composables/auth/useTurnstile';

// Props
export interface Props {
  targetEmail?: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
});

// Emits
const emit = defineEmits<{
  submit: [RegisterData];
  back: [];
}>();

// Use avatar generator composable
const { getRandomSeed, generateRandomOptions } = useAvatarGenerator();

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

// Form data
const formData = ref({
  invitationCode: '',
  email: props.targetEmail || '',
  password: '',
  confirmPassword: '',
  displayName: ''
});

// Avatar data (managed by AvatarEditor component)
const avatarData = ref<AvatarData>({
  avatarSeed: getRandomSeed(),
  avatarStyle: 'avataaars',
  avatarOptions: { ...AvatarConfig.DEFAULT_AVATAR_OPTIONS.avataaars }
});

// Password strength tracking
const passwordStrength = ref<{
  level: 'weak' | 'medium' | 'strong';
  message: string;
} | null>(null);

// Password match status
const passwordMatchStatus = ref<{
  type: 'success' | 'error';
  message: string;
} | null>(null);

const canSubmit = computed(() => {
  return formData.value.displayName.trim() &&
         formData.value.password &&
         formData.value.confirmPassword &&
         formData.value.password === formData.value.confirmPassword &&
         turnstileToken.value;
});

// Check password strength
function checkPasswordStrength() {
  const password = formData.value.password;

  if (!password) {
    passwordStrength.value = null;
    return;
  }

  let strength = 0;

  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

  if (password.length < 8) {
    passwordStrength.value = { level: 'weak', message: '密碼至少需要8字元' };
  } else if (strength < 3) {
    passwordStrength.value = { level: 'weak', message: '密碼強度：弱' };
  } else if (strength < 5) {
    passwordStrength.value = { level: 'medium', message: '密碼強度：中等' };
  } else {
    passwordStrength.value = { level: 'strong', message: '密碼強度：強' };
  }
}

// Check password match
function checkPasswordMatch() {
  if (!formData.value.confirmPassword) {
    passwordMatchStatus.value = null;
    return;
  }

  if (formData.value.password === formData.value.confirmPassword) {
    passwordMatchStatus.value = { type: 'success', message: '密碼匹配' };
  } else {
    passwordMatchStatus.value = { type: 'error', message: '密碼不匹配' };
  }
}

// Get password strength percentage for el-progress
function getPasswordStrengthPercentage(): number {
  if (!passwordStrength.value) return 0;
  switch (passwordStrength.value.level) {
    case 'weak': return 33;
    case 'medium': return 66;
    case 'strong': return 100;
    default: return 0;
  }
}

// Get password strength color for el-progress
function getPasswordStrengthColor(): string {
  if (!passwordStrength.value) return '#e1e8ed';
  switch (passwordStrength.value.level) {
    case 'weak': return '#dc3545';
    case 'medium': return '#ffc107';
    case 'strong': return '#28a745';
    default: return '#e1e8ed';
  }
}

function handleBack() {
  emit('back');
}

function handleSubmit() {
  if (!canSubmit.value) return;

  emit('submit', {
    ...formData.value,
    ...avatarData.value,
    email: props.targetEmail || formData.value.email,
    turnstileToken: turnstileToken.value || ''
  } as RegisterData);
}

/**
 * Handle avatar regeneration
 * Uses public API (no authentication required) - suitable for registration flow
 */
async function handleAvatarRegenerate() {
  try {
    // Use email from props or form data
    const email = props.targetEmail || formData.value.email || `temp-${Date.now()}@example.com`;

    const httpResponse = await rpcClient.users.avatar.generate.$post({
      json: { email }
    });
    const response = await httpResponse.json();

    if (response.success && response.data) {
      // Update avatar data with backend-generated values
      avatarData.value = {
        avatarSeed: response.data.avatarSeed,
        avatarStyle: response.data.avatarStyle,
        avatarOptions: response.data.avatarOptions
      };
      ElMessage.success('頭像已重新生成！');
    } else {
      console.error('Failed to regenerate avatar:', response.error);
      ElMessage.error('重新生成頭像失敗：' + (response.error?.message || '未知錯誤'));
    }
  } catch (error) {
    console.error('Error regenerating avatar:', error);
    ElMessage.error('重新生成頭像失敗，請重試');
  }
}
</script>

<style scoped>
.user-info-step {
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
  border-color: #9B59B6;
}

.form-input:disabled {
  background-color: #f5f7fa;
  cursor: not-allowed;
}

.form-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
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

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
}

.btn-primary {
  background: linear-gradient(135deg, #9B59B6 0%, #8E44AD 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(155, 89, 182, 0.4);
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

/* Password strength indicator */
.password-strength {
  margin-top: 8px;
}

.strength-text {
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 4px;
  display: block;
}

/* Password match status */
.field-status {
  margin-top: 5px;
  font-size: 12px;
}

.field-status .success {
  color: #28a745;
}

.field-status .error {
  color: #dc3545;
}
</style>
