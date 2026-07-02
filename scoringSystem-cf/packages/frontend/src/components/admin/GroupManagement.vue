<template>
  <div class="group-management">

    <!-- Project Groups Content -->
    <div v-if="activeTab === 'project'" v-loading="loadingProjectsList" element-loading-text="載入專案清單中...">
      <ProjectGroupsList
        :projects="projects"
        :selected-project-id="selectedProjectId"
        :groups="groups"
        :loading="loading"
        :search-text="searchText"
        :status-filter="statusFilter"
        :show-inactive="showInactive"
        :selected-groups="selectedProjectGroups"
        :expanded-group-id="expandedProjectGroupId"
        :members-map="projectGroupMembersMap"
        :loading-members="loadingProjectGroupMembers"
        :removing-member-email="removingMemberEmail"
        @update:selected-project-id="handleProjectChange"
        :updating-group-id="updatingGroupId"
        :updating-member-email="updatingMemberEmail"
        :adding-member-for-group="addingMemberForProjectGroup"
        @update:search-text="searchText = $event"
        :can-manage-roles="true"
        @update:status-filter="statusFilter = $event"
        :pending-role-changes="pendingRoleChanges"
        @update:show-inactive="showInactive = $event"
        :selected-users-to-add="selectedUsersToAdd"
        :all-users="allUsers"
        :ungrouped-members="ungroupedMembers"
        :member-role="memberForm.role"
        :adding-member="addingMember"
        @update:selected-users-to-add="selectedUsersToAdd = $event"
        @update:member-role="memberForm.role = $event"
        @toggle-all="toggleAllProjectGroups"
        @toggle-expansion="toggleProjectGroupExpansion"
        @toggle-selection="toggleProjectGroupSelection"
        @edit="editGroup"
        @deactivate="deactivateGroup"
        @activate="activateGroup"
        @update-allow-change="updateGroupAllowChange"
        @batch-deactivate="batchDeactivateProjectGroups"
        @batch-activate="batchActivateProjectGroups"
        @batch-lock="batchLockProjectGroups"
        @batch-unlock="batchUnlockProjectGroups"
        @open-add-member="openProjectAddMemberForm"
        @add-members="addSelectedMembersToProjectGroup"
        @cancel-add-member="cancelProjectAddMember"
        @remove-member="removeMemberFromProjectGroup"
        @batch-remove-members="handleBatchRemoveProjectMembers"
        @update-member-role="updateMemberRole"
        @role-change-pending="handleRoleChangePending"
        @batch-update-roles="handleBatchUpdateRoles"
        @open-viewer-management="openViewerManagement"
      />
    </div>

    <!-- Global Groups Content -->
    <div v-if="activeTab === 'global'">
      <GlobalGroupsList
        :groups="globalGroups"
        :loading="loading"
        :search-text="searchText"
        :status-filter="statusFilter"
        :selected-groups="selectedGlobalGroups"
        :expanded-group-id="expandedGlobalGroupId"
        :members-map="globalGroupMembersMap"
        :loading-members="loadingGlobalGroupMembers"
        :removing-member-email="removingMemberEmail"
        :adding-member-for-group="addingMemberForGlobalGroup"
        :selected-users-to-add="selectedUsersToAdd"
        :all-users="allUsers"
        :adding-member="addingMember"
        @update:search-text="searchText = $event"
        @update:status-filter="statusFilter = $event"
        @update:selected-users-to-add="selectedUsersToAdd = $event"
        @create-global-group="createGlobalGroup"
        @toggle-all="toggleAllGlobalGroups"
        @toggle-expansion="toggleGlobalGroupExpansion"
        @toggle-selection="toggleGlobalGroupSelection"
        @toggle-status="toggleGlobalGroupStatus"
        @edit="editGlobalGroup"
        @deactivate="deactivateGlobalGroup"
        @activate="activateGlobalGroup"
        @batch-deactivate="batchDeactivateGlobalGroups"
        @batch-activate="batchActivateGlobalGroups"
        @open-add-member="openGlobalAddMemberForm"
        @add-members="addSelectedMembersToGlobalGroup"
        @cancel-add-member="cancelGlobalAddMember"
        @remove-member="removeMemberFromGlobalGroup"
        @batch-remove-members="handleBatchRemoveGlobalMembers"
      />
    </div>

    <!-- Global Group Editor Modal -->
    <GlobalGroupEditorModal
      v-model:visible="showGlobalGroupModal"
      :form="globalGroupForm"
      :available-permissions="availablePermissions"
      :saving="savingGlobalGroup"
      @save="saveGlobalGroup"
    />

    <!-- Project Group Editor Drawer -->
    <ProjectGroupEditorDrawer
      v-model:visible="showProjectGroupEditorDrawer"
      :form="projectGroupForm"
      :saving="updating"
      @save="saveProjectGroup"
      @close="closeProjectGroupEditor"
    />

    <!-- Remove Member Confirm Drawer -->
    <RemoveMemberConfirmDrawer
      v-model:visible="showRemoveMemberDrawer"
      :members="pendingRemoveMembers"
      :group-name="pendingRemoveGroup?.groupName || ''"
      :loading="removingMembers"
      @confirm="confirmRemoveMembers"
      @cancel="cancelRemoveMembers"
    />

    <!-- Batch Update Role Drawer -->
    <BatchUpdateRoleDrawer
      v-model:visible="showBatchUpdateRoleDrawer"
      :members="pendingUpdateMembers"
      :group-name="pendingUpdateGroup?.groupName || ''"
      :loading="updatingRoles"
      @confirm="confirmBatchUpdateRoles"
      @cancel="cancelBatchUpdateRoles"
    />

    <!-- Batch Create Groups Drawer -->
    <BatchCreateGroupsDrawer
      v-model:visible="showBatchCreateDrawer"
      :creating="creatingBatchGroups"
      @create="createBatchGroups"
      @close="showBatchCreateDrawer = false"
    />

    <!-- Deactivate Group Confirm Drawer -->
    <DeactivateGroupConfirmDrawer
      v-model:visible="showDeactivateDrawer"
      :group="pendingDeactivateGroup"
      :loading="deactivatingGroup"
      @confirm="confirmDeactivateGroup"
      @cancel="cancelDeactivateGroup"
    />

    <!-- Viewer Management Drawer -->
    <ViewerManagementDrawer
      v-model:visible="showViewerDrawer"
      :selected-project="selectedProjectForViewers"
      :project-viewers="projectViewers"
      :search-results="searchResults"
      :loading-viewers="loadingViewers"
      :searching-users="searchingUsers"
      @search="searchUsers"
      @add-selected="addSelectedViewers"
      @update-role="updateViewerRole"
      @remove="removeViewer"
      @batch-update-roles="batchUpdateRoles"
      @batch-remove="batchRemoveViewers"
    />

    <!-- Edit Group Drawer -->
    <el-drawer
      v-model="showEditModal"
      title="編輯群組"
      direction="btt"
      size="100%"
      :before-close="handleEditDrawerClose"
      class="drawer-navy"
    >

      <div v-loading="editingGroupData" class="drawer-body" element-loading-text="載入群組資料中...">
        <div class="form-section">
          <h4><i class="fas fa-layer-group"></i> 群組基本資訊</h4>

          <div class="form-group">
            <label>群組名稱 <span class="required">*</span></label>
            <el-input v-model="editForm.groupName" placeholder="輸入群組名稱" />
          </div>

          <div class="form-group">
            <label>描述</label>
            <el-input
              v-model="editForm.description"
              type="textarea"
              placeholder="輸入群組描述"
              :rows="3"
            />
          </div>

          <div class="form-group">
            <el-checkbox v-model="editForm.allowChange">
              允許群組成員自由加入/離開
            </el-checkbox>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-primary" :disabled="updating || editingGroupData" @click="updateGroup">
            <i class="fas fa-save"></i>
            {{ updating ? '保存中...' : '保存變更' }}
          </button>
          <button class="btn-secondary" @click="cancelEditGroup">
            <i class="fas fa-times"></i>
            取消
          </button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
/**
 * GroupManagement - Main container for project and global group management
 *
 * Features:
 * - Tab-based navigation between project/global groups
 * - CRUD operations for groups and members
 * - Batch operations (activate, deactivate, lock, unlock)
 * - Inline member management
 * - Real-time filtering and search
 *
 * Architecture:
 * - Uses reactive Sets/Maps for efficient state management
 * - Employs shallowRef for large data arrays to optimize performance
 * - Child components handle presentation, parent manages state
 */
import { ref, reactive, computed, onMounted, watch, shallowRef, inject, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import GlobalGroupEditorModal from './group/GlobalGroupEditorModal.vue'
import ProjectGroupsList from './group-management/project-groups/ProjectGroupsList.vue'
import GlobalGroupsList from './group-management/global-groups/GlobalGroupsList.vue'
import RemoveMemberConfirmDrawer from './group-management/shared/RemoveMemberConfirmDrawer.vue'
import BatchUpdateRoleDrawer from './group-management/shared/BatchUpdateRoleDrawer.vue'
import ProjectGroupEditorDrawer from './group-management/project-groups/ProjectGroupEditorDrawer.vue'
import BatchCreateGroupsDrawer from './group-management/project-groups/BatchCreateGroupsDrawer.vue'
import DeactivateGroupConfirmDrawer from './group-management/project-groups/DeactivateGroupConfirmDrawer.vue'
import ViewerManagementDrawer from './project/ViewerManagementDrawer.vue'
import { rpcClient } from '@/utils/rpc-client'
import { adminApi } from '@/api/admin'
// TanStack Query composables for global groups
import {
  useCreateGlobalGroup,
  useUpdateGlobalGroup,
  useToggleGlobalGroupStatus,
  useAddUserToGlobalGroup,
  useRemoveUserFromGlobalGroup,
  useBatchAddUsersToGlobalGroup,
  useBatchRemoveUsersFromGlobalGroup
} from '@/composables/admin/useGlobalGroups'
import EmptyState from '@/components/shared/EmptyState.vue'
import { formatTime } from '@/utils/helpers'
import { useExpandable } from '@/composables/useExpandable'
import { handleError, showSuccess } from '@/utils/errorHandler'
import { ElMessageBox } from 'element-plus'

export default {
  name: 'GroupManagement',
  components: {
    GlobalGroupEditorModal,
    ProjectGroupsList,
    GlobalGroupsList,
    RemoveMemberConfirmDrawer,
    BatchUpdateRoleDrawer,
    ProjectGroupEditorDrawer,
    BatchCreateGroupsDrawer,
    DeactivateGroupConfirmDrawer,
    ViewerManagementDrawer
  },
  props: {
    projectId: {
      type: String,
      default: ''
    },
    groupId: {
      type: String,
      default: ''
    }
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()

    // ============================================================================
    // TanStack Query Mutations
    // ============================================================================
    const createGlobalGroupMutation = useCreateGlobalGroup()
    const updateGlobalGroupMutation = useUpdateGlobalGroup()
    const toggleGlobalGroupStatusMutation = useToggleGlobalGroupStatus()
    const addUserToGroupMutation = useAddUserToGlobalGroup()
    const removeUserFromGroupMutation = useRemoveUserFromGlobalGroup()
    const batchAddUsersMutation = useBatchAddUsersToGlobalGroup()
    const batchRemoveUsersMutation = useBatchRemoveUsersFromGlobalGroup()

    // Register refresh function with parent SystemAdmin
    const registerRefresh = inject('registerRefresh', () => {})

    // Register action function with parent SystemAdmin
    const registerAction = inject('registerAction', () => {})

    // Get activeTab from route meta or default to 'global'
    const activeTab = computed(() => {
      return route.meta?.groupType || 'global'
    })

    // Get current projectId and groupId from route params
    const currentProjectId = computed(() => route.params.projectId || '')
    const currentGroupId = computed(() => route.params.groupId || '')

    const projects = shallowRef([])
    const groups = shallowRef([])
    const globalGroups = shallowRef([])
    const selectedProjectId = ref(currentProjectId.value)
    const searchText = ref('')
    const statusFilter = ref('')
    const showInactive = ref(false)
    const showEditModal = ref(false)
    const showGlobalGroupModal = ref(false)
    const showProjectGroupEditorDrawer = ref(false)
    const showBatchCreateDrawer = ref(false)
    const selectedGroup = ref(null)
    const updating = ref(false)
    const addingMember = ref(false)
    const removingMember = ref(false)
    const removingMemberEmail = ref('') // Track which member is being removed
    const loading = ref(false)
    const loadingProjectsList = ref(false)
    const savingGlobalGroup = ref(false)

    // Batch member removal state
    const showRemoveMemberDrawer = ref(false)
    const pendingRemoveMembers = ref([])
    const pendingRemoveGroup = ref(null)
    const removingMembers = ref(false)
    const pendingRemoveType = ref('') // 'project' or 'global'
    const editingGroupData = ref(false)
    const updatingGroupId = ref(null) // Track which group's allowChange is being updated

    // Deactivate group drawer state
    const showDeactivateDrawer = ref(false)
    const pendingDeactivateGroup = ref(null)
    const deactivatingGroup = ref(false)

    // Batch group creation
    const creatingBatchGroups = ref(false)

    // Batch role update state
    const showBatchUpdateRoleDrawer = ref(false)
    const pendingUpdateMembers = ref([])
    const pendingUpdateGroup = ref(null)
    const updatingRoles = ref(false)
    const updatingMemberEmail = ref(null) // Track which member's role is being updated
    const pendingRoleChanges = ref(new Map()) // Track pending role changes for batch mode

    // Member management
    const selectedUsersToAdd = ref([])

    // Ungrouped members tracking
    const ungroupedMembers = ref([])
    const loadingUngroupedMembers = ref(false)

    // User selection and search
    const allUsers = ref([])

    // Viewer management state
    const showViewerDrawer = ref(false)
    const loadingViewers = ref(false)
    const projectViewers = ref([])
    const selectedProjectForViewers = ref(null)
    const newViewer = reactive({
      searchText: '',
      role: 'teacher'
    })
    const searchResults = ref([])
    const selectedUsers = ref([])
    const searchingUsers = ref(false)
    const selectedViewers = ref([])
    const batchRole = ref('')
    const viewerSortField = ref('displayName')
    const viewerSortOrder = ref('asc')

    // Inline expansion state for groups - using useExpandable composable
    const {
      expandedIds: expandedProjectGroups,
      contentMap: projectGroupMembersMap,
      loadingIds: loadingProjectGroupMembers,
      toggleExpansion: toggleProjectGroupExpansionLogic,
      isExpanded: isProjectGroupExpanded,
      isLoading: isProjectGroupLoading,
    } = useExpandable({ singleMode: true })

    const {
      expandedIds: expandedGlobalGroups,
      contentMap: globalGroupMembersMap,
      loadingIds: loadingGlobalGroupMembers,
      toggleExpansion: toggleGlobalGroupExpansionLogic,
      isExpanded: isGlobalGroupExpanded,
      isLoading: isGlobalGroupLoading,
    } = useExpandable({ singleMode: true })

    const addingMemberForProjectGroup = ref(null)
    const addingMemberForGlobalGroup = ref(null)

    // Computed properties for expansion (to provide single group ID to child components)
    const expandedProjectGroupId = computed(() => {
      const arr = Array.from(expandedProjectGroups)
      return arr.length > 0 ? arr[0] : null
    })

    const expandedGlobalGroupId = computed(() => {
      const arr = Array.from(expandedGlobalGroups)
      return arr.length > 0 ? arr[0] : null
    })

    // Batch selection state
    const selectedProjectGroups = reactive(new Set())
    const selectedGlobalGroups = reactive(new Set())

    const editForm = reactive({
      groupId: '',
      groupName: '',
      description: '',
      allowChange: true
    })

    const memberForm = reactive({
      userEmail: '',
      role: 'member'
    })

    const globalGroupForm = reactive({
      groupId: '',
      groupName: '',
      description: '',
      globalPermissions: []
    })

    const projectGroupForm = reactive({
      groupId: '',
      groupName: '',
      description: '',
      allowChange: true
    })

    const availablePermissions = [
      { key: 'create_project', label: '建立專案' },
      { key: 'system_admin', label: '系統管理' },
      { key: 'manage_users', label: '管理使用者' },
      { key: 'generate_invites', label: '產生邀請碼' },
      { key: 'view_system_logs', label: '檢視系統日誌' },
      { key: 'manage_global_groups', label: '管理全域群組' },
      { key: 'notification_manager', label: '通知管理' },
      { key: 'manage_email_logs', label: '管理郵件紀錄' }
    ]

    const stats = computed(() => {
      if (activeTab.value === 'global') {
        return {
          totalGroups: globalGroups.value.length,
          activeGroups: globalGroups.value.filter(g => g.isActive).length,
          inactiveGroups: globalGroups.value.filter(g => !g.isActive).length
        }
      } else {
        return {
          totalGroups: groups.value.length,
          activeGroups: groups.value.filter(g => g.status === 'active').length,
          inactiveGroups: groups.value.filter(g => g.status === 'inactive').length
        }
      }
    })

    // ====================================================================
    // HELPER FUNCTIONS
    // ====================================================================

    // ====================================================================
    // PROJECT GROUPS OPERATIONS
    // ====================================================================

    const loadProjectGroups = async () => {
      if (!selectedProjectId.value) {
        groups.value = []
        return
      }

      try {
        loading.value = true
        const httpResponse = await rpcClient.groups.list.$post({
          json: {
            projectId: selectedProjectId.value,
            includeInactive: showInactive.value
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          groups.value = response.data
        }
      } catch (error) {
        console.error('Error loading project groups:', error)
        handleError(error, { action: '載入專案群組' })
      } finally {
        loading.value = false
      }
    }

    const handleProjectChange = async (projectId) => {
      // Sync URL with selected project
      if (projectId) {
        await router.replace({
          name: 'admin-groups-project-detail',
          params: { projectId }
        })
      } else {
        await router.replace({
          name: 'admin-groups-project'
        })
      }

      selectedProjectId.value = projectId

      // Clear previous state
      groups.value = []
      expandedProjectGroups.clear()
      projectGroupMembersMap.clear()
      selectedProjectGroups.clear()
      addingMemberForProjectGroup.value = null
      ungroupedMembers.value = []

      if (projectId) {
        await loadProjectGroups()
        await loadAllUsers()
      } else {
        allUsers.value = []
      }
    }

    const editGroup = async (group) => {
      try {
        showEditModal.value = true
        editingGroupData.value = true

        selectedGroup.value = group
        editForm.groupId = group.groupId
        editForm.groupName = group.groupName
        editForm.description = group.description || ''
        editForm.allowChange = group.allowChange !== false

        editingGroupData.value = false
      } catch (error) {
        editingGroupData.value = false
        handleError(error, { action: '載入群組資料' })
        showEditModal.value = false
      }
    }

    const updateGroup = async () => {
      if (!editForm.groupName.trim()) {
        handleError('請輸入群組名稱', { type: 'error' })
        return
      }

      try {
        updating.value = true

        const httpResponse = await rpcClient.groups.update.$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: editForm.groupId,
            updates: {
              groupName: editForm.groupName.trim(),
              description: editForm.description.trim(),
              allowChange: editForm.allowChange
            }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('群組更新成功')
          showEditModal.value = false
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error updating group:', error)
      } finally {
        updating.value = false
      }
    }

    const cancelEditGroup = () => {
      showEditModal.value = false
      editForm.groupId = ''
      editForm.groupName = ''
      editForm.description = ''
      editForm.allowChange = true
    }

    const handleEditDrawerClose = (done) => {
      cancelEditGroup()
      done()
    }

    const deactivateGroup = async (group) => {
      // Show confirmation drawer instead of direct API call
      pendingDeactivateGroup.value = group
      showDeactivateDrawer.value = true
    }

    const confirmDeactivateGroup = async () => {
      if (!pendingDeactivateGroup.value) return

      try {
        deactivatingGroup.value = true

        const httpResponse = await rpcClient.groups.deactivate.$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: pendingDeactivateGroup.value.groupId
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('群組已停用')
          showDeactivateDrawer.value = false
          pendingDeactivateGroup.value = null
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error deactivating group:', error)
        handleError(error, { action: '停用群組' })
      } finally {
        deactivatingGroup.value = false
      }
    }

    const cancelDeactivateGroup = () => {
      showDeactivateDrawer.value = false
      pendingDeactivateGroup.value = null
    }

    const activateGroup = async (group) => {
      try {
        const httpResponse = await rpcClient.groups.activate.$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: group.groupId
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('群組已啟用')
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error activating group:', error)
        handleError(error, { action: '啟用群組' })
      }
    }

    const updateGroupAllowChange = async ({ groupId, allowChange }) => {
      try {
        updatingGroupId.value = groupId

        const httpResponse = await rpcClient.groups.update.$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: groupId,
            updates: {
              allowChange: allowChange
            }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess(allowChange ? '已解鎖群組' : '已鎖定群組')
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error updating allowChange:', error)
        handleError(error, { action: '更新群組設定' })
      } finally {
        updatingGroupId.value = null
      }
    }

    const openBatchCreateDrawer = () => {
      if (!selectedProjectId.value) {
        handleError('請先選擇專案', { type: 'error' })
        return
      }

      showBatchCreateDrawer.value = true
    }

    const createBatchGroups = async (payload) => {
      console.log('🚀 [GroupManagement] createBatchGroups - Received payload:', payload)

      if (!selectedProjectId.value) {
        handleError('請先選擇專案', { type: 'error' })
        return
      }

      const { groupCount, allowChange } = payload
      console.log('📦 [GroupManagement] Destructured values:')
      console.log('  - groupCount:', groupCount, typeof groupCount)
      console.log('  - allowChange:', allowChange, typeof allowChange)

      creatingBatchGroups.value = true

      try {
        // Vue 3 Best Practice: rpcClient automatically handles authentication
        console.log('🚀 [GroupManagement] Calling batch-create API...')

        // 使用新的批量創建 API 端點
        const httpResponse = await rpcClient.groups['batch-create'].$post({
          json: {
            projectId: selectedProjectId.value,
            groupCount: groupCount,
            allowChange: allowChange,
            namePrefix: '學生分組'
          }
        })
        const response = await httpResponse.json()

        console.log('✅ [GroupManagement] Batch create response:', response)

        if (response.success) {
          showSuccess(`成功建立 ${response.data.createdCount} 個分組`)
          showBatchCreateDrawer.value = false // Close drawer on success

          // 重新載入群組列表
          await loadProjectGroups()
        } else {
          handleError(response.error || '建立分組失敗', { type: 'error' })
        }

      } catch (error) {
        console.error('Error creating batch groups:', error)
        handleError('批量建立分組失敗，請重試', { type: 'error' })
      } finally {
        creatingBatchGroups.value = false
      }
    }

    const createProjectGroup = () => {
      if (!selectedProjectId.value) {
        handleError('請先選擇專案', { type: 'error' })
        return
      }

      // Reset form
      projectGroupForm.groupId = ''
      projectGroupForm.groupName = ''
      projectGroupForm.description = ''
      projectGroupForm.allowChange = true

      showProjectGroupEditorDrawer.value = true
    }

    const saveProjectGroup = async () => {
      if (!projectGroupForm.groupName.trim()) {
        handleError('請輸入群組名稱', { type: 'error' })
        return
      }

      if (!selectedProjectId.value) {
        handleError('請先選擇專案', { type: 'error' })
        return
      }

      try {
        updating.value = true

        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const isEdit = !!projectGroupForm.groupId

        if (isEdit) {
          // Update existing group
          const httpResponse = await rpcClient.groups.update.$post({
            json: {
              projectId: selectedProjectId.value,
              groupId: projectGroupForm.groupId,
              updates: {
                groupName: projectGroupForm.groupName.trim(),
                description: projectGroupForm.description.trim(),
                allowChange: projectGroupForm.allowChange
              }
            }
          })
          const response = await httpResponse.json()

          if (response.success) {
            showSuccess('群組更新成功')
            showProjectGroupEditorDrawer.value = false
            loadProjectGroups()
          }
        } else {
          // Create new group
          const httpResponse = await rpcClient.groups.create.$post({
            json: {
              projectId: selectedProjectId.value,
              groupData: {
                groupName: projectGroupForm.groupName.trim(),
                description: projectGroupForm.description.trim(),
                allowChange: projectGroupForm.allowChange
              }
            }
          })
          const response = await httpResponse.json()

          if (response.success) {
            showSuccess('群組建立成功')
            showProjectGroupEditorDrawer.value = false
            loadProjectGroups()
          }
        }
      } catch (error) {
        console.error('Error saving project group:', error)
        handleError(error, { action: '保存專案群組' })
      } finally {
        updating.value = false
      }
    }

    const closeProjectGroupEditor = () => {
      showProjectGroupEditorDrawer.value = false
      projectGroupForm.groupId = ''
      projectGroupForm.groupName = ''
      projectGroupForm.description = ''
      projectGroupForm.allowChange = true
    }

    // ====================================================================
    // GLOBAL GROUPS OPERATIONS
    // ====================================================================

    const loadGlobalGroups = async () => {
      try {
        loading.value = true
        const response = await adminApi.globalGroups.list()

        if (response.success && response.data) {
          // Handle new response format with groups array
          globalGroups.value = response.data.groups || response.data
        }
      } catch (error) {
        console.error('Error loading global groups:', error)
        handleError(error, { action: '載入全域群組' })
      } finally {
        loading.value = false
      }
    }

    const createGlobalGroup = () => {
      globalGroupForm.groupId = ''
      globalGroupForm.groupName = ''
      globalGroupForm.description = ''
      globalGroupForm.globalPermissions = []
      showGlobalGroupModal.value = true
    }

    const editGlobalGroup = (group) => {
      globalGroupForm.groupId = group.groupId
      globalGroupForm.groupName = group.groupName
      globalGroupForm.description = group.description || ''

      // Parse permissions
      try {
        if (group.globalPermissions && typeof group.globalPermissions === 'string') {
          globalGroupForm.globalPermissions = JSON.parse(group.globalPermissions)
        } else if (Array.isArray(group.globalPermissions)) {
          globalGroupForm.globalPermissions = group.globalPermissions
        } else {
          globalGroupForm.globalPermissions = []
        }
      } catch (error) {
        console.error('Error parsing permissions:', error)
        globalGroupForm.globalPermissions = []
      }

      showGlobalGroupModal.value = true
    }

    const saveGlobalGroup = async () => {
      if (!globalGroupForm.groupName.trim()) {
        handleError('請輸入群組名稱', { type: 'error' })
        return
      }

      try {
        savingGlobalGroup.value = true

        const isEdit = !!globalGroupForm.groupId

        // 使用 TanStack Query mutation
        if (isEdit) {
          await updateGlobalGroupMutation.mutateAsync({
            groupId: globalGroupForm.groupId,
            groupName: globalGroupForm.groupName.trim(),
            globalPermissions: globalGroupForm.globalPermissions
          })
        } else {
          await createGlobalGroupMutation.mutateAsync({
            groupName: globalGroupForm.groupName.trim(),
            globalPermissions: globalGroupForm.globalPermissions
          })
        }

        showGlobalGroupModal.value = false
        loadGlobalGroups()
      } catch (error) {
        console.error('Error saving global group:', error)
        handleError(error, { action: '保存全域群組' })
      } finally {
        savingGlobalGroup.value = false
      }
    }

    const deactivateGlobalGroup = async (group) => {
      // 使用 TanStack Query mutation
      await toggleGlobalGroupStatusMutation.mutateAsync({
        groupId: group.groupId,
        activate: false
      })
      loadGlobalGroups()
    }

    const activateGlobalGroup = async (group) => {
      // 使用 TanStack Query mutation（會自動顯示成功/錯誤訊息）
      await toggleGlobalGroupStatusMutation.mutateAsync({
        groupId: group.groupId,
        activate: true
      })
      loadGlobalGroups()
    }

    const toggleGlobalGroupStatus = async (group) => {
      try {
        // Show confirmation dialog for deactivation
        if (group.isActive) {
          await ElMessageBox.confirm(
            `確定要停用群組「${group.groupName}」嗎？這將同時停用所有該群組的成員關係。`,
            '停用群組',
            { type: 'warning' }
          )
        }

        // 使用 TanStack Query mutation（會自動顯示成功/錯誤訊息）
        await toggleGlobalGroupStatusMutation.mutateAsync({
          groupId: group.groupId,
          activate: !group.isActive
        })
        loadGlobalGroups()
      } catch (error) {
        if (error === 'cancel') return
        console.error('Error toggling group status:', error)
      }
    }

    // ====================================================================
    // BATCH OPERATIONS
    // ====================================================================

    const toggleAllProjectGroups = () => {
      if (selectedProjectGroups.size === groups.value.length) {
        selectedProjectGroups.clear()
      } else {
        groups.value.forEach(g => selectedProjectGroups.add(g.groupId))
      }
    }

    const toggleProjectGroupSelection = (groupId) => {
      if (selectedProjectGroups.has(groupId)) {
        selectedProjectGroups.delete(groupId)
      } else {
        selectedProjectGroups.add(groupId)
      }
    }

    const toggleAllGlobalGroups = () => {
      if (selectedGlobalGroups.size === globalGroups.value.length) {
        selectedGlobalGroups.clear()
      } else {
        globalGroups.value.forEach(g => selectedGlobalGroups.add(g.groupId))
      }
    }

    const toggleGlobalGroupSelection = (groupId) => {
      if (selectedGlobalGroups.has(groupId)) {
        selectedGlobalGroups.delete(groupId)
      } else {
        selectedGlobalGroups.add(groupId)
      }
    }

    const batchDeactivateProjectGroups = async () => {
      if (selectedProjectGroups.size === 0) return

      try {
        const promises = Array.from(selectedProjectGroups).map(groupId =>
          rpcClient.groups.deactivate.$post({
            json: {
              projectId: selectedProjectId.value,
              groupId
            }
          }).then(res => res.json())
        )

        const results = await Promise.all(promises)
        const successCount = results.filter(r => r.success).length

        if (successCount > 0) {
          showSuccess(`成功停用 ${successCount} 個群組`)
        }

        selectedProjectGroups.clear()
        loadProjectGroups()
      } catch (error) {
        console.error('Error batch deactivating groups:', error)
        handleError('批量停用失敗，請稍後再試', { type: 'error' })
      }
    }

    const batchActivateProjectGroups = async () => {
      if (selectedProjectGroups.size === 0) return

      try {
        const promises = Array.from(selectedProjectGroups).map(groupId =>
          rpcClient.groups.activate.$post({
            json: {
              projectId: selectedProjectId.value,
              groupId
            }
          }).then(res => res.json())
        )

        const results = await Promise.all(promises)
        const successCount = results.filter(r => r.success).length

        if (successCount > 0) {
          showSuccess(`成功啟用 ${successCount} 個群組`)
        }

        selectedProjectGroups.clear()
        loadProjectGroups()
      } catch (error) {
        console.error('Error batch activating groups:', error)
        handleError('批量啟用失敗，請稍後再試', { type: 'error' })
      }
    }

    const batchLockProjectGroups = async () => {
      if (selectedProjectGroups.size === 0) return

      try {
        const promises = Array.from(selectedProjectGroups).map(groupId =>
          rpcClient.groups.update.$post({
            json: {
              projectId: selectedProjectId.value,
              groupId,
              updates: { allowChange: false }
            }
          }).then(res => res.json())
        )

        const results = await Promise.all(promises)
        const successCount = results.filter(r => r.success).length

        if (successCount > 0) {
          showSuccess(`成功鎖定 ${successCount} 個群組`)
        }

        selectedProjectGroups.clear()
        loadProjectGroups()
      } catch (error) {
        console.error('Error batch locking groups:', error)
        handleError('批量鎖定失敗，請稍後再試', { type: 'error' })
      }
    }

    const batchUnlockProjectGroups = async () => {
      if (selectedProjectGroups.size === 0) return

      try {
        const promises = Array.from(selectedProjectGroups).map(groupId =>
          rpcClient.groups.update.$post({
            json: {
              projectId: selectedProjectId.value,
              groupId,
              updates: { allowChange: true }
            }
          }).then(res => res.json())
        )

        const results = await Promise.all(promises)
        const successCount = results.filter(r => r.success).length

        if (successCount > 0) {
          showSuccess(`成功解鎖 ${successCount} 個群組`)
        }

        selectedProjectGroups.clear()
        loadProjectGroups()
      } catch (error) {
        console.error('Error batch unlocking groups:', error)
        handleError('批量解鎖失敗，請稍後再試', { type: 'error' })
      }
    }

    const batchDeactivateGlobalGroups = async () => {
      if (selectedGlobalGroups.size === 0) return

      try {
        // Use dedicated batch endpoint for better performance
        const response = await adminApi.globalGroups.batchDeactivate({
          groupIds: Array.from(selectedGlobalGroups)
        })

        if (response.success) {
          const successCount = response.data?.successCount || selectedGlobalGroups.size
          showSuccess(`成功停用 ${successCount} 個全域群組`)
          selectedGlobalGroups.clear()
          loadGlobalGroups()
        }
      } catch (error) {
        console.error('Error batch deactivating global groups:', error)
        handleError('批量停用失敗，請稍後再試', { type: 'error' })
      }
    }

    const batchActivateGlobalGroups = async () => {
      if (selectedGlobalGroups.size === 0) return

      try {
        // Use dedicated batch endpoint for better performance
        const response = await adminApi.globalGroups.batchActivate({
          groupIds: Array.from(selectedGlobalGroups)
        })

        if (response.success) {
          const successCount = response.data?.successCount || selectedGlobalGroups.size
          showSuccess(`成功啟用 ${successCount} 個全域群組`)
          selectedGlobalGroups.clear()
          loadGlobalGroups()
        }
      } catch (error) {
        console.error('Error batch activating global groups:', error)
        handleError('批量啟用失敗，請稍後再試', { type: 'error' })
      }
    }

    // ====================================================================
    // INLINE EXPANSION & MEMBER MANAGEMENT
    // ====================================================================

    const toggleProjectGroupExpansion = async (group) => {
      const groupId = group.groupId

      // Close add member form when collapsing
      if (expandedProjectGroups.has(groupId)) {
        addingMemberForProjectGroup.value = null
      } else {
        // Load ungrouped members when expanding
        await loadUngroupedMembers()
      }

      // Use composable's toggle logic with async loading
      await toggleProjectGroupExpansionLogic(groupId, async () => {
        await loadProjectGroupMembersInline(groupId)
        return projectGroupMembersMap.get(groupId)
      })
    }

    const toggleGlobalGroupExpansion = async (group) => {
      const groupId = group.groupId

      // Close add member form when collapsing
      if (expandedGlobalGroups.has(groupId)) {
        addingMemberForGlobalGroup.value = null
      }

      // Use composable's toggle logic with async loading
      await toggleGlobalGroupExpansionLogic(groupId, async () => {
        await loadGlobalGroupMembersInline(groupId)
        return globalGroupMembersMap.get(groupId)
      })
    }

    const loadProjectGroupMembersInline = async (groupId) => {
      // Note: Loading state is now managed by useExpandable composable
      try {
        const httpResponse = await rpcClient.groups.details.$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: groupId
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          // response.data contains full group details, extract members array
          projectGroupMembersMap.set(groupId, response.data.members || [])
        }
      } catch (error) {
        console.error('Error loading project group members:', error)
        handleError('載入群組成員失敗', { type: 'error' })
        throw error // Re-throw to let composable handle collapse on error
      }
    }

    const loadGlobalGroupMembersInline = async (groupId) => {
      // Note: Loading state is now managed by useExpandable composable
      try {
        const response = await adminApi.globalGroups.members(groupId)

        if (response.success && response.data) {
          globalGroupMembersMap.set(groupId, response.data.members)
        }
      } catch (error) {
        console.error('Error loading global group members:', error)
        handleError('載入群組成員失敗', { type: 'error' })
        throw error // Re-throw to let composable handle collapse on error
      }
    }

    const openProjectAddMemberForm = async (group) => {
      addingMemberForProjectGroup.value = group.groupId
      selectedUsersToAdd.value = []
      memberForm.role = 'member'

      // Ensure users are loaded
      if (allUsers.value.length === 0) {
        await loadAllUsers()
      }
    }

    const cancelProjectAddMember = () => {
      addingMemberForProjectGroup.value = null
      selectedUsersToAdd.value = []
      memberForm.role = 'member'
    }

    const openGlobalAddMemberForm = async (group) => {
      addingMemberForGlobalGroup.value = group.groupId
      selectedUsersToAdd.value = []

      // Ensure users are loaded
      if (allUsers.value.length === 0) {
        await loadAllUsersForGlobal()
      }
    }

    const cancelGlobalAddMember = () => {
      addingMemberForGlobalGroup.value = null
      selectedUsersToAdd.value = []
    }

    const loadUngroupedMembers = async () => {
      if (!selectedProjectId.value) {
        ungroupedMembers.value = []
        return
      }

      try {
        loadingUngroupedMembers.value = true
        const httpResponse = await rpcClient.projects.viewers['mark-unassigned'].$post({
          json: {
            projectId: selectedProjectId.value
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

    const loadAllUsers = async () => {
      try {
        if (!selectedProjectId.value) {
          console.warn('No project selected, cannot load users')
          allUsers.value = []
          return
        }

        // 獲取專案的 member 角色使用者（從 project_viewers 表）
        const httpResponse = await rpcClient.projects.viewers.list.$post({
          json: {
            projectId: selectedProjectId.value
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          // 過濾出 role='member' 的使用者
          allUsers.value = response.data
            .filter(viewer => viewer.role === 'member')
            .map(viewer => ({
              userId: viewer.userEmail,
              userEmail: viewer.userEmail,
              displayName: viewer.displayName,
              avatarSeed: viewer.avatarSeed,
              avatarStyle: viewer.avatarStyle,
              tags: viewer.tags || []
            }))
        }
      } catch (error) {
        console.error('Error loading users:', error)
        allUsers.value = []
      }
    }

    const loadAllUsersForGlobal = async () => {
      try {
        const response = await adminApi.users.list({})

        if (response.success && response.data) {
          // Support both old format (array) and new format ({ users: [...] })
          const usersArray = Array.isArray(response.data)
            ? response.data
            : response.data.users || []

          allUsers.value = usersArray.map(user => ({
            userId: user.userEmail,
            userEmail: user.userEmail,
            displayName: user.displayName
          }))
        }
      } catch (error) {
        console.error('Error loading users for global:', error)
        allUsers.value = []
      }
    }

    const addSelectedMembersToProjectGroup = async (group) => {
      if (selectedUsersToAdd.value.length === 0) {
        handleError('請至少選擇一個使用者', { type: 'error' })
        return
      }

      try {
        addingMember.value = true

        // Use batch API instead of individual requests
        const httpResponse = await rpcClient.groups['batch-add-members'].$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: group.groupId,
            members: selectedUsersToAdd.value.map(email => ({
              userEmail: email,
              role: memberForm.role
            }))
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const data = response.data || {}
          const successCount = data.successCount || data.addedMembers?.length || selectedUsersToAdd.value.length
          showSuccess(`成功新增 ${successCount} 個成員`)
          selectedUsersToAdd.value = []
          memberForm.role = 'member'
          addingMemberForProjectGroup.value = null
          await loadProjectGroupMembersInline(group.groupId)
          await loadProjectGroups() // Refresh group list to update member count
        } else {
          handleError(response.error?.message || '新增成員失敗', { type: 'error' })
        }
      } catch (error) {
        console.error('Error adding members:', error)
        handleError('新增成員時發生錯誤', { type: 'error' })
      } finally {
        addingMember.value = false
      }
    }

    const addSelectedMembersToGlobalGroup = async (group) => {
      if (selectedUsersToAdd.value.length === 0) {
        handleError('請至少選擇一個使用者', { type: 'error' })
        return
      }

      try {
        addingMember.value = true

        // 使用 TanStack Query batch mutation
        const result = await batchAddUsersMutation.mutateAsync({
          groupId: group.groupId,
          userEmails: selectedUsersToAdd.value
        })

        // 顯示部分失敗的警告（mutation 會處理成功訊息）
        if (result.failedCount > 0) {
          const errorMessage = (result.errors || []).join('\n')
          ElMessage.warning({
            message: `${result.failedCount} 個成員新增失敗：\n${errorMessage}`,
            duration: 8000,
            showClose: true
          })
        }

        selectedUsersToAdd.value = []
        addingMemberForGlobalGroup.value = null
        await loadGlobalGroupMembersInline(group.groupId)
        await loadGlobalGroups() // Refresh group list to update member count
      } catch (error) {
        console.error('Error adding members:', error)
      } finally {
        addingMember.value = false
      }
    }

    const removeMemberFromProjectGroup = async ({ member, group }) => {
      try {
        removingMemberEmail.value = member.userEmail

        const httpResponse = await rpcClient.groups['remove-member'].$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: group.groupId,
            userEmail: member.userEmail
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('成員已移除')
          await loadProjectGroupMembersInline(group.groupId)
          await loadProjectGroups() // Refresh group list to update member count
        }
      } catch (error) {
        console.error('Error removing member:', error)
        handleError(error, { action: '移除成員' })
      } finally {
        removingMemberEmail.value = null
      }
    }

    const removeMemberFromGlobalGroup = async ({ member, group }) => {
      try {
        removingMemberEmail.value = member.userEmail

        // 使用 TanStack Query mutation（會自動顯示成功/錯誤訊息）
        await removeUserFromGroupMutation.mutateAsync({
          groupId: group.groupId,
          userEmail: member.userEmail
        })

        await loadGlobalGroupMembersInline(group.groupId)
        await loadGlobalGroups() // Refresh group list to update member count
      } catch (error) {
        console.error('Error removing member:', error)
      } finally {
        removingMemberEmail.value = null
      }
    }

    // ====================================================================
    // BATCH REMOVE MEMBERS
    // ====================================================================

    const handleBatchRemoveProjectMembers = ({ members, group }) => {
      console.log('[GroupManagement] handleBatchRemoveProjectMembers called', { members, group })
      pendingRemoveMembers.value = members
      pendingRemoveGroup.value = group
      pendingRemoveType.value = 'project'
      showRemoveMemberDrawer.value = true
      console.log('[GroupManagement] Remove drawer should open now')
    }

    const handleBatchRemoveGlobalMembers = ({ members, group }) => {
      console.log('[GroupManagement] handleBatchRemoveGlobalMembers called', { members, group })
      pendingRemoveMembers.value = members
      pendingRemoveGroup.value = group
      pendingRemoveType.value = 'global'
      showRemoveMemberDrawer.value = true
      console.log('[GroupManagement] Remove drawer should open now')
    }

    const confirmRemoveMembers = async () => {
      try {
        removingMembers.value = true

        if (pendingRemoveType.value === 'project') {
          // Project Groups batch remove
          const userEmails = pendingRemoveMembers.value.map(m => m.userEmail)

          const httpResponse = await rpcClient.groups['batch-remove-members'].$post({
            json: {
              projectId: selectedProjectId.value,
              groupId: pendingRemoveGroup.value.groupId,
              userEmails: userEmails
            }
          })
          const response = await httpResponse.json()

          if (response.success) {
            const successCount = response.data?.successCount || 0
            showSuccess(`成功移除 ${successCount} 個成員`)

            // Refresh members list
            await loadProjectGroupMembersInline(pendingRemoveGroup.value.groupId)
            // Refresh group list to update member count
            await loadProjectGroups()

            // Close drawer
            showRemoveMemberDrawer.value = false
            pendingRemoveMembers.value = []
            pendingRemoveGroup.value = null
          }
        } else if (pendingRemoveType.value === 'global') {
          // Global Groups batch remove - 使用 TanStack Query mutation
          const userEmails = pendingRemoveMembers.value.map(m => m.userEmail)

          await batchRemoveUsersMutation.mutateAsync({
            groupId: pendingRemoveGroup.value.groupId,
            userEmails: userEmails
          })

          // Refresh members list（mutation 會處理成功訊息）
          await loadGlobalGroupMembersInline(pendingRemoveGroup.value.groupId)
          // Refresh group list to update member count
          await loadGlobalGroups()

          // Close drawer
          showRemoveMemberDrawer.value = false
          pendingRemoveMembers.value = []
          pendingRemoveGroup.value = null
        }
      } catch (error) {
        console.error('Error batch removing members:', error)
        handleError(error, { action: '批量移除成員' })
      } finally {
        removingMembers.value = false
      }
    }

    const cancelRemoveMembers = () => {
      showRemoveMemberDrawer.value = false
      pendingRemoveMembers.value = []
      pendingRemoveGroup.value = null
      removingMembers.value = false
    }

    // ====================================================================
    // BATCH UPDATE MEMBER ROLES
    // ====================================================================

    const updateMemberRole = async ({ member, group, newRole }) => {
      try {
        updatingMemberEmail.value = member.userEmail

        const httpResponse = await rpcClient.groups['update-member-role'].$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: group.groupId,
            userEmail: member.userEmail,
            newRole: newRole
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('成員角色已更新')
          await loadProjectGroupMembersInline(group.groupId)
          await loadProjectGroups() // Refresh group list to update leader count
        }
      } catch (error) {
        console.error('Error updating member role:', error)
        handleError(error, { action: '更新成員角色' })
      } finally {
        updatingMemberEmail.value = null
      }
    }

    const handleRoleChangePending = ({ userEmail, groupId, newRole }) => {
      console.log('[GroupManagement] handleRoleChangePending called', { userEmail, groupId, newRole })
      // Update the pending role changes map
      pendingRoleChanges.value.set(userEmail, newRole)
    }

    const handleBatchUpdateRoles = ({ members, group }) => {
      console.log('[GroupManagement] handleBatchUpdateRoles called', { members, group })

      // Build member change objects with oldRole and newRole
      const membersWithChanges = members.map(member => {
        const oldRole = member.role // Original role from database
        const newRole = pendingRoleChanges.value.get(member.userEmail) || oldRole // Pending role or keep original

        return {
          ...member,
          oldRole,
          newRole
        }
      })

      pendingUpdateMembers.value = membersWithChanges
      pendingUpdateGroup.value = group
      showBatchUpdateRoleDrawer.value = true
      console.log('[GroupManagement] Batch update role drawer should open now')
    }

    const confirmBatchUpdateRoles = async (updates) => {
      try {
        updatingRoles.value = true

        const httpResponse = await rpcClient.groups['batch-update-roles'].$post({
          json: {
            projectId: selectedProjectId.value,
            groupId: pendingUpdateGroup.value.groupId,
            updates: updates
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const successCount = response.data?.successCount || 0
          showSuccess(`成功更新 ${successCount} 個成員角色`)

          // Refresh members list
          await loadProjectGroupMembersInline(pendingUpdateGroup.value.groupId)
          // Refresh group list to update leader/member count
          await loadProjectGroups()

          // Close drawer and clear pending changes
          showBatchUpdateRoleDrawer.value = false
          pendingUpdateMembers.value = []
          pendingUpdateGroup.value = null
          pendingRoleChanges.value.clear()
        }
      } catch (error) {
        console.error('Error batch updating roles:', error)
        handleError(error, { action: '批量更新角色' })
      } finally {
        updatingRoles.value = false
      }
    }

    const cancelBatchUpdateRoles = () => {
      showBatchUpdateRoleDrawer.value = false
      pendingUpdateMembers.value = []
      pendingUpdateGroup.value = null
      updatingRoles.value = false
      pendingRoleChanges.value.clear()
    }

    // ====================================================================
    // VIEWER MANAGEMENT OPERATIONS
    // ====================================================================

    const openViewerManagement = async () => {
      if (!selectedProjectId.value) {
        handleError('請先選擇專案', { type: 'error' })
        return
      }

      // Find the selected project object
      const project = projects.value.find(p => p.projectId === selectedProjectId.value)
      if (!project) {
        handleError('無法找到所選專案', { type: 'error' })
        return
      }

      selectedProjectForViewers.value = project
      showViewerDrawer.value = true
      await loadProjectViewers(selectedProjectId.value)
    }

    const loadProjectViewers = async (projectId) => {
      console.log('🔍 [loadProjectViewers] Starting for projectId:', projectId)
      loadingViewers.value = true
      try {
        const httpResponse = await rpcClient.projects.viewers.list.$post({
          json: { projectId }
        })
        const response = await httpResponse.json()
        console.log('🔍 [loadProjectViewers] API response:', response)

        if (response.success && response.data) {
          projectViewers.value = response.data
          console.log('✅ [loadProjectViewers] Loaded viewers:', projectViewers.value)
        } else {
          console.error('❌ [loadProjectViewers] Failed to load:', response.error)
          projectViewers.value = []
          handleError(`無法載入存取者清單: ${response.error?.message || '未知錯誤'}`, { type: 'error' })
        }
      } catch (error) {
        console.error('❌ [loadProjectViewers] Exception:', error)
        projectViewers.value = []
        handleError(error, { action: '載入存取者清單' })
      } finally {
        loadingViewers.value = false
        console.log('🔍 [loadProjectViewers] Final projectViewers:', projectViewers.value)
      }
    }

    const searchUsers = async (payload) => {
      const searchText = payload?.searchText || payload || ''

      if (!searchText.trim()) {
        handleError('請輸入搜尋內容', { type: 'error' })
        return
      }

      try {
        searchingUsers.value = true

        // Split search text by lines for batch searching
        const searchQueries = searchText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)

        if (searchQueries.length === 0) {
          handleError('請輸入搜尋內容', { type: 'error' })
          searchingUsers.value = false
          return
        }

        const allResults = []
        const errors = []

        for (const query of searchQueries) {
          try {
            const httpResponse = await rpcClient.users.search.$post({
              json: { query, limit: 50 }
            })
            const response = await httpResponse.json()

            if (response.success && response.data) {
              allResults.push(...response.data)
            } else {
              errors.push(`搜尋「${query}」失敗: ${response.error?.message || '未知錯誤'}`)
            }
          } catch (error) {
            console.error(`Error searching for "${query}":`, error)
            errors.push(`搜尋「${query}」時發生錯誤`)
          }
        }

        // Remove duplicates based on userEmail
        const uniqueResults = []
        const seenEmails = new Set()

        for (const user of allResults) {
          if (!seenEmails.has(user.userEmail)) {
            seenEmails.add(user.userEmail)
            uniqueResults.push(user)
          }
        }

        searchResults.value = uniqueResults
        selectedUsers.value = []

        // Show result messages
        if (uniqueResults.length === 0) {
          if (errors.length > 0) {
            handleError(`搜尋失敗: ${errors.join('; ')}`, { type: 'error' })
          } else {
            ElMessage.info('沒有找到符合的使用者')
          }
        } else {
          if (errors.length > 0) {
            ElMessage.warning(`找到 ${uniqueResults.length} 位使用者，但有部分搜尋失敗`)
          } else {
            showSuccess(`找到 ${uniqueResults.length} 位使用者`)
          }
        }
      } catch (error) {
        console.error('Error searching users:', error)
        searchResults.value = []
        handleError(error, { action: '搜尋使用者' })
      } finally {
        searchingUsers.value = false
      }
    }

    const addSelectedViewers = async (payload) => {
      const users = payload?.users || []

      if (users.length === 0) {
        handleError('請選擇要新增的使用者', { type: 'error' })
        return
      }

      if (!selectedProjectForViewers.value) {
        handleError('未選擇專案', { type: 'error' })
        return
      }

      try {
        loadingViewers.value = true

        // Use batch API instead of individual requests
        const httpResponse = await rpcClient.projects.viewers['add-batch'].$post({
          json: {
            projectId: selectedProjectForViewers.value.projectId,
            viewers: users.map(u => ({
              userEmail: u.userEmail,
              role: u.role
            }))
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const summary = response.data?.summary || {}
          const messages = []

          if (summary.inserted > 0) messages.push(`新增 ${summary.inserted} 位`)
          if (summary.reactivated > 0) messages.push(`重新啟用 ${summary.reactivated} 位`)
          if (summary.updated > 0) messages.push(`更新角色 ${summary.updated} 位`)
          if (summary.unchanged > 0) messages.push(`${summary.unchanged} 位已存在`)

          const hasChanges = summary.inserted > 0 || summary.reactivated > 0 || summary.updated > 0

          if (messages.length > 0) {
            if (hasChanges) {
              showSuccess(messages.join('、'))
            } else {
              ElMessage.info(messages.join('、') + '，無需變更')
            }
          }

          // Reset and reload
          newViewer.searchText = ''
          newViewer.role = 'teacher'
          searchResults.value = []
          selectedUsers.value = []
          await loadProjectViewers(selectedProjectForViewers.value.projectId)
        } else {
          handleError(response.error?.message || '新增存取者失敗', { type: 'error' })
        }
      } catch (error) {
        console.error('Error adding selected viewers:', error)
        handleError(error, { action: '批次新增存取者' })
      } finally {
        loadingViewers.value = false
      }
    }

    const updateViewerRole = async ({ userEmail, newRole }) => {
      if (!selectedProjectForViewers.value) {
        handleError('未選擇專案', { type: 'error' })
        return
      }

      try {
        const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
          json: {
            projectId: selectedProjectForViewers.value.projectId,
            userEmail: userEmail,
            role: newRole
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('角色已更新')
          await loadProjectViewers(selectedProjectForViewers.value.projectId)
        } else {
          handleError(`更新失敗: ${response.error?.message || '未知錯誤'}`, { type: 'error' })
        }
      } catch (error) {
        console.error('Error updating viewer role:', error)
        handleError(error, { action: '更新角色' })
      }
    }

    const removeViewer = async (userEmail) => {
      if (!selectedProjectForViewers.value) {
        handleError('未選擇專案', { type: 'error' })
        return
      }

      try {
        const httpResponse = await rpcClient.projects.viewers.remove.$post({
          json: {
            projectId: selectedProjectForViewers.value.projectId,
            userEmail: userEmail
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          showSuccess('存取者已移除')
          await loadProjectViewers(selectedProjectForViewers.value.projectId)
        } else {
          handleError(`移除失敗: ${response.error?.message || '未知錯誤'}`, { type: 'error' })
        }
      } catch (error) {
        console.error('Error removing viewer:', error)
        handleError(error, { action: '移除存取者' })
      }
    }

    const batchUpdateRoles = async () => {
      if (selectedViewers.value.length === 0) {
        handleError('請選擇要更新的存取者', { type: 'error' })
        return
      }

      if (!batchRole.value) {
        handleError('請選擇目標角色', { type: 'error' })
        return
      }

      if (!selectedProjectForViewers.value) {
        handleError('未選擇專案', { type: 'error' })
        return
      }

      try {
        loadingViewers.value = true

        // Use batch API for better performance
        const httpResponse = await rpcClient.projects.viewers['update-roles-batch'].$post({
          json: {
            projectId: selectedProjectForViewers.value.projectId,
            userEmails: selectedViewers.value,
            role: batchRole.value
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const { updated, unchanged, notFound } = response.data
          const messages = []
          if (updated > 0) messages.push(`成功轉換 ${updated} 位`)
          if (unchanged > 0) messages.push(`${unchanged} 位角色未變`)
          if (notFound > 0) messages.push(`${notFound} 位不存在`)

          if (updated > 0 || unchanged > 0) {
            showSuccess(messages.join('，'))
          } else {
            handleError(messages.join('，'), { type: 'error' })
          }

          // Reset and reload
          selectedViewers.value = []
          batchRole.value = ''
          await loadProjectViewers(selectedProjectForViewers.value.projectId)
        } else {
          handleError(response.error?.message || '批量轉換失敗', { type: 'error' })
        }
      } catch (error) {
        console.error('Error batch updating roles:', error)
        handleError(error, { action: '批次轉換角色' })
      } finally {
        loadingViewers.value = false
      }
    }

    const batchRemoveViewers = async () => {
      if (selectedViewers.value.length === 0) {
        handleError('請選擇要刪除的存取者', { type: 'error' })
        return
      }

      if (!selectedProjectForViewers.value) {
        handleError('未選擇專案', { type: 'error' })
        return
      }

      try {
        loadingViewers.value = true

        // Use batch API for better performance
        const httpResponse = await rpcClient.projects.viewers['remove-batch'].$post({
          json: {
            projectId: selectedProjectForViewers.value.projectId,
            userEmails: selectedViewers.value
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const { removed, notFound } = response.data
          const messages = []
          if (removed > 0) messages.push(`成功刪除 ${removed} 位`)
          if (notFound > 0) messages.push(`${notFound} 位不存在`)

          if (removed > 0) {
            showSuccess(messages.join('，'))
          } else {
            handleError(messages.join('，'), { type: 'error' })
          }

          // Reset and reload
          selectedViewers.value = []
          await loadProjectViewers(selectedProjectForViewers.value.projectId)
        } else {
          handleError(response.error?.message || '批量刪除失敗', { type: 'error' })
        }
      } catch (error) {
        console.error('Error batch removing viewers:', error)
        handleError(error, { action: '批次刪除存取者' })
      } finally {
        loadingViewers.value = false
      }
    }

    // ====================================================================
    // REFRESH & LIFECYCLE
    // ====================================================================

    const refreshGroups = () => {
      if (activeTab.value === 'global') {
        loadGlobalGroups()
      } else {
        loadProjectGroups()
      }
    }

    const loadProjects = async () => {
      try {
        loadingProjectsList.value = true
        const httpResponse = await rpcClient.projects.list.$post({
          json: {}
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          // API returns { projects, totalCount, limit, offset }
          projects.value = response.data.projects || response.data
        }
      } catch (error) {
        console.error('Error loading projects:', error)
        handleError(error, { action: '載入專案清單' })
      } finally {
        loadingProjectsList.value = false
      }
    }

    onMounted(async () => {
      if (activeTab.value === 'global') {
        await loadGlobalGroups()
        await loadAllUsersForGlobal()
      } else {
        await loadProjects()
        if (selectedProjectId.value) {
          await loadProjectGroups()
          await loadAllUsers()
        }
      }

      // Register refresh function with parent SystemAdmin
      registerRefresh(refreshGroups)
    })

    onBeforeUnmount(() => {
      // Cleanup: unregister refresh and action functions
      registerRefresh(null)
      registerAction(null)
    })

    watch(activeTab, async (newTab) => {
      // Clear search and filters when switching tabs
      searchText.value = ''
      statusFilter.value = ''
      selectedProjectGroups.clear()
      selectedGlobalGroups.clear()

      if (newTab === 'global') {
        await loadGlobalGroups()
        await loadAllUsersForGlobal()
      } else {
        await loadProjects()
      }
    })

    // Register action function based on active tab
    watch(activeTab, (newTab) => {
      if (newTab === 'global') {
        registerAction(createGlobalGroup)
      } else if (newTab === 'project') {
        registerAction(openBatchCreateDrawer)
      } else {
        registerAction(null)
      }
    }, { immediate: true })

    // Watch showInactive toggle - reload groups when changed
    watch(showInactive, async () => {
      if (activeTab.value === 'project' && selectedProjectId.value) {
        await loadProjectGroups()
      }
    })

    // Watch route params for browser back/forward navigation
    watch(() => route.params.projectId, async (newProjectId) => {
      if (activeTab.value === 'project' && newProjectId !== selectedProjectId.value) {
        const projectId = (typeof newProjectId === 'string' ? newProjectId : '') || ''
        selectedProjectId.value = projectId

        // Clear previous state
        groups.value = []
        expandedProjectGroups.clear()
        projectGroupMembersMap.clear()
        selectedProjectGroups.clear()
        addingMemberForProjectGroup.value = null
        ungroupedMembers.value = []

        if (projectId) {
          await loadProjectGroups()
          await loadAllUsers()
        } else {
          allUsers.value = []
        }
      }
    })

    return {
      // Computed
      activeTab,
      stats,
      expandedProjectGroupId,
      expandedGlobalGroupId,

      // Data
      projects,
      groups,
      globalGroups,
      selectedProjectId,
      searchText,
      statusFilter,
      showInactive,
      showEditModal,
      showGlobalGroupModal,
      showProjectGroupEditorDrawer,
      showBatchCreateDrawer,
      selectedGroup,
      updating,
      addingMember,
      removingMember,
      removingMemberEmail,
      loading,
      loadingProjectsList,
      savingGlobalGroup,
      editingGroupData,
      updatingGroupId,
      creatingBatchGroups,
      selectedUsersToAdd,
      allUsers,
      ungroupedMembers,
      loadingUngroupedMembers,
      expandedProjectGroups,
      expandedGlobalGroups,
      projectGroupMembersMap,
      globalGroupMembersMap,
      loadingProjectGroupMembers,
      loadingGlobalGroupMembers,
      addingMemberForProjectGroup,
      addingMemberForGlobalGroup,
      selectedProjectGroups,
      selectedGlobalGroups,
      editForm,
      memberForm,
      globalGroupForm,
      projectGroupForm,
      availablePermissions,
      showRemoveMemberDrawer,
      pendingRemoveMembers,
      pendingRemoveGroup,
      removingMembers,
      showDeactivateDrawer,
      pendingDeactivateGroup,
      deactivatingGroup,
      showBatchUpdateRoleDrawer,
      pendingUpdateMembers,
      pendingUpdateGroup,
      updatingRoles,
      updatingMemberEmail,
      pendingRoleChanges,

      // Methods
      handleProjectChange,
      editGroup,
      updateGroup,
      cancelEditGroup,
      handleEditDrawerClose,
      deactivateGroup,
      confirmDeactivateGroup,
      cancelDeactivateGroup,
      activateGroup,
      updateGroupAllowChange,
      openBatchCreateDrawer,
      createBatchGroups,
      createProjectGroup,
      saveProjectGroup,
      closeProjectGroupEditor,
      loadGlobalGroups,
      createGlobalGroup,
      editGlobalGroup,
      saveGlobalGroup,
      deactivateGlobalGroup,
      activateGlobalGroup,
      toggleGlobalGroupStatus,
      toggleAllProjectGroups,
      toggleProjectGroupSelection,
      toggleAllGlobalGroups,
      toggleGlobalGroupSelection,
      batchDeactivateProjectGroups,
      batchActivateProjectGroups,
      batchLockProjectGroups,
      batchUnlockProjectGroups,
      batchDeactivateGlobalGroups,
      batchActivateGlobalGroups,
      toggleProjectGroupExpansion,
      toggleGlobalGroupExpansion,
      openProjectAddMemberForm,
      cancelProjectAddMember,
      openGlobalAddMemberForm,
      cancelGlobalAddMember,
      addSelectedMembersToProjectGroup,
      addSelectedMembersToGlobalGroup,
      removeMemberFromProjectGroup,
      removeMemberFromGlobalGroup,
      handleBatchRemoveProjectMembers,
      handleBatchRemoveGlobalMembers,
      confirmRemoveMembers,
      cancelRemoveMembers,
      updateMemberRole,
      handleRoleChangePending,
      handleBatchUpdateRoles,
      confirmBatchUpdateRoles,
      cancelBatchUpdateRoles,
      refreshGroups,

      // Viewer management
      showViewerDrawer,
      loadingViewers,
      projectViewers,
      selectedProjectForViewers,
      searchResults,
      selectedUsers,
      searchingUsers,
      selectedViewers,
      batchRole,
      openViewerManagement,
      loadProjectViewers,
      searchUsers,
      addSelectedViewers,
      updateViewerRole,
      removeViewer,
      batchUpdateRoles,
      batchRemoveViewers
    }
  }
}
</script>

<style scoped>
/* ============================================================================
   MAIN LAYOUT
   ============================================================================ */

.group-management {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

/* ============================================================================
   HEADER
   ============================================================================ */

.mgmt-header {
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
  padding: 24px 32px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(44, 90, 160, 0.3);
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.header-left h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 i {
  font-size: 32px;
}

.header-right {
  display: flex;
  gap: 12px;
}

/* ============================================================================
   TABS
   ============================================================================ */

.group-tabs {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
  padding: 8px;
}

.custom-tabs {
  display: flex;
  gap: 8px;
}

.tab-item {
  flex: 1;
  padding: 14px 24px;
  text-align: center;
  border-radius: 6px;
  background-color: transparent;
  color: #606266;
  font-weight: 500;
  font-size: 15px;
  text-decoration: none;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  border: 2px solid transparent;
}

.tab-item:hover {
  background-color: #f5f7fa;
  color: #2c5aa0;
}

.tab-item.active {
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(44, 90, 160, 0.3);
  border-color: #2c5aa0;
}

.tab-item i {
  font-size: 18px;
}

/* ============================================================================
   LEGACY MODALS & DRAWERS
   ============================================================================ */

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.modal-body {
  padding: 24px;
}

.detail-row {
  margin-bottom: 16px;
  display: flex;
  gap: 12px;
}

.detail-row label {
  font-weight: 600;
  color: #666;
  min-width: 120px;
}

.detail-row span {
  color: #333;
}

.group-id {
  font-family: 'Courier New', monospace;
  background: #f5f5f5;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.status.active {
  background-color: #e7f5e9;
  color: #52c41a;
}

.status.inactive {
  background-color: #fff1f0;
  color: #ff4d4f;
}

.members-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e8e8e8;
}

.members-section h4 {
  margin: 0 0 16px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 6px;
  font-size: 14px;
}

.member-item i {
  color: #2c5aa0;
}

.member-email {
  flex: 1;
  color: #333;
}

.member-role {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.member-role.leader {
  background-color: #fff7e6;
  color: #fa8c16;
}

.member-role.member {
  background-color: #e6f7ff;
  color: #1890ff;
}

.join-time {
  font-size: 12px;
  color: #999;
}

.modal-actions {
  padding: 16px 24px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Drawer styles */
.drawer-navy :deep(.el-drawer__header) {
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
  margin-bottom: 0;
  padding: 20px 24px;
}

.drawer-navy :deep(.el-drawer__title) {
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.drawer-navy :deep(.el-drawer__close-btn) {
  color: white;
  font-size: 24px;
}

.drawer-body {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.form-section,
.info-card,
.action-card,
.members-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-section h4,
.card-header h4 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.member-count {
  color: #666;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.required {
  color: #ff4d4f;
  margin-left: 4px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
  border-top: 1px solid #e8e8e8;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item label {
  font-size: 13px;
  color: #999;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 16px;
  color: #333;
  font-weight: 600;
}

.font-mono {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.add-member-form {
  display: flex;
  gap: 12px;
  align-items: center;
}

.members-table {
  width: 100%;
  border-collapse: collapse;
}

.members-table th,
.members-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
}

.members-table th {
  background-color: #f5f7fa;
  color: #666;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  font-weight: 500;
  color: #333;
}

.user-email {
  font-size: 13px;
  color: #999;
}

.no-members {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.no-members i {
  font-size: 48px;
  margin-bottom: 16px;
  color: #d9d9d9;
}

.no-members p {
  margin: 0;
  font-size: 16px;
}

/* ============================================================================
   BUTTONS
   ============================================================================ */

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(44, 90, 160, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #f5f7fa;
  color: #606266;
}

.btn-secondary:hover {
  background-color: #e8e8e8;
}

/* ============================================================================
   RESPONSIVE
   ============================================================================ */

@media (max-width: 768px) {
  .mgmt-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .header-left {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .custom-tabs {
    flex-direction: column;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .add-member-form {
    flex-direction: column;
  }
}
</style>
