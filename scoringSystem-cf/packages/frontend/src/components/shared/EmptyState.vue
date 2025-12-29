<template>
  <div class="empty-state" :class="[`type-${type}`, { compact }]">
    <div class="empty-state-icon">
      <Transition name="flip" mode="out-in">
        <!-- Show parent icon with manual positioning if provided -->
        <div v-if="showParentIcon" key="parent-icon" class="parent-icon-container">
          <i :class="`fas ${parentIcon} parent-icon-base`"></i>
          <i class="fas fa-times parent-icon-times"></i>
        </div>
        <!-- Show rotating icons -->
        <i v-else :key="`emoji-${tickCount}`" :class="currentIcon"></i>
      </Transition>
    </div>
    <h3 v-if="!compact" class="empty-state-title">{{ title }}</h3>
    <p v-else class="empty-state-title compact-title">{{ title }}</p>
    <p v-if="description" class="empty-state-description">{{ description }}</p>

    <slot name="action">
      <el-button
        v-if="showAction"
        type="primary"
        @click="emit('action-click')"
      >
        <i v-if="actionIcon" :class="actionIcon"></i>
        {{ actionText }}
      </el-button>
    </slot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface Props {
  /**
   * Font Awesome icon class names (without 'fas' prefix)
   * @default ['fa-face-dizzy', 'fa-face-sad-tear', 'fa-face-meh', 'fa-face-tired', 'fa-face-frown']
   */
  icons?: string[]
  /** Main heading text */
  title: string
  /** Optional subtitle/description */
  description?: string
  /** Visual type variant */
  type?: 'info' | 'warning' | 'error' | 'success'
  /** Compact mode (smaller padding, smaller icon) */
  compact?: boolean
  /** Animation interval in milliseconds */
  animationInterval?: number
  /** Enable icon rotation animation */
  enableAnimation?: boolean
  /** Show action button */
  showAction?: boolean
  /** Button text */
  actionText?: string
  /** Button icon */
  actionIcon?: string
  /** Parent component representative icon (displays with fa-times overlay) */
  parentIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  icons: () => ['fa-face-dizzy', 'fa-face-sad-tear', 'fa-face-meh', 'fa-face-tired', 'fa-face-frown'],
  description: '',
  type: 'info',
  compact: false,
  animationInterval: 2500,
  enableAnimation: true,
  showAction: false,
  actionText: '重新載入',
  actionIcon: 'fa-refresh'
})

const emit = defineEmits<{
  'action-click': []
}>()

// Refactored animation logic using tick-based approach
const intervalId = ref<number | null>(null)
const tickCount = ref(0)

// Calculate total display ticks
// parentIcon takes 2 ticks, each regular icon takes 1 tick
const totalTicks = computed(() => {
  if (!props.parentIcon) return props.icons.length
  return 2 + props.icons.length
})

// Determine if parentIcon should be shown
const showParentIcon = computed(() => {
  if (!props.parentIcon) return false
  // If animation is disabled, always show parentIcon
  if (!props.enableAnimation) return true
  // If animation is enabled, show parentIcon for first 2 ticks
  return tickCount.value < 2
})

// Calculate current emoji icon index
const currentIconIndex = computed(() => {
  if (!props.parentIcon) return tickCount.value
  const adjustedTick = tickCount.value - 2
  return adjustedTick >= 0 ? adjustedTick : 0
})

// Get current icon with 'fas' prefix
const currentIcon = computed(() => {
  const iconName = props.icons[currentIconIndex.value]
  if (!iconName) return 'fas fa-face-meh'
  return iconName.includes(' ') ? iconName : `fas ${iconName}`
})

onMounted(() => {
  if (props.enableAnimation && totalTicks.value > 1) {
    intervalId.value = window.setInterval(() => {
      tickCount.value = (tickCount.value + 1) % totalTicks.value
    }, props.animationInterval)
  }
})

onUnmounted(() => {
  if (intervalId.value !== null) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #909399;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-state-icon {
  font-size: 64px;
  color: #c0c4cc;
  margin-bottom: 20px;
  perspective: 1000px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-icon i {
  display: block;
  backface-visibility: hidden;
}

/* Coin flip animation */
.flip-enter-active,
.flip-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.flip-enter-from {
  opacity: 0;
  transform: rotateY(90deg) scale(0.8);
}

.flip-leave-to {
  opacity: 0;
  transform: rotateY(-90deg) scale(0.8);
}

.flip-enter-to,
.flip-leave-from {
  opacity: 1;
  transform: rotateY(0deg) scale(1);
}

.empty-state-title {
  font-size: 20px;
  margin: 0 0 10px 0;
  color: #606266;
  font-weight: 500;
}

.empty-state-description {
  font-size: 14px;
  margin: 0 0 20px 0;
  max-width: 400px;
  line-height: 1.5;
  color: #909399;
}

/* Type variants */
.empty-state.type-info .empty-state-icon {
  color: #c0c4cc;
}

.empty-state.type-warning .empty-state-icon {
  color: #e6a23c;
}

.empty-state.type-error .empty-state-icon {
  color: #f56c6c;
}

.empty-state.type-success .empty-state-icon {
  color: #67c23a;
}

/* Compact mode */
.empty-state.compact {
  padding: 30px 16px;
}

.empty-state.compact .empty-state-icon {
  font-size: 36px;
  height: 48px;
  margin-bottom: 12px;
}

.empty-state.compact .compact-title {
  font-size: 14px;
  margin: 0;
  font-weight: normal;
}

/* Parent icon container - improved positioning */
.parent-icon-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.parent-icon-base {
  display: block;
  /* parentIcon keeps default gray color from .empty-state-icon */
}

.parent-icon-times {
  position: absolute;
  right: -0.125em;
  bottom: -0.125em;
  font-size: 0.4em;
  color: #800000 !important; /* maroon for the times icon only */
}

/* Responsive */
@media (max-width: 768px) {
  .empty-state {
    padding: 40px 16px;
  }

  .empty-state-icon {
    font-size: 48px;
    height: 60px;
  }

  .empty-state-title {
    font-size: 18px;
  }

  .empty-state-description {
    font-size: 13px;
  }

  .empty-state.compact {
    padding: 20px 12px;
  }

  .empty-state.compact .empty-state-icon {
    font-size: 32px;
    height: 40px;
  }
}
</style>
