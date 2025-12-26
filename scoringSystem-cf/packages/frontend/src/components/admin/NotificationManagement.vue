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
            <el-option label="階段開始" value="stage_start" />
            <el-option label="階段投票" value="stage_voting" />
            <el-option label="階段完成" value="stage_completed" />
            <el-option label="評論提及" value="comment_mention" />
            <el-option label="群組提及" value="group_mention" />
            <el-option label="新評論" value="new_comment" />
            <el-option label="評論投票" value="comment_vote" />
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
              <el-tooltip content="發送選中的通知" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :disabled="((selectedNotifications || []).length) === 0 || sendingEmails"
                >
                  <i class="fas fa-paper-plane"></i>
                  <span class="btn-text">發送通知</span>
                </el-button>
              </el-tooltip>
            </el-badge>
          </template>
        </el-popconfirm>
      </template>
    </AdminFilterToolbar>

    <!-- Notification Table with Infinite Scroll -->
    <div
      class="table-container"
      v-loading="loading"
      element-loading-text="載入通知資料中..."
      v-infinite-scroll="loadMore"
      :infinite-scroll-disabled="scrollDisabled"
      :infinite-scroll-distance="200"
    >
      <table class="notification-table" role="table" aria-label="通知列表">
        <thead>
          <tr role="row">
            <th width="50" scope="col">
              <el-checkbox
                v-model="selectAll"
                :indeterminate="isIndeterminate"
                aria-label="全選通知"
              />
            </th>
            <th scope="col">收件人</th>
            <th scope="col">通知類型</th>
            <th scope="col">標題</th>
            <th scope="col">專案</th>
            <th scope="col">狀態</th>
            <th scope="col">創建時間</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="notification in displayedNotifications" :key="notification.notificationId" role="row">
            <td>
              <el-checkbox
                :model-value="isSelected(notification.notificationId)"
                @change="toggleSelection(notification.notificationId)"
                :aria-label="`選擇通知: ${notification.title}`"
              />
            </td>
            <td>{{ notification.targetUserEmail }}</td>
            <td>
              <span class="type-badge" :class="getTypeClass(notification.type)">
                {{ getTypeText(notification.type) }}
              </span>
            </td>
            <td class="title-cell">
              {{ notification.title }}
            </td>
            <td>{{ notification.projectName || '-' }}</td>
            <td>
              <div class="status-indicators">
                <el-tooltip content="閱讀狀態" placement="top">
                  <i
                    :class="notification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                    :style="{ color: notification.isRead ? '#67C23A' : '#909399' }"
                    :aria-label="notification.isRead ? '已讀' : '未讀'"
                  ></i>
                </el-tooltip>
                <el-tooltip content="郵件發送狀態" placement="top">
                  <i
                    :class="notification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                    :style="{ color: notification.emailSent ? '#409EFF' : '#909399' }"
                    :aria-label="notification.emailSent ? '已發送' : '未發送'"
                  ></i>
                </el-tooltip>
              </div>
            </td>
            <td>{{ formatTime(notification.createdTime) }}</td>
            <td class="actions">
              <button
                class="btn-sm btn-info"
                @click="viewNotificationDetail(notification)"
                :aria-label="`檢視通知: ${notification.title}`"
              >
                <i class="fas fa-eye"></i>
                檢視
              </button>
              <el-popconfirm
                :title="`確定要發送通知郵件給 ${notification.targetUserEmail} 嗎？`"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="sendSingleEmail(notification)"
                :disabled="notification.emailSent || sendingEmails"
              >
                <template #reference>
                  <button
                    class="btn-sm btn-primary"
                    :disabled="notification.emailSent || sendingEmails"
                    :aria-label="`發送郵件給 ${notification.targetUserEmail}`"
                  >
                    <i class="fas fa-paper-plane"></i>
                    {{ notification.emailSent ? '已發送' : '發送' }}
                  </button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                title="確定要刪除此通知嗎？"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="deleteNotification(notification)"
              >
                <template #reference>
                  <button
                    class="btn-sm btn-danger"
                    :aria-label="`刪除通知: ${notification.title}`"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </template>
              </el-popconfirm>
            </td>
          </tr>
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

    <!-- Notification Detail Drawer -->
    <el-drawer
      v-model="showDetailDrawer"
      title="通知詳情"
      direction="btt"
      size="100%"
      :before-close="handleDetailDrawerClose"
      class="drawer-green"
    >

      <div v-if="selectedNotification" class="notification-detail">
        <!-- Basic Info -->
        <div class="detail-section">
          <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>通知標題</label>
              <div class="detail-value">{{ selectedNotification.title }}</div>
            </div>
            <div class="detail-item">
              <label>收件人</label>
              <div class="detail-value">{{ selectedNotification.targetUserEmail }}</div>
            </div>
            <div class="detail-item">
              <label>通知類型</label>
              <div class="detail-value">
                <span class="type-badge" :class="getTypeClass(selectedNotification.type)">
                  {{ getTypeText(selectedNotification.type) }}
                </span>
              </div>
            </div>
            <div class="detail-item">
              <label>關聯專案</label>
              <div class="detail-value">{{ selectedNotification.projectName || '無' }}</div>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="detail-section">
          <h4><i class="fas fa-file-alt"></i> 通知內容</h4>
          <div class="content-display">
            {{ selectedNotification.content }}
          </div>
        </div>

        <!-- Status -->
        <div class="detail-section">
          <h4><i class="fas fa-chart-line"></i> 狀態資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>閱讀狀態</label>
              <div class="detail-value">
                <i
                  :class="selectedNotification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                  :style="{ color: selectedNotification.isRead ? '#67C23A' : '#909399' }"
                ></i>
                {{ selectedNotification.isRead ? '已讀' : '未讀' }}
              </div>
            </div>
            <div class="detail-item">
              <label>郵件發送</label>
              <div class="detail-value">
                <i
                  :class="selectedNotification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                  :style="{ color: selectedNotification.emailSent ? '#409EFF' : '#909399' }"
                ></i>
                {{ selectedNotification.emailSent ? '已發送' : '未發送' }}
              </div>
            </div>
            <div class="detail-item">
              <label>創建時間</label>
              <div class="detail-value">{{ formatTime(selectedNotification.createdTime) }}</div>
            </div>
            <div class="detail-item" v-if="selectedNotification.emailSentTime">
              <label>發送時間</label>
              <div class="detail-value">{{ formatTime(selectedNotification.emailSentTime) }}</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="detail-actions">
          <button
            v-if="!selectedNotification.emailSent"
            class="btn-primary"
            @click="sendSingleEmailFromDetail"
            :disabled="sendingEmails"
          >
            <i class="fas fa-paper-plane"></i>
            {{ sendingEmails ? '發送中...' : '發送郵件' }}
          </button>
          <button
            class="btn-danger"
            @click="deleteNotificationFromDetail"
          >
            <i class="fas fa-trash"></i>
            刪除通知
          </button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef, inject, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { adminApi } from '@/api/admin'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useNotificationFilters, type Notification, type NotificationType } from '@/composables/useNotificationFilters'
import { useNotificationSelection } from '@/composables/useNotificationSelection'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'

// ================== Interfaces ==================

interface Project {
  projectId: string
  projectName: string
}

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
const projects = ref<Project[]>([])

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

// Infinite scroll (using composable)
const {
  displayedItems: displayedNotifications,
  loadingMore,
  scrollDisabled,
  loadMore
} = useInfiniteScroll(filteredNotifications, { pageSize: 50 })

// Progress
const showProgressDialog = ref(false)
const progressMessage = ref('')
const progressPercentage = ref(0)
const progressStatus = ref<'' | 'success' | 'warning' | 'exception'>('')

// Detail drawer
const showDetailDrawer = ref(false)
const selectedNotification = ref<Notification | null>(null)

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
  'stage_start': '階段開始',
  'stage_voting': '階段投票',
  'stage_completed': '階段完成',
  'comment_mention': '評論提及',
  'group_mention': '群組提及',
  'new_comment': '新評論',
  'comment_vote': '評論投票'
} satisfies Record<NotificationType, string>

const TYPE_CLASS_MAP = {
  'stage_start': 'type-stage',
  'stage_voting': 'type-voting',
  'stage_completed': 'type-completed',
  'comment_mention': 'type-mention',
  'group_mention': 'type-mention',
  'new_comment': 'type-comment',
  'comment_vote': 'type-vote'
} satisfies Record<NotificationType, string>

// ================== Export Config ==================

const exportConfig = computed(() => ({
  data: filteredNotifications.value as Record<string, unknown>[],
  filename: '通知列表',
  headers: ['收件人', '類型', '標題', '內容', '專案', '已讀', '已發送郵件', '創建時間', '讀取時間', '郵件發送時間'],
  rowMapper: (n: Record<string, unknown>) => {
    const notification = n as Notification
    return [
      notification.targetUserEmail,
      TYPE_TEXT_MAP[notification.type],
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

      // Map project names without mutating the original objects
      notifications.value = notificationArray.map(n => ({
        ...n,
        projectName: getProjectName(n.projectId)
      }))
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

const loadProjects = async (): Promise<void> => {
  try {
    const httpResponse = await rpcClient.projects.list.$post({ json: {} })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      projects.value = response.data
    } else {
      throw new Error(response.error?.message || '載入專案失敗')
    }
  } catch (error) {
    console.error('Error loading projects:', error)
    ElMessage.error('無法載入專案列表')
  }
}

const getProjectName = (projectId: string | undefined): string | null => {
  if (!projectId) return null
  const project = projects.value.find(p => p.projectId === projectId)
  return project ? project.projectName : projectId
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
      }) as BatchSendResponse

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
    })

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

// Detail drawer methods
const viewNotificationDetail = (notification: Notification): void => {
  selectedNotification.value = notification
  showDetailDrawer.value = true
}

const closeDetailDrawer = (): void => {
  showDetailDrawer.value = false
  selectedNotification.value = null
}

const handleDetailDrawerClose = (done: () => void): void => {
  if (sendingEmails.value) {
    ElMessage.warning('正在處理中，請稍候...')
    return
  }
  done()
}

const sendSingleEmailFromDetail = async (): Promise<void> => {
  if (selectedNotification.value) {
    await sendSingleEmail(selectedNotification.value)
  }
}

const deleteNotificationFromDetail = async (): Promise<void> => {
  if (selectedNotification.value) {
    await deleteNotification(selectedNotification.value)
    closeDetailDrawer()
  }
}

const getTypeText = (type: NotificationType): string => {
  return TYPE_TEXT_MAP[type]
}

const getTypeClass = (type: NotificationType): string => {
  return TYPE_CLASS_MAP[type]
}

// ================== Lifecycle Hooks ==================

onMounted(() => {
  loadProjects()
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

/* Type badges */
.type-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-stage {
  background: #E6F7FF;
  color: #1890FF;
}

.type-voting {
  background: #FFF7E6;
  color: #FA8C16;
}

.type-completed {
  background: #F0F9FF;
  color: #52C41A;
}

.type-mention {
  background: #FFF0F6;
  color: #EB2F96;
}

.type-comment {
  background: #F9F0FF;
  color: #722ED1;
}

.type-vote {
  background: #E6FFFB;
  color: #13C2C2;
}

.type-default {
  background: #F0F2F5;
  color: #8C8C8C;
}

/* Status indicators */
.status-indicators {
  display: flex;
  gap: 10px;
  font-size: 16px;
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
.table-container {
  max-height: calc(100vh - 400px);
  overflow-y: auto;
}

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

/* Title cell - normal text, no clickable styling */
.title-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Drawer Navy Header */
.drawer-header-navy {
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  padding: 16px 24px;
  margin: -20px -20px 20px -20px;
  border-radius: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header-navy h3 {
  margin: 0;
  color: white;
  font-weight: 600;
  font-size: 18px;
}

.drawer-header-navy i {
  margin-right: 8px;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

/* Notification Detail */
.notification-detail {
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
  white-space: pre-wrap;
  word-break: break-word;
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

.detail-actions .btn-primary,
.detail-actions .btn-danger {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.detail-actions .btn-primary {
  background: #409eff;
  color: white;
}

.detail-actions .btn-primary:hover {
  background: #66b1ff;
}

.detail-actions .btn-primary:disabled {
  background: #a0cfff;
  cursor: not-allowed;
}

.detail-actions .btn-danger {
  background: #f56c6c;
  color: white;
}

.detail-actions .btn-danger:hover {
  background: #f78989;
}

/* el-drawer header 樣式 */
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
