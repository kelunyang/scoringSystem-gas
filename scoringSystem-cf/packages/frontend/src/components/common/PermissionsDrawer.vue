<template>
  <Teleport to="body">
    <el-drawer
      v-model="drawerStore.isOpen"
      direction="btt"
      size="100%"
      class="drawer-navy permissions-drawer-global"
      @close="drawerStore.close()"
    >
      <template #header>
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-shield-alt"></i>
            權限檢視
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="drawerStore.projectId">
            <i class="fas fa-project-diagram"></i>
            專案權限
          </el-breadcrumb-item>
        </el-breadcrumb>
      </template>

      <div class="drawer-body">
        <DrawerAlertZone />

        <!-- User Info Section -->
        <div class="form-section">
          <h4><i class="fas fa-user"></i> 使用者資訊</h4>
          <div class="info-row">
            <span class="info-label">使用者名稱：</span>
            <span class="info-value">{{ user?.displayName }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">電子郵件：</span>
            <span class="info-value">{{ user?.userEmail }}</span>
          </div>
        </div>

        <!-- Global Permissions Section -->
        <div class="form-section">
          <h4><i class="fas fa-globe"></i> 全域權限</h4>
          <div class="permission-list">
            <div
              v-for="perm in globalPermissions"
              :key="perm"
              class="permission-tag"
            >
              <i class="fas fa-check-circle"></i>
              {{ perm }}
            </div>
            <div v-if="!globalPermissions.length" class="no-permission">
              <i class="fas fa-info-circle"></i>
              無全域權限
            </div>
          </div>
        </div>

        <!-- Project Permission Section (only show when in project) -->
        <div v-if="drawerStore.projectId && availableRoles.length > 0" class="form-section">
          <h4><i class="fas fa-project-diagram"></i> 此專案中的權限</h4>

          <!-- 角色切换 el-segmented（仅多角色时显示） -->
          <div v-if="hasMultipleRoles" class="role-switcher">
            <div class="role-switcher-label">可用角色：</div>
            <el-segmented
              v-model="selectedRole"
              :options="roleOptions"
              size="default"
              @change="handleRoleChange"
            >
              <template #default="{ item }">
                <div class="role-option">
                  <i :class="getRoleIcon(item.value)"></i>
                  <span>{{ item.label }}</span>
                </div>
              </template>
            </el-segmented>
          </div>

          <!-- 单角色时直接显示 -->
          <div v-else class="single-role">
            <div class="permission-tag highlight">
              <i :class="getRoleIcon(availableRoles[0])"></i>
              {{ getRoleLabel(availableRoles[0]) }}
            </div>
          </div>

          <!-- 当前角色的权限列表 -->
          <div v-if="currentRolePermissions.length > 0" class="current-role-permissions">
            <div class="permissions-label">當前角色權限：</div>
            <div class="permission-list">
              <div
                v-for="perm in currentRolePermissions"
                :key="perm"
                class="permission-tag small"
              >
                <i class="fas fa-check-circle"></i>
                {{ perm }}
              </div>
            </div>
          </div>
        </div>

        <!-- Sudo Mode Section (only for Teacher/Observer in project context) -->
        <div v-if="canSudo && drawerStore.projectId" class="form-section sudo-section">
          <h4><i class="fas fa-user-secret"></i> Sudo 模式</h4>

          <!-- Currently in sudo mode -->
          <div v-if="sudoStore.isActive" class="sudo-active-info">
            <el-alert
              type="warning"
              :closable="false"
              show-icon
            >
              <template #title>
                <span>正在以 <strong>{{ sudoStore.displayInfo?.name }}</strong> 的身份檢視</span>
              </template>
              <template #default>
                <div class="sudo-target-details">
                  <span>{{ sudoStore.displayInfo?.email }}</span>
                  <span v-if="sudoStore.displayInfo?.group"> | {{ sudoStore.displayInfo?.group }} ({{ sudoStore.displayInfo?.role }})</span>
                </div>
              </template>
            </el-alert>
            <el-button type="warning" @click="handleExitSudo" class="sudo-exit-btn">
              <i class="fas fa-sign-out-alt"></i> 退出 Sudo 模式
            </el-button>
          </div>

          <!-- Not in sudo mode - show selector -->
          <div v-else class="sudo-selector">
            <div class="sudo-description">
              <i class="fas fa-info-circle"></i>
              以學生視角查看系統（唯讀模式）
            </div>
            <el-select
              v-model="selectedSudoTarget"
              placeholder="選擇要扮演的學生..."
              filterable
              clearable
              class="sudo-select"
              :loading="loadingMembers"
            >
              <el-option-group
                v-for="group in groupedMembers"
                :key="group.groupName"
                :label="group.groupName"
              >
                <el-option
                  v-for="member in group.members"
                  :key="member.userEmail"
                  :label="`${member.displayName} (${member.role === 'leader' ? '組長' : '組員'})`"
                  :value="member.userEmail"
                >
                  <div class="sudo-option">
                    <span class="sudo-option-name">{{ member.displayName }}</span>
                    <el-tag size="small" :type="member.role === 'leader' ? 'warning' : 'info'">
                      {{ member.role === 'leader' ? '組長' : '組員' }}
                    </el-tag>
                  </div>
                </el-option>
              </el-option-group>
            </el-select>
            <el-button
              type="primary"
              :disabled="!selectedSudoTarget"
              @click="handleEnterSudo"
            >
              <i class="fas fa-user-secret"></i> 進入 Sudo 模式
            </el-button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="drawer-actions">
          <el-button @click="drawerStore.close()">
            <i class="fas fa-times"></i> 關閉
          </el-button>
        </div>
      </div>
    </el-drawer>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePermissionsDrawerStore } from '@/stores/permissionsDrawer'
import { useSudoStore, type SudoTargetUser } from '@/stores/sudo'
import { useAuth } from '@/composables/useAuth'
import { useProjectCore } from '@/composables/useProjectDetail'
import { useRoleSwitch } from '@/composables/useRoleSwitch'
import DrawerAlertZone from './DrawerAlertZone.vue'

// Stores
const drawerStore = usePermissionsDrawerStore()
const sudoStore = useSudoStore()

// Auth
const { user } = useAuth()

// Global permissions
const globalPermissions = computed(() => {
  return user.value?.permissions || []
})

// Project data (only fetch when projectId is available)
const projectIdRef = computed(() => drawerStore.projectId)
const { data: projectCore, isLoading: projectLoading } = useProjectCore(projectIdRef)

// Wrap user in a computed to ensure reactivity
const userRef = computed(() => user.value)

// Role switching (only when in project context)
// Pass projectIdRef (computed) for reactivity when drawer opens with different projects
const {
  availableRoles,
  currentRole,
  hasMultipleRoles,
  currentRolePermissions,
  switchRole,
  getRoleLabel,
  getRoleIcon,
  getRolePermissions
} = useRoleSwitch(
  projectIdRef,
  projectCore,
  userRef
)

// Local selected role (synced with currentRole)
// Using string type for el-segmented compatibility (convert null to empty string)
const selectedRole = ref<string>(currentRole.value ?? '')

// Watch currentRole changes
watch(currentRole, (newRole) => {
  if (newRole) {
    selectedRole.value = newRole
  }
})

// Role options for el-segmented
const roleOptions = computed(() => {
  return availableRoles.value.map((role: string) => ({
    label: getRoleLabel(role),
    value: role
  }))
})

// Handle role change
const handleRoleChange = (newRole: string) => {
  selectedRole.value = newRole
  switchRole(newRole)
}

// ============ Sudo Mode Logic ============

// Check if current user can sudo (Teacher or Observer)
const canSudo = computed(() => {
  // Must have a project context
  if (!drawerStore.projectId) return false

  // Check if user is teacher, observer, admin, or project creator
  const isTeacher = availableRoles.value.includes('teacher')
  const isObserver = availableRoles.value.includes('observer')
  const isAdmin = availableRoles.value.includes('admin')

  return isTeacher || isObserver || isAdmin
})

// Loading state for members
const loadingMembers = computed(() => projectLoading.value)

// Selected sudo target email
const selectedSudoTarget = ref<string>('')

// Group members by their groups for the selector
interface GroupedMember {
  groupName: string
  members: Array<{
    userEmail: string
    displayName: string
    role: 'leader' | 'member'
    userId: string
    avatarSeed?: string
    avatarStyle?: string
  }>
}

const groupedMembers = computed<GroupedMember[]>(() => {
  if (!projectCore.value) return []

  const data = projectCore.value as any
  const userGroups = data.userGroups || []
  const groups = data.groups || []
  const users = data.users || []

  // Create a map of groupId to group info
  const groupMap = new Map<string, { groupId: string; groupName: string }>()
  for (const g of groups) {
    groupMap.set(g.groupId, { groupId: g.groupId, groupName: g.groupName })
  }

  // Create a map of userEmail to user info
  const userMap = new Map<string, { displayName: string; userId: string; avatarSeed?: string; avatarStyle?: string }>()
  for (const u of users) {
    userMap.set(u.userEmail, {
      displayName: u.displayName,
      userId: u.userId,
      avatarSeed: u.avatarSeed,
      avatarStyle: u.avatarStyle
    })
  }

  // Group members by groupId
  const grouped = new Map<string, GroupedMember>()

  for (const ug of userGroups) {
    if (ug.isActive !== 1) continue

    const groupInfo = groupMap.get(ug.groupId)
    if (!groupInfo) continue

    const userInfo = userMap.get(ug.userEmail)
    if (!userInfo) continue

    if (!grouped.has(ug.groupId)) {
      grouped.set(ug.groupId, {
        groupName: groupInfo.groupName,
        members: []
      })
    }

    grouped.get(ug.groupId)!.members.push({
      userEmail: ug.userEmail,
      displayName: userInfo.displayName,
      role: ug.role as 'leader' | 'member',
      userId: userInfo.userId,
      avatarSeed: userInfo.avatarSeed,
      avatarStyle: userInfo.avatarStyle
    })
  }

  // Sort members within each group (leaders first)
  for (const group of grouped.values()) {
    group.members.sort((a, b) => {
      if (a.role === 'leader' && b.role !== 'leader') return -1
      if (a.role !== 'leader' && b.role === 'leader') return 1
      return a.displayName.localeCompare(b.displayName)
    })
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.groupName.localeCompare(b.groupName)
  )
})

// Find member info by email
const findMemberByEmail = (email: string): SudoTargetUser | null => {
  for (const group of groupedMembers.value) {
    const member = group.members.find(m => m.userEmail === email)
    if (member) {
      return {
        userId: member.userId,
        userEmail: member.userEmail,
        displayName: member.displayName,
        avatarSeed: member.avatarSeed,
        avatarStyle: member.avatarStyle,
        groupName: group.groupName,
        role: member.role
      }
    }
  }
  return null
}

// Enter sudo mode
const handleEnterSudo = () => {
  if (!selectedSudoTarget.value || !drawerStore.projectId) return

  const target = findMemberByEmail(selectedSudoTarget.value)
  if (!target) return

  sudoStore.enterSudo(target, drawerStore.projectId)
  drawerStore.close()

  // Reload the page to apply sudo mode
  window.location.reload()
}

// Exit sudo mode
const handleExitSudo = () => {
  sudoStore.exitSudo()
  drawerStore.close()

  // Reload the page to exit sudo mode
  window.location.reload()
}

// Reset selected target when drawer opens
watch(() => drawerStore.isOpen, (isOpen) => {
  if (isOpen) {
    selectedSudoTarget.value = ''
  }
})
</script>

<style scoped>
/* Info Row Styles */
.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  min-width: 100px;
}

.info-value {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
}

/* Permission List Styles */
.permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.permission-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: #606266;
  background-color: #f0f2f5;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  transition: all 0.2s;
}

.permission-tag i {
  font-size: 12px;
  color: #67c23a;
}

.permission-tag.highlight {
  background-color: #ecf5ff;
  color: #409eff;
  font-weight: 500;
  border: 1px solid #b3d8ff;
}

.permission-tag.highlight i {
  color: #409eff;
}

.permission-tag.small {
  font-size: 12px;
  padding: 6px 10px;
}

.no-permission {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #909399;
  font-style: italic;
  padding: 12px;
  background-color: #fafafa;
  border-radius: 6px;
}

.no-permission i {
  font-size: 14px;
}

/* Role Switcher Styles */
.role-switcher {
  margin-bottom: 16px;
}

.role-switcher-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-option i {
  font-size: 14px;
}

.single-role {
  margin-bottom: 16px;
}

/* Current Role Permissions */
.current-role-permissions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.permissions-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
}

/* el-segmented customization */
:deep(.el-segmented) {
  width: 100%;
}

:deep(.el-segmented__item) {
  padding: 8px 12px;
}

/* Ensure drawer appears above everything */
.permissions-drawer-global :deep(.el-drawer) {
  z-index: 3000 !important;
}

/* Sudo Mode Styles */
.sudo-section {
  border-top: 2px dashed #e6a23c;
  padding-top: 16px;
}

.sudo-section h4 {
  color: #e6a23c;
}

.sudo-section h4 i {
  margin-right: 8px;
}

.sudo-active-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sudo-target-details {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.sudo-exit-btn {
  align-self: flex-start;
}

.sudo-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sudo-description {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #909399;
  padding: 8px 12px;
  background-color: #fdf6ec;
  border-radius: 6px;
  border: 1px solid #faecd8;
}

.sudo-description i {
  color: #e6a23c;
}

.sudo-select {
  width: 100%;
}

.sudo-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.sudo-option-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
