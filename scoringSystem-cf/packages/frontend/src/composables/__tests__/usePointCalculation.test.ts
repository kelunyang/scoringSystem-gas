/**
 * Unit tests for usePointCalculation composable
 * Tests point calculation, ranking weights, and scoring distribution
 */

import { describe, test, expect } from 'vitest'
import { ref } from 'vue'
import { usePointCalculation } from '../usePointCalculation'

describe('usePointCalculation', () => {
  describe('calculateRankWeights', () => {
    test('generates correct weights for 4 groups', () => {
      const { calculateRankWeights } = usePointCalculation()
      const weights = calculateRankWeights(4)

      expect(weights).toEqual({
        1: 4, // 1st place gets highest weight
        2: 3,
        3: 2,
        4: 1  // Last place gets 1
      })
    })

    test('generates correct weights for single group', () => {
      const { calculateRankWeights } = usePointCalculation()
      const weights = calculateRankWeights(1)

      expect(weights).toEqual({ 1: 1 })
    })

    test('generates correct weights for 8 groups', () => {
      const { calculateRankWeights } = usePointCalculation()
      const weights = calculateRankWeights(8)

      expect(weights[1]).toBe(8)
      expect(weights[2]).toBe(7)
      expect(weights[7]).toBe(2)
      expect(weights[8]).toBe(1)
      expect(Object.keys(weights)).toHaveLength(8)
    })

    test('generates correct weights for 2 groups', () => {
      const { calculateRankWeights } = usePointCalculation()
      const weights = calculateRankWeights(2)

      expect(weights).toEqual({
        1: 2,
        2: 1
      })
    })

    test('weight decreases by 1 for each subsequent rank', () => {
      const { calculateRankWeights } = usePointCalculation()
      const groupCount = 10
      const weights = calculateRankWeights(groupCount)

      for (let i = 1; i < groupCount; i++) {
        expect(weights[i] - weights[i + 1]).toBe(1)
      }
    })
  })

  describe('calculateScoring', () => {
    test('returns empty array for no members', () => {
      const { calculateScoring } = usePointCalculation()
      const result = calculateScoring([], 1, 100, 4)

      expect(result).toEqual([])
    })

    test('returns empty array for null members', () => {
      const { calculateScoring } = usePointCalculation()
      const result = calculateScoring(null, 1, 100, 4)

      expect(result).toEqual([])
    })

    test('returns empty array for invalid group count (zero)', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [{ displayName: 'Test', email: 'test@example.com', contribution: 100 }]

      expect(calculateScoring(members, 1, 100, 0)).toEqual([])
    })

    test('returns empty array for invalid group count (negative)', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [{ displayName: 'Test', email: 'test@example.com', contribution: 100 }]

      expect(calculateScoring(members, 1, 100, -1)).toEqual([])
    })

    test('returns empty array for invalid rank (exceeds group count)', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [{ displayName: 'Test', email: 'test@example.com', contribution: 100 }]

      expect(calculateScoring(members, 5, 100, 4)).toEqual([])
    })

    test('returns empty array for invalid rank (zero)', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [{ displayName: 'Test', email: 'test@example.com', contribution: 100 }]

      expect(calculateScoring(members, 0, 100, 4)).toEqual([])
    })

    test('returns empty array for invalid rank (negative)', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [{ displayName: 'Test', email: 'test@example.com', contribution: 100 }]

      expect(calculateScoring(members, -1, 100, 4)).toEqual([])
    })

    test('calculates points for single member group', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        { displayName: 'Solo', email: 'solo@example.com', contribution: 100 }
      ]
      const result = calculateScoring(members, 1, 1000, 4, [], null)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('solo@example.com')
      expect(result[0].points).toBeGreaterThan(0)
      expect(result[0].rankMultiplier).toBe(4) // 1st place in 4-group competition
    })

    test('distributes points based on contribution', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        { displayName: 'High', email: 'high@example.com', contribution: 60 },
        { displayName: 'Low', email: 'low@example.com', contribution: 40 }
      ]
      const result = calculateScoring(members, 1, 1000, 4, [], null)

      expect(result).toHaveLength(2)

      // Higher contributor should get more points
      const highMember = result.find(m => m.email === 'high@example.com')
      const lowMember = result.find(m => m.email === 'low@example.com')

      expect(highMember).toBeDefined()
      expect(lowMember).toBeDefined()
      expect(highMember!.points).toBeGreaterThan(lowMember!.points)
    })

    test('results are sorted by points descending', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        { displayName: 'Low', email: 'low@example.com', contribution: 20 },
        { displayName: 'High', email: 'high@example.com', contribution: 50 },
        { displayName: 'Mid', email: 'mid@example.com', contribution: 30 }
      ]
      const result = calculateScoring(members, 1, 1000, 4, [], null)

      // Results should be sorted by points descending
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].points).toBeGreaterThanOrEqual(result[i + 1].points)
      }
    })

    test('first rank gets more points than lower ranks', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        { displayName: 'Test', email: 'test@example.com', contribution: 100 }
      ]

      const firstPlace = calculateScoring(members, 1, 1000, 4, [], null)
      const lastPlace = calculateScoring(members, 4, 1000, 4, [], null)

      expect(firstPlace[0].points).toBeGreaterThan(lastPlace[0].points)
    })

    test('includes correct metadata in results', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        {
          displayName: 'Test User',
          email: 'test@example.com',
          contribution: 50,
          avatarSeed: 'seed123',
          avatarStyle: 'bottts',
          avatarOptions: { backgroundColor: 'blue' }
        }
      ]
      const result = calculateScoring(members, 2, 1000, 4, [], null)

      expect(result[0]).toMatchObject({
        email: 'test@example.com',
        displayName: 'Test User',
        avatarSeed: 'seed123',
        avatarStyle: 'bottts',
        contribution: 50,
        participationRatio: 50,
        targetRank: 2,
        globalMinRatio: 5,
        rankMultiplier: 3 // 2nd place in 4-group = weight 3
      })
    })

    test('handles equal contributions correctly', () => {
      const { calculateScoring } = usePointCalculation()
      const members = [
        { displayName: 'A', email: 'a@example.com', contribution: 50 },
        { displayName: 'B', email: 'b@example.com', contribution: 50 }
      ]
      const result = calculateScoring(members, 1, 1000, 4, [], null)

      // Equal contributions should result in equal points
      expect(result[0].points).toBeCloseTo(result[1].points, 5)
    })
  })

  describe('safeSliderMin', () => {
    test('returns 1 when no data provided', () => {
      const { safeSliderMin } = usePointCalculation({})
      expect(safeSliderMin.value).toBe(1)
    })

    test('returns 1 when refs are undefined', () => {
      const { safeSliderMin } = usePointCalculation({
        totalActiveGroups: undefined,
        totalProjectGroups: undefined
      })
      expect(safeSliderMin.value).toBe(1)
    })

    test('returns activeGroups when valid', () => {
      const { safeSliderMin } = usePointCalculation({
        totalActiveGroups: ref(5),
        totalProjectGroups: ref(10)
      })
      expect(safeSliderMin.value).toBe(5)
    })

    test('returns 1 when activeGroups is 0', () => {
      const { safeSliderMin } = usePointCalculation({
        totalActiveGroups: ref(0),
        totalProjectGroups: ref(10)
      })
      expect(safeSliderMin.value).toBe(1)
    })

    test('handles min > max edge case by clamping', () => {
      // This shouldn't happen in production but the function should handle it
      const { safeSliderMin } = usePointCalculation({
        totalActiveGroups: ref(15),
        totalProjectGroups: ref(10)
      })
      // Should clamp to max
      expect(safeSliderMin.value).toBe(10)
    })

    test('is reactive to ref changes', () => {
      const activeGroups = ref(3)
      const projectGroups = ref(10)

      const { safeSliderMin } = usePointCalculation({
        totalActiveGroups: activeGroups,
        totalProjectGroups: projectGroups
      })

      expect(safeSliderMin.value).toBe(3)

      activeGroups.value = 7
      expect(safeSliderMin.value).toBe(7)
    })
  })

  describe('getRankColor', () => {
    test('returns distinct colors for first 8 ranks', () => {
      const { getRankColor } = usePointCalculation()
      const colors = new Set<string>()

      for (let i = 1; i <= 8; i++) {
        colors.add(getRankColor(i))
      }

      expect(colors.size).toBe(8)
    })

    test('cycles colors for ranks beyond 8', () => {
      const { getRankColor } = usePointCalculation()

      expect(getRankColor(1)).toBe(getRankColor(9))
      expect(getRankColor(2)).toBe(getRankColor(10))
      expect(getRankColor(3)).toBe(getRankColor(11))
    })

    test('returns valid hex color format', () => {
      const { getRankColor } = usePointCalculation()
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/

      for (let i = 1; i <= 10; i++) {
        expect(getRankColor(i)).toMatch(hexColorRegex)
      }
    })

    test('first rank gets the primary color', () => {
      const { getRankColor } = usePointCalculation()
      const firstRankColor = getRankColor(1)

      expect(firstRankColor).toBe('#8FD460') // Lime mint color
    })
  })

  describe('calculateAllGroupsScoring', () => {
    test('includes current group in results', () => {
      const { calculateAllGroupsScoring } = usePointCalculation()
      const members = [
        { displayName: 'Test', email: 'test@example.com', contribution: 100 }
      ]
      const result = calculateAllGroupsScoring(members, 1, 1000, 4, [], 'group_1')

      const currentGroup = result.find(g => g.isCurrentGroup)
      expect(currentGroup).toBeDefined()
      expect(currentGroup!.rank).toBe(1)
    })

    test('fills in placeholder groups when needed', () => {
      const { calculateAllGroupsScoring } = usePointCalculation()
      const members = [
        { displayName: 'Test', email: 'test@example.com', contribution: 100 }
      ]
      const result = calculateAllGroupsScoring(members, 1, 1000, 4, [], 'group_1')

      // Should have 4 groups total (1 current + 3 placeholders)
      expect(result).toHaveLength(4)
    })

    test('results are sorted by rank', () => {
      const { calculateAllGroupsScoring } = usePointCalculation()
      const members = [
        { displayName: 'Test', email: 'test@example.com', contribution: 100 }
      ]
      const result = calculateAllGroupsScoring(members, 2, 1000, 4, [], 'group_1')

      // Results should be sorted by rank ascending
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].rank).toBeLessThan(result[i + 1].rank)
      }
    })

    test('current group appears at correct rank position', () => {
      const { calculateAllGroupsScoring } = usePointCalculation()
      const members = [
        { displayName: 'Test', email: 'test@example.com', contribution: 100 }
      ]

      // Test different target ranks
      for (let targetRank = 1; targetRank <= 4; targetRank++) {
        const result = calculateAllGroupsScoring(members, targetRank, 1000, 4, [], 'group_1')
        const currentGroup = result.find(g => g.isCurrentGroup)

        expect(currentGroup!.rank).toBe(targetRank)
      }
    })
  })
})
