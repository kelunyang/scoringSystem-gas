import { reactive } from 'vue'

export interface UseExpandableOptions {
  /**
   * 是否啟用單一展開模式（展開新項目時自動收起其他項目）
   * @default true
   */
  singleMode?: boolean
}

export interface UseExpandableReturn<T = any> {
  /** 已展開的 ID Set (reactive) */
  expandedIds: ReturnType<typeof reactive<Set<string>>>
  /** 內容快取 Map (reactive) */
  contentMap: ReturnType<typeof reactive<Map<string, T>>>
  /** 載入中的 ID Set (reactive) */
  loadingIds: ReturnType<typeof reactive<Set<string>>>
  /** 切換展開狀態 */
  toggleExpansion: (id: string, loadFn?: () => Promise<T>) => Promise<void>
  /** 檢查是否已展開 */
  isExpanded: (id: string) => boolean
  /** 檢查是否載入中 */
  isLoading: (id: string) => boolean
  /** 收起所有項目 */
  collapseAll: () => void
  /** 獲取快取內容 */
  getContent: (id: string) => T | undefined
  /** 設置內容（手動快取） */
  setContent: (id: string, content: T) => void
}

/**
 * 可展開列表項目的 Composable
 *
 * @example
 * ```ts
 * const { expandedIds, toggleExpansion, isExpanded } = useExpandable<Member[]>({
 *   singleMode: true
 * })
 *
 * // 展開並載入內容
 * await toggleExpansion('group-123', async () => {
 *   const res = await api.getGroupMembers('group-123')
 *   return res.data
 * })
 *
 * // 檢查展開狀態
 * if (isExpanded('group-123')) {
 *   const members = getContent('group-123')
 * }
 * ```
 */
export function useExpandable<T = any>(
  options: UseExpandableOptions = {}
): UseExpandableReturn<T> {
  const { singleMode = true } = options

  // 使用 reactive 包裝 Set 和 Map 以保持響應式
  const expandedIds = reactive(new Set<string>())
  const contentMap = reactive(new Map<string, T>())
  const loadingIds = reactive(new Set<string>())

  /**
   * 切換展開狀態
   * @param id - 項目 ID
   * @param loadFn - 可選的非同步載入函數，返回要快取的內容
   */
  const toggleExpansion = async (
    id: string,
    loadFn?: () => Promise<T>
  ): Promise<void> => {
    // 如果已展開，則收起
    if (expandedIds.has(id)) {
      expandedIds.delete(id)
      return
    }

    // 單一展開模式：收起其他項目
    if (singleMode) {
      expandedIds.clear()
    }

    // 展開項目
    expandedIds.add(id)

    // 如果提供了載入函數且內容未快取，則載入
    if (loadFn && !contentMap.has(id)) {
      loadingIds.add(id)
      try {
        const content = await loadFn()
        ;(contentMap as Map<string, T>).set(id, content)
      } catch (error) {
        console.error(`Failed to load content for ${id}:`, error)
        // 載入失敗時收起
        expandedIds.delete(id)
        throw error
      } finally {
        loadingIds.delete(id)
      }
    }
  }

  /**
   * 檢查項目是否已展開
   */
  const isExpanded = (id: string): boolean => {
    return expandedIds.has(id)
  }

  /**
   * 檢查項目是否載入中
   */
  const isLoading = (id: string): boolean => {
    return loadingIds.has(id)
  }

  /**
   * 收起所有項目
   */
  const collapseAll = (): void => {
    expandedIds.clear()
  }

  /**
   * 獲取快取內容
   */
  const getContent = (id: string): T | undefined => {
    return (contentMap as Map<string, T>).get(id)
  }

  /**
   * 設置內容（手動快取）
   */
  const setContent = (id: string, content: T): void => {
    ;(contentMap as Map<string, T>).set(id, content)
  }

  return {
    expandedIds,
    contentMap,
    loadingIds,
    toggleExpansion,
    isExpanded,
    isLoading,
    collapseAll,
    getContent,
    setContent,
  }
}
