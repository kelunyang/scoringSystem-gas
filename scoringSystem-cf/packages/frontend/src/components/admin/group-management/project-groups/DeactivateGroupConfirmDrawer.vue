<template>
  <el-drawer
    :model-value="visible"
    title="確認停用群組"
    direction="ttb"
    size="100%"
    :before-close="handleClose"
    class="drawer-maroon"
  >
    <div class="drawer-body" v-loading="loading" element-loading-text="處理中...">
      <!-- Warning Section -->
      <div class="warning-section">
        <div class="warning-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 class="warning-title">危險操作警告</h3>
        <p class="warning-text">
          您即將停用群組「<strong>{{ group?.groupName }}</strong>」。
          <br>
          停用後，該群組將<strong class="text-danger">無法參與任何投票和提交</strong>，請謹慎確認。
        </p>
      </div>

      <!-- Group Info Section -->
      <div class="form-section" v-if="group">
        <h4><i class="fas fa-layer-group"></i> 群組資訊</h4>

        <div class="group-info-grid">
          <div class="info-item">
            <span class="info-label">群組名稱</span>
            <span class="info-value">{{ group.groupName }}</span>
          </div>

          <div class="info-item">
            <span class="info-label">組員數</span>
            <span class="info-value">
              <el-tag type="info" size="small">
                {{ group.memberCount || 0 }} 人
              </el-tag>
            </span>
          </div>

          <div class="info-item">
            <span class="info-label">組長數</span>
            <span class="info-value">
              <el-tag type="warning" size="small">
                {{ group.leaderCount || 0 }} 人
              </el-tag>
            </span>
          </div>

          <div class="info-item">
            <span class="info-label">當前狀態</span>
            <span class="info-value">
              <el-tag type="success">
                <i class="fas fa-check-circle"></i>
                活躍
              </el-tag>
            </span>
          </div>

          <div class="info-item">
            <span class="info-label">成員加入設定</span>
            <span class="info-value">
              <el-tag :type="group.allowChange ? 'success' : 'danger'" size="small">
                {{ group.allowChange ? '允許自由加入' : '禁止自由加入' }}
              </el-tag>
            </span>
          </div>
        </div>

        <div class="warning-box">
          <i class="fas fa-info-circle"></i>
          <div>
            <strong>注意：</strong>停用群組後，該群組的所有成員將無法代表此群組進行任何操作。
            若需恢復，可稍後重新啟用此群組。
          </div>
        </div>
      </div>

      <!-- Confirmation Input Section -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>

        <div class="confirmation-group">
          <label class="confirmation-label">
            請輸入 <code class="confirmation-code">DEACTIVE</code> 以確認停用操作
            <span class="required">*</span>
          </label>
          <el-input
            v-model="confirmationText"
            placeholder="請輸入 DEACTIVE"
            clearable
            @keyup.enter="handleConfirm"
          />
          <div class="confirmation-hint">
            <i class="fas fa-info-circle"></i>
            輸入完全符合後才能執行停用操作
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          size="large"
          :disabled="!isConfirmationValid || loading"
          @click="handleConfirm"
        >
          <i class="fas fa-ban"></i>
          確認停用群組
        </el-button>
        <el-button
          size="large"
          @click="handleClose"
          :disabled="loading"
        >
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ProjectGroup } from '@/types/group-management'

export interface Props {
  visible: boolean
  group: ProjectGroup | null
  loading?: boolean
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<Emits>()

const confirmationText = ref('')

const isConfirmationValid = computed(() => {
  return confirmationText.value === 'DEACTIVE'
})

// Reset confirmation text when drawer opens/closes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    confirmationText.value = ''
  }
})

const handleConfirm = () => {
  if (isConfirmationValid.value && !props.loading) {
    emit('confirm')
  }
}

const handleClose = () => {
  if (!props.loading) {
    confirmationText.value = ''
    emit('update:visible', false)
    emit('cancel')
  }
}
</script>

<style scoped>
/* ============================================================================
   DRAWER BODY
   ============================================================================ */

.drawer-body {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

/* ============================================================================
   WARNING SECTION
   ============================================================================ */

.warning-section {
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  color: white;
  padding: 32px;
  border-radius: 12px;
  margin-bottom: 24px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(211, 47, 47, 0.3);
}

.warning-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.warning-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 16px 0;
}

.warning-text {
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
}

.warning-text strong {
  font-weight: 700;
}

.text-danger {
  color: #ffeb3b;
  text-decoration: underline;
}

/* ============================================================================
   FORM SECTION
   ============================================================================ */

.form-section {
  background: white;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-section h4 {
  margin: 0 0 20px 0;
  color: #8b1538;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ============================================================================
   GROUP INFO
   ============================================================================ */

.group-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label {
  font-size: 13px;
  color: #999;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 16px;
  color: #333;
  font-weight: 600;
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fff3cd;
  border-radius: 8px;
  border-left: 4px solid #ffc107;
  margin-top: 24px;
}

.warning-box i {
  color: #ff9800;
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.warning-box strong {
  color: #e65100;
}

/* ============================================================================
   CONFIRMATION INPUT
   ============================================================================ */

.confirmation-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirmation-label {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.confirmation-code {
  background: #f5f5f5;
  padding: 4px 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #d32f2f;
  border: 2px solid #d32f2f;
}

.required {
  color: #ff4d4f;
  margin-left: 4px;
}

.confirmation-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  padding: 12px;
  background: #fff3e0;
  border-radius: 6px;
  border-left: 4px solid #ff9800;
}

.confirmation-hint i {
  color: #ff9800;
}

/* ============================================================================
   ACTION BUTTONS
   ============================================================================ */

.drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 24px;
  border-top: 2px solid #e8e8e8;
  position: sticky;
  bottom: 0;
  background: linear-gradient(to bottom, transparent, white 20%);
  padding-bottom: 12px;
}

.drawer-actions .el-button {
  min-width: 180px;
}

/* ============================================================================
   RESPONSIVE
   ============================================================================ */

@media (max-width: 768px) {
  .drawer-body {
    padding: 16px;
  }

  .warning-section {
    padding: 24px 16px;
  }

  .warning-icon {
    font-size: 48px;
  }

  .warning-title {
    font-size: 20px;
  }

  .group-info-grid {
    grid-template-columns: 1fr;
  }

  .drawer-actions {
    flex-direction: column;
  }

  .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
