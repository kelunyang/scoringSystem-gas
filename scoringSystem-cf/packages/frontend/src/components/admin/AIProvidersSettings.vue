<template>
  <div class="ai-providers-settings" :class="{ 'embedded-mode': embedded }">
    <!-- AI Providers Section -->
    <div :class="embedded ? 'embedded-section' : 'settings-card'">
      <div v-if="!embedded" class="card-header">
        <h3><i class="fas fa-robot"></i> AI 服務設定</h3>
        <el-button type="primary" size="small" @click="showAddDialog">
          <i class="fas fa-plus"></i> 新增 AI 服務
        </el-button>
      </div>
      <div v-else class="embedded-header">
        <h4><i class="fas fa-server"></i> AI 模型管理</h4>
        <el-button type="primary" size="small" @click="showAddDialog">
          <i class="fas fa-plus"></i> 新增 AI 服務
        </el-button>
      </div>

      <div :class="embedded ? '' : 'card-content'" v-loading="loading">
        <el-table v-if="providers.length > 0" :data="providers" stripe border style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="150" />
          <el-table-column prop="model" label="模型" min-width="180" />
          <el-table-column prop="baseUrl" label="Base URL" min-width="280" show-overflow-tooltip />
          <el-table-column prop="enabled" label="狀態" width="100" align="center">
            <template #default="{ row }">
              <el-switch
                v-model="row.enabled"
                @change="toggleEnabled(row)"
                :loading="row.updating"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="editProvider(row)" circle title="編輯">
                <i class="fas fa-edit"></i>
              </el-button>
              <el-button size="small" type="danger" @click="confirmDelete(row)" circle title="刪除">
                <i class="fas fa-trash"></i>
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <EmptyState
          v-else-if="!loading"
          :icons="['fa-robot']"
          title="尚無 AI 服務"
          description="點擊上方按鈕新增 AI 服務"
          :compact="true"
          :enable-animation="false"
        />
      </div>
    </div>

    <!-- AI Prompt Configuration Section -->
    <div :class="embedded ? 'embedded-section' : 'settings-card'">
      <div v-if="!embedded" class="card-header">
        <h3><i class="fas fa-edit"></i> AI 評分標準設定</h3>
        <el-button type="info" size="small" @click="resetPromptsToDefault">
          <i class="fas fa-undo"></i> 恢復預設
        </el-button>
      </div>
      <div v-else class="embedded-header">
        <h4><i class="fas fa-edit"></i> AI 評分標準設定</h4>
        <el-button type="info" size="small" @click="resetPromptsToDefault">
          <i class="fas fa-undo"></i> 恢復預設
        </el-button>
      </div>

      <div :class="embedded ? '' : 'card-content'" v-loading="promptsLoading">
        <el-form label-position="top">
          <el-form-item label="成果排名評分標準">
            <el-input
              v-model="promptConfig.submissionPrompt"
              type="textarea"
              :rows="6"
              :placeholder="defaults.submissionPrompt"
            />
            <div class="form-hint">
              <i class="fas fa-info-circle"></i>
              留空將使用預設值。此內容會作為 AI 的 System Prompt。
            </div>
          </el-form-item>

          <el-form-item label="評論排名評分標準">
            <el-input
              v-model="promptConfig.commentPrompt"
              type="textarea"
              :rows="6"
              :placeholder="defaults.commentPrompt"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="savePromptConfig" :loading="savingPrompts">
              <i class="fas fa-save"></i> 儲存設定
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- Add/Edit Provider Drawer -->
    <el-drawer
      v-model="dialogVisible"
      :title="isEditing ? '編輯 AI 服務' : '新增 AI 服務'"
      direction="btt"
      size="100%"
      class="drawer-navy"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="drawer-header">
          <i class="fas fa-robot"></i>
          <span>{{ isEditing ? '編輯 AI 服務' : '新增 AI 服務' }}</span>
        </div>
      </template>
      <div class="drawer-content">
        <el-form :model="form" :rules="formRules" ref="formRef" label-position="top">
          <el-form-item label="名稱" prop="name">
            <el-input v-model="form.name" placeholder="例如：DeepSeek V3" />
          </el-form-item>
          <el-form-item label="Base URL" prop="baseUrl">
            <el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com" />
            <div class="form-hint">
              <i class="fas fa-info-circle"></i>
              <strong>一般 API:</strong> https://api.openai.com/v1 或 https://api.deepseek.com<br />
              <i class="fas fa-cloud"></i>
              <strong>Azure OpenAI:</strong> 貼上 Azure 給的完整 URL（包含 api-version），模型名稱填 Azure 部署名稱<br />
              <span style="margin-left: 20px; font-size: 0.9em; color: #909399;">例如：https://xxx.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview</span>
            </div>
          </el-form-item>
          <el-form-item label="模型名稱" prop="model">
            <el-input v-model="form.model" placeholder="deepseek-chat" />
          </el-form-item>
          <el-form-item label="API Key" prop="apiKey">
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              :placeholder="isEditing ? '留空則不更改' : '輸入 API Key'"
            />
          </el-form-item>
          <el-form-item label="啟用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </el-form>
        <div class="drawer-actions">
          <el-button
            v-if="isEditing"
            type="success"
            @click="testCurrentProvider"
            :loading="testingConnection"
          >
            <i class="fas fa-plug"></i> 測試連線
          </el-button>
          <div class="drawer-actions-spacer"></div>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveProvider" :loading="saving">
            {{ isEditing ? '更新' : '新增' }}
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import EmptyState from '@/components/shared/EmptyState.vue'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'
import type { AIProviderPublic } from '@repo/shared'

// ========== Props ==========

export interface Props {
  /**
   * When true, renders in embedded mode (inside ConfigPanel slot)
   * with simplified styling
   */
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false
})

// ========== State ==========

const loading = ref(false)
const saving = ref(false)
const promptsLoading = ref(false)
const savingPrompts = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingProviderId = ref<string | null>(null)
const testingConnection = ref(false)
const formRef = ref<FormInstance>()

interface ProviderRow extends AIProviderPublic {
  updating?: boolean
  testing?: boolean
}

const providers = ref<ProviderRow[]>([])

const form = reactive({
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  enabled: true
})

const promptConfig = reactive({
  submissionPrompt: '',
  commentPrompt: ''
})

const defaults = reactive({
  submissionPrompt: '',
  commentPrompt: ''
})

const formRules: FormRules = {
  name: [
    { required: true, message: '請輸入名稱', trigger: 'blur' }
  ],
  baseUrl: [
    { required: true, message: '請輸入 Base URL', trigger: 'blur' },
    { type: 'url', message: '請輸入有效的 URL', trigger: 'blur' }
  ],
  model: [
    { required: true, message: '請輸入模型名稱', trigger: 'blur' }
  ],
  apiKey: [
    {
      validator: (rule, value, callback) => {
        if (!isEditing.value && !value) {
          callback(new Error('請輸入 API Key'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// ========== Methods ==========

/**
 * Load AI providers list
 */
async function loadProviders(): Promise<void> {
  loading.value = true
  try {
    const httpResponse = await rpcClient.api.system['ai-providers'].list.$post({
      json: {}
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data?.providers) {
      providers.value = response.data.providers.map((p: AIProviderPublic) => ({
        ...p,
        updating: false
      }))
    }
  } catch (error) {
    console.error('Failed to load AI providers:', error)
    ElMessage.error('載入 AI 服務列表失敗')
  } finally {
    loading.value = false
  }
}

/**
 * Load AI prompt configuration
 */
async function loadPromptConfig(): Promise<void> {
  promptsLoading.value = true
  try {
    const httpResponse = await rpcClient.api.system['ai-prompts'].get.$post({
      json: {}
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data) {
      promptConfig.submissionPrompt = response.data.submissionPrompt || ''
      promptConfig.commentPrompt = response.data.commentPrompt || ''
      defaults.submissionPrompt = response.data.defaults?.submissionPrompt || ''
      defaults.commentPrompt = response.data.defaults?.commentPrompt || ''
    }
  } catch (error) {
    console.error('Failed to load AI prompt config:', error)
    ElMessage.error('載入 AI 評分標準失敗')
  } finally {
    promptsLoading.value = false
  }
}

/**
 * Show add provider dialog
 */
function showAddDialog(): void {
  isEditing.value = false
  editingProviderId.value = null
  form.name = ''
  form.baseUrl = ''
  form.model = ''
  form.apiKey = ''
  form.enabled = true
  dialogVisible.value = true
}

/**
 * Show edit provider dialog
 */
function editProvider(provider: ProviderRow): void {
  isEditing.value = true
  editingProviderId.value = provider.id
  form.name = provider.name
  form.baseUrl = provider.baseUrl
  form.model = provider.model
  form.apiKey = '' // Don't show existing API key
  form.enabled = provider.enabled
  dialogVisible.value = true
}

/**
 * Save provider (create or update)
 */
async function saveProvider(): Promise<void> {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    let response: any

    if (isEditing.value && editingProviderId.value) {
      // Update existing
      const httpResponse = await rpcClient.api.system['ai-providers'].update.$post({
        json: {
          providerId: editingProviderId.value,
          name: form.name,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: form.apiKey || undefined, // Only send if provided
          enabled: form.enabled
        }
      })
      response = await httpResponse.json()
    } else {
      // Create new
      const httpResponse = await rpcClient.api.system['ai-providers'].create.$post({
        json: {
          name: form.name,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: form.apiKey,
          enabled: form.enabled
        }
      })
      response = await httpResponse.json()
    }

    if (response.success) {
      ElMessage.success(isEditing.value ? 'AI 服務已更新' : 'AI 服務已新增')
      dialogVisible.value = false
      await loadProviders()
    } else {
      ElMessage.error(response.error?.message || '操作失敗')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

/**
 * Toggle provider enabled status
 */
async function toggleEnabled(provider: ProviderRow): Promise<void> {
  provider.updating = true
  try {
    const httpResponse = await rpcClient.api.system['ai-providers'].update.$post({
      json: {
        providerId: provider.id,
        enabled: provider.enabled
      }
    })
    const response = await httpResponse.json() as any

    if (response.success) {
      ElMessage.success(`AI 服務已${provider.enabled ? '啟用' : '停用'}`)
    } else {
      // Revert on failure
      provider.enabled = !provider.enabled
      ElMessage.error(response.error?.message || '操作失敗')
    }
  } catch (error) {
    // Revert on error
    provider.enabled = !provider.enabled
    ElMessage.error(getErrorMessage(error))
  } finally {
    provider.updating = false
  }
}

/**
 * Confirm and delete provider
 */
async function confirmDelete(provider: ProviderRow): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `確定要刪除 AI 服務「${provider.name}」嗎？此操作無法復原。`,
      '確認刪除',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await deleteProvider(provider)
  } catch {
    // User cancelled
  }
}

/**
 * Delete provider
 */
async function deleteProvider(provider: ProviderRow): Promise<void> {
  try {
    const httpResponse = await rpcClient.api.system['ai-providers'].delete.$post({
      json: { providerId: provider.id }
    })
    const response = await httpResponse.json() as any

    if (response.success) {
      ElMessage.success('AI 服務已刪除')
      await loadProviders()
    } else {
      ElMessage.error(response.error?.message || '刪除失敗')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

/**
 * Test current provider connection (used in drawer)
 */
async function testCurrentProvider(): Promise<void> {
  if (!editingProviderId.value) {
    ElMessage.warning('請先儲存 AI 服務後再測試連線')
    return
  }

  testingConnection.value = true
  try {
    const httpResponse = await rpcClient.api.system['ai-providers'].test.$post({
      json: { providerId: editingProviderId.value }
    })
    const response = await httpResponse.json() as any

    if (response.success && response.data) {
      ElMessage.success({
        message: `${form.name} 連線成功 (${response.data.responseTimeMs}ms)`,
        duration: 5000
      })
    } else {
      ElMessage.error({
        message: `${form.name} 連線失敗: ${response.error?.message || '未知錯誤'}`,
        duration: 8000
      })
    }
  } catch (error) {
    ElMessage.error({
      message: `測試失敗: ${getErrorMessage(error)}`,
      duration: 8000
    })
  } finally {
    testingConnection.value = false
  }
}

/**
 * Save AI prompt configuration
 */
async function savePromptConfig(): Promise<void> {
  savingPrompts.value = true
  try {
    const httpResponse = await rpcClient.api.system['ai-prompts'].update.$post({
      json: {
        submissionPrompt: promptConfig.submissionPrompt,
        commentPrompt: promptConfig.commentPrompt
      }
    })
    const response = await httpResponse.json() as any

    if (response.success) {
      ElMessage.success('AI 評分標準已儲存')
    } else {
      ElMessage.error(response.error?.message || '儲存失敗')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    savingPrompts.value = false
  }
}

/**
 * Reset prompts to default
 */
async function resetPromptsToDefault(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '確定要恢復預設評分標準嗎？',
      '確認恢復',
      {
        confirmButtonText: '恢復預設',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    promptConfig.submissionPrompt = ''
    promptConfig.commentPrompt = ''
    await savePromptConfig()
  } catch {
    // User cancelled
  }
}

// ========== Lifecycle ==========

onMounted(() => {
  loadProviders()
  loadPromptConfig()
})
</script>

<style lang="scss" scoped>
.ai-providers-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-card {
  background: white;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  overflow: hidden;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--el-fill-color-lighter);
    border-bottom: 1px solid var(--el-border-color-light);

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--el-text-color-primary);

      i {
        margin-right: 8px;
        color: var(--el-color-primary);
      }
    }
  }

  .card-content {
    padding: 20px;
  }
}

.form-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  i {
    margin-right: 4px;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

:deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}

/* Embedded mode styles (when inside ConfigPanel slot) */
.ai-providers-settings.embedded-mode {
  gap: 20px;
}

.embedded-section {
  padding-top: 15px;
  border-top: 1px dashed var(--el-border-color-light);
  margin-top: 10px;

  &:first-child {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
  }
}

.embedded-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);

    i {
      margin-right: 8px;
      color: var(--el-color-primary);
    }
  }
}

/* Drawer Navy Theme Styles */
.drawer-navy :deep(.el-drawer__header) {
  background: #2c3e50 !important;
  color: white !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
}

.drawer-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: white;

  i {
    font-size: 20px;
  }
}

.drawer-content {
  padding: 30px;
  background: #f5f7fa;
  min-height: calc(100% - 60px);
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-light);
}

.drawer-actions-spacer {
  flex: 1;
}
</style>
