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
import type { ApiData, ApiInput } from '@/utils/api-types'
import { useCurrentUser } from './useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, Comment, User, Group } from '@/types'
import type { UserGroupRecord } from '@repo/shared'

/**
 * Project core data structure
 */
/** 專案核心資料的形狀從端點推導（見 plan/issue.md #011） */
export type ProjectCoreData = ApiData<typeof rpcClient.api.projects.core.$post>

/**
 * 建立／更新階段的請求形狀，從端點的 Zod schema 推導。
 *
 * 手寫版本跟契約對不上：宣告了後端不收的 `stageOrder`／`settings`／
 * `status`，而後端真正必填的 `startTime`／`endTime` 卻標成選填。
 */
type StageCreateData = ApiInput<typeof rpcClient.api.stages.create.$post>['stageData']
type StageUpdateData = ApiInput<typeof rpcClient.api.stages.update.$post>['updates']

/** 階段列表回傳的階段（含 statistics，和 shared 的 Stage 不同） */
export type StageListItem = ApiData<typeof rpcClient.api.stages.list.$post>['stages'][number]
/** 建立階段回傳的資料 */
type CreatedStage = ApiData<typeof rpcClient.api.stages.create.$post>
/** 更新階段回傳的資料（目前是 null） */
type UpdatedStage = ApiData<typeof rpcClient.api.stages.update.$post>

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
      const httpResponse = await rpcClient.api.projects.core.$post({
        json: {
          projectId: getValue(projectId) ?? ''
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
export function useStages(projectId: Ref<string> | string): UseQueryReturnType<StageListItem[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: ['stages', projectId],
    queryFn: async (): Promise<StageListItem[]> => {
      const httpResponse = await rpcClient.api.stages.list.$post({
        json: {
          projectId: getValue(projectId) ?? ''
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
export function useCreateStage(): UseMutationReturnType<CreatedStage, Error, CreateStageVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageData }: CreateStageVariables): Promise<CreatedStage> => {
      const httpResponse = await rpcClient.api.stages.create.$post({
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
export function useUpdateStage(): UseMutationReturnType<UpdatedStage, Error, UpdateStageVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageId, updates }: UpdateStageVariables): Promise<UpdatedStage> => {
      const httpResponse = await rpcClient.api.stages.update.$post({
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
  /** 從端點推導：後端回的是巢狀評論（帶 replies），不是扁平的 Comment */
  comments: ApiData<typeof rpcClient.api.comments.stage.$post>['comments']
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
      const httpResponse = await rpcClient.api.comments.stage.$post({
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
export function flattenInfiniteComments(data: { pages: InfiniteCommentsPage[] } | undefined): InfiniteCommentsPage['comments'] {
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
