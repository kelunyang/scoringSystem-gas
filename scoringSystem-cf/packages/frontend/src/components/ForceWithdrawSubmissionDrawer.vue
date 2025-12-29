<template>
  <!-- Force Withdraw Submission Drawer -->
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="force-withdraw-drawer drawer-maroon"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-ban"></i>
          強制撤回成果
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body" v-if="submission">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- Submission Details -->
      <div class="submission-details-section">
        <h4><i class="fas fa-file-alt"></i> 成果詳情</h4>
        <el-descriptions :column="1" border size="large">
          <el-descriptions-item label="成果 ID">
            <code style="font-size: 12px;">{{ submission.submissionId }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="組別">
            {{ submission.groupName || '未命名組別' }}
          </el-descriptions-item>
          <el-descriptions-item label="階段">
            {{ submission.stageName || stageName || '未知階段' }}
          </el-descriptions-item>
          <el-descriptions-item label="提交時間">
            {{ formatTime(submission.submittedTime || submission.createdTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="目前狀態">
            <el-tag :type="getStatusTagType(submission.status)">
              {{ getStatusText(submission.status) }}
            </el-tag>
            <el-tag v-if="submission.status === 'approved'" type="warning" size="small" style="margin-left: 8px;">
              <i class="fas fa-exclamation-triangle"></i> 已核准
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="參與者" v-if="submission.authors">
            <div class="authors-list">
              <span v-for="(author, idx) in parseAuthors(submission.authors)" :key="idx" class="author-tag">
                {{ author }}
              </span>
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- Reason Input -->
      <div class="reason-input-section" style="margin-top: 30px;">
        <h4><i class="fas fa-edit"></i> 撤回原因 *</h4>
        <el-input
          v-model="withdrawReason"
          type="textarea"
          :rows="4"
          placeholder="請詳細說明撤回此成果的原因（例如：內容不當、抄襲、違規等）"
          maxlength="500"
          show-word-limit
        />
        <div class="field-hint" style="margin-top: 8px;">
          <i class="fas fa-info-circle"></i>
          請輸入至少 10 個字的撤回原因，最多 500 字。此原因將透過 Email 通知所有組員。
        </div>
      </div>

      <!-- Confirmation Text Input -->
      <div class="form-section">
        <h4><i class="fas fa-exclamation-triangle"></i> 確認撤回 *</h4>
        <div class="form-group">
          <label>確認文字 <span class="required">*</span></label>
          <el-input
            v-model="confirmText"
            placeholder="請輸入 FORCEREVERT"
            maxlength="20"
            class="confirmation-code-input"
            @input="confirmText = String($event).toUpperCase()"
          />
          <div class="field-hint" style="margin-top: 8px;">
            <i class="fas fa-shield-alt"></i>
            請輸入 <code style="background: #fff; padding: 2px 6px; border-radius: 3px; color: #f56c6c; font-weight: bold;">FORCEREVERT</code> 以確認強制撤回操作
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          @click="confirmWithdraw"
          :disabled="!isValidForm || isWithdrawing"
          :loading="isWithdrawing"
        >
          <i class="fas fa-ban"></i>
          {{ isWithdrawing ? '撤回中...' : '確定強制撤回' }}
        </el-button>
        <el-button
          @click="closeDrawer"
          :disabled="isWithdrawing"
        >
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { rpcClient } from '@/utils/rpc-client'
import { handleError, showSuccess } from '@/utils/errorHandler'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

// ===== Props & Emits =====
interface SubmissionInfo {
  submissionId: string
  groupId?: string
  groupName?: string
  stageName?: string
  status?: string
  submittedTime?: number
  createdTime?: number
  authors?: string | string[]
}

const props = defineProps<{
  visible: boolean
  submission: SubmissionInfo | null
  projectId: string
  stageName?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'withdrawn': []
}>()

// ===== State =====
const withdrawReason = ref('')
const confirmText = ref('')
const isWithdrawing = ref(false)

// ===== Computed =====

/**
 * 檢查表單是否有效
 */
const isValidForm = computed(() => {
  return (
    withdrawReason.value.length >= 10 &&
    confirmText.value.trim().toUpperCase() === 'FORCEREVERT'
  )
})

// ===== Methods =====

/**
 * 格式化時間
 */
function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY/MM/DD HH:mm:ss')
}

/**
 * 獲取狀態標籤類型
 */
function getStatusTagType(status: string | undefined): 'success' | 'warning' | 'info' | 'danger' {
  const statusMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    'approved': 'success',
    'submitted': 'warning',
    'withdrawn': 'info',
    'pending': 'warning'
  }
  return statusMap[status || ''] || 'info'
}

/**
 * 獲取狀態文字
 */
function getStatusText(status: string | undefined): string {
  const statusMap: Record<string, string> = {
    'approved': '已核准',
    'submitted': '待核准',
    'withdrawn': '已撤回',
    'pending': '待處理'
  }
  return statusMap[status || ''] || status || '未知'
}

/**
 * 解析作者列表
 */
function parseAuthors(authors: string | string[] | undefined): string[] {
  if (!authors) return []
  if (Array.isArray(authors)) return authors
  try {
    const parsed = JSON.parse(authors)
    return Array.isArray(parsed) ? parsed : [authors]
  } catch {
    return [authors]
  }
}

/**
 * 關閉抽屜
 */
function closeDrawer() {
  emit('update:visible', false)
}

/**
 * 確認強制撤回
 */
async function confirmWithdraw() {
  if (!isValidForm.value || !props.submission) {
    return
  }

  isWithdrawing.value = true

  try {
    const httpResponse = await (rpcClient.submissions as any)['force-withdraw'].$post({
      json: {
        projectId: props.projectId,
        submissionId: props.submission.submissionId,
        reason: withdrawReason.value.trim()
      }
    })

    const result = await httpResponse.json()

    if (result.success) {
      showSuccess('成果已強制撤回，通知郵件已發送給所有組員')
      emit('withdrawn')
      closeDrawer()
    } else {
      handleError(result.error || '撤回失敗')
    }
  } catch (error) {
    handleError(error as Error)
  } finally {
    isWithdrawing.value = false
  }
}

// ===== Watchers =====

/**
 * 當抽屜開啟/關閉時重置表單和添加 alerts
 */
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // 開啟時重置表單
    withdrawReason.value = ''
    confirmText.value = ''

    // 清除舊的 alerts
    clearAlerts()

    // 添加警告訊息
    addAlert({
      type: 'warning',
      title: '強制撤回後將無法復原，請謹慎操作',
      message: '撤回成果後，該組需要重新提交。撤回原因將透過 Email 通知所有組員，並記錄在系統日誌中供日後稽核。',
      closable: false
    })

    // 如果是已核准的成果，添加額外警告
    if (props.submission?.status === 'approved') {
      addAlert({
        type: 'error',
        title: '警告：此成果已經核准！',
        message: '強制撤回已核准的成果可能會影響該組的階段成績。請確認您了解此操作的後果。',
        closable: false
      })
    }

    // 添加確認輸入提示
    addAlert({
      type: 'error',
      title: '此操作無法復原！',
      message: '請輸入 FORCEREVERT 以確認強制撤回操作',
      closable: false
    })
  } else {
    // 關閉時清除所有 alerts
    clearAlerts()
  }
})
</script>

<style scoped>
/* Force Withdraw Drawer Styles */
.force-withdraw-drawer .drawer-body {
  max-width: 1000px;
  margin: 0 auto;
}

.force-withdraw-drawer .submission-details-section h4,
.force-withdraw-drawer .reason-input-section h4 {
  color: #606266;
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 600;
}

.force-withdraw-drawer .authors-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.force-withdraw-drawer .author-tag {
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.force-withdraw-drawer .field-hint {
  font-size: 13px;
  color: #909399;
}

.force-withdraw-drawer .drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.force-withdraw-drawer :deep(.el-descriptions__label) {
  font-weight: 600;
  width: 140px;
}

.force-withdraw-drawer :deep(.el-descriptions__content) {
  font-size: 15px;
}

/* Confirmation Input - 特殊樣式 */
.force-withdraw-drawer .form-section:last-of-type h4 {
  color: #f56c6c;
}

.force-withdraw-drawer .form-section:last-of-type :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  letter-spacing: 2px;
}

.force-withdraw-drawer .form-section:last-of-type code {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .force-withdraw-drawer .drawer-actions {
    flex-direction: column;
  }

  .force-withdraw-drawer .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
