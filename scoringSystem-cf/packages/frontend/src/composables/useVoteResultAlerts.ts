/**
 * Vote Result Alerts Composable
 *
 * Manages all alert-related logic for VoteResultModal.
 * Extracted from VoteResultModal.vue to improve maintainability.
 *
 * Consolidates 8 separate watch handlers into a single composable:
 * 1. userHasVoted alert
 * 2. showTieReminderForMembers alert
 * 3. showResetButton alert (for group leader)
 * 4. votingResult alerts (agree/disagree/tie)
 * 5. hasExistingProposal alerts
 * 6. visible (voting mechanism info)
 * 7. showWithdrawDrawer alerts
 * 8. showResetDrawer alerts
 */

import { watch, type Ref, type ComputedRef } from 'vue'
import { useDrawerAlerts } from './useDrawerAlerts'

// ============= Types =============

export interface RankingProposal {
  proposalId: string
  proposerDisplayName?: string
  supportCount?: number
  opposeCount?: number
  totalVotes?: number
  status: 'pending' | 'settled' | 'withdrawn' | 'reset'
  votingResult?: 'agree' | 'disagree' | 'tie' | 'no_votes'
}

export interface ResetInfo {
  supportCount: number
  opposeCount: number
  totalVotes: number
  memberCount: number
}

export interface VoteResultAlertsParams {
  // Visibility states
  visible: Ref<boolean> | ComputedRef<boolean>
  showWithdrawDrawer: Ref<boolean>
  showResetDrawer: Ref<boolean>

  // Voting states
  userHasVoted: ComputedRef<boolean>
  showTieReminderForMembers: ComputedRef<boolean>
  showResetButton: ComputedRef<boolean>

  // Proposal states
  hasExistingProposal: ComputedRef<boolean>
  currentProposal: ComputedRef<RankingProposal | null>
  resetCount: ComputedRef<number>

  // Reset info (for reset drawer)
  currentResetInfo: ComputedRef<ResetInfo | null>

  // Project config
  maxVoteResetCount?: ComputedRef<number>
}

// ============= Main Composable =============

/**
 * Manages all alert watches for VoteResultModal
 *
 * @param params - Reactive parameters needed for alert logic
 * @returns Alert management functions
 */
export function useVoteResultAlerts(params: VoteResultAlertsParams) {
  const { addAlert, clearAlerts } = useDrawerAlerts()

  const {
    visible,
    showWithdrawDrawer,
    showResetDrawer,
    userHasVoted,
    showTieReminderForMembers,
    showResetButton,
    hasExistingProposal,
    currentProposal,
    resetCount,
    currentResetInfo,
    maxVoteResetCount
  } = params

  // Helper to get max reset count (default to 1 if not provided)
  const getMaxResetCount = () => maxVoteResetCount?.value ?? 1

  // ===== Watch: User Has Voted =====
  watch(userHasVoted, (hasVoted) => {
    if (hasVoted) {
      addAlert({
        type: 'info',
        title: '您已投過票',
        message: '您已對當前提案投過票，只能查看投票結果。如需重新提案，請聯絡專案管理員。',
        closable: false,
        autoClose: 0
      })
    }
  })

  // ===== Watch: Tie/Disagree Reminder for Members =====
  watch(showTieReminderForMembers, (show) => {
    if (show) {
      const support = currentProposal.value?.supportCount || 0
      const oppose = currentProposal.value?.opposeCount || 0
      const isTied = support === oppose
      const maxResets = getMaxResetCount()
      const remainingResets = maxResets - resetCount.value
      addAlert({
        type: 'info',
        title: isTied ? '投票結果平手' : '投票未通過',
        message: isTied
          ? `目前支持和反對票數相同（${support} : ${oppose}）。\n\n您可以聯絡組長發起重置投票，讓組員重新討論和投票。\n\n注意：每組每階段最多 ${maxResets} 次重置機會，目前剩餘 ${remainingResets} 次`
          : `目前反對票（${oppose}）多於支持票（${support}）。\n\n您可以聯絡組長發起重置投票，讓組員重新討論和投票。\n\n注意：每組每階段最多 ${maxResets} 次重置機會，目前剩餘 ${remainingResets} 次`,
        closable: false,
        autoClose: 0
      })
    }
  })

  // ===== Watch: Reset Button (Group Leader Warning) =====
  watch(showResetButton, (show) => {
    if (show) {
      const support = currentProposal.value?.supportCount || 0
      const oppose = currentProposal.value?.opposeCount || 0
      const isTied = support === oppose
      const maxResets = getMaxResetCount()
      const remainingResets = maxResets - resetCount.value
      addAlert({
        type: 'warning',
        title: isTied ? '投票平手 - 組長可重置投票' : '投票未通過 - 組長可重置投票',
        message: isTied
          ? `目前支持和反對票數相同（${support} : ${oppose}），您作為組長可以選擇重置投票，讓組員重新討論和投票。\n\n⚠️ 注意：每個階段每組最多 ${maxResets} 次重置機會，目前剩餘 ${remainingResets} 次，請謹慎使用！`
          : `目前反對票（${oppose}）多於支持票（${support}），您作為組長可以選擇重置投票，讓組員重新討論和投票。\n\n⚠️ 注意：每個階段每組最多 ${maxResets} 次重置機會，目前剩餘 ${remainingResets} 次，請謹慎使用！`,
        closable: false,
        autoClose: 0
      })
    }
  })

  // ===== Watch: Voting Result =====
  watch(
    () => currentProposal.value?.votingResult,
    (votingResult) => {
      if (!votingResult || votingResult === 'no_votes') return

      const maxResets = getMaxResetCount()
      const remainingResets = maxResets - resetCount.value

      if (votingResult === 'agree') {
        addAlert({
          type: 'success',
          title: '投票結果',
          message: '已達成多數同意。',
          closable: true,
          autoClose: 0
        })
      } else if (votingResult === 'disagree') {
        if (remainingResets > 0) {
          addAlert({
            type: 'info',
            title: '投票未通過',
            message: `未達成多數同意。組長可發起重置投票（剩餘 ${remainingResets} 次機會）。`,
            closable: true,
            autoClose: 0
          })
        } else {
          addAlert({
            type: 'info',
            title: '投票結果',
            message: '未達成多數同意。',
            closable: true,
            autoClose: 0
          })
        }
      } else if (votingResult === 'tie' && remainingResets > 0) {
        addAlert({
          type: 'warning',
          title: '投票結果平手',
          message: `目前投票結果是平手，組長可發起重置投票（剩餘 ${remainingResets} 次機會）。`,
          closable: false,
          autoClose: 0
        })
      }
    },
    { immediate: true }
  )

  // ===== Watch: Has Existing Proposal =====
  watch(
    [hasExistingProposal, currentProposal],
    ([hasProposal, proposal]) => {
      if (hasProposal && proposal) {
        addAlert({
          type: 'info',
          title: '排名提案說明',
          message: `本排名結果由 ${proposal.proposerDisplayName || '匿名用戶'} 提供，您可以選擇支持、反對或重新提案。若此排名在專案結算前獲得多數支持，將成為本階段最終排名依據。`,
          closable: true,
          autoClose: 0
        })
      } else if (!hasProposal) {
        addAlert({
          type: 'info',
          title: '開始提案',
          message: '目前尚無排名提案，您可以成為第一個提供排名的人！',
          closable: true,
          autoClose: 0
        })
      }
    },
    { deep: true }
  )

  // ===== Watch: Visible (Voting Mechanism Info) =====
  watch(visible, (newVal) => {
    if (newVal) {
      addAlert({
        type: 'info',
        title: '投票機制說明',
        message: '小組投票採用多數決原則，最終投票結果以截止日期當下的投票結果為準。您可以隨時變更投票，但每次變更都會記錄在投票趨勢中。',
        closable: true,
        autoClose: 10000 // 10 seconds
      })
    }
  })

  // ===== Watch: Withdraw Drawer =====
  watch(showWithdrawDrawer, (isOpen) => {
    if (isOpen) {
      clearAlerts()

      // Danger warning
      addAlert({
        type: 'error',
        title: '危險操作',
        message: '撤回提案是不可逆的操作！請仔細確認提案資訊後再進行撤回。',
        closable: false,
        autoClose: 0
      })

      // Operation instructions
      addAlert({
        type: 'warning',
        title: '操作說明',
        message: '為確保您了解此操作的嚴重性，請在下方輸入框中輸入 "REVERT"（區分大小寫）以啟用撤回按鈕。',
        closable: false,
        autoClose: 0
      })
    } else {
      clearAlerts()
    }
  })

  // ===== Watch: Reset Drawer =====
  watch(showResetDrawer, (isOpen) => {
    if (isOpen) {
      clearAlerts()

      const maxResets = getMaxResetCount()
      const remainingResets = maxResets - resetCount.value

      // Severe warning
      addAlert({
        type: 'error',
        title: '嚴重警告',
        message: `重置投票是不可逆的操作！每組每階段最多 ${maxResets} 次重置機會，目前剩餘 ${remainingResets} 次。`,
        closable: false,
        autoClose: 0
      })

      // Operation instructions
      addAlert({
        type: 'warning',
        title: '操作說明',
        message: '重置後將創建新提案，所有組員需重新投票。請在下方輸入框中輸入 "RESET"（區分大小寫）以啟用重置按鈕。',
        closable: false,
        autoClose: 0
      })

      // Current vote status
      if (currentResetInfo.value) {
        const support = currentResetInfo.value.supportCount
        const oppose = currentResetInfo.value.opposeCount
        const isTied = support === oppose
        addAlert({
          type: 'info',
          title: '當前投票狀況',
          message: `支持 ${support} 票，反對 ${oppose} 票（${isTied ? '平手' : '反對票多'}）。已有 ${currentResetInfo.value.totalVotes}/${currentResetInfo.value.memberCount} 人投票。`,
          closable: true,
          autoClose: 0
        })
      }
    } else {
      clearAlerts()
    }
  })

  return {
    addAlert,
    clearAlerts
  }
}
