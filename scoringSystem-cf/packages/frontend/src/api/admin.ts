/**
 * Admin API Client
 * Unified client for all admin API endpoints using fetchWithAuth
 */

/**
 * TODO: API Naming Consistency Improvements
 *
 * The following methods should be renamed for consistency:
 * - globalGroups.members() → globalGroups.listMembers()
 * - properties.getAll() → properties.list()
 * - smtp.getConfig() → smtp.config()
 *
 * This is a breaking change and should be done in a separate PR
 * with proper migration guide and deprecation warnings.
 */

import { fetchWithAuth, type ApiResponse } from '@/utils/api-helpers'
import type {
  // User Management
  User,
  UserListRequest,
  UserListResponse,
  UpdateUserStatusRequest,
  ResetPasswordRequest,
  UnlockUserRequest,
  BatchUpdateStatusRequest,
  BatchResetPasswordRequest,
  UserActivityRequest,
  UserActivityResponse,
  UserGlobalGroupsRequest,
  UserProjectGroupsRequest,
  UpdateUserProfileRequest,
  GlobalGroupMembership,
  ProjectGroupMembership,

  // Global Groups
  GlobalGroup,
  GlobalGroupListRequest,
  GlobalGroupListResponse,
  GlobalGroupMembersResponse,
  CreateGlobalGroupRequest,
  UpdateGlobalGroupRequest,
  AddUserToGlobalGroupRequest,
  RemoveUserFromGlobalGroupRequest,
  BatchAddUsersRequest,
  BatchAddUsersResponse,
  BatchOperationResponse,
  BatchRemoveUsersRequest,
  BatchDeactivateGroupsRequest,
  BatchActivateGroupsRequest,

  // System
  SystemStats,
  LogStatistics,
  LogEntry,
  LogFilterOptions,
  SystemLogsRequest,
  SystemLogsResponse,
  EntityDetailsRequest,
  EntityDetailsResponse,

  // Email Logs
  EmailLogsQueryRequest,
  EmailLogsQueryResponse,
  EmailStatisticsResponse,
  ResendEmailRequest,
  ResendBatchEmailsRequest,

  // Notifications
  NotificationListRequest,
  NotificationListResponse,
  NotificationStatisticsResponse,
  SendNotificationRequest,
  SendBatchNotificationsRequest,
  DeleteNotificationRequest,

  // Robots
  RobotStatus,
  NotificationPatrolConfig,
  UpdateNotificationPatrolConfigRequest,
  PendingNotificationsResponse,
  NotificationPatrolStatistics,

  // Security
  SuspiciousLoginsRequest,
  SuspiciousLoginsResponse,

  // System Properties
  SystemProperty,
  UpdatePropertyRequest,
  UpdatePropertiesRequest,
  UpdatePropertiesResponse,
  ResetPropertyRequest,

  // SMTP
  SmtpConfig,
  UpdateSmtpConfigRequest,
  TestSmtpConnectionRequest,
  TestSmtpConnectionResponse,

  // AI Service Logs
  AIServiceLog,
  AIServiceLogsQueryRequest,
  AIServiceLogsQueryResponse,
  AIServiceStatisticsResponse,
} from '@repo/shared/types/admin'

/**
 * Admin API Client
 * Centralized admin operations with type safety
 */
export const adminApi = {
  // ============================================================================
  // User Management
  // ============================================================================
  users: {
    /**
     * Get list of all users
     */
    list: (params?: UserListRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<UserListResponse>>(
        '/api/admin/users/list',
        { method: 'POST', body: params || {}, signal }
      ),

    /**
     * Update user active status
     */
    updateStatus: (params: UpdateUserStatusRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/update-status',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Reset user password
     */
    resetPassword: (params: ResetPasswordRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/reset-password',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Unlock user account
     */
    unlock: (params: UnlockUserRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/unlock',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch update user status
     */
    batchUpdateStatus: (params: BatchUpdateStatusRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/batch-update-status',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch reset user passwords
     */
    batchResetPassword: (params: BatchResetPasswordRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/batch-reset-password',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get user activity
     */
    activity: (params: UserActivityRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<UserActivityResponse>>(
        '/api/admin/users/activity',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get user's global groups
     */
    globalGroups: (params: UserGlobalGroupsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<GlobalGroupMembership[]>>(
        '/api/admin/user-global-groups',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get user's project groups
     */
    projectGroups: (params: UserProjectGroupsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<ProjectGroupMembership[]>>(
        '/api/admin/user-project-groups',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Update user profile
     */
    updateProfile: (params: UpdateUserProfileRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/user-profile',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // Global Groups Management
  // ============================================================================
  globalGroups: {
    /**
     * Get all global groups with optional filtering and pagination
     */
    list: (params?: GlobalGroupListRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<GlobalGroupListResponse>>(
        '/api/admin/global-groups',
        { method: 'POST', body: params || {}, signal }
      ),

    /**
     * Get members of a global group
     */
    members: (groupId: string, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<GlobalGroupMembersResponse>>(
        '/api/admin/global-groups/members',
        { method: 'POST', body: { groupId }, signal }
      ),

    /**
     * Create new global group
     */
    create: (params: CreateGlobalGroupRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<{ groupId: string }>>(
        '/api/admin/create-global-group',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Update global group
     */
    update: (params: UpdateGlobalGroupRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/update-global-group',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Deactivate global group
     */
    deactivate: (groupId: string, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/deactivate-global-group',
        { method: 'POST', body: { groupId }, signal }
      ),

    /**
     * Activate global group
     */
    activate: (groupId: string, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/activate-global-group',
        { method: 'POST', body: { groupId }, signal }
      ),

    /**
     * Add user to global group
     */
    addUser: (params: AddUserToGlobalGroupRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/global-groups/add-user',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Remove user from global group
     */
    removeUser: (params: RemoveUserFromGlobalGroupRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/global-groups/remove-user',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch add users to global group
     */
    batchAddUsers: (params: BatchAddUsersRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<BatchAddUsersResponse>>(
        '/api/admin/global-groups/batch-add-users',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch remove users from global group
     */
    batchRemoveUsers: (params: BatchRemoveUsersRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<BatchOperationResponse>>(
        '/api/admin/global-groups/batch-remove-users',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch deactivate global groups
     */
    batchDeactivate: (params: BatchDeactivateGroupsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/global-groups/batch-deactivate',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Batch activate global groups
     */
    batchActivate: (params: BatchActivateGroupsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/global-groups/batch-activate',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // System Management
  // ============================================================================
  system: {
    /**
     * Get system statistics
     */
    stats: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<SystemStats>>(
        '/api/admin/system/stats',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Get system logs with filtering
     */
    logs: (params: SystemLogsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<SystemLogsResponse>>(
        '/api/admin/system/logs',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get log statistics
     */
    logStatistics: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<LogStatistics>>(
        '/api/admin/system/log-statistics',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Get entity details
     */
    entityDetails: (params: EntityDetailsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<EntityDetailsResponse>>(
        '/api/admin/system/entity-details',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // Email Logs Management
  // ============================================================================
  emailLogs: {
    /**
     * Query email logs
     */
    query: (params: EmailLogsQueryRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<EmailLogsQueryResponse>>(
        '/api/admin/email-logs/query',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get email statistics
     */
    statistics: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<EmailStatisticsResponse>>(
        '/api/admin/email-logs/statistics',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Resend single email
     */
    resendSingle: (params: ResendEmailRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/email-logs/resend-single',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Resend batch emails
     */
    resendBatch: (params: ResendBatchEmailsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/email-logs/resend-batch',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // AI Service Logs Management
  // ============================================================================
  aiServiceLogs: {
    /**
     * Query AI service logs
     */
    query: (params: AIServiceLogsQueryRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<AIServiceLogsQueryResponse>>(
        '/api/admin/ai-service-logs/query',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get AI service statistics
     */
    statistics: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<AIServiceStatisticsResponse>>(
        '/api/admin/ai-service-logs/statistics',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Get AI service log detail
     */
    detail: (callId: string, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<{ log: AIServiceLog; childCalls?: AIServiceLog[]; parentCall?: AIServiceLog }>>(
        `/api/admin/ai-service-logs/${callId}`,
        { method: 'GET', signal }
      ),
  },

  // ============================================================================
  // Notifications Management
  // ============================================================================
  notifications: {
    /**
     * Get notification list
     */
    list: (params: NotificationListRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<NotificationListResponse>>(
        '/api/admin/notifications/list',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Get notification statistics
     */
    statistics: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<NotificationStatisticsResponse>>(
        '/api/admin/notifications/statistics',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Send single notification
     */
    sendSingle: (params: SendNotificationRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/notifications/send-single',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Send batch notifications
     */
    sendBatch: (params: SendBatchNotificationsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/notifications/send-batch',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Delete notification
     */
    delete: (params: DeleteNotificationRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/notifications/delete',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // Robots/Automation Management
  // ============================================================================
  robots: {
    /**
     * Get robot status
     */
    status: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<RobotStatus[]>>(
        '/api/admin/robots/status',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Notification patrol management
     */
    notificationPatrol: {
      /**
       * Get notification patrol config
       */
      config: (signal?: AbortSignal) =>
        fetchWithAuth<ApiResponse<NotificationPatrolConfig>>(
          '/api/admin/robots/notification-patrol/config',
          { method: 'POST', body: {}, signal }
        ),

      /**
       * Update notification patrol config
       */
      updateConfig: (params: UpdateNotificationPatrolConfigRequest, signal?: AbortSignal) =>
        fetchWithAuth<ApiResponse<void>>(
          '/api/admin/robots/notification-patrol/update-config',
          { method: 'POST', body: params, signal }
        ),

      /**
       * Get pending notifications
       */
      pending: (signal?: AbortSignal) =>
        fetchWithAuth<ApiResponse<PendingNotificationsResponse>>(
          '/api/admin/robots/notification-patrol/pending',
          { method: 'POST', body: {}, signal }
        ),

      /**
       * Get notification patrol statistics
       */
      statistics: (signal?: AbortSignal) =>
        fetchWithAuth<ApiResponse<NotificationPatrolStatistics>>(
          '/api/admin/robots/notification-patrol/statistics',
          { method: 'POST', body: {}, signal }
        ),
    },
  },

  // ============================================================================
  // Security Management
  // ============================================================================
  security: {
    /**
     * Get suspicious logins
     */
    suspiciousLogins: (params: SuspiciousLoginsRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<SuspiciousLoginsResponse>>(
        '/api/admin/security/suspicious-logins',
        { method: 'POST', body: params, signal }
      ),
  },

  // ============================================================================
  // System Properties Management
  // ============================================================================
  properties: {
    /**
     * Get all system properties
     */
    getAll: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<SystemProperty[]>>(
        '/api/admin/properties/get-all',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Update system properties (batch update)
     */
    update: (params: UpdatePropertiesRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<UpdatePropertiesResponse>>(
        '/api/admin/properties/update',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Reset all system properties to defaults
     */
    reset: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/properties/reset',
        { method: 'POST', body: {}, signal }
      ),
  },

  // ============================================================================
  // SMTP Configuration
  // ============================================================================
  smtp: {
    /**
     * Get SMTP configuration
     */
    getConfig: (signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<SmtpConfig>>(
        '/api/admin/smtp/get-config',
        { method: 'POST', body: {}, signal }
      ),

    /**
     * Update SMTP configuration
     */
    updateConfig: (params: UpdateSmtpConfigRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<void>>(
        '/api/admin/smtp/update-config',
        { method: 'POST', body: params, signal }
      ),

    /**
     * Test SMTP connection
     */
    testConnection: (params: TestSmtpConnectionRequest, signal?: AbortSignal) =>
      fetchWithAuth<ApiResponse<TestSmtpConnectionResponse>>(
        '/api/admin/smtp/test-connection',
        { method: 'POST', body: params, signal }
      ),
  },
}
