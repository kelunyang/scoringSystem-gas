/**
 * @fileoverview Composables 返回值类型定义
 */

// @ts-nocheck - This file exports types that may not all be used
import type { Ref, ComputedRef } from 'vue'
import type {
  User,
  AuthUser,
  Project,
  Stage,
  Submission,
  Group,
  Transaction,
  Notification,
  Comment,
  Ranking
} from './models'

/**
 * useAuth 返回类型
 */
export interface UseAuthReturn {
  user: Ref<AuthUser | null>
  isAuthenticated: ComputedRef<boolean>
  token: Ref<string | null>
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>
  register: (data: any) => Promise<void>
  logout: () => void
  updateUser: (userData: Partial<AuthUser>) => void
  checkAuth: () => Promise<boolean>
}

/**
 * usePermissions 返回类型
 */
export interface UsePermissionsReturn {
  permissions: ComputedRef<string[]>
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  hasAllPermissions: (permissions: string[]) => boolean
  isGlobalAdmin: ComputedRef<boolean>
}

/**
 * useProjects 返回类型
 */
export interface UseProjectsReturn {
  projects: Ref<Project[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchProjects: () => Promise<void>
  createProject: (data: any) => Promise<Project | null>
  updateProject: (projectId: string, data: any) => Promise<boolean>
  deleteProject: (projectId: string) => Promise<boolean>
  archiveProject: (projectId: string) => Promise<boolean>
}

/**
 * useProjectDetail 返回类型
 */
export interface UseProjectDetailReturn {
  project: Ref<Project | null>
  stages: Ref<Stage[]>
  groups: Ref<Group[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchProjectDetail: (projectId: string) => Promise<void>
  refreshProject: () => Promise<void>
}

/**
 * useWallet 返回类型
 */
export interface UseWalletReturn {
  transactions: Ref<Transaction[]>
  balance: ComputedRef<number>
  loading: Ref<boolean>
  fetchTransactions: (projectId: string, userId?: string) => Promise<void>
  awardPoints: (data: any) => Promise<boolean>
  getLeaderboard: (projectId: string) => Promise<any[]>
}

/**
 * useNotifications 返回类型
 */
export interface UseNotificationsReturn {
  notifications: Ref<Notification[]>
  unreadCount: ComputedRef<number>
  loading: Ref<boolean>
  fetchNotifications: () => Promise<void>
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (notificationId: string) => Promise<void>
}

/**
 * useSubmissions 返回类型
 */
export interface UseSubmissionsReturn {
  submissions: Ref<Submission[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchSubmissions: (stageId: string) => Promise<void>
  createSubmission: (data: any) => Promise<Submission | null>
  updateSubmission: (submissionId: string, data: any) => Promise<boolean>
  deleteSubmission: (submissionId: string) => Promise<boolean>
}

/**
 * useComments 返回类型
 */
export interface UseCommentsReturn {
  comments: Ref<Comment[]>
  loading: Ref<boolean>
  fetchComments: (submissionId: string) => Promise<void>
  addComment: (data: any) => Promise<Comment | null>
  deleteComment: (commentId: string) => Promise<boolean>
  updateComment: (commentId: string, content: string) => Promise<boolean>
}

/**
 * useRankings 返回类型
 */
export interface UseRankingsReturn {
  rankings: Ref<Ranking[]>
  loading: Ref<boolean>
  fetchRankings: (projectId: string, stageId?: string) => Promise<void>
  calculateRankings: (stageId: string) => Promise<void>
}

/**
 * useGroups 返回类型
 */
export interface UseGroupsReturn {
  groups: Ref<Group[]>
  loading: Ref<boolean>
  fetchGroups: (projectId: string) => Promise<void>
  createGroup: (data: any) => Promise<Group | null>
  updateGroup: (groupId: string, data: any) => Promise<boolean>
  deleteGroup: (groupId: string) => Promise<boolean>
}

/**
 * useStages 返回类型
 */
export interface UseStagesReturn {
  stages: Ref<Stage[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchStages: (projectId: string) => Promise<void>
  createStage: (data: any) => Promise<Stage | null>
  updateStage: (stageId: string, data: any) => Promise<boolean>
  deleteStage: (stageId: string) => Promise<boolean>
  reorderStages: (stageIds: string[]) => Promise<boolean>
}
