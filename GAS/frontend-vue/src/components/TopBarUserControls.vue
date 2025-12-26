<template>
  <div class="user-controls">
    <!-- Custom Dropdown -->
    <div v-if="user" class="user-dropdown" @click="toggleDropdown" v-click-outside="closeDropdown">
      <span class="user-btn">
        <!-- User Avatar -->
        <div class="user-avatar">
          <el-avatar 
            :src="avatarUrl" 
            :alt="`${user.displayName || user.username}的頭像`"
            shape="square"
            :size="32"
            @error="handleAvatarError"
          >
            {{ generateInitials() }}
          </el-avatar>
          <!-- User Badges -->
          <div v-if="user.badges && user.badges.length > 0" class="badge-container">
            <div 
              v-for="badge in user.badges" 
              :key="badge.type"
              class="user-badge"
              :style="{ backgroundColor: badge.color }"
              :title="badge.label"
            >
              <i :class="badge.icon"></i>
            </div>
          </div>
        </div>
        
        <span class="user-name">{{ user.displayName || user.username }}</span>
        <i class="fas fa-chevron-down" :class="{ rotated: dropdownOpen }"></i>
      </span>
      
      <!-- Dropdown Menu -->
      <div v-if="dropdownOpen" class="dropdown-menu">
        <div class="dropdown-item" @click="handleCommand('settings')">
          <i class="fas fa-cog"></i>
          使用者設定
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-item" @click="handleCommand('logout')">
          <i class="fas fa-sign-out-alt"></i>
          登出
        </div>
      </div>
    </div>

    <!-- Notification Center -->
    <NotificationCenter />
    
    <!-- Session Timer -->
    <div class="session-timer">
      <div class="timer-circle" :style="{ background: `conic-gradient(${sessionPercentage > 20 ? '#67c23a' : '#f56c6c'} ${sessionPercentage * 3.6}deg, #e4e7ed 0deg)` }">
        <div class="timer-inner">
          <span class="timer-text">{{ formatTime(remainingTime) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import NotificationCenter from './NotificationCenter.vue'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

export default {
  name: 'TopBarUserControls',
  components: {
    NotificationCenter
  },
  props: {
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
  },
  data() {
    return {
      dropdownOpen: false,
      avatarError: false
    }
  },
  computed: {
    avatarUrl() {
      if (this.avatarError || !this.user) {
        // Fallback to initials avatar
        return this.generateInitialsAvatar()
      }
      
      const seed = this.user.avatarSeed || `${this.user.userEmail}_${Date.now()}`
      const style = this.user.avatarStyle || 'avataaars'
      const options = this.user.avatarOptions || {}
      
      return this.generateDicebearUrl(seed, style, options)
    }
  },
  emits: ['user-command'],
  methods: {
    toggleDropdown() {
      this.dropdownOpen = !this.dropdownOpen
    },
    
    closeDropdown() {
      this.dropdownOpen = false
    },
    
    handleCommand(command) {
      this.dropdownOpen = false
      this.$emit('user-command', command)
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
      const name = this.user?.displayName || this.user?.username || 'U'
      const initials = name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
      
      return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=40&backgroundColor=b6e3f4`
    },
    
    generateInitials() {
      const name = this.user?.displayName || this.user?.username || 'U'
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
    }
  },
  directives: {
    'click-outside': {
      beforeMount(el, binding) {
        el.clickOutsideEvent = function(event) {
          if (!(el === event.target || el.contains(event.target))) {
            binding.value()
          }
        }
        document.addEventListener('click', el.clickOutsideEvent)
      },
      unmounted(el) {
        document.removeEventListener('click', el.clickOutsideEvent)
      }
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

.user-dropdown {
  position: relative;
}

.user-btn {
  background: #67c23a;
  color: white;
  padding: 8px 15px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s;
  min-height: 40px;
}

.user-avatar {
  position: relative;
  display: flex;
  align-items: center;
}

/* Avatar styling handled by el-avatar component */

.badge-container {
  position: absolute;
  top: -4px;
  right: -8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-badge {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid white;
  font-size: 8px;
  color: white;
}

.user-name {
  font-weight: 500;
}

.user-btn:hover {
  background: #5daf34;
}

.user-btn i.rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 5px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e4e7ed;
  min-width: 160px;
  z-index: 1000;
}

.dropdown-item {
  padding: 10px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  transition: background-color 0.2s;
}

.dropdown-item:hover {
  background-color: #f5f7fa;
}

.dropdown-item:first-child {
  border-radius: 8px 8px 0 0;
}

.dropdown-item:last-child {
  border-radius: 0 0 8px 8px;
}

.dropdown-divider {
  height: 1px;
  background: #e4e7ed;
  margin: 5px 0;
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
</style>