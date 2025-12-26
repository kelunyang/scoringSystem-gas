/**
 * @fileoverview Expandable list composable
 * 可展開列表 composable
 *
 * 單一職責：管理列表項的展開/收起狀態
 * 可重用於任何需要展開功能的列表（交易、評論、FAQ等）
 */

import { ref, computed } from 'vue'

/**
 * 可展開列表狀態管理
 * @returns {Object} 展開狀態和方法
 */
export function useExpandableList() {
  // 使用數組而不是 Set，避免手動觸發響應式
  const expandedIds = ref<string[]>([])

  /**
   * 切換項目的展開狀態
   * @param {string} itemId - 項目 ID
   * @param {Function} [onExpand] - 展開時的回調函數
   */
  function toggle(itemId: string, onExpand: any) {
    const index = expandedIds.value.indexOf(itemId)

    if (index > -1) {
      // 已展開，收起
      expandedIds.value.splice(index, 1)
    } else {
      // 未展開，展開
      expandedIds.value.push(itemId)

      // 如果有回調函數，執行它（例如加載詳情）
      if (onExpand && typeof onExpand === 'function') {
        onExpand(itemId)
      }
    }
  }

  /**
   * 展開項目
   * @param {string} itemId - 項目 ID
   * @param {Function} [onExpand] - 展開時的回調函數
   */
  function expand(itemId: string, onExpand: any) {
    if (!expandedIds.value.includes(itemId)) {
      expandedIds.value.push(itemId)

      if (onExpand && typeof onExpand === 'function') {
        onExpand(itemId)
      }
    }
  }

  /**
   * 收起項目
   * @param {string} itemId - 項目 ID
   */
  function collapse(itemId: string) {
    const index = expandedIds.value.indexOf(itemId)
    if (index > -1) {
      expandedIds.value.splice(index, 1)
    }
  }

  /**
   * 檢查項目是否展開
   * @param {string} itemId - 項目 ID
   * @returns {boolean}
   */
  function isExpanded(itemId: string) {
    return expandedIds.value.includes(itemId)
  }

  /**
   * 展開所有項目
   * @param {Array<string>} itemIds - 所有項目的 ID 列表
   * @param {Function} [onExpand] - 展開時的回調函數
   */
  function expandAll(itemIds: any, onExpand: any) {
    expandedIds.value = [...itemIds]

    if (onExpand && typeof onExpand === 'function') {
      itemIds.forEach((id: string) => onExpand(id))
    }
  }

  /**
   * 收起所有項目
   */
  function collapseAll() {
    expandedIds.value = []
  }

  /**
   * 展開的項目數量
   */
  const expandedCount = computed(() => expandedIds.value.length)

  return {
    expandedIds,
    expandedCount,
    toggle,
    expand,
    collapse,
    isExpanded,
    expandAll,
    collapseAll
  }
}
