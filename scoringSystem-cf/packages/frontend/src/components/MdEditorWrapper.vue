<template>
  <div class="md-editor-wrapper" @keydown.esc.capture="handleEscKey">
    <MdEditor
      ref="mdEditorRef"
      v-model="content"
      :preview="showPreview"
      :toolbars="toolbarConfig"
      :footers="footerConfig"
      :placeholder="placeholder"
      :language="'zh-TW'"
      :show-code-row-number="false"
      :no-mermaid="true"
      :no-katex="true"
      :style="editorStyle"
      :custom-icon="customIcon"
      @on-change="handleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { MdEditor, config, type ToolbarNames, type Footers, type CustomIcon, type ExposeParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

// 停用 linkShortener 擴充功能，避免長網址被折疊顯示為 "..."
// 參考: https://github.com/imzbf/md-editor-v3/issues/972
config({
  codeMirrorExtensions(extensions) {
    return extensions.filter(item => item.type !== 'linkShortener')
  }
})

// FontAwesome icon mapping - 只映射 toolbarConfig 用到的圖示
// Note: image upload is intentionally disabled
const customIcon: CustomIcon = {
  bold: { component: '<i class="fas fa-bold"></i>' },
  italic: { component: '<i class="fas fa-italic"></i>' },
  'strike-through': { component: '<i class="fas fa-strikethrough"></i>' },
  'unordered-list': { component: '<i class="fas fa-list-ul"></i>' },
  'ordered-list': { component: '<i class="fas fa-list-ol"></i>' },
  task: { component: '<i class="fas fa-tasks"></i>' },
  link: { component: '<i class="fas fa-link"></i>' },
  preview: { component: '<i class="fas fa-eye"></i>' }
}

// Props
export interface Props {
  modelValue?: string
  placeholder?: string
  preview?: boolean
  enableMention?: boolean
  minHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '請輸入內容...',
  preview: false,
  enableMention: false,
  minHeight: '120px'  // 約 4 行高度
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'mention-trigger': [payload: { query: string; cursorPosition: number; screenPosition?: { x: number; y: number } }]
  'mention-close': []
}>()

// State
const mdEditorRef = ref<ExposeParam>()
const content = ref(props.modelValue)
const showPreview = ref(props.preview)
// Track the @ trigger range (in CodeMirror document positions) for mention insertion.
// atPos = position of the '@'; caret = caret position when the dropdown was triggered.
const mentionRange = ref<{ atPos: number; caret: number } | null>(null)

// Get the underlying CodeMirror EditorView (md-editor-v3 v6 is CodeMirror 6 based)
const getView = () => mdEditorRef.value?.getEditorView()

// Watch for external changes
watch(() => props.modelValue, (newVal) => {
  if (newVal !== content.value) {
    content.value = newVal
  }
})

watch(() => props.preview, (newVal) => {
  showPreview.value = newVal
})

// Toolbar configuration - 簡化版工具列
// Note: image upload is intentionally disabled
const toolbarConfig = computed<ToolbarNames[]>(() => [
  'bold',
  'italic',
  'strikeThrough',
  '-',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'link',
  '-',
  'preview'
])

// Footer configuration - 字數統計
const footerConfig = computed<Footers[]>(() => ['markdownTotal'])

// Editor style - 控制高度
const editorStyle = computed(() => ({
  minHeight: props.minHeight,
  resize: 'vertical' as const
}))

// Event handlers
const handleChange = (newContent: string) => {
  content.value = newContent
  emit('update:modelValue', newContent)

  // Handle mention detection here (onChange has the correct new content)
  if (props.enableMention) {
    detectMention()
  }
}

// Detect @ mentions based on the real caret position (not lastIndexOf),
// so mentions can be inserted anywhere in the text, including the middle.
const detectMention = () => {
  const view = getView()
  if (!view) {
    mentionRange.value = null
    emit('mention-close')
    return
  }

  const caret = view.state.selection.main.head
  const doc = view.state.doc.toString()

  // Scan backwards from the caret to find the start of the mention token.
  // Stop at whitespace (no active mention) or at '@' (potential trigger).
  let i = caret - 1
  while (i >= 0 && !/\s/.test(doc[i]) && doc[i] !== '@') i--

  // Require a '@' immediately starting the token, and that '@' must sit at a
  // word boundary (start of doc or preceded by whitespace) to avoid emails
  // like "a@b.com" falsely triggering the mention dropdown.
  const prevChar = i > 0 ? doc[i - 1] : ''
  const atBoundary = i === 0 || /\s/.test(prevChar)
  if (i < 0 || doc[i] !== '@' || !atBoundary) {
    mentionRange.value = null
    emit('mention-close')
    return
  }

  const atPos = i
  const query = doc.slice(atPos + 1, caret)
  mentionRange.value = { atPos, caret }

  // Get the '@' screen position from CodeMirror for accurate dropdown placement
  let screenPosition: { x: number; y: number } | undefined
  const coords = view.coordsAtPos(atPos)
  if (coords) {
    screenPosition = { x: coords.left, y: coords.bottom }
  }

  emit('mention-trigger', {
    query,
    cursorPosition: atPos,
    screenPosition
  })
}

// ESC key handling - 攔截以防止關閉外層 Drawer/Modal
const handleEscKey = (e: KeyboardEvent) => {
  // 保留輸入法組字取消功能
  if (e.isComposing) return

  e.preventDefault()
  e.stopPropagation()
}

// Expose methods for parent components
defineExpose({
  insertText: (text: string) => {
    content.value += text
    emit('update:modelValue', content.value)
  },
  getContent: () => content.value,
  setContent: (text: string) => {
    content.value = text
    emit('update:modelValue', text)
  },
  /**
   * Insert mention text, replacing @query with @mentionText
   * @param mentionText - The mention text to insert (without @)
   */
  insertMention: (mentionText: string) => {
    const view = getView()
    const insertText = `@${mentionText} `

    if (view && mentionRange.value) {
      // Replace the "@query" range (from the '@' to the caret) with the mention,
      // leaving any text after the caret untouched. Move the caret after the insert.
      const { atPos, caret } = mentionRange.value
      view.dispatch({
        changes: { from: atPos, to: caret, insert: insertText },
        selection: { anchor: atPos + insertText.length }
      })
      view.focus()
      // dispatch triggers onChange -> handleChange syncs content/model
    } else {
      // Fallback: no editor view available, just append
      content.value += insertText
      emit('update:modelValue', content.value)
    }
    mentionRange.value = null
    emit('mention-close')
  },
  /**
   * Close mention dropdown without inserting
   */
  closeMention: () => {
    mentionRange.value = null
    emit('mention-close')
  }
})
</script>

<style scoped>
.md-editor-wrapper {
  width: 100%;
}

/* 覆寫 md-editor 預設樣式以符合現有設計 */
.md-editor-wrapper :deep(.md-editor) {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

/* 讓編輯區域可以垂直拉伸 */
.md-editor-wrapper :deep(.md-editor-content) {
  min-height: 80px;
}

.md-editor-wrapper :deep(.md-editor-toolbar) {
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
}

.md-editor-wrapper :deep(.md-editor-footer) {
  background: #f8f9fa;
  border-top: 1px solid #ddd;
  padding: 6px 12px;
  font-size: 12px;
  color: #666;
}

/* 隱藏不需要的工具列項目 */
.md-editor-wrapper :deep(.md-editor-toolbar-item[title*="fullscreen"]),
.md-editor-wrapper :deep(.md-editor-toolbar-item[title*="catalog"]),
.md-editor-wrapper :deep(.md-editor-toolbar-item[title*="github"]) {
  display: none !important;
}

/* 放大 FontAwesome 工具列圖示 */
.md-editor-wrapper :deep(.md-editor-toolbar-item i) {
  font-size: 16px;
}

/* 預覽區樣式 - 與 StageComments.vue 保持一致 */
.md-editor-wrapper :deep(.md-editor-preview-wrapper) {
  /* Headers */
  h1, h2, h3 {
    margin: 16px 0 8px 0;
    color: #2c3e50;
  }

  h1 {
    font-size: 20px;
    border-bottom: 2px solid #e1e8ed;
    padding-bottom: 6px;
  }

  h2 {
    font-size: 18px;
    border-bottom: 1px solid #e1e8ed;
    padding-bottom: 4px;
  }

  h3 {
    font-size: 16px;
  }

  /* Text formatting */
  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }

  /* Code */
  code {
    background: #f5f5f5;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  pre {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
  }

  pre code {
    background: none;
    padding: 0;
    border-radius: 0;
  }

  /* Links - 覆蓋 md-editor-v3 default-theme 的 inline-flex 導致長網址顯示為 "..." 的問題 */
  a {
    display: inline !important;
    word-break: break-all;
    color: #007bff;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  /* Lists */
  ul, ol {
    padding-left: 20px;
    margin: 8px 0;
  }

  li {
    margin: 4px 0;
  }

  /* Blockquote */
  blockquote {
    border-left: 4px solid #e1e8ed;
    margin: 12px 0;
    padding: 8px 16px;
    color: #666;
    background: #f8f9fa;
  }
}
</style>
