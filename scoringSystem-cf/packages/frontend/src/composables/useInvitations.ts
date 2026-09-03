import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import type { Invitation, ApiResponse } from '@/types'

/**
 * Invitation form data
 */
export interface InvitationFormData {
  targetEmails: string
  validDays: number
  defaultGlobalGroups: string[]
}

/**
 * Generated invitation result
 */
export interface GeneratedInvitationResult {
  email: string
  invitationCode: string
  expiryTime: number
  emailSent: boolean
}

/**
 * Generated invite response
 */
export interface GeneratedInviteResponse {
  results: GeneratedInvitationResult[]
  totalGenerated: number
  errors: string[]
}

/**
 * Batch generate response
 */
export interface BatchGenerateResponse {
  results: GeneratedInvitationResult[]
  errors?: string[]
}

