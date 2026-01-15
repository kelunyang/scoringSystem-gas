/**
 * Mock Environment for unit testing
 * Creates a complete mock Env object for Cloudflare Workers
 */

import type { Env } from '../../src/types'
import { createMockD1Database } from './d1-database'
import { createMockKVNamespace } from './kv-storage'

/**
 * Create a mock Queue for testing
 */
function createMockQueue<T = unknown>(): Queue<T> {
  const messages: T[] = []

  return {
    async send(message: T, options?: { delaySeconds?: number }): Promise<void> {
      messages.push(message)
    },
    async sendBatch(messages: { body: T; delaySeconds?: number }[]): Promise<void> {
      for (const msg of messages) {
        this.send(msg.body)
      }
    },
    // Helper for tests to inspect sent messages
    _getMessages(): T[] {
      return [...messages]
    },
    _clear(): void {
      messages.length = 0
    }
  } as Queue<T> & { _getMessages(): T[]; _clear(): void }
}

/**
 * Create a mock Durable Object namespace for testing
 */
function createMockDurableObjectNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string): DurableObjectId {
      return {
        toString: () => `mock-do-${name}`,
        equals: (other: DurableObjectId) => other.toString() === `mock-do-${name}`,
        name
      } as DurableObjectId
    },
    idFromString(id: string): DurableObjectId {
      return {
        toString: () => id,
        equals: (other: DurableObjectId) => other.toString() === id
      } as DurableObjectId
    },
    newUniqueId(): DurableObjectId {
      const id = `mock-do-${Date.now()}-${Math.random().toString(36).slice(2)}`
      return {
        toString: () => id,
        equals: (other: DurableObjectId) => other.toString() === id
      } as DurableObjectId
    },
    get(id: DurableObjectId): DurableObjectStub {
      return {
        id,
        name: (id as any).name,
        fetch: async () => new Response('OK')
      } as unknown as DurableObjectStub
    },
    jurisdiction(jurisdiction: string) {
      return this
    }
  } as unknown as DurableObjectNamespace
}

/**
 * Default environment values for testing
 */
const DEFAULT_ENV_VALUES = {
  JWT_SECRET: 'test-jwt-secret-key-for-unit-tests-only',
  SESSION_TIMEOUT: '86400000', // 24 hours
  PASSWORD_SALT_ROUNDS: '10',
  INVITE_CODE_TIMEOUT: '604800000', // 7 days
  MAX_PROJECT_NAME_LENGTH: '100',
  CONSOLE_LOGGING: 'false',
  ENVIRONMENT: 'test',
  DEFAULT_MAX_COMMENT_SELECTIONS: '3',
  DEFAULT_STUDENT_RANKING_WEIGHT: '0.5',
  DEFAULT_TEACHER_RANKING_WEIGHT: '0.5',
  DEFAULT_COMMENT_REWARD_PERCENTILE: '0.2',
  DEFAULT_MAX_VOTE_RESET_COUNT: '3',
  WEB_APP_URL: 'http://localhost:5173',
  SYSTEM_TITLE: 'Test Scoring System',
  SYSTEM_URL: 'http://localhost:5173'
}

/**
 * Create a mock environment for testing
 * @param overrides - Optional overrides for default values
 */
export function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    // D1 Database
    DB: createMockD1Database(),

    // KV Namespaces
    KV: createMockKVNamespace(),
    CONFIG: createMockKVNamespace(),
    SYSTEM_CONFIG: createMockKVNamespace(),

    // Durable Objects
    NOTIFICATION_HUB: createMockDurableObjectNamespace(),

    // Queues
    EMAIL_QUEUE: createMockQueue(),
    NOTIFICATION_QUEUE: createMockQueue(),
    SETTLEMENT_QUEUE: createMockQueue(),
    LOGIN_EVENTS: createMockQueue(),
    AI_RANKING_QUEUE: createMockQueue(),

    // Environment Variables
    ...DEFAULT_ENV_VALUES,

    // Apply overrides
    ...overrides
  } as Env
}

/**
 * Create a mock environment with custom database data
 */
export function createMockEnvWithData(
  tableData: Map<string, Record<string, unknown>[]>,
  overrides: Partial<Env> = {}
): Env {
  return {
    ...createMockEnv(overrides),
    DB: createMockD1Database(tableData)
  }
}

/**
 * Helper to get mock queue messages for assertions
 */
export function getQueueMessages<T>(queue: Queue<T>): T[] {
  return (queue as Queue<T> & { _getMessages(): T[] })._getMessages?.() || []
}

/**
 * Helper to clear mock queue messages
 */
export function clearQueueMessages<T>(queue: Queue<T>): void {
  (queue as Queue<T> & { _clear(): void })._clear?.()
}
