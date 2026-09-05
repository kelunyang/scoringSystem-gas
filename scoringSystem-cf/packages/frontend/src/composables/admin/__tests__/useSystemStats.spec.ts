/**
 * @fileoverview Unit tests for useSystemStats composable
 *
 * These were skipped from the day they were written because `@/` aliases did
 * not resolve under Vitest, so the composable could not be imported. That was
 * fixed when the workspace config moved off the deprecated
 * `defineWorkspace(file-reference)` form (see the note in the root
 * vitest.config.ts) — the alias is configured at vitest.config.ts:30 and the
 * skip was simply never lifted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSystemStats } from '../useSystemStats'

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

    // Methods - using refetch* naming (TanStack Query convention)
    expect(result).toHaveProperty('refetchSystem')
    expect(result).toHaveProperty('refetchInvitations')
    expect(result).toHaveProperty('refetchLogs')
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
