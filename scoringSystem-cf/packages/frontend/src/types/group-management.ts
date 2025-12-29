/**
 * Shared TypeScript types for Group Management components
 *
 * This file centralizes type definitions to avoid duplication across components
 * and ensure consistency in the group management domain.
 */

// ============================================================================
// Project Groups
// ============================================================================

export interface ProjectGroup {
  groupId: string
  groupName: string
  allowChange: boolean
  status: 'active' | 'inactive'
  description?: string
  memberCount: number
  leaderCount: number
  members?: GroupMember[]
}

// ============================================================================
// Global Groups
// ============================================================================

export interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions?: string // JSON string of permission array
  isActive: boolean
  createdTime: string
  memberCount?: number
}

// ============================================================================
// Group Members
// ============================================================================

export interface GroupMember {
  membershipId: string
  userEmail: string
  displayName: string
  role?: 'member' | 'leader'
  joinTime?: string
  joinedAt?: string
  // Avatar fields (for DiceBear avatar display)
  userId?: string
  avatarSeed?: string | null
  avatarStyle?: string
  avatarOptions?: string // JSON string
}

// ============================================================================
// Users
// ============================================================================

export interface User {
  userEmail: string
  displayName: string
  disabled?: boolean
  isUngrouped?: boolean
}

// ============================================================================
// Projects
// ============================================================================

export interface Project {
  projectId: string
  projectName: string
}

// ============================================================================
// Type Guards
// ============================================================================

export function isProjectGroup(group: ProjectGroup | GlobalGroup): group is ProjectGroup {
  return 'allowChange' in group
}

export function isGlobalGroup(group: ProjectGroup | GlobalGroup): group is GlobalGroup {
  return 'globalPermissions' in group
}

// ============================================================================
// Permissions
// ============================================================================

/**
 * Global permission types
 * These permissions define what system-level actions a user can perform
 */
export type GlobalPermission =
  | 'system_admin'
  | 'create_project'
  | 'manage_users'
  | 'generate_invites'
  | 'view_all_projects'
  | 'manage_global_groups'

/**
 * Permission text mapping for UI display
 */
export const PERMISSION_TEXT_MAP: Record<GlobalPermission, string> = {
  system_admin: '系統管理員',
  create_project: '建立專案',
  manage_users: '管理使用者',
  generate_invites: '產生邀請碼',
  view_all_projects: '查看所有專案',
  manage_global_groups: '管理全域群組'
}

// ============================================================================
// Utility Types
// ============================================================================

export type GroupStatus = 'active' | 'inactive'
export type MemberRole = 'member' | 'leader'
