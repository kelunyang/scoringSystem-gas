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

/**
 * Composable for managing invitation codes
 * @returns {Object} Invitation management state and methods
 */
export function useInvitations() {
  // State
  const invitations: Ref<Invitation[]> = ref([])
  const invitationsLoading: Ref<boolean> = ref(false)
  const generating: Ref<boolean> = ref(false)
  const processingStatus: Ref<string> = ref('')
  const generatedInvite: Ref<GeneratedInviteResponse | null> = ref(null)
  const resendingInvites: Ref<Set<string>> = ref(new Set())

  /**
   * Load all invitations
   */
  const loadInvitations = async (): Promise<void> => {
    invitationsLoading.value = true
    try {
      ElMessage.info('開始更新邀請碼列表')

      // Vue 3 Best Practice: rpcClient automatically handles authentication
      const httpResponse = await rpcClient.invitations.list.$post({
        json: {}
      })
      const response = await httpResponse.json() as ApiResponse<Invitation[]>

      if (response.success && response.data) {
        invitations.value = response.data
        ElMessage.success('邀請碼列表資料下載完成')
      } else {
        console.error('Failed to load invitations:', !response.success ? response.error : undefined)
        ElMessage.error(`無法載入邀請碼資料: ${!response.success ? response.error?.message : '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error loading invitations:', error)
      ElMessage.error('載入邀請碼資料失敗，請重試')
    } finally {
      invitationsLoading.value = false
    }
  }

  /**
   * Generate invitation codes for multiple emails
   * @param {Object} inviteForm - Form data containing targetEmails, validDays, defaultGlobalGroups
   */
  const generateInvite = async (inviteForm: InvitationFormData): Promise<boolean> => {
    // 驗證必填欄位
    if (!inviteForm.targetEmails || !inviteForm.targetEmails.trim()) {
      ElMessage.error('請輸入受邀者的Email地址')
      return false
    }

    // 解析Email列表
    const emailList = inviteForm.targetEmails
      .split('\n')
      .map(email => email.trim())
      .filter(email => email.length > 0)

    if (emailList.length === 0) {
      ElMessage.error('請輸入至少一個Email地址')
      return false
    }

    // 驗證Email格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = emailList.filter(email => !emailRegex.test(email))
    if (invalidEmails.length > 0) {
      ElMessage.error(`以下Email格式不正確: ${invalidEmails.join(', ')}`)
      return false
    }

    generating.value = true

    try {
      // Vue 3 Best Practice: rpcClient automatically handles authentication

      // 批次處理Email，每批最多50個
      const results: GeneratedInvitationResult[] = []
      const errors: string[] = []
      const BATCH_SIZE = 50

      // 將emailList分批處理
      const batches: string[][] = []
      for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
        batches.push(emailList.slice(i, i + BATCH_SIZE))
      }

      // 初始化進度狀態
      processingStatus.value = `正在處理 0/${emailList.length} 個邀請...`

      // 處理每一批
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        const batchStartIndex = batchIndex * BATCH_SIZE

        // 更新批次進度
        processingStatus.value = `正在處理第 ${batchIndex + 1}/${batches.length} 批 (每批最多 ${BATCH_SIZE} 個)`

        // 如果批次內少於50個，後端會自動處理
        if (batch.length < BATCH_SIZE) {
          // 單一請求發送整批
          try {
            const httpResponse = await (rpcClient.invitations as any)['generate-batch'].$post({
              json: {
                targetEmails: batch,
                validDays: inviteForm.validDays,
                defaultGlobalGroups: inviteForm.defaultGlobalGroups
              }
            })
            const response = await httpResponse.json() as ApiResponse<BatchGenerateResponse>

            if (response.success && response.data) {
              // 處理批次結果
              response.data.results.forEach(result => {
                results.push(result)
                console.log(`✅ ${result.email}: 邀請碼生成成功，郵件${result.emailSent ? '已發送' : '發送失敗'}`)
              })

              if (response.data.errors) {
                response.data.errors.forEach(error => {
                  errors.push(error)
                  console.log(`❌ ${error}`)
                })
              }
            } else {
              batch.forEach(email => {
                errors.push(`${email}: 批次請求失敗`)
                console.log(`❌ ${email}: 批次請求失敗`)
              })
            }
          } catch (error) {
            batch.forEach(email => {
              errors.push(`${email}: 網路請求失敗`)
              console.log(`❌ ${email}: 網路請求失敗 - ${(error as Error).message}`)
            })
          }
        } else {
          // 批次大小為50，逐個處理以顯示進度
          for (let i = 0; i < batch.length; i++) {
            const email = batch[i]
            const overallIndex = batchStartIndex + i + 1

            // 更新進度顯示
            processingStatus.value = `正在處理 ${overallIndex}/${emailList.length} 個邀請: ${email}`

            try {
              const httpResponse = await rpcClient.invitations.generate.$post({
                json: {
                  targetEmail: email,
                  validDays: inviteForm.validDays,
                  defaultGlobalGroups: inviteForm.defaultGlobalGroups
                }
              })
              const response = await httpResponse.json() as ApiResponse<any>

              if (response.success && response.data) {
                results.push({
                  email: email,
                  invitationCode: response.data.invitationCode || response.data.code,
                  expiryTime: response.data.expiryTime,
                  emailSent: response.data.emailSent || false
                })
                console.log(`✅ ${email}: 邀請碼生成成功，郵件${response.data.emailSent ? '已發送' : '發送失敗'}`)
              } else {
                errors.push(`${email}: ${!response.success ? response.error?.message : '未知錯誤'}`)
                console.log(`❌ ${email}: ${!response.success ? response.error?.message : '未知錯誤'}`)
              }
            } catch (error) {
              errors.push(`${email}: 請求失敗`)
              console.log(`❌ ${email}: 請求失敗 - ${(error as Error).message}`)
            }
          }
        }
      }

      // 設定生成結果
      if (results.length > 0) {
        generatedInvite.value = {
          results: results,
          totalGenerated: results.length,
          errors: errors
        }

        // 重新載入邀請碼列表
        await loadInvitations()

        const emailsSent = results.filter(r => r.emailSent).length
        const emailsFailed = results.filter(r => !r.emailSent).length

        if (errors.length === 0) {
          if (emailsFailed === 0) {
            ElMessage.success(`成功為 ${results.length} 個Email生成邀請碼並發送邀請信！`)
          } else {
            ElMessage.warning(`成功生成 ${results.length} 個邀請碼，但有 ${emailsFailed} 封邀請信發送失敗`)
          }
        } else {
          ElMessage.warning(`成功生成 ${results.length} 個邀請碼（${emailsSent} 封已發送），${errors.length} 個失敗`)
        }

        return true // Indicate success
      } else {
        ElMessage.error(`所有邀請碼生成失敗: ${errors.join('; ')}`)
        return false
      }
    } catch (error) {
      console.error('Generate invite error:', error)
      ElMessage.error('生成邀請碼失敗，請重試')
      return false
    } finally {
      generating.value = false
      processingStatus.value = '' // 清空進度狀態
    }
  }

  /**
   * Resend invitation email
   * @param {Object} invitation - Invitation object with invitationId and targetEmail
   */
  const resendInvitationEmail = async (invitation: Invitation & { targetEmail?: string }): Promise<void> => {
    try {
      // Add to resending set
      resendingInvites.value.add(invitation.invitationId)

      const httpResponse = await (rpcClient.invitations as any)['resend-email'].$post({
        json: {
          invitationId: invitation.invitationId
        }
      })
      const response = await httpResponse.json() as ApiResponse<any>

      if (response.success) {
        ElMessage.success(`邀請信已重新發送至 ${invitation.targetEmail || invitation.inviteeEmail}`)

        // Reload invitations to get updated email sent time
        await loadInvitations()
      } else {
        if (response.error?.code === 'NO_DISPLAY_CODE') {
          ElMessage.error('無法重送：邀請碼已被隱藏，請聯繫管理員')
        } else if (response.error?.code === 'INVITATION_EXPIRED') {
          ElMessage.error('無法重送：邀請碼已過期')
        } else if (response.error?.code === 'EMAIL_SEND_FAILED') {
          ElMessage.error('郵件發送失敗，請檢查 SMTP 設定')
        } else {
          ElMessage.error(`重送失敗: ${response.error?.message || '未知錯誤'}`)
        }
      }
    } catch (error) {
      console.error('Error resending invitation email:', error)
      ElMessage.error('重送邀請信失敗，請重試')
    } finally {
      // Remove from resending set
      resendingInvites.value.delete(invitation.invitationId)
    }
  }

  /**
   * Deactivate an invitation
   * @param {Object} invitation - Invitation object with invitationId
   */
  const deactivateInvitation = async (invitation: Invitation): Promise<void> => {
    try {
      const httpResponse = await rpcClient.invitations.deactivate.$post({
        json: {
          invitationId: invitation.invitationId
        }
      })
      const response = await httpResponse.json() as ApiResponse<any>

      if (response.success) {
        // 重新載入邀請碼列表以獲取最新狀態
        await loadInvitations()

        ElMessage.success('邀請碼已停用，列表已更新')
      } else {
        ElMessage.error(`停用失敗: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error deactivating invitation:', error)
      ElMessage.error('停用失敗，請重試')
    }
  }

  /**
   * Copy invitation code to clipboard
   * @param {string} code - Invitation code
   */
  const copyInvitationCode = (code: string): void => {
    navigator.clipboard.writeText(code)
    ElMessage.success('邀請碼已複製到剪貼板')
  }

  /**
   * Copy all generated invitation codes to clipboard
   */
  const copyAllCodes = (): void => {
    if (generatedInvite.value?.results) {
      const allCodes = generatedInvite.value.results
        .map(result => `${result.email} > ${result.invitationCode}`)
        .join('\n')
      navigator.clipboard.writeText(allCodes)
      ElMessage.success(`已複製 ${generatedInvite.value.results.length} 個邀請碼到剪貼板`)
    }
  }

  return {
    // State
    invitations,
    invitationsLoading,
    generating,
    processingStatus,
    generatedInvite,
    resendingInvites,

    // Methods
    loadInvitations,
    generateInvite,
    resendInvitationEmail,
    deactivateInvitation,
    copyInvitationCode,
    copyAllCodes
  }
}
