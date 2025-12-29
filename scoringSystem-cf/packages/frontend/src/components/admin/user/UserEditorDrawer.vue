<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    :before-close="handleDrawerClose"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-user"></i>
          編輯使用者
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div v-if="editingUser" class="user-edit-form" v-loading="loadingUserData" element-loading-text="載入用戶資料中...">
      <!-- User Basic Info -->
      <div class="form-section">
        <h4><i class="fas fa-user"></i> 基本資料</h4>
        <div class="form-group">
          <label>Email</label>
          <el-input v-model="editingUser.userEmail" disabled />
        </div>
        <div class="form-group">
          <label>顯示名稱</label>
          <el-input v-model="editingUser.displayName" placeholder="輸入顯示名稱" />
        </div>
        <div class="form-group">
          <label>帳號狀態</label>
          <el-select v-model="editingUser.status" style="width: 100%">
            <el-option label="活躍" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </div>
      </div>

      <!-- Avatar Management Section -->
      <div class="form-section">
        <h4><i class="fas fa-user-circle"></i> 頭像設定</h4>

        <AvatarEditor
          v-model="avatarData"
          :size="80"
          shape="square"
          customization-layout="inline"
          :show-regenerate-button="true"
          :show-save-button="false"
          :user-name="editingUser?.displayName"
          @regenerate="handleRegenerateAvatar"
          @change="handleAvatarChange"
        />

        <div v-if="editingUserAvatarChanged" class="avatar-save-notice">
          <i class="fas fa-info-circle"></i>
          頭像設定已修改，保存用戶時將一起更新
        </div>
      </div>

      <!-- User Global Groups and Permissions Display -->
      <div class="form-section">
        <h4><i class="fas fa-user-shield"></i> 用戶權限概覽</h4>

        <div class="form-group">
          <label>所屬全域群組</label>
          <div class="user-groups-display">
            <el-tag
              v-for="group in editingUser.globalGroups || []"
              :key="group.groupId"
              type="primary"
              class="group-tag"
            >
              <i class="fas fa-users"></i>
              {{ group.groupName }}
            </el-tag>
            <EmptyState
              v-if="!editingUser.globalGroups || editingUser.globalGroups.length === 0"
              parent-icon="fa-user-gear"
              :icons="['fa-info-circle']"
              title="尚未加入任何全域群組"
              :compact="true"
              :enable-animation="false"
            />
          </div>
        </div>

        <div class="form-group">
          <label>擁有的全域權限</label>
          <div class="user-permissions-display">
            <el-tag
              v-for="permission in userGlobalPermissions"
              :key="permission.code"
              type="success"
              class="permission-tag"
            >
              <i :class="permission.icon"></i>
              {{ permission.name }}
            </el-tag>
            <EmptyState
              v-if="!userGlobalPermissions || userGlobalPermissions.length === 0"
              parent-icon="fa-user-gear"
              :icons="['fa-info-circle']"
              title="沒有任何全域權限"
              :compact="true"
              :enable-animation="false"
            />
          </div>
          <div class="help-text">
            <i class="fas fa-info-circle"></i>
            權限是通過群組成員身份獲得的。要修改權限，請到群組管理中調整群組權限或用戶的群組成員身份。
          </div>
        </div>
      </div>

      <!-- Global Groups Management -->
      <div class="form-section">
        <h4><i class="fas fa-globe"></i> 全域群組管理</h4>

        <div class="form-group">
          <label>已加入的全域群組</label>
          <div class="global-groups-display">
            <el-popconfirm
              v-for="group in editingUser.globalGroups || []"
              :key="group.groupId"
              :title="`確定要從「${group.groupName}」群組中移除用戶嗎？`"
              confirm-button-text="確定"
              cancel-button-text="取消"
              @confirm="handleRemoveFromGlobalGroup(group)"
            >
              <template #reference>
                <el-tag
                  type="warning"
                  closable
                  :disable-transitions="true"
                  class="global-group-tag"
                  style="cursor: pointer;"
                >
                  <i class="fas fa-crown"></i>
                  {{ group.groupName }}
                </el-tag>
              </template>
            </el-popconfirm>
            <div v-if="!editingUser.globalGroups || editingUser.globalGroups.length === 0" class="no-global-groups">
              <i class="fas fa-info-circle"></i>
              尚未加入任何全域群組
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>添加到全域群組</label>
          <div class="global-group-actions">
            <el-select
              v-model="selectedGlobalGroupToAdd"
              placeholder="選擇全域群組"
              style="width: 300px; margin-right: 10px"
            >
              <el-option
                v-for="group in availableGlobalGroups"
                :key="group.groupId"
                :label="group.groupName"
                :value="group.groupId"
              >
                <span style="font-weight: bold">{{ group.groupName }}</span>
                <span style="margin-left: 8px; color: #999; font-size: 12px">
                  {{ getGlobalGroupPermissionText(group) }}
                </span>
              </el-option>
              <template #empty>
                <div style="text-align: center; padding: 20px; color: #909399;">
                  <i class="fas fa-users-slash"></i>
                  <p style="margin: 8px 0 0 0; font-size: 14px;">所有全域群組已指派</p>
                </div>
              </template>
            </el-select>
            <el-button
              type="primary"
              @click="handleAddToGlobalGroup"
              :disabled="!selectedGlobalGroupToAdd"
            >
              <i class="fas fa-plus"></i>
              添加到群組
            </el-button>
          </div>
        </div>
      </div>

      <!-- Project Groups Management -->
      <div class="form-section">
        <h4><i class="fas fa-project-diagram"></i> 專案群組管理</h4>

        <div class="form-group">
          <label>使用者參與的專案群組</label>
          <div v-if="loadingUserProjectGroups" class="loading-indicator">
            <i class="fas fa-spinner fa-spin"></i>
            載入專案群組資料中...
          </div>
          <div v-else-if="userProjectGroups && userProjectGroups.length > 0" class="project-groups-list">
            <div
              v-for="projectGroup in userProjectGroups"
              :key="`${projectGroup.projectId}-${projectGroup.groupId}`"
              class="project-group-item"
            >
              <div class="project-group-info">
                <div class="project-info">
                  <span class="project-name">{{ projectGroup.projectName }}</span>
                  <span class="project-id">ID: {{ projectGroup.projectId }}</span>
                </div>
                <div class="group-info">
                  <span class="group-name">群組: {{ projectGroup.groupName }}</span>
                  <el-tag
                    :type="projectGroup.role === 'leader' ? 'warning' : 'info'"
                    size="small"
                  >
                    {{ projectGroup.role === 'leader' ? '組長' : '成員' }}
                  </el-tag>
                </div>
              </div>
              <div class="group-controls">
                <div class="allow-change-control">
                  <label>允許成員變更：</label>
                  <el-switch
                    v-model="projectGroup.allowChange"
                    @change="handleUpdateGroupAllowChange(projectGroup)"
                    :disabled="updatingGroupSettings.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                    :loading="updatingGroupSettings.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                    active-color="#13ce66"
                    inactive-color="#ff4949"
                  />
                </div>
                <div class="group-actions">
                  <el-popconfirm
                    :title="`確定要將用戶從專案「${projectGroup.projectName}」的群組「${projectGroup.groupName}」中移除嗎？`"
                    confirm-button-text="確定"
                    cancel-button-text="取消"
                    @confirm="handleRemoveFromProjectGroup(projectGroup)"
                  >
                    <template #reference>
                      <el-button
                        size="small"
                        type="danger"
                        :disabled="removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                      >
                        <i :class="removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`) ? 'fas fa-spinner fa-spin' : 'fas fa-times'"></i>
                        {{ removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`) ? '移除中...' : '移除' }}
                      </el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </div>
            </div>
          </div>
          <EmptyState
            v-else-if="!loadingUserProjectGroups"
            parent-icon="fa-user-gear"
            :icons="['fa-project-diagram']"
            title="此使用者尚未參與任何專案群組"
            :compact="true"
            :enable-animation="false"
          />
        </div>
      </div>

      <!-- Drawer Footer -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          @click="handleSave"
          :loading="savingEditingUser"
          :disabled="!hasUserChanges"
        >
          <i class="fas fa-save"></i>
          {{ savingEditingUser ? '保存中...' : '保存變更' }}
        </el-button>
        <el-button @click="handleCancel">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AvatarEditor from '@/components/shared/AvatarEditor.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import type { PropType } from 'vue'

// Drawer Breadcrumb (must be outside setup() for Options API)
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

/**
 * User data structure
 */
export interface User {
  userId: string
  userEmail: string
  userName?: string
  displayName?: string
  status?: string
  userAvatar?: string
  isActive?: boolean
  globalGroups?: GlobalGroupMembership[]
  projectGroups?: ProjectGroupMembership[]
  createdTime?: number
  lastLoginTime?: number
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, any>
}

/**
 * Global group membership
 */
export interface GlobalGroupMembership {
  groupId: string
  groupName: string
  allowChange?: boolean
  permissions?: string[]
  globalPermissions?: string[]
}

/**
 * Project group membership
 */
export interface ProjectGroupMembership {
  projectId: string
  projectName: string
  groupId: string
  groupName: string
  role: string
  isActive?: boolean
  allowChange?: boolean
}

/**
 * Global group definition
 */
export interface GlobalGroup {
  groupId: string
  groupName: string
  globalPermissions: string[]
  isActive: boolean
}

export default {
  name: 'UserEditorDrawer',
  components: {
    AvatarEditor,
    EmptyState
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    user: {
      type: Object as PropType<User | null>,
      default: null
    },
    globalGroups: {
      type: Array as PropType<GlobalGroup[]>,
      default: () => []
    }
  },
  emits: [
    'update:visible',
    'save',
    'refresh',
    'regenerate-avatar',
    'remove-from-global-group',
    'add-to-global-group',
    'update-group-allow-change',
    'remove-from-project-group'
  ],
  setup(props, { emit }) {
    // Two-way binding for visibility
    const localVisible = computed({
      get: () => props.visible,
      set: (val) => emit('update:visible', val)
    })

    // Editing user state
    const editingUser = ref<User | null>(null)
    const originalUser = ref<User | null>(null)
    const loadingUserData = ref(false)
    const savingEditingUser = ref(false)

    // Avatar management (simplified)
    const editingUserAvatarChanged = ref(false)

    // Global groups management
    const selectedGlobalGroupToAdd = ref('')
    const availableGlobalGroups = computed(() => {
      if (!props.globalGroups || !editingUser.value) return []
      const userGroupIds = (editingUser.value.globalGroups || []).map(g => g.groupId)
      return props.globalGroups.filter(g => !userGroupIds.includes(g.groupId))
    })

    // Project groups management
    const loadingUserProjectGroups = ref(false)
    const userProjectGroups = ref<ProjectGroupMembership[]>([])
    const removingFromGroups = reactive(new Set<string>())
    const updatingGroupSettings = reactive(new Set<string>())

    // User permissions
    const userGlobalPermissions = computed(() => {
      if (!editingUser.value || !editingUser.value.globalGroups) return []

      const permissionsMap = new Map()
      editingUser.value.globalGroups.forEach(group => {
        if (group.globalPermissions && Array.isArray(group.globalPermissions)) {
          group.globalPermissions.forEach(perm => {
            if (!permissionsMap.has(perm)) {
              permissionsMap.set(perm, {
                code: perm,
                name: getPermissionName(perm),
                icon: getPermissionIcon(perm)
              })
            }
          })
        }
      })

      return Array.from(permissionsMap.values())
    })

    // Avatar data for AvatarEditor component
    const avatarData = computed({
      get: () => ({
        avatarSeed: editingUser.value?.avatarSeed || '',
        avatarStyle: editingUser.value?.avatarStyle || 'avataaars',
        avatarOptions: editingUser.value?.avatarOptions || {}
      }),
      set: (value) => {
        if (editingUser.value) {
          editingUser.value.avatarSeed = value.avatarSeed
          editingUser.value.avatarStyle = value.avatarStyle
          editingUser.value.avatarOptions = value.avatarOptions
        }
      }
    })

    // Watch user prop to update editingUser
    watch(() => props.user, (newUser) => {
      if (newUser) {
        const clonedUser = JSON.parse(JSON.stringify(newUser))
        editingUser.value = clonedUser
        originalUser.value = JSON.parse(JSON.stringify(clonedUser))
      }
    }, { immediate: true, deep: true })

    // Computed: Detect if user has made changes
    const hasUserChanges = computed(() => {
      if (!editingUser.value || !originalUser.value) return false

      // Check avatar changed flag (catches regenerate events)
      if (editingUserAvatarChanged.value) return true

      // Check display name
      if (editingUser.value.displayName !== originalUser.value.displayName) return true

      // Check status
      if (editingUser.value.status !== originalUser.value.status) return true

      // Check avatar changes
      if (editingUser.value.avatarSeed !== originalUser.value.avatarSeed) return true
      if (editingUser.value.avatarStyle !== originalUser.value.avatarStyle) return true
      if (JSON.stringify(editingUser.value.avatarOptions) !== JSON.stringify(originalUser.value.avatarOptions)) return true

      // Check global groups (array comparison)
      const currentGroupIds = (editingUser.value.globalGroups || []).map(g => g.groupId).sort()
      const originalGroupIds = (originalUser.value.globalGroups || []).map(g => g.groupId).sort()
      if (currentGroupIds.length !== originalGroupIds.length) return true
      if (currentGroupIds.some((id, index) => id !== originalGroupIds[index])) return true

      return false
    })

    // Methods
    const handleDrawerClose = (done: () => void) => {
      if (hasUserChanges.value) {
        ElMessageBox.confirm('您有未保存的變更，確定要關閉嗎？', '確認', {
          confirmButtonText: '確定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          done()
        }).catch(() => {})
      } else {
        done()
      }
    }

    const handleCancel = () => {
      localVisible.value = false
      editingUser.value = null
      // hasUserChanges is now computed, will auto-reset to false when editingUser is null
    }

    const handleSave = () => {
      emit('save', {
        user: editingUser.value,
        avatarChanged: editingUserAvatarChanged.value
      })
    }

    const handleRegenerateAvatar = () => {
      // Set local flag to enable save button
      editingUserAvatarChanged.value = true

      emit('regenerate-avatar', {
        user: editingUser.value
      })
    }

    const handleAvatarChange = () => {
      editingUserAvatarChanged.value = true
    }

    const handleRemoveFromGlobalGroup = (group: GlobalGroupMembership) => {
      emit('remove-from-global-group', {
        userId: editingUser.value?.userId,
        groupId: group.groupId
      })
    }

    const handleAddToGlobalGroup = () => {
      emit('add-to-global-group', {
        userId: editingUser.value?.userId,
        groupId: selectedGlobalGroupToAdd.value
      })
      selectedGlobalGroupToAdd.value = ''
    }

    const handleUpdateGroupAllowChange = (projectGroup: ProjectGroupMembership) => {
      emit('update-group-allow-change', projectGroup)
    }

    const handleRemoveFromProjectGroup = (projectGroup: ProjectGroupMembership) => {
      emit('remove-from-project-group', projectGroup)
    }

    const getGlobalGroupPermissionText = (group: GlobalGroupMembership) => {
      if (!group.globalPermissions || group.globalPermissions.length === 0) {
        return '無權限'
      }
      return `${group.globalPermissions.length} 個權限`
    }

    const getPermissionName = (code: string) => {
      const permissionNames: Record<string, string> = {
        'system_admin': '系統管理員',
        'manage_users': '管理使用者',
        'generate_invites': '生成邀請碼',
        'create_project': '創建專案',
        'manage_global_groups': '管理全域群組'
      }
      return permissionNames[code] || code
    }

    const getPermissionIcon = (code: string) => {
      const permissionIcons: Record<string, string> = {
        'system_admin': 'fas fa-crown',
        'manage_users': 'fas fa-users-cog',
        'generate_invites': 'fas fa-envelope',
        'create_project': 'fas fa-plus-circle',
        'manage_global_groups': 'fas fa-users'
      }
      return permissionIcons[code] || 'fas fa-key'
    }

    return {
      localVisible,
      editingUser,
      loadingUserData,
      savingEditingUser,
      hasUserChanges,
      editingUserAvatarChanged,
      avatarData,
      selectedGlobalGroupToAdd,
      availableGlobalGroups,
      loadingUserProjectGroups,
      userProjectGroups,
      removingFromGroups,
      updatingGroupSettings,
      userGlobalPermissions,
      currentPageName,
      currentPageIcon,
      handleDrawerClose,
      handleCancel,
      handleSave,
      handleRegenerateAvatar,
      handleAvatarChange,
      handleRemoveFromGlobalGroup,
      handleAddToGlobalGroup,
      handleUpdateGroupAllowChange,
      handleRemoveFromProjectGroup,
      getGlobalGroupPermissionText
    }
  }
}
</script>

<style scoped>
/* Form sections */
.form-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.form-section h4 {
  margin-bottom: 15px;
  color: #2c3e50;
  font-size: 16px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #606266;
}

/* Avatar management */
.avatar-management {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.avatar-preview {
  position: relative;
}

.avatar-retry-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 10px;
}

.avatar-controls {
  flex: 1;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.avatar-style-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-color-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.color-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  color: #606266;
}

.color-options {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.color-option {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 5px rgba(64, 158, 255, 0.5);
}

.avatar-save-notice {
  margin-top: 10px;
  padding: 8px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  font-size: 12px;
  color: #856404;
}

/* Groups and permissions display */
.user-groups-display,
.user-permissions-display,
.global-groups-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  padding: 10px;
  background: white;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
}

.no-groups,
.no-permissions,
.no-global-groups {
  color: #909399;
  font-size: 14px;
}

.group-tag,
.permission-tag,
.global-group-tag {
  margin: 0;
}

.help-text {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

/* Global group actions */
.global-group-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Project groups */
.loading-indicator {
  text-align: center;
  padding: 20px;
  color: #909399;
}

.project-groups-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.project-group-item {
  padding: 15px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.project-group-info {
  margin-bottom: 10px;
}

.project-info {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
}

.project-name {
  font-weight: bold;
  color: #2c3e50;
}

.project-id {
  color: #909399;
  font-size: 12px;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-name {
  color: #606266;
}

.group-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
}

.allow-change-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.allow-change-control label {
  margin: 0;
  font-size: 14px;
}

.no-project-groups {
  text-align: center;
  padding: 20px;
  color: #909399;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */

.user-edit-form {
  padding: 20px;
}
</style>
