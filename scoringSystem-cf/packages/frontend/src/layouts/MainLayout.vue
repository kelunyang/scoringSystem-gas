<template>
  <div class="main-layout">
    <!-- Content Container -->
    <div class="content-container">
      <!-- Mobile Hamburger Button (only visible in portrait mode) -->
      <div class="mobile-hamburger" @click="toggleMobileSidebar">
        <i class="fas fa-bars"></i>
      </div>

      <!-- Mobile Sidebar Overlay -->
      <div
        v-if="showMobileSidebar"
        class="mobile-sidebar-overlay"
        @click="closeMobileSidebar"
      ></div>

      <!-- Custom Sidebar -->
      <div class="sidebar" :class="{
        collapsed: sidebarCollapsed,
        'mobile-open': showMobileSidebar,
        'sudo-mode': sudoStore.isActive
      }">
        <!-- Header with collapse button -->
        <div class="sidebar-header">
          <!-- 展開狀態：顯示完整麵包屑 -->
          <el-breadcrumb v-if="!sidebarCollapsed" separator=">" class="sidebar-breadcrumb">
            <el-breadcrumb-item v-for="(item, index) in breadcrumbItems" :key="index">
              {{ item }}
            </el-breadcrumb-item>
          </el-breadcrumb>
          <!-- Desktop collapse button -->
          <button class="collapse-btn desktop-only" @click="toggleSidebar">
            <i :class="sidebarCollapsed ? 'fas fa-up-right-and-down-left-from-center' : 'fas fa-down-left-and-up-right-to-center'"></i>
          </button>
          <!-- Mobile close button -->
          <button class="collapse-btn mobile-only" @click="closeMobileSidebar">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <div
            class="nav-item nav-home"
            :class="{ active: route.name === 'dashboard' }"
            @click="handleNavigation('dashboard')"
          >
            <i class="fas fa-home"></i>
            <span v-if="!sidebarCollapsed">專案</span>
          </div>

          <div
            class="nav-item nav-wallet"
            :class="{ active: route.name === 'wallets' }"
            @click="handleNavigation('wallets')"
          >
            <i class="fas fa-wallet"></i>
            <span v-if="!sidebarCollapsed">錢包</span>
          </div>

          <!-- System Admin Navigation (只有總PM可見) -->
          <div
            v-if="user && isSystemAdmin"
            class="nav-item nav-admin"
            :class="{ active: route.name && typeof route.name === 'string' && route.name.startsWith('admin') }"
            @click="handleNavigation('admin-users')"
          >
            <i class="fas fa-cog"></i>
            <span v-if="!sidebarCollapsed">系統管理</span>
          </div>

        </nav>

        <!-- Spacer pushes content to bottom -->
        <div class="sidebar-spacer"></div>

        <!-- Personal Settings Links (Portrait Mode Only) -->
        <nav v-if="showMobileSidebar" class="sidebar-nav sidebar-nav--personal">
          <div
            class="nav-item nav-permissions"
            @click="openPermissionsDrawer"
          >
            <i class="fas fa-shield-alt"></i>
            <span>檢視權限</span>
          </div>
          <div
            class="nav-item nav-settings"
            :class="{ active: route.name === 'user-settings' }"
            @click="handleNavigation('user-settings')"
          >
            <i class="fas fa-user-cog"></i>
            <span>使用者設定</span>
          </div>
          <div
            class="nav-item nav-logout"
            @click="handleUserCommand('logout')"
          >
            <i class="fas fa-sign-out-alt"></i>
            <span>登出</span>
          </div>
        </nav>

        <!-- Sidebar User Controls (Portrait Mode Only) - 三個控件 -->
        <div v-if="showMobileSidebar" class="sidebar-user-controls">
          <!-- 1. 用戶頭像（帶徽章） -->
          <div class="sidebar-control-item">
            <el-tooltip
              :content="`${user?.displayName}(${user?.userEmail})`"
              placement="top"
              :show-after="300"
            >
              <div class="sidebar-user-avatar">
                <el-avatar :src="userAvatarUrl" :size="40" shape="square">
                  {{ userInitials }}
                </el-avatar>
                <!-- User Badges (3D Flip) -->
                <el-tooltip
                  v-if="allUserBadges.length > 0"
                  :content="badgeTooltipText"
                  placement="top"
                  :show-after="300"
                >
                  <div class="badge-flip-container">
                    <div
                      class="badge-flip-inner"
                      :class="{ flipping: isFlipping }"
                      :style="{ transform: `rotateY(${badgeActiveIndex * 180}deg)` }"
                    >
                      <!-- Current Badge (Front) -->
                      <div
                        v-if="currentBadge"
                        class="user-badge badge-front"
                        :class="{ 'wealth-first': currentBadge.type === 'wealth' && currentBadge.isFirst }"
                        :style="{ backgroundColor: currentBadge.color }"
                      >
                        <i :class="currentBadge.icon"></i>
                      </div>
                      <!-- Next Badge (Back) -->
                      <div
                        v-if="nextBadge"
                        class="user-badge badge-back"
                        :style="{ backgroundColor: nextBadge.color }"
                      >
                        <i :class="nextBadge.icon"></i>
                      </div>
                    </div>
                  </div>
                </el-tooltip>
              </div>
            </el-tooltip>
          </div>

          <!-- 2. Session Timer -->
          <div class="sidebar-control-item">
            <div class="sidebar-timer" :style="{ background: timerGradient }">
              <div class="sidebar-timer-inner">
                <span>{{ formatTimeMini(remainingTime) }}</span>
              </div>
            </div>
          </div>

          <!-- 3. 通知中心 -->
          <div class="sidebar-control-item">
            <NotificationCenter variant="sidebar" />
          </div>
        </div>

        <!-- Watermark Footer (底部) -->
        <div class="sidebar-watermark-2025">
          <span>Kelunyang@2025</span>
          <a href="mailto:kelunyang@outlook.com" target="_blank"><i class="fa-solid fa-envelope"></i></a>
          <a href="https://github.com/kelunyang/scoringSystem-gas" target="_blank"><i class="fa-brands fa-github"></i></a>
        </div>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <router-view
          :user="user"
          :session-percentage="sessionPercentage"
          :remaining-time="remainingTime"
          @enter-project="enterProject"
          @back="backToDashboard"
          @user-command="handleUserCommand"
        />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import { useWebSocketStore } from '../stores/websocket'
import { useAuth } from '../composables/useAuth'
import { usePermissions } from '../composables/usePermissions'
import type { Project } from '@/types'
import {
  getTokenRemainingTime,
  getSessionPercentage,
  shouldShowExpiryWarning,
  shouldRefreshToken,
  isTokenExpired
} from '../utils/jwt'
import { handleError, showWarning, showInfo } from '@/utils/errorHandler'
import { authEventBus } from '@/utils/authEventBus'
import { rpcClient } from '@/utils/rpc-client'
import { apiClient } from '@/utils/api'
import { useBreadcrumb } from '../composables/useBreadcrumb'
import TopBarUserControls from '../components/TopBarUserControls.vue'
import NotificationCenter from '../components/NotificationCenter.vue'
import { ElMessage } from 'element-plus'
import { usePermissionsDrawerStore } from '../stores/permissionsDrawer'
import { useNotificationCenterStore } from '../stores/notificationCenter'
import { useSudoStore } from '../stores/sudo'
import { useNotificationCount } from '../composables/useNotifications'
import { getUserPreferences } from '../utils/userPreferences'

// ========================================
// Composables
// ========================================

const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const websocket = useWebSocketStore()
const { breadcrumbItems, fetchSystemTitle, clearProjectTitle } = useBreadcrumb()

// Vue 3 Best Practice: Use unified useAuth() composable
const { user: userFromAuth, token, logout, userQuery } = useAuth()

// Use permission system
const {
  permissions: userPermissions,
  isLoading: userIsLoading
} = usePermissions(userQuery)

// System admin check
const isSystemAdmin = computed(() => {
  const perms = userPermissions.value
  if (userIsLoading.value) return false

  const adminPermissions = [
    'system_admin',
    'manage_users',
    'manage_global_groups',
    'create_project',
    'manage_system_settings',
    'view_system_logs',
    'view_email_logs',
    'notification_manager'
  ]

  return adminPermissions.some(perm => perms.includes(perm))
})

// ========================================
// Constants
// ========================================

const BADGE_FLIP_INTERVAL = 5000  // 徽章翻轉間隔（毫秒）
const BADGE_FLIP_DURATION = 600   // 徽章翻轉動畫時長（毫秒）

// ========================================
// Reactive State
// ========================================

const sidebarCollapsed = ref(false)
const showMobileSidebar = ref(false)
const currentTime = ref(Date.now())
const sessionWarningShown = ref(false)

// Permissions Drawer Store
const permissionsDrawer = usePermissionsDrawerStore()

// Sudo Store
const sudoStore = useSudoStore()

// Notification Center Store and Query
const notificationCenterStore = useNotificationCenterStore()
const notificationCountQuery = useNotificationCount()
const hasCheckedAutoOpenNotification = ref(false)

// Badge Animation State
const badgeActiveIndex = ref(0)
const isFlipping = ref(false)
let flipTimer: ReturnType<typeof setInterval> | null = null

// ✅ Event bus unsubscribe functions
let unsubscribeTokenRenewal: (() => void) | null = null

// ========================================
// Computed Properties
// ========================================

const user = computed(() => userFromAuth.value || null)

const remainingTime = computed(() => {
  currentTime.value // Force re-computation
  if (!token.value) return 0
  return getTokenRemainingTime(token.value)
})

const sessionPercentage = computed(() => {
  currentTime.value // Force re-computation
  if (!token.value) return 0
  return getSessionPercentage(token.value)
})

// ========================================
// Sidebar User Controls (Portrait Mode)
// ========================================

const userAvatarUrl = computed(() => {
  // SUDO 模式：使用被 sudo 的學生頭像
  if (sudoStore.isActive && sudoStore.displayInfo) {
    const seed = sudoStore.displayInfo.avatarSeed || `${sudoStore.displayInfo.email}_sudo`
    const style = sudoStore.displayInfo.avatarStyle || 'avataaars'
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&size=40`
  }

  // 正常模式：使用自己的頭像
  if (!user.value) return ''
  const seed = user.value.avatarSeed || user.value.userEmail
  const style = user.value.avatarStyle || 'avataaars'
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&size=40`
})

const userInitials = computed(() => {
  // SUDO 模式：使用被 sudo 的學生名稱
  if (sudoStore.isActive && sudoStore.displayInfo?.name) {
    const name = sudoStore.displayInfo.name
    return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()
  }

  // 正常模式：使用自己的名稱
  const name = user.value?.displayName || 'U'
  return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()
})

const timerGradient = computed(() => {
  const percentage = sessionPercentage.value
  let color = '#1A9B8E' // 土耳其藍 (Scheme M Success)
  if (percentage <= 30) {
    color = '#E91E63' // 熱粉紅 (Scheme M Danger)
  } else if (percentage <= 50) {
    color = '#FF6347' // 珊瑚橙深 (Scheme M Warning)
  } else if (percentage <= 70) {
    color = '#FFA07A' // 珊瑚橙淺 (Scheme M Warning Light)
  }
  return `conic-gradient(${color} ${percentage * 3.6}deg, #e4e7ed 0deg)`
})

const formatTimeMini = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${hours}h`
  return `${totalMinutes}m`
}

// ========================================
// Badge System (Portrait Mode)
// ========================================

interface Badge {
  type: string
  icon: string
  color: string
  label: string
  isFirst?: boolean
}

const globalPermissionBadge = computed<Badge | null>(() => {
  const permissions = user.value?.permissions || []

  if (permissions.length === 0) return null

  // 級別 1：系統管理類（最高優先級）
  const systemPerms = [
    'system_admin',
    'manage_system_settings',
    'view_system_logs',
    'view_email_logs',
    'manage_email_logs',
    'notification_manager'
  ]
  if (permissions.some((p: string) => systemPerms.includes(p))) {
    return {
      type: 'system',
      icon: 'fas fa-crown',
      color: '#FFD700',
      label: '系統管理'
    }
  }

  // 級別 2：使用者管理類
  const userPerms = [
    'manage_users',
    'manage_global_groups',
    'generate_invites',
    'manage_invitations'
  ]
  if (permissions.some((p: string) => userPerms.includes(p))) {
    return {
      type: 'user',
      icon: 'fas fa-users-cog',
      color: '#9C27B0',
      label: '使用者管理'
    }
  }

  // 級別 3：專案管理類
  const projectPerms = [
    'create_project',
    'delete_any_project',
    'manage_any_project'
  ]
  if (permissions.some((p: string) => projectPerms.includes(p))) {
    return {
      type: 'project',
      icon: 'fas fa-project-diagram',
      color: '#409EFF',
      label: '專案管理'
    }
  }

  return null
})

const allUserBadges = computed<Badge[]>(() => {
  const badges: Badge[] = []

  // 0. SUDO 模式徽章（最高優先級，永遠顯示在最前面）
  if (sudoStore.isActive) {
    badges.push({
      type: 'sudo',
      icon: 'fas fa-user-secret',
      color: '#e6a23c',
      label: `正在以 ${sudoStore.displayInfo?.name || '學生'} 的身份檢視（唯讀模式）`
    })
  }

  // 1. 全域權限徽章
  if (globalPermissionBadge.value) badges.push(globalPermissionBadge.value)

  return badges
})

const currentBadge = computed<Badge | null>(() => {
  if (allUserBadges.value.length === 0) return null
  return allUserBadges.value[badgeActiveIndex.value % allUserBadges.value.length]
})

const nextBadge = computed<Badge | null>(() => {
  if (allUserBadges.value.length <= 1) return null
  const nextIndex = (badgeActiveIndex.value + 1) % allUserBadges.value.length
  return allUserBadges.value[nextIndex]
})

const badgeTooltipText = computed(() => {
  const messages: string[] = []

  // SUDO 模式徽章提示（最高優先級）
  if (sudoStore.isActive) {
    messages.push(`正在以 ${sudoStore.displayInfo?.name || '學生'} 的身份檢視（唯讀模式）`)
  }

  if (globalPermissionBadge.value) {
    messages.push(`你的全站權限為${globalPermissionBadge.value.label}`)
  }

  return messages.join('，')
})

const startBadgeRotation = () => {
  if (allUserBadges.value.length <= 1) return // 只有一個徽章不需要翻轉

  flipTimer = setInterval(() => {
    isFlipping.value = true

    setTimeout(() => {
      badgeActiveIndex.value++
      isFlipping.value = false
    }, BADGE_FLIP_DURATION)

  }, BADGE_FLIP_INTERVAL)
}

const stopBadgeRotation = () => {
  if (flipTimer) {
    clearInterval(flipTimer)
    flipTimer = null
  }
}

// ========================================
// Watchers
// ========================================

// Defensive measure: Watch for auth errors and redirect to login
// ✅ Fix: Check isLoading to avoid redirecting during loading
watch(
  [() => userQuery.isError.value, () => userQuery.isLoading.value],
  ([isError, isLoading]) => {
    // Only process errors after loading is complete
    if (isError && !isLoading) {
      const error = userQuery.error.value
      const errorMessage = error?.message || ''

      // Only redirect on authentication-related errors
      if (errorMessage === 'NO_SESSION' ||
          errorMessage === 'TOKEN_EXPIRED' ||
          errorMessage === 'AUTH_FAILED' ||
          errorMessage === 'INVALID_USER_DATA') {
        router.push({ name: 'auth-login' })
      }
    }
  }
)

// Start/stop badge rotation when sidebar visibility changes
watch(showMobileSidebar, (isOpen) => {
  if (isOpen) {
    startBadgeRotation()
  } else {
    stopBadgeRotation()
  }
})

// ========================================
// Auto-open Notification Center (once per session)
// ========================================

// Watch notification count to auto-open notification center
watch(
  () => notificationCountQuery.data.value,
  (count) => {
    // Skip if count is undefined (not yet loaded)
    if (count === undefined) return

    // Only check once per page load
    if (hasCheckedAutoOpenNotification.value) return
    hasCheckedAutoOpenNotification.value = true

    // Check if user has enabled auto-open
    const userId = user.value?.userId
    if (!userId) return

    const prefs = getUserPreferences(userId)
    const autoOpen = prefs.autoOpenNotificationCenter !== false // Default to true

    console.log('🔔 [MainLayout] Auto-open check:', { count, autoOpen, isOpen: notificationCenterStore.isOpen })

    // Check unread count - count is already a number from useNotificationCount
    if (count > 0 && autoOpen && !notificationCenterStore.isOpen) {
      // Show toast with message about how to disable
      ElMessage.info({
        message: `您有 ${count} 則未讀通知。如不想自動開啟，請至「用戶設定」關閉此功能。`,
        duration: 5000,
        showClose: true
      })
      // Auto-open notification center via store
      notificationCenterStore.open()
      console.log('🔔 [MainLayout] Opening notification center')
    }
  },
  { immediate: true }
)

// ========================================
// Interval Functions
// ========================================

// Update countdown timer every second
useIntervalFn(() => {
  currentTime.value = Date.now()
}, 1000, { immediate: true })

// Check session expiry and auto-refresh
useIntervalFn(() => {
  if (!token.value) return

  // Check if token is expired
  if (isTokenExpired(token.value)) {
    console.warn('Session expired, logging out')
    logout()
    return
  }

  // Show warning if < 5 minutes remaining
  if (shouldShowExpiryWarning(token.value) && !sessionWarningShown.value) {
    const remaining = getTokenRemainingTime(token.value)
    const minutes = Math.floor(remaining / 60000)
    showWarning(`您的登入將在 ${minutes} 分鐘後過期`)
    sessionWarningShown.value = true
  }

  // Auto-refresh token if needed
  if (token.value && shouldRefreshToken(token.value) && !sessionWarningShown.value) {
    refreshToken()
  }
}, 1000)

// ========================================
// Methods
// ========================================

const enterProject = (project: Project) => {
  console.log('進入專案:', project)
  router.push({
    name: 'projects-view',
    params: { projectId: project.projectId }
  })
}

const backToDashboard = () => {
  router.push({ name: 'dashboard' })
  clearProjectTitle()
}

const handleNavigation = (page: string) => {
  router.push({ name: page })
  closeMobileSidebar()
}

const openPermissionsDrawer = () => {
  // Get projectId from current route if available
  const projectId = route.params.projectId as string || null
  permissionsDrawer.open(projectId)
  closeMobileSidebar()
}

const handleUserCommand = (command: string) => {
  if (command === 'settings') {
    openUserSettings()
  } else if (command === 'logout') {
    logout()
  } else if (command === 'refresh-user-data') {
    refreshUserData()
  }
}

// Vue 3 Best Practice: Use apiClient.saveToken() instead of direct sessionStorage
const refreshToken = async () => {
  try {
    const httpResponse = await (rpcClient.api.auth as any)['refresh-token'].$post()
    const response = await httpResponse.json()
    if (response.success && response.data.token) {
      apiClient.saveToken(response.data.token)
      console.log('Token refreshed successfully')
      sessionWarningShown.value = false
    }
  } catch (error) {
    handleError(error as Error, { action: '刷新 Token', type: 'warning' })
  }
}

const setupWebSocket = () => {
  if (!websocket) return

  websocket.on('connected', () => {
    console.log('WebSocket connected')
  })

  websocket.on('disconnected', (data: any) => {
    console.log('WebSocket disconnected:', data)
  })

  websocket.on('permission_changed', (data: any) => {
    console.log('Permissions changed:', data)
    refreshUserData()
  })

  websocket.on('account_disabled', (data: any) => {
    handleError(data.message || '您的帳號已被停用', {
      action: '帳號檢查',
      type: 'error'
    })
    logout()
  })

  websocket.on('force_logout', (data: any) => {
    showWarning(data.reason || '您已被強制登出')
    logout()
  })

  websocket.on('system_announcement', (data: any) => {
    console.log('System announcement:', data)
    if (data.message) {
      showInfo(data.message)
    }
  })

  websocket.on('user_data_updated', () => {
    console.log('User data updated via WebSocket')
    refreshUserData()
  })

  websocket.on('settlement_progress', (data: any) => {
    console.log('Settlement progress update:', data)
    window.dispatchEvent(new CustomEvent('settlement-progress', { detail: data }))
  })

  // ⭐ 新增：監聽一般通知，根據類型自動刷新權限
  websocket.on('notification', (data: any) => {
    console.log('Received notification:', data)

    // 定義需要刷新權限的通知類型
    const PERMISSION_RELATED_NOTIFICATIONS = [
      // 全局權限相關
      'group_member_added',       // 被加入全局組
      'group_member_removed',     // 被移出全局組
      'global_group_updated',     // 全局組權限被修改

      // 專案權限相關
      'project_role_assigned',    // 被分配專案角色（teacher/observer）
      'project_role_removed',     // 專案角色被移除
      'user_group_role_changed',  // 用戶組角色變更

      // 賬號狀態
      'account_locked',
      'account_unlocked'
    ]

    // 根據通知類型決定刷新策略
    if (PERMISSION_RELATED_NOTIFICATIONS.includes(data.type)) {
      console.log(`Permission-related notification detected: ${data.type}`)

      // 如果是全局權限相關，刷新 currentUser
      if (['group_member_added', 'group_member_removed', 'global_group_updated'].includes(data.type)) {
        console.log('Refreshing global permissions (currentUser)')
        queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      }

      // 如果是專案權限相關，刷新專案數據
      if (['project_role_assigned', 'project_role_removed', 'user_group_role_changed'].includes(data.type)) {
        console.log('Refreshing project permissions')

        // 如果通知包含 projectId，只刷新該專案
        if (data.projectId) {
          console.log(`Invalidating project-core for projectId: ${data.projectId}`)
          queryClient.invalidateQueries({ queryKey: ['project-core', data.projectId] })
        } else {
          // 否則刷新所有專案數據
          console.log('Invalidating all project-core queries')
          queryClient.invalidateQueries({ queryKey: ['project-core'] })
        }
      }
    }
  })

  if (token.value) {
    websocket.connect()
  }
}

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const toggleMobileSidebar = () => {
  showMobileSidebar.value = !showMobileSidebar.value
}

const closeMobileSidebar = () => {
  showMobileSidebar.value = false
}

const openUserSettings = () => {
  router.push({ name: 'user-settings' })
  console.log('開啟使用者設定')
}

const refreshUserData = async () => {
  await userQuery.refetch()
  console.log('User data refreshed via TanStack Query')
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    console.log('頁面隱藏，可以暫停某些操作')
  } else {
    console.log('頁面可見，恢復正常操作')
  }
}

// ========================================
// Lifecycle Hooks
// ========================================

onMounted(() => {
  // No need to initialize refreshTimer anymore - handled by userPreferences.ts with defaults

  fetchSystemTitle()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  setupWebSocket()

  // ✅ Subscribe to token renewal events
  unsubscribeTokenRenewal = authEventBus.onTokenRenewal(({ newToken, renewedAt }) => {
    console.log('🔄 Token renewed via event bus, resetting session warning')
    sessionWarningShown.value = false // Reset warning flag
  })
})

onBeforeUnmount(() => {
  websocket?.disconnect()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopBadgeRotation()

  // ✅ Unsubscribe from event bus
  if (unsubscribeTokenRenewal) {
    unsubscribeTokenRenewal()
  }
})
</script>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Mobile Hamburger Button */
.mobile-hamburger {
  display: none;
  position: fixed;
  top: 15px;
  left: 15px;
  z-index: 1001;
  background: linear-gradient(135deg, #4ECDC4 0%, #1A9B8E 100%); /* Scheme M Primary 漸層 */
  color: white;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.4);
  transition: all 0.3s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  border: none;
}

.mobile-hamburger:hover {
  opacity: 0.9;
  box-shadow: 0 6px 16px rgba(78, 205, 196, 0.5);
  transform: scale(1.05);
}

.mobile-hamburger:active {
  transform: scale(0.95);
}

.mobile-hamburger i {
  font-size: 20px;
  display: block;
}

/* Mobile Sidebar Overlay */
.mobile-sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sidebar {
  width: 200px;
  height: 100%;
  background: linear-gradient(180deg, #2f4050 0%, #283848 100%); /* 微妙漸層 - 方案 B+ */
  color: white;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  z-index: 999;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar.mobile-open {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 280px;
  transform: translateX(0);
  animation: slideInFromLeft 0.3s ease;
}

@keyframes slideInFromLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.sidebar-header {
  padding: 15px;
  border-bottom: 1px solid #34495e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #bdc3c7;
  min-height: 60px;
}

.sidebar-breadcrumb {
  font-size: 14px;
  line-height: 1.5;
  color: #FFD93D; /* 柠檬黄糖果 - Scheme M */
  background: rgba(255, 217, 61, 0.15); /* 15% 透明度背景 */
  padding: 6px 12px;
  border-radius: 6px;
  backdrop-filter: blur(4px); /* 毛玻璃效果 */
}

/* 覆盖 Element Plus 默认样式 */
.sidebar-breadcrumb :deep(.el-breadcrumb__item) {
  .el-breadcrumb__inner,
  .el-breadcrumb__inner a,
  .el-breadcrumb__inner a:hover,
  .el-breadcrumb__inner:hover {
    color: #FFD93D !important; /* 柠檬黄文字 */
    font-weight: 500;
  }
}

.sidebar-breadcrumb :deep(.el-breadcrumb__separator) {
  color: #FFC107 !important; /* 金黄色 separator */
  margin: 0 8px;
}

.collapse-btn {
  background: none;
  border: none;
  color: #bdc3c7;
  cursor: pointer;
  padding: 6px;
  border-radius: 3px;
  transition: all 0.3s;
  flex-shrink: 0;
}

.collapse-btn:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.1);
}

.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

.sidebar-nav {
  padding: 20px 0;
}

/* Spacer to push user controls to bottom */
.sidebar-spacer {
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  transition: background-color 0.3s;
  color: #bdc3c7;
}

.nav-item:hover {
  background-color: #34495e;
}

/* 專案 - 薄荷青 Scheme M Primary */
.nav-item.nav-home:hover {
  color: #4ECDC4;
}
.nav-item.nav-home.active {
  background: linear-gradient(135deg, #4ECDC4 0%, #1A9B8E 100%);
  color: white;
  font-weight: 600;
}

/* 錢包 - 蜜桃橙 */
.nav-item.nav-wallet:hover {
  color: #FF8A5B;
}
.nav-item.nav-wallet.active {
  background: linear-gradient(135deg, #FF8A5B 0%, #E85D3A 100%);
  color: white;
  font-weight: 600;
}

/* 系統管理 - 葡萄紫 */
.nav-item.nav-admin:hover {
  color: #A78BFA;
}
.nav-item.nav-admin.active {
  background: linear-gradient(135deg, #A78BFA 0%, #7C5DC7 100%);
  color: white;
  font-weight: 600;
}

/* 使用者設定 - 琥珀金色 */
.nav-item.nav-settings:hover {
  color: #FFC107;
}
.nav-item.nav-settings.active {
  background: linear-gradient(135deg, #FFC107 0%, #FF9800 100%);
  color: white;
  font-weight: 600;
}

/* 登出 - 珊瑚紅色 */
.nav-item.nav-logout:hover {
  color: #f56c6c;
}
.nav-item.nav-logout:active {
  background: rgba(245, 108, 108, 0.2);
}

.nav-item i {
  margin-right: 15px;
  width: 20px;
  text-align: center;
}

.sidebar.collapsed .nav-item {
  padding: 15px 22px;
  justify-content: center;
}

.sidebar.collapsed .nav-item span {
  display: none;
}

.sidebar.collapsed .nav-item i {
  margin-right: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: #f5f7fa;
}

/* Responsive Design - Portrait Mode */
@media screen and (orientation: portrait) and (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 280px;
  }

  .mobile-hamburger {
    display: block;
  }

  .mobile-sidebar-overlay {
    display: block;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: block;
  }

  .main-content {
    padding-top: 60px;
  }

  .sidebar.mobile-open .sidebar-header h3 {
    display: block;
  }

  .sidebar.mobile-open .nav-item span {
    display: inline !important;
  }

  .sidebar.mobile-open .nav-item i {
    margin-right: 15px !important;
  }
}

/* Landscape Mode */
@media screen and (orientation: landscape) and (max-width: 768px) {
  .sidebar {
    width: 64px;
  }

  .sidebar-header h3 {
    display: none;
  }

  .mobile-hamburger {
    display: none;
  }
}

/* Large screens */
@media (min-width: 769px) {
  .mobile-hamburger {
    display: none;
  }

  .mobile-sidebar-overlay {
    display: none !important;
  }

  .sidebar {
    position: relative !important;
    transform: none !important;
  }
}

/* ===== Sidebar User Controls (Portrait Mode) ===== */
.sidebar-user-controls {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid #34495e;
  background: linear-gradient(135deg, #2f4050 0%, #3d5166 100%);
}

.sidebar-control-item {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s;
}

.sidebar-control-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sidebar-timer {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-timer-inner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: #2c3e50;
}

/* Personal Settings Nav (Portrait Mode) */
.sidebar-nav--personal {
  border-top: 1px solid #34495e;
  padding-top: 10px;
  padding-bottom: 0;
}

/* 檢視權限 - 盾牌藍色 */
.nav-item.nav-permissions:hover {
  color: #409EFF;
}

/* ===== Badge System (Portrait Mode) ===== */
.sidebar-user-avatar {
  position: relative;
  display: flex;
  align-items: center;
}

.badge-flip-container {
  position: absolute;
  top: -4px;
  right: -8px;
  width: 18px;
  height: 18px;
  perspective: 1000px;
}

.badge-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.badge-flip-inner.flipping {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.user-badge {
  position: absolute;
  top: 0;
  left: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  font-size: 9px;
  color: white;
  backface-visibility: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.badge-front {
  transform: rotateY(0deg);
}

.badge-back {
  transform: rotateY(180deg);
}

/* 金牌特殊效果 - 只有第一名有呼吸光暈 */
.user-badge.wealth-first {
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  animation: medal-glow 2s ease-in-out infinite;
}

@keyframes medal-glow {
  0%, 100% {
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  }
  50% {
    box-shadow: 0 0 15px rgba(255, 215, 0, 0.9);
  }
}

/* ===== Sidebar Watermark 2025 ===== */
.sidebar-watermark-2025 {
  text-align: center;
  padding: 12px 20px;
  color: #bdc3c7;
  font-size: 11px;
}

.sidebar-watermark-2025 a {
  color: #bdc3c7;
  margin-left: 8px;
  text-decoration: none;
}

.sidebar-watermark-2025 a:hover {
  color: #4ECDC4;
}

.sidebar.collapsed .sidebar-watermark-2025 span {
  display: none;
}

.sidebar.collapsed .sidebar-watermark-2025 {
  padding: 8px;
}

.sidebar.collapsed .sidebar-watermark-2025 a {
  margin: 0 4px;
}

/* ===== Sidebar Footer (legacy) ===== */
.sidebar-footer {
  text-align: center;
  padding: 12px;
  color: #bdc3c7;
  font-size: 11px;
}

.sidebar-footer a {
  color: #bdc3c7;
  margin-left: 8px;
  text-decoration: none;
  transition: color 0.3s;
}

.sidebar-footer a:hover {
  color: #4ECDC4;
}

.sidebar.collapsed .sidebar-footer span {
  display: none;
}

.sidebar.collapsed .sidebar-footer {
  padding: 8px;
}

.sidebar.collapsed .sidebar-footer a {
  margin-left: 0;
  margin: 0 4px;
}

/* ===== Sidebar Sudo Mode ===== */
.sidebar.sudo-mode {
  background: linear-gradient(180deg, #8B5A2B 0%, #5D3A1A 100%); /* 棕橙色漸層 */
  border-right: 3px solid #e6a23c;
}

.sidebar.sudo-mode .sidebar-header {
  border-bottom-color: #e6a23c;
}

.sidebar.sudo-mode .sidebar-breadcrumb {
  background: rgba(230, 162, 60, 0.2);
}

.sidebar.sudo-mode .nav-item {
  color: #ffecd2;
}

.sidebar.sudo-mode .nav-item:hover {
  background-color: rgba(230, 162, 60, 0.3);
}

.sidebar.sudo-mode .sidebar-user-controls {
  background: linear-gradient(135deg, #5D3A1A 0%, #8B5A2B 100%);
  border-top-color: #e6a23c;
}

.sidebar.sudo-mode .sidebar-watermark-2025 {
  color: #ffecd2;
}

.sidebar.sudo-mode .sidebar-watermark-2025 a {
  color: #ffecd2;
}

.sidebar.sudo-mode .sidebar-watermark-2025 a:hover {
  color: #e6a23c;
}
</style>
