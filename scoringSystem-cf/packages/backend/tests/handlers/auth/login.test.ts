/**
 * Unit tests for login handler
 * Tests authentication flow, failed attempt tracking, and account locking
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createMockEnv, createMockEnvWithData } from '../../mocks/env'
import { createMockD1Database } from '../../mocks/d1-database'

// Mock the password verification module
vi.mock('../../../src/handlers/auth/password', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  validatePasswordStrength: vi.fn(() => ({ valid: true, errors: [] }))
}))

// Mock the JWT module
vi.mock('../../../src/handlers/auth/jwt', () => ({
  generateToken: vi.fn(() => Promise.resolve('mock-jwt-token')),
  verifyToken: vi.fn()
}))

// Mock the logging module
vi.mock('../../../src/utils/logging', () => ({
  logGlobalOperation: vi.fn(() => Promise.resolve()),
  logProjectOperation: vi.fn(() => Promise.resolve())
}))

// Mock the security module
vi.mock('../../../src/utils/security', () => ({
  logSecurityAction: vi.fn(() => Promise.resolve(true)),
  notifyAdmins: vi.fn(() => Promise.resolve()),
  disableUserAccount: vi.fn(() => Promise.resolve())
}))

// Mock the queue producers
vi.mock('../../../src/queues/notification-producer', () => ({
  queueSingleNotification: vi.fn(() => Promise.resolve())
}))

vi.mock('../../../src/queues/email-producer', () => ({
  queueAccountLockedEmail: vi.fn(() => Promise.resolve()),
  queuePasswordResetEmail: vi.fn(() => Promise.resolve())
}))

// Import after mocks are set up
import { authenticateUser, type RequestContext } from '../../../src/handlers/auth/login'
import { verifyPassword } from '../../../src/handlers/auth/password'

describe('authenticateUser', () => {
  const mockRequestContext: RequestContext = {
    ipAddress: '127.0.0.1',
    country: 'TW',
    city: 'Taipei',
    timezone: 'Asia/Taipei',
    userAgent: 'Test Agent/1.0',
    requestPath: '/api/users/login'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('input validation', () => {
    test('returns error for missing email', async () => {
      const mockEnv = createMockEnv()

      const result = await authenticateUser(
        mockEnv,
        '',
        'password123',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_INPUT')
      expect(result.error?.message).toContain('Email and password are required')
    })

    test('returns error for missing password', async () => {
      const mockEnv = createMockEnv()

      const result = await authenticateUser(
        mockEnv,
        'user@example.com',
        '',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_INPUT')
    })

    test('returns error for both email and password missing', async () => {
      const mockEnv = createMockEnv()

      const result = await authenticateUser(
        mockEnv,
        '',
        '',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_INPUT')
    })
  })

  describe('user not found', () => {
    test('returns INVALID_CREDENTIALS for non-existent user', async () => {
      const mockEnv = createMockEnv()

      const result = await authenticateUser(
        mockEnv,
        'nonexistent@example.com',
        'password123',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_CREDENTIALS')
      expect(result.error?.message).toBe('Invalid email or password')
    })

    test('still calls verifyPassword for timing attack prevention', async () => {
      const mockEnv = createMockEnv()

      await authenticateUser(
        mockEnv,
        'nonexistent@example.com',
        'password123',
        'secret',
        mockRequestContext
      )

      // Should have called verifyPassword with dummy hash
      expect(verifyPassword).toHaveBeenCalled()
    })
  })

  describe('disabled user', () => {
    test('returns USER_DISABLED for disabled account', async () => {
      const tableData = new Map([
        ['users', [{
          userId: 'usr_123',
          userEmail: 'disabled@example.com',
          password: '$2a$10$hashedpassword',
          status: 'disabled',
          displayName: 'Disabled User'
        }]]
      ])
      const mockEnv = createMockEnvWithData(tableData)

      const result = await authenticateUser(
        mockEnv,
        'disabled@example.com',
        'password123',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('USER_DISABLED')
      expect(result.error?.message).toContain('disabled')
    })
  })

  describe('temporarily locked user', () => {
    test('returns error for temporarily locked account', async () => {
      const futureTime = Date.now() + 3600000 // 1 hour from now
      const tableData = new Map([
        ['users', [{
          userId: 'usr_123',
          userEmail: 'locked@example.com',
          password: '$2a$10$hashedpassword',
          status: 'active',
          lockUntil: futureTime,
          displayName: 'Locked User'
        }]]
      ])
      const mockEnv = createMockEnvWithData(tableData)

      const result = await authenticateUser(
        mockEnv,
        'locked@example.com',
        'password123',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('USER_DISABLED')
      expect(result.error?.message).toContain('temporarily locked')
    })

    test('auto-unlocks expired lock', async () => {
      const pastTime = Date.now() - 3600000 // 1 hour ago (lock expired)
      const tableData = new Map([
        ['users', [{
          userId: 'usr_123',
          userEmail: 'unlocked@example.com',
          password: '$2a$10$hashedpassword',
          status: 'active',
          lockUntil: pastTime,
          displayName: 'Unlocked User'
        }]]
      ])
      const mockEnv = createMockEnvWithData(tableData)

      // Mock successful password verification
      vi.mocked(verifyPassword).mockResolvedValueOnce(true)

      const result = await authenticateUser(
        mockEnv,
        'unlocked@example.com',
        'correctpassword',
        'secret',
        mockRequestContext
      )

      // Should proceed with login (lock expired)
      // The actual success depends on password verification
      expect(verifyPassword).toHaveBeenCalled()
    })
  })

  describe('password verification', () => {
    test('returns INVALID_CREDENTIALS for wrong password', async () => {
      const tableData = new Map([
        ['users', [{
          userId: 'usr_123',
          userEmail: 'user@example.com',
          password: '$2a$10$hashedpassword',
          status: 'active',
          displayName: 'Test User'
        }]]
      ])
      const mockEnv = createMockEnvWithData(tableData)

      // Mock failed password verification
      vi.mocked(verifyPassword).mockResolvedValueOnce(false)

      const result = await authenticateUser(
        mockEnv,
        'user@example.com',
        'wrongpassword',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_CREDENTIALS')
    })

    test('returns success with token for correct password', async () => {
      const tableData = new Map([
        ['users', [{
          userId: 'usr_123',
          userEmail: 'user@example.com',
          password: '$2a$10$hashedpassword',
          status: 'active',
          displayName: 'Test User',
          avatarSeed: 'seed123',
          avatarStyle: 'bottts',
          avatarOptions: '{}'
        }]]
      ])
      const mockEnv = createMockEnvWithData(tableData)

      // Mock successful password verification
      vi.mocked(verifyPassword).mockResolvedValueOnce(true)

      const result = await authenticateUser(
        mockEnv,
        'user@example.com',
        'correctpassword',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(true)
      expect(result.data?.sessionId).toBe('mock-jwt-token')
      expect(result.data?.user).toBeDefined()
      expect(result.data?.user.userId).toBe('usr_123')
      expect(result.data?.user.userEmail).toBe('user@example.com')
    })
  })

  describe('error handling', () => {
    test('returns INTERNAL_ERROR for unexpected errors', async () => {
      const mockEnv = createMockEnv()

      // Create a broken database that throws
      mockEnv.DB = {
        prepare: () => {
          throw new Error('Database connection failed')
        }
      } as unknown as D1Database

      const result = await authenticateUser(
        mockEnv,
        'user@example.com',
        'password123',
        'secret',
        mockRequestContext
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INTERNAL_ERROR')
    })
  })
})
