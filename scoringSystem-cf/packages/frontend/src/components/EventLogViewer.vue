<template>
  <div class="event-log-viewer">
    <!-- Permission Scope Indicator -->
    <div v-if="permissionScopeText" class="permission-scope-banner" :class="'permission-' + userPermissionLevel">
      <i class="fas fa-shield-alt"></i>
      <span>{{ permissionScopeText }}</span>
    </div>

    <!-- Unified Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :active-filter-count="activeFilterCount"
      :expanded-filter-count="expandedFilterCount"
      :export-data="exportConfig.data"
      :export-filename="exportConfig.filename"
      :export-headers="exportConfig.headers"
      :export-row-mapper="exportConfig.rowMapper"
      @reset-filters="handleResetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">時間範圍：</span>
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="開始日期"
            end-placeholder="結束日期"
            format="YYYY-MM-DD"
            value-format="x"
            style="width: 300px;"
            @change="applyFilters"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">資源類型：</span>
          <el-select
            v-model="filters.resourceTypeFilter"
            placeholder="全部資源類型"
            clearable
            style="width: 180px;"
            @change="applyFilters"
          >
            <el-option label="全部" value="" />
            <el-option
              v-for="type in uniqueResourceTypes"
              :key="type"
              :label="getResourceTypeLabel(type)"
              :value="type"
            />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">階段：</span>
          <el-select
            v-model="filters.stageFilter"
            placeholder="全部階段"
            clearable
            style="width: 220px;"
            @change="applyFilters"
          >
            <el-option label="全部階段" value="" />
            <el-option
              v-for="stage in uniqueStages"
              :key="stage.stageId"
              :label="`階段 ${stage.stageOrder}: ${stage.stageName}`"
              :value="stage.stageId"
            />
          </el-select>
        </div>
      </template>

      <!-- Expanded Filters (Collapsible) -->
      <template #filters-expanded>
        <!-- 用户过滤器 - Only show for users with multi-user access -->
        <div v-if="shouldShowUserFilter" class="filter-item">
          <span class="filter-label">用戶：</span>
          <el-select
            v-model="filters.selectedUsers"
            multiple
            filterable
            placeholder="選擇用戶"
            style="width: 300px;"
            @change="applyFilters"
            clearable
          >
            <el-option
              v-for="user in availableUsers"
              :key="user.userEmail"
              :label="user.displayName"
              :value="user.userEmail"
            />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">顯示數量：</span>
          <el-slider
            v-model="filters.displayLimit"
            :min="10"
            :max="200"
            :step="10"
            :show-tooltip="true"
            style="width: 200px;"
          />
          <span class="filter-value-display">{{ filters.displayLimit }}</span>
        </div>
      </template>

      <!-- Action Buttons -->
      <template #actions>
        <el-tooltip content="重新整理" placement="top">
          <el-button
            size="small"
            :icon="Refresh"
            @click="refreshLogs"
            :loading="loading"
          >
            <span class="btn-text">重新整理</span>
          </el-button>
        </el-tooltip>
      </template>
    </AdminFilterToolbar>

    <!-- 事件列表 -->
    <div class="event-list">
      <!-- 原生 table + ExpandableTableRow -->
      <table v-if="displayedLogs.length > 0" class="custom-table" v-loading="loading">
        <thead>
          <tr>
            <th style="width: 40px"></th>
            <th style="width: 180px">时间</th>
            <th style="width: 150px">用户</th>
            <th style="width: 200px">操作</th>
            <th style="width: 120px">资源类型</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="event in displayedLogs" :key="event.logId">
            <ExpandableTableRow
              :is-expanded="expandedEventId === event.logId"
              :expansion-colspan="5"
              @toggle-expansion="handleToggleExpansion(event)"
            >
              <!-- 主行内容 -->
              <template #main="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td>{{ formatTimestamp(event.timestamp) }}</td>
                <td>{{ event.displayName || '-' }}</td>
                <td>
                  <el-tag :type="getActionType(event.action || '')">
                    {{ getActionLabel(event.action || '') }}
                  </el-tag>
                </td>
                <td>{{ getResourceTypeLabel(event.resourceType || '') }}</td>
              </template>

              <!-- 展开内容：事件详情 + 资源详情 -->
              <template #default>
                <div class="event-details-expanded">
                  <!-- 事件詳情區塊 -->
                  <div class="detail-section">
                    <h4>
                      <i class="fas fa-info-circle"></i>
                      事件详情
                    </h4>

                    <!-- Event Details - JSON 高亮 -->
                    <div v-if="event.details && Object.keys(event.details).length > 0" class="context-data">
                      <el-divider content-position="left">详细信息</el-divider>
                      <MdPreviewWrapper :content="jsonToMarkdown(event.details)" />
                    </div>

                    <!-- 无详情时显示空状态 -->
                    <EmptyState
                      v-if="!event.details || Object.keys(event.details).length === 0"
                      parent-icon="fa-info-circle"
                      title="无详细信息"
                      :compact="true"
                    />
                  </div>

                  <!-- 资源詳情區塊（如果支持展開） -->
                  <div v-if="canExpand(event.resourceType || '')" class="detail-section">
                    <h4>
                      <i class="fas fa-file-alt"></i>
                      资源详情
                    </h4>

                    <!-- Loading 狀態 -->
                    <div v-if="loadingResourceIds.has(event.logId)" v-loading="true" style="min-height: 100px;">
                      <p style="text-align: center; color: #909399; padding: 20px;">加载资源详情中...</p>
                    </div>

                    <!-- 已載入的資源詳情 -->
                    <div v-else-if="resourceContentMap.has(event.logId)" class="resource-content">
                      <div class="resource-meta">
                        <p><strong>类型：</strong>{{ resourceContentMap.get(event.logId)!.type }}</p>
                        <p><strong>作者：</strong>{{ resourceContentMap.get(event.logId)!.authorEmail || resourceContentMap.get(event.logId)!.submitterEmail }}</p>
                        <p><strong>时间：</strong>{{ formatTimestamp((resourceContentMap.get(event.logId)!.createdTime || resourceContentMap.get(event.logId)!.submitTime) as number) }}</p>
                        <p v-if="resourceContentMap.get(event.logId)!.status"><strong>状态：</strong>{{ resourceContentMap.get(event.logId)!.status }}</p>
                      </div>
                      <el-divider />
                      <div class="resource-main-content">
                        <h5>内容：</h5>
                        <MdPreviewWrapper :content="(resourceContentMap.get(event.logId)!.content || resourceContentMap.get(event.logId)!.contentMarkdown) as string" />
                      </div>
                    </div>

                    <!-- 載入失敗或未載入 -->
                    <EmptyState
                      v-else
                      parent-icon="fa-file-alt"
                      title="点击展开按钮加载资源详情"
                      :compact="true"
                    />
                  </div>
                </div>
              </template>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <!-- 空状态 -->
      <EmptyState
        v-if="!loading && displayedLogs.length === 0"
        parent-icon="fa-clipboard-list"
        title="暫無事件記錄"
        :compact="true"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
// @ts-ignore - icons-vue package type issue
import { Refresh } from '@element-plus/icons-vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'
import type { EventLog } from '@/types'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './admin/shared/AdminFilterToolbar.vue'
import { sanitizeHtml, sanitizeText } from '@/utils/sanitize'
import ExpandableTableRow from './shared/ExpandableTableRow.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { jsonToMarkdown } from '@/utils/json-preview'

// Define types for component data
interface UserOption {
  userEmail: string;
  displayName: string;
}

interface StageOption {
  stageId: string;
  stageName: string;
  stageOrder: number;
}

interface ResourceDetail {
  type?: string;
  authorEmail?: string;
  submitterEmail?: string;
  createdTime?: number;
  submitTime?: number;
  status?: string;
  content?: string;
  contentMarkdown?: string;
}

const props = defineProps({
  projectId: {
    type: String,
    required: true,
    default: ''
  },
  userMode: {
    type: Boolean,
    default: false // false = ProjectManagement mode, true = Dashboard mode
  },
  permissionLevel: {
    type: String,
    default: '' // Will be set by parent: 'admin', 'teacher', 'observer', 'group_leader', 'member_in_group', 'member_no_group'
  }
})

// 数据
const loading = ref(false)
const allLogs = ref<EventLog[]>([])
// Filter persistence (localStorage)
const { filters, isLoaded: filtersLoaded } = useFilterPersistence('eventLogViewer', {
  displayLimit: 50,
  dateRange: null as [string, string] | null,
  selectedUsers: [] as string[],
  resourceTypeFilter: '',
  stageFilter: ''
})

// Backward compatibility computed properties
const displayLimit = computed({
  get: () => filters.value.displayLimit,
  set: (val) => { filters.value.displayLimit = val }
})
const dateRange = computed({
  get: () => filters.value.dateRange,
  set: (val) => { filters.value.dateRange = val }
})
const selectedUsers = computed({
  get: () => filters.value.selectedUsers,
  set: (val) => { filters.value.selectedUsers = val }
})
const resourceTypeFilter = computed({
  get: () => filters.value.resourceTypeFilter,
  set: (val) => { filters.value.resourceTypeFilter = val }
})
const stageFilter = computed({
  get: () => filters.value.stageFilter,
  set: (val) => { filters.value.stageFilter = val }
})

const availableUsers = ref<UserOption[]>([])
const userPermissionLevel = ref('') // Permission level from backend API

// 资源展开 - 使用 Map 存儲每個事件的資源詳情
const resourceContentMap = ref<Map<string, ResourceDetail>>(new Map())
const loadingResourceIds = ref<Set<string>>(new Set())

// 事件详情展开（行内展开）
const expandedEventId = ref<string | null>(null)

// CSV 匯出
const exporting = ref(false)

// 计算属性
// 計算唯一資源類型
const uniqueResourceTypes = computed<string[]>(() => {
  if (!allLogs.value || allLogs.value.length === 0) return []
  const types = allLogs.value.map(event => event.resourceType).filter((type): type is string => Boolean(type))
  return [...new Set(types)].sort()
})

// 計算唯一階段
const uniqueStages = computed<StageOption[]>(() => {
  if (!allLogs.value || allLogs.value.length === 0) return []

  const stageMap = new Map<string, StageOption>()
  allLogs.value.forEach(event => {
    if (event.stageId && !stageMap.has(event.stageId)) {
      stageMap.set(event.stageId, {
        stageId: event.stageId,
        stageName: event.stageName || '未知階段',
        stageOrder: event.stageOrder !== undefined ? event.stageOrder : 999
      })
    }
  })

  return Array.from(stageMap.values()).sort((a, b) => a.stageOrder - b.stageOrder)
})

// Permission-based computed properties
const permissionScopeText = computed(() => {
  switch (userPermissionLevel.value) {
    case 'admin':
      return '查看範圍: 全系統'
    case 'teacher':
      return '查看範圍: 全專案 (教師)'
    case 'observer':
      return '查看範圍: 全專案 (觀察者)'
    case 'group_leader':
      return '查看範圍: 本組成員'
    case 'member_in_group':
      return '查看範圍: 僅限本人'
    case 'member_no_group':
      return '查看範圍: 無權限'
    default:
      return ''
  }
})

const shouldShowUserFilter = computed(() => {
  // Only show user filter if user can see multiple people's logs
  return ['admin', 'teacher', 'observer', 'group_leader'].includes(userPermissionLevel.value)
})

const displayedLogs = computed<EventLog[]>(() => {
  let filtered = [...allLogs.value]

  // 时间范围过滤
  if (dateRange.value && dateRange.value.length === 2) {
    const [start, end] = dateRange.value
    filtered = filtered.filter(log => {
      return log.timestamp >= parseInt(start) && log.timestamp <= parseInt(end) + 86400000 // +1 day
    })
  }

  // 用户过滤
  if (selectedUsers.value.length > 0) {
    filtered = filtered.filter(log => log.userEmail && selectedUsers.value.includes(log.userEmail))
  }

  // 資源類型過濾
  if (resourceTypeFilter.value) {
    filtered = filtered.filter(log => log.resourceType === resourceTypeFilter.value)
  }

  // 階段過濾
  if (stageFilter.value) {
    filtered = filtered.filter(log => log.stageId === stageFilter.value)
  }

  // 限制数量
  return filtered.slice(0, displayLimit.value)
})

// 計算啟用的過濾器數量
const activeFilterCount = computed(() => {
  let count = 0
  if (filters.value.dateRange && filters.value.dateRange.length === 2) count++
  if (filters.value.resourceTypeFilter) count++
  if (filters.value.stageFilter) count++
  if (filters.value.selectedUsers && filters.value.selectedUsers.length > 0) count++
  return count
})

// 計算展開區域的過濾器數量（用於顯示 badge）
const expandedFilterCount = computed(() => {
  // 显示数量滑块总是显示 (1 个)
  // 用户过滤器条件显示 (0 或 1 个)
  return shouldShowUserFilter.value ? 2 : 1
})

// Export configuration
const exportConfig = computed(() => ({
  data: displayedLogs.value as unknown as Record<string, unknown>[],
  filename: '事件日誌',
  headers: ['時間', '用戶', '資源類型', '階段', '操作'],
  rowMapper: (item: Record<string, unknown>) => {
    const log = item as unknown as EventLog
    return [
      new Date(log.timestamp).toLocaleString('zh-TW'),
      log.userEmail || 'system',
      getResourceTypeLabel(log.resourceType || '-'),
      log.stageName || '-',
      log.action || '-'
    ] as (string | number)[]
  }
}))

// 方法
const loadEventLogs = async () => {
  // 驗證 projectId
  if (!props.projectId) {
    console.error('loadEventLogs: projectId is required but not provided')
    ElMessage.error('無法載入事件日誌：缺少專案 ID')
    allLogs.value = []
    availableUsers.value = []
    return
  }

  loading.value = true
  try {
    const endpoint = props.userMode ? 'user' : 'project'
    const params = {
      projectId: props.projectId,
      filters: {}
    }

    console.log('📊 EventLogViewer: Loading event logs', { endpoint, params })

    const httpResponse = await rpcClient.eventlogs[endpoint].$post({
      json: params
    })
    const response = await httpResponse.json()

    console.log('📊 EventLogViewer: API response', {
      success: response.success,
      logsCount: response.data?.logs?.length,
      error: response.error
    })

    if (response.success) {
      // Backend returns { logs: [...], total: number, userPermissionLevel: string }
      allLogs.value = response.data?.logs || []
      userPermissionLevel.value = response.data?.userPermissionLevel || props.permissionLevel || ''

      console.log('📊 EventLogViewer: Permission level received:', userPermissionLevel.value)

      // 提取唯一用户列表
      const usersMap = new Map()
      allLogs.value.forEach(log => {
        if (!usersMap.has(log.userEmail)) {
          usersMap.set(log.userEmail, {
            userEmail: log.userEmail,
            displayName: log.displayName
          })
        }
      })
      availableUsers.value = Array.from(usersMap.values())
    } else {
      // 即使失敗也要設置預設值
      allLogs.value = []
      availableUsers.value = []
      ElMessage.error(response.error?.message || '加载事件日志失败')
    }
  } catch (error) {
    console.error('加载事件日志失败:', error)
    // 設置預設值
    allLogs.value = []
    availableUsers.value = []
    ElMessage.error('加载事件日志失败：' + getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

const refreshLogs = () => {
  loadEventLogs()
}

const applyFilters = () => {
  // 过滤逻辑在 computed 中自动处理
}

const handleResetFilters = () => {
  filters.value.dateRange = null
  filters.value.resourceTypeFilter = ''
  filters.value.stageFilter = ''
  filters.value.selectedUsers = []
  // displayLimit 保持不變（用戶偏好）
}

const canExpand = (resourceType: string) => {
  return resourceType === 'submission' || resourceType === 'comment'
}

// 切换事件详情展开
const handleToggleExpansion = async (event: EventLog) => {
  if (expandedEventId.value === event.logId) {
    // 收起展開
    expandedEventId.value = null
  } else {
    // 展開事件
    expandedEventId.value = event.logId

    // 如果該事件支持展開資源且尚未載入，自動載入
    if (canExpand(event.resourceType || '') && !resourceContentMap.value.has(event.logId)) {
      await loadResourceForEvent(event)
    }
  }
}

// 載入事件的資源詳情
const loadResourceForEvent = async (event: EventLog) => {
  const logId = event.logId
  loadingResourceIds.value.add(logId)

  try {
    // EventLog type might not have resourceId, use type assertion
    const eventWithResource = event as EventLog & { resourceId?: string }

    // Type assertion needed due to AppType being any
    const httpResponse = await (rpcClient.eventlogs as any).resource.$post({
      json: {
        projectId: props.projectId,
        resourceType: event.resourceType,
        resourceId: eventWithResource.resourceId
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      resourceContentMap.value.set(logId, response.data)
    } else {
      ElMessage.error(response.error?.message || '加载资源详情失败')
    }
  } catch (error) {
    console.error('加载资源详情失败:', error)
    ElMessage.error('加载资源详情失败：' + getErrorMessage(error))
  } finally {
    loadingResourceIds.value.delete(logId)
  }
}

const formatTimestamp = (timestamp: number | undefined): string => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getActionType = (action: string): 'success' | 'primary' | 'warning' | 'info' | 'danger' | undefined => {
  if (action.includes('created')) return 'success'
  if (action.includes('deleted') || action.includes('removed')) return 'danger'
  if (action.includes('updated')) return 'warning'
  if (action.includes('settled')) return 'info'
  return undefined
}

const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    // 项目
    'project_created': '创建项目',
    'project_updated': '更新项目',
    'project_archived': '归档项目',
    'project_cloned': '克隆项目',

    // 阶段
    'stage_created': '创建阶段',
    'stage_updated': '更新阶段',
    'stage_status_changed': '阶段状态变更',

    // 群组
    'group_created': '创建群组',
    'group_deleted': '删除群组',
    'member_added': '添加成员',
    'member_removed': '移除成员',
    'leader_assigned_by_admin': '指派组长',

    // 提交
    'submission_created': '创建提交',
    'submission_updated': '更新提交',
    'submission_deleted': '撤销提交',

    // 评论
    'comment_created': '创建评论',

    // 投票
    'consensus_vote_submitted': '共识投票',
    'ranking_vote_submitted': '排名投票',
    'comment_vote_submitted': '评论投票',
    'teacher_submission_ranking': '教师作品排名',
    'teacher_comment_ranking': '教师评论排名',

    // 结算
    'stage_settled': '阶段结算'
  }
  return labels[action] || action
}

const getResourceTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'project': '项目',
    'stage': '阶段',
    'group': '群组',
    'submission': '提交',
    'comment': '评论',
    'vote': '投票',
    'settlement': '结算'
  }
  return labels[type] || type
}

const exportToCsv = async () => {
  if (displayedLogs.value.length === 0) {
    ElMessage.warning('沒有可匯出的事件記錄')
    return
  }

  exporting.value = true

  try {
    // CSV header
    const headers = ['时间', '用户', '操作', '资源类型', '详情']
    const rows = [headers]

    // Process each log entry
    displayedLogs.value.forEach(log => {
      const row = [
        formatTimestamp(log.timestamp),
        log.displayName || '-',
        getActionLabel(log.action || ''),
        getResourceTypeLabel(log.resourceType || ''),
        log.details ? JSON.stringify(log.details) : '-'
      ]
      rows.push(row)
    })

    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        const cellStr = String(cell || '')
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`
        }
        return cellStr
      }).join(',')
    ).join('\n')

    // Add UTF-8 BOM for Excel compatibility with Chinese characters
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    const filename = `事件日誌_${date}.csv`

    // Create download link and trigger download
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success(`已匯出 ${displayedLogs.value.length} 筆事件記錄`)
  } catch (error) {
    console.error('CSV 匯出失敗:', error)
    ElMessage.error('CSV 匯出失敗：' + getErrorMessage(error))
  } finally {
    exporting.value = false
  }
}

// 生命周期
onMounted(() => {
  loadEventLogs()
})
</script>

<style scoped>
.event-log-viewer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

/* Permission Scope Banner */
.permission-scope-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 10px;
  border: 2px solid;
}

.permission-scope-banner i {
  font-size: 16px;
}

/* Permission level color schemes */
.permission-admin {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: #667eea;
}

.permission-teacher {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border-color: #f093fb;
}

.permission-observer {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
  border-color: #4facfe;
}

.permission-group_leader {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  color: #1a5632;
  border-color: #43e97b;
}

.permission-member_in_group {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
  color: #7a3419;
  border-color: #fa709a;
}

.permission-member_no_group {
  background: #f5f7fa;
  color: #909399;
  border-color: #dcdfe6;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 15px;
  flex: 1;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  min-width: 80px;
  font-weight: 500;
}

.limit-display {
  font-size: 14px;
  color: #409eff;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

.event-list {
  flex: 1;
}

.event-details {
  font-size: 13px;
  color: #606266;
}

.resource-meta {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
}

.resource-meta p {
  margin: 5px 0;
}

.resource-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
}

/* ========== 新增：Custom Table Styles ========== */

/* Table Container */
.table-container {
  width: 100%;
  overflow-x: auto;
}

/* Custom Table Styles */
.custom-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.custom-table thead {
  background: #f5f7fa;
  color: #909399;
  font-weight: 600;
  font-size: 14px;
}

.custom-table thead th {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.custom-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  color: #606266;
  font-size: 14px;
}

.custom-table tbody tr:hover {
  background: #f5f7fa;
}

/* Event Details Expanded Section */
.event-details-expanded {
  padding: 20px;
}

.detail-section {
  margin-bottom: 30px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.event-details-expanded h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-details-expanded h4 i {
  color: #409eff;
}

.event-details-expanded h5 {
  margin: 10px 0 8px 0;
  color: #606266;
  font-size: 14px;
  font-weight: 600;
}

/* Resource Meta */
.resource-meta {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.resource-meta p {
  margin: 8px 0;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

.resource-meta strong {
  color: #303133;
  margin-right: 8px;
}

/* Resource Main Content */
.resource-main-content {
  background: #ffffff;
  padding: 15px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  max-height: 500px;
  overflow-y: auto;
}

.resource-main-content h5 {
  margin-top: 0;
}

/* Context Data (JSON) */
.context-data {
  margin-top: 20px;
}

.context-json {
  margin: 0;
  padding: 12px;
  font-family: 'Courier New', Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #2c3e50;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

/* Highlight.js 主题覆盖 */
.context-json.hljs {
  background: #f6f8fa;
}
</style>
