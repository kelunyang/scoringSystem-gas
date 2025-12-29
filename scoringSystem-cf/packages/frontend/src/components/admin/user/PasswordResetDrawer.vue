<template>
  <el-drawer
    :model-value="visible"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-key"></i>
          重設用戶密碼
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- User Info -->
      <div v-if="user" class="user-info-display">
        <h4>使用者資訊</h4>
        <div class="info-item">
          <span class="label">Email:</span>
          <span class="value">{{ user.userEmail }}</span>
        </div>
        <div class="info-item">
          <span class="label">顯示名稱:</span>
          <span class="value">{{ user.displayName || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="label">帳戶狀態:</span>
          <span class="value" :class="user.status === 'active' ? 'status-active' : 'status-inactive'">
            {{ user.status === 'active' ? '活躍' : '停用' }}
          </span>
        </div>
      </div>

      <!-- Confirmation Input -->
      <div class="form-group">
        <label>確認操作：請輸入 <code>RESET</code> 以繼續 *</label>
        <el-input
          v-model="confirmText"
          placeholder="輸入 RESET"
          class="confirmation-code-input"
          @input="confirmText = String($event).toUpperCase()"
          @keyup.enter="handleConfirm"
        />
        <p class="help-text">
          此安全措施確保您了解操作的影響
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          :loading="resetting"
          :disabled="!canConfirmReset"
          @click="handleConfirm"
        >
          <i class="fas fa-key"></i>
          確認重設密碼
        </el-button>

        <el-button @click="handleCancel">
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

export interface User {
  userId?: string
  userEmail: string
  displayName?: string
  status?: string
}

export interface Props {
  visible: boolean
  user?: User | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  user: null
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'confirm': [data: { userEmail: string }]
}>()

// Form state
const confirmText = ref('')
const resetting = ref(false)

// Computed
const canConfirmReset = computed(() => {
  return confirmText.value.toUpperCase() === 'RESET'
})

// Methods
const handleConfirm = async () => {
  if (!canConfirmReset.value || !props.user) return

  resetting.value = true

  try {
    emit('confirm', {
      userEmail: props.user.userEmail
    })
  } finally {
    resetting.value = false
  }
}

const handleCancel = () => {
  emit('update:visible', false)
  resetForm()
}

const handleClose = (done: () => void) => {
  if (resetting.value) {
    return
  }
  resetForm()
  done()
}

const resetForm = () => {
  confirmText.value = ''
}

// ===== Watchers =====

/**
 * 當抽屜開啟/關閉時管理 alerts
 */
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // 開啟時重置表單
    resetForm()

    // 清除舊的 alerts
    clearAlerts()

    // 添加警告訊息
    const userDisplay = props.user?.displayName || props.user?.userEmail || '未知用戶'
    addAlert({
      type: 'warning',
      title: `警告：此操作將重設用戶「${userDisplay}」的密碼`,
      message: '這是一個敏感操作，將會：\n• 系統自動產生一組安全的隨機密碼\n• 新密碼將透過電子郵件發送給該使用者\n• 此操作無法復原',
      closable: false
    })
  } else {
    // 關閉時清除所有 alerts
    clearAlerts()
  }
})
</script>

<style scoped>
/* Drawer Body - 使用統一樣式 */
.drawer-body {
  padding: 0;
  max-width: 800px;
  margin: 0 auto;
}

.user-info-display {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.user-info-display h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.info-item {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #e4e7ed;
}

.info-item:last-child {
  border-bottom: none;
}

.info-item .label {
  flex: 0 0 120px;
  font-weight: 600;
  color: #606266;
}

.info-item .value {
  flex: 1;
  color: #303133;
}

.status-active {
  color: #67c23a;
  font-weight: 600;
}

.status-inactive {
  color: #f56c6c;
  font-weight: 600;
}

.selected-users-preview {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  max-height: 300px;
  overflow-y: auto;
}

.selected-users-preview h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.user-email-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.user-email-list li {
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
  margin-bottom: 8px;
  color: #606266;
  font-family: 'Courier New', monospace;
}

.user-email-list li:last-child {
  margin-bottom: 0;
}

.form-group {
  margin: 20px 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

.form-group code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  color: #e6a23c;
  font-weight: 700;
}

.help-text {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

/* Drawer footer - Using unified .drawer-actions from drawer-unified.scss */

/* Drawer navy theme */
:deep(.drawer-navy) {
  --el-drawer-bg-color: #1a2332;
}

:deep(.drawer-navy .el-drawer__header) {
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 0;
  padding-bottom: 20px;
}

:deep(.drawer-navy .el-drawer__title) {
  color: white;
  font-size: 20px;
  font-weight: 600;
}

:deep(.drawer-navy .el-drawer__close-btn) {
  color: white;
}

:deep(.drawer-navy .el-drawer__body) {
  background: white;
  padding: 0;
}
</style>
