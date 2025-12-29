<template>
  <div class="user-activity-expansion">
    <el-row :gutter="20">
      <!-- Basic Info -->
      <el-col :span="8">
        <div class="info-section">
          <h4>基本資訊</h4>
          <div class="info-item">
            <span class="label">用戶 ID:</span>
            <span class="value">{{ user.userId }}</span>
          </div>
          <div class="info-item">
            <span class="label">註冊時間:</span>
            <span class="value">{{ formatTime(user.registrationTime) }}</span>
          </div>
          <div class="info-item">
            <span class="label">最後活動:</span>
            <span class="value">{{ formatTime(user.lastActivityTime) }}</span>
          </div>
          <div class="info-item">
            <span class="label">錢包餘額:</span>
            <span class="value balance">{{ formatBalance(extendedUser.walletBalance) }} 點</span>
          </div>
        </div>
      </el-col>

      <!-- Security Info -->
      <el-col :span="8">
        <div class="info-section">
          <h4>安全資訊</h4>
          <div class="info-item">
            <span class="label">登入失敗次數:</span>
            <span class="value" :class="{ 'warning-text': (extendedUser.failedLoginAttempts || 0) > 0 }">
              {{ extendedUser.failedLoginAttempts || 0 }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">惡意登入檢測:</span>
            <el-tag :type="extendedUser.maliciousLoginDetected ? 'danger' : 'success'" size="small">
              {{ extendedUser.maliciousLoginDetected ? '偵測到' : '正常' }}
            </el-tag>
          </div>
          <div class="info-item">
            <span class="label">2FA 狀態:</span>
            <el-tag :type="extendedUser.twoFactorEnabled ? 'success' : 'info'" size="small">
              {{ extendedUser.twoFactorEnabled ? '已啟用' : '未啟用' }}
            </el-tag>
          </div>
          <div v-if="user.lockUntil && user.lockUntil > Date.now()" class="info-item">
            <span class="label">鎖定剩餘時間:</span>
            <span class="value danger-text">{{ getRemainingLockTime() }}</span>
          </div>
        </div>
      </el-col>

      <!-- Avatar Info -->
      <el-col :span="8">
        <div class="info-section">
          <h4>頭像設定</h4>
          <div class="info-item">
            <span class="label">頭像風格:</span>
            <span class="value">{{ user.avatarStyle || 'avataaars' }}</span>
          </div>
          <div class="info-item">
            <span class="label">頭像種子:</span>
            <span class="value code">{{ user.avatarSeed || '-' }}</span>
          </div>
          <div v-if="user.avatarOptions" class="info-item">
            <span class="label">頭像選項:</span>
            <el-tooltip :content="formatAvatarOptions()" placement="top">
              <span class="value code truncate" v-text="formatAvatarOptions()"></span>
            </el-tooltip>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Activity Timeline (if available) -->
    <div v-if="showTimeline" class="timeline-section">
      <h4>最近活動</h4>
      <el-timeline>
        <el-timeline-item
          v-for="(activity, index) in recentActivities"
          :key="index"
          :timestamp="formatTime(activity.timestamp)"
          placement="top"
        >
          <span>{{ activity.description }}</span>
        </el-timeline-item>
      </el-timeline>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { User } from '@repo/shared'
import { parseAvatarOptions } from '@/utils/avatar'

// Extended User type for admin display with additional properties
export interface ExtendedUser extends User {
  walletBalance?: number
  failedLoginAttempts?: number
  maliciousLoginDetected?: boolean
  twoFactorEnabled?: boolean
}

export interface Props {
  user: User
  showTimeline?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showTimeline: false
})

// Cast to ExtendedUser for accessing additional properties
const extendedUser = computed(() => props.user as ExtendedUser)

// Time formatting
const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Balance formatting
const formatBalance = (balance: number | undefined): string => {
  if (balance === undefined || balance === null) return '0'
  return balance.toLocaleString('zh-TW')
}

// Avatar options formatting
const formatAvatarOptions = (): string => {
  if (!props.user.avatarOptions) return '-'
  const options = parseAvatarOptions(props.user.avatarOptions)
  return JSON.stringify(options, null, 2)
}

// Lock time calculation
const getRemainingLockTime = (): string => {
  if (!props.user.lockUntil) return '-'
  const remaining = props.user.lockUntil - Date.now()
  if (remaining <= 0) return '已解鎖'

  const minutes = Math.floor(remaining / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} 天 ${hours % 24} 小時`
  if (hours > 0) return `${hours} 小時 ${minutes % 60} 分鐘`
  return `${minutes} 分鐘`
}

// Recent activities (placeholder - would come from API in real implementation)
const recentActivities = computed(() => {
  const activities = []

  if (props.user.lastActivityTime) {
    activities.push({
      timestamp: props.user.lastActivityTime,
      description: '最後活動時間'
    })
  }

  if (props.user.registrationTime) {
    activities.push({
      timestamp: props.user.registrationTime,
      description: '用戶註冊'
    })
  }

  return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
})
</script>

<style scoped>
.user-activity-expansion {
  padding: 16px;
  background-color: var(--el-fill-color-blank);
  border-radius: 4px;
}

.info-section {
  margin-bottom: 16px;
}

.info-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}

.info-item .label {
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.info-item .value {
  color: var(--el-text-color-primary);
  font-weight: 400;
}

.info-item .value.code {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  background-color: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 3px;
}

.info-item .value.truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-item .value.balance {
  color: var(--el-color-success);
  font-weight: 600;
}

.warning-text {
  color: var(--el-color-warning);
  font-weight: 600;
}

.danger-text {
  color: var(--el-color-danger);
  font-weight: 600;
}

.timeline-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.timeline-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
