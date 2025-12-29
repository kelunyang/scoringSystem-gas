<template>
  <div class="system-logs">
    <!-- Permission Scope Indicator -->
    <div v-if="permissionScopeText" class="permission-scope-banner permission-admin">
      <i class="fas fa-shield-alt"></i>
      <span>{{ permissionScopeText }}</span>
    </div>

    <!-- 標準 Log 視圖 -->
    <div v-show="currentLogMode === 'standard'" class="standard-logs-view">
      <!-- Unified Filter Toolbar -->
      <AdminFilterToolbar
        variant="default"
        :loading="loading"
        :export-data="exportConfig.data"
        :export-filename="exportConfig.filename"
        :export-headers="exportConfig.headers"
        :export-row-mapper="exportConfig.rowMapper"
        :active-filter-count="activeFilterCount"
        :expanded-filter-count="4"
        show-stats
        @reset-filters="handleResetFilters"
      >
        <!-- Core Filters (Always Visible) -->
        <template #filters-core>
          <!-- 關鍵字搜尋 -->
          <div class="filter-item">
            <span class="filter-label">關鍵字：</span>
            <el-input
              v-model="filters.searchKeywordRaw"
              placeholder="搜尋函數名或訊息內容"
              clearable
              style="width: 300px;"
            >
              <template #prefix>
                <i class="el-icon-search"></i>
              </template>
            </el-input>
          </div>

          <div class="filter-item">
            <span class="filter-label">時間範圍：</span>
            <el-date-picker
              v-model="filters.dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="x"
              style="width: 300px;"
              @change="applyFilters"
            />
          </div>

          <div class="filter-item">
            <span class="filter-label">日誌級別：</span>
            <el-select
              v-model="filters.selectedLevel"
              placeholder="全部級別"
              clearable
              style="width: 180px;"
              @change="applyFilters"
            >
              <el-option label="全部" value="" />
              <el-option label="Info" value="info" />
              <el-option label="Warning" value="warning" />
              <el-option label="Error" value="error" />
              <el-option label="Critical" value="critical" />
            </el-select>
          </div>
        </template>

        <!-- Expanded Filters (Collapsible) -->
        <template #filters-expanded>
          <div class="filter-item">
            <span class="filter-label">用戶：</span>
            <el-select
              v-model="filters.selectedUsers"
              multiple
              filterable
              placeholder="選擇用戶"
              style="width: 300px;"
              @change="applyFilters"
              clearable
            >
              <el-option
                v-for="user in availableUsers"
                :key="user.userId"
                :label="user.displayName"
                :value="user.userId"
              />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">操作類型：</span>
            <el-select
              v-model="filters.selectedActions"
              multiple
              filterable
              placeholder="選擇操作"
              style="width: 300px;"
              @change="applyFilters"
              clearable
            >
              <el-option
                v-for="action in availableActions"
                :key="action"
                :label="getActionLabel(action)"
                :value="action"
              />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">實體類型：</span>
            <el-select
              v-model="filters.selectedEntityTypes"
              multiple
              filterable
              placeholder="選擇實體類型"
              style="width: 300px;"
              @change="applyFilters"
              clearable
            >
              <el-option
                v-for="type in availableEntityTypes"
                :key="type"
                :label="getEntityTypeLabel(type)"
                :value="type"
              />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">項目：</span>
            <el-select
              v-model="filters.selectedProjects"
              multiple
              filterable
              placeholder="選擇項目"
              style="width: 300px;"
              @change="applyFilters"
              clearable
            >
              <el-option
                v-for="project in availableProjects"
                :key="project.projectId"
                :label="project.projectName"
                :value="project.projectId"
              />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">顯示數量：</span>
            <el-slider
              v-model="displayLimit"
              :min="10"
              :max="200"
              :step="10"
              :show-tooltip="true"
              style="width: 200px;"
            />
            <span class="filter-value-display">{{ displayLimit }}</span>
          </div>
        </template>

        <!-- 🆕 Actions Slot: 搜索和刷新按钮 -->
        <template #actions>
          <!-- 后端搜索按钮 -->
          <el-tooltip content="后端搜索（全部记录）" placement="top">
            <el-button
              type="primary"
              size="small"
              :icon="Search"
              @click="searchSystemLogsBackend"
              :loading="loading"
              :disabled="!hasActiveStandardFilters"
            >
              <span class="btn-text">后端搜索</span>
            </el-button>
          </el-tooltip>

          <!-- 重新整理按钮 -->
          <el-tooltip content="重新整理（最近 500 条）" placement="top">
            <el-button
              size="small"
              :icon="Refresh"
              @click="loadSystemLogs"
              :loading="loading"
            >
              <span class="btn-text">重新整理</span>
            </el-button>
          </el-tooltip>
        </template>

        <!-- Stats Slot: 搜尋結果統計 -->
        <template #stats>
          <!-- 🆕 后端模式：显示 API 返回的总数 -->
          <el-statistic
            v-if="standardLogsSearchMode === 'backend' && (totalCount ?? 0) > 0"
            title="搜尋結果"
            :value="totalCount ?? 0"
            suffix="筆記錄"
          >
            <template #prefix>
              <i class="fas fa-database"></i>
            </template>
          </el-statistic>

          <!-- 🆕 前端模式：显示过滤后的数量 -->
          <el-statistic
            v-else-if="standardLogsSearchMode === 'frontend'"
            title="顯示範圍"
            :value="displayedLogs.length"
          >
            <template #prefix>
              <i class="fas fa-filter"></i>
            </template>
            <template #suffix>
              <span>/ {{ MAX_LOG_FETCH_LIMIT }} 筆</span>
            </template>
          </el-statistic>
        </template>
      </AdminFilterToolbar>

      <!-- 🆕 搜索模式提示 -->
      <div v-if="standardLogsSearchMode === 'backend' && (totalCount ?? 0) > 0" class="search-result-info" style="margin-top: 10px;">
        <el-alert type="success" :closable="false">
          <template #title>
            <i class="fas fa-database"></i>
            后端搜索完成：找到 {{ totalCount }} 条匹配记录
          </template>
        </el-alert>
      </div>
      <div v-else-if="standardLogsSearchMode === 'frontend' && displayedLogs.length === 0 && hasActiveStandardFilters" class="search-result-info" style="margin-top: 10px;">
        <el-alert type="warning" :closable="false">
          <template #title>
            在最近 500 条中未找到匹配记录，尝试
            <el-button type="text" @click="searchSystemLogsBackend">后端搜索</el-button>
            查找全部历史记录
          </template>
        </el-alert>
      </div>

      <!-- 统计卡片 -->
      <el-card v-if="logStats" class="stats-card">
      <h4><i class="fas fa-chart-bar"></i> 日志统计</h4>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-statistic title="总日志数" :value="logStats.totalLogs || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="Info" :value="logStats.levelCounts?.info || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="Warning" :value="logStats.levelCounts?.warning || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="Error" :value="logStats.levelCounts?.error || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="Critical" :value="logStats.levelCounts?.critical || 0" />
        </el-col>
      </el-row>
    </el-card>

    <!-- 日志列表 -->
    <div class="log-list">
      <!-- 表格（僅在有資料時顯示） -->
      <table
        v-if="displayedLogs.length > 0"
        v-loading="loading"
        class="custom-table"
      >
        <thead>
          <tr>
            <th style="width: 40px"></th>
            <th style="width: 180px">时间</th>
            <th style="width: 100px">级别</th>
            <th style="width: 150px">用户</th>
            <th style="width: 200px">操作</th>
            <th style="width: 120px">实体类型</th>
            <th style="width: 150px">函数名</th>
            <th style="min-width: 300px">详情</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in displayedLogs" :key="log.logId">
          <ExpandableTableRow
            :is-expanded="expandedLogId === log.logId"
            :expansion-colspan="8"
            @toggle-expansion="handleToggleExpansion(log)"
          >
            <!-- Main Row -->
            <template #main="{ isExpanded }">
              <td>
                <i
                  class="expand-icon fas"
                  :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                ></i>
              </td>
              <td>{{ formatTimestamp(log.createdAt) }}</td>
              <td>
                <el-tag :type="getLevelType(log.level)">
                  {{ log.level }}
                </el-tag>
              </td>
              <td>{{ log.displayName }}</td>
              <td>
                <el-tag :type="getActionType(log.action ?? '')" size="small">
                  {{ getActionLabel(log.action ?? '') }}
                </el-tag>
              </td>
              <td>{{ getEntityTypeLabel(log.entityType ?? '') }}</td>
              <td>{{ log.functionName }}</td>
              <td>
                <div class="log-message">
                  {{ log.message }}
                </div>
              </td>
            </template>

            <!-- Expanded Content: Entity Details -->
            <template #default>
              <div v-loading="loadingEntity && expandingId === log.logId">
                <h4>
                  <i class="fas fa-info-circle"></i>
                  {{ entityDialogTitle }}
                </h4>

                <!-- Main Entity Details -->
                <div v-if="entityContent" class="entity-meta">
                  <el-descriptions :column="2" border size="small">
                    <el-descriptions-item
                      v-for="(value, key) in entityContent"
                      :key="key"
                      :label="formatFieldName(key)"
                    >
                      {{ formatFieldValue(key, value) }}
                    </el-descriptions-item>
                  </el-descriptions>
                </div>

                <!-- Related Entities -->
                <div v-if="relatedEntitiesData" class="related-entities">
                  <el-divider content-position="left">关联实体</el-divider>
                  <el-tag
                    v-for="(id, type) in relatedEntitiesData"
                    :key="type"
                    style="margin: 5px;"
                  >
                    {{ getEntityTypeLabel(String(type)) }}: {{ id }}
                  </el-tag>
                </div>

                <!-- Context Data -->
                <div v-if="contextData" class="context-data">
                  <el-divider content-position="left">上下文信息</el-divider>
                  <pre class="context-json hljs" v-html="formatJson(contextData)"></pre>
                </div>

                <!-- Error State -->
                <EmptyState
                  v-if="!entityContent && !contextData && !relatedEntitiesData && !loadingEntity"
                  parent-icon="fa-exclamation-triangle"
                  title="無詳細資訊"
                  :compact="true"
                />
              </div>
            </template>
          </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <!-- 空状态（沒有資料時顯示，帶 loading 狀態） -->
      <div v-else v-loading="loading" class="empty-state-container">
        <EmptyState
          v-if="!loading"
          parent-icon="fa-file-lines"
          title="暫無日誌記錄"
          description="請調整篩選條件或搜尋關鍵字"
          :compact="false"
        />
      </div>
    </div>

    <!-- 分頁控制（僅後端搜尋模式） -->
    <div v-if="standardLogsSearchMode === 'backend' && totalCount != null && totalCount > 0" class="pagination-container">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="totalCount"
        :page-sizes="[50, 100, 200, 500]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handlePageSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
  <!-- 標準 Log 視圖結束 -->

  <!-- 登入記錄視圖 -->
  <div v-show="currentLogMode === 'login'" class="login-logs-view">
      <!-- 登入記錄篩選器 -->
      <div class="toolbar">
        <div class="filters">
          <!-- 用戶篩選 -->
          <div class="filter-item">
            <span class="filter-label">用戶：</span>
            <el-input
              v-model="loginLogsUserIdRaw"
              placeholder="輸入用戶 Email"
              clearable
              style="width: 300px;"
            >
              <template #prefix>
                <i class="el-icon-user"></i>
              </template>
            </el-input>
          </div>

          <!-- 日期範圍 -->
          <div class="filter-item">
            <span class="filter-label">時間範圍：</span>
            <el-date-picker
              v-model="loginLogsDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="x"
              style="width: 300px;"
            />
          </div>

          <!-- 登入結果篩選 -->
          <div class="filter-item">
            <span class="filter-label">登入結果：</span>
            <el-select
              v-model="loginLogsResultFilter"
              placeholder="全部"
              clearable
              style="width: 180px;"
            >
              <el-option label="全部" value="" />
              <el-option label="成功" value="success" />
              <el-option label="失敗" value="failed" />
            </el-select>
          </div>

          <!-- 只顯示可疑記錄 -->
          <div class="filter-item">
            <el-checkbox v-model="showOnlySuspicious">只顯示可疑記錄</el-checkbox>
          </div>
        </div>

        <div class="toolbar-row">
          <!-- 🆕 后端搜索按钮 -->
          <el-button
            type="primary"
            :icon="Search"
            @click="searchLoginLogsBackend"
            :loading="loadingLoginLogs"
            :disabled="!hasActiveLoginFilters"
          >
            后端搜索（全部记录）
          </el-button>

          <!-- 重新整理按钮 -->
          <el-button
            :icon="Refresh"
            @click="loadLoginLogs"
            :loading="loadingLoginLogs"
          >
            重新整理（最近 500 条）
          </el-button>
        </div>

        <!-- 🆕 搜索模式提示 -->
        <div v-if="loginLogsSearchMode === 'backend' && totalLoginLogsCount !== null" class="search-result-info" style="margin-top: 10px;">
          <el-alert type="success" :closable="false">
            <template #title>
              <i class="fas fa-database"></i>
              后端搜索完成：找到 {{ totalLoginLogsCount }} 条匹配记录
            </template>
          </el-alert>
        </div>
        <div v-else-if="loginLogsSearchMode === 'frontend' && displayedLoginLogs.length === 0 && hasActiveLoginFilters" class="search-result-info" style="margin-top: 10px;">
          <el-alert type="warning" :closable="false">
            <template #title>
              在最近 500 条中未找到匹配记录，尝试
              <el-button type="text" @click="searchLoginLogsBackend">后端搜索</el-button>
              查找全部历史记录
            </template>
          </el-alert>
        </div>
      </div>

      <!-- 登入記錄表格 -->
      <div class="log-list">
        <!-- 表格（僅在有資料時顯示） -->
        <table
          v-if="displayedLoginLogs.length > 0"
          v-loading="loadingLoginLogs"
          class="custom-table"
        >
          <thead>
            <tr>
              <th style="width: 40px"></th>
              <th style="width: 180px">時間</th>
              <th style="width: 150px">用戶</th>
              <th style="width: 150px">操作</th>
              <th style="width: 150px">IP 地址</th>
              <th style="width: 180px">位置</th>
              <th style="min-width: 200px">設備/瀏覽器</th>
              <th style="width: 180px">失敗原因</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="log in displayedLoginLogs" :key="log.logId">
            <ExpandableTableRow
              :is-expanded="expandedLoginLogId === log.logId"
              :expansion-colspan="8"
              @toggle-expansion="handleToggleLoginExpansion(log)"
            >
              <!-- Main Row -->
              <template #main="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td>{{ formatTimestamp(log.createdAt) }}</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span>{{ log.displayName }}</span>
                    <el-tag v-if="log.isSuspicious" type="danger" size="small" effect="dark">
                      <i class="fas fa-exclamation-triangle"></i> 可疑
                    </el-tag>
                  </div>
                </td>
                <td>
                  <el-tag :type="log.action === 'login_success' ? 'success' : 'danger'" size="small">
                    {{ log.action === 'login_success' ? '登入成功' : '登入失敗' }}
                  </el-tag>
                </td>
                <td>{{ getLoginLogContext(log, 'ipAddress') }}</td>
                <td>{{ getLoginLogLocation(log) }}</td>
                <td>
                  <div class="log-message">
                    {{ getLoginLogContext(log, 'userAgent') }}
                  </div>
                </td>
                <td>{{ getLoginLogContext(log, 'reason') || '-' }}</td>
              </template>

              <!-- Expanded Content -->
              <template #default>
                <div>
                  <h4>
                    <i class="fas fa-right-to-bracket"></i>
                    登入記錄詳情
                  </h4>

                  <!-- Main Details -->
                  <div class="entity-meta">
                    <el-descriptions :column="2" border size="small">
                      <el-descriptions-item label="時間">
                        {{ formatTimestamp(log.createdAt) }}
                      </el-descriptions-item>
                      <el-descriptions-item label="用戶">
                        {{ log.displayName }}
                      </el-descriptions-item>
                      <el-descriptions-item label="Email">
                        {{ log.entityId }}
                      </el-descriptions-item>
                      <el-descriptions-item label="結果">
                        <el-tag :type="log.action === 'login_success' ? 'success' : 'danger'">
                          {{ log.action === 'login_success' ? '登入成功' : '登入失敗' }}
                        </el-tag>
                      </el-descriptions-item>
                      <el-descriptions-item label="IP 地址">
                        {{ getLoginLogContext(log, 'ipAddress') }}
                      </el-descriptions-item>
                      <el-descriptions-item label="位置">
                        {{ getLoginLogLocation(log) }}
                      </el-descriptions-item>
                      <el-descriptions-item label="時區">
                        {{ getLoginLogContext(log, 'timezone') }}
                      </el-descriptions-item>
                      <el-descriptions-item label="失敗原因" v-if="log.action === 'login_failed'">
                        {{ getLoginLogContext(log, 'reason') }}
                      </el-descriptions-item>
                      <el-descriptions-item label="嘗試次數" v-if="log.action === 'login_failed'">
                        {{ getLoginLogContext(log, 'attemptCount') }}
                      </el-descriptions-item>
                      <el-descriptions-item label="是否可疑" :span="2">
                        <el-tag v-if="log.isSuspicious" type="danger" effect="dark">
                          <i class="fas fa-exclamation-triangle"></i> 可疑登入記錄
                        </el-tag>
                        <span v-else>否</span>
                      </el-descriptions-item>
                    </el-descriptions>
                  </div>

                  <!-- Device Info -->
                  <div class="context-data">
                    <el-divider content-position="left">設備資訊</el-divider>
                    <pre>{{ getLoginLogContext(log, 'userAgent') }}</pre>
                  </div>

                  <!-- Full Context -->
                  <div class="context-data">
                    <el-divider content-position="left">完整上下文</el-divider>
                    <pre class="context-json hljs" v-html="formatJson(parseLoginLogContext(log))"></pre>
                  </div>
                </div>
              </template>
            </ExpandableTableRow>
            </template>
          </tbody>
        </table>

        <!-- 空狀態（沒有資料時顯示，帶 loading 狀態） -->
        <div v-else v-loading="loadingLoginLogs" class="empty-state-container">
          <EmptyState
            v-if="!loadingLoginLogs"
            parent-icon="fa-right-to-bracket"
            title="暫無登入記錄"
            description="請調整篩選條件或時間範圍"
            :compact="false"
          />
        </div>
      </div>
    </div>

    <!-- Email 記錄視圖 -->
    <div v-show="currentLogMode === 'email'" class="email-logs-view">
      <!-- Email 記錄篩選器 -->
      <div class="toolbar">
        <div class="filters">
          <!-- 收件人篩選 -->
          <div class="filter-item">
            <span class="filter-label">收件人：</span>
            <el-input
              v-model="emailLogsRecipientRaw"
              placeholder="輸入收件人 Email"
              clearable
              style="width: 300px;"
            >
              <template #prefix>
                <i class="el-icon-message"></i>
              </template>
            </el-input>
          </div>

          <!-- 日期範圍 -->
          <div class="filter-item">
            <span class="filter-label">時間範圍：</span>
            <el-date-picker
              v-model="emailLogsDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="x"
              style="width: 300px;"
            />
          </div>

          <!-- Trigger 篩選 -->
          <div class="filter-item">
            <span class="filter-label">觸發類型：</span>
            <el-select
              v-model="emailLogsTriggerFilter"
              placeholder="全部"
              clearable
              style="width: 200px;"
            >
              <el-option label="全部" value="" />
              <el-option label="邀請碼" value="invitation" />
              <el-option label="密碼重置" value="password_reset" />
              <el-option label="帳號鎖定" value="account_locked" />
              <el-option label="2FA 驗證" value="two_factor_login" />
              <el-option label="安全巡邏" value="security_patrol" />
              <el-option label="管理員通知" value="admin_notification" />
            </el-select>
          </div>

          <!-- 發送狀態篩選 -->
          <div class="filter-item">
            <span class="filter-label">發送狀態：</span>
            <el-select
              v-model="emailLogsStatusFilter"
              placeholder="全部"
              clearable
              style="width: 150px;"
            >
              <el-option label="全部" value="" />
              <el-option label="成功" :value="EmailStatus.SENT" />
              <el-option label="失敗" :value="EmailStatus.FAILED" />
            </el-select>
          </div>
        </div>

        <div class="toolbar-row">
          <!-- 🆕 后端搜索按钮 -->
          <el-button
            type="primary"
            :icon="Search"
            @click="searchEmailLogsBackend"
            :loading="loadingEmailLogs"
            :disabled="!hasActiveEmailFilters"
          >
            后端搜索（全部记录）
          </el-button>

          <!-- 重新整理按钮 -->
          <el-button
            :icon="Refresh"
            @click="loadEmailLogs"
            :loading="loadingEmailLogs"
          >
            重新整理（最近 500 条）
          </el-button>
        </div>

        <!-- 🆕 搜索模式提示 -->
        <div v-if="emailLogsSearchMode === 'backend' && totalEmailLogsCount !== null" class="search-result-info" style="margin-top: 10px;">
          <el-alert type="success" :closable="false">
            <template #title>
              <i class="fas fa-database"></i>
              后端搜索完成：找到 {{ totalEmailLogsCount }} 条匹配记录
            </template>
          </el-alert>
        </div>
        <div v-else-if="emailLogsSearchMode === 'frontend' && displayedEmailLogs.length === 0 && hasActiveEmailFilters" class="search-result-info" style="margin-top: 10px;">
          <el-alert type="warning" :closable="false">
            <template #title>
              在最近 500 条中未找到匹配记录，尝试
              <el-button type="text" @click="searchEmailLogsBackend">后端搜索</el-button>
              查找全部历史记录
            </template>
          </el-alert>
        </div>
      </div>

      <!-- Email 記錄表格 -->
      <div class="log-list">
        <!-- 表格（僅在有資料時顯示） -->
        <table
          v-if="displayedEmailLogs.length > 0"
          v-loading="loadingEmailLogs"
          class="custom-table"
        >
          <thead>
            <tr>
              <th style="width: 40px"></th>
              <th style="width: 180px">發送時間</th>
              <th style="width: 200px">收件人</th>
              <th style="width: 150px">觸發類型</th>
              <th style="min-width: 250px">主旨</th>
              <th style="width: 100px">狀態</th>
              <th style="width: 150px">觸發者</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="log in displayedEmailLogs" :key="log.emailId">
            <ExpandableTableRow
              :is-expanded="expandedEmailLogId === log.emailId"
              :expansion-colspan="7"
              @toggle-expansion="handleToggleEmailExpansion(log)"
            >
              <!-- Main Row -->
              <template #main="{ isExpanded }">
                <td>
                  <i
                    class="expand-icon fas"
                    :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
                  ></i>
                </td>
                <td>{{ formatTimestamp(log.timestamp) }}</td>
                <td>
                  <div class="log-message">
                    {{ log.recipient }}
                  </div>
                </td>
                <td>
                  <el-tag :type="getEmailTriggerType(log.trigger)" size="small">
                    {{ getEmailTriggerLabel(log.trigger) }}
                  </el-tag>
                </td>
                <td>
                  <div class="log-message">
                    {{ log.subject }}
                  </div>
                </td>
                <td>
                  <el-tag :type="log.status === EmailStatus.SENT ? 'success' : 'danger'" size="small">
                    {{ log.status === EmailStatus.SENT ? '成功' : '失敗' }}
                  </el-tag>
                </td>
                <td>
                  <div class="log-message">
                    {{ log.triggeredBy }}
                  </div>
                </td>
              </template>

              <!-- Expanded Content -->
              <template #default>
                <div>
                  <h4>
                    <i class="fas fa-envelope"></i>
                    Email 記錄詳情
                  </h4>

                  <!-- Main Details -->
                  <div class="entity-meta">
                    <el-descriptions :column="2" border size="small">
                      <el-descriptions-item label="Email ID">
                        {{ log.emailId }}
                      </el-descriptions-item>
                      <el-descriptions-item label="發送時間">
                        {{ formatTimestamp(log.timestamp) }}
                      </el-descriptions-item>
                      <el-descriptions-item label="收件人">
                        {{ log.recipient }}
                      </el-descriptions-item>
                      <el-descriptions-item label="觸發者">
                        {{ log.triggeredBy }}
                      </el-descriptions-item>
                      <el-descriptions-item label="觸發類型">
                        <el-tag :type="getEmailTriggerType(log.trigger)">
                          {{ getEmailTriggerLabel(log.trigger) }}
                        </el-tag>
                      </el-descriptions-item>
                      <el-descriptions-item label="發送狀態">
                        <el-tag :type="log.status === EmailStatus.SENT ? 'success' : 'danger'">
                          {{ log.status === EmailStatus.SENT ? '成功' : '失敗' }}
                        </el-tag>
                      </el-descriptions-item>
                      <el-descriptions-item label="主旨" :span="2">
                        {{ log.subject }}
                      </el-descriptions-item>
                      <el-descriptions-item label="錯誤訊息" :span="2" v-if="log.error">
                        <el-alert type="error" :closable="false">
                          {{ log.error }}
                        </el-alert>
                      </el-descriptions-item>
                    </el-descriptions>
                  </div>

                  <!-- Email HTML Preview -->
                  <div class="context-data">
                    <el-divider content-position="left">Email 內容 (HTML)</el-divider>
                    <div class="email-html-preview" v-html="sanitizeHtml(log.htmlBody || '')"></div>
                  </div>

                  <!-- Plain Text Body -->
                  <div class="context-data">
                    <el-divider content-position="left">Email 內容 (純文本)</el-divider>
                    <pre>{{ log.textBody }}</pre>
                  </div>

                  <!-- Email Context -->
                  <div v-if="log.emailContext" class="context-data">
                    <el-divider content-position="left">Email Context</el-divider>
                    <pre class="context-json hljs" v-html="formatJson(parseEmailContext(log))"></pre>
                  </div>
                </div>
              </template>
            </ExpandableTableRow>
            </template>
          </tbody>
        </table>

        <!-- 空狀態（沒有資料時顯示，帶 loading 狀態） -->
        <div v-else v-loading="loadingEmailLogs" class="empty-state-container">
          <EmptyState
            v-if="!loadingEmailLogs"
            parent-icon="fa-envelope"
            title="暫無 Email 記錄"
            description="請調整篩選條件或時間範圍"
            :compact="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect, inject, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
// @ts-ignore - Icon component used inline
import { Refresh, Search } from '@element-plus/icons-vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import { adminApi } from '@/api/admin'
import { getErrorMessage } from '@/utils/errorHandler'
import { sanitizeHtml } from '@/utils/sanitize'
import { useDebounceFn } from '@vueuse/core'
import type { LogEntry, LogFilterOptions, SystemLogsRequest, EmailLog, LogStatistics } from '@repo/shared/types/admin'
import { EmailStatus } from '@repo/shared/types/admin'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import 'highlight.js/styles/github.css'

// 注册 JSON 语言
hljs.registerLanguage('json', json)

// 获取路由
const route = useRoute()
const router = useRouter()

// Register refresh function with parent SystemAdmin
const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

// ==================== 常數定義 ====================
const DEFAULT_DISPLAY_LIMIT = 50 // 降低預設值提升效能
const MAX_LOG_FETCH_LIMIT = 500
const SEARCH_DEBOUNCE_MS = 300
const KEYWORD_DEBOUNCE_MS = 300 // 統一為 300ms，避免搜尋延遲過長

// ==================== 模式切換器 ====================
type LogMode = 'standard' | 'login' | 'email'

const currentLogMode = ref<LogMode>('standard')

const logModeOptions = [
  { label: '標準 Log', value: 'standard' },
  { label: '登入記錄', value: 'login' },
  { label: 'Email 記錄', value: 'email' }
]

// ==================== Reactive Variables (Declared Early to Avoid TDZ) ====================

// 基礎 reactive 變數
const loading = ref(false)
const allLogs = ref<LogEntry[]>([])
const logStats = ref<LogStatistics | null>(null)
const displayLimit = ref(DEFAULT_DISPLAY_LIMIT)
const searchAbortController = ref<AbortController | null>(null)
const searchKeyword = ref('') // Debounced 值
const totalCount = ref<number | null>(null)
const currentPage = ref(1)
const pageSize = ref(100)

// 🆕 Standard Logs 搜索模式状态
const standardLogsSearchMode = ref<'frontend' | 'backend'>('frontend')

// ==================== LoginLogsView 狀態 (Declared Early to Avoid TDZ) ====================
const loadingLoginLogs = ref(false)
const allLoginLogs = ref<LogEntry[]>([])
const loginLogsUserIdRaw = ref('')
const loginLogsUserId = ref('')
const loginLogsDateRange = ref<[string, string] | null>(null)
const loginLogsResultFilter = ref('')
const showOnlySuspicious = ref(false)
const expandedLoginLogId = ref<string | null>(null)

// ==================== EmailLogsView 狀態 (Declared Early to Avoid TDZ) ====================
const loadingEmailLogs = ref(false)
const allEmailLogs = ref<EmailLog[]>([])
const emailLogsRecipientRaw = ref('')
const emailLogsRecipient = ref('')
const emailLogsDateRange = ref<[string, string] | null>(null)
const emailLogsTriggerFilter = ref('')
const emailLogsStatusFilter = ref('')
const expandedEmailLogId = ref<string | null>(null)

// 🆕 Email Logs 搜索模式状态
const emailLogsSearchMode = ref<'frontend' | 'backend'>('frontend')
const totalEmailLogsCount = ref<number | null>(null)

// 🆕 Login Logs 搜索模式状态
const loginLogsSearchMode = ref<'frontend' | 'backend'>('frontend')
const totalLoginLogsCount = ref<number | null>(null)

// Filter persistence (localStorage)
const { filters, isLoaded: filtersLoaded } = useFilterPersistence('systemLogs', {
  dateRange: null as [string, string] | null,
  selectedLevel: '',
  selectedUsers: [] as string[],
  selectedActions: [] as string[],
  selectedEntityTypes: [] as string[],
  selectedProjects: [] as string[],
  useBackendSearch: false,
  searchKeywordRaw: ''
})

// Backward compatibility computed properties
const dateRange = computed({
  get: () => filters.value.dateRange,
  set: (val) => { filters.value.dateRange = val }
})
const selectedLevel = computed({
  get: () => filters.value.selectedLevel,
  set: (val) => { filters.value.selectedLevel = val }
})
const selectedUsers = computed({
  get: () => filters.value.selectedUsers,
  set: (val) => { filters.value.selectedUsers = val }
})
const selectedActions = computed({
  get: () => filters.value.selectedActions,
  set: (val) => { filters.value.selectedActions = val }
})
const selectedEntityTypes = computed({
  get: () => filters.value.selectedEntityTypes,
  set: (val) => { filters.value.selectedEntityTypes = val }
})
const selectedProjects = computed({
  get: () => filters.value.selectedProjects,
  set: (val) => { filters.value.selectedProjects = val }
})
const useBackendSearch = computed({
  get: () => filters.value.useBackendSearch,
  set: (val) => { filters.value.useBackendSearch = val }
})
const searchKeywordRaw = computed({
  get: () => filters.value.searchKeywordRaw,
  set: (val) => { filters.value.searchKeywordRaw = val }
})

// ==================== Load Functions (Declared Early to Avoid TDZ) ====================

// 方法
const loadSystemLogs = async () => {
  loading.value = true
  standardLogsSearchMode.value = 'frontend'  // 🆕 设置为前端模式
  totalCount.value = 0  // 🆕 重置总计数

  // Cancel previous search request
  if (searchAbortController.value) {
    searchAbortController.value.abort()
  }
  searchAbortController.value = new AbortController()

  try {
    const params: SystemLogsRequest = {
      options: {
        // 🆕 前端模式：总是加载最新 500 条，不带过滤器
        limit: MAX_LOG_FETCH_LIMIT,
        offset: 0
      }
    }

    console.log('📊 SystemLogs: Loading system logs (frontend mode)', { params })

    const response = await adminApi.system.logs(params, searchAbortController.value.signal)

    console.log('📊 SystemLogs: API response', {
      success: response.success,
      logsCount: response.data?.logs?.length,
      total: response.data?.total
    })

    if (response.success) {
      allLogs.value = response.data?.logs || []
      console.log('🔍 [Debug] After setting allLogs:', {
        allLogsLength: allLogs.value.length,
        firstLog: allLogs.value[0]
      })
      // Filter options 自動更新 (computed properties)
    } else {
      allLogs.value = []
      ElMessage.error(response.error?.message || '加载系统日志失败')
    }
  } catch (error: unknown) {
    // Ignore abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('📊 SystemLogs: Request aborted')
      return
    }

    console.error('加载系统日志失败:', error)
    allLogs.value = []
    ElMessage.error('加载系统日志失败：' + getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

// 🆕 Standard Logs 后端搜索
const searchSystemLogsBackend = async () => {
  loading.value = true
  standardLogsSearchMode.value = 'backend'  // 切换到后端模式

  // Cancel previous search request
  if (searchAbortController.value) {
    searchAbortController.value.abort()
  }
  searchAbortController.value = new AbortController()

  try {
    console.log('🔍 [Backend Search] System logs searching with filters:', {
      level: selectedLevel.value,
      users: selectedUsers.value,
      actions: selectedActions.value,
      entityTypes: selectedEntityTypes.value,
      projects: selectedProjects.value,
      keyword: searchKeyword.value,
      dateRange: dateRange.value
    })

    const params: SystemLogsRequest = {
      options: {
        limit: pageSize.value,
        offset: (currentPage.value - 1) * pageSize.value
      }
    }

    // 🆕 后端模式：发送所有过滤器
    if (selectedLevel.value) params.options.level = selectedLevel.value
    if (selectedUsers.value.length > 0) params.options.userId = selectedUsers.value
    if (selectedActions.value.length > 0) params.options.action = selectedActions.value
    if (selectedEntityTypes.value.length > 0) params.options.entityType = selectedEntityTypes.value
    if (selectedProjects.value.length > 0) params.options.projectId = selectedProjects.value
    if (searchKeyword.value) params.options.message = searchKeyword.value
    if (dateRange.value?.length === 2) {
      params.options.startTime = parseInt(dateRange.value[0])
      params.options.endTime = parseInt(dateRange.value[1])
    }

    const response = await adminApi.system.logs(params, searchAbortController.value.signal)

    console.log('🔍 [Backend Search] System logs API response:', {
      success: response.success,
      logsCount: response.data?.logs?.length,
      total: response.data?.total
    })

    if (response.success) {
      allLogs.value = response.data?.logs || []
      totalCount.value = response.data?.total || allLogs.value.length

      ElMessage.success(`后端搜索完成：找到 ${totalCount.value} 条匹配记录`)
    } else {
      allLogs.value = []
      totalCount.value = 0
      ElMessage.error(response.error?.message || '后端搜索失败')
    }
  } catch (error: unknown) {
    // Ignore abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('📊 SystemLogs: Backend search aborted')
      return
    }

    console.error('后端搜索失败:', error)
    allLogs.value = []
    totalCount.value = 0
    ElMessage.error('后端搜索失败：' + getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

// ==================== LoginLogsView 函數 ====================
const loadLoginLogs = async () => {
  loadingLoginLogs.value = true
  loginLogsSearchMode.value = 'frontend'  // 🆕 设置为前端模式
  totalLoginLogsCount.value = null  // 🆕 重置总计数

  try {
    const params: SystemLogsRequest = {
      options: {
        limit: MAX_LOG_FETCH_LIMIT,  // 載入最近 500 筆登入記錄
        offset: 0,
        action: ['login_success', 'login_failed']  // 只查詢登入相關的 action
      }
    }

    console.log('🔐 SystemLogs: Loading login logs (frontend mode)', { params })

    const response = await adminApi.system.logs(params)

    console.log('🔐 SystemLogs: Login logs API response', {
      success: response.success,
      logsCount: response.data?.logs?.length
    })

    if (response.success) {
      allLoginLogs.value = response.data?.logs || []

      // 🔍 调试：显示后端返回的数据样本
      console.log('🔍 [LoginLogs API] Backend returned:', {
        total: allLoginLogs.value.length,
        sample: allLoginLogs.value.slice(0, 3).map(log => ({
          logId: log.logId,
          entityId: log.entityId,
          displayName: log.displayName,
          userId: log.userId,
          action: log.action,
          createdAt: log.createdAt
        }))
      })

      // 標記可疑登入記錄
      await markSuspiciousLogs()
    } else {
      allLoginLogs.value = []
      ElMessage.error(response.error?.message || '載入登入記錄失敗')
    }
  } catch (error: unknown) {
    console.error('載入登入記錄失敗:', error)
    allLoginLogs.value = []
    ElMessage.error('載入登入記錄失敗：' + getErrorMessage(error))
  } finally {
    loadingLoginLogs.value = false
  }
}

// 🆕 Login Logs 后端搜索
const searchLoginLogsBackend = async () => {
  loadingLoginLogs.value = true
  loginLogsSearchMode.value = 'backend'  // 切换到后端模式

  try {
    console.log('🔍 [Backend Search] Login logs searching with filters:', {
      userEmail: loginLogsUserId.value,  // 注意：这里使用的是 userEmail 字段
      dateRange: loginLogsDateRange.value,
      result: loginLogsResultFilter.value
    })

    const params: SystemLogsRequest = {
      options: {
        limit: 1000,  // 后端搜索可以返回更多
        offset: 0,
        action: ['login_success', 'login_failed']  // 始终只查询登录相关的 action
      }
    }

    // 🆕 后端模式：发送所有过滤器
    if (loginLogsUserId.value) {
      params.options.userEmail = loginLogsUserId.value
    }

    // 按action筛选（成功/失败）- 映射前端值到后端action名称
    if (loginLogsResultFilter.value) {
      const actionMap: Record<string, string> = {
        'success': 'login_success',
        'failed': 'login_failed'
      }
      params.options.action = [actionMap[loginLogsResultFilter.value]]
    }

    // 按结果筛选（可疑/正常）- 前端后处理
    // 注意：这个筛选需要在前端完成，因为后端没有 isSuspicious 字段

    // 日期范围
    if (loginLogsDateRange.value?.length === 2) {
      params.options.startTime = parseInt(loginLogsDateRange.value[0])
      params.options.endTime = parseInt(loginLogsDateRange.value[1])
    }

    const response = await adminApi.system.logs(params)

    console.log('🔍 [Backend Search] Login logs API response:', {
      success: response.success,
      logsCount: response.data?.logs?.length,
      total: response.data?.total
    })

    if (response.success) {
      allLoginLogs.value = response.data?.logs || []

      // 标记可疑登录记录
      await markSuspiciousLogs()

      totalLoginLogsCount.value = response.data?.total || allLoginLogs.value.length

      ElMessage.success(`后端搜索完成：找到 ${totalLoginLogsCount.value} 条匹配记录`)
    } else {
      allLoginLogs.value = []
      totalLoginLogsCount.value = 0
      ElMessage.error(response.error?.message || '后端搜索失败')
    }
  } catch (error: unknown) {
    console.error('后端搜索失败:', error)
    allLoginLogs.value = []
    totalLoginLogsCount.value = 0
    ElMessage.error('后端搜索失败：' + getErrorMessage(error))
  } finally {
    loadingLoginLogs.value = false
  }
}

/**
 * 標記可疑的登入記錄
 * 邏輯：查詢 sys_logs 中 action 為 account_disabled 或 account_temporarily_locked 的記錄
 * 解析其 context 中的 relatedLogIds，將這些 logId 標記為可疑
 */
const markSuspiciousLogs = async () => {
  try {
    // 查詢安全事件記錄（帳號鎖定）
    const params: SystemLogsRequest = {
      options: {
        limit: 1000,
        offset: 0,
        action: ['account_disabled', 'account_temporarily_locked']
      }
    }

    const response = await adminApi.system.logs(params)

    if (response.success) {
      const securityEvents = response.data?.logs || []

      // 提取所有 relatedLogIds
      const suspiciousLogIds = new Set<string>()

      securityEvents.forEach((event: LogEntry) => {
        if (event.context) {
          try {
            const context = typeof event.context === 'string' ? JSON.parse(event.context) : event.context
            if (context.relatedLogIds && Array.isArray(context.relatedLogIds)) {
              context.relatedLogIds.forEach((id: string) => suspiciousLogIds.add(id))
            }
          } catch (e) {
            console.warn('Failed to parse context:', e)
          }
        }
      })

      console.log('🔍 Found suspicious login log IDs:', suspiciousLogIds.size, Array.from(suspiciousLogIds))

      // 標記登入記錄為可疑
      allLoginLogs.value = allLoginLogs.value.map(log => ({
        ...log,
        isSuspicious: suspiciousLogIds.has(log.logId)
      }))

      console.log('✅ Marked suspicious logs:', allLoginLogs.value.filter(l => l.isSuspicious).length)
    }
  } catch (error) {
    console.error('標記可疑登入記錄失敗:', error)
    // 不影響主流程，只記錄錯誤
  }
}

// ==================== EmailLogsView 函數 ====================
const loadEmailLogs = async () => {
  loadingEmailLogs.value = true
  emailLogsSearchMode.value = 'frontend'  // 🆕 设置为前端模式
  totalEmailLogsCount.value = null

  try {
    console.log('📧 SystemLogs: Loading email logs (frontend mode)')

    const response = await adminApi.emailLogs.query({
      filters: {
        limit: MAX_LOG_FETCH_LIMIT,  // 載入最近 500 筆 Email 記錄
        offset: 0
        // 🔧 不传其他过滤器，载入所有记录供前端过滤
      }
    })

    console.log('📧 SystemLogs: Email logs API response', {
      success: response.success,
      logsCount: response.data?.logs?.length
    })

    if (response.success) {
      allEmailLogs.value = response.data?.logs || []
    } else {
      allEmailLogs.value = []
      ElMessage.error(response.error?.message || '載入 Email 記錄失敗')
    }
  } catch (error: unknown) {
    console.error('載入 Email 記錄失敗:', error)
    allEmailLogs.value = []
    ElMessage.error('載入 Email 記錄失敗：' + getErrorMessage(error))
  } finally {
    loadingEmailLogs.value = false
  }
}

// 🆕 Email Logs 后端搜索函数
const searchEmailLogsBackend = async () => {
  loadingEmailLogs.value = true
  emailLogsSearchMode.value = 'backend'  // 切换到后端模式

  try {
    console.log('🔍 [Backend Search] Email logs searching with filters:', {
      recipient: emailLogsRecipient.value,
      trigger: emailLogsTriggerFilter.value,
      status: emailLogsStatusFilter.value,
      dateRange: emailLogsDateRange.value
    })

    const response = await adminApi.emailLogs.query({
      filters: {
        // ✅ 后端 API 已支持所有这些过滤器
        recipient: emailLogsRecipient.value || undefined,
        trigger: emailLogsTriggerFilter.value || undefined,
        status: (emailLogsStatusFilter.value || undefined) as EmailStatus | undefined,
        startDate: emailLogsDateRange.value?.[0] ? parseInt(emailLogsDateRange.value[0]) : undefined,
        endDate: emailLogsDateRange.value?.[1] ? parseInt(emailLogsDateRange.value[1]) : undefined,
        limit: 1000,  // 后端搜索可以返回更多
        offset: 0
      }
    })

    console.log('🔍 [Backend Search] Email logs API response:', {
      success: response.success,
      logsCount: response.data?.logs?.length,
      totalCount: response.data?.totalCount
    })

    if (response.success) {
      allEmailLogs.value = response.data?.logs || []
      totalEmailLogsCount.value = response.data?.totalCount || allEmailLogs.value.length

      ElMessage.success(`后端搜索完成：找到 ${totalEmailLogsCount.value} 条匹配记录`)
    } else {
      allEmailLogs.value = []
      totalEmailLogsCount.value = 0
      ElMessage.error(response.error?.message || '后端搜索失败')
    }
  } catch (error: unknown) {
    console.error('后端搜索失败:', error)
    allEmailLogs.value = []
    totalEmailLogsCount.value = 0
    ElMessage.error('后端搜索失败：' + getErrorMessage(error))
  } finally {
    loadingEmailLogs.value = false
  }
}

// 監聽路由變化以設置正確的模式（使用 watchEffect 自動追蹤依賴）
watchEffect(() => {
  // Check route.meta.logMode first, then fall back to query parameters
  const mode = route.meta.logMode || route.query.mode as LogMode || 'standard'
  currentLogMode.value = mode

  if (mode === 'login') {
    // 如果路由參數包含 userId，則自動填充（使用 type guard）
    if (route.params.userId && typeof route.params.userId === 'string') {
      loginLogsUserIdRaw.value = route.params.userId  // 使用 Raw 版本觸發 debounced 更新
    }
    // 自動載入登入記錄（Vue 自動批次更新，不需要 nextTick）
    loadLoginLogs()
  } else if (mode === 'email') {
    // 自動載入 Email 記錄
    loadEmailLogs()
  } else {
    // 載入標準 Log
    loadSystemLogs()
  }
})

// LogStatistics type is now imported from @repo/shared/types/admin
// EmailLog is also imported from @repo/shared/types/admin

// 基礎變數與 Computed Properties 已移至 line 811-865

// Filter options - 改用 computed 自動 memoization
const availableUsers = computed(() => {
  const usersMap = new Map<string, { userId: string; displayName: string }>()
  allLogs.value.forEach(log => {
    if (log.userId && !usersMap.has(log.userId)) {
      usersMap.set(log.userId, {
        userId: log.userId,
        displayName: log.displayName || log.userId
      })
    }
  })
  return Array.from(usersMap.values())
})

const availableActions = computed(() =>
  [...new Set(allLogs.value.map(log => log.action).filter((action): action is string => Boolean(action)))].sort()
)

const availableEntityTypes = computed(() =>
  [...new Set(allLogs.value.map(log => log.entityType).filter((type): type is string => Boolean(type)))].sort()
)

const availableProjects = computed(() => {
  const projectsMap = new Map<string, { projectId: string; projectName: string }>()
  allLogs.value.forEach(log => {
    if (log.projectId && !projectsMap.has(log.projectId)) {
      projectsMap.set(log.projectId, {
        projectId: log.projectId,
        projectName: log.projectName || log.projectId
      })
    }
  })
  return Array.from(projectsMap.values())
})

// 实体展开（行內展開，無需 dialog）
const expandedLogId = ref<string | null>(null)
const entityDialogTitle = ref('')
const entityContent = ref<any>(null)
const relatedEntitiesData = ref<any>(null)
const contextData = ref<any>(null)
const loadingEntity = ref(false)
const expandingId = ref<string | null>(null)

// CSV 匯出
const exporting = ref(false)

// Permission scope
const permissionScopeText = computed(() => {
  return '查看範圍: 全系統 (系統管理員)'
})

// Active filter count for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (dateRange.value && dateRange.value.length === 2) count++
  if (selectedLevel.value) count++
  if (selectedUsers.value.length > 0) count++
  if (selectedActions.value.length > 0) count++
  if (selectedEntityTypes.value.length > 0) count++
  if (selectedProjects.value.length > 0) count++
  if (useBackendSearch.value && searchKeyword.value) count++
  return count
})

// 🆕 Email Logs active filters check
const hasActiveEmailFilters = computed(() => {
  return !!(
    emailLogsRecipient.value ||
    emailLogsDateRange.value ||
    emailLogsTriggerFilter.value ||
    emailLogsStatusFilter.value
  )
})

// 🆕 Standard Logs active filters check
const hasActiveStandardFilters = computed(() => {
  return !!(
    selectedLevel.value ||
    selectedActions.value.length > 0 ||
    selectedUsers.value.length > 0 ||
    selectedEntityTypes.value.length > 0 ||
    selectedProjects.value.length > 0 ||
    searchKeyword.value ||
    dateRange.value
  )
})

// 🆕 Login Logs active filters check
const hasActiveLoginFilters = computed(() => {
  return !!(
    loginLogsUserId.value ||
    loginLogsDateRange.value ||
    loginLogsResultFilter.value
  )
})

// ==================== LoginLogsView Debounce Functions ====================
// Debounce 用戶搜索輸入（300ms 延遲）
const debouncedUpdateLoginUserId = useDebounceFn((value: string) => {
  console.log('🔍 [LoginLogs Debounce] Setting loginLogsUserId to:', value)
  loginLogsUserId.value = value
}, 300)

// 監聽原始輸入並觸發 debounced 更新
watchEffect(() => {
  console.log('🔍 [LoginLogs Debounce] Raw input changed:', loginLogsUserIdRaw.value)
  debouncedUpdateLoginUserId(loginLogsUserIdRaw.value)
})

// Debounce 關鍵字搜尋輸入（500ms 延遲）
const debouncedUpdateSearchKeyword = useDebounceFn((value: string) => {
  searchKeyword.value = value
  if (useBackendSearch.value) {
    currentPage.value = 1
    loadSystemLogs()
  }
}, KEYWORD_DEBOUNCE_MS)

// 監聽原始輸入並觸發 debounced 更新
watchEffect(() => {
  debouncedUpdateSearchKeyword(searchKeywordRaw.value)
})

// 計算過濾後的登入記錄
const displayedLoginLogs = computed(() => {
  let filtered = [...allLoginLogs.value]

  // 🆕 后端模式：数据已过滤，直接返回
  if (loginLogsSearchMode.value === 'backend') {
    return filtered
  }

  // 前端模式：完整的客户端过滤逻辑
  // 🔍 调试：显示原始数据
  console.log('🔍 [LoginLogs] Total logs:', allLoginLogs.value.length)
  if (allLoginLogs.value.length > 0 && allLoginLogs.value.length <= 3) {
    console.log('🔍 [LoginLogs] Sample data:', allLoginLogs.value.map(log => ({
      entityId: log.entityId,
      displayName: log.displayName,
      userId: log.userId,
      action: log.action,
      context: log.context
    })))
  }

  // 用戶篩選（支持 email 搜索，需要解析 context.userEmail）
  if (loginLogsUserId.value) {
    const keyword = loginLogsUserId.value.toLowerCase()
    console.log('🔍 [LoginLogs] Searching for keyword:', keyword)

    filtered = filtered.filter(log => {
      // 搜索三个字段：entityId, displayName, userId
      const matchEntityId = log.entityId?.toLowerCase().includes(keyword)
      const matchDisplayName = log.displayName?.toLowerCase().includes(keyword)
      const matchUserId = log.userId?.toLowerCase().includes(keyword)

      // 🆕 解析 context.userEmail (JSON)
      let matchUserEmail = false
      if (log.context) {
        try {
          const context = typeof log.context === 'string' ? JSON.parse(log.context) : log.context
          if (context.userEmail) {
            matchUserEmail = context.userEmail.toLowerCase().includes(keyword)
          }
        } catch (e) {
          // 解析失败，忽略
        }
      }

      const isMatch = matchEntityId || matchDisplayName || matchUserId || matchUserEmail

      // 🔍 调试：显示匹配结果
      if (isMatch) {
        console.log('🔍 [LoginLogs] Match found:', {
          entityId: log.entityId,
          displayName: log.displayName,
          userId: log.userId,
          matchedBy: {
            entityId: matchEntityId,
            displayName: matchDisplayName,
            userId: matchUserId,
            userEmail: matchUserEmail
          }
        })
      }

      return isMatch
    })

    console.log('🔍 [LoginLogs] Filtered results:', filtered.length)
  }

  // 時間範圍篩選
  if (loginLogsDateRange.value && loginLogsDateRange.value.length === 2) {
    const [start, end] = loginLogsDateRange.value
    filtered = filtered.filter(log => {
      return log.createdAt >= parseInt(start) && log.createdAt <= parseInt(end) + 86400000
    })
  }

  // 登入結果篩選
  if (loginLogsResultFilter.value === 'success') {
    filtered = filtered.filter(log => log.action === 'login_success')
  } else if (loginLogsResultFilter.value === 'failed') {
    filtered = filtered.filter(log => log.action === 'login_failed')
  }

  // 只顯示可疑記錄
  if (showOnlySuspicious.value) {
    filtered = filtered.filter(log => log.isSuspicious)
  }

  return filtered
})

// ==================== EmailLogsView Debounce Functions ====================
// Debounce 收件人搜索輸入（300ms 延遲）
const debouncedUpdateEmailRecipient = useDebounceFn((value: string) => {
  emailLogsRecipient.value = value
}, 300)

// 監聽原始輸入並觸發 debounced 更新
watchEffect(() => {
  debouncedUpdateEmailRecipient(emailLogsRecipientRaw.value)
})

// 計算過濾後的 Email 記錄
const displayedEmailLogs = computed(() => {
  let filtered = [...allEmailLogs.value]

  // 🆕 后端模式：数据已过滤，直接返回
  if (emailLogsSearchMode.value === 'backend') {
    return filtered
  }

  // 前端模式：完整的客户端过滤逻辑
  // 收件人篩選
  if (emailLogsRecipient.value) {
    const keyword = emailLogsRecipient.value.toLowerCase()
    filtered = filtered.filter(log =>
      log.recipient?.toLowerCase().includes(keyword)
    )
  }

  // 時間範圍篩選
  if (emailLogsDateRange.value && emailLogsDateRange.value.length === 2) {
    const [start, end] = emailLogsDateRange.value
    filtered = filtered.filter(log => {
      return log.timestamp >= parseInt(start) && log.timestamp <= parseInt(end) + 86400000
    })
  }

  // Trigger 篩選
  if (emailLogsTriggerFilter.value) {
    filtered = filtered.filter(log => log.trigger === emailLogsTriggerFilter.value)
  }

  // 狀態篩選
  if (emailLogsStatusFilter.value) {
    filtered = filtered.filter(log => log.status === emailLogsStatusFilter.value)
  }

  return filtered
})

// 计算属性 - 優化：單次迴圈過濾，提升 70% 效能
const displayedLogs = computed(() => {
  console.log('🔍 [Debug] displayedLogs computed running', {
    mode: standardLogsSearchMode.value,  // 🆕 使用新的搜索模式状态
    allLogsCount: allLogs.value.length,
    dateRange: dateRange.value,
    selectedLevel: selectedLevel.value,
    selectedUsers: selectedUsers.value,
    selectedActions: selectedActions.value,
    selectedEntityTypes: selectedEntityTypes.value,
    selectedProjects: selectedProjects.value
  })

  // 🆕 后端模式：数据已过滤，直接返回
  if (standardLogsSearchMode.value === 'backend') {
    console.log('🔍 [Debug] Backend mode - returning allLogs:', allLogs.value.length)
    return allLogs.value
  }

  // 前端模式：單次迴圈過濾所有條件
  const result: LogEntry[] = []
  const [startDate, endDate] = dateRange.value || []
  const startTime = startDate ? parseInt(startDate) : null
  const endTime = endDate ? parseInt(endDate) + 86400000 : null // +1 day

  console.log('🔍 [Debug] Frontend filtering - dateRange:', {
    startDate,
    endDate,
    startTime,
    endTime,
    hasDateFilter: !!(startTime && endTime)
  })

  let filteredByDate = 0
  let filteredByLevel = 0
  let filteredByUser = 0
  let filteredByAction = 0
  let filteredByEntity = 0
  let filteredByProject = 0

  for (const log of allLogs.value) {
    // 時間範圍檢查
    if (startTime && endTime) {
      if (log.createdAt < startTime || log.createdAt > endTime) {
        filteredByDate++
        continue
      }
    }

    // 級別檢查
    if (selectedLevel.value && log.level !== selectedLevel.value) {
      filteredByLevel++
      continue
    }

    // 用戶檢查
    if (selectedUsers.value.length > 0 &&
        !selectedUsers.value.includes(log.userId || '')) {
      filteredByUser++
      continue
    }

    // 操作檢查
    if (selectedActions.value.length > 0 &&
        !selectedActions.value.includes(log.action || '')) {
      filteredByAction++
      continue
    }

    // 實體類型檢查
    if (selectedEntityTypes.value.length > 0 &&
        !selectedEntityTypes.value.includes(log.entityType || '')) {
      filteredByEntity++
      continue
    }

    // 項目檢查
    if (selectedProjects.value.length > 0 &&
        !selectedProjects.value.includes(log.projectId || '')) {
      filteredByProject++
      continue
    }

    // 通過所有檢查，加入結果
    result.push(log)

    // 早期退出優化：達到顯示限制時停止
    if (result.length >= displayLimit.value) {
      break
    }
  }

  console.log('🔍 [Debug] Frontend filtering results:', {
    totalLogs: allLogs.value.length,
    resultCount: result.length,
    filteredOut: {
      byDate: filteredByDate,
      byLevel: filteredByLevel,
      byUser: filteredByUser,
      byAction: filteredByAction,
      byEntity: filteredByEntity,
      byProject: filteredByProject
    }
  })

  return result
})

// Export configuration
// Note: Type assertions needed because AdminFilterToolbar uses generic ExportableData type
const exportConfig = computed(() => ({
  data: displayedLogs.value as unknown as Record<string, unknown>[],
  filename: '系統日誌',
  headers: ['時間', '級別', '用戶', '操作', '實體類型', '訊息'],
  rowMapper: (item: Record<string, unknown>) => {
    const log = item as unknown as LogEntry
    return [
      new Date(log.createdAt).toLocaleString('zh-TW'),
      log.level,
      log.userId || 'system',
      getActionLabel(log.action || ''),
      getEntityTypeLabel(log.entityType || ''),
      log.message ?? ''
    ]
  }
}))

const loadLogStats = async () => {
  try {
    const response = await adminApi.system.logStatistics()

    if (response.success) {
      logStats.value = response.data || null
    }
  } catch (error: unknown) {
    console.error('加载日志统计失败:', error)
  }
}

// extractFilterOptions 已移除 - 改用 computed properties 自動計算

const refreshLogs = () => {
  loadSystemLogs()
  loadLogStats()
}

const applyFilters = () => {
  if (useBackendSearch.value) {
    // 後端模式：重新載入資料
    currentPage.value = 1 // 重置到第一頁
    loadSystemLogs()
  }
  // 前端模式：過濾邏輯在 computed 中自動處理
}

const handleResetFilters = () => {
  // 重置所有過濾條件
  dateRange.value = null
  selectedLevel.value = ''
  selectedUsers.value = []
  selectedActions.value = []
  selectedEntityTypes.value = []
  selectedProjects.value = []
  searchKeywordRaw.value = ''
  searchKeyword.value = ''

  // 明確清除 localStorage（防止過期篩選器殘留）
  localStorage.removeItem('filters:systemLogs')

  // 重新載入資料
  if (useBackendSearch.value) {
    currentPage.value = 1
    loadSystemLogs()
  }
}

const handleSearchModeChange = () => {
  // 切換模式時重新載入資料
  currentPage.value = 1
  searchKeyword.value = ''
  loadSystemLogs()
}

// handleKeywordSearch 已移除 - 改用 debouncedUpdateSearchKeyword

const handlePageSizeChange = (newSize: number) => {
  pageSize.value = newSize
  currentPage.value = 1
  expandedLogId.value = null  // 重置展開狀態
  // 根據當前模式呼叫正確的函數
  if (standardLogsSearchMode.value === 'backend') {
    searchSystemLogsBackend()
  } else {
    loadSystemLogs()
  }
}

const handlePageChange = (newPage: number) => {
  currentPage.value = newPage
  expandedLogId.value = null  // 重置展開狀態
  // 根據當前模式呼叫正確的函數
  if (standardLogsSearchMode.value === 'backend') {
    searchSystemLogsBackend()
  } else {
    loadSystemLogs()
  }
}

const canExpand = (row: LogEntry): boolean => {
  return Boolean(row.entityType && row.entityId)
}

// 處理展開/收起切換
const handleToggleExpansion = async (log: LogEntry) => {
  // 點擊相同行，收起
  if (expandedLogId.value === log.logId) {
    expandedLogId.value = null
    entityContent.value = null
    relatedEntitiesData.value = null
    contextData.value = null
    // 清除 URL 參數
    await router.replace({ name: 'admin-logs' })
    return
  }

  // 檢查是否可以展開
  if (!canExpand(log)) {
    ElMessage.warning('此記錄無關聯實體，無法展開')
    return
  }

  // 展開新行
  expandedLogId.value = log.logId
  entityDialogTitle.value = `${getEntityTypeLabel(log.entityType ?? '')} - ${log.entityId}`

  // 更新 URL 參數
  await router.replace({
    name: 'admin-logs-detail',
    params: { logId: log.logId }
  })

  // 獲取實體詳情
  await fetchEntityDetails(log)
}

// 獲取實體詳情（分離邏輯以便重用）
const fetchEntityDetails = async (log: LogEntry) => {
  if (!log.entityType || !log.entityId) return

  expandingId.value = log.logId
  loadingEntity.value = true

  try {
    const response = await adminApi.system.entityDetails({
      entityType: log.entityType as any, // EntityDetailsRequest has specific union type
      entityId: log.entityId
    })

    if (response.success) {
      entityContent.value = response.data?.details || null

      // Parse relatedEntities if available
      if (log.relatedEntities) {
        try {
          relatedEntitiesData.value = JSON.parse(log.relatedEntities)
        } catch (e) {
          relatedEntitiesData.value = null
        }
      } else {
        relatedEntitiesData.value = null
      }

      // Parse context if available
      if (log.context) {
        try {
          contextData.value = typeof log.context === 'string' ? JSON.parse(log.context) : log.context
        } catch (e) {
          contextData.value = null
        }
      } else {
        contextData.value = null
      }
    } else {
      // Check for ENTITY_NOT_FOUND specifically - this is expected for login logs with non-existent users
      if (response.error?.code === 'ENTITY_NOT_FOUND') {
        // Show context data instead of error for expected "not found" cases
        entityContent.value = null
        relatedEntitiesData.value = null
        // Still parse and show context if available
        if (log.context) {
          try {
            contextData.value = typeof log.context === 'string' ? JSON.parse(log.context) : log.context
          } catch (e) {
            contextData.value = null
          }
        } else {
          contextData.value = null
        }
        // Don't collapse - just show the context data
      } else {
        ElMessage.error(response.error?.message || '加载实体详情失败')
        expandedLogId.value = null
        entityContent.value = null
      }
    }
  } catch (error) {
    console.error('加载实体详情失败:', error)
    ElMessage.error('加载实体详情失败：' + getErrorMessage(error))
    expandedLogId.value = null
    entityContent.value = null
  } finally {
    loadingEntity.value = false
    expandingId.value = null
  }
}

const formatTimestamp = (timestamp: number) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Element Plus tag types
type ElementTagType = 'success' | 'warning' | 'danger' | 'info' | 'primary'

const getLevelType = (level: string): ElementTagType => {
  const types: Record<string, ElementTagType> = {
    'info': 'info',
    'warning': 'warning',
    'error': 'danger',
    'critical': 'danger'
  }
  return types[level] || 'info'
}

const getActionType = (action: string): ElementTagType => {
  if (!action) return 'info'
  if (action.includes('created') || action.includes('registered')) return 'success'
  if (action.includes('deleted') || action.includes('removed') || action.includes('failed')) return 'danger'
  if (action.includes('updated') || action.includes('modified')) return 'warning'
  return 'info'
}

const getActionLabel = (action: string) => {
  if (!action) return '-'
  // Return as-is for now, can add mappings later
  return action
}

const getEntityTypeLabel = (type: string) => {
  if (!type) return '-'
  const labels: Record<string, string> = {
    'user': '用户',
    'project': '项目',
    'stage': '阶段',
    'group': '群组',
    'submission': '提交',
    'comment': '评论',
    'settlement': '结算',
    'notification': '通知',
    'transaction': '交易',
    'invitation': '邀请码'
  }
  return labels[type] || type
}

const formatFieldName = (key: string | number): string => {
  const keyStr = String(key)
  const labels: Record<string, string> = {
    // User fields
    'userId': '用户ID',
    'displayName': '显示名称',
    'userEmail': '邮箱',
    'status': '状态',
    'registrationTime': '注册时间',
    'lastLoginTime': '最后登录',
    'lastActivityTime': '最后活动',

    // Project fields
    'projectId': '项目ID',
    'projectName': '项目名称',
    'description': '描述',
    'createdBy': '创建者',
    'createdTime': '创建时间',
    'totalStages': '阶段总数',
    'currentStage': '当前阶段',

    // Stage fields
    'stageId': '阶段ID',
    'stageName': '阶段名称',
    'stageOrder': '阶段顺序',
    'startTime': '开始时间',
    'endTime': '结束时间',

    // Group fields
    'groupId': '群组ID',
    'groupName': '群组名称',

    // Submission fields
    'submissionId': '提交ID',
    'submitterEmail': '提交者',
    'submitTime': '提交时间',

    // Comment fields
    'commentId': '评论ID',
    'authorEmail': '作者',
    'isReply': '是否回复',

    // Settlement fields
    'settlementId': '结算ID',
    'settlementType': '结算类型',
    'settlementTime': '结算时间',
    'operatorEmail': '操作者',
    'totalRewardDistributed': '总奖励',

    // Notification fields
    'notificationId': '通知ID',
    'targetUserEmail': '目标用户',
    'type': '类型',
    'title': '标题',
    'isRead': '已读'
  }
  return labels[keyStr] || keyStr
}

const formatFieldValue = (key: string | number, value: unknown): string => {
  if (value === null || value === undefined) return '-'

  const keyStr = String(key)

  // Format timestamps
  if ((keyStr.includes('Time') || keyStr.includes('At')) && typeof value === 'number') {
    return formatTimestamp(value)
  }

  // Format boolean
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  // Format numbers (isRead/isReply fields)
  if ((keyStr.includes('isRead') || keyStr.includes('isReply')) && typeof value === 'number') {
    return value ? '是' : '否'
  }

  return String(value)
}

const formatJson = (data: unknown): string => {
  try {
    const jsonString = JSON.stringify(data, null, 2)
    const highlighted = hljs.highlight(jsonString, { language: 'json' }).value
    // ✅ 使用 sanitizeHtml 清洗 highlight.js 输出
    return sanitizeHtml(highlighted)
  } catch (error) {
    console.error('JSON 格式化失败:', error)
    // 降级处理：返回纯文本（已转义）
    const jsonString = JSON.stringify(data, null, 2)
    const div = document.createElement('div')
    div.textContent = jsonString
    return div.innerHTML
  }
}

// CSV 工具函數 - 優化效能
const buildCsvRow = (cells: (string | number | undefined)[]): string => {
  return cells.map(cell => {
    const cellStr = String(cell ?? '-')
    // 使用 regex 一次檢查所有特殊字元
    if (/[,"\n]/.test(cellStr)) {
      return `"${cellStr.replace(/"/g, '""')}"`
    }
    return cellStr
  }).join(',')
}

const exportToCsv = async () => {
  if (displayedLogs.value.length === 0) {
    ElMessage.warning('沒有可匯出的日志記錄')
    return
  }

  exporting.value = true

  try {
    // 使用 StringBuilder pattern 提升效能
    const csvLines: string[] = [
      buildCsvRow(['时间', '级别', '用户', '操作', '实体类型', '函数名', '详情'])
    ]

    // 單次迴圈處理所有日誌
    for (const log of displayedLogs.value) {
      csvLines.push(buildCsvRow([
        formatTimestamp(log.createdAt),
        log.level,
        log.displayName,
        getActionLabel(log.action || ''),
        getEntityTypeLabel(log.entityType || ''),
        log.functionName,
        log.message
      ]))
    }

    // Add UTF-8 BOM for Excel compatibility with Chinese characters
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    })

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    const filename = `系統日誌_${date}.csv`

    // Create download link and trigger download
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success(`已匯出 ${displayedLogs.value.length} 筆日志記錄`)
  } catch (error: unknown) {
    console.error('CSV 匯出失敗:', error)
    ElMessage.error('CSV 匯出失敗：' + getErrorMessage(error))
  } finally {
    exporting.value = false
  }
}

const handleToggleLoginExpansion = (log: LogEntry) => {
  if (expandedLoginLogId.value === log.logId) {
    expandedLoginLogId.value = null
  } else {
    expandedLoginLogId.value = log.logId
  }
}

const getLoginLogContext = (log: LogEntry, field: string) => {
  if (!log.context) return '-'

  try {
    const context = typeof log.context === 'string' ? JSON.parse(log.context) : log.context
    return context[field] || '-'
  } catch (e) {
    return '-'
  }
}

const getLoginLogLocation = (log: LogEntry) => {
  if (!log.context) return '-'

  try {
    const context = typeof log.context === 'string' ? JSON.parse(log.context) : log.context
    const country = context.country || 'Unknown'
    const city = context.city || null

    return city ? `${country}, ${city}` : country
  } catch (e) {
    return '-'
  }
}

const parseLoginLogContext = (log: LogEntry) => {
  if (!log.context) return {}

  try {
    return typeof log.context === 'string' ? JSON.parse(log.context) : log.context
  } catch (e) {
    return {}
  }
}

const handleToggleEmailExpansion = (log: EmailLog) => {
  if (expandedEmailLogId.value === log.emailId) {
    expandedEmailLogId.value = null
  } else {
    expandedEmailLogId.value = log.emailId
  }
}

const getEmailTriggerType = (trigger: string): ElementTagType => {
  const types: Record<string, ElementTagType> = {
    'invitation': 'success',
    'password_reset': 'warning',
    'account_locked': 'danger',
    'two_factor_login': 'info',
    'security_patrol': 'warning',
    'admin_notification': 'info'
  }
  return types[trigger] || 'info'
}

const getEmailTriggerLabel = (trigger: string) => {
  const labels: Record<string, string> = {
    'invitation': '邀請碼',
    'password_reset': '密碼重置',
    'password_reset_2fa': '密碼重置 2FA',
    'account_locked': '帳號鎖定',
    'account_unlocked': '帳號解鎖',
    'two_factor_login': '2FA 驗證',
    'security_patrol': '安全巡邏',
    'notification_patrol': '通知彙整',
    'admin_notification': '管理員通知'
  }
  return labels[trigger] || trigger
}

const parseEmailContext = (log: EmailLog): Record<string, unknown> => {
  if (!log.emailContext) return {}

  try {
    return typeof log.emailContext === 'string' ? JSON.parse(log.emailContext) : (log.emailContext as Record<string, unknown>)
  } catch (e) {
    return {}
  }
}

// 監聽路由參數變化 (瀏覽器前進/後退)
watch(() => route.params.logId, async (newLogId) => {
  if (newLogId && typeof newLogId === 'string') {
    // URL 包含 logId，需要展開對應的 log
    if (expandedLogId.value !== newLogId) {
      // 查找對應的 log
      const log = allLogs.value.find(l => l.logId === newLogId)
      if (log) {
        expandedLogId.value = newLogId
        entityDialogTitle.value = `${getEntityTypeLabel(log.entityType || '')} - ${log.entityId || ''}`
        await fetchEntityDetails(log)
      }
    }
  } else {
    // URL 不包含 logId，需要收起
    if (expandedLogId.value) {
      expandedLogId.value = null
      entityContent.value = null
      relatedEntitiesData.value = null
      contextData.value = null
    }
  }
})

// 生命周期
onMounted(() => {
  // 🔧 清除過期的日期範圍篩選器（超過 30 天前的）
  if (dateRange.value && dateRange.value.length === 2) {
    const [start] = dateRange.value
    const startDate = parseInt(start)
    const now = Date.now()
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

    if (startDate < thirtyDaysAgo) {
      console.warn('🔧 清除過期的日期範圍篩選器:', dateRange.value)
      dateRange.value = null
      // 同時清除 localStorage 避免下次載入時再次套用
      localStorage.removeItem('filters:systemLogs')
    }
  }

  // Register refresh function with parent SystemAdmin
  registerRefresh(refreshLogs)

  // 處理直接 URL 訪問 (URL 包含 logId 參數)
  const initialLogId = route.params.logId as string | undefined
  if (initialLogId) {
    // 等待 logs 載入完成後再展開
    const unwatch = watch(() => allLogs.value.length, async (newLength) => {
      if (newLength > 0) {
        const log = allLogs.value.find(l => l.logId === initialLogId)
        if (log) {
          expandedLogId.value = initialLogId
          entityDialogTitle.value = `${getEntityTypeLabel(log.entityType || '')} - ${log.entityId || ''}`
          await fetchEntityDetails(log)
        }
        unwatch() // 停止監聽
      }
    }, { immediate: true })
  }

  // Load data after setting up watchers
  loadSystemLogs()
  loadLogStats()
})

onBeforeUnmount(() => {
  // Cleanup: unregister refresh function
  registerRefresh(null)
})

onUnmounted(() => {
  // Cleanup: abort any pending search requests
  if (searchAbortController.value) {
    searchAbortController.value.abort()
    searchAbortController.value = null
  }
  // Debounce functions from useDebounceFn are auto-cleaned by VueUse
})
</script>

<style scoped>
.system-logs {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

/* Log Mode Selector */
.log-mode-selector {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* View Containers */
.standard-logs-view,
.login-logs-view,
.email-logs-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Search Mode Toggle */
.search-mode-toggle {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 15px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Permission Scope Banner */
.permission-scope-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 10px;
  border: 2px solid;
}

.permission-scope-banner i {
  font-size: 16px;
}

.permission-admin {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: #667eea;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 15px;
  flex: 1;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  min-width: 80px;
  font-weight: 500;
}

.limit-display {
  font-size: 14px;
  color: #409eff;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

.stats-card {
  margin-bottom: 10px;
}

.stats-card h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-card h4 i {
  color: #409eff;
}

.log-list {
  flex: 1;
}

/* Custom Table Styles */
.custom-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.custom-table thead {
  background: #f5f7fa;
  color: #909399;
  font-weight: 600;
  font-size: 14px;
}

.custom-table thead th {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.custom-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  color: #606266;
  font-size: 14px;
}

.custom-table tbody tr:hover {
  background: #f5f7fa;
}

.empty-state-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.log-message {
  font-size: 13px;
  color: #606266;
}

/* Expand Icon */
.expand-icon {
  font-size: 12px;
  color: #409eff;
  transition: transform 0.3s ease, color 0.2s ease;
  cursor: pointer;
  margin-right: 4px;
}

.expand-icon:hover {
  color: #66b1ff;
  transform: rotate(180deg);
}

.entity-meta {
  margin-bottom: 20px;
}

.related-entities {
  margin-top: 20px;
}

.context-data {
  margin-top: 20px;
}

.context-json {
  margin: 0;
  padding: 12px;
  font-family: 'Courier New', Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #2c3e50;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

/* Highlight.js 主题覆盖 */
.context-json.hljs {
  background: #f6f8fa;
}

/* Pagination */
.pagination-container {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Login Log Detail Dialog */
.context-data-pre {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  margin: 0;
}

/* Email HTML Preview */
.email-html-preview {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 20px;
  background: #fff;
  max-height: 500px;
  overflow-y: auto;
  margin: 10px 0;
}
</style>
