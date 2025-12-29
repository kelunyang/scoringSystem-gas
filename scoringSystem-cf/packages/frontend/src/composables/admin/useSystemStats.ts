/**
 * @fileoverview 系統統計數據管理 Composable
 * 使用 TanStack Query 提供自動緩存、背景重新獲取和錯誤處理
 *
 * @example
 * ```ts
 * const { systemStats, invitationStats, isLoading, refreshAll } = useSystemStats()
 *
 * // 自動載入數據
 * watchEffect(() => {
 *   if (systemStats.value) {
 *     console.log('Total users:', systemStats.value.totalUsers)
 *   }
 * })
 *
 * // 手動刷新
 * await refreshAll()
 * ```
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import { useQuery, useQueries, type UseQueryReturnType } from '@tanstack/vue-query'
import { adminApi } from '@/api/admin'
import { rpcClient } from '@/utils/rpc-client'
import type { LogStatistics } from '@repo/shared/types/admin'
import type {
  SystemStats,
  InvitationStats,
  InvitationCode
} from '@/types/admin-stats'

/**
 * useSystemStats 返回類型
 */
export interface UseSystemStatsReturn {
  /** 系統統計數據 */
  systemStats: Ref<SystemStats | undefined>
  /** 邀請碼統計數據 */
  invitationStats: Ref<InvitationStats | undefined>
  /** 日誌統計數據 */
  logStats: Ref<LogStatistics | undefined>
  /** 是否正在載入任何數據 */
  isLoading: ComputedRef<boolean>
  /** 是否正在載入系統統計 */
  isLoadingSystem: Ref<boolean>
  /** 是否正在載入邀請碼統計 */
  isLoadingInvitations: Ref<boolean>
  /** 是否正在載入日誌統計 */
  isLoadingLogs: Ref<boolean>
  /** 系統統計錯誤 */
  systemError: Ref<Error | null>
  /** 邀請碼統計錯誤 */
  invitationsError: Ref<Error | null>
  /** 日誌統計錯誤 */
  logsError: Ref<Error | null>
  /** 刷新系統統計（直接暴露 TanStack Query refetch）*/
  refetchSystem: () => Promise<any>
  /** 刷新邀請碼統計（直接暴露 TanStack Query refetch）*/
  refetchInvitations: () => Promise<any>
  /** 刷新日誌統計（直接暴露 TanStack Query refetch）*/
  refetchLogs: () => Promise<any>
  /** 刷新所有統計數據 */
  refreshAll: () => Promise<void>
}

/**
 * useSystemStats Options
 */
export interface UseSystemStatsOptions {
  /** 是否啟用自動載入 */
  enabled?: boolean
  /** 是否啟用背景自動刷新 (預設: 關閉) */
  refetchInterval?: number | false
  /** 數據過期時間 (ms, 預設: 5 分鐘) */
  staleTime?: number
}

/**
 * 系統統計數據管理 Composable
 *
 * 提供系統、邀請碼、日誌等統計數據的自動獲取和管理
 * 使用 TanStack Query 實現自動緩存、背景更新和錯誤處理
 *
 * @param options - 配置選項
 * @returns 統計數據和操作方法
 */
export function useSystemStats(
  options: UseSystemStatsOptions = {}
): UseSystemStatsReturn {
  const {
    enabled = true,
    refetchInterval = false, // 預設關閉自動刷新
    staleTime = 5 * 60 * 1000 // 5 分鐘
  } = options

  // ============================================================================
  // 系統統計數據
  // ============================================================================
  const {
    data: systemStatsData,
    isLoading: isLoadingSystem,
    error: systemError,
    refetch: refetchSystem
  } = useQuery({
    queryKey: ['admin', 'stats', 'system'],
    queryFn: async () => {
      const response = await adminApi.system.stats()

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入系統統計數據')
      }

      // 添加 lastUpdate 時間戳
      return {
        ...response.data,
        lastUpdate: Date.now()
      } as SystemStats
    },
    enabled,
    staleTime,
    gcTime: 10 * 60 * 1000, // 10 分鐘
    refetchInterval,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  }) as UseQueryReturnType<SystemStats | undefined, Error>

  // ============================================================================
  // 邀請碼統計數據
  // ============================================================================
  const {
    data: invitationStatsData,
    isLoading: isLoadingInvitations,
    error: invitationsError,
    refetch: refetchInvitations
  } = useQuery({
    queryKey: ['admin', 'stats', 'invitations'],
    queryFn: async () => {
      const httpResponse = await rpcClient.invitations.list.$post({
        json: {}
      })

      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入邀請碼統計數據')
      }

      const invitations = response.data as InvitationCode[]
      const now = Date.now()

      // 計算各種狀態的邀請碼數量
      const stats: InvitationStats = {
        total: invitations.length,
        active: invitations.filter(
          (i) => i.status === 'active' && i.expiryTime > now
        ).length,
        expired: invitations.filter((i) => i.expiryTime <= now).length,
        used: invitations.filter((i) => i.status === 'used').length
      }

      return stats
    },
    enabled,
    staleTime,
    gcTime: 10 * 60 * 1000,
    refetchInterval,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  }) as UseQueryReturnType<InvitationStats | undefined, Error>

  // ============================================================================
  // 日誌統計數據
  // ============================================================================
  const {
    data: logStatsData,
    isLoading: isLoadingLogs,
    error: logsError,
    refetch: refetchLogs
  } = useQuery({
    queryKey: ['admin', 'stats', 'logs'],
    queryFn: async () => {
      const response = await adminApi.system.logStatistics()

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入日誌統計數據')
      }

      return response.data
    },
    enabled,
    staleTime,
    gcTime: 10 * 60 * 1000,
    refetchInterval,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  }) as UseQueryReturnType<LogStatistics | undefined, Error>

  // ============================================================================
  // Computed Properties
  // ============================================================================

  /**
   * 是否正在載入任何數據
   */
  const isLoading = computed(
    () =>
      isLoadingSystem.value ||
      isLoadingInvitations.value ||
      isLoadingLogs.value
  )

  // ============================================================================
  // Methods
  // ============================================================================

  /**
   * 並行刷新所有統計數據
   */
  const refreshAll = async () => {
    await Promise.all([
      refetchSystem(),
      refetchInvitations(),
      refetchLogs()
    ])
  }

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Data (直接返回 ref，不需要 computed 包裝)
    systemStats: systemStatsData,
    invitationStats: invitationStatsData,
    logStats: logStatsData,

    // Loading States
    isLoading,
    isLoadingSystem,
    isLoadingInvitations,
    isLoadingLogs,

    // Errors
    systemError,
    invitationsError,
    logsError,

    // Methods (直接暴露 TanStack Query 的 refetch，遵循 "Expose primitives" 原則)
    refetchSystem,
    refetchInvitations,
    refetchLogs,
    // 只保留組合方法
    refreshAll
  }
}
