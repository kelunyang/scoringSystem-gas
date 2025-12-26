<template>
  <div class="groups-section" v-loading="stage.loadingReports" element-loading-text="載入報告資料中..." style="min-height: 150px;">
    <!-- 無資料狀態 -->
    <EmptyState
      v-if="!stage.loadingReports && (!stage.groups || stage.groups.length === 0)"
      :icons="['fa-inbox']"
      title="尚未收到任何本階段的成果"
      type="info"
      :enable-animation="false"
    />

    <!-- 小組列表 -->
    <div v-for="group in stage.groups" :key="group.id">
      <div
        class="group-item"
        :class="{ 'report-expanded': group.showReport }"
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
            <span class="post-it-time" v-if="group.submitTime">
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

            <!-- voting 階段：維持現有看板 -->
            <template v-else-if="stage.status === 'voting'">
              <div class="stat">
                <span class="stat-label">結算名次</span>
                <StatNumberDisplay
                  :value="group.settlementRank || '-'"
                  :loading="group.rankingsLoading"
                  display-state="normal"
                  :enable-animation="true"
                  size="medium"
                />
              </div>
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
                  :groupMembers="getGroupMembersForAvatar(group)"
                  size="40px"
                  :autoHideDelay="3000"
                />
              </div>
            </div>
          </div>
        </template>

        <div class="group-actions" @click.stop>
          <button
            class="btn btn-outline btn-sm"
            @click="toggleGroupReport(group)"
            :class="{ active: group.showReport }"
          >
            {{ group.showReport ? '隱藏報告' : '查看報告' }}
          </button>
        </div>
      </div>

      <!-- 展開的報告內容 -->
      <div v-if="group.showReport" class="group-report-content">
        <div class="report-members">
          成員：{{ Array.isArray(group.memberNames) ? group.memberNames.join('、') : group.memberNames }}
        </div>
        <MarkdownViewer :content="group.reportContent" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
interface Props {
  stage: ExtendedStage
  currentUserGroupId: string | null
  projectGroups: Group[]
  groupApprovalVotesCache: Map<string, any>
  projectUserGroups: any[]
  projectUsers: any[]
  stageProposals: any[]
}

const props = defineProps<Props>()

/**
 * Events
 */
const emit = defineEmits<{
  'toggle-report': [group: Group]
  'refresh-rankings': [stageId: string]
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

  let groupMembers = []

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
      customMessage: '貴組未投共識票'
    }
  }

  // ✅ 修正：使用 API 返回的 totalMembers（與後端共識閾值一致）
  // 未達成共識
  if (votingData.agreeVotes < votingData.totalMembers) {
    return {
      customMessage: `需要 ${votingData.totalMembers} 票同意，目前只有 ${votingData.agreeVotes} 票`
    }
  }

  return undefined
}

/**
 * 檢查該組是否有提交過 ranking proposal
 */
function checkGroupSubmittedRanking(groupId: string, stage: ExtendedStage): boolean {
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

  /* Avatar 區域 - 與統計並排 */
  .stat-participants {
    padding: 0;
    border-top: none;
    margin-left: auto;             /* 推到右側 */
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
