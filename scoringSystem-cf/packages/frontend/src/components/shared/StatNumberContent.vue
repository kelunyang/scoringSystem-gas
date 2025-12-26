<template>
  <div class="stat-content">
    <!-- Loading 狀態 -->
    <div v-if="loading" class="loading-overlay">
      <i class="fa fa-spinner fa-spin"></i>
    </div>

    <!-- 3D 圓柱旋轉 -->
    <div v-else-if="shouldAnimate" class="cylinder-container">
      <div
        class="cylinder-roller"
        :style="{ transform: `rotateX(${currentRotation}deg)` }"
      >
        <div
          v-for="(num, index) in numberList"
          :key="index"
          class="cylinder-face"
          :style="getFaceStyle(index)"
        >
          {{ num }}
        </div>
      </div>
    </div>

    <!-- 靜態顯示 -->
    <div v-else class="static-display">
      <i v-if="isIcon" :class="displayValue"></i>
      <span v-else>{{ displayValue }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'

const props = defineProps({
  value: {
    type: [Number, String],
    default: '-'
  },
  loading: {
    type: Boolean,
    default: false
  },
  enableAnimation: {
    type: Boolean,
    default: true
  },
  size: {
    type: String,
    default: 'medium',
    validator: (val: string) => ['small', 'medium', 'large'].includes(val)
  }
})

// 動畫時間常量
const ANIMATION_TIMING = {
  LAST_NUMBER_DELAY: 200,
  SECOND_LAST_MIN: 100,
  SECOND_LAST_VARIANCE: 50,
  NORMAL_MIN: 30,
  NORMAL_VARIANCE: 20,
  LARGE_LIST_MULTIPLIER: 0.7,
  START_DELAY: 150
}

// 當前旋轉角度
const currentRotation = ref(0)

// 追蹤是否已播放過動畫
const hasPlayedAnimation = ref(false)

// 保存 timeout IDs 以便清理
const timeoutIds = ref<ReturnType<typeof setTimeout>[]>([])

// 顯示值（靜態）
const displayValue = computed(() => {
  // 特殊狀態：返回 Font Awesome 圖標類名
  if (props.value === 'dead') return 'fa fa-xmark'
  if (props.value === '-' || !props.value) return 'fa fa-minus'

  // 正常數字值
  return props.value
})

// 是否為圖標
const isIcon = computed(() => {
  return typeof displayValue.value === 'string' && displayValue.value.startsWith('fa ')
})

// 解析最終數值
const finalValue = computed(() => {
  const val = parseInt(String(props.value))
  return isNaN(val) ? null : val
})

// 是否應該播放動畫
const shouldAnimate = computed(() => {
  return props.enableAnimation &&
         finalValue.value !== null &&
         finalValue.value > 0 &&
         !props.loading  // 等該 group 的排名載入完成
})

// 計算動畫起始值（精確定位到十位數）
const getAnimationStart = (targetValue: any) => {
  if (targetValue < 10) return 1  // 單位數從 1 開始

  // 無條件捨去到十位數（最多 10 個面）
  return Math.floor(targetValue / 10) * 10
}

// 數字序列（從計算的起始值到 finalValue）
const numberList = computed(() => {
  if (!finalValue.value || finalValue.value <= 0) return []

  const target = finalValue.value
  const start = getAnimationStart(target)

  // 生成從 start 到 target 的序列
  return Array.from({ length: target - start + 1 }, (_, i) => start + i)
})

// 動態圓柱半徑（根據容器大小調整）
const RADIUS = computed(() => {
  const radiusConfig: Record<string, number> = {
    small: 50,   // 40px 容器 -> 50px 半徑
    medium: 60,  // 50px 容器 -> 60px 半徑（優化後最多 10 個面）
    large: 70    // 60px 容器 -> 70px 半徑
  }
  return radiusConfig[props.size] || radiusConfig.medium
})

// 角度間隔
const angleStep = computed(() => {
  const count = numberList.value.length
  if (count === 0) return 0
  // 為了均勻分布，每個數字佔據的角度
  return 360 / Math.max(count, 6) // 至少分成 6 份
})

// 計算每個面的樣式
const getFaceStyle = (index: number) => {
  const angle = index * angleStep.value
  return {
    transform: `rotateX(${angle}deg) translateZ(${RADIUS.value}px)`
  }
}

// 清理所有動畫 timeout
const cleanupAnimation = () => {
  timeoutIds.value.forEach(id => clearTimeout(id))
  timeoutIds.value = []
}

// 動畫執行
const animateRoller = () => {
  if (!shouldAnimate.value) {
    currentRotation.value = 0
    return
  }

  // 清理之前的動畫
  cleanupAnimation()

  // 捕獲當前動畫需要的所有值，避免動畫執行過程中 props 變化導致的問題
  const target = finalValue.value
  const totalCount = numberList.value.length
  const currentAngleStep = angleStep.value

  if (import.meta.env.DEV) {
    console.log('🎰 [StatNumberContent] 開始動畫，目標:', target, 'totalCount:', totalCount)
  }

  let currentIndex = 0

  const spin = () => {
    // 旋轉到當前索引對應的角度
    // 注意：rotateX 是負值才能正向旋轉
    currentRotation.value = -(currentIndex * currentAngleStep)

    if (import.meta.env.DEV) {
      console.log(`🎰 [StatNumberContent] 顯示: ${currentIndex + 1}, index: ${currentIndex}, rotation: ${currentRotation.value}°`)
    }

    if (currentIndex < totalCount - 1) {
      currentIndex++

      const remaining = (totalCount - 1) - currentIndex
      let delay

      if (remaining === 1) {
        // 倒數第二個，明顯減速
        delay = ANIMATION_TIMING.LAST_NUMBER_DELAY
      } else if (remaining === 2) {
        // 倒數第三個，開始減速
        delay = ANIMATION_TIMING.SECOND_LAST_MIN + Math.random() * ANIMATION_TIMING.SECOND_LAST_VARIANCE
      } else {
        // 其他快速通過
        delay = ANIMATION_TIMING.NORMAL_MIN + Math.random() * ANIMATION_TIMING.NORMAL_VARIANCE
      }

      // 大數量時整體加速
      if (totalCount > 10) {
        delay = delay * ANIMATION_TIMING.LARGE_LIST_MULTIPLIER
      }

      const timeoutId = setTimeout(spin, delay)
      timeoutIds.value.push(timeoutId)
    } else {
      if (import.meta.env.DEV) {
        console.log('✅ [StatNumberContent] 動畫完成！最終值:', currentIndex + 1)
      }
    }
  }

  // 從第一個數字開始
  spin()
}

// 監聽 shouldAnimate 的變化
watch(shouldAnimate, (newValue, oldValue) => {
  if (import.meta.env.DEV) {
    console.log('🎰 [StatNumberContent] shouldAnimate 檢查:', {
      newValue,
      oldValue,
      hasPlayed: hasPlayedAnimation.value,
      value: props.value,
      loading: props.loading
    })
  }

  // 當 shouldAnimate 為 true 且還沒播放過時，播放動畫
  // shouldAnimate 已經包含了所有條件檢查：
  // - enableAnimation
  // - finalValue 有效
  // - !loading (資料已載入)
  if (!hasPlayedAnimation.value && newValue === true) {
    if (import.meta.env.DEV) {
      console.log('✨ [StatNumberContent] shouldAnimate 為 true，準備播放動畫！')
    }
    hasPlayedAnimation.value = true
    currentRotation.value = 0
    const timeoutId = setTimeout(animateRoller, ANIMATION_TIMING.START_DELAY)
    timeoutIds.value.push(timeoutId)
  }
}, { immediate: true, flush: 'post' })

// 組件卸載時清理所有動畫
onUnmounted(() => {
  cleanupAnimation()
})
</script>

<style scoped>
.stat-content {
  width: 100%;
  height: 100%;
  position: relative;
}

/* Loading 覆蓋層 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* 靜態顯示 */
.static-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 3D 圓柱容器 */
.cylinder-container {
  width: 100%;
  height: 100%;
  perspective: 1500px; /* 透視距離（增加以改善 3D 效果） */
  perspective-origin: 50% 50%;
  position: relative;
  overflow: hidden; /* 裁切超出容器的圓柱部分 */
}

/* 圓柱旋轉體 */
.cylinder-roller {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d; /* 關鍵！保持 3D 空間 */
  transition: transform 0.12s ease-out; /* 旋轉過渡 */
}

/* 圓柱表面的數字 */
.cylinder-face {
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden; /* 背面隱藏 */
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  white-space: nowrap; /* 防止多位數換行 */
}
</style>
