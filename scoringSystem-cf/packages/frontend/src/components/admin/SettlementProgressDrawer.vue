<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    direction="btt"
    size="100%"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="settlementStatus === 'completed' || settlementStatus === 'idle'"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-tasks"></i>
          階段結算進度
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="settlement-drawer-content">
      <!-- Validation Step -->
      <div v-if="settlementStatus === 'validating'" class="settlement-validation-section">
        <div class="stage-info">
          <h3>{{ settlementProgress.stageName }}</h3>
          <el-tag type="info">檢查資料完整性</el-tag>
        </div>

        <!-- Progress bar for validation -->
        <div class="progress-section">
          <el-progress
            :percentage="settlementProgress.progress"
            :status="settlementValidation?.valid === false ? 'exception' : 'success'"
            :stroke-width="20"
          />
          <p class="progress-message">{{ settlementProgress.message }}</p>
        </div>

        <!-- Validation Results -->
        <div v-if="settlementValidation" class="validation-results">
          <div v-if="settlementValidation.valid" class="validation-success">
            <el-result icon="success" title="驗證通過！" sub-title="所有條件已滿足，可以開始結算">
              <template #extra>
                <p>系統將自動繼續結算流程...</p>
              </template>
            </el-result>
          </div>

          <div v-else class="validation-failed">
            <el-result icon="warning" title="資料完整性檢查未通過" sub-title="以下條件未滿足，建議先完善資料後再結算">
              <template #extra>
                <div class="validation-warnings" v-html="buildValidationWarningMessage(settlementValidation)"></div>

                <div class="validation-actions">
                  <el-button type="danger" @click="forceSettle" :loading="(settlementStatus as SettlementStatus) === 'settling'">
                    <i class="fas fa-exclamation-triangle"></i> 強制結算
                  </el-button>
                  <el-button @click="closeDrawer">
                    取消
                  </el-button>
                </div>
              </template>
            </el-result>
          </div>
        </div>
      </div>

      <!-- Settlement in progress -->
      <div v-if="settlementStatus === 'settling'" class="settlement-progress-section">
        <div class="stage-info">
          <h3>{{ settlementProgress.stageName }}</h3>
          <el-tag type="info">結算中</el-tag>
        </div>

        <!-- Progress bar -->
        <div class="progress-section">
          <el-progress
            :percentage="settlementProgress.progress"
            :status="settlementProgress.progress === 100 ? 'success' : undefined"
            :stroke-width="20"
          />
          <p class="progress-message">{{ settlementProgress.message }}</p>
        </div>

        <!-- Progress steps -->
        <el-steps
          :active="getActiveStep(settlementProgress.step)"
          direction="vertical"
          finish-status="success"
        >
          <el-step title="檢查資料完整性" description="驗證結算條件" />
          <el-step title="鎖定階段" description="準備開始結算" />
          <el-step title="計算投票" description="處理教師和學生投票" />
          <el-step title="分配報告獎勵" description="依據排名分配獎勵給各組" />
          <el-step title="分配評論獎勵" description="分配優秀評論獎勵" />
          <el-step title="完成結算" description="所有獎勵已發放" />
        </el-steps>

        <!-- Details if available -->
        <div v-if="settlementProgress.details" class="progress-details">
          <el-divider content-position="left">詳細資訊</el-divider>
          <div class="detail-item" v-if="settlementProgress.details.teacherVoteCount !== undefined">
            <span class="label">教師投票數：</span>
            <span class="value">{{ settlementProgress.details.teacherVoteCount }}</span>
          </div>
          <div class="detail-item" v-if="settlementProgress.details.studentVoteCount !== undefined">
            <span class="label">學生投票數：</span>
            <span class="value">{{ settlementProgress.details.studentVoteCount }}</span>
          </div>
          <div class="detail-item" v-if="settlementProgress.details.groupCount !== undefined">
            <span class="label">參與組數：</span>
            <span class="value">{{ settlementProgress.details.groupCount }}</span>
          </div>
          <div class="detail-item" v-if="settlementProgress.details.totalRewardDistributed !== undefined">
            <span class="label">總獎勵：</span>
            <span class="value">{{ settlementProgress.details.totalRewardDistributed }} 點</span>
          </div>
        </div>
      </div>

      <!-- Settlement completed -->
      <div v-else-if="settlementStatus === 'completed' && settlementResult" class="settlement-result-section">
        <div class="stage-info">
          <h3>{{ settlementProgress.stageName }}</h3>
          <el-tag type="success">結算完成</el-tag>
        </div>

        <el-result icon="success" title="結算完成！" sub-title="獎金已成功分配給各組成員">
          <template #extra>
            <div class="result-summary">
              <el-statistic title="參與組數" :value="settlementResult.participantCount" />
              <el-statistic title="總獎勵" :value="settlementResult.totalRewardDistributed" suffix="點" />
            </div>
          </template>
        </el-result>

        <!-- Point Distribution Visualization -->
        <div v-if="settlementReportRankingsData.length > 0" class="point-distribution-section">
          <el-divider content-position="left">成果獎勵分配視覺化</el-divider>
          <AllGroupsChart
            :selected-members="[]"
            :simulated-rank="1"
            :simulated-group-count="settlementReportRankingsData.length"
            :report-reward="settlementProgress.reportRewardPool || 1000"
            :all-groups="settlementReportRankingsData as any"
            :current-group-id="null"
            :total-project-groups="settlementReportRankingsData.length"
            :current-group-label="''"
            :group-by-rank="false"
            @group-click="(data: GroupClickData) => { handleSettlementGroupClick(data); }"
          />
          <div class="chart-hint">
            <i class="fas fa-lightbulb"></i> 點擊任一組別可查看該組成員的實際點數分配
          </div>
        </div>

        <!-- Selected Group Detail (OurGroupChart + Transaction List) -->
        <div v-if="selectedSettlementGroup" class="selected-group-detail">
          <el-divider content-position="left">
            {{ selectedSettlementGroup.groupName }} - 組內點數分配詳情
            <el-button
              type="text"
              size="small"
              @click="selectedSettlementGroup = null"
              style="margin-left: 10px;"
            >
              <i class="fas fa-times"></i> 關閉
            </el-button>
          </el-divider>

          <!-- Loading transactions -->
          <div v-if="loadingSettlementTransactions" class="loading-section">
            <i class="fas fa-spinner fa-spin"></i> 載入組員點數資料中...
          </div>

          <!-- OurGroupChart with real transaction data -->
          <div v-else-if="settlementGroupTransactions.length > 0">
            <el-button
              type="primary"
              style="margin-bottom: 15px;"
              @click="showScoringExplanation = true"
            >
              <i class="fas fa-calculator"></i> 點數計算說明
            </el-button>

            <OurGroupChart
              :members="settlementGroupMembers"
              :group-name="selectedSettlementGroup.groupName"
              :rank="selectedSettlementGroup.rank"
              :total-points="settlementGroupTransactions.reduce((sum, tx) => sum + tx.amount, 0)"
            />

            <!-- Member Transaction Details Table -->
            <el-table :data="settlementGroupTransactions" stripe style="margin-top: 20px;">
              <el-table-column prop="displayName" label="組員" width="200" />
              <el-table-column prop="userEmail" label="Email" />
              <el-table-column label="獲得點數" width="120">
                <template #default="scope">
                  <el-tag type="success">{{ scope.row.amount.toFixed(2) }} 點</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="participationPercentage" label="參與度" width="100">
                <template #default="scope">
                  {{ (scope.row.participationPercentage * 100).toFixed(0) }}%
                </template>
              </el-table-column>
              <el-table-column prop="timestamp" label="交易時間" width="180">
                <template #default="scope">
                  {{ formatTime(scope.row.timestamp) }}
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- No transactions found -->
          <EmptyState
            v-else
            parent-icon="fa-money-bill-transfer"
            :icons="['fa-receipt']"
            title="未找到該組的交易記錄"
            :compact="true"
            :enable-animation="false"
          />
        </div>

        <!-- Rankings table -->
        <el-divider content-position="left">最終排名</el-divider>
        <el-table :data="formatRankingsForDisplay(settlementResult.rankings, settlementResult.scores, false)" stripe>
          <el-table-column prop="rank" label="排名" width="80" />
          <el-table-column prop="groupName" label="組別" />
          <el-table-column prop="score" label="獎勵點數" width="120">
            <template #default="scope">
              <el-tag type="success">{{ scope.row.score }} 點</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="weightedScore" label="加權分數" width="120">
            <template #default="scope">
              <span class="weighted-score">{{ scope.row.weightedScore?.toFixed(2) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- Comment rankings if available -->
        <div v-if="settlementResult.commentRankings && Object.keys(settlementResult.commentRankings).length > 0">
          <el-divider content-position="left">評論獎勵排名</el-divider>

          <!-- Comment Distribution Visualization (Single-Person Group Mode) -->
          <div v-if="settlementCommentRankingsData.length > 0" class="point-distribution-section">
            <AllGroupsChart
              :selected-members="[]"
              :simulated-rank="1"
              :simulated-group-count="settlementCommentRankingsData.length"
              :report-reward="settlementProgress.commentRewardPool || 500"
              :all-groups="settlementCommentRankingsData as any"
              :current-group-id="null"
              :total-project-groups="settlementCommentRankingsData.length"
              :current-group-label="''"
              :group-by-rank="false"
              @group-click="(data: GroupClickData) => { handleSettlementCommentClick(data); }"
            />
            <div class="chart-hint">
              <i class="fas fa-lightbulb"></i> 評論獎勵按作者分配（每位作者視為單人組）
            </div>
          </div>

          <el-table :data="formatRankingsForDisplay(settlementResult.commentRankings, settlementResult.commentScores, true)" stripe>
            <el-table-column prop="rank" label="排名" width="80" />
            <el-table-column prop="groupName" label="評論作者" />
            <el-table-column prop="score" label="獎勵點數" width="120">
              <template #default="scope">
                <el-tag type="warning">{{ scope.row.score }} 點</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="drawer-actions">
          <el-button type="primary" @click="closeDrawer">
            <i class="fas fa-times"></i> 關閉
          </el-button>
        </div>
      </div>
    </div>

    <!-- Scoring Explanation Drawer -->
    <ScoringExplanationDrawer
      v-if="selectedSettlementGroup && settlementGroupMembers.length > 0"
      v-model:visible="showScoringExplanation"
      :group-data="{
        groupName: selectedSettlementGroup.groupName,
        finalRank: selectedSettlementGroup.rank,
        totalGroups: settlementReportRankingsData.length,
        allocatedPoints: settlementGroupTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        members: settlementGroupMembers
      }"
      :project-config="{
        studentWeight: 0.7,
        teacherWeight: 0.3
      }"
      mode="report"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useEventListener } from '@vueuse/core'
import { SettlementProgressDataSchema } from '@repo/shared/schemas/settlement'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import AllGroupsChart from '../shared/ContributionChart/AllGroupsChart.vue'
import OurGroupChart from '../shared/ContributionChart/OurGroupChart.vue'
import ScoringExplanationDrawer from '../shared/ScoringExplanationDrawer.vue'
import EmptyState from '../shared/EmptyState.vue'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
import { rpcClient } from '@/utils/rpc-client'
import type { GroupClickData } from '@/types/components'

// ========== Type Definitions ==========

type SettlementStatus = 'idle' | 'validating' | 'settling' | 'completed'

interface Stage {
  stageId: string
  stageName: string
  projectId?: string
}

interface SettlementProgress {
  projectId: string
  stageId: string
  stageName: string
  step: string
  progress: number
  message: string
  details: SettlementDetails | null
  reportRewardPool: number
  commentRewardPool: number
}

interface SettlementDetails {
  teacherVoteCount?: number
  studentVoteCount?: number
  groupCount?: number
  totalRewardDistributed?: number
  participantCount?: number
  settlementId?: string
  rankings?: Record<string, number>
  scores?: Record<string, number>
  commentRankings?: Record<string, number>
  commentScores?: Record<string, number>
  groupNames?: Record<string, string>
  authorNames?: Record<string, string>
  groupMembers?: Record<string, string[]>
  weightedScores?: Record<string, number>
  [key: string]: any // Allow additional properties
}

interface ValidationCheck {
  passed: boolean
  details: any
}

interface Validation {
  valid: boolean
  message?: string
  checks: {
    allGroupsVoted: ValidationCheck
    allProposalsApproved: ValidationCheck
    hasCommentRankings: ValidationCheck
    hasTeacherSubmissionRankings: ValidationCheck
    hasTeacherCommentRankings: ValidationCheck
  }
}

interface Transaction {
  userEmail: string
  displayName: string
  amount: number
  participationPercentage: number
  timestamp: string
  metadata?: string | Record<string, any>
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: any
}

interface Member {
  email: string
  displayName: string
  points: number
  contribution: number
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: any
}

interface GroupData {
  groupId: string
  groupName: string
  status?: string
  memberCount?: number
  isCurrentGroup: boolean
  members: Member[]
  rank: number
}

interface SelectedGroup {
  groupId: string
  groupName: string
  rank: number
}

interface RankingDisplay {
  rank: number
  groupId: string
  groupName: string
  score: number
  weightedScore?: number
}

// ========== Props & Emits ==========

interface Props {
  modelValue: boolean
  stage: Stage | null
  projectId: string
}

const props = withDefaults(defineProps<Props>(), {
  stage: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'settlement-complete', data: { stageId: string; settlementId?: string; result: SettlementDetails }): void
  (e: 'settlement-error', data: { stageId: string; error: string }): void
  (e: 'drawer-closed', data: { projectId: string }): void
}>()

// ========== Constants ==========

const MAX_CONTRIBUTION_WEIGHT = 20
const WEIGHT_MULTIPLIER = 5
const DRAWER_CLOSE_ANIMATION_DURATION = 300

// ========== Reactive State ==========

const settlementProgress = reactive<SettlementProgress>({
  projectId: '',
  stageId: '',
  stageName: '',
  step: '',
  progress: 0,
  message: '準備結算...',
  details: null,
  reportRewardPool: 0,
  commentRewardPool: 0
})

const settlementStatus: Ref<SettlementStatus> = ref('idle')
const settlementResult: Ref<SettlementDetails | null> = ref(null)
const settlementValidation: Ref<Validation | null> = ref(null)
const selectedSettlementGroup: Ref<SelectedGroup | null> = ref(null)
const loadingSettlementTransactions: Ref<boolean> = ref(false)
const settlementGroupTransactions: Ref<Transaction[]> = ref([])
const settlementGroupNamesFromTransactions: Ref<Record<string, string>> = ref({})
const showScoringExplanation = ref<boolean>(false)

// ========== Utility Functions ==========

// Utility: Safe JSON parsing
function safeParseMetadata(metadata: string | Record<string, any> | undefined): Record<string, any> {
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {})
  } catch (err) {
    console.warn('Failed to parse metadata:', err)
    return {}
  }
}

// ========== Computed Properties ==========

// Settlement report rankings data for AllGroupsChart
const settlementReportRankingsData = computed((): GroupData[] => {
  if (!settlementResult.value?.rankings || !settlementResult.value?.scores) return []

  // Merge backend groupNames with transaction-derived names
  const groupNames = {
    ...(settlementResult.value?.groupNames || {}),
    ...settlementGroupNamesFromTransactions.value
  }

  // Get group members from settlement result
  const groupMembers = settlementResult.value?.groupMembers || {}

  // Filter out entries with 0 points
  return Object.entries(settlementResult.value.rankings)
    .filter(([groupId]) => (settlementResult.value!.scores![groupId] || 0) > 0)
    .map(([groupId, rank]) => {
      // Validate groupId format
      if (groupId && groupId.includes('@')) {
        console.error('[settlementReportRankingsData] Invalid groupId detected (email):', groupId)
      }

      const memberEmails = groupMembers[groupId] || []

      if (memberEmails.length === 0) {
        console.warn('[settlementReportRankingsData] No members found for groupId:', groupId)
      }

      const memberCount = memberEmails.length || 1
      const groupTotalPoints = settlementResult.value!.scores![groupId] || 0

      return {
        groupId,
        groupName: groupNames[groupId] || groupId,
        status: 'active',
        memberCount,
        isCurrentGroup: false,
        members: memberEmails.map(email => {
          const contributionPercent = 100 / memberCount
          const memberPoints = groupTotalPoints / memberCount
          // Convert contribution percentage to weight units for chart rendering
          const finalWeight = (contributionPercent / 100) * MAX_CONTRIBUTION_WEIGHT * WEIGHT_MULTIPLIER

          return {
            email,
            displayName: email,
            contribution: contributionPercent,
            points: memberPoints,
            finalWeight: finalWeight
          }
        }),
        rank
      }
    })
    .sort((a, b) => a.rank - b.rank)
})

// Settlement comment rankings data for AllGroupsChart
const settlementCommentRankingsData = computed((): GroupData[] => {
  if (!settlementResult.value?.commentRankings || !settlementResult.value?.commentScores) return []

  const authorNames = settlementResult.value?.authorNames || {}

  return Object.entries(settlementResult.value.commentRankings)
    .filter(([commentId]) => (settlementResult.value!.commentScores![commentId] || 0) > 0)
    .map(([commentId, rank]) => {
      const commentPoints = settlementResult.value!.commentScores![commentId] || 0

      return {
        groupId: commentId,
        groupName: authorNames[commentId] || commentId,
        status: 'active',
        memberCount: 1,
        isCurrentGroup: false,
        members: [{
          email: commentId,
          displayName: authorNames[commentId] || commentId,
          contribution: 100,
          points: commentPoints,
          finalWeight: 100
        }],
        rank
      }
    })
    .sort((a, b) => a.rank - b.rank)
})

// Settlement group members for OurGroupChart
const settlementGroupMembers = computed((): Member[] => {
  if (!selectedSettlementGroup.value || settlementGroupTransactions.value.length === 0) return []

  return settlementGroupTransactions.value.map(tx => {
    const metadata = safeParseMetadata(tx.metadata)
    return {
      email: tx.userEmail,
      displayName: tx.displayName || tx.userEmail,
      points: tx.amount,
      contribution: (metadata?.participationPercentage || 0) * 100,
      avatarSeed: tx.avatarSeed,
      avatarStyle: tx.avatarStyle,
      avatarOptions: tx.avatarOptions
    }
  })
})

// ========== Methods ==========

// Close drawer
function closeDrawer(): void {
  console.log('[SettlementProgressDrawer] closeDrawer() called, projectId:', props.projectId)
  // Emit drawer-closed event with projectId so parent can refresh stage list
  emit('drawer-closed', { projectId: props.projectId })
  emit('update:modelValue', false)
  // Reset state after animation completes
  setTimeout(() => {
    settlementStatus.value = 'idle'
    settlementResult.value = null
    settlementValidation.value = null
    selectedSettlementGroup.value = null
    settlementGroupTransactions.value = []
  }, DRAWER_CLOSE_ANIMATION_DURATION)
}

// Build groupNames mapping from transaction metadata
async function buildGroupNamesFromTransactions(): Promise<void> {
  console.log('[buildGroupNamesFromTransactions] Starting...')
  console.log('[buildGroupNamesFromTransactions] settlementResult.settlementId:', settlementResult.value?.settlementId)
  console.log('[buildGroupNamesFromTransactions] settlementProgress.projectId:', settlementProgress.projectId)

  if (!settlementResult.value?.settlementId || !settlementProgress.projectId) {
    console.warn('[buildGroupNamesFromTransactions] Missing required data, aborting')
    return
  }

  try {
    // Fetch all transactions for this settlement
    const httpResponse = await rpcClient.wallets.transactions.$post({
      json: {
        projectId: settlementProgress.projectId,
        settlementId: settlementResult.value.settlementId
      }
    })
    const response = await httpResponse.json()

    console.log('[buildGroupNamesFromTransactions] API response:', response.success)
    console.log('[buildGroupNamesFromTransactions] Transactions count:', response.data?.transactions?.length)

    if (response.success && response.data?.transactions) {
      const groupNames: Record<string, string> = {}

      response.data.transactions.forEach((tx: Transaction) => {
        const metadata = safeParseMetadata(tx.metadata)

        if (metadata?.groupId && metadata?.groupName) {
          groupNames[metadata.groupId] = metadata.groupName
          console.log(`[buildGroupNamesFromTransactions] Extracted: ${metadata.groupId} -> ${metadata.groupName}`)
        }
      })

      settlementGroupNamesFromTransactions.value = groupNames
      console.log('✅ Built groupNames from transactions:', groupNames)
    } else {
      console.warn('[buildGroupNamesFromTransactions] No transactions in response')
    }
  } catch (err) {
    console.error('Failed to build groupNames from transactions:', err)
  }
}

// Get active step index
function getActiveStep(step: string): number {
  const stepMap: Record<string, number> = {
    'validating': 0,
    'initializing': 1,
    'lock_acquired': 2,
    'votes_calculated': 3,
    'distributing_report_rewards': 4,
    'distributing_comment_rewards': 5,
    'completed': 6
  }
  return stepMap[step] || 0
}

// Format rankings for display
function formatRankingsForDisplay(
  rankings: Record<string, number> | undefined,
  scores: Record<string, number> | undefined,
  isCommentRanking = false
): RankingDisplay[] {
  if (!rankings || !scores) return []

  const names = isCommentRanking
    ? (settlementResult.value?.authorNames || {})
    : {
        ...(settlementResult.value?.groupNames || {}),
        ...settlementGroupNamesFromTransactions.value
      }

  return Object.entries(rankings)
    .filter(([id]) => (scores[id] || 0) > 0)
    .map(([id, rank]) => {
      const displayName = names[id] || id

      return {
        rank,
        groupId: id,
        groupName: displayName,
        score: scores[id] || 0,
        weightedScore: settlementResult.value?.weightedScores?.[id]
      }
    })
    .sort((a, b) => a.rank - b.rank)
}

// Handle group click
async function handleSettlementGroupClick(groupData: GroupClickData): Promise<void> {
  console.log('=== Settlement Group Click Debug ===')
  console.log('Full groupData:', JSON.stringify(groupData, null, 2))

  // Validate that this is a report ranking click
  if (groupData.groupId && groupData.groupId.includes('@')) {
    ElMessage.warning('這是評論排名，無法查看組內分配。請點擊上方的「成果獎勵分配」圖表')
    return
  }

  if (!settlementProgress.projectId || !settlementProgress.stageId) {
    ElMessage.error('無法載入交易記錄：專案或階段資料遺失')
    return
  }

  selectedSettlementGroup.value = {
    groupId: groupData.groupId,
    groupName: groupData.groupName,
    rank: groupData.rank
  }
  loadingSettlementTransactions.value = true

  try {
    const queryParams = {
      projectId: settlementProgress.projectId,
      stageId: settlementProgress.stageId,
      settlementId: settlementResult.value?.settlementId,
      groupId: groupData.groupId
    }

    const httpResponse = await rpcClient.wallets.transactions.$post({
      json: queryParams
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      if (!response.data.transactions || response.data.transactions.length === 0) {
        ElMessage.info('此組尚無結算交易記錄')
        settlementGroupTransactions.value = []
      } else {
        settlementGroupTransactions.value = response.data.transactions.map((tx: Transaction) => {
          const metadata = safeParseMetadata(tx.metadata)
          return {
            ...tx,
            displayName: tx.displayName || tx.userEmail,
            participationPercentage: metadata?.participationPercentage || 0
          }
        })

        // Extract correct groupName from transaction metadata
        if (response.data.transactions.length > 0) {
          const firstTx = response.data.transactions[0]
          const metadata = safeParseMetadata(firstTx.metadata)

          if (metadata?.groupName && metadata.groupName !== groupData.groupId) {
            selectedSettlementGroup.value = {
              ...selectedSettlementGroup.value!,
              groupName: metadata.groupName
            }
            console.log('✅ Updated group name from metadata:', metadata.groupName)
          }
        }

        console.log('✅ Loaded transactions:', settlementGroupTransactions.value.length)
      }
    } else {
      ElMessage.warning(`無法載入該組的交易記錄: ${response.error?.message || '未知錯誤'}`)
      settlementGroupTransactions.value = []
    }
  } catch (error: any) {
    console.error('❌ Error loading settlement transactions:', error)
    ElMessage.error(`載入交易記錄失敗: ${error.message || '請稍後再試'}`)
    settlementGroupTransactions.value = []
  } finally {
    loadingSettlementTransactions.value = false
  }
}

// Handle comment click
async function handleSettlementCommentClick(commentData: GroupClickData): Promise<void> {
  console.log('Comment author clicked:', commentData)
  ElMessage.info(`評論作者：${commentData.groupName}`)
}

// Format time
function formatTime(timestamp: string): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

// Build validation warning message
function buildValidationWarningMessage(validation: Validation): string {
  let html = '<div class="validation-warnings">'
  html += '<h4>以下條件未滿足：</h4><ul>'

  const checks = validation.checks

  // Check 1: All groups voted
  if (!checks.allGroupsVoted.passed) {
    const details = checks.allGroupsVoted.details
    html += `<li><strong>❌ 組內投票未完成</strong><br>`
    html += `&nbsp;&nbsp;• 總共 ${details.totalGroups} 個組別<br>`
    html += `&nbsp;&nbsp;• 完成全員投票：${details.groupsWithAllMembersVoted} 組<br>`

    if (details.missingGroups && details.missingGroups.length > 0) {
      html += `&nbsp;&nbsp;• <strong>未完成組別明細：</strong>`
      html += `<ul style="margin: 5px 0; padding-left: 20px;">`
      details.missingGroups.forEach((group: any) => {
        const percentage = group.totalMembers > 0
          ? Math.round((group.votedMembers / group.totalMembers) * 100)
          : 0
        html += `<li><strong>${group.groupName}</strong> `
        html += `${group.votedMembers}/${group.totalMembers} 人已投票 (${percentage}%)`

        if (group.reason === 'no_approved_proposal') {
          html += ` <span style="color: #f56c6c;">[無核准提案]</span>`
        } else if (group.reason === 'incomplete_votes') {
          html += ` <span style="color: #e6a23c;">[投票未完成]</span>`
        }
        html += `</li>`
      })
      html += `</ul>`
    }
    html += '</li>'
  }

  // Check 2: All proposals settled
  if (!checks.allProposalsApproved.passed) {
    const details = checks.allProposalsApproved.details
    html += `<li><strong>❌ 排名提案未全部結算</strong><br>`
    html += `&nbsp;&nbsp;• 總提案數：${details.totalProposals}<br>`
    html += `&nbsp;&nbsp;• 已結算：${details.settledProposals || 0}<br>`
    if (details.agreedProposals !== undefined && details.agreedProposals > 0) {
      html += `&nbsp;&nbsp;&nbsp;&nbsp;- 通過：${details.agreedProposals}<br>`
    }
    if (details.disagreedProposals !== undefined && details.disagreedProposals > 0) {
      html += `&nbsp;&nbsp;&nbsp;&nbsp;- 未通過：${details.disagreedProposals}<br>`
    }
    if (details.tieProposals !== undefined && details.tieProposals > 0) {
      html += `&nbsp;&nbsp;&nbsp;&nbsp;- 平手：${details.tieProposals}<br>`
      // Show breakdown by reset status
      if (details.tieProposalsCanReset !== undefined && details.tieProposalsCanReset > 0) {
        html += `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #e6a23c;">（${details.tieProposalsCanReset} 組可重置投票）</span><br>`
      }
      if (details.tieProposalsUsedReset !== undefined && details.tieProposalsUsedReset > 0) {
        html += `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #909399;">（${details.tieProposalsUsedReset} 組已用完重置機會）</span><br>`
      }
    }
    if (details.pendingProposals > 0) {
      const realPendingVotes = Math.max(0, details.pendingProposals - (details.agreedProposals || 0) - (details.tieProposals || 0) - (details.disagreedProposals || 0))
      html += `&nbsp;&nbsp;• 未結算提案：${details.pendingProposals}<br>`
      if (realPendingVotes > 0) {
        html += `&nbsp;&nbsp;&nbsp;&nbsp;（包含真正待投票：${realPendingVotes}）<br>`
      }
    }
    if (details.resetProposals !== undefined && details.resetProposals > 0) {
      html += `&nbsp;&nbsp;• 已重置：${details.resetProposals}<br>`
    }
    if (details.withdrawnProposals !== undefined && details.withdrawnProposals > 0) {
      html += `&nbsp;&nbsp;• 已撤回：${details.withdrawnProposals}<br>`
    }

    if (details.unsettledProposals && details.unsettledProposals.length > 0) {
      html += `&nbsp;&nbsp;• <strong>未結算組別明細：</strong>`
      html += `<ul style="margin: 5px 0; padding-left: 20px;">`
      details.unsettledProposals.forEach((proposal: any) => {
        html += `<li><strong>${proposal.groupName}</strong> `

        if (proposal.status === 'settled') {
          // Settled proposals (shouldn't appear in unsettled list, but handle defensively)
          if (proposal.votingResult === 'agree') {
            html += `<span style="color: #67c23a;">[已結算 - 通過]</span>`
          } else if (proposal.votingResult === 'disagree') {
            html += `<span style="color: #f56c6c;">[已結算 - 未通過]</span>`
          } else if (proposal.votingResult === 'tie') {
            html += `<span style="color: #e6a23c;">[已結算 - 平手]</span>`
          } else {
            html += `<span style="color: #67c23a;">[已結算]</span>`
          }
        } else if (proposal.status === 'pending') {
          // 根据 votingResult 显示不同的标签
          if (proposal.votingResult === 'tie') {
            // Check reset status to show appropriate message
            if (proposal.resetCount !== undefined && proposal.resetCount > 0) {
              html += `<span style="color: #909399;">[平手，已用完重置機會]</span>`
            } else {
              html += `<span style="color: #e6a23c;">[平手，可重置投票]</span>`
            }
          } else if (proposal.votingResult === 'agree') {
            html += `<span style="color: #67c23a;">[已同意，待結算]</span>`
          } else if (proposal.votingResult === 'disagree') {
            html += `<span style="color: #f56c6c;">[已否決]</span>`
          } else {  // no_votes 或 undefined
            html += `<span style="color: #e6a23c;">[待投票]</span>`
          }
        } else if (proposal.status === 'reset') {
          html += `<span style="color: #409EFF;">[已重置，需重新投票]</span>`
        } else if (proposal.status === 'withdrawn') {
          html += `<span style="color: #909399;">[已撤回]</span>`
        } else {
          html += `<span style="color: #909399;">[${proposal.status}]</span>`
        }
        html += `</li>`
      })
      html += `</ul>`
    }

    html += '</li>'
  }

  // Check 3: Comment rankings
  if (!checks.hasCommentRankings.passed) {
    const details = checks.hasCommentRankings.details
    html += `<li><strong><i class="fas fa-exclamation-triangle"></i> 無評論排名資料</strong><br>`
    html += `&nbsp;&nbsp;• 學生評論排名：${details.studentCommentRankings}<br>`
    html += `&nbsp;&nbsp;• 教師評論排名：${details.teacherCommentRankings}<br>`
    html += '&nbsp;&nbsp;• 若無評論排名，評論獎金池將不會分配<br>'
    html += '</li>'
  }

  // Check 4: Teacher submission rankings
  if (!checks.hasTeacherSubmissionRankings.passed) {
    const details = checks.hasTeacherSubmissionRankings.details
    html += `<li><strong><i class="fas fa-exclamation-triangle"></i> 無教師報告排名</strong><br>`
    html += `&nbsp;&nbsp;• 已排名教師數：${details.teachersWhoRanked}/${details.totalTeachers}<br>`
    html += '&nbsp;&nbsp;• 若無教師排名，報告獎金將僅依學生排名分配<br>'
    html += '</li>'
  }

  // Check 5: Teacher comment rankings
  if (!checks.hasTeacherCommentRankings.passed) {
    const details = checks.hasTeacherCommentRankings.details
    html += `<li><strong><i class="fas fa-exclamation-triangle"></i> 無教師評論排名</strong><br>`
    html += `&nbsp;&nbsp;• 已排名教師數：${details.teachersWhoRanked}/${details.totalTeachers}<br>`
    html += '&nbsp;&nbsp;• 若無教師排名，評論獎金將僅依學生排名分配<br>'
    html += '</li>'
  }

  html += '</ul>'
  html += '<p style="margin-top: 16px; color: #e6a23c;"><strong><i class="fas fa-exclamation-triangle"></i> 確定要在這些條件下進行結算嗎？</strong></p>'
  html += '<p style="font-size: 12px; color: #909399;">此操作將記錄在系統日誌中</p>'
  html += '</div>'

  return html
}

// Settle stage
async function settleStage(stage: Stage, forceSettle = false): Promise<void> {
  try {
    const projectId = stage.projectId || props.projectId

    if (!projectId) {
      ElMessage.error('無法取得專案 ID，請重新載入頁面')
      return
    }

    // Initialize settlement progress
    settlementProgress.projectId = projectId
    settlementProgress.stageId = stage.stageId
    settlementProgress.stageName = stage.stageName
    settlementProgress.reportRewardPool = (stage as any).reportRewardPool || 0
    settlementProgress.commentRewardPool = (stage as any).commentRewardPool || 0
    settlementProgress.step = 'validating'
    settlementProgress.progress = 0
    settlementProgress.message = '檢查資料完整性中...'
    settlementProgress.details = null
    settlementStatus.value = 'validating'
    settlementResult.value = null
    settlementValidation.value = null

    // Run validation if not forced
    if (!forceSettle) {
      const validationHttpResponse = await (rpcClient.scoring as any)['validate-settlement'].$post({
        json: {
          projectId: projectId,
          stageId: stage.stageId
        }
      })
      const validationResponse = await validationHttpResponse.json()

      if (!validationResponse.success) {
        settlementStatus.value = 'idle'
        ElMessage.error(`驗證失敗: ${validationResponse.error?.message || '未知錯誤'}`)
        return
      }

      const validation = validationResponse.data
      settlementValidation.value = validation

      if (!validation.valid) {
        settlementProgress.message = '資料完整性檢查未通過，請確認是否繼續'
        settlementProgress.progress = 100
        return
      }
    }

    // Proceed with settlement
    settlementProgress.step = 'initializing'
    settlementProgress.progress = 0
    settlementProgress.message = '準備結算...'
    settlementStatus.value = 'settling'
    settlementValidation.value = null

    const httpResponse = await rpcClient.scoring.settle.$post({
      json: {
        projectId: projectId,
        stageId: stage.stageId,
        forceSettle: forceSettle
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success(`階段「${stage.stageName}」結算完成！獎金已按照系統規則自動分配。`)
    } else {
      settlementStatus.value = 'idle'
      ElMessage.error(`結算失敗: ${response.error?.message || '未知錯誤'}`)
      // Emit error event to parent
      emit('settlement-error', {
        stageId: stage.stageId,
        error: response.error?.message || '未知錯誤'
      })
    }
  } catch (error: any) {
    console.error('Error settling stage:', error)
    settlementStatus.value = 'idle'
    ElMessage.error('結算階段失敗，請重試')
    // Emit error event to parent
    emit('settlement-error', {
      stageId: stage.stageId,
      error: error.message || '未知錯誤'
    })
  }
}

// Force settle
async function forceSettle(): Promise<void> {
  if (!props.stage) {
    ElMessage.error('無法找到階段資料')
    return
  }
  await settleStage(props.stage, true)
}

// Handle settlement progress WebSocket event
async function handleSettlementProgress(event: CustomEvent): Promise<void> {
  try {
    // Early exit if drawer is closed - prevents unnecessary processing
    if (!props.modelValue) return

    const validationResult = SettlementProgressDataSchema.safeParse(event.detail)

    if (!validationResult.success) {
      console.error('Invalid settlement progress data:', validationResult.error)
      ElMessage.error('接收到無效的結算進度資料')
      return
    }

    const data = validationResult.data

    // Only update if stageId matches
    if (data.stageId !== settlementProgress.stageId) {
      return
    }

    // Update progress state
    settlementProgress.step = data.step
    settlementProgress.progress = data.progress
    settlementProgress.message = data.message
    settlementProgress.details = data.details ?? null

    // Handle completion
    if (data.step === 'completed') {
      settlementStatus.value = 'completed'
      settlementResult.value = (data.details ?? null) as SettlementDetails | null

      // Build groupNames from transactions
      try {
        await buildGroupNamesFromTransactions()
      } catch (error) {
        console.error('Failed to build group names:', error)
        ElMessage.warning('部分組別名稱無法載入，將顯示 ID')
      }

      // Emit completion event
      if (data.details) {
        emit('settlement-complete', {
          stageId: data.stageId,
          settlementId: data.details.settlementId,
          result: data.details
        })
      }
    }
  } catch (error) {
    console.error('Error handling settlement progress:', error)
    ElMessage.error('處理結算進度時發生錯誤')
  }
}

// ========== Watchers ==========

// Watch for drawer close (triggered by X button or clicking outside)
watch(() => props.modelValue, (newValue, oldValue) => {
  console.log('[SettlementProgressDrawer] modelValue changed:', { oldValue, newValue, projectId: props.projectId })
  // When drawer closes (true -> false), emit event to refresh stage list
  if (oldValue === true && newValue === false) {
    console.log('[SettlementProgressDrawer] Drawer closing, emitting drawer-closed event')
    emit('drawer-closed', { projectId: props.projectId })
  }
})

// Unified watcher for stage changes: handles both state reset and settlement trigger
watch(() => props.stage, (newStage, oldStage) => {
  const newStageId = newStage?.stageId
  const oldStageId = oldStage?.stageId

  // Stage ID changed - handle state reset and re-initialization
  if (newStageId && newStageId !== oldStageId) {
    // Only reset if not currently processing THIS specific stage
    // This prevents race condition where we reset state that's actively being populated
    if (settlementProgress.stageId !== newStageId) {
      settlementStatus.value = 'idle'
      settlementResult.value = null
      settlementValidation.value = null
      selectedSettlementGroup.value = null
      settlementGroupTransactions.value = []
      settlementGroupNamesFromTransactions.value = {}
    }

    // Prevent re-triggering if already processing
    if (settlementStatus.value === 'settling' || settlementStatus.value === 'validating') {
      return
    }

    // Trigger settlement if drawer is open
    if (newStage && props.modelValue) {
      settleStage(newStage, false)
    }
  }
}, { immediate: true })

// ========== Event Listeners ==========

// Register WebSocket event listener
useEventListener(window, 'settlement-progress', handleSettlementProgress as unknown as EventListener)
</script>

<style scoped>
/* Settlement Progress Drawer Styles */
.settlement-drawer-content {
  padding: 20px;
}

.stage-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.stage-info h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.settlement-progress-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.progress-section {
  margin: 20px 0;
}

.progress-message {
  margin-top: 12px;
  font-size: 14px;
  color: #606266;
  text-align: center;
}

.progress-details {
  margin-top: 20px;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e4e7ed;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item .label {
  font-weight: 500;
  color: #606266;
}

.detail-item .value {
  color: #303133;
  font-weight: 600;
}

.settlement-result-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.result-summary {
  display: flex;
  gap: 40px;
  justify-content: center;
  margin-top: 20px;
}

.weighted-score {
  font-family: 'Courier New', monospace;
  color: #909399;
}

/* 按鈕區域樣式 - 使用統一的 .drawer-actions (來自 drawer-unified.scss) */

.validation-warnings {
  text-align: left;
  max-height: 400px;
  overflow-y: auto;
}

.validation-warnings h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #303133;
}

.validation-warnings ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.validation-warnings li {
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  line-height: 1.6;
}

.validation-warnings strong {
  display: block;
  margin-bottom: 8px;
}

.validation-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}

.chart-hint {
  text-align: center;
  color: #909399;
  font-size: 14px;
  margin-top: 12px;
}

.loading-section {
  text-align: center;
  padding: 40px;
  color: #909399;
}

.no-transactions {
  text-align: center;
  padding: 40px;
  color: #909399;
}

.point-distribution-section {
  margin: 20px 0;
}

.selected-group-detail {
  margin-top: 30px;
  padding: 20px;
  background-color: #f9f9f9;
  border-radius: 8px;
}
</style>
