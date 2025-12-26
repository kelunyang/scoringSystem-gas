<template>
  <div class="ranking-comparison-container">
    <div class="diff-container" v-html="diffHtml"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { html as diff2html } from 'diff2html'
import { createTwoFilesPatch } from 'diff'
import 'diff2html/bundles/css/diff2html.min.css'

const props = defineProps({
  leftTitle: {
    type: String,
    default: '最新版本'
  },
  rightTitle: {
    type: String,
    default: '歷史版本'
  },
  leftItems: {
    type: Array as PropType<any[]>,
    required: true,
    default: () => []
  },
  rightItems: {
    type: Array as PropType<any[]>,
    required: true,
    default: () => []
  },
  itemKey: {
    type: String,
    default: 'id'
  },
  itemLabel: {
    type: String,
    default: 'name'
  },
  itemDisplayFn: {
    type: Function as PropType<(item: any) => string>,
    default: null
  }
})

/**
 * 將排名陣列轉為純文字（每行一個排名）
 */
function rankingsToText(items: any[]): string {
  if (!items || items.length === 0) return ''

  return items.map((item, i) => {
    const label = props.itemDisplayFn
      ? props.itemDisplayFn(item)
      : item[props.itemLabel] || item.groupName || item.name || '未命名'
    return `${i + 1}. ${label}`
  }).join('\n')
}

/**
 * 生成 diff HTML（side-by-side 兩欄對比模式）
 */
const diffHtml = computed(() => {
  const oldText = rankingsToText(props.rightItems)  // 歷史版本（右側 = 舊）
  const newText = rankingsToText(props.leftItems)   // 最新版本（左側 = 新）

  // 如果兩邊都為空，顯示提示
  if (!oldText && !newText) {
    return '<div class="no-data">暫無排名資料</div>'
  }

  const diffText = createTwoFilesPatch(
    props.rightTitle,  // 舊文件名
    props.leftTitle,   // 新文件名
    oldText,
    newText,
    '',
    '',
    { context: 999 }  // 顯示所有行，不折疊
  )

  return diff2html(diffText, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: 'side-by-side',
    renderNothingWhenEmpty: false
  })
})
</script>

<style scoped>
.ranking-comparison-container {
  margin-top: 15px;
}

.diff-container {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
}

/* diff2html 樣式覆寫 */
.diff-container :deep(.d2h-wrapper) {
  font-size: 14px;
}

.diff-container :deep(.d2h-file-header) {
  display: none; /* 隱藏文件頭（我們用自己的標題） */
}

.diff-container :deep(.d2h-file-wrapper) {
  border: none;
  margin: 0;
}

.diff-container :deep(.d2h-diff-table) {
  font-family: inherit;
}

.diff-container :deep(.d2h-code-line-ctn) {
  padding: 8px 12px;
}

.diff-container :deep(.d2h-code-side-linenumber) {
  display: none; /* 隱藏行號（排名本身就是編號） */
}

.diff-container :deep(.d2h-ins) {
  background-color: #d4edda;
}

.diff-container :deep(.d2h-del) {
  background-color: #f8d7da;
}

.diff-container :deep(.d2h-info) {
  display: none; /* 隱藏 @@ 資訊行 */
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #6c757d;
  font-style: italic;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .diff-container :deep(.d2h-code-line-ctn) {
    padding: 6px 8px;
    font-size: 13px;
  }
}
</style>
