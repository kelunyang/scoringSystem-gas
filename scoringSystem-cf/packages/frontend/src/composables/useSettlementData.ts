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
/**
 * 結算 API 回的排名列，這裡只讀這幾個欄位。
 *
 * 不加索引簽章：TypeScript 只讓 type alias 有隱含索引簽章，
 * 後端那些 interface（StageSettlementRanking）會因此不能指派進來。
 */
export interface SettlementRanking {
  groupId: string
  finalRank?: number
  allocatedPoints?: number
  /** 後端存 JSON 字串、解析後回傳，元素形狀由結算流程決定 */
  memberPointsDistribution?: unknown[]
}

export function mapSettlementToGroups(
  /**
   * 後端回的是**以 groupId 為鍵的物件**
   * （handlers/settlement/manage.ts 的 rankingMap），不是陣列。
   * 也接受陣列形態，因為舊呼叫端可能還這樣傳。
   */
  rankings: Record<string, SettlementRanking> | SettlementRanking[] | null | undefined,
  groups: Group[]
) {
  if (!rankings || !groups) return groups

  // Create a map for O(1) lookup
  const rankingMap = new Map<string, SettlementRanking>()
  const list = Array.isArray(rankings) ? rankings : Object.values(rankings)
  list.forEach(ranking => {
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
          ? settlement.memberPointsDistribution.map(member => ({ ...(member as Record<string, unknown>) }))
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
