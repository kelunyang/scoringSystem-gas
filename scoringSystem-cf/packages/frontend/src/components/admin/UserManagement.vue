<template>
  <div class="user-management">
    <!-- Loading state -->
    <div v-if="canManageUsers === null || canManageInvites === null" class="loading-state">
      <i class="fas fa-spinner fa-spin"></i>
      載入權限中...
    </div>

    <!-- Invite-Only View (for users with only generate_invites permission) -->
    <div v-else-if="!canManageUsers && canManageInvites" class="invite-only-view">
      <div class="mgmt-header">
        <div class="header-right">
          <el-button type="primary" @click="openInviteManagement">
            <i class="fas fa-cogs"></i>
            邀請碼管理
          </el-button>
        </div>
      </div>
    </div>

    <!-- Full User Management View (for users with manage_users permission) -->
    <div v-else-if="canManageUsers === true">
    <!-- Admin Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :active-filter-count="activeFilterCount"
      :export-data="exportConfig.data"
      :export-filename="exportConfig.filename"
      :export-headers="exportConfig.headers"
      :export-row-mapper="exportConfig.rowMapper"
      :loading="loading"
      @reset-filters="handleResetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">搜尋：</span>
          <el-input
            v-model="filters.searchText"
            placeholder="搜尋使用者名稱或 Email"
            clearable
            style="width: 300px;"
          >
            <template #prefix>
              <i class="el-icon-search"></i>
            </template>
          </el-input>
        </div>

        <div class="filter-item">
          <span class="filter-label">狀態：</span>
          <el-select
            v-model="filters.statusFilter"
            placeholder="全部狀態"
            clearable
            style="width: 180px;"
          >
            <el-option label="全部" value="" />
            <el-option label="活躍" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">群組：</span>
          <el-select
            v-model="groupFilter"
            placeholder="選擇群組"
            clearable
            multiple
            collapse-tags
            collapse-tags-tooltip
            style="width: 250px;"
          >
            <el-option
              v-for="group in globalGroups"
              :key="group.groupId"
              :label="group.groupName"
              :value="group.groupId"
            />
          </el-select>
        </div>
      </template>

      <!-- Actions (Batch Operations + Other Actions) -->
      <template #actions>
        <!-- Batch Activate (with badge) -->
        <el-badge :value="selectedUserEmails.size" :hidden="selectedUserEmails.size === 0">
          <el-tooltip content="全部啟用" placement="top">
            <el-button
              type="success"
              size="small"
              @click="batchActivateUsers"
              :disabled="batchUpdatingStatus || selectedUserEmails.size === 0"
            >
              <i class="fas fa-check-circle"></i>
              <span class="btn-text">全部啟用</span>
            </el-button>
          </el-tooltip>
        </el-badge>

        <!-- Batch Deactivate (with badge) -->
        <el-badge :value="selectedUserEmails.size" :hidden="selectedUserEmails.size === 0">
          <el-tooltip content="全部停用" placement="top">
            <el-button
              type="danger"
              size="small"
              @click="batchDeactivateUsers"
              :disabled="batchUpdatingStatus || selectedUserEmails.size === 0"
            >
              <i class="fas fa-ban"></i>
              <span class="btn-text">全部停用</span>
            </el-button>
          </el-tooltip>
        </el-badge>

        <!-- Clear Selection -->
        <el-button
          v-if="selectedUserEmails.size > 0"
          size="small"
          @click="clearSelection"
          title="取消選擇"
        >
          <i class="fas fa-times"></i>
          <span class="btn-text">取消選擇</span>
        </el-button>
      </template>

    </AdminFilterToolbar>

    <!-- 統計卡片 -->
    <el-card class="stats-card">
      <el-row :gutter="20">
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總使用者" :value="getStatValue('totalUsers')" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="活躍" :value="getStatValue('activeUsers')" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="停用" :value="getStatValue('inactiveUsers')" />
        </el-col>
        <el-col v-if="activeFilterCount > 0" :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="搜尋結果" :value="filteredUsers.length" />
        </el-col>
      </el-row>
    </el-card>

    <!-- User Table -->
    <div class="table-container" v-loading="loading" element-loading-text="載入使用者資料中...">
      <table class="user-table">
        <!-- 響應式表頭 -->
        <ResponsiveTableHeader :actions-colspan="3">
          <!-- 橫屏：完整表頭 -->
          <template #full>
            <th style="width: 50px">
              <el-checkbox
                :model-value="isAllSelected"
                :indeterminate="isSomeSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th>Email</th>
            <th>顯示名稱</th>
            <th>狀態</th>
            <th>操作</th>
          </template>
          <!-- 豎屏：精簡表頭 -->
          <template #info>
            <th style="width: 50px">
              <el-checkbox
                :model-value="isAllSelected"
                :indeterminate="isSomeSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th>Email</th>
            <th>顯示名稱</th>
          </template>
        </ResponsiveTableHeader>
        <tbody>
          <template v-for="user in filteredUsers" :key="user.userId">
            <ExpandableTableRow
              :is-expanded="isUserExpanded(user.userEmail)"
              :expansion-colspan="5"
              :enable-responsive-rows="true"
              :actions-colspan="3"
              @toggle-expansion="toggleUserExpansion(user)"
            >
              <!-- 橫屏：完整單行 -->
              <template #main="{ isExpanded }">
                <td @click.stop>
                  <el-checkbox
                    :model-value="selectedUserEmails.has(user.userEmail)"
                    @change="toggleUserSelection(user.userEmail)"
                  />
                </td>
                <td>
                  <el-tooltip :content="user.userEmail" placement="top" :show-after="300">
                    <div style="display: inline-flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                      <i
                        class="expand-icon fas"
                        :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                      ></i>
                      <el-avatar
                        :src="getUserAvatarUrl(user)"
                        :alt="`${user.displayName || user.userEmail}的頭像`"
                        shape="square"
                        :size="32"
                        style="flex-shrink: 0;"
                      >
                        {{ getUserInitials(user) }}
                      </el-avatar>
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {{ user.userEmail }}
                      </span>
                    </div>
                  </el-tooltip>
                  <span v-if="isUserLocked(user)" class="lock-badge" :title="getLockStatusText(user)">
                    <i class="fas fa-lock"></i>
                    {{ getLockStatusText(user) }}
                  </span>
                </td>
                <td>{{ user.displayName || '-' }}</td>
                <td @click.stop>
                  <el-switch
                    v-model="user.status"
                    active-value="active"
                    inactive-value="inactive"
                    inline-prompt
                    active-text="啟用"
                    inactive-text="停用"
                    @change="toggleUserStatus(user)"
                  />
                </td>
                <td class="actions" @click.stop>
                  <el-button
                    v-if="isUserLocked(user)"
                    type="warning"
                    size="small"
                    @click="openUnlockDrawer(user)"
                    title="解鎖此帳戶"
                  >
                    <i class="fas fa-unlock"></i>
                    解鎖帳戶
                  </el-button>
                  <el-button type="primary" size="small" @click="editUser(user)">
                    <i class="fas fa-edit"></i>
                    編輯
                  </el-button>
                  <el-button type="warning" size="small" @click="resetPassword(user)">
                    <i class="fas fa-key"></i>
                    重設密碼
                  </el-button>
                  <el-button type="info" size="small" @click="viewLoginLogs(user)" title="查看該用戶的登入記錄">
                    <i class="fas fa-right-to-bracket"></i>
                    登入記錄
                  </el-button>
                </td>
              </template>

              <!-- 豎屏第一行：資訊 -->
              <template #info="{ isExpanded }">
                <td @click.stop>
                  <el-checkbox
                    :model-value="selectedUserEmails.has(user.userEmail)"
                    @change="toggleUserSelection(user.userEmail)"
                  />
                </td>
                <td>
                  <el-tooltip :content="user.userEmail" placement="top" :show-after="300">
                    <div style="display: inline-flex; align-items: center; gap: 8px; max-width: 100%; overflow: hidden;">
                      <i
                        class="expand-icon fas"
                        :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                      ></i>
                      <el-avatar
                        :src="getUserAvatarUrl(user)"
                        :alt="`${user.displayName || user.userEmail}的頭像`"
                        shape="square"
                        :size="24"
                        style="flex-shrink: 0;"
                      >
                        {{ getUserInitials(user) }}
                      </el-avatar>
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {{ user.userEmail }}
                      </span>
                    </div>
                  </el-tooltip>
                  <span v-if="isUserLocked(user)" class="lock-badge" :title="getLockStatusText(user)">
                    <i class="fas fa-lock"></i>
                  </span>
                </td>
                <td>{{ user.displayName || '-' }}</td>
              </template>

              <!-- 豎屏第二行：操作 -->
              <template #actions>
                <el-switch
                  v-model="user.status"
                  active-value="active"
                  inactive-value="inactive"
                  inline-prompt
                  active-text="啟用"
                  inactive-text="停用"
                  @change="toggleUserStatus(user)"
                  @click.stop
                />
                <el-button
                  v-if="isUserLocked(user)"
                  type="warning"
                  size="small"
                  @click.stop="openUnlockDrawer(user)"
                  title="解鎖此帳戶"
                >
                  <i class="fas fa-unlock"></i>
                  解鎖
                </el-button>
                <el-button type="primary" size="small" @click.stop="editUser(user)">
                  <i class="fas fa-edit"></i>
                  編輯
                </el-button>
                <el-button type="warning" size="small" @click.stop="resetPassword(user)">
                  <i class="fas fa-key"></i>
                  重設密碼
                </el-button>
                <el-button type="info" size="small" @click.stop="viewLoginLogs(user)" title="查看該用戶的登入記錄">
                  <i class="fas fa-right-to-bracket"></i>
                  記錄
                </el-button>
              </template>

              <!-- 展开内容：活动统计 -->
              <h3>
                <i class="fas fa-chart-line"></i>
                {{ user.displayName || user.userEmail }} 的活動統計
              </h3>

              <!-- 熱力圖 -->
              <div class="heatmap-section">
                <UserActivityHeatmap
                  v-if="isUserExpansionReady(user) && !loading"
                  :userEmail="user.userEmail"
                  displayMode="compact"
                  :compactDays="10"
                  @day-click="handleDayClick"
                />
              </div>

              <!-- 詳細事件面板 -->
              <div
                v-if="selectedDate && selectedUserEmail === user.userEmail"
                class="detail-section"
              >
                <UserActivityDetail
                  :userEmail="user.userEmail"
                  :date="selectedDate?.toISOString().split('T')[0] || ''"
                  :events="selectedDayEvents"
                  :canViewDetails="Boolean(canViewUserDetails(user))"
                />
              </div>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>
      
      <EmptyState
        v-if="filteredUsers.length === 0"
        parent-icon="fa-users"
        :icons="['fa-users']"
        title="沒有找到符合條件的使用者"
        :enable-animation="false"
      />

      <!-- 🆕 Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more">
        <i class="fas fa-spinner fa-spin"></i>
        <span>載入更多使用者...</span>
      </div>

      <!-- 🆕 Show count info -->
      <div v-if="filteredUsers.length > 0" class="count-info">
        顯示 {{ filteredUsers.length }} / {{ totalCount }} 位使用者
        <span v-if="hasMore" class="has-more-hint">（滾動載入更多）</span>
      </div>
    </div>
    </div>
    <!-- End of Full User Management View -->

    <!-- No Permission State -->
    <div v-else class="no-permission">
      <i class="fas fa-lock"></i>
      <h3>無權限訪問</h3>
      <p>您沒有權限訪問此頁面</p>
    </div>

    <!-- Invitation Management Drawer -->
    <InvitationManagementDrawer
      v-show="canManageInvites === true"
      v-model:visible="showInviteDrawer"
      @refresh="refreshUsers"
    />

    <!-- Password Reset Drawer (Single user only - batch disabled for security) -->
    <PasswordResetDrawer
      v-model:visible="showPasswordResetDrawer"
      :user="(selectedUser as any)"
      @confirm="handlePasswordResetConfirm"
    />

    <!-- DISABLED: User Tag Management Modal - tags system disabled -->
    <!--
    <div v-if="showTagManagementModal" class="modal-overlay" @click="showTagManagementModal = false">
      <div class="modal-content tag-modal" @click.stop>
        <div class="modal-header">
          <h3><i class="fas fa-tags"></i> 管理用戶標籤</h3>
          <p>用戶: <strong>{{ selectedUser?.displayName }}</strong> ({{ selectedUser?.userEmail }})</p>
        </div>

        <div class="tag-management-body">
          <div class="current-tags-section">
            <h4><i class="fas fa-tag"></i> 目前標籤</h4>
            <div class="current-tags">
              <span
                v-for="tag in selectedUser?.tags || []"
                :key="tag.tagId"
                class="tag-badge removable"
                :style="{ backgroundColor: tag.tagColor }"
              >
                {{ tag.tagName }}
                <el-popconfirm
                  :title="`確定要移除用戶「${selectedUser.displayName}」的標籤「${tag.tagName}」嗎？`"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  @confirm="removeTagFromUser(selectedUser, tag)"
                >
                  <template #reference>
                    <button
                      class="remove-tag-btn"
                      title="移除標籤"
                    >
                      <i class="fas fa-times"></i>
                    </button>
                  </template>
                </el-popconfirm>
              </span>
              <div v-if="!selectedUser?.tags || selectedUser.tags.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                尚未分配任何標籤
              </div>
            </div>
          </div>

          <div class="available-tags-section">
            <h4><i class="fas fa-plus"></i> 可用標籤</h4>
            <div class="tag-search">
              <div style="display: flex; gap: 8px; align-items: center;">
                <input
                  type="text"
                  v-model="tagSearchText"
                  placeholder="搜尋標籤..."
                  class="search-input"
                  @keyup.enter="filterTags"
                  style="flex: 1;"
                >
                <button
                  class="btn btn-primary btn-sm"
                  @click="filterTags"
                  :disabled="!tagSearchText"
                >
                  搜尋
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  @click="clearTagSearch"
                  v-if="tagSearchText"
                >
                  清除
                </button>
              </div>
            </div>
            <div class="available-tags">
              <button
                v-for="tag in availableTagsForUser"
                :key="tag.tagId"
                class="tag-badge clickable"
                :style="{ backgroundColor: tag.tagColor }"
                @click="assignTagToUser(selectedUser, tag)"
                title="點擊分配標籤"
              >
                {{ tag.tagName }}
                <i class="fas fa-plus"></i>
              </button>
              <div v-if="availableTagsForUser.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                {{ tagSearchText ? '沒有符合條件的標籤' : '沒有可分配的標籤' }}
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showTagManagementModal = false">
            關閉
          </button>
        </div>
      </div>
    </div>
    -->


    <!-- <i class="fas fa-check-circle text-success"></i> Batch Reset Password is now handled by unified PasswordResetDrawer above -->

    <!-- Unlock User Drawer -->
    <el-drawer
      v-model="showUnlockDrawer"
      title="解鎖使用者帳戶"
      direction="btt"
      size="100%"
      :before-close="handleUnlockDrawerClose"
      class="drawer-navy"
    >
      <div class="unlock-user-content">
        <!-- Warning Alert -->
        <el-alert
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>
            <strong>警告：此操作將解鎖被鎖定的帳戶</strong>
          </template>
          <p>您即將解鎖以下使用者的帳戶：</p>
        </el-alert>

        <!-- User Info Display -->
        <div class="user-info-display" v-if="unlockingUser">
          <h4>使用者資訊</h4>
          <div class="info-item">
            <span class="label">Email:</span>
            <span class="value">{{ unlockingUser.userEmail }}</span>
          </div>
          <div class="info-item">
            <span class="label">顯示名稱:</span>
            <span class="value">{{ unlockingUser.displayName || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">鎖定狀態:</span>
            <span class="value lock-status">{{ getLockStatusText(unlockingUser) }}</span>
          </div>
          <div class="info-item" v-if="unlockingUser.lockReason">
            <span class="label">鎖定原因:</span>
            <span class="value">{{ unlockingUser.lockReason }}</span>
          </div>
          <div class="info-item">
            <span class="label">累計鎖定次數:</span>
            <span class="value">{{ unlockingUser.lockCount || 0 }} 次</span>
          </div>
        </div>

        <!-- Unlock Reason Input -->
        <div class="form-group">
          <label>解鎖理由 *</label>
          <el-input
            v-model="unlockReason"
            type="textarea"
            :rows="4"
            placeholder="請輸入解鎖理由（至少10個字元）"
            maxlength="500"
            show-word-limit
          />
          <p class="help-text">
            請詳細說明為何需要解鎖此帳戶，此理由將記錄在系統日誌中
          </p>
        </div>

        <!-- Reset Lock Count Option -->
        <div class="form-group">
          <el-checkbox v-model="resetLockCount">
            重置鎖定次數計數器
          </el-checkbox>
          <p class="help-text">
            如果勾選此選項，將重置該使用者的累計鎖定次數為 0。
            如果不勾選，只會解除當前鎖定狀態，但保留鎖定次數記錄。
          </p>
        </div>

        <!-- Confirm Input -->
        <div class="form-group">
          <label>確認操作 *</label>
          <ConfirmationInput
            v-model="unlockConfirmText"
            keyword="UNLOCK"
            hint-action="解鎖"
            @confirm="confirmUnlock"
          />
        </div>

        <!-- Action Buttons -->
        <div class="drawer-footer">
          <el-button
            type="warning"
            :loading="unlocking"
            :disabled="!canConfirmUnlock"
            @click="confirmUnlock"
          >
            <i class="fas fa-unlock"></i>
            確認解鎖
          </el-button>

          <el-button @click="closeUnlockDrawer">
            取消
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- User Edit Drawer -->
    <UserEditorDrawer
      v-model:visible="showEditUserDrawer"
      :user="(editingUser as any)"
      :global-groups="globalGroups as any[]"
      :avatar-styles="avatarStyles"
      :background-colors="backgroundColors"
      :clothes-colors="clothesColors"
      @save="saveEditingUser"
      @refresh="refreshUsers"
      @regenerate-avatar="regenerateEditingUserAvatar"
      @remove-from-global-group="removeUserFromGlobalGroup"
      @add-to-global-group="addUserToGlobalGroup"
      @update-group-allow-change="updateGroupAllowChange"
      @remove-from-project-group="removeUserFromProjectGroup"
    />
  </div>
</template>
<script lang="ts">
import { ref, reactive, computed, onMounted, watch, onErrorCaptured, onUnmounted, nextTick, inject, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useDebounceFn } from '@vueuse/core'
import { usePermissions } from '@/composables/usePermissions'
import { useAuth } from '@/composables/useAuth'
import { useExpandable } from '@/composables/useExpandable'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import { useWindowInfiniteScroll } from '@/composables/useWindowInfiniteScroll'
import { rpcClient } from '@/utils/rpc-client'
import { adminApi } from '@/api/admin'
import { getAvatarUrl, parseAvatarOptions, generateDicebearUrl } from '@/utils/avatar'
import type { User, GlobalGroup } from '@repo/shared'

// Extended User type for admin display
// Note: lockReason, lockCount, lockUntil are already in User interface
interface ExtendedUser extends User {
  walletBalance?: number
  failedLoginAttempts?: number
  maliciousLoginDetected?: boolean
  twoFactorEnabled?: boolean
  globalGroups?: GlobalGroupMembership[]
  projectGroups?: ProjectGroupMembership[]
  tags?: Array<{ tagId: string; tagName: string }>
}

// Global group membership
interface GlobalGroupMembership {
  groupId: string
  groupName: string
  permissions?: string[]
  globalPermissions?: string[]
  allowChange?: boolean
}

// Project group membership
interface ProjectGroupMembership {
  projectId: string
  projectName: string
  groupId: string
  groupName: string
  role: string
  isActive?: boolean
  allowChange?: boolean
}

// Invitation type (matching backend response)
interface Invitation {
  invitationId?: string
  code: string
  createdBy: string
  createdTime: number
  createdAt?: number
  usedAt?: number
  usedBy?: string
  expiryTime: number
  expiresAt?: number
  isActive: boolean
  maxUses?: number
  currentUses?: number
  status: 'active' | 'used' | 'expired' | 'deactivated'
  targetEmail?: string
}

// Batch invitation result type
interface BatchInviteResult {
  results: Array<{ email: string; invitationCode: string }>
  totalGenerated: number
  errors: string[]
}
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import ResponsiveTableHeader from '@/components/shared/ResponsiveTableHeader.vue'
import UserActivityHeatmap from '@/components/charts/UserActivityHeatmap.vue'
import UserActivityDetail from '@/components/shared/UserActivityDetail.vue'
import InvitationManagementDrawer from './user/InvitationManagementDrawer.vue'
import UserEditorDrawer from './user/UserEditorDrawer.vue'
import PasswordResetDrawer from './user/PasswordResetDrawer.vue'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'

export default {
  name: 'UserManagement',
  components: {
    ExpandableTableRow,
    ResponsiveTableHeader,
    UserActivityHeatmap,
    UserActivityDetail,
    InvitationManagementDrawer,
    UserEditorDrawer,
    PasswordResetDrawer,
    EmptyState,
    AdminFilterToolbar,
    AnimatedStatistic,
    ConfirmationInput
  },
  setup() {
    const route = useRoute()
    const router = useRouter()

    // Permission checks
    const { hasPermission, hasAnyPermission } = usePermissions()

    // Authentication state (Vue 3 Best Practice)
    const { user, userEmail, isAuthenticated } = useAuth()

    const canManageUsers = computed(() =>
      hasAnyPermission(['manage_users', 'system_admin'])
    )
    const canManageInvites = computed(() =>
      hasAnyPermission(['generate_invites', 'system_admin'])
    )
    // Error handler
    onErrorCaptured((err, instance, info) => {
      console.error('=== Error in UserManagement ===')
      console.error('Error:', err)
      console.error('Message:', err.message)
      console.error('Stack:', err.stack)
      console.error('Info:', info)
      return false
    })

    // Register refresh function with parent SystemAdmin
    const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

    // Register action function with parent SystemAdmin
    const registerAction = inject<(fn: (() => void) | null) => void>('registerAction', () => {})

    const users = ref<ExtendedUser[]>([])

    // 🆕 Pagination state for lazy loading
    const BATCH_SIZE = 50
    const totalCount = ref<number>(0)
    const currentOffset = ref<number>(0)
    const hasMore = computed(() => users.value.length < totalCount.value)

    // 過濾器持久化
    const { filters, resetFilters, isLoaded } = useFilterPersistence('userManagement', {
      searchText: '',
      statusFilter: '',
      groupFilter: [] as string[]
    })

    // 為了向後兼容，保留原有的 ref (指向 filters 中的值)
    const searchText = computed({
      get: () => filters.value.searchText,
      set: (val) => { filters.value.searchText = val }
    })
    const statusFilter = computed({
      get: () => filters.value.statusFilter,
      set: (val) => { filters.value.statusFilter = val }
    })
    const groupFilter = computed({
      get: () => filters.value.groupFilter || [],
      set: (val) => { filters.value.groupFilter = val }
    })

    // 計算啟用的過濾器數量
    const activeFilterCount = computed(() => {
      let count = 0
      if (filters.value.searchText && filters.value.searchText.trim() !== '') count++
      if (filters.value.statusFilter && filters.value.statusFilter !== '') count++
      if (filters.value.groupFilter && filters.value.groupFilter.length > 0) count++
      return count
    })

    // 重置過濾器（包含用戶回饋）
    const handleResetFilters = (): void => {
      resetFilters()
      ElMessage.success('已清除所有過濾條件')
    }

    const showInviteDrawer = ref(false)

    // Password Reset Drawer state (single user only)
    const showPasswordResetDrawer = ref(false)

    // DISABLED: const showTagManagementModal = ref(false) - tags system disabled
    const selectedUser = ref<ExtendedUser | null>(null)
    const generating = ref(false)
    const generatedInvite = ref<BatchInviteResult | null>(null)
    const loading = ref(false)
    const invitationsLoading = ref(false)
    const processingStatus = ref('')

    // Invitation management - 必須在 computed 之前定義
    const invitations = ref<Invitation[]>([])
    const inviteSearchText = ref('')
    const inviteStatusFilter = ref('')
    const showDeactivatedInvitations = ref(false)
    const inviteCollapse = ref<string[]>([]) // Control collapse state
    const resendingInvites = ref<Set<string>>(new Set()) // Track which invitations are being resent
    
    // DISABLED: Tag management - tags system disabled
    // const allTags = ref([])
    // const tagSearchText = ref('')
    // const filteredTagSearchText = ref('') // 實際用於過濾的搜尋文字
    
    // User editing
    const showEditUserDrawer = ref(false)
    const editingUser = ref<ExtendedUser | null>(null)
    const originalUser = ref<ExtendedUser | null>(null)
    // DISABLED: const selectedTagsToAdd = ref([]) - tags system disabled
    const selectedGroupsToAdd = ref<string[]>([])
    const userGlobalGroups = ref<GlobalGroupMembership[]>([])
    const saving = ref(false)
    const loadingUserData = ref(false)

    // User activity statistics (for expansion) - using useExpandable composable
    const selectedDate = ref<Date | null>(null)
    const selectedDayEvents = ref<any[]>([])
    const selectedUserEmail = ref<string | null>(null)

    // Use expandable composable for user expansion management
    const {
      expandedIds: expandedUserEmails,
      isExpanded: isUserExpanded,
      collapseAll: collapseAllUsers
    } = useExpandable({ singleMode: true })
    
    // Avatar management
    const regeneratingAvatar = ref(false)
    const avatarError = ref(false)
    const currentAvatarOptions = ref({})
    
    // Editing user avatar management
    const regeneratingEditingUserAvatar = ref(false)
    const editingUserAvatarError = ref(false)
    const editingUserAvatarChanged = ref(false)
    const editingUserAvatarOptions = ref<Record<string, string>>({
      backgroundColor: 'b6e3f4',
      clothesColor: '3c4858',
      skinColor: 'ae5d29'
    })
    const savingEditingUser = ref(false)

    // ✨ Avatar error handling state
    const verifiedConfigs = ref<any[]>([])
    const retryCount = ref(0)
    const isRetrying = ref(false)
    const isInFallbackMode = ref(false)
    const maxRetries = 3

    // Global groups management
    const globalGroups = ref<GlobalGroup[]>([])
    const selectedGlobalGroupToAdd = ref('')

    // Project groups management
    const userProjectGroups = ref<ProjectGroupMembership[]>([])
    const loadingUserProjectGroups = ref(false)
    const updatingGroupSettings = ref<Set<string>>(new Set())
    const removingFromGroups = ref<Set<string>>(new Set())

    // Batch operations management
    const selectedUserEmails = ref<Set<string>>(new Set())
    const batchUpdatingStatus = ref(false)

    // Unlock user management
    const showUnlockDrawer = ref(false)
    const unlockingUser = ref<ExtendedUser | null>(null)
    const unlockReason = ref('')
    const unlockConfirmText = ref('')
    const resetLockCount = ref(false)
    const unlocking = ref(false)

    // Old teacher privilege management - replaced by comprehensive permissions

    const avatarStyles = [
      { value: 'avataaars', label: '卡通風格' },
      { value: 'bottts', label: '機器人' },
      { value: 'identicon', label: '幾何圖形' },
      { value: 'initials', label: '首字母' },
      { value: 'personas', label: '人物風格' },
      { value: 'pixel-art', label: '像素風格' }
    ]
    
    const backgroundColors = [
      { value: 'b6e3f4', label: '淺藍色' },
      { value: 'c0aede', label: '淺紫色' },
      { value: 'd1d4f9', label: '淺靛色' },
      { value: 'ffd93d', label: '黃色' },
      { value: '6bcf7f', label: '綠色' },
      { value: 'ffb3ba', label: '粉色' },
      { value: 'ffdfba', label: '橘色' },
      { value: 'bae1ff', label: '天藍色' }
    ]
    
    const clothesColors = [
      { value: '3c4858', label: '深藍色' },
      { value: 'e74c3c', label: '紅色' },
      { value: '2ecc71', label: '綠色' },
      { value: 'f1c40f', label: '黃色' },
      { value: '9b59b6', label: '紫色' },
      { value: 'ecf0f1', label: '白色' },
      { value: '34495e', label: '深灰色' },
      { value: 'e67e22', label: '橘色' }
    ]

    // Available global permissions (for display purposes)
    const availablePermissions = [
      { 
        code: 'create_project', 
        name: '建立專案', 
        description: '可以建立新的專案',
        icon: 'fas fa-plus-circle'
      },
      { 
        code: 'system_admin', 
        name: '系統管理員', 
        description: '完整的系統管理權限',
        icon: 'fas fa-cogs'
      },
      { 
        code: 'manage_users', 
        name: '使用者管理', 
        description: '管理使用者帳號和權限',
        icon: 'fas fa-users'
      },
      { 
        code: 'generate_invites', 
        name: '產生邀請碼', 
        description: '生成新的邀請碼',
        icon: 'fas fa-envelope'
      },
      { 
        code: 'view_system_logs', 
        name: '查看系統日誌', 
        description: '查看系統操作記錄',
        icon: 'fas fa-list-alt'
      },
      {
        code: 'manage_global_groups',
        name: '管理全域群組',
        description: '建立和管理全域群組',
        icon: 'fas fa-layer-group'
      }
      // DISABLED: manage_tags permission - tags system disabled
      /*
      {
        code: 'manage_tags',
        name: '管理標籤',
        description: '建立和管理標籤系統',
        icon: 'fas fa-tags'
      }
      */
    ]

    const inviteForm = reactive({
      targetEmails: '',
      validDays: 7,
      // DISABLED: defaultTags: [], // Array of tag IDs to assign to new users - tags system disabled
      defaultGlobalGroups: [] as string[] // Array of global group IDs to assign to new users
    })

    // 使用 computed 來計算統計數據
    const stats = computed(() => {
      try {
        const usersArray = users.value || []
        const result = {
          totalUsers: usersArray.length,
          activeUsers: usersArray.filter(u => u.status === 'active').length,
          inactiveUsers: usersArray.filter(u => u.status === 'disabled').length
        }
        console.log('Stats computed:', result)
        return result
      } catch (error) {
        console.error('Error in stats computed:', error)
        return {
          totalUsers: 0,
          activeUsers: 0,
          inactiveUsers: 0
        }
      }
    })

    // <i class="fas fa-check-circle text-success"></i> Server-side filtering - no more client-side computed filtering
    const filteredUsers = computed(() => users.value || [])

    // 匯出配置
    const exportConfig = computed(() => ({
      data: filteredUsers.value,
      filename: '用戶列表',
      headers: ['Email', '顯示名稱', '狀態', '註冊時間', '最後登入時間'],
      rowMapper: (user: any) => [
        user.userEmail,
        user.displayName,
        user.status === 'active' ? '活躍' : '停用',
        user.registrationTime ? new Date(user.registrationTime).toLocaleString('zh-TW') : '-',
        user.lastLoginTime ? new Date(user.lastLoginTime).toLocaleString('zh-TW') : '-'
      ]
    }))

    // Batch selection computed properties
    const showBatchActions = computed(() => selectedUserEmails.value.size > 0)

    const isAllSelected = computed(() => {
      return filteredUsers.value.length > 0 &&
        filteredUsers.value.every(user => selectedUserEmails.value.has(user.userEmail))
    })

    const isSomeSelected = computed(() => {
      return selectedUserEmails.value.size > 0 && !isAllSelected.value
    })

    const canConfirmUnlock = computed(() => {
      return unlockConfirmText.value.toUpperCase() === 'UNLOCK' &&
        unlockReason.value.length >= 10
    })

    // Invitation management computed properties
    const filteredInvitations = computed(() => {
      let filtered = invitations.value || []

      // 根據開關決定是否顯示停用的邀請碼
      if (!showDeactivatedInvitations.value) {
        filtered = filtered.filter(invite => 
          invite.status !== 'deactivated'
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
    
    // DISABLED: availableTagsForUser - tags system disabled
    /*
    const availableTagsForUser = computed(() => {
      try {
        if (!selectedUser.value) return []

        const userTagIds = (selectedUser.value.tags || []).map(t => t && t.tagId).filter(Boolean)
        let filtered = (allTags.value || []).filter(tag => tag && tag.tagId && !userTagIds.includes(tag.tagId))

        if (filteredTagSearchText.value) {
          const search = filteredTagSearchText.value.toLowerCase()
          filtered = filtered.filter(tag =>
            tag && tag.tagName && tag.tagName.toLowerCase().includes(search) ||
            (tag && tag.description && tag.description.toLowerCase().includes(search))
          )
        }

        return filtered || []
      } catch (error) {
        console.error('Error in availableTagsForUser computed:', error)
        return []
      }
    })
    */

    // DISABLED: availableTagsForEditingUser - tags system disabled
    /*
    const availableTagsForEditingUser = computed(() => {
      try {
        if (!editingUser.value) return []

        const userTagIds = (editingUser.value.tags || []).map(t => t && t.tagId).filter(Boolean)
        return (allTags.value || []).filter(tag =>
          tag && tag.isActive && tag.tagId && !userTagIds.includes(tag.tagId)
        ) || []
      } catch (error) {
        console.error('Error in availableTagsForEditingUser computed:', error)
        return []
      }
    })
    */
    
    // Compute user's global permissions based on group memberships
    const userGlobalPermissions = computed(() => {
      try {
        if (!editingUser.value || !editingUser.value.globalGroups) return []
        
        const userPermissions = new Set()
        
        // Iterate through user's global groups
        editingUser.value.globalGroups.forEach(group => {
          if (group.globalPermissions) {
            try {
              const permissions = typeof group.globalPermissions === 'string' 
                ? JSON.parse(group.globalPermissions) 
                : group.globalPermissions
              
              if (Array.isArray(permissions)) {
                permissions.forEach(permissionCode => {
                  userPermissions.add(permissionCode)
                })
              }
            } catch (error) {
              console.error('Error parsing group permissions:', error)
            }
          }
        })
        
        // Map permission codes to display objects
        return availablePermissions.filter(permission => 
          userPermissions.has(permission.code)
        )
      } catch (error) {
        console.error('Error computing user global permissions:', error)
        return []
      }
    })

    const availableGlobalGroups = computed(() => {
      if (!editingUser.value) return []
      const userGroupIds = (editingUser.value.globalGroups || []).map(g => g.groupId)
      return (globalGroups.value || []).filter(group => 
        !userGroupIds.includes(group.groupId)
      )
    })
    
    // Current avatar URL (shows the actual current avatar)
    const currentAvatarUrl = computed(() => {
      if (avatarError.value || !originalUser.value) {
        return generateInitialsAvatar(originalUser.value)
      }
      
      const seed = originalUser.value.avatarSeed || `${originalUser.value.userEmail}_${Date.now()}`
      const style = originalUser.value.avatarStyle || 'avataaars'
      
      // Parse avatarOptions from original user data
      let options = {}
      if (originalUser.value.avatarOptions) {
        if (typeof originalUser.value.avatarOptions === 'string') {
          try {
            options = JSON.parse(originalUser.value.avatarOptions)
          } catch (e) {
            console.warn('Failed to parse avatarOptions:', e)
            options = {}
          }
        } else {
          options = originalUser.value.avatarOptions
        }
      }
      
      return generateDicebearUrl(seed, style, options)
    })
    
    // Preview avatar URL (shows changes)
    const previewAvatarUrl = computed(() => {
      if (avatarError.value || !editingUser.value) {
        return generateInitialsAvatar(editingUser.value)
      }
      
      const seed = editingUser.value.avatarSeed || `${editingUser.value.userEmail}_${Date.now()}`
      const style = editingUser.value.avatarStyle || 'avataaars'
      
      // Parse avatarOptions from string if needed (consistent with UserSettings)
      let options = {}
      if (editingUser.value.avatarOptions) {
        if (typeof editingUser.value.avatarOptions === 'string') {
          try {
            options = JSON.parse(editingUser.value.avatarOptions)
          } catch (e) {
            console.warn('Failed to parse avatarOptions:', e)
            options = {}
          }
        } else {
          options = editingUser.value.avatarOptions
        }
      }
      
      // Use currentAvatarOptions for any runtime changes
      const mergedOptions = { ...options, ...currentAvatarOptions.value }
      
      return generateDicebearUrl(seed, style, mergedOptions)
    })
    
    // Check if there are avatar changes
    const hasAvatarChanges = computed(() => {
      if (!originalUser.value || !editingUser.value) return false
      
      return (
        originalUser.value.avatarStyle !== editingUser.value.avatarStyle ||
        originalUser.value.avatarSeed !== editingUser.value.avatarSeed ||
        JSON.stringify(originalUser.value.avatarOptions) !== JSON.stringify(editingUser.value.avatarOptions) ||
        Object.keys(currentAvatarOptions.value).length > 0
      )
    })
    
    // Editing user avatar URL
    const editingUserAvatarUrl = computed(() => {
      if (isInFallbackMode.value || !editingUser.value) {
        return generateInitialsAvatar(editingUser.value)
      }

      const seed = editingUser.value.avatarSeed || `${editingUser.value.userEmail}_${Date.now()}`
      const style = editingUser.value.avatarStyle || 'avataaars'

      // Use editingUserAvatarOptions for current changes
      return generateDicebearUrl(seed, style, editingUserAvatarOptions.value)
    })
    
    // Check if there are any changes to save
    const hasUserChanges = computed(() => {
      if (!originalUser.value || !editingUser.value) return false

      // Check basic fields
      if (originalUser.value.displayName !== editingUser.value.displayName ||
          originalUser.value.status !== editingUser.value.status ||
          editingUserAvatarChanged.value) {
        return true
      }

      // Check if tags have changed
      const originalTagIds = (originalUser.value.tags || []).map(t => t.tagId).sort()
      const currentTagIds = (editingUser.value.tags || []).map(t => t.tagId).sort()

      if (originalTagIds.length !== currentTagIds.length) {
        return true
      }

      for (let i = 0; i < originalTagIds.length; i++) {
        if (originalTagIds[i] !== currentTagIds[i]) {
          return true
        }
      }

      // Check if global groups have changed
      const originalGroupIds = (originalUser.value.globalGroups || []).map(g => g.groupId).sort()
      const currentGroupIds = (editingUser.value.globalGroups || []).map(g => g.groupId).sort()

      if (originalGroupIds.length !== currentGroupIds.length) {
        return true
      }

      for (let i = 0; i < originalGroupIds.length; i++) {
        if (originalGroupIds[i] !== currentGroupIds[i]) {
          return true
        }
      }

      return false
    })

    const formatTime = (timestamp: number | null | undefined): string | null => {
      if (!timestamp) return null
      return new Date(timestamp).toLocaleString('zh-TW')
    }

    // Check if user is locked
    const isUserLocked = (user: ExtendedUser | null): boolean => {
      if (!user) return false
      const now = Date.now()
      // Check temporary lock
      const isTemporarilyLocked = user.lockUntil && user.lockUntil > now
      // Check permanent disable
      const isPermanentlyDisabled = user.status === 'disabled'
      return isTemporarilyLocked || isPermanentlyDisabled
    }

    // Get lock status text for display
    const getLockStatusText = (user: ExtendedUser | null): string => {
      if (!user) return ''
      const now = Date.now()
      if (user.lockUntil && user.lockUntil > now) {
        const lockDate = new Date(user.lockUntil)
        return `鎖定至 ${lockDate.toLocaleString('zh-TW')}`
      }
      if (user.status === 'disabled') {
        return '永久停用'
      }
      return ''
    }

    // Get avatar URL for user list display
    const getUserAvatarUrl = (user: ExtendedUser | null): string => {
      if (!user) return ''

      const seed = user.avatarSeed || `${user.userEmail}_${Date.now()}`
      const style = user.avatarStyle || 'avataaars'
      const options = parseAvatarOptions(user.avatarOptions)

      return generateDicebearUrl(seed, style, options)
    }

    // Generate initials for avatar fallback
    const getUserInitials = (user: ExtendedUser | null): string => {
      if (!user) return 'U'
      const name = user.displayName || user.userEmail || 'User'
      return name
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
    }

    // 安全地獲取 stats 值
    const getStatValue = (key: 'totalUsers' | 'activeUsers' | 'inactiveUsers'): number => {
      try {
        const statsObj = stats.value
        if (statsObj && typeof statsObj === 'object' && key in statsObj) {
          return statsObj[key]
        }
        return 0
      } catch (error) {
        console.error('Error getting stat value:', key, error)
        return 0
      }
    }

    // 🆕 loadingMore state for infinite scroll
    const loadingMore = ref(false)

    const loadUsers = async (append: boolean = false) => {
      console.log('=== loadUsers called ===', { append })

      if (append) {
        loadingMore.value = true
      } else {
        loading.value = true
        currentOffset.value = 0
      }

      try {
        if (!append) {
          ElMessage.info('開始更新使用者列表')
        }

        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const queryParams = {
          search: searchText.value || undefined,
          status: (statusFilter.value || undefined) as any,
          groupIds: groupFilter.value.length > 0 ? groupFilter.value : undefined,
          sortBy: 'registrationTime',
          sortOrder: 'desc',
          limit: BATCH_SIZE,
          offset: append ? currentOffset.value : 0
        }

        console.log('Calling API: /admin/users/list with filters:', queryParams)

        const response = await adminApi.users.list(queryParams as any)

        console.log('API Response:', response)

        if (response.success && response.data) {
          // Backend returns either:
          // - Old format: data is directly an array
          // - New format: data is { users: [...], totalCount: n, ... }
          const data = response.data as any
          const usersList = (Array.isArray(data) ? data : data.users || []) as ExtendedUser[]

          if (append) {
            // Append new users, avoiding duplicates
            const existingEmails = new Set(users.value.map(u => u.userEmail))
            const uniqueNewUsers = usersList.filter(u => !existingEmails.has(u.userEmail))
            users.value = [...users.value, ...uniqueNewUsers]
            currentOffset.value += usersList.length
          } else {
            users.value = usersList
            currentOffset.value = usersList.length
          }

          // Update totalCount from response
          totalCount.value = data.totalCount || usersList.length

          console.log('Users loaded:', users.value.length, 'users, total:', totalCount.value)
          if (!append) {
            ElMessage.success('使用者列表資料下載完成')
          }
        } else {
          console.error('Failed to load users:', response.error)
          if (!append) {
            users.value = [] // 確保有預設值
          }
          ElMessage.error(`無法載入使用者資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading users:', error)
        if (!append) {
          users.value = [] // 確保在錯誤情況下也有預設值
        }
        ElMessage.error('載入使用者資料失敗，請重試')
      } finally {
        loading.value = false
        loadingMore.value = false
        console.log('loadUsers completed, loading:', loading.value)
      }
    }

    // 🆕 Load more function for infinite scroll
    const loadMore = () => {
      if (hasMore.value && !loading.value && !loadingMore.value) {
        loadUsers(true)
      }
    }

    // 🆕 使用頁面級無限滾動
    useWindowInfiniteScroll(
      hasMore,
      computed(() => loading.value || loadingMore.value),
      loadMore
    )

    const refreshUsers = () => {
      loadUsers(false)
    }

    const openInviteManagement = () => {
      // Navigate to invitation route, the watcher will handle opening the drawer
      router.push({ name: 'admin-users-invitation' })
    }

    const toggleUserStatus = async (user: ExtendedUser) => {
      try {
        const newStatus = user.status === 'active' ? 'disabled' : 'active'

        // 使用管理員專用API更新用戶狀態
        const response = await adminApi.users.updateStatus({
          targetEmail: user.userEmail,
          status: newStatus
        } as any)
        
        if (response.success) {
          user.status = newStatus
          ElMessage.error(`用戶狀態已${newStatus === 'active' ? '啟用' : '停用'}`)
        } else {
          ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Toggle user status error:', error)
        ElMessage.error('操作失敗，請重試')
      }
    }

    // <i class="fas fa-check-circle text-success"></i> Open password reset drawer for single user
    const resetPassword = (user: ExtendedUser) => {
      selectedUser.value = user
      showPasswordResetDrawer.value = true
    }

    // Password reset handler (single user only - batch mode disabled for security)
    // Backend auto-generates random password and emails it to user
    const handlePasswordResetConfirm = async ({ userEmail }: { userEmail: string }) => {
      try {
        // Vue 3 Best Practice: adminApi automatically handles authentication
        const response = await adminApi.users.resetPassword({
          targetEmail: userEmail
        } as any)

        if (response.success) {
          ElMessage.success('密碼重設成功，新密碼已發送至使用者信箱')
          showPasswordResetDrawer.value = false
          await loadUsers()
        } else {
          ElMessage.error(`密碼重設失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Password reset error:', error)
        ElMessage.error(`密碼重設失敗: ${(error as any).message || '未知錯誤'}`)
      }
    }

    // DISABLED: toggleDefaultTag - tags system disabled
    /*
    const toggleDefaultTag = (tagId) => {
      const index = inviteForm.defaultTags.indexOf(tagId)
      if (index === -1) {
        inviteForm.defaultTags.push(tagId)
      } else {
        inviteForm.defaultTags.splice(index, 1)
      }
    }
    */

    const toggleDefaultGlobalGroup = (groupId: string) => {
      const index = inviteForm.defaultGlobalGroups.indexOf(groupId)
      if (index === -1) {
        inviteForm.defaultGlobalGroups.push(groupId)
      } else {
        inviteForm.defaultGlobalGroups.splice(index, 1)
      }
    }

    // DISABLED: 新增方法：根據ID獲取標籤 - tags system disabled
    /*
    const getTagById = (tagId) => {
      return allTags.value.find(tag => tag.tagId === tagId)
    }
    */

    // 新增方法：根據ID獲取全域群組
    const getGlobalGroupById = (groupId: string) => {
      return globalGroups.value.find(group => group.groupId === groupId)
    }

    // DISABLED: 新增方法：移除預設標籤 - tags system disabled
    /*
    const removeDefaultTag = (tagId) => {
      const index = inviteForm.defaultTags.indexOf(tagId)
      if (index !== -1) {
        inviteForm.defaultTags.splice(index, 1)
      }
    }
    */

    // 新增方法：移除預設全域群組
    const removeDefaultGlobalGroup = (groupId: string) => {
      const index = inviteForm.defaultGlobalGroups.indexOf(groupId)
      if (index !== -1) {
        inviteForm.defaultGlobalGroups.splice(index, 1)
      }
    }

    // 編輯使用者相關方法
    // DISABLED: removeSelectedTag - tags system disabled
    /*
    const removeSelectedTag = (tagId) => {
      const index = selectedTagsToAdd.value.indexOf(tagId)
      if (index !== -1) {
        selectedTagsToAdd.value.splice(index, 1)
      }
    }
    */

    const removeSelectedGroup = (groupId: string) => {
      const index = selectedGroupsToAdd.value.indexOf(groupId)
      if (index !== -1) {
        selectedGroupsToAdd.value.splice(index, 1)
      }
    }

    // DISABLED: removeUserTag - tags system disabled (backend router not available)
    /*
    const removeUserTag = async (tag) => {
      try {
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/unassign/user', {
        //   userEmail: editingUser.value.userEmail,
        //   tagId: tag.tagId
        // })

        if (response.success) {
          // 從使用者標籤中移除
          editingUser.value.tags = editingUser.value.tags.filter(t => t.tagId !== tag.tagId)
          ElMessage.success(`標籤「${tag.tagName}」已移除`)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing tag from user:', error)
        ElMessage.error('移除標籤失敗，請重試')
      }
    }
    */

    const removeUserFromGroup = async (membership: GlobalGroupMembership) => {
      const groupName = getGlobalGroupById(membership.groupId)?.groupName || membership.groupId
      try {
        const response = await adminApi.globalGroups.removeUser({
          groupId: membership.groupId,
          userEmail: editingUser.value!.userEmail
        })

        if (response.success) {
          // 從群組列表中移除
          userGlobalGroups.value = userGlobalGroups.value.filter(g => g.groupId !== membership.groupId)
          ElMessage.success(`已從群組「${groupName}」中移除`)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from group:', error)
        ElMessage.error('移除群組失敗，請重試')
      }
    }

    const loadUserGlobalGroups = async (userEmail: string) => {
      try {
        const response = await adminApi.users.globalGroups({
          targetEmail: userEmail
        } as any)

        if (response.success && response.data) {
          userGlobalGroups.value = response.data
        } else {
          userGlobalGroups.value = []
        }
      } catch (error) {
        console.error('Error loading user global groups:', error)
        userGlobalGroups.value = []
      }
    }

    const generateInvite = async () => {
      // 驗證必填欄位
      if (!inviteForm.targetEmails || !inviteForm.targetEmails.trim()) {
        ElMessage.error('請輸入受邀者的Email地址')
        return
      }
      
      // 解析Email列表
      const emailList = inviteForm.targetEmails
        .split('\n')
        .map(email => email.trim())
        .filter(email => email.length > 0)
      
      if (emailList.length === 0) {
        ElMessage.error('請輸入至少一個Email地址')
        return
      }
      
      // 驗證Email格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const invalidEmails = emailList.filter(email => !emailRegex.test(email))
      if (invalidEmails.length > 0) {
        ElMessage.error(`以下Email格式不正確: ${invalidEmails.join(', ')}`)
        return
      }
      
      generating.value = true

      try {
        // Vue 3 Best Practice: rpcClient automatically handles authentication

        // 批次處理Email，每批最多50個
        const results: Array<{ email: string; invitationCode: string; expiryTime?: number }> = []
        const errors: string[] = []
        const BATCH_SIZE = 50
        
        // 將emailList分批處理
        const batches = []
        for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
          batches.push(emailList.slice(i, i + BATCH_SIZE))
        }
        
        // 初始化進度狀態
        processingStatus.value = `正在處理 0/${emailList.length} 個邀請...`
        
        // 處理每一批
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          const batchStartIndex = batchIndex * BATCH_SIZE
          
          // 更新批次進度
          processingStatus.value = `正在處理第 ${batchIndex + 1}/${batches.length} 批 (每批最多 ${BATCH_SIZE} 個)`
          
          // 如果批次內少於50個，後端會自動處理
          if (batch.length < BATCH_SIZE) {
            // 單一請求發送整批
            try {
              const httpResponse = await rpcClient.invitations['generate-batch'].$post({
                json: {
                  targetEmails: batch,
                  validDays: inviteForm.validDays,
                  // DISABLED: defaultTags: inviteForm.defaultTags,
                  defaultGlobalGroups: inviteForm.defaultGlobalGroups
                }
              })
              const response = await httpResponse.json()
              
              if (response.success && response.data) {
                // 處理批次結果
                const data = response.data as any
                data.results.forEach((result: { email: string; invitationCode: string; expiryTime?: number }) => {
                  results.push(result)
                  console.log(`✅ ${result.email}: 邀請碼生成成功`)
                })

                if (data.errors) {
                  data.errors.forEach((err: string) => {
                    errors.push(err)
                    console.log(`❌ ${err}`)
                  })
                }
              } else {
                batch.forEach(email => {
                  errors.push(`${email}: 批次請求失敗`)
                  console.log(`❌ ${email}: 批次請求失敗`)
                })
              }
            } catch (error) {
              batch.forEach(email => {
                errors.push(`${email}: 網路請求失敗`)
                console.log(`❌ ${email}: 網路請求失敗 - ${(error as Error).message}`)
              })
            }
          } else {
            // 批次大小為50，逐個處理以顯示進度
            for (let i = 0; i < batch.length; i++) {
              const email = batch[i]
              const overallIndex = batchStartIndex + i + 1
              
              // 更新進度顯示
              processingStatus.value = `正在處理 ${overallIndex}/${emailList.length} 個邀請: ${email}`
              
              try {
                const httpResponse = await rpcClient.invitations.generate.$post({
                  json: {
                    targetEmail: email,
                    validDays: inviteForm.validDays,
                    // DISABLED: defaultTags: inviteForm.defaultTags,
                    defaultGlobalGroups: inviteForm.defaultGlobalGroups
                  }
                })
                const response = await httpResponse.json()
                
                if (response.success && response.data) {
                  results.push({
                    email: email,
                    invitationCode: response.data.invitationCode || response.data.code,
                    expiryTime: response.data.expiryTime
                  })
                  console.log(`✅ ${email}: 邀請碼生成成功`)
                } else {
                  errors.push(`${email}: ${response.error?.message || '未知錯誤'}`)
                  console.log(`❌ ${email}: ${response.error?.message || '未知錯誤'}`)
                }
              } catch (error) {
                errors.push(`${email}: 請求失敗`)
                console.log(`❌ ${email}: 請求失敗 - ${(error as Error).message}`)
              }
            }
          }
        }
        
        // 設定生成結果
        if (results.length > 0) {
          generatedInvite.value = {
            results: results,
            totalGenerated: results.length,
            errors: errors
          }
          
          // 重新載入邀請碼列表
          await loadInvitations()

          if (errors.length === 0) {
            ElMessage.success(`成功為 ${results.length} 個Email生成邀請碼，邀請信正在發送中`)
          } else {
            ElMessage.warning(`成功生成 ${results.length} 個邀請碼（邀請信正在發送中），${errors.length} 個失敗`)
          }
          
          // 清空表單
          inviteForm.targetEmails = ''
          // DISABLED: inviteForm.defaultTags = []
          inviteForm.defaultGlobalGroups = []
        } else {
          ElMessage.error(`所有邀請碼生成失敗: ${errors.join('; ')}`)
        }
      } catch (error) {
        console.error('Generate invite error:', error)
        ElMessage.error('生成邀請碼失敗，請重試')
      } finally {
        generating.value = false
        processingStatus.value = '' // 清空進度狀態
      }
    }

    const copyInviteCode = () => {
      if (generatedInvite.value && generatedInvite.value.results.length > 0) {
        navigator.clipboard.writeText(generatedInvite.value.results[0].invitationCode)
        ElMessage.success('邀請碼已複製到剪貼板')
      }
    }

    const copySpecificCode = (code: string) => {
      navigator.clipboard.writeText(code)
      ElMessage.success('邀請碼已複製到剪貼板')
    }

    const copyAllCodes = () => {
      if (generatedInvite.value && generatedInvite.value.results) {
        const allCodes = generatedInvite.value.results
          .map(result => `${result.email} > ${result.invitationCode}`)
          .join('\n')
        navigator.clipboard.writeText(allCodes)
        ElMessage.success(`已複製 ${generatedInvite.value.results.length} 個邀請碼到剪貼板`)
      }
    }

    // Invitation management methods
    const loadInvitations = async () => {
      invitationsLoading.value = true
      try {
        ElMessage.info('開始更新邀請碼列表')

        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.invitations.list.$post({
          json: {}
        })
        const response = await httpResponse.json()
        
        if (response.success && response.data) {
          invitations.value = response.data
          ElMessage.success('邀請碼列表資料下載完成')
        } else {
          console.error('Failed to load invitations:', response.error)
          ElMessage.error(`無法載入邀請碼資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading invitations:', error)
        ElMessage.error('載入邀請碼資料失敗，請重試')
      } finally {
        invitationsLoading.value = false
      }
    }

    const copyInvitationCode = (code: string) => {
      navigator.clipboard.writeText(code)
      ElMessage.success('邀請碼已複製到剪貼板')
    }

    const resendInvitationEmail = async (invitation: Invitation) => {
      try {
        // Add to resending set
        resendingInvites.value.add(invitation.invitationId!)

        const httpResponse = await rpcClient.invitations['resend-email'].$post({
          json: {
            invitationId: invitation.invitationId
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success(`邀請信已重新發送至 ${invitation.targetEmail}`)

          // Reload invitations to get updated email sent time
          await loadInvitations()
        } else {
          if (response.error?.code === 'NO_DISPLAY_CODE') {
            ElMessage.error('無法重送：邀請碼已被隱藏，請聯繫管理員')
          } else if (response.error?.code === 'INVITATION_EXPIRED') {
            ElMessage.error('無法重送：邀請碼已過期')
          } else if (response.error?.code === 'EMAIL_SEND_FAILED') {
            ElMessage.error('郵件發送失敗，請檢查 SMTP 設定')
          } else {
            ElMessage.error(`重送失敗: ${response.error?.message || '未知錯誤'}`)
          }
        }
      } catch (error) {
        console.error('Error resending invitation email:', error)
        ElMessage.error('重送邀請信失敗，請重試')
      } finally {
        // Remove from resending set
        resendingInvites.value.delete(invitation.invitationId!)
      }
    }

    const deactivateInvitation = async (invitation: Invitation) => {
      try {
        const httpResponse = await rpcClient.invitations.deactivate.$post({
          json: {
            invitationId: invitation.invitationId!
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          // 重新載入邀請碼列表以獲取最新狀態
          await loadInvitations()

          ElMessage.success('邀請碼已停用，列表已更新')
        } else {
          ElMessage.error(`停用失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error deactivating invitation:', error)
        ElMessage.error('停用失敗，請重試')
      }
    }

    // ========================================
    // BATCH OPERATIONS
    // ========================================

    // Toggle user selection
    const toggleUserSelection = (userEmail: string) => {
      if (selectedUserEmails.value.has(userEmail)) {
        selectedUserEmails.value.delete(userEmail)
      } else {
        selectedUserEmails.value.add(userEmail)
      }
    }

    // Toggle select all
    const toggleSelectAll = () => {
      if (isAllSelected.value) {
        selectedUserEmails.value.clear()
      } else {
        filteredUsers.value.forEach(user => {
          selectedUserEmails.value.add(user.userEmail)
        })
      }
    }

    // Clear selection
    const clearSelection = () => {
      selectedUserEmails.value.clear()
    }

    // Batch activate users
    const batchActivateUsers = async () => {
      await batchUpdateStatus('active')
    }

    // Batch deactivate users
    const batchDeactivateUsers = async () => {
      await batchUpdateStatus('disabled')
    }

    // Batch update status
    const batchUpdateStatus = async (status: 'active' | 'disabled') => {
      const userEmails = Array.from(selectedUserEmails.value)

      try {
        const confirmed = await ElMessageBox.confirm(
          `確定要將 ${userEmails.length} 位使用者設為${status === 'active' ? '啟用' : '停用'}嗎？`,
          '批量操作確認',
          {
            confirmButtonText: '確定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        if (!confirmed) return
      } catch {
        return // User cancelled
      }

      batchUpdatingStatus.value = true

      try {
        const response = await adminApi.users.batchUpdateStatus({
          targetEmails: userEmails,
          status
        } as any)

        if (response.success && response.data) {
          const data = response.data as { successCount: number; failureCount: number; results: Array<{ success: boolean; userEmail: string }> }
          const successCount = data.successCount
          const failureCount = data.failureCount
          const batchResults = data.results

          // Update local user status
          batchResults.forEach((result) => {
            if (result.success) {
              const user = users.value.find(u => u.userEmail === result.userEmail)
              if (user) user.status = status
            }
          })

          // Show result
          if (failureCount === 0) {
            ElMessage.success(`成功更新 ${successCount} 位使用者狀態`)
          } else {
            ElMessage.warning(`成功: ${successCount}, 失敗: ${failureCount}`)
          }

          // Clear selection
          clearSelection()

          // Refresh list
          await loadUsers()
        } else {
          ElMessage.error(`批量操作失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Batch update status error:', error)
        ElMessage.error('批量操作失敗，請重試')
      } finally {
        batchUpdatingStatus.value = false
      }
    }

    // <i class="fas fa-check-circle text-success"></i> Batch reset password methods moved to unified handler above

    // ========================================
    // UNLOCK USER OPERATIONS
    // ========================================

    // Open unlock drawer
    const openUnlockDrawer = (user: ExtendedUser) => {
      unlockingUser.value = user
      unlockReason.value = ''
      unlockConfirmText.value = ''
      resetLockCount.value = false
      showUnlockDrawer.value = true
    }

    // Close unlock drawer
    const closeUnlockDrawer = () => {
      showUnlockDrawer.value = false
      unlockingUser.value = null
      unlockReason.value = ''
      unlockConfirmText.value = ''
      resetLockCount.value = false
    }

    // Confirm unlock
    const confirmUnlock = async () => {
      if (!canConfirmUnlock.value) {
        ElMessage.error('請輸入有效的解鎖理由並確認操作')
        return
      }

      if (!unlockingUser.value) {
        ElMessage.error('無效的使用者資訊')
        return
      }

      unlocking.value = true

      try {
        const response = await adminApi.users.unlock({
          targetEmail: unlockingUser.value.userEmail,
          unlockReason: unlockReason.value,
          resetLockCount: resetLockCount.value
        } as any)

        if (response.success) {
          ElMessage.success(`帳戶已解鎖：${unlockingUser.value.userEmail}`)

          // Close drawer
          closeUnlockDrawer()

          // Refresh users list
          await loadUsers()
        } else {
          if (response.error?.code === 'USER_NOT_LOCKED') {
            ElMessage.error('該使用者帳戶目前並未被鎖定')
          } else if (response.error?.code === 'USER_NOT_FOUND') {
            ElMessage.error('找不到該使用者')
          } else {
            ElMessage.error(`解鎖失敗: ${response.error?.message || '未知錯誤'}`)
          }
        }
      } catch (error) {
        console.error('Unlock user error:', error)
        ElMessage.error('解鎖失敗，請重試')
      } finally {
        unlocking.value = false
      }
    }

    // Drawer close handler
    const handleUnlockDrawerClose = (done: () => void) => {
      if (unlocking.value) {
        ElMessage.warning('操作進行中，請稍候')
        return
      }
      done()
    }

    const getInvitationStatusClass = (invitation: Invitation): string => {
      const now = Date.now()
      if (invitation.expiryTime <= now) {
        return 'expired'
      } else if (invitation.status === 'used') {
        return 'used'
      } else if (invitation.status === 'active') {
        return 'active'
      } else if (invitation.status === 'deactivated') {
        return 'deactivated'
      }
      return 'inactive'
    }

    const getInvitationStatusText = (invitation: Invitation): string => {
      const now = Date.now()
      if (invitation.expiryTime <= now) {
        return '已過期'
      } else if (invitation.status === 'used') {
        return '已使用'
      } else if (invitation.status === 'active') {
        return '有效'
      } else if (invitation.status === 'deactivated') {
        return '已停用'
      }
      return '停用'
    }

    // DISABLED: User tag management methods - tags system disabled
    /*
    // DISABLED: Tags system functions - backend router not available
    const openUserTagManagement = async (user) => {
      selectedUser.value = user
      tagSearchText.value = ''
      await loadAllTags()
      await loadUserTags(user)
      showTagManagementModal.value = true
    }

    const loadAllTags = async () => {
      try {
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/list', {})

        if (response.success && response.data) {
          allTags.value = response.data.filter(tag => tag.isActive)
        } else {
          console.error('Failed to load tags:', response.error)
          allTags.value = []
        }
      } catch (error) {
        console.error('Error loading tags:', error)
        allTags.value = []
      }
    }

    const loadUserTags = async (user) => {
      try {
        // For now, we'll assume user tags are included in the user object
        // If not, we would need to call a getUserTags API
        if (!user.tags) {
          user.tags = []
        }
      } catch (error) {
        console.error('Error loading user tags:', error)
        user.tags = []
      }
    }

    const assignTagToUser = async (user, tag) => {
      try {
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/assign/user', {
        //   userEmail: user.userEmail,
        //   tagId: tag.tagId
        // })

        if (response.success) {
          // Add tag to user's tags array
          if (!user.tags) user.tags = []
          user.tags.push({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor
          })

          ElMessage.success(`標籤「${tag.tagName}」已分配給用戶`)
        } else {
          ElMessage.error(`分配失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error assigning tag to user:', error)
        ElMessage.error('分配標籤失敗，請重試')
      }
    }

    const removeTagFromUser = async (user, tag) => {
      try {
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/remove/user', {
        //   userEmail: user.userEmail,
        //   tagId: tag.tagId
        // })

        if (response.success) {
          // Remove tag from user's tags array
          const tagIndex = user.tags.findIndex(t => t.tagId === tag.tagId)
          if (tagIndex !== -1) {
            user.tags.splice(tagIndex, 1)
          }

          ElMessage.success(`標籤「${tag.tagName}」已從用戶移除`)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing tag from user:', error)
        ElMessage.error('移除標籤失敗，請重試')
      }
    }

    // Tag search methods
    const filterTags = () => {
      filteredTagSearchText.value = tagSearchText.value
    }

    const clearTagSearch = () => {
      tagSearchText.value = ''
      filteredTagSearchText.value = ''
    }
    */

    // Navigate to user's login logs
    const viewLoginLogs = (user: ExtendedUser) => {
      router.push({
        name: 'admin-logs-login-user',
        params: { userId: user.userEmail }
      })
    }

    // User editing methods
    const editUser = async (user: ExtendedUser) => {
      loadingUserData.value = true
      showEditUserDrawer.value = true

      try {
        // Fetch fresh user data from backend to ensure we have the latest information
        let userData: ExtendedUser = user
        try {
          const response = await adminApi.users.list({
            search: user.userEmail,
            limit: 1
          })

          // Backend returns either array or { users: [...], totalCount: n }
          const data = response.data as any
          const usersList = Array.isArray(data) ? data : data.users || []
          if (response.success && usersList.length > 0) {
            // Use fresh data from backend
            userData = usersList[0] as ExtendedUser
            console.log('Using fresh user data from backend for editing')

            // Update the user in the users list with fresh data
            const userIndex = users.value.findIndex(u => u.userEmail === user.userEmail)
            if (userIndex !== -1) {
              users.value[userIndex] = { ...users.value[userIndex], ...userData }
            }
          } else {
            console.warn('Failed to fetch fresh user data, using cached data')
          }
        } catch (error) {
          console.warn('Error fetching fresh user data, using cached data:', error)
        }

        // Deep clone user data for editing
        editingUser.value = JSON.parse(JSON.stringify(userData))
        originalUser.value = JSON.parse(JSON.stringify(userData))

        // Ensure tags and globalGroups are always arrays
        if (editingUser.value && !editingUser.value.tags) {
          editingUser.value.tags = []
        }
        if (editingUser.value && !editingUser.value.globalGroups) {
          editingUser.value.globalGroups = []
        }

        // DISABLED: selectedTagsToAdd.value = [] - tags system disabled
        selectedGroupsToAdd.value = []
        
        // 用戶權限狀態會通過 computed 自動計算
        
        // 載入使用者的全域群組和專案群組
        await Promise.all([
          loadUserGlobalGroups(user.userEmail),
          loadUserProjectGroups(user.userEmail)
        ])
      
        // Ensure avatar settings are properly preserved and initialized
        // Don't override existing avatar data, only set defaults if missing
        if (editingUser.value && !editingUser.value.avatarSeed) {
          editingUser.value.avatarSeed = user.avatarSeed || `${user.userEmail}_${Date.now()}`
        }
        if (editingUser.value && !editingUser.value.avatarStyle) {
          editingUser.value.avatarStyle = user.avatarStyle || 'avataaars'
        }
        
        // Parse avatarOptions if it's a string, but preserve existing data
        let avatarOptions: Record<string, any> = {}
        if (user.avatarOptions) {
          if (typeof user.avatarOptions === 'string') {
            try {
              avatarOptions = JSON.parse(user.avatarOptions)
            } catch (e) {
              console.warn('Failed to parse user avatarOptions:', e)
              avatarOptions = {
                backgroundColor: 'b6e3f4',
                clothesColor: '3c4858',
                skinColor: 'ae5d29'
              }
            }
          } else {
            avatarOptions = { ...(user.avatarOptions as Record<string, any>) }
          }
        } else {
          // Default avatar options only if none exist
          avatarOptions = {
            backgroundColor: 'b6e3f4',
            clothesColor: '3c4858',
            skinColor: 'ae5d29'
          }
        }

        // Ensure both editing and original user have the same avatar data
        if (editingUser.value) {
          editingUser.value.avatarOptions = JSON.stringify(avatarOptions)
        }
        if (originalUser.value && !originalUser.value.avatarOptions) {
          originalUser.value.avatarOptions = JSON.stringify(avatarOptions)
        }
        currentAvatarOptions.value = { ...avatarOptions }
        editingUserAvatarOptions.value = {
          backgroundColor: avatarOptions.backgroundColor || 'b6e3f4',
          clothesColor: avatarOptions.clothesColor || '3c4858',
          skinColor: avatarOptions.skinColor || 'ae5d29'
        }
        avatarError.value = false
        editingUserAvatarError.value = false
        editingUserAvatarChanged.value = false

        // Load user's global groups
        try {
          await loadUserGlobalGroups(user.userEmail)
          if (editingUser.value) {
            editingUser.value.globalGroups = userGlobalGroups.value || []
          }
          // 權限狀態會通過 computed 自動更新
        } catch (error) {
          console.error('Failed to load user global groups:', error)
          if (editingUser.value) {
            editingUser.value.globalGroups = []
          }
          // 權限狀態會通過 computed 自動更新
        }
      } catch (error) {
        console.error('Error loading user data for editing:', error)
        ElMessage.error('載入用戶資料失敗，請重試')
        showEditUserDrawer.value = false
      } finally {
        loadingUserData.value = false
      }
    }

    const cancelEditUser = () => {
      showEditUserDrawer.value = false
      editingUser.value = null
      originalUser.value = null
      // DISABLED: selectedTagsToAdd.value = [] - tags system disabled
      editingUserAvatarChanged.value = false
      editingUserAvatarError.value = false
      editingUserAvatarOptions.value = {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }
    }

    const handleDrawerClose = (done: () => void) => {
      if (saving.value) {
        return false
      }
      done()
    }

    // DISABLED: removeTagFromEditingUser - tags system disabled
    /*
    const removeTagFromEditingUser = (tag) => {
      if (editingUser.value && editingUser.value.tags) {
        const tagIndex = editingUser.value.tags.findIndex(t => t.tagId === tag.tagId)
        if (tagIndex !== -1) {
          editingUser.value.tags.splice(tagIndex, 1)
        }
      }
    }

    const onTagSelectionChange = () => {
      // This method can be used for validation or other logic when tags are selected
    }

    const addSelectedTagsToUser = () => {
      if (!editingUser.value || selectedTagsToAdd.value.length === 0) return

      // Ensure tags array exists
      if (!editingUser.value.tags) {
        editingUser.value.tags = []
      }

      // Add selected tags to editing user
      selectedTagsToAdd.value.forEach(tagId => {
        const tag = allTags.value.find(t => t.tagId === tagId)
        if (tag && !editingUser.value.tags.find(t => t.tagId === tagId)) {
          editingUser.value.tags.push(tag)
        }
      })

      // Clear selection
      selectedTagsToAdd.value = []
    }
    */

    const generateDicebearUrl = (seed: string, style: string, options: Record<string, string> = {}) => {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '120',
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    }

    const generateInitialsAvatar = (user: ExtendedUser | null) => {
      if (!user) return ''
      const name = user.displayName || 'U'
      const initials = name
        .split(' ')
        .map((word: string) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()

      return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=120&backgroundColor=b6e3f4`
    }

    const generateInitials = (user: ExtendedUser | null) => {
      if (!user) return 'U'
      const name = user.displayName || 'User'
      return name
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
    }

    const regenerateUserAvatar = () => {
      if (editingUser.value) {
        regeneratingAvatar.value = true
        // Generate new seed (consistent with UserSettings pattern)
        const timestamp = Date.now().toString()
        const emailHash = editingUser.value.userEmail.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        editingUser.value.avatarSeed = `${Math.abs(emailHash)}_${timestamp.slice(-6)}`
        
        // Reset avatar error
        avatarError.value = false
        
        setTimeout(() => {
          regeneratingAvatar.value = false
        }, 500)
      }
    }

    const handleAvatarError = () => {
      avatarError.value = true
    }

    const onAvatarStyleChange = () => {
      // Reset avatar options when style changes
      currentAvatarOptions.value = {}
      if (editingUser.value) {
        editingUser.value.avatarOptions = '{}'
      }
    }

    const updateAvatarOption = (key: string, value: string) => {
      if (!currentAvatarOptions.value) {
        currentAvatarOptions.value = {}
      }
      (currentAvatarOptions.value as Record<string, any>)[key] = value

      if (editingUser.value) {
        const options = editingUser.value.avatarOptions ? JSON.parse(editingUser.value.avatarOptions) : {}
        options[key] = value
        editingUser.value.avatarOptions = JSON.stringify(options)
      }
    }

    // Editing user avatar methods
    const regenerateEditingUserAvatar = async () => {
      if (!editingUser.value) return

      regeneratingEditingUserAvatar.value = true
      try {
        // Generate new seed (consistent with UserSettings pattern)
        const timestamp = Date.now().toString()
        const emailHash = editingUser.value.userEmail.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        const newSeed = `${Math.abs(emailHash)}_${timestamp.slice(-6)}`

        // Update editingUser and trigger reactivity by reassigning
        editingUser.value = {
          ...editingUser.value,
          avatarSeed: newSeed
        }

        // ✨ Reset error state and mark as changed
        editingUserAvatarError.value = false
        editingUserAvatarChanged.value = true
        retryCount.value = 0
        isRetrying.value = false
        isInFallbackMode.value = false
      } catch (error) {
        console.error('Error regenerating editing user avatar:', error)
      } finally {
        setTimeout(() => {
          regeneratingEditingUserAvatar.value = false
        }, 500)
      }
    }

    // ✨ Avatar load success handler
    const handleEditingUserAvatarLoad = () => {
      console.log('✅ Avatar loaded successfully')

      // Reset error state
      isRetrying.value = false
      retryCount.value = 0
      isInFallbackMode.value = false
      editingUserAvatarError.value = false

      if (!editingUser.value) return

      // ✨ Save current config to verified list
      const currentConfig = {
        seed: editingUser.value.avatarSeed || `${editingUser.value.userEmail}_${Date.now()}`,
        style: editingUser.value.avatarStyle || 'avataaars',
        options: { ...editingUserAvatarOptions.value }
      }

      // Remove retry params
      delete currentConfig.options._retry
      delete currentConfig.options._t

      // Check if already exists
      const isDuplicate = verifiedConfigs.value.some(config =>
        config.seed === currentConfig.seed &&
        config.style === currentConfig.style &&
        JSON.stringify(config.options) === JSON.stringify(currentConfig.options)
      )

      if (!isDuplicate) {
        verifiedConfigs.value.push(currentConfig)
        // Keep last 10 configs
        if (verifiedConfigs.value.length > 10) {
          verifiedConfigs.value.shift()
        }
        console.log(`📝 Verified config saved. Total: ${verifiedConfigs.value.length}`)
      }
    }

    // ✨ Avatar load error handler with retry logic
    const handleEditingUserAvatarError = async () => {
      console.warn('⚠️ Avatar load error, attempt:', retryCount.value + 1)

      // Prevent duplicate triggers
      if (isRetrying.value) return

      // Retry logic
      if (retryCount.value < maxRetries) {
        isRetrying.value = true
        retryCount.value++

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, retryCount.value - 1) * 1000
        console.log(`⏳ Retrying in ${delay}ms...`)

        await new Promise(resolve => setTimeout(resolve, delay))

        // Trigger re-render
        isRetrying.value = false
        return
      }

      // ✨ All retries failed - rollback
      console.error('❌ All retries failed, rolling back...')
      isRetrying.value = false

      if (verifiedConfigs.value.length > 0 && editingUser.value) {
        // Rollback to last verified config
        const lastGoodConfig = verifiedConfigs.value[verifiedConfigs.value.length - 1]
        console.log('🔄 Rolling back to last verified config:', lastGoodConfig)

        editingUser.value.avatarSeed = lastGoodConfig.seed
        editingUser.value.avatarStyle = lastGoodConfig.style
        editingUserAvatarOptions.value = { ...lastGoodConfig.options }

        retryCount.value = 0
        isInFallbackMode.value = false
        editingUserAvatarError.value = false

        ElMessage.warning({
          message: '此配置無法生成頭像，已回退到上一個可用狀態',
          duration: 3000
        })
      } else {
        // No verified configs - enter fallback mode
        console.warn('⚠️ No verified configs available, entering fallback mode')
        isInFallbackMode.value = true
        editingUserAvatarError.value = true
        retryCount.value = 0

        ElMessage.error({
          message: '頭像載入失敗，已切換為文字縮寫',
          duration: 5000
        })
      }
    }

    const generateEditingUserInitials = () => {
      if (!editingUser.value) return 'U'
      const name = editingUser.value.displayName || 'User'
      return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
    }

    const onEditingUserAvatarStyleChange = () => {
      if (!editingUser.value) return

      // Reset avatar options when style changes
      editingUserAvatarOptions.value = {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }

      editingUser.value.avatarOptions = JSON.stringify(editingUserAvatarOptions.value)
      editingUserAvatarChanged.value = true

      // ✨ Reset error state for new style
      editingUserAvatarError.value = false
      retryCount.value = 0
      isRetrying.value = false
      isInFallbackMode.value = false
    }

    const updateEditingUserAvatarOption = (key: string, value: string) => {
      if (!editingUserAvatarOptions.value) {
        editingUserAvatarOptions.value = {}
      }
      editingUserAvatarOptions.value[key] = value

      if (editingUser.value) {
        // avatarOptions is stored as JSON string, update the local ref instead
        // The JSON serialization happens when saving
      }

      editingUserAvatarChanged.value = true

      // ✨ Reset error state for new options
      editingUserAvatarError.value = false
      retryCount.value = 0
      isRetrying.value = false
      isInFallbackMode.value = false
    }

    const saveEditingUser = async (eventData: { user?: ExtendedUser; avatarChanged?: boolean } = {}) => {
      if (!editingUser.value || savingEditingUser.value) return

      savingEditingUser.value = true

      try {
        // Use fresh data from UserEditorDrawer (contains latest changes)
        const freshUser = eventData?.user || editingUser.value
        const avatarChanged = eventData?.avatarChanged || false

        // Sync fresh data back to local state
        if (eventData?.user) {
          editingUser.value = eventData.user
        }

        // Prepare update data using fresh data from drawer
        const userData: Record<string, unknown> = {
          userEmail: freshUser.userEmail,
          displayName: freshUser.displayName,
          status: freshUser.status
        }

        // Include avatar data if changed
        if (avatarChanged) {
          userData.avatarSeed = freshUser.avatarSeed
          userData.avatarStyle = freshUser.avatarStyle || 'avataaars'
          userData.avatarOptions = freshUser.avatarOptions
        }

        // Update user via admin API with userData wrapper
        const response = await adminApi.users.updateProfile({ userEmail: freshUser.userEmail, displayName: freshUser.displayName, status: freshUser.status } as any)

        if (response.success) {
          // Update the user in the users list
          const userIndex = users.value.findIndex(u => u.userEmail === editingUser.value!.userEmail)
          if (userIndex !== -1) {
            users.value[userIndex] = { ...users.value[userIndex], ...editingUser.value! }
          }

          // Reset change flags
          editingUserAvatarChanged.value = false

          // Show success message
          ElMessage.success('用戶資料已更新')

          // Close drawer
          showEditUserDrawer.value = false
          editingUser.value = null
          originalUser.value = null
        } else {
          throw new Error(response.error?.message || '更新用戶資料失敗')
        }
      } catch (error) {
        console.error('Error saving editing user:', error)
        ElMessage.error('保存失敗：' + (error instanceof Error ? error.message : '未知錯誤'))
      } finally {
        savingEditingUser.value = false
      }
    }

    const saveUserChanges = async () => {
      if (!editingUser.value || saving.value) return

      saving.value = true

      try {
        // Prepare update data in the format backend expects
        const userData = {
          userEmail: editingUser.value.userEmail,
          displayName: editingUser.value.displayName,
          status: editingUser.value.status,
          avatarSeed: editingUser.value.avatarSeed,
          avatarStyle: editingUser.value.avatarStyle || 'avataaars',
          avatarOptions: editingUser.value.avatarOptions || {}
        }

        // Update basic user info using admin API
        const updateResponse = await adminApi.users.updateProfile(userData as any)

        if (!updateResponse.success) {
          throw new Error(updateResponse.error?.message || '更新用戶資料失敗')
        }

        // DISABLED: Handle tag changes - tags system disabled (backend router not available)
        /*
        const originalTagIds = (originalUser.value.tags || []).map(t => t.tagId)
        const newTagIds = (editingUser.value.tags || []).map(t => t.tagId)

        // Remove tags that are no longer present
        const tagsToRemove = originalTagIds.filter(tagId => !newTagIds.includes(tagId))
        for (const tagId of tagsToRemove) {
          // TODO: Tags system disabled - backend router not available
          // await apiClient.callWithAuth('/tags/unassign/user', {
          //   userEmail: editingUser.value.userEmail,
          //   tagId: tagId
          // })
        }

        // Add new tags
        const tagsToAdd = newTagIds.filter(tagId => !originalTagIds.includes(tagId))
        for (const tagId of tagsToAdd) {
          // TODO: Tags system disabled - backend router not available
          // await apiClient.callWithAuth('/tags/assign/user', {
          //   userEmail: editingUser.value.userEmail,
          //   tagId: tagId
          // })
        }

        // Process selected tags to add
        if (selectedTagsToAdd.value && selectedTagsToAdd.value.length > 0) {
          for (const tagId of selectedTagsToAdd.value) {
            try {
              // TODO: Tags system disabled - backend router not available
              // await apiClient.callWithAuth('/tags/assign/user', {
              //   userEmail: editingUser.value.userEmail,
              //   tagId: tagId
              // })
            } catch (error) {
              console.error('Error assigning tag:', error)
            }
          }
          selectedTagsToAdd.value = [] // Clear selections after processing
        }
        */

        // Process selected groups to add
        if (selectedGroupsToAdd.value && selectedGroupsToAdd.value.length > 0) {
          for (const groupId of selectedGroupsToAdd.value) {
            try {
              await adminApi.globalGroups.addUser({
                groupId: groupId,
                userEmail: editingUser.value.userEmail
              })
            } catch (error) {
              console.error('Error adding user to group:', error)
            }
          }
          selectedGroupsToAdd.value = [] // Clear selections after processing
        }

        // Reload user data to reflect changes
        await loadUsers()
        
        // Reload user global groups for the drawer
        if (editingUser.value && editingUser.value.userEmail) {
          await loadUserGlobalGroups(editingUser.value.userEmail)
        }

        showEditUserDrawer.value = false
        ElMessage.success('使用者資料已更新')
        
      } catch (error) {
        console.error('Error saving user changes:', error)
        ElMessage.error(`儲存失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
      } finally {
        saving.value = false
      }
    }

    // Global groups management methods
    const loadGlobalGroups = async () => {
      try {
        const response = await adminApi.globalGroups.list()
        
        if (response.success && response.data && response.data.groups) {
          // Cast to GlobalGroup[] since the admin API returns groups with isActive as boolean
          globalGroups.value = response.data.groups.filter((group) => group.isActive) as unknown as GlobalGroup[]
        } else {
          console.error('Failed to load global groups:', response.error)
          globalGroups.value = []
        }
      } catch (error) {
        console.error('Error loading global groups:', error)
        globalGroups.value = []
      }
    }

    const addUserToGlobalGroup = async () => {
      if (!selectedGlobalGroupToAdd.value || !editingUser.value) return
      
      try {
        const group = globalGroups.value.find(g => g.groupId === selectedGlobalGroupToAdd.value)
        if (!group) return

        const response = await adminApi.globalGroups.addUser({
          groupId: selectedGlobalGroupToAdd.value,
          userEmail: editingUser.value.userEmail
        })
        
        if (response.success) {
          // Add group to user's globalGroups array
          if (!editingUser.value.globalGroups) editingUser.value.globalGroups = []
          // Parse globalPermissions from JSON string if needed
          const permissions = typeof group.globalPermissions === 'string'
            ? JSON.parse(group.globalPermissions) as string[]
            : group.globalPermissions
          editingUser.value.globalGroups.push({
            groupId: group.groupId,
            groupName: group.groupName,
            globalPermissions: permissions
          })
          
          selectedGlobalGroupToAdd.value = ''
          ElMessage.success(`已將用戶添加到「${group.groupName}」群組`)
        } else {
          ElMessage.error(`添加失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error adding user to global group:', error)
        ElMessage.error('添加到全域群組失敗，請重試')
      }
    }

    const removeUserFromGlobalGroup = async (group: GlobalGroupMembership) => {
      if (!editingUser.value) return

      try {
        const response = await adminApi.globalGroups.removeUser({
          groupId: group.groupId,
          userEmail: editingUser.value.userEmail
        })

        if (response.success) {
          // Remove group from user's globalGroups array
          if (editingUser.value.globalGroups) {
            const index = editingUser.value.globalGroups.findIndex(g => g.groupId === group.groupId)
            if (index !== -1) {
              editingUser.value.globalGroups.splice(index, 1)
            }
          }

          ElMessage.success(`已從「${group.groupName}」群組中移除用戶`)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from global group:', error)
        ElMessage.error('從全域群組移除失敗，請重試')
      }
    }

    const getGlobalGroupPermissionText = (group: GlobalGroupMembership) => {
      if (!group.globalPermissions) return '無特殊權限'

      try {
        const permissions = group.globalPermissions as string[]
        const permissionTexts: Record<string, string> = {
          'system_admin': '系統管理員',
          'create_project': '專案創建',
          'manage_users': '用戶管理',
          'generate_invites': '邀請碼生成'
        }

        const texts = permissions.map((p: string) => permissionTexts[p] || p).join(', ')
        return texts || '無特殊權限'
      } catch (e) {
        return '無特殊權限'
      }
    }

    // Project groups management methods
    const loadUserProjectGroups = async (userEmail: string) => {
      if (!userEmail) return

      loadingUserProjectGroups.value = true
      try {
        const response = await adminApi.users.projectGroups({
          email: userEmail
        } as any)

        if (response.success && response.data) {
          userProjectGroups.value = response.data
        } else {
          console.error('Failed to load user project groups:', response.error)
          userProjectGroups.value = []
        }
      } catch (error) {
        console.error('Error loading user project groups:', error)
        userProjectGroups.value = []
      } finally {
        loadingUserProjectGroups.value = false
      }
    }

    const updateGroupAllowChange = async (projectGroup: ProjectGroupMembership) => {
      const groupKey = `${projectGroup.projectId}-${projectGroup.groupId}`
      updatingGroupSettings.value.add(groupKey)

      try {
        const httpResponse = await rpcClient.groups.update.$post({
          json: {
            projectId: projectGroup.projectId,
            groupId: projectGroup.groupId,
            updates: {
              allowChange: projectGroup.allowChange
            }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success(`群組「${projectGroup.groupName}」的成員變更設定已更新`)
        } else {
          // 回復原始狀態
          projectGroup.allowChange = !projectGroup.allowChange
          ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        // 回復原始狀態
        projectGroup.allowChange = !projectGroup.allowChange
        console.error('Error updating group allow change:', error)
        ElMessage.error('更新群組設定失敗，請重試')
      } finally {
        updatingGroupSettings.value.delete(groupKey)
      }
    }

    const removeUserFromProjectGroup = async (projectGroup: ProjectGroupMembership) => {
      const groupKey = `${projectGroup.projectId}-${projectGroup.groupId}`
      removingFromGroups.value.add(groupKey)

      try {
        const httpResponse = await rpcClient.groups['remove-member'].$post({
          json: {
            projectId: projectGroup.projectId,
            groupId: projectGroup.groupId,
            userEmail: editingUser.value!.userEmail
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('已成功從群組中移除用戶')
          // 重新載入專案群組列表
          await loadUserProjectGroups(editingUser.value!.userEmail)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from project group:', error)
        ElMessage.error('移除用戶失敗，請重試')
      } finally {
        removingFromGroups.value.delete(groupKey)
      }
    }

    // Permission display is now computed from user's group memberships

    // <i class="fas fa-check-circle text-success"></i> Watch search and filter changes - reload users from backend with debounce
    const debouncedLoadUsers = useDebounceFn(() => {
      loadUsers()
    }, 300)

    watch([searchText, statusFilter, groupFilter], () => {
      console.log('Filter changed - reloading users from backend')
      debouncedLoadUsers()
    })

    onMounted(async () => {
      await loadUsers()  // 等待用戶列表載入完成
      loadGlobalGroups()

      // Register refresh function with parent SystemAdmin
      registerRefresh(refreshUsers)

      // Register action function with parent SystemAdmin
      registerAction(openInviteManagement)

      // Note: URL expansion handling is now managed by watch() for route.params.userEmail
    })

    onBeforeUnmount(() => {
      // Cleanup: unregister refresh and action functions
      registerRefresh(null)
      registerAction(null)
    })

    // Watch route changes and permission to auto-open invitation drawer
    watch(
      [() => route.name, canManageInvites],
      ([newRouteName, hasPermission]) => {
        if (newRouteName === 'admin-users-invitation' && hasPermission === true) {
          showInviteDrawer.value = true
          inviteCollapse.value = []
          loadInvitations()
        }
      },
      { immediate: true }
    )

    // Watch drawer close to navigate back to users list
    watch(showInviteDrawer, (newVal) => {
      if (!newVal && route.name === 'admin-users-invitation') {
        router.push({ name: 'admin-users' })
      }
    })
    
    // 在返回之前確保 stats 是可訪問的
    console.log('Before return - testing stats access:', {
      stats: stats,
      statsValue: stats.value,
      canAccessActiveUsers: stats.value ? stats.value.activeUsers : 'N/A'
    })

    // Activity expansion methods - refactored to use composable
    const isUserExpansionReady = (user: ExtendedUser) => {
      return expandedUserEmails.has(user.userEmail)
    }

    const toggleUserExpansion = (user: ExtendedUser) => {
      // Toggle logic: only update URL, watch handler will manage expansion state
      if (isUserExpanded(user.userEmail)) {
        // Collapse: navigate to base route
        router.push({ name: 'admin-users' })
        selectedDate.value = null
        selectedUserEmail.value = null
      } else {
        // Expand: navigate to detail route
        router.push({
          name: 'admin-users-detail',
          params: { userEmail: user.userEmail }
        })
      }
    }

    // URL → Expansion state synchronization
    watch(
      () => route.params.userEmail,
      async (paramUserEmail) => {
        const userEmailStr = Array.isArray(paramUserEmail) ? paramUserEmail[0] : paramUserEmail
        if (userEmailStr && !isUserExpanded(userEmailStr)) {
          // URL has userEmail → Expand with animation delay
          await nextTick()
          setTimeout(() => {
            expandedUserEmails.add(userEmailStr)
          }, 350)
        } else if (!userEmailStr) {
          // URL has no userEmail → Collapse all
          collapseAllUsers()
        }
      },
      { immediate: true }
    )

    const handleDayClick = (payload: { date: string; stats?: unknown; events: unknown[] }) => {
      selectedDate.value = new Date(payload.date)
      selectedDayEvents.value = payload.events as any[]
      const paramUserEmail = route.params.userEmail
      selectedUserEmail.value = Array.isArray(paramUserEmail) ? paramUserEmail[0] : paramUserEmail || null
    }

    const canViewUserDetails = (user: ExtendedUser | null): boolean => {
      // Vue 3 Best Practice: Use useAuth() composable
      if (userEmail.value === user?.userEmail) return true
      return Boolean(hasAnyPermission(['manage_users', 'system_admin']))
    }

    return {
      users,
      searchText,
      statusFilter,
      groupFilter,
      showInviteDrawer,
      showPasswordResetDrawer,
      // DISABLED: showTagManagementModal, - tags system disabled
      selectedUser,
      generating,
      generatedInvite,
      loading,
      // 🆕 Pagination state
      loadingMore,
      hasMore,
      totalCount,
      invitationsLoading,
      processingStatus,
      inviteForm,
      // Permission checks
      canManageUsers,
      canManageInvites,
      // DISABLED: Tag management - tags system disabled
      // allTags,
      // tagSearchText,
      // Invitation management
      invitations,
      inviteSearchText,
      inviteStatusFilter,
      showDeactivatedInvitations,
      inviteCollapse,
      filteredInvitations,
      invitationStats,
      resendingInvites,
      // User editing
      showEditUserDrawer,
      editingUser,
      // DISABLED: selectedTagsToAdd, - tags system disabled
      saving,
      loadingUserData,
      // Avatar management
      regeneratingAvatar,
      avatarError,
      currentAvatarOptions,
      avatarStyles,
      backgroundColors,
      clothesColors,
      // Editing user avatar management
      regeneratingEditingUserAvatar,
      editingUserAvatarError,
      editingUserAvatarChanged,
      editingUserAvatarOptions,
      savingEditingUser,
      // Global groups management
      globalGroups,
      selectedGlobalGroupToAdd,
      // Project groups management
      userProjectGroups,
      loadingUserProjectGroups,
      updatingGroupSettings,
      removingFromGroups,
      // Permission display
      availablePermissions,
      userGlobalPermissions,
      // Batch operations state
      selectedUserEmails,
      batchUpdatingStatus,
      // REMOVED: batch password reset variables (security vulnerability)
      showBatchActions,
      isAllSelected,
      isSomeSelected,
      // Computed & Reactive
      stats,
      filteredUsers,
      // Filter persistence
      filters,
      resetFilters,
      isLoaded,
      activeFilterCount,
      handleResetFilters,
      // Export configuration
      exportConfig,
      // DISABLED: availableTagsForUser, - tags system disabled
      // DISABLED: availableTagsForEditingUser, - tags system disabled
      availableGlobalGroups,
      currentAvatarUrl,
      previewAvatarUrl,
      hasAvatarChanges,
      editingUserAvatarUrl,
      hasUserChanges,
      // Methods
      formatTime,
      getStatValue,
      refreshUsers,
      openInviteManagement,
      toggleUserStatus,
      resetPassword,
      handlePasswordResetConfirm,
      generateInvite,
      // DISABLED: toggleDefaultTag,
      toggleDefaultGlobalGroup,
      // DISABLED: getTagById,
      getGlobalGroupById,
      // DISABLED: removeDefaultTag,
      removeDefaultGlobalGroup,
      copyInviteCode,
      copySpecificCode,
      copyAllCodes,
      // Invitation methods
      loadInvitations,
      copyInvitationCode,
      resendInvitationEmail,
      deactivateInvitation,
      getInvitationStatusClass,
      getInvitationStatusText,
      // DISABLED: Tag management methods - tags system disabled
      // openUserTagManagement,
      // assignTagToUser,
      // removeTagFromUser,
      // filterTags,
      // clearTagSearch,
      // User editing methods
      viewLoginLogs,
      editUser,
      cancelEditUser,
      handleDrawerClose,
      // DISABLED: removeTagFromEditingUser, - tags system disabled
      // DISABLED: onTagSelectionChange, - tags system disabled
      // DISABLED: addSelectedTagsToUser, - tags system disabled
      // DISABLED: removeSelectedTag, - tags system disabled
      removeSelectedGroup,
      removeUserFromGroup,
      // DISABLED: removeUserTag, - tags system disabled
      // Avatar methods
      generateDicebearUrl,
      generateInitialsAvatar,
      generateInitials,
      regenerateUserAvatar,
      handleAvatarError,
      onAvatarStyleChange,
      updateAvatarOption,
      saveUserChanges,
      // Editing user avatar methods
      regenerateEditingUserAvatar,
      handleEditingUserAvatarLoad,
      handleEditingUserAvatarError,
      generateEditingUserInitials,
      onEditingUserAvatarStyleChange,
      updateEditingUserAvatarOption,
      saveEditingUser,
      // Error handling state
      verifiedConfigs,
      retryCount,
      isRetrying,
      isInFallbackMode,
      maxRetries,
      // Global groups methods
      loadGlobalGroups,
      loadUserGlobalGroups,
      addUserToGlobalGroup,
      removeUserFromGlobalGroup,
      getGlobalGroupPermissionText,
      // Project groups methods
      loadUserProjectGroups,
      updateGroupAllowChange,
      removeUserFromProjectGroup,
      // Activity expansion state
      selectedDate,
      selectedDayEvents,
      selectedUserEmail,
      // Activity expansion methods
      isUserExpanded,
      isUserExpansionReady,
      toggleUserExpansion,
      handleDayClick,
      canViewUserDetails,
      // Batch operations methods
      toggleUserSelection,
      toggleSelectAll,
      clearSelection,
      batchActivateUsers,
      batchDeactivateUsers,
      batchUpdateStatus,
      // REMOVED: batch password reset functions (security vulnerability)
      // Unlock user state
      showUnlockDrawer,
      unlockingUser,
      unlockReason,
      unlockConfirmText,
      resetLockCount,
      unlocking,
      canConfirmUnlock,
      // Unlock user methods
      isUserLocked,
      getLockStatusText,
      openUnlockDrawer,
      closeUnlockDrawer,
      confirmUnlock,
      handleUnlockDrawerClose,
      // User list avatar methods
      getUserAvatarUrl,
      getUserInitials
    }
  }
}
</script>

<style scoped>
.user-management {
  padding: 20px;
}

/* 統計卡片 */
.stats-card {
  margin-bottom: 20px;
}

.stats-card :deep(.el-row) {
  display: flex;
  flex-wrap: wrap;
}

.stats-card :deep(.el-col) {
  display: flex;
  justify-content: center;
}

/* Loading and permission states */
.loading-state,
.no-permission {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-state i,
.no-permission i {
  font-size: 48px;
  color: #999;
  margin-bottom: 20px;
}

.loading-state i {
  color: #2c5aa0;
}

.no-permission h3 {
  margin: 0 0 10px 0;
  color: #333;
}

.no-permission p {
  margin: 0;
  color: #666;
}

/* Invite-only view styling */
.invite-only-view {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.invite-only-view .mgmt-header {
  margin-bottom: 0;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.header-left h2 {
  margin: 0 0 10px 0;
  color: #2c5aa0;
}

.header-left h2 i {
  margin-right: 10px;
}

.user-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  color: #666;
  font-size: 14px;
}

.stat-item i {
  margin-right: 5px;
  color: #2c5aa0;
}

.header-right {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Batch operations styles */
.batch-actions-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  margin-right: 12px;
}

.batch-count {
  font-weight: 600;
  color: #856404;
  margin-right: 4px;
}

/* Batch reset password drawer styles */
.batch-reset-password-content {
  padding: 20px;
}

.selected-users-preview {
  margin: 20px 0;
  padding: 15px;
  background-color: #f5f5f5;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.selected-users-preview h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 14px;
}

.user-email-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0 0;
}

.user-email-list li {
  padding: 4px 0;
  color: #666;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
}

.form-group code {
  background-color: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  color: #d63384;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  margin-bottom: 0;
}

.drawer-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
  margin-top: 20px;
}

.filters {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 10px;
  /*border: 1px solid #ddd;*/
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.user-table th,
.user-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.user-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.user-table tr:hover {
  background: #f8f9fa;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.status-badge i {
  margin-right: 4px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.no-data {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-data i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
}

.modal-content h3 i {
  margin-right: 10px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-group label .required {
  color: #e74c3c;
  margin-left: 4px;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.generated-invite {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.generated-invite h4 {
  margin: 0 0 10px 0;
  color: #28a745;
}

.invite-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  background: white;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: left;
  margin: 5px 0;
  color: #2c5aa0;
  word-break: break-all;
}

.invite-codes-list {
  margin-top: 15px;
}

.invite-code-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.invite-code-item .invite-code {
  flex: 1;
  margin: 0;
  font-size: 14px;
}

.invite-errors {
  margin-top: 15px;
  padding: 10px;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
}

.invite-errors h6 {
  margin: 0 0 8px 0;
  color: #856404;
}

.invite-errors ul {
  margin: 0;
  padding-left: 20px;
  color: #856404;
}

.batch-actions {
  margin-top: 15px;
  text-align: center;
}

.help-text {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

/* Drawer Styles */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer-content {
  width: 70%;
  max-width: 1000px;
  height: 100vh;
  background: white;
  overflow-y: auto;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
}

.drawer-header {
  background: #f39c12; /* 深黃色 */
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Navy header for el-drawer */
.drawer-header-navy {
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  padding: 16px 24px;
  margin: -20px -20px 20px -20px;
  border-radius: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header-navy h3 {
  margin: 0;
  color: white;
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.drawer-header-navy h3 i {
  margin-right: 10px;
  opacity: 0.9;
}

.drawer-header h3 {
  margin: 0;
  color: white;
}

.drawer-header h3 i {
  margin-right: 10px;
}

.drawer-close {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 5px;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.drawer-body {
  padding: 20px;
}

.section {
  margin-bottom: 30px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px;
}

.section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.section h4 i {
  margin-right: 8px;
}

.section h5 {
  margin: 0 0 10px 0;
  color: #28a745;
  font-size: 14px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.form-row {
  display: flex;
  gap: 15px;
  align-items: flex-end;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.invitation-filters {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.invitation-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  min-width: 800px;
}

.invitation-table th,
.invitation-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.invitation-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.invitation-table tr:hover {
  background: #f8f9fa;
}

.target-email {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f0f8ff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #2c5aa0;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.expired {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.used {
  background: #fff3cd;
  color: #856404;
}

.status-badge.inactive {
  background: #e2e3e5;
  color: #6c757d;
}

.no-invitations {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-invitations i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.invite-stats {
  display: flex;
  gap: 20px;
}

.invite-stats .stat-item {
  text-align: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  flex: 1;
}

.invite-stats .stat-number {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #2c5aa0;
}

.invite-stats .stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}

.actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

/* User Tag Management Styles */
.user-tags {
  min-width: 150px;
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-badge.removable {
  padding-right: 25px;
  position: relative;
}

.tag-badge.clickable {
  cursor: pointer;
  transition: opacity 0.2s ease;
  padding-right: 25px;
  position: relative;
}

.tag-badge.clickable:hover {
  opacity: 0.8;
}

.tag-badge .fas.fa-plus {
  margin-left: 5px;
  font-size: 9px;
}

.remove-tag-btn {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: white;
  font-size: 8px;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-tag-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tag-manage-btn {
  background: #f8f9fa;
  border: 1px solid #ddd;
  color: #666;
  padding: 3px 6px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
}

.tag-manage-btn:hover {
  background: #e9ecef;
  color: #495057;
}

/* Tag Management Modal Styles */
.tag-modal {
  max-width: 600px;
  width: 95%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0 0 5px 0;
  color: #2c5aa0;
}

.modal-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.tag-management-body {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.current-tags-section,
.available-tags-section {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
}

.current-tags-section h4,
.available-tags-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.current-tags,
.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 40px;
  align-items: flex-start;
}

.tag-search {
  margin-bottom: 15px;
}

.tag-search .search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.no-tags {
  color: #999;
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  padding: 10px;
}

.no-tags i {
  color: #ccc;
}

/* Invitation Form Tag and Group Selectors */
.tag-selector, .group-selector {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  background: #f9f9f9;
}

.selected-tags-display, .selected-groups-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.selected-tags-display .el-tag, 
.selected-groups-display .el-tag {
  margin-bottom: 4px;
}

/* Legacy styles for backwards compatibility */
.tag-selection {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  background: #f9f9f9;
}

.tag-selection .available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 40px;
}

.tag-selection .tag-badge {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  position: relative;
}

.tag-selection .tag-badge.selected {
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.tag-selection .tag-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tag-selection .tag-badge .fas.fa-check {
  margin-left: 5px;
  font-size: 9px;
}

.generate-button-row {
  margin-top: 15px;
  display: flex;
  justify-content: flex-start;
}

/* User Edit Drawer Styles */
.drawer-header-custom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  background: #2c3e50;
  width: 100%;
  margin: -32px -20px 0 -20px;
}

.drawer-header-custom h3 {
  margin: 0;
  color: white;
  font-weight: 600;
}

.drawer-header-custom i {
  margin-right: 8px;
}

/* Close button styles for both drawers */
.drawer-close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.drawer-close-btn:active {
  transform: scale(0.95);
}

/* Global Groups Styles */
.global-groups-display {
  min-height: 40px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #f8f9fa;
}

.global-group-tag {
  margin: 4px 8px 4px 0;
}

.global-group-tag i {
  margin-right: 6px;
}

.no-global-groups {
  color: #999;
  text-align: center;
  padding: 10px;
}

.no-global-groups i {
  margin-right: 8px;
  color: #ccc;
}

.global-group-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Global Group Selection Styles for Invitation */
.global-group-selection {
  margin-top: 10px;
}

.available-global-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #f8f9fa;
  min-height: 50px;
  align-items: flex-start;
  align-content: flex-start;
}

.global-group-badge {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 13px;
  gap: 6px;
  flex-direction: column;
  text-align: center;
  min-width: 120px;
}

.global-group-badge:hover {
  border-color: #2c5aa0;
  background: #f8f9ff;
}

.global-group-badge.selected {
  border-color: #f39c12;
  background: #fff3cd;
  color: #856404;
}

.global-group-badge i.fa-crown {
  color: #f39c12;
  font-size: 14px;
}

.global-group-badge i.fa-check {
  color: #28a745;
  font-size: 12px;
  margin-top: 4px;
}

.group-permission-hint {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  font-style: italic;
}

.global-group-badge.selected .group-permission-hint {
  color: #856404;
}

.user-edit-form {
  padding: 20px 0;
}

.form-section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.form-section:last-child {
  border-bottom: none;
}

.form-section h4 {
  color: #333;
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.form-section h4 i {
  margin-right: 8px;
  color: #2c5aa0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: #555;
}

.user-tags-editor {
  min-height: 40px;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  align-items: flex-start;
}

.tag-item {
  margin-right: 0 !important;
}

.no-tags {
  color: #999;
  font-style: italic;
  padding: 10px 0;
  display: flex;
  align-items: center;
}

.no-tags i {
  margin-right: 6px;
}

.tag-selector {
  width: 100%;
}

/* Avatar Management Styles */
.avatar-management {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-top: 15px;
}

.avatar-preview {
  flex-shrink: 0;
  position: relative;
  display: flex;
  gap: 20px;
  border: 2px solid #e1e8ed;
  border-radius: 12px;
  padding: 16px;
  background: white;
}

/* ✨ Avatar retry indicator */
.avatar-retry-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #409eff;
  font-weight: 500;
  border-radius: 8px;
}

.avatar-retry-indicator i {
  font-size: 24px;
}

.current-avatar,
.preview-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.current-avatar h5,
.preview-avatar h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-align: center;
}

.current-avatar {
  position: relative;
}

.current-avatar::after {
  content: '當前';
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #2c5aa0;
  font-weight: 600;
}

.preview-avatar {
  position: relative;
}

.preview-avatar::after {
  content: '預覽';
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #f56c6c;
  font-weight: 600;
}

.avatar-controls {
  flex-grow: 1;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-group label {
  font-weight: 600;
  color: #555;
  margin: 0;
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-option {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-option.selected {
  border-color: #2c5aa0;
  box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.3);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 0 10px;
  border-top: 1px solid #eee;
}

/* Element Plus customization for drawer */
.el-drawer__body {
  padding: 20px;
}

/* el-drawer header 樣式 - navy 底白字 */
:deep(.el-drawer__header) {
  background: #2c3e50 !important;
  color: white !important;
  padding: 0 !important;
  margin-bottom: 0 !important;
  border-bottom: none !important;
  overflow: visible !important;
}

:deep(.el-drawer__title) {
  color: white !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}

:deep(.el-drawer__close-btn) {
  color: white !important;
}

:deep(.el-drawer__close-btn:hover) {
  color: #ecf0f1 !important;
}

/* 邀請碼管理 drawer - 確保內部 div 填滿整個 header */
.invite-drawer :deep(.el-drawer__header) {
  padding: 0 !important;
  background: #2c3e50 !important;
}

.invite-drawer :deep(.el-drawer__header > div) {
  width: 100% !important;
  margin: 0 !important;
}

/* Make sure Element Plus components look good */
.el-input {
  width: 100%;
}

.el-select {
  width: 100%;
}

.el-tag {
  margin-right: 8px;
  margin-bottom: 4px;
}

/* 進度顯示樣式 */
.processing-status {
  margin-top: 15px;
  padding: 12px 16px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  color: #495057;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.processing-status i {
  color: #007bff;
}

/* 專案群組管理樣式 */
.project-groups-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
  transition: all 0.2s ease;
}

.project-group-item:hover {
  border-color: #2c5aa0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.project-group-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.project-id {
  font-size: 12px;
  color: #7f8c8d;
  font-family: monospace;
  background: #ecf0f1;
  padding: 2px 6px;
  border-radius: 4px;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-name {
  font-size: 13px;
  color: #555;
}

.group-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.allow-change-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.allow-change-control label {
  margin: 0;
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.no-project-groups {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-style: italic;
}

.no-project-groups i {
  margin-right: 6px;
}

.loading-indicator {
  text-align: center;
  padding: 20px;
  color: #666;
}

.loading-indicator i {
  margin-right: 8px;
}

/* 邀請碼停用樣式 */
.deactivated-invitation {
  opacity: 0.6;
  background-color: #fdf2f2;
}

.deactivated-invitation td {
  text-decoration: line-through;
  color: #909399;
}

.deactivated-invitation .status-badge {
  text-decoration: none; /* 狀態徽章保持正常顯示 */
}

.deactivated-invitation .actions button {
  text-decoration: none; /* 操作按鈕保持正常顯示 */
}

/* 邀請碼過濾區域樣式 */
.invitation-filters {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.show-deactivated-switch {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.show-deactivated-switch .el-switch {
  --el-switch-on-color: #f56c6c;
  --el-switch-off-color: #dcdfe6;
}

/* 狀態徽章樣式改進 */
.status-badge.deactivated {
  background-color: #f56c6c;
  color: white;
  border: 1px solid #f56c6c;
}

/* 邀請碼生成區域流式排版樣式 */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2c5aa0;
}

.form-group .el-slider {
  padding: 0 12px;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  line-height: 1.4;
}

/* 滑動條樣式優化 */
.el-slider__runway {
  height: 6px;
  background-color: #e4e7ed;
  border-radius: 3px;
}

.el-slider__bar {
  background-color: #409eff;
  border-radius: 3px;
}

.el-slider__button {
  border: 2px solid #409eff;
  background-color: #fff;
  width: 16px;
  height: 16px;
}

.el-slider__stop {
  width: 4px;
  height: 4px;
  background-color: #c0c4cc;
  border-radius: 50%;
}

/* Teacher Privilege Styles */
.teacher-privilege-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: #f0f0f0;
  color: #666;
}

.teacher-privilege-badge.has-privilege {
  background: #e8f5e8;
  color: #2e7d2e;
}

.teacher-privilege-badge i {
  margin-right: 4px;
}

.teacher-privilege-control {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.teacher-privilege-control .current-status {
  display: flex;
  align-items: center;
}

.teacher-privilege-control .privilege-actions {
  display: flex;
  gap: 10px;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 5px;
}

.help-text i {
  color: #409eff;
}

/* 按鈕樣式補充 */
.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover {
  background: #138496;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .invitation-filters {
    flex-direction: column;
    align-items: stretch;
  }
  
  .show-deactivated-switch {
    margin-left: 0;
    justify-content: center;
  }
  
  .form-group {
    margin-bottom: 16px;
  }
  
  .teacher-privilege-control .privilege-actions {
    flex-direction: column;
  }
  
  .actions {
    flex-direction: column;
    gap: 4px;
  }
}

/* Permission Management Styles */
.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.permission-checkbox {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
  background: #fafafa;
}

.permission-checkbox:hover {
  border-color: #FF6600;
  background: #fff;
}

.permission-checkbox .el-checkbox__input.is-checked + .el-checkbox__label {
  color: #FF6600;
}

.permission-label {
  font-weight: 600;
  font-size: 14px;
  margin-left: 8px;
  color: #333;
}

.permission-desc {
  font-size: 12px;
  color: #666;
  margin-left: 8px;
  display: block;
  margin-top: 4px;
}

.permission-checkbox i {
  color: #FF6600;
  width: 16px;
  text-align: center;
}

@media (max-width: 768px) {
  .permissions-grid {
    grid-template-columns: 1fr;
  }
}

/* Editing User Avatar Styles */
.avatar-style-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.avatar-style-selector label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin: 0;
  white-space: nowrap;
}

.avatar-color-options {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
}

.color-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-group label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin: 0;
}

.color-group .color-options {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.color-group .color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.3s;
  position: relative;
}

.color-group .color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-group .color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-group .color-option.selected::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.avatar-save-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  padding: 10px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 6px;
  font-size: 13px;
  color: #0050b3;
}

.avatar-save-notice i {
  color: #1890ff;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
}

/* Activity expansion styles - 主行和展开样式由 ExpandableTableRow 统一提供 */

.activity-container {
  padding: 20px;
  background: white;
  border-top: 2px solid #409eff;
  border-bottom: 1px solid #ebeef5;
}

/* 展开内容容器样式 - 与 GroupManagement 保持一致的行高 */
.heatmap-section {
  margin-bottom: 20px;
  padding: 0;
}

.detail-section {
  padding: 0;
  margin-top: 16px;
}

/* RWD for activity expansion */
@media (max-width: 768px) {
  .activity-container {
    padding: 15px 10px;
  }
}

/* Lock Badge Styles */
.lock-badge {
  display: inline-block;
  margin-left: 10px;
  padding: 3px 10px;
  background-color: #f56c6c;
  color: white;
  font-size: 12px;
  border-radius: 12px;
  font-weight: 500;
}

.lock-badge i {
  margin-right: 4px;
}

/* Unlock User Drawer Styles */
.unlock-user-content {
  padding: 20px;
}

.unlock-user-content .el-alert {
  margin-bottom: 20px;
}

.user-info-display {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 8px;
  margin: 20px 0;
}

.user-info-display h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #303133;
  border-bottom: 2px solid #409eff;
  padding-bottom: 8px;
}

.user-info-display .info-item {
  margin: 10px 0;
  display: flex;
  align-items: flex-start;
}

.user-info-display .info-item .label {
  font-weight: 600;
  color: #606266;
  min-width: 120px;
  flex-shrink: 0;
}

.user-info-display .info-item .value {
  color: #303133;
  flex: 1;
}

.user-info-display .info-item .lock-status {
  color: #f56c6c;
  font-weight: 600;
}

.unlock-user-content .form-group {
  margin: 20px 0;
}

.unlock-user-content .form-group label {
  display: block;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.unlock-user-content .form-group code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  color: #f56c6c;
  font-weight: 600;
}

.unlock-user-content .help-text {
  font-size: 13px;
  color: #909399;
  margin-top: 8px;
  line-height: 1.5;
}

.unlock-user-content .drawer-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

/* 🆕 Infinite Scroll Loading & Count */
.loading-more {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.count-info {
  padding: 15px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  border-radius: 0 0 8px 8px;
}

.has-more-hint {
  color: #409EFF;
  font-size: 12px;
}
</style>