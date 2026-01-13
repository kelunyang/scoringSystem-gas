<template>
  <div class="announcement-management">
    <!-- Unified Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :loading="isLoading"
      :active-filter-count="activeFilterCount"
      :expanded-filter-count="1"
      @reset-filters="handleResetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">搜尋：</span>
          <el-input
            v-model="filters.searchText"
            placeholder="搜尋公告標題或內容..."
            clearable
            style="width: 300px;"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">狀態：</span>
          <el-select v-model="filters.status" style="width: 150px;">
            <el-option label="全部" value="all" />
            <el-option label="待發布" value="pending" />
            <el-option label="進行中" value="active" />
            <el-option label="已過期" value="expired" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">類型：</span>
          <el-select v-model="filters.type" style="width: 150px;">
            <el-option label="全部類型" value="" />
            <el-option label="一般訊息" value="info" />
            <el-option label="警告" value="warning" />
            <el-option label="成功" value="success" />
            <el-option label="錯誤" value="error" />
          </el-select>
        </div>
      </template>

      <!-- Action Buttons -->
      <template #actions>
        <el-button type="primary" size="small" @click="handleCreate">
          <i class="fas fa-plus"></i>
          <span class="btn-text">新增公告</span>
        </el-button>
      </template>
    </AdminFilterToolbar>

    <!-- Statistics Card -->
    <el-card class="stats-card">
      <el-row :gutter="20">
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總公告數" :value="stats.total" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="待發布" :value="stats.pending" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="進行中" :value="stats.active" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="已過期" :value="stats.expired" />
        </el-col>
      </el-row>
    </el-card>

    <!-- Announcement Table -->
    <el-scrollbar class="table-container">
      <div v-loading="isLoading" element-loading-text="載入公告資料中...">
        <table class="announcement-table" role="table" aria-label="公告列表">
          <thead>
            <tr role="row">
              <th width="40" scope="col"></th>
              <th scope="col">標題</th>
              <th scope="col">類型</th>
              <th scope="col">開始時間</th>
              <th scope="col">結束時間</th>
              <th scope="col">狀態</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="announcement in announcements" :key="announcement.announcementId">
              <ExpandableTableRow
                :is-expanded="expandedId === announcement.announcementId"
                :expansion-colspan="7"
                :enable-responsive-rows="true"
                :actions-colspan="3"
                @toggle-expansion="handleToggleExpansion(announcement)"
              >
                <!-- 橫屏模式：單行顯示所有欄位 -->
                <template #main="{ isExpanded }">
                  <td>
                    <i
                      class="expand-icon fas"
                      :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                    ></i>
                  </td>
                  <td class="title-cell">{{ announcement.title }}</td>
                  <td>
                    <el-tag size="small" :type="getTypeTagType(announcement.type)">
                      {{ getTypeLabel(announcement.type) }}
                    </el-tag>
                  </td>
                  <td>{{ formatTime(announcement.startTime) }}</td>
                  <td>{{ formatTime(announcement.endTime) }}</td>
                  <td>
                    <el-tag size="small" :type="getStatusTagType(announcement.status)">
                      {{ getStatusLabel(announcement.status) }}
                    </el-tag>
                  </td>
                  <td class="actions" @click.stop>
                    <el-tooltip content="編輯公告" placement="top">
                      <el-button
                        type="primary"
                        size="small"
                        circle
                        @click="handleEdit(announcement)"
                      >
                        <i class="fas fa-edit"></i>
                      </el-button>
                    </el-tooltip>
                    <el-popconfirm
                      title="確定要刪除此公告嗎？"
                      confirm-button-text="確定"
                      cancel-button-text="取消"
                      @confirm="handleDelete(announcement.announcementId)"
                    >
                      <template #reference>
                        <el-tooltip content="刪除公告" placement="top">
                          <el-button type="danger" size="small" circle>
                            <i class="fas fa-trash"></i>
                          </el-button>
                        </el-tooltip>
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
                  <td colspan="2">
                    <div class="info-row-content">
                      <span class="title-text">{{ announcement.title }}</span>
                      <el-tag size="small" :type="getTypeTagType(announcement.type)">
                        {{ getTypeLabel(announcement.type) }}
                      </el-tag>
                      <el-tag size="small" :type="getStatusTagType(announcement.status)">
                        {{ getStatusLabel(announcement.status) }}
                      </el-tag>
                    </div>
                  </td>
                </template>

                <!-- 豎屏模式：操作行 -->
                <template #actions>
                  <el-button type="primary" size="small" @click="handleEdit(announcement)">
                    <i class="fas fa-edit"></i> 編輯
                  </el-button>
                  <el-popconfirm
                    title="確定要刪除此公告嗎？"
                    confirm-button-text="確定"
                    cancel-button-text="取消"
                    @confirm="handleDelete(announcement.announcementId)"
                  >
                    <template #reference>
                      <el-button type="danger" size="small">
                        <i class="fas fa-trash"></i> 刪除
                      </el-button>
                    </template>
                  </el-popconfirm>
                  <span class="time-text">{{ formatTime(announcement.startTime) }} - {{ formatTime(announcement.endTime) }}</span>
                </template>

                <!-- 展開區域：公告詳情 -->
                <template #default>
                  <div class="announcement-expanded-detail">
                    <h4><i class="fas fa-info-circle"></i> 公告詳情</h4>
                    <div class="detail-grid">
                      <div class="detail-item">
                        <label>創建者</label>
                        <div class="detail-value">{{ announcement.createdBy }}</div>
                      </div>
                      <div class="detail-item">
                        <label>創建時間</label>
                        <div class="detail-value">{{ formatTime(announcement.createdAt) }}</div>
                      </div>
                      <div class="detail-item" v-if="announcement.updatedAt">
                        <label>最後更新</label>
                        <div class="detail-value">{{ formatTime(announcement.updatedAt) }}</div>
                      </div>
                    </div>
                    <div class="content-section">
                      <label>公告內容</label>
                      <div class="content-display">
                        <MdPreviewWrapper :content="announcement.content" />
                      </div>
                    </div>
                  </div>
                </template>
              </ExpandableTableRow>
            </template>
          </tbody>
        </table>

        <EmptyState
          v-if="announcements.length === 0 && !isLoading"
          parent-icon="fa-bullhorn"
          :icons="['fa-plus']"
          title="沒有找到符合條件的公告"
          :enable-animation="false"
        />

        <!-- Show count info -->
        <div v-if="announcements.length > 0" class="count-info" role="status" aria-live="polite">
          顯示 {{ announcements.length }} / {{ total }} 筆公告
        </div>
      </div>
    </el-scrollbar>

    <!-- Editor Drawer -->
    <AnnouncementEditorDrawer
      v-model:visible="editorVisible"
      :announcement="editingAnnouncement"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, inject, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import AnnouncementEditorDrawer from './announcement/AnnouncementEditorDrawer.vue'
import {
  useAdminAnnouncements,
  useDeleteAnnouncement,
  type AdminAnnouncement,
  type AdminListOptions
} from '@/composables/useAnnouncements'
import type { AnnouncementType } from '@repo/shared'

// ================== State ==================

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// Filters
const filters = ref<{
  searchText: string
  status: 'all' | 'pending' | 'active' | 'expired'
  type: AnnouncementType | ''
}>({
  searchText: '',
  status: 'all',
  type: ''
})

// Query options
const queryOptions = computed<AdminListOptions>(() => ({
  limit: 100,
  offset: 0,
  ...(filters.value.type && { type: filters.value.type as AnnouncementType }),
  ...(filters.value.status !== 'all' && { status: filters.value.status }),
  ...(filters.value.searchText && { searchText: filters.value.searchText })
}))

// Fetch announcements using composable
const { data, isLoading, refetch } = useAdminAnnouncements(queryOptions)

// Delete mutation
const { mutate: deleteAnnouncement } = useDeleteAnnouncement()

// Announcements list
const announcements = computed<AdminAnnouncement[]>(() => data.value?.announcements || [])
const total = computed(() => data.value?.total || 0)

// Statistics
const stats = computed(() => {
  const list = announcements.value
  return {
    total: total.value,
    pending: list.filter(a => a.status === 'pending').length,
    active: list.filter(a => a.status === 'active').length,
    expired: list.filter(a => a.status === 'expired').length
  }
})

// Expandable row tracking
const expandedId = ref<string | null>(null)

// Editor drawer
const editorVisible = ref(false)
const editingAnnouncement = ref<AdminAnnouncement | null>(null)

// Active filter count for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.searchText) count++
  if (filters.value.status !== 'all') count++
  if (filters.value.type) count++
  return count
})

// ================== Methods ==================

const handleResetFilters = () => {
  filters.value.searchText = ''
  filters.value.status = 'all'
  filters.value.type = ''
}

const handleCreate = () => {
  editingAnnouncement.value = null
  editorVisible.value = true
}

const handleEdit = (announcement: AdminAnnouncement) => {
  editingAnnouncement.value = announcement
  editorVisible.value = true
}

const handleDelete = (announcementId: string) => {
  deleteAnnouncement(announcementId)
}

const handleSaved = () => {
  editorVisible.value = false
  editingAnnouncement.value = null
}

const handleToggleExpansion = (announcement: AdminAnnouncement) => {
  if (expandedId.value === announcement.announcementId) {
    expandedId.value = null
  } else {
    expandedId.value = announcement.announcementId
  }
}

const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const getTypeLabel = (type: AnnouncementType): string => {
  const labels: Record<AnnouncementType, string> = {
    info: '一般訊息',
    warning: '警告',
    success: '成功',
    error: '錯誤'
  }
  return labels[type] || type
}

const getTypeTagType = (type: AnnouncementType): 'success' | 'warning' | 'info' | 'danger' => {
  const types: Record<AnnouncementType, 'success' | 'warning' | 'info' | 'danger'> = {
    info: 'info',
    warning: 'warning',
    success: 'success',
    error: 'danger'
  }
  return types[type] || 'info'
}

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: '待發布',
    active: '進行中',
    expired: '已過期'
  }
  return labels[status] || status
}

const getStatusTagType = (status: string): 'success' | 'warning' | 'info' | 'danger' => {
  const types: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'warning',
    active: 'success',
    expired: 'info'
  }
  return types[status] || 'info'
}

const refreshAnnouncements = async () => {
  await refetch()
  ElMessage.success('公告資料已更新')
}

// ================== Lifecycle ==================

onMounted(() => {
  registerRefresh(refreshAnnouncements)
})

onBeforeUnmount(() => {
  registerRefresh(null)
})
</script>

<style scoped>
.announcement-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Statistics Card */
.stats-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

/* Table */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
  height: calc(100vh - 400px);
}

.announcement-table {
  width: 100%;
  border-collapse: collapse;
}

.announcement-table th,
.announcement-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.announcement-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.announcement-table tr:hover {
  background: #f5f7fa;
}

/* Title cell */
.title-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Info row content (vertical mode) */
.info-row-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.info-row-content .title-text {
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

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

/* Announcement expanded detail */
.announcement-expanded-detail {
  padding: 0;
}

.announcement-expanded-detail h4 {
  margin: 0 0 16px 0;
  color: #374151;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 12px;
}

.announcement-expanded-detail h4 i {
  color: #409eff;
  margin-right: 8px;
}

.announcement-expanded-detail .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.announcement-expanded-detail .detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.announcement-expanded-detail .detail-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.announcement-expanded-detail .detail-value {
  color: #2c3e50;
  font-size: 14px;
}

.announcement-expanded-detail .content-section {
  margin-top: 16px;
}

.announcement-expanded-detail .content-section label {
  display: block;
  font-weight: 500;
  color: #6c757d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.announcement-expanded-detail .content-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  line-height: 1.6;
  color: #2c3e50;
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
</style>
