/**
 * Enhanced Project Permissions Composable
 *
 * This is an improved version that handles all data transformation internally
 * and returns reactive permission flags for direct use in components.
 *
 * @example
 * <script setup>
 * const {
 *   permissions,
 *   canSubmit,
 *   canComment
 * } = useProjectPermissions(projectData, userData)
 * </script>
 */

import { computed, unref, type Ref, type ComputedRef } from 'vue'
import type { Project, AuthUser, Group } from '@/types'
import { useSudoStore } from '@/stores/sudo'

/**
 * Permission level type
 */
export type PermissionLevel = 'none' | 'member' | 'member_in_group' | 'group_leader' | 'observer' | 'teacher' | 'admin'

/**
 * User group with enriched metadata
 */
export interface UserGroup {
  role: 'leader' | 'member'
  allowChange: boolean
}

/**
 * Normalized project data for permission calculation
 */
export interface NormalizedProject {
  viewerRole?: 'admin' | 'teacher' | 'observer' | 'member'
  userGroups: UserGroup[]
}

/**
 * Permission flags
 */
export interface PermissionFlags {
  canEnter: boolean
  canViewLogs: boolean
  isGroupLeader: boolean
  canManageMembers: boolean
  canSubmit: boolean
  canVote: boolean
  canComment: boolean
  canManageStages: boolean
  canTeacherVote: boolean
  canViewAll: boolean
  permissionLevel: PermissionLevel
}

/**
 * Project data with groups and user groups
 * Using intersection type to properly extend with custom userGroups structure
 */
export type ProjectDataWithGroups = Omit<Project, 'userGroups'> & {
  viewerRole?: 'admin' | 'teacher' | 'observer' | 'member'
  userGroups?: Array<{
    userEmail: string
    groupId: string
    role: 'leader' | 'member'
    isActive: number
  }>
  groups?: Array<{
    groupId: string
    allowChange?: boolean
  }>
}

/**
 * User data with permissions
 */
export interface UserDataWithPermissions extends AuthUser {
  permissions?: string[]
  email?: string
}

/**
 * Main composable for project permissions
 *
 * @param {import('vue').Ref} projectData - Reactive project data
 * @param {import('vue').Ref} userData - Reactive user data
 * @param {import('vue').Ref} [activeRole] - Optional: Currently selected role (for role switching)
 * @returns {Object} Reactive permission flags
 */
export function useProjectPermissions(
  projectData: Ref<ProjectDataWithGroups | null | undefined>,
  userData: Ref<UserDataWithPermissions | null | undefined>,
  activeRole: Ref<PermissionLevel | null> | null = null
) {
  /**
   * Calculate detailed permissions based on project and user data
   */
  const permissions: ComputedRef<PermissionFlags> = computed(() => {
    // Default permissions (no access)
    const defaultPermissions: PermissionFlags = {
      canEnter: false,
      canViewLogs: false,
      isGroupLeader: false,
      canManageMembers: false,
      canSubmit: false,
      canVote: false,
      canComment: false,
      canManageStages: false,
      canTeacherVote: false,
      canViewAll: false,
      permissionLevel: 'none'
    }

    // ✅ 使用 unref() 確保響應式依賴追蹤正確
    // unref() 會正確處理 Ref<T> 和 T 兩種類型
    const project = unref(projectData)
    const user = unref(userData)

    // 添加對 projectData 和 userData 本身的 null 檢查
    if (!project || !user) {
      return defaultPermissions
    }

    // 🕵️ 檢查是否為 sudo 模式
    // 注意：projectData 結構是 { project: { projectId: ... }, groups: [...], ... }
    const sudoStore = useSudoStore()
    const projectIdFromData = (project as any).project?.projectId
    const isSudoActive = sudoStore.isActive &&
                         sudoStore.projectId === projectIdFromData &&
                         sudoStore.targetUser

    // 🕵️ 使用有效的 email（sudo target 或真實用戶）
    const effectiveEmail = isSudoActive
      ? sudoStore.targetUser!.userEmail
      : (user.email || user.userEmail)

    // 🕵️ 在 sudo 模式下，強制 viewerRole 為 member，清空全域權限
    const effectiveViewerRole = isSudoActive ? 'member' as const : project.viewerRole
    const effectiveGlobalPermissions = isSudoActive ? [] : (user.permissions || [])

    // Normalize project data for permission calculation
    const normalizedProject: NormalizedProject = {
      viewerRole: effectiveViewerRole,
      userGroups: normalizeUserGroups(
        project.userGroups || [],
        project.groups || [],
        effectiveEmail
      )
    }

    // 🕵️ SUDO 模式下，忽略 activeRole 參數，使用被 sudo 用戶的實際權限
    // If activeRole is provided AND NOT in sudo mode, calculate permissions based on selected role
    const role = (!isSudoActive && activeRole) ? unref(activeRole) : null
    if (role) {
      return calculatePermissionsByRole(
        role,
        normalizedProject,
        effectiveGlobalPermissions
      )
    }

    return calculateProjectPermissions(normalizedProject, effectiveGlobalPermissions)
  })

  // Return reactive permission flags as individual computed refs
  return {
    permissions,
    canSubmit: computed(() => permissions.value.canSubmit),
    canComment: computed(() => permissions.value.canComment),
    canVote: computed(() => permissions.value.canVote),
    canManageStages: computed(() => permissions.value.canManageStages),
    canTeacherVote: computed(() => permissions.value.canTeacherVote),
    canViewAll: computed(() => permissions.value.canViewAll),
    canEnter: computed(() => permissions.value.canEnter),
    canViewLogs: computed(() => permissions.value.canViewLogs),
    isGroupLeader: computed(() => permissions.value.isGroupLeader),
    canManageMembers: computed(() => permissions.value.canManageMembers),
    permissionLevel: computed(() => permissions.value.permissionLevel)
  }
}

/**
 * Normalize user groups data
 * Filters for current user and enriches with group metadata
 */
function normalizeUserGroups(
  userGroups: Array<{ userEmail: string; groupId: string; role: 'leader' | 'member'; isActive: number }>,
  groups: Array<{ groupId: string; allowChange?: boolean }>,
  userEmail: string
): UserGroup[] {
  return userGroups
    .filter(ug => ug.userEmail === userEmail && ug.isActive)
    .map(ug => {
      const group = groups.find(g => g.groupId === ug.groupId)
      return {
        role: ug.role,
        allowChange: Boolean(group?.allowChange)  // Defensive conversion: handles both 0/1 and true/false
      }
    })
}

/**
 * Calculate permissions based on a specific role (for role switching)
 * @param {string} role - The role to calculate permissions for
 * @param {Object} project - Normalized project data
 * @param {Array} globalPermissions - User's global permissions
 * @returns {Object} Permission flags for the specified role
 */
function calculatePermissionsByRole(
  role: PermissionLevel,
  project: NormalizedProject,
  globalPermissions: string[] = []
): PermissionFlags {
  switch (role) {
    case 'admin':
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: false,
        canVote: false,
        canComment: false,
        canManageStages: true,
        canTeacherVote: false,
        canViewAll: true,
        permissionLevel: 'admin'
      }

    case 'teacher':
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: false,
        canVote: false,
        canComment: true,
        canManageStages: true,
        canTeacherVote: true,
        canViewAll: true,
        permissionLevel: 'teacher'
      }

    case 'observer':
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: false,
        canVote: false,
        canComment: false,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: true,
        permissionLevel: 'observer'
      }

    case 'group_leader': {
      const userGroups = project.userGroups || []
      const leaderGroup = userGroups.find(g => g.role === 'leader')
      const canChangeMembers = leaderGroup?.allowChange !== false

      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: true,  // Always true for group leaders
        canManageMembers: canChangeMembers, // Only if allowChange is true
        canSubmit: true,
        canVote: true,
        canComment: true,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: false,
        permissionLevel: 'group_leader'
      }
    }

    case 'member_in_group':
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: true,
        canVote: true,
        canComment: true,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: false,
        permissionLevel: 'member_in_group'
      }

    case 'member':
      return {
        canEnter: false,
        canViewLogs: false,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: false,
        canVote: false,
        canComment: false,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: false,
        permissionLevel: 'member'
      }

    default:
      // Fallback to default calculation
      return calculateProjectPermissions(project, globalPermissions)
  }
}

/**
 * Calculate permissions based on normalized project data
 * This is the core permission calculation logic
 */
function calculateProjectPermissions(project: NormalizedProject, globalPermissions: string[] = []): PermissionFlags {
  // Level 0: Admin (system_admin or create_project)
  const hasGlobalAdmin = globalPermissions.includes('system_admin') ||
                        globalPermissions.includes('create_project')

  if (hasGlobalAdmin) {
    return {
      canEnter: true,
      canViewLogs: true,
      isGroupLeader: false,
      canManageMembers: false,
      canSubmit: false,
      canVote: false,
      canComment: false, // Admins don't comment (teachers do)
      canManageStages: true,
      canTeacherVote: false, // Admins don't vote (teachers do)
      canViewAll: true,
      permissionLevel: 'admin'
    }
  }

  // Level 1: Teacher
  if (project.viewerRole === 'teacher') {
    return {
      canEnter: true,
      canViewLogs: true,
      isGroupLeader: false,
      canManageMembers: false,
      canSubmit: false,
      canVote: false,
      canComment: true,
      canManageStages: true,
      canTeacherVote: true,
      canViewAll: true,
      permissionLevel: 'teacher'
    }
  }

  // Level 2: Observer
  if (project.viewerRole === 'observer') {
    return {
      canEnter: true,
      canViewLogs: true,
      isGroupLeader: false,
      canManageMembers: false,
      canSubmit: false,
      canVote: false,
      canComment: false,
      canManageStages: false,
      canTeacherVote: false,
      canViewAll: true,
      permissionLevel: 'observer'
    }
  }

  // Levels 3-5: Students (role='member')
  if (project.viewerRole === 'member') {
    const userGroups = project.userGroups || []
    const isLeader = userGroups.some(g => g.role === 'leader')
    const isMember = userGroups.some(g => g.role === 'member')

    // Level 3: Group Leader
    if (isLeader) {
      const leaderGroup = userGroups.find(g => g.role === 'leader')
      const canChangeMembers = leaderGroup?.allowChange !== false

      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: true,  // Always true for group leaders
        canManageMembers: canChangeMembers, // Only if allowChange is true
        canSubmit: true,
        canVote: true,
        canComment: true,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: false,
        permissionLevel: 'group_leader'
      }
    }

    // Level 4: Group Member
    if (isMember) {
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: true,
        canVote: true,
        canComment: true,
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: false,
        permissionLevel: 'member_in_group'
      }
    }

    // Level 5: Member without Group
    return {
      canEnter: false,
      canViewLogs: false,
      isGroupLeader: false,
      canManageMembers: false,
      canSubmit: false,
      canVote: false,
      canComment: false,
      canManageStages: false,
      canTeacherVote: false,
      canViewAll: false,
      permissionLevel: 'member'
    }
  }

  // No role found
  return {
    canEnter: false,
    canViewLogs: false,
    isGroupLeader: false,
    canManageMembers: false,
    canSubmit: false,
    canVote: false,
    canComment: false,
    canManageStages: false,
    canTeacherVote: false,
    canViewAll: false,
    permissionLevel: 'none'
  }
}

/**
 * Get numeric permission level for backward compatibility
 * Maps string levels to numbers: admin=0, teacher=1, observer=2, student=3, none=null
 */
export function getNumericPermissionLevel(permissionLevel: PermissionLevel): number | null {
  const levelMap: Record<PermissionLevel, number | null> = {
    'admin': 0,
    'teacher': 1,
    'observer': 2,
    'group_leader': 3,
    'member_in_group': 3,
    'member': null,
    'none': null
  }
  return levelMap[permissionLevel] ?? null
}
