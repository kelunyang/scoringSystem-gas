/**
 * @fileoverview Client-side JWT utilities
 * Handles JWT token parsing, expiry checking, and countdown
 * NO SIGNATURE VERIFICATION - only for local UI purposes
 */

import type { JWTPayload } from '@/types/utils'

/**
 * Decode JWT payload without verification
 * WARNING: DO NOT use for authorization decisions
 * Only for displaying expiry time to user
 *
 * @param token - JWT token
 * @returns Decoded payload or null if invalid
 */
export function decodeJWT(token: string): JWTPayload | null {
  if (!token || typeof token !== 'string') {
    return null
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode base64url payload
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const decoded = JSON.parse(atob(payload))
    return decoded as JWTPayload
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

/**
 * Check if JWT token is expired
 * Based on local time, not server time
 *
 * @param token - JWT token
 * @returns True if expired or invalid
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) {
    return true
  }

  // exp is in seconds, Date.now() is in milliseconds
  const expiryTime = payload.exp * 1000
  return Date.now() >= expiryTime
}

/**
 * Get remaining time until token expires
 *
 * @param token - JWT token
 * @returns Remaining milliseconds, or 0 if expired/invalid
 */
export function getTokenRemainingTime(token: string): number {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) {
    return 0
  }

  const expiryTime = payload.exp * 1000
  const remaining = expiryTime - Date.now()

  return remaining > 0 ? remaining : 0
}

/**
 * Get token expiry time (absolute timestamp)
 *
 * @param token - JWT token
 * @returns Expiry timestamp in milliseconds, or null if invalid
 */
export function getTokenExpiryTime(token: string): number | null {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) {
    return null
  }

  return payload.exp * 1000
}

/**
 * Get token issued time
 *
 * @param token - JWT token
 * @returns Issued timestamp in milliseconds, or null if invalid
 */
export function getTokenIssuedTime(token: string): number | null {
  const payload = decodeJWT(token)
  if (!payload || !payload.iat) {
    return null
  }

  return payload.iat * 1000
}

/**
 * Calculate session percentage (for progress bar)
 *
 * @param token - JWT token
 * @returns Percentage (0-100), or 0 if invalid
 */
export function getSessionPercentage(token: string): number {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp || !payload.iat) {
    return 0
  }

  const issuedTime = payload.iat * 1000
  const expiryTime = payload.exp * 1000
  const now = Date.now()

  // If expired, return 0
  if (now >= expiryTime) {
    return 0
  }

  // If somehow before issued time, return 100
  if (now < issuedTime) {
    return 100
  }

  const totalDuration = expiryTime - issuedTime
  const elapsed = now - issuedTime
  const remaining = totalDuration - elapsed

  const percentage = (remaining / totalDuration) * 100
  return Math.max(0, Math.min(100, Math.round(percentage)))
}

/**
 * Format remaining time as human-readable string
 *
 * @param milliseconds - Remaining time in milliseconds
 * @returns Formatted time string (e.g., "2h 30m", "45m 30s", "30s")
 */
export function formatRemainingTime(milliseconds: number): string {
  if (milliseconds <= 0) {
    return '0s'
  }

  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${seconds}s`
}

/**
 * Format remaining time as HH:MM:SS
 *
 * @param milliseconds - Remaining time in milliseconds
 * @returns Formatted time string (e.g., "02:30:45")
 */
export function formatRemainingTimeHMS(milliseconds: number): string {
  if (milliseconds <= 0) {
    return '00:00:00'
  }

  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Check if token should show warning (< 5 minutes remaining)
 *
 * @param token - JWT token
 * @returns True if should show warning
 */
export function shouldShowExpiryWarning(token: string): boolean {
  const remaining = getTokenRemainingTime(token)
  return remaining > 0 && remaining < 5 * 60 * 1000 // Less than 5 minutes
}

/**
 * Check if token should be refreshed (< 10 minutes remaining)
 *
 * @param token - JWT token
 * @returns True if should refresh
 */
export function shouldRefreshToken(token: string): boolean {
  const remaining = getTokenRemainingTime(token)
  // Refresh if less than 10 minutes but more than 5 minutes
  return remaining > 5 * 60 * 1000 && remaining < 10 * 60 * 1000
}
