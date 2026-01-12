<template>
  <div class="dashboard">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="search-container">
        <el-input
          v-model="searchQuery"
          placeholder="搜尋專案名稱或描述"
          clearable
          class="search-input"
        >
          <template #prefix>
            <i class="fas fa-magnifying-glass"></i>
          </template>
        </el-input>
        <el-button
          plain
          @click="refreshProjects(); resetTimer()"
          class="refresh-button-with-progress"
          :style="{
            background: `linear-gradient(to right, #EEE 0%, #EEE ${progressPercentage}%, #ffffff ${progressPercentage}%, #ffffff 100%)`,
            color: '#000'
          }"
        >
          <i class="fas fa-refresh"></i> 重新整理
        </el-button>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="$emit('user-command', $event)"
      />
    </div>

    <!-- Content -->
    <div class="content-area" v-loading="loading" element-loading-text="載入專案資料中...">
      <div class="projects-grid">
        <ProjectCard
          v-for="project in projectsWithPermissions"
          :key="project.projectId"
          :project="project"
          :user="user"
          @enter-project="enterProject"
          @manage-group-members="openGroupMemberManagement"
          @view-event-logs="openEventLogViewer"
        />
      </div>

      <!-- 無專案時的提示 -->
      <EmptyState
        v-if="!loading && projectsWithPermissions.length === 0"
        :icons="['fa-project-diagram', 'fa-folder-open']"
        parent-icon="fa-folder-tree"
        title="尚無專案"
        description="目前沒有找到任何專案，請聯繫管理員分配專案。"
      />
    </div>


    <!-- 組長成員管理 Drawer -->
    <el-drawer
      v-model="memberManagementVisible"
      :title="`管理專案分組 - ${selectedGroupForManagement?.groupName}`"
      size="100%"
      direction="btt"
      :close-on-click-modal="false"
      class="member-management-drawer drawer-navy"
    >
      <div class="drawer-body">
        <!-- 群組資訊編輯區塊 -->
        <div class="form-section">
          <h4><i class="fas fa-info-circle"></i> 群組資訊</h4>
          <div class="form-group">
            <label>群組名稱 *</label>
            <el-input
              v-model="groupEditForm.groupName"
              placeholder="請輸入群組名稱"
              maxlength="50"
              show-word-limit
              clearable
            />
          </div>
          <div class="form-group">
            <label>群組描述</label>
            <el-input
              v-model="groupEditForm.description"
              type="textarea"
              :rows="3"
              placeholder="請輸入群組描述（可選）"
              maxlength="200"
              show-word-limit
              clearable
            />
          </div>
        </div>

        <!-- 目前成員列表 -->
        <div class="form-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h4 style="margin: 0;"><i class="fas fa-users"></i> 目前成員</h4>
            <div style="position: relative; display: inline-block;">
              <el-badge
                v-if="selectedGroupForManagement?.allowChange !== false && selectedMembersToRemove.length > 0"
                :value="selectedMembersToRemove.length"
                :offset="[5, 5]"
              >
                <el-button
                  type="danger"
                  size="small"
                  @click="handleBatchRemoveClick"
                >
                  <i class="fas fa-user-times"></i> 批次移除
                </el-button>
              </el-badge>
            </div>
          </div>

          <div class="members-list">
            <div
              v-for="member in currentGroupMembers"
              :key="member.userEmail"
              v-memo="[member.userEmail, member.role, selectedGroupForManagement?.allowChange, selectedMembersToRemove.includes(member.userEmail)]"
              class="member-item"
            >
              <!-- Checkbox for batch selection -->
              <el-checkbox
                v-if="member.role !== 'leader' && member.userEmail !== user?.userEmail && selectedGroupForManagement?.allowChange !== false"
                :model-value="selectedMembersToRemove.includes(member.userEmail)"
                @update:model-value="(val: string | number | boolean) => {
                  if (val) {
                    if (!selectedMembersToRemove.includes(member.userEmail)) {
                      selectedMembersToRemove.push(member.userEmail)
                    }
                  } else {
                    const idx = selectedMembersToRemove.indexOf(member.userEmail)
                    if (idx > -1) selectedMembersToRemove.splice(idx, 1)
                  }
                }"
                class="member-checkbox"
              />

              <div class="member-info">
                <el-avatar
                  :src="getAvatarUrl(member)"
                  :size="40"
                  class="member-avatar"
                  @error="(e: Event) => {
                    const target = e.target as HTMLImageElement
                    if (target) target.src = generateInitialsAvatar(member)
                  }"
                >
                  {{ member.displayName?.charAt(0) || member.userEmail.charAt(0) }}
                </el-avatar>
                <span class="member-email">{{ member.userEmail }}</span>
                <span class="member-role" :class="member.role">
                  <i :class="member.role === 'leader' ? 'fas fa-crown' : 'fas fa-users'"></i>
                  {{ member.role === 'leader' ? '組長' : '成員' }}
                </span>
              </div>
              <div class="member-actions">
                <el-button
                  v-if="member.role !== 'leader' && member.userEmail !== user?.userEmail && selectedGroupForManagement?.allowChange !== false"
                  type="danger"
                  size="small"
                  @click="removeGroupMember(member)"
                >
                  <i class="fas fa-user-times"></i> 移除
                </el-button>
              </div>
            </div>
            <EmptyState
              v-if="currentGroupMembers.length === 0"
              :icons="['fa-user-slash']"
              parent-icon="fa-users"
              title="目前沒有成員"
              :compact="true"
              :enable-animation="false"
            />
          </div>
        </div>

        <!-- 新增成員區域 -->
        <div v-if="selectedGroupForManagement?.allowChange !== false" class="form-section" v-loading="loadingAvailableUsers" element-loading-text="載入可用成員中...">
          <h4><i class="fas fa-user-plus"></i> 新增成員</h4>

          <template v-if="!loadingAvailableUsers">
            <!-- 成員選擇器 -->
            <div class="form-group">
              <label>選擇要加入的成員</label>
              <el-select
                v-model="selectedMembersToAdd"
                multiple
                filterable
                placeholder="搜尋並選擇專案成員"
                style="width: 100%"
                @change="onMemberSelectionChange"
              >
                <el-option
                  v-for="user in availableUsersForGroup"
                  :key="user.userId"
                  v-memo="[user.userId, user.displayName, user.tags, user.isUngrouped]"
                  :label="`${user.displayName || user.userEmail} (${user.userEmail})`"
                  :value="user.userEmail"
                >
                  <span style="float: left">
                    <div style="font-weight: 500;">{{ user.displayName || user.userEmail }}</div>
                    <div style="font-size: 12px; color: var(--el-text-color-secondary);">{{ user.userEmail }}</div>
                  </span>
                  <span style="float: right">
                    <el-tag v-if="!user.isUngrouped" size="small" type="success">
                      已有分組
                    </el-tag>
                    <span
                      v-for="tag in user.tags"
                      :key="tag.tagId"
                      style="padding: 2px 6px; border-radius: 10px; color: white; font-size: 10px; font-weight: 500; margin-left: 4px;"
                      :style="{ backgroundColor: tag.tagColor }"
                    >
                      {{ tag.tagName }}
                    </span>
                  </span>
                </el-option>
              </el-select>
            </div>

            <!-- 選中的成員預覽 -->
            <div v-if="selectedMembersToAdd.length > 0" class="selected-members-preview">
              <label>待加入成員：</label>
              <div class="selected-members-tags">
                <el-tag
                  v-for="email in selectedMembersToAdd"
                  :key="email"
                  v-memo="[email]"
                  closable
                  @close="removeMemberFromSelection(email)"
                  class="member-tag"
                >
                  <i class="fas fa-user"></i>
                  {{ getUserDisplayInfo(email) }}
                </el-tag>
              </div>
            </div>

            <!-- 提示訊息 -->
            <EmptyState
              v-if="availableUsersForGroup.length === 0"
              :icons="['fa-user-check']"
              parent-icon="fa-user-group"
              title="沒有可新增的成員"
              description="所有專案成員都已加入群組"
              :compact="true"
              :enable-animation="false"
            />
          </template>
        </div>

        <!-- 底部操作按鈕（分離群組資訊與成員操作） -->
        <div class="drawer-actions">
          <!-- 群組資訊 - 永遠可見 -->
          <el-button
            type="primary"
            @click="handleSaveGroupInfo"
            :disabled="!hasGroupInfoChanges || savingGroupInfo"
            :loading="savingGroupInfo"
          >
            <i class="fas fa-save"></i>
            {{ savingGroupInfo ? '儲存中...' : '儲存群組資訊' }}
          </el-button>

          <!-- 新增成員 - 只有 allowChange 時可見 -->
          <el-button
            v-if="selectedGroupForManagement?.allowChange !== false"
            type="success"
            @click="handleAddMembers"
            :disabled="selectedMembersToAdd.length === 0 || addingMembers"
            :loading="addingMembers"
          >
            <i class="fas fa-user-plus"></i>
            {{ addingMembers ? '新增中...' : '新增成員' }}
          </el-button>

          <el-button @click="memberManagementVisible = false">
            <i class="fas fa-times"></i> 關閉
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Event Log Viewer Drawer -->
    <EventLogDrawer
      v-model="showEventLogDrawer"
      :project="selectedProjectForLogs"
      :user-mode="true"
    />

    <!-- Remove Member Confirm Drawer (Single or Batch) -->
    <RemoveMemberConfirmDrawer
      v-model:visible="showRemoveMemberDrawer"
      :members="getBatchRemoveMembers()"
      :group-name="selectedGroupForManagement?.groupName || ''"
      :loading="removingMember"
      @confirm="handleRemoveMemberConfirm"
      @cancel="handleRemoveMemberCancel"
    />

    <!-- Add Member Confirm Drawer -->
    <AddMemberConfirmDrawer
      v-model:visible="showAddMemberDrawer"
      :members="membersToAddForConfirmation"
      :group-name="selectedGroupForManagement?.groupName || ''"
      :loading="addingMembersConfirm"
      @confirm="handleAddMemberConfirm"
      @cancel="handleAddMemberCancel"
    />

    <!-- Tutorial Drawer -->
    <TutorialDrawer page="dashboard" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, shallowRef, watchEffect, unref, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import ProjectCard from './ProjectCard.vue'
import TopBarUserControls from './TopBarUserControls.vue'
import EventLogDrawer from './shared/EventLogDrawer.vue'
import TutorialDrawer from './TutorialDrawer.vue'
import RemoveMemberConfirmDrawer from '@/components/shared/RemoveMemberConfirmDrawer.vue'
import AddMemberConfirmDrawer from '@/components/admin/group-management/shared/AddMemberConfirmDrawer.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useProjectsWithStages } from '@/composables/useProjects'
import {
  useGroupMembers,
  useProjectGroups,
  useAvailableGroupUsers,
  useAddGroupMember,
  useBatchAddGroupMembers,
  useRemoveGroupMember,
  useUpdateGroup
} from '@/composables/useGroupManagement'
import { calculateProjectPermissions } from '@/composables/useDetailedProjectPermissions'
import { showSuccess, showWarning, handleError } from '@/utils/errorHandler'
import { useBreadcrumb } from '@/composables/useBreadcrumb'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { getAvatarUrl, generateInitialsAvatar } from '@/utils/avatar'
import type { AuthUser, Project, Group, User, Member } from '@/types'
import type { GroupMember } from '@/composables/useGroupManagement'
import type { PermissionFlags } from '@/composables/useProjectPermissions'

// ========================================
// Props & Emits
// ========================================

interface Props {
  user: AuthUser | null
  sessionPercentage?: number
  remainingTime?: number
}

const props = withDefaults(defineProps<Props>(), {
  user: null,
  sessionPercentage: 100,
  remainingTime: 0
})

interface Emits {
  (e: 'enter-project', project: Project): void
  (e: 'user-command', command: string): void
}

const emit = defineEmits<Emits>()

// ========================================
// TanStack Query - Projects & Groups
// ========================================

// 1. Projects query (depends on auth from App.vue)
const projectsQuery = useProjectsWithStages()

// 2. Group management queries (enabled when drawer is opened)
const selectedProjectId: Ref<string | null> = ref(null)
const selectedGroupId: Ref<string | null> = ref(null)

const groupMembersQuery = useGroupMembers(selectedProjectId, selectedGroupId)
const projectGroupsQuery = useProjectGroups(selectedProjectId)
const availableUsersQuery = useAvailableGroupUsers(selectedProjectId)

// 3. Mutations
const addMemberMutation = useAddGroupMember()
const batchAddMembersMutation = useBatchAddGroupMembers()
const removeMemberMutation = useRemoveGroupMember()
const updateGroupMutation = useUpdateGroup()

// ========================================
// Reactive State
// ========================================

const searchQuery: Ref<string> = ref('')

// 成員管理相關
const memberManagementVisible: Ref<boolean> = ref(false)
const selectedProject: Ref<Project | null> = ref(null)
const selectedGroupForManagement: Ref<Group | null> = ref(null)
const selectedMembersToAdd: Ref<string[]> = ref([]) // 選中要加入的成員
const addingMembers: Ref<boolean> = ref(false) // 批量加入狀態
const savingChanges: Ref<boolean> = ref(false) // 統一保存狀態（保留以維持向後相容）
const savingGroupInfo: Ref<boolean> = ref(false) // 群組資訊儲存狀態

// 未分組成員追蹤
const ungroupedMembers: Ref<string[]> = ref([])
const loadingUngroupedMembers: Ref<boolean> = ref(false)

// 群組資訊編輯表單
interface GroupEditForm {
  groupName: string
  description: string
}

const groupEditForm = reactive<GroupEditForm>({
  groupName: '',
  description: ''
})

// 事件日志相關
const showEventLogDrawer: Ref<boolean> = ref(false)
const selectedProjectForLogs: Ref<Project | null> = ref(null)

// 移除成員相關
const showRemoveMemberDrawer: Ref<boolean> = ref(false)
const selectedMemberToRemove: Ref<GroupMember | null> = ref(null)
const selectedMembersToRemove: Ref<string[]> = ref([]) // 批次移除選中的成員
const removingMember: Ref<boolean> = ref(false)

// 新增成員確認相關
const showAddMemberDrawer: Ref<boolean> = ref(false)
const membersToAddForConfirmation: Ref<Member[]> = ref([])
const addingMembersConfirm: Ref<boolean> = ref(false)

// Vue Router
const route = useRoute()
const router = useRouter()

// ========================================
// Computed Properties
// ========================================

// Get projects from TanStack Query
const projects = computed(() => {
  // TanStack Query returns a Ref in Composition API
  const data = projectsQuery.data?.value || projectsQuery.data
  const projects = Array.isArray(data) ? data : []
  console.log('🔍 Dashboard projects computed:', {
    rawData: data,
    projectsArray: projects,
    count: projects.length,
    firstProject: projects[0]
  })
  return projects
})

// Loading state from query
const loading = computed(() => {
  const isLoading = projectsQuery.isLoading?.value ?? projectsQuery.isLoading
  return isLoading || false
})

// Filter projects by search query (using unref for safe unwrapping)
const filteredProjects = computed(() => {
  // Use unref to ensure correct unwrapping of potentially nested Refs
  const allProjects = unref(projects) || []
  const validProjects = allProjects.filter(p => p?.projectId)

  console.log('🔍 Dashboard filteredProjects:', {
    allProjects: allProjects.length,
    validProjects: validProjects.length,
    searchQuery: searchQuery.value,
    sampleProject: validProjects[0]
  })

  const query = searchQuery.value
  if (!query) return validProjects

  // Pre-compute lowercase query for better performance
  const lowerQuery = query.toLowerCase()
  return validProjects.filter(project => {
    const name = project.projectName?.toLowerCase() ?? ''
    const desc = project.description?.toLowerCase() ?? ''
    return name.includes(lowerQuery) || desc.includes(lowerQuery)
  })
})

// Type for project with calculated permissions
interface ProjectWithPermissions extends Project {
  permissions: PermissionFlags
}

// Permission calculation cache for memoization (using shallowRef for Map)
// Cache stores the complete project object with permissions to ensure stable references
const permissionCache = shallowRef(new Map<string, ProjectWithPermissions>())
const currentUserId = shallowRef<string | null | undefined>(null)

// Auto-clear cache when user changes (watchEffect)
watchEffect(() => {
  const userId = props.user?.userId

  if (userId !== currentUserId.value) {
    // Create new Map to trigger reactivity
    permissionCache.value = new Map()
    currentUserId.value = userId ?? null
  }
})

// Add permissions to filtered projects with memoization
const projectsWithPermissions = computed(() => {
  const globalPermissions = props.user?.permissions || []
  const userId = props.user?.userId
  const cache = permissionCache.value

  // Batch cache updates to avoid creating multiple Map instances
  let cacheUpdated = false
  const newCache = new Map(cache)

  const result = filteredProjects.value.map(project => {
    const cacheKey = `${userId}_${project.projectId}`

    // Return cached project object (with stable reference)
    let cachedProject = cache.get(cacheKey)

    if (!cachedProject) {
      // Calculate permissions and create extended project object
      const permissions = calculateProjectPermissions(project, globalPermissions) as PermissionFlags
      cachedProject = { ...project, permissions } as ProjectWithPermissions

      // Add to new cache
      newCache.set(cacheKey, cachedProject)
      cacheUpdated = true
    }

    return cachedProject  // Return stable object reference
  })

  // Only update cache Map once if there were changes
  if (cacheUpdated) {
    permissionCache.value = newCache
  }

  return result
})

// Group management computed properties (from TanStack Query)
const currentGroupMembers = computed(() => {
  const data = groupMembersQuery.data?.value || groupMembersQuery.data
  return (data && 'members' in data) ? data.members || [] : []
})

const otherProjectGroupMembers = computed(() => {
  const allGroups = projectGroupsQuery.data?.value || projectGroupsQuery.data
  const currentGroupId = selectedGroupId.value

  // Ensure allGroups is an array
  if (!Array.isArray(allGroups)) {
    return []
  }

  // Filter out current group and collect all members from other groups
  const otherMembers: Array<Member & { groupName: string; groupId: string }> = []
  allGroups.forEach(group => {
    if (group.groupId !== currentGroupId && group.members) {
      group.members.forEach((member: Member) => {
        otherMembers.push({
          ...member,
          groupName: group.groupName,
          groupId: group.groupId
        })
      })
    }
  })
  return otherMembers
})

const loadingAvailableUsers = computed(() => {
  return availableUsersQuery.isLoading?.value ?? availableUsersQuery.isLoading ?? false
})

// Filter available users (exclude current members and members from other groups)
const availableUsersForGroup = computed(() => {
  const currentMembers = currentGroupMembers.value
  const allGroups = projectGroupsQuery.data?.value || projectGroupsQuery.data
  const allUsers = availableUsersQuery.data?.value || availableUsersQuery.data

  // Ensure arrays are valid
  if (!Array.isArray(allGroups) || !Array.isArray(allUsers)) {
    return []
  }

  // Collect all occupied emails
  const occupiedEmails = new Set()

  // Add current group members
  currentMembers.forEach((m: Member | GroupMember) => occupiedEmails.add(m.userEmail))

  // Add members from other groups
  allGroups.forEach(group => {
    if (group.groupId !== selectedGroupId.value && group.members) {
      group.members.forEach((m: Member | GroupMember) => occupiedEmails.add(m.userEmail))
    }
  })

  // Create set of ungrouped member emails for quick lookup
  const ungroupedSet = new Set(ungroupedMembers.value)

  // Filter out occupied users and add isUngrouped flag
  return allUsers
    .filter(u => !occupiedEmails.has(u.userEmail))
    .map(u => ({
      ...u,
      isUngrouped: ungroupedSet.has(u.userEmail)
    }))
})

// Check if group info has changed (for "儲存群組資訊" button)
const hasGroupInfoChanges = computed(() => {
  if (!selectedGroupForManagement.value) return false
  return (
    groupEditForm.groupName.trim() !== (selectedGroupForManagement.value.groupName || '') ||
    groupEditForm.description.trim() !== (selectedGroupForManagement.value.description || '')
  )
})

// Check if there are unsaved changes (legacy, kept for compatibility)
const hasChanges = computed(() => {
  if (!selectedGroupForManagement.value) return false
  const hasPendingMembers = selectedMembersToAdd.value.length > 0
  return hasGroupInfoChanges.value || hasPendingMembers
})

// ========================================
// Methods
// ========================================

const enterProject = (project: Project) => {
  console.log('進入專案:', project)
  // 發送事件到父組件 App.vue
  emit('enter-project', project)
}

const getRankDisplay = (rank: any) => {
  const medals = ['🥇', '🥈', '🥉']
  return rank <= 3 ? medals[rank - 1] : `${rank}.`
}

const loadUngroupedMembers = async (projectId: string) => {
  if (!projectId) {
    ungroupedMembers.value = []
    return
  }

  try {
    loadingUngroupedMembers.value = true
    const { rpcClient } = await import('@/utils/rpc-client')
    const httpResponse = await rpcClient.projects.viewers['mark-unassigned'].$post({
      json: {
        projectId: projectId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      ungroupedMembers.value = response.data.ungroupedMemberEmails || []
    }
  } catch (error) {
    console.error('Error loading ungrouped members:', error)
    ungroupedMembers.value = []
  } finally {
    loadingUngroupedMembers.value = false
  }
}

const openGroupMemberManagement = async (project: Project) => {
  console.log('🔧 [DEBUG] Opening group management drawer - v2024.01.09')

  // ⭐ 從 projects.value 取得最新資料，避免使用 ProjectCard 傳入的舊物件參考
  const freshProject = projects.value?.find(p => p.projectId === project.projectId) || project

  // 從 userGroups 找到組長身份
  const leaderUserGroup = freshProject.userGroups?.find((g: Group) => g.role === 'leader')
  if (!leaderUserGroup) {
    showWarning('您不是任何群組的組長')
    return
  }

  // 從 groups 找完整的 group 資料（包含 allowChange）
  const fullGroup = (freshProject as any).groups?.find((g: any) => g.groupId === leaderUserGroup.groupId)

  // 合併資料：userGroups 的基本資訊 + groups 的 allowChange
  const leaderGroup = {
    ...leaderUserGroup,
    allowChange: fullGroup?.allowChange ?? true,
    description: fullGroup?.description ?? ''
  }

  // 不再檢查 allowChange，組長永遠可以打開 drawer
  // 成員操作權限在 drawer 內部控制

  selectedProject.value = freshProject
  selectedGroupForManagement.value = leaderGroup
  selectedMembersToAdd.value = [] // 重置選中的成員
  selectedMembersToRemove.value = [] // 重置選中要移除的成員
  addingMembers.value = false

  // 初始化群組資訊表單
  groupEditForm.groupName = leaderGroup.groupName || ''
  groupEditForm.description = leaderGroup.description || ''

  // 載入未分組成員
  await loadUngroupedMembers(freshProject.projectId)

  memberManagementVisible.value = true

  // Set reactive refs to trigger TanStack Query fetches
  selectedProjectId.value = freshProject.projectId
  selectedGroupId.value = leaderGroup.groupId

  console.log('🔧 [DEBUG] Drawer opened, queries will fetch data')
}

// Handle save changes - open confirmation drawer for members, direct save for group info (legacy)
const handleSaveChanges = async () => {
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  savingChanges.value = true

  try {
    // 1. Save group info if changed
    if (groupEditForm.groupName.trim() !== (selectedGroupForManagement.value.groupName || '') ||
        groupEditForm.description.trim() !== (selectedGroupForManagement.value.description || '')) {
      await updateGroupInfo()
    }

    // 2. Open confirmation drawer for adding members
    if (selectedMembersToAdd.value.length > 0) {
      // Build member objects for confirmation drawer with avatar info
      membersToAddForConfirmation.value = selectedMembersToAdd.value.map(email => {
        const user = availableUsersForGroup.value.find(u => u.userEmail === email) as any
        return {
          userEmail: email,
          displayName: user?.displayName || email,
          role: 'member',
          avatarSeed: user?.avatarSeed,
          avatarStyle: user?.avatarStyle,
          avatarOptions: user?.avatarOptions
        } as Member
      })
      showAddMemberDrawer.value = true
      savingChanges.value = false // Reset flag since we're going to drawer
      return
    }

    showSuccess('所有變更已儲存')
  } catch (error) {
    console.error('保存變更失敗:', error)
    handleError(error as Error, { action: '儲存變更', type: 'error' })
  } finally {
    savingChanges.value = false
  }
}

// Handle save group info only (separated from member operations)
const handleSaveGroupInfo = async () => {
  if (!hasGroupInfoChanges.value) return
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  savingGroupInfo.value = true
  try {
    await updateGroupInfo()
    showSuccess('群組資訊已儲存')

    // 刷新專案列表快取，讓 Dashboard 顯示最新群組資訊
    await projectsQuery.refetch()
  } catch (error) {
    console.error('儲存群組資訊失敗:', error)
    handleError(error as Error, { action: '儲存群組資訊' })
  } finally {
    savingGroupInfo.value = false
  }
}

// Handle add members - open confirmation drawer
const handleAddMembers = () => {
  if (selectedMembersToAdd.value.length === 0) return
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  // Build member objects for confirmation drawer with avatar info
  membersToAddForConfirmation.value = selectedMembersToAdd.value.map(email => {
    const user = availableUsersForGroup.value.find(u => u.userEmail === email) as any
    return {
      userEmail: email,
      displayName: user?.displayName || email,
      role: 'member',
      avatarSeed: user?.avatarSeed,
      avatarStyle: user?.avatarStyle,
      avatarOptions: user?.avatarOptions
    } as Member
  })
  showAddMemberDrawer.value = true
}

// Get members for batch remove drawer (single or batch)
const getBatchRemoveMembers = () => {
  // If batch removal, get all selected members
  if (selectedMembersToRemove.value.length > 0) {
    return currentGroupMembers.value.filter(m => selectedMembersToRemove.value.includes(m.userEmail))
  }
  // If single removal, use selectedMemberToRemove
  return selectedMemberToRemove.value ? [selectedMemberToRemove.value] : []
}

// Handle batch remove button click
const handleBatchRemoveClick = () => {
  if (selectedMembersToRemove.value.length === 0) return

  // Clear single member selection
  selectedMemberToRemove.value = null
  showRemoveMemberDrawer.value = true
}

// Batch add members using optimized batch mutation
const batchAddMembersToGroup = async () => {
  if (selectedMembersToAdd.value.length === 0) return
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  addingMembers.value = true
  try {
    // Use batch mutation instead of sequential API calls
    const result = await batchAddMembersMutation.mutateAsync({
      projectId: selectedProject.value.projectId,
      groupId: selectedGroupForManagement.value.groupId,
      members: selectedMembersToAdd.value.map(email => ({
        userEmail: email,
        role: 'member' as const
      }))
    })

    // Clear selection
    selectedMembersToAdd.value = []

    // Success message is already shown by the mutation's onSuccess handler
    // No need to show it again here
  } catch (error) {
    console.error('Error in batch add members:', error)
    handleError(error as Error, { action: '批量加入成員', type: 'error' })
  } finally {
    addingMembers.value = false
  }
}

// 成員選擇相關方法
const onMemberSelectionChange = () => {
  // el-select 的變更事件，目前不需要特別處理
}

const removeMemberFromSelection = (email: string) => {
  selectedMembersToAdd.value = selectedMembersToAdd.value.filter(e => e !== email)
}

const getUserDisplayInfo = (email: string) => {
  const user = availableUsersForGroup.value.find(u => u.userEmail === email)
  return user ? (user.displayName || email) : email
}

// Add member using TanStack Query mutation
const addMemberToGroup = async (user: User) => {
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  await addMemberMutation.mutateAsync({
    projectId: selectedProject.value.projectId,
    groupId: selectedGroupForManagement.value.groupId,
    userEmail: user.userEmail,
    role: 'member'
  })
  // No manual refetch needed - mutation handles query invalidation
}

// Remove member - open confirmation drawer
const removeGroupMember = (member: Member | GroupMember) => {
  console.log('🔍 [DEBUG] removeGroupMember triggered', {
    member,
    memberRole: member.role,
    memberEmail: member.userEmail,
    currentUser: props.user?.userEmail,
    showRemoveMemberDrawer_before: showRemoveMemberDrawer.value,
    selectedGroupForManagement: selectedGroupForManagement.value,
    selectedProject: selectedProject.value?.projectId
  })

  selectedMemberToRemove.value = member as GroupMember
  showRemoveMemberDrawer.value = true

  console.log('🔍 [DEBUG] State updated', {
    showRemoveMemberDrawer_after: showRemoveMemberDrawer.value,
    selectedMemberToRemove: selectedMemberToRemove.value,
    selectedMemberToRemoveEmail: selectedMemberToRemove.value?.userEmail
  })
}

// Handle member removal confirmation (single or batch)
const handleRemoveMemberConfirm = async () => {
  console.log('🔍 [DEBUG] handleRemoveMemberConfirm called', {
    selectedMemberToRemove: selectedMemberToRemove.value,
    selectedMembersToRemove: selectedMembersToRemove.value,
    selectedProject: selectedProject.value?.projectId,
    selectedGroupForManagement: selectedGroupForManagement.value?.groupId
  })

  if (!selectedProject.value || !selectedGroupForManagement.value) {
    console.warn('⚠️ [DEBUG] Missing required data for member removal', {
      hasSelectedProject: !!selectedProject.value,
      hasSelectedGroup: !!selectedGroupForManagement.value
    })
    return
  }

  // Determine if batch or single removal
  const isBatchRemoval = selectedMembersToRemove.value.length > 0

  if (!isBatchRemoval && !selectedMemberToRemove.value) {
    console.warn('⚠️ [DEBUG] No members selected for removal')
    return
  }

  removingMember.value = true
  try {
    if (isBatchRemoval) {
      // Batch removal
      console.log('🔍 [DEBUG] Batch removing members:', selectedMembersToRemove.value)

      // Use batch remove mutation (need to import useBatchRemoveGroupMembers)
      const { rpcClient } = await import('@/utils/rpc-client')
      const httpResponse = await rpcClient.groups['batch-remove-members'].$post({
        json: {
          projectId: selectedProject.value.projectId,
          groupId: selectedGroupForManagement.value.groupId,
          userEmails: selectedMembersToRemove.value
        }
      })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(response.error || '批次移除成員失敗')
      }

      showSuccess(`成功移除 ${selectedMembersToRemove.value.length} 位成員`)

      // Invalidate group members query to refetch
      await groupMembersQuery.refetch()

      // Reset batch selection
      selectedMembersToRemove.value = []
    } else {
      // Single removal
      console.log('🔍 [DEBUG] Calling removeMemberMutation with:', {
        projectId: selectedProject.value.projectId,
        groupId: selectedGroupForManagement.value.groupId,
        userEmail: selectedMemberToRemove.value!.userEmail
      })

      await removeMemberMutation.mutateAsync({
        projectId: selectedProject.value.projectId,
        groupId: selectedGroupForManagement.value.groupId,
        userEmail: selectedMemberToRemove.value!.userEmail
      })

      console.log('✅ [DEBUG] Member removed successfully')
    }

    // Close drawer and reset state
    showRemoveMemberDrawer.value = false
    selectedMemberToRemove.value = null
  } catch (error) {
    console.error('❌ [DEBUG] Error removing member:', error)
    handleError(error as Error, { action: '移除成員' })
  } finally {
    removingMember.value = false
  }
}

// Handle member removal cancellation
const handleRemoveMemberCancel = () => {
  console.log('🔍 [DEBUG] handleRemoveMemberCancel called')
  showRemoveMemberDrawer.value = false
  selectedMemberToRemove.value = null
  console.log('🔍 [DEBUG] Drawer closed, state reset')
}

// Handle add member confirmation
const handleAddMemberConfirm = async () => {
  if (selectedMembersToAdd.value.length === 0) return
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  addingMembersConfirm.value = true
  try {
    await batchAddMembersToGroup()

    // Close drawer and reset state
    showAddMemberDrawer.value = false
    membersToAddForConfirmation.value = []
  } catch (error) {
    console.error('Error confirming add members:', error)
    handleError(error as Error, { action: '新增成員' })
  } finally {
    addingMembersConfirm.value = false
  }
}

// Handle add member cancellation
const handleAddMemberCancel = () => {
  showAddMemberDrawer.value = false
  membersToAddForConfirmation.value = []
}

// 更新群組資訊
const updateGroupInfo = async () => {
  if (!selectedProject.value || !selectedGroupForManagement.value) return

  if (!groupEditForm.groupName.trim()) {
    showWarning('群組名稱不能為空')
    return
  }

  try {
    await updateGroupMutation.mutateAsync({
      projectId: selectedProject.value.projectId,
      groupId: selectedGroupForManagement.value.groupId,
      updates: {
        groupName: groupEditForm.groupName.trim(),
        description: groupEditForm.description.trim()
      }
    })

    // 更新本地顯示的群組名稱
    selectedGroupForManagement.value.groupName = groupEditForm.groupName.trim()
    selectedGroupForManagement.value.description = groupEditForm.description.trim()
  } catch (error) {
    console.error('更新群組資訊失敗:', error)
  }
}

// 事件日志
const openEventLogViewer = (project: Project) => {
  router.push(`/logs/${project.projectId}`)
}

// 重新整理專案列表
const refreshProjects = () => {
  projectsQuery.refetch()
  showSuccess('專案列表已刷新')
}

// ========================================
// Auto-refresh Timer
// ========================================
const { progressPercentage, remainingMinutes, resetTimer } = useAutoRefresh(refreshProjects)

// ========================================
// Lifecycle Hooks
// ========================================

// Use breadcrumb composable
const { setPageTitle, clearProjectTitle } = useBreadcrumb()

onMounted(() => {
  console.log('Dashboard mounted successfully')
  // TanStack Query automatically loads projects - no manual call needed

  // Set page title using composable
  setPageTitle('專案')
  clearProjectTitle()
})

// ========================================
// Route Watchers - EventLog Integration
// ========================================

// Watch route changes to auto-open EventLog drawer
watchEffect(() => {
  // ✅ Early exit: only process event-logs route
  if (route.name !== 'event-logs') {
    return
  }

  if (route.params.projectId) {
    const projectId = route.params.projectId as string
    const project = projectsWithPermissions.value.find(
      p => p?.projectId === projectId
    )
    if (project) {
      selectedProjectForLogs.value = project
      showEventLogDrawer.value = true
    } else {
      // Project not found, redirect to dashboard
      router.push('/')
    }
  }
})

// Watch member removal drawer state (debugging)
watch(showRemoveMemberDrawer, (newVal, oldVal) => {
  console.log('🔍 [DEBUG] showRemoveMemberDrawer changed:', {
    oldValue: oldVal,
    newValue: newVal,
    selectedMember: selectedMemberToRemove.value?.userEmail
  })
})

// Watch member management drawer close to cleanup ungrouped members
watch(memberManagementVisible, (newVal) => {
  if (!newVal) {
    // Clear ungrouped members when drawer closes
    ungroupedMembers.value = []
  }
})

// Watch drawer close to navigate back to dashboard
watch(showEventLogDrawer, (newVal) => {
  if (!newVal && route.name === 'event-logs') {
    router.push('/')
  }
})
</script>

<style scoped>
.dashboard {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
}

.top-bar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 0 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.search-container {
  display: flex;
  gap: 12px;
  align-items: center;
  border: none;
  background: transparent;
}

.search-input {
  width: 400px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 20px;
  font-size: 14px;
}

.content-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.projects-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

/* 成員管理樣式 - 使用統一的 .drawer-body, .form-section, .form-group, .drawer-actions */

.members-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  transition: all 0.2s ease;
}

.member-item:hover {
  border-color: #2c5aa0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.member-checkbox {
  flex-shrink: 0;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.member-info .member-avatar {
  flex-shrink: 0;
}

.member-email {
  font-weight: 500;
  color: #2c3e50;
}

.member-role {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.member-role.leader {
  background: #fff4e6;
  color: #ff6b00;
}

.member-role.member {
  background: #e8f4f8;
  color: #1890ff;
}

.no-members,
.no-available-members {
  text-align: center;
  padding: 40px;
  color: #999;
  font-style: italic;
}

.search-members {
  margin-bottom: 20px;
}

.available-members {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.available-member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  transition: all 0.2s ease;
}

.available-member-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.1);
}

.member-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.member-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}

.tag-badge {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: white;
  font-weight: 500;
}

.loading-members {
  text-align: center;
  padding: 40px;
  color: #667eea;
}

.loading-members i {
  font-size: 24px;
  margin-bottom: 10px;
}

/* 無專案時的提示樣式 */
.no-projects {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #909399;
}

.no-projects i {
  font-size: 48px;
  margin-bottom: 20px;
  color: #c0c4cc;
}

.no-projects h3 {
  font-size: 20px;
  margin: 0 0 10px 0;
  color: #606266;
}

.no-projects p {
  font-size: 14px;
  margin: 0;
  max-width: 300px;
  line-height: 1.5;
}

/* 新增：成員選擇器樣式 */
.member-selector {
  margin-bottom: 20px;
}

.member-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2c3e50;
}

.user-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 8px 0;
  min-height: 60px;
}

.user-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-email {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-tags {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  align-items: center;
  flex-shrink: 0;
}

.tag-badge-small {
  padding: 2px 6px;
  border-radius: 10px;
  color: white;
  font-size: 10px;
  font-weight: 500;
}

/* 成員選擇下拉選單樣式 */
:deep(.el-select-dropdown__item) {
  height: auto !important;
  min-height: 100px !important;
  padding: 16px 20px !important;
  line-height: 1.5 !important;
}

:deep(.el-select-dropdown__item.hover),
:deep(.el-select-dropdown__item:hover) {
  background-color: #f5f7fa;
}

.selected-members-preview {
  margin-bottom: 20px;
}

.selected-members-preview label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2c3e50;
}

.selected-members-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.member-tag {
  margin: 0;
}

.member-tag i {
  margin-right: 4px;
}

/* 深色 Drawer Header 樣式 */
.drawer-header-dark {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background-color: #111;
  color: white;
  border-bottom: 1px solid #333;
}

.drawer-header-dark h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.drawer-header-dark h3 i {
  margin-right: 8px;
  color: #409eff;
}

.drawer-close-btn-dark {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.drawer-close-btn-dark:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.drawer-close-btn-dark:active {
  background-color: rgba(255, 255, 255, 0.2);
}

/* 自動刷新按鈕樣式 */
.refresh-button-with-progress {
  transition: all 0.3s ease;
  border: 1px solid #dcdfe6 !important;
  font-weight: 500;
}

.refresh-button-with-progress:hover {
  border-color: #000 !important;
  opacity: 0.8;
}

.refresh-button-with-progress i {
  margin-right: 4px;
  color: inherit;
}

/* 批次操作按鈕樣式 */
.batch-badge {
  position: relative;
  display: inline-block;
}

.batch-badge :deep(.el-badge__content) {
  position: absolute !important;
  top: 8px !important;
  right: -6px !important;
}

/* Portrait mode: Hide TopBarUserControls in top-bar (moved to sidebar) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  /* 為漢堡按鈕留出左側空間 */
  .top-bar {
    padding-left: 60px;
  }

  .top-bar :deep(.user-controls) {
    display: none !important;
  }
}
</style>
