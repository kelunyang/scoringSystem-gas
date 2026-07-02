<template>
  <div class="email-logs-management">
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
            placeholder="搜尋收件人或主旨..."
            clearable
            style="width: 300px;"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">觸發來源：</span>
          <el-select v-model="filters.triggerFilter" style="width: 200px;">
            <el-option label="全部來源" value="all" />
            <el-option label="通知巡檢" value="notification_patrol" />
            <el-option label="邀請碼" value="invitation" />
            <el-option label="密碼重設" value="password_reset" />
            <el-option label="密碼重設 (2FA)" value="password_reset_2fa" />
            <el-option label="帳號鎖定" value="account_locked" />
            <el-option label="系統公告" value="system_announcement" />
            <el-option label="管理員手動" value="manual_admin" />
            <el-option label="重送" value="resend" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">發送狀態：</span>
          <el-select v-model="filters.statusFilter" style="width: 150px;">
            <el-option label="全部狀態" value="all" />
            <el-option label="已發送" value="sent" />
            <el-option label="失敗" value="failed" />
          </el-select>
        </div>
      </template>

      <!-- Expanded Filters (Collapsible) -->
      <template #filters-expanded>
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

      <!-- Action Buttons -->
      <template #actions>
        <el-popconfirm
          :title="`確定要重送 ${selectedLogs.length} 封郵件嗎？`"
          confirm-button-text="確定"
          cancel-button-text="取消"
          :disabled="selectedLogs.length === 0 || resending"
          @confirm="resendSelectedEmails"
        >
          <template #reference>
            <el-badge :value="selectedLogs.length" :hidden="selectedLogs.length === 0">
              <el-button
                type="primary"
                size="small"
                :disabled="selectedLogs.length === 0 || resending"
                title="重送選中的郵件"
              >
                <i class="fas fa-redo"></i>
                <span class="btn-text">重送郵件</span>
              </el-button>
            </el-badge>
          </template>
        </el-popconfirm>
      </template>
    </AdminFilterToolbar>

    <!-- 🆕 移除自動搜尋提示，因為現在 filter 變化會直接觸發載入更多 -->

    <!-- Statistics Card -->
    <el-card class="stats-card" shadow="hover">
      <div class="stats-grid">
        <AnimatedStatistic title="總郵件數" :value="stats.totalEmails" />
        <AnimatedStatistic title="成功率(%)" :value="Math.round(stats.successRate)" />
        <AnimatedStatistic title="失敗數" :value="stats.failedEmails" />
        <AnimatedStatistic title="24小時內" :value="stats.last24Hours" />
        <AnimatedStatistic v-if="hasActiveFilters" title="搜尋結果" :value="filteredLogs.length" />
      </div>
    </el-card>

    <!-- Email Logs Table (頁面級滾動) -->
    <div class="table-container">
      <div
        v-loading="loading"
        element-loading-text="載入郵件紀錄中..."
      >
      <table class="email-logs-table">
        <thead>
          <tr>
            <th width="40"></th>
            <th width="50">
              <el-checkbox
                v-model="selectAll"
                :indeterminate="isIndeterminate"
                @change="toggleSelectAll"
              />
            </th>
            <th>收件人</th>
            <th>觸發來源</th>
            <th width="60">狀態</th>
            <th>發送時間</th>
            <th width="100">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in displayedLogs" :key="log.logId">
            <ExpandableTableRow
              :is-expanded="expandedLogId === log.logId"
              :is-selected="log.selected"
              :expansion-colspan="7"
              :enable-responsive-rows="true"
              :actions-colspan="7"
              @toggle-expansion="handleToggleExpansion(log)"
            >
              <!-- 橫屏：完整單行 -->
              <template #main="{ isExpanded }">
                <td class="expand-cell" @click.stop>
                  <i :class="['fas', isExpanded ? 'fa-chevron-down' : 'fa-chevron-right', 'expand-icon']"></i>
                </td>
                <td @click.stop>
                  <el-checkbox
                    v-model="log.selected"
                    @change="handleSelectionChange"
                  />
                </td>
                <td>{{ log.recipient }}</td>
                <td>
                  <el-tag :type="getTriggerTagType(log.trigger)" size="small">
                    {{ getTriggerText(log.trigger) }}
                  </el-tag>
                </td>
                <td class="status-cell">
                  <i
                    :class="log.status === 'sent' ? 'fas fa-check-circle' : 'fas fa-times-circle'"
                    class="status-icon"
                    :style="{ color: log.status === 'sent' ? '#67C23A' : '#F56C6C' }"
                    :title="log.status === 'sent' ? '發送成功' : '發送失敗'"
                  ></i>
                </td>
                <td>{{ formatTime(log.timestamp) }}</td>
                <td class="actions" @click.stop>
                  <el-popconfirm
                    :title="`確定要重送郵件給 ${log.recipient} 嗎？`"
                    confirm-button-text="確定"
                    cancel-button-text="取消"
                    :disabled="resending"
                    @confirm="resendSingleEmail(log)"
                  >
                    <template #reference>
                      <el-button
                        type="primary"
                        size="small"
                        :disabled="resending"
                        circle
                        title="重送郵件"
                      >
                        <i class="fas fa-redo"></i>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </td>
              </template>

              <!-- 豎屏：資訊行 -->
              <template #info="{ isExpanded }">
                <td class="expand-cell" @click.stop>
                  <i :class="['fas', isExpanded ? 'fa-chevron-down' : 'fa-chevron-right', 'expand-icon']"></i>
                </td>
                <td @click.stop>
                  <el-checkbox
                    v-model="log.selected"
                    @change="handleSelectionChange"
                  />
                </td>
                <td colspan="5">
                  <div class="info-row-content">
                    <span class="recipient">{{ log.recipient }}</span>
                    <div class="stat-items">
                      <span class="stat-item">
                        <el-tag :type="getTriggerTagType(log.trigger)" size="small">
                          {{ getTriggerText(log.trigger) }}
                        </el-tag>
                      </span>
                      <span class="stat-item">
                        <i
                          :class="log.status === 'sent' ? 'fas fa-check-circle' : 'fas fa-times-circle'"
                          class="status-icon"
                          :style="{ color: log.status === 'sent' ? '#67C23A' : '#F56C6C' }"
                          :title="log.status === 'sent' ? '發送成功' : '發送失敗'"
                        ></i>
                      </span>
                      <span class="stat-item time">{{ formatTime(log.timestamp) }}</span>
                    </div>
                  </div>
                </td>
              </template>

              <!-- 豎屏：操作行 -->
              <template #actions>
                <el-popconfirm
                  :title="`確定要重送郵件給 ${log.recipient} 嗎？`"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  :disabled="resending"
                  @confirm="resendSingleEmail(log)"
                >
                  <template #reference>
                    <el-button
                      type="primary"
                      size="small"
                      :disabled="resending"
                    >
                      <i class="fas fa-redo"></i>
                      重送郵件
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>

              <!-- 展開內容 -->
              <template #default>
                <div v-if="expandedLogDetails" class="email-detail">
                  <!-- Basic Info -->
                  <div class="detail-section">
                    <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
                    <div class="detail-grid">
                      <div class="detail-item">
                        <label>郵件 ID</label>
                        <div class="detail-value">{{ expandedLogDetails.emailId }}</div>
                      </div>
                      <div class="detail-item">
                        <label>日誌 ID</label>
                        <div class="detail-value">{{ expandedLogDetails.logId }}</div>
                      </div>
                      <div class="detail-item">
                        <label>收件人</label>
                        <div class="detail-value">{{ expandedLogDetails.recipient }}</div>
                      </div>
                      <div class="detail-item">
                        <label>收件人 ID</label>
                        <div class="detail-value">{{ expandedLogDetails.recipientUserId || '-' }}</div>
                      </div>
                      <div class="detail-item">
                        <label>觸發來源</label>
                        <div class="detail-value">
                          <el-tag :type="getTriggerTagType(expandedLogDetails.trigger)" size="small">
                            {{ getTriggerText(expandedLogDetails.trigger) }}
                          </el-tag>
                        </div>
                      </div>
                      <div class="detail-item">
                        <label>觸發者</label>
                        <div class="detail-value">{{ expandedLogDetails.triggeredBy || 'system' }}</div>
                      </div>
                      <div class="detail-item">
                        <label>觸發類型</label>
                        <div class="detail-value">{{ expandedLogDetails.triggerSource || '-' }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Email Content -->
                  <div class="detail-section">
                    <h4><i class="fas fa-file-alt"></i> 郵件內容</h4>
                    <div class="detail-item">
                      <label>主旨</label>
                      <div class="detail-value">{{ expandedLogDetails.subject }}</div>
                    </div>
                    <div class="detail-item" style="margin-top: 15px;">
                      <label>HTML 內容</label>
                      <div class="content-display" v-html="sanitizedHtmlBody"></div>
                    </div>
                    <div v-if="expandedLogDetails.textBody" class="detail-item" style="margin-top: 15px;">
                      <label>純文字內容</label>
                      <div class="content-display">{{ expandedLogDetails.textBody }}</div>
                    </div>
                  </div>

                  <!-- Status & Performance -->
                  <div class="detail-section">
                    <h4><i class="fas fa-chart-line"></i> 狀態與效能</h4>
                    <div class="detail-grid">
                      <div class="detail-item">
                        <label>狀態</label>
                        <div class="detail-value">
                          <i
                            :class="expandedLogDetails.status === 'sent' ? 'fas fa-check-circle' : 'fas fa-times-circle'"
                            :style="{ color: expandedLogDetails.status === 'sent' ? '#67C23A' : '#F56C6C' }"
                          ></i>
                          {{ expandedLogDetails.status === 'sent' ? '發送成功' : '發送失敗' }}
                        </div>
                      </div>
                      <div v-if="expandedLogDetails.statusCode" class="detail-item">
                        <label>HTTP 狀態碼</label>
                        <div class="detail-value">{{ expandedLogDetails.statusCode }}</div>
                      </div>
                      <div class="detail-item">
                        <label>郵件大小</label>
                        <div class="detail-value">{{ formatSize(expandedLogDetails.emailSize) }}</div>
                      </div>
                      <div class="detail-item">
                        <label>發送耗時</label>
                        <div class="detail-value">{{ formatDuration(expandedLogDetails.durationMs) }}</div>
                      </div>
                      <div class="detail-item">
                        <label>重試次數</label>
                        <div class="detail-value">{{ expandedLogDetails.retryCount || 0 }}</div>
                      </div>
                      <div class="detail-item">
                        <label>發送時間</label>
                        <div class="detail-value">{{ formatTime(expandedLogDetails.timestamp) }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Error Info (if failed) -->
                  <div v-if="expandedLogDetails.status === 'failed'" class="detail-section">
                    <h4><i class="fas fa-exclamation-triangle"></i> 錯誤資訊</h4>
                    <div class="detail-grid">
                      <div class="detail-item">
                        <label>錯誤類型</label>
                        <div class="detail-value">{{ expandedLogDetails.errorType || '-' }}</div>
                      </div>
                      <div class="detail-item" style="grid-column: 1 / -1;">
                        <label>錯誤訊息</label>
                        <div class="content-display error-message">{{ expandedLogDetails.error || '-' }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Email Context -->
                  <div v-if="expandedLogDetails.emailContext" class="detail-section">
                    <h4><i class="fas fa-code"></i> 郵件上下文</h4>
                    <div class="content-display">
                      <MdPreviewWrapper :content="jsonToMarkdown(expandedLogDetails.emailContext)" />
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="detail-actions">
                    <el-popconfirm
                      :title="`確定要重送郵件給 ${expandedLogDetails.recipient} 嗎？`"
                      confirm-button-text="確定"
                      cancel-button-text="取消"
                      :disabled="resending"
                      @confirm="resendFromExpanded"
                    >
                      <template #reference>
                        <el-button
                          type="primary"
                          :disabled="resending"
                        >
                          <i class="fas fa-redo"></i>
                          {{ resending ? '重送中...' : '重送郵件' }}
                        </el-button>
                      </template>
                    </el-popconfirm>
                  </div>
                </div>
              </template>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <EmptyState
        v-if="filteredLogs.length === 0 && !loading"
        parent-icon="fa-envelope-open-text"
        :icons="['fa-inbox']"
        title="沒有找到符合條件的郵件紀錄"
        :enable-animation="false"
      />

      <!-- Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more">
        <i class="el-icon-loading"></i>
        <span>載入更多紀錄...</span>
      </div>

      <!-- Show count info -->
      <div v-if="displayedLogs.length > 0" class="count-info">
        顯示 {{ displayedLogs.length }} / {{ filteredLogs.length }} 筆郵件紀錄
      </div>
      </div>
    </div>

    <!-- Progress Dialog -->
    <el-dialog
      v-model="showProgressDialog"
      title="重送郵件進度"
      width="500px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <div class="progress-content">
        <p>{{ progressMessage }}</p>
        <el-progress
          :percentage="progressPercentage"
          :status="progressStatus"
          :text-inside="true"
          :stroke-width="26"
        />
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDebounceFn } from '@vueuse/core'
import { adminApi } from '@/api/admin'
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import DOMPurify from 'dompurify'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import { useWindowInfiniteScroll } from '@/composables/useWindowInfiniteScroll'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { jsonToMarkdown } from '@/utils/json-preview'
import {
  useEmailStatistics,
  useResendEmail,
  useBatchResendEmails
} from '@/composables/admin/useEmailLogs'

// ================== TanStack Query Mutations ==================
const emailStatisticsQuery = useEmailStatistics()
const resendEmailMutation = useResendEmail()
const batchResendEmailsMutation = useBatchResendEmails()

// ================== Interfaces ==================

interface EmailLog {
  logId: string
  emailId: string
  trigger: string
  triggeredBy: string
  triggerSource: string
  recipient: string
  recipientUserId?: string
  subject: string
  htmlBody: string
  textBody?: string
  emailSize: number
  status: 'sent' | 'failed'
  statusCode?: number
  error?: string
  errorType?: string
  retryCount: number
  emailContext?: string
  timestamp: number
  durationMs: number
  createdAt: number
  updatedAt: number
  selected: boolean
}

// ================== Instance & Global ==================

const route = useRoute()
const router = useRouter()

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// ================== State ==================

const logs = ref<EmailLog[]>([])
const loading = ref<boolean>(false)
const resending = ref<boolean>(false)

// Server pagination state
const totalCount = ref<number>(0)
const currentOffset = ref<number>(0)
const hasMore = computed(() => logs.value.length < totalCount.value)
const autoSearchingBackend = ref<boolean>(false)

// Filters
// Filter persistence (localStorage)
const { filters, isLoaded: filtersLoaded } = useFilterPersistence('emailLogsManagement', {
  searchText: '',
  triggerFilter: 'all',
  statusFilter: 'all',
  dateRange: null as [Date, Date] | null,
  displayLimit: 100
})

// Backward compatibility computed properties
const searchText = computed({
  get: () => filters.value.searchText,
  set: (val) => { filters.value.searchText = val }
})
const triggerFilter = computed({
  get: () => filters.value.triggerFilter,
  set: (val) => { filters.value.triggerFilter = val }
})
const statusFilter = computed({
  get: () => filters.value.statusFilter,
  set: (val) => { filters.value.statusFilter = val }
})
const dateRange = computed({
  get: () => filters.value.dateRange,
  set: (val) => { filters.value.dateRange = val }
})
const displayLimit = computed({
  get: () => filters.value.displayLimit,
  set: (val) => { filters.value.displayLimit = val }
})

// 計算啟用的過濾器數量
const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.searchText) count++
  if (filters.value.triggerFilter && filters.value.triggerFilter !== 'all') count++
  if (filters.value.statusFilter && filters.value.statusFilter !== 'all') count++
  if (filters.value.dateRange) count++
  return count
})

// 檢查是否有任何篩選條件
const hasActiveFilters = computed(() => activeFilterCount.value > 0)

// Selection
const selectAll = ref<boolean>(false)
const isIndeterminate = ref<boolean>(false)

// Infinite scroll
const displayCount = ref<number>(50)

// Progress
const showProgressDialog = ref<boolean>(false)
const progressMessage = ref<string>('')
const progressPercentage = ref<number>(0)
const progressStatus = ref<'' | 'success' | 'warning' | 'exception'>('')

// Expandable row
const expandedLogId = ref<string | null>(null)

// ================== Constants ==================

const BATCH_SIZE = 50

// ================== Computed Properties ==================

const stats = computed(() => {
  // Use TanStack Query statistics data
  const statsData = emailStatisticsQuery.data.value
  if (statsData) {
    return {
      totalEmails: statsData.totalEmails,
      successRate: statsData.sentCount > 0 ? (statsData.sentCount / statsData.totalEmails * 100) : 0,
      failedEmails: statsData.failedCount,
      last24Hours: calculateLast24Hours()
    }
  }
  // Fallback to local calculation if query data not available
  return {
    totalEmails: logs.value.length,
    successRate: logs.value.length > 0 ? (logs.value.filter(l => l.status === 'sent').length / logs.value.length * 100) : 0,
    failedEmails: logs.value.filter(l => l.status === 'failed').length,
    last24Hours: calculateLast24Hours()
  }
})

const filteredLogs = computed<EmailLog[]>(() => {
  let filtered = logs.value

  // Text search
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    filtered = filtered.filter(l =>
      l.recipient.toLowerCase().includes(search) ||
      l.subject.toLowerCase().includes(search)
    )
  }

  // Trigger filter
  if (triggerFilter.value !== 'all') {
    filtered = filtered.filter(l => l.trigger === triggerFilter.value)
  }

  // Status filter
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(l => l.status === statusFilter.value)
  }

  // Date range filter
  if (dateRange.value && dateRange.value.length === 2) {
    const start = dateRange.value[0]
    const end = dateRange.value[1]
    // 安全檢查：確保是 Date 物件
    if (start instanceof Date && end instanceof Date) {
      const startTime = start.getTime()
      const endTime = end.getTime()
      filtered = filtered.filter(l => l.timestamp >= startTime && l.timestamp <= endTime)
    }
  }

  // 注意：不再在這裡做 displayLimit 切片
  // 分頁由 displayedLogs + displayCount 控制（infinite scroll）
  return filtered
})

// Export configuration
const exportConfig = computed(() => ({
  data: filteredLogs.value as unknown as Record<string, unknown>[],
  filename: '郵件紀錄',
  headers: ['收件人', '主旨', '觸發來源', '發送狀態', '發送時間', '重試次數', '錯誤訊息'],
  rowMapper: (item: Record<string, unknown>) => {
    const log = item as unknown as EmailLog
    return [
      log.recipient,
      log.subject,
      getTriggerText(log.trigger),
      log.status === 'sent' ? '已發送' : '失敗',
      new Date(log.timestamp).toLocaleString('zh-TW'),
      log.retryCount,
      log.error || '-'
    ] as (string | number)[]
  }
}))

const displayedLogs = computed<EmailLog[]>(() => {
  return filteredLogs.value.slice(0, displayCount.value)
})

const scrollDisabled = computed<boolean>(() => {
  // Disable scroll if loading, or if we've displayed all local data AND there's no more on server
  return loading.value || (displayedLogs.value.length >= filteredLogs.value.length && !hasMore.value)
})

// 🆕 canLoadMore 計算（用於無限滾動）
const canLoadMore = computed(() => !scrollDisabled.value)

// 🆕 loadingMore 狀態（用於 loadEmailLogs 和 useWindowInfiniteScroll）
// 必須在 loadEmailLogs 之前定義，避免 hoisting 問題
const loadingMore = ref(false)

const selectedLogs = computed<EmailLog[]>(() => {
  return logs.value.filter(l => l.selected)
})

// Get the currently expanded log details
const expandedLogDetails = computed<EmailLog | null>(() => {
  if (!expandedLogId.value) return null
  return logs.value.find(l => l.logId === expandedLogId.value || l.emailId === expandedLogId.value) || null
})

// ================== Watchers ==================

watch(selectedLogs, (newVal: EmailLog[]) => {
  if (newVal.length === 0) {
    selectAll.value = false
    isIndeterminate.value = false
  } else if (newVal.length === displayedLogs.value.length) {
    selectAll.value = true
    isIndeterminate.value = false
  } else {
    selectAll.value = false
    isIndeterminate.value = true
  }
})

// 🆕 直接監聽 filter 變化，觸發後端搜尋
const debouncedFilterChange = useDebounceFn(() => {
  // 正在載入中，不要再觸發
  if (loading.value || loadingMore.value) return

  // 重設 displayCount
  displayCount.value = 50

  // 如果有 filter，直接觸發後端搜尋
  if (hasActiveFilters.value) {
    console.log('📧 [Filter Change] Triggering backend search with filters...')
    loadEmailLogs(false, true) // withFilters = true
  }
}, 300)

// 追蹤是否已初始化完成（用於避免 watch 在掛載時觸發）
const isFilterWatchReady = ref(false)

// 🆕 簡化邏輯：監聽 filter 變化，debounce 後直接發送後端請求
const debouncedFilterSearch = useDebounceFn(() => {
  if (!isFilterWatchReady.value) {
    console.log('📧 [Filter Watch] Skipping - not ready yet')
    return
  }

  console.log('📧 [Filter Changed] Triggering backend search with filters:', {
    trigger: triggerFilter.value,
    status: statusFilter.value,
    search: searchText.value,
    dateRange: dateRange.value
  })

  // 直接發送後端請求（帶 filter 參數）
  loadEmailLogs(false, true)  // withFilters = true
}, 500) // 500ms debounce，等待用戶停止操作

// 監聽所有 filter 變化
watch(
  [
    () => searchText.value,
    () => triggerFilter.value,
    () => statusFilter.value,
    () => dateRange.value
  ],
  () => {
    debouncedFilterSearch()
  },
  { deep: true }
)

// ================== Methods ==================

const calculateLast24Hours = (): number => {
  const now = Date.now()
  const yesterday = now - (24 * 60 * 60 * 1000)
  return logs.value.filter(l => l.timestamp >= yesterday).length
}

const loadEmailLogs = async (append: boolean = false, withFilters: boolean = false): Promise<void> => {
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

    // 🆕 如果 withFilters 為 true，加入 filter 參數給後端
    if (withFilters) {
      // trigger filter (後端欄位是 trigger)
      if (triggerFilter.value && triggerFilter.value !== 'all') {
        queryFilters.trigger = triggerFilter.value
      }
      // status filter (後端欄位是 status: 'sent' | 'failed')
      if (statusFilter.value && statusFilter.value !== 'all') {
        queryFilters.status = statusFilter.value
      }
      // recipient search (後端欄位是 recipient)
      if (searchText.value) {
        queryFilters.recipient = searchText.value
      }
      // date range (後端欄位是 startDate, endDate - 需要是 timestamp)
      if (dateRange.value && dateRange.value.length === 2) {
        const start = dateRange.value[0]
        const end = dateRange.value[1]
        if (start instanceof Date) {
          queryFilters.startDate = start.getTime()
        } else if (typeof start === 'number') {
          queryFilters.startDate = start
        }
        if (end instanceof Date) {
          queryFilters.endDate = end.getTime()
        } else if (typeof end === 'number') {
          queryFilters.endDate = end
        }
      }
      console.log('📧 [Backend Search] Query filters:', queryFilters)
    }

    const response = await adminApi.emailLogs.query({ filters: queryFilters })

    if (response.success && response.data) {
      const logsList = response.data.logs || []
      const newLogs = logsList.map((l: any) => ({
        ...l,
        selected: false
      }))

      if (append) {
        // Append new logs, avoiding duplicates
        const existingIds = new Set(logs.value.map(l => l.logId))
        const uniqueNewLogs = newLogs.filter((l: EmailLog) => !existingIds.has(l.logId))
        logs.value = [...logs.value, ...uniqueNewLogs]
        currentOffset.value += logsList.length
      } else {
        logs.value = newLogs
        currentOffset.value = logsList.length
      }

      totalCount.value = response.data.totalCount || logsList.length
    } else {
      const errorMessage = response.error?.message || '無法載入郵件紀錄'
      ElMessage.error(errorMessage)
    }
  } catch (error: any) {
    console.error('Error loading email logs:', error)
    const errorMessage = error?.response?.error?.message || error?.message || '載入郵件紀錄失敗'
    ElMessage.error(errorMessage)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadStatistics = (): void => {
  // Statistics are now loaded via TanStack Query (emailStatisticsQuery)
  // This function just triggers a refetch if needed
  emailStatisticsQuery.refetch()
}

const refreshLogs = async (): Promise<void> => {
  await loadEmailLogs()
  loadStatistics() // This triggers refetch of TanStack Query
  ElMessage.success('郵件紀錄已更新')
}

const resetFilters = (): void => {
  filters.value.searchText = ''
  filters.value.triggerFilter = 'all'
  filters.value.statusFilter = 'all'
  filters.value.dateRange = null
  filters.value.displayLimit = 100

  // 明確清除 localStorage（防止過期篩選器殘留）
  localStorage.removeItem('filters:emailLogsManagement')

  displayCount.value = 50
  ElMessage.success('已清除所有篩選條件')
}

const toggleSelectAll = (value: any): void => {
  const boolValue = !!value
  displayedLogs.value.forEach(l => {
    l.selected = boolValue
  })
}

const handleSelectionChange = (): void => {
  // This will trigger the watch on selectedLogs
}

const loadMore = async (): Promise<void> => {
  console.log('📧 [EmailLogs] loadMore called:', {
    displayCount: displayCount.value,
    filteredLogsLength: filteredLogs.value.length,
    logsLength: logs.value.length,
    hasMore: hasMore.value,
    totalCount: totalCount.value,
    currentOffset: currentOffset.value
  })

  // 如果本地還有更多資料可顯示，先顯示本地資料
  if (displayCount.value < filteredLogs.value.length) {
    console.log('📧 [EmailLogs] Increasing displayCount from', displayCount.value, 'to', displayCount.value + BATCH_SIZE)
    displayCount.value += BATCH_SIZE
    return
  }

  // 如果本地資料已全部顯示但後端還有更多，從後端載入
  if (hasMore.value) {
    console.log('📧 [EmailLogs] Calling loadEmailLogs(true) to fetch more from backend')
    await loadEmailLogs(true)
  } else {
    console.log('📧 [EmailLogs] No more data to load (hasMore is false)')
  }
}

// 🆕 使用頁面級無限滾動（必須在 loadMore 定義後呼叫）
// 不解構 loadingMore，因為我們在 loadEmailLogs 之前已經定義了本地的 loadingMore
useWindowInfiniteScroll(
  canLoadMore,
  computed(() => loading.value || loadingMore.value),
  loadMore
)

const handleToggleExpansion = (log: EmailLog): void => {
  if (expandedLogId.value === log.logId) {
    // Collapse
    expandedLogId.value = null
    // Navigate back if on detail route
    if (route.name === 'admin-email-logs-detail') {
      router.push({ name: 'admin-email-logs' })
    }
  } else {
    // Expand
    expandedLogId.value = log.logId
    // Update URL for sharing
    if (route.params.emailId !== log.emailId) {
      router.replace({
        name: 'admin-email-logs-detail',
        params: { emailId: log.emailId }
      })
    }
  }
}

const resendSelectedEmails = async (): Promise<void> => {
  const selected = selectedLogs.value
  if (selected.length === 0) {
    ElMessage.warning('請選擇要重送的郵件')
    return
  }

  resending.value = true
  showProgressDialog.value = true
  progressPercentage.value = 0
  progressStatus.value = ''

  let successCount = 0
  let failedCount = 0

  try {
    // Process in batches
    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      const batch = selected.slice(i, Math.min(i + BATCH_SIZE, selected.length))
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(selected.length / BATCH_SIZE)

      progressMessage.value = `處理第 ${batchNumber}/${totalBatches} 批 (每批最多 ${BATCH_SIZE} 封)`

      try {
        // Use TanStack Query mutation for batch resend
        const result = await batchResendEmailsMutation.mutateAsync({
          logIds: batch.map(l => l.logId)
        })

        successCount += result.successCount || 0
        failedCount += result.failedCount || 0
      } catch {
        failedCount += batch.length
      }

      // Update progress
      progressPercentage.value = Math.round(((i + batch.length) / selected.length) * 100)
    }

    progressStatus.value = failedCount > 0 ? 'warning' : 'success'
    progressMessage.value = `完成！成功重送 ${successCount} 封，失敗 ${failedCount} 封`

    setTimeout(() => {
      showProgressDialog.value = false
      if (successCount > 0) {
        ElMessage.success(`成功重送 ${successCount} 封郵件`)
        // Refresh logs to show new entries
        refreshLogs()
      }
      if (failedCount > 0) {
        ElMessage.warning(`${failedCount} 封郵件重送失敗`)
      }
    }, 2000)

  } catch (error) {
    console.error('Error resending emails:', error)
    progressStatus.value = 'exception'
    progressMessage.value = '重送過程中發生錯誤'
    setTimeout(() => {
      showProgressDialog.value = false
      ElMessage.error('郵件重送失敗')
    }, 2000)
  } finally {
    resending.value = false
  }
}

const resendSingleEmail = async (log: EmailLog): Promise<void> => {
  resending.value = true
  try {
    await resendEmailMutation.mutateAsync({
      logId: log.logId
    })
    // Refresh to show new log entry (success message handled by mutation)
    await refreshLogs()
  } catch (error) {
    console.error('Error resending email:', error)
    // Error message handled by mutation's onError
  } finally {
    resending.value = false
  }
}

const formatTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const formatDuration = (ms: number | undefined): string => {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatSize = (bytes: number | undefined): string => {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * Uses DOMPurify with aggressive sanitization for admin safety
 */
const sanitizeHTML = (html: string | undefined): string => {
  if (!html) return ''

  // Configure DOMPurify to be extra strict for security
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'style', 'class'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false
  })
}

/**
 * Computed property for sanitized HTML body
 */
const sanitizedHtmlBody = computed(() => {
  return expandedLogDetails.value ? sanitizeHTML(expandedLogDetails.value.htmlBody) : ''
})

// Resend from expanded detail
const resendFromExpanded = async (): Promise<void> => {
  if (expandedLogDetails.value) {
    await resendSingleEmail(expandedLogDetails.value)
    // Collapse after resending
    expandedLogId.value = null
    if (route.name === 'admin-email-logs-detail') {
      router.push({ name: 'admin-email-logs' })
    }
  }
}

const getTriggerText = (trigger: string): string => {
  const triggerMap: Record<string, string> = {
    'notification_patrol': '通知巡檢',
    'invitation': '邀請碼',
    'password_reset': '密碼重設',
    'password_reset_2fa': '密碼重設 (2FA)',
    'account_locked': '帳號鎖定',
    'system_announcement': '系統公告',
    'manual_admin': '管理員手動',
    'resend': '重送'
  }
  return triggerMap[trigger] || trigger
}

const getTriggerClass = (trigger: string): string => {
  const classMap: Record<string, string> = {
    'notification_patrol': 'trigger-notification',
    'invitation': 'trigger-invitation',
    'password_reset': 'trigger-password',
    'password_reset_2fa': 'trigger-password',
    'account_locked': 'trigger-security',
    'system_announcement': 'trigger-announcement',
    'manual_admin': 'trigger-admin',
    'resend': 'trigger-resend'
  }
  return classMap[trigger] || 'trigger-default'
}

const getTriggerTagType = (trigger: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    'notification_patrol': 'info',
    'invitation': 'success',
    'password_reset': 'warning',
    'password_reset_2fa': 'warning',
    'account_locked': 'danger',
    'system_announcement': 'primary',
    'manual_admin': 'info',
    'resend': 'warning'
  }
  return typeMap[trigger] || 'info'
}

// ================== Lifecycle Hooks ==================

onMounted(async () => {
  // 🆕 簡化：初始載入直接使用後端搜尋（帶 filter 參數）
  // Statistics are loaded automatically via TanStack Query (emailStatisticsQuery)
  await loadEmailLogs(false, true)

  // Auto-expand email detail if emailId parameter exists in URL
  if (route.params.emailId && typeof route.params.emailId === 'string') {
    await nextTick()

    const targetLog = logs.value.find(
      log => log.emailId === route.params.emailId || log.logId === route.params.emailId
    )

    if (targetLog) {
      expandedLogId.value = targetLog.logId
    } else {
      ElMessage.warning('未找到指定的郵件記錄')
      router.push({ name: 'admin-email-logs' })
    }
  }

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshLogs)

  // 🆕 在初始載入完成後啟用 filter watch
  // 使用 setTimeout 確保在 useFilterPersistence 載入完成後才啟用 watch
  setTimeout(() => {
    isFilterWatchReady.value = true
    console.log('📧 [Init] Filter watch is now ready (after initial load)')
  }, 100)
})

onBeforeUnmount(() => {
  // Cleanup: unregister refresh function
  registerRefresh(null)
})
</script>

<style scoped>
.email-logs-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Statistics Card */
.stats-card {
  margin-bottom: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stats-card :deep(.el-statistic__head) {
  font-size: 13px;
  color: #666;
}

.stats-card :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
}

.stats-card :deep(.el-statistic__prefix i) {
  color: #409EFF;
  margin-right: 6px;
}

/* Badge 樣式 */
.el-badge {
  display: inline-block;
}

/* Header */
.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-left h2 {
  margin: 0;
  color: #2c5aa0;
  font-size: 20px;
}

.header-left h2 i {
  margin-right: 10px;
}

.email-stats {
  display: flex;
  gap: 40px;
  margin-top: 15px;
}

.stat-item {
  min-width: 120px;
}

.stat-item i {
  margin-right: 8px;
  color: #409EFF;
  font-size: 16px;
}

/* Custom El-Statistic styling */
.stat-item :deep(.el-statistic__head) {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.stat-item :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
}

.stat-item :deep(.el-statistic__content .el-statistic__number) {
  color: #409EFF;
}

.header-right {
  display: flex;
  gap: 10px;
}

/* Filters */
.filters {
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 15px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.slider-filter {
  display: flex;
  align-items: center;
  gap: 15px;
}

.slider-filter label {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

.limit-value {
  font-weight: bold;
  color: #409EFF;
  min-width: 50px;
}

/* Table Container - 移除固定高度，改用頁面級滾動 */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
  /* 注意：不設置固定高度，讓 table 自然撐開，由 .main-content 處理滾動 */
}

/* Expand cell */
.expand-cell {
  width: 40px;
  text-align: center;
  cursor: pointer;
}

.expand-icon {
  font-size: 12px;
  color: #409eff;
  transition: transform 0.2s;
}

/* Status icon */
.status-icon {
  font-size: 16px;
  cursor: default;
}

/* Info row content (vertical mode) */
.info-row-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row-content .recipient {
  font-weight: 500;
  color: #2c3e50;
}

.info-row-content .stat-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.info-row-content .stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 13px;
}

.info-row-content .stat-item.time {
  color: #909399;
}

.email-logs-table {
  width: 100%;
  border-collapse: collapse;
}

.email-logs-table th,
.email-logs-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.email-logs-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.email-logs-table tr:hover {
  background: #f5f7fa;
}

/* Trigger badges */
.trigger-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.trigger-notification {
  background: #E6F7FF;
  color: #1890FF;
}

.trigger-invitation {
  background: #F0F9FF;
  color: #52C41A;
}

.trigger-password {
  background: #FFF7E6;
  color: #FA8C16;
}

.trigger-security {
  background: #FFF0F6;
  color: #EB2F96;
}

.trigger-announcement {
  background: #F9F0FF;
  color: #722ED1;
}

.trigger-admin {
  background: #E6FFFB;
  color: #13C2C2;
}

.trigger-resend {
  background: #FFF7E6;
  color: #FAAD14;
}

.trigger-default {
  background: #F0F2F5;
  color: #8C8C8C;
}

/* Status indicator */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Status cell (icon only) */
.status-cell {
  text-align: center;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-info,
.btn-success,
.btn-danger {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-primary {
  background: #409EFF;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #66b1ff;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover {
  background: #a6a9ad;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #138496;
}

.btn-success {
  background: #67C23A;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #85ce61;
}

.btn-danger {
  background: #F56C6C;
  color: white;
}

.btn-danger:hover {
  background: #f78989;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* No data */
.no-data {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.no-data i {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.no-data p {
  margin: 0;
  font-size: 14px;
}

/* Loading more indicator */
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

.loading-more i {
  font-size: 18px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Count info */
.count-info {
  padding: 15px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
}

/* Progress dialog */
.progress-content {
  text-align: center;
  padding: 20px 0;
}

.progress-content p {
  margin-bottom: 20px;
  font-size: 14px;
  color: #606266;
}

/* Email Detail */
.email-detail {
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

.content-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  line-height: 1.6;
  color: #2c3e50;
  max-height: 400px;
  overflow-y: auto;

  /* 關鍵修改：隔離郵件 HTML 的影響 */
  isolation: isolate;              /* 創建新的堆疊上下文 */
  contain: layout style;           /* 限制佈局和樣式重排範圍 */
  box-sizing: border-box;
}

/* 限制郵件內容的元素不超出容器 */
.content-display :deep(*) {
  max-width: 100% !important;
  box-sizing: border-box !important;
}

/* 防止郵件內的表格破壞佈局 */
.content-display :deep(table) {
  width: 100% !important;
  max-width: 100% !important;
}

/* 防止郵件內的圖片超出容器 */
.content-display :deep(img) {
  max-width: 100% !important;
  height: auto !important;
}

.content-display pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-message {
  color: #F56C6C;
  font-family: monospace;
}

.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  margin: 20px -20px -20px -20px;
}

.detail-actions .btn-primary {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
}

</style>
