/**
 * Type definitions for user activity tracking
 */

export interface DailyActivityStats {
  loginSuccess: number
  loginFailed: number
  failureReasons: string[]
  hasSecurityEvent: boolean
  activities: {
    hasSubmission: boolean
    hasComment: boolean
    hasVote: boolean
    hasGroupApproval: boolean
  }
  ipAddresses: string[]
}

export interface UserActivityEvent {
  timestamp: number
  date: string // YYYY-MM-DD
  eventType: 'login_success' | 'login_failed' | 'activity' | 'security_event'
  action?: string
  entityType?: string
  entityId?: string
  ipAddress?: string
  projectId?: string
  projectName?: string
  reason?: string
  attemptCount?: number
}

export interface UserActivityData {
  userEmail: string
  displayName: string
  period: {
    startDate: string
    endDate: string
  }
  dailyStats: Record<string, DailyActivityStats>
  events: UserActivityEvent[]
}

export interface ApiResponse {
  success: boolean
  data?: UserActivityData
  error?: {
    code: string
    message: string
  }
}
