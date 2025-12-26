<template>
  <AdminFilterToolbar
    variant="default"
    :collapsible="true"
    :activeFilterCount="activeFilterCount"
    :expandedFilterCount="expandedFilterCount"
    :showExport="false"
    @reset-filters="handleClearFilters"
  >
    <!-- Banner: View Mode Badge -->
    <template #banner>
      <div class="view-mode-indicator">
        <span v-if="canViewAllUsers && !selectedUserEmail" class="view-mode-badge">
          <i class="fas fa-users"></i>
          檢視：所有使用者
        </span>
        <span v-else-if="selectedUserEmail && canViewAllUsers" class="view-mode-badge view-mode-single">
          <i class="fas fa-user"></i>
          檢視：{{ projectUsers.find(u => u.userEmail === selectedUserEmail)?.displayName || selectedUserEmail }}
        </span>
        <span v-else-if="!canViewAllUsers" class="view-mode-badge view-mode-single">
          <i class="fas fa-user"></i>
          檢視：我的交易記錄
        </span>
      </div>
    </template>

    <!-- Core Filters (Always Visible) -->
    <template #filters-core>
      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-calendar-alt"></i> 日期範圍：</span>
        <el-date-picker
          :model-value="dateRange"
          @update:model-value="$emit('update:dateRange', $event)"
          type="daterange"
          range-separator="至"
          start-placeholder="開始日期"
          end-placeholder="結束日期"
          format="YYYY-MM-DD"
          value-format="x"
          style="width: 280px;"
          clearable
        />
      </div>

      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-user"></i> 使用者：</span>
        <el-input
          :model-value="userFilter"
          @update:model-value="(val) => emit('update:userFilter', val)"
          placeholder="搜尋使用者名稱"
          clearable
          style="width: 220px;"
        >
          <template #prefix>
            <i class="el-icon-search"></i>
          </template>
        </el-input>
      </div>

      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-list-ol"></i> 顯示數量：</span>
        <div class="display-limit-control">
          <el-slider
            :model-value="displayLimit"
            @update:model-value="(val: number | number[]) => emit('update:displayLimit', Array.isArray(val) ? val[0] : val)"
            :min="10"
            :max="200"
            :step="10"
            :show-tooltip="true"
            :format-tooltip="(val: number) => `${val} 筆`"
            class="display-slider"
            style="width: 180px;"
          />
          <span class="limit-text">{{ displayLimit }} 筆</span>
        </div>
      </div>
    </template>

    <!-- Expanded Filters (Collapsible) -->
    <template #filters-expanded>
      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-layer-group"></i> 階段：</span>
        <el-select
          :model-value="selectedStageIds"
          @update:model-value="$emit('update:selectedStageIds', $event)"
          placeholder="選擇階段"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          style="width: 280px;"
          :disabled="!hasTransactions || stageOptions.length === 0"
        >
          <el-option
            v-for="option in stageOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>

      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-tag"></i> 交易類型：</span>
        <el-select
          :model-value="selectedTransactionTypes"
          @update:model-value="$emit('update:selectedTransactionTypes', $event)"
          placeholder="選擇交易類型"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          style="width: 280px;"
          :disabled="!hasTransactions"
        >
          <el-option
            v-for="option in transactionTypeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>

      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-coins"></i> 點數：</span>
        <el-input
          :model-value="pointsFilter"
          @update:model-value="(val) => emit('update:pointsFilter', val ? Number(val) : null)"
          type="number"
          placeholder="過濾點數"
          clearable
          style="width: 180px;"
        />
      </div>

      <div class="filter-item">
        <span class="filter-label"><i class="fas fa-search"></i> 說明：</span>
        <el-input
          :model-value="descriptionFilter"
          @update:model-value="(val) => emit('update:descriptionFilter', val)"
          placeholder="搜尋說明內容"
          clearable
          style="width: 280px;"
        >
          <template #prefix>
            <i class="el-icon-search"></i>
          </template>
        </el-input>
      </div>
    </template>

    <!-- Action Buttons -->
    <template #actions>
      <el-tooltip content="輸出錢包CSV" placement="top">
        <el-button
          type="primary"
          size="small"
          @click="$emit('export-csv')"
        >
          <i class="fas fa-file-csv"></i>
          <span class="btn-text">輸出錢包CSV</span>
        </el-button>
      </el-tooltip>

      <el-tooltip content="輸出成績" placement="top">
        <el-button
          v-if="canManageWallets"
          type="success"
          size="small"
          @click="$emit('export-grades')"
          :loading="exportingGrades"
          :disabled="exportingGrades"
        >
          <i class="fas fa-graduation-cap"></i>
          <span class="btn-text">{{ exportingGrades ? '處理中...' : '輸出成績' }}</span>
        </el-button>
      </el-tooltip>

      <el-tooltip content="發放額外專案獎勵點數" placement="top">
        <el-button
          v-if="canManageWallets"
          type="success"
          size="small"
          @click="$emit('show-award-points')"
        >
          <i class="fas fa-gift"></i>
          <span class="btn-text">發放獎勵點數</span>
        </el-button>
      </el-tooltip>
    </template>
  </AdminFilterToolbar>
</template>

<script setup lang="ts">
/**
 * @fileoverview Transaction Filters Section Component
 * 交易篩選器組件 - 基於 AdminFilterToolbar 重構
 *
 * Phase 4.x - 統一過濾器設計 + 折疊功能
 * - 使用 AdminFilterToolbar 作為基礎組件
 * - 核心筛选器：日期范围、使用者、显示数量（始终可见）
 * - 展开筛选器：阶段、交易类型、点数、说明（可折叠）
 * - 保持向後兼容（props 和 emits 不變）
 */

import { computed } from 'vue'
import type { Transaction, User } from '@repo/shared'
import AdminFilterToolbar from './admin/shared/AdminFilterToolbar.vue'

interface SelectOption {
  value: string
  label: string
}

interface Props {
  // Permission flags
  canViewAllUsers: boolean
  canManageWallets: boolean

  // User selection
  selectedUserEmail: string | null
  projectUsers: User[]

  // Export state
  exportingGrades: boolean

  // Filter state
  dateRange: [string, string] | null
  pointsFilter: number | null
  descriptionFilter: string
  userFilter: string
  displayLimit: number
  selectedStageIds: string[]
  selectedTransactionTypes: Transaction['transactionType'][]

  // Options
  stageOptions: SelectOption[]
  transactionTypeOptions: SelectOption[]

  // Computed flags
  hasActiveFilters: boolean
  hasTransactions: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'clear-filters'): void
  (e: 'update:dateRange', value: [string, string] | null): void
  (e: 'update:pointsFilter', value: number | null): void
  (e: 'update:descriptionFilter', value: string): void
  (e: 'update:userFilter', value: string): void
  (e: 'update:displayLimit', value: number): void
  (e: 'update:selectedStageIds', value: string[]): void
  (e: 'update:selectedTransactionTypes', value: Transaction['transactionType'][]): void
  (e: 'export-csv'): void
  (e: 'export-grades'): void
  (e: 'show-award-points'): void
}>()

/**
 * 計算啟用的篩選器數量（所有筛选器）
 * 用於 AdminFilterToolbar 的 activeFilterCount badge（橙色）
 */
const activeFilterCount = computed(() => {
  let count = 0

  if (props.dateRange) count++
  if (props.pointsFilter !== null) count++
  if (props.descriptionFilter) count++
  if (props.userFilter) count++
  if (props.selectedStageIds.length > 0) count++
  if (props.selectedTransactionTypes.length > 0) count++

  return count
})

/**
 * 展開區域的篩選器總數（固定值）
 * 用於在折叠时显示灰色徽章，告诉用户展开后可以看到多少个筛选器
 *
 * 展开区域包含：
 * 1. 阶段 (selectedStageIds)
 * 2. 交易类型 (selectedTransactionTypes)
 * 3. 点数 (pointsFilter)
 * 4. 说明 (descriptionFilter)
 */
const expandedFilterCount = computed(() => {
  // 固定值：展开区域有 4 个筛选器
  return 4
})

/**
 * 清除所有篩選器
 */
function handleClearFilters() {
  emit('clear-filters')
}
</script>

<style scoped>
/* View Mode Indicator */
.view-mode-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.view-mode-badge {
  background: rgba(52, 152, 219, 0.1);
  color: #3498db;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(52, 152, 219, 0.2);
}

.view-mode-badge.view-mode-single {
  background: rgba(46, 204, 113, 0.1);
  color: #2ecc71;
  border-color: rgba(46, 204, 113, 0.2);
}

.view-mode-badge i {
  font-size: 12px;
}

/* Filter Item Structure (参考 UserManagement.vue) */
.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  color: #606266;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-label i {
  color: #909399;
  font-size: 12px;
}

/* Display Limit Control */
.display-limit-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.display-slider {
  flex: 1;
}

.limit-text {
  color: #409eff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  min-width: 50px;
  text-align: center;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .filter-item {
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
  }

  .filter-label {
    width: 100%;
  }

  .display-limit-control {
    width: 100%;
  }
}
</style>
