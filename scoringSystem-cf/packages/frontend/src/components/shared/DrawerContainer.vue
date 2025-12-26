<template>
  <div class="drawer-container">
    <!-- Trigger Button (closed state) -->
    <div
      v-if="!modelValue && condition"
      class="drawer-trigger"
      :class="{ 'use-stage-gradient': useStageGradient }"
      :style="{
        '--theme-color': themeColor,
        '--stage-gradient-vertical': stageGradientVerticalVar
      }"
      @click="toggleDrawer"
    >
      <slot name="trigger">
        <i class="fa fa-grip-vertical"></i>
        <span>{{ openText || `打開${drawerName}` }}</span>
        <i class="fa fa-grip-vertical"></i>
      </slot>
    </div>

    <!-- Drawer Content (open state) -->
    <transition :name="transitionName">
      <div
        v-if="modelValue && condition"
        class="drawer"
        :style="{ '--theme-color': themeColor, '--max-height': maxHeight }"
      >
        <div
          class="drawer-content"
          v-loading="loading"
          :element-loading-text="loadingText"
        >
          <slot></slot>
        </div>
        <div
          class="drawer-handle"
          :class="{ 'use-stage-gradient': useStageGradient }"
          :style="{
            '--theme-color': themeColor,
            '--stage-gradient-vertical-reversed': stageGradientVerticalReversedVar
          }"
          @click="toggleDrawer"
        >
          <slot name="handle">
            <i class="fa fa-grip-vertical"></i>
            <span>{{ closeText || `收合${drawerName}` }}</span>
            <i class="fa fa-grip-vertical"></i>
          </slot>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * @fileoverview Generic Drawer Container Component
 * 通用抽屜容器組件
 *
 * 單一職責：提供可重用的抽屜 UI 模式
 * 支援自訂顏色、內容和載入狀態
 */

interface Props {
  modelValue: boolean           // v-model for open/close state
  drawerName: string            // Drawer name (used in default trigger/handle text)
  themeColor?: string           // Theme color (CSS color value)
  loading?: boolean             // Loading state
  loadingText?: string          // Loading text
  maxHeight?: string            // Max height of drawer content
  condition?: boolean           // Display condition (default true)
  openText?: string             // Custom open button text
  closeText?: string            // Custom close button text
  transitionName?: string       // Custom transition name
  stageStatus?: string          // Stage status for candy gradient (optional)
}

const props = withDefaults(defineProps<Props>(), {
  themeColor: '#667eea',
  loading: false,
  loadingText: '載入中...',
  maxHeight: '600px',
  condition: true,
  transitionName: 'drawer-slide',
  stageStatus: undefined
})

/**
 * 是否使用階段糖果漸層
 */
const useStageGradient = computed(() => !!props.stageStatus)

/**
 * 狀態映射（settling → voting, archived → completed）
 */
const statusMap: Record<string, string> = {
  settling: 'voting',
  archived: 'completed'
}

/**
 * 獲取映射後的狀態名稱
 */
const mappedStatus = computed(() => {
  if (!props.stageStatus) return undefined
  return statusMap[props.stageStatus] || props.stageStatus
})

/**
 * 垂直漸層 CSS 變量（用於 Trigger - 收合狀態）
 * 主題色在上方，向下漸深，暗示「點擊打開」
 */
const stageGradientVerticalVar = computed(() => {
  if (!mappedStatus.value) return undefined
  return `var(--stage-${mappedStatus.value}-gradient-vertical)`
})

/**
 * 垂直漸層反轉 CSS 變量（用於 Handle - 展開狀態）
 * 深色在上方，向下漸亮，暗示「點擊收合」
 */
const stageGradientVerticalReversedVar = computed(() => {
  if (!mappedStatus.value) return undefined
  return `var(--stage-${mappedStatus.value}-gradient-vertical-reversed)`
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

/**
 * Toggle drawer open/close state
 */
function toggleDrawer() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped>
/* Container */
.drawer-container {
  position: relative;
}

/* Trigger Button (closed state) */
.drawer-trigger {
  background: linear-gradient(135deg, var(--theme-color) 0%, color-mix(in srgb, var(--theme-color) 80%, black) 100%);
  color: white;
  padding: 12px 24px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
  border-radius: 4px;
  margin-bottom: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.drawer-trigger:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-color) 80%, black) 0%, color-mix(in srgb, var(--theme-color) 60%, black) 100%);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-color) 40%, transparent);
  transform: translateY(-2px);
}

.drawer-trigger i {
  font-size: 16px;
  opacity: 0.8;
}

/* Drawer (open state) */
.drawer {
  background: #f5f7fa;
  border-bottom: 2px solid #e1e8ed;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border-radius: 4px;
  margin-bottom: 0;
  position: relative;
  z-index: 10;
}

.drawer-content {
  padding: 20px;
  max-height: var(--max-height);
  overflow-y: auto;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-color) 15%, white) 0%, color-mix(in srgb, var(--theme-color) 8%, white) 100%);
}

.drawer-handle {
  background: linear-gradient(135deg, var(--theme-color) 0%, color-mix(in srgb, var(--theme-color) 80%, black) 100%);
  color: white;
  padding: 10px 20px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.drawer-handle:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-color) 80%, black) 0%, var(--theme-color) 100%);
}

.drawer-handle i {
  font-size: 14px;
  opacity: 0.8;
}

/* Stage Gradient Override - 使用階段糖果漸層時的覆蓋樣式 */
/* Trigger: 向下漸深（暗示打開）/ Handle: 向上漸亮（暗示收合） */
.drawer-trigger.use-stage-gradient {
  background: var(--stage-gradient-vertical);
}

.drawer-trigger.use-stage-gradient:hover {
  filter: brightness(0.9);
  background: var(--stage-gradient-vertical);
  transform: translateY(-2px);
}

.drawer-handle.use-stage-gradient {
  background: var(--stage-gradient-vertical-reversed);
}

.drawer-handle.use-stage-gradient:hover {
  filter: brightness(1.1);
  background: var(--stage-gradient-vertical-reversed);
}

/* Transition: Slide + Fade */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-slide-enter-from {
  max-height: 0;
  opacity: 0;
  transform: translateY(-20px);
}

.drawer-slide-enter-to {
  max-height: calc(var(--max-height) + 100px); /* content + handle */
  opacity: 1;
  transform: translateY(0);
}

.drawer-slide-leave-from {
  max-height: calc(var(--max-height) + 100px);
  opacity: 1;
  transform: translateY(0);
}

.drawer-slide-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-20px);
}
</style>
