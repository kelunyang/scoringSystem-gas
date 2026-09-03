/**
 * Settlement Data Composables using TanStack Query
 *
 * Provides:
 * - useStageSettlementRankings() - Get stage settlement rankings
 * - useCommentSettlementRankings() - Get comment settlement rankings
 * - useSettlementHistory() - Get settlement history
 * - useSettlementDetails() - Get settlement details
 */

import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from './useAuth'
import type { Group, Member } from '@/types'

// ===== Type Definitions =====

/**
 * @typedef {Object} MemberPointsDistribution
 * @property {string} userEmail - User's email address
 * @property {number} percentage - Participation percentage (0-100)
 * @property {number} points - Allocated points for this member
 */

/**
 * @typedef {Object} SettlementRanking
 * @property {string} groupId - Group's unique identifier
 * @property {number} finalRank - Final ranking position (1, 2, 3, ...)
 * @property {number} allocatedPoints - Total points allocated to this group
 * @property {MemberPointsDistribution[]} memberPointsDistribution - Points distribution among members
 */

/**
 * @typedef {Object} GroupObject
 * @property {string} groupId - Group's unique identifier
 * @property {string} groupName - Group's display name
 * @property {boolean} [rankingsLoading] - Loading state for rankings data
 * @property {number} [finalSettlementRank] - Final settlement rank (added by this function)
 * @property {number} [earnedPoints] - Earned points (added by this function)
 * @property {MemberPointsDistribution[]} [memberPointsDistribution] - Points distribution (added by this function)
 */

// ===== Utility Functions =====

/**
 * Normalize a value that might be a ref or a plain value
 *
 * This utility ensures proper reactivity tracking for TanStack Query's queryKey.
 * It wraps any value (ref or plain) in a computed that returns the unwrapped value.
 *
 * @template T
 * @param {import('vue').Ref<T>|T} value - Value to normalize (can be ref or plain value)
 * @returns {import('vue').ComputedRef<T>} Computed ref that unwraps the value
 *
 * @example
 * const normalizedId = normalizeRef(projectId) // works with both ref and string
 * console.log(normalizedId.value) // always safe to access .value
 */
function normalizeRef(value: any) {
  return computed(() =>
    typeof value === 'object' && value !== null && 'value' in value
      ? value.value
      : value
  )
}

/**
 * Handle API error responses with contextual error messages
 *
 * @param {Object} response - API response object
 * @param {string} defaultMessage - Default error message if no specific code matches
 * @throws {Error} Always throws an error with appropriate message
 */
function handleApiError(response: any, defaultMessage: any) {
  const errorCode = response.error?.code
  const errorMessage = response.error?.message || defaultMessage

  // Provide better error messages based on error code
  if (errorCode === 'SETTLEMENT_NOT_FOUND') {
    throw new Error('此階段尚未結算，請稍後再試')
  } else if (errorCode === 'PERMISSION_DENIED') {
    throw new Error('您沒有權限查看此階段的結算結果')
  } else {
    throw new Error(errorMessage)
  }
}

// ===== Composables =====

// ===== Helper Functions =====

/**
 * Helper function to map settlement rankings to group objects
 *
 * This function performs immutable updates to group objects, adding settlement data
 * while preserving all existing properties. Uses Map for O(1) lookup performance.
 *
 * @param {SettlementRanking[]} rankings - Settlement rankings from API
 * @param {GroupObject[]} groups - Group objects to update
 * @returns {GroupObject[]} Updated group objects with settlement data (new array, immutable)
 *
 * @example
 * const updatedGroups = mapSettlementToGroups(settlementData.rankings, stage.groups)
 * // Returns new array with settlement data merged into each group
 */
export function mapSettlementToGroups(rankings: any, groups: Group[]) {
  if (!rankings || !groups) return groups

  // Create a map for O(1) lookup
  const rankingMap = new Map()
  rankings.forEach((ranking: any) => {
    rankingMap.set(ranking.groupId, ranking)
  })

  // Update each group with settlement data (immutable pattern)
  return groups.map((group: Group) => {
    const settlement = rankingMap.get(group.groupId)
    if (settlement) {
      return {
        ...group,
        finalSettlementRank: settlement.finalRank,
        earnedPoints: settlement.allocatedPoints,
        // Deep copy array AND objects within to avoid reference issues
        memberPointsDistribution: settlement.memberPointsDistribution
          ? settlement.memberPointsDistribution.map((member: Member) => ({ ...member }))
          : undefined,
        rankingsLoading: false
      }
    }
    return {
      ...group,
      rankingsLoading: false
    }
  })
}
