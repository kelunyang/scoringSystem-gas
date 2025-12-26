<template>
  <div class="event-log-viewer">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <el-button
        :icon="Refresh"
        @click="refreshLogs"
        :loading="loading"
      >
        重新整理
      </el-button>

      <div class="filters">
        <!-- 数量滑块 -->
        <div class="filter-item">
          <span class="filter-label">显示数量：{{ displayLimit }}</span>
          <el-slider
            v-model="displayLimit"
            :min="10"
            :max="200"
            :step="10"
            style="width: 200px; margin-left: 10px;"
          />
        </div>

        <!-- 日期范围选择器 -->
        <div class="filter-item">
          <span class="filter-label">时间范围：</span>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="x"
            style="width: 300px;"
            @change="applyFilters"
          />
        </div>

        <!-- 用户过滤器（仅组长和ProjectManagement模式） -->
        <div class="filter-item" v-if="showUserFilter">
          <span class="filter-label">用户：</span>
          <el-select
            v-model="selectedUsers"
            multiple
            filterable
            placeholder="选择用户"
            style="width: 300px;"
            @change="applyFilters"
          >
            <el-option
              v-for="user in availableUsers"
              :key="user.userEmail"
              :label="user.displayName"
              :value="user.userEmail"
            />
          </el-select>
        </div>
      </div>
    </div>

    <!-- 事件列表 -->
    <div class="event-list" v-loading="loading">
      <el-table
        :data="displayedLogs"
        style="width: 100%"
        :max-height="600"
        stripe
      >
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTimestamp(row.timestamp) }}
          </template>
        </el-table-column>

        <el-table-column prop="displayName" label="用户" width="150" />

        <el-table-column prop="action" label="操作" width="200">
          <template #default="{ row }">
            <el-tag :type="getActionType(row.action)">
              {{ getActionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="resourceType" label="资源类型" width="120">
          <template #default="{ row }">
            {{ getResourceTypeLabel(row.resourceType) }}
          </template>
        </el-table-column>

        <el-table-column label="详情" min-width="300">
          <template #default="{ row }">
            <div class="event-details">
              <span v-if="row.details">{{ formatDetails(row.details) }}</span>
              <span v-else>-</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="canExpand(row.resourceType)"
              size="small"
              @click="expandResource(row)"
              :loading="expandingId === row.logId"
            >
              展开
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态 -->
      <el-empty
        v-if="!loading && displayedLogs.length === 0"
        description="暂无事件记录"
      />
    </div>

    <!-- 资源详情对话框 -->
    <el-dialog
      v-model="resourceDialogVisible"
      :title="resourceDialogTitle"
      width="60%"
    >
      <div v-if="resourceContent" v-loading="loadingResource">
        <div class="resource-meta">
          <p><strong>类型：</strong>{{ resourceContent.type }}</p>
          <p><strong>作者：</strong>{{ resourceContent.authorEmail || resourceContent.submitterEmail }}</p>
          <p><strong>时间：</strong>{{ formatTimestamp(resourceContent.createdTime || resourceContent.submitTime) }}</p>
          <p v-if="resourceContent.status"><strong>状态：</strong>{{ resourceContent.status }}</p>
        </div>
        <el-divider />
        <div class="resource-content">
          <h4>内容：</h4>
          <div v-html="renderMarkdown(resourceContent.content || resourceContent.contentMarkdown)" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, getCurrentInstance } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { marked } from 'marked'

const props = defineProps({
  projectId: {
    type: String,
    required: true
  },
  userMode: {
    type: Boolean,
    default: false // false = ProjectManagement mode, true = Dashboard mode
  }
})

// 获取 API 客户端
const instance = getCurrentInstance()
const apiClient = instance.appContext.config.globalProperties.$apiClient

// 数据
const loading = ref(false)
const allLogs = ref([])
const displayLimit = ref(50)
const dateRange = ref(null)
const selectedUsers = ref([])
const availableUsers = ref([])

// 资源展开
const resourceDialogVisible = ref(false)
const resourceDialogTitle = ref('')
const resourceContent = ref(null)
const loadingResource = ref(false)
const expandingId = ref(null)

// 计算属性
const showUserFilter = computed(() => {
  // 在 ProjectManagement 模式下总是显示
  if (!props.userMode) return true

  // 在 Dashboard 模式下，如果用户列表有多个用户则显示（即用户是组长）
  return availableUsers.value.length > 1
})

const displayedLogs = computed(() => {
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
    filtered = filtered.filter(log => selectedUsers.value.includes(log.userEmail))
  }

  // 限制数量
  return filtered.slice(0, displayLimit.value)
})

// 方法
const loadEventLogs = async () => {
  loading.value = true
  try {
    const endpoint = props.userMode ? '/eventlogs/user' : '/eventlogs/project'
    const params = {
      projectId: props.projectId,
      filters: {}
    }

    const response = await apiClient.callWithAuth(endpoint, params)

    if (response.success) {
      allLogs.value = response.data || []

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
      ElMessage.error(response.error?.message || '加载事件日志失败')
    }
  } catch (error) {
    console.error('加载事件日志失败:', error)
    ElMessage.error('加载事件日志失败：' + (error.message || '未知错误'))
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

const canExpand = (resourceType) => {
  return resourceType === 'submission' || resourceType === 'comment'
}

const expandResource = async (row) => {
  expandingId.value = row.logId
  loadingResource.value = true
  resourceDialogVisible.value = true
  resourceDialogTitle.value = `${getResourceTypeLabel(row.resourceType)} - ${row.resourceId}`

  try {
    const response = await apiClient.callWithAuth('/eventlogs/resource', {
      projectId: props.projectId,
      resourceType: row.resourceType,
      resourceId: row.resourceId
    })

    if (response.success) {
      resourceContent.value = response.data
    } else {
      ElMessage.error(response.error?.message || '加载资源详情失败')
      resourceDialogVisible.value = false
    }
  } catch (error) {
    console.error('加载资源详情失败:', error)
    ElMessage.error('加载资源详情失败：' + (error.message || '未知错误'))
    resourceDialogVisible.value = false
  } finally {
    loadingResource.value = false
    expandingId.value = null
  }
}

const formatTimestamp = (timestamp) => {
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

const getActionType = (action) => {
  if (action.includes('created')) return 'success'
  if (action.includes('deleted') || action.includes('removed')) return 'danger'
  if (action.includes('updated')) return 'warning'
  if (action.includes('settled')) return 'info'
  return ''
}

const getActionLabel = (action) => {
  const labels = {
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

const getResourceTypeLabel = (type) => {
  const labels = {
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

const formatDetails = (details) => {
  if (!details) return ''

  const parts = []

  if (details.stageName) parts.push(`阶段：${details.stageName}`)
  if (details.groupName) parts.push(`群组：${details.groupName}`)
  if (details.memberEmail) parts.push(`用户：${details.memberEmail}`)
  if (details.leaderEmail) parts.push(`组长：${details.leaderEmail}`)
  if (details.version) parts.push(`版本：${details.version}`)
  if (details.voteType) parts.push(`类型：${details.voteType}`)
  if (details.totalPoints) parts.push(`点数：${details.totalPoints}`)
  if (details.from && details.to) parts.push(`${details.from} → ${details.to}`)
  if (details.auto) parts.push('(自动)')

  return parts.join('，') || JSON.stringify(details)
}

const renderMarkdown = (content) => {
  if (!content) return ''
  return marked(content)
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

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
</style>
