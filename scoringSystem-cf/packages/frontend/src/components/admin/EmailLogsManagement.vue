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
          @confirm="resendSelectedEmails"
          :disabled="selectedLogs.length === 0 || resending"
        >
          <template #reference>
            <el-badge :value="selectedLogs.length" :hidden="selectedLogs.length === 0">
              <el-tooltip content="重送選中的郵件" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :disabled="selectedLogs.length === 0 || resending"
                >
                  <i class="fas fa-redo"></i>
                  <span class="btn-text">重送郵件</span>
                </el-button>
              </el-tooltip>
            </el-badge>
          </template>
        </el-popconfirm>
      </template>
    </AdminFilterToolbar>

    <!-- Email Logs Table -->
    <div
      class="table-container"
      v-loading="loading"
      element-loading-text="載入郵件紀錄中..."
      v-infinite-scroll="loadMore"
      :infinite-scroll-disabled="scrollDisabled"
      :infinite-scroll-distance="200"
    >
      <table class="email-logs-table">
        <thead>
          <tr>
            <th width="50">
              <el-checkbox
                v-model="selectAll"
                @change="toggleSelectAll"
                :indeterminate="isIndeterminate"
              />
            </th>
            <th>收件人</th>
            <th>主旨</th>
            <th>觸發來源</th>
            <th>狀態</th>
            <th>發送時間</th>
            <th>耗時</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in displayedLogs" :key="log.logId">
            <td>
              <el-checkbox
                v-model="log.selected"
                @change="handleSelectionChange"
              />
            </td>
            <td>{{ log.recipient }}</td>
            <td class="subject-cell">{{ log.subject }}</td>
            <td>
              <span class="trigger-badge" :class="getTriggerClass(log.trigger)">
                {{ getTriggerText(log.trigger) }}
              </span>
            </td>
            <td>
              <div class="status-indicator">
                <i
                  :class="log.status === 'sent' ? 'fas fa-check-circle' : 'fas fa-times-circle'"
                  :style="{ color: log.status === 'sent' ? '#67C23A' : '#F56C6C' }"
                ></i>
                <span>{{ log.status === 'sent' ? '成功' : '失敗' }}</span>
              </div>
            </td>
            <td>{{ formatTime(log.timestamp) }}</td>
            <td>{{ formatDuration(log.durationMs) }}</td>
            <td class="actions">
              <button
                class="btn-sm btn-info"
                @click="viewLogDetail(log)"
                title="檢視詳情"
              >
                <i class="fas fa-eye"></i>
                檢視
              </button>
              <el-popconfirm
                :title="`確定要重送郵件給 ${log.recipient} 嗎？`"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="resendSingleEmail(log)"
                :disabled="resending"
              >
                <template #reference>
                  <button
                    class="btn-sm btn-primary"
                    :disabled="resending"
                    title="重送郵件"
                  >
                    <i class="fas fa-redo"></i>
                    重送
                  </button>
                </template>
              </el-popconfirm>
            </td>
          </tr>
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

    <!-- Email Log Detail Drawer -->
    <el-drawer
      v-model="showDetailDrawer"
      title="郵件詳情"
      direction="btt"
      size="100%"
      :before-close="handleDetailDrawerClose"
      :lock-scroll="false"
      :append-to-body="true"
      class="drawer-green"
    >

      <div v-if="selectedLog" class="email-detail">
        <!-- Basic Info -->
        <div class="detail-section">
          <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>郵件 ID</label>
              <div class="detail-value">{{ selectedLog.emailId }}</div>
            </div>
            <div class="detail-item">
              <label>日誌 ID</label>
              <div class="detail-value">{{ selectedLog.logId }}</div>
            </div>
            <div class="detail-item">
              <label>收件人</label>
              <div class="detail-value">{{ selectedLog.recipient }}</div>
            </div>
            <div class="detail-item">
              <label>收件人 ID</label>
              <div class="detail-value">{{ selectedLog.recipientUserId || '-' }}</div>
            </div>
            <div class="detail-item">
              <label>觸發來源</label>
              <div class="detail-value">
                <span class="trigger-badge" :class="getTriggerClass(selectedLog.trigger)">
                  {{ getTriggerText(selectedLog.trigger) }}
                </span>
              </div>
            </div>
            <div class="detail-item">
              <label>觸發者</label>
              <div class="detail-value">{{ selectedLog.triggeredBy || 'system' }}</div>
            </div>
            <div class="detail-item">
              <label>觸發類型</label>
              <div class="detail-value">{{ selectedLog.triggerSource || '-' }}</div>
            </div>
          </div>
        </div>

        <!-- Email Content -->
        <div class="detail-section">
          <h4><i class="fas fa-file-alt"></i> 郵件內容</h4>
          <div class="detail-item">
            <label>主旨</label>
            <div class="detail-value">{{ selectedLog.subject }}</div>
          </div>
          <div class="detail-item" style="margin-top: 15px;">
            <label>HTML 內容</label>
            <div class="content-display" v-html="sanitizedHtmlBody"></div>
          </div>
          <div class="detail-item" v-if="selectedLog.textBody" style="margin-top: 15px;">
            <label>純文字內容</label>
            <div class="content-display">{{ selectedLog.textBody }}</div>
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
                  :class="selectedLog.status === 'sent' ? 'fas fa-check-circle' : 'fas fa-times-circle'"
                  :style="{ color: selectedLog.status === 'sent' ? '#67C23A' : '#F56C6C' }"
                ></i>
                {{ selectedLog.status === 'sent' ? '發送成功' : '發送失敗' }}
              </div>
            </div>
            <div class="detail-item" v-if="selectedLog.statusCode">
              <label>HTTP 狀態碼</label>
              <div class="detail-value">{{ selectedLog.statusCode }}</div>
            </div>
            <div class="detail-item">
              <label>郵件大小</label>
              <div class="detail-value">{{ formatSize(selectedLog.emailSize) }}</div>
            </div>
            <div class="detail-item">
              <label>發送耗時</label>
              <div class="detail-value">{{ formatDuration(selectedLog.durationMs) }}</div>
            </div>
            <div class="detail-item">
              <label>重試次數</label>
              <div class="detail-value">{{ selectedLog.retryCount || 0 }}</div>
            </div>
            <div class="detail-item">
              <label>發送時間</label>
              <div class="detail-value">{{ formatTime(selectedLog.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- Error Info (if failed) -->
        <div class="detail-section" v-if="selectedLog.status === 'failed'">
          <h4><i class="fas fa-exclamation-triangle"></i> 錯誤資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>錯誤類型</label>
              <div class="detail-value">{{ selectedLog.errorType || '-' }}</div>
            </div>
            <div class="detail-item" style="grid-column: 1 / -1;">
              <label>錯誤訊息</label>
              <div class="content-display error-message">{{ selectedLog.error || '-' }}</div>
            </div>
          </div>
        </div>

        <!-- Email Context -->
        <div class="detail-section" v-if="selectedLog.emailContext">
          <h4><i class="fas fa-code"></i> 郵件上下文</h4>
          <div class="content-display">
            <pre>{{ formatJSON(selectedLog.emailContext) }}</pre>
          </div>
        </div>

        <!-- Actions -->
        <div class="detail-actions">
          <button
            class="btn-primary"
            @click="resendSingleEmailFromDetail"
            :disabled="resending"
          >
            <i class="fas fa-redo"></i>
            {{ resending ? '重送中...' : '重送郵件' }}
          </button>
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
import DOMPurify from 'dompurify'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'

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

interface EmailStatistics {
  total: number
  sent: number
  failed: number
  successRate: number
  byTrigger: Array<{ trigger: string; count: number; status: string }>
  last7Days: Array<{ date: string; count: number; status: string }>
  timestamp: number
}

// ================== Instance & Global ==================

const route = useRoute()
const router = useRouter()

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// ================== State ==================

const logs = ref<EmailLog[]>([])
const statistics = ref<EmailStatistics | null>(null)
const loading = ref<boolean>(false)
const resending = ref<boolean>(false)

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

// Selection
const selectAll = ref<boolean>(false)
const isIndeterminate = ref<boolean>(false)

// Infinite scroll
const displayCount = ref<number>(50)
const loadingMore = ref<boolean>(false)

// Progress
const showProgressDialog = ref<boolean>(false)
const progressMessage = ref<string>('')
const progressPercentage = ref<number>(0)
const progressStatus = ref<'' | 'success' | 'warning' | 'exception'>('')

// Detail drawer
const showDetailDrawer = ref<boolean>(false)
const selectedLog = ref<EmailLog | null>(null)

// ================== Constants ==================

const BATCH_SIZE = 50

// ================== Computed Properties ==================

const stats = computed(() => {
  if (statistics.value) {
    return {
      totalEmails: statistics.value.total,
      successRate: statistics.value.successRate,
      failedEmails: statistics.value.failed,
      last24Hours: calculateLast24Hours()
    }
  }
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

  // Display limit
  return filtered.slice(0, displayLimit.value)
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
  return loading.value || loadingMore.value || displayedLogs.value.length >= filteredLogs.value.length
})

const selectedLogs = computed<EmailLog[]>(() => {
  return logs.value.filter(l => l.selected)
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

watch([searchText, triggerFilter, statusFilter, dateRange], () => {
  displayCount.value = 50
})

// ================== Methods ==================

const calculateLast24Hours = (): number => {
  const now = Date.now()
  const yesterday = now - (24 * 60 * 60 * 1000)
  return logs.value.filter(l => l.timestamp >= yesterday).length
}

const loadEmailLogs = async (): Promise<void> => {
  loading.value = true
  try {
    const filters: any = {
      limit: 1000,
      offset: 0
    }

    const response = await adminApi.emailLogs.query({ filters })

    if (response.success && response.data) {
      const logsList = response.data.logs || []
      logs.value = logsList.map((l: any) => ({
        ...l,
        selected: false
      }))
    } else {
      // Display actual error message from API if available
      const errorMessage = response.error?.message || '無法載入郵件紀錄'
      ElMessage.error(errorMessage)
    }
  } catch (error: any) {
    console.error('Error loading email logs:', error)
    // Try to extract validation error message from response
    const errorMessage = error?.response?.error?.message || error?.message || '載入郵件紀錄失敗'
    ElMessage.error(errorMessage)
  } finally {
    loading.value = false
  }
}

const loadStatistics = async (): Promise<void> => {
  try {
    const response = await adminApi.emailLogs.statistics()

    if (response.success && response.data) {
      statistics.value = response.data
    }
  } catch (error) {
    console.error('Error loading statistics:', error)
  }
}

const refreshLogs = async (): Promise<void> => {
  await Promise.all([loadEmailLogs(), loadStatistics()])
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

const loadMore = (): void => {
  if (scrollDisabled.value) return

  loadingMore.value = true
  setTimeout(() => {
    displayCount.value += 50
    loadingMore.value = false
  }, 300)
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

      // Send batch request
      const response = await adminApi.emailLogs.resendBatch({
        logIds: batch.map(l => l.logId)
      })

      if (response.success && response.data) {
        const data = response.data as { successCount?: number; failedCount?: number }
        successCount += data.successCount || 0
        failedCount += data.failedCount || 0
      } else {
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
    const response = await adminApi.emailLogs.resendSingle({
      logId: log.logId
    })

    if (response.success) {
      ElMessage.success('郵件重送成功')
      // Refresh to show new log entry
      await refreshLogs()
    } else {
      ElMessage.error(`重送失敗: ${response.error?.message || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('Error resending email:', error)
    ElMessage.error('郵件重送失敗')
  } finally {
    resending.value = false
  }
}

const resendSingleEmailFromDetail = async (): Promise<void> => {
  if (selectedLog.value) {
    await resendSingleEmail(selectedLog.value)
    closeDetailDrawer()
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

const formatJSON = (jsonString: string | undefined): string => {
  if (!jsonString) return '-'
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2)
  } catch {
    return jsonString
  }
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
  return selectedLog.value ? sanitizeHTML(selectedLog.value.htmlBody) : ''
})

// Detail drawer methods
const viewLogDetail = (log: EmailLog): void => {
  selectedLog.value = log
  showDetailDrawer.value = true

  // Update URL to include emailId for sharing and bookmarking
  if (route.params.emailId !== log.emailId) {
    router.replace({
      name: 'admin-email-logs-detail',
      params: { emailId: log.emailId }
    })
  }
}

const closeDetailDrawer = (): void => {
  showDetailDrawer.value = false
  selectedLog.value = null

  // Navigate back to list view if currently on detail route
  if (route.name === 'admin-email-logs-detail') {
    router.push({ name: 'admin-email-logs' })
  }
}

const handleDetailDrawerClose = (done: () => void): void => {
  if (resending.value) {
    ElMessage.warning('正在處理中，請稍候...')
    return
  }
  done()
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

// ================== Lifecycle Hooks ==================

onMounted(async () => {
  await Promise.all([loadEmailLogs(), loadStatistics()])

  // Auto-open email detail if emailId parameter exists in URL
  if (route.params.emailId && typeof route.params.emailId === 'string') {
    await nextTick()

    const targetLog = logs.value.find(
      log => log.emailId === route.params.emailId || log.logId === route.params.emailId
    )

    if (targetLog) {
      viewLogDetail(targetLog)
    } else {
      ElMessage.warning('未找到指定的郵件記錄')
      router.push({ name: 'admin-email-logs' })
    }
  }

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshLogs)
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

/* Table */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
  max-height: calc(100vh - 400px);
  overflow-y: auto;
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

/* Subject cell */
.subject-cell {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* ========================================
   Drawer 佈局保護
   ======================================== */

/* 防止 Element Plus drawer 的 body 鎖定造成佈局偏移 */
:deep(.el-drawer.drawer-green) {
  position: fixed !important;
}

/* 確保不會添加 padding-right */
body:has(.el-drawer.drawer-green) {
  padding-right: 0 !important;
}

/* el-drawer header styles */
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
