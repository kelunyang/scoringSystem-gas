<template>
  <div class="stage-view-control">
    <el-segmented
      v-model="viewModeValue"
      :options="viewOptions"
      :disabled="disabled"
      size="small"
    >
      <template #default="{ item }">
        <div v-if="item.value === true" class="segmented-label-with-badge">
          <el-badge
            :value="mentionCount"
            :hidden="mentionCount === 0"
            :max="99"
          >
            查看評論
          </el-badge>
        </div>
        <div v-else>{{ item.label }}</div>
      </template>
    </el-segmented>
    <button
      class="refresh-btn"
      :disabled="disabled"
      @click="$emit('refresh')"
    >
      <i class="fa fa-refresh" :class="{ 'fa-spin': refreshing }"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElBadge } from 'element-plus'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false // false = 查看報告, true = 查看評論
  },
  refreshing: {
    type: Boolean,
    default: false
  },
  mentionCount: {
    type: Number,
    default: 0
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'refresh'])

const viewOptions = [
  {
    label: '查看報告',
    value: false
  },
  {
    label: '查看評論',
    value: true
  }
]

const viewModeValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})
</script>

<style scoped lang="scss">
.stage-view-control {
  display: flex;
  align-items: center;
  gap: 0;
  background: transparent;

  // 覆蓋 Element Plus 的文字顏色變量，強制使用當前文字顏色
  --el-text-color-primary: currentColor;
  --el-text-color-regular: currentColor;
  --el-text-color-secondary: currentColor;
}

/* Label with badge 容器樣式 */
.segmented-label-with-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible !important;
}

/* 確保 el-badge 組件正常定位 */
.segmented-label-with-badge :deep(.el-badge) {
  display: inline-block;
}

/* 確保 badge 數字可見並正確定位 */
.segmented-label-with-badge :deep(.el-badge__content.is-fixed) {
  position: absolute !important;
  top: -10px !important;
  right: -10px !important;
  transform: none !important;
  background-color: var(--el-color-danger) !important;
  border-radius: 10px !important;
  color: #fff !important;
  justify-content: center !important;
  align-items: center !important;
  font-size: 12px !important;
  height: 18px !important;
  padding: 0 6px !important;
  white-space: nowrap !important;
  border: 2px solid #fff !important;
  z-index: 10 !important;
}

/* 調整 el-segmented 樣式 */
.stage-view-control :deep(.el-segmented) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0;
}

.stage-view-control :deep(.el-segmented__item) {
  border: 1px solid currentColor !important;
  background: transparent !important;
  color: inherit !important;  // 强制继承父元素颜色
  font-weight: 500;
  padding: 6px 12px;
  height: 32px;
  line-height: 1.5;
  transition: all 0.2s;
  overflow: visible !important;
  box-shadow: none !important;

  // 確保所有內部元素都繼承顏色
  * {
    color: inherit !important;
  }
}

/* 關鍵修復：允許 badge 超出 label 範圍顯示 */
.stage-view-control :deep(.el-segmented__item-label) {
  overflow: visible !important;
  color: inherit !important;  // label 文字也繼承顏色
}

/* 確保 input 也繼承顏色 (Element Plus 可能使用 radio input) */
.stage-view-control :deep(.el-segmented__item input) {
  color: inherit !important;
}

.stage-view-control :deep(.el-segmented__item:hover) {
  background: rgba(0, 0, 0, 0.1) !important;
  box-shadow: none !important;
}

.stage-view-control :deep(.el-segmented__item.is-selected) {
  background: rgba(255, 255, 255, 0.9) !important;
  font-weight: 700;
  border-color: currentColor !important;
  color: #000 !important;  // 选中状态反转为黑色
  position: relative;
  z-index: 1;
  box-shadow: none !important;
}

/* 刷新按鈕樣式 */
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  border-radius: 0;
  font-weight: 500;
  padding: 6px 12px;
  height: 32px;
  min-width: 32px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: rgba(0, 0, 0, 0.05);
  }

  i {
    font-size: 14px;
  }
}

.stage-view-control :deep(.el-segmented.is-disabled) {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

.stage-view-control :deep(.el-segmented.is-disabled .el-segmented__item) {
  cursor: not-allowed !important;
  pointer-events: none !important;
}
</style>