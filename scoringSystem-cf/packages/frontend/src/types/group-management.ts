/**
 * Shared TypeScript types for Group Management components
 *
 * This file centralizes type definitions to avoid duplication across components
 * and ensure consistency in the group management domain.
 *
 * **專案群組的形狀從 API 契約推導**（見 plan/issue.md #011）。
 * 舊的手寫版本跟後端已經對不上——`status` 宣告成 `'active' | 'inactive'`
 * 但實際是 string，`description` 宣告成 `string` 但實際可為 null。
 * 後端改了欄位，現在會編譯失敗而不是靜靜漂走。
 */

import type { ApiData } from '@/utils/api-types'
import type { rpcClient } from '@/utils/rpc-client'

// ============================================================================
// Project Groups
// ============================================================================

export type ProjectGroup = ApiData<typeof rpcClient.api.groups.list.$post>[number]

// ============================================================================
// Global Groups
// ============================================================================

export interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions?: string | string[] // JSON 字串或已解析的權限陣列（API 回傳為陣列）
  isActive: boolean
  createdTime?: string | number
  description?: string | null
  memberCount?: number
}

// ============================================================================
// Group Members
// ============================================================================

export type GroupMember = NonNullable<ProjectGroup['members']>[number]

// ============================================================================
// Users
// ============================================================================

export interface User {
  userId?: string
  userEmail: string
  displayName: string
  // 後端 users 表這兩個欄位可為 null
  avatarSeed?: string | null
  avatarStyle?: string | null
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
