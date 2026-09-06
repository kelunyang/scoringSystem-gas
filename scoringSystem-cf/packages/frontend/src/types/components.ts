/**
 * @fileoverview 圖表互動用的共享型別
 */

/**
 * 成员信息接口 (用于贡献度计算)
 */
export interface Member {
  email: string
  displayName: string
  contribution: number
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
