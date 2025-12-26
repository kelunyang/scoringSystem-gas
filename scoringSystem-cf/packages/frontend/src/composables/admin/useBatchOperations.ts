/**
 * Batch Operations Composable
 * Handles batch user operations (activate, deactivate, reset password)
 */

import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api/admin'

export function useBatchOperations() {
  // State - Using Set for O(1) lookups instead of Array O(n)
  const selectedUserEmailsSet = ref<Set<string>>(new Set())
  const batchUpdatingStatus = ref(false)
  const batchResettingPassword = ref(false)

  // Computed
  const showBatchActions = computed(() => selectedUserEmailsSet.value.size > 0)

  const selectedCount = computed(() => selectedUserEmailsSet.value.size)

  // Convert Set to Array for API calls
  const selectedUserEmails = computed(() => Array.from(selectedUserEmailsSet.value))

  // Methods - All O(1) operations with Set
  const toggleUserSelection = (userEmail: string) => {
    if (selectedUserEmailsSet.value.has(userEmail)) {
      selectedUserEmailsSet.value.delete(userEmail)
    } else {
      selectedUserEmailsSet.value.add(userEmail)
    }
    // Trigger reactivity by creating new Set
    selectedUserEmailsSet.value = new Set(selectedUserEmailsSet.value)
  }

  const isUserSelected = (userEmail: string): boolean => {
    return selectedUserEmailsSet.value.has(userEmail)
  }

  const toggleSelectAll = (allUsers: Array<{ userEmail: string }>) => {
    if (isAllSelected(allUsers)) {
      selectedUserEmailsSet.value.clear()
    } else {
      selectedUserEmailsSet.value = new Set(allUsers.map(u => u.userEmail))
    }
  }

  const isAllSelected = (allUsers: Array<{ userEmail: string }>): boolean => {
    if (allUsers.length === 0) return false
    return allUsers.every(user => selectedUserEmailsSet.value.has(user.userEmail))
  }

  const isSomeSelected = (allUsers: Array<{ userEmail: string }>): boolean => {
    return selectedUserEmailsSet.value.size > 0 && !isAllSelected(allUsers)
  }

  const clearSelection = () => {
    selectedUserEmailsSet.value.clear()
    selectedUserEmailsSet.value = new Set() // Trigger reactivity
  }

  const batchUpdateStatus = async (status: 'active' | 'inactive') => {
    const userEmails = [...selectedUserEmails.value]

    try {
      const confirmed = await ElMessageBox.confirm(
        `確定要將 ${userEmails.length} 位使用者設為${status === 'active' ? '啟用' : '停用'}嗎？`,
        '批量操作確認',
        {
          confirmButtonText: '確定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      if (!confirmed) return
    } catch {
      return // User cancelled
    }

    batchUpdatingStatus.value = true

    try {
      const response = await adminApi.users.batchUpdateStatus({
        userEmails,
        status
      })

      if (response.success && response.data) {
        const { successCount, failureCount } = response.data

        if (failureCount === 0) {
          ElMessage.success(`成功更新 ${successCount} 位使用者狀態`)
        } else {
          ElMessage.warning(
            `成功: ${successCount}, 失敗: ${failureCount}`,
            { duration: 5000 }
          )
        }

        clearSelection()
        return true
      } else {
        ElMessage.error(`批量操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Batch update status error:', error)
      ElMessage.error('批量操作失敗，請重試')
      return false
    } finally {
      batchUpdatingStatus.value = false
    }
  }

  const batchActivateUsers = async () => {
    return await batchUpdateStatus('active')
  }

  const batchDeactivateUsers = async () => {
    return await batchUpdateStatus('inactive')
  }

  const batchResetPassword = async (newPassword: string) => {
    if (!newPassword || newPassword.length < 8) {
      ElMessage.error('密碼必須至少 8 個字元')
      return false
    }

    const userEmails = [...selectedUserEmails.value]
    batchResettingPassword.value = true

    try {
      const response = await adminApi.users.batchResetPassword({
        userEmails,
        newPassword
      })

      if (response.success && response.data) {
        const { successCount, failureCount } = response.data

        if (failureCount === 0) {
          ElMessage.success(`成功重設 ${successCount} 位使用者密碼，已發送通知郵件`)
        } else {
          ElMessage.warning(
            `成功重設 ${successCount} 位使用者，${failureCount} 位失敗`,
            { duration: 5000 }
          )
        }

        clearSelection()
        return true
      } else {
        ElMessage.error(`批量重設密碼失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Batch reset password error:', error)
      ElMessage.error('批量重設密碼失敗，請重試')
      return false
    } finally {
      batchResettingPassword.value = false
    }
  }

  return {
    // State
    selectedUserEmails,
    batchUpdatingStatus,
    batchResettingPassword,

    // Computed
    showBatchActions,
    selectedCount,

    // Methods
    toggleUserSelection,
    isUserSelected,
    toggleSelectAll,
    isAllSelected,
    isSomeSelected,
    clearSelection,
    batchActivateUsers,
    batchDeactivateUsers,
    batchResetPassword
  }
}
