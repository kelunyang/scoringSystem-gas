/**
 * User Status Utility Functions
 * Shared logic for user lock status and validation
 */

import type { User } from '@repo/shared'

/**
 * Check if a user is currently locked
 * @param user - User object to check
 * @returns true if user is locked (temporarily or permanently)
 */
export function isUserLocked(user: User | null | undefined): boolean {
  if (!user) return false

  const now = Date.now()
  const isTemporarilyLocked = user.lockUntil && user.lockUntil > now
  const isPermanentlyDisabled = user.status === 'disabled'

  return isTemporarilyLocked || isPermanentlyDisabled
}

/**
 * Get human-readable lock status text
 * @param user - User object to check
 * @returns Localized lock status text, or empty string if not locked
 */
export function getLockStatusText(user: User | null | undefined): string {
  if (!user) return ''

  const now = Date.now()

  // Check temporary lock
  if (user.lockUntil && user.lockUntil > now) {
    const lockDate = new Date(user.lockUntil)
    return `鎖定至 ${lockDate.toLocaleString('zh-TW')}`
  }

  // Check permanent disable
  if (user.status === 'disabled') {
    return '永久停用'
  }

  return ''
}

/**
 * Calculate remaining lock time in human-readable format
 * @param lockUntil - Timestamp when lock expires
 * @returns Formatted remaining time string
 */
export function getRemainingLockTime(lockUntil: number | undefined): string {
  if (!lockUntil) return '-'

  const remaining = lockUntil - Date.now()
  if (remaining <= 0) return '已解鎖'

  const minutes = Math.floor(remaining / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} 天 ${hours % 24} 小時`
  if (hours > 0) return `${hours} 小時 ${minutes % 60} 分鐘`
  return `${minutes} 分鐘`
}

/**
 * Format user status for display
 * @param status - User status value
 * @returns Localized status text
 */
export function formatUserStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'active': '啟用',
    'inactive': '停用',
    'disabled': '永久停用'
  }
  return statusMap[status] || status
}

/**
 * Format user role for display
 * @param role - User role value
 * @returns Localized role text
 */
export function formatUserRole(role: string): string {
  const roleMap: Record<string, string> = {
    'admin': '管理員',
    'user': '一般用戶',
    'pm': '專案經理',
    'reviewer': '評審委員'
  }
  return roleMap[role] || role
}

/**
 * Get Element Plus tag type for user role
 * @param role - User role value
 * @returns Tag type for Element Plus
 */
export function getRoleTagType(role: string): 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    'admin': 'danger',
    'pm': 'warning',
    'reviewer': 'success',
    'user': 'info'
  }
  return typeMap[role] || 'info'
}

/**
 * Get Element Plus tag type for user status
 * @param status - User status value
 * @returns Tag type for Element Plus
 */
export function getStatusTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    'active': 'success',
    'inactive': 'warning',
    'disabled': 'danger'
  }
  return typeMap[status] || 'info'
}
