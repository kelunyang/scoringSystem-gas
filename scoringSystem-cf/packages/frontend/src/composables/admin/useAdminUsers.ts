/**
 * Admin Users Composable using TanStack Query
 *
 * Provides:
 * - useAdminUsers() - Get all users for admin management with infinite scroll
 * - useGlobalGroupsList() - Get all active global groups
 *
 * This composable is specifically for the admin UserManagement component
 * and waits for authentication to complete before fetching data.
 */

import type { UseInfiniteQueryReturnType, UseQueryReturnType } from '@tanstack/vue-query'
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { fetchWithAuth, type ApiResponse } from '@/utils/api-helpers'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'
import type { GlobalGroup } from '@repo/shared'

// ============================================================================
// Types
// ============================================================================

export interface UserFilters {
  searchText?: string
  statusFilter?: string
  groupIds?: string[]
}

interface ExtendedUser {
  userId: string
  userEmail: string
  displayName?: string
  status: string
  registrationTime?: number
  lastLoginTime?: number
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
  walletBalance?: number
  failedLoginAttempts?: number
  maliciousLoginDetected?: boolean
  twoFactorEnabled?: boolean
  lockUntil?: number
  lockReason?: string
  lockCount?: number
  globalGroups?: GlobalGroupMembership[]
  projectGroups?: ProjectGroupMembership[]
  tags?: Array<{ tagId: string; tagName: string }>
  [key: string]: unknown
}

interface GlobalGroupMembership {
  groupId: string
  groupName: string
  permissions?: string[]
  globalPermissions?: string[]
  allowChange?: boolean
}

interface ProjectGroupMembership {
  projectId: string
  projectName: string
  groupId: string
  groupName: string
  role: string
  isActive?: boolean
  allowChange?: boolean
}

interface UsersPage {
  users: ExtendedUser[]
  totalCount: number
  hasMore: boolean
  nextOffset: number
}

interface UseAdminUsersOptions {
  filters?: Ref<UserFilters> | ComputedRef<UserFilters>
  limit?: number
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useAdminUsers - Infinite Query for User List
// ============================================================================

/**
 * Get all users for admin management with infinite scroll
 *
 * Depends on: auth
 *
 * @param options - Optional filters and pagination options
 * @returns Infinite query result with users array and metadata
 *
 * @example
 * ```typescript
 * const filters = ref<UserFilters>({ searchText: '', statusFilter: '' })
 * const usersQuery = useAdminUsers({ filters })
 *
 * // Flatten all pages
 * const users = computed(() =>
 *   usersQuery.data.value?.pages.flatMap(page => page.users) || []
 * )
 *
 * // Check for more data
 * const hasMore = computed(() => usersQuery.hasNextPage.value ?? false)
 *
 * // Load more
 * function loadMore() {
 *   if (usersQuery.hasNextPage.value && !usersQuery.isFetchingNextPage.value) {
 *     usersQuery.fetchNextPage()
 *   }
 * }
 * ```
 */
export function useAdminUsers(
  options?: UseAdminUsersOptions
): UseInfiniteQueryReturnType<UsersPage, Error> {
  const userQuery = useCurrentUser()
  const limit = options?.limit ?? 50

  // Enable query only when authenticated
  const isEnabled = computed(() => {
    const enabled = userQuery.isSuccess.value && !!userQuery.data.value
    console.log('🔍 useAdminUsers enabled check:', {
      isSuccess: userQuery.isSuccess.value,
      hasUser: !!userQuery.data.value,
      enabled
    })
    return enabled
  })

  return useInfiniteQuery({
    queryKey: computed(() => {
      const filters = getValue(options?.filters ?? {})
      return [
        'admin',
        'users',
        limit,
        filters.searchText || '',
        filters.statusFilter || '',
        JSON.stringify(filters.groupIds || [])
      ]
    }),
    queryFn: async ({ pageParam }): Promise<UsersPage> => {
      console.log('🔍 useAdminUsers queryFn executing, offset:', pageParam)

      const filters = getValue(options?.filters ?? {})
      const queryParams = {
        search: filters.searchText || undefined,
        status: filters.statusFilter || undefined,
        groupIds: filters.groupIds?.length ? filters.groupIds : undefined,
        sortBy: 'registrationTime',
        sortOrder: 'desc',
        limit,
        offset: pageParam as number
      }

      // Use fetchWithAuth directly to avoid type mismatches with adminApi
      const response = await fetchWithAuth<ApiResponse<{
        users?: ExtendedUser[]
        totalCount?: number
      } | ExtendedUser[]>>(
        '/api/admin/users/list',
        { method: 'POST', body: queryParams }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '載入使用者列表失敗')
      }

      // Backend returns either:
      // - Old format: data is directly an array
      // - New format: data is { users: [...], totalCount: n, ... }
      const data = response.data
      let usersList: ExtendedUser[] = []
      let totalCount = 0

      if (Array.isArray(data)) {
        usersList = data as ExtendedUser[]
        totalCount = usersList.length
      } else if (data && typeof data === 'object') {
        const responseData = data as { users?: ExtendedUser[]; totalCount?: number }
        usersList = responseData.users || []
        totalCount = responseData.totalCount || usersList.length
      }

      const currentOffset = pageParam as number
      const hasMore = currentOffset + usersList.length < totalCount

      return {
        users: usersList,
        totalCount,
        hasMore,
        nextOffset: currentOffset + usersList.length
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2, // 2 minutes cache
    refetchOnMount: true // Always refetch on mount to ensure fresh data
  })
}

// ============================================================================
// useGlobalGroupsList - Query for Global Groups
// ============================================================================

interface GlobalGroupsListResult {
  groups: GlobalGroup[]
}

/**
 * Get all active global groups for filter dropdowns
 *
 * @returns Query result with groups array
 */
export function useGlobalGroupsList(): UseQueryReturnType<GlobalGroupsListResult, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'globalGroups', 'list'],
    queryFn: async (): Promise<GlobalGroupsListResult> => {
      const response = await adminApi.globalGroups.list()

      if (!response.success) {
        throw new Error(response.error?.message || '載入全域群組列表失敗')
      }

      const data = response.data
      const groups = (data?.groups || []).filter((group) => group.isActive) as unknown as GlobalGroup[]

      return { groups }
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache for groups
  })
}

// ============================================================================
// useAdminUsersStats - Query for User Statistics
// ============================================================================

interface UserStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
}

/**
 * Compute user statistics from flattened users data
 * This is a helper function, not a TanStack Query hook
 *
 * @param users - Array of users from infinite query
 * @returns User statistics object
 */
export function computeUserStats(users: ExtendedUser[]): UserStats {
  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === 'active').length,
    inactiveUsers: users.filter((u) => u.status === 'disabled' || u.status === 'inactive').length
  }
}

// ============================================================================
// Re-export types for consumer convenience
// ============================================================================

export type {
  ExtendedUser,
  GlobalGroupMembership,
  ProjectGroupMembership,
  UsersPage,
  UserStats
}
