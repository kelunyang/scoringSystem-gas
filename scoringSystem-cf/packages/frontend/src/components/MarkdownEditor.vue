<template>
  <MdEditorWrapper
    v-model="content"
    :placeholder="placeholder"
    :preview="false"
    @update:modelValue="handleUpdate"
  />
</template>

<script setup lang="ts">
/**
 * MarkdownEditor - 向後兼容的 Markdown 編輯器組件
 *
 * 此組件現在使用 md-editor-v3 作為底層實現，
 * 但保持原有的 props 接口以確保現有代碼不需修改。
 */
import { ref, watch } from 'vue'
import MdEditorWrapper from './MdEditorWrapper.vue'

// Props - 保持與舊版兼容
export interface Props {
  modelValue?: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '請輸入內容...'
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// State
const content = ref(props.modelValue)

// Watch for external changes
watch(() => props.modelValue, (newVal) => {
  content.value = newVal
})

// Handle update from child component
const handleUpdate = (value: string) => {
  content.value = value
  emit('update:modelValue', value)
}
</script>
