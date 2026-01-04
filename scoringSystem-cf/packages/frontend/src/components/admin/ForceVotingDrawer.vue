<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="force-voting-drawer drawer-maroon"
  >
    <template #header>
      <div class="drawer-breadcrumb">
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-layer-group"></i>
            專案管理
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-vote-yea"></i>
            強制進入投票確認
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </template>

    <div class="drawer-body" v-loading="loading">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <div v-if="stageStats">
        <!-- Stage Info Header -->
        <div class="stage-info-header">
          <h3>{{ stageStats.stageName }}</h3>
          <el-tag type="warning" size="large">準備強制投票</el-tag>
        </div>

        <!-- Stage Statistics -->
        <div class="form-section stage-stats-section">
          <h4><i class="fas fa-chart-bar"></i> 階段統計資訊</h4>
          <el-descriptions :column="1" border size="large" class="stage-stats-table">
            <el-descriptions-item label="階段名稱">
              <strong>{{ stageStats.stageName }}</strong>
            </el-descriptions-item>
            <el-descriptions-item label="有效成果數量">
              <span class="stat-value">
                <i class="fas fa-file-alt"></i>
                {{ stageStats.submissionCount }} 份
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="評論數量">
              <span class="stat-value">
                <i class="fas fa-comments"></i>
                {{ stageStats.commentCount }} 則
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="成果獎勵池">
              <span class="reward-amount report-reward">
                <i class="fas fa-coins"></i>
                {{ stageStats.reportRewardPool }} 點
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="評論獎勵池">
              <span class="reward-amount comment-reward">
                <i class="fas fa-coins"></i>
                {{ stageStats.commentRewardPool }} 點
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- Impact Warning -->
        <div class="form-section impact-warning-section">
          <h4><i class="fas fa-exclamation-circle"></i> 強制投票的影響</h4>
          <ul class="impact-list">
            <li><i class="fas fa-check-circle"></i> 階段將立即進入投票狀態</li>
            <li><i class="fas fa-lock"></i> 所有已提交的成果將被鎖定</li>
            <li><i class="fas fa-ban"></i> 學生將無法再提交或編輯成果</li>
            <li><i class="fas fa-users"></i> 小組成員可以開始進行投票</li>
            <li><i class="fas fa-bell"></i> 所有專案成員將收到通知</li>
          </ul>
        </div>

        <!-- Confirmation Text Input -->
        <div class="form-section confirmation-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認 *</h4>
          <ConfirmationInput
            v-model="confirmText"
            keyword="VOTING"
            hint-action="強制投票"
            @confirm="confirmForceVoting"
          />
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions">
          <el-button
            type="danger"
            size="large"
            @click="confirmForceVoting"
            :disabled="!isValidForm || isProcessing"
            :loading="isProcessing"
          >
            <i class="fas fa-vote-yea"></i>
            {{ isProcessing ? '處理中...' : '確認強制投票' }}
          </el-button>
          <el-button
            size="large"
            @click="closeDrawer"
            :disabled="isProcessing"
          >
            <i class="fas fa-times"></i>
            取消
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { rpcClient } from '@/utils/rpc-client'

// Props & Emits
const props = defineProps<{
  visible: boolean
  projectId?: string
  stageId?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirmed'): void
}>()

// Drawer Alerts
const { addAlert, clearAlerts, warning, error } = useDrawerAlerts()

// State
const loading = ref(false)
const isProcessing = ref(false)
const confirmText = ref('')
const stageStats = ref<{
  stageName: string
  submissionCount: number
  commentCount: number
  reportRewardPool: number
  commentRewardPool: number
} | null>(null)

// Computed
const isValidForm = computed(() => {
  return confirmText.value.trim().toUpperCase() === 'VOTING'
})

// Methods
function closeDrawer() {
  emit('update:visible', false)
}

async function loadStageStats() {
  if (!props.projectId || !props.stageId) return

  loading.value = true
  try {
    const httpResponse = await rpcClient.stages.get.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      stageStats.value = {
        stageName: response.data.stageName || '未命名階段',
        submissionCount: response.data.statistics?.submissionCount || 0,
        commentCount: response.data.statistics?.commentCount || 0,
        reportRewardPool: response.data.reportRewardPool || 0,
        commentRewardPool: response.data.commentRewardPool || 0
      }
    } else {
      ElMessage.error('載入階段資訊失敗')
      closeDrawer()
    }
  } catch (error) {
    console.error('Error loading stage stats:', error)
    ElMessage.error('載入階段資訊失敗')
    closeDrawer()
  } finally {
    loading.value = false
  }
}

async function confirmForceVoting() {
  if (!isValidForm.value) return

  isProcessing.value = true
  try {
    const httpResponse = await rpcClient.stages['force-transition'].$post({
      json: {
        projectId: props.projectId!,
        stageId: props.stageId!
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('已強制進入投票階段')
      emit('confirmed')
      closeDrawer()
    } else {
      ElMessage.error(`操作失敗: ${response.error || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('Error forcing voting:', error)
    ElMessage.error('操作失敗，請重試')
  } finally {
    isProcessing.value = false
  }
}

// Watchers
watch(() => props.visible, (newVal) => {
  if (newVal) {
    confirmText.value = ''
    clearAlerts()

    // 添加警告訊息
    warning(
      '此操作將立即結束提交階段並開始投票。已提交的成果將被鎖定，無法再編輯或新增。所有專案成員將收到通知。',
      '⚠️ 強制投票將立即生效'
    )

    // 添加確認訊息
    error(
      '請輸入 VOTING 以確認強制進入投票階段。此操作執行後，階段狀態將無法輕易恢復。',
      '🛡️ 此操作需要確認！'
    )

    // 載入階段統計
    loadStageStats()
  } else {
    clearAlerts()
  }
})
</script>

<style scoped>
/* Drawer Breadcrumb */
.drawer-breadcrumb {
  width: 100%;
}

/* Stage Info Header */
.stage-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e4e7ed;
}

.stage-info-header h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

/* Form Section */
.form-section {
  margin-bottom: 24px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.form-section h4 {
  color: #606266;
  font-size: 16px;
  margin: 0 0 16px 0;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-section h4 i {
  color: #909399;
}

/* Stage Stats Section */
.stage-stats-section h4 {
  color: #409eff;
}

.stage-stats-section h4 i {
  color: #409eff;
}

.stage-stats-table {
  margin-top: 12px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.reward-amount {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.reward-amount.report-reward {
  color: #67c23a;
}

.reward-amount.comment-reward {
  color: #e6a23c;
}

/* Impact Warning Section */
.impact-warning-section h4 {
  color: #e6a23c;
}

.impact-warning-section h4 i {
  color: #e6a23c;
}

.impact-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.impact-list li {
  padding: 10px 0;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #606266;
  font-size: 14px;
}

.impact-list li:last-child {
  border-bottom: none;
}

.impact-list li i {
  color: #409eff;
  font-size: 16px;
}

/* Confirmation Section */
.confirmation-section {
  background: #fff3f3;
  border-color: #fde2e2;
}

.confirmation-section h4 {
  color: #f56c6c;
}

.confirmation-section h4 i {
  color: #f56c6c;
}

.form-group {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #606266;
}

.required {
  color: #f56c6c;
  margin-left: 4px;
}

.field-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-hint code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  color: #f56c6c;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  border: 1px solid #fde2e2;
}

/* Confirmation Input - 特殊樣式 */
.confirmation-input :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  letter-spacing: 3px;
  border: 2px solid #f56c6c;
  background: #fff;
}

.confirmation-input :deep(.el-input__inner:focus) {
  border-color: #f56c6c;
  box-shadow: 0 0 0 2px rgba(245, 108, 108, 0.2);
}

/* Action Buttons */
.drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
  position: sticky;
  bottom: 0;
  background: #fff;
  z-index: 10;
}

.drawer-actions .el-button {
  min-width: 150px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .stage-info-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .drawer-actions {
    flex-direction: column;
  }

  .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
