/**
 * System Logs Composable using TanStack Query
 *
 * Provides:
 * - useSystemLogs() - Get system logs with infinite scroll
 * - useLogStatistics() - Get log statistics
 * - useEntityDetails() - Get entity details for log expansion
 *
 * This composable is specifically for the admin SystemLogs component
 * and waits for authentication to complete before fetching data.
 */

import type { UseInfiniteQueryReturnType, UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { fetchWithAuth, type ApiResponse } from '@/utils/api-helpers'
import { useCurrentUser } from '@/composables/useAuth'

// ============================================================================
// Types
// ============================================================================

export interface LogFilters {
  level?: string
  userId?: string[]
  action?: string[]
  entityType?: string[]
  projectId?: string[]
  message?: string
  startTime?: number
  endTime?: number
}

export interface LogEntry {
  logId: string
  createdAt: number
  level: string
  action?: string
  entityType?: string
  entityId?: string
  userId?: string
  displayName?: string
  projectId?: string
  message?: string
  context?: Record<string, unknown>
  relatedEntities?: Record<string, string>
}

export interface LogStatistics {
  totalLogs: number
  levelCounts: {
    info: number
    warning: number
    error: number
    critical: number
  }
  actionCounts?: Record<string, number>
  entityTypeCounts?: Record<string, number>
}

interface LogsPage {
  logs: LogEntry[]
  total: number
  hasMore: boolean
  nextOffset: number
}

interface UseSystemLogsOptions {
  filters?: Ref<LogFilters> | ComputedRef<LogFilters>
  limit?: number
  enabled?: Ref<boolean> | ComputedRef<boolean>
}

interface EntityDetailsResult {
  entityType: string
  entityId: string
  entity: Record<string, unknown>
  relatedEntities?: Record<string, string>
  context?: Record<string, unknown>
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useSystemLogs - Infinite Query for System Logs
// ============================================================================

/**
 * Get system logs with infinite scroll support
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with logs array and metadata
 *
 * @example
 * ```typescript
 * const filters = ref<LogFilters>({ level: 'error' })
 * const logsQuery = useSystemLogs({ filters })
 *
 * // Flatten all pages
 * const logs = computed(() =>
 *   logsQuery.data.value?.pages.flatMap(page => page.logs) || []
 * )
 *
 * // Total count
 * const totalCount = computed(() =>
 *   logsQuery.data.value?.pages[0]?.total || 0
 * )
 *
 * // Load more
 * function loadMore() {
 *   if (logsQuery.hasNextPage.value && !logsQuery.isFetchingNextPage.value) {
 *     logsQuery.fetchNextPage()
 *   }
 * }
 * ```
 */
export function useSystemLogs(
  options?: UseSystemLogsOptions
): UseInfiniteQueryReturnType<LogsPage, Error> {
  const userQuery = useCurrentUser()
  const limit = options?.limit ?? 50

  // Enable query only when authenticated
  const isEnabled = computed(() => {
    const userReady = userQuery.isSuccess.value && !!userQuery.data.value
    const customEnabled = options?.enabled ? getValue(options.enabled) : true
    return userReady && customEnabled
  })

  return useInfiniteQuery({
    queryKey: computed(() => {
      const filters = getValue(options?.filters ?? {})
      return [
        'admin',
        'system-logs',
        limit,
        JSON.stringify(filters)
      ]
    }),
    queryFn: async ({ pageParam }): Promise<LogsPage> => {
      const filters = getValue(options?.filters ?? {})
      const queryOptions: Record<string, unknown> = {
        limit,
        offset: pageParam as number
      }

      // Add filters to options
      if (filters.level) queryOptions.level = filters.level
      if (filters.userId?.length) queryOptions.userId = filters.userId
      if (filters.action?.length) queryOptions.action = filters.action
      if (filters.entityType?.length) queryOptions.entityType = filters.entityType
      if (filters.projectId?.length) queryOptions.projectId = filters.projectId
      if (filters.message) queryOptions.message = filters.message
      if (filters.startTime) queryOptions.startTime = filters.startTime
      if (filters.endTime) queryOptions.endTime = filters.endTime

      const response = await fetchWithAuth<ApiResponse<{
        logs: LogEntry[]
        total: number
      }>>(
        '/api/admin/system/logs',
        { method: 'POST', body: { options: queryOptions } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '載入系統日誌失敗')
      }

      const logs = response.data?.logs || []
      const total = response.data?.total || 0
      const currentOffset = pageParam as number
      const hasMore = currentOffset + logs.length < total

      return {
        logs,
        total,
        hasMore,
        nextOffset: currentOffset + logs.length
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

// ============================================================================
// useLogStatistics - Query for Log Statistics
// ============================================================================

/**
 * Get log statistics for dashboard display
 *
 * @returns Query result with log statistics
 */
export function useLogStatistics(): UseQueryReturnType<LogStatistics, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'system-logs', 'statistics'],
    queryFn: async (): Promise<LogStatistics> => {
      const response = await fetchWithAuth<ApiResponse<LogStatistics>>(
        '/api/admin/system/log-statistics',
        { method: 'POST', body: {} }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '載入日誌統計失敗')
      }

      return response.data as LogStatistics
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache for statistics
  })
}

// ============================================================================
// useEntityDetails - Query for Entity Details
// ============================================================================

interface EntityDetailsParams {
  entityType: string
  entityId: string
}

/**
 * Get entity details for log expansion
 * This is a mutation-style query that fetches on demand
 *
 * @returns Mutation object for fetching entity details
 */
export function useEntityDetails(): UseMutationReturnType<
  EntityDetailsResult,
  Error,
  EntityDetailsParams,
  unknown
> {
  return useMutation({
    mutationFn: async ({ entityType, entityId }: EntityDetailsParams): Promise<EntityDetailsResult> => {
      const response = await fetchWithAuth<ApiResponse<EntityDetailsResult>>(
        '/api/admin/system/entity-details',
        { method: 'POST', body: { entityType, entityId } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '載入實體詳情失敗')
      }

      return response.data as EntityDetailsResult
    }
  })
}

// ============================================================================
// useLoginLogs - Specialized query for login logs
// ============================================================================

/**
 * Get login-specific logs (login_success, login_failed)
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with login logs
 */
export function useLoginLogs(
  options?: UseSystemLogsOptions
): UseInfiniteQueryReturnType<LogsPage, Error> {
  const userQuery = useCurrentUser()
  const limit = options?.limit ?? 50

  const isEnabled = computed(() => {
    const userReady = userQuery.isSuccess.value && !!userQuery.data.value
    const customEnabled = options?.enabled ? getValue(options.enabled) : true
    return userReady && customEnabled
  })

  return useInfiniteQuery({
    queryKey: computed(() => {
      const filters = getValue(options?.filters ?? {})
      return [
        'admin',
        'login-logs',
        limit,
        JSON.stringify(filters)
      ]
    }),
    queryFn: async ({ pageParam }): Promise<LogsPage> => {
      const filters = getValue(options?.filters ?? {})
      const queryOptions: Record<string, unknown> = {
        limit,
        offset: pageParam as number,
        action: ['login_success', 'login_failed'] // Fixed filter for login logs
      }

      // Add additional filters
      if (filters.userId?.length) queryOptions.userId = filters.userId
      if (filters.startTime) queryOptions.startTime = filters.startTime
      if (filters.endTime) queryOptions.endTime = filters.endTime

      const response = await fetchWithAuth<ApiResponse<{
        logs: LogEntry[]
        total: number
      }>>(
        '/api/admin/system/logs',
        { method: 'POST', body: { options: queryOptions } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '載入登入日誌失敗')
      }

      const logs = response.data?.logs || []
      const total = response.data?.total || 0
      const currentOffset = pageParam as number
      const hasMore = currentOffset + logs.length < total

      return {
        logs,
        total,
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
// Re-export types for consumer convenience
// ============================================================================

export type {
  LogsPage,
  EntityDetailsResult,
  EntityDetailsParams
}
