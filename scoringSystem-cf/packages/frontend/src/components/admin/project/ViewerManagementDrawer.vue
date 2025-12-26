<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    class="viewer-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-users"></i>
          {{ '存取者清單' + (selectedProject ? ' - ' + selectedProject.projectName : '') }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <div class="content-area" v-loading="loadingViewers" element-loading-text="載入存取者清單中...">

        <!-- Collapsible Add Viewer Section -->
        <el-collapse-transition>
          <div v-show="showAddSection" class="add-viewer-section">
            <h4><i class="fas fa-user-plus"></i> 新增存取者</h4>

            <!-- Search Area -->
            <div class="search-users-area">
              <label class="search-label">搜尋使用者</label>
              <el-input
                type="textarea"
                v-model="newViewerSearchText"
                placeholder="輸入使用者的 Email 或顯示名稱（可輸入部分內容）"
                :rows="3"
                class="search-textarea"
              />
              <div class="help-text">支援模糊搜尋，輸入部分 Email 或名稱即可</div>

              <div class="search-actions">
                <el-select v-model="newViewerRole" placeholder="選擇角色" class="viewer-role-select">
                  <el-option label="教師 (可管理專案)" value="teacher" />
                  <el-option label="觀察者 (僅查看)" value="observer" />
                  <el-option label="成員 (可查看與評論)" value="member" />
                </el-select>
                <el-button
                  type="primary"
                  @click="handleSearch"
                  :loading="searchingUsers"
                  :disabled="!newViewerSearchText.trim()"
                >
                  <i class="fas fa-search"></i> 搜尋
                </el-button>
              </div>
            </div>

            <!-- Search Results -->
            <div v-if="searchResults.length > 0" class="search-results">
              <div class="results-header">
                <div class="results-count">
                  <span>找到 {{ searchResults.length }} 位使用者</span>
                </div>
                <div class="results-actions">
                  <el-button
                    size="small"
                    @click="selectAllSearchResults"
                    :disabled="searchResults.length === 0"
                    title="選擇全部搜尋結果"
                  >
                    <i class="fas fa-check-double"></i> 選擇全部
                  </el-button>
                  <el-button
                    size="small"
                    @click="deselectAllSearchResults"
                    :disabled="selectedUsers.length === 0"
                    title="取消所有選擇"
                  >
                    <i class="fas fa-times-circle"></i> 取消選擇全部
                  </el-button>
                </div>
              </div>

              <div class="results-list">
                <div
                  v-for="user in searchResults"
                  :key="user.userEmail"
                  class="search-result-item"
                  :class="{ selected: isUserSelected(user.userEmail) }"
                  @click="toggleUserSelection(user.userEmail)"
                >
                  <el-checkbox
                    :model-value="isUserSelected(user.userEmail)"
                    @change="toggleUserSelection(user.userEmail)"
                    @click.stop
                  />
                  <div class="user-avatar" v-if="user.avatarSeed">
                    <img
                      :src="getAvatarUrl(user)"
                      :alt="user.displayName"
                      @error="handleAvatarError($event, user)"
                    />
                  </div>
                  <div class="user-details">
                    <div class="user-name">{{ user.displayName || user.userEmail }}</div>
                    <div class="user-email">{{ user.userEmail }}</div>
                  </div>
                  <el-select
                    :model-value="getUserRole(user.userEmail)"
                    @change="updateUserRole(user.userEmail, $event)"
                    @click.stop
                    size="small"
                    class="user-role-select"
                  >
                    <el-option label="教師" value="teacher" />
                    <el-option label="觀察者" value="observer" />
                    <el-option label="成員" value="member" />
                  </el-select>
                </div>
              </div>
            </div>

            <div v-else-if="searchingUsers" class="search-status">
              <i class="fas fa-spinner fa-spin"></i> 搜尋中...
            </div>
          </div>
        </el-collapse-transition>

        <!-- Viewers List -->
        <div class="viewers-list-section">
          <div class="viewers-list-header">
            <h4><i class="fas fa-users"></i> 當前存取者 ({{ projectViewers.length }})</h4>

            <!-- Search Box -->
            <div class="viewers-search-box">
              <el-input
                v-model="viewerSearchText"
                placeholder="搜尋 Email 或顯示名稱..."
                clearable
                prefix-icon="Search"
                style="width: 300px; margin-right: 16px;"
              />
            </div>

            <!-- Batch Operations -->
            <div v-if="selectedViewers.length > 0" class="batch-operations">
              <span class="selected-count">已選取 {{ selectedViewers.length }} 位</span>
              <el-select
                v-model="batchRole"
                placeholder="轉換角色"
                size="small"
                class="batch-role-select"
              >
                <el-option label="教師" value="teacher" />
                <el-option label="觀察者" value="observer" />
                <el-option label="成員" value="member" />
              </el-select>
              <el-popconfirm
                title="確定要將選取的使用者轉換為此角色嗎？"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="handleBatchUpdateRoles"
              >
                <template #reference>
                  <el-button
                    type="primary"
                    size="small"
                    :disabled="!batchRole"
                  >
                    <i class="fas fa-exchange-alt"></i> 轉換角色
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                title="確定要刪除選取的存取者嗎？此操作無法復原！"
                confirm-button-text="確定刪除"
                cancel-button-text="取消"
                @confirm="handleBatchRemove"
              >
                <template #reference>
                  <el-button
                    type="danger"
                    size="small"
                  >
                    <i class="fas fa-trash"></i> 批次刪除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>

          <EmptyState
            v-if="filteredViewers.length === 0"
            parent-icon="fa-eye"
            :icons="['fas fa-user-shield', 'fas fa-eye-slash']"
            :title="viewerSearchText ? '沒有找到符合條件的存取者' : '此專案尚無存取者'"
            :compact="true"
          />
          <div v-else class="viewers-table">
            <table class="viewer-table">
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <el-checkbox
                      :model-value="selectedViewers.length === filteredViewers.length && filteredViewers.length > 0"
                      :indeterminate="selectedViewers.length > 0 && selectedViewers.length < filteredViewers.length"
                      @change="toggleAllViewers"
                    />
                  </th>
                  <th @click="handleSort('displayName')" class="sortable-header">
                    使用者
                    <i
                      class="fas sort-icon"
                      :class="getSortIcon('displayName')"
                    ></i>
                  </th>
                  <th @click="handleSort('userEmail')" class="sortable-header">
                    Email
                    <i
                      class="fas sort-icon"
                      :class="getSortIcon('userEmail')"
                    ></i>
                  </th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="viewer in filteredViewers" :key="viewer.userEmail">
                  <td class="checkbox-col">
                    <el-checkbox
                      :model-value="selectedViewers.includes(viewer.userEmail)"
                      @change="toggleViewerSelection(viewer.userEmail)"
                    />
                  </td>
                  <td>
                    <div class="user-info">
                      <div class="user-avatar" v-if="viewer.avatarSeed">
                        <img
                          :src="getAvatarUrl(viewer)"
                          :alt="viewer.displayName"
                          @error="handleAvatarError($event, viewer)"
                        />
                      </div>
                      <span class="user-name">{{ viewer.displayName || viewer.userEmail }}</span>
                    </div>
                  </td>
                  <td>{{ viewer.userEmail }}</td>
                  <td class="viewer-actions">
                    <el-select
                      :model-value="viewer.role"
                      @change="(newRole) => handleUpdateRole(viewer.userEmail, newRole)"
                      size="small"
                      class="role-select-inline"
                    >
                      <el-option label="教師" value="teacher" />
                      <el-option label="觀察者" value="observer" />
                      <el-option label="成員" value="member" />
                    </el-select>
                    <!-- Unassigned marker for members -->
                    <el-tag
                      v-if="isUngrouped(viewer.userEmail) && viewer.role === 'member'"
                      size="small"
                      style="margin-left: 8px; background-color: #8B0000; color: white;"
                    >
                      未分組
                    </el-tag>
                    <el-popconfirm
                      title="確定要移除此存取者嗎？"
                      confirm-button-text="確定"
                      cancel-button-text="取消"
                      @confirm="handleRemove(viewer.userEmail)"
                    >
                      <template #reference>
                        <el-button type="danger" size="small">
                          <i class="fas fa-trash"></i> 移除
                        </el-button>
                      </template>
                    </el-popconfirm>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Fixed drawer actions -->
      <div class="drawer-actions">
        <el-button
          type="info"
          size="large"
          @click="showAddSection = !showAddSection"
        >
          <i :class="showAddSection ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
          {{ showAddSection ? '收起新增區' : '展開新增區' }}
        </el-button>

        <el-badge
          :value="selectedUsers.length"
          :hidden="selectedUsers.length === 0"
        >
          <el-button
            type="success"
            size="large"
            @click="handleAddSelected"
            :disabled="selectedUsers.length === 0"
          >
            <i class="fas fa-user-plus"></i> 新增選取的使用者
          </el-button>
        </el-badge>

        <el-badge
          :value="ungroupedCount"
          :hidden="ungroupedCount === 0"
          type="warning"
        >
          <el-button
            type="warning"
            size="large"
            @click="handleMarkUnassigned"
            :loading="markingUnassigned"
          >
            <i class="fas fa-exclamation-triangle"></i> 標記未分組成員
          </el-button>
        </el-badge>

        <el-button size="large" @click="localVisible = false">
          關閉
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { handleError } from '@/utils/errorHandler'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { getAvatarUrl, generateInitialsAvatar } from '@/utils/avatar'
import EmptyState from '@/components/shared/EmptyState.vue'

export default {
  name: 'ViewerManagementDrawer',
  components: {
    EmptyState
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    selectedProject: {
      type: Object,
      default: null
    },
    projectViewers: {
      type: Array,
      default: () => []
    },
    searchResults: {
      type: Array,
      default: () => []
    },
    loadingViewers: {
      type: Boolean,
      default: false
    },
    searchingUsers: {
      type: Boolean,
      default: false
    }
  },
  emits: [
    'update:visible',
    'search',
    'add-selected',
    'update-role',
    'remove',
    'batch-update-roles',
    'batch-remove'
  ],
  setup(props, { emit }) {
    // Drawer Breadcrumb
    const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

    // Two-way binding for visibility
    const localVisible = computed({
      get: () => props.visible,
      set: (val) => emit('update:visible', val)
    })

    // Search state
    const newViewerSearchText = ref('')
    const newViewerRole = ref('observer')
    const selectedUsers = ref([])

    // Viewer list state
    const viewerSearchText = ref('')
    const selectedViewers = ref([])
    const batchRole = ref('')

    // Sorting state
    const sortBy = ref('displayName')
    const sortOrder = ref('asc')

    // Collapsible add section
    const showAddSection = ref(false)

    // Unassigned members state
    const ungroupedMembers = ref([])
    const markingUnassigned = ref(false)

    // Filtered viewers
    const filteredViewers = computed(() => {
      let viewers = [...props.projectViewers]

      // Filter by search text
      if (viewerSearchText.value) {
        const searchLower = viewerSearchText.value.toLowerCase()
        viewers = viewers.filter(v =>
          (v.displayName && v.displayName.toLowerCase().includes(searchLower)) ||
          (v.userEmail && v.userEmail.toLowerCase().includes(searchLower))
        )
      }

      // Sort
      viewers.sort((a, b) => {
        let aVal = a[sortBy.value] || ''
        let bVal = b[sortBy.value] || ''

        if (typeof aVal === 'string') aVal = aVal.toLowerCase()
        if (typeof bVal === 'string') bVal = bVal.toLowerCase()

        if (sortOrder.value === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
        }
      })

      return viewers
    })

    // Unassigned count
    const ungroupedCount = computed(() => ungroupedMembers.value.length)

    // Methods
    const isUserSelected = (userEmail) => {
      return selectedUsers.value.findIndex(u => u.userEmail === userEmail) > -1
    }

    const toggleUserSelection = (userEmail) => {
      const index = selectedUsers.value.findIndex(u => u.userEmail === userEmail)
      if (index > -1) {
        selectedUsers.value.splice(index, 1)
      } else {
        selectedUsers.value.push({
          userEmail: userEmail,
          role: newViewerRole.value  // Use default role from search
        })
      }
    }

    const getUserRole = (userEmail) => {
      const user = selectedUsers.value.find(u => u.userEmail === userEmail)
      return user?.role || newViewerRole.value
    }

    const updateUserRole = (userEmail, newRole) => {
      const index = selectedUsers.value.findIndex(u => u.userEmail === userEmail)
      if (index > -1) {
        // Replace the entire object to trigger Vue 3 reactivity
        selectedUsers.value[index] = {
          ...selectedUsers.value[index],
          role: newRole
        }
      } else {
        // If user not selected yet, select them with the new role
        selectedUsers.value.push({
          userEmail: userEmail,
          role: newRole
        })
      }
    }

    const selectAllSearchResults = () => {
      props.searchResults.forEach(user => {
        if (!isUserSelected(user.userEmail)) {
          selectedUsers.value.push({
            userEmail: user.userEmail,
            role: newViewerRole.value  // Use default role from dropdown
          })
        }
      })
    }

    const deselectAllSearchResults = () => {
      selectedUsers.value = []
    }

    const toggleViewerSelection = (userEmail) => {
      const index = selectedViewers.value.indexOf(userEmail)
      if (index > -1) {
        selectedViewers.value.splice(index, 1)
      } else {
        selectedViewers.value.push(userEmail)
      }
    }

    const toggleAllViewers = () => {
      if (selectedViewers.value.length === filteredViewers.value.length) {
        selectedViewers.value = []
      } else {
        selectedViewers.value = filteredViewers.value.map(v => v.userEmail)
      }
    }

    const handleSearch = () => {
      emit('search', {
        searchText: newViewerSearchText.value,
        role: newViewerRole.value
      })
    }

    const handleAddSelected = () => {
      emit('add-selected', {
        users: selectedUsers.value,
        role: newViewerRole.value
      })
      selectedUsers.value = []
    }

    const handleUpdateRole = (userEmail, newRole) => {
      emit('update-role', { userEmail, newRole })
    }

    const handleRemove = (userEmail) => {
      emit('remove', userEmail)
    }

    const handleBatchUpdateRoles = () => {
      emit('batch-update-roles', {
        users: selectedViewers.value,
        newRole: batchRole.value
      })
      selectedViewers.value = []
      batchRole.value = ''
    }

    const handleBatchRemove = () => {
      emit('batch-remove', selectedViewers.value)
      selectedViewers.value = []
    }

    const handleSort = (field) => {
      if (sortBy.value === field) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
      } else {
        sortBy.value = field
        sortOrder.value = 'asc'
      }
    }

    const getSortIcon = (field) => {
      if (sortBy.value !== field) return 'fa-sort'
      return sortOrder.value === 'asc' ? 'fa-sort-up' : 'fa-sort-down'
    }

    // Mark unassigned members
    const handleMarkUnassigned = async () => {
      if (!props.selectedProject?.projectId) {
        ElMessage.error('請先選擇專案')
        return
      }

      markingUnassigned.value = true
      try {
        const response = await rpcClient.projects.viewers['mark-unassigned'].$post({
          json: { projectId: props.selectedProject.projectId }
        })

        if (response.ok) {
          const data = await response.json()
          ungroupedMembers.value = data.data?.ungroupedMemberEmails || []
          ElMessage.success(`找到 ${ungroupedMembers.value.length} 位未分組成員`)
        }
      } catch (error) {
        handleError(error, { action: '標記未分組成員' })
      } finally {
        markingUnassigned.value = false
      }
    }

    // Check if user is ungrouped
    const isUngrouped = (userEmail) => {
      return ungroupedMembers.value.includes(userEmail)
    }

    const handleAvatarError = (event, user) => {
      const img = event.target
      img.src = generateInitialsAvatar(user)
    }

    const getRoleTagType = (role) => {
      const roleTypes = {
        teacher: 'danger',
        observer: 'info',
        member: 'warning'
      }
      return roleTypes[role] || 'info'
    }

    const getRoleLabel = (role) => {
      const roleLabels = {
        teacher: '教師',
        observer: '觀察者',
        member: '成員'
      }
      return roleLabels[role] || role
    }

    // Watch for drawer close to reset state
    watch(localVisible, (newVal) => {
      if (!newVal) {
        newViewerSearchText.value = ''
        newViewerRole.value = 'observer'
        selectedUsers.value = []
        viewerSearchText.value = ''
        selectedViewers.value = []
        batchRole.value = ''
        showAddSection.value = false
        ungroupedMembers.value = []
      }
    })

    return {
      // Breadcrumb
      currentPageName,
      currentPageIcon,
      // State
      localVisible,
      newViewerSearchText,
      newViewerRole,
      selectedUsers,
      viewerSearchText,
      selectedViewers,
      batchRole,
      showAddSection,
      ungroupedMembers,
      markingUnassigned,
      filteredViewers,
      ungroupedCount,
      isUserSelected,
      toggleUserSelection,
      getUserRole,
      updateUserRole,
      selectAllSearchResults,
      deselectAllSearchResults,
      toggleViewerSelection,
      toggleAllViewers,
      handleSearch,
      handleAddSelected,
      handleUpdateRole,
      handleRemove,
      handleBatchUpdateRoles,
      handleBatchRemove,
      handleSort,
      getSortIcon,
      handleMarkUnassigned,
      isUngrouped,
      getAvatarUrl,
      handleAvatarError,
      getRoleTagType,
      getRoleLabel
    }
  }
}
</script>

<style scoped>
/* Drawer Body */
.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Badge 樣式 */
.el-badge {
  display: inline-block;
}

.add-viewer-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.add-viewer-section h4 {
  margin-bottom: 15px;
  color: #2c3e50;
}

.search-users-area {
  margin-bottom: 20px;
}

.search-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #606266;
}

.search-textarea {
  margin-bottom: 8px;
}

.help-text {
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
}

.search-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.viewer-role-select {
  width: 200px;
}

.search-results {
  margin-top: 20px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 10px;
  background: white;
  border-radius: 4px;
  gap: 12px;
}

.results-count {
  flex-shrink: 0;
}

.results-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-result-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.search-result-item.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.user-role-select {
  width: 140px;
  flex-shrink: 0;
  margin-left: auto;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-details {
  flex: 1;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
}

.user-email {
  font-size: 12px;
  color: #909399;
}

.search-status {
  text-align: center;
  padding: 20px;
  color: #909399;
}

.viewers-list-section {
  margin-top: 20px;
}

.viewers-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.viewers-list-header h4 {
  margin: 0;
  color: #2c3e50;
}

.batch-operations {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-count {
  font-weight: 500;
  color: #409eff;
}

.batch-role-select {
  width: 120px;
}

.viewers-table {
  overflow-x: auto;
}

.viewer-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.viewer-table thead {
  background: #f5f7fa;
}

.viewer-table th,
.viewer-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.viewer-table th {
  font-weight: 500;
  color: #606266;
}

.sortable-header {
  cursor: pointer;
  user-select: none;
}

.sortable-header:hover {
  background: #e8eaed;
}

.sort-icon {
  margin-left: 5px;
  font-size: 12px;
  color: #909399;
}

.checkbox-col {
  width: 50px;
  text-align: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.viewer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.role-select-inline {
  width: 120px;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */
</style>
