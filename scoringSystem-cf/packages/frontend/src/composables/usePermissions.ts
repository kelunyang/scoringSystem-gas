/**
 * Simplified Permission System (following Linus's recommendations)
 *
 * This composable provides a clean API for permission checking without
 * requiring userQuery to be passed around everywhere.
 *
 * Key improvements over old system:
 * - No need to pass userQuery parameter
 * - Tri-state logic: null (loading/error) | true | false
 * - Simpler API
 * - Better reactivity
 */

import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { useCurrentUser } from './useAuth'
import type { UseQueryReturnType } from '@tanstack/vue-query'
import type { AuthUser } from '@/types'

/**
 * Permission check return type (tri-state)
 */
type PermissionCheckResult = null | boolean

/**
 * Main permissions composable
 *
 * @param userQueryParam - Optional userQuery to use (for better reactivity)
 * @returns Permission checking utilities
 *
 * @example
 * const { hasPermission, hasAnyPermission, permissions } = usePermissions()
 *
 * const canDelete = computed(() => hasPermission('delete_project'))
 * const canManage = computed(() => hasAnyPermission(['system_admin', 'manage_users']))
 */
export function usePermissions(userQueryParam: UseQueryReturnType<AuthUser | null, Error> | null = null) {
  // Use provided userQuery or create new one
  const userQuery = userQueryParam || useCurrentUser()

  // ✅ Create intermediate computed to establish proper reactive dependency chain
  const user = computed(() => userQuery.data.value || null)

  /**
   * Raw permissions array
   */
  const permissions: ComputedRef<string[]> = computed(() => {
    const userData = user.value  // ← Use user.value instead of userQuery.data.value
    if (!userData?.permissions) return []
    return userData.permissions
  })

  /**
   * Is the user query currently loading?
   */
  const isLoading: ComputedRef<boolean> = computed(() => userQuery.isLoading.value)

  /**
   * Did the user query fail?
   */
  const hasError: ComputedRef<boolean> = computed(() => userQuery.isError.value)

  /**
   * Check if user has a specific permission
   *
   * Tri-state return:
   * - null: Still loading or error occurred
   * - true: User has the permission
   * - false: User doesn't have the permission
   *
   * @param permission - Permission key to check
   * @returns Tri-state permission check result
   *
   * @example
   * if (hasPermission('system_admin') === true) {
   *   // Show admin UI
   * } else if (hasPermission('system_admin') === null) {
   *   // Show loading state
   * } else {
   *   // Show no permission state
   * }
   */
  function hasPermission(permission: string): PermissionCheckResult {
    // Return null during loading or error states
    if (isLoading.value || hasError.value) return null

    return permissions.value.includes(permission)
  }

  /**
   * Check if user has ANY of the specified permissions
   *
   * Tri-state return:
   * - null: Still loading or error occurred
   * - true: User has at least one of the permissions
   * - false: User has none of the permissions
   *
   * @param permissionList - Array of permission keys
   * @returns Tri-state permission check result
   *
   * @example
   * const canManageSystem = hasAnyPermission(['system_admin', 'manage_users'])
   */
  function hasAnyPermission(permissionList: string[]): PermissionCheckResult {
    if (isLoading.value || hasError.value) return null

    return permissionList.some(p => permissions.value.includes(p))
  }

  /**
   * Check if user has ALL of the specified permissions
   *
   * Tri-state return:
   * - null: Still loading or error occurred
   * - true: User has all permissions
   * - false: User is missing at least one permission
   *
   * @param permissionList - Array of permission keys
   * @returns Tri-state permission check result
   *
   * @example
   * const hasFullAccess = hasAllPermissions(['system_admin', 'manage_users'])
   */
  function hasAllPermissions(permissionList: string[]): PermissionCheckResult {
    if (isLoading.value || hasError.value) return null

    return permissionList.every(p => permissions.value.includes(p))
  }

  /**
   * Check if user is authenticated
   */
  const isAuthenticated: ComputedRef<boolean> = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return {
    // Core permission data
    permissions,
    isLoading,
    hasError,
    isAuthenticated,

    // Permission check functions
    hasPermission,
    hasAnyPermission,
    hasAllPermissions
  }
}

/**
 * Get user permissions as a computed ref (for template use)
 *
 * @returns Computed ref of permissions array
 *
 * @example
 * const permissions = useUserPermissions()
 * // In template: v-if="permissions.includes('system_admin')"
 */
export function useUserPermissions(): ComputedRef<string[]> {
  const { permissions } = usePermissions()
  return permissions
}

/**
 * Check if user has a specific permission (reactive)
 *
 * @param permission - Permission to check
 * @returns Computed ref of permission check result
 *
 * @example
 * const canDelete = useHasPermission('delete_project')
 * // In template: v-if="canDelete === true"
 */
export function useHasPermission(permission: string): ComputedRef<PermissionCheckResult> {
  const { hasPermission } = usePermissions()
  return computed(() => hasPermission(permission))
}

/**
 * Check if user has any of the specified permissions (reactive)
 *
 * @param permissions - Permissions to check
 * @returns Computed ref of permission check result
 *
 * @example
 * const canManage = useHasAnyPermission(['system_admin', 'manage_users'])
 */
export function useHasAnyPermission(permissions: string[]): ComputedRef<PermissionCheckResult> {
  const { hasAnyPermission } = usePermissions()
  return computed(() => hasAnyPermission(permissions))
}

/**
 * Check if user has all of the specified permissions (reactive)
 *
 * @param permissions - Permissions to check
 * @returns Computed ref of permission check result
 *
 * @example
 * const hasFullAccess = useHasAllPermissions(['system_admin', 'manage_users'])
 */
export function useHasAllPermissions(permissions: string[]): ComputedRef<PermissionCheckResult> {
  const { hasAllPermissions } = usePermissions()
  return computed(() => hasAllPermissions(permissions))
}
