<template>
  <el-drawer
    v-model="isDrawerVisible"
    direction="btt"
    size="100%"
    :close-on-click-modal="true"
    :show-close="true"
    :before-close="(done) => handleClose(done as (() => void) | undefined)"
    class="teacher-vote-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-chalkboard-teacher"></i>
          教師綜合投票
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div v-loading="loading" class="drawer-body" element-loading-text="載入投票資料中...">
      <!-- Drawer Alert Zone -->
      <DrawerAlertZone />

      <!-- Segmented Control 切換 -->
      <div class="vote-segmented-wrapper">
        <el-segmented
          v-model="activeTab"
          :options="tabOptions"
          size="large"
        />
      </div>

      <!-- 成果排名 Content -->
      <div v-if="activeTab === 'submissions'">
          <!-- 成果版本時間軸 -->
          <VersionTimeline
            v-if="submissionVersions.length > 0"
            :versions="submissionVersions"
            :current-version-id="selectedSubmissionVersionId"
            :format-title-fn="formatVersionTitle"
            :format-description-fn="formatVersionDescription"
            @version-change="handleSubmissionVersionChange"
          />

          <!-- 單列顯示（最新版本或編輯模式） -->
          <div v-if="!isViewingOldSubmissionVersion" class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-trophy"></i>
              各組成果排名
            </h3>

            <!-- 使用 DraggableRankingList 組件 -->
            <DraggableRankingList
              :items="rankedSubmissions"
              item-key="submissionId"
              item-label="groupName"
              :disabled="submittingSubmissions || isSubmissionPreviewMode"
              :show-actions="true"
              :enable-grouping="true"
              @update:items="updateSubmissionRankings"
            >
              <template #default="{ item }: { item: any }">
                <div class="group-info" :class="{ 'not-in-version': isSubmissionNotInLatestVersion(item) }">
                  <div class="group-header">
                    <div class="group-name">{{ item.groupName }}</div>
                    <div v-if="item.submitTime" class="submission-time">
                      {{ formatSubmissionTime(item.submitTime) }}
                    </div>
                  </div>
                  <div v-if="isSubmissionNotInLatestVersion(item)" class="not-in-version-note">
                    <i class="fas fa-circle-exclamation"></i> 未列於此次排名中
                  </div>
                  <div class="group-members">{{ formatGroupMembers(item) }}</div>
                  <div v-if="item.reportContent" class="submission-preview">
                    {{ truncateContent(item.reportContent) }}
                  </div>
                </div>
              </template>
            </DraggableRankingList>

            <EmptyState
              v-if="rankedSubmissions.length === 0"
              :icons="['fa-clipboard-list']"
              title="目前沒有可排名的成果提交"
              parent-icon="fa-list-ol"
              :compact="true"
              :enable-animation="false"
            />

            <!-- 點數分配視覺化 -->
            <div v-if="rankedSubmissions.length > 0" class="point-distribution-section">
              <AllGroupsChart
                :selected-members="[]"
                :simulated-rank="1"
                :simulated-group-count="rankedSubmissions.length"
                :report-reward="submissionReward"
                :all-groups="rankedSubmissionsAsGroupsWithPoints as any"
                :current-group-id="null"
                :total-project-groups="rankedSubmissions.length"
              />
              <div class="chart-hint">
                <i class="fas fa-lightbulb"></i> 教師成果評分結果：排名前幾的組別將獲得以上點數
              </div>
            </div>
          </div>

          <!-- 雙列對比顯示（歷史版本對比） -->
          <div v-else class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-trophy"></i>
              成果排名版本對比
            </h3>

            <RankingComparison
              left-title="最新版本"
              right-title="歷史版本"
              :left-items="latestSubmissionRankings"
              :right-items="selectedSubmissionVersionRankings"
              item-key="submissionId"
              item-label="groupName"
            />
          </div>
      </div>

      <!-- 評論排名 Content -->
      <div v-else-if="activeTab === 'comments'">
          <!-- 評論版本時間軸 -->
          <VersionTimeline
            v-if="commentVersions.length > 0"
            :versions="commentVersions"
            :current-version-id="selectedCommentVersionId"
            :format-title-fn="formatVersionTitle"
            :format-description-fn="formatVersionDescription"
            @version-change="handleCommentVersionChange"
          />

          <!-- 單列顯示（最新版本或編輯模式） -->
          <div v-if="!isViewingOldCommentVersion" class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-comments"></i>
              評論品質排名
            </h3>

            <!-- 評論選擇和排序 -->
            <CommentRankingTransfer
              :items="allCommentsForRanking"
              :max-selections="dynamicMaxCommentSelections"
              :disabled="isCommentPreviewMode"
              item-key="commentId"
              unique-by-field="authorEmail"
              :display-fields="{
                content: 'content',
                author: 'authorDisplayName',
                timestamp: 'createdTime'
              }"
              :author-display-fn="(item: any) => `${item.authorDisplayName}(${item.authorEmail})`"
              :initial-selected="rankedComments"
              @update:selected="rankedComments = $event as any"
              @duplicate-detected="$message.warning('同作者的評論只能選一個送入排序')"
              @max-limit-reached="$message.warning(`最多只能選擇 ${dynamicMaxCommentSelections} 個評論`)"
            />

            <!-- 點數分配視覺化 -->
            <div v-if="rankedComments.length > 0" class="point-distribution-section">
              <AllGroupsChart
                :selected-members="teacherSelectedAuthorMembers"
                :simulated-rank="1"
                :simulated-group-count="rankedComments.length"
                :report-reward="commentReward"
                :all-groups="rankedCommentsAsGroups as any"
                :current-group-id="null"
                :total-project-groups="rankedComments.length"
              />
              <div class="chart-hint">
                <i class="fas fa-lightbulb"></i> 教師評分結果：評論作者將獲得以上點數
              </div>
            </div>
          </div>

          <!-- 雙列對比顯示（歷史版本對比） -->
          <div v-else class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-comments"></i>
              評論排名版本對比
            </h3>

            <RankingComparison
              left-title="最新版本"
              right-title="歷史版本"
              :left-items="latestCommentRankings"
              :right-items="selectedCommentVersionRankings"
              item-key="commentId"
              :item-display-fn="(item: any) => `${item.authorDisplayName}(${item.authorEmail})`"
            />
          </div>
      </div>

      <!-- 底部操作按鈕 -->
      <div class="drawer-actions">
        <!-- 成果排名提交按鈕 -->
        <el-button
          v-if="activeTab === 'submissions' && !isViewingOldSubmissionVersion && rankedSubmissions.length > 0"
          type="primary"
          size="large"
          :loading="submittingSubmissions"
          :disabled="loading || isSubmissionPreviewMode"
          @click="submitSubmissionRankings"
        >
          <i class="fas fa-trophy"></i>
          提交成果排名
        </el-button>

        <!-- 評論排名提交按鈕 -->
        <el-button
          v-if="activeTab === 'comments' && !isViewingOldCommentVersion && rankedComments.length > 0"
          type="primary"
          size="large"
          :loading="submittingComments"
          :disabled="loading || isCommentPreviewMode"
          @click="submitCommentRankings"
        >
          <i class="fas fa-comments"></i>
          提交評論排名
        </el-button>

        <!-- AI 輔助建議按鈕 -->
        <el-button
          v-if="!isViewingOldSubmissionVersion && !isViewingOldCommentVersion && (submissionItemsForAI.length > 0 || commentItemsForAI.length > 0) && !isPreviewMode"
          type="info"
          size="large"
          @click="showAIDrawer = true"
        >
          <i class="fas fa-robot"></i>
          AI 輔助建議
        </el-button>

        <!-- 離開檢視模式按鈕（成果排名） -->
        <el-button
          v-if="activeTab === 'submissions' && (isSubmissionPreviewMode || isViewingOldSubmissionVersion)"
          type="warning"
          size="large"
          @click="exitSubmissionPreviewMode"
        >
          <i class="fas fa-edit"></i>
          離開檢視模式
        </el-button>

        <!-- 離開檢視模式按鈕（評論排名） -->
        <el-button
          v-if="activeTab === 'comments' && (isCommentPreviewMode || isViewingOldCommentVersion)"
          type="warning"
          size="large"
          @click="exitCommentPreviewMode"
        >
          <i class="fas fa-edit"></i>
          離開檢視模式
        </el-button>

        <!-- 關閉按鈕 -->
        <el-button size="large" @click="() => handleClose()">
          <i class="fas fa-times"></i> 關閉
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- AI 輔助建議 Drawer -->
  <AIRankingSuggestionDrawer
    v-model:visible="showAIDrawer"
    :project-id="projectId"
    :stage-id="stageId"
    :submission-items="submissionItemsForAI"
    :comment-items="commentItemsForAI"
    :initial-mode="currentAIRankingType"
    :max-comment-selections="dynamicMaxCommentSelections"
    @apply-ranking="handleApplyAIRanking"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/shared/EmptyState.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import CommentRankingTransfer from './common/CommentRankingTransfer.vue'
import VersionTimeline from './common/VersionTimeline.vue'
import RankingComparison from './common/RankingComparison.vue'
import DraggableRankingList from './common/DraggableRankingList.vue'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import AIRankingSuggestionDrawer from './common/AIRankingSuggestionDrawer.vue'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'
import { useAuth } from '@/composables/useAuth'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useStageConsensusAlert } from '@/composables/useStageConsensusAlert'
import { usePointCalculation } from '@/composables/usePointCalculation'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// Drawer Alerts
const { addAlert, clearAlerts } = useDrawerAlerts()

// 組內共識未完成提醒（成果排名/投票 drawer）
const { checkPendingConsensus } = useStageConsensusAlert()

// Point Calculation
const { calculateRankWeights } = usePointCalculation()

// ========== Type Definitions ==========

interface Submission {
  submissionId: string
  groupId: string
  groupName: string
  memberNames: string[]
  reportContent: string
  submitTime: string | number
  status: string
}

interface Comment {
  commentId: string
  content: string
  authorDisplayName: string
  authorEmail: string
  createdTime: string
  mentionedGroups?: string[]
}

interface Version {
  versionId: string
  createdTime: string
  teacherDisplayName?: string
  teacherEmail?: string
  rankings: Ranking[]
}

interface Ranking {
  type: 'submission' | 'comment'
  targetId: string
  groupId?: string
  authorEmail?: string
  rank: number
}

interface Group {
  groupId: string
  groupName?: string
  name?: string
}

interface Member {
  email: string
  displayName: string
  contribution: number
}

interface GroupData {
  groupId: string
  groupName: string
  status: string
  memberCount: number
  members: Array<{
    email: string
    displayName: string
    points: number
    contribution: number
    finalWeight: number
  }>
  rank?: number
}

interface SubmissionWithRanking extends Submission {
  rank?: number
}

interface CommentWithRanking extends Comment {
  rank?: number
}

// ========== Props & Emits ==========

export interface Props {
  visible: boolean
  projectId: string
  stageId: string
  maxCommentSelections: number  // 必需 - 評論選擇數量上限（從專案配置獲取）
  commentRewardPercentile?: number  // 評論獎勵百分比模式（0 = 固定排名模式）
  projectTitle?: string
  stageTitle?: string
  stageGroups?: Group[]
  commentReward?: number  // Comment reward points (default: 500)
  submissionReward?: number  // Submission reward points (default: 1000)
  currentUserGroupId?: string | null  // Current user's group ID
  // 優化：從父組件傳入已快取的數據，避免冗餘 API 調用
  cachedProjectGroups?: Group[]  // 專案組別（替代 projects.core API）
  cachedSubmissions?: any[]      // 已批准的成果（替代 projects.content API）
  cachedComments?: any[]         // 階段評論（替代 comments.stage API）
}

const props = withDefaults(defineProps<Props>(), {
  commentRewardPercentile: 0,
  projectTitle: '',
  stageTitle: '',
  stageGroups: () => [],
  commentReward: 500,
  submissionReward: 1000,
  currentUserGroupId: null,
  cachedProjectGroups: () => [],
  cachedSubmissions: () => [],
  cachedComments: () => []
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'teacher-ranking-submitted', data: { success: boolean; type: string; data: any; needRefresh: boolean }): void
}>()

// Vue 3 Best Practice: Use unified useAuth() composable
// (call kept for its query-subscription side effect)
useAuth()

// ========== Reactive State ==========

const loading: Ref<boolean> = ref(false)
const activeTab: Ref<string> = ref('submissions')

// Tab options for segmented control
const tabOptions = [
  { label: '🏆 成果排名', value: 'submissions' },
  { label: '💬 評論排名', value: 'comments' }
]

// 成果排名數據
const rankedSubmissions: Ref<Submission[]> = ref([])
const submissionVersions: Ref<Version[]> = ref([])
const selectedSubmissionVersionId: Ref<string> = ref('')
const latestSubmissionRankings: Ref<SubmissionWithRanking[]> = ref([])
const submittingSubmissions: Ref<boolean> = ref(false)
// 預覽模式狀態（追踪是否正在查看歷史版本）
const loadedSubmissionVersionId: Ref<string | null> = ref(null)

// 評論排名數據
const rankedComments: Ref<Comment[]> = ref([])
const allCommentsForRanking: Ref<Comment[]> = ref([])
const commentVersions: Ref<Version[]> = ref([])
const selectedCommentVersionId: Ref<string> = ref('')
const latestCommentRankings: Ref<CommentWithRanking[]> = ref([])
const submittingComments: Ref<boolean> = ref(false)
// 預覽模式狀態（追踪是否正在查看歷史版本）
const loadedCommentVersionId: Ref<string | null> = ref(null)

// 其他數據
const projectGroups: Ref<Group[]> = ref([])

// AI 輔助建議
const showAIDrawer: Ref<boolean> = ref(false)

// ========== Computed Properties ==========

const isDrawerVisible = computed({
  get(): boolean {
    return props.visible
  },
  set(value: boolean): void {
    emit('update:visible', value)
  }
})

// 是否正在查看成果排名的歷史版本
const isViewingOldSubmissionVersion = computed((): boolean => {
  if (submissionVersions.value.length === 0) return false
  if (!selectedSubmissionVersionId.value) return false

  const latestVersion = submissionVersions.value[submissionVersions.value.length - 1]
  return selectedSubmissionVersionId.value !== latestVersion.versionId
})

// 是否正在查看評論排名的歷史版本
const isViewingOldCommentVersion = computed((): boolean => {
  if (commentVersions.value.length === 0) return false
  if (!selectedCommentVersionId.value) return false

  const latestVersion = commentVersions.value[commentVersions.value.length - 1]
  return selectedCommentVersionId.value !== latestVersion.versionId
})

// 成果排名預覽模式判斷
const isSubmissionPreviewMode = computed((): boolean => {
  return loadedSubmissionVersionId.value !== null
})

// 評論排名預覽模式判斷
const isCommentPreviewMode = computed((): boolean => {
  return loadedCommentVersionId.value !== null
})

// 綜合預覽模式判斷（任一 tab 在預覽模式）
const isPreviewMode = computed((): boolean => {
  return (activeTab.value === 'submissions' && isSubmissionPreviewMode.value) ||
         (activeTab.value === 'comments' && isCommentPreviewMode.value)
})

// 當前選中的成果排名版本
const selectedSubmissionVersionRankings = computed((): SubmissionWithRanking[] => {
  if (!selectedSubmissionVersionId.value || submissionVersions.value.length === 0) {
    return []
  }

  const version = submissionVersions.value.find(v => v.versionId === selectedSubmissionVersionId.value)
  if (!version || !version.rankings) return []

  // 將排名數據轉換為完整的submission對象
  return version.rankings.map(ranking => {
    // 從原始數據中查找對應的submission以獲取更多信息
    const submission = rankedSubmissions.value.find(s => s.submissionId === ranking.targetId)

    return {
      submissionId: ranking.targetId,
      groupId: ranking.groupId || '',
      groupName: (ranking as any).groupName || submission?.groupName || `組別 ${ranking.groupId?.slice(-4)}`,
      memberNames: (ranking as any).memberNames || submission?.memberNames || [],
      reportContent: submission?.reportContent || '',
      submitTime: submission?.submitTime || '',
      status: submission?.status || '',
      rank: ranking.rank
    }
  }).sort((a, b) => a.rank - b.rank)
})

// 當前選中的評論排名版本
const selectedCommentVersionRankings = computed((): CommentWithRanking[] => {
  if (!selectedCommentVersionId.value || commentVersions.value.length === 0) {
    return []
  }

  const version = commentVersions.value.find(v => v.versionId === selectedCommentVersionId.value)
  if (!version || !version.rankings) return []

  // 將排名數據轉換為完整的comment對象
  return version.rankings.map(ranking => {
    // 從原始數據中查找對應的comment以獲取更多信息
    const comment = allCommentsForRanking.value.find(c => c.commentId === ranking.targetId)

    return {
      commentId: ranking.targetId,
      authorEmail: ranking.authorEmail || '',
      authorDisplayName: comment?.authorDisplayName || ranking.authorEmail || '',
      content: comment?.content || '',
      createdTime: comment?.createdTime || '',
      mentionedGroups: comment?.mentionedGroups || [],
      rank: ranking.rank
    }
  }).sort((a, b) => a.rank - b.rank)
})

// AllGroupsChart 整合：教師選中評論的作者（視為單人組的成員）
const teacherSelectedAuthorMembers = computed((): Member[] => {
  if (rankedComments.value.length === 0) return []

  const firstComment = rankedComments.value[0]
  return [{
    email: firstComment.authorEmail,
    displayName: firstComment.authorDisplayName,
    contribution: 100  // 單人組固定 100%
  }]
})

// 將教師排名的評論轉換為「組」資料
const rankedCommentsAsGroups = computed((): GroupData[] => {
  return rankedComments.value.map(comment => ({
    groupId: comment.authorEmail,
    groupName: comment.authorDisplayName,
    status: 'active',
    memberCount: 1,
    members: [{
      email: comment.authorEmail,
      displayName: comment.authorDisplayName || comment.authorEmail,
      points: 0,
      contribution: 100,
      finalWeight: 0
    }]
  }))
})

// Vue 3 Best Practice: Use props instead of accessing parent component
const commentReward = computed((): number => {
  return props.commentReward || 500
})

// 將教師排名的成果轉換為「組」資料（Settlement Mode）
const rankedSubmissionsAsGroups = computed(() => {
  const globalMinRatio = 5  // 統一基準單位 (5%)

  return rankedSubmissions.value.map((submission: any, idx) => {
    // 同名群組共用同一 dense rank，預覽點數時亦反映平手
    const rank = typeof submission.rank === 'number' ? submission.rank : idx + 1
    const memberNames = submission.memberNames || []
    const memberCount = memberNames.length || 1

    // 計算均分（必須是5%的倍數）
    const basePercentage = Math.floor(100 / memberCount / 5) * 5
    const remainder = 100 - (basePercentage * memberCount)

    const members = memberNames.map((name: string, memberIdx: number) => {
      let contribution = basePercentage
      if (memberIdx < remainder / 5) contribution += 5

      // NOTE: rankWeights and finalWeight will be calculated in rankedSubmissionsAsGroupsWithPoints
      // Here we just prepare the base data structure
      return {
        email: `${submission.groupId}_member_${memberIdx}`,
        displayName: name,
        participationRatio: contribution,
        baseWeightUnits: contribution / globalMinRatio,
        rankMultiplier: 0,  // Will be set in rankedSubmissionsAsGroupsWithPoints
        finalWeight: 0,     // Will be calculated in rankedSubmissionsAsGroupsWithPoints
        points: 0           // Will be calculated in rankedSubmissionsAsGroupsWithPoints
      }
    })

    return {
      groupId: submission.groupId,
      groupName: submission.groupName,
      status: submission.status || 'active',
      memberCount: memberCount,
      members: members,
      rank: rank,
      isCurrentGroup: false  // No "current group" in teacher context
    }
  })
})

// 預計算點數分配（Settlement Mode）
const rankedSubmissionsAsGroupsWithPoints = computed(() => {
  const groups = rankedSubmissionsAsGroups.value as any[]
  if (groups.length === 0) return []

  const groupCount = groups.length
  const rankWeights = calculateRankWeights(groupCount) as Record<number, number>

  // Calculate total weight
  let totalWeight = 0
  groups.forEach((group: any) => {
    group.members.forEach((member: any) => {
      const finalWeight = member.baseWeightUnits * (rankWeights[group.rank] || 1)
      totalWeight += finalWeight
    })
  })

  if (totalWeight === 0 || !isFinite(totalWeight)) {
    console.error('[TeacherVoteModal] Invalid totalWeight:', totalWeight)
    return groups
  }

  const pointsPerWeight = submissionReward.value / totalWeight

  // Assign points and weights to all members
  return groups.map((group: any) => ({
    ...group,
    members: group.members.map((member: any) => ({
      ...member,
      rankMultiplier: rankWeights[group.rank] || 1,
      finalWeight: member.baseWeightUnits * (rankWeights[group.rank] || 1),
      points: (member.baseWeightUnits * (rankWeights[group.rank] || 1)) * pointsPerWeight
    }))
  }))
})

// Vue 3 Best Practice: Use props instead of accessing parent component
const submissionReward = computed((): number => {
  return props.submissionReward || 1000
})

// AI 輔助建議：當前排名類型（用於決定初始顯示模式）
const currentAIRankingType = computed((): 'submission' | 'comment' => {
  return activeTab.value === 'submissions' ? 'submission' : 'comment'
})

// AI 輔助建議：成果項目列表
const submissionItemsForAI = computed(() => {
  return rankedSubmissions.value.map(sub => ({
    id: sub.submissionId,
    content: sub.reportContent || '',
    label: sub.groupName,
    metadata: {
      groupName: sub.groupName,
      memberNames: sub.memberNames
    }
  }))
})

// AI 輔助建議：評論項目列表（包含完整 replies 和 reactions）
// 傳入所有有效評論（canBeVoted=true），讓 AI 自行挑選和排名
const commentItemsForAI = computed(() => {
  return allCommentsForRanking.value.map((comment: any) => ({
    id: comment.commentId,
    content: comment.content || '',
    label: `${comment.authorDisplayName}(${comment.authorEmail})`,
    metadata: {
      authorName: comment.authorDisplayName,
      // Full reply content array
      replies: comment.replies?.map((r: any) => r.content || r) || [],
      // Detailed reaction user lists
      reactions: {
        helpful: comment.reactions?.find((r: any) => r.type === 'helpful')?.users || [],
        disagreed: comment.reactions?.find((r: any) => r.type === 'disagreed')?.users || []
      }
    }
  }))
})

// ========== Methods ==========

/**
 * Handle AI ranking applied from AIRankingSuggestionDrawer
 * @param ranking - Array of IDs in ranked order
 * @param mode - 'submission' or 'comment' indicating which type of ranking
 */
function handleApplyAIRanking(ranking: string[], mode: 'submission' | 'comment'): void {
  if (mode === 'submission') {
    // Reorder rankedSubmissions based on AI ranking
    const newOrder: Submission[] = []
    const submissionMap = new Map(rankedSubmissions.value.map(s => [s.submissionId, s]))

    // Add submissions in AI ranking order
    for (const id of ranking) {
      const submission = submissionMap.get(id)
      if (submission) {
        newOrder.push(submission)
        submissionMap.delete(id)
      }
    }

    // Add any remaining submissions not in AI ranking
    for (const submission of submissionMap.values()) {
      newOrder.push(submission)
    }

    rankedSubmissions.value = newOrder
    ElMessage.success('已套用 AI 成果排名建議')
  } else {
    // For comments: AI returns selected + ranked comments from all valid comments
    // Replace rankedComments with AI's selection (AI picks top N from allCommentsForRanking)
    const newOrder: Comment[] = []
    const commentMap = new Map(allCommentsForRanking.value.map(c => [c.commentId, c]))

    // Add comments in AI ranking order (AI has already selected the best ones)
    for (const id of ranking) {
      const comment = commentMap.get(id)
      if (comment) {
        newOrder.push(comment)
      }
    }

    rankedComments.value = newOrder
    ElMessage.success(`已套用 AI 評論排名建議（已選出 ${newOrder.length} 個優秀評論）`)
  }
}

// ========== 版本歷史輔助函數 ==========

/**
 * 載入成果排名數據到編輯區
 * @param version - 要載入的版本數據
 */
function loadSubmissionRankingsToEditor(version: Version): void {
  // 建立 submissionId -> 原始 Submission 的映射（rankedSubmissions 為最新可投票名單）
  const submissionMap = new Map(rankedSubmissions.value.map(s => [s.submissionId, s]))
  const usedIds = new Set<string>()

  // 根據歷史排名重新排序，並補充完整資料
  const reorderedSubmissions: Submission[] = version.rankings
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(ranking => {
      usedIds.add(ranking.targetId)
      const original = submissionMap.get(ranking.targetId)
      if (original) {
        return { ...original }
      }
      // 如果找不到原始資料，使用 API 返回的基本資訊
      return {
        submissionId: ranking.targetId,
        groupId: ranking.groupId || '',
        groupName: (ranking as any).groupName || '',
        memberNames: (ranking as any).memberNames || [],
        reportContent: '',
        submitTime: '',
        status: ''
      }
    })
    .filter(s => s.submissionId)

  // 補上目前可投票（approved）但不在此版本排名中的成果（例如清空投票後新通過組內共識的組），
  // 排在末位，避免可投票名單在檢視/送出時遺漏新組別。
  const appendedSubmissions = rankedSubmissions.value.filter(
    s => s.submissionId && !usedIds.has(s.submissionId)
  )

  rankedSubmissions.value = [...reorderedSubmissions, ...appendedSubmissions]
}

/**
 * 載入評論排名數據到編輯區
 * @param version - 要載入的版本數據
 */
function loadCommentRankingsToEditor(version: Version): void {
  // 建立 commentId -> 原始 Comment 的映射
  const commentMap = new Map(allCommentsForRanking.value.map(c => [c.commentId, c]))

  // 根據歷史排名重新排序，並補充完整資料
  const reorderedComments: Comment[] = version.rankings
    .sort((a, b) => a.rank - b.rank)
    .map(ranking => {
      const original = commentMap.get(ranking.targetId)
      if (original) {
        return { ...original }
      }
      // 如果找不到原始資料，使用 API 返回的基本資訊
      return {
        commentId: ranking.targetId,
        authorEmail: ranking.authorEmail || '',
        authorDisplayName: ranking.authorEmail || '',
        content: '',
        createdTime: '',
        mentionedGroups: []
      }
    })
    .filter(c => c.commentId)

  rankedComments.value = reorderedComments
}

async function loadVersionHistory(autoEnterPreview: boolean = false): Promise<void> {
  try {
    // 載入成果排名版本歷史（完整數據）
    const httpResponse1 = await (rpcClient.api.rankings as any)['teacher-ranking-versions'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: 'submission'
      }
    })
    const submissionVersionsResponse = await httpResponse1.json()

    if (submissionVersionsResponse.success && submissionVersionsResponse.data) {
      // 後端依 createdTime DESC 回傳（最新在前），但前端一律以「陣列最後一筆」視為最新版本，
      // 因此這裡統一改為依 createdTime 升冪排序，確保 [length-1] 永遠是最新版本。
      submissionVersions.value = (submissionVersionsResponse.data.versions || [])
        .slice()
        .sort((a: Version, b: Version) => Number(a.createdTime) - Number(b.createdTime))

      if (submissionVersions.value.length > 0) {
        const latestVersion = submissionVersions.value[submissionVersions.value.length - 1]
        selectedSubmissionVersionId.value = latestVersion.versionId

        // 保存最新版本用於對比（從 API 返回的完整排名數據）
        latestSubmissionRankings.value = latestVersion.rankings.map(ranking => ({
          submissionId: ranking.targetId,
          groupId: ranking.groupId || '',
          groupName: (ranking as any).groupName || '',
          memberNames: (ranking as any).memberNames || [],
          reportContent: '',
          submitTime: '',
          status: '',
          rank: ranking.rank
        }))
      }
    }

    // 載入評論排名版本歷史（完整數據）
    const httpResponse2 = await (rpcClient.api.rankings as any)['teacher-ranking-versions'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: 'comment'
      }
    })
    const commentVersionsResponse = await httpResponse2.json()

    if (commentVersionsResponse.success && commentVersionsResponse.data) {
      // 同上：依 createdTime 升冪排序，確保 [length-1] 為最新版本
      commentVersions.value = (commentVersionsResponse.data.versions || [])
        .slice()
        .sort((a: Version, b: Version) => Number(a.createdTime) - Number(b.createdTime))

      if (commentVersions.value.length > 0) {
        const latestVersion = commentVersions.value[commentVersions.value.length - 1]
        selectedCommentVersionId.value = latestVersion.versionId

        // 保存最新版本用於對比（從 API 返回的完整排名數據）
        latestCommentRankings.value = latestVersion.rankings.map(ranking => {
          // 從 allCommentsForRanking 中查找完整評論數據
          const comment = allCommentsForRanking.value.find(c => c.commentId === ranking.targetId)
          return {
            commentId: ranking.targetId,
            authorEmail: ranking.authorEmail || '',
            authorDisplayName: comment?.authorDisplayName || ranking.authorEmail || '',
            content: comment?.content || '',
            createdTime: comment?.createdTime || '',
            mentionedGroups: comment?.mentionedGroups || [],
            rank: ranking.rank
          }
        })
      }
    }

    // 自動進入預覽模式（如果有版本歷史且指定自動預覽）
    if (autoEnterPreview) {
      // 清除舊的 alert
      clearAlerts()

      const hasSubmissionVersions = submissionVersions.value.length > 0
      const hasCommentVersions = commentVersions.value.length > 0

      // 同時載入兩種類型的排名數據（如果存在），避免切換 tab 時數據遺失
      if (hasSubmissionVersions) {
        const latestSubmissionVersion = submissionVersions.value[submissionVersions.value.length - 1]
        loadedSubmissionVersionId.value = latestSubmissionVersion.versionId
        loadSubmissionRankingsToEditor(latestSubmissionVersion)
      }

      if (hasCommentVersions) {
        const latestCommentVersion = commentVersions.value[commentVersions.value.length - 1]
        loadedCommentVersionId.value = latestCommentVersion.versionId
        loadCommentRankingsToEditor(latestCommentVersion)
      }

      // 根據當前 tab 顯示對應的提示訊息
      if (hasSubmissionVersions || hasCommentVersions) {
        addAlert({
          type: 'info',
          title: '正在檢視最新投票結果',
          message: '目前顯示最新提交的排名結果（唯讀模式），點擊下方「離開檢視模式」按鈕可重新編輯',
          closable: false,
          autoClose: 0
        })
      }
    }
  } catch (error) {
    console.error('載入版本歷史失敗:', error)
  }
}

function handleSubmissionVersionChange(versionId: string): void {
  selectedSubmissionVersionId.value = versionId

  // 判斷是否為歷史版本
  if (submissionVersions.value.length > 0) {
    const latestVersion = submissionVersions.value[submissionVersions.value.length - 1]
    const isLatest = versionId === latestVersion.versionId
    const selectedVersion = submissionVersions.value.find(v => v.versionId === versionId)

    if (isLatest) {
      // 如果選擇的是最新版本，進入最新版本的預覽模式
      loadedSubmissionVersionId.value = versionId
      if (selectedVersion) {
        loadSubmissionRankingsToEditor(selectedVersion)
      }
      clearAlerts()
      addAlert({
        type: 'info',
        title: '正在檢視最新投票結果',
        message: '目前顯示最新提交的排名結果（唯讀模式），點擊下方「離開檢視模式」按鈕可重新編輯',
        closable: false,
        autoClose: 0
      })
    } else {
      // 如果選擇的是歷史版本，進入預覽模式
      loadedSubmissionVersionId.value = versionId
      if (selectedVersion) {
        loadSubmissionRankingsToEditor(selectedVersion)
      }
      clearAlerts()
      addAlert({
        type: 'info',
        title: '正在檢視歷史版本',
        message: '目前為唯讀預覽模式，點擊下方「離開檢視模式」按鈕可重新編輯',
        closable: false,
        autoClose: 0
      })
    }
  }
}

function handleCommentVersionChange(versionId: string): void {
  selectedCommentVersionId.value = versionId

  // 判斷是否為歷史版本
  if (commentVersions.value.length > 0) {
    const latestVersion = commentVersions.value[commentVersions.value.length - 1]
    const isLatest = versionId === latestVersion.versionId
    const selectedVersion = commentVersions.value.find(v => v.versionId === versionId)

    if (isLatest) {
      // 如果選擇的是最新版本，進入最新版本的預覽模式
      loadedCommentVersionId.value = versionId
      if (selectedVersion) {
        loadCommentRankingsToEditor(selectedVersion)
      }
      clearAlerts()
      addAlert({
        type: 'info',
        title: '正在檢視最新投票結果',
        message: '目前顯示最新提交的排名結果（唯讀模式），點擊下方「離開檢視模式」按鈕可重新編輯',
        closable: false,
        autoClose: 0
      })
    } else {
      // 如果選擇的是歷史版本，進入預覽模式
      loadedCommentVersionId.value = versionId
      if (selectedVersion) {
        loadCommentRankingsToEditor(selectedVersion)
      }
      clearAlerts()
      addAlert({
        type: 'info',
        title: '正在檢視歷史版本',
        message: '目前為唯讀預覽模式，點擊下方「離開檢視模式」按鈕可重新編輯',
        closable: false,
        autoClose: 0
      })
    }
  }
}

async function exitSubmissionPreviewMode(): Promise<void> {
  loadedSubmissionVersionId.value = null
  clearAlerts()
  // 重新載入最新可投票名單，避免停在被覆蓋的舊版本資料
  await loadTeacherVoteData()
  ElMessage.success('已退出檢視模式，已載入最新可投票名單')
}

async function exitCommentPreviewMode(): Promise<void> {
  loadedCommentVersionId.value = null
  clearAlerts()
  // 重新載入最新可投票名單，避免停在被覆蓋的舊版本資料
  await loadTeacherVoteData()
  ElMessage.success('已退出檢視模式，已載入最新可投票名單')
}

function formatVersionTitle(version: Version, index: number): string {
  // Determine which version array to use based on active tab
  const versions = activeTab.value === 'submissions' ?
    submissionVersions.value : commentVersions.value

  if (index === versions.length - 1) {
    return '最新版本'
  }

  const date = new Date(version.createdTime)
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatVersionDescription(version: Version): string {
  return `提交者：${version.teacherDisplayName || version.teacherEmail || '未知'}`
}

function updateSubmissionRankings(newRankings: Submission[]): void {
  rankedSubmissions.value = newRankings
}

// 最新已提交版本所包含的 submissionId（用於標記「未列於此次排名」的新組）
const latestVersionSubmissionIds = computed(
  () => new Set(latestSubmissionRankings.value.map(r => r.submissionId))
)

/**
 * 判斷某成果是否「不在最新已提交的教師排名版本中」
 * （例如清空投票後新通過組內共識的組，被補進可投票名單但尚未排入此版本）
 * 僅在「唯讀檢視模式」標記；一旦回到可編輯（重新投票）模式就不標記，因為使用者正在設定新排名。
 */
function isSubmissionNotInLatestVersion(item: any): boolean {
  return (
    (isSubmissionPreviewMode.value || isViewingOldSubmissionVersion.value) &&
    latestSubmissionRankings.value.length > 0 &&
    !!item?.submissionId &&
    !latestVersionSubmissionIds.value.has(item.submissionId)
  )
}

async function loadTeacherVoteData(): Promise<void> {
  try {
    loading.value = true

    // Vue 3 Best Practice: rpcClient automatically handles authentication
    // 投票需要完整數據，始終從 API 獲取 submissions 和 comments（不使用可能被分頁的快取數據）
    console.log('🎯 [TeacherVoteModal] 載入教師投票數據:', {
      projectId: props.projectId,
      stageId: props.stageId,
      stageGroupsCount: props.stageGroups.length,
      hasCachedGroups: props.cachedProjectGroups.length > 0
    })

    // ===== 1. 載入專案 Groups 數據 =====
    // 優化：優先使用 cachedProjectGroups，避免冗餘 API 調用
    if (props.cachedProjectGroups.length > 0) {
      projectGroups.value = props.cachedProjectGroups
      console.log('📊 [TeacherVoteModal] 使用快取 Groups 數據:', projectGroups.value.length, '個組別')
    } else {
      // Fallback: 調用 API（向後兼容）
      try {
        const httpResponse = await rpcClient.projects.core.$post({
          json: {
            projectId: props.projectId
          }
        })
        const coreResponse = await httpResponse.json()

        if (coreResponse.success && coreResponse.data && coreResponse.data.groups) {
          projectGroups.value = coreResponse.data.groups
          console.log('📊 [TeacherVoteModal] 從 API 載入 Groups 數據:', projectGroups.value.length, '個組別')
        }
      } catch (error) {
        console.warn('載入Groups數據失敗:', error)
      }
    }

    // ===== 2. 載入成果提交數據 =====
    // 投票需要完整數據，始終調用 API（不依賴父組件可能被分頁的快取數據）
    const httpResponse1 = await rpcClient.projects.content.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        contentType: 'submissions',
        excludeUserGroups: false,  // 教師看所有組，不過濾
        includeSubmitted: false    // ✅ 只顯示 approved 狀態的 submissions
      }
    })
    const submissionsResponse = await httpResponse1.json()

    if (submissionsResponse.success && submissionsResponse.data) {
      console.log('📊 [TeacherVoteModal] 從 API 載入提交數量:', submissionsResponse.data.submissions?.length || 0)

      rankedSubmissions.value = (submissionsResponse.data.submissions || [])
        .map((sub: any) => {
          let groupName = sub.groupName
          let memberNames = sub.memberNames || []

          if (!groupName) {
            const group = props.stageGroups.find(g => g.groupId === sub.groupId)
            groupName = group?.groupName || 'Unknown Group'
            memberNames = (group as any)?.memberNames || []
          }

          return {
            submissionId: sub.submissionId,
            groupId: sub.groupId,
            groupName: groupName,
            memberNames: memberNames,
            reportContent: sub.contentMarkdown,
            submitTime: sub.submitTime,
            status: sub.status
          }
        })
        .sort((a: Submission, b: Submission) => {
          const aTime = typeof a.submitTime === 'number' ? a.submitTime : 0
          const bTime = typeof b.submitTime === 'number' ? b.submitTime : 0
          return bTime - aTime
        })
    }

    console.log('🎯 [TeacherVoteModal] 最終 rankedSubmissions:', rankedSubmissions.value.length, '個')

    // ===== 3. 載入評論數據 =====
    // 投票需要完整數據，始終調用 API（不依賴父組件可能被分頁的快取數據）
    let commentsToProcess: any[] = []

    const httpResponse2 = await rpcClient.comments.stage.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        excludeTeachers: true,  // excludeTeachers: true - teachers don't see their own comments
        forVoting: true  // 按作者去重，每位作者只保留一篇代表评论
        // 注意：不傳 limit/offset，確保返回完整數據
      }
    })
    const commentsResponse = await httpResponse2.json()

    if (commentsResponse.success && commentsResponse.data && commentsResponse.data.comments) {
      console.log('💬 [TeacherVoteModal] 從 API 載入評論數量:', commentsResponse.data.comments.length)
      commentsToProcess = commentsResponse.data.comments
    }

    // 統一處理評論數據（無論來自快取或 API）
    if (commentsToProcess.length > 0) {
      // 使用後端計算的 canBeVoted 欄位過濾
      // canBeVoted 包含所有資格檢查：非回覆、有 mention、作者是 group member、有 helpful reaction
      const validComments = commentsToProcess
        .filter((comment: any) => comment.canBeVoted === true)
        .map((comment: any) => {
          // 將 mentionedGroups ID 轉換為顯示名稱
          let mentionedGroups: string[] = []
          let mentionedGroupNames: string[]
          try {
            if (comment.mentionedGroups) {
              mentionedGroups = typeof comment.mentionedGroups === 'string'
                ? JSON.parse(comment.mentionedGroups)
                : comment.mentionedGroups
            }
            if (!Array.isArray(mentionedGroups)) {
              mentionedGroups = []
            }

            mentionedGroupNames = mentionedGroups.map(groupId => {
              const projectGroup = projectGroups.value.find(g => g.groupId === groupId)
              if (projectGroup) {
                return projectGroup.groupName || projectGroup.name || groupId
              }

              const stageGroup = props.stageGroups.find(g => g.groupId === groupId)
              if (stageGroup) {
                return stageGroup.groupName || stageGroup.name || groupId
              }

              return groupId
            })
          } catch (e) {
            console.warn('解析mentionedGroups失敗:', e)
            mentionedGroupNames = []
          }

          return {
            ...comment,
            // API 回傳 authorName，映射為內部使用的 authorDisplayName
            authorDisplayName: comment.authorName || comment.authorEmail?.split('@')[0] || '',
            mentionedGroups: mentionedGroupNames
          }
        })
        .sort((a: any, b: any) => b.createdTime - a.createdTime)

      allCommentsForRanking.value = [...validComments]
      rankedComments.value = []

      console.log('💬 [TeacherVoteModal] 最終有效評論數量 (canBeVoted=true):', allCommentsForRanking.value.length)
    } else {
      allCommentsForRanking.value = []
      rankedComments.value = []
    }

    // ===== 4. 檢查是否有組別未完成組內共識（無法參與投票） =====
    await checkPendingConsensus(props.projectId, props.stageId)

  } catch (error) {
    console.error('❌ [TeacherVoteModal] 載入教師投票數據失敗:', error)
    ElMessage.error('載入投票數據失敗')
  } finally {
    loading.value = false
  }
}

function formatGroupMembers(group: Submission): string {
  if (!group.memberNames || group.memberNames.length === 0) {
    return '無成員'
  }

  const names = group.memberNames.join('、')
  if (names.length > 40) {
    return names.substring(0, 37) + '...'
  }
  return names
}

function formatSubmissionTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('zh-TW') + ' ' +
         new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

function truncateContent(content: string): string {
  if (!content) return '無內容'
  if (content.length > 100) {
    return content.substring(0, 97) + '...'
  }
  return content
}

async function submitSubmissionRankings(): Promise<void> {
  try {
    submittingSubmissions.value = true

    const submissionRankings = rankedSubmissions.value.map((submission: any, index) => ({
      type: 'submission' as const,
      targetId: submission.submissionId,
      groupId: submission.groupId,
      // 採用元件計算的 dense 弱序 rank（同名共用同一 rank），回退為位置序
      rank: typeof submission.rank === 'number' ? submission.rank : index + 1
    }))

    const httpResponse = await (rpcClient.api.rankings as any)['teacher-comprehensive-vote'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankings: {
          submissions: submissionRankings,
          comments: []
        }
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('成果排名已成功提交！')

      // 重新載入版本歷史並自動進入預覽模式
      await loadVersionHistory(true)

      emit('teacher-ranking-submitted', {
        success: true,
        type: 'submissions',
        data: response.data,
        needRefresh: true
      })
    } else {
      throw new Error(response.error?.message || '提交失敗')
    }
  } catch (error) {
    console.error('提交成果排名失敗:', error)
    ElMessage.error(`提交失敗: ${getErrorMessage(error)}`)
  } finally {
    submittingSubmissions.value = false
  }
}

async function submitCommentRankings(): Promise<void> {
  try {
    submittingComments.value = true

    if (rankedComments.value.length === 0) {
      ElMessage.error('請至少選擇一個評論進行排名')
      return
    }

    const commentRankings = rankedComments.value
      .slice(0, dynamicMaxCommentSelections.value)
      .map((comment, index) => ({
        type: 'comment' as const,
        targetId: comment.commentId,
        authorEmail: comment.authorEmail,
        rank: index + 1
      }))

    const httpResponse = await (rpcClient.api.rankings as any)['teacher-comprehensive-vote'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankings: {
          submissions: [],
          comments: commentRankings
        }
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('評論排名已成功提交！')

      // 重新載入版本歷史並自動進入預覽模式
      await loadVersionHistory(true)

      emit('teacher-ranking-submitted', {
        success: true,
        type: 'comments',
        data: response.data,
        needRefresh: true
      })
    } else {
      throw new Error(response.error?.message || '提交失敗')
    }
  } catch (error) {
    console.error('提交評論排名失敗:', error)
    ElMessage.error(`提交失敗: ${getErrorMessage(error)}`)
  } finally {
    submittingComments.value = false
  }
}

function handleClose(done?: () => void): void {
  if (!loading.value && !submittingSubmissions.value && !submittingComments.value) {
    // 重置數據
    rankedSubmissions.value = []
    rankedComments.value = []
    projectGroups.value = []
    activeTab.value = 'submissions'

    // 關閉 drawer
    if (typeof done === 'function') {
      done()
    } else {
      emit('update:visible', false)
    }
  }
}

// ========== Watchers ==========

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    // 先載入數據和版本歷史
    await loadTeacherVoteData()
    await loadVersionHistory(true)  // ✅ 自動進入預覽模式（如果有版本歷史）

    // 如果沒有進入預覽模式（即沒有版本歷史），顯示說明訊息
    if (!isPreviewMode.value) {
      clearAlerts()
      addAlert({
        type: 'info',
        title: '教師綜合投票說明',
        message: '具有教師權限者可以為本階段的所有有效成果和評論進行綜合排名。您的評分將直接作為階段結算的依據，不需要其他人的確認。',
        closable: false,
        autoClose: 0
      })
    }
  } else {
    // Clear alerts when closing
    clearAlerts()
    // 重置預覽模式狀態
    loadedSubmissionVersionId.value = null
    loadedCommentVersionId.value = null
  }
})

// 計算有效評論作者數量（用於百分比模式）
function getUniqueCommentAuthorCount(): number {
  const uniqueAuthors = new Set(allCommentsForRanking.value.map(c => c.authorEmail))
  return uniqueAuthors.size
}

// 動態計算可選評論數量（根據模式）
const dynamicMaxCommentSelections = computed((): number => {
  if (props.commentRewardPercentile === 0) {
    // 固定 TopN 模式：直接使用 props.maxCommentSelections
    return props.maxCommentSelections
  } else {
    // 百分比模式：根據有效評論作者數量計算
    const totalAuthors = getUniqueCommentAuthorCount()
    // 如果還沒載入評論，使用 props.maxCommentSelections 作為 fallback
    if (totalAuthors === 0) {
      return props.maxCommentSelections
    }
    return Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
  }
})

// 生成評論排名規則 title
function getCommentRankingTitle(): string {
  if (props.commentRewardPercentile === 0) {
    return `📊 本專案採用固定排名模式：前 ${props.maxCommentSelections} 名有效評論作者可獲得獎金`
  } else {
    const totalAuthors = getUniqueCommentAuthorCount()
    const qualifiedCount = Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
    return `📊 本專案採用百分比模式：前 ${props.commentRewardPercentile}% 的有效評論作者（也就是 ${totalAuthors} × ${props.commentRewardPercentile}% = ${qualifiedCount} 人）可獲得獎金`
  }
}

// 當切換到評論 tab 時，顯示評論排名規則
watch(activeTab, (newTab) => {
  if (newTab === 'comments' && props.visible && !isPreviewMode.value) {
    clearAlerts()
    // 顯示評論排名規則說明（永久顯示，不自動關閉）
    addAlert({
      type: 'info',
      title: getCommentRankingTitle(),
      message: '每位作者僅顯示一篇代表評論（以獲得最多支持的為準）。評論須得到起碼一個被提到的用戶的支持才算有效評論',
      closable: false,
      autoClose: 0
    })
  } else if (newTab === 'submissions' && props.visible && !isPreviewMode.value) {
    clearAlerts()
    addAlert({
      type: 'info',
      title: '教師綜合投票說明',
      message: '具有教師權限者可以為本階段的所有有效成果和評論進行綜合排名。您的評分將直接作為階段結算的依據，不需要其他人的確認。',
      closable: false,
      autoClose: 0
    })
  }
})
</script>

<style scoped>
/* Drawer 自定義樣式 */
.teacher-vote-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 0;
}

.drawer-header {
  background: #1e3a8a;
  color: white;
  padding: 20px 25px;
  width: 100%;
}

.drawer-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.drawer-body {
  height: 100%;
  overflow-y: auto;
  padding: 0;
}

/* Segmented Control 樣式 */
.vote-segmented-wrapper {
  display: flex;
  justify-content: center;
  margin: 24px 25px;
  padding: 15px 0;
}

.vote-segmented-wrapper :deep(.el-segmented) {
  background: rgba(255, 255, 255, 0.9);
  padding: 4px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.vote-segmented-wrapper :deep(.el-segmented__item) {
  color: #1e40af;
  font-weight: 500;
  font-size: 16px;
  padding: 10px 24px;
  transition: all 0.3s;
}

.vote-segmented-wrapper :deep(.el-segmented__item.is-selected) {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
}

.vote-segmented-wrapper :deep(.el-segmented__item:hover:not(.is-selected)) {
  background: rgba(59, 130, 246, 0.1);
}

.vote-section {
  padding: 0 25px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title i {
  color: #3b82f6;
  font-size: 20px;
}

/* 排名項目樣式 */
.ranking-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  margin-bottom: 12px;
}

.ranking-item:hover {
  background: #e2e8f0;
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.rank-number {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.item-content {
  flex: 1;
}

.group-info, .comment-info {
  flex: 1;
  min-width: 0;
}

/* 未列於此次排名中的成果（新通過共識、補進可投票名單的組） */
.group-info.not-in-version {
  border: 2px dashed #e6a23c;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fffbf0;
}

.not-in-version-note {
  color: #e6a23c;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.group-header, .comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.group-name, .comment-author {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.submission-time, .comment-time {
  font-size: 12px;
  color: #6b7280;
}

.group-members {
  font-size: 14px;
  color: #4b5563;
  margin-bottom: 8px;
}

.submission-preview, .comment-content {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  background: white;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.comment-mentions {
  font-size: 12px;
  color: #6366f1;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.no-items {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
  font-size: 16px;
}

.no-items i {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.5;
}

/* 點數分配視覺化區塊 */
.point-distribution-section {
  margin-top: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 12px;
  border: 2px solid #dee2e6;
}

.chart-hint {
  margin-top: 15px;
  padding: 12px 20px;
  background: #d1ecf1;
  border: 1px solid #bee5eb;
  border-radius: 8px;
  color: #0c5460;
  font-size: 14px;
  text-align: center;
  font-weight: 500;
}

/* Action buttons - Using unified .drawer-actions from drawer-unified.scss */

/* 響應式設計 */
@media (max-width: 768px) {
  .ranking-item {
    padding: 16px;
  }

  .rank-number {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .group-name, .comment-author {
    font-size: 14px;
  }

  .group-header, .comment-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .vote-tabs {
    margin: 16px;
  }

  .vote-section {
    padding: 0 16px;
  }
}
</style>
