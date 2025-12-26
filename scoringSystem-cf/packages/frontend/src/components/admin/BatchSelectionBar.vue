<template>
  <el-affix :offset="0">
    <div v-if="selectedCount > 0" class="batch-selection-bar">
      <div class="selection-info">
        <el-icon class="info-icon"><InfoFilled /></el-icon>
        <span class="selection-text">
          已選擇 <strong>{{ selectedCount }}</strong> 位使用者
        </span>
        <el-button type="warning" size="small" @click="handleClearSelection">
          <i class="fas fa-times-circle"></i> 清除選擇
        </el-button>
      </div>

      <div class="batch-actions">
        <!-- Batch Activate -->
        <el-button
          type="success"
          :icon="CircleCheck"
          :loading="batchUpdatingStatus"
          :disabled="batchUpdatingStatus || batchResettingPassword"
          @click="handleBatchActivate"
        >
          批量啟用
        </el-button>

        <!-- Batch Deactivate -->
        <el-button
          type="warning"
          :icon="CircleClose"
          :loading="batchUpdatingStatus"
          :disabled="batchUpdatingStatus || batchResettingPassword"
          @click="handleBatchDeactivate"
        >
          批量停用
        </el-button>

        <!-- Batch Reset Password -->
        <el-popover
          placement="top"
          :width="400"
          trigger="click"
        >
          <template #reference>
            <el-button
              type="primary"
              :icon="Lock"
              :loading="batchResettingPassword"
              :disabled="batchUpdatingStatus || batchResettingPassword"
            >
              批量重設密碼
            </el-button>
          </template>

          <div class="password-reset-form">
            <h4>批量重設密碼</h4>
            <p class="warning-text">
              <el-icon><Warning /></el-icon>
              即將為 {{ selectedCount }} 位使用者重設密碼
            </p>

            <el-form :model="resetForm" :rules="resetRules" ref="resetFormRef">
              <el-form-item label="新密碼" prop="newPassword">
                <el-input
                  v-model="resetForm.newPassword"
                  type="password"
                  placeholder="請輸入新密碼（至少 8 字元）"
                  show-password
                  clearable
                />
              </el-form-item>

              <el-form-item label="確認密碼" prop="confirmPassword">
                <el-input
                  v-model="resetForm.confirmPassword"
                  type="password"
                  placeholder="請再次輸入新密碼"
                  show-password
                  clearable
                />
              </el-form-item>

              <el-form-item>
                <el-checkbox v-model="resetForm.sendEmail">
                  發送郵件通知使用者
                </el-checkbox>
              </el-form-item>
            </el-form>

            <div class="form-actions">
              <el-button @click="handleCancelReset">取消</el-button>
              <el-button
                type="primary"
                :loading="batchResettingPassword"
                @click="handleConfirmReset"
              >
                確認重設
              </el-button>
            </div>
          </div>
        </el-popover>

        <!-- Export Selected -->
        <el-dropdown @command="handleExportCommand">
          <el-button :icon="Download">
            匯出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">
                <el-icon><Document /></el-icon>
                匯出為 CSV
              </el-dropdown-item>
              <el-dropdown-item command="json">
                <el-icon><Document /></el-icon>
                匯出為 JSON
              </el-dropdown-item>
              <el-dropdown-item command="emails">
                <el-icon><Message /></el-icon>
                複製電子郵件清單
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </el-affix>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  InfoFilled,
  CircleCheck,
  CircleClose,
  Lock,
  Warning,
  Download,
  ArrowDown,
  Document,
  Message
} from '@element-plus/icons-vue'

interface Props {
  selectedCount: number
  batchUpdatingStatus: boolean
  batchResettingPassword: boolean
}

interface Emits {
  (e: 'clear-selection'): void
  (e: 'batch-activate'): void
  (e: 'batch-deactivate'): void
  (e: 'batch-reset-password', password: string): void
  (e: 'export', format: 'csv' | 'json' | 'emails'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Password reset form
const resetFormRef = ref<FormInstance>()
const resetForm = reactive({
  newPassword: '',
  confirmPassword: '',
  sendEmail: true
})

const validatePasswordMatch = (rule: any, value: any, callback: any) => {
  if (value === '') {
    callback(new Error('請再次輸入密碼'))
  } else if (value !== resetForm.newPassword) {
    callback(new Error('兩次輸入的密碼不一致'))
  } else {
    callback()
  }
}

const resetRules: FormRules = {
  newPassword: [
    { required: true, message: '請輸入新密碼', trigger: 'blur' },
    { min: 8, message: '密碼至少需要 8 個字元', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '請再次輸入密碼', trigger: 'blur' },
    { validator: validatePasswordMatch, trigger: 'blur' }
  ]
}

// Event handlers
const handleClearSelection = () => {
  emit('clear-selection')
}

const handleBatchActivate = async () => {
  try {
    await ElMessageBox.confirm(
      `確定要啟用所選的 ${props.selectedCount} 位使用者嗎？`,
      '批量啟用確認',
      {
        confirmButtonText: '確定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('batch-activate')
  } catch {
    // User cancelled
  }
}

const handleBatchDeactivate = async () => {
  try {
    await ElMessageBox.confirm(
      `確定要停用所選的 ${props.selectedCount} 位使用者嗎？`,
      '批量停用確認',
      {
        confirmButtonText: '確定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('batch-deactivate')
  } catch {
    // User cancelled
  }
}

const handleConfirmReset = async () => {
  if (!resetFormRef.value) return

  await resetFormRef.value.validate((valid) => {
    if (valid) {
      emit('batch-reset-password', resetForm.newPassword)
      resetForm.newPassword = ''
      resetForm.confirmPassword = ''
    }
  })
}

const handleCancelReset = () => {
  resetForm.newPassword = ''
  resetForm.confirmPassword = ''
  resetFormRef.value?.clearValidate()
}

const handleExportCommand = (command: 'csv' | 'json' | 'emails') => {
  emit('export', command)
}
</script>

<style scoped>
.batch-selection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, var(--el-color-primary-light-8) 100%);
  border-bottom: 2px solid var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-icon {
  color: var(--el-color-primary);
  font-size: 20px;
}

.selection-text {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.selection-text strong {
  color: var(--el-color-primary);
  font-size: 16px;
}

.batch-actions {
  display: flex;
  gap: 12px;
}

.password-reset-form {
  padding: 16px;
}

.password-reset-form h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.warning-text {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 16px;
  background-color: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 4px;
  font-size: 13px;
  color: var(--el-color-warning-dark-2);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
