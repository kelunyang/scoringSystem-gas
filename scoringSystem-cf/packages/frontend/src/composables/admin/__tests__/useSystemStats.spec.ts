/**
 * @fileoverview Unit tests for useSystemStats composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSystemStats } from '../useSystemStats'
import { adminApi } from '@/api/admin'
import { rpcClient } from '@/utils/rpc-client'

// Mock dependencies
vi.mock('@/api/admin')
vi.mock('@/utils/rpc-client')
vi.mock('@tanstack/vue-query', () => ({
  useQuery: vi.fn((options) => ({
    data: { value: undefined },
    isLoading: { value: false },
    error: { value: null },
    refetch: vi.fn()
  })),
  useQueries: vi.fn()
}))

describe('useSystemStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should export the composable function', () => {
    expect(useSystemStats).toBeDefined()
    expect(typeof useSystemStats).toBe('function')
  })

  it('should return all required properties', () => {
    const result = useSystemStats()

    // Data properties
    expect(result).toHaveProperty('systemStats')
    expect(result).toHaveProperty('invitationStats')
    expect(result).toHaveProperty('logStats')

    // Loading states
    expect(result).toHaveProperty('isLoading')
    expect(result).toHaveProperty('isLoadingSystem')
    expect(result).toHaveProperty('isLoadingInvitations')
    expect(result).toHaveProperty('isLoadingLogs')

    // Error states
    expect(result).toHaveProperty('systemError')
    expect(result).toHaveProperty('invitationsError')
    expect(result).toHaveProperty('logsError')

    // Methods
    expect(result).toHaveProperty('refreshSystem')
    expect(result).toHaveProperty('refreshInvitations')
    expect(result).toHaveProperty('refreshLogs')
    expect(result).toHaveProperty('refreshAll')

    expect(typeof result.refreshAll).toBe('function')
  })

  it('should accept options parameter', () => {
    const options = {
      enabled: false,
      refetchInterval: 30000,
      staleTime: 60000
    }

    const result = useSystemStats(options)

    expect(result).toBeDefined()
  })

  it('should work with default options', () => {
    const result = useSystemStats()

    expect(result).toBeDefined()
    expect(result.systemStats).toBeDefined()
  })
})
