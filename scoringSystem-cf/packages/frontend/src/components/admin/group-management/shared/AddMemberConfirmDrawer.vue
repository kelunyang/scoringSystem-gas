<template>
  <el-drawer
    :model-value="visible"
    title="確認新增成員"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >
    <div class="drawer-body" v-loading="loading" element-loading-text="處理中...">
      <!-- Info Section -->
      <div class="info-section">
        <div class="info-icon">
          <i class="fas fa-user-plus"></i>
        </div>
        <h3 class="info-title">新增群組成員</h3>
        <p class="info-text">
          您即將新增以下成員到群組「<strong>{{ groupName }}</strong>」。
          <br>
          請確認以下名單，如需修改請關閉此視窗回到列表調整。
        </p>
      </div>

      <!-- Members List Section -->
      <div class="form-section">
        <h4><i class="fas fa-users"></i> 待新增成員清單 ({{ members.length }} 人)</h4>

        <div class="members-preview">
          <div
            v-for="member in members"
            :key="member.userEmail"
            class="member-preview-item"
          >
            <el-avatar
              :src="getAvatarUrl(member)"
              :size="48"
              class="member-avatar-img"
              @error="(e: Event) => {
                const target = e.target as HTMLImageElement
                if (target) target.src = generateInitialsAvatar(member)
              }"
            >
              {{ member.displayName?.charAt(0) || member.userEmail.charAt(0) }}
            </el-avatar>
            <div class="member-info">
              <div class="member-name">{{ member.displayName || member.userEmail }}</div>
              <div class="member-email">{{ member.userEmail }}</div>
              <div class="member-role">
                <el-tag type="info" size="small">
                  <i class="fas fa-user"></i>
                  成員
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Section -->
      <div class="form-section summary-section">
        <h4><i class="fas fa-chart-pie"></i> 新增摘要</h4>

        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">待新增人數</div>
            <div class="summary-value">{{ members.length }} 人</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">新增角色</div>
            <div class="summary-value">成員</div>
          </div>
        </div>
      </div>

      <!-- Confirmation Input Section -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>

        <div class="confirmation-group">
          <div class="confirmation-warning">
            <i class="fas fa-info-circle"></i>
            <span>此操作將新增 <strong>{{ members.length }}</strong> 位成員到群組</span>
          </div>

          <div class="form-group">
            <label class="confirmation-label">
              請輸入 <code class="confirmation-code">ADD</code> 以確認新增操作
              <span class="required">*</span>
            </label>
            <el-input
              v-model="confirmationText"
              placeholder="請輸入 ADD"
              clearable
              size="large"
              class="confirmation-code-input"
              @input="confirmationText = String($event).toUpperCase()"
              @keyup.enter="handleConfirm"
            />
            <div class="confirmation-hint">
              <i class="fas fa-keyboard"></i>
              輸入完成後按 Enter 或點擊下方按鈕執行
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          size="large"
          :disabled="!isConfirmationValid || loading"
          @click="handleConfirm"
        >
          <i class="fas fa-user-plus"></i>
          確認新增 ({{ members.length }} 人)
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
import { getAvatarUrl, generateInitialsAvatar } from '@/utils/avatar'

interface Member {
  userEmail: string
  displayName?: string
  role?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, any>
}

interface Props {
  visible: boolean
  members: Member[]
  groupName: string
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
  return confirmationText.value.toUpperCase() === 'ADD'
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
   INFO SECTION
   ============================================================================ */

.info-section {
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
  padding: 32px;
  border-radius: 12px;
  margin-bottom: 24px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(44, 90, 160, 0.3);
}

.info-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.info-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 16px 0;
}

.info-text {
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
}

.info-text strong {
  font-weight: 700;
  color: #ffeb3b;
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
  color: #2c5aa0;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ============================================================================
   MEMBERS PREVIEW
   ============================================================================ */

.members-preview {
  max-height: 400px;
  overflow-y: auto;
  border: 2px solid #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}

.member-preview-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s;
  border-left: 4px solid #2c5aa0;
}

.member-preview-item:last-child {
  margin-bottom: 0;
}

.member-preview-item:hover {
  background: #f5f5f5;
  transform: translateX(4px);
}

.member-avatar-img {
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.member-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-email {
  font-size: 13px;
  color: #999;
  font-family: 'Courier New', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role {
  margin-top: 4px;
}

/* ============================================================================
   SUMMARY SECTION
   ============================================================================ */

.summary-section {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border: 2px solid #2196f3;
}

.summary-section h4 {
  color: #1565c0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
}

.summary-item {
  text-align: center;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.summary-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: #2c5aa0;
}

/* ============================================================================
   CONFIRMATION INPUT
   ============================================================================ */

.confirmation-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirmation-warning {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #e3f2fd;
  border-radius: 8px;
  border-left: 4px solid #2196f3;
  font-size: 15px;
  color: #1565c0;
  font-weight: 500;
}

.confirmation-warning i {
  font-size: 24px;
  color: #2196f3;
}

.confirmation-warning strong {
  font-weight: 700;
  color: #0d47a1;
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
  background: #2c5aa0;
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
}

.required {
  color: #ff4d4f;
  margin-left: 4px;
}

.confirmation-input {
  width: 100%;
}

.confirmation-input :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  font-size: 16px;
  text-align: center;
  text-transform: uppercase;
}

.confirmation-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.confirmation-hint i {
  color: #999;
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

  .info-section {
    padding: 24px 16px;
  }

  .info-icon {
    font-size: 48px;
  }

  .info-title {
    font-size: 20px;
  }

  .drawer-actions {
    flex-direction: column;
  }

  .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
