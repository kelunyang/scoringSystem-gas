<template>
  <div class="stat-number-wrapper">
    <component
      :is="showBadge ? 'el-badge' : 'div'"
      v-bind="badgeProps"
      :class="badgeWrapperClass"
    >
      <template v-if="showBadge" #content>
        <i :class="badgeIcon"></i>
      </template>

      <component
        :is="showTooltip ? 'el-tooltip' : 'div'"
        v-bind="tooltipProps"
      >
        <template v-if="showTooltip" #content>
          <StatTooltipContent v-bind="tooltipContent" />
        </template>

        <div class="stat-number" :class="[stateClass, sizeClass]" :style="{ width: dynamicWidth }">
          <StatNumberContent
            :value="value"
            :loading="loading"
            :enable-animation="enableAnimation"
            :size="size as 'small' | 'medium' | 'large'"
          />
        </div>
      </component>
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StatNumberContent from './StatNumberContent.vue'
import StatTooltipContent from './StatTooltipContent.vue'
import { formatDate } from '@/utils/dateFormatter'

const props = defineProps({
  // 核心數據
  value: {
    type: [Number, String],
    default: '-'
  },
  loading: {
    type: Boolean,
    default: false
  },

  // 狀態控制
  displayState: {
    type: String,
    default: 'normal',
    validator: (val: string) => ['normal', 'pending', 'not-voted', 'approved', 'dead'].includes(val)
  },

  // 提示框數據
  tooltipData: {
    type: Object,
    default: null
    // { proposerName, status, timestamp, customMessage, proposerLabel }
  },

  // 動畫配置
  enableAnimation: {
    type: Boolean,
    default: true
  },

  // 樣式配置
  size: {
    type: String,
    default: 'medium',
    validator: (val: string) => ['small', 'medium', 'large'].includes(val)
  }
})

// 狀態樣式類
const stateClass = computed(() => {
  return `state-${props.displayState}`
})

// 尺寸樣式類
const sizeClass = computed(() => {
  return `size-${props.size}`
})

// 是否顯示徽章
const showBadge = computed(() => {
  return ['not-voted', 'pending', 'approved', 'dead'].includes(props.displayState)
})

// 徽章圖標
const badgeIcon = computed(() => {
  if (props.displayState === 'not-voted') return 'fa fa-bomb'
  if (props.displayState === 'pending') return 'fas fa-exclamation-triangle'
  if (props.displayState === 'approved') return 'fa fa-check'
  if (props.displayState === 'dead') return 'fa fa-skull'
  return ''
})

// Badge wrapper 的 class
const badgeWrapperClass = computed(() => {
  if (!showBadge.value) return ''

  return {
    'stat-badge': true,
    'badge-not-voted': props.displayState === 'not-voted',
    'badge-approved': props.displayState === 'approved',
    'badge-dead': props.displayState === 'dead'
  }
})

// Badge 組件的 props（el-badge 內部 props，不包含 class）
const badgeProps = computed(() => {
  if (!showBadge.value) return {}
  return {}
})

// 是否顯示提示框
const showTooltip = computed(() => {
  return props.tooltipData !== null && props.tooltipData !== undefined
})

// Tooltip 組件的 props
const tooltipProps = computed(() => {
  if (!showTooltip.value) return {}

  return {
    placement: 'top',
    showAfter: 300
  }
})

// 提示框內容
const tooltipContent = computed(() => {
  if (!props.tooltipData) {
    return {
      proposer: '',
      proposerLabel: '提議者',
      status: '',
      time: '',
      customMessage: ''
    }
  }

  const { proposerName, status, timestamp, customMessage, proposerLabel } = props.tooltipData

  return {
    proposer: proposerName || '',
    proposerLabel: proposerLabel || '提議者',
    status: status === 'approved' ? '已確認 ✅' : (status ? '未確認 ⚠️' : ''),
    time: formatDate(timestamp),
    customMessage: customMessage || ''
  }
})

// 計算數字位數
const digitCount = computed(() => {
  if (props.loading) return 1
  if (props.value === '-' || props.value === null || props.value === undefined) return 1

  const valueStr = String(props.value)
  return valueStr.length
})

// 動態寬度計算
const dynamicWidth = computed(() => {
  const digits = digitCount.value

  // 基礎寬度和每位數增加的寬度
  const sizeConfig: Record<string, { base: number; perDigit: number }> = {
    small: { base: 40, perDigit: 8 },
    medium: { base: 50, perDigit: 10 },
    large: { base: 60, perDigit: 12 }
  }

  const config = sizeConfig[props.size] || sizeConfig.medium

  // 1位數使用基礎寬度，多位數按比例增加
  if (digits <= 1) {
    return `${config.base}px`
  }

  const extraDigits = digits - 1
  const width = config.base + (extraDigits * config.perDigit)

  return `${width}px`
})
</script>

<style scoped>
.stat-number-wrapper {
  display: inline-block;
}

/* 底板基礎樣式 */
.stat-number {
  font-weight: 700;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible; /* 改為 visible 讓 3D 圓柱完整顯示 */
}

/* 尺寸變體 - 僅設定字體大小和高度，寬度由 dynamicWidth 控制 */
.stat-number.size-small {
  font-size: 20px;
  height: 40px;
  min-width: 40px;  /* 最小寬度保證單位數顯示 */
}

.stat-number.size-medium {
  font-size: 28px;
  height: 50px;
  min-width: 50px;
}

.stat-number.size-large {
  font-size: 36px;
  height: 60px;
  min-width: 60px;
}

/* 狀態樣式 */
.stat-number.state-normal,
.stat-number.state-approved {
  background: #2c3e50;
  color: #fff;
}

.stat-number.state-pending {
  border: 3px dashed #2c3e50;
  background: transparent;
  color: #2c3e50;
}

.stat-number.state-not-voted {
  border: 3px solid maroon;
  background: transparent;
  color: maroon;
}

.stat-number.state-dead {
  border: 3px dashed maroon;
  background: transparent;
  color: maroon;
}

/* Badge 樣式 */
.stat-badge :deep(.el-badge__content) {
  background-color: #e6a23c;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  font-size: 10px;
  line-height: 1;
  padding: 3px 4px;
  height: auto;
  min-width: auto;
  border-radius: 10px;
}

.stat-badge.badge-not-voted :deep(.el-badge__content) {
  background-color: maroon;
}

.stat-badge.badge-approved :deep(.el-badge__content) {
  background-color: #67c23a; /* Element Plus success 綠色 */
}

.stat-badge.badge-dead :deep(.el-badge__content) {
  background-color: #fff; /* 白底 */
  color: maroon; /* 紅字 */
}
</style>
