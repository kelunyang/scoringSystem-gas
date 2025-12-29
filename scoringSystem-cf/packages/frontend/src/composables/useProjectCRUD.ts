import { ref, type Ref } from 'vue'
import { rpcClient, getSessionToken } from '@/utils/rpc-client'
import { ElMessage } from 'element-plus'
import type { Project, ApiResponse } from '@/types'

/**
 * Project form data
 */
export interface ProjectFormData {
  projectId?: string
  projectName: string
  description: string
  scoreRangeMin: number
  scoreRangeMax: number
  status?: 'active' | 'archived' | 'deleted'
}

/**
 * Project update data
 */
export interface ProjectUpdateData {
  projectName: string
  description: string
  scoreRangeMin: number
  scoreRangeMax: number
  status?: 'active' | 'archived' | 'deleted'
}

/**
 * Composable for project CRUD operations
 * @returns {Object} Project CRUD state and methods
 */
export function useProjectCRUD() {
  // State
  const creating: Ref<boolean> = ref(false)
  const updating: Ref<boolean> = ref(false)
  const archivingProjects: Ref<Set<string>> = ref(new Set())

  /**
   * Validate project form data
   * @param {Object} projectForm - Project form data
   * @returns {string|null} Error message or null if valid
   */
  const validateProjectForm = (projectForm: ProjectFormData): string | null => {
    if (!projectForm.projectName.trim()) {
      return '請輸入專案名稱'
    }

    if (!projectForm.description.trim()) {
      return '請輸入專案描述'
    }

    // Validate score range
    if (projectForm.scoreRangeMin >= projectForm.scoreRangeMax) {
      return '最低分必須小於最高分'
    }

    return null
  }

  /**
   * Create a new project
   * @param {Object} projectData - Project data to create
   * @param {Function} onSuccess - Callback on success
   */
  const createProject = async (projectData: ProjectFormData, onSuccess?: (data: Project) => Promise<void> | void): Promise<boolean> => {
    const validationError = validateProjectForm(projectData)
    if (validationError) {
      ElMessage.warning(validationError)
      return false
    }

    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!getSessionToken()) {
      ElMessage.error('Session 已過期，請重新登入')
      return false
    }

    try {
      creating.value = true

      const httpResponse = await rpcClient.projects.create.$post({
        json: {
          projectData: {
            projectName: projectData.projectName.trim(),
            description: projectData.description.trim(),
            scoreRangeMin: projectData.scoreRangeMin,
            scoreRangeMax: projectData.scoreRangeMax
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (response.success) {
        ElMessage.success('專案創建成功')
        if (onSuccess) await onSuccess(response.data)
        return true
      } else {
        ElMessage.error(`創建失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error creating project:', error)
      ElMessage.error('創建失敗，請重試')
      return false
    } finally {
      creating.value = false
    }
  }

  /**
   * Update an existing project
   * @param {string} projectId - Project ID
   * @param {Object} updates - Project updates
   * @param {Function} onSuccess - Callback on success
   */
  const updateProject = async (projectId: string, updates: ProjectUpdateData, onSuccess?: (data: Project) => Promise<void> | void): Promise<boolean> => {
    const validationError = validateProjectForm(updates as ProjectFormData)
    if (validationError) {
      ElMessage.warning(validationError)
      return false
    }

    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!getSessionToken()) {
      ElMessage.error('Session 已過期，請重新登入')
      return false
    }

    try {
      updating.value = true

      const httpResponse = await rpcClient.projects.update.$post({
        json: {
          projectId: projectId,
          updates: {
            projectName: updates.projectName.trim(),
            description: updates.description.trim(),
            scoreRangeMin: updates.scoreRangeMin,
            scoreRangeMax: updates.scoreRangeMax
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (response.success) {
        ElMessage.success('專案更新成功')
        if (onSuccess) await onSuccess(response.data)
        return true
      } else {
        ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error updating project:', error)
      ElMessage.error('更新失敗，請重試')
      return false
    } finally {
      updating.value = false
    }
  }

  /**
   * Save project (create or update based on projectId)
   * @param {Object} projectForm - Project form data
   * @param {Function} onSuccess - Callback on success
   */
  const saveProject = async (projectForm: ProjectFormData, onSuccess?: (data: Project) => Promise<void> | void): Promise<boolean> => {
    if (projectForm.projectId) {
      return await updateProject(projectForm.projectId, projectForm, onSuccess)
    } else {
      return await createProject(projectForm, onSuccess)
    }
  }

  /**
   * Archive a project
   * @param {string} projectId - Project ID
   * @param {Function} onSuccess - Callback on success
   */
  const archiveProject = async (projectId: string, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!getSessionToken()) {
      ElMessage.error('Session 已過期，請重新登入')
      return false
    }

    try {
      // Add to archiving set
      archivingProjects.value.add(projectId)

      const httpResponse = await rpcClient.projects.update.$post({
        json: {
          projectId: projectId,
          updates: {
            status: 'archived'
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (response.success) {
        ElMessage.success('專案已封存')
        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`封存失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error archiving project:', error)
      ElMessage.error('封存失敗，請重試')
      return false
    } finally {
      // Remove from archiving set
      archivingProjects.value.delete(projectId)
    }
  }

  /**
   * Unarchive a project
   * @param {string} projectId - Project ID
   * @param {Function} onSuccess - Callback on success
   */
  const unarchiveProject = async (projectId: string, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!getSessionToken()) {
      ElMessage.error('Session 已過期，請重新登入')
      return false
    }

    try {
      // Add to archiving set (reuse the same tracking set)
      archivingProjects.value.add(projectId)

      const httpResponse = await rpcClient.projects.update.$post({
        json: {
          projectId: projectId,
          updates: {
            status: 'active'
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (response.success) {
        ElMessage.success('專案已解除封存')
        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`解除封存失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error unarchiving project:', error)
      ElMessage.error('解除封存失敗，請重試')
      return false
    } finally {
      // Remove from archiving set
      archivingProjects.value.delete(projectId)
    }
  }

  /**
   * Update project status
   * @param {string} projectId - Project ID
   * @param {string} newStatus - New status ('active', 'archived', etc.)
   * @param {Function} onSuccess - Callback on success
   */
  const updateProjectStatus = async (projectId: string, newStatus: 'active' | 'archived' | 'deleted', onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!getSessionToken()) {
      ElMessage.error('Session 已過期，請重新登入')
      return false
    }

    try {
      const httpResponse = await rpcClient.projects.update.$post({
        json: {
          projectId: projectId,
          updates: {
            status: newStatus
          }
        }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (response.success) {
        ElMessage.success('專案狀態已更新')
        if (onSuccess) await onSuccess()
        return true
      } else {
        ElMessage.error(`狀態更新失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error updating project status:', error)
      ElMessage.error('狀態更新失敗，請重試')
      return false
    }
  }

  /**
   * Check if a project is currently being archived/unarchived
   * @param {string} projectId - Project ID
   * @returns {boolean}
   */
  const isArchiving = (projectId: string): boolean => {
    return archivingProjects.value.has(projectId)
  }

  return {
    // State
    creating,
    updating,
    archivingProjects,

    // Methods
    validateProjectForm,
    createProject,
    updateProject,
    saveProject,
    archiveProject,
    unarchiveProject,
    updateProjectStatus,
    isArchiving
  }
}
