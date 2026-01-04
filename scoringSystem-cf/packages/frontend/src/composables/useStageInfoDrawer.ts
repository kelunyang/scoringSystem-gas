/**
 * useStageInfoDrawer.ts
 * 階段訊息抽屜功能 Composable
 *
 * 功能：
 * 1. 碰撞檢測（Intersection Observer）- 階段頂部碰撞 topbar
 * 2. 動畫鎖機制 - 防止快速滾動時抽屜頻繁開關
 * 3. 階段高度過濾 - 只為長階段啟用抽屜
 * 4. ResizeObserver - 監聯階段動態高度變化
 * 5. URL 同步 - 階段切換時同步更新 URL
 * 6. 抽屜協調 - 與其他抽屜的三態協調（展開/收合/最小化）
 */

import { ref, computed, watch, onMounted, onBeforeUnmount, unref } from 'vue'
import type { Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRouteDrawer } from './useRouteDrawer'
import { useDrawerCoordinationStore } from '@/stores/drawerCoordination'
import { storeToRefs } from 'pinia'

/**
 * 協調選項
 */
export interface StageInfoDrawerCoordinationOptions {
  /** 是否啟用抽屜協調（預設：true） */
  enableCoordination?: boolean
  /** 協調 ID（預設：'stageInfo'） */
  coordinationId?: string
  /** 顯示名稱（預設：'當前階段'） */
  drawerName?: string
  /** 主題顏色（預設會從 stage status 推斷） */
  themeColor?: string
}

export function useStageInfoDrawer(
  projectId: Ref<string> | string,
  topbarHeight = 60,
  coordinationOptions: StageInfoDrawerCoordinationOptions = {}
) {
  const route = useRoute()
  const { navigateToStageAction, navigateToGlobalAction, currentAction, currentExtraParam } = useRouteDrawer()

  // === 協調選項 ===
  const {
    enableCoordination = true,
    coordinationId = 'stageInfo',
    drawerName = '當前階段',
    themeColor = '#667eea'
  } = coordinationOptions

  // === 協調 Store ===
  const coordinationStore = useDrawerCoordinationStore()
  const { hasExpandedDrawer } = storeToRefs(coordinationStore)

  // Helper to get projectId value (supports both Ref and string)
  const getProjectId = () => unref(projectId)
  // 當前活動的階段 ID（控制 v-if）
  const activeDrawerStageId = ref<string | null>(null)

  // 抽屜開關狀態（控制 v-model）
  const stageDrawerOpen = ref(false)

  // === 協調狀態 ===
  const isMinimized = computed(() => {
    if (!enableCoordination) return false
    return coordinationStore.getDrawerState(coordinationId) === 'minimized'
  })

  const isExpanded = computed(() => {
    if (!enableCoordination) return stageDrawerOpen.value
    return coordinationStore.getDrawerState(coordinationId) === 'expanded'
  })

  // 動畫鎖（防止快速滾動時頻繁觸發）
  const isAnimating = ref(false)
  const ANIMATION_DURATION = 500 // 與 CSS transition 一致

  // 手勢活動狀態（當用戶正在拖曳時暫停滾動觸發）
  const isGestureActive = ref(false)

  // 本地 hover 追蹤（用於最小化狀態）
  const isHovering = ref(false)

  // Observer 實例
  const topObservers = new Map<string, IntersectionObserver>()
  const bottomObservers = new Map<string, IntersectionObserver>()
  let resizeObserver: ResizeObserver | null = null

  // 防抖計時器（避免頻繁觸發）
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // === 協調 Store 註冊 ===
  onMounted(() => {
    if (enableCoordination) {
      coordinationStore.registerDrawer(coordinationId, {
        drawerName,
        themeColor
      })
    }
  })

  // === 協調 Store 同步：監聽其他抽屜展開導致本抽屜被最小化 ===
  if (enableCoordination) {
    watch(
      () => coordinationStore.getDrawerState(coordinationId),
      (newState, oldState) => {
        // 當從 expanded 變成 minimized（被其他抽屜擠掉）
        if (oldState === 'expanded' && newState === 'minimized') {
          // 關閉抽屜動畫
          stageDrawerOpen.value = false
        }
        // 當從 minimized 恢復為 collapsed（其他抽屜關閉了）
        else if (oldState === 'minimized' && newState === 'collapsed') {
          // 抽屜保持關閉，但恢復正常 trigger bar
        }
      }
    )

    // === 協調 Store 同步：監聽用戶主動關閉抽屜（點擊 handle）===
    watch(stageDrawerOpen, (newValue, oldValue) => {
      // 當抽屜從開啟變成關閉，且是 expanded 狀態（用戶主動關閉）
      if (oldValue === true && newValue === false) {
        if (coordinationStore.getDrawerState(coordinationId) === 'expanded') {
          coordinationStore.collapseDrawer(coordinationId)
        }
      }
    })
  }

  /**
   * 檢查階段是否應該啟用抽屜（高度過濾）
   * 只要階段高度超過視窗高度就啟用 drawer
   */
  function shouldEnableDrawer(stageId: string): boolean {
    const element = document.getElementById(`stage-${stageId}`)
    if (!element) {
      console.warn(`[抽屜] ❌ 找不到階段元素 ${stageId}`)
      return false
    }

    const stageHeight = element.offsetHeight
    const viewportHeight = window.innerHeight
    const threshold = viewportHeight // 閾值改為 1.0x viewport
    return stageHeight > threshold
  }

  /**
   * 激活階段抽屜
   * @param stageId - 階段 ID
   * @param force - 是否強制激活（忽略動畫鎖）
   */
  function activateStageDrawer(stageId: string, force = false) {
    // 手勢進行中不觸發滾動激活
    if (isGestureActive.value) {
      return
    }

    // 動畫鎖檢查
    if (!force && isAnimating.value) {
      return
    }

    // 啟動動畫鎖
    isAnimating.value = true

    // 更新狀態
    activeDrawerStageId.value = stageId
    stageDrawerOpen.value = true

    // 🔗 協調系統：通知展開（會自動最小化其他抽屜）
    if (enableCoordination) {
      coordinationStore.expandDrawer(coordinationId)
    }

    // 🔗 URL 同步：更新 URL 到階段路由（保留當前的 action 和 extraParam）
    if (route.name !== 'projects-stage' || route.params.stageId !== stageId) {
      navigateToStageAction(
        getProjectId(),
        stageId,
        currentAction.value,
        currentExtraParam.value
      )
    }

    // 解鎖
    setTimeout(() => {
      isAnimating.value = false
    }, ANIMATION_DURATION)
  }

  /**
   * 關閉階段抽屜
   * 注意：等待動畫完成後再移除 DOM（v-if）
   */
  function closeStageDrawer() {
    // 開始收起動畫
    stageDrawerOpen.value = false

    // 🔗 協調系統：通知收合（會恢復其他抽屜為 collapsed）
    if (enableCoordination) {
      coordinationStore.collapseDrawer(coordinationId)
    }

    // 🔗 URL 同步：如果沒有 action，則導航到全域路由（projects-view）
    // 如果有 action，則保留在當前階段路由（drawer 未關閉）
    if (!currentAction.value) {
      navigateToGlobalAction(getProjectId())
    }

    // 等待動畫完成後再移除 DOM
    setTimeout(() => {
      activeDrawerStageId.value = null
    }, ANIMATION_DURATION)
  }

  /**
   * 最小化狀態的 hover 處理
   */
  function handleMinimizedMouseEnter() {
    if (isMinimized.value) {
      isHovering.value = true
      coordinationStore.hoverMinimizedDrawer(coordinationId)
    }
  }

  function handleMinimizedMouseLeave() {
    if (isHovering.value) {
      isHovering.value = false
      coordinationStore.unhoverDrawer(coordinationId)
    }
  }

  /**
   * 觀察階段頂部（碰撞檢測）- Sentinel 方案
   * 設計邏輯：「長貨櫃車通過檢測區」
   * - 觀察頂部哨兵（0px 高度元素），而非整個 stage-section
   * - 當頂部哨兵離開觀察區域（穿過 topbar）且底部哨兵還沒進入視野時，激活 HUD
   */
  function observeStageTop(stageId: string) {
    // 觀察頂部哨兵
    const topSentinel = document.getElementById(`sentinel-top-${stageId}`)
    const bottomSentinel = document.getElementById(`sentinel-bottom-${stageId}`)

    if (!topSentinel) {
      console.warn(`[抽屜] ❌ 找不到階段 ${stageId} 的頂部哨兵`)
      return
    }

    // 添加 data 屬性用於識別
    topSentinel.dataset.stageId = stageId

    // 動態綁定後立即檢查當前位置
    const topRect = topSentinel.getBoundingClientRect()
    const bottomRect = bottomSentinel?.getBoundingClientRect()

    // 檢測條件：頂部哨兵已在 topbar 上方，且底部哨兵還沒進入視野
    const isTopAboveTopbar = topRect.top < topbarHeight
    const isBottomBelowViewport = bottomRect ? bottomRect.top > window.innerHeight : false

    if (isTopAboveTopbar && isBottomBelowViewport) {
      setTimeout(() => {
        activateStageDrawer(stageId, true)
      }, 0)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-stage-id')
          if (!id) return

          // 頂部哨兵離開觀察區域（向下滾動，穿過 topbar）→ 激活 HUD
          if (!entry.isIntersecting) {
            // 額外檢查：底部哨兵是否還沒進入視野
            const bottomSentinelEl = document.getElementById(`sentinel-bottom-${id}`)
            const bottomRect = bottomSentinelEl?.getBoundingClientRect()

            if (bottomRect && bottomRect.top > window.innerHeight) {
              activateStageDrawer(id)
            }
          }

          // 頂部哨兵重新進入觀察區域（向上滾動，倒車）→ 關閉 HUD
          if (entry.isIntersecting && activeDrawerStageId.value === id) {
            closeStageDrawer()
          }
        })
      },
      {
        threshold: 0,
        rootMargin: `-${topbarHeight}px 0px 0px 0px`
      }
    )

    observer.observe(topSentinel)
    topObservers.set(stageId, observer)
  }

  /**
   * 觀察階段底部（退出檢測）- Sentinel 方案
   * 當底部哨兵進入視野時，表示整個 stage 可見，關閉 HUD
   */
  function observeStageBottom(stageId: string) {
    const bottomSentinel = document.getElementById(`sentinel-bottom-${stageId}`)

    if (!bottomSentinel) {
      console.warn(`[抽屜] ❌ 找不到階段 ${stageId} 的底部哨兵`)
      return
    }

    bottomSentinel.dataset.stageId = stageId

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-stage-id')
          if (!id) return

          // 底部哨兵進入視野 → 整個 stage 可見，關閉 HUD
          if (entry.isIntersecting && activeDrawerStageId.value === id) {
            closeStageDrawer()
          }
        })
      },
      {
        threshold: 0
      }
    )

    observer.observe(bottomSentinel)
    bottomObservers.set(stageId, observer)
  }

  /**
   * 初始化 ResizeObserver
   * 監聽階段高度變化（如 Per-Stage Timeline 展開、切換檢視模式）
   * 支援動態啟用/停用 drawer：
   * - 高度變長超過 viewport → 自動綁定 observers 啟用 drawer
   * - 高度變短低於 viewport → 自動解綁 observers 停用 drawer
   */
  function initResizeObserver(stageIds: string[]) {
    resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const stageId = entry.target.id.replace('stage-', '')

        // 防抖：清除之前的計時器
        if (debounceTimers.has(stageId)) {
          clearTimeout(debounceTimers.get(stageId)!)
        }

        // 設置新的防抖計時器
        debounceTimers.set(stageId, setTimeout(() => {
          const newHeight = entry.contentRect.height
          const viewportHeight = window.innerHeight
          const threshold = viewportHeight // 閾值改為 1.0x viewport
          const isCurrentlyBound = topObservers.has(stageId)

          // 情況 1：高度超過閾值 → 綁定 observers（如果尚未綁定）
          if (newHeight > threshold && !isCurrentlyBound) {
            observeStageTop(stageId)
            observeStageBottom(stageId)
          }
          // 情況 2：高度低於閾值 → 解綁 observers（如果已綁定）
          else if (newHeight < threshold && isCurrentlyBound) {
            // 如果 drawer 正在顯示，先關閉
            if (activeDrawerStageId.value === stageId) {
              closeStageDrawer()
            }

            // 解綁並清理 observers（資源優化）
            topObservers.get(stageId)?.disconnect()
            bottomObservers.get(stageId)?.disconnect()
            topObservers.delete(stageId)
            bottomObservers.delete(stageId)
          }

          // 清理防抖計時器
          debounceTimers.delete(stageId)
        }, 150)) // 150ms 防抖延遲
      })
    })

    // 觀察所有階段
    stageIds.forEach((stageId) => {
      const element = document.getElementById(`stage-${stageId}`)
      if (element) {
        resizeObserver?.observe(element)
      }
    })
  }

  /**
   * 綁定所有觀察器
   * @param stageIds - 階段 ID 列表
   */
  function bindObservers(stageIds: string[]) {
    // 過濾出需要啟用抽屜的長階段
    const enabledStageIds = stageIds.filter((id) => shouldEnableDrawer(id))

    // 為每個長階段綁定頂部和底部觀察器
    enabledStageIds.forEach((stageId) => {
      observeStageTop(stageId)
      observeStageBottom(stageId)
    })

    // 初始化 ResizeObserver（監聽所有階段）
    initResizeObserver(stageIds)
  }

  /**
   * 清理所有觀察器
   */
  function cleanup() {
    // 斷開所有 Intersection Observers
    topObservers.forEach((observer) => observer.disconnect())
    bottomObservers.forEach((observer) => observer.disconnect())

    topObservers.clear()
    bottomObservers.clear()

    // 清理所有防抖計時器（防止內存洩漏）
    debounceTimers.forEach((timer) => clearTimeout(timer))
    debounceTimers.clear()

    // 斷開 ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
  }

  // 組件卸載時自動清理
  onBeforeUnmount(() => {
    cleanup()
    // 從協調 store 取消註冊
    if (enableCoordination) {
      coordinationStore.unregisterDrawer(coordinationId)
    }
  })

  /**
   * 暫停滾動檢測（手勢拖曳開始時調用）
   * 防止拖曳過程中 IntersectionObserver 觸發開關
   */
  function pauseScrollDetection() {
    isGestureActive.value = true
  }

  /**
   * 恢復滾動檢測（手勢拖曳結束時調用）
   */
  function resumeScrollDetection() {
    isGestureActive.value = false
  }

  /**
   * 主動檢查並激活抽屜（用於 viewMode 切換後）- Sentinel 方案
   * 解決 ResizeObserver 未觸發時的 fallback
   * @param stageId - 階段 ID
   */
  function checkAndActivateIfNeeded(stageId: string) {
    // 等待 DOM 更新後再檢查
    setTimeout(() => {
      const stageElement = document.getElementById(`stage-${stageId}`)
      const topSentinel = document.getElementById(`sentinel-top-${stageId}`)
      const bottomSentinel = document.getElementById(`sentinel-bottom-${stageId}`)

      if (!stageElement || !topSentinel || !bottomSentinel) {
        console.warn(`[抽屜] ❌ checkAndActivateIfNeeded: 找不到階段元素或哨兵 ${stageId}`)
        return
      }

      const stageHeight = stageElement.offsetHeight
      const viewportHeight = window.innerHeight
      const threshold = viewportHeight

      // 檢查是否應該啟用抽屜
      if (stageHeight > threshold) {
        // 確保 observers 已綁定
        if (!topObservers.has(stageId)) {
          observeStageTop(stageId)
          observeStageBottom(stageId)
        }

        // 使用 sentinel 檢查是否「卡在檢測區」
        const topRect = topSentinel.getBoundingClientRect()
        const bottomRect = bottomSentinel.getBoundingClientRect()
        const isTopAboveTopbar = topRect.top < topbarHeight
        const isBottomBelowViewport = bottomRect.top > viewportHeight

        if (isTopAboveTopbar && isBottomBelowViewport) {
          activateStageDrawer(stageId, true)
        }
      }
    }, 200) // 等待 DOM 更新和動畫完成
  }

  return {
    // 狀態
    activeDrawerStageId,
    stageDrawerOpen,
    isAnimating,
    isGestureActive,

    // 協調狀態
    isMinimized,
    isExpanded,
    isHovering,
    hasExpandedDrawer,

    // 方法
    activateStageDrawer,
    closeStageDrawer,
    shouldEnableDrawer,
    bindObservers,
    cleanup,
    checkAndActivateIfNeeded,
    pauseScrollDetection,
    resumeScrollDetection,

    // 協調方法
    handleMinimizedMouseEnter,
    handleMinimizedMouseLeave
  }
}
