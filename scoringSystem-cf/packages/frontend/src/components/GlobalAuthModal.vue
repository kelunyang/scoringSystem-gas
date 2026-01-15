<template>
  <el-drawer
    v-model="drawerVisible"
    direction="btt"
    size="100%"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :with-header="false"
    class="auth-drawer"
  >
    <div class="auth-drawer-content">
      <div class="drawer-header">
        <h2 class="drawer-title">歡迎使用{{ systemTitle }}</h2>
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

      <div class="drawer-content">
        <!-- Login Tab -->
        <LoginForm
          v-show="currentTab === 'login'"
          @success="handleAuthSuccess"
        />

        <!-- Register Tab -->
        <RegisterForm
          ref="registerFormRef"
          v-show="currentTab === 'register'"
          @registerSuccess="handleRegisterSuccess"
        />

        <!-- Forgot Password Tab -->
        <ForgotPasswordForm
          v-show="currentTab === 'forgot'"
          @success="handleClose"
        />
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import LoginForm from './auth/LoginForm.vue';
import RegisterForm from './auth/RegisterForm.vue';
import ForgotPasswordForm from './auth/ForgotPasswordForm.vue';
import { rpcClient } from '@/utils/rpc-client';

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
  { label: '有邀請碼,註冊', value: 'register' as const },
  { label: '忘記密碼，重設', value: 'forgot' as const }
];

const currentTab = ref<'login' | 'register' | 'forgot'>('login');

// Drawer visibility (internal state)
const drawerVisible = ref(false);

// RegisterForm ref for resetting
const registerFormRef = ref();

// System title (fetched from API)
const systemTitle = ref('評分系統');

// Responsive drawer settings
const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

/**
 * Update window dimensions on resize
 */
function updateWindowDimensions() {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
}

/**
 * Switch between tabs
 */
function switchTab(tab: 'login' | 'register' | 'forgot') {
  currentTab.value = tab;
}

/**
 * Handle close drawer
 */
function handleClose() {
  drawerVisible.value = false;
  emit('update:visible', false);
}

/**
 * Handle successful authentication
 *
 * <i class="fas fa-check-circle text-success"></i> No need to reload - TanStack Query automatically refetches all queries
 * The login mutation already calls queryClient.invalidateQueries(['currentUser'])
 * which triggers all dependent queries to refetch automatically
 */
function handleAuthSuccess() {
  handleClose();
  // That's it! TanStack Query handles everything else
}

/**
 * Handle successful registration
 * Switch to login tab instead of closing the drawer
 */
function handleRegisterSuccess(data: { userEmail: string }) {
  console.log('[GlobalAuthModal] Registration successful for:', data.userEmail);

  // Reset registration form to clear all state
  registerFormRef.value?.reset();

  // Switch to login tab so user can login with their new account
  currentTab.value = 'login';
  // TODO: Pre-fill email in login form if needed
}

// Watch for prop changes to sync internal drawer state
watch(() => props.visible, (newValue) => {
  drawerVisible.value = newValue;
});

// Watch internal drawer state to emit updates
watch(drawerVisible, (newValue) => {
  if (!newValue) {
    emit('update:visible', false);
  }
});

// Fetch system title from API
async function fetchSystemTitle() {
  try {
    const response = await rpcClient.api.system.info.$get();
    const data = await response.json();
    if (data.success && data.data?.systemTitle) {
      systemTitle.value = data.data.systemTitle;
    }
  } catch (error) {
    console.error('Failed to fetch system title:', error);
    // Keep default value on error
  }
}

// Lifecycle hooks
onMounted(() => {
  window.addEventListener('resize', updateWindowDimensions);
  drawerVisible.value = props.visible;
  fetchSystemTitle();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWindowDimensions);
});

// Expose show/hide methods for external access
defineExpose({
  show() {
    drawerVisible.value = true;
    emit('update:visible', true);
  },
  hide() {
    handleClose();
  }
});
</script>

<style scoped>
/* Drawer content wrapper */
.auth-drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

/* Drawer header - Maroon background */
.drawer-header {
  padding: 32px 24px;
  background-color: #800000;
  flex-shrink: 0;
}

.drawer-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: white;
  text-align: center;
}

/* Tab navigation */
.tab-navigation {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid #e2e8f0;
  gap: 4px;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 14px 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-btn:hover {
  color: #800000;
  background-color: #f8fafc;
}

.tab-btn.active {
  color: #800000;
  border-bottom-color: #800000;
}

/* Drawer content (scrollable) */
.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Responsive adjustments for portrait mode (bottom drawer) */
@media (orientation: portrait) and (max-width: 768px) {
  .drawer-header {
    padding: 20px 20px 16px;
  }

  .drawer-title {
    font-size: 20px;
  }

  .tab-navigation {
    padding: 0 16px;
  }

  .tab-btn {
    padding: 12px 12px;
    font-size: 14px;
  }

  .drawer-content {
    padding: 20px 16px;
  }
}

/* Small mobile screens */
@media (max-width: 375px) {
  .drawer-title {
    font-size: 18px;
  }

  .tab-btn {
    padding: 10px 8px;
    font-size: 13px;
  }

  .drawer-content {
    padding: 16px 12px;
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
