/**
 * @fileoverview Transaction filter composable
 * 交易過濾 composable
 *
 * 單一職責：過濾和限制交易列表顯示
 * 可重用於任何交易列表過濾場景
 */

import { ref, computed } from 'vue'
import { refDebounced } from '@vueuse/core'
import type { Transaction } from '@repo/shared' // Use shared Transaction type for consistency

const DEFAULT_DISPLAY_LIMIT = 50
const DEBOUNCE_DELAY = 300 // ms

/**
 * 交易過濾器
 * @param {import('vue').ComputedRef<Array>} transactions - 原始交易列表
 * @returns {Object} 過濾狀態和方法
 */
export function useTransactionFilter(transactions: any) {
  // 過濾條件
  const dateRange = ref<[string, string] | null>(null)          // 日期範圍 [startTimestamp, endTimestamp]
  const pointsFilter = ref(null)
  const descriptionFilter = ref('')
  const userFilter = ref('')           // 使用者名稱或 Email 過濾
  const displayLimit = ref(DEFAULT_DISPLAY_LIMIT)
  const selectedStageIds = ref<string[]>([])      // 選中的階段 ID 數組
  const selectedTransactionTypes = ref<Transaction['transactionType'][]>([]) // 選中的交易類型數組

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

    // 7. 限制顯示數量（transactions 已經排序過了）
    return result.slice(0, displayLimit.value)
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
   * 設置顯示限制
   * @param {number} limit - 顯示數量
   */
  function setDisplayLimit(limit: any) {
    displayLimit.value = limit
  }

  /**
   * 清除所有過濾條件
   */
  function clearFilters() {
    dateRange.value = null
    pointsFilter.value = null
    descriptionFilter.value = ''
    userFilter.value = ''
    displayLimit.value = DEFAULT_DISPLAY_LIMIT
    selectedStageIds.value = []
    selectedTransactionTypes.value = []
  }

  return {
    // 過濾條件
    dateRange,
    pointsFilter,
    descriptionFilter,
    userFilter,
    displayLimit,
    selectedStageIds,
    selectedTransactionTypes,

    // 過濾結果
    filteredTransactions,

    // 方法
    setPointsFilter,
    setDescriptionFilter,
    setDisplayLimit,
    clearFilters
  }
}
