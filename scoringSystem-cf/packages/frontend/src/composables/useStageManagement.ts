import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import type { Stage, ApiResponse } from '@/types'

/**
 * Stage form data
 */
export interface StageFormData {
  stageId?: string
  stageName: string
  description: string
  stageOrder?: number
  startTime: string | number | Date
  endTime: string | number | Date
  reportRewardPool?: number
  commentRewardPool?: number
}

/**
 * Stage update data
 */
export interface StageUpdateData {
  stageName?: string
  startTime?: number
  endTime?: number
  description?: string
  reportRewardPool?: number
  commentRewardPool?: number
  stageOrder?: number
}

/**
 * Stage error object
 */
export interface StageFormError {
  title: string
  message: string
}

/**
 * Composable for managing project stages
 * @returns {Object} Stage management state and methods
 */
export function useStageManagement() {
  // State
  const loadingStageDetails: Ref<boolean> = ref(false)
  const savingStageDetails: Ref<boolean> = ref(false)
  const savingStageOrder: Ref<boolean> = ref(false)
  const stageFormError: Ref<StageFormError | null> = ref(null)
  const draggedStage: Ref<Stage | null> = ref(null)

  /**
   * Validate stage form data
   * @param {Object} stageForm - Stage form data
   * @returns {Object|null} Error object or null if valid
   */
  const validateStageForm = (stageForm: StageFormData): StageFormError | null => {
    if (!stageForm.stageName.trim()) {
      return {
        title: '驗證失敗',
        message: '請輸入階段名稱'
      }
    }

    if (!stageForm.startTime || !stageForm.endTime) {
      return {
        title: '驗證失敗',
        message: '請選擇開始和結束時間'
      }
    }

    if (new Date(stageForm.endTime) <= new Date(stageForm.startTime)) {
      return {
        title: '驗證失敗',
        message: '結束時間必須晚於開始時間'
      }
    }

    return null
  }

  /**
   * Create or update a stage
   * @param {string} projectId - Project ID
   * @param {Object} stageForm - Stage form data
   * @param {Function} onSuccess - Callback on success
   */
  const saveStage = async (projectId: string, stageForm: StageFormData, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
    // Clear previous errors
    stageFormError.value = null

    // Validate form
    const validationError = validateStageForm(stageForm)
    if (validationError) {
      stageFormError.value = validationError
      ElMessage.error(validationError.message)
      return false
    }

    savingStageDetails.value = true
    try {
      if (stageForm.stageId) {
        // Update existing stage
        const updates: StageUpdateData = {
          stageName: stageForm.stageName.trim(),
          startTime: new Date(stageForm.startTime).getTime(),
          endTime: new Date(stageForm.endTime).getTime(),
          description: stageForm.description,
          reportRewardPool: stageForm.reportRewardPool || 0,
          commentRewardPool: stageForm.commentRewardPool || 0
        }

        const httpResponse = await rpcClient.stages.update.$post({
          json: {
            projectId: projectId,
            stageId: stageForm.stageId,
            updates: updates
          }
        })
        const response = await httpResponse.json() as ApiResponse<Stage>

        if (response.success) {
          ElMessage.success('階段已更新')
          if (onSuccess) await onSuccess()
          return true
        } else {
          stageFormError.value = {
            title: '更新失敗',
            message: response.error?.message || '未知錯誤'
          }
          ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
          return false
        }
      } else {
        // Create new stage
        const stageData = {
          stageName: stageForm.stageName.trim(),
          description: stageForm.description,
          stageOrder: stageForm.stageOrder || 1,
          startTime: new Date(stageForm.startTime).getTime(),
          endTime: new Date(stageForm.endTime).getTime(),
          reportRewardPool: stageForm.reportRewardPool || 0,
          commentRewardPool: stageForm.commentRewardPool || 0
        }

        const httpResponse = await rpcClient.stages.create.$post({
          json: {
            projectId: projectId,
            stageData: stageData
          }
        })
        const response = await httpResponse.json() as ApiResponse<Stage>

        if (response.success) {
          ElMessage.success('階段已新增')
          if (onSuccess) await onSuccess()
          return true
        } else {
          stageFormError.value = {
            title: '新增階段失敗',
            message: response.error?.message || '未知錯誤'
          }
          ElMessage.error(`新增失敗: ${response.error?.message || '未知錯誤'}`)
          return false
        }
      }
    } catch (error) {
      console.error('Error saving stage:', error)
      ElMessage.error(stageForm.stageId ? '更新階段失敗，請重試' : '新增階段失敗，請重試')
      return false
    } finally {
      savingStageDetails.value = false
    }
  }

  /**
   * Save stage order
   * @param {string} projectId - Project ID
   * @param {Array} stages - Array of stages with updated order
   */
  const saveStageOrder = async (projectId: string, stages: Stage[]): Promise<void> => {
    if (!projectId || !stages) {
      ElMessage.error('無法保存階段順序：缺少必要參數')
      return
    }

    savingStageOrder.value = true
    try {
      // Update stage order for each stage
      for (const stage of stages) {
        const httpResponse = await rpcClient.stages.update.$post({
          json: {
            projectId: projectId,
            stageId: stage.stageId,
            updates: { stageOrder: stage.stageOrder }
          }
        })
        const response = await httpResponse.json() as ApiResponse<Stage>

        if (!response.success) {
          console.error('Failed to update stage order:', response.error)
          ElMessage.error(`更新階段順序失敗: ${response.error?.message || '未知錯誤'}`)
          return
        }
      }

      ElMessage.success('階段順序已儲存')
    } catch (error) {
      console.error('Error saving stage order:', error)
      ElMessage.error('儲存階段順序失敗，請重試')
    } finally {
      savingStageOrder.value = false
    }
  }

  /**
   * Reorder stages array by swapping two elements
   * @param {Array} stages - Array of stages
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Target index
   * @returns {Array} New reordered array
   */
  const reorderStages = (stages: Stage[], fromIndex: number, toIndex: number): Stage[] => {
    const newStages = [...stages]
    const [movedItem] = newStages.splice(fromIndex, 1)
    newStages.splice(toIndex, 0, movedItem)

    // Update stage order
    newStages.forEach((stage, index) => {
      stage.stageOrder = index + 1
    })

    return newStages
  }

  /**
   * Move stage up in the list
   * @param {string} projectId - Project ID
   * @param {Array} stages - Current stages array
   * @param {number} currentIndex - Current index of the stage
   * @param {Function} onUpdate - Callback to update stages
   */
  const moveStageUp = async (projectId: string, stages: Stage[], currentIndex: number, onUpdate: (stages: Stage[]) => void): Promise<void> => {
    if (currentIndex === 0) return

    const newStages = reorderStages(stages, currentIndex, currentIndex - 1)
    onUpdate(newStages)
    await saveStageOrder(projectId, newStages)
  }

  /**
   * Move stage down in the list
   * @param {string} projectId - Project ID
   * @param {Array} stages - Current stages array
   * @param {number} currentIndex - Current index of the stage
   * @param {Function} onUpdate - Callback to update stages
   */
  const moveStageDown = async (projectId: string, stages: Stage[], currentIndex: number, onUpdate: (stages: Stage[]) => void): Promise<void> => {
    if (currentIndex === stages.length - 1) return

    const newStages = reorderStages(stages, currentIndex, currentIndex + 1)
    onUpdate(newStages)
    await saveStageOrder(projectId, newStages)
  }

  /**
   * Handle drag and drop start
   * @param {Object} stage - Stage being dragged
   * @param {Event} event - Drag event
   */
  const handleDragStart = (stage: Stage, event: DragEvent): void => {
    draggedStage.value = stage
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  /**
   * Handle drag over
   * @param {Event} event - Drag event
   */
  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  /**
   * Handle drop
   * @param {Event} event - Drop event
   * @param {string} projectId - Project ID
   * @param {Array} stages - Current stages array
   * @param {number} targetIndex - Target index
   * @param {Function} onUpdate - Callback to update stages
   */
  const handleDrop = async (event: DragEvent, projectId: string, stages: Stage[], targetIndex: number, onUpdate: (stages: Stage[]) => void): Promise<void> => {
    event.preventDefault()

    if (!draggedStage.value) return

    const draggedIndex = stages.findIndex(s => s.stageId === draggedStage.value!.stageId)

    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      draggedStage.value = null
      return
    }

    const newStages = reorderStages(stages, draggedIndex, targetIndex)
    onUpdate(newStages)
    await saveStageOrder(projectId, newStages)

    draggedStage.value = null
  }

  /**
   * Handle drag end
   */
  const handleDragEnd = (): void => {
    draggedStage.value = null
  }

  /**
   * Force stage transition to a specific status
   * @param {string} projectId - Project ID
   * @param {string} stageId - Stage ID
   * @param {string} newStatus - New status (e.g., 'voting')
   */
  const forceStageTransition = async (projectId: string, stageId: string, newStatus: string): Promise<boolean> => {
    try {
      if (!projectId) {
        ElMessage.error('無法取得專案 ID，請重新載入頁面')
        return false
      }

      const httpResponse = await (rpcClient.stages as any)['force-transition'].$post({
        json: {
          projectId: projectId,
          stageId: stageId,
          newStatus: newStatus
        }
      })
      const response = await httpResponse.json() as ApiResponse<Stage>

      if (response.success) {
        ElMessage.success(`已強制進入${newStatus === 'voting' ? '投票' : newStatus}階段`)
        return true
      } else {
        ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Error forcing stage transition:', error)
      ElMessage.error('操作失敗，請重試')
      return false
    }
  }

  /**
   * Clear stage form error
   */
  const clearStageFormError = (): void => {
    stageFormError.value = null
  }

  return {
    // State
    loadingStageDetails,
    savingStageDetails,
    savingStageOrder,
    stageFormError,
    draggedStage,

    // Methods
    validateStageForm,
    saveStage,
    saveStageOrder,
    reorderStages,
    moveStageUp,
    moveStageDown,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    forceStageTransition,
    clearStageFormError
  }
}
