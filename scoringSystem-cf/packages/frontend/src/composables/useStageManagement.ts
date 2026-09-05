
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

