/**
 * Detailed Project Permissions Composable
 *
 * Provides comprehensive 6-layer permission calculation for projects.
 * This composable unifies the permission logic from Dashboard.vue and ProjectDetail.vue.
 *
 * Permission Layers:
 * - Level 0: Admin (system_admin or project creator)
 * - Level 1: Teacher (projectViewers role='teacher')
 * - Level 2: Observer (projectViewers role='observer')
 * - Level 3: Group Leader (userGroups role='leader' with allowChange)
 * - Level 4: Group Member (userGroups role='member')
 * - Level 5: Member (projectViewers role='member' but not in any group)
 *
 * Key Features:
 * - Checks both projectViewers AND userGroups tables
 * - Handles allowChange flag for group leader permissions
 * - Returns standardized permission object
 * - Eliminates code duplication between components
 */

import { computed, type Ref } from 'vue'
import { usePermissions } from './usePermissions'
import type { Group, Project, AuthUser } from '@/types'

/**
 * Calculate detailed project permissions for a user
 *
 * @param {Object} options - Configuration options
 * @param {Ref<AuthUser>} options.userData - Current user data (from useCurrentUser)
 * @param {Ref<Project>} options.project - Project data with viewerRole and userGroups
 * @returns {Object} Detailed permissions object
 */
export function useDetailedProjectPermissions({ userData, project }: { userData: Ref<AuthUser>; project: Ref<Project> }) {
  const { hasAnyPermission } = usePermissions()

  /**
   * Comprehensive permission calculation
   * Returns all permission flags and the permission level identifier
   */
  const permissions = computed(() => {
    // Default: no access
    const defaultPermissions = {
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

    if (!project.value || !userData.value) {
      return defaultPermissions
    }

    const globalPermissions = userData.value.permissions || []
    const projectData = project.value

    // Level 0: Admin (system_admin or create_project)
    const hasGlobalAdmin = globalPermissions.includes('system_admin') ||
                          globalPermissions.includes('create_project')

    if (hasGlobalAdmin) {
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false, // Only group leaders can manage members
        canSubmit: false,
        canVote: false,
        canComment: false, // Admins don't comment (teachers do)
        canManageStages: true,
        canTeacherVote: false, // Admins don't vote (teachers do)
        canViewAll: true,
        permissionLevel: 'admin'
      }
    }

    // Level 1: Teacher (projectViewers role='teacher')
    if (projectData.viewerRole === 'teacher') {
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false, // Only group leaders can manage members
        canSubmit: false, // Teachers don't submit as students
        canVote: false, // Teachers don't vote as students
        canComment: true,
        canManageStages: true,
        canTeacherVote: true,
        canViewAll: true,
        permissionLevel: 'teacher'
      }
    }

    // Level 2: Observer (projectViewers role='observer')
    if (projectData.viewerRole === 'observer') {
      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: false,
        canManageMembers: false,
        canSubmit: false,
        canVote: false,
        canComment: false, // Observers can't comment
        canManageStages: false,
        canTeacherVote: false,
        canViewAll: true,
        permissionLevel: 'observer'
      }
    }

    // Levels 3-5: Students (projectViewers role='member')
    if (projectData.viewerRole === 'member') {
      const userGroups = projectData.userGroups || []
      const isLeader = userGroups.some((g: Group) => g.role === 'leader')
      const isMember = userGroups.some((g: Group) => g.role === 'member')

      // Level 3: Group Leader
      if (isLeader) {
        const leaderGroup = userGroups.find((g: Group) => g.role === 'leader')
        const canChangeMembers = leaderGroup?.allowChange !== false

        return {
          canEnter: true,
          canViewLogs: true,
          isGroupLeader: true,  // Always true for group leaders (button visibility)
          canManageMembers: canChangeMembers, // Only if allowChange is true (member operations)
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

      // Level 5: Member without Group (completely blocked from project)
      return {
        canEnter: false,  // Cannot enter project page until assigned to a group
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
    return defaultPermissions
  })

  return {
    permissions,

    // Convenience getters for individual permission checks
    canEnter: computed(() => permissions.value.canEnter),
    canViewLogs: computed(() => permissions.value.canViewLogs),
    isGroupLeader: computed(() => permissions.value.isGroupLeader),
    canManageMembers: computed(() => permissions.value.canManageMembers),
    canSubmit: computed(() => permissions.value.canSubmit),
    canVote: computed(() => permissions.value.canVote),
    canComment: computed(() => permissions.value.canComment),
    canManageStages: computed(() => permissions.value.canManageStages),
    canTeacherVote: computed(() => permissions.value.canTeacherVote),
    canViewAll: computed(() => permissions.value.canViewAll),
    permissionLevel: computed(() => permissions.value.permissionLevel)
  }
}

/**
 * Calculate permissions for a single project object
 * (Standalone version without reactivity, for use in array mapping)
 *
 * @param {Object} project - Project data with viewerRole and userGroups
 * @param {Array} globalPermissions - User's global permissions array
 * @returns {Object} Permissions object
 */
export function calculateProjectPermissions(project: Project, globalPermissions: string[] = []) {
  // Default: no access
  const defaultPermissions = {
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

  if (!project) {
    return defaultPermissions
  }

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

  // Levels 3-5: Students
  if (project.viewerRole === 'member') {
    const userGroups = project.userGroups || []
    const isLeader = userGroups.some((g: Group) => g.role === 'leader')
    const isMember = userGroups.some((g: Group) => g.role === 'member')

    // Level 3: Group Leader
    if (isLeader) {
      const leaderGroup = userGroups.find((g: any) => g.role === 'leader')

      // Get allowChange from project.groups array (not from userGroups)
      const group = (project as any).groups?.find((g: any) => g.groupId === leaderGroup?.groupId)
      const canChangeMembers = Boolean(group?.allowChange)

      return {
        canEnter: true,
        canViewLogs: true,
        isGroupLeader: true,  // Always true for group leaders (button visibility)
        canManageMembers: canChangeMembers, // Only if allowChange is true (member operations)
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

    // Level 5: Member without Group (completely blocked from project)
    return {
      canEnter: false,  // Cannot enter project page until assigned to a group
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
  return defaultPermissions
}
