/**
 * User Management Composable
 * Handles user CRUD operations, filtering, and status management
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import type { User } from '@repo/shared'
import { isUserLocked, getLockStatusText } from '@/utils/userStatus'

export function useUserManagement() {
  // State - Using individual refs for better reactivity (Evan You style)
  const users = ref<User[]>([])
  const loading = ref(false)
  const searchText = ref('')
  const statusFilter = ref<'' | 'active' | 'inactive'>('')

  // Computed
  const stats = computed(() => {
    const usersArray = users.value ?? []
    return {
      totalUsers: usersArray.length,
      activeUsers: usersArray.filter(u => u?.status === 'active').length,
      inactiveUsers: usersArray.filter(u => u?.status === 'inactive').length
    }
  })

  const filteredUsers = computed(() => {
    let filtered = users.value ?? []

    // Search filter
    if (searchText.value) {
      const search = searchText.value.toLowerCase()
      filtered = filtered.filter(user =>
        user?.userEmail?.toLowerCase().includes(search) ||
        user?.displayName?.toLowerCase().includes(search)
      )
    }

    // Status filter
    if (statusFilter.value) {
      filtered = filtered.filter(user => user?.status === statusFilter.value)
    }

    // Sort by registration time (newest first)
    return filtered.sort((a, b) => {
      const aTime = a?.registrationTime ?? 0
      const bTime = b?.registrationTime ?? 0
      return bTime - aTime
    })
  })

  // Methods
  const loadUsers = async () => {
    loading.value = true
    try {
      ElMessage.info('開始更新使用者列表')

      // Vue 3 Best Practice: rpcClient automatically handles authentication
      if (!sessionId) {
        console.error('No session found')
        users.value = []
        return
      }

      const response = await adminApi.users.list({})

      if (response.success && response.data) {
        users.value = response.data
        ElMessage.success('使用者列表資料下載完成')
      } else {
        console.error('Failed to load users:', response.error)
        users.value = []
        ElMessage.error(`無法載入使用者資料: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error loading users:', error)
      users.value = []
      ElMessage.error('載入使用者資料失敗，請重試')
    } finally {
      loading.value = false
    }
  }

  const toggleUserStatus = async (user: User) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active'

      const response = await adminApi.users.updateStatus({
        userEmail: user.userEmail,
        status: newStatus
      })

      if (response.success) {
        user.status = newStatus
        ElMessage.success(`用戶狀態已${newStatus === 'active' ? '啟用' : '停用'}`)
      } else {
        ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Toggle user status error:', error)
      ElMessage.error('操作失敗，請重試')
    }
  }

  const resetPassword = async (userEmail: string, newPassword: string) => {
    try {
      const response = await adminApi.users.resetPassword({
        userEmail,
        newPassword
      })

      if (response.success) {
        ElMessage.success('密碼重設成功')
        return true
      } else {
        ElMessage.error(`密碼重設失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Password reset error:', error)
      ElMessage.error('密碼重設失敗，請重試')
      return false
    }
  }

  const unlockUser = async (userEmail: string, unlockReason: string, resetLockCount: boolean) => {
    try {
      const response = await adminApi.users.unlock({
        userEmail,
        unlockReason,
        resetLockCount
      })

      if (response.success) {
        ElMessage.success(`帳戶已解鎖：${userEmail}`)
        await loadUsers() // Refresh user list
        return true
      } else {
        if (response.error?.code === 'USER_NOT_LOCKED') {
          ElMessage.error('該使用者帳戶目前並未被鎖定')
        } else if (response.error?.code === 'USER_NOT_FOUND') {
          ElMessage.error('找不到該使用者')
        } else {
          ElMessage.error(`解鎖失敗: ${response.error?.message || '未知錯誤'}`)
        }
        return false
      }
    } catch (error) {
      console.error('Unlock user error:', error)
      ElMessage.error('解鎖失敗，請重試')
      return false
    }
  }

  return {
    // State
    users,
    loading,
    searchText,
    statusFilter,

    // Computed
    stats,
    filteredUsers,

    // Methods
    loadUsers,
    toggleUserStatus,
    resetPassword,
    unlockUser,

    // Helpers (re-exported from utils for convenience)
    isUserLocked,
    getLockStatusText
  }
}
