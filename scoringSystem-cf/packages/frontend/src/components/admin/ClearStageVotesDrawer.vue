<template>
  <el-drawer
    :model-value="visible"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="clear-stage-votes-drawer drawer-maroon"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template #header>
      <div class="drawer-breadcrumb">
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-layer-group"></i>
            專案管理
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-eraser"></i>
            強制清空投票
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </template>

    <div v-loading="loading" class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <div>
        <!-- Stage Info Header -->
        <div class="stage-info-header">
          <h3>{{ stageName || '此階段' }}</h3>
          <el-tag type="danger" size="large">準備清空投票</el-tag>
        </div>

        <!-- Impact Warning -->
        <div class="form-section impact-warning-section">
          <h4><i class="fas fa-exclamation-circle"></i> 此操作將會</h4>
          <ul class="impact-list">
            <li><i class="fas fa-ban"></i> 作廢此階段所有組別的排名投票版本（學生提案）</li>
            <li><i class="fas fa-undo"></i> 若該階段已結算，連帶撤回已發放的獎金（產生反向交易）</li>
            <li><i class="fas fa-eye"></i> 各組仍會看到被「強制撤回的舊版本」與撤回理由</li>
            <li><i class="fas fa-history"></i> 階段倒退回未投票狀態，可重新投票</li>
            <li><i class="fas fa-clipboard-list"></i> 事件會記錄於專案日誌（管理員稽核）</li>
          </ul>
        </div>

        <!-- Target State (slider) -->
        <div class="form-section">
          <h4><i class="fas fa-route"></i> 倒退目標狀態 *</h4>
          <div class="extend-slider-label">
            <i class="fas fa-clock"></i>
            <span v-if="extendActiveHours > 0">
              回到「提交/共識」階段(active)，延長 <strong>{{ extendActiveHours }}</strong> 小時 —
              讓未完成組內共識的組可補完後再重新投票
            </span>
            <span v-else>
              回到「投票」階段(voting)— 不延長 active，直接重新開放投票
            </span>
          </div>
          <el-slider
            v-model="extendActiveHours"
            :min="0"
            :max="72"
            :step="1"
            :marks="extendSliderMarks"
            show-stops
          />
        </div>

        <!-- Reason Input -->
        <div class="form-section reason-input-section">
          <h4><i class="fas fa-edit"></i> 撤回理由 *</h4>
          <el-input
            v-model="reason"
            type="textarea"
            :rows="4"
            placeholder="請詳細說明清空投票的理由（會顯示在每位學生被撤回的排名版本上）"
            maxlength="200"
            show-word-limit
          />
          <div class="field-hint">
            <i class="fas fa-info-circle"></i>
            請輸入至少 5 個字的理由，最多 200 字
          </div>
        </div>

        <!-- Confirmation Text Input -->
        <div class="form-section confirmation-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認 *</h4>
          <ConfirmationInput
            v-model="confirmText"
            keyword="CLEAR"
            hint-action="清空投票"
            prefix-icon="fas fa-shield-alt"
          />
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions">
          <el-button
            type="danger"
            size="large"
            :disabled="!isValidForm || isProcessing"
            :loading="isProcessing"
            @click="confirmClearVotes"
          >
            <i class="fas fa-eraser"></i>
            {{ isProcessing ? '處理中...' : '確認清空投票' }}
          </el-button>
          <el-button
            size="large"
            :disabled="isProcessing"
            @click="closeDrawer"
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
import { getErrorMessage } from '@/utils/errorHandler'

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
const { clearAlerts, warning, error } = useDrawerAlerts()

// State
const loading = ref(false)
const isProcessing = ref(false)
const reason = ref('')
const confirmText = ref('')
// 0 = 回到投票（不延長）；> 0 = 回到 active 並延長該時數
const extendActiveHours = ref(0)
const extendSliderMarks = {
  0: '投票',
  1: '1h',
  3: '3h',
  6: '6h',
  12: '12h',
  24: '1天',
  48: '2天',
  72: '3天'
}

// Computed
const isValidForm = computed(() => {
  if (reason.value.trim().length < 5) return false
  if (confirmText.value.trim().toUpperCase() !== 'CLEAR') return false
  return true
})

// Methods
function closeDrawer() {
  emit('update:visible', false)
}

async function confirmClearVotes() {
  if (!isValidForm.value) return
  if (!props.projectId || !props.stageId) {
    ElMessage.error('缺少專案或階段資訊')
    return
  }

  isProcessing.value = true
  try {
    const clearToActive = extendActiveHours.value > 0
    const httpResponse = await (rpcClient.scoring as any)['clear-stage-votes'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        reason: reason.value.trim(),
        targetState: clearToActive ? 'active' : 'voting',
        ...(clearToActive ? { extendHours: extendActiveHours.value } : {})
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      const data = response.data || {}
      ElMessage.success(
        `已清空投票：作廢 ${data.withdrawnProposals ?? 0} 份排名版本` +
        (data.reversedSettlements ? `，撤回 ${data.reversedSettlements} 筆結算` : '') +
        (clearToActive
          ? `，階段已回到提交階段（延長 ${extendActiveHours.value} 小時）`
          : `，階段已回到投票階段`)
      )
      emit('confirmed')
      closeDrawer()
    } else {
      ElMessage.error(`清空投票失敗：${response.error?.message || '未知錯誤'}`)
    }
  } catch (err) {
    console.error('清空投票發生錯誤:', err)
    ElMessage.error(`清空投票失敗：${getErrorMessage(err)}`)
  } finally {
    isProcessing.value = false
  }
}

// Watchers
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // Reset form
    reason.value = ''
    confirmText.value = ''
    extendActiveHours.value = 0

    clearAlerts()
    warning(
      '此操作會作廢所有組別的排名投票，並讓階段倒退回未投票狀態。若該階段已結算，獎金會一併被撤回。',
      '⚠️ 清空投票將影響所有組別'
    )
    error(
      '請輸入 CLEAR 以確認清空投票。此操作無法復原，所有已投的排名版本將被標記為強制撤回。',
      '🛡️ 此操作需要確認！'
    )
  } else {
    clearAlerts()
  }
})
</script>

<style scoped>
.drawer-breadcrumb {
  width: 100%;
}

.clear-stage-votes-drawer .drawer-body {
  max-width: 1200px;
  margin: 0 auto;
}

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

.impact-warning-section h4 {
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
  color: #f56c6c;
  font-size: 16px;
}

.extend-slider-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
}

.form-section :deep(.el-slider) {
  padding: 0 8px;
}

.reason-input-section h4 {
  color: #f56c6c;
}

.confirmation-section {
  background: #fff3f3;
  border-color: #fde2e2;
}

.confirmation-section h4 {
  color: #f56c6c;
}

.field-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 6px;
}

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
