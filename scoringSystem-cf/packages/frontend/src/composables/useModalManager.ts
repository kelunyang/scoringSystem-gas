/**
 * @fileoverview Modal state management composable
 * Modal 狀態管理 composable
 *
 * 從 ProjectDetail.vue 提取的 Modal 管理邏輯
 * 統一管理 9 個不同 Modal 的可見性和數據
 */

import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { Stage, Group } from '@/types'
import type { ExtendedStage } from './useStageContentManagement'

/** 開 Modal 時只會讀到階段的這幾個欄位 */
type ModalStage = Pick<Stage, 'status' | 'groups'> & { id?: string }

/** 回覆評論 Modal 需要的原評論資訊 */
export interface ReplyCommentTarget {
  commentId: string
  authorName?: string
  content?: string
  mentionedGroups?: string[]
  mentionedUsers?: string[]
}

/** 成果投票 Modal 的資料 */
export interface ModalVoteData {
  proposer: string
  timeline: unknown[]
  rankings: unknown[]
}

/** 使用者所屬組資訊（傳給 VoteResultModal） */
export interface ModalUserGroupInfo {
  groupId?: string
  groupName?: string
  isGroupLeader?: boolean
  groupMemberCount?: number
}

/**
 * Modal 管理 composable
 * @returns {Object} Modal 狀態和控制函數
 */
export function useModalManager() {
  console.log('🔧 [useModalManager] composable 初始化')

  // ===== Modal 可見性狀態 =====
  const showVoteResultModal = ref(false)
  const showSubmitReportModal = ref(false)
  const showSubmitCommentModal = ref(false)
  const showCommentVoteModal = ref(false)
  const showGroupSubmissionApprovalModal = ref(false)
  const showTeacherRankingModal = ref(false)
  const showTeacherVoteModal = ref(false)
  const showVotingAnalysisModal = ref(false)
  const showCommentVotingAnalysisModal = ref(false)
  const showReplyCommentModal = ref(false)

  // ===== Modal 數據狀態 =====
  const currentModalStageId = ref<string>('')
  const currentModalSubmissionId = ref<string>('')
  const currentModalGroupMembers = ref<unknown[]>([])
  const currentModalSubmissionData = ref<Record<string, unknown>>({})
  const currentModalStageGroups = ref<Group[]>([])
  const currentModalStageIsSettled = ref<boolean>(false)
  const currentModalVoteData = ref<ModalVoteData>({
    proposer: '載入中...',
    timeline: [],
    rankings: []
  })
  const currentModalUserGroupInfo = ref<ModalUserGroupInfo | null>(null)
  const currentReplyComment = ref<ReplyCommentTarget | null>(null)
  const currentModalActiveGroupsCount = ref<number>(4)

  // ===== 計算屬性：從 stages 動態獲取 Modal 相關數據 =====

  /**
   * 創建當前階段數據的計算函數
   * @param {Ref<Array>} stages - 階段陣列 ref
   * @returns {ComputedRef} 當前階段對象
   */
  function useCurrentModalStage(stages: Ref<ExtendedStage[]> | ComputedRef<ExtendedStage[]>) {
    return computed(() => {
      return stages.value.find((s: ExtendedStage) => s.id === currentModalStageId.value) || null
    })
  }

  /**
   * 創建當前階段標題的計算函數
   * @param {Ref<Array>} stages - 階段陣列 ref
   * @returns {ComputedRef} 階段標題
   */
  function useCurrentModalStageTitle(stages: Ref<ExtendedStage[]> | ComputedRef<ExtendedStage[]>) {
    return computed(() => {
      const stage = stages.value.find((s: ExtendedStage) => s.id === currentModalStageId.value)
      return stage ? stage.title : ''
    })
  }

  /**
   * 創建當前階段報告獎金的計算函數
   * @param {Ref<Array>} stages - 階段陣列 ref
   * @returns {ComputedRef} 報告獎金
   */
  function useCurrentModalStageReward(stages: Ref<ExtendedStage[]> | ComputedRef<ExtendedStage[]>) {
    return computed(() => {
      const stage = stages.value.find((s: ExtendedStage) => s.id === currentModalStageId.value)
      return stage ? stage.reportReward : 0
    })
  }

  /**
   * 創建當前階段評論獎金的計算函數
   * @param {Ref<Array>} stages - 階段陣列 ref
   * @returns {ComputedRef} 評論獎金
   */
  function useCurrentModalStageCommentReward(stages: Ref<ExtendedStage[]> | ComputedRef<ExtendedStage[]>) {
    return computed(() => {
      const stage = stages.value.find((s: ExtendedStage) => s.id === currentModalStageId.value)
      return stage ? stage.commentReward : 0
    })
  }

  // ===== Modal 控制函數 =====

  /**
   * 打開階段成果投票 Modal
   * @param {Object} stage - 階段對象
   * @param {Function} loadVoteDataFn - 載入投票數據的函數
   */
  async function openVoteResultModal(
    stage: Stage | ExtendedStage,
    loadVoteDataFn?: ((stage: Stage | ExtendedStage) => Promise<void> | void) | null
  ) {
    try {
      currentModalStageId.value = stage.id ?? ''

      if (loadVoteDataFn) {
        await loadVoteDataFn(stage)
      }

      showVoteResultModal.value = true
      console.log('開啟階段成果投票彈窗:', stage)
    } catch (error) {
      console.error('開啟投票彈窗失敗:', error)
      throw error
    }
  }

  /**
   * 打開提交報告 Modal
   * @param {Object} stage - 階段對象
   * @param {Number} activeGroupsCount - 該階段活躍組數
   */
  function openSubmitReportModal(stage: ModalStage, activeGroupsCount = 4) {
    currentModalStageId.value = stage.id ?? ''
    currentModalActiveGroupsCount.value = activeGroupsCount
    showSubmitReportModal.value = true
    console.log('開啟提交報告彈窗:', stage, `活躍組數: ${activeGroupsCount}`)
  }

  /**
   * 打開提交評論 Modal
   * @param {Object} stage - 階段對象
   */
  function openSubmitCommentModal(stage: ModalStage) {
    currentModalStageId.value = stage.id ?? ''
    showSubmitCommentModal.value = true
    console.log('開啟提交評論彈窗:', stage)
  }

  /**
   * 打開評論投票 Modal
   * @param {Object} stage - 階段對象
   */
  function openCommentVoteModal(stage: ModalStage) {
    currentModalStageId.value = stage.id ?? ''
    showCommentVoteModal.value = true
    console.log('開啟評論投票彈窗:', stage)
  }

  /**
   * 打開群組提交確認 Modal
   * @param {Object} stage - 階段對象
   * @param {Object} submissionData - 提交數據
   * @param {Array} groupMembers - 群組成員
   */
  function openGroupSubmissionApprovalModal(
    stage: ModalStage,
    submissionData: Record<string, unknown> & { submissionId?: string },
    groupMembers: unknown[]
  ) {
    currentModalStageId.value = stage.id ?? ''
    currentModalSubmissionId.value = submissionData.submissionId ?? ''
    currentModalGroupMembers.value = groupMembers
    currentModalSubmissionData.value = submissionData
    showGroupSubmissionApprovalModal.value = true
    console.log('開啟群組提交確認彈窗:', stage)
  }

  /**
   * 打開教師排名 Modal
   * @param {Object} stage - 階段對象
   */
  function openTeacherRankingModal(stage: ModalStage) {
    currentModalStageId.value = stage.id ?? ''
    currentModalStageGroups.value = stage.groups || []
    showTeacherRankingModal.value = true
    console.log('開啟教師排名彈窗:', stage)
  }

  /**
   * 打開教師投票 Modal
   * @param {Object} stage - 階段對象
   */
  function openTeacherVoteModal(stage: ModalStage) {
    currentModalStageId.value = stage.id ?? ''
    currentModalStageGroups.value = stage.groups || []
    showTeacherVoteModal.value = true
    console.log('開啟教師投票彈窗:', stage)
  }

  /**
   * 打開投票分析 Modal
   * @param {string} type - 分析類型 ('report' | 'comment')
   * @param {Object} stage - 階段對象
   */
  function openAnalysisModal(type: string, stage: ModalStage) {
    currentModalStageId.value = stage.id ?? ''
    currentModalStageIsSettled.value = (stage.status === 'completed')

    if (type === 'report') {
      showVotingAnalysisModal.value = true
      console.log('開啟互評計票分析彈窗:', stage)
    } else if (type === 'comment') {
      showCommentVotingAnalysisModal.value = true
      console.log('開啟評論計票分析彈窗:', stage)
    }
  }

  /**
   * 打開回復評論 Modal
   * @param {Object} commentData - 評論數據
   * @param {string} stageId - 階段 ID
   */
  function openReplyCommentModal(commentData: ReplyCommentTarget, stageId: string) {
    currentReplyComment.value = {
      commentId: commentData.commentId,
      authorName: commentData.authorName,
      content: commentData.content || '',
      mentionedGroups: commentData.mentionedGroups,
      mentionedUsers: commentData.mentionedUsers
    }
    currentModalStageId.value = stageId
    showReplyCommentModal.value = true
    console.log('開啟回復評論彈窗:', commentData)
  }

  /**
   * 關閉所有 Modal
   */
  function closeAllModals() {
    showVoteResultModal.value = false
    showSubmitReportModal.value = false
    showSubmitCommentModal.value = false
    showCommentVoteModal.value = false
    showGroupSubmissionApprovalModal.value = false
    showTeacherRankingModal.value = false
    showTeacherVoteModal.value = false
    showVotingAnalysisModal.value = false
    showCommentVotingAnalysisModal.value = false
    showReplyCommentModal.value = false
    console.log('所有 Modal 已關閉')
  }

  /**
   * 重置 Modal 數據
   */
  function resetModalData() {
    currentModalStageId.value = ''
    currentModalSubmissionId.value = ''
    currentModalGroupMembers.value = []
    currentModalSubmissionData.value = {}
    currentModalStageGroups.value = []
    currentModalStageIsSettled.value = false
    currentModalVoteData.value = {
      proposer: '載入中...',
      timeline: [],
      rankings: []
    }
    currentModalUserGroupInfo.value = null
    currentReplyComment.value = null
    console.log('Modal 數據已重置')
  }

  return {
    // Modal 可見性狀態
    showVoteResultModal,
    showSubmitReportModal,
    showSubmitCommentModal,
    showCommentVoteModal,
    showGroupSubmissionApprovalModal,
    showTeacherRankingModal,
    showTeacherVoteModal,
    showVotingAnalysisModal,
    showCommentVotingAnalysisModal,
    showReplyCommentModal,

    // Modal 數據狀態
    currentModalStageId,
    currentModalSubmissionId,
    currentModalGroupMembers,
    currentModalSubmissionData,
    currentModalStageGroups,
    currentModalStageIsSettled,
    currentModalVoteData,
    currentModalUserGroupInfo,
    currentReplyComment,
    currentModalActiveGroupsCount,

    // 計算函數工廠
    useCurrentModalStage,
    useCurrentModalStageTitle,
    useCurrentModalStageReward,
    useCurrentModalStageCommentReward,

    // Modal 控制函數
    openVoteResultModal,
    openSubmitReportModal,
    openSubmitCommentModal,
    openCommentVoteModal,
    openGroupSubmissionApprovalModal,
    openTeacherRankingModal,
    openTeacherVoteModal,
    openAnalysisModal,
    openReplyCommentModal,
    closeAllModals,
    resetModalData
  }
}
