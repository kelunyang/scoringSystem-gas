<template>
  <div class="markdown-viewer">
    <div class="markdown-content" v-html="renderedMarkdown"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeHtml } from '@/utils/sanitize'

interface Props {
  content?: string
}

const props = withDefaults(defineProps<Props>(), {
  content: ''
})

const parseMarkdown = (text: string): string => {
  if (!text) return ''

  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')

    // Bold
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/__(.*?)__/gim, '<strong>$1</strong>')

    // Italic
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/_(.*?)_/gim, '<em>$1</em>')

    // Code blocks
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/`([^`]*)`/gim, '<code>$1</code>')

    // Links
    .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank">$1</a>')

    // Line breaks
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>')

  return `<p>${html}</p>`
}

const renderedMarkdown = computed(() => {
  // 簡單的 Markdown 渲染器 (不使用外部庫)
  const rawHtml = parseMarkdown(props.content)
  // 使用 DOMPurify 防止 XSS 攻擊
  return sanitizeHtml(rawHtml)
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

.markdown-content {
  line-height: 1.6;
  color: #2c3e50;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 20px 0 10px 0;
  font-weight: 600;
}

.markdown-content :deep(h1) {
  font-size: 24px;
  color: #2c3e50;
}

.markdown-content :deep(h2) {
  font-size: 20px;
  color: #34495e;
}

.markdown-content :deep(h3) {
  font-size: 16px;
  color: #34495e;
}

.markdown-content :deep(p) {
  margin: 10px 0;
}

.markdown-content :deep(code) {
  background: #f1f2f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.markdown-content :deep(pre) {
  background: #2c3e50;
  color: #fff;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 15px 0;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
  color: #fff;
}

.markdown-content :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: #2c3e50;
}

.markdown-content :deep(em) {
  font-style: italic;
  color: #7f8c8d;
}
</style>