import { ref, computed, watch, onUnmounted, type ComputedRef } from 'vue'

export interface InfiniteScrollOptions {
  pageSize?: number
  initialSize?: number
}

/**
 * Manages infinite scroll pagination for large lists
 * Properly handles timer cleanup to prevent memory leaks
 */
export function useInfiniteScroll<T>(
  items: ComputedRef<T[]>,
  options: InfiniteScrollOptions = {}
) {
  const { pageSize = 50, initialSize = 50 } = options

  const displayCount = ref(initialSize)
  const loadingMore = ref(false)

  // Use ref for proper cleanup (prevents memory leaks)
  const loadMoreTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Currently displayed items (sliced from full list)
   */
  const displayedItems = computed(() => {
    // Defensive check to prevent undefined errors during initial render
    if (!items.value) return []
    return items.value.slice(0, displayCount.value)
  })

  /**
   * Whether infinite scroll should be disabled
   */
  const scrollDisabled = computed(() => {
    // Defensive check to prevent undefined errors
    if (!items.value) return true
    return loadingMore.value || displayedItems.value.length >= items.value.length
  })

  /**
   * Load more items (debounced)
   */
  const loadMore = () => {
    if (scrollDisabled.value) return

    // Clear previous timer if exists
    if (loadMoreTimer.value !== null) {
      clearTimeout(loadMoreTimer.value)
    }

    loadingMore.value = true

    // Debounce to avoid rapid firing
    loadMoreTimer.value = setTimeout(() => {
      displayCount.value += pageSize
      loadingMore.value = false
      loadMoreTimer.value = null
    }, 300)
  }

  /**
   * Reset display count to initial size
   */
  const reset = () => {
    displayCount.value = initialSize
  }

  /**
   * Reset display count when items change (e.g., filters applied)
   */
  watch(
    () => items.value?.length ?? 0,
    () => {
      displayCount.value = initialSize
    }
  )

  /**
   * Cleanup timer on unmount
   */
  onUnmounted(() => {
    if (loadMoreTimer.value !== null) {
      clearTimeout(loadMoreTimer.value)
    }
  })

  return {
    // State
    displayCount,
    loadingMore,

    // Computed
    displayedItems,
    scrollDisabled,

    // Methods
    loadMore,
    reset
  }
}
