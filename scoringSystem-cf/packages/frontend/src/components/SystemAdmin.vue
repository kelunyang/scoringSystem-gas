<template>
  <div class="system-admin">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="title-container">
        <h1>
          <div class="icon-overlay">
            <i :class="currentPageIcon" class="main-icon"></i>
            <i class="fas fa-cog overlay-icon"></i>
          </div>
          <span class="title-text">{{ currentPageTitle }}</span>
        </h1>

        <!-- Mode Switcher (el-segmented) -->
        <el-segmented
          v-if="modeOptions.length > 0"
          v-model="currentMode"
          :options="modeOptions"
          @change="handleModeChange"
          class="mode-switcher"
          size="default"
        />

        <!-- Action Buttons -->
        <div v-if="showActionButton" class="action-buttons-group">
          <button
            class="action-btn"
            @click="handleActionClick"
            :disabled="actionButtonLoading"
          >
            <i :class="actionIcon"></i>
            {{ actionLabel }}
          </button>
        </div>

        <!-- Refresh Button -->
        <CountdownButton
          ref="refreshButtonRef"
          plain
          size="small"
          type="primary"
          :duration="refreshDuration"
          :loading="isLoading"
          :auto-start="false"
          :full-width="false"
          icon="fa-sync"
          label="重新整理"
          enable-smart-text
          theme-color="#2c5aa0"
          @click="handleRefresh"
        />
      </div>
      <TopBarUserControls
        :user="currentUser"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="handleUserCommand"
      />
    </div>

    <!-- Content Area -->
    <div class="content-area">
      <!-- Navigation Tabs using router-link - Dynamically filtered by permissions -->
      <div v-if="visibleTabs.length > 0">
        <!-- Nav wrapper - 独立出来实现 sticky -->
        <div
          class="admin-nav-wrapper"
          :class="{
            'has-left-overflow': hasLeftOverflow,
            'has-right-overflow': hasRightOverflow,
            'is-pinned': isPinned
          }"
        >
          <!-- Pin Button -->
          <el-tooltip
            :content="isPinned ? '解除固定' : '固定導航'"
            placement="bottom"
          >
            <el-button
              circle
              size="small"
              type="danger"
              :class="{ 'is-active': isPinned }"
              @click="togglePin"
              class="pin-button"
            >
              <i class="fas fa-thumbtack"></i>
            </el-button>
          </el-tooltip>

          <!-- Left Scroll Button -->
          <el-button
            v-if="hasOverflow"
            class="scroll-button scroll-button-left"
            :class="{ disabled: !canScrollLeft }"
            :disabled="!canScrollLeft"
            plain
            circle
            size="small"
            @click="scrollLeftNav"
            aria-label="向左滚动"
          >
            <i class="fas fa-chevron-left"></i>
          </el-button>

          <!-- Navigation Tabs Container -->
          <div ref="navRef" class="admin-nav" @scroll="updateScrollState">
            <router-link
              v-for="tab in (visibleTabs as any[])"
              :key="(tab as any).key"
              :to="{ name: `admin-${(tab as any).key}` }"
              class="nav-tab"
              active-class="active"
            >
              <i :class="(tab as any).icon"></i>
              <span>{{ (tab as any).label }}</span>
            </router-link>
          </div>

          <!-- Right Scroll Button -->
          <el-button
            v-if="hasOverflow"
            class="scroll-button scroll-button-right"
            :class="{ disabled: !canScrollRight }"
            :disabled="!canScrollRight"
            plain
            circle
            size="small"
            @click="scrollRightNav"
            aria-label="向右滚动"
          >
            <i class="fas fa-chevron-right"></i>
          </el-button>
        </div>

        <!-- Admin Container - 只包含内容区域 -->
        <div class="admin-container">
          <!-- Router View for Child Routes -->
          <div class="tab-content">
            <router-view />
          </div>
        </div>
      </div>

      <!-- No tabs available message -->
      <div v-if="visibleTabs.length === 0 && !isLoading" class="no-access">
        <i class="fas fa-lock"></i>
        <h3>無法訪問</h3>
        <p>您沒有任何系統管理權限</p>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>載入權限中...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount, ref, provide, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopBarUserControls from './TopBarUserControls.vue'
import CountdownButton from './shared/CountdownButton.vue'
import { useVisibleTabs } from '@/composables/usePermissionConfig'
import { usePermissions } from '@/composables/usePermissions'
import { useBreadcrumb } from '@/composables/useBreadcrumb'
import { useAuth } from '@/composables/useAuth'
import { getUserPreferences } from '@/utils/userPreferences'

// ========================================
// Props
// ========================================

const props = defineProps({
  user: {
    type: Object,
    default: null
  },
  sessionPercentage: {
    type: Number,
    default: 100
  },
  remainingTime: {
    type: Number,
    default: 0
  }
})

// ========================================
// Emits
// ========================================

const emit = defineEmits(['user-command'])

// ========================================
// Router and Permission-based Tab Visibility
// ========================================

const route = useRoute()
const router = useRouter()
const { isLoading } = usePermissions()

// Get visible tabs based on user permissions
const visibleTabs = useVisibleTabs('systemAdmin')

// ========================================
// Auto-Refresh Duration (from localStorage)
// ========================================

const { userId } = useAuth()

// Read refresh timer from localStorage (default: 1800 seconds = 30 minutes)
const refreshDuration = computed(() => {
  if (!userId.value) return 1800
  const prefs = getUserPreferences(userId.value)
  return prefs.refreshTimer || 1800
})

// ========================================
// Mode Switching Logic
// ========================================

// Detect current mode based on route
const currentMode = computed({
  get: () => {
    const routeName = route.name?.toString() || ''

    // GroupManagement modes
    if (routeName.includes('groups')) {
      return route.meta.groupType || 'global'
    }

    // SystemLogs modes
    if (routeName.includes('logs')) {
      const queryMode = route.query.mode
      return route.meta.logMode || (Array.isArray(queryMode) ? queryMode[0] : queryMode) || 'standard'
    }

    return ''
  },
  set: (value) => {
    // Navigation handled by handleModeChange
  }
})

// Generate mode options based on current admin section
const modeOptions = computed(() => {
  const routeName = route.name?.toString() || ''

  // GroupManagement: Global vs Project
  if (routeName.includes('groups')) {
    return [
      { label: '全域群組', value: 'global' },
      { label: '專案群組', value: 'project' }
    ]
  }

  // SystemLogs: Standard vs Login (only for admin-logs route, not email-logs or ai-service-logs)
  if (routeName === 'admin-logs' || routeName === 'admin-logs-detail' || routeName === 'admin-logs-login-user') {
    return [
      { label: '標準 Log', value: 'standard' },
      { label: '登入記錄', value: 'login' }
    ]
  }

  return []
})

// Handle mode switching
function handleModeChange(value: string | number) {
  const routeName = route.name?.toString() || ''

  // GroupManagement navigation
  if (routeName.includes('groups')) {
    router.push({ name: `admin-groups-${value}` })
    return
  }

  // SystemLogs navigation (only for admin-logs routes)
  if (routeName === 'admin-logs' || routeName === 'admin-logs-detail' || routeName === 'admin-logs-login-user') {
    if (value === 'standard') {
      router.push({ name: 'admin-logs' })
    } else if (value === 'login') {
      router.push({ name: 'admin-logs', query: { mode: 'login' } })
    }
  }
}

// ========================================
// Action Buttons Logic
// ========================================

const actionButtonLoading = ref(false)

// Determine if action button should be shown
const showActionButton = computed(() => {
  const routeName = route.name?.toString() || ''

  // Show for: UserManagement, ProjectManagement, GroupManagement (global mode and project mode)
  if (routeName === 'admin-users') return true
  if (routeName === 'admin-projects') return true
  if (routeName === 'admin-groups-global') return true
  if (routeName === 'admin-groups-project') return true
  if (routeName === 'admin-groups-project-detail') return true

  return false
})

// Dynamic action button label
const actionLabel = computed(() => {
  const routeName = route.name?.toString() || ''

  if (routeName === 'admin-users') return '邀請碼管理'
  if (routeName === 'admin-projects') return '新增專案'
  if (routeName === 'admin-groups-global') return '新增全域群組'
  if (routeName === 'admin-groups-project') return '新增專案群組'
  if (routeName === 'admin-groups-project-detail') return '批量建立群組'

  return ''
})

// Dynamic action button icon
const actionIcon = computed(() => {
  const routeName = route.name?.toString() || ''

  if (routeName === 'admin-users') return 'fas fa-ticket-alt'
  if (routeName === 'admin-projects') return 'fas fa-plus'
  if (routeName === 'admin-groups-global') return 'fas fa-plus'
  if (routeName === 'admin-groups-project') return 'fas fa-plus'
  if (routeName === 'admin-groups-project-detail') return 'fas fa-layer-group'

  return ''
})

// Handle action button click - emit event to child components
function handleActionClick() {
  const routeName = route.name?.toString() || ''

  // For now, we'll use provide/inject pattern to communicate with child components
  // Child components will register their action handlers
  if (currentActionFn.value) {
    currentActionFn.value()
  } else {
    console.warn('⚠️ No action handler registered for route:', routeName)
  }
}

// Store reference to child component's action handler
const currentActionFn = ref<(() => void) | null>(null)

// Provide action registration function for child components
provide('registerAction', (fn: (() => void) | null) => {
  currentActionFn.value = fn
  console.log('🎯 Registered action function:', fn ? 'Yes' : 'No')
})

// Re-check overflow when visible tabs change
watch(visibleTabs, () => {
  nextTick(() => {
    checkOverflow()
  })
}, { immediate: true })

// Re-check overflow when route changes
watch(() => route.name, () => {
  nextTick(() => {
    checkOverflow()
    // 延迟再次检查，确保子组件渲染完成
    setTimeout(() => {
      checkOverflow()
    }, 150)
  })
})

// ========================================
// CountdownButton and Refresh Logic
// ========================================

const refreshButtonRef = ref<InstanceType<typeof CountdownButton> | null>(null)
const currentRefreshFn = ref<(() => void) | null>(null)

// Provide refresh registration function for child components
provide('registerRefresh', (fn: (() => void) | null) => {
  currentRefreshFn.value = fn
  console.log('🔄 Registered refresh function:', fn ? 'Yes' : 'No')
})

// Handle refresh button click
function handleRefresh() {
  console.log('🔄 Refresh button clicked')
  if (currentRefreshFn.value) {
    console.log('✅ Calling child refresh function')
    currentRefreshFn.value()
  } else {
    console.warn('⚠️ No refresh function registered')
  }
}

// ========================================
// Computed
// ========================================

const currentUser = computed(() => props.user)

// Compute dynamic page title based on current route
const currentPageTitle = computed(() => {
  const routeName = route.name?.toString() || ''
  let key = routeName.replace('admin-', '')

  // Try exact match first
  let tab = visibleTabs.value.find((t: any) => t.key === key)

  // If not found, try matching the first part (e.g., 'groups-global' -> 'groups')
  if (!tab && key.includes('-')) {
    const baseKey = key.split('-')[0]
    tab = visibleTabs.value.find((t: any) => t.key === baseKey)
  }

  return (tab as any)?.label || '系統管理'
})

// Compute dynamic page icon based on current route
const currentPageIcon = computed(() => {
  const routeName = route.name?.toString() || ''
  let key = routeName.replace('admin-', '')

  // Try exact match first
  let tab = visibleTabs.value.find((t: any) => t.key === key)

  // If not found, try matching the first part (e.g., 'groups-global' -> 'groups')
  if (!tab && key.includes('-')) {
    const baseKey = key.split('-')[0]
    tab = visibleTabs.value.find((t: any) => t.key === baseKey)
  }

  return (tab as any)?.icon || 'fas fa-cog'
})

// ========================================
// Methods
// ========================================

function handleUserCommand(command: string) {
  emit('user-command', command)
}

// ========================================
// Horizontal Scroll Navigation Logic
// ========================================

const navRef = ref<HTMLElement | null>(null)
const hasOverflow = ref(false)
const scrollDistance = 200
const currentScrollLeft = ref(0) // 追踪当前滚动位置（响应式）

// ========================================
// Pin/Sticky Navigation Logic
// ========================================

const isPinned = ref(true) // 默认启用 sticky

// 切换 pin 状态
const togglePin = () => {
  isPinned.value = !isPinned.value
}

// Detect if can scroll left/right
const canScrollLeft = computed(() => {
  return currentScrollLeft.value > 0 // 使用响应式值
})

const canScrollRight = computed(() => {
  if (!navRef.value) return false
  const maxScroll = navRef.value.scrollWidth - navRef.value.clientWidth
  return currentScrollLeft.value < maxScroll - 1 // 使用响应式值
})

// Computed for gradient mask display
const hasLeftOverflow = computed(() => canScrollLeft.value)
const hasRightOverflow = computed(() => canScrollRight.value)

// Scroll methods
const scrollLeftNav = () => {
  if (navRef.value) {
    navRef.value.scrollBy({
      left: -scrollDistance,
      behavior: 'smooth'
    })
    // 延迟更新状态，等待动画完成
    setTimeout(() => {
      updateScrollState()
    }, 300)
  }
}

const scrollRightNav = () => {
  if (navRef.value) {
    navRef.value.scrollBy({
      left: scrollDistance,
      behavior: 'smooth'
    })
    // 延迟更新状态，等待动画完成
    setTimeout(() => {
      updateScrollState()
    }, 300)
  }
}

// Update scroll state (for edge detection)
const updateScrollState = () => {
  if (navRef.value) {
    currentScrollLeft.value = navRef.value.scrollLeft // 更新响应式滚动位置
  }
  checkOverflow()
}

// Check if content overflows
const checkOverflow = () => {
  if (!navRef.value) return
  hasOverflow.value = navRef.value.scrollWidth > navRef.value.clientWidth
}

// ResizeObserver for responsive overflow detection
let resizeObserver: ResizeObserver | null = null

// ========================================
// Lifecycle
// ========================================

const { setPageTitle, clearProjectTitle } = useBreadcrumb()

onMounted(() => {
  // Set page title using composable
  setPageTitle('系統管理')
  clearProjectTitle()

  // Initialize horizontal scroll overflow detection
  nextTick(() => {
    checkOverflow()

    // 延迟再次检查，确保 DOM 完全渲染
    setTimeout(() => {
      checkOverflow()
    }, 100)

    // Monitor window size changes
    resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })

    if (navRef.value) {
      resizeObserver.observe(navRef.value)
    }
  })
})

onBeforeUnmount(() => {
  // Clean up ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.system-admin {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

/* Top Bar - 與Dashboard完全一致 */
.top-bar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.title-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-container h1 {
  margin: 0;
  color: #2c5aa0;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0; /* Allow flexbox shrinking */
  transition: all 0.3s ease; /* Smooth transition when switching pages */
}

.title-container h1 .title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0; /* Required for text-overflow to work in flexbox */
}

/* Icon Overlay Styles (Manual Positioning - same as EmptyState.vue) */
.icon-overlay {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* Icon never shrinks */
}

.main-icon {
  display: block;
  color: #2c5aa0;
  transition: all 0.3s ease;
}

.overlay-icon {
  position: absolute;
  right: -0.125em;
  bottom: -0.125em;
  font-size: 0.5em;
  color: #FF6600 !important;
  transition: all 0.3s ease;
}

/* Mode Switcher - Styled like CountdownButton plain */
.mode-switcher {
  flex-shrink: 0;
}

.mode-switcher :deep(.el-segmented__item) {
  padding: 8px 16px;
  font-size: 14px;
  color: #333;
  border: 1px solid #333;
  transition: all 0.3s;
}

.mode-switcher :deep(.el-segmented__item:hover) {
  background-color: rgba(51, 51, 51, 0.05);
}

/* Override Element Plus CSS variables and classes */
.mode-switcher :deep(.el-segmented) {
  --el-segmented-item-selected-bg-color: #333;
  --el-segmented-item-selected-color: white;
  background: transparent;
  padding: 0;
}

.mode-switcher :deep(.el-segmented__item.is-selected) {
  background: #333 !important;
  color: white !important;
  font-weight: 500;
  border-color: #333 !important;
  position: relative;
  z-index: 1;
}

/* Override the sliding indicator background */
.mode-switcher :deep(.el-segmented__item-selected) {
  background-color: #333 !important;
}

/* Action Buttons Group */
.action-buttons-group {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  padding: 8px 16px;
  font-size: 14px;
  color: #333;
  background: white;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
}

.action-btn:hover:not(:disabled) {
  background-color: rgba(51, 51, 51, 0.05);
  transform: translateY(-1px);
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn i {
  font-size: 14px;
}

/* Content Area */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Admin Container - 只包含内容区域 */
.admin-container {
  background: white;
  border-radius: 0 0 8px 8px; /* 只有下方圆角 */
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

/* Navigation Wrapper with Scroll Buttons */
.admin-nav-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: #f5f7fa;
  border-bottom: 2px solid #e4e7ed;
  border-radius: 8px 8px 0 0; /* 上方圆角 */
  transition: all 0.3s ease; /* 平滑过渡效果 */
}

/* Pinned 状态 - Sticky */
.admin-nav-wrapper.is-pinned {
  position: sticky;
  top: -20px; /* 抵消 .content-area 的 padding-top，最终位置 = 60px (TopBar 下方) */
  z-index: 50; /* 在内容之上，但低于 TopBar (100) */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* 阴影增强层次感 */
}

/* Left Gradient Mask */
.admin-nav-wrapper::before {
  content: '';
  position: absolute;
  left: 40px;
  top: 0;
  bottom: 2px;
  width: 20px;
  background: linear-gradient(to right, #f5f7fa, transparent);
  pointer-events: none;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.3s;
}

.admin-nav-wrapper.has-left-overflow::before {
  opacity: 1;
}

/* Right Gradient Mask */
.admin-nav-wrapper::after {
  content: '';
  position: absolute;
  right: 40px;
  top: 0;
  bottom: 2px;
  width: 20px;
  background: linear-gradient(to left, #f5f7fa, transparent);
  pointer-events: none;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.3s;
}

.admin-nav-wrapper.has-right-overflow::after {
  opacity: 1;
}

/* Pin Button */
.pin-button {
  position: absolute;
  right: 60px; /* 避开右侧滚动按钮 (50px) + 间距 */
  top: 50%;
  transform: translateY(-50%);
  z-index: 15; /* 高于滚动按钮 */
  opacity: 0.8;
  transition: all 0.3s ease;
}

.pin-button:hover {
  opacity: 1;
  transform: translateY(-50%) scale(1.1);
}

/* 激活状态（按下时，sticky 启用） */
.pin-button.is-active {
  opacity: 1;
}

.pin-button.is-active :deep(.el-button) {
  background-color: #f56c6c !important;
  border-color: #f56c6c !important;
  color: white !important;
}

/* 未激活状态（sticky 禁用） */
.pin-button:not(.is-active) :deep(.el-button) {
  background-color: white !important;
  color: #909399 !important;
  border-color: #dcdfe6 !important;
}

/* 图钉图标旋转动画 */
.pin-button.is-active i {
  transform: rotate(45deg);
  transition: transform 0.3s ease;
}

.pin-button:not(.is-active) i {
  transform: rotate(0deg);
  transition: transform 0.3s ease;
}

/* Scroll Buttons (el-button plain circle) */
.scroll-button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  flex-shrink: 0;
}

.scroll-button.scroll-button-left {
  left: 10px;
}

.scroll-button.scroll-button-right {
  right: 10px;
}

/* Override el-button styles for scroll buttons */
.scroll-button :deep(.el-button) {
  width: 32px;
  height: 32px;
  padding: 0;
}

.scroll-button:not(.disabled) :deep(.el-button:hover) {
  color: #FF6600;
  border-color: #FF6600;
  background-color: rgba(255, 102, 0, 0.05);
}

.scroll-button.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Navigation Tabs Container */
.admin-nav {
  display: flex;
  gap: 0;
  padding: 10px 50px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  flex: 1;

  /* Hide scrollbar */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}

.admin-nav::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.nav-tab {
  padding: 12px 24px;
  border-radius: 4px 4px 0 0;
  color: #606266;
  text-decoration: none;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 14px;
  background: transparent;
  border: none;
  position: relative;

  /* Prevent shrinking on narrow screens */
  flex-shrink: 0;
  white-space: nowrap;
  min-width: max-content;
}

.nav-tab i {
  font-size: 16px;
}

.nav-tab:hover {
  color: #FF6600;
  background: rgba(255, 102, 0, 0.05);
}

.nav-tab.active {
  color: #FF6600;
  background: white;
  font-weight: 600;
  border-bottom: 2px solid #FF6600;
  margin-bottom: -2px;
}

/* Tab Content */
.tab-content {
  padding: 20px;
  min-height: 500px;
}

/* No Access State */
.no-access {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background: white;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
}

.no-access i {
  font-size: 64px;
  color: #909399;
  margin-bottom: 20px;
}

.no-access h3 {
  font-size: 20px;
  color: #606266;
  margin: 0 0 10px 0;
}

.no-access p {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background: white;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
}

.loading-state i {
  font-size: 48px;
  color: #409eff;
  margin-bottom: 20px;
}

.loading-state p {
  font-size: 14px;
  color: #606266;
  margin: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  /* Limit title text width - show ellipsis for long titles */
  .title-container h1 .title-text {
    max-width: 120px; /* Approximately 3-4 Chinese characters + ... */
  }

  /* Reduce top bar padding */
  .top-bar {
    padding: 0 15px;
  }

  .title-container {
    gap: 8px;
  }

  /* Adjust pin button position for mobile */
  .pin-button {
    right: 15px; /* 靠右显示 */
    opacity: 0.6;
  }

  /* Hide scroll buttons on mobile - use touch sliding */
  .scroll-button {
    display: none;
  }

  /* Restore original padding without buttons */
  .admin-nav {
    padding: 10px 20px;
    padding-right: 60px; /* 为 pin 按钮留出空间 */
  }

  /* Hide gradient masks on mobile */
  .admin-nav-wrapper::before,
  .admin-nav-wrapper::after {
    display: none;
  }

  /* Optimize nav tab spacing for mobile */
  .nav-tab {
    padding: 10px 16px;
    font-size: 13px;
  }

  .nav-tab i {
    font-size: 14px;
  }

  /* Sticky 在移动端保持相同的 top 值 */
  .admin-nav-wrapper.is-pinned {
    top: -20px; /* 抵消 padding，紧贴 TopBar */
  }
}

@media (max-width: 480px) {
  /* Hide title text completely, show only icon */
  .title-container h1 .title-text {
    display: none;
  }

  .title-container h1 {
    gap: 0; /* Remove gap when text is hidden */
  }

  /* Further reduce padding */
  .top-bar {
    padding: 0 10px;
  }

  .title-container {
    gap: 6px;
  }

  /* Further optimize for very small screens */
  .nav-tab {
    padding: 8px 12px;
    font-size: 12px;
  }
}

/* Portrait mode: Hide TopBarUserControls in top-bar (moved to sidebar) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  /* 為漢堡按鈕留出左側空間 */
  .top-bar {
    padding-left: 60px;
  }

  .top-bar :deep(.user-controls) {
    display: none !important;
  }
}
</style>
