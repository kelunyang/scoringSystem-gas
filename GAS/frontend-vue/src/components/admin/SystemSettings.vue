<template>
  <div class="system-settings">
    <!-- Header -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-cogs"></i> 系統設定</h2>
        <p class="header-desc">管理系統參數和配置</p>
      </div>
      <div class="header-right">
        <el-button type="default" @click="refreshSettings" icon="Refresh">
          重新載入
        </el-button>
      </div>
    </div>

    <!-- Settings Sections -->
    <div class="settings-container">
      
      <!-- System Statistics -->
      <div class="settings-section">
        <div class="section-header-with-actions">
          <h3><i class="fas fa-chart-bar"></i> 系統統計</h3>
          <el-button type="primary" size="small" @click="loadAllStats" :loading="statsLoading" icon="Refresh">
            刷新統計
          </el-button>
        </div>
        
        <div v-loading="statsLoading" element-loading-text="載入統計資料中..." class="stats-container">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :md="6">
              <el-card class="stat-card" shadow="hover">
                <el-statistic title="總用戶數" :value="systemStats?.totalUsers || 0">
                  <template #suffix>
                    <div class="stat-suffix">
                      活躍 {{ systemStats?.activeUsers || 0 }} | 停用 {{ (systemStats?.totalUsers || 0) - (systemStats?.activeUsers || 0) }}
                    </div>
                  </template>
                </el-statistic>
              </el-card>
            </el-col>

            <el-col :xs="24" :sm="12" :md="6">
              <el-card class="stat-card" shadow="hover">
                <el-statistic title="總專案數" :value="systemStats?.totalProjects || 0">
                  <template #suffix>
                    <div class="stat-suffix">
                      進行中 {{ systemStats?.activeProjects || 0 }} | 已完成 {{ (systemStats?.totalProjects || 0) - (systemStats?.activeProjects || 0) }}
                    </div>
                  </template>
                </el-statistic>
              </el-card>
            </el-col>

            <el-col :xs="24" :sm="12" :md="6">
              <el-card class="stat-card" shadow="hover">
                <el-statistic title="總群組數" :value="systemStats?.totalGroups || 0">
                  <template #suffix>
                    <div class="stat-suffix">
                      活躍 {{ systemStats?.activeGroups || 0 }}
                    </div>
                  </template>
                </el-statistic>
              </el-card>
            </el-col>

            <el-col :xs="24" :sm="12" :md="6">
              <el-card class="stat-card" shadow="hover">
                <el-statistic title="邀請碼總數" :value="invitationStats?.total || 0">
                  <template #suffix>
                    <div class="stat-suffix">
                      有效 {{ invitationStats?.active || 0 }} | 已用 {{ invitationStats?.used || 0 }} | 過期 {{ invitationStats?.expired || 0 }}
                    </div>
                  </template>
                </el-statistic>
              </el-card>
            </el-col>
          </el-row>

        </div>
      </div>

      <!-- PropertiesService Configuration -->
      <div class="settings-section">
        <div class="section-header-with-actions">
          <h3><i class="fas fa-sliders-h"></i> 系統參數配置</h3>
          <div class="header-actions">
            <el-button
              type="warning"
              size="small"
              @click="confirmResetProperties"
              :loading="resettingProperties"
              icon="RefreshLeft"
            >
              重設為預設值
            </el-button>
            <el-button
              type="primary"
              size="small"
              @click="savePropertiesConfig"
              :loading="savingProperties"
              icon="Check"
            >
              儲存配置
            </el-button>
          </div>
        </div>

        <div v-loading="loadingProperties" element-loading-text="載入配置中..." class="properties-container">
          <!-- Database Configuration -->
          <el-collapse v-model="activeConfigPanels" accordion>
            <el-collapse-item title="資料庫配置" name="database">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-database"></i>
                  <span>資料庫配置</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item readonly-item">
                  <label class="config-label">
                    DATABASE_FOLDER_ID
                    <el-tag size="small" type="info">唯讀</el-tag>
                  </label>
                  <p class="config-desc">資料庫文件夾 ID (唯一需要手動設定的參數)</p>
                  <el-input
                    v-model="propertiesConfig.DATABASE_FOLDER_ID"
                    readonly
                    class="readonly-input"
                  />
                </div>

                <div class="config-item readonly-item">
                  <label class="config-label">
                    GLOBAL_WORKBOOK_ID
                    <el-tag size="small" type="success">自動生成</el-tag>
                  </label>
                  <p class="config-desc">全域活頁簿 ID (由 initSystem() 自動建立)</p>
                  <div class="spreadsheet-validation">
                    <el-input
                      v-model="propertiesConfig.GLOBAL_WORKBOOK_ID"
                      readonly
                      class="readonly-input"
                    >
                      <template #prepend>
                        <i
                          v-if="validationStatus.GLOBAL_WORKBOOK_ID === 'success'"
                          class="fas fa-check"
                          style="color: #67C23A;"
                        ></i>
                        <i
                          v-else-if="validationStatus.GLOBAL_WORKBOOK_ID === 'error'"
                          class="fas fa-times"
                          style="color: #F56C6C;"
                        ></i>
                        <i
                          v-else
                          class="fas fa-database"
                          style="color: #909399;"
                        ></i>
                      </template>
                      <template #append>
                        <el-button
                          @click="validateSpreadsheet('GLOBAL_WORKBOOK_ID')"
                          :loading="validating.GLOBAL_WORKBOOK_ID"
                          icon="Check"
                        >
                          驗證
                        </el-button>
                      </template>
                    </el-input>
                  </div>
                </div>

                <div class="config-item readonly-item">
                  <label class="config-label">
                    LOG_SPREADSHEET_ID
                    <el-tag size="small" type="success">自動生成</el-tag>
                  </label>
                  <p class="config-desc">日誌表格 ID (由 initSystem() 自動建立)</p>
                  <div class="spreadsheet-validation">
                    <el-input
                      v-model="propertiesConfig.LOG_SPREADSHEET_ID"
                      readonly
                      class="readonly-input"
                    >
                      <template #prepend>
                        <i
                          v-if="validationStatus.LOG_SPREADSHEET_ID === 'success'"
                          class="fas fa-check"
                          style="color: #67C23A;"
                        ></i>
                        <i
                          v-else-if="validationStatus.LOG_SPREADSHEET_ID === 'error'"
                          class="fas fa-times"
                          style="color: #F56C6C;"
                        ></i>
                        <i
                          v-else
                          class="fas fa-database"
                          style="color: #909399;"
                        ></i>
                      </template>
                      <template #append>
                        <el-button
                          @click="validateSpreadsheet('LOG_SPREADSHEET_ID')"
                          :loading="validating.LOG_SPREADSHEET_ID"
                          icon="Check"
                        >
                          驗證
                        </el-button>
                      </template>
                    </el-input>
                  </div>
                </div>

                <div class="config-item readonly-item">
                  <label class="config-label">
                    NOTIFICATION_SPREADSHEET_ID
                    <el-tag size="small" type="success">自動生成</el-tag>
                  </label>
                  <p class="config-desc">通知表格 ID (由 initSystem() 自動建立)</p>
                  <div class="spreadsheet-validation">
                    <el-input
                      v-model="propertiesConfig.NOTIFICATION_SPREADSHEET_ID"
                      readonly
                      class="readonly-input"
                    >
                      <template #prepend>
                        <i
                          v-if="validationStatus.NOTIFICATION_SPREADSHEET_ID === 'success'"
                          class="fas fa-check"
                          style="color: #67C23A;"
                        ></i>
                        <i
                          v-else-if="validationStatus.NOTIFICATION_SPREADSHEET_ID === 'error'"
                          class="fas fa-times"
                          style="color: #F56C6C;"
                        ></i>
                        <i
                          v-else
                          class="fas fa-database"
                          style="color: #909399;"
                        ></i>
                      </template>
                      <template #append>
                        <el-button
                          @click="validateSpreadsheet('NOTIFICATION_SPREADSHEET_ID')"
                          :loading="validating.NOTIFICATION_SPREADSHEET_ID"
                          icon="Check"
                        >
                          驗證
                        </el-button>
                      </template>
                    </el-input>
                  </div>
                </div>
              </div>
            </el-collapse-item>

            <!-- Authentication Configuration -->
            <el-collapse-item title="認證系統配置" name="auth">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-lock"></i>
                  <span>認證系統配置</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item">
                  <label class="config-label">SESSION_TIMEOUT</label>
                  <p class="config-desc">Session 有效時間 (小時)</p>
                  <div class="slider-container">
                    <el-slider
                      v-model="sessionTimeoutHours"
                      :min="1"
                      :max="168"
                      :step="1"
                      :marks="{ 24: '1天', 72: '3天', 168: '7天' }"
                      :show-tooltip="true"
                      :format-tooltip="val => `${val} 小時`"
                    />
                    <span class="slider-value">{{ sessionTimeoutHours }} 小時 ({{ (sessionTimeoutHours * 3600000) }} ms)</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">PASSWORD_SALT_ROUNDS</label>
                  <p class="config-desc">密碼雜湊迭代次數 (預設10，安全性和性能的平衡)</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.PASSWORD_SALT_ROUNDS"
                      :min="8"
                      :max="15"
                      :step="1"
                      :marks="{ 8: '快', 10: '平衡', 12: '安全', 15: '非常安全' }"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.PASSWORD_SALT_ROUNDS }} 次</span>
                  </div>
                </div>
              </div>
            </el-collapse-item>

            <!-- Invitation System Configuration -->
            <el-collapse-item title="邀請系統配置" name="invitation">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-envelope"></i>
                  <span>邀請系統配置</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item">
                  <label class="config-label">MAX_INVITES_PER_DAY</label>
                  <p class="config-desc">每日最大邀請碼數量</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_INVITES_PER_DAY"
                      :min="1"
                      :max="200"
                      :step="1"
                      :marks="{ 50: '預設', 100: '中等', 200: '大量' }"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_INVITES_PER_DAY }} 個</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">INVITE_CODE_TIMEOUT</label>
                  <p class="config-desc">邀請碼有效期限 (天)</p>
                  <div class="slider-container">
                    <el-slider
                      v-model="inviteCodeTimeoutDays"
                      :min="1"
                      :max="30"
                      :step="1"
                      :marks="{ 7: '1週', 14: '2週', 30: '1月' }"
                      :show-tooltip="true"
                      :format-tooltip="val => `${val} 天`"
                    />
                    <span class="slider-value">{{ inviteCodeTimeoutDays }} 天 ({{ (inviteCodeTimeoutDays * 86400000) }} ms)</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">WEB_APP_URL</label>
                  <p class="config-desc">Web App URL (用於邀請碼郵件連結)</p>
                  <el-input
                    v-model="propertiesConfig.WEB_APP_URL"
                    placeholder="https://script.google.com/..."
                  />
                </div>
              </div>
            </el-collapse-item>

            <!-- Security Verification Configuration -->
            <el-collapse-item title="安全驗證配置" name="security">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-shield-alt"></i>
                  <span>安全驗證配置</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item">
                  <label class="config-label">TURNSTILE_ENABLED</label>
                  <p class="config-desc">是否啟用 Cloudflare Turnstile 驗證</p>
                  <el-switch
                    v-model="turnstileEnabled"
                    active-text="開啟"
                    inactive-text="關閉"
                  />
                </div>

                <div class="config-item">
                  <label class="config-label">TURNSTILE_SITE_KEY</label>
                  <p class="config-desc">Cloudflare Turnstile Site Key (公開密鑰，前端使用)</p>
                  <el-input
                    v-model="propertiesConfig.TURNSTILE_SITE_KEY"
                    placeholder="0x4AAAAAAA..."
                    :disabled="!turnstileEnabled"
                  >
                    <template #prepend>
                      <i class="fas fa-key"></i>
                    </template>
                  </el-input>
                </div>

                <div class="config-item">
                  <label class="config-label">TURNSTILE_SECRET_KEY</label>
                  <p class="config-desc">Cloudflare Turnstile Secret Key (私密密鑰，後端驗證)</p>
                  <el-input
                    v-model="propertiesConfig.TURNSTILE_SECRET_KEY"
                    type="password"
                    placeholder="0x4AAAAAAA..."
                    :disabled="!turnstileEnabled"
                    show-password
                  >
                    <template #prepend>
                      <i class="fas fa-lock"></i>
                    </template>
                  </el-input>
                </div>

                <el-alert
                  v-if="turnstileEnabled && (!propertiesConfig.TURNSTILE_SITE_KEY || !propertiesConfig.TURNSTILE_SECRET_KEY)"
                  title="請配置 Turnstile 密鑰"
                  type="warning"
                  description="已啟用 Turnstile 但尚未配置密鑰。請前往 Cloudflare Dashboard 獲取密鑰。"
                  :closable="false"
                  style="margin-top: 10px;"
                />

                <el-alert
                  v-if="turnstileEnabled"
                  title="關於 Cloudflare Turnstile"
                  type="info"
                  :closable="false"
                  style="margin-top: 10px;"
                >
                  <template #default>
                    <p style="margin: 0; font-size: 13px;">
                      Turnstile 是 Cloudflare 提供的免費人機驗證服務，可以替代傳統的 reCAPTCHA。<br>
                      前往 <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" style="color: #409EFF;">Cloudflare Dashboard</a> 創建 Turnstile 網站並獲取密鑰。
                    </p>
                  </template>
                </el-alert>
              </div>
            </el-collapse-item>

            <!-- Logging Configuration -->
            <el-collapse-item title="日誌系統配置" name="logging">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-file-alt"></i>
                  <span>日誌系統配置</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item">
                  <label class="config-label">LOG_CONSOLE</label>
                  <p class="config-desc">是否輸出日誌到 Console</p>
                  <el-switch
                    v-model="logConsoleEnabled"
                    active-text="開啟"
                    inactive-text="關閉"
                  />
                </div>

                <div class="config-item">
                  <label class="config-label">LOG_LEVEL</label>
                  <p class="config-desc">最低日誌記錄等級</p>
                  <el-select v-model="propertiesConfig.LOG_LEVEL" placeholder="選擇日誌等級">
                    <el-option label="DEBUG" value="DEBUG" />
                    <el-option label="INFO" value="INFO" />
                    <el-option label="WARN" value="WARN" />
                    <el-option label="ERROR" value="ERROR" />
                    <el-option label="FATAL" value="FATAL" />
                  </el-select>
                </div>
              </div>
            </el-collapse-item>

            <!-- Business Logic Limits -->
            <el-collapse-item title="業務邏輯限制" name="limits">
              <template #title>
                <div class="collapse-title">
                  <i class="fas fa-sliders-h"></i>
                  <span>業務邏輯限制</span>
                </div>
              </template>
              <div class="config-group">
                <div class="config-item">
                  <label class="config-label">MAX_PROJECT_NAME_LENGTH</label>
                  <p class="config-desc">專案名稱最大長度</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_PROJECT_NAME_LENGTH"
                      :min="50"
                      :max="200"
                      :step="1"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_PROJECT_NAME_LENGTH }} 字元</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">MAX_CONCURRENT_PROJECTS</label>
                  <p class="config-desc">同時進行的專案數量限制</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_CONCURRENT_PROJECTS"
                      :min="1"
                      :max="20"
                      :step="1"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_CONCURRENT_PROJECTS }} 個</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">MAX_GROUP_NAME_LENGTH</label>
                  <p class="config-desc">群組名稱最大長度</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_GROUP_NAME_LENGTH"
                      :min="20"
                      :max="100"
                      :step="1"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_GROUP_NAME_LENGTH }} 字元</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">MAX_GROUPS_PER_PROJECT</label>
                  <p class="config-desc">每個專案最大群組數</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_GROUPS_PER_PROJECT"
                      :min="5"
                      :max="50"
                      :step="1"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_GROUPS_PER_PROJECT }} 個</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">MAX_MEMBERS_PER_GROUP</label>
                  <p class="config-desc">每個群組最大成員數</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_MEMBERS_PER_GROUP"
                      :min="5"
                      :max="30"
                      :step="1"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_MEMBERS_PER_GROUP }} 人</span>
                  </div>
                </div>

                <div class="config-item">
                  <label class="config-label">MAX_STAGE_DURATION_DAYS</label>
                  <p class="config-desc">每個階段最大天數</p>
                  <div class="slider-container">
                    <el-slider
                      v-model.number="propertiesConfig.MAX_STAGE_DURATION_DAYS"
                      :min="7"
                      :max="90"
                      :step="1"
                      :marks="{ 30: '1月', 60: '2月', 90: '3月' }"
                      :show-tooltip="true"
                    />
                    <span class="slider-value">{{ propertiesConfig.MAX_STAGE_DURATION_DAYS }} 天</span>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>

      <!-- System Logs -->
      <div class="settings-section">
        <div class="section-header-with-actions">
          <h3><i class="fas fa-file-alt"></i> 系統日誌</h3>
          <el-button 
            type="default" 
            size="small"
            @click="refreshLogs"
            :loading="logsLoading"
            icon="Refresh"
          >
            刷新
          </el-button>
        </div>
        
        <!-- 日誌統計 -->
        <div v-if="logStats" class="log-stats-section">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="8">
              <el-card class="stat-card" shadow="hover">
                <el-statistic 
                  title="總日誌數" 
                  :value="logStats.totalLogs"
                  :formatter="formatNumber"
                />
              </el-card>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-card class="stat-card" shadow="hover">
                <el-statistic 
                  title="最新日誌" 
                  :value="formatLogTime(logStats.newestLog)"
                />
              </el-card>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-card class="stat-card" shadow="hover">
                <el-statistic 
                  title="日誌檔案" 
                  :value="logStats.spreadsheetName"
                />
              </el-card>
            </el-col>
          </el-row>
          
          <!-- 日誌等級統計 -->
          <el-row :gutter="20" style="margin-top: 16px;">
            <el-col :span="24">
              <el-card class="stat-card" shadow="hover">
                <el-statistic title="日誌等級分布">
                  <template #suffix>
                    <div class="level-stats">
                      <span 
                        v-for="(count, level) in logStats.levelCounts" 
                        :key="level"
                        class="level-badge"
                        :class="level.toLowerCase()"
                      >
                        {{ level }}: {{ count }}
                      </span>
                    </div>
                  </template>
                </el-statistic>
              </el-card>
            </el-col>
          </el-row>
        </div>
        
        <!-- 日誌過濾器 -->
        <div class="log-filters">
          <div class="filter-row">
            <div class="form-group">
              <label>顯示數量:</label>
              <el-slider
                v-model="logFilters.limit"
                :min="10"
                :max="100"
                :step="1"
                :show-tooltip="true"
                :format-tooltip="val => `${val} 筆`"
                style="width: 200px;"
              />
            </div>
            
            <div class="form-group">
              <label>等級篩選:</label>
              <el-select
                v-model="logFilters.level"
                placeholder="全部等級"
                clearable
                style="width: 120px;"
              >
                <el-option label="DEBUG" value="DEBUG" />
                <el-option label="INFO" value="INFO" />
                <el-option label="WARN" value="WARN" />
                <el-option label="ERROR" value="ERROR" />
                <el-option label="FATAL" value="FATAL" />
              </el-select>
            </div>

            <div class="form-group">
              <label>類型篩選:</label>
              <el-select
                v-model="logFilters.category"
                placeholder="全部記錄"
                clearable
                style="width: 150px;"
              >
                <el-option label="機器人運作紀錄" value="robot" />
                <el-option label="使用者登入紀錄" value="auth" />
                <el-option label="API 請求紀錄" value="api" />
                <el-option label="其他紀錄" value="other" />
              </el-select>
            </div>
            
            <div class="form-group">
              <label>搜尋:</label>
              <el-input
                v-model="logFilters.search"
                placeholder="搜尋函數名稱、操作或詳情"
                clearable
                style="width: 250px;"
                @keyup.enter="refreshLogs"
              >
                <template #suffix>
                  <el-button 
                    @click="refreshLogs"
                    :icon="logsLoading ? 'Loading' : 'Search'"
                    :loading="logsLoading"
                    link
                  />
                </template>
              </el-input>
            </div>
            
            <div class="form-group">
              <el-button 
                @click="clearFilters"
                :disabled="!hasActiveFilters"
                type="info"
                size="small"
              >
                <i class="fas fa-times"></i>
                清除過濾
              </el-button>
            </div>
          </div>
          
          <!-- 當前過濾條件顯示 -->
          <div v-if="hasActiveFilters" class="active-filters">
            <span class="filter-label">當前篩選條件:</span>
            <el-tag v-if="logFilters.level" closable @close="logFilters.level = ''" type="warning">
              等級: {{ logFilters.level }}
            </el-tag>
            <el-tag v-if="logFilters.category" closable @close="logFilters.category = ''" type="primary">
              類型: {{ getCategoryLabel(logFilters.category) }}
            </el-tag>
            <el-tag v-if="logFilters.search" closable @close="logFilters.search = ''" type="info">
              搜尋: {{ logFilters.search }}
            </el-tag>
            <el-tag v-if="logFilters.limit !== 20" closable @close="logFilters.limit = 20" type="success">
              顯示: {{ logFilters.limit }} 筆
            </el-tag>
          </div>
        </div>
        
        <!-- 日誌表格 -->
        <div class="logs-container">
          <div v-if="logsLoading" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i> 載入中...
          </div>
          
          <div v-else-if="logs.length === 0" class="empty-state">
            <i class="fas fa-file-alt"></i>
            <p>沒有找到匹配的日誌記錄</p>
          </div>
          
          <div v-else class="logs-table">
            <table>
              <thead>
                <tr>
                  <th>時間</th>
                  <th>等級</th>
                  <th>函數</th>
                  <th>操作</th>
                  <th>用戶ID</th>
                  <th>細節</th>
                  <th>執行時間</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="log in logs" 
                  :key="log.timestamp"
                  :class="`log-level-${log.level.toLowerCase()}`"
                >
                  <td class="timestamp">{{ formatLogTime(log.timestamp) }}</td>
                  <td>
                    <span class="level-badge" :class="log.level.toLowerCase()">
                      {{ log.level }}
                    </span>
                  </td>
                  <td class="function-name">{{ log.functionName }}</td>
                  <td class="action">{{ log.action }}</td>
                  <td class="user-id">{{ log.userId || '-' }}</td>
                  <td class="details" :title="log.details">{{ truncateText(log.details, 50) }}</td>
                  <td class="execution-time">{{ log.executionTime ? log.executionTime + 'ms' : '-' }}</td>
                </tr>
              </tbody>
            </table>
            
            <div v-if="logData.hasMore" class="load-more">
              <p>顯示 {{ logs.length }} / {{ logData.total }} 筆日誌</p>
              <el-button @click="loadMoreLogs" :loading="loadingMore">
                載入更多
              </el-button>
            </div>
          </div>
        </div>
        
        <!-- 日誌管理操作 -->
        <div class="log-actions">
          <el-button 
            type="warning"
            @click="confirmArchiveLogs"
            :loading="archiving"
          >
            歸檔旧日誌
          </el-button>
        </div>
      </div>

      <!-- Robot Control Zone -->
      <div class="settings-section">
        <div class="section-header-with-actions">
          <h3><i class="fas fa-robot"></i> 機器人控制區</h3>
          <el-button
            type="default"
            size="small"
            @click="refreshRobotStatus"
            :loading="loadingRobotStatus"
            icon="Refresh"
          >
            刷新狀態
          </el-button>
        </div>

        <div v-loading="loadingRobotStatus" element-loading-text="載入機器人狀態中..." class="robot-control-container">
          <div class="robot-grid">
            <!-- Daily Cleanup Robot -->
            <el-card class="robot-card" shadow="hover">
              <template #header>
                <div class="robot-header">
                  <div class="robot-title">
                    <i class="fas fa-broom"></i>
                    <span>每日清理機器人</span>
                  </div>
                  <el-tag :type="getRobotStatusType('LAST_CLEANUP')" size="small">
                    {{ getRobotStatusText('LAST_CLEANUP') }}
                  </el-tag>
                </div>
              </template>
              <div class="robot-body">
                <div class="robot-info">
                  <p class="robot-desc">清理過期的邀請碼和快取資料</p>
                  <div class="robot-status">
                    <div class="status-item">
                      <span class="status-label">上次執行:</span>
                      <span class="status-value">{{ formatRobotTime(robotStatus.LAST_CLEANUP) }}</span>
                    </div>
                    <div v-if="robotStatus.LAST_CLEANUP_ERROR" class="status-item error">
                      <span class="status-label">錯誤:</span>
                      <span class="status-value">{{ robotStatus.LAST_CLEANUP_ERROR }}</span>
                    </div>
                  </div>
                </div>
                <div class="robot-actions">
                  <el-button
                    type="primary"
                    @click="executeRobot('cleanup')"
                    :loading="executing.cleanup"
                    icon="Play"
                  >
                    執行清理
                  </el-button>
                </div>
              </div>
            </el-card>

            <!-- Notification Patrol Robot -->
            <el-card class="robot-card" shadow="hover">
              <template #header>
                <div class="robot-header">
                  <div class="robot-title">
                    <i class="fas fa-bell"></i>
                    <span>通知巡檢機器人</span>
                  </div>
                  <el-tag :type="getRobotStatusType('LAST_NOTIFICATION_PATROL')" size="small">
                    {{ getRobotStatusText('LAST_NOTIFICATION_PATROL') }}
                  </el-tag>
                </div>
              </template>
              <div class="robot-body">
                <div class="robot-info">
                  <p class="robot-desc">檢查並發送待發送的通知</p>
                  <div class="robot-status">
                    <div class="status-item">
                      <span class="status-label">上次執行:</span>
                      <span class="status-value">{{ formatRobotTime(robotStatus.LAST_NOTIFICATION_PATROL) }}</span>
                    </div>
                    <div v-if="robotStatus.LAST_NOTIFICATION_PATROL_ERROR" class="status-item error">
                      <span class="status-label">錯誤:</span>
                      <span class="status-value">{{ robotStatus.LAST_NOTIFICATION_PATROL_ERROR }}</span>
                    </div>
                  </div>
                </div>
                <div class="robot-actions">
                  <el-button
                    type="primary"
                    @click="executeRobot('notificationPatrol')"
                    :loading="executing.notificationPatrol"
                    icon="Play"
                  >
                    執行巡檢
                  </el-button>
                </div>
              </div>
            </el-card>

            <!-- Log Archive Robot -->
            <el-card class="robot-card" shadow="hover">
              <template #header>
                <div class="robot-header">
                  <div class="robot-title">
                    <i class="fas fa-archive"></i>
                    <span>日誌歸檔機器人</span>
                  </div>
                  <el-tag :type="getRobotStatusType('LAST_LOG_ARCHIVE')" size="small">
                    {{ getRobotStatusText('LAST_LOG_ARCHIVE') }}
                  </el-tag>
                </div>
              </template>
              <div class="robot-body">
                <div class="robot-info">
                  <p class="robot-desc">歸檔舊日誌，創建新日誌表</p>
                  <div class="robot-status">
                    <div class="status-item">
                      <span class="status-label">上次執行:</span>
                      <span class="status-value">{{ formatRobotTime(robotStatus.LAST_LOG_ARCHIVE) }}</span>
                    </div>
                    <div v-if="robotStatus.LAST_LOG_ARCHIVE_ERROR" class="status-item error">
                      <span class="status-label">錯誤:</span>
                      <span class="status-value">{{ robotStatus.LAST_LOG_ARCHIVE_ERROR }}</span>
                    </div>
                  </div>
                </div>
                <div class="robot-actions">
                  <el-button
                    type="primary"
                    @click="executeRobot('logArchive')"
                    :loading="executing.logArchive"
                    icon="Play"
                  >
                    執行歸檔
                  </el-button>
                </div>
              </div>
            </el-card>

            <!-- Security Check Robot -->
            <el-card class="robot-card" shadow="hover">
              <template #header>
                <div class="robot-header">
                  <div class="robot-title">
                    <i class="fas fa-shield-alt"></i>
                    <span>安全檢查機器人</span>
                  </div>
                  <el-tag type="info" size="small">手動執行</el-tag>
                </div>
              </template>
              <div class="robot-body">
                <div class="robot-info">
                  <p class="robot-desc">檢查可疑的登入嘗試</p>
                  <div class="robot-status">
                    <div class="status-item">
                      <span class="status-label">檢測模式:</span>
                      <span class="status-value">暴力破解 + 分散式攻擊</span>
                    </div>
                  </div>
                </div>
                <div class="robot-actions">
                  <el-button
                    type="danger"
                    @click="checkSuspiciousLogins"
                    :loading="checkingSuspiciousLogins"
                    icon="Search"
                  >
                    檢查可疑登入
                  </el-button>
                </div>
              </div>
            </el-card>
          </div>
        </div>
      </div>
    </div>

    <!-- Suspicious Logins Drawer -->
    <el-drawer
      v-model="suspiciousLoginsDrawer"
      title="可疑登入記錄"
      :size="600"
      direction="rtl"
    >
      <div v-if="checkingSuspiciousLogins" class="drawer-loading">
        <i class="fas fa-spinner fa-spin"></i> 分析中...
      </div>

      <div v-else-if="suspiciousLogins.length === 0" class="drawer-empty">
        <i class="fas fa-check-circle"></i>
        <p>未發現可疑的登入記錄</p>
        <p class="empty-desc">過去24小時內沒有觸發安全警報</p>
      </div>

      <div v-else class="suspicious-logins-list">
        <el-alert
          :title="`發現 ${suspiciousLogins.length} 個可疑登入嘗試`"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;"
        />

        <div v-for="(attempt, index) in suspiciousLogins" :key="index" class="suspicious-item">
          <el-card shadow="hover">
            <div class="suspicious-header">
              <span class="suspicious-username">{{ attempt.username }}</span>
              <el-tag type="danger" size="small">{{ attempt.reason }}</el-tag>
            </div>
            <div class="suspicious-details">
              <div class="detail-row">
                <span class="detail-label">IP 位址:</span>
                <span class="detail-value">{{ attempt.clientIP }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">最後嘗試時間:</span>
                <span class="detail-value">{{ formatLogTime(attempt.timestamp) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">失敗次數:</span>
                <span class="detail-value">{{ attempt.failedCount || '-' }} 次</span>
              </div>
              <div v-if="attempt.ipCount" class="detail-row">
                <span class="detail-label">不同 IP 數量:</span>
                <span class="detail-value">{{ attempt.ipCount }} 個</span>
              </div>
            </div>
          </el-card>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ref, reactive, computed, watch, onMounted, getCurrentInstance } from 'vue'

export default {
  name: 'SystemSettings',
  setup() {
    const instance = getCurrentInstance()
    const apiClient = instance.appContext.config.globalProperties.$apiClient
    const systemStats = ref({
      totalUsers: 0,
      activeUsers: 0,
      inactiveUsers: 0,
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalGroups: 0,
      activeGroups: 0,
      uptime: '載入中...',
      dbStatus: '正常',
      lastUpdate: null
    })

    const invitationStats = ref({
      total: 0,
      active: 0,
      used: 0,
      expired: 0
    })

    const systemLogs = ref([])
    const logLimit = ref(100)
    const saving = ref(false)
    const cleaning = ref(false)
    const statsLoading = ref(false)

    // PropertiesService 配置相關
    const propertiesConfig = reactive({
      DATABASE_FOLDER_ID: '',
      GLOBAL_WORKBOOK_ID: '',
      LOG_SPREADSHEET_ID: '',
      NOTIFICATION_SPREADSHEET_ID: '',
      SESSION_TIMEOUT: '86400000',
      PASSWORD_SALT_ROUNDS: 10,
      MAX_INVITES_PER_DAY: 50,
      INVITE_CODE_TIMEOUT: '604800000',
      WEB_APP_URL: '',
      TURNSTILE_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '',
      TURNSTILE_ENABLED: 'false',
      LOG_CONSOLE: 'true',
      LOG_LEVEL: 'INFO',
      MAX_PROJECT_NAME_LENGTH: 100,
      MAX_CONCURRENT_PROJECTS: 5,
      MAX_GROUP_NAME_LENGTH: 50,
      MAX_GROUPS_PER_PROJECT: 20,
      MAX_MEMBERS_PER_GROUP: 10,
      MAX_STAGE_DURATION_DAYS: 30
    })

    const activeConfigPanels = ref(['database'])
    const loadingProperties = ref(false)
    const savingProperties = ref(false)
    const resettingProperties = ref(false)

    // Computed properties for timeout conversions
    const sessionTimeoutHours = computed({
      get: () => Math.floor(parseInt(propertiesConfig.SESSION_TIMEOUT) / 3600000),
      set: (hours) => { propertiesConfig.SESSION_TIMEOUT = String(hours * 3600000) }
    })

    const inviteCodeTimeoutDays = computed({
      get: () => Math.floor(parseInt(propertiesConfig.INVITE_CODE_TIMEOUT) / 86400000),
      set: (days) => { propertiesConfig.INVITE_CODE_TIMEOUT = String(days * 86400000) }
    })

    const logConsoleEnabled = computed({
      get: () => propertiesConfig.LOG_CONSOLE === 'true',
      set: (val) => { propertiesConfig.LOG_CONSOLE = val ? 'true' : 'false' }
    })

    const turnstileEnabled = computed({
      get: () => propertiesConfig.TURNSTILE_ENABLED === 'true',
      set: (val) => { propertiesConfig.TURNSTILE_ENABLED = val ? 'true' : 'false' }
    })

    const validating = reactive({
      GLOBAL_WORKBOOK_ID: false,
      LOG_SPREADSHEET_ID: false,
      NOTIFICATION_SPREADSHEET_ID: false
    })

    const validationStatus = reactive({
      GLOBAL_WORKBOOK_ID: null,  // null | 'success' | 'error'
      LOG_SPREADSHEET_ID: null,
      NOTIFICATION_SPREADSHEET_ID: null
    })

    // 機器人控制相關
    const robotStatus = reactive({
      LAST_CLEANUP: null,
      LAST_CLEANUP_ERROR: null,
      LAST_NOTIFICATION_PATROL: null,
      LAST_NOTIFICATION_PATROL_ERROR: null,
      LAST_LOG_ARCHIVE: null,
      LAST_LOG_ARCHIVE_ERROR: null
    })

    const loadingRobotStatus = ref(false)
    const executing = reactive({
      cleanup: false,
      notificationPatrol: false,
      logArchive: false
    })

    // 可疑登入檢測相關
    const suspiciousLoginsDrawer = ref(false)
    const checkingSuspiciousLogins = ref(false)
    const suspiciousLogins = ref([])
    
    // 日誌相關狀態
    const logs = ref([])
    const logStats = ref(null)
    const logData = ref({ logs: [], total: 0, hasMore: false })
    const logsLoading = ref(false)
    const loadingMore = ref(false)
    const archiving = ref(false)
    
    const logFilters = reactive({
      limit: 20,
      level: '',
      category: '',
      search: ''
    })



    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW')
    }

    const getActionClass = (action) => {
      if (action.includes('created') || action.includes('registered')) return 'action-create'
      if (action.includes('updated') || action.includes('modified')) return 'action-update'
      if (action.includes('deleted') || action.includes('removed')) return 'action-delete'
      if (action.includes('login') || action.includes('logout')) return 'action-auth'
      return 'action-other'
    }

    const getActionText = (action) => {
      const actionMap = {
        'user_registered': '用戶註冊',
        'user_login': '用戶登入',
        'user_logout': '用戶登出',
        'project_created': '創建專案',
        'project_updated': '更新專案',
        'project_archived': '封存專案',
        'group_created': '創建群組',
        'group_updated': '更新群組',
        'group_deleted': '刪除群組',
        'user_added_to_group': '新增群組成員',
        'user_removed_from_group': '移除群組成員',
        'invitation_generated': '生成邀請碼',
        'invitation_used': '使用邀請碼',
        'password_reset_by_admin': '管理員重設密碼',
        'tag_created': '建立標籤',
        'tag_updated': '更新標籤',
        'tag_deleted': '刪除標籤'
      }
      return actionMap[action] || action
    }


    const loadSystemStats = async () => {
      try {
        const response = await apiClient.callWithAuth('/admin/system/stats', {})
        if (response.success && response.data) {
          systemStats.value = {
            ...response.data,
            lastUpdate: Date.now()
          }
        } else {
          console.error('Failed to load system stats:', response)
        }
      } catch (error) {
        console.error('Error loading system stats:', error)
      }
    }

    const loadInvitationStats = async () => {
      try {
        const response = await apiClient.callWithAuth('/invitations/list', {})
        if (response.success && response.data) {
          const invitations = response.data
          const now = Date.now()
          invitationStats.value = {
            total: invitations.length,
            active: invitations.filter(i => i.status === 'active' && i.expiryTime > now).length,
            expired: invitations.filter(i => i.expiryTime <= now).length,
            used: invitations.filter(i => i.status === 'used').length
          }
        } else {
          console.error('Failed to load invitation stats:', response)
        }
      } catch (error) {
        console.error('Error loading invitation stats:', error)
      }
    }

    const loadAllStats = async () => {
      statsLoading.value = true
      try {
        const { ElMessage } = await import('element-plus')
        
        // 並行載入所有統計數據
        await Promise.all([
          loadSystemStats(),
          loadInvitationStats(),
          loadLogStats()
        ])
        
        ElMessage.success('統計資料更新完成')
      } catch (error) {
        console.error('Error loading all stats:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入統計資料時發生錯誤')
      } finally {
        statsLoading.value = false
      }
    }





    const cleanupInvitations = async () => {
      if (!confirm('確定要清理過期的邀請碼嗎？')) {
        return
      }

      try {
        cleaning.value = true
        
        const sessionId = localStorage.getItem('sessionId')
        const response = await fetch(`${window.GAS_URL}?action=cleanupExpiredInvitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
        
        const result = await response.json()
        if (result.success) {
          alert(`已清理 ${result.data.cleanedCount || 0} 個過期邀請碼`)
          loadSystemStats()
        } else {
          alert('清理失敗: ' + result.error.message)
        }
      } catch (error) {
        console.error('Error cleaning invitations:', error)
        alert('清理失敗')
      } finally {
        cleaning.value = false
      }
    }


    // 根據 functionName 判斷日誌類型
    const getLogCategory = (functionName) => {
      if (!functionName) return 'other'

      const lowerName = functionName.toLowerCase()

      // 機器人相關
      if (lowerName.includes('cleanup') ||
          lowerName.includes('scheduledtask') ||
          lowerName.includes('scheduled') ||
          lowerName.includes('patrol') ||
          lowerName.includes('archive') ||
          lowerName.includes('maintenance')) {
        return 'robot'
      }

      // 認證相關
      if (lowerName.includes('login') ||
          lowerName.includes('logout') ||
          lowerName.includes('auth') ||
          lowerName.includes('session') ||
          lowerName.includes('register')) {
        return 'auth'
      }

      // API 請求相關
      if (lowerName.includes('handleapirequest') ||
          lowerName.includes('doget') ||
          lowerName.includes('dopost') ||
          lowerName.includes('route')) {
        return 'api'
      }

      return 'other'
    }

    // 日誌相關方法
    const refreshLogs = async () => {
      logsLoading.value = true
      try {
        const response = await apiClient.callWithAuth('/system/logs', {
          limit: logFilters.limit * 2, // 獲取更多數據以便過濾
          level: logFilters.level,
          search: logFilters.search
        })

        if (response.success && response.data) {
          logData.value = response.data

          // 客戶端過濾 category
          let filteredLogs = response.data.logs
          if (logFilters.category) {
            filteredLogs = filteredLogs.filter(log => {
              return getLogCategory(log.functionName) === logFilters.category
            })
          }

          // 限制顯示數量
          logs.value = filteredLogs.slice(0, logFilters.limit)
        } else {
          console.error('Failed to load logs:', response)
          const { ElMessage } = await import('element-plus')
          ElMessage.error(`載入日誌失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('載入日誌失敗:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入日誌失敗，請重試')
      } finally {
        logsLoading.value = false
      }
    }
    
    const loadLogStats = async () => {
      try {
        const response = await apiClient.callWithAuth('/system/logs/stats')
        if (response.success && response.data) {
          logStats.value = response.data
        } else {
          console.error('Failed to load log stats:', response)
        }
      } catch (error) {
        console.error('載入日誌統計失敗:', error)
      }
    }
    
    const loadMoreLogs = async () => {
      loadingMore.value = true
      try {
        const currentLimit = logFilters.limit + 20
        const response = await apiClient.callWithAuth('/system/logs', {
          limit: currentLimit,
          level: logFilters.level,
          search: logFilters.search
        })
        
        if (response.success && response.data) {
          logFilters.limit = currentLimit
          logData.value = response.data
          logs.value = response.data.logs
        }
      } catch (error) {
        console.error('載入更多日誌失敗:', error)
      } finally {
        loadingMore.value = false
      }
    }
    
    const confirmArchiveLogs = async () => {
      const result = confirm('歸檔操作將將當前日誌表移至歷史檔案並創建新的日誌表，是否繼續？')
      
      if (result) {
        await archiveLogs()
      }
    }
    
    const archiveLogs = async () => {
      archiving.value = true
      try {
        const response = await apiClient.archiveLogs(50000)
        
        if (response.success) {
          if (response.data.archived) {
            alert(`歸檔成功！${response.data.message}`)
            // 重新載入統計和日誌
            await Promise.all([loadLogStats(), refreshLogs()])
          } else {
            alert(response.data.message)
          }
        }
      } catch (error) {
        console.error('歸檔日誌失敗:', error)
      } finally {
        archiving.value = false
      }
    }
    
    
    
    const formatNumber = (value) => {
      if (!value && value !== 0) return '0'
      return Number(value).toLocaleString('zh-TW')
    }
    
    const formatLogTime = (timestamp) => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
    
    const truncateText = (text, maxLength) => {
      if (!text) return '-'
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }


    // Removed apiCall method - now using centralized apiClient

    const refreshSettings = () => {
      loadSystemStats()
      refreshLogs()
    }

    // 防抖函數，避免頻繁請求
    let searchTimeout = null
    const debouncedRefreshLogs = () => {
      if (searchTimeout) clearTimeout(searchTimeout)
      searchTimeout = setTimeout(() => {
        if (!logsLoading.value) {
          refreshLogs()
        }
      }, 500) // 500ms 防抖
    }

    // 監聽過濾器變化，自動重新載入日誌
    watch(
      () => logFilters.level,
      () => {
        // 等級變化時立即刷新
        if (!logsLoading.value) {
          refreshLogs()
        }
      }
    )

    watch(
      () => logFilters.search,
      () => {
        // 搜尋條件變化時使用防抖
        debouncedRefreshLogs()
      }
    )

    watch(
      () => logFilters.limit,
      () => {
        // 顯示數量變化時立即刷新
        if (!logsLoading.value) {
          refreshLogs()
        }
      }
    )

    watch(
      () => logFilters.category,
      () => {
        // 類型變化時立即刷新
        if (!logsLoading.value) {
          refreshLogs()
        }
      }
    )

    // 檢查是否有活躍的過濾條件
    const hasActiveFilters = computed(() => {
      return logFilters.level || logFilters.category || logFilters.search || logFilters.limit !== 20
    })

    // 清除所有過濾條件
    const clearFilters = () => {
      logFilters.level = ''
      logFilters.category = ''
      logFilters.search = ''
      logFilters.limit = 20
    }

    // 獲取類型標籤
    const getCategoryLabel = (category) => {
      const labels = {
        'robot': '機器人運作紀錄',
        'auth': '使用者登入紀錄',
        'api': 'API 請求紀錄',
        'other': '其他紀錄'
      }
      return labels[category] || category
    }

    // PropertiesService 配置相關方法
    const loadPropertiesConfig = async () => {
      loadingProperties.value = true
      try {
        const response = await apiClient.callWithAuth('/admin/properties/get-all')
        if (response.success && response.data) {
          Object.assign(propertiesConfig, response.data)
        }
      } catch (error) {
        console.error('載入配置失敗:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入配置失敗，請重試')
      } finally {
        loadingProperties.value = false
      }
    }

    const savePropertiesConfig = async () => {
      savingProperties.value = true
      try {
        const { ElMessage } = await import('element-plus')

        const response = await apiClient.callWithAuth('/admin/properties/update', {
          properties: propertiesConfig
        })

        if (response.success) {
          ElMessage.success('配置已儲存')
        } else {
          ElMessage.error(`儲存失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('儲存配置失敗:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('儲存配置失敗，請重試')
      } finally {
        savingProperties.value = false
      }
    }

    const confirmResetProperties = async () => {
      const { ElMessageBox, ElMessage } = await import('element-plus')

      try {
        await ElMessageBox.confirm(
          '此操作將重設所有可配置參數為預設值（不影響資料庫 ID），是否繼續？',
          '確認重設',
          {
            confirmButtonText: '確定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        await resetProperties()
      } catch (error) {
        // User cancelled
      }
    }

    const resetProperties = async () => {
      resettingProperties.value = true
      try {
        const { ElMessage } = await import('element-plus')

        const response = await apiClient.callWithAuth('/admin/properties/reset')

        if (response.success) {
          await loadPropertiesConfig()
          ElMessage.success('配置已重設為預設值')
        } else {
          ElMessage.error(`重設失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('重設配置失敗:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('重設配置失敗，請重試')
      } finally {
        resettingProperties.value = false
      }
    }

    const validateSpreadsheet = async (key) => {
      validating[key] = true
      validationStatus[key] = null  // 重置狀態
      try {
        const { ElMessage } = await import('element-plus')
        const spreadsheetId = propertiesConfig[key]

        if (!spreadsheetId) {
          ElMessage.warning('尚未設定 ID')
          validationStatus[key] = 'error'
          return
        }

        const response = await apiClient.callWithAuth('/admin/properties/validate-spreadsheet', {
          spreadsheetId: spreadsheetId
        })

        if (response.success && response.data.valid) {
          validationStatus[key] = 'success'
          ElMessage.success(`驗證成功: ${response.data.name}`)
        } else {
          validationStatus[key] = 'error'
          ElMessage.error('無法訪問此 Spreadsheet')
        }
      } catch (error) {
        console.error('驗證失敗:', error)
        validationStatus[key] = 'error'
        const { ElMessage } = await import('element-plus')
        ElMessage.error('驗證失敗，請重試')
      } finally {
        validating[key] = false
      }
    }

    // 機器人控制相關方法
    const refreshRobotStatus = async () => {
      loadingRobotStatus.value = true
      try {
        const response = await apiClient.callWithAuth('/admin/robots/status')
        if (response.success && response.data) {
          Object.assign(robotStatus, response.data)
        }
      } catch (error) {
        console.error('載入機器人狀態失敗:', error)
      } finally {
        loadingRobotStatus.value = false
      }
    }

    const executeRobot = async (robotType) => {
      executing[robotType] = true
      try {
        const { ElMessage } = await import('element-plus')

        let endpoint = ''
        let successMessage = ''

        switch (robotType) {
          case 'cleanup':
            endpoint = '/admin/robots/cleanup'
            successMessage = '清理完成'
            break
          case 'notificationPatrol':
            endpoint = '/admin/robots/notification-patrol'
            successMessage = '通知巡檢完成'
            break
          case 'logArchive':
            endpoint = '/admin/robots/log-archive'
            successMessage = '日誌歸檔完成'
            break
        }

        const response = await apiClient.callWithAuth(endpoint)

        if (response.success) {
          ElMessage.success(successMessage)
          await refreshRobotStatus()
        } else {
          ElMessage.error(`執行失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error(`執行機器人 ${robotType} 失敗:`, error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('執行失敗，請重試')
      } finally {
        executing[robotType] = false
      }
    }

    const getRobotStatusType = (statusKey) => {
      const lastExecutionTime = robotStatus[statusKey]
      if (!lastExecutionTime) return 'info'

      const now = Date.now()
      const timeDiff = now - new Date(lastExecutionTime).getTime()
      const hoursDiff = timeDiff / (1000 * 60 * 60)

      if (hoursDiff < 24) return 'success'
      if (hoursDiff < 72) return 'warning'
      return 'danger'
    }

    const getRobotStatusText = (statusKey) => {
      const lastExecutionTime = robotStatus[statusKey]
      if (!lastExecutionTime) return '未執行'

      const now = Date.now()
      const timeDiff = now - new Date(lastExecutionTime).getTime()
      const hoursDiff = timeDiff / (1000 * 60 * 60)

      if (hoursDiff < 24) return '正常'
      if (hoursDiff < 72) return '警告'
      return '過期'
    }

    const formatRobotTime = (timestamp) => {
      if (!timestamp) return '從未執行'
      return formatLogTime(timestamp)
    }

    // 可疑登入檢測方法
    const checkSuspiciousLogins = async () => {
      checkingSuspiciousLogins.value = true
      suspiciousLoginsDrawer.value = true
      suspiciousLogins.value = []

      try {
        const response = await apiClient.callWithAuth('/admin/security/suspicious-logins')

        if (response.success && response.data) {
          suspiciousLogins.value = response.data
        } else {
          const { ElMessage } = await import('element-plus')
          ElMessage.error(`檢查失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('檢查可疑登入失敗:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('檢查失敗，請重試')
      } finally {
        checkingSuspiciousLogins.value = false
      }
    }

    onMounted(() => {
      loadAllStats()
      refreshLogs()
      loadPropertiesConfig()
      refreshRobotStatus()
    })

    return {
      systemStats,
      invitationStats,
      systemLogs,
      logLimit,
      saving,
      cleaning,
      statsLoading,
      // 日誌相關狀態
      logs,
      logStats,
      logData,
      logsLoading,
      loadingMore,
      archiving,
      logFilters,
      // PropertiesService 配置相關
      propertiesConfig,
      activeConfigPanels,
      loadingProperties,
      savingProperties,
      resettingProperties,
      sessionTimeoutHours,
      inviteCodeTimeoutDays,
      logConsoleEnabled,
      turnstileEnabled,
      validating,
      validationStatus,
      // 機器人控制相關
      robotStatus,
      loadingRobotStatus,
      executing,
      // 可疑登入檢測相關
      suspiciousLoginsDrawer,
      checkingSuspiciousLogins,
      suspiciousLogins,
      // Common methods
      formatTime,
      getActionClass,
      getActionText,
      cleanupInvitations,
      loadAllStats,
      refreshSettings,
      // 日誌相關方法
      refreshLogs,
      loadLogStats,
      loadMoreLogs,
      confirmArchiveLogs,
      archiveLogs,
      formatNumber,
      formatLogTime,
      truncateText,
      // 過濾器相關
      hasActiveFilters,
      clearFilters,
      getCategoryLabel,
      // PropertiesService 配置相關方法
      loadPropertiesConfig,
      savePropertiesConfig,
      confirmResetProperties,
      resetProperties,
      validateSpreadsheet,
      // 機器人控制相關方法
      refreshRobotStatus,
      executeRobot,
      getRobotStatusType,
      getRobotStatusText,
      formatRobotTime,
      // 可疑登入檢測方法
      checkSuspiciousLogins
    }
  }
}
</script>

<style scoped>
.system-settings {
  padding: 20px;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
}

.header-left h2 {
  margin: 0 0 5px 0;
  color: #2c5aa0;
}

.header-left h2 i {
  margin-right: 10px;
}

.header-desc {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.settings-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow: hidden;
}

.settings-section h3 {
  margin: 0;
  padding: 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
  color: #2c5aa0;
  font-size: 18px;
}

.settings-section h3 i {
  margin-right: 10px;
}

/* 統計區塊樣式 */
.section-header-with-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  padding: 20px 20px 0 20px;
}

.section-header-with-actions h3 {
  margin: 0;
  color: #2c5aa0;
  font-size: 18px;
}

.section-header-with-actions h3 i {
  margin-right: 10px;
}

.stats-container {
  padding: 20px;
}

.stat-card {
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.stat-suffix {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  line-height: 1.4;
}

.log-stats-section {
  padding: 20px;
}

.level-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.level-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.level-badge.debug {
  background-color: #909399;
}

.level-badge.info {
  background-color: #409EFF;
}

.level-badge.warn {
  background-color: #E6A23C;
}

.level-badge.error {
  background-color: #F56C6C;
}

.level-badge.fatal {
  background-color: #722ED1;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  color: #2c5aa0;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  color: #333;
  margin-bottom: 3px;
}

.stat-detail {
  font-size: 12px;
  color: #666;
}


.logs-controls {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #ddd;
}

.log-limit-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.logs-container {
  max-height: 500px;
  overflow-y: auto;
}

.no-logs {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-logs i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.logs-list {
  padding: 20px;
}

.log-entry {
  display: grid;
  grid-template-columns: 150px 200px 150px 200px 1fr;
  gap: 15px;
  padding: 12px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
  align-items: center;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: #666;
  font-family: monospace;
}

.log-user {
  font-weight: 500;
}

.log-action {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.log-action.action-create {
  background: #d4edda;
  color: #155724;
}

.log-action.action-update {
  background: #d1ecf1;
  color: #0c5460;
}

.log-action.action-delete {
  background: #f8d7da;
  color: #721c24;
}

.log-action.action-auth {
  background: #fff3cd;
  color: #856404;
}

.log-action.action-other {
  background: #e2e3e5;
  color: #495057;
}

.log-target {
  font-family: monospace;
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
}

.log-details {
  font-family: monospace;
  font-size: 11px;
  color: #666;
  background: #f8f9fa;
  padding: 4px 6px;
  border-radius: 3px;
  word-break: break-all;
}

.maintenance-actions {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.maintenance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #f8f9fa;
}

.maintenance-info h4 {
  margin: 0 0 5px 0;
  color: #333;
}

.maintenance-info p {
  margin: 0;
  color: #666;
  font-size: 14px;
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
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-info {
  background: #17a2b8;
  color: white;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-sm {
  padding: 8px 12px;
  font-size: 12px;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-warning:hover,
.btn-info:hover {
  opacity: 0.9;
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-warning:disabled,
.btn-info:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary i,
.btn-secondary i,
.btn-warning i,
.btn-info i {
  margin-right: 5px;
}

/* Tag Management Styles */
.tag-create-form {
  padding: 20px;
  border-bottom: 1px solid #e1e8ed;
  background: #fafbfc;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.color-input {
  width: 60px;
  height: 40px;
  padding: 2px;
}

.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.tags-filter {
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.filter-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

.tags-table-container {
  overflow-x: auto;
}

.tags-table {
  width: 100%;
  border-collapse: collapse;
}

.tags-table th,
.tags-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.tags-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
}

.tags-table tr:hover {
  background: #f8f9fa;
}

.tag-display {
  display: flex;
  align-items: center;
}

.tag-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
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

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.btn-sm i {
  font-size: 12px;
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

.btn-success {
  background: #28a745;
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

.btn-primary:hover,
.btn-secondary:hover,
.btn-success:hover,
.btn-warning:hover,
.btn-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.no-tags {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-tags i {
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
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
}

.modal-content h3 i {
  margin-right: 10px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  
  .log-entry {
    grid-template-columns: 1fr;
    gap: 5px;
  }
  
  .maintenance-item {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .form-grid {
    grid-template-columns: 1fr;
  }
  
  .filter-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .actions {
    flex-direction: column;
    align-items: stretch;
  }
  
  .modal-content {
    margin: 10px;
    width: calc(100% - 20px);
  }
  
  .logs-table {
    font-size: 12px;
  }
  
  .log-actions {
    flex-direction: column;
  }
}

/* 日誌相關樣式 */
.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.log-stats {
  padding: 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.stats-row {
  display: flex;
  gap: 30px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 14px;
}

.stat-item i {
  color: #2c5aa0;
  width: 16px;
}

.level-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.level-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.level-badge.debug {
  background: #f3e5f5;
  color: #7b1fa2;
}

.level-badge.info {
  background: #e8f5e8;
  color: #2e7d32;
}

.level-badge.warn {
  background: #fff3e0;
  color: #ef6c00;
}

.level-badge.error {
  background: #ffebee;
  color: #c62828;
}

.level-badge.fatal {
  background: #fce4ec;
  color: #ad1457;
}

.log-filters {
  padding: 20px;
  background: #fafafa;
  border-bottom: 1px solid #e1e8ed;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.active-filters {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e1e8ed;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.filter-row .form-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.filter-row label {
  font-weight: 500;
  color: #333;
  white-space: nowrap;
}

.logs-container {
  min-height: 400px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
  font-size: 16px;
}

.loading-state i {
  margin-right: 10px;
  color: #2c5aa0;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 15px;
  display: block;
}

.logs-table {
  overflow-x: auto;
}

.logs-table table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  min-width: 1000px;
}

.logs-table th {
  background: #f8f9fa;
  color: #333;
  font-weight: 600;
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #e1e8ed;
  white-space: nowrap;
}

.logs-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  vertical-align: top;
}

.logs-table tr:hover {
  background: #f8f9fa;
}

.timestamp {
  font-family: monospace;
  color: #666;
  white-space: nowrap;
}

.function-name {
  font-weight: 500;
  color: #2c5aa0;
}

.action {
  color: #333;
}

.user-id {
  font-family: monospace;
  color: #666;
}

.details {
  max-width: 200px;
  word-wrap: break-word;
  color: #666;
}

.execution-time {
  font-family: monospace;
  color: #666;
  text-align: right;
}

.log-level-debug {
  border-left: 3px solid #7b1fa2;
}

.log-level-info {
  border-left: 3px solid #2e7d32;
}

.log-level-warn {
  border-left: 3px solid #ef6c00;
}

.log-level-error {
  border-left: 3px solid #c62828;
}

.log-level-fatal {
  border-left: 3px solid #ad1457;
  background: #fff5f5;
}

.load-more {
  text-align: center;
  padding: 20px;
  border-top: 1px solid #e1e8ed;
  background: #fafafa;
}

.load-more p {
  margin: 0 0 15px 0;
  color: #666;
  font-size: 14px;
}

.log-actions {
  padding: 20px;
  border-top: 1px solid #e1e8ed;
  background: #fafafa;
  display: flex;
  gap: 15px;
  justify-content: center;
}

/* PropertiesService Configuration Styles */
.properties-container {
  padding: 20px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.config-group {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-weight: 600;
  color: #333;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-desc {
  margin: 0;
  font-size: 12px;
  color: #666;
}

.readonly-item {
  opacity: 0.8;
}

.readonly-item .config-label {
  color: #666;
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
}

.slider-value {
  font-size: 13px;
  color: #409EFF;
  font-weight: 500;
  align-self: flex-end;
  margin-top: 5px;
}

.collapse-title {
  font-weight: 600;
  color: #2c5aa0;
}

/* Robot Control Zone Styles */
.robot-grid {
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.robot-card {
  border-radius: 8px;
  transition: all 0.3s ease;
}

.robot-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.robot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.robot-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #333;
  font-size: 15px;
}

.robot-title i {
  color: #409EFF;
  font-size: 18px;
}

.robot-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.robot-desc {
  margin: 0;
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.robot-status {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-label {
  color: #666;
  font-weight: 500;
}

.status-value {
  color: #333;
  font-family: monospace;
  font-size: 12px;
}

.robot-actions {
  display: flex;
  gap: 10px;
}

/* Suspicious Logins Drawer Styles */
.drawer-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
}

.drawer-loading i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #409EFF;
}

.drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
}

.drawer-empty i {
  font-size: 64px;
  margin-bottom: 15px;
  color: #67C23A;
}

.drawer-empty p {
  margin: 0;
  font-size: 16px;
}

.suspicious-logins-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.suspicious-item {
  padding: 0;
}

.suspicious-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}

.suspicious-username {
  font-weight: 600;
  font-size: 15px;
  color: #333;
}

.suspicious-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.detail-label {
  color: #666;
  font-weight: 500;
}

.detail-value {
  color: #333;
  font-family: monospace;
}

/* Spreadsheet Validation Styles */
.spreadsheet-validation {
  display: flex;
  gap: 10px;
  align-items: center;
}

.spreadsheet-validation .el-input {
  flex: 1;
}

/* Responsive Design */
@media (max-width: 768px) {
  .robot-grid {
    grid-template-columns: 1fr;
  }

  .header-actions {
    flex-direction: column;
  }

  .section-header-with-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .log-entry {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>