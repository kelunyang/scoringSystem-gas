<template>
  <div class="user-management">
    
    <!-- Header with Actions -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-users"></i> 使用者管理</h2>
        <div class="user-stats">
          <span class="stat-item">
            <i class="fas fa-user-check"></i>
            活躍用戶: {{ (users || []).filter(u => u && u.status === 'active').length }}
          </span>
          <span class="stat-item">
            <i class="fas fa-user-times"></i>
            停用用戶: {{ (users || []).filter(u => u && u.status === 'inactive').length }}
          </span>
          <span class="stat-item">
            <i class="fas fa-user-plus"></i>
            總用戶: {{ (users || []).length }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn-primary" @click="openInviteManagement">
          <i class="fas fa-cogs"></i>
          邀請碼管理
        </button>
        <button class="btn-secondary" @click="refreshUsers">
          <i class="fas fa-sync"></i>
          重新整理
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-row">
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜尋使用者名稱或email"
          class="search-input"
        >
        <select v-model="statusFilter" class="filter-select">
          <option value="">全部狀態</option>
          <option value="active">活躍</option>
          <option value="inactive">停用</option>
        </select>
      </div>
    </div>

    <!-- User Table -->
    <div class="table-container" v-loading="loading" element-loading-text="載入使用者資料中...">
      <table class="user-table">
        <thead>
          <tr>
            <th>使用者名稱</th>
            <th>Email</th>
            <th>顯示名稱</th>
            <th>標籤</th>
            <th>狀態</th>
            <th>註冊時間</th>
            <th>最後登入</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.userId">
            <td>{{ user.username }}</td>
            <td>{{ user.userEmail }}</td>
            <td>{{ user.displayName || '-' }}</td>
            <td class="user-tags">
              <div class="tags-display">
                <span 
                  v-for="tag in user.tags || []" 
                  :key="tag.tagId"
                  class="tag-badge"
                  :style="{ backgroundColor: tag.tagColor }"
                >
                  {{ tag.tagName }}
                </span>
              </div>
            </td>
            <td>
              <span class="status-badge" :class="user.status">
                <i :class="user.status === 'active' ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
                {{ user.status === 'active' ? '活躍' : '停用' }}
              </span>
            </td>
            <td>{{ formatTime(user.registrationTime) }}</td>
            <td>{{ formatTime(user.lastLoginTime) || '-' }}</td>
            <td class="actions">
              <button class="btn-sm btn-primary" @click="editUser(user)">
                <i class="fas fa-edit"></i>
                編輯
              </button>
              <button 
                class="btn-sm" 
                :class="user.status === 'active' ? 'btn-warning' : 'btn-success'"
                @click="toggleUserStatus(user)"
              >
                <i :class="user.status === 'active' ? 'fas fa-user-times' : 'fas fa-user-check'"></i>
                {{ user.status === 'active' ? '停用' : '啟用' }}
              </button>
              <button class="btn-sm btn-secondary" @click="resetPassword(user)">
                <i class="fas fa-key"></i>
                重設密碼
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="filteredUsers.length === 0" class="no-data">
        <i class="fas fa-users"></i>
        <p>沒有找到符合條件的使用者</p>
      </div>
    </div>

    <!-- Invitation Management Drawer -->
    <el-drawer
      v-model="showInviteDrawer"
      title="邀請碼管理"
      direction="btt"
      size="100%"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-envelope"></i> 邀請碼管理</h3>
      </template>
      
      <div class="drawer-body">
          <!-- Generate New Invitation -->
          <el-collapse v-model="inviteCollapse" v-loading="invitationsLoading">
            <el-collapse-item name="generate" :disabled="invitationsLoading">
              <template #title>
                <h4 style="margin: 0;"><i class="fas fa-plus"></i> 產生新邀請碼</h4>
              </template>
            <!-- 流式排版 - 每個欄位獨立一行 -->
            <div class="form-group">
              <label>受邀者Email <span class="required">*</span></label>
              <el-input 
                type="textarea" 
                v-model="inviteForm.targetEmails" 
                placeholder="輸入受邀者的Email地址，一行一個"
                :rows="4"
                class="form-input"
                required
              />
              <div class="help-text">請每行輸入一個Email地址</div>
            </div>

            <div class="form-group">
              <label>有效天數: {{ inviteForm.validDays }} 天</label>
              <el-slider
                v-model="inviteForm.validDays"
                :min="1"
                :max="30"
                :step="1"
                show-stops
                show-tooltip
                :format-tooltip="(val) => `${val} 天`"
                style="margin: 10px 0;"
              />
              <div class="help-text">設定邀請碼的有效期限（1-30天）</div>
            </div>
            
            <!-- Default Tags Selection -->
            <div class="form-group">
              <label>預設標籤 (新用戶會自動獲得這些標籤)</label>
              <div class="tag-selector">
                <el-select
                  v-model="inviteForm.defaultTags"
                  multiple
                  filterable
                  placeholder="搜尋並選擇預設標籤"
                  style="width: 100%"
                  clearable
                >
                  <el-option
                    v-for="tag in allTags"
                    :key="tag.tagId"
                    :label="tag.tagName"
                    :value="tag.tagId"
                  >
                    <span :style="{ color: tag.tagColor, fontWeight: 'bold' }">
                      {{ tag.tagName }}
                    </span>
                  </el-option>
                </el-select>
                
                <!-- 顯示已選標籤 -->
                <div v-if="inviteForm.defaultTags.length > 0" class="selected-tags-display" style="margin-top: 8px;">
                  <el-tag
                    v-for="tagId in inviteForm.defaultTags"
                    :key="tagId"
                    :color="getTagById(tagId)?.tagColor || '#409eff'"
                    closable
                    @close="removeDefaultTag(tagId)"
                    :style="{ 
                      marginRight: '8px', 
                      marginBottom: '4px', 
                      color: '#fff',
                      fontWeight: '500'
                    }"
                  >
                    {{ getTagById(tagId)?.tagName || tagId }}
                  </el-tag>
                </div>
              </div>
            </div>
            
            <!-- Default Global Groups Selection -->
            <div class="form-group">
              <label>預設全域群組 (新用戶會自動加入這些全域群組)</label>
              <div class="group-selector">
                <el-select
                  v-model="inviteForm.defaultGlobalGroups"
                  multiple
                  filterable
                  placeholder="搜尋並選擇預設全域群組"
                  style="width: 100%"
                  clearable
                >
                  <el-option
                    v-for="group in globalGroups"
                    :key="group.groupId"
                    :label="group.groupName"
                    :value="group.groupId"
                  >
                    <div style="display: flex; align-items: center;">
                      <i class="fas fa-crown" style="margin-right: 8px; color: #f39c12;"></i>
                      <span style="font-weight: bold;">{{ group.groupName }}</span>
                      <span style="margin-left: 8px; font-size: 12px; color: #666;">{{ getGlobalGroupPermissionText(group) }}</span>
                    </div>
                  </el-option>
                </el-select>
                
                <!-- 顯示已選群組 -->
                <div v-if="inviteForm.defaultGlobalGroups.length > 0" class="selected-groups-display" style="margin-top: 8px;">
                  <el-tag
                    v-for="groupId in inviteForm.defaultGlobalGroups"
                    :key="groupId"
                    color="#f39c12"
                    closable
                    @close="removeDefaultGlobalGroup(groupId)"
                    :style="{ 
                      marginRight: '8px', 
                      marginBottom: '4px', 
                      color: '#fff',
                      fontWeight: '500'
                    }"
                  >
                    <i class="fas fa-crown" style="margin-right: 4px; color: #fff;"></i>
                    {{ getGlobalGroupById(groupId)?.groupName || groupId }}
                  </el-tag>
                </div>
              </div>
            </div>
            
            <div class="generate-button-row">
              <button class="btn-primary" @click="generateInvite" :disabled="generating">
                <i class="fas fa-plus"></i>
                {{ generating ? '生成中...' : '生成邀請碼' }}
              </button>
            </div>
            
            <!-- 進度顯示 -->
            <div v-if="generating && processingStatus" class="processing-status">
              <i class="fas fa-spinner fa-spin"></i>
              {{ processingStatus }}
            </div>
            
            <!-- Generated Invite Codes -->
            <div v-if="generatedInvite" class="generated-invite">
              <h5>邀請碼已生成 ({{ generatedInvite.totalGenerated || 1 }}個)</h5>
              
              <!-- 單個邀請碼 (舊格式相容) -->
              <div v-if="generatedInvite.invitationCode" class="invite-code-item">
                <div class="invite-code">{{ generatedInvite.invitationCode }}</div>
                <p>有效期至: {{ formatTime(generatedInvite.expiryTime) }}</p>
                <button class="btn-sm btn-secondary" @click="copyInviteCode">
                  <i class="fas fa-copy"></i>
                  複製邀請碼
                </button>
              </div>
              
              <!-- 多個邀請碼 -->
              <div v-if="generatedInvite.results" class="invite-codes-list">
                <div v-for="(result, index) in generatedInvite.results" :key="index" class="invite-code-item">
                  <div class="invite-code">{{ result.email }} > {{ result.invitationCode }}</div>
                  <button class="btn-sm btn-secondary" @click="copySpecificCode(result.invitationCode)">
                    <i class="fas fa-copy"></i>
                    複製
                  </button>
                </div>
                
                <!-- 錯誤提示 -->
                <div v-if="generatedInvite.errors && generatedInvite.errors.length > 0" class="invite-errors">
                  <h6>生成失敗:</h6>
                  <ul>
                    <li v-for="(error, index) in generatedInvite.errors" :key="index">{{ error }}</li>
                  </ul>
                </div>
                
                <!-- 批量複製按鈕 -->
                <div class="batch-actions">
                  <button class="btn-sm btn-primary" @click="copyAllCodes">
                    <i class="fas fa-copy"></i>
                    複製全部邀請碼
                  </button>
                </div>
              </div>
            </div>
            </el-collapse-item>
          </el-collapse>
          
          <!-- Invitation List -->
          <div class="section">
            <div class="section-header">
              <h4><i class="fas fa-list"></i> 邀請碼列表</h4>
              <button class="btn-sm btn-secondary" @click="loadInvitations">
                <i class="fas fa-sync"></i>
                重新載入
              </button>
            </div>
            
            <!-- Invitation Filters -->
            <div class="invitation-filters">
              <select v-model="inviteStatusFilter" class="filter-select">
                <option value="">全部狀態</option>
                <option value="active">有效</option>
                <option value="used">已使用</option>
                <option value="expired">已過期</option>
                <option value="deactivated">已停用</option>
              </select>
              <input 
                type="text" 
                v-model="inviteSearchText" 
                placeholder="搜尋受邀者或創建者"
                class="search-input"
              >
              <div class="show-deactivated-switch">
                <el-switch
                  v-model="showDeactivatedInvitations"
                  active-text="顯示已停用"
                  inactive-text="隱藏已停用"
                  active-color="#f56c6c"
                  inactive-color="#dcdfe6"
                  style="--el-switch-on-color: #f56c6c"
                  @change="(val) => { console.log('Switch changed:', val); console.log('Invitations:', invitations.map(i => i.status)); }"
                />
              </div>
            </div>
            
            <!-- Invitation Table -->
            <div class="table-container" v-loading="invitationsLoading" element-loading-text="載入邀請碼資料中...">
              <table class="invitation-table">
                <thead>
                  <tr>
                    <th>受邀者</th>
                    <th>狀態</th>
                    <th>創建者</th>
                    <th>創建時間</th>
                    <th>有效期至</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="invitation in filteredInvitations" 
                    :key="invitation.invitationId"
                    :class="{ 'deactivated-invitation': invitation.status === 'deactivated' }"
                  >
                    <td>
                      <span class="target-email">{{ invitation.targetEmail || '-' }}</span>
                    </td>
                    <td>
                      <span class="status-badge" :class="getInvitationStatusClass(invitation)">
                        {{ getInvitationStatusText(invitation) }}
                      </span>
                    </td>
                    <td>{{ invitation.createdBy }}</td>
                    <td>{{ formatTime(invitation.createdTime) }}</td>
                    <td>{{ formatTime(invitation.expiryTime) }}</td>
                    <td class="actions">
                      <button 
                        class="btn-sm btn-secondary" 
                        @click="copyInvitationCode(invitation.invitationCode)"
                        title="複製邀請碼"
                      >
                        <i class="fas fa-copy"></i>
                      </button>
                      <button 
                        v-if="invitation.status === 'active'"
                        class="btn-sm btn-warning" 
                        @click="deactivateInvitation(invitation)"
                        title="停用邀請碼"
                      >
                        <i class="fas fa-ban"></i>
                        停用
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              
              <div v-if="filteredInvitations.length === 0" class="no-invitations">
                <i class="fas fa-envelope-open"></i>
                <p>沒有找到符合條件的邀請碼</p>
              </div>
            </div>
          </div>
          
          <!-- Invitation Statistics -->
          <div class="section">
            <h4><i class="fas fa-chart-pie"></i> 邀請碼統計</h4>
            <el-row :gutter="16" class="statistics-row">
              <el-col :span="4">
                <el-statistic 
                  title="總計" 
                  :value="invitationStats.total"
                  :value-style="{ color: '#409EFF' }"
                >
                  <template #prefix>
                    <i class="fas fa-envelope" style="font-size: 14px;"></i>
                  </template>
                </el-statistic>
              </el-col>
              <el-col :span="4">
                <el-statistic 
                  title="有效" 
                  :value="invitationStats.active"
                  :value-style="{ color: '#67C23A' }"
                >
                  <template #prefix>
                    <i class="fas fa-check-circle" style="font-size: 14px;"></i>
                  </template>
                </el-statistic>
              </el-col>
              <el-col :span="4">
                <el-statistic 
                  title="已使用" 
                  :value="invitationStats.used"
                  :value-style="{ color: '#E6A23C' }"
                >
                  <template #prefix>
                    <i class="fas fa-user-check" style="font-size: 14px;"></i>
                  </template>
                </el-statistic>
              </el-col>
              <el-col :span="4">
                <el-statistic 
                  title="已停用" 
                  :value="invitationStats.deactivated"
                  :value-style="{ color: '#F56C6C' }"
                >
                  <template #prefix>
                    <i class="fas fa-ban" style="font-size: 14px;"></i>
                  </template>
                </el-statistic>
              </el-col>
              <el-col :span="4">
                <el-statistic 
                  title="已過期" 
                  :value="invitationStats.expired"
                  :value-style="{ color: '#909399' }"
                >
                  <template #prefix>
                    <i class="fas fa-clock" style="font-size: 14px;"></i>
                  </template>
                </el-statistic>
              </el-col>
            </el-row>
          </div>
        </div>
    </el-drawer>

    <!-- Password Reset Modal -->
    <div v-if="showPasswordModal" class="modal-overlay" @click="showPasswordModal = false">
      <div class="modal-content" @click.stop>
        <h3><i class="fas fa-key"></i> 重設用戶密碼</h3>
        <p>用戶: <strong>{{ selectedUser?.username }}</strong></p>
        
        <div class="form-group">
          <label>新密碼</label>
          <input type="password" v-model="newPassword" class="form-input" placeholder="至少6個字符">
        </div>
        
        <div class="modal-actions">
          <button class="btn-warning" @click="confirmPasswordReset" :disabled="resetting">
            <i class="fas fa-key"></i>
            {{ resetting ? '重設中...' : '重設密碼' }}
          </button>
          <button class="btn-secondary" @click="showPasswordModal = false">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- User Tag Management Modal -->
    <div v-if="showTagManagementModal" class="modal-overlay" @click="showTagManagementModal = false">
      <div class="modal-content tag-modal" @click.stop>
        <div class="modal-header">
          <h3><i class="fas fa-tags"></i> 管理用戶標籤</h3>
          <p>用戶: <strong>{{ selectedUser?.username }}</strong> ({{ selectedUser?.userEmail }})</p>
        </div>
        
        <div class="tag-management-body">
          <!-- Current Tags -->
          <div class="current-tags-section">
            <h4><i class="fas fa-tag"></i> 目前標籤</h4>
            <div class="current-tags">
              <span 
                v-for="tag in selectedUser?.tags || []" 
                :key="tag.tagId"
                class="tag-badge removable"
                :style="{ backgroundColor: tag.tagColor }"
              >
                {{ tag.tagName }}
                <button 
                  class="remove-tag-btn"
                  @click="removeTagFromUser(selectedUser, tag)"
                  title="移除標籤"
                >
                  <i class="fas fa-times"></i>
                </button>
              </span>
              <div v-if="!selectedUser?.tags || selectedUser.tags.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                尚未分配任何標籤
              </div>
            </div>
          </div>
          
          <!-- Available Tags -->
          <div class="available-tags-section">
            <h4><i class="fas fa-plus"></i> 可用標籤</h4>
            <div class="tag-search">
              <div style="display: flex; gap: 8px; align-items: center;">
                <input 
                  type="text" 
                  v-model="tagSearchText" 
                  placeholder="搜尋標籤..."
                  class="search-input"
                  @keyup.enter="filterTags"
                  style="flex: 1;"
                >
                <button 
                  class="btn btn-primary btn-sm"
                  @click="filterTags"
                  :disabled="!tagSearchText"
                >
                  搜尋
                </button>
                <button 
                  class="btn btn-secondary btn-sm"
                  @click="clearTagSearch"
                  v-if="tagSearchText"
                >
                  清除
                </button>
              </div>
            </div>
            <div class="available-tags">
              <button 
                v-for="tag in availableTagsForUser" 
                :key="tag.tagId"
                class="tag-badge clickable"
                :style="{ backgroundColor: tag.tagColor }"
                @click="assignTagToUser(selectedUser, tag)"
                title="點擊分配標籤"
              >
                {{ tag.tagName }}
                <i class="fas fa-plus"></i>
              </button>
              <div v-if="availableTagsForUser.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                {{ tagSearchText ? '沒有符合條件的標籤' : '沒有可分配的標籤' }}
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showTagManagementModal = false">
            關閉
          </button>
        </div>
      </div>
    </div>

    <!-- User Edit Drawer -->
    <el-drawer
      v-model="showEditUserDrawer"
      title="編輯使用者 (調試模式)"
      direction="btt"
      size="100%"
      :before-close="handleDrawerClose"
    >
      <template #header>
        <div class="drawer-header-custom">
          <h3><i class="fas fa-user-edit"></i> 編輯使用者</h3>
          <button class="drawer-close-btn" @click="cancelEditUser" title="關閉">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </template>
      
      <div v-if="editingUser" class="user-edit-form" v-loading="loadingUserData" element-loading-text="載入用戶資料中...">
        <!-- User Basic Info -->
        <div class="form-section">
          <h4><i class="fas fa-user"></i> 基本資料</h4>
          <div class="form-group">
            <label>使用者名稱</label>
            <el-input v-model="editingUser.username" disabled />
          </div>
          <div class="form-group">
            <label>Email</label>
            <el-input v-model="editingUser.userEmail" disabled />
          </div>
          <div class="form-group">
            <label>顯示名稱</label>
            <el-input v-model="editingUser.displayName" placeholder="輸入顯示名稱" />
          </div>
          <div class="form-group">
            <label>帳號狀態</label>
            <el-select v-model="editingUser.status" style="width: 100%">
              <el-option label="活躍" value="active" />
              <el-option label="停用" value="inactive" />
            </el-select>
          </div>
        </div>

        <!-- Avatar Management Section -->
        <div class="form-section">
          <h4><i class="fas fa-user-circle"></i> 頭像設定</h4>
          
          <div class="avatar-management">
            <div class="avatar-preview">
              <el-avatar 
                :src="editingUserAvatarUrl" 
                :alt="`${editingUser?.displayName || editingUser?.username}的頭像`"
                shape="square"
                :size="80"
                @error="handleEditingUserAvatarError"
              >
                {{ generateEditingUserInitials() }}
              </el-avatar>
            </div>
            
            <div class="avatar-controls">
              <div class="control-buttons">
                <el-button 
                  size="small" 
                  @click="regenerateEditingUserAvatar" 
                  :loading="regeneratingEditingUserAvatar"
                >
                  <i class="fas fa-sync"></i>
                  重新生成頭像
                </el-button>
                
                <!-- Avatar Style Selection -->
                <div class="avatar-style-selector">
                  <label>頭像風格：</label>
                  <el-select 
                    v-model="editingUser.avatarStyle" 
                    @change="onEditingUserAvatarStyleChange"
                    style="width: 150px"
                    size="small"
                  >
                    <el-option
                      v-for="style in avatarStyles"
                      :key="style.value"
                      :label="style.label"
                      :value="style.value"
                    />
                  </el-select>
                </div>
                
                <!-- Color Options for Avataaars -->
                <div v-if="editingUser.avatarStyle === 'avataaars'" class="avatar-color-options">
                  <div class="color-group">
                    <label>背景顏色：</label>
                    <div class="color-options">
                      <div 
                        v-for="color in backgroundColors" 
                        :key="color.value"
                        class="color-option"
                        :style="{ backgroundColor: '#' + color.value }"
                        :class="{ selected: editingUserAvatarOptions.backgroundColor === color.value }"
                        @click="updateEditingUserAvatarOption('backgroundColor', color.value)"
                        :title="color.label"
                      ></div>
                    </div>
                  </div>
                  
                  <div class="color-group">
                    <label>衣服顏色：</label>
                    <div class="color-options">
                      <div 
                        v-for="color in clothesColors" 
                        :key="color.value"
                        class="color-option"
                        :style="{ backgroundColor: '#' + color.value }"
                        :class="{ selected: editingUserAvatarOptions.clothesColor === color.value }"
                        @click="updateEditingUserAvatarOption('clothesColor', color.value)"
                        :title="color.label"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-if="editingUserAvatarChanged" class="avatar-save-notice">
                <i class="fas fa-info-circle"></i>
                頭像設定已修改，保存用戶時將一起更新
              </div>
            </div>
          </div>
        </div>

        <!-- User Global Groups and Permissions Display -->
        <div class="form-section">
          <h4><i class="fas fa-user-shield"></i> 用戶權限概覽</h4>
          
          <div class="form-group">
            <label>所屬全域群組</label>
            <div class="user-groups-display">
              <el-tag 
                v-for="group in editingUser.globalGroups || []" 
                :key="group.groupId"
                type="primary"
                class="group-tag"
              >
                <i class="fas fa-users"></i>
                {{ group.groupName }}
              </el-tag>
              <div v-if="!editingUser.globalGroups || editingUser.globalGroups.length === 0" class="no-groups">
                <i class="fas fa-info-circle"></i>
                尚未加入任何全域群組
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>擁有的全域權限</label>
            <div class="user-permissions-display">
              <el-tag 
                v-for="permission in userGlobalPermissions" 
                :key="permission.code"
                type="success"
                class="permission-tag"
              >
                <i :class="permission.icon"></i>
                {{ permission.name }}
              </el-tag>
              <div v-if="!userGlobalPermissions || userGlobalPermissions.length === 0" class="no-permissions">
                <i class="fas fa-info-circle"></i>
                沒有任何全域權限
              </div>
            </div>
            <div class="help-text">
              <i class="fas fa-info-circle"></i>
              權限是通過群組成員身份獲得的。要修改權限，請到群組管理中調整群組權限或用戶的群組成員身份。
            </div>
          </div>
        </div>

        <!-- Tag Management Section -->
        <div class="form-section">
          <h4><i class="fas fa-tags"></i> 標籤管理</h4>
          
          <div class="form-group">
            <label>已分配標籤</label>
            <div class="user-tags-editor">
              <div class="current-tags">
                <el-tag 
                  v-for="tag in editingUser.tags || []" 
                  :key="tag.tagId"
                  :color="tag.tagColor"
                  closable
                  @close="removeTagFromEditingUser(tag)"
                  class="tag-item"
                >
                  {{ tag.tagName }}
                </el-tag>
                <div v-if="!editingUser.tags || editingUser.tags.length === 0" class="no-tags">
                  <i class="fas fa-info-circle"></i>
                  尚未分配任何標籤
                </div>
              </div>
              
              <div class="add-tags">
                <el-select
                  v-model="selectedTagsToAdd"
                  multiple
                  filterable
                  placeholder="搜尋並選擇標籤"
                  style="width: 100%; margin-bottom: 10px;"
                  clearable
                >
                  <el-option
                    v-for="tag in availableTagsForEditingUser"
                    :key="tag.tagId"
                    :label="tag.tagName"
                    :value="tag.tagId"
                  >
                    <span :style="{ color: tag.tagColor, fontWeight: 'bold' }">{{ tag.tagName }}</span>
                  </el-option>
                </el-select>
                
                <el-button 
                  type="primary" 
                  @click="addSelectedTagsToUser"
                  :disabled="selectedTagsToAdd.length === 0"
                >
                  <i class="fas fa-plus"></i>
                  添加選中的標籤
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Global Groups Management -->
        <div class="form-section">
          <h4><i class="fas fa-globe"></i> 全域群組管理</h4>
          
          <div class="form-group">
            <label>已加入的全域群組</label>
            <div class="global-groups-display">
              <el-tag 
                v-for="group in editingUser.globalGroups || []" 
                :key="group.groupId"
                type="warning"
                closable
                @close="removeUserFromGlobalGroup(group)"
                class="global-group-tag"
              >
                <i class="fas fa-crown"></i>
                {{ group.groupName }}
              </el-tag>
              <div v-if="!editingUser.globalGroups || editingUser.globalGroups.length === 0" class="no-global-groups">
                <i class="fas fa-info-circle"></i>
                尚未加入任何全域群組
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>添加到全域群組</label>
            <div class="global-group-actions">
              <el-select
                v-model="selectedGlobalGroupToAdd"
                placeholder="選擇全域群組"
                style="width: 300px; margin-right: 10px"
              >
                <el-option
                  v-for="group in availableGlobalGroups"
                  :key="group.groupId"
                  :label="group.groupName"
                  :value="group.groupId"
                >
                  <span style="font-weight: bold">{{ group.groupName }}</span>
                  <span style="margin-left: 8px; color: #999; font-size: 12px">
                    {{ getGlobalGroupPermissionText(group) }}
                  </span>
                </el-option>
              </el-select>
              <el-button 
                type="primary" 
                @click="addUserToGlobalGroup"
                :disabled="!selectedGlobalGroupToAdd"
              >
                <i class="fas fa-plus"></i>
                添加到群組
              </el-button>
            </div>
          </div>
        </div>

        <!-- Project Groups Management -->
        <div class="form-section">
          <h4><i class="fas fa-project-diagram"></i> 專案群組管理</h4>
          
          <div class="form-group">
            <label>使用者參與的專案群組</label>
            <div v-if="loadingUserProjectGroups" class="loading-indicator">
              <i class="fas fa-spinner fa-spin"></i>
              載入專案群組資料中...
            </div>
            <div v-else-if="userProjectGroups && userProjectGroups.length > 0" class="project-groups-list">
              <div 
                v-for="projectGroup in userProjectGroups" 
                :key="`${projectGroup.projectId}-${projectGroup.groupId}`"
                class="project-group-item"
              >
                <div class="project-group-info">
                  <div class="project-info">
                    <span class="project-name">{{ projectGroup.projectName }}</span>
                    <span class="project-id">ID: {{ projectGroup.projectId }}</span>
                  </div>
                  <div class="group-info">
                    <span class="group-name">群組: {{ projectGroup.groupName }}</span>
                    <el-tag 
                      :type="projectGroup.role === 'leader' ? 'warning' : 'info'"
                      size="small"
                    >
                      {{ projectGroup.role === 'leader' ? '組長' : '成員' }}
                    </el-tag>
                  </div>
                </div>
                <div class="group-controls">
                  <div class="allow-change-control">
                    <label>允許成員變更：</label>
                    <el-switch
                      v-model="projectGroup.allowChange"
                      @change="updateGroupAllowChange(projectGroup)"
                      :disabled="updatingGroupSettings.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                      :loading="updatingGroupSettings.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                      active-color="#13ce66"
                      inactive-color="#ff4949"
                    />
                  </div>
                  <div class="group-actions">
                    <el-button 
                      size="small" 
                      type="danger" 
                      @click="removeUserFromProjectGroup(projectGroup)"
                      :disabled="removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`)"
                    >
                      <i :class="removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`) ? 'fas fa-spinner fa-spin' : 'fas fa-times'"></i>
                      {{ removingFromGroups.has(`${projectGroup.projectId}-${projectGroup.groupId}`) ? '移除中...' : '移除' }}
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="!loadingUserProjectGroups" class="no-project-groups">
              <i class="fas fa-info-circle"></i>
              此使用者尚未參與任何專案群組
            </div>
          </div>
        </div>
        
        <!-- Drawer Footer -->
        <div class="drawer-footer">
          <el-button 
            type="primary" 
            @click="saveEditingUser"
            :loading="savingEditingUser"
            :disabled="!hasUserChanges"
          >
            <i class="fas fa-save"></i>
            {{ savingEditingUser ? '保存中...' : '保存變更' }}
          </el-button>
          <el-button @click="cancelEditUser">
            <i class="fas fa-times"></i>
            取消
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
<script>
import { ref, reactive, computed, onMounted, getCurrentInstance, watch, onErrorCaptured, onUnmounted } from 'vue'

export default {
  name: 'UserManagement',
  setup() {
    // Error handler
    onErrorCaptured((err, instance, info) => {
      console.error('=== Error in UserManagement ===')
      console.error('Error:', err)
      console.error('Message:', err.message)
      console.error('Stack:', err.stack)
      console.error('Info:', info)
      return false
    })
    
    const instance = getCurrentInstance()
    const apiClient = instance?.appContext?.config?.globalProperties?.$apiClient
    
    const users = ref([])
    const searchText = ref('')
    const statusFilter = ref('')
    const showInviteDrawer = ref(false)
    const showPasswordModal = ref(false)
    const showTagManagementModal = ref(false)
    const selectedUser = ref(null)
    const newPassword = ref('')
    const generating = ref(false)
    const resetting = ref(false)
    const generatedInvite = ref(null)
    const loading = ref(false)
    const invitationsLoading = ref(false)
    const processingStatus = ref('')
    
    // Invitation management - 必須在 computed 之前定義
    const invitations = ref([])
    const inviteSearchText = ref('')
    const inviteStatusFilter = ref('')
    const showDeactivatedInvitations = ref(false)
    const inviteCollapse = ref([]) // Control collapse state
    
    // Tag management
    const allTags = ref([])
    const tagSearchText = ref('')
    const filteredTagSearchText = ref('') // 實際用於過濾的搜尋文字
    
    // User editing
    const showEditUserDrawer = ref(false)
    const editingUser = ref(null)
    const originalUser = ref(null)
    const selectedTagsToAdd = ref([])
    const selectedGroupsToAdd = ref([])
    const userGlobalGroups = ref([])
    const saving = ref(false)
    const loadingUserData = ref(false)
    
    // Avatar management
    const regeneratingAvatar = ref(false)
    const avatarError = ref(false)
    const currentAvatarOptions = ref({})
    
    // Editing user avatar management
    const regeneratingEditingUserAvatar = ref(false)
    const editingUserAvatarError = ref(false)
    const editingUserAvatarChanged = ref(false)
    const editingUserAvatarOptions = ref({
      backgroundColor: 'b6e3f4',
      clothesColor: '3c4858',
      skinColor: 'ae5d29'
    })
    const savingEditingUser = ref(false)
    
    // Global groups management
    const globalGroups = ref([])
    const selectedGlobalGroupToAdd = ref('')
    
    // Project groups management
    const userProjectGroups = ref([])
    const loadingUserProjectGroups = ref(false)
    const updatingGroupSettings = ref(new Set())
    const removingFromGroups = ref(new Set())
    
    // Old teacher privilege management - replaced by comprehensive permissions
    
    const avatarStyles = [
      { value: 'avataaars', label: '卡通風格' },
      { value: 'bottts', label: '機器人' },
      { value: 'identicon', label: '幾何圖形' },
      { value: 'initials', label: '首字母' },
      { value: 'personas', label: '人物風格' },
      { value: 'pixel-art', label: '像素風格' }
    ]
    
    const backgroundColors = [
      { value: 'b6e3f4', label: '淺藍色' },
      { value: 'c0aede', label: '淺紫色' },
      { value: 'd1d4f9', label: '淺靛色' },
      { value: 'ffd93d', label: '黃色' },
      { value: '6bcf7f', label: '綠色' },
      { value: 'ffb3ba', label: '粉色' },
      { value: 'ffdfba', label: '橘色' },
      { value: 'bae1ff', label: '天藍色' }
    ]
    
    const clothesColors = [
      { value: '3c4858', label: '深藍色' },
      { value: 'e74c3c', label: '紅色' },
      { value: '2ecc71', label: '綠色' },
      { value: 'f1c40f', label: '黃色' },
      { value: '9b59b6', label: '紫色' },
      { value: 'ecf0f1', label: '白色' },
      { value: '34495e', label: '深灰色' },
      { value: 'e67e22', label: '橘色' }
    ]

    // Available global permissions (for display purposes)
    const availablePermissions = [
      { 
        code: 'create_project', 
        name: '建立專案', 
        description: '可以建立新的專案',
        icon: 'fas fa-plus-circle'
      },
      { 
        code: 'system_admin', 
        name: '系統管理員', 
        description: '完整的系統管理權限',
        icon: 'fas fa-cogs'
      },
      { 
        code: 'manage_users', 
        name: '使用者管理', 
        description: '管理使用者帳號和權限',
        icon: 'fas fa-users'
      },
      { 
        code: 'generate_invites', 
        name: '產生邀請碼', 
        description: '生成新的邀請碼',
        icon: 'fas fa-envelope'
      },
      { 
        code: 'view_system_logs', 
        name: '查看系統日誌', 
        description: '查看系統操作記錄',
        icon: 'fas fa-list-alt'
      },
      { 
        code: 'manage_global_groups', 
        name: '管理全域群組', 
        description: '建立和管理全域群組',
        icon: 'fas fa-layer-group'
      },
      { 
        code: 'manage_tags', 
        name: '管理標籤', 
        description: '建立和管理標籤系統',
        icon: 'fas fa-tags'
      },
      { 
        code: 'teacher_privilege', 
        name: '教師權限', 
        description: '可以進行教師投票功能',
        icon: 'fas fa-chalkboard-teacher'
      }
    ]

    const inviteForm = reactive({
      targetEmails: '',
      validDays: 7,
      defaultTags: [], // Array of tag IDs to assign to new users
      defaultGlobalGroups: [] // Array of global group IDs to assign to new users
    })

    // 使用 computed 來計算統計數據
    const stats = computed(() => {
      try {
        const usersArray = users.value || []
        const result = {
          totalUsers: usersArray.length,
          activeUsers: usersArray.filter(u => u.status === 'active').length,
          inactiveUsers: usersArray.filter(u => u.status === 'inactive').length
        }
        console.log('Stats computed:', result)
        return result
      } catch (error) {
        console.error('Error in stats computed:', error)
        return {
          totalUsers: 0,
          activeUsers: 0,
          inactiveUsers: 0
        }
      }
    })

    const filteredUsers = computed(() => {
      try {
        let filtered = users.value || []

        if (searchText.value) {
          const search = searchText.value.toLowerCase()
          filtered = filtered.filter(user => 
            user && user.username && user.username.toLowerCase().includes(search) ||
            user && user.userEmail && user.userEmail.toLowerCase().includes(search) ||
            (user && user.displayName && user.displayName.toLowerCase().includes(search))
          )
        }

        if (statusFilter.value) {
          filtered = filtered.filter(user => user && user.status === statusFilter.value)
        }

        return filtered.sort((a, b) => {
          const aTime = a && a.registrationTime ? a.registrationTime : 0
          const bTime = b && b.registrationTime ? b.registrationTime : 0
          return bTime - aTime
        })
      } catch (error) {
        console.error('Error in filteredUsers computed:', error)
        return []
      }
    })

    // Invitation management computed properties
    const filteredInvitations = computed(() => {
      let filtered = invitations.value || []

      // 根據開關決定是否顯示停用的邀請碼
      if (!showDeactivatedInvitations.value) {
        filtered = filtered.filter(invite => 
          invite.status !== 'deactivated'
        )
      }

      if (inviteSearchText.value) {
        const search = inviteSearchText.value.toLowerCase()
        filtered = filtered.filter(invite => 
          (invite.targetEmail && invite.targetEmail.toLowerCase().includes(search)) ||
          invite.createdBy.toLowerCase().includes(search)
        )
      }

      if (inviteStatusFilter.value) {
        filtered = filtered.filter(invite => {
          const now = Date.now()
          if (inviteStatusFilter.value === 'active') {
            return invite.status === 'active' && invite.expiryTime > now
          } else if (inviteStatusFilter.value === 'expired') {
            return invite.expiryTime <= now
          } else if (inviteStatusFilter.value === 'used') {
            return invite.status === 'used'
          } else if (inviteStatusFilter.value === 'deactivated') {
            return invite.status === 'deactivated'
          }
          return true
        })
      }

      return filtered.sort((a, b) => b.createdTime - a.createdTime)
    })

    const invitationStats = computed(() => {
      const now = Date.now()
      const inviteList = invitations.value || []
      return {
        total: inviteList.length,
        active: inviteList.filter(i => i.status === 'active' && i.expiryTime > now).length,
        expired: inviteList.filter(i => i.expiryTime <= now).length,
        used: inviteList.filter(i => i.status === 'used').length,
        deactivated: inviteList.filter(i => i.status === 'deactivated').length
      }
    })
    
    const availableTagsForUser = computed(() => {
      try {
        if (!selectedUser.value) return []
        
        const userTagIds = (selectedUser.value.tags || []).map(t => t && t.tagId).filter(Boolean)
        let filtered = (allTags.value || []).filter(tag => tag && tag.tagId && !userTagIds.includes(tag.tagId))
        
        if (filteredTagSearchText.value) {
          const search = filteredTagSearchText.value.toLowerCase()
          filtered = filtered.filter(tag => 
            tag && tag.tagName && tag.tagName.toLowerCase().includes(search) ||
            (tag && tag.description && tag.description.toLowerCase().includes(search))
          )
        }
        
        return filtered || []
      } catch (error) {
        console.error('Error in availableTagsForUser computed:', error)
        return []
      }
    })
    
    const availableTagsForEditingUser = computed(() => {
      try {
        if (!editingUser.value) return []
        
        const userTagIds = (editingUser.value.tags || []).map(t => t && t.tagId).filter(Boolean)
        return (allTags.value || []).filter(tag => 
          tag && tag.isActive && tag.tagId && !userTagIds.includes(tag.tagId)
        ) || []
      } catch (error) {
        console.error('Error in availableTagsForEditingUser computed:', error)
        return []
      }
    })
    
    // Compute user's global permissions based on group memberships
    const userGlobalPermissions = computed(() => {
      try {
        if (!editingUser.value || !editingUser.value.globalGroups) return []
        
        const userPermissions = new Set()
        
        // Iterate through user's global groups
        editingUser.value.globalGroups.forEach(group => {
          if (group.globalPermissions) {
            try {
              const permissions = typeof group.globalPermissions === 'string' 
                ? JSON.parse(group.globalPermissions) 
                : group.globalPermissions
              
              if (Array.isArray(permissions)) {
                permissions.forEach(permissionCode => {
                  userPermissions.add(permissionCode)
                })
              }
            } catch (error) {
              console.error('Error parsing group permissions:', error)
            }
          }
        })
        
        // Map permission codes to display objects
        return availablePermissions.filter(permission => 
          userPermissions.has(permission.code)
        )
      } catch (error) {
        console.error('Error computing user global permissions:', error)
        return []
      }
    })

    const availableGlobalGroups = computed(() => {
      if (!editingUser.value) return []
      const userGroupIds = (editingUser.value.globalGroups || []).map(g => g.groupId)
      return (globalGroups.value || []).filter(group => 
        !userGroupIds.includes(group.groupId)
      )
    })
    
    // Current avatar URL (shows the actual current avatar)
    const currentAvatarUrl = computed(() => {
      if (avatarError.value || !originalUser.value) {
        return generateInitialsAvatar(originalUser.value)
      }
      
      const seed = originalUser.value.avatarSeed || `${originalUser.value.userEmail}_${Date.now()}`
      const style = originalUser.value.avatarStyle || 'avataaars'
      
      // Parse avatarOptions from original user data
      let options = {}
      if (originalUser.value.avatarOptions) {
        if (typeof originalUser.value.avatarOptions === 'string') {
          try {
            options = JSON.parse(originalUser.value.avatarOptions)
          } catch (e) {
            console.warn('Failed to parse avatarOptions:', e)
            options = {}
          }
        } else {
          options = originalUser.value.avatarOptions
        }
      }
      
      return generateDicebearUrl(seed, style, options)
    })
    
    // Preview avatar URL (shows changes)
    const previewAvatarUrl = computed(() => {
      if (avatarError.value || !editingUser.value) {
        return generateInitialsAvatar(editingUser.value)
      }
      
      const seed = editingUser.value.avatarSeed || `${editingUser.value.userEmail}_${Date.now()}`
      const style = editingUser.value.avatarStyle || 'avataaars'
      
      // Parse avatarOptions from string if needed (consistent with UserSettings)
      let options = {}
      if (editingUser.value.avatarOptions) {
        if (typeof editingUser.value.avatarOptions === 'string') {
          try {
            options = JSON.parse(editingUser.value.avatarOptions)
          } catch (e) {
            console.warn('Failed to parse avatarOptions:', e)
            options = {}
          }
        } else {
          options = editingUser.value.avatarOptions
        }
      }
      
      // Use currentAvatarOptions for any runtime changes
      const mergedOptions = { ...options, ...currentAvatarOptions.value }
      
      return generateDicebearUrl(seed, style, mergedOptions)
    })
    
    // Check if there are avatar changes
    const hasAvatarChanges = computed(() => {
      if (!originalUser.value || !editingUser.value) return false
      
      return (
        originalUser.value.avatarStyle !== editingUser.value.avatarStyle ||
        originalUser.value.avatarSeed !== editingUser.value.avatarSeed ||
        JSON.stringify(originalUser.value.avatarOptions) !== JSON.stringify(editingUser.value.avatarOptions) ||
        Object.keys(currentAvatarOptions.value).length > 0
      )
    })
    
    // Editing user avatar URL
    const editingUserAvatarUrl = computed(() => {
      if (editingUserAvatarError.value || !editingUser.value) {
        return generateInitialsAvatar(editingUser.value)
      }
      
      const seed = editingUser.value.avatarSeed || `${editingUser.value.userEmail}_${Date.now()}`
      const style = editingUser.value.avatarStyle || 'avataaars'
      
      // Use editingUserAvatarOptions for current changes
      return generateDicebearUrl(seed, style, editingUserAvatarOptions.value)
    })
    
    // Check if there are any changes to save
    const hasUserChanges = computed(() => {
      if (!originalUser.value || !editingUser.value) return false
      
      return (
        originalUser.value.displayName !== editingUser.value.displayName ||
        originalUser.value.status !== editingUser.value.status ||
        editingUserAvatarChanged.value
      )
    })

    const formatTime = (timestamp) => {
      if (!timestamp) return null
      return new Date(timestamp).toLocaleString('zh-TW')
    }
    
    // 安全地獲取 stats 值
    const getStatValue = (key) => {
      try {
        const statsObj = stats.value
        if (statsObj && typeof statsObj === 'object' && key in statsObj) {
          return statsObj[key]
        }
        return 0
      } catch (error) {
        console.error('Error getting stat value:', key, error)
        return 0
      }
    }

    const loadUsers = async () => {
      console.log('=== loadUsers called ===')
      loading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        ElMessage.info('開始更新使用者列表')
        
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          users.value = [] // 確保有預設值
          return
        }
        
        console.log('ApiClient check in loadUsers:', apiClient)
        if (!apiClient) {
          throw new Error('ApiClient not available')
        }
        
        // 使用管理員專用API獲取所有用戶
        console.log('Calling API: /admin/users/list')
        const response = await apiClient.callWithAuth('/admin/users/list', { 
        })
        
        console.log('API Response:', response)
        
        if (response.success && response.data) {
          users.value = response.data
          console.log('Users loaded:', users.value.length, 'users')
          ElMessage.success('使用者列表資料下載完成')
        } else {
          console.error('Failed to load users:', response.error)
          users.value = [] // 確保有預設值
          ElMessage.error(`無法載入使用者資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading users:', error)
        users.value = [] // 確保在錯誤情況下也有預設值
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入使用者資料失敗，請重試')
      } finally {
        loading.value = false
        console.log('loadUsers completed, loading:', loading.value)
      }
    }


    const refreshUsers = () => {
      loadUsers()
    }

    const openInviteManagement = () => {
      showInviteDrawer.value = true
      // 重置摺疊面板狀態（初始為摺疊）
      inviteCollapse.value = []
      // 立即載入最新的邀請碼資料
      loadInvitations()
    }

    const toggleUserStatus = async (user) => {
      try {
        const newStatus = user.status === 'active' ? 'inactive' : 'active'
        
        // 使用管理員專用API更新用戶狀態
        const response = await apiClient.callWithAuth('/admin/users/update-status', {
          userEmail: user.userEmail,
          status: newStatus
        })
        
        if (response.success) {
          user.status = newStatus
          alert(`用戶狀態已${newStatus === 'active' ? '啟用' : '停用'}`)
        } else {
          alert(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Toggle user status error:', error)
        alert('操作失敗，請重試')
      }
    }

    const resetPassword = (user) => {
      selectedUser.value = user
      newPassword.value = ''
      showPasswordModal.value = true
    }

    const confirmPasswordReset = async () => {
      if (!newPassword.value || newPassword.value.length < 6) {
        alert('密碼必須至少6個字符')
        return
      }

      resetting.value = true
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          alert('Session 已過期，請重新登入')
          return
        }
        
        // 使用管理員專用的密碼重設API
        const response = await apiClient.callWithAuth('/admin/users/reset-password', {
          userEmail: selectedUser.value.userEmail,
          newPassword: newPassword.value
        })
        
        if (response.success) {
          alert('密碼重設成功')
          showPasswordModal.value = false
          newPassword.value = ''
        } else {
          alert(`密碼重設失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Password reset error:', error)
        alert('密碼重設失敗，請重試')
      } finally {
        resetting.value = false
      }
    }

    const toggleDefaultTag = (tagId) => {
      const index = inviteForm.defaultTags.indexOf(tagId)
      if (index === -1) {
        inviteForm.defaultTags.push(tagId)
      } else {
        inviteForm.defaultTags.splice(index, 1)
      }
    }
    
    const toggleDefaultGlobalGroup = (groupId) => {
      const index = inviteForm.defaultGlobalGroups.indexOf(groupId)
      if (index === -1) {
        inviteForm.defaultGlobalGroups.push(groupId)
      } else {
        inviteForm.defaultGlobalGroups.splice(index, 1)
      }
    }
    
    // 新增方法：根據ID獲取標籤
    const getTagById = (tagId) => {
      return allTags.value.find(tag => tag.tagId === tagId)
    }
    
    // 新增方法：根據ID獲取全域群組
    const getGlobalGroupById = (groupId) => {
      return globalGroups.value.find(group => group.groupId === groupId)
    }
    
    // 新增方法：移除預設標籤
    const removeDefaultTag = (tagId) => {
      const index = inviteForm.defaultTags.indexOf(tagId)
      if (index !== -1) {
        inviteForm.defaultTags.splice(index, 1)
      }
    }
    
    // 新增方法：移除預設全域群組
    const removeDefaultGlobalGroup = (groupId) => {
      const index = inviteForm.defaultGlobalGroups.indexOf(groupId)
      if (index !== -1) {
        inviteForm.defaultGlobalGroups.splice(index, 1)
      }
    }

    // 編輯使用者相關方法
    const removeSelectedTag = (tagId) => {
      const index = selectedTagsToAdd.value.indexOf(tagId)
      if (index !== -1) {
        selectedTagsToAdd.value.splice(index, 1)
      }
    }

    const removeSelectedGroup = (groupId) => {
      const index = selectedGroupsToAdd.value.indexOf(groupId)
      if (index !== -1) {
        selectedGroupsToAdd.value.splice(index, 1)
      }
    }

    const removeUserTag = async (tag) => {
      if (!confirm(`確定要移除標籤「${tag.tagName}」嗎？`)) {
        return
      }

      try {
        const response = await apiClient.callWithAuth('/tags/unassign/user', {
          userEmail: editingUser.value.userEmail,
          tagId: tag.tagId
        })

        if (response.success) {
          // 從使用者標籤中移除
          editingUser.value.tags = editingUser.value.tags.filter(t => t.tagId !== tag.tagId)
          const { ElMessage } = await import('element-plus')
          ElMessage.success(`標籤「${tag.tagName}」已移除`)
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing tag from user:', error)
        alert('移除標籤失敗，請重試')
      }
    }

    const removeUserFromGroup = async (membership) => {
      const groupName = getGlobalGroupById(membership.groupId)?.groupName || membership.groupId
      if (!confirm(`確定要將使用者從群組「${groupName}」中移除嗎？`)) {
        return
      }

      try {
        const response = await apiClient.callWithAuth('/admin/remove-user-from-global-group', {
          groupId: membership.groupId,
          userEmail: editingUser.value.userEmail
        })

        if (response.success) {
          // 從群組列表中移除
          userGlobalGroups.value = userGlobalGroups.value.filter(g => g.groupId !== membership.groupId)
          const { ElMessage } = await import('element-plus')
          ElMessage.success(`已從群組「${groupName}」中移除`)
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from group:', error)
        alert('移除群組失敗，請重試')
      }
    }

    const loadUserGlobalGroups = async (userEmail) => {
      try {
        const response = await apiClient.callWithAuth('/admin/user-global-groups', {
          userEmail: userEmail
        })

        if (response.success && response.data) {
          userGlobalGroups.value = response.data
        } else {
          userGlobalGroups.value = []
        }
      } catch (error) {
        console.error('Error loading user global groups:', error)
        userGlobalGroups.value = []
      }
    }

    const generateInvite = async () => {
      // 驗證必填欄位
      if (!inviteForm.targetEmails || !inviteForm.targetEmails.trim()) {
        const { ElMessage } = await import('element-plus')
        ElMessage.error('請輸入受邀者的Email地址')
        return
      }
      
      // 解析Email列表
      const emailList = inviteForm.targetEmails
        .split('\n')
        .map(email => email.trim())
        .filter(email => email.length > 0)
      
      if (emailList.length === 0) {
        const { ElMessage } = await import('element-plus')
        ElMessage.error('請輸入至少一個Email地址')
        return
      }
      
      // 驗證Email格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const invalidEmails = emailList.filter(email => !emailRegex.test(email))
      if (invalidEmails.length > 0) {
        const { ElMessage } = await import('element-plus')
        ElMessage.error(`以下Email格式不正確: ${invalidEmails.join(', ')}`)
        return
      }
      
      generating.value = true
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          alert('Session 已過期，請重新登入')
          return
        }
        
        // 批次處理Email，每批最多50個
        const results = []
        const errors = []
        const BATCH_SIZE = 50
        
        // 將emailList分批處理
        const batches = []
        for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
          batches.push(emailList.slice(i, i + BATCH_SIZE))
        }
        
        // 初始化進度狀態
        processingStatus.value = `正在處理 0/${emailList.length} 個邀請...`
        
        // 處理每一批
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          const batchStartIndex = batchIndex * BATCH_SIZE
          
          // 更新批次進度
          processingStatus.value = `正在處理第 ${batchIndex + 1}/${batches.length} 批 (每批最多 ${BATCH_SIZE} 個)`
          
          // 如果批次內少於50個，後端會自動處理
          if (batch.length < BATCH_SIZE) {
            // 單一請求發送整批
            try {
              const response = await apiClient.callWithAuth('/invitations/generate-batch', {
                targetEmails: batch,
                validDays: inviteForm.validDays,
                defaultTags: inviteForm.defaultTags,
                defaultGlobalGroups: inviteForm.defaultGlobalGroups
              })
              
              if (response.success && response.data) {
                // 處理批次結果
                response.data.results.forEach(result => {
                  results.push(result)
                  console.log(`✅ ${result.email}: 邀請碼生成成功，郵件${result.emailSent ? '已發送' : '發送失敗'}`)
                })
                
                if (response.data.errors) {
                  response.data.errors.forEach(error => {
                    errors.push(error)
                    console.log(`❌ ${error}`)
                  })
                }
              } else {
                batch.forEach(email => {
                  errors.push(`${email}: 批次請求失敗`)
                  console.log(`❌ ${email}: 批次請求失敗`)
                })
              }
            } catch (error) {
              batch.forEach(email => {
                errors.push(`${email}: 網路請求失敗`)
                console.log(`❌ ${email}: 網路請求失敗 - ${error.message}`)
              })
            }
          } else {
            // 批次大小為50，逐個處理以顯示進度
            for (let i = 0; i < batch.length; i++) {
              const email = batch[i]
              const overallIndex = batchStartIndex + i + 1
              
              // 更新進度顯示
              processingStatus.value = `正在處理 ${overallIndex}/${emailList.length} 個邀請: ${email}`
              
              try {
                const response = await apiClient.callWithAuth('/invitations/generate', {
                  targetEmail: email,
                  validDays: inviteForm.validDays,
                  defaultTags: inviteForm.defaultTags,
                  defaultGlobalGroups: inviteForm.defaultGlobalGroups
                })
                
                if (response.success && response.data) {
                  results.push({
                    email: email,
                    invitationCode: response.data.invitationCode || response.data.code,
                    expiryTime: response.data.expiryTime,
                    emailSent: response.data.emailSent || false
                  })
                  console.log(`✅ ${email}: 邀請碼生成成功，郵件${response.data.emailSent ? '已發送' : '發送失敗'}`)
                } else {
                  errors.push(`${email}: ${response.error?.message || '未知錯誤'}`)
                  console.log(`❌ ${email}: ${response.error?.message || '未知錯誤'}`)
                }
              } catch (error) {
                errors.push(`${email}: 請求失敗`)
                console.log(`❌ ${email}: 請求失敗 - ${error.message}`)
              }
            }
          }
        }
        
        // 設定生成結果
        if (results.length > 0) {
          generatedInvite.value = {
            results: results,
            totalGenerated: results.length,
            errors: errors
          }
          
          // 重新載入邀請碼列表
          await loadInvitations()
          
          const { ElMessage } = await import('element-plus')
          const emailsSent = results.filter(r => r.emailSent).length
          const emailsFailed = results.filter(r => !r.emailSent).length
          
          if (errors.length === 0) {
            if (emailsFailed === 0) {
              ElMessage.success(`成功為 ${results.length} 個Email生成邀請碼並發送邀請信！`)
            } else {
              ElMessage.warning(`成功生成 ${results.length} 個邀請碼，但有 ${emailsFailed} 封邀請信發送失敗`)
            }
          } else {
            ElMessage.warning(`成功生成 ${results.length} 個邀請碼（${emailsSent} 封已發送），${errors.length} 個失敗`)
          }
          
          // 清空表單
          inviteForm.targetEmails = ''
          inviteForm.defaultTags = []
          inviteForm.defaultGlobalGroups = []
        } else {
          const { ElMessage } = await import('element-plus')
          ElMessage.error(`所有邀請碼生成失敗: ${errors.join('; ')}`)
        }
      } catch (error) {
        console.error('Generate invite error:', error)
        alert('生成邀請碼失敗，請重試')
      } finally {
        generating.value = false
        processingStatus.value = '' // 清空進度狀態
      }
    }

    const copyInviteCode = () => {
      navigator.clipboard.writeText(generatedInvite.value.invitationCode)
      alert('邀請碼已複製到剪貼板')
    }

    const copySpecificCode = (code) => {
      navigator.clipboard.writeText(code)
      alert('邀請碼已複製到剪貼板')
    }

    const copyAllCodes = () => {
      if (generatedInvite.value.results) {
        const allCodes = generatedInvite.value.results
          .map(result => `${result.email} > ${result.invitationCode}`)
          .join('\n')
        navigator.clipboard.writeText(allCodes)
        alert(`已複製 ${generatedInvite.value.results.length} 個邀請碼到剪貼板`)
      }
    }

    // Invitation management methods
    const loadInvitations = async () => {
      invitationsLoading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        ElMessage.info('開始更新邀請碼列表')
        
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          return
        }
        
        const response = await apiClient.callWithAuth('/invitations/list', { 
        })
        
        if (response.success && response.data) {
          invitations.value = response.data
          ElMessage.success('邀請碼列表資料下載完成')
        } else {
          console.error('Failed to load invitations:', response.error)
          ElMessage.error(`無法載入邀請碼資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading invitations:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入邀請碼資料失敗，請重試')
      } finally {
        invitationsLoading.value = false
      }
    }

    const copyInvitationCode = (code) => {
      navigator.clipboard.writeText(code)
      alert('邀請碼已複製到剪貼板')
    }

    const deactivateInvitation = async (invitation) => {
      if (!confirm(`確定要停用邀請碼「${invitation.invitationCode}」嗎？`)) {
        return
      }

      try {
        const response = await apiClient.callWithAuth('/invitations/deactivate', {
          invitationId: invitation.invitationId
        })
        
        if (response.success) {
          // 重新載入邀請碼列表以獲取最新狀態
          await loadInvitations()
          
          const { ElMessage } = await import('element-plus')
          ElMessage.success('邀請碼已停用，列表已更新')
        } else {
          alert(`停用失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error deactivating invitation:', error)
        alert('停用失敗，請重試')
      }
    }


    const getInvitationStatusClass = (invitation) => {
      const now = Date.now()
      if (invitation.expiryTime <= now) {
        return 'expired'
      } else if (invitation.status === 'used') {
        return 'used'
      } else if (invitation.status === 'active') {
        return 'active'
      } else if (invitation.status === 'deactivated') {
        return 'deactivated'
      }
      return 'inactive'
    }

    const getInvitationStatusText = (invitation) => {
      const now = Date.now()
      if (invitation.expiryTime <= now) {
        return '已過期'
      } else if (invitation.status === 'used') {
        return '已使用'
      } else if (invitation.status === 'active') {
        return '有效'
      } else if (invitation.status === 'deactivated') {
        return '已停用'
      }
      return '停用'
    }

    // User tag management methods
    const openUserTagManagement = async (user) => {
      selectedUser.value = user
      tagSearchText.value = ''
      await loadAllTags()
      await loadUserTags(user)
      showTagManagementModal.value = true
    }

    const loadAllTags = async () => {
      try {
        const response = await apiClient.callWithAuth('/tags/list', {})
        
        if (response.success && response.data) {
          allTags.value = response.data.filter(tag => tag.isActive)
        } else {
          console.error('Failed to load tags:', response.error)
          allTags.value = []
        }
      } catch (error) {
        console.error('Error loading tags:', error)
        allTags.value = []
      }
    }

    const loadUserTags = async (user) => {
      try {
        // For now, we'll assume user tags are included in the user object
        // If not, we would need to call a getUserTags API
        if (!user.tags) {
          user.tags = []
        }
      } catch (error) {
        console.error('Error loading user tags:', error)
        user.tags = []
      }
    }

    const assignTagToUser = async (user, tag) => {
      try {
        const response = await apiClient.callWithAuth('/tags/assign/user', {
          userEmail: user.userEmail,
          tagId: tag.tagId
        })
        
        if (response.success) {
          // Add tag to user's tags array
          if (!user.tags) user.tags = []
          user.tags.push({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor
          })
          
          alert(`標籤「${tag.tagName}」已分配給用戶`)
        } else {
          alert(`分配失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error assigning tag to user:', error)
        alert('分配標籤失敗，請重試')
      }
    }

    const removeTagFromUser = async (user, tag) => {
      if (!confirm(`確定要移除用戶「${user.username}」的標籤「${tag.tagName}」嗎？`)) {
        return
      }
      
      try {
        const response = await apiClient.callWithAuth('/tags/remove/user', {
          userEmail: user.userEmail,
          tagId: tag.tagId
        })
        
        if (response.success) {
          // Remove tag from user's tags array
          const tagIndex = user.tags.findIndex(t => t.tagId === tag.tagId)
          if (tagIndex !== -1) {
            user.tags.splice(tagIndex, 1)
          }
          
          alert(`標籤「${tag.tagName}」已從用戶移除`)
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing tag from user:', error)
        alert('移除標籤失敗，請重試')
      }
    }
    
    // Tag search methods
    const filterTags = () => {
      filteredTagSearchText.value = tagSearchText.value
    }
    
    const clearTagSearch = () => {
      tagSearchText.value = ''
      filteredTagSearchText.value = ''
    }

    // User editing methods
    const editUser = async (user) => {
      loadingUserData.value = true
      showEditUserDrawer.value = true
      
      try {
        // Deep clone user data for editing
        editingUser.value = JSON.parse(JSON.stringify(user))
        originalUser.value = JSON.parse(JSON.stringify(user))
        
        // Ensure tags and globalGroups are always arrays
        if (!editingUser.value.tags) {
          editingUser.value.tags = []
        }
        if (!editingUser.value.globalGroups) {
          editingUser.value.globalGroups = []
        }
        
        selectedTagsToAdd.value = []
        selectedGroupsToAdd.value = []
        
        // 用戶權限狀態會通過 computed 自動計算
        
        // 載入使用者的全域群組和專案群組
        await Promise.all([
          loadUserGlobalGroups(user.userEmail),
          loadUserProjectGroups(user.userEmail)
        ])
      
        // Ensure avatar settings are properly preserved and initialized
        // Don't override existing avatar data, only set defaults if missing
        if (!editingUser.value.avatarSeed) {
          editingUser.value.avatarSeed = user.avatarSeed || `${user.userEmail}_${Date.now()}`
        }
        if (!editingUser.value.avatarStyle) {
          editingUser.value.avatarStyle = user.avatarStyle || 'avataaars'
        }
        
        // Parse avatarOptions if it's a string, but preserve existing data
        let avatarOptions = {}
        if (user.avatarOptions) {
          if (typeof user.avatarOptions === 'string') {
            try {
              avatarOptions = JSON.parse(user.avatarOptions)
            } catch (e) {
              console.warn('Failed to parse user avatarOptions:', e)
              avatarOptions = {
                backgroundColor: 'b6e3f4',
                clothesColor: '3c4858',
                skinColor: 'ae5d29'
              }
            }
          } else {
            avatarOptions = { ...user.avatarOptions }
          }
        } else {
          // Default avatar options only if none exist
          avatarOptions = {
            backgroundColor: 'b6e3f4',
            clothesColor: '3c4858',
            skinColor: 'ae5d29'
          }
        }
        
        // Ensure both editing and original user have the same avatar data
        editingUser.value.avatarOptions = avatarOptions
        if (!originalUser.value.avatarOptions) {
          originalUser.value.avatarOptions = { ...avatarOptions }
        }
        currentAvatarOptions.value = { ...avatarOptions }
        editingUserAvatarOptions.value = { ...avatarOptions }
        avatarError.value = false
        editingUserAvatarError.value = false
        editingUserAvatarChanged.value = false
        
        // Load user's global groups
        try {
          await loadUserGlobalGroups(user.userEmail)
          editingUser.value.globalGroups = userGlobalGroups.value || []
          // 權限狀態會通過 computed 自動更新
        } catch (error) {
          console.error('Failed to load user global groups:', error)
          editingUser.value.globalGroups = []
          // 權限狀態會通過 computed 自動更新
        }
      } catch (error) {
        console.error('Error loading user data for editing:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入用戶資料失敗，請重試')
        showEditUserDrawer.value = false
      } finally {
        loadingUserData.value = false
      }
    }

    const cancelEditUser = () => {
      showEditUserDrawer.value = false
      editingUser.value = null
      originalUser.value = null
      selectedTagsToAdd.value = []
      editingUserAvatarChanged.value = false
      editingUserAvatarError.value = false
      editingUserAvatarOptions.value = {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }
    }

    const handleDrawerClose = (done) => {
      if (saving.value) {
        return false
      }
      done()
    }

    const removeTagFromEditingUser = (tag) => {
      if (editingUser.value && editingUser.value.tags) {
        const tagIndex = editingUser.value.tags.findIndex(t => t.tagId === tag.tagId)
        if (tagIndex !== -1) {
          editingUser.value.tags.splice(tagIndex, 1)
        }
      }
    }

    const onTagSelectionChange = () => {
      // This method can be used for validation or other logic when tags are selected
    }

    const addSelectedTagsToUser = () => {
      if (!editingUser.value || selectedTagsToAdd.value.length === 0) return

      // Ensure tags array exists
      if (!editingUser.value.tags) {
        editingUser.value.tags = []
      }

      // Add selected tags to editing user
      selectedTagsToAdd.value.forEach(tagId => {
        const tag = allTags.value.find(t => t.tagId === tagId)
        if (tag && !editingUser.value.tags.find(t => t.tagId === tagId)) {
          editingUser.value.tags.push(tag)
        }
      })

      // Clear selection
      selectedTagsToAdd.value = []
    }

    const generateDicebearUrl = (seed, style, options = {}) => {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '120',
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    }

    const generateInitialsAvatar = (user) => {
      if (!user) return ''
      const name = user.displayName || user.username || 'U'
      const initials = name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
      return `data:image/svg+xml,${encodeURIComponent(`
        <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" fill="#e1e8ed"/>
          <text x="20" y="24" font-family="Arial" font-size="16" font-weight="bold" 
                text-anchor="middle" fill="#333">${initials}</text>
        </svg>
      `)}`
    }

    const generateInitials = (user) => {
      if (!user) return 'U'
      const name = user.displayName || user.username || 'User'
      return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
    }

    const regenerateUserAvatar = () => {
      if (editingUser.value) {
        regeneratingAvatar.value = true
        // Generate new seed (consistent with UserSettings pattern)
        const timestamp = Date.now().toString()
        const emailHash = editingUser.value.userEmail.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        editingUser.value.avatarSeed = `${Math.abs(emailHash)}_${timestamp.slice(-6)}`
        
        // Reset avatar error
        avatarError.value = false
        
        setTimeout(() => {
          regeneratingAvatar.value = false
        }, 500)
      }
    }

    const handleAvatarError = () => {
      avatarError.value = true
    }

    const onAvatarStyleChange = () => {
      // Reset avatar options when style changes
      currentAvatarOptions.value = {}
      if (editingUser.value) {
        editingUser.value.avatarOptions = {}
      }
    }

    const updateAvatarOption = (key, value) => {
      if (!currentAvatarOptions.value) {
        currentAvatarOptions.value = {}
      }
      currentAvatarOptions.value[key] = value
      
      if (editingUser.value) {
        if (!editingUser.value.avatarOptions) {
          editingUser.value.avatarOptions = {}
        }
        editingUser.value.avatarOptions[key] = value
      }
    }

    // Editing user avatar methods
    const regenerateEditingUserAvatar = async () => {
      if (!editingUser.value) return
      
      regeneratingEditingUserAvatar.value = true
      try {
        // Generate new seed (consistent with UserSettings pattern)
        const timestamp = Date.now().toString()
        const emailHash = editingUser.value.userEmail.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        editingUser.value.avatarSeed = `${Math.abs(emailHash)}_${timestamp.slice(-6)}`
        
        // Reset avatar error and mark as changed
        editingUserAvatarError.value = false
        editingUserAvatarChanged.value = true
      } catch (error) {
        console.error('Error regenerating editing user avatar:', error)
      } finally {
        setTimeout(() => {
          regeneratingEditingUserAvatar.value = false
        }, 500)
      }
    }

    const handleEditingUserAvatarError = () => {
      editingUserAvatarError.value = true
    }

    const generateEditingUserInitials = () => {
      if (!editingUser.value) return 'U'
      const name = editingUser.value.displayName || editingUser.value.username || 'User'
      return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2)
    }

    const onEditingUserAvatarStyleChange = () => {
      if (!editingUser.value) return
      
      // Reset avatar options when style changes
      editingUserAvatarOptions.value = {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }
      
      editingUser.value.avatarOptions = { ...editingUserAvatarOptions.value }
      editingUserAvatarChanged.value = true
      editingUserAvatarError.value = false
    }

    const updateEditingUserAvatarOption = (key, value) => {
      if (!editingUserAvatarOptions.value) {
        editingUserAvatarOptions.value = {}
      }
      editingUserAvatarOptions.value[key] = value
      
      if (editingUser.value) {
        if (!editingUser.value.avatarOptions) {
          editingUser.value.avatarOptions = {}
        }
        editingUser.value.avatarOptions[key] = value
      }
      
      editingUserAvatarChanged.value = true
      editingUserAvatarError.value = false
    }

    const saveEditingUser = async () => {
      if (!editingUser.value || savingEditingUser.value) return

      savingEditingUser.value = true
      
      try {
        // Prepare update data
        const updateData = {
          userEmail: editingUser.value.userEmail,
          displayName: editingUser.value.displayName,
          status: editingUser.value.status
        }

        // Include avatar data if changed
        if (editingUserAvatarChanged.value) {
          updateData.avatarData = {
            avatarSeed: editingUser.value.avatarSeed,
            avatarStyle: editingUser.value.avatarStyle || 'avataaars',
            avatarOptions: editingUserAvatarOptions.value
          }
        }

        // Update user via admin API
        const response = await apiClient.callWithAuth('/admin/user-profile', updateData)
        
        if (response.success) {
          // Update the user in the users list
          const userIndex = users.value.findIndex(u => u.userEmail === editingUser.value.userEmail)
          if (userIndex !== -1) {
            users.value[userIndex] = { ...users.value[userIndex], ...editingUser.value }
          }
          
          // Reset change flags
          editingUserAvatarChanged.value = false
          
          // Show success message
          const { ElMessage } = await import('element-plus')
          ElMessage.success('用戶資料已更新')
          
          // Close drawer
          showEditUserDrawer.value = false
          editingUser.value = null
          originalUser.value = null
        } else {
          throw new Error(response.error?.message || '更新用戶資料失敗')
        }
      } catch (error) {
        console.error('Error saving editing user:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('保存失敗：' + error.message)
      } finally {
        savingEditingUser.value = false
      }
    }

    const saveUserChanges = async () => {
      if (!editingUser.value || saving.value) return

      saving.value = true
      
      try {
        // Prepare update data
        const updateData = {
          userEmail: editingUser.value.userEmail,
          displayName: editingUser.value.displayName,
          status: editingUser.value.status,
          avatarSeed: editingUser.value.avatarSeed,
          avatarStyle: editingUser.value.avatarStyle || 'avataaars',
          avatarOptions: editingUser.value.avatarOptions || {}
        }

        // Update basic user info using admin API
        const updateResponse = await apiClient.callWithAuth('/admin/user-profile', updateData)
        
        if (!updateResponse.success) {
          throw new Error(updateResponse.error?.message || '更新用戶資料失敗')
        }

        // Handle tag changes
        const originalTagIds = (originalUser.value.tags || []).map(t => t.tagId)
        const newTagIds = (editingUser.value.tags || []).map(t => t.tagId)
        
        // Remove tags that are no longer present
        const tagsToRemove = originalTagIds.filter(tagId => !newTagIds.includes(tagId))
        for (const tagId of tagsToRemove) {
          await apiClient.callWithAuth('/tags/unassign/user', {
            userEmail: editingUser.value.userEmail,
            tagId: tagId
          })
        }

        // Add new tags
        const tagsToAdd = newTagIds.filter(tagId => !originalTagIds.includes(tagId))
        for (const tagId of tagsToAdd) {
          await apiClient.callWithAuth('/tags/assign/user', {
            userEmail: editingUser.value.userEmail,
            tagId: tagId
          })
        }

        // Process selected tags to add
        if (selectedTagsToAdd.value && selectedTagsToAdd.value.length > 0) {
          for (const tagId of selectedTagsToAdd.value) {
            try {
              await apiClient.callWithAuth('/tags/assign/user', {
                userEmail: editingUser.value.userEmail,
                tagId: tagId
              })
            } catch (error) {
              console.error('Error assigning tag:', error)
            }
          }
          selectedTagsToAdd.value = [] // Clear selections after processing
        }

        // Process selected groups to add
        if (selectedGroupsToAdd.value && selectedGroupsToAdd.value.length > 0) {
          for (const groupId of selectedGroupsToAdd.value) {
            try {
              await apiClient.callWithAuth('/admin/add-user-to-global-group', {
                groupId: groupId,
                userEmail: editingUser.value.userEmail
              })
            } catch (error) {
              console.error('Error adding user to group:', error)
            }
          }
          selectedGroupsToAdd.value = [] // Clear selections after processing
        }

        // Reload user data to reflect changes
        await loadUsers()
        
        // Reload user global groups for the drawer
        if (editingUser.value && editingUser.value.userEmail) {
          await loadUserGlobalGroups(editingUser.value.userEmail)
        }

        showEditUserDrawer.value = false
        const { ElMessage } = await import('element-plus')
        ElMessage.success('使用者資料已更新')
        
      } catch (error) {
        console.error('Error saving user changes:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error(`儲存失敗: ${error.message}`)
      } finally {
        saving.value = false
      }
    }

    // Global groups management methods
    const loadGlobalGroups = async () => {
      try {
        const response = await apiClient.callWithAuth('/admin/global-groups/list', {})
        
        if (response.success && response.data) {
          globalGroups.value = response.data.filter(group => group.isActive)
        } else {
          console.error('Failed to load global groups:', response.error)
          globalGroups.value = []
        }
      } catch (error) {
        console.error('Error loading global groups:', error)
        globalGroups.value = []
      }
    }

    const addUserToGlobalGroup = async () => {
      if (!selectedGlobalGroupToAdd.value || !editingUser.value) return
      
      try {
        const group = globalGroups.value.find(g => g.groupId === selectedGlobalGroupToAdd.value)
        if (!group) return

        const response = await apiClient.callWithAuth('/admin/global-groups/add-user', {
          groupId: selectedGlobalGroupToAdd.value,
          userEmail: editingUser.value.userEmail
        })
        
        if (response.success) {
          // Add group to user's globalGroups array
          if (!editingUser.value.globalGroups) editingUser.value.globalGroups = []
          editingUser.value.globalGroups.push({
            groupId: group.groupId,
            groupName: group.groupName,
            globalPermissions: group.globalPermissions
          })
          
          selectedGlobalGroupToAdd.value = ''
          alert(`已將用戶添加到「${group.groupName}」群組`)
        } else {
          alert(`添加失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error adding user to global group:', error)
        alert('添加到全域群組失敗，請重試')
      }
    }

    const removeUserFromGlobalGroup = async (group) => {
      if (!editingUser.value || !confirm(`確定要從「${group.groupName}」群組中移除用戶嗎？`)) return
      
      try {
        const response = await apiClient.callWithAuth('/admin/global-groups/remove-user', {
          groupId: group.groupId,
          userEmail: editingUser.value.userEmail
        })
        
        if (response.success) {
          // Remove group from user's globalGroups array
          const index = editingUser.value.globalGroups.findIndex(g => g.groupId === group.groupId)
          if (index !== -1) {
            editingUser.value.globalGroups.splice(index, 1)
          }
          
          alert(`已從「${group.groupName}」群組中移除用戶`)
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from global group:', error)
        alert('從全域群組移除失敗，請重試')
      }
    }

    const getGlobalGroupPermissionText = (group) => {
      if (!group.globalPermissions) return '無特殊權限'
      
      try {
        const permissions = typeof group.globalPermissions === 'string' 
          ? JSON.parse(group.globalPermissions) 
          : group.globalPermissions
          
        const permissionTexts = {
          'system_admin': '系統管理員',
          'create_project': '專案創建',
          'manage_users': '用戶管理',
          'generate_invites': '邀請碼生成'
        }
        
        const texts = permissions.map(p => permissionTexts[p] || p).join(', ')
        return texts || '無特殊權限'
      } catch (e) {
        return '無特殊權限'
      }
    }

    // Project groups management methods
    const loadUserProjectGroups = async (userEmail) => {
      if (!userEmail) return
      
      loadingUserProjectGroups.value = true
      try {
        const response = await apiClient.callWithAuth('/admin/user-project-groups', {
          userEmail: userEmail
        })
        
        if (response.success && response.data) {
          userProjectGroups.value = response.data
        } else {
          console.error('Failed to load user project groups:', response.error)
          userProjectGroups.value = []
        }
      } catch (error) {
        console.error('Error loading user project groups:', error)
        userProjectGroups.value = []
      } finally {
        loadingUserProjectGroups.value = false
      }
    }

    const updateGroupAllowChange = async (projectGroup) => {
      const groupKey = `${projectGroup.projectId}-${projectGroup.groupId}`
      updatingGroupSettings.value.add(groupKey)
      
      try {
        const response = await apiClient.callWithAuth('/groups/update', {
          projectId: projectGroup.projectId,
          groupId: projectGroup.groupId,
          updates: {
            allowChange: projectGroup.allowChange
          }
        })
        
        if (response.success) {
          alert(`群組「${projectGroup.groupName}」的成員變更設定已更新`)
        } else {
          // 回復原始狀態
          projectGroup.allowChange = !projectGroup.allowChange
          alert(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        // 回復原始狀態
        projectGroup.allowChange = !projectGroup.allowChange
        console.error('Error updating group allow change:', error)
        alert('更新群組設定失敗，請重試')
      } finally {
        updatingGroupSettings.value.delete(groupKey)
      }
    }

    const removeUserFromProjectGroup = async (projectGroup) => {
      if (!confirm(`確定要將用戶從專案「${projectGroup.projectName}」的群組「${projectGroup.groupName}」中移除嗎？`)) {
        return
      }
      
      const groupKey = `${projectGroup.projectId}-${projectGroup.groupId}`
      removingFromGroups.value.add(groupKey)
      
      try {
        const response = await apiClient.callWithAuth('/groups/remove-member', {
          projectId: projectGroup.projectId,
          groupId: projectGroup.groupId,
          userEmail: editingUser.value.userEmail
        })
        
        if (response.success) {
          alert('已成功從群組中移除用戶')
          // 重新載入專案群組列表
          await loadUserProjectGroups(editingUser.value.userEmail)
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing user from project group:', error)
        alert('移除用戶失敗，請重試')
      } finally {
        removingFromGroups.value.delete(groupKey)
      }
    }

    // Teacher privilege management methods
    const hasTeacherPrivilege = (user) => {
      if (!user || !Array.isArray(user.globalGroups)) return false
      return user.globalGroups.some(group => {
        if (!group.globalPermissions) return false
        try {
          const permissions = typeof group.globalPermissions === 'string' 
            ? JSON.parse(group.globalPermissions) 
            : group.globalPermissions
          return Array.isArray(permissions) && permissions.includes('teacher_privilege')
        } catch (error) {
          console.error('Error parsing global permissions:', error)
          return false
        }
      })
    }

    // Permission display is now computed from user's group memberships

    onMounted(() => {
      loadUsers()
      // 邀請碼列表只在用戶點擊「邀請碼管理」時才載入
      // loadInvitations()
      loadAllTags()
      loadGlobalGroups()
    })
    
    // 在返回之前確保 stats 是可訪問的
    console.log('Before return - testing stats access:', {
      stats: stats,
      statsValue: stats.value,
      canAccessActiveUsers: stats.value ? stats.value.activeUsers : 'N/A'
    })

    return {
      users,
      searchText,
      statusFilter,
      showInviteDrawer,
      showPasswordModal,
      showTagManagementModal,
      selectedUser,
      newPassword,
      generating,
      resetting,
      generatedInvite,
      loading,
      invitationsLoading,
      processingStatus,
      inviteForm,
      // Tag management
      allTags,
      tagSearchText,
      // Invitation management
      invitations,
      inviteSearchText,
      inviteStatusFilter,
      showDeactivatedInvitations,
      filteredInvitations,
      invitationStats,
      // User editing
      showEditUserDrawer,
      editingUser,
      selectedTagsToAdd,
      saving,
      // Avatar management
      regeneratingAvatar,
      avatarError,
      currentAvatarOptions,
      avatarStyles,
      backgroundColors,
      clothesColors,
      // Editing user avatar management
      regeneratingEditingUserAvatar,
      editingUserAvatarError,
      editingUserAvatarChanged,
      editingUserAvatarOptions,
      savingEditingUser,
      // Global groups management
      globalGroups,
      selectedGlobalGroupToAdd,
      // Project groups management
      userProjectGroups,
      loadingUserProjectGroups,
      updatingGroupSettings,
      removingFromGroups,
      // Permission display
      availablePermissions,
      userGlobalPermissions,
      // Computed & Reactive
      stats,
      filteredUsers,
      availableTagsForUser,
      availableTagsForEditingUser,
      availableGlobalGroups,
      currentAvatarUrl,
      previewAvatarUrl,
      hasAvatarChanges,
      editingUserAvatarUrl,
      hasUserChanges,
      // Methods
      formatTime,
      getStatValue,
      refreshUsers,
      openInviteManagement,
      toggleUserStatus,
      resetPassword,
      confirmPasswordReset,
      generateInvite,
      toggleDefaultTag,
      toggleDefaultGlobalGroup,
      getTagById,
      getGlobalGroupById,
      removeDefaultTag,
      removeDefaultGlobalGroup,
      copyInviteCode,
      copySpecificCode,
      copyAllCodes,
      // Invitation methods
      loadInvitations,
      copyInvitationCode,
      deactivateInvitation,
      getInvitationStatusClass,
      getInvitationStatusText,
      // Tag management methods
      openUserTagManagement,
      assignTagToUser,
      removeTagFromUser,
      filterTags,
      clearTagSearch,
      // User editing methods
      editUser,
      cancelEditUser,
      handleDrawerClose,
      removeTagFromEditingUser,
      onTagSelectionChange,
      addSelectedTagsToUser,
      removeSelectedTag,
      removeSelectedGroup,
      removeUserFromGroup,
      removeUserTag,
      // Avatar methods
      generateDicebearUrl,
      generateInitialsAvatar,
      generateInitials,
      regenerateUserAvatar,
      handleAvatarError,
      onAvatarStyleChange,
      updateAvatarOption,
      saveUserChanges,
      // Editing user avatar methods
      regenerateEditingUserAvatar,
      handleEditingUserAvatarError,
      generateEditingUserInitials,
      onEditingUserAvatarStyleChange,
      updateEditingUserAvatarOption,
      saveEditingUser,
      // Global groups methods
      loadGlobalGroups,
      loadUserGlobalGroups,
      addUserToGlobalGroup,
      removeUserFromGlobalGroup,
      getGlobalGroupPermissionText,
      // Project groups methods
      loadUserProjectGroups,
      updateGroupAllowChange,
      removeUserFromProjectGroup,
      // Permission display methods
      hasTeacherPrivilege
    }
  }
}
</script>

<style scoped>
.user-management {
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

.user-stats {
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
  /*border: 1px solid #ddd;*/
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

.user-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.user-table th,
.user-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.user-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.user-table tr:hover {
  background: #f8f9fa;
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
  gap: 8px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.btn-sm i {
  margin-right: 4px;
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

.btn-warning {
  background: #ffc107;
  color: #212529;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-warning:hover,
.btn-success:hover {
  opacity: 0.9;
}

.no-data {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-data i {
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

.form-group label .required {
  color: #e74c3c;
  margin-left: 4px;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.generated-invite {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.generated-invite h4 {
  margin: 0 0 10px 0;
  color: #28a745;
}

.invite-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  background: white;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: left;
  margin: 5px 0;
  color: #2c5aa0;
  word-break: break-all;
}

.invite-codes-list {
  margin-top: 15px;
}

.invite-code-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.invite-code-item .invite-code {
  flex: 1;
  margin: 0;
  font-size: 14px;
}

.invite-errors {
  margin-top: 15px;
  padding: 10px;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
}

.invite-errors h6 {
  margin: 0 0 8px 0;
  color: #856404;
}

.invite-errors ul {
  margin: 0;
  padding-left: 20px;
  color: #856404;
}

.batch-actions {
  margin-top: 15px;
  text-align: center;
}

.help-text {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

/* Drawer Styles */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer-content {
  width: 70%;
  max-width: 1000px;
  height: 100vh;
  background: white;
  overflow-y: auto;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
}

.drawer-header {
  background: #f39c12; /* 深黃色 */
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Navy header for el-drawer */
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
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.drawer-header-navy h3 i {
  margin-right: 10px;
  opacity: 0.9;
}

.drawer-header h3 {
  margin: 0;
  color: white;
}

.drawer-header h3 i {
  margin-right: 10px;
}

.drawer-close {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 5px;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.drawer-body {
  padding: 20px;
}

.section {
  margin-bottom: 30px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px;
}

.section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.section h4 i {
  margin-right: 8px;
}

.section h5 {
  margin: 0 0 10px 0;
  color: #28a745;
  font-size: 14px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.form-row {
  display: flex;
  gap: 15px;
  align-items: flex-end;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.invitation-filters {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.invitation-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  min-width: 800px;
}

.invitation-table th,
.invitation-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.invitation-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.invitation-table tr:hover {
  background: #f8f9fa;
}

.target-email {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f0f8ff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #2c5aa0;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.expired {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.used {
  background: #fff3cd;
  color: #856404;
}

.status-badge.inactive {
  background: #e2e3e5;
  color: #6c757d;
}

.no-invitations {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-invitations i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.invite-stats {
  display: flex;
  gap: 20px;
}

.invite-stats .stat-item {
  text-align: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  flex: 1;
}

.invite-stats .stat-number {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #2c5aa0;
}

.invite-stats .stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}

.actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

/* User Tag Management Styles */
.user-tags {
  min-width: 150px;
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-badge.removable {
  padding-right: 25px;
  position: relative;
}

.tag-badge.clickable {
  cursor: pointer;
  transition: opacity 0.2s ease;
  padding-right: 25px;
  position: relative;
}

.tag-badge.clickable:hover {
  opacity: 0.8;
}

.tag-badge .fas.fa-plus {
  margin-left: 5px;
  font-size: 9px;
}

.remove-tag-btn {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: white;
  font-size: 8px;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-tag-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tag-manage-btn {
  background: #f8f9fa;
  border: 1px solid #ddd;
  color: #666;
  padding: 3px 6px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
}

.tag-manage-btn:hover {
  background: #e9ecef;
  color: #495057;
}

/* Tag Management Modal Styles */
.tag-modal {
  max-width: 600px;
  width: 95%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0 0 5px 0;
  color: #2c5aa0;
}

.modal-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.tag-management-body {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.current-tags-section,
.available-tags-section {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
}

.current-tags-section h4,
.available-tags-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.current-tags,
.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 40px;
  align-items: flex-start;
}

.tag-search {
  margin-bottom: 15px;
}

.tag-search .search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.no-tags {
  color: #999;
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  padding: 10px;
}

.no-tags i {
  color: #ccc;
}

/* Invitation Form Tag and Group Selectors */
.tag-selector, .group-selector {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  background: #f9f9f9;
}

.selected-tags-display, .selected-groups-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.selected-tags-display .el-tag, 
.selected-groups-display .el-tag {
  margin-bottom: 4px;
}

/* Legacy styles for backwards compatibility */
.tag-selection {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  background: #f9f9f9;
}

.tag-selection .available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 40px;
}

.tag-selection .tag-badge {
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  position: relative;
}

.tag-selection .tag-badge.selected {
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.tag-selection .tag-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tag-selection .tag-badge .fas.fa-check {
  margin-left: 5px;
  font-size: 9px;
}

.generate-button-row {
  margin-top: 15px;
  display: flex;
  justify-content: flex-start;
}

.generate-button-row .btn-primary {
  min-width: 140px;
}

/* User Edit Drawer Styles */
.drawer-header-custom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  border-radius: 8px;
  margin: -16px -20px 20px -20px;
}

.drawer-header-custom h3 {
  margin: 0;
  color: white;
  font-weight: 600;
}

.drawer-header-custom i {
  margin-right: 8px;
}

/* Close button styles for both drawers */
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

.drawer-close-btn:active {
  transform: scale(0.95);
}

/* Global Groups Styles */
.global-groups-display {
  min-height: 40px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #f8f9fa;
}

.global-group-tag {
  margin: 4px 8px 4px 0;
}

.global-group-tag i {
  margin-right: 6px;
}

.no-global-groups {
  color: #999;
  text-align: center;
  padding: 10px;
}

.no-global-groups i {
  margin-right: 8px;
  color: #ccc;
}

.global-group-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Global Group Selection Styles for Invitation */
.global-group-selection {
  margin-top: 10px;
}

.available-global-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #f8f9fa;
  min-height: 50px;
  align-items: flex-start;
  align-content: flex-start;
}

.global-group-badge {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 13px;
  gap: 6px;
  flex-direction: column;
  text-align: center;
  min-width: 120px;
}

.global-group-badge:hover {
  border-color: #2c5aa0;
  background: #f8f9ff;
}

.global-group-badge.selected {
  border-color: #f39c12;
  background: #fff3cd;
  color: #856404;
}

.global-group-badge i.fa-crown {
  color: #f39c12;
  font-size: 14px;
}

.global-group-badge i.fa-check {
  color: #28a745;
  font-size: 12px;
  margin-top: 4px;
}

.group-permission-hint {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  font-style: italic;
}

.global-group-badge.selected .group-permission-hint {
  color: #856404;
}

.user-edit-form {
  padding: 20px 0;
}

.form-section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.form-section:last-child {
  border-bottom: none;
}

.form-section h4 {
  color: #333;
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.form-section h4 i {
  margin-right: 8px;
  color: #2c5aa0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: #555;
}

.user-tags-editor {
  min-height: 40px;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  align-items: flex-start;
}

.tag-item {
  margin-right: 0 !important;
}

.no-tags {
  color: #999;
  font-style: italic;
  padding: 10px 0;
  display: flex;
  align-items: center;
}

.no-tags i {
  margin-right: 6px;
}

.tag-selector {
  width: 100%;
}

/* Avatar Management Styles */
.avatar-management {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-top: 15px;
}

.avatar-preview {
  flex-shrink: 0;
  position: relative;
  display: flex;
  gap: 20px;
  border: 2px solid #e1e8ed;
  border-radius: 12px;
  padding: 16px;
  background: white;
}

.current-avatar,
.preview-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.current-avatar h5,
.preview-avatar h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-align: center;
}

.current-avatar {
  position: relative;
}

.current-avatar::after {
  content: '當前';
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #2c5aa0;
  font-weight: 600;
}

.preview-avatar {
  position: relative;
}

.preview-avatar::after {
  content: '預覽';
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #f56c6c;
  font-weight: 600;
}

.avatar-controls {
  flex-grow: 1;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-group label {
  font-weight: 600;
  color: #555;
  margin: 0;
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-option {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-option.selected {
  border-color: #2c5aa0;
  box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.3);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 0 10px;
  border-top: 1px solid #eee;
}

/* Element Plus customization for drawer */
.el-drawer__body {
  padding: 20px;
}

.el-drawer__header {
  margin-bottom: 0;
  padding: 0;
  border-bottom: none;
}

/* Make sure Element Plus components look good */
.el-input {
  width: 100%;
}

.el-select {
  width: 100%;
}

.el-tag {
  margin-right: 8px;
  margin-bottom: 4px;
}

/* 進度顯示樣式 */
.processing-status {
  margin-top: 15px;
  padding: 12px 16px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  color: #495057;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.processing-status i {
  color: #007bff;
}

/* 專案群組管理樣式 */
.project-groups-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
  transition: all 0.2s ease;
}

.project-group-item:hover {
  border-color: #2c5aa0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.project-group-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.project-id {
  font-size: 12px;
  color: #7f8c8d;
  font-family: monospace;
  background: #ecf0f1;
  padding: 2px 6px;
  border-radius: 4px;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-name {
  font-size: 13px;
  color: #555;
}

.group-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.allow-change-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.allow-change-control label {
  margin: 0;
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.no-project-groups {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-style: italic;
}

.no-project-groups i {
  margin-right: 6px;
}

.loading-indicator {
  text-align: center;
  padding: 20px;
  color: #666;
}

.loading-indicator i {
  margin-right: 8px;
}

/* 邀請碼停用樣式 */
.deactivated-invitation {
  opacity: 0.6;
  background-color: #fdf2f2;
}

.deactivated-invitation td {
  text-decoration: line-through;
  color: #909399;
}

.deactivated-invitation .status-badge {
  text-decoration: none; /* 狀態徽章保持正常顯示 */
}

.deactivated-invitation .actions button {
  text-decoration: none; /* 操作按鈕保持正常顯示 */
}

/* 邀請碼過濾區域樣式 */
.invitation-filters {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.show-deactivated-switch {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.show-deactivated-switch .el-switch {
  --el-switch-on-color: #f56c6c;
  --el-switch-off-color: #dcdfe6;
}

/* 狀態徽章樣式改進 */
.status-badge.deactivated {
  background-color: #f56c6c;
  color: white;
  border: 1px solid #f56c6c;
}

/* 邀請碼生成區域流式排版樣式 */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2c5aa0;
}

.form-group .el-slider {
  padding: 0 12px;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  line-height: 1.4;
}

/* 滑動條樣式優化 */
.el-slider__runway {
  height: 6px;
  background-color: #e4e7ed;
  border-radius: 3px;
}

.el-slider__bar {
  background-color: #409eff;
  border-radius: 3px;
}

.el-slider__button {
  border: 2px solid #409eff;
  background-color: #fff;
  width: 16px;
  height: 16px;
}

.el-slider__stop {
  width: 4px;
  height: 4px;
  background-color: #c0c4cc;
  border-radius: 50%;
}

/* Teacher Privilege Styles */
.teacher-privilege-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: #f0f0f0;
  color: #666;
}

.teacher-privilege-badge.has-privilege {
  background: #e8f5e8;
  color: #2e7d2e;
}

.teacher-privilege-badge i {
  margin-right: 4px;
}

.teacher-privilege-control {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.teacher-privilege-control .current-status {
  display: flex;
  align-items: center;
}

.teacher-privilege-control .privilege-actions {
  display: flex;
  gap: 10px;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 5px;
}

.help-text i {
  color: #409eff;
}

/* 按鈕樣式補充 */
.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover {
  background: #138496;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .invitation-filters {
    flex-direction: column;
    align-items: stretch;
  }
  
  .show-deactivated-switch {
    margin-left: 0;
    justify-content: center;
  }
  
  .form-group {
    margin-bottom: 16px;
  }
  
  .teacher-privilege-control .privilege-actions {
    flex-direction: column;
  }
  
  .actions {
    flex-direction: column;
    gap: 4px;
  }
}

/* Permission Management Styles */
.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.permission-checkbox {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
  background: #fafafa;
}

.permission-checkbox:hover {
  border-color: #FF6600;
  background: #fff;
}

.permission-checkbox .el-checkbox__input.is-checked + .el-checkbox__label {
  color: #FF6600;
}

.permission-label {
  font-weight: 600;
  font-size: 14px;
  margin-left: 8px;
  color: #333;
}

.permission-desc {
  font-size: 12px;
  color: #666;
  margin-left: 8px;
  display: block;
  margin-top: 4px;
}

.permission-checkbox i {
  color: #FF6600;
  width: 16px;
  text-align: center;
}

@media (max-width: 768px) {
  .permissions-grid {
    grid-template-columns: 1fr;
  }
}

/* Editing User Avatar Styles */
.avatar-style-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.avatar-style-selector label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin: 0;
  white-space: nowrap;
}

.avatar-color-options {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
}

.color-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-group label {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin: 0;
}

.color-group .color-options {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.color-group .color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.3s;
  position: relative;
}

.color-group .color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-group .color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-group .color-option.selected::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.avatar-save-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  padding: 10px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 6px;
  font-size: 13px;
  color: #0050b3;
}

.avatar-save-notice i {
  color: #1890ff;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
}
</style>