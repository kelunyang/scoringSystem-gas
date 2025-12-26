<template>
  <div class="auth-layout" :class="themeClass">
    <!-- 背景層：模糊化的漸變背景 -->
    <div class="auth-background">
      <div class="background-content">
        <!-- 系統 Logo 和簡介 -->
        <div class="branding">
          <div class="logo-circle">
            <i class="fas" :class="brandingIcon"></i>
          </div>
          <h1 class="system-title">{{ systemTitle || '評分系統' }}</h1>
          <p class="system-description">專案評分與管理系統</p>
        </div>
      </div>

      <!-- 模糊遮罩 -->
      <div class="blur-overlay"></div>
    </div>

    <!-- Drawer：從底部滑出，占滿全屏 -->
    <el-drawer
      :model-value="true"
      direction="btt"
      size="100%"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      @close="handleClose"
      class="auth-drawer"
    >
      <!-- 自訂 Header（不使用 template #header） -->
      <div class="drawer-header">
        <!-- 返回按鈕 -->
        <button class="back-button" @click="handleClose" aria-label="返回">
          <i class="fas fa-times"></i>
        </button>
        <h2>歡迎使用 {{ systemTitle || '評分系統' }}</h2>
      </div>

      <!-- Tab 導航 -->
      <div class="tab-navigation">
        <router-link
          to="/auth/login"
          class="tab-button"
          :class="{ active: route.name === 'auth-login' }"
        >
          <i class="fas fa-sign-in-alt"></i>
          <span>登入</span>
        </router-link>
        <router-link
          to="/auth/register"
          class="tab-button"
          :class="{ active: route.name === 'auth-register' }"
        >
          <i class="fas fa-user-plus"></i>
          <span>註冊</span>
        </router-link>
        <router-link
          to="/auth/forgot-password"
          class="tab-button"
          :class="{ active: route.name === 'auth-forgot-password' }"
        >
          <i class="fas fa-key"></i>
          <span>忘記密碼</span>
        </router-link>
      </div>

      <!-- 認證表單內容 -->
      <div class="drawer-content">
        <router-view />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBreadcrumb } from '../composables/useBreadcrumb'

const router = useRouter()
const route = useRoute()
const { systemTitle, brandingIcon, fetchSystemTitle } = useBreadcrumb()

// 根據當前路由動態切換主題色
const themeClass = computed(() => {
  switch (route.name) {
    case 'auth-login': return 'theme-login';
    case 'auth-register': return 'theme-register';
    case 'auth-forgot-password': return 'theme-forgot-password';
    default: return 'theme-login';
  }
});

onMounted(() => {
  fetchSystemTitle()
})

// 處理 Drawer 關閉
function handleClose() {
  const redirect = route.query.redirect as string

  if (redirect) {
    // 有 redirect 參數 → 跳轉到目標頁面
    router.push(redirect)
  } else {
    // 無 redirect → 返回首頁
    router.push({ name: 'dashboard' })
  }
}
</script>

<style scoped>
/* ========================================
   熱帶花園三色系 - CSS 變數定義
   ======================================== */

/* 登入 - 🌊 海洋藍 */
.theme-login {
  --auth-primary-start: #1A9B8E;
  --auth-primary-end: #147A6F;
  --auth-secondary: #44B9A5;
  --auth-light-bg: #e6fcfc;
  --auth-shadow-color: rgba(26, 155, 142, 0.4);
}

/* 註冊 - 🌸 蘭花紫 */
.theme-register {
  --auth-primary-start: #9B59B6;
  --auth-primary-end: #8E44AD;
  --auth-secondary: #BB8FCE;
  --auth-light-bg: #f5eef8;
  --auth-shadow-color: rgba(155, 89, 182, 0.4);
}

/* 忘記密碼 - 🧡 珊瑚橙 */
.theme-forgot-password {
  --auth-primary-start: #E17055;
  --auth-primary-end: #D35400;
  --auth-secondary: #FAB1A0;
  --auth-light-bg: #fef5f0;
  --auth-shadow-color: rgba(225, 112, 85, 0.4);
}

/* ========================================
   Layout 基礎樣式
   ======================================== */

.auth-layout {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* 背景層 - 使用 CSS 變數動態切換 */
.auth-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, var(--auth-primary-start) 0%, var(--auth-primary-end) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s ease;
}

.background-content {
  position: relative;
  z-index: 1;
  text-align: center;
  color: white;
}

.branding .logo-circle {
  width: 120px;
  height: 120px;
  margin: 0 auto 30px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  backdrop-filter: blur(10px);
}

.branding .logo-circle i {
  font-size: 60px;
  color: white;
}

.system-title {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 16px;
  text-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.system-description {
  font-size: 18px;
  opacity: 0.9;
}

/* 模糊遮罩 */
.blur-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.2);
}

/* Drawer 樣式 */
.auth-drawer :deep(.el-drawer) {
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.3);
}

/* 移除 Element Plus Drawer 的預設 header */
.auth-drawer :deep(.el-drawer__header) {
  display: none;
}

/* 移除 Drawer body 的預設 padding */
.auth-drawer :deep(.el-drawer__body) {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
}

.back-button {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.3s;
  font-size: 20px;
}

.back-button:hover {
  background: var(--auth-light-bg);
  color: var(--auth-secondary);
}

.drawer-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

/* Tab 導航 */
.tab-navigation {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  background: #f9fafb;
  border-bottom: 2px solid #e5e7eb;
  flex-shrink: 0;
}

.tab-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  color: #6b7280;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s;
  cursor: pointer;
}

.tab-button:hover {
  border-color: var(--auth-secondary);
  color: var(--auth-secondary);
  background: var(--auth-light-bg);
}

.tab-button.active {
  background: linear-gradient(135deg, var(--auth-primary-start) 0%, var(--auth-primary-end) 100%);
  color: white;
  border-color: var(--auth-primary-start);
}

.tab-button i {
  font-size: 18px;
}

/* Drawer 內容 */
.drawer-content {
  padding: 32px 48px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  flex: 1;
  overflow-y: auto;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .auth-drawer {
    size: 95% !important;
  }

  .system-title {
    font-size: 32px;
  }

  .tab-button span {
    font-size: 14px;
  }

  .drawer-content {
    padding: 24px 16px;
  }
}

@media (max-width: 480px) {
  .branding .logo-circle {
    width: 80px;
    height: 80px;
  }

  .branding .logo-circle i {
    font-size: 40px;
  }

  .system-title {
    font-size: 24px;
  }

  .system-description {
    font-size: 14px;
  }

  .tab-button span {
    display: none;
  }

  .drawer-header h2 {
    font-size: 18px;
  }
}
</style>
