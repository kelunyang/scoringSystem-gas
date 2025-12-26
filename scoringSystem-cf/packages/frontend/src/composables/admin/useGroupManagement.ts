/**
 * Group Management Composable
 * Handles global group operations and user-group assignments
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import type { GlobalGroup } from '@repo/shared/types'

export function useGroupManagement() {
  // State
  const groups = ref<GlobalGroup[]>([])
  const loading = ref(false)
  const operationLoading = ref(false)

  // Computed
  const stats = computed(() => {
    return {
      total: groups.value.length,
      active: groups.value.filter(g => g.status === 'active').length,
      inactive: groups.value.filter(g => g.status === 'inactive').length
    }
  })

  const activeGroups = computed(() => {
    return groups.value.filter(g => g.status === 'active')
  })

  // Methods
  const loadGroups = async () => {
    loading.value = true
    try {
      const response = await adminApi.groups.list({})

      if (response.success && response.data) {
        groups.value = response.data
      } else {
        console.error('Failed to load groups:', response.error)
        groups.value = []
        ElMessage.error(`無法載入群組: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error loading groups:', error)
      groups.value = []
      ElMessage.error('載入群組失敗，請重試')
    } finally {
      loading.value = false
    }
  }

  const createGroup = async (params: {
    groupName: string
    description?: string
    permissions: string[]
  }) => {
    if (!params.groupName || params.groupName.trim().length === 0) {
      ElMessage.error('群組名稱不能為空')
      return false
    }

    if (params.permissions.length === 0) {
      ElMessage.error('至少需要選擇一項權限')
      return false
    }

    operationLoading.value = true
    try {
      const response = await adminApi.groups.create({
        groupName: params.groupName.trim(),
        description: params.description,
        globalPermissions: params.permissions
      })

      if (response.success) {
        ElMessage.success('群組建立成功')
        await loadGroups() // Refresh list
        return true
      } else {
        ElMessage.error(`建立失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Create group error:', error)
      ElMessage.error('建立群組失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const updateGroup = async (params: {
    globalGroupId: string
    groupName?: string
    description?: string
    permissions?: string[]
  }) => {
    operationLoading.value = true
    try {
      const response = await adminApi.groups.update({
        globalGroupId: params.globalGroupId,
        groupName: params.groupName,
        description: params.description,
        globalPermissions: params.permissions
      })

      if (response.success) {
        ElMessage.success('群組更新成功')
        await loadGroups() // Refresh list
        return true
      } else {
        ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Update group error:', error)
      ElMessage.error('更新群組失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const deleteGroup = async (globalGroupId: string) => {
    operationLoading.value = true
    try {
      const response = await adminApi.groups.delete({
        globalGroupId
      })

      if (response.success) {
        ElMessage.success('群組已刪除')
        await loadGroups() // Refresh list
        return true
      } else {
        ElMessage.error(`刪除失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Delete group error:', error)
      ElMessage.error('刪除群組失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const toggleGroupStatus = async (globalGroupId: string, newStatus: 'active' | 'inactive') => {
    operationLoading.value = true
    try {
      const response = await adminApi.groups.updateStatus({
        globalGroupId,
        status: newStatus
      })

      if (response.success) {
        ElMessage.success(`群組已${newStatus === 'active' ? '啟用' : '停用'}`)
        await loadGroups() // Refresh list
        return true
      } else {
        ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Toggle group status error:', error)
      ElMessage.error('操作失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const assignUserToGroup = async (params: {
    userEmail: string
    globalGroupId: string
  }) => {
    operationLoading.value = true
    try {
      const response = await adminApi.groups.assignUser({
        userEmail: params.userEmail,
        globalGroupId: params.globalGroupId
      })

      if (response.success) {
        ElMessage.success('用戶已加入群組')
        return true
      } else {
        ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Assign user to group error:', error)
      ElMessage.error('加入群組失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const removeUserFromGroup = async (params: {
    userEmail: string
    globalGroupId: string
  }) => {
    operationLoading.value = true
    try {
      const response = await adminApi.groups.removeUser({
        userEmail: params.userEmail,
        globalGroupId: params.globalGroupId
      })

      if (response.success) {
        ElMessage.success('用戶已從群組移除')
        return true
      } else {
        ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Remove user from group error:', error)
      ElMessage.error('移除失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  const batchAssignUsers = async (params: {
    userEmails: string[]
    globalGroupId: string
  }) => {
    if (params.userEmails.length === 0) {
      ElMessage.error('請選擇至少一位用戶')
      return false
    }

    operationLoading.value = true
    try {
      const response = await adminApi.groups.batchAssignUsers({
        userEmails: params.userEmails,
        globalGroupId: params.globalGroupId
      })

      if (response.success && response.data) {
        const { successCount, failureCount } = response.data

        if (failureCount === 0) {
          ElMessage.success(`成功將 ${successCount} 位用戶加入群組`)
        } else {
          ElMessage.warning(
            `成功: ${successCount}, 失敗: ${failureCount}`,
            { duration: 5000 }
          )
        }
        return true
      } else {
        ElMessage.error(`批量操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Batch assign users error:', error)
      ElMessage.error('批量操作失敗，請重試')
      return false
    } finally {
      operationLoading.value = false
    }
  }

  // Helper functions
  const getGroupById = (globalGroupId: string): GlobalGroup | undefined => {
    return groups.value.find(g => g.globalGroupId === globalGroupId)
  }

  const hasPermission = (group: GlobalGroup, permission: string): boolean => {
    if (!group.globalPermissions) return false

    try {
      const permissions = typeof group.globalPermissions === 'string'
        ? JSON.parse(group.globalPermissions)
        : group.globalPermissions

      // Ensure permissions is an array
      if (!Array.isArray(permissions)) {
        console.warn('globalPermissions is not an array:', group.globalGroupId)
        return false
      }

      return permissions.includes(permission)
    } catch (error) {
      console.error('Failed to parse globalPermissions:', error, group.globalGroupId)
      return false
    }
  }

  const parsePermissions = (permissions: string | string[]): string[] => {
    if (typeof permissions === 'string') {
      try {
        return JSON.parse(permissions)
      } catch {
        return []
      }
    }
    return permissions || []
  }

  return {
    // State
    groups,
    loading,
    operationLoading,

    // Computed
    stats,
    activeGroups,

    // Methods
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroupStatus,
    assignUserToGroup,
    removeUserFromGroup,
    batchAssignUsers,

    // Helpers
    getGroupById,
    hasPermission,
    parsePermissions
  }
}
