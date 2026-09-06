/**
 * @fileoverview Consensus warning logic composable
 * 共識警告邏輯 composable
 *
 * 從 ProjectDetail.vue 提取的共識警告邏輯
 * 負責檢測並顯示階段共識問題警告
 */

import type { Stage, Group } from '@/types'
import type { ExtendedStage } from './useStageContentManagement'

/** 共識檢查會讀到的群組資料形狀 */
export interface ConsensusGroupData {
  submissionId?: string
  submission?: {
    participationProposal?: string | Record<string, number> | null
  }
  participationProposal?: string | Record<string, number> | null
  votingData?: {
    votes?: Array<{ voterEmail?: string }>
  } | null
}

/** 呼叫端的「本組是否已提交」回傳值（注意：是物件，不是布林） */
export interface GroupSubmissionStatus {
  submitted: boolean
  approved: boolean
  groupData?: unknown
}

/**
 * 共識警告 composable
 * @returns {Object} 共識警告相關函數
 */
export function useConsensusWarning() {
  console.log('🔧 [useConsensusWarning] composable 初始化')

  /**
   * 判斷是否應該顯示共識警告
   * @param {Object} stage - 階段對象
   * @param {Function} hasCurrentGroupSubmitted - 檢查當前組是否已提交的函數
   * @param {Function} getCurrentGroupData - 獲取當前組數據的函數
   * @returns {boolean}
   */
  function shouldShowConsensusWarning<S extends Stage | ExtendedStage>(
    stage: S,
    hasCurrentGroupSubmitted: (stage: S) => GroupSubmissionStatus,
    getCurrentGroupData: (stage: S) => ConsensusGroupData | null | undefined
  ) {
    console.log('🔍 [shouldShowConsensusWarning] 開始檢查', {
      stageId: stage.id,
      stageName: stage.name,
      stageStatus: stage.status
    })

    // 只在 active 階段顯示分工投票共識警告
    if (stage.status !== 'active') {
      console.log('❌ [shouldShowConsensusWarning] 不是 active 階段，不顯示警告')
      return false
    }

    // 只在有提交的階段顯示警告
    const hasSubmitted = hasCurrentGroupSubmitted(stage)
    console.log('📝 [shouldShowConsensusWarning] 檢查是否已提交:', hasSubmitted)
    if (!hasSubmitted) {
      console.log('❌ [shouldShowConsensusWarning] 尚未提交，不顯示警告')
      return false
    }

    const groupData = getCurrentGroupData(stage)
    console.log('📦 [shouldShowConsensusWarning] groupData:', {
      hasGroupData: !!groupData,
      hasSubmissionId: !!groupData?.submissionId,
      hasVotingData: !!groupData?.votingData,
      groupData: groupData
    })

    if (!groupData || !groupData.submissionId) {
      console.log('❌ [shouldShowConsensusWarning] 沒有 groupData 或 submissionId')
      return false
    }

    // 如果還沒有投票資料，顯示警告（等資料載入完成）
    if (!groupData.votingData) {
      console.log('⚠️ [shouldShowConsensusWarning] 沒有 votingData，顯示警告')
      return true
    }

    // 檢查共識狀態
    const hasIssue = hasGroupConsensusIssue(stage, groupData)
    console.log('🎯 [shouldShowConsensusWarning] hasGroupConsensusIssue 結果:', hasIssue)
    return hasIssue
  }

  /**
   * 檢查階段是否存在共識問題
   * @param {Object} stage - 階段對象
   * @returns {boolean}
   */
  function hasConsensusIssue(stage: Stage | ExtendedStage) {
    if (!stage.groups || stage.groups.length === 0) {
      return false
    }

    // 檢查是否有足夠的投票參與
    const totalGroups = stage.groups.length
    const groupsWithVotes = stage.groups.filter((group: Group) =>
      group.voteRank && String(group.voteRank) !== '-'
    ).length
    const participationRate = groupsWithVotes / totalGroups

    // 如果參與率低於70%，顯示警告
    return participationRate < 0.7
  }

  /**
   * 檢查群組層級的共識問題
   * @param {Object} stage - 階段對象
   * @param {Object} groupData - 群組數據
   * @returns {boolean}
   */
  function hasGroupConsensusIssue(stage: Stage | ExtendedStage, groupData: ConsensusGroupData) {
    try {
      console.log('🔍 [hasGroupConsensusIssue] 開始檢查群組共識')

      const submissionData = groupData.submission || groupData
      const participationProposal = typeof submissionData.participationProposal === 'string'
        ? JSON.parse(submissionData.participationProposal)
        : submissionData.participationProposal || {}

      console.log('📋 [hasGroupConsensusIssue] participationProposal:', participationProposal)

      const proposedParticipants = Object.keys(participationProposal).filter(email =>
        participationProposal[email] > 0
      )

      console.log('👥 [hasGroupConsensusIssue] proposedParticipants:', proposedParticipants)

      // 如果沒有提案參與者，無法判斷
      if (proposedParticipants.length === 0) {
        console.log('❌ [hasGroupConsensusIssue] 沒有提案參與者')
        return false
      }

      // 檢查是否所有提案參與者都已投票
      const votingData = groupData.votingData || {}
      console.log('🗳️ [hasGroupConsensusIssue] votingData:', votingData)

      // votingData.votes 是陣列，需要轉換為已投票的 email 列表
      const votedMembers = Array.isArray(votingData.votes)
        ? votingData.votes.map(v => v.voterEmail)
        : []

      console.log('✅ [hasGroupConsensusIssue] votedMembers:', votedMembers)

      const allVoted = proposedParticipants.every(email =>
        votedMembers.includes(email)
      )

      console.log('🎯 [hasGroupConsensusIssue] allVoted:', allVoted)

      const notVotedMembers = proposedParticipants.filter(email =>
        !votedMembers.includes(email)
      )
      console.log('⏳ [hasGroupConsensusIssue] notVotedMembers:', notVotedMembers)

      // 如果還有人未投票，顯示警告
      const hasIssue = !allVoted
      console.log(`${hasIssue ? '⚠️' : '✅'} [hasGroupConsensusIssue] 最終結果:`, hasIssue)
      return hasIssue
    } catch (error) {
      console.error('❌ [hasGroupConsensusIssue] 檢查群組共識問題失敗:', error)
      return false
    }
  }

  /**
   * 獲取共識警告標題
   * @param {Object} stage - 階段對象
   * @returns {string}
   */
  function getConsensusWarningTitle(stage: Stage) {
    if (stage.status === 'voting') {
      const totalGroups = stage.groups?.length || 0
      const groupsWithVotes = stage.groups?.filter((group: Group) =>
        group.voteRank && String(group.voteRank) !== '-'
      ).length || 0
      const participationRate = totalGroups > 0 ? groupsWithVotes / totalGroups : 0

      if (participationRate < 0.5) {
        return '投票參與度過低'
      } else if (participationRate < 0.7) {
        return '投票參與度不足'
      }
    }

    return '共識警告'
  }

  /**
   * 獲取共識警告描述
   * @param {Object} stage - 階段對象
   * @param {Object} groupData - 群組數據
   * @returns {string}
   */
  function getConsensusWarningDescription(stage: Stage, groupData: ConsensusGroupData) {
    // 使用組內投票狀態的警告文本
    if (groupData) {
      const warningText = getGroupConsensusWarningText(groupData)
      if (warningText) {
        return warningText
      }
    }

    // 如果沒有 groupData 或無法獲取詳細信息，返回通用訊息
    return '請等待所有組員完成分工確認投票。'
  }

  /**
   * 獲取群組層級的共識警告文本
   * @param {Object} groupData - 群組數據
   * @returns {string}
   */
  function getGroupConsensusWarningText(groupData: ConsensusGroupData) {
    try {
      const submissionData = groupData.submission || groupData
      const participationProposal = typeof submissionData.participationProposal === 'string'
        ? JSON.parse(submissionData.participationProposal)
        : submissionData.participationProposal || {}

      const proposedParticipants = Object.keys(participationProposal).filter(email =>
        participationProposal[email] > 0
      )

      const votingData = groupData.votingData || {}
      // votingData.votes 是陣列，需要轉換為已投票的 email 列表
      const votedMembers = Array.isArray(votingData.votes)
        ? votingData.votes.map(v => v.voterEmail)
        : []

      const notVotedMembers = proposedParticipants.filter(email =>
        !votedMembers.includes(email)
      )

      if (notVotedMembers.length > 0) {
        return `還有 ${notVotedMembers.length} 位成員尚未對分工提案投票，請等待所有成員完成投票後再提交報告。`
      }

      return ''
    } catch (error) {
      console.error('獲取群組共識警告文本失敗:', error)
      return '無法檢查投票狀態，請確認所有成員已完成投票。'
    }
  }

  /**
   * 判斷是否應該顯示未提交警告
   * @param {Object} stage - 階段對象
   * @param {Function} hasCurrentGroupSubmitted - 檢查當前組是否已提交的函數
   * @returns {boolean}
   */
  function shouldShowNotSubmittedWarning<S extends Stage | ExtendedStage>(
    stage: S,
    hasCurrentGroupSubmitted: (stage: S) => GroupSubmissionStatus
  ) {
    // 只在 active 階段顯示
    if (stage.status !== 'active') {
      return false
    }

    // 當前組尚未提交
    return !hasCurrentGroupSubmitted(stage)
  }

  /**
   * 判斷是否應該顯示共識成功提示
   * @param {Object} stage - 階段對象
   * @param {Function} hasCurrentGroupSubmitted - 檢查當前組是否已提交的函數
   * @param {Function} getCurrentGroupData - 獲取當前組數據的函數
   * @returns {boolean}
   */
  function shouldShowConsensusSuccess<S extends Stage | ExtendedStage>(
    stage: S,
    hasCurrentGroupSubmitted: (stage: S) => GroupSubmissionStatus,
    getCurrentGroupData: (stage: S) => ConsensusGroupData | null | undefined
  ) {
    // 只在 active 階段顯示
    if (stage.status !== 'active') {
      return false
    }

    // 只在有提交的階段顯示成功
    if (!hasCurrentGroupSubmitted(stage)) {
      return false
    }

    const groupData = getCurrentGroupData(stage)
    if (!groupData || !groupData.submissionId) {
      return false
    }

    // 如果還沒有投票資料，不顯示成功
    if (!groupData.votingData) {
      return false
    }

    // 檢查是否達成共識（所有人都已投票）
    return !hasGroupConsensusIssue(stage, groupData)
  }

  return {
    shouldShowConsensusWarning,
    hasConsensusIssue,
    hasGroupConsensusIssue,
    getConsensusWarningTitle,
    getConsensusWarningDescription,
    getGroupConsensusWarningText,
    shouldShowNotSubmittedWarning,
    shouldShowConsensusSuccess
  }
}
