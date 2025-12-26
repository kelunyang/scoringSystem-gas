<template>
  <div class="add-member-form-inline">
    <div class="form-row">
      <el-select
        :model-value="selectedUsers"
        @update:model-value="$emit('update:selectedUsers', $event)"
        multiple
        filterable
        reserve-keyword
        placeholder="輸入用戶名稱或email進行搜尋..."
        style="flex: 1;"
      >
        <el-option
          v-for="user in availableUsers"
          :key="user.userEmail"
          :label="`${user.displayName} (${user.userEmail})`"
          :value="user.userEmail"
          :disabled="user.disabled"
        >
          <span style="float: left">
            <div style="font-weight: 500;">{{ user.displayName }}</div>
            <div style="font-size: 12px; color: var(--el-text-color-secondary);">{{ user.userEmail }}</div>
          </span>
          <span style="float: right">
            <el-tag v-if="!user.isUngrouped && !user.disabled" size="small" type="success">
              已有分組
            </el-tag>
            <span v-if="user.disabled" style="color: var(--el-text-color-secondary); font-size: 12px;">
              已是成員
            </span>
          </span>
        </el-option>
        <template #empty>
          <div style="text-align: center; padding: 20px; color: #909399;">
            <i class="fas fa-user-slash"></i>
            <p style="margin: 8px 0 0 0; font-size: 14px;">無可用使用者</p>
          </div>
        </template>
      </el-select>

      <el-select
        v-if="groupType === 'project'"
        :model-value="memberRole"
        @update:model-value="$emit('update:memberRole', $event)"
        placeholder="選擇角色"
        style="width: 120px;"
      >
        <el-option label="成員" value="member" />
        <el-option label="組長" value="leader" />
      </el-select>

      <el-badge
        :value="adding ? 0 : selectedUsers.length"
        :hidden="adding || selectedUsers.length === 0"
      >
        <button
          class="btn-primary btn-sm"
          @click="$emit('add')"
          :disabled="adding || selectedUsers.length === 0"
        >
          <i :class="adding ? 'fas fa-spinner fa-spin' : 'fas fa-plus'"></i>
          {{ adding ? '新增中...' : '新增成員' }}
        </button>
      </el-badge>

      <button class="btn-secondary btn-sm" @click="$emit('cancel')">
        <i class="fas fa-times"></i>
        取消
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { User, MemberRole } from '@/types/group-management'

defineOptions({
  name: 'AddMembersForm'
})

withDefaults(
  defineProps<{
    selectedUsers: string[]
    availableUsers: User[]
    memberRole?: MemberRole
    adding: boolean
    groupType: 'project' | 'global'
  }>(),
  {
    memberRole: 'member'
  }
)

defineEmits<{
  'update:selectedUsers': [users: string[]]
  'update:memberRole': [role: MemberRole]
  'add': []
  'cancel': []
}>()
</script>

<style scoped>
.add-member-form-inline {
  margin-bottom: 16px;
  padding: 16px;
  background-color: #f9fafb;
  border-radius: 6px;
  border: 1px dashed #d1d5db;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* Increase el-select option height */
:deep(.el-select-dropdown__item) {
  min-height: 100px !important;
  height: auto !important;
  padding: 16px 20px !important;
  line-height: 1.5 !important;
}

/* Button styles */
.btn-primary,
.btn-secondary {
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-primary {
  background-color: #409eff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #66b1ff;
}

.btn-primary:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #5a6268;
}
</style>
