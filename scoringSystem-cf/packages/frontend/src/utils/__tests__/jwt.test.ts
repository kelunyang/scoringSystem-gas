/**
 * Unit tests for JWT utility functions
 * Tests token parsing, expiry checking, and time formatting
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  decodeJWT,
  isTokenExpired,
  getTokenRemainingTime,
  getTokenExpiryTime,
  getTokenIssuedTime,
  getSessionPercentage,
  formatRemainingTime,
  formatRemainingTimeHMS,
  shouldShowExpiryWarning,
  shouldRefreshToken
} from '../jwt'

/**
 * Helper to create a test JWT token
 */
function createTestToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const signature = 'mock-signature'

  return `${headerB64}.${payloadB64}.${signature}`
}

describe('JWT utilities', () => {
  describe('decodeJWT', () => {
    test('decodes valid JWT payload', () => {
      const payload = { sub: 'user123', exp: 1700000000, iat: 1699900000 }
      const token = createTestToken(payload)
      const decoded = decodeJWT(token)

      expect(decoded).toEqual(payload)
    })

    test('decodes payload with custom claims', () => {
      const payload = {
        userId: 'usr_123',
        userEmail: 'test@example.com',
        exp: 1700000000,
        iat: 1699900000
      }
      const token = createTestToken(payload)
      const decoded = decodeJWT(token)

      expect(decoded?.userId).toBe('usr_123')
      expect(decoded?.userEmail).toBe('test@example.com')
    })

    test('returns null for invalid token format', () => {
      expect(decodeJWT('invalid')).toBeNull()
      expect(decodeJWT('a.b')).toBeNull()
      expect(decodeJWT('a.b.c.d')).toBeNull()
      expect(decodeJWT('')).toBeNull()
    })

    test('returns null for non-string input', () => {
      expect(decodeJWT(null as unknown as string)).toBeNull()
      expect(decodeJWT(undefined as unknown as string)).toBeNull()
      expect(decodeJWT(123 as unknown as string)).toBeNull()
    })

    test('returns null for malformed base64', () => {
      expect(decodeJWT('header.!!!invalid!!!.signature')).toBeNull()
    })
  })

  describe('isTokenExpired', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns true for expired token', () => {
      // Set current time to Jan 1, 2024 12:00:00 UTC
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))

      // Token expired at 10:00:00 (2 hours ago)
      const token = createTestToken({ exp: 1704106800 }) // Jan 1, 2024 10:00:00 UTC
      expect(isTokenExpired(token)).toBe(true)
    })

    test('returns false for valid token', () => {
      // Set current time to Jan 1, 2024 10:00:00 UTC
      vi.setSystemTime(new Date('2024-01-01T10:00:00Z'))

      // Token expires at 14:00:00 (4 hours from now)
      const token = createTestToken({ exp: 1704121200 }) // Jan 1, 2024 14:00:00 UTC
      expect(isTokenExpired(token)).toBe(false)
    })

    test('returns true for token without exp claim', () => {
      const token = createTestToken({ sub: 'user123' })
      expect(isTokenExpired(token)).toBe(true)
    })

    test('returns true for invalid token', () => {
      expect(isTokenExpired('invalid-token')).toBe(true)
      expect(isTokenExpired('')).toBe(true)
    })

    test('returns true when exactly at expiry time', () => {
      const expTime = 1704110400 // Jan 1, 2024 11:00:00 UTC
      vi.setSystemTime(new Date(expTime * 1000))

      const token = createTestToken({ exp: expTime })
      expect(isTokenExpired(token)).toBe(true)
    })
  })

  describe('getTokenRemainingTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns remaining milliseconds for valid token', () => {
      vi.setSystemTime(new Date('2024-01-01T10:00:00Z'))

      // Token expires 1 hour from now
      const expTime = Math.floor(Date.now() / 1000) + 3600
      const token = createTestToken({ exp: expTime })

      const remaining = getTokenRemainingTime(token)
      expect(remaining).toBeCloseTo(3600 * 1000, -2) // 1 hour in ms
    })

    test('returns 0 for expired token', () => {
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))

      const token = createTestToken({ exp: 1704106800 }) // Expired 2 hours ago
      expect(getTokenRemainingTime(token)).toBe(0)
    })

    test('returns 0 for invalid token', () => {
      expect(getTokenRemainingTime('invalid')).toBe(0)
      expect(getTokenRemainingTime('')).toBe(0)
    })

    test('returns 0 for token without exp', () => {
      const token = createTestToken({ sub: 'user123' })
      expect(getTokenRemainingTime(token)).toBe(0)
    })
  })

  describe('getTokenExpiryTime', () => {
    test('returns expiry timestamp in milliseconds', () => {
      const expTime = 1700000000
      const token = createTestToken({ exp: expTime })

      expect(getTokenExpiryTime(token)).toBe(expTime * 1000)
    })

    test('returns null for token without exp', () => {
      const token = createTestToken({ sub: 'user123' })
      expect(getTokenExpiryTime(token)).toBeNull()
    })

    test('returns null for invalid token', () => {
      expect(getTokenExpiryTime('invalid')).toBeNull()
    })
  })

  describe('getTokenIssuedTime', () => {
    test('returns issued timestamp in milliseconds', () => {
      const iatTime = 1699900000
      const token = createTestToken({ iat: iatTime, exp: 1700000000 })

      expect(getTokenIssuedTime(token)).toBe(iatTime * 1000)
    })

    test('returns null for token without iat', () => {
      const token = createTestToken({ exp: 1700000000 })
      expect(getTokenIssuedTime(token)).toBeNull()
    })

    test('returns null for invalid token', () => {
      expect(getTokenIssuedTime('invalid')).toBeNull()
    })
  })

  describe('getSessionPercentage', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns 100 at start of session', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const iat = Math.floor(now / 1000)
      const exp = iat + 3600 // 1 hour session

      const token = createTestToken({ iat, exp })
      expect(getSessionPercentage(token)).toBe(100)
    })

    test('returns 50 at halfway point', () => {
      const iat = 1700000000
      const exp = 1700003600 // 1 hour session

      // Set time to halfway point
      vi.setSystemTime(new Date((iat + 1800) * 1000)) // 30 minutes in

      const token = createTestToken({ iat, exp })
      expect(getSessionPercentage(token)).toBe(50)
    })

    test('returns 0 when expired', () => {
      const iat = 1700000000
      const exp = 1700003600

      // Set time after expiry
      vi.setSystemTime(new Date((exp + 100) * 1000))

      const token = createTestToken({ iat, exp })
      expect(getSessionPercentage(token)).toBe(0)
    })

    test('returns 0 for invalid token', () => {
      expect(getSessionPercentage('invalid')).toBe(0)
    })

    test('returns 0 for token without iat or exp', () => {
      const token = createTestToken({ sub: 'user123' })
      expect(getSessionPercentage(token)).toBe(0)
    })
  })

  describe('formatRemainingTime', () => {
    test('formats days and hours correctly', () => {
      const twoDaysThreeHours = 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000
      expect(formatRemainingTime(twoDaysThreeHours)).toBe('2d 3h')
    })

    test('formats hours and minutes correctly', () => {
      const twoHoursThirtyMinutes = 2 * 60 * 60 * 1000 + 30 * 60 * 1000
      expect(formatRemainingTime(twoHoursThirtyMinutes)).toBe('2h 30m')
    })

    test('formats minutes and seconds correctly', () => {
      const fiveMinutesThirtySeconds = 5 * 60 * 1000 + 30 * 1000
      expect(formatRemainingTime(fiveMinutesThirtySeconds)).toBe('5m 30s')
    })

    test('formats seconds only', () => {
      expect(formatRemainingTime(45000)).toBe('45s')
      expect(formatRemainingTime(1000)).toBe('1s')
    })

    test('returns 0s for zero', () => {
      expect(formatRemainingTime(0)).toBe('0s')
    })

    test('returns 0s for negative values', () => {
      expect(formatRemainingTime(-1000)).toBe('0s')
      expect(formatRemainingTime(-999999)).toBe('0s')
    })

    test('handles edge case at boundaries', () => {
      expect(formatRemainingTime(60000)).toBe('1m 0s') // Exactly 1 minute
      expect(formatRemainingTime(3600000)).toBe('1h 0m') // Exactly 1 hour
      expect(formatRemainingTime(86400000)).toBe('1d 0h') // Exactly 1 day
    })
  })

  describe('formatRemainingTimeHMS', () => {
    test('formats as HH:MM:SS', () => {
      const time = 2 * 3600 * 1000 + 30 * 60 * 1000 + 45 * 1000
      expect(formatRemainingTimeHMS(time)).toBe('02:30:45')
    })

    test('pads single digits', () => {
      const time = 1 * 3600 * 1000 + 5 * 60 * 1000 + 3 * 1000
      expect(formatRemainingTimeHMS(time)).toBe('01:05:03')
    })

    test('returns 00:00:00 for zero', () => {
      expect(formatRemainingTimeHMS(0)).toBe('00:00:00')
    })

    test('returns 00:00:00 for negative values', () => {
      expect(formatRemainingTimeHMS(-1000)).toBe('00:00:00')
    })

    test('handles large hours', () => {
      const time = 99 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000
      expect(formatRemainingTimeHMS(time)).toBe('99:59:59')
    })

    test('handles exact boundaries', () => {
      expect(formatRemainingTimeHMS(1000)).toBe('00:00:01')
      expect(formatRemainingTimeHMS(60000)).toBe('00:01:00')
      expect(formatRemainingTimeHMS(3600000)).toBe('01:00:00')
    })
  })

  describe('shouldShowExpiryWarning', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns true when less than 5 minutes remaining', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token expires in 3 minutes
      const exp = Math.floor(now / 1000) + 180
      const token = createTestToken({ exp })

      expect(shouldShowExpiryWarning(token)).toBe(true)
    })

    test('returns false when more than 5 minutes remaining', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token expires in 10 minutes
      const exp = Math.floor(now / 1000) + 600
      const token = createTestToken({ exp })

      expect(shouldShowExpiryWarning(token)).toBe(false)
    })

    test('returns false when expired', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token already expired
      const exp = Math.floor(now / 1000) - 60
      const token = createTestToken({ exp })

      expect(shouldShowExpiryWarning(token)).toBe(false)
    })
  })

  describe('shouldRefreshToken', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns true when between 5-10 minutes remaining', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token expires in 7 minutes
      const exp = Math.floor(now / 1000) + 420
      const token = createTestToken({ exp })

      expect(shouldRefreshToken(token)).toBe(true)
    })

    test('returns false when less than 5 minutes remaining', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token expires in 3 minutes
      const exp = Math.floor(now / 1000) + 180
      const token = createTestToken({ exp })

      expect(shouldRefreshToken(token)).toBe(false)
    })

    test('returns false when more than 10 minutes remaining', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Token expires in 15 minutes
      const exp = Math.floor(now / 1000) + 900
      const token = createTestToken({ exp })

      expect(shouldRefreshToken(token)).toBe(false)
    })
  })
})
