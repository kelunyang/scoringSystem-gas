<template>
  <div class="physics-drawer-container">
    <!-- Collapsed Zone: 包含 minimized 和 trigger 兩個狀態，用於穩定的 hover 追蹤 -->
    <div
      v-if="!modelValue && condition"
      class="collapsed-hover-zone"
      @mouseenter="handleCollapsedZoneMouseEnter"
      @mouseleave="handleCollapsedZoneMouseLeave"
    >
      <!-- Minimized State (5px bar with grip-dots icon) -->
      <transition name="drawer-minimize">
        <div
          v-if="isMinimized"
          class="drawer-minimized"
          :class="{ 'use-stage-gradient': useStageGradient }"
          :style="{
            '--theme-color': themeColor,
            '--stage-gradient-vertical': stageGradientVerticalVar
          }"
          @click="handleMinimizedClick"
        >
          <i class="fa fa-grip-dots"></i>
        </div>
      </transition>

      <!-- Trigger Button (collapsed state) -->
      <transition name="drawer-trigger-fade">
        <div
          v-if="!isMinimized"
          ref="triggerRef"
          class="drawer-trigger"
          :class="{ 'use-stage-gradient': useStageGradient }"
          :style="{
            '--theme-color': themeColor,
            '--stage-gradient-vertical': stageGradientVerticalVar
          }"
          @click="handleTriggerClick"
        >
          <slot name="trigger">
            <i class="fa fa-grip-vertical"></i>
            <span>{{ openText || `打開${drawerName}` }}</span>
            <i class="fa fa-grip-vertical"></i>
          </slot>
        </div>
      </transition>
    </div>

    <!-- Drawer Content (expanded state, physics-controlled) -->
    <div
      v-if="modelValue && condition"
      ref="drawerRef"
      class="drawer physics-drawer"
      :style="combinedDrawerStyle"
    >
      <div
        class="drawer-content"
        v-loading="loading"
        :element-loading-text="loadingText"
      >
        <slot></slot>
      </div>
      <div
        ref="handleRef"
        class="drawer-handle"
        :class="{ 'use-stage-gradient': useStageGradient, 'is-dragging': isDragging }"
        :style="{
          '--theme-color': themeColor,
          '--stage-gradient-vertical-reversed': stageGradientVerticalReversedVar
        }"
        @click="handleHandleClick"
      >
        <slot name="handle">
          <i class="fa fa-grip-vertical"></i>
          <span>{{ closeText || `收合${drawerName}` }}</span>
          <i class="fa fa-grip-vertical"></i>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Physics-based Drawer Container
 *
 * 具有物理效果的抽屜容器組件：
 * - 彈簧回彈動畫
 * - 手勢拖曳支援
 * - 重力下墜感
 *
 * 與 DrawerContainer.vue 接口兼容，可直接替換使用
 */

import { ref, computed, watch } from 'vue'
import { useDrawerPhysics, type DrawerPhysicsOptions } from '@/composables/useDrawerPhysics'

interface Props {
  modelValue: boolean              // v-model for open/close state
  drawerName: string               // Drawer name (used in default trigger/handle text)
  themeColor?: string              // Theme color (CSS color value)
  loading?: boolean                // Loading state
  loadingText?: string             // Loading text
  maxHeight?: string               // Max height of drawer content (CSS value)
  condition?: boolean              // Display condition (default true)
  openText?: string                // Custom open button text
  closeText?: string               // Custom close button text
  stageStatus?: string             // Stage status for candy gradient (optional)
  // Physics options
  enablePhysics?: boolean          // Enable physics animations (default true)
  bounce?: number                  // Bounce coefficient 0-1 (default 0.25)
  enableGravity?: boolean          // Enable gravity drop effect (default true)
  dragResistance?: number          // Drag resistance 0-1 (default 0.3)
  velocityThreshold?: number       // Fling velocity threshold (default 300)
  direction?: 'up' | 'down'        // Drawer direction (default 'up')
  // Coordination options
  isMinimized?: boolean            // External minimized state (for drawer coordination)
}

const props = withDefaults(defineProps<Props>(), {
  themeColor: '#667eea',
  loading: false,
  loadingText: '載入中...',
  maxHeight: '600px',
  condition: true,
  stageStatus: undefined,
  enablePhysics: true,
  bounce: 0.25,
  enableGravity: true,
  dragResistance: 0.3,
  velocityThreshold: 300,
  direction: 'up',
  isMinimized: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'gesture-start'): void
  (e: 'gesture-end'): void
  (e: 'minimized-hover'): void
  (e: 'minimized-unhover'): void
}>()

// === Refs ===
const triggerRef = ref<HTMLElement | null>(null)
const drawerRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)

// === 解析 maxHeight 為數值 ===
const maxHeightPx = computed(() => {
  const value = props.maxHeight
  if (typeof value === 'number') return value
  // 解析 CSS 值（支援 px, vh 等）
  const match = value.match(/^(\d+(?:\.\d+)?)(px|vh|rem|em)?$/)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2] || 'px'
    if (unit === 'px') return num
    if (unit === 'vh') return (num / 100) * window.innerHeight
    if (unit === 'rem' || unit === 'em') return num * 16 // 假設 1rem = 16px
  }
  return 400 // fallback
})

// === 初始化物理引擎 ===
const modelValueRef = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const physics = useDrawerPhysics({
  maxHeight: maxHeightPx.value,
  bounce: props.bounce,
  enableGravity: props.enableGravity,
  dragResistance: props.dragResistance,
  velocityThreshold: props.velocityThreshold,
  direction: props.direction
})

// === 狀態 ===
const isDragging = computed(() => physics.isDragging.value)

// === 同步 modelValue 與 physics.isOpen ===
watch(() => props.modelValue, (newValue) => {
  if (newValue !== physics.isOpen.value) {
    if (newValue) {
      physics.open()
    } else {
      physics.close()
    }
  }
}, { immediate: true })

watch(() => physics.isOpen.value, (newValue) => {
  if (newValue !== props.modelValue) {
    emit('update:modelValue', newValue)
  }
})

// === 監聽拖曳狀態並發出事件 ===
watch(() => physics.isDragging.value, (isDragging) => {
  if (isDragging) {
    emit('gesture-start')
  } else {
    emit('gesture-end')
  }
})

// === 組合樣式 ===
const combinedDrawerStyle = computed(() => {
  if (!props.enablePhysics) {
    // 非物理模式：使用 CSS max-height
    return {
      '--theme-color': props.themeColor,
      '--max-height': props.maxHeight
    }
  }

  return {
    '--theme-color': props.themeColor,
    ...physics.drawerStyle.value
  }
})

// === Stage Gradient 相關（從 DrawerContainer 複製）===
const useStageGradient = computed(() => !!props.stageStatus)

const statusMap: Record<string, string> = {
  settling: 'voting',
  archived: 'completed'
}

const mappedStatus = computed(() => {
  if (!props.stageStatus) return undefined
  return statusMap[props.stageStatus] || props.stageStatus
})

const stageGradientVerticalVar = computed(() => {
  if (!mappedStatus.value) return undefined
  return `var(--stage-${mappedStatus.value}-gradient-vertical)`
})

const stageGradientVerticalReversedVar = computed(() => {
  if (!mappedStatus.value) return undefined
  return `var(--stage-${mappedStatus.value}-gradient-vertical-reversed)`
})

// === 事件處理 ===
function handleTriggerClick() {
  emit('update:modelValue', true)
  physics.open()
}

function handleHandleClick() {
  // 如果正在拖曳，不響應點擊
  if (physics.isDragging.value) return
  emit('update:modelValue', false)
  physics.close()
}

// === Collapsed zone hover handlers ===
// 在 collapsed zone（包含 minimized 和 trigger）上追蹤 hover
// 這樣當 minimized → collapsed 狀態轉換時，滑鼠仍在 zone 內，不會觸發 unhover
function handleCollapsedZoneMouseEnter() {
  // 只有在 minimized 狀態時才發出 hover 事件
  if (props.isMinimized) {
    emit('minimized-hover')
  }
}

function handleCollapsedZoneMouseLeave() {
  // 只有在之前發出過 hover 事件時才發出 unhover
  // 由於我們使用了 collapsed zone，滑鼠離開時一定是真正離開了
  emit('minimized-unhover')
}

function handleMinimizedClick() {
  // Clicking on minimized bar opens the drawer
  emit('update:modelValue', true)
  physics.open()
}

// === 設置拖曳處理器 ===
// 使用 watch 而非 onMounted，因為 handleRef 在抽屜關閉時是 null
watch(handleRef, (el) => {
  if (props.enablePhysics && el) {
    physics.setupDragHandler(handleRef)
  }
}, { immediate: true })

// === 監聯 maxHeight 變化 ===
watch(maxHeightPx, (newValue) => {
  // 如果抽屜已開啟且高度變化，重新設置
  if (physics.isOpen.value) {
    physics.open()
  }
})
</script>

<style scoped>
/* Container */
.physics-drawer-container {
  position: relative;
  z-index: 8; /* 確保低於 StageTimeline (z-index: 9) */
}

/* Collapsed Hover Zone - 包含 minimized 和 trigger 狀態 */
.collapsed-hover-zone {
  position: relative;
}

/* Trigger Button (closed state) - XP Plastic Style - 光源從上 */
.drawer-trigger {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-color) 60%, white) 0%,
    color-mix(in srgb, var(--theme-color) 90%, white) 15%,
    var(--theme-color) 50%,
    color-mix(in srgb, var(--theme-color) 85%, black) 85%,
    color-mix(in srgb, var(--theme-color) 70%, black) 100%
  );
  color: white;
  padding: 6px 24px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
  margin-bottom: 0;
  border: 1px solid color-mix(in srgb, var(--theme-color) 50%, black);
  border-top-color: color-mix(in srgb, var(--theme-color) 70%, white);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--theme-color) 50%, white),
    0 2px 4px rgba(0, 0, 0, 0.2);
}

.drawer-trigger:hover {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-color) 70%, white) 0%,
    var(--theme-color) 15%,
    color-mix(in srgb, var(--theme-color) 95%, black) 50%,
    color-mix(in srgb, var(--theme-color) 80%, black) 85%,
    color-mix(in srgb, var(--theme-color) 65%, black) 100%
  );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--theme-color) 60%, white),
    0 4px 8px rgba(0, 0, 0, 0.25);
  transform: translateY(-1px);
}

.drawer-trigger i {
  font-size: 12px;
  opacity: 0.8;
}

/* Drawer (physics-controlled) */
.drawer.physics-drawer {
  background: #f5f7fa;
  border-bottom: 2px solid #e1e8ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin-bottom: 0;
  position: relative;
  z-index: 10;
  /* GPU acceleration */
  transform: translateZ(0);
  contain: layout style;
  /* Flexbox 讓 handle 永遠在底部 */
  display: flex;
  flex-direction: column;
}

.drawer-content {
  padding: 20px;
  flex: 1;
  min-height: 0; /* 允許 flex item 縮小 */
  overflow-y: auto;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-color) 15%, white) 0%, color-mix(in srgb, var(--theme-color) 8%, white) 100%);
}

.drawer-handle {
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--theme-color) 60%, white) 0%,
    color-mix(in srgb, var(--theme-color) 90%, white) 15%,
    var(--theme-color) 50%,
    color-mix(in srgb, var(--theme-color) 85%, black) 85%,
    color-mix(in srgb, var(--theme-color) 70%, black) 100%
  );
  color: white;
  padding: 10px 20px;
  cursor: grab;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
  user-select: none;
  touch-action: none; /* 防止觸摸時頁面滾動 */
  flex-shrink: 0; /* 不允許 handle 被壓縮 */
  border: 1px solid color-mix(in srgb, var(--theme-color) 50%, black);
  border-bottom-color: color-mix(in srgb, var(--theme-color) 70%, white);
  box-shadow:
    inset 0 -1px 0 color-mix(in srgb, var(--theme-color) 50%, white),
    0 -2px 4px rgba(0, 0, 0, 0.1);
}

.drawer-handle:hover {
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--theme-color) 70%, white) 0%,
    var(--theme-color) 15%,
    color-mix(in srgb, var(--theme-color) 95%, black) 50%,
    color-mix(in srgb, var(--theme-color) 80%, black) 85%,
    color-mix(in srgb, var(--theme-color) 65%, black) 100%
  );
}

.drawer-handle.is-dragging {
  cursor: grabbing;
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--theme-color) 50%, white) 0%,
    color-mix(in srgb, var(--theme-color) 80%, white) 15%,
    color-mix(in srgb, var(--theme-color) 90%, black) 50%,
    color-mix(in srgb, var(--theme-color) 80%, black) 85%,
    color-mix(in srgb, var(--theme-color) 60%, black) 100%
  );
}

.drawer-handle i {
  font-size: 14px;
  opacity: 0.8;
}

/* Stage Gradient Override - 保持 XP 塑膠效果 */
.drawer-trigger.use-stage-gradient {
  background: var(--stage-gradient-vertical);
  border-color: rgba(0, 0, 0, 0.3);
  border-top-color: rgba(255, 255, 255, 0.4);
}

.drawer-trigger.use-stage-gradient:hover {
  filter: brightness(0.95);
  background: var(--stage-gradient-vertical);
  transform: translateY(-1px);
}

.drawer-handle.use-stage-gradient {
  background: var(--stage-gradient-vertical-reversed);
  border-color: rgba(0, 0, 0, 0.3);
  border-bottom-color: rgba(255, 255, 255, 0.4);
}

.drawer-handle.use-stage-gradient:hover {
  filter: brightness(1.05);
  background: var(--stage-gradient-vertical-reversed);
}

/* Drag indicator animation */
@keyframes drag-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.drawer-handle.is-dragging i {
  animation: drag-pulse 0.5s ease-in-out infinite;
}

/* === Minimized State - XP Plastic Style - 光源從上 === */
.drawer-minimized {
  height: 5px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-color) 70%, white) 0%,
    var(--theme-color) 50%,
    color-mix(in srgb, var(--theme-color) 70%, black) 100%
  );
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
  overflow: hidden;
  opacity: 0.7;
  border: 1px solid color-mix(in srgb, var(--theme-color) 50%, black);
  border-top-color: color-mix(in srgb, var(--theme-color) 60%, white);
}

.drawer-minimized:hover {
  opacity: 1;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--theme-color) 50%, white),
    0 2px 8px color-mix(in srgb, var(--theme-color) 40%, transparent);
}

.drawer-minimized i {
  color: white;
  font-size: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.drawer-minimized:hover i {
  opacity: 0.8;
}

.drawer-minimized.use-stage-gradient {
  background: var(--stage-gradient-vertical);
  border-color: rgba(0, 0, 0, 0.3);
  border-top-color: rgba(255, 255, 255, 0.3);
}

/* === Transition Animations === */
/* Minimized bar transition */
.drawer-minimize-enter-active,
.drawer-minimize-leave-active {
  transition: all 0.3s ease;
}

.drawer-minimize-enter-from,
.drawer-minimize-leave-to {
  height: 0;
  opacity: 0;
}

/* Trigger bar fade transition */
.drawer-trigger-fade-enter-active,
.drawer-trigger-fade-leave-active {
  transition: all 0.3s ease;
}

.drawer-trigger-fade-enter-from,
.drawer-trigger-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
