<template>
  <div class="global-groups-list">
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
            placeholder="搜尋全域群組名稱"
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
      </template>
    </AdminFilterToolbar>

    <!-- Groups Table -->
    <GlobalGroupsTable
      :groups="filteredGroups"
      :loading="loading"
      :selected-groups="selectedGroups"
      :expanded-group-id="expandedGroupId"
      :members-map="membersMap"
      :loading-members="loadingMembers"
      :removing-member-email="removingMemberEmail"
      :adding-member-for-group="addingMemberForGroup"
      @toggle-all="$emit('toggle-all')"
      @toggle-expansion="$emit('toggle-expansion', $event)"
      @toggle-selection="$emit('toggle-selection', $event)"
      @toggle-status="$emit('toggle-status', $event)"
      @edit="$emit('edit', $event)"
      @deactivate="$emit('deactivate', $event)"
      @activate="$emit('activate', $event)"
      @open-add-member="$emit('open-add-member', $event)"
      @remove-member="$emit('remove-member', $event)"
      @batch-remove-members="$emit('batch-remove-members', $event)"
    >
      <template #add-member-form="{ group }">
        <AddMembersForm
          v-if="addingMemberForGroup === group.groupId"
          :selected-users="selectedUsersToAdd"
          @update:selected-users="$emit('update:selectedUsersToAdd', $event)"
          :available-users="availableUsersForGroup(group)"
          :adding="addingMember"
          group-type="global"
          @add="$emit('add-members', group)"
          @cancel="$emit('cancel-add-member')"
        />
      </template>
    </GlobalGroupsTable>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import GlobalGroupsTable from './GlobalGroupsTable.vue'
import GlobalGroupBatchActions from './GlobalGroupBatchActions.vue'
import GroupFilters from '../shared/GroupFilters.vue'
import AddMembersForm from '../members/AddMembersForm.vue'
import { useGroupFiltering } from '@/composables/useGroupFiltering'
import type { GlobalGroup, GroupMember, User } from '@/types/group-management'
import AdminFilterToolbar from '../../shared/AdminFilterToolbar.vue'

defineOptions({
  name: 'GlobalGroupsList'
})

const props = defineProps<{
  groups: GlobalGroup[]
  loading: boolean
  searchText: string
  statusFilter: string
  selectedGroups: Set<string>
  expandedGroupId: string | null
  membersMap: Map<string, GroupMember[]>
  loadingMembers: Set<string>
  removingMemberEmail: string
  addingMemberForGroup: string | null
  selectedUsersToAdd: string[]
  allUsers: User[]
  addingMember: boolean
}>()

defineEmits<{
  'update:searchText': [text: string]
  'update:statusFilter': [status: string]
  'update:selectedUsersToAdd': [users: string[]]
  'create-global-group': []
  'toggle-all': []
  'toggle-expansion': [group: GlobalGroup]
  'toggle-selection': [groupId: string]
  'toggle-status': [group: GlobalGroup]
  'edit': [group: GlobalGroup]
  'deactivate': [group: GlobalGroup]
  'activate': [group: GlobalGroup]
  'batch-deactivate': []
  'batch-activate': []
  'open-add-member': [group: GlobalGroup]
  'add-members': [group: GlobalGroup]
  'cancel-add-member': []
  'remove-member': [payload: { member: GroupMember; group: GlobalGroup }]
  'batch-remove-members': [payload: { members: GroupMember[]; group: GlobalGroup }]
}>()

// Use composable for filtering logic
const { filteredGroups } = useGroupFiltering(
  toRef(props, 'groups'),
  toRef(props, 'searchText'),
  toRef(props, 'statusFilter')
)

// Export configuration
const exportConfig = computed(() => ({
  data: filteredGroups.value as unknown as Record<string, unknown>[],
  filename: '全域群組列表',
  headers: ['群組ID', '群組名稱', '狀態', '成員數', '全域權限', '創建時間'],
  rowMapper: (item: Record<string, unknown>) => {
    const group = item as unknown as GlobalGroup
    return [
      group.groupId,
      group.groupName,
      group.isActive ? '活躍' : '停用',
      (props.membersMap.get(group.groupId) || []).length,
      Array.isArray(group.globalPermissions) ? group.globalPermissions.join(', ') : (group.globalPermissions || '-'),
      group.createdTime ? new Date(group.createdTime).toLocaleString('zh-TW') : '-'
    ] as (string | number)[]
  }
}))

// Get available users for a group (excluding existing members)
const availableUsersForGroup = (group: GlobalGroup) => {
  const members = props.membersMap.get(group.groupId) || []
  const memberEmails = new Set(members.map(m => m.userEmail))

  return props.allUsers.map(user => ({
    ...user,
    disabled: memberEmails.has(user.userEmail)
  }))
}
</script>

<style scoped>
.global-groups-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
