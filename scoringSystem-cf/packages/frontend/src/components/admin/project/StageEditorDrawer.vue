<template>
  <el-drawer
    v-model="localVisible"
    direction="ttb"
    size="100%"
    class="edit-stage-drawer drawer-maroon"
    :z-index="2500"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-layer-group"></i>
          {{ editForm.stageId ? ('編輯階段' + (editingStage ? ' - ' + editingStage.stageName : '')) : '新增階段' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body" v-loading="loadingStageDetails" element-loading-text="載入階段詳情中...">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <div class="form-row">
        <div class="form-group">
          <label>階段名稱 *</label>
          <input
            type="text"
            v-model="editForm.stageName"
            class="form-input"
            placeholder="輸入階段名稱"
          >
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>開始時間 *</label>
          <input
            type="datetime-local"
            v-model="editForm.startTime"
            class="form-input"
            :disabled="!!(isVotingLocked && editForm.stageId)"
            :title="isVotingLocked ? '本階段已有投票紀錄，無法修改時間' : ''"
          >
        </div>
        <div class="form-group">
          <label>結束時間 *</label>
          <input
            type="datetime-local"
            v-model="editForm.endTime"
            class="form-input"
            :disabled="!!(isVotingLocked && editForm.stageId)"
            :title="isVotingLocked ? '本階段已有投票紀錄，無法修改時間' : ''"
          >
        </div>
      </div>

      <div class="form-group">
        <label>階段描述</label>
        <MarkdownEditor v-model="editForm.description" placeholder="請輸入階段目標說明（支援Markdown格式）" />
      </div>

      <div class="form-group">
        <label>階段狀態</label>
        <div class="status-display">
          <span class="status-badge" :class="'status-' + stageStatus">
            {{ stageStatusText }}
          </span>
          <small class="status-help">階段狀態由系統自動管理</small>
        </div>
      </div>

      <!-- Reward Pool Configuration -->
      <div class="form-section">
        <h5><i class="fas fa-coins"></i> 獎金池設定</h5>
        <div class="form-row">
          <div class="form-group">
            <label>報告獎金池總額</label>
            <input type="number" v-model="editForm.reportRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
          </div>
          <div class="form-group">
            <label>評論獎金池總額</label>
            <input type="number" v-model="editForm.commentRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
          </div>
        </div>
      </div>

      <div class="drawer-actions">
        <el-button
          type="primary"
          @click="handleSave"
          :disabled="savingStageDetails"
          :loading="savingStageDetails"
        >
          <i v-if="!savingStageDetails" :class="editForm.stageId ? 'fas fa-save' : 'fas fa-plus'"></i>
          {{ savingStageDetails ? (editForm.stageId ? '儲存中...' : '創建中...') : (editForm.stageId ? '儲存變更' : '創建階段') }}
        </el-button>
        <el-button @click="handleClose" :disabled="savingStageDetails">
          <i class="fas fa-times"></i> 取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import type { Ref, ComputedRef, WritableComputedRef } from 'vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { getStageStatusText, type StageStatus } from '@/utils/stageStatus'
import type { Stage as SharedStage } from '@/types'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

export interface StageForm {
  stageId: string | null
  stageName: string
  startTime: string | number
  endTime: string | number
  status?: string
  description: string
  reportRewardPool: number
  commentRewardPool: number
}

export interface Stage {
  stageId: string
  stageName: string
  [key: string]: any
}

export interface ErrorInfo {
  title?: string
  message: string
}

export interface Props {
  visible?: boolean
  form?: StageForm
  editingStage?: Stage | null
  loadingStageDetails?: boolean
  savingStageDetails?: boolean
  isVotingLocked?: boolean
  stageFormError?: ErrorInfo | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  form: () => ({
    stageId: null,
    stageName: '',
    startTime: '',
    endTime: '',
    description: '',
    reportRewardPool: 0,
    commentRewardPool: 0
  }),
  editingStage: null,
  loadingStageDetails: false,
  savingStageDetails: false,
  isVotingLocked: false,
  stageFormError: null
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': [form: StageForm]
  'close': []
  'clear-error': []
}>()

// Two-way binding for visibility
const localVisible: WritableComputedRef<boolean> = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// Local copy of form for editing
const editForm: Ref<StageForm> = ref({ ...props.form })

// Watch for form prop changes
watch(() => props.form, (newForm) => {
  editForm.value = { ...newForm }
}, { deep: true })

/**
 * Local helper for stage status preview during editing
 * Note: Once saved, backend stages_with_status VIEW calculates the real status
 */
function previewStageStatus(form: StageForm): StageStatus {
  const now = Date.now()

  // Convert times to timestamps
  const start = typeof form.startTime === 'string'
    ? new Date(form.startTime).getTime()
    : form.startTime
  const end = typeof form.endTime === 'string'
    ? new Date(form.endTime).getTime()
    : form.endTime

  // Basic validation
  if (!start || !end) return 'pending'

  // Calculate preview status based on current time
  if (now >= end) return 'voting'
  if (now >= start) return 'active'
  return 'pending'
}

// Computed stage status (preview only - real status from backend)
const stageStatus: ComputedRef<StageStatus> = computed(() => {
  return previewStageStatus(editForm.value)
})

const stageStatusText: ComputedRef<string> = computed(() => {
  return getStageStatusText(stageStatus.value)
})

// Methods
function handleClose(): void {
  localVisible.value = false
  emit('close')
}

function handleSave(): void {
  emit('save', editForm.value)
}

function handleClearError(): void {
  emit('clear-error')
}

// ===== Watchers for Alerts =====

/**
 * Watch stageFormError and show error alert when it changes
 */
watch(() => props.stageFormError, (error) => {
  // Clear previous alerts first
  clearAlerts()

  // Add error alert if exists
  if (error) {
    addAlert({
      type: 'error',
      title: error.title || '操作失敗',
      message: error.message,
      closable: true
    })
  }

  // Add voting lock warning if applicable (always check this together)
  if (props.isVotingLocked && editForm.value.stageId) {
    addAlert({
      type: 'warning',
      title: '本階段已不接受調整時間',
      message: '該階段已有投票紀錄，無法修改時間。如需調整請聯繫系統管理員。',
      closable: false
    })
  }
}, { immediate: true })

/**
 * Watch isVotingLocked and editForm.stageId together
 */
watch([() => props.isVotingLocked, () => editForm.value.stageId], ([locked, stageId]) => {
  // Only add voting lock warning if no error exists (error takes priority)
  if (!props.stageFormError) {
    clearAlerts()

    if (locked && stageId) {
      addAlert({
        type: 'warning',
        title: '本階段已不接受調整時間',
        message: '該階段已有投票紀錄，無法修改時間。如需調整請聯繫系統管理員。',
        closable: false
      })
    }
  }
})

/**
 * Watch drawer visibility - clear alerts when closed
 */
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    clearAlerts()
  }
})
</script>

<style scoped>
.drawer-body {
  padding: 24px;
}

.form-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #606266;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #409eff;
}

.form-input:disabled {
  background-color: #f5f7fa;
  cursor: not-allowed;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.status-badge.status-pending {
  background: #e6f7ff;
  color: #1890ff;
}

.status-badge.status-active {
  background: #f6ffed;
  color: #52c41a;
}

.status-badge.status-completed {
  background: #f0f0f0;
  color: #8c8c8c;
}

.status-help {
  color: #909399;
  font-size: 12px;
}

.form-section {
  margin: 24px 0;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.form-section h5 {
  margin: 0 0 16px 0;
  color: #2c3e50;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */
</style>
