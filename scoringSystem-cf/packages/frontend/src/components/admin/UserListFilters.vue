<template>
  <div class="user-list-filters">
    <el-row :gutter="16" align="middle">
      <!-- Search Input -->
      <el-col :span="10">
        <el-input
          v-model="localSearchText"
          placeholder="搜尋用戶名稱或電子郵件..."
          :prefix-icon="Search"
          clearable
          @input="handleSearchChange"
        />
      </el-col>

      <!-- Status Filter -->
      <el-col :span="6">
        <el-select
          v-model="localStatusFilter"
          placeholder="篩選狀態"
          clearable
          @change="handleStatusChange"
        >
          <el-option label="全部狀態" value="" />
          <el-option label="啟用" value="active">
            <el-tag type="success" size="small">啟用</el-tag>
          </el-option>
          <el-option label="停用" value="inactive">
            <el-tag type="danger" size="small">停用</el-tag>
          </el-option>
        </el-select>
      </el-col>

      <!-- Role Filter -->
      <el-col :span="6">
        <el-select
          v-model="localRoleFilter"
          placeholder="篩選角色"
          clearable
          @change="handleRoleChange"
        >
          <el-option label="全部角色" value="" />
          <el-option label="管理員" value="admin">
            <el-tag type="danger" size="small">管理員</el-tag>
          </el-option>
          <el-option label="專案經理" value="pm">
            <el-tag type="warning" size="small">專案經理</el-tag>
          </el-option>
          <el-option label="評審委員" value="reviewer">
            <el-tag type="success" size="small">評審委員</el-tag>
          </el-option>
          <el-option label="一般用戶" value="user">
            <el-tag type="info" size="small">一般用戶</el-tag>
          </el-option>
        </el-select>
      </el-col>

      <!-- Advanced Filters Toggle -->
      <el-col :span="2">
        <el-button
          :icon="Filter"
          circle
          @click="showAdvancedFilters = !showAdvancedFilters"
        />
      </el-col>
    </el-row>

    <!-- Advanced Filters Panel -->
    <el-collapse-transition>
      <div v-if="showAdvancedFilters" class="advanced-filters">
        <el-row :gutter="16" style="margin-top: 16px;">
          <!-- Lock Status Filter -->
          <el-col :span="6">
            <el-select
              v-model="localLockFilter"
              placeholder="鎖定狀態"
              clearable
              @change="handleLockChange"
            >
              <el-option label="全部" value="" />
              <el-option label="已鎖定" value="locked" />
              <el-option label="未鎖定" value="unlocked" />
            </el-select>
          </el-col>

          <!-- 2FA Filter -->
          <el-col :span="6">
            <el-select
              v-model="localTwoFactorFilter"
              placeholder="2FA 狀態"
              clearable
              @change="handleTwoFactorChange"
            >
              <el-option label="全部" value="" />
              <el-option label="已啟用" value="enabled" />
              <el-option label="未啟用" value="disabled" />
            </el-select>
          </el-col>

          <!-- Email Verified Filter -->
          <el-col :span="6">
            <el-select
              v-model="localEmailVerifiedFilter"
              placeholder="郵件驗證"
              clearable
              @change="handleEmailVerifiedChange"
            >
              <el-option label="全部" value="" />
              <el-option label="已驗證" value="verified" />
              <el-option label="未驗證" value="unverified" />
            </el-select>
          </el-col>

          <!-- Date Range Picker -->
          <el-col :span="6">
            <el-date-picker
              v-model="localDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="註冊開始日期"
              end-placeholder="註冊結束日期"
              size="default"
              @change="handleDateRangeChange"
            />
          </el-col>
        </el-row>

        <!-- Clear All Filters -->
        <el-row style="margin-top: 12px;">
          <el-col :span="24" style="text-align: right;">
            <el-button type="warning" size="small" @click="handleClearAll">
              <i class="fas fa-filter-circle-xmark"></i> 清除所有篩選
            </el-button>
          </el-col>
        </el-row>
      </div>
    </el-collapse-transition>

    <!-- Active Filters Summary -->
    <div v-if="hasActiveFilters" class="active-filters-summary">
      <span class="summary-label">已套用篩選:</span>
      <el-tag
        v-if="localSearchText"
        closable
        @close="localSearchText = ''; handleSearchChange()"
      >
        搜尋: {{ localSearchText }}
      </el-tag>
      <el-tag
        v-if="localStatusFilter"
        closable
        @close="localStatusFilter = ''; handleStatusChange()"
      >
        狀態: {{ getStatusLabel(localStatusFilter) }}
      </el-tag>
      <el-tag
        v-if="localRoleFilter"
        closable
        @close="localRoleFilter = ''; handleRoleChange()"
      >
        角色: {{ getRoleLabel(localRoleFilter) }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Search, Filter } from '@element-plus/icons-vue'

interface FilterState {
  searchText: string
  statusFilter: '' | 'active' | 'inactive'
  roleFilter: '' | 'admin' | 'pm' | 'reviewer' | 'user'
  lockFilter: '' | 'locked' | 'unlocked'
  twoFactorFilter: '' | 'enabled' | 'disabled'
  emailVerifiedFilter: '' | 'verified' | 'unverified'
  dateRange: [Date, Date] | null
}

export interface Props {
  searchText?: string
  statusFilter?: '' | 'active' | 'inactive'
  roleFilter?: '' | 'admin' | 'pm' | 'reviewer' | 'user'
}

export interface Emits {
  (e: 'update:searchText', value: string): void
  (e: 'update:statusFilter', value: '' | 'active' | 'inactive'): void
  (e: 'update:roleFilter', value: '' | 'admin' | 'pm' | 'reviewer' | 'user'): void
  (e: 'update:lockFilter', value: '' | 'locked' | 'unlocked'): void
  (e: 'update:twoFactorFilter', value: '' | 'enabled' | 'disabled'): void
  (e: 'update:emailVerifiedFilter', value: '' | 'verified' | 'unverified'): void
  (e: 'update:dateRange', value: [Date, Date] | null): void
  (e: 'clear-all'): void
}

const props = withDefaults(defineProps<Props>(), {
  searchText: '',
  statusFilter: '',
  roleFilter: ''
})

const emit = defineEmits<Emits>()

// Local state
const localSearchText = ref(props.searchText)
const localStatusFilter = ref(props.statusFilter)
const localRoleFilter = ref(props.roleFilter)
const localLockFilter = ref<'' | 'locked' | 'unlocked'>('')
const localTwoFactorFilter = ref<'' | 'enabled' | 'disabled'>('')
const localEmailVerifiedFilter = ref<'' | 'verified' | 'unverified'>('')
const localDateRange = ref<[Date, Date] | null>(null)
const showAdvancedFilters = ref(false)

// Computed
const hasActiveFilters = computed(() => {
  return !!(
    localSearchText.value ||
    localStatusFilter.value ||
    localRoleFilter.value ||
    localLockFilter.value ||
    localTwoFactorFilter.value ||
    localEmailVerifiedFilter.value ||
    localDateRange.value
  )
})

// Event handlers - Debounce search for better performance
const handleSearchChange = useDebounceFn(() => {
  emit('update:searchText', localSearchText.value)
}, 300)

const handleStatusChange = () => {
  emit('update:statusFilter', localStatusFilter.value)
}

const handleRoleChange = () => {
  emit('update:roleFilter', localRoleFilter.value)
}

const handleLockChange = () => {
  emit('update:lockFilter', localLockFilter.value)
}

const handleTwoFactorChange = () => {
  emit('update:twoFactorFilter', localTwoFactorFilter.value)
}

const handleEmailVerifiedChange = () => {
  emit('update:emailVerifiedFilter', localEmailVerifiedFilter.value)
}

const handleDateRangeChange = () => {
  emit('update:dateRange', localDateRange.value)
}

const handleClearAll = () => {
  localSearchText.value = ''
  localStatusFilter.value = ''
  localRoleFilter.value = ''
  localLockFilter.value = ''
  localTwoFactorFilter.value = ''
  localEmailVerifiedFilter.value = ''
  localDateRange.value = null
  emit('clear-all')
}

// Helper functions
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'active': '啟用',
    'inactive': '停用'
  }
  return labels[status] || status
}

const getRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    'admin': '管理員',
    'pm': '專案經理',
    'reviewer': '評審委員',
    'user': '一般用戶'
  }
  return labels[role] || role
}
</script>

<style scoped>
.user-list-filters {
  padding: 16px;
  background-color: var(--el-fill-color-blank);
  border-radius: 4px;
  margin-bottom: 16px;
}

.advanced-filters {
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.active-filters-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.summary-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.active-filters-summary .el-tag {
  margin-right: 4px;
}
</style>
