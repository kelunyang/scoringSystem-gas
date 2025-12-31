<template>
  <div class="user-settings-page">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="page-title">
        <h2><i class="fas fa-user-cog"></i> 使用者設定</h2>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="$emit('user-command', $event)"
      />
    </div>

    <!-- Content -->
    <div class="content-area">
      <div class="settings-container">

        <!-- 區塊 1: 個人資料 -->
        <div class="settings-section profile-section">
          <h3><i class="fas fa-user-circle"></i> 個人資料</h3>
          <div class="profile-content">

            <!-- 左側：頭像 -->
            <div class="avatar-column">
              <AvatarEditor
                v-model="avatarData"
                :size="120"
                shape="square"
                customization-layout="dropdown"
                :show-regenerate-button="true"
                :show-save-button="true"
                :user-name="user?.displayName"
                @save="saveAvatarSettings"
                @regenerate="regenerateAvatar"
              >
                <template #badges>
                  <div v-if="userBadges.length > 0" class="badge-container-large">
                    <div
                      v-for="badge in userBadges"
                      :key="badge.type"
                      class="user-badge-large"
                      :style="{ backgroundColor: badge.color }"
                      :title="badge.label"
                    >
                      <i :class="badge.icon"></i>
                    </div>
                  </div>
                </template>
              </AvatarEditor>
            </div>

            <!-- 右側：個人資料 -->
            <div class="profile-column">
              <div class="profile-info">
                <div class="info-item">
                  <label><i class="fas fa-signature"></i> 顯示名稱</label>
                  <el-input
                    v-if="editingProfile"
                    v-model="editProfileForm.displayName"
                    placeholder="輸入顯示名稱"
                    size="default"
                  />
                  <span v-else class="info-value">{{ user?.displayName }}</span>
                </div>

                <div class="info-item">
                  <label><i class="fas fa-envelope"></i> 電子郵件</label>
                  <span class="info-value">{{ user?.userEmail }}</span>
                </div>

                <!-- 密碼修改 (摺疊式) -->
                <div class="password-section">
                  <el-button
                    v-if="!editingPassword && !editingProfile"
                    @click="startEditPassword"
                    size="default"
                  >
                    <i class="fas fa-key"></i> 修改密碼
                  </el-button>

                  <div v-if="editingPassword" class="password-form">
                    <div class="info-item">
                      <label><i class="fas fa-lock"></i> 舊密碼</label>
                      <el-input
                        v-model="passwordForm.oldPassword"
                        type="password"
                        placeholder="輸入目前密碼"
                        show-password
                        size="default"
                      />
                    </div>
                    <div class="info-item">
                      <label><i class="fas fa-lock-open"></i> 新密碼</label>
                      <el-input
                        v-model="passwordForm.newPassword"
                        type="password"
                        placeholder="輸入新密碼"
                        show-password
                        size="default"
                        @input="checkPasswordStrength"
                      />
                      <div class="password-strength" v-if="passwordForm.newPassword">
                        <el-progress
                          :percentage="passwordStrengthPercentage"
                          :color="passwordStrengthColor"
                          :stroke-width="6"
                          :show-text="false"
                        />
                        <span class="strength-text">{{ passwordStrengthText }}</span>
                      </div>
                    </div>
                    <div class="info-item">
                      <label><i class="fas fa-check-double"></i> 確認密碼</label>
                      <el-input
                        v-model="passwordForm.confirmPassword"
                        type="password"
                        placeholder="再次輸入新密碼"
                        show-password
                        size="default"
                      />
                    </div>
                  </div>
                </div>

                <!-- 操作按鈕 -->
                <div class="profile-actions">
                  <!-- Profile editing buttons -->
                  <template v-if="editingProfile">
                    <el-button type="primary" @click="saveProfile" :loading="savingProfile">
                      <i class="fas fa-save"></i> 儲存修改
                    </el-button>
                    <el-button @click="cancelEditProfile">
                      <i class="fas fa-times"></i> 取消
                    </el-button>
                  </template>

                  <!-- Password editing buttons -->
                  <template v-else-if="editingPassword">
                    <el-button type="primary" @click="savePassword" :loading="changingPassword">
                      <i class="fas fa-save"></i> 儲存密碼
                    </el-button>
                    <el-button @click="cancelEditPassword">
                      <i class="fas fa-times"></i> 取消
                    </el-button>
                  </template>

                  <!-- Normal state button -->
                  <template v-else>
                    <el-button type="primary" @click="startEditProfile">
                      <i class="fas fa-edit"></i> 修改個人資料
                    </el-button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 區塊 2: 偏好設定 -->
        <div class="settings-section preferences-section">
          <h3><i class="fas fa-cog"></i> 偏好設定</h3>
          <div class="preferences-grid">

            <!-- 左欄：自動刷新 -->
            <div class="preference-card">
              <div class="preference-header">
                <i class="fas fa-sync-alt"></i>
                <h4>自動刷新設定</h4>
              </div>
              <p class="preference-description">設定專案列表和專案詳情頁面的自動刷新間隔時間</p>

              <div class="slider-control">
                <div class="slider-with-value">
                  <el-slider
                    v-model="refreshTimerValue"
                    :min="10"
                    :max="60"
                    :step="5"
                    :marks="sliderMarks"
                    show-stops
                    @change="handleRefreshTimerChange"
                    class="refresh-timer-slider"
                  />
                  <div class="timer-value-display">
                    <span class="value-number">{{ refreshTimerValue }}</span>
                    <span class="value-unit">分鐘</span>
                  </div>
                </div>
              </div>

              <el-button type="warning" size="small" @click="resetRefreshTimer">
                <i class="fas fa-undo"></i> 重置 (30分鐘)
              </el-button>
            </div>

            <!-- 右欄：階段顯示 -->
            <div class="preference-card">
              <div class="preference-header">
                <i class="fas fa-chart-bar"></i>
                <h4>階段顯示偏好</h4>
              </div>
              <p class="preference-description">選擇專案卡片中的階段進度顯示方式</p>

              <div class="toggle-control">
                <div class="toggle-option">
                  <span class="option-label">流程圖</span>
                  <el-switch
                    v-model="stageDisplayAsGantt"
                    inline-prompt
                    active-text="甘特"
                    inactive-text="流程"
                    @change="handleStageDisplayChange"
                  />
                  <span class="option-label">甘特圖</span>
                </div>
                <div class="preview-hint">
                  <i class="fas fa-info-circle"></i>
                  {{ stageDisplayAsGantt ? '以時間軸甘特圖顯示階段進度' : '以流程圖顯示階段進度' }}
                </div>
              </div>
            </div>

            <!-- 第三欄：教學重置 -->
            <div class="preference-card">
              <div class="preference-header">
                <i class="fas fa-graduation-cap"></i>
                <h4>教學導覽設定</h4>
              </div>
              <p class="preference-description">重置所有首次使用教學，下次造訪頁面時將再次顯示</p>

              <div class="reset-control">
                <el-button type="warning" size="default" @click="resetAllTutorials">
                  <i class="fas fa-redo"></i> 重置所有教學
                </el-button>
              </div>
            </div>

            <!-- 第四欄：通知自動開啟設定 -->
            <div class="preference-card">
              <div class="preference-header">
                <i class="fas fa-bell"></i>
                <h4>通知提醒設定</h4>
              </div>
              <p class="preference-description">有未讀通知時自動開啟通知中心</p>

              <div class="toggle-control">
                <div class="toggle-option">
                  <span class="option-label">關閉</span>
                  <el-switch
                    v-model="autoOpenNotification"
                    inline-prompt
                    active-text="開"
                    inactive-text="關"
                    @change="handleAutoOpenNotificationChange"
                  />
                  <span class="option-label">開啟</span>
                </div>
                <div class="preview-hint">
                  <i class="fas fa-info-circle"></i>
                  {{ autoOpenNotification ? '有未讀通知時將自動開啟通知中心' : '不會自動開啟通知中心，但鈴鐺會有紅點提示' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 區塊 3: 活動統計 -->
        <div class="settings-section activity-section">
          <h3><i class="fas fa-chart-line"></i> 我的活動統計</h3>
          <div class="activity-content">
            <div class="activity-description">
              <i class="fas fa-info-circle"></i>
              <p>查看您的登入記錄和專案活動統計</p>
            </div>

            <!-- Heatmap -->
            <div class="heatmap-container">
              <UserActivityHeatmap
                v-if="user?.userEmail"
                :userEmail="user.userEmail"
                displayMode="full"
                @day-click="handleDayClick"
              />
            </div>

            <!-- Activity Detail Panel -->
            <div v-if="showActivityDetailPanel && selectedDate" class="activity-detail-panel">
              <div class="detail-panel-header">
                <h4><i class="fas fa-calendar-day"></i> {{ selectedDate }} 的活動詳情</h4>
                <el-button size="small" @click="closeActivityDetail">
                  <i class="fas fa-times"></i> 關閉
                </el-button>
              </div>
              <UserActivityDetail
                :userEmail="user.userEmail"
                :date="selectedDate"
                :events="selectedDayEvents"
                :canViewDetails="true"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
import TopBarUserControls from './TopBarUserControls.vue'
import UserActivityHeatmap from './charts/UserActivityHeatmap.vue'
import UserActivityDetail from '@/components/shared/UserActivityDetail.vue'
import AvatarEditor from './shared/AvatarEditor.vue'
import { useBreadcrumb } from '@/composables/useBreadcrumb'
import { rpcClient } from '@/utils/rpc-client'
import { getUserPreferences, setUserPreference } from '@/utils/userPreferences'

export default {
  name: 'UserSettings',
  components: {
    TopBarUserControls,
    UserActivityHeatmap,
    UserActivityDetail,
    AvatarEditor
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
      // Auto-refresh timer setting (in minutes)
      refreshTimerValue: 30,

      // Stage display preference
      stageDisplayAsGantt: false,

      // Auto-open notification center preference
      autoOpenNotification: true,

      sliderMarks: {
        10: '10分',
        30: '30分',
        60: '60分'
      },

      // Profile and password editing states
      editingProfile: false,
      editingPassword: false,
      savingProfile: false,
      changingPassword: false,

      // Form data
      editProfileForm: {
        displayName: ''
      },
      passwordForm: {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      },

      // Password strength
      passwordStrength: {
        level: null,  // 'weak' | 'medium' | 'strong' | null
        message: ''
      },

      // Activity statistics
      selectedDate: null,
      selectedDayEvents: [],
      showActivityDetailPanel: false
    }
  },
  computed: {
    avatarData: {
      get() {
        return {
          avatarSeed: this.user?.avatarSeed || '',
          avatarStyle: this.user?.avatarStyle || 'avataaars',
          avatarOptions: this.user?.avatarOptions || {}
        }
      },
      set(value) {
        // This will be handled by the @change event
      }
    },

    passwordStrengthPercentage() {
      if (!this.passwordStrength.level) return 0
      switch (this.passwordStrength.level) {
        case 'weak': return 33
        case 'medium': return 66
        case 'strong': return 100
        default: return 0
      }
    },

    passwordStrengthColor() {
      if (!this.passwordStrength.level) return '#e1e8ed'
      switch (this.passwordStrength.level) {
        case 'weak': return '#dc3545'
        case 'medium': return '#ffc107'
        case 'strong': return '#28a745'
        default: return '#e1e8ed'
      }
    },

    passwordStrengthText() {
      return this.passwordStrength.message || ''
    },
    userBadges() {
      const permissions = this.user?.permissions || []

      if (permissions.length === 0) {
        return []
      }

      // 級別 1：系統管理類（最高優先級）
      const systemPerms = [
        'system_admin',
        'manage_system_settings',
        'view_system_logs',
        'view_email_logs',
        'manage_email_logs',
        'notification_manager'
      ]
      if (permissions.some(p => systemPerms.includes(p))) {
        return [{
          type: 'system',
          icon: 'fas fa-crown',
          color: '#FFD700',
          label: '系統管理'
        }]
      }

      // 級別 2：使用者管理類
      const userPerms = [
        'manage_users',
        'manage_global_groups',
        'generate_invites',
        'manage_invitations'
      ]
      if (permissions.some(p => userPerms.includes(p))) {
        return [{
          type: 'user',
          icon: 'fas fa-users-cog',
          color: '#9C27B0',
          label: '使用者管理'
        }]
      }

      // 級別 3：專案管理類
      const projectPerms = [
        'create_project',
        'delete_any_project',
        'manage_any_project'
      ]
      if (permissions.some(p => projectPerms.includes(p))) {
        return [{
          type: 'project',
          icon: 'fas fa-project-diagram',
          color: '#409EFF',
          label: '專案管理'
        }]
      }

      return []
    }
  },
  emits: ['user-command'],
  methods: {
    // Auto-refresh timer methods
    loadRefreshTimer() {
      if (!this.user?.userId) return

      const prefs = getUserPreferences(this.user.userId)
      if (prefs.refreshTimer) {
        this.refreshTimerValue = Math.round(prefs.refreshTimer / 60)
      }
    },

    handleRefreshTimerChange(value) {
      if (!this.user?.userId) return

      const seconds = value * 60
      setUserPreference(this.user.userId, 'refreshTimer', seconds)
      this.$message.success(`自動刷新間隔已設定為 ${value} 分鐘`)
      window.dispatchEvent(new CustomEvent('refreshTimerChanged'))
    },

    resetRefreshTimer() {
      if (!this.user?.userId) return

      this.refreshTimerValue = 30
      setUserPreference(this.user.userId, 'refreshTimer', 1800)
      this.$message.success('已重置為默認值 30 分鐘')
      window.dispatchEvent(new CustomEvent('refreshTimerChanged'))
    },

    // Stage display preference methods
    loadStageDisplayPreference() {
      if (!this.user?.userId) return

      const prefs = getUserPreferences(this.user.userId)
      this.stageDisplayAsGantt = prefs.stageDisplayMode === 'gantt'
    },

    handleStageDisplayChange(value) {
      if (!this.user?.userId) return

      const mode = value ? 'gantt' : 'linear'
      setUserPreference(this.user.userId, 'stageDisplayMode', mode)
      this.$message.success(`階段顯示已切換為${value ? '甘特圖' : '流程圖'}模式`)
      window.dispatchEvent(new CustomEvent('stageDisplayModeChanged', {
        detail: { mode }
      }))
    },

    // Tutorial management methods
    resetAllTutorials() {
      if (!this.user?.userId) return

      this.$confirm('確定要重置所有教學導覽嗎？下次造訪 Dashboard、錢包和專案詳情頁面時將再次顯示教學。', '重置教學', {
        confirmButtonText: '確定重置',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // Reset all tutorial flags to false
        setUserPreference(this.user.userId, 'tutorialDashboardCompleted', false)
        setUserPreference(this.user.userId, 'tutorialWalletCompleted', false)
        setUserPreference(this.user.userId, 'tutorialProjectDetailCompleted', false)

        this.$message.success('已重置所有教學導覽，下次造訪時將重新顯示')

        // Trigger custom event for potential listeners
        window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
          detail: { userId: this.user.userId, tutorialsReset: true }
        }))
      }).catch(() => {
        // User cancelled, do nothing
      })
    },

    // Auto-open notification center preference methods
    loadAutoOpenNotificationPreference() {
      if (!this.user?.userId) return

      const prefs = getUserPreferences(this.user.userId)
      // Default to true if not set
      this.autoOpenNotification = prefs.autoOpenNotificationCenter !== false
    },

    handleAutoOpenNotificationChange(value) {
      if (!this.user?.userId) return

      setUserPreference(this.user.userId, 'autoOpenNotificationCenter', value)
      this.$message.success(value ? '已開啟自動顯示通知中心' : '已關閉自動顯示通知中心')

      // Trigger custom event
      window.dispatchEvent(new CustomEvent('userPreferencesChanged', {
        detail: { userId: this.user.userId, autoOpenNotificationCenter: value }
      }))
    },

    // Activity methods
    handleDayClick({ date, events }) {
      this.selectedDate = date
      this.selectedDayEvents = events
      this.showActivityDetailPanel = true
    },

    closeActivityDetail() {
      this.showActivityDetailPanel = false
      this.selectedDate = null
      this.selectedDayEvents = []
    },

    // Avatar management methods (simplified with shared component)
    async regenerateAvatar() {
      try {
        const httpResponse = await rpcClient.users.avatar.regenerate.$post()
        const response = await httpResponse.json()

        if (response.success && response.data) {
          this.$message.success('頭像已重新生成！')
          this.$emit('user-command', 'refresh-user-data')
        } else {
          this.$message.error('重新生成頭像失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Regenerate avatar error:', error)
        this.$message.error('重新生成頭像失敗')
      }
    },

    async saveAvatarSettings(avatarData) {
      try {
        const httpResponse = await rpcClient.users.avatar.update.$post({
          json: { avatarData }
        })
        const response = await httpResponse.json()

        if (response.success) {
          this.$message.success('頭像設定已儲存！')
          this.$emit('user-command', 'refresh-user-data')
        } else {
          this.$message.error('儲存頭像設定失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Save avatar settings error:', error)
        this.$message.error('儲存頭像設定失敗')
      }
    },

    // Profile and password management
    startEditProfile() {
      this.editingProfile = true
      this.editProfileForm.displayName = this.user?.displayName || ''
    },

    startEditPassword() {
      this.editingPassword = true
      this.passwordForm = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    },

    cancelEditProfile() {
      this.editingProfile = false
      this.editProfileForm.displayName = ''
    },

    cancelEditPassword() {
      this.editingPassword = false
      this.passwordForm = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    },

    async saveProfile() {
      if (!this.editProfileForm.displayName.trim()) {
        this.$message.error('顯示名稱不能為空')
        return
      }

      this.savingProfile = true
      try {
        const httpResponse = await rpcClient.users.profile.update.$post({
          json: {
            updates: {
              displayName: this.editProfileForm.displayName
            }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          this.$message.success('個人資料已更新！')
          this.editingProfile = false
          this.$emit('user-command', 'refresh-user-data')
        } else {
          this.$message.error('更新個人資料失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Update profile error:', error)
        this.$message.error('更新個人資料失敗')
      } finally {
        this.savingProfile = false
      }
    },

    async savePassword() {
      if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
        this.$message.error('新密碼與確認密碼不一致')
        return
      }

      if (this.passwordForm.newPassword.length < 8) {
        this.$message.error('密碼長度至少需要8個字符')
        return
      }

      if (!/\d/.test(this.passwordForm.newPassword)) {
        this.$message.error('密碼必須包含至少一個數字')
        return
      }

      if (!/[a-zA-Z]/.test(this.passwordForm.newPassword)) {
        this.$message.error('密碼必須包含至少一個字母')
        return
      }

      if (this.passwordStrength.level === 'weak') {
        this.$message.warning('建議使用更強的密碼')
      }

      this.changingPassword = true
      try {
        const sessionId = sessionStorage.getItem('sessionId')
        if (!sessionId) {
          this.$message.error('Session 已過期，請重新登入')
          this.changingPassword = false
          return
        }
        const httpResponse = await rpcClient.api.auth['change-password'].$post({
          json: {
            sessionId,
            oldPassword: this.passwordForm.oldPassword,
            newPassword: this.passwordForm.newPassword
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          this.$message.success('密碼已更新！')
          this.editingPassword = false
          this.passwordForm = {
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
          }
          this.$emit('user-command', 'refresh-user-data')
        } else {
          this.$message.error('更新密碼失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Change password error:', error)
        this.$message.error('更新密碼失敗')
      } finally {
        this.changingPassword = false
      }
    },

    checkPasswordStrength() {
      const password = this.passwordForm.newPassword

      if (!password) {
        this.passwordStrength = { level: null, message: '' }
        return
      }

      let strength = 0

      if (password.length >= 8) strength += 1
      if (password.length >= 12) strength += 1
      if (/[a-z]/.test(password)) strength += 1
      if (/[A-Z]/.test(password)) strength += 1
      if (/[0-9]/.test(password)) strength += 1
      if (/[^a-zA-Z0-9]/.test(password)) strength += 1

      if (password.length < 8) {
        this.passwordStrength = { level: 'weak', message: '密碼至少需要8字元' }
      } else if (strength < 3) {
        this.passwordStrength = { level: 'weak', message: '密碼強度：弱' }
      } else if (strength < 5) {
        this.passwordStrength = { level: 'medium', message: '密碼強度：中等' }
      } else {
        this.passwordStrength = { level: 'strong', message: '密碼強度：強' }
      }
    }
  },
  mounted() {
    this.loadRefreshTimer()
    this.loadStageDisplayPreference()
    this.loadAutoOpenNotificationPreference()

    const { setPageTitle, clearProjectTitle } = useBreadcrumb()
    setPageTitle('用戶設置')
    clearProjectTitle()
  },
  directives: {
    'click-outside': {
      beforeMount(el, binding) {
        el.clickOutsideEvent = function(event) {
          if (!(el === event.target || el.contains(event.target))) {
            binding.value()
          }
        }
        document.addEventListener('click', el.clickOutsideEvent)
      },
      unmounted(el) {
        document.removeEventListener('click', el.clickOutsideEvent)
      }
    }
  }
}
</script>

<style scoped>
/* ======================
   Base Layout
   ====================== */
.user-settings-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
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

.page-title h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-area {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.settings-section h3 {
  margin: 0 0 25px 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
  border-bottom: 2px solid #e4e7ed;
  padding-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ======================
   區塊 1: 個人資料
   ====================== */
.profile-content {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 40px;
  align-items: start;
}

/* 左側：頭像 */
.avatar-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.avatar-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-container-large {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-badge-large {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  font-size: 12px;
  color: white;
}

.avatar-retry-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #409eff;
  font-weight: 500;
  border-radius: 8px;
}

.avatar-retry-indicator i {
  font-size: 24px;
}

.avatar-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.avatar-params-dropdown {
  position: relative;
  flex: 1;
}

.params-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid #e4e7ed;
  min-width: 320px;
  max-width: 400px;
  max-height: 500px;
  overflow-y: auto;
  z-index: 1000;
  padding: 20px;
}

.param-group {
  margin-bottom: 20px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-group label {
  display: block;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 14px;
}

.style-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.style-option {
  padding: 6px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  transition: all 0.3s;
  background: white;
}

.style-option:hover {
  border-color: #409eff;
  color: #409eff;
}

.style-option.selected {
  background: #409eff;
  color: white;
  border-color: #409eff;
}

.color-options {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.2s;
  position: relative;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: #409eff;
}

.color-option.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.color-option.selected::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
}

.avatar-save-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #b3e0ff;
}

/* 右側：個人資料 */
.profile-column {
  flex: 1;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-value {
  color: #606266;
  padding: 10px 15px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.password-section {
  margin-top: 10px;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
  padding: 20px;
  background: #fef6e8;
  border-radius: 8px;
  border: 1px solid #f0d49a;
}

.password-strength {
  margin-top: 8px;
}

.strength-text {
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 4px;
  display: block;
}

.profile-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-start;
  margin-top: 10px;
}

/* ======================
   區塊 2: 偏好設定
   ====================== */
.preferences-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.preference-card {
  padding: 20px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.preference-header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #2c3e50;
}

.preference-header i {
  font-size: 18px;
  color: #67c23a;
}

.preference-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.preference-description {
  margin: 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.slider-control {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.slider-with-value {
  display: flex;
  align-items: center;
  gap: 20px;
}

.refresh-timer-slider {
  flex: 1;
}

.timer-value-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  height: 70px;
  background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.25);
}

.value-number {
  font-size: 24px;
  font-weight: 700;
  color: white;
  line-height: 1;
}

.value-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 2px;
}

.toggle-control {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.toggle-option {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 15px;
  background: white;
  border-radius: 6px;
}

.option-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  min-width: 70px;
  text-align: center;
}

.preview-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: #f0f2f5;
  border-radius: 6px;
  color: #606266;
  font-size: 12px;
}

.preview-hint i {
  color: #409eff;
}

.reset-control {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 15px 0;
}

.reset-control .el-button {
  width: 100%;
}

/* ======================
   區塊 3: 活動統計
   ====================== */
.activity-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.activity-description {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 6px;
  border-left: 3px solid #409eff;
}

.activity-description i {
  color: #409eff;
  font-size: 16px;
}

.activity-description p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.heatmap-container {
  padding: 20px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  min-height: 400px;
}

.activity-detail-panel {
  padding: 20px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e4e7ed;
}

.detail-panel-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ======================
   Responsive
   ====================== */
@media (max-width: 1024px) {
  .profile-content {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  .preferences-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .content-area {
    padding: 20px;
  }

  .settings-section {
    padding: 20px;
  }

  .avatar-actions {
    flex-direction: column;
  }

  .profile-actions {
    flex-direction: column;
  }

  .slider-with-value {
    flex-direction: column;
  }
}

/* ======================
   Element Plus Overrides
   ====================== */
.refresh-timer-slider :deep(.el-slider__runway) {
  height: 6px;
  background: #e4e7ed;
}

.refresh-timer-slider :deep(.el-slider__bar) {
  height: 6px;
  background: linear-gradient(90deg, #67c23a 0%, #85ce61 100%);
}

.refresh-timer-slider :deep(.el-slider__button) {
  width: 18px;
  height: 18px;
  border: 3px solid #67c23a;
  background: white;
}

.refresh-timer-slider :deep(.el-slider__button:hover) {
  transform: scale(1.2);
}

.refresh-timer-slider :deep(.el-slider__stop) {
  width: 4px;
  height: 4px;
  background: #c0c4cc;
}

.refresh-timer-slider :deep(.el-slider__marks-text) {
  color: #909399;
  font-size: 11px;
}

/* Portrait mode: Hide TopBarUserControls in top-bar (moved to sidebar) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  .top-bar :deep(.user-controls) {
    display: none !important;
  }
}
</style>
