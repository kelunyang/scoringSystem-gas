/**
 * @fileoverview Group data processing composable
 * 群組數據處理 composable
 *
 * 從 ProjectDetail.vue 提取的群組數據邏輯
 * 負責處理群組信息、成員名稱格式化等
 */

import { computed, type Ref } from 'vue'
import type { User, Group } from '@/types'
import { useSudoStore } from '@/stores/sudo'

/** 成員與群組的對應記錄 */
export interface GroupDataUserGroup {
  groupId: string
  userEmail: string
  isActive?: boolean | number
  role?: string
  joinTime?: number | string
}

/** 這裡只讀使用者的顯示與頭像欄位 */
export interface GroupDataUser {
  userEmail: string
  displayName?: string | null
  avatarSeed?: string | null
  avatarStyle?: string | null
  avatarOptions?: string | null
}

/** 專案資料中這個 composable 會讀到的部分 */
export interface GroupDataProject {
  project?: { projectId?: string } | null
  groups?: Group[]
  userGroups?: GroupDataUserGroup[]
  users?: GroupDataUser[]
}

/**
 * 群組數據處理 composable
 * @param {Ref<Object>} projectData - 專案數據 ref
 * @param {Ref<User>} user - 用戶數據 ref
 * @returns {Object} 群組相關計算函數
 */
export function useGroupData(
  projectData: Ref<GroupDataProject | null | undefined>,
  user: Ref<User>
) {

  /**
   * 取得當前用戶所屬的群組資訊
   */
  const currentUserGroup = computed(() => {
    // 添加對 projectData 和 user 本身的 null 檢查
    if (!projectData || !user) {
      return null
    }

    if (!projectData.value) {
      return null
    }

    // 🕵️ 檢查是否為 sudo 模式
    // 注意：projectData 結構是 { project: { projectId: ... }, groups: [...], ... }
    const sudoStore = useSudoStore()
    const isSudoActive = sudoStore.isActive &&
                         sudoStore.projectId === projectData.value?.project?.projectId &&
                         sudoStore.targetUser

    // 🕵️ 使用有效的 email（sudo target 或真實用戶）
    const effectiveEmail = isSudoActive
      ? sudoStore.targetUser!.userEmail
      : (user.value?.email || user.value?.userEmail)

    if (!effectiveEmail) {
      return null
    }
    const userGroups = projectData.value.userGroups || []
    const groups = projectData.value.groups || []

    // 找到當前用戶（或 sudo target）的群組成員記錄（isActive=true）
    const userGroupRecord = userGroups.find(ug =>
      ug.userEmail === effectiveEmail && ug.isActive
    )

    if (!userGroupRecord) {
      return null
    }

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
      .filter(ug => ug.groupId === group.groupId && ug.isActive)
      .map(ug => {
        // 從 users 表獲取真正的 displayName 和 avatar 資訊
        const user = projectData.value?.users?.find(u => u.userEmail === ug.userEmail)
        return {
          email: ug.userEmail,
          userEmail: ug.userEmail, // 兼容性
          displayName: user?.displayName || ug.userEmail.split('@')[0],
          // 來源欄位可為 null，統一收斂成 undefined（消費端只判斷有無）
          avatarSeed: user?.avatarSeed ?? undefined,
          avatarStyle: user?.avatarStyle ?? undefined,
          avatarOptions: user?.avatarOptions ?? undefined,
          role: ug.role,
          joinTime: ug.joinTime
        }
      })

    const result = {
      groupId: group.groupId,
      groupName: group.groupName,
      description: group.description,
      allowChange: group.allowChange,
      members: groupMembers
    }

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
      .filter(ug => ug.groupId === groupId && ug.isActive)
      .map(ug => {
        // 從 users 資料中找到對應的使用者，取得 displayName
        const user = projectData.value?.users?.find(u => u.userEmail === ug.userEmail)
        return user?.displayName || ug.userEmail.split('@')[0]
      })

    console.log(`ℹ️ 群組 ${groupId} 成員:`, members)

    return {
      memberNames: members,
      // groups 表沒有 name 欄位（0001_init_schema.sql:149），原本的 || group.name 是死碼
      groupName: group.groupName
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
  function formatMemberNames(memberNames: string[] | null | undefined) {
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
   * 🕵️ 支援 sudo 模式
   * @returns {Object|null} 群組記錄或 null
   */
  function getCurrentUserGroup() {
    if (!projectData.value?.userGroups) return null

    // 🕵️ 檢查是否為 sudo 模式
    // 注意：projectData 結構是 { project: { projectId: ... }, groups: [...], ... }
    const sudoStore = useSudoStore()
    const isSudoActive = sudoStore.isActive &&
                         sudoStore.projectId === projectData.value?.project?.projectId &&
                         sudoStore.targetUser

    const effectiveEmail = isSudoActive
      ? sudoStore.targetUser!.userEmail
      : user.value?.userEmail

    if (!effectiveEmail) return null

    return projectData.value.userGroups.find(ug =>
      ug.userEmail === effectiveEmail && ug.isActive
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
