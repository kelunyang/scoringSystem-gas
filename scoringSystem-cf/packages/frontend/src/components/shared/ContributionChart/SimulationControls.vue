<template>
  <div class="simulation-controls">
    <!-- 排名模擬選擇器 -->
    <div class="rank-simulation">
      <label>模擬排名:</label>
      <el-select
        :model-value="simulatedRank"
        class="rank-selector"
        size="small"
        @update:model-value="emit('update:simulatedRank', $event)"
      >
        <el-option
          v-for="rank in simulatedGroupCount"
          :key="rank"
          :value="rank"
          :label="`第${rank}名`"
        />
      </el-select>
    </div>

    <!-- 組數模擬滑塊 -->
    <div class="group-count-simulation">
      <label>模擬組數: {{ simulatedGroupCount }}</label>
      <el-slider
        :model-value="simulatedGroupCount"
        :min="safeSliderMin"
        :max="totalProjectGroups"
        :marks="sliderMarks"
        class="group-count-slider"
        @update:model-value="handleGroupCountChange"
      />
    </div>

    <!-- 總計百分比顯示 -->
    <div
      v-if="showTotalPercentage"
      class="total-percentage"
      :class="{ valid: totalPercentage === 100, invalid: totalPercentage !== 100 }"
    >
      總計: {{ totalPercentage }}%
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComputedRef } from 'vue'

export interface Props {
  simulatedRank: number
  simulatedGroupCount: number
  totalActiveGroups: number
  totalProjectGroups: number
  totalPercentage?: number
  showTotalPercentage?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  totalPercentage: 0,
  showTotalPercentage: true
})

const emit = defineEmits<{
  'update:simulatedRank': [value: number]
  'update:simulatedGroupCount': [value: number]
}>()

const safeSliderMin: ComputedRef<number> = computed(() => {
  const min = Math.max(1, props.totalActiveGroups)
  const max = props.totalProjectGroups

  if (min > max) {
    console.error('🚨 [SimulationControls] Slider 參數異常！', {
      totalActiveGroups: props.totalActiveGroups,
      totalProjectGroups: props.totalProjectGroups,
      calculatedMin: min,
      calculatedMax: max
    })
    return Math.min(min, max)
  }

  return min
})

const sliderMarks: ComputedRef<Record<number, string>> = computed(() => {
  return {
    [safeSliderMin.value]: '已交組數',
    [props.totalProjectGroups]: '總組數'
  }
})

// Handler to ensure slider value is a number
function handleGroupCountChange(value: number | number[]) {
  const numValue = Array.isArray(value) ? value[0] : value
  emit('update:simulatedGroupCount', numValue)
}
</script>

<style scoped>
.simulation-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 20px;
}

.rank-simulation {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-simulation label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.rank-selector {
  width: 100px;
}

.rank-selector :deep(.el-input__wrapper) {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.group-count-simulation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  flex: 1;
}

.group-count-simulation label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.group-count-slider {
  width: 100%;
}

.total-percentage {
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
}

.total-percentage.valid {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.total-percentage.invalid {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

@media (max-width: 768px) {
  .simulation-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .group-count-simulation {
    min-width: unset;
  }
}
</style>
