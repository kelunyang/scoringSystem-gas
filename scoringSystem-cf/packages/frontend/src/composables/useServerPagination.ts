import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * Server-side pagination options
 */
export interface ServerPaginationOptions<T, F = Record<string, unknown>> {
  /** Page size for each request */
  pageSize?: number
  /** Initial page size (defaults to pageSize) */
  initialSize?: number
  /** Debounce time for search in ms */
  searchDebounceMs?: number
  /** Function to fetch data from server */
  fetchFn: (params: FetchParams<F>) => Promise<FetchResult<T>>
  /** Function to filter items locally (for smart search) */
  localFilterFn?: (items: T[], searchKeyword: string, filters: F) => T[]
  /** Key extractor for deduplication */
  getItemKey?: (item: T) => string
}

/**
 * Parameters passed to fetch function
 */
export interface FetchParams<F = Record<string, unknown>> {
  limit: number
  offset: number
  search?: string
  filters?: F
}

/**
 * Result from fetch function
 */
export interface FetchResult<T> {
  items: T[]
  totalCount: number
}

/**
 * Server-side pagination composable with smart search
 *
 * Features:
 * - True server-side pagination (infinite scroll)
 * - Smart search: local first, auto-fallback to backend
 * - Debounced search input
 * - Proper cleanup on unmount
 *
 * @example
 * ```ts
 * const {
 *   items,
 *   displayedItems,
 *   isLoading,
 *   hasMore,
 *   loadMore,
 *   search,
 *   reset
 * } = useServerPagination({
 *   pageSize: 50,
 *   fetchFn: async ({ limit, offset, search, filters }) => {
 *     const response = await api.getUsers({ limit, offset, search, ...filters })
 *     return { items: response.users, totalCount: response.totalCount }
 *   },
 *   localFilterFn: (items, keyword, filters) => {
 *     return items.filter(item =>
 *       item.name.toLowerCase().includes(keyword.toLowerCase())
 *     )
 *   }
 * })
 * ```
 */
export function useServerPagination<T, F = Record<string, unknown>>(
  options: ServerPaginationOptions<T, F>
) {
  const {
    pageSize = 50,
    initialSize = 50,
    searchDebounceMs = 300,
    fetchFn,
    localFilterFn,
    getItemKey = (item: T) => JSON.stringify(item)
  } = options

  // ==================== State ====================

  /** All loaded items from server */
  const items = ref<T[]>([]) as Ref<T[]>

  /** Total count from server */
  const totalCount = ref(0)

  /** Current offset for pagination */
  const offset = ref(0)

  /** Loading state */
  const isLoading = ref(false)

  /** Loading more state (for infinite scroll) */
  const isLoadingMore = ref(false)

  /** Current search keyword (debounced) */
  const searchKeyword = ref('')

  /** Raw search input (before debounce) */
  const searchKeywordRaw = ref('')

  /** Current filters */
  const filters = ref<F>({} as F) as Ref<F>

  /** Whether we're in backend search mode */
  const isBackendSearchMode = ref(false)

  /** Abort controller for cancelling requests */
  const abortController = ref<AbortController | null>(null)

  /** Timer for debounced operations */
  const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  /** Whether initial load has completed */
  const isInitialized = ref(false)

  /** Error state */
  const error = ref<Error | null>(null)

  // ==================== Computed ====================

  /**
   * Whether there are more items to load
   */
  const hasMore = computed(() => {
    return items.value.length < totalCount.value
  })

  /**
   * Whether infinite scroll should be disabled
   */
  const scrollDisabled = computed(() => {
    return isLoading.value || isLoadingMore.value || !hasMore.value
  })

  /**
   * Items after local filtering (for smart search)
   */
  const localFilteredItems = computed(() => {
    if (!searchKeyword.value || !localFilterFn) {
      return items.value
    }
    return localFilterFn(items.value, searchKeyword.value, filters.value)
  })

  /**
   * Items to display (uses local filtering when not in backend search mode)
   */
  const displayedItems = computed(() => {
    if (isBackendSearchMode.value) {
      // In backend search mode, show all loaded items (already filtered by server)
      return items.value
    }
    // In local mode, apply local filtering
    return localFilteredItems.value
  })

  /**
   * Whether local search found no results but there might be more on server
   */
  const shouldTriggerBackendSearch = computed(() => {
    if (!searchKeyword.value) return false
    if (isBackendSearchMode.value) return false
    if (!localFilterFn) return false

    // Local search found nothing, but server might have more
    return localFilteredItems.value.length === 0 && hasMore.value
  })

  // ==================== Methods ====================

  /**
   * Cancel any pending request
   */
  const cancelPendingRequest = () => {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
  }

  /**
   * Clear debounce timer
   */
  const clearDebounceTimer = () => {
    if (debounceTimer.value !== null) {
      clearTimeout(debounceTimer.value)
      debounceTimer.value = null
    }
  }

  /**
   * Fetch items from server
   */
  const fetchItems = async (
    mode: 'initial' | 'more' | 'search',
    searchTerm?: string
  ): Promise<void> => {
    cancelPendingRequest()
    abortController.value = new AbortController()

    const isInitialLoad = mode === 'initial'
    const isLoadMore = mode === 'more'
    const isSearch = mode === 'search'

    if (isInitialLoad || isSearch) {
      isLoading.value = true
      offset.value = 0
      if (isSearch) {
        isBackendSearchMode.value = true
      }
    } else {
      isLoadingMore.value = true
    }

    error.value = null

    try {
      const params: FetchParams<F> = {
        limit: isInitialLoad ? initialSize : pageSize,
        offset: isLoadMore ? offset.value : 0,
        filters: filters.value
      }

      // Add search term for backend search
      if (isSearch && searchTerm) {
        params.search = searchTerm
      } else if (isBackendSearchMode.value && searchKeyword.value) {
        params.search = searchKeyword.value
      }

      const result = await fetchFn(params)

      // Check if request was aborted
      if (abortController.value?.signal.aborted) {
        return
      }

      if (isLoadMore) {
        // Append new items, avoiding duplicates
        const existingKeys = new Set(items.value.map(getItemKey))
        const newItems = result.items.filter(item => !existingKeys.has(getItemKey(item)))
        items.value = [...items.value, ...newItems]
        offset.value += result.items.length
      } else {
        // Replace items
        items.value = result.items
        offset.value = result.items.length
      }

      totalCount.value = result.totalCount
      isInitialized.value = true

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return
      }
      error.value = err instanceof Error ? err : new Error(String(err))
      throw err
    } finally {
      isLoading.value = false
      isLoadingMore.value = false
    }
  }

  /**
   * Load initial data
   */
  const loadInitial = async (): Promise<void> => {
    isBackendSearchMode.value = false
    searchKeyword.value = ''
    searchKeywordRaw.value = ''
    await fetchItems('initial')
  }

  /**
   * Load more items (for infinite scroll)
   */
  const loadMore = async (): Promise<void> => {
    if (scrollDisabled.value) return

    clearDebounceTimer()

    // Debounce to prevent rapid firing
    return new Promise((resolve) => {
      debounceTimer.value = setTimeout(async () => {
        try {
          await fetchItems('more')
        } finally {
          debounceTimer.value = null
          resolve()
        }
      }, 200)
    })
  }

  /**
   * Search with smart fallback to backend
   *
   * Logic:
   * 1. Update search keyword
   * 2. Local filter first (if localFilterFn provided)
   * 3. If no local results and hasMore, auto-trigger backend search
   */
  const search = async (keyword: string): Promise<void> => {
    searchKeyword.value = keyword

    // If no keyword, reset to initial mode
    if (!keyword) {
      if (isBackendSearchMode.value) {
        // Was in backend mode, reload initial data
        await loadInitial()
      }
      return
    }

    // If local filter finds results, use them
    if (localFilterFn && localFilteredItems.value.length > 0) {
      isBackendSearchMode.value = false
      return
    }

    // If no local results but server might have more, trigger backend search
    if (hasMore.value || !localFilterFn) {
      await fetchItems('search', keyword)
    }
  }

  /**
   * Debounced search handler for input binding
   */
  const debouncedSearch = useDebounceFn(async (keyword: string) => {
    await search(keyword)
  }, searchDebounceMs)

  /**
   * Handle search input change
   */
  const onSearchInput = (keyword: string) => {
    searchKeywordRaw.value = keyword
    debouncedSearch(keyword)
  }

  /**
   * Force backend search (bypass local filtering)
   */
  const forceBackendSearch = async (keyword?: string): Promise<void> => {
    const searchTerm = keyword ?? searchKeyword.value
    if (searchTerm) {
      await fetchItems('search', searchTerm)
    }
  }

  /**
   * Update filters and reload
   */
  const updateFilters = async (newFilters: Partial<F>): Promise<void> => {
    filters.value = { ...filters.value, ...newFilters }

    if (isBackendSearchMode.value) {
      // In backend mode, re-fetch with new filters
      await fetchItems('search', searchKeyword.value)
    } else {
      // In local mode, reload initial data with new filters
      await fetchItems('initial')
    }
  }

  /**
   * Reset to initial state
   */
  const reset = async (): Promise<void> => {
    cancelPendingRequest()
    clearDebounceTimer()

    items.value = []
    totalCount.value = 0
    offset.value = 0
    searchKeyword.value = ''
    searchKeywordRaw.value = ''
    isBackendSearchMode.value = false
    error.value = null

    await loadInitial()
  }

  /**
   * Refresh current view (re-fetch with current parameters)
   */
  const refresh = async (): Promise<void> => {
    if (isBackendSearchMode.value && searchKeyword.value) {
      await fetchItems('search', searchKeyword.value)
    } else {
      await fetchItems('initial')
    }
  }

  // ==================== Watchers ====================

  // Auto-trigger backend search when local search finds nothing
  watch(shouldTriggerBackendSearch, async (shouldTrigger) => {
    if (shouldTrigger && searchKeyword.value) {
      await fetchItems('search', searchKeyword.value)
    }
  })

  // ==================== Cleanup ====================

  onUnmounted(() => {
    cancelPendingRequest()
    clearDebounceTimer()
  })

  // ==================== Return ====================

  return {
    // State
    items,
    totalCount,
    offset,
    isLoading,
    isLoadingMore,
    searchKeyword,
    searchKeywordRaw,
    filters,
    isBackendSearchMode,
    isInitialized,
    error,

    // Computed
    hasMore,
    scrollDisabled,
    displayedItems,
    localFilteredItems,

    // Methods
    loadInitial,
    loadMore,
    search,
    onSearchInput,
    forceBackendSearch,
    updateFilters,
    reset,
    refresh
  }
}

/**
 * Type helper for creating typed fetch functions
 */
export type ServerPaginationFetchFn<T, F = Record<string, unknown>> =
  (params: FetchParams<F>) => Promise<FetchResult<T>>
