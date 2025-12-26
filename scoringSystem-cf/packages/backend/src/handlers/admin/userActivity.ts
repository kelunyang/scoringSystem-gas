/**
 * User Activity API Handler
 *
 * Provides user activity statistics including:
 * - Login success/failure tracking from sys_logs
 * - Project activities from eventlogs
 * - Daily aggregated statistics
 *
 * Permission Control:
 * - Users can view their own activity
 * - manage_users or system_admin can view all users
 */

import { Env } from '../../types'
import { ApiResponse, DailyActivityStats, UserActivityEvent } from '../../types/activity'
import { hasAnyGlobalPermission } from '../../utils/permissions'

/**
 * Get user activity statistics for a date range
 *
 * @param env - Cloudflare environment
 * @param requestUserEmail - Email of the user making the request
 * @param queryUserEmail - Email of the user being queried
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Activity statistics and events
 */
export async function getUserActivity(
  env: Env,
  requestUserEmail: string,
  queryUserEmail: string,
  startDate: string,
  endDate: string
): Promise<ApiResponse> {
  console.log('[Backend Handler] getUserActivity called:', {
    requestUserEmail,
    queryUserEmail,
    startDate,
    endDate,
    types: {
      requestUserEmail: typeof requestUserEmail,
      queryUserEmail: typeof queryUserEmail,
      startDate: typeof startDate,
      endDate: typeof endDate
    }
  });

  try {
    // 1. Permission check: self or admin
    const isSelf = requestUserEmail === queryUserEmail

    if (!isSelf) {
      // Get userId from requestUserEmail
      const userResult = await env.DB
        .prepare('SELECT userId FROM users WHERE userEmail = ?')
        .bind(requestUserEmail)
        .first()

      if (!userResult) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        }
      }

      const hasAdminPermission = await hasAnyGlobalPermission(
        env.DB,
        userResult.userId as string,
        ['manage_users', 'system_admin']
      )

      if (!hasAdminPermission) {
        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: '您沒有權限查看此使用者的活動統計'
          }
        }
      }
    }

    // 2. Validate date range
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: '日期格式錯誤，請使用 YYYY-MM-DD 格式'
        }
      }
    }

    if (start > end) {
      return {
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: '開始日期不能晚於結束日期'
        }
      }
    }

    // Convert to timestamps (start of day and end of day)
    const startTimestamp = start.getTime()
    const endTimestamp = end.setHours(23, 59, 59, 999)

    // 3. Query sys_logs for login events
    const loginEvents = await queryLoginEvents(
      env,
      queryUserEmail,
      startTimestamp,
      endTimestamp
    )

    // 4. Query eventlogs for project activities
    const activityEvents = await queryActivityEvents(
      env,
      queryUserEmail,
      startTimestamp,
      endTimestamp
    )

    // 5. Aggregate data by date
    const { dailyStats, events } = aggregateByDate(
      loginEvents,
      activityEvents,
      startDate,
      endDate
    )

    // 6. Get user display name
    const userInfo = await getUserInfo(env, queryUserEmail)

    return {
      success: true,
      data: {
        userEmail: queryUserEmail,
        displayName: userInfo?.displayName || queryUserEmail,
        period: {
          startDate,
          endDate
        },
        dailyStats,
        events
      }
    }
  } catch (error) {
    console.error('Error in getUserActivity:', error)
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '查詢使用者活動時發生錯誤'
      }
    }
  }
}

/**
 * Query login events from sys_logs
 */
async function queryLoginEvents(
  env: Env,
  userEmail: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<UserActivityEvent[]> {
  // First get userId from userEmail
  const userResult = await env.DB
    .prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail)
    .first()

  if (!userResult) {
    return [] // No user found, return empty array
  }

  const userId = userResult.userId as string

  const query = `
    SELECT
      logId,
      level,
      action,
      message,
      context,
      createdAt,
      entityId
    FROM sys_logs
    WHERE action IN ('login_success', 'login_failed', 'account_temporarily_locked', 'security_alert', 'account_disabled')
      AND entityId = ?
      AND createdAt BETWEEN ? AND ?
    ORDER BY createdAt ASC
  `

  const result = await env.DB.prepare(query)
    .bind(userId, startTimestamp, endTimestamp)
    .all()

  if (!result.success) {
    throw new Error('Failed to query login events')
  }

  return result.results.map((row: any) => {
    const context = row.context ? JSON.parse(row.context) : {}

    // Determine event type
    let eventType: 'login_success' | 'login_failed' | 'activity' | 'security_event'
    if (row.action === 'login_success') {
      eventType = 'login_success'
    } else if (row.action === 'login_failed') {
      eventType = 'login_failed'
    } else if (['account_temporarily_locked', 'security_alert', 'account_disabled'].includes(row.action)) {
      eventType = 'security_event'
    } else {
      eventType = 'activity' // Fallback
    }

    return {
      timestamp: row.createdAt,
      date: new Date(row.createdAt).toISOString().split('T')[0],
      eventType,
      action: row.action,
      ipAddress: context.ipAddress || 'unknown',
      reason: context.reason || row.message,
      attemptCount: context.attemptCount
    }
  })
}

/**
 * Query project activity events from eventlogs
 */
async function queryActivityEvents(
  env: Env,
  userEmail: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<UserActivityEvent[]> {
  // First get userId from userEmail
  const userResult = await env.DB
    .prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail)
    .first()

  if (!userResult) {
    return [] // No user found, return empty array
  }

  const userId = userResult.userId as string

  const query = `
    SELECT
      e.logId,
      e.projectId,
      e.eventType,
      e.entityType,
      e.entityId,
      e.timestamp,
      p.projectName
    FROM eventlogs e
    LEFT JOIN projects p ON e.projectId = p.projectId
    WHERE e.userId = ?
      AND e.timestamp BETWEEN ? AND ?
      AND e.eventType IN ('submission', 'comment', 'vote', 'groupsubmissionapproval')
    ORDER BY e.timestamp ASC
  `

  const result = await env.DB.prepare(query)
    .bind(userId, startTimestamp, endTimestamp)
    .all()

  if (!result.success) {
    throw new Error('Failed to query activity events')
  }

  return result.results.map((row: any) => ({
    timestamp: row.timestamp,
    date: new Date(row.timestamp).toISOString().split('T')[0],
    eventType: 'activity',
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId,
    projectName: row.projectName || 'Unknown Project',
    action: row.eventType
  }))
}

/**
 * Aggregate events by date
 */
function aggregateByDate(
  loginEvents: UserActivityEvent[],
  activityEvents: UserActivityEvent[],
  startDate: string,
  endDate: string
): {
  dailyStats: Record<string, DailyActivityStats>
  events: UserActivityEvent[]
} {
  const dailyStats: Record<string, DailyActivityStats> = {}
  const allEvents = [...loginEvents, ...activityEvents]

  // Initialize daily stats for ALL dates in range
  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0]
    dailyStats[dateStr] = {
      loginSuccess: 0,
      loginFailed: 0,
      failureReasons: [],
      hasSecurityEvent: false,
      activities: {
        hasSubmission: false,
        hasComment: false,
        hasVote: false,
        hasGroupApproval: false
      },
      ipAddresses: []
    }
  }

  // Aggregate login events
  loginEvents.forEach(event => {
    const stats = dailyStats[event.date]
    if (!stats) return // Skip events outside date range

    if (event.eventType === 'login_success') {
      stats.loginSuccess++
    } else if (event.eventType === 'login_failed') {
      stats.loginFailed++
      if (event.reason && !stats.failureReasons.includes(event.reason)) {
        stats.failureReasons.push(event.reason)
      }
    } else if (event.eventType === 'security_event') {
      // Mark this day as having a security event (skull icon takes priority)
      stats.hasSecurityEvent = true
    }

    if (event.ipAddress && !stats.ipAddresses.includes(event.ipAddress)) {
      stats.ipAddresses.push(event.ipAddress)
    }
  })

  // Aggregate activity events
  activityEvents.forEach(event => {
    const stats = dailyStats[event.date]
    if (!stats) return // Skip events outside date range

    switch (event.action) {
      case 'submission':
        stats.activities.hasSubmission = true
        break
      case 'comment':
        stats.activities.hasComment = true
        break
      case 'vote':
        stats.activities.hasVote = true
        break
      case 'groupsubmissionapproval':
        stats.activities.hasGroupApproval = true
        break
    }
  })

  // Sort events by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp)

  return { dailyStats, events: allEvents }
}

/**
 * Get user basic info
 */
async function getUserInfo(
  env: Env,
  userEmail: string
): Promise<{ displayName: string } | null> {
  const query = `
    SELECT displayName
    FROM users
    WHERE userEmail = ?
    LIMIT 1
  `

  const result = await env.DB.prepare(query)
    .bind(userEmail)
    .first()

  return result as { displayName: string } | null
}

