/**
 * @fileoverview 點數計算與權重分配邏輯
 *
 * 核心算法：
 * 1. 基礎權重單位 = 個人參與比例 / 全域最小比例(5%)
 * 2. 實際權重 = 基礎權重 × 排名倍率
 * 3. 個人得分 = 實際權重 × (總點數 / 總權重)
 *
 * 排名倍率計算：第1名=N, 第2名=N-1, ..., 第N名=1 (N=總組數)
 */

import { computed, type Ref } from 'vue'
import type { Member } from '@/types'

/**
 * Point calculation options
 */
interface PointCalculationOptions {
  simulatedGroupCount?: Ref<number>
  totalProjectGroups?: Ref<number>
  totalActiveGroups?: Ref<number>
}

/**
 * 點數計算邏輯 Composable
 * @param {PointCalculationOptions} options - 配置選項
 * @param {Ref<Number>} options.simulatedGroupCount - 模擬組數
 * @param {Ref<Number>} options.totalProjectGroups - 專案總組數
 * @param {Ref<Number>} options.totalActiveGroups - 已提交組數
 * @returns {Object} 計算方法和工具函數
 */
export function usePointCalculation(options: PointCalculationOptions = {}) {
  const {
    simulatedGroupCount,
    totalProjectGroups,
    totalActiveGroups
  } = options

  /**
   * 計算安全的滑塊最小值
   * 確保不會出現 min > max 的情況
   */
  const safeSliderMin = computed(() => {
    if (!totalActiveGroups?.value || !totalProjectGroups?.value) {
      return 1
    }

    const min = Math.max(1, totalActiveGroups.value)
    const max = totalProjectGroups.value

    // 檢查是否出現不合理的 min > max 情況
    if (min > max) {
      console.error('🚨 [usePointCalculation] Slider 參數異常！', {
        totalActiveGroups: totalActiveGroups.value,
        totalProjectGroups: totalProjectGroups.value,
        calculatedMin: min,
        calculatedMax: max,
        issue: '已提交組數 > 專案總組數（不應該發生）'
      })
      // 強制修正：使用 Math.min 限制在 max 以內
      return Math.min(min, max)
    }

    return min
  })

  /**
   * 計算排名權重映射表（反向排名比例）
   *
   * 註：此函數用於預估點數的模擬計算，假設無同名次情況
   * 實際結算時，後端會使用「佔用位置法」(Occupied Rank Method) 處理同名次
   *
   * @param {Number} groupCount - 組數
   * @returns {Object} 排名權重映射 { 1: N, 2: N-1, ..., N: 1 }
   *
   * 範例：4組參賽
   * - 第1名權重 = 4
   * - 第2名權重 = 3
   * - 第3名權重 = 2
   * - 第4名權重 = 1
   */
  function calculateRankWeights(groupCount: number) {
    const rankWeights: Record<number, number> = {}
    for (let i = 1; i <= groupCount; i++) {
      rankWeights[i] = groupCount - i + 1
    }
    return rankWeights
  }

  /**
   * 計算指定排名的點數分配
   * @param {Array} selectedMembers - 選中的成員列表
   * @param {Number} targetRank - 目標排名
   * @param {Number} totalStagePoints - 階段總點數
   * @param {Number} groupCount - 組數
   * @param {Array} allGroups - 所有組資訊（用於模擬其他組）
   * @param {String} currentGroupId - 當前組ID
   * @returns {Array} 成員點數分配結果
   */
  function calculateScoring(
    selectedMembers: any,
    targetRank = 1,
    totalStagePoints = 100,
    groupCount = 4,
    allGroups: any[] = [],
    currentGroupId: string | null = null
  ) {
    // ===== 輸入驗證 =====
    if (!selectedMembers || selectedMembers.length === 0) {
      console.warn('calculateScoring: 沒有選中的成員')
      return []
    }

    if (!groupCount || groupCount <= 0) {
      console.error('calculateScoring: groupCount 無效', groupCount)
      return []
    }

    if (targetRank > groupCount || targetRank < 1) {
      console.error(`calculateScoring: 無效排名 ${targetRank}，總組數 ${groupCount}`)
      return []
    }

    // 計算排名權重
    const rankWeights = calculateRankWeights(groupCount)

    // 構建所有組的數據（包括我們組和其他組）
    const allTeamRoles: Record<number, any[]> = {}

    // 1. 我們組 - 放在指定排名位置，使用實際貢獻度分配
    allTeamRoles[targetRank] = selectedMembers.map((member: Member) => ({
      name: member.displayName,
      ratio: member.contribution,
      isCurrentUser: true
    }))

    // 2. 其他組（假設均分） - 基於實際的 allGroups 數據
    const otherRanks: number[] = []
    for (let i = 1; i <= groupCount; i++) {
      if (i !== targetRank) otherRanks.push(i)
    }
    let rankIndex = 0

    allGroups.forEach((group: any) => {
      if (group.groupId !== currentGroupId && group.status === 'active' && rankIndex < otherRanks.length) {
        const rank = otherRanks[rankIndex]
        const memberCount = group.memberCount || group.members?.length || 3 // 預設3人
        const basePercentage = Math.floor(100 / memberCount / 5) * 5
        const remainder = 100 - (basePercentage * memberCount)

        allTeamRoles[rank] = []
        for (let i = 0; i < memberCount; i++) {
          let contribution = basePercentage
          if (i < remainder / 5) contribution += 5

          allTeamRoles[rank].push({
            name: `第${rank}名組員${i + 1}`,
            ratio: contribution,
            isCurrentUser: false
          })
        }
        rankIndex++
      }
    })

    // 如果其他組不足，用預設組補足
    while (rankIndex < otherRanks.length) {
      const rank = otherRanks[rankIndex]
      allTeamRoles[rank] = [
        { name: `第${rank}名組員1`, ratio: 35, isCurrentUser: false },
        { name: `第${rank}名組員2`, ratio: 35, isCurrentUser: false },
        { name: `第${rank}名組員3`, ratio: 30, isCurrentUser: false }
      ]
      rankIndex++
    }

    // 收集所有比例，找到全域最小值
    const allRatios = []
    for (let rankKey in allTeamRoles) {
      if (allTeamRoles[rankKey] && allTeamRoles[rankKey].length > 0) {
        allTeamRoles[rankKey].forEach((role: any) => {
          if (role.ratio > 0) allRatios.push(role.ratio)
        })
      }
    }

    if (allRatios.length === 0) return []

    // 系統統一使用5%作為基準單位
    // 這確保了權重計算的一致性，無論用戶如何分配比例
    const globalMinRatio = 5

    // 計算我們組的數據
    const scoringData = selectedMembers.map((member: Member) => {
      const participationRatio = member.contribution

      // 基礎權重單位 = 個人比例 / 全域最小比例
      const baseWeightUnits = (participationRatio ?? 0) / globalMinRatio

      // 實際權重 = 基礎權重 × 排名倍率
      const finalWeight = baseWeightUnits * rankWeights[targetRank]

      return {
        email: member.email,
        displayName: member.displayName,
        avatarSeed: member.avatarSeed,
        avatarStyle: member.avatarStyle,
        avatarOptions: member.avatarOptions,
        contribution: participationRatio,
        participationRatio: participationRatio,
        baseWeightUnits: baseWeightUnits,
        rankMultiplier: rankWeights[targetRank],
        finalWeight: finalWeight,
        globalMinRatio: globalMinRatio,
        targetRank: targetRank,
        points: 0 // 稍後計算
      }
    })

    // 計算所有組的總權重來分配點數
    const allPeople: Array<{ finalWeight: number }> = []
    for (let rankKey in allTeamRoles) {
      const rankWeight = rankWeights[rankKey]
      allTeamRoles[rankKey].forEach((role: any) => {
        const baseWeightUnits = role.ratio / globalMinRatio
        const finalWeight = baseWeightUnits * rankWeight
        allPeople.push({ finalWeight })
      })
    }

    const totalWeight = allPeople.reduce((sum, person) => sum + person.finalWeight, 0)

    // ===== 除零保護 =====
    if (totalWeight === 0 || !isFinite(totalWeight)) {
      console.error('calculateScoring: totalWeight 無效', totalWeight)
      return scoringData.map((item: any) => ({ ...item, points: 0 }))
    }

    const pointsPerWeight = totalStagePoints / totalWeight

    // 分配我們組的實際點數
    scoringData.forEach((item: any) => {
      item.points = item.finalWeight * pointsPerWeight
    })

    // 按得分降序排序並返回
    return scoringData.sort((a: any, b: any) => b.points - a.points)
  }

  /**
   * 計算所有組的點數分配（用於完整視覺化）
   * @param {Array} selectedMembers - 選中的成員列表
   * @param {Number} targetRank - 目標排名
   * @param {Number} totalStagePoints - 階段總點數
   * @param {Number} groupCount - 組數
   * @param {Array} allGroups - 所有組資訊
   * @param {String} currentGroupId - 當前組ID
   * @returns {Array} 所有組的點數分配結果
   */
  function calculateAllGroupsScoring(
    selectedMembers: any,
    targetRank = 1,
    totalStagePoints = 100,
    groupCount = 4,
    allGroups: any[] = [],
    currentGroupId: string | null | undefined = null
  ) {
    // 計算排名權重
    const rankWeights = calculateRankWeights(groupCount)

    // 構建所有組的數據
    const allGroupsData: Array<any> = []

    // 1. 添加我們組（在指定排名）
    const ourGroupMembers = selectedMembers.map((member: Member) => {
      const participationRatio = member.contribution
      const baseWeightUnits = (participationRatio ?? 0) / 5 // 統一使用5%作為基準
      const finalWeight = baseWeightUnits * rankWeights[targetRank]

      return {
        email: member.email,
        displayName: member.displayName,
        participationRatio: participationRatio,
        baseWeightUnits: baseWeightUnits,
        rankMultiplier: rankWeights[targetRank],
        finalWeight: finalWeight,
        points: 0 // 稍後計算
      }
    })

    // Find the current group's data to preserve groupId and groupName
    // Priority: 1) use provided currentGroupId, 2) find from allGroups by matching members, 3) generate placeholder
    let actualGroupId: string | null = currentGroupId
    let currentGroupData = null

    if (!actualGroupId && allGroups.length > 0 && selectedMembers.length > 0) {
      // Try to find the group that contains these members
      const firstMemberEmail = selectedMembers[0]?.email
      currentGroupData = allGroups.find(g =>
        g.members && g.members.some((m: Member) => m.email === firstMemberEmail)
      )
      actualGroupId = currentGroupData?.groupId ?? null
    }

    // If still no groupId found, use a placeholder (never use email as groupId!)
    if (!actualGroupId) {
      actualGroupId = `placeholder_current_group` as string
      console.warn('[calculateAllGroupsScoring] No groupId found, using placeholder')
    }

    // Find group data if not already found
    if (!currentGroupData && actualGroupId) {
      currentGroupData = allGroups.find(g => g.groupId === actualGroupId)
    }

    allGroupsData.push({
      rank: targetRank,
      isCurrentGroup: true,
      groupId: actualGroupId,
      groupName: currentGroupData?.groupName || actualGroupId || '我們組',
      members: ourGroupMembers
    })

    // 2. 添加其他組（假設均分）
    let addedGroups = 1

    // 基於實際的 allGroups 數據添加其他組
    allGroups.forEach(group => {
      if (group.groupId !== currentGroupId && group.status === 'active' && addedGroups < groupCount) {
        // ✅ FIX: Trust the rank from provided group data, only fallback if missing
        const rank = group.rank || (addedGroups + 1)

        // ✅ FIX: Skip if this rank conflicts with targetRank (our simulated position)
        if (rank === targetRank) {
          return  // Skip this group, it conflicts with our simulated rank
        }

        // ✅ FIX: Skip if rank is out of bounds
        if (rank <= 0 || rank > groupCount) {
          return
        }

        const members = []

        // ✅ FIX: Use real member data from group.members if available
        if (group.members && Array.isArray(group.members) && group.members.length > 0) {
          // Use real member data with actual names and contributions
          group.members.forEach((member: any, i: number) => {
            const contribution = member.contribution || member.participationRatio || Math.floor(100 / group.members.length)
            const baseWeightUnits = contribution / 5
            const finalWeight = baseWeightUnits * rankWeights[rank]

            members.push({
              email: member.email || `${group.groupId}_member_${i}`,
              displayName: member.displayName || `成員${i + 1}`,
              participationRatio: contribution,
              baseWeightUnits: baseWeightUnits,
              rankMultiplier: rankWeights[rank],
              finalWeight: finalWeight,
              points: 0
            })
          })
        } else {
          // Fallback: Create placeholder members if no real member data
          const memberCount = group.memberCount || 3

          // 計算均分（必須是5%的倍數）
          const basePercentage = Math.floor(100 / memberCount / 5) * 5
          const remainder = 100 - (basePercentage * memberCount)

          for (let i = 0; i < memberCount; i++) {
            let contribution = basePercentage
            if (i < remainder / 5) contribution += 5

            const baseWeightUnits = contribution / 5
            const finalWeight = baseWeightUnits * rankWeights[rank]

            members.push({
              email: `${group.groupId}_member_${i + 1}`,
              displayName: `${group.groupName || '第' + rank + '名組'}成員${i + 1}`,
              participationRatio: contribution,
              baseWeightUnits: baseWeightUnits,
              rankMultiplier: rankWeights[rank],
              finalWeight: finalWeight,
              points: 0
            })
          }
        }

        allGroupsData.push({
          rank: rank,  // ✅ FIX: Use the rank from group data
          isCurrentGroup: false,
          groupId: group.groupId,
          groupName: group.groupName || `第${rank}名組`,  // ✅ FIX: Prefer real name
          members: members
        })

        addedGroups++
      }
    })

    // 如果還有空位，用預設組填補
    while (addedGroups < groupCount) {
      let rank = 1
      while (allGroupsData.some(g => g.rank === rank)) {
        rank++
      }

      if (rank <= groupCount) {
        const members: Array<any> = []
        // 預設3人組，均分
        const contributions = [35, 35, 30] // 總和100%，都是5%的倍數

        contributions.forEach((contribution, i) => {
          const baseWeightUnits = contribution / 5
          const finalWeight = baseWeightUnits * rankWeights[rank]

          members.push({
            email: `team${rank}_member${i + 1}`,
            displayName: `第${rank}名組成員${i + 1}`,
            participationRatio: contribution,
            baseWeightUnits: baseWeightUnits,
            rankMultiplier: rankWeights[rank],
            finalWeight: finalWeight,
            points: 0
          })
        })

        allGroupsData.push({
          rank: rank,
          isCurrentGroup: false,
          groupId: `placeholder_group_${rank}`,
          groupName: `第${rank}名組`,
          members: members
        })

        addedGroups++
      }
    }

    // 計算總權重和分配點數
    let totalWeight = 0
    allGroupsData.forEach(group => {
      group.members.forEach((member: Member) => {
        totalWeight += (member.finalWeight ?? 0)
      })
    })

    const pointsPerWeight = totalStagePoints / totalWeight

    // 分配點數
    allGroupsData.forEach(group => {
      group.members.forEach((member: Member) => {
        member.points = (member.finalWeight ?? 0) * pointsPerWeight
      })
    })

    // 按排名排序
    allGroupsData.sort((a, b) => a.rank - b.rank)

    return allGroupsData
  }

  /**
   * 取得排名對應的顏色
   * @param {Number} rank - 排名
   * @returns {String} 顏色代碼
   */
  function getRankColor(rank: any) {
    const baseColors = [
      '#8FD460', // 檸檬薄荷 (Scheme K Primary) - 第1名
      '#4FBFDB', // 晴空藍 (Scheme K Info) - 第2名
      '#FFB700', // 檸檬黃 (Scheme K Warning) - 第3名
      '#FF7AB3', // 粉紅泡泡糖 (Scheme K Danger) - 第4名
      '#C76892', // 玫瑰灰 (Scheme K Default) - 第5名
      '#70D19F', // 薄荷藍混合 - 第6名
      '#FFD84D', // 亮檸檬黃 - 第7名
      '#E891A5'  // 粉玫瑰混合 - 第8名
    ]
    const colorIndex = (rank - 1) % baseColors.length
    return baseColors[colorIndex]
  }

  return {
    // Computed
    safeSliderMin,

    // Methods
    calculateScoring,
    calculateAllGroupsScoring,
    getRankColor,
    calculateRankWeights
  }
}
