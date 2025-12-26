<template>
  <el-drawer
    :model-value="visible"
    title="批次更新成員角色"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >
    <div class="drawer-body" v-loading="loading" element-loading-text="更新中...">
      <!-- Info Section -->
      <div class="info-section">
        <div class="info-icon">
          <i class="fas fa-user-tag"></i>
        </div>
        <h3 class="info-title">批次更新成員角色</h3>
        <p class="info-text">
          您即將更新群組「<strong>{{ groupName }}</strong>」中的成員角色。
          <br>
          請確認以下變更，如需修改請關閉此視窗回到列表調整。
        </p>
      </div>

      <!-- Changes List Section -->
      <div class="form-section">
        <h4><i class="fas fa-exchange-alt"></i> 角色變更清單 ({{ changeCount }} 項變更)</h4>

        <div class="changes-list">
          <div
            v-for="change in changedMembers"
            :key="change.userEmail"
            class="change-item"
            :class="{ 'promote': change.isPromote, 'demote': change.isDemote }"
          >
            <el-avatar
              :src="getAvatarUrl(change)"
              :size="48"
              class="member-avatar-img"
              @error="(e: Event) => {
                const target = e.target as HTMLImageElement
                if (target) target.src = generateInitialsAvatar(change)
              }"
            >
              {{ change.displayName?.charAt(0) || change.userEmail.charAt(0) }}
            </el-avatar>
            <div class="member-info">
              <div class="member-name">{{ change.displayName || change.userEmail }}</div>
              <div class="member-email">{{ change.userEmail }}</div>
            </div>
            <div class="role-change">
              <el-tag :type="change.oldRole === 'leader' ? 'warning' : 'info'" size="default">
                <i :class="change.oldRole === 'leader' ? 'fas fa-crown' : 'fas fa-user'"></i>
                {{ change.oldRole === 'leader' ? '組長' : '成員' }}
              </el-tag>
              <i class="fas fa-arrow-right arrow-icon"></i>
              <el-tag :type="change.newRole === 'leader' ? 'warning' : 'info'" size="default">
                <i :class="change.newRole === 'leader' ? 'fas fa-crown' : 'fas fa-user'"></i>
                {{ change.newRole === 'leader' ? '組長' : '成員' }}
              </el-tag>
            </div>
          </div>
        </div>

        <div v-if="unchangedMembers.length > 0" class="unchanged-hint">
          <i class="fas fa-info-circle"></i>
          另有 {{ unchangedMembers.length }} 位成員角色無變更，不會受影響
        </div>
      </div>

      <!-- Summary Section -->
      <div class="form-section summary-section">
        <h4><i class="fas fa-chart-pie"></i> 變更摘要</h4>

        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">總選中</div>
            <div class="summary-value">{{ members.length }} 人</div>
          </div>
          <div class="summary-item promote-bg">
            <div class="summary-label">升為組長</div>
            <div class="summary-value promote">{{ promoteCount }} 人</div>
          </div>
          <div class="summary-item demote-bg">
            <div class="summary-label">降為成員</div>
            <div class="summary-value demote">{{ demoteCount }} 人</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">無變更</div>
            <div class="summary-value unchanged">{{ unchangedCount }} 人</div>
          </div>
        </div>
      </div>

      <!-- Confirmation Input Section -->
      <div class="form-section confirmation-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>

        <div class="confirmation-group">
          <div class="confirmation-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>此操作將變更 <strong>{{ changeCount }}</strong> 位成員的角色權限，請謹慎確認</span>
          </div>

          <div class="form-group">
            <label class="confirmation-label">
              請輸入 <code>UPDATE</code> 以確認執行批次更新：
            </label>
            <el-input
              v-model="confirmationText"
              placeholder="請輸入 UPDATE"
              size="large"
              :disabled="loading"
              class="confirmation-code-input"
              @input="confirmationText = String($event).toUpperCase()"
              @keyup.enter="handleConfirm"
            />
            <div class="input-hint">
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
          :disabled="!canConfirm || loading"
          @click="handleConfirm"
        >
          <i class="fas fa-check"></i>
          確認更新 ({{ changeCount }} 人)
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

interface MemberWithChange {
  userEmail: string
  displayName?: string
  membershipId?: string
  role: 'member' | 'leader'  // For compatibility
  oldRole: 'member' | 'leader'  // Original role
  newRole: 'member' | 'leader'  // New role (after pending changes)
  joinTime?: number
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, any>
}

interface Props {
  visible: boolean
  members: MemberWithChange[]
  groupName: string
  loading?: boolean
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', updates: Array<{ userEmail: string; newRole: 'member' | 'leader' }>): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<Emits>()

// Confirmation text
const confirmationText = ref('')

// Reset confirmation text when drawer opens/closes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    confirmationText.value = ''
  }
})

// Calculate changed members (only those with role differences)
const changedMembers = computed(() => {
  return props.members
    .filter(m => m.oldRole !== m.newRole)
    .map(m => ({
      ...m,
      isPromote: m.oldRole === 'member' && m.newRole === 'leader',
      isDemote: m.oldRole === 'leader' && m.newRole === 'member'
    }))
})

// Calculate unchanged members
const unchangedMembers = computed(() => {
  return props.members.filter(m => m.oldRole === m.newRole)
})

// Statistics
const changeCount = computed(() => {
  return changedMembers.value.length
})

const unchangedCount = computed(() => {
  return unchangedMembers.value.length
})

const promoteCount = computed(() => {
  return changedMembers.value.filter(c => c.isPromote).length
})

const demoteCount = computed(() => {
  return changedMembers.value.filter(c => c.isDemote).length
})

const canConfirm = computed(() => {
  return confirmationText.value.trim().toUpperCase() === 'UPDATE' && changeCount.value > 0
})

const handleConfirm = () => {
  if (!canConfirm.value || props.loading) {
    return
  }

  // Build updates array from changed members (only those with actual changes)
  const updates = changedMembers.value.map(c => ({
    userEmail: c.userEmail,
    newRole: c.newRole
  }))

  emit('confirm', updates)
}

const handleClose = () => {
  if (!props.loading) {
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
  max-width: 1000px;
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
   CHANGES LIST
   ============================================================================ */

.changes-list {
  max-height: 500px;
  overflow-y: auto;
  border: 2px solid #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s;
  border-left: 4px solid transparent;
}

.change-item:last-child {
  margin-bottom: 0;
}

.change-item.promote {
  border-left-color: #ff9800;
  background: #fff3e0;
}

.change-item.demote {
  border-left-color: #2196f3;
  background: #e3f2fd;
}

.change-item:hover {
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

.role-change {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.arrow-icon {
  color: #999;
  font-size: 16px;
}

.unchanged-hint {
  margin-top: 16px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.unchanged-hint i {
  color: #999;
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

.summary-item.promote-bg {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
}

.summary-item.demote-bg {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
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
  color: #333;
}

.summary-value.promote {
  color: #ff9800;
}

.summary-value.demote {
  color: #2196f3;
}

.summary-value.unchanged {
  color: #9e9e9e;
}

/* ============================================================================
   CONFIRMATION SECTION
   ============================================================================ */

.confirmation-section {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border: 2px solid #ff9800;
}

.confirmation-section h4 {
  color: #e65100;
}

.confirmation-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.confirmation-warning {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border-left: 4px solid #ff9800;
  font-size: 15px;
  color: #e65100;
  font-weight: 500;
}

.confirmation-warning i {
  font-size: 24px;
  color: #ff9800;
}

.confirmation-warning strong {
  font-weight: 700;
  color: #e65100;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirmation-label {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.confirmation-label code {
  background: #e65100;
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-weight: 700;
  font-size: 14px;
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

.input-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.input-hint i {
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
  min-width: 200px;
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

  .change-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .role-change {
    width: 100%;
    justify-content: center;
  }

  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .drawer-actions {
    flex-direction: column;
  }

  .drawer-actions .el-button {
    width: 100%;
  }
}
</style>
