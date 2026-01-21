/**
 * Wallet Composables using TanStack Query
 *
 * Provides:
 * - useWalletTransactions() - Get user's wallet transactions (single page)
 * - useInfiniteWalletTransactions() - Get user's wallet transactions with infinite scroll
 * - useWalletLeaderboard() - Get wallet leaderboard
 * - useGlobalWalletBalance() - Get balance across all projects
 * - useWalletProjectUsers() - Get users in a project (for admin view)
 * - useWalletProjectStages() - Get stages in a project
 * - useWalletData() - Combined wallet data (transactions + stages + users)
 */

import type { Ref, ComputedRef } from 'vue'
import { useQuery, useQueries, useInfiniteQuery } from '@tanstack/vue-query'
import type { UseQueryReturnType } from '@tanstack/vue-query'
import { computed, unref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import { useProjectsWithStages } from './useProjects'
import type { Stage, User, Project } from '@/types'
import type { Transaction } from '@repo/shared' // Use shared Transaction type for consistency
import { debugLog } from '@/utils/debug'

/**
 * Normalized transaction structure
 */
interface NormalizedTransaction {
  id: string
  transactionId: string
  points: number
  description: string
  stage: number
  stageId?: string
  stageName?: string
  stageOrder?: number
  timestamp: number
  createdAt: number
  transactionType: string
  settlementId?: string
  relatedSubmissionId?: string
  relatedCommentId?: string
  relatedTransactionId?: string
  displayName?: string
  userEmail?: string
}

/**
 * Transaction query result with pagination metadata
 */
interface TransactionQueryResult {
  transactions: NormalizedTransaction[]
  totalCount: number
  hasMore: boolean
  currentBalance: number
}

/**
 * Transaction filters for backend search
 */
export interface TransactionFilters {
  transactionTypes?: string[]
  dateStart?: number
  dateEnd?: number
  searchDescription?: string
  searchUser?: string
}

/**
 * Wallet leaderboard entry
 */
interface LeaderboardEntry {
  userId: string
  userEmail: string
  displayName: string
  balance: number
  rank: number
}

/**
 * Wallet ladder response (full API response)
 * Contains global min/max for accurate score estimation across all permission levels
 */
export interface WalletLadderData {
  hasFullAccess: boolean
  walletData: any[]
  globalMinBalance: number
  globalMaxBalance: number
  currentUserEmail: string
  scoreRangeMin: number
  scoreRangeMax: number
}

/**
 * Global wallet balance by project
 */
interface ProjectWalletData {
  projectId: string
  projectName: string
  balance: number
  transactions: NormalizedTransaction[]
}

/**
 * Global wallet balance result
 */
interface GlobalWalletBalanceData {
  totalBalance: number
  byProject: Record<string, ProjectWalletData>
  allTransactions: NormalizedTransaction[]
}

/**
 * Combined wallet data result
 */
interface WalletDataResult {
  projects: ComputedRef<Project[]>
  projectsLoading: Ref<boolean>
  projectsError: Ref<boolean>
  stages: ComputedRef<Stage[]>
  stagesLoading: Ref<boolean>
  stagesError: Ref<boolean>
  users: ComputedRef<User[]>
  usersLoading: Ref<boolean>
  usersError: Ref<boolean>
  isLoading: ComputedRef<boolean>
  isError: ComputedRef<boolean>
}

/**
 * Helper: Safely unwrap ref/computed to get raw value
 */
function getValue<T>(value: T | Ref<T>): T {
  return unref(value) as T
}

/**
 * Get user's wallet transactions for a project
 *
 * Depends on: auth
 *
 * @param projectId - Reactive project ID (null for all projects)
 * @param userId - Reactive user ID (null for current user)
 * @param options - Optional pagination and filter options
 * @returns Query result with pagination metadata
 */
export function useWalletTransactions(
  projectId: Ref<string | null> | string | null = null,
  userId: Ref<string | null> | string | null = null,
  options?: {
    limit?: Ref<number> | number
    offset?: Ref<number> | number
    filters?: Ref<TransactionFilters> | TransactionFilters
  }
): UseQueryReturnType<TransactionQueryResult, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    const enabled = userQuery.isSuccess.value && !!userQuery.data.value && !!pid

    debugLog('🔍 [useWalletTransactions] enabled check:', {
      projectId: pid,
      userId: getValue(userId),
      userQuerySuccess: userQuery.isSuccess.value,
      userQueryData: !!userQuery.data.value,
      enabled
    })

    return enabled
  })

  return useQuery({
    queryKey: computed(() => {
      const filters = getValue(options?.filters ?? {})
      const key = [
        'wallet',
        'transactions',
        getValue(projectId),
        getValue(userId),
        getValue(options?.limit ?? 50),
        getValue(options?.offset ?? 0),
        JSON.stringify(filters)
      ]
      debugLog('🔑 [useWalletTransactions] queryKey:', key)
      return key
    }),
    queryFn: async (): Promise<TransactionQueryResult> => {
      const pid = getValue(projectId)
      const uid = getValue(userId)
      const limit = getValue(options?.limit ?? 50)
      const offset = getValue(options?.offset ?? 0)
      const filters = getValue(options?.filters ?? {})

      debugLog('📡 [useWalletTransactions] queryFn called:', {
        projectId: pid,
        userId: uid,
        limit,
        offset,
        filters
      })

      const httpResponse = await rpcClient.wallets.transactions.$post({
        json: {
          projectId: pid,
          targetUserEmail: uid,
          limit,
          offset,
          ...filters
        }
      })
      const response = await httpResponse.json()

      debugLog('✅ [useWalletTransactions] API response:', {
        success: response.success,
        transactionCount: response.data?.transactions?.length || 0,
        totalCount: response.data?.totalCount || 0,
        hasMore: response.data?.hasMore || false
      })

      if (!response.success) {
        throw new Error(response.error?.message || '載入交易記錄失敗')
      }

      const rawTransactions = response.data.transactions || []

      // Normalize transactions to match expected structure
      const normalizedTransactions = rawTransactions.map((t: any) => ({
        id: t.transactionId,              // Add 'id' for compatibility
        transactionId: t.transactionId,
        points: t.amount,                 // Map 'amount' to 'points'
        description: t.description || t.source,
        stage: t.stageOrder || 1,
        stageId: t.stageId,               // Add stageId for filtering
        stageName: t.stageName,
        timestamp: t.timestamp,
        transactionType: t.type || t.transactionType,
        settlementId: t.settlementId,     // Settlement ID for reversal and detail view
        relatedSubmissionId: t.relatedSubmissionId,
        relatedCommentId: t.relatedCommentId,
        relatedTransactionId: t.relatedTransactionId,
        displayName: t.displayName,       // User display name from users table
        userEmail: t.userEmail            // User email for filtering
      })).sort((a: NormalizedTransaction, b: NormalizedTransaction) => b.timestamp - a.timestamp)

      return {
        transactions: normalizedTransactions,
        totalCount: response.data?.totalCount || normalizedTransactions.length,
        hasMore: response.data?.hasMore || false,
        currentBalance: response.data?.currentBalance || 0
      }
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

/**
 * Infinite query result type for wallet transactions
 */
interface InfiniteTransactionPage {
  transactions: NormalizedTransaction[]
  totalCount: number
  hasMore: boolean
  currentBalance: number
  nextOffset: number
}

/**
 * Get user's wallet transactions with infinite scroll support
 *
 * Uses TanStack Query's useInfiniteQuery to automatically accumulate pages.
 * This is the recommended approach for infinite scroll UIs.
 *
 * @param projectId - Reactive project ID (null for all projects)
 * @param userId - Reactive user ID (null for current user)
 * @param options - Optional limit and filter options
 * @returns Infinite query result with fetchNextPage, hasNextPage, etc.
 */
export function useInfiniteWalletTransactions(
  projectId: Ref<string | null> | string | null = null,
  userId: Ref<string | null> | string | null = null,
  options?: {
    limit?: number
    filters?: Ref<TransactionFilters> | TransactionFilters
  }
) {
  const userQuery = useCurrentUser()
  const limit = options?.limit ?? 50

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!userQuery.data.value && !!pid
  })

  return useInfiniteQuery({
    queryKey: computed(() => [
      'wallet',
      'transactions-infinite',
      getValue(projectId),
      getValue(userId),
      limit,
      JSON.stringify(getValue(options?.filters ?? {}))
    ]),
    queryFn: async ({ pageParam }): Promise<InfiniteTransactionPage> => {
      const filters = getValue(options?.filters ?? {})

      debugLog('📡 [useInfiniteWalletTransactions] queryFn called:', {
        projectId: getValue(projectId),
        userId: getValue(userId),
        limit,
        offset: pageParam,
        filters
      })

      const httpResponse = await rpcClient.wallets.transactions.$post({
        json: {
          projectId: getValue(projectId),
          targetUserEmail: getValue(userId),
          limit,
          offset: pageParam,
          ...filters
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入交易記錄失敗')
      }

      const rawTransactions = response.data.transactions || []

      // Normalize transactions to match expected structure
      const normalizedTransactions = rawTransactions.map((t: any) => ({
        id: t.transactionId,
        transactionId: t.transactionId,
        points: t.amount,
        description: t.description || t.source,
        stage: t.stageOrder || 1,
        stageId: t.stageId,
        stageName: t.stageName,
        stageOrder: t.stageOrder,
        timestamp: t.timestamp,
        transactionType: t.type || t.transactionType,
        settlementId: t.settlementId,
        relatedSubmissionId: t.relatedSubmissionId,
        relatedCommentId: t.relatedCommentId,
        relatedTransactionId: t.relatedTransactionId,
        displayName: t.displayName,
        userEmail: t.userEmail
      })).sort((a: NormalizedTransaction, b: NormalizedTransaction) => b.timestamp - a.timestamp)

      debugLog('✅ [useInfiniteWalletTransactions] API response:', {
        transactionCount: normalizedTransactions.length,
        totalCount: response.data?.totalCount || 0,
        hasMore: response.data?.hasMore || false,
        nextOffset: pageParam + limit
      })

      return {
        transactions: normalizedTransactions,
        totalCount: response.data?.totalCount || 0,
        hasMore: response.data?.hasMore || false,
        currentBalance: response.data?.currentBalance || 0,
        nextOffset: pageParam + limit
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      // If there's more data, return the next offset; otherwise undefined to stop
      return lastPage.hasMore ? lastPage.nextOffset : undefined
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

/**
 * Get wallet leaderboard for a project
 *
 * @param projectId - Reactive project ID
 * @returns Query result
 */
export function useWalletLeaderboard(
  projectId: Ref<string | null> | string | null
): UseQueryReturnType<WalletLadderData, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: computed(() => [
      'wallet',
      'leaderboard',
      getValue(projectId)
    ]),
    queryFn: async (): Promise<WalletLadderData> => {
      const httpResponse = await (rpcClient.wallets as any)['project-ladder'].$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入排行榜失敗')
      }

      // Return full response data including globalMinBalance/globalMaxBalance
      // for accurate score estimation across all permission levels
      return response.data as WalletLadderData
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  })
}

/**
 * Get global wallet balance across all projects
 *
 * This fetches transactions from all projects the user participates in
 * and calculates the total balance.
 *
 * Depends on: auth, projects
 *
 * @returns Combined query result
 */
export function useGlobalWalletBalance() {
  const userQuery = useCurrentUser()
  const projectsQuery = useProjectsWithStages()

  return useQueries({
    queries: computed(() => {
      const projects = projectsQuery.data?.value || []

      if (!userQuery.isSuccess.value || !projects.length) {
        return []
      }

      return projects.map((project: Project) => ({
        queryKey: ['wallet', 'transactions', project.id],
        queryFn: async () => {
          const httpResponse = await rpcClient.wallets.transactions.$post({
            json: {
              projectId: project.id,
              targetUserEmail: null
            }
          })
          const response = await httpResponse.json()
          if (!response.success) {
            return { projectId: project.id, transactions: [], error: true }
          }

          const rawTransactions = response.data.transactions || []

          // Normalize transactions
          const normalizedTransactions = rawTransactions.map((t: any) => ({
            id: t.transactionId,
            transactionId: t.transactionId,
            points: t.amount,
            description: t.description || t.source,
            stage: t.stageOrder || 1,
            stageName: t.stageName,
            timestamp: t.timestamp,
            transactionType: t.type || t.transactionType,
            settlementId: t.settlementId,     // Settlement ID for reversal and detail view
            relatedSubmissionId: t.relatedSubmissionId,
            relatedCommentId: t.relatedCommentId,
            relatedTransactionId: t.relatedTransactionId,
            displayName: t.displayName,       // User display name from users table
            userEmail: t.userEmail            // User email for filtering
          }))

          return {
            projectId: project.id,
            projectName: project.name,
            transactions: normalizedTransactions
          }
        },
        staleTime: 1000 * 60 * 2
      }))
    }),
    combine: (results) => {
      const allTransactions: NormalizedTransaction[] = []
      const byProject: Record<string, ProjectWalletData> = {}
      let totalBalance = 0
      let isLoading = results.some(r => r.isLoading)
      let isError = results.some(r => r.isError)

      results.forEach(result => {
        if (result.data) {
          const { projectId, projectName, transactions } = result.data as { projectId: string; projectName: string; transactions: NormalizedTransaction[] }

          // Calculate balance for this project (using normalized 'points' field)
          const projectBalance = transactions.reduce((sum: number, tx: NormalizedTransaction) => sum + (tx.points || 0), 0)

          byProject[projectId] = {
            projectId,
            projectName,
            balance: projectBalance,
            transactions
          }

          totalBalance += projectBalance
          allTransactions.push(...transactions)
        }
      })

      return {
        data: {
          totalBalance,
          byProject,
          allTransactions: allTransactions.sort((a, b) =>
            new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()
          )
        },
        isLoading,
        isError
      }
    }
  })
}

/**
 * Helper: Calculate balance from transactions
 *
 * @param transactions - Array of transactions
 * @returns Total balance
 */
export function calculateBalance(transactions: Transaction[] | NormalizedTransaction[]): number {
  if (!Array.isArray(transactions)) return 0
  return transactions.reduce((sum, tx) => sum + ((tx as any).amount || 0), 0)
}

/**
 * Helper: Group transactions by type
 *
 * @param transactions - Array of transactions
 * @returns Transactions grouped by type
 */
export function groupTransactionsByType(transactions: Transaction[] | NormalizedTransaction[]): Record<string, (Transaction | NormalizedTransaction)[]> {
  if (!Array.isArray(transactions)) return {}

  return transactions.reduce((groups, tx) => {
    const type = (tx as any).type || 'other'
    if (!groups[type]) {
      groups[type] = []
    }
    groups[type].push(tx)
    return groups
  }, {} as Record<string, (Transaction | NormalizedTransaction)[]>)
}

/**
 * Helper: Get transactions for a specific project
 *
 * @param transactions - Array of transactions
 * @param projectId - Project ID to filter by
 * @returns Filtered transactions
 */
export function getProjectTransactions(transactions: Transaction[] | NormalizedTransaction[], projectId: string): (Transaction | NormalizedTransaction)[] {
  if (!Array.isArray(transactions)) return []
  return transactions.filter(tx => (tx as any).projectId === projectId)
}

/**
 * Get project stages
 *
 * Depends on: auth, projectId
 *
 * @param projectId - Reactive project ID
 * @returns Query result
 */
export function useWalletProjectStages(
  projectId: Ref<string> | string
): UseQueryReturnType<Stage[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: computed(() => [
      'wallet',
      'projectStages',
      getValue(projectId)
    ]),
    queryFn: async (): Promise<Stage[]> => {
      const httpResponse = await rpcClient.projects.get.$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案階段失敗')
      }

      const stages = response.data?.stages || []
      return stages.sort((a: Stage, b: Stage) => (a.stageOrder || 0) - (b.stageOrder || 0))
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache (stages don't change often)
  })
}

/**
 * Get project users (for admin/teacher view)
 *
 * Uses the same API as ProjectDetail to get all participants
 * Depends on: auth, projectId
 *
 * @param projectId - Reactive project ID
 * @returns Query result
 */
export function useWalletProjectUsers(
  projectId: Ref<string> | string
): UseQueryReturnType<User[], Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const pid = getValue(projectId)
    return userQuery.isSuccess.value && !!pid
  })

  return useQuery({
    queryKey: computed(() => [
      'wallet',
      'projectUsers',
      getValue(projectId)
    ]),
    queryFn: async (): Promise<User[]> => {
      const httpResponse = await rpcClient.projects.core.$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案參與者失敗')
      }

      return response.data?.users || []
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  })
}

/**
 * Combined wallet data hook (without transactions)
 *
 * Provides non-transaction data needed for WalletNew component:
 * - Projects list with stages
 * - Selected project's users (if user has permission)
 * - Selected project's stages
 *
 * NOTE: For transactions, use useInfiniteWalletTransactions() separately.
 * This avoids duplicate API requests.
 *
 * Depends on: auth, projectId
 *
 * @param projectId - Reactive project ID (can be null)
 * @param userEmail - Reactive user email (can be null)
 * @param canViewAllUsers - Whether user has permission to view all users
 * @returns Combined query results (projects, stages, users)
 */
export function useWalletData(
  projectId: Ref<string | null> | string | null,
  userEmail: Ref<string | null> | string | null,
  canViewAllUsers: Ref<boolean> | boolean
): WalletDataResult {
  debugLog('🎯 [useWalletData] initialized:', {
    projectId: getValue(projectId),
    userEmail: getValue(userEmail),
    canViewAllUsers: getValue(canViewAllUsers)
  })

  // Base queries that always run
  const projectsQuery = useProjectsWithStages()

  // Project-specific queries (only when projectId exists)
  const stagesQuery = useWalletProjectStages(projectId as any)

  // Users query (only when projectId exists AND user has permission)
  const shouldLoadUsers = computed(() => {
    const pid = getValue(projectId)
    const canView = getValue(canViewAllUsers) ?? false
    return !!pid && canView
  })

  const usersQuery = useQuery({
    queryKey: computed(() => [
      'wallet',
      'projectUsers',
      getValue(projectId)
    ]),
    queryFn: async (): Promise<User[]> => {
      const httpResponse = await rpcClient.projects.core.$post({
        json: {
          projectId: getValue(projectId)
        }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || '載入專案參與者失敗')
      }
      return response.data?.users || []
    },
    enabled: shouldLoadUsers,
    staleTime: 1000 * 60 * 5
  })

  return {
    // Projects
    projects: computed(() => projectsQuery.data?.value || []),
    projectsLoading: projectsQuery.isLoading,
    projectsError: projectsQuery.isError,

    // Stages
    stages: computed(() => stagesQuery.data?.value || []),
    stagesLoading: stagesQuery.isLoading,
    stagesError: stagesQuery.isError,

    // Users
    users: computed(() => usersQuery.data?.value || []),
    usersLoading: usersQuery.isLoading,
    usersError: usersQuery.isError,

    // Combined loading state
    isLoading: computed(() =>
      projectsQuery.isLoading.value ||
      stagesQuery.isLoading.value ||
      usersQuery.isLoading.value
    ),

    // Combined error state
    isError: computed(() =>
      projectsQuery.isError.value ||
      stagesQuery.isError.value ||
      usersQuery.isError.value
    )
  }
}

// ===== 財富排名常數 =====
export const WEALTH_TOP_PERCENTAGE = 0.03  // 前 3% 富豪
export const MIN_WEALTH_RANKINGS = 1       // 最少顯示 1 人

/**
 * 從 leaderboard 資料提取前 3% 富豪排名
 * @param walletData - 已按財富排序的使用者陣列（從 project-ladder API）
 * @returns 前 3% 富豪的排名陣列，包含 userEmail, rank, balance
 */
export function extractTopWealthRankings(walletData: any[]): Array<{userEmail: string, rank: number, balance: number}> {
  if (!walletData || walletData.length === 0) return []

  const totalUsers = walletData.length
  const top3PercentCount = Math.max(
    MIN_WEALTH_RANKINGS,
    Math.ceil(totalUsers * WEALTH_TOP_PERCENTAGE)
  )

  return walletData.slice(0, top3PercentCount).map((user, index) => ({
    userEmail: user.userEmail,
    rank: index + 1,
    balance: user.currentBalance || user.balance
  }))
}
