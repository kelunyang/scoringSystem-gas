<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    direction="btt"
    size="100%"
    :close-on-click-modal="false"
    class="pause-stage-drawer drawer-navy"
  >
    <template #header>
      <div class="drawer-breadcrumb">
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-layer-group"></i>
            專案管理
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-pause-circle"></i>
            暫停階段
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </template>

    <div class="drawer-body" v-loading="loading">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <div v-if="!loading">
        <!-- Stage Info Header -->
        <div class="stage-info-header">
          <h3>{{ stageName || '載入中...' }}</h3>
          <el-tag type="warning" size="large">準備暫停</el-tag>
        </div>

        <!-- Impact Warning -->
        <div class="form-section impact-warning-section">
          <h4><i class="fas fa-exclamation-circle"></i> 暫停階段的影響</h4>
          <ul class="impact-list">
            <li><i class="fas fa-pause"></i> 階段將立即進入暫停狀態</li>
            <li><i class="fas fa-ban"></i> 學生將無法提交或編輯成果</li>
            <li><i class="fas fa-comment-slash"></i> 無法發表新評論</li>
            <li><i class="fas fa-vote-yea"></i> 無法進行投票操作</li>
            <li><i class="fas fa-bell"></i> 所有專案成員將收到通知</li>
            <li><i class="fas fa-play"></i> 您可以隨時恢復階段以繼續運作</li>
          </ul>
        </div>

        <!-- Pause Reason Input -->
        <div class="form-section reason-section">
          <h4><i class="fas fa-comment-alt"></i> 暫停原因 *</h4>
          <div class="form-group">
            <label>請輸入暫停原因 <span class="required">*</span></label>
            <el-input
              v-model="pauseReason"
              type="textarea"
              :rows="4"
              placeholder="請說明暫停此階段的原因，例如：發現評分標準需要調整、等待額外資源..."
              maxlength="500"
              show-word-limit
            />
            <div class="field-hint">
              <i class="fas fa-info-circle"></i>
              暫停原因將會通知給所有專案成員，請清楚說明暫停的理由
            </div>
          </div>
        </div>

        <!-- Confirmation Text Input -->
        <div class="form-section confirmation-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認 *</h4>
          <div class="form-group">
            <label>確認文字 <span class="required">*</span></label>
            <el-input
              v-model="confirmText"
              placeholder="請輸入 PAUSE"
              maxlength="20"
              class="confirmation-input"
              @input="confirmText = String($event).toUpperCase()"
            />
            <div class="field-hint">
              <i class="fas fa-info-circle"></i>
              請輸入 <code>PAUSE</code> 以確認暫停階段
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions">
          <el-button
            type="warning"
            size="large"
            @click="confirmPause"
            :disabled="!isValidForm || isProcessing"
            :loading="isProcessing"
          >
            <i class="fas fa-pause"></i>
            {{ isProcessing ? '處理中...' : '確認暫停階段' }}
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
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { rpcClient } from '@/utils/rpc-client'

// Props & Emits
const props = defineProps<{
  visible: boolean
  projectId?: string
  stageId?: string
  stageName?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirmed'): void
}>()

// Drawer Alerts
const { clearAlerts, warning } = useDrawerAlerts()

// State
const loading = ref(false)
const isProcessing = ref(false)
const pauseReason = ref('')
const confirmText = ref('')

// Computed
const isValidForm = computed(() => {
  return pauseReason.value.trim().length >= 1 && confirmText.value.trim().toUpperCase() === 'PAUSE'
})

// Methods
function closeDrawer() {
  emit('update:visible', false)
}

async function confirmPause() {
  if (!isValidForm.value) return

  isProcessing.value = true
  try {
    const httpResponse = await rpcClient.stages.pause.$post({
      json: {
        projectId: props.projectId!,
        stageId: props.stageId!,
        reason: pauseReason.value.trim()
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('階段已暫停')
      emit('confirmed')
      closeDrawer()
    } else {
      ElMessage.error(`操作失敗: ${response.error || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('Error pausing stage:', error)
    ElMessage.error('操作失敗，請重試')
  } finally {
    isProcessing.value = false
  }
}

// Watchers
watch(() => props.visible, (newVal) => {
  if (newVal) {
    pauseReason.value = ''
    confirmText.value = ''
    clearAlerts()

    // 添加提示訊息
    warning(
      '暫停階段後，所有成員將無法進行提交、評論或投票操作。您可以隨時恢復階段以繼續正常運作。',
      '暫停階段說明'
    )
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
  color: #e6a23c;
  font-size: 16px;
  width: 20px;
  text-align: center;
}

/* Reason Section */
.reason-section h4 {
  color: #409eff;
}

.reason-section h4 i {
  color: #409eff;
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

.field-hint code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  color: #f56c6c;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  border: 1px solid #fde2e2;
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
