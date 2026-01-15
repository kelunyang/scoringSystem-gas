/**
 * Vitest setup file for backend tests
 * This file runs before each test file
 */

import { vi, beforeEach, afterEach } from 'vitest'

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})

// Global test utilities
declare global {
  // Add any global test utilities here
  var testUtils: {
    createTestUser: (overrides?: Partial<TestUser>) => TestUser
    createTestProject: (overrides?: Partial<TestProject>) => TestProject
    generateId: (prefix: string) => string
  }

  interface TestUser {
    userId: string
    userEmail: string
    displayName: string
    password: string
    status: 'active' | 'disabled'
    createdAt: number
    lastActivityTime: number
  }

  interface TestProject {
    projectId: string
    projectName: string
    description: string
    status: 'active' | 'archived'
    createdBy: string
    createdAt: number
  }
}

// Initialize global test utilities
globalThis.testUtils = {
  createTestUser: (overrides = {}) => ({
    userId: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userEmail: `test${Date.now()}@example.com`,
    displayName: 'Test User',
    password: '$2a$10$hashedpassword', // Mock hashed password
    status: 'active' as const,
    createdAt: Date.now(),
    lastActivityTime: Date.now(),
    ...overrides
  }),

  createTestProject: (overrides = {}) => ({
    projectId: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectName: 'Test Project',
    description: 'A test project',
    status: 'active' as const,
    createdBy: 'usr_test',
    createdAt: Date.now(),
    ...overrides
  }),

  generateId: (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Export for type inference
export {}
