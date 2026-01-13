<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    :close-on-click-modal="true"
    :show-close="true"
    :before-close="handleClose"
    class="ai-suggestion-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-robot"></i>
          AI 輔助建議
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <!-- Drawer Alert Zone -->
      <DrawerAlertZone />

      <!-- 排名模式切換 (成果/評論) -->
      <div class="form-section mode-switch-section">
        <el-segmented
          v-model="activeMode"
          :options="modeOptions"
          :disabled="isProcessing"
          size="large"
          @change="handleModeChange"
        />
      </div>

      <!-- AI 模型與模式選擇區塊 -->
      <div class="form-section">
        <h4><i class="fas fa-cog"></i> AI 模型選擇</h4>
        <div class="query-controls">
          <el-select
            v-model="selectedProviderIds"
            placeholder="選擇 AI 模型（可多選）"
            :disabled="isProcessing || providersLoading"
            class="provider-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            @change="handleProviderChange"
          >
            <el-option
              v-for="provider in availableProviders"
              :key="provider.id"
              :label="`${provider.name} (${provider.model})`"
              :value="provider.id"
            />
          </el-select>
          <el-switch
            v-if="!isMultiAgentMode"
            v-model="useBTMode"
            active-text="BT 配對比較"
            inactive-text="直接排名"
            :disabled="isProcessing"
            @change="handleBTModeChange"
          />
        </div>

        <!-- BT 模式設定 -->
        <div v-if="useBTMode && !isMultiAgentMode" class="bt-settings">
          <label>每項目比較次數：{{ pairsPerItem }}</label>
          <el-slider
            v-model="pairsPerItem"
            :min="2"
            :max="5"
            :step="1"
            :show-stops="true"
            :disabled="isProcessing"
          />
          <div class="form-hint">
            <i class="fas fa-info-circle"></i>
            預計 {{ expectedComparisons }} 次配對比較，約需 {{ estimatedTime }}
          </div>
        </div>

        <!-- Multi-Agent 模式標籤 -->
        <div v-if="isMultiAgentMode" class="multi-agent-badge">
          <el-tag type="success" effect="dark" size="large">
            <i class="fas fa-users"></i> Multi-Agent 辯論模式
          </el-tag>
          <span class="provider-count">已選擇 {{ selectedProviderIds.length }} 個 AI</span>
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label>自定義提示（選填，最多 100 字）</label>
          <el-input
            v-model="customPrompt"
            type="textarea"
            :rows="3"
            placeholder="例如：請特別注重創意性"
            maxlength="100"
            show-word-limit
            :disabled="isProcessing"
          />
          <div class="form-hint">
            <i class="fas fa-info-circle"></i> 此提示會附加到 AI 評分標準後
          </div>
        </div>
        <div class="form-hint" v-if="currentItems.length === 0">
          <i class="fas fa-info-circle"></i> 目前沒有可排名的{{ rankingTypeLabel }}
        </div>
        <div class="form-hint" v-else-if="activeMode === 'comment' && maxCommentSelections">
          <i class="fas fa-info-circle"></i> 將從 {{ currentItems.length }} 個{{ rankingTypeLabel }}中，讓 AI 挑選並排名最優秀的 {{ maxCommentSelections }} 個
        </div>
        <div class="form-hint" v-else>
          <i class="fas fa-info-circle"></i> 將對 {{ currentItems.length }} 個{{ rankingTypeLabel }}進行 AI 排名分析
        </div>
      </div>

      <!-- 進度顯示區塊 -->
      <div class="form-section" v-if="isProcessing">
        <h4><i class="fas fa-spinner fa-spin"></i> 處理中</h4>
        <el-progress
          :percentage="progressPercent"
          :status="progressStatus"
          :stroke-width="20"
          :format="progressFormat"
        />
        <div class="progress-message">{{ progressMessage }}</div>
        <div v-if="currentPair" class="current-pair">
          正在比較: {{ getItemLabel(currentPair.itemA) }} vs {{ getItemLabel(currentPair.itemB) }}
        </div>

        <!-- Multi-Agent 進度詳情 -->
        <div v-if="isMultiAgentMode && multiAgentProviderResults.length > 0" class="multi-agent-progress">
          <div class="round-indicator">
            <el-tag :type="currentRound === 1 ? 'primary' : 'success'">
              Round {{ currentRound || 1 }}
            </el-tag>
            <span class="round-label">
              {{ currentRound === 1 ? '獨立排名' : currentRound === 2 ? '交叉審視' : '整合結果' }}
            </span>
          </div>
          <div class="provider-status-list">
            <div
              v-for="provider in multiAgentProviderResults"
              :key="provider.providerId"
              class="provider-status-item"
            >
              <span class="provider-name">{{ provider.providerName }}</span>
              <el-tag :type="getProviderStatusType(provider.status)" size="small">
                {{ getProviderStatusLabel(provider.status) }}
              </el-tag>
              <el-tag v-if="provider.round2?.changed" type="warning" size="small">
                立場改變
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 查詢歷史區塊 -->
      <div class="form-section">
        <h4>
          <i class="fas fa-history"></i> 查詢歷史
          <el-tag size="small" type="info" style="margin-left: 8px;">共 {{ history.length }} 筆</el-tag>
        </h4>

        <div class="history-list" v-if="history.length > 0">
          <div
            v-for="query in history"
            :key="query.callId"
            class="history-item"
            :class="{ active: selectedCallId === query.callId }"
            @click="selectQuery(query.callId)"
          >
            <div class="query-meta">
              <el-tag size="small" type="info">{{ query.providerName }}</el-tag>
              <el-tag size="small" :type="getServiceTypeTagType(query.serviceType)">
                {{ getServiceTypeLabel(query.serviceType) }}
              </el-tag>
              <span class="time">{{ formatTime(query.createdAt) }}</span>
              <el-tag v-if="query.itemCount" size="small" type="warning">{{ query.itemCount }} 項</el-tag>
              <el-tag v-if="query.totalTokens" size="small">{{ query.totalTokens }} tokens</el-tag>
              <span class="requester">{{ query.userEmail }}</span>
            </div>
            <div class="query-reason" v-if="query.reason">{{ query.reason }}</div>
            <div class="query-status" v-if="query.status !== 'success'">
              <el-tag :type="getStatusType(query.status)" size="small">{{ getStatusLabel(query.status) }}</el-tag>
            </div>
          </div>
        </div>

        <EmptyState
          v-else
          :icons="['fa-robot']"
          title="尚無查詢歷史"
          description="選擇 AI 模型後點擊查詢"
          :compact="true"
          :enable-animation="false"
        />
      </div>

      <!-- AI 排名結果預覽 -->
      <div class="form-section" v-if="selectedQuery && selectedQuery.result">
        <h4><i class="fas fa-list-ol"></i> AI 排名建議預覽</h4>

        <!-- 自定義提示顯示 -->
        <div class="custom-prompt-display" v-if="selectedQuery.customPrompt">
          <strong><i class="fas fa-comment-dots"></i> 使用的自定義提示：</strong>
          <span>{{ selectedQuery.customPrompt }}</span>
        </div>

        <div class="ranking-reason" v-if="selectedQuery.reason">
          <strong>排名理由：</strong>{{ selectedQuery.reason }}
        </div>

        <!-- DeepSeek 思考過程（可折疊） -->
        <el-collapse v-if="selectedQuery.thinkingProcess" class="thinking-collapse">
          <el-collapse-item name="thinking">
            <template #title>
              <span class="thinking-title">
                <i class="fas fa-brain"></i> AI 思考過程（DeepSeek Thinking）
              </span>
            </template>
            <div class="thinking-content">
              <MdPreviewWrapper :content="selectedQuery.thinkingProcess" />
            </div>
          </el-collapse-item>
        </el-collapse>

        <!-- BT 配對比較詳情（可折疊） -->
        <el-collapse v-if="selectedQuery.btComparisons && selectedQuery.btComparisons.length > 0" class="bt-collapse">
          <el-collapse-item name="btComparisons">
            <template #title>
              <span class="bt-title">
                <i class="fas fa-balance-scale"></i> BT 配對比較詳情（{{ selectedQuery.btComparisons.length }} 輪）
              </span>
            </template>
            <div class="bt-comparisons-list">
              <div v-for="comp in selectedQuery.btComparisons" :key="comp.index" class="bt-comparison-item">
                <div class="comparison-header">
                  <span class="comparison-index">#{{ comp.index }}</span>
                  <span class="comparison-items">
                    {{ getItemLabel(comp.itemA) }} vs {{ getItemLabel(comp.itemB) }}
                  </span>
                </div>
                <div class="comparison-result">
                  <el-tag type="success" size="small">勝者: {{ getItemLabel(comp.winner || '') }}</el-tag>
                  <span class="comparison-reason">{{ comp.reason }}</span>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>

        <!-- BT 能力值（可折疊） -->
        <el-collapse v-if="selectedQuery.btStrengthParams" class="bt-strength-collapse">
          <el-collapse-item name="btStrength">
            <template #title>
              <span class="bt-strength-title">
                <i class="fas fa-chart-bar"></i> BT 能力值
              </span>
            </template>
            <div class="bt-strength-list">
              <div
                v-for="(strength, itemId) in selectedQuery.btStrengthParams"
                :key="itemId"
                class="bt-strength-item"
              >
                <span class="item-label">{{ getItemLabel(itemId as string) }}</span>
                <el-progress
                  :percentage="normalizeStrength(strength as number ?? 0)"
                  :stroke-width="12"
                  :show-text="false"
                />
                <span class="strength-value">{{ ((strength as number) ?? 0).toFixed(3) }}</span>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>

        <ol class="ranking-preview-list">
          <li v-for="(id, index) in selectedQuery.result" :key="id" class="ranking-item">
            <span class="rank-badge">{{ index + 1 }}</span>
            <span class="item-label">{{ getItemLabel(id) }}</span>
          </li>
        </ol>
      </div>

      <!-- 底部操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          size="large"
          @click="queryAI"
          :loading="isProcessing"
          :disabled="selectedProviderIds.length === 0 || currentItems.length === 0"
        >
          <i class="fas fa-search"></i> {{ queryButtonText }}
        </el-button>
        <el-button
          type="primary"
          size="large"
          @click="applyRanking"
          :disabled="!selectedQuery || !selectedQuery.result"
        >
          <i class="fas fa-check"></i> 帶入 AI 排名結果
        </el-button>
        <el-button size="large" @click="close">
          <i class="fas fa-times"></i> 關閉
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/shared/EmptyState.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useWebSocketStore } from '@/stores/websocket'
import type { AIRankingItem } from '@repo/shared'
import type { AIRankingProgressData, BTRankingProgressData, MultiAgentProgressData, MultiAgentProviderResult } from '@/types/websocket'

// ========== Props & Emits ==========

interface AIItem {
  id: string
  content: string
  label: string
  metadata: {
    groupName?: string
    authorName?: string
    memberNames?: string[]
    /** Full reply content array (for comments) */
    replies?: string[]
    /** Reaction user lists (for comments) */
    reactions?: {
      helpful?: string[]
      disagreed?: string[]
    }
  }
}

interface HistoryRecord {
  callId: string
  userEmail: string
  serviceType: 'ranking_direct' | 'ranking_bt' | 'ranking_multi_agent'
  providerName: string
  model: string
  itemCount?: number
  customPrompt?: string
  status: 'pending' | 'processing' | 'success' | 'failed' | 'timeout'
  result?: string[]
  reason?: string
  thinkingProcess?: string
  btComparisons?: Array<{
    index: number
    itemA: string
    itemB: string
    winner?: string
    reason?: string
  }>
  btStrengthParams?: Record<string, number>
  totalTokens?: number
  createdAt: number
}

const props = withDefaults(defineProps<{
  visible: boolean
  projectId: string
  stageId: string
  /** Submission items for AI ranking */
  submissionItems: AIItem[]
  /** Comment items for AI ranking (all valid comments with canBeVoted=true) */
  commentItems: AIItem[]
  /** Initial mode when drawer opens */
  initialMode?: 'submission' | 'comment'
  /** For comment mode: how many comments AI should select and rank */
  maxCommentSelections?: number
}>(), {
  initialMode: 'submission'
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'apply-ranking', ranking: string[], mode: 'submission' | 'comment'): void
}>()

// ========== Composables ==========

const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
const { addAlert, clearAlerts, error: showAlertError, info: showAlertInfo } = useDrawerAlerts()
const websocket = useWebSocketStore()

// ========== State ==========

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// Mode state (submission vs comment)
const activeMode = ref<'submission' | 'comment'>('submission')

// Mode options for el-segmented
const modeOptions = computed(() => [
  {
    label: `🏆 成果排名 (${props.submissionItems.length})`,
    value: 'submission',
    disabled: props.submissionItems.length === 0
  },
  {
    label: `💬 評論排名 (${props.commentItems.length})`,
    value: 'comment',
    disabled: props.commentItems.length === 0
  }
])

const providersLoading = ref(false)
const selectedProviderIds = ref<string[]>([])
const selectedCallId = ref<string | null>(null)
const customPrompt = ref<string>('')
const availableProviders = ref<Array<{ id: string; name: string; model: string }>>([])
const history = ref<HistoryRecord[]>([])
const historyLoading = ref(false)

// BT mode state
const useBTMode = ref(false)
const pairsPerItem = ref(3)

// Processing state
const isProcessing = ref(false)
const currentTaskId = ref<string | null>(null)
const currentCallId = ref<string | null>(null)
const progressPercent = ref(0)
const progressMessage = ref('')
const currentPair = ref<{ itemA: string; itemB: string } | null>(null)

// Multi-Agent state
const currentRound = ref<1 | 2 | null>(null)
const multiAgentProviderResults = ref<MultiAgentProviderResult[]>([])

// ========== Computed ==========

/** Current items based on active mode */
const currentItems = computed(() => {
  return activeMode.value === 'submission' ? props.submissionItems : props.commentItems
})

const rankingTypeLabel = computed(() => {
  return activeMode.value === 'submission' ? '成果' : '評論'
})

const isMultiAgentMode = computed(() => {
  return selectedProviderIds.value.length >= 2
})

const queryButtonText = computed(() => {
  if (isMultiAgentMode.value) {
    return `開始 Multi-Agent 辯論 (${selectedProviderIds.value.length} 個 AI)`
  }
  return useBTMode.value ? '開始 BT 比較' : '查詢 AI 建議'
})

const selectedQuery = computed((): HistoryRecord | null => {
  if (!selectedCallId.value) return null
  return history.value.find(q => q.callId === selectedCallId.value) || null
})

const expectedComparisons = computed(() => {
  const n = currentItems.value.length
  if (n <= 5) {
    return (n * (n - 1)) / 2
  }
  return Math.ceil((n * pairsPerItem.value) / 2)
})

const estimatedTime = computed(() => {
  const seconds = expectedComparisons.value * 4
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.ceil(seconds / 60)} 分鐘`
})

const progressStatus = computed(() => {
  if (progressPercent.value >= 100) return 'success'
  return undefined
})

// ========== Methods ==========

function progressFormat(percentage: number): string {
  if (useBTMode.value && currentPair.value) {
    return `${Math.round(percentage)}%`
  }
  return `${Math.round(percentage)}%`
}

function handleModeChange(): void {
  // Clear selection and reload history when mode changes
  selectedCallId.value = null
  clearAlerts()
  loadHistory()
}

function handleBTModeChange(val: string | number | boolean): void {
  const enabled = Boolean(val)
  clearAlerts()
  if (enabled) {
    showAlertInfo(
      '此模式會讓 AI 逐對比較項目，再用統計模型計算最終排名。比起直接排名更精確，但需要較長處理時間。',
      'Bradley-Terry 配對比較模式'
    )
  }
}

function handleProviderChange(selected: string[]): void {
  clearAlerts()
  if (selected.length >= 2) {
    showAlertInfo(
      `已選擇 ${selected.length} 個 AI，將使用 Free-MAD 風格進行 2 輪辯論。各 AI 會先獨立排名，再相互審視並決定是否調整。`,
      'Multi-Agent 辯論模式已啟用'
    )
    // 自動關閉 BT 模式（Multi-Agent 不與 BT 並用）
    useBTMode.value = false
  }
}

async function loadProviders(): Promise<void> {
  providersLoading.value = true
  try {
    const httpResponse = await rpcClient.api.rankings['ai-providers'].$post({
      json: { projectId: props.projectId }
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data?.providers) {
      availableProviders.value = response.data.providers
      if (availableProviders.value.length > 0 && selectedProviderIds.value.length === 0) {
        // 預設選第一個
        selectedProviderIds.value = [availableProviders.value[0].id]
      }
    }
  } catch (error) {
    console.error('Failed to load AI providers:', error)
    ElMessage.error('載入 AI 服務列表失敗')
  } finally {
    providersLoading.value = false
  }
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const httpResponse = await rpcClient.api.rankings['ai-history'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: activeMode.value,
        limit: 20
      }
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data?.records) {
      history.value = response.data.records
      // Auto-select latest successful query
      const latestSuccess = history.value.find(q => q.status === 'success')
      if (latestSuccess) {
        selectedCallId.value = latestSuccess.callId
      }
    }
  } catch (error) {
    console.error('Failed to load AI history:', error)
  } finally {
    historyLoading.value = false
  }
}

async function queryAI(): Promise<void> {
  if (selectedProviderIds.value.length === 0 || currentItems.value.length === 0) return

  isProcessing.value = true
  progressPercent.value = 0
  currentPair.value = null
  currentRound.value = null
  multiAgentProviderResults.value = []
  clearAlerts()

  // Set initial progress message based on mode
  if (isMultiAgentMode.value) {
    progressMessage.value = '正在啟動 Multi-Agent 辯論...'
  } else if (useBTMode.value) {
    progressMessage.value = '正在準備配對比較...'
  } else {
    progressMessage.value = '正在呼叫 AI...'
  }

  try {
    const requestItems: AIRankingItem[] = currentItems.value.map(item => ({
      id: item.id,
      content: item.content,
      metadata: item.metadata
    }))

    let endpoint: string
    let payload: any

    // Build maxCommentSelections for comment mode
    const commentSelectionsParam = activeMode.value === 'comment' && props.maxCommentSelections
      ? props.maxCommentSelections
      : undefined

    if (isMultiAgentMode.value) {
      // Multi-Agent mode: 2+ providers selected
      endpoint = 'ai-multi-agent-suggestion'
      payload = {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: activeMode.value,
        providerIds: selectedProviderIds.value,
        items: requestItems,
        customPrompt: customPrompt.value.trim() || undefined,
        maxCommentSelections: commentSelectionsParam
      }
    } else if (useBTMode.value) {
      // BT mode: single provider with pairwise comparison
      endpoint = 'ai-bt-suggestion'
      payload = {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: activeMode.value,
        providerId: selectedProviderIds.value[0],
        items: requestItems,
        customPrompt: customPrompt.value.trim() || undefined,
        pairsPerItem: pairsPerItem.value,
        maxCommentSelections: commentSelectionsParam
      }
    } else {
      // Direct mode: single provider direct ranking
      endpoint = 'ai-suggestion'
      payload = {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: activeMode.value,
        providerId: selectedProviderIds.value[0],
        items: requestItems,
        customPrompt: customPrompt.value.trim() || undefined,
        maxCommentSelections: commentSelectionsParam
      }
    }

    const httpResponse = await rpcClient.api.rankings[endpoint].$post({ json: payload })
    const response = await httpResponse.json() as any

    if (response.success && response.data) {
      currentTaskId.value = response.data.taskId
      currentCallId.value = response.data.callId
      progressMessage.value = response.data.message || '任務已加入佇列...'

      ElMessage.info('AI 排名請求已送出，請等待處理...')
    } else {
      const errorMsg = response.error || 'AI 查詢失敗'
      ElMessage.error(errorMsg)
      showAlertError(errorMsg, 'AI 查詢錯誤')
      isProcessing.value = false
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error)
    ElMessage.error(errorMsg)
    showAlertError(errorMsg, 'AI 查詢錯誤')
    isProcessing.value = false
  }
}

function handleAIRankingProgress(data: AIRankingProgressData): void {
  if (data.callId !== currentCallId.value) return

  progressMessage.value = data.message
  progressPercent.value = data.progress || 0

  if (data.status === 'completed') {
    isProcessing.value = false
    ElMessage.success('AI 排名完成')
    loadHistory()
  } else if (data.status === 'failed') {
    isProcessing.value = false
    ElMessage.error(data.message)
    showAlertError(data.message, 'AI 排名失敗')
  }
}

function handleBTRankingProgress(data: BTRankingProgressData): void {
  if (data.callId !== currentCallId.value) return

  progressMessage.value = data.message
  progressPercent.value = data.progress || 0
  currentPair.value = data.currentPair || null

  if (data.status === 'completed') {
    isProcessing.value = false
    currentPair.value = null
    ElMessage.success('BT 排名完成')
    loadHistory()
  } else if (data.status === 'failed') {
    isProcessing.value = false
    currentPair.value = null
    ElMessage.error(data.message)
    showAlertError(data.message, 'BT 排名失敗')
  }
}

function handleMultiAgentProgress(data: MultiAgentProgressData): void {
  if (data.callId !== currentCallId.value) return

  progressMessage.value = data.message
  progressPercent.value = data.progress || 0

  // Update round indicator
  if (data.currentRound) {
    currentRound.value = data.currentRound
  }

  // Update provider results
  if (data.providerResults) {
    multiAgentProviderResults.value = data.providerResults
  }

  if (data.status === 'completed') {
    isProcessing.value = false
    currentRound.value = null
    ElMessage.success('Multi-Agent 辯論完成')
    loadHistory()
  } else if (data.status === 'failed') {
    isProcessing.value = false
    currentRound.value = null
    multiAgentProviderResults.value = []
    ElMessage.error(data.message)
    showAlertError(data.message, 'Multi-Agent 辯論失敗')
  }
}

function selectQuery(callId: string): void {
  selectedCallId.value = callId
}

function getItemLabel(id: string): string {
  const item = currentItems.value.find(i => i.id === id)
  return item?.label || id.slice(-6)
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'success': return 'success'
    case 'processing': return 'warning'
    case 'failed': return 'danger'
    case 'timeout': return 'danger'
    default: return 'info'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '等待中'
    case 'processing': return '處理中'
    case 'success': return '成功'
    case 'failed': return '失敗'
    case 'timeout': return '逾時'
    default: return status
  }
}

function getServiceTypeLabel(serviceType: string): string {
  switch (serviceType) {
    case 'ranking_direct': return '直接排名'
    case 'ranking_bt': return 'BT 模式'
    case 'ranking_multi_agent': return 'Multi-Agent'
    default: return serviceType
  }
}

function getServiceTypeTagType(serviceType: string): 'success' | 'warning' | 'primary' | 'info' {
  switch (serviceType) {
    case 'ranking_direct': return 'info'
    case 'ranking_bt': return 'warning'
    case 'ranking_multi_agent': return 'success'
    default: return 'info'
  }
}

function getProviderStatusType(status: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  switch (status) {
    case 'completed': return 'success'
    case 'processing': return 'primary'
    case 'failed': return 'danger'
    case 'pending': return 'info'
    default: return 'info'
  }
}

function getProviderStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '等待中'
    case 'processing': return '處理中'
    case 'completed': return '完成'
    case 'failed': return '失敗'
    default: return status
  }
}

function normalizeStrength(strength: number): number {
  // Map log-scale strength to 0-100 for display
  // Assuming strengths range from -3 to +3
  const normalized = ((strength + 3) / 6) * 100
  return Math.max(0, Math.min(100, normalized))
}

function applyRanking(): void {
  if (!selectedQuery.value?.result) return

  emit('apply-ranking', selectedQuery.value.result, activeMode.value)
  ElMessage.success(`已套用 AI ${rankingTypeLabel.value}排名建議`)
  close()
}

function close(): void {
  localVisible.value = false
}

function handleClose(done?: () => void): void {
  clearAlerts()
  selectedCallId.value = null
  isProcessing.value = false
  currentTaskId.value = null
  currentCallId.value = null
  progressPercent.value = 0
  progressMessage.value = ''
  currentPair.value = null
  // Reset Multi-Agent state
  currentRound.value = null
  multiAgentProviderResults.value = []
  if (done) done()
}

// ========== WebSocket Event Handlers ==========

function setupWebSocketListeners(): void {
  websocket.on('ai_ranking_progress', handleAIRankingProgress)
  websocket.on('bt_ranking_progress', handleBTRankingProgress)
  websocket.on('multi_agent_progress', handleMultiAgentProgress)
}

function removeWebSocketListeners(): void {
  websocket.off('ai_ranking_progress', handleAIRankingProgress)
  websocket.off('bt_ranking_progress', handleBTRankingProgress)
  websocket.off('multi_agent_progress', handleMultiAgentProgress)
}

// ========== Lifecycle ==========

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    clearAlerts()
    selectedCallId.value = null
    customPrompt.value = ''
    isProcessing.value = false
    progressPercent.value = 0
    progressMessage.value = ''
    currentPair.value = null

    // Initialize mode from prop
    activeMode.value = props.initialMode || 'submission'

    setupWebSocketListeners()
    loadProviders()
    loadHistory()
  } else {
    removeWebSocketListeners()
  }
})

onUnmounted(() => {
  removeWebSocketListeners()
})
</script>

<style lang="scss" scoped>
.mode-switch-section {
  display: flex;
  justify-content: center;
  padding-bottom: 8px;

  :deep(.el-segmented) {
    --el-segmented-bg-color: var(--el-fill-color-light);
    --el-segmented-item-selected-color: #fff;
    --el-segmented-item-selected-bg-color: var(--el-color-primary);

    .el-segmented__item {
      padding: 8px 24px;
      font-size: 15px;
      font-weight: 500;

      &.is-selected {
        color: #fff !important;
      }

      &.is-disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .el-segmented__item-selected {
      background: var(--el-color-primary) !important;
    }
  }
}

.query-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  .provider-select {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
  }
}

.bt-settings {
  margin-top: 16px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;

  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
  }
}

.form-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);

  i {
    margin-right: 4px;
  }
}

.progress-message {
  margin-top: 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.current-pair {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.multi-agent-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
  border-radius: 8px;

  .el-tag {
    i {
      margin-right: 6px;
    }
  }

  .provider-count {
    font-size: 14px;
    color: var(--el-color-success-dark-2);
    font-weight: 500;
  }
}

.multi-agent-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);

  .round-indicator {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .round-label {
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }
  }

  .provider-status-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .provider-status-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--el-bg-color);
    border-radius: 6px;
    border: 1px solid var(--el-border-color-lighter);

    .provider-name {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }

    .el-tag {
      flex-shrink: 0;
    }
  }
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--el-bg-color);

  &:hover {
    border-color: var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
  }

  .query-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;

    .time {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .requester {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-left: auto;
    }
  }

  .query-reason {
    font-size: 14px;
    color: var(--el-text-color-regular);
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .query-status {
    margin-top: 8px;
  }
}

.custom-prompt-display {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  font-size: 13px;

  strong {
    color: var(--el-color-primary);
    margin-right: 8px;

    i {
      margin-right: 4px;
    }
  }
}

.ranking-reason {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;

  strong {
    color: var(--el-text-color-primary);
  }
}

.thinking-collapse,
.bt-collapse,
.bt-strength-collapse {
  margin-bottom: 16px;

  .thinking-title,
  .bt-title,
  .bt-strength-title {
    font-weight: 500;

    i {
      margin-right: 6px;
    }
  }

  .thinking-title {
    color: var(--el-color-success);
  }

  .bt-title {
    color: var(--el-color-warning);
  }

  .bt-strength-title {
    color: var(--el-color-info);
  }

  .thinking-content {
    margin: 0;
    padding: 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    max-height: 400px;
    overflow-y: auto;

    :deep(.md-preview-wrapper) {
      .md-editor-preview-wrapper {
        padding: 0;
      }

      p {
        margin: 6px 0;
      }

      ul, ol {
        margin: 6px 0;
        padding-left: 18px;
      }

      li {
        margin: 3px 0;
      }

      code {
        background: var(--el-fill-color-light);
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 12px;
      }

      pre {
        background: var(--el-fill-color-light);
        padding: 8px;
        border-radius: 4px;
        overflow-x: auto;
        margin: 8px 0;

        code {
          background: none;
          padding: 0;
        }
      }

      blockquote {
        border-left: 3px solid var(--el-border-color);
        margin: 8px 0;
        padding: 4px 12px;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color);
      }

      h1, h2, h3, h4, h5, h6 {
        margin: 12px 0 6px 0;
        font-weight: 600;
      }

      h1 { font-size: 16px; }
      h2 { font-size: 15px; }
      h3 { font-size: 14px; }
    }
  }
}

.bt-comparisons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.bt-comparison-item {
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;

  .comparison-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    .comparison-index {
      font-weight: 600;
      color: var(--el-color-primary);
    }

    .comparison-items {
      font-size: 13px;
    }
  }

  .comparison-result {
    display: flex;
    align-items: center;
    gap: 8px;

    .comparison-reason {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
}

.bt-strength-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bt-strength-item {
  display: flex;
  align-items: center;
  gap: 12px;

  .item-label {
    min-width: 100px;
    font-size: 13px;
  }

  .el-progress {
    flex: 1;
  }

  .strength-value {
    min-width: 60px;
    text-align: right;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.ranking-preview-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);

  .rank-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--el-color-primary);
    color: white;
    border-radius: 50%;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }

  &:nth-child(1) .rank-badge {
    background: #ffd700;
    color: #333;
  }

  &:nth-child(2) .rank-badge {
    background: #c0c0c0;
    color: #333;
  }

  &:nth-child(3) .rank-badge {
    background: #cd7f32;
    color: white;
  }

  .item-label {
    font-size: 14px;
    color: var(--el-text-color-primary);
  }
}
</style>
