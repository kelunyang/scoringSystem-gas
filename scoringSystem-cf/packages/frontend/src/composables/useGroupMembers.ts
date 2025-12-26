import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { adminApi } from '@/api/admin'
import type { ApiResponse } from '@/utils/api-helpers'

/**
 * Group member data
 */
export interface GroupMemberData {
  userEmail: string
  displayName?: string
  avatarSeed?: string
  avatarStyle?: string
  role?: 'leader' | 'member'
  tags?: string[]
}

/**
 * Project viewer data
 */
export interface ProjectViewer {
  userEmail: string
  displayName: string
  role: 'admin' | 'teacher' | 'observer' | 'member'
  avatarSeed?: string
  avatarStyle?: string
}

/**
 * Available user for groups
 */
export interface AvailableUser {
  userId: string
  userEmail: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
  tags: string[]
}

/**
 * Global group members response
 */
export interface GlobalGroupMembersResponse {
  members: GroupMemberData[]
}

/**
 * Project group details response
 */
export interface ProjectGroupDetailsResponse {
  members: GroupMemberData[]
  groupInfo?: any
}

/**
 * Batch add users response
 */
export interface BatchAddUsersResponse {
  successCount: number
  failedCount?: number
  errors?: string[]
}

/**
 * Composable for managing group members (both global and project groups)
 * @returns {Object} Group member management state and methods
 */
export function useGroupMembers() {
  // State
  const groupMembers: Ref<GroupMemberData[]> = ref([])
  const loadingGlobalGroupMembers: Ref<Set<string>> = ref(new Set())
  const loadingProjectGroupMembers: Ref<Set<string>> = ref(new Set())
  const globalGroupMembersMap: Ref<Map<string, GroupMemberData[]>> = ref(new Map())
  const projectGroupMembersMap: Ref<Map<string, GroupMemberData[]>> = ref(new Map())
  const addingMemberForGlobalGroup: Ref<string | null> = ref(null)
  const addingMemberForProjectGroup: Ref<string | null> = ref(null)
  const addingMember: Ref<boolean> = ref(false)
  const removingMemberEmail: Ref<string> = ref('')
  const selectedMembers: Ref<string[]> = ref([])
  const selectedUsersToAdd: Ref<string[]> = ref([])
  const allUsers: Ref<AvailableUser[]> = ref([])

  /**
   * Load all users (from project viewers with role='member')
   * @param {string} projectId - Project ID for filtering users
   */
  const loadAllUsers = async (projectId?: string): Promise<void> => {
    try {
      if (!projectId) {
        console.warn('No project selected, cannot load users')
        allUsers.value = []
        return
      }

      const httpResponse = await rpcClient.projects.viewers.list.$post({
        json: {
          projectId: projectId
        }
      })
      const response = await httpResponse.json() as ApiResponse<ProjectViewer[]>

      if (response.success && response.data) {
        // Filter users with role='member'
        allUsers.value = response.data
          .filter(viewer => viewer.role === 'member')
          .map(viewer => ({
            userId: viewer.userEmail,
            userEmail: viewer.userEmail,
            displayName: viewer.displayName,
            avatarSeed: viewer.avatarSeed,
            avatarStyle: viewer.avatarStyle,
            tags: []
          }))
      }
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  /**
   * Load global group members
   * @param {string} groupId - Group ID
   */
  const loadGlobalGroupMembers = async (groupId: string): Promise<void> => {
    try {
      const response = await adminApi.globalGroups.members(groupId)

      if (response.success && response.data) {
        groupMembers.value = response.data.members || []
        ElMessage.success(`成員列表載入完成（${response.data.members.length} 人）`)
      } else {
        ElMessage.error(`無法載入群組成員: ${!response.success ? response.error?.message : '未知錯誤'}`)
        groupMembers.value = []
      }
    } catch (error) {
      console.error('Error loading global group members:', error)
      ElMessage.error('載入成員資料失敗，請重試')
      groupMembers.value = []
    }
  }

  /**
   * Load global group members inline (for expansion)
   * @param {string} groupId - Group ID
   */
  const loadGlobalGroupMembersInline = async (groupId: string): Promise<void> => {
    loadingGlobalGroupMembers.value.add(groupId)
    try {
      const response = await adminApi.globalGroups.members(groupId)

      if (response.success && response.data) {
        globalGroupMembersMap.value.set(groupId, response.data.members || [])
      }
    } catch (error) {
      console.error('Error loading global group members:', error)
      ElMessage.error('載入成員列表失敗')
    } finally {
      loadingGlobalGroupMembers.value.delete(groupId)
    }
  }

  /**
   * Load project group members inline (for expansion)
   * @param {string} projectId - Project ID
   * @param {string} groupId - Group ID
   */
  const loadProjectGroupMembersInline = async (projectId: string, groupId: string): Promise<void> => {
    loadingProjectGroupMembers.value.add(groupId)
    try {
      const httpResponse = await rpcClient.groups.details.$post({
        json: {
          projectId: projectId,
          groupId: groupId
        }
      })
      const response = await httpResponse.json() as ApiResponse<ProjectGroupDetailsResponse>

      if (response.success && response.data) {
        projectGroupMembersMap.value.set(groupId, response.data.members || [])
      }
    } catch (error) {
      console.error('Error loading project group members:', error)
      ElMessage.error('載入成員列表失敗')
    } finally {
      loadingProjectGroupMembers.value.delete(groupId)
    }
  }

  /**
   * Open global add member form
   * @param {string} groupId - Group ID
   */
  const openGlobalAddMemberForm = async (groupId: string): Promise<void> => {
    addingMemberForGlobalGroup.value = groupId
    selectedUsersToAdd.value = []
    if (allUsers.value.length === 0) {
      await loadAllUsers()
    }
  }

  /**
   * Open project add member form
   * @param {string} groupId - Group ID
   * @param {string} projectId - Project ID (needed for loading users)
   */
  const openProjectAddMemberForm = async (groupId: string, projectId: string): Promise<void> => {
    addingMemberForProjectGroup.value = groupId
    selectedUsersToAdd.value = []
    if (allUsers.value.length === 0) {
      await loadAllUsers(projectId)
    }
  }

  /**
   * Cancel global add member
   */
  const cancelGlobalAddMember = (): void => {
    addingMemberForGlobalGroup.value = null
    selectedUsersToAdd.value = []
  }

  /**
   * Cancel project add member
   */
  const cancelProjectAddMember = (): void => {
    addingMemberForProjectGroup.value = null
    selectedUsersToAdd.value = []
  }

  /**
   * Add selected members to global group
   * @param {string} groupId - Group ID
   * @param {Function} onSuccess - Callback on success
   */
  const addSelectedMembersToGlobalGroup = async (groupId: string, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    if (selectedUsersToAdd.value.length === 0) {
      ElMessage.warning('請先選擇要新增的用戶')
      return false
    }

    try {
      addingMember.value = true

      const response = await adminApi.globalGroups.batchAddUsers({
        groupId,
        userEmails: selectedUsersToAdd.value
      })

      if (response.success && response.data) {
        const { successCount } = response.data
        ElMessage.success(`成功新增 ${successCount} 個成員`)

        // Clear selections
        selectedUsersToAdd.value = []

        // Reload members
        await loadGlobalGroupMembersInline(groupId)

        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`新增成員失敗: ${!response.success ? response.error?.message : '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error adding members to global group:', error)
      ElMessage.error('新增成員時發生錯誤')
      return false
    } finally {
      addingMember.value = false
    }
  }

  /**
   * Add selected members to project group
   * @param {string} projectId - Project ID
   * @param {string} groupId - Group ID
   * @param {string} role - Member role (member/leader)
   * @param {Function} onSuccess - Callback on success
   */
  const addSelectedMembersToProjectGroup = async (projectId: string, groupId: string, role: 'member' | 'leader', onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    if (selectedUsersToAdd.value.length === 0) {
      ElMessage.warning('請先選擇要新增的用戶')
      return false
    }

    try {
      addingMember.value = true

      // Use batch API instead of individual requests
      const httpResponse = await rpcClient.groups['batch-add-members'].$post({
        json: {
          projectId: projectId,
          groupId: groupId,
          members: selectedUsersToAdd.value.map(email => ({
            userEmail: email,
            role: role
          }))
        }
      })
      const response = await httpResponse.json() as ApiResponse<{ successCount: number; addedMembers?: Array<{ userEmail: string }> }>

      if (response.success) {
        const data = response.data || {}
        const successCount = data.successCount || data.addedMembers?.length || selectedUsersToAdd.value.length

        ElMessage.success(`成功新增 ${successCount} 個成員`)

        // Clear selections
        selectedUsersToAdd.value = []

        // Reload members
        await loadProjectGroupMembersInline(projectId, groupId)

        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(response.error?.message || '新增成員失敗')
        return false
      }
    } catch (error) {
      console.error('Error adding members to project group:', error)
      ElMessage.error('新增成員時發生錯誤')
      return false
    } finally {
      addingMember.value = false
    }
  }

  /**
   * Remove member from global group
   * @param {Object} member - Member object with userEmail
   * @param {string} groupId - Group ID
   * @param {Function} onSuccess - Callback on success
   */
  const removeMemberFromGlobalGroup = async (member: GroupMemberData, groupId: string, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    try {
      removingMemberEmail.value = member.userEmail

      const response = await adminApi.globalGroups.removeUser({
        groupId,
        userEmail: member.userEmail
      })

      if (response.success) {
        ElMessage.success('成員移除成功')

        // Reload members
        await loadGlobalGroupMembersInline(groupId)

        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`移除成員失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error removing member from global group:', error)
      ElMessage.error('移除成員失敗')
      return false
    } finally {
      removingMemberEmail.value = ''
    }
  }

  /**
   * Remove member from project group
   * @param {Object} member - Member object with userEmail
   * @param {string} projectId - Project ID
   * @param {string} groupId - Group ID
   * @param {Function} onSuccess - Callback on success
   */
  const removeMemberFromProjectGroup = async (member: GroupMemberData, projectId: string, groupId: string, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    try {
      removingMemberEmail.value = member.userEmail

      const httpResponse = await rpcClient.groups.removeMember.$post({
        json: {
          projectId: projectId,
          groupId: groupId,
          userEmail: member.userEmail
        }
      })
      const response = await httpResponse.json() as ApiResponse<void>

      if (response.success) {
        ElMessage.success('成員移除成功')

        // Reload members
        await loadProjectGroupMembersInline(projectId, groupId)

        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`移除成員失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error removing member from project group:', error)
      ElMessage.error('移除成員失敗')
      return false
    } finally {
      removingMemberEmail.value = ''
    }
  }

  /**
   * Batch remove members from global group
   * @param {string} groupId - Group ID
   * @param {Array<string>} userEmails - Array of user emails to remove
   * @param {Function} onSuccess - Callback on success
   */
  const batchRemoveMembersFromGlobalGroup = async (groupId: string, userEmails: string[], onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    if (userEmails.length === 0) {
      ElMessage.warning('請先選擇要移除的成員')
      return false
    }

    try {
      const response = await adminApi.globalGroups.batchRemoveUsers({
        groupId,
        userEmails
      })

      if (response.success && response.data) {
        const { successCount } = response.data
        ElMessage.success(`成功移除 ${successCount} 人`)

        // Clear selections
        selectedMembers.value = []

        // Reload members
        await loadGlobalGroupMembers(groupId)

        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error('移除成員失敗')
        return false
      }
    } catch (error) {
      console.error('Error batch removing members:', error)
      ElMessage.error('移除成員失敗，請重試')
      return false
    }
  }

  /**
   * Toggle member selection
   * @param {string} userEmail - User email
   */
  const toggleMemberSelection = (userEmail: string): void => {
    const index = selectedMembers.value.indexOf(userEmail)
    if (index > -1) {
      selectedMembers.value.splice(index, 1)
    } else {
      selectedMembers.value.push(userEmail)
    }
  }

  /**
   * Toggle all members selection
   * @param {boolean} checked - Whether to select all
   */
  const toggleAllMembers = (checked: boolean): void => {
    if (checked) {
      selectedMembers.value = groupMembers.value.map(m => m.userEmail)
    } else {
      selectedMembers.value = []
    }
  }

  /**
   * Toggle user selection for adding
   * @param {string} userEmail - User email
   */
  const toggleUserSelection = (userEmail: string): void => {
    const index = selectedUsersToAdd.value.indexOf(userEmail)
    if (index > -1) {
      selectedUsersToAdd.value.splice(index, 1)
    } else {
      selectedUsersToAdd.value.push(userEmail)
    }
  }

  /**
   * Remove selected user from selection
   * @param {string} userEmail - User email
   */
  const removeSelectedUser = (userEmail: string): void => {
    const index = selectedUsersToAdd.value.indexOf(userEmail)
    if (index > -1) {
      selectedUsersToAdd.value.splice(index, 1)
    }
  }

  /**
   * Clear all selected users
   */
  const clearSelectedUsers = (): void => {
    selectedUsersToAdd.value = []
  }

  /**
   * Check if user is already member of global group
   * @param {string} userEmail - User email
   * @param {string} groupId - Group ID
   * @returns {boolean}
   */
  const isUserAlreadyMemberOfGlobalGroup = (userEmail: string, groupId: string): boolean => {
    const members = globalGroupMembersMap.value.get(groupId) || []
    return members.some(m => m.userEmail === userEmail)
  }

  /**
   * Check if user is already member of project group
   * @param {string} userEmail - User email
   * @param {string} groupId - Group ID
   * @returns {boolean}
   */
  const isUserAlreadyMemberOfProjectGroup = (userEmail: string, groupId: string): boolean => {
    const members = projectGroupMembersMap.value.get(groupId) || []
    return members.some(m => m.userEmail === userEmail)
  }

  /**
   * Custom filter method for el-select
   * @param {string} query - Search query
   * @param {Object} option - Option object
   * @returns {boolean}
   */
  const filterUsers = (query: string, option: { value: string }): boolean => {
    if (!query) return true

    const user = allUsers.value.find(u => u.userEmail === option.value)
    if (!user) return false

    const searchLower = query.toLowerCase()
    const displayName = (user.displayName || '').toLowerCase()
    const userEmail = (user.userEmail || '').toLowerCase()

    return displayName.includes(searchLower) || userEmail.includes(searchLower)
  }

  return {
    // State
    groupMembers,
    loadingGlobalGroupMembers,
    loadingProjectGroupMembers,
    globalGroupMembersMap,
    projectGroupMembersMap,
    addingMemberForGlobalGroup,
    addingMemberForProjectGroup,
    addingMember,
    removingMemberEmail,
    selectedMembers,
    selectedUsersToAdd,
    allUsers,

    // Methods
    loadAllUsers,
    loadGlobalGroupMembers,
    loadGlobalGroupMembersInline,
    loadProjectGroupMembersInline,
    openGlobalAddMemberForm,
    openProjectAddMemberForm,
    cancelGlobalAddMember,
    cancelProjectAddMember,
    addSelectedMembersToGlobalGroup,
    addSelectedMembersToProjectGroup,
    removeMemberFromGlobalGroup,
    removeMemberFromProjectGroup,
    batchRemoveMembersFromGlobalGroup,
    toggleMemberSelection,
    toggleAllMembers,
    toggleUserSelection,
    removeSelectedUser,
    clearSelectedUsers,
    isUserAlreadyMemberOfGlobalGroup,
    isUserAlreadyMemberOfProjectGroup,
    filterUsers
  }
}
