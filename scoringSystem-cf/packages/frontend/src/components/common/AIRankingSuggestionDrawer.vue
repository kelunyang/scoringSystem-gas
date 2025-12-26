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

    <div class="drawer-body" v-loading="loading" element-loading-text="查詢 AI 建議中...">
      <!-- Drawer Alert Zone -->
      <DrawerAlertZone />

      <!-- AI 模型選擇區塊 -->
      <div class="form-section">
        <h4><i class="fas fa-cog"></i> AI 模型選擇</h4>
        <div class="query-controls">
          <el-select
            v-model="selectedProviderId"
            placeholder="選擇 AI 模型"
            :disabled="loading || providersLoading"
            class="provider-select"
          >
            <el-option
              v-for="provider in availableProviders"
              :key="provider.id"
              :label="`${provider.name} (${provider.model})`"
              :value="provider.id"
            />
          </el-select>
          <el-button
            type="primary"
            @click="queryAI"
            :loading="loading"
            :disabled="!selectedProviderId || items.length === 0"
          >
            <i class="fas fa-search"></i> 查詢 AI 建議
          </el-button>
        </div>
        <div class="form-group" style="margin-top: 12px;">
          <label>自定義提示（選填，最多 30 字）</label>
          <el-input
            v-model="customPrompt"
            placeholder="例如：請特別注重創意性"
            maxlength="30"
            show-word-limit
            :disabled="loading"
          />
          <div class="form-hint">
            <i class="fas fa-info-circle"></i> 此提示會附加到 AI 評分標準後
          </div>
        </div>
        <div class="form-hint" v-if="items.length === 0">
          <i class="fas fa-info-circle"></i> 目前沒有可排名的項目
        </div>
        <div class="form-hint" v-else>
          <i class="fas fa-info-circle"></i> 將對 {{ items.length }} 個{{ rankingTypeLabel }}進行 AI 排名分析
        </div>
      </div>

      <!-- 查詢歷史區塊 -->
      <div class="form-section">
        <h4><i class="fas fa-history"></i> 查詢歷史（最近 10 筆）</h4>

        <div class="history-list" v-if="history.length > 0">
          <div
            v-for="query in history"
            :key="query.queryId"
            class="history-item"
            :class="{ active: selectedQueryId === query.queryId }"
            @click="selectQuery(query.queryId)"
          >
            <div class="query-meta">
              <el-tag size="small" type="info">{{ query.providerName }}</el-tag>
              <span class="time">{{ formatTime(query.createdAt) }}</span>
              <el-tag size="small" type="warning">{{ query.itemCount }} 項</el-tag>
              <el-tag v-if="query.thinkingProcess" size="small" type="success">思考過程</el-tag>
              <el-tag v-if="query.customPrompt" size="small" type="primary">自定義提示</el-tag>
            </div>
            <div class="query-reason">{{ query.reason }}</div>
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
      <div class="form-section" v-if="selectedQuery">
        <h4><i class="fas fa-list-ol"></i> AI 排名建議預覽</h4>

        <!-- 自定義提示顯示 -->
        <div class="custom-prompt-display" v-if="selectedQuery.customPrompt">
          <strong><i class="fas fa-comment-dots"></i> 使用的自定義提示：</strong>
          <span>{{ selectedQuery.customPrompt }}</span>
        </div>

        <div class="ranking-reason">
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
            <pre class="thinking-content">{{ selectedQuery.thinkingProcess }}</pre>
          </el-collapse-item>
        </el-collapse>

        <ol class="ranking-preview-list">
          <li v-for="(id, index) in selectedQuery.ranking" :key="id" class="ranking-item">
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
          @click="applyRanking"
          :disabled="!selectedQuery"
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
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/shared/EmptyState.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useAIRankingHistory } from '@/composables/useAIRankingHistory'
import type { AIQueryHistoryItem, AIRankingItem, AIProviderPublic } from '@repo/shared'

// ========== Props & Emits ==========

interface AIItem {
  id: string
  content: string
  label: string
  metadata: {
    groupName?: string
    authorName?: string
    memberNames?: string[]
  }
}

const props = defineProps<{
  visible: boolean
  projectId: string
  stageId: string
  rankingType: 'submission' | 'comment'
  items: AIItem[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'apply-ranking', ranking: string[]): void
}>()

// ========== Composables ==========

const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
const { addAlert, clearAlerts, error: showAlertError } = useDrawerAlerts()

// Convert props to refs for the composable
const stageIdRef = computed(() => props.stageId)
const rankingTypeRef = computed(() => props.rankingType)

const {
  history,
  addQueryResult,
  getQueryById
} = useAIRankingHistory(stageIdRef, rankingTypeRef)

// ========== State ==========

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const loading = ref(false)
const providersLoading = ref(false)
const selectedProviderId = ref<string>('')
const selectedQueryId = ref<string | null>(null)
const customPrompt = ref<string>('')
const availableProviders = ref<Array<{ id: string; name: string; model: string }>>([])

// ========== Computed ==========

const rankingTypeLabel = computed(() => {
  return props.rankingType === 'submission' ? '成果' : '評論'
})

const selectedQuery = computed((): AIQueryHistoryItem | null => {
  if (!selectedQueryId.value) return null
  return getQueryById(selectedQueryId.value) || null
})

// ========== Methods ==========

/**
 * Load available AI providers
 */
async function loadProviders(): Promise<void> {
  providersLoading.value = true
  try {
    const httpResponse = await rpcClient.api.rankings['ai-providers'].$post({
      json: { projectId: props.projectId }
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data?.providers) {
      availableProviders.value = response.data.providers
      // Auto-select first provider if available
      if (availableProviders.value.length > 0 && !selectedProviderId.value) {
        selectedProviderId.value = availableProviders.value[0].id
      }
    }
  } catch (error) {
    console.error('Failed to load AI providers:', error)
    ElMessage.error('載入 AI 服務列表失敗')
  } finally {
    providersLoading.value = false
  }
}

/**
 * Query AI for ranking suggestion
 */
async function queryAI(): Promise<void> {
  if (!selectedProviderId.value || props.items.length === 0) return

  loading.value = true
  clearAlerts()

  try {
    // Build request items
    const requestItems: AIRankingItem[] = props.items.map(item => ({
      id: item.id,
      content: item.content,
      metadata: item.metadata
    }))

    const httpResponse = await rpcClient.api.rankings['ai-suggestion'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: props.rankingType,
        providerId: selectedProviderId.value,
        items: requestItems,
        customPrompt: customPrompt.value.trim() || undefined
      }
    })

    const response = await httpResponse.json() as any

    if (response.success && response.data) {
      // Add to history (include thinkingProcess and customPrompt if present)
      const queryResult: AIQueryHistoryItem = {
        queryId: response.data.queryId,
        providerId: response.data.providerId,
        providerName: response.data.providerName,
        model: response.data.model,
        reason: response.data.reason,
        ranking: response.data.ranking,
        createdAt: response.data.createdAt,
        itemCount: props.items.length,
        thinkingProcess: response.data.thinkingProcess,
        customPrompt: response.data.customPrompt
      }

      addQueryResult(queryResult)

      // Auto-select the new query
      selectedQueryId.value = queryResult.queryId

      ElMessage.success('AI 排名建議查詢成功')
    } else {
      const errorMsg = response.error?.message || 'AI 查詢失敗'
      ElMessage.error(errorMsg)
      showAlertError(errorMsg, 'AI 查詢錯誤')
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error)
    ElMessage.error(errorMsg)
    showAlertError(errorMsg, 'AI 查詢錯誤')
  } finally {
    loading.value = false
  }
}

/**
 * Select a query from history
 */
function selectQuery(queryId: string): void {
  selectedQueryId.value = queryId
}

/**
 * Get display label for an item by ID
 */
function getItemLabel(id: string): string {
  const item = props.items.find(i => i.id === id)
  return item?.label || id
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Apply selected ranking to parent component
 */
function applyRanking(): void {
  if (!selectedQuery.value) return

  emit('apply-ranking', selectedQuery.value.ranking)
  ElMessage.success('已套用 AI 排名建議')
  close()
}

/**
 * Close the drawer
 */
function close(): void {
  localVisible.value = false
}

/**
 * Handle drawer close
 */
function handleClose(done?: () => void): void {
  clearAlerts()
  selectedQueryId.value = null
  if (done) done()
}

// ========== Lifecycle ==========

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    clearAlerts()
    selectedQueryId.value = null
    customPrompt.value = ''
    loadProviders()

    // Wait for history to load, then auto-select latest query
    await nextTick()
    if (history.value.length > 0) {
      selectedQueryId.value = history.value[0].queryId
    }
  }
})
</script>

<style lang="scss" scoped>
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

.form-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);

  i {
    margin-right: 4px;
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

.thinking-collapse {
  margin-bottom: 16px;

  .thinking-title {
    font-weight: 500;
    color: var(--el-color-success);

    i {
      margin-right: 6px;
    }
  }

  .thinking-content {
    margin: 0;
    padding: 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
    font-family: inherit;
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
