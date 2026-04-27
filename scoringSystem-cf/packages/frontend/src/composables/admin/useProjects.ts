/**
 * Projects Composable using TanStack Query
 *
 * Provides mutations for:
 * - Project CRUD operations
 * - Project scoring configuration
 * - Project viewers management
 * - Stages management
 *
 * This composable is for the admin ProjectManagement component.
 */

import type { UseMutationReturnType } from '@tanstack/vue-query'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'

// ============================================================================
// Types
// ============================================================================

interface ProjectData {
  projectName: string
  description: string
  scoreRangeMin: number
  scoreRangeMax: number
}

interface ProjectUpdates {
  projectName?: string
  description?: string
  scoreRangeMin?: number
  scoreRangeMax?: number
  status?: 'active' | 'archived' | 'completed'
}

interface ScoringConfig {
  maxCommentSelections?: number
  studentRankingWeight?: number
  teacherRankingWeight?: number
  commentRewardPercentile?: number
  maxVoteResetCount?: number
}

interface CreateProjectParams {
  projectData: ProjectData
}

interface UpdateProjectParams {
  projectId: string
  updates: ProjectUpdates
}

interface GetProjectParams {
  projectId: string
}

interface UpdateScoringConfigParams {
  projectId: string
  config: ScoringConfig
}

interface CloneProjectParams {
  projectId: string
  newProjectName: string
  copyViewers?: boolean
}

// Viewer types
interface ViewerEntry {
  userEmail: string
  role: string
}

interface AddViewersBatchParams {
  projectId: string
  viewers: ViewerEntry[]
}

interface AddSingleViewerParams {
  projectId: string
  userEmail: string
  role: string
}

interface UpdateViewerRoleParams {
  projectId: string
  userEmail: string
  role: string
}

interface RemoveViewerParams {
  projectId: string
  userEmail: string
}

// Stage types
interface StageData {
  stageName: string
  description?: string
  startTime: number
  endTime: number
  reportRewardPool?: number
  commentRewardPool?: number
  stageOrder?: number
}

interface CreateStageParams {
  projectId: string
  stageData: StageData
}

interface UpdateStageParams {
  projectId: string
  stageId: string
  updates: Partial<StageData> & { status?: string }
}

interface GetStageParams {
  projectId: string
  stageId: string
}

interface CheckVotingLockParams {
  projectId: string
  stageId: string
}

interface CloneStageParams {
  sourceProjectId: string
  stageId: string
  newStageName: string
  targetProjectIds: string[]
}

// ============================================================================
// Project Mutations
// ============================================================================

/**
 * Create a new project
 */
export function useCreateProject(): UseMutationReturnType<any, Error, CreateProjectParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectData }: CreateProjectParams) => {
      const httpResponse = await rpcClient.projects.create.$post({
        json: { projectData }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '創建專案失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('專案創建成功')
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`創建失敗: ${error.message}`)
    }
  })
}

/**
 * Update a project
 */
export function useUpdateProject(): UseMutationReturnType<any, Error, UpdateProjectParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, updates }: UpdateProjectParams) => {
      const httpResponse = await rpcClient.projects.update.$post({
        json: { projectId, updates }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新專案失敗')
      }

      return response.data
    },
    onSuccess: (_data, variables) => {
      // Custom message based on update type
      if (variables.updates.status === 'archived') {
        ElMessage.success('專案已封存')
      } else if (variables.updates.status === 'active') {
        ElMessage.success('專案已解除封存')
      } else {
        ElMessage.success('專案更新成功')
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`更新失敗: ${error.message}`)
    }
  })
}

/**
 * Get project details (mutation pattern for on-demand fetching)
 */
export function useGetProject(): UseMutationReturnType<any, Error, GetProjectParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId }: GetProjectParams) => {
      const httpResponse = await rpcClient.projects.get.$post({
        json: { projectId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案詳情失敗')
      }

      return response.data
    }
  })
}

/**
 * Update project scoring configuration
 */
export function useUpdateScoringConfig(): UseMutationReturnType<any, Error, UpdateScoringConfigParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, config }: UpdateScoringConfigParams) => {
      const httpResponse = await rpcClient.projects[':projectId']['scoring-config'].$put({
        param: { projectId },
        json: config
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新評分配置失敗')
      }

      return response.data
    }
    // No success message - handled by parent operation
  })
}

/**
 * Clone a project
 */
export function useCloneProject(): UseMutationReturnType<any, Error, CloneProjectParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CloneProjectParams) => {
      const httpResponse = await rpcClient.projects.clone.$post({
        json: params
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '複製專案失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('專案複製成功')
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`複製失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Viewer Mutations
// ============================================================================

/**
 * List project viewers (mutation pattern for on-demand fetching)
 */
export function useListProjectViewers(): UseMutationReturnType<any, Error, { projectId: string }, unknown> {
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const httpResponse = await rpcClient.projects.viewers.list.$post({
        json: { projectId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入存取者清單失敗')
      }

      return response.data
    }
  })
}

/**
 * Add viewers in batch
 */
export function useAddViewersBatch(): UseMutationReturnType<any, Error, AddViewersBatchParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, viewers }: AddViewersBatchParams) => {
      const httpResponse = await rpcClient.projects.viewers['add-batch'].$post({
        json: { projectId, viewers }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '新增存取者失敗')
      }

      return response.data
    },
    // No success message - caller handles it based on summary
    onError: (error: Error) => {
      ElMessage.error(`新增失敗: ${error.message}`)
    }
  })
}

/**
 * Add single viewer
 */
export function useAddViewer(): UseMutationReturnType<any, Error, AddSingleViewerParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, userEmail, role }: AddSingleViewerParams) => {
      const httpResponse = await rpcClient.projects.viewers.add.$post({
        json: { projectId, userEmail, role }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '新增存取者失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('存取者已新增')
    },
    onError: (error: Error) => {
      ElMessage.error(`新增失敗: ${error.message}`)
    }
  })
}

/**
 * Update viewer role
 */
export function useUpdateViewerRole(): UseMutationReturnType<any, Error, UpdateViewerRoleParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, userEmail, role }: UpdateViewerRoleParams) => {
      const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
        json: { projectId, userEmail, role }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新角色失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('角色已更新')
    },
    onError: (error: Error) => {
      ElMessage.error(`更新失敗: ${error.message}`)
    }
  })
}

/**
 * Remove viewer
 */
export function useRemoveViewer(): UseMutationReturnType<any, Error, RemoveViewerParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, userEmail }: RemoveViewerParams) => {
      const httpResponse = await rpcClient.projects.viewers.remove.$post({
        json: { projectId, userEmail }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '移除存取者失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('存取者已移除')
    },
    onError: (error: Error) => {
      ElMessage.error(`移除失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// User Search Mutation
// ============================================================================

/**
 * Search users
 */
export function useSearchUsers(): UseMutationReturnType<any, Error, { query: string; limit?: number }, unknown> {
  return useMutation({
    mutationFn: async ({ query, limit = 50 }: { query: string; limit?: number }) => {
      const httpResponse = await rpcClient.users.search.$post({
        json: { query, limit }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '搜尋用戶失敗')
      }

      return response.data
    }
  })
}

// ============================================================================
// Stage Mutations
// ============================================================================

/**
 * List stages for a project (mutation pattern for on-demand fetching)
 */
export function useListStages(): UseMutationReturnType<any, Error, { projectId: string; includeArchived?: boolean }, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, includeArchived = false }: { projectId: string; includeArchived?: boolean }) => {
      const httpResponse = await rpcClient.stages.list.$post({
        json: { projectId, includeArchived }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入階段列表失敗')
      }

      return response.data
    }
  })
}

/**
 * Get stage details
 */
export function useGetStage(): UseMutationReturnType<any, Error, GetStageParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, stageId }: GetStageParams) => {
      const httpResponse = await rpcClient.stages.get.$post({
        json: { projectId, stageId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入階段詳情失敗')
      }

      return response.data
    }
  })
}

/**
 * Create a new stage
 */
export function useCreateStage(): UseMutationReturnType<any, Error, CreateStageParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, stageData }: CreateStageParams) => {
      const httpResponse = await rpcClient.stages.create.$post({
        json: { projectId, stageData }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '創建階段失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('階段創建成功')
    },
    onError: (error: Error) => {
      ElMessage.error(`創建失敗: ${error.message}`)
    }
  })
}

/**
 * Update a stage
 */
export function useUpdateStage(): UseMutationReturnType<any, Error, UpdateStageParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, stageId, updates }: UpdateStageParams) => {
      const httpResponse = await rpcClient.stages.update.$post({
        json: { projectId, stageId, updates }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新階段失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('階段更新成功')
    },
    onError: (error: Error) => {
      ElMessage.error(`更新失敗: ${error.message}`)
    }
  })
}

/**
 * Update stage order (silent - no messages)
 */
export function useUpdateStageOrder(): UseMutationReturnType<any, Error, UpdateStageParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, stageId, updates }: UpdateStageParams) => {
      const httpResponse = await rpcClient.stages.update.$post({
        json: { projectId, stageId, updates }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新階段順序失敗')
      }

      return response.data
    }
    // Silent - no success/error messages for reordering
  })
}

/**
 * Check if stage has votes (voting lock check)
 */
export function useCheckVotingLock(): UseMutationReturnType<any, Error, CheckVotingLockParams, unknown> {
  return useMutation({
    mutationFn: async ({ projectId, stageId }: CheckVotingLockParams) => {
      const httpResponse = await rpcClient.stages['check-voting-lock'].$post({
        json: { projectId, stageId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '檢查投票狀態失敗')
      }

      return response.data
    }
  })
}

/**
 * Clone stage to multiple projects
 */
export function useCloneStageToProjects(): UseMutationReturnType<any, Error, CloneStageParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sourceProjectId, stageId, newStageName, targetProjectIds }: CloneStageParams) => {
      const httpResponse = await rpcClient.stages['clone-to-projects'].$post({
        json: { sourceProjectId, stageId, newStageName, targetProjectIds }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '複製階段失敗')
      }

      return response.data
    },
    onSuccess: (data) => {
      const count = data?.totalCloned || data?.successCount || 0
      ElMessage.success(`成功複製階段到 ${count} 個專案`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`複製失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  ProjectData,
  ProjectUpdates,
  ScoringConfig,
  CreateProjectParams,
  UpdateProjectParams,
  GetProjectParams,
  UpdateScoringConfigParams,
  CloneProjectParams,
  ViewerEntry,
  AddViewersBatchParams,
  AddSingleViewerParams,
  UpdateViewerRoleParams,
  RemoveViewerParams,
  StageData,
  CreateStageParams,
  UpdateStageParams,
  GetStageParams,
  CheckVotingLockParams,
  CloneStageParams
}
