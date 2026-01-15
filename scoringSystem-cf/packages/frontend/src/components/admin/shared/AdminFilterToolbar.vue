<template>
  <div class="admin-filter-container" :class="`variant-${variant}`">
    <!-- Banner Slot -->
    <div v-if="$slots.banner || showBanner" class="filter-banner">
      <slot name="banner"></slot>
    </div>

    <!-- Mode Toggle Slot -->
    <div v-if="$slots['mode-toggle'] || showModeToggle" class="filter-mode-toggle">
      <slot name="mode-toggle"></slot>
    </div>

    <!-- Main Toolbar -->
    <div class="filter-toolbar" v-loading="loading">
      <!-- Core Filters Section (Always Visible) -->
      <div class="filter-core" :class="`layout-${filtersLayout}`">
        <slot name="filters-core"></slot>
      </div>

      <!-- Expanded Filters Section (Collapsible) -->
      <transition name="filter-expand">
        <div v-show="isExpanded" class="filter-expanded" :class="`layout-${filtersLayout}`">
          <slot name="filters-expanded"></slot>
        </div>
      </transition>

      <!-- Actions Section -->
      <div class="filter-actions">
        <slot name="actions"></slot>

        <!-- Clear Filters Button -->
        <el-badge
          :value="activeFilterCount"
          :hidden="activeFilterCount === 0"
          type="warning"
        >
          <el-tooltip content="清除過濾條件" placement="top">
            <el-button
              size="small"
              @click="handleResetFilters"
              :disabled="activeFilterCount === 0"
            >
              <i class="fas fa-filter-circle-xmark"></i>
              <span class="btn-text">清除過濾條件</span>
            </el-button>
          </el-tooltip>
        </el-badge>

        <!-- Export Dropdown (if export config provided) -->
        <!-- 注意：el-tooltip 不能直接包裹 el-dropdown 觸發器，會造成 role 屬性衝突 -->
        <el-dropdown
          v-if="showExport && exportData && exportData.length > 0"
          trigger="click"
          @command="handleExportCommand"
          class="export-dropdown"
        >
          <el-button type="primary" size="small" title="匯出">
            <i class="fas fa-download"></i>
            <span class="btn-text">匯出</span>
            <i class="fas fa-chevron-down arrow"></i>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="export-dropdown-menu">
              <el-dropdown-item command="csv">
                <i class="fas fa-file-csv"></i>
                匯出 CSV
              </el-dropdown-item>
              <el-dropdown-item command="json">
                <i class="fas fa-file-code"></i>
                匯出 JSON
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- Toggle Expand/Collapse Button (灰色 Badge 顯示展開區域過濾器數量) -->
        <el-badge
          v-if="showToggleBadge"
          :value="toggleBadgeValue"
          type="info"
          class="filter-count-badge"
        >
          <el-button
            size="small"
            class="filter-toggle-btn"
            @click="toggleExpand"
          >
            <i :class="isExpanded ? 'fas fa-down-left-and-up-right-to-center' : 'fas fa-up-right-and-down-left-from-center'"></i>
            <span class="btn-text-full">{{ isExpanded ? '收起' : '更多篩選' }}</span>
            <span class="btn-text-short">{{ isExpanded ? '收起' : '更多' }}</span>
          </el-button>
        </el-badge>
        <!-- 沒有 Badge 時的普通按鈕 -->
        <el-button
          v-else-if="collapsible && hasExpandedFilters"
          size="small"
          class="filter-toggle-btn"
          @click="toggleExpand"
        >
          <i :class="isExpanded ? 'fas fa-down-left-and-up-right-to-center' : 'fas fa-up-right-and-down-left-from-center'"></i>
          <span class="btn-text-full">{{ isExpanded ? '收起' : '更多篩選' }}</span>
          <span class="btn-text-short">{{ isExpanded ? '收起' : '更多' }}</span>
        </el-button>
      </div>
    </div>

    <!-- Stats Section -->
    <div v-if="$slots.stats || showStats" class="filter-stats">
      <slot name="stats"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, useSlots } from 'vue'
import { ElMessage } from 'element-plus'
import { exportToCsv, exportToJson } from '@/utils/exportUtils'

// 更精確的 TypeScript 型別定義
type ExportableData = Record<string, unknown>

export interface Props {
  // 視覺樣式
  variant?: 'default' | 'navy' | 'maroon' | 'green'

  // 摺疊狀態
  defaultExpanded?: boolean  // 預設是否展開
  modelValue?: boolean       // v-model 控制展開狀態

  // 功能開關
  showBanner?: boolean
  showModeToggle?: boolean
  showStats?: boolean
  collapsible?: boolean      // 是否可摺疊

  // 佈局選項
  filtersLayout?: 'column' | 'row'

  // 載入狀態
  loading?: boolean

  // 啟用的過濾器數量 (用於顯示 badge)
  activeFilterCount?: number

  // 展開區域的過濾器總數 (用於顯示在展開按鈕上的灰色 badge)
  expandedFilterCount?: number

  // 訊息控制（新增 - 遵循 Pure Presentation Component 原則）
  showResetMessage?: boolean      // 是否顯示重置訊息
  resetMessage?: string           // 自訂重置訊息
  showExportMessages?: boolean    // 是否顯示匯出訊息

  // 匯出功能
  exportData?: ExportableData[]                                  // 要匯出的資料
  exportFilename?: string                                        // 匯出檔名（不含副檔名）
  exportHeaders?: string[]                                       // CSV 表頭
  exportRowMapper?: (item: ExportableData) => (string | number)[]  // CSV 行映射函數
  showExport?: boolean                                           // 是否顯示匯出按鈕
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  defaultExpanded: false,
  showBanner: false,
  showModeToggle: false,
  showStats: false,
  collapsible: true,
  filtersLayout: 'column',
  loading: false,
  activeFilterCount: 0,
  expandedFilterCount: 0,      // 預設 0（不顯示 badge）
  showResetMessage: true,      // 預設顯示訊息（向後兼容）
  resetMessage: '已清除所有過濾條件',
  showExportMessages: true,    // 預設顯示訊息（向後兼容）
  showExport: true
})

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'toggle', value: boolean): void
  (e: 'reset-filters'): void
  (e: 'export', format: 'csv' | 'json'): void  // 新增：匯出事件
}

const emit = defineEmits<Emits>()
const slots = useSlots()

// 內部展開狀態
const isExpanded = ref(props.defaultExpanded)

// 同步 v-model（加上 immediate 確保初始化同步）
watch(() => props.modelValue, (value) => {
  if (value !== undefined && value !== isExpanded.value) {
    isExpanded.value = value
  }
}, { immediate: true })

// 切換展開/摺疊
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
  emit('update:modelValue', isExpanded.value)
  emit('toggle', isExpanded.value)
}

// Computed: Badge 邏輯優化
// 檢查是否有展開區域的 slot
const hasExpandedFilters = computed(() => !!slots['filters-expanded'])

// Badge 值：顯示 expandedFilterCount（灰色 badge）
const toggleBadgeValue = computed(() => {
  return props.expandedFilterCount > 0 ? props.expandedFilterCount : 0
})

// 是否顯示 Badge：只在摺疊狀態 + 有展開區域 + expandedFilterCount > 0 時顯示
const showToggleBadge = computed(() => {
  return props.collapsible &&
         hasExpandedFilters.value &&
         props.expandedFilterCount > 0 &&
         !isExpanded.value  // 只在摺疊時顯示
})

// 清除過濾條件（Pure Presentation - 可選訊息顯示）
const handleResetFilters = () => {
  emit('reset-filters')

  // 只在 prop 允許時顯示訊息
  if (props.showResetMessage) {
    ElMessage.success(props.resetMessage)
  }
}

// 處理匯出命令（改為事件發射 + 向後兼容）
const handleExportCommand = (command: 'csv' | 'json') => {
  // 優先發射事件（新模式 - Pure Presentation）
  emit('export', command)

  // 如果有提供 exportData，則執行內建邏輯（向後兼容）
  if (props.exportData) {
    executeExport(command)
  }
}

// 內建匯出邏輯（向後兼容）
const executeExport = (command: 'csv' | 'json') => {
  if (!props.exportData || props.exportData.length === 0) {
    if (props.showExportMessages) {
      ElMessage.warning('沒有可匯出的資料')
    }
    return
  }

  const filename = props.exportFilename || '資料'

  try {
    if (command === 'csv') {
      if (!props.exportHeaders || !props.exportRowMapper) {
        console.error('[AdminFilterToolbar] CSV 匯出需要 exportHeaders 和 exportRowMapper')
        if (props.showExportMessages) {
          ElMessage.error('匯出配置錯誤')
        }
        return
      }
      exportToCsv(
        props.exportData,
        filename,
        props.exportHeaders,
        props.exportRowMapper
      )
      if (props.showExportMessages) {
        ElMessage.success(`已匯出 ${filename}.csv`)
      }
    } else if (command === 'json') {
      exportToJson(props.exportData, filename)
      if (props.showExportMessages) {
        ElMessage.success(`已匯出 ${filename}.json`)
      }
    }
  } catch (error) {
    console.error('[AdminFilterToolbar] 匯出失敗:', error)
    if (props.showExportMessages) {
      ElMessage.error('匯出失敗，請稍後再試')
    }
  }
}
</script>

<style scoped lang="scss" src="./admin-filter-toolbar.scss"></style>
