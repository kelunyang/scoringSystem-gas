<template>
  <div class="project-groups-list">
    <!-- Project Selector - Always Visible -->
    <div class="project-selector-section">
      <div class="project-selector-banner">
        <label><i class="fas fa-project-diagram"></i> 當前專案:</label>
        <el-select
          :model-value="selectedProjectId"
          @update:model-value="$emit('update:selectedProjectId', $event)"
          placeholder="-- 請選擇專案 --"
          style="width: 300px"
        >
          <el-option
            v-for="project in projects"
            :key="project.projectId"
            :value="project.projectId"
            :label="project.projectName"
          />
        </el-select>
        <el-button
          type="primary"
          @click="$emit('open-viewer-management')"
          :disabled="!selectedProjectId"
          style="margin-left: 12px;"
        >
          <i class="fas fa-users-cog"></i>
          專案參與者設定
        </el-button>
      </div>
    </div>

    <!-- Project Groups Content -->
    <div v-if="selectedProjectId">
      <!-- Unified Filter Toolbar -->
      <AdminFilterToolbar
        variant="default"
        :loading="loading"
        :export-data="exportConfig.data"
        :export-filename="exportConfig.filename"
        :export-headers="exportConfig.headers"
        :export-row-mapper="exportConfig.rowMapper"
      >

        <!-- Core Filters (Always Visible) -->
        <template #filters-core>
          <div class="filter-item">
            <span class="filter-label">搜尋：</span>
            <el-input
              :model-value="searchText"
              @update:model-value="$emit('update:searchText', $event)"
              placeholder="搜尋專案群組名稱"
              clearable
              style="width: 250px;"
            >
              <template #prefix>
                <i class="fas fa-search"></i>
              </template>
            </el-input>
          </div>

          <div class="filter-item">
            <span class="filter-label">狀態：</span>
            <el-select
              :model-value="statusFilter"
              @update:model-value="$emit('update:statusFilter', $event)"
              placeholder="全部狀態"
              style="width: 150px;"
            >
              <el-option label="全部狀態" value="" />
              <el-option label="活躍" value="active" />
              <el-option label="停用" value="inactive" />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">顯示已停用：</span>
            <el-switch
              :model-value="showInactive"
              @update:model-value="$emit('update:showInactive', $event)"
              inline-prompt
              active-text="顯示"
              inactive-text="隱藏"
            />
          </div>
        </template>

        <!-- Action Buttons -->
        <template #actions>
          <el-badge :value="selectedGroups.size" :hidden="selectedGroups.size === 0">
            <el-tooltip content="整批停用" placement="top">
              <el-button
                type="danger"
                size="small"
                @click="$emit('batch-deactivate')"
                :disabled="selectedGroups.size === 0"
              >
                <i class="fas fa-times-circle"></i>
                <span class="btn-text">整批停用</span>
              </el-button>
            </el-tooltip>
          </el-badge>
          <el-badge :value="selectedGroups.size" :hidden="selectedGroups.size === 0">
            <el-tooltip content="整批啟用" placement="top">
              <el-button
                type="success"
                size="small"
                @click="$emit('batch-activate')"
                :disabled="selectedGroups.size === 0"
              >
                <i class="fas fa-check-circle"></i>
                <span class="btn-text">整批啟用</span>
              </el-button>
            </el-tooltip>
          </el-badge>
          <el-badge :value="selectedGroups.size" :hidden="selectedGroups.size === 0">
            <el-tooltip content="整批鎖定" placement="top">
              <el-button
                type="warning"
                size="small"
                @click="$emit('batch-lock')"
                :disabled="selectedGroups.size === 0"
              >
                <i class="fas fa-lock"></i>
                <span class="btn-text">整批鎖定</span>
              </el-button>
            </el-tooltip>
          </el-badge>
          <el-badge :value="selectedGroups.size" :hidden="selectedGroups.size === 0">
            <el-tooltip content="整批解鎖" placement="top">
              <el-button
                type="info"
                size="small"
                @click="$emit('batch-unlock')"
                :disabled="selectedGroups.size === 0"
              >
                <i class="fas fa-unlock"></i>
                <span class="btn-text">整批解鎖</span>
              </el-button>
            </el-tooltip>
          </el-badge>
        </template>
      </AdminFilterToolbar>

      <!-- Groups Table -->
      <ProjectGroupsTable
        :groups="filteredGroups"
        :loading="loading"
        :selected-groups="selectedGroups"
        :expanded-group-id="expandedGroupId"
        :members-map="membersMap"
        :loading-members="loadingMembers"
        :removing-member-email="removingMemberEmail"
        :updating-group-id="updatingGroupId"
        :updating-member-email="updatingMemberEmail"
        :adding-member-for-group="addingMemberForGroup"
        :can-manage-roles="canManageRoles"
        :pending-role-changes="pendingRoleChanges"
        @toggle-all="$emit('toggle-all')"
        @toggle-expansion="$emit('toggle-expansion', $event)"
        @toggle-selection="$emit('toggle-selection', $event)"
        @edit="$emit('edit', $event)"
        @deactivate="$emit('deactivate', $event)"
        @activate="$emit('activate', $event)"
        @update-allow-change="$emit('update-allow-change', $event)"
        @open-add-member="$emit('open-add-member', $event)"
        @remove-member="$emit('remove-member', $event)"
        @batch-remove-members="$emit('batch-remove-members', $event)"
        @update-member-role="$emit('update-member-role', $event)"
        @role-change-pending="$emit('role-change-pending', $event)"
        @batch-update-roles="$emit('batch-update-roles', $event)"
      >
        <template #add-member-form="{ group }">
          <AddMembersForm
            v-if="addingMemberForGroup === group.groupId"
            :selected-users="selectedUsersToAdd"
            @update:selected-users="$emit('update:selectedUsersToAdd', $event)"
            :available-users="availableUsersForGroup(group)"
            :member-role="memberRole"
            @update:member-role="$emit('update:memberRole', $event)"
            :adding="addingMember"
            group-type="project"
            @add="$emit('add-members', group)"
            @cancel="$emit('cancel-add-member')"
          />
        </template>
      </ProjectGroupsTable>
    </div>

    <!-- No Project Selected -->
    <div v-else class="no-project-selected">
      <i class="fas fa-project-diagram"></i>
      <p>請先選擇一個專案來管理其群組</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import ProjectGroupsTable from './ProjectGroupsTable.vue'
import AddMembersForm from '../members/AddMembersForm.vue'
import { useGroupFiltering } from '@/composables/useGroupFiltering'
import type { Project, ProjectGroup, GroupMember, User, MemberRole } from '@/types/group-management'
import AdminFilterToolbar from '../../shared/AdminFilterToolbar.vue'

defineOptions({
  name: 'ProjectGroupsList'
})

const props = defineProps<{
  projects: Project[]
  selectedProjectId: string
  groups: ProjectGroup[]
  loading: boolean
  searchText: string
  statusFilter: string
  showInactive: boolean
  selectedGroups: Set<string>
  expandedGroupId: string | null
  membersMap: Map<string, GroupMember[]>
  loadingMembers: Set<string>
  removingMemberEmail: string
  updatingGroupId: string | null
  updatingMemberEmail?: string | null
  addingMemberForGroup: string | null
  selectedUsersToAdd: string[]
  allUsers: User[]
  ungroupedMembers: string[]
  memberRole: MemberRole
  addingMember: boolean
  canManageRoles?: boolean
  pendingRoleChanges?: Map<string, 'member' | 'leader'>
}>()

const emit = defineEmits<{
  'update:selectedProjectId': [projectId: string]
  'update:searchText': [text: string]
  'update:statusFilter': [status: string]
  'update:showInactive': [value: boolean]
  'update:selectedUsersToAdd': [users: string[]]
  'update:memberRole': [role: MemberRole]
  'toggle-all': []
  'toggle-expansion': [group: ProjectGroup]
  'toggle-selection': [groupId: string]
  'edit': [group: ProjectGroup]
  'deactivate': [group: ProjectGroup]
  'activate': [group: ProjectGroup]
  'update-allow-change': [payload: { groupId: string; allowChange: boolean }]
  'batch-deactivate': []
  'batch-activate': []
  'batch-lock': []
  'batch-unlock': []
  'open-add-member': [group: ProjectGroup]
  'add-members': [group: ProjectGroup]
  'cancel-add-member': []
  'remove-member': [payload: { member: GroupMember; group: ProjectGroup }]
  'batch-remove-members': [payload: { members: GroupMember[]; group: ProjectGroup }]
  'update-member-role': [payload: { member: GroupMember; group: ProjectGroup; newRole: 'member' | 'leader' }]
  'role-change-pending': [payload: { userEmail: string; groupId: string; newRole: 'member' | 'leader' }]
  'batch-update-roles': [payload: { members: GroupMember[]; group: ProjectGroup }]
  'open-viewer-management': []
}>()

// Use composable for filtering logic
const { filteredGroups } = useGroupFiltering(
  toRef(props, 'groups'),
  toRef(props, 'searchText'),
  toRef(props, 'statusFilter'),
  toRef(props, 'showInactive')
)

// Export configuration
const exportConfig = computed(() => ({
  data: filteredGroups.value,
  filename: '專案群組列表',
  headers: ['群組ID', '群組名稱', '狀態', '組員數', '組長數', '允許成員變更'],
  rowMapper: (group: ProjectGroup) => [
    group.groupId,
    group.groupName,
    group.status === 'active' ? '活躍' : '停用',
    group.memberCount || 0,
    group.leaderCount || 0,
    group.allowChange ? '是' : '否'
  ]
}))

// Get available users for a group (excluding existing members)
const availableUsersForGroup = (group: ProjectGroup) => {
  const members = props.membersMap.get(group.groupId) || []
  const memberEmails = new Set(members.map(m => m.userEmail))
  const ungroupedSet = new Set(props.ungroupedMembers)

  return props.allUsers.map(user => ({
    ...user,
    disabled: memberEmails.has(user.userEmail),
    isUngrouped: ungroupedSet.has(user.userEmail)
  }))
}
</script>

<style scoped>
.project-groups-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.project-selector-section {
  background-color: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.project-selector-banner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-selector-banner label {
  font-weight: 500;
  color: #374151;
  min-width: 100px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-selector {
  background-color: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selector-row label {
  font-weight: 500;
  color: #374151;
  min-width: 80px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.left-actions {
  flex: 1;
}

.right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.batch-create-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-container label {
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.count-display {
  font-weight: 600;
  color: #409eff;
  min-width: 30px;
}

.no-project-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.no-project-selected i {
  font-size: 48px;
  color: #d1d5db;
  margin-bottom: 16px;
}

.no-project-selected p {
  font-size: 16px;
  color: #6b7280;
  margin: 0;
}
</style>
