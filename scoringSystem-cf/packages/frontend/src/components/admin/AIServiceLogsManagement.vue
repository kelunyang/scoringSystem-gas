<template>
  <div class="ai-service-logs-management">
    <!-- Unified Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :loading="loading"
      :active-filter-count="activeFilterCount"
      :expanded-filter-count="2"
      :export-data="exportConfig.data"
      :export-filename="exportConfig.filename"
      :export-headers="exportConfig.headers"
      :export-row-mapper="exportConfig.rowMapper"
      @reset-filters="resetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">搜尋：</span>
          <el-input
            v-model="filters.searchText"
            placeholder="搜尋 Provider、請求者、專案 ID..."
            clearable
            style="width: 300px;"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">服務類型：</span>
          <el-select v-model="filters.serviceType" style="width: 180px;">
            <el-option label="全部類型" value="all" />
            <el-option label="直接排名" value="ranking_direct" />
            <el-option label="BT 配對" value="ranking_bt" />
            <el-option label="Multi-Agent" value="ranking_multi_agent" />
            <el-option label="摘要" value="summary" />
            <el-option label="翻譯" value="translation" />
            <el-option label="回饋" value="feedback" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">狀態：</span>
          <el-select v-model="filters.statusFilter" style="width: 150px;">
            <el-option label="全部狀態" value="all" />
            <el-option label="處理中" value="processing" />
            <el-option label="成功" value="success" />
            <el-option label="失敗" value="failed" />
            <el-option label="超時" value="timeout" />
          </el-select>
        </div>
      </template>

      <!-- Expanded Filters (Collapsible) -->
      <template #filters-expanded>
        <div class="filter-item">
          <span class="filter-label">排名類型：</span>
          <el-select v-model="filters.rankingType" style="width: 150px;">
            <el-option label="全部" value="all" />
            <el-option label="作品排名" value="submission" />
            <el-option label="評論排名" value="comment" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">日期範圍：</span>
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="開始日期"
            end-placeholder="結束日期"
            style="width: 380px;"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">顯示數量：</span>
          <el-slider
            v-model="filters.displayLimit"
            :min="10"
            :max="500"
            :step="10"
            :marks="{
              10: '10',
              100: '100',
              250: '250',
              500: '500'
            }"
            style="width: 300px;"
          />
        </div>
      </template>
    </AdminFilterToolbar>

    <!-- Statistics Card -->
    <el-card class="stats-card" v-if="statistics">
      <el-row :gutter="20">
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總請求數" :value="statistics.total || 0" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="成功" :value="getSuccessCount()" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="失敗" :value="getFailedCount()" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總 Token" :value="statistics.totalTokens || 0" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="平均回應時間(ms)" :value="statistics.avgResponseTime ? Math.round(statistics.avgResponseTime) : 0" />
        </el-col>
        <el-col v-if="hasActiveFilters" :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="搜尋結果" :value="filteredLogs.length" />
        </el-col>
      </el-row>
    </el-card>

    <!-- AI Service Logs Table -->
    <div class="table-container">
      <div
        v-loading="loading"
        element-loading-text="載入 AI 紀錄中..."
      >
      <table class="ai-logs-table" role="table" aria-label="AI 服務紀錄列表">
        <thead>
          <tr role="row">
            <th width="40" scope="col"></th>
            <th scope="col">類型</th>
            <th scope="col">狀態</th>
            <th scope="col">Provider</th>
            <th scope="col">Token</th>
            <th scope="col">回應時間</th>
            <th scope="col">請求者</th>
            <th scope="col">請求時間</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in displayedLogs" :key="log.callId">
            <ExpandableTableRow
              :is-expanded="expandedLogId === log.callId"
              :expansion-colspan="8"
              :enable-responsive-rows="true"
              :actions-colspan="4"
              @toggle-expansion="handleToggleExpansion(log)"
            >
              <!-- 橫屏模式：單行顯示所有欄位 -->
              <template #main="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td>
                  <el-tag size="small" :class="getServiceTypeClass(log.serviceType)">
                    {{ getServiceTypeText(log.serviceType) }}
                  </el-tag>
                </td>
                <td>
                  <el-tooltip :content="getStatusText(log.status)" placement="top">
                    <i
                      class="status-icon"
                      :class="getStatusIcon(log.status)"
                      :style="{ color: getStatusColor(log.status) }"
                    ></i>
                  </el-tooltip>
                </td>
                <td>
                  <span class="provider-count">{{ getProviderCount(log) }}</span>
                </td>
                <td>{{ formatTokens(log.totalTokens) }}</td>
                <td>{{ formatDuration(log.responseTimeMs) }}</td>
                <td class="email-cell">{{ log.userEmail }}</td>
                <td>{{ formatTime(log.createdAt) }}</td>
              </template>

              <!-- 豎屏模式：資訊行 -->
              <template #info="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td colspan="3">
                  <div class="info-row-content">
                    <el-tag size="small" :class="getServiceTypeClass(log.serviceType)">
                      {{ getServiceTypeText(log.serviceType) }}
                    </el-tag>
                    <el-tooltip :content="getStatusText(log.status)" placement="top">
                      <i
                        class="status-icon"
                        :class="getStatusIcon(log.status)"
                        :style="{ color: getStatusColor(log.status) }"
                      ></i>
                    </el-tooltip>
                    <span class="stat-item">
                      <i class="fas fa-server"></i> {{ getProviderCount(log) }}
                    </span>
                    <span class="stat-item">
                      <i class="fas fa-coins"></i> {{ formatTokens(log.totalTokens) }}
                    </span>
                    <span class="stat-item">
                      <i class="fas fa-clock"></i> {{ formatDuration(log.responseTimeMs) }}
                    </span>
                  </div>
                </td>
              </template>

              <!-- 豎屏模式：操作行 -->
              <template #actions>
                <span class="email-text">{{ log.userEmail }}</span>
                <span class="time-text">{{ formatTime(log.createdAt) }}</span>
              </template>

              <!-- 展開區域：詳細資訊 -->
              <template #default>
                <div class="ai-log-expanded-detail" v-loading="loadingDetail && expandedLogId === log.callId">
                  <template v-if="expandedLogDetails.log">
                    <!-- Basic Info -->
                    <div class="detail-section">
                      <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
                      <div class="detail-grid">
                        <div class="detail-item">
                          <label>呼叫 ID</label>
                          <div class="detail-value monospace">{{ expandedLogDetails.log.callId }}</div>
                        </div>
                        <div class="detail-item">
                          <label>Provider</label>
                          <div class="detail-value">{{ expandedLogDetails.log.providerName }}</div>
                        </div>
                        <div class="detail-item">
                          <label>模型</label>
                          <div class="detail-value">{{ expandedLogDetails.log.model }}</div>
                        </div>
                        <div class="detail-item">
                          <label>服務類型</label>
                          <div class="detail-value">
                            <el-tag size="small" :class="getServiceTypeClass(expandedLogDetails.log.serviceType)">
                              {{ getServiceTypeText(expandedLogDetails.log.serviceType) }}
                            </el-tag>
                          </div>
                        </div>
                        <div class="detail-item">
                          <label>排名類型</label>
                          <div class="detail-value">
                            {{ expandedLogDetails.log.rankingType === 'submission' ? '作品排名' : expandedLogDetails.log.rankingType === 'comment' ? '評論排名' : '-' }}
                          </div>
                        </div>
                        <div class="detail-item">
                          <label>請求者</label>
                          <div class="detail-value">{{ expandedLogDetails.log.userEmail }}</div>
                        </div>
                        <div class="detail-item">
                          <label>專案 ID</label>
                          <div class="detail-value monospace">{{ expandedLogDetails.log.projectId }}</div>
                        </div>
                        <div class="detail-item">
                          <label>階段 ID</label>
                          <div class="detail-value monospace">{{ expandedLogDetails.log.stageId || '-' }}</div>
                        </div>
                        <div class="detail-item">
                          <label>處理項目數</label>
                          <div class="detail-value">{{ expandedLogDetails.log.itemCount || '-' }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- Performance & Cost -->
                    <div class="detail-section">
                      <h4><i class="fas fa-chart-line"></i> 效能與成本</h4>
                      <div class="detail-grid">
                        <div class="detail-item">
                          <label>狀態</label>
                          <div class="detail-value">
                            <i
                              :class="getStatusIcon(expandedLogDetails.log.status)"
                              :style="{ color: getStatusColor(expandedLogDetails.log.status) }"
                            ></i>
                            {{ getStatusText(expandedLogDetails.log.status) }}
                          </div>
                        </div>
                        <div class="detail-item">
                          <label>請求 Token</label>
                          <div class="detail-value">{{ formatTokens(expandedLogDetails.log.requestTokens) }}</div>
                        </div>
                        <div class="detail-item">
                          <label>回應 Token</label>
                          <div class="detail-value">{{ formatTokens(expandedLogDetails.log.responseTokens) }}</div>
                        </div>
                        <div class="detail-item">
                          <label>總 Token</label>
                          <div class="detail-value token-highlight">{{ formatTokens(expandedLogDetails.log.totalTokens) }}</div>
                        </div>
                        <div class="detail-item">
                          <label>回應時間</label>
                          <div class="detail-value">{{ formatDuration(expandedLogDetails.log.responseTimeMs) }}</div>
                        </div>
                        <div class="detail-item">
                          <label>建立時間</label>
                          <div class="detail-value">{{ formatTime(expandedLogDetails.log.createdAt) }}</div>
                        </div>
                        <div class="detail-item">
                          <label>完成時間</label>
                          <div class="detail-value">{{ formatTime(expandedLogDetails.log.completedAt) }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- Custom Prompt -->
                    <div class="detail-section" v-if="expandedLogDetails.log.customPrompt">
                      <h4><i class="fas fa-comment-alt"></i> 自訂 Prompt</h4>
                      <div class="content-display">
                        {{ expandedLogDetails.log.customPrompt }}
                      </div>
                    </div>

                    <!-- Result Section -->
                    <div class="detail-section" v-if="expandedLogDetails.log.result">
                      <h4><i class="fas fa-list-ol"></i> 排名結果</h4>
                      <div class="content-display">
                        <MdPreviewWrapper :content="jsonToMarkdown(expandedLogDetails.log.result)" />
                      </div>
                    </div>

                    <!-- AI Reason -->
                    <div class="detail-section" v-if="expandedLogDetails.log.reason">
                      <h4><i class="fas fa-lightbulb"></i> AI 解釋</h4>
                      <div class="content-display">
                        {{ expandedLogDetails.log.reason }}
                      </div>
                    </div>

                    <!-- Thinking Process -->
                    <div class="detail-section" v-if="expandedLogDetails.log.thinkingProcess">
                      <h4>
                        <i class="fas fa-brain"></i> 思考過程
                        <el-tag size="small" type="info" style="margin-left: 10px;">DeepSeek Reasoning</el-tag>
                      </h4>
                      <el-collapse>
                        <el-collapse-item title="展開思考過程" name="thinking">
                          <div class="content-display thinking-content">
                            {{ expandedLogDetails.log.thinkingProcess }}
                          </div>
                        </el-collapse-item>
                      </el-collapse>
                    </div>

                    <!-- BT Mode Section -->
                    <div class="detail-section" v-if="expandedLogDetails.log.serviceType === 'ranking_bt' && expandedLogDetails.log.btComparisons">
                      <h4><i class="fas fa-balance-scale"></i> BT 配對比較</h4>
                      <div class="bt-comparisons">
                        <div
                          v-for="(comparison, index) in parseBTComparisons(expandedLogDetails.log.btComparisons)"
                          :key="index"
                          class="bt-comparison-item"
                        >
                          <span class="comparison-index">#{{ index + 1 }}</span>
                          <span class="comparison-items">{{ comparison.itemA }} vs {{ comparison.itemB }}</span>
                          <span class="comparison-winner">勝者: {{ comparison.winner }}</span>
                          <span class="comparison-reason" v-if="comparison.reason">{{ comparison.reason }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- BT Strength Params -->
                    <div class="detail-section" v-if="expandedLogDetails.log.serviceType === 'ranking_bt' && expandedLogDetails.log.btStrengthParams">
                      <h4><i class="fas fa-chart-bar"></i> BT 能力值</h4>
                      <div class="content-display">
                        <MdPreviewWrapper :content="jsonToMarkdown(expandedLogDetails.log.btStrengthParams)" />
                      </div>
                    </div>

                    <!-- Multi-Agent Section -->
                    <div class="detail-section" v-if="expandedLogDetails.log.serviceType === 'ranking_multi_agent'">
                      <h4><i class="fas fa-users"></i> Multi-Agent 辯論詳情</h4>
                      <div class="detail-grid">
                        <div class="detail-item">
                          <label>辯論輪次</label>
                          <div class="detail-value">{{ expandedLogDetails.log.debateRound || '-' }}</div>
                        </div>
                        <div class="detail-item">
                          <label>立場變化</label>
                          <div class="detail-value">
                            <el-tag :type="expandedLogDetails.log.debateChanged ? 'warning' : 'success'" size="small">
                              {{ expandedLogDetails.log.debateChanged ? '已變更' : '堅持原立場' }}
                            </el-tag>
                          </div>
                        </div>
                      </div>
                      <div class="detail-item" v-if="expandedLogDetails.log.debateCritique" style="margin-top: 15px;">
                        <label>辯論評論</label>
                        <div class="content-display">{{ expandedLogDetails.log.debateCritique }}</div>
                      </div>
                    </div>

                    <!-- Child Calls -->
                    <div class="detail-section" v-if="expandedLogDetails.childCalls && expandedLogDetails.childCalls.length > 0">
                      <h4><i class="fas fa-sitemap"></i> 子請求 ({{ expandedLogDetails.childCalls.length }})</h4>
                      <div class="child-calls-list">
                        <div
                          v-for="child in expandedLogDetails.childCalls"
                          :key="child.callId"
                          class="child-call-item"
                          @click="expandChildLog(child)"
                        >
                          <span class="child-provider">{{ child.providerName }}</span>
                          <span class="child-round" v-if="child.debateRound">Round {{ child.debateRound }}</span>
                          <span class="child-status" :style="{ color: getStatusColor(child.status) }">
                            {{ getStatusText(child.status) }}
                          </span>
                          <span class="child-tokens">{{ formatTokens(child.totalTokens) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Parent Call -->
                    <div class="detail-section" v-if="expandedLogDetails.parentCall">
                      <h4><i class="fas fa-level-up-alt"></i> 父請求</h4>
                      <div class="parent-call-info" @click="expandChildLog(expandedLogDetails.parentCall!)">
                        <span class="parent-id">{{ expandedLogDetails.parentCall.callId }}</span>
                        <span class="parent-status" :style="{ color: getStatusColor(expandedLogDetails.parentCall.status) }">
                          {{ getStatusText(expandedLogDetails.parentCall.status) }}
                        </span>
                      </div>
                    </div>

                    <!-- Error Info -->
                    <div class="detail-section" v-if="expandedLogDetails.log.status === 'failed' || expandedLogDetails.log.status === 'timeout'">
                      <h4><i class="fas fa-exclamation-triangle"></i> 錯誤資訊</h4>
                      <div class="content-display error-message">
                        {{ expandedLogDetails.log.errorMessage || '未記錄錯誤訊息' }}
                      </div>
                    </div>
                  </template>
                </div>
              </template>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <EmptyState
        v-if="filteredLogs.length === 0 && !loading"
        parent-icon="fa-robot"
        :icons="['fa-brain']"
        title="沒有找到符合條件的 AI 紀錄"
        :enable-animation="false"
      />

      <!-- 🆕 移除自動搜尋提示，因為現在 filter 變化會直接觸發後端搜尋 -->

      <!-- Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more">
        <i class="el-icon-loading"></i>
        <span>載入更多紀錄...</span>
      </div>

      <!-- Show count info -->
      <div v-if="displayedLogs.length > 0" class="count-info">
        顯示 {{ displayedLogs.length }} / {{ totalCount }} 筆 AI 紀錄
        <span v-if="hasMore" class="has-more-hint">（滾動載入更多）</span>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, inject, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDebounceFn } from '@vueuse/core'
import { useWindowInfiniteScroll } from '@/composables/useWindowInfiniteScroll'
import { adminApi } from '@/api/admin'
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { jsonToMarkdown } from '@/utils/json-preview'
import type {
  AIServiceLog,
  AIServiceType,
  AIServiceStatus,
  AIRankingType,
  AIServiceStatisticsResponse
} from '@repo/shared/types/admin'

// ================== Instance & Global ==================

const route = useRoute()
const router = useRouter()

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// ================== State ==================

const logs = ref<(AIServiceLog & { selected?: boolean })[]>([])
const statistics = ref<AIServiceStatisticsResponse | null>(null)
const loading = ref<boolean>(false)

// Server pagination state
const BATCH_SIZE = 50
const totalCount = ref<number>(0)
const currentOffset = ref<number>(0)
const hasMore = computed(() => logs.value.length < totalCount.value)
const autoSearchingBackend = ref<boolean>(false)

// Expanded row state
const expandedLogId = ref<string | null>(null)
const expandedLogDetails = ref<{
  log: AIServiceLog | null
  childCalls: AIServiceLog[]
  parentCall: AIServiceLog | null
}>({ log: null, childCalls: [], parentCall: null })
const loadingDetail = ref<boolean>(false)

// Filters (persisted to localStorage)
const { filters, isLoaded: filtersLoaded } = useFilterPersistence('aiServiceLogsManagement', {
  searchText: '',
  serviceType: 'all' as string,
  statusFilter: 'all' as string,
  rankingType: 'all' as string,
  dateRange: null as [Date, Date] | null,
  displayLimit: 100
})

// Infinite scroll
const displayCount = ref<number>(50)

// ================== Computed Properties ==================

const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.searchText) count++
  if (filters.value.serviceType && filters.value.serviceType !== 'all') count++
  if (filters.value.statusFilter && filters.value.statusFilter !== 'all') count++
  if (filters.value.rankingType && filters.value.rankingType !== 'all') count++
  if (filters.value.dateRange) count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0)

const filteredLogs = computed(() => {
  let filtered = logs.value

  // Text search
  if (filters.value.searchText) {
    const search = filters.value.searchText.toLowerCase()
    filtered = filtered.filter(l =>
      l.providerName.toLowerCase().includes(search) ||
      l.userEmail.toLowerCase().includes(search) ||
      l.projectId.toLowerCase().includes(search) ||
      (l.model && l.model.toLowerCase().includes(search))
    )
  }

  // Service type filter
  if (filters.value.serviceType !== 'all') {
    filtered = filtered.filter(l => l.serviceType === filters.value.serviceType)
  }

  // Status filter
  if (filters.value.statusFilter !== 'all') {
    filtered = filtered.filter(l => l.status === filters.value.statusFilter)
  }

  // Ranking type filter
  if (filters.value.rankingType !== 'all') {
    filtered = filtered.filter(l => l.rankingType === filters.value.rankingType)
  }

  // Date range filter
  if (filters.value.dateRange && filters.value.dateRange.length === 2) {
    const start = filters.value.dateRange[0]
    const end = filters.value.dateRange[1]
    if (start instanceof Date && end instanceof Date) {
      const startTime = start.getTime()
      const endTime = end.getTime()
      filtered = filtered.filter(l => l.createdAt >= startTime && l.createdAt <= endTime)
    }
  }

  // 注意：不再在這裡做 displayLimit 切片
  // 分頁由 displayedLogs + displayCount 控制（infinite scroll）
  return filtered
})

const displayedLogs = computed(() => {
  return filteredLogs.value.slice(0, displayCount.value)
})

// 🆕 canLoadMore 計算（用於無限滾動）
const canLoadMore = computed(() => {
  return displayedLogs.value.length < filteredLogs.value.length || hasMore.value
})

// 🆕 loadingMore 狀態（用於 loadAIServiceLogs 和 useWindowInfiniteScroll）
// 必須在 loadAIServiceLogs 之前定義，避免 hoisting 問題
const loadingMore = ref(false)

// Export configuration
const exportConfig = computed(() => ({
  data: filteredLogs.value as unknown as Record<string, unknown>[],
  filename: 'AI服務紀錄',
  headers: ['類型', 'Provider 數量', '請求者', '請求時間'],
  rowMapper: (item: Record<string, unknown>) => {
    const log = item as unknown as AIServiceLog
    return [
      getServiceTypeText(log.serviceType),
      getProviderCount(log),
      log.userEmail,
      new Date(log.createdAt).toLocaleString('zh-TW')
    ] as (string | number)[]
  }
}))

// ================== Watchers ==================

// 🆕 後端搜尋函數（提取出來方便 onMounted 呼叫）
const searchWithBackendFilters = async () => {
  console.log('🤖 [Backend Search] Triggering with filters...')

  // Build query filters for backend search
  const queryFilters: Record<string, unknown> = {
    limit: BATCH_SIZE,
    offset: 0
  }

  // Add search text
  if (filters.value.searchText) {
    queryFilters.search = filters.value.searchText
  }

  // Add service type filter
  if (filters.value.serviceType && filters.value.serviceType !== 'all') {
    queryFilters.serviceType = filters.value.serviceType
  }

  // Add status filter
  if (filters.value.statusFilter && filters.value.statusFilter !== 'all') {
    queryFilters.status = filters.value.statusFilter
  }

  // Add ranking type filter
  if (filters.value.rankingType && filters.value.rankingType !== 'all') {
    queryFilters.rankingType = filters.value.rankingType
  }

  // Add date range filter
  if (filters.value.dateRange && filters.value.dateRange.length === 2) {
    const start = filters.value.dateRange[0]
    const end = filters.value.dateRange[1]
    if (start instanceof Date && end instanceof Date) {
      queryFilters.startDate = start.getTime()
      queryFilters.endDate = end.getTime()
    }
  }

  console.log('🤖 [Backend Search] Query filters:', queryFilters)

  loading.value = true
  try {
    const response = await adminApi.aiServiceLogs.query({ filters: queryFilters })

    if (response.success && response.data) {
      logs.value = response.data.logs || []
      totalCount.value = response.data.totalCount || logs.value.length
      currentOffset.value = logs.value.length
      displayCount.value = logs.value.length
    }
  } catch (error) {
    console.error('Backend search failed:', error)
  } finally {
    loading.value = false
  }
}

// 🆕 直接監聽 filter 變化（取代原本的間接觸發）
const debouncedFilterChange = useDebounceFn(async () => {
  // 正在載入中，不要再觸發
  if (loading.value || loadingMore.value) return

  // 重設 displayCount
  displayCount.value = 50

  // 🆕 有 filter 時，直接觸發後端搜尋
  if (hasActiveFilters.value) {
    await searchWithBackendFilters()
  }
}, 300)

// 追蹤是否已初始化完成（用於避免 watch 在掛載時觸發）
const isFilterWatchReady = ref(false)

// 🆕 簡化邏輯：監聽 filter 變化，debounce 後直接發送後端請求
const debouncedFilterSearch = useDebounceFn(() => {
  if (!isFilterWatchReady.value) {
    console.log('🤖 [Filter Watch] Skipping - not ready yet')
    return
  }

  console.log('🤖 [Filter Changed] Triggering backend search with filters:', {
    serviceType: filters.value.serviceType,
    status: filters.value.statusFilter,
    rankingType: filters.value.rankingType,
    search: filters.value.searchText,
    dateRange: filters.value.dateRange
  })

  // 直接發送後端請求（帶 filter 參數）
  searchWithBackendFilters()
}, 500) // 500ms debounce，等待用戶停止操作

// 監聽所有 filter 變化
watch(
  [
    () => filters.value.searchText,
    () => filters.value.serviceType,
    () => filters.value.statusFilter,
    () => filters.value.rankingType,
    () => filters.value.dateRange
  ],
  () => {
    debouncedFilterSearch()
  },
  { deep: true }
)

// ================== Methods ==================

const loadAIServiceLogs = async (append: boolean = false): Promise<void> => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    currentOffset.value = 0
  }

  try {
    const queryFilters: any = {
      limit: BATCH_SIZE,
      offset: append ? currentOffset.value : 0
    }

    const response = await adminApi.aiServiceLogs.query({ filters: queryFilters })

    if (response.success && response.data) {
      const logsList = response.data.logs || []

      if (append) {
        // Append new logs, avoiding duplicates
        const existingIds = new Set(logs.value.map(l => l.callId))
        const uniqueNewLogs = logsList.filter((l: AIServiceLog) => !existingIds.has(l.callId))
        logs.value = [...logs.value, ...uniqueNewLogs]
        currentOffset.value += logsList.length
      } else {
        logs.value = logsList
        currentOffset.value = logsList.length
      }

      totalCount.value = response.data.totalCount || logsList.length
    } else {
      const errorMessage = response.error?.message || '無法載入 AI 紀錄'
      ElMessage.error(errorMessage)
    }
  } catch (error: any) {
    console.error('Error loading AI service logs:', error)
    const errorMessage = error?.response?.error?.message || error?.message || '載入 AI 紀錄失敗'
    ElMessage.error(errorMessage)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadStatistics = async (): Promise<void> => {
  try {
    const response = await adminApi.aiServiceLogs.statistics()
    if (response.success && response.data) {
      statistics.value = response.data
    }
  } catch (error) {
    console.error('Error loading AI service statistics:', error)
  }
}

const refreshLogs = async (): Promise<void> => {
  await Promise.all([loadAIServiceLogs(), loadStatistics()])
  ElMessage.success('AI 紀錄已更新')
}

const resetFilters = (): void => {
  filters.value.searchText = ''
  filters.value.serviceType = 'all'
  filters.value.statusFilter = 'all'
  filters.value.rankingType = 'all'
  filters.value.dateRange = null
  filters.value.displayLimit = 100
  localStorage.removeItem('filters:aiServiceLogsManagement')
  displayCount.value = 50
  ElMessage.success('已清除所有篩選條件')
}

const loadMore = async (): Promise<void> => {
  console.log('🤖 [AIServiceLogs] loadMore called:', {
    displayCount: displayCount.value,
    filteredLogsLength: filteredLogs.value.length,
    logsLength: logs.value.length,
    hasMore: hasMore.value,
    totalCount: totalCount.value,
    currentOffset: currentOffset.value
  })

  // First, try to display more from locally loaded data
  if (displayCount.value < filteredLogs.value.length) {
    console.log('🤖 [AIServiceLogs] Increasing displayCount from', displayCount.value, 'to', displayCount.value + 50)
    displayCount.value += 50
    return
  }

  // If we've displayed all local data but server has more, fetch from backend
  if (hasMore.value) {
    console.log('🤖 [AIServiceLogs] Calling loadAIServiceLogs(true) to fetch more from backend')
    await loadAIServiceLogs(true)
    displayCount.value = logs.value.length
  } else {
    console.log('🤖 [AIServiceLogs] No more data to load (hasMore is false)')
  }
}

// 🆕 使用頁面級無限滾動（必須在 loadMore 定義後呼叫）
// 不解構 loadingMore，因為我們在 loadAIServiceLogs 之前已經定義了本地的 loadingMore
useWindowInfiniteScroll(
  canLoadMore,
  computed(() => loading.value || loadingMore.value),
  loadMore
)

const handleToggleExpansion = async (log: AIServiceLog): Promise<void> => {
  if (expandedLogId.value === log.callId) {
    // Collapse
    expandedLogId.value = null
    expandedLogDetails.value = { log: null, childCalls: [], parentCall: null }
    if (route.name === 'admin-ai-service-logs-detail') {
      router.push({ name: 'admin-ai-service-logs' })
    }
  } else {
    // Expand and load details
    expandedLogId.value = log.callId
    expandedLogDetails.value = { log, childCalls: [], parentCall: null }
    loadingDetail.value = true

    try {
      const response = await adminApi.aiServiceLogs.detail(log.callId)
      if (response.success && response.data) {
        expandedLogDetails.value = {
          log: response.data.log,
          childCalls: response.data.childCalls || [],
          parentCall: response.data.parentCall || null
        }
      }
    } catch (error) {
      console.error('Error loading log detail:', error)
    } finally {
      loadingDetail.value = false
    }

    // Update URL
    if (route.params.callId !== log.callId) {
      router.replace({
        name: 'admin-ai-service-logs-detail',
        params: { callId: log.callId }
      })
    }
  }
}

const expandChildLog = async (child: AIServiceLog): Promise<void> => {
  // Find the child in the main logs list and expand it
  const childInList = logs.value.find(l => l.callId === child.callId)
  if (childInList) {
    await handleToggleExpansion(childInList)
  } else {
    // If not in main list, still try to expand it
    expandedLogId.value = child.callId
    expandedLogDetails.value = { log: child, childCalls: [], parentCall: null }
    loadingDetail.value = true

    try {
      const response = await adminApi.aiServiceLogs.detail(child.callId)
      if (response.success && response.data) {
        expandedLogDetails.value = {
          log: response.data.log,
          childCalls: response.data.childCalls || [],
          parentCall: response.data.parentCall || null
        }
      }
    } catch (error) {
      console.error('Error loading child log detail:', error)
    } finally {
      loadingDetail.value = false
    }
  }
}

// ================== Formatters ==================

const formatTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const formatDuration = (ms: number | undefined): string => {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

const formatTokens = (tokens: number | undefined): string => {
  if (!tokens) return '-'
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

const parseBTComparisons = (jsonString: string | undefined): Array<{ itemA: string; itemB: string; winner: string; reason?: string }> => {
  if (!jsonString) return []
  try {
    return JSON.parse(jsonString)
  } catch {
    return []
  }
}

// ================== Statistics Helpers ==================

const getSuccessCount = (): number => {
  if (!statistics.value?.byStatus) return 0
  const successItem = statistics.value.byStatus.find(s => s.status === 'success')
  return successItem?.count || 0
}

const getFailedCount = (): number => {
  if (!statistics.value?.byStatus) return 0
  const failedItem = statistics.value.byStatus.find(s => s.status === 'failed')
  const timeoutItem = statistics.value.byStatus.find(s => s.status === 'timeout')
  return (failedItem?.count || 0) + (timeoutItem?.count || 0)
}

// ================== UI Helpers ==================

const getProviderCount = (log: AIServiceLog): string => {
  // Multi-Agent 模式下顯示 "多" 表示有多個 Provider，其他模式顯示 1
  if (log.serviceType === 'ranking_multi_agent' && !log.parentCallId) {
    // 父請求 (無 parentCallId) 表示是 Multi-Agent 主請求
    return '多'
  }
  return '1'
}

const getServiceTypeText = (type: AIServiceType): string => {
  const map: Record<AIServiceType, string> = {
    'ranking_direct': '直接排名',
    'ranking_bt': 'BT 配對',
    'ranking_multi_agent': 'Multi-Agent',
    'summary': '摘要',
    'translation': '翻譯',
    'feedback': '回饋'
  }
  return map[type] || type
}

const getServiceTypeClass = (type: AIServiceType): string => {
  const map: Record<AIServiceType, string> = {
    'ranking_direct': 'type-direct',
    'ranking_bt': 'type-bt',
    'ranking_multi_agent': 'type-multi-agent',
    'summary': 'type-summary',
    'translation': 'type-translation',
    'feedback': 'type-feedback'
  }
  return map[type] || 'type-default'
}

const getStatusText = (status: AIServiceStatus): string => {
  const map: Record<AIServiceStatus, string> = {
    'pending': '等待中',
    'processing': '處理中',
    'success': '成功',
    'failed': '失敗',
    'timeout': '超時'
  }
  return map[status] || status
}

const getStatusIcon = (status: AIServiceStatus): string => {
  const map: Record<AIServiceStatus, string> = {
    'pending': 'fas fa-clock',
    'processing': 'fas fa-spinner fa-spin',
    'success': 'fas fa-check-circle',
    'failed': 'fas fa-times-circle',
    'timeout': 'fas fa-hourglass-end'
  }
  return map[status] || 'fas fa-question-circle'
}

const getStatusColor = (status: AIServiceStatus): string => {
  const map: Record<AIServiceStatus, string> = {
    'pending': '#909399',
    'processing': '#409EFF',
    'success': '#67C23A',
    'failed': '#F56C6C',
    'timeout': '#E6A23C'
  }
  return map[status] || '#909399'
}

// ================== Lifecycle Hooks ==================

onMounted(async () => {
  // 🆕 簡化：初始載入直接使用後端搜尋（帶 filter 參數）
  await Promise.all([searchWithBackendFilters(), loadStatistics()])

  // Auto-expand detail if callId parameter exists in URL
  if (route.params.callId && typeof route.params.callId === 'string') {
    await nextTick()
    const targetLog = logs.value.find(log => log.callId === route.params.callId)
    if (targetLog) {
      handleToggleExpansion(targetLog)
    } else {
      ElMessage.warning('未找到指定的 AI 紀錄')
      router.push({ name: 'admin-ai-service-logs' })
    }
  }

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshLogs)

  // 🆕 在初始載入完成後啟用 filter watch
  // 使用 setTimeout 確保在 useFilterPersistence 載入完成後才啟用 watch
  setTimeout(() => {
    isFilterWatchReady.value = true
    console.log('🤖 [Init] Filter watch is now ready (after initial load)')
  }, 100)
})

onBeforeUnmount(() => {
  registerRefresh(null)
})
</script>

<style scoped>
.ai-service-logs-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Statistics Card */
.stats-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.stats-card :deep(.el-statistic__head) {
  font-size: 13px;
  color: #909399;
}

.stats-card :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
}

.stats-card :deep(.el-statistic__prefix) {
  margin-right: 6px;
  font-size: 16px;
}

/* Table Container - 移除固定高度，改用頁面級滾動 */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

.ai-logs-table {
  width: 100%;
  border-collapse: collapse;
}

.ai-logs-table th,
.ai-logs-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.ai-logs-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.ai-logs-table tr:hover {
  background: #f5f7fa;
}

/* Cell styling */
.email-cell {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Service type tags - using el-tag with custom colors */
:deep(.el-tag.type-direct) {
  background: #E6F7FF !important;
  color: #1890FF !important;
  border-color: #91D5FF !important;
}

:deep(.el-tag.type-bt) {
  background: #F6FFED !important;
  color: #52C41A !important;
  border-color: #B7EB8F !important;
}

:deep(.el-tag.type-multi-agent) {
  background: #FFF7E6 !important;
  color: #FA8C16 !important;
  border-color: #FFD591 !important;
}

:deep(.el-tag.type-summary) {
  background: #F9F0FF !important;
  color: #722ED1 !important;
  border-color: #D3ADF7 !important;
}

:deep(.el-tag.type-translation) {
  background: #E6FFFB !important;
  color: #13C2C2 !important;
  border-color: #87E8DE !important;
}

:deep(.el-tag.type-feedback) {
  background: #FFF0F6 !important;
  color: #EB2F96 !important;
  border-color: #FFADD2 !important;
}

:deep(.el-tag.type-default) {
  background: #F0F2F5 !important;
  color: #8C8C8C !important;
  border-color: #D9D9D9 !important;
}

/* Status icon */
.status-icon {
  font-size: 16px;
  cursor: help;
}

/* Provider count */
.provider-count {
  font-weight: 500;
  color: #2c3e50;
}

/* Stat items in vertical mode */
.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #606266;
}

.stat-item i {
  font-size: 11px;
  color: #909399;
}

/* Info row content (vertical mode) */
.info-row-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* Email and time text in actions row */
.email-text {
  font-weight: 500;
  color: #2c3e50;
}

.time-text {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
  white-space: nowrap;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

/* Loading & Count */
.loading-more {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.count-info {
  padding: 15px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
}

.has-more-hint {
  color: #409EFF;
  font-size: 12px;
}

/* Auto backend search indicator */
.auto-search-indicator {
  padding: 20px;
  text-align: center;
  color: #409EFF;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #ecf5ff;
  border-radius: 4px;
  margin: 10px 0;
}

/* AI Log Expanded Detail */
.ai-log-expanded-detail {
  padding: 0;
}

.detail-section {
  margin-bottom: 20px;
  background: #fafafa;
  border-radius: 6px;
  padding: 16px;
  border: 1px solid #e9ecef;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  margin: 0 0 16px 0;
  color: #374151;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
}

.detail-section h4 i {
  margin-right: 8px;
  color: #409eff;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  color: #2c3e50;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-value.monospace {
  font-family: monospace;
  font-size: 13px;
  color: #666;
}

.token-highlight {
  font-weight: 600;
  color: #409EFF;
}

.content-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  line-height: 1.6;
  color: #2c3e50;
  max-height: 400px;
  overflow-y: auto;
}

.content-display pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
}

.thinking-content {
  font-size: 13px;
  color: #666;
  font-style: italic;
}

.error-message {
  color: #F56C6C;
  font-family: monospace;
}

/* BT Comparisons */
.bt-comparisons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bt-comparison-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
}

.comparison-index {
  font-weight: 600;
  color: #409EFF;
  min-width: 30px;
}

.comparison-items {
  font-weight: 500;
}

.comparison-winner {
  color: #67C23A;
  font-weight: 500;
}

.comparison-reason {
  color: #666;
  font-size: 13px;
  flex: 1;
}

/* Child/Parent calls */
.child-calls-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.child-call-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 15px;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.child-call-item:hover {
  background: #e8f4ff;
}

.child-provider {
  font-weight: 500;
  min-width: 100px;
}

.child-round {
  background: #409EFF;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.child-status {
  font-weight: 500;
}

.child-tokens {
  color: #666;
  font-size: 13px;
}

.parent-call-info {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 15px;
  background: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.parent-call-info:hover {
  background: #e8f4ff;
}

.parent-id {
  font-family: monospace;
  font-size: 13px;
}

.parent-status {
  font-weight: 500;
}

</style>
