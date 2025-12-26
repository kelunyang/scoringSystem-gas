<template>
  <!-- Transaction Reversal Drawer -->
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="transaction-reversal-drawer drawer-maroon"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-undo"></i>
          撤銷交易確認
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body" v-if="transaction">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- Transaction Details -->
      <div class="transaction-details-section">
        <h4><i class="fas fa-file-invoice"></i> 交易詳情</h4>
        <el-descriptions :column="1" border size="large">
          <el-descriptions-item label="交易 ID">
            <code style="font-size: 12px;">{{ transaction.transactionId }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="金額">
            <span
              :class="transaction.points > 0 ? 'positive-amount' : 'negative-amount'"
              style="font-size: 20px; font-weight: bold;"
            >
              {{ transaction.points > 0 ? '+' : '' }}{{ transaction.points }} 點
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="交易類型">
            <el-tag :type="getTransactionTypeTag(transaction.transactionType)">
              {{ getTransactionTypeText(transaction.transactionType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="說明">
            {{ transaction.description || '無說明' }}
          </el-descriptions-item>
          <el-descriptions-item label="階段">
            {{ transaction.stageName || '階段 ' + transaction.stage }}
          </el-descriptions-item>
          <el-descriptions-item label="交易時間">
            {{ formatTime(transaction.timestamp) }}
          </el-descriptions-item>
          <el-descriptions-item label="相關內容" v-if="transaction.relatedSubmissionId || transaction.relatedCommentId">
            <el-tag v-if="transaction.relatedSubmissionId" type="info" size="small">
              <i class="fas fa-file-alt"></i> 成果 ID: {{ transaction.relatedSubmissionId }}
            </el-tag>
            <el-tag v-if="transaction.relatedCommentId" type="info" size="small" style="margin-left: 8px;">
              <i class="fas fa-comment"></i> 評論 ID: {{ transaction.relatedCommentId }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- Reason Input -->
      <div class="reason-input-section" style="margin-top: 30px;">
        <h4><i class="fas fa-edit"></i> 撤銷理由 *</h4>
        <el-input
          v-model="reverseReason"
          type="textarea"
          :rows="4"
          placeholder="請詳細說明撤銷此交易的原因（例如：誤操作、計分錯誤等）"
          maxlength="200"
          show-word-limit
        />
        <div class="field-hint" style="margin-top: 8px;">
          <i class="fas fa-info-circle"></i>
          請輸入至少 5 個字的撤銷理由，最多 200 字
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
      <div class="drawer-actions">
        <el-button
          type="danger"
          @click="confirmReversal"
          :disabled="!isValidForm || isReversing"
          :loading="isReversing"
        >
          <i class="fas fa-undo"></i>
          {{ isReversing ? '撤銷中...' : '確定撤銷交易' }}
        </el-button>
        <el-button
          @click="closeDrawer"
          :disabled="isReversing"
        >
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatTime, getTransactionTypeText } from '@/utils/walletHelpers'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

// ===== Props & Emits =====
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  transaction: {
    type: Object,
    default: null
  },
  isReversing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'confirm'])

// ===== State =====
const reverseReason = ref('')
const reverseConfirmText = ref('')

// ===== Computed =====

/**
 * 檢查表單是否有效
 */
const isValidForm = computed(() => {
  return (
    reverseReason.value.length >= 5 &&
    reverseConfirmText.value.trim().toUpperCase() === 'REVERSE'
  )
})

// ===== Methods =====

/**
 * 關閉抽屜
 */
function closeDrawer() {
  emit('update:visible', false)
}

/**
 * 確認撤銷交易
 */
function confirmReversal() {
  if (!isValidForm.value) {
    return
  }

  emit('confirm', {
    transactionId: props.transaction.transactionId,
    reason: reverseReason.value.trim()
  })
}

/**
 * 獲取交易類型標籤顏色
 */
function getTransactionTypeTag(type: string): 'success' | 'primary' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'primary' | 'warning' | 'info' | 'danger'> = {
    'stage_reward': 'success',
    'comment_reward': 'primary',
    'vote_reward': 'warning',
    'manual_adjustment': 'info',
    'reversal': 'danger',
    'system': 'info'
  }
  return typeMap[type] || 'info'
}

// ===== Watchers =====

/**
 * 當抽屜開啟/關閉時重置表單和添加 alerts
 */
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // 開啟時重置表單
    reverseReason.value = ''
    reverseConfirmText.value = ''

    // 清除舊的 alerts
    clearAlerts()

    // 添加警告訊息
    addAlert({
      type: 'warning',
      title: '撤銷後將無法復原，請謹慎操作',
      message: '撤銷交易將創建一筆相反金額的交易記錄，以抵銷原交易的影響。此操作會記錄在系統日誌中，供日後稽核。',
      closable: false
    })

    // 添加錯誤確認訊息
    addAlert({
      type: 'error',
      title: '此操作無法復原！',
      message: '請輸入 REVERSE 以確認撤銷操作',
      closable: false
    })
  } else {
    // 關閉時清除所有 alerts
    clearAlerts()
  }
})
</script>

<style scoped>
/* Transaction Reversal Drawer Styles */
.transaction-reversal-drawer .drawer-body {
  max-width: 1000px;
  margin: 0 auto;
}

.transaction-reversal-drawer .transaction-details-section h4,
.transaction-reversal-drawer .reason-input-section h4 {
  color: #606266;
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 600;
}

.transaction-reversal-drawer .positive-amount {
  color: #67c23a;
}

.transaction-reversal-drawer .negative-amount {
  color: #f56c6c;
}

.transaction-reversal-drawer .field-hint {
  font-size: 13px;
  color: #909399;
}

.transaction-reversal-drawer .drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.transaction-reversal-drawer :deep(.el-descriptions__label) {
  font-weight: 600;
  width: 140px;
}

.transaction-reversal-drawer :deep(.el-descriptions__content) {
  font-size: 15px;
}

/* Confirmation Input - 特殊樣式 */
.transaction-reversal-drawer .form-section:last-of-type h4 {
  color: #f56c6c;
}

.transaction-reversal-drawer .form-section:last-of-type :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  letter-spacing: 2px;
}

.transaction-reversal-drawer .form-section:last-of-type code {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .transaction-reversal-drawer .drawer-actions {
    flex-direction: column;
  }

  .transaction-reversal-drawer .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
