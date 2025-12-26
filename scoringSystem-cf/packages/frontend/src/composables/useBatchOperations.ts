/**
 * Batch Operations Composable
 *
 * Provides batch operation mutations for groups (activate, deactivate, lock, unlock).
 * Uses TanStack Query for consistent state management.
 */

import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { rpcClient } from '@/utils/rpc-client'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types'
import { getErrorMessage } from '@/utils/errorHandler'

/**
 * Batch update group status (activate/deactivate)
 *
 * @returns {Object} Mutation object
 */
export function useBatchUpdateGroupStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      groupIds,
      status
    }: {
      projectId: string
      groupIds: string[]
      status: 'active' | 'inactive'
    }) => {
      const httpResponse = await (rpcClient.groups as any)['batch-update-status'].$post({
        json: {
          projectId,
          groupIds,
          status
        }
      })
      const response = await httpResponse.json() as ApiResponse<{ successCount: number }>

      if (!response.success) {
        throw new Error(response.error?.message || '批量更新狀態失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectGroups', variables.projectId] })

      const action = variables.status === 'active' ? '啟用' : '停用'
      ElMessage.success(`成功${action} ${data?.successCount || 0} 個群組`)
    },
    onError: (error) => {
      ElMessage.error(getErrorMessage(error) || '批量更新狀態失敗')
    }
  })
}

/**
 * Batch update group allowChange (lock/unlock)
 *
 * @returns {Object} Mutation object
 */
export function useBatchUpdateGroupAllowChange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      groupIds,
      allowChange
    }: {
      projectId: string
      groupIds: string[]
      allowChange: boolean
    }) => {
      const httpResponse = await (rpcClient.groups as any)['batch-update-allow-change'].$post({
        json: {
          projectId,
          groupIds,
          allowChange
        }
      })
      const response = await httpResponse.json() as ApiResponse<{ successCount: number }>

      if (!response.success) {
        throw new Error(response.error?.message || '批量更新鎖定狀態失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectGroups', variables.projectId] })

      const action = variables.allowChange ? '解鎖' : '鎖定'
      ElMessage.success(`成功${action} ${data?.successCount || 0} 個群組`)
    },
    onError: (error) => {
      ElMessage.error(getErrorMessage(error) || '批量更新鎖定狀態失敗')
    }
  })
}

/**
 * Batch activate global groups
 *
 * @returns {Object} Mutation object
 */
export function useBatchActivateGlobalGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupIds }: { groupIds: string[] }) => {
      const httpResponse = await rpcClient.api.admin['global-groups']['batch-activate'].$post({
        json: { groupIds }
      })
      const response = await httpResponse.json() as ApiResponse<{ successCount: number }>

      if (!response.success) {
        throw new Error(response.error?.message || '批量啟用失敗')
      }

      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['globalGroups'] })
      ElMessage.success(`成功啟用 ${data?.successCount || 0} 個全域群組`)
    },
    onError: (error) => {
      ElMessage.error(getErrorMessage(error) || '批量啟用失敗')
    }
  })
}

/**
 * Batch deactivate global groups
 *
 * @returns {Object} Mutation object
 */
export function useBatchDeactivateGlobalGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupIds }: { groupIds: string[] }) => {
      const httpResponse = await rpcClient.api.admin['global-groups']['batch-deactivate'].$post({
        json: { groupIds }
      })
      const response = await httpResponse.json() as ApiResponse<{ successCount: number }>

      if (!response.success) {
        throw new Error(response.error?.message || '批量停用失敗')
      }

      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['globalGroups'] })
      ElMessage.success(`成功停用 ${data?.successCount || 0} 個全域群組`)
    },
    onError: (error) => {
      ElMessage.error(getErrorMessage(error) || '批量停用失敗')
    }
  })
}
