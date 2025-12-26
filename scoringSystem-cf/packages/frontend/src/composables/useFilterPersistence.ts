/**
 * 過濾器持久化 Composable
 * 使用 localStorage 存儲用戶的過濾器偏好（按 userId 包裹）
 */

import { ref, watch, onMounted, type Ref } from 'vue'
import { useCurrentUser } from './useAuth'
import { getUserPreferences, setUserPreference } from '@/utils/userPreferences'
import type { UserPrefs } from '@/utils/userPreferences'

/**
 * 過濾器持久化 Hook
 * @param pageKey 頁面識別鍵（如 'systemLogs', 'userManagement'）
 * @param defaultFilters 預設過濾器值
 * @returns 響應式過濾器狀態和相關方法
 *
 * @example
 * const { filters, resetFilters, isLoaded } = useFilterPersistence('systemLogs', {
 *   dateRange: null,
 *   selectedLevel: '',
 *   searchKeyword: ''
 * })
 */
export function useFilterPersistence<T extends Record<string, any>>(
  pageKey: string,
  defaultFilters: T
) {
  const { data: currentUser } = useCurrentUser()
  const filters: Ref<T> = ref({ ...defaultFilters }) as Ref<T>
  const isLoaded = ref(false)

  // 構建 localStorage 鍵名
  const prefKey = `adminFilters_${pageKey}` as keyof UserPrefs

  // 載入已保存的過濾器
  const loadFilters = () => {
    if (!currentUser.value?.userId) {
      console.warn('[useFilterPersistence] currentUser not available, using default filters')
      isLoaded.value = true
      return
    }

    try {
      const userPrefs = getUserPreferences(currentUser.value.userId)
      const saved = userPrefs[prefKey]

      if (saved && typeof saved === 'object') {
        // 合併預設值和已保存的值（保留預設值的結構）
        filters.value = { ...defaultFilters, ...saved } as T
        console.log(`[useFilterPersistence] Loaded filters for ${pageKey}:`, filters.value)
      } else {
        // 沒有保存的值，使用預設值
        filters.value = { ...defaultFilters } as T
        console.log(`[useFilterPersistence] No saved filters for ${pageKey}, using defaults`)
      }
    } catch (error) {
      console.error(`[useFilterPersistence] Failed to load filters for ${pageKey}:`, error)
      filters.value = { ...defaultFilters } as T
    }

    isLoaded.value = true
  }

  // 保存過濾器（防抖 500ms）
  let saveTimer: NodeJS.Timeout | null = null
  const saveFilters = () => {
    if (!currentUser.value?.userId) {
      return
    }

    if (!isLoaded.value) {
      // 尚未載入完成，不要保存（避免覆蓋已保存的值）
      return
    }

    // 清除之前的計時器
    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    // 500ms 後保存
    saveTimer = setTimeout(() => {
      try {
        setUserPreference(
          currentUser.value!.userId,
          prefKey,
          filters.value
        )
        console.log(`[useFilterPersistence] Saved filters for ${pageKey}`)
      } catch (error) {
        console.error(`[useFilterPersistence] Failed to save filters for ${pageKey}:`, error)
      }
    }, 500)
  }

  // 重置過濾器
  const resetFilters = () => {
    filters.value = { ...defaultFilters } as T
    console.log(`[useFilterPersistence] Reset filters for ${pageKey}`)
    // 立即保存重置後的值
    if (currentUser.value?.userId) {
      setUserPreference(
        currentUser.value.userId,
        prefKey,
        filters.value
      )
    }
  }

  // 監聽過濾器變化並自動保存
  watch(filters, saveFilters, { deep: true })

  // 組件掛載時載入
  onMounted(() => {
    loadFilters()
  })

  // 監聽用戶變化（如果用戶登出再登入，重新載入過濾器）
  watch(() => currentUser.value?.userId, (newUserId, oldUserId) => {
    if (newUserId && newUserId !== oldUserId) {
      console.log(`[useFilterPersistence] User changed, reloading filters for ${pageKey}`)
      loadFilters()
    }
  })

  return {
    /**
     * 響應式過濾器狀態
     */
    filters,

    /**
     * 是否已載入完成
     */
    isLoaded,

    /**
     * 重置過濾器為預設值
     */
    resetFilters,

    /**
     * 手動載入過濾器（通常不需要，組件掛載時會自動載入）
     */
    loadFilters
  }
}
