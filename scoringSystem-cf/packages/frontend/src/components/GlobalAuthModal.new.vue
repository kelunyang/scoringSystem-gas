<template>
  <div v-if="visible" class="auth-modal-overlay" @click.self="handleClose">
    <div class="auth-modal">
      <button class="close-btn" @click="handleClose">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="modal-header">
        <h2 class="modal-title">歡迎使用評分系統</h2>
      </div>

      <div class="tab-navigation">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          :class="['tab-btn', { active: currentTab === tab.value }]"
          @click="switchTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="modal-content">
        <!-- Login Tab -->
        <LoginForm
          v-show="currentTab === 'login'"
          @success="handleAuthSuccess"
        />

        <!-- Register Tab -->
        <RegisterForm
          v-show="currentTab === 'register'"
          @success="handleAuthSuccess"
        />

        <!-- Forgot Password Tab -->
        <ForgotPasswordForm
          v-show="currentTab === 'forgot'"
          @success="handleClose"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LoginForm from './auth/LoginForm.vue';
import RegisterForm from './auth/RegisterForm.vue';
import ForgotPasswordForm from './auth/ForgotPasswordForm.vue';

// Props
export interface Props {
  visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false
});

// Emits
const emit = defineEmits<{
  'update:visible': [boolean];
}>();

// Tabs
const tabs = [
  { label: '登入', value: 'login' as const },
  { label: '註冊', value: 'register' as const },
  { label: '忘記密碼', value: 'forgot' as const }
];

const currentTab = ref<'login' | 'register' | 'forgot'>('login');

/**
 * Switch between tabs
 */
function switchTab(tab: 'login' | 'register' | 'forgot') {
  currentTab.value = tab;
}

/**
 * Handle close modal
 */
function handleClose() {
  emit('update:visible', false);
}

/**
 * Handle successful authentication
 */
function handleAuthSuccess() {
  handleClose();

  // Optionally reload page or emit event
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

// Expose show/hide methods for external access
defineExpose({
  show() {
    emit('update:visible', true);
  },
  hide() {
    emit('update:visible', false);
  }
});
</script>

<style scoped>
.auth-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.auth-modal {
  position: relative;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: #64748b;
  transition: color 0.3s;
  z-index: 10;
}

.close-btn:hover {
  color: #1e293b;
}

.modal-header {
  padding: 32px 32px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
}

.tab-navigation {
  display: flex;
  padding: 0 32px;
  border-bottom: 1px solid #e2e8f0;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  padding: 16px 20px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: #800000;
  background-color: #f8fafc;
}

.tab-btn.active {
  color: #800000;
  border-bottom-color: #800000;
}

.modal-content {
  padding: 32px;
}

/* Responsive */
@media (max-width: 640px) {
  .auth-modal {
    max-width: 100%;
    margin: 0;
    border-radius: 0;
    max-height: 100vh;
  }

  .modal-header,
  .tab-navigation,
  .modal-content {
    padding-left: 20px;
    padding-right: 20px;
  }
}

/* Global styles override for nested components */
:deep(.steps-container .el-steps) {
  --el-color-primary: #800000;
}

:deep(.steps-container .el-steps .el-step__title) {
  font-weight: 600;
  font-size: 16px;
}

:deep(.steps-container .el-steps .el-step__description) {
  font-size: 13px;
  color: #6c757d;
}

:deep(.steps-container .el-steps .el-step.is-success .el-step__title) {
  color: #800000;
}

:deep(.steps-container .el-steps .el-step.is-process .el-step__title) {
  color: #800000;
  font-weight: 700;
}
</style>
