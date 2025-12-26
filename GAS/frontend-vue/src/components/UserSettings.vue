<template>
  <div class="user-settings-page">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="page-title">
        <h2>使用者設定</h2>
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
        
        <!-- Avatar Management Section -->
        <div class="settings-section">
          <h3>頭像設定</h3>
          <div class="avatar-management">
            <div class="avatar-preview">
              <el-avatar 
                :src="previewAvatarUrl" 
                :alt="`${user?.displayName || user?.username}的頭像`"
                shape="square"
                :size="120"
                @error="handleAvatarError"
              >
                {{ generateInitials() }}
              </el-avatar>
              <div v-if="user?.badges && user?.badges.length > 0" class="badge-container-large">
                <div 
                  v-for="badge in user.badges" 
                  :key="badge.type"
                  class="user-badge-large"
                  :style="{ backgroundColor: badge.color }"
                  :title="badge.label"
                >
                  <i :class="badge.icon"></i>
                </div>
              </div>
            </div>
            
            <div class="avatar-controls">
              <div class="control-buttons">
                <el-button @click="regenerateAvatar" :loading="regeneratingAvatar">
                  <i class="fas fa-sync"></i>
                  重新生成頭像
                </el-button>
                
                <!-- Custom Avatar Parameters Dropdown -->
                <div class="avatar-params-dropdown" v-click-outside="closeParamsDropdown">
                  <el-button @click="toggleParamsDropdown">
                    <i class="fas fa-sliders-h"></i>
                    調整頭像參數
                    <i class="fas fa-chevron-down" :class="{ rotated: paramsDropdownOpen }"></i>
                  </el-button>
                  
                  <div v-if="paramsDropdownOpen" class="params-menu">
                    <!-- Avatar Style Selection -->
                    <div class="param-group">
                      <label>頭像風格：</label>
                      <div class="style-options">
                        <div 
                          v-for="style in avatarStyles" 
                          :key="style.value"
                          class="style-option"
                          :class="{ selected: currentAvatarStyle === style.value }"
                          @click="updateAvatarStyle(style.value)"
                        >
                          {{ style.label }}
                        </div>
                      </div>
                    </div>
                    
                    <!-- Color Options for Avataaars -->
                    <div v-if="currentAvatarStyle === 'avataaars'" class="param-group">
                      <label>背景顏色：</label>
                      <div class="color-options">
                        <div 
                          v-for="color in backgroundColors" 
                          :key="color.value"
                          class="color-option"
                          :style="{ backgroundColor: '#' + color.value }"
                          :class="{ selected: currentAvatarOptions.backgroundColor === color.value }"
                          @click="updateAvatarOption('backgroundColor', color.value)"
                          :title="color.label"
                        ></div>
                      </div>
                    </div>
                    
                    <div v-if="currentAvatarStyle === 'avataaars'" class="param-group">
                      <label>衣服顏色：</label>
                      <div class="color-options">
                        <div 
                          v-for="color in clothesColors" 
                          :key="color.value"
                          class="color-option"
                          :style="{ backgroundColor: '#' + color.value }"
                          :class="{ selected: currentAvatarOptions.clothesColor === color.value }"
                          @click="updateAvatarOption('clothesColor', color.value)"
                          :title="color.label"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="avatar-save-actions" v-if="avatarChanged">
                <el-button type="primary" @click="saveAvatarSettings" :loading="savingAvatar">
                  儲存頭像設定
                </el-button>
                <el-button @click="resetAvatarSettings">
                  取消變更
                </el-button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- User Information Section -->
        <div class="settings-section">
          <h3>個人資料</h3>
          <div class="user-info">
            <div class="info-item">
              <label>使用者名稱：</label>
              <span>{{ user?.username }}</span>
            </div>
            <div class="info-item">
              <label>顯示名稱：</label>
              <el-input 
                v-if="editingProfile"
                v-model="editProfileForm.displayName"
                placeholder="輸入顯示名稱"
              />
              <span v-else>{{ user?.displayName }}</span>
            </div>
            <div class="info-item">
              <label>電子郵件：</label>
              <span>{{ user?.userEmail }}</span>
            </div>
            
            <!-- Password Change Fields (only show when editing password) -->
            <template v-if="editingPassword">
              <div class="info-item">
                <label>舊密碼：</label>
                <el-input 
                  v-model="passwordForm.oldPassword"
                  type="password"
                  placeholder="輸入目前密碼"
                  show-password
                />
              </div>
              <div class="info-item">
                <label>新密碼：</label>
                <div class="password-input-group">
                  <el-input 
                    v-model="passwordForm.newPassword"
                    type="password"
                    placeholder="輸入新密碼"
                    show-password
                    @input="checkPasswordStrength"
                  />
                  <div class="password-strength">
                    <el-progress 
                      type="circle" 
                      :width="40"
                      :percentage="passwordStrengthPercentage" 
                      :color="passwordStrengthColor"
                      :show-text="false"
                    />
                    <span class="strength-text" :style="{ color: passwordStrengthColor }">
                      {{ passwordStrengthText }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="info-item">
                <label>確認密碼：</label>
                <el-input 
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  placeholder="再次輸入新密碼"
                  show-password
                />
              </div>
            </template>
            
            <div class="info-actions">
              <!-- Normal state buttons -->
              <template v-if="!editingProfile && !editingPassword">
                <el-button type="primary" @click="startEditPassword">修改密碼</el-button>
                <el-button @click="startEditProfile">修改個人資料</el-button>
              </template>
              
              <!-- Profile editing buttons -->
              <template v-if="editingProfile">
                <el-button type="primary" @click="saveProfile" :loading="savingProfile">儲存修改</el-button>
                <el-button @click="cancelEditProfile">放棄修改</el-button>
              </template>
              
              <!-- Password editing buttons -->
              <template v-if="editingPassword">
                <el-button type="primary" @click="savePassword" :loading="changingPassword">儲存密碼</el-button>
                <el-button @click="cancelEditPassword">放棄編輯</el-button>
              </template>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  </div>
</template>

<script>
import TopBarUserControls from './TopBarUserControls.vue'

export default {
  name: 'UserSettings',
  components: {
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
  data() {
    return {
      // Avatar management
      paramsDropdownOpen: false,
      avatarError: false,
      regeneratingAvatar: false,
      savingAvatar: false,
      avatarChanged: false,
      
      // Current avatar settings
      currentAvatarSeed: '',
      currentAvatarStyle: 'avataaars',
      currentAvatarOptions: {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      },
      
      // Avatar style options
      avatarStyles: [
        { value: 'avataaars', label: '卡通人物' },
        { value: 'bottts', label: '機器人' },
        { value: 'identicon', label: '抽象圖案' },
        { value: 'initials', label: '文字縮寫' },
        { value: 'personas', label: '簡約人物' }
      ],
      
      // Color options
      backgroundColors: [
        { value: 'b6e3f4', label: '淺藍色' },
        { value: 'c0392b', label: '紅色' },
        { value: '27ae60', label: '綠色' },
        { value: 'f39c12', label: '橙色' },
        { value: '8e44ad', label: '紫色' },
        { value: '34495e', label: '深灰色' }
      ],
      
      clothesColors: [
        { value: '3c4858', label: '深藍色' },
        { value: 'e74c3c', label: '紅色' },
        { value: '2ecc71', label: '綠色' },
        { value: 'f1c40f', label: '黃色' },
        { value: '9b59b6', label: '紫色' },
        { value: 'ecf0f1', label: '白色' }
      ],
      
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
        score: 0,
        feedback: []
      }
    }
  },
  computed: {
    previewAvatarUrl() {
      if (this.avatarError) {
        return this.generateInitialsAvatar()
      }
      
      return this.generateDicebearUrl(
        this.currentAvatarSeed,
        this.currentAvatarStyle,
        this.currentAvatarOptions
      )
    },
    
    passwordStrengthPercentage() {
      return (this.passwordStrength.score / 4) * 100
    },
    
    passwordStrengthColor() {
      const colors = ['#f56c6c', '#e6a23c', '#e6a23c', '#67c23a', '#67c23a']
      return colors[this.passwordStrength.score] || '#f56c6c'
    },
    
    passwordStrengthText() {
      const texts = ['很弱', '弱', '一般', '強', '很強']
      return texts[this.passwordStrength.score] || '很弱'
    }
  },
  created() {
    this.initializeAvatarSettings()
  },
  
  watch: {
    user: {
      handler(newUser) {
        if (newUser) {
          this.initializeAvatarSettings()
        }
      },
      deep: true
    }
  },
  emits: ['user-command'],
  methods: {
    // Avatar management methods
    initializeAvatarSettings() {
      if (this.user) {
        this.currentAvatarSeed = this.user.avatarSeed || `${this.user.userEmail}_${Date.now()}`
        this.currentAvatarStyle = this.user.avatarStyle || 'avataaars'
        
        // Parse avatarOptions if it's a string
        let userAvatarOptions = {}
        if (this.user.avatarOptions) {
          if (typeof this.user.avatarOptions === 'string') {
            try {
              userAvatarOptions = JSON.parse(this.user.avatarOptions)
            } catch (e) {
              console.warn('Failed to parse avatarOptions:', this.user.avatarOptions)
            }
          } else {
            userAvatarOptions = this.user.avatarOptions
          }
        }
        
        this.currentAvatarOptions = { 
          ...this.currentAvatarOptions,
          ...userAvatarOptions
        }
      }
    },
    
    async regenerateAvatar() {
      this.regeneratingAvatar = true
      try {
        const response = await this.$apiClient.callWithAuth('/users/avatar/regenerate', {})
        
        if (response.success && response.data) {
          this.currentAvatarSeed = response.data.avatarSeed
          this.avatarChanged = true
          this.$message.success('頭像已重新生成！')
        } else {
          this.$message.error('重新生成頭像失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Regenerate avatar error:', error)
        this.$message.error('重新生成頭像失敗')
      } finally {
        this.regeneratingAvatar = false
      }
    },
    
    async saveAvatarSettings() {
      this.savingAvatar = true
      try {
        const response = await this.$apiClient.callWithAuth('/users/avatar/update', {
          avatarData: {
            avatarSeed: this.currentAvatarSeed,
            avatarStyle: this.currentAvatarStyle,
            avatarOptions: this.currentAvatarOptions
          }
        })
        
        if (response.success) {
          this.avatarChanged = false
          this.$message.success('頭像設定已儲存！')
          
          // Update parent component's user data
          this.$emit('user-command', 'refresh-user-data')
        } else {
          this.$message.error('儲存頭像設定失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('Save avatar settings error:', error)
        this.$message.error('儲存頭像設定失敗')
      } finally {
        this.savingAvatar = false
      }
    },
    
    resetAvatarSettings() {
      this.initializeAvatarSettings()
      this.avatarChanged = false
      this.avatarError = false
    },
    
    updateAvatarStyle(style) {
      this.currentAvatarStyle = style
      this.avatarChanged = true
      this.avatarError = false
    },
    
    updateAvatarOption(key, value) {
      this.currentAvatarOptions = {
        ...this.currentAvatarOptions,
        [key]: value
      }
      this.avatarChanged = true
      this.avatarError = false
    },
    
    toggleParamsDropdown() {
      this.paramsDropdownOpen = !this.paramsDropdownOpen
    },
    
    closeParamsDropdown() {
      this.paramsDropdownOpen = false
    },
    
    generateDicebearUrl(seed, style, options = {}) {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '120',
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    },
    
    generateInitialsAvatar() {
      const name = this.user?.displayName || this.user?.username || 'U'
      const initials = name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
      
      return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=120&backgroundColor=b6e3f4`
    },
    
    generateInitials() {
      const name = this.user?.displayName || this.user?.username || 'U'
      return name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
    },
    
    handleAvatarError() {
      this.avatarError = true
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
        const response = await this.$apiClient.callWithAuth('/users/profile', {
          updates: {
            displayName: this.editProfileForm.displayName
          }
        }, 'POST')
        
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
      
      if (this.passwordForm.newPassword.length < 6) {
        this.$message.error('密碼長度至少需要6個字符')
        return
      }
      
      if (this.passwordStrength.score < 2) {
        this.$message.warning('建議使用更強的密碼')
      }
      
      this.changingPassword = true
      try {
        const response = await this.$apiClient.callWithAuth('/auth/change-password', {
          oldPassword: this.passwordForm.oldPassword,
          newPassword: this.passwordForm.newPassword
        })
        
        if (response.success) {
          this.$message.success('密碼已更新！')
          this.editingPassword = false
          this.passwordForm = {
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
          }
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
      // 简化版密码强度检查（替代zxcvbn）
      const password = this.passwordForm.newPassword
      let score = 0
      
      if (password.length >= 8) score++
      if (/[a-z]/.test(password)) score++  
      if (/[A-Z]/.test(password)) score++
      if (/\d/.test(password)) score++
      if (/[^a-zA-Z\d]/.test(password)) score++
      
      this.passwordStrength.score = Math.min(score, 4)
    }
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
}

.content-area {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.settings-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 30px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.settings-section h3 {
  margin: 0 0 25px 0;
  color: #2c3e50;
  font-size: 20px;
  font-weight: 600;
  border-bottom: 2px solid #e4e7ed;
  padding-bottom: 10px;
}

/* Avatar Management */
.avatar-management {
  display: flex;
  gap: 40px;
  align-items: flex-start;
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

.avatar-controls {
  flex: 1;
}

.control-buttons {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.avatar-params-dropdown {
  position: relative;
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
  padding: 8px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 20px;
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
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid #e4e7ed;
  transition: all 0.3s;
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
  text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.avatar-save-actions {
  display: flex;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.rotated {
  transform: rotate(180deg);
}

/* User Information */
.user-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.info-item label {
  font-weight: 600;
  color: #2c3e50;
  min-width: 120px;
}

.info-item span {
  color: #606266;
  flex: 1;
}

.info-actions {
  display: flex;
  gap: 15px;
  justify-content: flex-end;
  margin-top: 10px;
}

/* Password strength styling */
.password-input-group {
  display: flex;
  align-items: center;
  gap: 15px;
  flex: 1;
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 10px;
}

.strength-text {
  font-size: 12px;
  font-weight: 500;
}
</style>