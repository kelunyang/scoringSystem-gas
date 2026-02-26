/**
 * Global Groups Composable using TanStack Query
 *
 * Provides:
 * - useGlobalGroups() - Get all global groups
 * - useGlobalGroupMembers() - Get members of a global group
 * - useGlobalGroupMutations() - CRUD mutations for global groups
 *
 * This composable is for the admin GroupManagement component.
 */

import type { UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'

// ============================================================================
// Types
// ============================================================================

export interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions: string[] | string
  isActive: boolean
  createdTime?: number
  memberCount?: number
}

export interface GlobalGroupMember {
  userEmail: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
  allowChange: boolean
  joinedTime?: number
}

interface GlobalGroupsResult {
  groups: GlobalGroup[]
  totalCount: number
}

interface GlobalGroupMembersResult {
  groupId: string
  groupName: string
  memberCount: number
  members: GlobalGroupMember[]
}

interface UseGlobalGroupsOptions {
  status?: Ref<'active' | 'inactive' | 'all'> | 'active' | 'inactive' | 'all'
  search?: Ref<string> | string
}

// Helper function to extract value from Ref or return value directly
function getValue<T>(refOrValue: Ref<T> | ComputedRef<T> | T): T {
  return refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue
    ? (refOrValue as Ref<T>).value
    : (refOrValue as T)
}

// ============================================================================
// useGlobalGroups - Query for Global Groups List
// ============================================================================

/**
 * Get all global groups with optional filtering
 *
 * @param options - Optional filters
 * @returns Query result with groups array
 */
export function useGlobalGroups(
  options?: UseGlobalGroupsOptions
): UseQueryReturnType<GlobalGroupsResult, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: computed(() => [
      'admin',
      'globalGroups',
      getValue(options?.status ?? 'all'),
      getValue(options?.search ?? '')
    ]),
    queryFn: async (): Promise<GlobalGroupsResult> => {
      const response = await adminApi.globalGroups.list({
        status: getValue(options?.status ?? 'all') as 'active' | 'inactive' | 'all',
        search: getValue(options?.search) || undefined
      })

      if (!response.success) {
        throw new Error(response.error?.message || '載入全域群組列表失敗')
      }

      const data = response.data
      return {
        groups: (data?.groups || []) as unknown as GlobalGroup[],
        totalCount: data?.totalCount || 0
      }
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

// ============================================================================
// useGlobalGroupMembers - Query for Group Members
// ============================================================================

/**
 * Get members of a specific global group
 *
 * @param groupId - The group ID to fetch members for
 * @returns Query result with members array
 */
export function useGlobalGroupMembers(
  groupId: Ref<string | null> | ComputedRef<string | null>
): UseQueryReturnType<GlobalGroupMembersResult | null, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    const gid = getValue(groupId)
    return userQuery.isSuccess.value && !!userQuery.data.value && !!gid
  })

  return useQuery({
    queryKey: computed(() => ['admin', 'globalGroups', 'members', getValue(groupId)]),
    queryFn: async (): Promise<GlobalGroupMembersResult | null> => {
      const gid = getValue(groupId)
      if (!gid) return null

      const response = await adminApi.globalGroups.members(gid)

      if (!response.success) {
        throw new Error(response.error?.message || '載入群組成員失敗')
      }

      return response.data as unknown as GlobalGroupMembersResult
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2
  })
}

// ============================================================================
// Mutation Types
// ============================================================================

interface CreateGlobalGroupParams {
  groupName: string
  globalPermissions: string[]
}

interface UpdateGlobalGroupParams {
  groupId: string
  groupName?: string
  globalPermissions?: string[]
}

interface AddUserToGroupParams {
  groupId: string
  userEmail: string
  allowChange?: boolean
}

interface RemoveUserFromGroupParams {
  groupId: string
  userEmail: string
}

interface BatchAddUsersParams {
  groupId: string
  userEmails: string[]
  allowChange?: boolean
}

interface BatchRemoveUsersParams {
  groupId: string
  userEmails: string[]
}

// ============================================================================
// useCreateGlobalGroup - Create new global group
// ============================================================================

export function useCreateGlobalGroup(): UseMutationReturnType<
  { groupId: string },
  Error,
  CreateGlobalGroupParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupName, globalPermissions }: CreateGlobalGroupParams) => {
      const response = await adminApi.globalGroups.create({
        groupName,
        globalPermissions
      })

      if (!response.success) {
        throw new Error(response.error?.message || '建立群組失敗')
      }

      return response.data as { groupId: string }
    },
    onSuccess: () => {
      ElMessage.success('群組建立成功')
      queryClient.invalidateQueries({ queryKey: ['admin', 'globalGroups'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`建立失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useUpdateGlobalGroup - Update global group
// ============================================================================

export function useUpdateGlobalGroup(): UseMutationReturnType<
  void,
  Error,
  UpdateGlobalGroupParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, groupName, globalPermissions }: UpdateGlobalGroupParams) => {
      const response = await adminApi.globalGroups.update({
        groupId,
        groupName,
        globalPermissions
      })

      if (!response.success) {
        throw new Error(response.error?.message || '更新群組失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('群組更新成功')
      queryClient.invalidateQueries({ queryKey: ['admin', 'globalGroups'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`更新失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useToggleGlobalGroupStatus - Activate/Deactivate global group
// ============================================================================

interface ToggleGroupStatusParams {
  groupId: string
  activate: boolean
}

export function useToggleGlobalGroupStatus(): UseMutationReturnType<
  void,
  Error,
  ToggleGroupStatusParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, activate }: ToggleGroupStatusParams) => {
      const response = activate
        ? await adminApi.globalGroups.activate(groupId)
        : await adminApi.globalGroups.deactivate(groupId)

      if (!response.success) {
        throw new Error(response.error?.message || (activate ? '啟用群組失敗' : '停用群組失敗'))
      }
    },
    onSuccess: (_data, variables) => {
      ElMessage.success(variables.activate ? '群組已啟用' : '群組已停用')
      queryClient.invalidateQueries({ queryKey: ['admin', 'globalGroups'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`操作失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useAddUserToGlobalGroup - Add user to group
// ============================================================================

export function useAddUserToGlobalGroup(): UseMutationReturnType<
  void,
  Error,
  AddUserToGroupParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userEmail, allowChange }: AddUserToGroupParams) => {
      const response = await adminApi.globalGroups.addUser({
        groupId,
        userEmail,
        allowChange
      })

      if (!response.success) {
        throw new Error(response.error?.message || '添加成員失敗')
      }
    },
    onSuccess: (_data, variables) => {
      ElMessage.success('成員添加成功')
      queryClient.invalidateQueries({
        queryKey: ['admin', 'globalGroups', 'members', variables.groupId]
      })
    },
    onError: (error: Error) => {
      ElMessage.error(`添加失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useRemoveUserFromGlobalGroup - Remove user from group
// ============================================================================

export function useRemoveUserFromGlobalGroup(): UseMutationReturnType<
  void,
  Error,
  RemoveUserFromGroupParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userEmail }: RemoveUserFromGroupParams) => {
      const response = await adminApi.globalGroups.removeUser({
        groupId,
        userEmail
      })

      if (!response.success) {
        throw new Error(response.error?.message || '移除成員失敗')
      }
    },
    onSuccess: (_data, variables) => {
      ElMessage.success('成員已移除')
      queryClient.invalidateQueries({
        queryKey: ['admin', 'globalGroups', 'members', variables.groupId]
      })
    },
    onError: (error: Error) => {
      ElMessage.error(`移除失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useBatchAddUsersToGlobalGroup - Batch add users
// ============================================================================

interface BatchAddResult {
  successCount: number
  failedCount: number
  errors?: string[]
}

export function useBatchAddUsersToGlobalGroup(): UseMutationReturnType<
  BatchAddResult,
  Error,
  BatchAddUsersParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userEmails, allowChange }: BatchAddUsersParams) => {
      const response = await adminApi.globalGroups.batchAddUsers({
        groupId,
        userEmails,
        allowChange
      })

      if (!response.success) {
        throw new Error(response.error?.message || '批量添加成員失敗')
      }

      return response.data as BatchAddResult
    },
    onSuccess: (data, variables) => {
      if (data.failedCount === 0) {
        ElMessage.success(`成功添加 ${data.successCount} 位成員`)
      } else {
        ElMessage.warning(`成功: ${data.successCount}, 失敗: ${data.failedCount}`)
      }
      queryClient.invalidateQueries({
        queryKey: ['admin', 'globalGroups', 'members', variables.groupId]
      })
    },
    onError: (error: Error) => {
      ElMessage.error(`批量添加失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useBatchRemoveUsersFromGlobalGroup - Batch remove users
// ============================================================================

interface BatchRemoveResult {
  successCount: number
  failedCount: number
  errors?: string[]
}

export function useBatchRemoveUsersFromGlobalGroup(): UseMutationReturnType<
  BatchRemoveResult,
  Error,
  BatchRemoveUsersParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, userEmails }: BatchRemoveUsersParams) => {
      const response = await adminApi.globalGroups.batchRemoveUsers({
        groupId,
        userEmails
      })

      if (!response.success) {
        throw new Error(response.error?.message || '批量移除成員失敗')
      }

      return response.data as BatchRemoveResult
    },
    onSuccess: (data, variables) => {
      if (data.failedCount === 0) {
        ElMessage.success(`成功移除 ${data.successCount} 位成員`)
      } else {
        ElMessage.warning(`成功: ${data.successCount}, 失敗: ${data.failedCount}`)
      }
      queryClient.invalidateQueries({
        queryKey: ['admin', 'globalGroups', 'members', variables.groupId]
      })
    },
    onError: (error: Error) => {
      ElMessage.error(`批量移除失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  GlobalGroupsResult,
  GlobalGroupMembersResult,
  CreateGlobalGroupParams,
  UpdateGlobalGroupParams,
  AddUserToGroupParams,
  RemoveUserFromGroupParams,
  BatchAddUsersParams,
  BatchRemoveUsersParams,
  BatchAddResult,
  BatchRemoveResult
}
