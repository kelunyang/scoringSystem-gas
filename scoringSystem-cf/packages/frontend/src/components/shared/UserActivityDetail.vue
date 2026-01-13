<template>
  <div class="user-activity-detail">
    <div class="detail-header">
      <h4>
        <i class="fas fa-calendar-day"></i>
        {{ formattedDate }} 的活動詳情
      </h4>
      <span class="event-count">共 {{ events.length }} 個事件</span>
    </div>

    <EmptyState
      v-if="events.length === 0"
      :icons="['fa-info-circle']"
      title="此日期無活動記錄"
      parent-icon="fa-calendar-xmark"
      :compact="true"
      :enable-animation="false"
    />

    <el-timeline v-else>
      <el-timeline-item
        v-for="event in sortedEvents"
        :key="getEventKey(event)"
        :timestamp="formatTime(event.timestamp)"
        :color="getEventColor(event)"
        placement="top"
      >
        <div class="event-card">
          <div class="event-header">
            <i :class="getEventIcon(event)"></i>
            <strong>{{ getEventTitle(event) }}</strong>
          </div>

          <!-- 登入成功事件 -->
          <div v-if="event.eventType === 'login_success'" class="event-detail">
            <div class="event-info">
              <i class="fas fa-map-marker-alt"></i>
              IP: {{ event.ipAddress || 'unknown' }}
            </div>
          </div>

          <!-- 登入失敗事件 -->
          <div v-else-if="event.eventType === 'login_failed'" class="event-detail error">
            <div class="event-info">
              <i class="fas fa-exclamation-triangle"></i>
              失敗原因: {{ getFailureReasonText(event.reason || event.action || 'unknown') }}
            </div>
            <div class="event-info">
              <i class="fas fa-map-marker-alt"></i>
              IP: {{ event.ipAddress || 'unknown' }}
            </div>
          </div>

          <!-- 專案活動事件 -->
          <div v-else class="event-detail">
            <div class="event-info">
              <i class="fas fa-project-diagram"></i>
              專案: {{ event.projectName || '未知專案' }}
            </div>
          </div>

          <!-- Context View Toggle Button -->
          <div class="event-actions">
            <el-button
              size="small"
              type="info"
              @click="toggleEventContext(event)"
              :loading="isLoadingContext(event)"
            >
              <i :class="isEventExpanded(event) ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              {{ isEventExpanded(event) ? '隱藏詳情' : '檢視詳情' }}
            </el-button>
          </div>

          <!-- Expandable Context Display -->
          <div v-if="isEventExpanded(event)" class="event-context">
            <div class="context-header">
              <i class="fas fa-code"></i>
              <span>事件詳細資訊 (JSON)</span>
            </div>
            <MdPreviewWrapper :content="jsonToMarkdown(eventContexts.get(getEventKey(event)))" />
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef, onUnmounted, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { formatDateChinese, formatTime as formatTimestamp } from '@/utils/date'
import EmptyState from './EmptyState.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { jsonToMarkdown } from '@/utils/json-preview'

/**
 * Event interface
 */
export interface Event {
  timestamp: number
  eventType?: string
  action?: string
  entityType?: string
  entityId?: string
  projectId?: string
  projectName?: string
  ipAddress?: string
  reason?: string
  context?: any
  date?: string
  [key: string]: any
}

/**
 * Props interface
 */
export interface Props {
  userEmail: string
  date: string
  events?: Event[]
  canViewDetails?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  events: () => [],
  canViewDetails: true
})

// Component mounted state - used to prevent memory leaks
const isMounted = ref(true)

// Use shallowRef for collections (no deep reactivity needed)
const expandedEventIds = shallowRef(new Set<string>())
const loadingContextIds = shallowRef(new Set<string>())
const eventContexts = shallowRef(new Map<string, any>())

/**
 * Sorted events (chronological order)
 */
const sortedEvents: ComputedRef<Event[]> = computed(() => {
  return [...props.events].sort((a, b) => a.timestamp - b.timestamp)
})

/**
 * Formatted date display
 */
const formattedDate = computed(() => {
  return formatDateChinese(props.date)
})

/**
 * Format timestamp to HH:MM:SS
 */
function formatTime(timestamp: number | undefined | null): string {
  return formatTimestamp(timestamp)
}

/**
 * Get event title based on event type
 */
function getEventTitle(event: Event): string {
  if (event.eventType === 'login_success') return '登入成功'
  if (event.eventType === 'login_failed') return '登入失敗'

  const actionMap: Record<string, string> = {
    create_submission: '建立提交',
    update_submission: '更新提交',
    delete_submission: '刪除提交',
    create_comment: '新增評論',
    update_comment: '更新評論',
    delete_comment: '刪除評論',
    vote: '投票',
    approve_group: '批准小組'
  }

  return actionMap[event.action || event.eventType || ''] || '未知活動'
}

/**
 * Get event icon based on event type
 */
function getEventIcon(event: Event): string {
  if (event.eventType === 'login_success') return 'fas fa-sign-in-alt event-icon success'
  if (event.eventType === 'login_failed') return 'fas fa-times-circle event-icon error'

  const iconMap: Record<string, string> = {
    create_submission: 'fas fa-file-alt event-icon',
    update_submission: 'fas fa-edit event-icon',
    delete_submission: 'fas fa-trash event-icon',
    create_comment: 'fas fa-comment event-icon',
    update_comment: 'fas fa-comment-dots event-icon',
    delete_comment: 'fas fa-comment-slash event-icon',
    vote: 'fas fa-vote-yea event-icon',
    approve_group: 'fas fa-check-circle event-icon'
  }

  return iconMap[event.action || event.eventType || ''] || 'fas fa-circle event-icon'
}

/**
 * Get event color based on event type
 */
function getEventColor(event: Event): string {
  if (event.eventType === 'login_success') return '#67c23a'
  if (event.eventType === 'login_failed') return '#f56c6c'
  return '#409eff'
}

/**
 * Get failure reason text
 */
function getFailureReasonText(reason: string): string {
  const reasonMap: Record<string, string> = {
    invalid_credentials: '帳號或密碼錯誤',
    user_not_found: '使用者不存在',
    account_disabled: '帳號已停用',
    password_expired: '密碼已過期',
    '2fa_required': '需要 2FA 驗證',
    '2fa_invalid': '2FA 驗證碼無效',
    '2fa_expired': '2FA 驗證碼過期',
    '2fa_max_attempts': '2FA 驗證次數過多'
  }

  return reasonMap[reason] || reason || '未知錯誤'
}

/**
 * Generate unique event key
 */
function getEventKey(event: Event): string {
  return `${event.timestamp}-${event.entityId || event.eventType}`
}

/**
 * Check if event context is expanded
 */
function isEventExpanded(event: Event): boolean {
  return expandedEventIds.value.has(getEventKey(event))
}

/**
 * Check if event context is loading
 */
function isLoadingContext(event: Event): boolean {
  return loadingContextIds.value.has(getEventKey(event))
}

/**
 * Get event context from cache
 */
function getEventContext(event: Event): any {
  return eventContexts.value.get(getEventKey(event))
}

/**
 * Load event context
 */
async function loadEventContext(event: Event, eventKey: string): Promise<void> {
  // Create new Set to trigger reactivity
  const newLoadingIds = new Set(loadingContextIds.value)
  newLoadingIds.add(eventKey)
  loadingContextIds.value = newLoadingIds

  try {
    let context: any = null

    // For login events, context is in the event object
    if (event.eventType === 'login_success' || event.eventType === 'login_failed') {
      context = {
        eventType: event.eventType,
        ipAddress: event.ipAddress || 'unknown',
        reason: event.reason,
        timestamp: event.timestamp,
        date: event.date,
        action: event.action
      }
    } else {
      // For activity events, fetch full details
      if (event.entityType === 'submission' && event.entityId) {
        const httpResponse = await rpcClient.submissions.details.$post({
          json: {
            projectId: event.projectId!,
            submissionId: event.entityId
          }
        })
        const response = await httpResponse.json()
        context = response.success ? response.data : { error: response.error }
      } else if (event.entityType === 'comment' && event.entityId) {
        const httpResponse = await rpcClient.comments.details.$post({
          json: {
            projectId: event.projectId!,
            commentId: event.entityId
          }
        })
        const response = await httpResponse.json()
        context = response.success ? response.data : { error: response.error }
      } else {
        // For other event types, show basic info
        context = {
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          projectId: event.projectId,
          projectName: event.projectName,
          timestamp: event.timestamp,
          action: event.action,
          date: event.date
        }
      }
    }

    // CRITICAL: Check if component is still mounted before updating state
    if (!isMounted.value) return

    // Update context cache
    const newContexts = new Map(eventContexts.value)
    newContexts.set(eventKey, context)
    eventContexts.value = newContexts
  } catch (error) {
    console.error('Error loading event context:', error)

    // CRITICAL: Check if component is still mounted before updating state
    if (!isMounted.value) return

    const newContexts = new Map(eventContexts.value)
    newContexts.set(eventKey, {
      error: 'Failed to load context',
      message: error instanceof Error ? error.message : String(error)
    })
    eventContexts.value = newContexts

    ElMessage.error('載入事件詳情時發生錯誤')
  } finally {
    // CRITICAL: Check if component is still mounted before updating state
    if (!isMounted.value) return

    // Remove from loading set
    const newLoadingIds = new Set(loadingContextIds.value)
    newLoadingIds.delete(eventKey)
    loadingContextIds.value = newLoadingIds
  }
}

/**
 * Toggle event context display
 */
async function toggleEventContext(event: Event): Promise<void> {
  const eventKey = getEventKey(event)

  // If already expanded, collapse
  if (expandedEventIds.value.has(eventKey)) {
    const newExpandedIds = new Set(expandedEventIds.value)
    newExpandedIds.delete(eventKey)
    expandedEventIds.value = newExpandedIds
    return
  }

  // If context not loaded yet, fetch it
  if (!eventContexts.value.has(eventKey)) {
    await loadEventContext(event, eventKey)
  }

  // Expand
  const newExpandedIds = new Set(expandedEventIds.value)
  newExpandedIds.add(eventKey)
  expandedEventIds.value = newExpandedIds
}

/**
 * Clear cache when date changes
 */
watch(() => props.date, () => {
  expandedEventIds.value = new Set()
  eventContexts.value = new Map()
  loadingContextIds.value = new Set()
})

/**
 * Cleanup on component unmount to prevent memory leaks
 */
onUnmounted(() => {
  // CRITICAL: Set mounted flag to false FIRST
  // This prevents any pending async operations from updating state
  isMounted.value = false

  // Clear all Maps and Sets
  expandedEventIds.value.clear()
  eventContexts.value.clear()
  loadingContextIds.value.clear()
})
</script>

<style scoped>
.user-activity-detail {
  padding: 20px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #ebeef5;
}

.detail-header h4 {
  margin: 0;
  font-size: 16px;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-count {
  font-size: 14px;
  color: #909399;
  font-weight: normal;
}

.no-events {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #909399;
}

.no-events i {
  font-size: 48px;
  margin-bottom: 15px;
  opacity: 0.5;
}

.no-events p {
  font-size: 14px;
}

.event-card {
  background: #f9f9f9;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

.event-icon {
  font-size: 16px;
  color: #409eff;
}

.event-icon.success {
  color: #67c23a;
}

.event-icon.error {
  color: #f56c6c;
}

.event-detail {
  margin-top: 8px;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
}

.event-detail.error {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.event-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: #606266;
}

.event-info:last-child {
  margin-bottom: 0;
}

.event-info i {
  font-size: 12px;
  color: #909399;
}

.event-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
}

.event-context {
  margin-top: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.context-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.context-header i {
  color: #409eff;
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

.context-json::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.context-json::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.context-json::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.context-json::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .user-activity-detail {
    padding: 15px;
  }

  .detail-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .event-card {
    padding: 10px;
  }
}
</style>
