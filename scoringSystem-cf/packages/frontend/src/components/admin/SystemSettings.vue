<template>
  <div class="system-settings">
    <!-- Header -->
    <div class="mgmt-header">
      <!-- Header removed - title now shown in parent SystemAdmin -->
    </div>

    <!-- Settings Sections -->
    <div class="settings-container">

      <!-- System Statistics -->
      <SystemStatsCard
        :system-stats="systemStats"
        :invitation-stats="invitationStats"
        :loading="statsLoading"
        @refresh="loadAllStats"
      />

      <!-- System Configuration Panel -->
      <ConfigPanel
        :categories="systemConfigCategories"
        :values="propertiesConfig"
        :original-values="originalPropertiesConfig"
        :loading="loadingProperties"
        :saving="savingProperties"
        :resetting="resettingProperties"
        :has-changes="hasChanges"
        :modified-fields="modifiedFields"
        :show-reset="true"
        title="系統參數配置"
        @save="savePropertiesConfig"
        @reset="confirmResetProperties"
        @update="handleConfigUpdate"
      >
        <!-- Email Test Buttons via Slot -->
        <template #actions-smtp>
          <div class="config-actions">
            <div class="email-test-buttons">
              <el-tooltip content="Cloudflare Email Service 目前處於 Beta，暫時停用" placement="top">
                <el-button
                  type="info"
                  disabled
                  icon="Message"
                >
                  CF Email (停用)
                </el-button>
              </el-tooltip>
              <el-button
                type="success"
                @click="testSmtpConnection"
                :loading="testingSmtp"
                icon="Connection"
              >
                測試 SMTP 連接
              </el-button>
            </div>
            <el-alert
              title="郵件服務說明"
              type="info"
              :closable="false"
              style="margin-top: 15px;"
            >
              <template #default>
                <p style="margin: 0; font-size: 12px;">
                  目前使用 SMTP 寄信。Cloudflare Email Service 因 Beta 限制暫時停用。<br>
                  測試郵件將發送到您目前登入的管理員帳號郵箱。
                </p>
              </template>
            </el-alert>
            <el-alert
              v-if="isGmailSmtp"
              title="Gmail SMTP 設定提示"
              type="warning"
              :closable="false"
              style="margin-top: 10px;"
            >
              <template #default>
                <p style="margin: 0; font-size: 12px;">
                  Gmail 需要啟用「兩步驟驗證」並生成「應用程式密碼」。<br>
                  前往: Google 帳戶 → 安全性 → 兩步驟驗證 → 應用程式密碼
                </p>
              </template>
            </el-alert>
          </div>
        </template>

        <!-- AI Providers Management via Slot -->
        <template #actions-ai>
          <AIProvidersSettings :embedded="true" />
        </template>
      </ConfigPanel>

    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, inject, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePermissions } from '@/composables/usePermissions'
import { useFeaturePermission } from '@/composables/usePermissionConfig'
import { useSystemStats } from '@/composables/admin/useSystemStats'
import EmptyState from '@/components/shared/EmptyState.vue'
import SystemStatsCard from '@/components/admin/system-settings/SystemStatsCard.vue'
import ConfigPanel from '@/components/admin/system-settings/ConfigPanel.vue'
import AIProvidersSettings from '@/components/admin/AIProvidersSettings.vue'
import { systemConfigCategories } from '@/config/admin-settings-config'
import { rpcClient } from '@/utils/rpc-client'
import { adminApi } from '@/api/admin'
import {
  useUpdateProperties,
  useResetProperties,
  useTestSmtpConnection,
  useTestCloudflareEmail
} from '@/composables/admin/useSystemProperties'
import type { PropertiesConfig } from '@/types/admin-properties'

// ================== TanStack Query Mutations ==================
const updatePropertiesMutation = useUpdateProperties()
const resetPropertiesMutation = useResetProperties()
const testSmtpMutation = useTestSmtpConnection()
const testCfEmailMutation = useTestCloudflareEmail()

// ============================================================================
// Vue 3 Composition API with TypeScript
// Converted from Options API setup() to <script setup lang="ts">
// ============================================================================
// ============================================================================
// 系統統計數據 (使用 Composable - Vue 3 最佳實踐)
// ============================================================================
const {
  systemStats,
  invitationStats,
  logStats: logStatsFromComposable,
  isLoading: statsLoading,
  refreshAll: refreshAllStats
} = useSystemStats()

// Permission checks
// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

const { hasPermission } = usePermissions()
const saving = ref<boolean>(false)
const cleaning = ref<boolean>(false)

// PropertiesService 配置相關
// 不設初始值，等待從 API 載入
const propertiesConfig = ref<PropertiesConfig>({})

// 儲存原始配置值（用於檢測變更）
// 不設初始值，等待從 API 載入後才設定
const originalPropertiesConfig = ref<PropertiesConfig>({})

const loadingProperties = ref<boolean>(false)
const savingProperties = ref<boolean>(false)
const resettingProperties = ref<boolean>(false)
const testingSmtp = ref<boolean>(false)
const testingCfEmail = ref<boolean>(false)



const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

const getActionClass = (action: string): string => {
  if (action.includes('created') || action.includes('registered')) return 'action-create'
  if (action.includes('updated') || action.includes('modified')) return 'action-update'
  if (action.includes('deleted') || action.includes('removed')) return 'action-delete'
  if (action.includes('login') || action.includes('logout')) return 'action-auth'
  return 'action-other'
}

const getActionText = (action: string): string => {
  const actionMap: Record<string, string> = {
    'user_registered': '用戶註冊',
    'user_login': '用戶登入',
    'user_logout': '用戶登出',
    'project_created': '創建專案',
    'project_updated': '更新專案',
    'project_archived': '封存專案',
    'group_created': '創建群組',
    'group_updated': '更新群組',
    'group_deleted': '刪除群組',
    'user_added_to_group': '新增群組成員',
    'user_removed_from_group': '移除群組成員',
    'invitation_generated': '生成邀請碼',
    'invitation_used': '使用邀請碼',
    'password_reset_by_admin': '管理員重設密碼',
    'tag_created': '建立標籤',
    'tag_updated': '更新標籤',
    'tag_deleted': '刪除標籤'
  }
  return actionMap[action] || action
}


/**
 * 刷新所有統計數據
 * 現在使用 TanStack Query composable 自動管理
 */
const loadAllStats = async (): Promise<void> => {
  try {
    await refreshAllStats()
    ElMessage.success('統計資料更新完成')
  } catch (error) {
    console.error('Error loading all stats:', error)
    ElMessage.error('載入統計資料時發生錯誤')
  }
}





const cleanupInvitations = async (): Promise<void> => {
  if (!confirm('確定要清理過期的邀請碼嗎？')) {
    return
  }

  try {
    cleaning.value = true

    // TODO: Backend endpoint /invitations/cleanup-expired does not exist yet
    // Need to implement this endpoint in the backend first
    ElMessage.warning('清理功能暫時無法使用，後端 API 尚未實作')
    return

    // const httpResponse = await rpcClient.invitations['cleanup-expired'].$post({
    //   json: {}
    // })
    // const result = await httpResponse.json()

    // if (result.success) {
    //   ElMessage.success(`已清理 ${result.data?.cleanedCount || 0} 個過期邀請碼`)
    //   await refreshAllStats()
    // } else {
    //   ElMessage.error('清理失敗: ' + (result.error?.message || '未知錯誤'))
    // }
  } catch (error) {
    console.error('Error cleaning invitations:', error)
    ElMessage.error('清理失敗')
  } finally {
    cleaning.value = false
  }
}


// 根據 functionName 判斷日誌類型
// Removed apiCall method - now using centralized apiClient

const formatNumber = (value: number | string | null | undefined): string => {
  if (!value && value !== 0) return '0'
  return Number(value).toLocaleString('zh-TW')
}

/**
 * 刷新設定頁面所有數據
 */
const refreshSettings = async (): Promise<void> => {
  await refreshAllStats() // 使用 composable 刷新統計數據
}

// 計算有哪些欄位被修改過
const modifiedFields = computed<string[]>(() => {
  const modified: string[] = []
  for (const key in propertiesConfig.value) {
    // 將值轉換為字串進行比較，避免型別不同導致的誤判
    const currentValue = String(propertiesConfig.value[key])
    const originalValue = String(originalPropertiesConfig.value[key])

    if (currentValue !== originalValue) {
      modified.push(key)
    }
  }
  return modified
})

// 檢查是否有任何變更
const hasChanges = computed<boolean>(() => {
  return modifiedFields.value.length > 0
})

// 檢查是否為 Gmail SMTP
const isGmailSmtp = computed<boolean>(() => {
  const host = propertiesConfig.value?.SMTP_HOST
  return typeof host === 'string' && host.toLowerCase().includes('gmail')
})

/**
 * 處理 ConfigPanel 的配置更新事件
 */
const handleConfigUpdate = (key: string, value: any): void => {
  propertiesConfig.value[key] = value
}

// PropertiesService 配置相關方法
const loadPropertiesConfig = async (): Promise<void> => {
  loadingProperties.value = true
  try {
    const response = await adminApi.properties.getAll()
    if (response.success && response.data) {
      console.log('載入的配置資料:', response.data)

      // 後端 getAllConfigValues() 返回 Record<string, any> 物件格式
      // 例如: { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 587, ... }
      // 直接使用，不需要轉換
      propertiesConfig.value = response.data as unknown as PropertiesConfig

      // 深拷貝原始配置
      originalPropertiesConfig.value = JSON.parse(JSON.stringify(response.data)) as PropertiesConfig

      console.log('更新後的 propertiesConfig:', JSON.parse(JSON.stringify(propertiesConfig.value)))
      console.log('更新後的 originalPropertiesConfig:', JSON.parse(JSON.stringify(originalPropertiesConfig.value)))
    }
  } catch (error) {
    console.error('載入配置失敗:', error)
    ElMessage.error('載入配置失敗，請重試')
  } finally {
    loadingProperties.value = false
  }
}

const savePropertiesConfig = async (): Promise<void> => {
  // 檢查是否有變更
  if (!hasChanges.value) {
    ElMessage.warning('沒有任何變更需要儲存')
    return
  }

  // 只送出有變更的欄位
  const changedProperties: Partial<PropertiesConfig> = {}
  for (const field of modifiedFields.value) {
    changedProperties[field] = propertiesConfig.value[field]
  }

  console.log('送出變更的欄位:', changedProperties)
  console.log('修改的欄位列表:', modifiedFields.value)

  savingProperties.value = true
  try {
    await updatePropertiesMutation.mutateAsync({
      properties: changedProperties
    })
    // 儲存成功後，更新原始配置為當前配置
    originalPropertiesConfig.value = JSON.parse(JSON.stringify(propertiesConfig.value))
    // Success message is handled by the mutation's onSuccess
  } catch (error) {
    console.error('儲存配置失敗:', error)
    // Error message is handled by the mutation's onError
  } finally {
    savingProperties.value = false
  }
}

const confirmResetProperties = async (): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      '此操作將重設所有可配置參數為預設值（不影響資料庫 ID），是否繼續？',
      '確認重設',
      {
        confirmButtonText: '確定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await resetProperties()
  } catch (error) {
    // User cancelled
  }
}

const resetProperties = async (): Promise<void> => {
  resettingProperties.value = true
  try {
    await resetPropertiesMutation.mutateAsync()
    // Success message is handled by the mutation's onSuccess
    await loadPropertiesConfig()
  } catch (error) {
    console.error('重設配置失敗:', error)
    // Error message is handled by the mutation's onError
  } finally {
    resettingProperties.value = false
  }
}

// SMTP Configuration Methods
/**
 * 測試 SMTP 連接
 * SMTP 配置現在從 propertiesConfig 中讀取
 */
const testSmtpConnection = async (): Promise<void> => {
  // Validation
  if (!propertiesConfig.value.SMTP_HOST || !propertiesConfig.value.SMTP_USERNAME || !propertiesConfig.value.SMTP_PASSWORD) {
    ElMessage.warning('請填寫完整的 SMTP 配置')
    return
  }

  testingSmtp.value = true
  try {
    await testSmtpMutation.mutateAsync({
      config: {
        host: propertiesConfig.value.SMTP_HOST,
        port: Number(propertiesConfig.value.SMTP_PORT) || 587,
        username: propertiesConfig.value.SMTP_USERNAME,
        password: propertiesConfig.value.SMTP_PASSWORD,
        fromName: propertiesConfig.value.SMTP_FROM_NAME || '評分系統',
        fromEmail: propertiesConfig.value.SMTP_FROM_EMAIL || ''
      }
    })
    // Success message is handled by the mutation's onSuccess
  } catch (error) {
    console.error('測試 SMTP 連接失敗:', error)
    // Error message is handled by the mutation's onError
  } finally {
    testingSmtp.value = false
  }
}

/**
 * 測試 Cloudflare Email Service 連接
 * 會寄送測試郵件到當前管理員的郵箱
 */
const testCloudflareEmail = async (): Promise<void> => {
  // Validation - check if EMAIL_FROM_EMAIL is configured
  if (!propertiesConfig.value.EMAIL_FROM_EMAIL) {
    ElMessage.warning('請先設定寄件者郵箱 (EMAIL_FROM_EMAIL)')
    return
  }

  testingCfEmail.value = true
  try {
    await testCfEmailMutation.mutateAsync()
    // Success message is handled by the mutation's onSuccess
  } catch (error) {
    console.error('測試 Cloudflare Email 失敗:', error)
    // Error message is handled by the mutation's onError
  } finally {
    testingCfEmail.value = false
  }
}

onMounted(() => {
  // 統計數據由 TanStack Query composable 自動載入
  // loadAllStats() - 不再需要手動調用
  loadPropertiesConfig()

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshSettings)
})

onBeforeUnmount(() => {
  // Cleanup: unregister refresh function
  registerRefresh(null)
})

// ============================================================================
// 🎉 <script setup> 自動暴露所有頂層綁定
// 不再需要 return 語句！所有 ref、reactive、computed、functions 自動可用於 template
// ============================================================================
</script>

<style scoped>
.system-settings {
  padding: 20px;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
}

.header-left h2 {
  margin: 0 0 5px 0;
  color: #2c5aa0;
}

.header-left h2 i {
  margin-right: 10px;
}

.header-desc {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.settings-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow: hidden;
}

.settings-section h3 {
  margin: 0;
  padding: 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
  color: #2c5aa0;
  font-size: 18px;
}

.settings-section h3 i {
  margin-right: 10px;
}

/* 統計區塊樣式 */
.section-header-with-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  padding: 20px 20px 0 20px;
}

.section-header-with-actions h3 {
  margin: 0;
  color: #2c5aa0;
  font-size: 18px;
}

.section-header-with-actions h3 i {
  margin-right: 10px;
}

.stats-container {
  padding: 20px;
}

.stat-card {
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.stat-suffix {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  line-height: 1.4;
}

.maintenance-actions {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.maintenance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #f8f9fa;
}

.maintenance-info h4 {
  margin: 0 0 5px 0;
  color: #333;
}

.maintenance-info p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.btn-primary {
  background: #2c5aa0;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-info {
  background: #17a2b8;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-sm {
  padding: 8px 12px;
  font-size: 12px;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-warning:hover,
.btn-info:hover {
  opacity: 0.9;
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-warning:disabled,
.btn-info:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary i,
.btn-secondary i,
.btn-warning i,
.btn-info i {
  margin-right: 5px;
}

/* Tag Management Styles */
.tag-create-form {
  padding: 20px;
  border-bottom: 1px solid #e1e8ed;
  background: #fafbfc;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.color-input {
  width: 60px;
  height: 40px;
  padding: 2px;
}

.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.tags-filter {
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.filter-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.tags-table-container {
  overflow-x: auto;
}

.tags-table {
  width: 100%;
  border-collapse: collapse;
}

.tags-table th,
.tags-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.tags-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.tags-table tr:hover {
  background: #f8f9fa;
}

.tag-display {
  display: flex;
  align-items: center;
}

.tag-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.btn-sm i {
  font-size: 12px;
}

.btn-primary {
  background: #2c5aa0;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-success:hover,
.btn-warning:hover,
.btn-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.no-tags {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-tags i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
}

.modal-content h3 i {
  margin-right: 10px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  
  .log-entry {
    grid-template-columns: 1fr;
    gap: 5px;
  }
  
  .maintenance-item {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .form-grid {
    grid-template-columns: 1fr;
  }
  
  .filter-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .actions {
    flex-direction: column;
    align-items: stretch;
  }
  
  .modal-content {
    margin: 10px;
    width: calc(100% - 20px);
  }
  
  .logs-table {
    font-size: 12px;
  }
  
  .log-actions {
    flex-direction: column;
  }
}

/* 日誌相關樣式 */
.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* PropertiesService Configuration Styles */
.properties-container {
  padding: 20px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.config-group {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-weight: 600;
  color: #333;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-desc {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.config-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 15px;
  border-top: 1px solid #e1e8ed;
}

.email-test-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.readonly-item {
  opacity: 0.8;
}

.readonly-item .config-label {
  color: #666;
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
}

.slider-value {
  font-size: 13px;
  color: #409EFF;
  font-weight: 500;
  align-self: flex-end;
  margin-top: 5px;
}

.collapse-title {
  font-weight: 600;
  color: #2c5aa0;
}

/* Spreadsheet Validation Styles */
.spreadsheet-validation {
  display: flex;
  gap: 10px;
  align-items: center;
}

.spreadsheet-validation .el-input {
  flex: 1;
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

/* AI Providers Drawer Styles */
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
}

.drawer-header i {
  font-size: 20px;
}

.drawer-content {
  padding: 30px;
  background: #f5f7fa;
  min-height: calc(100% - 60px);
}

/* System Title Preview Styles */
.preview-box {
  margin-top: 10px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 13px;
  border-left: 3px solid #409EFF;
}

.preview-label {
  color: #666;
  font-weight: 500;
  margin-right: 8px;
}

.preview-text {
  color: #409EFF;
  font-weight: 500;
}

/* Field Modification Indicator */
.config-item.field-modified {
  position: relative;
  padding-left: 10px;
  border-left: 3px solid #E6A23C;
  background-color: #FDF6EC;
  border-radius: 4px;
  padding: 15px;
}

.config-item .config-label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.save-badge {
  margin-left: 8px;
}

/* Modified fields summary */
.modified-fields-summary {
  padding: 15px 20px;
  background: #FDF6EC;
  border-left: 4px solid #E6A23C;
  margin-bottom: 20px;
  border-radius: 4px;
}

.modified-fields-summary h4 {
  margin: 0 0 10px 0;
  color: #E6A23C;
  font-size: 14px;
  font-weight: 600;
}

.modified-fields-summary ul {
  margin: 0;
  padding-left: 20px;
  color: #666;
  font-size: 13px;
}

.modified-fields-summary li {
  margin-bottom: 8px;
  line-height: 1.8;
}

.modified-fields-summary .old-value {
  color: #999;
  text-decoration: line-through;
  font-family: monospace;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}

.modified-fields-summary .new-value {
  color: #E6A23C;
  font-weight: 600;
  font-family: monospace;
  background: #FFF7E6;
  padding: 2px 6px;
  border-radius: 3px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .robot-grid {
    grid-template-columns: 1fr;
  }

  .header-actions {
    flex-direction: column;
  }

  .section-header-with-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .log-entry {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

/* Security Report Drawer Styles */
.security-report-container {
  padding: 30px;
  background: #f5f7fa;
  min-height: 100%;
}

.config-section,
.report-section {
  background: white;
  border-radius: 12px;
  padding: 25px;
  margin-bottom: 25px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.config-section h3,
.report-section h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.patrol-config {
  padding: 15px 0;
}

.report-header {
  margin-bottom: 25px;
}

.report-meta {
  display: flex;
  gap: 30px;
  margin-top: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  flex-wrap: wrap;
}

.report-meta span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-meta i {
  color: #409EFF;
}

.report-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.report-stats .stat-box {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 25px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.report-stats .stat-number {
  font-size: 42px;
  font-weight: bold;
  margin-bottom: 8px;
}

.report-stats .stat-label {
  font-size: 14px;
  opacity: 0.95;
}

.attack-tabs {
  margin-top: 20px;
}

.attack-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
}

.attack-card {
  border-radius: 10px;
  transition: all 0.3s ease;
}

.attack-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
}

.attack-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.attack-user {
  font-weight: 600;
  font-size: 16px;
  color: #333;
}

.attack-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.attack-details .detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 14px;
  padding: 8px 0;
}

.attack-details .detail-label {
  color: #666;
  font-weight: 500;
  min-width: 120px;
}

.attack-details .detail-value {
  color: #333;
  text-align: right;
  flex: 1;
}

.attack-details .detail-value code {
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 13px;
  color: #e83e8c;
}

.ip-list-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.ip-code {
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  color: #e83e8c;
  display: block;
}

.more-ips {
  font-size: 12px;
  color: #999;
  font-style: italic;
}

.empty-desc {
  color: #999;
  font-size: 14px;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .security-report-container {
    padding: 15px;
  }

  .report-meta {
    flex-direction: column;
    gap: 10px;
  }

  .report-stats {
    grid-template-columns: 1fr;
  }

  .attack-details .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .attack-details .detail-value {
    text-align: left;
  }

  .ip-list-container {
    align-items: flex-start;
  }
}
</style>