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
import { useAuth } from '@/composables/useAuth'
import { useProjectCore } from '@/composables/useProjectDetail'
import { useRoleSwitch } from '@/composables/useRoleSwitch'
import DrawerAlertZone from './DrawerAlertZone.vue'

// Store
const drawerStore = usePermissionsDrawerStore()

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
const selectedRole = ref(currentRole.value)

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
</style>
