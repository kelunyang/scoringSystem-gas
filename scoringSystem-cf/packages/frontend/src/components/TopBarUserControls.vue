<template>
  <div class="user-controls">
    <!-- Element Plus Dropdown -->
    <el-dropdown
      v-if="user"
      trigger="click"
      @command="handleCommand"
      :hide-on-click="true"
    >
      <span class="user-btn" :class="{ 'sudo-active': sudoActive }">
        <!-- User Avatar -->
        <div class="user-avatar">
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
      <div class="session-timer" :class="{ 'session-warning': sessionPercentage < 50 }">
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

<script>
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

export default {
  name: 'TopBarUserControls',
  components: {
    NotificationCenter
  },
  props: {
    variant: {
      type: String,
      default: 'topbar',
      validator: (val) => ['topbar'].includes(val)
    },
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
    },
    userEmail: {
      type: String,
      default: ''
    },
    permissions: {
      type: Array,
      default: null
    },
    projectPermission: {
      type: String,
      default: null
    },
    availableRoles: {
      type: Array,
      default: () => []
    },
    currentRole: {
      type: String,
      default: null
    },
    projectId: {
      type: String,
      default: null
    },
    permissionLevel: {
      type: Number,
      default: null
    },
    wealthRankings: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      avatarError: false,
      activeIndex: 0,
      flipTimer: null,
      isFlipping: false,
      // Session timer animation state
      maxSessionTimeout: 86400000, // 24 hours in ms (从 KV 读取，默认值)
      lastBlinkThreshold: 100, // 用于追踪上一次触发闪烁的阈值
      // Sudo store instance
      sudoStore: null
    }
  },
  computed: {
    // Sudo mode computed properties
    sudoActive() {
      return this.sudoStore?.isActive || false
    },
    sudoDisplayInfo() {
      return this.sudoStore?.displayInfo || null
    },
    displayUserEmail() {
      return this.userEmail || this.user?.userEmail || ''
    },
    avatarUrl() {
      if (this.avatarError || !this.user) {
        // Fallback to initials avatar
        return this.generateInitialsAvatar()
      }

      // SUDO 模式：使用被 sudo 的學生頭像
      if (this.sudoActive && this.sudoDisplayInfo) {
        const seed = this.sudoDisplayInfo.avatarSeed || `${this.sudoDisplayInfo.email}_sudo`
        const style = this.sudoDisplayInfo.avatarStyle || 'avataaars'
        return this.generateDicebearUrl(seed, style, {})
      }

      // 正常模式：使用自己的頭像
      const seed = this.user.avatarSeed || `${this.user.userEmail}_${Date.now()}`
      const style = this.user.avatarStyle || 'avataaars'

      // Parse avatarOptions if it's a string
      let options = {}
      if (this.user.avatarOptions) {
        if (typeof this.user.avatarOptions === 'string') {
          try {
            options = JSON.parse(this.user.avatarOptions)
          } catch (e) {
            console.warn('Failed to parse avatarOptions:', this.user.avatarOptions)
            options = {}
          }
        } else {
          options = this.user.avatarOptions
        }
      }

      return this.generateDicebearUrl(seed, style, options)
    },
    displayName() {
      // SUDO 模式：顯示被 sudo 的學生名稱
      if (this.sudoActive && this.sudoDisplayInfo?.name) {
        return this.sudoDisplayInfo.name
      }
      // 正常模式：顯示自己的名稱
      return this.user?.displayName || ''
    },
    globalPermissionBadge() {
      const permissions = this.user?.permissions || []

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
    },
    projectRoleBadge() {
      // 優先使用 currentRole（ProjectDetail 傳入，支援角色切換）
      if (this.currentRole) {
        return this.getRoleBadgeByName(this.currentRole)
      }

      // 其次使用 permissionLevel（WalletNew 傳入，僅最高權限）
      if (this.permissionLevel !== null && this.permissionLevel !== undefined) {
        return this.getRoleBadgeByLevel(this.permissionLevel)
      }

      return null
    },
    userWealthRank() {
      if (!this.wealthRankings || this.wealthRankings.length === 0) return null
      const userEmail = this.user?.userEmail
      if (!userEmail) return null
      return this.wealthRankings.find(r => r.userEmail === userEmail) || null
    },
    allUserBadges() {
      const badges = []

      // 0. SUDO 模式徽章（最高優先級，永遠顯示在最前面）
      if (this.sudoActive) {
        badges.push({
          type: 'sudo',
          icon: 'fas fa-user-secret',
          color: '#e6a23c',
          label: `正在以 ${this.sudoDisplayInfo?.name || '學生'} 的身份檢視（唯讀模式）`
        })
      }

      // 1. 全域權限徽章
      if (this.globalPermissionBadge) badges.push(this.globalPermissionBadge)

      // 2. 專案角色徽章
      if (this.projectRoleBadge) badges.push(this.projectRoleBadge)

      // 3. 財富徽章（前 3% 富豪）
      if (this.userWealthRank) {
        badges.push({
          type: 'wealth',
          icon: 'fas fa-medal',
          color: '#FFD700',
          label: '專案富豪',
          rank: this.userWealthRank.rank,
          isFirst: this.userWealthRank.rank === 1  // 只有第一名有呼吸光暈
        })
      }

      return badges
    },
    currentBadge() {
      if (this.allUserBadges.length === 0) return null
      return this.allUserBadges[this.activeIndex % this.allUserBadges.length]
    },
    nextBadge() {
      if (this.allUserBadges.length <= 1) return null
      const nextIndex = (this.activeIndex + 1) % this.allUserBadges.length
      return this.allUserBadges[nextIndex]
    },
    badgeTooltipText() {
      const messages = []

      // SUDO 模式徽章提示（最高優先級）
      if (this.sudoActive) {
        messages.push(`正在以 ${this.sudoDisplayInfo?.name || '學生'} 的身份檢視（唯讀模式）`)
      }

      if (this.globalPermissionBadge) {
        messages.push(`你的全站權限為${this.globalPermissionBadge.label}`)
      }

      if (this.projectRoleBadge) {
        messages.push(`專案權限為${this.projectRoleBadge.label}`)
      }

      if (this.userWealthRank) {
        messages.push(`你是第 ${this.userWealthRank.rank} 名`)
      }

      return messages.join('，')
    },
    userBadges() {
      // 保留舊的計算屬性以相容性，但現在只返回當前顯示的徽章
      return this.currentBadge ? [this.currentBadge] : []
    },

    // ✅ Session Timer UI computed properties

    /**
     * Tooltip 内容
     */
    sessionWarningTooltip() {
      const halfTime = this.maxSessionTimeout / 2
      const halfTimeMinutes = Math.floor(halfTime / 60000)
      return `登入有效期低於 ${halfTimeMinutes} 分鐘，請操作網站，會自動延長有效期`
    },

    /**
     * Timer 圆环渐变颜色 (Scheme M - Bubblegum Bright)
     * >70% - 土耳其藍 (#1A9B8E)
     * 50-70% - 珊瑚橙淺 (#FFA07A)
     * 30-50% - 珊瑚橙深 (#FF6347)
     * <30% - 熱粉紅 (#E91E63)
     */
    timerGradient() {
      const percentage = this.sessionPercentage
      let color = '#1A9B8E' // 默认土耳其藍 (Scheme M Success)

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
    },

    /**
     * 闪烁动画 class
     * 逻辑：
     * - 50% 以下才显示警告图标
     * - 每降低 10% 触发一轮闪烁（三次）
     * - 低于 10% 时持续闪烁
     */
    blinkAnimationClass() {
      const percentage = this.sessionPercentage

      // <10% 时持续闪烁
      if (percentage < 10) {
        return 'blink-continuous'
      }

      // 计算当前所在的 10% 区间
      const threshold = Math.floor(percentage / 10) * 10

      // 当穿越新的 10% 阈值时，触发一轮闪烁
      // 例如：从 45% → 39% 时，threshold 从 40 变为 30
      if (threshold < this.lastBlinkThreshold && percentage >= 10) {
        // 触发一轮闪烁（通过 CSS 控制三次）
        this.lastBlinkThreshold = threshold
        return 'blink-burst'
      }

      // 默认不闪烁
      return ''
    }
  },
  emits: ['user-command'],
  watch: {
    activeIndex(newIndex) {
      // 只有第一名翻轉到財富徽章時才發射煙火
      const currentBadge = this.allUserBadges[newIndex % this.allUserBadges.length]
      if (currentBadge && currentBadge.type === 'wealth' && currentBadge.isFirst) {
        this.$nextTick(() => {
          const avatarContainer = this.$el.querySelector('.user-avatar')
          if (avatarContainer) {
            this.launchBadgeFireworks(avatarContainer)
          }
        })
      }
    }
  },
  mounted() {
    this.startBadgeRotation()
    // Initialize sudo store
    this.sudoStore = useSudoStore()
    this.sudoStore.initFromStorage()
  },
  beforeUnmount() {
    this.stopBadgeRotation()
  },
  methods: {
    openPermissionsDrawer() {
      const permissionsDrawer = usePermissionsDrawerStore()
      permissionsDrawer.open(this.projectId)
    },
    handleCommand(command) {
      if (command === 'view-permissions') {
        // Use global permissions drawer store
        this.openPermissionsDrawer()
      } else {
        this.$emit('user-command', command)
      }
    },

    formatTime(milliseconds) {
      const minutes = Math.floor(milliseconds / 60000)
      const seconds = Math.floor((milliseconds % 60000) / 1000)
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    },
    
    generateDicebearUrl(seed, style, options = {}) {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '40',
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    },
    
    generateInitialsAvatar() {
      const name = this.user?.displayName || 'U'
      const initials = name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
      
      return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=40&backgroundColor=b6e3f4`
    },
    
    generateInitials() {
      // SUDO 模式：使用被 sudo 的學生名稱
      const name = (this.sudoActive && this.sudoDisplayInfo?.name)
        ? this.sudoDisplayInfo.name
        : (this.user?.displayName || 'U')
      return name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
    },
    
    handleAvatarError() {
      this.avatarError = true
    },
    
    formatTime(milliseconds) {
      // 使用 dayjs 格式化時間為 HH:mm:ss
      const duration = dayjs.duration(milliseconds)
      const hours = Math.floor(duration.asHours())
      const minutes = duration.minutes()
      const seconds = duration.seconds()

      // 如果超過 24 小時，顯示天數
      if (hours >= 24) {
        const days = Math.floor(hours / 24)
        const remainingHours = hours % 24
        return `${days}d ${remainingHours}h`
      }

      // 標準 HH:mm:ss 格式
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    },

    getRoleBadgeByName(roleName) {
      const roleMap = {
        'admin': { type: 'admin', icon: 'fas fa-crown', color: '#FFD700', label: '專案管理員' },
        'teacher': { type: 'teacher', icon: 'fas fa-chalkboard-teacher', color: '#E6A23C', label: '專案教師' },
        'observer': { type: 'observer', icon: 'fas fa-eye', color: '#606266', label: '專案觀察者' },
        'group_leader': { type: 'group_leader', icon: 'fas fa-user-tie', color: '#67C23A', label: '組長' },
        'member_in_group': { type: 'member_in_group', icon: 'fas fa-baby', color: '#409EFF', label: '組員' },
        'member': { type: 'member', icon: 'fas fa-user', color: '#909399', label: '成員' }
      }
      return roleMap[roleName] || null
    },

    getRoleBadgeByLevel(level) {
      const levelMap = {
        0: { type: 'admin', icon: 'fas fa-crown', color: '#FFD700', label: '專案管理員' },
        1: { type: 'teacher', icon: 'fas fa-chalkboard-teacher', color: '#E6A23C', label: '專案教師' },
        2: { type: 'observer', icon: 'fas fa-eye', color: '#606266', label: '專案觀察者' },
        3: { type: 'member', icon: 'fas fa-baby', color: '#409EFF', label: '組員' }
      }
      return levelMap[level] || null
    },

    startBadgeRotation() {
      if (this.allUserBadges.length <= 1) return // 只有一個徽章不需要翻轉

      this.flipTimer = setInterval(() => {
        this.isFlipping = true

        setTimeout(() => {
          this.activeIndex++
          this.isFlipping = false
        }, BADGE_FLIP_DURATION)

      }, BADGE_FLIP_INTERVAL)
    },

    stopBadgeRotation() {
      if (this.flipTimer) {
        clearInterval(this.flipTimer)
        this.flipTimer = null
      }
    },

    launchBadgeFireworks(avatarContainer) {
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
        const endX = centerX + Math.cos(angle) * distance
        const endY = centerY + Math.sin(angle) * distance

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
  }
}
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