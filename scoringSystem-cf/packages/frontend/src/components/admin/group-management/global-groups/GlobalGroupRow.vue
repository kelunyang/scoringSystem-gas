<template>
  <template v-if="group && group.groupId">
    <ExpandableTableRow
      :is-expanded="isExpanded"
      :is-selected="isSelected"
      :expansion-colspan="5"
      :enable-responsive-rows="true"
      :actions-colspan="4"
      @toggle-expansion="$emit('toggle-expansion', group)"
    >
      <!-- 橫屏：完整單行 -->
      <template #main="{ isExpanded, isSelected }">
        <td style="text-align: center;" @click.stop>
          <el-checkbox
            :model-value="isSelected"
            @change="$emit('toggle-selection', group.groupId)"
          />
        </td>
        <td>
          <el-tooltip :content="group.groupName" placement="top" :show-after="300">
            <div class="group-name">
              <i
                class="expand-icon fas"
                :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
              ></i>
              <span>{{ group.groupName }}</span>
            </div>
          </el-tooltip>
        </td>
        <td class="permissions">
          <div class="permission-badges">
            <el-tag
              v-for="perm in permissionsWithText"
              :key="perm.key"
              size="small"
              type="primary"
              class="permission-tag"
            >
              {{ perm.text }}
            </el-tag>
            <span v-if="permissionsWithText.length === 0" class="no-permissions">
              無特殊權限
            </span>
          </div>
        </td>
        <td style="text-align: center;" @click.stop>
          <el-switch
            :model-value="group.isActive"
            :loading="togglingStatus"
            :disabled="togglingStatus"
            inline-prompt
            active-text="啟用"
            inactive-text="停用"
            @change="handleToggleStatus"
          />
        </td>
        <td style="text-align: center;">
          <el-tag type="info" size="small">{{ group.memberCount || 0 }}</el-tag>
        </td>
        <td class="actions" @click.stop>
          <el-button type="primary" size="small" @click="$emit('edit', group)">
            <i class="fas fa-edit"></i>
            編輯
          </el-button>
          <el-popconfirm
            v-if="group.isActive"
            :title="`確定要停用全域群組「${group.groupName}」嗎？`"
            confirm-button-text="確定"
            cancel-button-text="取消"
            @confirm="$emit('deactivate', group)"
          >
            <template #reference>
              <el-button type="danger" size="small">
                <i class="fas fa-times"></i>
                停用
              </el-button>
            </template>
          </el-popconfirm>
          <el-button
            v-else
            type="success"
            size="small"
            @click="$emit('activate', group)"
          >
            <i class="fas fa-check"></i>
            啟用
          </el-button>
        </td>
      </template>

      <!-- 豎屏第一行：資訊 -->
      <template #info="{ isExpanded, isSelected }">
        <td style="text-align: center;" @click.stop>
          <el-checkbox
            :model-value="isSelected"
            @change="$emit('toggle-selection', group.groupId)"
          />
        </td>
        <td>
          <el-tooltip :content="group.groupName" placement="top" :show-after="300">
            <div class="group-name">
              <i
                class="expand-icon fas"
                :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
              ></i>
              <span>{{ group.groupName }}</span>
            </div>
          </el-tooltip>
        </td>
        <td class="permissions">
          <div class="permission-badges">
            <el-tag
              v-for="perm in permissionsWithText.slice(0, 2)"
              :key="perm.key"
              size="small"
              type="primary"
              class="permission-tag"
            >
              {{ perm.text }}
            </el-tag>
            <el-tag v-if="permissionsWithText.length > 2" size="small" type="info">
              +{{ permissionsWithText.length - 2 }}
            </el-tag>
            <span v-if="permissionsWithText.length === 0" class="no-permissions">
              無
            </span>
          </div>
        </td>
        <td style="text-align: center;">
          <el-tag type="info" size="small">{{ group.memberCount || 0 }}</el-tag>
        </td>
      </template>

      <!-- 豎屏第二行：操作 -->
      <template #actions>
        <el-switch
          :model-value="group.isActive"
          :loading="togglingStatus"
          :disabled="togglingStatus"
          inline-prompt
          active-text="啟用"
          inactive-text="停用"
          @change="handleToggleStatus"
          @click.stop
        />
        <el-button type="primary" size="small" @click.stop="$emit('edit', group)">
          <i class="fas fa-edit"></i>
          編輯
        </el-button>
        <el-popconfirm
          v-if="group.isActive"
          :title="`確定要停用「${group.groupName}」嗎？`"
          confirm-button-text="確定"
          cancel-button-text="取消"
          @confirm="$emit('deactivate', group)"
        >
          <template #reference>
            <el-button type="danger" size="small" @click.stop>
              <i class="fas fa-times"></i>
              停用
            </el-button>
          </template>
        </el-popconfirm>
        <el-button
          v-else
          type="success"
          size="small"
          @click.stop="$emit('activate', group)"
        >
          <i class="fas fa-check"></i>
          啟用
        </el-button>
      </template>

      <!-- 展开内容：群组成员 -->
      <div
        v-loading="loadingMembers"
        element-loading-text="載入成員中..."
      >
        <!-- 標題區：響應式佈局 -->
        <div class="members-toolbar" :class="{ 'portrait-mode': isPortrait }">
          <h4><i class="fas fa-users"></i> 群組成員</h4>
          <div v-if="!isPortrait" class="members-actions">
            <el-badge
              v-if="members && members.length > 0"
              :value="selectedMembers.length"
              :hidden="selectedMembers.length === 0"
              :max="99"
              type="primary"
            >
              <el-button
                size="small"
                @click="handleSelectAll"
              >
                <el-checkbox
                  :model-value="isAllSelected"
                  :indeterminate="isSomeSelected"
                  @click.stop
                  class="inline-checkbox"
                />
                全選
              </el-button>
            </el-badge>
            <el-badge
              v-if="selectedMembers.length > 0"
              :value="selectedMembers.length"
              :max="99"
              type="danger"
            >
              <el-button
                type="danger"
                size="small"
                @click="handleBatchRemove"
              >
                <i class="fas fa-user-minus"></i>
                批次移除
              </el-button>
            </el-badge>
            <el-button
              v-if="!showAddForm"
              type="primary"
              size="small"
              @click="$emit('open-add-member', group)"
            >
              <i class="fas fa-user-plus"></i>
              新增成員
            </el-button>
          </div>
        </div>
        <!-- 直屏：按鈕獨立一行 -->
        <div v-if="isPortrait" class="members-actions-mobile">
          <el-badge
            v-if="members && members.length > 0"
            :value="selectedMembers.length"
            :hidden="selectedMembers.length === 0"
            :max="99"
            type="primary"
          >
            <el-button
              size="small"
              @click="handleSelectAll"
            >
              <el-checkbox
                :model-value="isAllSelected"
                :indeterminate="isSomeSelected"
                @click.stop
                class="inline-checkbox"
              />
              全選
            </el-button>
          </el-badge>
          <el-badge
            v-if="selectedMembers.length > 0"
            :value="selectedMembers.length"
            :max="99"
            type="danger"
          >
            <el-button
              type="danger"
              size="small"
              @click="handleBatchRemove"
            >
              <i class="fas fa-user-minus"></i>
              批次移除
            </el-button>
          </el-badge>
          <el-button
            v-if="!showAddForm"
            type="primary"
            size="small"
            @click="$emit('open-add-member', group)"
          >
            <i class="fas fa-user-plus"></i>
            新增成員
          </el-button>
        </div>

        <!-- Add Member Form (inline) - Slot for parent to inject -->
        <slot name="add-member-form" :group="group"></slot>

        <!-- Members List -->
        <div v-if="members && members.length > 0" class="members-list-container">
          <!-- Member Items -->
          <div
            v-for="member in members"
            :key="member.membershipId || member.userEmail"
            class="member-item"
            :class="{ 'member-selected': isSelectedMember(member.userEmail), 'portrait-mode': isPortrait }"
          >
            <!-- Member Checkbox -->
            <div class="member-checkbox" @click.stop>
              <el-checkbox
                :model-value="isSelectedMember(member.userEmail)"
                @change="handleToggleMember(member.userEmail)"
              />
            </div>

            <!-- Member Info -->
            <div class="member-info">
              <div class="member-name">
                <el-tag type="success" size="small">
                  成員
                </el-tag>
                {{ member.displayName || '-' }}
              </div>
              <div class="member-details">
                <span class="member-email">{{ member.userEmail }}</span>
                <span class="member-join-time">加入時間: {{ formatTime(member.joinTime || member.joinedAt) }}</span>
              </div>
            </div>

            <!-- 橫屏：按鈕在右側 -->
            <div v-if="!isPortrait" class="member-actions" @click.stop>
              <el-button
                type="danger"
                size="small"
                :loading="removingMemberEmail === member.userEmail"
                @click="handleSingleRemove(member)"
              >
                <i class="fas fa-times"></i>
                移除
              </el-button>
            </div>
            <!-- 直屏：按鈕在下方獨立一行 -->
            <div v-if="isPortrait" class="member-actions-mobile" @click.stop>
              <el-button
                type="danger"
                size="small"
                :loading="removingMemberEmail === member.userEmail"
                @click="handleSingleRemove(member)"
              >
                <i class="fas fa-times"></i>
                移除
              </el-button>
            </div>
          </div>
        </div>
        <div v-else class="no-members-inline">
          <EmptyState
            parent-icon="fa-users-rectangle"
            title="此群組目前沒有成員"
            :compact="true"
            :enable-animation="false"
          />
        </div>
      </div>
    </ExpandableTableRow>
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatTime } from '@/utils/helpers'
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import type { GlobalGroup, GroupMember } from '@/types/group-management'
import { PERMISSION_TEXT_MAP } from '@/types/group-management'

// Responsive design
const { isPortrait } = useMediaQuery()

defineOptions({
  name: 'GlobalGroupRow'
})

const props = defineProps<{
  group: GlobalGroup
  isExpanded: boolean
  isSelected: boolean
  permissions: string[]
  members?: GroupMember[]
  loadingMembers: boolean
  removingMemberEmail: string
  showAddForm: boolean
}>()

const emit = defineEmits<{
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

// Loading state for status toggle
const togglingStatus = ref(false)

// Member selection state
const selectedMembers = ref<string[]>([])

// Check if all members are selected
const isAllSelected = computed(() => {
  return props.members && props.members.length > 0 && selectedMembers.value.length === props.members.length
})

// Check if some (but not all) members are selected
const isSomeSelected = computed(() => {
  return selectedMembers.value.length > 0 && !isAllSelected.value
})

// Check if a specific member is selected
const isSelectedMember = (userEmail: string) => {
  return selectedMembers.value.includes(userEmail)
}

// Toggle member selection
const handleToggleMember = (userEmail: string) => {
  const index = selectedMembers.value.indexOf(userEmail)
  if (index > -1) {
    selectedMembers.value.splice(index, 1)
  } else {
    selectedMembers.value.push(userEmail)
  }
}

// Select/deselect all members
const handleSelectAll = () => {
  if (isAllSelected.value) {
    selectedMembers.value = []
  } else if (props.members) {
    selectedMembers.value = props.members.map(m => m.userEmail)
  }
}

// Handle single member removal
const handleSingleRemove = (member: GroupMember) => {
  console.log('[GlobalGroupRow] handleSingleRemove called', { member, group: props.group })
  emit('batch-remove-members', {
    members: [member],
    group: props.group
  })
  console.log('[GlobalGroupRow] batch-remove-members event emitted')
}

// Handle batch removal
const handleBatchRemove = () => {
  if (selectedMembers.value.length === 0) return

  const membersToRemove = props.members?.filter(m =>
    selectedMembers.value.includes(m.userEmail)
  ) || []

  emit('batch-remove-members', {
    members: membersToRemove,
    group: props.group
  })
}

// Clear selection when group collapses or members change
watch(() => props.isExpanded, (newVal) => {
  if (!newVal) {
    selectedMembers.value = []
  }
})

watch(() => props.members, () => {
  // Remove selected members that are no longer in the list
  if (props.members) {
    const validEmails = new Set(props.members.map(m => m.userEmail))
    selectedMembers.value = selectedMembers.value.filter(email => validEmails.has(email))
  } else {
    selectedMembers.value = []
  }
}, { deep: true })

// Handle status toggle
const handleToggleStatus = () => {
  emit('toggle-status', props.group)
}

// Precompute permission text to avoid repeated function calls in template
const permissionsWithText = computed(() =>
  props.permissions.map(permission => ({
    key: permission,
    text: PERMISSION_TEXT_MAP[permission as keyof typeof PERMISSION_TEXT_MAP] || permission
  }))
)
</script>

<style scoped>
/* 主行和展开图标样式由 ExpandableTableRow 统一提供 */

.group-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.permissions {
  max-width: 300px;
}

.permission-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.permission-tag {
  font-size: 11px;
}

.no-permissions {
  font-size: 12px;
  color: #909399;
  font-style: italic;
}

.actions {
  white-space: nowrap;
}

/* Members toolbar */
.members-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.members-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inline-checkbox {
  margin-right: 8px;
  pointer-events: none;
}

/* Members list styles - container styles now provided by ExpandableTableRow */
.members-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #f9fafb;
  border-radius: 6px;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.member-item:hover {
  background-color: #f3f4f6;
}

.member-item.member-selected {
  background-color: #e0f2fe;
  border-color: #0ea5e9;
}

.member-checkbox {
  display: flex;
  align-items: center;
  padding-right: 12px;
}

.member-info {
  flex: 1;
}

.member-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 4px;
}

.member-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #6b7280;
}

.member-email {
  color: #6b7280;
}

.member-join-time {
  color: #9ca3af;
}

.member-actions {
  display: flex;
  gap: 8px;
}

.no-members-inline {
  padding: 20px 0;
}

/* 響應式佈局：直屏模式 */
.members-toolbar.portrait-mode {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.members-actions-mobile {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.member-item.portrait-mode {
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.member-item.portrait-mode .member-checkbox {
  position: absolute;
  top: 12px;
  left: 12px;
  padding-right: 0;
}

.member-item.portrait-mode .member-info {
  padding-left: 32px;
}

.member-actions-mobile {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px dashed #ddd;
  width: 100%;
}
</style>
