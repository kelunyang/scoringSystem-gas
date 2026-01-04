import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, type ComputedRef } from 'vue'
import { useWindowSize } from '@vueuse/core'

interface StageCumulative {
  startCumulative: number
  endCumulative: number
}

interface UseViewportStageTrackingOptions {
  /** Stage IDs 列表 */
  stageIds: ComputedRef<string[]>
  /** 每個 stage 的累積時長資料 */
  stageCumulatives: ComputedRef<StageCumulative[]>
  /** 專案總時長 */
  totalDuration: ComputedRef<number>
  /** 取得 stage 元素的函數（預設使用 getElementById） */
  getStageElement?: (id: string) => HTMLElement | null
}

/**
 * 追蹤視窗中心所在的 stage，並映射到時間軸位置
 *
 * 使用 VueUse 的 useWindowSize 追蹤視窗大小變化，
 * 手動監聽多個可能的滾動容器（因為滾動可能發生在 .content-area 等容器上，不只是 window）
 */
export function useViewportStageTracking(options: UseViewportStageTrackingOptions) {
  const {
    stageIds,
    stageCumulatives,
    totalDuration,
    getStageElement = (id: string) => document.getElementById(`stage-${id}`)
  } = options

  // 使用 VueUse 追蹤視窗大小
  const { height: windowHeight } = useWindowSize()

  // 滾動觸發器（用於強制響應式更新）
  const scrollTrigger = ref(0)

  // 當前所在的 stage 索引和進度
  const currentStageIndex = ref(-1)
  const progressInStage = ref(0)

  // 計算視窗中心 Y 座標（響應式）
  const viewCenterY = computed(() => windowHeight.value / 2)

  // 找出視窗中心所在的 stage（使用 getBoundingClientRect）
  const updateCurrentStage = () => {
    const centerY = viewCenterY.value
    let foundIndex = -1
    let foundProgress = 0

    // 遍歷所有 stage，找出包含視窗中心的那個
    for (let i = 0; i < stageIds.value.length; i++) {
      const id = stageIds.value[i]
      const element = getStageElement(id)
      if (!element) continue

      const rect = element.getBoundingClientRect()

      if (rect.top <= centerY && rect.bottom > centerY && rect.height > 0) {
        foundIndex = i
        foundProgress = (centerY - rect.top) / rect.height
        break
      }
    }

    // 邊界處理
    if (foundIndex === -1 && stageIds.value.length > 0) {
      const firstElement = getStageElement(stageIds.value[0])
      const lastElement = getStageElement(stageIds.value[stageIds.value.length - 1])

      if (firstElement) {
        const firstRect = firstElement.getBoundingClientRect()
        if (centerY < firstRect.top) {
          foundIndex = 0
          foundProgress = 0
        }
      }

      if (foundIndex === -1 && lastElement) {
        const lastRect = lastElement.getBoundingClientRect()
        if (centerY >= lastRect.bottom) {
          foundIndex = stageIds.value.length - 1
          foundProgress = 1
        }
      }

      // 可能在兩個 stage 之間的間隙
      if (foundIndex === -1) {
        for (let i = 0; i < stageIds.value.length - 1; i++) {
          const currentElement = getStageElement(stageIds.value[i])
          const nextElement = getStageElement(stageIds.value[i + 1])
          if (!currentElement || !nextElement) continue

          const currentRect = currentElement.getBoundingClientRect()
          const nextRect = nextElement.getBoundingClientRect()

          if (centerY >= currentRect.bottom && centerY < nextRect.top) {
            foundIndex = i
            foundProgress = 1
            break
          }
        }
      }
    }

    currentStageIndex.value = foundIndex
    progressInStage.value = Math.max(0, Math.min(1, foundProgress))
  }

  // 計算時間軸位置（0-100%）- 響應式 computed
  const timelinePosition = computed(() => {
    // 觸發響應式依賴
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _scrollTrigger = scrollTrigger.value
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _windowTrigger = windowHeight.value

    // 更新當前 stage
    updateCurrentStage()

    if (currentStageIndex.value === -1 || !totalDuration.value) return 0

    const cumulative = stageCumulatives.value[currentStageIndex.value]
    if (!cumulative) return 0

    const start = (cumulative.startCumulative / totalDuration.value) * 100
    const end = (cumulative.endCumulative / totalDuration.value) * 100

    return Math.min(100, Math.max(0, start + (end - start) * progressInStage.value))
  })

  // 滾動處理器（使用 RAF 節流）
  let rafId: number | null = null
  let isScheduled = false

  const handleScroll = () => {
    if (isScheduled) return

    isScheduled = true
    rafId = requestAnimationFrame(() => {
      // 增加 scrollTrigger 以觸發 computed 重新計算
      scrollTrigger.value++
      isScheduled = false
    })
  }

  // 監聽的滾動容器列表
  let scrollContainers: (Element | Window)[] = []

  // 初始化滾動監聽
  const initScrollListeners = () => {
    // 清理舊的監聽器
    cleanupScrollListeners()

    // 找出所有可能的滾動容器
    const containers = [
      document.querySelector('.content-area'),
      document.querySelector('.main-content'),
      document.querySelector('.project-detail')
    ].filter((c): c is Element => c !== null)

    // 加上 window
    scrollContainers = [...containers, window]

    // 為所有容器添加滾動監聽
    scrollContainers.forEach(container => {
      container.addEventListener('scroll', handleScroll, { passive: true })
    })
  }

  // 清理滾動監聽
  const cleanupScrollListeners = () => {
    scrollContainers.forEach(container => {
      container.removeEventListener('scroll', handleScroll)
    })
    scrollContainers = []

    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  // 初始化（主要用於 stage 元素變化後重新計算）
  const initStageBoundings = () => {
    updateCurrentStage()
  }

  // 監聽 stageIds 變化
  watch(stageIds, async () => {
    await nextTick()
    updateCurrentStage()
  }, { deep: true })

  // 組件掛載時初始化
  onMounted(async () => {
    await nextTick()
    initScrollListeners()
    updateCurrentStage()
  })

  // 組件卸載時清理
  onBeforeUnmount(() => {
    cleanupScrollListeners()
  })

  return {
    /** 當前視窗中心所在的 stage 索引（-1 表示未找到） */
    currentStageIndex,
    /** 在當前 stage 內的進度（0-1） */
    progressInStage,
    /** 映射到時間軸的位置（0-100%） */
    timelinePosition,
    /** 手動更新當前 stage */
    updateCurrentStage,
    /** 重新初始化（用於 stage 元素變化後） */
    initStageBoundings
  }
}
