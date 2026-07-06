<template>
  <div class="draggable-ranking-list" :class="{ disabled: disabled }">
    <transition-group
      name="ranking-list"
      tag="div"
      class="ranking-items-container"
    >
      <div
        v-for="(bar, index) in bars"
        :key="bar.id"
        class="ranking-item"
        :class="{
          draggable: !disabled,
          dragging: draggedIndex === index,
          'group-bar': bar.members.length > 1
        }"
        :draggable="!disabled"
        @dragstart="handleDragStart(index, $event)"
        @dragover.prevent="handleDragOver(index)"
        @drop="handleDrop(index)"
        @dragend="handleDragEnd"
      >
        <!-- 勾選框（僅同名模式） -->
        <el-checkbox
          v-if="enableGrouping && !disabled"
          class="select-checkbox"
          :model-value="selectedBarIds.has(bar.id)"
          @change="toggleSelect(bar.id)"
          @click.stop
        />

        <!-- 名次徽章：群組顯示 mid-rank（並列第 N），單列顯示整數名次 -->
        <div class="rank-number" :class="{ tied: bar.members.length > 1 }">
          {{ displayRank(index) }}
        </div>

        <!-- 群組列：摘要 + 數量 badge + 解散鈕 -->
        <div v-if="bar.members.length > 1" class="item-content group-content">
          <el-badge :value="bar.members.length" type="primary" class="group-count-badge" />
          <div class="group-summary">
            <span class="group-tied-label">同名</span>
            <span class="group-members">{{ groupMembersLabel(bar) }}</span>
          </div>
        </div>

        <!-- 單列：沿用 slot 渲染原本內容 -->
        <div v-else class="item-content">
          <slot :item="bar.members[0]" :index="index">
            {{ getItemLabel(bar.members[0]) }}
          </slot>
        </div>

        <div class="item-actions">
          <button
            v-if="enableGrouping && bar.members.length > 1 && !disabled"
            class="action-btn small dissolve-btn"
            title="解散群組"
            @click.stop="ungroup(index)"
          >
            <i class="fas fa-object-ungroup"></i>
          </button>
          <template v-if="showActions && !disabled">
            <button
              class="action-btn small"
              :disabled="index === 0"
              title="上移"
              @click="moveUp(index)"
            >
              <i class="fas fa-chevron-up"></i>
            </button>
            <button
              class="action-btn small"
              :disabled="index === bars.length - 1"
              title="下移"
              @click="moveDown(index)"
            >
              <i class="fas fa-chevron-down"></i>
            </button>
          </template>
        </div>
      </div>
    </transition-group>

    <EmptyState
      v-if="bars.length === 0"
      :icons="['fa-inbox']"
      title="暫無排名資料"
      parent-icon="fa-list-ol"
      :compact="true"
      :enable-animation="false"
    />

    <!-- 群組操作列（僅同名模式） -->
    <div v-if="enableGrouping && !disabled && bars.length > 0" class="group-toolbar">
      <el-button
        type="primary"
        :disabled="!canGroup"
        @click="groupSelected"
      >
        <i class="fas fa-object-group"></i>
        群組 ({{ selectedBarIds.size }})
      </el-button>
      <span v-if="selectedBarIds.size >= 2 && !canGroup" class="group-hint warning">
        <i class="fas fa-exclamation-triangle"></i>
        不能把全部項目併成單一同名群組
      </span>
      <span v-else class="group-hint">
        <i class="fas fa-lightbulb"></i>
        勾選 2 個以上看不出差異的項目，按「群組」標記為同名
      </span>
    </div>

    <div v-else-if="!disabled && bars.length > 0" class="ranking-hint">
      <i class="fas fa-lightbulb"></i>
      拖拽或使用箭頭按鈕調整排名順序
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { denseRanksToMidRanks } from '@repo/shared'
import EmptyState from '@/components/shared/EmptyState.vue'

interface Bar {
  id: string
  members: any[]
}

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
  },
  // 是否啟用「同名」群組打包功能（僅 submission 排名輸入啟用）
  enableGrouping: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:items'])

const bars = ref<Bar[]>([])
const draggedIndex = ref<number | null>(null)
const selectedBarIds = ref<Set<string>>(new Set())

let barSeq = 0
function nextBarId(): string {
  barSeq += 1
  return `bar-${barSeq}`
}

// 取得項目唯一標識
function getItemKey(item: any, index: number) {
  return item?.[props.itemKey] ?? `item-${index}`
}

// 取得項目顯示標籤
function getItemLabel(item: any) {
  return item?.[props.itemLabel] || item?.groupName || item?.name || '未命名'
}

/**
 * 由 props.items 重建 bars。
 * 若項目已帶相同 rank（重新載入已存的同名排名），則合併為群組 bar。
 */
function buildBarsFromItems(items: any[]): Bar[] {
  if (!Array.isArray(items) || items.length === 0) return []

  // 是否有可用的 rank 欄位可據以分組
  const hasRanks = items.every(it => typeof it?.rank === 'number')
  if (!hasRanks) {
    return items.map(it => ({ id: nextBarId(), members: [it] }))
  }

  // 依 rank 分組（rank 相同 = 同名），並依 rank 排序
  const byRank = new Map<number, any[]>()
  for (const it of items) {
    const r = it.rank as number
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(it)
  }
  return Array.from(byRank.keys())
    .sort((a, b) => a - b)
    .map(r => ({ id: nextBarId(), members: byRank.get(r)! }))
}

watch(
  () => props.items,
  (newItems) => {
    bars.value = buildBarsFromItems(newItems as any[])
    // 清掉已不存在的選取
    const validIds = new Set(bars.value.map(b => b.id))
    selectedBarIds.value = new Set(
      Array.from(selectedBarIds.value).filter(id => validIds.has(id))
    )
  },
  { deep: true, immediate: true }
)

// 每個 bar 的 dense rank（tier）= bar 索引 + 1
function denseRankMap(): Record<string, number> {
  const map: Record<string, number> = {}
  bars.value.forEach((bar, idx) => {
    bar.members.forEach(m => {
      map[String(getItemKey(m, idx))] = idx + 1
    })
  })
  return map
}

// 顯示名次：群組取 mid-rank（如 2.5 → 顯示「並列第 2.5」），單列取整數
function displayRank(index: number): string {
  const bar = bars.value[index]
  if (bar.members.length === 1) {
    return String(index + 1)
  }
  const mid = denseRanksToMidRanks(denseRankMap())
  const key = String(getItemKey(bar.members[0], index))
  const value = mid[key]
  const text = Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
  return `並列第 ${text}`
}

// 群組成員標籤縮寫：最多顯示兩個，其餘以 +N 表示
function groupMembersLabel(bar: Bar): string {
  const labels = bar.members.map(m => getItemLabel(m))
  if (labels.length <= 2) return labels.join('、')
  return `${labels.slice(0, 2).join('、')} +${labels.length - 2}`
}

const totalItems = computed(() =>
  bars.value.reduce((sum, b) => sum + b.members.length, 0)
)

// 至少選 2 個 bar，且不能把全部項目併成單一群組
const canGroup = computed(() => {
  if (selectedBarIds.value.size < 2) return false
  const selectedMemberCount = bars.value
    .filter(b => selectedBarIds.value.has(b.id))
    .reduce((sum, b) => sum + b.members.length, 0)
  return selectedMemberCount < totalItems.value
})

function toggleSelect(barId: string) {
  const next = new Set(selectedBarIds.value)
  if (next.has(barId)) next.delete(barId)
  else next.add(barId)
  selectedBarIds.value = next
}

/** 將輸出 emit 出去：攤平成 items，每個成員帶上 dense rank */
function emitUpdate() {
  const result: any[] = []
  bars.value.forEach((bar, idx) => {
    bar.members.forEach(m => {
      result.push({ ...m, rank: idx + 1 })
    })
  })
  emit('update:items', result)
}

function groupSelected() {
  if (!canGroup.value) return

  // 收集被選 bar 的所有成員，依目前順序
  const selectedBars = bars.value.filter(b => selectedBarIds.value.has(b.id))
  const mergedMembers = selectedBars.flatMap(b => b.members)

  // 新群組插入在最上面被選 bar 的位置
  const firstSelectedIndex = bars.value.findIndex(b => selectedBarIds.value.has(b.id))
  const newBar: Bar = { id: nextBarId(), members: mergedMembers }

  const remaining = bars.value.filter(b => !selectedBarIds.value.has(b.id))
  remaining.splice(firstSelectedIndex, 0, newBar)
  bars.value = remaining

  selectedBarIds.value = new Set()
  emitUpdate()
}

function ungroup(index: number) {
  const bar = bars.value[index]
  if (!bar || bar.members.length <= 1) return

  const singles: Bar[] = bar.members.map(m => ({ id: nextBarId(), members: [m] }))
  bars.value.splice(index, 1, ...singles)
  emitUpdate()
}

// 拖拽開始
function handleDragStart(index: number, event: any) {
  if (props.disabled) return
  draggedIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

// 拖拽經過（即時交換 bar 順序）
function handleDragOver(index: number) {
  if (props.disabled || draggedIndex.value === null) return
  if (draggedIndex.value !== index) {
    const dragged = bars.value[draggedIndex.value]
    bars.value.splice(draggedIndex.value, 1)
    bars.value.splice(index, 0, dragged)
    draggedIndex.value = index
  }
}

function handleDrop(_index: number) {
  if (props.disabled) return
  emitUpdate()
}

function handleDragEnd() {
  draggedIndex.value = null
}

function moveUp(index: number) {
  if (index <= 0) return
  const bar = bars.value[index]
  bars.value.splice(index, 1)
  bars.value.splice(index - 1, 0, bar)
  emitUpdate()
}

function moveDown(index: number) {
  if (index >= bars.value.length - 1) return
  const bar = bars.value[index]
  bars.value.splice(index, 1)
  bars.value.splice(index + 1, 0, bar)
  emitUpdate()
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

.ranking-item.group-bar {
  border-color: #b794f4;
  background: #faf5ff;
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

.select-checkbox {
  margin-right: 14px;
  flex-shrink: 0;
}

.rank-number {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 40px;
  padding: 0 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-weight: 600;
  font-size: 16px;
  margin-right: 20px;
  flex-shrink: 0;
  white-space: nowrap;
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.3);
}

.rank-number.tied {
  background: linear-gradient(135deg, #9f7aea 0%, #6b46c1 100%);
  font-size: 14px;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.group-content {
  display: flex;
  align-items: center;
  gap: 18px;
}

.group-count-badge {
  margin-left: 6px;
}

.group-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.group-tied-label {
  flex-shrink: 0;
  padding: 2px 10px;
  background: #6b46c1;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.group-members {
  color: #4a5568;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.action-btn.dissolve-btn:hover:not(:disabled) {
  border-color: #e53e3e;
  color: #e53e3e;
  background: #fff5f5;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.group-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 15px;
  padding: 12px 15px;
  background: #f7fafc;
  border-radius: 8px;
}

.group-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #7f8c8d;
  font-size: 13px;
}

.group-hint.warning {
  color: #c05621;
}

.group-hint i {
  color: #f39c12;
}

.group-hint.warning i {
  color: #c05621;
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

/* ========== 禁用狀態（預覽模式） ========== */

.draggable-ranking-list.disabled {
  pointer-events: none;
  opacity: 0.65;
  position: relative;
  user-select: none;
}

.draggable-ranking-list.disabled::after {
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
</style>
