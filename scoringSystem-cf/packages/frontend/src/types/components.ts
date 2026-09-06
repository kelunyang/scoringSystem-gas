/**
 * @fileoverview 圖表互動用的共享型別
 */

/**
 * 成员信息接口 (用于贡献度计算)
 *
 * 圖表點擊事件會把「已結算的組員」與「模擬計算出來的組員」都塞進來，
 * 兩者欄位不完全一致，所以除了 email 之外都是選填。
 */
export interface Member {
  email: string
  displayName?: string
  contribution?: number
  points?: number
  finalWeight?: number
}

/**
 * 组别点击事件数据接口 (用于图表交互)
 */
export interface GroupClickData {
  groupId: string
  groupName: string
  rank: number
  points: number
  members: Member[]
  allGroupMembers: Member[]
}
