<template>
  <div class="transfer-container" :class="{ disabled: props.disabled }">
    <!-- 左侧：可选评论 -->
    <div class="transfer-panel left-panel">
      <div class="panel-header">
        <h3>可选评论 ({{ availableItems.length }})</h3>
      </div>

      <!-- 提示信息 -->
      <el-alert
        v-if="hasDisabledItems"
        title="为了公平起见，如果一个用户有多个评论，你只能从中挑选一个"
        type="info"
        :closable="false"
        style="margin: 10px;"
      />

      <transition-group name="available" tag="div" class="panel-body">
        <div
          v-for="item in availableItems"
          :key="item[itemKey]"
          class="item-card"
          :class="{ disabled: isItemDisabled(item) }"
          @click="!props.disabled && !isItemDisabled(item) && moveToSelected(item)"
        >
          <div class="item-content">
            <div class="content-text" v-if="!isExpanded(item)">
              {{ truncateContent(item[displayFields.content]) }}
              <a
                v-if="itemNeedsTruncation(item)"
                @click.stop="toggleExpand(item)"
                class="show-more-link"
              >
                點擊看更多
              </a>
            </div>
            <div class="content-expanded" v-else>
              <MdPreviewWrapper :content="getItemContent(item)" class="markdown-content" />
              <a @click.stop="toggleExpand(item)" class="collapse-link">摺疊評論</a>
            </div>
            <div class="item-meta">
              {{ getAuthorDisplay(item) }} · {{ formatTime(item[displayFields.timestamp]) }}
            </div>
          </div>
          <div class="move-icon" v-if="!isItemDisabled(item)">→</div>
        </div>

        <EmptyState
          v-if="availableItems.length === 0"
          key="empty-state"
          :icons="['fa-check-circle']"
          title="所有评论都已选择"
          parent-icon="fa-list-check"
          :compact="true"
          :enable-animation="false"
        />
      </transition-group>
    </div>

    <!-- 中间：操作按钮 -->
    <div class="transfer-actions">
      <button
        class="action-btn"
        @click="moveAllToSelected"
        :disabled="props.disabled || !canMoveAnyToSelected"
        title="全部移到右边"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M13 17L18 12L13 7M6 17L11 12L6 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button
        class="action-btn"
        @click="moveAllToAvailable"
        :disabled="props.disabled || selectedItems.length === 0"
        title="全部移到左边"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M11 17L6 12L11 7M18 17L13 12L18 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- 右侧：已选评论（可排序） -->
    <div class="transfer-panel right-panel">
      <div class="panel-header">
        <h3>已选评论排序 ({{ selectedItems.length }}/{{ maxSelections }})</h3>
        <span class="hint">拖拽排序，第1名在最上方</span>
      </div>

      <transition-group name="selected" tag="div" class="panel-body">
        <div
          v-for="(item, index) in selectedItems"
          :key="item[itemKey]"
          class="item-card selected-item"
          :class="{ dragging: draggedIndex === index }"
          :draggable="!props.disabled"
          @dragstart="!props.disabled && handleDragStart(index, $event)"
          @dragover.prevent
          @drop="!props.disabled && handleDrop(index, $event)"
          @dragend="draggedIndex = null"
        >
          <div class="rank-badge">{{ index + 1 }}</div>
          <div class="item-content">
            <div class="content-text" v-if="!isExpanded(item)">
              {{ truncateContent(item[displayFields.content]) }}
              <a
                v-if="itemNeedsTruncation(item)"
                @click.stop="toggleExpand(item)"
                class="show-more-link"
              >
                點擊看更多
              </a>
            </div>
            <div class="content-expanded" v-else>
              <MdPreviewWrapper :content="getItemContent(item)" class="markdown-content" />
              <a @click.stop="toggleExpand(item)" class="collapse-link">摺疊評論</a>
            </div>
            <div class="item-meta">
              {{ getAuthorDisplay(item) }} · {{ formatTime(item[displayFields.timestamp]) }}
            </div>
          </div>
          <div class="item-actions">
            <button @click="moveUp(index)" :disabled="props.disabled || index === 0" title="上移">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 15L12 9L6 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button @click="moveDown(index)" :disabled="props.disabled || index === selectedItems.length - 1" title="下移">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button @click="moveToAvailable(item)" :disabled="props.disabled" class="remove-btn" title="移除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <EmptyState
          v-if="selectedItems.length === 0"
          key="empty-state-selected"
          :icons="['fa-hand-paper']"
          title="请从左侧选择评论"
          parent-icon="fa-hand-point-left"
          :compact="true"
          :enable-animation="false"
        />
      </transition-group>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, type PropType } from 'vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'

// Types
interface DisplayFields {
  content: string
  author: string
  timestamp: string
}

interface CommentItem {
  [key: string]: any
}

interface DuplicateDetectedPayload {
  field: string
  value: any
}

// Props
const props = withDefaults(defineProps<{
  items: CommentItem[]
  itemKey?: string
  uniqueByField?: string
  displayFields?: DisplayFields
  maxSelections: number  // Required: dynamically passed from parent (loaded from project config)
  initialSelected?: CommentItem[]
  disabled?: boolean  // Preview mode: disable all interactions
  authorDisplayFn?: (item: CommentItem) => string  // Custom author display function
}>(), {
  itemKey: 'id',
  uniqueByField: 'authorEmail',
  displayFields: () => ({
    content: 'content',
    author: 'author',
    timestamp: 'timestamp'
  }),
  initialSelected: () => [],
  disabled: false,
  authorDisplayFn: undefined
})

// Emits
const emit = defineEmits<{
  'update:selected': [items: CommentItem[]]
  'duplicate-detected': [payload: DuplicateDetectedPayload]
  'max-limit-reached': []
}>()

// State
const availableItems = ref<CommentItem[]>([])
const selectedItems = ref<CommentItem[]>([])
const draggedIndex = ref<number | null>(null)
const expandedItemIds = ref<Set<string>>(new Set())

// Computed
const hasDisabledItems = computed(() => {
  return availableItems.value.some(item => isItemDisabled(item))
})

const canMoveAnyToSelected = computed(() => {
  if (selectedItems.value.length >= props.maxSelections) return false
  return availableItems.value.some(item => !isItemDisabled(item))
})

// Methods

/**
 * 獲取作者顯示文字（支持自訂顯示函數）
 */
const getAuthorDisplay = (item: CommentItem): string => {
  if (props.authorDisplayFn) {
    return props.authorDisplayFn(item)
  }
  return item[props.displayFields.author] || ''
}

const isItemDisabled = (item: CommentItem): boolean => {
  const uniqueValue = item[props.uniqueByField]
  return selectedItems.value.some(
    selected => selected[props.uniqueByField] === uniqueValue
  )
}

const moveToSelected = (item: CommentItem): void => {
  // 检查数量限制
  if (selectedItems.value.length >= props.maxSelections) {
    emit('max-limit-reached')
    return
  }

  // 检查唯一性限制
  if (isItemDisabled(item)) {
    emit('duplicate-detected', {
      field: props.uniqueByField,
      value: item[props.uniqueByField]
    })
    return
  }

  // 执行移动
  availableItems.value = availableItems.value.filter(
    i => i[props.itemKey] !== item[props.itemKey]
  )
  selectedItems.value.push(item)
  emit('update:selected', selectedItems.value)
}

const moveToAvailable = (item: CommentItem): void => {
  selectedItems.value = selectedItems.value.filter(
    i => i[props.itemKey] !== item[props.itemKey]
  )
  availableItems.value.push(item)
  emit('update:selected', selectedItems.value)
}

const moveAllToSelected = (): void => {
  // 防禦性檢查：確保 availableItems 是陣列
  if (!Array.isArray(availableItems.value)) {
    return
  }

  const eligibleItems = availableItems.value.filter(item => !isItemDisabled(item))
  const canMove = Math.min(
    eligibleItems.length,
    props.maxSelections - selectedItems.value.length
  )
  const toMove = eligibleItems.slice(0, canMove)

  availableItems.value = availableItems.value.filter(
    item => !toMove.includes(item)
  )
  selectedItems.value.push(...toMove)
  emit('update:selected', selectedItems.value)
}

const moveAllToAvailable = (): void => {
  availableItems.value.push(...selectedItems.value)
  selectedItems.value = []
  emit('update:selected', selectedItems.value)
}

const moveUp = (index: number): void => {
  if (index <= 0) return
  const items = [...selectedItems.value]
  const item = items.splice(index, 1)[0]
  items.splice(index - 1, 0, item)
  selectedItems.value = items
  emit('update:selected', selectedItems.value)
}

const moveDown = (index: number): void => {
  if (index >= selectedItems.value.length - 1) return
  const items = [...selectedItems.value]
  const item = items.splice(index, 1)[0]
  items.splice(index + 1, 0, item)
  selectedItems.value = items
  emit('update:selected', selectedItems.value)
}

const handleDragStart = (index: number, event: DragEvent): void => {
  draggedIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const handleDrop = (dropIndex: number, event: DragEvent): void => {
  event.preventDefault()
  if (draggedIndex.value === null || draggedIndex.value === dropIndex) return

  const items = [...selectedItems.value]
  const draggedItem = items[draggedIndex.value]
  items.splice(draggedIndex.value, 1)

  const insertIndex = dropIndex > draggedIndex.value ? dropIndex - 1 : dropIndex
  items.splice(insertIndex, 0, draggedItem)

  selectedItems.value = items
  emit('update:selected', selectedItems.value)
  draggedIndex.value = null
}

const formatTime = (timestamp: string | number | Date): string => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-TW')
}

/**
 * 檢查項目是否展開
 */
const isExpanded = (item: CommentItem): boolean => {
  return expandedItemIds.value.has(item[props.itemKey])
}

/**
 * 切換項目展開/收合狀態
 */
const toggleExpand = (item: CommentItem): void => {
  const itemId = item[props.itemKey]
  if (expandedItemIds.value.has(itemId)) {
    expandedItemIds.value.delete(itemId)
  } else {
    expandedItemIds.value.add(itemId)
  }
  // 觸發響應式更新
  expandedItemIds.value = new Set(expandedItemIds.value)
}

/**
 * 取得項目的 Markdown 內容
 * 優先使用 fullContent（完整內容），若無則使用 displayFields.content
 */
const getItemContent = (item: CommentItem): string => {
  return item.fullContent || item[props.displayFields.content] || ''
}

const truncateContent = (content: string, maxLength: number = 10): string => {
  if (!content || content.length <= maxLength) return content
  return content.substring(0, maxLength)
}

const needsTruncation = (content: string, maxLength: number = 10): boolean => {
  return !!(content && content.length > maxLength)
}

/**
 * 檢查項目是否需要展開（有完整內容且比截斷內容長）
 */
const itemNeedsTruncation = (item: CommentItem): boolean => {
  const displayContent = item[props.displayFields.content]
  const fullContent = item.fullContent
  // 如果有 fullContent 且比 display 內容長，就需要展開
  if (fullContent && fullContent.length > displayContent.length) {
    return true
  }
  // 否則檢查 display 內容是否超過截斷長度
  return needsTruncation(displayContent)
}

// Watchers
watch(() => props.items, (newItems) => {
  // 防禦性檢查：確保 newItems 是陣列
  if (!Array.isArray(newItems)) {
    availableItems.value = []
    return
  }

  const selectedIds = new Set(selectedItems.value.map(item => item[props.itemKey]))
  availableItems.value = newItems.filter(item => !selectedIds.has(item[props.itemKey]))
}, { immediate: true })

watch(() => props.initialSelected, (newSelected) => {
  // 支持清空操作：移除 length > 0 检查
  if (newSelected !== undefined && newSelected !== null) {
    selectedItems.value = [...newSelected]
    // 防禦性檢查：確保 items 是陣列
    if (!Array.isArray(props.items)) {
      availableItems.value = []
      return
    }
    const selectedIds = new Set(newSelected.map(item => item[props.itemKey]))
    availableItems.value = props.items.filter(item => !selectedIds.has(item[props.itemKey]))
  }
}, { immediate: true })
</script>

<style scoped>
.transfer-container {
  display: flex;
  gap: 20px;
  padding: 0 25px;
  min-height: 400px;
  flex: 1;
}

.transfer-panel {
  flex: 1;
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.panel-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.hint {
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 4px;
  display: block;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.item-card {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  margin-bottom: 8px;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  background: white;
}

.item-card:hover:not(.disabled):not(.selected-item) {
  border-color: #3498db;
  background: #f0f8ff;
  transform: translateX(2px);
}

/* 禁用状态 - 关键样式 */
.item-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
}

.item-card.disabled:hover {
  border-color: #e1e8ed;
  background: #f5f5f5;
  transform: none;
}

.selected-item {
  border-color: #28a745;
  background: #f8fff9;
  cursor: grab;
}

.selected-item:active {
  cursor: grabbing;
}

.selected-item.dragging {
  opacity: 0.5;
  transform: rotate(2deg);
}

.item-content {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.content-text {
  font-size: 14px;
  line-height: 1.4;
  color: #2c3e50;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.item-meta {
  font-size: 11px;
  color: #7f8c8d;
}

.move-icon {
  color: #666;
  padding: 0 8px;
  font-size: 16px;
}

.rank-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  margin-right: 12px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-actions button {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: #2c3e50;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
}

.item-actions button:hover:not(:disabled) {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.item-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.item-actions .remove-btn {
  color: #dc3545;
}

.item-actions .remove-btn:hover:not(:disabled) {
  background: #f8d7da;
  border-color: #dc3545;
}

.transfer-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 20px 0;
}

.action-btn {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #2c3e50;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  color: #7f8c8d;
  padding: 40px 20px;
  font-style: italic;
}

/* 點擊看更多連結 */
.show-more-link {
  color: #3498db;
  font-size: 12px;
  margin-left: 4px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.show-more-link:hover {
  text-decoration: underline;
}

/* 展開內容區域 */
.content-expanded {
  padding: 10px 0;
}

/* 摺疊評論連結 */
.collapse-link {
  color: #e74c3c;
  font-size: 12px;
  margin-left: 4px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.collapse-link:hover {
  text-decoration: underline;
}

/* Markdown 內容樣式 */
.markdown-content {
  line-height: 1.6;
  color: #2c3e50;
  padding: 10px;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 20px 0 10px 0;
  font-weight: 600;
}

.markdown-content :deep(h1) {
  font-size: 24px;
}

.markdown-content :deep(h2) {
  font-size: 20px;
}

.markdown-content :deep(h3) {
  font-size: 16px;
}

.markdown-content :deep(code) {
  background: #f1f2f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
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
}

.markdown-content :deep(p) {
  margin: 10px 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 10px 0;
  padding-left: 30px;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #3498db;
  padding-left: 15px;
  margin: 15px 0;
  color: #7f8c8d;
  font-style: italic;
}

@media (max-width: 768px) {
  .transfer-container {
    flex-direction: column;
    gap: 15px;
  }

  .transfer-actions {
    flex-direction: row;
    justify-content: center;
  }

  .item-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .item-actions {
    flex-direction: row;
    width: 100%;
    justify-content: flex-end;
  }
}

/* ========== 方向性过渡动画 ========== */

/* 候选区动画（左侧） */
.available-move {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.available-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性效果 */
}

.available-enter-from {
  opacity: 0;
  transform: translateX(30px); /* 从右边进入（从已选区返回） */
}

.available-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  width: calc(100% - 20px);
}

.available-leave-to {
  opacity: 0;
  transform: translateX(30px); /* 往右边消失（移动到已选区） */
}

/* 已选区动画（右侧） */
.selected-move {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.selected-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性效果 */
}

.selected-enter-from {
  opacity: 0;
  transform: translateX(-30px); /* 从左边进入（从候选区选择） */
}

.selected-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  width: calc(100% - 20px);
}

.selected-leave-to {
  opacity: 0;
  transform: translateX(-30px); /* 往左边消失（移回候选区） */
}

/* ========== 禁用狀態（預覽模式） ========== */

.transfer-container.disabled {
  pointer-events: none;
  opacity: 0.65;
  position: relative;
  user-select: none;

  &::after {
    content: '唯讀預覽模式';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 28px;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.15);
    z-index: 101;
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.8),
      0 2px 4px rgba(0, 0, 0, 0.2);
    letter-spacing: 2px;
    pointer-events: none;
  }
}
</style>
