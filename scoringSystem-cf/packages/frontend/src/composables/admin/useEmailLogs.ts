/**
 * Email Logs Composable using TanStack Query
 *
 * Provides:
 * - useEmailLogs() - Get email logs with infinite scroll
 * - useEmailStatistics() - Get email statistics
 * - useResendEmail() - Resend failed emails
 *
 * This composable is for the admin EmailLogsManagement component.
 */

import type { UseInfiniteQueryReturnType, UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'

// ============================================================================
// Types
// ============================================================================

export interface EmailLog {
  logId: string
  recipient: string
  subject: string
  status: 'sent' | 'failed' | 'pending'
  sentAt?: number
  createdAt: number
  errorMessage?: string
  templateType?: string
  metadata?: Record<string, unknown>
}

export interface EmailFilters {
  status?: string
  recipient?: string
  templateType?: string
  startTime?: number
  endTime?: number
}

export interface EmailStatistics {
  totalEmails: number
  sentCount: number
  failedCount: number
  pendingCount: number
  recentActivity?: {
    date: string
    count: number
  }[]
}

interface EmailLogsPage {
  logs: EmailLog[]
  totalCount: number
  hasMore: boolean
  nextOffset: number
}

interface UseEmailLogsOptions {
  filters?: Ref<EmailFilters> | ComputedRef<EmailFilters>
  limit?: number
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useEmailLogs - Infinite Query for Email Logs
// ============================================================================

/**
 * Get email logs with infinite scroll support
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with email logs
 */
export function useEmailLogs(
  options?: UseEmailLogsOptions
): UseInfiniteQueryReturnType<EmailLogsPage, Error> {
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
        'email-logs',
        limit,
        JSON.stringify(filters)
      ]
    }),
    queryFn: async ({ pageParam }): Promise<EmailLogsPage> => {
      const filters = getValue(options?.filters ?? {})
      const queryParams: Record<string, unknown> = {
        limit,
        offset: pageParam as number
      }

      if (filters.status) queryParams.status = filters.status
      if (filters.recipient) queryParams.recipient = filters.recipient
      if (filters.templateType) queryParams.templateType = filters.templateType
      if (filters.startTime) queryParams.startTime = filters.startTime
      if (filters.endTime) queryParams.endTime = filters.endTime

      const response = await adminApi.emailLogs.query(queryParams as any)

      if (!response.success) {
        throw new Error(response.error?.message || '載入郵件日誌失敗')
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
// useEmailStatistics - Query for Email Statistics
// ============================================================================

/**
 * Get email statistics for dashboard display
 *
 * @returns Query result with email statistics
 */
export function useEmailStatistics(): UseQueryReturnType<EmailStatistics, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'email-logs', 'statistics'],
    queryFn: async (): Promise<EmailStatistics> => {
      const response = await adminApi.emailLogs.statistics()

      if (!response.success) {
        throw new Error(response.error?.message || '載入郵件統計失敗')
      }

      return response.data as unknown as EmailStatistics
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5
  })
}

// ============================================================================
// useResendEmail - Mutation to resend a single email
// ============================================================================

interface ResendEmailParams {
  logId: string
}

export function useResendEmail(): UseMutationReturnType<void, Error, ResendEmailParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ logId }: ResendEmailParams) => {
      const response = await adminApi.emailLogs.resendSingle({ logId } as any)

      if (!response.success) {
        throw new Error(response.error?.message || '重新發送郵件失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('郵件已重新發送')
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-logs'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`發送失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useBatchResendEmails - Mutation to resend multiple emails
// ============================================================================

interface BatchResendParams {
  logIds: string[]
}

interface BatchResendResult {
  successCount: number
  failedCount: number
}

export function useBatchResendEmails(): UseMutationReturnType<
  BatchResendResult,
  Error,
  BatchResendParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ logIds }: BatchResendParams) => {
      const response = await adminApi.emailLogs.resendBatch({ logIds } as any)

      if (!response.success) {
        throw new Error(response.error?.message || '批量重新發送郵件失敗')
      }

      return response.data as unknown as BatchResendResult
    },
    onSuccess: (data) => {
      if (data.failedCount === 0) {
        ElMessage.success(`成功重新發送 ${data.successCount} 封郵件`)
      } else {
        ElMessage.warning(`成功: ${data.successCount}, 失敗: ${data.failedCount}`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-logs'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`批量發送失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  EmailLogsPage,
  ResendEmailParams,
  BatchResendParams,
  BatchResendResult
}
