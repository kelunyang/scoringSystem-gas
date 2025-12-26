<template>
  <div class="notification-center">
    <!-- Notification Bell Button -->
    <el-button 
      circle 
      @click="toggleNotificationDrawer"
      class="notification-bell"
      :class="{ 'has-notifications': unreadCount > 0 }"
    >
      <el-badge 
        :value="unreadCount" 
        :hidden="unreadCount === 0" 
        :max="99"
      >
        <i class="fas fa-bell"></i>
      </el-badge>
    </el-button>

    <!-- Notification Drawer -->
    <div v-if="showDrawer" class="drawer-overlay" @click="closeDrawer">
      <div class="drawer-content" @click.stop>
        <!-- Header -->
        <div class="drawer-header">
          <h3><i class="fas fa-bell"></i> 通知中心</h3>
          <div class="header-actions">
            <el-button 
              size="small" 
              @click="refreshNotifications"
              :loading="loading"
              title="更新通知"
            >
              <i class="fas fa-sync"></i>
            </el-button>
            <el-button 
              size="small" 
              @click="markAllAsRead"
              :disabled="loading || unreadCount === 0"
              :loading="markingAllRead"
            >
              <i class="fas fa-check-double"></i>
              全部已讀
            </el-button>
            <button class="drawer-close" @click="closeDrawer">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <!-- Filters and Search -->
        <div class="drawer-filters">
          <div class="filter-row">
            <!-- Count Slider -->
            <div class="slider-container">
              <label>顯示數量: {{ displayCount }}</label>
              <el-slider
                v-model="displayCount"
                :min="10"
                :max="100"
                :step="5"
                :show-tooltip="false"
                @change="handleSliderChange"
              />
            </div>

            <!-- Filter Buttons -->
            <div class="filter-buttons">
              <el-button
                size="small"
                :type="filterType === 'all' ? 'primary' : ''"
                @click="setFilter('all')"
              >
                全部 ({{ totalCount }})
              </el-button>
              <el-button
                size="small"
                :type="filterType === 'unread' ? 'primary' : ''"
                @click="setFilter('unread')"
              >
                未讀 ({{ unreadCount }})
              </el-button>
            </div>
          </div>

          <!-- Search -->
          <div class="search-container">
            <el-input
              v-model="searchText"
              placeholder="搜尋通知內容..."
              clearable
              @input="handleSearch"
              @clear="handleSearch"
            >
              <template #prefix>
                <i class="fas fa-search"></i>
              </template>
            </el-input>
          </div>
        </div>

        <!-- Notification List -->
        <div class="drawer-body">
          <div v-if="loading" class="loading-container">
            <el-skeleton :rows="5" animated />
          </div>

          <div v-else-if="notifications.length === 0" class="no-notifications">
            <i class="fas fa-bell-slash"></i>
            <p v-if="searchText">找不到符合搜尋條件的通知</p>
            <p v-else-if="filterType === 'unread'">目前沒有未讀通知</p>
            <p v-else>目前沒有通知</p>
          </div>

          <div v-else class="notification-list">
            <div
              v-for="notification in notifications"
              :key="notification.notificationId"
              class="notification-item"
              :class="{ 
                'unread': !notification.isRead,
                'read': notification.isRead 
              }"
            >
              <!-- Notification Content -->
              <div class="notification-content">
                <div class="notification-header">
                  <span class="notification-title">{{ notification.title }}</span>
                  <span class="notification-time">{{ formatTime(notification.createdTime) }}</span>
                </div>
                
                <div class="notification-body">{{ notification.content }}</div>
                
                <div class="notification-meta">
                  <span v-if="notification.projectName" class="project-name">
                    <i class="fas fa-folder"></i>
                    {{ notification.projectName }}
                  </span>
                  <span class="notification-type">
                    <i :class="getTypeIcon(notification.type)"></i>
                    {{ getTypeLabel(notification.type) }}
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="notification-actions">
                <el-button
                  v-if="!notification.isRead"
                  size="small"
                  @click="markAsRead(notification.notificationId)"
                  :loading="markingRead === notification.notificationId"
                >
                  <i class="fas fa-check"></i>
                </el-button>
                
                <el-button
                  size="small"
                  @click="deleteNotification(notification.notificationId)"
                  :loading="deleting === notification.notificationId"
                  type="danger"
                  plain
                >
                  <i class="fas fa-trash"></i>
                </el-button>
              </div>
            </div>

            <!-- Load More -->
            <div v-if="hasMore" class="load-more-container">
              <el-button
                @click="loadMore"
                :loading="loadingMore"
                type="primary"
                plain
              >
                <i class="fas fa-plus"></i>
                載入更多
              </el-button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="drawer-footer">
          <div class="notification-stats">
            <span>共 {{ totalCount }} 則通知</span>
            <span v-if="unreadCount > 0">，{{ unreadCount }} 則未讀</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NotificationCenter',
  data() {
    return {
      // UI State
      showDrawer: false,
      loading: false,
      loadingMore: false,
      markingRead: null,
      markingAllRead: false,
      deleting: null,

      // Notification Data
      notifications: [],
      unreadCount: 0,
      totalCount: 0,
      hasMore: false,
      offset: 0,

      // Filters
      displayCount: 20,
      filterType: 'all', // 'all' or 'unread'
      searchText: '',
      
      // Polling
      pollInterval: null,
      POLL_INTERVAL: 30000 // 30 seconds
    }
  },
  mounted() {
    this.loadNotificationCount()
    // 不再自動開始 polling
    // this.startPolling()
  },
  beforeUnmount() {
    this.stopPolling()
  },
  methods: {
    async loadNotificationCount() {
      try {
        const response = await this.$apiClient.callWithAuth('/notifications/count')
        if (response.success) {
          this.unreadCount = response.data.unreadCount || 0
          this.totalCount = response.data.totalCount || 0
        }
      } catch (error) {
        console.error('Load notification count error:', error)
      }
    },

    async loadNotifications(reset = false) {
      if (reset) {
        this.offset = 0
        this.notifications = []
      }

      this.loading = reset
      this.loadingMore = !reset

      try {
        const params = {
          limit: this.displayCount,
          offset: this.offset,
          unreadOnly: this.filterType === 'unread',
          searchText: this.searchText
        }

        const response = await this.$apiClient.callWithAuth('/notifications/list', params)
        
        if (response.success) {
          const newNotifications = response.data.notifications || []
          
          if (reset) {
            this.notifications = newNotifications
          } else {
            this.notifications.push(...newNotifications)
          }
          
          this.unreadCount = response.data.unreadCount || 0
          this.totalCount = response.data.totalCount || 0
          this.hasMore = response.data.hasMore || false
          this.offset += newNotifications.length
        }
      } catch (error) {
        console.error('Load notifications error:', error)
        this.$message.error('載入通知失敗')
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },

    async markAsRead(notificationId) {
      this.markingRead = notificationId
      
      try {
        const response = await this.$apiClient.callWithAuth('/notifications/mark-read', {
          notificationId
        })
        
        if (response.success) {
          // Update local state
          const notification = this.notifications.find(n => n.notificationId === notificationId)
          if (notification) {
            notification.isRead = true
            this.unreadCount = Math.max(0, this.unreadCount - 1)
          }
        } else {
          this.$message.error('標記已讀失敗')
        }
      } catch (error) {
        console.error('Mark as read error:', error)
        this.$message.error('標記已讀失敗')
      } finally {
        this.markingRead = null
      }
    },

    async markAllAsRead() {
      if (this.unreadCount === 0) return

      this.markingAllRead = true
      
      try {
        const response = await this.$apiClient.callWithAuth('/notifications/mark-all-read')
        
        if (response.success) {
          // Update all notifications to read
          this.notifications.forEach(n => n.isRead = true)
          this.unreadCount = 0
          this.$message.success(`${response.data.markedCount} 則通知已標記為已讀`)
        } else {
          this.$message.error('全部已讀操作失敗')
        }
      } catch (error) {
        console.error('Mark all as read error:', error)
        this.$message.error('全部已讀操作失敗')
      } finally {
        this.markingAllRead = false
      }
    },

    async deleteNotification(notificationId) {
      this.deleting = notificationId
      
      try {
        const response = await this.$apiClient.callWithAuth('/notifications/delete', {
          notificationId
        })
        
        if (response.success) {
          // Remove from local state
          const index = this.notifications.findIndex(n => n.notificationId === notificationId)
          if (index !== -1) {
            const wasUnread = !this.notifications[index].isRead
            this.notifications.splice(index, 1)
            this.totalCount = Math.max(0, this.totalCount - 1)
            if (wasUnread) {
              this.unreadCount = Math.max(0, this.unreadCount - 1)
            }
          }
        } else {
          this.$message.error('刪除通知失敗')
        }
      } catch (error) {
        console.error('Delete notification error:', error)
        this.$message.error('刪除通知失敗')
      } finally {
        this.deleting = null
      }
    },

    toggleNotificationDrawer() {
      this.showDrawer = !this.showDrawer
      if (this.showDrawer) {
        // 打開 drawer 時立即更新數據
        this.loadNotificationCount()
        if (this.notifications.length === 0) {
          this.loadNotifications(true)
        }
      }
    },

    closeDrawer() {
      this.showDrawer = false
    },

    refreshNotifications() {
      this.loadNotificationCount()
      if (this.showDrawer) {
        this.loadNotifications(true)
      }
    },

    handleSliderChange() {
      this.loadNotifications(true)
    },

    setFilter(type) {
      this.filterType = type
      this.loadNotifications(true)
    },

    handleSearch() {
      // Debounce search
      clearTimeout(this.searchTimeout)
      this.searchTimeout = setTimeout(() => {
        this.loadNotifications(true)
      }, 500)
    },

    loadMore() {
      this.loadNotifications(false)
    },

    formatTime(timestamp) {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffMins < 1) return '剛剛'
      if (diffMins < 60) return `${diffMins} 分鐘前`
      if (diffHours < 24) return `${diffHours} 小時前`
      if (diffDays < 7) return `${diffDays} 天前`
      
      return date.toLocaleDateString('zh-TW')
    },

    getTypeIcon(type) {
      switch (type) {
        case 'group_mention': return 'fas fa-users'
        case 'user_mention': return 'fas fa-at'
        case 'comment': return 'fas fa-comment'
        case 'system': return 'fas fa-cog'
        case 'stage_created': return 'fas fa-plus-circle'
        case 'stage_start': return 'fas fa-play-circle'
        case 'stage_completed': return 'fas fa-check-circle'
        case 'submission_created': return 'fas fa-file-alt'
        case 'ranking_proposal': return 'fas fa-trophy'
        case 'wallet_reward': return 'fas fa-coins'
        case 'project_updated': return 'fas fa-edit'
        case 'group_created': return 'fas fa-users-plus'
        case 'group_updated': return 'fas fa-users-cog'
        default: return 'fas fa-bell'
      }
    },

    getTypeLabel(type) {
      switch (type) {
        case 'group_mention': return '群組提及'
        case 'user_mention': return '用戶提及'
        case 'comment': return '評論'
        case 'system': return '系統'
        case 'stage_created': return '階段建立'
        case 'stage_start': return '階段開始'
        case 'stage_completed': return '階段完成'
        case 'submission_created': return '成果提交'
        case 'ranking_proposal': return '排名提案'
        case 'wallet_reward': return '獎勵'
        case 'project_updated': return '專案更新'
        case 'group_created': return '群組建立'
        case 'group_updated': return '群組更新'
        default: return '通知'
      }
    },

    startPolling() {
      // 停用自動 polling，改為手動重整機制
      // this.pollInterval = setInterval(() => {
      //   this.loadNotificationCount()
      // }, this.POLL_INTERVAL)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    }
  }
}
</script>

<style scoped>
.notification-center {
  position: relative;
}

/* Notification Bell */
.notification-bell {
  position: relative;
  color: #666;
  background: transparent;
  border: none;
  font-size: 18px;
  transition: all 0.3s;
}

.notification-bell:hover {
  color: #FF6600;
  background: rgba(255, 102, 0, 0.1);
}

.notification-bell.has-notifications {
  color: #FF6600;
  animation: bell-ring 2s infinite;
}

@keyframes bell-ring {
  0%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(-10deg); }
  20% { transform: rotate(10deg); }
}

/* Drawer */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
}

.drawer-content {
  width: 90%;
  max-width: 500px;
  height: 100vh;
  background: white;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  animation: slide-in 0.3s ease-out;
}

@keyframes slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

/* Header */
.drawer-header {
  background: #FF6600;
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.drawer-header h3 {
  margin: 0;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-close {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: background 0.2s;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Filters */
.drawer-filters {
  padding: 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  gap: 15px;
}

.slider-container {
  flex: 1;
  min-width: 120px;
}

.slider-container label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.search-container {
  margin-top: 15px;
}

/* Body */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
}

.loading-container {
  padding: 20px 0;
}

.no-notifications {
  text-align: center;
  color: #999;
  padding: 60px 20px;
}

.no-notifications i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 20px;
  display: block;
}

/* Notification List */
.notification-list {
  padding-bottom: 20px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.notification-item:hover {
  background: #f8f9fa;
}

.notification-item.unread {
  background: rgba(255, 102, 0, 0.05);
  border-left: 4px solid #FF6600;
  padding-left: 15px;
  margin-left: -19px;
}

.notification-content {
  flex: 1;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 10px;
}

.notification-title {
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.notification-time {
  color: #999;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.notification-body {
  color: #666;
  line-height: 1.5;
  margin-bottom: 8px;
}

.notification-meta {
  display: flex;
  gap: 15px;
  color: #999;
  font-size: 12px;
  align-items: center;
}

.project-name,
.notification-type {
  display: flex;
  align-items: center;
  gap: 4px;
}

.notification-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* Load More */
.load-more-container {
  text-align: center;
  padding: 20px 0;
}

/* Footer */
.drawer-footer {
  padding: 15px 20px;
  border-top: 1px solid #eee;
  background: #f8f9fa;
  flex-shrink: 0;
}

.notification-stats {
  text-align: center;
  color: #666;
  font-size: 14px;
}

/* Responsive */
@media (max-width: 768px) {
  .drawer-content {
    width: 100%;
    max-width: none;
  }
  
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .notification-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
}
</style>