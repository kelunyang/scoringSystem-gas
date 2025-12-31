/**
 * Admin API Type Definitions
 * Shared types for admin API requests and responses
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

// ============================================================================
// User Management Types
// ============================================================================

export interface User {
  userId: string
  userEmail: string
  userName: string
  userAvatar?: string
  isActive: boolean
  createdTime?: number
  lastLoginTime?: number
  globalGroups?: GlobalGroupMembership[]
  projectGroups?: ProjectGroupMembership[]
}

export interface UserListRequest {
  search?: string
  status?: 'active' | 'inactive'
  groupIds?: string[]
  sortBy?: 'registrationTime' | 'email' | 'displayName' | 'lastActivityTime'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface UserListResponse {
  users: User[]
  total?: number
}

export interface UpdateUserStatusRequest {
  userId: string
  isActive: boolean
}

export interface ResetPasswordRequest {
  userId: string
  newPassword: string
}

export interface UnlockUserRequest {
  userId: string
}

export interface BatchUpdateStatusRequest {
  userIds: string[]
  isActive: boolean
}

export interface BatchResetPasswordRequest {
  userIds: string[]
  newPassword: string
}

export interface UserActivityRequest {
  userId: string
  startDate?: number
  endDate?: number
}

export interface UserActivityResponse {
  userId: string
  activities: Activity[]
  statistics: {
    totalEvents: number
    loginCount: number
    submissionCount: number
    voteCount: number
  }
}

export interface Activity {
  eventId: string
  eventType: string
  eventTime: number
  eventData?: any
}

// ============================================================================
// Global Group Types
// ============================================================================

export interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions: string[]
  isActive: boolean
  createdTime?: number
  memberCount?: number
}

export interface GlobalGroupMembership {
  groupId: string
  groupName: string
  allowChange: boolean
  permissions?: string[]
}

/**
 * Base member interface
 * Common fields shared by all member types
 */
export interface BaseMember {
  userEmail: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
}

/**
 * Global group member
 * Extends BaseMember with global group-specific fields
 */
export interface GlobalGroupMember extends BaseMember {
  allowChange: boolean
  joinedTime?: number
}

export interface GlobalGroupMembersResponse {
  groupId: string
  groupName: string
  memberCount: number
  members: GlobalGroupMember[]
}

export interface CreateGlobalGroupRequest {
  groupName: string
  globalPermissions: string[]
}

export interface UpdateGlobalGroupRequest {
  groupId: string
  groupName?: string
  globalPermissions?: string[]
}

export interface AddUserToGlobalGroupRequest {
  groupId: string
  userEmail: string
  allowChange?: boolean
}

export interface RemoveUserFromGlobalGroupRequest {
  groupId: string
  userEmail: string
}

export interface BatchAddUsersRequest {
  groupId: string
  userEmails: string[]
  allowChange?: boolean
}

/**
 * Generic response for batch operations
 * Used for batch add/remove/update operations
 */
export interface BatchOperationResponse {
  successCount: number
  failedCount: number
  errors?: string[]
}

/**
 * @deprecated Use BatchOperationResponse instead
 */
export interface BatchAddUsersResponse extends BatchOperationResponse {
  /** @deprecated Use successCount */
  success: number
  /** @deprecated Use failedCount */
  failed: number
}

export interface BatchRemoveUsersRequest {
  groupId: string
  userEmails: string[]
}

export interface BatchDeactivateGroupsRequest {
  groupIds: string[]
}

export interface BatchActivateGroupsRequest {
  groupIds: string[]
}

// ============================================================================
// System Types
// ============================================================================

export interface SystemStats {
  totalUsers: number
  activeUsers: number
  totalProjects: number
  activeProjects: number
  totalSubmissions: number
  totalVotes: number
  systemUptime: number
  databaseSize: number
}

/**
 * Log Statistics Response
 * Matches backend getLogStatistics() output format
 */
export interface LogStatistics {
  /** Total number of logs in the system */
  totalLogs: number
  /** Timestamp of the newest log entry (null if no logs) */
  newestLog: number | null
  /**
   * Database identifier
   * @note Returns "D1 Database" in Cloudflare Workers environment
   * @deprecated Legacy field name from GAS migration, kept for compatibility
   */
  spreadsheetName: string
  /** Count of logs by level (info, warning, error, critical, etc.) */
  levelCounts: Record<string, number>
}

export interface LogEntry {
  logId: string
  createdAt: number
  level: 'info' | 'warning' | 'error' | 'critical'
  userId?: string
  displayName?: string
  action?: string
  entityType?: string
  entityId?: string
  projectId?: string
  projectName?: string
  functionName?: string
  message?: string
  context?: string | Record<string, unknown>
  relatedEntities?: string
  isSuspicious?: boolean
}

export interface LogFilterOptions {
  limit?: number
  offset?: number
  level?: string
  userId?: string[]
  userEmail?: string  // 🆕 用于搜索 context.userEmail 字段（Login Logs）
  action?: string[]
  entityType?: string[]
  projectId?: string[]
  message?: string
  startTime?: number
  endTime?: number
}

export interface SystemLogsRequest {
  options: LogFilterOptions
}

export interface SystemLogsResponse {
  logs: LogEntry[]
  total: number
}

export interface EntityDetailsRequest {
  entityType: 'user' | 'project' | 'group' | 'submission' | 'stage' | 'comment' | 'settlement' | 'notification' | 'transaction' | 'invitation'
  entityId: string
}

export interface EntityDetailsResponse {
  entityType: string
  entityId: string
  details: any
  relatedEntities?: any[]
}

// ============================================================================
// Email Log Types
// ============================================================================

/**
 * Email status enum
 */
export enum EmailStatus {
  SENT = 'sent',
  FAILED = 'failed'
}

/**
 * Email log entry (matches globalemaillogs table schema)
 */
export interface EmailLog {
  logId: string              // Primary key
  emailId: string            // Unique email identifier
  trigger: string            // Trigger type (notification_patrol, invitation, etc.)
  triggeredBy: string        // User email who triggered
  triggerSource: string      // Source system/action
  recipient: string          // Recipient email
  recipientUserId?: string   // Optional user ID
  subject: string            // Email subject
  htmlBody: string           // HTML email content
  textBody?: string          // Plain text content
  emailSize: number          // Size in bytes
  status: EmailStatus        // Sent or failed
  statusCode?: number        // HTTP status code
  error?: string             // Error message if failed
  errorType?: string         // Error type classification
  retryCount: number         // Number of retry attempts
  emailContext?: string      // JSON context data
  timestamp: number          // Send timestamp (milliseconds)
  durationMs: number         // Processing duration
  createdAt: number          // Creation timestamp
  updatedAt: number          // Last update timestamp
}

/**
 * Email logs query request with filters
 */
export interface EmailLogsQueryRequest {
  filters?: {
    trigger?: string
    recipient?: string
    status?: EmailStatus | 'sent' | 'failed'
    startDate?: number
    endDate?: number
    limit?: number
    offset?: number
  }
}

/**
 * Email logs query response
 */
export interface EmailLogsQueryResponse {
  logs: EmailLog[]
  totalCount: number
  filters?: EmailLogsQueryRequest['filters']
}

/**
 * Email statistics by trigger
 */
export interface EmailStatisticsByTrigger {
  trigger: string
  count: number
  status: EmailStatus | string
}

/**
 * Email statistics by date
 */
export interface EmailStatisticsByDate {
  date: string
  count: number
  status: EmailStatus | string
}

/**
 * Email statistics response
 */
export interface EmailStatisticsResponse {
  total: number
  sent: number
  failed: number
  successRate: number
  byTrigger: EmailStatisticsByTrigger[]
  last7Days: EmailStatisticsByDate[]
  timestamp: number
}

/**
 * Resend single email request
 */
export interface ResendEmailRequest {
  logId: string
}

/**
 * Resend batch emails request
 */
export interface ResendBatchEmailsRequest {
  logIds: string[]
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  notificationId: string
  userId: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  isRead: boolean
  createdTime: number
  metadata?: any
}

export interface NotificationListRequest {
  userId?: string
  isRead?: boolean
  type?: string
  limit?: number
  offset?: number
}

export interface NotificationListResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
}

export interface NotificationStatisticsResponse {
  totalNotifications: number
  unreadCount: number
  byType: Record<string, number>
}

export interface SendNotificationRequest {
  userId: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  metadata?: any
}

export interface SendBatchNotificationsRequest {
  userIds: string[]
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  metadata?: any
}

export interface DeleteNotificationRequest {
  notificationId: string
}

// ============================================================================
// Robot/Automation Types
// ============================================================================

export interface RobotStatus {
  robotId: string
  robotName: string
  isActive: boolean
  lastRunTime?: number
  nextRunTime?: number
  status: 'idle' | 'running' | 'error'
  errorMessage?: string
}

export interface NotificationPatrolConfig {
  enabled: boolean
  interval: number
  batchSize: number
  retryAttempts: number
  notificationTypes: string[]
}

export interface UpdateNotificationPatrolConfigRequest {
  enabled?: boolean
  interval?: number
  batchSize?: number
  retryAttempts?: number
  notificationTypes?: string[]
}

export interface PendingNotificationsResponse {
  pending: Notification[]
  total: number
}

export interface NotificationPatrolStatistics {
  totalProcessed: number
  successCount: number
  failedCount: number
  averageProcessingTime: number
  lastRunTime?: number
}

// ============================================================================
// Security Types
// ============================================================================

export interface SuspiciousLogin {
  loginId: string
  userId: string
  userEmail: string
  ipAddress: string
  userAgent: string
  loginTime: number
  failedAttempts: number
  isBlocked: boolean
  blockReason?: string
}

export interface SuspiciousLoginsRequest {
  startDate?: number
  endDate?: number
  userId?: string
  minFailedAttempts?: number
}

export interface SuspiciousLoginsResponse {
  logins: SuspiciousLogin[]
  total: number
}

// ============================================================================
// System Properties Types
// ============================================================================

export interface SystemProperty {
  key: string
  value: string
  description?: string
  category?: string
  isEditable: boolean
}

export interface UpdatePropertyRequest {
  key: string
  value: string
}

/**
 * Batch update properties request
 * Used by POST /admin/properties/update
 */
export interface UpdatePropertiesRequest {
  properties: Record<string, string | number | boolean | undefined>
}

/**
 * Properties update response
 */
export interface UpdatePropertiesResponse {
  changes: Array<{
    field: string
    oldValue: unknown
    newValue: unknown
  }>
}

export interface ResetPropertyRequest {
  key: string
}

// ============================================================================
// SMTP Configuration Types
// ============================================================================

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password?: string // Password might be masked
  fromEmail: string
  fromName: string
}

export interface UpdateSmtpConfigRequest {
  host?: string
  port?: number
  secure?: boolean
  username?: string
  password?: string
  fromEmail?: string
  fromName?: string
}

export interface TestSmtpConnectionRequest {
  /** Optional SMTP config to test (if not provided, uses stored config) */
  config?: {
    host: string
    port: number
    username: string
    password: string
    fromName?: string
    fromEmail: string
  }
  /** Optional test email recipient */
  testEmail?: string
}

export interface TestSmtpConnectionResponse {
  success: boolean
  message: string
  connectionTime?: number
}

// ============================================================================
// Project Group Types (for user management context)
// ============================================================================

/**
 * Project group member
 * Extends BaseMember with project group-specific fields
 */
export interface ProjectGroupMember extends BaseMember {
  role: 'leader' | 'member'
  tags?: string[]
}

export interface ProjectGroupMembership {
  projectId: string
  projectName: string
  groupId: string
  groupName: string
  role: string
  isActive: boolean
}

export interface UserGlobalGroupsRequest {
  userId: string
}

export interface UserProjectGroupsRequest {
  userId: string
}

export interface UpdateUserProfileRequest {
  userId: string
  userName?: string
  userAvatar?: string
}

// ============================================================================
// AI Service Logs Types
// ============================================================================

/**
 * AI service type enum
 */
export type AIServiceType = 'ranking_direct' | 'ranking_bt' | 'ranking_multi_agent' | 'summary' | 'translation' | 'feedback'

/**
 * AI service status enum
 */
export type AIServiceStatus = 'pending' | 'processing' | 'success' | 'failed' | 'timeout'

/**
 * AI ranking type enum
 */
export type AIRankingType = 'submission' | 'comment'

/**
 * AI service call log entry (matches aiservicecalls table schema)
 */
export interface AIServiceLog {
  callId: string
  projectId: string
  stageId?: string
  userEmail: string
  serviceType: AIServiceType
  rankingType?: AIRankingType
  providerId: string
  providerName: string
  model: string
  itemCount?: number
  customPrompt?: string
  status: AIServiceStatus
  result?: string            // JSON string
  reason?: string
  thinkingProcess?: string
  errorMessage?: string
  btComparisons?: string     // JSON string
  btStrengthParams?: string  // JSON string
  parentCallId?: string
  debateRound?: number
  debateChanged?: number     // 0 or 1
  debateCritique?: string
  requestTokens?: number
  responseTokens?: number
  totalTokens?: number
  responseTimeMs?: number
  createdAt: number
  completedAt?: number
}

/**
 * AI service logs query request with filters
 */
export interface AIServiceLogsQueryRequest {
  filters?: {
    search?: string              // Search in providerName, userEmail, projectId
    serviceType?: AIServiceType
    rankingType?: AIRankingType
    status?: AIServiceStatus
    providerId?: string
    startDate?: number
    endDate?: number
    minTokens?: number
    maxTokens?: number
    minResponseTime?: number
    maxResponseTime?: number
    limit?: number
    offset?: number
  }
}

/**
 * AI service logs query response
 */
export interface AIServiceLogsQueryResponse {
  logs: AIServiceLog[]
  totalCount: number
  filters?: AIServiceLogsQueryRequest['filters']
}

/**
 * AI service statistics by service type
 */
export interface AIServiceStatsByType {
  serviceType: AIServiceType
  count: number
  totalTokens: number
  avgResponseTime: number
}

/**
 * AI service statistics by provider
 */
export interface AIServiceStatsByProvider {
  providerId: string
  providerName: string
  count: number
  totalTokens: number
  avgResponseTime: number
}

/**
 * AI service statistics by status
 */
export interface AIServiceStatsByStatus {
  status: AIServiceStatus
  count: number
}

/**
 * AI service statistics by date
 */
export interface AIServiceStatsByDate {
  date: string
  count: number
  totalTokens: number
}

/**
 * AI service statistics response
 */
export interface AIServiceStatisticsResponse {
  total: number
  totalTokens: number
  avgResponseTime: number
  byServiceType: AIServiceStatsByType[]
  byProvider: AIServiceStatsByProvider[]
  byStatus: AIServiceStatsByStatus[]
  last7Days: AIServiceStatsByDate[]
  timestamp: number
}
