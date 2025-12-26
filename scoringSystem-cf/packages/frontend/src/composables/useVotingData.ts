/**
 * @fileoverview 投票数据管理 Composable
 * Phase 3 优化：统一管理 submission 版本和投票历史数据
 *
 * 功能：
 * 1. 使用 TanStack Query 管理版本列表和投票历史
 * 2. 提供响应式数据访问
 * 3. 支持投票操作的 mutation
 * 4. 自动缓存失效和重新验证
 */

import { computed, type Ref, isRef, ref } from 'vue'
import { useQuery, useMutation, useQueryClient, type UseQueryReturnType } from '@tanstack/vue-query'
import { rpcClient } from '@/utils/rpc-client'

// ===== 类型定义 =====

export interface SubmissionVersion {
  submissionId: string
  stageId: string
  groupId: string
  contentMarkdown: string
  actualAuthors: string[]
  participationProposal: Record<string, number>  // email -> ratio (0-1)
  submitTime: string
  status: 'submitted' | 'approved' | 'withdrawn'
  updatedAt: string
  withdrawnTime?: string
  withdrawnBy?: string
  groupName: string
  submitterEmail: string
  submitterDisplayName: string
  submitterAvatarSeed?: string
  submitterAvatarStyle?: string
  submitterAvatarOptions?: string
}

export interface VotingHistoryVersion {
  submissionId: string
  status: 'submitted' | 'approved' | 'withdrawn'
  submitTime: string
  submitterEmail: string
  totalMembers: number
  votes: VoteRecord[]
  // ✅ 後端 voting-history API 回傳 votesSummary 物件
  votesSummary?: {
    totalVotes: number
    agreeVotes: number
    disagreeVotes: number
  }
  // 保留舊欄位向後兼容（某些 API 可能直接回傳）
  agreeVotes?: number
  totalVotes?: number
  isApproved?: boolean
  hasUserVoted?: boolean
  currentUserVote?: {
    agree: boolean
    createdTime: string
  }
}

export interface VoteRecord {
  voteId: string
  voterEmail: string
  voterDisplayName: string
  voterAvatarSeed?: string
  voterAvatarStyle?: string
  voterAvatarOptions?: string
  agree: boolean
  createdTime: string
}

export interface VersionsResponse {
  success: boolean
  data?: {
    versions: SubmissionVersion[]
    metadata?: {
      totalVersions: number
      activeVersion?: string
    }
  }
  error?: {
    message: string
  }
}

export interface VotingHistoryResponse {
  success: boolean
  data?: {
    groupId: string
    stageId: string
    versions: VotingHistoryVersion[]
  }
  error?: {
    message: string
  }
}

export interface VoteSubmitResponse {
  success: boolean
  data?: {
    votingSummary: {
      submissionId: string
      agreeVotes: number
      totalMembers: number
      isApproved: boolean
      currentUserVote: {
        agree: boolean
        createdTime: string
      }
    }
  }
  error?: {
    message: string
  }
}

export interface UseVotingDataOptions {
  groupId?: Ref<string | undefined> | string
  enabled?: Ref<boolean> | boolean
  refetchInterval?: number
}

// ===== Composable =====

/**
 * 投票数据管理 Composable
 *
 * @param projectId - 项目 ID（Ref 或 string）
 * @param stageId - 阶段 ID（Ref 或 string）
 * @param options - 配置选项
 * @returns 投票数据和操作方法
 *
 * @example
 * ```typescript
 * const votingData = useVotingData(
 *   () => props.projectId,
 *   () => props.stageId,
 *   { enabled: () => props.visible }
 * )
 *
 * // 访问数据
 * console.log(votingData.versions.value)
 * console.log(votingData.activeVersion.value)
 *
 * // 投票操作
 * await votingData.submitVote(true)
 *
 * // 手动刷新
 * await votingData.refreshAll()
 * ```
 */
export function useVotingData(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string,
  options?: UseVotingDataOptions
) {
  // ===== 转换为 Ref =====
  const projectIdRef = isRef(projectId) ? projectId : ref(projectId)
  const stageIdRef = isRef(stageId) ? stageId : ref(stageId)
  const groupIdRef = options?.groupId ? (isRef(options.groupId) ? options.groupId : ref(options.groupId)) : ref(undefined)
  const enabledRef = options?.enabled ? (isRef(options.enabled) ? options.enabled : ref(options.enabled)) : ref(true)

  // ===== Query: 版本列表 =====
  const versionsQuery = useQuery({
    queryKey: computed(() => ['submissionVersions', projectIdRef.value, stageIdRef.value, groupIdRef.value]),
    queryFn: async () => {
      const httpResponse = await (rpcClient.submissions as any).versions.$post({
        json: {
          projectId: projectIdRef.value,
          stageId: stageIdRef.value,
          options: groupIdRef.value ? { groupId: groupIdRef.value } : {}
        }
      })
      const response: VersionsResponse = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入版本資料')
      }

      return response.data
    },
    enabled: computed(() => enabledRef.value && !!projectIdRef.value && !!stageIdRef.value),
    staleTime: 30000,  // 30秒内认为数据是新鲜的
    refetchInterval: options?.refetchInterval || 0
  })

  // ===== Query: 投票历史 =====
  const votingHistoryQuery = useQuery({
    queryKey: computed(() => ['votingHistory', projectIdRef.value, stageIdRef.value, groupIdRef.value]),
    queryFn: async () => {
      const httpResponse = await (rpcClient.submissions as any)['voting-history'].$post({
        json: {
          projectId: projectIdRef.value,
          stageId: stageIdRef.value,
          groupId: groupIdRef.value
        }
      })
      const response: VotingHistoryResponse = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '無法載入投票歷史')
      }

      return response.data
    },
    enabled: computed(() => enabledRef.value && !!projectIdRef.value && !!stageIdRef.value),
    staleTime: 30000,
    refetchInterval: options?.refetchInterval || 0
  })

  // ===== Mutation: 投票操作 =====
  const queryClient = useQueryClient()

  const voteMutation = useMutation({
    mutationFn: async ({ agree }: { agree: boolean }) => {
      const httpResponse = await (rpcClient.submissions as any)['confirm-participation'].$post({
        json: {
          projectId: projectIdRef.value,
          stageId: stageIdRef.value,
          agree
        }
      })
      const response: VoteSubmitResponse = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '投票失敗')
      }

      return response.data
    },
    onSuccess: () => {
      // 投票成功后自动刷新数据
      queryClient.invalidateQueries({
        queryKey: ['submissionVersions', projectIdRef.value, stageIdRef.value, groupIdRef.value]
      })
      queryClient.invalidateQueries({
        queryKey: ['votingHistory', projectIdRef.value, stageIdRef.value, groupIdRef.value]
      })
    }
  })

  // ===== Computed: 当前活跃版本 =====
  const activeVersion = computed(() => {
    if (!versionsQuery.data.value?.versions) return null
    return versionsQuery.data.value.versions.find(v => v.status !== 'withdrawn') || null
  })

  // ===== Computed: 当前版本的投票数据 =====
  const currentVersionVotingData = computed(() => {
    if (!votingHistoryQuery.data.value?.versions || !activeVersion.value) return null
    return votingHistoryQuery.data.value.versions.find(
      v => v.submissionId === activeVersion.value?.submissionId
    ) || null
  })

  // ===== Computed: 所有版本状态（用于煙火触发判断）=====
  const versionStatuses = computed(() => {
    return versionsQuery.data.value?.versions?.map(v => v.status) || []
  })

  // ===== 方法：刷新所有数据 =====
  const refreshAll = async () => {
    await Promise.all([
      versionsQuery.refetch(),
      votingHistoryQuery.refetch()
    ])
  }

  // ===== 方法：提交投票 =====
  const submitVote = async (agree: boolean) => {
    return await voteMutation.mutateAsync({ agree })
  }

  // ===== 返回值 =====
  return {
    // 版本数据
    versions: computed(() => versionsQuery.data.value?.versions || []),
    versionsLoading: versionsQuery.isLoading,
    versionsError: versionsQuery.error,
    activeVersion,
    versionStatuses,

    // 投票数据
    votingHistory: computed(() => votingHistoryQuery.data.value?.versions || []),
    votingHistoryLoading: votingHistoryQuery.isLoading,
    votingHistoryError: votingHistoryQuery.error,
    currentVersionVotingData,

    // 加载状态
    isLoading: computed(() => versionsQuery.isLoading.value || votingHistoryQuery.isLoading.value),
    isError: computed(() => !!versionsQuery.error.value || !!votingHistoryQuery.error.value),
    error: computed(() => versionsQuery.error.value || votingHistoryQuery.error.value),

    // 方法
    refreshAll,
    refetchVersions: versionsQuery.refetch,
    refetchVotingHistory: votingHistoryQuery.refetch,
    submitVote,

    // 原始查询对象（高级用法）
    versionsQuery,
    votingHistoryQuery,
    voteMutation
  }
}
