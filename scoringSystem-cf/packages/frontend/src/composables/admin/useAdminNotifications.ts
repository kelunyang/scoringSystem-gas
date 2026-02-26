/**
 * Admin Notifications Composable using TanStack Query
 *
 * Provides:
 * - useAdminNotifications() - Get notifications with infinite scroll
 * - useNotificationStatistics() - Get notification statistics
 * - useSendNotification() - Send a notification
 * - useDeleteNotification() - Delete a notification
 *
 * This composable is for the admin NotificationManagement component.
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

export interface AdminNotification {
  notificationId: string
  userId: string
  displayName?: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  createdAt: number
  readAt?: number
  metadata?: Record<string, unknown>
}

export interface NotificationFilters {
  type?: string
  isRead?: boolean
  userId?: string
  startTime?: number
  endTime?: number
}

export interface NotificationStatistics {
  totalNotifications: number
  unreadCount: number
  typeBreakdown: {
    info: number
    success: number
    warning: number
    error: number
  }
  recentActivity?: {
    date: string
    count: number
  }[]
}

interface NotificationsPage {
  notifications: AdminNotification[]
  totalCount: number
  hasMore: boolean
  nextOffset: number
}

interface UseAdminNotificationsOptions {
  filters?: Ref<NotificationFilters> | ComputedRef<NotificationFilters>
  limit?: number
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useAdminNotifications - Infinite Query for Notifications
// ============================================================================

/**
 * Get admin notifications with infinite scroll support
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with notifications
 */
export function useAdminNotifications(
  options?: UseAdminNotificationsOptions
): UseInfiniteQueryReturnType<NotificationsPage, Error> {
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
        'notifications',
        limit,
        JSON.stringify(filters)
      ]
    }),
    queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
      const filters = getValue(options?.filters ?? {})
      const queryParams: Record<string, unknown> = {
        limit,
        offset: pageParam as number
      }

      if (filters.type) queryParams.type = filters.type
      if (filters.isRead !== undefined) queryParams.isRead = filters.isRead
      if (filters.userId) queryParams.userId = filters.userId
      if (filters.startTime) queryParams.startTime = filters.startTime
      if (filters.endTime) queryParams.endTime = filters.endTime

      const response = await adminApi.notifications.list(queryParams as any)

      if (!response.success) {
        throw new Error(response.error?.message || '載入通知列表失敗')
      }

      const data = response.data as any
      const notifications = data?.notifications || []
      const totalCount = data?.totalCount || 0
      const currentOffset = pageParam as number
      const hasMore = currentOffset + notifications.length < totalCount

      return {
        notifications,
        totalCount,
        hasMore,
        nextOffset: currentOffset + notifications.length
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2
  })
}

// ============================================================================
// useNotificationStatistics - Query for Notification Statistics
// ============================================================================

/**
 * Get notification statistics for dashboard display
 *
 * @returns Query result with notification statistics
 */
export function useNotificationStatistics(): UseQueryReturnType<NotificationStatistics, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'notifications', 'statistics'],
    queryFn: async (): Promise<NotificationStatistics> => {
      const response = await adminApi.notifications.statistics()

      if (!response.success) {
        throw new Error(response.error?.message || '載入通知統計失敗')
      }

      return response.data as unknown as NotificationStatistics
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5
  })
}

// ============================================================================
// useSendNotification - Mutation to send a notification
// ============================================================================

interface SendNotificationParams {
  userId: string
  title: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
}

export function useSendNotification(): UseMutationReturnType<
  void,
  Error,
  SendNotificationParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: SendNotificationParams) => {
      const response = await adminApi.notifications.sendSingle(params as any)

      if (!response.success) {
        throw new Error(response.error?.message || '發送通知失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('通知已發送')
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`發送失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useSendBatchNotifications - Mutation to send notifications to multiple users
// ============================================================================

interface SendBatchNotificationsParams {
  userIds: string[]
  title: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
}

interface BatchSendResult {
  successCount: number
  failedCount: number
}

export function useSendBatchNotifications(): UseMutationReturnType<
  BatchSendResult,
  Error,
  SendBatchNotificationsParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: SendBatchNotificationsParams) => {
      const response = await adminApi.notifications.sendBatch(params as any)

      if (!response.success) {
        throw new Error(response.error?.message || '批量發送通知失敗')
      }

      return response.data as unknown as BatchSendResult
    },
    onSuccess: (data) => {
      if (data.failedCount === 0) {
        ElMessage.success(`成功發送 ${data.successCount} 則通知`)
      } else {
        ElMessage.warning(`成功: ${data.successCount}, 失敗: ${data.failedCount}`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`批量發送失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useDeleteNotification - Mutation to delete a notification
// ============================================================================

interface DeleteNotificationParams {
  notificationId: string
}

export function useDeleteNotification(): UseMutationReturnType<
  void,
  Error,
  DeleteNotificationParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ notificationId }: DeleteNotificationParams) => {
      const response = await adminApi.notifications.delete({ notificationId } as any)

      if (!response.success) {
        throw new Error(response.error?.message || '刪除通知失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('通知已刪除')
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`刪除失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  NotificationsPage,
  SendNotificationParams,
  SendBatchNotificationsParams,
  BatchSendResult,
  DeleteNotificationParams
}
