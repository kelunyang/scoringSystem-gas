<template>
  <div class="stage-timeline">
    <div class="timeline-track">
      <!-- 時間軸線段 - 按階段狀態分段顯示 -->
      <div class="timeline-segments">
        <div
          v-for="(segment, index) in timelineSegments"
          :key="'segment-' + index"
          v-show="segment.height > 0"
          class="timeline-segment"
          :class="[
            `segment-${segment.status}`,
            { 'is-scrolling': isScrolling && isIndicatorInSegment(segment) }
          ]"
          :style="{
            height: Math.max(segment.height, 5) + '%',
            top: segment.top + '%'
          }"
        ></div>
      </div>

      <!-- 滾動位置指示器 -->
      <div
        class="scroll-indicator"
        :class="{ 'is-idle': !isScrolling }"
        :style="{ top: scrollProgress + '%' }"
        :title="`滾動進度: ${Math.round(scrollProgress)}%`"
      >
        <div class="scroll-percentage">{{ Math.round(scrollProgress) }}%</div>
      </div>

      <!-- 起始標記 -->
      <div class="timeline-marker timeline-start" :style="{ top: '0%' }" title="專案開始">
        <div class="marker-dot"><i class="fas fa-flag"></i></div>
      </div>

      <!-- 階段節點 -->
      <div
        v-for="(stage, index) in normalizedStages"
        :key="stage.id"
        v-show="stage && stage.id"
        class="timeline-stage"
        :class="{
          'active': activeStageId === stage.id,
          [`status-${stage.originalStatus || 'pending'}`]: true
        }"
        :style="{ top: getStagePosition(index) + '%' }"
        :data-stage-index="index"
        :data-stage-id="stage.id"
        @click="handleStageClick(stage.id || '')"
        @mouseenter="hoveredStageId = stage.id"
        @mouseleave="hoveredStageId = null"
        :title="getStageTooltip(stage)"
      >
        <div class="stage-dot">
          <i v-if="stage.originalStatus === 'completed' || stage.originalStatus === 'archived'" class="fas fa-check"></i>
          <i v-else-if="stage.originalStatus === 'voting'" class="fas fa-vote-yea"></i>
          <i v-else-if="stage.originalStatus === 'active'" class="fas fa-play"></i>
          <i v-else class="fas fa-clock"></i>
        </div>

        <div
          v-show="
            (stage.id === hoveredStageId && shouldShowHover) ||
            (stage.id === activeTooltipStageId && shouldShowCollision)
          "
          class="stage-label"
          :class="{
            'tooltip-hover': stage.id === hoveredStageId && shouldShowHover,
            'tooltip-collision': stage.id === activeTooltipStageId && shouldShowCollision,
            'is-visible': (stage.id === hoveredStageId && isHoverVisible) || (stage.id === activeTooltipStageId && isCollisionVisible)
          }"
        >
          {{ stage.shortTitle || stage.title }}
          <div class="stage-status">{{ getStatusText(stage.originalStatus) }}</div>
          <div v-if="stage.id === activeTooltipStageId && shouldShowCollision" class="collision-indicator"><i class="fas fa-map-marker-alt"></i></div>
        </div>
      </div>

      <!-- 結束標記 -->
      <div class="timeline-marker timeline-end" :style="{ top: '100%' }" title="專案結束">
        <div class="marker-dot"><i class="fas fa-flag-checkered"></i></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, toRef, nextTick } from 'vue'
import { useActiveScroll } from 'vue-use-active-scroll'
import { useViewportStageTracking } from '@/composables/useViewportStageTracking'
import type { Stage } from '@/types'

// ==================== 常量定义 ====================
const COLLISION_TOLERANCE = 8
const MS_PER_DAY = 1000 * 60 * 60 * 24
const TOOLTIP_AUTO_HIDE_DELAY = 5000  // 5 秒自動隱藏
const TOOLTIP_FADE_IN_DURATION = 500   // 0.5 秒淡入
const TOOLTIP_FADE_OUT_DURATION = 2000 // 2 秒淡出
const isDev = import.meta.env.DEV

// ==================== Props & Emits ====================
const props = defineProps({
  stages: {
    type: Array,
    required: true,
    validator: (stages) => {
      if (!Array.isArray(stages)) return false
      return stages.every(stage => {
        if (!stage || typeof stage.id !== 'string') return false
        // startTime and endTime are already timestamps (numbers)
        return typeof stage.startTime === 'number' &&
               typeof stage.endTime === 'number' &&
               stage.startTime < stage.endTime
      })
    }
  },
  currentStageId: {
    type: String as () => string | null,
    default: null
  }
})

const emit = defineEmits(['stage-clicked', 'stage-changed'])

// ==================== Composables ====================

// 标准化阶段数据（缓存时间戳）
function useNormalizedStages(stages: any) {
  return computed(() => {
    if (!stages.value?.length) return []

    return stages.value.map((stage: Stage) => {
      // startTime and endTime are already timestamps (numbers)
      const startTime = stage.startTime
      const endTime = stage.endTime

      return {
        ...stage,
        _startTime: startTime,
        _endTime: endTime,
        _midTime: startTime && endTime ? (startTime + endTime) / 2 : 0
      }
    })
  })
}

// 时间轴映射逻辑（基於順序的累積時長，而非絕對時間戳）
function useTimelineMapping(normalizedStages: any) {
  const projectTimeRange = computed(() => {
    if (!normalizedStages.value.length) {
      return { start: 0, end: 0, duration: 0, stageCumulatives: [] }
    }

    // 計算每個階段的累積時長（按順序累加，不依賴絕對時間戳）
    let cumulativeTime = 0
    const stageCumulatives = []

    for (let i = 0; i < normalizedStages.value.length; i++) {
      const stage = normalizedStages.value[i]
      const stageDuration = stage._endTime - stage._startTime
      const startCumulative = cumulativeTime
      cumulativeTime += stageDuration

      stageCumulatives.push({
        index: i,
        startCumulative,
        endCumulative: cumulativeTime,
        duration: stageDuration,
        midCumulative: startCumulative + (stageDuration / 2)
      })
    }

    const totalDuration = cumulativeTime

    return {
      start: 0,
      end: totalDuration,
      duration: totalDuration,
      stageCumulatives
    }
  })

  const timelineSegments = computed(() => {
    if (!normalizedStages.value.length || !projectTimeRange.value.duration) {
      return []
    }

    const { duration: totalDuration, stageCumulatives } = projectTimeRange.value
    const segments = []
    let currentGroup = null

    for (let i = 0; i < normalizedStages.value.length; i++) {
      const stage = normalizedStages.value[i]
      const cumulative = stageCumulatives[i]

      // 使用累積時長計算位置百分比
      const stageTopPercent = (cumulative.startCumulative / totalDuration) * 100
      const stageBottomPercent = (cumulative.endCumulative / totalDuration) * 100
      const status = stage.originalStatus

      if (!currentGroup || currentGroup.status !== status) {
        if (currentGroup) segments.push(currentGroup)
        currentGroup = {
          status,
          top: stageTopPercent,
          bottom: stageBottomPercent,
          stageCount: 1
        }
      } else {
        currentGroup.bottom = stageBottomPercent
        currentGroup.stageCount++
      }
    }

    if (currentGroup) segments.push(currentGroup)

    return segments.map(group => ({
      status: group.status,
      height: group.bottom - group.top,
      top: group.top,
      stageCount: group.stageCount
    }))
  })

  const getStagePosition = (index: number) => {
    if (index < 0 || index >= normalizedStages.value.length) return 50

    const { duration: totalDuration, stageCumulatives } = projectTimeRange.value

    // 如果總時長為 0（所有階段時長都是 0），則退回均勻分佈
    if (!totalDuration || totalDuration === 0) {
      const stageCount = normalizedStages.value.length
      if (stageCount === 1) return 50
      const segmentHeight = 100 / stageCount
      const position = (index * segmentHeight) + (segmentHeight / 2)

      if (isDev) {
        // console.log(`⚠️ 階段 ${index} 使用均勻分佈 (所有階段時長為0): ${position.toFixed(1)}%`)
      }
      return position
    }

    // 基於累積時長的位置計算：使用階段中點的累積時間
    const cumulative = stageCumulatives[index]
    const position = (cumulative.midCumulative / totalDuration) * 100

    if (isDev && index < 5) {
      const _stage = normalizedStages.value[index]
      // console.log(`📍 階段 ${index} (${_stage.title || _stage.shortTitle}):`, {
      //   duration: `${(cumulative.duration / MS_PER_DAY).toFixed(1)} 天`,
      //   cumulativeRange: `${(cumulative.startCumulative / totalDuration * 100).toFixed(1)}% - ${(cumulative.endCumulative / totalDuration * 100).toFixed(1)}%`,
      //   position: `${position.toFixed(1)}%`
      // })
    }

    return Math.min(100, Math.max(0, position))
  }

  const mapPageToTimeline = (pageScrollPercentage: number) => {
    if (!normalizedStages.value.length || !projectTimeRange.value.duration) {
      return pageScrollPercentage
    }

    const { duration: totalDuration, stageCumulatives } = projectTimeRange.value
    const stageCount = normalizedStages.value.length

    // 根據頁面滾動百分比決定當前在哪個階段
    const currentStageIndex = Math.min(
      Math.floor((pageScrollPercentage / 100) * stageCount),
      stageCount - 1
    )

    // 當前階段內的進度（0-1）
    const stageProgress = ((pageScrollPercentage / 100) * stageCount) - currentStageIndex
    const currentCumulative = stageCumulatives[currentStageIndex]
    const nextCumulative = stageCumulatives[currentStageIndex + 1]

    // 計算時間軸上的位置（基於累積時長）
    const currentStageTimelineStart = (currentCumulative.startCumulative / totalDuration) * 100

    let timelinePosition

    if (!nextCumulative) {
      // 最後一個階段
      const currentStageTimelineEnd = (currentCumulative.endCumulative / totalDuration) * 100
      timelinePosition = currentStageTimelineStart +
        (currentStageTimelineEnd - currentStageTimelineStart) * stageProgress
    } else {
      // 從當前階段開始到下一階段開始
      const nextStageTimelineStart = (nextCumulative.startCumulative / totalDuration) * 100
      timelinePosition = currentStageTimelineStart +
        (nextStageTimelineStart - currentStageTimelineStart) * stageProgress
    }

    return Math.min(100, Math.max(0, timelinePosition))
  }

  return {
    projectTimeRange,
    timelineSegments,
    getStagePosition,
    mapPageToTimeline
  }
}

// ==================== State ====================
const hoveredStageId = ref(null)
const activeTooltipStageId = ref(null)

// 計時器和顯示狀態控制
const hoverTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const collisionTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const shouldShowHover = ref(true)
const shouldShowCollision = ref(true)

// Opacity 動畫控制
const isHoverVisible = ref(false)      // 控制 hover tooltip opacity
const isCollisionVisible = ref(false)  // 控制 collision tooltip opacity
const fadeOutTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 滾動動畫控制
const isScrolling = ref(false)
const scrollingTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// ==================== 使用 Composables ====================
const normalizedStages = useNormalizedStages(toRef(props, 'stages'))
const { projectTimeRange, timelineSegments, getStagePosition, mapPageToTimeline } =
  useTimelineMapping(normalizedStages)

// Stage IDs（需要在 useViewportStageTracking 之前定義）
const stageIds = computed(() => normalizedStages.value.map((s: Stage) => s.id || ''))

// 為 VueUse composable 準備資料
const stageCumulatives = computed(() =>
  projectTimeRange.value.stageCumulatives.map(c => ({
    startCumulative: c.startCumulative,
    endCumulative: c.endCumulative
  }))
)
const totalDuration = computed(() => projectTimeRange.value.duration)

// 使用 VueUse 響應式追蹤視窗中心所在的 stage
const {
  timelinePosition: viewportTimelinePosition,
  initStageBoundings
} = useViewportStageTracking({
  stageIds,
  stageCumulatives,
  totalDuration
})

// 滾動進度：直接使用 VueUse composable 的響應式結果
const scrollProgress = computed(() => {
  // 如果專案時長為 0，使用簡單的頁面滾動百分比
  if (!projectTimeRange.value.duration) {
    return 0
  }
  return viewportTimelinePosition.value
})

// Active scroll tracking
const { setActive, activeId: activeStageId } = useActiveScroll(stageIds)

// ==================== Methods ====================

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'pending': '未開始',
    'active': '進行中',
    'voting': '投票中',
    'completed': '已結束',
    'archived': '已歸檔'
  }
  return statusMap[status] || status
}

const getStageTooltip = (stage: Stage) => {
  return `${stage.shortTitle || stage.title} - ${getStatusText(stage.originalStatus || '')}`
}

const handleStageClick = (stageId: string) => {
  setActive(stageId)

  const targetElement = document.getElementById(`stage-${stageId}`)
  if (targetElement) {
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
  }

  emit('stage-clicked', stageId)
}

// 計時器清理函數
const clearHoverTimer = () => {
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
    hoverTimer.value = null
  }
}

const clearCollisionTimer = () => {
  if (collisionTimer.value) {
    clearTimeout(collisionTimer.value)
    collisionTimer.value = null
  }
}

const clearFadeOutTimer = () => {
  if (fadeOutTimer.value) {
    clearTimeout(fadeOutTimer.value)
    fadeOutTimer.value = null
  }
}

const clearAllTimers = () => {
  clearHoverTimer()
  clearCollisionTimer()
  clearFadeOutTimer()
}

const clearScrollingTimer = () => {
  if (scrollingTimer.value) {
    clearTimeout(scrollingTimer.value)
    scrollingTimer.value = null
  }
}

// 判斷指示器是否在該區段內
const isIndicatorInSegment = (segment: { top: number; height: number }) => {
  const indicatorPos = scrollProgress.value
  const segmentEnd = segment.top + segment.height
  return indicatorPos >= segment.top && indicatorPos <= segmentEnd
}

// 碰撞检测（使用二分查找优化）
const checkScrollIndicatorCollision = () => {
  if (!normalizedStages.value.length) return

  const indicatorPosition = scrollProgress.value
  let closestStage = null
  let minDistance = Infinity

  // 二分查找最接近的阶段
  let left = 0
  let right = normalizedStages.value.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midPosition = getStagePosition(mid)
    const distance = Math.abs(indicatorPosition - midPosition)

    if (distance < minDistance) {
      minDistance = distance
      closestStage = normalizedStages.value[mid]
    }

    if (midPosition < indicatorPosition) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  if (closestStage && minDistance <= COLLISION_TOLERANCE) {
    activeTooltipStageId.value = closestStage.id
  } else {
    activeTooltipStageId.value = null
  }
}

// ==================== Lifecycle ====================
// VueUse 的 useElementBounding 會自動監聽 scroll 和 resize，
// 不需要手動添加事件監聽器

onMounted(async () => {
  // 等待 DOM 完全渲染
  await nextTick()

  // VueUse composable 會在 stageIds 變化時自動初始化
  // 這裡手動初始化以確保首次渲染正確
  initStageBoundings()

  // 設定初始選中的 stage
  if (props.currentStageId) {
    setActive(props.currentStageId)
  }
})

// 清理函数（VueUse composables 會自動清理）
onBeforeUnmount(() => {
  clearAllTimers()  // 清除所有計時器，避免內存洩漏
  clearScrollingTimer()  // 清除滾動動畫計時器
})

// ==================== Watchers ====================

// 監聽 stages 變化，重新初始化 VueUse bounding tracking
// 注意：useViewportStageTracking 內部也會 watch stageIds，
// 這裡是為了確保 DOM 更新後重新初始化
watch(() => props.stages, async () => {
  await nextTick()
  initStageBoundings()
}, { deep: true })

watch(activeStageId, (newStageId) => {
  if (newStageId) emit('stage-changed', newStageId)
})

watch(scrollProgress, () => {
  checkScrollIndicatorCollision()

  // 滾動動畫追蹤
  isScrolling.value = true
  clearScrollingTimer()

  // 停止滾動 300ms 後關閉動畫
  scrollingTimer.value = setTimeout(() => {
    isScrolling.value = false
  }, 300)
})

// Hover 自動隱藏邏輯（帶淡入淡出動畫）
watch(hoveredStageId, async (newId, oldId) => {
  // 清除所有相關計時器
  clearHoverTimer()
  clearFadeOutTimer()

  if (newId) {
    // === 出現動畫 ===
    // 1. 顯示 DOM
    shouldShowHover.value = true

    // 2. 等待 DOM 渲染
    await nextTick()

    // 3. 觸發淡入動畫 (0.5秒)
    isHoverVisible.value = true

    // 4. 啟動 5 秒自動隱藏計時器
    hoverTimer.value = setTimeout(() => {
      // 開始淡出動畫
      isHoverVisible.value = false

      // 等待淡出動畫完成後移除 DOM
      fadeOutTimer.value = setTimeout(() => {
        shouldShowHover.value = false
        if (isDev) {
          console.log('🕐 Hover tooltip 已隱藏 (淡出完成):', newId)
        }
      }, TOOLTIP_FADE_OUT_DURATION)

      if (isDev) {
        console.log('🕐 Hover tooltip 開始淡出:', newId)
      }
    }, TOOLTIP_AUTO_HIDE_DELAY)

    if (isDev) {
      console.log('👆 Hover tooltip 淡入:', newId)
    }
  } else {
    // === 鼠標離開：立即開始淡出 ===
    isHoverVisible.value = false

    // 等待淡出動畫完成後移除 DOM
    fadeOutTimer.value = setTimeout(() => {
      shouldShowHover.value = false
      if (isDev) {
        console.log('👋 鼠標離開，Hover tooltip 已隱藏')
      }
    }, TOOLTIP_FADE_OUT_DURATION)
  }
})

// Collision 自動隱藏邏輯（帶淡入淡出動畫）
watch(activeTooltipStageId, async (newId, oldId) => {
  // 清除所有相關計時器
  clearCollisionTimer()
  clearFadeOutTimer()

  if (newId) {
    // 如果是同一個階段，不重置計時器（避免碰撞抖動）
    if (newId === oldId) {
      return
    }

    // === 出現動畫 ===
    // 1. 顯示 DOM
    shouldShowCollision.value = true

    // 2. 等待 DOM 渲染
    await nextTick()

    // 3. 觸發淡入動畫 (0.5秒)
    isCollisionVisible.value = true

    // 4. 啟動 5 秒自動隱藏計時器
    collisionTimer.value = setTimeout(() => {
      // 開始淡出動畫
      isCollisionVisible.value = false

      // 等待淡出動畫完成後移除 DOM
      fadeOutTimer.value = setTimeout(() => {
        shouldShowCollision.value = false
        if (isDev) {
          console.log('🕐 Collision tooltip 已隱藏 (淡出完成):', newId)
        }
      }, TOOLTIP_FADE_OUT_DURATION)

      if (isDev) {
        console.log('🕐 Collision tooltip 開始淡出:', newId)
      }
    }, TOOLTIP_AUTO_HIDE_DELAY)

    if (isDev) {
      console.log('📍 Collision tooltip 淡入:', newId)
    }
  } else {
    // === 離開碰撞範圍：立即開始淡出 ===
    isCollisionVisible.value = false

    // 等待淡出動畫完成後移除 DOM
    fadeOutTimer.value = setTimeout(() => {
      shouldShowCollision.value = false
      if (isDev) {
        console.log('📍 離開碰撞範圍，Collision tooltip 已隱藏')
      }
    }, TOOLTIP_FADE_OUT_DURATION)
  }
})

// 开发模式调试
// if (isDev) {
//   watch(projectTimeRange, (range) => {
//     if (range.duration > 0) {
//       console.log('📅 專案時間範圍:', {
//         start: new Date(range.start).toLocaleString(),
//         end: new Date(range.end).toLocaleString(),
//         durationDays: (range.duration / MS_PER_DAY).toFixed(1) + ' 天'
//       })
//     } else {
//       console.log('⚠️ 專案時長為 0，將使用均勻分佈模式')
//     }
//   }, { immediate: true })

//   watch(normalizedStages, (stages) => {
//     console.log('🎯 階段數據載入:', {
//       count: stages.length,
//       totalDuration: `${((projectTimeRange.value.duration || 0) / MS_PER_DAY).toFixed(1)} 天`,
//       stages: stages.map((s, i) => {
//         const duration = (s._endTime - s._startTime) / MS_PER_DAY
//         const position = getStagePosition(i)
//         return {
//           index: i,
//           id: s.id,
//           title: s.shortTitle || s.title,
//           status: s.originalStatus,
//           duration: `${duration.toFixed(1)} 天`,
//           position: `${position.toFixed(1)}%`
//         }
//       })
//     })
//   }, { immediate: true })

//   watch(timelineSegments, (segments) => {
//     console.log('📊 Timeline segments (基於時長):', segments.map(seg => ({
//       status: seg.status,
//       top: `${seg.top.toFixed(1)}%`,
//       height: `${seg.height.toFixed(1)}%`,
//       stageCount: seg.stageCount
//     })))
//   })
// }
</script>

<style scoped>
.stage-timeline {
  position: fixed;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 9;
  height: 60vh;
  max-height: 500px;
  min-height: 300px;
}

.timeline-track {
  position: relative;
  height: 100%;
  width: 60px;
}

.timeline-segments {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-50%);
  border-radius: 3px;
  background: rgba(156, 163, 175, 0.2);
  z-index: 1;
}

/* 線段顏色 */
.segment-pending {
  background: var(--stage-pending-bg);
  opacity: 0.8;
}

.segment-current {
  background: var(--stage-active-bg);
  box-shadow: 0 0 8px rgba(25, 135, 84, 0.5);
  opacity: 1;
}

.segment-active {
  background: var(--stage-active-bg);
  box-shadow: 0 0 8px rgba(25, 135, 84, 0.5);
  opacity: 1;
}

.segment-voting {
  background: var(--stage-voting-bg);
  box-shadow: 0 0 8px rgba(200, 35, 51, 0.5);
  opacity: 1;
}

.segment-completed, .segment-archived {
  background: var(--stage-completed-bg);
  opacity: 0.9;
}

.segment-upcoming {
  background: var(--stage-pending-bg);
  opacity: 0.6;
}

.timeline-segment {
  position: absolute;
  width: 100%;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-height: 20px;
}

/* 滾動位置指示器 */
.scroll-indicator {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  background: #ef4444;
  border-radius: 50%;
  transform: translateX(-50%);
  transition: all 0.05s ease;
  z-index: 20;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.6);
}

.scroll-percentage {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(239, 68, 68, 0.9);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

/* 靜止時的心跳白光效果 */
.scroll-indicator.is-idle {
  animation: heartbeat-glow 1.5s ease-in-out infinite;
}

@keyframes heartbeat-glow {
  0%, 100% {
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.6);
    transform: translateX(-50%) scale(1);
  }
  50% {
    box-shadow:
      0 2px 6px rgba(239, 68, 68, 0.6),
      0 0 20px rgba(255, 255, 255, 0.8),
      0 0 30px rgba(255, 255, 255, 0.4);
    transform: translateX(-50%) scale(1.15);
  }
}

.timeline-stage {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  z-index: 10;
  min-width: 26px;
  min-height: 26px;
}

.timeline-stage:hover {
  transform: translateX(-50%) scale(1.1);
  z-index: 15;
}

.stage-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  transition: all 0.3s ease;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  position: relative;
  z-index: 10;
  margin: auto;
  opacity: 1;
  visibility: visible;
}

/* 階段圓點顏色 */
.status-pending .stage-dot {
  background: var(--stage-pending-bg);
  border-color: #fff;
  color: var(--stage-pending-text);
  border-width: 2px;
}

.status-active .stage-dot {
  background: var(--stage-active-bg);
  border-color: #fff;
  color: var(--stage-active-text);
  box-shadow: 0 2px 8px rgba(25, 135, 84, 0.4);
  border-width: 3px;
}

.status-voting .stage-dot {
  background: var(--stage-voting-bg);
  border-color: #fff;
  color: var(--stage-voting-text);
  box-shadow: 0 2px 8px rgba(200, 35, 51, 0.4);
  border-width: 3px;
}

.status-completed .stage-dot,
.status-archived .stage-dot {
  background: var(--stage-completed-bg);
  border-color: #fff;
  color: var(--stage-completed-text);
  border-width: 2px;
}

/* 當前選中的階段 */
.timeline-stage.active .stage-dot {
  width: 26px;
  height: 26px;
  border-width: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.timeline-stage.active.status-active .stage-dot {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.6);
}

.timeline-stage.active.status-voting .stage-dot {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.6);
}

.stage-label {
  position: absolute;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(30, 41, 59, 0.95);
  color: white;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1);
  /* 移除舊的 animation，使用 opacity 過渡 */
  opacity: 0;
  transition: opacity 2s ease; /* 默認淡出時間 2 秒 */
}

/* 顯示狀態：淡入動畫 (0.5秒) */
.stage-label.is-visible {
  opacity: 1;
  transition: opacity 0.5s ease; /* 淡入時間 0.5 秒 */
}

/* 懸停觸發的 tooltip */
.stage-label.tooltip-hover {
  background: rgba(59, 130, 246, 0.95);
  border-color: rgba(147, 197, 253, 0.3);
}

/* 碰撞觸發的 tooltip */
.stage-label.tooltip-collision {
  background: rgba(239, 68, 68, 0.95);
  border-color: rgba(248, 113, 113, 0.3);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.collision-indicator {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translateY(-50%) scale(1); }
  50% { transform: translateY(-50%) scale(1.2); }
}

.stage-status {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
}

.stage-label::after {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 8px 8px 8px 0;
  border-color: transparent rgba(30, 41, 59, 0.95) transparent transparent;
  transition: all 0.3s ease;
}

.stage-label.tooltip-hover::after {
  border-color: transparent rgba(59, 130, 246, 0.95) transparent transparent;
}

.stage-label.tooltip-collision::after {
  border-color: transparent rgba(239, 68, 68, 0.95) transparent transparent;
}

/* 懸停效果 */
.timeline-stage:hover .stage-dot {
  transform: scale(1.2);
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

/* 時間軸標記樣式 */
.timeline-marker {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
}

.timeline-start {
  transform: translateX(-50%) translateY(-10px);
}

.timeline-end {
  transform: translateX(-50%) translateY(-10px);
}

.marker-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: white;
  background: #6b7280;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  transition: all 0.3s ease;
}

.timeline-start .marker-dot {
  background: #10b981;
  border-color: #d1fae5;
}

.timeline-end .marker-dot {
  background: #374151;
  border-color: #f3f4f6;
}

.timeline-marker:hover .marker-dot {
  transform: scale(1.1);
  box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}

/* 響應式設計 */
@media (max-width: 1024px) {
  .stage-timeline {
    right: 20px;
    width: 50px;
  }

  .timeline-track {
    width: 50px;
  }

  .stage-label {
    right: 35px;
    font-size: 11px;
    padding: 6px 10px;
  }
}

@media (max-width: 768px) {
  .stage-timeline {
    right: 15px;
    height: 50vh;
    width: 40px;
  }

  .timeline-track {
    width: 40px;
  }

  .stage-dot {
    width: 16px;
    height: 16px;
    font-size: 8px;
  }

  .timeline-stage.active .stage-dot {
    width: 20px;
    height: 20px;
  }

  .stage-label {
    font-size: 10px;
    padding: 4px 8px;
    right: 25px;
  }
}

@media (max-width: 576px) {
  .stage-timeline {
    width: 30px;
  }

  .timeline-track {
    width: 30px;
  }

  .stage-label {
    display: none;
  }

  .stage-dot {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  .timeline-stage.active .stage-dot {
    width: 18px;
    height: 18px;
  }
}

/* ==================== 滾動時的動態斜線效果 ==================== */
.timeline-segment.is-scrolling {
  background: repeating-linear-gradient(
    -45deg,
    var(--segment-base-color),
    var(--segment-base-color) 3px,
    var(--segment-stripe-color) 3px,
    var(--segment-stripe-color) 6px
  ) !important;
  background-size: 8.5px 8.5px !important;
  animation: stripe-flow-up 0.4s linear infinite;
}

/* 各狀態的條紋配色 */
.segment-pending.is-scrolling {
  --segment-base-color: var(--stage-pending-bg);
  --segment-stripe-color: rgba(255, 255, 255, 0.25);
}

.segment-active.is-scrolling {
  --segment-base-color: var(--stage-active-bg);
  --segment-stripe-color: rgba(255, 255, 255, 0.3);
}

.segment-voting.is-scrolling {
  --segment-base-color: var(--stage-voting-bg);
  --segment-stripe-color: rgba(255, 255, 255, 0.3);
}

.segment-completed.is-scrolling,
.segment-archived.is-scrolling {
  --segment-base-color: var(--stage-completed-bg);
  --segment-stripe-color: rgba(255, 255, 255, 0.2);
}

/* 向上流動動畫 */
@keyframes stripe-flow-up {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 -8.5px;  /* 等於一個條紋週期 */
  }
}

/* 動畫淡入淡出過渡 */
.timeline-segment {
  transition: background 0.2s ease;
}
</style>
