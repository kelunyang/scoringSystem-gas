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

import type { UseInfiniteQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'
import { apiErrorMessage, errorOf } from '@/utils/api-types'

// ============================================================================
// Types
// ============================================================================

/**
 * 管理端看到的通知。欄位對照 notifications 資料表
 * （migrations/0001_init_schema.sql:518），端點是 `SELECT *`。
 * 原本這裡寫的是 userId / message / createdAt，資料表沒有那些欄位。
 */
export interface AdminNotification {
  notificationId: string
  targetUserEmail: string
  type: string
  title: string
  content: string | null
  projectId: string | null
  isRead: number
  isDeleted: number
  emailSent: number
  createdTime: number
  readTime: number | null
  emailSentTime: number | null
  metadata: string | null
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

      const response = await adminApi.notifications.list(queryParams)

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '載入通知列表失敗')
      }

      const data = response.data
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

// ============================================================================
// useSendNotification - Mutation to send a notification
// ============================================================================

interface SendNotificationParams {
  userId: string
  title: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
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
      const response = await adminApi.notifications.delete({ notificationId })

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '刪除通知失敗')
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
// useSendNotificationEmail - Mutation to send email for a single notification
// ============================================================================

interface SendNotificationEmailParams {
  notificationId: string
}

export function useSendNotificationEmail(): UseMutationReturnType<
  void,
  Error,
  SendNotificationEmailParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ notificationId }: SendNotificationEmailParams) => {
      const response = await adminApi.notifications.sendSingle({ notificationId })

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '發送郵件失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('郵件發送成功')
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`發送失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useSendBatchNotificationEmails - Mutation to send emails for multiple notifications
// ============================================================================

interface SendBatchNotificationEmailsParams {
  notificationIds: string[]
}

/** 對照 sendBatchNotifications 的回應（handlers/notifications/admin.ts） */
interface BatchEmailSendResult {
  totalNotifications: number
  queuedCount: number
  failedCount: number
  sentIds: string[]
}

export function useSendBatchNotificationEmails(): UseMutationReturnType<
  BatchEmailSendResult,
  Error,
  SendBatchNotificationEmailsParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ notificationIds }: SendBatchNotificationEmailsParams) => {
      const response = await adminApi.notifications.sendBatch({ notificationIds })

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '批量發送郵件失敗')
      }

      return response.data
    },
    onSuccess: (data) => {
      if (data.failedCount === 0) {
        ElMessage.success(`成功發送 ${data.queuedCount} 封郵件`)
      } else {
        ElMessage.warning(`成功: ${data.queuedCount}, 失敗: ${data.failedCount}`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] })
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
  NotificationsPage,
  SendNotificationParams,
  SendBatchNotificationsParams,
  BatchSendResult,
  DeleteNotificationParams,
  SendNotificationEmailParams,
  SendBatchNotificationEmailsParams,
  BatchEmailSendResult
}
