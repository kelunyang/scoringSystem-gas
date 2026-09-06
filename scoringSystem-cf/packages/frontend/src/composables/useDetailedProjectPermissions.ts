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

import { hasProjectAdminRole } from './useProjectAdminRole'

/**
 * calculateProjectPermissions 從專案身上真正讀到的欄位。
 * 呼叫端傳的是 /projects/list-with-stages 的清單項目（不是 Project 實體），
 * 那個形狀沒有 creatorId / settings 之類的欄位。
 */
export interface PermissionProject {
  createdBy?: string | null
  viewerRole?: 'teacher' | 'observer' | 'member' | null
  userGroups?: Array<{ groupId: string; role: string }>
  groups?: Array<{ groupId: string; allowChange?: boolean }>
}

/**
 * Calculate permissions for a single project object
 * (Standalone version without reactivity, for use in array mapping)
 *
 * @param {Object} project - Project data with viewerRole, userGroups and createdBy
 * @param {Array} globalPermissions - User's global permissions array
 * @param {string} currentUserId - The acting user's id, compared against
 *   `project.createdBy`. Without it a creator who lacks system_admin sees no
 *   administrative controls on their own project.
 * @returns {Object} Permissions object
 */
export function calculateProjectPermissions(
  project: PermissionProject,
  globalPermissions: string[] = [],
  currentUserId?: string | null
) {
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

  // Level 0 via the shared rule — see useProjectAdminRole.ts
  const hasGlobalAdmin = hasProjectAdminRole(
    globalPermissions,
    currentUserId,
    project
  )

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
    const isLeader = userGroups.some(g => g.role === 'leader')
    const isMember = userGroups.some(g => g.role === 'member')

    // Level 3: Group Leader
    if (isLeader) {
      const leaderGroup = userGroups.find(g => g.role === 'leader')

      // Get allowChange from project.groups array (not from userGroups)
      const group = project.groups?.find(g => g.groupId === leaderGroup?.groupId)
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
