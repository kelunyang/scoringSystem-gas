<template>
  <div class="notification-management">
    <!-- Header with Actions -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-bell"></i> 通知管理</h2>
        <div class="notification-stats">
          <el-statistic 
            title="總通知" 
            :value="stats.totalNotifications"
            class="stat-item"
          >
            <template #prefix>
              <i class="fas fa-envelope"></i>
            </template>
          </el-statistic>
          
          <el-statistic 
            title="已讀" 
            :value="stats.readNotifications"
            class="stat-item"
          >
            <template #prefix>
              <i class="fas fa-envelope-open"></i>
            </template>
          </el-statistic>
          
          <el-statistic 
            title="已寄送" 
            :value="stats.emailSentNotifications"
            class="stat-item"
          >
            <template #prefix>
              <i class="fas fa-paper-plane"></i>
            </template>
          </el-statistic>
        </div>
      </div>
      <div class="header-right">
        <button
          class="btn-primary"
          @click="sendSelectedEmails"
          :disabled="selectedNotifications.length === 0 || sendingEmails"
        >
          <i class="fas fa-paper-plane"></i>
          發送選中的通知 ({{ selectedNotifications.length }})
        </button>
        <button class="btn-secondary" @click="refreshNotifications">
          <i class="fas fa-sync"></i>
          重新整理
        </button>
        <button class="btn-info" @click="downloadWithProjectNames">
          <i class="fas fa-download"></i>
          下載專案標題
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-row">
        <!-- Text Search -->
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜尋通知標題或內容..."
          class="search-input"
        >
        
        <!-- Email Sent Filter -->
        <el-select v-model="emailSentFilter" placeholder="郵件狀態" style="width: 150px;">
          <el-option label="全部狀態" value="all" />
          <el-option label="已寄送" value="sent" />
          <el-option label="未寄送" value="not_sent" />
        </el-select>
        
        <!-- Read Status Filter -->
        <el-select v-model="readFilter" placeholder="閱讀狀態" style="width: 150px;">
          <el-option label="全部" value="all" />
          <el-option label="已讀" value="read" />
          <el-option label="未讀" value="unread" />
        </el-select>
        
        <!-- Type Filter -->
        <el-select v-model="typeFilter" placeholder="通知類型" style="width: 200px;">
          <el-option label="全部類型" value="all" />
          <el-option label="階段開始" value="stage_start" />
          <el-option label="階段投票" value="stage_voting" />
          <el-option label="階段完成" value="stage_completed" />
          <el-option label="評論提及" value="comment_mention" />
          <el-option label="群組提及" value="group_mention" />
          <el-option label="新評論" value="new_comment" />
          <el-option label="評論投票" value="comment_vote" />
        </el-select>
      </div>
      
      <div class="filter-row">
        <!-- Display Limit Slider -->
        <div class="slider-filter">
          <label>顯示數量：</label>
          <el-slider 
            v-model="displayLimit" 
            :min="10" 
            :max="500" 
            :step="10"
            :marks="{
              10: '10',
              100: '100',
              250: '250',
              500: '500'
            }"
            style="width: 300px;"
          />
          <span class="limit-value">{{ displayLimit }} 筆</span>
        </div>
      </div>
    </div>

    <!-- Notification Table with Infinite Scroll -->
    <div
      class="table-container"
      v-loading="loading"
      element-loading-text="載入通知資料中..."
      v-infinite-scroll="loadMore"
      :infinite-scroll-disabled="scrollDisabled"
      :infinite-scroll-distance="200"
    >
      <table class="notification-table">
        <thead>
          <tr>
            <th width="50">
              <el-checkbox
                v-model="selectAll"
                @change="toggleSelectAll"
                :indeterminate="isIndeterminate"
              />
            </th>
            <th>收件人</th>
            <th>通知類型</th>
            <th>標題</th>
            <th>專案</th>
            <th>狀態</th>
            <th>創建時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="notification in displayedNotifications" :key="notification.notificationId">
            <td>
              <el-checkbox
                v-model="notification.selected"
                @change="handleSelectionChange"
              />
            </td>
            <td>{{ notification.targetUserEmail }}</td>
            <td>
              <span class="type-badge" :class="getTypeClass(notification.type)">
                {{ getTypeText(notification.type) }}
              </span>
            </td>
            <td class="title-cell">
              {{ notification.title }}
            </td>
            <td>{{ notification.projectName || '-' }}</td>
            <td>
              <div class="status-indicators">
                <el-tooltip content="閱讀狀態" placement="top">
                  <i
                    :class="notification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                    :style="{ color: notification.isRead ? '#67C23A' : '#909399' }"
                  ></i>
                </el-tooltip>
                <el-tooltip content="郵件發送狀態" placement="top">
                  <i
                    :class="notification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                    :style="{ color: notification.emailSent ? '#409EFF' : '#909399' }"
                  ></i>
                </el-tooltip>
              </div>
            </td>
            <td>{{ formatTime(notification.createdTime) }}</td>
            <td class="actions">
              <button
                class="btn-sm btn-info"
                @click="viewNotificationDetail(notification)"
                title="檢視詳情"
              >
                <i class="fas fa-eye"></i>
                檢視
              </button>
              <button
                class="btn-sm btn-primary"
                @click="sendSingleEmail(notification)"
                :disabled="notification.emailSent || sendingEmails"
                title="發送郵件"
              >
                <i class="fas fa-paper-plane"></i>
                {{ notification.emailSent ? '已發送' : '發送' }}
              </button>
              <button
                class="btn-sm btn-danger"
                @click="deleteNotification(notification)"
                title="刪除通知"
              >
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="filteredNotifications.length === 0 && !loading" class="no-data">
        <i class="fas fa-bell-slash"></i>
        <p>沒有找到符合條件的通知</p>
      </div>

      <!-- Loading indicator for infinite scroll -->
      <div v-if="loadingMore" class="loading-more">
        <i class="el-icon-loading"></i>
        <span>載入更多通知...</span>
      </div>

      <!-- Show count info -->
      <div v-if="displayedNotifications.length > 0" class="count-info">
        顯示 {{ displayedNotifications.length }} / {{ filteredNotifications.length }} 筆通知
      </div>
    </div>
    
    <!-- Progress Dialog -->
    <el-dialog 
      v-model="showProgressDialog" 
      title="發送郵件進度"
      width="500px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <div class="progress-content">
        <p>{{ progressMessage }}</p>
        <el-progress 
          :percentage="progressPercentage" 
          :status="progressStatus"
          :text-inside="true"
          :stroke-width="26"
        />
      </div>
    </el-dialog>

    <!-- Notification Detail Drawer -->
    <el-drawer
      v-model="showDetailDrawer"
      title="通知詳情"
      direction="btt"
      size="100%"
      :before-close="handleDetailDrawerClose"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-envelope-open"></i> 通知詳情</h3>
      </template>
      
      <div v-if="selectedNotification" class="notification-detail">
        <!-- Basic Info -->
        <div class="detail-section">
          <h4><i class="fas fa-info-circle"></i> 基本資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>通知標題</label>
              <div class="detail-value">{{ selectedNotification.title }}</div>
            </div>
            <div class="detail-item">
              <label>收件人</label>
              <div class="detail-value">{{ selectedNotification.targetUserEmail }}</div>
            </div>
            <div class="detail-item">
              <label>通知類型</label>
              <div class="detail-value">
                <span class="type-badge" :class="getTypeClass(selectedNotification.type)">
                  {{ getTypeText(selectedNotification.type) }}
                </span>
              </div>
            </div>
            <div class="detail-item">
              <label>關聯專案</label>
              <div class="detail-value">{{ selectedNotification.projectName || '無' }}</div>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="detail-section">
          <h4><i class="fas fa-file-alt"></i> 通知內容</h4>
          <div class="content-display">
            {{ selectedNotification.content }}
          </div>
        </div>

        <!-- Status -->
        <div class="detail-section">
          <h4><i class="fas fa-chart-line"></i> 狀態資訊</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <label>閱讀狀態</label>
              <div class="detail-value">
                <i 
                  :class="selectedNotification.isRead ? 'fas fa-envelope-open' : 'fas fa-envelope'"
                  :style="{ color: selectedNotification.isRead ? '#67C23A' : '#909399' }"
                ></i>
                {{ selectedNotification.isRead ? '已讀' : '未讀' }}
              </div>
            </div>
            <div class="detail-item">
              <label>郵件發送</label>
              <div class="detail-value">
                <i 
                  :class="selectedNotification.emailSent ? 'fas fa-paper-plane' : 'far fa-paper-plane'"
                  :style="{ color: selectedNotification.emailSent ? '#409EFF' : '#909399' }"
                ></i>
                {{ selectedNotification.emailSent ? '已發送' : '未發送' }}
              </div>
            </div>
            <div class="detail-item">
              <label>創建時間</label>
              <div class="detail-value">{{ formatTime(selectedNotification.createdTime) }}</div>
            </div>
            <div class="detail-item" v-if="selectedNotification.emailSentTime">
              <label>發送時間</label>
              <div class="detail-value">{{ formatTime(selectedNotification.emailSentTime) }}</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="detail-actions">
          <button 
            v-if="!selectedNotification.emailSent"
            class="btn-primary" 
            @click="sendSingleEmailFromDetail"
            :disabled="sendingEmails"
          >
            <i class="fas fa-paper-plane"></i>
            {{ sendingEmails ? '發送中...' : '發送郵件' }}
          </button>
          <button 
            class="btn-danger" 
            @click="deleteNotificationFromDetail"
          >
            <i class="fas fa-trash"></i>
            刪除通知
          </button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/utils/api'

export default {
  name: 'NotificationManagement',
  setup() {
    // Data
    const notifications = ref([])
    const loading = ref(false)
    const sendingEmails = ref(false)
    const projects = ref([])
    
    // Filters
    const searchText = ref('')
    const emailSentFilter = ref('all')
    const readFilter = ref('all')
    const typeFilter = ref('all')
    const displayLimit = ref(100)
    
    // Selection
    const selectAll = ref(false)
    const isIndeterminate = ref(false)

    // Infinite scroll
    const displayCount = ref(50) // Initial display count
    const loadingMore = ref(false)

    // Progress
    const showProgressDialog = ref(false)
    const progressMessage = ref('')
    const progressPercentage = ref(0)
    const progressStatus = ref('')
    
    // Detail drawer
    const showDetailDrawer = ref(false)
    const selectedNotification = ref(null)
    
    // Computed
    const stats = computed(() => ({
      totalNotifications: notifications.value.length,
      readNotifications: notifications.value.filter(n => n.isRead).length,
      emailSentNotifications: notifications.value.filter(n => n.emailSent).length
    }))
    
    const filteredNotifications = computed(() => {
      let filtered = notifications.value
      
      // Text search
      if (searchText.value) {
        const search = searchText.value.toLowerCase()
        filtered = filtered.filter(n => 
          n.title.toLowerCase().includes(search) ||
          n.content.toLowerCase().includes(search) ||
          n.targetUserEmail.toLowerCase().includes(search)
        )
      }
      
      // Email sent filter
      if (emailSentFilter.value !== 'all') {
        filtered = filtered.filter(n => 
          emailSentFilter.value === 'sent' ? n.emailSent : !n.emailSent
        )
      }
      
      // Read filter
      if (readFilter.value !== 'all') {
        filtered = filtered.filter(n => 
          readFilter.value === 'read' ? n.isRead : !n.isRead
        )
      }
      
      // Type filter
      if (typeFilter.value !== 'all') {
        filtered = filtered.filter(n => n.type === typeFilter.value)
      }
      
      // Display limit
      return filtered.slice(0, displayLimit.value)
    })
    
    const displayedNotifications = computed(() => {
      return filteredNotifications.value.slice(0, displayCount.value)
    })

    const scrollDisabled = computed(() => {
      return loading.value || loadingMore.value || displayedNotifications.value.length >= filteredNotifications.value.length
    })

    const selectedNotifications = computed(() => {
      return notifications.value.filter(n => n.selected)
    })
    
    // Watch for selection changes
    watch(selectedNotifications, (newVal) => {
      if (newVal.length === 0) {
        selectAll.value = false
        isIndeterminate.value = false
      } else if (newVal.length === displayedNotifications.value.length) {
        selectAll.value = true
        isIndeterminate.value = false
      } else {
        selectAll.value = false
        isIndeterminate.value = true
      }
    })

    // Watch for filter changes - reset display count
    watch([searchText, emailSentFilter, readFilter, typeFilter], () => {
      displayCount.value = 50
    })
    
    // Methods
    const loadNotifications = async () => {
      loading.value = true
      try {
        // Load all notifications from notification spreadsheet
        const response = await apiClient.callWithAuth('/admin/notifications/list', {})
        
        if (response.success && response.data) {
          // Add selected property and project name
          notifications.value = response.data.map(n => ({
            ...n,
            selected: false,
            projectName: getProjectName(n.projectId)
          }))
        } else {
          ElMessage.error('無法載入通知資料')
        }
      } catch (error) {
        console.error('Error loading notifications:', error)
        ElMessage.error('載入通知失敗')
      } finally {
        loading.value = false
      }
    }
    
    const loadProjects = async () => {
      try {
        const response = await apiClient.callWithAuth('/projects/list', {})
        if (response.success && response.data) {
          projects.value = response.data
        }
      } catch (error) {
        console.error('Error loading projects:', error)
      }
    }
    
    const getProjectName = (projectId) => {
      if (!projectId) return null
      const project = projects.value.find(p => p.projectId === projectId)
      return project ? project.projectName : projectId
    }
    
    const refreshNotifications = async () => {
      await loadNotifications()
      ElMessage.success('通知資料已更新')
    }
    
    const toggleSelectAll = (value) => {
      displayedNotifications.value.forEach(n => {
        n.selected = value
      })
    }

    const handleSelectionChange = () => {
      // This will trigger the watch on selectedNotifications
    }

    const loadMore = () => {
      if (scrollDisabled.value) return

      loadingMore.value = true
      setTimeout(() => {
        displayCount.value += 50
        loadingMore.value = false
      }, 300)
    }

    const downloadWithProjectNames = async () => {
      try {
        ElMessage.info('正在準備下載...')

        // Create a mapping of projectId to projectName
        const projectMap = {}
        projects.value.forEach(project => {
          projectMap[project.projectId] = project.projectName
        })

        // Map notifications with project names
        const exportData = notifications.value.map(notification => {
          return {
            通知ID: notification.notificationId,
            收件人: notification.targetUserEmail,
            通知類型: getTypeText(notification.type),
            標題: notification.title,
            內容: notification.content,
            專案ID: notification.projectId || '',
            專案名稱: notification.projectId ? (projectMap[notification.projectId] || notification.projectId) : '',
            階段ID: notification.stageId || '',
            是否已讀: notification.isRead ? '是' : '否',
            是否已刪除: notification.isDeleted ? '是' : '否',
            郵件已發送: notification.emailSent ? '是' : '否',
            創建時間: formatTime(notification.createdTime),
            讀取時間: notification.readTime ? formatTime(notification.readTime) : '',
            郵件發送時間: notification.emailSentTime ? formatTime(notification.emailSentTime) : ''
          }
        })

        // Convert to CSV
        const headers = Object.keys(exportData[0])
        const csvContent = [
          headers.join(','),
          ...exportData.map(row =>
            headers.map(header => {
              const value = row[header]
              // Escape commas and quotes in CSV
              if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`
              }
              return value
            }).join(',')
          )
        ].join('\n')

        // Create download
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `通知列表_含專案名稱_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        ElMessage.success('下載成功！')
      } catch (error) {
        console.error('Download error:', error)
        ElMessage.error('下載失敗：' + error.message)
      }
    }
    
    const sendSelectedEmails = async () => {
      const selected = selectedNotifications.value.filter(n => !n.emailSent)
      if (selected.length === 0) {
        ElMessage.warning('請選擇未發送的通知')
        return
      }
      
      if (!confirm(`確定要發送 ${selected.length} 封通知郵件嗎？`)) {
        return
      }
      
      sendingEmails.value = true
      showProgressDialog.value = true
      progressPercentage.value = 0
      progressStatus.value = ''
      
      const BATCH_SIZE = 50
      let successCount = 0
      let errorCount = 0
      
      try {
        // Process in batches of 50
        for (let i = 0; i < selected.length; i += BATCH_SIZE) {
          const batch = selected.slice(i, Math.min(i + BATCH_SIZE, selected.length))
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1
          const totalBatches = Math.ceil(selected.length / BATCH_SIZE)
          
          progressMessage.value = `處理第 ${batchNumber}/${totalBatches} 批 (每批最多 ${BATCH_SIZE} 封)`
          
          // Send batch request
          const response = await apiClient.callWithAuth('/admin/notifications/send-batch', {
            notificationIds: batch.map(n => n.notificationId)
          })
          
          if (response.success) {
            successCount += response.data.successCount || 0
            errorCount += response.data.errorCount || 0
            
            // Update local state
            batch.forEach(n => {
              if (response.data.sentIds && response.data.sentIds.includes(n.notificationId)) {
                n.emailSent = true
                n.emailSentTime = Date.now()
              }
            })
          } else {
            errorCount += batch.length
          }
          
          // Update progress
          progressPercentage.value = Math.round(((i + batch.length) / selected.length) * 100)
        }
        
        progressStatus.value = errorCount > 0 ? 'warning' : 'success'
        progressMessage.value = `完成！成功發送 ${successCount} 封，失敗 ${errorCount} 封`
        
        setTimeout(() => {
          showProgressDialog.value = false
          if (successCount > 0) {
            ElMessage.success(`成功發送 ${successCount} 封通知郵件`)
          }
          if (errorCount > 0) {
            ElMessage.warning(`${errorCount} 封郵件發送失敗`)
          }
        }, 2000)
        
      } catch (error) {
        console.error('Error sending emails:', error)
        progressStatus.value = 'exception'
        progressMessage.value = '發送過程中發生錯誤'
        setTimeout(() => {
          showProgressDialog.value = false
          ElMessage.error('郵件發送失敗')
        }, 2000)
      } finally {
        sendingEmails.value = false
      }
    }
    
    const sendSingleEmail = async (notification) => {
      if (notification.emailSent) {
        ElMessage.warning('此通知已經發送過郵件')
        return
      }
      
      if (!confirm(`確定要發送通知郵件給 ${notification.targetUserEmail} 嗎？`)) {
        return
      }
      
      sendingEmails.value = true
      try {
        const response = await apiClient.callWithAuth('/admin/notifications/send-single', {
          notificationId: notification.notificationId
        })
        
        if (response.success) {
          notification.emailSent = true
          notification.emailSentTime = Date.now()
          ElMessage.success('郵件發送成功')
        } else {
          ElMessage.error(`發送失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error sending email:', error)
        ElMessage.error('郵件發送失敗')
      } finally {
        sendingEmails.value = false
      }
    }
    
    const deleteNotification = async (notification) => {
      if (!confirm(`確定要刪除此通知嗎？`)) {
        return
      }
      
      try {
        const response = await apiClient.callWithAuth('/admin/notifications/delete', {
          notificationId: notification.notificationId
        })
        
        if (response.success) {
          // Remove from local list
          const index = notifications.value.findIndex(n => n.notificationId === notification.notificationId)
          if (index !== -1) {
            notifications.value.splice(index, 1)
          }
          ElMessage.success('通知已刪除')
        } else {
          ElMessage.error(`刪除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error deleting notification:', error)
        ElMessage.error('刪除失敗')
      }
    }
    
    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW')
    }
    
    const truncateText = (text, length) => {
      if (!text) return ''
      return text.length > length ? text.substring(0, length) + '...' : text
    }
    
    // Detail drawer methods
    const viewNotificationDetail = (notification) => {
      selectedNotification.value = notification
      showDetailDrawer.value = true
    }
    
    const closeDetailDrawer = () => {
      showDetailDrawer.value = false
      selectedNotification.value = null
    }
    
    const handleDetailDrawerClose = (done) => {
      if (sendingEmails.value) {
        ElMessage.warning('正在處理中，請稍候...')
        return
      }
      done()
    }
    
    const sendSingleEmailFromDetail = async () => {
      if (selectedNotification.value) {
        await sendSingleEmail(selectedNotification.value)
      }
    }
    
    const deleteNotificationFromDetail = async () => {
      if (selectedNotification.value) {
        await deleteNotification(selectedNotification.value)
        closeDetailDrawer()
      }
    }

    const getTypeText = (type) => {
      const typeMap = {
        'stage_start': '階段開始',
        'stage_voting': '階段投票',
        'stage_completed': '階段完成',
        'comment_mention': '評論提及',
        'group_mention': '群組提及',
        'new_comment': '新評論',
        'comment_vote': '評論投票'
      }
      return typeMap[type] || type
    }
    
    const getTypeClass = (type) => {
      const classMap = {
        'stage_start': 'type-stage',
        'stage_voting': 'type-voting',
        'stage_completed': 'type-completed',
        'comment_mention': 'type-mention',
        'group_mention': 'type-mention',
        'new_comment': 'type-comment',
        'comment_vote': 'type-vote'
      }
      return classMap[type] || 'type-default'
    }
    
    onMounted(() => {
      loadProjects()
      loadNotifications()
    })
    
    return {
      // Data
      notifications,
      loading,
      sendingEmails,
      
      // Filters
      searchText,
      emailSentFilter,
      readFilter,
      typeFilter,
      displayLimit,
      
      // Selection
      selectAll,
      isIndeterminate,
      selectedNotifications,

      // Infinite scroll
      displayedNotifications,
      displayCount,
      loadingMore,
      scrollDisabled,
      loadMore,

      // Progress
      showProgressDialog,
      progressMessage,
      progressPercentage,
      progressStatus,
      
      // Computed
      stats,
      filteredNotifications,
      
      // Detail drawer
      showDetailDrawer,
      selectedNotification,
      
      // Methods
      refreshNotifications,
      toggleSelectAll,
      handleSelectionChange,
      downloadWithProjectNames,
      sendSelectedEmails,
      sendSingleEmail,
      deleteNotification,
      formatTime,
      truncateText,
      getTypeText,
      getTypeClass,
      viewNotificationDetail,
      closeDetailDrawer,
      handleDetailDrawerClose,
      sendSingleEmailFromDetail,
      deleteNotificationFromDetail
    }
  }
}
</script>

<style scoped>
.notification-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Header */
.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-left h2 {
  margin: 0;
  color: #2c5aa0;
  font-size: 20px;
}

.header-left h2 i {
  margin-right: 10px;
}

.notification-stats {
  display: flex;
  gap: 40px;
  margin-top: 15px;
}

.stat-item {
  min-width: 120px;
}

.stat-item i {
  margin-right: 8px;
  color: #409EFF;
  font-size: 16px;
}

/* Custom El-Statistic styling */
.stat-item :deep(.el-statistic__head) {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.stat-item :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
}

.stat-item :deep(.el-statistic__content .el-statistic__number) {
  color: #409EFF;
}

.header-right {
  display: flex;
  gap: 10px;
}

/* Filters */
.filters {
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 15px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.slider-filter {
  display: flex;
  align-items: center;
  gap: 15px;
}

.slider-filter label {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

.limit-value {
  font-weight: bold;
  color: #409EFF;
  min-width: 50px;
}

/* Table */
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

.notification-table {
  width: 100%;
  border-collapse: collapse;
}

.notification-table th,
.notification-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.notification-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.notification-table tr:hover {
  background: #f5f7fa;
}

/* Content cell */
.content-cell {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Type badges */
.type-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-stage {
  background: #E6F7FF;
  color: #1890FF;
}

.type-voting {
  background: #FFF7E6;
  color: #FA8C16;
}

.type-completed {
  background: #F0F9FF;
  color: #52C41A;
}

.type-mention {
  background: #FFF0F6;
  color: #EB2F96;
}

.type-comment {
  background: #F9F0FF;
  color: #722ED1;
}

.type-vote {
  background: #E6FFFB;
  color: #13C2C2;
}

.type-default {
  background: #F0F2F5;
  color: #8C8C8C;
}

/* Status indicators */
.status-indicators {
  display: flex;
  gap: 10px;
  font-size: 16px;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-info,
.btn-success,
.btn-danger {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-primary {
  background: #409EFF;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #66b1ff;
}

.btn-secondary {
  background: #909399;
  color: white;
}

.btn-secondary:hover {
  background: #a6a9ad;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #138496;
}

.btn-success {
  background: #67C23A;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #85ce61;
}

.btn-danger {
  background: #F56C6C;
  color: white;
}

.btn-danger:hover {
  background: #f78989;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* No data */
.no-data {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.no-data i {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.no-data p {
  margin: 0;
  font-size: 14px;
}

/* Loading more indicator */
.loading-more {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.loading-more i {
  font-size: 18px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Count info */
.count-info {
  padding: 15px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
}

/* Progress dialog */
.progress-content {
  text-align: center;
  padding: 20px 0;
}

.progress-content p {
  margin-bottom: 20px;
  font-size: 14px;
  color: #606266;
}

/* Custom scrollbar */
.table-container {
  max-height: calc(100vh - 400px);
  overflow-y: auto;
}

.table-container::-webkit-scrollbar {
  width: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.table-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Title cell - normal text, no clickable styling */
.title-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Drawer Navy Header */
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

/* Notification Detail */
.notification-detail {
  padding: 20px;
}

.detail-section {
  margin-bottom: 30px;
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.detail-section h4 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.detail-section h4 i {
  margin-right: 8px;
  color: #409eff;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item label {
  font-weight: 500;
  color: #6c757d;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  color: #2c3e50;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.content-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  line-height: 1.6;
  color: #2c3e50;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  margin: 20px -20px -20px -20px;
}

.detail-actions .btn-primary,
.detail-actions .btn-danger {
  padding: 10px 20px;
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

.detail-actions .btn-primary {
  background: #409eff;
  color: white;
}

.detail-actions .btn-primary:hover {
  background: #66b1ff;
}

.detail-actions .btn-primary:disabled {
  background: #a0cfff;
  cursor: not-allowed;
}

.detail-actions .btn-danger {
  background: #f56c6c;
  color: white;
}

.detail-actions .btn-danger:hover {
  background: #f78989;
}
</style>