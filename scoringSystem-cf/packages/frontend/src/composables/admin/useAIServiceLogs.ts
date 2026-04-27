/**
 * AI Service Logs Composable using TanStack Query
 *
 * Provides:
 * - useAIServiceLogs() - Get AI service logs with infinite scroll
 * - useAIServiceStatistics() - Get AI service usage statistics
 * - useAIServiceLogDetail() - Get details of a specific AI service call
 *
 * This composable is for the admin AIServiceLogsManagement component.
 */

import type { UseInfiniteQueryReturnType, UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'
import type { AIServiceLog } from '@repo/shared'

// ============================================================================
// Types
// ============================================================================

export interface AIServiceFilters {
  serviceType?: string
  status?: string
  userId?: string
  projectId?: string
  startTime?: number
  endTime?: number
}

export interface AIServiceStatistics {
  totalCalls: number
  successCount: number
  errorCount: number
  totalTokens: number
  totalCost: number
  averageLatency: number
  serviceBreakdown?: {
    serviceType: string
    count: number
    tokens: number
    cost: number
  }[]
  dailyUsage?: {
    date: string
    calls: number
    tokens: number
    cost: number
  }[]
}

interface AIServiceLogsPage {
  logs: AIServiceLog[]
  totalCount: number
  hasMore: boolean
  nextOffset: number
}

interface UseAIServiceLogsOptions {
  filters?: Ref<AIServiceFilters> | ComputedRef<AIServiceFilters>
  limit?: number
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useAIServiceLogs - Infinite Query for AI Service Logs
// ============================================================================

/**
 * Get AI service logs with infinite scroll support
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with AI service logs
 */
export function useAIServiceLogs(
  options?: UseAIServiceLogsOptions
): UseInfiniteQueryReturnType<AIServiceLogsPage, Error> {
  const userQuery = useCurrentUser()
  const limit = options?.limit ?? 50

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useInfiniteQuery({
    queryKey: computed(() => {
      const filters = getValue(options?.filters ?? {})
      return [
        'admin',
        'ai-service-logs',
        limit,
        JSON.stringify(filters)
      ]
    }),
    queryFn: async ({ pageParam }): Promise<AIServiceLogsPage> => {
      const filters = getValue(options?.filters ?? {})
      const queryParams: Record<string, unknown> = {
        limit,
        offset: pageParam as number
      }

      if (filters.serviceType) queryParams.serviceType = filters.serviceType
      if (filters.status) queryParams.status = filters.status
      if (filters.userId) queryParams.userId = filters.userId
      if (filters.projectId) queryParams.projectId = filters.projectId
      if (filters.startTime) queryParams.startTime = filters.startTime
      if (filters.endTime) queryParams.endTime = filters.endTime

      const response = await adminApi.aiServiceLogs.query(queryParams as any)

      if (!response.success) {
        throw new Error(response.error?.message || '載入 AI 服務日誌失敗')
      }

      const data = response.data as any
      const logs = data?.logs || []
      const totalCount = data?.totalCount || 0
      const currentOffset = pageParam as number
      const hasMore = currentOffset + logs.length < totalCount

      return {
        logs,
        totalCount,
        hasMore,
        nextOffset: currentOffset + logs.length
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2
  })
}

// ============================================================================
// useAIServiceStatistics - Query for AI Service Statistics
// ============================================================================

/**
 * Get AI service usage statistics
 *
 * @returns Query result with AI service statistics
 */
export function useAIServiceStatistics(): UseQueryReturnType<AIServiceStatistics, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'ai-service-logs', 'statistics'],
    queryFn: async (): Promise<AIServiceStatistics> => {
      const response = await adminApi.aiServiceLogs.statistics()

      if (!response.success) {
        throw new Error(response.error?.message || '載入 AI 服務統計失敗')
      }

      return response.data as unknown as AIServiceStatistics
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5
  })
}

// ============================================================================
// useAIServiceLogDetail - Query/Mutation for Log Details
// ============================================================================

interface AIServiceLogDetailResult {
  log: AIServiceLog
  childCalls?: AIServiceLog[]
  parentCall?: AIServiceLog
}

/**
 * Get detailed information about a specific AI service call
 * Uses mutation pattern for on-demand fetching
 */
export function useAIServiceLogDetail(): UseMutationReturnType<
  AIServiceLogDetailResult,
  Error,
  string,
  unknown
> {
  return useMutation({
    mutationFn: async (callId: string): Promise<AIServiceLogDetailResult> => {
      const response = await adminApi.aiServiceLogs.detail(callId)

      if (!response.success) {
        throw new Error(response.error?.message || '載入 AI 服務日誌詳情失敗')
      }

      return response.data as unknown as AIServiceLogDetailResult
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  AIServiceLog,
  AIServiceLogsPage,
  AIServiceLogDetailResult
}
