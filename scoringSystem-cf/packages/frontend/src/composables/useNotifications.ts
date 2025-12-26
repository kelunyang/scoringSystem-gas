/**
 * @fileoverview Notifications composable using TanStack Query
 * 通知系統 composable（使用 TanStack Query）
 *
 * Phase 4.5 - TanStack Query 重構
 * 提供自動重試、緩存、錯誤處理等功能
 */

import { useQuery, useMutation, useQueryClient, type UseQueryReturnType } from '@tanstack/vue-query'
import { computed, ref, isRef, type ComputedRef } from 'vue'
import { handleError, showSuccess } from '@/utils/errorHandler'
import { isTokenExpired } from '@/utils/jwt'
import { useAuth } from './useAuth'
import { rpcClient } from '@/utils/rpc-client'
import type { Notification, ApiResponse } from '@/types'

/**
 * Notification list options
 */
export interface NotificationListOptions {
  page?: number
  pageSize?: number
  filter?: 'all' | 'unread' | 'read'
}

/**
 * Notification list response
 */
export interface NotificationListResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
  totalCount?: number
  hasMore?: boolean
}

/**
 * 獲取通知數量
 * @returns {Object} TanStack Query 結果
 */
export function useNotificationCount(): UseQueryReturnType<number, Error> {
  // Vue 3 Best Practice: Use unified useAuth() composable
  const { token, isAuthenticated } = useAuth()

  return useQuery({
    queryKey: ['notificationCount'],
    queryFn: async (): Promise<number> => {
      console.log('📬 [useNotifications] 載入通知數量...')

      const httpResponse = await rpcClient.api.notifications.count.$post()
      const response = await httpResponse.json() as ApiResponse<{ unreadCount: number }>

      if (!response.success) {
        throw new Error(response.error?.message || '載入通知數量失敗')
      }

      const count = response.data?.unreadCount || 0
      console.log(`📬 [useNotifications] 通知數量: ${count}`)

      return count
    },

    // ✅ JWT 認證檢查：只在用戶已登入且 token 有效時才執行查詢
    enabled: computed(() => {
      if (!token.value) {
        console.log('📬 [useNotificationCount] Query disabled: 未登入')
        return false
      }

      if (isTokenExpired(token.value)) {
        console.log('📬 [useNotificationCount] Query disabled: Token 已過期')
        return false
      }

      console.log('📬 [useNotificationCount] Query enabled: 用戶已認證')
      return true
    }),

    // 重試配置 - 解決冷啟動問題
    retry: 3, // 重試 3 次
    retryDelay: (attemptIndex: number) => {
      // 指數退避：1s, 2s, 4s
      const delay = Math.min(1000 * Math.pow(2, attemptIndex), 10000)
      console.log(`📬 [useNotifications] 重試延遲: ${delay}ms (嘗試 ${attemptIndex + 1})`)
      return delay
    },

    // 緩存配置
    staleTime: 1000 * 60 * 2, // 2 分鐘內視為新鮮
    gcTime: 1000 * 60 * 10, // 10 分鐘後清除緩存

    // 自動刷新配置
    refetchOnWindowFocus: true, // 窗口聚焦時刷新
    refetchOnReconnect: true, // 網絡重連時刷新
    refetchInterval: 1000 * 60 * 5 // 每 5 分鐘自動刷新
  })
}

/**
 * 獲取通知列表
 * @param {Object} options - 查詢選項
 * @param {number} options.page - 頁碼
 * @param {number} options.pageSize - 每頁數量
 * @param {string} options.filter - 過濾條件 ('all' | 'unread' | 'read')
 * @returns {Object} TanStack Query 結果
 */
export function useNotifications(options: NotificationListOptions | ComputedRef<NotificationListOptions> = {}): UseQueryReturnType<NotificationListResponse, Error> {
  // Vue 3 Best Practice: Use unified useAuth() composable
  const { token, isAuthenticated } = useAuth()

  const optionsRef = isRef(options) ? options : ref(options)
  const page: ComputedRef<number> = computed(() => optionsRef.value.page || 1)
  const pageSize: ComputedRef<number> = computed(() => optionsRef.value.pageSize || 20)
  const filter: ComputedRef<string> = computed(() => optionsRef.value.filter || 'all')

  return useQuery({
    queryKey: ['notifications', { page: page.value, pageSize: pageSize.value, filter: filter.value }],
    queryFn: async (): Promise<NotificationListResponse> => {
      console.log(`📬 [useNotifications] 載入通知列表 (頁碼: ${page.value}, 過濾: ${filter.value})`)

      const httpResponse = await rpcClient.api.notifications.list.$post({
        json: {
          options: {
            limit: pageSize.value,
            offset: (page.value - 1) * pageSize.value,
            unreadOnly: filter.value === 'unread'
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<NotificationListResponse>

      if (!response.success) {
        throw new Error(response.error?.message || '載入通知列表失敗')
      }

      console.log(`✅ [useNotifications] 通知列表載入成功，共 ${response.data?.notifications?.length || 0} 條`)

      return response.data
    },

    // ✅ JWT 認證檢查：只在用戶已登入且 token 有效時才執行查詢
    enabled: computed(() => {
      if (!token.value) {
        console.log('📬 [useNotifications] Query disabled: 未登入')
        return false
      }

      if (isTokenExpired(token.value)) {
        console.log('📬 [useNotifications] Query disabled: Token 已過期')
        return false
      }

      console.log('📬 [useNotifications] Query enabled: 用戶已認證')
      return true
    }),

    // 重試配置
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),

    // 緩存配置
    staleTime: 1000 * 60, // 1 分鐘
    gcTime: 1000 * 60 * 5, // 5 分鐘

    // 只在窗口聚焦時刷新
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })
}

/**
 * 標記通知為已讀
 * @returns {Object} TanStack Mutation 結果
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      console.log(`📬 [useNotifications] 標記通知為已讀: ${notificationId}`)

      const httpResponse = await (rpcClient.api.notifications as any)['mark-read'].$post({
        json: {
          notificationId
        }
      })
      const response = await httpResponse.json() as ApiResponse<any>

      if (!response.success) {
        throw new Error(response.error?.message || '標記失敗')
      }

      return response.data
    },

    // 成功後刷新相關查詢
    onSuccess: () => {
      console.log('✅ [useNotifications] 通知已標記為已讀')

      // 刷新通知數量
      queryClient.invalidateQueries({ queryKey: ['notificationCount'] })

      // 刷新通知列表
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },

    // 錯誤處理
    onError: (error: Error) => {
      console.error('📬 [useNotifications] 標記失敗:', error)
      handleError(error instanceof Error ? error : String(error), { action: '標記通知' })
    }
  })
}

/**
 * 標記所有通知為已讀
 * @returns {Object} TanStack Mutation 結果
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      console.log('📬 [useNotifications] 標記所有通知為已讀')

      const httpResponse = await (rpcClient.api.notifications as any)['mark-all-read'].$post()
      const response = await httpResponse.json() as ApiResponse<any>

      if (!response.success) {
        throw new Error(response.error?.message || '標記失敗')
      }

      return response.data
    },

    // 成功後刷新
    onSuccess: () => {
      console.log('✅ [useNotifications] 所有通知已標記為已讀')
      showSuccess('所有通知已標記為已讀')

      // 刷新通知數量
      queryClient.invalidateQueries({ queryKey: ['notificationCount'] })

      // 刷新通知列表
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },

    // 錯誤處理
    onError: (error: Error) => {
      console.error('📬 [useNotifications] 標記所有通知失敗:', error)
      handleError(error instanceof Error ? error : String(error), { action: '標記所有通知' })
    }
  })
}

/**
 * 刪除通知
 * @returns {Object} TanStack Mutation 結果
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      console.log(`📬 [useNotifications] 刪除通知: ${notificationId}`)

      const httpResponse = await rpcClient.api.notifications.delete.$post({
        json: {
          notificationId
        }
      })
      const response = await httpResponse.json() as ApiResponse<any>

      if (!response.success) {
        throw new Error(response.error?.message || '刪除失敗')
      }

      return response.data
    },

    // 成功後刷新
    onSuccess: () => {
      console.log('✅ [useNotifications] 通知已刪除')
      showSuccess('通知已刪除')

      // 刷新通知數量
      queryClient.invalidateQueries({ queryKey: ['notificationCount'] })

      // 刷新通知列表
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },

    // 錯誤處理
    onError: (error: Error) => {
      console.error('📬 [useNotifications] 刪除通知失敗:', error)
      handleError(error instanceof Error ? error : String(error), { action: '刪除通知' })
    }
  })
}
