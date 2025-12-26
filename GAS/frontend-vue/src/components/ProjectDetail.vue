<template>
  <div class="dashboard">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="page-title">
        <h2>{{ projectTitle || '載入中...' }}</h2>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="$emit('user-command', $event)"
      />
    </div>

    <div class="main-content" v-loading="loading" element-loading-text="載入專案資料中...">
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
            :class="{ 
              'stage-pending': stage.status === 'pending',
              'stage-completed': stage.status === 'completed'
            }"
            v-for="stage in stages" 
            :key="stage.id"
            :id="`stage-${stage.id}`"
          >
            <!-- 階段狀態badge -->
            <div class="stage-status-badge" :class="`status-${stage.status}`">
              <span v-if="stage.status === 'pending'">階段尚未開始</span>
              <span v-else-if="stage.status === 'active'">階段進行中</span>
              <span v-else-if="stage.status === 'voting'">投票中</span>
              <span v-else-if="stage.status === 'completed'">已完成</span>
              <span v-else>{{ stage.status }}</span>
            </div>
            <div class="stage-header">
              <div class="stage-info">
                <h2 class="stage-title">{{ stage.title }}</h2>
                <div class="stage-description-wrapper">
                  <p class="stage-description" v-if="!stage.showFullDescription">
                    {{ truncateDescription(stage.description) }}
                    <button 
                      v-if="shouldShowFullDescriptionButton(stage)" 
                      class="btn-link"
                      @click="stage.showFullDescription = true"
                    >
                      顯示完整描述
                    </button>
                  </p>
                  <div v-else class="stage-description-full">
                    <MarkdownViewer :content="stage.description" />
                    <button 
                      class="btn-link"
                      @click="stage.showFullDescription = false"
                    >
                      收起描述
                    </button>
                  </div>
                </div>
              </div>
              <div class="stage-actions">
                <StageViewToggle 
                  v-model="stage.viewMode" 
                  @update:model-value="handleStageViewModeChange(stage, $event)"
                />
                <el-button 
                  size="small" 
                  @click="refreshStageContent(stage)"
                  :loading="stage.refreshing"
                  :icon="stage.refreshing ? undefined : 'Refresh'"
                >
                  {{ stage.refreshing ? '重新載入中...' : '重新整理' }}
                </el-button>
              </div>
            </div>

            <!-- 共識警告提示 -->
            <el-alert
              v-if="shouldShowConsensusWarning(stage)"
              :title="getConsensusWarningTitle(stage)"
              type="warning"
              :description="getConsensusWarningDescription(stage)"
              show-icon
              :closable="false"
              class="consensus-warning"
            />

            <div class="stage-details">
              <div class="stage-item">
                <span class="label">階段報告獎金</span>
                <span class="value">{{ stage.reportReward }}</span>
              </div>
              <div class="stage-item">
                <span class="label">階段評論獎金</span>
                <span class="value">{{ stage.commentReward }}</span>
              </div>
              <div class="stage-item">
                <span class="label">階段截止時間</span>
                <span class="value">{{ formatDate(stage.deadline) }}</span>
              </div>
              <div class="stage-actions-inline">
                <!-- 提交和評論按鈕：只在 active 狀態且非總PM顯示 -->
                <button 
                  v-if="stage.status === 'active' && !isGlobalPM" 
                  class="btn btn-primary" 
                  @click="handleReportAction(stage)"
                  :disabled="loadingReportGroupData"
                >
                  <i v-if="loadingReportGroupData" class="fas fa-spinner fa-spin"></i>
                  {{ getReportButtonText(stage) }}
                </button>
                <button 
                  v-if="stage.status === 'active' || isGlobalPM" 
                  class="btn btn-tertiary" 
                  @click="openSubmitCommentModal(stage)"
                  :disabled="loadingCommentGroupData"
                >
                  <i v-if="loadingCommentGroupData" class="fas fa-spinner fa-spin"></i>
                  {{ loadingCommentGroupData ? '更新群組資料中...' : '張貼評論' }}
                </button>
                
                <!-- 參與者投票按鈕：只在 voting 狀態顯示 -->
                <button 
                  v-if="stage.status === 'voting' && !isGlobalPM" 
                  class="btn btn-secondary" 
                  @click="openVoteResultModal(stage)"
                  :disabled="loadingVoteData"
                >
                  <i v-if="loadingVoteData" class="fas fa-spinner fa-spin"></i>
                  {{ loadingVoteData ? '載入中...' : '階段成果投票' }}
                </button>
                
                <!-- 教師投票按鈕：只有具有教師權限的用戶能看到 -->
                <button 
                  v-if="isGlobalPM" 
                  class="btn btn-secondary" 
                  @click="openTeacherVoteModal(stage)"
                  :disabled="loadingTeacherVoteData"
                >
                  <i v-if="loadingTeacherVoteData" class="fas fa-spinner fa-spin"></i>
                  {{ loadingTeacherVoteData ? '載入中...' : '教師投票' }}
                </button>
                <button 
                  v-if="stage.status === 'voting' && !isGlobalPM" 
                  class="btn btn-quaternary" 
                  @click="openCommentVoteModal(stage)"
                >
                  評論投票
                </button>
                
                <!-- Dropdown for showing point distribution -->
                <el-dropdown
                  v-if="stage.status === 'completed'"
                  trigger="click"
                  @command="handleAnalysisCommand($event, stage)"
                  :disabled="loadingVotingAnalysis"
                >
                  <button class="btn btn-dark" :disabled="loadingVotingAnalysis">
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

            <!-- 階段成果模式：顯示學生小組列表和報告 -->
            <div v-if="!stage.viewMode" class="groups-section" v-loading="stage.loadingReports" element-loading-text="載入報告資料中..." style="min-height: 150px;">
              <div v-for="group in stage.groups" :key="group.id">
                <div class="group-item">
                  <div class="group-stats">
                    <div class="stat">
                      <span class="stat-label">結算名次</span>
                      <span class="stat-number">
                        <i v-if="group.rankingsLoading" class="fa fa-spinner fa-spin"></i>
                        <span v-else>{{ group.settlementRank || '-' }}</span>
                      </span>
                    </div>
                    <div class="stat">
                      <span class="stat-label">貴組投票名次</span>
                      <span class="stat-number">
                        <i v-if="group.rankingsLoading" class="fa fa-spinner fa-spin"></i>
                        <span v-else>{{ group.voteRank || '-' }}</span>
                      </span>
                    </div>
                    <div class="stat">
                      <span class="stat-label">老師給的排名</span>
                      <span class="stat-number">
                        <i v-if="group.rankingsLoading" class="fa fa-spinner fa-spin"></i>
                        <span v-else>{{ group.teacherRank || '-' }}</span>
                      </span>
                    </div>
                  </div>
                  
                  <div class="group-names">
                    <span 
                      :title="group.memberNames.join('、')"
                      class="member-display"
                    >
                      {{ formatMemberNames(group.memberNames) }}
                    </span>
                    <span class="submission-time" v-if="group.submitTime">
                      （{{ formatSubmissionTime(group.submitTime) }}繳交）
                    </span>
                  </div>

                  <div class="submission-status">
                    <el-tag 
                      v-if="isCurrentUserGroup(group)" 
                      type="success" 
                      size="small" 
                      class="current-group-tag"
                    >
                      本組
                    </el-tag>
                  </div>

                  <div class="group-actions">
                    <button 
                      class="btn btn-outline btn-sm" 
                      @click="toggleGroupReport(group)"
                      :class="{ active: group.showReport }"
                    >
                      {{ group.showReport ? '隱藏報告' : '查看報告' }}
                    </button>
                  </div>
                </div>
                
                <!-- 展開的報告內容 -->
                <div v-if="group.showReport" class="group-report-content">
                  <div class="report-members">
                    成員：{{ group.memberNames.join('、') }}
                  </div>
                  <MarkdownViewer :content="group.reportContent" />
                </div>
              </div>
            </div>
            
            <!-- 階段評論模式：顯示評論區域 -->
            <div v-if="stage.viewMode" class="stage-comments-section" v-loading="stage.loadingComments" element-loading-text="載入評論資料中...">
              <StageComments 
                :stage-id="stage.id" 
                :project-id="projectId"
                :ref="`stageComments_${stage.id}`"
                :key="`comments_${stage.id}_${stage.commentsRefreshKey || 0}`"
                @reply-comment="handleReplyComment"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 所有彈窗組件 -->
    <VoteResultModal 
      v-model:visible="showVoteResultModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :vote-data="currentModalVoteData"
      :user="user"
      @vote="handleVoteSubmit"
      @resubmit="handleResubmitRanking"
    />
    
    <SubmitReportModal 
      v-model:visible="showSubmitReportModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :project-title="projectTitle"
      :stage-title="currentModalStageTitle"
      :report-reward="currentModalStageReward"
      :current-user-email="user?.email || user?.userEmail"
      :current-group="currentUserGroup"
      :all-groups="projectData?.groups || []"
      @submit="handleReportSubmit"
    />
    
    <SubmitCommentModal 
      v-model:visible="showSubmitCommentModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :project-title="projectTitle"
      :stage-title="currentModalStageTitle"
      :comment-reward="currentModalStageCommentReward"
      :available-groups="projectData?.groups || []"
      :available-users="projectData?.users || []"
      @submit="handleCommentSubmit"
    />
    
    <CommentVoteModal 
      v-model:visible="showCommentVoteModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      @vote-submitted="handleCommentVoteSubmit"
    />
    
    <GroupSubmissionApprovalModal 
      v-model:visible="showGroupSubmissionApprovalModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :submission-id="currentModalSubmissionId"
      :project-title="projectTitle"
      :stage-title="currentModalStageTitle"
      :group-members="currentModalGroupMembers"
      :submission-data="currentModalSubmissionData"
      :stage-reward="currentModalStageReward"
      @vote-submitted="handleGroupApprovalVoteSubmit"
      @submission-deleted="handleSubmissionDeleted"
    />

    <TeacherRankingModal 
      v-model:visible="showTeacherRankingModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :project-title="projectTitle"
      :stage-title="currentModalStageTitle"
      :stage-groups="currentModalStageGroups"
      @ranking-submitted="handleTeacherRankingSubmit"
    />
    
    <TeacherVoteModal 
      v-model:visible="showTeacherVoteModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :project-title="projectTitle"
      :stage-title="currentModalStageTitle"
      :stage-groups="currentModalStageGroups"
      @teacher-ranking-submitted="handleTeacherVoteSubmit"
    />

    <VotingAnalysisModal 
      v-model:visible="showVotingAnalysisModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :stage-title="currentModalStageTitle"
      :is-settled="currentModalStageIsSettled"
    />
    
    <CommentVotingAnalysisModal 
      v-model:visible="showCommentVotingAnalysisModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :stage-title="currentModalStageTitle"
      :is-settled="currentModalStageIsSettled"
    />

    <ReplyCommentDrawer 
      v-model:visible="showReplyCommentModal"
      :project-id="projectId"
      :stage-id="currentModalStageId"
      :original-comment="currentReplyComment"
      :project-groups="projectData?.groups || []"
      :project-users="projectData?.users || []"
      @reply-submitted="handleReplySubmitted"
    />
  </div>
</template>

<script>
import TopBarUserControls from './TopBarUserControls.vue'
import StageTimeline from './StageTimeline.vue'
import StageViewToggle from './StageViewToggle.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import StageComments from './StageComments.vue'
import VoteResultModal from './VoteResultModal.vue'
import SubmitReportModal from './SubmitReportModal.vue'
import SubmitCommentModal from './SubmitCommentModal.vue'
import CommentVoteModal from './CommentVoteModal.vue'
import GroupSubmissionApprovalModal from './GroupSubmissionApprovalModal.vue'
import TeacherRankingModal from './TeacherRankingModal.vue'
import TeacherVoteModal from './TeacherVoteModal.vue'
import VotingAnalysisModal from './VotingAnalysisModal.vue'
import CommentVotingAnalysisModal from './CommentVotingAnalysisModal.vue'
import ReplyCommentDrawer from './ReplyCommentDrawer.vue'
import { calculateStageStatus } from '@/utils/stageStatus.js'
import dayjs from 'dayjs'

export default {
  name: 'ProjectDetail',
  components: {
    TopBarUserControls,
    StageTimeline,
    StageViewToggle,
    MarkdownViewer,
    StageComments,
    VoteResultModal,
    SubmitReportModal,
    SubmitCommentModal,
    CommentVoteModal,
    GroupSubmissionApprovalModal,
    TeacherRankingModal,
    TeacherVoteModal,
    VotingAnalysisModal,
    CommentVotingAnalysisModal,
    ReplyCommentDrawer
  },
  props: {
    projectId: {
      type: String,
      required: true
    },
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
  emits: ['back', 'user-command'],
  data() {
    return {
      currentStageId: null, // 當前階段ID
      // 彈窗控制
      showVoteResultModal: false,
      showSubmitReportModal: false,
      showSubmitCommentModal: false,
      showCommentVoteModal: false,
      showGroupSubmissionApprovalModal: false,
      showTeacherRankingModal: false,
      currentModalStageId: null,
      currentModalSubmissionId: null,
      currentModalGroupMembers: [],
      currentModalSubmissionData: {},
      currentModalStageTitle: '',
      currentModalStageReward: 1000,
      currentModalStageGroups: [],
      currentModalStageIsSettled: false,
      currentModalVoteData: {
        proposer: '載入中...',
        timeline: [],
        rankings: []
      },
      projectTitle: '', // 從API獲取
      projectData: null,
      loading: true,
      loadingReportGroupData: false, // 載入報告群組資料的狀態
      loadingCommentGroupData: false, // 載入評論群組資料的狀態
      loadingVoteData: false, // 載入投票資料的狀態
      loadingTeacherVoteData: false, // 載入教師投票資料的狀態
      loadingVotingAnalysis: false, // 載入計票分析資料的狀態
      showTeacherVoteModal: false, // 教師投票彈窗
      showVotingAnalysisModal: false, // 互評計票分析彈窗
      showCommentVotingAnalysisModal: false, // 評論計票分析彈窗
      showReplyCommentModal: false, // 回復評論彈窗
      currentReplyComment: null, // 當前要回復的評論
      stages: []
    }
  },
  computed: {
    // 為時間軸提供簡化的階段數據
    timelineStages() {
      return this.stages.map((stage, index) => {
        // 將階段狀態轉換為時間軸所需的狀態
        let timelineStatus = 'upcoming' // 預設為即將到來
        
        switch (stage.status) {
          case 'completed':
          case 'archived':
            timelineStatus = 'completed'
            break
          case 'active':
          case 'voting':
            timelineStatus = 'current' // 執行中的階段在時間軸上標記為 current
            break
          case 'pending':
          default:
            timelineStatus = 'upcoming'
            break
        }
        
        return {
          id: stage.id,
          shortTitle: `第${index + 1}階段`,
          status: timelineStatus,
          originalStatus: stage.status // 保留原始狀態供參考
        }
      })
    },
    
    // 當前彈窗階段的標題
    currentModalStageTitle() {
      const stage = this.stages.find(s => s.id === this.currentModalStageId)
      return stage ? stage.title : ''
    },
    
    // 當前彈窗階段的報告獎金
    currentModalStageReward() {
      const stage = this.stages.find(s => s.id === this.currentModalStageId)
      return stage ? stage.reportReward : 1000
    },
    
    // 當前彈窗階段的評論獎金
    currentModalStageCommentReward() {
      const stage = this.stages.find(s => s.id === this.currentModalStageId)
      return stage ? stage.commentReward : 500
    },
    
    // 檢查當前用戶是否有教師投票權限
    isGlobalPM() {
      const result = this.user?.permissions?.includes('teacher_privilege') || false
      // Debug log - remove this later
      if (this.user) {
        console.log('Teacher privilege check:', {
          user: this.user.userEmail,
          permissions: this.user.permissions,
          hasTeacherPrivilege: result
        })
      }
      return result
    },
    
    // 取得當前用戶所屬的群組資訊
    currentUserGroup() {
      console.log('currentUserGroup 檢查:', {
        hasProjectData: !!this.projectData,
        user: this.user,
        userEmail: this.user?.email,
        userUserEmail: this.user?.userEmail
      })
      
      if (!this.projectData || (!this.user?.email && !this.user?.userEmail)) {
        console.log('currentUserGroup: 缺少 projectData 或 user email')
        return null
      }
      
      const userEmail = this.user.email || this.user.userEmail
      const userGroups = this.projectData.userGroups || []
      const groups = this.projectData.groups || []
      
      console.log('currentUserGroup 調試:', {
        userEmail,
        userGroupsCount: userGroups.length,
        groupsCount: groups.length,
        userGroups: userGroups.map(ug => ({ userEmail: ug.userEmail, groupId: ug.groupId, isActive: ug.isActive })),
        groups: groups.map(g => ({ groupId: g.groupId, groupName: g.groupName, status: g.status }))
      })
      
      // 找到當前用戶的群組成員記錄（isActive=true）
      const userGroupRecord = userGroups.find(ug => 
        ug.userEmail === userEmail && ug.isActive
      )
      
      if (!userGroupRecord) {
        console.log('currentUserGroup: 找不到用戶的群組記錄')
        return null
      }
      
      console.log('找到用戶群組記錄:', userGroupRecord)
      
      // 找到對應的群組
      const group = groups.find(g => 
        g.groupId === userGroupRecord.groupId && g.status === 'active'
      )
      
      if (!group) {
        console.log('currentUserGroup: 找不到對應的群組')
        return null
      }
      
      console.log('找到對應群組:', group)
      
      // 取得該群組的所有成員
      const groupMembers = userGroups
        .filter(ug => ug.groupId === group.groupId && ug.isActive)
        .map(ug => {
          // 從 users 表獲取真正的 displayName
          const user = this.projectData.users?.find(u => u.userEmail === ug.userEmail)
          return {
            email: ug.userEmail,
            userEmail: ug.userEmail, // 兼容性
            displayName: user?.displayName || user?.username || ug.userEmail.split('@')[0],
            username: user?.username || ug.userEmail.split('@')[0],
            role: ug.role,
            joinTime: ug.joinTime
          }
        })
      
      console.log('群組成員列表:', groupMembers)
      
      const result = {
        groupId: group.groupId,
        groupName: group.groupName,
        description: group.description,
        allowChange: group.allowChange,
        members: groupMembers
      }
      
      console.log('currentUserGroup 最終結果:', result)
      return result
    }
  },
  methods: {
    // 截斷描述文字
    truncateDescription(description) {
      if (!description) return ''
      // 移除markdown標記以顯示純文字
      const plainText = description
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/<u>(.*?)<\/u>/g, '$1')
        .replace(/\[([^\]]*)\]\([^\)]*\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '')
        .replace(/^\* /gm, '')
        .replace(/^\d+\. /gm, '')
      
      return plainText.length > 20 ? plainText.substring(0, 20) + '...' : plainText
    },
    
    // 判斷是否應該顯示完整描述按鈕
    shouldShowFullDescriptionButton(stage) {
      if (!stage.description) return false
      
      // 條件1：描述長度超過20字
      if (stage.description.length > 20) return true
      
      // 條件2：描述包含markdown語法
      const markdownPatterns = [
        /\*\*.*?\*\*/,     // 粗體 **text**
        /\*.*?\*/,         // 斜體 *text*
        /<u>.*?<\/u>/,     // 底線 <u>text</u>
        /\[.*?\]\(.*?\)/,  // 連結 [text](url)
        /!\[.*?\]\(.*?\)/, // 圖片 ![alt](url)
        /^\* /m,           // 無序列表 * item
        /^\d+\. /m,        // 有序列表 1. item
        /^#{1,6} /m,       // 標題 # ## ### 等
        /`.*?`/,           // 內聯代碼 `code`
        /```[\s\S]*?```/,  // 代碼區塊
        />\s/m,            // 引用 > text
        /^\|.*\|/m,        // 表格 |col1|col2|
        /---+/,            // 分隔線
        /~~.*?~~/          // 刪除線 ~~text~~
      ]
      
      return markdownPatterns.some(pattern => pattern.test(stage.description))
    },
    
    // 判斷階段狀態
    getStageStatus(stage) {
      // 使用統一的階段狀態判斷 API
      const status = calculateStageStatus(stage)
      return status
    },
    
    // 滾動到指定階段
    scrollToStage(stageId) {
      const targetElement = document.getElementById(`stage-${stageId}`)
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    },
    
    // 尋找最早的執行中階段
    findEarliestActiveStage() {
      // 找出所有進行中的階段（active 或 voting 狀態）
      const activeStages = this.stages.filter(stage => {
        const status = stage.status
        return status === 'active' || status === 'voting'
      })
      
      if (activeStages.length === 0) {
        return null
      }
      
      // 如果只有一個活躍階段，直接返回
      if (activeStages.length === 1) {
        return activeStages[0]
      }
      
      // 多個活躍階段時，找出開始時間最早的（最早開始執行的）
      return activeStages.reduce((earliest, current) => {
        const earliestStartTime = new Date(earliest.startDate || 0).getTime()
        const currentStartTime = new Date(current.startDate || 0).getTime()
        
        // 返回開始時間較早的階段
        return currentStartTime < earliestStartTime ? current : earliest
      })
    },
    
    // 處理階段改變事件
    handleStageChanged(stageId) {
      this.currentStageId = stageId
      console.log('當前階段已切換至:', stageId)
    },
    
    // 處理階段查看模式切換
    async handleStageViewModeChange(stage, newViewMode) {
      console.log('=== handleStageViewModeChange 開始 ===')
      console.log(`階段: ${stage.title} (${stage.id})`)
      console.log(`切換至: ${newViewMode ? '評論模式' : '報告模式'}`)
      
      stage.viewMode = newViewMode
      
      // 切換模式時觸發重新載入
      if (newViewMode) {
        // 切換到評論模式，重新載入評論
        console.log('開始載入評論內容...')
        await this.refreshStageComments(stage)
        console.log('評論載入完成')
      } else {
        // 切換到報告模式，重新載入報告
        console.log('開始載入報告內容...')
        await this.refreshStageReports(stage)
        console.log('報告載入完成')
      }
      
      console.log('=== handleStageViewModeChange 結束 ===')
    },
    
    // 刷新階段內容（統一入口）
    async refreshStageContent(stage) {
      if (stage.viewMode) {
        // 當前是評論模式，刷新評論
        await this.refreshStageComments(stage)
      } else {
        // 當前是報告模式，刷新報告
        await this.refreshStageReports(stage)
      }
    },
    
    // 刷新階段評論
    async refreshStageComments(stage) {
      try {
        console.log('=== refreshStageComments 開始 ===')
        console.log(`階段 ID: ${stage.id}`)
        
        stage.loadingComments = true
        stage.refreshing = true
        
        // 方法1: 嘗試通過ref直接調用組件方法
        await this.$nextTick()
        const refName = `stageComments_${stage.id}`
        const stageCommentsComponent = this.$refs[refName]
        
        console.log(`尋找 ref: ${refName}`)
        console.log(`組件是否存在: ${!!stageCommentsComponent}`)
        
        if (stageCommentsComponent) {
          console.log('找到 StageComments 組件')
          console.log(`refreshComments 方法存在: ${!!stageCommentsComponent.refreshComments}`)
          console.log(`loadStageComments 方法存在: ${!!stageCommentsComponent.loadStageComments}`)
          
          if (stageCommentsComponent.refreshComments) {
            console.log('調用 refreshComments 方法...')
            await stageCommentsComponent.refreshComments()
            console.log('refreshComments 執行完成')
          } else if (stageCommentsComponent.loadStageComments) {
            console.log('調用 loadStageComments 方法...')
            await stageCommentsComponent.loadStageComments()
            console.log('loadStageComments 執行完成')
          }
        } else {
          // 方法2: 如果ref方法失敗，使用key強制重新渲染
          console.log('找不到 ref 組件，使用 key 強制重新渲染...')
          stage.commentsRefreshKey = (stage.commentsRefreshKey || 0) + 1
          
          // 等待組件重新渲染並掛載
          await this.$nextTick()
          await new Promise(resolve => setTimeout(resolve, 500))
          console.log('組件應該已經重新渲染')
        }
        
        console.log('=== refreshStageComments 結束 ===')
      } catch (error) {
        console.error('刷新評論失敗:', error)
        this.$message.error('刷新評論失敗')
      } finally {
        stage.loadingComments = false
        stage.refreshing = false
      }
    },
    
    // 刷新階段報告
    async refreshStageReports(stage) {
      try {
        stage.loadingReports = true
        stage.refreshing = true
        
        // 重新載入階段內容
        const content = await this.loadStageContent(stage.id, 'submissions')
        if (content && content.submissions) {
          // 處理報告數據並更新階段
          stage.groups = this.processSubmissionsToGroups(content.submissions)
          
          // 載入排名數據
          await this.loadStageRankings(stage)
          stage.contentLoaded = true
        }
        
        console.log(`已刷新階段 ${stage.title} 的報告`)
      } catch (error) {
        console.error('刷新報告失敗:', error)
        this.$message.error('刷新報告失敗')
      } finally {
        stage.loadingReports = false
        stage.refreshing = false
      }
    },
    formatDate(dateString) {
      if (!dateString) return '-'
      // 處理不同的時間格式 (timestamp 或 ISO string)
      const date = typeof dateString === 'string' ? dayjs(dateString) : dayjs(dateString)
      return date.format('YYYY/MM/DD HH:mm:ss')
    },
    formatSubmissionTime(timestamp) {
      if (!timestamp) return '-'
      // 處理timestamp格式
      const date = typeof timestamp === 'number' ? dayjs(timestamp) : dayjs(timestamp)
      return date.format('YYYY/MM/DD HH:mm:ss')
    },
    viewReports(stage) {
      console.log('查看報告:', stage)
      alert(`查看 ${stage.title} 的報告`)
    },
    viewComments(stage) {
      console.log('查看評論:', stage)
      alert(`查看 ${stage.title} 的評論`)
    },
    submitReport(stage) {
      console.log('繳交報告:', stage)
      alert(`${stage.title} - 全組繳交報告`)
    },
    voteReport(stage) {
      console.log('報告投票:', stage)
      alert(`${stage.title} - 全組報告投票`)
    },
    viewGroupReport(group) {
      console.log('查看小組報告:', group)
      alert(`查看小組報告: ${group.memberNames.join('、')}`)
    },
    toggleGroupReport(group) {
      group.showReport = !group.showReport
      console.log('切換報告顯示:', group.memberNames.join('、'), group.showReport ? '展開' : '收起')
    },
    
    // 檢查是否為當前用戶的群組
    isCurrentUserGroup(group) {
      if (!this.currentUserGroup || !group) {
        return false
      }
      return this.currentUserGroup.groupId === group.groupId
    },
    
    // 格式化成員名稱顯示
    formatMemberNames(memberNames) {
      if (!memberNames || memberNames.length === 0) {
        return '無成員'
      }
      
      const joined = memberNames.join('、')
      const maxLength = 30
      
      if (joined.length <= maxLength) {
        return joined
      }
      
      // 超出長度，顯示部分成員 + "等N人"
      let display = ''
      let count = 0
      
      for (const name of memberNames) {
        const testDisplay = count === 0 ? name : display + '、' + name
        if (testDisplay.length > maxLength - 6) { // 預留 "等N人" 的空間
          break
        }
        display = testDisplay
        count++
      }
      
      const remaining = memberNames.length - count
      return remaining > 0 ? `${display}等${memberNames.length}人` : display
    },
    
    // 彈窗控制方法
    // 檢查當前組是否已提交報告
    hasCurrentGroupSubmitted(stage) {
      if (!stage.groups || !this.projectData?.userGroups) return false
      
      // 找到當前用戶所屬的群組
      const userGroup = this.projectData.userGroups.find(ug => 
        ug.userEmail === this.user?.userEmail && ug.isActive
      )
      
      if (!userGroup) return false
      
      // 檢查該群組是否已有提交報告
      return stage.groups.some(group => group.groupId === userGroup.groupId)
    },
    
    // 獲取報告按鈕文字
    getReportButtonText(stage) {
      if (this.loadingReportGroupData) {
        return '更新群組資料中...'
      }
      
      if (this.hasCurrentGroupSubmitted(stage)) {
        return '投票同意本組報告'
      } else {
        return '全組繳交報告'
      }
    },
    
    // 處理報告相關動作
    handleReportAction(stage) {
      if (this.hasCurrentGroupSubmitted(stage)) {
        // 已有報告，開啟本組報告投票確認
        this.openGroupSubmissionApprovalModal(stage)
      } else {
        // 沒有報告，開啟提交報告彈窗
        this.openSubmitReportModal(stage)
      }
    },

    // 開啟本組報告投票確認彈窗
    async openGroupSubmissionApprovalModal(stage) {
      try {
        // 找到當前組的提交記錄
        const currentGroup = this.getCurrentUserGroup()
        if (!currentGroup) {
          this.$message.error('無法找到您所屬的群組')
          return
        }

        const groupSubmission = stage.groups.find(group => group.groupId === currentGroup.groupId)
        if (!groupSubmission || !groupSubmission.submissionId) {
          this.$message.error('無法找到本組的提交記錄')
          return
        }

        // 獲取群組成員資料
        const groupMembers = this.projectData?.userGroups?.filter(ug => 
          ug.groupId === currentGroup.groupId && ug.isActive
        ).map(ug => {
          const user = this.projectData?.users?.find(u => u.userEmail === ug.userEmail)
          return {
            userEmail: ug.userEmail,
            username: user?.username,  // 帳號名稱
            displayName: user?.displayName || user?.username || ug.userEmail.split('@')[0]
          }
        }) || []

        // 設置彈窗數據
        this.currentModalStageId = stage.id
        this.currentModalSubmissionId = groupSubmission.submissionId
        this.currentModalGroupMembers = groupMembers
        this.currentModalSubmissionData = {
          participationPercentages: groupSubmission.participationProposal || groupSubmission.participationPercentages,
          content: groupSubmission.reportContent,
          submitTime: groupSubmission.submitTime || groupSubmission.submittedAt
        }
        
        // 開啟drawer
        this.showGroupSubmissionApprovalModal = true
      } catch (error) {
        console.error('開啟投票確認彈窗失敗:', error)
        this.$message.error('開啟投票確認彈窗失敗')
      }
    },

    // 處理群組投票提交（來自 GroupSubmissionApprovalModal）
    async handleGroupApprovalVoteSubmit(data) {
      try {
        if (data.success) {
          const { votingSummary } = data.data
          
          if (votingSummary.isApproved) {
            this.$message.success('投票成功！本組報告已獲得通過')
          } else {
            this.$message.success(
              `投票成功！當前狀態：${votingSummary.agreeVotes}/${votingSummary.totalMembers} 人同意`
            )
          }

          // 刷新階段數據 - 確保投票Modal已經重新載入數據
          await this.loadProjectData()
          
          // 給Modal一點時間重新載入，然後確保其數據是最新的
          this.$nextTick(() => {
            // Modal會在其watch中自動重新載入數據
            console.log('投票完成，專案數據已刷新')
          })
        }
      } catch (error) {
        console.error('處理投票結果失敗:', error)
        this.$message.error('處理投票結果失敗')
      }
    },
    
    // 處理報告刪除（來自 GroupSubmissionApprovalModal）
    async handleSubmissionDeleted() {
      try {
        this.$message.success('報告已刪除，可以重新提交')
        // 刷新階段數據
        await this.loadProjectData()
      } catch (error) {
        console.error('處理報告刪除失敗:', error)
        this.$message.error('處理報告刪除失敗')
      }
    },

    // 獲取當前用戶所屬群組
    getCurrentUserGroup() {
      if (!this.projectData?.userGroups || !this.user?.userEmail) return null
      
      return this.projectData.userGroups.find(ug => 
        ug.userEmail === this.user.userEmail && ug.isActive
      )
    },

    async openVoteResultModal(stage) {
      try {
        this.currentModalStageId = stage.id
        this.loadingVoteData = true
        
        // 載入投票數據，包括提案者信息
        await this.loadVoteResultData(stage)
        
        this.showVoteResultModal = true
        console.log('開啟階段成果投票彈窗:', stage)
      } catch (error) {
        console.error('開啟投票彈窗失敗:', error)
        this.$message.error('開啟投票彈窗失敗')
      } finally {
        this.loadingVoteData = false
      }
    },
    
    async openTeacherVoteModal(stage) {
      try {
        this.currentModalStageId = stage.id
        this.loadingTeacherVoteData = true
        
        // 準備當前階段的群組資料
        this.currentModalStageGroups = stage.groups || []
        
        this.showTeacherVoteModal = true
        console.log('開啟教師投票彈窗:', stage)
      } catch (error) {
        console.error('開啟教師投票彈窗失敗:', error)
        this.$message.error('開啟教師投票彈窗失敗')
      } finally {
        this.loadingTeacherVoteData = false
      }
    },

    handleAnalysisCommand(command, stage) {
      if (stage.status === 'completed') {
        // 設定要顯示的階段資訊
        this.currentModalStageId = stage.id
        this.currentModalStageTitle = stage.title
        this.currentModalStageIsSettled = (stage.status === 'completed')
        
        // 根據選擇顯示對應的分析模態窗口
        if (command === 'report') {
          this.showVotingAnalysisModal = true
          console.log('開啟互評計票分析彈窗:', stage)
        } else if (command === 'comment') {
          this.showCommentVotingAnalysisModal = true
          console.log('開啟評論計票分析彈窗:', stage)
        }
      } else {
        this.$message.warning('只有已結算的階段才能顯示獎金分配結果')
      }
    },

    async loadVoteResultData(stage) {
      try {
        // 獲取階段排名提案數據
        const response = await this.$apiClient.getStageRankingProposals(this.projectId, stage.id)
        
        if (response.success && response.data && response.data.length > 0) {
          // 取最新的提案作為當前投票對象
          const latestProposal = response.data[0]
          
          this.currentModalVoteData = {
            proposer: latestProposal.proposerEmail || latestProposal.groupName || '匿名用戶',
            timeline: [], // 可以後續添加投票時間線數據
            rankings: []
          }
        } else {
          // 沒有提案時的默認狀態
          this.currentModalVoteData = {
            proposer: '暫無提案',
            timeline: [],
            rankings: []
          }
        }
      } catch (error) {
        console.error('載入投票數據失敗:', error)
        // 使用默認數據
        this.currentModalVoteData = {
          proposer: '載入失敗',
          timeline: [],
          rankings: []
        }
      }
    },
    
    async openSubmitReportModal(stage) {
      try {
        this.currentModalStageId = stage.id
        this.loadingReportGroupData = true
        
        // 在打開 drawer 之前重新載入專案核心資料以確保群組成員資料是最新的
        console.log('更新群組成員資料中...')
        const sessionId = localStorage.getItem('sessionId')
        if (sessionId) {
          const coreResponse = await this.$apiClient.getProjectCore(this.projectId)
          
          if (coreResponse.success && coreResponse.data) {
            console.log('API 返回的原始資料:', coreResponse.data)
            
            // 更新專案資料，特別是 groups 和 userGroups
            this.projectData = {
              ...this.projectData,
              groups: coreResponse.data.groups,
              userGroups: coreResponse.data.userGroups,
              projectGroups: coreResponse.data.projectGroups
            }
            
            console.log('更新後的 projectData:', {
              groupsCount: this.projectData.groups?.length,
              userGroupsCount: this.projectData.userGroups?.length,
              groups: this.projectData.groups,
              userGroups: this.projectData.userGroups
            })
            console.log('群組成員資料已更新')
          } else {
            console.warn('無法更新群組成員資料:', coreResponse.error)
            this.$message.warning('無法獲取最新群組資料，將使用現有資料')
          }
        }
        
        // 開啟 drawer
        this.showSubmitReportModal = true
        console.log('開啟發成果彈窗:', stage)
      } catch (error) {
        console.error('更新群組成員資料失敗:', error)
        this.$message.error('更新群組資料失敗，將使用現有資料')
        // 即使更新失敗也允許開啟 drawer，使用現有資料
        this.showSubmitReportModal = true
      } finally {
        this.loadingReportGroupData = false
      }
    },
    
    async openSubmitCommentModal(stage) {
      this.currentModalStageId = stage.id
      
      // 如果需要完整的專案分組資料和參與者資料，先載入再開啟彈窗
      this.loadingCommentGroupData = true
      try {
        // 更新群組成員資料 (和 openSubmitReportModal 使用相同的邏輯)
        const sessionId = localStorage.getItem('sessionId')
        if (sessionId) {
          const coreResponse = await this.$apiClient.getProjectCore(this.projectId)
          if (coreResponse.success && coreResponse.data) {
            // 更新專案數據以確保有最新的群組和成員資料，並計算群組成員數量
            const groupsWithMemberCount = (coreResponse.data.groups || []).map(group => {
              const memberCount = (coreResponse.data.userGroups || []).filter(ug => 
                ug.groupId === group.groupId && ug.isActive
              ).length
              return {
                ...group,
                memberCount
              }
            })
            
            // 載入階段submissions以過濾有效群組
            let groupsWithSubmissions = []
            try {
              const submissionsResponse = await this.$apiClient.getStageSubmissions(this.projectId, stage.id)
              if (submissionsResponse.success && submissionsResponse.data) {
                // 獲取有提交有效成果的群組ID列表
                const submittedGroupIds = submissionsResponse.data
                  .filter(submission => submission.status === 'submitted')
                  .map(submission => submission.groupId)
                
                // 只保留有提交成果的群組
                groupsWithSubmissions = groupsWithMemberCount.filter(group => 
                  submittedGroupIds.includes(group.groupId)
                )
                console.log('評論彈窗：過濾後的有效群組數量:', groupsWithSubmissions.length)
              } else {
                console.warn('無法獲取階段submissions，將使用所有群組')
                groupsWithSubmissions = groupsWithMemberCount
              }
            } catch (submissionError) {
              console.error('載入submissions失敗:', submissionError)
              groupsWithSubmissions = groupsWithMemberCount
            }
            
            this.projectData = {
              ...this.projectData,
              groups: groupsWithSubmissions, // 使用過濾後的群組
              userGroups: coreResponse.data.userGroups,
              users: coreResponse.data.users || []
            }
            console.log('評論彈窗：群組和成員資料已更新（僅包含有提交成果的群組）')
          } else {
            console.warn('無法更新群組資料:', coreResponse.error)
            this.$message.warning('無法獲取最新群組資料，將使用現有資料')
          }
        }
        
        // 開啟彈窗
        this.showSubmitCommentModal = true
        console.log('開啟發評論彈窗:', stage)
      } catch (error) {
        console.error('更新群組資料失敗:', error)
        this.$message.error('更新群組資料失敗，將使用現有資料')
        // 即使更新失敗也允許開啟彈窗，使用現有資料
        this.showSubmitCommentModal = true
      } finally {
        this.loadingCommentGroupData = false
      }
    },
    
    openCommentVoteModal(stage) {
      this.currentModalStageId = stage.id
      this.showCommentVoteModal = true
      console.log('開啟評論投票彈窗:', stage)
    },
    
    // 彈窗提交處理方法
    async handleReportSubmit(data) {
      console.log('成果提交:', data)
      
      if (data.success) {
        // 報告提交成功，刷新當前階段的提交列表
        this.$showSuccess('報告已成功提交！')
        
        // 找到當前階段並刷新報告內容
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          // 強制重新載入階段報告內容
          currentStage.contentLoaded = false
          await this.refreshStageReports(currentStage)
        }
      }
    },
    
    async handleCommentSubmit(data) {
      console.log('評論提交:', data)
      
      if (data.success) {
        // 找到對應的階段並切換到查看評論模式
        const targetStage = this.stages.find(stage => stage.id === this.currentModalStageId)
        if (targetStage) {
          console.log('找到目標階段，切換到查看評論模式:', targetStage.title)
          targetStage.viewMode = true // 切換到查看評論狀態
          
          // 確保該階段的評論區域會被重新渲染
          this.$forceUpdate()
          
          // 評論提交成功，使用統一的刷新方法重整評論
          this.$nextTick(async () => {
            await this.refreshStageComments(targetStage)
            console.log('已重新整理評論區域')
          })
          
          // 顯示成功消息
          this.$message.success('評論提交成功！已切換到查看評論模式')
        } else {
          console.warn('未找到目標階段:', this.currentModalStageId)
          this.$message.error('無法找到目標階段')
        }
      }
    },
    
    async handleCommentVoteSubmit(data) {
      console.log('評論投票提交:', data)
      
      if (data.success) {
        this.$showSuccess('評論投票已成功提交！')
        // 評論投票成功後刷新評論排名
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          await this.refreshStageComments(currentStage)
        }
      }
    },
    
    async handleVoteSubmit(data) {
      console.log('報告投票提交:', data)
      
      if (data.success) {
        this.$showSuccess('投票已成功提交！')
        
        // 刷新當前階段的資料以顯示更新的投票結果
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          await this.refreshStageContent(currentStage)
        }
      }
    },

    // 開啟教師排名彈窗
    openTeacherRankingModal(stage) {
      this.currentModalStageId = stage.id
      this.currentModalStageTitle = stage.title
      this.currentModalStageGroups = stage.groups || []
      this.showTeacherRankingModal = true
    },

    // 處理教師排名提交
    async handleTeacherRankingSubmit(data) {
      console.log('教師排名提交:', data)
      
      if (data.success) {
        this.$showSuccess('教師排名已成功提交！')
        // 重新載入階段資料以反映更新
        await this.loadStageData()
      }
    },
    
    // 處理教師投票提交
    async handleTeacherVoteSubmit(data) {
      console.log('教師投票提交:', data)
      
      if (data.success) {
        this.$message.success('教師投票已成功提交！')
        // 刷新當前階段的資料和評論排名
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          await this.refreshStageContent(currentStage)
          await this.refreshStageComments(currentStage)
        }
      }
    },
    
    async handleResubmitRanking(data) {
      console.log('重新提交排名:', data)
      
      if (data.success) {
        this.$showSuccess('新排名已成功提交！')
        
        // 刷新當前階段的資料以顯示更新的排名結果
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          await this.refreshStageContent(currentStage)
        }
      }
    },

    handleReplyComment(commentData) {
      console.log('回復評論:', commentData)
      this.currentReplyComment = {
        commentId: commentData.commentId,
        authorName: commentData.authorName,
        content: '', // 需要從API獲取完整內容
        mentionedGroups: commentData.mentionedGroups,
        mentionedUsers: commentData.mentionedUsers
      }
      
      // 找到對應的階段ID
      this.currentModalStageId = this.findStageIdFromCommentClick()
      this.showReplyCommentModal = true
    },

    async handleReplySubmitted(data) {
      console.log('回復已提交:', data)
      
      if (data.success) {
        // 1. 關閉回復drawer（雙重保險）
        this.showReplyCommentModal = false
        
        // 2. 顯示成功消息
        this.$message.success('回覆已發送')
        
        // 3. 找到當前階段並切換到評論模式
        const currentStage = this.stages.find(s => s.id === this.currentModalStageId)
        if (currentStage) {
          // 4. 確保階段處於評論模式
          if (!currentStage.viewMode) {
            await this.toggleStageViewMode(currentStage, true)
          }
          
          // 5. 刷新當前階段的評論
          await this.refreshStageComments(currentStage)
          
          // 6. 滾動到該階段確保用戶能看到更新的評論
          this.$nextTick(() => {
            const stageElement = document.getElementById(`stage-${currentStage.id}`)
            if (stageElement) {
              stageElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
              })
            }
          })
        }
      } else {
        // 如果提交失敗，顯示錯誤但不關閉drawer
        this.$message.error('回覆提交失敗')
      }
    },

    findStageIdFromCommentClick() {
      // 從當前可見的階段中查找
      for (const stage of this.stages) {
        if (stage.viewMode) {
          return stage.id
        }
      }
      return this.stages[0]?.id || null
    },
    
    backToDashboard() {
      this.$emit('back')
    },
    
    handleNavigation(page) {
      this.$emit('navigate', page)
    },
    
    // API調用方法 - 使用新的分離式架構
    async loadProjectData() {
      this.loading = true
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('No session found')
          return
        }
        
        // 首先載入核心專案數據（專案資訊 + 階段結構）
        const coreResponse = await this.$apiClient.getProjectCore(this.projectId)
        
        if (coreResponse.success && coreResponse.data) {
          this.projectData = coreResponse.data
          this.projectTitle = coreResponse.data.project?.projectName || coreResponse.data.project?.title || ''
          this.stages = this.processStagesData(coreResponse.data.stages || [])
          
          // 設置當前階段ID並滾動到最早的執行中階段
          if (this.stages.length > 0) {
            const earliestActiveStage = this.findEarliestActiveStage()
            if (earliestActiveStage) {
              this.currentStageId = earliestActiveStage.id
              // 延遲滾動確保DOM已渲染
              this.$nextTick(() => {
                setTimeout(() => {
                  this.scrollToStage(earliestActiveStage.id)
                }, 300)
              })
            } else {
              // 如果沒有活躍階段，使用第一個階段
              this.currentStageId = this.stages[0].id
            }
            
            // 自動載入所有階段的報告內容
            this.loadAllStageReports()
          }
        } else {
          console.error('Failed to load project core data:', coreResponse.error)
        }
      } catch (error) {
        console.error('Error loading project data:', error)
      } finally {
        this.loading = false
      }
    },
    
    // 按需載入階段內容數據（報告 + 評論）
    async loadStageContent(stageId, contentType = 'all') {
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('❌ loadStageContent: 沒有 sessionId')
          return null
        }
        
        console.log(`📡 調用 API: getProjectContent(${this.projectId}, ${stageId}, ${contentType})`)
        
        const response = await this.$apiClient.getProjectContent(
          this.projectId,
          stageId,
          contentType
        )
        
        console.log(`📡 API 響應:`, response)
        
        if (response.success && response.data) {
          console.log(`✅ 載入成功:`, response.data)
          
          // 詳細檢查submissions中的排名數據
          if (response.data.submissions) {
            console.log(`🔍 [ProjectDetail] 階段 ${stageId} 的submissions排名數據分析:`)
            response.data.submissions.forEach((submission, index) => {
              console.log(`  📋 Submission ${index + 1}:`, {
                submissionId: submission.submissionId,
                groupId: submission.groupId,
                groupName: submission.groupName,
                voteRank: submission.voteRank,
                teacherRank: submission.teacherRank,
                settlementRank: submission.settlementRank,
                status: submission.status
              })
            })
          }
          
          return response.data
        } else {
          console.error('❌ 載入階段內容失敗:', response.error)
          return null
        }
      } catch (error) {
        console.error('❌ 載入階段內容異常:', error)
        return null
      }
    },
    
    // 處理階段數據，為前端添加必要的字段
    processStagesData(stages) {
      return stages
        .filter(stage => stage.status !== 'archived') // Filter out archived stages from user view
        .map(stage => {
          const processedStage = {
            id: stage.stageId,
            title: stage.stageName || stage.stageTitle || stage.title,
            description: stage.description || '',
            reportReward: stage.reportRewardPool || stage.reportReward || 0,
            commentReward: stage.commentRewardPool || stage.commentReward || 0,
            deadline: stage.endDate || stage.deadline,
            startDate: stage.startDate,
            endDate: stage.endDate,
            status: calculateStageStatus(stage), // 使用統一的狀態判斷
            viewMode: false, // false = 查看報告, true = 查看評論
            groups: [], // 將按需載入
            contentLoaded: false,
            showFullDescription: false, // 控制是否顯示完整描述
            // 新增載入狀態
            loadingReports: false,
            loadingComments: false,
            refreshing: false
          }
          return processedStage
        })
    },
    
    // 當用戶切換到某階段的報告模式時載入內容
    async ensureStageContentLoaded(stage) {
      if (stage.contentLoaded) return
      
      const content = await this.loadStageContent(stage.id, 'submissions')
      if (content && content.submissions) {
        // 處理報告數據並添加到階段
        stage.groups = this.processSubmissionsToGroups(content.submissions)
        stage.contentLoaded = true
      }
    },
    
    // 將提交數據轉換為前端需要的組別格式
    processSubmissionsToGroups(submissions) {
      if (!submissions || !Array.isArray(submissions)) {
        console.log('❌ processSubmissionsToGroups: 無效的 submissions 數據', submissions)
        return []
      }
      
      console.log('🔄 處理 submissions 數據:', submissions)
      
      // 按groupId分組報告
      const groupMap = new Map()
      
      submissions.forEach((submission, index) => {
        console.log(`🔄 處理第 ${index + 1} 個 submission:`, submission)
        
        // 過濾掉withdrawn狀態的提交
        if (submission.status === 'withdrawn') {
          console.log(`⏭️ 跳過已撤回的 submission:`, submission.submissionId)
          return
        }
        
        // 移除 type 檢查，因為後端數據沒有 type 字段
        const groupId = submission.groupId
        if (groupId && !groupMap.has(groupId)) {
          // 從專案數據中獲取群組資訊
          const groupInfo = this.getGroupInfo(groupId)
          
          const groupData = {
            id: groupId,
            groupId: groupId,
            memberNames: groupInfo.memberNames || [],
            submissionStatus: this.getSubmissionStatus(submission),
            reportContent: submission.contentMarkdown || submission.content || '',
            showReport: false,
            settlementRank: submission.settlementRank || '-',
            voteRank: submission.voteRank || '-', 
            teacherRank: submission.teacherRank || '-',
            submissionId: submission.submissionId,
            submittedAt: submission.submitTime || submission.submittedAt || 0,
            submitTime: submission.submitTime || submission.submittedAt || 0,
            rankingsLoading: !submission.voteRank && !submission.teacherRank // 如果沒有排名數據就顯示載入
          }
          
          console.log(`✅ 創建群組數據:`, groupData)
          console.log(`🔍 [ProjectDetail] 組別 ${groupInfo.groupName || groupId} 排名數據詳情:`, {
            voteRank: submission.voteRank,
            teacherRank: submission.teacherRank,
            settlementRank: submission.settlementRank,
            原始submission數據: {
              submissionId: submission.submissionId,
              groupId: submission.groupId,
              status: submission.status
            }
          })
          groupMap.set(groupId, groupData)
        }
      })
      
      const result = Array.from(groupMap.values())
        .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      
      console.log('✅ processSubmissionsToGroups 結果:', result)
      return result
    },
    
    // 從專案數據中獲取群組資訊
    getGroupInfo(groupId) {
      if (!this.projectData || !this.projectData.groups || !this.projectData.userGroups) {
        console.warn('⚠️ getGroupInfo: 缺少專案數據', { projectData: this.projectData })
        return { memberNames: [] }
      }
      
      // 找到群組資訊
      const group = this.projectData.groups.find(g => g.groupId === groupId)
      if (!group) {
        console.warn('⚠️ getGroupInfo: 找不到群組', { groupId, availableGroups: this.projectData.groups.map(g => g.groupId) })
        return { memberNames: [] }
      }
      
      // 找到群組成員
      const members = this.projectData.userGroups
        .filter(ug => ug.groupId === groupId && ug.isActive)
        .map(ug => {
          // 從 users 資料中找到對應的使用者，取得 displayName
          const user = this.projectData.users?.find(u => u.userEmail === ug.userEmail)
          return user?.displayName || user?.username || ug.userEmail.split('@')[0]
        })
      
      console.log(`ℹ️ 群組 ${groupId} 成員:`, members)
      
      return {
        memberNames: members,
        groupName: group.groupName || group.name
      }
    },
    
    // 判斷提交狀態
    getSubmissionStatus(submission) {
      const submittedTime = submission.submitTime || submission.submittedAt
      if (!submittedTime) {
        return { type: 'not-submitted', text: '未提交' }
      }
      
      const submittedDate = new Date(submittedTime)
      const deadline = new Date(submission.deadline || Date.now())
      
      if (submittedDate <= deadline) {
        const timeDiff = deadline.getTime() - submittedDate.getTime()
        const hoursDiff = timeDiff / (1000 * 60 * 60)
        
        if (hoursDiff > 24) {
          return { type: 'early', text: '提前提交' }
        } else {
          return { type: 'on-time', text: '準時提交' }
        }
      } else {
        return { type: 'late', text: '遲交' }
      }
    },
    
    // 載入所有階段的報告內容
    async loadAllStageReports() {
      console.log('開始載入所有階段的報告內容...', this.stages.map(s => ({ id: s.id, title: s.title })))
      
      // 並行載入所有階段的報告
      const loadPromises = this.stages.map(async (stage) => {
        try {
          // 設置載入狀態
          stage.loadingReports = true
          console.log(`開始載入階段 ${stage.title} (ID: ${stage.id}) 的報告...`)
          
          const content = await this.loadStageContent(stage.id, 'submissions')
          console.log(`階段 ${stage.title} API 響應:`, content)
          
          if (content && content.submissions) {
            stage.groups = this.processSubmissionsToGroups(content.submissions)
            
            // 載入排名數據
            await this.loadStageRankings(stage)
            
            stage.contentLoaded = true
            console.log(`✅ 階段 ${stage.title} 的報告已載入，共 ${stage.groups.length} 個群組:`, stage.groups)
          } else {
            console.log(`⚠️ 階段 ${stage.title} 沒有報告內容，API 響應:`, content)
            stage.groups = []
            stage.contentLoaded = true
          }
        } catch (error) {
          console.error(`❌ 載入階段 ${stage.title} 報告失敗:`, error)
          stage.groups = []
          stage.contentLoaded = true
        } finally {
          // 清除載入狀態  
          stage.loadingReports = false
          console.log(`階段 ${stage.title} 載入狀態已清除，loadingReports: ${stage.loadingReports}`)
        }
      })
      
      await Promise.all(loadPromises)
      console.log('🎉 所有階段報告載入完成，最終狀態:', this.stages.map(s => ({ 
        title: s.title, 
        groupsCount: s.groups?.length || 0, 
        loadingReports: s.loadingReports, 
        contentLoaded: s.contentLoaded 
      })))
    },
    
    // 共識警告顯示邏輯
    shouldShowConsensusWarning(stage) {
      // 檢查是否需要顯示共識警告
      // 例如：投票階段且投票結果未達成共識
      return stage.status === 'voting' && this.hasConsensusIssue(stage)
    },

    hasConsensusIssue(stage) {
      // 檢查階段是否存在共識問題
      // 可以根據投票結果、參與度等判斷
      if (!stage.groups || stage.groups.length === 0) {
        return false
      }
      
      // 示例邏輯：檢查是否有足夠的投票參與
      const totalGroups = stage.groups.length
      const groupsWithVotes = stage.groups.filter(group => group.voteRank && group.voteRank !== '-').length
      const participationRate = groupsWithVotes / totalGroups
      
      // 如果參與率低於70%，顯示警告
      return participationRate < 0.7
    },

    getConsensusWarningTitle(stage) {
      // 根據共識問題類型返回不同的警告標題
      if (stage.status === 'voting') {
        const totalGroups = stage.groups?.length || 0
        const groupsWithVotes = stage.groups?.filter(group => group.voteRank && group.voteRank !== '-').length || 0
        const participationRate = totalGroups > 0 ? groupsWithVotes / totalGroups : 0
        
        if (participationRate < 0.5) {
          return '投票參與度過低'
        } else if (participationRate < 0.7) {
          return '投票參與度不足'
        }
      }
      
      return '共識警告'
    },

    getConsensusWarningDescription(stage) {
      // 根據共識問題提供詳細描述
      if (stage.status === 'voting') {
        const totalGroups = stage.groups?.length || 0
        const groupsWithVotes = stage.groups?.filter(group => group.voteRank && group.voteRank !== '-').length || 0
        const participationRate = totalGroups > 0 ? groupsWithVotes / totalGroups : 0
        
        if (participationRate < 0.5) {
          return `目前只有 ${groupsWithVotes}/${totalGroups} 組參與投票（${Math.round(participationRate * 100)}%），建議提醒其他組別盡快完成投票以確保結果的代表性。`
        } else if (participationRate < 0.7) {
          return `目前有 ${groupsWithVotes}/${totalGroups} 組已參與投票（${Math.round(participationRate * 100)}%），還需要更多組別參與以達成更好的共識。`
        }
      }
      
      return '請注意此階段可能存在共識問題，建議檢查相關數據。'
    },

    // 移除重複的apiCall方法，統一使用$apiClient

    // 共識警告相關方法
    shouldShowConsensusWarning(stage) {
      // 只在 active 階段顯示分工投票共識警告
      // stage.status 已經是 calculateStageStatus() 的動態計算結果
      if (stage.status !== 'active') {
        return false
      }
      
      // 只在有提交的階段顯示警告
      if (!this.hasCurrentGroupSubmitted(stage)) {
        return false
      }
      
      const groupData = this.getCurrentGroupData(stage)
      if (!groupData || !groupData.submissionId) {
        return false
      }

      // 如果還沒有投票資料，先嘗試載入（簡單檢查）
      if (!groupData.votingData) {
        // 異步載入投票資料
        this.loadGroupVotingData(stage, groupData)
        return true // 暫時顯示警告，等資料載入完成
      }

      // 檢查共識狀態
      try {
        const submissionData = groupData.submission || groupData
        const participationProposal = typeof submissionData.participationProposal === 'string' 
          ? JSON.parse(submissionData.participationProposal) 
          : submissionData.participationProposal || {}

        const proposedParticipants = Object.keys(participationProposal).filter(email => 
          participationProposal[email] > 0
        )
        
        const agreeVotes = groupData.votingData.agreeVotes || 0
        const totalParticipants = proposedParticipants.length
        
        // 調試信息
        console.log('共識警告檢查:', {
          stageId: stage.id,
          stageStatus: stage.status,
          agreeVotes,
          totalParticipants,
          shouldShow: agreeVotes !== totalParticipants
        })
        
        return agreeVotes !== totalParticipants // 沒有全部同意就顯示警告
      } catch (e) {
        console.warn('解析參與度提案失敗:', e)
        return true // 解析錯誤就顯示警告
      }
    },

    async hasGroupConsensusIssue(stage) {
      const groupData = this.getCurrentGroupData(stage)
      if (!groupData || !groupData.submissionId) {
        return false // 沒有提交就不需要警告
      }

      // 載入投票狀態
      if (!groupData.votingData) {
        await this.loadGroupVotingData(stage, groupData)
      }

      const votingData = groupData.votingData
      if (!votingData) {
        return true // 載入失敗就是有問題
      }

      // 解析參與度提案
      let participationProposal = {}
      try {
        const submissionData = groupData.submission || groupData
        participationProposal = typeof submissionData.participationProposal === 'string' 
          ? JSON.parse(submissionData.participationProposal) 
          : submissionData.participationProposal || {}
      } catch (e) {
        return true // 無法解析就是有問題
      }

      const proposedParticipants = Object.keys(participationProposal).filter(email => 
        participationProposal[email] > 0
      )
      
      // 檢查是否所有參與者都投了同意票
      const agreeVotes = votingData.agreeVotes || 0
      const totalParticipants = proposedParticipants.length
      
      return agreeVotes !== totalParticipants // 沒有全部同意就是有共識問題
    },

    getConsensusWarningTitle(stage) {
      // 只在 active 階段處理分工投票標題
      if (stage.status !== 'active') {
        return '狀態異常'
      }
      
      const groupData = this.getCurrentGroupData(stage)
      if (!groupData?.votingData) {
        return '尚未開始投票確認'
      }

      const votingData = groupData.votingData
      const agreeVotes = votingData.agreeVotes || 0
      const totalVotes = votingData.totalVotes || 0
      
      if (totalVotes === 0) {
        return '貴組尚未取得點數分配共識'
      } else if (agreeVotes === 0) {
        return '投票中：尚無同意票'
      } else {
        return '投票中：共識尚未達成'
      }
    },

    getConsensusWarningDescription(stage) {
      // 只在 active 階段處理分工投票描述
      if (stage.status !== 'active') {
        return '此警告僅在階段進行中顯示'
      }
      
      const groupData = this.getCurrentGroupData(stage)
      if (!groupData?.submissionId) {
        return '請先提交本階段報告'
      }

      const votingData = groupData.votingData
      if (!votingData) {
        return '投票資料載入中...'
      }

      // 解析參與度提案
      let participationProposal = {}
      let totalParticipants = 0
      
      try {
        const submissionData = groupData.submission || groupData
        participationProposal = typeof submissionData.participationProposal === 'string' 
          ? JSON.parse(submissionData.participationProposal) 
          : submissionData.participationProposal || {}
        
        const proposedParticipants = Object.keys(participationProposal).filter(email => 
          participationProposal[email] > 0
        )
        totalParticipants = proposedParticipants.length
      } catch (e) {
        return '參與度提案格式錯誤，請重新提交報告'
      }

      // 如果從參與度提案無法獲取總人數，嘗試從其他來源
      if (totalParticipants === 0) {
        // 嘗試從投票資料獲取總成員數
        totalParticipants = votingData.totalMembers || 0
        
        // 如果還是0，嘗試從群組資料獲取
        if (totalParticipants === 0 && groupData.memberNames) {
          totalParticipants = groupData.memberNames.length
        }
        
        // 如果還是0，從項目用戶群組資料計算該組人數
        if (totalParticipants === 0 && this.projectData?.userGroups) {
          const groupMembers = this.projectData.userGroups.filter(ug => 
            ug.groupId === groupData.groupId && ug.isActive
          )
          totalParticipants = groupMembers.length
        }
        
        // 最後的fallback
        if (totalParticipants === 0) {
          return '無法獲取群組成員資料，請重新載入頁面'
        }
      }
      
      const agreeVotes = votingData.agreeVotes || 0
      const totalVotes = votingData.totalVotes || 0
      
      // 調試信息
      console.log('共識警告描述:', {
        stageId: stage.id,
        stageStatus: stage.status,
        agreeVotes,
        totalVotes,
        totalParticipants
      })
      
      if (totalVotes === 0) {
        return `截止前無共識，將沒收全部點數。需要全組 ${totalParticipants} 人都投同意票才能獲得獎勵。`
      } else {
        const remaining = Math.max(0, totalParticipants - agreeVotes)
        return `目前同意票：${agreeVotes}/${totalParticipants}，還需要 ${remaining} 票同意。截止前無全體共識，將沒收全部點數。`
      }
    },

    getCurrentGroupData(stage) {
      if (!stage.groups || !this.projectData?.userGroups) {
        return null
      }
      
      // 找到當前用戶所屬的群組
      const userGroup = this.projectData.userGroups.find(ug => 
        ug.userEmail === this.user?.userEmail && ug.isActive
      )
      
      if (!userGroup) {
        return null
      }
      
      // 找到該群組在此階段的資料
      const groupStageData = stage.groups.find(g => g.groupId === userGroup.groupId)
      return groupStageData || null
    },

    async loadGroupVotingData(stage, groupData) {
      if (!groupData.submissionId) {
        return
      }

      try {
        const response = await this.$apiClient.getGroupSubmissionApprovalVotes(
          this.projectId,
          stage.id,
          groupData.submissionId
        )

        if (response.success) {
          // 將投票資料存儲到groupData中
          groupData.votingData = response.data
        } else {
          console.error('載入投票資料失敗:', response.error)
        }
      } catch (error) {
        console.error('載入投票資料失敗:', error)
      }
    },
    
    // 載入階段排名數據
    async loadStageRankings(stage) {
      try {
        console.log(`📊 [ProjectDetail] 開始載入階段 ${stage.title} 的排名數據`)
        
        // 設置所有組別的載入狀態
        if (stage.groups && stage.groups.length > 0) {
          stage.groups.forEach(group => {
            if ((group.voteRank === '-' || !group.voteRank) && (group.teacherRank === '-' || !group.teacherRank)) {
              group.rankingsLoading = true
            }
          })
        }
        
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('❌ loadStageRankings: 沒有 sessionId')
          return
        }
        
        console.log(`📊 [ProjectDetail] 調用排名API: /rankings/stage-rankings`, {
          projectId: this.projectId,
          stageId: stage.id
        })
        
        const response = await this.$apiClient.callWithAuth('/rankings/stage-rankings', {
          projectId: this.projectId,
          stageId: stage.id
        })
        
        console.log(`📊 [ProjectDetail] 排名API完整回應:`, response)
        
        if (response.success && response.data && response.data.rankings) {
          const rankings = response.data.rankings
          console.log(`📊 [ProjectDetail] 階段 ${stage.title} 排名數據:`, rankings)
          
          // 更新 stage.groups 中的排名資訊
          if (stage.groups && stage.groups.length > 0) {
            stage.groups.forEach(group => {
              const groupRankings = rankings[group.groupId]
              if (groupRankings) {
                if (groupRankings.voteRank) {
                  group.voteRank = groupRankings.voteRank
                }
                if (groupRankings.teacherRank) {
                  group.teacherRank = groupRankings.teacherRank
                }
                
                console.log(`📊 [ProjectDetail] 更新組別 ${group.groupId} 排名:`, {
                  voteRank: group.voteRank,
                  teacherRank: group.teacherRank
                })
              }
              
              // 完成載入，清除載入狀態
              group.rankingsLoading = false
            })
          }
          
          console.log(`✅ 階段 ${stage.title} 排名數據載入完成`)
        } else {
          console.log(`⚠️ 階段 ${stage.title} 沒有排名數據:`, response)
          // 沒有數據時也要清除載入狀態
          if (stage.groups && stage.groups.length > 0) {
            stage.groups.forEach(group => {
              group.rankingsLoading = false
            })
          }
        }
      } catch (error) {
        console.error(`❌ 載入階段 ${stage.title} 排名數據失敗:`, error)
        // 錯誤時也要清除載入狀態
        if (stage.groups && stage.groups.length > 0) {
          stage.groups.forEach(group => {
            group.rankingsLoading = false
          })
        }
      }
      
      // 載入結算排名數據 (如果階段已結算)
      if (stage.status === 'completed') {
        try {
          console.log(`📊 [ProjectDetail] 調用結算排名API: /scoring/settlement/stage-rankings`)
          
          const settlementResponse = await this.$apiClient.callWithAuth('/scoring/settlement/stage-rankings', {
            projectId: this.projectId,
            stageId: stage.id
          })
          
          console.log(`📊 [ProjectDetail] 結算排名API回應:`, settlementResponse)
          
          if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
            const settlementRankings = settlementResponse.data.rankings
            console.log(`📊 [ProjectDetail] 階段 ${stage.title} 結算排名數據:`, settlementRankings)
            
            // 更新結算排名
            if (stage.groups && stage.groups.length > 0) {
              stage.groups.forEach(group => {
                const settlementData = settlementRankings[group.groupId]
                if (settlementData) {
                  group.settlementRank = settlementData.finalRank
                  console.log(`📊 [ProjectDetail] 更新組別 ${group.groupId} 結算排名: ${settlementData.finalRank}`)
                }
              })
            }
            
            console.log(`✅ 階段 ${stage.title} 結算排名數據載入完成`)
          } else {
            console.log(`⚠️ 階段 ${stage.title} 尚未結算或無結算排名數據:`, settlementResponse)
          }
        } catch (settlementError) {
          console.error(`❌ 載入階段 ${stage.title} 結算排名失敗:`, settlementError)
        }
      }
    }
  },
  async mounted() {
    // Debug user permissions
    console.log('ProjectDetail mounted - User object:', {
      user: this.user?.userEmail,
      permissions: this.user?.permissions,
      isGlobalPM: this.isGlobalPM
    })
    
    console.log('ProjectDetail mounted successfully')
    await this.loadProjectData()
  }
}
</script>

<style scoped>
.dashboard {
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
  flex-shrink: 0; /* 確保 top-bar 不會被壓縮 */
}

.page-title h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
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
}

/* 階段狀態樣式 */
.stage-section.stage-pending,
.stage-section.stage-completed {
  opacity: 0.7;
}

.stage-status-badge {
  width: 100%;
  padding: 8px 16px;
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  margin: 0;
  border-radius: 8px 8px 0 0;
}

.stage-status-badge.status-pending {
  background: #ffc107;
  color: white;
}

.stage-status-badge.status-active {
  background: #28a745;
  color: white;
}

.stage-status-badge.status-voting {
  background: #dc3545;
  color: white;
}

.stage-status-badge.status-completed {
  background: #6c757d;
  color: white;
}

.stage-header {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.stage-title {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 8px;
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

.stage-actions {
  display: flex;
  gap: 10px;
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

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.3s;
}

.btn-outline {
  background: #fff;
  color: #666;
  border: 1px solid #ddd;
}

.btn-outline:hover {
  background: #f8f9fa;
  border-color: #999;
}

.btn-primary {
  background: #e74c3c;
  color: #fff;
}

.btn-primary:hover {
  background: #c0392b;
}

.btn-secondary {
  background: #3498db;
  color: #fff;
}

.btn-secondary:hover {
  background: #2980b9;
}

.btn-tertiary {
  background: #f39c12;
  color: #fff;
}

.btn-tertiary:hover {
  background: #e67e22;
}

.btn-quaternary {
  background: #9b59b6;
  color: #fff;
}

.btn-quaternary:hover {
  background: #8e44ad;
}

.btn-dark {
  background: #2c3e50;
  color: #fff;
}

.btn-dark:hover {
  background: #34495e;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.stage-details {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  display: flex;
  align-items: center;
  gap: 30px;
  flex-wrap: wrap;
  /* 確保不會限制高度 */
  overflow: visible;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

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

.stage-actions-inline {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.groups-section {
  padding: 0;
  /* 確保內容可以完全展開 */
  overflow: visible;
  position: relative;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  gap: 25px;
}

.group-item:last-child {
  border-bottom: none;
}

.group-stats {
  display: flex;
  gap: 25px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.stat-label {
  font-size: 12px;
  color: #7f8c8d;
  margin-bottom: 4px;
  text-align: center;
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  background: #2c3e50;
  width: 50px;
  height: 50px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-names {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  min-width: 200px;
}

.member-display {
  cursor: help;
}

.submission-time {
  font-size: 14px;
  color: #7f8c8d;
  margin-left: 8px;
}

.current-group-tag {
  margin-left: 8px;
}

.report-members {
  font-size: 12px;
  color: #111;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid #eee;
}

.submission-status {
  margin-right: 15px;
}

.status-indicator {
  padding: 6px 12px;
  border-radius: 15px;
  font-size: 13px;
  font-weight: 500;
}

.status-indicator.early {
  background: #d4edda;
  color: #155724;
}

.status-indicator.early::before {
  content: "● ";
  color: #28a745;
}

.status-indicator.late {
  background: #f8d7da;
  color: #721c24;
}

.status-indicator.late::before {
  content: "● ";
  color: #dc3545;
}

.status-indicator.on-time {
  background: #cce7ff;
  color: #004085;
}

.status-indicator.on-time::before {
  content: "● ";
  color: #0066cc;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.group-report-content {
  border-top: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.stage-comments-section {
  border-top: 1px solid #e1e8ed;
}

.btn.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
}

.group-report-content {
  padding: 20px 25px;
  background: #f8f9fa;
  border-top: 1px solid #e1e8ed;
  margin: 0;
  /* 確保報告內容可以完全展開 */
  overflow: visible;
  word-wrap: break-word;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .content-area {
    padding: 15px;
  }

  .stage-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .stage-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .stage-actions-inline {
    margin-left: 0;
    width: 100%;
  }

  .group-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .group-stats {
    width: 100%;
    justify-content: space-between;
  }
}
</style>