<template>
  <div ref="containerRef" class="stat-content">
    <!-- 特殊值：圖標顯示 -->
    <div v-if="isSpecialValue" class="static-display">
      <i :class="iconClass"></i>
    </div>

    <!-- 數字動畫 - 始終渲染，loading 時顯示 0 -->
    <NumberFlow
      v-else
      :value="displayValue"
      :animated="enableAnimation"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import NumberFlow from '@number-flow/vue'

const props = withDefaults(defineProps<{
  value: number | string
  loading?: boolean
  enableAnimation?: boolean
  size?: 'small' | 'medium' | 'large'
}>(), {
  loading: false,
  enableAnimation: true,
  size: 'medium'
})

// 特殊值判斷
// 只有在「非 loading」且「真正是特殊值」時才顯示圖標
// loading 時一律顯示 NumberFlow（值為 0），這樣 loading 結束後才能觸發滾動動畫
const isSpecialValue = computed(() => {
  // loading 時不算特殊值，要顯示 NumberFlow
  if (props.loading) return false

  return props.value === 'dead' || props.value === '-' ||
         props.value === null || props.value === undefined || props.value === ''
})

const iconClass = computed(() => {
  if (props.value === 'dead') return 'fa fa-xmark'
  return 'fa fa-minus'
})

// Viewport 觸發動畫
const containerRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!containerRef.value) return

  observer = new IntersectionObserver(
    (entries) => {
      // 一旦進入 viewport，設為 visible 並停止觀察（只觸發一次）
      if (entries[0]?.isIntersecting) {
        isVisible.value = true
        observer?.disconnect()
      }
    },
    { threshold: 0.1 } // 10% 可見即觸發
  )
  observer.observe(containerRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

// 使用 ref 來儲存顯示值，確保動畫能觸發
const displayValue = ref(0)

// 目標值：loading 時為 0，否則為實際數值
const targetValue = computed(() => {
  if (props.loading) return 0
  const val = Number(props.value)
  return isNaN(val) ? 0 : val
})

// 監聽 loading、value 和 viewport 可見性變化
watch(
  () => ({ loading: props.loading, value: props.value, visible: isVisible.value }),
  async (newVal) => {
    if (newVal.loading || !newVal.visible) {
      // loading 中或尚未進入 viewport，維持 0
      displayValue.value = 0
    } else {
      // loading 結束且已進入 viewport，等一個 tick 再更新值
      await nextTick()
      displayValue.value = targetValue.value
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.stat-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: baseline;
}

.static-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
