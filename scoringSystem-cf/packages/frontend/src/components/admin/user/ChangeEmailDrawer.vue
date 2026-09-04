<template>
  <el-drawer
    :model-value="visible"
    direction="ttb"
    size="100%"
    :before-close="handleClose"
    class="drawer-maroon"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-at"></i>
          變更登入 Email
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div v-loading="changing" class="drawer-body" element-loading-text="變更中，請勿關閉視窗...">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 使用者資訊 -->
      <div v-if="user" class="form-section">
        <h4><i class="fas fa-user"></i> 使用者資訊</h4>
        <div class="info-item">
          <span class="label">目前 Email:</span>
          <span class="value mono">{{ user.userEmail }}</span>
        </div>
        <div class="info-item">
          <span class="label">顯示名稱:</span>
          <span class="value">{{ user.displayName || '-' }}</span>
        </div>
        <div class="info-item">
          <span class="label">帳號狀態:</span>
          <span class="value" :class="user.status === 'active' ? 'status-active' : 'status-inactive'">
            {{ user.status === 'active' ? '活躍' : '停用' }}
          </span>
        </div>
      </div>

      <!-- 關聯資料掃描 -->
      <div class="form-section">
        <h4>
          <i class="fas fa-magnifying-glass-chart"></i> 關聯資料掃描
          <el-button
            size="small"
            :loading="scanning"
            :disabled="changing"
            class="rescan-button"
            @click="runScan"
          >
            <i class="fas fa-rotate"></i>
            重新掃描
          </el-button>
        </h4>

        <p class="section-hint">
          變更 Email 會同時改寫下列資料。系統對 <code>users</code> 沒有外鍵，
          Email 是散在各表的字串——若不一起改，錢包餘額（由交易紀錄現算）與權限都會歸零。
        </p>

        <div class="stats-grid">
          <AnimatedStatistic title="錢包交易筆數" :value="impact?.totals.wallet ?? 0" :loading="scanning" />
          <AnimatedStatistic title="錢包餘額" :value="impact?.walletBalance ?? 0" :loading="scanning" />
          <AnimatedStatistic title="權限與存取" :value="impact?.totals.permission ?? 0" :loading="scanning" />
          <AnimatedStatistic title="活動紀錄" :value="impact?.totals.record ?? 0" :loading="scanning" />
          <AnimatedStatistic title="合計改寫筆數" :value="impact?.totals.all ?? 0" :loading="scanning" />
        </div>

        <el-collapse v-if="impact && impact.items.length > 0" class="detail-collapse">
          <el-collapse-item :title="`逐項明細（${impact.items.length} 類）`" name="detail">
            <el-table :data="impact.items" size="small" stripe>
              <el-table-column prop="label" label="項目" min-width="200" />
              <el-table-column label="分類" width="120">
                <template #default="{ row }">
                  <el-tag :type="CATEGORY_TAG[row.category as ImpactCategory]" size="small" disable-transitions>
                    {{ CATEGORY_LABEL[row.category as ImpactCategory] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="count" label="筆數" width="90" align="right" />
            </el-table>
          </el-collapse-item>
        </el-collapse>

        <EmptyState
          v-else-if="impact"
          parent-icon="fa-database"
          :icons="['fa-info-circle']"
          title="這個帳號沒有任何關聯資料"
          :compact="true"
          :enable-animation="false"
        />

        <div class="audit-note">
          <i class="fas fa-shield-halved"></i>
          系統日誌、事件日誌與寄信記錄<strong>不會</strong>被改寫——它們記錄的是當時發生過什麼，
          會保留舊 Email 作為稽核軌跡。
        </div>
      </div>

      <!-- 新 Email -->
      <div class="form-section">
        <h4><i class="fas fa-at"></i> 新的 Email</h4>
        <div class="form-group">
          <el-input
            v-model="newEmail"
            placeholder="輸入新的登入 Email"
            size="large"
            clearable
            :disabled="changing"
          >
            <template #prefix>
              <i class="fas fa-at"></i>
            </template>
          </el-input>
          <div v-if="newEmail && emailError" class="field-error">
            <i class="fas fa-circle-exclamation"></i>
            {{ emailError }}
          </div>
          <div v-else-if="normalizedEmail && normalizedEmail !== newEmail.trim()" class="field-hint">
            <i class="fas fa-info-circle"></i>
            會以小寫儲存：<code>{{ normalizedEmail }}</code>
          </div>
          <div v-else class="field-hint">
            <i class="fas fa-info-circle"></i>
            系統會以小寫儲存 Email，且不能與其他帳號重複。
          </div>
        </div>

        <div v-if="user && normalizedEmail && !emailError" class="change-preview">
          <span class="mono old">{{ user.userEmail }}</span>
          <i class="fas fa-arrow-right"></i>
          <span class="mono new">{{ normalizedEmail }}</span>
        </div>
      </div>

      <!-- 安全確認 -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
        <ConfirmationInput
          v-model="confirmText"
          keyword="CHANGE"
          hint-action="變更 Email"
          :disabled="changing || !impact"
          @confirm="handleConfirm"
        >
          <template #hint>
            輸入 <strong>CHANGE</strong> 變更 Email
            <template v-if="impact"> ｜ 此操作將改寫 {{ impact.totals.all }} 筆關聯資料</template>
            <template v-else> ｜ 掃描完成後才能確認</template>
          </template>
        </ConfirmationInput>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          size="large"
          :loading="changing"
          :disabled="!canConfirm || changing"
          @click="handleConfirm"
        >
          <i class="fas fa-at"></i>
          確認變更 Email
        </el-button>

        <el-button size="large" :disabled="changing" @click="handleCancel">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useUserEmailImpact, type UserEmailImpact } from '@/composables/admin/useUserMutations'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()

type ImpactCategory = 'wallet' | 'permission' | 'record'

const CATEGORY_LABEL: Record<ImpactCategory, string> = {
  wallet: '錢包',
  permission: '權限',
  record: '紀錄'
}

const CATEGORY_TAG: Record<ImpactCategory, 'danger' | 'warning' | 'info'> = {
  wallet: 'danger',
  permission: 'warning',
  record: 'info'
}

export interface User {
  userId?: string
  userEmail: string
  displayName?: string | null
  status?: string
}

export interface Props {
  visible: boolean
  user?: User | null
  changing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  user: null,
  changing: false
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'confirm': [data: { userEmail: string; newEmail: string }]
}>()

const emailImpactMutation = useUserEmailImpact()

// Form state
const newEmail = ref('')
const confirmText = ref('')

// Scan state
const impact = ref<UserEmailImpact | null>(null)
const scanning = ref(false)

// Backend normalises with trim + lowercase, mirror it so the preview is honest
const normalizedEmail = computed(() => newEmail.value.trim().toLowerCase())

const emailError = computed(() => {
  const value = normalizedEmail.value
  if (!value) return ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Email 格式不正確'
  if (value.length > 100) return 'Email 不能超過 100 個字元'
  if (props.user && value === props.user.userEmail) return '與目前的 Email 相同'
  return ''
})

// Confirmation is gated on a finished scan: nobody approves a rewrite whose
// size they have not seen
const canConfirm = computed(() => {
  return Boolean(props.user)
    && Boolean(impact.value)
    && Boolean(normalizedEmail.value)
    && !emailError.value
    && confirmText.value === 'CHANGE'
})

// Methods
const runScan = async () => {
  if (!props.user || scanning.value) return

  scanning.value = true
  try {
    impact.value = await emailImpactMutation.mutateAsync({ userEmail: props.user.userEmail })
  } catch {
    // Error message already shown by the mutation's onError handler
    impact.value = null
  } finally {
    scanning.value = false
  }
}

const handleConfirm = () => {
  if (!canConfirm.value || props.changing || !props.user) return

  emit('confirm', {
    userEmail: props.user.userEmail,
    newEmail: normalizedEmail.value
  })
}

const handleCancel = () => {
  if (props.changing) return
  emit('update:visible', false)
}

const handleClose = (done: () => void) => {
  if (props.changing) return
  done()
}

const resetForm = () => {
  newEmail.value = ''
  confirmText.value = ''
  impact.value = null
}

// ===== Watchers =====

watch(() => props.visible, (newVal) => {
  if (newVal) {
    resetForm()
    clearAlerts()

    const userDisplay = props.user?.displayName || props.user?.userEmail || '未知用戶'
    addAlert({
      type: 'warning',
      title: `警告：即將變更「${userDisplay}」的登入 Email`,
      message: [
        '這是一個敏感操作：',
        '• 該使用者下次必須改用新的 Email 登入（現有登入狀態不會被中斷）',
        '• 下方掃描到的每一筆資料都會在同一個交易裡改寫，全部成功或全部不動',
        '• 此操作無法自動復原，只能再改回來'
      ].join('\n'),
      closable: false
    })

    // 開啟即掃描：筆數是這個抽屜的重點，不該再多按一次才看得到
    runScan()
  } else {
    clearAlerts()
  }
})
</script>

<style scoped>
/* Drawer Body - 使用統一樣式 */
.drawer-body {
  padding: 0;
  max-width: 900px;
  margin: 0 auto;
}

.form-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-section h4 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.rescan-button {
  margin-left: auto;
}

.section-hint {
  margin: 0 0 16px 0;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.section-hint code,
.field-hint code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  color: #303133;
  font-family: 'Courier New', monospace;
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
  word-break: break-all;
}

.mono {
  font-family: 'Courier New', monospace;
}

.status-active {
  color: #67c23a;
  font-weight: 600;
}

.status-inactive {
  color: #f56c6c;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.detail-collapse {
  margin-top: 16px;
}

.audit-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 12px;
  background: #f0f9eb;
  border-left: 4px solid #67c23a;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: #529b2e;
}

.audit-note i {
  margin-top: 2px;
}

.form-group {
  margin: 0;
}

.field-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.field-error {
  margin-top: 8px;
  font-size: 13px;
  color: #c82333;
  line-height: 1.5;
}

.change-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  margin-top: 16px;
  background: #fff5f5;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  word-break: break-all;
}

.change-preview .old {
  color: #909399;
  text-decoration: line-through;
}

.change-preview .new {
  color: #c82333;
  font-weight: 700;
}

.change-preview i {
  color: #909399;
}

/* Drawer footer - Using unified .drawer-actions from drawer-unified.scss */

@media (max-width: 768px) {
  .form-section h4 {
    flex-wrap: wrap;
  }

  .rescan-button {
    margin-left: 0;
  }

  .info-item {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
