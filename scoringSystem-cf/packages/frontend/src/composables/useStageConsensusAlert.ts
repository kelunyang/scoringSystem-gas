/**
 * useStageConsensusAlert
 *
 * Fetches per-group intra-group consensus status for a stage and, if any group
 * still has an unapproved submission (consensus incomplete), shows a drawer
 * warning that those groups cannot participate in voting.
 *
 * Used by the 成果排名/投票 drawers (TeacherVoteModal, TeacherRankingModal).
 *
 * @example
 * ```typescript
 * const { checkPendingConsensus } = useStageConsensusAlert()
 * await checkPendingConsensus(projectId, stageId)
 * ```
 */

import { ref } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useDrawerAlerts } from './useDrawerAlerts'

export function useStageConsensusAlert() {
  const { addAlert, removeAlert } = useDrawerAlerts()
  const currentAlertId = ref<string | null>(null)

  /**
   * Query consensus status and (re)show the warning alert when groups are pending.
   * Removes any previously-shown consensus alert from this instance first, so it is
   * safe to call on every drawer (re)load.
   */
  async function checkPendingConsensus(projectId: string, stageId: string): Promise<void> {
    if (currentAlertId.value) {
      removeAlert(currentAlertId.value)
      currentAlertId.value = null
    }

    if (!projectId || !stageId) return

    try {
      const httpResponse = await (rpcClient.submissions as any)['stage-consensus-status'].$post({
        json: { projectId, stageId }
      })
      const response = await httpResponse.json()

      if (response.success && response.data?.hasPendingConsensus) {
        const names = (response.data.pendingGroups || [])
          .map((g: any) => g.groupName)
          .filter(Boolean)
          .join('、')

        currentAlertId.value = addAlert({
          type: 'warning',
          title: '組內共識未完成',
          message: `有 ${names} 組未完成組內共識，無法參與投票`,
          closable: false,
          autoClose: 0
        })
      }
    } catch (error) {
      console.warn('[useStageConsensusAlert] 載入共識狀態失敗:', error)
    }
  }

  return { checkPendingConsensus }
}
