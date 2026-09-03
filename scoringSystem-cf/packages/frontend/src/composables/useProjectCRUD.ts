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

