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
