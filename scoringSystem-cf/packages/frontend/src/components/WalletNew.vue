<template>
  <div class="wallet-container">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="dropdown-container">
        <!-- Project Dropdown -->
        <el-select
          v-model="selectedProjectId"
          placeholder="選擇專案"
          filterable
          clearable
          class="project-select"
          @change="onProjectChange"
        >
          <el-option
            v-for="project in userProjects"
            :key="project.projectId"
            :label="project.projectName"
            :value="project.projectId"
          >
          </el-option>
        </el-select>

        <!-- User Dropdown (only for Level 0-1: admin/teacher) -->
        <el-select
          v-if="canViewAllUsers && selectedProjectId"
          v-model="selectedUserEmail"
          placeholder="選擇使用者"
          filterable
          clearable
          class="user-select"
          @change="onUserChange"
        >
          <el-option
            v-for="user in projectUsers"
            :key="user.userEmail"
            :label="`${user.displayName || user.userEmail.split('@')[0]} (${user.userEmail})`"
            :value="user.userEmail"
          >
          </el-option>
        </el-select>

        <!-- Project Details Button -->
        <el-button
          v-if="selectedProjectId"
          type="info"
          plain
          class="project-details-btn"
          @click="showProjectDescriptionDialog = true"
        >
          <i class="fa fa-info-circle"></i>
          <span class="btn-text">專案詳情</span>
        </el-button>

        <!-- Refresh Button -->
        <el-button
          v-if="selectedProjectId"
          type="warning"
          size="small"
          :loading="loading"
          class="refresh-button refresh-button-with-progress"
          :style="refreshButtonStyle"
          @click="handleRefresh(); resetTimer()"
        >
          <i class="fa fa-refresh"></i>
          <span class="btn-text">重新整理</span>
        </el-button>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        :project-id="selectedProjectId"
        :permission-level="permissionLevel"
        :wealth-rankings="wealthRankings"
        @user-command="emit('user-command', $event)"
      />
    </div>

    <!-- Wallet Ladder Drawer (非 HUD - 熱帶風格配色) -->
    <PhysicsDrawerContainer
      v-model="walletLadderDrawer.modelValue.value"
      drawer-name="點數天梯"
      theme-color="#E84393"
      :loading="loadingLadder"
      loading-text="載入天梯數據中..."
      :condition="!!selectedProjectId"
      :is-minimized="walletLadderDrawer.isMinimized.value"
      @minimized-hover="walletLadderDrawer.handleMouseEnter"
      @minimized-unhover="walletLadderDrawer.handleMouseLeave"
    >
      <!-- 閾值輸入區域 -->
      <div class="threshold-input-section">
        <label class="threshold-label">
          <i class="fas fa-filter"></i>
          低於 N 點視為 0 分：
        </label>
        <el-input-number
          v-model="zeroScoreThreshold"
          :min="0"
          :step="10"
          :precision="0"
          placeholder="0 = 不啟用"
          class="threshold-input"
        />
        <span class="threshold-hint">
          {{ zeroScoreThreshold > 0 ? `餘額低於 ${zeroScoreThreshold} 點的使用者將獲得 0 分` : '已停用（所有使用者參與百分制計算）' }}
        </span>
      </div>

      <WalletLadder
        v-if="ladderData"
        :ladder-data="ladderData"
        :score-range-min="ladderData.scoreRangeMin || 65"
        :score-range-max="ladderData.scoreRangeMax || 95"
        :current-user-email="user?.userEmail"
        :queried-user-email="selectedUserEmail || undefined"
        :zero-score-threshold="zeroScoreThreshold"
      />
      <EmptyState
        v-else-if="!loadingLadder"
        :icons="['fa-exclamation-triangle']"
        parent-icon="fa-ranking-star"
        title="無法載入天梯數據"
        type="warning"
        :compact="true"
        :enable-animation="false"
      />
    </PhysicsDrawerContainer>

    <!-- Stage Growth Drawer (非 HUD - 熱帶風格配色) -->
    <PhysicsDrawerContainer
      v-model="stageGrowthDrawer.modelValue.value"
      drawer-name="各階段點數成長圖"
      theme-color="#00CED1"
      :loading="loadingStageGrowth"
      loading-text="載入成長數據中..."
      max-height="700px"
      :condition="!!selectedProjectId && !!selectedUserEmail"
      :is-minimized="stageGrowthDrawer.isMinimized.value"
      @minimized-hover="stageGrowthDrawer.handleMouseEnter"
      @minimized-unhover="stageGrowthDrawer.handleMouseLeave"
    >
      <!-- Gantt Chart Section -->
      <div v-if="projectStagesForGrowth && projectStagesForGrowth.length > 0" class="gantt-section">
        <h3 class="chart-section-title">
          <i class="fas fa-calendar-alt"></i>
          專案階段時間軸
        </h3>
        <StageGanttChart
          :stages="projectStagesForGrowth"
          :milestones="[]"
          :enable-drag="true"
          :show-minimap="false"
          :height="180"
          @viewport-change="handleGanttViewportChange"
        />
      </div>

      <!-- Growth Chart Section -->
      <div v-if="stageGrowthData" class="growth-section">
        <h3 class="chart-section-title">
          <i class="fas fa-chart-line"></i>
          各階段點數成長趨勢
        </h3>
        <StageGrowthChart
          :top-user-data="stageGrowthData.topUser"
          :target-user-data="stageGrowthData.targetUser"
          :x-scale-domain="ganttXScaleDomain"
          :stages="projectStagesForGrowth"
        />
      </div>

      <!-- No Data Message -->
      <EmptyState
        v-else-if="!loadingStageGrowth"
        :icons="['fa-exclamation-triangle']"
        parent-icon="fa-chart-line"
        title="無法載入成長數據"
        type="warning"
        :compact="true"
        :enable-animation="false"
      />
    </PhysicsDrawerContainer>

    <!-- Content -->
    <div v-loading="loading || loadingProjects" class="content-wrapper" element-loading-text="載入專案資料中...">
      <!-- Main Content Card -->
      <div v-if="selectedProjectId" class="main-content-card">
        <!-- Header Section -->
        <div class="card-header">
          <div class="left-section">
            <!-- Stage Progress Buttons -->
            <div class="stage-progress-buttons">
              <template v-for="(stageInfo, index) in allStagesWithEarnings" :key="stageInfo.stageId">
                <button class="stage-btn" :class="getStageClass(stageInfo.status)">
                  [{{ stageInfo.stageOrder }}/{{ projectStages.length }}] 階段(+{{ stageInfo.points }})
                </button>
                <i v-if="index < allStagesWithEarnings.length - 1" class="fas fa-chevron-right stage-arrow"></i>
              </template>
            </div>
          </div>
        </div>

        <!-- Transactions Section -->
        <div class="transactions-section">
          <!-- Filters with Points and Buttons (Navy Blue Style) -->
          <!-- Transaction Filters Section -->
          <TransactionFiltersSection
            v-model:date-range="dateRange"
            v-model:points-filter="pointsFilter"
            v-model:description-filter="descriptionFilter"
            v-model:user-filter="userFilter"
            v-model:selected-stage-ids="selectedStageIds"
            v-model:selected-transaction-types="selectedTransactionTypes"
            :can-view-all-users="canViewAllUsers"
            :can-manage-wallets="canManageWallets"
            :selected-user-email="selectedUserEmail"
            :project-users="projectUsers"
            :exporting-grades="exportingGrades"
            :stage-options="stageOptions"
            :transaction-type-options="transactionTypeOptions"
            :has-active-filters="hasActiveFilters"
            :has-transactions="!!(transactions && transactions.length > 0)"
            @clear-filters="clearAllFilters"
            @export-csv="handleExportWalletCSV"
            @export-grades="handleExportProjectGrades"
            @show-award-points="showAwardPointsDrawer = true"
          />

          <!-- Backend Search Mode Indicator -->
          <div v-if="searchMode === 'backend' && totalTransactions > 0" class="search-result-info">
            <el-alert type="success" :closable="false">
              <template #title>
                <i class="fas fa-database"></i>
                後端搜尋完成：找到 {{ totalTransactions }} 筆符合條件的交易記錄
              </template>
            </el-alert>
          </div>

          <!-- Transactions Table (頁面級滾動) -->
          <TransactionTableSection
            :filtered-transactions="filteredTransactions"
            :show-user-column="showUserColumn"
            :can-manage-wallets="canManageWallets"
            :loading="loading || isBackendSearching"
            :is-expanded="isExpanded"
            :is-loading-details="isLoadingDetails"
            :get-transaction-details="getTransactionDetails"
            :check-transaction-reversed="checkTransactionReversed"
            :is-reversing="isReversing"
            @toggle-transaction="handleToggleTransaction"
            @open-reversal="openReversalDrawer"
            @settlement-command="handleSettlementCommand"
          />

          <!-- Loading More Indicator -->
          <div v-if="loadingMore" class="loading-more-indicator">
            <i class="fa fa-spinner fa-spin"></i>
            載入更多交易中...
          </div>

          <!-- Scroll Status Indicator -->
          <div v-if="hasMoreTransactions && !loading && !loadingMore && transactions && transactions.length > 0" class="scroll-hint">
            <span>已載入 {{ transactions.length }} / {{ totalTransactions }} 筆，向下捲動載入更多</span>
          </div>
        </div>
      </div>

      <!-- No Project Selected Message -->
      <EmptyState
        v-else
        :icons="['fa-project-diagram', 'fa-wallet']"
        parent-icon="fa-folder-open"
        title="請選擇一個專案來查看錢包記錄"
        description="使用上方的專案下拉選單選擇您要查看的專案"
      />
    </div>

    <!-- Project Description Dialog -->
    <ProjectDescriptionDialog
      v-model:visible="showProjectDescriptionDialog"
      :project-name="selectedProjectName"
      :project-description="selectedProjectDescription"
    />

    <!-- Transaction Reversal Drawer -->
    <TransactionReversalDrawer
      v-model:visible="showReversalDrawer"
      :transaction="selectedTransaction || undefined"
      :is-reversing="selectedTransaction ? isReversing(selectedTransaction.transactionId) : false"
      @confirm="handleReversalConfirm"
    />

    <!-- Voting Analysis Modal -->
    <VotingAnalysisModal
      v-model:visible="showVotingAnalysisModal"
      :project-id="selectedSettlementData.projectId"
      :stage-id="selectedSettlementData.stageId"
      :stage-title="selectedSettlementData.stageName"
      :is-settled="true"
    />

    <!-- Comment Voting Analysis Modal -->
    <CommentVotingAnalysisModal
      v-model:visible="showCommentAnalysisModal"
      :project-id="selectedSettlementData.projectId"
      :stage-id="selectedSettlementData.stageId"
      :max-comment-selections="selectedSettlementData.maxCommentSelections"
      :stage-title="selectedSettlementData.stageName"
      :is-settled="true"
    />

    <!-- Award Points Drawer -->
    <AwardPointsDrawer
      v-model:visible="showAwardPointsDrawer"
      :project-id="selectedProjectId || ''"
      :project-users="projectUsers"
      :project-groups="projectGroups"
      :user-groups="userGroups"
      :stages="projectStages"
      @success="handleAwardPointsSuccess"
    />

    <!-- Tutorial Drawer -->
    <TutorialDrawer page="wallet" />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Wallet management component (Composition API refactor)
 * 錢包管理組件 (Composition API 重構版本)
 *
 * Phase 4.8 - Linus 標準重構
 * - 使用專注的 composables (單一職責)
 * - 修復響應式問題 (無 triggerRef)
 * - 清晰的關注點分離
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { rpcClient } from '@/utils/rpc-client'
import { handleError, showWarning, showSuccess } from '@/utils/errorHandler'
import type { User, Transaction } from '@/types'
import TopBarUserControls from './TopBarUserControls.vue'
import TransactionFiltersSection from './TransactionFiltersSection.vue'
import TransactionTableSection from './TransactionTableSection.vue'
import PhysicsDrawerContainer from './shared/PhysicsDrawerContainer.vue'
import WalletLadder from './charts/WalletLadder.vue'
import StageGrowthChart from './charts/StageGrowthChart.vue'
import StageGanttChart from './charts/StageGanttChart.vue'
import ProjectDescriptionDialog from './shared/ProjectDescriptionDialog.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import TransactionReversalDrawer from './TransactionReversalDrawer.vue'
import VotingAnalysisModal from './VotingAnalysisModal.vue'
import CommentVotingAnalysisModal from './CommentVotingAnalysisModal.vue'
import AwardPointsDrawer from './shared/AwardPointsDrawer.vue'
import TutorialDrawer from './TutorialDrawer.vue'

// Composables
import { useProjectRole } from '@/composables/useProjectRole'
import { useWalletData, useWalletLeaderboard, useInfiniteWalletTransactions, extractTopWealthRankings, type TransactionFilters } from '@/composables/useWallet'
import { useProjectCore } from '@/composables/useProjectDetail'
import { useTransactionDetailsLoader } from '@/composables/useTransactionLoader'
import { useTransactionFilter } from '@/composables/useTransactionFilter'
import { useExpandableList } from '@/composables/useExpandableList'
import { useTransactionReversal } from '@/composables/useTransactionReversal'
import { useBreadcrumb } from '@/composables/useBreadcrumb'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useCoordinatedDrawer } from '@/composables/useCoordinatedDrawer'
import { useWindowInfiniteScroll } from '@/composables/useWindowInfiniteScroll'

// Utilities
import {
  calculateStagesWithEarnings,
  calculateWalletSummary,
  getStageClass,
  formatTime,
  getTransactionTypeText,
  isTransactionReversed
} from '@/utils/walletHelpers'
import { exportWalletCSV } from '@/utils/csvExport'
import { sanitizeHtml } from '@/utils/sanitize'

// ===== Props & Emits =====
const props = defineProps({
  user: {
    type: Object,
    default: null
  },
  sessionPercentage: {
    type: Number,
    default: 100
  },
  remainingTime: {
    type: Number,
    default: 0
  },
  // Route parameters
  projectId: {
    type: String,
    default: null
  },
  userEmail: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['user-command'])

// ===== Router =====
const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()

// ===== Project Selection State =====
// Use ref for UI binding, sync with route via watchers
const selectedProjectId = ref<string | null>(Array.isArray(route.params.projectId) ? route.params.projectId[0] || null : route.params.projectId || null)
const selectedUserEmail = ref<string | null>(Array.isArray(route.params.userEmail) ? route.params.userEmail[0] || null : route.params.userEmail || null)

const selectedProjectName = ref('')
const selectedProjectDescription = ref('')
const showProjectDescriptionDialog = ref(false)

// ===== Type Definitions =====
interface LadderData {
  scoreRangeMin?: number
  scoreRangeMax?: number
  [key: string]: any
}

interface StageGrowthData {
  topUser?: any
  targetUser?: any
  [key: string]: any
}

// ===== Coordinated Drawers =====
// 使用 useCoordinatedDrawer 來管理抽屜協調（同時只能展開一個）
const walletLadderDrawer = useCoordinatedDrawer({
  id: 'wallet-ladder',
  drawerName: '點數天梯',
  themeColor: '#E84393'
})

const stageGrowthDrawer = useCoordinatedDrawer({
  id: 'wallet-stageGrowth',
  drawerName: '各階段點數成長圖',
  themeColor: '#00CED1'
})

/** Points below this threshold are treated as 0 score (default: 0 = disabled) */
const zeroScoreThreshold = ref(0)

// ===== Stage Growth Drawer Data =====
const stageGrowthData = ref<StageGrowthData | null>(null)
const loadingStageGrowth = ref(false)

// ===== Gantt Chart Sync State =====
const ganttXScaleDomain = ref<unknown[] | undefined>(undefined)
const projectStagesForGrowth = ref<any[]>([])

// ===== Voting Analysis Modal State =====
const showVotingAnalysisModal = ref(false)
const showCommentAnalysisModal = ref(false)
const selectedSettlementData = ref<{
  projectId: string
  stageId: string
  stageName: string
  maxCommentSelections: number
}>({
  projectId: '',
  stageId: '',
  stageName: '',
  maxCommentSelections: 3  // 會在 handleSettlementCommand 中從 projectCoreQuery 獲取實際值
})

// ===== Award Points Drawer State =====
const showAwardPointsDrawer = ref(false)

// ===== Export Loading State =====
const exportingGrades = ref(false)

// ===== Pagination State =====
const pageSize = 50 // Fixed page size for infinite scroll

// ===== Backend Search State =====
const backendFilters = ref<TransactionFilters>({})
const searchMode = ref<'frontend' | 'backend'>('frontend')

// ===== Use Composables =====

// Project Core Data - 加載群組和使用者群組資料 (for Award Points Drawer)
// IMPORTANT: Load this BEFORE useProjectRole to avoid duplicate API requests
// Both composables query the same endpoint, TanStack Query will deduplicate
const projectCoreQuery = useProjectCore(selectedProjectId)
const projectGroups = computed(() => projectCoreQuery.data?.value?.groups || [])
const userGroups = computed(() => projectCoreQuery.data?.value?.userGroups || [])

// Project Role - 檢查權限
// This reuses the cache from projectCoreQuery above (same queryKey)
const { permissionLevel } = useProjectRole(selectedProjectId)

/**
 * Check if current user can view all project users' transaction details
 * Level 0-1 (Admin/Teacher) can view individual user transactions
 * Note: Observers (Level 2) can view aggregated data but not individual user transactions
 */
const canViewAllUsers = computed(() => {
  const level = permissionLevel.value
  return level !== null && level <= 1
})

// Wallet Data - 使用 TanStack Query 加載專案、階段、使用者數據
const {
  projects: userProjects,
  projectsLoading: loadingProjects,
  stages: projectStages,
  users: projectUsers
} = useWalletData(selectedProjectId, selectedUserEmail, canViewAllUsers)

// Transactions - 使用 useInfiniteQuery 實現無限滾動
// 關鍵：使用 useInfiniteQuery 會自動累積所有頁面的資料
const infiniteTransactionsQuery = useInfiniteWalletTransactions(
  selectedProjectId,
  selectedUserEmail,
  { limit: pageSize, filters: backendFilters }
)

// 累積所有已載入頁面的交易
const transactions = computed(() => {
  return infiniteTransactionsQuery.data.value?.pages.flatMap(page => page.transactions) || []
})

// Transaction 載入狀態
const loading = computed(() => infiniteTransactionsQuery.isLoading.value)
const isFetchingMore = computed(() => infiniteTransactionsQuery.isFetchingNextPage.value)

// 總數和是否有更多
const totalTransactions = computed(() => {
  const pages = infiniteTransactionsQuery.data.value?.pages
  return pages?.[0]?.totalCount || 0
})
const hasMoreTransactions = computed(() => infiniteTransactionsQuery.hasNextPage.value ?? false)

// 當前餘額（從第一頁取得）
const currentBalance = computed(() => {
  const pages = infiniteTransactionsQuery.data.value?.pages
  return pages?.[0]?.currentBalance || 0
})

// Wallet Leaderboard - 使用 TanStack Query 自動管理
const leaderboardQuery = useWalletLeaderboard(selectedProjectId)
const loadingLadder = computed(() => leaderboardQuery.isLoading.value)

// 將 TanStack Query 返回的資料轉換為 WalletLadder 組件所需的格式
const ladderData = computed(() => {
  const response = leaderboardQuery.data?.value
  if (!response || !response.walletData || response.walletData.length === 0) return null

  // 從專案設定獲取分數範圍，使用 API 返回值或 65-95 作為備用值
  const projectData = projectCoreQuery.data?.value?.project as any
  const scoreRangeMin = response.scoreRangeMin ?? projectData?.scoreRangeMin ?? 65
  const scoreRangeMax = response.scoreRangeMax ?? projectData?.scoreRangeMax ?? 95

  return {
    hasFullAccess: response.hasFullAccess,
    walletData: response.walletData,
    // Pass global min/max for accurate score estimation (even for students)
    globalMinBalance: response.globalMinBalance,
    globalMaxBalance: response.globalMaxBalance,
    scoreRangeMin,
    scoreRangeMax
  }
})

const wealthRankings = computed(() => {
  const response = leaderboardQuery.data?.value
  if (!response || !response.walletData) return []
  return extractTopWealthRankings(response.walletData)
})

// Transaction Filter - 過濾交易（支援後端搜尋）
const {
  dateRange,
  pointsFilter,
  descriptionFilter,
  userFilter,
  selectedStageIds,
  selectedTransactionTypes,
  filteredTransactions,
  clearFilters,
  hasActiveFilters,
  isBackendSearching
} = useTransactionFilter(transactions, {
  hasMore: hasMoreTransactions,
  onBackendSearch: async (filters) => {
    // 更新後端過濾條件 - 觸發 TanStack Query 重新取得資料
    // useInfiniteQuery 會在 queryKey 變更時自動重置並重新載入第一頁
    backendFilters.value = filters
    searchMode.value = 'backend'
  }
})

// Expandable List - 展開狀態管理
const { toggle: toggleExpansion, isExpanded } = useExpandableList()

// Transaction Details Loader - 加載交易詳情
const { loadDetails, getDetails, isLoading: isLoadingDetails, clearCache: clearDetailsCache } = useTransactionDetailsLoader(selectedProjectId)

// Transaction Reversal - 撤銷交易
// 撤銷成功後刷新 TanStack Query 緩存
const refreshTransactions = async () => {
  await queryClient.invalidateQueries({ queryKey: ['wallet', 'transactions-infinite'] })
}
const {
  showReversalDrawer,
  selectedTransaction,
  openReversalDrawer,
  reverseTransaction,
  isReversing
} = useTransactionReversal(
  selectedProjectId,
  refreshTransactions
)

// Auto-refresh - 自動刷新功能
async function handleRefresh() {
  if (import.meta.env.DEV) {
    console.log('🔄 手動重新整理錢包資料')
  }
  await queryClient.invalidateQueries({ queryKey: ['wallet'] })
  await queryClient.invalidateQueries({ queryKey: ['project', 'core'] })
}

const { progressPercentage, remainingMinutes, resetTimer } = useAutoRefresh(handleRefresh)

// ===== Computed =====

/**
 * 載入更多交易（使用 useInfiniteQuery 的 fetchNextPage）
 */
function loadMoreTransactions() {
  if (infiniteTransactionsQuery.hasNextPage.value && !infiniteTransactionsQuery.isFetchingNextPage.value) {
    infiniteTransactionsQuery.fetchNextPage()
  }
}

// 使用頁面級滾動的無限載入
// isLoading = true 表示初始載入中，isFetchingMore = true 表示正在載入下一頁
const isLoadingAny = computed(() => loading.value || isFetchingMore.value)
const { loadingMore } = useWindowInfiniteScroll(
  hasMoreTransactions,
  isLoadingAny,
  loadMoreTransactions
)

/**
 * Check if current user can manage wallets (reverse transactions, export)
 * Level 0-1 (Global admin/Teacher) can manage wallets
 */
const canManageWallets = computed(() => {
  const level = permissionLevel.value
  return level !== null && level <= 1
})

/**
 * 所有階段與收入信息（按順序排列）
 */
const allStagesWithEarnings = computed(() => {
  return calculateStagesWithEarnings(projectStages.value, transactions.value)
})

/**
 * 階段選項列表（從交易數據中提取）
 * 直接從 transactions 提取唯一階段，無需額外 API 調用
 * 後端已在 /wallets/transactions 中 LEFT JOIN stages 表
 */
const stageOptions = computed(() => {
  if (!transactions.value || !Array.isArray(transactions.value)) {
    return []
  }

  // 提取所有唯一的階段信息（使用 Map 自動去重）
  const stageMap = new Map()

  transactions.value.forEach(t => {
    if (t.stageId && !stageMap.has(t.stageId)) {
      stageMap.set(t.stageId, {
        stageId: t.stageId,
        stageName: t.stageName || '未命名階段',
        stageOrder: t.stageOrder || 0
      })
    }
  })

  // 轉換為數組並按 stageOrder 排序
  return Array.from(stageMap.values())
    .sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
    .map(stage => ({
      value: stage.stageId,
      label: `[${stage.stageOrder}] ${stage.stageName}`
    }))
})

/**
 * 交易類型選項列表（從實際交易中提取唯一值）
 */
const transactionTypeOptions = computed(() => {
  if (!transactions.value || !Array.isArray(transactions.value)) {
    return []
  }

  // 提取所有唯一的 transactionType
  const uniqueTypes = [...new Set(
    transactions.value
      .map(t => t.transactionType)
      .filter(Boolean) // 過濾掉 null/undefined
  )]

  // 映射為選項格式
  return uniqueTypes.map(type => ({
    value: type,
    label: getTransactionTypeText(type) // 使用現有的類型文本轉換函數
  }))
})

// hasActiveFilters 現在從 useTransactionFilter 取得

/**
 * 是否顯示使用者欄位
 * 提取計算屬性避免在模板中重複計算
 * - Teachers without selected user: show column (viewing all users)
 * - Teachers with selected user: hide column (viewing specific user)
 * - Students: hide column (always viewing self)
 */
const showUserColumn = computed(() => {
  // If canViewAllUsers (teacher) and no specific user selected, show column
  return canViewAllUsers.value && !selectedUserEmail.value
})

/**
 * 計算刷新按鈕的樣式
 * 避免每次 progressPercentage 變化都重新創建對象
 */
const refreshButtonStyle = computed(() => ({
  background: `linear-gradient(to right, #EEE 0%, #EEE ${progressPercentage.value}%, #ffffff ${progressPercentage.value}%, #ffffff 100%)`,
  color: '#000'
}))

// ===== Methods =====

/**
 * 清除所有篩選器
 */
function clearAllFilters() {
  clearFilters()
  // 重置後端搜尋狀態
  // useInfiniteQuery 會在 queryKey (包含 filters) 變更時自動重置
  backendFilters.value = {}
  searchMode.value = 'frontend'
}

/**
 * 重置分頁（當專案或使用者變更時）
 * useInfiniteQuery 會在 queryKey (包含 projectId, userId) 變更時自動重置
 */
function resetPagination() {
  loadingMore.value = false
  // 重置後端搜尋狀態
  backendFilters.value = {}
  searchMode.value = 'frontend'
}

/**
 * 當專案選擇改變時
 */
function onProjectChange() {
  // 重置分頁
  resetPagination()

  // 更新專案名稱和描述
  const selectedProject = userProjects.value.find(p => p.projectId === selectedProjectId.value)
  selectedProjectName.value = selectedProject ? selectedProject.projectName : ''
  selectedProjectDescription.value = selectedProject ? (selectedProject.description || '') : ''

  // 根據權限設定用戶選擇
  // 低權限用戶（Level 2-3）自動設定為自己的 email
  // 高權限用戶（Level 0-1）清空以顯示所有用戶
  if (!canViewAllUsers.value) {
    // 低權限用戶：只能查看自己的交易記錄
    selectedUserEmail.value = props.user?.userEmail || null
  } else {
    // 高權限用戶：預設查看所有用戶
    selectedUserEmail.value = null
  }

  // 主動推送路由更新
  if (selectedProjectId.value && selectedProjectId.value !== route.params.projectId) {
    const params: { projectId: string; userEmail?: string } = { projectId: selectedProjectId.value }

    // 包含 userEmail 參數（如果有）
    if (selectedUserEmail.value) {
      params.userEmail = selectedUserEmail.value
    }

    router.push({ name: 'wallets', params })
  } else if (!selectedProjectId.value && route.params.projectId) {
    // Clearing selection - go back to base wallet route
    router.push({ name: 'wallets', params: {} })
  }
}

/**
 * 當使用者選擇改變時
 */
function onUserChange() {
  // 重置分頁
  resetPagination()

  // 防止低權限用戶嘗試查看其他用戶的交易記錄
  if (!canViewAllUsers.value && selectedUserEmail.value !== props.user?.userEmail) {
    showWarning('您沒有權限查看其他使用者的交易記錄')
    selectedUserEmail.value = props.user?.userEmail || null
    return
  }

  // 主動推送路由更新
  if (selectedUserEmail.value !== route.params.userEmail) {
    const params: { projectId: string | null; userEmail?: string } = { projectId: selectedProjectId.value }
    if (selectedUserEmail.value) {
      params.userEmail = selectedUserEmail.value
    }
    router.push({ name: 'wallets', params })
  }
}

/**
 * 載入階段成長圖數據
 */
async function loadStageGrowth() {
  if (!selectedProjectId.value) return

  loadingStageGrowth.value = true

  try {
    const httpResponse = await (rpcClient.wallets as any)['stage-growth'].$post({
      json: {
        projectId: selectedProjectId.value,
        targetUserEmail: selectedUserEmail.value || props.user?.userEmail
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      stageGrowthData.value = response.data
      if (import.meta.env.DEV) {
        console.log('✅ Stage growth data loaded:', response.data)
      }

      // 同時載入專案階段信息（用於繪製分隔線）
      await loadProjectStages()
    } else {
      handleError(response.error?.message || '載入成長數據失敗', { type: 'error' })
      stageGrowthData.value = null
    }
  } catch (err) {
    console.error('Error loading stage growth:', err)
    handleError('載入成長數據時發生錯誤', { type: 'error' })
    stageGrowthData.value = null
  } finally {
    loadingStageGrowth.value = false
  }
}

/**
 * 載入專案階段（用於繪製分隔線）
 */
async function loadProjectStages() {
  try {
    const httpResponse = await rpcClient.stages.list.$post({
      json: {
        projectId: selectedProjectId.value
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      projectStagesForGrowth.value = response.data.stages || []
      if (import.meta.env.DEV) {
        console.log('✅ Project stages loaded for growth chart:', projectStagesForGrowth.value.length)
      }
    }
  } catch (err) {
    console.error('Error loading project stages:', err)
  }
}

/**
 * 處理甘特圖 viewport 變化
 */
function handleGanttViewportChange(data: any) {
  ganttXScaleDomain.value = data.xScale.domain
  if (import.meta.env.DEV) {
    console.log('🔄 Gantt viewport changed:', ganttXScaleDomain.value)
  }
}

/**
 * 導出錢包 CSV
 */
function handleExportWalletCSV() {
  const projectName = selectedProjectName.value || '專案'
  const userDisplay = getCurrentUserDisplay()
  exportWalletCSV(transactions.value, projectName, userDisplay)
}

/**
 * 導出專案成績（含百分等級分數）
 * 使用仿射映射將點數轉換為成績區間
 */
async function handleExportProjectGrades() {
  if (!selectedProjectId.value) {
    showWarning('請先選擇專案')
    return
  }

  try {
    exportingGrades.value = true

    // 呼叫後端 API（傳入 zeroScoreThreshold 以統一成績計算邏輯）
    const httpResponse = await rpcClient.wallets.export.$post({
      json: {
        projectId: selectedProjectId.value,
        zeroScoreThreshold: zeroScoreThreshold.value
      }
    })
    const response = await httpResponse.json()

    if (!response.success) {
      handleError(response.error?.message || '匯出成績失敗')
      return
    }

    const data = response.data as { project: any; users: User[]; scoreRange: any }
    const { project, users, scoreRange } = data
    const projectName = project?.projectName || '專案'

    // 準備 CSV 資料
    const headers = ['學號/使用者ID', '姓名', 'Email', '總點數', '百分等級分數']
    const rows = [
      headers,
      ...users.map((user: User) => {
        const gradeValue = user.grade ? (typeof user.grade === 'number' ? (user.grade as number).toFixed(2) : String(user.grade)) : '0.00'
        return [
          user.userId || '',
          user.displayName || '',
          user.userEmail || '',
          user.totalPoints || 0,
          gradeValue
        ]
      })
    ]

    // 轉換為 CSV 字串（每個欄位用雙引號包覆，處理內部雙引號）
    const csvContent = rows.map(row =>
      row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    // 加入 BOM for Excel UTF-8 support
    const BOM = '\uFEFF'
    const csvWithBOM = BOM + csvContent

    // 建立 Blob 並下載
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `專案成績_${projectName}_${timestamp}.csv`

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)

    showSuccess(`成績匯出完成：${users.length} 位學生（成績區間 ${scoreRange?.min}-${scoreRange?.max}）`)

    if (import.meta.env.DEV) {
      console.log('✅ 成績匯出完成：', {
        users: users.length,
        scoreRange: scoreRange,
        filename: filename
      })
    }
  } catch (error) {
    console.error('Export grades error:', error)
    handleError('匯出成績時發生錯誤')
  } finally {
    exportingGrades.value = false
  }
}

/**
 * 處理撤銷交易確認
 */
async function handleReversalConfirm({ transactionId, reason }: { transactionId: string; reason: string }) {
  await reverseTransaction(transactionId, reason)
}

/**
 * 處理結算分析命令
 * @param {string} command - 'report' 或 'comment'
 * @param {Object} transaction - 交易物件
 */
function handleSettlementCommand(command: string, transaction: Transaction) {
  if (!transaction.stageId || !transaction.settlementId) {
    showWarning('無法載入結算資訊')
    return
  }

  // 從 projectCoreQuery 獲取 maxCommentSelections（必需欄位，無預設值）
  const projectData = projectCoreQuery.data?.value?.project as any
  if (projectData?.maxCommentSelections === undefined || projectData?.maxCommentSelections === null) {
    showWarning('無法載入專案評論配置')
    return
  }

  selectedSettlementData.value = {
    projectId: selectedProjectId.value || '',
    stageId: transaction.stageId,
    stageName: transaction.stageName || '階段',
    maxCommentSelections: projectData.maxCommentSelections
  }

  if (command === 'report') {
    showVotingAnalysisModal.value = true
  } else if (command === 'comment') {
    showCommentAnalysisModal.value = true
  }
}

/**
 * 切換交易展開狀態
 */
function handleToggleTransaction(transaction: Transaction) {
  if (import.meta.env.DEV) {
    console.log('[DEBUG] handleToggleTransaction called with:', {
      transactionId: transaction.transactionId,
      id: transaction.id,
      relatedSubmissionId: transaction.relatedSubmissionId,
      relatedCommentId: transaction.relatedCommentId
    })
  }

  toggleExpansion(transaction.transactionId, () => {
    if (import.meta.env.DEV) {
      console.log('[DEBUG] Expansion callback triggered, calling loadDetails')
    }
    loadDetails(transaction)
  })
}

/**
 * 獲取交易詳情
 */
function getTransactionDetails(transactionId: string) {
  return getDetails(transactionId)
}

/**
 * 檢查交易是否已撤銷
 */
function checkTransactionReversed(transaction: Transaction) {
  return isTransactionReversed(transaction as any, transactions.value as any)
}

/**
 * 取得當前顯示的用戶
 */
function getCurrentUserDisplay() {
  if (canViewAllUsers.value && selectedUserEmail.value) {
    const user = projectUsers.value.find(u => u.userEmail === selectedUserEmail.value)
    return user ? user.displayName : selectedUserEmail.value
  }
  return props.user?.displayName || props.user?.userEmail || '當前用戶'
}

/**
 * 處理用戶命令
 */
function handleUserCommand(command: string) {
  emit('user-command', command)
}

/**
 * Handle award points success
 * Refresh transactions data after awarding points
 */
function handleAwardPointsSuccess() {
  refreshTransactions()
  showAwardPointsDrawer.value = false
}

// ===== Watchers =====

// Debug watchers removed - use browser DevTools in development

/**
 * 同步 route params → ref (支援瀏覽器前進/後退)
 */
watch(
  () => route.params.projectId,
  (newProjectId) => {
    selectedProjectId.value = Array.isArray(newProjectId) ? (newProjectId[0] || null) : (newProjectId || null)
  }
)

watch(
  () => route.params.userEmail,
  (newUserEmail) => {
    selectedUserEmail.value = Array.isArray(newUserEmail) ? (newUserEmail[0] || null) : (newUserEmail || null)
  }
)

/**
 * 監聽專案變化，更新專案名稱和描述
 * Watches both projectId and userProjects to avoid race condition
 */
watch(
  [selectedProjectId, () => userProjects.value],
  ([newProjectId, projects]) => {
    if (newProjectId && projects && projects.length > 0) {
      const selectedProject = projects.find(p => p.projectId === newProjectId)
      if (selectedProject) {
        selectedProjectName.value = selectedProject.projectName || ''
        selectedProjectDescription.value = selectedProject.description || ''
      }
    }
  }
)

/**
 * 財富排名資料現在由 TanStack Query 自動管理（useWalletLeaderboard）
 * 無需手動 watch 和 API 調用
 */

/**
 * 監聽 Stage Growth 抽屜打開事件，自動加載數據
 * 修復：loadStageGrowth 原本只在 toggleStageGrowth 中調用，
 * 但 toggleStageGrowth 從未被使用，導致抽屜打開時無資料
 */
watch(() => stageGrowthDrawer.isExpanded.value, (newValue) => {
  if (newValue && !stageGrowthData.value && !loadingStageGrowth.value) {
    loadStageGrowth()
  }
})

/**
 * 監聽過濾條件清除，重置為前端模式
 * useInfiniteQuery 會在 queryKey (包含 filters) 變更時自動重置
 */
watch(hasActiveFilters, (hasFilters) => {
  if (!hasFilters && searchMode.value === 'backend') {
    backendFilters.value = {}
    searchMode.value = 'frontend'
  }
})

// Additional debug watchers removed

// ===== Lifecycle =====
const { setPageTitle, clearProjectTitle } = useBreadcrumb()

onMounted(() => {
  if (import.meta.env.DEV) {
    console.log('🔧 [WalletNew] Component mounted')
  }

  // Set page title using composable
  setPageTitle('錢包')
  clearProjectTitle()

  // 如果有路由參數中的專案 ID，從已載入的專案列表中取得專案資訊
  // TanStack Query 會自動處理所有資料載入，不需要手動呼叫 onProjectChange
  if (selectedProjectId.value) {
    const project = userProjects.value.find(p => p.projectId === selectedProjectId.value)
    if (project) {
      selectedProjectName.value = project.projectName || ''
      selectedProjectDescription.value = project.description || ''
    }
  }
})

onUnmounted(() => {
  if (import.meta.env.DEV) {
    console.log('🧹 [WalletNew] Component unmounting, clearing caches')
  }
  // Clear transaction details cache to prevent memory leaks
  clearDetailsCache()
})
</script>

<style scoped>
.wallet-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.top-bar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.dropdown-container {
  display: flex;
  gap: 15px;
  align-items: center;
  flex: 1;
  max-width: 600px;
  margin-right: 20px;
}

.project-select,
.user-select {
  min-width: 200px;
}

.project-select .el-input__wrapper,
.user-select .el-input__wrapper {
  border: 2px solid #e1e8ed;
  border-radius: 6px;
}

.project-select .el-input__wrapper:hover,
.user-select .el-input__wrapper:hover {
  border-color: #409eff;
}

.project-select .el-input__wrapper.is-focus,
.user-select .el-input__wrapper.is-focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.project-details-btn {
  white-space: nowrap;
}

.project-details-btn i {
  margin-right: 5px;
}

.refresh-button {
  font-size: 13px;
  height: 28px;
  padding: 0 12px;
}

.refresh-button i {
  margin-right: 4px;
}

.refresh-button-with-progress {
  transition: all 0.3s ease;
  border: 1px solid #dcdfe6 !important;
  font-weight: 500;
}

.refresh-button-with-progress:hover {
  border-color: #000 !important;
  opacity: 0.8;
}

.refresh-button-with-progress i {
  margin-right: 4px;
  color: inherit;
}

.content-wrapper {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.section-title {
  font-size: 24px;
  color: #2c3e50;
  margin-bottom: 20px;
}

.projects-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.transactions-section {
  padding: 20px;
}

.no-project-selected {
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;
}

.no-project-selected i {
  font-size: 48px;
  margin-bottom: 20px;
  color: #bdc3c7;
}

.no-project-selected h3 {
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.no-project-selected p {
  margin: 0;
}

/* Card styles */

.no-transactions i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #bdc3c7;
}

.no-transactions p {
  margin: 0;
  font-size: 16px;
}

/* 主要內容卡片 */
.main-content-card {
  background: white;
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}

/* 卡片標題區域 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  border-bottom: 1px solid #e1e8ed;
}

.left-section {
  flex: 1;
}

/* 專案標題 */
.project-title {
  font-size: 20px;
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
}

/* 專案描述 */
.project-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
  line-height: 1.4;
}

/* 階段进度按钮 */
.stage-progress-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.stage-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.stage-btn.stage-completed {
  background: #6c757d;
  border-color: #6c757d;
  color: white;
  font-weight: bold;
}

.stage-btn.stage-active {
  background: #28a745;
  border-color: #28a745;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.stage-btn.stage-voting {
  background: #dc3545;
  border-color: #dc3545;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

.stage-btn.stage-pending {
  background: #ffc107;
  border-color: #ffc107;
  color: white;
  font-weight: bold;
}

.stage-arrow {
  color: #6c757d;
  font-size: 12px;
}

/* 動作按鈕 */
.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.export-btn {
  background: #28a745;
  color: white;
}

.export-btn:hover {
  background: #218838;
}

.export-project-btn {
  background: #dc3545;
  color: white;
}

.export-project-btn:hover {
  background: #c82333;
}

.export-project-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.8;
}

.export-project-btn:disabled:hover {
  background: #6c757d;
}

/* Wallet Ladder Drawer */
/* Chart Section Styles (kept for drawer content) */
.gantt-section {
  margin-bottom: 30px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.growth-section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.chart-section-title {
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 10px;
}

.chart-section-title i {
  color: #667eea;
  font-size: 18px;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .filters-container {
    flex-direction: column;
    align-items: stretch;
  }

  .filters-right {
    width: 100%;
  }

  .action-buttons {
    flex-direction: row;
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .wallet-filters-navy .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .wallet-filters-navy .filter-item {
    flex-direction: column;
    align-items: flex-start;
    min-width: 100%;
  }

  .wallet-filters-navy .filter-item label {
    min-width: auto;
  }

  .wallet-filters-navy .display-slider {
    width: 100%;
  }

  .filters-container {
    flex-direction: column;
    align-items: stretch;
  }

  .filters-left,
  .filters-right {
    width: 100%;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }

  .action-buttons {
    width: 100%;
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }

  .stage-progress-buttons {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .stage-btn {
    width: 100%;
  }

  .stage-arrow {
    transform: rotate(90deg);
  }
}

/* User Column (conditional) */
.user-cell {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Related Content Column - now contains settlement dropdown + action buttons */
.related-content {
  white-space: nowrap;
  display: flex;
  gap: 5px;
  align-items: center;
}

.related-content .btn-sm {
  font-size: 12px;
  padding: 4px 8px;
}

.related-content :deep(.el-dropdown) {
  display: inline-block;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover {
  background: #138496;
}

/* Portrait mode: Hide TopBarUserControls in top-bar (moved to sidebar) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  /* 為漢堡按鈕留出左側空間 */
  .top-bar {
    padding-left: 60px;
  }

  .top-bar :deep(.user-controls) {
    display: none !important;
  }

  /* 直屏模式下隱藏按鈕文字，只顯示圖示 */
  .project-details-btn .btn-text,
  .refresh-button .btn-text {
    display: none;
  }

  .project-details-btn i,
  .refresh-button i {
    margin-right: 0;
  }
}

/* Threshold Input Section */
.threshold-input-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 20px;
  background: linear-gradient(135deg, #fff5f8 0%, #fff 100%);
  border: 1px solid #E84393;
  border-radius: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.threshold-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.threshold-label i {
  color: #E84393;
}

.threshold-input {
  width: 140px;
}

.threshold-hint {
  font-size: 13px;
  color: #666;
  flex: 1;
  min-width: 200px;
}

@media (max-width: 768px) {
  .threshold-input-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .threshold-hint {
    min-width: auto;
  }
}


/* Loading More Indicator */
.loading-more-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: #409eff;
  font-size: 14px;
}

.loading-more-indicator i {
  font-size: 16px;
}

/* Scroll Hint */
.scroll-hint {
  text-align: center;
  padding: 15px;
  color: #909399;
  font-size: 13px;
  border-top: 1px solid #e1e8ed;
  margin-top: 10px;
}

/* Backend Search Result Info */
.search-result-info {
  margin-bottom: 15px;
}

.search-result-info :deep(.el-alert__title) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-result-info i {
  color: #67c23a;
}
</style>
