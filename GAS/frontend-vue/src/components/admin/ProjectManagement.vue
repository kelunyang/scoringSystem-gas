<template>
  <div class="project-management">
    <!-- Header with Actions -->
    <div class="mgmt-header">
      <div class="header-left">
        <h2><i class="fas fa-project-diagram"></i> 專案管理</h2>
        <div class="project-stats">
          <span class="stat-item">
            <i class="fas fa-play-circle"></i>
            進行中: {{ stats.activeProjects }}
          </span>
          <span class="stat-item">
            <i class="fas fa-check-circle"></i>
            已完成: {{ stats.completedProjects }}
          </span>
          <span class="stat-item">
            <i class="fas fa-archive"></i>
            已封存: {{ stats.archivedProjects }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn-primary" @click="openCreateProjectModal">
          <i class="fas fa-plus"></i>
          新增專案
        </button>
        <button class="btn-secondary" @click="refreshProjects">
          <i class="fas fa-sync"></i>
          重新整理
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-row">
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜尋專案名稱或描述"
          class="search-input"
        >
        <select v-model="statusFilter" class="filter-select">
          <option value="">全部狀態</option>
          <option value="active">進行中</option>
          <option value="completed">已完成</option>
          <option value="archived">已封存</option>
        </select>
        <select v-model="creatorFilter" class="filter-select">
          <option value="">全部創建者</option>
          <option value="me">我創建的</option>
        </select>
      </div>
    </div>

    <!-- Project Table -->
    <div class="table-container" v-loading="loading" element-loading-text="載入專案資料中...">
      <table class="project-table">
        <thead>
          <tr>
            <th>專案名稱</th>
            <th>創建者</th>
            <th>標籤</th>
            <th>創建時間</th>
            <th>最後修改</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="project in filteredProjects" :key="project.projectId">
            <!-- Project Row -->
            <tr class="project-row" :class="{ 'expanded': expandedProjects.has(project.projectId) }" @click="toggleProjectExpansion(project)">
              <td>
                <div class="project-name">
                  <i class="expand-icon fas" :class="expandedProjects.has(project.projectId) ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
                  {{ project.projectName }}
                </div>
              </td>
              <td>{{ project.createdBy }}</td>
              <td class="project-tags">
                <div class="tags-display">
                  <span 
                    v-for="tag in project.tags || []" 
                    :key="tag.tagId"
                    class="tag-badge"
                    :style="{ backgroundColor: tag.tagColor }"
                  >
                    {{ tag.tagName }}
                  </span>
                </div>
              </td>
              <td>{{ formatTime(project.createdTime) }}</td>
              <td>{{ formatTime(project.lastModified) }}</td>
              <td class="actions" @click.stop>
                <button class="btn-sm btn-primary" @click="editProject(project)">
                  <i class="fas fa-edit"></i>
                  編輯
                </button>
                <button class="btn-sm btn-info" @click="cloneProject(project)" :disabled="cloningProject">
                  <i :class="cloningProject ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                  {{ cloningProject ? '複製中...' : '複製專案' }}
                </button>
                <button class="btn-sm btn-success" @click="openWalletManagement(project)">
                  <i class="fas fa-coins"></i>
                  帳本管理
                </button>
                <button class="btn-sm btn-info" @click="openEventLogViewer(project)" :disabled="loadingEventLogs">
                  <i :class="loadingEventLogs ? 'fas fa-spinner fa-spin' : 'fas fa-history'"></i>
                  事件日誌
                </button>
                <el-popconfirm
                  :title="project.status === 'archived' ? `確定要解除封存專案「${project.projectName}」嗎？` : `確定要封存專案「${project.projectName}」嗎？`"
                  confirm-button-text="確定"
                  cancel-button-text="取消"
                  @confirm="project.status === 'archived' ? unarchiveProject(project) : archiveProject(project)"
                >
                  <template #reference>
                    <button
                      class="btn-sm btn-archive"
                      :disabled="archivingProjects.has(project.projectId)"
                    >
                      <i :class="archivingProjects.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                      {{ archivingProjects.has(project.projectId) ? '處理中...' : (project.status === 'archived' ? '解除封存' : '封存') }}
                    </button>
                  </template>
                </el-popconfirm>
              </td>
            </tr>
            
            <!-- Stages Rows -->
            <tr v-if="expandedProjects.has(project.projectId)" class="stages-container">
              <td colspan="6">
                <div class="stages-list" v-loading="loadingProjectStages.has(project.projectId)" element-loading-text="載入階段中...">
                  <div class="stages-header">
                    <h4><i class="fas fa-sort"></i> 階段順序（拖拽排序）</h4>
                    <div class="header-actions">
                      <el-switch
                        v-model="showArchivedStages"
                        active-text="檢視封存階段"
                        inactive-text="隱藏封存階段"
                        style="margin-right: 16px;"
                      />
                      <button
                        class="btn-secondary btn-sm"
                        @click="loadProjectStagesForExpansion(project.projectId)"
                        :disabled="loadingProjectStages.has(project.projectId)"
                        title="重新整理階段列表"
                      >
                        <i :class="loadingProjectStages.has(project.projectId) ? 'fas fa-spinner fa-spin' : 'fas fa-sync'"></i>
                        重新整理
                      </button>
                      <button
                        class="btn-primary btn-sm"
                        @click="openCreateStageForProject(project)"
                      >
                        <i class="fas fa-plus"></i>
                        新增階段
                      </button>
                    </div>
                  </div>
                  <div v-if="projectStagesMap.get(project.projectId)?.length === 0" class="no-stages">
                    <i class="fas fa-layer-group"></i>
                    <p>此專案尚無階段</p>
                  </div>
                  <div v-else class="stages-list-wrapper">
                    <div class="stages-container-inner">
                      <div
                        v-for="(stage, index) in getFilteredStages(project.projectId)"
                        :key="stage.stageId"
                        class="expanded-stage-item"
                        :class="{ 'dragging': draggedStage?.stageId === stage.stageId }"
                        draggable="true"
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
                            <span class="stage-dates">{{ formatDate(stage.startDate) }} - {{ formatDate(stage.endDate) }}</span>
                            <span v-if="stage.description" class="stage-desc">{{ stage.description }}</span>
                          </div>
                          <div class="stage-rewards">
                            <span class="reward-badge">報告池: {{ stage.reportRewardPool || 0 }}</span>
                            <span class="reward-badge">評論池: {{ stage.commentRewardPool || 0 }}</span>
                          </div>
                        </div>
                        <div class="stage-actions" @click.stop>
                          <button
                            class="btn-sm btn-light"
                            @click="moveStageUpInProject(project.projectId, index)"
                            :disabled="index === 0"
                            title="上移"
                          >
                            <i class="fas fa-arrow-up"></i>
                          </button>
                          <button
                            class="btn-sm btn-light"
                            @click="moveStageDownInProject(project.projectId, index)"
                            :disabled="index === projectStagesMap.get(project.projectId)?.length - 1"
                            title="下移"
                          >
                            <i class="fas fa-arrow-down"></i>
                          </button>
                          <button class="btn-sm btn-secondary" @click="editStage(stage, project)">
                            <i class="fas fa-edit"></i>
                            編輯
                          </button>
                          <button class="btn-sm btn-info" @click="cloneStage(stage)" :disabled="cloningStage">
                            <i :class="cloningStage ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                            {{ cloningStage ? '複製中...' : '複製階段' }}
                          </button>
                          <button
                            class="btn-sm btn-danger"
                            @click="forceEnterVoting(stage)"
                            v-if="calculateStageStatus(stage) === 'active'"
                            title="強制進入投票階段"
                          >
                            <i class="fas fa-vote-yea"></i>
                            強制投票
                          </button>
                          <button 
                            class="btn-sm btn-success" 
                            @click="settleStage(stage)"
                            v-if="calculateStageStatus(stage) === 'voting'"
                            :disabled="settlingStages.has(stage.stageId)"
                            title="結算階段獎金"
                          >
                            <i :class="settlingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-calculator'"></i>
                            {{ settlingStages.has(stage.stageId) ? '結算中...' : '結算獎金' }}
                          </button>
                          <el-dropdown
                            v-if="stage.status === 'completed'"
                            trigger="click"
                            @command="handleDistributionCommand($event, stage)"
                          >
                            <button class="btn-sm btn-info">
                              <i class="fas fa-chart-pie"></i>
                              顯示獎金分配 <i class="el-icon-arrow-down el-icon--right"></i>
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
                          <button 
                            class="btn-sm btn-warning" 
                            @click="reverseSettlement(stage)"
                            v-if="stage.status === 'completed'"
                            :disabled="reversingSettlement"
                            title="撤銷本次結算"
                          >
                            <i :class="reversingSettlement ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                            {{ reversingSettlement ? '撤銷中...' : '撤銷結算' }}
                          </button>
                          <el-popconfirm
                            :title="stage.status === 'archived' ? `確定要解除封存階段「${stage.stageName}」嗎？` : `確定要封存階段「${stage.stageName}」嗎？`"
                            confirm-button-text="確定"
                            cancel-button-text="取消"
                            @confirm="stage.status === 'archived' ? unarchiveStage(stage, project) : archiveStage(stage, project)"
                          >
                            <template #reference>
                              <button
                                class="btn-sm btn-archive"
                                :disabled="archivingStages.has(stage.stageId)"
                                :title="archivingStages.has(stage.stageId) ? '處理中...' : (stage.status === 'archived' ? '解除封存階段' : '封存階段')"
                              >
                                <i :class="archivingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
                                {{ archivingStages.has(stage.stageId) ? '處理中...' : (stage.status === 'archived' ? '解除封存' : '封存') }}
                              </button>
                            </template>
                          </el-popconfirm>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      
      <div v-if="filteredProjects.length === 0" class="no-data">
        <i class="fas fa-project-diagram"></i>
        <p>沒有找到符合條件的專案</p>
      </div>
    </div>

    <!-- Create Project Drawer - DISABLED (功能重複，已合併到"編輯專案"drawer) -->
    <el-drawer
      v-if="false"
      v-model="showCreateModal"
      title="新增專案"
      direction="btt"
      size="100%"
    >
      <template #header>
        <h3 style="color: white;"><i class="fas fa-plus"></i> 新增專案</h3>
      </template>

      <div class="drawer-body">
        <div class="form-group">
          <label>專案名稱 *</label>
          <input type="text" v-model="projectForm.projectName" class="form-input" placeholder="輸入專案名稱">
        </div>

        <div class="form-group">
          <label>專案描述 *</label>
          <textarea v-model="projectForm.description" class="form-input" rows="3" placeholder="輸入專案描述（必填）" required></textarea>
        </div>

        <div class="form-group">
          <label>百分制分數區間設定</label>
          <div class="score-range-inputs">
            <div class="range-input">
              <label>最低分：</label>
              <input
                type="number"
                v-model.number="projectForm.scoreRangeMin"
                class="form-input-small"
                min="0"
                max="100"
                placeholder="65"
              >
            </div>
            <div class="range-input">
              <label>最高分：</label>
              <input
                type="number"
                v-model.number="projectForm.scoreRangeMax"
                class="form-input-small"
                min="0"
                max="100"
                placeholder="95"
              >
            </div>
          </div>
          <div class="field-hint">設定專案成績轉換為百分制的範圍（預設：65-95分）</div>
        </div>

        <!-- Project Tags Selection -->
        <div class="form-group">
          <label>專案標籤</label>
          <div class="tags-section">
            <!-- Selected Tags Display -->
            <div class="selected-tags">
              <span
                v-for="tag in selectedTags"
                :key="tag.tagId"
                class="tag-badge removable"
                :style="{ backgroundColor: tag.tagColor }"
              >
                {{ tag.tagName }}
                <button
                  class="remove-tag-btn"
                  @click="removeProjectTag(tag)"
                  title="移除標籤"
                >
                  <i class="fas fa-times"></i>
                </button>
              </span>
              <div v-if="selectedTags.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                尚未選擇標籤
              </div>
            </div>

            <!-- Available Tags -->
            <div class="available-tags">
              <h5><i class="fas fa-plus"></i> 可選標籤</h5>
              <div class="tags-grid">
                <button
                  v-for="tag in availableTags"
                  :key="tag.tagId"
                  class="tag-option"
                  :style="{ backgroundColor: tag.tagColor }"
                  @click="addProjectTag(tag)"
                >
                  <i class="fas fa-plus"></i>
                  {{ tag.tagName }}
                </button>
              </div>
              <div v-if="availableTags.length === 0" class="no-available-tags">
                <i class="fas fa-info-circle"></i>
                沒有可選的標籤
              </div>
            </div>
          </div>
        </div>

        <div class="drawer-actions">
          <button class="btn-primary" @click="createProject" :disabled="creating || !projectForm.projectName.trim() || !projectForm.description.trim()">
            <i class="fas fa-plus"></i>
            {{ creating ? '創建中...' : '創建專案' }}
          </button>
          <button class="btn-secondary" @click="showCreateModal = false">
            取消
          </button>
        </div>
      </div>
    </el-drawer>

    <!-- Edit/Create Project Drawer -->
    <el-drawer
      v-model="showEditModal"
      :title="editForm.projectId ? '編輯專案' : '新增專案'"
      direction="btt"
      size="100%"
    >
      <template #header>
        <div class="drawer-header-navy">
          <h3>
            <i :class="editForm.projectId ? 'fas fa-edit' : 'fas fa-plus'"></i>
            {{ editForm.projectId ? '編輯專案' : '新增專案' }}
          </h3>
          <button class="drawer-close-btn" @click="showEditModal = false" title="關閉">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </template>
      
      <div class="drawer-body">
        <div class="form-group">
          <label>專案名稱 *</label>
          <input type="text" v-model="editForm.projectName" class="form-input">
        </div>
        
        <div class="form-group">
          <label>專案描述 *</label>
          <MarkdownEditor v-model="editForm.description" placeholder="請輸入專案描述（支援Markdown格式）" />
        </div>
        
        <div class="form-group">
          <label>百分制分數區間設定</label>
          <div class="score-range-inputs">
            <div class="range-input">
              <label>最低分：</label>
              <input 
                type="number" 
                v-model.number="editForm.scoreRangeMin" 
                class="form-input-small" 
                min="0" 
                max="100"
              >
            </div>
            <div class="range-input">
              <label>最高分：</label>
              <input 
                type="number" 
                v-model.number="editForm.scoreRangeMax" 
                class="form-input-small" 
                min="0" 
                max="100"
              >
            </div>
          </div>
          <div class="field-hint">設定專案成績轉換為百分制的範圍</div>
        </div>
        
        <!-- Project Tags Selection (for create mode) -->
        <div class="form-group" v-if="!editForm.projectId">
          <label>專案標籤</label>
          <div class="tags-section">
            <!-- Selected Tags Display -->
            <div class="selected-tags">
              <span
                v-for="tag in selectedTags"
                :key="tag.tagId"
                class="tag-badge removable"
                :style="{ backgroundColor: tag.tagColor }"
              >
                {{ tag.tagName }}
                <button
                  class="remove-tag-btn"
                  @click="removeProjectTag(tag)"
                  title="移除標籤"
                >
                  <i class="fas fa-times"></i>
                </button>
              </span>
              <div v-if="selectedTags.length === 0" class="no-tags">
                <i class="fas fa-info-circle"></i>
                尚未選擇標籤
              </div>
            </div>

            <!-- Available Tags -->
            <div class="available-tags">
              <h5><i class="fas fa-plus"></i> 可選標籤</h5>
              <div class="tags-grid">
                <button
                  v-for="tag in availableTags"
                  :key="tag.tagId"
                  class="tag-option"
                  :style="{ backgroundColor: tag.tagColor }"
                  @click="addProjectTag(tag)"
                >
                  <i class="fas fa-plus"></i>
                  {{ tag.tagName }}
                </button>
              </div>
              <div v-if="availableTags.length === 0" class="no-available-tags">
                <i class="fas fa-info-circle"></i>
                沒有可選的標籤
              </div>
            </div>
          </div>
        </div>

        <div class="drawer-actions">
          <button class="btn-primary" @click="saveProject" :disabled="updating || !editForm.projectName.trim() || !editForm.description.trim()">
            <i :class="updating ? 'fas fa-spinner fa-spin' : (editForm.projectId ? 'fas fa-save' : 'fas fa-plus')"></i>
            {{ updating ? (editForm.projectId ? '保存中...' : '創建中...') : (editForm.projectId ? '保存變更' : '創建專案') }}
          </button>
          <button class="btn-secondary" @click="showEditModal = false" :disabled="updating">
            取消
          </button>
        </div>
      </div>
    </el-drawer>

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

    <!-- Tag Assignment Modal -->
    <div v-if="showTagModal" class="modal-overlay" @click="showTagModal = false">
      <div class="modal-content" @click.stop>
        <h3><i class="fas fa-tags"></i> 標籤管理 - {{ selectedProject?.projectName }}</h3>
        
        <!-- Current Tags -->
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
              <button 
                class="tag-remove-btn"
                @click="removeTagFromProject(tag.tagId)"
                title="移除標籤"
              >
                <i class="fas fa-times"></i>
              </button>
            </span>
            <div v-if="currentProjectTags.length === 0" class="no-tags-text">
              尚未指派標籤
            </div>
          </div>
        </div>

        <!-- Available Tags -->
        <div class="available-tags-section">
          <h4>可用標籤</h4>
          
          <!-- Tag Filter -->
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

          <!-- Available Tags List -->
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

    <!-- Wallet Management Drawer -->
    <el-drawer
      v-model="showWalletDrawer"
      :title="'專案帳本管理' + (selectedProject ? ' - ' + selectedProject.projectName : '')"
      direction="btt"
      size="100%"
      class="wallet-drawer"
      :z-index="2000"
    >
      
      <div class="wallet-drawer-content" v-loading="loadingWalletTransactions" element-loading-text="載入交易記錄中...">
          <!-- Filters Section -->
          <div class="wallet-filters">
            <div class="filter-row">
              <div class="filter-item">
                <label>顯示數量</label>
                <input 
                  type="range" 
                  v-model="walletFilters.displayLimit" 
                  min="10" 
                  max="200" 
                  step="10"
                  class="display-slider"
                >
                <span class="limit-text">{{ walletFilters.displayLimit }} 筆</span>
              </div>
            </div>
            
            <div class="filter-row">
              <input 
                type="number" 
                v-model.number="walletFilters.pointsFilter" 
                placeholder="過濾點數"
                class="filter-input"
              >
              <input 
                type="text" 
                v-model="walletFilters.descriptionFilter" 
                placeholder="搜尋說明內容"
                class="filter-input"
              >
              <input 
                type="text" 
                v-model="walletFilters.userFilter" 
                placeholder="搜尋使用者名稱"
                class="filter-input"
              >
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="transactions-container">
            <table class="transactions-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>使用者</th>
                  <th>金額</th>
                  <th>類型</th>
                  <th>說明</th>
                  <th>階段</th>
                  <th>結算ID</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="transaction in filteredTransactions" :key="transaction.transactionId">
                  <!-- Main Transaction Row -->
                  <tr class="transaction-row" :class="{ 'expanded': expandedTransactions.has(transaction.transactionId) }" @click="toggleTransactionExpansion(transaction)">
                    <td>{{ formatTime(transaction.timestamp) }}</td>
                    <td>{{ transaction.displayName || transaction.userEmail }}</td>
                    <td class="points" :class="{ positive: transaction.amount > 0, negative: transaction.amount < 0 }">
                      {{ transaction.amount > 0 ? '+' : '' }}{{ transaction.amount.toFixed(2) }}
                    </td>
                    <td>
                      <span class="transaction-type" :class="transaction.transactionType">
                        {{ getTransactionTypeText(transaction.transactionType) }}
                      </span>
                    </td>
                    <td class="source-text">{{ transaction.source }}</td>
                    <td>{{ transaction.stageName || '-' }}</td>
                    <td class="settlement-id">
                      <el-dropdown
                        v-if="transaction.settlementId"
                        trigger="click"
                        @command="handleTransactionSettlementCommand($event, transaction.settlementId)"
                        @click.stop
                      >
                        <button class="btn-sm btn-info">
                          <i class="fas fa-coins"></i>
                          顯示獎金分配 <i class="el-icon-arrow-down el-icon--right"></i>
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
                      <span v-else>-</span>
                    </td>
                    <td class="actions" @click.stop>
                      <button
                        v-if="transaction.relatedSubmissionId || transaction.relatedCommentId"
                        class="btn-sm btn-secondary"
                        @click="toggleTransactionExpansion(transaction)"
                      >
                        <i class="fas" :class="expandedTransactions.has(transaction.transactionId) ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                        {{ expandedTransactions.has(transaction.transactionId) ? '收起' : '展開' }}
                      </button>
                      <button
                        v-if="!isTransactionReversed(transaction)"
                        class="btn-sm btn-danger"
                        @click="promptReverseTransaction(transaction)"
                        :disabled="reversingTransactions.has(transaction.transactionId)"
                      >
                        <i :class="reversingTransactions.has(transaction.transactionId) ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                        {{ reversingTransactions.has(transaction.transactionId) ? '撤銷中...' : '撤銷' }}
                      </button>
                    </td>
                  </tr>
                  
                  <!-- Expanded Details Row -->
                  <tr v-if="expandedTransactions.has(transaction.transactionId)" class="transaction-details">
                    <td colspan="8">
                      <div class="details-container" v-loading="loadingTransactionDetails.has(transaction.transactionId)" element-loading-text="載入詳情中...">
                        <!-- Related Submission -->
                        <div v-if="transaction.relatedSubmissionId" class="detail-section">
                          <h4><i class="fas fa-file-alt"></i> 相關成果</h4>
                          <div v-if="transactionDetailsMap.get(transaction.transactionId)?.submission" class="detail-content">
                            <div class="submission-content" v-html="transactionDetailsMap.get(transaction.transactionId).submission.content"></div>
                            <div class="detail-meta">
                              <span v-if="transactionDetailsMap.get(transaction.transactionId).submission.submitTime" class="meta-time">
                                <i class="fas fa-clock"></i>
                                提交時間: {{ formatTime(transactionDetailsMap.get(transaction.transactionId).submission.submitTime) }}
                              </span>
                              <span v-if="transactionDetailsMap.get(transaction.transactionId).submission.submitterEmail" class="meta-author">
                                <i class="fas fa-user"></i>
                                提交者: {{ transactionDetailsMap.get(transaction.transactionId).submission.submitterEmail }}
                              </span>
                            </div>
                          </div>
                          <div v-else class="detail-loading">
                            正在載入成果內容...
                          </div>
                        </div>
                        
                        <!-- Related Comment -->
                        <div v-if="transaction.relatedCommentId" class="detail-section">
                          <h4><i class="fas fa-comment"></i> 相關評論</h4>
                          <div v-if="transactionDetailsMap.get(transaction.transactionId)?.comment" class="detail-content">
                            <div class="comment-content" v-html="transactionDetailsMap.get(transaction.transactionId).comment.content"></div>
                            <div class="detail-meta">
                              <span v-if="transactionDetailsMap.get(transaction.transactionId).comment.createdTime" class="meta-time">
                                <i class="fas fa-clock"></i>
                                發布時間: {{ formatTime(transactionDetailsMap.get(transaction.transactionId).comment.createdTime) }}
                              </span>
                              <span v-if="transactionDetailsMap.get(transaction.transactionId).comment.authorEmail" class="meta-author">
                                <i class="fas fa-user"></i>
                                作者: {{ transactionDetailsMap.get(transaction.transactionId).comment.authorEmail }}
                              </span>
                            </div>
                          </div>
                          <div v-else class="detail-loading">
                            正在載入評論內容...
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            
            <div v-if="filteredTransactions.length === 0" class="no-transactions">
              <i class="fas fa-coins"></i>
              <p>沒有找到符合條件的交易記錄</p>
            </div>
          </div>
        </div>
    </el-drawer>

    <!-- Event Log Viewer Drawer -->
    <el-drawer
      v-model="showEventLogDrawer"
      :title="'事件日誌' + (selectedProject ? ' - ' + selectedProject.projectName : '')"
      direction="btt"
      size="100%"
      class="event-log-drawer"
    >
      <EventLogViewer
        v-if="showEventLogDrawer && selectedProject"
        :project-id="selectedProject.projectId"
        :user-mode="false"
      />
    </el-drawer>

    <!-- Edit Stage Modal -->
    <el-drawer
      v-model="showEditStageModal"
      :title="editStageForm.stageId ? ('編輯階段' + (editingStage ? ' - ' + editingStage.stageName : '')) : '新增階段'"
      direction="ttb"
      size="100%"
      class="edit-stage-drawer"
      :z-index="2500"
    >
        <div v-loading="loadingStageDetails" element-loading-text="載入階段詳情中...">

        <!-- Error Alert -->
        <el-alert
          v-if="stageFormError"
          :title="stageFormError.title || '操作失敗'"
          type="error"
          :description="stageFormError.message"
          show-icon
          :closable="true"
          @close="stageFormError = null"
          style="margin-bottom: 20px;"
        />

        <div class="form-row">
          <div class="form-group">
            <label>階段名稱 *</label>
            <input 
              type="text" 
              v-model="editStageForm.stageName" 
              class="form-input"
              placeholder="輸入階段名稱"
            >
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>開始時間 *</label>
            <input 
              type="datetime-local" 
              v-model="editStageForm.startDate" 
              class="form-input"
            >
          </div>
          <div class="form-group">
            <label>結束時間 *</label>
            <input 
              type="datetime-local" 
              v-model="editStageForm.endDate" 
              class="form-input"
            >
          </div>
        </div>
        
        <div class="form-group">
          <label>階段描述</label>
          <MarkdownEditor v-model="editStageForm.description" placeholder="請輸入階段目標說明（支援Markdown格式）" />
        </div>

        <div class="form-group">
          <label>階段狀態</label>
          <div class="status-display">
            <span class="status-badge" :class="'status-' + calculateStageStatus(editStageForm)">
              {{ getStageStatusText(editStageForm) }}
            </span>
            <small class="status-help">階段狀態由系統自動管理</small>
          </div>
        </div>

        <!-- Reward Pool Configuration -->
        <div class="form-section">
          <h5><i class="fas fa-coins"></i> 獎金池設定</h5>
          <div class="form-row">
            <div class="form-group">
              <label>報告獎金池總額</label>
              <input type="number" v-model="editStageForm.reportRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
            </div>
            <div class="form-group">
              <label>評論獎金池總額</label>
              <input type="number" v-model="editStageForm.commentRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-primary" @click="updateStageDetails" :disabled="savingStageDetails">
            <i :class="savingStageDetails ? 'fas fa-spinner fa-spin' : (editStageForm.stageId ? 'fas fa-save' : 'fas fa-plus')"></i>
            {{ savingStageDetails ? (editStageForm.stageId ? '儲存中...' : '創建中...') : (editStageForm.stageId ? '儲存變更' : '創建階段') }}
          </button>
          <button class="btn-secondary" @click="showEditStageModal = false" :disabled="savingStageDetails">
            取消
          </button>
        </div>
        </div>
    </el-drawer>

    <!-- Stage Editor Drawer - DISABLED (功能重複，已被"編輯階段"drawer取代) -->
    <el-drawer
      v-if="false"
      v-model="showStageEditor"
      :title="'階段編輯器' + (selectedProject ? ' - ' + selectedProject.projectName : '')"
      direction="ttb"
      size="100%"
      class="stage-editor-drawer"
      :z-index="1500"
    >

      <!-- Add New Stage Form -->
      <el-collapse v-model="activeCollapse" class="stage-form-collapse">
        <el-collapse-item name="newStage">
          <template #title>
            <div class="collapse-header">
              <i class="fas fa-plus"></i>
              <span>新增階段</span>
            </div>
          </template>
          <div class="stage-form">
            <div class="form-row">
              <div class="form-group">
                <label>階段名稱</label>
                <input type="text" v-model="newStage.stageName" class="form-input" placeholder="輸入階段名稱">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>開始時間</label>
                <input type="datetime-local" v-model="newStage.startDate" class="form-input">
              </div>
              <div class="form-group">
                <label>結束時間</label>
                <input type="datetime-local" v-model="newStage.endDate" class="form-input">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>階段描述</label>
                <MarkdownEditor v-model="newStage.description" placeholder="請輸入階段目標說明（支援Markdown格式）" />
              </div>
            </div>
            
            <!-- Reward Pool Configuration -->
            <div class="form-section">
              <h5><i class="fas fa-coins"></i> 獎金池設定</h5>
              <div class="form-row">
                <div class="form-group">
                  <label>報告獎金池總額</label>
                  <input type="number" v-model="newStage.reportRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
                </div>
                <div class="form-group">
                  <label>評論獎金池總額</label>
                  <input type="number" v-model="newStage.commentRewardPool" class="form-input" min="0" placeholder="總獎金將根據排名自動分配">
                </div>
              </div>
            </div>
            
            <div class="form-actions">
              <button class="btn-primary btn-sm" @click="addNewStage" :disabled="!newStage.stageName">
                <i class="fas fa-plus"></i>
                新增階段
              </button>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- Stage List with Drag & Drop -->
      <div class="stage-list" v-loading="loadingStages" element-loading-text="載入階段資料中...">
        <h4><i class="fas fa-sort"></i> 階段順序（拖拽排序）</h4>
        <div v-if="!loadingStages && projectStages.length === 0" class="no-stages">
          <i class="fas fa-layer-group"></i>
          <p>此專案尚無階段，請先新增階段</p>
          <button 
            class="btn-primary btn-sm" 
            @click="openCreateStagePanel"
            style="margin-top: 10px;"
          >
            <i class="fas fa-plus"></i>
            新增階段
          </button>
        </div>
        <div v-else-if="!loadingStages" class="stages-list-wrapper">
          <div class="stages-container">
            <div 
              v-for="(stage, index) in projectStages" 
              :key="stage.stageId"
              class="stage-item"
              :class="{ 'selected': selectedStage?.stageId === stage.stageId, 'dragging': draggedStage?.stageId === stage.stageId }"
              draggable="true"
              @click="selectStage(stage)"
              @dragstart="onDragStart(stage)"
              @dragover.prevent
              @dragenter.prevent
              @drop="onDrop(index)"
            >
            <div class="stage-handle">
              <i class="fas fa-grip-vertical"></i>
            </div>
            <div class="stage-info">
              <div class="stage-name">
                <el-tag :type="getStageStatusType(stage)" size="small">
                  {{ getStageStatusText(stage) }}
                </el-tag>
                {{ stage.stageName }}
                <span class="stage-order">順序: {{ stage.stageOrder }}</span>
              </div>
              <div class="stage-details">
                <span class="stage-dates">{{ formatDate(stage.startDate) }} - {{ formatDate(stage.endDate) }}</span>
                <span v-if="stage.description" class="stage-desc">{{ stage.description }}</span>
              </div>
              <div class="stage-rewards">
                <span class="reward-badge">報告池: {{ stage.reportRewardPool || 0 }}</span>
                <span class="reward-badge">評論池: {{ stage.commentRewardPool || 0 }}</span>
              </div>
            </div>
            <div class="stage-actions" @click.stop>
              <button class="btn-sm btn-secondary" @click="editStage(stage)">
                <i class="fas fa-edit"></i>
                編輯
              </button>
              <button class="btn-sm btn-info" @click="cloneStage(stage)" :disabled="cloningStage">
                <i :class="cloningStage ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
                {{ cloningStage ? '複製中...' : '複製階段' }}
              </button>
              <button 
                class="btn-sm btn-warning" 
                @click="forceEnterVoting(stage)"
                v-if="calculateStageStatus(stage) === 'active'"
                title="強制進入投票階段"
              >
                <i class="fas fa-vote-yea"></i>
                強制投票
              </button>
              <button 
                class="btn-sm btn-success" 
                @click="settleStage(stage)"
                v-if="calculateStageStatus(stage) === 'voting'"
                :disabled="settlingStages.has(stage.stageId)"
                title="結算階段獎金"
              >
                <i :class="settlingStages.has(stage.stageId) ? 'fas fa-spinner fa-spin' : 'fas fa-calculator'"></i>
                {{ settlingStages.has(stage.stageId) ? '結算中...' : '結算獎金' }}
              </button>
              <!-- Dropdown for showing point distribution -->
              <el-dropdown
                v-if="stage.status === 'completed'"
                trigger="click"
                @command="handleDistributionCommand($event, stage)"
              >
                <button class="btn-sm btn-info">
                  <i class="fas fa-chart-pie"></i>
                  顯示獎金分配 <i class="el-icon-arrow-down el-icon--right"></i>
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
              <button 
                class="btn-sm btn-warning" 
                @click="reverseSettlement(stage)"
                v-if="stage.status === 'completed'"
                :disabled="reversingSettlement"
                title="撤銷本次結算"
              >
                <i :class="reversingSettlement ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                {{ reversingSettlement ? '撤銷中...' : '撤銷結算' }}
              </button>
              <button 
                class="btn-sm btn-light" 
                @click="archiveStage(stage)"
                v-if="stage.status === 'completed'"
                title="封存階段"
              >
                <i class="fas fa-archive"></i>
                封存
              </button>
            </div>
          </div>
          </div>
          
          <!-- Stage Order Controls -->
          <div class="stage-order-controls" v-if="selectedStage">
            <h5>調整順序</h5>
            <div class="order-buttons">
              <button 
                class="btn-sm btn-secondary" 
                @click="moveStageToTop"
                :disabled="getStageIndex(selectedStage) === 0"
                title="移至最前"
              >
                <i class="fas fa-angle-double-up"></i>
              </button>
              <button 
                class="btn-sm btn-secondary" 
                @click="moveStageUp"
                :disabled="getStageIndex(selectedStage) === 0"
                title="向前移動"
              >
                <i class="fas fa-angle-up"></i>
              </button>
              <button 
                class="btn-sm btn-secondary" 
                @click="moveStageDown"
                :disabled="getStageIndex(selectedStage) === projectStages.length - 1"
                title="向後移動"
              >
                <i class="fas fa-angle-down"></i>
              </button>
              <button 
                class="btn-sm btn-secondary" 
                @click="moveStageToBottom"
                :disabled="getStageIndex(selectedStage) === projectStages.length - 1"
                title="移至最後"
              >
                <i class="fas fa-angle-double-down"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Drawer Actions -->
      <div class="drawer-actions">
        <button class="btn-primary" @click="saveStageOrder" :disabled="savingStageOrder">
          <i :class="savingStageOrder ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
          {{ savingStageOrder ? '儲存中...' : '儲存順序' }}
        </button>
        <button class="btn-secondary" @click="showStageEditor = false" :disabled="savingStageOrder">
          關閉
        </button>
      </div>
    </el-drawer>

    <!-- 投票分析模態窗口 -->
    <VotingAnalysisModal 
      :visible="showVotingAnalysisModal"
      @update:visible="showVotingAnalysisModal = $event"
      :project-id="selectedProject?.projectId"
      :stage-id="selectedStageForAnalysis?.stageId"
      :stage-title="selectedStageForAnalysis?.stageName"
      :is-settled="selectedStageForAnalysis?.status === 'completed'"
    />

    <!-- 評論投票分析模態窗口 -->
    <CommentVotingAnalysisModal 
      :visible="showCommentAnalysisModal"
      @update:visible="showCommentAnalysisModal = $event"
      :project-id="selectedProject?.projectId"
      :stage-id="selectedStageForAnalysis?.stageId"
      :stage-title="selectedStageForAnalysis?.stageName"
      :is-settled="selectedStageForAnalysis?.status === 'completed'"
    />

  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, getCurrentInstance } from 'vue'
import { calculateStageStatus, getStageStatusText, getStageStatusType } from '@/utils/stageStatus.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownEditor from '../MarkdownEditor.vue'
import VotingAnalysisModal from '../VotingAnalysisModal.vue'
import CommentVotingAnalysisModal from '../CommentVotingAnalysisModal.vue'
import EventLogViewer from '../EventLogViewer.vue'
import dayjs from 'dayjs'

export default {
  name: 'ProjectManagement',
  components: {
    MarkdownEditor,
    VotingAnalysisModal,
    CommentVotingAnalysisModal,
    EventLogViewer
  },
  setup() {
    const instance = getCurrentInstance()
    const apiClient = instance.appContext.config.globalProperties.$apiClient
    const projects = ref([])
    const searchText = ref('')
    const statusFilter = ref('')
    const creatorFilter = ref('')
    const showCreateModal = ref(false)
    const showEditModal = ref(false)
    const showViewModal = ref(false)
    const showWalletDrawer = ref(false)
    const showEventLogDrawer = ref(false)
    const loadingEventLogs = ref(false)
    const showStageEditor = ref(false)
    const showEditStageModal = ref(false)
    const showVotingAnalysisModal = ref(false)
    const showCommentAnalysisModal = ref(false)
    const selectedProject = ref(null)
    const selectedStageForAnalysis = ref(null)
    const transactions = ref([])
    const reversingTransactions = ref(new Set())
    const creating = ref(false)
    const updating = ref(false)
    const loading = ref(false)
    const archivingProjects = ref(new Set())  // Track which projects are being archived
    const archivingStages = ref(new Set())    // Track which stages are being archived
    const settlingStages = ref(new Set())
    const showArchivedStages = ref(false)     // Toggle to show/hide archived stages
    const projectStages = ref([])
    const draggedStage = ref(null)
    const editingStage = ref(null)
    
    // Tag management
    const showTagModal = ref(false)
    const allTags = ref([])
    const currentProjectTags = ref([])
    const tagFilterText = ref('')
    const tagCategoryFilter = ref('')
    
    // Project creation tag management
    const selectedTags = ref([])
    const availableTags = ref([])

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
      scoreRangeMax: 95
    })

    const walletFilters = reactive({
      displayLimit: 50,
      pointsFilter: null,
      descriptionFilter: '',
      userFilter: ''
    })

    const newStage = reactive({
      stageName: '',
      startDate: '',
      endDate: '',
      description: '',
      reportRewardPool: 0,
      commentRewardPool: 0
    })

    const newStageForm = reactive({
      stageName: '',
      startDate: '',
      endDate: ''
    })

    const editStageForm = reactive({
      stageId: '',
      stageName: '',
      startDate: '',
      endDate: '',
      description: '',
      status: 'pending',
      reportRewardPool: 0,
      commentRewardPool: 0
    })

    // Stage form error state
    const stageFormError = ref(null)

    const loadingStages = ref(false)
    const loadingStageDetails = ref(false)
    const savingStageDetails = ref(false)
    const savingStageOrder = ref(false)
    const activeCollapse = ref([])
    const selectedStage = ref(null)
    const cloningProject = ref(false)
    const cloningStage = ref(false)
    const reversingSettlement = ref(false)
    
    // Project expansion state
    const expandedProjects = ref(new Set())
    const projectStagesMap = ref(new Map())
    const loadingProjectStages = ref(new Set())
    const expandedTransactions = ref(new Set())
    
    // Wallet management state
    const loadingWalletTransactions = ref(false)
    const loadingTransactionDetails = ref(new Set())
    const transactionDetailsMap = ref(new Map())

    const stats = computed(() => ({
      totalProjects: projects.value.length,
      activeProjects: projects.value.filter(p => p.status === 'active').length,
      completedProjects: projects.value.filter(p => p.status === 'completed').length,
      archivedProjects: projects.value.filter(p => p.status === 'archived').length
    }))

    const filteredProjects = computed(() => {
      let filtered = projects.value

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
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
        filtered = filtered.filter(project => project.createdBy === currentUser.userEmail)
      }

      return filtered.sort((a, b) => b.lastModified - a.lastModified)
    })

    const filteredTransactions = computed(() => {
      let filtered = transactions.value

      // Apply filters
      if (walletFilters.pointsFilter !== null && walletFilters.pointsFilter !== '') {
        filtered = filtered.filter(t => t.amount === walletFilters.pointsFilter)
      }

      if (walletFilters.descriptionFilter.trim()) {
        const search = walletFilters.descriptionFilter.toLowerCase()
        filtered = filtered.filter(t => 
          (t.source && t.source.toLowerCase().includes(search)) ||
          (t.description && t.description.toLowerCase().includes(search))
        )
      }

      if (walletFilters.userFilter.trim()) {
        const search = walletFilters.userFilter.toLowerCase()
        filtered = filtered.filter(t => 
          t.userEmail.toLowerCase().includes(search) ||
          getDisplayName(t.userEmail).toLowerCase().includes(search)
        )
      }

      // Apply display limit and sort by timestamp (newest first)
      return filtered
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, walletFilters.displayLimit)
    })

    // Tag management computed
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

    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      return new Date(timestamp).toLocaleString('zh-TW')
    }

    const truncateText = (text, maxLength) => {
      if (!text) return '-'
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }

    const getProgressPercentage = (project) => {
      if (project.totalStages === 0) return 0
      return Math.round((project.currentStage / project.totalStages) * 100)
    }

    const getStageCompletionPercentage = (project) => {
      // 根據實際完成的階段計算進度
      if (!project.stages || project.stages.length === 0) {
        // 如果沒有階段資料，使用原有的 currentStage/totalStages 邏輯作為備用
        if (project.totalStages === 0) return 0
        return Math.round((project.currentStage / project.totalStages) * 100)
      }
      
      const completedStages = project.stages.filter(stage => stage.status === 'completed').length
      const totalStages = project.stages.length
      
      return Math.round((completedStages / totalStages) * 100)
    }

    const getStatusIcon = (status) => {
      switch (status) {
        case 'active': return 'fas fa-play-circle'
        case 'completed': return 'fas fa-check-circle'
        case 'archived': return 'fas fa-archive'
        default: return 'fas fa-question-circle'
      }
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'active': return '進行中'
        case 'completed': return '已完成'
        case 'archived': return '已封存'
        default: return '進行中' // 預設為進行中，避免未知狀態
      }
    }

    const loadProjects = async () => {
      loading.value = true
      
      try {
        ElMessage.info('開始更新專案列表')
        
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          return
        }
        
        const response = await apiClient.callWithAuth('/projects/list', {})
        
        if (response.success && response.data) {
          projects.value = response.data
          ElMessage.success('專案列表資料下載完成')
        } else {
          console.error('Failed to load projects:', response.error)
          ElMessage.error(`無法載入專案資料: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading projects:', error)
        ElMessage.error('載入專案資料失敗，請重試')
      } finally {
        loading.value = false
      }
    }


    const refreshProjects = () => {
      loadProjects()
      loadProjectTags()
    }

    // Tag management methods
    const loadAllTags = async () => {
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          return
        }
        
        const response = await apiClient.callWithAuth('/tags/list', {})
        
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
        const sessionId = localStorage.getItem('sessionId')
        const response = await apiClient.callWithAuth('/tags/project', { 
          projectId: targetProjectId 
        })
        
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
        const sessionId = localStorage.getItem('sessionId')
        const response = await apiClient.callWithAuth('/tags/assign/project', {
          projectId: selectedProject.value.projectId,
          tagId: tagId
        })
        
        if (response.success) {
          await loadProjectTags(selectedProject.value.projectId)
          alert('標籤指派成功')
        } else {
          alert(`指派失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Assign tag error:', error)
        alert('指派失敗，請重試')
      }
    }

    const removeTagFromProject = async (tagId) => {
      if (!selectedProject.value) return
      
      const tag = currentProjectTags.value.find(t => t.tagId === tagId)
      if (!confirm(`確定要移除標籤「${tag?.tagName}」嗎？`)) {
        return
      }
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        const response = await apiClient.callWithAuth('/tags/remove/project', {
          projectId: selectedProject.value.projectId,
          tagId: tagId
        })
        
        if (response.success) {
          await loadProjectTags(selectedProject.value.projectId)
          alert('標籤已移除')
        } else {
          alert(`移除失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Remove tag error:', error)
        alert('移除失敗，請重試')
      }
    }

    const openCreateProjectModal = async () => {
      // Reset editForm for create mode
      editForm.projectId = ''
      editForm.projectName = ''
      editForm.description = ''
      editForm.scoreRangeMin = 65
      editForm.scoreRangeMax = 95

      // Load tags for creation
      await loadTagsForCreation()

      // Open the edit modal (which now handles both create and edit)
      showEditModal.value = true
    }
    
    // Project creation tag management
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
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) return
        
        const response = await apiClient.callWithAuth('/tags/list', {})
        
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
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) return false
        
        // Assign each tag to the project
        for (const tagId of tagIds) {
          const response = await apiClient.callWithAuth('/tags/assign/project', {
            projectId: projectId,
            tagId: tagId
          })
          
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

    const createProject = async () => {
      if (!projectForm.projectName.trim()) {
        alert('請輸入專案名稱')
        return
      }
      
      if (!projectForm.description.trim()) {
        alert('請輸入專案描述')
        return
      }
      
      // 驗證分數區間
      if (projectForm.scoreRangeMin >= projectForm.scoreRangeMax) {
        alert('最低分必須小於最高分')
        return
      }

      try {
        creating.value = true
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          alert('Session 已過期，請重新登入')
          return
        }
        
        const response = await apiClient.callWithAuth('/projects/create', {
          projectData: {
            projectName: projectForm.projectName.trim(),
            description: projectForm.description.trim(),
            scoreRangeMin: projectForm.scoreRangeMin,
            scoreRangeMax: projectForm.scoreRangeMax
          }
        })
        
        if (response.success) {
          // Assign selected tags to the new project
          if (selectedTags.value.length > 0) {
            const tagIds = selectedTags.value.map(tag => tag.tagId)
            const tagAssignmentSuccess = await assignTagsToProject(response.data.projectId, tagIds)
            
            if (!tagAssignmentSuccess) {
              alert('專案創建成功，但標籤分配部分失敗')
            }
          }
          
          alert('專案創建成功')
          showCreateModal.value = false
          projectForm.projectName = ''
          projectForm.description = ''
          projectForm.scoreRangeMin = 65
          projectForm.scoreRangeMax = 95
          selectedTags.value = []
          loadProjects()
        } else {
          alert(`創建失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error creating project:', error)
        alert('創建失敗，請重試')
      } finally {
        creating.value = false
      }
    }

    const editProject = (project) => {
      editForm.projectId = project.projectId
      editForm.projectName = project.projectName
      editForm.description = project.description || ''
      editForm.scoreRangeMin = project.scoreRangeMin || 65
      editForm.scoreRangeMax = project.scoreRangeMax || 95
      showEditModal.value = true
    }

    // Unified save function for both create and update
    const saveProject = async () => {
      if (!editForm.projectName.trim()) {
        alert('請輸入專案名稱')
        return
      }

      if (!editForm.description.trim()) {
        alert('請輸入專案描述')
        return
      }

      // 驗證分數區間
      if (editForm.scoreRangeMin >= editForm.scoreRangeMax) {
        alert('最低分必須小於最高分')
        return
      }

      const sessionId = localStorage.getItem('sessionId')
      if (!sessionId) {
        alert('Session 已過期，請重新登入')
        return
      }

      try {
        updating.value = true

        if (editForm.projectId) {
          // Update existing project
          const response = await apiClient.callWithAuth('/projects/update', {
            projectId: editForm.projectId,
            updates: {
              projectName: editForm.projectName.trim(),
              description: editForm.description.trim(),
              scoreRangeMin: editForm.scoreRangeMin,
              scoreRangeMax: editForm.scoreRangeMax
            }
          })

          if (response.success) {
            ElMessage.success('專案更新成功')
            await loadProjects()

            // Reload stages if this project is currently expanded
            if (expandedProjects.value.has(editForm.projectId)) {
              await loadProjectStagesForExpansion(editForm.projectId)
            }

            showEditModal.value = false
          } else {
            ElMessage.error(`更新失敗: ${response.error?.message || '未知錯誤'}`)
          }
        } else {
          // Create new project
          const response = await apiClient.callWithAuth('/projects/create', {
            projectData: {
              projectName: editForm.projectName.trim(),
              description: editForm.description.trim(),
              scoreRangeMin: editForm.scoreRangeMin,
              scoreRangeMax: editForm.scoreRangeMax
            }
          })

          if (response.success) {
            // Assign selected tags to the new project
            if (selectedTags.value.length > 0) {
              const tagIds = selectedTags.value.map(tag => tag.tagId)
              const tagAssignmentSuccess = await assignTagsToProject(response.data.projectId, tagIds)

              if (!tagAssignmentSuccess) {
                ElMessage.warning('專案創建成功，但標籤分配部分失敗')
              } else {
                ElMessage.success('專案創建成功')
              }
            } else {
              ElMessage.success('專案創建成功')
            }

            await loadProjects()
            showEditModal.value = false
            selectedTags.value = []
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
        alert('請輸入專案名稱')
        return
      }

      if (!editForm.description.trim()) {
        alert('請輸入專案描述')
        return
      }

      // 驗證分數區間
      if (editForm.scoreRangeMin >= editForm.scoreRangeMax) {
        alert('最低分必須小於最高分')
        return
      }

      try {
        updating.value = true
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          alert('Session 已過期，請重新登入')
          return
        }
        
        const response = await apiClient.callWithAuth('/projects/update', {
          projectId: editForm.projectId,
          updates: {
            projectName: editForm.projectName.trim(),
            description: editForm.description.trim(),
            scoreRangeMin: editForm.scoreRangeMin,
            scoreRangeMax: editForm.scoreRangeMax
          }
        })
        
        if (response.success) {
          alert('專案更新成功')
          showEditModal.value = false
          loadProjects()
        } else {
          alert(`更新失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error updating project:', error)
        alert('更新失敗，請重試')
      } finally {
        updating.value = false
      }
    }

    const viewProject = async (project) => {
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          selectedProject.value = project
          showViewModal.value = true
          return
        }
        
        const response = await apiClient.callWithAuth('/projects/get', {
          projectId: project.projectId
        })
        
        if (response.success && response.data) {
          selectedProject.value = response.data
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

    const archiveProject = async (project) => {
      const sessionId = localStorage.getItem('sessionId')
      if (!sessionId) {
        ElMessage.error('Session 已過期，請重新登入')
        return
      }

      try {
        // Add to archiving set
        archivingProjects.value.add(project.projectId)

        // 使用update API來更改狀態為archived
        const response = await apiClient.callWithAuth('/projects/update', {
          projectId: project.projectId,
          updates: {
            status: 'archived'
          }
        })

        if (response.success) {
          ElMessage.success('專案已封存')
          await loadProjects()
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

    const unarchiveProject = async (project) => {
      const sessionId = localStorage.getItem('sessionId')
      if (!sessionId) {
        ElMessage.error('Session 已過期，請重新登入')
        return
      }

      try {
        // Add to archiving set (reuse the same tracking set)
        archivingProjects.value.add(project.projectId)

        // 使用update API來更改狀態為active
        const response = await apiClient.callWithAuth('/projects/update', {
          projectId: project.projectId,
          updates: {
            status: 'active'
          }
        })

        if (response.success) {
          ElMessage.success('專案已解除封存')
          await loadProjects()
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

    // Wallet Management Functions
    const openWalletManagement = async (project) => {
      selectedProject.value = project
      showWalletDrawer.value = true
      await loadProjectTransactions(project.projectId)
    }

    // Event Log Functions
    const openEventLogViewer = (project) => {
      loadingEventLogs.value = true
      selectedProject.value = project
      showEventLogDrawer.value = true
      // EventLogViewer component will handle loading when it mounts
      setTimeout(() => {
        loadingEventLogs.value = false
      }, 500)
    }

    const loadProjectTransactions = async (projectId) => {
      loadingWalletTransactions.value = true
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          transactions.value = []
          return
        }
        
        // 使用新的帶JOIN數據的API端點
        const response = await apiClient.callWithAuth('/wallets/project-transactions', {
          projectId: projectId,
          limit: 500
        })
        
        if (response.success && response.data) {
          transactions.value = response.data
        } else {
          console.error('Failed to load transactions:', response.error)
          transactions.value = []
          ElMessage.error(`無法載入交易記錄: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error loading transactions:', error)
        transactions.value = []
        ElMessage.error('載入交易記錄失敗，請重試')
      } finally {
        loadingWalletTransactions.value = false
      }
    }

    // Transaction expansion and details loading
    const toggleTransactionExpansion = async (transaction) => {
      const transactionId = transaction.transactionId
      
      if (expandedTransactions.value.has(transactionId)) {
        // Collapse
        expandedTransactions.value.delete(transactionId)
        transactionDetailsMap.value.delete(transactionId)
      } else {
        // Expand and load details
        expandedTransactions.value.add(transactionId)
        
        if (transaction.relatedSubmissionId || transaction.relatedCommentId) {
          await loadTransactionDetails(transaction)
        }
      }
    }

    const loadTransactionDetails = async (transaction) => {
      const transactionId = transaction.transactionId
      loadingTransactionDetails.value.add(transactionId)
      
      try {
        const details = {}
        
        // 自動判斷要載入submission還是comment
        if (transaction.relatedSubmissionId) {
          console.log('Loading submission details for ID:', transaction.relatedSubmissionId)
          const submissionResponse = await apiClient.callWithAuth('/submissions/details', {
            projectId: selectedProject.value.projectId,
            submissionId: transaction.relatedSubmissionId
          })
          
          if (submissionResponse.success && submissionResponse.data) {
            details.submission = {
              content: submissionResponse.data.contentMarkdown || submissionResponse.data.content || '無內容',
              submitTime: submissionResponse.data.submitTime,
              submitterEmail: submissionResponse.data.submitterEmail
            }
            console.log('Submission loaded successfully')
          } else {
            console.warn('Failed to load submission details:', submissionResponse)
            details.submission = {
              content: '載入成果內容失敗: ' + (submissionResponse.error?.message || submissionResponse.message || JSON.stringify(submissionResponse))
            }
          }
        }
        
        if (transaction.relatedCommentId) {
          console.log('=== Loading Comment Details ===')
          console.log('Comment ID:', transaction.relatedCommentId)
          console.log('Project ID:', selectedProject.value.projectId)
          
          const requestData = {
            projectId: selectedProject.value.projectId,
            commentId: transaction.relatedCommentId
          }
          console.log('Request data:', requestData)
          
          const commentResponse = await apiClient.callWithAuth('/comments/details', requestData)
          console.log('Full comment response:', commentResponse)
          console.log('Response type:', typeof commentResponse)
          console.log('Response success:', commentResponse.success)
          console.log('Response data:', commentResponse.data)
          console.log('Response error:', commentResponse.error)
          
          if (commentResponse.success && commentResponse.data) {
            details.comment = {
              content: commentResponse.data.content || '無內容',
              createdTime: commentResponse.data.createdTime,
              authorEmail: commentResponse.data.authorEmail
            }
            console.log('Comment loaded successfully:', details.comment)
          } else {
            console.warn('Failed to load comment details - Full response:', commentResponse)
            console.warn('Response keys:', Object.keys(commentResponse))
            details.comment = {
              content: '載入評論內容失敗: ' + (commentResponse.error?.message || commentResponse.message || JSON.stringify(commentResponse))
            }
          }
        }
        
        transactionDetailsMap.value.set(transactionId, details)
      } catch (error) {
        console.error('Error loading transaction details:', error)
        ElMessage.error('載入交易詳情失敗: ' + (error.message || '未知錯誤'))
        
        // 設置錯誤訊息
        const errorDetails = {}
        if (transaction.relatedSubmissionId) {
          errorDetails.submission = { content: '載入失敗，請稍後重試' }
        }
        if (transaction.relatedCommentId) {
          errorDetails.comment = { content: '載入失敗，請稍後重試' }
        }
        transactionDetailsMap.value.set(transactionId, errorDetails)
      } finally {
        loadingTransactionDetails.value.delete(transactionId)
      }
    }

    const showSettlementDetails = async (settlementId) => {
      try {
        // 找到對應的階段
        const response = await apiClient.callWithAuth('/scoring/settlement/history', {
          projectId: selectedProject.value.projectId,
          filters: { settlementId: settlementId }
        })
        
        if (response.success && response.data?.settlements?.length > 0) {
          const settlement = response.data.settlements[0]
          const stageId = settlement.stageId
          
          // 設定要顯示的階段資訊
          selectedStageForAnalysis.value = { stageId, stageName: settlement.stageName || '階段' }
          
          // 根據結算類型顯示對應的分析模態窗口
          if (settlement.settlementType === 'comment' || settlement.settlementType === 'comment_settlement') {
            showCommentAnalysisModal.value = true
          } else {
            // 預設顯示互評獎金分配
            showVotingAnalysisModal.value = true
          }
        } else {
          ElMessage.error('找不到結算記錄')
        }
      } catch (error) {
        console.error('Error loading settlement details:', error)
        ElMessage.error('載入結算詳情失敗')
      }
    }

    const handleTransactionSettlementCommand = async (command, settlementId) => {
      try {
        // 找到對應的階段
        const response = await apiClient.callWithAuth('/scoring/settlement/history', {
          projectId: selectedProject.value.projectId,
          filters: { settlementId: settlementId }
        })
        
        if (response.success && response.data?.settlements?.length > 0) {
          const settlement = response.data.settlements[0]
          const stageId = settlement.stageId
          
          // 設定要顯示的階段資訊
          selectedStageForAnalysis.value = { stageId, stageName: settlement.stageName || '階段' }
          
          // 根據選擇顯示對應的分析模態窗口
          if (command === 'report') {
            showVotingAnalysisModal.value = true
          } else if (command === 'comment') {
            showCommentAnalysisModal.value = true
          }
        } else {
          ElMessage.error('找不到結算記錄')
        }
      } catch (error) {
        console.error('Error loading settlement details:', error)
        ElMessage.error('載入結算詳情失敗')
      }
    }


    const getDisplayName = (email) => {
      // Extract name part from email for display
      return email.split('@')[0]
    }
    
    const getStageDisplayName = (stageId) => {
      if (!stageId) return '無階段'
      if (!selectedProject.value || !projectStages.value) return `階段${stageId}`
      
      const stage = projectStages.value.find(s => s.stageId === stageId)
      return stage ? `階段${stage.stageOrder}: ${stage.stageName}` : `階段${stageId}`
    }

    const getTransactionTypeText = (type) => {
      const typeMap = {
        'submission_reward': '提交獎勵',
        'comment_reward': '評論獎勵',
        'vote_reward': '投票獎勵',
        'bonus_award': '額外獎勵',
        'penalty': '扣分處罰',
        'stage_completion': '階段完成',
        'settlement_reversal': '撤銷結算',
        'comment_settlement': '評論結算',
        'excellence_award': '優秀表現',
        'reversal': '撤銷點數'
      }
      return typeMap[type] || type
    }

    // 檢查交易是否已被撤銷
    const isTransactionReversed = (transaction) => {
      // 檢查是否已經是撤銷交易
      if (transaction.transactionType === 'reversal') {
        return true
      }

      // 檢查是否有對應的撤銷記錄
      return transactions.value.some(t =>
        t.transactionType === 'reversal' &&
        t.relatedTransactionId === transaction.transactionId
      )
    }

    // 提示撤銷交易（彈出輸入框要求填寫理由）
    const promptReverseTransaction = async (transaction) => {
      try {
        const { value: reason } = await ElMessageBox.prompt(
          `確定要撤銷此筆交易嗎？\n使用者：${getDisplayName(transaction.userEmail)}\n點數：${transaction.amount}\n說明：${transaction.source || transaction.description}\n\n請輸入撤銷理由：`,
          '撤銷交易確認',
          {
            confirmButtonText: '確定撤銷',
            cancelButtonText: '取消',
            inputPattern: /.+/,
            inputErrorMessage: '撤銷理由不能為空',
            inputPlaceholder: '請輸入撤銷此交易的理由...'
          }
        )

        if (reason && reason.trim()) {
          await reverseTransaction(transaction, reason.trim())
        }
      } catch (error) {
        // 用戶取消或關閉對話框
        console.log('User cancelled transaction reversal')
      }
    }

    const reverseTransaction = async (transaction, reason) => {
      try {
        reversingTransactions.value.add(transaction.transactionId)

        const response = await apiClient.callWithAuth('/wallets/reverse-transaction', {
          projectId: selectedProject.value.projectId,
          transactionId: transaction.transactionId,
          reason: reason
        })

        if (response.success) {
          ElMessage.success('交易已撤銷')
          // Reload transactions
          await loadProjectTransactions(selectedProject.value.projectId)
        } else {
          ElMessage.error(`撤銷失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error reversing transaction:', error)
        ElMessage.error('撤銷失敗，請重試')
      } finally {
        reversingTransactions.value.delete(transaction.transactionId)
      }
    }

    // Project Expansion Functions
    const toggleProjectExpansion = async (project) => {
      const projectId = project.projectId
      
      if (expandedProjects.value.has(projectId)) {
        // Collapse
        expandedProjects.value.delete(projectId)
        projectStagesMap.value.delete(projectId)
      } else {
        // Expand
        expandedProjects.value.add(projectId)
        
        // Load stages for this project
        if (!projectStagesMap.value.has(projectId)) {
          await loadProjectStagesForExpansion(projectId)
        }
      }
    }
    
    const loadProjectStagesForExpansion = async (projectId) => {
      loadingProjectStages.value.add(projectId)
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          projectStagesMap.value.set(projectId, [])
          return
        }
        
        const response = await apiClient.callWithAuth('/stages/list', {
          projectId: projectId
        })
        
        if (response.success && response.data) {
          const sortedStages = response.data.sort((a, b) => a.stageOrder - b.stageOrder)
          projectStagesMap.value.set(projectId, sortedStages)
        } else {
          console.error('Failed to load stages:', response.error)
          projectStagesMap.value.set(projectId, [])
        }
      } catch (error) {
        console.error('Error loading stages:', error)
        projectStagesMap.value.set(projectId, [])
      } finally {
        loadingProjectStages.value.delete(projectId)
      }
    }

    // Stage Editor Functions
    const openStageEditor = async (project) => {
      selectedProject.value = project
      showStageEditor.value = true
      activeCollapse.value = [] // 預設折疊新增階段區塊
      
      // 載入真實的階段資料
      await loadProjectStages(project.projectId)
    }

    const loadProjectStages = async (projectId) => {
      loadingStages.value = true
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          projectStages.value = []
          loadingStages.value = false
          return
        }
        
        const response = await apiClient.callWithAuth('/stages/list', {
          projectId: projectId
        })
        
        if (response.success && response.data) {
          projectStages.value = response.data.sort((a, b) => a.stageOrder - b.stageOrder)
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


    const editStage = async (stage, project = null) => {
      // Clear any previous errors
      stageFormError.value = null

      // Ensure selectedProject is set
      if (project) {
        selectedProject.value = project
      } else if (!selectedProject.value) {
        // Find the project that contains this stage
        const projectForStage = projects.value.find(p =>
          expandedProjects.value.has(p.projectId) &&
          projectStagesMap.value.get(p.projectId)?.some(s => s.stageId === stage.stageId)
        )
        if (projectForStage) {
          selectedProject.value = projectForStage
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
        const response = await apiClient.callWithAuth('/stages/get', {
          projectId: selectedProject.value.projectId,
          stageId: stage.stageId
        })
        
        if (response.success && response.data) {
          const stageDetails = response.data
          editStageForm.stageId = stageDetails.stageId
          editStageForm.stageName = stageDetails.stageName
          // 修正時區問題：使用本地時區而不是UTC
          const formatDatetimeLocal = (timestamp) => {
            const date = new Date(timestamp)
            // 獲取本地時間的YYYY-MM-DDTHH:MM格式，避免時區轉換
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            return `${year}-${month}-${day}T${hours}:${minutes}`
          }
          
          editStageForm.startDate = formatDatetimeLocal(stageDetails.startDate)
          editStageForm.endDate = formatDatetimeLocal(stageDetails.endDate)
          editStageForm.description = stageDetails.description || ''
          editStageForm.status = stageDetails.status
          
          // Get reward pools directly from stage data
          editStageForm.reportRewardPool = stageDetails.reportRewardPool || 0
          editStageForm.commentRewardPool = stageDetails.commentRewardPool || 0
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

    const updateStageDetails = async () => {
      // Clear previous errors
      stageFormError.value = null

      if (!editStageForm.stageName.trim()) {
        stageFormError.value = {
          title: '驗證失敗',
          message: '請輸入階段名稱'
        }
        ElMessage.error('請輸入階段名稱')
        return
      }

      if (!editStageForm.startDate || !editStageForm.endDate) {
        stageFormError.value = {
          title: '驗證失敗',
          message: '請選擇開始和結束時間'
        }
        ElMessage.error('請選擇開始和結束時間')
        return
      }

      if (new Date(editStageForm.endDate) <= new Date(editStageForm.startDate)) {
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
            startDate: new Date(editStageForm.startDate).getTime(),
            endDate: new Date(editStageForm.endDate).getTime(),
            description: editStageForm.description,
            reportRewardPool: editStageForm.reportRewardPool || 0,
            commentRewardPool: editStageForm.commentRewardPool || 0
          }

          const response = await apiClient.callWithAuth('/stages/update', {
            projectId: selectedProject.value.projectId,
            stageId: editStageForm.stageId,
            updates: updates
          })

          if (response.success) {
            ElMessage.success('階段已更新')

            // Reload project stages to ensure data sync
            await loadProjectStagesForExpansion(selectedProject.value.projectId)

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

          const stages = projectStagesMap.value.get(selectedProject.value.projectId) || []
          const stageData = {
            stageName: editStageForm.stageName.trim(),
            description: editStageForm.description,
            stageOrder: stages.length + 1,
            startDate: new Date(editStageForm.startDate).getTime(),
            endDate: new Date(editStageForm.endDate).getTime(),
            reportRewardPool: editStageForm.reportRewardPool || 0,
            commentRewardPool: editStageForm.commentRewardPool || 0
          }

          console.log('Stage data to create:', stageData)
          console.log('Project ID:', selectedProject.value.projectId)

          const response = await apiClient.callWithAuth('/stages/create', {
            projectId: selectedProject.value.projectId,
            stageData: stageData
          })

          console.log('Create stage response:', response)

          if (response.success) {
            ElMessage.success('階段已新增')
            console.log('Stage created successfully:', response.data)

            // Reload project stages to ensure data sync
            await loadProjectStagesForExpansion(selectedProject.value.projectId)

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
    const handleDragStart = (stage, event) => {
      draggedStage.value = stage
      event.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (event, projectId, targetIndex) => {
      event.preventDefault()
      
      if (!draggedStage.value) {
        return
      }

      const stages = projectStagesMap.value.get(projectId) || []
      const draggedIndex = stages.findIndex(s => s.stageId === draggedStage.value.stageId)
      
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
      projectStagesMap.value.set(projectId, newStages)
      
      // Save the new order to backend
      saveStageOrder(projectId, newStages)
      
      draggedStage.value = null
    }


    const handleDragEnd = () => {
      draggedStage.value = null
    }

    const moveStageUpInProject = async (projectId, currentIndex) => {
      if (currentIndex === 0) return
      
      const stages = projectStagesMap.value.get(projectId) || []
      const newStages = [...stages]
      
      // 交換位置
      const temp = newStages[currentIndex]
      newStages[currentIndex] = newStages[currentIndex - 1]
      newStages[currentIndex - 1] = temp
      
      // 更新順序
      newStages.forEach((stage, index) => {
        stage.stageOrder = index + 1
      })
      
      // 更新map
      projectStagesMap.value.set(projectId, newStages)
      
      // 保存到後端
      await saveStageOrder(projectId, newStages)
    }

    const moveStageDownInProject = async (projectId, currentIndex) => {
      const stages = projectStagesMap.value.get(projectId) || []
      if (currentIndex === stages.length - 1) return
      
      const newStages = [...stages]
      
      // 交換位置
      const temp = newStages[currentIndex]
      newStages[currentIndex] = newStages[currentIndex + 1]
      newStages[currentIndex + 1] = temp
      
      // 更新順序
      newStages.forEach((stage, index) => {
        stage.stageOrder = index + 1
      })
      
      // 更新map
      projectStagesMap.value.set(projectId, newStages)
      
      // 保存到後端
      await saveStageOrder(projectId, newStages)
    }

    const formatDate = (timestamp) => {
      if (!timestamp) return '-'
      // 与ProjectDetail.vue保持一致，使用dayjs處理時間
      const date = typeof timestamp === 'number' ? dayjs(timestamp) : dayjs(timestamp)
      return date.format('YYYY/MM/DD HH:mm:ss')
    }

    const getStageStatusType = (stage) => {
      const status = calculateStageStatus(stage)
      switch (status) {
        case 'pending': return 'info'
        case 'active': return 'success'
        case 'voting': return 'warning'
        case 'completed': return ''
        case 'archived': return 'info'
        default: return 'info'
      }
    }

    const addNewStage = async () => {
      if (!newStage.stageName.trim()) {
        ElMessage.error('請輸入階段名稱')
        return
      }

      if (!newStage.startDate || !newStage.endDate) {
        ElMessage.error('請選擇開始和結束時間')
        return
      }

      if (new Date(newStage.endDate) <= new Date(newStage.startDate)) {
        ElMessage.error('結束時間必須晚於開始時間')
        return
      }

      try {
        const stageData = {
          stageName: newStage.stageName.trim(),
          description: newStage.description,
          stageOrder: projectStages.value.length + 1,
          startDate: new Date(newStage.startDate).getTime(),
          endDate: new Date(newStage.endDate).getTime(),
          reportRewardPool: newStage.reportRewardPool || 0,
          commentRewardPool: newStage.commentRewardPool || 0
        }
        
        const response = await apiClient.callWithAuth('/stages/create', {
          projectId: selectedProject.value.projectId,
          stageData: stageData
        })
        
        if (response.success) {
          ElMessage.success('階段已新增')
          
          // Reset form
          newStage.stageName = ''
          newStage.startDate = ''
          newStage.endDate = ''
          newStage.description = ''
          newStage.reportRewardPool = 0
          newStage.commentRewardPool = 0
          
          // Reload stages
          await loadProjectStages(selectedProject.value.projectId)
        } else {
          ElMessage.error(`新增失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error creating stage:', error)
        ElMessage.error('新增階段失敗，請重試')
      }
    }

    const onDragStart = (stage) => {
      draggedStage.value = stage
    }

    const onDrop = (targetIndex) => {
      if (!draggedStage.value) return
      
      const draggedIndex = projectStages.value.findIndex(s => s.stageId === draggedStage.value.stageId)
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

    const selectStage = (stage) => {
      selectedStage.value = stage
    }
    
    const getStageIndex = (stage) => {
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
    
    const updateStageOrders = (stages) => {
      stages.forEach((stage, index) => {
        stage.stageOrder = index + 1
      })
      projectStages.value = stages
    }
    
    const saveStageOrder = async (projectId = null, stages = null) => {
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
          const response = await apiClient.callWithAuth('/stages/update', {
            projectId: targetProjectId,
            stageId: stage.stageId,
            updates: { stageOrder: stage.stageOrder }
          })
          
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

    const forceEnterVoting = async (stage) => {
      if (!confirm(`確定要強制「${stage.stageName}」進入投票階段嗎？\n此操作將立即結束提交階段。`)) {
        return
      }
      
      try {
        const response = await apiClient.callWithAuth('/stages/force-transition', {
          projectId: selectedProject.value.projectId,
          stageId: stage.stageId,
          newStatus: 'voting'
        })
        
        if (response.success) {
          ElMessage.success('已強制進入投票階段')
          
          // Update the stage status in the list
          const stageIndex = projectStages.value.findIndex(s => s.stageId === stage.stageId)
          if (stageIndex !== -1) {
            projectStages.value[stageIndex].status = 'voting'
          }
        } else {
          ElMessage.error(`操作失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error forcing stage transition:', error)
        ElMessage.error('操作失敗，請重試')
      }
    }
    
    const settleStage = async (stage) => {
      const reportReward = stage.reportRewardPool || 0
      const commentReward = stage.commentRewardPool || 0
      
      if (confirm(
        `確定要結算「${stage.stageName}」的獎金嗎？\n\n` +
        `• 報告獎金池：${reportReward} 點\n` +
        `• 評論獎金池：${commentReward} 點\n\n` +
        `將按照排名規則分別分配獎金給參與者。\n` +
        `此操作無法撤銷。`
      )) {
        // 開始結算，添加到載入狀態
        settlingStages.value.add(stage.stageId)
        
        try {
          const response = await apiClient.callWithAuth('/scoring/settle', {
            projectId: selectedProject.value.projectId,
            stageId: stage.stageId
          })
          
          if (response.success) {
            ElMessage.success(`階段「${stage.stageName}」結算完成！獎金已按照系統規則自動分配。`)
            
            // Update the stage status in the list
            const stageIndex = projectStages.value.findIndex(s => s.stageId === stage.stageId)
            if (stageIndex !== -1) {
              projectStages.value[stageIndex].status = 'completed'
            }
          } else {
            ElMessage.error(`結算失敗: ${response.error?.message || '未知錯誤'}`)
          }
        } catch (error) {
          console.error('Error settling stage:', error)
          ElMessage.error('結算階段失敗，請重試')
        } finally {
          // 結算完成，移除載入狀態
          settlingStages.value.delete(stage.stageId)
        }
      }
    }
    
    const handleDistributionCommand = (command, stage) => {
      if (stage.status === 'completed') {
        // 設定要顯示的階段資訊
        selectedStageForAnalysis.value = stage
        
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
    
    const reverseSettlement = async (stage) => {
      if (stage.status !== 'completed') {
        ElMessage.warning('只有已結算的階段才能撤銷')
        return
      }
      
      if (reversingSettlement.value) {
        return // 防止重複點擊
      }
      
      // 首先獲取結算詳情
      try {
        reversingSettlement.value = true
        
        console.log('開始撤銷結算:', {
          projectId: selectedProject.value.projectId,
          stageId: stage.stageId
        })
        
        const historyResponse = await apiClient.callWithAuth('/scoring/settlement/history', {
          projectId: selectedProject.value.projectId,
          filters: { stageId: stage.stageId, status: 'active' }
        })
        
        console.log('獲取結算歷史回應:', historyResponse)
        
        if (!historyResponse.success) {
          console.error('獲取結算歷史失敗:', historyResponse.error)
          ElMessage.error(`獲取結算記錄失敗: ${historyResponse.error?.message || '未知錯誤'}`)
          return
        }
        
        if (!historyResponse.data?.settlements?.length) {
          console.warn('沒有找到結算記錄:', historyResponse.data)
          ElMessage.error('找不到該階段的結算記錄')
          return
        }
        
        const settlement = historyResponse.data.settlements[0]
        const totalReward = settlement.totalRewardDistributed || 0
        const participantCount = settlement.participantCount || 0
        
        // 確認對話框
        const reason = await ElMessageBox.prompt(
          `確定要撤銷階段「${stage.stageName}」的結算嗎？\n\n` +
          `結算詳情：\n` +
          `• 總獎金：${totalReward} 點\n` +
          `• 參與者：${participantCount} 人\n` +
          `• 結算時間：${new Date(settlement.settlementTime).toLocaleString()}\n\n` +
          `撤銷後將創建反向交易記錄，階段狀態將回到投票階段。\n\n` +
          `請輸入撤銷原因：`,
          '撤銷結算確認',
          {
            confirmButtonText: '確定撤銷',
            cancelButtonText: '取消',
            inputPattern: /.{5,100}/,
            inputErrorMessage: '撤銷原因至少需要5個字符，最多100個字符',
            inputPlaceholder: '例如：發現計分錯誤需要重新結算',
            type: 'warning',
            inputType: 'textarea'
          }
        )
        
        // 執行撤銷
        console.log('執行撤銷結算:', {
          projectId: selectedProject.value.projectId,
          settlementId: settlement.settlementId,
          reason: reason.value
        })
        
        const reverseResponse = await apiClient.callWithAuth('/scoring/settlement/reverse', {
          projectId: selectedProject.value.projectId,
          settlementId: settlement.settlementId,
          reason: reason.value
        })
        
        console.log('撤銷結算回應:', reverseResponse)
        
        if (reverseResponse.success) {
          ElMessage.success(
            `結算已成功撤銷！\n` +
            `撤銷ID：${reverseResponse.data.reversalId}\n` +
            `反向交易數：${reverseResponse.data.transactionsReversed}筆\n` +
            `階段已回到投票狀態`
          )
          
          // 更新階段狀態
          const stageIndex = projectStages.value.findIndex(s => s.stageId === stage.stageId)
          if (stageIndex !== -1) {
            projectStages.value[stageIndex].status = 'voting'
          }
          
          // 重新載入階段資料以確保數據同步
          await loadProjectStages(selectedProject.value.projectId)
        } else {
          ElMessage.error(`撤銷失敗：${reverseResponse.error?.message || '未知錯誤'}`)
        }
        
      } catch (error) {
        console.error('撤銷結算發生錯誤:', error)
        if (error !== 'cancel') {
          console.error('撤銷結算錯誤:', error)
          ElMessage.error(`撤銷結算失敗: ${error.message || error}`)
        }
      } finally {
        console.log('重置 reversingSettlement 狀態')
        reversingSettlement.value = false
      }
    }

    const archiveStage = async (stage, project) => {
      try {
        // Add to archiving set
        archivingStages.value.add(stage.stageId)

        // Use project parameter if provided, otherwise fall back to selectedProject
        const projectId = project?.projectId || selectedProject.value?.projectId
        if (!projectId) {
          ElMessage.error('無法取得專案ID')
          return
        }

        const response = await apiClient.callWithAuth('/stages/update', {
          projectId: projectId,
          stageId: stage.stageId,
          updates: { status: 'archived' }
        })

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

    const unarchiveStage = async (stage, project) => {
      try {
        // Add to archiving set (reuse the same tracking set)
        archivingStages.value.add(stage.stageId)

        // Use project parameter if provided, otherwise fall back to selectedProject
        const projectId = project?.projectId || selectedProject.value?.projectId
        if (!projectId) {
          ElMessage.error('無法取得專案ID')
          return
        }

        const response = await apiClient.callWithAuth('/stages/update', {
          projectId: projectId,
          stageId: stage.stageId,
          updates: { status: 'pending' }
        })

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

    const getFilteredStages = (projectId) => {
      const stages = projectStagesMap.value.get(projectId) || []
      if (showArchivedStages.value) {
        return stages  // Show all stages including archived
      }
      return stages.filter(s => s.status !== 'archived')  // Hide archived stages
    }

    // Clone project functionality
    const cloneProject = async (project) => {
      const newProjectName = prompt(`請輸入新專案名稱（將複製「${project.projectName}」的設定）:`)
      if (!newProjectName || !newProjectName.trim()) {
        return
      }
      
      cloningProject.value = true
      loading.value = true
      ElMessage.info('開始複製專案，請稍候...')
      
      try {
        const response = await apiClient.callWithAuth('/projects/clone', {
          projectId: project.projectId,
          newProjectName: newProjectName.trim()
        })
        
        if (response.success) {
          ElMessage.success(`專案「${newProjectName}」複製成功！`)
          await loadProjects() // Refresh the project list
        } else {
          ElMessage.error(`複製失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error cloning project:', error)
        ElMessage.error('複製專案失敗，請重試')
      } finally {
        cloningProject.value = false
        loading.value = false
      }
    }

    // Clone stage functionality
    const cloneStage = async (stage) => {
      const newStageName = prompt(`請輸入新階段名稱（將複製「${stage.stageName}」的設定）:`)
      if (!newStageName || !newStageName.trim()) {
        return
      }
      
      cloningStage.value = true
      loadingStages.value = true
      ElMessage.info('開始複製階段，請稍候...')
      
      try {
        const response = await apiClient.callWithAuth('/stages/clone', {
          projectId: selectedProject.value.projectId,
          stageId: stage.stageId,
          newStageName: newStageName.trim()
        })
        
        if (response.success) {
          ElMessage.success(`階段「${newStageName}」複製成功！`)
          await loadProjectStages(selectedProject.value.projectId) // Refresh the stage list
        } else {
          ElMessage.error(`複製失敗: ${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('Error cloning stage:', error)
        ElMessage.error('複製階段失敗，請重試')
      } finally {
        cloningStage.value = false
        loadingStages.value = false
      }
    }

    // Additional helper functions for stage management
    const showSettlementDistribution = (stage) => {
      handleDistributionCommand('report', stage)
    }
    
    const canSettleStage = (stage) => {
      const now = Date.now()
      return stage.endDate < now && stage.status === 'active'
    }
    
    const openVotingAnalysisModal = (stage) => {
      selectedStageForAnalysis.value = stage
      showVotingAnalysisModal.value = true
    }

    // 為專案列表中的空階段打開階段編輯器
    const openCreateStageForProject = async (project) => {
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

      const formatDatetimeLocal = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}`
      }

      editStageForm.startDate = formatDatetimeLocal(now)
      editStageForm.endDate = formatDatetimeLocal(nextWeek)

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

    onMounted(() => {
      loadProjects()
      loadAllTags()
    })

    return {
      projects,
      searchText,
      statusFilter,
      creatorFilter,
      showCreateModal,
      showEditModal,
      showViewModal,
      showWalletDrawer,
      selectedProject,
      transactions,
      reversingTransactions,
      creating,
      updating,
      loading,
      projectForm,
      editForm,
      walletFilters,
      stats,
      filteredProjects,
      filteredTransactions,
      formatTime,
      truncateText,
      getProgressPercentage,
      getStageCompletionPercentage,
      getStatusIcon,
      getStatusText,
      // Tag management
      showTagModal,
      allTags,
      currentProjectTags,
      tagFilterText,
      tagCategoryFilter,
      filteredAvailableTags,
      openTagAssignment,
      assignTagToProject,
      removeTagFromProject,
      loadAllTags,
      loadProjectTags,
      // Project creation tag management
      selectedTags,
      availableTags,
      openCreateProjectModal,
      addProjectTag,
      removeProjectTag,
      loadTagsForCreation,
      assignTagsToProject,
      refreshProjects,
      createProject,
      editProject,
      updateProject,
      viewProject,
      archiveProject,
      unarchiveProject,
      cloneProject,
      openWalletManagement,
      openEventLogViewer,
      showEventLogDrawer,
      loadingEventLogs,
      getDisplayName,
      getStageDisplayName,
      getTransactionTypeText,
      isTransactionReversed,
      promptReverseTransaction,
      reverseTransaction,
      showStageEditor,
      showEditStageModal,
      showVotingAnalysisModal,
      showCommentAnalysisModal,
      selectedStageForAnalysis,
      settlingStages,
      projectStages,
      draggedStage,
      editingStage,
      newStage,
      newStageForm,
      editStageForm,
      stageFormError,
      openStageEditor,
      loadProjectStages,
      addNewStage,
      editStage,
      updateStageDetails,
      settleStage,
      handleDistributionCommand,
      reverseSettlement,
      archiveStage,
      cloneStage,
      saveStageOrder,
      onDragStart,
      onDrop,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
      formatDate,
      calculateStageStatus,
      getStageStatusText,
      getStageStatusType,
      loadingStages,
      loadingStageDetails,
      savingStageDetails,
      savingStageOrder,
      activeCollapse,
      // Project expansion
      expandedProjects,
      projectStagesMap,
      loadingProjectStages,
      expandedTransactions,
      toggleProjectExpansion,
      loadProjectStagesForExpansion,
      showSettlementDistribution,
      canSettleStage,
      openVotingAnalysisModal,
      // Wallet management
      loadingWalletTransactions,
      loadingTransactionDetails,
      transactionDetailsMap,
      toggleTransactionExpansion,
      loadTransactionDetails,
      showSettlementDetails,
      handleTransactionSettlementCommand,
      selectedStage,
      cloningProject,
      cloningStage,
      reversingSettlement,
      forceEnterVoting,
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
    }
  }
}
</script>

<style scoped>
.project-management {
  padding: 20px;
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

.project-stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  color: #666;
  font-size: 14px;
}

.stat-item i {
  margin-right: 5px;
  color: #2c5aa0;
}

.header-right {
  display: flex;
  gap: 10px;
}

.filters {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 120px;
}

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

.expand-icon {
  font-size: 12px;
  color: #666;
  transition: transform 0.3s ease;
}

.project-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.project-row:hover {
  background: #f0f4f8 !important;
}

.project-row.expanded {
  background: #e8f4f8;
}

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

/* Button Base Styles */
.btn-primary, .btn-secondary, .btn-warning, .btn-success, .btn-info, .btn-light, .btn-danger {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.btn-sm i {
  margin-right: 0;
  font-size: 11px;
}

/* Button Color Variants */
.btn-primary {
  background: linear-gradient(135deg, #2c5aa0 0%, #3d6bb3 100%);
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #1e4080 0%, #2c5aa0 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(44, 90, 160, 0.3);
}

.btn-secondary {
  background: linear-gradient(135deg, #6c757d 0%, #7a8389 100%);
  color: white;
}

.btn-secondary:hover {
  background: linear-gradient(135deg, #5a6268 0%, #6c757d 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(108, 117, 125, 0.3);
}

.btn-info {
  background: linear-gradient(135deg, #17a2b8 0%, #20c0db 100%);
  color: white;
}

.btn-info:hover {
  background: linear-gradient(135deg, #138496 0%, #17a2b8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(23, 162, 184, 0.3);
}

.btn-success {
  background: linear-gradient(135deg, #28a745 0%, #34ce57 100%);
  color: white;
}

.btn-success:hover {
  background: linear-gradient(135deg, #1e7e34 0%, #28a745 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3);
}

.btn-warning {
  background: linear-gradient(135deg, #ffc107 0%, #ffca2c 100%);
  color: #212529;
}

.btn-warning:hover {
  background: linear-gradient(135deg, #e0a800 0%, #ffc107 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(255, 193, 7, 0.3);
}

.btn-archive {
  background: linear-gradient(135deg, #ffc107 0%, #ffca2c 100%);
  color: white;
  font-weight: 500;
}

.btn-archive:hover {
  background: linear-gradient(135deg, #e0a800 0%, #ffc107 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(255, 193, 7, 0.3);
}

.btn-light {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  color: #495057;
  border: 1px solid #dee2e6;
}

.btn-light:hover {
  background: linear-gradient(135deg, #e2e6ea 0%, #f8f9fa 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.btn-danger {
  background: linear-gradient(135deg, #dc3545 0%, #e15865 100%);
  color: white;
}

.btn-danger:hover {
  background: linear-gradient(135deg, #c82333 0%, #dc3545 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3);
}

/* Disabled State */
.btn-primary:disabled, .btn-secondary:disabled, .btn-warning:disabled, 
.btn-success:disabled, .btn-light:disabled, .btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-primary:disabled:hover, .btn-secondary:disabled:hover, .btn-warning:disabled:hover,
.btn-success:disabled:hover, .btn-light:disabled:hover, .btn-danger:disabled:hover {
  transform: none;
  box-shadow: none;
}

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

.drawer-header h3 {
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

.wallet-drawer .el-drawer__body {
  padding: 0 !important;
  height: 100% !important;
  background: linear-gradient(135deg, #006633 0%, #004d26 50%, #002d1a 100%) !important;
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
</style>