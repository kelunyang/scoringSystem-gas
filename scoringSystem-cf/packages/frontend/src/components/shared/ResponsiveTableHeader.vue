<template>
  <!-- ========================================
       橫屏模式：完整表頭
       ======================================== -->
  <thead v-if="!isPortrait" class="responsive-header">
    <tr>
      <slot name="full" />
    </tr>
  </thead>

  <!-- ========================================
       豎屏模式：合併表頭（資訊行 + 操作行）
       ======================================== -->
  <thead v-else class="responsive-header responsive-header-portrait">
    <!-- 資訊行表頭 -->
    <tr class="responsive-header-info">
      <slot name="info" />
    </tr>
    <!-- 操作行表頭 -->
    <tr class="responsive-header-actions">
      <th :colspan="actionsColspan" class="actions-header">
        <i class="fas fa-cogs"></i>
        操作
      </th>
    </tr>
  </thead>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@/composables/useMediaQuery'

/**
 * 響應式表頭組件
 *
 * 用於配合 ExpandableTableRow 組件，在豎屏時合併表頭欄位。
 *
 * 使用示例：
 * ```vue
 * <ResponsiveTableHeader :actions-colspan="3">
 *   <!-- 橫屏：完整表頭 -->
 *   <template #full>
 *     <th>選擇</th>
 *     <th>名稱</th>
 *     <th>狀態</th>
 *     <th>權重</th>
 *     <th>成員數</th>
 *     <th>操作</th>
 *   </template>
 *
 *   <!-- 豎屏：只顯示資訊欄位 -->
 *   <template #info>
 *     <th>選擇</th>
 *     <th>名稱</th>
 *     <th>狀態</th>
 *   </template>
 * </ResponsiveTableHeader>
 * ```
 */

export interface Props {
  /** 豎屏時操作行的 colspan */
  actionsColspan: number
}

defineProps<Props>()

const { isPortrait } = useMediaQuery()
</script>

<style scoped>
.responsive-header {
  background-color: #f5f7fa;
}

.responsive-header th {
  padding: 12px;
  font-weight: 600;
  color: #606266;
  text-align: left;
  border-bottom: 2px solid #e4e7ed;
}

/* 豎屏模式樣式 */
.responsive-header-portrait .responsive-header-info th {
  border-bottom: 1px solid #e4e7ed;
}

.responsive-header-actions {
  background-color: #f0f2f5;
}

.actions-header {
  text-align: left;
  padding: 8px 12px !important;
  font-weight: 500;
  color: #909399;
  font-size: 13px;
}

.actions-header i {
  margin-right: 6px;
  font-size: 12px;
}
</style>
