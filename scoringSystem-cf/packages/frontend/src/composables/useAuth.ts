/**
 * Authentication Composables using TanStack Query
 *
 * Provides:
 * - useCurrentUser() - Get current authenticated user
 * - useLogin() - Login mutation
 * - useLogout() - Logout mutation
 * - useChangePassword() - Change password mutation
 */

import { useQuery, useMutation, useQueryClient, type UseQueryReturnType, type UseMutationReturnType } from '@tanstack/vue-query'
import { computed, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { rpcClient } from '@/utils/rpc-client'
import { isTokenExpired } from '@/utils/jwt'
import { ElMessage } from 'element-plus'
import type { AuthUser } from '@/types/models'
import { getErrorMessage } from '@/utils/errorHandler'
import { apiClient } from '@/utils/api'

/**
 * 登出参数
 */
interface LogoutParams {
  sessionId: string
}

/**
 * 修改密码参数
 */
interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
}

/**
 * API 响应类型
 */
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

/**
 * Get current authenticated user
 *
 * This is the foundation query that all other queries depend on.
 * If this fails, all dependent queries are automatically disabled.
 *
 * @returns {UseQueryResult} Query result with user data
 */
export function useCurrentUser(): UseQueryReturnType<AuthUser, Error> {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async (): Promise<AuthUser> => {
      // Check if token exists in sessionStorage
      const token = sessionStorage.getItem('sessionId')
      if (!token) {
        throw new Error('NO_SESSION')
      }

      // Client-side JWT pre-check (avoid unnecessary API calls)
      if (isTokenExpired(token)) {
        sessionStorage.removeItem('sessionId')
        throw new Error('TOKEN_EXPIRED')
      }

      // Call backend to validate session and get user data
      // RPC automatically includes Authorization header via rpc-client
      const httpResponse = await (rpcClient.api.auth as any)['current-user'].$post({
        json: { sessionId: token }
      })

      const response = await httpResponse.json() as ApiResponse<{ user: AuthUser }>

      if (!response.success) {
        const errorCode = response.error?.code || 'AUTH_FAILED'
        throw new Error(errorCode)
      }

      if (!response.data?.user) {
        throw new Error('INVALID_USER_DATA')
      }

      return response.data.user
    },
    retry: false, // Don't retry auth failures
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes - prevents unnecessary refetches
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchOnMount: true // ✅ Ensure fresh auth state on page refresh/mount
  })
}

/**
 * @deprecated This login mutation is deprecated. Use useLogin from @/composables/auth/useLogin instead.
 *
 * The new useLogin composable provides a better two-step authentication flow with proper state management.
 *
 * Migration:
 * ```
 * // Old way (deprecated)
 * import { useLogin } from '@/composables/useAuth'
 * const loginMutation = useLogin()
 * await loginMutation.mutateAsync({ username, password, verificationCode, turnstileToken })
 *
 * // New way
 * import { useLogin } from '@/composables/auth/useLogin'
 * const { verifyPassword, verifyTwoFactor } = useLogin()
 * await verifyPassword({ email, password }, turnstileToken)
 * await verifyTwoFactor({ email, code })
 * ```
 */
export function useLogin(): never {
  console.warn(
    '[DEPRECATED] useLogin from useAuth.js is deprecated. ' +
    'Use useLogin from @/composables/auth/useLogin instead.'
  )
  throw new Error('This login function is deprecated. Use useLogin from @/composables/auth/useLogin instead.')
}

/**
 * Logout mutation
 *
 * @returns {UseMutationReturnType} Mutation object
 */
export function useLogout(): UseMutationReturnType<ApiResponse, Error, void, unknown> {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (): Promise<ApiResponse> => {
      const token = sessionStorage.getItem('sessionId')
      if (!token) return { success: true }

      const httpResponse = await rpcClient.api.auth.logout.$post({
        json: { sessionId: token }
      })
      const response = await httpResponse.json() as ApiResponse
      return response
    },
    onSuccess: () => {
      // Clear all session data using apiClient method
      apiClient.clearToken()

      // ✅ Clear all TanStack Query cache to prevent data leakage between users
      // This ensures the next user won't see the previous user's cached data
      queryClient.clear()

      ElMessage.success('已登出')

      // ✅ Redirect to login screen
      router.push({ name: 'auth-login' })
    },
    onError: (error: Error) => {
      // Even if API call fails, still clear local state
      apiClient.clearToken()

      // ✅ Clear all cache even on error to ensure clean state
      queryClient.clear()

      console.error('Logout error:', error)

      // ✅ Redirect to login screen even on error
      router.push({ name: 'auth-login' })
    }
  })
}

/**
 * Change password mutation
 *
 * @returns {UseMutationReturnType} Mutation object
 */
export function useChangePassword(): UseMutationReturnType<any, Error, ChangePasswordParams, unknown> {
  return useMutation({
    mutationFn: async ({ oldPassword, newPassword }: ChangePasswordParams): Promise<any> => {
      const token = sessionStorage.getItem('sessionId')
      if (!token) throw new Error('未登入')

      const httpResponse = await (rpcClient.api.auth as any)['change-password'].$post({
        json: {
          sessionId: token,
          oldPassword,
          newPassword
        }
      })

      const response = await httpResponse.json() as ApiResponse

      if (!response.success) {
        throw new Error(response.error?.message || '修改密碼失敗')
      }

      return response.data
    },
    onSuccess: () => {
      ElMessage.success('密碼修改成功')
    },
    onError: (error) => {
      ElMessage.error(getErrorMessage(error) || '修改密碼失敗')
    }
  })
}

/**
 * Computed helper to check if user is authenticated
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @returns {ComputedRef<boolean>}
 */
export function useIsAuthenticated(userQuery: UseQueryReturnType<AuthUser, Error>): ComputedRef<boolean> {
  return computed(() => {
    // IMPORTANT: userQuery properties are refs, need to access .value
    return userQuery.isSuccess.value && !!userQuery.data.value
  })
}

/**
 * @deprecated Use usePermissions().hasPermission() from @/composables/usePermissions instead
 *
 * This function is kept for backward compatibility but will be removed in future versions.
 * It has several issues:
 * - Requires passing userQuery parameter (verbose)
 * - No tri-state logic (can't distinguish loading from no-permission)
 * - Returns boolean instead of null|true|false
 *
 * Migration example:
 * ```
 * // Old way
 * const userQuery = useCurrentUser()
 * const canEdit = useHasPermission(userQuery, 'edit_project')
 *
 * // New way
 * const { hasPermission } = usePermissions()
 * const canEdit = computed(() => hasPermission('edit_project'))
 * ```
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @param {string} permission - Permission to check
 * @returns {ComputedRef<boolean>}
 */
export function useHasPermission(userQuery: UseQueryReturnType<AuthUser, Error>, permission: string): ComputedRef<boolean> {
  console.warn(
    '[DEPRECATED] useHasPermission(userQuery, permission) is deprecated. ' +
    'Use usePermissions().hasPermission(permission) instead. ' +
    'See @/composables/usePermissions.js'
  )

  return computed(() => {
    // IMPORTANT: userQuery.data is a ref, need to access .value
    const userData = userQuery.data.value
    if (!userData?.permissions) return false
    return userData.permissions.includes(permission)
  })
}

/**
 * @deprecated Use usePermissions().hasPermission('system_admin') from @/composables/usePermissions instead
 *
 * This function is kept for backward compatibility but will be removed in future versions.
 * Using specific permissions from permissionConfig.json is preferred over vague role checks.
 *
 * Migration example:
 * ```
 * // Old way (vague, role-based)
 * const userQuery = useCurrentUser()
 * const isAdmin = useIsSystemAdmin(userQuery)
 *
 * // New way (specific, permission-based)
 * const { hasPermission } = usePermissions()
 * const canManageUsers = computed(() => hasPermission('manage_users'))
 * ```
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @returns {ComputedRef<boolean>}
 */
export function useIsSystemAdmin(userQuery: UseQueryReturnType<AuthUser, Error>): ComputedRef<boolean> {
  console.warn(
    '[DEPRECATED] useIsSystemAdmin(userQuery) is deprecated. ' +
    'Use specific permission checks with usePermissions().hasPermission() instead. ' +
    'See @/composables/usePermissions.js and @/config/permissionConfig.json'
  )

  return useHasPermission(userQuery, 'system_admin')
}

/**
 * @deprecated Use usePermissions().permissions from @/composables/usePermissions instead
 *
 * This function is kept for backward compatibility but will be removed in future versions.
 *
 * Migration example:
 * ```
 * // Old way
 * const userQuery = useCurrentUser()
 * const permissions = useUserPermissions(userQuery)
 *
 * // New way
 * const { permissions } = usePermissions()
 * ```
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @returns {ComputedRef<string[]>}
 */
export function useUserPermissions(userQuery: UseQueryReturnType<AuthUser, Error>): ComputedRef<string[]> {
  console.warn(
    '[DEPRECATED] useUserPermissions(userQuery) is deprecated. ' +
    'Use usePermissions().permissions instead. ' +
    'See @/composables/usePermissions.js'
  )

  return computed(() => {
    const userData = userQuery.data.value
    if (!userData?.permissions) return []
    return userData.permissions
  })
}

/**
 * @deprecated Use usePermissions().hasAnyPermission() from @/composables/usePermissions instead
 *
 * This function is kept for backward compatibility but will be removed in future versions.
 *
 * Migration example:
 * ```
 * // Old way
 * const userQuery = useCurrentUser()
 * const canManage = useHasAnyPermission(userQuery, ['manage_users', 'system_admin'])
 *
 * // New way
 * const { hasAnyPermission } = usePermissions()
 * const canManage = computed(() => hasAnyPermission(['manage_users', 'system_admin']))
 * ```
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @param {string[]} permissions - Array of permissions to check
 * @returns {ComputedRef<boolean>}
 */
export function useHasAnyPermission(userQuery: UseQueryReturnType<AuthUser, Error>, permissions: string[]): ComputedRef<boolean> {
  console.warn(
    '[DEPRECATED] useHasAnyPermission(userQuery, permissions) is deprecated. ' +
    'Use usePermissions().hasAnyPermission(permissions) instead. ' +
    'See @/composables/usePermissions.js'
  )

  return computed(() => {
    const userData = userQuery.data.value
    if (!userData?.permissions) return false
    return permissions.some(p => (userData.permissions ?? []).includes(p))
  })
}

/**
 * @deprecated Use usePermissions().hasAllPermissions() from @/composables/usePermissions instead
 *
 * This function is kept for backward compatibility but will be removed in future versions.
 *
 * Migration example:
 * ```
 * // Old way
 * const userQuery = useCurrentUser()
 * const hasFullAccess = useHasAllPermissions(userQuery, ['manage_users', 'system_admin'])
 *
 * // New way
 * const { hasAllPermissions } = usePermissions()
 * const hasFullAccess = computed(() => hasAllPermissions(['manage_users', 'system_admin']))
 * ```
 *
 * @param {UseQueryResult} userQuery - Result from useCurrentUser()
 * @param {string[]} permissions - Array of permissions to check
 * @returns {ComputedRef<boolean>}
 */
export function useHasAllPermissions(userQuery: UseQueryReturnType<AuthUser, Error>, permissions: string[]): ComputedRef<boolean> {
  console.warn(
    '[DEPRECATED] useHasAllPermissions(userQuery, permissions) is deprecated. ' +
    'Use usePermissions().hasAllPermissions(permissions) instead. ' +
    'See @/composables/usePermissions.js'
  )

  return computed(() => {
    const userData = userQuery.data.value
    if (!userData?.permissions) return false
    return permissions.every(p => (userData.permissions ?? []).includes(p))
  })
}

/**
 * 🎯 Unified Auth Composable (Vue 3 Best Practice)
 *
 * This is the recommended way to access authentication state in components.
 * Follows Evan You's Composition API design principles:
 * - Single source of truth
 * - Reactive by default
 * - Type-safe
 * - Easy to use
 *
 * @example
 * ```typescript
 * // Simple usage
 * const { user, isAuthenticated, isLoading } = useAuth()
 *
 * // Access user properties
 * const { userEmail, userId, userName } = useAuth()
 *
 * // Logout
 * const { logout } = useAuth()
 * await logout()
 * ```
 *
 * @returns {Object} Authentication state and methods
 */
export function useAuth() {
  // Get the base query
  const userQuery = useCurrentUser()
  const logoutMutation = useLogout()

  // Computed: Current user (reactive)
  const user = computed(() => userQuery.data.value)

  // Computed: Authentication status
  const isAuthenticated = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  // Computed: Loading state
  const isLoading = computed(() => userQuery.isLoading.value)

  // Computed: Error state
  const isError = computed(() => userQuery.isError.value)

  // Computed: JWT Token (read-only access)
  const token = computed(() => {
    return sessionStorage.getItem('sessionId')
  })

  // Computed: User email (shortcut)
  const userEmail = computed(() => user.value?.userEmail ?? '')

  // Computed: User ID (shortcut)
  const userId = computed(() => user.value?.userId ?? '')

  // Computed: User name (shortcut) - uses email as identifier
  const userName = computed(() => user.value?.userEmail ?? '')

  // Computed: User display name (shortcut)
  const userDisplayName = computed(() => user.value?.displayName ?? user.value?.userEmail ?? '')

  // Method: Logout
  const logout = async () => {
    await logoutMutation.mutateAsync()
  }

  // Method: Clear authentication state (utility)
  const clearAuth = () => {
    apiClient.clearToken()
  }

  // Method: Refresh user data
  const refresh = async () => {
    await userQuery.refetch()
  }

  return {
    // User data
    user,
    userEmail,
    userId,
    userName,
    userDisplayName,

    // Authentication state
    isAuthenticated,
    isLoading,
    isError,
    token,

    // Methods
    logout,
    clearAuth,
    refresh,

    // Raw query object (for advanced usage)
    userQuery
  }
}
