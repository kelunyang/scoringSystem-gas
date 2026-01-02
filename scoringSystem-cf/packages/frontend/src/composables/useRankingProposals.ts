/**
 * Ranking Proposals Composables using TanStack Query
 *
 * Provides:
 * - useRankingProposals() - Get all proposals and submitted groups for voting
 *
 * Query Keys:
 * - ['rankings', 'proposals', projectId, stageId] - All proposals
 * - ['rankings', 'submitted-groups', projectId, stageId] - Rankable groups
 *
 * Mutations:
 * - submitProposal - Submit ranking proposal
 * - vote - Vote on a proposal
 * - withdraw - Withdraw a proposal
 * - resetVotes - Reset votes on a proposal
 */

import type { Ref, ComputedRef } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, unref, watch } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import { ElMessage } from 'element-plus'

// ============= Types =============

/**
 * Vote record from backend
 */
export interface VoteRecord {
  voteId: string
  voterEmail: string
  voterDisplayName?: string
  agree: 1 | -1
  timestamp: number
  comment?: string
}

/**
 * Ranking data item
 */
export interface RankingData {
  groupId: string
  rank: number
  submissionId: string
}

/**
 * Ranking proposal from backend
 */
export interface RankingProposal {
  proposalId: string
  stageId: string
  proposerId: string
  proposerDisplayName: string
  status: 'pending' | 'settled' | 'withdrawn' | 'reset'
  rankingData: RankingData[] | Record<string, number>
  supportCount: number
  opposeCount: number
  totalVotes: number
  createdTime: number
  votes: VoteRecord[]
  userVote: 'support' | 'oppose' | null | 1 | -1
  votingResult: 'agree' | 'disagree' | 'tie' | 'no_votes'
}

/**
 * User group info from backend
 */
export interface UserGroupInfo {
  groupId: string
  groupName: string
  isGroupLeader: boolean
  groupMemberCount: number
  members?: Array<{
    userEmail: string
    displayName: string
    role: string
  }>
}

/**
 * Proposals API response data
 */
interface ProposalsResponseData {
  proposals: RankingProposal[]
  userGroupInfo?: UserGroupInfo
}

/**
 * Submitted group for ranking
 */
export interface SubmittedGroup {
  groupId: string
  groupName: string
  memberNames: string[]
  submissionId: string
  submitTime: number
  reportContent: string
  rank: number
}

/**
 * Project scoring config
 */
export interface ProjectScoringConfig {
  maxVoteResetCount: number
  maxCommentSelections: number
  studentRankingWeight: number
  teacherRankingWeight: number
  commentRewardPercentile: number
}

/**
 * Return type for useRankingProposals
 */
export interface UseRankingProposalsReturn {
  // Queries
  proposals: ComputedRef<RankingProposal[]>
  submittedGroups: ComputedRef<SubmittedGroup[]>
  currentProposal: ComputedRef<RankingProposal | null>
  userVote: ComputedRef<'support' | 'oppose' | null>
  userGroupInfo: ComputedRef<UserGroupInfo | null>
  projectScoringConfig: ComputedRef<ProjectScoringConfig | null>

  // Loading states
  isLoading: ComputedRef<boolean>
  isProposalsLoading: ComputedRef<boolean>
  isGroupsLoading: ComputedRef<boolean>

  // Mutations
  vote: (type: 'support' | 'oppose') => Promise<void>
  submitProposal: (rankingData: RankingData[]) => Promise<void>
  withdraw: () => Promise<void>
  resetVotes: (reason?: string) => Promise<void>

  // Mutation states
  isVoting: ComputedRef<boolean>
  isSubmitting: ComputedRef<boolean>
  isWithdrawing: ComputedRef<boolean>
  isResetting: ComputedRef<boolean>

  // Version selection
  selectedVersionId: Ref<string>
  selectVersion: (proposalId: string) => void

  // Refetch
  refetch: () => void
}

// ============= Helpers =============

/**
 * Helper to safely unwrap ref values
 */
function getValue<T>(value: T | Ref<T>): T {
  return unref(value) as T
}

// ============= Main Composable =============

/**
 * Get ranking proposals and submitted groups for a stage
 *
 * @param projectId - Reactive project ID
 * @param stageId - Reactive stage ID
 * @param options - Optional configuration
 * @returns Proposals data, mutations, and loading states
 */
export function useRankingProposals(
  projectId: Ref<string> | string,
  stageId: Ref<string> | string,
  options?: { enabled?: Ref<boolean> | boolean }
): UseRankingProposalsReturn {
  const queryClient = useQueryClient()
  const userQuery = useCurrentUser()
  const selectedVersionId = ref<string>('')

  // ===== Query: Proposals =====
  const proposalsQuery = useQuery({
    queryKey: computed(() => ['rankings', 'proposals', getValue(projectId), getValue(stageId)]),
    queryFn: async (): Promise<ProposalsResponseData> => {
      const httpResponse = await (rpcClient.api.rankings as any).proposals.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入提案失敗')
      }

      return response.data as ProposalsResponseData
    },
    enabled: computed(() => {
      const externalEnabled = options?.enabled ? getValue(options.enabled) : true
      const pid = getValue(projectId)
      const sid = getValue(stageId)
      return externalEnabled && userQuery.isSuccess.value && !!pid && !!sid
    }),
    staleTime: 1000 * 30, // 30 seconds for voting data
    gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
    refetchOnWindowFocus: false
  })

  // ===== Query: Project Scoring Config =====
  const configQuery = useQuery({
    queryKey: computed(() => ['projects', 'scoring-config', getValue(projectId)]),
    queryFn: async (): Promise<ProjectScoringConfig> => {
      const httpResponse = await rpcClient.projects[':projectId']['scoring-config'].$get({
        param: { projectId: getValue(projectId) }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error || '載入專案配置失敗')
      }

      return response.data as ProjectScoringConfig
    },
    enabled: computed(() => {
      const externalEnabled = options?.enabled ? getValue(options.enabled) : true
      const pid = getValue(projectId)
      return externalEnabled && userQuery.isSuccess.value && !!pid
    }),
    staleTime: 1000 * 60 * 5, // 5 minutes for config data
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false
  })

  // ===== Query: Submitted Groups =====
  const groupsQuery = useQuery({
    queryKey: computed(() => ['rankings', 'submitted-groups', getValue(projectId), getValue(stageId)]),
    queryFn: async (): Promise<SubmittedGroup[]> => {
      const httpResponse = await (rpcClient.projects as any).content.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId),
          contentType: 'submissions',
          excludeUserGroups: true, // Backend filters out user's group
          includeSubmitted: false  // Only approved submissions
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入組別失敗')
      }

      // Transform submissions to SubmittedGroup format
      const submissions = (response.data as { submissions?: Array<{
        groupId: string
        groupName?: string
        memberNames?: string[]
        submissionId: string
        submitTime?: number
        contentMarkdown?: string
      }> }).submissions || []

      return submissions.map((s, i) => ({
        groupId: s.groupId,
        groupName: s.groupName || `群組 ${s.groupId}`,
        memberNames: s.memberNames || [],
        submissionId: s.submissionId,
        submitTime: s.submitTime || 0,
        reportContent: s.contentMarkdown || '',
        rank: i + 1
      }))
    },
    enabled: computed(() => {
      const externalEnabled = options?.enabled ? getValue(options.enabled) : true
      const pid = getValue(projectId)
      const sid = getValue(stageId)
      return externalEnabled && userQuery.isSuccess.value && !!pid && !!sid
    }),
    staleTime: 1000 * 60 * 5, // 5 minutes for group data
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false
  })

  // ===== Computed: Proposals =====
  const proposals = computed(() => {
    const data = proposalsQuery.data.value
    if (!data?.proposals) return []
    return data.proposals.map(p => ({
      ...p,
      supportCount: p.supportCount || 0,
      opposeCount: p.opposeCount || 0
    }))
  })

  // ===== Computed: Current Proposal =====
  const currentProposal = computed(() => {
    if (proposals.value.length === 0) return null

    // If no version selected, auto-select latest pending proposal
    // 只有 pending 狀態才是真正「進行中」的提案
    if (!selectedVersionId.value) {
      const latest = [...proposals.value].reverse().find(p => p.status === 'pending')
      if (latest) {
        selectedVersionId.value = latest.proposalId
      }
      return latest || null
    }

    return proposals.value.find(p => p.proposalId === selectedVersionId.value) || null
  })

  // ===== Computed: User Vote =====
  const userVote = computed((): 'support' | 'oppose' | null => {
    const vote = currentProposal.value?.userVote
    if (vote === 'support' || vote === 1) return 'support'
    if (vote === 'oppose' || vote === -1) return 'oppose'
    return null
  })

  // ===== Computed: User Group Info =====
  const userGroupInfo = computed(() => {
    return proposalsQuery.data.value?.userGroupInfo || null
  })

  // ===== Auto-select latest version when proposals change =====
  watch(proposals, (newProposals) => {
    if (newProposals.length > 0 && !selectedVersionId.value) {
      // 只有 pending 狀態才是真正「進行中」的提案
      const latest = [...newProposals].reverse().find(p => p.status === 'pending')
      if (latest) {
        selectedVersionId.value = latest.proposalId
      }
    }
  }, { immediate: true })

  // ===== Mutation: Vote =====
  const voteMutation = useMutation({
    mutationFn: async ({ type }: { type: 'support' | 'oppose' }) => {
      const httpResponse = await (rpcClient.api.rankings as any).vote.$post({
        json: {
          projectId: getValue(projectId),
          proposalId: selectedVersionId.value,
          agree: type === 'support',
          comment: ''
        }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || '投票失敗')
      }
      return response
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({
        queryKey: ['rankings', 'proposals', getValue(projectId), getValue(stageId)]
      })
      ElMessage.success(`已投${type === 'support' ? '支持' : '反對'}票`)
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '投票失敗，請重試')
    }
  })

  // ===== Mutation: Submit Proposal =====
  const submitMutation = useMutation({
    mutationFn: async ({ rankingData }: { rankingData: RankingData[] }) => {
      const httpResponse = await (rpcClient.api.rankings as any).submit.$post({
        json: {
          projectId: getValue(projectId),
          stageId: getValue(stageId),
          rankingData
        }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || '提交提案失敗')
      }
      return response
    },
    onSuccess: () => {
      // 清空 selectedVersionId，讓 auto-select 選擇最新版本
      selectedVersionId.value = ''

      queryClient.invalidateQueries({
        queryKey: ['rankings', 'proposals', getValue(projectId), getValue(stageId)]
      })
      ElMessage.success('排名提案已提交')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '提交提案失敗，請重試')
    }
  })

  // ===== Mutation: Withdraw =====
  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const httpResponse = await (rpcClient.api.rankings as any).withdraw.$post({
        json: { proposalId: selectedVersionId.value }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || '撤回失敗')
      }
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['rankings', 'proposals', getValue(projectId), getValue(stageId)]
      })
      selectedVersionId.value = ''
      ElMessage.success('提案已撤回')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '撤回失敗，請重試')
    }
  })

  // ===== Mutation: Reset Votes =====
  const resetMutation = useMutation({
    mutationFn: async ({ reason }: { reason?: string }) => {
      const httpResponse = await (rpcClient.api.rankings as any)['reset-votes'].$post({
        json: { proposalId: selectedVersionId.value, reason: reason || '' }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || '重置失敗')
      }
      return response
    },
    onSuccess: () => {
      // Clear selectedVersionId to auto-select the new proposal version (same as submit)
      selectedVersionId.value = ''

      queryClient.invalidateQueries({
        queryKey: ['rankings', 'proposals', getValue(projectId), getValue(stageId)]
      })
      ElMessage.success('投票已重置，組員可重新投票')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '重置失敗，請重試')
    }
  })

  // ===== Computed: Project Scoring Config =====
  const projectScoringConfig = computed(() => configQuery.data.value || null)

  // ===== Return =====
  return {
    // Queries
    proposals,
    submittedGroups: computed(() => groupsQuery.data.value || []),
    currentProposal,
    userVote,
    userGroupInfo,
    projectScoringConfig,

    // Loading states
    isLoading: computed(() => proposalsQuery.isLoading.value || groupsQuery.isLoading.value),
    isProposalsLoading: computed(() => proposalsQuery.isLoading.value),
    isGroupsLoading: computed(() => groupsQuery.isLoading.value),

    // Mutations
    vote: (type: 'support' | 'oppose') => voteMutation.mutateAsync({ type }),
    submitProposal: (rankingData: RankingData[]) => submitMutation.mutateAsync({ rankingData }),
    withdraw: () => withdrawMutation.mutateAsync(),
    resetVotes: (reason?: string) => resetMutation.mutateAsync({ reason }),

    // Mutation states
    isVoting: computed(() => voteMutation.isPending.value),
    isSubmitting: computed(() => submitMutation.isPending.value),
    isWithdrawing: computed(() => withdrawMutation.isPending.value),
    isResetting: computed(() => resetMutation.isPending.value),

    // Version selection
    selectedVersionId,
    selectVersion: (proposalId: string) => {
      selectedVersionId.value = proposalId
    },

    // Refetch
    refetch: () => {
      proposalsQuery.refetch()
      groupsQuery.refetch()
    }
  }
}
