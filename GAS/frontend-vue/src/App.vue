<template>
  <div class="app-root">
    <!-- Main App Layout -->
    <div class="app-layout">
      <!-- Content Container -->
      <div class="content-container">
        <!-- Mobile Hamburger Button (only visible in portrait mode) -->
        <div class="mobile-hamburger" @click="toggleMobileSidebar">
          <i class="fas fa-bars"></i>
        </div>
        
        <!-- Mobile Sidebar Overlay -->
        <div 
          v-if="showMobileSidebar" 
          class="mobile-sidebar-overlay" 
          @click="closeMobileSidebar"
        ></div>
        
        <!-- Custom Sidebar -->
        <div class="sidebar" :class="{ 
          collapsed: sidebarCollapsed,
          'mobile-open': showMobileSidebar 
        }">
          <!-- Header with collapse button -->
          <div class="sidebar-header">
            <div class="header-content">
              <h3 v-if="!sidebarCollapsed && currentPage !== 'project'">評分系統</h3>
              <h3 v-if="!sidebarCollapsed && currentPage === 'project'" class="project-title">個別專案的主頁面</h3>
              <i v-else class="fas fa-tachometer-alt header-icon"></i>
            </div>
            <!-- Desktop collapse button -->
            <button class="collapse-btn desktop-only" @click="toggleSidebar">
              <i :class="sidebarCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
            </button>
            <!-- Mobile close button -->
            <button class="collapse-btn mobile-only" @click="closeMobileSidebar">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <!-- Navigation -->
          <nav class="sidebar-nav">
            <!-- Dashboard 頁面的導航 -->
            <template v-if="currentPage !== 'project'">
              <div 
                class="nav-item" 
                :class="{ active: currentPage === 'dashboard' }" 
                @click="handleNavigation('dashboard')"
              >
                <i class="fas fa-home"></i>
                <span v-if="!sidebarCollapsed">首頁</span>
              </div>
              
              <div 
                class="nav-item" 
                :class="{ active: currentPage === 'wallet' }" 
                @click="handleNavigation('wallet')"
              >
                <i class="fas fa-wallet"></i>
                <span v-if="!sidebarCollapsed">錢包</span>
              </div>
              
              <!-- System Admin Navigation (只有總PM可見) -->
              <div 
                v-if="user && isSystemAdmin" 
                class="nav-item" 
                :class="{ active: currentPage === 'admin' }" 
                @click="handleNavigation('admin')"
              >
                <i class="fas fa-cog"></i>
                <span v-if="!sidebarCollapsed">系統管理</span>
              </div>
            </template>

            <!-- 專案頁面的導航 - 使用標準三件套 -->
            <template v-if="currentPage === 'project'">
              <div 
                class="nav-item" 
                :class="{ active: currentPage === 'dashboard' }" 
                @click="handleNavigation('dashboard')"
              >
                <i class="fas fa-home"></i>
                <span v-if="!sidebarCollapsed">首頁</span>
              </div>
              
              <div 
                class="nav-item" 
                :class="{ active: currentPage === 'wallet' }" 
                @click="handleNavigation('wallet')"
              >
                <i class="fas fa-wallet"></i>
                <span v-if="!sidebarCollapsed">錢包</span>
              </div>
              
              <!-- System Admin Navigation (只有總PM可見) -->
              <div 
                v-if="user && isSystemAdmin" 
                class="nav-item" 
                :class="{ active: currentPage === 'admin' }" 
                @click="handleNavigation('admin')"
              >
                <i class="fas fa-cog"></i>
                <span v-if="!sidebarCollapsed">系統管理</span>
              </div>
            </template>
          </nav>
        </div>

        <!-- Main Content -->
        <div class="main-content">
          <Dashboard ref="dashboard" v-if="currentPage === 'dashboard'" @enter-project="enterProject" :user="user" :session-percentage="sessionPercentage" :remaining-time="remainingTime" @user-command="handleUserCommand" />
          <ProjectDetail ref="projectDetail" v-if="currentPage === 'project'" :projectId="selectedProjectId" @back="backToDashboard" :user="user" :session-percentage="sessionPercentage" :remaining-time="remainingTime" @user-command="handleUserCommand" />
          <Wallet v-if="currentPage === 'wallet'" :user="user" :session-percentage="sessionPercentage" :remaining-time="remainingTime" @user-command="handleUserCommand" />
          <UserSettings v-if="currentPage === 'user-settings'" :user="user" :session-percentage="sessionPercentage" :remaining-time="remainingTime" @user-command="handleUserCommand" />
          <SystemAdmin v-if="currentPage === 'admin'" :user="user" :session-percentage="sessionPercentage" :remaining-time="remainingTime" @user-command="handleUserCommand" />
        </div>
      </div>
    </div>
    
    <!-- Global Authentication Modal -->
    <GlobalAuthModal 
      :visible="showAuthModal" 
      :systemNotification="systemNotification"
      :closable="false"
      @update:visible="showAuthModal = $event"
      @register-success="handleRegisterSuccess"
    />
  </div>
</template>

<script>
import Dashboard from './components/Dashboard.vue'
import ProjectDetail from './components/ProjectDetail.vue'
import Wallet from './components/WalletNew.vue'
import GlobalAuthModal from './components/GlobalAuthModal.vue'
import UserSettings from './components/UserSettings.vue'
import SystemAdmin from './components/SystemAdmin.vue'
import PlaceholderPage from './components/PlaceholderPage.vue'

export default {
  name: 'App',
  components: {
    Dashboard,
    ProjectDetail,
    Wallet,
    GlobalAuthModal,
    UserSettings,
    SystemAdmin,
    PlaceholderPage
  },
  data() {
    return {
      currentPage: 'dashboard',
      selectedProjectId: null,
      showAuthModal: false,
      systemNotification: '',
      user: null,
      sessionId: null,
      searchQuery: '',
      sidebarCollapsed: false,
      showMobileSidebar: false,
      sessionStartTime: null,
      sessionExpiryTime: null, // 改为使用后端返回的过期时间
      sessionTimeout: null, // 儲存 session timeout 配置
      currentTime: Date.now()
    }
  },
  computed: {
    remainingTime() {
      if (!this.sessionExpiryTime) return 0
      
      const remaining = Math.max(0, this.sessionExpiryTime - this.currentTime)
      return remaining
    },
    
    sessionPercentage() {
      if (!this.sessionExpiryTime) return 100
      
      // 使用實際的 session timeout 設定
      const sessionDuration = this.sessionTimeout || parseInt(localStorage.getItem('sessionTimeout')) || 86400000
      const remaining = this.sessionExpiryTime - this.currentTime
      const percentage = Math.max(0, Math.min(100, (remaining / sessionDuration) * 100))
      return Math.round(percentage)
    },
    
    isSystemAdmin() {
      // Check if current user has system_admin permission
      return this.user && this.user.permissions && this.user.permissions.includes('system_admin')
    }
  },
  async created() {
    await this.initializeAuth()
  },
  
  mounted() {
    // Update countdown timer
    setInterval(this.updateCountdown, 1000)
    this.updateCountdown()
    
    // 暴露Vue实例给API客户端使用
    window.vueApp = this
    
    // 監聽全局登入狀態變化事件
    window.addEventListener('auth-state-changed', this.handleAuthStateChange)
    
    // 監聽頁面可見性變化，優化性能
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  },
  methods: {
    enterProject(project) {
      console.log('進入專案:', project)
      this.selectedProjectId = project.id
      this.currentPage = 'project'
    },
    backToDashboard() {
      this.currentPage = 'dashboard'
      this.selectedProjectId = null
    },
    
    handleNavigation(page) {
      this.currentPage = page
      if (page === 'dashboard') {
        this.selectedProjectId = null
      }
      // Close mobile sidebar after navigation
      this.closeMobileSidebar()
    },
    
    handleUserCommand(command) {
      if (command === 'settings') {
        this.openUserSettings()
      } else if (command === 'logout') {
        this.logout()
      } else if (command === 'refresh-user-data') {
        this.refreshUserData()
      }
    },
    
    updateCountdown() {
      this.currentTime = Date.now()
    },
    
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    
    toggleMobileSidebar() {
      this.showMobileSidebar = !this.showMobileSidebar
    },
    
    closeMobileSidebar() {
      this.showMobileSidebar = false
    },
    
    openUserSettings() {
      this.currentPage = 'user-settings'
      console.log('開啟使用者設定')
    },
    
    async refreshUserData() {
      try {
        const storedSessionId = localStorage.getItem('sessionId')
        if (storedSessionId) {
          const response = await this.$apiClient.callWithAuth('/auth/current-user', { sessionId: storedSessionId })
          if (response.success && response.data && response.data.user) {
            this.user = response.data.user
            console.log('User data refreshed:', this.user.displayName)
            
            // 更新session信息
            if (response.data.session) {
              this.sessionExpiryTime = response.data.session.expiryTime
            }
          } else {
            console.warn('Invalid user data structure:', response)
          }
        }
      } catch (error) {
        console.error('Failed to refresh user data:', error)
      }
    },
    
    formatTime(milliseconds) {
      const minutes = Math.floor(milliseconds / 60000)
      const seconds = Math.floor((milliseconds % 60000) / 1000)
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    },
    
    // Authentication methods
    async initializeAuth() {
      try {
        // Check for existing session
        const storedSessionId = localStorage.getItem('sessionId')
        if (storedSessionId) {
          try {
            const response = await this.$apiClient.callWithAuth('/auth/current-user', { sessionId: storedSessionId })
            if (response.success && response.data && response.data.user && response.data.user.displayName) {
              this.user = response.data.user
              this.sessionId = storedSessionId
              console.log('用戶已登入:', this.user.displayName)
              
              // 完成載入後隱藏loading畫面
              if (window.hideInitialLoading) {
                window.hideInitialLoading();
              }
              return
            } else {
              // Invalid session or incomplete user data, clear it
              console.warn('Session invalid or user data incomplete:', response)
              localStorage.removeItem('sessionId')
            }
          } catch (apiError) {
            console.error('Session check error:', apiError)
            localStorage.removeItem('sessionId')
          }
        }
        
        // 隱藏loading畫面並顯示登入modal
        if (window.hideInitialLoading) {
          window.hideInitialLoading();
        }
        
        // Show auth modal if not logged in
        this.showAuthModal = true
        
      } catch (error) {
        console.error('Auth initialization error:', error)
        // 隱藏loading畫面
        if (window.hideInitialLoading) {
          window.hideInitialLoading();
        }
        this.showAuthModal = true
      }
    },

    // 處理全局登入狀態變化
    async handleAuthStateChange(event) {
      const { type, user, sessionId } = event.detail
      
      if (type === 'login-success') {
        // 驗證數據完整性
        if (!user || !sessionId) {
          console.error('登入事件數據不完整:', event.detail)
          return
        }

        // 更新用戶資料
        this.user = user
        this.sessionId = sessionId
        
        // 關閉登入modal
        this.showAuthModal = false
        
        // 更新全局window對象
        window.currentUser = this.user
        window.sessionId = this.sessionId
        
        // 重新載入當前頁面的數據
        await this.refreshCurrentPageData()
        
        console.log('登入狀態已更新，數據已重新載入')
      }
    },

    // 重新載入當前頁面的數據
    async refreshCurrentPageData() {
      try {
        // 如果當前在dashboard頁面，觸發dashboard重新載入
        if (this.currentPage === 'dashboard' && this.$refs.dashboard) {
          if (typeof this.$refs.dashboard.loadProjects === 'function') {
            await this.$refs.dashboard.loadProjects()
          } else {
            console.warn('Dashboard組件沒有loadProjects方法')
          }
        }
        
        // 如果當前在project頁面，觸發project重新載入
        if (this.currentPage === 'project' && this.$refs.projectDetail) {
          if (typeof this.$refs.projectDetail.loadProjectData === 'function') {
            await this.$refs.projectDetail.loadProjectData()
          } else {
            console.warn('ProjectDetail組件沒有loadProjectData方法')
          }
        }
        
        // 可以添加其他頁面的重新載入邏輯
        
      } catch (error) {
        console.error('重新載入頁面數據失敗:', error)
      }
    },
    
    // loadSystemNotification method removed - no longer needed
    
    // 舊的handleLoginSuccess方法已被handleAuthStateChange取代
    // 保留用於向後兼容，但實際上不會被調用
    handleLoginSuccess(userData) {
      console.warn('舊的handleLoginSuccess被調用，這可能表示事件綁定需要更新')
      // 重定向到新的處理系統
      window.dispatchEvent(new CustomEvent('auth-state-changed', {
        detail: { 
          type: 'login-success', 
          user: userData.user || userData,
          sessionId: userData.sessionId
        }
      }))
    },
    
    handleRegisterSuccess(userData) {
      console.log('註冊成功:', userData)
      // User will need to log in after registration
    },
    
    async logout() {
      try {
        if (this.sessionId) {
          await this.$apiClient.callWithAuth('/auth/logout', { sessionId: this.sessionId })
        }
      } catch (error) {
        console.error('Logout error:', error)
      } finally {
        this.user = null
        this.sessionId = null
        localStorage.removeItem('sessionId')
        window.currentUser = null
        window.sessionId = null
        this.showAuthModal = true
      }
    },

    // 處理頁面可見性變化
    handleVisibilityChange() {
      if (document.hidden) {
        // 頁面不可見時，可以暫停一些不必要的計時器
        console.log('頁面隱藏，可以暫停某些操作')
      } else {
        // 頁面可見時，恢復正常操作
        console.log('頁面可見，恢復正常操作')
      }
    }
    
  },
  beforeUnmount() {
    // 清理事件監聽器
    window.removeEventListener('auth-state-changed', this.handleAuthStateChange)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f7fa;
}

#app {
  height: 100vh;
}


.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Top Bar */
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
  margin-left: 20px;
}

.search-input {
  width: 100%;
  padding: 8px 15px;
  /*border: 2px solid #e1e8ed;*/
  border-radius: 20px;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #409eff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-btn {
  background: #67c23a;
  color: white;
  padding: 6px 15px;
  border-radius: 15px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.3s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.user-btn:hover {
  background: #5daf34;
}

.session-timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
}

.timer-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: bold;
  color: #2c3e50;
}

.logout-btn {
  background: #f56c6c;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.logout-btn:hover {
  background: #f45454;
}

/* Content Layout */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Mobile Hamburger Button */
.mobile-hamburger {
  display: none;
  position: fixed;
  top: 15px;
  left: 15px;
  z-index: 1001;
  background: #2c3e50;
  color: white;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  transition: all 0.3s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  border: none;
}

.mobile-hamburger:hover {
  background: #34495e;
  transform: scale(1.05);
}

.mobile-hamburger:active {
  transform: scale(0.95);
}

.mobile-hamburger i {
  font-size: 20px;
  display: block;
}

/* Mobile Sidebar Overlay */
.mobile-sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sidebar {
  width: 200px;
  background-color: #2c3e50;
  color: white;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  z-index: 999;
}

.sidebar.collapsed {
  width: 64px;
}

/* Mobile sidebar positioning */
.sidebar.mobile-open {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 280px;
  transform: translateX(0);
  animation: slideInFromLeft 0.3s ease;
}

@keyframes slideInFromLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.sidebar-header {
  padding: 15px;
  border-bottom: 1px solid #34495e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #bdc3c7;
  min-height: 60px;
}

.header-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #bdc3c7;
}

.project-title {
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}

.header-icon {
  font-size: 20px;
  color: #bdc3c7;
}

.collapse-btn {
  background: none;
  border: none;
  color: #bdc3c7;
  cursor: pointer;
  padding: 6px;
  border-radius: 3px;
  transition: all 0.3s;
  flex-shrink: 0;
}

.collapse-btn:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.1);
}

/* Desktop vs Mobile button visibility */
.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

.sidebar-nav {
  flex: 1;
  padding: 20px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  transition: background-color 0.3s;
  color: #bdc3c7;
}

.nav-item:hover {
  background-color: #34495e;
  color: white;
}

.nav-item.active {
  background-color: #3498db;
  color: white;
}

.nav-item i {
  margin-right: 15px;
  width: 20px;
  text-align: center;
}

.sidebar.collapsed .nav-item {
  padding: 15px 22px;
  justify-content: center;
}

.sidebar.collapsed .nav-item span {
  display: none;
}

.sidebar.collapsed .nav-item i {
  margin-right: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: #f5f7fa;
}

.project-item {
  border-top: 1px solid #34495e;
  margin-top: 10px;
}

.page-placeholder {
  padding: 40px;
  text-align: center;
  color: #7f8c8d;
}

.page-placeholder h2 {
  margin-bottom: 20px;
  color: #2c3e50;
}

.user-settings {
  max-width: 600px;
  margin: 0 auto;
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid #e1e8ed;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item label {
  font-weight: 500;
  color: #2c3e50;
  min-width: 120px;
}

.setting-item span {
  color: #7f8c8d;
}

.setting-actions {
  margin-top: 30px;
  display: flex;
  gap: 15px;
  justify-content: center;
}

/* Responsive Design - Portrait Mode (直立模式) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  /* Hide desktop sidebar and show mobile hamburger */
  .sidebar {
    transform: translateX(-100%);
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 280px;
  }
  
  /* Show mobile hamburger button */
  .mobile-hamburger {
    display: block;
  }
  
  /* Show mobile overlay when sidebar is open */
  .mobile-sidebar-overlay {
    display: block;
  }
  
  /* Hide desktop collapse button, show mobile close button */
  .desktop-only {
    display: none;
  }
  
  .mobile-only {
    display: block;
  }
  
  /* Adjust main content to account for hamburger button */
  .main-content {
    padding-top: 60px; /* Space for hamburger button */
  }
  
  /* Full width sidebar header in mobile */
  .sidebar.mobile-open .sidebar-header h3 {
    display: block;
  }
  
  /* Ensure navigation items show text in mobile */
  .sidebar.mobile-open .nav-item span {
    display: inline !important;
  }
  
  .sidebar.mobile-open .nav-item i {
    margin-right: 15px !important;
  }
}

/* Landscape Mode - Keep original behavior */
@media screen and (orientation: landscape) and (max-width: 768px) {
  .sidebar {
    width: 64px;
  }
  
  .sidebar-header h3 {
    display: none;
  }
  
  .mobile-hamburger {
    display: none;
  }
}

/* Large screens - Keep original behavior */
@media (min-width: 769px) {
  .mobile-hamburger {
    display: none;
  }
  
  .mobile-sidebar-overlay {
    display: none !important;
  }
  
  .sidebar {
    position: relative !important;
    transform: none !important;
  }
}
</style>