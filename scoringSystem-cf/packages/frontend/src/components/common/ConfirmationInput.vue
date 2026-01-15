<template>
  <div class="confirmation-input">
    <el-input
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', ($event as string).toUpperCase())"
      :placeholder="placeholder || `輸入 ${keyword} 以確認`"
      :size="size"
      :class="{ 'is-valid': isValid }"
      :disabled="disabled"
      @keyup.enter="$emit('confirm')"
      clearable
    >
      <template #prefix>
        <i :class="prefixIcon || 'fas fa-keyboard'"></i>
      </template>
    </el-input>
    <div class="confirmation-hint">
      <slot name="hint">
        輸入 <strong>{{ keyword }}</strong> {{ hintAction || '確認' }}
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface Props {
  modelValue: string
  keyword: string              // 必填：確認關鍵詞 (SUBMIT, REMOVE, DELETE 等)
  placeholder?: string         // 可選：自訂 placeholder
  hintAction?: string          // 可選：提示動作文字 (預設 "確認")
  size?: 'small' | 'default' | 'large'
  prefixIcon?: string          // 可選：前綴圖示 class
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'large',
  disabled: false
})

defineEmits<{
  'update:modelValue': [value: string]
  'confirm': []
}>()

const isValid = computed(() => props.modelValue === props.keyword)

defineExpose({ isValid })
</script>

<style scoped>
.confirmation-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirmation-input .el-input {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.confirmation-input .el-input :deep(.el-input__inner) {
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 2px;
}

.confirmation-input .el-input :deep(.el-input__wrapper) {
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.confirmation-input .el-input.is-valid :deep(.el-input__wrapper) {
  border-color: #28a745;
  box-shadow: 0 0 0 1px #28a745;
}

.confirmation-input .el-input.is-valid {
  animation: confirmGrow 0.3s ease;
}

@keyframes confirmGrow {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}

.confirmation-hint {
  font-size: 13px;
  color: #6c757d;
  text-align: center;
}

.confirmation-hint strong {
  color: #e74c3c;
  font-family: monospace;
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
