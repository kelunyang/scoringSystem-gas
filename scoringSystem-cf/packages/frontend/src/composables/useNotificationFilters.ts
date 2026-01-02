import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface Notification {
  notificationId: string
  targetUserEmail: string
  type: NotificationType
  title: string
  content: string
  projectId?: string
  projectName?: string
  stageId?: string
  isRead: boolean
  isDeleted: boolean
  emailSent: boolean
  createdTime: number
  readTime?: number
  emailSentTime?: number
}

export type NotificationType =
  | 'submission_created'
  | 'submission_withdrawn'
  | 'submission_approved'
  | 'stage_status_changed'
  | 'ranking_proposal_submitted'
  | 'ranking_proposal_withdrawn'
  | 'ranking_proposal_approved'
  | 'comment_mentioned'
  | 'comment_replied'
  | 'settlement_failed'
  | 'project_role_assigned'
  | 'project_role_removed'
  | 'group_member_added'
  | 'group_member_removed'
  | 'account_locked'
  | 'account_unlocked'
  | 'password_reset_success'
  | 'vote_reset'
  | 'project_info_updated'

export interface NotificationStats {
  totalNotifications: number
  readNotifications: number
  emailSentNotifications: number
}

export function useNotificationFilters(notifications: Ref<Notification[]>) {
  const searchText = ref('')
  const emailSentFilter = ref<'all' | 'sent' | 'not_sent'>('all')
  const readFilter = ref<'all' | 'read' | 'unread'>('all')
  const typeFilter = ref<NotificationType | 'all'>('all')
  const displayLimit = ref(100)

  /**
   * Optimized single-pass filter algorithm
   * O(n) instead of O(5n) - processes each notification only once
   */
  const filteredNotifications = computed<Notification[]>(() => {
    // Defensive check to prevent undefined errors during initial render
    if (!notifications.value) return []

    const search = searchText.value.toLowerCase()
    const hasSearch = search.length > 0

    const limit = displayLimit.value
    const result: Notification[] = []

    for (const n of notifications.value) {
      // Early termination when limit is reached
      if (result.length >= limit) break

      // Text search (short-circuit evaluation)
      if (hasSearch) {
        const matchesTitle = n.title.toLowerCase().includes(search)
        const matchesContent = n.content.toLowerCase().includes(search)
        const matchesEmail = n.targetUserEmail.toLowerCase().includes(search)

        if (!matchesTitle && !matchesContent && !matchesEmail) {
          continue
        }
      }

      // Email sent filter
      if (emailSentFilter.value === 'sent' && !n.emailSent) continue
      if (emailSentFilter.value === 'not_sent' && n.emailSent) continue

      // Read status filter
      if (readFilter.value === 'read' && !n.isRead) continue
      if (readFilter.value === 'unread' && n.isRead) continue

      // Type filter
      if (typeFilter.value !== 'all' && n.type !== typeFilter.value) continue

      // Passed all filters
      result.push(n)
    }

    return result
  })

  /**
   * Compute statistics from the full notification list
   * Uses cached computed for efficiency
   */
  const stats = computed<NotificationStats>(() => {
    // Defensive check to prevent undefined errors
    if (!notifications.value) {
      return {
        totalNotifications: 0,
        readNotifications: 0,
        emailSentNotifications: 0
      }
    }
    return {
      totalNotifications: notifications.value.length,
      readNotifications: notifications.value.filter(n => n.isRead).length,
      emailSentNotifications: notifications.value.filter(n => n.emailSent).length
    }
  })

  /**
   * Reset all filters to default values
   */
  const resetFilters = () => {
    searchText.value = ''
    emailSentFilter.value = 'all'
    readFilter.value = 'all'
    typeFilter.value = 'all'
    displayLimit.value = 100
  }

  return {
    // Refs
    searchText,
    emailSentFilter,
    readFilter,
    typeFilter,
    displayLimit,

    // Computed
    filteredNotifications,
    stats,

    // Methods
    resetFilters
  }
}
