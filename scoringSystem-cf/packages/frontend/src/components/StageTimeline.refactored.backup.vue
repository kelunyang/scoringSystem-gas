<template>
  <div class="stage-timeline">
    <div class="timeline-track">
      <!-- 時間軸線段 - 按階段狀態分段顯示 -->
      <div class="timeline-segments">
        <div
          v-for="(segment, index) in timelineSegments"
          v-show="segment.height > 0"
          :key="'segment-' + index"
          class="timeline-segment"
          :class="`segment-${segment.status}`"
          :style="{
            height: Math.max(segment.height, 5) + '%',
            top: segment.top + '%'
          }"
        ></div>
      </div>

      <!-- 滾動位置指示器 -->
      <div
        class="scroll-indicator"
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
        class="timeline-stage"
        :class="{
          'active': activeStageId === stage.id,
          [`status-${stage.originalStatus}`]: true
        }"
        :style="{ top: getStagePosition(index) + '%' }"
        :title="getStageTooltip(stage)"
        @click="handleStageClick(stage.id)"
        @mouseenter="hoveredStageId = stage.id"
        @mouseleave="hoveredStageId = null"
      >
        <div class="stage-dot">
          <i v-if="stage.originalStatus === 'completed' || stage.originalStatus === 'archived'" class="fas fa-check"></i>
          <i v-else-if="stage.originalStatus === 'voting'" class="fas fa-vote-yea"></i>
          <i v-else-if="stage.originalStatus === 'active'" class="fas fa-play"></i>
          <i v-else class="fas fa-clock"></i>
        </div>

        <div
          v-show="stage.id === hoveredStageId || stage.id === activeTooltipStageId"
          class="stage-label"
          :class="{
            'tooltip-hover': stage.id === hoveredStageId,
            'tooltip-collision': stage.id === activeTooltipStageId
          }"
        >
          {{ stage.shortTitle || stage.title }}
          <div class="stage-status">{{ getStatusText(stage.originalStatus) }}</div>
          <div v-if="stage.id === activeTooltipStageId" class="collision-indicator">📍</div>
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
import { ref, computed, onMounted, onBeforeUnmount, watch, shallowRef, toRef } from 'vue'
import { useActiveScroll } from 'vue-use-active-scroll'
import type { Stage } from '@/types'

// ==================== 常量定义 ====================
const COLLISION_TOLERANCE = 8
const MS_PER_DAY = 1000 * 60 * 60 * 24
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
        const startTime = new Date(stage.startDate).getTime()
        const endTime = new Date(stage.endDate).getTime()
        return !isNaN(startTime) && !isNaN(endTime) && startTime < endTime
      })
    }
  },
  currentStageId: {
    type: String,
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
      const startTime = stage.startDate ? new Date(stage.startDate).getTime() : 0
      const endTime = stage.endDate ? new Date(stage.endDate).getTime() : 0

      return {
        ...stage,
        _startTime: startTime,
        _endTime: endTime,
        _midTime: (startTime + endTime) / 2
      }
    })
  })
}

// 时间轴映射逻辑
function useTimelineMapping(normalizedStages: any) {
  const projectTimeRange = computed(() => {
    if (!normalizedStages.value.length) {
      return { start: 0, end: 0, duration: 0 }
    }

    const projectStart = Math.min(...normalizedStages.value.map((s: any) => s._startTime))
    const projectEnd = Math.max(...normalizedStages.value.map((s: any) => s._endTime))
    const duration = projectEnd - projectStart

    return { start: projectStart, end: projectEnd, duration }
  })

  const timelineSegments = computed(() => {
    if (!normalizedStages.value.length || !projectTimeRange.value.duration) {
      return []
    }

    const { start: projectStart, duration: projectDuration } = projectTimeRange.value
    const segments = []
    let currentGroup = null

    for (const stage of normalizedStages.value) {
      const stageTopPercent = ((stage._startTime - projectStart) / projectDuration) * 100
      const stageBottomPercent = ((stage._endTime - projectStart) / projectDuration) * 100
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
    const stage = normalizedStages.value[index]
    if (!stage || !projectTimeRange.value.duration) return 50

    const position = ((stage._midTime - projectTimeRange.value.start) /
                     projectTimeRange.value.duration) * 100

    return Math.min(100, Math.max(0, position))
  }

  const mapPageToTimeline = (pageScrollPercentage: any) => {
    if (!normalizedStages.value.length || !projectTimeRange.value.duration) {
      return pageScrollPercentage
    }

    const { start: projectStart, duration: projectDuration } = projectTimeRange.value
    const stageCount = normalizedStages.value.length
    const currentStageIndex = Math.min(
      Math.floor((pageScrollPercentage / 100) * stageCount),
      stageCount - 1
    )

    const stageProgress = ((pageScrollPercentage / 100) * stageCount) - currentStageIndex
    const currentStage = normalizedStages.value[currentStageIndex]
    const nextStage = normalizedStages.value[currentStageIndex + 1]

    const currentStageTimelineStart = ((currentStage._startTime - projectStart) / projectDuration) * 100

    let timelinePosition

    if (!nextStage) {
      const currentStageTimelineEnd = ((currentStage._endTime - projectStart) / projectDuration) * 100
      timelinePosition = currentStageTimelineStart +
        (currentStageTimelineEnd - currentStageTimelineStart) * stageProgress
    } else {
      const nextStageTimelineStart = ((nextStage._startTime - projectStart) / projectDuration) * 100
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

// 滚动同步
function useScrollSync(scrollContainer: any, onScroll: any) {
  const scrollProgress = ref(0)
  const rafId = shallowRef<number | null>(null)
  const isScheduled = shallowRef(false)

  const calculateScrollProgress = () => {
    let scrollTop = 0
    let scrollHeight = 0
    let clientHeight = 0

    if (scrollContainer.value) {
      scrollTop = scrollContainer.value.scrollTop
      scrollHeight = scrollContainer.value.scrollHeight
      clientHeight = scrollContainer.value.clientHeight
    } else {
      const containers = [
        document.querySelector('.content-area'),
        document.querySelector('.main-content'),
        document.querySelector('.project-detail'),
        document.documentElement
      ]

      for (const container of containers) {
        if (container && container.scrollHeight !== undefined && container.clientHeight !== undefined && container.scrollHeight > container.clientHeight) {
          scrollTop = container.scrollTop || 0
          scrollHeight = container.scrollHeight
          clientHeight = container.clientHeight
          scrollContainer.value = container
          break
        }
      }

      if (!scrollHeight) {
        scrollTop = window.pageYOffset || document.documentElement.scrollTop
        scrollHeight = document.documentElement.scrollHeight
        clientHeight = window.innerHeight
      }
    }

    if (scrollHeight > clientHeight) {
      return (scrollTop / (scrollHeight - clientHeight)) * 100
    }
    return 0
  }

  const handleScroll = () => {
    if (isScheduled.value) return

    isScheduled.value = true
    rafId.value = requestAnimationFrame(() => {
      const pageProgress = calculateScrollProgress()
      const timelineProgress = onScroll(pageProgress)
      scrollProgress.value = timelineProgress
      isScheduled.value = false
    })
  }

  const cleanup = () => {
    if (rafId.value) {
      cancelAnimationFrame(rafId.value)
    }
  }

  return { scrollProgress, handleScroll, cleanup }
}

// ==================== State ====================
const hoveredStageId = ref(null)
const activeTooltipStageId = ref(null)
const scrollContainer = shallowRef<Element | null>(null)

// ==================== 使用 Composables ====================
const normalizedStages = useNormalizedStages(toRef(props, 'stages'))
const { projectTimeRange, timelineSegments, getStagePosition, mapPageToTimeline } =
  useTimelineMapping(normalizedStages)

const { scrollProgress, handleScroll, cleanup } = useScrollSync(
  scrollContainer,
  (pageProgress: any) => mapPageToTimeline(pageProgress)
)

// Active scroll tracking
const stageIds = computed(() => normalizedStages.value.map((s: any) => s.id))
const { setActive, activeId: activeStageId } = useActiveScroll(stageIds)

// ==================== Methods ====================
const getStatusText = (status: any) => {
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
  return `${stage.shortTitle || stage.title} - ${getStatusText(stage.originalStatus)}`
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
onMounted(() => {
  // 查找滚动容器
  const containers = [
    document.querySelector('.content-area'),
    document.querySelector('.main-content'),
    document.querySelector('.project-detail')
  ]

  for (const container of containers) {
    if (container && container.scrollHeight !== undefined && container.clientHeight !== undefined && container.scrollHeight > container.clientHeight) {
      scrollContainer.value = container
      container.addEventListener('scroll', handleScroll, { passive: true })
      if (isDev) console.log('✅ 监听滚动容器:', container.className)
      break
    }
  }

  if (!scrollContainer.value) {
    window.addEventListener('scroll', handleScroll, { passive: true })
    if (isDev) console.log('✅ 监听 window 滚动')
  }

  // Resize 处理（防抖）
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  const handleResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(handleScroll, 150)
  }
  window.addEventListener('resize', handleResize, { passive: true })

  // 初始化
  handleScroll()
  if (props.currentStageId) {
    setActive(props.currentStageId)
  }

  // 清理函数
  onBeforeUnmount(() => {
    cleanup()
    if (scrollContainer.value) {
      scrollContainer.value.removeEventListener('scroll', handleScroll)
    } else {
      window.removeEventListener('scroll', handleScroll)
    }
    window.removeEventListener('resize', handleResize)
  })
})

// ==================== Watchers ====================
watch(activeStageId, (newStageId) => {
  if (newStageId) emit('stage-changed', newStageId)
})

watch(scrollProgress, () => {
  checkScrollIndicatorCollision()
})

// 开发模式调试
if (isDev) {
  watch(projectTimeRange, (range) => {
    console.log('📅 專案時間範圍:', {
      start: new Date(range.start),
      end: new Date(range.end),
      durationDays: range.duration / MS_PER_DAY
    })
  }, { immediate: true })

  watch(timelineSegments, (segments) => {
    console.log('✅ Timeline segments:', segments)
  })
}
</script>

<style scoped>
/* 样式保持不变，此处省略 */
</style>
