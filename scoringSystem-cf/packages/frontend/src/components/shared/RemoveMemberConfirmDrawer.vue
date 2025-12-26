<template>
  <el-drawer
    :model-value="visible"
    title="確認移除成員"
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
          您即將從群組「<strong>{{ groupName }}</strong>」中移除以下成員。
          <br>
          此操作<strong class="text-danger">無法撤銷</strong>，請謹慎確認。
        </p>
      </div>

      <!-- Members List Section -->
      <div class="form-section">
        <h4><i class="fas fa-users"></i> 待移除成員清單 ({{ members.length }} 人)</h4>

        <div class="members-preview">
          <div
            v-for="member in members"
            :key="member.userEmail || member.membershipId"
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
              <div v-if="member.role" class="member-role">
                <el-tag :type="member.role === 'leader' ? 'warning' : 'info'" size="small">
                  {{ member.role === 'leader' ? '組長' : '成員' }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Confirmation Input Section -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>

        <div class="confirmation-group">
          <label class="confirmation-label">
            請輸入 <code class="confirmation-code">REMOVE</code> 以確認移除操作
            <span class="required">*</span>
          </label>
          <el-input
            v-model="confirmationText"
            placeholder="請輸入 REMOVE"
            clearable
            @keyup.enter="handleConfirm"
          />
          <div class="confirmation-hint">
            <i class="fas fa-info-circle"></i>
            輸入完全符合後才能執行移除操作
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
          <i class="fas fa-user-minus"></i>
          確認移除 ({{ members.length }} 人)
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
  membershipId?: string
  role?: string
  joinTime?: number
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
  return confirmationText.value === 'REMOVE'
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
}

.member-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.member-email {
  font-size: 13px;
  color: #999;
  font-family: 'Courier New', monospace;
}

.member-role {
  margin-top: 4px;
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

  .drawer-actions {
    flex-direction: column;
  }

  .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
