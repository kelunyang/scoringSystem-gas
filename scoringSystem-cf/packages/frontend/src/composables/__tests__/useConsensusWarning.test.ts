/**
 * useConsensusWarning 的回歸測試
 *
 * 重點在「hasCurrentGroupSubmitted 回傳的是物件不是布林」這件事：
 * ProjectDetail 傳進來的是 `{ submitted, approved, groupData }`，
 * 物件恆為 truthy，所以原本用 `!hasCurrentGroupSubmitted(stage)` 判斷
 * 「尚未提交」的地方永遠得到 false。
 */

import { describe, test, expect } from 'vitest'
import { useConsensusWarning, type GroupSubmissionStatus } from '../useConsensusWarning'
import type { Stage } from '@/types'

const activeStage = { id: 'stg_1', stageId: 'stg_1', name: '第一階段', status: 'active' } as unknown as Stage
const pendingStage = { id: 'stg_2', stageId: 'stg_2', name: '第二階段', status: 'pending' } as unknown as Stage

const notSubmitted: GroupSubmissionStatus = { submitted: false, approved: false, groupData: null }
const submitted: GroupSubmissionStatus = { submitted: true, approved: false, groupData: {} }

describe('useConsensusWarning', () => {
  describe('shouldShowNotSubmittedWarning', () => {
    test('active 階段、本組尚未提交時要顯示警告', () => {
      const { shouldShowNotSubmittedWarning } = useConsensusWarning()
      expect(shouldShowNotSubmittedWarning(activeStage, () => notSubmitted)).toBe(true)
    })

    test('本組已提交時不顯示', () => {
      const { shouldShowNotSubmittedWarning } = useConsensusWarning()
      expect(shouldShowNotSubmittedWarning(activeStage, () => submitted)).toBe(false)
    })

    test('非 active 階段一律不顯示', () => {
      const { shouldShowNotSubmittedWarning } = useConsensusWarning()
      expect(shouldShowNotSubmittedWarning(pendingStage, () => notSubmitted)).toBe(false)
    })
  })

  describe('shouldShowConsensusWarning', () => {
    test('尚未提交時不顯示共識警告，即使有 groupData', () => {
      const { shouldShowConsensusWarning } = useConsensusWarning()
      const result = shouldShowConsensusWarning(
        activeStage,
        () => notSubmitted,
        () => ({ submissionId: 'sub_1', votingData: null })
      )
      expect(result).toBe(false)
    })

    test('已提交但投票資料還沒載入時顯示警告', () => {
      const { shouldShowConsensusWarning } = useConsensusWarning()
      const result = shouldShowConsensusWarning(
        activeStage,
        () => submitted,
        () => ({ submissionId: 'sub_1', votingData: null })
      )
      expect(result).toBe(true)
    })

    test('已提交且所有提案參與者都投過票時不顯示警告', () => {
      const { shouldShowConsensusWarning } = useConsensusWarning()
      const result = shouldShowConsensusWarning(
        activeStage,
        () => submitted,
        () => ({
          submissionId: 'sub_1',
          participationProposal: { 'a@example.com': 50, 'b@example.com': 50 },
          votingData: { votes: [{ voterEmail: 'a@example.com' }, { voterEmail: 'b@example.com' }] }
        })
      )
      expect(result).toBe(false)
    })

    test('還有人沒投票時顯示警告', () => {
      const { shouldShowConsensusWarning } = useConsensusWarning()
      const result = shouldShowConsensusWarning(
        activeStage,
        () => submitted,
        () => ({
          submissionId: 'sub_1',
          participationProposal: { 'a@example.com': 50, 'b@example.com': 50 },
          votingData: { votes: [{ voterEmail: 'a@example.com' }] }
        })
      )
      expect(result).toBe(true)
    })
  })

  describe('shouldShowConsensusSuccess', () => {
    test('尚未提交時不顯示成功提示', () => {
      const { shouldShowConsensusSuccess } = useConsensusWarning()
      const result = shouldShowConsensusSuccess(
        activeStage,
        () => notSubmitted,
        () => ({
          submissionId: 'sub_1',
          participationProposal: { 'a@example.com': 100 },
          votingData: { votes: [{ voterEmail: 'a@example.com' }] }
        })
      )
      expect(result).toBe(false)
    })
  })
})
