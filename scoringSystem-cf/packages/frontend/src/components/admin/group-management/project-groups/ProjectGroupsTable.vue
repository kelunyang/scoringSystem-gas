<template>
  <div class="project-groups-table">
    <table v-if="groups.length > 0" class="groups-table">
      <thead>
        <tr>
          <th style="width: 50px; text-align: center;">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="hasPartialSelection"
              @change="$emit('toggle-all')"
            />
          </th>
          <th>群組名稱</th>
          <th style="width: 120px;">允許加入成員</th>
          <th style="width: 100px;">狀態</th>
          <th style="width: 100px; text-align: center;">組員</th>
          <th style="width: 100px; text-align: center;">組長</th>
          <th style="width: 200px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <ProjectGroupRow
          v-for="group in groups"
          :key="group.groupId"
          :group="group"
          :is-expanded="expandedGroupId === group.groupId"
          :is-selected="selectedGroups.has(group.groupId)"
          :members="membersMap.get(group.groupId)"
          :loading-members="loadingMembers.has(group.groupId)"
          :removing-member-email="removingMemberEmail"
          :updating-allow-change="updatingGroupId === group.groupId"
          :updating-member-email="updatingMemberEmail"
          :show-add-form="addingMemberForGroup === group.groupId"
          :can-manage-roles="canManageRoles"
          :pending-role-changes="pendingRoleChanges"
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
            <slot name="add-member-form" :group="group"></slot>
          </template>
        </ProjectGroupRow>
      </tbody>
    </table>

    <EmptyState
      v-else-if="!loading"
      :icons="['fa-layer-group']"
      parent-icon="fa-users-rectangle"
      title="此專案尚無群組或沒有符合條件的群組"
      :enable-animation="false"
    />

    <div v-if="loading" v-loading="true" style="min-height: 200px;"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ProjectGroupRow from './ProjectGroupRow.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import type { ProjectGroup, GroupMember } from '@/types/group-management'

defineOptions({
  name: 'ProjectGroupsTable'
})

const props = defineProps<{
  groups: ProjectGroup[]
  loading: boolean
  selectedGroups: Set<string>
  expandedGroupId: string | null
  membersMap: Map<string, GroupMember[]>
  loadingMembers: Set<string>
  removingMemberEmail: string
  updatingGroupId: string | null
  updatingMemberEmail?: string | null
  addingMemberForGroup: string | null
  canManageRoles?: boolean
  pendingRoleChanges?: Map<string, 'member' | 'leader'>
}>()

const emit = defineEmits<{
  'toggle-all': []
  'toggle-expansion': [group: ProjectGroup]
  'toggle-selection': [groupId: string]
  'edit': [group: ProjectGroup]
  'deactivate': [group: ProjectGroup]
  'activate': [group: ProjectGroup]
  'update-allow-change': [payload: { groupId: string; allowChange: boolean }]
  'open-add-member': [group: ProjectGroup]
  'remove-member': [payload: { member: GroupMember; group: ProjectGroup }]
  'batch-remove-members': [payload: { members: GroupMember[]; group: ProjectGroup }]
  'update-member-role': [payload: { member: GroupMember; group: ProjectGroup; newRole: 'member' | 'leader' }]
  'role-change-pending': [payload: { userEmail: string; groupId: string; newRole: 'member' | 'leader' }]
  'batch-update-roles': [payload: { members: GroupMember[]; group: ProjectGroup }]
}>()

const isAllSelected = computed(() => {
  if (props.groups.length === 0) return false
  return props.groups.every(group => props.selectedGroups.has(group.groupId))
})

const hasPartialSelection = computed(() => {
  if (props.groups.length === 0) return false
  const selectedCount = props.groups.filter(group => props.selectedGroups.has(group.groupId)).length
  return selectedCount > 0 && selectedCount < props.groups.length
})
</script>

<style scoped>
.project-groups-table {
  margin-top: 16px;
}

.groups-table {
  width: 100%;
  border-collapse: collapse;
  background-color: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.groups-table thead {
  background-color: #f3f4f6;
}

.groups-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  font-size: 14px;
  border-bottom: 2px solid #e5e7eb;
}

.groups-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
  color: #111827;
}

.groups-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
