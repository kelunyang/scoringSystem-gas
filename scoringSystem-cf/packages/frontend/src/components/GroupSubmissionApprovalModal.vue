<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
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
          本組報告投票確認
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body" v-loading="votingDataComposable.isLoading.value" element-loading-text="載入投票資料中..." ref="modalRoot">
      <!-- DrawerAlertZone - 統一的 Alert 管理 -->
      <DrawerAlertZone />

      <!-- 版本時間軸 -->
      <div class="version-timeline-section">
        <!-- 標題區域 -->
        <div class="section-header">
          <h3>階段成果版本</h3>
        </div>

        <!-- 使用 VersionTimeline 組件 -->
        <VersionTimeline
          :versions="allVersions"
          :currentVersionId="currentVersionId"
          versionIdKey="submissionId"
          createdTimeKey="submitTime"
          displayNameKey="submitterDisplayName"
          :formatTitleFn="(version: any, index: number) =>
            index === allVersions.length - 1 ? '最終版本' : formatVersionStepTime(version.submitTime)"
          @version-change="handleVersionChange"
        >
          <template #description="{ version, index }">
            <div class="version-step-description">
              <div class="submitter-line">
                提交者：{{ getSubmitterDisplayName(version) }}
              </div>
              <div v-if="getVersionStatusText(version)" class="status-line">
                {{ getVersionStatusText(version) }}
              </div>
            </div>
          </template>
        </VersionTimeline>
      </div>

      <!-- 最終版本提交內容（始終顯示） -->
      <div class="submission-content-section final-version-section">
        <div class="section-header">
          <h3>
            <i class="fas fa-check-circle" style="color: #67c23a;"></i>
            最終版本提交內容
          </h3>
          <div class="submission-meta">
            <span>提交者: {{ getSubmitterDisplayName(finalVersionData) }}</span>
            <span>提交時間: {{ formatDateTime(finalVersionData?.submitTime) }}</span>
          </div>
        </div>
        <div class="submission-content" v-html="renderedFinalVersionContent"></div>
      </div>

      <!-- 歷史版本差異比較（僅在查看舊版本時顯示） -->
      <div v-if="isViewingOldVersion" class="submission-content-section historical-version-section">
        <div class="section-header">
          <h3>
            <i class="fas fa-code-compare" style="color: #e6a23c;"></i>
            版本差異比較
          </h3>
          <div class="submission-meta">
            <span>舊版本 ({{ formatVersionStepTime(currentVersionData?.submitTime) }}) vs 最終版本</span>
            <span>提交者: {{ getSubmitterDisplayName(currentVersionData) }}</span>
          </div>
        </div>
        <div class="diff-container" v-html="diffHtml"></div>
      </div>

      <!-- 本階段點數分配預覽 -->
      <div class="participation-distribution-section">
        <div class="section-header">
          <h3>本階段點數分配</h3>
          <div class="section-subtitle">基於提交的參與度比例計算</div>
        </div>

        <!-- 模擬控制區 -->
        <SimulationControls
          :simulatedRank="simulatedRank"
          @update:simulatedRank="simulatedRank = $event"
          :simulatedGroupCount="simulatedGroupCount"
          @update:simulatedGroupCount="simulatedGroupCount = $event"
          :totalActiveGroups="totalActiveGroups"
          :totalProjectGroups="totalProjectGroups"
          :totalPercentage="totalPercentage"
          :showTotalPercentage="false"
        />

        <!-- 權重分配預覽 -->
        <div class="contribution-chart">
          <div class="chart-description">
            <i class="fas fa-trophy" :style="{ color: getRankColor(simulatedRank) }"></i>
            <span>全組競爭權重分配視覺化 (包含其他組的均分假設，每方塊=1權重)</span>
          </div>
          <div class="chart-note">
            <i class="fas fa-lightbulb"></i> <strong>說明：</strong>上圖顯示組內個人分配，下圖顯示與其他組的競爭比較
          </div>

          <el-button
            type="primary"
            style="margin-bottom: 15px;"
            @click="showScoringExplanation = true"
          >
            <i class="fas fa-calculator"></i> 點數計算說明
          </el-button>

          <!-- 組內個人分配圖 -->
          <OurGroupChart
            :members="chartSelectedMembers"
            :rank="simulatedRank"
            :simulatedRank="simulatedRank"
            :simulatedGroupCount="simulatedGroupCount"
            :reportReward="stageReward"
            :allGroups="allGroups"
            :currentGroupId="currentGroupId"
            :totalPercentage="totalPercentage"
          />

          <!-- 舊版本參與度分配比較 (只在查看舊版本時顯示) -->
          <div v-if="isViewingOldVersion" class="participation-comparison-section">
            <div class="section-header">
              <h3>
                <i class="fas fa-code-compare" style="color: #e6a23c;"></i>
                舊版本參與度分配比較
              </h3>
              <div class="submission-meta">
                <span>舊版本時間: {{ formatVersionStepTime(currentVersionData?.submitTime) }}</span>
              </div>
            </div>

            <!-- D3.js 視覺化圖表 -->
            <ParticipationComparisonChart
              v-if="participationChanges.length > 0"
              :participationChanges="participationChanges"
              :groupMembers="groupMembers"
            />

            <!-- 變化摘要文字列表 -->
            <div class="participation-changes" v-if="participationChanges.length > 0">
              <h4 style="margin: 15px 0 10px; color: #2c3e50; font-size: 14px;">
                <i class="fas fa-list"></i> 詳細變化列表：
              </h4>
              <div class="changes-list">
                <div v-for="change in participationChanges" :key="change.email" class="change-item">
                  <span class="member-name">{{ change.displayName }}</span>
                  <span class="change-arrow">
                    <span class="old-value">{{ change.oldPercent }}%</span>
                    →
                    <span class="new-value">{{ change.newPercent }}%</span>
                  </span>
                  <span class="change-badge" :class="change.diff > 0 ? 'increase' : change.diff < 0 ? 'decrease' : 'neutral'">
                    {{ change.diff > 0 ? '+' : '' }}{{ change.diff }}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 各組總點數比較圖 -->
          <AllGroupsChart
            :selectedMembers="chartSelectedMembers"
            :simulatedRank="simulatedRank"
            :simulatedGroupCount="simulatedGroupCount"
            :reportReward="stageReward"
            :allGroups="allGroups"
            :currentGroupId="currentGroupId"
            :totalProjectGroups="totalProjectGroups"
            style="margin-top: 20px;"
          />
        </div>
      </div>

      <!-- 投票狀態卡片 -->
      <div class="voting-status-section">
        <div class="status-card">
          <div class="status-header">
            <h3>投票狀態</h3>
            <div class="status-badge-container">
              <div class="status-badge" :class="getStatusClass()">
                {{ getStatusText() }}
              </div>
              <!-- 煙火動畫層 -->
              <div v-if="showFireworks" class="fireworks-container">
                <span
                  v-for="i in 8"
                  :key="i"
                  class="firework-particle"
                  :style="getFireworkStyle(i)"
                >
                  {{ getFireworkEmoji(i) }}
                </span>
              </div>
            </div>
          </div>

          <div class="voting-stats">
            <el-statistic title="贊成票" :value="votingData.agreeVotes || 0">
              <template #prefix>
                <i class="fas fa-thumbs-up" style="color: #67c23a;"></i>
              </template>
            </el-statistic>
            <el-statistic title="總投票" :value="votingData.totalVotes || 0">
              <template #prefix>
                <i class="fas fa-vote-yea" style="color: #409eff;"></i>
              </template>
            </el-statistic>
            <el-statistic title="共識需求" :value="votingData.totalMembers || 0">
              <template #prefix>
                <i class="fas fa-users" style="color: #e6a23c;"></i>
              </template>
            </el-statistic>
          </div>

          <!-- 投票進度條 -->
          <div class="progress-section">
            <div class="progress-label">
              共識進度 {{ votingData.agreeVotes || 0 }} / {{ votingData.totalMembers || 0 }} (全員同意制)
            </div>
            <el-progress
              :percentage="getConsensusPercentage()"
              :color="getProgressColor()"
              :show-text="false"
            />
          </div>
        </div>
      </div>

      <!-- 投票趨勢圖表 -->
      <div v-if="showVotingDetails" class="chart-section">
        <div class="chart-header">
          <h3>投票趨勢</h3>
          <div class="chart-legend">
            <span class="legend-item agree">
              <span class="legend-dot"></span>
              累積同意票增長
            </span>
          </div>
        </div>
        <VoteTrendTsumTsumChart
          :voteData="tsumTsumVoteData"
          :versionLabels="tsumTsumVersionLabels"
          :versionStatuses="versionStatuses"
          :consensusThreshold="votingData.totalMembers"
          :currentUserEmail="user?.userEmail || ''"
          chartTitle="投票趨勢"
        />
      </div>

      <!-- 投票詳情列表 -->
      <div v-if="showVotingDetails" class="votes-list-section">
        <h3>投票詳情</h3>
        <div class="votes-list">
          <div
            v-for="vote in sortedVotes"
            :key="vote.voteId"
            class="vote-item"
            :class="{ agree: vote.agree, disagree: !vote.agree }"
          >
            <el-avatar
              :size="40"
              :src="getVoterAvatarUrl(vote)"
              class="voter-avatar"
            >
              {{ getVoterInitials(vote) }}
            </el-avatar>
            <div class="vote-info">
              <div class="voter-name">{{ getVoterDisplayName(vote) }}</div>
              <div class="vote-time">{{ formatDateTime(vote.createdTime) }}</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge" :class="{ agree: vote.agree, disagree: !vote.agree }">
                {{ vote.agree ? '贊成' : '反對' }}
              </span>
            </div>
          </div>

          <!-- 未投票成員 -->
          <div
            v-for="member in pendingMembers"
            :key="member.userEmail"
            class="vote-item pending"
          >
            <el-avatar
              :size="40"
              :src="getMemberAvatarUrlFromEmail(member.userEmail || member.email, groupMembers)"
              class="voter-avatar"
              @error="handleAvatarError(member.userEmail || member.email)"
            >
              {{ getMemberInitialsFromEmail(member.userEmail || member.email, groupMembers) }}
            </el-avatar>
            <div class="vote-info">
              <div class="voter-name">{{ getUserDisplayName(member.userEmail) }}</div>
              <div class="vote-time">尚未投票</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge pending">待投票</span>
            </div>
          </div>

          <!-- 非參與者成員 -->
          <div
            v-for="member in nonParticipantMembers"
            :key="'non-' + (member.userEmail || member.email)"
            class="vote-item non-participant"
          >
            <el-avatar
              :size="40"
              :src="getMemberAvatarUrlFromEmail(member.userEmail || member.email, groupMembers)"
              class="voter-avatar"
              @error="handleAvatarError(member.userEmail || member.email)"
            >
              {{ getMemberInitialsFromEmail(member.userEmail || member.email, groupMembers) }}
            </el-avatar>
            <div class="vote-info">
              <div class="voter-name">{{ getUserDisplayName(member.userEmail || member.email) }}</div>
              <div class="vote-time">未參與本次提交</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge non-participant">非參與者</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕區域 -->
      <div class="drawer-actions">
        <!-- 場景 1: 查看舊版本 + 未投票 + 是參與者 → 恢復按鈕（操作）-->
        <el-button
          v-if="isViewingOldVersion && !isFinalVersionApproved && !votingData.hasUserVoted && isCurrentUserParticipant"
          type="warning"
          @click="showRestoreConfirmation"
          :disabled="submitting"
        >
          <i class="fas fa-history"></i>
          恢復回舊版本
        </el-button>

        <!-- 場景 2: 查看舊版本 + 已投票 → 狀態按鈕（disabled）-->
        <el-button
          v-else-if="isViewingOldVersion && !isFinalVersionApproved && votingData.hasUserVoted"
          type="info"
          disabled
        >
          <i class="fas fa-info-circle"></i>
          查看歷史版本（已投票無法恢復）
        </el-button>

        <!-- 場景 3: 未投票 + 未通過 + 是參與者 → 投票按鈕（操作）-->
        <el-button
          v-if="!isViewingOldVersion && isFinalVersionSubmitted && !votingData.hasUserVoted && !votingData.isApproved && isCurrentUserParticipant"
          type="success"
          @click="submitVote(true)"
          :disabled="submitting"
          :loading="submitting"
        >
          <i v-if="!submitting" class="fas fa-check-circle"></i>
          {{ submitting ? '投票中...' : '同意本組報告' }}
        </el-button>

        <!-- 場景 4: 已投票 + 未通過 → 狀態按鈕（disabled）-->
        <el-button
          v-else-if="!isViewingOldVersion && votingData.hasUserVoted && !votingData.isApproved"
          type="success"
          disabled
        >
          <i class="fas fa-check-circle"></i>
          您已投票：{{ getUserVoteStatus() }}
        </el-button>

        <!-- 場景 5: 已通過 → 狀態按鈕（disabled）-->
        <el-button
          v-else-if="votingData.isApproved"
          type="info"
          disabled
        >
          <i class="fas fa-trophy"></i>
          本組報告已獲得通過
        </el-button>

        <!-- 場景 6: 非參與者 → 提示按鈕（disabled）-->
        <el-button
          v-else-if="!isViewingOldVersion && isFinalVersionSubmitted && !isCurrentUserParticipant"
          type="info"
          disabled
        >
          <i class="fas fa-info-circle"></i>
          您未參與本次提交，無法投票或操作
        </el-button>

        <!-- 刪除報告按鈕（只在未投票 + 未通過 + 是參與者時顯示）-->
        <el-button
          v-if="!isViewingOldVersion && isFinalVersionSubmitted && !votingData.isApproved && !votingData.hasUserVoted && isCurrentUserParticipant"
          type="danger"
          @click="showDeleteConfirmation"
          :disabled="submitting"
        >
          <i class="fas fa-trash"></i>
          刪除報告重發
        </el-button>

        <!-- 顯示/隱藏共識投票狀態按鈕 -->
        <el-button
          size="large"
          @click="showVotingDetails = !showVotingDetails"
        >
          <i :class="showVotingDetails ? 'fas fa-eye-slash' : 'fas fa-chart-line'"></i>
          {{ showVotingDetails ? '隱藏' : '顯示' }}共識投票狀態
        </el-button>

        <!-- 階段描述按鈕 -->
        <el-button
          v-if="props.stageDescription"
          type="info"
          @click="showStageDescriptionDrawer = true"
        >
          <i class="fas fa-info-circle"></i> 階段描述
        </el-button>

        <!-- 關閉按鈕（始終顯示）-->
        <el-button @click="handleClose">
          <i class="fas fa-times"></i>
          關閉
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- 刪除確認對話框 -->
  <el-drawer
    v-model="localDeleteDrawerVisible"
    title="確認刪除報告"
    direction="ttb"
    size="100%"
    class="drawer-maroon"
  >
    <div class="drawer-body">
      <div class="delete-confirmation">
        <div class="warning-icon">
          ⚠️
        </div>
        <p>確定要刪除本組在「{{ stageTitle }}」階段的報告嗎？</p>
        <p class="warning-text">此操作無法撤銷，刪除後需要重新提交報告。</p>
        <ConfirmationInput
          v-model="deleteConfirmText"
          keyword="DELETE"
          hint-action="刪除"
          @confirm="confirmDelete"
        />
      </div>

      <div class="drawer-actions">
        <el-button
          type="danger"
          @click="confirmDelete"
          :disabled="deleteConfirmText.toUpperCase() !== 'DELETE' || deleting"
          :loading="deleting"
        >
          <i v-if="!deleting" class="fas fa-trash-alt"></i>
          {{ deleting ? '刪除中...' : '確認刪除' }}
        </el-button>
        <el-button @click="localDeleteDrawerVisible = false">
          <i class="fas fa-times"></i> 取消
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- 恢復舊版本確認對話框 -->
  <el-drawer
    v-model="localRestoreDrawerVisible"
    title="確認恢復舊版本"
    direction="ttb"
    size="100%"
    class="drawer-maroon"
  >
    <div class="drawer-body">
      <div class="restore-confirmation">
        <div class="warning-icon">
          ⚠️
        </div>
        <p>確定要恢復到此舊版本嗎？</p>
        <p class="warning-text">恢復舊版本無法恢復舊版本的投票結果，請把握時間盡速完成投票，否則會沒收全組本階段點數。</p>
        <ConfirmationInput
          v-model="restoreConfirmText"
          keyword="RESTORE"
          hint-action="恢復"
          @confirm="confirmRestore"
        />
      </div>

      <div class="drawer-actions">
        <el-button
          type="warning"
          @click="confirmRestore"
          :disabled="restoreConfirmText.toUpperCase() !== 'RESTORE' || restoring"
          :loading="restoring"
        >
          <i v-if="!restoring" class="fas fa-undo-alt"></i>
          {{ restoring ? '恢復中...' : '確認恢復' }}
        </el-button>
        <el-button @click="localRestoreDrawerVisible = false">
          <i class="fas fa-times"></i> 取消
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- Stage Description Drawer -->
  <StageDescriptionDrawer
    v-model:visible="showStageDescriptionDrawer"
    :stage-name="stageTitle"
    :stage-description="props.stageDescription || ''"
  />

  <!-- Scoring Explanation Drawer -->
  <ScoringExplanationDrawer
    v-if="chartSelectedMembers.length > 0"
    v-model:visible="showScoringExplanation"
    :group-data="{
      groupName: allGroups?.find(g => g.groupId === currentGroupId)?.groupName || '我們組',
      finalRank: simulatedRank,
      totalGroups: simulatedGroupCount,
      allocatedPoints: chartSelectedMembers.reduce((sum: number, m: any) => sum + (m.points || 0), 0),
      members: chartSelectedMembers.map((m: any) => ({
        email: m.email,
        displayName: m.displayName,
        contribution: m.contribution,
        points: m.points || 0
      }))
    }"
    :project-config="{
      studentWeight: 0.7,
      teacherWeight: 0.3,
      rewardPool: stageReward
    }"
    mode="report"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as d3 from 'd3'
import { html as diff2html } from 'diff2html'
import { createTwoFilesPatch } from 'diff'
import 'diff2html/bundles/css/diff2html.min.css'
import hljs from 'highlight.js'
import markdown from 'highlight.js/lib/languages/markdown'
import { ElMessage } from 'element-plus'
import DrawerAlertZone from './common/DrawerAlertZone.vue'
import ConfirmationInput from './common/ConfirmationInput.vue'
import SimulationControls from './shared/ContributionChart/SimulationControls.vue'
import OurGroupChart from './shared/ContributionChart/OurGroupChart.vue'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import ParticipationComparisonChart from './shared/ContributionChart/ParticipationComparisonChart.vue'
import ScoringExplanationDrawer from './shared/ScoringExplanationDrawer.vue'
import StageDescriptionDrawer from './shared/StageDescriptionDrawer.vue'
import VoteTrendTsumTsumChart from './charts/VoteTrendTsumTsumChart.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
import VersionTimeline from './common/VersionTimeline.vue'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useAvatar } from '@/composables/useAvatar'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useVotingData } from '@/composables/useVotingData'
import { parseMarkdown } from '@/utils/markdown'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'

// 註冊 markdown 語言以支援語法高亮
hljs.registerLanguage('markdown', markdown)

/**
 * Props Interface
 */
interface Props {
  visible: boolean
  projectId: string
  stageId: string
  submissionId: string
  projectTitle?: string
  stageTitle?: string
  groupMembers?: any[]
  submissionData?: any
  stageReward?: number
  totalProjectGroups: number
  totalActiveGroups?: number
  user?: any
  projectUsers?: any[]
  currentGroupId?: string
  allGroups?: any[]
  stageDescription?: string
}

const props = withDefaults(defineProps<Props>(), {
  projectTitle: '',
  stageTitle: '',
  groupMembers: () => [],
  submissionData: () => ({}),
  // ✅ 移除 stageReward 默认值，由父组件严格传入
  user: undefined,
  projectUsers: () => [],
  currentGroupId: undefined,
  allGroups: () => [],
  stageDescription: ''
})

/**
 * Emits
 */
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'vote-submitted': [data: any]
  'submission-deleted': []
  'submission-restored': []
}>()

// ===== Composables =====
const {
  generateMemberAvatarUrl,
  generateMemberInitials,
  handleMemberAvatarError: handleAvatarError,
  getVoterAvatarUrl,
  getVoterDisplayName,
  getVoterInitials,
  getMemberAvatarUrlFromEmail,
  getMemberInitialsFromEmail
} = useAvatar()

const {
  getRankColor,
  calculateScoring
} = usePointCalculation()

const { warning, clearAlerts } = useDrawerAlerts()

// ===== Template Refs =====
const modalRoot = ref<HTMLElement | null>(null)

// ===== Reactive State =====
// ✅ Phase 3 优化：VotingData 类型已移至 useVotingData composable

const submitting = ref(false)
const showDeleteDialog = ref(false)
const deleteConfirmText = ref('')
const deleting = ref(false)
const simulatedRank = ref(1) // 預設模擬第1名
const simulatedGroupCount = ref(1) // 安全預設值，會在loadAllVersions時更新為實際值
// ✅ 改用 computed：自動同步父組件 prop，避免子組件修改導致不一致
const totalActiveGroups = computed(() => props.totalActiveGroups ?? 1)

// ===== Phase 3 优化：使用 useVotingData composable =====
const votingDataComposable = useVotingData(
  computed(() => props.projectId),
  computed(() => props.stageId),
  {
    groupId: computed(() => props.currentGroupId),
    enabled: computed(() => props.visible)
  }
)

// 为 template 提供 allVersions 别名（保持兼容性）
const allVersions = computed(() => votingDataComposable.versions.value)

// 为 template 提供 votingData 别名（保持兼容性）
// 这个 computed 返回当前选中版本的投票数据
// 确保返回普通对象（而不是 Proxy），避免 ElProgress 等组件报错
const votingData = computed(() => {
  const data = currentSubmissionVotingData.value

  if (!data || typeof data !== 'object') {
    return {
      votes: [],
      agreeVotes: 0,
      totalVotes: 0,
      totalMembers: 0,
      isApproved: false,
      hasUserVoted: false,
      participationProposal: {},
      currentUserVote: null
    }
  }

  const votes = Array.isArray(data.votes) ? data.votes : []
  const currentUserEmail = props.user?.userEmail
  const currentUserVote = votes.find(v => v.voterEmail === currentUserEmail) || null

  // ✅ 從 votesSummary 讀取統計值（後端 voting-history API 結構）
  const summary = (data as any).votesSummary || {}
  const totalMembers = Number(data.totalMembers) || 0
  const agreeVotes = Number(summary.agreeVotes) || 0
  const totalVotes = Number(summary.totalVotes) || 0

  return {
    votes: votes.map(v => ({ ...v })),
    agreeVotes,                                          // ✅ 從 votesSummary
    totalVotes,                                          // ✅ 從 votesSummary
    totalMembers,                                        // ✅ 從 root level
    isApproved: totalMembers > 0 && agreeVotes === totalMembers && totalVotes === totalMembers,
    hasUserVoted: Boolean(data.hasUserVoted) || !!currentUserVote,
    participationProposal: data.participationProposal || {},
    currentUserVote
  }
})

// 版本相關
const selectedVersion = ref('') // 當前選中的版本ID
const currentVersionId = ref('') // 當前活躍版本ID
const currentVersionData = ref<any>(null) // 當前版本詳細資料
const currentVersionVotingData = ref<any>(null) // 當前選中版本的投票數據
const showRestoreDialog = ref(false)
const restoreConfirmText = ref('')
const restoring = ref(false)
const showScoringExplanation = ref(false)
const showVotingDetails = ref(false) // 控制投票状态显示/隐藏
const showStageDescriptionDrawer = ref(false)

// 煙火動畫狀態
const showFireworks = ref(false)
const fireworkEmojis = ['🎉', '✨', '🎊', '⭐', '💫', '🌟', '🎆', '🎇']

// D3.js tooltip reference
const currentTooltip = ref<any>(null)

// ===== Computed Properties =====
const localVisible = computed({
  get() {
    return props.visible
  },
  set(val: boolean) {
    emit('update:visible', val)
  }
})

const localDeleteDrawerVisible = computed({
  get() {
    return showDeleteDialog.value
  },
  set(val: boolean) {
    showDeleteDialog.value = val
  }
})

const localRestoreDrawerVisible = computed({
  get() {
    return showRestoreDialog.value
  },
  set(val: boolean) {
    showRestoreDialog.value = val
  }
})

const sortedVotes = computed(() => {
  return [...votingData.value.votes].sort((a, b) => Number(a.createdTime) - Number(b.createdTime))
})

const pendingMembers = computed(() => {
  const votedEmails = new Set(votingData.value.votes.map(v => v.voterEmail))

  // ========== PARTICIPANT-ONLY FIX ==========
  // Only show participants (not all group members) in pending list
  // This ensures consistency with voting eligibility
  const proposal = votingData.value.participationProposal
  if (!proposal || typeof proposal !== 'object') {
    console.warn('⚠️ pendingMembers: No participationProposal data')
    return []
  }

  // Get participant emails from participationProposal
  const participantEmails = Object.keys(proposal).filter(
    email => typeof proposal[email] === 'number' && proposal[email] > 0
  )

  // Filter to only participants who haven't voted yet
  return props.groupMembers.filter(member => {
    const memberEmail = member.userEmail || member.email
    return participantEmails.includes(memberEmail) && !votedEmails.has(memberEmail)
  })
  // ========== END PARTICIPANT-ONLY FIX ==========
})

// 非參與者組員（在 groupMembers 中但不在 participationProposal 中）
const nonParticipantMembers = computed(() => {
  const proposal = votingData.value.participationProposal
  if (!proposal || typeof proposal !== 'object') {
    return []
  }

  // 取得參與者 emails（percentage > 0）
  const participantEmails = new Set(
    Object.keys(proposal).filter(
      email => typeof proposal[email] === 'number' && proposal[email] > 0
    )
  )

  // 返回不在參與者名單中的組員
  return props.groupMembers.filter(member => {
    const memberEmail = member.userEmail || member.email
    return !participantEmails.has(memberEmail)
  })
})

const isViewingOldVersion = computed(() => {
  const result = selectedVersion.value && selectedVersion.value !== currentVersionId.value
  console.log('[DEBUG] isViewingOldVersion:', {
    selectedVersion: selectedVersion.value,
    currentVersionId: currentVersionId.value,
    result
  })
  return result
})

const renderedSubmissionContent = computed(() => {
  // 支持 contentMarkdown (useVotingData API) 和 content (舊版 API) 兩種字段名
  const version = currentVersionData.value as any
  const content = version?.contentMarkdown || version?.content
  if (!content) return '<p class="no-content">暫無內容</p>'
  return parseMarkdown(content)
})

const finalVersionData = computed(() => {
  // 最終版本 = 陣列最後一個元素（不論 status）
  const versions = votingDataComposable.versions.value
  return versions.length > 0 ? versions[versions.length - 1] : null
})

const diffHtml = computed(() => {
  // 支持 contentMarkdown (useVotingData API) 和 content (舊版 API) 兩種字段名
  const oldVersion = currentVersionData.value as any
  const newVersion = finalVersionData.value as any
  const oldContent = oldVersion?.contentMarkdown || oldVersion?.content || ''
  const newContent = newVersion?.contentMarkdown || newVersion?.content || ''

  console.log('[DEBUG] diffHtml computing:', {
    oldVersionId: oldVersion?.submissionId,
    newVersionId: newVersion?.submissionId,
    oldHasContentMarkdown: !!oldVersion?.contentMarkdown,
    newHasContentMarkdown: !!newVersion?.contentMarkdown,
    oldContentLength: oldContent.length,
    newContentLength: newContent.length,
    isSameContent: oldContent === newContent
  })

  // 使用 diff 生成 unified diff 格式
  const diffText = createTwoFilesPatch(
    '當前版本',
    '最終版本',
    oldContent,
    newContent,
    '',
    '',
    { context: 10 }
  )

  // 使用 diff2html 轉換為 HTML (side-by-side 模式)
  return diff2html(diffText, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: 'side-by-side',
    renderNothingWhenEmpty: false
  })
})

const isFinalVersionSubmitted = computed(() => {
  const finalVersion = finalVersionData.value
  return finalVersion && finalVersion.status === 'submitted'
})

const isFinalVersionApproved = computed(() => {
  const finalVersion = finalVersionData.value
  return finalVersion && finalVersion.status === 'approved'
})

// 安全的slider最小值，確保不會是0且不會大於max
const safeSliderMin = computed(() => {
  const min = Math.max(1, totalActiveGroups.value)
  const max = props.totalProjectGroups

  // ✅ 檢查是否出現不合理的 min > max 情況
  if (min > max) {
    console.error('🚨 [GroupSubmissionApprovalModal] Slider 參數異常！', {
      totalActiveGroups: totalActiveGroups.value,
      totalProjectGroups: props.totalProjectGroups,
      calculatedMin: min,
      calculatedMax: max,
      issue: '已提交組數 > 專案總組數（不應該發生）'
    })

    // ✅ 顯示錯誤給用戶
    ElMessage.error({
      message: `數據異常：繳交組數 (${totalActiveGroups.value}) 超過專案總組數 (${max})，請聯繫管理員`,
      duration: 0,  // 不自動關閉，強制用戶注意
      showClose: true
    })

    // 強制修正：使用 Math.min 限制在 max 以內（防止崩潰）
    return Math.min(min, max)
  }

  return min
})

const renderedFinalVersionContent = computed(() => {
  // 支持 contentMarkdown (useVotingData API) 和 content (舊版 API) 兩種字段名
  const version = finalVersionData.value as any
  const content = version?.contentMarkdown || version?.content
  if (!content) return '<p class="no-content">暫無內容</p>'
  return parseMarkdown(content)
})

// ✅ Phase 3 优化：使用 composable 提供的投票数据
const currentSubmissionVotingData = computed(() => {
  // 如果有指定 submissionId，查找对应的投票数据
  if (props.submissionId) {
    const version = votingDataComposable.votingHistory.value.find(
      (v: any) => v.submissionId === props.submissionId
    )
    if (version) {
      return {
        ...version,
        participationProposal: currentVersionData.value?.participationProposal || {}
      }
    }
  }

  // 否则返回当前活跃版本的投票数据
  if (votingDataComposable.currentVersionVotingData.value) {
    return {
      ...votingDataComposable.currentVersionVotingData.value,
      participationProposal: currentVersionData.value?.participationProposal || {}
    }
  }

  return null
})

// 計算參與度變化（用於舊版本比較）
const participationChanges = computed(() => {
  if (!isViewingOldVersion.value) return []

  const oldProposal = currentVersionData.value?.participationProposal || {}
  const newProposal = finalVersionData.value?.participationProposal || {}

  // 合併所有出現過的成員
  const allEmails = new Set([...Object.keys(oldProposal), ...Object.keys(newProposal)])

  return Array.from(allEmails).map(email => {
    const oldPercent = Math.round((oldProposal[email] || 0) * 100)
    const newPercent = Math.round((newProposal[email] || 0) * 100)
    const diff = newPercent - oldPercent

    return {
      email,
      displayName: getUserDisplayName(email),
      oldPercent,
      newPercent,
      diff
    }
  }).filter(change => change.diff !== 0 || change.oldPercent > 0 || change.newPercent > 0)  // 顯示所有相關成員
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))  // 按變化幅度排序
})

// 單一真相來源：當前活躍版本的參與度提案
// 優先順序：currentVersionData > finalVersionData > submissionData prop
const activeParticipationProposal = computed(() => {
  console.log('🔍 activeParticipationProposal 調試:', {
    currentVersionData: currentVersionData.value,
    finalVersionData: finalVersionData.value,
    submissionData: props.submissionData,
    currentProposal: currentVersionData.value?.participationProposal,
    currentPercentages: (currentVersionData.value as any)?.participationPercentages,
    finalProposal: finalVersionData.value?.participationProposal,
    finalPercentages: (finalVersionData.value as any)?.participationPercentages,
    submissionProposal: props.submissionData?.participationProposal,
    submissionPercentages: props.submissionData?.participationPercentages
  })

  // 如果正在查看特定版本（包括舊版本），使用該版本的數據
  // 支持 participationProposal 和 participationPercentages 兩種字段名
  const currentProposal = currentVersionData.value?.participationProposal
                       || currentVersionData.value?.participationPercentages

  if (currentProposal && typeof currentProposal === 'object' && Object.keys(currentProposal).length > 0) {
    console.log('✅ 使用 currentVersionData 的參與度數據:', currentProposal)
    return currentProposal
  }

  // 否則使用最終版本的數據
  const finalProposal = finalVersionData.value?.participationProposal
                     || (finalVersionData.value as any)?.participationPercentages

  if (finalProposal && typeof finalProposal === 'object' && Object.keys(finalProposal).length > 0) {
    console.log('✅ 使用 finalVersionData 的參與度數據:', finalProposal)
    return finalProposal
  }

  // 最後嘗試從 submissionData prop 獲取（備選數據源）
  const submissionProposal = props.submissionData?.participationProposal
                          || props.submissionData?.participationPercentages

  if (submissionProposal && typeof submissionProposal === 'object' && Object.keys(submissionProposal).length > 0) {
    console.log('✅ 使用 submissionData prop 的參與度數據:', submissionProposal)
    return submissionProposal
  }

  // 備用方案：如果都沒有參與度數據，嘗試從 participants 或 actualAuthors 構建均分數據
  const participants = (finalVersionData.value as any)?.participants
                    || (currentVersionData.value as any)?.participants
                    || finalVersionData.value?.actualAuthors
                    || currentVersionData.value?.actualAuthors

  if (participants && Array.isArray(participants) && participants.length > 0) {
    console.log('⚡ 使用 participants/actualAuthors 構建均分參與度數據:', participants)
    // 構建均分的參與度對象（每人分配相等比例）
    const equalShare = 1 / participants.length
    const proposal: Record<string, number> = {}
    participants.forEach((email: string) => {
      proposal[email] = equalShare
    })
    console.log('✅ 構建的均分參與度數據:', proposal)
    return proposal
  }

  // 沒有數據則返回 null（明確表示缺失）
  console.warn('⚠️ 沒有找到參與度數據（所有數據源都為空）')
  return null
})

// 檢查當前用戶是否為本次提交的參與者
const isCurrentUserParticipant = computed(() => {
  const proposal = votingData.value.participationProposal
  if (!proposal || typeof proposal !== 'object') {
    console.warn('⚠️ isCurrentUserParticipant: 沒有 participationProposal 數據')
    return false
  }

  const userEmail = props.user?.userEmail
  if (!userEmail) {
    console.warn('⚠️ isCurrentUserParticipant: 沒有當前用戶 email')
    return false
  }

  const participation = proposal[userEmail]
  const isParticipant = participation !== undefined && participation > 0

  console.log('🔍 isCurrentUserParticipant 檢查:', {
    userEmail,
    participation,
    isParticipant,
    proposal
  })

  return isParticipant
})

// 構建用於圖表顯示的成員列表
const chartSelectedMembers = computed(() => {
  const participationSource = activeParticipationProposal.value

  console.log('📊 chartSelectedMembers 調試:', {
    participationSource,
    hasSource: !!participationSource,
    groupMembersCount: props.groupMembers?.length || 0
  })

  if (!participationSource) {
    console.warn('⚠️ chartSelectedMembers: 沒有參與度數據')
    return []
  }

  try {
    const participationProposal = typeof participationSource === 'string'
      ? JSON.parse(participationSource)
      : participationSource

    const selectedMembers = Object.entries(participationProposal).map(([email, percentage]: [string, any]) => {
      const member = props.groupMembers.find(m => (m.userEmail || m.email) === email) || {}
      return {
        email,
        displayName: member.displayName || email.split('@')[0],
        avatarSeed: member.avatarSeed,
        avatarStyle: member.avatarStyle,
        avatarOptions: member.avatarOptions,
        contribution: percentage * 100,
        selected: true
      }
    })

    console.log('✅ chartSelectedMembers 構建成功:', selectedMembers)

    // Only calculate points if we have members and total percentage is 100%
    const totalPct = selectedMembers.reduce((sum, m) => sum + m.contribution, 0)
    if (selectedMembers.length === 0 || totalPct !== 100) {
      return selectedMembers
    }

    // Calculate points using the scoring algorithm
    const result = calculateScoring(
      selectedMembers,
      simulatedRank.value,
      props.stageReward,
      simulatedGroupCount.value,
      (props.allGroups || []) as any[],
      props.currentGroupId || null
    )

    return result
  } catch (error) {
    console.error('❌ 解析參與度數據失敗:', error)
    return []
  }
})

// 計算總百分比用於圖表組件
const totalPercentage = computed(() => {
  return chartSelectedMembers.value.reduce((sum: number, m: any) => sum + m.contribution, 0)
})

// 構建 Tsum-Tsum 圖表所需的數據結構（只有支持票）
const tsumTsumVoteData = computed(() => {
  const votingHistory = votingDataComposable.votingHistory.value
  if (!votingHistory) return {}

  const voteData: Record<string, any> = {}

  votingHistory.forEach((version: any) => {
    voteData[version.submissionId] = {
      support: version.votes.filter((v: any) => v.agree === 1 || v.agree === true),
      oppose: [] // 共識制不顯示反對票
    }
  })

  return voteData
})

// 版本標籤陣列
const tsumTsumVersionLabels = computed(() => {
  const versions = votingDataComposable.versions.value
  if (!versions) return []

  return versions.map((v: any, i: number) =>
    i === versions.length - 1 ? '最終版本' : formatVersionStepTime(v.submitTime)
  )
})

// 版本狀態陣列（用於圖表判斷是否放煙火）
const versionStatuses = computed(() => {
  return votingDataComposable.versionStatuses.value
})

// ===== Watchers =====
watch(() => props.visible, (newVal) => {
  console.log('[DEBUG] visible changed:', { visible: newVal, submissionId: props.submissionId })
  if (newVal) {
    // 清除之前的數據，強制重新載入
    resetData()

    // 添加共識警告
    warning(
      '如果在截止時間前貴組沒有達到集體共識，系統將沒收你們這階段的獎金',
      '共識提醒'
    )

    // ✅ Phase 3 优化：使用 composable 刷新数据
    votingDataComposable.refreshAll().then(() => {
      // 数据加载后设置当前版本
      const activeVer = votingDataComposable.activeVersion.value
      console.log('[DEBUG] visible watcher - after refresh:', {
        activeVer: activeVer?.submissionId,
        versionsCount: votingDataComposable.versions.value.length,
        allVersionIds: votingDataComposable.versions.value.map(v => v.submissionId)
      })
      if (activeVer) {
        currentVersionId.value = activeVer.submissionId
        selectedVersion.value = activeVer.submissionId
        currentVersionData.value = activeVer
        console.log('[DEBUG] visible watcher - state initialized:', {
          currentVersionId: currentVersionId.value,
          selectedVersion: selectedVersion.value,
          hasContentMarkdown: !!activeVer.contentMarkdown
        })

        // 初始化 simulatedGroupCount（如果尚未設置）
        if (!simulatedGroupCount.value && props.totalActiveGroups) {
          simulatedGroupCount.value = Math.max(1, props.totalActiveGroups)
        }

        // 確保 simulatedRank 在有效範圍內
        if (simulatedRank.value > simulatedGroupCount.value) {
          simulatedRank.value = 1
        }
      }
    })
  } else {
    clearAlerts()
    resetData()
  }
})

// 監聽submissionId變化，確保數據更新
watch(() => props.submissionId, (newVal, oldVal) => {
  console.log('[DEBUG] submissionId changed:', { newVal, oldVal, visible: props.visible })
  if (newVal && newVal !== oldVal && props.visible) {
    votingDataComposable.refreshAll().then(() => {
      // ✅ 同步 local state，與 visible watcher 一致
      const activeVer = votingDataComposable.activeVersion.value
      console.log('[DEBUG] submissionId watcher - after refresh:', {
        activeVer: activeVer?.submissionId,
        previousSelectedVersion: selectedVersion.value,
        previousCurrentVersionId: currentVersionId.value
      })
      if (activeVer) {
        currentVersionId.value = activeVer.submissionId
        selectedVersion.value = activeVer.submissionId
        currentVersionData.value = activeVer
      }
    })
  }
})

// ✅ 監聽 totalActiveGroups 變化（只在增加時調整，允許用戶手動選擇更小值）
watch(totalActiveGroups, (newVal, oldVal) => {
  if (newVal !== oldVal && newVal > 0) {
    // 只在 totalActiveGroups 增加時調整 simulatedGroupCount
    // 允許用戶手動選擇更小的模擬組數（用於假設場景）
    if (oldVal && newVal > oldVal && simulatedGroupCount.value < newVal) {
      simulatedGroupCount.value = newVal
    }

    // 保留：防止超過總組數
    if (simulatedGroupCount.value > props.totalProjectGroups) {
      simulatedGroupCount.value = props.totalProjectGroups
    }

    // 保留：確保 simulatedRank 在有效範圍內
    if (simulatedRank.value > simulatedGroupCount.value) {
      simulatedRank.value = 1
    }
  }
})

// ✅ Phase 3 优化：votingData 现在是 computed，自动同步，不需要 watcher

// ===== Data Validation on Modal Open =====
// 監聽 modal 打開，驗證必要數據
watch(() => props.visible, (newVisible) => {
  if (!newVisible) return // 只在打開時驗證

  // ✅ 驗證必要數據
  if (props.totalProjectGroups <= 0) {
    console.error('❌ [GroupSubmissionApprovalModal] totalProjectGroups 異常:', props.totalProjectGroups)
    ElMessage.error({
      message: '專案組數數據異常，無法顯示點數分配',
      duration: 5000
    })
    emit('update:visible', false)
    return
  }

  if (!props.stageReward || props.stageReward <= 0) {
    console.warn('⚠️ [GroupSubmissionApprovalModal] stageReward 異常:', props.stageReward)
    ElMessage.warning({
      message: '階段獎金數據異常，點數計算可能不準確',
      duration: 5000
    })
  }
})

// ===== 煙火動畫：監聽共識達成 =====
watch(() => votingData.value.isApproved, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    triggerFireworks()
  }
})

function triggerFireworks() {
  showFireworks.value = true
  setTimeout(() => {
    showFireworks.value = false
  }, 1500)
}

function getFireworkEmoji(index: number): string {
  return fireworkEmojis[index % fireworkEmojis.length]
}

function getFireworkStyle(index: number): Record<string, string> {
  const angle = (index / 8) * 360
  return {
    '--angle': `${angle}deg`,
    '--delay': `${index * 50}ms`
  }
}

// ===== Lifecycle Hooks =====

onBeforeUnmount(() => {
  // 組件銷毀前清理所有 D3 tooltips，防止記憶體洩漏
  cleanupTooltips()

  // 圖表組件會自動清理資源
})

// ===== Methods =====
function handleClose() {
  emit('update:visible', false)
}

function resetData() {
  // ✅ Phase 3 优化：votingData 现在是 computed，自动从 composable 获取数据
  // 只需重置本地状态
  submitting.value = false
  showDeleteDialog.value = false
  deleteConfirmText.value = ''
  deleting.value = false
  selectedVersion.value = ''
  currentVersionId.value = ''
  currentVersionData.value = null
}

// ✅ Phase 3 优化：loadVotingHistory 已由 useVotingData composable 取代

async function submitVote(agree: boolean) {
  try {
    submitting.value = true

    // ✅ Phase 3 优化：使用 composable 的 submitVote 方法
    const result = await votingDataComposable.submitVote(agree)
    if (!result) {
      throw new Error('投票失敗：無法獲取結果')
    }
    const { votingSummary } = result

    if (votingSummary.isApproved) {
      ElMessage.success('投票成功！本組報告已獲得通過')
    } else {
      ElMessage.success('投票成功！')
    }

    // 重新渲染圖表（投票趨勢圖自動更新，參與度圖手動更新）
    await nextTick()
    renderParticipationChart()

    // 通知父組件刷新
    emit('vote-submitted', { success: true, data: result })
  } catch (error) {
    console.error('投票失敗:', error)
    ElMessage.error('投票失敗：' + getErrorMessage(error))
  } finally {
    submitting.value = false
  }
}

function showDeleteConfirmation() {
  showDeleteDialog.value = true
  deleteConfirmText.value = ''
}

async function confirmDelete() {
  if (deleteConfirmText.value.toUpperCase() !== 'DELETE') return

  try {
    deleting.value = true
    const httpResponse = await rpcClient.submissions.delete.$post({
      json: {
        projectId: props.projectId,
        submissionId: props.submissionId
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('報告已刪除，可以重新提交')
      showDeleteDialog.value = false
      handleClose()
      emit('submission-deleted')
    } else {
      const errorMsg = response.error?.message || response.error || '未知錯誤'
      console.error('刪除報告失敗:', {
        projectId: props.projectId,
        submissionId: props.submissionId,
        error: response.error,
        errorCode: response.errorCode
      })
      ElMessage.error('刪除報告失敗：' + errorMsg)
    }
  } catch (error) {
    console.error('刪除報告失敗:', error)
    ElMessage.error('刪除報告失敗：' + getErrorMessage(error))
  } finally {
    deleting.value = false
  }
}

function getStatusClass() {
  const data = votingData.value
  if (!data || typeof data !== 'object') return 'in-progress'

  if (data.isApproved) return 'approved'
  if (data.totalVotes === data.totalMembers) {
    // All members voted but not approved means consensus not reached
    return data.agreeVotes === data.totalMembers ? 'approved' : 'rejected'
  }
  return 'in-progress'
}

function getStatusText() {
  const data = votingData.value
  if (!data || typeof data !== 'object') return '投票中'

  if (data.isApproved) return '已通過'
  if (data.totalVotes === data.totalMembers) {
    // All members voted - check if consensus reached
    return data.agreeVotes === data.totalMembers ? '共識達成' : '共識未達成'
  }
  return '投票中'
}

function getConsensusPercentage() {
  const data = votingData.value

  // 防御性检查：确保 data 是对象且有必要的属性
  if (!data || typeof data !== 'object') {
    console.warn('⚠️ getConsensusPercentage: votingData is not an object', data)
    return 0
  }

  const totalMembers = data.totalMembers
  const agreeVotes = data.agreeVotes

  // 确保是数字
  if (typeof totalMembers !== 'number' || typeof agreeVotes !== 'number') {
    console.warn('⚠️ getConsensusPercentage: invalid data types', { totalMembers, agreeVotes })
    return 0
  }

  if (totalMembers === 0) return 0
  return Math.min(100, (agreeVotes / totalMembers) * 100)
}

function getProgressColor() {
  const percentage = getConsensusPercentage()
  if (percentage >= 100) return '#67c23a'
  if (percentage >= 70) return '#e6a23c'
  return '#f56c6c'
}

function getUserDisplayName(email: string) {
  // 1. 先從groupMembers中查找
  const member = props.groupMembers.find(m => (m.userEmail || m.email) === email)
  if (member?.displayName) {
    return member.displayName
  }

  // 2. 從projectUsers prop中查找
  const user = props.projectUsers.find(u => u.userEmail === email)
  if (user?.displayName) {
    return user.displayName
  }

  // 3. Fallback到email前綴
  return email.split('@')[0]
}

function getUserVoteStatus() {
  // 使用後端直接返回的 currentUserVote
  if (!votingData.value.currentUserVote) {
    return '未投票'
  }

  return votingData.value.currentUserVote.agree ? '贊成' : '反對'
}

function formatDateTime(timestamp: number | string | undefined) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatVersionTime(timestamp: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatVersionStepTime(timestamp: number | string | undefined) {
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

function getSubmitterDisplayName(versionData: any) {
  if (!versionData) return ''
  return versionData.submitterName || versionData.submitter?.split('@')[0] || '未知用戶'
}

function getStepStatus(version: any, index: number) {
  // 只有 submitted 版本顯示藍色，其他都不顯示狀態圖示
  if (version.status === 'submitted') {
    return 'process'  // 藍色高亮
  }
  return ''  // 空字串 = 無狀態圖示，只顯示灰色數字
}

function getVersionStatusText(version: any) {
  if (!version) return ''

  if (version.status === 'withdrawn') {
    const time = formatDateTime(version.withdrawnTime)
    const by = version.withdrawnByName || version.withdrawnBy?.split('@')[0] || '未知'
    return `撤回於：${time} (${by})`
  }

  if (version.status === 'submitted') {
    return '當前等待共識版本'
  }

  if (version.status === 'approved') {
    const time = formatDateTime(version.updatedAt)
    return `已通過，時間：${time}`
  }

  return ''
}

function getSubmitterName(email: string) {
  if (!email) return ''
  return getUserDisplayName(email)
}

// ✅ Phase 3 优化：loadAllVersions 已由 useVotingData composable 取代

async function handleVersionChange(versionId: string) {
  console.log('[DEBUG] handleVersionChange called:', {
    versionId,
    versionsCount: votingDataComposable.versions.value.length,
    versionIds: votingDataComposable.versions.value.map(v => v.submissionId)
  })

  const version = votingDataComposable.versions.value.find(v => v.submissionId === versionId)
  console.log('[DEBUG] Found version:', version ? 'YES' : 'NO', version?.submissionId)

  if (version) {
    selectedVersion.value = versionId
    currentVersionData.value = version
    console.log('[DEBUG] Updated state:', {
      selectedVersion: selectedVersion.value,
      currentVersionId: currentVersionId.value,
      isViewingOldVersion: selectedVersion.value !== currentVersionId.value,
      hasContentMarkdown: !!version.contentMarkdown
    })

    // 點數分配圖表由組件自動響應式更新，無需手動渲染
  }
}

function showRestoreConfirmation() {
  showRestoreDialog.value = true
  restoreConfirmText.value = ''
}

async function confirmRestore() {
  if (restoreConfirmText.value.toUpperCase() !== 'RESTORE') return

  try {
    restoring.value = true
    const httpResponse = await rpcClient.submissions.restore.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        submissionId: selectedVersion.value
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('版本已恢復，可以重新開始投票')
      showRestoreDialog.value = false
      // 重新載入所有版本和投票數據
      await votingDataComposable.refreshAll()
      emit('submission-restored')
    } else {
      ElMessage.error('恢復版本失敗：' + (response.error?.message || '未知錯誤'))
    }
  } catch (error) {
    console.error('恢復版本失敗:', error)
    ElMessage.error('恢復版本失敗')
  } finally {
    restoring.value = false
  }
}

function renderParticipationChart() {
  // This method is currently not used as charts are handled by Vue components
  // Kept for backward compatibility
  console.log('renderParticipationChart called (handled by Vue components)')
}

function cleanupTooltips() {
  // 清除所有類型的 tooltips
  d3.selectAll('.chart-tooltip').remove()
  d3.selectAll('.vote-tooltip').remove()
}
</script>

<style scoped>
/* Breadcrumb Navigation */
.breadcrumb-section {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

/* 參與度分配區塊樣式 */
.participation-distribution-section {
  padding: 20px 25px;
  background: #fefefe;
  border-bottom: 1px solid #e1e8ed;
}

.section-header {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.section-header h3 {
  margin: 0 0 5px 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
}

.section-subtitle {
  color: #6c757d;
  font-size: 14px;
  margin: 0;
  flex: 1;
}

.rank-simulation {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333;
}

.rank-simulation label {
  font-weight: 500;
}

.rank-selector {
  width: 120px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-title i {
  color: #6c757d;
}

.version-selector-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

/* 版本選擇器區域特定樣式 */
.version-selector-section .section-header {
  margin-bottom: 15px;
  display: block; /* 不使用 flex 排版 */
}

.version-selector-section .section-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

/* 選擇器容器 - 使用垂直流式排版 */
.selector-container {
  width: 100%;
}

.version-selector {
  width: 100%;
  max-width: 500px;
}

.version-selector :deep(.el-select__wrapper) {
  border: 2px solid #d0d7de;
  border-radius: 8px;
  transition: border-color 0.2s;
}

.version-selector :deep(.el-select__wrapper:hover) {
  border-color: #8b949e;
}

.version-selector :deep(.el-select__wrapper.is-focused) {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.12);
}

.version-tag {
  font-size: 11px;
  color: #666;
  font-weight: normal;
}

.version-tag.current {
  color: #67c23a;
  font-weight: 500;
}

.version-hint-alert {
  margin: 15px 0;
  border-radius: 4px;
}

.version-hint-alert :deep(.el-alert__title) {
  font-size: 13px;
}

.submission-content-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

.submission-content-section .section-header {
  margin-bottom: 15px;
  display: block;
}

.submission-content-section .section-header h3 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

.submission-meta {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #666;
}

.submission-content {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.6;
}

.submission-content h1,
.submission-content h2,
.submission-content h3 {
  color: #2c3e50;
  margin-top: 0;
  margin-bottom: 12px;
}

.submission-content p {
  margin: 0 0 12px 0;
  color: #555;
}

.submission-content pre {
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
}

.submission-content code {
  background: #f4f4f4;
  padding: 2px 4px;
  border-radius: 2px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
}

.submission-content a {
  color: #409eff;
  text-decoration: none;
}

.submission-content a:hover {
  text-decoration: underline;
}

.no-content {
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 40px 20px;
}

.restore-confirmation,
.delete-confirmation {
  text-align: center;
  padding: 20px 0;
}

.restore-confirmation .warning-icon,
.delete-confirmation .warning-icon {
  font-size: 48px;
  color: #e6a23c;
  margin-bottom: 20px;
}

.restore-confirmation p,
.delete-confirmation p {
  margin: 10px 0;
  color: #333;
}

.restore-confirmation .warning-text,
.delete-confirmation .warning-text {
  color: #e6a23c;
  font-weight: 500;
  background: #fdf6ec;
  padding: 10px;
  border-radius: 6px;
  border-left: 4px solid #e6a23c;
}

.restore-disabled-hint,
.delete-disabled-hint {
  margin-top: 10px;
  padding: 8px 12px;
  background-color: #f4f4f5;
  border-left: 3px solid #909399;
  border-radius: 4px;
  color: #606266;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.restore-disabled-hint i,
.delete-disabled-hint i {
  color: #909399;
}

.confirm-input {
  margin-top: 20px;
  max-width: 300px;
}

.contribution-chart {
  margin-top: 15px;
}

.chart-description {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  color: #606266;
}

.chart-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 15px;
  padding: 8px 12px;
  background: #f0f9ff;
  border-left: 3px solid #409eff;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
}

.chart-note i {
  color: #409eff;
}

.chart-container {
  width: 100%;
  min-height: 170px;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  padding: 10px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: #6c757d;
  font-style: italic;
  background: #f8f9fa;
  border-radius: 6px;
}

.voting-status-section {
  padding: 25px;
}

.status-card {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-header h3 {
  margin: 0;
  color: #2c3e50;
}

.status-badge-container {
  position: relative;
  display: inline-block;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

/* 煙火動畫 */
.fireworks-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.firework-particle {
  position: absolute;
  font-size: 0;
  opacity: 0;
  animation: firework-explode 1.5s ease-out forwards;
  animation-delay: var(--delay);
}

@keyframes firework-explode {
  0% {
    font-size: 0;
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
  }
  30% {
    font-size: 24px;
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-30px);
  }
  100% {
    font-size: 16px;
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-60px);
  }
}

.status-badge.approved {
  background: #d4edda;
  color: #155724;
}

.status-badge.rejected {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.in-progress {
  background: #fff3cd;
  color: #856404;
}

.voting-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 20px;
  gap: 16px;
}

.voting-stats :deep(.el-statistic) {
  flex: 1;
  text-align: center;
}

.voting-stats :deep(.el-statistic__head) {
  font-size: 13px;
  color: #666;
}

.voting-stats :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
}

.progress-section {
  margin-top: 15px;
}

.progress-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.chart-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.chart-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

.chart-legend {
  display: flex;
  gap: 15px;
  font-size: 13px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #666;
}

.legend-item.agree .legend-dot {
  background: #67c23a;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

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

.vote-item.non-participant {
  border-left: 3px solid #c0c4cc;
  opacity: 0.6;
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

.vote-badge.non-participant {
  background: #e9ecef;
  color: #6c757d;
}

.version-timeline-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

.version-step-description {
  font-size: 13px;
  color: #666;
}

.submitter-line {
  margin-bottom: 4px;
}

.status-line {
  color: #909399;
  font-style: italic;
}

.participation-comparison-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px solid #e1e8ed;
}

.participation-changes {
  margin-top: 15px;
}

.changes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
}

.member-name {
  font-weight: 500;
  color: #2c3e50;
  min-width: 100px;
}

.change-arrow {
  flex: 1;
  color: #666;
  font-size: 13px;
}

.old-value {
  color: #909399;
}

.new-value {
  color: #2c3e50;
  font-weight: 500;
}

.change-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.change-badge.increase {
  background: #d4edda;
  color: #155724;
}

.change-badge.decrease {
  background: #f8d7da;
  color: #721c24;
}

.change-badge.neutral {
  background: #f4f4f5;
  color: #909399;
}

.diff-container {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.diff-container :deep(.d2h-wrapper) {
  font-size: 13px;
}
</style>
