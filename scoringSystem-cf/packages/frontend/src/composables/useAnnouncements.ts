/**
 * @fileoverview Announcements composable using TanStack Query
 * 公告系統 composable（使用 TanStack Query）
 *
 * 提供公告的獲取、創建、更新、刪除功能
 * - useActiveAnnouncements: 公開 API，獲取當前有效的公告（用於登入頁）
 * - useAdminAnnouncements: 管理 API，獲取所有公告列表
 * - useCreateAnnouncement: 創建公告
 * - useUpdateAnnouncement: 更新公告
 * - useDeleteAnnouncement: 刪除公告
 */

import { useQuery, useMutation, useQueryClient, type UseQueryReturnType } from '@tanstack/vue-query'
import { computed, ref, isRef, type ComputedRef, type Ref } from 'vue'
import { handleError, showSuccess } from '@/utils/errorHandler'
import { isTokenExpired } from '@/utils/jwt'
import { useAuth } from './useAuth'
import { rpcClient } from '@/utils/rpc-client'
import type { ApiResponse } from '@/types'
import type {
  AnnouncementType,
  AdminCreateAnnouncementRequest,
  AdminUpdateAnnouncementRequest
} from '@repo/shared'

/**
 * Public announcement data (for login page display)
 */
export interface PublicAnnouncement {
  announcementId: string
  title: string
  content: string
  startTime: number
  endTime: number
  type: AnnouncementType
}

/**
 * Admin announcement data (full details)
 */
export interface AdminAnnouncement {
  announcementId: string
  title: string
  content: string
  startTime: number
  endTime: number
  type: AnnouncementType
  createdBy: string
  createdAt: number
  updatedAt: number | null
  isActive: number
  status: 'pending' | 'active' | 'expired'
}

/**
 * Admin list options
 */
export interface AdminListOptions {
  limit?: number
  offset?: number
  type?: AnnouncementType
  status?: 'pending' | 'active' | 'expired' | 'all'
  searchText?: string
}

/**
 * Admin list response
 */
export interface AdminListResponse {
  announcements: AdminAnnouncement[]
  total: number
}

/**
 * 獲取當前有效的公告（公開 API，無需登入）
 * 用於登入頁顯示公告
 *
 * @returns {Object} TanStack Query 結果
 */
export function useActiveAnnouncements(): UseQueryReturnType<PublicAnnouncement[], Error> {
  return useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: async (): Promise<PublicAnnouncement[]> => {
      console.log('📢 [useAnnouncements] 載入有效公告...')

      const httpResponse = await rpcClient.api.announcements.active.$post()
      const response = await httpResponse.json() as ApiResponse<PublicAnnouncement[]>

      if (!response.success) {
        throw new Error(response.error?.message || '載入公告失敗')
      }

      const announcements = response.data || []
      console.log(`📢 [useAnnouncements] 有效公告: ${announcements.length} 條`)

      return announcements
    },

    // 公開 API，無需認證檢查
    enabled: true,

    // 重試配置
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),

    // 緩存配置 - 公告較少變動
    staleTime: 1000 * 60 * 5, // 5 分鐘內視為新鮮
    gcTime: 1000 * 60 * 30, // 30 分鐘後清除緩存

    // 窗口聚焦時刷新
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })
}

/**
 * 獲取公告列表（管理 API，需要權限）
 *
 * @param {Object} options - 查詢選項
 * @returns {Object} TanStack Query 結果
 */
export function useAdminAnnouncements(
  options: AdminListOptions | Ref<AdminListOptions> | ComputedRef<AdminListOptions> = {}
): UseQueryReturnType<AdminListResponse, Error> {
  const { token } = useAuth()

  const optionsRef = isRef(options) ? options : ref(options)
  const limit = computed(() => optionsRef.value.limit || 20)
  const offset = computed(() => optionsRef.value.offset || 0)
  const type = computed(() => optionsRef.value.type)
  const status = computed(() => optionsRef.value.status || 'all')
  const searchText = computed(() => optionsRef.value.searchText)

  return useQuery({
    queryKey: ['announcements', 'admin', { limit: limit.value, offset: offset.value, type: type.value, status: status.value, searchText: searchText.value }],
    queryFn: async (): Promise<AdminListResponse> => {
      console.log(`📢 [useAnnouncements] 載入公告列表 (limit: ${limit.value}, offset: ${offset.value})`)

      const httpResponse = await rpcClient.api.announcements.admin.list.$post({
        json: {
          options: {
            limit: limit.value,
            offset: offset.value,
            ...(type.value && { type: type.value }),
            ...(status.value !== 'all' && { status: status.value as 'pending' | 'active' | 'expired' }),
            ...(searchText.value && { searchText: searchText.value })
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<AdminListResponse>

      if (!response.success) {
        throw new Error(response.error?.message || '載入公告列表失敗')
      }

      console.log(`✅ [useAnnouncements] 公告列表載入成功，共 ${response.data?.announcements?.length || 0} 條`)

      return response.data || { announcements: [], total: 0 }
    },

    // JWT 認證檢查
    enabled: computed(() => {
      if (!token.value) {
        console.log('📢 [useAdminAnnouncements] Query disabled: 未登入')
        return false
      }

      if (isTokenExpired(token.value)) {
        console.log('📢 [useAdminAnnouncements] Query disabled: Token 已過期')
        return false
      }

      return true
    }),

    // 重試配置
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),

    // 緩存配置
    staleTime: 1000 * 60, // 1 分鐘
    gcTime: 1000 * 60 * 5, // 5 分鐘

    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })
}

/**
 * 創建公告
 *
 * @returns {Object} TanStack Mutation 結果
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: AdminCreateAnnouncementRequest) => {
      console.log('📢 [useAnnouncements] 創建公告:', data.title)

      const httpResponse = await rpcClient.api.announcements.admin.create.$post({
        json: data
      })
      const response = await httpResponse.json() as ApiResponse<AdminAnnouncement>

      if (!response.success) {
        throw new Error(response.error?.message || '創建公告失敗')
      }

      return response.data
    },

    onSuccess: () => {
      console.log('✅ [useAnnouncements] 公告創建成功')
      showSuccess('公告創建成功')

      // 刷新公告列表
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },

    onError: (error: Error) => {
      console.error('📢 [useAnnouncements] 創建公告失敗:', error)
      handleError(error, { action: '創建公告' })
    }
  })
}

/**
 * 更新公告
 *
 * @returns {Object} TanStack Mutation 結果
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: AdminUpdateAnnouncementRequest) => {
      console.log('📢 [useAnnouncements] 更新公告:', data.announcementId)

      const httpResponse = await rpcClient.api.announcements.admin.update.$post({
        json: data
      })
      const response = await httpResponse.json() as ApiResponse<AdminAnnouncement>

      if (!response.success) {
        throw new Error(response.error?.message || '更新公告失敗')
      }

      return response.data
    },

    onSuccess: (_data, variables) => {
      console.log('✅ [useAnnouncements] 公告更新成功')
      showSuccess('公告更新成功')

      // 刷新公告列表和詳情
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      queryClient.invalidateQueries({ queryKey: ['announcements', 'admin', 'detail', variables.announcementId] })
    },

    onError: (error: Error) => {
      console.error('📢 [useAnnouncements] 更新公告失敗:', error)
      handleError(error, { action: '更新公告' })
    }
  })
}

/**
 * 刪除公告（軟刪除）
 *
 * @returns {Object} TanStack Mutation 結果
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (announcementId: string) => {
      console.log('📢 [useAnnouncements] 刪除公告:', announcementId)

      const httpResponse = await rpcClient.api.announcements.admin.delete.$post({
        json: {
          announcementId
        }
      })
      const response = await httpResponse.json() as ApiResponse<{ success: boolean }>

      if (!response.success) {
        throw new Error(response.error?.message || '刪除公告失敗')
      }

      return response.data
    },

    onSuccess: () => {
      console.log('✅ [useAnnouncements] 公告刪除成功')
      showSuccess('公告已刪除')

      // 刷新公告列表
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },

    onError: (error: Error) => {
      console.error('📢 [useAnnouncements] 刪除公告失敗:', error)
      handleError(error, { action: '刪除公告' })
    }
  })
}
