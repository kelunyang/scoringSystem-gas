<template>
  <div class="group-management">
    <!-- Header with Actions -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-layer-group"></i> 群組管理</h2>
        <div class="group-stats">
          <span class="stat-item">
            <i class="fas fa-check-circle"></i>
            活躍群組: {{ stats.activeGroups }}
          </span>
          <span class="stat-item">
            <i class="fas fa-times-circle"></i>
            停用群組: {{ stats.inactiveGroups }}
          </span>
          <span class="stat-item">
            <i class="fas fa-layer-group"></i>
            總群組: {{ stats.totalGroups }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <el-button type="default" @click="refreshGroups">
          <i class="fas fa-sync"></i>
          重新整理
        </el-button>
      </div>
    </div>

    <!-- Group Type Tabs -->
    <div class="group-tabs">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全域群組" name="global">
          <template #label>
            <span><i class="fas fa-globe"></i> 全域群組</span>
          </template>
        </el-tab-pane>
        <el-tab-pane label="專案群組" name="project">
          <template #label>
            <span><i class="fas fa-project-diagram"></i> 專案群組</span>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Project Groups Content -->
    <div v-if="activeTab === 'project'" v-loading="loadingProjectsList" element-loading-text="載入專案清單中...">
      <!-- Project Selection -->
      <div class="project-selector">
        <div class="selector-row">
          <label>選擇專案:</label>
          <el-select v-model="selectedProjectId" @change="loadProjectGroups" placeholder="-- 請選擇專案 --" style="width: 300px">
            <el-option 
              v-for="project in projects" 
              :key="project.projectId" 
              :value="project.projectId"
              :label="project.projectName"
            />
          </el-select>
        </div>
      </div>

      <!-- Project Groups Content -->
      <div v-if="selectedProjectId">
        <!-- Action Bar -->
        <div class="action-bar">
          <div class="left-actions">
            <!-- 專案群組的批量新增 -->
            <div class="batch-create-section">
            <div class="slider-container">
              <label>建立學生分組數量：</label>
              <el-slider
                v-model="batchGroupCount"
                :min="1"
                :max="20"
                show-tooltip
                :format-tooltip="(val) => `${val} 個分組`"
                style="width: 200px; margin: 0 15px;"
              />
              <span class="count-display">{{ batchGroupCount }}</span>
            </div>
            <el-button type="primary" @click="createBatchGroups" :disabled="!selectedProjectId || creatingBatchGroups">
              <i :class="creatingBatchGroups ? 'fas fa-spinner fa-spin' : 'fas fa-plus'"></i>
              {{ creatingBatchGroups ? '建立中...' : '批量建立分組' }}
            </el-button>
            </div>
          </div>
          <div class="right-actions">
          <!-- Filters -->
          <input 
            type="text" 
            v-model="searchText" 
            :placeholder="`搜尋${activeTab === 'global' ? '全域' : '專案'}群組名稱`"
            class="search-input"
          >
          <el-select v-model="statusFilter" placeholder="全部狀態" style="width: 120px">
            <el-option label="全部狀態" value="" />
            <el-option label="活躍" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
          </div>
        </div>
      </div>

      <!-- Project Groups Table -->
      <div v-if="activeTab === 'project'" class="table-container" v-loading="loading" element-loading-text="載入專案群組資料中...">
        <table class="group-table">
          <thead>
            <tr>
              <th>群組名稱</th>
              <th>專案角色</th>
              <th>成員數量</th>
              <th>允許成員變更</th>
              <th>狀態</th>
              <th>創建者</th>
              <th>創建時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in filteredGroups" :key="group.groupId">
              <td>
                <div class="group-name">
                  {{ group.groupName }}
                </div>
              </td>
              <td>
                <span v-if="group.projectRole" class="role-badge" :class="group.projectRole">
                  {{ getRoleText(group.projectRole) }}
                </span>
                <span v-else class="no-role">未分配</span>
              </td>
              <td class="member-count">
                <i class="fas fa-users"></i>
                {{ group.memberCount }}
              </td>
              <td>
                <div v-loading="updatingGroupId === group.groupId" element-loading-text="變更中..." element-loading-spinner="el-icon-loading" element-loading-background="rgba(0, 0, 0, 0.3)">
                  <el-switch
                    v-model="group.allowChange"
                    @change="updateGroupAllowChange(group)"
                    active-color="#13ce66"
                    inactive-color="#ff4949"
                    :disabled="updatingGroupId === group.groupId"
                  />
                </div>
              </td>
              <td>
                <span class="status-badge" :class="group.status">
                  <i :class="group.status === 'active' ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
                  {{ group.status === 'active' ? '活躍' : '停用' }}
                </span>
              </td>
              <td>{{ group.createdBy }}</td>
              <td>{{ formatTime(group.createdTime) }}</td>
              <td class="actions">
                <el-button type="primary" size="small" @click="editProjectGroup(group)">
                  <i class="fas fa-edit"></i>
                  編輯
                </el-button>
                <el-button type="warning" size="small" @click="manageProjectGroupMembers(group)">
                  <i class="fas fa-users-cog"></i>
                  成員
                </el-button>
                <el-button 
                  v-if="group.status === 'active'"
                  type="danger" 
                  size="small"
                  @click="deactivateProjectGroup(group)"
                >
                  <i class="fas fa-times"></i>
                  停用
                </el-button>
                <el-button 
                  v-else
                  type="success" 
                  size="small"
                  @click="activateProjectGroup(group)"
                >
                  <i class="fas fa-check"></i>
                  啟用
                </el-button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="filteredGroups.length === 0" class="no-data">
          <i class="fas fa-layer-group"></i>
          <p v-if="activeTab === 'project' && selectedProjectId">
            此專案尚無群組或沒有符合條件的群組
          </p>
          <p v-else-if="activeTab === 'project'">
            請先選擇一個專案來管理其群組
          </p>
          <p v-else>
            沒有找到符合條件的全域群組
          </p>
        </div>
      </div>
    </div>

    <!-- Global Groups Content -->
    <div v-if="activeTab === 'global'">
      <!-- Action Bar for Global Groups -->
      <div class="action-bar">
        <div class="left-actions">
          <el-button type="primary" @click="createGlobalGroup">
            <i class="fas fa-plus"></i>
            新增全域群組
          </el-button>
        </div>
        <div class="right-actions">
          <!-- Filters -->
          <input 
            type="text" 
            v-model="searchText" 
            placeholder="搜尋全域群組名稱"
            class="search-input"
          >
          <el-select v-model="statusFilter" placeholder="全部狀態" style="width: 120px">
            <el-option label="全部狀態" value="" />
            <el-option label="活躍" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
        </div>
      </div>

      <!-- Global Groups Table -->
      <div class="table-container" v-loading="loading" element-loading-text="載入全域群組資料中...">
        <table class="group-table">
          <thead>
            <tr>
              <th>群組名稱</th>
              <th>全域權限</th>
              <th>成員數量</th>
              <th>狀態</th>
              <th>創建時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in filteredGroups" :key="group.groupId">
              <td>
                <div class="group-name">
                  {{ group.groupName }}
                </div>
              </td>
              <td class="permissions">
                <div class="permission-badges">
                  <el-tag 
                    v-for="permission in getGlobalPermissionList(group)" 
                    :key="permission"
                    size="small"
                    type="primary"
                    class="permission-tag"
                  >
                    {{ getPermissionText(permission) }}
                  </el-tag>
                  <span v-if="getGlobalPermissionList(group).length === 0" class="no-permissions">
                    無特殊權限
                  </span>
                </div>
              </td>
              <td class="member-count">
                <i class="fas fa-users"></i>
                {{ group.memberCount || 0 }}
              </td>
              <td>
                <span class="status-badge" :class="group.isActive ? 'active' : 'inactive'">
                  <i :class="group.isActive ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
                  {{ group.isActive ? '活躍' : '停用' }}
                </span>
              </td>
              <td>{{ formatTime(group.createdTime) }}</td>
              <td class="actions">
                <el-button type="primary" size="small" @click="editGlobalGroup(group)">
                  <i class="fas fa-edit"></i>
                  編輯
                </el-button>
                <el-button type="warning" size="small" @click="manageGlobalGroupMembers(group)">
                  <i class="fas fa-users-cog"></i>
                  成員
                </el-button>
                <el-button 
                  v-if="group.isActive"
                  type="danger" 
                  size="small"
                  @click="deactivateGlobalGroup(group)"
                >
                  <i class="fas fa-times"></i>
                  停用
                </el-button>
                <el-button 
                  v-else
                  type="success" 
                  size="small"
                  @click="activateGlobalGroup(group)"
                >
                  <i class="fas fa-check"></i>
                  啟用
                </el-button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="filteredGroups.length === 0" class="no-data">
          <i class="fas fa-layer-group"></i>
          <p>沒有找到符合條件的全域群組</p>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'project' && !selectedProjectId" class="no-project-selected">
      <i class="fas fa-project-diagram"></i>
      <p>請先選擇一個專案來管理其群組</p>
    </div>

    <!-- View Group Modal -->
    <div v-if="showViewModal" class="modal-overlay" @click="showViewModal = false">
      <div class="modal-content large" @click.stop>
        <h3><i class="fas fa-eye"></i> 群組詳情</h3>
        
        <div v-if="selectedGroup" class="group-details">
          <div class="detail-row">
            <label>群組名稱:</label>
            <span>{{ selectedGroup.groupName }}</span>
          </div>
          
          <div class="detail-row">
            <label>群組ID:</label>
            <span class="mono">{{ selectedGroup.groupId }}</span>
          </div>
          
          <div class="detail-row">
            <label>描述:</label>
            <span>{{ selectedGroup.description || '無' }}</span>
          </div>
          
          <div class="detail-row">
            <label>專案角色:</label>
            <span v-if="selectedGroup.projectRole" class="role-badge" :class="selectedGroup.projectRole">
              {{ getRoleText(selectedGroup.projectRole) }}
            </span>
            <span v-else class="no-role">未分配</span>
          </div>
          
          <div class="detail-row">
            <label>權限:</label>
            <div class="permissions">
              <span v-for="permission in selectedGroup.permissions" :key="permission" class="permission-tag">
                {{ getPermissionText(permission) }}
              </span>
              <span v-if="!selectedGroup.permissions || selectedGroup.permissions.length === 0" class="no-permissions">
                無特殊權限
              </span>
            </div>
          </div>
          
          <div class="detail-row">
            <label>狀態:</label>
            <span class="status-badge" :class="selectedGroup.status">
              <i :class="selectedGroup.status === 'active' ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
              {{ selectedGroup.status === 'active' ? '活躍' : '停用' }}
            </span>
          </div>
          
          <div class="detail-row">
            <label>允許變更:</label>
            <span :class="selectedGroup.allowChange ? 'text-success' : 'text-warning'">
              <i :class="selectedGroup.allowChange ? 'fas fa-check' : 'fas fa-lock'"></i>
              {{ selectedGroup.allowChange ? '是' : '否' }}
            </span>
          </div>
          
          <div class="detail-row">
            <label>創建者:</label>
            <span>{{ selectedGroup.createdBy }}</span>
          </div>
          
          <div class="detail-row">
            <label>創建時間:</label>
            <span>{{ formatTime(selectedGroup.createdTime) }}</span>
          </div>
          
          <div class="detail-row">
            <label>成員數量:</label>
            <span>{{ selectedGroup.memberCount }}</span>
          </div>

          <!-- Group Members -->
          <div v-if="selectedGroup.members && selectedGroup.members.length > 0" class="members-section">
            <h4>群組成員</h4>
            <div class="members-list">
              <div v-for="member in selectedGroup.members" :key="member.membershipId" class="member-item">
                <i class="fas fa-user"></i>
                <span class="member-email">{{ member.userEmail }}</span>
                <span class="member-role" :class="member.role">{{ member.role === 'leader' ? '組長' : '成員' }}</span>
                <span class="join-time">{{ formatTime(member.joinTime) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showViewModal = false">
            關閉
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Group Drawer -->
    <el-drawer
      v-model="showEditModal"
      title="編輯群組"
      direction="btt"
      size="100%"
      :before-close="handleEditDrawerClose"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-edit"></i> 編輯群組</h3>
      </template>
      
      <div class="drawer-body" v-loading="editingGroupData" element-loading-text="載入群組資料中...">
        <div class="form-section">
          <h4><i class="fas fa-layer-group"></i> 群組基本資訊</h4>
          
          <div class="form-group">
            <label>群組名稱 <span class="required">*</span></label>
            <el-input v-model="editForm.groupName" placeholder="輸入群組名稱" />
          </div>
          
          <div class="form-group">
            <label>描述</label>
            <el-input 
              type="textarea" 
              v-model="editForm.description" 
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
          <button class="btn-primary" @click="updateGroup" :disabled="updating || editingGroupData">
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

    <!-- Manage Members Drawer -->
    <el-drawer
      v-model="showMembersModal"
      title="管理群組成員"
      direction="btt"
      size="100%"
      :before-close="handleMembersDrawerClose"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-users-cog"></i> 管理群組成員</h3>
      </template>
      
      <div class="drawer-body" v-loading="loadingMembersData" element-loading-text="載入成員資料中...">
        <!-- Group Information Card -->
        <div class="info-card">
          <div class="card-header">
            <h4><i class="fas fa-layer-group"></i> 群組資訊</h4>
          </div>
          <div class="card-content">
            <div class="info-grid">
              <div class="info-item">
                <label>群組名稱</label>
                <div class="info-value">{{ selectedGroup?.groupName }}</div>
              </div>
              <div class="info-item">
                <label>群組ID</label>
                <div class="info-value mono">{{ selectedGroup?.groupId }}</div>
              </div>
              <div class="info-item">
                <label>成員數量</label>
                <div class="info-value">
                  <i class="fas fa-users"></i>
                  {{ selectedGroup?.memberCount || 0 }} 人
                </div>
              </div>
              <div class="info-item">
                <label>狀態</label>
                <div class="info-value">
                  <el-tag :type="selectedGroup?.status === 'active' ? 'success' : 'info'" size="small">
                    {{ selectedGroup?.status === 'active' ? '活躍' : '停用' }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Add Member Form -->
        <div class="form-card">
          <div class="card-header">
            <h4><i class="fas fa-user-plus"></i> 新增成員</h4>
          </div>
          <div class="card-content">
          
          <!-- User Search and Selection -->
          <div class="form-group">
            <label>搜尋並選擇用戶</label>
            <el-select
              v-model="selectedUsersToAdd"
              multiple
              filterable
              remote
              reserve-keyword
              placeholder="輸入用戶名稱或email進行搜尋..."
              :remote-method="searchUsers"
              :loading="searchingUsers"
              style="width: 100%;"
            >
              <el-option
                v-for="user in availableUsers"
                :key="user.userEmail"
                :label="`${user.displayName || user.username} (${user.userEmail})`"
                :value="user.userEmail"
                :disabled="isUserAlreadyMember(user.userEmail)"
              >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 500;">{{ user.displayName || user.username }}</div>
                    <div style="font-size: 12px; color: #909399;">{{ user.userEmail }}</div>
                  </div>
                  <div v-if="isUserAlreadyMember(user.userEmail)" style="color: #909399; font-size: 12px;">
                    已是成員
                  </div>
                </div>
              </el-option>
            </el-select>
          </div>
          
          <!-- Selected Users Display -->
          <div v-if="selectedUsersToAdd.length > 0" class="form-group">
            <label>已選擇的用戶 ({{ selectedUsersToAdd.length }})</label>
            <div class="selected-tags-display">
              <el-tag
                v-for="userEmail in selectedUsersToAdd"
                :key="userEmail"
                closable
                @close="removeSelectedUser(userEmail)"
                type="primary"
                effect="dark"
                style="margin: 4px;"
              >
                {{ userEmail }}
              </el-tag>
            </div>
          </div>
          
          <!-- Role Selection for Selected Users -->
          <div v-if="selectedUsersToAdd.length > 0" class="form-group">
            <label>為選中用戶分配角色</label>
            <el-select v-model="memberForm.role" placeholder="選擇角色" style="width: 100%;">
              <el-option label="成員" value="member" />
              <el-option label="組長" value="leader" />
            </el-select>
          </div>
          
          <div class="form-actions">
            <button 
              class="btn-primary" 
              @click="addSelectedMembers" 
              :disabled="addingMember || selectedUsersToAdd.length === 0"
            >
              <i class="fas fa-plus"></i>
              {{ addingMember ? '新增中...' : `新增 ${selectedUsersToAdd.length} 個成員` }}
            </button>
            <button 
              v-if="selectedUsersToAdd.length > 0"
              class="btn-secondary" 
              @click="clearSelectedUsers"
            >
              <i class="fas fa-times"></i>
              清除選擇
            </button>
          </div>
          </div>
        </div>
        
        <!-- Current Members -->
        <div class="members-card">
          <div class="card-header">
            <h4><i class="fas fa-users"></i> 現有成員</h4>
          </div>
          <div class="card-content">
          <div v-if="selectedGroup?.members && selectedGroup.members.length > 0" class="members-table">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>角色</th>
                  <th>加入時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in selectedGroup.members" :key="member.membershipId">
                  <td>{{ member.userEmail }}</td>
                  <td>
                    <span class="member-role" :class="member.role">
                      {{ member.role === 'leader' ? '組長' : '成員' }}
                    </span>
                  </td>
                  <td>{{ formatTime(member.joinTime) }}</td>
                  <td>
                    <button class="btn-sm btn-danger" @click="removeMember(member)" :disabled="removingMember">
                      <i class="fas fa-times"></i>
                      移除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="no-members">
            <el-empty description="此群組目前沒有成員" />
          </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- Global Group Modal -->
    <div v-if="showGlobalGroupModal" class="modal-overlay" @click="showGlobalGroupModal = false">
      <div class="modal-content large" @click.stop>
        <h3>
          <i class="fas fa-globe"></i> 
          {{ globalGroupForm.groupId ? '編輯全域群組' : '新增全域群組' }}
        </h3>
        
        <div class="form-group">
          <label>群組名稱 *</label>
          <input type="text" v-model="globalGroupForm.groupName" class="form-input">
        </div>
        
        <div class="form-group">
          <label>描述</label>
          <textarea v-model="globalGroupForm.description" class="form-textarea" rows="3"></textarea>
        </div>
        
        <div class="form-group">
          <label>全域權限</label>
          <el-transfer
            v-model="globalGroupForm.globalPermissions"
            :data="availablePermissions"
            :titles="['可用權限', '已授權']"
            :button-texts="['移除', '添加']"
            :props="{
              key: 'key',
              label: 'label'
            }"
            filterable
            filter-placeholder="搜尋權限"
            style="text-align: left; display: inline-block"
          />
        </div>
        
        <div class="modal-actions">
          <button class="btn-primary" @click="saveGlobalGroup" :disabled="savingGlobalGroup">
            <i class="fas fa-save"></i>
            {{ savingGlobalGroup ? '保存中...' : '保存' }}
          </button>
          <button class="btn-secondary" @click="showGlobalGroupModal = false">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- Global Group Members Management Drawer -->
    <el-drawer
      v-model="showMembersDrawer"
      title="管理全域群組成員"
      direction="ttb"
      size="70%"
      :before-close="handleMembersDrawerClose"
    >
      <template #header>
        <div style="color: white;">
          <h3><i class="fas fa-users-cog"></i> 管理全域群組成員</h3>
          <p v-if="selectedGroup">群組：<strong>{{ selectedGroup.groupName }}</strong></p>
        </div>
      </template>
      
      <div class="members-management" v-loading="membersLoading" element-loading-text="載入成員資料中...">
        <!-- Add Users Section -->
        <div class="add-users-section">
          <h4><i class="fas fa-user-plus"></i> 新增成員</h4>
          
          <!-- User Search Input -->
          <div class="user-search">
            <el-input
              v-model="userSearchInput"
              placeholder="輸入使用者名稱或Email搜尋..."
              @keyup.enter="searchUsers"
              @clear="searchedUsers = []"
              clearable
            >
              <template #prefix>
                <i class="fas fa-search"></i>
              </template>
              <template #suffix>
                <el-button 
                  type="primary" 
                  size="small" 
                  @click="searchUsers"
                  :disabled="!userSearchInput || userSearchInput.length < 2"
                  style="margin-right: 8px;"
                >
                  搜尋
                </el-button>
              </template>
            </el-input>
          </div>
          
          <!-- Search Results -->
          <div v-if="searchedUsers.length > 0" class="search-results">
            <h5>搜尋結果</h5>
            <div class="user-list">
              <div 
                v-for="user in searchedUsers" 
                :key="user.userEmail"
                class="user-item"
                :class="{ selected: selectedUsersToAdd.includes(user.userEmail) }"
                @click="toggleUserSelection(user.userEmail)"
              >
                <el-checkbox 
                  :model-value="selectedUsersToAdd.includes(user.userEmail)"
                  @change="toggleUserSelection(user.userEmail)"
                />
                <div class="user-info">
                  <span class="user-name">{{ user.displayName || user.username }}</span>
                  <span class="user-email">{{ user.userEmail }}</span>
                </div>
              </div>
            </div>
            
            <!-- Add Selected Users Button -->
            <div class="add-actions">
              <el-button 
                type="primary" 
                :disabled="selectedUsersToAdd.length === 0"
                @click="addSelectedMembers"
                :loading="addingMember"
              >
                <i class="fas fa-plus"></i>
                新增所選成員 ({{ selectedUsersToAdd.length }})
              </el-button>
            </div>
          </div>
        </div>
        
        <!-- Current Members Section -->
        <div class="current-members-section">
          <div class="section-header">
            <h4><i class="fas fa-users"></i> 當前成員 ({{ groupMembers.length }})</h4>
            
            <!-- Batch Actions -->
            <div class="batch-actions">
              <el-button 
                type="danger" 
                :disabled="selectedMembers.length === 0"
                @click="removeSelectedMembers"
                size="small"
              >
                <i class="fas fa-trash"></i>
                移除所選 ({{ selectedMembers.length }})
              </el-button>
            </div>
          </div>
          
          <!-- Members Table -->
          <div class="members-table-container" v-loading="loadingMembersData" element-loading-text="重新載入成員清單...">
            <table class="members-table">
              <thead>
                <tr>
                  <th style="width: 50px">
                    <el-checkbox 
                      :model-value="selectedMembers.length === groupMembers.length && groupMembers.length > 0"
                      :indeterminate="selectedMembers.length > 0 && selectedMembers.length < groupMembers.length"
                      @change="toggleAllMembers"
                    />
                  </th>
                  <th>成員名稱</th>
                  <th>Email</th>
                  <th>角色</th>
                  <th>加入時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in groupMembers" :key="member.membershipId">
                  <td>
                    <el-checkbox 
                      :model-value="selectedMembers.includes(member.userEmail)"
                      @change="toggleMemberSelection(member.userEmail)"
                    />
                  </td>
                  <td>{{ member.displayName || member.username }}</td>
                  <td>{{ member.userEmail }}</td>
                  <td>
                    <el-tag size="small" :type="member.role === 'admin' ? 'danger' : 'info'">
                      {{ member.role === 'admin' ? '管理員' : '成員' }}
                    </el-tag>
                  </td>
                  <td>{{ formatTime(member.joinTime) }}</td>
                  <td>
                    <el-button 
                      type="danger" 
                      size="small"
                      @click="removeSingleMember(member)"
                      :loading="removingMemberEmail === member.userEmail"
                      :disabled="removingMemberEmail === member.userEmail"
                    >
                      <i v-if="removingMemberEmail !== member.userEmail" class="fas fa-trash"></i>
                      移除
                    </el-button>
                  </td>
                </tr>
              </tbody>
            </table>
            
            <div v-if="groupMembers.length === 0" class="no-members">
              <i class="fas fa-users"></i>
              <p>此群組尚無成員</p>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, getCurrentInstance } from 'vue'

export default {
  name: 'GroupManagement',
  setup() {
    const { proxy } = getCurrentInstance()
    const activeTab = ref('global')
    const projects = ref([])
    const groups = ref([])
    const globalGroups = ref([])
    const selectedProjectId = ref('')
    const searchText = ref('')
    const statusFilter = ref('')
    const roleFilter = ref('')
    const showViewModal = ref(false)
    const showEditModal = ref(false)
    const showMembersModal = ref(false)
    const showGlobalGroupModal = ref(false)
    const showMembersDrawer = ref(false)
    const selectedGroup = ref(null)
    const updating = ref(false)
    const addingMember = ref(false)
    const removingMember = ref(false)
    const removingMemberEmail = ref('') // Track which member is being removed
    const loading = ref(false)
    const loadingProjectsList = ref(false)
    const savingGlobalGroup = ref(false)
    const membersLoading = ref(false)
    const editingGroupData = ref(false)
    const loadingMembersData = ref(false)
    const updatingGroupId = ref(null) // Track which group's allowChange is being updated
    
    // Batch group creation
    const batchGroupCount = ref(5)
    const creatingBatchGroups = ref(false)
    
    // Member management
    const groupMembers = ref([])
    const selectedMembers = ref([])
    const userSearchInput = ref('')
    const searchedUsers = ref([])
    const selectedUsersToAdd = ref([])
    
    // User selection and search
    const allUsers = ref([])
    const availableUsers = ref([])
    const searchingUsers = ref(false)

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
    
    const availablePermissions = [
      { key: 'create_project', label: '建立專案' },
      { key: 'system_admin', label: '系統管理' },
      { key: 'manage_users', label: '管理使用者' },
      { key: 'generate_invites', label: '產生邀請碼' },
      { key: 'view_system_logs', label: '檢視系統日誌' },
      { key: 'manage_global_groups', label: '管理全域群組' },
      { key: 'manage_tags', label: '管理標籤' },
      { key: 'teacher_privilege', label: '教師權限' }
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

    const filteredGroups = computed(() => {
      let filtered = activeTab.value === 'global' ? globalGroups.value : groups.value

      if (searchText.value) {
        const search = searchText.value.toLowerCase()
        filtered = filtered.filter(group => 
          group.groupName.toLowerCase().includes(search)
        )
      }

      if (statusFilter.value) {
        if (activeTab.value === 'global') {
          filtered = filtered.filter(group => 
            statusFilter.value === 'active' ? group.isActive : !group.isActive
          )
        } else {
          filtered = filtered.filter(group => group.status === statusFilter.value)
        }
      }

      if (roleFilter.value && activeTab.value === 'project') {
        filtered = filtered.filter(group => group.projectRole === roleFilter.value)
      }

      return filtered.sort((a, b) => b.createdTime - a.createdTime)
    })

    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW')
    }

    const truncateText = (text, maxLength) => {
      if (!text) return '-'
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }

    const getRoleText = (role) => {
      switch (role) {
        case 'pm': return '專案經理'
        case 'deliverable_team': return '交付團隊'
        case 'reviewer': return '評審員'
        case 'observer': return '觀察者'
        default: return role
      }
    }

    const getPermissionText = (permission) => {
      switch (permission) {
        case 'submit': return '提交'
        case 'vote': return '投票'
        case 'rank': return '排名'
        case 'comment': return '評論'
        case 'manage': return '管理'
        case 'view': return '檢視'
        case 'create_project': return '建立專案'
        case 'system_admin': return '系統管理'
        case 'manage_users': return '管理使用者'
        case 'generate_invites': return '產生邀請碼'
        case 'view_system_logs': return '檢視系統日誌'
        case 'manage_global_groups': return '管理全域群組'
        case 'manage_tags': return '管理標籤'
        default: return permission
      }
    }
    
    const getGlobalPermissionList = (group) => {
      if (!group.globalPermissions) return []
      try {
        return Array.isArray(group.globalPermissions) 
          ? group.globalPermissions 
          : JSON.parse(group.globalPermissions)
      } catch {
        return []
      }
    }

    const loadProjects = async () => {
      try {
        const response = await proxy.$apiClient.callWithAuth('/projects/list')
        
        if (response.success && response.data) {
          projects.value = response.data.filter(project => project.status === 'active')
        } else {
          proxy.$handleError('無法載入專案列表')
          projects.value = []
        }
      } catch (error) {
        console.error('Error loading projects:', error)
        projects.value = []
      } finally {
        loadingProjectsList.value = false
      }
    }

    const loadProjectGroups = async () => {
      if (!selectedProjectId.value) {
        groups.value = []
        return
      }

      loading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        ElMessage.info('開始更新群組列表')
        
        const response = await proxy.$apiClient.getProjectGroups(
          selectedProjectId.value, 
          true // includeInactive
        )
        
        if (response.success && response.data) {
          groups.value = response.data.map(group => ({
            ...group,
            memberCount: group.members ? group.members.length : 0
          }))
          ElMessage.success('群組列表資料下載完成')
        } else {
          proxy.$handleError('無法載入群組列表')
          groups.value = []
        }
      } catch (error) {
        console.error('Error loading groups:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入群組資料失敗，請重試')
        groups.value = []
      } finally {
        loading.value = false
      }
    }

    const refreshGroups = () => {
      if (selectedProjectId.value) {
        loadProjectGroups()
      }
    }

    const viewGroup = async (group) => {
      try {
        const response = await proxy.$apiClient.callWithAuth('/groups/details', {
          projectId: selectedProjectId.value,
          groupId: group.groupId
        })
        
        if (response.success) {
          selectedGroup.value = response.data
          showViewModal.value = true
        } else {
          // 使用基本群組數據作為備用
          selectedGroup.value = group
          showViewModal.value = true
        }
      } catch (error) {
        console.error('Error loading group details:', error)
        selectedGroup.value = group
        showViewModal.value = true
      }
    }

    const editGroup = async (group) => {
      try {
        // Show drawer first
        showEditModal.value = true
        editingGroupData.value = true
        
        // Simulate loading group data
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Load group data
        editForm.groupId = group.groupId
        editForm.groupName = group.groupName
        editForm.description = group.description || ''
        editForm.allowChange = group.allowChange !== false
        
        editingGroupData.value = false
      } catch (error) {
        editingGroupData.value = false
        proxy.$handleError('載入群組資料失敗', error)
        showEditModal.value = false
      }
    }

    const updateGroup = async () => {
      if (!editForm.groupName.trim()) {
        proxy.$handleError('請輸入群組名稱')
        return
      }

      try {
        updating.value = true
        
        const response = await proxy.$apiClient.updateGroup(
          selectedProjectId.value,
          editForm.groupId,
          {
            groupName: editForm.groupName.trim(),
            description: editForm.description.trim(),
            allowChange: editForm.allowChange
          }
        )
        
        if (response.success) {
          proxy.$showSuccess('群組更新成功')
          showEditModal.value = false
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error updating group:', error)
      } finally {
        updating.value = false
      }
    }

    const manageMembers = async (group) => {
      try {
        // Show drawer first
        showMembersModal.value = true
        loadingMembersData.value = true
        
        // Load group data
        await viewGroup(group)
        
        // Load all users with tags for selection
        await loadAllUsers()
        
        // Reset form and selections
        memberForm.userEmail = ''
        memberForm.role = 'member'
        selectedUsersToAdd.value = []
        
        loadingMembersData.value = false
        showViewModal.value = false
      } catch (error) {
        loadingMembersData.value = false
        proxy.$handleError('載入成員資料失敗', error)
        showMembersModal.value = false
      }
    }

    // Load all users with tags
    const loadAllUsers = async () => {
      try {
        const response = await proxy.$apiClient.callWithAuth('/admin/users/list-all')
        if (response.success) {
          allUsers.value = response.data || []
          // Initialize availableUsers with empty array for remote search
          availableUsers.value = []
        }
      } catch (error) {
        console.error('Error loading users:', error)
      }
    }

    // Search users for selection
    const searchUsers = (query) => {
      if (!query || query.length < 2) {
        availableUsers.value = []
        return
      }
      
      searchingUsers.value = true
      
      // Filter users based on search query
      const filtered = allUsers.value.filter(user => {
        const searchText = query.toLowerCase()
        const userName = (user.displayName || user.username || '').toLowerCase()
        const userEmail = (user.userEmail || '').toLowerCase()
        return userName.includes(searchText) || userEmail.includes(searchText)
      })
      
      // Sort by relevance (exact matches first)
      filtered.sort((a, b) => {
        const queryLower = query.toLowerCase()
        const aName = (a.displayName || a.username || '').toLowerCase()
        const bName = (b.displayName || b.username || '').toLowerCase()
        const aEmail = a.userEmail.toLowerCase()
        const bEmail = b.userEmail.toLowerCase()
        
        // Exact matches first
        if (aName === queryLower || aEmail === queryLower) return -1
        if (bName === queryLower || bEmail === queryLower) return 1
        
        // Starts with query
        if (aName.startsWith(queryLower) || aEmail.startsWith(queryLower)) return -1
        if (bName.startsWith(queryLower) || bEmail.startsWith(queryLower)) return 1
        
        return 0
      })
      
      availableUsers.value = filtered.slice(0, 50) // Limit to 50 results
      searchingUsers.value = false
    }

    // Check if user is already a member
    const isUserAlreadyMember = (userEmail) => {
      return selectedGroup.value?.members?.some(member => member.userEmail === userEmail) || false
    }

    // Remove selected user
    const removeSelectedUser = (userEmail) => {
      const index = selectedUsersToAdd.value.indexOf(userEmail)
      if (index > -1) {
        selectedUsersToAdd.value.splice(index, 1)
      }
    }

    // Clear all selected users
    const clearSelectedUsers = () => {
      selectedUsersToAdd.value = []
    }

    // Toggle user selection for adding to group
    const toggleUserSelection = (userEmail) => {
      const index = selectedUsersToAdd.value.indexOf(userEmail)
      if (index > -1) {
        selectedUsersToAdd.value.splice(index, 1)
      } else {
        selectedUsersToAdd.value.push(userEmail)
      }
    }

    // Add selected members to group
    const addSelectedMembers = async () => {
      if (selectedUsersToAdd.value.length === 0) {
        proxy.$handleError('請先選擇要新增的用戶')
        return
      }

      try {
        addingMember.value = true
        
        if (activeTab.value === 'global') {
          // Global group: use batch add API
          const response = await proxy.$apiClient.callWithAuth('/admin/global-groups/batch-add-users', {
            groupId: selectedGroup.value.groupId,
            userEmails: selectedUsersToAdd.value
          })
          
          if (response.success && response.data) {
            const { successCount } = response.data
            proxy.$showSuccess(`成功新增 ${successCount} 個成員`)
            
            // Clear selections
            selectedUsersToAdd.value = []
            
            // Reload group members for global group
            await loadGroupMembers(selectedGroup.value.groupId)
          } else {
            proxy.$handleError('新增成員失敗')
          }
        } else {
          // Project group: add members one by one
          let successCount = 0
          let errorCount = 0
          
          for (const userEmail of selectedUsersToAdd.value) {
            try {
              const response = await proxy.$apiClient.callWithAuth('/groups/add-member', {
                projectId: selectedProjectId.value,
                groupId: selectedGroup.value.groupId,
                userEmail: userEmail,
                role: memberForm.role
              })
              
              if (response.success) {
                successCount++
              } else {
                errorCount++
              }
            } catch (error) {
              errorCount++
              console.error(`Error adding member ${userEmail}:`, error)
            }
          }
          
          if (successCount > 0) {
            proxy.$showSuccess(`成功新增 ${successCount} 個成員`)
            
            // Clear selections
            selectedUsersToAdd.value = []
            memberForm.role = 'member'
            
            // Set loading state for member list refresh
            loadingMembersData.value = true
            
            // Reload group details
            await viewGroup(selectedGroup.value)
            
            // Reset loading state
            loadingMembersData.value = false
            showViewModal.value = false
            showMembersModal.value = true
          }
          
          if (errorCount > 0) {
            proxy.$handleError(`${errorCount} 個成員新增失敗`)
          }
        }
        
      } catch (error) {
        console.error('Error adding members:', error)
        proxy.$handleError('新增成員時發生錯誤')
      } finally {
        addingMember.value = false
      }
    }

    const addMember = async () => {
      if (!memberForm.userEmail.trim()) {
        proxy.$handleError('請輸入用戶email')
        return
      }

      try {
        addingMember.value = true
        
        const response = await proxy.$apiClient.callWithAuth('/groups/add-member', {
          projectId: selectedProjectId.value,
          groupId: selectedGroup.value.groupId,
          userEmail: memberForm.userEmail.trim(),
          role: memberForm.role
        })
        
        if (response.success) {
          proxy.$showSuccess('成員新增成功')
          memberForm.userEmail = ''
          
          // Set loading state for member list refresh
          loadingMembersData.value = true
          
          // Reload group details
          await viewGroup(selectedGroup.value)
          
          // Reset loading state
          loadingMembersData.value = false
          showViewModal.value = false
          showMembersModal.value = true
        }
      } catch (error) {
        console.error('Error adding member:', error)
      } finally {
        addingMember.value = false
      }
    }

    const removeMember = async (member) => {
      if (!confirm(`確定要移除成員「${member.userEmail}」嗎？`)) {
        return
      }

      try {
        const response = await proxy.$apiClient.callWithAuth('/groups/remove-member', {
          projectId: selectedProjectId.value,
          groupId: selectedGroup.value.groupId,
          userEmail: member.userEmail
        })
        
        if (response.success) {
          proxy.$showSuccess('成員移除成功')
          
          // Set loading state for member list refresh
          loadingMembersData.value = true
          
          // Reload group details
          await viewGroup(selectedGroup.value)
          
          // Reset loading state
          loadingMembersData.value = false
          showViewModal.value = false
          showMembersModal.value = true
        }
      } catch (error) {
        console.error('Error removing member:', error)
      }
    }

    const deactivateGroup = async (group) => {
      if (!confirm(`確定要停用群組「${group.groupName}」嗎？`)) {
        return
      }

      try {
        const response = await proxy.$apiClient.deleteGroup(
          selectedProjectId.value,
          group.groupId
        )
        
        if (response.success) {
          proxy.$showSuccess('群組已停用')
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error deactivating group:', error)
      }
    }

    const activateGroup = async (group) => {
      try {
        const response = await proxy.$apiClient.updateGroup(
          selectedProjectId.value,
          group.groupId,
          { status: 'active' }
        )
        
        if (response.success) {
          proxy.$showSuccess('群組已啟用')
          loadProjectGroups()
        }
      } catch (error) {
        console.error('Error activating group:', error)
      }
    }

    const updateGroupAllowChange = async (group) => {
      try {
        // Set loading state
        updatingGroupId.value = group.groupId
        
        const response = await proxy.$apiClient.callWithAuth('/groups/update', {
          projectId: selectedProjectId.value,
          groupId: group.groupId,
          updates: {
            allowChange: group.allowChange
          }
        })
        
        if (response.success) {
          const { ElMessage } = await import('element-plus')
          ElMessage.success(
            group.allowChange ? '群組已解鎖，成員可自由變更' : '群組已鎖定，禁止成員變更'
          )
          // No need to reload the entire list since we've already updated the local data
        } else {
          // Revert the switch if update failed
          group.allowChange = !group.allowChange
          const { ElMessage } = await import('element-plus')
          ElMessage.error(response.error?.message || '更新群組設定失敗')
        }
      } catch (error) {
        // Revert the switch if update failed
        group.allowChange = !group.allowChange
        console.error('Error updating group allowChange:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('更新群組設定失敗')
      } finally {
        // Clear loading state
        updatingGroupId.value = null
      }
    }

    // Global group management functions
    const handleTabChange = (tabName) => {
      activeTab.value = tabName
      if (tabName === 'global') {
        loadGlobalGroups()
      } else {
        loadingProjectsList.value = true
        loadProjects()
      }
    }
    
    const loadGlobalGroups = async () => {
      loading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        ElMessage.info('開始更新全域群組列表')
        
        const response = await proxy.$apiClient.callWithAuth('/admin/global-groups')
        
        if (response.success && response.data) {
          globalGroups.value = response.data.map(group => ({
            ...group,
            memberCount: group.memberCount || 0
          }))
          ElMessage.success('全域群組列表資料下載完成')
        } else {
          proxy.$handleError('無法載入全域群組列表')
          globalGroups.value = []
        }
      } catch (error) {
        console.error('Error loading global groups:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入全域群組資料失敗，請重試')
        globalGroups.value = []
      } finally {
        loading.value = false
      }
    }
    
    const createGroup = () => {
      if (activeTab.value === 'global') {
        createGlobalGroup()
      } else {
        // Handle project group creation
        proxy.$handleError('專案群組建立功能尚未實現')
      }
    }
    
    const createBatchGroups = async () => {
      if (!selectedProjectId.value) {
        proxy.$handleError('請先選擇專案')
        return
      }
      
      creatingBatchGroups.value = true
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          proxy.$handleError('請先登入')
          return
        }

        // 批量創建學生分組
        const promises = []
        for (let i = 1; i <= batchGroupCount.value; i++) {
          const groupData = {
            groupName: `學生分組${i}`,
            description: `第${i}組學生分組`,
            allowChange: true
          }
          
          promises.push(
            proxy.$apiClient.callWithAuth('/groups/create', {
              sessionId,
              projectId: selectedProjectId.value,
              groupData
            })
          )
        }

        const results = await Promise.all(promises)
        
        // 檢查是否都成功
        const failedCount = results.filter(r => !r.success).length
        if (failedCount === 0) {
          proxy.$showSuccess(`成功建立 ${batchGroupCount.value} 個學生分組`)
        } else {
          proxy.$handleError(`建立分組時發生錯誤，${results.length - failedCount} 個成功，${failedCount} 個失敗`)
        }
        
        // 重新載入群組列表
        loadProjectGroups()
        
      } catch (error) {
        console.error('Error creating batch groups:', error)
        proxy.$handleError('批量建立分組失敗，請重試')
      } finally {
        creatingBatchGroups.value = false
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
      globalGroupForm.globalPermissions = getGlobalPermissionList(group)
      showGlobalGroupModal.value = true
    }
    
    const saveGlobalGroup = async () => {
      if (!globalGroupForm.groupName.trim()) {
        proxy.$handleError('請輸入群組名稱')
        return
      }
      
      try {
        savingGlobalGroup.value = true
        
        const isEdit = !!globalGroupForm.groupId
        const endpoint = isEdit ? '/admin/update-global-group' : '/admin/create-global-group'
        const payload = {
          groupName: globalGroupForm.groupName.trim(),
          description: globalGroupForm.description.trim(),
          globalPermissions: globalGroupForm.globalPermissions
        }
        
        if (isEdit) {
          payload.groupId = globalGroupForm.groupId
        }
        
        const response = await proxy.$apiClient.callWithAuth(endpoint, payload)
        
        if (response.success) {
          proxy.$showSuccess(isEdit ? '全域群組更新成功' : '全域群組建立成功')
          showGlobalGroupModal.value = false
          loadGlobalGroups()
        }
      } catch (error) {
        console.error('Error saving global group:', error)
      } finally {
        savingGlobalGroup.value = false
      }
    }
    
    const deactivateGlobalGroup = async (group) => {
      if (!confirm(`確定要停用全域群組「${group.groupName}」嗎？`)) {
        return
      }
      
      try {
        const response = await proxy.$apiClient.callWithAuth('/admin/deactivate-global-group', {
          groupId: group.groupId
        })
        
        if (response.success) {
          proxy.$showSuccess('全域群組已停用')
          loadGlobalGroups()
        }
      } catch (error) {
        console.error('Error deactivating global group:', error)
      }
    }
    
    const activateGlobalGroup = async (group) => {
      try {
        const response = await proxy.$apiClient.callWithAuth('/admin/activate-global-group', {
          groupId: group.groupId
        })
        
        if (response.success) {
          proxy.$showSuccess('全域群組已啟用')
          loadGlobalGroups()
        }
      } catch (error) {
        console.error('Error activating global group:', error)
      }
    }
    
    const manageGlobalGroupMembers = async (group) => {
      selectedGroup.value = group
      showMembersDrawer.value = true
      await loadGroupMembers(group.groupId)
    }
    
    const loadGroupMembers = async (groupId) => {
      membersLoading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        
        const response = await proxy.$apiClient.callWithAuth('/admin/global-groups/members', {
          groupId: groupId
        })
        
        if (response.success && response.data) {
          groupMembers.value = response.data.members || []
          ElMessage.success(`成員列表載入完成（${response.data.members.length} 人）`)
        } else {
          proxy.$handleError('無法載入群組成員')
          groupMembers.value = []
        }
      } catch (error) {
        console.error('Error loading group members:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入成員資料失敗，請重試')
        groupMembers.value = []
      } finally {
        membersLoading.value = false
      }
    }
    
    
    const toggleMemberSelection = (userEmail) => {
      const index = selectedMembers.value.indexOf(userEmail)
      if (index > -1) {
        selectedMembers.value.splice(index, 1)
      } else {
        selectedMembers.value.push(userEmail)
      }
    }
    
    const toggleAllMembers = (checked) => {
      if (checked) {
        selectedMembers.value = groupMembers.value.map(m => m.userEmail)
      } else {
        selectedMembers.value = []
      }
    }
    
    const removeSelectedMembers = async () => {
      if (selectedMembers.value.length === 0) return
      
      const { ElMessageBox, ElMessage } = await import('element-plus')
      
      try {
        await ElMessageBox.confirm(
          `確定要移除所選的 ${selectedMembers.value.length} 人嗎？`,
          '確認移除',
          {
            confirmButtonText: '確定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const response = await proxy.$apiClient.callWithAuth('/admin/global-groups/batch-remove-users', {
          groupId: selectedGroup.value.groupId,
          userEmails: selectedMembers.value
        })
        
        if (response.success && response.data) {
          const { successCount } = response.data
          ElMessage.success(`成功移除 ${successCount} 人`)
          
          // Reload group members
          await loadGroupMembers(selectedGroup.value.groupId)
          selectedMembers.value = []
        } else {
          proxy.$handleError('移除成員失敗')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Error removing members:', error)
          ElMessage.error('移除成員失敗，請重試')
        }
      }
    }
    
    const removeSingleMember = async (member) => {
      const { ElMessageBox, ElMessage } = await import('element-plus')
      
      try {
        await ElMessageBox.confirm(
          `確定要移除成員「${member.displayName || member.username}」嗎？`,
          '確認移除',
          {
            confirmButtonText: '確定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        // Set loading state for this specific member
        removingMemberEmail.value = member.userEmail
        
        let response
        if (activeTab.value === 'global') {
          // Global group API
          response = await proxy.$apiClient.callWithAuth('/admin/global-groups/remove-user', {
            groupId: selectedGroup.value.groupId,
            userEmail: member.userEmail
          })
        } else {
          // Project group API
          response = await proxy.$apiClient.callWithAuth('/groups/remove-member', {
            projectId: selectedProjectId.value,
            groupId: selectedGroup.value.groupId,
            userEmail: member.userEmail
          })
        }
        
        if (response.success) {
          ElMessage.success('成員移除成功')
          
          if (activeTab.value === 'global') {
            // Reload group members for global group
            await loadGroupMembers(selectedGroup.value.groupId)
          } else {
            // Set loading state for member list refresh (project groups)
            loadingMembersData.value = true
            
            // Reload group details for project group
            await viewGroup(selectedGroup.value)
            
            // Reset loading state
            loadingMembersData.value = false
            showViewModal.value = false
            showMembersModal.value = true
          }
        } else {
          proxy.$handleError('移除成員失敗')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Error removing member:', error)
          ElMessage.error('移除成員失敗，請重試')
        }
      } finally {
        // Clear loading state
        removingMemberEmail.value = ''
      }
    }
    
    const editProjectGroup = (group) => {
      editGroup(group)
    }
    
    const manageProjectGroupMembers = (group) => {
      manageMembers(group)
    }
    
    const deactivateProjectGroup = (group) => {
      deactivateGroup(group)
    }
    
    const activateProjectGroup = (group) => {
      activateGroup(group)
    }

    onMounted(() => {
      if (activeTab.value === 'global') {
        loadGlobalGroups()
      } else {
        loadingProjectsList.value = true
        loadProjects()
      }
    })

    // Drawer handling methods
    const handleEditDrawerClose = (done) => {
      if (editingGroupData.value || updating.value) {
        proxy.$message.warning('正在處理中，請稍候...')
        return
      }
      done()
    }
    
    const cancelEditGroup = () => {
      if (editingGroupData.value || updating.value) {
        proxy.$message.warning('正在處理中，請稍候...')
        return
      }
      showEditModal.value = false
    }
    
    const handleMembersDrawerClose = (done) => {
      if (loadingMembersData.value || addingMember.value || removingMember.value) {
        proxy.$message.warning('正在處理中，請稍候...')
        return
      }
      done()
    }
    
    const cancelMembersManagement = () => {
      if (loadingMembersData.value || addingMember.value || removingMember.value) {
        proxy.$message.warning('正在處理中，請稍候...')
        return
      }
      showMembersModal.value = false
    }

    return {
      activeTab,
      projects,
      groups,
      globalGroups,
      selectedProjectId,
      searchText,
      statusFilter,
      roleFilter,
      showViewModal,
      showEditModal,
      showMembersModal,
      showGlobalGroupModal,
      showMembersDrawer,
      selectedGroup,
      updating,
      addingMember,
      removingMember,
      removingMemberEmail,
      loading,
      loadingProjectsList,
      savingGlobalGroup,
      membersLoading,
      editingGroupData,
      loadingMembersData,
      updatingGroupId,
      batchGroupCount,
      creatingBatchGroups,
      editForm,
      memberForm,
      globalGroupForm,
      availablePermissions,
      groupMembers,
      selectedMembers,
      userSearchInput,
      searchedUsers,
      selectedUsersToAdd,
      allUsers,
      availableUsers,
      searchingUsers,
      stats,
      filteredGroups,
      formatTime,
      truncateText,
      getRoleText,
      getPermissionText,
      getGlobalPermissionList,
      handleTabChange,
      loadGlobalGroups,
      loadProjectGroups,
      refreshGroups,
      createGroup,
      createBatchGroups,
      createGlobalGroup,
      editGlobalGroup,
      saveGlobalGroup,
      deactivateGlobalGroup,
      activateGlobalGroup,
      manageGlobalGroupMembers,
      editProjectGroup,
      manageProjectGroupMembers,
      deactivateProjectGroup,
      activateProjectGroup,
      viewGroup,
      editGroup,
      updateGroup,
      manageMembers,
      addMember,
      removeMember,
      deactivateGroup,
      activateGroup,
      updateGroupAllowChange,
      loadGroupMembers,
      handleEditDrawerClose,
      cancelEditGroup,
      handleMembersDrawerClose,
      cancelMembersManagement,
      searchUsers,
      toggleMemberSelection,
      toggleAllMembers,
      removeSelectedMembers,
      removeSingleMember,
      loadAllUsers,
      isUserAlreadyMember,
      removeSelectedUser,
      clearSelectedUsers,
      toggleUserSelection,
      addSelectedMembers
    }
  }
}
</script>

<style scoped>
.group-management {
  padding: 20px;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.header-left h2 {
  margin: 0 0 10px 0;
  color: #2c5aa0;
}

.header-left h2 i {
  margin-right: 10px;
}

.group-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  color: #666;
  font-size: 14px;
}

.stat-item i {
  margin-right: 5px;
  color: #2c5aa0;
}

.header-right {
  display: flex;
  gap: 10px;
}

.project-selector {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.selector-row label {
  font-weight: 500;
  color: #333;
  min-width: 80px;
}

.project-select {
  flex: 1;
  max-width: 300px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filters {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.group-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  min-width: 1000px;
}

.group-table th,
.group-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.group-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.group-table tr:hover {
  background: #f8f9fa;
}

.group-name {
  font-weight: 500;
  color: #2c5aa0;
}

.description {
  max-width: 200px;
  word-wrap: break-word;
}

.role-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.role-badge.pm {
  background: #d1ecf1;
  color: #0c5460;
}

.role-badge.deliverable_team {
  background: #d4edda;
  color: #155724;
}

.role-badge.reviewer {
  background: #fff3cd;
  color: #856404;
}

.role-badge.observer {
  background: #f8d7da;
  color: #721c24;
}

.no-role {
  color: #6c757d;
  font-style: italic;
}

.member-count {
  color: #666;
}

.member-count i {
  margin-right: 5px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.status-badge i {
  margin-right: 4px;
}

.actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 200px;
}

.btn-sm {
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-sm i {
  margin-right: 3px;
}

.btn-primary {
  background: #2c5aa0;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-info:hover,
.btn-warning:hover,
.btn-danger:hover,
.btn-success:hover {
  opacity: 0.9;
}

.no-data,
.no-project-selected {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-data i,
.no-project-selected i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 800px;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
}

.modal-content h3 i {
  margin-right: 10px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.group-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.detail-row label {
  font-weight: 600;
  min-width: 120px;
  color: #333;
}

.detail-row span {
  flex: 1;
  color: #666;
}

.mono {
  font-family: monospace;
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

.permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.permission-tag {
  background: #e9ecef;
  color: #495057;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.no-permissions {
  color: #6c757d;
  font-style: italic;
}

.text-success {
  color: #28a745;
}

.text-warning {
  color: #ffc107;
}

.members-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.members-section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;
  gap: 12px;
}

.member-item i {
  color: #2c5aa0;
}

.member-email {
  flex: 1;
  font-weight: 500;
}

.member-role {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.member-role.leader {
  background: #d1ecf1;
  color: #0c5460;
}

.member-role.member {
  background: #e2e3e5;
  color: #495057;
}

.join-time {
  font-size: 12px;
  color: #6c757d;
}

.add-member-form {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.add-member-form h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
}

.form-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.form-row .form-input {
  flex: 1;
}

.form-row .form-select {
  min-width: 100px;
}

.current-members h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
}

.members-table {
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.members-table table {
  width: 100%;
  border-collapse: collapse;
}

.members-table th,
.members-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.members-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.no-members {
  text-align: center;
  padding: 20px;
  color: #6c757d;
  font-style: italic;
}

/* Member Management Drawer Styles */
.drawer-header-navy {
  position: relative;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 20px;
  margin: -20px -20px 20px -20px;
}

.drawer-header-navy h3 {
  margin: 0 0 8px 0;
  font-size: 1.2em;
  font-weight: 600;
}

.drawer-header-navy p {
  margin: 0;
  opacity: 0.9;
  font-size: 0.9em;
}

.drawer-close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.members-management {
  padding: 0 20px;
}

.add-users-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.add-users-section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 1.1em;
}

.user-search {
  margin-bottom: 15px;
}

.search-results {
  margin-top: 15px;
}

.search-results h5 {
  margin: 0 0 10px 0;
  color: #495057;
  font-size: 0.9em;
}

.user-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  background: white;
}

.user-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #f1f3f4;
  cursor: pointer;
  transition: background-color 0.2s;
}

.user-item:last-child {
  border-bottom: none;
}

.user-item:hover {
  background: #f8f9fa;
}

.user-item.selected {
  background: #e3f2fd;
}

.user-info {
  margin-left: 12px;
  flex: 1;
}

.user-name {
  display: block;
  font-weight: 500;
  color: #212529;
}

.user-email {
  display: block;
  font-size: 0.85em;
  color: #6c757d;
  margin-top: 2px;
}

.add-actions {
  margin-top: 15px;
  text-align: right;
}

.current-members-section {
  margin-top: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-header h4 {
  margin: 0;
  color: #2c5aa0;
  font-size: 1.1em;
}

.batch-actions {
  display: flex;
  gap: 10px;
}

.members-table-container {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.members-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
}

.members-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #dee2e6;
}

.members-table td {
  padding: 12px;
  border-bottom: 1px solid #f1f3f4;
  vertical-align: middle;
}

.members-table tr:last-child td {
  border-bottom: none;
}

.members-table tr:hover {
  background: #f8f9fa;
}

.permission-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.permission-tag {
  margin-right: 4px;
  margin-bottom: 2px;
}

/* Batch Create Styles */
.batch-create-section {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 15px;
  background: #f5f7fa;
  border-radius: 8px;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-container label {
  white-space: nowrap;
  font-weight: 500;
  color: #2c3e50;
}

.count-display {
  font-weight: 600;
  color: #409eff;
  min-width: 20px;
}

/* Drawer Navy Header Styles */
.drawer-header-navy {
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  padding: 16px 24px;
  margin: -20px -20px 20px -20px;
  border-radius: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header-navy h3 {
  margin: 0;
  color: white;
  font-weight: 600;
  font-size: 18px;
}

.drawer-header-navy i {
  margin-right: 8px;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

/* User Selection Styles */
.user-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  width: 100%;
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
}

.user-email {
  font-size: 12px;
  color: #6c757d;
}

.user-tags {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-left: 8px;
}

.more-tags {
  font-size: 11px;
  color: #6c757d;
}

.already-member {
  margin-left: 8px;
}

.selected-users {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
  min-height: 40px;
}

.selected-user-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #409eff;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.remove-user-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
}

.remove-user-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn-secondary:disabled {
  background: #6c757d;
  opacity: 0.6;
  cursor: not-allowed;
}

/* Members Drawer Beautification */
.drawer-body {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Card Styles */
.info-card,
.form-card,
.members-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.info-card:hover,
.form-card:hover,
.members-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.card-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px 20px;
  border-bottom: 1px solid #e1e8ed;
}

.card-header h4 {
  margin: 0;
  color: white;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.card-header h4 i {
  margin-right: 10px;
  font-size: 18px;
}

.card-content {
  padding: 24px;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  color: #2c3e50;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  background: #f8f9fa;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.info-value i {
  color: #409eff;
}

/* Form Group Styling */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2c3e50;
  font-size: 14px;
}

/* Members Table Enhancement */
.members-table {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #e1e8ed;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
}

.data-table th {
  background: #f8f9fc;
  color: #2c3e50;
  font-weight: 600;
  padding: 16px 12px;
  text-align: left;
  border-bottom: 2px solid #e1e8ed;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #f1f3f4;
  color: #2c3e50;
  font-size: 14px;
}

.data-table tr:hover {
  background: #f8f9fc;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.member-role {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.member-role.leader {
  background: #fef0e6;
  color: #d4661c;
  border: 1px solid #f4c09a;
}

.member-role.member {
  background: #e6f4ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

/* No Members State */
.no-members {
  text-align: center;
  padding: 40px 20px;
  color: #6c757d;
}

/* Action Buttons Enhancement */
.form-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 20px;
  padding: 16px 0;
  border-top: 1px solid #f1f3f4;
}

.form-actions .btn-primary,
.form-actions .btn-secondary {
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.form-actions .btn-primary {
  background: linear-gradient(135deg, #409eff 0%, #1890ff 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.3);
}

.form-actions .btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(64, 158, 255, 0.4);
}

.form-actions .btn-primary:disabled {
  background: #a0cfff;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.form-actions .btn-secondary {
  background: #6c757d;
  color: white;
}

.form-actions .btn-secondary:hover {
  background: #5a6268;
  transform: translateY(-1px);
}

/* Selected Tags Display */
.selected-tags-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  min-height: 40px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>