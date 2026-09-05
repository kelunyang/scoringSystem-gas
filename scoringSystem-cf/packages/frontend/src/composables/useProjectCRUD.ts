
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

