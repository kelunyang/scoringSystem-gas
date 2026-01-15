<template>
  <div class="notification-management">
    <!-- Unified Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :loading="loading"
      :export-data="exportConfig.data"
      :export-filename="exportConfig.filename"
      :export-headers="exportConfig.headers"
      :export-row-mapper="exportConfig.rowMapper"
      :active-filter-count="activeFilterCount"
      :expanded-filter-count="2"
      @reset-filters="handleResetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">搜尋：</span>
          <el-input
            v-model="filters.searchText"
            placeholder="搜尋通知標題或內容..."
            clearable
            style="width: 300px;"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">郵件狀態：</span>
          <el-select v-model="filters.emailSentFilter" style="width: 150px;">
            <el-option label="全部狀態" value="all" />
            <el-option label="已寄送" value="sent" />
            <el-option label="未寄送" value="not_sent" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">閱讀狀態：</span>
          <el-select v-model="filters.readFilter" style="width: 150px;">
            <el-option label="全部" value="all" />
            <el-option label="已讀" value="read" />
            <el-option label="未讀" value="unread" />
          </el-select>
        </div>
      </template>

      <!-- Expanded Filters (Collapsible) -->
      <template #filters-expanded>
        <div class="filter-item">
          <span class="filter-label">通知類型：</span>
          <el-select v-model="filters.typeFilter" style="width: 200px;">
            <el-option label="全部類型" value="all" />
            <el-option label="作品提交" value="submission_created" />
            <el-option label="作品撤回" value="submission_withdrawn" />
            <el-option label="作品批准" value="submission_approved" />
            <el-option label="階段狀態變更" value="stage_status_changed" />
            <el-option label="排名提案提交" value="ranking_proposal_submitted" />
            <el-option label="排名提案撤回" value="ranking_proposal_withdrawn" />
            <el-option label="排名提案批准" value="ranking_proposal_approved" />
            <el-option label="評論提及" value="comment_mentioned" />
            <el-option label="評論回覆" value="comment_replied" />
            <el-option label="結算失敗" value="settlement_failed" />
            <el-option label="專案角色分配" value="project_role_assigned" />
            <el-option label="專案角色移除" value="project_role_removed" />
            <el-option label="群組成員新增" value="group_member_added" />
            <el-option label="群組成員移除" value="group_member_removed" />
            <el-option label="帳戶鎖定" value="account_locked" />
            <el-option label="帳戶解鎖" value="account_unlocked" />
            <el-option label="密碼重設成功" value="password_reset_success" />
            <el-option label="投票重置" value="vote_reset" />
            <el-option label="專案資訊更新" value="project_info_updated" />
          </el-select>
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
          :title="`確定要發送 ${((selectedNotifications || []).filter(n => !n.emailSent).length)} 封通知郵件嗎？`"
          confirm-button-text="確定"
          cancel-button-text="取消"
          @confirm="sendSelectedEmails"
          :disabled="((selectedNotifications || []).length) === 0 || sendingEmails"
        >
          <template #reference>
            <el-badge :value="(selectedNotifications || []).length" :hidden="((selectedNotifications || []).length) === 0">
              <el-button
                type="primary"
                size="small"
                :disabled="((selectedNotifications || []).length) === 0 || sendingEmails"
                title="發送選中的通知"
              >
                <i class="fas fa-paper-plane"></i>
                <span class="btn-text">發送通知</span>
              </el-button>
            </el-badge>
          </template>
        </el-popconfirm>
      </template>
    </AdminFilterToolbar>

    <!-- Statistics Card -->
    <el-card class="stats-card">
      <el-row :gutter="20">
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總通知數" :value="stats.totalNotifications" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="已讀" :value="stats.readNotifications" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="未讀" :value="stats.totalNotifications - stats.readNotifications" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="已發送郵件" :value="stats.emailSentNotifications" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="待發送郵件" :value="stats.totalNotifications - stats.emailSentNotifications" />
        </el-col>
        <el-col v-if="activeFilterCount > 0" :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="搜尋結果" :value="filteredNotifications.length" />
        </el-col>
      </el-row>
    </el-card>

    <!-- Notification Table (頁面級滾動) -->
    <div class="table-container">
      <div
        v-loading="loading"
        element-loading-text="載入通知資料中..."
      >
      <table class="notification-table" role="table" aria-label="通知列表">
        <thead>
          <tr role="row">
            <th width="40" scope="col"></th>
            <th width="50" scope="col">
              <el-checkbox
                v-model="selectAll"
                :indeterminate="isIndeterminate"
                aria-label="全選通知"
              />
            </th>
            <th scope="col">收件人</th>
            <th scope="col">通知類型</th>
            <th scope="col">專案</th>
            <th scope="col">狀態</th>
            <th scope="col">創建時間</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="notification in displayedNotifications" :key="notification.notificationId">
            <ExpandableTableRow
              :is-expanded="expandedNotificationId === notification.notificationId"
              :expansion-colspan="8"
              :enable-responsive-rows="true"
              :actions-colspan="4"
              @toggle-expansion="handleToggleExpansion(notification)"
            >
              <!-- 橫屏模式：單行顯示所有欄位 -->
              <template #main="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td @click.stop>
                  <el-checkbox
                    :model-value="isSelected(notification.notificationId)"
                    @change="toggleSelection(notification.notificationId)"
                    :aria-label="`選擇通知: ${notification.title}`"
                  />
                </td>
                <td>{{ notification.targetUserEmail }}</td>
                <td>
                  <el-tag size="small" :class="getTypeClass(notification.type)">
                    {{ getTypeText(notification.type) }}
                  </el-tag>
                </td>
                <td>{{ notification.projectName || '-' }}</td>
                <td>
                  <div class="status-indicators">
                    <i
                      :class="notification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                      :style="{ color: notification.isRead ? '#67C23A' : '#909399' }"
                      :title="notification.isRead ? '已讀' : '未讀'"
                      :aria-label="notification.isRead ? '已讀' : '未讀'"
                    ></i>
                    <i
                      :class="notification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                      :style="{ color: notification.emailSent ? '#409EFF' : '#909399' }"
                      :title="notification.emailSent ? '已發送郵件' : '未發送郵件'"
                      :aria-label="notification.emailSent ? '已發送' : '未發送'"
                    ></i>
                  </div>
                </td>
                <td>{{ formatTime(notification.createdTime) }}</td>
                <td class="actions" @click.stop>
                  <el-popconfirm
                    :title="`確定要發送通知郵件給 ${notification.targetUserEmail} 嗎？`"
                    confirm-button-text="確定"
                    cancel-button-text="取消"
                    @confirm="sendSingleEmail(notification)"
                    :disabled="notification.emailSent || sendingEmails"
                  >
                    <template #reference>
                      <el-button
                        type="primary"
                        size="small"
                        circle
                        :disabled="notification.emailSent || sendingEmails"
                        :title="notification.emailSent ? '已發送' : '發送郵件'"
                      >
                        <i class="fas fa-paper-plane"></i>
                      </el-button>
                    </template>
                  </el-popconfirm>
                  <el-popconfirm
                    title="確定要刪除此通知嗎？"
                    confirm-button-text="確定"
                    cancel-button-text="取消"
                    @confirm="deleteNotification(notification)"
                  >
                    <template #reference>
                      <el-button
                        type="danger"
                        size="small"
                        circle
                        title="刪除通知"
                      >
                        <i class="fas fa-trash"></i>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </td>
              </template>

              <!-- 豎屏模式：資訊行 -->
              <template #info="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td @click.stop>
                  <el-checkbox
                    :model-value="isSelected(notification.notificationId)"
                    @change="toggleSelection(notification.notificationId)"
                    :aria-label="`選擇通知: ${notification.title}`"
                  />
                </td>
                <td colspan="2">
                  <div class="info-row-content">
                    <span class="email-text">{{ notification.targetUserEmail }}</span>
                    <el-tag size="small" :class="getTypeClass(notification.type)">
                      {{ getTypeText(notification.type) }}
                    </el-tag>
                    <div class="status-indicators">
                      <i
                        :class="notification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                        :style="{ color: notification.isRead ? '#67C23A' : '#909399' }"
                      ></i>
                      <i
                        :class="notification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                        :style="{ color: notification.emailSent ? '#409EFF' : '#909399' }"
                      ></i>
                    </div>
                  </div>
                </td>
              </template>

              <!-- 豎屏模式：操作行 -->
              <template #actions>
                <el-popconfirm
                  :title="`確定要發送通知郵件給 ${notification.targetUserEmail} 嗎？`"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  @confirm="sendSingleEmail(notification)"
                  :disabled="notification.emailSent || sendingEmails"
                >
                  <template #reference>
                    <el-button
                      type="primary"
                      size="small"
                      :disabled="notification.emailSent || sendingEmails"
                    >
                      <i class="fas fa-paper-plane"></i>
                      {{ notification.emailSent ? '已發送' : '發送' }}
                    </el-button>
                  </template>
                </el-popconfirm>
                <el-popconfirm
                  title="確定要刪除此通知嗎？"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  @confirm="deleteNotification(notification)"
                >
                  <template #reference>
                    <el-button type="danger" size="small">
                      <i class="fas fa-trash"></i>
                    </el-button>
                  </template>
                </el-popconfirm>
                <span class="time-text">{{ formatTime(notification.createdTime) }}</span>
              </template>

              <!-- 展開區域：通知詳情 -->
              <template #default>
                <div class="notification-expanded-detail">
                  <h4><i class="fas fa-info-circle"></i> 通知詳情</h4>
                  <div class="detail-grid">
                    <div class="detail-item">
                      <label>通知標題</label>
                      <div class="detail-value">{{ notification.title }}</div>
                    </div>
                    <div class="detail-item">
                      <label>關聯專案</label>
                      <div class="detail-value">{{ notification.projectName || '無' }}</div>
                    </div>
                    <div class="detail-item">
                      <label>創建時間</label>
                      <div class="detail-value">{{ formatTime(notification.createdTime) }}</div>
                    </div>
                    <div class="detail-item" v-if="notification.readTime">
                      <label>讀取時間</label>
                      <div class="detail-value">{{ formatTime(notification.readTime) }}</div>
                    </div>
                    <div class="detail-item" v-if="notification.emailSentTime">
                      <label>郵件發送時間</label>
                      <div class="detail-value">{{ formatTime(notification.emailSentTime) }}</div>
                    </div>
                  </div>
                  <div class="content-section">
                    <label>通知內容</label>
                    <div class="content-display">{{ notification.content }}</div>
                  </div>
                </div>
              </template>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <EmptyState
        v-if="(displayedNotifications || []).length === 0 && !loading"
        parent-icon="fa-bell"
        :icons="['fa-bell-slash']"
        title="沒有找到符合條件的通知"
        :enable-animation="false"
      />

      <!-- Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more" role="status" aria-live="polite">
        <i class="el-icon-loading"></i>
        <span>載入更多通知...</span>
      </div>

      <!-- Show count info -->
      <div v-if="(displayedNotifications || []).length > 0" class="count-info" role="status" aria-live="polite">
        顯示 {{ (displayedNotifications || []).length }} / {{ (filteredNotifications || []).length }} 筆通知
      </div>
      </div>
    </div>

    <!-- Progress Dialog -->
    <el-dialog
      v-model="showProgressDialog"
      title="發送郵件進度"
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
import { ref, computed, watch, onMounted, shallowRef, inject, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import { useNotificationFilters, type Notification, type NotificationType } from '@/composables/useNotificationFilters'
import { useNotificationSelection } from '@/composables/useNotificationSelection'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import { useWindowInfiniteScroll } from '@/composables/useWindowInfiniteScroll'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'

// ================== Interfaces ==================

interface BatchSendResponse {
  success: boolean
  data: {
    successCount: number
    errorCount: number
    sentIds?: string[]
  }
  error?: {
    message: string
  }
}

// ================== State ==================

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// Use shallowRef for large arrays to avoid deep reactivity overhead
const notifications = shallowRef<Notification[]>([])
const loading = ref(false)
const sendingEmails = ref(false)


// Filter persistence (localStorage)
const { filters, isLoaded: filtersLoaded } = useFilterPersistence('notificationManagement', {
  searchText: '',
  emailSentFilter: 'all' as 'all' | 'sent' | 'not_sent',
  readFilter: 'all' as 'all' | 'read' | 'unread',
  typeFilter: 'all' as NotificationType | 'all',
  displayLimit: 100
})

// Create reactive refs for backward compatibility with useNotificationFilters
const searchText = computed({
  get: () => filters.value.searchText,
  set: (val) => { filters.value.searchText = val }
})
const emailSentFilter = computed({
  get: () => filters.value.emailSentFilter,
  set: (val) => { filters.value.emailSentFilter = val }
})
const readFilter = computed({
  get: () => filters.value.readFilter,
  set: (val) => { filters.value.readFilter = val }
})
const typeFilter = computed({
  get: () => filters.value.typeFilter,
  set: (val) => { filters.value.typeFilter = val }
})
const displayLimit = computed({
  get: () => filters.value.displayLimit,
  set: (val) => { filters.value.displayLimit = val }
})

// Create temporary refs to pass to useNotificationFilters
const _searchText = ref(filters.value.searchText)
const _emailSentFilter = ref(filters.value.emailSentFilter)
const _readFilter = ref(filters.value.readFilter)
const _typeFilter = ref(filters.value.typeFilter)
const _displayLimit = ref(filters.value.displayLimit)

// Sync computed -> temporary refs
watch(() => filters.value.searchText, (val) => { _searchText.value = val })
watch(() => filters.value.emailSentFilter, (val) => { _emailSentFilter.value = val })
watch(() => filters.value.readFilter, (val) => { _readFilter.value = val })
watch(() => filters.value.typeFilter, (val) => { _typeFilter.value = val })
watch(() => filters.value.displayLimit, (val) => { _displayLimit.value = val })

// Filters (using composable with temporary refs)
const tempFiltersObject = {
  searchText: _searchText,
  emailSentFilter: _emailSentFilter,
  readFilter: _readFilter,
  typeFilter: _typeFilter,
  displayLimit: _displayLimit,
  filteredNotifications: computed(() => {
    if (!notifications.value) return []
    const search = _searchText.value.toLowerCase()
    const hasSearch = search.length > 0
    const limit = _displayLimit.value
    const result: Notification[] = []
    for (const n of notifications.value) {
      if (result.length >= limit) break
      if (hasSearch) {
        const matchesTitle = n.title.toLowerCase().includes(search)
        const matchesContent = n.content.toLowerCase().includes(search)
        const matchesEmail = n.targetUserEmail.toLowerCase().includes(search)
        if (!matchesTitle && !matchesContent && !matchesEmail) continue
      }
      if (_emailSentFilter.value === 'sent' && !n.emailSent) continue
      if (_emailSentFilter.value === 'not_sent' && n.emailSent) continue
      if (_readFilter.value === 'read' && !n.isRead) continue
      if (_readFilter.value === 'unread' && n.isRead) continue
      if (_typeFilter.value !== 'all' && n.type !== _typeFilter.value) continue
      result.push(n)
    }
    return result
  }),
  stats: computed(() => {
    if (!notifications.value) {
      return {
        totalNotifications: 0,
        readNotifications: 0,
        emailSentNotifications: 0
      }
    }
    return {
      totalNotifications: notifications.value.length,
      readNotifications: notifications.value.filter(n => n.isRead).length,
      emailSentNotifications: notifications.value.filter(n => n.emailSent).length
    }
  }),
  resetFilters: () => {
    filters.value.searchText = ''
    filters.value.emailSentFilter = 'all'
    filters.value.readFilter = 'all'
    filters.value.typeFilter = 'all'
    filters.value.displayLimit = 100
  }
}

const {
  filteredNotifications,
  stats
} = tempFiltersObject

// Selection (using composable)
const {
  selectedNotifications,
  selectAll,
  isIndeterminate,
  isSelected,
  toggleSelection
} = useNotificationSelection(filteredNotifications)

// Infinite scroll (using composable for client-side pagination)
const {
  displayedItems: displayedNotifications,
  loadingMore: clientLoadingMore,
  scrollDisabled,
  loadMore
} = useInfiniteScroll(filteredNotifications, { pageSize: 50 })

// 使用頁面級滾動的無限載入
const { loadingMore } = useWindowInfiniteScroll(
  computed(() => !scrollDisabled.value),
  loading,
  loadMore
)

// Progress
const showProgressDialog = ref(false)
const progressMessage = ref('')
const progressPercentage = ref(0)
const progressStatus = ref<'' | 'success' | 'warning' | 'exception'>('')

// Expandable row tracking
const expandedNotificationId = ref<string | null>(null)

// Active filter count for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.searchText) count++
  if (filters.value.emailSentFilter !== 'all') count++
  if (filters.value.readFilter !== 'all') count++
  if (filters.value.typeFilter !== 'all') count++
  if (filters.value.displayLimit !== 100) count++
  return count
})

// ================== Constants ==================

const BATCH_SIZE = 50

// Type mapping constants (using satisfies for type safety)
const TYPE_TEXT_MAP = {
  'submission_created': '作品提交',
  'submission_withdrawn': '作品撤回',
  'submission_approved': '作品批准',
  'stage_status_changed': '階段狀態變更',
  'ranking_proposal_submitted': '排名提案提交',
  'ranking_proposal_withdrawn': '排名提案撤回',
  'ranking_proposal_approved': '排名提案批准',
  'comment_mentioned': '評論提及',
  'comment_replied': '評論回覆',
  'settlement_failed': '結算失敗',
  'project_role_assigned': '專案角色分配',
  'project_role_removed': '專案角色移除',
  'group_member_added': '群組成員新增',
  'group_member_removed': '群組成員移除',
  'account_locked': '帳戶鎖定',
  'account_unlocked': '帳戶解鎖',
  'password_reset_success': '密碼重設成功',
  'vote_reset': '投票重置',
  'project_info_updated': '專案資訊更新'
} satisfies Record<NotificationType, string>

const TYPE_CLASS_MAP = {
  'submission_created': 'type-submission',
  'submission_withdrawn': 'type-submission',
  'submission_approved': 'type-submission',
  'stage_status_changed': 'type-stage',
  'ranking_proposal_submitted': 'type-ranking',
  'ranking_proposal_withdrawn': 'type-ranking',
  'ranking_proposal_approved': 'type-ranking',
  'comment_mentioned': 'type-comment',
  'comment_replied': 'type-comment',
  'settlement_failed': 'type-error',
  'project_role_assigned': 'type-role',
  'project_role_removed': 'type-role',
  'group_member_added': 'type-group',
  'group_member_removed': 'type-group',
  'account_locked': 'type-account',
  'account_unlocked': 'type-account',
  'password_reset_success': 'type-account',
  'vote_reset': 'type-vote',
  'project_info_updated': 'type-project'
} satisfies Record<NotificationType, string>

// ================== Export Config ==================

const exportConfig = computed(() => ({
  data: filteredNotifications.value as unknown as Record<string, unknown>[],
  filename: '通知列表',
  headers: ['收件人', '類型', '標題', '內容', '專案', '已讀', '已發送郵件', '創建時間', '讀取時間', '郵件發送時間'],
  rowMapper: (n: Record<string, unknown>) => {
    const notification = n as unknown as Notification
    return [
      notification.targetUserEmail,
      getTypeText(notification.type),
      notification.title,
      notification.content,
      notification.projectName || '-',
      notification.isRead ? '是' : '否',
      notification.emailSent ? '是' : '否',
      new Date(notification.createdTime).toLocaleString('zh-TW'),
      notification.readTime ? new Date(notification.readTime).toLocaleString('zh-TW') : '-',
      notification.emailSentTime ? new Date(notification.emailSentTime).toLocaleString('zh-TW') : '-'
    ]
  }
}))

// ================== Methods ==================

const loadNotifications = async (): Promise<void> => {
  loading.value = true
  try {
    const response = await adminApi.notifications.list({})

    if (response.success && response.data) {
      const notificationList = response.data.notifications || response.data || []
      const notificationArray = Array.isArray(notificationList) ? notificationList : []
      // projectName is now returned directly from API via LEFT JOIN
      notifications.value = notificationArray as unknown as Notification[]
    } else {
      throw new Error(response.error?.message || '無法載入通知資料')
    }
  } catch (error) {
    console.error('Error loading notifications:', error)
    ElMessage.error('載入通知失敗')
  } finally {
    loading.value = false
  }
}

const refreshNotifications = async (): Promise<void> => {
  await loadNotifications()
  ElMessage.success('通知資料已更新')
}

const handleResetFilters = (): void => {
  // Reset all filter values to defaults
  filters.value.searchText = ''
  filters.value.emailSentFilter = 'all'
  filters.value.readFilter = 'all'
  filters.value.typeFilter = 'all'
  filters.value.displayLimit = 100

  // Clear localStorage to prevent stale filters on reload
  localStorage.removeItem('filters:notificationManagement')
}

const sendSelectedEmails = async (): Promise<void> => {
  const selected = selectedNotifications.value.filter(n => !n.emailSent)
  if (selected.length === 0) {
    ElMessage.warning('請選擇未發送的通知')
    return
  }

  sendingEmails.value = true
  showProgressDialog.value = true
  progressPercentage.value = 0
  progressStatus.value = ''

  let successCount = 0
  let errorCount = 0

  try {
    // Process in batches of 50
    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      const batch = selected.slice(i, Math.min(i + BATCH_SIZE, selected.length))
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(selected.length / BATCH_SIZE)

      progressMessage.value = `處理第 ${batchNumber}/${totalBatches} 批 (每批最多 ${BATCH_SIZE} 封)`

      // Send batch request
      const response = await adminApi.notifications.sendBatch({
        notificationIds: batch.map(n => n.notificationId)
      } as any) as unknown as BatchSendResponse

      if (response.success) {
        successCount += response.data.successCount || 0
        errorCount += response.data.errorCount || 0

        // Update local state for successfully sent notifications
        if (response.data.sentIds) {
          // Create a new array to trigger reactivity (since we use shallowRef)
          notifications.value = notifications.value.map(n => {
            if (response.data.sentIds && response.data.sentIds.includes(n.notificationId)) {
              return {
                ...n,
                emailSent: true,
                emailSentTime: Date.now()
              }
            }
            return n
          })
        }
      } else {
        errorCount += batch.length
      }

      // Update progress
      progressPercentage.value = Math.round(((i + batch.length) / selected.length) * 100)
    }

    progressStatus.value = errorCount > 0 ? 'warning' : 'success'
    progressMessage.value = `完成！成功發送 ${successCount} 封，失敗 ${errorCount} 封`

    setTimeout(() => {
      showProgressDialog.value = false
      if (successCount > 0) {
        ElMessage.success(`成功發送 ${successCount} 封通知郵件`)
      }
      if (errorCount > 0) {
        ElMessage.warning(`${errorCount} 封郵件發送失敗`)
      }
    }, 2000)

  } catch (error) {
    console.error('Error sending emails:', error)
    progressStatus.value = 'exception'
    progressMessage.value = '發送過程中發生錯誤'
    setTimeout(() => {
      showProgressDialog.value = false
      ElMessage.error('郵件發送失敗')
    }, 2000)
  } finally {
    sendingEmails.value = false
  }
}

const sendSingleEmail = async (notification: Notification): Promise<void> => {
  if (notification.emailSent) {
    ElMessage.warning('此通知已經發送過郵件')
    return
  }

  sendingEmails.value = true
  try {
    const response = await adminApi.notifications.sendSingle({
      notificationId: notification.notificationId
    } as any)

    if (response.success) {
      // Update local state (create new array for shallowRef)
      notifications.value = notifications.value.map(n =>
        n.notificationId === notification.notificationId
          ? { ...n, emailSent: true, emailSentTime: Date.now() }
          : n
      )
      ElMessage.success('郵件發送成功')
    } else {
      throw new Error(response.error?.message || '發送失敗')
    }
  } catch (error) {
    console.error('Error sending email:', error)
    ElMessage.error(`發送失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
  } finally {
    sendingEmails.value = false
  }
}

const deleteNotification = async (notification: Notification): Promise<void> => {
  try {
    const response = await adminApi.notifications.delete({
      notificationId: notification.notificationId
    })

    if (response.success) {
      // Remove from local list (create new array for shallowRef)
      notifications.value = notifications.value.filter(
        n => n.notificationId !== notification.notificationId
      )
      ElMessage.success('通知已刪除')
    } else {
      throw new Error(response.error?.message || '刪除失敗')
    }
  } catch (error) {
    console.error('Error deleting notification:', error)
    ElMessage.error(`刪除失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
  }
}

const formatTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

// Expandable row methods
const handleToggleExpansion = (notification: Notification): void => {
  if (expandedNotificationId.value === notification.notificationId) {
    expandedNotificationId.value = null
  } else {
    expandedNotificationId.value = notification.notificationId
  }
}

const getTypeText = (type: NotificationType | string): string => {
  return TYPE_TEXT_MAP[type as NotificationType] || type || '未知類型'
}

const getTypeClass = (type: NotificationType | string): string => {
  return TYPE_CLASS_MAP[type as NotificationType] || 'type-default'
}

// ================== Lifecycle Hooks ==================

onMounted(() => {
  loadNotifications()

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshNotifications)
})

onBeforeUnmount(() => {
  // Cleanup: unregister refresh function
  registerRefresh(null)
})
</script>

<style scoped>
.notification-management {
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

.notification-stats {
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

/* Table */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

.notification-table {
  width: 100%;
  border-collapse: collapse;
}

.notification-table th,
.notification-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.notification-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.notification-table tr:hover {
  background: #f5f7fa;
}

/* Content cell */
.content-cell {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Type tags - using el-tag with custom colors */
:deep(.el-tag.type-submission) {
  background: #E6F7FF !important;
  color: #1890FF !important;
  border-color: #91D5FF !important;
}

:deep(.el-tag.type-stage) {
  background: #FFF7E6 !important;
  color: #FA8C16 !important;
  border-color: #FFD591 !important;
}

:deep(.el-tag.type-ranking) {
  background: #F0F9FF !important;
  color: #52C41A !important;
  border-color: #B7EB8F !important;
}

:deep(.el-tag.type-comment) {
  background: #F9F0FF !important;
  color: #722ED1 !important;
  border-color: #D3ADF7 !important;
}

:deep(.el-tag.type-error) {
  background: #FFF1F0 !important;
  color: #F5222D !important;
  border-color: #FFA39E !important;
}

:deep(.el-tag.type-role) {
  background: #FFF0F6 !important;
  color: #EB2F96 !important;
  border-color: #FFADD2 !important;
}

:deep(.el-tag.type-group) {
  background: #F6FFED !important;
  color: #389E0D !important;
  border-color: #95DE64 !important;
}

:deep(.el-tag.type-account) {
  background: #FFFBE6 !important;
  color: #D48806 !important;
  border-color: #FFE58F !important;
}

:deep(.el-tag.type-vote) {
  background: #E6FFFB !important;
  color: #13C2C2 !important;
  border-color: #87E8DE !important;
}

:deep(.el-tag.type-project) {
  background: #F0F2F5 !important;
  color: #595959 !important;
  border-color: #D9D9D9 !important;
}

:deep(.el-tag.type-default) {
  background: #F0F2F5 !important;
  color: #8C8C8C !important;
  border-color: #D9D9D9 !important;
}

/* Status indicators */
.status-indicators {
  display: flex;
  gap: 10px;
  font-size: 16px;
}

/* Info row content (vertical mode) */
.info-row-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.info-row-content .email-text {
  font-weight: 500;
  color: #2c3e50;
  flex-shrink: 0;
}

/* Time text in actions row */
.time-text {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
  white-space: nowrap;
}

/* Notification expanded detail */
.notification-expanded-detail {
  padding: 0;
}

.notification-expanded-detail h4 {
  margin: 0 0 16px 0;
  color: #374151;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 12px;
}

.notification-expanded-detail h4 i {
  color: #409eff;
  margin-right: 8px;
}

.notification-expanded-detail .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.notification-expanded-detail .detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-expanded-detail .detail-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.notification-expanded-detail .detail-value {
  color: #2c3e50;
  font-size: 14px;
}

.notification-expanded-detail .content-section {
  margin-top: 16px;
}

.notification-expanded-detail .content-section label {
  display: block;
  font-weight: 500;
  color: #6c757d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.notification-expanded-detail .content-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  line-height: 1.6;
  color: #2c3e50;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
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

/* el-scrollbar height */
.table-container {
  height: calc(100vh - 400px);
}

/* Title cell - normal text, no clickable styling */
.title-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
