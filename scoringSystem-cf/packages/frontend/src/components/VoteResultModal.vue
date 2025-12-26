<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    :z-index="2000"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-vote-yea"></i>
          階段成果投票
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="vote-drawer-content" v-loading="loading" element-loading-text="載入投票資料中...">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 版本時間軸 -->
      <div v-if="proposalVersions.length > 0" class="version-selector-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-history"></i>
            提案版本時間軸
          </label>
        </div>

        <!-- 使用 VersionTimeline 組件 -->
        <VersionTimeline
          :versions="proposalVersions"
          :currentVersionId="selectedVersionId"
          versionIdKey="proposalId"
          createdTimeKey="createdTime"
          displayNameKey="proposerDisplayName"
          :formatTitleFn="(version, index) =>
            index === proposalVersions.length - 1 ? '最終版本' : formatVersionStepTime(version.createdTime)"
          @version-change="onVersionChange"
        >
          <template #description="{ version, index }">
            <div class="version-step-description">
              <div class="submitter-line">
                提交者：{{ version.proposerDisplayName }}
              </div>
              <div class="vote-stats-line">
                支持: {{ version.supportCount || 0 }} | 反對: {{ version.opposeCount || 0 }}
              </div>
              <div v-if="getVersionStatusText(version)" class="status-line">
                {{ getVersionStatusText(version) }}
              </div>
            </div>
          </template>
        </VersionTimeline>
      </div>

      <!-- 排名結果區域 -->
      <div class="ranking-section">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-trophy"></i>
            排名結果
          </h3>
        </div>

        <!-- 單欄顯示：沒有有效提案、或查看最新版本 -->
        <div v-if="!hasActiveProposal || !isViewingOldVersion" class="ranking-list-container">
          <DraggableRankingList
            :items="displayRankings"
            :disabled="hasExistingProposal && !isResubmitting"
            itemKey="groupId"
            itemLabel="groupName"
            @update:items="handleRankingUpdate"
          >
            <template #default="{ item }">
              <div class="group-info">
                <div class="group-header">
                  <div class="group-name">{{ item.groupName }}</div>
                  <div class="submission-time" v-if="item.submitTime">
                    {{ formatSubmissionTime(item.submitTime) }}
                  </div>
                </div>
                <div class="group-members" v-if="item.memberNames && item.memberNames.length > 0">
                  成員：{{ item.memberNames.join('、') }}
                </div>
                <div class="submission-preview" v-if="item.reportContent">
                  {{ truncateContent(item.reportContent) }}
                </div>
              </div>
            </template>
          </DraggableRankingList>
        </div>

        <!-- 兩欄對比顯示：查看舊版本且有有效提案時 -->
        <RankingComparison
          v-if="isViewingOldVersion && hasActiveProposal"
          leftTitle="最新版本"
          :rightTitle="formatVersionStepTime(currentProposal.createdTime)"
          :leftItems="latestProposalRankings"
          :rightItems="displayRankings"
          itemKey="groupId"
          itemLabel="groupName"
        />

        <!-- 點數分配視覺化 -->
        <div v-if="displayRankings.length > 0 && !isViewingOldVersion && showPointDistribution" class="point-distribution-section">
          <h3 class="section-title">
            <i class="fas fa-chart-bar"></i>
            成果排名點數分配
          </h3>

          <div class="chart-description">
            <i class="fas fa-info-circle"></i>
            依照您給的排名，並把貴組放在最後一名，模擬出來的最後點數分配
          </div>

          <AllGroupsChart
            :selected-members="[]"
            :simulated-rank="1"
            :simulated-group-count="allGroupsForChart.length"
            :report-reward="stageReportReward"
            :all-groups="allGroupsForChartWithPoints"
            :current-group-id="userGroupId"
            :total-project-groups="allGroupsForChart.length"
          />
        </div>

        <div class="ranking-list-container" v-if="!isViewingOldVersion">
          <div style="display: none;"></div>
          
          <div class="ranking-hint" v-if="isResubmitting">
            <i class="fas fa-lightbulb"></i>
            拖曳或使用箭頭按鈕調整排名順序
          </div>
          
          <div class="ranking-info" v-if="!hasExistingProposal || isResubmitting">
            <i class="fas fa-info-circle"></i>
            注意：排名列表已排除您所屬的組別，以確保投票公正性
          </div>
        </div>
      </div>

      <!-- 投票趨勢圖表 -->
      <div class="vote-visualization">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-chart-bar"></i>
            投票趨勢
          </h3>
        </div>

        <VoteMajorityTsumTsumChart
          :voteData="tsumTsumVoteData"
          :versionLabels="versionLabels"
          :versionStatuses="versionStatuses"
          :versionVotingResults="versionVotingResults"
          :groupMemberCount="userGroupInfo?.groupMemberCount || 0"
          :currentUserEmail="user?.userEmail || ''"
          chartTitle="各版本投票分佈（多數決）"
        />

      </div>

      <!-- 投票詳情列表 -->
      <div v-if="showVotingDetails && hasExistingProposal" class="votes-list-section">
        <h3>投票詳情</h3>
        <div class="votes-list">
          <!-- 已投票成員 -->
          <div
            v-for="vote in currentProposal.votes || []"
            :key="vote.voteId"
            class="vote-item"
            :class="{ agree: vote.agree === 1, disagree: vote.agree === -1 }"
          >
            <el-avatar
              :size="40"
              :src="getVoterAvatarUrl(vote)"
              class="voter-avatar"
            >
              {{ getVoterInitials(vote) }}
            </el-avatar>
            <div class="vote-info">
              <div class="voter-name">{{ vote.voterDisplayName || vote.voterEmail }}</div>
              <div class="vote-time">{{ formatTime(vote.timestamp) }}</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge" :class="{ agree: vote.agree === 1, disagree: vote.agree === -1 }">
                {{ vote.agree === 1 ? '支持' : '反對' }}
              </span>
            </div>
          </div>

          <!-- 未投票成員（顯示真實姓名） -->
          <div
            v-for="member in unvotedMembers"
            :key="'pending-' + member.userEmail"
            class="vote-item pending"
          >
            <el-avatar
              :size="40"
              :src="getMemberAvatarUrl(member)"
              class="voter-avatar"
            >
              {{ getMemberInitials(member) }}
            </el-avatar>
            <div class="vote-info">
              <div class="voter-name">{{ member.displayName || member.userEmail }}</div>
              <div class="vote-time">尚未投票</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge pending">待投票</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 投票和提案按鈕區域 -->
      <div class="drawer-actions">
        <!-- 提交排名提案按鈕 -->
        <el-button
          v-if="showSubmitProposalButton"
          type="primary"
          size="large"
          @click="submitNewProposal"
          :loading="isSubmittingNewProposal"
          :disabled="!hasValidRanking || isSubmittingNewProposal"
        >
          <i v-if="!isSubmittingNewProposal" class="fas fa-save"></i>
          提交排名提案
        </el-button>

        <!-- 投票按鈕：同意 -->
        <el-button
          v-if="showVoteButtons"
          type="success"
          size="large"
          @click="vote('support')"
          :loading="isSubmittingVote && voteType === 'support'"
          :disabled="isSubmittingVote"
          :class="{ voted: userVote === 'support' }"
        >
          <i v-if="!isSubmittingVote || voteType !== 'support'" class="fas fa-thumbs-up"></i>
          同意
          <span v-if="userVote === 'support'" class="vote-indicator">✓</span>
        </el-button>

        <!-- 投票按鈕：不同意 -->
        <el-button
          v-if="showVoteButtons"
          type="danger"
          size="large"
          @click="vote('oppose')"
          :loading="isSubmittingVote && voteType === 'oppose'"
          :disabled="isSubmittingVote"
          :class="{ voted: userVote === 'oppose' }"
        >
          <i v-if="!isSubmittingVote || voteType !== 'oppose'" class="fas fa-thumbs-down"></i>
          不同意
          <span v-if="userVote === 'oppose'" class="vote-indicator">✓</span>
        </el-button>

        <!-- 撤回排名提案按鈕 -->
        <el-button
          v-if="showVoteButtons"
          type="warning"
          size="large"
          :disabled="isSubmittingVote || isWithdrawing"
          :loading="isWithdrawing"
          @click="showWithdrawDrawer = true"
        >
          <i class="fas fa-undo"></i>
          撤回排名提案
        </el-button>

        <!-- 查看點數分配按鈕 -->
        <el-button
          v-if="displayRankings.length > 0 && !isViewingOldVersion"
          type="info"
          size="large"
          @click="showPointDistribution = !showPointDistribution"
        >
          <i :class="showPointDistribution ? 'fas fa-eye-slash' : 'fas fa-chart-bar'"></i>
          {{ showPointDistribution ? '關閉' : '查看' }}排名點數分配圖
        </el-button>

        <!-- 顯示/隱藏投票詳情按鈕 -->
        <el-button
          v-if="hasExistingProposal"
          type="info"
          size="large"
          @click="showVotingDetails = !showVotingDetails"
        >
          <i :class="showVotingDetails ? 'fas fa-eye-slash' : 'fas fa-list'"></i>
          {{ showVotingDetails ? '隱藏' : '顯示' }}投票詳情
        </el-button>

        <!-- 組長重置投票按鈕 -->
        <el-button
          v-if="showResetButton"
          type="danger"
          size="large"
          :disabled="isResetting"
          :loading="isResetting"
          @click="showResetDrawer = true"
        >
          <i class="fas fa-sync-alt"></i>
          重置組內投票（僅此一次機會）
        </el-button>

        <!-- 關閉按鈕（當沒有其他按鈕時顯示） -->
        <el-button
          v-if="!showSubmitProposalButton && !showVoteButtons && !showResetButton"
          size="large"
          @click="handleClose"
        >
          <i class="fas fa-times"></i>
          關閉
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- 撤回確認 Drawer -->
  <el-drawer
    v-model="showWithdrawDrawer"
    title="撤回排名提案"
    direction="ttb"
    size="100%"
    :z-index="2100"
    class="drawer-maroon"
    @close="handleWithdrawDrawerClose"
  >
    <template #header>
      <div class="withdraw-drawer-header">
        <i class="fas fa-exclamation-triangle"></i>
        撤回排名提案
      </div>
    </template>

    <div class="drawer-body" v-if="currentProposalInfo">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 提案資訊區域 -->
      <div class="form-section">
        <h4><i class="fas fa-info-circle"></i> 提案資訊</h4>

        <div class="proposal-info-grid">
          <div class="info-row">
            <span class="info-label">版本：</span>
            <span class="info-value">{{ currentProposalInfo.version }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">提案者：</span>
            <span class="info-value">{{ currentProposalInfo.proposer }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">提交時間：</span>
            <span class="info-value">{{ currentProposalInfo.createdTime }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">投票狀況：</span>
            <span class="info-value">
              支持 {{ currentProposalInfo.supportCount }} 票 /
              反對 {{ currentProposalInfo.opposeCount }} 票
              （共 {{ currentProposalInfo.totalVotes }} 票）
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">排名組數：</span>
            <span class="info-value">{{ currentProposalInfo.rankingsCount }} 個組別</span>
          </div>
          <div class="info-row">
            <span class="info-label">提案狀態：</span>
            <span class="info-value status-badge" :class="`status-${currentProposalInfo.status}`">
              {{ getVersionStatusText(currentProposal) || currentProposalInfo.status }}
            </span>
          </div>
        </div>
      </div>

      <!-- 撤回確認輸入區域 -->
      <div class="form-section">
        <h4><i class="fas fa-keyboard"></i> 確認撤回</h4>

        <div class="form-group">
          <label class="required">請輸入 <code class="revert-code">REVERT</code> 以確認撤回此提案：</label>
          <el-input
            v-model="withdrawInputText"
            placeholder="請輸入 REVERT"
            size="large"
            clearable
            maxlength="6"
            show-word-limit
            class="confirmation-code-input"
            @input="withdrawInputText = String($event).toUpperCase()"
          />
          <div class="input-hint">
            <i class="fas fa-lightbulb"></i>
            請完整輸入大寫字母 "REVERT"
          </div>
        </div>
      </div>

      <!-- 撤回說明 -->
      <div class="form-section warning-section">
        <h4><i class="fas fa-exclamation-circle"></i> 重要說明</h4>
        <ul class="warning-list">
          <li>撤回後，此提案將標記為「已撤回」狀態</li>
          <li>所有組員的投票記錄將保留，但不再生效</li>
          <li>撤回後，您可以重新提交新的排名提案</li>
          <li>此操作無法復原，請謹慎確認</li>
        </ul>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          size="large"
          :disabled="!canWithdraw || isWithdrawing"
          :loading="isWithdrawing"
          @click="confirmWithdraw"
        >
          <i v-if="!isWithdrawing" class="fas fa-check"></i>
          確認撤回提案
        </el-button>
        <el-button
          size="large"
          @click="handleWithdrawDrawerClose"
          :disabled="isWithdrawing"
        >
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>

    <!-- 如果沒有提案資訊 -->
    <div v-else class="drawer-body">
      <el-empty description="無法載入提案資訊" />
    </div>
  </el-drawer>

  <!-- 重置投票確認 Drawer -->
  <el-drawer
    v-model="showResetDrawer"
    title="重置組內投票"
    direction="ttb"
    size="100%"
    :z-index="2200"
    class="drawer-maroon"
    @close="handleResetDrawerClose"
  >
    <template #header>
      <div class="reset-drawer-header">
        <i class="fas fa-sync-alt"></i>
        重置組內投票
      </div>
    </template>

    <div class="drawer-body" v-if="currentResetInfo">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 投票資訊區域 -->
      <div class="form-section">
        <h4><i class="fas fa-poll"></i> 投票資訊</h4>

        <div class="proposal-info-grid">
          <div class="info-row">
            <span class="info-label">提案版本：</span>
            <span class="info-value">{{ currentResetInfo.version }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">提案者：</span>
            <span class="info-value">{{ currentResetInfo.proposer }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">提交時間：</span>
            <span class="info-value">{{ currentResetInfo.createdTime }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">組員數量：</span>
            <span class="info-value">{{ currentResetInfo.memberCount }} 人</span>
          </div>
          <div class="info-row">
            <span class="info-label">投票狀況：</span>
            <span class="info-value vote-status-tie">
              <i class="fas fa-balance-scale"></i>
              支持 {{ currentResetInfo.supportCount }} 票 /
              反對 {{ currentResetInfo.opposeCount }} 票
              （共 {{ currentResetInfo.totalVotes }} 票，平手）
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">重置次數：</span>
            <span class="info-value">
              {{ currentResetInfo.resetCount }} / 1
              <span v-if="currentResetInfo.resetCount === 0" style="color: #52c41a;">（尚未使用）</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 重置確認輸入區域 -->
      <div class="form-section">
        <h4><i class="fas fa-keyboard"></i> 確認重置</h4>

        <div class="form-group">
          <label class="required">請輸入 <code class="reset-code">RESET</code> 以確認重置投票：</label>
          <el-input
            v-model="resetInputText"
            placeholder="請輸入 RESET"
            size="large"
            clearable
            maxlength="5"
            show-word-limit
            class="confirmation-code-input"
            @input="resetInputText = String($event).toUpperCase()"
          />
          <div class="input-hint">
            <i class="fas fa-lightbulb"></i>
            請完整輸入大寫字母 "RESET"
          </div>
        </div>
      </div>

      <!-- 重置說明 -->
      <div class="form-section warning-section">
        <h4><i class="fas fa-exclamation-circle"></i> 重要說明</h4>
        <ul class="warning-list">
          <li>重置後，當前提案將標記為「已重置」狀態</li>
          <li>系統會創建一個新的提案，使用相同的排名資料</li>
          <li>所有組員需要對新提案重新投票</li>
          <li>舊提案的投票記錄將保留，但不再生效</li>
          <li><strong>每組每階段只有一次重置機會</strong>，使用後無法再次重置</li>
          <li>此操作無法復原，請謹慎確認</li>
        </ul>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          size="large"
          :disabled="!canReset || isResetting"
          :loading="isResetting"
          @click="confirmReset"
        >
          <i v-if="!isResetting" class="fas fa-check"></i>
          確認重置投票
        </el-button>
        <el-button
          size="large"
          @click="handleResetDrawerClose"
          :disabled="isResetting"
        >
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>

    <!-- 如果沒有提案資訊 -->
    <div v-else class="drawer-body">
      <el-empty description="無法載入提案資訊" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef } from 'vue'
import VoteMajorityTsumTsumChart from './charts/VoteMajorityTsumTsumChart.vue'
import VersionTimeline from './common/VersionTimeline.vue'
import RankingComparison from './common/RankingComparison.vue'
import DraggableRankingList from './common/DraggableRankingList.vue'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useAvatar } from '@/composables/useAvatar'
import { useRankingProposals, type SubmittedGroup, type RankingData } from '@/composables/useRankingProposals'
import { useVoteResultAlerts } from '@/composables/useVoteResultAlerts'

// ============= TypeScript Types =============

interface VoteData {
  reportReward?: number
  [key: string]: unknown
}

interface User {
  userEmail?: string
  displayName?: string
  [key: string]: unknown
}

interface UserGroupInfoProp {
  groupId?: string
  groupName?: string
  isGroupLeader?: boolean
  groupMemberCount?: number
  [key: string]: unknown
}

interface ProjectUser {
  userEmail: string
  displayName?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, unknown>
  [key: string]: unknown
}

interface ProjectUserGroup {
  groupId: string
  userEmail: string
  isActive?: boolean
  role?: string
  [key: string]: unknown
}

// ============= Props & Emits =============

interface Props {
  visible?: boolean
  projectId: string
  stageId: string
  voteData?: VoteData
  user?: User | null
  userGroupInfo?: UserGroupInfoProp | null
  projectUsers?: ProjectUser[]
  projectUserGroups?: ProjectUserGroup[]
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  voteData: () => ({}),
  user: null,
  userGroupInfo: null,
  projectUsers: () => [],
  projectUserGroups: () => []
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'vote': [result: { success: boolean; type: string; proposalId: string }]
  'resubmit': [result: { success: boolean; proposalId: string; rankings: unknown[] }]
}>()

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Point Calculation =====
const { calculateRankWeights } = usePointCalculation()

// ===== Avatar Utils =====
const {
  generateMemberAvatarUrl,
  generateMemberInitials
} = useAvatar()

// ===== TanStack Query Hook =====
const rankingProposals = useRankingProposals(
  toRef(props, 'projectId'),
  toRef(props, 'stageId'),
  { enabled: toRef(props, 'visible') }
)

// ============= Reactive State =============

// Loading states (from hook)
const loading = computed(() => rankingProposals.isLoading.value)
const isSubmittingVote = computed(() => rankingProposals.isVoting.value)
const isSubmittingNewProposal = computed(() => rankingProposals.isSubmitting.value)
const isWithdrawing = computed(() => rankingProposals.isWithdrawing.value)
const isResetting = computed(() => rankingProposals.isResetting.value)

// Local state
const voteType = ref('')
const isResubmitting = ref(false)
const hasStartedProposal = ref(false)
const showPointDistribution = ref(false)
const showVotingDetails = ref(false)

// Withdraw Drawer state
const showWithdrawDrawer = ref(false)
const withdrawInputText = ref('')

// Reset Drawer state
const showResetDrawer = ref(false)
const resetInputText = ref('')

// Ranking data
interface RankingItem {
  groupId: string
  groupName: string
  memberNames: string[]
  rank: number
  submissionId: string
  submitTime: number
  reportContent: string
}

const currentRankings = ref<RankingItem[]>([])
const originalRankings = ref<RankingItem[]>([])
const submittedGroupsFromHook = computed(() => rankingProposals.submittedGroups.value)
const localSubmittedGroups = ref<SubmittedGroup[]>([])
const hasUserDragged = ref(false)

// Proposal version data (from hook)
const proposalVersions = computed(() => rankingProposals.proposals.value)
const selectedVersionId = rankingProposals.selectedVersionId
const currentProposal = computed(() => rankingProposals.currentProposal.value || null)

// User vote state (from hook)
const userVote = computed(() => rankingProposals.userVote.value)
const voteHistory = computed(() => currentProposal.value?.votes || [])

// User group info (prefer hook, fallback to props)
const userGroupInfo = computed(() => rankingProposals.userGroupInfo.value || props.userGroupInfo)

// ============= Computed Properties =============

const hasExistingProposal = computed(() => {
  return proposalVersions.value.some(p => p.status !== 'withdrawn') && selectedVersionId.value
})

const isLatestVersion = computed(() => {
  if (!proposalVersions.value || proposalVersions.value.length === 0) {
    return false
  }
  const latestProposal = proposalVersions.value
    .slice()
    .reverse()
    .find(p => p.status !== 'withdrawn')
  return selectedVersionId.value === latestProposal?.proposalId
})

const isViewingOldVersion = computed(() => {
  return hasExistingProposal.value && !isLatestVersion.value
})

const latestProposalRankings = ref<RankingItem[]>([])

const hasActiveProposal = computed(() => {
  return proposalVersions.value.some(p => p.status !== 'withdrawn')
})

const displayRankings = computed(() => {
  if (hasExistingProposal.value) {
    return currentRankings.value.filter(item => item && typeof item === 'object').map((item, index) => ({
      groupId: item.groupId || '',
      groupName: item.groupName || `群組 ${index + 1}`,
      memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
      rank: item.rank || (index + 1),
      submissionId: item.submissionId || '',
      submitTime: item.submitTime || 0,
      reportContent: item.reportContent || ''
    }))
  } else {
    return localSubmittedGroups.value.filter(item => item && typeof item === 'object').map((item, index) => ({
      groupId: item.groupId || '',
      groupName: item.groupName || `群組 ${index + 1}`,
      memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
      rank: item.rank || (index + 1),
      submissionId: item.submissionId || '',
      submitTime: item.submitTime || 0,
      reportContent: item.reportContent || ''
    }))
  }
})

const hasValidRanking = computed(() => {
  if (hasExistingProposal.value) {
    return currentRankings.value.length > 0
  } else {
    return localSubmittedGroups.value.length > 0
  }
})

const userHasVoted = computed(() => {
  const current = proposalVersions.value.find(p => p.proposalId === selectedVersionId.value)
  return current?.userVote === 'support' || current?.userVote === 'oppose'
})

const showInitialProposalButton = computed(() => false)

const showSubmitProposalButton = computed(() => {
  return !hasExistingProposal.value || isResubmitting.value
})

const showVoteButtons = computed(() => {
  return hasExistingProposal.value && !userHasVoted.value && !isResubmitting.value && isLatestVersion.value
})

const resetCount = computed(() => {
  return proposalVersions.value.filter(p => p.status === 'reset').length
})

const isGroupLeader = computed(() => {
  return userGroupInfo.value?.isGroupLeader || false
})

const allMembersVoted = computed(() => {
  if (!currentProposal.value || !userGroupInfo.value) return false
  const totalVotes = currentProposal.value.totalVotes || 0
  const memberCount = userGroupInfo.value.groupMemberCount || 0
  return totalVotes >= memberCount && memberCount > 0
})

const isTied = computed(() => {
  if (!currentProposal.value) return false
  return currentProposal.value.supportCount === currentProposal.value.opposeCount &&
         currentProposal.value.supportCount > 0
})

const showResetButton = computed(() => {
  return isGroupLeader.value &&
         hasExistingProposal.value &&
         isLatestVersion.value &&
         allMembersVoted.value &&
         isTied.value &&
         resetCount.value < 1 &&
         currentProposal.value?.status === 'pending'
})

const showTieReminderForMembers = computed(() => {
  return !isGroupLeader.value &&
         hasExistingProposal.value &&
         isLatestVersion.value &&
         allMembersVoted.value &&
         isTied.value &&
         resetCount.value < 1 &&
         currentProposal.value?.status === 'pending'
})

interface GroupMember {
  userEmail: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, unknown>
  role: string
}

const groupMembers = computed<GroupMember[]>(() => {
  const groupId = userGroupInfo.value?.groupId
  if (!groupId) return []

  const memberEmails = props.projectUserGroups
    .filter(ug => ug.groupId === groupId && ug.isActive)
    .map(ug => ug.userEmail)

  return memberEmails.map(email => {
    const user = props.projectUsers.find(u => u.userEmail === email)
    const ug = props.projectUserGroups.find(
      g => g.groupId === groupId && g.userEmail === email
    )
    return {
      userEmail: email,
      displayName: user?.displayName || email,
      avatarSeed: user?.avatarSeed,
      avatarStyle: user?.avatarStyle,
      avatarOptions: user?.avatarOptions,
      role: ug?.role || 'member'
    }
  })
})

const unvotedMembers = computed(() => {
  if (!groupMembers.value.length || !currentProposal.value?.votes) {
    return []
  }

  const votedEmails = new Set(
    (currentProposal.value.votes || []).map((v: { voterEmail: string }) => v.voterEmail)
  )

  return groupMembers.value.filter(
    member => !votedEmails.has(member.userEmail)
  )
})

const tsumTsumVoteData = computed(() => {
  if (!proposalVersions.value || proposalVersions.value.length === 0) {
    return {}
  }

  const voteData: Record<string, { support: unknown[]; oppose: unknown[] }> = {}

  proposalVersions.value.forEach(proposal => {
    const allVotes = proposal.votes || []
    voteData[proposal.proposalId] = {
      support: allVotes.filter((v: { agree: number }) => v.agree === 1),
      oppose: allVotes.filter((v: { agree: number }) => v.agree === -1)
    }
  })

  return voteData
})

const versionLabels = computed(() => {
  if (!proposalVersions.value) return []
  return proposalVersions.value.map((p, index) => {
    return index === proposalVersions.value.length - 1
      ? '最終版本'
      : formatVersionStepTime(p.createdTime)
  })
})

const versionStatuses = computed(() => {
  if (!proposalVersions.value) return []
  return proposalVersions.value.map(p => p.status)
})

const versionVotingResults = computed(() => {
  if (!proposalVersions.value) return []
  return proposalVersions.value.map(p => p.votingResult || 'no_votes')
})

const stageReportReward = computed(() => {
  return props.voteData?.reportReward || 1000
})

const userGroupId = computed(() => {
  return userGroupInfo.value?.groupId || null
})

// ===== Withdraw Drawer Computed =====

const canWithdraw = computed(() => {
  return withdrawInputText.value.trim().toUpperCase() === 'REVERT'
})

const currentProposalInfo = computed(() => {
  if (!currentProposal.value || !currentProposal.value.proposalId) {
    return null
  }

  const proposal = currentProposal.value
  const versionIndex = proposalVersions.value.findIndex(
    p => p.proposalId === proposal.proposalId
  )

  return {
    version: versionIndex >= 0 ? `第 ${versionIndex + 1} 版` : '未知版本',
    proposer: proposal.proposerDisplayName || '匿名用戶',
    createdTime: formatTime(proposal.createdTime),
    supportCount: proposal.supportCount || 0,
    opposeCount: proposal.opposeCount || 0,
    totalVotes: proposal.totalVotes || 0,
    status: proposal.status,
    votingResult: proposal.votingResult,
    rankingsCount: displayRankings.value.length
  }
})

const currentResetInfo = computed(() => {
  if (!currentProposal.value || !currentProposal.value.proposalId) {
    return null
  }

  const proposal = currentProposal.value
  const versionIndex = proposalVersions.value.findIndex(
    p => p.proposalId === proposal.proposalId
  )

  return {
    version: versionIndex >= 0 ? `第 ${versionIndex + 1} 版` : '未知版本',
    proposer: proposal.proposerDisplayName || '匿名用戶',
    createdTime: formatTime(proposal.createdTime),
    supportCount: proposal.supportCount || 0,
    opposeCount: proposal.opposeCount || 0,
    totalVotes: proposal.totalVotes || 0,
    memberCount: userGroupInfo.value?.groupMemberCount || 0,
    status: proposal.status,
    votingResult: proposal.votingResult,
    rankingsCount: displayRankings.value.length,
    resetCount: resetCount.value
  }
})

const canReset = computed(() => {
  return resetInputText.value.trim() === 'RESET'
})

// ===== Point Distribution Chart Data =====

interface ChartMember {
  email: string
  displayName: string
  participationRatio: number
  baseWeightUnits: number
  rankMultiplier: number
  finalWeight: number
  points: number
}

interface ChartGroup {
  groupId: string
  groupName: string
  rank: number
  isCurrentGroup: boolean
  members: ChartMember[]
}

const allGroupsForChart = computed<ChartGroup[]>(() => {
  if (displayRankings.value.length === 0) {
    return []
  }

  const groupCount = displayRankings.value.length + 1
  const rankWeights = calculateRankWeights(groupCount)
  const globalMinRatio = 5

  const otherGroups: ChartGroup[] = displayRankings.value.map((group, idx) => {
    const rank = idx + 1
    const memberCount = group.memberNames?.length || 1
    const basePercentage = Math.floor(100 / memberCount / 5) * 5
    const remainder = 100 - (basePercentage * memberCount)

    const members: ChartMember[] = group.memberNames.map((name, memberIdx) => {
      let contribution = basePercentage
      if (memberIdx < remainder / 5) contribution += 5

      const baseWeightUnits = contribution / globalMinRatio
      const finalWeight = baseWeightUnits * rankWeights[rank]

      return {
        email: `${group.groupId}_member_${memberIdx}`,
        displayName: name,
        participationRatio: contribution,
        baseWeightUnits,
        rankMultiplier: rankWeights[rank],
        finalWeight,
        points: 0
      }
    })

    return {
      groupId: group.groupId,
      groupName: group.groupName,
      rank,
      isCurrentGroup: false,
      members
    }
  })

  if (userGroupInfo.value) {
    const userRank = groupCount
    const userMemberCount = userGroupInfo.value.groupMemberCount || 1
    const basePercentage = Math.floor(100 / userMemberCount / 5) * 5
    const remainder = 100 - (basePercentage * userMemberCount)

    const userMembers: ChartMember[] = Array.from({ length: userMemberCount }, (_, memberIdx) => {
      let contribution = basePercentage
      if (memberIdx < remainder / 5) contribution += 5

      const baseWeightUnits = contribution / globalMinRatio
      const finalWeight = baseWeightUnits * rankWeights[userRank]

      return {
        email: `${userGroupInfo.value!.groupId}_member_${memberIdx}`,
        displayName: `成員 ${memberIdx + 1}`,
        participationRatio: contribution,
        baseWeightUnits,
        rankMultiplier: rankWeights[userRank],
        finalWeight,
        points: 0
      }
    })

    const userGroup: ChartGroup = {
      groupId: userGroupInfo.value.groupId!,
      groupName: userGroupInfo.value.groupName || '您的組別',
      rank: userRank,
      isCurrentGroup: true,
      members: userMembers
    }

    return [...otherGroups, userGroup]
  }

  return otherGroups
})

const allGroupsForChartWithPoints = computed(() => {
  const groups = allGroupsForChart.value

  if (groups.length === 0) {
    return []
  }

  let totalWeight = 0
  groups.forEach(group => {
    group.members.forEach(member => {
      totalWeight += member.finalWeight
    })
  })

  if (totalWeight === 0) {
    return groups
  }

  const pointsPerWeight = stageReportReward.value / totalWeight

  return groups.map(group => ({
    ...group,
    members: group.members.map(member => ({
      ...member,
      points: member.finalWeight * pointsPerWeight
    }))
  }))
})

// ============= Alert Management (via Composable) =============

// Initialize alert composable with all required reactive values
const { clearAlerts } = useVoteResultAlerts({
  visible: toRef(props, 'visible'),
  showWithdrawDrawer,
  showResetDrawer,
  userHasVoted,
  showTieReminderForMembers,
  showResetButton,
  hasExistingProposal,
  currentProposal,
  resetCount,
  currentResetInfo
})

// ============= Watchers =============

// Drawer visibility handler
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    hasUserDragged.value = false
    await nextTick()
    if (submittedGroupsFromHook.value && submittedGroupsFromHook.value.length > 0) {
      localSubmittedGroups.value = [...submittedGroupsFromHook.value]
    }
  } else {
    resetState()
    clearAlerts()
  }
})

// Sync hook's submittedGroups to local copy
watch(submittedGroupsFromHook, (newVal) => {
  if (props.visible && !hasUserDragged.value && newVal && newVal.length > 0) {
    localSubmittedGroups.value = [...newVal]
  }
}, { immediate: true })

// ============= Process Proposal Rankings =============

interface ProposalRankingItem {
  groupId: string
  rank: number
  submissionId?: string
}

function processProposalRankings(proposal: { proposalId?: string; rankingData?: unknown } | null) {
  if (!proposal || !proposal.proposalId) {
    currentRankings.value = []
    originalRankings.value = []
    return
  }

  try {
    const rankingData = typeof proposal.rankingData === 'string'
      ? JSON.parse(proposal.rankingData)
      : proposal.rankingData

    if (Array.isArray(rankingData)) {
      currentRankings.value = (rankingData as ProposalRankingItem[])
        .map((item) => {
          const groupInfo = localSubmittedGroups.value.find(g => g.groupId === item.groupId)
          return {
            groupId: item.groupId,
            rank: item.rank,
            submissionId: item.submissionId || '',
            groupName: groupInfo?.groupName || `群組 ${item.groupId.slice(-4)}`,
            memberNames: groupInfo?.memberNames || [],
            submitTime: groupInfo?.submitTime || 0,
            reportContent: groupInfo?.reportContent || ''
          }
        })
        .filter(item => localSubmittedGroups.value.some(g => g.groupId === item.groupId))
        .sort((a, b) => a.rank - b.rank)
    } else {
      currentRankings.value = Object.entries(rankingData || {})
        .map(([groupId, rank]) => {
          const groupInfo = localSubmittedGroups.value.find(g => g.groupId === groupId)
          return {
            groupId,
            rank: typeof rank === 'number' ? rank : parseInt(rank as string),
            groupName: groupInfo?.groupName || `群組 ${groupId.slice(-4)}`,
            memberNames: groupInfo?.memberNames || [],
            submitTime: groupInfo?.submitTime || 0,
            reportContent: groupInfo?.reportContent || '',
            submissionId: groupInfo?.submissionId || ''
          }
        })
        .filter(item => localSubmittedGroups.value.some(g => g.groupId === item.groupId))
        .sort((a, b) => a.rank - b.rank)
    }
  } catch (e) {
    console.warn('Failed to parse ranking data:', e)
    currentRankings.value = []
  }

  originalRankings.value = [...currentRankings.value]
}

// Watch currentProposal changes to process rankings
watch([currentProposal, () => localSubmittedGroups.value], ([proposal, groups]) => {
  if (proposal && proposal.proposalId && groups && groups.length > 0) {
    processProposalRankings(proposal)
  }
}, { immediate: true })

// ============= Event Handlers =============

function onVersionChange(proposalId: string) {
  if (proposalId) {
    rankingProposals.selectVersion(proposalId)

    if (isViewingOldVersion.value) {
      const latestProposal = proposalVersions.value
        .slice()
        .reverse()
        .find(p => p.status !== 'withdrawn')
      if (latestProposal && latestProposal.proposalId !== proposalId) {
        loadLatestProposalRankings(latestProposal.proposalId)
      }
    } else {
      latestProposalRankings.value = []
    }
  }
}

function loadLatestProposalRankings(proposalId: string) {
  const proposal = proposalVersions.value.find(p => p.proposalId === proposalId)
  if (!proposal) return

  let rankingData: ProposalRankingItem[] = []
  try {
    rankingData = typeof proposal.rankingData === 'string'
      ? JSON.parse(proposal.rankingData)
      : proposal.rankingData as ProposalRankingItem[]
  } catch (e) {
    console.error('Failed to parse latest proposal ranking data:', e)
    return
  }

  const enrichedRankings = rankingData.map(item => {
    const group = submittedGroupsFromHook.value.find(g => g.groupId === item.groupId)
    return {
      ...item,
      groupName: group?.groupName || `群組 ${item.rank}`,
      memberNames: group?.memberNames || []
    }
  })

  latestProposalRankings.value = enrichedRankings as RankingItem[]
}

async function vote(type: 'support' | 'oppose') {
  if (isSubmittingVote.value) return

  voteType.value = type

  try {
    await rankingProposals.vote(type)
    emit('vote', {
      success: true,
      type,
      proposalId: selectedVersionId.value
    })
  } catch (error) {
    console.error('Vote error:', error)
  } finally {
    voteType.value = ''
  }
}

function handleWithdrawDrawerClose() {
  withdrawInputText.value = ''
}

async function confirmWithdraw() {
  if (!canWithdraw.value || !selectedVersionId.value || isWithdrawing.value) {
    return
  }

  await withdrawProposal()

  if (!isWithdrawing.value) {
    showWithdrawDrawer.value = false
    handleWithdrawDrawerClose()
  }
}

function handleResetDrawerClose() {
  resetInputText.value = ''
}

async function confirmReset() {
  if (!canReset.value || !selectedVersionId.value || isResetting.value) {
    return
  }

  await resetVotes()

  if (!isResetting.value) {
    showResetDrawer.value = false
    handleResetDrawerClose()
  }
}

async function withdrawProposal() {
  if (!selectedVersionId.value || isWithdrawing.value) return

  try {
    await rankingProposals.withdraw()
    isResubmitting.value = false
    hasStartedProposal.value = false
    currentRankings.value = []
  } catch (error) {
    console.error('Withdraw proposal error:', error)
  }
}

async function resetVotes(reason = '') {
  if (!selectedVersionId.value || isResetting.value) return

  try {
    await rankingProposals.resetVotes(reason)
  } catch (error) {
    console.error('Reset votes error:', error)
  }
}

function startInitialProposal() {
  // No longer needed - kept for template compatibility
}

async function submitNewProposal() {
  if (isSubmittingNewProposal.value || !hasValidRanking.value) return

  try {
    const targetArray = hasExistingProposal.value ? currentRankings.value : localSubmittedGroups.value
    const rankingData: RankingData[] = targetArray.map((group, index) => ({
      groupId: group.groupId,
      rank: index + 1,
      submissionId: group.submissionId
    }))

    await rankingProposals.submitProposal(rankingData)

    isResubmitting.value = false
    hasStartedProposal.value = false

    emit('resubmit', {
      success: true,
      proposalId: selectedVersionId.value,
      rankings: currentRankings.value
    })
  } catch (error) {
    console.error('Submit new proposal error:', error)
  }
}

function resetState() {
  isResubmitting.value = false
  voteType.value = ''
  hasStartedProposal.value = false
  currentRankings.value = []
  originalRankings.value = []
  latestProposalRankings.value = []
  hasUserDragged.value = false
}

function handleClose() {
  emit('update:visible', false)
}

function handleVisibleChange(newValue: boolean) {
  emit('update:visible', newValue)
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-TW')
}

function formatVersionStepTime(timestamp: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/\//g, '/').replace(/,/g, '')
}

function getStepStatus(version: { status: string }) {
  if (version.status !== 'withdrawn') {
    return 'process'
  }
  return ''
}

function getVersionStatusText(version: { status?: string; votingResult?: string } | null) {
  if (!version) return ''

  if (version.status === 'settled') {
    if (version.votingResult === 'agree') {
      return '已結算（通過）'
    } else if (version.votingResult === 'disagree') {
      return '已結算（未通過）'
    } else if (version.votingResult === 'tie') {
      return '已結算（平手）'
    }
    return '已結算'
  }

  if (version.status === 'withdrawn') {
    return '已撤回'
  }

  if (version.status === 'reset') {
    return '已重置'
  }

  if (version.status === 'pending') {
    if (version.votingResult === 'agree') {
      return '投票中（支持票領先）'
    } else if (version.votingResult === 'disagree') {
      return '投票中（反對票領先）'
    } else if (version.votingResult === 'tie') {
      return '投票中（票數持平）'
    }
    return '等待投票'
  }

  return ''
}

function handleRankingUpdate(updatedItems: RankingItem[]) {
  if (hasExistingProposal.value) {
    currentRankings.value = updatedItems
  } else {
    hasUserDragged.value = true
    localSubmittedGroups.value = updatedItems as unknown as SubmittedGroup[]
  }
}

function formatSubmissionTime(timestamp: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function truncateContent(content: string, maxLength = 100) {
  if (!content) return ''
  const plainText = content.replace(/[#*`>\-\[\]]/g, '').trim()
  return plainText.length > maxLength
    ? plainText.substring(0, maxLength) + '...'
    : plainText
}

interface VoteRecord {
  voterAvatarSeed?: string
  voterAvatarStyle?: string
  voterAvatarOptions?: Record<string, unknown>
  voterDisplayName?: string
  voterEmail?: string
}

function getVoterAvatarUrl(vote: VoteRecord) {
  if (!vote.voterAvatarSeed) return ''
  return generateMemberAvatarUrl({
    avatarSeed: vote.voterAvatarSeed,
    avatarStyle: vote.voterAvatarStyle || 'bottts',
    avatarOptions: vote.voterAvatarOptions
  })
}

function getVoterInitials(vote: VoteRecord) {
  const name = vote.voterDisplayName || vote.voterEmail || ''
  return generateMemberInitials({ displayName: name })
}

function getMemberAvatarUrl(member: GroupMember) {
  if (!member.avatarSeed) return ''
  return generateMemberAvatarUrl({
    avatarSeed: member.avatarSeed,
    avatarStyle: member.avatarStyle || 'bottts',
    avatarOptions: member.avatarOptions
  })
}

function getMemberInitials(member: GroupMember) {
  const name = member.displayName || member.userEmail
  return generateMemberInitials({ displayName: name })
}

// Expose submittedGroups alias for template compatibility
const submittedGroups = localSubmittedGroups
</script>

<style scoped>
.drawer-header-custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
}

.drawer-header-custom h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
  font-weight: 600;
}

.drawer-header-custom h3 i {
  margin-right: 10px;
  color: #3498db;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: #7f8c8d;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s;
}

.drawer-close-btn:hover {
  background: #ecf0f1;
  color: #2c3e50;
}

.vote-drawer-content {
  padding: 20px;
  min-height: 100%;
}

/* 版本選擇器 */
.version-selector-section {
  margin-bottom: 25px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.section-label {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 圖表說明文字 */
.chart-description {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 14px;
  margin-bottom: 15px;
  padding: 10px 15px;
  background: #f0f9ff;
  border-left: 3px solid #409eff;
  border-radius: 4px;
  line-height: 1.6;
}

.chart-description i {
  color: #409eff;
  flex-shrink: 0;
}

/* el-steps 版本時間軸樣式 */
.version-steps-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e9ecef;
}

.version-steps {
  margin-bottom: 20px;
}

.version-step {
  cursor: pointer;
  transition: all 0.3s ease;
}

.version-step:hover {
  opacity: 0.8;
}

.version-step-title {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.version-step-title:hover {
  opacity: 0.7;
  transform: scale(1.05);
}

.version-step-description {
  font-size: 12px;
  color: #7f8c8d;
  line-height: 1.6;
}

.version-step-description .submitter-line {
  font-weight: 500;
  color: #34495e;
  margin-bottom: 2px;
}

.version-step-description .time-line {
  color: #95a5a6;
  margin-bottom: 2px;
}

.version-step-description .vote-stats-line {
  color: #3498db;
  font-weight: 500;
  margin-bottom: 2px;
}

.version-step-description .status-line {
  color: #e74c3c;
  font-weight: 600;
  font-style: italic;
}

.version-hint-alert {
  margin-top: 15px;
}

.version-hint-alert :deep(.el-alert__title) {
  font-size: 13px;
  line-height: 1.5;
}

/* 排名區域 */
.ranking-section {
  margin-bottom: 25px;
}

.ranking-list-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e9ecef;
}

/* RankingComparison component now handles comparison styling */

.ranking-list.disabled {
  opacity: 0.7;
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  margin-bottom: 12px;
  border: 2px solid #e9ecef;
  border-radius: 10px;
  background: white;
  transition: all 0.3s;
  position: relative;
}

.ranking-item.draggable {
  cursor: grab;
}

.ranking-item.draggable:hover {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(52, 152, 219, 0.15);
}

.ranking-item.draggable:active {
  cursor: grabbing;
}

.ranking-item.dragging {
  opacity: 0.6;
  transform: rotate(2deg);
  z-index: 1000;
}

.rank-number {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  width: 45px;
  height: 45px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  margin-right: 20px;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.3);
}

.group-info {
  flex: 1;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.group-name {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.submission-time {
  font-size: 12px;
  color: #95a5a6;
  font-weight: 400;
}

.group-members {
  font-size: 14px;
  color: #7f8c8d;
  line-height: 1.4;
  margin-bottom: 8px;
}

.submission-preview {
  margin-top: 8px;
  font-size: 13px;
  color: #7f8c8d;
  line-height: 1.5;
  font-style: italic;
  padding-left: 10px;
  border-left: 3px solid #e0e0e0;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ranking-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7f8c8d;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  background: #f1f3f4;
  border-radius: 8px;
}

.ranking-hint i {
  color: #f39c12;
}

/* 投票趨勢圖表 */
.vote-visualization {
  margin-bottom: 25px;
}

.chart-container {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e9ecef;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.d3-chart-container {
  min-height: 250px;
  width: 100%;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e9ecef;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #2c3e50;
  font-weight: 500;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.legend-color.support {
  background: #28a745;
}

.legend-color.oppose {
  background: #dc3545;
}

/* 備用圖表 */
.fallback-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.current-stats {
  display: flex;
  gap: 50px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.stat-label {
  font-size: 14px;
  color: #7f8c8d;
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
}

.stat-value.support {
  color: #28a745;
}

.stat-value.oppose {
  color: #dc3545;
}

/* 投票按鈕樣式 */
.drawer-actions .el-button.voted {
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3);
}

.vote-indicator {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #28a745;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

/* 平手提醒 - 給一般組員 */
.tie-reminder-for-members {
  margin-top: 20px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 12px;
  border: 1px solid #91d5ff;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .vote-drawer-content {
    padding: 15px;
  }
  
  .ranking-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .rank-number {
    align-self: flex-start;
  }
  
  .item-actions {
    flex-direction: row;
    align-self: flex-end;
  }

  .current-stats {
    flex-direction: column;
    gap: 20px;
  }
}

/* 排名資訊提示 */
.ranking-info {
  margin-top: 10px;
  padding: 8px 12px;
  background: #e6f3ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ranking-info i {
  color: #1890ff;
}

/* el-drawer header 樣式 */
:deep(.el-drawer__header) {
  background: #2c3e50 !important;
  color: white !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
  border-bottom: 1px solid #34495e !important;
}

:deep(.el-drawer__title) {
  color: white !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}

:deep(.el-drawer__close-btn) {
  color: white !important;
}

:deep(.el-drawer__close-btn:hover) {
  color: #ecf0f1 !important;
}

/* ===== Withdraw Drawer Styles ===== */

.withdraw-drawer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
}

.withdraw-drawer-header i {
  color: #f5222d;
  font-size: 20px;
}

/* 提案資訊網格 */
.proposal-info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 10px 15px;
  background: #fafafa;
  border-radius: 6px;
  border-left: 3px solid #d9d9d9;
}

.info-label {
  font-weight: 600;
  color: #595959;
  min-width: 100px;
  flex-shrink: 0;
}

.info-value {
  color: #262626;
  flex: 1;
}

/* 狀態徽章 */
.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
}

.status-badge.status-pending {
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.status-badge.status-settled {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.status-badge.status-withdrawn {
  background: #fff1f0;
  color: #f5222d;
  border: 1px solid #ffa39e;
}

.status-badge.status-reset {
  background: #fff7e6;
  color: #fa8c16;
  border: 1px solid #ffd591;
}

/* REVERT 代碼樣式 */
.revert-code {
  display: inline-block;
  padding: 2px 8px;
  background: #f5222d;
  color: white;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 0 4px;
}

/* 輸入提示 */
.input-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #8c8c8c;
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-hint i {
  color: #faad14;
}

/* 警告區塊 */
.warning-section {
  background: #fff7e6;
  border: 1px solid #ffd591;
}

.warning-list {
  margin: 10px 0 0 0;
  padding-left: 20px;
  list-style-type: none;
}

.warning-list li {
  position: relative;
  padding-left: 24px;
  margin-bottom: 10px;
  color: #d46b08;
  line-height: 1.6;
  font-size: 14px;
}

.warning-list li::before {
  content: '⚠️';
  position: absolute;
  left: 0;
  top: 0;
  font-size: 16px;
}

/* 響應式調整 */
@media (max-width: 768px) {
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .info-label {
    min-width: unset;
  }
}

/* ===== Reset Drawer Styles ===== */

.reset-drawer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
}

.reset-drawer-header i {
  color: #f5222d;
  font-size: 20px;
}

/* RESET 代碼樣式 */
.reset-code {
  display: inline-block;
  padding: 2px 8px;
  background: #f5222d;
  color: white;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 0 4px;
}

/* 投票狀況平手樣式 */
.vote-status-tie {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fa8c16;
  font-weight: 600;
}

.vote-status-tie i {
  color: #fa8c16;
  font-size: 16px;
}

/* 投票詳情列表樣式 */
.votes-list-section {
  padding: 20px 25px;
}

.votes-list-section h3 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

.votes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vote-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  transition: all 0.2s;
}

.vote-item:hover {
  background: #f0f2f5;
}

.vote-item.agree {
  border-left: 3px solid #67c23a;
}

.vote-item.disagree {
  border-left: 3px solid #f56c6c;
}

.vote-item.pending {
  border-left: 3px solid #909399;
  opacity: 0.7;
}

.voter-avatar {
  flex-shrink: 0;
}

.vote-info {
  flex: 1;
  min-width: 0;
}

.voter-name {
  font-weight: 500;
  color: #2c3e50;
  font-size: 14px;
  margin-bottom: 2px;
}

.vote-time {
  font-size: 12px;
  color: #909399;
}

.vote-result {
  flex-shrink: 0;
}

.vote-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.vote-badge.agree {
  background: #d4edda;
  color: #155724;
}

.vote-badge.disagree {
  background: #f8d7da;
  color: #721c24;
}

.vote-badge.pending {
  background: #f4f4f5;
  color: #909399;
}
</style>