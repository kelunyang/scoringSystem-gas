<template>
  <div class="markdown-viewer">
    <MdPreviewWrapper :content="content" />
  </div>
</template>

<script setup lang="ts">
import MdPreviewWrapper from './MdPreviewWrapper.vue'

/**
 * MarkdownViewer - Markdown 唯讀顯示組件
 *
 * 這是一個向後相容的包裝器，內部使用 MdPreviewWrapper
 * 保持與舊版 API 相容，現有使用處不需要修改
 */

interface Props {
  content?: string
}

withDefaults(defineProps<Props>(), {
  content: ''
})
</script>

<style scoped>
.markdown-viewer {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e1e8ed;
  margin-top: 15px;
}

/* 覆寫 MdPreviewWrapper 的樣式以符合 MarkdownViewer 的外觀 */
.markdown-viewer :deep(.md-preview-wrapper) {
  /* 繼承父容器樣式 */
}

/* 調整 pre/code 樣式以符合原本的深色背景風格 */
.markdown-viewer :deep(pre) {
  background: #2c3e50;
  color: #fff;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 15px 0;
}

.markdown-viewer :deep(pre code) {
  background: none;
  padding: 0;
  color: #fff;
}

/* 調整 heading 樣式 */
.markdown-viewer :deep(h1) {
  font-size: 24px;
  color: #2c3e50;
  margin: 20px 0 10px 0;
}

.markdown-viewer :deep(h2) {
  font-size: 20px;
  color: #34495e;
  margin: 20px 0 10px 0;
}

.markdown-viewer :deep(h3) {
  font-size: 16px;
  color: #34495e;
  margin: 20px 0 10px 0;
}

/* 調整連結顏色 */
.markdown-viewer :deep(a) {
  color: #3498db;
}

/* 調整 em 樣式 */
.markdown-viewer :deep(em) {
  font-style: italic;
  color: #7f8c8d;
}

/* GFM: Strikethrough */
.markdown-viewer :deep(del),
.markdown-viewer :deep(s) {
  text-decoration: line-through;
  color: #999;
}

/* GFM: Task lists */
.markdown-viewer :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0;
}

.markdown-viewer :deep(li.task-list-item) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

/* GFM: Table alternating rows */
.markdown-viewer :deep(tr:nth-child(even)) {
  background: #fafafa;
}
</style>
