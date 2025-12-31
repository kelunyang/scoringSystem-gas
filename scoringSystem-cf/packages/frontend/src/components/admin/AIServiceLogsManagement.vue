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

    <!-- AI Service Logs Table -->
    <div
      class="table-container"
      v-loading="loading"
      element-loading-text="載入 AI 紀錄中..."
      v-infinite-scroll="loadMore"
      :infinite-scroll-disabled="scrollDisabled"
      :infinite-scroll-distance="200"
    >
      <table class="ai-logs-table">
        <thead>
          <tr>
            <th>類型</th>
            <th>Provider 數量</th>
            <th>請求者</th>
            <th>請求時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in displayedLogs" :key="log.callId">
            <td>
              <span class="service-type-badge" :class="getServiceTypeClass(log.serviceType)">
                {{ getServiceTypeText(log.serviceType) }}
              </span>
            </td>
            <td>{{ getProviderCount(log) }}</td>
            <td class="email-cell">{{ log.userEmail }}</td>
            <td>{{ formatTime(log.createdAt) }}</td>
            <td class="actions">
              <button
                class="btn-sm btn-info"
                @click="viewLogDetail(log)"
                title="檢視詳情"
              >
                <i class="fas fa-eye"></i>
                檢視
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <EmptyState
        v-if="filteredLogs.length === 0 && !loading"
        parent-icon="fa-robot"
        :icons="['fa-brain']"
        title="沒有找到符合條件的 AI 紀錄"
        :enable-animation="false"
      />

      <!-- Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more">
        <i class="el-icon-loading"></i>
        <span>載入更多紀錄...</span>
      </div>

      <!-- Show count info -->
      <div v-if="displayedLogs.length > 0" class="count-info">
        顯示 {{ displayedLogs.length }} / {{ filteredLogs.length }} 筆 AI 紀錄
      </div>
    </div>

    <!-- AI Service Log Detail Drawer -->
    <el-drawer
      v-model="showDetailDrawer"
      title="AI 服務詳情"
      direction="btt"
      size="100%"
      :before-close="handleDetailDrawerClose"
      :lock-scroll="false"
      :append-to-body="true"
      class="drawer-green"
    >
      <div v-if="selectedLog" class="ai-detail">
        <!-- Basic Info -->
        <div class="detail-section">
          <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>呼叫 ID</label>
              <div class="detail-value monospace">{{ selectedLog.callId }}</div>
            </div>
            <div class="detail-item">
              <label>Provider</label>
              <div class="detail-value">{{ selectedLog.providerName }}</div>
            </div>
            <div class="detail-item">
              <label>模型</label>
              <div class="detail-value">{{ selectedLog.model }}</div>
            </div>
            <div class="detail-item">
              <label>服務類型</label>
              <div class="detail-value">
                <span class="service-type-badge" :class="getServiceTypeClass(selectedLog.serviceType)">
                  {{ getServiceTypeText(selectedLog.serviceType) }}
                </span>
              </div>
            </div>
            <div class="detail-item">
              <label>排名類型</label>
              <div class="detail-value">
                {{ selectedLog.rankingType === 'submission' ? '作品排名' : selectedLog.rankingType === 'comment' ? '評論排名' : '-' }}
              </div>
            </div>
            <div class="detail-item">
              <label>請求者</label>
              <div class="detail-value">{{ selectedLog.userEmail }}</div>
            </div>
            <div class="detail-item">
              <label>專案 ID</label>
              <div class="detail-value monospace">{{ selectedLog.projectId }}</div>
            </div>
            <div class="detail-item">
              <label>階段 ID</label>
              <div class="detail-value monospace">{{ selectedLog.stageId || '-' }}</div>
            </div>
            <div class="detail-item">
              <label>處理項目數</label>
              <div class="detail-value">{{ selectedLog.itemCount || '-' }}</div>
            </div>
          </div>
        </div>

        <!-- Custom Prompt (if exists) -->
        <div class="detail-section" v-if="selectedLog.customPrompt">
          <h4><i class="fas fa-comment-alt"></i> 自訂 Prompt</h4>
          <div class="content-display">
            {{ selectedLog.customPrompt }}
          </div>
        </div>

        <!-- Result Section -->
        <div class="detail-section" v-if="selectedLog.result">
          <h4><i class="fas fa-list-ol"></i> 排名結果</h4>
          <div class="content-display">
            <pre>{{ formatJSON(selectedLog.result) }}</pre>
          </div>
        </div>

        <!-- AI Reason -->
        <div class="detail-section" v-if="selectedLog.reason">
          <h4><i class="fas fa-lightbulb"></i> AI 解釋</h4>
          <div class="content-display">
            {{ selectedLog.reason }}
          </div>
        </div>

        <!-- Thinking Process (DeepSeek reasoning) -->
        <div class="detail-section" v-if="selectedLog.thinkingProcess">
          <h4>
            <i class="fas fa-brain"></i> 思考過程
            <el-tag size="small" type="info" style="margin-left: 10px;">DeepSeek Reasoning</el-tag>
          </h4>
          <el-collapse>
            <el-collapse-item title="展開思考過程" name="thinking">
              <div class="content-display thinking-content">
                {{ selectedLog.thinkingProcess }}
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- BT Mode Section -->
        <div class="detail-section" v-if="selectedLog.serviceType === 'ranking_bt' && selectedLog.btComparisons">
          <h4><i class="fas fa-balance-scale"></i> BT 配對比較</h4>
          <div class="bt-comparisons">
            <div
              v-for="(comparison, index) in parseBTComparisons(selectedLog.btComparisons)"
              :key="index"
              class="bt-comparison-item"
            >
              <span class="comparison-index">#{{ index + 1 }}</span>
              <span class="comparison-items">
                {{ comparison.itemA }} vs {{ comparison.itemB }}
              </span>
              <span class="comparison-winner">
                勝者: {{ comparison.winner }}
              </span>
              <span class="comparison-reason" v-if="comparison.reason">
                {{ comparison.reason }}
              </span>
            </div>
          </div>
        </div>

        <!-- BT Strength Params -->
        <div class="detail-section" v-if="selectedLog.serviceType === 'ranking_bt' && selectedLog.btStrengthParams">
          <h4><i class="fas fa-chart-bar"></i> BT 能力值</h4>
          <div class="content-display">
            <pre>{{ formatJSON(selectedLog.btStrengthParams) }}</pre>
          </div>
        </div>

        <!-- Multi-Agent Section -->
        <div class="detail-section" v-if="selectedLog.serviceType === 'ranking_multi_agent'">
          <h4><i class="fas fa-users"></i> Multi-Agent 辯論詳情</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>辯論輪次</label>
              <div class="detail-value">{{ selectedLog.debateRound || '-' }}</div>
            </div>
            <div class="detail-item">
              <label>立場變化</label>
              <div class="detail-value">
                <el-tag :type="selectedLog.debateChanged ? 'warning' : 'success'" size="small">
                  {{ selectedLog.debateChanged ? '已變更' : '堅持原立場' }}
                </el-tag>
              </div>
            </div>
          </div>
          <div class="detail-item" v-if="selectedLog.debateCritique" style="margin-top: 15px;">
            <label>辯論評論</label>
            <div class="content-display">{{ selectedLog.debateCritique }}</div>
          </div>
        </div>

        <!-- Child Calls (for Multi-Agent parent) -->
        <div class="detail-section" v-if="childCalls && childCalls.length > 0">
          <h4><i class="fas fa-sitemap"></i> 子請求 ({{ childCalls.length }})</h4>
          <div class="child-calls-list">
            <div
              v-for="child in childCalls"
              :key="child.callId"
              class="child-call-item"
              @click="viewLogDetail(child)"
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

        <!-- Parent Call (for Multi-Agent child) -->
        <div class="detail-section" v-if="parentCall">
          <h4><i class="fas fa-level-up-alt"></i> 父請求</h4>
          <div class="parent-call-info" @click="viewLogDetail(parentCall)">
            <span class="parent-id">{{ parentCall.callId }}</span>
            <span class="parent-status" :style="{ color: getStatusColor(parentCall.status) }">
              {{ getStatusText(parentCall.status) }}
            </span>
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
                  :class="getStatusIcon(selectedLog.status)"
                  :style="{ color: getStatusColor(selectedLog.status) }"
                ></i>
                {{ getStatusText(selectedLog.status) }}
              </div>
            </div>
            <div class="detail-item">
              <label>請求 Token</label>
              <div class="detail-value">{{ formatTokens(selectedLog.requestTokens) }}</div>
            </div>
            <div class="detail-item">
              <label>回應 Token</label>
              <div class="detail-value">{{ formatTokens(selectedLog.responseTokens) }}</div>
            </div>
            <div class="detail-item">
              <label>總 Token</label>
              <div class="detail-value token-highlight">{{ formatTokens(selectedLog.totalTokens) }}</div>
            </div>
            <div class="detail-item">
              <label>回應時間</label>
              <div class="detail-value">{{ formatDuration(selectedLog.responseTimeMs) }}</div>
            </div>
            <div class="detail-item">
              <label>建立時間</label>
              <div class="detail-value">{{ formatTime(selectedLog.createdAt) }}</div>
            </div>
            <div class="detail-item">
              <label>完成時間</label>
              <div class="detail-value">{{ formatTime(selectedLog.completedAt) }}</div>
            </div>
          </div>
        </div>

        <!-- Error Info (if failed) -->
        <div class="detail-section" v-if="selectedLog.status === 'failed' || selectedLog.status === 'timeout'">
          <h4><i class="fas fa-exclamation-triangle"></i> 錯誤資訊</h4>
          <div class="content-display error-message">
            {{ selectedLog.errorMessage || '未記錄錯誤訊息' }}
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, inject, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
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

// Detail drawer state
const showDetailDrawer = ref<boolean>(false)
const selectedLog = ref<AIServiceLog | null>(null)
const childCalls = ref<AIServiceLog[]>([])
const parentCall = ref<AIServiceLog | null>(null)
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
const loadingMore = ref<boolean>(false)

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

  // Display limit
  return filtered.slice(0, filters.value.displayLimit)
})

const displayedLogs = computed(() => {
  return filteredLogs.value.slice(0, displayCount.value)
})

const scrollDisabled = computed(() => {
  return loading.value || loadingMore.value || displayedLogs.value.length >= filteredLogs.value.length
})

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

watch([
  () => filters.value.searchText,
  () => filters.value.serviceType,
  () => filters.value.statusFilter,
  () => filters.value.rankingType,
  () => filters.value.dateRange
], () => {
  displayCount.value = 50
})

// ================== Methods ==================

const loadAIServiceLogs = async (): Promise<void> => {
  loading.value = true
  try {
    const queryFilters: any = {
      limit: 1000,
      offset: 0
    }

    const response = await adminApi.aiServiceLogs.query({ filters: queryFilters })

    if (response.success && response.data) {
      logs.value = response.data.logs || []
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

const loadMore = (): void => {
  if (scrollDisabled.value) return
  loadingMore.value = true
  setTimeout(() => {
    displayCount.value += 50
    loadingMore.value = false
  }, 300)
}

const viewLogDetail = async (log: AIServiceLog): Promise<void> => {
  selectedLog.value = log
  childCalls.value = []
  parentCall.value = null
  showDetailDrawer.value = true

  // Load detailed info including child/parent calls
  loadingDetail.value = true
  try {
    const response = await adminApi.aiServiceLogs.detail(log.callId)
    if (response.success && response.data) {
      selectedLog.value = response.data.log
      childCalls.value = response.data.childCalls || []
      parentCall.value = response.data.parentCall || null
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

const closeDetailDrawer = (): void => {
  showDetailDrawer.value = false
  selectedLog.value = null
  childCalls.value = []
  parentCall.value = null

  if (route.name === 'admin-ai-service-logs-detail') {
    router.push({ name: 'admin-ai-service-logs' })
  }
}

const handleDetailDrawerClose = (done: () => void): void => {
  done()
  closeDetailDrawer()
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

const formatJSON = (jsonString: string | undefined): string => {
  if (!jsonString) return '-'
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2)
  } catch {
    return jsonString
  }
}

const parseBTComparisons = (jsonString: string | undefined): Array<{ itemA: string; itemB: string; winner: string; reason?: string }> => {
  if (!jsonString) return []
  try {
    return JSON.parse(jsonString)
  } catch {
    return []
  }
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
  await Promise.all([loadAIServiceLogs(), loadStatistics()])

  // Auto-open detail if callId parameter exists in URL
  if (route.params.callId && typeof route.params.callId === 'string') {
    await nextTick()
    const targetLog = logs.value.find(log => log.callId === route.params.callId)
    if (targetLog) {
      viewLogDetail(targetLog)
    } else {
      ElMessage.warning('未找到指定的 AI 紀錄')
      router.push({ name: 'admin-ai-service-logs' })
    }
  }

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshLogs)
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

/* Table Container */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
  max-height: calc(100vh - 400px);
  overflow-y: auto;
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

/* Service type badges */
.service-type-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-direct {
  background: #E6F7FF;
  color: #1890FF;
}

.type-bt {
  background: #F0F9FF;
  color: #52C41A;
}

.type-multi-agent {
  background: #FFF7E6;
  color: #FA8C16;
}

.type-summary {
  background: #F9F0FF;
  color: #722ED1;
}

.type-translation {
  background: #E6FFFB;
  color: #13C2C2;
}

.type-feedback {
  background: #FFF0F6;
  color: #EB2F96;
}

.type-default {
  background: #F0F2F5;
  color: #8C8C8C;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

/* Buttons */
.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #138496;
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

/* Detail Drawer */
.ai-detail {
  padding: 20px;
}

.detail-section {
  margin-bottom: 30px;
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.detail-section h4 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;
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

/* Custom scrollbar */
.table-container::-webkit-scrollbar {
  width: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.table-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Drawer styles */
:deep(.el-drawer.drawer-green) {
  position: fixed !important;
}

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
</style>
