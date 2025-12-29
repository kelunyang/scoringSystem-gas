<template>
  <!-- Reverse Settlement Drawer -->
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="reverse-settlement-drawer drawer-maroon"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-undo"></i>
          撤銷結算確認
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body" v-loading="loadingReversePreview" element-loading-text="載入結算詳情中...">
      <DrawerAlertZone />

      <div v-if="reversePreviewData && stage">
        <!-- Stage Info -->
        <div class="stage-info-header">
          <h3>{{ stage.stageName }}</h3>
          <el-tag type="warning" size="large">準備撤銷</el-tag>
        </div>

        <!-- Settlement Details -->
        <div class="settlement-details-section">
          <h4><i class="fas fa-info-circle"></i> 結算詳情</h4>
          <el-descriptions :column="1" border size="large">
            <el-descriptions-item label="總獎金">
              <span class="reward-amount">{{ reversePreviewData.totalReward }} 點</span>
            </el-descriptions-item>
            <el-descriptions-item label="交易筆數">
              <span class="transaction-count">{{ reversePreviewData.transactionCount }} 筆</span>
            </el-descriptions-item>
            <el-descriptions-item label="涉及參與者">
              <span class="participant-count">{{ reversePreviewData.uniqueUserCount }} 人</span>
            </el-descriptions-item>
            <el-descriptions-item label="結算時間">
              {{ formatTime(reversePreviewData.settlementTime) }}
            </el-descriptions-item>
            <el-descriptions-item label="結算類型">
              <el-tag v-if="reversePreviewData.settlementType === 'stage'" type="primary">階段結算</el-tag>
              <el-tag v-else-if="reversePreviewData.settlementType === 'comment'" type="success">評論結算</el-tag>
              <el-tag v-else>{{ reversePreviewData.settlementType }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- Participants List (Collapsible) -->
        <div class="participants-section" style="margin-top: 20px;">
          <el-collapse>
            <el-collapse-item name="participants">
              <template #title>
                <h4 style="margin: 0;">
                  <i class="fas fa-users"></i>
                  參與者列表 ({{ reversePreviewData.participants?.length || 0 }} 人)
                </h4>
              </template>
              <el-table
                :data="reversePreviewData.participants"
                stripe
                max-height="300"
                style="width: 100%;"
              >
                <el-table-column prop="displayName" label="姓名" width="200">
                  <template #default="scope">
                    {{ scope.row.displayName || scope.row.userEmail }}
                  </template>
                </el-table-column>
                <el-table-column prop="userEmail" label="Email" />
                <el-table-column prop="transactionCount" label="交易數" width="100" align="center">
                  <template #default="scope">
                    <el-tag size="small">{{ scope.row.transactionCount }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="totalAmount" label="總點數" width="120" align="right">
                  <template #default="scope">
                    <span :class="scope.row.totalAmount > 0 ? 'positive-amount' : 'negative-amount'">
                      {{ scope.row.totalAmount > 0 ? '+' : '' }}{{ scope.row.totalAmount.toFixed(2) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Reason Input -->
        <div class="reason-input-section" style="margin-top: 30px;">
          <h4><i class="fas fa-edit"></i> 撤銷原因 *</h4>
          <el-input
            v-model="reverseReason"
            type="textarea"
            :rows="4"
            placeholder="請詳細說明撤銷原因（例如：發現計分錯誤需要重新結算）"
            maxlength="200"
            show-word-limit
          />
          <div class="field-hint" style="margin-top: 8px;">
            <i class="fas fa-info-circle"></i>
            請輸入至少 5 個字的撤銷原因,最多 200 字
          </div>
        </div>

        <!-- Confirmation Text Input -->
        <div class="form-section">
          <h4><i class="fas fa-exclamation-triangle"></i> 確認撤銷 *</h4>
          <div class="form-group">
            <label>確認文字 <span class="required">*</span></label>
            <el-input
              v-model="reverseConfirmText"
              placeholder="請輸入 REVERSE"
              maxlength="20"
              class="confirmation-code-input"
              @input="reverseConfirmText = String($event).toUpperCase()"
            />
            <div class="field-hint" style="margin-top: 8px;">
              <i class="fas fa-shield-alt"></i>
              請輸入 <code style="background: #fff; padding: 2px 6px; border-radius: 3px; color: #f56c6c; font-weight: bold;">REVERSE</code> 以確認撤銷操作
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions" style="margin-top: 30px;">
          <el-button
            type="danger"
            size="large"
            @click="confirmReverseSettlement"
            :disabled="reverseReason.length < 5 || reverseConfirmText.trim().toUpperCase() !== 'REVERSE' || reversingSettlement"
            :loading="reversingSettlement"
          >
            <i class="fas fa-undo"></i>
            {{ reversingSettlement ? '撤銷中...' : '確定撤銷結算' }}
          </el-button>
          <el-button
            size="large"
            @click="closeDrawer"
            :disabled="reversingSettlement"
          >
            取消
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { rpcClient } from '@/utils/rpc-client'
import { getErrorMessage } from '@/utils/errorHandler'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

export interface Stage {
  stageId: string
  stageName?: string
  status?: string
  projectId?: string
  [key: string]: any
}

export interface Project {
  projectId: string
  [key: string]: any
}

export interface Participant {
  displayName?: string
  userEmail: string
  transactionCount: number
  totalAmount: number
}

export interface ReversePreviewData {
  totalReward: number
  transactionCount: number
  uniqueUserCount: number
  settlementTime: number
  settlementType: string
  participants?: Participant[]
  settlementId?: string
}

export interface ReverseSuccessData {
  reversalId: string
  transactionCount: number
  stageId: string
  projectId: string
}

export interface Props {
  modelValue?: boolean
  stage?: Stage | null
  project?: Project | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  stage: null,
  project: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'reverse-success': [data: ReverseSuccessData]
}>()

// Reactive state
const reversePreviewData: Ref<ReversePreviewData | null> = ref(null)
const loadingReversePreview: Ref<boolean> = ref(false)
const reversingSettlement: Ref<boolean> = ref(false)
const reverseReason: Ref<string> = ref('')
const reverseConfirmText: Ref<string> = ref('')

// Helper function
function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

// Close drawer
function closeDrawer(): void {
  emit('update:modelValue', false)
}

// Load preview data when drawer opens
async function loadPreviewData(): Promise<void> {
      if (!props.stage || !props.modelValue) {
        return
      }

      if (props.stage.status !== 'completed') {
        ElMessage.warning('只有已結算的階段才能撤銷')
        closeDrawer()
        return
      }

      // Get projectId from multiple sources
      const projectId = props.stage.projectId || props.project?.projectId

      if (!projectId) {
        ElMessage.error('無法取得專案 ID,請重新載入頁面')
        closeDrawer()
        return
      }

      // Reset form inputs
      reverseReason.value = ''
      reverseConfirmText.value = ''
      reversePreviewData.value = null
      loadingReversePreview.value = true

      try {
        // Get settlement history first
        const historyHttpResponse = await rpcClient.settlement.history.$post({
          json: {
            projectId: projectId,
            filters: { stageId: props.stage.stageId, status: 'active' }
          }
        })
        const historyResponse = await historyHttpResponse.json()

        if (!historyResponse.success) {
          ElMessage.error(`獲取結算記錄失敗: ${historyResponse.error?.message || '未知錯誤'}`)
          closeDrawer()
          return
        }

        if (!historyResponse.data?.settlements?.length) {
          ElMessage.error('找不到該階段的結算記錄')
          closeDrawer()
          return
        }

        const settlement = historyResponse.data.settlements[0]

        // Get detailed preview from new API
        const previewHttpResponse = await (rpcClient.settlement as any)['reverse-preview'].$post({
          json: {
            projectId: projectId,
            settlementId: settlement.settlementId
          }
        })
        const previewResponse = await previewHttpResponse.json()

        if (!previewResponse.success) {
          ElMessage.error(`載入撤銷預覽失敗: ${previewResponse.error?.message || '未知錯誤'}`)
          closeDrawer()
          return
        }

        // Store preview data with settlement ID
        reversePreviewData.value = {
          ...previewResponse.data,
          settlementId: settlement.settlementId
        }

      } catch (error) {
        console.error('載入撤銷預覽發生錯誤:', error)
        ElMessage.error(`載入撤銷預覽失敗: ${getErrorMessage(error)}`)
        closeDrawer()
      } finally {
        loadingReversePreview.value = false
      }
    }

// Execute reverse settlement
async function confirmReverseSettlement(): Promise<void> {
      if (!reversePreviewData.value || !props.stage) {
        ElMessage.error('缺少必要資訊,請重新開啟撤銷視窗')
        return
      }

      if (reverseReason.value.length < 5) {
        ElMessage.warning('請輸入至少 5 個字的撤銷原因')
        return
      }

      // Validation: Check confirmation text
      const expectedText = 'REVERSE'
      if (reverseConfirmText.value.trim().toUpperCase() !== expectedText) {
        ElMessage.warning(`請輸入 "${expectedText}" 以確認撤銷操作`)
        return
      }

      const projectId = props.stage.projectId || props.project?.projectId

      if (!projectId) {
        ElMessage.error('無法取得專案 ID')
        return
      }

      try {
        reversingSettlement.value = true

        console.log('執行撤銷結算:', {
          projectId: projectId,
          settlementId: reversePreviewData.value.settlementId,
          reason: reverseReason.value
        })

        const reverseHttpResponse = await rpcClient.settlement.reverse.$post({
          json: {
            projectId: projectId,
            settlementId: reversePreviewData.value.settlementId,
            reason: reverseReason.value
          }
        })
        const reverseResponse = await reverseHttpResponse.json()

        console.log('撤銷結算回應:', reverseResponse)

        if (reverseResponse.success) {
          ElMessage.success(
            `結算已成功撤銷！\n` +
            `撤銷ID：${reverseResponse.data.reversalId}\n` +
            `反向交易數：${reverseResponse.data.transactionsReversed}筆\n` +
            `階段已回到投票狀態`
          )

          // Emit success event with data
          emit('reverse-success', {
            reversalId: reverseResponse.data.reversalId,
            transactionCount: reverseResponse.data.transactionsReversed,
            stageId: props.stage.stageId,
            projectId: projectId
          })

          // Close drawer
          closeDrawer()
        } else {
          ElMessage.error(`撤銷失敗：${reverseResponse.error?.message || '未知錯誤'}`)
        }

      } catch (error) {
        console.error('撤銷結算發生錯誤:', error)
        ElMessage.error(`撤銷結算失敗: ${getErrorMessage(error)}`)
      } finally {
        reversingSettlement.value = false
      }
    }

// Watch for drawer open/close
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    loadPreviewData()

    // Add alerts when drawer opens
    clearAlerts()
    addAlert({
      type: 'warning',
      title: '撤銷後將無法復原，請謹慎操作',
      message: '撤銷結算將創建反向交易記錄,所有參與者的點數將被扣回。階段狀態將回到投票階段,允許重新結算。',
      closable: false
    })
    addAlert({
      type: 'error',
      title: '此操作無法復原！',
      message: '請輸入 REVERSE 以確認撤銷操作',
      closable: false
    })
  } else {
    // Clear alerts when drawer closes
    clearAlerts()
  }
})
</script>

<style scoped>
/* Reverse Settlement Drawer Styles */
.reverse-settlement-drawer .drawer-body {
  max-width: 1200px;
  margin: 0 auto;
}

.reverse-settlement-drawer .stage-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e4e7ed;
}

.reverse-settlement-drawer .stage-info-header h3 {
  margin: 0;
  color: #303133;
  font-size: 24px;
}

.reverse-settlement-drawer .settlement-details-section h4,
.reverse-settlement-drawer .participants-section h4,
.reverse-settlement-drawer .reason-input-section h4 {
  color: #606266;
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 600;
}

.reverse-settlement-drawer .reward-amount {
  font-size: 20px;
  font-weight: bold;
  color: #f56c6c;
}

.reverse-settlement-drawer .transaction-count,
.reverse-settlement-drawer .participant-count {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
}

.reverse-settlement-drawer .positive-amount {
  color: #67c23a;
  font-weight: 600;
}

.reverse-settlement-drawer .negative-amount {
  color: #f56c6c;
  font-weight: 600;
}

.reverse-settlement-drawer .field-hint {
  font-size: 13px;
  color: #909399;
}

.reverse-settlement-drawer .drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.reverse-settlement-drawer :deep(.el-descriptions__label) {
  font-weight: 600;
  width: 120px;
}

.reverse-settlement-drawer :deep(.el-descriptions__content) {
  font-size: 15px;
}

.reverse-settlement-drawer .confirmation-input-section h4 {
  color: #f56c6c;
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 600;
}

.reverse-settlement-drawer .confirmation-input-section :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  letter-spacing: 2px;
}

.reverse-settlement-drawer .confirmation-input-section code {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .reverse-settlement-drawer .stage-info-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .reverse-settlement-drawer .drawer-actions {
    flex-direction: column;
  }

  .reverse-settlement-drawer .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
