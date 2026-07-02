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
          <i :class="isSudoMode ? 'fas fa-eye' : 'fas fa-comment'"></i>
          {{ isSudoMode ? '評論投票檢視' : '評論投票' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div v-loading="loading" class="drawer-body" element-loading-text="載入評論資料中...">
      <!-- DrawerAlertZone for preview mode alerts -->
      <DrawerAlertZone />

      <!-- 說明文字 -->
      <div class="info-banner">
        請選出你覺得最適合當作優良評論的前{{ dynamicMaxSelections }}名。您可以多次投票，系統會採用您最新的投票結果。
      </div>


      <!-- 投票資格檢查 -->
      <div v-if="loadingEligibility" class="eligibility-banner loading">
        <div class="loading-spinner"></div>
        正在檢查投票資格...
      </div>

      <div v-else-if="votingEligibility && !votingEligibility.canVote" class="eligibility-banner error">
        <div class="error-icon"><i class="fas fa-ban"></i></div>
        <div class="error-content">
          <div class="error-title">無法投票</div>
          <div class="error-message">{{ votingEligibility.message }}</div>
          <div v-if="!votingEligibility.hasMentionedGroup" class="error-hint">
            <i class="fas fa-lightbulb"></i> 在評論中使用 @第一組、@第二組 等方式提及組別即可獲得投票資格
          </div>
        </div>
      </div>

      <div v-else-if="votingEligibility && votingEligibility.canVote" class="eligibility-banner success">
        <div class="success-icon">✅</div>
        <div class="success-content">
          <div class="success-title">您有投票資格</div>
          <div class="success-message">已在評論中提及 {{ votingEligibility.groupMentionCount }} 個組別</div>
          <div v-if="votingEligibility.hasVoted" class="vote-history">
            <i class="fas fa-lightbulb"></i> 您已經於 {{ formatVoteTime(votingEligibility.lastVoteTime || '') }} 投過票了 (共 {{ votingEligibility.voteCount }} 次)
          </div>
        </div>
      </div>

      <!-- Version Timeline Section -->
      <div v-if="hasMultipleVersions" class="version-timeline-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-history"></i>
            投票歷史時間軸
          </label>
        </div>

        <VersionTimeline
          :versions="proposalVersions"
          :current-version-id="selectedVersionId"
          version-id-key="proposalId"
          created-time-key="createdTime"
          display-name-key="authorEmail"
          :format-title-fn="(_version: any, index: number) =>
            index === proposalVersions.length - 1
              ? '最新版本'
              : `版本 ${index + 1}`"
          @version-change="onVersionChange"
        >
          <template #description="{ version, index }: { version: unknown; index: number }">
            <div class="version-description">
              <div>提交時間：{{ formatVoteTime((version as ProposalVersion).createdTime) }}</div>
              <div>已選評論：{{ JSON.parse((version as ProposalVersion).rankingData).length }} 則</div>
            </div>
          </template>
        </VersionTimeline>
      </div>

      <!-- 評論選擇和排序 -->
      <div v-if="!isViewingOldVersion">
        <CommentRankingTransfer
        :items="allComments"
        :max-selections="dynamicMaxSelections"
        :disabled="isReadOnly"
        item-key="id"
        unique-by-field="authorEmail"
        :display-fields="{
          content: 'content',
          author: 'author',
          timestamp: 'timestamp'
        }"
        :author-display-fn="(item: any) => `${item.author}(${item.authorEmail})`"
        :initial-selected="selectedComments as any"
          @update:selected="selectedComments = $event as Comment[]"
          @duplicate-detected="warning('同作者的評論只能選一個送入排序')"
          @max-limit-reached="$message.warning(`最多只能選擇 ${dynamicMaxSelections} 個評論`)"
        />

        <!-- 點數分配視覺化 -->
        <div v-if="selectedComments.length > 0 || (currentUserComment && !isCurrentUserInSelected)" class="point-distribution-section">
          <AllGroupsChart
            :selected-members="currentSelectedAuthorMembers"
            :simulated-rank="currentUserRank"
            :simulated-group-count="totalGroupCount"
            :report-reward="commentReward"
            :all-groups="allCommentsAsGroups"
            :current-group-id="currentUserEmail"
            :total-project-groups="totalGroupCount"
          />
          <div class="chart-hint">
            <i class="fas fa-lightbulb"></i> {{ chartHintText }}
          </div>
        </div>
      </div>

      <!-- Two Column Comparison: When viewing old version -->
      <RankingComparison
        v-else
        left-title="最新版本"
        :right-title="`版本 ${proposalVersions.findIndex(p => p.proposalId === selectedVersionId) + 1}`"
        :left-items="latestProposalComments"
        :right-items="currentProposalComments"
        item-key="id"
        item-label="author"
        :item-display-fn="(item: any) => `${item.author}(${item.authorEmail})`"
      />

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <!-- 離開檢視模式按鈕（預覽模式時顯示，SUDO 模式下隱藏） -->
        <el-button
          v-if="isPreviewMode && !isSudoMode"
          type="warning"
          @click="exitPreviewMode"
        >
          <i class="fas fa-edit"></i>
          離開檢視模式
        </el-button>

        <!-- 送出投票按鈕（SUDO 模式下隱藏） -->
        <el-button
          v-if="!isSudoMode"
          type="primary"
          :disabled="!canSubmit || isReadOnly"
          :loading="submitting"
          @click="submitVote"
        >
          <i v-if="!submitting" class="fas fa-paper-plane"></i>
          {{ isViewingOldVersion ? '切回最新版本以投票' : '送出投票' }}
        </el-button>

        <!-- 清除重選按鈕（SUDO 模式下隱藏） -->
        <el-button
          v-if="!isSudoMode"
          :disabled="isReadOnly"
          @click="clearAll"
        >
          <i class="fas fa-eraser"></i>
          清除重選
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import CommentRankingTransfer from './common/CommentRankingTransfer.vue'
import DrawerAlertZone from './common/DrawerAlertZone.vue'
import VersionTimeline from './common/VersionTimeline.vue'
import RankingComparison from './common/RankingComparison.vue'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import { rpcClient } from '@/utils/rpc-client'
import { useAuth } from '@/composables/useAuth'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useSudoStore } from '@/stores/sudo'
import type { Group } from '@repo/shared'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// Drawer Alerts
const { addAlert, clearAlerts, warning } = useDrawerAlerts()

// Point Calculation
const { calculateRankWeights } = usePointCalculation()

// Read-Only / Sudo Mode
const sudoStore = useSudoStore()
const isSudoMode = computed(() => props.readOnly || sudoStore.isActive)

// ========== Type Definitions ==========

interface Comment {
  id: string
  content: string
  fullContent: string
  author: string
  authorEmail: string
  timestamp: string
}

interface VotingEligibility {
  canVote: boolean
  message: string
  hasMentionedGroup?: boolean
  groupMentionCount?: number
  hasVoted?: boolean
  lastVoteTime?: string
  voteCount?: number
}

interface ProposalVersion {
  proposalId: string
  rankingData: string
  createdTime: string
  authorEmail: string
}

interface RankingData {
  commentId: string
  rank: number
  content: string
}

interface Member {
  email: string
  displayName: string
  contribution: number
}

interface User {
  userEmail?: string
}

// ========== Props & Emits ==========

export interface Props {
  visible: boolean
  projectId: string
  stageId: string
  maxSelections: number  // Required: dynamically loaded from project config
  commentRewardPercentile: number  // Required: 0 = fixed TOP N, >0 = percentage mode
  commentReward?: number  // Comment reward points (default: 500)
  user?: User | null
  comments?: Comment[]
  stageComments?: any[]  // 從父組件傳入的原始評論列表（避免重複 API 呼叫）
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  user: null,
  commentReward: 500,
  comments: () => [
    {
      id: 'comment1',
      content: '這是評論摘錄20字...這是一個非常棒的專案成果，展現了團隊的創新思維和執行能力。',
      author: '張同學',
      authorEmail: 'zhang@example.com',
      timestamp: '2025/02/01 08:09 AM',
      fullContent: '這是一個非常棒的專案成果，展現了團隊的創新思維和執行能力。他們在技術實現上有很多亮點。'
    },
    {
      id: 'comment2',
      content: '這是評論摘錄20字...我認為這個方案在實用性方面還有提升空間，建議可以增加更多用戶反饋機制。',
      author: '李同學',
      authorEmail: 'li@example.com',
      timestamp: '2025/02/01 09:15 AM',
      fullContent: '我認為這個方案在實用性方面還有提升空間，建議可以增加更多用戶反饋機制，讓產品更貼近使用者需求。'
    },
    {
      id: 'comment3',
      content: '這是評論摘錄20字...整體設計很有創意，但在技術細節的處理上可以更加細緻。',
      author: '王同學',
      authorEmail: 'wang@example.com',
      timestamp: '2025/02/01 10:30 AM',
      fullContent: '整體設計很有創意，但在技術細節的處理上可以更加細緻，特別是在用戶界面的優化方面。'
    },
    {
      id: 'comment4',
      content: '這是評論摘錄20字...專案的創新點很突出，執行過程也很專業，值得學習。',
      author: '陳同學',
      authorEmail: 'chen@example.com',
      timestamp: '2025/02/01 11:45 AM',
      fullContent: '專案的創新點很突出，執行過程也很專業，值得學習。團隊合作的默契度很高。'
    },
    {
      id: 'comment5',
      content: '這是評論摘錄20字...建議在未來版本中加入更多的功能擴展，提升整體的實用價值。',
      author: '劉同學',
      authorEmail: 'liu@example.com',
      timestamp: '2025/02/01 12:20 PM',
      fullContent: '建議在未來版本中加入更多的功能擴展，提升整體的實用價值，讓產品更具競爭力。'
    }
  ],
  stageComments: () => [],
  readOnly: false
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'vote-submitted', data: { success: boolean; data: any; rankedComments: Comment[] }): void
}>()

// Vue 3 Best Practice: Use unified useAuth() composable
const { user: authUser, userEmail: authUserEmail } = useAuth()

// ========== Computed ==========

const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 從父組件傳入的評論列表，過濾 + 轉換格式（避免重複 API 呼叫）
const processedStageComments = computed((): Comment[] => {
  if (!props.stageComments || props.stageComments.length === 0) {
    return []
  }

  return props.stageComments
    .filter((c: any) => c.canBeVoted === true)
    .map((c: any) => ({
      id: c.commentId || c.id,
      content: c.content.substring(0, 50) + (c.content.length > 50 ? '...' : ''),
      fullContent: c.content,
      author: c.authorName || c.author || c.authorEmail,
      authorEmail: c.authorEmail,
      timestamp: c.createdTime || c.timestamp
    }))
})

// ========== Reactive State ==========

const loading: Ref<boolean> = ref(false)
const submitting: Ref<boolean> = ref(false)
const allComments: Ref<Comment[]> = ref([])
const allCommentsRaw: Ref<Comment[]> = ref([])  // 保存原始评论（包含用户自己的）
const selectedComments: Ref<Comment[]> = ref([])
const votingEligibility: Ref<VotingEligibility | null> = ref(null)
const loadingEligibility: Ref<boolean> = ref(false)

// Version history data
const proposalVersions: Ref<ProposalVersion[]> = ref([])
const selectedVersionId: Ref<string> = ref('')
const currentProposalComments: Ref<Comment[]> = ref([])
const latestProposalComments: Ref<Comment[]> = ref([])
const allCommentsMap: Ref<Map<string, Comment>> = ref(new Map())

// Preview mode state
const loadedProposalId: Ref<string | null> = ref(null)  // Tracks which proposal is currently loaded for preview
const isLoadingProposal: Ref<boolean> = ref(false)  // Prevents race condition with initializeComments

// ========== Computed Properties ==========

const canSubmit = computed((): boolean => {
  return selectedComments.value.length > 0 &&
         votingEligibility.value !== null &&
         votingEligibility.value.canVote &&
         !submitting.value &&
         isLatestVersion.value
})

const hasMultipleVersions = computed((): boolean => {
  return proposalVersions.value.length >= 1
})

const isLatestVersion = computed((): boolean => {
  if (!proposalVersions.value.length) return true
  const latest = proposalVersions.value[proposalVersions.value.length - 1]
  return selectedVersionId.value === latest.proposalId || !selectedVersionId.value
})

const isViewingOldVersion = computed((): boolean => {
  return hasMultipleVersions.value && !isLatestVersion.value
})

// Preview mode: true when a proposal version is loaded into the editor
const isPreviewMode = computed((): boolean => {
  return loadedProposalId.value !== null
})

// Read-only mode: preview or sudo
const isReadOnly = computed((): boolean => {
  return isPreviewMode.value || isSudoMode.value
})

// 查找当前用户的评论
const currentUserComment = computed((): Comment | null => {
  const userEmail = getCurrentUserEmail()
  if (!userEmail) return null

  return allCommentsRaw.value.find(c => c.authorEmail === userEmail) || null
})

// 判断当前用户是否在选中列表中
const isCurrentUserInSelected = computed((): boolean => {
  const userEmail = getCurrentUserEmail()
  if (!userEmail) return false
  return selectedComments.value.some(c => c.authorEmail === userEmail)
})

// 计算当前用户的排名
const currentUserRank = computed((): number => {
  const userEmail = getCurrentUserEmail()
  if (!userEmail || !currentUserComment.value) return 0

  // 查找当前用户在 selectedComments 中的位置
  const index = selectedComments.value.findIndex(c => c.authorEmail === userEmail)
  if (index !== -1) {
    return index + 1 // 排名从 1 开始
  }

  // 如果不在 selectedComments 中但有评论，排在最后（在虚拟评论之前）
  return selectedComments.value.length + 1
})

// 计算需要填充的虚拟评论数量
const virtualCommentCount = computed((): number => {
  let actualCount = selectedComments.value.length

  // 只有当用户选了至少1个评论时，才计入用户自己的评论
  if (selectedComments.value.length > 0 && currentUserComment.value && !isCurrentUserInSelected.value) {
    actualCount++
  }

  // 虚拟评论数 = dynamicMaxSelections - 实际评论数
  return Math.max(0, dynamicMaxSelections.value - actualCount)
})

// 总组数（使用 dynamicMaxSelections）
const totalGroupCount = computed((): number => {
  return dynamicMaxSelections.value
})

// AllGroupsChart 整合：當前用户的评论数据（用于图表高亮）
const currentSelectedAuthorMembers = computed((): Member[] => {
  // 评论投票场景：永远返回空数组，强制 AllGroupsChart 使用 Settlement Mode
  // 这样图表会直接使用 allCommentsAsGroups 的数据和 rank 排序
  return []
})

// 將所有選中的評論轉換為「組」資料（含当前用户评论和虚拟评论）
const allCommentsAsGroups = computed((): any[] => {
  const groups: any[] = []
  let currentRank = 1

  // 计算排名权重
  const rankWeights = calculateRankWeights(dynamicMaxSelections.value)

  // === 計算總權重和 pointsPerWeight ===
  let totalWeight = 0

  // 輔助函數：計算指定排名的權重
  const calculateWeight = (rank: number): number => {
    const contribution = 100
    const baseWeightUnits = contribution / 5
    return rank <= dynamicMaxSelections.value
      ? baseWeightUnits * (rankWeights[rank] ?? 0)
      : 0
  }

  // 1. 選中的評論權重
  selectedComments.value.forEach((_, index) => {
    totalWeight += calculateWeight(index + 1)
  })

  // 2. 虛擬評論權重
  const startVirtualRank = selectedComments.value.length + 1
  for (let i = 0; i < virtualCommentCount.value; i++) {
    totalWeight += calculateWeight(startVirtualRank + i)
  }

  // 3. 當前用戶評論權重（如果適用）
  if (selectedComments.value.length > 0 && currentUserComment.value && !isCurrentUserInSelected.value) {
    const userRank = selectedComments.value.length + virtualCommentCount.value + 1
    totalWeight += calculateWeight(userRank)
  }

  // 計算每單位權重的點數
  const pointsPerWeight = totalWeight > 0 ? commentReward.value / totalWeight : 0
  // === 結束計算 ===

  // 1. 添加所有选中的评论（按拖拽顺序，排名 1 到 N）
  selectedComments.value.forEach((comment) => {
    const rank = currentRank++
    const contribution = 100
    const baseWeightUnits = contribution / 5
    // 超出獎勵範圍的評論權重為 0（避免 rankWeights[rank] 為 undefined 導致 NaN）
    const finalWeight = rank <= dynamicMaxSelections.value
      ? baseWeightUnits * (rankWeights[rank] ?? 0)
      : 0

    groups.push({
      groupId: comment.authorEmail || comment.author,
      groupName: comment.author,
      rank: rank,
      status: 'active',
      memberCount: 1,
      members: [{
        email: comment.authorEmail || comment.author,
        displayName: comment.author,
        points: finalWeight * pointsPerWeight,
        contribution: contribution,
        finalWeight: finalWeight,
        rank: rank
      }]
    })
  })

  // 2. 填充虚拟评论
  for (let i = 0; i < virtualCommentCount.value; i++) {
    const rank = currentRank++
    const contribution = 100
    const baseWeightUnits = contribution / 5
    // 超出獎勵範圍的評論權重為 0（避免 rankWeights[rank] 為 undefined 導致 NaN）
    const finalWeight = rank <= dynamicMaxSelections.value
      ? baseWeightUnits * (rankWeights[rank] ?? 0)
      : 0

    groups.push({
      groupId: `virtual_${i}`,
      groupName: `虛擬評論 ${rank}`,
      rank: rank,
      status: 'active',
      memberCount: 1,
      members: [{
        email: `virtual_${i}@placeholder`,
        displayName: `虛擬評論 ${rank}`,
        points: finalWeight * pointsPerWeight,
        contribution: contribution,
        finalWeight: finalWeight,
        rank: rank
      }]
    })
  }

  // 3. 添加用户自己的评论（放在最后）
  if (selectedComments.value.length > 0 && currentUserComment.value && !isCurrentUserInSelected.value) {
    const rank = currentRank++
    const contribution = 100
    const baseWeightUnits = contribution / 5
    // 超出獎勵範圍的評論權重為 0（避免 rankWeights[rank] 為 undefined 導致 NaN）
    const finalWeight = rank <= dynamicMaxSelections.value
      ? baseWeightUnits * (rankWeights[rank] ?? 0)
      : 0

    groups.push({
      groupId: currentUserComment.value.authorEmail || currentUserComment.value.author,
      groupName: currentUserComment.value.author,
      rank: rank,
      status: 'active',
      memberCount: 1,
      members: [{
        email: currentUserComment.value.authorEmail || currentUserComment.value.author,
        displayName: currentUserComment.value.author,
        points: finalWeight * pointsPerWeight,
        contribution: contribution,
        finalWeight: finalWeight,
        rank: rank
      }]
    })
  }

  return groups
})

const currentUserEmail = computed((): string | null => {
  return getCurrentUserEmail()
})

// Vue 3 Best Practice: Use props instead of accessing parent component
const commentReward = computed((): number => {
  return props.commentReward || 500
})

// 动态生成图表提示文字
const chartHintText = computed((): string => {
  const hints: string[] = []

  // 基础说明
  hints.push('您選擇的評論作者將按排名獲得以上點數分配')

  // 如果有虚拟评论
  if (virtualCommentCount.value > 0) {
    hints.push(`目前有 ${virtualCommentCount.value} 個虛擬評論佔位（尚未選滿 ${dynamicMaxSelections.value} 個）`)
  }

  // 如果当前用户有评论但不在选中列表中
  if (currentUserComment.value && !isCurrentUserInSelected.value) {
    hints.push('您的評論會自動排在最後一名（不能給自己投票）')
  }

  return hints.join(' • ')
})

// ========== Methods ==========

function handleClose(): void {
  emit('update:visible', false)
}

async function checkVotingEligibility(): Promise<void> {
  loadingEligibility.value = true
  try {
    if (!props.projectId) {
      votingEligibility.value = { canVote: false, message: '缺少專案ID' }
      return
    }

    const httpResponse = await (rpcClient.comments as any)['voting-eligibility'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      votingEligibility.value = response.data
    } else {
      votingEligibility.value = {
        canVote: false,
        message: response.error?.message || '檢查投票資格失敗'
      }
    }
  } catch (error) {
    console.error('檢查投票資格錯誤:', error)
    votingEligibility.value = { canVote: false, message: '網路錯誤，請重試' }
  } finally {
    loadingEligibility.value = false
  }
}

async function loadStageComments(): Promise<void> {
  try {
    if (!props.projectId) return

    loading.value = true

    const httpResponse = await rpcClient.comments.stage.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        excludeTeachers: true,
        forVoting: true  // 按作者去重，每位作者只保留一篇代表评论
      }
    })
    const response = await httpResponse.json()

    console.log('🔍 [CommentVoteModal Debug] Raw API Response:', response)

    if (response.success && response.data) {
      const allCommentsData = response.data.comments
      console.log('📊 [CommentVoteModal Debug] Total comments received:', allCommentsData.length)
      console.log('📋 [CommentVoteModal Debug] First comment sample:', allCommentsData[0])

      // 檢查有多少評論有 mention（Groups 或 Users）
      const withMentions = allCommentsData.filter((c: any) => c.mentionedGroups || c.mentionedUsers)
      console.log('🏷️  [CommentVoteModal Debug] Comments with mentions:', withMentions.length)
      console.log('🏷️  [CommentVoteModal Debug] mention samples:',
        withMentions.slice(0, 3).map((c: any) => ({
          id: c.commentId,
          mentionedGroups: c.mentionedGroups,
          mentionedUsers: c.mentionedUsers,
          groupsType: typeof c.mentionedGroups,
          usersType: typeof c.mentionedUsers
        }))
      )

      // 轉換為投票需要的格式 - 只顯示符合投票資格的評論
      // 使用後端計算的 canBeVoted 欄位（包含所有資格檢查：非回覆、有 mention、作者是 group member、有 helpful reaction）
      const comments = response.data.comments
        .filter((comment: any) => comment.canBeVoted === true)
        .map((comment: any) => ({
          id: comment.commentId,
          content: comment.content.substring(0, 50) + (comment.content.length > 50 ? '...' : ''),
          fullContent: comment.content,
          author: comment.authorName || comment.authorEmail,
          authorEmail: comment.authorEmail,
          timestamp: comment.createdTime
        }))

      const currentUserEmailValue = getCurrentUserEmail()
      initializeComments(comments)
      buildCommentsMap(comments)
    }
  } catch (error) {
    console.error('載入評論失敗:', error)
    ElMessage.error('載入評論資料失敗')
    initializeComments([])
  } finally {
    loading.value = false
  }
}

function initializeComments(commentsData: Comment[] | null = null): void {
  // Skip clearing if we're loading proposal data or in preview mode (prevents race condition)
  if (isLoadingProposal.value || loadedProposalId.value) {
    console.log('[CommentVoteModal] Skipping initializeComments - loading/preview mode active')
    return
  }

  // 重置狀態
  const comments = commentsData || props.comments

  // 保存原始数据（包含用户自己的评论）
  allCommentsRaw.value = [...comments]

  // 過濾掉自己的評論 - 不允許自投（用于 draggable list）
  const currentUserEmailValue = getCurrentUserEmail()
  const filteredComments = comments.filter(comment => {
    // 檢查評論作者是否為當前用戶
    const commentAuthor = comment.authorEmail || comment.author
    return commentAuthor !== currentUserEmailValue
  })

  allComments.value = [...filteredComments]
  selectedComments.value = []
}

function formatVoteTime(timestamp: string): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

async function submitVote(): Promise<void> {
  if (!canSubmit.value) return

  submitting.value = true

  try {
    // Vue 3 Best Practice: rpcClient automatically handles authentication
    if (!props.projectId) {
      alert('缺少專案ID')
      return
    }

    const rankingData: RankingData[] = selectedComments.value.map((comment, index) => ({
      commentId: comment.id,
      rank: index + 1,
      content: comment.content.substring(0, 100) // For reference
    }))

    const httpResponse = await rpcClient.comments.ranking.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingData: rankingData
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      // 顯示成功訊息
      ElMessage.success('投票已成功提交！')

      // 重新載入版本歷史
      await loadProposalVersions()

      // 自動切換到最新版本以顯示投票結果（進入預覽模式）
      if (proposalVersions.value.length > 0) {
        const latest = proposalVersions.value[proposalVersions.value.length - 1]
        selectedVersionId.value = latest.proposalId
        await loadProposalData(latest.proposalId, true)  // Load into editor (preview mode)
      }

      // 發送事件給父組件（讓父組件刷新其他資料）
      // Note: selectedComments 現在包含剛送出的排名（預覽模式）
      emit('vote-submitted', {
        success: true,
        data: response.data,
        rankedComments: selectedComments.value
      })

      // 不自動關閉 - 讓用戶查看結果後手動關閉
      // handleClose()
    } else {
      alert(`投票失敗：${response.error?.message || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('投票錯誤:', error)
    alert('網路錯誤，請重試')
  } finally {
    submitting.value = false
  }
}

function clearAll(): void {
  // 使用已经加载的真实评论数据，而不是 props.comments 的默认值
  initializeComments(allCommentsRaw.value)
  ElMessage.success('已清除選擇，可重新投票')
}

function exitPreviewMode(): void {
  // Clear all locks and preview state
  isLoadingProposal.value = false
  loadedProposalId.value = null
  selectedComments.value = []
  clearAlerts()
  // Show ranking rules since we're now in edit mode
  showRankingRulesAlert()
  ElMessage.success('已退出檢視模式，可重新編輯投票')
}

// Vue 3 Best Practice: Use props and useAuth() composable
function getCurrentUserEmail(): string | null {
  // 1. 優先從 props 獲取用戶信息
  if (props.user?.userEmail) {
    return props.user.userEmail
  }

  // 2. 從 useAuth() 獲取用戶信息
  if (authUserEmail.value) {
    return authUserEmail.value
  }

  // 3. 降級返回 null
  return null
}

// ========== Version History Methods ==========

async function loadProposalVersions(): Promise<void> {
  isLoadingProposal.value = true  // Set lock to prevent initializeComments from clearing
  try {
    const httpResponse = await (rpcClient.comments as any)['ranking-history'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      proposalVersions.value = response.data.proposals || []

      // Select latest version by default and load into editor (preview mode)
      if (proposalVersions.value.length > 0) {
        const latest = proposalVersions.value[proposalVersions.value.length - 1]
        selectedVersionId.value = latest.proposalId
        await loadProposalData(latest.proposalId, true)  // Load into editor for preview
      }
    }
  } catch (error) {
    console.error('Load proposal versions error:', error)
  } finally {
    isLoadingProposal.value = false  // Release lock
  }
}

async function loadProposalData(proposalId: string, loadToEditor: boolean = false): Promise<void> {
  const proposal = proposalVersions.value.find(p => p.proposalId === proposalId)
  if (!proposal) return

  try {
    // Parse ranking data
    const rankingData = JSON.parse(proposal.rankingData)

    // Enrich with full comment details
    const loadedComments = rankingData.map((item: any) => {
      const comment = allCommentsMap.value.get(item.commentId)
      return {
        ...comment,
        id: item.commentId,
        rank: item.rank
      }
    }).filter((c: any) => c.id).sort((a: any, b: any) => a.rank - b.rank)

    currentProposalComments.value = loadedComments

    // Load into editor for preview mode
    if (loadToEditor) {
      selectedComments.value = [...loadedComments]
      loadedProposalId.value = proposalId

      // Show preview mode alert
      clearAlerts()
      const isLatest = proposalId === proposalVersions.value[proposalVersions.value.length - 1]?.proposalId
      addAlert({
        type: 'info',
        title: isLatest ? '正在檢視最新投票結果' : '正在檢視歷史版本',
        message: '目前為唯讀預覽模式，點擊下方「離開檢視模式」按鈕可重新編輯',
        closable: false,
        autoClose: 0
      })
    }
  } catch (error) {
    console.error('Parse proposal data error:', error)
    currentProposalComments.value = []
  }
}

async function onVersionChange(proposalId: string): Promise<void> {
  selectedVersionId.value = proposalId
  await loadProposalData(proposalId, true)  // Load into editor (preview mode)

  // If viewing old version, also load latest for comparison
  if (isViewingOldVersion.value) {
    const latest = proposalVersions.value[proposalVersions.value.length - 1]
    await loadLatestProposalComments(latest.proposalId)
  }
}

async function loadLatestProposalComments(proposalId: string): Promise<void> {
  const proposal = proposalVersions.value.find(p => p.proposalId === proposalId)
  if (!proposal) return

  try {
    const rankingData = JSON.parse(proposal.rankingData)
    latestProposalComments.value = rankingData.map((item: any) => {
      const comment = allCommentsMap.value.get(item.commentId)
      return {
        ...comment,
        id: item.commentId,
        rank: item.rank
      }
    }).filter((c: any) => c.id).sort((a: any, b: any) => a.rank - b.rank)
  } catch (error) {
    console.error('Parse latest proposal data error:', error)
    latestProposalComments.value = []
  }
}

function buildCommentsMap(comments: Comment[]): void {
  // Build lookup map for quick access
  allCommentsMap.value = new Map(
    comments.map(c => [c.id, c])
  )
}

// ========== Watchers ==========

// 計算有效評論作者數量（用於百分比模式）
function getUniqueAuthorCount(): number {
  const uniqueAuthors = new Set(allCommentsRaw.value.map(c => c.authorEmail || c.author))
  return uniqueAuthors.size
}

// 動態計算可選評論數量（根據模式）
const dynamicMaxSelections = computed((): number => {
  if (props.commentRewardPercentile === 0) {
    // 固定 TopN 模式：直接使用 props.maxSelections
    return props.maxSelections
  } else {
    // 百分比模式：根據有效評論作者數量計算
    const totalAuthors = getUniqueAuthorCount()
    // 如果還沒載入評論，使用 props.maxSelections 作為 fallback
    if (totalAuthors === 0) {
      return props.maxSelections
    }
    return Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
  }
})

// 顯示評論排名規則 alert
function showRankingRulesAlert(): void {
  clearAlerts()

  let rankingTitle: string
  if (props.commentRewardPercentile === 0) {
    rankingTitle = `📊 本專案採用固定排名模式：前 ${props.maxSelections} 名有效評論作者可獲得獎金`
  } else {
    const totalAuthors = getUniqueAuthorCount()
    const qualifiedCount = Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
    rankingTitle = `📊 本專案採用百分比模式：前 ${props.commentRewardPercentile}% 的有效評論作者（也就是 ${totalAuthors} × ${props.commentRewardPercentile}% = ${qualifiedCount} 人）可獲得獎金`
  }

  addAlert({
    type: 'info',
    title: rankingTitle,
    message: '每位作者僅顯示一篇代表評論（以獲得最多支持的為準）。評論須得到起碼一個被您提到的用戶的支持才算有效評論',
    closable: false,
    autoClose: 0
  })
}

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    clearAlerts()  // Clear alerts when opening

    // 唯讀模式提示
    if (isSudoMode.value) {
      const alertMessage = sudoStore.isActive
        ? `您正在以 SUDO 模式查看 ${sudoStore.targetUser?.displayName || '學生'} 的評論投票視角。此模式僅供查看，無法進行任何投票操作。`
        : '目前為檢視模式，僅供查看評論投票紀錄，無法進行任何投票操作。'
      addAlert({
        type: 'info',
        title: '唯讀模式',
        message: alertMessage,
        closable: false,
        autoClose: 0
      })
    }

    // Step 1: 投票需要完整數據，始終調用 API（不依賴父組件可能被分頁的快取數據）
    await loadStageComments()

    // Step 2: Check voting eligibility
    checkVotingEligibility()

    // Step 3: Load proposal versions (will auto-load latest if exists)
    // This sets isLoadingProposal = true, preventing future initializeComments from clearing
    await loadProposalVersions()

    // Step 4: Show appropriate alert (only if no proposal was loaded into preview mode)
    if (!loadedProposalId.value && !isSudoMode.value) {
      showRankingRulesAlert()
    }
  } else {
    clearAlerts()  // Clear alerts when closing
    // Reset loading state when closing
    isLoadingProposal.value = false
  }
})

// 注意：移除了 stageComments 和 comments prop 的 watcher
// 投票需要完整數據，所有評論數據都從 API 獲取，不依賴父組件傳入的可能被分頁的數據
</script>

<style scoped>
/* Drawer body styles inherited from drawer-unified.scss */

.info-banner {
  background: #fff3cd;
  color: #856404;
  padding: 15px 20px;
  margin: 20px 25px;
  border-radius: 6px;
  border: 1px solid #ffeaa7;
  line-height: 1.5;
  font-size: 14px;
  flex-shrink: 0;
}

.eligibility-banner {
  margin: 20px 25px;
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  animation: fadeIn 0.3s ease-out;
  flex-shrink: 0;
}

.eligibility-banner.loading {
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
}

.eligibility-banner.error {
  background: linear-gradient(135deg, #ffebee, #ffcdd2);
  border: 1px solid #f48fb1;
  color: #c62828;
}

.eligibility-banner.success {
  background: linear-gradient(135deg, #e8f5e8, #c8e6c9);
  border: 1px solid #81c784;
  color: #2e7d32;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top: 2px solid #666;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.error-icon, .success-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.error-content, .success-content {
  flex: 1;
}

.error-title, .success-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.error-message, .success-message {
  font-size: 13px;
  margin-bottom: 6px;
}

.error-hint {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #ff9800;
}

.vote-history {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.5);
  padding: 8px;
  margin-top: 8px;
  border-radius: 4px;
  border-left: 3px solid #4caf50;
  color: #1976d2;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 操作按鈕區域 - 固定在底部 */
.drawer-actions {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  background: white;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
  margin-top: auto;
  flex-shrink: 0;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 120px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}

.btn-secondary {
  background: #dc3545;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #c82333;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}

.btn-warning {
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(243, 156, 18, 0.3);
}

/* Version Timeline Section */
.version-timeline-section {
  margin: 20px 25px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 1px solid #e9ecef;
}

.section-header {
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

.section-label i {
  color: #3498db;
}

.version-description {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.version-description > div {
  margin: 2px 0;
}

/* Comment Item in Comparison */
.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 10px;
  cursor: default;
  transition: all 0.2s;
}

.comment-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.comment-item .rank-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.comment-item .comment-content {
  flex: 1;
  min-width: 0;
}

.comment-item .comment-text {
  font-size: 14px;
  color: #2c3e50;
  font-weight: 500;
  margin-bottom: 6px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.comment-item .comment-author {
  font-size: 12px;
  color: #7f8c8d;
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
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 8px;
  color: #856404;
  font-size: 14px;
  text-align: center;
  font-weight: 500;
}

@media (max-width: 768px) {
  .drawer-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }

  .version-timeline-section {
    margin: 15px;
    padding: 15px;
  }

  .point-distribution-section {
    margin-top: 20px;
    padding: 15px;
  }
}
</style>
