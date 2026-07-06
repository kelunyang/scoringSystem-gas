<template>
  <div v-loading="stage.loadingReports" class="groups-section" element-loading-text="載入報告資料中..." style="min-height: 150px;">
    <!-- 無資料狀態 -->
    <EmptyState
      v-if="!stage.loadingReports && (!stage.groups || stage.groups.length === 0)"
      :icons="['fa-inbox']"
      title="尚未收到任何本階段的成果"
      type="info"
      :enable-animation="false"
    />

    <!-- 小組列表 -->
    <div v-for="group in stage.groups" :key="`${group.id}-${group.teacherRank}-${group.voteRank}-${group.rankingsLoading}`">
      <div
        class="group-item"
        :class="{
          'report-expanded': group.showReport,
          'not-pinned': props.pinnedGroupId && group.groupId !== props.pinnedGroupId
        }"
      >
        <!-- Post-it 標籤：顯示本組標識、組名和繳交時間 -->
        <el-tooltip :content="group.groupName || '未命名組別'" placement="top">
          <div class="group-name-post-it">
            <span
              v-if="isCurrentUserGroup(group)"
              class="current-group-indicator"
            >
              本組
            </span>
            <span class="group-name-text">
              {{ truncateGroupName(group.groupName, 5) }}
            </span>
            <span v-if="group.submitTime" class="post-it-time">
              {{ formatSubmissionTime(group.submitTime) }}
            </span>
          </div>
        </el-tooltip>

        <!-- pending 階段：不顯示 group-stats 和 AvatarGroup -->
        <template v-if="stage.status !== 'pending'">
          <div class="group-stats">
            <!-- active 階段：顯示共識投票狀態 -->
            <template v-if="stage.status === 'active'">
              <div class="stat">
                <span class="stat-label">參與者共識票數</span>
                <StatNumberDisplay
                  :value="getGroupConsensusVoteCount(group)"
                  :loading="group.approvalVotesLoading"
                  :display-state="getGroupConsensusDisplayState(group)"
                  :tooltip-data="getConsensusTooltipData(group)"
                  :enable-animation="true"
                  size="medium"
                />
              </div>
              <div class="stat">
                <span class="stat-label">貴組總人數</span>
                <StatNumberDisplay
                  :value="getGroupTotalMembers(group.groupId)"
                  :loading="false"
                  display-state="normal"
                  :enable-animation="true"
                  size="medium"
                />
              </div>
            </template>

            <!-- voting 階段：根據角色顯示不同內容 -->
            <template v-else-if="stage.status === 'voting'">
              <!-- 教師/觀察者視圖：顯示組別提案數 -->
              <template v-if="props.isTeacher">
                <div class="stat">
                  <span class="stat-label">組別提案數</span>
                  <StatNumberDisplay
                    :value="getGroupProposalCount(group)"
                    :loading="group.rankingsLoading"
                    :display-state="getTeacherProposalDisplayState(group)"
                    :tooltip-data="getTeacherProposalTooltipData(group)"
                    :enable-animation="true"
                    size="medium"
                  />
                </div>
                <div class="stat">
                  <span class="stat-label">老師給的排名</span>
                  <StatNumberDisplay
                    :value="group.teacherRank || '-'"
                    :loading="group.rankingsLoading"
                    :display-state="group.teacherRankData ? 'approved' : 'normal'"
                    :tooltip-data="getTeacherRankTooltipData(group)"
                    :enable-animation="true"
                    size="medium"
                  />
                </div>
              </template>

              <!-- 學生視圖：顯示投票名次 -->
              <template v-else>
                <div class="stat">
                  <span class="stat-label">貴組投票名次</span>
                  <StatNumberDisplay
                    :value="group.voteRank || '-'"
                    :loading="group.rankingsLoading"
                    :display-state="getVoteRankDisplayState(group, stage)"
                    :tooltip-data="getVoteRankTooltipData(group, stage)"
                    :enable-animation="true"
                    size="medium"
                  />
                </div>
                <div class="stat">
                  <span class="stat-label">老師給的排名</span>
                  <StatNumberDisplay
                    :value="group.teacherRank || '-'"
                    :loading="group.rankingsLoading"
                    :display-state="group.teacherRankData ? 'approved' : 'normal'"
                    :tooltip-data="getTeacherRankTooltipData(group)"
                    :enable-animation="true"
                    size="medium"
                  />
                </div>
              </template>
            </template>

            <!-- completed 階段：顯示最終結果 -->
            <template v-else-if="stage.status === 'completed'">
              <div class="stat">
                <span class="stat-label">最後結算名次</span>
                <StatNumberDisplay
                  :value="group.finalSettlementRank || '-'"
                  :loading="group.rankingsLoading"
                  display-state="normal"
                  :enable-animation="true"
                  size="medium"
                />
              </div>
              <div class="stat">
                <span class="stat-label">貴組獲得點數</span>
                <StatNumberDisplay
                  :value="group.earnedPoints || '-'"
                  :loading="group.rankingsLoading"
                  display-state="normal"
                  :enable-animation="true"
                  size="medium"
                />
              </div>
            </template>

            <!-- AvatarGroup - 移入 group-stats 內部以便小螢幕並排 -->
            <div class="stat stat-participants">
              <span class="stat-label">報告參與者</span>
              <div class="stat-content">
                <AvatarGroup
                  :group-members="getGroupMembersForAvatar(group)"
                  size="40px"
                  :auto-hide-delay="3000"
                />
              </div>
            </div>
          </div>
        </template>

        <div class="group-actions" @click.stop>
          <!-- 釘選按鈕 - 所有人可見 -->
          <el-tooltip
            :content="group.groupId === props.pinnedGroupId ? '取消釘選' : '釘選這組的各階段報告'"
            placement="top"
          >
            <button
              class="btn btn-outline btn-sm"
              :class="{ active: group.groupId === props.pinnedGroupId }"
              @click="togglePinGroup(group.groupId)"
            >
              <i class="fas fa-thumbtack"></i>
            </button>
          </el-tooltip>

          <!-- 評論這組報告按鈕 - 與「張貼評論」按鈕條件一致 -->
          <el-tooltip
            v-if="props.canComment && (stage.status === 'active' || props.isTeacher)"
            content="評論這組的報告"
            placement="top"
          >
            <button
              class="btn btn-outline btn-sm"
              @click="handleOpenCommentForGroup(group)"
            >
              <i class="fas fa-at"></i>
            </button>
          </el-tooltip>

          <!-- 強制撤回按鈕 - 僅教師可見，且只在 active 階段 -->
          <el-tooltip
            v-if="props.isTeacher && stage.status === 'active'"
            content="強制撤回本階段報告"
            placement="top"
          >
            <button
              class="btn btn-outline btn-sm btn-danger-outline"
              @click="handleForceWithdraw(group)"
            >
              <i class="fas fa-ban"></i>
            </button>
          </el-tooltip>

          <!-- 查看報告按鈕 -->
          <button
            class="btn btn-outline btn-sm"
            :class="{ active: group.showReport }"
            @click="toggleGroupReport(group)"
          >
            {{ group.showReport ? '隱藏報告' : '查看報告' }}
          </button>
        </div>
      </div>

      <!-- 展開的報告內容 -->
      <div v-if="group.showReport" class="group-report-content">
        <MarkdownViewer :content="group.reportContent" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// computed 未使用，已移除
import type { Group } from '@/types'
import type { ExtendedStage } from '@/composables/useStageContentManagement'
import StatNumberDisplay from './shared/StatNumberDisplay.vue'
import AvatarGroup from './common/AvatarGroup.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import EmptyState from './shared/EmptyState.vue'
import dayjs from 'dayjs'

/**
 * Props interface
 */
export interface Props {
  stage: ExtendedStage
  currentUserGroupId: string | null
  projectGroups: Group[]
  groupApprovalVotesCache: Map<string, any>
  projectUserGroups: any[]
  projectUsers: any[]
  stageProposals: any[]
  isTeacher?: boolean
  canComment?: boolean
  pinnedGroupId?: string | null
  projectId: string
}

const props = defineProps<Props>()

/**
 * Submission info for force withdraw
 */
interface ForceWithdrawSubmission {
  submissionId: string
  groupId: string
  groupName: string
  status: string
  submittedTime?: number
  createdTime?: number
  authors?: string | string[]
}

/**
 * Events
 */
const emit = defineEmits<{
  'toggle-report': [group: Group]
  'refresh-rankings': [stageId: string]
  'pin-group': [groupId: string | null]
  'force-withdraw': [submission: ForceWithdrawSubmission]
  'open-comment-modal': [stageId: string, groupId: string, groupName: string, participants: string[]]
}>()

/**
 * 檢查是否為當前用戶的群組
 */
function isCurrentUserGroup(group: Group): boolean {
  return group.groupId === props.currentUserGroupId
}

/**
 * 格式化提交時間
 */
function formatSubmissionTime(timestamp: number): string {
  if (!timestamp) return '-'
  const date = typeof timestamp === 'number' ? dayjs(timestamp) : dayjs(timestamp)
  return date.format('YYYY/MM/DD HH:mm:ss')
}

/**
 * 切換群組報告顯示
 */
function toggleGroupReport(group: Group) {
  // 直接修改屬性，確保響應式更新
  group.showReport = !group.showReport
  emit('toggle-report', group)
}

/**
 * 切換鎖定組別（僅教師可用）
 */
function togglePinGroup(groupId: string) {
  if (props.pinnedGroupId === groupId) {
    emit('pin-group', null)  // 取消鎖定
  } else {
    emit('pin-group', groupId)  // 設定鎖定
  }
}

/**
 * 處理強制撤回
 */
function handleForceWithdraw(group: Group) {
  // 檢查該組是否有 submission
  if (!group.submissionId) {
    console.warn('No submissionId found for group:', group.groupId)
    return
  }
  // 從 participationProposal 取得作者列表
  let authors: string[] = []
  if (group.participationProposal) {
    try {
      const proposal = typeof group.participationProposal === 'string'
        ? JSON.parse(group.participationProposal)
        : group.participationProposal
      authors = Object.keys(proposal)
    } catch (e) {
      console.warn('Failed to parse participationProposal:', e)
    }
  }
  // 發射事件，讓父組件處理 Drawer 顯示
  emit('force-withdraw', {
    submissionId: group.submissionId,
    groupId: group.groupId,
    groupName: group.groupName || '未命名組別',
    status: group.status || 'unknown',
    submittedTime: group.submitTime,
    authors: authors.length > 0 ? authors : undefined
  })
}

/**
 * 處理開啟評論 Modal 並預填 mention 該組
 */
function handleOpenCommentForGroup(group: Group) {
  // 從 participationProposal 取得參與者列表
  let participants: string[] = []
  if (group.participationProposal) {
    try {
      const proposal = typeof group.participationProposal === 'string'
        ? JSON.parse(group.participationProposal)
        : group.participationProposal
      participants = Object.keys(proposal)
    } catch (e) {
      console.warn('Failed to parse participationProposal:', e)
    }
  }

  emit('open-comment-modal', props.stage.id, group.groupId, group.groupName || '未命名組別', participants)
}

/**
 * 獲取群組成員的完整信息（用於 AvatarGroup 組件）
 * 優先使用 participationProposal（實際貢獻者），降級使用 userGroups（組內成員）
 */
function getGroupMembersForAvatar(group: Group) {
  if (!group.groupId) {
    return []
  }

  // 1. 解析 participationProposal（貢獻度數據）
  let participationMap = null
  if (group.participationProposal) {
    try {
      participationMap = typeof group.participationProposal === 'string'
        ? JSON.parse(group.participationProposal)
        : group.participationProposal
    } catch (error) {
      console.warn('Failed to parse participationProposal:', error)
    }
  }

  let groupMembers

  if (participationMap && Object.keys(participationMap).length > 0) {
    // 2. ✅ 使用 participationProposal 中的成員（實際提交者）
    groupMembers = Object.entries(participationMap).map(([userEmail, participation]) => {
      const user = props.projectUsers?.find((u: any) => u.userEmail === userEmail)
      return {
        userEmail: userEmail,                    // ✅ 修正欄位名稱（從 email 改為 userEmail）
        displayName: user?.displayName || userEmail.split('@')[0],
        participation: participation,
        role: 'member',                          // 稍後會重新分配
        avatarSeed: user?.avatarSeed,            // ✅ 新增 avatar 欄位
        avatarStyle: user?.avatarStyle,          // ✅ 新增 avatar 欄位
        avatarOptions: user?.avatarOptions       // ✅ 新增 avatar 欄位
      }
    })

    // 3. 檢查是否有真實百分比（任一成員 > 0 表示有權限）
    const hasRealPercentages = groupMembers.some((m: any) => m.participation > 0)

    if (hasRealPercentages) {
      // 3a. 有權限：排序並設置 role
      groupMembers.sort((a: any, b: any) => (b.participation || 0) - (a.participation || 0))
      groupMembers.forEach((member: any, index: number) => {
        member.role = index === 0 ? 'leader' : 'member'
      })
    } else {
      // 3b. 無權限（所有百分比為 0）：Fallback 到 userGroups
      groupMembers = props.projectUserGroups
        .filter((ug: any) => ug.groupId === group.groupId && ug.isActive)
        .map((ug: any) => {
          const user = props.projectUsers?.find((u: any) => u.userEmail === ug.userEmail)
          return {
            userEmail: ug.userEmail,             // ✅ 修正欄位名稱
            displayName: user?.displayName || ug.userEmail.split('@')[0],
            role: ug.role,
            participation: 0,
            avatarSeed: user?.avatarSeed,        // ✅ 新增 avatar 欄位
            avatarStyle: user?.avatarStyle,      // ✅ 新增 avatar 欄位
            avatarOptions: user?.avatarOptions   // ✅ 新增 avatar 欄位
          }
        })
    }
  } else {
    // 5. ✅ 降級方案：使用 userGroups 中的數據
    groupMembers = props.projectUserGroups
      .filter((ug: any) => ug.groupId === group.groupId && ug.isActive)
      .map((ug: any) => {
        const user = props.projectUsers?.find((u: any) => u.userEmail === ug.userEmail)
        return {
          userEmail: ug.userEmail,               // ✅ 修正欄位名稱
          displayName: user?.displayName || ug.userEmail.split('@')[0],
          role: ug.role,
          participation: 0,
          avatarSeed: user?.avatarSeed,          // ✅ 新增 avatar 欄位
          avatarStyle: user?.avatarStyle,        // ✅ 新增 avatar 欄位
          avatarOptions: user?.avatarOptions     // ✅ 新增 avatar 欄位
        }
      })
  }

  return groupMembers
}

/**
 * 獲取群組的共識票數量（同意票數）
 */
function getGroupConsensusVoteCount(group: Group): number | string {
  const votingData = props.groupApprovalVotesCache.get(group.groupId)

  if (!votingData) {
    return '-'
  }

  return votingData.agreeVotes || 0
}

/**
 * 獲取群組的共識票數量顯示狀態（Active 階段）
 * 根據 submission status 和投票數據判斷
 */
function getGroupConsensusDisplayState(group: Group): string {
  // 檢查 submission 是否已被批准（status = 'approved'）
  if (group.status === 'approved') {
    return 'approved' // <i class="fas fa-check-circle text-success"></i> 已達成共識，顯示綠色批准狀態
  }

  const votingData = props.groupApprovalVotesCache.get(group.groupId)

  // 無投票數據
  if (!votingData || votingData.totalVotes === 0) {
    return 'not-voted' // <i class="fas fa-times-circle text-danger"></i> 紅色，未投票
  }

  // ✅ 修正：使用 API 返回的 totalMembers（與後端共識閾值一致）
  // 後端從 participationProposal 計算總人數（實際參與者）
  // 前端必須使用相同的值，否則共識判斷會不一致
  if (votingData.agreeVotes < votingData.totalMembers) {
    return 'pending' // <i class="fas fa-exclamation-triangle"></i> 黃色虛線，等待中
  }

  // 已達成共識（agreeVotes >= totalMembers）
  return 'approved'
}

/**
 * 獲取群組總人數（isActive = 1）
 */
function getGroupTotalMembers(groupId: string): number {
  if (!props.projectUserGroups) return 0

  return props.projectUserGroups.filter(
    (ug: any) => ug.groupId === groupId && ug.isActive
  ).length
}

/**
 * 獲取共識票數量的 tooltip 數據（Active 階段）
 * <i class="fas fa-exclamation-triangle"></i> 注意：只有「貴組共識票數量」有 tooltip
 */
function getConsensusTooltipData(group: Group) {
  // 檢查 submission 是否已被批准
  if (group.status === 'approved') {
    return {
      customMessage: '貴組已對該成果達成共識'
    }
  }

  const votingData = props.groupApprovalVotesCache.get(group.groupId)

  // 無投票數據
  if (!votingData || votingData.totalVotes === 0) {
    return {
      customMessage: appendPendingMembers('貴組未投共識票', group, votingData)
    }
  }

  // ✅ 修正：使用 API 返回的 totalMembers（與後端共識閾值一致）
  // 未達成共識
  if (votingData.agreeVotes < votingData.totalMembers) {
    const base = `需要 ${votingData.totalMembers} 票同意，目前只有 ${votingData.agreeVotes} 票`
    return {
      customMessage: appendPendingMembers(base, group, votingData)
    }
  }

  return undefined
}

/**
 * 解析 email 對應的顯示名稱（降級為 email 前綴）
 */
function resolveConsensusDisplayName(email: string): string {
  const user = props.projectUsers?.find((u: any) => u.userEmail === email)
  return user?.displayName || email.split('@')[0]
}

/**
 * 計算該組尚未投共識票的參與者（依 participationProposal > 0 但不在 votes 內）
 * 回傳「姓名(email)」字串陣列
 */
function getConsensusPendingMembers(group: Group, votingData?: any): string[] {
  const data = votingData || props.groupApprovalVotesCache.get(group.groupId)
  if (!data) return []

  // 優先使用投票 API 回傳的 participationProposal（與後端共識門檻一致），降級用 group 上的
  let proposal: Record<string, number> = data.participationProposal || {}
  if (Object.keys(proposal).length === 0 && (group as any).participationProposal) {
    try {
      proposal = typeof (group as any).participationProposal === 'string'
        ? JSON.parse((group as any).participationProposal)
        : (group as any).participationProposal
    } catch {
      proposal = {}
    }
  }

  const participantEmails = Object.keys(proposal).filter(
    (email) => typeof proposal[email] === 'number' && proposal[email] > 0
  )
  const votedEmails = new Set((data.votes || []).map((v: any) => v.voterEmail))

  return participantEmails
    .filter((email) => !votedEmails.has(email))
    .map((email) => `${resolveConsensusDisplayName(email)}(${email})`)
}

/**
 * 在共識票 tooltip 訊息後附上「尚未投票」成員清單（若可計算）
 */
function appendPendingMembers(baseMessage: string, group: Group, votingData?: any): string {
  const pending = getConsensusPendingMembers(group, votingData)
  if (pending.length === 0) return baseMessage
  return `${baseMessage}\n尚未投票：\n${pending.join('\n')}`
}

/**
 * 檢查該組是否有提交過 ranking proposal
 */
function checkGroupSubmittedRanking(groupId: string, _stage: ExtendedStage): boolean {
  // 數據未載入時，默認返回 false（不標記為 not-voted）
  if (!props.stageProposals || !Array.isArray(props.stageProposals)) {
    return false
  }

  // 檢查是否有該組提交且未撤回的提案
  return props.stageProposals.some((p: any) =>
    p.groupId === groupId && p.status !== 'withdrawn'
  )
}

/**
 * 計算投票名次的顯示狀態（Voting 階段）
 * 結合 status 和 votingResult 欄位判斷
 */
function getVoteRankDisplayState(group: Group, stage: ExtendedStage): string {
  if (group.rankingsLoading) return 'normal'

  if (group.voteRankData) {
    const { status, votingResult } = group.voteRankData

    // ✅ 綠色打勾條件：已批准 OR (待批准 + 支持票領先)
    if (status === 'approved' || (status === 'pending' && votingResult === 'agree')) {
      return 'approved' // <i class="fas fa-check-circle text-success"></i> 綠色
    }

    // 🔴 紅色叉叉：pending + no_votes（尚無人投票）
    if (status === 'pending' && votingResult === 'no_votes') {
      return 'not-voted' // <i class="fas fa-times-circle text-danger"></i> 紅色
    }

    // ⚠️ 黃色虛線：pending + disagree 或 tie
    return 'pending' // <i class="fas fa-exclamation-triangle"></i> 黃色虛線
  }

  // 如果沒有 voteRankData 但在投票階段，檢查是否提交 ranking proposal
  if (stage.status === 'voting') {
    const hasSubmittedRanking = checkGroupSubmittedRanking(group.groupId, stage)
    if (!hasSubmittedRanking) {
      return 'not-voted' // <i class="fas fa-times-circle text-danger"></i> 紅色，未投票
    }
  }

  return 'normal'
}

/**
 * 獲取投票名次的提示框數據（Voting 階段）
 * 結合 status 和 votingResult 欄位判斷
 */
function getVoteRankTooltipData(group: Group, stage: ExtendedStage) {
  if (group.voteRankData) {
    const { status, votingResult } = group.voteRankData

    // 已批准
    if (status === 'approved') {
      return {
        customMessage: '貴組對排名投票已取得組內多數同意'
      }
    }

    // 支持票領先
    if (status === 'pending' && votingResult === 'agree') {
      return {
        customMessage: '貴組排名投票支持票領先'
      }
    }

    // 尚無人投票
    if (status === 'pending' && votingResult === 'no_votes') {
      return {
        customMessage: '貴組排名投票尚無人投票'
      }
    }

    // 其他 pending 狀態（反對票領先或票數持平）
    return {
      proposerName: group.voteRankData.proposerDisplayName || '未知',
      proposerLabel: '提議者',
      status: status || 'pending',
      timestamp: group.voteRankData.createdTime || null
    }
  }

  // 如果在投票階段且該組未提交排名，顯示提示訊息
  if (stage.status === 'voting') {
    const hasSubmittedRanking = checkGroupSubmittedRanking(group.groupId, stage)
    if (!hasSubmittedRanking) {
      return {
        customMessage: '貴組尚未投票'
      }
    }
  }

  return undefined
}

/**
 * 獲取教師排名的提示框數據
 */
function getTeacherRankTooltipData(group: Group) {
  if (!group.teacherRankData) return undefined

  return {
    proposerName: group.teacherRankData.teacherDisplayName || '教師',
    proposerLabel: '教師',
    status: 'approved',
    timestamp: group.teacherRankData.createdTime || null
  }
}

/**
 * 獲取組別提案數量（教師視圖）
 */
function getGroupProposalCount(group: Group): number | string {
  const stats = group.proposalStats
  if (!stats) return '-'
  return stats.versionCount || 0
}

/**
 * 計算教師視圖的提案狀態（displayState）
 * - dead (fa-skull): 無提案或版本數為 0
 * - approved (fa-check): 等待投票且同意票領先
 * - not-voted (fa-bomb): 其他情況（pending+disagree 或 非 pending）
 */
function getTeacherProposalDisplayState(group: Group): string {
  const stats = group.proposalStats

  // 無提案或版本數為 0
  if (!stats || stats.versionCount === 0) {
    return 'dead'  // fa-skull
  }

  // 等待投票且同意票領先
  if (stats.latestStatus === 'pending' && stats.latestVotingResult === 'agree') {
    return 'approved'  // fa-check
  }

  // 其他情況（pending+disagree 或 非 pending）
  return 'not-voted'  // fa-bomb
}

/**
 * 獲取教師視圖的 Tooltip 數據
 */
function getTeacherProposalTooltipData(group: Group) {
  const stats = group.proposalStats

  if (!stats || stats.versionCount === 0) {
    return { customMessage: '該組尚未提出任何排名提案' }
  }

  const statusTextMap: Record<string, string> = {
    'settled': '已結算',
    'pending': '等待投票',
    'withdrawn': '已撤回',
    'reset': '已重設'
  }

  const votingResultTextMap: Record<string, string> = {
    'agree': '同意通過',
    'disagree': '反對否決',
    'tie': '票數持平',
    'no_votes': '尚無投票'
  }

  const statusText = statusTextMap[stats.latestStatus || ''] || stats.latestStatus || '未知'
  const votingText = votingResultTextMap[stats.latestVotingResult || ''] || stats.latestVotingResult || '未知'

  return {
    customMessage: `共 ${stats.versionCount} 版提案，最新狀態：${statusText}（${votingText}）`
  }
}

/**
 * 截斷組名（用於小螢幕顯示）
 */
function truncateGroupName(name: string | undefined, maxLength: number = 5): string {
  if (!name) return '未命名'
  return name.length > maxLength ? name.substring(0, maxLength) + '...' : name
}
</script>

<style scoped>
.groups-section {
  padding: 0;
  /* 確保內容可以完全展開 */
  overflow: visible;
  position: relative;
}

.group-item {
  position: relative;  /* 為 post-it 標籤提供定位基準 */
  display: flex;
  align-items: center;
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  gap: 25px;
  cursor: default;  /* 預設游標 */
  transition: background-color 0.2s;
}

.group-item:hover {
  background-color: #f8f9fa;
}

.group-item.report-expanded {
  cursor: default;  /* 預設游標 */
  background-color: #f0f2f5;
}

.group-item:last-child {
  border-bottom: none;
}

.group-stats {
  display: flex;
  gap: 25px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
  gap: 8px;  /* 標籤和數字之間的垂直間距 */
}

.stat-label {
  font-size: 12px;
  color: #7f8c8d;
  text-align: center;
}

/* stat-content 用於包裹 AvatarGroup */
.stat-content {
  margin-top: 8px;
}

/* stat-participants 樣式調整：靠左對齊 */
.stat-participants {
  align-items: flex-start;
}

.stat-participants .stat-content {
  display: flex;
  justify-content: flex-start; /* 從 center 改為 flex-start */
  align-items: flex-start;
}

/* Post-it 便籤標籤樣式 */
.group-name-post-it {
  position: absolute;
  top: -10px;
  left: -10px;
  display: flex;
  align-items: center;
  background: #2c3e50;
  color: white;
  padding: 0;  /* 移除內部 padding，由子元素控制 */
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
  z-index: 10;
  white-space: nowrap;
  overflow: hidden;  /* 確保圓角正確裁剪 */
}

/* 本組標識（紅底白字） */
.current-group-indicator {
  background: #e74c3c;  /* 紅底 */
  color: white;
  padding: 6px 10px;
  font-weight: 700;
  font-size: 12px;
  border-radius: 4px 0 0 4px;  /* 只有左側圓角 */
}

/* 組名文字 */
.group-name-text {
  padding: 6px 12px;
}

/* 繳交時間 */
.post-it-time {
  padding: 6px 12px 6px 0;
  font-size: 11px;
  opacity: 0.9;
}

/* 危險操作按鈕樣式 */
.btn-danger-outline {
  color: #f56c6c !important;
  border-color: #f56c6c !important;
}

.btn-danger-outline:hover {
  background-color: #f56c6c !important;
  color: white !important;
}

/* 非鎖定組別淡化 */
.group-item.not-pinned {
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.group-item.not-pinned:hover {
  opacity: 0.8;  /* hover 時稍微提高可見度 */
}

.group-name-post-it:hover {
  background: #34495e;
  transform: translateY(-2px);
  box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}

.group-name-post-it:hover .current-group-indicator {
  background: #c0392b;  /* 懸停時紅色變深 */
}

.group-names {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
}

.member-display {
  cursor: help;
}

.submission-time {
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
}

.current-group-tag {
  margin-left: 8px;
}

/* group-actions 推到最右邊 */
.group-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.report-members {
  font-size: 12px;
  color: #111;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid #eee;
}

.submission-status {
  margin-right: 15px;
}

.status-indicator {
  padding: 6px 12px;
  border-radius: 15px;
  font-size: 13px;
  font-weight: 500;
}

.status-indicator.early {
  background: #d4edda;
  color: #155724;
}

.status-indicator.early::before {
  content: "● ";
  color: #28a745;
}

.status-indicator.late {
  background: #f8d7da;
  color: #721c24;
}

.status-indicator.late::before {
  content: "● ";
  color: #dc3545;
}

.status-indicator.on-time {
  background: #cce7ff;
  color: #004085;
}

.status-indicator.on-time::before {
  content: "● ";
  color: #0066cc;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.group-report-content {
  border-top: 1px solid #e1e8ed;
  background: #f8f9fa;
  padding: 20px 25px;
  margin: 0;
  /* 確保報告內容可以完全展開 */
  overflow: visible;
  word-wrap: break-word;
}

.btn.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
}

/* ===== 小螢幕凸出式標題列 (< 768px) ===== */
@media (max-width: 767px) {
  .group-item {
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    gap: 0;
    border: 1px solid #e1e8ed;
    border-radius: 8px;
    margin-left: 10px;           /* 讓卡片內縮，標題列凸出 */
    margin-bottom: 15px;
    overflow: visible;           /* 允許標題列凸出 */
    position: relative;
  }

  .group-item:last-child {
    border-bottom: 1px solid #e1e8ed;
  }

  /* 凸出式標題列 - 保持原配色 */
  .group-name-post-it {
    position: absolute;
    top: 0;
    left: -10px;                 /* 向左凸出 10px */
    right: 0;
    width: calc(100% + 10px);    /* 延伸到卡片右邊緣 */
    border-radius: 8px 8px 0 0;
    justify-content: flex-start;
    padding: 8px 12px;
    background: #2c3e50;         /* 保持原有深藍灰 */
    color: white;                /* 保持白字 */
    box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
  }

  .group-name-post-it .current-group-indicator {
    background: #e74c3c;         /* 保持紅色 */
    color: white;
    padding: 4px 8px;
    font-size: 11px;
    border-radius: 4px;
    margin-right: 8px;
  }

  .group-name-post-it .group-name-text {
    padding: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .group-name-post-it .post-it-time {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.8;
    padding: 0;
  }

  /* 統計 + Avatar 並排 - 需為標題列留空間 */
  .group-stats {
    flex-direction: row;           /* 改為橫向排列 */
    flex-wrap: wrap;
    gap: 12px;
    padding: 50px 15px 12px 15px;  /* 上方留空給標題列 */
    width: 100%;
    align-items: center;
  }

  .stat {
    flex-direction: column;        /* 每個 stat 內部垂直排列 */
    align-items: center;
    min-width: auto;
    gap: 4px;
  }

  .stat-label {
    text-align: center;
    font-size: 11px;
  }

  /* Avatar 區域 - 直屏模式移至第二行 */
  .stat-participants {
    flex: 0 0 100%;                /* 不伸縮，基準寬度100%，強制換行 */
    margin-left: 0;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e1e8ed;
  }

  .stat-participants .stat-content {
    margin-top: 0;
  }

  /* 按鈕區域 */
  .group-actions {
    padding: 12px 15px;
    border-top: 1px solid #e1e8ed;
    margin-left: 0;
    justify-content: flex-end;
  }

  /* 報告內容 */
  .group-report-content {
    border-radius: 0 0 8px 8px;
  }
}
</style>
