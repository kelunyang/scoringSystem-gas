/**
 * @fileoverview Transaction filter composable
 * 交易過濾 composable
 *
 * 單一職責：過濾交易列表
 * 可重用於任何交易列表過濾場景
 *
 * 支援混合模式：
 * - 前端過濾：在已載入的資料中搜尋
 * - 後端搜尋：當本地無結果且有更多資料時自動觸發
 *
 * 注意：分頁由 infinity scroll 處理，此 composable 不再負責顯示數量限制
 */

import { ref, computed, watch } from 'vue'
import { refDebounced, useDebounceFn } from '@vueuse/core'
import type { Transaction } from '@repo/shared' // Use shared Transaction type for consistency
import type { TransactionFilters } from './useWallet'

const DEBOUNCE_DELAY = 300 // ms
const BACKEND_SEARCH_DELAY = 500 // ms - longer delay for backend search

/**
 * Options for useTransactionFilter
 */
export interface TransactionFilterOptions {
  /** Callback to trigger backend search */
  onBackendSearch?: (filters: TransactionFilters) => Promise<void>
  /** Whether there are more transactions to load */
  hasMore?: { value: boolean }
}

/**
 * 交易過濾器
 * @param {import('vue').ComputedRef<Array>} transactions - 原始交易列表
 * @param {TransactionFilterOptions} options - 可選的配置選項
 * @returns {Object} 過濾狀態和方法
 */
export function useTransactionFilter(transactions: any, options?: TransactionFilterOptions) {
  // 過濾條件
  const dateRange = ref<[string, string] | null>(null)          // 日期範圍 [startTimestamp, endTimestamp]
  const pointsFilter = ref(null)
  const descriptionFilter = ref('')
  const userFilter = ref('')           // 使用者名稱或 Email 過濾
  const selectedStageIds = ref<string[]>([])      // 選中的階段 ID 數組
  const selectedTransactionTypes = ref<Transaction['transactionType'][]>([]) // 選中的交易類型數組

  // 後端搜尋狀態
  const isBackendSearching = ref(false)

  // Debounced text filters for better performance
  const debouncedDescriptionFilter = refDebounced(descriptionFilter, DEBOUNCE_DELAY)
  const debouncedUserFilter = refDebounced(userFilter, DEBOUNCE_DELAY)

  /**
   * 過濾後的交易列表
   */
  const filteredTransactions = computed(() => {
    if (!transactions.value || !Array.isArray(transactions.value)) {
      return []
    }

    let result = transactions.value

    // 1. 按日期範圍過濾
    if (dateRange.value && dateRange.value.length === 2) {
      const [start, end] = dateRange.value
      result = result.filter((tx: any) => {
        const txTime = tx.timestamp
        // +1 day (86400000ms) to include the end date
        return txTime >= parseInt(start) && txTime <= parseInt(end) + 86400000
      })
    }

    // 2. 按階段過濾（多選）
    if (selectedStageIds.value.length > 0) {
      result = result.filter((t: Transaction) => {
        // stageId is always a string (per shared types definition)
        return t.stageId && selectedStageIds.value.includes(t.stageId)
      })
    }

    // 3. 按交易類型過濾（多選）
    if (selectedTransactionTypes.value.length > 0) {
      result = result.filter((t: Transaction) =>
        selectedTransactionTypes.value.includes(t.transactionType)
      )
    }

    // 4. 按點數過濾（精確匹配）
    if (pointsFilter.value !== null && pointsFilter.value !== undefined) {
      result = result.filter((t: Transaction) => t.points === pointsFilter.value)
    }

    // 5. 按描述過濾（模糊搜索 - debounced）
    if (debouncedDescriptionFilter.value && debouncedDescriptionFilter.value.trim()) {
      const searchText = debouncedDescriptionFilter.value.trim().toLowerCase()
      result = result.filter((t: Transaction) =>
        t.description && t.description.toLowerCase().includes(searchText)
      )
    }

    // 6. 按使用者過濾（模糊搜索 userEmail 或 displayName - debounced）
    if (debouncedUserFilter.value && debouncedUserFilter.value.trim()) {
      const searchText = debouncedUserFilter.value.trim().toLowerCase()
      result = result.filter((t: Transaction) => {
        const email = (t.userEmail || '').toLowerCase()
        const displayName = (t.displayName || '').toLowerCase()
        return email.includes(searchText) || displayName.includes(searchText)
      })
    }

    // 分頁由 infinity scroll 處理，此處不再限制顯示數量
    return result
  })

  /**
   * 設置點數過濾
   * @param {number|null} points - 點數值
   */
  function setPointsFilter(points: any) {
    pointsFilter.value = points
  }

  /**
   * 設置描述過濾
   * @param {string} text - 搜索文本
   */
  function setDescriptionFilter(text: any) {
    descriptionFilter.value = text
  }

  /**
   * 清除所有過濾條件
   */
  function clearFilters() {
    dateRange.value = null
    pointsFilter.value = null
    descriptionFilter.value = ''
    userFilter.value = ''
    selectedStageIds.value = []
    selectedTransactionTypes.value = []
  }

  /**
   * 檢查是否有啟用的過濾器
   */
  const hasActiveFilters = computed(() => {
    return dateRange.value !== null ||
           pointsFilter.value !== null ||
           descriptionFilter.value !== '' ||
           userFilter.value !== '' ||
           selectedStageIds.value.length > 0 ||
           selectedTransactionTypes.value.length > 0
  })

  /**
   * 構建後端搜尋參數
   */
  function buildBackendFilters(): TransactionFilters {
    return {
      transactionTypes: selectedTransactionTypes.value.length > 0 ? selectedTransactionTypes.value : undefined,
      dateStart: dateRange.value ? parseInt(dateRange.value[0]) : undefined,
      dateEnd: dateRange.value ? parseInt(dateRange.value[1]) : undefined,
      searchDescription: debouncedDescriptionFilter.value?.trim() || undefined,
      searchUser: debouncedUserFilter.value?.trim() || undefined
    }
  }

  /**
   * 智慧後端搜尋：本地無結果且有更多資料時自動觸發
   */
  const debouncedBackendSearch = useDebounceFn(async () => {
    if (
      filteredTransactions.value.length === 0 &&
      options?.hasMore?.value &&
      hasActiveFilters.value &&
      !isBackendSearching.value &&
      options?.onBackendSearch
    ) {
      isBackendSearching.value = true
      try {
        await options.onBackendSearch(buildBackendFilters())
      } finally {
        isBackendSearching.value = false
      }
    }
  }, BACKEND_SEARCH_DELAY)

  // 監聽過濾條件變化，觸發智慧搜尋
  watch(
    [selectedTransactionTypes, dateRange, debouncedDescriptionFilter, debouncedUserFilter, selectedStageIds],
    () => {
      // 先嘗試前端過濾，無結果時觸發後端搜尋
      if (filteredTransactions.value.length === 0 && options?.hasMore?.value) {
        debouncedBackendSearch()
      }
    }
  )

  return {
    // 過濾條件
    dateRange,
    pointsFilter,
    descriptionFilter,
    userFilter,
    selectedStageIds,
    selectedTransactionTypes,

    // 過濾結果
    filteredTransactions,

    // 狀態
    hasActiveFilters,
    isBackendSearching,

    // 方法
    setPointsFilter,
    setDescriptionFilter,
    clearFilters,
    buildBackendFilters
  }
}
