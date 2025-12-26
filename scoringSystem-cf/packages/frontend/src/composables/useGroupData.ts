/**
 * @fileoverview Group data processing composable
 * 群組數據處理 composable
 *
 * 從 ProjectDetail.vue 提取的群組數據邏輯
 * 負責處理群組信息、成員名稱格式化等
 */

import { computed, type Ref } from 'vue'
import type { User, Group } from '@/types'

/**
 * 群組數據處理 composable
 * @param {Ref<Object>} projectData - 專案數據 ref
 * @param {Ref<User>} user - 用戶數據 ref
 * @returns {Object} 群組相關計算函數
 */
export function useGroupData(projectData: any, user: Ref<User>) {
  console.log('🔧 [useGroupData] composable 初始化')

  /**
   * 取得當前用戶所屬的群組資訊
   */
  const currentUserGroup = computed(() => {
    // 添加對 projectData 和 user 本身的 null 檢查
    if (!projectData || !user) {
      return null
    }

    console.log('currentUserGroup 檢查:', {
      hasProjectData: !!projectData.value,
      user: user.value,
      userEmail: user.value?.email,
      userUserEmail: user.value?.userEmail
    })

    if (!projectData.value || (!user.value?.email && !user.value?.userEmail)) {
      console.log('currentUserGroup: 缺少 projectData 或 user email')
      return null
    }

    const userEmail = user.value.email || user.value.userEmail
    const userGroups = projectData.value.userGroups || []
    const groups = projectData.value.groups || []

    console.log('currentUserGroup 調試:', {
      userEmail,
      userGroupsCount: userGroups.length,
      groupsCount: groups.length,
      userGroups: userGroups.map((ug: any) => ({
        userEmail: ug.userEmail,
        groupId: ug.groupId,
        isActive: ug.isActive
      })),
      groups: groups.map((g: Group) => ({
        groupId: g.groupId,
        groupName: g.groupName,
        status: g.status
      }))
    })

    // 找到當前用戶的群組成員記錄（isActive=true）
    const userGroupRecord = userGroups.find((ug: any) =>
      ug.userEmail === userEmail && ug.isActive
    )

    if (!userGroupRecord) {
      console.log('currentUserGroup: 找不到用戶的群組記錄')
      return null
    }

    console.log('找到用戶群組記錄:', userGroupRecord)

    // 找到對應的群組
    const group = groups.find((g: Group) =>
      g.groupId === userGroupRecord.groupId && g.status === 'active'
    )

    if (!group) {
      console.log('currentUserGroup: 找不到對應的群組')
      return null
    }

    console.log('找到對應群組:', group)

    // 取得該群組的所有成員
    const groupMembers = userGroups
      .filter((ug: any) => ug.groupId === group.groupId && ug.isActive)
      .map((ug: any) => {
        // 從 users 表獲取真正的 displayName 和 avatar 資訊
        const user = projectData.value.users?.find((u: any) => u.userEmail === ug.userEmail)
        return {
          email: ug.userEmail,
          userEmail: ug.userEmail, // 兼容性
          displayName: user?.displayName || ug.userEmail.split('@')[0],
          avatarSeed: user?.avatarSeed,
          avatarStyle: user?.avatarStyle,
          avatarOptions: user?.avatarOptions,
          role: ug.role,
          joinTime: ug.joinTime
        }
      })

    console.log('群組成員列表:', groupMembers)

    const result = {
      groupId: group.groupId,
      groupName: group.groupName,
      description: group.description,
      allowChange: group.allowChange,
      members: groupMembers
    }

    console.log('currentUserGroup 最終結果:', result)
    return result
  })

  /**
   * 從專案數據中獲取群組資訊
   * @param {string} groupId - 群組 ID
   * @returns {Object} 群組信息（包含成員名稱）
   */
  function getGroupInfo(groupId: string) {
    if (!projectData.value || !projectData.value.groups || !projectData.value.userGroups) {
      console.warn('⚠️ getGroupInfo: 缺少專案數據', { projectData: projectData.value })
      return { memberNames: [] }
    }

    // 找到群組資訊
    const group = projectData.value.groups.find((g: Group) => g.groupId === groupId)
    if (!group) {
      console.warn('⚠️ getGroupInfo: 找不到群組', {
        groupId,
        availableGroups: projectData.value.groups.map((g: Group) => g.groupId)
      })
      return { memberNames: [] }
    }

    // 找到群組成員
    const members = projectData.value.userGroups
      .filter((ug: any) => ug.groupId === groupId && ug.isActive)
      .map((ug: any) => {
        // 從 users 資料中找到對應的使用者，取得 displayName
        const user = projectData.value.users?.find((u: any) => u.userEmail === ug.userEmail)
        return user?.displayName || ug.userEmail.split('@')[0]
      })

    console.log(`ℹ️ 群組 ${groupId} 成員:`, members)

    return {
      memberNames: members,
      groupName: group.groupName || group.name
    }
  }

  /**
   * 檢查是否為當前用戶的群組
   * @param {Object} group - 群組對象
   * @returns {boolean}
   */
  function isCurrentUserGroup(group: Group) {
    if (!currentUserGroup.value || !group) {
      return false
    }
    return currentUserGroup.value.groupId === group.groupId
  }

  /**
   * 格式化成員名稱顯示
   * @param {Array<string>} memberNames - 成員名稱陣列
   * @returns {string} 格式化後的名稱字串
   */
  function formatMemberNames(memberNames: any) {
    if (!memberNames || memberNames.length === 0) {
      return '無成員'
    }

    const joined = memberNames.join('、')
    const maxLength = 30

    if (joined.length <= maxLength) {
      return joined
    }

    // 超出長度，顯示部分成員 + "等N人"
    let display = ''
    let count = 0

    for (const name of memberNames) {
      const testDisplay = count === 0 ? name : display + '、' + name
      if (testDisplay.length > maxLength - 6) { // 預留 "等N人" 的空間
        break
      }
      display = testDisplay
      count++
    }

    const remaining = memberNames.length - count
    return remaining > 0 ? `${display}等${memberNames.length}人` : display
  }

  /**
   * 獲取當前用戶所屬群組（非響應式版本）
   * @returns {Object|null} 群組記錄或 null
   */
  function getCurrentUserGroup() {
    if (!projectData.value?.userGroups || !user.value?.userEmail) return null

    return projectData.value.userGroups.find((ug: any) =>
      ug.userEmail === user.value.userEmail && ug.isActive
    )
  }

  return {
    // 響應式計算屬性
    currentUserGroup,

    // 工具函數
    getGroupInfo,
    isCurrentUserGroup,
    formatMemberNames,
    getCurrentUserGroup
  }
}
