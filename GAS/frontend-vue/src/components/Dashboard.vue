<template>
  <div class="dashboard">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="search-container">
        <el-input
          v-model="searchQuery"
          placeholder="搜尋專案名稱或描述"
          prefix-icon="Search"
          clearable
          class="search-input"
        />
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
          v-for="project in filteredProjects" 
          :key="project.id"
          :project="project"
          @enter-project="enterProject"
          @manage-group-members="openGroupMemberManagement"
          @view-event-logs="openEventLogViewer"
        />
      </div>
      
      <!-- 無專案時的提示 -->
      <div v-if="!loading && filteredProjects.length === 0" class="no-projects">
        <i class="fas fa-project-diagram"></i>
        <h3>尚無專案</h3>
        <p>目前沒有找到任何專案，請聯繫管理員分配專案。</p>
      </div>
    </div>


    <!-- 組長成員管理 Drawer -->
    <el-drawer
      v-model="memberManagementVisible"
      :title="`管理群組成員 - ${selectedGroupForManagement?.groupName}`"
      size="100%"
      direction="btt"
      :close-on-click-modal="false"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-users"></i> 管理群組成員 - {{ selectedGroupForManagement?.groupName }}</h3>
      </template>
      <div class="member-management">
        <!-- 目前成員列表 -->
        <div class="current-members-section">
          <h3><i class="fas fa-users"></i> 目前成員</h3>
          <div class="members-list">
            <div 
              v-for="member in currentGroupMembers" 
              :key="member.userEmail"
              class="member-item"
            >
              <div class="member-info">
                <i class="fas fa-user-circle"></i>
                <span class="member-email">{{ member.userEmail }}</span>
                <span class="member-role" :class="member.role">
                  {{ member.role === 'leader' ? '👑 組長' : '👥 成員' }}
                </span>
              </div>
              <div class="member-actions">
                <el-button 
                  v-if="member.role !== 'leader' && member.userEmail !== user.email"
                  type="danger" 
                  size="small"
                  @click="removeGroupMember(member)"
                >
                  <i class="fas fa-user-times"></i> 移除
                </el-button>
              </div>
            </div>
            <div v-if="currentGroupMembers.length === 0" class="no-members">
              <i class="fas fa-info-circle"></i> 目前沒有成員
            </div>
          </div>
        </div>

        <!-- 新增成員區域 -->
        <div class="add-members-section" v-loading="loadingAvailableUsers" element-loading-text="載入可用成員中...">
          <h3><i class="fas fa-user-plus"></i> 新增成員</h3>
          
          <template v-if="!loadingAvailableUsers">
            <!-- 成員選擇器 -->
            <div class="member-selector">
              <label>選擇要加入的成員</label>
              <el-select
                v-model="selectedMembersToAdd"
                multiple
                filterable
                placeholder="搜尋並選擇同標籤的使用者"
                style="width: 100%"
                @change="onMemberSelectionChange"
              >
                <el-option
                  v-for="user in availableUsersForGroup"
                  :key="user.userId"
                  :label="`${user.displayName || user.userEmail} (${user.userEmail})`"
                  :value="user.userEmail"
                >
                  <div class="user-option">
                    <div class="user-info">
                      <span class="user-name">{{ user.displayName || user.userEmail }}</span>
                      <span class="user-email">{{ user.userEmail }}</span>
                    </div>
                    <div class="user-tags">
                      <span 
                        v-for="tag in user.tags" 
                        :key="tag.tagId"
                        class="tag-badge-small"
                        :style="{ backgroundColor: tag.tagColor }"
                      >
                        {{ tag.tagName }}
                      </span>
                    </div>
                  </div>
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
                  closable
                  @close="removeMemberFromSelection(email)"
                  class="member-tag"
                >
                  <i class="fas fa-user"></i>
                  {{ getUserDisplayInfo(email) }}
                </el-tag>
              </div>
            </div>

            <!-- 批量加入按鈕 -->
            <div class="batch-add-section">
              <el-button 
                type="primary" 
                @click="batchAddMembersToGroup"
                :disabled="selectedMembersToAdd.length === 0 || addingMembers"
                style="width: 100%"
              >
                <i :class="addingMembers ? 'fas fa-spinner fa-spin' : 'fas fa-users'"></i>
                {{ addingMembers ? '加入中...' : `批量加入 ${selectedMembersToAdd.length} 位成員` }}
              </el-button>
            </div>

            <!-- 提示訊息 -->
            <div v-if="availableUsersForGroup.length === 0" class="no-available-members">
              <i class="fas fa-info-circle"></i> 
              沒有可新增的成員（同標籤且未在其他群組的使用者）
            </div>
          </template>
        </div>
      </div>
    </el-drawer>

    <!-- Event Log Viewer Drawer -->
    <el-drawer
      v-model="showEventLogDrawer"
      :title="'事件日誌' + (selectedProjectForLogs ? ' - ' + selectedProjectForLogs.title : '')"
      direction="btt"
      size="100%"
      class="event-log-drawer"
    >
      <EventLogViewer
        v-if="showEventLogDrawer && selectedProjectForLogs"
        :project-id="selectedProjectForLogs.id"
        :user-mode="true"
      />
    </el-drawer>
  </div>
</template>

<script>
import { ElMessageBox } from 'element-plus'
import ProjectCard from './ProjectCard.vue'
import TopBarUserControls from './TopBarUserControls.vue'
import EventLogViewer from './EventLogViewer.vue'

export default {
  name: 'Dashboard',
  components: {
    ProjectCard,
    TopBarUserControls,
    EventLogViewer
  },
  props: {
    user: {
      type: Object,
      default: null
    },
    sessionPercentage: {
      type: Number,
      default: 100
    },
    remainingTime: {
      type: Number,
      default: 0
    }
  },
  data() {
    return {
      searchQuery: '',
      projects: [],
      loading: true,
      // 成員管理相關
      memberManagementVisible: false,
      selectedProject: null,
      selectedGroupForManagement: null,
      currentGroupMembers: [],
      otherProjectGroupMembers: [], // 同專案其他群組的成員
      availableUsers: [],
      availableUsersForGroup: [],
      selectedMembersToAdd: [], // 新增：選中要加入的成員
      addingMembers: false, // 新增：批量加入狀態
      loadingAvailableUsers: false,
      // 事件日志相關
      showEventLogDrawer: false,
      selectedProjectForLogs: null
    }
  },
  emits: ['enter-project', 'user-command'],
  computed: {
    filteredProjects() {
      if (!this.searchQuery) return this.projects
      return this.projects.filter(project =>
        project.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(this.searchQuery.toLowerCase())
      )
    }
  },
  watch: {
    // 移除 memberSearchQuery 的 watch，因為改用 el-select 的內建搜尋功能
  },
  methods: {
    enterProject(project) {
      console.log('進入專案:', project)
      // 發送事件到父組件 App.vue
      this.$emit('enter-project', project)
    },


    getRankDisplay(rank) {
      const medals = ['🥇', '🥈', '🥉']
      return rank <= 3 ? medals[rank - 1] : `${rank}.`
    },
    
    async loadProjects() {
      this.loading = true
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.log('No session found - user needs to login')
          this.projects = [] // 清空專案列表
          this.loading = false
          return
        }
        
        const response = await this.$apiClient.getProjectsListWithStages()
        
        if (response.success && response.data) {
          // 轉換後端數據格式為前端所需格式
          this.projects = response.data
            .filter(proj => proj.status !== 'archived') // Filter out archived projects from user view
            .map(proj => {
              // Filter out archived stages from user view
              const filteredStages = proj.stages
                ? proj.stages.filter(stage => stage.status !== 'archived')
                : this.generateStages(proj.currentStage, proj.totalStages)

              return {
                id: proj.projectId,
                title: proj.projectName,
                description: proj.description,
                status: proj.status,
                statusText: proj.status === 'active' ? '進行中' : proj.status === 'completed' ? '已完成' : '已封存',
                currentStage: proj.currentStage,
                totalStages: proj.totalStages,
                stages: filteredStages,
                isCreator: proj.isCreator,
                isLeader: proj.isLeader,
                userGroups: proj.userGroups || [],
                tags: proj.tags || [],
                rawData: proj // 保留原始數據
              }
            })
        } else {
          // 只在有sessionId的情況下才顯示錯誤訊息
          if (sessionId) {
            this.$handleError('無法載入專案列表', {
              action: '載入專案'
            })
          }
        }
      } catch (error) {
        // 只在有sessionId的情況下才顯示錯誤訊息
        const sessionId = localStorage.getItem('sessionId')
        if (sessionId) {
          console.error('Error loading projects:', error)
        }
      } finally {
        this.loading = false
      }
    },

    generateStages(currentStage, totalStages) {
      const stages = []
      for (let i = 1; i <= totalStages; i++) {
        stages.push({
          label: `階段 ${i}`,
          status: i < currentStage ? 'completed' : i === currentStage ? 'active' : 'pending'
        })
      }
      return stages
    },

    async openGroupMemberManagement(project) {
      // 找到用戶為組長的群組
      const leaderGroup = project.userGroups.find(g => g.role === 'leader')
      if (!leaderGroup) {
        this.$message.warning('您不是任何群組的組長')
        return
      }

      // 檢查群組是否允許變更成員
      if (leaderGroup.allowChange === false) {
        this.$message.warning('此群組已被鎖定，無法變更成員')
        return
      }

      this.selectedProject = project
      this.selectedGroupForManagement = leaderGroup
      this.selectedMembersToAdd = [] // 重置選中的成員
      this.addingMembers = false
      this.memberManagementVisible = true
      
      // 載入目前群組成員、其他群組成員和可用成員
      await Promise.all([
        this.loadGroupMembers(project.id, leaderGroup.groupId),
        this.loadOtherProjectGroupMembers(project.id, leaderGroup.groupId),
        this.loadAvailableUsers()
      ])
    },

    async loadGroupMembers(projectId, groupId) {
      try {
        const response = await this.$apiClient.callWithAuth('/groups/details', {
          projectId,
          groupId
        })

        if (response.success && response.data) {
          this.currentGroupMembers = response.data.members || []
        } else {
          this.$message.error('無法載入群組成員')
          this.currentGroupMembers = []
        }
      } catch (error) {
        console.error('Error loading group members:', error)
        this.currentGroupMembers = []
      }
    },

    async loadOtherProjectGroupMembers(projectId, currentGroupId) {
      try {
        // 獲取專案的所有群組列表
        const response = await this.$apiClient.callWithAuth('/groups/list', {
          projectId,
          includeInactive: false
        })

        if (response.success && response.data) {
          // 過濾出其他群組（不是當前群組）
          const otherGroups = response.data.filter(g => g.groupId !== currentGroupId)
          
          // 收集所有其他群組的成員
          const otherMembers = []
          for (const group of otherGroups) {
            if (group.members && group.members.length > 0) {
              group.members.forEach(member => {
                otherMembers.push({
                  ...member,
                  groupName: group.groupName,
                  groupId: group.groupId
                })
              })
            }
          }
          
          this.otherProjectGroupMembers = otherMembers
        } else {
          this.otherProjectGroupMembers = []
        }
      } catch (error) {
        console.error('Error loading other project group members:', error)
        this.otherProjectGroupMembers = []
      }
    },

    async loadAvailableUsers() {
      this.loadingAvailableUsers = true
      try {
        // 獲取與目前用戶共享標籤的使用者
        const response = await this.$apiClient.callWithAuth('/users/shared-tags', {})
        
        if (response.success && response.data) {
          this.availableUsers = response.data
          this.filterAvailableUsers()
        } else {
          this.availableUsers = []
        }
      } catch (error) {
        console.error('Error loading available users:', error)
        this.availableUsers = []
      } finally {
        this.loadingAvailableUsers = false
      }
    },

    filterAvailableUsers() {
      // 過濾掉已經在當前群組中的成員
      const currentMemberEmails = this.currentGroupMembers.map(m => m.userEmail)
      
      // 過濾掉已經在其他群組中的成員
      const otherGroupMemberEmails = this.otherProjectGroupMembers.map(m => m.userEmail)
      
      // 合併所有已占用的email
      const occupiedEmails = new Set([...currentMemberEmails, ...otherGroupMemberEmails])
      
      // 只過濾已占用的用戶，不做文字搜尋（el-select 內建搜尋）
      this.availableUsersForGroup = this.availableUsers.filter(u => !occupiedEmails.has(u.userEmail))
    },

    // 新的批量加入方法
    async batchAddMembersToGroup() {
      if (this.selectedMembersToAdd.length === 0) return

      this.addingMembers = true
      try {
        const failedUsers = []
        const successfulUsers = []

        // 逐一加入成員
        for (const userEmail of this.selectedMembersToAdd) {
          try {
            const response = await this.$apiClient.callWithAuth('/groups/add-member', {
              projectId: this.selectedProject.id,
              groupId: this.selectedGroupForManagement.groupId,
              userEmail: userEmail,
              role: 'member'
            })

            if (response.success) {
              successfulUsers.push(userEmail)
            } else {
              failedUsers.push({ userEmail, error: response.error?.message || '未知錯誤' })
            }
          } catch (error) {
            failedUsers.push({ userEmail, error: error.message })
          }
        }

        // 重新載入數據
        await Promise.all([
          this.loadGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId),
          this.loadOtherProjectGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId)
        ])
        this.filterAvailableUsers()

        // 清空選擇
        this.selectedMembersToAdd = []

        // 顯示結果
        if (successfulUsers.length > 0) {
          this.$message.success(`成功加入 ${successfulUsers.length} 位成員`)
        }
        if (failedUsers.length > 0) {
          this.$message.error(`${failedUsers.length} 位成員加入失敗`)
          console.error('Failed to add users:', failedUsers)
        }

      } catch (error) {
        console.error('Error in batch add members:', error)
        this.$message.error('批量加入成員失敗')
      } finally {
        this.addingMembers = false
      }
    },

    // 成員選擇相關方法
    onMemberSelectionChange() {
      // el-select 的變更事件，目前不需要特別處理
    },

    removeMemberFromSelection(email) {
      this.selectedMembersToAdd = this.selectedMembersToAdd.filter(e => e !== email)
    },

    getUserDisplayInfo(email) {
      const user = this.availableUsersForGroup.find(u => u.userEmail === email)
      return user ? (user.displayName || email) : email
    },

    // 保留原有的單個加入方法（可選）
    async addMemberToGroup(user) {
      try {
        const response = await this.$apiClient.callWithAuth('/groups/add-member', {
          projectId: this.selectedProject.id,
          groupId: this.selectedGroupForManagement.groupId,
          userEmail: user.userEmail,
          role: 'member'
        })

        if (response.success) {
          this.$message.success(`已將 ${user.displayName || user.userEmail} 加入群組`)
          // 重新載入成員列表和其他群組成員列表
          await Promise.all([
            this.loadGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId),
            this.loadOtherProjectGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId)
          ])
          this.filterAvailableUsers()
        } else {
          this.$message.error(response.error?.message || '加入成員失敗')
        }
      } catch (error) {
        console.error('Error adding member:', error)
        this.$message.error('加入成員失敗')
      }
    },

    async removeGroupMember(member) {
      try {
        await ElMessageBox.confirm(
          `確定要將 ${member.userEmail} 從群組中移除嗎？`,
          '確認移除',
          {
            confirmButtonText: '確定',
            cancelButtonText: '取消',
            type: 'warning',
          }
        )
        
        const response = await this.$apiClient.callWithAuth('/groups/remove-member', {
          projectId: this.selectedProject.id,
          groupId: this.selectedGroupForManagement.groupId,
          userEmail: member.userEmail
        })

        if (response.success) {
          this.$message.success(`已移除成員 ${member.userEmail}`)
          // 重新載入成員列表和其他群組成員列表
          await Promise.all([
            this.loadGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId),
            this.loadOtherProjectGroupMembers(this.selectedProject.id, this.selectedGroupForManagement.groupId)
          ])
          this.filterAvailableUsers()
        } else {
          this.$message.error(response.error?.message || '移除成員失敗')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Error removing member:', error)
          this.$message.error('移除成員失敗')
        }
      }
    },

    // 事件日志
    openEventLogViewer(project) {
      this.selectedProjectForLogs = project
      this.showEventLogDrawer = true
    },

    // 移除重複的apiCall方法，統一使用$apiClient
  },
  async mounted() {
    console.log('Dashboard mounted successfully')
    await this.loadProjects()
  }
}
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
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.search-container {
  flex: 1;
  max-width: 600px;
  margin-right: 20px;
  border: none;
  background: transparent;
}

.search-input {
  width: 100%;
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

/* 成員管理樣式 */
.member-management {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.current-members-section,
.add-members-section {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  background: #f9f9f9;
}

.current-members-section h3,
.add-members-section h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.member-info i {
  font-size: 20px;
  color: #7f8c8d;
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
  min-height: 50px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 500;
  color: #2c3e50;
}

.user-email {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.user-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
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
  min-height: 50px;
  padding: 8px 12px;
  line-height: 1.4;
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

.batch-add-section {
  margin-top: 20px;
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
</style>