/**
 * Invitation Management Composable
 * Handles invitation code generation, tracking, and usage
 */

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import type { InvitationCode } from '@repo/shared/types'

export function useInvitationManagement() {
  // State
  const invitations = ref<InvitationCode[]>([])
  const loading = ref(false)
  const generating = ref(false)

  // Computed - Single-pass categorization for better performance
  const categorized = computed(() => {
    const active: InvitationCode[] = []
    const used: InvitationCode[] = []
    const expired: InvitationCode[] = []
    const now = Date.now()

    // Single iteration instead of 4 separate filters
    for (const inv of invitations.value) {
      if (inv.isUsed) {
        used.push(inv)
      } else if (inv.expiresAt > now) {
        active.push(inv)
      } else {
        expired.push(inv)
      }
    }

    return { active, used, expired }
  })

  const stats = computed(() => {
    const cat = categorized.value
    return {
      total: invitations.value.length,
      active: cat.active.length,
      used: cat.used.length,
      expired: cat.expired.length
    }
  })

  const activeInvitations = computed(() => categorized.value.active)
  const usedInvitations = computed(() => categorized.value.used)
  const expiredInvitations = computed(() => categorized.value.expired)

  // Methods
  const loadInvitations = async () => {
    loading.value = true
    try {
      const response = await adminApi.invitations.list({})

      if (response.success && response.data) {
        invitations.value = response.data
      } else {
        console.error('Failed to load invitations:', response.error)
        invitations.value = []
        ElMessage.error(`無法載入邀請碼: ${response.error?.message || '未知錯誤'}`)
      }
    } catch (error) {
      console.error('Error loading invitations:', error)
      invitations.value = []
      ElMessage.error('載入邀請碼失敗，請重試')
    } finally {
      loading.value = false
    }
  }

  const generateInvitation = async (params: {
    quantity: number
    expirationDays: number
    note?: string
  }) => {
    if (params.quantity < 1 || params.quantity > 100) {
      ElMessage.error('每次最多生成 100 組邀請碼')
      return false
    }

    if (params.expirationDays < 1 || params.expirationDays > 365) {
      ElMessage.error('有效期限必須在 1-365 天之間')
      return false
    }

    generating.value = true
    try {
      const response = await adminApi.invitations.generate({
        quantity: params.quantity,
        expirationDays: params.expirationDays,
        note: params.note
      })

      if (response.success && response.data) {
        ElMessage.success(`成功生成 ${params.quantity} 組邀請碼`)
        await loadInvitations() // Refresh list
        return true
      } else {
        ElMessage.error(`生成邀請碼失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Generate invitation error:', error)
      ElMessage.error('生成邀請碼失敗，請重試')
      return false
    } finally {
      generating.value = false
    }
  }

  const revokeInvitation = async (invitationCode: string) => {
    try {
      const response = await adminApi.invitations.revoke({
        invitationCode
      })

      if (response.success) {
        ElMessage.success('邀請碼已撤銷')
        await loadInvitations() // Refresh list
        return true
      } else {
        ElMessage.error(`撤銷失敗: ${response.error?.message || '未知錯誤'}`)
        return false
      }
    } catch (error) {
      console.error('Revoke invitation error:', error)
      ElMessage.error('撤銷邀請碼失敗，請重試')
      return false
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success('已複製到剪貼簿')
    } catch (error) {
      console.error('Copy to clipboard error:', error)
      ElMessage.error('複製失敗')
    }
  }

  const getInvitationStatus = (invitation: InvitationCode): 'active' | 'used' | 'expired' => {
    if (invitation.isUsed) return 'used'
    if (invitation.expiresAt <= Date.now()) return 'expired'
    return 'active'
  }

  const getInvitationStatusText = (invitation: InvitationCode): string => {
    const status = getInvitationStatus(invitation)
    const statusMap = {
      'active': '有效',
      'used': '已使用',
      'expired': '已過期'
    }
    return statusMap[status]
  }

  const formatExpirationTime = (expiresAt: number): string => {
    const now = Date.now()
    if (expiresAt <= now) {
      return '已過期'
    }

    const remaining = expiresAt - now
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

    if (days > 0) {
      return `${days} 天後過期`
    } else if (hours > 0) {
      return `${hours} 小時後過期`
    } else {
      return '即將過期'
    }
  }

  return {
    // State
    invitations,
    loading,
    generating,

    // Computed
    stats,
    activeInvitations,
    usedInvitations,
    expiredInvitations,

    // Methods
    loadInvitations,
    generateInvitation,
    revokeInvitation,
    copyToClipboard,
    getInvitationStatus,
    getInvitationStatusText,
    formatExpirationTime
  }
}
