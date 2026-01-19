<template>
  <div class="project-management">
    <!-- Header with Actions -->
    <div class="mgmt-header">
    </div>

    <!-- Unified Filter Toolbar -->
    <AdminFilterToolbar
      variant="default"
      :active-filter-count="activeFilterCount"
      :export-data="exportConfig.data"
      :export-filename="exportConfig.filename"
      :export-headers="exportConfig.headers"
      :export-row-mapper="exportConfig.rowMapper"
      :loading="loading"
      @reset-filters="handleResetFilters"
    >
      <!-- Core Filters (Always Visible) -->
      <template #filters-core>
        <div class="filter-item">
          <span class="filter-label">搜尋專案:</span>
          <el-input
            v-model="searchText"
            placeholder="搜尋專案名稱或描述"
            clearable
            style="width: 250px;"
          >
            <template #prefix>
              <i class="fas fa-search"></i>
            </template>
          </el-input>
        </div>

        <div class="filter-item">
          <span class="filter-label">狀態篩選:</span>
          <el-select
            v-model="statusFilter"
            placeholder="全部狀態"
            clearable
            style="width: 140px;"
          >
            <el-option label="進行中" value="active" />
            <el-option label="已完成" value="completed" />
            <el-option label="已封存" value="archived" />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">創建者:</span>
          <el-select
            v-model="creatorFilter"
            placeholder="全部創建者"
            clearable
            style="width: 140px;"
          >
            <el-option label="我創建的" value="me" />
          </el-select>
        </div>

        <div class="filter-item">
          <el-switch
            v-model="showArchivedProjects"
            active-text="顯示封存專案"
            inactive-text="隱藏封存專案"
          />
        </div>
      </template>
    </AdminFilterToolbar>

    <!-- 統計卡片 -->
    <el-card class="stats-card">
      <el-row :gutter="20">
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="總專案數" :value="stats?.totalProjects ?? 0" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="進行中" :value="stats?.activeProjects ?? 0" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="已刪除" :value="stats?.deletedProjects ?? 0" />
        </el-col>
        <el-col :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="已封存" :value="stats?.archivedProjects ?? 0" />
        </el-col>
        <el-col v-if="activeFilterCount > 0" :xs="12" :sm="6" :md="4">
          <AnimatedStatistic title="搜尋結果" :value="filteredProjects?.length ?? 0" />
        </el-col>
      </el-row>
    </el-card>

    <!-- Project Table -->
    <div class="table-container" v-loading="loading" element-loading-text="載入專案資料中...">
      <table v-if="filteredProjects.length > 0" class="project-table">
        <!-- 響應式表頭 -->
        <ResponsiveTableHeader :actions-colspan="3">
          <!-- 橫屏：完整表頭 -->
          <template #full>
            <th>專案名稱</th>
            <th>最低分</th>
            <th>最高分</th>
            <th>學生權重</th>
            <th>教師權重</th>
            <th>可排名數</th>
            <th>操作</th>
          </template>
          <!-- 豎屏：精簡表頭 -->
          <template #info>
            <th>專案名稱</th>
            <th>分數範圍</th>
            <th>權重</th>
          </template>
        </ResponsiveTableHeader>
        <tbody>
          <template v-for="project in filteredProjects" :key="project.projectId">
            <ExpandableTableRow
              :is-expanded="expandedProjects.has(project.projectId)"
              :expansion-colspan="7"
              :enable-responsive-rows="true"
              :actions-colspan="7"
              @toggle-expansion="toggleProjectExpansion(project)"
            >
              <!-- 橫屏：完整單行 -->
              <template #main="{ isExpanded }">
                <td>
                  <el-tooltip :content="project.projectName" placement="top" :show-after="300">
                    <div class="project-name">
                      <i class="expand-icon fas" :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"></i>
                      <span>{{ project.projectName }}</span>
                    </div>
                  </el-tooltip>
                </td>
                <td>{{ project.scoreRangeMin ?? 0 }}</td>
                <td>{{ project.scoreRangeMax ?? 100 }}</td>
                <td>{{ formatWeight(project.studentRankingWeight) }}</td>
                <td>{{ formatWeight(project.teacherRankingWeight) }}</td>
                <td>{{ formatCommentRanking(project) }}</td>
                <td class="actions" @click.stop>
                  <el-button type="primary" size="small" @click="editProject(project)">
                    <i class="fas fa-edit"></i>
                    編輯
                  </el-button>
                  <el-button type="info" size="small" @click="openCloneProjectDrawer(project)" :disabled="cloningProject">
                    <i :class="cloningProject ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                    {{ cloningProject ? '複製中...' : '複製專案' }}
                  </el-button>
                  <el-button type="success" size="small" @click="navigateToWallet(project)">
                    <i class="fas fa-coins"></i>
                    帳本管理
                  </el-button>
                  <el-button type="info" size="small" @click="openEventLogViewer(project)">
                    <i class="fas fa-history"></i>
                    事件日誌
                  </el-button>
                  <el-dropdown
                    trigger="click"
                    @command="(cmd) => handleViewerCommand(cmd, project)"
                  >
                    <el-button type="info" size="small">
                      <i class="fas fa-user-shield"></i>
                      存取者清單 <i class="el-icon-arrow-down el-icon--right"></i>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="settings">
                          <i class="fas fa-user-cog"></i> 專案存取權設定
                        </el-dropdown-item>
                        <el-dropdown-item command="groups">
                          <i class="fas fa-layer-group"></i> 專案群組
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-button
                    v-if="project.status === 'archived'"
                    type="success"
                    size="small"
                    :disabled="archivingProjects.has(project.projectId)"
                    @click="unarchiveProject(project)"
                  >
                    <i :class="archivingProjects.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-box-open'"></i>
                    {{ archivingProjects.has(project.projectId) ? '處理中...' : '解除封存' }}
                  </el-button>
                  <el-button
                    v-else
                    type="warning"
                    size="small"
                    :disabled="archivingProjects.has(project.projectId)"
                    @click="openArchiveProjectDrawer(project)"
                  >
                    <i :class="archivingProjects.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                    {{ archivingProjects.has(project.projectId) ? '處理中...' : '封存' }}
                  </el-button>
                </td>
              </template>

              <!-- 豎屏第一行：資訊 -->
              <template #info="{ isExpanded }">
                <td>
                  <el-tooltip :content="project.projectName" placement="top" :show-after="300">
                    <div class="project-name">
                      <i class="expand-icon fas" :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"></i>
                      <span>{{ project.projectName }}</span>
                    </div>
                  </el-tooltip>
                </td>
                <td>{{ project.scoreRangeMin ?? 0 }} ~ {{ project.scoreRangeMax ?? 100 }}</td>
                <td>學:{{ formatWeight(project.studentRankingWeight) }} / 師:{{ formatWeight(project.teacherRankingWeight) }}</td>
              </template>

              <!-- 豎屏第二行：操作（icon-only + tooltip） -->
              <template #actions>
                <el-tooltip content="編輯" placement="top">
                  <el-button type="primary" size="small" @click.stop="editProject(project)">
                    <i class="fas fa-edit"></i>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="複製專案" placement="top">
                  <el-button type="info" size="small" @click.stop="openCloneProjectDrawer(project)" :disabled="cloningProject">
                    <i :class="cloningProject ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="帳本管理" placement="top">
                  <el-button type="success" size="small" @click.stop="navigateToWallet(project)">
                    <i class="fas fa-coins"></i>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="事件日誌" placement="top">
                  <el-button type="info" size="small" @click.stop="openEventLogViewer(project)">
                    <i class="fas fa-history"></i>
                  </el-button>
                </el-tooltip>
                <el-dropdown trigger="click" @command="(cmd) => handleViewerCommand(cmd, project)">
                  <el-tooltip content="存取者清單" placement="top">
                    <el-button type="info" size="small" @click.stop>
                      <i class="fas fa-user-shield"></i>
                    </el-button>
                  </el-tooltip>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="settings">
                        <i class="fas fa-user-cog"></i> 存取權設定
                      </el-dropdown-item>
                      <el-dropdown-item command="groups">
                        <i class="fas fa-layer-group"></i> 專案群組
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-tooltip v-if="project.status === 'archived'" content="解除封存" placement="top">
                  <el-button
                    type="success"
                    size="small"
                    :disabled="archivingProjects.has(project.projectId)"
                    @click.stop="unarchiveProject(project)"
                  >
                    <i :class="archivingProjects.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-box-open'"></i>
                  </el-button>
                </el-tooltip>
                <el-tooltip v-else content="封存" placement="top">
                  <el-button
                    type="warning"
                    size="small"
                    :disabled="archivingProjects.has(project.projectId)"
                    @click.stop="openArchiveProjectDrawer(project)"
                  >
                    <i :class="archivingProjects.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                  </el-button>
                </el-tooltip>
              </template>

              <!-- 展开内容：阶段列表 -->
              <div
                v-loading="loadingProjectStages.has(project.projectId)"
                element-loading-text="載入階段中..."
              >
                <!-- 標題區：響應式佈局 -->
                <div class="stages-header" :class="{ 'portrait-mode': isPortrait }">
                  <h4><i class="fas fa-sort"></i> 階段順序（拖拽排序）</h4>
                  <div v-if="!isPortrait" class="header-actions">
                    <el-switch
                      v-model="showArchivedStages"
                      active-text="檢視封存階段"
                      inactive-text="隱藏封存階段"
                      style="margin-right: 16px;"
                    />
                    <el-switch
                      :model-value="showGanttChart.get(project.projectId) || false"
                      @update:model-value="(val) => toggleGanttChart(project.projectId, Boolean(val))"
                      active-text="開啟階段甘特圖"
                      inactive-text="關閉階段甘特圖"
                      style="margin-right: 16px;"
                    />
                    <el-button
                      size="small"
                      @click="loadProjectStagesForExpansion(project.projectId)"
                      :disabled="loadingProjectStages.has(project.projectId)"
                      title="重新整理階段列表"
                    >
                      <i :class="loadingProjectStages.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-sync'"></i>
                      重新整理
                    </el-button>
                    <el-button
                      type="primary"
                      size="small"
                      @click="openCreateStageForProject(project)"
                    >
                      <i class="fas fa-plus"></i>
                      新增階段
                    </el-button>
                  </div>
                </div>
                <!-- 直屏：按鈕獨立一行 -->
                <div v-if="isPortrait" class="header-actions-mobile">
                  <el-switch
                    v-model="showArchivedStages"
                    active-text="檢視隱藏階段"
                    inactive-text=""
                  />
                  <el-switch
                    :model-value="showGanttChart.get(project.projectId) || false"
                    @update:model-value="(val) => toggleGanttChart(project.projectId, Boolean(val))"
                    active-text="檢視甘特圖"
                    inactive-text=""
                  />
                  <el-tooltip content="重新整理" placement="top">
                    <el-button
                      size="small"
                      @click="loadProjectStagesForExpansion(project.projectId)"
                      :disabled="loadingProjectStages.has(project.projectId)"
                    >
                      <i :class="loadingProjectStages.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-sync'"></i>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="新增階段" placement="top">
                    <el-button
                      type="primary"
                      size="small"
                      @click="openCreateStageForProject(project)"
                    >
                      <i class="fas fa-plus"></i>
                    </el-button>
                  </el-tooltip>
                </div>

                  <!-- Gantt Chart Section -->
                  <div
                    v-if="showGanttChart.get(project.projectId) && projectStagesMap.get(project.projectId)?.length > 0"
                    class="stages-gantt-section"
                  >
                    <StageGanttChart
                      :stages="transformStagesForGantt(project.projectId)"
                      :enable-drag="true"
                      :show-minimap="true"
                      :height="300"
                      :center-time="ganttCenterTime.get(project.projectId)"
                      @stage-click="handleGanttStageClick($event, project.projectId)"
                    />
                  </div>

                  <template v-if="projectStagesMap.has(project.projectId)">
                    <EmptyState
                      v-if="getFilteredStages(project.projectId).length === 0"
                      parent-icon="fa-layer-group"
                      :icons="['fa-clock']"
                      title="此專案尚無階段"
                      :compact="true"
                      :enable-animation="false"
                    />
                    <div v-else class="stages-list-wrapper">
                    <div class="stages-container-inner">
                      <div
                        v-for="(stage, index) in getFilteredStages(project.projectId)"
                        :key="stage.stageId"
                        class="expanded-stage-item"
                        :class="{ 'dragging': draggedStage?.stageId === stage.stageId, 'portrait-mode': isPortrait }"
                        draggable="true"
                        @click="focusStageInGantt(stage, project.projectId)"
                        @dragstart="handleDragStart(stage, $event)"
                        @dragover.prevent
                        @dragenter.prevent="handleDragOver($event)"
                        @drop="handleDrop($event, project.projectId, index)"
                        @dragend="handleDragEnd"
                      >
                        <div class="stage-handle">
                          <i class="fas fa-grip-vertical"></i>
                        </div>
                        <div class="stage-info">
                          <div class="stage-name">
                            <el-tag :type="getStageStatusType(stage.status)" size="small">
                              {{ getStageStatusText(stage.status) }}
                            </el-tag>
                            {{ stage.stageName }}
                            <span class="stage-order">順序: {{ stage.stageOrder }}</span>
                          </div>
                          <div class="stage-details">
                            <span class="stage-dates">{{ formatDate(stage.startTime) }} - {{ formatDate(stage.endTime) }}</span>
                            <span v-if="stage.description" class="stage-desc">{{ stage.description }}</span>
                          </div>
                          <div class="stage-rewards">
                            <span class="reward-badge">報告池: {{ stage.reportRewardPool || 0 }}</span>
                            <span class="reward-badge">評論池: {{ stage.commentRewardPool || 0 }}</span>
                          </div>
                        </div>
                        <!-- 橫屏：按鈕在右側 -->
                        <div v-if="!isPortrait" class="stage-actions" @click.stop>
                          <el-button
                            size="small"
                            @click="moveStageUpInProject(project.projectId, index)"
                            :disabled="index === 0"
                            title="上移"
                          >
                            <i class="fas fa-arrow-up"></i>
                          </el-button>
                          <el-button
                            size="small"
                            @click="moveStageDownInProject(project.projectId, index)"
                            :disabled="index === projectStagesMap.get(project.projectId)?.length - 1"
                            title="下移"
                          >
                            <i class="fas fa-arrow-down"></i>
                          </el-button>
                          <el-button type="primary" size="small" @click="editStage(stage, project)">
                            <i class="fas fa-edit"></i>
                            編輯
                          </el-button>
                          <el-button type="info" size="small" @click="openCloneStageDrawer(stage)" :disabled="cloningStage">
                            <i :class="cloningStage ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                            {{ cloningStage ? '複製中...' : '複製階段' }}
                          </el-button>
                          <el-button
                            v-if="stage.status === 'active'"
                            type="danger"
                            size="small"
                            title="強制進入投票階段"
                            @click="openForceVotingDrawer(stage)"
                          >
                            <i class="fas fa-vote-yea"></i>
                            強制投票
                          </el-button>
                          <el-button
                            v-if="stage.status === 'active' || stage.status === 'voting'"
                            type="warning"
                            size="small"
                            title="暫停階段"
                            @click="openPauseStageDrawer(stage, project)"
                          >
                            <i class="fas fa-pause"></i>
                            暫停階段
                          </el-button>
                          <el-button
                            v-if="stage.status === 'paused'"
                            type="success"
                            size="small"
                            title="恢復階段"
                            @click="openResumeStageDrawer(stage, project)"
                          >
                            <i class="fas fa-play"></i>
                            恢復階段
                          </el-button>
                          <el-button
                            v-if="stage.status === 'voting'"
                            type="success"
                            size="small"
                            :disabled="settlingStages.has(stage.stageId)"
                            title="結算階段獎金"
                            @click="openSettlementConfirmDrawer(stage, project)"
                          >
                            <i :class="settlingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-calculator'"></i>
                            {{ settlingStages.has(stage.stageId) ? '結算中...' : '結算獎金' }}
                          </el-button>
                          <el-dropdown
                            v-if="stage.status === 'completed'"
                            trigger="click"
                            @command="handleDistributionCommand($event, stage, project.projectId)"
                          >
                            <el-button type="info" size="small">
                              <i class="fas fa-chart-pie"></i>
                              顯示獎金分配 <i class="el-icon-arrow-down el-icon--right"></i>
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
                          <el-button
                            type="warning"
                            size="small"
                            @click="reverseSettlement(stage, project)"
                            v-if="stage.status === 'completed'"
                            :disabled="reversingSettlement"
                            title="撤銷本次結算"
                          >
                            <i :class="reversingSettlement ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                            {{ reversingSettlement ? '撤銷中...' : '撤銷結算' }}
                          </el-button>
                          <el-popconfirm
                            :title="stage.status === 'archived' ? `確定要解除封存階段「${stage.stageName}」嗎？` : `確定要封存階段「${stage.stageName}」嗎？`"
                            confirm-button-text="確定"
                            cancel-button-text="取消"
                            @confirm="stage.status === 'archived' ? unarchiveStage(stage, project) : archiveStage(stage, project)"
                          >
                            <template #reference>
                              <el-button
                                type="warning"
                                size="small"
                                :disabled="archivingStages.has(stage.stageId)"
                                :title="archivingStages.has(stage.stageId) ? '處理中...' : (stage.status === 'archived' ? '解除封存階段' : '封存階段')"
                              >
                                <i :class="archivingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                                {{ archivingStages.has(stage.stageId) ? '處理中...' : (stage.status === 'archived' ? '解除封存' : '封存') }}
                              </el-button>
                            </template>
                          </el-popconfirm>
                        </div>
                        <!-- 直屏：按鈕在獎池下方獨立一行，icon-only + tooltip -->
                        <div v-if="isPortrait" class="stage-actions-mobile" @click.stop>
                          <el-tooltip content="上移" placement="top">
                            <el-button
                              size="small"
                              @click="moveStageUpInProject(project.projectId, index)"
                              :disabled="index === 0"
                            >
                              <i class="fas fa-arrow-up"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip content="下移" placement="top">
                            <el-button
                              size="small"
                              @click="moveStageDownInProject(project.projectId, index)"
                              :disabled="index === projectStagesMap.get(project.projectId)?.length - 1"
                            >
                              <i class="fas fa-arrow-down"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip content="編輯" placement="top">
                            <el-button type="primary" size="small" @click="editStage(stage, project)">
                              <i class="fas fa-edit"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip content="複製階段" placement="top">
                            <el-button type="info" size="small" @click="openCloneStageDrawer(stage)" :disabled="cloningStage">
                              <i :class="cloningStage ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip v-if="stage.status === 'active'" content="強制投票" placement="top">
                            <el-button
                              type="danger"
                              size="small"
                              @click="openForceVotingDrawer(stage)"
                            >
                              <i class="fas fa-vote-yea"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip v-if="stage.status === 'active' || stage.status === 'voting'" content="暫停階段" placement="top">
                            <el-button
                              type="warning"
                              size="small"
                              @click="openPauseStageDrawer(stage, project)"
                            >
                              <i class="fas fa-pause"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip v-if="stage.status === 'paused'" content="恢復階段" placement="top">
                            <el-button
                              type="success"
                              size="small"
                              @click="openResumeStageDrawer(stage, project)"
                            >
                              <i class="fas fa-play"></i>
                            </el-button>
                          </el-tooltip>
                          <el-tooltip v-if="stage.status === 'voting'" content="結算獎金" placement="top">
                            <el-button
                              type="success"
                              size="small"
                              :disabled="settlingStages.has(stage.stageId)"
                              @click="openSettlementConfirmDrawer(stage, project)"
                            >
                              <i :class="settlingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-calculator'"></i>
                            </el-button>
                          </el-tooltip>
                          <el-dropdown
                            v-if="stage.status === 'completed'"
                            trigger="click"
                            @command="handleDistributionCommand($event, stage, project.projectId)"
                          >
                            <el-tooltip content="顯示獎金分配" placement="top">
                              <el-button type="info" size="small">
                                <i class="fas fa-chart-pie"></i>
                              </el-button>
                            </el-tooltip>
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
                          <el-tooltip v-if="stage.status === 'completed'" content="撤銷結算" placement="top">
                            <el-button
                              type="warning"
                              size="small"
                              @click="reverseSettlement(stage, project)"
                              :disabled="reversingSettlement"
                            >
                              <i :class="reversingSettlement ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                            </el-button>
                          </el-tooltip>
                          <el-popconfirm
                            :title="stage.status === 'archived' ? `確定要解除封存階段「${stage.stageName}」嗎？` : `確定要封存階段「${stage.stageName}」嗎？`"
                            confirm-button-text="確定"
                            cancel-button-text="取消"
                            @confirm="stage.status === 'archived' ? unarchiveStage(stage, project) : archiveStage(stage, project)"
                          >
                            <template #reference>
                              <el-tooltip :content="stage.status === 'archived' ? '解除封存' : '封存'" placement="top">
                                <el-button
                                  type="warning"
                                  size="small"
                                  :disabled="archivingStages.has(stage.stageId)"
                                >
                                  <i :class="archivingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                                </el-button>
                              </el-tooltip>
                            </template>
                          </el-popconfirm>
                        </div>
                      </div>
                    </div>
                    </div>
                  </template>
              </div>
            </ExpandableTableRow>
          </template>
        </tbody>
      </table>

      <EmptyState
        v-else-if="!loading"
        parent-icon="fa-folder-tree"
        :icons="['fa-project-diagram']"
        title="沒有找到符合條件的專案"
        :enable-animation="false"
      />
    </div>

    <!-- Edit/Create Project Drawer -->

    <!-- Project Editor Drawer -->
    <ProjectEditorDrawer
      v-model:visible="showEditModal"
      :form="editForm"
      :updating="updating"
      @save="saveProject"
    />

    <!-- View Project Modal -->
    <div v-if="showViewModal" class="modal-overlay" @click="showViewModal = false">
      <div class="modal-content large" @click.stop>
        <h3><i class="fas fa-eye"></i> 專案詳情</h3>
        
        <div v-if="selectedProject" class="project-details">
          <div class="detail-row">
            <label>專案名稱:</label>
            <span>{{ selectedProject.projectName }}</span>
          </div>
          
          <div class="detail-row">
            <label>專案ID:</label>
            <span class="mono">{{ selectedProject.projectId }}</span>
          </div>
          
          <div class="detail-row">
            <label>創建者:</label>
            <span>{{ selectedProject.createdBy }}</span>
          </div>
          
          <div class="detail-row">
            <label>狀態:</label>
            <span class="status-badge" :class="selectedProject.status">
              <i :class="getStatusIcon(selectedProject.status)"></i>
              {{ getStatusText(selectedProject.status) }}
            </span>
          </div>
          
          <div class="detail-row">
            <label>描述:</label>
            <span>{{ selectedProject.description || '無' }}</span>
          </div>
          
          <div class="detail-row">
            <label>創建時間:</label>
            <span>{{ formatTime(selectedProject.createdTime) }}</span>
          </div>
          
          <div class="detail-row">
            <label>最後修改:</label>
            <span>{{ formatTime(selectedProject.lastModified) }}</span>
          </div>
          
          <div v-if="selectedProject.groupCount !== undefined" class="detail-row">
            <label>群組數量:</label>
            <span>{{ selectedProject.groupCount }}</span>
          </div>
          
          <div v-if="selectedProject.memberCount !== undefined" class="detail-row">
            <label>成員數量:</label>
            <span>{{ selectedProject.memberCount }}</span>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showViewModal = false">
            關閉
          </button>
        </div>
      </div>
    </div>

    <!-- DISABLED: Tag Assignment Modal - tags system disabled -->
    <!--
    <div v-if="showTagModal" class="modal-overlay" @click="showTagModal = false">
      <div class="modal-content" @click.stop>
        <h3><i class="fas fa-tags"></i> 標籤管理 - {{ selectedProject?.projectName }}</h3>

        <div class="current-tags-section">
          <h4>目前標籤</h4>
          <div class="current-tags">
            <span
              v-for="tag in currentProjectTags"
              :key="tag.tagId"
              class="tag-badge"
              :style="{ backgroundColor: tag.tagColor }"
            >
              {{ tag.tagName }}
              <el-popconfirm
                :title="`確定要移除標籤「${tag.tagName}」嗎？`"
                confirm-button-text="確定"
                cancel-button-text="取消"
                @confirm="removeTagFromProject(tag.tagId)"
              >
                <template #reference>
                  <button
                    class="tag-remove-btn"
                    title="移除標籤"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </template>
              </el-popconfirm>
            </span>
            <div v-if="currentProjectTags.length === 0" class="no-tags-text">
              尚未指派標籤
            </div>
          </div>
        </div>

        <div class="available-tags-section">
          <h4>可用標籤</h4>

          <div class="tag-filter">
            <input
              type="text"
              v-model="tagFilterText"
              placeholder="搜尋標籤..."
              class="form-input"
            >
            <select v-model="tagCategoryFilter" class="form-input">
              <option value="">全部分類</option>
              <option value="general">一般</option>
              <option value="project">專案</option>
              <option value="user">用戶</option>
              <option value="skill">技能</option>
              <option value="department">部門</option>
            </select>
          </div>

          <div class="available-tags">
            <div
              v-for="tag in filteredAvailableTags"
              :key="tag.tagId"
              class="available-tag-item"
              @click="assignTagToProject(tag.tagId)"
            >
              <span
                class="tag-badge clickable"
                :style="{ backgroundColor: tag.tagColor }"
              >
                {{ tag.tagName }}
              </span>
              <span class="tag-description">{{ tag.description }}</span>
              <i class="fas fa-plus"></i>
            </div>
            <div v-if="filteredAvailableTags.length === 0" class="no-tags-text">
              沒有可用的標籤
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showTagModal = false">
            關閉
          </button>
        </div>
      </div>
    </div>
    -->

    <!-- Event Log Viewer Drawer -->
    <EventLogDrawer
      v-model="showEventLogDrawer"
      :project="selectedProject"
      :user-mode="false"
    />


    <!-- Viewer Management Drawer -->
    <ViewerManagementDrawer
      v-model:visible="showViewerDrawer"
      :selected-project="selectedProject"
      :project-viewers="projectViewers"
      :search-results="searchResults"
      :loading-viewers="loadingViewers"
      :searching-users="searchingUsers"
      @search="searchUsers"
      @add-selected="addSelectedViewers"
      @update-role="updateViewerRole"
      @remove="removeViewer"
      @batch-update-roles="batchUpdateRoles"
      @batch-remove="batchRemoveViewers"
    />


    <!-- Edit Stage Modal -->
    <StageEditorDrawer
      v-model:visible="showEditStageModal"
      :form="editStageForm"
      :editing-stage="editingStage"
      :loading-stage-details="loadingStageDetails"
      :saving-stage-details="savingStageDetails"
      :is-voting-locked="isVotingLocked"
      :stage-form-error="stageFormError"
      @save="updateStageDetails"
      @clear-error="stageFormError = null"
    />

    <!-- Add Project Member Dialog -->
    <el-dialog
      v-model="showAddMemberDialog"
      title="新增專案成員"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="add-member-form">
        <div class="form-field">
          <label>使用者郵箱</label>
          <input
            v-model="newMember.email"
            type="email"
            placeholder="請輸入使用者郵箱"
            class="form-input"
          />
          <div class="field-hint">請輸入要添加的使用者郵箱地址</div>
        </div>

        <div class="form-field">
          <label>角色</label>
          <el-select v-model="newMember.role" placeholder="選擇角色" style="width: 100%">
            <el-option label="教師 (可管理專案、階段、評分)" value="teacher">
              <i class="fas fa-chalkboard-teacher"></i> 教師
            </el-option>
            <el-option label="觀察者 (僅查看權限)" value="observer">
              <i class="fas fa-eye"></i> 觀察者
            </el-option>
          </el-select>
          <div class="field-hint">
            教師：可管理專案設定、階段、評分、錢包等<br />
            觀察者：僅可查看專案資料，無法修改
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showAddMemberDialog = false" :disabled="addingMember">
            取消
          </button>
          <button class="btn-primary" @click="addMemberToProject" :disabled="addingMember || !newMember.email || !newMember.role">
            <i :class="addingMember ? 'fas fa-spinner fa-spin' : 'fas fa-user-plus'"></i>
            {{ addingMember ? '新增中...' : '新增成員' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 投票分析模態窗口 -->
    <VotingAnalysisModal
      :visible="showVotingAnalysisModal"
      @update:visible="showVotingAnalysisModal = $event"
      :project-id="selectedStageForAnalysis?.projectId || ''"
      :stage-id="selectedStageForAnalysis?.stageId || ''"
      :stage-title="selectedStageForAnalysis?.stageName"
      :is-settled="selectedStageForAnalysis?.status === 'completed'"
    />

    <!-- 評論投票分析模態窗口 -->
    <CommentVotingAnalysisModal
      :visible="showCommentAnalysisModal"
      @update:visible="showCommentAnalysisModal = $event"
      :project-id="selectedStageForAnalysis?.projectId || ''"
      :stage-id="selectedStageForAnalysis?.stageId || ''"
      :max-comment-selections="10"
      :stage-title="selectedStageForAnalysis?.stageName"
      :is-settled="selectedStageForAnalysis?.status === 'completed'"
    />

    <!-- Settlement Progress Drawer -->
    <SettlementProgressDrawer
      v-model="showSettlementDrawer"
      :stage="selectedStageForSettlement"
      :project-id="selectedStageForSettlement?.projectId || ''"
      @settlement-complete="(data: any) => handleSettlementComplete(data)"
      @settlement-error="handleSettlementError"
      @drawer-closed="handleDrawerClosed"
    />

    <!-- Settlement Confirmation Drawer -->
    <SettlementConfirmationDrawer
      v-model="showSettlementConfirmDrawer"
      :stage="selectedStageForConfirm"
      :project-id="selectedStageForConfirm?.projectId || ''"
      :settling="settlingStages.has(selectedStageForConfirm?.stageId)"
      @settlement-confirmed="(stage: any, projectId: string) => handleSettlementConfirmed(stage, projectId)"
    />

    <!-- Reverse Settlement Drawer -->
    <ReverseSettlementDrawer
      v-model="showReverseSettlementDrawer"
      :stage="selectedStageForReverse"
      :project="selectedProjectForReverse"
      @reverse-success="handleReverseSuccess"
    />

    <!-- Clone Project Drawer -->
    <el-drawer
      v-model="showCloneProjectDrawer"
      title="複製專案"
      direction="btt"
      size="100%"
      class="drawer-navy"
    >
      <div class="drawer-body" v-loading="cloningProject">
        <!-- 原始專案資訊 -->
        <div class="form-section">
          <h4><i class="fas fa-info-circle"></i> 原始專案資訊</h4>
          <div class="detail-row" v-if="cloneProjectForm.sourceProject">
            <label>專案名稱:</label>
            <span>{{ cloneProjectForm.sourceProject.projectName }}</span>
          </div>
        </div>

        <!-- 新專案設定 -->
        <div class="form-section">
          <h4><i class="fas fa-edit"></i> 新專案設定</h4>
          <div class="form-group">
            <label>新專案名稱 *</label>
            <el-input
              v-model="cloneProjectForm.newProjectName"
              placeholder="請輸入新專案名稱"
              clearable
            />
          </div>
        </div>

        <!-- 確認輸入 -->
        <div class="form-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
          <ConfirmationInput
            v-model="cloneProjectForm.confirmText"
            keyword="CLONE"
            hint-action="複製"
            @confirm="executeCloneProject"
          />
        </div>

        <!-- 操作按鈕 -->
        <div class="drawer-actions">
          <el-button
            type="primary"
            @click="executeCloneProject"
            :disabled="!isCloneFormValid || cloningProject"
          >
            <i :class="cloningProject ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
            {{ cloningProject ? '複製中...' : '確定複製' }}
          </el-button>
          <el-button @click="closeCloneDrawer" :disabled="cloningProject">取消</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Clone Stage Drawer -->
    <el-drawer
      v-model="showCloneStageDrawer"
      title="複製階段"
      direction="btt"
      size="100%"
      class="drawer-navy"
    >
      <div class="drawer-body" v-loading="cloningStage">
        <!-- 原始階段資訊 -->
        <div class="form-section">
          <h4><i class="fas fa-info-circle"></i> 原始階段資訊</h4>
          <div class="detail-row" v-if="cloneStageForm.sourceStage">
            <label>階段名稱:</label>
            <span>{{ cloneStageForm.sourceStage.stageName }}</span>
          </div>
        </div>

        <!-- 新階段設定 -->
        <div class="form-section">
          <h4><i class="fas fa-edit"></i> 新階段設定</h4>
          <div class="form-group">
            <label>新階段名稱 *</label>
            <el-input
              v-model="cloneStageForm.newStageName"
              placeholder="請輸入新階段名稱"
              clearable
            />
          </div>
        </div>

        <!-- 複製目標選擇 -->
        <div class="form-section">
          <h4><i class="fas fa-copy"></i> 複製目標專案</h4>
          <div class="form-group">
            <label>選擇目標專案 *</label>
            <el-select
              v-model="cloneStageForm.targetProjectIds"
              multiple
              filterable
              placeholder="搜尋並選擇專案..."
              style="width: 100%"
            >
              <el-option
                v-for="project in manageableProjects"
                :key="project.projectId"
                :label="project.projectName"
                :value="project.projectId"
              >
                <span>{{ project.projectName }}</span>
                <span v-if="project.isCurrent" style="color: var(--el-color-info); margin-left: 8px; font-size: 12px;">
                  （目前專案）
                </span>
              </el-option>
            </el-select>
            <div class="field-hint">
              已選擇 {{ cloneStageForm.targetProjectIds.length }} 個專案（預設為目前專案，可新增其他專案）
            </div>
          </div>
        </div>

        <!-- 確認輸入 -->
        <div class="form-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
          <ConfirmationInput
            v-model="cloneStageForm.confirmText"
            keyword="CLONE"
            hint-action="複製"
            @confirm="executeCloneStage"
          />
        </div>

        <!-- 操作按鈕 -->
        <div class="drawer-actions">
          <el-button
            type="primary"
            @click="executeCloneStage"
            :disabled="!isCloneStageFormValid || cloningStage"
          >
            <i :class="cloningStage ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
            {{ cloningStage ? '複製中...' : '確定複製' }}
          </el-button>
          <el-button @click="closeCloneStageDrawer" :disabled="cloningStage">取消</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Force Voting Drawer -->
    <ForceVotingDrawer
      v-model:visible="showForceVotingDrawer"
      :project-id="selectedForceVotingStage?.projectId"
      :stage-id="selectedForceVotingStage?.stageId"
      @confirmed="handleForceVotingConfirmed"
    />

    <!-- Pause Stage Drawer -->
    <PauseStageDrawer
      v-model:visible="showPauseStageDrawer"
      :project-id="pauseStageData?.project?.projectId"
      :stage-id="pauseStageData?.stage?.stageId"
      :stage-name="pauseStageData?.stage?.stageName"
      @confirmed="handlePauseStageConfirmed"
    />

    <!-- Resume Stage Drawer -->
    <ResumeStageDrawer
      v-model:visible="showResumeStageDrawer"
      :project-id="resumeStageData?.project?.projectId"
      :stage-id="resumeStageData?.stage?.stageId"
      :stage-name="resumeStageData?.stage?.stageName"
      @confirmed="handleResumeStageConfirmed"
    />

    <!-- Archive Project Drawer -->
    <el-drawer
      v-model="showArchiveProjectDrawer"
      title="封存專案"
      direction="ttb"
      size="100%"
      class="drawer-maroon"
    >
      <div class="drawer-body" v-loading="archivingProjects.has(archiveProjectForm.sourceProject?.projectId)">
        <!-- 警告提示 -->
        <el-alert
          type="warning"
          :closable="false"
          style="margin-bottom: 20px;"
        >
          <template #title>
            <strong>⚠️ 重要警告</strong>
          </template>
          <div>
            <p><strong>封存專案後：</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>專案將從主列表中隱藏（除非開啟「顯示封存專案」開關）</li>
              <li>所有成員將無法訪問或修改專案內容</li>
              <li>階段、提交、評論等所有數據將被保留但不可編輯</li>
              <li>您可以隨時解除封存以恢復專案</li>
            </ul>
            <p><strong>此操作不會刪除任何數據，可以撤銷。</strong></p>
          </div>
        </el-alert>

        <!-- 原始專案資訊 -->
        <div class="form-section">
          <h4><i class="fas fa-info-circle"></i> 專案資訊</h4>
          <div v-if="archiveProjectForm.sourceProject">
            <div class="detail-row">
              <label>專案名稱:</label>
              <span>{{ archiveProjectForm.sourceProject.projectName }}</span>
            </div>
            <div class="detail-row">
              <label>專案ID:</label>
              <span class="mono">{{ archiveProjectForm.sourceProject.projectId }}</span>
            </div>
            <div class="detail-row">
              <label>創建者:</label>
              <span>{{ archiveProjectForm.sourceProject.createdBy }}</span>
            </div>
            <div class="detail-row">
              <label>當前狀態:</label>
              <span class="status-badge" :class="archiveProjectForm.sourceProject.status">
                <i :class="getStatusIcon(archiveProjectForm.sourceProject.status)"></i>
                {{ getStatusText(archiveProjectForm.sourceProject.status) }}
              </span>
            </div>
            <div class="detail-row">
              <label>描述:</label>
              <span>{{ archiveProjectForm.sourceProject.description || '無' }}</span>
            </div>
          </div>
        </div>

        <!-- 確認輸入 -->
        <div class="form-section">
          <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
          <ConfirmationInput
            v-model="archiveProjectForm.confirmText"
            keyword="ARCHIVE"
            hint-action="封存"
            @confirm="executeArchiveProject"
          />
        </div>

        <!-- 操作按鈕 -->
        <div class="drawer-actions">
          <el-button
            type="danger"
            @click="executeArchiveProject"
            :disabled="!isArchiveFormValid || archivingProjects.has(archiveProjectForm.sourceProject?.projectId)"
          >
            <i :class="archivingProjects.has(archiveProjectForm.sourceProject?.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
            {{ archivingProjects.has(archiveProjectForm.sourceProject?.projectId) ? '封存中...' : '確定封存' }}
          </el-button>
          <el-button @click="closeArchiveDrawer" :disabled="archivingProjects.has(archiveProjectForm.sourceProject?.projectId)">取消</el-button>
        </div>
      </div>
    </el-drawer>

  </div>
</template>

<script lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, inject, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { getStageStatusText, getStageStatusType } from '@/utils/stageStatus'
import type { Project, Stage, User } from '@repo/shared'

// Extended Project type with additional frontend-specific properties
interface ExtendedProject extends Project {
  createdBy?: string
  createdTime?: number
  lastModified?: number
  groupCount?: number
  memberCount?: number
  scoreRangeMin?: number
  scoreRangeMax?: number
  studentRankingWeight?: number
  teacherRankingWeight?: number
  maxCommentSelections?: number
  commentRewardPercentile?: number
}

// Viewer type for project viewer management
interface ProjectViewer {
  viewerId: string
  userId: string
  displayName: string
  userEmail: string
  role: string
  assignedAt?: number
  assignedBy?: string
}

// Settlement details type
interface SettlementDetails {
  settlementId: string
  stageId: string
  projectId: string
  settledBy: string
  settledAt: number
  transactionCount?: number
  totalAmount?: number
  [key: string]: unknown
}

import MarkdownEditor from '../MarkdownEditor.vue'
import VotingAnalysisModal from '../VotingAnalysisModal.vue'
import CommentVotingAnalysisModal from '../CommentVotingAnalysisModal.vue'
import EventLogDrawer from '../shared/EventLogDrawer.vue'
import EmptyState from '../shared/EmptyState.vue'
import ExpandableTableRow from '@/components/shared/ExpandableTableRow.vue'
import ResponsiveTableHeader from '@/components/shared/ResponsiveTableHeader.vue'
import StageGanttChart from '../charts/StageGanttChart.vue'
import AllGroupsChart from '../shared/ContributionChart/AllGroupsChart.vue'
import OurGroupChart from '../shared/ContributionChart/OurGroupChart.vue'
import ReverseSettlementDrawer from './ReverseSettlementDrawer.vue'
import SettlementProgressDrawer from './SettlementProgressDrawer.vue'
import SettlementConfirmationDrawer from './SettlementConfirmationDrawer.vue'
import ViewerManagementDrawer from './project/ViewerManagementDrawer.vue'
import ProjectEditorDrawer from './project/ProjectEditorDrawer.vue'
import StageEditorDrawer from './project/StageEditorDrawer.vue'
import ForceVotingDrawer from './ForceVotingDrawer.vue'
import PauseStageDrawer from './PauseStageDrawer.vue'
import ResumeStageDrawer from './ResumeStageDrawer.vue'
// DISABLED: import { getTagColor } from '@/utils/tagColor' - tags system disabled
import { usePermissions } from '@/composables/usePermissions'
import { useExpandable } from '@/composables/useExpandable'
import { useAuth } from '@/composables/useAuth'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useAdminProjects } from '@/composables/useAdminProjects'
import dayjs from 'dayjs'
import { rpcClient } from '@/utils/rpc-client'
import { useFilterPersistence } from '@/composables/useFilterPersistence'
import AdminFilterToolbar from './shared/AdminFilterToolbar.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'

export default {
  name: 'ProjectManagement',
  components: {
    MarkdownEditor,
    VotingAnalysisModal,
    CommentVotingAnalysisModal,
    EventLogDrawer,
    ExpandableTableRow,
    ResponsiveTableHeader,
    StageGanttChart,
    AllGroupsChart,
    OurGroupChart,
    ReverseSettlementDrawer,
    SettlementProgressDrawer,
    SettlementConfirmationDrawer,
    ViewerManagementDrawer,
    ProjectEditorDrawer,
    StageEditorDrawer,
    ForceVotingDrawer,
    PauseStageDrawer,
    ResumeStageDrawer,
    AdminFilterToolbar,
    EmptyState,
    AnimatedStatistic,
    ConfirmationInput
  },
  setup() {
    const router = useRouter()
    const route = useRoute()

    // Register refresh function with parent SystemAdmin
    const registerRefresh = inject<(fn: (() => void) | null) => void>('registerRefresh', () => {})

    // Register action function with parent SystemAdmin
    const registerAction = inject<(fn: (() => void) | null) => void>('registerAction', () => {})

    // Permission checks
    const { hasPermission, hasAnyPermission } = usePermissions()

    // Authentication state (Vue 3 Best Practice)
    const { user, userEmail, isAuthenticated } = useAuth()

    // Responsive design
    const { isPortrait } = useMediaQuery()

    // Use TanStack Query for projects data with auth dependency
    const projectsQuery = useAdminProjects()

    // Create a computed ref for backwards compatibility with existing code
    // Cast to ExtendedProject[] for type compatibility with function parameters
    const projects = computed(() => (projectsQuery?.data?.value?.projects || []) as ExtendedProject[])

    // Filter persistence
    const { filters, resetFilters } = useFilterPersistence('projectManagement', {
      searchText: '',
      statusFilter: '',
      creatorFilter: '',
      showArchivedProjects: false
    })

    // Backward compatibility computed refs
    const searchText = computed({
      get: () => filters.value.searchText,
      set: (val) => { filters.value.searchText = val }
    })
    const statusFilter = computed({
      get: () => filters.value.statusFilter,
      set: (val) => { filters.value.statusFilter = val }
    })
    const creatorFilter = computed({
      get: () => filters.value.creatorFilter,
      set: (val) => { filters.value.creatorFilter = val }
    })
    const showArchivedProjects = computed({
      get: () => filters.value.showArchivedProjects,
      set: (val) => { filters.value.showArchivedProjects = val }
    })

    const showCreateModal = ref(false)
    const showEditModal = ref(false)
    const showViewModal = ref(false)
    const showEventLogDrawer = ref(false)
    const showViewerDrawer = ref(false)
    const loadingViewers = ref(false)
    const projectViewers = ref<ProjectViewer[]>([])
    const showStageEditor = ref(false)
    const showEditStageModal = ref(false)
    const showVotingAnalysisModal = ref(false)
    const showCommentAnalysisModal = ref(false)
    const selectedProject = ref<ExtendedProject | null>(null)
    const selectedStageForAnalysis = ref<Stage | null>(null)
    const creating = ref(false)
    const updating = ref(false)
    // Use query loading state instead of manual loading ref
    const loading = computed(() => {
      return (projectsQuery?.isLoading?.value || projectsQuery?.isFetching?.value) ?? false
    })
    const archivingProjects = ref(new Set())  // Track which projects are being archived
    const archivingStages = ref(new Set())    // Track which stages are being archived
    const settlingStages = ref(new Set())
    const showPauseStageDrawer = ref(false)   // Pause stage drawer visibility
    const pauseStageData = ref<{ stage: any; project: any } | null>(null) // Data for pause stage drawer
    const showResumeStageDrawer = ref(false)  // Resume stage drawer visibility
    const resumeStageData = ref<{ stage: any; project: any } | null>(null) // Data for resume stage drawer
    const showSettlementDrawer = ref(false)  // Settlement progress drawer visibility
    const selectedStageForSettlement = ref<Stage | null>(null) // Selected stage for settlement
    const showSettlementConfirmDrawer = ref(false) // Settlement confirmation drawer visibility
    const selectedStageForConfirm = ref<Stage | null>(null) // Selected stage for confirmation
    const showArchivedStages = ref(false)     // Toggle to show/hide archived stages
    const showGanttChart = ref(new Map<string, boolean>())     // Track gantt chart open/close state for each project
    const ganttCenterTime = ref(new Map<string, number>())    // Store centerTime for each project's gantt chart
    const projectStages = ref<Stage[]>([])
    const draggedStage = ref<Stage | null>(null)
    const editingStage = ref<Stage | null>(null)

    // DISABLED: Tag management - tags system disabled
    // const showTagModal = ref(false)
    // const allTags = ref([])
    // const currentProjectTags = ref([])
    // const tagFilterText = ref('')
    // const tagCategoryFilter = ref('')

    // DISABLED: Project creation tag management - tags system disabled
    // const selectedTags = ref([])
    // const availableTags = ref([])

    const projectForm = reactive({
      projectName: '',
      description: '',
      scoreRangeMin: 65,
      scoreRangeMax: 95
    })

    const editForm = reactive({
      projectId: '',
      projectName: '',
      description: '',
      scoreRangeMin: 65,
      scoreRangeMax: 95,
      // Scoring configuration (will be loaded from system defaults or project config)
      maxCommentSelections: 3,
      studentRankingWeight: 0.7,
      teacherRankingWeight: 0.3,
      commentRewardPercentile: 0,
      maxVoteResetCount: 1
    })

    const newStage = reactive({
      stageName: '',
      startTime: '',
      endTime: '',
      description: '',
      reportRewardPool: 0,
      commentRewardPool: 0
    })

    const newStageForm = reactive({
      stageName: '',
      startTime: '',
      endTime: ''
    })

    const editStageForm = reactive({
      stageId: '',
      stageName: '',
      startTime: '',
      endTime: '',
      description: '',
      status: 'pending',
      reportRewardPool: 0,
      commentRewardPool: 0
    })

    // Stage form error state
    const stageFormError = ref<{ title: string; message: string } | null>(null)

    // Voting lock state (prevents time editing when voting has started)
    const isVotingLocked = ref(false)
    const checkingVotingLock = ref(false)

    const loadingStages = ref(false)
    const loadingStageDetails = ref(false)
    const savingStageDetails = ref(false)
    const savingStageOrder = ref(false)
    const activeCollapse = ref<string[]>([])
    const selectedStage = ref<Stage | null>(null)
    const cloningProject = ref(false)
    const cloningStage = ref(false)

    // Clone Project Drawer State
    const showCloneProjectDrawer = ref(false)
    const cloneProjectForm = reactive<{
      sourceProject: ExtendedProject | null
      newProjectName: string
      confirmText: string
    }>({
      sourceProject: null,
      newProjectName: '',
      confirmText: ''
    })

    // Clone Stage Drawer State
    const showCloneStageDrawer = ref(false)
    const cloneStageForm = reactive<{
      sourceStage: any
      newStageName: string
      confirmText: string
      targetProjectIds: string[]
    }>({
      sourceStage: null,
      newStageName: '',
      confirmText: '',
      targetProjectIds: []
    })

    // Force Voting Drawer State
    const showForceVotingDrawer = ref(false)
    const selectedForceVotingStage = ref<Stage | null>(null)

    // Archive Project Drawer State
    const showArchiveProjectDrawer = ref(false)
    const archiveProjectForm = reactive<{
      sourceProject: ExtendedProject | null
      confirmText: string
    }>({
      sourceProject: null,
      confirmText: ''
    })

    // Reverse Settlement Drawer State
    const showReverseSettlementDrawer = ref(false)
    const reversingSettlement = ref(false)  // Loading state for reverse settlement
    const selectedStageForReverse = ref<Stage | null>(null)
    const selectedProjectForReverse = ref<ExtendedProject | null>(null)

    // Project expansion state - using useExpandable composable with URL sync
    const {
      expandedIds: expandedProjects,
      contentMap: projectStagesMap,
      loadingIds: loadingProjectStages,
      isExpanded: isProjectExpanded,
      collapseAll: collapseAllProjects
    } = useExpandable({ singleMode: true })

    // Keep currentProjectId for backwards compatibility (used in other watchers)
    const currentProjectId = computed(() => {
      const id = route.params.projectId
      return Array.isArray(id) ? id[0] : id || ''
    })

    // REMOVED: expandedTransactions (dead code - never used)

    // Project members state
    const projectMembersMap = ref(new Map())
    const loadingProjectMembers = ref(new Set())
    const showAddMemberDialog = ref(false)
    const addingMember = ref(false)
    const newMember = reactive({
      email: '',
      role: 'teacher'
    })
    const selectedProjectForMember = ref<ExtendedProject | null>(null)

    // Viewer management state
    const newViewer = reactive({
      searchText: '',
      role: 'teacher'
    })
    const searchResults = ref<User[]>([])
    const selectedUsers = ref<User[]>([])
    const searchingUsers = ref(false)
    const selectedViewers = ref<ProjectViewer[]>([])
    const batchRole = ref('')
    const viewerSearchText = ref('')
    const viewerSortField = ref('displayName')
    const viewerSortOrder = ref('asc') // 'asc' or 'desc'

    const stats = computed(() => ({
      totalProjects: projects.value.length,
      activeProjects: projects.value.filter(p => p.status === 'active').length,
      // Note: Projects don't have 'completed' status - only stages do. Using 'deleted' count instead
      deletedProjects: projects.value.filter(p => p.status === 'deleted').length,
      archivedProjects: projects.value.filter(p => p.status === 'archived').length
    }))


    const filteredProjects = computed(() => {
      let filtered = projects.value

      // Filter archived projects based on switch (highest priority)
      if (!showArchivedProjects.value) {
        filtered = filtered.filter(project => project.status !== 'archived')
      }

      if (searchText.value) {
        const search = searchText.value.toLowerCase()
        filtered = filtered.filter(project =>
          project.projectName.toLowerCase().includes(search) ||
          (project.description && project.description.toLowerCase().includes(search))
        )
      }

      if (statusFilter.value) {
        filtered = filtered.filter(project => project.status === statusFilter.value)
      }

      if (creatorFilter.value === 'me') {
        // Vue 3 Best Practice: Use useAuth() composable
        filtered = filtered.filter(project => project.createdBy === userEmail.value)
      }

      return filtered.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
    })

    // Export configuration
    const exportConfig = computed(() => ({
      data: filteredProjects.value as unknown as Record<string, unknown>[],
      filename: '專案列表',
      headers: ['專案名稱', '專案ID', '最低分', '最高分', '學生權重', '教師權重', '可排名數', '狀態'],
      rowMapper: (project: any) => [
        project.projectName,
        project.projectId,
        project.scoreRangeMin ?? 0,
        project.scoreRangeMax ?? 100,
        formatWeight(project.studentRankingWeight),
        formatWeight(project.teacherRankingWeight),
        formatCommentRanking(project),
        getStatusText(project.status)
      ]
    }))

    // Active filter count
    const activeFilterCount = computed(() => {
      let count = 0
      if (searchText.value) count++
      if (statusFilter.value) count++
      if (creatorFilter.value) count++
      if (showArchivedProjects.value) count++ // Show archived projects switch is active
      return count
    })

    // Clone form validation
    const isCloneFormValid = computed(() => {
      return cloneProjectForm.newProjectName.trim() !== '' &&
             cloneProjectForm.confirmText.toUpperCase() === 'CLONE'
    })

    // Clone stage form validation
    const isCloneStageFormValid = computed(() => {
      return cloneStageForm.newStageName.trim() !== '' &&
             cloneStageForm.confirmText.toUpperCase() === 'CLONE' &&
             cloneStageForm.targetProjectIds.length > 0
    })

    // Archive form validation
    const isArchiveFormValid = computed(() => {
      return archiveProjectForm.confirmText.toUpperCase() === 'ARCHIVE'
    })

    // Projects where user has manage permission (for clone target selection)
    // Since projects.value already contains only accessible projects for admin users,
    // we can use them directly
    const manageableProjects = computed(() => {
      return projects.value.map(project => ({
        projectId: project.projectId,
        projectName: project.projectName,
        isCurrent: project.projectId === cloneStageForm.sourceStage?.projectId
      }))
    })

    // DISABLED: Tag management computed - tags system disabled
    /*
    const filteredAvailableTags = computed(() => {
      let filtered = allTags.value.filter(tag => tag.isActive)

      // Filter out already assigned tags
      const assignedTagIds = currentProjectTags.value.map(tag => tag.tagId)
      filtered = filtered.filter(tag => !assignedTagIds.includes(tag.tagId))

      if (tagFilterText.value) {
        const search = tagFilterText.value.toLowerCase()
        filtered = filtered.filter(tag =>
          tag.tagName.toLowerCase().includes(search) ||
          (tag.description && tag.description.toLowerCase().includes(search))
        )
      }

      if (tagCategoryFilter.value) {
        filtered = filtered.filter(tag => tag.category === tagCategoryFilter.value)
      }

      return filtered.sort((a, b) => a.tagName.localeCompare(b.tagName))
    })
    */

    // Viewer management computed
    const filteredViewers = computed(() => {
      let filtered = [...projectViewers.value]

      // Apply search filter
      if (viewerSearchText.value) {
        const search = viewerSearchText.value.toLowerCase()
        filtered = filtered.filter(viewer =>
          (viewer.displayName && viewer.displayName.toLowerCase().includes(search)) ||
          (viewer.userEmail && viewer.userEmail.toLowerCase().includes(search))
        )
      }

      // Apply sorting
      if (viewerSortField.value) {
        filtered.sort((a, b) => {
          let aVal = (a as any)[viewerSortField.value]
          let bVal = (b as any)[viewerSortField.value]

          // Handle special cases
          if (viewerSortField.value === 'displayName') {
            aVal = (a.displayName || a.userEmail || '').toLowerCase()
            bVal = (b.displayName || b.userEmail || '').toLowerCase()
          } else if (viewerSortField.value === 'assignedAt') {
            aVal = a.assignedAt || 0
            bVal = b.assignedAt || 0
            // For timestamps, use numeric comparison
            return viewerSortOrder.value === 'asc' ? aVal - bVal : bVal - aVal
          } else if (aVal && bVal) {
            aVal = aVal.toLowerCase()
            bVal = bVal.toLowerCase()
          }

          // String comparison
          if (viewerSortOrder.value === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
          } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
          }
        })
      }

      return filtered
    })

    const formatTime = (timestamp: number | null | undefined): string => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW')
    }

    /**
     * 格式化权重百分比
     */
    const formatWeight = (weight: number | null | undefined): string => {
      if (weight === null || weight === undefined) return '-'
      return `${Math.round(weight * 100)}%`
    }

    /**
     * 格式化可排名数显示
     * - 百分位模式（percentile > 0）：显示"前XX%"
     * - 固定TOP N模式（percentile === 0 或 null）：显示"TOP N"
     * - 无数据：显示"系統預設"
     */
    const formatCommentRanking = (project: any): string => {
      const percentile = project.commentRewardPercentile
      const maxSelections = project.maxCommentSelections

      // 如果两个字段都为空，使用系统默认值提示
      if ((percentile === null || percentile === undefined) &&
          (maxSelections === null || maxSelections === undefined)) {
        return '系統預設'
      }

      // 百分位模式（percentile > 0）
      if (percentile && percentile > 0) {
        return `前${percentile}%`
      }

      // 固定 TOP N 模式（percentile === 0 或 null）
      return `TOP ${maxSelections || 3}`
    }

    const truncateText = (text: string | null | undefined, maxLength: number): string => {
      if (!text) return '-'
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }

    const getProgressPercentage = (project: any): number => {
      if (project.totalStages === 0) return 0
      return Math.round((project.currentStage / project.totalStages) * 100)
    }

    const getStageCompletionPercentage = (project: any): number => {
      // 根據實際完成的階段計算進度
      if (!project.stages || project.stages.length === 0) {
        // 如果沒有階段資料，使用原有的 currentStage/totalStages 邏輯作為備用
        if (project.totalStages === 0) return 0
        return Math.round((project.currentStage / project.totalStages) * 100)
      }

      const completedStages = project.stages.filter((stage: Stage) => stage.status === 'completed').length
      const totalStages = project.stages.length

      return Math.round((completedStages / totalStages) * 100)
    }

    const getStatusIcon = (status: string): string => {
      switch (status) {
        case 'active': return 'fas fa-play-circle'
        case 'completed': return 'fas fa-check-circle'
        case 'archived': return 'fas fa-archive'
        default: return 'fas fa-question-circle'
      }
    }

    const getStatusText = (status: string): string => {
      switch (status) {
        case 'active': return '進行中'
        case 'completed': return '已完成'
        case 'archived': return '已封存'
        default: return '進行中' // 預設為進行中，避免未知狀態
      }
    }

    // Refresh projects using TanStack Query refetch
    const refreshProjects = async () => {
      ElMessage.info('開始更新專案列表')
      try {
        await projectsQuery?.refetch?.()
        ElMessage.success('專案列表資料下載完成')
      } catch (error) {
        console.error('Error refreshing projects:', error)
        ElMessage.error('載入專案資料失敗，請重試')
      }
    }

    // Reset filters
    const handleResetFilters = () => {
      resetFilters()
      ElMessage.success('已清除所有篩選條件')
    }

    // DISABLED: Tag management methods - tags system disabled (backend router not available)
    /*
    const loadAllTags = async () => {
      try {
        const sessionId = sessionStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          return
        }

        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/list', {})

        if (response.success && response.data) {
          allTags.value = response.data
        } else {
          console.error('Failed to load tags:', response.error)
        }
      } catch (error) {
        console.error('Error loading tags:', error)
      }
    }

    const loadProjectTags = async (projectId = null) => {
      if (!projectId && !selectedProject.value) return

      const targetProjectId = projectId || selectedProject.value.projectId

      try {
        const sessionId = sessionStorage.getItem('sessionId')
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/project', {
        //   projectId: targetProjectId
        // })

        if (response.success && response.data) {
          currentProjectTags.value = response.data

          // Update the project's tags in the main list
          const projectIndex = projects.value.findIndex(p => p.projectId === targetProjectId)
          if (projectIndex !== -1) {
            projects.value[projectIndex].tags = response.data
          }
        } else {
          console.error('Failed to load project tags:', response.error)
          currentProjectTags.value = []
        }
      } catch (error) {
        console.error('Error loading project tags:', error)
        currentProjectTags.value = []
      }
    }

    // DISABLED: Tag assignment functions - tags system disabled (backend router not available)
    /*
    const openTagAssignment = async (project) => {
      selectedProject.value = project
      await loadProjectTags(project.projectId)
      await loadAllTags()
      showTagModal.value = true
      tagFilterText.value = ''
      tagCategoryFilter.value = ''
    }

    const assignTagToProject = async (tagId) => {
      if (!selectedProject.value) return

      try {
        const sessionId = sessionStorage.getItem('sessionId')
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/assign/project', {
        //   projectId: selectedProject.value.projectId,
        //   tagId: tagId
        // })

        if (response.success) {
          await loadProjectTags(selectedProject.value.projectId)
          ElMessage.success('標籤指派成功')
        } else {
          ElMessage.error(`指派失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Assign tag error:', error)
        ElMessage.error('指派失敗，請重試')
      }
    }

    const removeTagFromProject = async (tagId) => {
      if (!selectedProject.value) return

      try {
        const sessionId = sessionStorage.getItem('sessionId')
        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/remove/project', {
        //   projectId: selectedProject.value.projectId,
        //   tagId: tagId
        // })

        if (response.success) {
          await loadProjectTags(selectedProject.value.projectId)
          ElMessage.success('標籤已移除')
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Remove tag error:', error)
        ElMessage.error('移除失敗，請重試')
      }
    }
    */

    // DISABLED: Tag helper functions - tags system disabled (backend router not available)
    /*
    const addProjectTag = (tag) => {
      if (!selectedTags.value.find(t => t.tagId === tag.tagId)) {
        selectedTags.value.push(tag)
        // Remove from available tags
        availableTags.value = availableTags.value.filter(t => t.tagId !== tag.tagId)
      }
    }

    const removeProjectTag = (tag) => {
      selectedTags.value = selectedTags.value.filter(t => t.tagId !== tag.tagId)
      // Add back to available tags
      if (!availableTags.value.find(t => t.tagId === tag.tagId)) {
        availableTags.value.push(tag)
        availableTags.value.sort((a, b) => a.tagName.localeCompare(b.tagName))
      }
    }

    const loadTagsForCreation = async () => {
      try {
        const sessionId = sessionStorage.getItem('sessionId')
        if (!sessionId) return

        // TODO: Tags system disabled - backend router not available
        // const response = await apiClient.callWithAuth('/tags/list', {})

        if (response.success && response.data) {
          availableTags.value = response.data.filter(tag => tag.isActive)
            .sort((a, b) => a.tagName.localeCompare(b.tagName))
          selectedTags.value = []
        }
      } catch (error) {
        console.error('Error loading tags for creation:', error)
      }
    }

    const assignTagsToProject = async (projectId, tagIds) => {
      try {
        const sessionId = sessionStorage.getItem('sessionId')
        if (!sessionId) return false

        // Assign each tag to the project
        for (const tagId of tagIds) {
          // TODO: Tags system disabled - backend router not available
          // const response = await apiClient.callWithAuth('/tags/assign/project', {
          //   projectId: projectId,
          //   tagId: tagId
          // })

          if (!response.success) {
            console.error('Failed to assign tag:', response.error)
            return false
          }
        }

        return true
      } catch (error) {
        console.error('Error assigning tags to project:', error)
        return false
      }
    }
    */

    const openCreateProjectModal = async () => {
      // Reset editForm for create mode
      editForm.projectId = ''
      editForm.projectName = ''
      editForm.description = ''
      editForm.scoreRangeMin = 65
      editForm.scoreRangeMax = 95
      // Reset scoring config to defaults (will be overwritten by system defaults in drawer)
      editForm.maxCommentSelections = 3
      editForm.studentRankingWeight = 0.7
      editForm.teacherRankingWeight = 0.3
      editForm.commentRewardPercentile = 0

      // DISABLED: Load tags for creation - tags system disabled
      // await loadTagsForCreation()

      // Open the edit modal (which now handles both create and edit)
      showEditModal.value = true
    }

    const createProject = async () => {
      if (!projectForm.projectName.trim()) {
        ElMessage.warning('請輸入專案名稱')
        return
      }
      
      if (!projectForm.description.trim()) {
        ElMessage.warning('請輸入專案描述')
        return
      }
      
      // 驗證分數區間
      if (projectForm.scoreRangeMin >= projectForm.scoreRangeMax) {
        ElMessage.warning('最低分必須小於最高分')
        return
      }

      try {
        creating.value = true

        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.projects.create.$post({
          json: {
          projectData: {
            projectName: projectForm.projectName.trim(),
            description: projectForm.description.trim(),
            scoreRangeMin: projectForm.scoreRangeMin,
            scoreRangeMax: projectForm.scoreRangeMax
          }
          }
        })
        const response = await httpResponse.json()
        
        if (response.success) {
          // DISABLED: Assign selected tags to the new project - tags system disabled
          /*
          if (selectedTags.value.length > 0) {
            const tagIds = selectedTags.value.map(tag => tag.tagId)
            const tagAssignmentSuccess = await assignTagsToProject(response.data.projectId, tagIds)

            if (!tagAssignmentSuccess) {
              ElMessage.success('專案創建成功，但標籤分配部分失敗')
            }
          }
          */

          ElMessage.success('專案創建成功')
          showCreateModal.value = false
          projectForm.projectName = ''
          projectForm.description = ''
          projectForm.scoreRangeMin = 65
          projectForm.scoreRangeMax = 95
          // DISABLED: selectedTags.value = [] - tags system disabled
          // Refetch projects using TanStack Query
          projectsQuery?.refetch?.()
        } else {
          ElMessage.error(`創建失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error creating project:', error)
        ElMessage.error('創建失敗，請重試')
      } finally {
        creating.value = false
      }
    }

    const editProject = (project: any) => {
      editForm.projectId = project.projectId
      editForm.projectName = project.projectName
      editForm.description = project.description || ''
      editForm.scoreRangeMin = project.scoreRangeMin || 65
      editForm.scoreRangeMax = project.scoreRangeMax || 95
      showEditModal.value = true
    }

    /**
     * Save scoring configuration for a project
     * Always sends all scoring config fields (loaded from system defaults or project config)
     */
    const saveScoringConfig = async (projectId: string, formData: any) => {
      // Build scoring config update object with all fields
      const scoringConfig = {
        maxCommentSelections: formData.maxCommentSelections,
        studentRankingWeight: formData.studentRankingWeight,
        teacherRankingWeight: formData.teacherRankingWeight,
        commentRewardPercentile: formData.commentRewardPercentile,
        maxVoteResetCount: formData.maxVoteResetCount
      }

      try {
        const httpResponse = await rpcClient.projects[':projectId']['scoring-config'].$put({
          param: { projectId },
          json: scoringConfig
        })
        const response = await httpResponse.json()

        if (!response.success) {
          console.error('Failed to save scoring configuration:', response.error)
          ElMessage.warning('評分配置保存失敗，但專案已保存')
        }
      } catch (error) {
        console.error('Error saving scoring configuration:', error)
        ElMessage.warning('評分配置保存失敗，但專案已保存')
      }
    }

    // Unified save function for both create and update
    const saveProject = async (formData: any) => {
      // Validate the emitted form data from the child component
      if (!formData.projectName.trim()) {
        ElMessage.warning('請輸入專案名稱')
        return
      }

      if (!formData.description.trim()) {
        ElMessage.warning('請輸入專案描述')
        return
      }

      // Copy validated data to editForm for API calls
      Object.assign(editForm, formData)

      // 驗證分數區間
      if (editForm.scoreRangeMin >= editForm.scoreRangeMax) {
        ElMessage.warning('最低分必須小於最高分')
        return
      }

      try {
        updating.value = true

        if (editForm.projectId) {
          // Vue 3 Best Practice: rpcClient automatically handles authentication
          const httpResponse = await rpcClient.projects.update.$post({
          json: {
            projectId: editForm.projectId,
            updates: {
              projectName: editForm.projectName.trim(),
              description: editForm.description.trim(),
              scoreRangeMin: editForm.scoreRangeMin,
              scoreRangeMax: editForm.scoreRangeMax
            }
          }
        })
        const response = await httpResponse.json()

          if (response.success) {
            // Update scoring configuration if any fields are set
            await saveScoringConfig(editForm.projectId, formData)

            ElMessage.success('專案更新成功')
            // Refetch projects using TanStack Query
            await projectsQuery?.refetch?.()

            // Reload stages if this project is currently expanded
            if (expandedProjects.has(editForm.projectId)) {
              await loadProjectStagesForExpansion(editForm.projectId)
            }

            showEditModal.value = false
          } else {
            ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
          }
        } else {
          // Create new project
          const httpResponse = await rpcClient.projects.create.$post({
          json: {
            projectData: {
              projectName: editForm.projectName.trim(),
              description: editForm.description.trim(),
              scoreRangeMin: editForm.scoreRangeMin,
              scoreRangeMax: editForm.scoreRangeMax
            }
          }
        })
        const response = await httpResponse.json()

          if (response.success) {
            // Save scoring configuration for new project
            const newProjectId = response.data.projectId
            await saveScoringConfig(newProjectId, formData)

            // DISABLED: Assign selected tags to the new project - tags system disabled
            /*
            if (selectedTags.value.length > 0) {
              const tagIds = selectedTags.value.map(tag => tag.tagId)
              const tagAssignmentSuccess = await assignTagsToProject(response.data.projectId, tagIds)

              if (!tagAssignmentSuccess) {
                ElMessage.warning('專案創建成功，但標籤分配部分失敗')
              } else {
                ElMessage.success('專案創建成功')
              }
            } else {
            */
              ElMessage.success('專案創建成功')
            // }

            // Refetch projects using TanStack Query
            await projectsQuery?.refetch?.()
            showEditModal.value = false
            // DISABLED: selectedTags.value = [] - tags system disabled
          } else {
            ElMessage.error(`創建失敗: ${response.error?.message || '未知錯誤'}`)
          }
        }
      } catch (error) {
        console.error('Error saving project:', error)
        ElMessage.error(editForm.projectId ? '更新失敗，請重試' : '創建失敗，請重試')
      } finally {
        updating.value = false
      }
    }

    const updateProject = async () => {
      if (!editForm.projectName.trim()) {
        ElMessage.warning('請輸入專案名稱')
        return
      }

      if (!editForm.description.trim()) {
        ElMessage.warning('請輸入專案描述')
        return
      }

      // 驗證分數區間
      if (editForm.scoreRangeMin >= editForm.scoreRangeMax) {
        ElMessage.warning('最低分必須小於最高分')
        return
      }

      try {
        updating.value = true

        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.projects.update.$post({
          json: {
          projectId: editForm.projectId,
          updates: {
            projectName: editForm.projectName.trim(),
            description: editForm.description.trim(),
            scoreRangeMin: editForm.scoreRangeMin,
            scoreRangeMax: editForm.scoreRangeMax
          }
          }
        })
        const response = await httpResponse.json()
        
        if (response.success) {
          ElMessage.success('專案更新成功')
          showEditModal.value = false
          // Refetch projects using TanStack Query
          projectsQuery?.refetch?.()
        } else {
          ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error updating project:', error)
        ElMessage.error('更新失敗，請重試')
      } finally {
        updating.value = false
      }
    }

    const viewProject = async (project: any) => {
      try {
        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.projects.get.$post({
          json: {
            projectId: project.projectId

          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          selectedProject.value = response.data as ExtendedProject
          showViewModal.value = true
        } else {
          console.error('Failed to load project details:', response.error)
          selectedProject.value = project
          showViewModal.value = true
        }
      } catch (error) {
        console.error('Error loading project details:', error)
        selectedProject.value = project
        showViewModal.value = true
      }
    }

    // Open archive project drawer
    const openArchiveProjectDrawer = (project: any) => {
      archiveProjectForm.sourceProject = project
      archiveProjectForm.confirmText = ''
      showArchiveProjectDrawer.value = true
    }

    // Close archive drawer
    const closeArchiveDrawer = () => {
      showArchiveProjectDrawer.value = false
      archiveProjectForm.sourceProject = null
      archiveProjectForm.confirmText = ''
    }

    // Execute archive project (called from drawer)
    const executeArchiveProject = async () => {
      if (!archiveProjectForm.sourceProject) return

      try {
        await archiveProject(archiveProjectForm.sourceProject)
        closeArchiveDrawer()
      } catch (error) {
        console.error('Error in executeArchiveProject:', error)
      }
    }

    const archiveProject = async (project: any) => {
      try {
        // Add to archiving set
        archivingProjects.value.add(project.projectId)

        // 使用update API來更改狀態為archived
        const httpResponse = await rpcClient.projects.update.$post({
          json: {
          projectId: project.projectId,
          updates: {
            status: 'archived'
          }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('專案已封存')
          // Refetch projects using TanStack Query
          await projectsQuery?.refetch?.()
        } else {
          ElMessage.error(`封存失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error archiving project:', error)
        ElMessage.error('封存失敗，請重試')
      } finally {
        // Remove from archiving set
        archivingProjects.value.delete(project.projectId)
      }
    }

    const unarchiveProject = async (project: any) => {
      try {
        // Add to archiving set (reuse the same tracking set)
        archivingProjects.value.add(project.projectId)

        // 使用update API來更改狀態為active
        const httpResponse = await rpcClient.projects.update.$post({
          json: {
          projectId: project.projectId,
          updates: {
            status: 'active'
          }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('專案已解除封存')
          // Refetch projects using TanStack Query
          await projectsQuery?.refetch?.()
        } else {
          ElMessage.error(`解除封存失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error unarchiving project:', error)
        ElMessage.error('解除封存失敗，請重試')
      } finally {
        // Remove from archiving set
        archivingProjects.value.delete(project.projectId)
      }
    }

    // Navigate to Wallet Page
    const navigateToWallet = (project: any) => {
      router.push({
        name: 'wallets',
        params: { projectId: project.projectId }
        // 不傳 userEmail，進入全專案模式
      })
    }

    // Event Log Functions
    const openEventLogViewer = (project: any) => {
      selectedProject.value = project
      showEventLogDrawer.value = true
    }

    // Viewer Management Functions
    const handleViewerCommand = (command: string, project: Project | ExtendedProject) => {
      if (command === 'settings') {
        openViewerManagement(project)
      } else if (command === 'groups') {
        navigateToProjectGroups(project)
      }
    }

    const navigateToProjectGroups = (project: any) => {
      router.push({
        name: 'admin-groups-project-detail',
        params: { projectId: project.projectId }
      })
    }

    const openViewerManagement = async (project: any) => {
      selectedProject.value = project
      showViewerDrawer.value = true
      await loadProjectViewers(project.projectId)
    }

    const loadProjectViewers = async (projectId: string) => {
      console.log('🔍 [loadProjectViewers] Starting for projectId:', projectId)
      loadingViewers.value = true
      try {
        const httpResponse = await rpcClient.projects.viewers.list.$post({
          json: { projectId }
        })
        const response = await httpResponse.json()
        console.log('🔍 [loadProjectViewers] API response:', response)

        if (response.success && response.data) {
          projectViewers.value = response.data as ProjectViewer[]
          console.log('✅ [loadProjectViewers] Loaded viewers:', projectViewers.value)
        } else {
          console.error('❌ [loadProjectViewers] Failed to load:', response.error)
          projectViewers.value = []
          ElMessage.error(`無法載入存取者清單: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('❌ [loadProjectViewers] Exception:', error)
        projectViewers.value = []
        ElMessage.error('載入存取者清單失敗')
      } finally {
        loadingViewers.value = false
        console.log('🔍 [loadProjectViewers] Final projectViewers:', projectViewers.value)
      }
    }

    const searchUsers = async (payload: any) => {
      // Accept payload from child component event
      const searchText = payload?.searchText || payload || ''

      if (!searchText.trim()) {
        ElMessage.warning('請輸入搜尋內容')
        return
      }

      try {
        searchingUsers.value = true

        // 按行分割搜尋文字，支援多行輸入
        const searchQueries = searchText
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)

        if (searchQueries.length === 0) {
          ElMessage.warning('請輸入搜尋內容')
          searchingUsers.value = false
          return
        }

        // 對每一行執行搜尋
        const allResults = []
        const errors = []

        for (const query of searchQueries) {
          try {
            const httpResponse = await rpcClient.users.search.$post({
              json: { query, limit: 50 }
            })
            const response = await httpResponse.json()

            if (response.success && response.data) {
              allResults.push(...response.data)
            } else {
              errors.push(`搜尋「${query}」失敗: ${response.error?.message || '未知錯誤'}`)
            }
          } catch (error) {
            console.error(`Error searching for "${query}":`, error)
            errors.push(`搜尋「${query}」時發生錯誤`)
          }
        }

        // 去重（基於 userEmail）
        const uniqueResults = []
        const seenEmails = new Set()

        for (const user of allResults) {
          if (!seenEmails.has(user.userEmail)) {
            seenEmails.add(user.userEmail)
            uniqueResults.push(user)
          }
        }

        searchResults.value = uniqueResults
        selectedUsers.value = []

        // 顯示結果訊息
        if (uniqueResults.length === 0) {
          if (errors.length > 0) {
            ElMessage.error(`搜尋失敗: ${errors.join('; ')}`)
          } else {
            ElMessage.info('沒有找到符合的使用者')
          }
        } else {
          if (errors.length > 0) {
            ElMessage.warning(`找到 ${uniqueResults.length} 位使用者，但有部分搜尋失敗`)
          } else {
            ElMessage.success(`找到 ${uniqueResults.length} 位使用者`)
          }
        }
      } catch (error) {
        console.error('Error searching users:', error)
        searchResults.value = []
        ElMessage.error('搜尋使用者失敗')
      } finally {
        searchingUsers.value = false
      }
    }

    const toggleUserSelection = (userEmail: string) => {
      const index = selectedUsers.value.findIndex((u: User) => u.userEmail === userEmail)
      if (index > -1) {
        selectedUsers.value.splice(index, 1)
      } else {
        const user = searchResults.value.find((u: User) => u.userEmail === userEmail)
        if (user) selectedUsers.value.push(user)
      }
    }

    const addSelectedViewers = async (payload: any) => {
      // Accept payload from child component event
      // Users is now an array of { userEmail, role } objects
      const users = payload?.users || []

      if (users.length === 0) {
        ElMessage.warning('請選擇要新增的使用者')
        return
      }

      if (!selectedProject.value) {
        ElMessage.error('未選擇專案')
        return
      }

      try {
        loadingViewers.value = true

        // Use batch API instead of individual requests
        const httpResponse = await rpcClient.projects.viewers['add-batch'].$post({
          json: {
            projectId: selectedProject.value.projectId,
            viewers: users.map((u: any) => ({
              userEmail: u.userEmail,
              role: u.role
            }))
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          const summary = response.data?.summary || {}
          const messages = []

          if (summary.inserted > 0) messages.push(`新增 ${summary.inserted} 位`)
          if (summary.reactivated > 0) messages.push(`重新啟用 ${summary.reactivated} 位`)
          if (summary.updated > 0) messages.push(`更新角色 ${summary.updated} 位`)
          if (summary.unchanged > 0) messages.push(`${summary.unchanged} 位已存在`)

          const hasChanges = summary.inserted > 0 || summary.reactivated > 0 || summary.updated > 0

          if (messages.length > 0) {
            if (hasChanges) {
              ElMessage.success(messages.join('、'))
            } else {
              ElMessage.info(messages.join('、') + '，無需變更')
            }
          }

          // Reset and reload
          newViewer.searchText = ''
          newViewer.role = 'teacher'
          searchResults.value = []
          selectedUsers.value = []
          await loadProjectViewers(selectedProject.value.projectId)
        } else {
          ElMessage.error(response.error?.message || '新增存取者失敗')
        }
      } catch (error) {
        console.error('Error adding selected viewers:', error)
        ElMessage.error('批次新增存取者失敗')
      } finally {
        loadingViewers.value = false
      }
    }

    const updateViewerRole = async ({ userEmail, newRole }: { userEmail: string; newRole: string }) => {
      if (!selectedProject.value) {
        ElMessage.error('未選擇專案')
        return
      }

      try {
        const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
          json: {
          projectId: selectedProject.value.projectId,
          userEmail: userEmail,
          role: newRole
        }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('角色已更新')
          // Reload viewers
          await loadProjectViewers(selectedProject.value.projectId)
        } else {
          ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error updating viewer role:', error)
        ElMessage.error('更新角色失敗')
      }
    }

    const removeViewer = async (userEmail: string) => {
      if (!selectedProject.value) {
        ElMessage.error('未選擇專案')
        return
      }

      try {
        const httpResponse = await rpcClient.projects.viewers.remove.$post({
          json: {
          projectId: selectedProject.value.projectId,
          userEmail: userEmail
        }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('存取者已移除')
          // Reload viewers
          await loadProjectViewers(selectedProject.value.projectId)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing viewer:', error)
        ElMessage.error('移除存取者失敗')
      }
    }

    const toggleViewerSelection = (userEmail: string) => {
      const index = selectedViewers.value.findIndex((v: ProjectViewer) => v.userEmail === userEmail)
      if (index > -1) {
        selectedViewers.value.splice(index, 1)
      } else {
        const viewer = projectViewers.value.find((v: ProjectViewer) => v.userEmail === userEmail)
        if (viewer) selectedViewers.value.push(viewer)
      }
    }

    const toggleAllViewers = () => {
      if (selectedViewers.value.length === filteredViewers.value.length) {
        selectedViewers.value = []
      } else {
        selectedViewers.value = [...filteredViewers.value]
      }
    }

    // Viewer sorting functions
    const sortViewers = (field: string) => {
      if (viewerSortField.value === field) {
        // Toggle sort order if clicking the same field
        viewerSortOrder.value = viewerSortOrder.value === 'asc' ? 'desc' : 'asc'
      } else {
        // Set new field and default to ascending
        viewerSortField.value = field
        viewerSortOrder.value = 'asc'
      }
    }

    const getSortIcon = (field: string) => {
      if (viewerSortField.value !== field) {
        return 'fa-sort' // No sort icon
      }
      return viewerSortOrder.value === 'asc' ? 'fa-sort-up' : 'fa-sort-down'
    }

    const batchUpdateRoles = async () => {
      if (selectedViewers.value.length === 0) {
        ElMessage.warning('請選擇要更新的存取者')
        return
      }

      if (!batchRole.value) {
        ElMessage.warning('請選擇目標角色')
        return
      }

      if (!selectedProject.value) {
        ElMessage.error('未選擇專案')
        return
      }

      try {
        loadingViewers.value = true
        let successCount = 0
        let failCount = 0

        for (const userEmail of selectedViewers.value) {
          const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
          json: {
            projectId: selectedProject.value.projectId,
            userEmail: userEmail,
            role: batchRole.value
          }
        })
        const response = await httpResponse.json()

          if (response.success) {
            successCount++
          } else {
            failCount++
          }
        }

        // Show results
        if (successCount > 0 && failCount === 0) {
          ElMessage.success(`成功轉換 ${successCount} 位存取者的角色`)
        } else if (successCount > 0 && failCount > 0) {
          ElMessage.warning(`成功轉換 ${successCount} 位，失敗 ${failCount} 位`)
        } else {
          ElMessage.error('批次轉換失敗')
        }

        // Reset and reload
        if (successCount > 0) {
          selectedViewers.value = []
          batchRole.value = ''
          await loadProjectViewers(selectedProject.value.projectId)
        }
      } catch (error) {
        console.error('Error batch updating roles:', error)
        ElMessage.error('批次轉換角色失敗')
      } finally {
        loadingViewers.value = false
      }
    }

    const batchRemoveViewers = async () => {
      if (selectedViewers.value.length === 0) {
        ElMessage.warning('請選擇要刪除的存取者')
        return
      }

      if (!selectedProject.value) {
        ElMessage.error('未選擇專案')
        return
      }

      try {
        loadingViewers.value = true
        let successCount = 0
        let failCount = 0

        for (const userEmail of selectedViewers.value) {
          const httpResponse = await rpcClient.projects.viewers.remove.$post({
          json: {
            projectId: selectedProject.value.projectId,
            userEmail: userEmail
          }
        })
        const response = await httpResponse.json()

          if (response.success) {
            successCount++
          } else {
            failCount++
          }
        }

        // Show results
        if (successCount > 0 && failCount === 0) {
          ElMessage.success(`成功刪除 ${successCount} 位存取者`)
        } else if (successCount > 0 && failCount > 0) {
          ElMessage.warning(`成功刪除 ${successCount} 位，失敗 ${failCount} 位`)
        } else {
          ElMessage.error('批次刪除失敗')
        }

        // Reset and reload
        if (successCount > 0) {
          selectedViewers.value = []
          await loadProjectViewers(selectedProject.value.projectId)
        }
      } catch (error) {
        console.error('Error batch removing viewers:', error)
        ElMessage.error('批次刪除存取者失敗')
      } finally {
        loadingViewers.value = false
      }
    }

    const getDisplayName = (email: string) => {
      // Extract name part from email for display
      return email.split('@')[0]
    }

    // Project Expansion Functions - refactored to use composable
    const toggleProjectExpansion = (project: any) => {
      const projectId = project.projectId

      if (isProjectExpanded(projectId)) {
        // Collapse: navigate back to projects list
        router.push({ name: 'admin-projects' })
      } else {
        // Expand: navigate to project detail
        router.push({
          name: 'admin-projects-detail',
          params: { projectId }
        })
      }
      // Note: Actual expansion state is managed by watch() on route.params.projectId
    }

    // Define loadProjectStagesForExpansion before watch (to avoid "before initialization" error)
    const loadProjectStagesForExpansion = async (projectId: string) => {
      // Note: Loading state is now managed by watch() handler
      try {
        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.stages.list.$post({
          json: {
            projectId: projectId,
            includeArchived: true  // Always fetch all stages, filter on frontend
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data && response.data.stages) {
          // Inject projectId into each stage for later use
          const sortedStages = response.data.stages
            .map((stage: Stage) => ({ ...stage, projectId }))
            .sort((a: Stage, b: Stage) => a.stageOrder - b.stageOrder)
          projectStagesMap.set(projectId, sortedStages)
        } else {
          console.error('Failed to load stages:', response.error)
          projectStagesMap.set(projectId, [])
        }
      } catch (error) {
        console.error('Error loading stages:', error)
        projectStagesMap.set(projectId, [])
        throw error // Re-throw to let watch handler manage loading state
      }
    }

    // URL → Expansion state synchronization
    watch(
      () => route.params.projectId,
      async (paramId) => {
        const projectId = Array.isArray(paramId) ? paramId[0] : paramId
        if (projectId && !isProjectExpanded(projectId)) {
          // URL has projectId → Expand and load stages with loading state
          loadingProjectStages.add(projectId)
          expandedProjects.add(projectId)
          try {
            await loadProjectStagesForExpansion(projectId)
          } finally {
            loadingProjectStages.delete(projectId)
          }
        } else if (!projectId) {
          // URL has no projectId → Collapse all
          collapseAllProjects()
        }
      },
      { immediate: true }
    )

    // Project Members Functions
    const loadProjectMembers = async (projectId: string) => {
      loadingProjectMembers.value.add(projectId)

      try {
        const httpResponse = await rpcClient.projects.viewers.list.$post({
          json: { projectId }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          projectMembersMap.value.set(projectId, response.data)
        } else {
          console.error('Failed to load project members:', response.error)
          projectMembersMap.value.set(projectId, [])
        }
      } catch (error) {
        console.error('Error loading project members:', error)
        projectMembersMap.value.set(projectId, [])
        ElMessage.error('載入專案成員失敗')
      } finally {
        loadingProjectMembers.value.delete(projectId)
      }
    }

    const openAddMemberDialog = (project: any) => {
      selectedProjectForMember.value = project
      newMember.email = ''
      newMember.role = 'teacher'
      showAddMemberDialog.value = true
    }

    const addMemberToProject = async () => {
      if (!newMember.email || !newMember.role) {
        ElMessage.warning('請填寫完整資訊')
        return
      }

      if (!selectedProjectForMember.value) {
        ElMessage.error('未選擇專案')
        return
      }

      addingMember.value = true

      try {
        const httpResponse = await rpcClient.projects.viewers.add.$post({
          json: {
          projectId: selectedProjectForMember.value.projectId,
          userEmail: newMember.email,
          role: newMember.role
        }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('成員已新增')
          showAddMemberDialog.value = false

          // Reload members for this project
          await loadProjectMembers(selectedProjectForMember.value.projectId)
        } else {
          ElMessage.error(`新增失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error adding member:', error)
        ElMessage.error('新增成員失敗')
      } finally {
        addingMember.value = false
      }
    }

    const handleMemberRoleChange = async (newRole: string, projectId: string, member: any) => {
      try {
        const httpResponse = await rpcClient.projects.viewers['update-role'].$post({
          json: {
          projectId: projectId,
          userEmail: member.userEmail,
          role: newRole
        }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('角色已更新')
          // Reload members
          await loadProjectMembers(projectId)
        } else {
          ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error updating member role:', error)
        ElMessage.error('更新角色失敗')
      }
    }

    const removeMember = async (projectId: string, userEmail: string) => {
      try {
        const httpResponse = await rpcClient.projects.viewers.remove.$post({
          json: {
          projectId: projectId,
          userEmail: userEmail
        }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('成員已移除')
          // Reload members
          await loadProjectMembers(projectId)
        } else {
          ElMessage.error(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error removing member:', error)
        ElMessage.error('移除成員失敗')
      }
    }

    const getRoleLabel = (role: string): string => {
      const labels: Record<string, string> = {
        teacher: '教師 (Level 1)',
        observer: '觀察者 (Level 2)',
        viewer: '檢視者 (Level 2)',
        member: '成員 (Level 3)'
      }
      return labels[role] || role
    }

    const getRoleTagType = (role: string): string => {
      const types: Record<string, string> = {
        teacher: 'success',    // Green for teachers
        observer: 'info',      // Blue for observers
        viewer: 'primary',     // Purple for viewers
        member: 'warning'      // Orange for members (students)
      }
      return types[role] || 'default'
    }

    // Avatar Helper Functions
    const generateDicebearUrl = (seed: string, style: string, options: Record<string, string> = {}) => {
      const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
      const params = new URLSearchParams({
        seed: seed,
        size: '48',  // Smaller size for list view
        ...options
      })
      return `${baseUrl}?${params.toString()}`
    }

    const parseAvatarOptions = (optionsData: any): Record<string, string> => {
      if (!optionsData) return {}
      if (typeof optionsData === 'string') {
        try {
          return JSON.parse(optionsData)
        } catch (e) {
          console.warn('Failed to parse avatarOptions:', optionsData)
          return {}
        }
      }
      return optionsData
    }

    const getAvatarUrl = (user: any) => {
      const options = parseAvatarOptions(user.avatarOptions)
      return generateDicebearUrl(
        user.avatarSeed,
        user.avatarStyle || 'initials',
        options
      )
    }

    const handleAvatarError = (event: any, user: any) => {
      // Fallback to initials style
      const initials = (user.displayName || user.userEmail || 'U')
        .split(' ')
        .map((word: string) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase()

      event.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${initials}&size=48`
    }

    // Stage Editor Functions
    const openStageEditor = async (project: any) => {
      selectedProject.value = project
      showStageEditor.value = true
      activeCollapse.value = [] // 預設折疊新增階段區塊
      
      // 載入真實的階段資料
      await loadProjectStages(project.projectId)
    }

    const loadProjectStages = async (projectId: string) => {
      loadingStages.value = true
      try {
        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const httpResponse = await rpcClient.stages.list.$post({
          json: {
            projectId: projectId,
            includeArchived: true  // Always fetch all stages
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data && response.data.stages) {
          // Inject projectId into each stage for later use
          projectStages.value = response.data.stages
            .map((stage: Stage) => ({ ...stage, projectId }))
            .sort((a: Stage, b: Stage) => a.stageOrder - b.stageOrder)
        } else {
          console.error('Failed to load stages:', response.error)
          projectStages.value = []
          ElMessage.error(`無法載入階段資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading stages:', error)
        projectStages.value = []
        ElMessage.error('載入階段資料失敗，請重試')
      } finally {
        loadingStages.value = false
      }
    }


    const editStage = async (stage: any, project: any = null) => {
      // Clear any previous errors
      stageFormError.value = null

      // Ensure selectedProject is set
      if (project) {
        selectedProject.value = project
      } else if (!selectedProject.value) {
        // Find the project that contains this stage
        const projectForStage = projects.value.find(p =>
          expandedProjects.has(p.projectId) &&
          projectStagesMap.get(p.projectId)?.some((s: Stage) => s.stageId === stage.stageId)
        )
        if (projectForStage) {
          selectedProject.value = projectForStage as any
        } else {
          console.error('Cannot determine project for stage:', stage)
          ElMessage.error('無法確定階段所屬的專案')
          return
        }
      }

      editingStage.value = stage
      showEditStageModal.value = true
      loadingStageDetails.value = true

      // Show loading state
      editStageForm.stageName = '載入中...'
      editStageForm.description = ''
      editStageForm.reportRewardPool = 0
      editStageForm.commentRewardPool = 0

      try {
        // Get detailed stage information including reward pools
        const httpResponse = await rpcClient.stages.get.$post({
          json: {
            projectId: selectedProject.value!.projectId,
            stageId: stage.stageId
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data) {
          const stageDetails = response.data
          editStageForm.stageId = stageDetails.stageId
          editStageForm.stageName = stageDetails.stageName
          // 修正時區問題：使用本地時區而不是UTC
          const formatDatetimeLocal = (timestamp: number): string => {
            const date = new Date(timestamp)
            // 獲取本地時間的YYYY-MM-DDTHH:MM格式，避免時區轉換
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            return `${year}-${month}-${day}T${hours}:${minutes}`
          }
          
          editStageForm.startTime = formatDatetimeLocal(stageDetails.startTime)
          editStageForm.endTime = formatDatetimeLocal(stageDetails.endTime)
          editStageForm.description = stageDetails.description || ''
          editStageForm.status = stageDetails.status
          
          // Get reward pools directly from stage data
          editStageForm.reportRewardPool = stageDetails.reportRewardPool || 0
          editStageForm.commentRewardPool = stageDetails.commentRewardPool || 0

          // Check voting lock (if stage has votes, prevent time editing)
          await checkVotingLock(selectedProject.value!.projectId, stageDetails.stageId)
        } else {
          ElMessage.error(`載入階段詳情失敗: ${response.error?.message || '未知錯誤'}`)
          showEditStageModal.value = false
        }
      } catch (error) {
        console.error('Error loading stage details:', error)
        ElMessage.error('載入階段詳情失敗，請重試')
        showEditStageModal.value = false
      } finally {
        loadingStageDetails.value = false
      }
    }

    // Check if stage has voting records (voting lock)
    const checkVotingLock = async (projectId: string, stageId: string) => {
      if (!stageId) {
        isVotingLocked.value = false
        return
      }

      checkingVotingLock.value = true
      try {
        // Call backend API to check for votes
        const httpResponse = await rpcClient.stages['check-voting-lock'].$post({
          json: {
            projectId,
            stageId
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          isVotingLocked.value = response.data.hasVotes || false
        } else {
          // On error, assume not locked (fail-open for better UX)
          isVotingLocked.value = false
        }
      } catch (error) {
        console.error('Error checking voting lock:', error)
        isVotingLocked.value = false
      } finally {
        checkingVotingLock.value = false
      }
    }

    const updateStageDetails = async (formData: any) => {
      // Clear previous errors
      stageFormError.value = null

      // Sync fresh data from child component
      if (formData) {
        Object.assign(editStageForm, formData)
      }

      if (!editStageForm.stageName.trim()) {
        stageFormError.value = {
          title: '驗證失敗',
          message: '請輸入階段名稱'
        }
        ElMessage.error('請輸入階段名稱')
        return
      }

      if (!editStageForm.startTime || !editStageForm.endTime) {
        stageFormError.value = {
          title: '驗證失敗',
          message: '請選擇開始和結束時間'
        }
        ElMessage.error('請選擇開始和結束時間')
        return
      }

      if (new Date(editStageForm.endTime) <= new Date(editStageForm.startTime)) {
        stageFormError.value = {
          title: '驗證失敗',
          message: '結束時間必須晚於開始時間'
        }
        ElMessage.error('結束時間必須晚於開始時間')
        return
      }

      savingStageDetails.value = true
      try {
        if (editStageForm.stageId) {
          // 更新現有階段
          const updates = {
            stageName: editStageForm.stageName.trim(),
            startTime: new Date(editStageForm.startTime).getTime(),
            endTime: new Date(editStageForm.endTime).getTime(),
            description: editStageForm.description,
            reportRewardPool: editStageForm.reportRewardPool || 0,
            commentRewardPool: editStageForm.commentRewardPool || 0
          }

          const httpResponse = await rpcClient.stages.update.$post({
            json: {
              projectId: selectedProject.value!.projectId,
              stageId: editStageForm.stageId,
              updates: updates
            }
          })
          const response = await httpResponse.json()

          if (response.success) {
            ElMessage.success('階段已更新')

            // Reload project stages to ensure data sync
            await loadProjectStagesForExpansion(selectedProject.value!.projectId)

            showEditStageModal.value = false
          } else {
            stageFormError.value = {
              title: '更新失敗',
              message: response.error?.message || '未知錯誤'
            }
            ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
          }
        } else {
          // 創建新階段
          console.log('=== Creating new stage ===')
          console.log('Selected project:', selectedProject.value)

          const stages = projectStagesMap.get(selectedProject.value!.projectId) || []
          const stageData = {
            stageName: editStageForm.stageName.trim(),
            description: editStageForm.description,
            stageOrder: stages.length + 1,
            startTime: new Date(editStageForm.startTime).getTime(),
            endTime: new Date(editStageForm.endTime).getTime(),
            reportRewardPool: editStageForm.reportRewardPool || 0,
            commentRewardPool: editStageForm.commentRewardPool || 0
          }

          console.log('Stage data to create:', stageData)
          console.log('Project ID:', selectedProject.value!.projectId)

          const httpResponse = await rpcClient.stages.create.$post({
            json: {
              projectId: selectedProject.value!.projectId,
              stageData: stageData
            }
          })
          const response = await httpResponse.json()

          console.log('Create stage response:', response)

          if (response.success) {
            ElMessage.success('階段已新增')
            console.log('Stage created successfully:', response.data)

            // Reload project stages to ensure data sync
            await loadProjectStagesForExpansion(selectedProject.value!.projectId)

            showEditStageModal.value = false
          } else {
            console.error('Create stage failed:', response)
            stageFormError.value = {
              title: '新增階段失敗',
              message: response.error?.message || '未知錯誤'
            }
            ElMessage.error(`新增失敗: ${response.error?.message || '未知錯誤'}`)
          }
        }
      } catch (error) {
        console.error('Error saving stage:', error)
        ElMessage.error(editStageForm.stageId ? '更新階段失敗，請重試' : '新增階段失敗，請重試')
      } finally {
        savingStageDetails.value = false
      }
    }



    // Drag and Drop Functions
    const handleDragStart = (stage: any, event: any) => {
      draggedStage.value = stage
      event.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (event: any) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (event: any, projectId: string, targetIndex: number) => {
      event.preventDefault()
      
      if (!draggedStage.value) {
        return
      }

      const stages = projectStagesMap.get(projectId) || []
      const draggedIndex = stages.findIndex((s: Stage) => s.stageId === draggedStage.value!.stageId)
      
      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        return
      }

      // Reorder the stages array
      const newStages = [...stages]
      const draggedItem = newStages.splice(draggedIndex, 1)[0]
      newStages.splice(targetIndex, 0, draggedItem)
      
      // Update stage order
      newStages.forEach((stage, index) => {
        stage.stageOrder = index + 1
      })
      
      // Update the map
      projectStagesMap.set(projectId, newStages)
      
      // Save the new order to backend
      saveStageOrder(projectId, newStages)
      
      draggedStage.value = null
    }


    const handleDragEnd = () => {
      draggedStage.value = null
    }

    const moveStageUpInProject = async (projectId: string, currentIndex: number) => {
      if (currentIndex === 0) return

      const stages = projectStagesMap.get(projectId) || []
      const newStages = [...stages]

      // 交換位置
      const temp = newStages[currentIndex]
      newStages[currentIndex] = newStages[currentIndex - 1]
      newStages[currentIndex - 1] = temp

      // 更新順序
      newStages.forEach((stage: Stage, index: number) => {
        stage.stageOrder = index + 1
      })

      // 更新map
      projectStagesMap.set(projectId, newStages)

      // 保存到後端
      await saveStageOrder(projectId, newStages)
    }

    const moveStageDownInProject = async (projectId: string, currentIndex: number) => {
      const stages = projectStagesMap.get(projectId) || []
      if (currentIndex === stages.length - 1) return

      const newStages = [...stages]

      // 交換位置
      const temp = newStages[currentIndex]
      newStages[currentIndex] = newStages[currentIndex + 1]
      newStages[currentIndex + 1] = temp

      // 更新順序
      newStages.forEach((stage: Stage, index: number) => {
        stage.stageOrder = index + 1
      })

      // 更新map
      projectStagesMap.set(projectId, newStages)

      // 保存到後端
      await saveStageOrder(projectId, newStages)
    }

    const formatDate = (timestamp: number | null | undefined): string => {
      if (!timestamp) return '-'
      // 与ProjectDetail.vue保持一致，使用dayjs處理時間
      const date = typeof timestamp === 'number' ? dayjs(timestamp) : dayjs(timestamp)
      return date.format('YYYY/MM/DD HH:mm:ss')
    }

    // Settlement progress helper functions

    const addNewStage = async () => {
      if (!newStage.stageName.trim()) {
        ElMessage.error('請輸入階段名稱')
        return
      }

      if (!newStage.startTime || !newStage.endTime) {
        ElMessage.error('請選擇開始和結束時間')
        return
      }

      if (new Date(newStage.endTime) <= new Date(newStage.startTime)) {
        ElMessage.error('結束時間必須晚於開始時間')
        return
      }

      try {
        const stageData = {
          stageName: newStage.stageName.trim(),
          description: newStage.description,
          stageOrder: projectStages.value.length + 1,
          startTime: new Date(newStage.startTime).getTime(),
          endTime: new Date(newStage.endTime).getTime(),
          reportRewardPool: newStage.reportRewardPool || 0,
          commentRewardPool: newStage.commentRewardPool || 0
        }
        
        const httpResponse = await rpcClient.stages.create.$post({
          json: {
            projectId: selectedProject.value!.projectId,
            stageData: stageData
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('階段已新增')
          
          // Reset form
          newStage.stageName = ''
          newStage.startTime = ''
          newStage.endTime = ''
          newStage.description = ''
          newStage.reportRewardPool = 0
          newStage.commentRewardPool = 0
          
          // Reload stages
          await loadProjectStages(selectedProject.value!.projectId)
        } else {
          ElMessage.error(`新增失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error creating stage:', error)
        ElMessage.error('新增階段失敗，請重試')
      }
    }

    const onDragStart = (stage: Stage) => {
      draggedStage.value = stage
    }

    const onDrop = (targetIndex: number) => {
      if (!draggedStage.value) return

      const draggedIndex = projectStages.value.findIndex(s => s.stageId === draggedStage.value!.stageId)
      if (draggedIndex === targetIndex) return

      // Reorder the stages array
      const newStages = [...projectStages.value]
      const draggedItem = newStages.splice(draggedIndex, 1)[0]
      newStages.splice(targetIndex, 0, draggedItem)
      
      // Update stage order
      newStages.forEach((stage, index) => {
        stage.stageOrder = index + 1
      })
      
      projectStages.value = newStages
      draggedStage.value = null
    }

    const selectStage = (stage: Stage) => {
      selectedStage.value = stage
    }

    const getStageIndex = (stage: Stage) => {
      return projectStages.value.findIndex(s => s.stageId === stage.stageId)
    }
    
    const moveStageToTop = () => {
      if (!selectedStage.value) return
      const index = getStageIndex(selectedStage.value)
      if (index > 0) {
        const stages = [...projectStages.value]
        const [removed] = stages.splice(index, 1)
        stages.unshift(removed)
        updateStageOrders(stages)
      }
    }
    
    const moveStageUp = () => {
      try {
        if (!selectedStage.value) return
        const index = getStageIndex(selectedStage.value)
        if (index > 0) {
          const stages = [...projectStages.value]
          const temp = stages[index - 1]
          stages[index - 1] = stages[index]
          stages[index] = temp
          updateStageOrders(stages)
        }
      } catch (error) {
        console.error('Move stage up error:', error)
      }
    }
    
    const moveStageDown = () => {
      try {
        if (!selectedStage.value) return
        const index = getStageIndex(selectedStage.value)
        if (index < projectStages.value.length - 1) {
          const stages = [...projectStages.value]
          const temp = stages[index]
          stages[index] = stages[index + 1]
          stages[index + 1] = temp
          updateStageOrders(stages)
        }
      } catch (error) {
        console.error('Move stage down error:', error)
      }
    }
    
    const moveStageToBottom = () => {
      if (!selectedStage.value) return
      const index = getStageIndex(selectedStage.value)
      if (index < projectStages.value.length - 1) {
        const stages = [...projectStages.value]
        const [removed] = stages.splice(index, 1)
        stages.push(removed)
        updateStageOrders(stages)
      }
    }
    
    const updateStageOrders = (stages: Stage[]) => {
      stages.forEach((stage: Stage, index: number) => {
        stage.stageOrder = index + 1
      })
      projectStages.value = stages
    }
    
    const saveStageOrder = async (projectId: string | null = null, stages: Stage[] | null = null) => {
      const targetProjectId = projectId || selectedProject.value?.projectId
      const targetStages = stages || projectStages.value
      
      if (!targetProjectId || !targetStages) {
        ElMessage.error('無法保存階段順序：缺少必要參數')
        return
      }

      savingStageOrder.value = true
      try {
        // Update stage order for each stage
        for (const stage of targetStages) {
          const httpResponse = await rpcClient.stages.update.$post({
            json: {
              projectId: targetProjectId,
              stageId: stage.stageId,
              updates: { stageOrder: stage.stageOrder }
            }
          })
          const response = await httpResponse.json()

          if (!response.success) {
            console.error('Failed to update stage order:', response.error)
            ElMessage.error(`更新階段順序失敗: ${response.error?.message || '未知錯誤'}`)
            return
          }
        }
        
        ElMessage.success('階段順序已儲存')
      } catch (error) {
        console.error('Error saving stage order:', error)
        ElMessage.error('儲存階段順序失敗，請重試')
      } finally {
        savingStageOrder.value = false
      }
    }

    // Open settlement confirmation drawer
    const openSettlementConfirmDrawer = (stage: Stage & { projectId?: string }, project: ExtendedProject) => {
      // Attach projectId to stage for drawer access
      stage.projectId = project.projectId
      selectedStageForConfirm.value = stage
      showSettlementConfirmDrawer.value = true
    }

    // Handle settlement confirmation
    const handleSettlementConfirmed = (stage: Stage, projectId: string) => {
      // Close confirmation drawer
      showSettlementConfirmDrawer.value = false
      // Open progress drawer and trigger settlement
      settleStage(stage as Stage & { projectId?: string }, projectId)
    }

    // Open settlement drawer for a stage
    const settleStage = async (stage: Stage & { projectId?: string }, projectId: string, forceSettle = false) => {
      console.log('[ProjectManagement] settleStage called with:', { stageId: stage.stageId, projectId })
      // Attach projectId to stage object so drawer can access it
      stage.projectId = projectId
      selectedStageForSettlement.value = stage
      showSettlementDrawer.value = true
      settlingStages.value.add(stage.stageId)
    }

    // Handle settlement completion
    const handleSettlementComplete = async ({ stageId, settlementId, result }: { stageId: string; settlementId?: string; result: SettlementDetails }) => {
      // Update stage status in local state
      const projectId = selectedProject.value?.projectId

      // Update in projectStagesMap
      if (projectId && projectStagesMap.has(projectId)) {
        const stages = projectStagesMap.get(projectId)!
        const stageIndex = stages.findIndex((s: Stage) => s.stageId === stageId)
        if (stageIndex !== -1) {
          stages[stageIndex].status = 'completed'
        }
      }

      // Remove from settlingStages
      settlingStages.value.delete(stageId)

      // Reload stages to sync with backend
      if (projectId) {
        await loadProjectStagesForExpansion(projectId)
      }
    }

    // Handle settlement error
    const handleSettlementError = ({ stageId, error }: { stageId: string; error: string }) => {
      // Remove from settlingStages
      settlingStages.value.delete(stageId)
      // Error message already shown by child component
      ElMessage.error(`結算失敗: ${error}`)
    }

    // Handle drawer closed - refresh stage list
    const handleDrawerClosed = async ({ projectId }: { projectId: string }) => {
      console.log('[ProjectManagement] handleDrawerClosed called with projectId:', projectId)
      if (projectId) {
        console.log('[ProjectManagement] Refreshing stages for project:', projectId)
        await loadProjectStagesForExpansion(projectId)
        console.log('[ProjectManagement] Stage refresh completed')
      } else {
        console.warn('[ProjectManagement] handleDrawerClosed called without projectId')
      }
    }
    
    const handleDistributionCommand = (command: string, stage: Stage, projectId: string) => {
      if (stage.status === 'completed') {
        // 設定要顯示的階段資訊
        selectedStageForAnalysis.value = {
          ...stage,
          projectId: projectId
        }

        // 根據選擇顯示對應的分析模態窗口
        if (command === 'report') {
          showVotingAnalysisModal.value = true
        } else if (command === 'comment') {
          showCommentAnalysisModal.value = true
        }
      } else {
        ElMessage.warning('只有已結算的階段才能顯示獎金分配結果')
      }
    }

    // Open reverse settlement drawer
    const reverseSettlement = (stage: Stage, project: ExtendedProject | null) => {
      selectedStageForReverse.value = stage
      selectedProjectForReverse.value = project || selectedProject.value
      showReverseSettlementDrawer.value = true
    }

    // Handle successful reversal from the drawer component
    const handleReverseSuccess = async ({ reversalId, transactionCount, stageId, projectId }: { reversalId: string; transactionCount: number; stageId: string; projectId: string }) => {
      // Update stage status in local state
      const stageIndex = projectStages.value.findIndex((s: Stage) => s.stageId === stageId)
      if (stageIndex !== -1) {
        projectStages.value[stageIndex].status = 'voting'
      }

      // Update in projectStagesMap
      const projectStagesList = projectStagesMap.get(projectId)
      if (projectStagesList) {
        const mapStageIndex = projectStagesList.findIndex((s: Stage) => s.stageId === stageId)
        if (mapStageIndex !== -1) {
          projectStagesList[mapStageIndex].status = 'voting'
        }
      }

      // Reload stages to sync with backend
      await loadProjectStagesForExpansion(projectId)
    }

    const archiveStage = async (stage: Stage, project: ExtendedProject | null) => {
      try {
        // Add to archiving set
        archivingStages.value.add(stage.stageId)

        // Use project parameter if provided, otherwise fall back to selectedProject
        const projectId = project?.projectId || selectedProject.value?.projectId
        if (!projectId) {
          ElMessage.error('無法取得專案ID')
          return
        }

        const httpResponse = await rpcClient.stages.update.$post({
          json: {
            projectId: projectId,
            stageId: stage.stageId,
            updates: { status: 'archived' }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('階段已封存')

          // Reload stages to get updated status
          await loadProjectStagesForExpansion(projectId)
        } else {
          ElMessage.error(`封存失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error archiving stage:', error)
        ElMessage.error('封存階段失敗，請重試')
      } finally {
        // Remove from archiving set
        archivingStages.value.delete(stage.stageId)
      }
    }

    const unarchiveStage = async (stage: Stage, project: ExtendedProject | null) => {
      try {
        // Add to archiving set (reuse the same tracking set)
        archivingStages.value.add(stage.stageId)

        // Use project parameter if provided, otherwise fall back to selectedProject
        const projectId = project?.projectId || selectedProject.value?.projectId
        if (!projectId) {
          ElMessage.error('無法取得專案ID')
          return
        }

        const httpResponse = await rpcClient.stages.update.$post({
          json: {
            projectId: projectId,
            stageId: stage.stageId,
            updates: { status: 'pending' }
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success('階段已解除封存')

          // Reload stages to get updated status
          await loadProjectStagesForExpansion(projectId)
        } else {
          ElMessage.error(`解除封存失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error unarchiving stage:', error)
        ElMessage.error('解除封存階段失敗，請重試')
      } finally {
        // Remove from archiving set
        archivingStages.value.delete(stage.stageId)
      }
    }

    const getFilteredStages = (projectId: string) => {
      const stages = projectStagesMap.get(projectId) || []
      if (showArchivedStages.value) {
        return stages  // Show all stages including archived
      }
      return stages.filter((s: Stage) => s.status !== 'archived')  // Hide archived stages
    }

    // Gantt chart helper functions
    const toggleGanttChart = (projectId: string, value: boolean) => {
      showGanttChart.value.set(projectId, value)

      // Initialize centerTime to today when opening
      if (value && !ganttCenterTime.value.has(projectId)) {
        ganttCenterTime.value.set(projectId, Date.now())
      }
    }

    const transformStagesForGantt = (projectId: string) => {
      const stages = getFilteredStages(projectId)
      return stages.map((stage: Stage & { settledTime?: number }) => ({
        stageName: stage.stageName,
        startTime: stage.startTime,
        endTime: stage.endTime,
        status: stage.status,
        extraTime: stage.status === 'completed' ? (stage.settledTime || undefined) : Infinity,
        extraTimeText: stage.status === 'completed' ? '投票階段' : '投票階段將由老師手動關閉結算'
      }))
    }

    const handleGanttStageClick = (stage: Stage, projectId: string) => {
      console.log('Gantt stage clicked:', stage)
    }

    const focusStageInGantt = (stage: Stage, projectId: string) => {
      if (!showGanttChart.value.get(projectId)) return
      if (stage.startTime == null || stage.endTime == null) return

      const startTime = typeof stage.startTime === 'string' ? new Date(stage.startTime).getTime() : stage.startTime
      const endTime = typeof stage.endTime === 'string' ? new Date(stage.endTime).getTime() : stage.endTime
      const centerTime = Math.floor((startTime + endTime) / 2)

      // Update centerTime will trigger gantt chart to re-center
      ganttCenterTime.value.set(projectId, centerTime)
    }

    // Open clone project drawer
    const openCloneProjectDrawer = (project: Project | ExtendedProject) => {
      cloneProjectForm.sourceProject = project as ExtendedProject
      cloneProjectForm.newProjectName = ''
      cloneProjectForm.confirmText = ''
      showCloneProjectDrawer.value = true
    }

    // Execute clone project
    const executeCloneProject = async () => {
      if (!isCloneFormValid.value) {
        ElMessage.warning('請填寫完整資料並輸入 CLONE 確認')
        return
      }

      cloningProject.value = true
      ElMessage.info('開始複製專案，請稍候...')

      try {
        const httpResponse = await rpcClient.projects.clone.$post({
          json: {
            projectId: cloneProjectForm.sourceProject!.projectId,
            newProjectName: cloneProjectForm.newProjectName.trim()
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success(`專案「${cloneProjectForm.newProjectName}」複製成功！`)
          // Refetch projects using TanStack Query
          await projectsQuery?.refetch?.()
          // Close drawer
          closeCloneDrawer()
        } else {
          ElMessage.error(`複製失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error cloning project:', error)
        ElMessage.error('複製專案失敗，請重試')
      } finally {
        cloningProject.value = false
      }
    }

    // Close clone drawer
    const closeCloneDrawer = () => {
      showCloneProjectDrawer.value = false
      cloneProjectForm.sourceProject = null
      cloneProjectForm.newProjectName = ''
      cloneProjectForm.confirmText = ''
    }

    // Open clone stage drawer
    const openCloneStageDrawer = (stage: Stage & { projectId?: string }) => {
      cloneStageForm.sourceStage = stage
      cloneStageForm.newStageName = ''
      cloneStageForm.confirmText = ''
      cloneStageForm.targetProjectIds = stage.projectId ? [stage.projectId] : []  // 預設選中目前專案
      showCloneStageDrawer.value = true
    }

    // Execute clone stage
    const executeCloneStage = async () => {
      if (!isCloneStageFormValid.value) {
        ElMessage.warning('請填寫完整資料並輸入 CLONE 確認')
        return
      }

      cloningStage.value = true

      try {
        const targetCount = cloneStageForm.targetProjectIds.length
        ElMessage.info(`開始複製階段到 ${targetCount} 個專案，請稍候...`)

        const httpResponse = await rpcClient.stages['clone-to-projects'].$post({
          json: {
            sourceProjectId: cloneStageForm.sourceStage.projectId,
            stageId: cloneStageForm.sourceStage.stageId,
            newStageName: cloneStageForm.newStageName.trim(),
            targetProjectIds: cloneStageForm.targetProjectIds
          }
        })
        const response = await httpResponse.json()

        if (response.success) {
          ElMessage.success(`成功複製到 ${response.data.totalCloned} 個專案！`)

          // Refresh stages for affected projects that are currently expanded
          for (const projectId of cloneStageForm.targetProjectIds) {
            if (isProjectExpanded(projectId)) {
              await loadProjectStagesForExpansion(projectId)
            }
          }

          closeCloneStageDrawer()
        } else {
          const failedProject = response.data?.failedProjectId
            ? `（專案: ${response.data.failedProjectName || response.data.failedProjectId}）`
            : ''
          ElMessage.error(`複製失敗${failedProject}: ${response.error || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error cloning stage:', error)
        ElMessage.error('複製階段失敗，請重試')
      } finally {
        cloningStage.value = false
      }
    }

    // Close clone stage drawer
    const closeCloneStageDrawer = () => {
      showCloneStageDrawer.value = false
      cloneStageForm.sourceStage = null
      cloneStageForm.newStageName = ''
      cloneStageForm.confirmText = ''
      cloneStageForm.targetProjectIds = []
    }

    // Force Voting Drawer Functions
    const openForceVotingDrawer = (stage: Stage & { projectId?: string }) => {
      selectedForceVotingStage.value = stage
      showForceVotingDrawer.value = true
    }

    const handleForceVotingConfirmed = () => {
      // Reload stage list after force voting
      if (selectedForceVotingStage.value?.projectId) {
        loadProjectStagesForExpansion(selectedForceVotingStage.value.projectId)
      }
      selectedForceVotingStage.value = null
    }

    // Pause Stage Drawer Functions
    const openPauseStageDrawer = (stage: any, project: any) => {
      pauseStageData.value = { stage, project }
      showPauseStageDrawer.value = true
    }

    const handlePauseStageConfirmed = () => {
      // Reload stage list after pausing
      if (pauseStageData.value?.project?.projectId) {
        loadProjectStagesForExpansion(pauseStageData.value.project.projectId)
      }
      pauseStageData.value = null
    }

    // Resume Stage Drawer Functions
    const openResumeStageDrawer = (stage: any, project: any) => {
      resumeStageData.value = { stage, project }
      showResumeStageDrawer.value = true
    }

    const handleResumeStageConfirmed = () => {
      // Reload stage list after resuming
      if (resumeStageData.value?.project?.projectId) {
        loadProjectStagesForExpansion(resumeStageData.value.project.projectId)
      }
      resumeStageData.value = null
    }

    // Additional helper functions for stage management
    const showSettlementDistribution = (stage: Stage & { projectId?: string }) => {
      handleDistributionCommand('report', stage, stage.projectId || '')
    }

    const canSettleStage = (stage: Stage) => {
      const now = Date.now()
      return stage.endTime != null && stage.endTime < now && stage.status === 'active'
    }

    const openVotingAnalysisModal = (stage: Stage & { projectId?: string }) => {
      selectedStageForAnalysis.value = stage
      showVotingAnalysisModal.value = true
    }

    // 為專案列表中的空階段打開階段編輯器
    const openCreateStageForProject = async (project: Project | ExtendedProject) => {
      console.log('=== openCreateStageForProject called ===')
      console.log('Project:', project)

      selectedProject.value = project

      // Clear any previous errors
      stageFormError.value = null

      // 載入真實的階段資料以便計算新階段的順序
      await loadProjectStagesForExpansion(project.projectId)

      // 重置表單為新增模式
      editingStage.value = null
      editStageForm.stageId = ''
      editStageForm.stageName = ''
      editStageForm.description = ''
      editStageForm.reportRewardPool = 0
      editStageForm.commentRewardPool = 0

      // 設定預設時間（現在到一週後）
      const now = new Date()
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const formatDatetimeLocal = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      }

      editStageForm.startTime = formatDatetimeLocal(now)
      editStageForm.endTime = formatDatetimeLocal(nextWeek)

      // 重要：關閉載入狀態，否則drawer會一直顯示"載入中..."
      loadingStageDetails.value = false

      console.log('Opening drawer with form:', editStageForm)

      // 打開編輯階段的drawer（新增模式）
      showEditStageModal.value = true
    }

    // 在階段編輯器中打開新增階段面板
    const openCreateStagePanel = () => {
      activeCollapse.value = ['newStage'] // 展開新增階段區塊
    }

    // WebSocket settlement progress handler

    // No onMounted needed - TanStack Query automatically fetches when auth is ready
    // But we do need to register the refresh function with parent SystemAdmin
    onMounted(() => {
      registerRefresh(refreshProjects)
      registerAction(openCreateProjectModal)
    })

    // Cleanup on component unmount - prevent memory leaks from Maps and Sets
    onUnmounted(() => {
      // These are from useExpandable() composable - reactive Maps (need .value)
      projectStagesMap.clear()
      loadingProjectStages.clear()
      // These ARE refs - need .value
      projectMembersMap.value.clear()
      loadingProjectMembers.value.clear()
      archivingProjects.value.clear()
      archivingStages.value.clear()
      settlingStages.value.clear()
      showGanttChart.value.clear()
      ganttCenterTime.value.clear()
    })

    onBeforeUnmount(() => {
      // Cleanup: unregister refresh and action functions
      registerRefresh(null)
      registerAction(null)
    })

    // Watch for URL projectId changes to auto-load stages and members
    watch(currentProjectId, async (newProjectId) => {
      if (newProjectId) {
        // Auto-load stages for the expanded project
        if (!projectStagesMap.has(newProjectId)) {
          await loadProjectStagesForExpansion(newProjectId)
        }
        // Auto-load members for the expanded project
        if (!projectMembersMap.value.has(newProjectId)) {
          await loadProjectMembers(newProjectId)
        }
      }
    }, { immediate: true })

    return {
      // Permission checks
      hasPermission,
      hasAnyPermission,
      projects,
      // Responsive design
      isPortrait,
      searchText,
      statusFilter,
      creatorFilter,
      showArchivedProjects,
      showCreateModal,
      showEditModal,
      showViewModal,
      selectedProject,
      creating,
      updating,
      loading,
      projectForm,
      editForm,
      stats,
      filteredProjects,
      exportConfig,
      activeFilterCount,
      formatTime,
      formatWeight,
      formatCommentRanking,
      truncateText,
      getProgressPercentage,
      getStageCompletionPercentage,
      getStatusIcon,
      getStatusText,
      // DISABLED: Tag management - tags system disabled
      // showTagModal,
      // allTags,
      // currentProjectTags,
      // tagFilterText,
      // tagCategoryFilter,
      // filteredAvailableTags,
      // openTagAssignment,
      // assignTagToProject,
      // removeTagFromProject,
      // loadAllTags,
      // loadProjectTags,
      // DISABLED: Project creation tag management - tags system disabled
      // selectedTags,
      // availableTags,
      openCreateProjectModal,
      // addProjectTag,
      // removeProjectTag,
      // loadTagsForCreation,
      // assignTagsToProject,
      refreshProjects,
      handleResetFilters,
      createProject,
      editProject,
      updateProject,
      viewProject,
      archiveProject,
      unarchiveProject,
      openCloneProjectDrawer,
      executeCloneProject,
      closeCloneDrawer,
      showCloneProjectDrawer,
      cloneProjectForm,
      isCloneFormValid,
      // Archive Project Drawer
      showArchiveProjectDrawer,
      archiveProjectForm,
      isArchiveFormValid,
      openArchiveProjectDrawer,
      executeArchiveProject,
      closeArchiveDrawer,
      navigateToWallet,
      openEventLogViewer,
      showEventLogDrawer,
      // Viewer management
      handleViewerCommand,
      navigateToProjectGroups,
      openViewerManagement,
      showViewerDrawer,
      loadingViewers,
      projectViewers,
      newViewer,
      searchResults,
      selectedUsers,
      searchingUsers,
      selectedViewers,
      batchRole,
      viewerSearchText,
      viewerSortField,
      viewerSortOrder,
      filteredViewers,
      sortViewers,
      getSortIcon,
      loadProjectViewers,
      searchUsers,
      toggleUserSelection,
      addSelectedViewers,
      updateViewerRole,
      removeViewer,
      toggleViewerSelection,
      toggleAllViewers,
      batchUpdateRoles,
      batchRemoveViewers,
      getDisplayName,
      showStageEditor,
      showEditStageModal,
      showVotingAnalysisModal,
      showCommentAnalysisModal,
      selectedStageForAnalysis,
      settlingStages,
      showSettlementDrawer,
      selectedStageForSettlement,
      projectStages,
      draggedStage,
      editingStage,
      newStage,
      newStageForm,
      editStageForm,
      stageFormError,
      isVotingLocked,
      checkingVotingLock,
      openStageEditor,
      loadProjectStages,
      addNewStage,
      editStage,
      updateStageDetails,
      settleStage,
      handleSettlementComplete,
      handleSettlementError,
      handleDrawerClosed,
      handleDistributionCommand,
      reverseSettlement,
      archiveStage,
      openCloneStageDrawer,
      executeCloneStage,
      closeCloneStageDrawer,
      showCloneStageDrawer,
      cloneStageForm,
      isCloneStageFormValid,
      manageableProjects,
      saveStageOrder,
      onDragStart,
      onDrop,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
      formatDate,
      getStageStatusText,
      getStageStatusType,
      loadingStages,
      loadingStageDetails,
      savingStageDetails,
      savingStageOrder,
      activeCollapse,
      // Project expansion
      currentProjectId,
      expandedProjects,
      projectStagesMap,
      loadingProjectStages,
      toggleProjectExpansion,
      loadProjectStagesForExpansion,
      showSettlementDistribution,
      canSettleStage,
      openVotingAnalysisModal,
      // Gantt chart
      showGanttChart,
      ganttCenterTime,
      toggleGanttChart,
      transformStagesForGantt,
      handleGanttStageClick,
      focusStageInGantt,
      // Project members
      projectMembersMap,
      loadingProjectMembers,
      showAddMemberDialog,
      addingMember,
      newMember,
      selectedProjectForMember,
      loadProjectMembers,
      openAddMemberDialog,
      addMemberToProject,
      handleMemberRoleChange,
      removeMember,
      getRoleLabel,
      getRoleTagType,
      // Avatar helpers
      generateDicebearUrl,
      parseAvatarOptions,
      getAvatarUrl,
      handleAvatarError,
      selectedStage,
      cloningProject,
      cloningStage,
      // Reverse Settlement Drawer
      showReverseSettlementDrawer,
      reversingSettlement,
      selectedStageForReverse,
      selectedProjectForReverse,
      handleReverseSuccess,
      // Settlement Confirmation Drawer
      showSettlementConfirmDrawer,
      selectedStageForConfirm,
      openSettlementConfirmDrawer,
      handleSettlementConfirmed,
      openForceVotingDrawer,
      handleForceVotingConfirmed,
      showForceVotingDrawer,
      selectedForceVotingStage,
      // Pause Stage Drawer
      showPauseStageDrawer,
      pauseStageData,
      openPauseStageDrawer,
      handlePauseStageConfirmed,
      // Resume Stage Drawer
      showResumeStageDrawer,
      resumeStageData,
      openResumeStageDrawer,
      handleResumeStageConfirmed,
      selectStage,
      getStageIndex,
      moveStageToTop,
      moveStageUp,
      moveStageDown,
      moveStageUpInProject,
      moveStageDownInProject,
      moveStageToBottom,
      updateStageOrders,
      openCreateStageForProject,
      openCreateStagePanel,
      // Archive functionality
      archivingProjects,
      archivingStages,
      showArchivedStages,
      unarchiveStage,
      getFilteredStages,
      saveProject
      // DISABLED: getTagColor - tags system disabled
    }
  }
}
</script>

<style scoped>
.project-management {
  padding: 20px;
}

/* 統計卡片 */
.stats-card {
  margin-bottom: 20px;
}

.stats-card :deep(.el-row) {
  display: flex;
  flex-wrap: wrap;
}

.stats-card :deep(.el-col) {
  display: flex;
  justify-content: center;
}

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.header-left h2 {
  margin: 0 0 10px 0;
  color: #2c5aa0;
}

.header-left h2 i {
  margin-right: 10px;
}

/* Stats Display using el-statistic */
.project-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.project-stats :deep(.el-statistic) {
  flex: 1;
  min-width: 200px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  transition: all 0.2s;
}

.project-stats :deep(.el-statistic):hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.project-stats :deep(.el-statistic__head) {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.project-stats :deep(.el-statistic__content) {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.project-stats :deep(.el-statistic) i {
  font-size: 18px;
  margin-right: 8px;
  color: #909399;
}

/* Status-specific icon colors */
.project-stats :deep(.stat-active) i {
  color: #67c23a;
}

.project-stats :deep(.stat-completed) i {
  color: #409eff;
}

.project-stats :deep(.stat-archived) i {
  color: #909399;
}

.header-right {
  display: flex;
  gap: 10px;
}

/* Teacher Privilege Notice */
.teacher-notice {
  background: #e6f3ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0050b3;
}

.teacher-notice i {
  font-size: 16px;
  color: #1890ff;
}

.teacher-notice span {
  font-size: 14px;
  font-weight: 500;
}

/* Old filter styles removed - now using AdminFilterToolbar */

.table-container {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.project-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  min-width: 1000px;
}

.project-table th,
.project-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.project-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.project-table tr:hover {
  background: #f8f9fa;
}

.project-name {
  font-weight: 500;
  color: #2c5aa0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 表格列宽度和对齐优化 */
.project-table th:nth-child(2),  /* 最低分 */
.project-table th:nth-child(3),  /* 最高分 */
.project-table th:nth-child(4),  /* 学生权重 */
.project-table th:nth-child(5) { /* 教师权重 */
  width: 80px;
  text-align: center;
}

.project-table th:nth-child(6) { /* 可排名数 */
  width: 100px;
  text-align: center;
}

.project-table td:nth-child(2),
.project-table td:nth-child(3),
.project-table td:nth-child(4),
.project-table td:nth-child(5),
.project-table td:nth-child(6) {
  text-align: center;
}

/* 主行和展开图标样式由 ExpandableTableRow 统一提供 */

.stages-container td {
  padding: 0;
  background: #f8fbff;
}

.stages-list {
  padding: 16px;
  border-left: 4px solid #2c5aa0;
  margin-left: 20px;
  width: calc(100% - 40px);
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .stages-list {
    margin-left: 8px;
    width: calc(100% - 16px);
    padding: 12px;
  }
}

.no-stages {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-style: italic;
  padding: 20px;
  text-align: center;
}

.stage-item {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 12px;
  padding: 16px;
  transition: all 0.3s ease;
}

.stage-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #2c5aa0;
}

.stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-name {
  font-weight: 600;
  color: #333;
  font-size: 16px;
}

.stage-status {
  display: flex;
  align-items: center;
}

.stage-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .stage-actions {
    width: 100%;
    margin-top: 8px;
    justify-content: flex-start;
  }
  
  .stage-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .stage-status {
    align-self: flex-end;
  }
}

.stage-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.stage-time {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 14px;
}

.stage-pools {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .stage-pools {
    gap: 8px;
  }
  
  .pool-item {
    font-size: 12px;
    padding: 3px 6px;
  }
  
  .stage-item {
    padding: 12px;
  }
  
  .stage-name {
    font-size: 14px;
  }
}

.pool-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #333;
  font-size: 14px;
  background: #f0f4f8;
  padding: 4px 8px;
  border-radius: 4px;
}

.status-pending {
  background: #fff3cd;
  color: #856404;
}

.status-active {
  background: #d1ecf1;
  color: #0c5460;
}

.status-voting {
  background: #d4edda;
  color: #155724;
}

.status-completed {
  background: #d4edda;
  color: #155724;
}

.status-archived {
  background: #f8d7da;
  color: #721c24;
}

/* Expanded stages styles */
.stages-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.stages-header h4 {
  margin: 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}

.stages-header .header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stages-list-wrapper {
  margin-top: 16px;
  width: 100%;
  box-sizing: border-box;
}

.stages-container-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.expanded-stage-item {
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #ddd;
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
  cursor: grab;
}

.expanded-stage-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #2c5aa0;
}

.expanded-stage-item.dragging {
  opacity: 0.5;
  transform: rotate(5deg);
  cursor: grabbing;
}

.stage-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  color: #666;
  cursor: grab;
  margin-right: 12px;
}

.stage-handle:hover {
  color: #2c5aa0;
}

.stage-info {
  flex: 1;
  min-width: 0;
}

.stage-name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.stage-order {
  font-size: 12px;
  color: #666;
  background: #f0f4f8;
  padding: 2px 6px;
  border-radius: 4px;
}

.stage-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.stage-dates {
  font-size: 14px;
  color: #666;
}

.stage-desc {
  font-size: 13px;
  color: #888;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-rewards {
  display: flex;
  gap: 8px;
}

.reward-badge {
  font-size: 12px;
  background: #f0f4f8;
  color: #333;
  padding: 2px 6px;
  border-radius: 4px;
}

.stage-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: 16px;
}

/* 響應式佈局：直屏模式 */
.stages-header.portrait-mode {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.header-actions-mobile {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.expanded-stage-item.portrait-mode {
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.expanded-stage-item.portrait-mode .stage-handle {
  position: absolute;
  top: 16px;
  left: 16px;
  margin-right: 0;
}

.expanded-stage-item.portrait-mode .stage-info {
  padding-left: 32px;
}

.stage-actions-mobile {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px dashed #ddd;
  justify-content: flex-start;
}

/* Transaction expansion styles */
.transaction-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.transaction-row:hover {
  background: #f8f9fa;
}

.transaction-row.expanded {
  background: #e8f4f8;
}

.transaction-details td {
  padding: 0;
  background: #f8fbff;
  border-top: none;
}

.details-container {
  padding: 16px 20px;
  border-left: 4px solid #2c5aa0;
  margin: 0 20px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section h4 {
  margin: 0 0 8px 0;
  color: #333;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-content {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}

.submission-content,
.comment-content {
  max-height: 200px;
  overflow-y: auto;
  line-height: 1.5;
  color: #333;
}

.detail-loading {
  color: #666;
  font-style: italic;
  padding: 12px;
  text-align: center;
  background: #f8f9fa;
  border-radius: 4px;
}

.detail-meta {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #666;
}

.meta-time,
.meta-author {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-time i,
.meta-author i {
  color: #2c5aa0;
  font-size: 12px;
}

@media (max-width: 768px) {
  .detail-meta {
    flex-direction: column;
    gap: 8px;
  }
}

.description {
  max-width: 200px;
  word-wrap: break-word;
}

.stage-progress {
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 80px;
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
  background: #d1ecf1;
  color: #0c5460;
}

.status-badge.completed {
  background: #d4edda;
  color: #155724;
}

.status-badge.archived {
  background: #f8d7da;
  color: #721c24;
}

.status-badge i {
  margin-right: 4px;
}

.actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 180px;
}

/* Custom button styles removed - now using Element Plus el-button */

.no-data {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-data i {
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
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 700px;
}

.modal-content h3 {
  margin: 0 0 20px 0;
  color: #2c5aa0;
}

.modal-content h3 i {
  margin-right: 10px;
}

.modal-subtitle {
  color: #666;
  margin: -10px 0 20px 0;
  font-size: 14px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.project-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  gap: 15px;
}

.detail-row label {
  font-weight: 600;
  min-width: 120px;
  color: #333;
}

.detail-row span {
  flex: 1;
  color: #666;
}

.mono {
  font-family: monospace;
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

/* Wallet Management Drawer Styles - Using scoped workaround */

.wallet-drawer-header h3 {
  display: none; /* 使用 el-drawer 內建的 title */
}

.wallet-drawer-header h3 i {
  display: none;
}

.wallet-drawer-header p {
  display: none;
}

.wallet-drawer-content {
  padding: 20px;
  color: white;
  height: 100%;
  overflow-y: auto;
}

/* Viewer Management Drawer Styles */
.viewer-drawer-content {
  padding: 20px;
  color: #303133;
  height: 100%;
  overflow-y: auto;
}

.add-viewer-section {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  border: 1px solid #e4e7ed;
}

.add-viewer-section h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.add-viewer-section h4 i {
  margin-right: 8px;
  color: #409eff;
}

.search-users-area {
  margin-bottom: 20px;
}

.search-label {
  display: block;
  color: #303133;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.search-textarea {
  margin-bottom: 8px;
}

.help-text {
  color: #909399;
  font-size: 12px;
  margin-bottom: 12px;
}

.search-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.viewer-role-select {
  flex: 1;
  min-width: 180px;
}

.search-results {
  margin-top: 20px;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 15px;
  border: 1px solid #e4e7ed;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #dcdfe6;
}

.results-header span {
  color: #303133;
  font-size: 14px;
  font-weight: 500;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #e4e7ed;
}

.search-result-item:hover {
  background: #ecf5ff;
  border-color: #b3d8ff;
}

.search-result-item.selected {
  background: #ecf5ff;
  border: 2px solid #409eff;
}

.search-result-item .user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.search-result-item .user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-result-item .user-details {
  flex: 1;
}

.search-result-item .user-name {
  color: #303133;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
}

.search-result-item .user-email {
  color: #909399;
  font-size: 12px;
}

.search-status {
  text-align: center;
  padding: 30px;
  color: #909399;
  font-size: 14px;
}

.viewers-list-section {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  border: 1px solid #e4e7ed;
}

.viewers-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 15px;
}

.viewers-list-header h4 {
  margin: 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.viewers-list-header h4 i {
  margin-right: 8px;
  color: #409eff;
}

.viewers-search-box {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 400px;
}

.batch-operations {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.selected-count {
  color: #303133;
  font-size: 14px;
  font-weight: 500;
  padding: 0 8px;
}

.batch-role-select {
  min-width: 120px;
}

.no-viewers {
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: #909399;
  text-align: center;
  min-height: 200px;
  background: white;
  border-radius: 8px;
  border: 2px dashed #dcdfe6;
}

.no-viewers i {
  font-size: 64px;
  opacity: 0.6;
  color: #409eff;
}

.no-viewers p {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #606266 !important;
}

.viewers-table {
  overflow-x: auto;
}

.viewer-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.viewer-table thead {
  background: #f5f7fa;
}

.viewer-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #303133;
  font-size: 13px;
  border-bottom: 1px solid #e4e7ed;
}

.viewer-table th.sortable-header {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
  position: relative;
}

.viewer-table th.sortable-header:hover {
  background-color: rgba(59, 130, 246, 0.1);
}

.viewer-table th.sortable-header .sort-icon {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.viewer-table th.sortable-header:hover .sort-icon {
  opacity: 0.8;
}

.viewer-table th.sortable-header .fa-sort-up,
.viewer-table th.sortable-header .fa-sort-down {
  opacity: 1;
  color: #3b82f6;
}

.viewer-table th.checkbox-col {
  width: 50px;
  text-align: center;
  padding: 12px 8px;
}

.viewer-table td {
  padding: 12px;
  color: #333;
  border-bottom: 1px solid #e5e7eb;
}

.viewer-table td.checkbox-col {
  width: 50px;
  text-align: center;
  padding: 12px 8px;
}

.viewer-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-name {
  font-weight: 600;
  color: #1f2937;
}

.viewer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.role-select-inline {
  width: 120px;
}

.project-management .viewer-drawer :deep(.el-drawer__body) {
  padding: 0 !important;
  height: 100% !important;
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #3b82f6 100%) !important;
}

/* Stage Editor and Edit Stage Drawer Styles */
.project-management .stage-editor-drawer :deep(.el-drawer__header),
.project-management .edit-stage-drawer :deep(.el-drawer__header) {
  background: #2c5aa0 !important;
  color: white !important;
  border-bottom: 1px solid #1e3a8a !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
}

.project-management .stage-editor-drawer :deep(.el-drawer__title),
.project-management .edit-stage-drawer :deep(.el-drawer__title) {
  color: white !important;
  font-size: 20px !important;
  font-weight: 600 !important;
}

.project-management .stage-editor-drawer :deep(.el-drawer__close-btn),
.project-management .edit-stage-drawer :deep(.el-drawer__close-btn) {
  color: white !important;
  font-size: 18px !important;
}

.project-management .stage-editor-drawer :deep(.el-drawer__close-btn:hover),
.project-management .edit-stage-drawer :deep(.el-drawer__close-btn:hover) {
  color: #93c5fd !important;
}

.drawer-header {
  background: transparent;
  backdrop-filter: blur(10px);
  padding: 25px 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  color: white;
}

.drawer-header h3, h3.accessibleListHeader {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: white;
  font-weight: 600;
}

.drawer-header h3 i {
  margin-right: 10px;
  color: #4ade80;
}

.drawer-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

/* Close button styles are now handled above */

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 30px;
  background: white;
}

.project-management .wallet-drawer :deep(.el-drawer__body) {
  padding: 0 !important;
  height: 100% !important;
  background: linear-gradient(135deg, #006633 0%, #004d26 50%, #002d1a 100%) !important;
}

.project-management .stage-editor-drawer :deep(.el-drawer__body),
.project-management .edit-stage-drawer :deep(.el-drawer__body) {
  padding: 20px !important;
  background: #f5f7fa !important;
}

/* Wallet Filters */
.wallet-filters {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  border: 1px solid #dee2e6;
}

.filter-row {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 15px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #333;
}

.filter-item label {
  font-weight: 500;
  color: #333;
  min-width: 80px;
}

.display-slider {
  width: 200px;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: #e9ecef;
  outline: none;
}

.display-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2c5aa0;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.display-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2c5aa0;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.limit-text {
  color: #2c5aa0;
  font-weight: 600;
  min-width: 60px;
}

.filter-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
  color: #333;
  font-size: 14px;
  transition: all 0.3s ease;
}

.filter-input:focus {
  outline: none;
  border-color: #2c5aa0;
  box-shadow: 0 0 0 2px rgba(44, 90, 160, 0.2);
}

.filter-input::placeholder {
  color: #6c757d;
}

/* Transactions Table */
.transactions-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dee2e6;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.transactions-table {
  width: 100%;
  border-collapse: collapse;
  color: #333;
}

.transactions-table th {
  background: #f8f9fa;
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #dee2e6;
  font-size: 14px;
}

.transactions-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f8f9fa;
  vertical-align: middle;
}

.transactions-table tr:hover {
  background: #f8f9fa;
}

.points.positive {
  color: #28a745;
  font-weight: 600;
}

.points.negative {
  color: #dc3545;
  font-weight: 600;
}

/* New Transaction Table Columns */
.transaction-id,
.related-id,
.settlement-id {
  font-size: 11px;
  font-family: 'Courier New', monospace;
  color: #6b7280;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-type {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.transaction-type.submission_reward {
  background: rgba(74, 222, 128, 0.3);
  color: #4ade80;
}

.transaction-type.comment_reward {
  background: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.transaction-type.vote_reward {
  background: rgba(168, 85, 247, 0.3);
  color: #a855f7;
}

.transaction-type.bonus_award {
  background: rgba(251, 191, 36, 0.3);
  color: #fbbf24;
}

.transaction-type.penalty {
  background: rgba(248, 113, 113, 0.3);
  color: #f87171;
}

.transaction-type.stage_completion {
  background: rgba(99, 102, 241, 0.3);
  color: #6366f1;
}

.transaction-type.settlement_reversal {
  background: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.transaction-type.comment_settlement {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.btn-danger {
  background: rgba(248, 113, 113, 0.8);
  color: white;
  border: 1px solid rgba(248, 113, 113, 0.5);
  backdrop-filter: blur(5px);
}

.btn-danger:hover {
  background: rgba(248, 113, 113, 1);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(248, 113, 113, 0.3);
}

.btn-danger:disabled {
  background: rgba(107, 114, 128, 0.5);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.no-transactions {
  text-align: center;
  padding: 50px 20px;
  color: rgba(255, 255, 255, 0.7);
}

.no-transactions i {
  font-size: 48px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 15px;
}

/* Stage Editor Drawer Styles */
.stage-editor-drawer {
  z-index: 1500;
}

.stage-editor-drawer .el-drawer__header {
  background: #2c5aa0;
  color: white;
  padding: 20px;
  margin-bottom: 0;
}

.drawer-header h3 {
  margin: 0;
  color: white;
  font-size: 18px;
}

.drawer-header h3 i {
  margin-right: 10px;
}

.stage-editor-drawer .el-drawer__body {
  padding: 20px;
}

.drawer-actions {
  position: sticky;
  bottom: 0;
  background: white;
  padding: 20px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin: 0 -20px -20px -20px;
}

/* Edit Stage Modal - Higher z-index */
.edit-stage-modal {
  z-index: 2000;
}

.edit-stage-modal .modal-content {
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.stage-form {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 25px;
  border: 1px solid #e9ecef;
}

.stage-form h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.form-actions {
  margin-top: 15px;
}

.stage-list {
  margin-bottom: 25px;
}

.stage-list h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.stages-container {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
}

.stage-order {
  font-size: 12px;
  color: #666;
  font-weight: normal;
  margin-left: 10px;
}

.stage-details {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.stage-duration {
  padding: 2px 6px;
  background: #e9ecef;
  border-radius: 3px;
}

.stage-desc {
  flex: 1;
  font-style: italic;
}

.form-section {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.form-section h5 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 14px;
  font-weight: 600;
}

.form-section h5 i {
  margin-right: 8px;
}

.stage-rewards {
  margin-top: 8px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.reward-badge {
  background: #e3f2fd;
  color: #1565c0;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.stage-dates {
  font-size: 12px;
  color: #666;
  padding: 2px 6px;
  background: #f8f9fa;
  border-radius: 3px;
  font-family: monospace;
}

.modal-subtitle {
  margin: -10px 0 20px 0;
  color: #666;
  font-size: 14px;
}

.form-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.editor-subtitle {
  color: #666;
  margin: -10px 0 20px 0;
  font-size: 14px;
}

.stage-create-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 25px;
  border: 1px solid #e9ecef;
}

.stage-create-section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.form-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.form-row .form-input {
  flex: 1;
  margin-bottom: 0;
}

.stage-list-section {
  margin-bottom: 25px;
}

.stage-list-section h4 {
  margin: 0 0 15px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.stage-list {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
}

.stage-item {
  display: flex;
  align-items: center;
  padding: 15px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  transition: all 0.3s ease;
  cursor: pointer;
}

.stage-item:last-child {
  border-bottom: none;
}

.stage-item:hover {
  background: #f8f9fa;
}

.stage-item.dragging {
  opacity: 0.5;
  transform: translateX(5px) translateY(-2px);
  cursor: grabbing;
}

.stage-handle {
  color: #6c757d;
  margin-right: 15px;
  cursor: grab;
  padding: 5px;
}

.stage-handle:hover {
  color: #2c5aa0;
}

.stage-info {
  flex: 1;
}

.stage-number {
  background: #2c5aa0;
  color: white;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.stage-details {
  flex: 1;
}

.stage-name {
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-dates {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.stage-status .status-badge.pending {
  background: #fff3cd;
  color: #856404;
}

.stage-status .status-badge.active {
  background: #d1ecf1;
  color: #0c5460;
}

.stage-status .status-badge.completed {
  background: #d4edda;
  color: #155724;
}

.stage-status .status-badge.archived {
  background: #f8d7da;
  color: #721c24;
}

.stage-actions {
  display: flex;
  gap: 5px;
}

.no-stages {
  text-align: center;
  padding: 40px 20px;
  color: #666;
  background: #f8f9fa;
  border-radius: 8px;
}

.no-stages i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 10px;
}

.stage-order {
  font-size: 12px;
  color: #6c757d;
  font-weight: normal;
}

.stage-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.stage-item.selected {
  background: #e8f2ff;
  border: 1px solid #2c5aa0;
}

.stages-list-wrapper {
  display: flex;
  gap: 20px;
  width: 100%;
  box-sizing: border-box;
}

.stages-container {
  flex: 1;
}

.stage-order-controls {
  width: 200px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  position: sticky;
  top: 20px;
  height: fit-content;
}

.stage-order-controls h5 {
  margin-bottom: 15px;
  color: #333;
}

.order-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.order-buttons .btn-sm {
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .wallet-drawer-bottom {
    width: 100%;
  }
  
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-item {
    justify-content: space-between;
  }
  
  .display-slider {
    width: 150px;
  }
  
  .form-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .stage-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .stage-number {
    align-self: flex-start;
  }
}

/* Status Display Styles */
.status-display {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  min-width: 80px;
}

.status-badge.status-pending {
  background: rgba(156, 163, 175, 0.2);
  color: #6b7280;
  border: 1px solid rgba(156, 163, 175, 0.3);
}

.status-badge.status-active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-badge.status-voting {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
  border: 1px solid rgba(249, 115, 22, 0.3);
}

.status-badge.status-completed {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.status-badge.status-archived {
  background: rgba(107, 114, 128, 0.2);
  color: #6b7280;
  border: 1px solid rgba(107, 114, 128, 0.3);
}

.status-help {
  color: #6b7280;
  font-size: 11px;
  font-style: italic;
}

/* Collapse Styles */
.stage-form-collapse {
  margin-bottom: 20px;
}

.stage-form-collapse .el-collapse-item__header {
  background: #f8f9fa;
  padding: 12px 20px;
  font-weight: 600;
  color: #2c5aa0;
}

.stage-form-collapse .el-collapse-item__content {
  padding: 20px;
  background: #ffffff;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collapse-header i {
  font-size: 16px;
}

.stage-list {
  min-height: 400px;
  position: relative;
}

@media (max-width: 768px) {
  .drawer-content {
    padding: 20px;
  }
  
  .transactions-table {
    font-size: 12px;
  }
  
  .transactions-table th,
  .transactions-table td {
    padding: 10px 8px;
  }
  
  .stage-item {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  .stage-handle {
    align-self: center;
  }
  
  .stage-info {
    flex-direction: row;
    align-items: center;
  }
}
</style>

<style>
/* Global Drawer Styles for ProjectManagement Component */
.wallet-drawer .el-drawer {
  background: linear-gradient(135deg, #006633 0%, #004d26 50%, #002d1a 100%) !important;
}

.wallet-drawer .el-drawer__header {
  background: #006633 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
}

.wallet-drawer .el-drawer__title {
  color: white !important;
  font-size: 20px !important;
  font-weight: 600 !important;
}

.wallet-drawer .el-drawer__close-btn {
  color: white !important;
  font-size: 20px !important;
}

.wallet-drawer .el-drawer__close-btn:hover {
  color: #90EE90 !important;
}

/* Viewer Management Drawer Styles */
.viewer-drawer .el-drawer {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #3b82f6 100%) !important;
}

.viewer-drawer .el-drawer__header {
  background: #1e3a8a !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
}

.viewer-drawer .el-drawer__title {
  color: white !important;
  font-size: 20px !important;
  font-weight: 600 !important;
}

.viewer-drawer .el-drawer__close-btn {
  color: white !important;
  font-size: 20px !important;
}

.viewer-drawer .el-drawer__close-btn:hover {
  color: #93c5fd !important;
}

/* Stage Editor and Edit Stage Drawer Styles */
.stage-editor-drawer .el-drawer__header,
.edit-stage-drawer .el-drawer__header {
  background: #2c5aa0 !important;
  color: white !important;
  border-bottom: 1px solid #1e3a8a !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
}

.stage-editor-drawer .el-drawer__title,
.edit-stage-drawer .el-drawer__title {
  color: white !important;
  font-size: 20px !important;
  font-weight: 600 !important;
}

.stage-editor-drawer .el-drawer__close-btn,
.edit-stage-drawer .el-drawer__close-btn {
  color: white !important;
  font-size: 18px !important;
}

.stage-editor-drawer .el-drawer__close-btn:hover,
.edit-stage-drawer .el-drawer__close-btn:hover {
  color: #93c5fd !important;
}

.stage-editor-drawer .el-drawer__body,
.edit-stage-drawer .el-drawer__body {
  padding: 20px !important;
  background: #f5f7fa !important;
}

/* Tag Management Styles */
.project-tags {
  min-width: 150px;
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  color: white;
  font-size: 11px;
  font-weight: 500;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  position: relative;
}

.tag-badge.clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.tag-badge.clickable:hover {
  transform: scale(1.05);
}

.tag-remove-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.8;
}

.tag-remove-btn:hover {
  opacity: 1;
}

.tag-manage-btn {
  background: #e9ecef;
  border: 1px solid #ced4da;
  color: #6c757d;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

.tag-manage-btn:hover {
  background: #dee2e6;
  color: #495057;
}

/* Project Creation Tag Selection Styles */
.tags-section {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  background: #f9f9f9;
}

.selected-tags {
  margin-bottom: 20px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  min-height: 50px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
}

.selected-tags .tag-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  position: relative;
  padding-right: 24px;
}

.selected-tags .remove-tag-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: white;
  font-size: 8px;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.selected-tags .remove-tag-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  opacity: 1;
}

.available-tags {
  margin-top: 15px;
}

.available-tags h5 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.available-tags h5 i {
  margin-right: 6px;
  color: #28a745;
}

.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-option {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 4px;
}

.tag-option:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.tag-option i {
  font-size: 9px;
}

.no-tags,
.no-available-tags {
  color: #999;
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 12px;
  text-align: center;
  justify-content: center;
}

.no-tags i,
.no-available-tags i {
  color: #ccc;
}

/* Drawer specific styles */
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
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.drawer-header-navy h3 i {
  margin-right: 10px;
  opacity: 0.9;
}

.drawer-header-white {
  background: white;
  padding: 16px 24px;
  margin: -20px -20px 20px -20px;
  border-radius: 0;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header-white h3 {
  margin: 0;
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
}

.drawer-header-white h3 i {
  margin-right: 10px;
  color: #6366f1;
}

.wallet-drawer h3 {
  margin: 0;
  color: white;
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.wallet-drawer h3 i {
  margin-right: 10px;
  opacity: 0.9;
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

.drawer-header-navy .drawer-close-btn {
  color: white;
}

.drawer-header-navy .drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.drawer-header-green .drawer-close-btn {
  color: white;
}

.drawer-header-green .drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.drawer-header-white .drawer-close-btn {
  color: #6b7280;
}

.drawer-header-white .drawer-close-btn:hover {
  background: rgba(107, 114, 128, 0.1);
  color: #374151;
  transform: scale(1.05);
}

.drawer-body {
  padding: 20px;
}

.drawer-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.current-tags-section,
.available-tags-section {
  margin-bottom: 20px;
}

.current-tags-section h4,
.available-tags-section h4 {
  margin: 0 0 10px 0;
  color: #2c5aa0;
  font-size: 16px;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 15px;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  background: #f8f9fa;
  min-height: 50px;
}

.tag-filter {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  margin-bottom: 15px;
}

.available-tags {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
}

.available-tag-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 15px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.available-tag-item:hover {
  background: #f8f9fa;
}

.available-tag-item:not(:last-child) {
  border-bottom: 1px solid #e1e8ed;
}

.tag-description {
  flex: 1;
  font-size: 13px;
  color: #666;
}

.available-tag-item i {
  color: #28a745;
  font-size: 14px;
}

.no-tags-text {
  color: #666;
  font-style: italic;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 40px;
}

@media (max-width: 768px) {
  .project-tags {
    min-width: auto;
  }
  
  .tags-display {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .tag-filter {
    grid-template-columns: 1fr;
  }
}

/* Score Range Inputs */
.score-range-inputs {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-top: 10px;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-input label {
  font-weight: 500;
  color: #555;
  margin: 0;
  min-width: 60px;
}

.form-input-small {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-input-small:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.field-hint {
  font-size: 12px;
  color: #666;
  margin-top: 8px;
  line-height: 1.4;
}

/* Gantt Chart Section */
.stages-gantt-section {
  margin: 16px 0;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.expanded-stage-item {
  cursor: pointer;
  transition: background-color 0.2s;
}

.expanded-stage-item:hover {
  background-color: #f5f7fa;
}


</style>