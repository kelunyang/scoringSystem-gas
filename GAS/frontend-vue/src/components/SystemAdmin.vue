<template>
  <div class="system-admin">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="title-container">
        <h1><i class="fas fa-cog"></i> 系統管理</h1>
      </div>
      <TopBarUserControls
        :user="currentUser"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="handleUserCommand"
      />
    </div>

    <!-- Content Area -->
    <div class="content-area">
      <!-- Using El-Tabs for Navigation -->
      <el-tabs v-model="currentTab" type="card" class="admin-tabs">
        <el-tab-pane 
          v-for="tab in adminTabs" 
          :key="tab.key"
          :label="tab.name"
          :name="tab.key"
        >
          <template #label>
            <span class="tab-label">
              <i :class="tab.icon"></i>
              {{ tab.name }}
            </span>
          </template>
          
          <!-- Tab Content -->
          <div class="tab-content">
            <UserManagement v-if="tab.key === 'users' && currentTab === 'users'" />
            <ProjectManagement v-if="tab.key === 'projects' && currentTab === 'projects'" />
            <GroupManagement v-if="tab.key === 'groups' && currentTab === 'groups'" />
            <TagManagement v-if="tab.key === 'tags' && currentTab === 'tags'" />
            <NotificationManagement v-if="tab.key === 'notifications' && currentTab === 'notifications'" />
            <SystemSettings v-if="tab.key === 'settings' && currentTab === 'settings'" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
import UserManagement from './admin/UserManagement.vue'
import ProjectManagement from './admin/ProjectManagement.vue'
import GroupManagement from './admin/GroupManagement.vue'
import TagManagement from './admin/TagManagement.vue'
import SystemSettings from './admin/SystemSettings.vue'
import NotificationManagement from './admin/NotificationManagement.vue'
import TopBarUserControls from './TopBarUserControls.vue'

export default {
  name: 'SystemAdmin',
  components: {
    UserManagement,
    ProjectManagement,
    GroupManagement,
    TagManagement,
    SystemSettings,
    NotificationManagement,
    TopBarUserControls
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
  emits: ['user-command'],
  setup(props, { emit }) {
    const currentTab = ref('users')

    const adminTabs = [
      { key: 'users', name: '使用者管理', icon: 'fas fa-users' },
      { key: 'projects', name: '專案管理', icon: 'fas fa-project-diagram' },
      { key: 'groups', name: '群組管理', icon: 'fas fa-layer-group' },
      { key: 'tags', name: '標籤管理', icon: 'fas fa-tags' },
      { key: 'notifications', name: '通知管理', icon: 'fas fa-bell' },
      { key: 'settings', name: '系統設定', icon: 'fas fa-cogs' }
    ]

    const handleUserCommand = (command) => {
      emit('user-command', command)
    }

    return {
      currentTab,
      adminTabs,
      currentUser: props.user,
      handleUserCommand
    }
  }
}
</script>

<style scoped>
.system-admin {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

/* Top Bar - 與Dashboard完全一致 */
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

.title-container {
  flex: 1;
}

.title-container h1 {
  margin: 0;
  color: #2c5aa0;
  font-size: 20px;
  font-weight: 600;
}

.title-container h1 i {
  margin-right: 10px;
}

/* Content Area */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Admin Tabs */
.admin-tabs {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Tab customization */
:deep(.el-tabs__header) {
  margin-bottom: 20px;
}

:deep(.el-tabs__item) {
  padding: 0 20px;
  height: 45px;
  line-height: 45px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  transition: all 0.3s;
}

:deep(.el-tabs__item.is-active) {
  color: #FF6600;
  font-weight: 600;
}

:deep(.el-tabs__item:hover) {
  color: #FF6600;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-label i {
  font-size: 16px;
}

.tab-content {
  min-height: 500px;
}
</style>