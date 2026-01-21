import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ComputedRef, type Ref } from 'vue'

export interface WindowInfiniteScrollOptions {
  /** Distance from bottom to trigger load (default: 200px) */
  distance?: number
  /** Debounce delay for load more (default: 300ms) */
  debounceDelay?: number
  /** Custom scroll container selector (default: '.main-content') */
  scrollContainerSelector?: string
}

/**
 * 頁面級無限滾動 composable
 *
 * 監聽滾動容器的滾動事件，當滾動到底部時觸發載入更多
 * 自動處理「螢幕太大，初始內容不足」的情況
 *
 * 注意：由於 MainLayout 使用 .main-content 作為滾動容器（overflow-y: auto），
 * 而不是 window/body 滾動，所以這個 composable 會自動偵測並監聽 .main-content
 *
 * @param canLoadMore - 是否可以載入更多的響應式標誌
 * @param isLoading - 是否正在載入的響應式標誌
 * @param onLoadMore - 載入更多的回調函數
 * @param options - 可選配置
 */
export function useWindowInfiniteScroll(
  canLoadMore: Ref<boolean> | ComputedRef<boolean>,
  isLoading: Ref<boolean> | ComputedRef<boolean>,
  onLoadMore: () => void | Promise<void>,
  options: WindowInfiniteScrollOptions = {}
) {
  const {
    distance = 200,
    debounceDelay = 300,
    scrollContainerSelector = '.main-content'
  } = options

  const loadingMore = ref(false)
  const hasInitialDataLoaded = ref(false)
  let loadMoreTimer: ReturnType<typeof setTimeout> | null = null
  let scrollContainer: HTMLElement | Window | null = null

  /**
   * 檢查是否應該載入更多
   * 需要同時滿足：可以載入更多、不在載入中、首次資料已載入完成
   */
  const shouldLoadMore = computed(() => {
    return canLoadMore.value && !isLoading.value && !loadingMore.value && hasInitialDataLoaded.value
  })

  /**
   * 載入更多（帶防抖）
   */
  function triggerLoadMore() {
    if (!shouldLoadMore.value) {
      return
    }

    // Clear previous timer
    if (loadMoreTimer !== null) {
      clearTimeout(loadMoreTimer)
    }

    loadingMore.value = true

    loadMoreTimer = setTimeout(async () => {
      try {
        // 等待 onLoadMore 完成（支援 async callback）
        await onLoadMore()
      } finally {
        loadingMore.value = false
        loadMoreTimer = null

        // 載入完成後檢查是否需要繼續載入
        nextTick(() => {
          checkAndLoadMore()
        })
      }
    }, debounceDelay)
  }

  /**
   * 取得滾動相關的尺寸資訊
   */
  function getScrollMetrics(): { scrollTop: number; clientHeight: number; scrollHeight: number } {
    if (scrollContainer instanceof HTMLElement) {
      return {
        scrollTop: scrollContainer.scrollTop,
        clientHeight: scrollContainer.clientHeight,
        scrollHeight: scrollContainer.scrollHeight
      }
    } else {
      // Fallback to window/document
      return {
        scrollTop: window.scrollY || document.documentElement.scrollTop,
        clientHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight
      }
    }
  }

  /**
   * 滾動事件處理
   */
  function handleScroll() {
    const { scrollTop, clientHeight, scrollHeight } = getScrollMetrics()
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    if (!shouldLoadMore.value) return

    if (distanceFromBottom < distance) {
      triggerLoadMore()
    }
  }

  /**
   * 檢查並自動載入更多
   * 用於處理螢幕太大、初始內容不足的情況
   */
  async function checkAndLoadMore() {
    await nextTick()

    const { clientHeight, scrollHeight } = getScrollMetrics()

    if (!shouldLoadMore.value) {
      return
    }

    // 如果內容高度小於或接近容器高度，自動載入更多
    if (scrollHeight <= clientHeight + distance) {
      triggerLoadMore()
    }
  }

  /**
   * 初始化滾動容器
   */
  function initScrollContainer() {
    // 嘗試找到指定的滾動容器
    const container = document.querySelector(scrollContainerSelector)

    if (container instanceof HTMLElement) {
      scrollContainer = container
    } else {
      // Fallback to window
      scrollContainer = window
    }

    // 綁定滾動事件
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    }
  }

  // 綁定滾動事件
  onMounted(() => {
    // 使用 nextTick 確保 DOM 已經渲染
    nextTick(() => {
      initScrollContainer()
      // 不再在掛載時立即檢查
      // 改為在 isLoading 從 true 變成 false 時（首次資料載入完成）才開始檢查
    })
  })

  // 解綁滾動事件
  onUnmounted(() => {
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }

    if (loadMoreTimer !== null) {
      clearTimeout(loadMoreTimer)
    }
  })

  // 追蹤首次資料載入完成
  // 當 isLoading 從 true 變成 false，表示首次資料載入完成
  watch(isLoading, (loading, wasLoading) => {
    if (wasLoading && !loading && !hasInitialDataLoaded.value) {
      hasInitialDataLoaded.value = true
      // 延遲檢查，確保 DOM 已更新
      nextTick(() => {
        checkAndLoadMore()
      })
    }
  }, { immediate: true })

  // 監聽 canLoadMore 變化，當變為 true 時檢查是否需要載入
  // 只有在首次資料載入完成後才響應
  watch(canLoadMore, (newValue) => {
    if (newValue && hasInitialDataLoaded.value) {
      nextTick(() => {
        checkAndLoadMore()
      })
    }
  })

  return {
    loadingMore,
    checkAndLoadMore
  }
}
