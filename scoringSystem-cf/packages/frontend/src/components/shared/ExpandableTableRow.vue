<template>
  <!-- ========================================
       橫屏模式 或 未啟用響應式：單行顯示
       ======================================== -->
  <template v-if="!shouldShowResponsiveRows">
    <!-- 主行：可点击触发展开 -->
    <tr
      class="expandable-main-row"
      :class="computedRowClasses"
      @click="$emit('toggle-expansion')"
    >
      <slot
        name="main"
        :is-expanded="isExpanded"
        :is-selected="isSelected"
      />
    </tr>
  </template>

  <!-- ========================================
       豎屏模式：雙行顯示（資訊行 + 操作行）
       ======================================== -->
  <template v-else>
    <!-- 資訊行：可点击触发展开 -->
    <tr
      class="expandable-main-row expandable-info-row"
      :class="computedRowClasses"
      @click="$emit('toggle-expansion')"
    >
      <slot
        name="info"
        :is-expanded="isExpanded"
        :is-selected="isSelected"
      />
    </tr>

    <!-- 操作行：包含按鈕和開關 -->
    <tr
      class="expandable-actions-row"
      :class="{ 'expanded': isExpanded, 'selected-row': isSelected }"
    >
      <td :colspan="computedActionsColspan" class="actions-cell">
        <div class="actions-container">
          <slot name="actions" />
        </div>
      </td>
    </tr>
  </template>

  <!-- 展开行：带抽屉动画（兩種模式共用） -->
  <transition name="expand-drawer">
    <tr v-if="isExpanded" class="expandable-expansion-row">
      <td :colspan="expansionColspan" class="expandable-cell">
        <div class="expandable-content">
          <slot />
        </div>
      </td>
    </tr>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@/composables/useMediaQuery'

/**
 * 可展开的表格行组件（完整版）
 *
 * 功能：
 * - 统一主行和展开行的视觉样式
 * - 统一展开图标、按钮、标题样式
 * - 抽屉拉开/收起动画效果
 * - 主行 hover/expanded/selected 状态样式
 * - 通过 slot 完全自定义内容
 * - 响应式双行模式：豎屏時拆成資訊行 + 操作行
 *
 * 使用示例：
 * ```vue
 * <ExpandableTableRow
 *   :is-expanded="isExpanded"
 *   :is-selected="isSelected"
 *   :expansion-colspan="7"
 *   :enable-responsive-rows="true"
 *   :actions-colspan="3"
 *   @toggle-expansion="handleToggle"
 * >
 *   <!-- 橫屏：完整單行 -->
 *   <template #main="{ isExpanded, isSelected }">
 *     <td><el-checkbox /></td>
 *     <td>群组名称</td>
 *     <td>其他列...</td>
 *     <td class="actions">按鈕...</td>
 *   </template>
 *
 *   <!-- 豎屏第一行：資訊 -->
 *   <template #info="{ isExpanded, isSelected }">
 *     <td><el-checkbox /></td>
 *     <td>群组名称</td>
 *   </template>
 *
 *   <!-- 豎屏第二行：操作 -->
 *   <template #actions>
 *     <el-button>編輯</el-button>
 *     <el-switch />
 *   </template>
 *
 *   <template #default>
 *     <h4><i class="fas fa-users"></i> 群组成员</h4>
 *     <div>成员列表...</div>
 *   </template>
 * </ExpandableTableRow>
 * ```
 */

interface Props {
  /** 是否展开 */
  isExpanded: boolean
  /** 是否选中（可选，用于 GlobalGroup/ProjectGroup） */
  isSelected?: boolean
  /** 展开行占用列数 */
  expansionColspan: number
  /** 自定义主行类名（可选） */
  rowClass?: string
  /** 是否啟用響應式雙行模式（預設 false，向後兼容） */
  enableResponsiveRows?: boolean
  /** 豎屏時操作行的 colspan（預設使用 expansionColspan） */
  actionsColspan?: number
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  rowClass: '',
  enableResponsiveRows: false,
  actionsColspan: undefined
})

defineEmits<{
  'toggle-expansion': []
}>()

// 響應式方向偵測
const { isPortrait } = useMediaQuery()

// 是否應該顯示雙行模式
const shouldShowResponsiveRows = computed(() => {
  return props.enableResponsiveRows && isPortrait.value
})

// 操作行的 colspan（預設使用 expansionColspan）
const computedActionsColspan = computed(() => {
  return props.actionsColspan ?? props.expansionColspan
})

// 计算主行的 CSS 类
const computedRowClasses = computed(() => ({
  'expanded': props.isExpanded,
  'selected-row': props.isSelected,
  ...(props.rowClass ? { [props.rowClass]: true } : {})
}))
</script>

<style scoped>
/* ========================================
   主行样式：hover / expanded / selected
   ======================================== */

.expandable-main-row {
  cursor: pointer;
  transition: all 0.2s ease;
}

.expandable-main-row:hover {
  background-color: #f5f7fa;
}

.expandable-main-row.expanded {
  background-color: #ecf5ff;
  border-bottom: 2px solid #409eff;
}

.expandable-main-row.selected-row {
  background-color: #fff4e6;
}

/* ========================================
   主行按鈕：糖果漸層配色（熱帶島嶼）
   ======================================== */

/* Primary 按鈕 - 深青綠漸層 */
.expandable-main-row :deep(.el-button--primary) {
  background: linear-gradient(135deg, #00CED1 0%, #008B8B 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button--primary:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(0, 206, 209, 0.4);
}

/* Danger 按鈕 - 珊瑚紅漸層 */
.expandable-main-row :deep(.el-button--danger) {
  background: linear-gradient(135deg, #FF4757 0%, #C0392B 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button--danger:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(255, 71, 87, 0.4);
}

/* Warning 按鈕 - 陽光黃漸層 */
.expandable-main-row :deep(.el-button--warning) {
  background: linear-gradient(135deg, #FFEAA7 0%, #F39C12 100%) !important;
  border: none !important;
  color: #2d3436 !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button--warning:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(243, 156, 18, 0.4);
}

/* Success 按鈕 - 薄荷海浪漸層 */
.expandable-main-row :deep(.el-button--success) {
  background: linear-gradient(135deg, #81ECEC 0%, #00B894 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button--success:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(0, 184, 148, 0.4);
}

/* Info 按鈕 - 天空藍漸層 */
.expandable-main-row :deep(.el-button--info) {
  background: linear-gradient(135deg, #74B9FF 0%, #0984E3 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button--info:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(116, 185, 255, 0.4);
}

/* Default 按鈕 - 沙灘灰白漸層 */
.expandable-main-row :deep(.el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text)) {
  background: linear-gradient(135deg, #DFE6E9 0%, #B2BEC3 100%) !important;
  border: none !important;
  color: #2d3436 !important;
  font-weight: 500;
  transition: all 0.15s ease;
}

.expandable-main-row :deep(.el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text):hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(178, 190, 195, 0.4);
}

/* 統一 disabled 狀態 */
.expandable-main-row :deep(.el-button:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 統一 loading 狀態 */
.expandable-main-row :deep(.el-button.is-loading) {
  opacity: 0.8;
}

/* ========================================
   豎屏雙行模式：操作行樣式
   ======================================== */

.expandable-actions-row {
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  transition: all 0.2s ease;
}

.expandable-actions-row.expanded {
  background-color: #e8f4ff;
  border-bottom: 2px solid #409eff;
}

.expandable-actions-row.selected-row {
  background-color: #fff8f0;
}

.expandable-actions-row .actions-cell {
  padding: 8px 12px !important;
}

.expandable-actions-row .actions-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  align-items: center;
}

/* 確保 switch 和 button 在操作行內對齊 */
.expandable-actions-row :deep(.el-switch),
.expandable-actions-row :deep(.el-button) {
  flex-shrink: 0;
}

/* 操作行內的按鈕稍微縮小 */
.expandable-actions-row :deep(.el-button) {
  padding: 6px 12px;
  font-size: 13px;
}

/* 操作行內的開關標籤 */
.expandable-actions-row :deep(.el-switch) {
  margin-right: 4px;
}

/* ========================================
   操作行按鈕：糖果漸層配色（熱帶島嶼）
   ======================================== */

/* Primary 按鈕 - 深青綠漸層 */
.expandable-actions-row :deep(.el-button--primary) {
  background: linear-gradient(135deg, #00CED1 0%, #008B8B 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button--primary:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(0, 206, 209, 0.4);
}

/* Danger 按鈕 - 珊瑚紅漸層 */
.expandable-actions-row :deep(.el-button--danger) {
  background: linear-gradient(135deg, #FF4757 0%, #C0392B 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button--danger:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(255, 71, 87, 0.4);
}

/* Warning 按鈕 - 陽光黃漸層 */
.expandable-actions-row :deep(.el-button--warning) {
  background: linear-gradient(135deg, #FFEAA7 0%, #F39C12 100%) !important;
  border: none !important;
  color: #2d3436 !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button--warning:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(243, 156, 18, 0.4);
}

/* Success 按鈕 - 薄荷海浪漸層 */
.expandable-actions-row :deep(.el-button--success) {
  background: linear-gradient(135deg, #81ECEC 0%, #00B894 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button--success:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(0, 184, 148, 0.4);
}

/* Info 按鈕 - 天空藍漸層 */
.expandable-actions-row :deep(.el-button--info) {
  background: linear-gradient(135deg, #74B9FF 0%, #0984E3 100%) !important;
  border: none !important;
  color: white !important;
  font-weight: 600;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button--info:hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(116, 185, 255, 0.4);
}

/* Default 按鈕 - 沙灘灰白漸層 */
.expandable-actions-row :deep(.el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text)) {
  background: linear-gradient(135deg, #DFE6E9 0%, #B2BEC3 100%) !important;
  border: none !important;
  color: #2d3436 !important;
  font-weight: 500;
  transition: all 0.15s ease;
}

.expandable-actions-row :deep(.el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text):hover:not(:disabled):not(.is-loading)) {
  opacity: 0.9;
  box-shadow: 0 2px 6px rgba(178, 190, 195, 0.4);
}

/* 統一 disabled 狀態 */
.expandable-actions-row :deep(.el-button:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 統一 loading 狀態 */
.expandable-actions-row :deep(.el-button.is-loading) {
  opacity: 0.8;
}

/* 資訊行在豎屏模式下的特殊處理 */
.expandable-info-row {
  border-bottom: none !important;
}

/* Force consistent row height across all expandable tables */
.expandable-main-row :deep(td) {
  min-height: 32.67px !important;  /* 56.67px - 2*12px padding = 32.67px */
  vertical-align: middle !important;
  line-height: 1.6 !important;
  padding: 12px !important;
}

/* 第二欄名稱截斷（排除 icon，純文字 5 個中文字約 150px） */
.expandable-main-row :deep(td:nth-child(2)) {
  max-width: 180px !important;  /* icon (12px) + gap (8px) + 文字 (150px) + 餘裕 (10px) */
}

.expandable-main-row :deep(td:nth-child(2) > div),
.expandable-main-row :deep(td:nth-child(2) > .group-name),
.expandable-main-row :deep(td:nth-child(2) > .project-name) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 確保 tooltip 包裹的 div 也能正常截斷 */
.expandable-main-row :deep(td:nth-child(2) .el-tooltip__trigger) {
  max-width: 100%;
  overflow: hidden;
}

/* ========================================
   抽屉动画：展开/收起效果
   ======================================== */

.expand-drawer-enter-active {
  transition: all 0.3s ease-out;
}

.expand-drawer-leave-active {
  transition: all 0.25s ease-in;
}

.expand-drawer-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.expand-drawer-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.expand-drawer-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.expand-drawer-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ========================================
   展开行容器样式
   ======================================== */

.expandable-expansion-row {
  background-color: #f9fafb;
}

.expandable-cell {
  padding: 0 !important;
}

.expandable-content {
  padding: 20px;
  background-color: white;
  margin: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 3px solid #409eff;
}

/* ========================================
   深度样式：自动应用到主行和展开内容
   ======================================== */

/* 展开图标统一样式 */
:deep(.expand-icon) {
  font-size: 12px;
  color: #409eff;
  transition: all 0.3s ease;
  margin-right: 8px;
}

.expandable-main-row.expanded :deep(.expand-icon) {
  color: #66b1ff;
}

/* 展开内容的深度样式 */
:deep(.expandable-content) {
  /* 标题图标统一 */
  h3 i, h4 i {
    color: #409eff;
    margin-right: 8px;
    font-size: 1em;
  }

  /* 标题样式统一 */
  h3, h4 {
    margin: 0 0 16px 0;
    color: #374151;
    font-weight: 600;
    display: flex;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  h3 {
    font-size: 18px;
  }

  h4 {
    font-size: 16px;
  }

  /* Header actions 容器 */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  /* 按钮统一样式 */
  .btn-sm {
    height: 36px !important;
    padding: 0 16px !important;
    font-size: 14px !important;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background-color: #409eff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #66b1ff;
  }

  .btn-secondary {
    background-color: #909399;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: #a6a9ad;
  }

  .btn-sm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm i {
    font-size: 12px;
  }

  /* Loading 容器间距 */
  .el-loading-mask {
    border-radius: 8px;
  }

  /* ========================================
     展開區域按鈕：糖果漸層配色（熱帶島嶼）
     ======================================== */

  /* Primary 按鈕 - 深青綠漸層（主要操作：編輯、新增成員） */
  .el-button--primary {
    background: linear-gradient(135deg, #00CED1 0%, #008B8B 100%) !important;
    border: none !important;
    color: white !important;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .el-button--primary:hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(0, 206, 209, 0.4);
  }

  /* Danger 按鈕 - 珊瑚紅漸層（危險操作：移除、批次移除） */
  .el-button--danger {
    background: linear-gradient(135deg, #FF4757 0%, #C0392B 100%) !important;
    border: none !important;
    color: white !important;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .el-button--danger:hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(255, 71, 87, 0.4);
  }

  /* Warning 按鈕 - 陽光黃漸層（警告操作：批次更新角色） */
  .el-button--warning {
    background: linear-gradient(135deg, #FFEAA7 0%, #F39C12 100%) !important;
    border: none !important;
    color: #2d3436 !important;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .el-button--warning:hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(243, 156, 18, 0.4);
  }

  /* Success 按鈕 - 薄荷海浪漸層（成功操作：新增、確認） */
  .el-button--success {
    background: linear-gradient(135deg, #81ECEC 0%, #00B894 100%) !important;
    border: none !important;
    color: white !important;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .el-button--success:hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(0, 184, 148, 0.4);
  }

  /* Info 按鈕 - 天空藍漸層（資訊操作：複製、查看） */
  .el-button--info {
    background: linear-gradient(135deg, #74B9FF 0%, #0984E3 100%) !important;
    border: none !important;
    color: white !important;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .el-button--info:hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(116, 185, 255, 0.4);
  }

  /* Default 按鈕 - 沙灘灰白漸層（中性操作：取消） */
  .el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text) {
    background: linear-gradient(135deg, #DFE6E9 0%, #B2BEC3 100%) !important;
    border: none !important;
    color: #2d3436 !important;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .el-button:not(.el-button--primary):not(.el-button--danger):not(.el-button--warning):not(.el-button--info):not(.el-button--success):not(.el-button--text):hover:not(:disabled):not(.is-loading) {
    opacity: 0.9;
    box-shadow: 0 2px 6px rgba(178, 190, 195, 0.4);
  }

  /* 統一 disabled 狀態 */
  .el-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 統一 loading 狀態 */
  .el-button.is-loading {
    opacity: 0.8;
  }
}
</style>
