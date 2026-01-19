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

import type { Ref, ComputedRef } from 'vue'
import { useQuery, useMutation, useQueryClient, useQueries, useInfiniteQuery } from '@tanstack/vue-query'
import type { UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { computed, unref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import { ElMessage } from 'element-plus'
import type { Stage, Submission, Comment, User, Group } from '@/types'

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
 * Project content data structure
 */
interface ProjectContentData {
  submissions?: Submission[]
  comments?: Comment[]
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
 * Submission data
 */
interface SubmissionCreateData {
  title: string
  content: string
  metadata?: string
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
 * Get project content (submissions or comments for a stage)
 *
 * Depends on: auth
 *
 * @param projectId - Reactive project ID
 * @param stageId - Reactive stage ID
 * @param contentType - 'submissions' | 'comments' | 'all'
 * @param excludeTeachers - Whether to exclude teacher submissions
 * @returns Query result
 */
export function useProjectContent(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string,
  contentType: Ref<string> | string = 'all',
  excludeTeachers: Ref<boolean> | boolean = false
): UseQueryReturnType<ProjectContentData, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    const sid = getValue(stageId)
    return userQuery.isSuccess.value && !!pid && !!sid
  })

  return useQuery({
    queryKey: ['project', 'content', projectId, stageId, contentType, excludeTeachers],
    queryFn: async (): Promise<ProjectContentData> => {
      const httpResponse = await rpcClient.projects.content.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId),
          contentType: getValue(contentType),
          excludeTeachers: getValue(excludeTeachers),
          includeSubmitted: false, // only show approved submissions
          excludeUserGroups: false  // show all groups
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入內容失敗')
      }

      return response.data
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 1 // 1 minute cache
  })
}

/**
 * Get stage submissions
 *
 * @param projectId - Reactive project ID
 * @param stageId - Reactive stage ID
 * @returns Query result
 */
export function useStageSubmissions(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string
): UseQueryReturnType<Submission[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    const sid = getValue(stageId)
    return userQuery.isSuccess.value && !!pid && !!sid
  })

  return useQuery({
    queryKey: ['submissions', projectId, stageId],
    queryFn: async (): Promise<Submission[]> => {
      const httpResponse = await rpcClient.submissions.list.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入提交記錄失敗')
      }

      return response.data.submissions || []
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 1
  })
}

/**
 * Get stage comments
 *
 * @param projectId - Reactive project ID
 * @param stageId - Reactive stage ID
 * @param excludeTeachers - Whether to exclude teacher comments
 * @returns Query result
 */
export function useStageComments(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string,
  excludeTeachers: Ref<boolean> | boolean = false
): UseQueryReturnType<Comment[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    const sid = getValue(stageId)
    return userQuery.isSuccess.value && !!pid && !!sid
  })

  return useQuery({
    queryKey: ['comments', projectId, stageId, excludeTeachers],
    queryFn: async (): Promise<Comment[]> => {
      const httpResponse = await rpcClient.comments.stage.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId),
          excludeTeachers: getValue(excludeTeachers)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入評論失敗')
      }

      return response.data.comments || []
    },
    enabled: isEnabled,
    staleTime: 1000 * 30 // 30 seconds cache (comments change frequently)
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
 * Stage content result
 */
interface StageContentResult {
  stageId: string
  data: ProjectContentData
}

/**
 * Combined queries result
 */
interface CombinedQueriesResult {
  readonly data: (StageContentResult | undefined)[]
  readonly isLoading: boolean
  readonly isError: boolean
  readonly errors: (Error | null)[]
}

/**
 * Load multiple stages' content in parallel
 *
 * This is optimized for loading all stage submissions at once.
 *
 * @param projectId - Reactive project ID
 * @param stageIds - Array of stage IDs
 * @param contentType - 'submissions' | 'comments'
 * @returns Combined query results
 */
export function useMultipleStagesContent(
  projectId: Ref<string> | string,
  stageIds: Ref<string[]> | string[],
  contentType: string = 'submissions'
): Readonly<Ref<CombinedQueriesResult>> {
  const userQuery = useCurrentUser()

  return useQueries({
    queries: computed(() => {
      const stages = getValue(stageIds) || []
      const pid = getValue(projectId)

      if (!userQuery.isSuccess.value || !pid || !stages.length) {
        return []
      }

      return stages.map(stageId => ({
        queryKey: ['project', 'content', pid, stageId, contentType],
        queryFn: async (): Promise<StageContentResult> => {
          const httpResponse = await rpcClient.projects.content.$post({
            json: {
              projectId: pid,
              stageId,
              contentType,
              excludeTeachers: false,
              includeSubmitted: false, // only show approved submissions
              excludeUserGroups: false  // show all groups
            }
          })
          const response = await httpResponse.json()
          if (!response.success) {
            throw new Error(response.error?.message || '載入內容失敗')
          }
          return {
            stageId,
            data: response.data
          }
        },
        staleTime: 1000 * 60 * 1
      }))
    }),
    combine: (results) => {
      return {
        data: results.map(r => r.data),
        isLoading: results.some(r => r.isLoading),
        isError: results.some(r => r.isError),
        errors: results.filter(r => r.error).map(r => r.error)
      }
    }
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
 * Submit report mutation variables
 */
interface SubmitReportVariables {
  projectId: string
  stageId: string
  submissionData: SubmissionCreateData
}

/**
 * Submit report mutation
 *
 * @returns Mutation object
 */
export function useSubmitReport(): UseMutationReturnType<Submission, Error, SubmitReportVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageId, submissionData }: SubmitReportVariables): Promise<Submission> => {
      const httpResponse = await rpcClient.submissions.submit.$post({
        json: {
          projectId,
          stageId,
          submissionData
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '提交報告失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate stage submissions
      queryClient.invalidateQueries({
        queryKey: ['submissions', variables.projectId, variables.stageId]
      })

      // Invalidate stage content
      queryClient.invalidateQueries({
        queryKey: ['project', 'content', variables.projectId, variables.stageId]
      })

      ElMessage.success('報告提交成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '提交報告失敗')
    }
  })
}

/**
 * Create comment mutation variables
 */
interface CreateCommentVariables {
  projectId: string
  stageId: string
  content: string
  parentCommentId?: string | null
}

/**
 * Create comment mutation
 *
 * @returns Mutation object
 */
export function useCreateComment(): UseMutationReturnType<Comment, Error, CreateCommentVariables, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, stageId, content, parentCommentId = null }: CreateCommentVariables): Promise<Comment> => {
      const httpResponse = await rpcClient.comments.create.$post({
        json: {
          projectId,
          commentData: {
            stageId,
            content,
            parentCommentId
          }
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '發表評論失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate stage comments
      queryClient.invalidateQueries({
        queryKey: ['comments', variables.projectId, variables.stageId]
      })

      ElMessage.success('評論發表成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '發表評論失敗')
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
