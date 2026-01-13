<template>
  <div class="notification-center" :class="{ 'notification-center--icon-only': props.variant === 'icon-only' || props.variant === 'sidebar' }">
    <!-- Notification Bell Button -->
    <el-button
      circle
      @click="toggleNotificationDrawer"
      class="notification-bell"
      :class="{
        'has-notifications': unreadCount > 0 || errorLogCount > 0,
        'notification-bell--sidebar': props.variant === 'icon-only' || props.variant === 'sidebar'
      }"
    >
      <el-badge
        :value="totalBadgeCount"
        :hidden="totalBadgeCount === 0"
        :max="99"
      >
        <i class="fas fa-bell"></i>
      </el-badge>
    </el-button>

    <!-- Notification Drawer - Teleport to body for full screen in sidebar mode -->
    <Teleport to="body">
      <el-drawer
        v-model="showDrawer"
        direction="rtl"
        :size="drawerSize"
        class="drawer-green"
      >
        <template #header>
          <span><i class="fas fa-bell"></i> 通知中心</span>
        </template>

      <div class="drawer-body">
        <!-- Tabs -->
        <el-tabs v-model="activeTab" class="notification-tabs">
          <!-- 通知 Tab -->
          <el-tab-pane name="notifications">
            <template #label>
              <span class="tab-label">
                <i class="fas fa-bell"></i>
                系統通知
                <el-badge
                  v-if="unreadCount > 0"
                  :value="unreadCount"
                  :max="99"
                  class="tab-badge"
                />
              </span>
            </template>

            <!-- AdminFilterToolbar -->
            <AdminFilterToolbar
              variant="default"
              :active-filter-count="notificationActiveFilterCount"
              :expanded-filter-count="2"
              :collapsible="true"
              :default-expanded="false"
              :show-export="false"
              @reset-filters="resetNotificationFilters"
            >
              <!-- 核心过滤器（始终可见）-->
              <template #filters-core>
                <div class="filter-item">
                  <span class="filter-label">搜索：</span>
                  <el-input
                    v-model="searchText"
                    placeholder="搜索通知内容..."
                    clearable
                    style="width: 250px;"
                    @input="handleSearch"
                    @clear="handleSearch"
                  >
                    <template #prefix><i class="fas fa-search"></i></template>
                  </el-input>
                </div>
              </template>

              <!-- 展开过滤器（可折叠）-->
              <template #filters-expanded>
                <div class="filter-item">
                  <span class="filter-label">类别：</span>
                  <el-segmented
                    v-model="typeFilter"
                    :options="typeFilterOptions"
                    size="small"
                  />
                </div>

                <div class="filter-item">
                  <span class="filter-label">状态：</span>
                  <el-segmented
                    v-model="readStatusFilter"
                    :options="readStatusOptions"
                    size="small"
                  />
                </div>
              </template>

              <!-- 操作按钮 -->
              <template #actions>
                <el-tooltip content="更新通知" placement="top">
                  <el-button
                    size="small"
                    @click="refreshNotifications"
                    :loading="isLoadingNotifications"
                  >
                    <i class="fas fa-sync"></i>
                    <span class="btn-text">更新</span>
                  </el-button>
                </el-tooltip>

                <el-tooltip content="全部已讀" placement="top">
                  <el-button
                    size="small"
                    type="success"
                    @click="markAllAsRead"
                    :disabled="unreadCount === 0"
                    :loading="isMarkingAllRead"
                  >
                    <i class="fas fa-check-double"></i>
                    <span class="btn-text">全部已讀</span>
                  </el-button>
                </el-tooltip>

                <el-tooltip content="匯出" placement="top">
                  <el-button
                    size="small"
                    @click="exportNotifications"
                    :disabled="notifications.length === 0"
                  >
                    <i class="fas fa-download"></i>
                    <span class="btn-text">匯出</span>
                  </el-button>
                </el-tooltip>
              </template>

              <!-- 统计信息 -->
              <template #stats>
                <div class="notification-stats">
                  <span>共 {{ totalCount }} 则通知</span>
                  <span v-if="unreadCount > 0">，{{ unreadCount }} 则未读</span>
                </div>
              </template>
            </AdminFilterToolbar>

            <!-- Notification List -->
            <el-scrollbar
              class="notification-list-container"
              @end-reached="loadMoreNotifications"
              :distance="10"
              role="region"
              aria-label="通知列表"
            >
              <div v-if="isLoadingNotifications && currentPage === 1" class="loading-container">
                <el-skeleton :rows="5" animated />
              </div>

              <EmptyState
                v-else-if="notifications.length === 0"
                :icons="['fa-bell-slash', 'fa-bell']"
                parent-icon="fa-bell"
                :title="searchText ? '找不到符合搜尋條件的通知' : readStatusFilter === 'unread' ? '目前沒有未讀通知' : typeFilter !== 'all' ? '此類別目前沒有通知' : '目前沒有通知'"
                :compact="true"
              />

              <div v-else class="notification-list">
                <div
                  v-for="notification in notifications"
                  :key="notification.notificationId"
                  class="notification-item"
                  :class="{
                    'unread': !notification.isRead,
                    'read': notification.isRead
                  }"
                  role="article"
                  :aria-label="`通知: ${notification.title}`"
                >
                  <!-- Notification Content -->
                  <div class="notification-content">
                    <div class="notification-header">
                      <span class="notification-title">{{ notification.title }}</span>
                      <span class="notification-time">{{ formatTime(notification.createdTime) }}</span>
                    </div>

                    <div class="notification-body">{{ notification.content }}</div>

                    <div class="notification-meta">
                      <span v-if="notification.projectName" class="project-name">
                        <i class="fas fa-folder"></i>
                        {{ notification.projectName }}
                      </span>
                      <span class="notification-type">
                        <i :class="getTypeIcon(notification.type)"></i>
                        {{ getTypeLabel(notification.type) }}
                      </span>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="notification-actions" role="group" aria-label="通知操作">
                    <el-button
                      v-if="!notification.isRead"
                      size="small"
                      @click="markAsRead(notification.notificationId)"
                      :loading="isMarkingRead && currentOperatingId === notification.notificationId"
                      aria-label="標記為已讀"
                    >
                      <i class="fas fa-check"></i>
                    </el-button>

                    <el-button
                      size="small"
                      plain
                      @click="copyNotificationAsJSON(notification)"
                      aria-label="複製為 JSON"
                      title="複製為 JSON"
                    >
                      <i class="fas fa-copy"></i>
                    </el-button>

                    <el-button
                      size="small"
                      @click="deleteNotification(notification.notificationId)"
                      :loading="isDeleting && currentOperatingId === notification.notificationId"
                      type="danger"
                      plain
                      aria-label="刪除通知"
                    >
                      <i class="fas fa-trash"></i>
                    </el-button>
                  </div>
                </div>

                <!-- Loading indicator for infinite scroll -->
                <div v-if="isFetchingNotifications && currentPage > 1" class="loading-more">
                  <el-skeleton :rows="2" animated />
                </div>
              </div>
            </el-scrollbar>
          </el-tab-pane>

          <!-- 通知日誌 Tab -->
          <el-tab-pane name="errors">
            <template #label>
              <span class="tab-label">
                <i class="fas fa-list-alt"></i>
                網站訊息
                <el-badge
                  v-if="errorLogCount > 0"
                  :value="errorLogCount"
                  :max="99"
                  class="tab-badge"
                  :type="notificationBadgeType"
                />
              </span>
            </template>

            <!-- AdminFilterToolbar -->
            <AdminFilterToolbar
              variant="default"
              :active-filter-count="logActiveFilterCount"
              :collapsible="false"
              :show-export="false"
              @reset-filters="resetLogFilters"
            >
              <!-- 核心过滤器 -->
              <template #filters-core>
                <div class="filter-item">
                  <span class="filter-label">严重程度：</span>
                  <el-segmented
                    v-model="levelFilter"
                    :options="levelFilterOptions"
                    size="small"
                  />
                </div>

                <div class="filter-item">
                  <span class="filter-label">搜索：</span>
                  <el-input
                    v-model="logSearchText"
                    placeholder="搜索日志讯息..."
                    clearable
                    style="width: 250px;"
                    @input="handleLogSearch"
                    @clear="handleLogSearch"
                  >
                    <template #prefix><i class="fas fa-search"></i></template>
                  </el-input>
                </div>
              </template>

              <!-- 操作按钮 -->
              <template #actions>
                <el-button
                  size="small"
                  type="danger"
                  @click="clearNotificationLog"
                  :disabled="filteredErrorLog.length === 0"
                >
                  <i class="fas fa-trash-alt"></i>
                  清除全部
                </el-button>

                <el-button
                  size="small"
                  @click="exportNotificationLog"
                  :disabled="filteredErrorLog.length === 0"
                >
                  <i class="fas fa-download"></i>
                  匯出日誌
                </el-button>
              </template>

              <!-- 统计信息 -->
              <template #stats>
                <div class="notification-stats">
                  <span>显示 {{ filteredErrorLog.length }} / {{ errorLog.length }} 则通知记录</span>
                  <span v-if="errorLog.length >= 50" class="warning-text">（最多保留 50 则）</span>
                </div>
              </template>
            </AdminFilterToolbar>

            <!-- Notification Log List -->
            <div class="notification-log-list-container" role="region" aria-label="通知日誌列表">
              <EmptyState
                v-if="filteredErrorLog.length === 0"
                :icons="['fa-check-circle', 'fa-list-check']"
                parent-icon="fa-clipboard-list"
                :title="logSearchText ? '找不到符合搜尋條件的日誌' : levelFilter !== 'all' ? '此級別目前沒有通知記錄' : '目前沒有通知記錄'"
                type="success"
                :compact="true"
              />

              <div v-else class="error-log-list">
                <div
                  v-for="notification in filteredErrorLog"
                  :key="notification.id"
                  class="notification-log-item"
                  :class="`notification-level-${notification.level}`"
                  role="article"
                  :aria-label="`${getNotificationLevelLabel(notification.level)}訊息: ${notification.message}`"
                >
                  <div class="notification-log-header">
                    <div class="notification-level-badge" :class="`badge-${notification.level}`">
                      <i :class="getNotificationLevelIcon(notification.level)"></i>
                      {{ getNotificationLevelLabel(notification.level) }}
                    </div>
                    <div class="notification-log-time">{{ formatTime(notification.timestamp instanceof Date ? notification.timestamp.getTime() : notification.timestamp) }}</div>
                    <el-button
                      size="small"
                      plain
                      @click="copyNotificationLogAsJSON(notification)"
                      aria-label="複製為 JSON"
                      title="複製為 JSON"
                    >
                      <i class="fas fa-copy"></i>
                    </el-button>
                    <el-button
                      size="small"
                      type="danger"
                      text
                      @click="removeNotification(String(notification.id))"
                      aria-label="刪除此通知記錄"
                    >
                      <i class="fas fa-times"></i>
                    </el-button>
                  </div>

                  <div class="notification-log-message">{{ notification.message }}</div>

                  <div v-if="notification.context && Object.keys(notification.context).length > 0" class="notification-log-context">
                    <div class="context-label">上下文:</div>
                    <MdPreviewWrapper :content="jsonToMarkdown(notification.context)" />
                  </div>

                  <div v-if="notification.stack" class="notification-log-stack">
                    <el-collapse>
                      <el-collapse-item title="查看堆疊追蹤" name="stack">
                        <pre>{{ notification.stack }}</pre>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Notification Center Component with TanStack Query
 * 通知中心組件（使用 TanStack Query）
 *
 * Phase 4.5 重構 - 使用 useNotifications composable
 */

import { ref, computed, watch } from 'vue'
import { useNotificationCenterStore } from '@/stores/notificationCenter'

// ===== Props =====
export interface Props {
  /**
   * Display variant:
   * - 'full': Full notification center (default)
   * - 'icon-only': Icon-only mode for sidebar compact view
   * - 'sidebar': Sidebar mode for portrait view (100% drawer width)
   */
  variant?: 'full' | 'icon-only' | 'sidebar'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'full'
})

// ===== Store for global control =====
const notificationCenterStore = useNotificationCenterStore()

// Drawer size based on variant
const drawerSize = computed(() => {
  if (props.variant === 'sidebar') return '100%'
  return '600px'
})
import { ElMessageBox, ElMessage } from 'element-plus'
import type { ScrollbarDirection } from 'element-plus'
import { useDebounceFn } from '@vueuse/core'
import { useNotificationLog } from '@/composables/useNotificationLog'
import {
  useNotificationCount,
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification
} from '@/composables/useNotifications'
import type { Notification } from '@repo/shared'
import EmptyState from '@/components/shared/EmptyState.vue'
import AdminFilterToolbar from '@/components/admin/shared/AdminFilterToolbar.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { jsonToMarkdown } from '@/utils/json-preview'

// ===== UI State =====
const showDrawer = ref(false)
const activeTab = ref('notifications')

// ===== 同步 store.isOpen 與內部 showDrawer =====
// 這允許從任何地方（如 MainLayout）控制通知中心的開啟/關閉
watch(() => notificationCenterStore.isOpen, (val) => {
  if (val !== showDrawer.value) {
    showDrawer.value = val
  }
})
watch(showDrawer, (val) => {
  if (val !== notificationCenterStore.isOpen) {
    if (val) {
      notificationCenterStore.open()
    } else {
      notificationCenterStore.close()
    }
  }
})

// ===== Filter State - Notifications Tab =====
const currentPage = ref(1)
const typeFilter = ref('all') // 'all', 'interaction', 'process', 'management', 'rewards'
const readStatusFilter = ref<'all' | 'unread' | 'read'>('all') // 'all' or 'unread'
const searchText = ref('')
const allNotifications = ref<Notification[]>([]) // Cumulative notifications for infinite scroll

// ===== Filter State - Notification Log Tab =====
const levelFilter = ref('all') // 'all', 'error', 'warning', 'success', 'info'
const logDisplayCount = ref(20)
const logSearchText = ref('')

// ===== Filter Options =====
// Type category mapping for notifications
const TYPE_CATEGORIES: Record<string, string[] | null> = {
  all: null,
  interaction: ['group_mention', 'user_mention', 'comment'],
  process: ['stage_created', 'stage_start', 'stage_completed', 'submission_created'],
  management: ['project_updated', 'group_created', 'group_updated', 'ranking_proposal'],
  rewards: ['wallet_reward']
}

const typeFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '互動', value: 'interaction' },
  { label: '流程', value: 'process' },
  { label: '管理', value: 'management' },
  { label: '獎勵', value: 'rewards' }
]

const readStatusOptions = [
  { label: '全部', value: 'all' },
  { label: '未讀', value: 'unread' }
]

const levelFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '錯誤', value: 'error' },
  { label: '警告', value: 'warning' },
  { label: '成功', value: 'success' },
  { label: '資訊', value: 'info' }
]

// ===== TanStack Query - Notification Count =====
const {
  data: unreadCountData,
  isLoading: isLoadingCount,
  refetch: refetchCount
} = useNotificationCount()

// Extract unread count (default to 0)
const unreadCount = computed(() => unreadCountData.value || 0)

// ===== TanStack Query - Notification List =====
const notificationOptions = computed(() => ({
  page: currentPage.value,
  pageSize: 20, // Fixed page size for pagination
  filter: readStatusFilter.value
}))

const {
  data: notificationData,
  isLoading: isLoadingNotifications,
  isFetching: isFetchingNotifications,
  refetch: refetchNotifications
} = useNotifications(notificationOptions)

// Watch for new data and accumulate notifications
watch(notificationData, (newData) => {
  if (newData?.notifications) {
    if (currentPage.value === 1) {
      // Reset for first page
      allNotifications.value = newData.notifications
    } else {
      // Append for subsequent pages, avoid duplicates
      const existingIds = new Set(allNotifications.value.map(n => n.notificationId))
      const newNotifications = newData.notifications.filter((n: Notification) => !existingIds.has(n.notificationId))
      allNotifications.value.push(...newNotifications)
    }
  }
}, { immediate: true })

// Extract notification list data with client-side type filtering
const notifications = computed(() => {
  let list = allNotifications.value

  // Apply type filter (client-side)
  if (typeFilter.value !== 'all') {
    const allowedTypes = TYPE_CATEGORIES[typeFilter.value]
    if (allowedTypes) {
      list = list.filter(n => allowedTypes.includes(n.type))
    }
  }

  return list
})

const totalCount = computed(() => notificationData.value?.totalCount || 0)
const hasMore = computed(() => notificationData.value?.hasMore || false)
const disableInfiniteScroll = computed(() => isFetchingNotifications.value || !hasMore.value)

// ===== TanStack Mutations =====
const { mutate: markAsReadMutate, isPending: isMarkingRead } = useMarkNotificationAsRead()
const { mutate: markAllAsReadMutate, isPending: isMarkingAllRead } = useMarkAllNotificationsAsRead()
const { mutate: deleteNotificationMutate, isPending: isDeleting } = useDeleteNotification()

// Track which notification is being operated on
const currentOperatingId = ref<string | null>(null)

// ===== Notification Log (user-isolated) =====
const { log: errorLog, clearLog, removeLog } = useNotificationLog()
const errorLogCount = computed(() => errorLog.value.length)
const totalBadgeCount = computed(() => unreadCount.value + errorLogCount.value)

// Filtered error log with level, search, and display count
const filteredErrorLog = computed(() => {
  let list = errorLog.value

  // Apply level filter
  if (levelFilter.value !== 'all') {
    list = list.filter(n => n.level === levelFilter.value)
  }

  // Apply search filter
  if (logSearchText.value) {
    const searchLower = logSearchText.value.toLowerCase()
    list = list.filter(n => {
      const messageMatch = n.message?.toLowerCase().includes(searchLower)
      const contextMatch = n.context ? JSON.stringify(n.context).toLowerCase().includes(searchLower) : false
      return messageMatch || contextMatch
    })
  }

  // Apply display count limit
  return list.slice(0, logDisplayCount.value)
})

const notificationBadgeType = computed(() => {
  const hasError = errorLog.value.some(n => n.level === 'error')
  if (hasError) return 'danger'

  const hasWarning = errorLog.value.some(n => n.level === 'warning')
  if (hasWarning) return 'warning'

  return 'info'
})

// ===== AdminFilterToolbar - Active Filter Count =====
// 系统通知过滤器计数
const notificationActiveFilterCount = computed(() => {
  let count = 0
  if (searchText.value?.trim()) count++
  if (typeFilter.value !== 'all') count++
  if (readStatusFilter.value !== 'all') count++
  return count
})

// 网站讯息过滤器计数
const logActiveFilterCount = computed(() => {
  let count = 0
  if (logSearchText.value?.trim()) count++
  if (levelFilter.value !== 'all') count++
  return count
})

// ===== Drawer Actions =====
function toggleNotificationDrawer() {
  showDrawer.value = !showDrawer.value
  if (showDrawer.value && activeTab.value === 'notifications') {
    // Refetch on open
    refetchCount()
    refetchNotifications()
  }
}

function closeDrawer() {
  showDrawer.value = false
}

function refreshNotifications() {
  currentPage.value = 1
  refetchCount()
  refetchNotifications()
}

// ===== Infinite Scroll =====
function loadMoreNotifications(direction: ScrollbarDirection) {
  if (direction !== 'bottom') return
  if (!hasMore.value || isFetchingNotifications.value) return
  currentPage.value++
}

// ===== Filter Actions =====
// Debounced search using VueUse
const debouncedSearch = useDebounceFn(() => {
  currentPage.value = 1
  refetchNotifications()
}, 500)

function handleSearch() {
  debouncedSearch()
}

// Debounced log search using VueUse
const debouncedLogSearch = useDebounceFn(() => {
  // Computed property will update automatically
}, 500)

function handleLogSearch() {
  debouncedLogSearch()
}

// ===== AdminFilterToolbar - Reset Filters =====
// 重置系统通知过滤器
function resetNotificationFilters() {
  searchText.value = ''
  typeFilter.value = 'all'
  readStatusFilter.value = 'all'
  currentPage.value = 1
  refetchNotifications()
}

// 重置网站讯息过滤器
function resetLogFilters() {
  logSearchText.value = ''
  levelFilter.value = 'all'
}

// Watch for filter changes to reset pagination
watch([typeFilter, readStatusFilter], () => {
  currentPage.value = 1
})

// ===== Notification Actions =====
function markAsRead(notificationId: string) {
  currentOperatingId.value = notificationId
  markAsReadMutate(notificationId, {
    onSuccess: () => {
      console.log('✅ 通知已標記為已讀:', notificationId)
      currentOperatingId.value = null
    },
    onError: (error) => {
      console.error('❌ 標記已讀失敗:', error)
      currentOperatingId.value = null
      ElMessage.error('標記已讀失敗')
    }
  })
}

function markAllAsRead() {
  if (unreadCount.value === 0) return

  markAllAsReadMutate(undefined, {
    onError: (error) => {
      console.error('❌ 全部已讀操作失敗:', error)
      ElMessage.error('全部已讀操作失敗')
    }
  })
}

function deleteNotification(notificationId: string) {
  currentOperatingId.value = notificationId
  deleteNotificationMutate(notificationId, {
    onSuccess: () => {
      console.log('✅ 通知已刪除:', notificationId)
      currentOperatingId.value = null
    },
    onError: (error) => {
      console.error('❌ 刪除通知失敗:', error)
      currentOperatingId.value = null
      ElMessage.error('刪除通知失敗')
    }
  })
}

// ===== Notification Log Actions =====
function clearNotificationLog() {
  ElMessageBox.confirm(
    '確定要清除所有通知記錄嗎？這將同時清除本地儲存的記錄。',
    '確認清除',
    {
      confirmButtonText: '確定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    clearLog()
    ElMessage.success('通知記錄已清除')
  }).catch(() => {
    // Cancelled
  })
}

function removeNotification(notificationId: string) {
  // 轉換 notificationId 為數字（如果是字符串）
  const id = Number(notificationId)
  removeLog(id)
}

function exportNotifications() {
  const content = JSON.stringify(notifications.value, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `notifications-${new Date().toISOString()}.json`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('通知已匯出')
}

function exportNotificationLog() {
  const content = JSON.stringify(filteredErrorLog.value, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `notification-log-${new Date().toISOString()}.json`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('通知日誌已匯出')
}

// ===== Copy Functions =====
/**
 * Copy system notification as JSON to clipboard
 */
function copyNotificationAsJSON(notification: Notification) {
  try {
    const jsonData = JSON.stringify(notification, null, 2)
    navigator.clipboard.writeText(jsonData)
    ElMessage.success('通知已複製為 JSON')
  } catch (error) {
    console.error('複製 JSON 失敗:', error)
    ElMessage.error('複製失敗')
  }
}

/**
 * Copy notification log entry as JSON to clipboard
 */
function copyNotificationLogAsJSON(notification: any) {
  try {
    // Create a serializable copy (convert Date to ISO string)
    const serializable = {
      ...notification,
      timestamp: notification.timestamp instanceof Date
        ? notification.timestamp.toISOString()
        : notification.timestamp
    }
    const jsonData = JSON.stringify(serializable, null, 2)
    navigator.clipboard.writeText(jsonData)
    ElMessage.success('通知記錄已複製為 JSON')
  } catch (error) {
    console.error('複製 JSON 失敗:', error)
    ElMessage.error('複製失敗')
  }
}

// ===== Utility Functions =====
function getNotificationLevelIcon(level: string) {
  switch (level) {
    case 'error': return 'fas fa-exclamation-circle'
    case 'warning': return 'fas fa-exclamation-triangle'
    case 'success': return 'fas fa-check-circle'
    case 'info': return 'fas fa-info-circle'
    default: return 'fas fa-bell'
  }
}

function getNotificationLevelLabel(level: string) {
  switch (level) {
    case 'error': return '錯誤'
    case 'warning': return '警告'
    case 'success': return '成功'
    case 'info': return '資訊'
    default: return level
  }
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '剛剛'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 7) return `${diffDays} 天前`

  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'group_mention': return 'fas fa-users'
    case 'user_mention': return 'fas fa-at'
    case 'comment': return 'fas fa-comment'
    case 'system': return 'fas fa-cog'
    case 'stage_created': return 'fas fa-plus-circle'
    case 'stage_start': return 'fas fa-play-circle'
    case 'stage_completed': return 'fas fa-check-circle'
    case 'submission_created': return 'fas fa-file-alt'
    case 'ranking_proposal': return 'fas fa-trophy'
    case 'wallet_reward': return 'fas fa-coins'
    case 'project_updated': return 'fas fa-edit'
    case 'group_created': return 'fas fa-users-plus'
    case 'group_updated': return 'fas fa-users-cog'
    default: return 'fas fa-bell'
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'group_mention': return '群組提及'
    case 'user_mention': return '用戶提及'
    case 'comment': return '評論'
    case 'system': return '系統'
    case 'stage_created': return '階段建立'
    case 'stage_start': return '階段開始'
    case 'stage_completed': return '階段完成'
    case 'submission_created': return '成果提交'
    case 'ranking_proposal': return '排名提案'
    case 'wallet_reward': return '獎勵'
    case 'project_updated': return '專案更新'
    case 'group_created': return '群組建立'
    case 'group_updated': return '群組更新'
    default: return '通知'
  }
}
</script>

<style scoped>
/* 引用统一 drawer 样式 */
@import '@/styles/drawer-unified.scss';

.notification-center {
  position: relative;
}

/* Notification Bell */
.notification-bell {
  position: relative;
  color: #666;
  background: transparent;
  border: none;
  font-size: 18px;
  transition: all 0.3s;
}

.notification-bell:hover {
  color: #FF6600;
  background: rgba(255, 102, 0, 0.1);
}

.notification-bell.has-notifications {
  color: #FF6600;
  animation: bell-ring 2s infinite;
}

@keyframes bell-ring {
  0%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(-10deg); }
  20% { transform: rotate(10deg); }
}

/* Drawer Body - NotificationCenter specific */
.drawer-green .drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

/* Tabs */
.notification-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notification-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.notification-tabs :deep(.el-tab-pane) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-label {
  display: flex;
  margin: 5px;
  align-items: center;
  gap: 6px;
}

.tab-badge {
  margin-left: 4px;
}

/* Notification List Container */
.notification-list-container {
  flex: 1;
  padding: 0 20px;
}

.notification-log-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
}

.loading-container {
  padding: 20px 0;
}

/* Notification List */
.notification-list {
  padding-bottom: 20px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.notification-item:hover {
  background: #f8f9fa;
}

.notification-item.unread {
  background: rgba(255, 102, 0, 0.05);
  border-left: 4px solid #FF6600;
  padding-left: 15px;
  margin-left: -19px;
}

.notification-content {
  flex: 1;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 10px;
}

.notification-title {
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.notification-time {
  color: #999;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.notification-body {
  color: #666;
  line-height: 1.5;
  margin-bottom: 8px;
}

.notification-meta {
  display: flex;
  gap: 15px;
  color: #999;
  font-size: 12px;
  align-items: center;
}

.project-name,
.notification-type {
  display: flex;
  align-items: center;
  gap: 4px;
}

.notification-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* Notification Log */
.error-log-list {
  padding-bottom: 20px;
}

.notification-log-item {
  padding: 15px;
  margin-bottom: 15px;
  border-radius: 8px;
  border-left: 4px solid #909399;
  background: #f4f4f5;
}

.notification-log-item.notification-level-error {
  border-left-color: #f56c6c;
  background: #fef0f0;
}

.notification-log-item.notification-level-warning {
  border-left-color: #e6a23c;
  background: #fdf6ec;
}

.notification-log-item.notification-level-success {
  border-left-color: #67c23a;
  background: #f0f9ff;
}

.notification-log-item.notification-level-info {
  border-left-color: #409eff;
  background: #ecf5ff;
}

.notification-log-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.notification-level-badge {
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.notification-level-badge.badge-error {
  background: #f56c6c;
}

.notification-level-badge.badge-warning {
  background: #e6a23c;
}

.notification-level-badge.badge-success {
  background: #67c23a;
}

.notification-level-badge.badge-info {
  background: #409eff;
}

.notification-log-time {
  color: #999;
  font-size: 12px;
  flex: 1;
}

.notification-log-message {
  font-weight: 500;
  margin-bottom: 10px;
  line-height: 1.5;
}

.notification-level-error .notification-log-message {
  color: #c03;
}

.notification-level-warning .notification-log-message {
  color: #b8860b;
}

.notification-level-success .notification-log-message {
  color: #529b2e;
}

.notification-level-info .notification-log-message {
  color: #337ab7;
}

.notification-log-context {
  margin-bottom: 10px;
}

.context-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.notification-log-context pre,
.notification-log-stack pre {
  background: white;
  padding: 10px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  max-height: 200px;
  border: 1px solid #dcdfe6;
}

.notification-log-stack {
  margin-top: 10px;
}

/* Load More */
.load-more-container {
  text-align: center;
  padding: 20px 0;
}

.loading-more {
  padding: 20px 0;
  text-align: center;
}

/* Stats (in AdminFilterToolbar) */
.notification-stats {
  display: flex;
  gap: 10px;
  font-size: 14px;
  color: #666;
}

.warning-text {
  color: #e6a23c;
  font-weight: 500;
}

/* Responsive */
@media (max-width: 768px) {
  .notification-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
}

/* ===== Icon-Only Variant (for Sidebar) ===== */
.notification-center--icon-only {
  display: flex;
  align-items: center;
}

.notification-bell--sidebar {
  color: rgba(255, 255, 255, 0.7) !important;
  background: transparent !important;
  border: none !important;
  font-size: 16px;
  width: 36px;
  height: 36px;
}

.notification-bell--sidebar:hover {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.notification-bell--sidebar.has-notifications {
  color: #FF6600 !important;
}

.notification-bell--sidebar :deep(.el-badge__content) {
  font-size: 10px;
  padding: 0 4px;
  height: 16px;
  line-height: 16px;
}
</style>
