<template>
  <div class="icon-selector">
    <!-- 下拉選單：常用圖示 -->
    <el-select
      v-model="selectedPreset"
      placeholder="選擇常用圖示"
      clearable
      :disabled="!!customIcon"
      class="icon-select"
      @change="handlePresetChange"
    >
      <el-option
        v-for="icon in COMMON_ICONS"
        :key="icon.value"
        :label="icon.label"
        :value="icon.value"
      >
        <span class="icon-option">
          <i class="fas" :class="icon.value"></i>
          <span>{{ icon.label }}</span>
        </span>
      </el-option>
    </el-select>

    <!-- 自訂圖示輸入框 -->
    <div class="custom-input-row">
      <span class="custom-label">或輸入自訂圖示：</span>
      <el-input
        v-model="customIcon"
        placeholder="例如：fa-rocket"
        clearable
        class="custom-input"
        @input="handleCustomInput"
      >
        <template #prefix>
          <i class="fas fa-code"></i>
        </template>
      </el-input>
    </div>

    <!-- 預覽區域 -->
    <div class="preview-area">
      <span class="preview-label">預覽：</span>
      <div class="preview-icon-container">
        <i class="fas" :class="effectiveIcon"></i>
      </div>
      <span class="preview-text">{{ effectiveIcon }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// 常用圖示清單
const COMMON_ICONS = [
  { value: 'fa-star', label: '星星' },
  { value: 'fa-graduation-cap', label: '學位帽' },
  { value: 'fa-book', label: '書本' },
  { value: 'fa-trophy', label: '獎盃' },
  { value: 'fa-medal', label: '獎牌' },
  { value: 'fa-award', label: '獎章' },
  { value: 'fa-school', label: '學校' },
  { value: 'fa-lightbulb', label: '燈泡' },
  { value: 'fa-rocket', label: '火箭' },
  { value: 'fa-heart', label: '愛心' },
  { value: 'fa-flag', label: '旗幟' },
  { value: 'fa-gem', label: '寶石' },
  { value: 'fa-crown', label: '皇冠' },
  { value: 'fa-leaf', label: '葉子' },
  { value: 'fa-sun', label: '太陽' },
  { value: 'fa-moon', label: '月亮' },
  { value: 'fa-bolt', label: '閃電' },
  { value: 'fa-fire', label: '火焰' },
  { value: 'fa-compass', label: '指南針' },
  { value: 'fa-anchor', label: '船錨' },
]

// 本地狀態
const selectedPreset = ref<string>('')
const customIcon = ref<string>('')

// 有效的圖示值（優先使用自訂，否則使用預設）
const effectiveIcon = computed(() => {
  return customIcon.value || selectedPreset.value || 'fa-star'
})

// 初始化
onMounted(() => {
  if (props.modelValue) {
    // 檢查是否為預設圖示
    const isPreset = COMMON_ICONS.some(icon => icon.value === props.modelValue)
    if (isPreset) {
      selectedPreset.value = props.modelValue
    } else {
      customIcon.value = props.modelValue
    }
  }
})

// 監聽 props 變化
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    const isPreset = COMMON_ICONS.some(icon => icon.value === newValue)
    if (isPreset) {
      selectedPreset.value = newValue
      customIcon.value = ''
    } else {
      customIcon.value = newValue
      selectedPreset.value = ''
    }
  }
})

// 處理預設選擇變更
function handlePresetChange(value: string) {
  if (value) {
    customIcon.value = '' // 清空自訂輸入
    emit('update:modelValue', value)
  }
}

// 處理自訂輸入變更
function handleCustomInput(value: string) {
  if (value) {
    selectedPreset.value = '' // 清空預設選擇
  }
  emit('update:modelValue', value || selectedPreset.value || 'fa-star')
}
</script>

<style scoped lang="scss">
.icon-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-select {
  width: 100%;
}

.icon-option {
  display: flex;
  align-items: center;
  gap: 8px;

  i {
    width: 20px;
    text-align: center;
    color: var(--el-color-primary);
  }
}

.custom-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.custom-input {
  flex: 1;
}

.preview-area {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.preview-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.preview-icon-container {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  border-radius: 50%;

  i {
    font-size: 24px;
    color: var(--el-color-primary);
  }
}

.preview-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
</style>
