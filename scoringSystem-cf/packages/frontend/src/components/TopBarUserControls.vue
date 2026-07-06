<template>
  <div class="user-controls">
    <!-- Element Plus Dropdown -->
    <el-dropdown
      v-if="user"
      trigger="click"
      :hide-on-click="true"
      @command="handleCommand"
    >
      <span class="user-btn" :class="{ 'sudo-active': sudoActive }">
        <!-- User Avatar -->
        <div ref="avatarContainerRef" class="user-avatar">
          <el-avatar
            :src="avatarUrl"
            :alt="`${user.displayName}的頭像`"
            shape="square"
            :size="32"
            @error="handleAvatarError"
          >
            {{ generateInitials() }}
          </el-avatar>
          <!-- User Badges (3D Flip) -->
          <el-tooltip
            v-if="allUserBadges.length > 0"
            :content="badgeTooltipText"
            placement="bottom"
            :show-after="300"
          >
            <div class="badge-flip-container">
              <div
                class="badge-flip-inner"
                :class="{ flipping: isFlipping }"
                :style="{ transform: `rotateY(${activeIndex * 180}deg)` }"
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

        <el-tooltip
          :content="`${user.displayName} (${displayUserEmail})`"
          placement="bottom"
          :show-after="300"
        >
          <span class="user-name">{{ displayName }}</span>
        </el-tooltip>
        <i class="fas fa-chevron-down"></i>
      </span>

      <!-- Dropdown Menu -->
      <template #dropdown>
        <el-dropdown-menu>
          <!-- User Info Header -->
          <div class="dropdown-header">
            <div class="user-info-line">
              <span class="display-name">{{ user.displayName }}</span>
              <span class="email-hint">({{ displayUserEmail }})</span>
            </div>
          </div>
          <el-dropdown-item command="view-permissions" divided>
            <i class="fas fa-shield-alt"></i>
            檢視權限
          </el-dropdown-item>
          <el-dropdown-item command="settings">
            <i class="fas fa-cog"></i>
            使用者設定
          </el-dropdown-item>
          <el-dropdown-item command="logout">
            <i class="fas fa-sign-out-alt"></i>
            登出
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- Notification Center -->
    <NotificationCenter />
    
    <!-- Session Timer with Warning Animation -->
    <el-tooltip
      v-if="sessionPercentage < 50 && sessionPercentage > 0"
      :content="sessionWarningTooltip"
      placement="bottom"
      effect="dark"
    >
      <div
        class="session-timer session-timer-clickable"
        :class="{ 'session-warning': sessionPercentage < 50 }"
        role="button"
        @click="onSessionTimerClick"
      >
        <div
          class="timer-circle"
          :style="{ background: timerGradient }"
          :class="{ 'pulse-animation': sessionPercentage < 50 }"
        >
          <div class="timer-inner">
            <!-- ✅ 低于 50% 显示警告图标 -->
            <i
              v-if="sessionPercentage < 50"
              class="fas fa-exclamation-triangle warning-icon"
              :class="blinkAnimationClass"
            ></i>
            <!-- ✅ 否则显示倒数时间 -->
            <span v-else class="timer-text">{{ formatTime(remainingTime) }}</span>
          </div>
        </div>
      </div>
    </el-tooltip>

    <!-- 正常状态（>50%）不显示 tooltip -->
    <div v-else class="session-timer">
      <div class="timer-circle" :style="{ background: timerGradient }">
        <div class="timer-inner">
          <span class="timer-text">{{ formatTime(remainingTime) }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import NotificationCenter from './NotificationCenter.vue'
import { usePermissionsDrawerStore } from '@/stores/permissionsDrawer'
import { useSudoStore } from '@/stores/sudo'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

// ===== 徽章翻轉動畫常數 =====
const BADGE_FLIP_INTERVAL = 5000  // 徽章翻轉間隔（毫秒）
const BADGE_FLIP_DURATION = 600   // 徽章翻轉動畫時長（毫秒）

// ===== 煙火動畫常數 =====
const FIREWORK_COUNT = 8
const FIREWORK_BASE_DISTANCE = 40
const FIREWORK_RANDOM_DISTANCE = 20
const FIREWORK_DURATION = 1500
const FIREWORK_FINAL_DISTANCE_MULTIPLIER = 1.3

interface TopBarUser {
  displayName?: string
  userEmail?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
  permissions?: string[]
}

interface UserBadge {
  type: string
  icon: string
  color: string
  label: string
  rank?: number
  isFirst?: boolean
}

interface WealthRanking {
  userEmail: string
  rank: number
}

const props = withDefaults(defineProps<{
  variant?: 'topbar'
  user?: TopBarUser | null
  sessionPercentage?: number
  remainingTime?: number
  userEmail?: string
  permissions?: string[] | null
  projectPermission?: string | null
  availableRoles?: string[]
  currentRole?: string | null
  projectId?: string | null
  permissionLevel?: number | null
  wealthRankings?: WealthRanking[]
}>(), {
  variant: 'topbar',
  user: null,
  sessionPercentage: 100,
  remainingTime: 0,
  userEmail: '',
  permissions: null,
  projectPermission: null,
  availableRoles: () => [],
  currentRole: null,
  projectId: null,
  permissionLevel: null,
  wealthRankings: () => []
})

const emit = defineEmits<{
  'user-command': [command: string]
}>()

// Sudo store（script setup 可直接初始化；initFromStorage 保持在 mounted 執行）
const sudoStore = useSudoStore()

const avatarError = ref(false)
const activeIndex = ref(0)
const flipTimer = ref<ReturnType<typeof setInterval> | null>(null)
const isFlipping = ref(false)
// Session timer animation state
const maxSessionTimeout = ref(86400000) // 24 hours in ms (从 KV 读取，默认值)
const lastBlinkThreshold = ref(100) // 用于追踪上一次触发闪烁的阈值
const blinkBurst = ref(false) // 是否处于一轮阈值穿越闪烁中（由 sessionPercentage watcher 设置）

// 煙火動畫的目標容器（原為 this.$el.querySelector('.user-avatar')）
const avatarContainerRef = ref<HTMLElement | null>(null)

// Sudo mode computed properties
const sudoActive = computed(() => sudoStore.isActive || false)
const sudoDisplayInfo = computed(() => sudoStore.displayInfo || null)

const displayUserEmail = computed(() => {
  return props.userEmail || props.user?.userEmail || ''
})

const avatarUrl = computed(() => {
  if (avatarError.value || !props.user) {
    // Fallback to initials avatar
    return generateInitialsAvatar()
  }

  // SUDO 模式：使用被 sudo 的學生頭像
  if (sudoActive.value && sudoDisplayInfo.value) {
    const seed = sudoDisplayInfo.value.avatarSeed || `${sudoDisplayInfo.value.email}_sudo`
    const style = sudoDisplayInfo.value.avatarStyle || 'avataaars'
    return generateDicebearUrl(seed, style, {})
  }

  // 正常模式：使用自己的頭像
  const seed = props.user.avatarSeed || `${props.user.userEmail}_${Date.now()}`
  const style = props.user.avatarStyle || 'avataaars'

  // Parse avatarOptions if it's a string
  let options: Record<string, string> = {}
  if (props.user.avatarOptions) {
    if (typeof props.user.avatarOptions === 'string') {
      try {
        options = JSON.parse(props.user.avatarOptions)
      } catch {
        console.warn('Failed to parse avatarOptions:', props.user.avatarOptions)
        options = {}
      }
    } else {
      // dicebear 參數實際為字串值；上游型別較寬鬆
      options = props.user.avatarOptions as Record<string, string>
    }
  }

  return generateDicebearUrl(seed, style, options)
})

const displayName = computed(() => {
  // SUDO 模式：顯示被 sudo 的學生名稱
  if (sudoActive.value && sudoDisplayInfo.value?.name) {
    return sudoDisplayInfo.value.name
  }
  // 正常模式：顯示自己的名稱
  return props.user?.displayName || ''
})

const globalPermissionBadge = computed<UserBadge | null>(() => {
  const permissions = props.user?.permissions || []

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
  if (permissions.some(p => systemPerms.includes(p))) {
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
  if (permissions.some(p => userPerms.includes(p))) {
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
  if (permissions.some(p => projectPerms.includes(p))) {
    return {
      type: 'project',
      icon: 'fas fa-project-diagram',
      color: '#409EFF',
      label: '專案管理'
    }
  }

  return null
})

const projectRoleBadge = computed<UserBadge | null>(() => {
  // 優先使用 currentRole（ProjectDetail 傳入，支援角色切換）
  if (props.currentRole) {
    return getRoleBadgeByName(props.currentRole)
  }

  // 其次使用 permissionLevel（WalletNew 傳入，僅最高權限）
  if (props.permissionLevel !== null && props.permissionLevel !== undefined) {
    return getRoleBadgeByLevel(props.permissionLevel)
  }

  return null
})

const userWealthRank = computed<WealthRanking | null>(() => {
  if (!props.wealthRankings || props.wealthRankings.length === 0) return null
  const userEmail = props.user?.userEmail
  if (!userEmail) return null
  return props.wealthRankings.find(r => r.userEmail === userEmail) || null
})

const allUserBadges = computed<UserBadge[]>(() => {
  const badges: UserBadge[] = []

  // 0. SUDO 模式徽章（最高優先級，永遠顯示在最前面）
  if (sudoActive.value) {
    badges.push({
      type: 'sudo',
      icon: 'fas fa-user-secret',
      color: '#e6a23c',
      label: `正在以 ${sudoDisplayInfo.value?.name || '學生'} 的身份檢視（唯讀模式）`
    })
  }

  // 1. 全域權限徽章
  if (globalPermissionBadge.value) badges.push(globalPermissionBadge.value)

  // 2. 專案角色徽章
  if (projectRoleBadge.value) badges.push(projectRoleBadge.value)

  // 3. 財富徽章（前 3% 富豪）
  if (userWealthRank.value) {
    badges.push({
      type: 'wealth',
      icon: 'fas fa-medal',
      color: '#FFD700',
      label: '專案富豪',
      rank: userWealthRank.value.rank,
      isFirst: userWealthRank.value.rank === 1  // 只有第一名有呼吸光暈
    })
  }

  return badges
})

const currentBadge = computed<UserBadge | null>(() => {
  if (allUserBadges.value.length === 0) return null
  return allUserBadges.value[activeIndex.value % allUserBadges.value.length]
})

const nextBadge = computed<UserBadge | null>(() => {
  if (allUserBadges.value.length <= 1) return null
  const nextIndex = (activeIndex.value + 1) % allUserBadges.value.length
  return allUserBadges.value[nextIndex]
})

const badgeTooltipText = computed(() => {
  const messages: string[] = []

  // SUDO 模式徽章提示（最高優先級）
  if (sudoActive.value) {
    messages.push(`正在以 ${sudoDisplayInfo.value?.name || '學生'} 的身份檢視（唯讀模式）`)
  }

  if (globalPermissionBadge.value) {
    messages.push(`你的全站權限為${globalPermissionBadge.value.label}`)
  }

  if (projectRoleBadge.value) {
    messages.push(`專案權限為${projectRoleBadge.value.label}`)
  }

  if (userWealthRank.value) {
    messages.push(`你是第 ${userWealthRank.value.rank} 名`)
  }

  return messages.join('，')
})

// ✅ Session Timer UI computed properties

/**
 * Tooltip 内容
 */
const sessionWarningTooltip = computed(() => {
  const halfTime = maxSessionTimeout.value / 2
  const halfTimeMinutes = Math.floor(halfTime / 60000)
  return `登入有效期低於 ${halfTimeMinutes} 分鐘，點一下即可立即延長有效期`
})

/**
 * Timer 圆环渐变颜色 (Scheme M - Bubblegum Bright)
 * >70% - 土耳其藍 (#1A9B8E)
 * 50-70% - 珊瑚橙淺 (#FFA07A)
 * 30-50% - 珊瑚橙深 (#FF6347)
 * <30% - 熱粉紅 (#E91E63)
 */
const timerGradient = computed(() => {
  const percentage = props.sessionPercentage
  let color: string

  if (percentage <= 30) {
    color = '#E91E63' // 熱粉紅 (Scheme M Danger)
  } else if (percentage <= 50) {
    color = '#FF6347' // 珊瑚橙深 (Scheme M Warning)
  } else if (percentage <= 70) {
    color = '#FFA07A' // 珊瑚橙淺 (Scheme M Warning Light)
  } else {
    color = '#1A9B8E' // 土耳其藍 (Scheme M Success)
  }

  return `conic-gradient(${color} ${percentage * 3.6}deg, #e4e7ed 0deg)`
})

/**
 * 闪烁动画 class
 * 逻辑：
 * - 50% 以下才显示警告图标
 * - 每降低 10% 触发一轮闪烁（三次，阈值穿越由 watcher 侦测）
 * - 低于 10% 时持续闪烁
 */
const blinkAnimationClass = computed(() => {
  const percentage = props.sessionPercentage

  // <10% 时持续闪烁
  if (percentage < 10) {
    return 'blink-continuous'
  }

  return blinkBurst.value ? 'blink-burst' : ''
})

// 侦测穿越新的 10% 阈值（例如 45% → 39%，threshold 从 40 变为 30）时触发一轮闪烁
watch(() => props.sessionPercentage, (percentage) => {
  if (percentage < 10) return

  const threshold = Math.floor(percentage / 10) * 10
  if (threshold < lastBlinkThreshold.value) {
    lastBlinkThreshold.value = threshold
    blinkBurst.value = true // 触发一轮闪烁（通过 CSS 控制三次）
  } else {
    blinkBurst.value = false
  }
})

watch(activeIndex, (newIndex) => {
  // 只有第一名翻轉到財富徽章時才發射煙火
  const badge = allUserBadges.value[newIndex % allUserBadges.value.length]
  if (badge && badge.type === 'wealth' && badge.isFirst) {
    nextTick(() => {
      if (avatarContainerRef.value) {
        launchBadgeFireworks(avatarContainerRef.value)
      }
    })
  }
})

function openPermissionsDrawer() {
  const permissionsDrawer = usePermissionsDrawerStore()
  permissionsDrawer.open(props.projectId)
}

function handleCommand(command: string) {
  if (command === 'view-permissions') {
    // Use global permissions drawer store
    openPermissionsDrawer()
  } else {
    emit('user-command', command)
  }
}

// Click the countdown timer (only rendered in warning state) to manually
// renew the session. MainLayout enforces the once-per-token constraint.
function onSessionTimerClick() {
  emit('user-command', 'renew-session')
}

function generateDicebearUrl(seed: string, style: string, options: Record<string, string> = {}) {
  const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
  const params = new URLSearchParams({
    seed: seed,
    size: '40',
    ...options
  })
  return `${baseUrl}?${params.toString()}`
}

function generateInitialsAvatar() {
  const name = props.user?.displayName || 'U'
  const initials = name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()

  return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=40&backgroundColor=b6e3f4`
}

function generateInitials() {
  // SUDO 模式：使用被 sudo 的學生名稱
  const name = (sudoActive.value && sudoDisplayInfo.value?.name)
    ? sudoDisplayInfo.value.name
    : (props.user?.displayName || 'U')
  return name
    .split(' ')
    .map((word: string) => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

function handleAvatarError() {
  avatarError.value = true
}

function formatTime(milliseconds: number) {
  // 使用 dayjs 格式化時間為 HH:mm:ss
  const d = dayjs.duration(milliseconds)
  const hours = Math.floor(d.asHours())
  const minutes = d.minutes()
  const seconds = d.seconds()

  // 如果超過 24 小時，顯示天數
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  // 標準 HH:mm:ss 格式
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getRoleBadgeByName(roleName: string): UserBadge | null {
  const roleMap: Record<string, UserBadge> = {
    'admin': { type: 'admin', icon: 'fas fa-crown', color: '#FFD700', label: '專案管理員' },
    'teacher': { type: 'teacher', icon: 'fas fa-chalkboard-teacher', color: '#E6A23C', label: '專案教師' },
    'observer': { type: 'observer', icon: 'fas fa-eye', color: '#606266', label: '專案觀察者' },
    'group_leader': { type: 'group_leader', icon: 'fas fa-user-tie', color: '#67C23A', label: '組長' },
    'member_in_group': { type: 'member_in_group', icon: 'fas fa-baby', color: '#409EFF', label: '組員' },
    'member': { type: 'member', icon: 'fas fa-user', color: '#909399', label: '成員' }
  }
  return roleMap[roleName] || null
}

function getRoleBadgeByLevel(level: number): UserBadge | null {
  const levelMap: Record<number, UserBadge> = {
    0: { type: 'admin', icon: 'fas fa-crown', color: '#FFD700', label: '專案管理員' },
    1: { type: 'teacher', icon: 'fas fa-chalkboard-teacher', color: '#E6A23C', label: '專案教師' },
    2: { type: 'observer', icon: 'fas fa-eye', color: '#606266', label: '專案觀察者' },
    3: { type: 'member', icon: 'fas fa-baby', color: '#409EFF', label: '組員' }
  }
  return levelMap[level] || null
}

function startBadgeRotation() {
  if (allUserBadges.value.length <= 1) return // 只有一個徽章不需要翻轉

  flipTimer.value = setInterval(() => {
    isFlipping.value = true

    setTimeout(() => {
      activeIndex.value++
      isFlipping.value = false
    }, BADGE_FLIP_DURATION)

  }, BADGE_FLIP_INTERVAL)
}

function stopBadgeRotation() {
  if (flipTimer.value) {
    clearInterval(flipTimer.value)
    flipTimer.value = null
  }
}

function launchBadgeFireworks(avatarContainer: HTMLElement) {
  // 煙火在整個 avatar 區域爆炸
  const emojis = ['🎉', '✨', '🎊', '⭐', '💫', '🌟', '💰', '💵']

  const selectedEmojis = Array.from({ length: FIREWORK_COUNT }, () =>
    emojis[Math.floor(Math.random() * emojis.length)]
  )

  const rect = avatarContainer.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2

  selectedEmojis.forEach((emoji, i) => {
    // 計算飛散方向（360度均勻分布）
    const angle = (i / FIREWORK_COUNT) * 2 * Math.PI
    const distance = FIREWORK_BASE_DISTANCE + Math.random() * FIREWORK_RANDOM_DISTANCE

    // 創建 firework element
    const firework = document.createElement('div')
    firework.textContent = emoji
    firework.style.cssText = `
      position: absolute;
      left: ${centerX}px;
      top: ${centerY}px;
      font-size: 0px;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
    `

    avatarContainer.style.position = 'relative'
    avatarContainer.appendChild(firework)

    // Web Animations API 動畫
    firework.animate([
      {
        fontSize: '0px',
        opacity: 1,
        transform: `translate(-50%, -50%)`
      },
      {
        fontSize: '20px',
        opacity: 0.9,
        transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px))`
      },
      {
        fontSize: '14px',
        opacity: 0,
        transform: `translate(calc(-50% + ${Math.cos(angle) * distance * FIREWORK_FINAL_DISTANCE_MULTIPLIER}px), calc(-50% + ${Math.sin(angle) * distance * FIREWORK_FINAL_DISTANCE_MULTIPLIER}px))`
      }
    ], {
      duration: FIREWORK_DURATION,
      easing: 'ease-out'
    }).onfinish = () => firework.remove()
  })
}

onMounted(() => {
  startBadgeRotation()
  sudoStore.initFromStorage()
})

onBeforeUnmount(() => {
  stopBadgeRotation()
})
</script>

<style scoped>
.user-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-btn {
  background: linear-gradient(180deg, #1A9B8E 0%, #147A70 100%); /* 深土耳其藍漸層 - 與 Sidebar 風格一致 */
  border: none;
  color: white;
  padding: 8px 15px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.15s ease;
  min-height: 40px;
}

/* SUDO 模式：棕橙色漸層背景 - 與 Sidebar sudo-mode 一致 */
.user-btn.sudo-active {
  background: linear-gradient(180deg, #8B5A2B 0%, #5D3A1A 100%);
  box-shadow: 0 2px 8px rgba(139, 90, 43, 0.4);
}

.user-btn.sudo-active:hover {
  box-shadow: 0 4px 12px rgba(139, 90, 43, 0.5);
}

.user-avatar {
  position: relative;
  display: flex;
  align-items: center;
}

/* Avatar styling handled by el-avatar component */

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

.user-name {
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-btn:hover {
  opacity: 0.9;
  box-shadow: 0 4px 8px rgba(78, 205, 196, 0.4);
  transform: translateY(-1px);
}

/* User Info Header in Dropdown */
.dropdown-header {
  padding: 12px 16px;
  background-color: #f5f7fa;
  pointer-events: none;
}

.user-info-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.display-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.email-hint {
  font-size: 12px;
  color: #909399;
}

.session-timer {
  display: flex;
  align-items: center;
}

.session-timer-clickable {
  cursor: pointer;
}

.timer-circle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.timer-inner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timer-text {
  font-size: 10px;
  font-weight: bold;
  color: #2c3e50;
}

/* ✅ Session Timer Warning Animations */

/* 警告图标样式 */
.warning-icon {
  color: #e6a23c;
  font-size: 16px;
}

/* 警告状态 - 脉冲动画 */
.timer-circle.pulse-animation {
  animation: pulse-warning 2s ease-in-out infinite;
}

@keyframes pulse-warning {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.7);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(230, 162, 60, 0);
    transform: scale(1.05);
  }
}

/* 持续闪烁动画（<10%）*/
.warning-icon.blink-continuous {
  animation: blink-continuous 1.5s ease-in-out infinite;
}

@keyframes blink-continuous {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* 一轮闪烁动画（每降低 10% 触发）*/
.warning-icon.blink-burst {
  animation: blink-burst 1.5s ease-in-out;
}

@keyframes blink-burst {
  0%, 100% {
    opacity: 1;
  }
  16.6%, 50%, 83.3% {
    opacity: 0.3;
  }
  33.3%, 66.6% {
    opacity: 1;
  }
}

/* 警告状态的额外样式 */
.session-timer.session-warning {
  cursor: help;
}

/* ===== Responsive Design (RWD) ===== */

/* 中等螢幕：隱藏用戶名稱，只保留頭像 */
@media (max-width: 992px) {
  .user-name {
    display: none;
  }

  /* 調整按鈕間距，因為少了名稱 */
  .user-btn {
    gap: 8px;
  }
}

/* 小螢幕：縮小頭像、徽章和計時器 */
@media (max-width: 768px) {
  /* 縮小頭像 */
  .user-avatar :deep(.el-avatar) {
    width: 28px !important;
    height: 28px !important;
    font-size: 12px;
  }

  /* 縮小徽章 */
  .badge-flip-container {
    width: 16px;
    height: 16px;
    top: -3px;
    right: -6px;
  }

  .user-badge {
    width: 16px;
    height: 16px;
    font-size: 8px;
    border-width: 1.5px;
  }

  /* 縮小計時器 */
  .timer-circle {
    width: 40px;
    height: 40px;
  }

  .timer-inner {
    width: 32px;
    height: 32px;
  }

  .timer-text {
    font-size: 9px;
  }

  /* 減少按鈕內邊距 */
  .user-btn {
    padding: 6px 12px;
  }
}

/* 極小螢幕：隱藏計時器，進一步精簡 */
@media (max-width: 576px) {
  .session-timer {
    display: none;
  }

  .user-controls {
    gap: 10px;
  }

  .user-btn {
    padding: 5px 10px;
    min-height: 36px;
  }
}

</style>