<template>
  <div class="user-row" :class="{ 'is-selected': isSelected, 'is-locked': isLocked }">
    <!-- Checkbox -->
    <div class="row-cell checkbox-cell">
      <el-checkbox
        :model-value="isSelected"
        @change="handleToggleSelection"
      />
    </div>

    <!-- Avatar -->
    <div class="row-cell avatar-cell">
      <el-avatar
        :size="40"
        :src="avatarUrl"
        @error="handleAvatarError"
      >
        <span>{{ userInitials }}</span>
      </el-avatar>
    </div>

    <!-- Email -->
    <div class="row-cell email-cell">
      <div class="user-email">
        <span>{{ user.userEmail }}</span>
        <el-tag v-if="user.emailVerified" type="success" size="small" class="verified-tag">
          已驗證
        </el-tag>
      </div>
    </div>

    <!-- Display Name -->
    <div class="row-cell name-cell">
      <span>{{ user.displayName || '-' }}</span>
    </div>

    <!-- Role -->
    <div class="row-cell role-cell">
      <el-tag :type="getRoleTagType(user.role || 'user')" size="small">
        {{ getRoleText(user.role || 'user') }}
      </el-tag>
    </div>

    <!-- Status -->
    <div class="row-cell status-cell">
      <el-switch
        :model-value="user.status === 'active'"
        :disabled="isLocked"
        inline-prompt
        active-text="啟用"
        inactive-text="停用"
        @change="handleToggleStatus"
      />
    </div>

    <!-- Lock Status -->
    <div class="row-cell lock-cell">
      <el-tag v-if="lockStatusText" type="danger" size="small">
        {{ lockStatusText }}
      </el-tag>
      <span v-else class="text-muted">-</span>
    </div>

    <!-- Actions -->
    <div class="row-cell actions-cell">
      <el-button-group>
        <el-tooltip content="重設密碼" placement="top">
          <el-button
            size="small"
            :icon="Lock"
            @click="handleResetPassword"
          />
        </el-tooltip>

        <el-tooltip v-if="isLocked" content="解鎖用戶" placement="top">
          <el-button
            size="small"
            type="warning"
            :icon="Unlock"
            @click="handleUnlockUser"
          />
        </el-tooltip>

        <el-tooltip content="查看活動" placement="top">
          <el-button
            size="small"
            :icon="View"
            @click="handleToggleExpansion"
          />
        </el-tooltip>
      </el-button-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Lock, Unlock, View } from '@element-plus/icons-vue'
import type { User } from '@repo/shared'
import { getAvatarUrl, generateInitialsAvatar } from '@/utils/avatar'

export interface Props {
  user: User
  isSelected: boolean
  isLocked: boolean
  lockStatusText: string
}

export interface Emits {
  (e: 'toggle-selection', userEmail: string): void
  (e: 'toggle-status', user: User): void
  (e: 'reset-password', userEmail: string): void
  (e: 'unlock-user', userEmail: string): void
  (e: 'toggle-expansion'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Avatar handling
const avatarError = ref(false)
const avatarUrl = computed(() => {
  return getAvatarUrl(props.user, {}, avatarError.value)
})

const userInitials = computed(() => {
  const name = props.user.displayName || props.user.userEmail || 'U'
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const handleAvatarError = (_evt?: Event): boolean => {
  avatarError.value = true
  return true
}

// Role formatting
const getRoleText = (role: string): string => {
  const roleMap: Record<string, string> = {
    'admin': '管理員',
    'user': '一般用戶',
    'pm': '專案經理',
    'reviewer': '評審委員'
  }
  return roleMap[role] || role
}

const getRoleTagType = (role: string): 'success' | 'warning' | 'info' | 'danger' => {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    'admin': 'danger',
    'pm': 'warning',
    'reviewer': 'success',
    'user': 'info'
  }
  return typeMap[role] || 'info'
}

// Event handlers
const handleToggleSelection = (_value?: boolean | string | number) => {
  emit('toggle-selection', props.user.userEmail)
}

const handleToggleStatus = (_value?: string | number | boolean) => {
  emit('toggle-status', props.user)
}

const handleResetPassword = () => {
  emit('reset-password', props.user.userEmail)
}

const handleUnlockUser = () => {
  emit('unlock-user', props.user.userEmail)
}

const handleToggleExpansion = () => {
  emit('toggle-expansion')
}
</script>

<style scoped>
.user-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background-color 0.2s;
}

.user-row:hover {
  background-color: var(--el-fill-color-light);
}

.user-row.is-selected {
  background-color: var(--el-color-primary-light-9);
}

.user-row.is-locked {
  opacity: 0.7;
}

.row-cell {
  padding: 0 12px;
  display: flex;
  align-items: center;
}

.checkbox-cell {
  width: 50px;
  flex-shrink: 0;
}

.avatar-cell {
  width: 80px;
  flex-shrink: 0;
}

.email-cell {
  flex: 2;
  min-width: 200px;
}

.name-cell {
  flex: 1.5;
  min-width: 150px;
}

.role-cell {
  flex: 1;
  min-width: 120px;
}

.status-cell {
  width: 100px;
  flex-shrink: 0;
}

.lock-cell {
  flex: 1.2;
  min-width: 150px;
}

.actions-cell {
  width: 180px;
  flex-shrink: 0;
}

.user-email {
  display: flex;
  align-items: center;
  gap: 8px;
}

.verified-tag {
  margin-left: 4px;
}

.text-muted {
  color: var(--el-text-color-secondary);
}
</style>
