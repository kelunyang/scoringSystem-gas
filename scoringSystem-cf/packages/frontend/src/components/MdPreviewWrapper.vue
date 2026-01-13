<template>
  <div class="md-preview-wrapper">
    <MdPreview
      :modelValue="processedContent"
      :language="'zh-TW'"
      :noMermaid="true"
      :noKatex="true"
      :sanitize="handleSanitize"
      :showCodeRowNumber="false"
      :previewTheme="'default'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { sanitizeHtml } from '@/utils/sanitize'

/**
 * MdPreviewWrapper - 統一的 Markdown 預覽組件
 *
 * 用於取代 MarkdownViewer.vue，統一使用 md-editor-v3 的 MdPreview
 * 確保編輯器預覽與唯讀顯示的渲染結果一致
 */

export interface Props {
  /** Markdown 內容 */
  content?: string
  /** 前處理函數，用於處理 @mention 等特殊標記 */
  preProcess?: (content: string) => string
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  preProcess: undefined
})

/**
 * 處理後的內容
 * 如果有 preProcess 函數，先進行前處理
 */
const processedContent = computed(() => {
  const raw = props.content || ''
  if (props.preProcess) {
    return props.preProcess(raw)
  }
  return raw
})

/**
 * HTML 消毒處理
 * 使用 DOMPurify 防止 XSS 攻擊
 * 同時保留自訂的 mention 標籤
 */
const handleSanitize = (html: string): string => {
  // 先用 DOMPurify 處理
  // mention 標籤已在 sanitize.ts 的 ALLOWED_TAGS 中允許
  return sanitizeHtml(html)
}
</script>

<style scoped>
.md-preview-wrapper {
  width: 100%;
}

/* 覆寫 md-preview 預設樣式以符合現有設計 */
.md-preview-wrapper :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.md-preview-wrapper :deep(.md-editor-preview) {
  /* 移除預設 padding */
  padding: 0;
}

/* Headers */
.md-preview-wrapper :deep(h1),
.md-preview-wrapper :deep(h2),
.md-preview-wrapper :deep(h3) {
  margin: 16px 0 8px 0;
  color: #2c3e50;
}

.md-preview-wrapper :deep(h1) {
  font-size: 20px;
  border-bottom: 2px solid #e1e8ed;
  padding-bottom: 6px;
}

.md-preview-wrapper :deep(h2) {
  font-size: 18px;
  border-bottom: 1px solid #e1e8ed;
  padding-bottom: 4px;
}

.md-preview-wrapper :deep(h3) {
  font-size: 16px;
}

/* Text formatting */
.md-preview-wrapper :deep(strong) {
  font-weight: 600;
}

.md-preview-wrapper :deep(em) {
  font-style: italic;
}

/* Code */
.md-preview-wrapper :deep(code) {
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.md-preview-wrapper :deep(pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
}

.md-preview-wrapper :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* 隱藏代碼塊頭部的語言標籤和複製按鈕 */
.md-preview-wrapper :deep(.md-editor-code-action) {
  display: none;
}

/* Links */
.md-preview-wrapper :deep(a) {
  display: inline !important;
  word-break: break-all;
  color: #007bff;
  text-decoration: none;
}

.md-preview-wrapper :deep(a:hover) {
  text-decoration: underline;
}

/* Lists */
.md-preview-wrapper :deep(ul),
.md-preview-wrapper :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.md-preview-wrapper :deep(li) {
  margin: 4px 0;
}

/* Blockquote */
.md-preview-wrapper :deep(blockquote) {
  border-left: 4px solid #e1e8ed;
  margin: 12px 0;
  padding: 8px 16px;
  color: #666;
  background: #f8f9fa;
}

/* Tables */
.md-preview-wrapper :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}

.md-preview-wrapper :deep(th),
.md-preview-wrapper :deep(td) {
  border: 1px solid #e1e8ed;
  padding: 8px 12px;
  text-align: left;
}

.md-preview-wrapper :deep(th) {
  background: #f8f9fa;
  font-weight: 600;
}

/* Task lists */
.md-preview-wrapper :deep(input[type="checkbox"]) {
  margin-right: 6px;
}

/* @mention 高亮樣式 */
.md-preview-wrapper :deep(mention),
.md-preview-wrapper :deep(.mention) {
  background: #e8f5e8;
  color: #2e7d2e;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  display: inline;
  cursor: help; /* 提示可 hover 查看 email */
}

/* Horizontal rule */
.md-preview-wrapper :deep(hr) {
  border: none;
  border-top: 1px solid #e1e8ed;
  margin: 16px 0;
}

/* Paragraphs */
.md-preview-wrapper :deep(p) {
  margin: 8px 0;
  line-height: 1.6;
}

.md-preview-wrapper :deep(p:first-child) {
  margin-top: 0;
}

.md-preview-wrapper :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
