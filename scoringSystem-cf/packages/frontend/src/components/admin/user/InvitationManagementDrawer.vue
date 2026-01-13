<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    class="invite-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-ticket-alt"></i>
          邀請碼管理
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 可滚动内容区 -->
      <div class="content-area" v-loading="invitationsLoading">

        <!-- 1. 生成新邀请码区块 -->
        <div class="form-section">
          <h4><i class="fas fa-down-left-and-up-right-to-center"></i> 產生新邀請碼</h4>

          <!-- 表单字段 -->
          <div class="form-group">
            <label>受邀者Email <span class="required">*</span></label>
            <el-input
              type="textarea"
              v-model="inviteForm.targetEmails"
              placeholder="輸入受邀者的Email地址，一行一個"
              :rows="4"
            />
            <div class="help-text">請每行輸入一個Email地址</div>
            <el-tag v-if="validEmailCount > 0" type="success" size="small" style="margin-top: 8px;">
              輸入了 {{ validEmailCount }} 個 Email
            </el-tag>
          </div>

          <div class="form-group">
            <label>有效天數：{{ inviteForm.validDays }} 天</label>
            <el-slider
              v-model="inviteForm.validDays"
              :min="1"
              :max="30"
              :step="1"
              show-stops
              :format-tooltip="(val) => `${val} 天`"
            />
            <div class="help-text">設定邀請碼的有效期限（1-30天）</div>
          </div>

          <div class="form-group">
            <label>預設全域群組</label>
            <el-select
              v-model="inviteForm.defaultGlobalGroups"
              multiple
              filterable
              placeholder="搜尋並選擇預設全域群組"
              style="width: 100%"
              clearable
            >
              <el-option
                v-for="group in globalGroups"
                :key="group.groupId"
                :label="group.groupName"
                :value="group.groupId"
              >
                <div style="display: flex; align-items: center;">
                  <i class="fas fa-crown" style="margin-right: 8px; color: #f39c12;"></i>
                  <span style="font-weight: bold;">{{ group.groupName }}</span>
                  <span style="margin-left: 8px; font-size: 12px; color: #666;">{{ getGlobalGroupPermissionText(group) }}</span>
                </div>
              </el-option>
            </el-select>
            <div class="help-text">新用戶會自動加入這些全域群組</div>

            <!-- 显示已选群组 -->
            <div v-if="inviteForm.defaultGlobalGroups.length > 0" class="selected-groups-display">
              <el-tag
                v-for="groupId in inviteForm.defaultGlobalGroups"
                :key="groupId"
                color="#f39c12"
                closable
                @close="removeDefaultGlobalGroup(groupId)"
                :style="{
                  marginRight: '8px',
                  marginBottom: '4px',
                  color: '#fff',
                  fontWeight: '500'
                }"
              >
                <i class="fas fa-crown" style="margin-right: 4px; color: #fff;"></i>
                {{ getGlobalGroupById(groupId)?.groupName || groupId }}
              </el-tag>
            </div>
          </div>

          <!-- 进度显示 -->
          <div v-if="generating && processingStatus" class="processing-status">
            <i class="fas fa-spinner fa-spin"></i>
            {{ processingStatus }}
          </div>

          <!-- 生成结果展示 -->
          <div v-if="generatedInvite" class="result-section">

            <div class="result-content">
              <!-- 单个邀请码 (旧格式兼容) -->
            <div v-if="generatedInvite.invitationCode" class="invite-code-item">
              <div class="invite-code">{{ generatedInvite.invitationCode }}</div>
                <p>有效期至: {{ formatTime(generatedInvite.expiryTime) }}</p>
                <el-button
                  type="primary"
                  :icon="CopyDocument"
                  @click="copyInviteCode"
                  size="default"
                >
                  複製邀請碼
                </el-button>
              </div>

              <!-- 多个邀请码 -->
              <div v-if="generatedInvite.results" class="invite-codes-list">
                <div v-for="(result, index) in generatedInvite.results" :key="index" class="invite-code-item">
                  <div class="invite-code">{{ result.email }} > {{ result.invitationCode }}</div>
                  <el-button
                    type="primary"
                    size="small"
                    :icon="CopyDocument"
                    @click="copySpecificCode(result.invitationCode)"
                    text
                  >
                    複製
                  </el-button>
                </div>

                <!-- 批量复制按钮 -->
                <div class="batch-actions">
                  <el-button
                    type="primary"
                    :icon="CopyDocument"
                    @click="copyAllCodes"
                  >
                    複製全部邀請碼
                  </el-button>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- 2. 邀请码列表区块 -->
        <div class="form-section">
          <h4><i class="fas fa-list"></i> 邀請碼列表</h4>

          <!-- Admin Filter Toolbar -->
          <AdminFilterToolbar
            variant="default"
            :active-filter-count="activeFilterCount"
            :export-data="exportConfig.data"
            :export-filename="exportConfig.filename"
            :export-headers="exportConfig.headers"
            :export-row-mapper="exportConfig.rowMapper"
            @reset-filters="handleResetFilters"
          >
            <!-- Core Filters (Always Visible) -->
            <template #filters-core>
              <div class="filter-item">
                <span class="filter-label">狀態：</span>
                <el-select
                  v-model="inviteStatusFilter"
                  placeholder="全部狀態"
                  clearable
                  style="width: 180px;"
                >
                  <el-option label="全部狀態" value="" />
                  <el-option label="有效" value="active" />
                  <el-option label="已使用" value="used" />
                  <el-option label="已過期" value="expired" />
                  <el-option label="已停用" value="deactivated" />
                </el-select>
              </div>

              <div class="filter-item">
                <span class="filter-label">搜尋：</span>
                <el-input
                  v-model="inviteSearchText"
                  placeholder="搜尋受邀者或創建者"
                  clearable
                  style="width: 300px;"
                >
                  <template #prefix>
                    <i class="el-icon-search"></i>
                  </template>
                </el-input>
              </div>
            </template>

            <!-- Actions -->
            <template #actions>
              <el-switch
                v-model="showUnusableInvitations"
                active-text="顯示不可用"
                inactive-text="隱藏不可用"
                active-color="#f56c6c"
              />

              <el-tooltip content="重新載入" placement="top">
                <el-button
                  type="default"
                  size="small"
                  :icon="Refresh"
                  @click="loadInvitations"
                  :loading="invitationsLoading"
                >
                  <span class="btn-text">重新載入</span>
                </el-button>
              </el-tooltip>
            </template>
          </AdminFilterToolbar>

          <!-- 表格 -->
        <el-table
          :data="filteredInvitations"
          v-loading="invitationsLoading"
          element-loading-text="載入邀請碼資料中..."
          stripe
          border
          :row-class-name="tableRowClassName"
          empty-text="沒有找到符合條件的邀請碼"
          style="width: 100%"
        >
            <el-table-column prop="targetEmail" label="受邀者">
              <template #default="{ row }">
                <el-text type="primary">{{ row.targetEmail || '-' }}</el-text>
              </template>
            </el-table-column>

            <el-table-column label="狀態" align="center" width="140">
              <template #default="{ row }">
                <el-tooltip :content="getSwitchTooltip(row)" placement="top">
                  <el-switch
                    :model-value="row.status === 'active'"
                    :disabled="!canToggleStatus(row)"
                    :loading="togglingInvites.has(row.invitationId)"
                    active-text="啟用"
                    inactive-text="停用"
                    active-color="#67c23a"
                    inactive-color="#909399"
                    @change="() => handleToggleInviteStatus(row)"
                  />
                </el-tooltip>
              </template>
            </el-table-column>

            <el-table-column label="創建時間">
              <template #default="{ row }">
                {{ formatTime(row.createdTime) }}
              </template>
            </el-table-column>

            <el-table-column label="有效期至">
              <template #default="{ row }">
                {{ formatTime(row.expiryTime) }}
              </template>
            </el-table-column>

            <el-table-column label="操作" fixed="right" align="center" width="240">
              <template #default="{ row }">
                <el-space>
                  <!-- Copy Button -->
                  <el-button
                    type="info"
                    size="small"
                    :icon="CopyDocument"
                    @click="copyInvitationCode(row.invitationCode)"
                  >
                    複製
                  </el-button>

                  <!-- Resend Button -->
                  <el-button
                    v-if="row.status === 'active' && row.targetEmail"
                    type="primary"
                    size="small"
                    :icon="Message"
                    :loading="resendingInvites.has(row.invitationId)"
                    @click="openResendDrawer(row)"
                  >
                    重發郵件
                  </el-button>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 3. 统计区块 -->
        <div class="form-section statistics-section">
          <h4><i class="fas fa-chart-pie"></i> 邀請碼統計</h4>

          <el-row :gutter="16" class="statistics-row">
            <el-col :span="4">
              <AnimatedStatistic title="總計" :value="invitationStats.total" />
            </el-col>
            <el-col :span="4">
              <AnimatedStatistic title="有效" :value="invitationStats.active" />
            </el-col>
            <el-col :span="4">
              <AnimatedStatistic title="已使用" :value="invitationStats.used" />
            </el-col>
            <el-col :span="4">
              <AnimatedStatistic title="已停用" :value="invitationStats.deactivated" />
            </el-col>
            <el-col :span="4">
              <AnimatedStatistic title="已過期" :value="invitationStats.expired" />
            </el-col>
          </el-row>
        </div>

      </div>

      <!-- 固定底部操作按钮 -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          size="large"
          :icon="Plus"
          @click="handleGenerateInvite"
          :loading="generating"
          :disabled="validEmailCount === 0"
        >
          {{ generating ? '生成中...' : '生成邀請碼' }}
        </el-button>
        <el-button size="large" @click="localVisible = false">
          關閉
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- Confirmation Drawer for Status Toggle -->
  <el-drawer
    v-model="confirmDrawerVisible"
    :title="confirmDrawerTitle"
    :direction="confirmDrawerDirection"
    size="100%"
    :class="confirmDrawerClass"
    :append-to-body="true"
  >
    <div class="drawer-body">
      <div class="form-section">
        <h4><i class="fas fa-info-circle"></i> 邀請碼詳細信息</h4>

        <div class="detail-grid" v-if="selectedInvitation">
          <div class="detail-item">
            <span class="detail-label">邀請碼：</span>
            <span class="detail-value code-display">{{ selectedInvitation.invitationCode }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">受邀者：</span>
            <span class="detail-value">{{ selectedInvitation.targetEmail || '-' }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">當前狀態：</span>
            <el-tag :type="getInvitationTagType(selectedInvitation)" size="small">
              {{ getInvitationStatusText(selectedInvitation) }}
            </el-tag>
          </div>

          <div class="detail-item">
            <span class="detail-label">創建時間：</span>
            <span class="detail-value">{{ formatTime(selectedInvitation.createdTime) }}</span>
          </div>

          <div class="detail-item">
            <span class="detail-label">有效期至：</span>
            <span class="detail-value">{{ formatTime(selectedInvitation.expiryTime) }}</span>
          </div>

          <div class="detail-item" v-if="selectedInvitation.defaultGlobalGroups && selectedInvitation.defaultGlobalGroups.length > 0">
            <span class="detail-label">預設全域群組：</span>
            <div class="detail-value">
              <el-tag
                v-for="groupId in selectedInvitation.defaultGlobalGroups"
                :key="groupId"
                size="small"
                style="margin-right: 4px;"
              >
                {{ getGlobalGroupById(groupId)?.groupName || groupId }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- Deactivate Confirmation Section -->
      <div class="form-section" v-if="confirmAction === 'deactivate'">
        <h4><i class="fas fa-exclamation-triangle"></i> 停用確認</h4>

        <el-alert
          type="warning"
          :closable="false"
          style="margin-bottom: 20px;"
        >
          <template #title>此操作將停用此邀請碼</template>
          <div>停用後，此邀請碼將無法用於註冊，但可以重新啟用。</div>
        </el-alert>

        <div class="form-group">
          <label>請輸入 <strong>DEACTIVATE</strong> 來確認停用：</label>
          <el-input
            v-model="confirmationText"
            placeholder="輸入 DEACTIVATE"
            clearable
            @keyup.enter="handleConfirmAction"
          />
          <div class="help-text" :class="{ 'text-success': isConfirmationValid }">
            {{ isConfirmationValid ? '✓ 確認文字正確' : '請輸入正確的確認文字' }}
          </div>
        </div>
      </div>

      <!-- Reactivate Confirmation Section -->
      <div class="form-section" v-if="confirmAction === 'reactivate'">
        <h4><i class="fas fa-check-circle"></i> 重新啟用確認</h4>

        <el-alert
          type="success"
          :closable="false"
          style="margin-bottom: 20px;"
        >
          <template #title>確定要重新啟用此邀請碼嗎？</template>
          <div>重新啟用後，此邀請碼將可以用於註冊（如果尚未過期）。</div>
        </el-alert>
      </div>

      <!-- Drawer Actions -->
      <div class="drawer-actions">
        <el-button
          type="warning"
          :disabled="confirmAction === 'deactivate' && !isConfirmationValid"
          :loading="togglingInvites.has(selectedInvitation?.invitationId || '')"
          @click="handleConfirmAction"
        >
          {{ confirmAction === 'deactivate' ? '確認停用' : '確認重新啟用' }}
        </el-button>
        <el-button size="large" @click="confirmDrawerVisible = false">
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>

  <!-- Resend Email Confirmation Drawer -->
  <el-drawer
    v-model="resendDrawerVisible"
    title="重發邀請郵件"
    direction="btt"
    size="100%"
    class="drawer-navy"
    :append-to-body="true"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i class="fas fa-ticket-alt"></i>
          邀請碼管理
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-envelope"></i>
          重發邀請郵件
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <div class="content-area">
        <!-- Email Status Section -->
        <div class="form-section" v-loading="emailStatusLoading">
          <h4><i class="fas fa-history"></i> 郵件發送記錄</h4>

          <div class="detail-grid" v-if="emailStatus">
            <div class="detail-item">
              <span class="detail-label">上次發送時間：</span>
              <span class="detail-value">
                {{ emailStatus.lastSentTime ? formatTime(emailStatus.lastSentTime) : '尚未發送' }}
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">發送狀態：</span>
              <span class="detail-value">
                <el-tag
                  :type="emailStatus.status === 'sent' ? 'success' :
                         emailStatus.status === 'failed' ? 'danger' :
                         emailStatus.status === 'pending' ? 'warning' : 'info'"
                  size="small"
                >
                  {{ emailStatus.status === 'sent' ? '已發送' :
                     emailStatus.status === 'failed' ? '發送失敗' :
                     emailStatus.status === 'pending' ? '發送中' : '尚未發送' }}
                </el-tag>
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">發送次數：</span>
              <span class="detail-value">{{ emailStatus.attempts }} 次</span>
            </div>

            <div class="detail-item" v-if="emailStatus.lastError">
              <span class="detail-label">錯誤訊息：</span>
              <span class="detail-value" style="color: #f56c6c;">{{ emailStatus.lastError }}</span>
            </div>
          </div>

          <div v-else-if="!emailStatusLoading" class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">發送狀態：</span>
              <span class="detail-value">
                <el-tag type="info" size="small">無記錄</el-tag>
              </span>
            </div>
          </div>
        </div>

        <!-- Invitation Details Section -->
        <div class="form-section" v-if="selectedInvitationForResend">
          <h4><i class="fas fa-info-circle"></i> 邀請碼詳細信息</h4>

          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">邀請碼：</span>
              <span class="detail-value code-display">{{ selectedInvitationForResend.invitationCode }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">受邀者：</span>
              <span class="detail-value">{{ selectedInvitationForResend.targetEmail || '-' }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">創建時間：</span>
              <span class="detail-value">{{ formatTime(selectedInvitationForResend.createdTime) }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">有效期至：</span>
              <span class="detail-value">{{ formatTime(selectedInvitationForResend.expiryTime) }}</span>
            </div>
          </div>
        </div>

        <!-- Confirmation Section -->
        <div class="form-section">
          <h4><i class="fas fa-paper-plane"></i> 確認重發</h4>

          <el-alert
            type="info"
            :closable="false"
            style="margin-bottom: 20px;"
          >
            <template #title>確定要重新發送邀請信嗎？</template>
            <div>邀請郵件將會重新發送到「{{ selectedInvitationForResend?.targetEmail }}」。</div>
          </el-alert>

          <div class="form-group">
            <ConfirmationInput
              v-model="resendConfirmationText"
              keyword="RESEND"
              hint-action="重發"
              @confirm="handleConfirmResend"
            />
          </div>
        </div>
      </div>

      <!-- Drawer Actions -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          :disabled="!isResendConfirmationValid"
          :loading="resendingInvites.has(selectedInvitationForResend?.invitationId || '')"
          @click="handleConfirmResend"
        >
          確認重發
        </el-button>
        <el-button size="large" @click="resendDrawerVisible = false">
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { rpcClient } from '@/utils/rpc-client'
import { fetchWithAuth } from '@/utils/api-helpers'
import AdminFilterToolbar from '@/components/admin/shared/AdminFilterToolbar.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, clearAlerts } = useDrawerAlerts()
import {
  Plus,
  Message,
  CopyDocument,
  Refresh,
  List,
  Search,
  CircleClose,
  Loading,
  PieChart
} from '@element-plus/icons-vue'

// Types
interface Invitation {
  invitationId: string
  invitationCode: string
  targetEmail: string
  status: 'active' | 'used' | 'expired' | 'deactivated'
  createdBy: string
  createdTime: number
  expiryTime: number
  defaultGlobalGroups?: string[]
}

interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions: string | string[]
  isActive: boolean
}

interface InviteResult {
  email: string
  invitationCode: string
  expiryTime: number
}

interface GeneratedInvite {
  invitationCode?: string
  expiryTime?: number
  totalGenerated?: number
  results?: InviteResult[]
  errors?: string[] | null
}

interface InviteForm {
  targetEmails: string
  validDays: number
  defaultGlobalGroups: string[]
}

interface InvitationEmailStatus {
  emailSent: boolean
  lastSentTime: number | null
  status: 'sent' | 'failed' | 'pending' | 'not_sent'
  attempts: number
  lastError: string | null
}

// Props
const props = withDefaults(defineProps<{
  visible?: boolean
}>(), {
  visible: false
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'refresh': []
}>()

// Local visibility binding
const localVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val)
})

// State
const invitations = ref<Invitation[]>([])
const invitationsLoading = ref(false)
const inviteSearchText = ref('')
const inviteStatusFilter = ref('')
const showUnusableInvitations = ref(false)
const resendingInvites = ref<Set<string>>(new Set())
const togglingInvites = ref<Set<string>>(new Set())
const generating = ref(false)
const processingStatus = ref('')
const generatedInvite = ref<GeneratedInvite | null>(null)
const globalGroups = ref<GlobalGroup[]>([])

// Confirmation Drawer State (Deactivate/Reactivate)
const confirmDrawerVisible = ref(false)
const selectedInvitation = ref<Invitation | null>(null)
const confirmAction = ref<'deactivate' | 'reactivate'>('deactivate')
const confirmationText = ref('')

// Resend Confirmation Drawer State
const resendDrawerVisible = ref(false)
const selectedInvitationForResend = ref<Invitation | null>(null)
const resendConfirmationText = ref('')
const emailStatusLoading = ref(false)
const emailStatus = ref<InvitationEmailStatus | null>(null)

// AbortController for cancelling in-flight requests
const abortControllerRef = ref<AbortController | null>(null)

const inviteForm = reactive<InviteForm>({
  targetEmails: '',
  validDays: 7,
  defaultGlobalGroups: []
})

// Computed
const filteredInvitations = computed(() => {
  let filtered = invitations.value || []

  // Toggle OFF 時只顯示「可用」的邀請碼（active 且未過期）
  // 當選擇特定狀態時，繞過 toggle 邏輯讓用戶能查看特定狀態的項目
  if (!showUnusableInvitations.value && !inviteStatusFilter.value) {
    const now = Date.now()
    filtered = filtered.filter(invite =>
      invite.status === 'active' && invite.expiryTime > now
    )
  }

  if (inviteSearchText.value) {
    const search = inviteSearchText.value.toLowerCase()
    filtered = filtered.filter(invite =>
      (invite.targetEmail && invite.targetEmail.toLowerCase().includes(search)) ||
      invite.createdBy.toLowerCase().includes(search)
    )
  }

  if (inviteStatusFilter.value) {
    filtered = filtered.filter(invite => {
      const now = Date.now()
      if (inviteStatusFilter.value === 'active') {
        return invite.status === 'active' && invite.expiryTime > now
      } else if (inviteStatusFilter.value === 'expired') {
        return invite.expiryTime <= now
      } else if (inviteStatusFilter.value === 'used') {
        return invite.status === 'used'
      } else if (inviteStatusFilter.value === 'deactivated') {
        return invite.status === 'deactivated'
      }
      return true
    })
  }

  return filtered.sort((a, b) => b.createdTime - a.createdTime)
})

const invitationStats = computed(() => {
  const now = Date.now()
  const inviteList = invitations.value || []
  return {
    total: inviteList.length,
    active: inviteList.filter(i => i.status === 'active' && i.expiryTime > now).length,
    expired: inviteList.filter(i => i.expiryTime <= now).length,
    used: inviteList.filter(i => i.status === 'used').length,
    deactivated: inviteList.filter(i => i.status === 'deactivated').length
  }
})

// Active filter count for AdminFilterToolbar
const activeFilterCount = computed(() => {
  let count = 0
  if (inviteSearchText.value && inviteSearchText.value.trim() !== '') count++
  if (inviteStatusFilter.value && inviteStatusFilter.value !== '') count++
  return count
})

// Export configuration for AdminFilterToolbar
const exportConfig = computed(() => ({
  data: filteredInvitations.value as unknown as Record<string, unknown>[],
  filename: '邀請碼列表',
  headers: ['受邀者Email', '狀態', '創建者', '創建時間', '有效期至'],
  rowMapper: (item: Record<string, unknown>): (string | number)[] => {
    const invite = item as unknown as Invitation
    return [
      invite.targetEmail || '-',
      getInvitationStatusText(invite),
      invite.createdBy,
      formatTime(invite.createdTime) || '-',
      formatTime(invite.expiryTime) || '-'
    ]
  }
}))

// Confirmation Drawer Computed
const confirmDrawerTitle = computed(() => {
  if (confirmAction.value === 'deactivate') {
    return '停用邀請碼'
  }
  return '重新啟用邀請碼'
})

const confirmDrawerDirection = computed(() => {
  // Dangerous operations use ttb (top-to-bottom)
  return confirmAction.value === 'deactivate' ? 'ttb' : 'btt'
})

const confirmDrawerClass = computed(() => {
  // Dangerous operations use drawer-maroon
  return confirmAction.value === 'deactivate' ? 'drawer-maroon' : 'drawer-navy'
})

const isConfirmationValid = computed(() => {
  if (confirmAction.value === 'reactivate') {
    return true // No confirmation text required for reactivate
  }
  return confirmationText.value === 'DEACTIVATE'
})

// Resend confirmation validation
const isResendConfirmationValid = computed(() => {
  return resendConfirmationText.value.toUpperCase() === 'RESEND'
})

// Valid email count for counter display and button state
const validEmailCount = computed(() => {
  if (!inviteForm.targetEmails?.trim()) return 0
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return inviteForm.targetEmails
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && emailRegex.test(line))
    .length
})

// Methods
// Reset filters handler for AdminFilterToolbar
const handleResetFilters = (): void => {
  inviteSearchText.value = ''
  inviteStatusFilter.value = ''
}
const formatTime = (timestamp: number | null | undefined): string | null => {
  if (!timestamp) return null
  return new Date(timestamp).toLocaleString('zh-TW')
}

const getInvitationStatusClass = (invitation: Invitation): string => {
  const now = Date.now()
  if (invitation.status === 'deactivated') return 'deactivated'
  if (invitation.status === 'used') return 'used'
  if (invitation.expiryTime <= now) return 'expired'
  if (invitation.status === 'active') return 'active'
  return ''
}

const getInvitationStatusText = (invitation: Invitation): string => {
  const now = Date.now()
  if (invitation.status === 'deactivated') return '已停用'
  if (invitation.status === 'used') return '已使用'
  if (invitation.expiryTime <= now) return '已過期'
  if (invitation.status === 'active') return '有效'
  return invitation.status
}

const getGlobalGroupPermissionText = (group: GlobalGroup): string => {
  if (!group.globalPermissions) return '無權限'
  try {
    const permissions = typeof group.globalPermissions === 'string'
      ? JSON.parse(group.globalPermissions)
      : group.globalPermissions
    if (Array.isArray(permissions) && permissions.length > 0) {
      return `${permissions.length} 個權限`
    }
  } catch (e) {
    console.error('Error parsing permissions:', e)
  }
  return '無權限'
}

const getGlobalGroupById = (groupId: string): GlobalGroup | undefined => {
  return globalGroups.value.find(group => group.groupId === groupId)
}

const removeDefaultGlobalGroup = (groupId: string): void => {
  const index = inviteForm.defaultGlobalGroups.indexOf(groupId)
  if (index !== -1) {
    inviteForm.defaultGlobalGroups.splice(index, 1)
  }
}

const loadInvitations = async (): Promise<void> => {
  invitationsLoading.value = true
  try {
    // Vue 3 Best Practice: rpcClient automatically handles authentication
    const httpResponse = await rpcClient.invitations.list.$post({
      json: {}
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      invitations.value = response.data
    } else {
      ElMessage?.error('載入邀請碼失敗')
    }
  } catch (error) {
    console.error('Error loading invitations:', error)
    ElMessage?.error('載入邀請碼失敗')
  } finally {
    invitationsLoading.value = false
  }
}

const loadGlobalGroups = async (): Promise<void> => {
  try {
    const data = await fetchWithAuth<{ success: boolean; data?: GlobalGroup[] }>(
      '/api/admin/global-groups',
      {
        method: 'POST',
        body: {},
        signal: abortControllerRef.value?.signal
      }
    )
    if (data.success && data.data) {
      globalGroups.value = data.data.filter((g: GlobalGroup) => g.isActive)
    }
  } catch (error) {
    // Ignore AbortError when request is cancelled
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }
    console.error('Error loading global groups:', error)
  }
}

const handleGenerateInvite = async (): Promise<void> => {
  if (!inviteForm.targetEmails || !inviteForm.targetEmails.trim()) {
    ElMessage?.error('請輸入受邀者的Email地址')
    return
  }

  const emailList = inviteForm.targetEmails
    .split('\n')
    .map(email => email.trim())
    .filter(email => email.length > 0)

  if (emailList.length === 0) {
    ElMessage?.error('請輸入至少一個Email地址')
    return
  }

  // Improved email validation regex (supports +, subdomains, etc.)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  const invalidEmails = emailList.filter(email => !emailRegex.test(email))
  if (invalidEmails.length > 0) {
    ElMessage?.error(`以下Email格式不正確: ${invalidEmails.join(', ')}`)
    return
  }

  // Limit maximum total emails
  if (emailList.length > 500) {
    ElMessage?.error(`一次最多只能生成 500 個邀請碼，您輸入了 ${emailList.length} 個`)
    return
  }

  generating.value = true
  generatedInvite.value = null

  try {
    const results: InviteResult[] = []
    const errors: string[] = []

    // Split into batches of 50 (backend limit)
    const BATCH_SIZE = 50
    const batches: string[][] = []
    for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
      batches.push(emailList.slice(i, i + BATCH_SIZE))
    }

    // Process batches in parallel
    processingStatus.value = `正在處理 ${emailList.length} 個邀請（${batches.length} 批次）...`

    const batchPromises = batches.map(async (batch, batchIndex) => {
      try {
        const httpResponse = await rpcClient.invitations['generate-batch'].$post({
          json: {
            targetEmails: batch,
            validDays: inviteForm.validDays,
            defaultGlobalGroups: inviteForm.defaultGlobalGroups
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          return {
            success: true,
            batchIndex,
            results: response.data.results || [],
            errors: response.data.errors || [],
            failedEmails: [] as string[]
          }
        } else {
          return {
            success: false,
            batchIndex,
            error: response.error?.message || '批次請求失敗',
            emailCount: batch.length,
            failedEmails: batch // Include the specific emails that failed
          }
        }
      } catch (error) {
        return {
          success: false,
          batchIndex,
          error: '網路請求失敗',
          emailCount: batch.length,
          failedEmails: batch // Include the specific emails that failed
        }
      }
    })

    const batchResults = await Promise.all(batchPromises)

    // Aggregate results from all batches
    batchResults.forEach((batchResult) => {
      if (batchResult.success) {
        // Add successful results
        if (batchResult.results) {
          results.push(...batchResult.results)
        }
        // Add batch errors
        if (batchResult.errors && batchResult.errors.length > 0) {
          errors.push(...batchResult.errors)
        }
      } else {
        // Entire batch failed - include specific email addresses
        const failedEmailsList = batchResult.failedEmails?.join(', ') || '未知'
        errors.push(`批次 ${batchResult.batchIndex + 1} 失敗 (${batchResult.emailCount} 個郵箱): ${batchResult.error}。失敗的郵箱: ${failedEmailsList}`)
      }
    })

    if (results.length > 0) {
      generatedInvite.value = {
        totalGenerated: results.length,
        results: results,
        errors: errors.length > 0 ? errors : null
      }

      if (errors.length === 0) {
        ElMessage?.success(`成功生成 ${results.length} 個邀請碼，邀請信正在發送中`)
      } else {
        ElMessage?.warning(`成功生成 ${results.length} 個邀請碼，${errors.length} 個失敗`)
      }

      await loadInvitations()
      emit('refresh')
    } else {
      ElMessage?.error(`所有邀請碼生成失敗：${errors.join('; ')}`)
    }
  } catch (error) {
    console.error('Error generating invites:', error)
    ElMessage?.error('生成邀請碼失敗，請重試')
  } finally {
    generating.value = false
    processingStatus.value = ''
  }
}

const copyInviteCode = async (): Promise<void> => {
  if (generatedInvite.value?.invitationCode) {
    try {
      await navigator.clipboard.writeText(generatedInvite.value.invitationCode)
      ElMessage?.success('邀請碼已複製')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      ElMessage?.error('複製失敗，請手動複製')
    }
  }
}

const copySpecificCode = async (code: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage?.success('邀請碼已複製')
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    ElMessage?.error('複製失敗，請手動複製')
  }
}

const copyAllCodes = async (): Promise<void> => {
  if (generatedInvite.value?.results) {
    try {
      const codes = generatedInvite.value.results
        .map(r => `${r.email}: ${r.invitationCode}`)
        .join('\n')
      await navigator.clipboard.writeText(codes)
      ElMessage?.success('已複製全部邀請碼')
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      ElMessage?.error('複製失敗，請手動複製')
    }
  }
}

const copyInvitationCode = async (code: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage?.success('邀請碼已複製')
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    ElMessage?.error('複製失敗，請手動複製')
  }
}

// Open resend drawer and fetch email status
const openResendDrawer = async (invitation: Invitation): Promise<void> => {
  selectedInvitationForResend.value = invitation
  resendConfirmationText.value = ''
  emailStatus.value = null
  resendDrawerVisible.value = true

  // Fetch email status from API
  emailStatusLoading.value = true
  try {
    const httpResponse = await rpcClient.invitations['email-status'].$post({
      json: { invitationCodes: [invitation.invitationCode] }
    })
    const response = await httpResponse.json()
    if (response.success && response.data?.emailStatuses) {
      emailStatus.value = response.data.emailStatuses[invitation.invitationCode] || null
    }
  } catch (error) {
    console.error('Failed to fetch email status:', error)
  } finally {
    emailStatusLoading.value = false
  }
}

// Confirm resend with validation
const handleConfirmResend = async (): Promise<void> => {
  if (!isResendConfirmationValid.value || !selectedInvitationForResend.value) return
  await handleResendInvite(selectedInvitationForResend.value)
  resendDrawerVisible.value = false
}

const handleResendInvite = async (invitation: Invitation): Promise<void> => {
  resendingInvites.value.add(invitation.invitationId)
  try {
    const response = await fetchWithAuth<{ success: boolean; error?: { message?: string } }>(
      '/api/invitations/resend-email',
      {
        method: 'POST',
        body: {
          invitationId: invitation.invitationId
        },
        signal: abortControllerRef.value?.signal
      }
    )

    if (response.success) {
      ElMessage.success('邀請郵件已重新發送')
      await loadInvitations()
    } else {
      ElMessage.error(`重新發送失敗: ${response.error?.message || '未知錯誤'}`)
    }
  } catch (error) {
    // Ignore AbortError when request is cancelled
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }
    console.error('Error resending invite:', error)
    ElMessage.error('重新發送失敗')
  } finally {
    resendingInvites.value.delete(invitation.invitationId)
  }
}

const canToggleStatus = (invitation: Invitation): boolean => {
  // Only active or deactivated invitations can be toggled
  // used and expired invitations cannot be toggled
  return invitation.status === 'active' || invitation.status === 'deactivated'
}

const getSwitchTooltip = (invitation: Invitation): string => {
  if (invitation.status === 'used') {
    return '已使用的邀請碼無法操作'
  }
  if (invitation.status === 'expired') {
    return '已過期的邀請碼無法操作'
  }
  if (invitation.status === 'active') {
    return '點擊停用此邀請碼'
  }
  if (invitation.status === 'deactivated') {
    return '點擊重新啟用此邀請碼'
  }
  return ''
}

const handleToggleInviteStatus = (invitation: Invitation): void => {
  // Set selected invitation and action
  selectedInvitation.value = invitation
  confirmAction.value = invitation.status === 'active' ? 'deactivate' : 'reactivate'
  confirmationText.value = ''

  // Open confirmation drawer
  confirmDrawerVisible.value = true
}

const handleConfirmAction = async (): Promise<void> => {
  if (!selectedInvitation.value) return

  // Validate confirmation text for deactivate action
  if (confirmAction.value === 'deactivate' && !isConfirmationValid.value) {
    ElMessage.warning('請輸入正確的確認文字')
    return
  }

  const invitation = selectedInvitation.value
  togglingInvites.value.add(invitation.invitationId)

  try {
    const isDeactivate = confirmAction.value === 'deactivate'
    const action = isDeactivate ? '停用' : '重新啟用'

    // Call API - use conditional to avoid type error
    const httpResponse = isDeactivate
      ? await rpcClient.invitations.deactivate.$post({
          json: { invitationId: invitation.invitationId }
        })
      : await rpcClient.invitations.reactivate.$post({
          json: { invitationId: invitation.invitationId }
        })

    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success(`邀請碼已${action}`)
      await loadInvitations()
      confirmDrawerVisible.value = false
    } else {
      ElMessage.error(`${action}失敗: ${response.error?.message || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('Error toggling invite status:', error)
    ElMessage.error('操作失敗')
  } finally {
    togglingInvites.value.delete(invitation.invitationId)
  }
}

const tableRowClassName = ({ row }: { row: Invitation }): string => {
  return row.status === 'deactivated' ? 'deactivated-row' : ''
}

const getInvitationTagType = (invitation: Invitation): 'primary' | 'success' | 'info' | 'warning' | 'danger' => {
  const now = Date.now()
  if (invitation.status === 'deactivated') return 'danger'
  if (invitation.status === 'used') return 'success'
  if (invitation.expiryTime <= now) return 'info'
  if (invitation.status === 'active') return 'primary'
  return 'info'
}

// Watch for drawer open
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // Create new AbortController for this drawer session
    abortControllerRef.value = new AbortController()

    loadInvitations()
    loadGlobalGroups()
    generatedInvite.value = null
  } else {
    // Cancel any in-flight requests when drawer closes
    if (abortControllerRef.value) {
      abortControllerRef.value.abort()
      abortControllerRef.value = null
    }
  }
}, { immediate: true })

// Watch for generatedInvite changes to show alerts
watch(() => generatedInvite.value, (invite) => {
  // Clear previous alerts
  clearAlerts()

  if (invite) {
    // Show success alert
    const count = invite.totalGenerated || 1
    addAlert({
      type: 'success',
      title: `邀請碼已生成 (${count}個)`,
      message: count === 1
        ? `邀請碼: ${invite.invitationCode || (invite.results && invite.results[0]?.invitationCode)}`
        : `已成功生成 ${count} 個邀請碼`,
      closable: false,
      autoClose: 0
    })

    // Show warning if there are errors
    if (invite.errors && invite.errors.length > 0) {
      const errorList = invite.errors.join(', ')
      addAlert({
        type: 'warning',
        title: '部分生成失敗',
        message: `失敗原因: ${errorList}`,
        closable: false
      })
    }
  }
})

// Watch drawer visibility - clear alerts when closed
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    clearAlerts()
  }
})

// Cleanup on component unmount
onUnmounted(() => {
  // Cancel any in-flight requests
  if (abortControllerRef.value) {
    abortControllerRef.value.abort()
    abortControllerRef.value = null
  }
})
</script>

<style scoped>
/* Drawer Body */
.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Form Section */
.form-section {
  margin-bottom: 24px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.form-section h4 {
  margin: 0 0 16px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Form Group */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #606266;
}

.required {
  color: #f56c6c;
}

.help-text {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

/* AdminFilterToolbar Integration */
.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

/* Processing Status */
.processing-status {
  margin-top: 15px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  color: #606266;
}

/* Result Section */
.result-section {
  margin-top: 20px;
  padding: 16px;
  background: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 8px;
}

.result-content {
  margin-top: 12px;
}

.invite-code-item {
  margin: 10px 0;
  padding: 10px;
  background: white;
  border-radius: 4px;
}

.invite-code {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
  padding: 8px;
  background: #ecf5ff;
  border-radius: 4px;
  margin-bottom: 8px;
  word-break: break-all;
}

.batch-actions {
  margin-top: 15px;
}

/* Statistics Section */
.statistics-section .statistics-row {
  margin-top: 12px;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */

/* Table Row Styling */
.deactivated-row {
  opacity: 0.6;
  background-color: #fafafa !important;
}

/* Selected Groups Display */
.selected-groups-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

/* Detail Grid for Confirmation Drawer */
.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-label {
  min-width: 120px;
  font-weight: 600;
  color: #606266;
}

.detail-value {
  flex: 1;
  color: #303133;
}

.code-display {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: 700;
  color: #409eff;
  padding: 4px 8px;
  background: #ecf5ff;
  border-radius: 4px;
}

.text-success {
  color: #67c23a !important;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .content-area {
    padding: 12px;
  }

  .form-section {
    padding: 16px;
  }

  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-row .el-select,
  .filter-row .el-input {
    width: 100% !important;
  }

  .detail-item {
    flex-direction: column;
    gap: 8px;
  }

  .detail-label {
    min-width: auto;
  }
}
</style>
