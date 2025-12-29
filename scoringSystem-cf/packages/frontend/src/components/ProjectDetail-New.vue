<!-- 此文件是 ProjectDetail.vue 的 Composition API 重構版本 -->
<!-- Phase 4.7 - Vue 3 Composition API 遷移 -->

<template>
  <div class="dashboard">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="page-title">
        <div class="title-with-refresh">
          <h2>{{ projectTitle || '載入中...' }}</h2>

          <!-- 融合的重新整理按鈕（智能主題 + 翻轉動畫）-->
          <CountdownButton
            ref="refreshButtonRef"
            plain
            size="small"
            type="primary"
            :duration="refreshDuration"
            :loading="loading"
            :auto-start="!isInitialLoading"
            :full-width="false"
            :disabled="isInitialLoading"
            :theme-color="'#000000'"
            :flip-at="'end'"
            :external-progress="loadingProgress"
            @click="handleRefresh"
            @complete="handleRefresh"
          >
            <template #default="{
              isActive,
              timeLeft,
              progressPercentage,
              loading: btnLoading,
              disabled,
              themeColor,
              contrastColor
            }">
              <!-- 初次載入狀態（disabled=true）-->
              <span v-if="disabled" class="blend-text">
                {{ getLoadingText(loadingProgress) }} {{ loadingProgress }}%
              </span>

              <!-- 倒計時狀態（disabled=false）-->
              <template v-else>
                <!-- Loading Spinner -->
                <template v-if="btnLoading">
                  <i class="fa fa-spinner fa-spin"></i>
                  <span>重新整理中...</span>
                </template>

                <!-- 正常倒計時 -->
                <span v-else class="blend-text">
                  <i class="fa fa-refresh" :class="{ 'fa-spin-once': isActive && timeLeft > 295 }"></i>
                  重新整理
                  <span v-if="isActive" class="countdown-time">
                    ({{ formatTime(timeLeft) }})
                  </span>
                </span>
              </template>
            </template>
          </CountdownButton>

          <el-button
            plain
            size="small"
            @click="showEventLogDrawer = true"
            class="project-event-log-button"
          >
            <i class="fa fa-history"></i> 專案事件檢視
          </el-button>
        </div>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        :project-id="projectId"
        :project-permission="permissions.permissionLevel?.value ?? 'none'"
        :available-roles="roleSwitch.availableRoles.value"
        :current-role="roleSwitch.currentRole.value"
        :wealth-rankings="wealthRankings"
        @user-command="emit('user-command', $event)"
        @role-change="roleSwitch.switchRole"
      />
    </div>

    <!-- Gantt Chart Drawer (非 HUD - 熱帶風格配色) -->
    <DrawerContainer
      v-model="ganttDrawerOpen"
      drawer-name="階段時間軸"
      theme-color="#1ABC9C"
      max-height="400px"
      :condition="stages.length > 0"
    >
      <StageGanttChart
        :stages="ganttChartStages"
        :enable-drag="true"
        :show-minimap="true"
        :height="320"
      />
    </DrawerContainer>

    <!-- Project Description Drawer (非 HUD - 熱帶風格配色) -->
    <DrawerContainer
      v-model="projectDescriptionDrawerOpen"
      drawer-name="專案介紹"
      theme-color="#9B59B6"
      max-height="500px"
      :condition="!!projectData?.project"
    >
      <div class="project-description-content">
        <!-- 評分參數統計區 -->
        <div class="scoring-params-section">
          <h4 class="section-title">
            <i class="fas fa-sliders-h"></i> 專案評分設定
          </h4>
          <el-row :gutter="12" class="scoring-stats-row">
            <el-col :xs="12" :sm="8" :md="4">
              <el-statistic title="階段報告老師評分權重" :value="teacherRankingWeight * 100" :precision="0">
                <template #suffix>%</template>
                <template #prefix><i class="fas fa-chalkboard-teacher"></i></template>
              </el-statistic>
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <el-statistic title="階段報告學生評分權重" :value="studentRankingWeight * 100" :precision="0">
                <template #suffix>%</template>
                <template #prefix><i class="fas fa-users"></i></template>
              </el-statistic>
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <el-statistic title="評論獎勵模式" :value="(commentRewardModeText as any)">
                <template #prefix><i class="fas fa-comments"></i></template>
              </el-statistic>
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <el-statistic title="百分制轉換最小值" :value="scoreRangeMin">
                <template #prefix><i class="fas fa-arrow-down"></i></template>
              </el-statistic>
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <el-statistic title="百分制轉換最大值" :value="scoreRangeMax">
                <template #prefix><i class="fas fa-arrow-up"></i></template>
              </el-statistic>
            </el-col>
          </el-row>
        </div>

        <!-- 分隔線 -->
        <el-divider v-if="projectDescription" />

        <!-- 專案描述 -->
        <MarkdownViewer v-if="projectDescription" :content="projectDescription" />
      </div>
    </DrawerContainer>

    <!-- 階段訊息抽屜（最下方的抽屜）-->
    <DrawerContainer
      v-if="stageInfoDrawer.activeDrawerStageId.value"
      v-model="stageInfoDrawer.stageDrawerOpen.value"
      drawer-name="當前階段"
      :theme-color="drawerColor"
      :stage-status="currentDrawerStage?.status"
      :max-height="drawerMaxHeight"
      role="region"
      aria-live="polite"
      :aria-label="`${currentDrawerStage?.title} 階段資訊與快速操作`"
    >
      <!-- Trigger Bar（關閉狀態）-->
      <template #trigger>
        <i class="fa fa-chevron-down"></i>
        <span>
          {{ drawerStatusText }} [按這裡展開抽屜]
        </span>
        <i class="fa fa-chevron-down"></i>
      </template>

      <!-- 緊湊型 Windows 8 Tile HUD -->
      <transition name="fade" mode="out-in">
        <div :key="stageInfoDrawer.activeDrawerStageId.value" class="stage-hud-compact">
          <!-- 統計區：2x2 Grid (手機) / 4x1 Grid (桌面) -->
          <div class="hud-stats-grid">
            <!-- Tile 1: 階段名稱 + 描述按鈕 -->
            <div class="hud-tile tile-stage">
              <i class="fas fa-flag-checkered"></i>
              <span class="tile-text">{{ currentDrawerStage?.title }}</span>
              <el-tooltip content="查看階段描述" placement="top">
                <el-button
                  class="hud-info-btn"
                  :icon="InfoFilled"
                  circle
                  size="small"
                  @click.stop="openStageDescriptionDrawer(currentDrawerStage as ExtendedStage)"
                />
              </el-tooltip>
            </div>

            <!-- Tile 2: 倒計時或狀態 -->
            <div v-if="stageCountdown" class="hud-tile tile-time" :class="{ urgent: isUrgent }">
              <i class="fas fa-clock"></i>
              <span class="tile-text">{{ stageCountdown }}</span>
            </div>
            <div v-else class="hud-tile tile-status">
              <i class="fas fa-info-circle"></i>
              <span class="tile-text">{{ drawerStatusText }}</span>
            </div>

            <!-- Tile 3: 報告獎金 -->
            <div class="hud-tile tile-report">
              <i class="fas fa-file-alt"></i>
              <span class="tile-text">
                <span class="tile-label">報告</span>
                <span class="tile-value">{{ currentDrawerStage?.reportReward ?? '-' }}</span>
              </span>
            </div>

            <!-- Tile 4: 評論獎金 -->
            <div class="hud-tile tile-comment">
              <i class="fas fa-comment-dots"></i>
              <span class="tile-text">
                <span class="tile-label">評論</span>
                <span class="tile-value">{{ currentDrawerStage?.commentReward ?? '-' }}</span>
              </span>
            </div>
          </div>

          <!-- Actions 區：底部橫排 -->
          <div class="hud-actions-row">
            <!-- 報告模式按鈕 -->
            <el-button
              v-if="!currentDrawerStage?.viewMode && currentDrawerStage?.status === 'active' && canSubmit"
              type="primary"
              size="small"
              @click="handleReportAction(currentDrawerStage)"
            >
              <i class="fas fa-rocket"></i>
              {{ getReportButtonText(currentDrawerStage) }}
            </el-button>

            <!-- 評論模式按鈕 -->
            <el-button
              v-if="currentDrawerStage?.viewMode && canComment && (currentDrawerStage?.status === 'active' || canManageStages)"
              type="success"
              size="small"
              @click="handleOpenSubmitCommentModal(currentDrawerStage)"
            >
              <i class="fas fa-comment"></i>
              張貼評論
            </el-button>

            <!-- 成果投票按鈕 -->
            <el-button
              v-if="currentDrawerStage?.status === 'voting' && canVote"
              type="danger"
              size="small"
              @click="openVoteResultModal(currentDrawerStage)"
            >
              <i class="fas fa-vote-yea"></i>
              成果投票
            </el-button>

            <!-- 評論投票按鈕 -->
            <el-button
              v-if="currentDrawerStage?.status === 'voting' && canVote && userHasValidCommentInStage(currentDrawerStage)"
              type="danger"
              size="small"
              @click="modalManager.openCommentVoteModal(currentDrawerStage)"
            >
              <i class="fas fa-comment-dots"></i>
              評論投票
            </el-button>

            <!-- 教師投票按鈕 -->
            <el-button
              v-if="currentDrawerStage?.status === 'voting' && canTeacherVote"
              type="warning"
              size="small"
              @click="modalManager.openTeacherVoteModal(currentDrawerStage)"
              :disabled="loadingTeacherVoteData"
            >
              <i v-if="loadingTeacherVoteData" class="fas fa-spinner fa-spin"></i>
              <i v-else class="fas fa-chalkboard-teacher"></i>
              教師投票
            </el-button>

            <!-- 獎金分配 Dropdown -->
            <el-dropdown
              v-if="currentDrawerStage?.status === 'completed'"
              trigger="click"
              @command="handleAnalysisCommand($event, currentDrawerStage)"
              :disabled="loadingVotingAnalysis"
            >
              <el-button type="info" size="small" :disabled="loadingVotingAnalysis">
                <i v-if="loadingVotingAnalysis" class="fas fa-spinner fa-spin"></i>
                <i v-else class="fas fa-chart-pie"></i>
                獎金分配
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="report">
                    <i class="fas fa-file-alt"></i> 互評獎金分配
                  </el-dropdown-item>
                  <el-dropdown-item command="comment">
                    <i class="fas fa-comments"></i> 評論獎金分配
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </transition>

      <!-- Handle Bar（展開狀態）-->
      <template #handle>
        <i class="fa fa-chevron-up"></i>
        <span>
          {{ drawerStatusText }} [按這裡收起抽屜]
        </span>
        <i class="fa fa-chevron-up"></i>
      </template>
    </DrawerContainer>

    <!-- 無階段提示 -->
    <EmptyState
      v-if="!loading && stages.length === 0"
      :icons="['fa-face-dizzy', 'fa-face-sad-tear', 'fa-face-meh']"
      parent-icon="fa-list-check"
      title="本專案目前沒有任何階段"
      description="請聯繫專案管理員添加階段"
    />

    <div v-if="stages.length > 0" class="main-content" v-loading="loading" element-loading-text="載入專案資料中...">
      <div class="content-area">
        <!-- 時間軸導航 -->
        <StageTimeline
          :stages="timelineStages"
          :current-stage-id="currentStageId"
          @stage-clicked="scrollToStage"
          @stage-changed="handleStageChanged"
        />

        <div class="project-detail">
          <!-- 專案階段區域 -->
          <div
            class="stage-section"
            :class="[
              `status-${stage.status}`,
              {
                'stage-pending': stage.status === 'pending',
                'stage-completed': stage.status === 'completed'
              }
            ]"
            v-for="stage in stages"
            :key="stage.id"
            :id="`stage-${stage.id}`"
          >
            <!-- 頂部哨兵：用於 HUD 碰撞檢測 -->
            <div :id="`sentinel-top-${stage.id}`" class="stage-sentinel stage-sentinel-top"></div>

            <!-- 第一行：階段狀態 + 工具控制 -->
            <div class="stage-header-bar" :class="`status-${stage.status}`">
              <!-- 左側：狀態區域 -->
              <div class="stage-status-area">
                <!-- 小螢幕：圖示 + 截斷標題 -->
                <el-tooltip :content="getStatusTooltip(stage as any)" placement="top" class="mobile-status-icon">
                  <span class="status-icon" :class="`status-${stage.status}`">
                    <i :class="getStatusIcon(stage.status)"></i>
                  </span>
                </el-tooltip>
                <span class="mobile-title">{{ truncateTitle(stage.title, 5) }}</span>

                <!-- 桌面：文字狀態（含期限 tooltip） -->
                <div class="desktop-status">
                  <el-tooltip
                    v-if="stage.status === 'pending'"
                    :content="`階段將於 ${formatDate(stage.startTime ?? undefined)} 開始`"
                    placement="top"
                  >
                    <span>尚未開始</span>
                  </el-tooltip>

                  <el-tooltip
                    v-else-if="stage.status === 'active'"
                    :content="`截止時間：${formatDate(stage.deadline)}`"
                    placement="top"
                  >
                    <span>進行中</span>
                  </el-tooltip>

                  <el-tooltip
                    v-else-if="stage.status === 'voting'"
                    :content="stage.endTime
                      ? `投票階段開始於 ${formatDate(stage.endTime)}，老師會手動結算`
                      : '將由教師手動結算'"
                    placement="top"
                  >
                    <span>投票中</span>
                  </el-tooltip>

                  <el-tooltip
                    v-else-if="stage.status === 'settling'"
                    content="正在結算獎金，請稍候..."
                    placement="top"
                  >
                    <span>結算中</span>
                  </el-tooltip>

                  <span v-else-if="stage.status === 'completed'">已完成</span>
                  <span v-else-if="stage.status === 'archived'">已封存</span>
                  <span v-else>{{ stage.status }}</span>
                </div>
              </div>

              <!-- 右側：工具按鈕 + 桌面操作按鈕 -->
              <div class="stage-controls">
                <!-- 工具按鈕群組（所有螢幕） -->
                <div class="stage-utility-controls">
                  <!-- 視圖切換 -->
                  <StageViewToggle
                    v-model="stage.viewMode"
                    :refreshing="stage.refreshing"
                    :mention-count="stageMentionCounts.get(stage.id) || 0"
                    :disabled="isInitialLoading"
                    @update:model-value="handleStageViewModeChange(stage as any, $event)"
                    @refresh="refreshStageContent(stage as any)"
                  />
                  <!-- 階段時間軸切換按鈕 -->
                  <button
                    class="btn btn-timeline"
                    :disabled="isInitialLoading"
                    @click="toggleStageTimeline(stage as any)"
                    :title="stageTimelinesVisible.get(stage.id) ? '隱藏階段時間軸' : '顯示階段時間軸'"
                  >
                    <i class="fa fa-timeline"></i>
                  </button>
                  <!-- 小螢幕專用：階段資訊按鈕 -->
                  <button
                    class="btn btn-info mobile-only"
                    :disabled="isInitialLoading"
                    @click="openStageDescriptionDrawer(stage as any)"
                    title="檢視階段詳情與獎勵"
                  >
                    <i class="fa fa-info-circle"></i>
                  </button>
                </div>

                <!-- 桌面操作按鈕群組（桌面版顯示） -->
                <div class="desktop-action-controls">
                  <!-- 提交報告按鈕 -->
                  <button
                    v-if="stage.status === 'active' && canSubmit"
                    class="btn btn-primary"
                    @click="handleReportAction(stage as any)"
                    :disabled="isInitialLoading"
                  >
                    {{ getReportButtonText(stage as any) }}
                  </button>

                  <!-- 張貼評論按鈕 -->
                  <button
                    v-if="canComment && (stage.status === 'active' || canManageStages)"
                    class="btn btn-tertiary"
                    @click="handleOpenSubmitCommentModal(stage as any)"
                    :disabled="isInitialLoading"
                  >
                    張貼評論
                  </button>

                  <!-- 學生互評投票按鈕 -->
                  <button
                    v-if="stage.status === 'voting' && canVote"
                    class="btn btn-secondary"
                    @click="openVoteResultModal(stage as any)"
                    :disabled="isInitialLoading"
                  >
                    階段成果投票
                  </button>

                  <!-- 教師投票按鈕 -->
                  <button
                    v-if="stage.status === 'voting' && canTeacherVote"
                    class="btn btn-secondary"
                    @click="modalManager.openTeacherVoteModal(stage as any)"
                    :disabled="loadingTeacherVoteData || isInitialLoading"
                  >
                    <i v-if="loadingTeacherVoteData" class="fas fa-spinner fa-spin"></i>
                    {{ loadingTeacherVoteData ? '載入中...' : '教師投票' }}
                  </button>

                  <!-- 評論投票按鈕 -->
                  <button
                    v-if="stage.status === 'voting' && canVote && userHasValidCommentInStage(stage)"
                    class="btn btn-quaternary"
                    :disabled="isInitialLoading"
                    @click="modalManager.openCommentVoteModal(stage as any)"
                  >
                    評論投票
                  </button>

                  <!-- 查看獎金分配 Dropdown -->
                  <el-dropdown
                    v-if="stage.status === 'completed'"
                    trigger="click"
                    @command="handleAnalysisCommand($event, stage as any)"
                    :disabled="loadingVotingAnalysis || isInitialLoading"
                  >
                    <button class="btn btn-dark" :disabled="loadingVotingAnalysis || isInitialLoading">
                      <i v-if="loadingVotingAnalysis" class="fas fa-spinner fa-spin"></i>
                      <i v-else class="fas fa-chart-pie"></i>
                      {{ loadingVotingAnalysis ? '載入中...' : '查看獎金分配' }} <i class="el-icon-arrow-down el-icon--right"></i>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="report">
                          <i class="fas fa-file-alt"></i> 互評獎金分配
                        </el-dropdown-item>
                        <el-dropdown-item command="comment">
                          <i class="fas fa-comments"></i> 評論獎金分配
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </div>

            <!-- 第二行：操作按鈕（小螢幕專用） -->
            <div class="stage-action-controls mobile-only" v-if="hasActionButtons(stage as any)">
              <!-- 提交報告按鈕 -->
              <button
                v-if="stage.status === 'active' && canSubmit"
                class="btn btn-primary"
                @click="handleReportAction(stage as any)"
                :disabled="isInitialLoading"
              >
                {{ getReportButtonText(stage as any) }}
              </button>

              <!-- 張貼評論按鈕 -->
              <button
                v-if="canComment && (stage.status === 'active' || canManageStages)"
                class="btn btn-tertiary"
                @click="handleOpenSubmitCommentModal(stage as any)"
                :disabled="isInitialLoading"
              >
                張貼評論
              </button>

              <!-- 學生互評投票按鈕 -->
              <button
                v-if="stage.status === 'voting' && canVote"
                class="btn btn-secondary"
                @click="openVoteResultModal(stage as any)"
                :disabled="isInitialLoading"
              >
                成果投票
              </button>

              <!-- 教師投票按鈕 -->
              <button
                v-if="stage.status === 'voting' && canTeacherVote"
                class="btn btn-secondary"
                @click="modalManager.openTeacherVoteModal(stage as any)"
                :disabled="loadingTeacherVoteData || isInitialLoading"
              >
                <i v-if="loadingTeacherVoteData" class="fas fa-spinner fa-spin"></i>
                {{ loadingTeacherVoteData ? '載入中...' : '教師投票' }}
              </button>

              <!-- 評論投票按鈕 -->
              <button
                v-if="stage.status === 'voting' && canVote && userHasValidCommentInStage(stage)"
                class="btn btn-quaternary"
                :disabled="isInitialLoading"
                @click="modalManager.openCommentVoteModal(stage as any)"
              >
                評論投票
              </button>

              <!-- 查看獎金分配 Dropdown -->
              <el-dropdown
                v-if="stage.status === 'completed'"
                trigger="click"
                @command="handleAnalysisCommand($event, stage as any)"
                :disabled="loadingVotingAnalysis || isInitialLoading"
              >
                <button class="btn btn-dark" :disabled="loadingVotingAnalysis || isInitialLoading">
                  <i v-if="loadingVotingAnalysis" class="fas fa-spinner fa-spin"></i>
                  <i v-else class="fas fa-chart-pie"></i>
                  獎金分配
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="report">
                      <i class="fas fa-file-alt"></i> 互評獎金
                    </el-dropdown-item>
                    <el-dropdown-item command="comment">
                      <i class="fas fa-comments"></i> 評論獎金
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <!-- 階段時間軸區域（可展開/收合） -->
            <transition name="stage-timeline-expand">
              <div v-if="stageTimelinesVisible.get(stage.id)" class="stage-timeline-container">
                <div v-if="loadingMilestones.get(stage.id)" class="timeline-loading">
                  <i class="fa fa-spinner fa-spin"></i> 載入時間軸數據中...
                </div>
                <StageGanttChart
                  v-else
                  :stages="getStageGanttData(stage as any)"
                  :milestones="stageMilestonesData.get(stage.id) || []"
                  :enable-drag="false"
                  :show-minimap="false"
                  :height="200"
                  :compact="true"
                  @stage-click="() => {}"
                />
              </div>
            </transition>

            <!-- 警告提示 -->
            <el-alert
              v-if="shouldShowNotSubmittedWarning(stage as any)"
              title="尚未提交成果"
              type="warning"
              description="貴組尚未提交本階段成果。請按階段右上角按鈕進行操作。"
              show-icon
              :closable="false"
              class="consensus-warning"
            />

            <!-- 投票未完成警告 -->
            <el-alert
              v-else-if="shouldShowConsensusWarning(stage as any)"
              :title="getConsensusWarningTitle(stage as any)"
              type="warning"
              :description="getConsensusWarningDescription(stage as any, stageGroupDataMap.get((stage as any).id)) + '請按階段右上角按鈕進行操作。'"
              show-icon
              :closable="false"
              class="consensus-warning"
            />

            <!-- 共識達成提示 -->
            <el-alert
              v-else-if="shouldShowConsensusSuccess(stage)"
              title="分工投票已達成共識"
              type="success"
              description="所有參與者皆已完成投票，本組報告獲得全體確認，可以繼續進行後續作業。請按階段右上角按鈕進行操作。"
              show-icon
              :closable="false"
              class="consensus-success"
            />

            <!-- 第二行：信息區 -->
            <div class="stage-info-section">
              <div class="stage-title-area">
                <h2 class="stage-title">{{ stage.title }}</h2>
                <div class="stage-description-wrapper">
                  <p class="stage-description" v-if="!stage.showFullDescription">
                    {{ truncateDescription(stage.description || '') }}
                    <button
                      v-if="shouldShowFullDescriptionButton(stage)"
                      class="btn-link"
                      @click="stage.showFullDescription = true"
                    >
                      顯示完整描述
                    </button>
                  </p>
                  <div v-else class="stage-description-full">
                    <MarkdownViewer :content="stage.description || ''" />
                    <button
                      class="btn-link"
                      @click="stage.showFullDescription = false"
                    >
                      收起描述
                    </button>
                  </div>
                </div>
              </div>

              <div class="stage-rewards">
                <div class="reward-item">
                  <span class="label">階段報告獎金</span>
                  <span class="value">{{ stage.reportReward }}</span>
                </div>
                <div class="reward-item">
                  <span class="label">階段評論獎金</span>
                  <span class="value">{{ stage.commentReward }}</span>
                </div>
              </div>
            </div>

            <!-- 小螢幕提示：引導用戶查看階段詳情 -->
            <div class="mobile-info-hint mobile-only">
              <i class="fa fa-info-circle"></i>
              請點選上方 <i class="fa fa-info-circle"></i> 按鈕檢視獎勵點數和階段描述
            </div>

            <!-- 階段成果模式：顯示學生小組列表和報告 -->
            <StageGroupSubmissions
              v-if="!stage.viewMode"
              :stage="stage"
              :current-user-group-id="groupData.currentUserGroup.value?.groupId || null"
              :project-groups="projectData?.groups || []"
              :group-approval-votes-cache="groupApprovalVotesCache"
              :project-user-groups="projectData?.userGroups || []"
              :project-users="projectData?.users || []"
              :stage-proposals="stage.proposals || []"
              :is-teacher="permissions.canManageStages.value"
              :pinned-group-id="pinnedGroupId"
              :project-id="projectId"
              @pin-group="handlePinGroup"
              @force-withdraw="(handleForceWithdraw as any)"
            />

            <!-- 階段評論模式：顯示評論區域 -->
            <div v-if="stage.viewMode" class="stage-comments-section" v-loading="stage.loadingComments" element-loading-text="載入評論資料中...">
              <StageComments
                :stage-id="stage.id"
                :project-id="projectId"
                :ref="`stageComments_${stage.id}`"
                :key="`comments_${stage.id}_${stage.commentsRefreshKey || 0}`"
                :user-email-to-display-name="userEmailToDisplayName"
                :current-user-email="user?.userEmail"
                :current-user-group-id="groupData.currentUserGroup.value?.groupId"
                :stage-status="stage.status"
                :permission-level="permissions.permissionLevel?.value ?? 'none'"
                :project-groups="projectData?.groups || []"
                @reply-comment="handleReplyComment"
              />
            </div>

            <!-- 底部哨兵：用於 HUD 碰撞檢測 -->
            <div :id="`sentinel-bottom-${stage.id}`" class="stage-sentinel stage-sentinel-bottom"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 所有彈窗組件 -->
    <template v-if="projectId && !isInitialLoading">
      <VoteResultModal
        v-model:visible="modalManager.showVoteResultModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :vote-data="modalManager.currentModalVoteData.value"
        :user="props.user"
        :user-group-info="modalManager.currentModalUserGroupInfo.value"
        :project-users="(projectData?.users || []) as any"
        :project-user-groups="(projectData?.userGroups || []) as any"
        @vote="handleVoteSubmit"
        @resubmit="handleResubmitRanking"
      />

      <SubmitReportModal
        v-model:visible="modalManager.showSubmitReportModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :project-title="projectTitle"
        :stage-title="currentModalStageTitle"
        :stage-description="currentModalStageDescription"
        :report-reward="currentModalStageReward"
        :current-user-email="props.user?.email || props.user?.userEmail"
        :current-group="groupData.currentUserGroup.value || undefined"
        :all-groups="projectData?.groups || []"
        :total-active-groups="modalManager.currentModalActiveGroupsCount.value"
        :total-project-groups="totalProjectGroups"
        @submit="handleReportSubmit"
      />

      <SubmitCommentModal
        v-model:visible="modalManager.showSubmitCommentModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :max-comment-selections="maxCommentSelections"
        :comment-reward-percentile="commentRewardPercentile"
        :total-valid-comment-authors="currentModalStageValidCommentAuthors"
        :project-title="projectTitle"
        :stage-title="currentModalStageTitle"
        :stage-description="currentModalStageDescription"
        :report-reward="currentModalStageReward"
        :comment-reward="currentModalStageCommentReward"
        :available-groups="projectData?.groups || []"
        :available-users="projectData?.users || []"
        :user-groups="projectData?.userGroups || []"
        :user-email-to-display-name="userEmailToDisplayName"
        :current-user="props.user"
        :stage-submissions="currentStageSubmissions"
        @submit="handleCommentSubmit"
      />

      <CommentVoteModal
        v-model:visible="modalManager.showCommentVoteModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :max-selections="maxCommentSelections"
        :comment-reward-percentile="commentRewardPercentile"
        :comment-reward="currentModalStageCommentReward"
        :user="user"
        :stage-comments="currentModalStageComments"
        @vote-submitted="handleCommentVoteSubmit"
      />

      <GroupSubmissionApprovalModal
        v-model:visible="modalManager.showGroupSubmissionApprovalModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :submission-id="modalManager.currentModalSubmissionId.value"
        :project-title="projectTitle"
        :stage-title="currentModalStageTitle"
        :stage-description="currentModalStageDescription"
        :group-members="modalManager.currentModalGroupMembers.value"
        :submission-data="modalManager.currentModalSubmissionData.value"
        :stage-reward="currentModalStageReward"
        :total-project-groups="totalProjectGroups"
        :total-active-groups="modalManager.currentModalActiveGroupsCount.value"
        :user="props.user"
        :project-users="projectData?.users || []"
        :current-group-id="groupData.currentUserGroup.value?.groupId"
        :all-groups="projectData?.groups || []"
        @vote-submitted="handleGroupApprovalVoteSubmit"
        @submission-deleted="handleSubmissionDeleted"
      />

      <TeacherRankingModal
        v-model:visible="modalManager.showTeacherRankingModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :project-title="projectTitle"
        :stage-title="currentModalStageTitle"
        :stage-groups="modalManager.currentModalStageGroups.value"
        @ranking-submitted="handleTeacherRankingSubmit"
      />

      <TeacherVoteModal
        v-model:visible="modalManager.showTeacherVoteModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :max-comment-selections="maxCommentSelections"
        :comment-reward-percentile="commentRewardPercentile"
        :project-title="projectTitle"
        :stage-title="currentModalStageTitle"
        :stage-groups="modalManager.currentModalStageGroups.value"
        :cached-project-groups="projectData?.groups || []"
        :cached-submissions="currentModalStageSubmissions"
        :cached-comments="currentModalStageComments"
        @teacher-ranking-submitted="handleTeacherVoteSubmit"
      />

      <VotingAnalysisModal
        v-model:visible="modalManager.showVotingAnalysisModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :stage-title="currentModalStageTitle"
        :is-settled="modalManager.currentModalStageIsSettled.value"
      />

      <CommentVotingAnalysisModal
        v-model:visible="modalManager.showCommentVotingAnalysisModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :max-comment-selections="maxCommentSelections"
        :stage-title="currentModalStageTitle"
        :is-settled="modalManager.currentModalStageIsSettled.value"
      />

      <ReplyCommentDrawer
        v-model:visible="modalManager.showReplyCommentModal.value"
        :project-id="projectId"
        :stage-id="modalManager.currentModalStageId.value"
        :original-comment="modalManager.currentReplyComment.value"
        :project-groups="projectData?.groups || []"
        :project-users="projectData?.users || []"
        @reply-submitted="handleReplySubmitted"
      />

    </template>

    <!-- Stage Description Drawer -->
    <StageDescriptionDrawer
      v-model:visible="stageDescriptionDrawerOpen"
      :stage-name="selectedStageForDescription?.title || ''"
      :stage-description="selectedStageForDescription?.description || ''"
      :stage-status="selectedStageForDescription?.status"
      :report-reward="selectedStageForDescription?.reportReward"
      :comment-reward="selectedStageForDescription?.commentReward"
    />

    <!-- Event Log Drawer -->
    <EventLogDrawer
      v-model="showEventLogDrawer"
      :project="(eventLogProject as any)"
      :user-mode="true"
    />

    <!-- Tutorial Drawer -->
    <TutorialDrawer page="projectDetail" />

    <!-- Force Withdraw Submission Drawer -->
    <ForceWithdrawSubmissionDrawer
      v-model:visible="forceWithdrawDrawerVisible"
      :submission="forceWithdrawSubmission"
      :project-id="projectId"
      :stage-name="forceWithdrawStageName"
      @withdrawn="handleForceWithdrawComplete"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * ProjectDetail.vue - Composition API 重構版本
 * Phase 4.7 - Vue 3 Composition API 遷移
 *
 * 重構內容：
 * 1. 從 Options API 遷移到 Composition API
 * 2. 提取業務邏輯到 composables
 * 3. 修復響應式依賴鏈問題
 * 4. 統一錯誤處理
 */

import { ref, reactive, computed, watch, watchEffect, onMounted, onBeforeUnmount, nextTick, provide, type Ref } from 'vue'
import type { Stage, Comment, Group, Submission, Notification } from '@/types'
import type { ExtendedStage } from '@/composables/useStageContentManagement'
import TopBarUserControls from './TopBarUserControls.vue'
import StageTimeline from './StageTimeline.vue'
import StageViewToggle from './StageViewToggle.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import StageComments from './StageComments.vue'
import StageGroupSubmissions from './StageGroupSubmissions.vue'
import DrawerContainer from './shared/DrawerContainer.vue'
import StageGanttChart from './charts/StageGanttChart.vue'
import VoteResultModal from './VoteResultModal.vue'
import SubmitReportModal from './SubmitReportModal.vue'
import SubmitCommentModal from './SubmitCommentModal.vue'
import CommentVoteModal from './CommentVoteModal.vue'
import GroupSubmissionApprovalModal from './GroupSubmissionApprovalModal.vue'
import TeacherRankingModal from './TeacherRankingModal.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import TeacherVoteModal from './TeacherVoteModal.vue'
import VotingAnalysisModal from './VotingAnalysisModal.vue'
import CommentVotingAnalysisModal from './CommentVotingAnalysisModal.vue'
import ReplyCommentDrawer from './ReplyCommentDrawer.vue'
import AvatarGroup from './common/AvatarGroup.vue'
import StatNumberDisplay from './shared/StatNumberDisplay.vue'
import EventLogDrawer from './shared/EventLogDrawer.vue'
import StageDescriptionDrawer from './shared/StageDescriptionDrawer.vue'
import TutorialDrawer from './TutorialDrawer.vue'
import ForceWithdrawSubmissionDrawer from './ForceWithdrawSubmissionDrawer.vue'
import CountdownButton from './shared/CountdownButton.vue'
import { showSuccess, showWarning, handleError, getErrorMessage } from '@/utils/errorHandler'
import dayjs from 'dayjs'
import { InfoFilled } from '@element-plus/icons-vue'
import { rpcClient } from '@/utils/rpc-client'
import { getStageColor, getStageTextColor } from '@repo/shared'

// ===== Composables =====
import { useProjectPermissions, type ProjectDataWithGroups, type UserDataWithPermissions } from '@/composables/useProjectPermissions'
import { useRoleSwitch } from '@/composables/useRoleSwitch'
import { useGroupData } from '@/composables/useGroupData'
import { useStageContentManagement } from '@/composables/useStageContentManagement'
import { useModalManager } from '@/composables/useModalManager'
import { useConsensusWarning } from '@/composables/useConsensusWarning'
import { useRoute } from 'vue-router'
import { useDataLoadingTracker } from '@/composables/useDataLoadingTracker'
import { useProjectCore, useStages, useStageComments } from '@/composables/useProjectDetail'
import { useWalletLeaderboard, extractTopWealthRankings } from '@/composables/useWallet'
import { useStageSettlementRankings, mapSettlementToGroups } from '@/composables/useSettlementData'
import { useStageInfoDrawer } from '@/composables/useStageInfoDrawer'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useRouteDrawer } from '@/composables/useRouteDrawer'
import { useAuth } from '@/composables/useAuth'
import { getUserPreferences } from '@/utils/userPreferences'
import { useQueryClient } from '@tanstack/vue-query'

// ===== Constants =====

// Scroll offset constants for stage navigation from URL
const TOPBAR_HEIGHT = 60 // TopBar height in pixels
const DRAWER_HANDLE_HEIGHT = 36 // Each drawer handle height
const SCROLL_OFFSET = TOPBAR_HEIGHT + (DRAWER_HANDLE_HEIGHT * 2) // Total: 132px

// ===== Props & Emits =====
const props = defineProps({
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
})

// Get projectId from route params
const route = useRoute()
const projectId = computed(() => {
  const param = route.params.projectId
  return Array.isArray(param) ? param[0] || '' : param || ''
})

const emit = defineEmits(['back', 'user-command'])

// ===== 基礎狀態 =====
// loading 和 projectData 現在由 TanStack Query 管理，在下方定義
const currentStageId = ref<string | null>(null)
const projectDescriptionDrawerOpen = ref(false)
const showEventLogDrawer = ref(false)
const stageDescriptionDrawerOpen = ref(false)
const selectedStageForDescription = ref<ExtendedStage | null>(null)

// ===== Force Withdraw Drawer 狀態 =====
const forceWithdrawDrawerVisible = ref(false)
const forceWithdrawSubmission = ref<{
  submissionId: string
  groupId: string
  groupName: string
  status: string
  submittedTime?: number
  createdTime?: number
  authors?: string[]
} | null>(null)
const forceWithdrawStageName = ref('')

const refreshButtonRef = ref<InstanceType<typeof CountdownButton> | null>(null)

// ===== Auto-Refresh Duration (from localStorage) =====
const { userId } = useAuth()

// ===== TanStack Query Client =====
// Initialize queryClient in setup stage for use in event handlers
const queryClient = useQueryClient()

// Read refresh timer from localStorage (default: 1800 seconds = 30 minutes)
const refreshDuration = computed(() => {
  if (!userId.value) return 1800
  const prefs = getUserPreferences(userId.value)
  return prefs.refreshTimer || 1800
})

// ===== 評分配置（從 projectData.project 直接獲取）=====
// 載入中返回預設值，資料載入後如果欄位缺失則 console.error 警告
const maxCommentSelections = computed(() => {
  // DEBUG: Log project scoring config from TanStack Query cache
  console.log('[ProjectDetail] projectData scoring config:', JSON.stringify({
    maxCommentSelections: (projectData.value?.project as any)?.maxCommentSelections,
    studentRankingWeight: (projectData.value?.project as any)?.studentRankingWeight,
    teacherRankingWeight: (projectData.value?.project as any)?.teacherRankingWeight,
    commentRewardPercentile: (projectData.value?.project as any)?.commentRewardPercentile,
  }))

  // 載入中返回預設值 3，避免 render 時報錯
  if (!projectData.value?.project) {
    return 3
  }
  const val = (projectData.value.project as any)?.maxCommentSelections
  // 資料載入後，如果欄位缺失則警告（資料完整性檢查）
  if (val === undefined || val === null) {
    console.error('maxCommentSelections not found in project data')
    return 3  // fallback
  }
  return val as number
})

const commentRewardPercentile = computed(() => {
  // 載入中返回預設值 0，避免 render 時報錯
  if (!projectData.value?.project) {
    return 0
  }
  const val = (projectData.value.project as any)?.commentRewardPercentile
  // 資料載入後，如果欄位缺失則警告（資料完整性檢查）
  if (val === undefined || val === null) {
    console.error('commentRewardPercentile not found in project data')
    return 0  // fallback
  }
  return val as number
})

const teacherRankingWeight = computed(() => {
  if (!projectData.value?.project) return 0.3
  return (projectData.value.project as any)?.teacherRankingWeight ?? 0.3
})

const studentRankingWeight = computed(() => {
  if (!projectData.value?.project) return 0.7
  return (projectData.value.project as any)?.studentRankingWeight ?? 0.7
})

const scoreRangeMin = computed(() => {
  if (!projectData.value?.project) return 0
  return (projectData.value.project as any)?.scoreRangeMin ?? 0
})

const scoreRangeMax = computed(() => {
  if (!projectData.value?.project) return 100
  return (projectData.value.project as any)?.scoreRangeMax ?? 100
})

// 評論獎勵模式描述（動態顯示）
const commentRewardModeText = computed(() => {
  const percentile = commentRewardPercentile.value
  if (percentile === 0 || percentile === null) {
    return `TOP ${maxCommentSelections.value}`
  }
  return `前 ${percentile}%`
})

// ===== Gantt Drawer 狀態 =====
const ganttDrawerOpen = ref(false)

// ===== Per-Stage Timeline 狀態 =====
// <i class="fas fa-check-circle text-success"></i> 使用 reactive() 包裹 Map，確保響應式更新
// Vue 3 無法追蹤 ref(new Map()) 的內部變化，必須使用 reactive()
const stageTimelinesVisible = reactive(new Map<string, boolean>())
const stageMilestonesData = reactive(new Map<string, any[]>())
const loadingMilestones = reactive(new Map<string, boolean>())

// ===== Mention 相關數據 =====
const userEmailToDisplayName = ref<Record<string, string>>({})

// ===== Loading 狀態 =====
// loadingVoteData 已移除 - VoteResultModal 現在使用 TanStack Query 內部管理載入狀態
const loadingTeacherVoteData = ref(false)
const loadingVotingAnalysis = ref(false)

// ===== Modal 數據 =====
const currentStageSubmissions = ref<any[]>([])

// ===== 群組投票狀態緩存 =====
// <i class="fas fa-check-circle text-success"></i> 使用 reactive() 包裹 Map，確保響應式更新
const groupApprovalVotesCache = reactive(new Map<string, any>())

// ===== 數據載入追蹤器 =====
const loadingTracker = useDataLoadingTracker()

// Provide 給子組件使用
provide('allDataLoaded', loadingTracker.allLoaded)

// ===== 初始化 Composables =====

// ===== TanStack Query - 數據載入 =====
const projectCoreQuery = useProjectCore(projectId)
const stagesQuery = useStages(projectId)

// ===== 初次載入標誌位 =====
// 兩個標誌位：
// 1. hasStartedLoading: watchEffect 已開始執行（防止重複執行）
// 2. hasCompletedLoading: 載入完成且進度條已顯示到 100%（用於 UI 切換）
const hasStartedLoading = ref(false)
const hasCompletedLoading = ref(false)

// ===== 由 TanStack Query 提供的 Computed 數據 =====
const loading = computed(() =>
  projectCoreQuery.isLoading.value || stagesQuery.isLoading.value
)

// ===== 初次載入進度計算 =====
const loadingProgress = computed(() => {
  // TanStack Query 階段
  if (projectCoreQuery.isLoading.value) {
    return 30 // 載入專案核心資料: 0-30%
  }

  if (!projectCoreQuery.isSuccess.value) {
    return 30 // 等待專案資料成功
  }

  if (stagesQuery.isLoading.value) {
    return 50 // 載入階段資料: 30-50%
  }

  if (!stagesQuery.isSuccess.value) {
    return 50 // 等待階段資料成功
  }

  // 數據處理階段（watchEffect 執行中）
  const loadingStates = loadingTracker.loadingStates.value

  if (loadingStates.size === 0) {
    // 還沒開始載入階段資料
    return 60
  }

  // 根據 loadingTracker 的狀態計算進度
  const projectCoreLoaded = !loadingStates.get('projectCore')
  const stageReportsLoaded = !loadingStates.get('stageReports')

  if (!projectCoreLoaded) {
    return 70 // 處理專案資料: 60-70%
  }

  if (!stageReportsLoaded) {
    return 85 // 載入階段報告: 70-85%
  }

  // 全部完成
  return 100
})

const isInitialLoading = computed(() => {
  // 初次載入中：hasCompletedLoading 尚未設置為 true
  return !hasCompletedLoading.value && (
    projectCoreQuery.isLoading.value ||
    stagesQuery.isLoading.value ||
    loadingTracker.loadingStates.value.size > 0
  )
})

// 監聽載入完成，添加平滑過渡效果
watch(loadingProgress, (newProgress) => {
  if (newProgress === 100 && !hasCompletedLoading.value) {
    // 進度達到 100%，稍微延遲後設置完成標誌
    setTimeout(() => {
      hasCompletedLoading.value = true
    }, 300) // 300ms 延遲讓用戶看到 100% 完成狀態
  }
}, { immediate: true })

const projectData = computed(() => projectCoreQuery.data.value)

// ===== 初始化 Composables（必須在 watch 之前，避免 TDZ 錯誤）=====

// 將 props.user 包裝成 computed ref
const userRef = computed(() => props.user)

// 角色切換管理
const roleSwitch = useRoleSwitch(
  projectId.value,
  projectData as unknown as Ref<ProjectDataWithGroups | null | undefined>,
  userRef as unknown as Ref<UserDataWithPermissions | null | undefined>
)

// 權限管理（傳入當前選擇的角色）
const permissions = useProjectPermissions(
  projectData as unknown as Ref<ProjectDataWithGroups | null | undefined>,
  userRef as unknown as Ref<UserDataWithPermissions | null | undefined>,
  roleSwitch.currentRole
)

// 群組數據
const groupData = useGroupData(
  projectData as unknown as Ref<ProjectDataWithGroups | null | undefined>,
  userRef as any
)

// 階段內容管理（必須在 watch 之前初始化）
const stageContent = useStageContentManagement(
  projectData as unknown as Ref<ProjectDataWithGroups | null | undefined>,
  computed(() => props.user) as unknown as Ref<UserDataWithPermissions | null | undefined>
)

// Modal 管理
const modalManager = useModalManager()

// 共識警告
const consensusWarning = useConsensusWarning()

// 路由 drawer 管理
const routeDrawer = useRouteDrawer()

// 階段訊息抽屜 (with URL sync)
const stageInfoDrawer = useStageInfoDrawer(projectId, TOPBAR_HEIGHT)

// ===== Stages 響應式數據 =====

// ✅ 使用 ref 而非 computed，以保持 stage 對象引用穩定（避免 loadingReports 突變被丟棄）
const stages = ref<ExtendedStage[]>([])

// 鎖定組別狀態（教師專用，跨所有階段）
const pinnedGroupId = ref<string | null>(null)

// 監聽 stagesQuery.data 變化並更新 stages（保持對象引用）
watch(
  () => stagesQuery.data.value,
  (newStagesData) => {
    if (!newStagesData) {
      if (stages.value.length > 0) {
        stages.value = []
      }
      return
    }

    const processedStages = stageContent.processStagesData(newStagesData)

    // 如果是首次載入或階段數量變化，直接替換
    if (stages.value.length === 0 || stages.value.length !== processedStages.length) {
      stages.value = processedStages
      return
    }

    // 檢查 stageIds 是否變化（判斷是否需要更新）
    const existingIds = stages.value.map(s => s.id).join(',')
    const newIds = processedStages.map(s => s.id).join(',')
    if (existingIds !== newIds) {
      stages.value = processedStages
      console.log('🔄 [stages watcher] 階段 IDs 變化，重置 stages')
      return
    }

    // 否則更新現有對象的屬性（保持引用穩定）
    // 只在真正有變化時才更新
    let hasChanges = false
    processedStages.forEach((newStage, index) => {
      const existingStage = stages.value[index]
      if (existingStage && existingStage.id === newStage.id) {
        // 檢查是否有實質變化（status, title, deadline 等）
        if (
          existingStage.status !== newStage.status ||
          existingStage.title !== newStage.title ||
          existingStage.deadline !== newStage.deadline
        ) {
          hasChanges = true

          // 保留 groups 中每個 group 的 showReport 狀態
          let preservedGroups = newStage.groups
          if (existingStage.groups && newStage.groups) {
            preservedGroups = newStage.groups.map((newGroup: any) => {
              const existingGroup = existingStage.groups?.find((g: any) => g.groupId === newGroup.groupId)
              if (existingGroup) {
                // 保留運行時狀態（showReport, approvalVotesLoading 等）
                return {
                  ...newGroup,
                  showReport: existingGroup.showReport || false,
                  approvalVotesLoading: existingGroup.approvalVotesLoading || false,
                  rankingsLoading: existingGroup.rankingsLoading || false
                }
              }
              return newGroup
            })
          }

          // 只更新基本屬性，保留 loadingReports 等運行時狀態
          Object.assign(existingStage, {
            ...newStage,
            loadingReports: existingStage.loadingReports,
            loadingComments: existingStage.loadingComments,
            refreshing: existingStage.refreshing,
            groups: preservedGroups,
            contentLoaded: existingStage.contentLoaded
          })
        }
      } else if (!existingStage || existingStage.id !== newStage.id) {
        // ID 不匹配，替換整個對象
        hasChanges = true
        stages.value[index] = newStage
      }
    })

    if (hasChanges) {
      console.log('🔄 [stages watcher] 更新 stages（檢測到變化）:', stages.value.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        loadingReports: s.loadingReports
      })))
    }
  },
  { immediate: true }
)

const projectDescription = computed(() => {
  const project = projectData.value?.project as any
  return project?.description || project?.projectDescription || ''
})

const projectTitle = computed(() => {
  const project = projectData.value?.project as any
  return project?.projectName || project?.title || ''
})

// EventLog 專案資料
const eventLogProject = computed(() => {
  if (!projectData.value?.project) return null
  return {
    ...projectData.value.project,
    projectId: projectId.value,
    projectName: projectTitle.value
  }
})

// 使用 TanStack Query 獲取財富排行榜
const leaderboardQuery = useWalletLeaderboard(projectId)

// 計算前 3% 富豪排名
const wealthRankings = computed(() => {
  const response = leaderboardQuery.data?.value
  if (!response || !response.walletData) return []
  return extractTopWealthRankings(response.walletData)
})

// ===== 響應式計算屬性（添加中間層避免依賴追蹤失效）=====

// 權限標誌（從 composable 提取，添加中間層）
const canSubmit = computed(() => permissions.canSubmit.value)
const canVote = computed(() => permissions.canVote.value)
const canComment = computed(() => permissions.canComment.value)
const canManageStages = computed(() => permissions.canManageStages.value)
const canTeacherVote = computed(() => permissions.canTeacherVote.value)
const canViewAll = computed(() => permissions.canViewAll.value)

// 計算專案總組數（active 狀態的組別）
const totalProjectGroups = computed(() => {
  if (!projectData.value?.groups) {
    console.error('❌ [totalProjectGroups] projectData.groups 為空，無法計算總組數')
    return 0  // 返回 0 讓問題暴露（slider 會顯示異常）
  }

  const activeGroups = projectData.value.groups.filter(g => g.status === 'active')

  if (activeGroups.length === 0) {
    console.warn('⚠️ [totalProjectGroups] 項目中沒有任何 active 組別')
    return 0
  }

  return activeGroups.length
})

// 🔧 修復無限循環：預計算每個 stage 的 groupData（避免在 computed 和 template 中重複調用函數）
// 將 getCurrentGroupData 的邏輯提取到 computed 中，確保響應式依賴被正確追蹤
const stageGroupDataMap = computed(() => {
  const map = new Map<string, any>()

  if (!projectData.value?.userGroups || !props.user?.userEmail) {
    return map
  }

  // 查找當前用戶的組
  const userGroup = projectData.value.userGroups.find((ug: any) =>
    ug.userEmail === props.user?.userEmail && ug.isActive
  )

  if (!userGroup) {
    return map
  }

  // 為每個 stage 計算 groupData
  stages.value.forEach((stage: ExtendedStage) => {
    if (!stage.groups) {
      map.set(stage.id, null)
      return
    }

    const groupData = stage.groups.find((g: Group) => g.groupId === userGroup.groupId) || null
    map.set(stage.id, groupData)
  })

  return map
})

// <i class="fas fa-check-circle text-success"></i> 統一計算所有警告狀態 - 一次遍歷替代三次遍歷
const stageWarningStates = computed(() => {
  const consensusWarnings = new Map<string, boolean>()
  const consensusSuccess = new Map<string, boolean>()
  const notSubmittedWarnings = new Map<string, boolean>()

  stages.value.forEach((stage: ExtendedStage) => {
    // 一次計算三種狀態
    consensusWarnings.set(
      stage.id,
      consensusWarning.shouldShowConsensusWarning(
        stage,
        hasCurrentGroupSubmitted,
        getCurrentGroupData
      )
    )

    consensusSuccess.set(
      stage.id,
      consensusWarning.shouldShowConsensusSuccess(
        stage,
        hasCurrentGroupSubmitted,
        getCurrentGroupData
      )
    )

    notSubmittedWarnings.set(
      stage.id,
      consensusWarning.shouldShowNotSubmittedWarning(
        stage,
        hasCurrentGroupSubmitted
      )
    )
  })

  return {
    consensusWarnings,
    consensusSuccess,
    notSubmittedWarnings
  }
})

// <i class="fas fa-check-circle text-success"></i> 便利存取器 - 保持向後兼容
const stageConsensusWarnings = computed(() => stageWarningStates.value.consensusWarnings)
const stageConsensusSuccess = computed(() => stageWarningStates.value.consensusSuccess)
const stageNotSubmittedWarnings = computed(() => stageWarningStates.value.notSubmittedWarnings)

// Mention badge 計數 - 計算每個階段當前用戶被 mention 的次數
const stageMentionCounts = computed(() => {
  const counts = new Map()
  const currentUserEmail = props.user?.userEmail
  const currentUserGroupId = groupData.currentUserGroup.value?.groupId

  if (!currentUserEmail) return counts

  stages.value.forEach((stage: ExtendedStage) => {
    let count = 0

    if (stage.comments && Array.isArray(stage.comments)) {
      stage.comments.forEach((comment: Comment) => {
        // <i class="fas fa-check-circle text-success"></i> JSON 已在載入時預先解析，直接使用陣列即可
        const mentionedUsers = comment.mentionedUsers || []
        const mentionedGroups = comment.mentionedGroups || []

        // 檢查是否被直接 mention（用戶級別）
        if (mentionedUsers.includes(currentUserEmail)) {
          count++
        }

        // 檢查是否透過群組被 mention（群組級別）
        if (currentUserGroupId && mentionedGroups.includes(currentUserGroupId)) {
          count++
        }
      })
    }

    counts.set(stage.id, count)
  })

  return counts
})

//  時間軸階段數據
const timelineStages = computed(() => {
  return stages.value.map((stage: ExtendedStage, index: number) => {
    let timelineStatus = 'upcoming'

    switch (stage.status) {
      case 'completed':
      case 'archived':
        timelineStatus = 'completed'
        break
      case 'active':
      case 'voting':
      case 'settling':
        timelineStatus = 'current'
        break
      case 'pending':
      default:
        timelineStatus = 'upcoming'
        break
    }

    return {
      id: stage.id,
      shortTitle: `第${index + 1}階段`,
      title: stage.title,
      status: timelineStatus,
      originalStatus: stage.status,
      startTime: stage.startTime,
      endTime: stage.endTime
    }
  })
})

// Gantt 圖表階段數據（用於用戶視圖，包含 extraTime）
const ganttChartStages = computed(() => {
  return stages.value.map((stage: ExtendedStage) => ({
    stageName: stage.title,
    startTime: stage.startTime,
    endTime: stage.endTime,
    status: stage.status,
    extraTime: stage.status === 'completed' ? (stage.settledTime || undefined) : Infinity,
    extraTimeText: stage.status === 'completed' ? '投票階段' : '投票階段將由老師手動關閉結算'
  }))
})

/**
 * 檢查用戶在指定階段是否有合格的評論（用於顯示評論投票按鈕）
 * 使用 Backend 預計算的 canBeVoted 標誌位，確保與 API 驗證邏輯一致
 *
 * canBeVoted 條件（由 Backend 計算）：
 * 1. 不是回覆評論（isReply = 0）
 * 2. 有 mentions（mentionedGroups OR mentionedUsers）
 * 3. 作者是 Group Leader/Member
 * 4. 至少有 1 個 helpful reaction
 */
function userHasValidCommentInStage(stage: ExtendedStage) {
  const currentUserEmail = props.user?.userEmail
  if (!currentUserEmail || !stage.comments || stage.comments.length === 0) {
    return false
  }

  // 使用 Backend 預計算的 canBeVoted 標誌位
  return stage.comments.some((comment: any) => {
    return comment.canBeVoted === true && comment.authorEmail === currentUserEmail
  })
}

// Modal 相關計算屬性（使用 composable 工廠函數）
const currentModalStageTitle = modalManager.useCurrentModalStageTitle(stages)
const currentModalStageReward = modalManager.useCurrentModalStageReward(stages)
const currentModalStageCommentReward = modalManager.useCurrentModalStageCommentReward(stages)

// 計算當前 modal 階段的描述
const currentModalStageDescription = computed(() => {
  const stageId = modalManager.currentModalStageId.value
  if (!stageId) return ''
  const stage = stages.value.find((s: ExtendedStage) => s.id === stageId)
  return stage?.description || ''
})

// 計算當前 modal 階段的有效評論作者數量（用於百分比模式顯示）
const currentModalStageValidCommentAuthors = computed(() => {
  const stageId = modalManager.currentModalStageId.value
  if (!stageId) return 0
  const stage = stages.value.find((s: ExtendedStage) => s.id === stageId) as ExtendedStage | undefined
  if (!stage?.comments || !Array.isArray(stage.comments)) return 0
  // 過濾有效評論（canBeVoted = true）並計算不同作者數量
  const validComments = stage.comments.filter((c: any) => c.canBeVoted === true)
  const uniqueAuthors = new Set(validComments.map((c: any) => c.authorEmail))
  return uniqueAuthors.size
})

// 計算當前 modal 階段的評論列表（傳給 CommentVoteModal / TeacherVoteModal 避免重複 API 呼叫）
const currentModalStageComments = computed(() => {
  const stageId = modalManager.currentModalStageId.value
  if (!stageId) return []
  const stage = stages.value.find((s: ExtendedStage) => s.id === stageId) as ExtendedStage | undefined
  return stage?.comments || []
})

// 計算當前 modal 階段的成果列表（傳給 TeacherVoteModal 避免重複 API 呼叫）
// 從 stage.groups 中提取有效的成果提交數據
const currentModalStageSubmissions = computed(() => {
  const stageId = modalManager.currentModalStageId.value
  if (!stageId) return []
  const stage = stages.value.find((s: ExtendedStage) => s.id === stageId) as ExtendedStage | undefined
  if (!stage?.groups) return []

  // 提取有提交記錄的組別，轉換為 TeacherVoteModal 需要的格式
  // 只包含已批准的成果，教師投票只能對已批准的成果進行排名
  return stage.groups
    .filter((g: any) => g.submissionId && g.status === 'approved')
    .map((g: any) => ({
      submissionId: g.submissionId,
      groupId: g.groupId,
      groupName: g.groupName,
      memberNames: g.memberNames || [],
      contentMarkdown: g.contentMarkdown || g.reportContent,
      submitTime: g.submitTime,
      status: g.status || 'approved'
    }))
})

// ===== 工具函數 =====

/**
 * 取得狀態對應的 FontAwesome 圖示
 */
function getStatusIcon(status: string): string {
  const iconMap: Record<string, string> = {
    'pending': 'fas fa-hourglass-start',
    'active': 'fas fa-fire',
    'voting': 'fas fa-vote-yea',
    'settling': 'fas fa-calculator',
    'completed': 'fas fa-flag-checkered',
    'archived': 'fas fa-lock',
    'paused': 'fas fa-pause-circle'
  }
  return iconMap[status] || 'fas fa-circle'
}

/**
 * 截斷標題（用於小螢幕）
 * @param title - 標題
 * @param maxLength - 最大長度（預設 5）
 */
function truncateTitle(title: string, maxLength: number = 5): string {
  if (!title) return ''
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title
}

/**
 * 檢查階段是否有操作按鈕（用於決定小螢幕第二行是否顯示）
 */
function hasActionButtons(stage: ExtendedStage): boolean {
  // 提交報告
  if (stage.status === 'active' && canSubmit.value) return true
  // 張貼評論
  if (canComment.value && (stage.status === 'active' || canManageStages.value)) return true
  // 投票相關
  if (stage.status === 'voting' && (canVote.value || canTeacherVote.value)) return true
  // 評論投票
  if (stage.status === 'voting' && canVote.value && userHasValidCommentInStage(stage)) return true
  // 獎金分配
  if (stage.status === 'completed') return true
  return false
}

/**
 * 取得狀態 tooltip 內容
 */
function getStatusTooltip(stage: ExtendedStage): string {
  switch (stage.status) {
    case 'pending':
      return `階段將於 ${formatDate(stage.startTime ?? undefined)} 開始`
    case 'active':
      return `截止時間：${formatDate(stage.deadline)}`
    case 'voting':
      return stage.endTime
        ? `投票階段開始於 ${formatDate(stage.endTime)}，老師會手動結算`
        : '將由教師手動結算'
    case 'settling':
      return '正在結算獎金，請稍候...'
    case 'completed':
      return '已完成'
    case 'archived':
      return '已封存'
    case 'paused':
      return '階段已暫停，所有操作暫時停止'
    default:
      return stage.status
  }
}

/**
 * 截斷描述文字
 */
function truncateDescription(description: string) {
  if (!description) return ''
  const plainText = description
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\[([^\]]*)\]\([^\)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '')
    .replace(/^\* /gm, '')
    .replace(/^\d+\. /gm, '')

  return plainText.length > 20 ? plainText.substring(0, 20) + '...' : plainText
}

/**
 * 判斷是否應該顯示完整描述按鈕
 */
function shouldShowFullDescriptionButton(stage: ExtendedStage) {
  if (!stage.description) return false
  if (stage.description.length > 20) return true

  const markdownPatterns = [
    /\*\*.*?\*\*/,
    /\*.*?\*/,
    /<u>.*?<\/u>/,
    /\[.*?\]\(.*?\)/,
    /!\[.*?\]\(.*?\)/,
    /^\* /m,
    /^\d+\. /m,
    /^#{1,6} /m,
    /`.*?`/,
    /```[\s\S]*?```/,
    />\s/m,
    /^\|.*\|/m,
    /---+/,
    /~~.*?~~/
  ]

  return markdownPatterns.some(pattern => pattern.test(stage.description || ''))
}

/**
 * 格式化日期
 */
function formatDate(dateString: string | number | undefined) {
  if (!dateString) return '-'
  const date = typeof dateString === 'string' ? dayjs(dateString) : dayjs(dateString)
  return date.format('YYYY/MM/DD HH:mm:ss')
}

/**
 * 格式化倒計時時間顯示
 * @param seconds - 剩餘秒數
 * @returns 格式化的時間字串（例如：4:35）
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 根據載入進度返回對應的提示文字
 * @param progress - 載入進度（0-100）
 * @returns 提示文字
 */
function getLoadingText(progress: number): string {
  if (progress < 30) {
    return '初始化'
  } else if (progress < 60) {
    return '載入專案資料'
  } else if (progress < 85) {
    return '載入階段資料'
  } else if (progress < 100) {
    return '即將完成'
  } else {
    return '載入完成'
  }
}

/**
 * 格式化成員名稱（從 composable 引用）
 */
const formatMemberNames = groupData.formatMemberNames

/**
 * 切換群組報告顯示
 */
function toggleGroupReport(group: Group) {
  // 直接修改屬性，確保響應式更新
  group.showReport = !group.showReport
}

/**
 * 切換甘特圖抽屜
 */
function toggleGanttDrawer() {
  ganttDrawerOpen.value = !ganttDrawerOpen.value
}

// ===== 動態馬路效果（階段訊息抽屜相關）=====

/**
 * 加寬階段馬路（視覺聚焦效果）
 * 當階段抽屜激活時，突出顯示當前階段
 */
const activeStageIdForRoad = ref<string | null>(null)

function widenStageRoad(stageId: string) {
  // 移除舊的 active class
  if (activeStageIdForRoad.value) {
    const oldElement = document.getElementById(`stage-${activeStageIdForRoad.value}`)
    oldElement?.classList.remove('active-stage')
  }

  // 添加新的 active class
  const newElement = document.getElementById(`stage-${stageId}`)
  newElement?.classList.add('active-stage')
  activeStageIdForRoad.value = stageId

  console.log(`🛣️ 馬路加寬：階段 ${stageId}`)
}

function resetStageRoad() {
  if (activeStageIdForRoad.value) {
    const element = document.getElementById(`stage-${activeStageIdForRoad.value}`)
    element?.classList.remove('active-stage')
    activeStageIdForRoad.value = null
    console.log('🛣️ 馬路恢復原狀')
  }
}

// ===== 階段訊息抽屜輔助函數 =====

// getStageColor 和 getStageTextColor 已從 @repo/shared 導入，不再需要本地定義

/**
 * 獲取階段狀態文字
 */
function getStageStatusText(stage?: ExtendedStage): string {
  if (!stage) return '載入中'

  const statusTextMap: Record<string, string> = {
    'pending': '階段尚未開始',
    'active': '階段進行中',
    'voting': '投票中',
    'settling': '結算中',
    'completed': '已完成',
    'archived': '已封存',
    'paused': '已暫停'
  }

  return statusTextMap[stage.status] || stage.status
}

/**
 * 截斷文字（用於抽屜中的描述）
 */
function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * 當前抽屜中的階段數據
 */
const currentDrawerStage = computed(() => {
  return stages.value.find(s => s.id === stageInfoDrawer.activeDrawerStageId.value)
})

/**
 * 抽屜顏色（響應式）
 */
const drawerColor = computed(() => {
  return getStageColor(currentDrawerStage.value?.status)
})

/**
 * 抽屜狀態文字（響應式）
 */
const drawerStatusText = computed(() => {
  return getStageStatusText(currentDrawerStage.value)
})

/**
 * 抽屜動態高度（根據按鈕數量）
 */
const drawerMaxHeight = computed(() => {
  if (!currentDrawerStage.value) return '200px'

  // 計算按鈕數量
  let buttonCount = 0

  // 報告模式
  if (!currentDrawerStage.value.viewMode) {
    if (currentDrawerStage.value.status === 'active' && canSubmit.value) {
      buttonCount++
    }
  } else {
    // 評論模式
    if (canComment.value && (currentDrawerStage.value.status === 'active' || canManageStages.value)) {
      buttonCount++
    }
  }

  // 投票按鈕
  if (currentDrawerStage.value.status === 'voting') {
    if (canVote.value) buttonCount++
    if (canTeacherVote.value) buttonCount++
  }

  const baseHeight = 140
  const perButtonHeight = 44

  return `${baseHeight + buttonCount * perButtonHeight}px`
})

/**
 * 階段倒計時（僅 active 狀態）
 * 馬力歐賽車風格 HUD 顯示
 */
const stageCountdown = computed(() => {
  if (!currentDrawerStage.value || currentDrawerStage.value.status !== 'active') {
    return null
  }

  const now = Date.now()
  const deadline = currentDrawerStage.value.deadline
  if (!deadline) return null

  const diff = deadline - now
  if (diff <= 0) return '已截止'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
})

/**
 * 組內完成狀態（該組繳交人數）
 */
const groupCompletionStatus = computed(() => {
  const stage = currentDrawerStage.value
  if (!stage) return null

  const groupData = stageGroupDataMap.value.get(stage.id)
  if (!groupData) return null

  // 根據 viewMode 計算完成人數
  const isCommentMode = stage.viewMode === true
  const completedCount = isCommentMode
    ? (groupData.commentedMembers?.length || 0)
    : (groupData.submittedMembers?.length || 0)

  const totalCount = groupData.members?.length || 0

  return { completed: completedCount, total: totalCount }
})

/**
 * 是否進入緊急狀態（剩餘時間 < 24 小時）
 */
const isUrgent = computed(() => {
  if (!currentDrawerStage.value?.deadline) return false
  if (currentDrawerStage.value.status !== 'active') return false

  const diff = currentDrawerStage.value.deadline - Date.now()
  return diff > 0 && diff < 24 * 60 * 60 * 1000
})

/**
 * 切換階段時間軸顯示
 */
async function toggleStageTimeline(stage: ExtendedStage) {
  // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
  const isVisible = stageTimelinesVisible.get(stage.id) || false

  if (!isVisible) {
    // 第一次打開時載入 milestones
    if (!stageMilestonesData.has(stage.id)) {
      await loadStageMilestones(stage)
    }
  }

  // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value，直接 set() 會觸發響應式更新
  stageTimelinesVisible.set(stage.id, !isVisible)
}

/**
 * 開啟階段說明抽屜
 */
function openStageDescriptionDrawer(stage: ExtendedStage) {
  selectedStageForDescription.value = stage
  stageDescriptionDrawerOpen.value = true
}

/**
 * 載入階段的 milestone 數據
 */
async function loadStageMilestones(stage: ExtendedStage) {
  try {
    // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
    loadingMilestones.set(stage.id, true)
    const milestones = []

    // 1. 基礎階段事件
    if (stage.startTime) {
      milestones.push({
        eventName: `${stage.title} 開始`,
        eventTick: stage.startTime,
        eventType: 'stage-timing'
      })
    }

    if (stage.endTime) {
      milestones.push({
        eventName: '投票階段開始',
        eventTick: stage.endTime,
        eventType: 'stage-timing'
      })
    }

    // 2. 提交事件（從 stage.groups 獲取）
    if (stage.groups && stage.groups.length > 0) {
      stage.groups.forEach((group: Group) => {
        if (group.submitTime) {
          milestones.push({
            eventName: `${group.groupName || '未命名組別'} 階段成果`,
            eventTick: group.submitTime,
            eventType: 'submission'
          })
        }
      })
    }

    // 3. 評論事件（從 stage.comments 獲取）
    if (stage.comments && stage.comments.length > 0) {
      stage.comments.forEach((comment: Comment) => {
        if (comment.createdTime) {
          const authorName = comment.authorEmail?.split('@')[0] || '匿名'
          milestones.push({
            eventName: `${authorName} 發表評論`,
            eventTick: comment.createdTime,
            eventType: 'comment'
          })
        }
      })
    }

    // 按時間排序
    milestones.sort((a, b) => {
      const timeA = new Date(a.eventTick).getTime()
      const timeB = new Date(b.eventTick).getTime()
      return timeA - timeB
    })

    // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
    stageMilestonesData.set(stage.id, milestones)
  } catch (error) {
    console.error('載入階段 milestones 失敗:', error)
    // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
    stageMilestonesData.set(stage.id, [])
  } finally {
    // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
    loadingMilestones.set(stage.id, false)
  }
}

/**
 * 為階段生成甘特圖的 stages 數據
 * 返回兩個 stage 物件：作業階段 + 排名投票階段
 */
function getStageGanttData(stage: ExtendedStage) {
  const stages = []

  // 1. 作業階段（startTime → endTime）
  stages.push({
    stageName: '作業階段',
    startTime: stage.startTime,
    endTime: stage.endTime,
    status: stage.status === 'pending' ? 'pending' : 'active',
    extraTime: undefined,
    extraTimeText: ''
  })

  // 2. 排名投票階段（endTime → undefined，無限延長）
  stages.push({
    stageName: '排名投票階段',
    startTime: stage.endTime,
    endTime: stage.status === 'completed' ? (stage.updatedAt || stage.endTime) : undefined, // 自動填充為最晚時間
    status: stage.status === 'voting' || stage.status === 'completed' ? 'voting' : 'pending',
    extraTime: stage.status === 'completed' ? undefined : Infinity,
    extraTimeText: stage.status === 'completed' ? '投票階段' : '投票階段將由老師手動關閉結算'
  })

  return stages
}


// ===== 階段導航 =====

/**
 * 滾動到指定階段
 * @param stageId - 階段 ID
 * @param fromUrl - 是否來自 URL（決定使用哪種偏移量）
 */
function scrollToStage(stageId: string, fromUrl = false) {
  const targetElement = document.getElementById(`stage-${stageId}`)
  if (targetElement) {
    if (fromUrl) {
      // 來自 URL：使用 132px 固定偏移（TopBar + 2 drawer handles）
      const elementPosition = targetElement.offsetTop
      const offsetPosition = elementPosition - SCROLL_OFFSET

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    } else {
      // 來自 Timeline：使用 center 對齊
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }

    // Timeline 跳轉後強制激活抽屜（用戶主動操作優先）
    nextTick(() => {
      if (stageInfoDrawer.shouldEnableDrawer(stageId)) {
        stageInfoDrawer.activateStageDrawer(stageId, true) // force = true
        widenStageRoad(stageId)
      }
    })
  }
}

/**
 * 尋找最早的執行中階段
 */
function findEarliestActiveStage() {
  const activeStages = stages.value.filter((stage: ExtendedStage) => {
    const status = stage.status
    return status === 'active' || status === 'voting'
  })

  if (activeStages.length === 0) {
    return null
  }

  if (activeStages.length === 1) {
    return activeStages[0]
  }

  return activeStages.reduce((earliest: ExtendedStage, current: ExtendedStage) => {
    const earliestStartTime = earliest.startTime || 0
    const currentStartTime = current.startTime || 0
    return currentStartTime < earliestStartTime ? current : earliest
  })
}

/**
 * 處理階段改變事件
 */
function handleStageChanged(stageId: string) {
  currentStageId.value = stageId
  console.log('當前階段已切換至:', stageId)
}

// ===== 階段內容刷新 =====

/**
 * 處理階段查看模式切換
 */
async function handleStageViewModeChange(stage: ExtendedStage, newViewMode: string) {
  console.log('=== handleStageViewModeChange 開始 ===')
  console.log(`階段: ${stage.title} (${stage.id})`)
  console.log(`切換至: ${newViewMode ? '評論模式' : '報告模式'}`)

  stage.viewMode = !!newViewMode

  if (newViewMode) {
    console.log('開始載入評論內容...')
    await stageContent.refreshStageComments(stage, projectId.value)
    console.log('評論載入完成')
  } else {
    console.log('開始載入報告內容...')
    await stageContent.refreshStageReports(stage, projectId.value)
    console.log('報告載入完成')
  }

  // 內容載入後，主動檢查是否需要啟用 HUD 抽屜
  // 解決 ResizeObserver 可能未觸發的問題
  stageInfoDrawer.checkAndActivateIfNeeded(stage.id)

  console.log('=== handleStageViewModeChange 結束 ===')
}

/**
 * 刷新階段內容（統一入口）
 */
async function refreshStageContent(stage: ExtendedStage) {
  await stageContent.refreshStageContent(stage, projectId.value)

  // 如果是 active 階段，載入共識投票狀態
  if (stage.status === 'active' && stage.groups) {
    const votePromises = stage.groups.map((group: Group) => {
      if (group.submissionId) {
        // 設置載入狀態
        group.approvalVotesLoading = true

        return loadGroupApprovalVotes(
          projectId.value,
          stage.id,
          group.submissionId,
          group.groupId
        ).finally(() => {
          group.approvalVotesLoading = false
        })
      }
    })

    await Promise.all(votePromises.filter(Boolean))
  }

  // 如果是 completed 階段，載入結算排名數據
  if (stage.status === 'completed' && stage.groups) {
    await loadStageSettlementData(stage)
  }

  // 如果是刷新評論模式，重新載入 mention 數據
  if (stage.viewMode) {
    await loadMentionData()
  }
}

// ===== 報告提交相關 =====

/**
 * 檢查當前組是否已提交報告，並返回審批狀態
 */
function hasCurrentGroupSubmitted(stage: ExtendedStage) {
  if (!stage.groups || !projectData.value?.userGroups) {
    return { submitted: false, approved: false, groupData: null }
  }

  const userGroup = projectData.value.userGroups.find((ug: any) =>
    ug.userEmail === props.user?.userEmail && ug.isActive
  )

  if (!userGroup) {
    return { submitted: false, approved: false, groupData: null }
  }

  const groupSubmission = stage.groups.find((group: Group) => group.groupId === userGroup.groupId)

  // 返回提交狀態和審批狀態
  return {
    submitted: !!groupSubmission,
    approved: groupSubmission?.votingData?.isApproved || false,
    groupData: groupSubmission
  }
}

/**
 * 獲取報告按鈕文字
 */
function getReportButtonText(stage: ExtendedStage) {
  const submissionStatus = hasCurrentGroupSubmitted(stage)

  if (submissionStatus.approved) {
    return '檢視本組共識投票'
  } else if (submissionStatus.submitted) {
    return '投票同意本組報告'
  } else {
    return '全組繳交報告'
  }
}

/**
 * 處理報告相關動作
 */
function handleReportAction(stage: ExtendedStage) {
  const submissionStatus = hasCurrentGroupSubmitted(stage)

  if (submissionStatus.approved) {
    // 已通過：打開審批模態框（只讀模式）
    openGroupSubmissionApprovalModal(stage)
  } else if (submissionStatus.submitted) {
    // 已提交未通過：打開審批投票模態框
    openGroupSubmissionApprovalModal(stage)
  } else {
    // 未提交：打開提交報告模態框
    openSubmitReportModal(stage)
  }
}

// ===== Modal 打開函數 =====

/**
 * 打開投票結果 Modal
 *
 * 優化說明：移除冗餘的 API 調用
 * - VoteResultModal 現在使用 TanStack Query (useRankingProposals hook)
 * - 資料由 Modal 內部自動載入和快取
 * - 不再需要預先載入資料
 */
function openVoteResultModal(stage: ExtendedStage) {
  // 直接開啟 Modal，無需預載入資料
  // VoteResultModal 會通過 TanStack Query 自動載入
  modalManager.openVoteResultModal(stage, null)
}

/**
 * 打開提交報告 Modal
 *
 * 優化說明：移除冗餘的 API 調用，直接從快取計算 activeGroupsCount
 * - stage.groups 已包含所有提交記錄（由 loadAllStageReports 載入）
 * - TanStack Query 自動管理 projectData 快取（組員名單）
 * - activeGroupsCount 僅用於 UI 模擬，不影響實際提交邏輯
 */
function openSubmitReportModal(stage: ExtendedStage) {
  const activeGroupsCount = stage.groups?.length || 1
  modalManager.openSubmitReportModal(stage, activeGroupsCount)
}

/**
 * 從 stage.groups 提取 participants 資料（用於 @mention 功能）
 *
 * 優化說明：
 * - stage.groups 已由 loadAllStageReports() 載入
 * - participationProposal 物件的 keys 即為參與者郵箱
 * - 無需 API 調用，直接從快取提取
 *
 * @param {ExtendedStage} stage - 階段物件
 * @returns {Array} submissions 資料（僅包含 @mention 所需的最小欄位）
 */
function extractStageParticipants(stage: ExtendedStage): any[] {
  if (!stage.groups || !Array.isArray(stage.groups)) {
    console.warn('⚠️ extractStageParticipants: stage.groups 不存在')
    return []
  }

  const result = stage.groups
    .filter(group => group.submissionId && group.participationProposal)
    .map(group => ({
      groupId: group.groupId,
      groupName: group.groupName,
      // ✅ 從 participationProposal 對象提取參與者郵箱
      participants: Object.keys(group.participationProposal || {})
    }))

  console.log('✅ 從緩存提取 participants:', {
    stageId: stage.id,
    groupsCount: result.length,
    totalParticipants: result.reduce((sum, g) => sum + g.participants.length, 0)
  })

  return result
}

/**
 * 打開群組提交確認 Modal
 */
async function openGroupSubmissionApprovalModal(stage: ExtendedStage) {
  try {
    // ✅ Phase 2 優化：移除冗餘的 refreshStageReports 調用
    // Modal 內部的 loadAllVersions 和 loadVotingHistory 會載入更完整的資料
    // stage.groups 資料已由 loadAllStageReports 預載入

    const currentGroup = groupData.getCurrentUserGroup()
    if (!currentGroup) {
      handleError('無法找到您所屬的群組', { type: 'error' })
      return
    }

    const groupSubmission = stage.groups?.find((group: Group) => group.groupId === currentGroup.groupId)
    if (!groupSubmission || !groupSubmission.submissionId) {
      handleError('無法找到本組的提交記錄', { type: 'error' })
      return
    }

    // Get participation proposal
    const participationProposal = groupSubmission.participationProposal || groupSubmission.participationPercentages || {}

    // Build group members with contribution data
    const activeMembers = projectData.value?.userGroups?.filter((ug: any) =>
      ug.groupId === currentGroup.groupId && ug.isActive
    ) || []

    const totalMembers = activeMembers.length
    const defaultContribution = totalMembers > 0 ? 100 / totalMembers : 0

    const groupMembers = activeMembers.map((ug: any) => {
      const user = projectData.value?.users?.find(u => u.userEmail === ug.userEmail)

      // Get contribution from participation proposal (convert from ratio to percentage)
      const contribution = participationProposal[ug.userEmail]
        ? participationProposal[ug.userEmail] * 100
        : defaultContribution

      return {
        userEmail: ug.userEmail,
        email: ug.userEmail,  // OurGroupChart needs 'email' field
        displayName: user?.displayName || ug.userEmail.split('@')[0],
        avatarSeed: user?.avatarSeed,
        avatarStyle: user?.avatarStyle,
        avatarOptions: user?.avatarOptions,
        contribution: contribution,  // Contribution percentage (0-100)
        points: 0  // Will be calculated below
      }
    })

    // Calculate points if we have members with valid contributions
    if (groupMembers.length > 0) {
      const totalContribution = groupMembers.reduce((sum: number, m: any) => sum + m.contribution, 0)

      // Only calculate if total contribution is approximately 100%
      if (Math.abs(totalContribution - 100) < 0.01) {
        const { calculateScoring } = usePointCalculation()

        // Assume rank 1 for preview (actual rank determined by voting)
        const scoringResult = calculateScoring(
          groupMembers,
          1,  // simulatedRank
          stage.reportReward || 1000,
          totalProjectGroups.value || 4,
          (projectData.value?.groups || []) as any,
          currentGroup.groupId as any
        )

        // Update points in groupMembers
        groupMembers.forEach((member: any) => {
          const scoringData = scoringResult.find((s: any) => s.email === member.email)
          if (scoringData) {
            member.points = scoringData.points
            member.finalWeight = scoringData.finalWeight
          }
        })
      }
    }

    const submissionData = {
      submissionId: groupSubmission.submissionId,
      participationPercentages: participationProposal,
      content: groupSubmission.reportContent,
      submitTime: groupSubmission.submitTime || groupSubmission.submittedAt
    }

    // 查詢該 stage 有多少組提交過（與 openSubmitReportModal 邏輯一致）
    const submissionsHttpResponse = await (rpcClient.submissions as any).list.$post({
      json: {
        projectId: projectId.value,
        stageId: stage.id
      }
    })
    const submissionsResponse = await submissionsHttpResponse.json()

    // ✅ 嚴格驗證 API 響應
    if (!submissionsResponse.success) {
      throw new Error(submissionsResponse.error?.message || '獲取提交數據失敗')
    }

    const activeGroupsCount = submissionsResponse.data?.activeGroupsWithSubmissions

    if (activeGroupsCount === undefined || activeGroupsCount === null) {
      throw new Error('API 返回數據不完整：缺少 activeGroupsWithSubmissions 字段')
    }

    // 設置活躍組數（用於傳遞給 GroupSubmissionApprovalModal）
    modalManager.currentModalActiveGroupsCount.value = activeGroupsCount

    modalManager.openGroupSubmissionApprovalModal(stage, submissionData, groupMembers)
  } catch (error) {
    console.error('開啟投票確認彈窗失敗:', error)
    handleError(error instanceof Error ? error : String(error), { action: '開啟投票確認彈窗' })
  }
}

// ===== 事件處理函數（因篇幅限制，部分省略，實際實現時需補全）=====

/**
 * 處理分析命令
 */
function handleAnalysisCommand(command: string, stage: ExtendedStage) {
  if (stage.status === 'completed') {
    modalManager.openAnalysisModal(command, stage)
  } else {
    showWarning('只有已結算的階段才能顯示獎金分配結果')
  }
}

/**
 * 處理報告提交
 */
async function handleReportSubmit(data: any) {
  console.log('成果提交:', data)

  if (data.success) {
    showSuccess('報告已成功提交！')

    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      currentStage.contentLoaded = false
      await stageContent.refreshStageReports(currentStage, projectId.value)
    }
  }
}

/**
 * 打開張貼評論模態框
 *
 * ✅ 優化：從 stage.groups 直接提取 participants，無需 API 調用
 * - stage.groups 已由 loadAllStageReports() 加載
 * - participationProposal 包含所有參與者郵箱
 * - 與 openSubmitReportModal 的優化保持一致
 */
function handleOpenSubmitCommentModal(stage: ExtendedStage) {
  try {
    console.log('準備打開張貼評論 Modal...')

    // ✅ 直接從緩存提取數據，無需 API 調用
    currentStageSubmissions.value = extractStageParticipants(stage)

    console.log('✅ 成功提取', currentStageSubmissions.value.length, '個 submissions（來自緩存）')

    // 打開模態框
    modalManager.openSubmitCommentModal(stage)
  } catch (error) {
    console.error('提取 participants 失敗:', error)
    handleError(error instanceof Error ? error : String(error), {
      action: '準備張貼評論',
      type: 'warning'
    })
    // 即使失敗也打開 modal，使用空陣列
    currentStageSubmissions.value = []
    modalManager.openSubmitCommentModal(stage)
  }
}

/**
 * 處理評論提交
 */
async function handleCommentSubmit(data: any) {
  console.log('評論提交:', data)

  if (data.success) {
    const targetStage = stages.value.find((stage: ExtendedStage) => stage.id === modalManager.currentModalStageId.value)
    if (targetStage) {
      console.log('找到目標階段，切換到查看評論模式:', targetStage.title)
      targetStage.viewMode = true

      await nextTick()
      await stageContent.refreshStageComments(targetStage, projectId.value)

      // 更新評論數據以刷新 mention badge
      await loadStageComments(targetStage)

      showSuccess('評論提交成功！已切換到查看評論模式')
    } else {
      console.warn('未找到目標階段:', modalManager.currentModalStageId.value)
      handleError('無法找到目標階段', { type: 'error' })
    }
  }
}

/**
 * 處理投票提交
 */
async function handleVoteSubmit(data: any) {
  console.log('報告投票提交:', data)

  if (data.success) {
    showSuccess('投票已成功提交！')

    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      await refreshStageContent(currentStage)
    }
  }
}

/**
 * 處理群組確認投票提交（優化版 - 精確緩存失效）
 */
async function handleGroupApprovalVoteSubmit(data: any) {
  try {
    if (data.success) {
      const { votingSummary } = data.data
      const currentStageId = modalManager.currentModalStageId.value

      // 顯示成功訊息
      if (votingSummary.isApproved) {
        showSuccess('投票成功！本組報告已獲得通過')
      } else {
        showSuccess(
          `投票成功！當前狀態：${votingSummary.agreeVotes}/${votingSummary.totalMembers} 人同意`
        )
      }

      // ✅ 使用 TanStack Query 的精確快取失效（替代全量刷新）
      // queryClient 已在 setup() 階段初始化，直接使用

      // 1. 失效當前階段的 submission 資料
      await queryClient.invalidateQueries({
        queryKey: ['submissions', projectId.value, currentStageId]
      })

      // 2. 失效當前階段的內容資料
      await queryClient.invalidateQueries({
        queryKey: ['project', 'content', projectId.value, currentStageId]
      })

      // 3. 如果投票導致共識達成，刷新階段列表（檢查階段狀態變化）
      if (votingSummary.isApproved) {
        await queryClient.invalidateQueries({
          queryKey: ['stages', projectId.value]
        })
      }

      // 4. 手動刷新當前階段的 groups 資料（UI 立即更新）
      const currentStage = stages.value.find((s: any) => s.id === currentStageId)
      if (currentStage) {
        await stageContent.refreshStageReports(currentStage, projectId.value)
      }

      await nextTick()
      console.log('✅ 投票完成，已精確刷新受影響的數據（僅當前階段）')
    }
  } catch (error) {
    console.error('處理投票結果失敗:', error)
    handleError(error instanceof Error ? error : String(error), { action: '處理投票結果' })
  }
}

/**
 * 處理報告刪除
 */
async function handleSubmissionDeleted() {
  try {
    showSuccess('報告已刪除，可以重新提交')
    await loadProjectData()
  } catch (error) {
    console.error('處理報告刪除失敗:', error)
    handleError(error instanceof Error ? error : String(error), { action: '處理報告刪除' })
  }
}

/**
 * 處理評論投票提交
 */
async function handleCommentVoteSubmit(data: any) {
  console.log('評論投票提交:', data)

  if (data.success) {
    showSuccess('評論投票已成功提交！')
    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      await stageContent.refreshStageComments(currentStage, projectId.value)
    }
  }
}

/**
 * 處理教師排名提交
 */
async function handleTeacherRankingSubmit(data: any) {
  console.log('教師排名提交:', data)

  if (data.success) {
    showSuccess('教師排名已成功提交！')
    await loadProjectData()
  }
}

/**
 * 處理鎖定/解鎖組別（教師專用）
 * - 鎖定時：展開所有階段該組報告
 * - 解鎖時：只清除 pinnedGroupId，不收起已展開的報告
 */
function handlePinGroup(groupId: string | null) {
  pinnedGroupId.value = groupId

  if (groupId) {
    // 鎖定時：展開所有階段中該組的報告
    stages.value.forEach(stage => {
      stage.groups?.forEach(group => {
        if (group.groupId === groupId) {
          group.showReport = true
        }
      })
    })
  }
  // 解鎖時：不做任何操作（報告保持展開）
}

/**
 * 處理強制撤回報告事件
 * 從 StageGroupSubmissions 接收 submission 資訊並打開 Drawer
 */
function handleForceWithdraw(submission: {
  submissionId: string
  groupId: string
  groupName: string
  status: string
  submittedTime?: number
  authors?: string[]
}) {
  // 找到該 submission 所屬的階段名稱
  const stage = stages.value.find(s =>
    s.groups?.some(g => g.submissionId === submission.submissionId)
  )
  forceWithdrawStageName.value = stage?.title || stage?.stageName || ''
  forceWithdrawSubmission.value = submission
  forceWithdrawDrawerVisible.value = true
}

/**
 * 處理強制撤回完成事件
 * 刷新相關階段的資料
 */
async function handleForceWithdrawComplete() {
  // 刷新所有階段的資料
  await Promise.all(
    stages.value.map(stage => refreshStageContent(stage))
  )
  showSuccess('成果已強制撤回')
}

/**
 * 處理教師投票提交
 */
async function handleTeacherVoteSubmit(data: any) {
  console.log('教師投票提交:', data)

  if (data.success) {
    showSuccess('教師投票已成功提交！')
    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      await refreshStageContent(currentStage)
      await stageContent.refreshStageComments(currentStage, projectId.value)
    }
  }
}

/**
 * 處理重新提交排名
 */
async function handleResubmitRanking(data: any) {
  console.log('重新提交排名:', data)

  if (data.success) {
    showSuccess('新排名已成功提交！')

    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      await refreshStageContent(currentStage)
    }
  }
}

/**
 * 處理回復評論
 */
function handleReplyComment(commentData: any) {
  console.log('回復評論:', commentData)

  const stageId = findStageIdFromCommentClick()
  modalManager.openReplyCommentModal(commentData, stageId || '')
}

/**
 * 處理回復提交
 */
async function handleReplySubmitted(data: any) {
  console.log('回復已提交:', data)

  if (data.success) {
    modalManager.showReplyCommentModal.value = false
    showSuccess('回覆已發送')

    const currentStage = stages.value.find((s: ExtendedStage) => s.id === modalManager.currentModalStageId.value)
    if (currentStage) {
      if (!currentStage.viewMode) {
        await handleStageViewModeChange(currentStage, 'comments')
      }

      await stageContent.refreshStageComments(currentStage, projectId.value)

      // 重新載入 mention 數據以刷新 badge
      await loadMentionData()

      await nextTick()
      const stageElement = document.getElementById(`stage-${currentStage.id}`)
      if (stageElement) {
        stageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }
    }
  } else {
    handleError('回覆提交失敗', { type: 'error' })
  }
}

/**
 * 從評論點擊中查找階段ID
 */
function findStageIdFromCommentClick() {
  for (const stage of stages.value) {
    if (stage.viewMode) {
      return stage.id
    }
  }
  return stages.value[0]?.id || null
}

// ===== 共識警告相關 =====

/**
 * 判斷是否顯示未提交警告 - 從 computed Map 中查找
 */
function shouldShowNotSubmittedWarning(stage: ExtendedStage) {
  return stageNotSubmittedWarnings.value.get(stage.id) || false
}

/**
 * 判斷是否顯示共識警告 - 從 computed Map 中查找
 */
function shouldShowConsensusWarning(stage: ExtendedStage) {
  return stageConsensusWarnings.value.get(stage.id) || false
}

/**
 * 判斷是否顯示共識成功提示 - 從 computed Map 中查找
 */
function shouldShowConsensusSuccess(stage: ExtendedStage) {
  return stageConsensusSuccess.value.get(stage.id) || false
}

/**
 * 獲取共識警告標題
 */
function getConsensusWarningTitle(stage: ExtendedStage) {
  return consensusWarning.getConsensusWarningTitle(stage as Stage)
}

/**
 * 獲取共識警告描述
 */
function getConsensusWarningDescription(stage: ExtendedStage, groupData: any) {
  return consensusWarning.getConsensusWarningDescription(stage as Stage, groupData)
}

/**
 * 獲取當前組數據
 * 🔧 修復：直接從預計算的 stageGroupDataMap 讀取，避免無限循環
 * 原本的邏輯已移至 stageGroupDataMap computed 中
 */
function getCurrentGroupData(stage: ExtendedStage) {
  return stageGroupDataMap.value.get(stage.id) || null
}

// ===== StatNumberDisplay 輔助函數 =====


// ===== 數據載入 =====

/**
 * 載入所有階段的評論（用於計算 mention badge）
 */
async function loadAllStageComments() {
  console.log('🔄 開始載入所有階段評論...')

  const commentPromises = stages.value.map(async (stage: ExtendedStage) => {
    try {
      const httpResponse = await (rpcClient.comments as any).stage.$post({
        json: {
          projectId: projectId.value,
          stageId: stage.id,
          excludeTeachers: false
        }
      })
      const response = await httpResponse.json()
      if (response.success && response.data) {
        // <i class="fas fa-check-circle text-success"></i> 預先解析 JSON 字段，避免在 computed 中重複解析
        stage.comments = (response.data.comments || []).map((comment: any) => ({
          ...comment,
          mentionedUsers: typeof comment.mentionedUsers === 'string'
            ? JSON.parse(comment.mentionedUsers)
            : (comment.mentionedUsers || []),
          mentionedGroups: typeof comment.mentionedGroups === 'string'
            ? JSON.parse(comment.mentionedGroups)
            : (comment.mentionedGroups || [])
        }))
        console.log(`✅ 階段 ${stage.id} 載入 ${stage.comments?.length ?? 0} 條評論`)
      } else {
        stage.comments = []
        console.warn(`⚠️ 階段 ${stage.id} 無評論數據`)
      }
    } catch (error) {
      console.error(`❌ 載入階段 ${stage.id} 評論失敗:`, error)
      stage.comments = []
    }
  })

  await Promise.all(commentPromises)
  console.log('✅ 所有階段評論載入完成')
}

/**
 * 載入 mention 數據（用於評論顯示和權限檢查）
 * 從 projectData 建立基礎映射，並補充缺失的用戶
 */
async function loadMentionData() {
  console.log('🔄 開始載入 mention 數據...')

  // 收集所有 mentionedUsers
  const allUserEmails = new Set()

  stages.value.forEach((stage: ExtendedStage) => {
    if (stage.comments && Array.isArray(stage.comments)) {
      stage.comments.forEach((comment: Comment) => {
        // 解析 mentionedUsers
        let mentionedUsers = []
        try {
          mentionedUsers = typeof comment.mentionedUsers === 'string'
            ? JSON.parse(comment.mentionedUsers)
            : (comment.mentionedUsers || [])
        } catch (e) {
          mentionedUsers = []
        }

        // 加入 Set
        mentionedUsers.forEach((email: string) => allUserEmails.add(email))
      })
    }
  })

  // 從現有 projectData.users 建立基礎映射
  const mapping: Record<string, string> = {}
  if (projectData.value?.users) {
    projectData.value.users.forEach(user => {
      mapping[user.userEmail] = user.displayName || user.userEmail
    })
    console.log(`📊 從 projectData 建立了 ${Object.keys(mapping).length} 位用戶的基礎映射`)
  }

  // 找出 projectData 中沒有的用戶（可能是跨專案的 @mention）
  const userEmails = Array.from(allUserEmails)
  const missingUsers = userEmails.filter(email => typeof email === 'string' && !mapping[email])

  if (missingUsers.length > 0) {
    console.log(`🔍 發現 ${missingUsers.length} 位新用戶不在 projectData 中，需要額外查詢`)
    try {
      const httpResponse = await (rpcClient.users as any)['display-names'].$post({
        json: {
          projectId: projectId.value,
          userEmails: missingUsers
        }
      })
      const response = await httpResponse.json()
      if (response.success && response.data) {
        Object.assign(mapping, response.data.userEmailToDisplayName)
        console.log(`✅ 補充載入了 ${Object.keys(response.data.userEmailToDisplayName).length} 位用戶`)
      }
    } catch (error) {
      console.error('❌ 載入用戶 displayName 失敗:', error)
    }
  }

  userEmailToDisplayName.value = mapping
  console.log(`✅ 總共建立了 ${Object.keys(mapping).length} 位用戶的 email→displayName 映射`)
}

/**
 * 載入所有階段的 ranking proposals（用於判斷未投票狀態）
 */
async function loadAllStageProposals() {
  console.log('🔄 開始載入所有階段的 ranking proposals...')

  const proposalPromises = stages.value.map(async (stage: ExtendedStage) => {
    try {
      const httpResponse = await (rpcClient.rankings as any).proposals.$post({
        json: {
          projectId: projectId.value,
          stageId: stage.id
        }
      })
      const response = await httpResponse.json()
      if (response.success && response.data) {
        stage.proposals = response.data.proposals || []
        console.log(`✅ 階段 ${stage.id} 載入 ${stage.proposals?.length ?? 0} 個 proposals`)
      } else {
        stage.proposals = []
        console.warn(`⚠️ 階段 ${stage.id} 無 proposal 數據`)
      }
    } catch (error) {
      console.error(`❌ 載入階段 ${stage.id} proposals 失敗:`, error)
      stage.proposals = []
    }
  })

  await Promise.all(proposalPromises)
  console.log('✅ 所有階段的 proposals 載入完成')
}


/**
 * 載入單一階段的評論（用於評論提交後更新）
 */
async function loadStageComments(stage: ExtendedStage) {
  try {
    const httpResponse = await (rpcClient.comments as any).stage.$post({
      json: {
        projectId: projectId.value,
        stageId: stage.id,
        excludeTeachers: false
      }
    })
    const response = await httpResponse.json()
    if (response.success && response.data) {
      // <i class="fas fa-check-circle text-success"></i> 預先解析 JSON 字段，避免在 computed 中重複解析
      stage.comments = (response.data.comments || []).map((comment: any) => ({
        ...comment,
        mentionedUsers: typeof comment.mentionedUsers === 'string'
          ? JSON.parse(comment.mentionedUsers)
          : (comment.mentionedUsers || []),
        mentionedGroups: typeof comment.mentionedGroups === 'string'
          ? JSON.parse(comment.mentionedGroups)
          : (comment.mentionedGroups || [])
      }))
      console.log(`✅ 階段 ${stage.id} 評論已更新：${stage.comments?.length ?? 0} 條`)
    }
  } catch (error) {
    console.error(`載入階段 ${stage.id} 評論失敗:`, error)
  }
}

/**
 * 載入群組的共識投票狀態（Active 階段使用）
 * @param {string} projectId
 * @param {string} stageId
 * @param {string} submissionId
 * @param {string} groupId
 * @returns {Promise<Object|null>} votingData
 */
async function loadGroupApprovalVotes(projectId: string, stageId: string, submissionId: string, groupId: string) {
  try {
    const httpResponse = await (rpcClient.submissions as any)['participation-status'].$post({
      json: {
        projectId,
        stageId,
        submissionId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      // <i class="fas fa-check-circle text-success"></i> reactive Map 不需要 .value
      // ✅ 修正：後端直接返回投票數據在 response.data，而非 response.data.votingData
      groupApprovalVotesCache.set(groupId, response.data)
      return response.data
    }
    return null
  } catch (error) {
    console.error('載入群組投票狀態失敗:', error)
    return null
  }
}

/**
 * 載入階段結算數據（completed 階段）
 *
 * 使用不可變更新模式確保 Vue 響應式系統正確追蹤變更
 *
 * @param {Object} stage - 階段物件
 */
async function loadStageSettlementData(stage: ExtendedStage) {
  const DEBUG = import.meta.env.DEV

  try {
    if (DEBUG) {
      console.log(`🔍 [loadStageSettlementData] 載入階段 ${stage.id} 的結算數據`)
    }

    // 先設置所有組的 loading 狀態（使用不可變更新）
    stage.groups = stage.groups?.map((group: Group) => ({
      ...group,
      rankingsLoading: true
    })) || []

    // 調用結算 API
    const httpResponse = await (rpcClient.settlement as any)['stage-rankings'].$post({
      json: {
        projectId: projectId.value,
        stageId: stage.id
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data && response.data.rankings) {
      if (DEBUG) {
        console.log(`✅ [loadStageSettlementData] 成功載入 ${response.data.rankings.length} 筆結算數據`)
      }

      // 使用 helper 函數映射數據到 groups（返回新數組，觸發響應式更新）
      stage.groups = mapSettlementToGroups(response.data.rankings, stage.groups)

      if (DEBUG) {
        console.log(`✅ [loadStageSettlementData] 結算數據已映射到各組`)
      }
    } else {
      console.warn('⚠️ [loadStageSettlementData] 未取得結算數據，使用預設值')

      // 通知用戶
      if (DEBUG) {
        showWarning(`未取得結算數據: ${response.error?.message || '未知錯誤'}`)
      } else {
        showWarning('未取得結算數據，請稍後再試')
      }

      // 清除 loading 狀態（使用不可變更新）
      stage.groups = stage.groups.map((group: Group) => ({
        ...group,
        rankingsLoading: false
      }))
    }
  } catch (error) {
    console.error('❌ [loadStageSettlementData] 載入結算數據失敗:', error)

    // 通知用戶錯誤
    if (DEBUG) {
      showWarning(`載入結算數據失敗: ${getErrorMessage(error)}`)
    } else {
      showWarning('載入結算數據失敗，請稍後再試')
    }

    // 發生錯誤時清除 loading 狀態（使用不可變更新）
    stage.groups = stage.groups?.map((group: Group) => ({
      ...group,
      rankingsLoading: false
    })) || []
  }
}

// ===== Active 階段計算函數 =====


// ===== loadProjectData 和 handleRefresh 已移至上方 TanStack Query 區域 =====

// ===== 處理數據載入成功後的邏輯 =====
// 使用 watchEffect 自動追蹤依賴，避免 race condition
const stopDataLoadWatcher = watchEffect(async () => {
  // watchEffect 自動追蹤所有 .value 讀取，當依賴變化時重新執行
  // 確保兩個 query 都成功，且數據都已準備好
  if (
    !hasStartedLoading.value &&
    projectCoreQuery.isSuccess.value &&
    stagesQuery.isSuccess.value &&
    projectData.value &&
    stages.value.length > 0
  ) {
    // 立即設置標誌位，防止重複執行
    hasStartedLoading.value = true

    // 設定當前階段為第一個階段（不自動滾動）
    if (stages.value.length > 0) {
      currentStageId.value = stages.value[0].id
      // 用戶從頁面頂部（第一個階段）開始瀏覽
    }

    // 標記 projectCore 載入完成
    loadingTracker.setLoading('projectCore', false)

    // <i class="fas fa-check-circle text-success"></i> 並行載入所有獨立數據（減少載入時間）
    // Debug: 檢查 stageContent 和 loadAllStageReports
    console.log('🔍 [DEBUG] 準備載入階段資料', {
      stagesCount: stages.value.length,
      projectId: projectId.value,
      hasStageContent: !!stageContent,
      hasLoadAllStageReports: typeof stageContent.loadAllStageReports,
      stageContentKeys: Object.keys(stageContent)
    })
    console.log('🔍 [DEBUG] stageContent 完整對象:', stageContent)
    console.log('🔍 [DEBUG] loadAllStageReports 函數源碼前200字:',
      stageContent.loadAllStageReports.toString().substring(0, 200)
    )
    console.log('🔍 [DEBUG] loadAllStageReports constructor:',
      stageContent.loadAllStageReports.constructor.name
    )

    loadingTracker.setLoading('stageReports', true)
    try {
      console.log('🚀 [DEBUG] 開始執行 Promise.all')

      await Promise.all([
        // 載入階段報告（包含 submissions、rankings 等數據）
        // Debug wrapper to track execution
        (async () => {
          console.log('🎯 [DEBUG] 準備調用 loadAllStageReports')
          console.log('🎯 [DEBUG] stageContent.loadAllStageReports type:', typeof stageContent.loadAllStageReports)
          const result = await stageContent.loadAllStageReports(stages.value, projectId.value)
          console.log('🎯 [DEBUG] loadAllStageReports 完成', result)
          return result
        })().catch(err => {
          console.error('❌ [DEBUG] loadAllStageReports failed:', err)
          console.error('❌ [DEBUG] Error stack:', err.stack)
          // Ensure all stages have loadingReports = false on error
          stages.value.forEach(stage => {
            stage.loadingReports = false
          })
          throw err  // Rethrow to see in outer catch
        }),
        // 載入所有階段的評論（用於計算 mention badge）
        loadAllStageComments(),
        // 載入 mention 數據（用於評論顯示和權限檢查）
        loadMentionData(),
        // 載入所有階段的 ranking proposals（用於判斷未投票狀態）
        loadAllStageProposals()
      ])

      console.log('✅ [DEBUG] Promise.all 完成')
    } catch (error) {
      console.error('❌ [DEBUG] Promise.all error:', error)
      console.error('❌ Error loading stage data:', error)
    } finally {
      loadingTracker.setLoading('stageReports', false)
    }

    // 財富排名資料現在由 TanStack Query 自動管理（useWalletLeaderboard）

    // 為 active 階段載入共識投票狀態
    stages.value.forEach((stage: ExtendedStage) => {
      if (stage.status === 'active' && stage.groups) {
        stage.groups.forEach((group: Group) => {
          if (group.submissionId) {
            group.approvalVotesLoading = true
            loadGroupApprovalVotes(
              projectId.value,
              stage.id,
              group.submissionId,
              group.groupId
            ).finally(() => {
              group.approvalVotesLoading = false
            })
          }
        })
      }
    })

    // 綁定階段訊息抽屜的 Intersection Observers
    await nextTick() // 確保 DOM 已渲染
    const stageIds = stages.value.map((s: ExtendedStage) => s.id)
    stageInfoDrawer.bindObservers(stageIds)
    console.log('📍 階段訊息抽屜觀察器已綁定')
  }
})

// ===== 監聽 projectId 變化並重新載入數據 =====
// 修復從 Dashboard 導航到專案時不載入資料的問題
const stopProjectIdWatcher = watch(
  projectId,
  async (newProjectId, oldProjectId) => {
    if (newProjectId && newProjectId !== oldProjectId) {
      console.log('🔄 ProjectId changed from navigation, refetching data:', {
        old: oldProjectId,
        new: newProjectId
      })

      // Reset loading tracker
      loadingTracker.setLoading('projectCore', true)

      // Explicitly refetch both queries
      await Promise.all([
        projectCoreQuery.refetch(),
        stagesQuery.refetch()
      ])

      // 現有的 watch (2383-2446行) 會在 queries 成功後處理資料
    }
  },
  { immediate: false }
)

// ===== Auto-refresh Timer =====
async function handleRefresh() {
  console.log('🔄 手動重新整理專案資料')

  // Step 1: Refetch base data
  await projectCoreQuery.refetch()
  await stagesQuery.refetch()

  // Step 2: Wait for stages computed to update with new empty objects
  await nextTick()

  // Step 3: Reload all stage submissions into the new stage objects
  if (stages.value.length > 0) {
    loadingTracker.setLoading('stageReports', true)
    try {
      // <i class="fas fa-check-circle text-success"></i> 並行載入所有獨立數據（減少重載時間）
      await Promise.all([
        stageContent.loadAllStageReports(stages.value, projectId.value).catch(err => {
          console.error('❌ loadAllStageReports failed in refresh:', err)
          // Ensure all stages have loadingReports = false on error
          stages.value.forEach(stage => {
            stage.loadingReports = false
          })
        }),
        // Also reload related data
        loadAllStageComments(),
        loadMentionData(),
        loadAllStageProposals()
      ])
    } catch (error) {
      console.error('❌ Error refreshing stage data:', error)
    } finally {
      loadingTracker.setLoading('stageReports', false)
    }
  }

  // 重置 CountdownButton 倒數計時器
  if (refreshButtonRef.value) {
    refreshButtonRef.value.resetCountdown()
    refreshButtonRef.value.startCountdown(refreshDuration.value)  // 使用用戶設定的刷新時長
  }

  showSuccess('專案資料已重新整理')
}

/**
 * 重新載入專案資料（相容舊版 API）
 * 用於子組件事件處理（如刪除報告、投票完成等）
 */
async function loadProjectData() {
  console.log('🔄 重新載入專案資料 (loadProjectData)')
  await handleRefresh()
}

// ===== URL Drawer Processing =====

/**
 * Flag to prevent multiple URL processing
 */
const urlProcessed = ref(false)

/**
 * Open drawer based on action from URL
 * Called after data is loaded
 */
function openDrawerByAction(action: string, stageId?: string, extraParam?: string) {
  // Set modal stage ID if provided
  if (stageId) {
    modalManager.currentModalStageId.value = stageId
  }

  // Open corresponding drawer based on action
  switch (action) {
    case 'vote-result':
      modalManager.showVoteResultModal.value = true
      break
    case 'submit-report':
      modalManager.showSubmitReportModal.value = true
      break
    case 'submit-comment':
      modalManager.showSubmitCommentModal.value = true
      break
    case 'approval':
      modalManager.showGroupSubmissionApprovalModal.value = true
      break
    case 'comment-vote':
      if (extraParam) {
        modalManager.currentModalSubmissionId.value = extraParam
        modalManager.showCommentVoteModal.value = true
      }
      break
    case 'teacher-vote':
      if (extraParam) {
        modalManager.currentModalSubmissionId.value = extraParam
        modalManager.showTeacherVoteModal.value = true
      }
      break
    case 'analysis':
      modalManager.showVotingAnalysisModal.value = true
      break
    // 'award' case removed - award functionality moved to WalletNew.vue
    case 'reply':
      if (extraParam) {
        // Find comment by ID and open reply drawer
        // Note: This requires loading comment data first
        console.warn('Reply drawer requires comment data to be loaded')
      }
      break
    default:
      console.warn(`Unknown drawer action: ${action}`)
  }
}

/**
 * Process URL parameters and open drawer if valid
 * Called when data is ready
 */
function processUrlParams() {
  // Prevent multiple processing
  if (urlProcessed.value) {
    return
  }

  if (!projectData.value) {
    return
  }

  const drawerConfig = routeDrawer.processDrawerFromUrl(
    permissions.permissions.value, // Get PermissionFlags from useProjectPermissions return value
    stages.value as any
  )

  if (drawerConfig) {
    // Mark as processed
    urlProcessed.value = true

    // Scroll to stage if specified (with URL offset)
    if (drawerConfig.stageId) {
      nextTick(() => {
        scrollToStage(drawerConfig.stageId!, true) // fromUrl = true
      })
    }

    // Open drawer after scroll
    setTimeout(() => {
      openDrawerByAction(
        drawerConfig.action,
        drawerConfig.stageId,
        drawerConfig.extraParam
      )
    }, 300) // Wait for scroll animation
  }
}

/**
 * Handle drawer close - clear URL action parameter
 */
function handleDrawerClose() {
  routeDrawer.clearAction()
}

onMounted(() => {
  // TanStack Query 的 useProjectCore 和 useStages 會自動處理數據載入
  // 當認證完成且 projectId 就緒時會自動開始查詢
  // maxCommentSelections 和 commentRewardPercentile 直接從 projectData.project 獲取
})

// Watch for data loaded - process URL params when ready
watch([projectData, () => stages.value.length], ([data, stagesCount]) => {
  if (data && stagesCount > 0 && !loading.value) {
    // Data is ready, process URL parameters
    nextTick(() => {
      processUrlParams()
    })
  }
}, { immediate: true })

// <i class="fas fa-check-circle text-success"></i> 清理資源，防止記憶體洩漏
onBeforeUnmount(() => {
  // 停止所有 watchers
  stopDataLoadWatcher()
  stopProjectIdWatcher()
})
</script>

<style scoped>
/* ===== CountdownButton 智能文字混合模式 ===== */
.blend-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  mix-blend-mode: difference;
}

.dashboard {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

/* 無階段提示容器 */
.no-stages-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  padding: 60px 20px;
  background: white;
  border-radius: 8px;
  margin: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
  flex-shrink: 0; /* 確保 top-bar 不會被壓縮 */
}

/* Gantt Drawer 樣式 */

/* 觸發按鈕（抽屜關閉時）- 融入 top-bar */
.page-title h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
}

.title-with-refresh {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 載入進度條容器 */
.loading-progress-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.loading-progress-container :deep(.el-progress) {
  width: 100%;
}

.loading-progress-container :deep(.el-progress__text) {
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
}

.loading-status-text {
  font-size: 11px;
  color: #909399;
  text-align: center;
  font-weight: 500;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
}

.refresh-button {
  font-size: 13px;
  height: 28px;
  padding: 0 12px;
}

.refresh-button i {
  margin-right: 4px;
}

.project-intro-button {
  font-size: 13px;
  height: 28px;
  padding: 0 12px;
}

.project-intro-button i {
  margin-right: 4px;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 只在這層限制，讓 content-area 可以滾動 */
}

.content-area {
  flex: 1;
  padding: 25px 80px 25px 25px; /* 右側留出空間給時間軸 */
  overflow-y: auto; /* 允許垂直滾動 */
  overflow-x: visible; /* 水平方向不限制 */
  position: relative;
}

.project-detail {
  padding: 0;
}

.stage-section {
  background: #fff;
  border-radius: 8px;
  margin-bottom: 30px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  /* 完全移除高度限制，讓內容自然展開 */
  overflow: visible;
  position: relative;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 哨兵元素：用於 HUD 碰撞檢測（IntersectionObserver） */
.stage-sentinel {
  height: 0;
  width: 100%;
  pointer-events: none;
  visibility: hidden; /* 不佔用視覺空間但保留在 DOM 中 */
}

/* 動態馬路效果：當前活動階段視覺聚焦 */
.stage-section.active-stage {
  transform: scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

/* 階段狀態樣式 */
.stage-section.stage-pending,
.stage-section.stage-completed {
  opacity: 0.7;
}

/* 階段區塊邊框 - 上方已有狀態列，只移除上框線 */
.stage-section.status-pending {
  border: 3px solid var(--stage-pending-bg);
  border-top: none;
}

.stage-section.status-active {
  border: 3px solid var(--stage-active-bg);
  border-top: none;
}

.stage-section.status-voting {
  border: 3px solid var(--stage-voting-bg);
  border-top: none;
}

.stage-section.status-settling {
  border: 3px solid var(--stage-voting-bg);
  border-top: none;
}

.stage-section.status-completed {
  border: 3px solid var(--stage-completed-bg);
  border-top: none;
}

.stage-section.status-archived {
  border: 3px solid var(--stage-completed-bg);
  border-top: none;
}

.stage-section.status-paused {
  border: 3px solid var(--stage-paused-bg, #e67e22);
  border-top: none;
}

/* 第一行：階段狀態欄 */
.stage-header-bar {
  width: 100%;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  border-radius: 8px 8px 0 0;
  color: white;
  min-height: 48px;
}

/* 階段狀態欄 - 糖果漸層配色（邊緣融合版） */
.stage-header-bar.status-pending {
  background: var(--stage-pending-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-active {
  background: var(--stage-active-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-voting {
  background: var(--stage-voting-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-settling {
  background: var(--stage-settling-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-completed {
  background: var(--stage-completed-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-archived {
  background: var(--stage-archived-gradient);
  color: var(--stage-gradient-text);
}

.stage-header-bar.status-paused {
  background: var(--stage-paused-gradient, linear-gradient(90deg, #e67e22 0%, #F5B041 15%, #CA6F1E 85%, #e67e22 100%));
  color: var(--stage-gradient-text);
}

.stage-controls {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
}

/* ===== RWD 基礎樣式 ===== */

/* 狀態區域（包含小螢幕圖示+標題 和 桌面文字狀態） */
.stage-status-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 工具按鈕群組 */
.stage-utility-controls {
  display: flex;
  align-items: center;
  gap: 0;
}

/* 桌面操作按鈕群組 */
.desktop-action-controls {
  display: flex;
  align-items: center;
  gap: 0;
}

/* 小螢幕專用：操作按鈕行 */
.stage-action-controls {
  display: none; /* 默認隱藏，小螢幕時顯示 */
}

/* 小螢幕專用：灰底提示 */
.mobile-info-hint {
  display: none; /* 默認隱藏 */
}

/* 小螢幕專用元素（默認隱藏） */
.mobile-only {
  display: none !important;
}

/* 小螢幕：狀態圖示 */
.status-icon {
  display: none; /* 桌面版隱藏 */
  font-size: 16px;
}

/* 小螢幕：截斷標題 */
.mobile-title {
  display: none; /* 桌面版隱藏 */
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

/* 桌面版：文字狀態 */
.desktop-status {
  display: block;
  font-weight: 600;
  font-size: 14px;
}

/* 階段說明按鈕 */
.btn-stage-info {
  background: transparent;
  border: none;
  padding: 6px 10px;
  cursor: pointer;
  color: inherit;
  opacity: 0.8;
  transition: opacity 0.2s;
  font-size: 16px;
}

.btn-stage-info:hover:not(:disabled) {
  opacity: 1;
}

.btn-stage-info:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 第二行：信息區 */
.stage-info-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 30px;
}

.stage-title-area {
  flex: 1;
  min-width: 0;
}

.stage-title {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 12px 0;
}

.stage-rewards {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.reward-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 120px;
}

.reward-item .label {
  font-size: 12px;
  color: #7f8c8d;
  margin-bottom: 6px;
  text-align: center;
}

.reward-item .value {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  background: #f8f9fa;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #e1e8ed;
}

.stage-description-wrapper {
  position: relative;
}

.stage-description {
  color: #7f8c8d;
  line-height: 1.5;
  margin: 0;
  display: inline;
}

.stage-description-full {
  margin-top: 10px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e1e8ed;
}

.btn-link {
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
  margin-left: 8px;
  text-decoration: underline;
  transition: color 0.2s;
}

.btn-link:hover {
  color: #0056b3;
  text-decoration: none;
}

/* 共識警告樣式 */
.consensus-warning {
  margin: 15px 0;
  border-radius: 8px;
}

.consensus-warning :deep(.el-alert__content) {
  line-height: 1.6;
}

.consensus-warning :deep(.el-alert__title) {
  font-weight: 600;
  margin-bottom: 5px;
}

.consensus-warning :deep(.el-alert__description) {
  font-size: 14px;
  color: #8b4513;
}

/* 共識成功提示樣式 */
.consensus-success {
  margin: 15px 0;
  border-radius: 8px;
}

.consensus-success :deep(.el-alert__content) {
  line-height: 1.6;
}

.consensus-success :deep(.el-alert__title) {
  font-weight: 600;
  margin-bottom: 5px;
}

.consensus-success :deep(.el-alert__description) {
  font-size: 14px;
  color: #2d6a4f;
}

/*
 * 控制區按鈕樣式已移至全局 _buttons.scss
 * 使用語義化配色方案，按鈕顏色根據功能自動調整
 */

/* Dropdown 按鈕特殊處理 */
.stage-controls :deep(.el-dropdown) {
  height: 32px;
}

.stage-controls :deep(.el-dropdown .btn) {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 按钮样式已移至全局 _buttons.scss，此处不再定义 */

/* 保留通用 label 和 value 樣式供其他地方使用 */
.label {
  font-size: 14px;
  color: #7f8c8d;
  margin-bottom: 4px;
}

.value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  background: #f8f9fa;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #e1e8ed;
}


/* Mention badge 樣式 */
.mention-badge {
  display: inline-block;
}

.mention-badge :deep(.el-badge__content) {
  background-color: #e74c3c;
  border: 2px solid #fff;
  font-weight: 600;
}

.mention-badge :deep(.el-badge__content.is-fixed) {
  top: 8px;
  right: 12px;
}

/* ===== 重新整理按鈕樣式 ===== */

/* Icon 動畫 - 刷新時單圈旋轉 */
.fa-spin-once {
  animation: refresh-spin-once 0.8s ease-in-out;
}

@keyframes refresh-spin-once {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 智能文字樣式（與 CountdownButton 一致）*/
.countdown-time {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
  margin-left: 2px;
}

/* 專案事件檢視按鈕 - 與重新整理按鈕保持一致 */
.project-event-log-button.el-button--small.is-plain {
  border-color: #000000 !important;
  color: #000000 !important;
  background-color: #ffffff !important;
  border-width: 1px !important;
  padding: 12px 24px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  height: auto !important;
  line-height: 1 !important;
}

.project-event-log-button.el-button--small.is-plain:hover:not(:disabled) {
  border-color: #333333 !important;
  color: #333333 !important;
  background-color: #f5f5f5 !important;
}

.project-event-log-button.el-button--small.is-plain i {
  color: #000000 !important;
  margin-right: 8px !important;
}

/* 專案介紹抽屜內容樣式 */
.project-description-content {
  padding: 20px;
  background: white;
  border-radius: 8px;
}

.project-description-content :deep(.markdown-viewer) {
  max-width: 100%;
}

/* 評分參數統計區 */
.scoring-params-section {
  margin-bottom: 16px;
}

.scoring-params-section .section-title {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.scoring-params-section .section-title i {
  color: #9B59B6;
}

.scoring-stats-row {
  margin: 0 -6px;
}

.scoring-stats-row :deep(.el-statistic) {
  text-align: center;
  padding: 12px 8px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  height: 100%;
}

.scoring-stats-row :deep(.el-statistic__head) {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.scoring-stats-row :deep(.el-statistic__content) {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.scoring-stats-row :deep(.el-statistic) i {
  font-size: 14px;
  margin-right: 4px;
  color: #9B59B6;
}

.scoring-stats-row .el-col {
  margin-bottom: 12px;
}

.reward-mode-text {
  font-size: 16px;
  font-weight: 600;
}

/* 響應式優化 */
@media (max-width: 768px) {
  .scoring-stats-row :deep(.el-statistic) {
    padding: 10px 6px;
  }

  .scoring-stats-row :deep(.el-statistic__head) {
    font-size: 11px;
  }

  .scoring-stats-row :deep(.el-statistic__content) {
    font-size: 16px;
  }
}

/* 階段時間軸容器樣式 */
.stage-timeline-container {
  padding: 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
  overflow: visible;
  position: relative;
  z-index: 1;
}

.timeline-loading {
  padding: 40px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

.timeline-loading i {
  margin-right: 8px;
}

/* 階段時間軸展開/收合動畫 */
.stage-timeline-expand-enter-active,
.stage-timeline-expand-leave-active {
  transition: all 0.3s ease;
  max-height: 400px;
  overflow: hidden;
}

.stage-timeline-expand-enter-from,
.stage-timeline-expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.stage-timeline-expand-enter-to,
.stage-timeline-expand-leave-from {
  max-height: 400px;
  opacity: 1;
}

/* ===== 緊湊型 Windows 8 Tile HUD ===== */

/* HUD 主容器 */
.stage-hud-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

@media (min-width: 768px) {
  .stage-hud-compact {
    gap: 8px;
    padding: 12px;
  }
}

/* 統計區：2x2 Grid (手機) / 4x1 Grid (桌面) */
.hud-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

@media (min-width: 768px) {
  .hud-stats-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
}

/* 通用 Tile 樣式 - 緊湊版 */
.hud-tile {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 4px;
  min-height: 36px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  font-size: 13px;
}

@media (min-width: 768px) {
  .hud-tile {
    min-height: 44px;
    padding: 10px 14px;
    font-size: 14px;
  }
}

.hud-tile i {
  font-size: 14px;
  opacity: 0.9;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .hud-tile i {
    font-size: 16px;
  }
}

/* Tile 文字容器 */
.tile-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tile 標籤 */
.tile-label {
  font-size: 11px;
  opacity: 0.75;
  font-weight: 500;
}

@media (min-width: 768px) {
  .tile-label {
    font-size: 12px;
  }
}

/* Tile 數值 */
.tile-value {
  font-size: 15px;
  font-weight: 700;
}

@media (min-width: 768px) {
  .tile-value {
    font-size: 18px;
  }
}

/* 個別 Tile 配色（保留馬力歐風格漸層）*/
.tile-stage {
  background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
  color: #000;
}

/* HUD Info Button（階段描述按鈕）*/
.hud-info-btn {
  --el-button-bg-color: rgba(0, 0, 0, 0.15);
  --el-button-border-color: transparent;
  --el-button-hover-bg-color: rgba(0, 0, 0, 0.25);
  --el-button-hover-border-color: transparent;
  --el-button-text-color: inherit;
  margin-left: auto;
  flex-shrink: 0;
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;

  .el-icon {
    font-size: 12px;
  }
}

@media (min-width: 768px) {
  .hud-info-btn {
    width: 28px !important;
    height: 28px !important;

    .el-icon {
      font-size: 14px;
    }
  }
}

.tile-time {
  background: linear-gradient(135deg, #4dabf7 0%, #228be6 100%);
  color: #fff;
}

.tile-time.urgent {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
  animation: tile-pulse 2s ease-in-out infinite;
}

.tile-status {
  background: linear-gradient(135deg, #868e96 0%, #495057 100%);
  color: #fff;
}

.tile-report {
  background: linear-gradient(135deg, #ffd43b 0%, #fab005 100%);
  color: #000;
}

.tile-comment {
  background: linear-gradient(135deg, #ff922b 0%, #fd7e14 100%);
  color: #000;
}

/* Actions 區域（底部橫排）*/
.hud-actions-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

@media (min-width: 768px) {
  .hud-actions-row {
    gap: 8px;
    padding-top: 8px;
  }
}

.hud-actions-row .el-button {
  flex: 1 1 auto;
  min-width: 80px;
  max-width: 150px;
  padding: 8px 12px;
  font-size: 12px;
  border-radius: 4px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

@media (min-width: 768px) {
  .hud-actions-row .el-button {
    min-width: 100px;
    max-width: 180px;
    font-size: 13px;
  }
}

.hud-actions-row .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.hud-actions-row .el-button i {
  margin-right: 4px;
}

/* HUD Dropdown 樣式 */
.hud-actions-row .el-dropdown {
  flex: 1 1 auto;
  min-width: 80px;
  max-width: 150px;
}

@media (min-width: 768px) {
  .hud-actions-row .el-dropdown {
    min-width: 100px;
    max-width: 180px;
  }
}

.hud-actions-row .el-dropdown .el-button {
  width: 100%;
  border-radius: 4px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.hud-actions-row .el-dropdown .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.hud-actions-row .el-dropdown .el-button i {
  margin-right: 4px;
}

@keyframes tile-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

/* 內容過渡動畫 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== 移動端響應式（< 768px）===== */
@media (max-width: 767px) {
  /* === Stage Header Bar RWD === */

  /* 顯示小螢幕專用元素 */
  .mobile-only {
    display: flex !important;
  }

  /* 顯示狀態圖示和截斷標題 */
  .status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-title {
    display: inline;
  }

  /* 隱藏桌面文字狀態 */
  .desktop-status {
    display: none !important;
  }

  /* 隱藏桌面操作按鈕 */
  .desktop-action-controls {
    display: none !important;
  }

  /* 隱藏階段標題和描述區塊 - 小螢幕改用 info drawer */
  .stage-info-section {
    display: none !important;
  }

  /* Header Bar 調整 */
  .stage-header-bar {
    flex-wrap: nowrap;
    gap: 8px;
    padding: 8px 12px;
    min-height: 44px;
  }

  /* 狀態區域縮小 */
  .stage-status-area {
    flex: 1;
    min-width: 0; /* 允許收縮 */
    gap: 6px;
  }

  /* 工具按鈕緊湊化 */
  .stage-utility-controls {
    gap: 2px;
  }

  .stage-utility-controls .btn {
    padding: 4px 8px;
    min-width: 32px;
    font-size: 13px;
  }

  /* 顯示第二行操作按鈕 */
  .stage-action-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.05);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .stage-action-controls .btn {
    flex: 1 1 auto;
    min-width: 80px;
    justify-content: center;
    padding: 6px 10px;
    font-size: 13px;
  }

  .stage-action-controls .el-dropdown {
    flex: 1 1 auto;
    min-width: 80px;
  }

  .stage-action-controls .el-dropdown .btn {
    width: 100%;
    justify-content: center;
  }

  /* 隱藏 stage-info-section：標題已在 header bar 顯示，詳情可透過 info 按鈕查看 */
  .stage-info-section {
    display: none;
  }

  /* 顯示灰底提示 */
  .mobile-info-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #f5f5f5;
    color: #666;
    padding: 10px 15px;
    font-size: 13px;
    text-align: center;
    border-top: 1px solid #e1e8ed;
  }

  .mobile-info-hint i {
    color: #3498db;
  }

  /* === Windows 8 Tile HUD 移動端 === */

  /* 移動端縮小馬路加寬效果 */
  .stage-section.active-stage {
    transform: scale(1.01);
  }

  /* 注意：HUD Tiles 的響應式樣式已在主樣式區塊中以 @media 處理 */

  /* Content Area Padding 調整 */
  .content-area {
    padding: 15px 15px 15px 15px;
  }
}

/* Portrait mode: Hide TopBarUserControls in top-bar (moved to sidebar) */
@media screen and (orientation: portrait) and (max-width: 768px) {
  .top-bar :deep(.user-controls) {
    display: none !important;
  }
}
</style>