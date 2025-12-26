<template>
  <div class="draggable-ranking-list">
    <transition-group
      name="ranking-list"
      tag="div"
      class="ranking-items-container"
    >
      <div
        v-for="(item, index) in localItems"
        :key="getItemKey(item, index)"
        class="ranking-item"
        :class="{
          draggable: !disabled,
          dragging: draggedIndex === index
        }"
        :draggable="!disabled"
        @dragstart="handleDragStart(index, $event)"
        @dragover.prevent="handleDragOver(index)"
        @drop="handleDrop(index)"
        @dragend="handleDragEnd"
      >
        <div class="rank-number">{{ index + 1 }}</div>

        <div class="item-content">
          <slot :item="item" :index="index">
            {{ getItemLabel(item) }}
          </slot>
        </div>

        <div v-if="showActions && !disabled" class="item-actions">
          <button
            class="action-btn small"
            @click="moveUp(index)"
            :disabled="index === 0"
            title="上移"
          >
            <i class="fas fa-chevron-up"></i>
          </button>
          <button
            class="action-btn small"
            @click="moveDown(index)"
            :disabled="index === localItems.length - 1"
            title="下移"
          >
            <i class="fas fa-chevron-down"></i>
          </button>
        </div>
      </div>
    </transition-group>

    <EmptyState
      v-if="localItems.length === 0"
      :icons="['fa-inbox']"
      title="暫無排名資料"
      parent-icon="fa-list-ol"
      :compact="true"
      :enable-animation="false"
    />

    <div v-if="!disabled && localItems.length > 0" class="ranking-hint">
      <i class="fas fa-lightbulb"></i>
      拖拽或使用箭頭按鈕調整排名順序
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import EmptyState from '@/components/shared/EmptyState.vue'

const props = defineProps({
  items: {
    type: Array,
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
  disabled: {
    type: Boolean,
    default: false
  },
  showActions: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:items'])

// 本地副本
const localItems = ref([...props.items])
const draggedIndex = ref<number | null>(null)

// 監聽 props 變化
watch(() => props.items, (newItems) => {
  localItems.value = [...newItems]
}, { deep: true })

// 獲取項目唯一標識
function getItemKey(item: any, index: number) {
  return item[props.itemKey] || `item-${index}`
}

// 獲取項目顯示標籤
function getItemLabel(item: any) {
  return item[props.itemLabel] || item.groupName || item.name || '未命名'
}

// 拖拽開始
function handleDragStart(index: number, event: any) {
  if (props.disabled) return
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/html', event.target.innerHTML)
}

// 拖拽經過
function handleDragOver(index: number) {
  if (props.disabled || draggedIndex.value === null) return

  if (draggedIndex.value !== index) {
    const draggedItem = localItems.value[draggedIndex.value]
    localItems.value.splice(draggedIndex.value, 1)
    localItems.value.splice(index, 0, draggedItem)
    draggedIndex.value = index
  }
}

// 放下
function handleDrop(index: number) {
  if (props.disabled) return
  // 更新排名
  updateRanks()
  // 發出更新事件
  emit('update:items', localItems.value)
}

// 拖拽結束
function handleDragEnd() {
  draggedIndex.value = null
}

// 上移
function moveUp(index: number) {
  if (index <= 0) return
  const item = localItems.value[index]
  localItems.value.splice(index, 1)
  localItems.value.splice(index - 1, 0, item)
  updateRanks()
  emit('update:items', localItems.value)
}

// 下移
function moveDown(index: number) {
  if (index >= localItems.value.length - 1) return
  const item = localItems.value[index]
  localItems.value.splice(index, 1)
  localItems.value.splice(index + 1, 0, item)
  updateRanks()
  emit('update:items', localItems.value)
}

// 更新排名
function updateRanks() {
  localItems.value.forEach((item: any, idx) => {
    if (item.rank !== undefined) {
      item.rank = idx + 1
    }
  })
}
</script>

<style scoped>
.draggable-ranking-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.2s;
  position: relative;
}

.ranking-item.draggable {
  cursor: grab;
}

.ranking-item.draggable:hover {
  border-color: #cbd5e0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.ranking-item.draggable:active {
  cursor: grabbing;
}

.ranking-item.dragging {
  opacity: 0.6;
  transform: rotate(2deg);
  z-index: 1000;
}

.rank-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 18px;
  margin-right: 20px;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.3);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  background: white;
  color: #718096;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
  background: #f7fafc;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
  font-size: 16px;
}

.empty-state i {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.5;
}

.ranking-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7f8c8d;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  background: #f1f3f4;
  border-radius: 8px;
}

.ranking-hint i {
  color: #f39c12;
}

/* Vue transition-group animations */
.ranking-list-move {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.ranking-list-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ranking-list-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(-10px);
}

.ranking-list-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  width: 100%;
}

.ranking-list-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}
</style>
