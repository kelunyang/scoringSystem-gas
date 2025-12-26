<template>
  <el-drawer
    v-model="drawerVisible"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-gift"></i>
          發放額外專案獎勵點數
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="award-drawer-content">
      <!-- Filter Controls -->
      <div class="filter-section">
        <div class="filter-row">
          <label>群組篩選：</label>
          <el-select
            v-model="selectedGroupFilter"
            placeholder="全部群組"
            clearable
            style="width: 200px;"
          >
            <el-option label="全部群組" :value="null as any" />
            <el-option
              v-for="group in availableGroups"
              :key="group.groupId"
              :label="group.groupName"
              :value="group.groupId"
            />
          </el-select>
        </div>

        <div class="filter-row">
          <label>搜尋使用者：</label>
          <el-input
            v-model="searchText"
            placeholder="輸入姓名或 Email"
            clearable
            style="width: 300px;"
          >
            <template #prefix>
              <i class="fas fa-search"></i>
            </template>
          </el-input>
        </div>
      </div>

      <!-- User Selection -->
      <div class="user-selection-section">
        <div class="selection-header">
          <el-checkbox
            v-model="selectAll"
            @change="handleSelectAll"
            :indeterminate="isIndeterminate"
          >
            全選 ({{ selectedUsers.length }}/{{ filteredUsers.length }})
          </el-checkbox>
        </div>

        <div class="user-list">
          <div
            v-for="user in filteredUsers"
            :key="(user as any).userEmail"
            class="user-item"
            @click="toggleUser((user as any).userEmail)"
          >
            <el-checkbox
              :model-value="selectedUsers.includes((user as any).userEmail)"
              @click.stop="toggleUser((user as any).userEmail)"
            />

            <div class="user-avatar">
              <img
                v-if="(user as any).avatarSeed"
                :src="generateAvatarUrl(user)"
                :alt="(user as any).displayName"
              />
              <i v-else class="fas fa-user-circle default-avatar"></i>
            </div>

            <div class="user-info">
              <div class="user-name">{{ (user as any).displayName || (user as any).userEmail }}</div>
              <div class="user-email">{{ (user as any).userEmail }}</div>
              <div class="user-groups">
                <span
                  v-for="group in getUserGroups((user as any).userEmail)"
                  :key="(group as any).groupId"
                  class="group-tag"
                >
                  {{ (group as any).groupName }}
                </span>
              </div>
            </div>
          </div>

          <EmptyState
            v-if="filteredUsers.length === 0"
            :icons="['fa-users']"
            title="沒有符合條件的使用者"
            parent-icon="fa-gift"
            :compact="true"
            :enable-animation="false"
          />
        </div>
      </div>

      <!-- Award Form -->
      <div class="award-form-section">
        <h4><i class="fas fa-gift"></i> 獎勵設定</h4>

        <div class="form-row">
          <label class="required">點數金額：</label>
          <el-input-number
            v-model="awardAmount"
            :min="-999999"
            :max="999999"
            :step="10"
            controls-position="right"
            style="width: 200px;"
          />
          <span class="hint">（可輸入負數扣點）</span>
        </div>

        <div class="form-row">
          <label class="required">獎勵原因：</label>
          <el-input
            v-model="awardReason"
            type="textarea"
            :rows="3"
            placeholder="請輸入發放原因（必填）"
            maxlength="500"
            show-word-limit
          />
        </div>

        <div class="form-row">
          <label>關聯階段：</label>
          <el-select
            v-model="selectedStageId"
            placeholder="選擇關聯階段（選填）"
            clearable
            style="width: 100%;"
          >
            <el-option
              v-for="stage in stages"
              :key="(stage as any).stageId"
              :label="`${(stage as any).stageName} (階段 ${(stage as any).stageOrder})`"
              :value="(stage as any).stageId"
            />
          </el-select>
        </div>
      </div>

      <!-- Preview Summary -->
      <div class="summary-section" v-if="selectedUsers.length > 0">
        <h4><i class="fas fa-info-circle"></i> 發放預覽</h4>
        <div class="summary-content">
          <div class="summary-item">
            <span class="label">選中人數：</span>
            <span class="value">{{ selectedUsers.length }} 人</span>
          </div>
          <div class="summary-item">
            <span class="label">每人點數：</span>
            <span class="value" :class="{ negative: awardAmount < 0 }">
              {{ awardAmount > 0 ? '+' : '' }}{{ awardAmount }}
            </span>
          </div>
          <div class="summary-item">
            <span class="label">總計影響：</span>
            <span class="value" :class="{ negative: totalImpact < 0 }">
              {{ totalImpact > 0 ? '+' : '' }}{{ totalImpact }}
            </span>
          </div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div v-if="isSubmitting" class="progress-section">
        <el-progress
          :percentage="submitProgress"
          :status="submitProgress === 100 ? 'success' : undefined"
        />
        <p class="progress-text">
          正在發放... ({{ submittedCount }}/{{ selectedUsers.length }})
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button
          type="success"
          @click="handleSubmit"
          :loading="isSubmitting"
          :disabled="!canSubmit"
        >
          <i class="fas fa-paper-plane"></i>
          {{ isSubmitting ? '發放中...' : '確認發放' }}
        </el-button>
        <el-button @click="handleClose" :disabled="isSubmitting">
          <i class="fas fa-times"></i> 取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { generateAvatarUrl } from '@/utils/walletHelpers'
import { getErrorMessage } from '@/utils/errorHandler'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import EmptyState from './EmptyState.vue'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  projectId: {
    type: String,
    required: true
  },
  projectUsers: {
    type: Array,
    default: () => []
  },
  projectGroups: {
    type: Array,
    default: () => []
  },
  userGroups: {
    type: Array,
    default: () => []
  },
  stages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'success'])

// Drawer visibility
const drawerVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// Filter states
const selectedGroupFilter = ref(null)
const searchText = ref('')

// Selection states
const selectedUsers = ref<string[]>([])
const selectAll = ref(false)

// Award form states
const awardAmount = ref(0)
const awardReason = ref('')
const selectedStageId = ref(null)

// Submission states
const isSubmitting = ref(false)
const submittedCount = ref(0)
const submitProgress = computed(() => {
  if (selectedUsers.value.length === 0) return 0
  return Math.round((submittedCount.value / selectedUsers.value.length) * 100)
})

// Available groups (unique groups from userGroups)
const availableGroups = computed(() => {
  const groupMap = new Map()
  ;(props.userGroups as any[]).forEach((ug: any) => {
    const group = (props.projectGroups as any[]).find((g: any) => g.groupId === ug.groupId)
    if (group && !groupMap.has(group.groupId)) {
      groupMap.set(group.groupId, group)
    }
  })
  return Array.from(groupMap.values())
})

// Filtered users based on group and search
const filteredUsers = computed(() => {
  let users = props.projectUsers as any[]

  // Filter by group
  if (selectedGroupFilter.value) {
    const usersInGroup = (props.userGroups as any[])
      .filter((ug: any) => ug.groupId === selectedGroupFilter.value)
      .map((ug: any) => ug.userEmail)
    users = users.filter((u: any) => usersInGroup.includes(u.userEmail))
  }

  // Filter by search text
  if (searchText.value.trim()) {
    const search = searchText.value.trim().toLowerCase()
    users = users.filter((u: any) =>
      (u.displayName || '').toLowerCase().includes(search) ||
      (u.userEmail || '').toLowerCase().includes(search)
    )
  }

  return users
})

// Get user's groups
function getUserGroups(userEmail: string) {
  const userGroupIds = (props.userGroups as any[])
    .filter((ug: any) => ug.userEmail === userEmail)
    .map((ug: any) => ug.groupId)

  return (props.projectGroups as any[]).filter((g: any) => userGroupIds.includes(g.groupId))
}

// Selection logic
const isIndeterminate = computed(() => {
  const selected = selectedUsers.value.length
  const total = filteredUsers.value.length
  return selected > 0 && selected < total
})

function handleSelectAll(val: any) {
  if (val) {
    selectedUsers.value = (filteredUsers.value as any[]).map((u: any) => u.userEmail)
  } else {
    selectedUsers.value = []
  }
}

function toggleUser(userEmail: string) {
  const index = selectedUsers.value.indexOf(userEmail)
  if (index > -1) {
    selectedUsers.value.splice(index, 1)
  } else {
    selectedUsers.value.push(userEmail)
  }
}

// Watch filtered users to update selectAll state
watch(filteredUsers, () => {
  const allSelected = filteredUsers.value.length > 0 &&
    (filteredUsers.value as any[]).every((u: any) => selectedUsers.value.includes(u.userEmail))
  selectAll.value = allSelected
})

// Form validation
const canSubmit = computed(() => {
  return selectedUsers.value.length > 0 &&
    awardAmount.value !== 0 &&
    awardReason.value.trim() !== '' &&
    !isSubmitting.value
})

// Summary
const totalImpact = computed(() => {
  return selectedUsers.value.length * awardAmount.value
})

// Handle close
function handleClose() {
  if (isSubmitting.value) {
    ElMessage.warning('正在發放中，請稍候...')
    return
  }

  // Reset form
  selectedUsers.value = []
  awardAmount.value = 0
  awardReason.value = ''
  selectedStageId.value = null
  selectedGroupFilter.value = null
  searchText.value = ''

  drawerVisible.value = false
}

// Handle submit
async function handleSubmit() {
  try {
    // Confirmation dialog
    const confirmMessage = `
      確定要發放點數給 ${selectedUsers.value.length} 位使用者嗎？
      每人：${awardAmount.value > 0 ? '+' : ''}${awardAmount.value} 點
      總計：${totalImpact.value > 0 ? '+' : ''}${totalImpact.value} 點
    `

    await ElMessageBox.confirm(confirmMessage, '確認發放', {
      confirmButtonText: '確定發放',
      cancelButtonText: '取消',
      type: 'warning'
    })

    isSubmitting.value = true
    submittedCount.value = 0

    const errors = []

    // Batch award points to each selected user
    for (const userEmail of selectedUsers.value) {
      try {
        const httpResponse = await rpcClient.wallets.award.$post({
          json: {
            projectId: props.projectId,
            targetUserEmail: userEmail,
            amount: awardAmount.value,
            transactionType: 'manual_award',
            source: awardReason.value,
            relatedId: null,
            settlementId: null,
            stageId: selectedStageId.value
          }
        })
        const response = await httpResponse.json()

        if (!response.success) {
          errors.push(`${userEmail}: ${response.error?.message || '發放失敗'}`)
        }

        submittedCount.value++
      } catch (error) {
        errors.push(`${userEmail}: ${getErrorMessage(error)}`)
        submittedCount.value++
      }
    }

    // Show result
    if (errors.length === 0) {
      ElMessage.success(`成功發放點數給 ${selectedUsers.value.length} 位使用者！`)
      emit('success')
      handleClose()
    } else if (errors.length < selectedUsers.value.length) {
      ElMessage.warning(`部分發放成功。失敗 ${errors.length} 筆：\n${errors.slice(0, 3).join('\n')}`)
      emit('success')
    } else {
      ElMessage.error('發放失敗，請檢查後重試')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Award points error:', error)
      ElMessage.error('發放失敗：' + getErrorMessage(error))
    }
  } finally {
    isSubmitting.value = false
    submittedCount.value = 0
  }
}
</script>

<style scoped>
.award-drawer-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  overflow-y: auto;
}

/* Filter Section */
.filter-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  border-radius: 8px;
  color: white;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-row label {
  min-width: 100px;
  font-weight: 500;
}

/* User Selection Section */
.user-selection-section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.selection-header {
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.user-list {
  max-height: 500px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background-color 0.2s;
}

.user-item:hover {
  background-color: #f9fafb;
}

.user-item:last-child {
  border-bottom: none;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-avatar {
  font-size: 40px;
  color: #9ca3af;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 500;
  color: #111827;
  margin-bottom: 2px;
}

.user-email {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.user-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.group-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.no-users {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
}

.no-users i {
  font-size: 48px;
  margin-bottom: 12px;
  display: block;
}

/* Award Form Section */
.award-form-section {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.award-form-section h4 {
  margin: 0 0 16px 0;
  color: #111827;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-row {
  margin-bottom: 16px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-row label {
  display: block;
  margin-bottom: 8px;
  color: #374151;
  font-weight: 500;
}

.form-row label.required::after {
  content: ' *';
  color: #ef4444;
}

.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #6b7280;
}

/* Summary Section */
.summary-section {
  padding: 16px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
}

.summary-section h4 {
  margin: 0 0 12px 0;
  color: #92400e;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-item .label {
  color: #78716c;
  font-size: 14px;
}

.summary-item .value {
  font-weight: 600;
  font-size: 16px;
  color: #059669;
}

.summary-item .value.negative {
  color: #dc2626;
}

/* Progress Section */
.progress-section {
  padding: 16px;
  background: #f0f9ff;
  border-radius: 8px;
}

.progress-text {
  margin-top: 8px;
  text-align: center;
  color: #0369a1;
  font-size: 14px;
}

/* Action Buttons - Using unified .drawer-actions from drawer-unified.scss */
</style>
