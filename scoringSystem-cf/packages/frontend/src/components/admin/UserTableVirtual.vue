<template>
  <div class="user-table-virtual">
    <!-- Table Header -->
    <div class="table-header">
      <div class="header-cell checkbox-cell">
        <el-checkbox
          :model-value="isAllSelected"
          :indeterminate="isSomeSelected"
          @change="handleSelectAll"
        />
      </div>
      <div class="header-cell avatar-cell">頭像</div>
      <div class="header-cell email-cell">電子郵件</div>
      <div class="header-cell name-cell">顯示名稱</div>
      <div class="header-cell role-cell">角色</div>
      <div class="header-cell status-cell">狀態</div>
      <div class="header-cell lock-cell">鎖定狀態</div>
      <div class="header-cell actions-cell">操作</div>
    </div>

    <!-- Virtual Scrolling Container -->
    <div ref="scrollContainer" class="table-body" :style="{ height: containerHeight }">
      <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div
          v-for="virtualRow in virtualizer.getVirtualItems()"
          :key="`${virtualRow.index}-${users[virtualRow.index]?.userId || virtualRow.index}`"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`
          }"
        >
          <UserRow
            :user="users[virtualRow.index]"
            :is-selected="isUserSelected(users[virtualRow.index].userEmail)"
            :is-locked="isUserLocked(users[virtualRow.index])"
            :lock-status-text="getLockStatusText(users[virtualRow.index])"
            @toggle-selection="handleToggleSelection"
            @toggle-status="handleToggleStatus"
            @reset-password="handleResetPassword"
            @unlock-user="handleUnlockUser"
            @toggle-expansion="handleToggleExpansion(virtualRow.index)"
          />

          <!-- Expansion Panel for Activity Stats -->
          <div v-if="expandedRows.has(virtualRow.index)" class="expansion-panel">
            <UserActivityExpansion :user="users[virtualRow.index]" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { User } from '@repo/shared'
import { isUserLocked, getLockStatusText } from '@/utils/userStatus'
import UserRow from './UserRow.vue'
import UserActivityExpansion from './UserActivityExpansion.vue'

export interface Props {
  users: User[]
  selectedEmails: string[]
  containerHeight?: string
}

export interface Emits {
  (e: 'toggle-selection', userEmail: string): void
  (e: 'select-all'): void
  (e: 'toggle-status', user: User): void
  (e: 'reset-password', userEmail: string): void
  (e: 'unlock-user', userEmail: string): void
}

const props = withDefaults(defineProps<Props>(), {
  containerHeight: '600px'
})

const emit = defineEmits<Emits>()

// Virtual scrolling setup
const scrollContainer = ref<HTMLElement>()
const expandedRows = ref<Set<number>>(new Set())

// Calculate dynamic row height based on expansion
const getRowSize = (index: number) => {
  const baseHeight = 60 // Base row height
  const expansionHeight = 200 // Expansion panel height
  return expandedRows.value.has(index) ? baseHeight + expansionHeight : baseHeight
}

const virtualizer = useVirtualizer({
  count: computed(() => props.users.length) as unknown as number,
  getScrollElement: () => scrollContainer.value as Element | null,
  estimateSize: () => 60, // Estimated row height
  overscan: 5, // Render 5 extra rows above/below viewport
  measureElement:
    typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
      ? (element) => element?.getBoundingClientRect().height
      : undefined,
})

// Watch for expansion changes and invalidate measurements
watch(expandedRows, () => {
  virtualizer.value?.measure()
}, { deep: true })

// Selection helpers
const isAllSelected = computed(() => {
  return props.users.length > 0 &&
    props.users.every(user => props.selectedEmails.includes(user.userEmail))
})

const isSomeSelected = computed(() => {
  return props.selectedEmails.length > 0 && !isAllSelected.value
})

const isUserSelected = (userEmail: string): boolean => {
  return props.selectedEmails.includes(userEmail)
}

// Note: isUserLocked and getLockStatusText are imported from @/utils/userStatus

// Event handlers
const handleSelectAll = () => {
  emit('select-all')
}

const handleToggleSelection = (userEmail: string) => {
  emit('toggle-selection', userEmail)
}

const handleToggleStatus = (user: User) => {
  emit('toggle-status', user)
}

const handleResetPassword = (userEmail: string) => {
  emit('reset-password', userEmail)
}

const handleUnlockUser = (userEmail: string) => {
  emit('unlock-user', userEmail)
}

const handleToggleExpansion = (index: number) => {
  if (expandedRows.value.has(index)) {
    expandedRows.value.delete(index)
  } else {
    expandedRows.value.add(index)
  }
}
</script>

<style scoped>
.user-table-virtual {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.table-header {
  display: flex;
  align-items: center;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  padding: 12px 0;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-cell {
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

.table-body {
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.expansion-panel {
  padding: 16px;
  background-color: var(--el-fill-color-lighter);
  border-top: 1px solid var(--el-border-color);
}

/* Scrollbar styling */
.table-body::-webkit-scrollbar {
  width: 8px;
}

.table-body::-webkit-scrollbar-track {
  background: var(--el-fill-color-lighter);
}

.table-body::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 4px;
}

.table-body::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color-extra-dark);
}
</style>
