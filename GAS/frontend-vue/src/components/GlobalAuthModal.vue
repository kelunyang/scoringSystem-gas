<template>
  <div class="global-auth-modal" v-if="visible" @click="closable ? handleClose : null">
    <div class="modal-content" @click.stop>
      <!-- Header with Maroon Background -->
      <div class="modal-header">
        <h2 class="modal-title">登入系統</h2>
        <button v-if="closable" class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- System Notification Banner -->
      <div class="notification-banner" v-if="systemNotification">
        {{ systemNotification }}
      </div>

      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button 
          class="tab-btn"
          :class="{ active: currentTab === 'login' }"
          @click="switchTab('login')"
        >
          登入
        </button>
        <button 
          class="tab-btn"
          :class="{ active: currentTab === 'register' }"
          @click="switchTab('register')"
        >
          我有邀請碼，註冊帳號
        </button>
        <button 
          class="tab-btn"
          :class="{ active: currentTab === 'forgot' }"
          @click="switchTab('forgot')"
        >
          忘記密碼
        </button>
      </div>

      <!-- Tab Content Container -->
      <div class="tab-content">
        <!-- Login Tab -->
        <div v-show="currentTab === 'login'" class="auth-form">
          <!-- Two-Factor Authentication Steps -->
          <div class="steps-container">
            <el-steps 
              :active="emailPasswordVerified ? 1 : 0" 
              finish-status="success" 
              align-center
              simple
            >
              <el-step 
                title="驗證密碼" 
                description="確認email和密碼"
                :icon="emailPasswordVerified ? 'Check' : (loading && !emailPasswordVerified ? 'Loading' : 'Lock')"
                :status="loading && !emailPasswordVerified ? 'process' : (emailPasswordVerified ? 'success' : 'wait')"
              />
              <el-step 
                title="兩階段驗證" 
                description="輸入驗證碼"
                :icon="loading && emailPasswordVerified ? 'Loading' : 'Message'"
                :status="loading && emailPasswordVerified ? 'process' : 'wait'"
              />
            </el-steps>
          </div>

          <!-- Step 1: Email and Password Verification -->
          <div v-show="!emailPasswordVerified" class="email-password-step">
            <div class="step-content-header">
              <h3>登入驗證</h3>
              <p class="step-description">請輸入您的email和密碼</p>
            </div>
            
            <div class="form-group">
              <label for="loginEmail">Email</label>
              <input
                id="loginEmail"
                type="email"
                v-model="loginData.userEmail"
                class="form-input"
                placeholder="請輸入電子郵件地址"
                :disabled="loading"
                @keyup.enter="handleEmailPasswordLogin"
              />
            </div>

            <div class="form-group">
              <label for="loginPassword">密碼</label>
              <input
                id="loginPassword"
                type="password"
                v-model="loginData.password"
                class="form-input"
                placeholder="請輸入密碼"
                :disabled="loading"
                @keyup.enter="handleEmailPasswordLogin"
              />
            </div>

            <!-- Turnstile CAPTCHA for Login -->
            <TurnstileWidget
              ref="loginTurnstile"
              @success="handleLoginTurnstileSuccess"
              @error="handleLoginTurnstileError"
              @expired="handleLoginTurnstileExpired"
            />

            <div class="form-actions">
              <button
                class="btn btn-primary"
                @click="handleEmailPasswordLogin"
                :disabled="loading || !canLogin || !loginTurnstileToken"
              >
                <div v-if="loading" class="spinner"></div>
                {{ loading ? '驗證中...' : '發送驗證碼' }}
              </button>
            </div>
          </div>

          <!-- Step 2: Two-Factor Authentication Code -->
          <div v-show="emailPasswordVerified" class="two-factor-step">
            <div class="step-content-header">
              <h3>兩階段驗證</h3>
              <p class="step-description">
                我們已發送6位英文字母驗證碼到您的email：<strong>{{ maskedEmail }}</strong>
              </p>
            </div>
            
            <div class="form-group">
              <label for="verificationCode">驗證碼</label>
              <input
                id="verificationCode"
                type="text"
                v-model="loginData.verificationCode"
                class="form-input verification-code-input"
                placeholder="請輸入6位英文字母驗證碼"
                maxlength="6"
                :disabled="loading"
                @keyup.enter="handleTwoFactorLogin"
                @input="formatVerificationCode"
              />
              <div class="verification-expiry-section">
                <div class="expiry-text">
                  驗證碼剩餘時間：{{ formatVerificationTime() }}
                </div>
                <el-progress 
                  :percentage="verificationProgressPercentage" 
                  :color="getVerificationProgressColor()"
                  :show-text="false"
                  :stroke-width="8"
                  class="verification-progress"
                />
              </div>
            </div>

            <div class="form-actions">
              <button 
                class="btn btn-primary"
                @click="handleTwoFactorLogin"
                :disabled="loginLoading || !canSubmitVerificationCode"
              >
                <div v-if="loginLoading" class="spinner"></div>
                {{ loginLoading ? '驗證中...' : '完成登入' }}
              </button>
              <button 
                class="btn btn-primary resend-btn"
                @click="resendVerificationCode"
                :disabled="resendLoading || resendCooldown > 0"
              >
                <div v-if="resendLoading" class="spinner"></div>
                <div v-else-if="resendCooldown > 0" class="resend-countdown">
                  <i class="fas fa-spinner fa-spin"></i>
                  <span class="countdown-text">{{ resendCooldown }}秒</span>
                </div>
                <span v-else>重新發送</span>
              </button>
              <button 
                class="btn btn-secondary"
                @click="backToEmailPassword"
                :disabled="loading"
              >
                返回上一步
              </button>
            </div>
          </div>
        </div>

        <!-- Register Tab -->
        <div v-show="currentTab === 'register'" class="auth-form">
          <!-- Steps Progress -->
          <div class="steps-container">
            <el-steps 
              :active="invitationVerified ? 1 : 0" 
              finish-status="success" 
              align-center
              simple
            >
              <el-step 
                title="驗證邀請碼" 
                description="確認邀請碼有效性"
                :icon="invitationVerified ? 'Check' : (loading && !invitationVerified ? 'Loading' : 'Document')"
                :status="loading && !invitationVerified ? 'process' : (invitationVerified ? 'success' : 'wait')"
              />
              <el-step 
                title="填寫資料" 
                description="完成註冊資訊"
                :icon="loading && invitationVerified ? 'Loading' : 'User'"
                :status="loading && invitationVerified ? 'process' : 'wait'"
              />
            </el-steps>
          </div>

          <!-- Step 1: Invitation Code Verification -->
          <div v-show="!invitationVerified" class="invitation-verification-step">
            <div class="step-content-header">
              <h3>驗證邀請碼</h3>
              <p class="step-description">請輸入您收到的邀請碼和email進行驗證</p>
            </div>
            
            <div class="form-group">
              <label for="registerEmail">Email地址</label>
              <input
                id="registerEmail"
                type="email"
                v-model="registerData.userEmail"
                class="form-input"
                placeholder="請輸入您的email地址"
                :disabled="loading"
              />
              <div class="field-hint">請輸入收到邀請碼的email地址</div>
            </div>

            <div class="form-group">
              <label for="invitationCode">邀請碼</label>
              <input
                id="invitationCode"
                type="text"
                v-model="registerData.invitationCode"
                class="form-input"
                placeholder="ABCD-EFGH-IJKL"
                :disabled="loading"
                @input="formatInvitationCode"
              />
              <div class="field-hint">請輸入12位字母數字邀請碼，格式：ABCD-EFGH-IJKL</div>
            </div>

            <!-- Turnstile CAPTCHA for Registration -->
            <TurnstileWidget
              ref="registerTurnstile"
              @success="handleRegisterTurnstileSuccess"
              @error="handleRegisterTurnstileError"
              @expired="handleRegisterTurnstileExpired"
            />

            <div class="form-actions">
              <button
                class="btn btn-primary"
                @click="verifyInvitationCode"
                :disabled="loading || !canVerifyInvitation || !registerTurnstileToken"
              >
                <div v-if="loading" class="spinner"></div>
                {{ loading ? '驗證中...' : '驗證邀請碼' }}
              </button>
            </div>
          </div>

          <!-- Step 2: User Registration Form -->
          <div v-show="invitationVerified" class="user-registration-step">
            <div class="step-content-header">
              <h3>完成註冊</h3>
              <p class="step-description">邀請碼驗證成功！請填寫您的基本資料</p>
            </div>

            <!-- Show verified email (disabled) -->
            <div class="form-group">
              <label>Email地址</label>
              <input
                type="email"
                v-model="registerData.userEmail"
                class="form-input verified-field"
                disabled
              />
              <div class="field-hint verified-hint">✓ 已驗證</div>
            </div>

            <div class="form-group">
              <label for="registerUsername">使用者名稱</label>
              <input
                id="registerUsername"
                type="text"
                v-model="registerData.username"
                class="form-input"
                placeholder="3-20字元，僅限英文數字底線連字號"
                :disabled="loading"
              />
              <div class="field-status" v-if="usernameStatus">
                <span :class="usernameStatus.type">{{ usernameStatus.message }}</span>
              </div>
            </div>

          <div class="form-group">
            <label for="registerDisplayName">顯示名稱</label>
            <input
              id="registerDisplayName"
              type="text"
              v-model="registerData.displayName"
              class="form-input"
              placeholder="請輸入顯示名稱"
              :disabled="loading"
            />
          </div>

          <div class="form-group">
            <label for="registerPassword">密碼</label>
            <input
              id="registerPassword"
              type="password"
              v-model="registerData.password"
              class="form-input"
              placeholder="至少6字元"
              :disabled="loading"
              @input="checkPasswordStrength"
            />
            <div class="password-strength" v-if="passwordStrength">
              <div class="strength-bar" :class="passwordStrength.level">
                <div class="strength-fill"></div>
              </div>
              <span class="strength-text">{{ passwordStrength.message }}</span>
            </div>
          </div>

          <div class="form-group">
            <label for="confirmPassword">確認密碼</label>
            <input
              id="confirmPassword"
              type="password"
              v-model="registerData.confirmPassword"
              class="form-input"
              placeholder="請再次輸入密碼"
              :disabled="loading"
            />
            <div class="field-status" v-if="passwordMatchStatus">
              <span :class="passwordMatchStatus.type">{{ passwordMatchStatus.message }}</span>
            </div>
          </div>

          <!-- Avatar Customization Section -->
          <div class="form-group avatar-section">
            <label>頭像設定</label>
            <div class="avatar-customization">
              <div class="avatar-preview-small">
                <el-avatar 
                  :src="previewAvatarUrl" 
                  shape="square"
                  :size="80"
                  @error="handleAvatarPreviewError"
                >
                  {{ getPreviewInitials() }}
                </el-avatar>
              </div>
              
              <div class="avatar-controls-register">
                <button type="button" class="avatar-btn" @click="regenerateAvatarPreview" :disabled="loading">
                  <i class="fas fa-sync"></i>
                  重新生成
                </button>
                
                <div class="avatar-style-selector">
                  <select v-model="registerData.avatarStyle" class="style-select" @change="updateAvatarPreview">
                    <option v-for="style in avatarStyles" :key="style.value" :value="style.value">
                      {{ style.label }}
                    </option>
                  </select>
                </div>
                
                <div v-if="registerData.avatarStyle === 'avataaars'" class="quick-colors">
                  <div class="color-row">
                    <span class="color-label">背景：</span>
                    <div 
                      v-for="color in quickBackgroundColors" 
                      :key="color.value"
                      class="color-dot"
                      :style="{ backgroundColor: '#' + color.value }"
                      :class="{ selected: registerData.avatarOptions.backgroundColor === color.value }"
                      @click="updateBackgroundColor(color.value)"
                      :title="color.label"
                    ></div>
                  </div>
                  <div class="color-row">
                    <span class="color-label">衣服：</span>
                    <div 
                      v-for="color in quickClothesColors" 
                      :key="color.value"
                      class="color-dot"
                      :style="{ backgroundColor: '#' + color.value }"
                      :class="{ selected: registerData.avatarOptions.clothesColor === color.value }"
                      @click="updateClothesColor(color.value)"
                      :title="color.label"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            <div class="form-actions">
              <button 
                class="btn btn-secondary"
                @click="backToInvitationStep"
                :disabled="loading"
              >
                返回上一步
              </button>
              <button 
                class="btn btn-primary"
                @click="handleRegister"
                :disabled="loading || !canRegister"
              >
                <div v-if="loading" class="spinner"></div>
                {{ loading ? '註冊中...' : '註冊' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Forgot Password Tab -->
        <div v-show="currentTab === 'forgot'" class="auth-form">
          <!-- Success message at top -->
          <div class="reset-info" v-if="resetSent">
            <div class="success-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              密碼已重設，請收信並依據信中的新密碼登入
            </div>
          </div>

          <div class="form-group">
            <label for="resetEmail">電子郵件</label>
            <div style="display: flex; gap: 8px;">
              <input
                id="resetEmail"
                type="email"
                v-model="forgotData.userEmail"
                class="form-input"
                placeholder="請輸入註冊時的電子郵件"
                :disabled="verifyingEmail || emailVerified"
                style="flex: 8;"
              />
              <button
                class="btn btn-secondary"
                @click="verifyEmail"
                :disabled="!canVerifyEmail || verifyingEmail"
                style="flex: 2;"
              >
                <i v-if="verifyingEmail" class="fas fa-spinner fa-spin"></i>
                <i v-else-if="emailVerified" class="fas fa-check"></i>
                <span v-if="!verifyingEmail && !emailVerified">驗證email</span>
                <span v-else-if="verifyingEmail">驗證中...</span>
                <span v-else>已驗證</span>
              </button>
            </div>
          </div>

          <!-- Turnstile CAPTCHA for Password Reset -->
          <TurnstileWidget
            v-if="emailVerified"
            ref="forgotTurnstile"
            @success="handleForgotTurnstileSuccess"
            @error="handleForgotTurnstileError"
            @expired="handleForgotTurnstileExpired"
          />

          <div class="form-group" v-if="emailVerified && availableTags.length > 0">
            <label for="resetTags">勾選你的身份</label>
            <el-select
              id="resetTags"
              v-model="forgotData.selectedTagIds"
              multiple
              placeholder="請選擇您的身份標籤"
              style="width: 100%;"
              :disabled="sendingReset"
            >
              <el-option
                v-for="tag in availableTags"
                :key="tag.tagId"
                :label="tag.tagName"
                :value="tag.tagId"
              />
            </el-select>
          </div>

          <div class="form-actions">
            <button
              class="btn btn-primary"
              @click="handleForgotPassword"
              :disabled="!canSendReset || sendingReset || !forgotTurnstileToken"
            >
              <i v-if="sendingReset" class="fas fa-spinner fa-spin"></i>
              {{ sendingReset ? '發送中...' : '送出重設連結' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Error Message Display -->
      <div class="error-message" v-if="errorMessage">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/>
          <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/>
        </svg>
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<script>
import TurnstileWidget from './TurnstileWidget.vue'

export default {
  components: {
    TurnstileWidget
  },
  name: 'GlobalAuthModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    systemNotification: {
      type: String,
      default: '[放在propertiesService裡的markdown通知內容]'
    },
    closable: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      currentTab: 'login',
      loading: false,
      loginLoading: false,        // 完成登入按鈕loading
      resendLoading: false,       // 重新發送按鈕loading
      errorMessage: '',
      resetSent: false,
      
      // Two-step registration state
      invitationVerified: false,
      verifiedInvitationData: null,
      
      // Two-step login state
      emailPasswordVerified: false,
      resendCooldown: 0,
      resendTimer: null,             // 重發冷卻計時器實例
      
      // Verification code expiry
      verificationCodeExpiry: null,  // 過期時間戳
      verificationRemainingTime: 600, // 剩餘秒數 (10分鐘 = 600秒)
      verificationTimer: null,       // 計時器實例
      
      // Login form data
      loginData: {
        userEmail: '',
        password: '',
        verificationCode: ''
      },
      
      // Register form data
      registerData: {
        invitationCode: '',
        username: '',
        userEmail: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        avatarSeed: '',
        avatarStyle: 'avataaars',
        avatarOptions: {
          backgroundColor: 'b6e3f4',
          clothesColor: '3c4858',
          skinColor: 'ae5d29'
        }
      },
      
      // Forgot password form data
      forgotData: {
        userEmail: '',
        selectedTagIds: []
      },

      // Forgot password state
      verifyingEmail: false,
      emailVerified: false,
      availableTags: [],
      sendingReset: false,
      
      // Validation status
      usernameStatus: null,
      emailStatus: null,
      passwordStrength: null,
      passwordMatchStatus: null,
      
      // Turnstile tokens
      loginTurnstileToken: null,
      registerTurnstileToken: null,
      forgotTurnstileToken: null,

      // Avatar customization
      avatarPreviewError: false,
      avatarStyles: [
        { value: 'avataaars', label: '卡通人物' },
        { value: 'bottts', label: '機器人' },
        { value: 'identicon', label: '抽象圖案' },
        { value: 'initials', label: '文字縮寫' },
        { value: 'personas', label: '簡約人物' }
      ],
      
      quickBackgroundColors: [
        { value: 'b6e3f4', label: '淺藍色' },
        { value: 'c0392b', label: '紅色' },
        { value: '27ae60', label: '綠色' },
        { value: 'f39c12', label: '橙色' },
        { value: '8e44ad', label: '紫色' }
      ],
      
      quickClothesColors: [
        { value: '3c4858', label: '深藍色' },
        { value: 'e74c3c', label: '紅色' },
        { value: '2ecc71', label: '綠色' },
        { value: 'f1c40f', label: '黃色' },
        { value: '9b59b6', label: '紫色' }
      ]
    }
  },
  computed: {
    canLogin() {
      return this.loginData.userEmail.trim() && this.loginData.password.trim()
    },
    
    canSubmitVerificationCode() {
      return this.loginData.verificationCode.trim().length === 6
    },
    
    maskedEmail() {
      if (!this.loginData.userEmail) return ''
      const [username, domain] = this.loginData.userEmail.split('@')
      if (username.length <= 2) return this.loginData.userEmail
      const maskedUsername = username[0] + '*'.repeat(username.length - 2) + username[username.length - 1]
      return `${maskedUsername}@${domain}`
    },
    
    canVerifyInvitation() {
      return (
        this.registerData.invitationCode.trim() &&
        this.registerData.userEmail.trim() &&
        this.validateEmail(this.registerData.userEmail)
      )
    },
    
    canRegister() {
      return (
        this.invitationVerified &&
        this.registerData.username.trim() &&
        this.registerData.displayName.trim() &&
        this.registerData.password.trim() &&
        this.registerData.confirmPassword.trim() &&
        this.registerData.password === this.registerData.confirmPassword
      )
    },
    
    canVerifyEmail() {
      return (
        this.forgotData.userEmail.trim() &&
        this.validateEmail(this.forgotData.userEmail) &&
        !this.verifyingEmail &&
        !this.emailVerified
      )
    },

    canSendReset() {
      return (
        this.emailVerified &&
        this.forgotData.selectedTagIds.length > 0 &&
        !this.sendingReset
      )
    },
    
    previewAvatarUrl() {
      if (this.avatarPreviewError) {
        return this.generateInitialsAvatarUrl()
      }
      
      return this.generateDicebearUrl(
        this.registerData.avatarSeed || this.generateDefaultSeed(),
        this.registerData.avatarStyle,
        this.registerData.avatarOptions
      )
    },

    verificationProgressPercentage() {
      const totalTime = 600 // 10分鐘 = 600秒
      return Math.max(0, Math.min(100, (this.verificationRemainingTime / totalTime) * 100))
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.resetForm()
      }
    },
    
    'registerData.confirmPassword'(newVal) {
      if (newVal && this.registerData.password) {
        this.checkPasswordMatch()
      }
    },
    
    'registerData.userEmail'(newVal) {
      if (newVal && !this.registerData.avatarSeed) {
        this.initializeAvatarSeed()
      }
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },
    
    switchTab(tab) {
      this.currentTab = tab
      this.clearError()
      this.resetSent = false

      // Reset registration state when switching away from register tab
      if (tab !== 'register') {
        this.invitationVerified = false
        this.verifiedInvitationData = null
      }

      // Reset login state when switching away from login tab
      if (tab !== 'login') {
        this.emailPasswordVerified = false
        this.resendCooldown = 0
        this.stopVerificationTimer()
        this.stopResendTimer()
      }

      // Reset forgot password state when switching away from forgot tab
      if (tab !== 'forgot') {
        this.verifyingEmail = false
        this.emailVerified = false
        this.availableTags = []
        this.sendingReset = false
        this.forgotData.selectedTagIds = []
      }
    },
    
    resetForm() {
      this.loginData = { userEmail: '', password: '', verificationCode: '' }
      this.emailPasswordVerified = false
      this.resendCooldown = 0
      this.registerData = {
        invitationCode: '', username: '', userEmail: '', 
        displayName: '', password: '', confirmPassword: '',
        avatarSeed: '',
        avatarStyle: 'avataaars',
        avatarOptions: {
          backgroundColor: 'b6e3f4',
          clothesColor: '3c4858',
          skinColor: 'ae5d29'
        }
      }
      this.forgotData = { username: '', userEmail: '' }
      this.clearError()
      this.resetSent = false
      this.usernameStatus = null
      this.emailStatus = null
      this.passwordStrength = null
      this.passwordMatchStatus = null
      this.avatarPreviewError = false
      
      // Reset two-step registration state
      this.invitationVerified = false
      this.verifiedInvitationData = null
      
      // 清理所有計時器
      this.stopVerificationTimer()
      this.stopResendTimer()
      this.verificationRemainingTime = 600
      this.resendCooldown = 0
    },
    
    backToInvitationStep() {
      this.invitationVerified = false
      this.verifiedInvitationData = null
      this.clearError()
    },
    
    clearError() {
      this.errorMessage = ''
    },
    
    formatInvitationCode() {
      let value = this.registerData.invitationCode.replace(/[^A-Z0-9]/g, '').toUpperCase()
      if (value.length > 4) value = value.substring(0, 4) + '-' + value.substring(4)
      if (value.length > 9) value = value.substring(0, 9) + '-' + value.substring(9, 13)
      this.registerData.invitationCode = value
    },
    
    validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    },
    
    async verifyInvitationCode() {
      if (!this.canVerifyInvitation) return
      
      this.loading = true
      this.clearError()
      
      try {
        const response = await this.$apiClient.call('/invitations/verify', {
          invitationCode: this.registerData.invitationCode,
          userEmail: this.registerData.userEmail,
          turnstileToken: this.registerTurnstileToken
        })
        
        if (response.success) {
          this.verifiedInvitationData = response.data
          this.invitationVerified = true
          
          // Show success message with El Message
          this.$message({
            type: 'success',
            message: '邀請碼驗證成功！請繼續填寫註冊資料',
            duration: 3000
          })
        } else {
          this.errorMessage = response.error?.message || '邀請碼驗證失敗'
        }
      } catch (error) {
        console.error('Verify invitation error:', error)
        this.errorMessage = '驗證邀請碼時發生錯誤，請重試'
      } finally {
        this.loading = false
      }
    },
    
    async checkUsernameAvailability() {
      const username = this.registerData.username.trim()
      if (!username) {
        this.usernameStatus = null
        return
      }
      
      if (username.length < 3 || username.length > 20) {
        this.usernameStatus = {
          type: 'error',
          message: '使用者名稱需要3-20字元'
        }
        return
      }
      
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        this.usernameStatus = {
          type: 'error',
          message: '僅限英文數字底線連字號'
        }
        return
      }
      
      try {
        const response = await this.$apiClient.callWithAuth('/auth/check-username', { username })
        this.usernameStatus = response.available ? 
          { type: 'success', message: '使用者名稱可用' } :
          { type: 'error', message: '使用者名稱已被使用' }
      } catch (error) {
        this.usernameStatus = { type: 'error', message: '檢查失敗，請重試' }
      }
    },
    
    async checkEmailAvailability() {
      const email = this.registerData.userEmail.trim()
      if (!email) {
        this.emailStatus = null
        return
      }
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.emailStatus = {
          type: 'error',
          message: '請輸入有效的電子郵件地址'
        }
        return
      }
      
      try {
        const response = await this.$apiClient.callWithAuth('/auth/check-email', { userEmail: email })
        this.emailStatus = response.available ? 
          { type: 'success', message: '電子郵件可用' } :
          { type: 'error', message: '電子郵件已被使用' }
      } catch (error) {
        this.emailStatus = { type: 'error', message: '檢查失敗，請重試' }
      }
    },
    
    checkPasswordStrength() {
      const password = this.registerData.password
      if (!password) {
        this.passwordStrength = null
        return
      }

      let strength = 0
      let message = ''

      if (password.length >= 6) strength += 1
      if (password.length >= 10) strength += 1
      if (/[a-z]/.test(password)) strength += 1
      if (/[A-Z]/.test(password)) strength += 1
      if (/[0-9]/.test(password)) strength += 1
      if (/[^a-zA-Z0-9]/.test(password)) strength += 1

      if (password.length < 6) {
        this.passwordStrength = { level: 'weak', message: '密碼至少需要6字元' }
      } else if (strength < 3) {
        this.passwordStrength = { level: 'weak', message: '密碼強度：弱' }
      } else if (strength < 5) {
        this.passwordStrength = { level: 'medium', message: '密碼強度：中等' }
      } else {
        this.passwordStrength = { level: 'strong', message: '密碼強度：強' }
      }
    },

    // Turnstile callback handlers
    handleLoginTurnstileSuccess(token) {
      this.loginTurnstileToken = token
    },

    handleLoginTurnstileError(error) {
      this.loginTurnstileToken = null
      console.error('Login Turnstile error:', error)
    },

    handleLoginTurnstileExpired() {
      this.loginTurnstileToken = null
    },

    handleRegisterTurnstileSuccess(token) {
      this.registerTurnstileToken = token
    },

    handleRegisterTurnstileError(error) {
      this.registerTurnstileToken = null
      console.error('Register Turnstile error:', error)
    },

    handleRegisterTurnstileExpired() {
      this.registerTurnstileToken = null
    },

    handleForgotTurnstileSuccess(token) {
      this.forgotTurnstileToken = token
    },

    handleForgotTurnstileError(error) {
      this.forgotTurnstileToken = null
      console.error('Forgot Turnstile error:', error)
    },

    handleForgotTurnstileExpired() {
      this.forgotTurnstileToken = null
    },
    
    checkPasswordMatch() {
      if (this.registerData.password === this.registerData.confirmPassword) {
        this.passwordMatchStatus = { type: 'success', message: '密碼匹配' }
      } else {
        this.passwordMatchStatus = { type: 'error', message: '密碼不匹配' }
      }
    },
    
    // Step 1: Email and Password verification
    async handleEmailPasswordLogin() {
      if (!this.canLogin || this.loading) return
      
      this.loading = true
      this.clearError()
      
      try {
        // Call email/password verification API (will send 2FA code)
        const response = await this.$apiClient.call('/auth/login-verify-password', {
          userEmail: this.loginData.userEmail.trim(),
          password: this.loginData.password,
          turnstileToken: this.loginTurnstileToken
        })
        
        if (response.success) {
          this.emailPasswordVerified = true
          // Reset verification code
          this.loginData.verificationCode = ''
          // 開始驗證碼倒數計時器
          this.startVerificationTimer()
          // 開始重新發送冷卻時間（因為第一封驗證郵件已發送）
          this.startResendCooldown()
        } else {
          this.errorMessage = response.error?.message || '帳號或密碼錯誤'
        }
      } catch (error) {
        this.errorMessage = '網路錯誤，請重試'
      } finally {
        this.loading = false
      }
    },
    
    // Step 2: Two-Factor Authentication verification
    async handleTwoFactorLogin() {
      if (!this.canSubmitVerificationCode || this.loginLoading) return
      
      this.loginLoading = true
      this.clearError()
      
      try {
        const response = await this.$apiClient.call('/auth/login-verify-2fa', {
          userEmail: this.loginData.userEmail.trim(),
          verificationCode: this.loginData.verificationCode.trim()
        })
        
        if (response.success) {
          // 儲存session到localStorage
          if (response.data.sessionId) {
            localStorage.setItem('sessionId', response.data.sessionId)
          }
          
          // 顯示成功訊息
          this.$message({
            type: 'success',
            message: '登入成功！',
            duration: 2000
          })
          
          // 關閉modal
          this.handleClose()
          
          // 觸發全局事件，讓所有組件知道登入狀態已改變
          window.dispatchEvent(new CustomEvent('auth-state-changed', {
            detail: { 
              type: 'login-success', 
              user: response.data.user || response.data, // 確保取得正確的user對象
              sessionId: response.data.sessionId
            }
          }))
        } else {
          this.errorMessage = response.error?.message || '驗證碼錯誤'
        }
      } catch (error) {
        this.errorMessage = '網路錯誤，請重試'
      } finally {
        this.loginLoading = false
      }
    },
    
    // Format verification code input (letters only, convert to uppercase)
    formatVerificationCode() {
      // Remove non-alphabetic characters and convert to uppercase
      this.loginData.verificationCode = this.loginData.verificationCode
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
    },
    
    // Resend verification code
    async resendVerificationCode() {
      if (this.resendLoading || this.resendCooldown > 0) return
      
      this.resendLoading = true
      this.clearError()
      
      try {
        const response = await this.$apiClient.call('/auth/resend-2fa', {
          userEmail: this.loginData.userEmail.trim()
        })
        
        if (response.success) {
          // Start cooldown timer
          this.startResendCooldown()
          // 重新開始驗證碼倒數計時器
          this.startVerificationTimer()
        } else {
          this.errorMessage = response.error?.message || '重發失敗'
        }
      } catch (error) {
        this.errorMessage = '網路錯誤，請重試'
      } finally {
        this.resendLoading = false
      }
    },
    
    // Start resend cooldown timer
    startResendCooldown() {
      // 清除現有計時器
      if (this.resendTimer) {
        clearInterval(this.resendTimer)
      }
      
      this.resendCooldown = 30 // 30 seconds cooldown
      this.resendTimer = setInterval(() => {
        this.resendCooldown--
        if (this.resendCooldown <= 0) {
          clearInterval(this.resendTimer)
          this.resendTimer = null
        }
      }, 1000)
    },

    // 停止重發冷卻計時器
    stopResendTimer() {
      if (this.resendTimer) {
        clearInterval(this.resendTimer)
        this.resendTimer = null
      }
    },
    
    // Go back to step 1
    backToEmailPassword() {
      this.emailPasswordVerified = false
      this.loginData.verificationCode = ''
      this.clearError()
      this.stopVerificationTimer()
      this.stopResendTimer()
    },

    // 開始驗證碼倒數計時器
    startVerificationTimer() {
      // 設定過期時間為10分鐘後
      this.verificationCodeExpiry = Date.now() + (10 * 60 * 1000)
      this.verificationRemainingTime = 600

      // 清除現有計時器
      if (this.verificationTimer) {
        clearInterval(this.verificationTimer)
      }

      // 開始新的計時器
      this.verificationTimer = setInterval(() => {
        const now = Date.now()
        const remainingMs = this.verificationCodeExpiry - now
        
        if (remainingMs <= 0) {
          // 驗證碼已過期
          this.verificationRemainingTime = 0
          this.stopVerificationTimer()
          this.errorMessage = '驗證碼已過期，請重新發送'
        } else {
          this.verificationRemainingTime = Math.ceil(remainingMs / 1000)
        }
      }, 1000)
    },

    // 停止驗證碼計時器
    stopVerificationTimer() {
      if (this.verificationTimer) {
        clearInterval(this.verificationTimer)
        this.verificationTimer = null
      }
    },

    // 格式化剩餘時間顯示
    formatVerificationTime() {
      if (this.verificationRemainingTime <= 0) {
        return '已過期'
      }

      const minutes = Math.floor(this.verificationRemainingTime / 60)
      const seconds = this.verificationRemainingTime % 60
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    },

    // 獲取進度條顏色
    getVerificationProgressColor() {
      const percentage = this.verificationProgressPercentage
      if (percentage > 50) {
        return '#67c23a' // 綠色
      } else if (percentage > 20) {
        return '#e6a23c' // 橙色
      } else {
        return '#f56c6c' // 紅色
      }
    },
    
    async handleRegister() {
      if (!this.canRegister || this.loading) return
      
      this.loading = true
      this.clearError()
      
      try {
        // 先驗證使用者名稱格式
        const username = this.registerData.username.trim()
        if (username.length < 3 || username.length > 20) {
          this.errorMessage = '使用者名稱需要3-20字元'
          return
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
          this.errorMessage = '使用者名稱僅限英文數字底線連字號'
          return
        }
        
        // 驗證Email格式
        const email = this.registerData.userEmail.trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          this.errorMessage = '請輸入有效的電子郵件地址'
          return
        }
        
        // 註冊API不需要session驗證，使用call而不是callWithAuth
        const response = await this.$apiClient.call('/auth/register', {
          invitationCode: this.registerData.invitationCode,
          userData: {
            username: username,
            password: this.registerData.password,
            userEmail: email,
            displayName: this.registerData.displayName.trim(),
            avatarSeed: this.registerData.avatarSeed || this.generateDefaultSeed(),
            avatarStyle: this.registerData.avatarStyle,
            avatarOptions: this.registerData.avatarOptions
          }
        })
        
        if (response.success) {
          // Show success message
          this.$message({
            type: 'success',
            message: '註冊成功！歡迎加入系統，請使用新帳號登入',
            duration: 4000
          })
          
          this.$emit('register-success', response.data)
          
          // Auto-fill login form and switch to login tab
          setTimeout(() => {
            this.loginData.username = this.registerData.username
            this.switchTab('login')
          }, 1500)
          
        } else {
          this.errorMessage = response.error?.message || '註冊失敗'
        }
      } catch (error) {
        this.errorMessage = '網路錯誤，請重試'
      } finally {
        this.loading = false
      }
    },
    
    async verifyEmail() {
      if (!this.canVerifyEmail) return

      this.verifyingEmail = true
      this.clearError()

      try {
        const response = await this.$apiClient.call('/auth/verify-email-for-reset', {
          userEmail: this.forgotData.userEmail.trim()
        })

        if (response.success && response.data) {
          this.emailVerified = true
          this.availableTags = response.data.tags || []
        } else {
          this.errorMessage = response.error?.message || 'Email 驗證失敗'
        }
      } catch (error) {
        this.errorMessage = '網路錯誤，請重試'
      } finally {
        this.verifyingEmail = false
      }
    },

    async handleForgotPassword() {
      if (!this.canSendReset) return

      this.sendingReset = true
      this.clearError()

      try {
        const response = await this.$apiClient.call('/auth/reset-password', {
          userEmail: this.forgotData.userEmail.trim(),
          selectedTagIds: this.forgotData.selectedTagIds,
          turnstileToken: this.forgotTurnstileToken
        })

        // Always show success (security feature - don't reveal if reset actually happened)
        this.resetSent = true

        // Reset form to initial state after 3 seconds
        setTimeout(() => {
          this.resetForgotPasswordForm()
        }, 3000)

      } catch (error) {
        // Still show success message even on error
        this.resetSent = true

        // Reset form to initial state after 3 seconds
        setTimeout(() => {
          this.resetForgotPasswordForm()
        }, 3000)
      } finally {
        this.sendingReset = false
      }
    },

    resetForgotPasswordForm() {
      this.forgotData.userEmail = ''
      this.forgotData.selectedTagIds = []
      this.verifyingEmail = false
      this.emailVerified = false
      this.availableTags = []
      this.sendingReset = false
      this.resetSent = false
    },


    // Avatar methods
    initializeAvatarSeed() {
      this.registerData.avatarSeed = this.generateAvatarSeed(this.registerData.userEmail)
    },
    
    generateDefaultSeed() {
      return this.registerData.userEmail ? 
        this.generateAvatarSeed(this.registerData.userEmail) : 
        'default_' + Date.now()
    },
    
    generateAvatarSeed(userEmail) {
      const timestamp = Date.now().toString()
      const emailHash = userEmail.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0)
        return a & a
      }, 0)
      return `${Math.abs(emailHash)}_${timestamp.slice(-6)}`
    },
    
    regenerateAvatarPreview() {
      this.registerData.avatarSeed = this.generateAvatarSeed(
        this.registerData.userEmail || 'preview'
      )
      this.avatarPreviewError = false
    },
    
    updateAvatarPreview() {
      this.avatarPreviewError = false
    },
    
    updateBackgroundColor(color) {
      this.registerData.avatarOptions.backgroundColor = color
      this.avatarPreviewError = false
    },
    
    updateClothesColor(color) {
      this.registerData.avatarOptions.clothesColor = color
      this.avatarPreviewError = false
    },
    
    generateDicebearUrl(seed, style, options = {}) {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '80',
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    },
    
    generateInitialsAvatarUrl() {
      const initials = this.getPreviewInitials()
      return `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=80&backgroundColor=b6e3f4`
    },
    
    getPreviewInitials() {
      const name = this.registerData.displayName || this.registerData.username || 'U'
      return name
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()
    },
    
    handleAvatarPreviewError() {
      this.avatarPreviewError = true
    }
  },
  beforeUnmount() {
    // 組件銷毀前清理所有計時器
    this.stopVerificationTimer()
    this.stopResendTimer()
  }
}
</script>

<style scoped>
.global-auth-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.3s ease-out;
  padding-top: 0;
}

.modal-content {
  background: white;
  width: 100%;
  height: 100%;
  border-radius: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideDown 0.4s ease-out;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from { 
    transform: translateY(-100%);
    opacity: 0;
  }
  to { 
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  background: #800000; /* Maroon color */
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.notification-banner {
  background: #fff3cd;
  color: #856404;
  padding: 15px 25px;
  border-bottom: 1px solid #ffeaa7;
  font-size: 14px;
  line-height: 1.5;
}

.tab-navigation {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.tab-btn {
  flex: 1;
  padding: 15px 10px;
  background: none;
  border: none;
  color: #6c757d;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 3px solid transparent;
}

.tab-btn:hover {
  background: #e9ecef;
  color: #495057;
}

.tab-btn.active {
  background: white;
  color: #800000;
  border-bottom-color: #800000;
}

.tab-content {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.auth-form {
  padding: 25px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 0;
}

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

.form-input {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
  background: white;
}

.form-input:focus {
  outline: none;
  border-color: #800000;
  box-shadow: 0 0 0 3px rgba(128, 0, 0, 0.1);
}

.form-input:disabled {
  background: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

.field-hint {
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 5px;
}

.verification-expiry-section {
  margin-top: 10px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e1e8ed;
}

.expiry-text {
  font-size: 13px;
  color: #2c3e50;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
}

.verification-progress {
  margin-top: 5px;
}

.verification-progress :deep(.el-progress-bar__outer) {
  border-radius: 4px;
  background-color: #e1e8ed;
}

.verification-progress :deep(.el-progress-bar__inner) {
  border-radius: 4px;
  transition: all 0.3s ease;
}

.field-status {
  margin-top: 5px;
  font-size: 12px;
}

.field-status .success {
  color: #28a745;
}

.field-status .error {
  color: #dc3545;
}

.password-strength {
  margin-top: 8px;
}

.strength-bar {
  height: 4px;
  background: #e1e8ed;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 5px;
}

.strength-fill {
  height: 100%;
  transition: all 0.3s;
}

.strength-bar.weak .strength-fill {
  width: 33%;
  background: #dc3545;
}

.strength-bar.medium .strength-fill {
  width: 66%;
  background: #ffc107;
}

.strength-bar.strong .strength-fill {
  width: 100%;
  background: #28a745;
}

.strength-text {
  font-size: 12px;
  color: #7f8c8d;
}

.form-actions {
  margin-top: 25px;
}

.btn {
  padding: 12px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.btn-primary {
  background: #800000;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #660000;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(128, 0, 0, 0.3);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 12px 20px;
  margin: 0 25px 25px;
  border-radius: 6px;
  border: 1px solid #f5c6cb;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.reset-info {
  margin-top: 20px;
}

.success-message {
  background: #d4edda;
  color: #155724;
  padding: 15px;
  border-radius: 6px;
  border: 1px solid #c3e6cb;
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.success-message svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: #28a745;
}

/* Avatar Customization Styles */
.avatar-section {
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 15px;
  background: #f8f9fa;
}

.avatar-customization {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.avatar-preview-small {
  flex-shrink: 0;
}

.avatar-controls-register {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.avatar-btn:hover:not(:disabled) {
  background: #f5f7fa;
  border-color: #800000;
}

.avatar-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.avatar-style-selector {
  display: flex;
  flex-direction: column;
}

.style-select {
  padding: 8px 12px;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.quick-colors {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-label {
  font-size: 12px;
  color: #666;
  min-width: 40px;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid #e1e8ed;
  cursor: pointer;
  transition: all 0.3s;
}

.color-dot:hover {
  transform: scale(1.1);
  border-color: #800000;
}

.color-dot.selected {
  border-color: #800000;
  box-shadow: 0 0 0 2px rgba(128, 0, 0, 0.3);
}

/* Resend button styles */
.btn.resend-btn {
  background: #001f3f; /* Navy blue */
  margin: 0 10px;
  flex: none;
  width: auto;
  padding: 12px 24px;
}

.btn.resend-btn:hover:not(:disabled) {
  background: #00152a; /* Darker navy on hover */
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 31, 63, 0.3);
}

/* Resend countdown styles */
.resend-countdown {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.resend-countdown .fas {
  color: #ffffff;
  font-size: 14px;
}

.resend-countdown .countdown-text {
  font-size: 14px;
  color: #ffffff;
}

.btn.resend-btn:disabled {
  background: #667788; /* Gray-ish navy when disabled */
  opacity: 0.8;
}

/* Adjust form-actions for multiple buttons */
.two-factor-step .form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.two-factor-step .form-actions .btn-primary:first-child {
  flex: 1;
}

.two-factor-step .form-actions .btn-secondary {
  flex: none;
  width: auto;
  padding: 12px 24px;
}

/* Two-step registration styles */
.steps-container {
  margin-bottom: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.steps-container .el-steps {
  --el-color-primary: #800000;
}

.steps-container .el-steps .el-step__title {
  font-weight: 600;
  font-size: 16px;
}

.steps-container .el-steps .el-step__description {
  font-size: 13px;
  color: #6c757d;
}

.steps-container .el-steps .el-step.is-success .el-step__title {
  color: #800000;
}

.steps-container .el-steps .el-step.is-process .el-step__title {
  color: #800000;
  font-weight: 700;
}

.step-content-header {
  margin-bottom: 20px;
  text-align: center;
  padding: 15px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 8px;
  border-left: 4px solid #800000;
}

.step-content-header h3 {
  margin: 0 0 5px 0;
  color: #800000;
  font-size: 18px;
  font-weight: 600;
}

.step-description {
  margin: 0;
  color: #6c757d;
  font-size: 14px;
}

.verified-field {
  background: #e8f5e8 !important;
  border-color: #28a745 !important;
}

.verified-hint {
  color: #28a745 !important;
  font-weight: 500;
}

.verified-hint::before {
  content: '✓ ';
  font-weight: bold;
}

.invitation-verification-step,
.user-registration-step {
  animation: fadeInSlide 0.3s ease-in-out;
}

@keyframes fadeInSlide {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
}

.btn.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
}

/* Remove the mobile media query since we're now 100% fullscreen always */
</style>