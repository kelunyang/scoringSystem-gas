import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'

/**
 * Composable for managing project viewers (access control)
 * @returns {Object} Project viewers management state and methods
 */
export function useProjectViewers() {
  // State
  const projectViewers = ref<any[]>([])
  const loadingViewers = ref(false)
  const searchingUsers = ref(false)
  const searchResults = ref<any[]>([])
  const selectedUsers = ref<any[]>([])
  const selectedViewers = ref<any[]>([])

  /**
   * Load project viewers for a specific project
   * @param {string} projectId - Project ID
   */
  const loadProjectViewers = async (projectId: string) => {
    if (!projectId) {
      console.error('No project ID provided')
      return
    }

    loadingViewers.value = true
    try {
      const httpResponse = await rpcClient.projects.viewers.list.$post({
        json: { projectId }
      })
      const response = await httpResponse.json()

      if (response.success && response.data) {
        projectViewers.value = response.data
      } else {
        console.error('Failed to load project viewers:', response.error)
        ElMessage.error(`無法載入存取者清單: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error loading project viewers:', error)
      ElMessage.error('載入存取者清單失敗')
    } finally {
      loadingViewers.value = false
    }
  }

  /**
   * Search for users by query (supports multiple lines)
   * @param {string} searchText - Search query text
   */
  const searchUsers = async (searchText: any) => {
    if (!searchText.trim()) {
      ElMessage.warning('請輸入搜尋內容')
      return
    }

    try {
      searchingUsers.value = true

      // 按行分割搜尋文字，支援多行輸入
      const searchQueries = searchText
        .split('\n')
        .map((line: any) => line.trim())
        .filter((line: any) => line.length > 0)

      if (searchQueries.length === 0) {
        ElMessage.warning('請輸入搜尋內容')
        searchingUsers.value = false
        return
      }

      // 對每一行執行搜尋
      const allResults = []
      const errors = []

      for (const query of searchQueries) {
        try {
          const httpResponse = await rpcClient.users.search.$post({
            json: { query, limit: 50 }
          })
          const response = await httpResponse.json()

          if (response.success && response.data) {
            allResults.push(...response.data)
          } else {
            errors.push(`搜尋「${query}」失敗: ${response.error?.message || '未知錯誤'}`)
          }
        } catch (error) {
          console.error(`Error searching for "${query}":`, error)
          errors.push(`搜尋「${query}」時發生錯誤`)
        }
      }

      // 去重（基於 userEmail）
      const uniqueResults = []
      const seenEmails = new Set()

      for (const user of allResults) {
        if (!seenEmails.has(user.userEmail)) {
          seenEmails.add(user.userEmail)
          uniqueResults.push(user)
        }
      }

      searchResults.value = uniqueResults
      selectedUsers.value = []

      // 顯示結果訊息
      if (uniqueResults.length === 0) {
        if (errors.length > 0) {
          ElMessage.error(`搜尋失敗: ${errors.join('; ')}`)
        } else {
          ElMessage.info('沒有找到符合的使用者')
        }
      } else {
        if (errors.length > 0) {
          ElMessage.warning(`找到 ${uniqueResults.length} 位使用者，但有部分搜尋失敗`)
        } else {
          ElMessage.success(`找到 ${uniqueResults.length} 位使用者`)
        }
      }
    } catch (error) {
      console.error('Error searching users:', error)
      searchResults.value = []
      ElMessage.error('搜尋使用者失敗')
    } finally {
      searchingUsers.value = false
    }
  }

  /**
   * Add selected users as viewers to the project
   * @param {string} projectId - Project ID
   * @param {Array<string>} userEmails - Array of user emails
   * @param {string} role - Role to assign (teacher/observer/member)
   * @param {Function} onSuccess - Callback function on success
   */
  const addSelectedViewers = async (projectId: string, userEmails: any, role: any, onSuccess: any) => {
    if (userEmails.length === 0) {
      ElMessage.warning('請選擇要新增的使用者')
      return
    }

    if (!role) {
      ElMessage.warning('請選擇角色')
      return
    }

    if (!projectId) {
      ElMessage.error('未選擇專案')
      return
    }

    try {
      loadingViewers.value = true
      let successCount = 0
      let failCount = 0
      const errors = []

      for (const userEmail of userEmails) {
        const httpResponse = await rpcClient.projects.viewers.add.$post({
          json: {
            projectId,
            userEmail,
            role
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          successCount++
        } else {
          failCount++
          errors.push({
            email: userEmail,
            message: response.error?.message || '未知錯誤'
          })
        }
      }

      // Show results
      if (successCount > 0 && failCount === 0) {
        ElMessage.success(`成功新增 ${successCount} 位存取者`)
      } else if (successCount > 0 && failCount > 0) {
        ElMessage.warning(`成功新增 ${successCount} 位，失敗 ${failCount} 位`)
        // Show detailed errors
        errors.forEach(err => {
          ElMessage.error({
            message: `${err.email}: ${err.message}`,
            duration: 5000,
            showClose: true
          })
        })
      } else {
        ElMessage.error('全部新增失敗')
        errors.forEach(err => {
          ElMessage.error({
            message: `${err.email}: ${err.message}`,
            duration: 5000,
            showClose: true
          })
        })
      }

      // Reset and reload
      if (successCount > 0) {
        searchResults.value = []
        selectedUsers.value = []
        await loadProjectViewers(projectId)
        if (onSuccess) onSuccess()
      }
    } catch (error) {
      console.error('Error adding selected viewers:', error)
      ElMessage.error('批次新增存取者失敗')
    } finally {
      loadingViewers.value = false
    }
  }

  /**
   * Update viewer role
   * @param {string} projectId - Project ID
   * @param {string} userEmail - User email
   * @param {string} newRole - New role
   */
  const updateViewerRole = async (projectId: string, userEmail: string, newRole: any) => {
    if (!projectId) {
      ElMessage.error('未選擇專案')
      return
    }

    try {
      const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
        json: {
          projectId,
          userEmail,
          role: newRole
        }
      })
      const response = await httpResponse.json()

      if (response.success) {
        ElMessage.success('角色已更新')
        // Reload viewers
        await loadProjectViewers(projectId)
      } else {
        ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error updating viewer role:', error)
      ElMessage.error('更新角色失敗')
    }
  }

  /**
   * Remove a viewer from the project
   * @param {string} projectId - Project ID
   * @param {string} userEmail - User email
   */
  const removeViewer = async (projectId: string, userEmail: string) => {
    if (!projectId) {
      ElMessage.error('未選擇專案')
      return
    }

    try {
      const httpResponse = await rpcClient.projects.viewers.remove.$post({
        json: {
          projectId,
          userEmail
        }
      })
      const response = await httpResponse.json()

      if (response.success) {
        ElMessage.success('存取者已移除')
        // Reload viewers
        await loadProjectViewers(projectId)
      } else {
        ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error removing viewer:', error)
      ElMessage.error('移除存取者失敗')
    }
  }

  /**
   * Batch update roles for selected viewers
   * @param {string} projectId - Project ID
   * @param {Array<string>} userEmails - Array of user emails
   * @param {string} newRole - New role
   */
  const batchUpdateRoles = async (projectId: string, userEmails: any, newRole: any) => {
    if (userEmails.length === 0) {
      ElMessage.warning('請選擇要更新的存取者')
      return
    }

    if (!newRole) {
      ElMessage.warning('請選擇目標角色')
      return
    }

    if (!projectId) {
      ElMessage.error('未選擇專案')
      return
    }

    try {
      loadingViewers.value = true
      let successCount = 0
      let failCount = 0

      for (const userEmail of userEmails) {
        const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
          json: {
            projectId,
            userEmail,
            role: newRole
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          successCount++
        } else {
          failCount++
        }
      }

      // Show results
      if (successCount > 0 && failCount === 0) {
        ElMessage.success(`成功轉換 ${successCount} 位存取者的角色`)
      } else if (successCount > 0 && failCount > 0) {
        ElMessage.warning(`成功轉換 ${successCount} 位，失敗 ${failCount} 位`)
      } else {
        ElMessage.error('批次轉換失敗')
      }

      // Reset and reload
      if (successCount > 0) {
        selectedViewers.value = []
        await loadProjectViewers(projectId)
      }
    } catch (error) {
      console.error('Error batch updating roles:', error)
      ElMessage.error('批次轉換角色失敗')
    } finally {
      loadingViewers.value = false
    }
  }

  /**
   * Batch remove selected viewers
   * @param {string} projectId - Project ID
   * @param {Array<string>} userEmails - Array of user emails
   */
  const batchRemoveViewers = async (projectId: string, userEmails: any) => {
    if (userEmails.length === 0) {
      ElMessage.warning('請選擇要刪除的存取者')
      return
    }

    if (!projectId) {
      ElMessage.error('未選擇專案')
      return
    }

    try {
      loadingViewers.value = true
      let successCount = 0
      let failCount = 0

      for (const userEmail of userEmails) {
        const httpResponse = await rpcClient.projects.viewers.remove.$post({
          json: {
            projectId,
            userEmail
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          successCount++
        } else {
          failCount++
        }
      }

      // Show results
      if (successCount > 0 && failCount === 0) {
        ElMessage.success(`成功刪除 ${successCount} 位存取者`)
      } else if (successCount > 0 && failCount > 0) {
        ElMessage.warning(`成功刪除 ${successCount} 位，失敗 ${failCount} 位`)
      } else {
        ElMessage.error('批次刪除失敗')
      }

      // Reset and reload
      if (successCount > 0) {
        selectedViewers.value = []
        await loadProjectViewers(projectId)
      }
    } catch (error) {
      console.error('Error batch removing viewers:', error)
      ElMessage.error('批次刪除失敗')
    } finally {
      loadingViewers.value = false
    }
  }

  /**
   * Toggle user selection for adding
   * @param {string} userEmail - User email
   */
  const toggleUserSelection = (userEmail: string) => {
    const index = selectedUsers.value.indexOf(userEmail)
    if (index > -1) {
      selectedUsers.value.splice(index, 1)
    } else {
      selectedUsers.value.push(userEmail)
    }
  }

  /**
   * Toggle viewer selection for batch operations
   * @param {string} userEmail - User email
   */
  const toggleViewerSelection = (userEmail: string) => {
    const index = selectedViewers.value.indexOf(userEmail)
    if (index > -1) {
      selectedViewers.value.splice(index, 1)
    } else {
      selectedViewers.value.push(userEmail)
    }
  }

  /**
   * Clear all selections
   */
  const clearSelections = () => {
    selectedUsers.value = []
    selectedViewers.value = []
    searchResults.value = []
  }

  return {
    // State
    projectViewers,
    loadingViewers,
    searchingUsers,
    searchResults,
    selectedUsers,
    selectedViewers,

    // Methods
    loadProjectViewers,
    searchUsers,
    addSelectedViewers,
    updateViewerRole,
    removeViewer,
    batchUpdateRoles,
    batchRemoveViewers,
    toggleUserSelection,
    toggleViewerSelection,
    clearSelections
  }
}
