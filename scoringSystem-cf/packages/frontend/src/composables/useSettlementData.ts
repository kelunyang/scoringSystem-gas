/**
 * Settlement Data Composables using TanStack Query
 *
 * Provides:
 * - useStageSettlementRankings() - Get stage settlement rankings
 * - useCommentSettlementRankings() - Get comment settlement rankings
 * - useSettlementHistory() - Get settlement history
 * - useSettlementDetails() - Get settlement details
 */

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
/** 結算 API 回的排名列，這裡只讀這幾個欄位 */
export interface SettlementRanking {
  groupId: string
  finalRank?: number
  allocatedPoints?: number
  memberPointsDistribution?: Member[]
  [key: string]: unknown
}

export function mapSettlementToGroups(
  rankings: SettlementRanking[] | null | undefined,
  groups: Group[]
) {
  if (!rankings || !groups) return groups

  // Create a map for O(1) lookup
  const rankingMap = new Map<string, SettlementRanking>()
  rankings.forEach(ranking => {
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
