<template>
  <div class="markdown-viewer">
    <div class="markdown-content" v-html="renderedMarkdown"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

interface Props {
  content?: string
}

const props = withDefaults(defineProps<Props>(), {
  content: ''
})

const renderedMarkdown = computed(() => {
  return renderMarkdown(props.content)
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

/* GFM: Tables */
.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 15px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: #f5f5f5;
  font-weight: 600;
}

.markdown-content :deep(tr:nth-child(even)) {
  background: #fafafa;
}

/* GFM: Strikethrough */
.markdown-content :deep(del),
.markdown-content :deep(s) {
  text-decoration: line-through;
  color: #999;
}

/* GFM: Task lists */
.markdown-content :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0;
}

.markdown-content :deep(li.task-list-item) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.markdown-content :deep(input[type="checkbox"]) {
  margin-top: 4px;
}

/* GFM: Blockquote */
.markdown-content :deep(blockquote) {
  border-left: 4px solid #ddd;
  margin: 15px 0;
  padding: 10px 20px;
  background: #f9f9f9;
  color: #666;
}

/* GFM: Horizontal rule */
.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid #ddd;
  margin: 20px 0;
}
</style>