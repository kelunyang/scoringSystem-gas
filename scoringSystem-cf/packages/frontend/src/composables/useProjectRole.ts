/**
 * Project Role Management Composable
 *
 * Provides utilities for checking and managing project-level roles:
 * - teacher: Can manage stages, score submissions, manage wallets
 * - observer: Read-only access to project data
 * - member: Standard group participant
 *
 * This replaces the old global teacher_privilege system with
 * project-specific role checking.
 */

import { ref, computed, type Ref } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import { usePermissions } from './usePermissions'
import type { ProjectCoreData } from './useProjectDetail'

/**
 * Get project viewers (teachers and observers) for a project
 *
 * @param {import('vue').Ref<string>} projectId - Reactive project ID
 * @returns {Object} Query result with viewers data
 */
export function useProjectViewers(projectId: string | Ref<string | null>) {
  const projectIdValue = computed(() => typeof projectId === 'string' ? projectId : projectId.value)
  const isEnabled = computed(() => !!projectIdValue.value)

  return useQuery({
    queryKey: ['projectViewers', projectIdValue],
    queryFn: async () => {
      const httpResponse = await rpcClient.projects['viewers/list'].$post({
        json: { projectId: projectIdValue.value }
      })
      const result = await httpResponse.json()
      if (!result.success) {
        // Silently handle permission errors for regular members
        // They don't need to see the full viewer list - backend handles role assignment
        if (result.error?.code === 'PERMISSION_DENIED') {
          console.debug('[useProjectRole] User does not have permission to view project viewers list (this is normal for regular members)')
          return []
        }
        throw new Error(result.error?.message || 'Failed to fetch project viewers')
      }
      return result.data
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // Cache for 5 minutes
  })
}

/**
 * Get current user's role in a specific project
 *
 * @param {import('vue').Ref<string>} projectId - Reactive project ID
 * @returns {Object} Query result with role data
 */
export function useProjectRole(projectId: string | Ref<string | null>) {
  const projectIdValue = computed(() => typeof projectId === 'string' ? projectId : projectId.value)

  const userQuery = useCurrentUser()
  const viewersQuery = useProjectViewers(projectIdValue || '')
  const { hasAnyPermission } = usePermissions()

  /**
   * Query project core data to check userGroups for Level 3 detection
   * Only enabled when we need to check for student membership
   */
  const projectCoreQuery = useQuery<ProjectCoreData>({
    queryKey: ['project', 'core', projectIdValue],
    queryFn: async () => {
      const httpResponse = await rpcClient.projects.core.$post({
        json: { projectId: projectIdValue.value }
      })
      const response = await httpResponse.json()
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch project core data')
      }
      return response.data
    },
    enabled: computed(() => !!projectIdValue.value && userQuery.isSuccess.value),
    staleTime: 1000 * 60 * 5 // 5 minutes cache (same as useProjectCore)
  })

  /**
   * Current user's email
   */
  const userEmail = computed(() => userQuery.data.value?.userEmail)

  /**
   * User's role in this project: 'teacher' | 'observer' | 'member' | null
   */
  const role = computed(() => {
    if (!viewersQuery.data.value || !userEmail.value) {
      return null
    }

    const viewer = viewersQuery.data.value.find(
      (v: any) => v.userEmail === userEmail.value && v.isActive
    )

    return viewer ? viewer.role : null
  })

  /**
   * Check if user is a teacher for this project
   */
  const isTeacher = computed(() => role.value === 'teacher')

  /**
   * Check if user is an observer for this project
   */
  const isObserver = computed(() => role.value === 'observer')

  /**
   * Check if user has any viewer role (teacher/observer/member)
   * Note: This only checks projectViewers table, not userGroups
   * For student membership (Level 3), components should check userGroups separately
   */
  const isMember = computed(() => !!role.value)

  /**
   * Check if user can manage this project
   * system_admin or create_project can manage all projects
   * Teachers can manage their assigned projects
   */
  const canManageProject = computed(() => {
    const hasGlobalPerms = hasAnyPermission(['system_admin', 'create_project'])
    if (hasGlobalPerms === true) return true
    return isTeacher.value
  })

  /**
   * Check if user can view this project
   * Any viewer role or member grants view access
   */
  const canViewProject = computed(() => {
    const hasGlobalPerms = hasAnyPermission(['system_admin', 'create_project'])
    if (hasGlobalPerms === true) return true
    return isMember.value
  })

  /**
   * Permission level of current user in this project
   * Level 0: System Admin (global permissions)
   * Level 1: Teacher (projectViewers role = 'teacher')
   * Level 2: Observer (projectViewers role = 'observer')
   * Level 3: Member (in project groups via userGroups)
   * null: No access or loading
   *
   * Now correctly detects Level 3 by checking userGroups table!
   */
  const permissionLevel = computed<0 | 1 | 2 | 3 | null>(() => {
    // Handle loading state
    const hasGlobalPerms = hasAnyPermission(['system_admin', 'create_project'])
    if (hasGlobalPerms === null) {
      return null // Still loading global permissions
    }

    // Level 0: Global admin
    if (hasGlobalPerms === true) {
      return 0
    }

    // Level 1: Teacher (from projectViewers)
    if (role.value === 'teacher') {
      return 1
    }

    // Level 2: Observer (from projectViewers)
    if (role.value === 'observer') {
      return 2
    }

    // Level 3: Check userGroups for student membership
    // User is Level 3 if they're in an active group in this project
    const userGroups = projectCoreQuery.data.value?.userGroups
    const currentUserEmail = userEmail.value

    if (userGroups && currentUserEmail) {
      const hasActiveGroup = userGroups.some((group: any) =>
        group.userEmail === currentUserEmail && group.isActive
      )
      if (hasActiveGroup) {
        return 3
      }
    }

    // Still loading or no access
    if (projectCoreQuery.isLoading.value) {
      return null
    }

    // No viewer role and no group membership = no access
    return null
  })

  /**
   * Can manage stages (create, edit, delete stages)
   * Level 0-1 only
   */
  const canManageStages = computed(() => {
    const level = permissionLevel.value
    return level !== null && level <= 1
  })

  /**
   * Can perform teacher voting (rank submissions)
   * Level 1 (Teacher) only - Admins cannot teacher vote
   */
  const canTeacherVote = computed(() => {
    const level = permissionLevel.value
    return level === 1
  })

  /**
   * Can view all submissions and data
   * Level 0-2 can view all
   */
  const canViewAll = computed(() => {
    const level = permissionLevel.value
    return level !== null && level <= 2
  })

  /**
   * Can submit deliverables (student function)
   * Level 3 only
   */
  const canSubmit = computed(() => {
    const level = permissionLevel.value
    return level === 3
  })

  /**
   * Can vote on peer submissions (student function)
   * Level 3 only
   */
  const canVote = computed(() => {
    const level = permissionLevel.value
    return level === 3
  })

  /**
   * Can post comments
   * Level 0-1 (admin/teacher guidance) and Level 3 (student discussion)
   * Level 2 (observer) cannot post
   */
  const canComment = computed(() => {
    const level = permissionLevel.value
    return level !== null && (level <= 1 || level === 3)
  })

  return {
    // Query state
    isLoading: viewersQuery.isLoading,
    isError: viewersQuery.isError,
    error: viewersQuery.error,

    // Role data
    role,
    isTeacher,
    isObserver,
    isMember,

    // Permission level (NEW)
    permissionLevel,

    // Permission checks (existing)
    canManageProject,
    canViewProject,

    // Permission checks (NEW - granular)
    canManageStages,
    canTeacherVote,
    canViewAll,
    canSubmit,
    canVote,
    canComment,

    // Raw viewers data (for management UI)
    viewers: viewersQuery.data,

    // Refetch function
    refetch: viewersQuery.refetch
  }
}

/**
 * Mutations for managing project viewers
 */
export function useProjectViewerMutations() {
  const queryClient = useQueryClient()

  /**
   * Add a viewer to a project
   */
  const addViewer = useMutation({
    mutationFn: async ({ projectId, targetUserEmail, role }: { projectId: string; targetUserEmail: string; role: string }) => {
      const httpResponse = await rpcClient.projects['viewers/add'].$post({
        json: { projectId, userEmail: targetUserEmail, role }
      })
      const result = await httpResponse.json()
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to add viewer')
      }
      return result.data
    },
    onSuccess: (_, variables) => {
      // Invalidate the viewers query for this project
      queryClient.invalidateQueries({ queryKey: ['projectViewers', variables.projectId] })
    }
  })

  /**
   * Remove a viewer from a project
   */
  const removeViewer = useMutation({
    mutationFn: async ({ projectId, targetUserEmail }: { projectId: string; targetUserEmail: string }) => {
      const httpResponse = await rpcClient.projects['viewers/remove'].$post({
        json: { projectId, userEmail: targetUserEmail }
      })
      const result = await httpResponse.json()
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to remove viewer')
      }
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectViewers', variables.projectId] })
    }
  })

  /**
   * Update a viewer's role
   */
  const updateViewerRole = useMutation({
    mutationFn: async ({ projectId, targetUserEmail, newRole }: { projectId: string; targetUserEmail: string; newRole: string }) => {
      const httpResponse = await rpcClient.projects['viewers/update-role'].$post({
        json: { projectId, userEmail: targetUserEmail, role: newRole }
      })
      const result = await httpResponse.json()
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to update viewer role')
      }
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectViewers', variables.projectId] })
    }
  })

  return {
    addViewer,
    removeViewer,
    updateViewerRole
  }
}

/**
 * Simple helper to check if current user is a teacher in a project
 *
 * @param {string} projectId - Project ID
 * @returns {import('vue').ComputedRef<boolean>} True if user is a teacher
 */
export function useIsProjectTeacher(projectId: string) {
  const { isTeacher } = useProjectRole(projectId)
  return isTeacher
}

/**
 * Simple helper to check if current user can manage a project
 *
 * @param {string} projectId - Project ID
 * @returns {import('vue').ComputedRef<boolean>} True if user can manage
 */
export function useCanManageProject(projectId: string) {
  const { canManageProject } = useProjectRole(projectId)
  return canManageProject
}
