/**
 * Auto-refresh composable
 * 管理页面自动刷新倒计时
 */
import type { Ref, ComputedRef } from 'vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getUserPreferences } from '@/utils/userPreferences'
import { useCurrentUser } from '@/composables/useAuth'
import { debugLog } from '@/utils/debug'

interface AutoRefreshReturn {
  refreshTimer: Ref<number>
  elapsedTime: Ref<number>
  progressPercentage: ComputedRef<number>
  remainingSeconds: ComputedRef<number>
  remainingMinutes: ComputedRef<number>
  resetTimer: () => void
  triggerRefresh: () => void
}

export function useAutoRefresh(refreshCallback?: () => void): AutoRefreshReturn {
  const { data: currentUser } = useCurrentUser()
  // Default: 5 minutes (300 seconds) to align with TanStack Query's longest stale time
  // This ensures data is always fresh when auto-refresh triggers
  const refreshTimer = ref(300) // 300 seconds = 5 minutes (aligned with max staleTime)
  const elapsedTime = ref(0) // 已经过的时间（秒）
  let intervalId: number | null = null

  // 计算进度百分比 (0-100)
  const progressPercentage = computed(() => {
    if (refreshTimer.value === 0) return 0
    return Math.min(100, (elapsedTime.value / refreshTimer.value) * 100)
  })

  // 计算剩余时间（秒）
  const remainingSeconds = computed(() => {
    return Math.max(0, refreshTimer.value - elapsedTime.value)
  })

  // 计算剩余时间（分钟，向上取整）
  const remainingMinutes = computed(() => {
    return Math.ceil(remainingSeconds.value / 60)
  })

  // 从用户偏好读取 refreshTimer 设置
  const loadRefreshTimer = (): void => {
    if (!currentUser.value?.userId) return

    const prefs = getUserPreferences(currentUser.value.userId)
    if (prefs.refreshTimer) {
      refreshTimer.value = prefs.refreshTimer
    }
  }

  // 启动倒计时
  const startTimer = (): void => {
    stopTimer() // 先停止现有的定时器
    elapsedTime.value = 0

    intervalId = window.setInterval(() => {
      elapsedTime.value++

      // 时间到了，触发刷新
      if (elapsedTime.value >= refreshTimer.value) {
        debugLog('⏰ Auto-refresh triggered')
        triggerRefresh()
      }
    }, 1000) // 每秒更新一次
  }

  // 停止倒计时
  const stopTimer = (): void => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  // 重置倒计时
  const resetTimer = (): void => {
    elapsedTime.value = 0
    startTimer()
  }

  // 触发刷新
  const triggerRefresh = (): void => {
    if (typeof refreshCallback === 'function') {
      refreshCallback()
    }
    resetTimer() // 刷新后重置计时器
  }

  // 监听用户偏好变化（用户在设置中修改了定时器或跨 Tab 同步）
  const handlePreferencesChange = (): void => {
    loadRefreshTimer()
    resetTimer() // 重置计时器以应用新的时间
  }

  // 监听 refreshTimer 变化（组件内部修改）
  watch(refreshTimer, (newValue) => {
    debugLog('🔄 Refresh timer changed to:', newValue + ' seconds')
    resetTimer()
  })

  onMounted(() => {
    loadRefreshTimer()
    startTimer()

    // 监听用户偏好变更事件（跨 Tab 同步 + 同 Tab 内更新）
    window.addEventListener('userPreferencesChanged', handlePreferencesChange)
    window.addEventListener('refreshTimerChanged', handlePreferencesChange)
  })

  onUnmounted(() => {
    stopTimer()
    window.removeEventListener('userPreferencesChanged', handlePreferencesChange)
    window.removeEventListener('refreshTimerChanged', handlePreferencesChange)
  })

  return {
    refreshTimer,
    elapsedTime,
    progressPercentage,
    remainingSeconds,
    remainingMinutes,
    resetTimer,
    triggerRefresh
  }
}
