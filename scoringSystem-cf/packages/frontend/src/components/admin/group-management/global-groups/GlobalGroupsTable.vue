<template>
  <div class="global-groups-table">
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
          <th style="width: 250px;">群組名稱</th>
          <th style="width: 300px;">全域權限</th>
          <th style="width: 100px;">狀態</th>
          <th style="width: 100px; text-align: center;">組員</th>
          <th style="width: 200px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <GlobalGroupRow
          v-for="group in groups"
          :key="group.groupId"
          :group="group"
          :is-expanded="expandedGroupId === group.groupId"
          :is-selected="selectedGroups.has(group.groupId)"
          :permissions="getPermissionList(group)"
          :members="membersMap.get(group.groupId)"
          :loading-members="loadingMembers.has(group.groupId)"
          :removing-member-email="removingMemberEmail"
          :show-add-form="addingMemberForGroup === group.groupId"
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
            <slot name="add-member-form" :group="group"></slot>
          </template>
        </GlobalGroupRow>
      </tbody>
    </table>

    <EmptyState
      v-else-if="!loading"
      :icons="['fa-layer-group']"
      parent-icon="fa-users-rectangle"
      title="沒有找到符合條件的全域群組"
      :enable-animation="false"
    />

    <div v-if="loading" v-loading="true" style="min-height: 200px;"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GlobalGroupRow from './GlobalGroupRow.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import type { GlobalGroup, GroupMember } from '@/types/group-management'

defineOptions({
  name: 'GlobalGroupsTable'
})

const props = defineProps<{
  groups: GlobalGroup[]
  loading: boolean
  selectedGroups: Set<string>
  expandedGroupId: string | null
  membersMap: Map<string, GroupMember[]>
  loadingMembers: Set<string>
  removingMemberEmail: string
  addingMemberForGroup: string | null
}>()

const emit = defineEmits<{
  'toggle-all': []
  'toggle-expansion': [group: GlobalGroup]
  'toggle-selection': [groupId: string]
  'toggle-status': [group: GlobalGroup]
  'edit': [group: GlobalGroup]
  'deactivate': [group: GlobalGroup]
  'activate': [group: GlobalGroup]
  'open-add-member': [group: GlobalGroup]
  'remove-member': [payload: { member: GroupMember; group: GlobalGroup }]
  'batch-remove-members': [payload: { members: GroupMember[]; group: GlobalGroup }]
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

// Track groups with permission parse errors to avoid repeated warnings
const permissionParseErrors = ref<Set<string>>(new Set())

const getPermissionList = (group: GlobalGroup): string[] => {
  if (!group.globalPermissions) return []

  try {
    const parsed = JSON.parse(group.globalPermissions)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    const errorKey = group.groupId

    // Only show warning once per group to avoid spam
    if (!permissionParseErrors.value.has(errorKey)) {
      permissionParseErrors.value.add(errorKey)
      ElMessage.warning({
        message: `群組「${group.groupName}」的權限數據格式錯誤`,
        duration: 3000
      })
      console.error(`Failed to parse permissions for group ${group.groupId}:`, e)
    }

    return []
  }
}
</script>

<style scoped>
.global-groups-table {
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
