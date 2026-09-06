/**
 * mapSettlementToGroups 的回歸測試
 *
 * 後端 `/settlement/stage-rankings` 回的 `rankings` 是**以 groupId 為鍵的
 * 物件**（handlers/settlement/manage.ts 的 rankingMap），不是陣列。
 * 這個函式原本宣告收陣列並呼叫 `rankings.forEach(...)`——傳物件進來會
 * 直接拋 TypeError，結算資料從來沒有映射到各組過。
 */

import { describe, test, expect } from 'vitest'
import { mapSettlementToGroups } from '../useSettlementData'
import type { Group } from '@/types'

const groups = [
  { groupId: 'grp_1', groupName: '第一組' },
  { groupId: 'grp_2', groupName: '第二組' }
] as unknown as Group[]

const rankings = {
  grp_1: {
    groupId: 'grp_1',
    finalRank: 1,
    allocatedPoints: 500,
    memberPointsDistribution: [{ email: 'a@example.com', points: 250 }]
  },
  grp_2: { groupId: 'grp_2', finalRank: 2, allocatedPoints: 300 }
}

describe('mapSettlementToGroups', () => {
  test('吃得下以 groupId 為鍵的物件（後端實際回傳的形狀）', () => {
    const result = mapSettlementToGroups(rankings, groups)
    expect(result[0].finalSettlementRank).toBe(1)
    expect(result[0].earnedPoints).toBe(500)
    expect(result[1].finalSettlementRank).toBe(2)
  })

  test('memberPointsDistribution 是深拷貝，不會共用參考', () => {
    const result = mapSettlementToGroups(rankings, groups)
    const copied = result[0].memberPointsDistribution
    expect(copied).toHaveLength(1)
    expect(copied![0]).not.toBe(rankings.grp_1.memberPointsDistribution[0])
  })

  test('沒有對應結算資料的組保持原樣', () => {
    const result = mapSettlementToGroups({ grp_1: rankings.grp_1 }, groups)
    expect(result[1].finalSettlementRank).toBeUndefined()
  })

  test('rankings 為 null 時原樣回傳', () => {
    expect(mapSettlementToGroups(null, groups)).toBe(groups)
  })
})
