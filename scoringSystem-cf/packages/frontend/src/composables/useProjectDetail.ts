/**
 * Project Detail Composables using TanStack Query
 *
 * Provides:
 * - useProjectCore() - Get project core data (structure, users, groups)
 * - useProjectContent() - Get stage content (submissions/comments)
 * - useStageSubmissions() - Get stage submissions
 * - useStageComments() - Get stage comments
 * - useStages() - Get project stages
 * - useCreateStage() - Create stage mutation
 * - useUpdateStage() - Update stage mutation
 */

import type { Ref } from 'vue'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/vue-query'
import type { UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { computed, unref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, Comment, User, Group } from '@/types'

/**
 * Project core data structure
 */
export interface ProjectCoreData {
  project: {
    projectId: string
    projectName: string
    description: string | null
    createdBy: string // userId of the project creator
    creationTime: number
    status: 'active' | 'archived' | 'deleted'
    settings: string
    lastActivityTime: number | null
  }
  users: User[]
  groups: Group[]
  stages: Stage[]
  userGroups?: Group[] // User's groups in this project
  viewerRole?: 'teacher' | 'observer' | 'member' | null // User's role in project_viewers
}

/**
 * Stage data for creation
 */
interface StageCreateData {
  stageName: string
  stageOrder: number
  description?: string
  startTime?: number
  endTime?: number
  status?: 'draft' | 'active' | 'closed'
  settings?: string
}

/**
 * Stage update data
 */
interface StageUpdateData {
  stageName?: string
  stageOrder?: number
  description?: string
  startTime?: number
  endTime?: number
  status?: 'draft' | 'active' | 'closed'
  settings?: string
}

/**
 * Helper to safely unwrap ref values
 */
function getValue<T>(value: T | Ref<T>): T {
  return unref(value) as T
}

/**
 * Get project core data (metadata, users, groups, structure)
 *
 * Depends on: auth
 *
 * @param projectId - Reactive project ID
 * @returns Query result
 */
export function useProjectCore(projectId: Ref<string | null> | string | Ref<string>): UseQueryReturnType<ProjectCoreData, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: ['project', 'core', projectId],
    queryFn: async (): Promise<ProjectCoreData> => {
      const httpResponse = await rpcClient.projects.core.$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案資料失敗')
      }

      return response.data
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,         // 5 分鐘數據新鮮度
    gcTime: 1000 * 60 * 10,           // 10 分鐘垃圾回收時間
    refetchOnWindowFocus: false,      // 關閉視窗聚焦時自動重新載入
    retry: 2                          // 失敗時重試 2 次
  })
}

/**
 * Get all stages for a project
 *
 * @param projectId - Reactive project ID
 * @returns Query result
 */
export function useStages(projectId: Ref<string> | string): UseQueryReturnType<Stage[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: ['stages', projectId],
    queryFn: async (): Promise<Stage[]> => {
      const httpResponse = await rpcClient.stages.list.$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入階段列表失敗')
      }

      return response.data.stages || []
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,         // 5 分鐘數據新鮮度
    gcTime: 1000 * 60 * 10,           // 10 分鐘垃圾回收時間
    refetchOnWindowFocus: false,      // 關閉視窗聚焦時自動重新載入
    retry: 2                          // 失敗時重試 2 次
  })
}

/**
 * Create stage mutation variables
 */
interface CreateStageVariables {
  projectId: string
  stageData: StageCreateData
}

/**
 * Create stage mutation
 *
 * @returns Mutation object
 */
export function useCreateStage(): UseMutationReturnType<Stage, Error, CreateStageVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageData }: CreateStageVariables): Promise<Stage> => {
      const httpResponse = await rpcClient.stages.create.$post({
        json: {
          projectId,
          stageData
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '建立階段失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate stages list
      queryClient.invalidateQueries({ queryKey: ['stages', variables.projectId] })

      // Invalidate project core data
      queryClient.invalidateQueries({ queryKey: ['project', 'core', variables.projectId] })

      ElMessage.success('階段建立成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '建立階段失敗')
    }
  })
}

/**
 * Update stage mutation variables
 */
interface UpdateStageVariables {
  projectId: string
  stageId: string
  updates: StageUpdateData
}

/**
 * Update stage mutation
 *
 * @returns Mutation object
 */
export function useUpdateStage(): UseMutationReturnType<Stage, Error, UpdateStageVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageId, updates }: UpdateStageVariables): Promise<Stage> => {
      const httpResponse = await rpcClient.stages.update.$post({
        json: {
          projectId,
          stageId,
          updates
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '更新階段失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate stages list
      queryClient.invalidateQueries({ queryKey: ['stages', variables.projectId] })

      // Invalidate project core data
      queryClient.invalidateQueries({ queryKey: ['project', 'core', variables.projectId] })

      ElMessage.success('階段更新成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '更新階段失敗')
    }
  })
}

/**
 * Infinite Query 評論頁面資料結構
 */
interface InfiniteCommentsPage {
  comments: Comment[]
  total: number
  totalWithReplies: number
  votingEligible: boolean
  offset: number
  limit: number
  hasMore: boolean
}

/**
 * 使用 TanStack Query 的 Infinite Query 載入階段評論（支援分頁）
 *
 * @param projectId - Reactive 專案 ID
 * @param stageId - Reactive 階段 ID
 * @param limit - 每頁評論數量
 * @param excludeTeachers - 是否排除教師評論
 * @returns Infinite Query 結果
 */
export function useInfiniteStageComments(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string,
  limit: Ref<number> | number = 3,
  excludeTeachers: Ref<boolean> | boolean = false
) {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    const sid = getValue(stageId)
    return userQuery.isSuccess.value && !!pid && !!sid
  })

  return useInfiniteQuery({
    queryKey: computed(() => [
      'comments',
      'infinite',
      getValue(projectId),
      getValue(stageId),
      getValue(limit),
      getValue(excludeTeachers)
    ]),
    queryFn: async ({ pageParam = 0 }): Promise<InfiniteCommentsPage> => {
      const httpResponse = await rpcClient.comments.stage.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId),
          excludeTeachers: getValue(excludeTeachers),
          limit: getValue(limit),
          offset: pageParam
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入評論失敗')
      }

      return {
        comments: response.data.comments || [],
        total: response.data.total || 0,
        totalWithReplies: response.data.totalWithReplies || 0,
        votingEligible: response.data.votingEligible || false,
        offset: pageParam,
        limit: getValue(limit),
        hasMore: response.data.hasMore || false
      }
    },
    getNextPageParam: (lastPage) => {
      // 只有當還有更多時，才返回下一個 offset
      return lastPage.hasMore
        ? lastPage.offset + lastPage.comments.length
        : undefined
    },
    initialPageParam: 0,
    enabled: isEnabled,
    staleTime: 1000 * 30,    // 30 秒
    gcTime: 1000 * 60 * 10   // 10 分鐘
  })
}

/**
 * Helper: 從 infinite query 結果中提取扁平化的評論陣列
 */
export function flattenInfiniteComments(data: { pages: InfiniteCommentsPage[] } | undefined): Comment[] {
  return data?.pages?.flatMap((page) => page.comments) ?? []
}

/**
 * Helper: 從 infinite query 結果中提取 total
 */
export function getInfiniteCommentsTotal(data: { pages: InfiniteCommentsPage[] } | undefined): number {
  return data?.pages?.[0]?.total ?? 0
}

/**
 * Helper: 從 infinite query 結果中提取 votingEligible
 */
export function getInfiniteVotingEligible(data: { pages: InfiniteCommentsPage[] } | undefined): boolean {
  return data?.pages?.[0]?.votingEligible ?? false
}
