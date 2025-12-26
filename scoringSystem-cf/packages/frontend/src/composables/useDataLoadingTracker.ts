/**
 * useDataLoadingTracker - 數據載入狀態追蹤器
 *
 * 用於集中管理多個異步數據載入狀態，
 * 確保所有數據載入完成後再觸發後續操作（如動畫）
 */

import { ref, computed } from 'vue'

export function useDataLoadingTracker() {
  // Map<string, boolean> - key: 載入源名稱, value: 是否正在載入
  const loadingStates = ref(new Map())

  /**
   * 設置某個載入源的狀態
   * @param {string} key - 載入源的唯一標識
   * @param {boolean} isLoading - 是否正在載入
   */
  const setLoading = (key: any, isLoading: boolean) => {
    loadingStates.value.set(key, isLoading)
    console.log(`📊 [LoadingTracker] ${key}: ${isLoading ? '載入中...' : '✅ 完成'}`)
  }

  /**
   * 檢查是否所有數據都已載入完成
   */
  const allLoaded = computed(() => {
    if (loadingStates.value.size === 0) {
      return false // 還沒有任何載入任務註冊
    }

    const allComplete = Array.from(loadingStates.value.values()).every(state => state === false)

    if (allComplete) {
      console.log('✨ [LoadingTracker] 所有數據載入完成！')
    }

    return allComplete
  })

  /**
   * 獲取當前載入狀態摘要（用於調試）
   */
  const getLoadingSummary = () => {
    const summary: Record<string, string> = {}
    loadingStates.value.forEach((isLoading, key) => {
      summary[key] = isLoading ? '載入中' : '完成'
    })
    return summary
  }

  /**
   * 重置所有載入狀態
   */
  const reset = () => {
    loadingStates.value.clear()
    console.log('🔄 [LoadingTracker] 重置所有載入狀態')
  }

  return {
    setLoading,
    allLoaded,
    loadingStates,
    getLoadingSummary,
    reset
  }
}
