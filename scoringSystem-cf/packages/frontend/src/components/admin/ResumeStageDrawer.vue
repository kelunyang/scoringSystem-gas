<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    direction="btt"
    size="100%"
    :close-on-click-modal="false"
    class="resume-stage-drawer drawer-navy"
  >
    <template #header>
      <div class="drawer-breadcrumb">
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-layer-group"></i>
            專案管理
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-play-circle"></i>
            恢復階段
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
          <el-tag type="success" size="large">準備恢復</el-tag>
        </div>

        <!-- Impact Info -->
        <div class="form-section impact-info-section">
          <h4><i class="fas fa-info-circle"></i> 恢復階段的影響</h4>
          <ul class="impact-list">
            <li><i class="fas fa-play"></i> 階段將立即恢復運作</li>
            <li><i class="fas fa-file-alt"></i> 學生可以繼續提交或編輯成果</li>
            <li><i class="fas fa-comments"></i> 可以繼續發表評論</li>
            <li><i class="fas fa-vote-yea"></i> 投票操作將恢復正常</li>
            <li><i class="fas fa-bell"></i> 所有專案成員將收到通知</li>
          </ul>
        </div>

        <!-- Confirmation Text Input -->
        <div class="form-section confirmation-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認 *</h4>
          <ConfirmationInput
            v-model="confirmText"
            keyword="RESUME"
            hint-action="恢復"
            @confirm="confirmResume"
          />
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions">
          <el-button
            type="success"
            size="large"
            @click="confirmResume"
            :disabled="!isValidForm || isProcessing"
            :loading="isProcessing"
          >
            <i class="fas fa-play"></i>
            {{ isProcessing ? '處理中...' : '確認恢復階段' }}
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
  stageName?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirmed'): void
}>()

// Drawer Alerts
const { clearAlerts, info } = useDrawerAlerts()

// State
const loading = ref(false)
const isProcessing = ref(false)
const confirmText = ref('')

// Computed
const isValidForm = computed(() => {
  return confirmText.value.trim().toUpperCase() === 'RESUME'
})

// Methods
function closeDrawer() {
  emit('update:visible', false)
}

async function confirmResume() {
  if (!isValidForm.value) return

  isProcessing.value = true
  try {
    const httpResponse = await rpcClient.stages.resume.$post({
      json: {
        projectId: props.projectId!,
        stageId: props.stageId!
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('階段已恢復')
      emit('confirmed')
      closeDrawer()
    } else {
      ElMessage.error(`操作失敗: ${response.error || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('Error resuming stage:', error)
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

    // 添加提示訊息
    info(
      '恢復階段後，所有成員將可以繼續進行提交、評論和投票操作。階段將根據時間自動判斷為「進行中」或「投票中」狀態。',
      '恢復階段說明'
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

/* Impact Info Section */
.impact-info-section h4 {
  color: #67c23a;
}

.impact-info-section h4 i {
  color: #67c23a;
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
  color: #67c23a;
  font-size: 16px;
  width: 20px;
  text-align: center;
}

/* Confirmation Section */
.confirmation-section {
  background: #f0f9eb;
  border-color: #c2e7b0;
}

.confirmation-section h4 {
  color: #67c23a;
}

.confirmation-section h4 i {
  color: #67c23a;
}

.confirmation-input :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  letter-spacing: 3px;
  border: 2px solid #67c23a;
  background: #fff;
}

.confirmation-input :deep(.el-input__inner:focus) {
  border-color: #67c23a;
  box-shadow: 0 0 0 2px rgba(103, 194, 58, 0.2);
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
  color: #67c23a;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  border: 1px solid #c2e7b0;
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
