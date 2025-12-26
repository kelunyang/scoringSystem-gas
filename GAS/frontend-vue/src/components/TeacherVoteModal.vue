<template>
  <div class="teacher-vote-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop v-loading="loading" element-loading-text="載入投票資料中...">
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">教師綜合投票</h2>
        <button class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Breadcrumb導航 -->
      <div class="breadcrumb-section">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>{{ projectTitle || '專案' }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ stageTitle || `階段${stageId}` }}</el-breadcrumb-item>
          <el-breadcrumb-item>教師綜合投票</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      
      <!-- 頂部說明 -->
      <div class="info-banner">
        <i class="fas fa-chalkboard-teacher"></i>
        具有教師權限者可以為本階段的<strong>所有有效成果</strong>和評論進行綜合排名。您的評分將直接作為階段結算的依據，不需要其他人的確認。
      </div>
      
      <!-- Tab 切換 -->
      <el-tabs v-model="activeTab" class="vote-tabs">
        
        <!-- 成果排名Tab -->
        <el-tab-pane label="成果排名" name="submissions">
          <!-- 投票狀態提醒 -->
          <el-alert
            v-if="submissionVoted"
            title="成果排名已投票"
            type="success"
            :closable="false"
            show-icon
            class="vote-status-alert"
          >
            <template #default>
              {{ teacherDisplayName || '您' }}已於 {{ formatTime(submissionVoteTime) }} 評分過本階段的成果。可以重新評分以更新排名。
            </template>
          </el-alert>
          
          <div class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-trophy"></i>
              各組成果排名
            </h3>
            
            <div class="ranking-list">
              <div 
                v-for="(group, index) in rankedSubmissions" 
                :key="group.groupId"
                class="ranking-item submission-item"
                draggable="true"
                @dragstart="handleSubmissionDragStart(index, $event)"
                @dragover="handleDragOver"
                @drop="handleSubmissionDrop(index, $event)"
                @dragend="handleSubmissionDragEnd"
                :class="{ 'is-dragging': draggedSubmissionIndex === index }"
              >
                <div class="rank-number">{{ index + 1 }}</div>
                <div class="group-info">
                  <div class="group-header">
                    <div class="group-name">{{ group.groupName }}</div>
                    <div class="submission-time" v-if="group.submitTime">
                      {{ formatSubmissionTime(group.submitTime) }}
                    </div>
                  </div>
                  <div class="group-members">{{ formatGroupMembers(group) }}</div>
                  <div class="submission-preview" v-if="group.reportContent">
                    {{ truncateContent(group.reportContent) }}
                  </div>
                </div>
                <!-- 排序控制按鈕 -->
                <div class="item-actions">
                  <el-button 
                    type="text"
                    size="small"
                    @click="moveSubmissionUp(index)"
                    :disabled="index === 0"
                    title="上移"
                  >
                    <i class="fas fa-chevron-up"></i>
                  </el-button>
                  <el-button 
                    type="text"
                    size="small"
                    @click="moveSubmissionDown(index)"
                    :disabled="index === rankedSubmissions.length - 1"
                    title="下移"
                  >
                    <i class="fas fa-chevron-down"></i>
                  </el-button>
                </div>
              </div>
            </div>
            
            <div class="ranking-hint" v-if="rankedSubmissions.length > 0">
              <i class="fas fa-lightbulb"></i>
              拖曳或使用箭頭按鈕調整排名順序
            </div>
            
            <div v-if="rankedSubmissions.length === 0" class="no-items">
              <i class="fas fa-clipboard-list"></i>
              目前沒有可排名的成果提交
            </div>
            
            <!-- 成果排名提交按鈕 -->
            <div class="section-submit-actions" v-if="rankedSubmissions.length > 0">
              <el-button 
                type="primary" 
                size="large" 
                @click="submitSubmissionRankings" 
                :loading="submittingSubmissions"
                :disabled="loading"
              >
                <i class="fas fa-trophy"></i>
                提交成果排名
              </el-button>
              <div class="submit-hint">
                只提交成果排名，不包括評論排名
              </div>
            </div>
          </div>
        </el-tab-pane>
        
        <!-- 評論排名Tab -->
        <el-tab-pane label="評論排名" name="comments">
          <!-- 投票狀態提醒 -->
          <el-alert
            v-if="commentVoted"
            title="評論排名已投票"
            type="success"
            :closable="false"
            show-icon
            class="vote-status-alert"
          >
            <template #default>
              {{ teacherDisplayName || '您' }}已於 {{ formatTime(commentVoteTime) }} 評分過本階段的評論。可以重新評分以更新排名。
            </template>
          </el-alert>
          
          <div class="vote-section">
            <h3 class="section-title">
              <i class="fas fa-comments"></i>
              評論品質排名
            </h3>
            
            <!-- 前三名限制說明 -->
            <el-alert
              title="只有前三名的評論會獲得點數獎勵，且每個用戶只能有一個評論在前三名。可以使用「移出排名」功能排除不適合的評論。"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom: 15px;"
            />
            
            <!-- 重複作者警告 -->
            <el-alert
              v-if="hasDuplicateAuthorsInTopThree"
              title="前三名中有重複的作者，請調整排名以確保每個用戶只有一個評論在前三名"
              type="error"
              :closable="false"
              show-icon
              style="margin-bottom: 15px;"
            />
            
            <div class="ranking-list">
              <div 
                v-for="(comment, index) in rankedComments" 
                :key="comment.commentId"
                class="ranking-item comment-item"
                draggable="true"
                @dragstart="handleCommentDragStart(index, $event)"
                @dragover="handleDragOver"
                @drop="handleCommentDrop(index, $event)"
                @dragend="handleCommentDragEnd"
                :class="{ 
                  'is-dragging': draggedCommentIndex === index,
                  'top-three': index < 3,
                  'duplicate-author-warning': index >= 3 && isAuthorInTopThree(comment)
                }"
              >
                <div class="rank-number" :class="{ 'top-rank': index < 3 }">
                  {{ index + 1 }}
                </div>
                <div class="comment-info">
                  <div class="comment-header">
                    <div class="comment-author">{{ comment.authorDisplayName || comment.authorEmail }}</div>
                    <div class="comment-time">{{ formatTime(comment.createdTime) }}</div>
                  </div>
                  <div class="comment-content">{{ comment.content }}</div>
                  <div class="comment-mentions" v-if="comment.mentionedGroups && Array.isArray(comment.mentionedGroups) && comment.mentionedGroups.length > 0">
                    <i class="fas fa-at"></i>
                    提及組別：{{ comment.mentionedGroups.join('、') }}
                  </div>
                  <!-- 重複作者警告 -->
                  <div v-if="index >= 3 && isAuthorInTopThree(comment)" class="duplicate-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    該用戶已有評論在前三名，此評論不會獲得點數
                  </div>
                </div>
                <!-- 排序控制按鈕 -->
                <div class="item-actions">
                  <el-button 
                    type="text"
                    size="small"
                    @click="moveCommentUp(index)"
                    :disabled="index === 0"
                    title="上移"
                  >
                    <i class="fas fa-chevron-up"></i>
                  </el-button>
                  <el-button 
                    type="text"
                    size="small"
                    @click="moveCommentDown(index)"
                    :disabled="index === rankedComments.length - 1"
                    title="下移"
                  >
                    <i class="fas fa-chevron-down"></i>
                  </el-button>
                  <el-button 
                    type="text"
                    size="small"
                    class="exclude-btn"
                    @click="excludeCommentFromRanking(index)"
                    title="移出排名"
                  >
                    <i class="fas fa-times"></i>
                  </el-button>
                </div>
                
                <!-- 前三名分割線 -->
                <div v-if="index === 2" class="top-three-divider">
                  <div class="divider-line"></div>
                  <div class="divider-text">以上為有效排名（獲得點數）</div>
                </div>
              </div>
            </div>
            
            <div class="ranking-hint" v-if="rankedComments.length > 0">
              <i class="fas fa-lightbulb"></i>
              拖曳或使用箭頭按鈕調整排名順序
            </div>
            
            <div v-if="rankedComments.length === 0 && excludedComments.length === 0" class="no-items">
              <i class="fas fa-comment-slash"></i>
              目前沒有可排名的評論
            </div>
            
            <div v-if="rankedComments.length === 0 && excludedComments.length > 0" class="no-items">
              <i class="fas fa-info-circle"></i>
              所有評論都已移出排名，請恢復一些評論進行排序
            </div>
            
            <!-- 被排除的評論區域 -->
            <div v-if="excludedComments.length > 0" class="excluded-section">
              <h4 class="excluded-title">
                <i class="fas fa-eye-slash"></i>
                已移出排名的評論 ({{ excludedComments.length }})
              </h4>
              <div class="excluded-list">
                <div 
                  v-for="(comment, index) in excludedComments" 
                  :key="comment.commentId"
                  class="excluded-item"
                >
                  <div class="comment-info">
                    <div class="comment-header">
                      <div class="comment-author">{{ comment.authorDisplayName || comment.authorEmail }}</div>
                      <div class="comment-time">{{ formatTime(comment.createdTime) }}</div>
                    </div>
                    <div class="comment-content">{{ comment.content }}</div>
                    <div class="comment-mentions" v-if="comment.mentionedGroups && Array.isArray(comment.mentionedGroups) && comment.mentionedGroups.length > 0">
                      <i class="fas fa-at"></i>
                      提及組別：{{ comment.mentionedGroups.join('、') }}
                    </div>
                  </div>
                  <div class="item-actions">
                    <el-button 
                      type="primary"
                      size="small"
                      @click="restoreCommentToRanking(index)"
                      title="恢復到排名"
                    >
                      <i class="fas fa-undo"></i>
                      恢復
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 評論排名提交按鈕 -->
            <div class="section-submit-actions" v-if="rankedComments.length > 0">
              <el-button 
                type="primary" 
                size="large" 
                @click="submitCommentRankings" 
                :loading="submittingComments"
                :disabled="loading || hasDuplicateAuthorsInTopThree"
              >
                <i class="fas fa-comments"></i>
                提交評論排名
              </el-button>
              <div class="submit-hint">
                <span v-if="hasDuplicateAuthorsInTopThree" class="error-hint">
                  <i class="fas fa-exclamation-triangle"></i>
                  請先解決前三名重複作者問題
                </span>
                <span v-else>
                  只提交評論排名，不包括成果排名
                </span>
              </div>
            </div>
          </div>
        </el-tab-pane>
        
      </el-tabs>
      
      <!-- 底部操作按鈕 -->
      <div class="action-buttons">
        <el-button size="large" @click="handleClose">關閉</el-button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TeacherVoteModal',
  props: {
    visible: {
      type: Boolean,
      required: true
    },
    projectId: {
      type: String,
      required: true
    },
    stageId: {
      type: String,
      required: true
    },
    projectTitle: {
      type: String,
      default: ''
    },
    stageTitle: {
      type: String,
      default: ''
    },
    stageGroups: {
      type: Array,
      default: () => []
    }
  },
  emits: ['update:visible', 'teacher-ranking-submitted'],
  data() {
    return {
      loading: false,
      activeTab: 'submissions',
      rankedSubmissions: [],
      rankedComments: [], // 參與排名的評論
      excludedComments: [], // 被移出排名的評論
      allComments: [], // 所有有效評論（用於恢復）
      projectGroups: [], // 存儲專案的所有組別數據
      draggedSubmissionIndex: null,
      draggedCommentIndex: null,
      submittingSubmissions: false,
      submittingComments: false,
      submissionVoted: false,
      commentVoted: false,
      submissionVoteTime: null,
      commentVoteTime: null,
      teacherDisplayName: '',
      voteHistory: null
    }
  },
  computed: {
    // 檢查前三名中是否有重複作者
    hasDuplicateAuthorsInTopThree() {
      const topThreeComments = this.rankedComments.slice(0, 3)
      const authorEmails = topThreeComments.map(comment => comment.authorEmail || comment.author)
      const uniqueAuthors = new Set(authorEmails)
      return authorEmails.length !== uniqueAuthors.size
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.checkExistingVoteStatus()
        this.loadTeacherVoteData()
      }
    }
  },
  methods: {
    async checkExistingVoteStatus() {
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) return
        
        // 檢查教師投票歷史
        const historyResponse = await this.$apiClient.callWithAuth('/rankings/teacher-vote-history', {
          projectId: this.projectId,
          stageId: this.stageId
        })
        
        if (historyResponse.success && historyResponse.data) {
          const history = historyResponse.data
          this.voteHistory = history
          
          console.log('🎓 [TeacherVoteModal] 教師投票歷史:', history)
          
          // 設置顯示名稱
          this.teacherDisplayName = history.displayName || ''
          
          // 檢查成果排名歷史
          if (history.submissionRanking) {
            this.submissionVoted = true
            this.submissionVoteTime = history.submissionRanking.createdTime
            console.log(`📊 成果排名記錄: 評分過 ${history.submissionRanking.totalVersions} 次，最新一次對 ${history.submissionRanking.latestRankingCount} 個成果評分，時間: ${history.submissionRanking.createdTime}`)
          }
          
          // 檢查評論排名歷史
          if (history.commentRanking) {
            this.commentVoted = true
            this.commentVoteTime = history.commentRanking.createdTime
            console.log(`💬 評論排名記錄: 評分過 ${history.commentRanking.totalVersions} 次，最新一次對 ${history.commentRanking.latestRankingCount} 個評論評分，時間: ${history.commentRanking.createdTime}`)
          }
        }
      } catch (error) {
        console.error('❌ [TeacherVoteModal] 檢查教師投票歷史失敗:', error)
        // 失敗時不影響使用，只是不顯示歷史記錄
      }
    },
    
    async loadTeacherVoteData() {
      try {
        this.loading = true
        
        // 檢查 session - 與 StageComments 保持一致
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.error('❌ [TeacherVoteModal] 沒有 sessionId')
          return
        }
        
        console.log('🎯 [TeacherVoteModal] 載入教師投票數據:', {
          projectId: this.projectId,
          stageId: this.stageId,
          stageGroupsCount: this.stageGroups.length,
          hasSessionId: !!sessionId
        })
        
        // 載入專案Groups數據，用於組別名稱轉換
        try {
          const groupsResponse = await this.$apiClient.getProjectContent(
            this.projectId,
            this.stageId,
            'groups'
          )
          
          if (groupsResponse.success && groupsResponse.data && groupsResponse.data.groups) {
            this.projectGroups = groupsResponse.data.groups
            console.log('📊 [TeacherVoteModal] 載入Groups數據:', this.projectGroups.length, '個組別')
          }
        } catch (error) {
          console.warn('載入Groups數據失敗:', error)
        }
        
        // 載入成果提交數據 - 載入該階段所有最新（有效）的成果給老師排名
        const submissionsResponse = await this.$apiClient.callWithAuth('/submissions/list', {
          projectId: this.projectId,
          stageId: this.stageId
        })
        
        if (submissionsResponse.success && submissionsResponse.data) {
          console.log('📊 [TeacherVoteModal] 提交數量:', submissionsResponse.data.length)
          
          // 分析所有提交的狀態
          const statusCounts = {}
          submissionsResponse.data.forEach(sub => {
            statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1
          })
          console.log('📈 [TeacherVoteModal] 狀態統計:', statusCounts)
          
          // 保留所有有效的提交 - 老師需要對所有組別成果進行排名
          // 包括 submitted 和 approved 狀態，排除 withdrawn 和 rejected
          const validSubmissions = submissionsResponse.data.filter(sub => 
            sub.status === 'submitted' || sub.status === 'approved'
          )
          
          console.log('✅ [TeacherVoteModal] 有效的提交:', validSubmissions)
          console.log('✅ [TeacherVoteModal] 有效數量:', validSubmissions.length)
          
          this.rankedSubmissions = validSubmissions
            .map(sub => {
              // 先從 submission 本身查找 groupName，再從 stageGroups 查找
              let groupName = sub.groupName
              let memberNames = sub.memberNames || []
              
              if (!groupName) {
                const group = this.stageGroups.find(g => g.groupId === sub.groupId)
                groupName = group?.groupName || 'Unknown Group'
                memberNames = group?.memberNames || []
              }
              
              console.log(`🔍 [TeacherVoteModal] 組別資訊:`, {
                groupId: sub.groupId,
                fromSubmission: sub.groupName,
                fromStageGroups: this.stageGroups.find(g => g.groupId === sub.groupId)?.groupName,
                finalGroupName: groupName
              })
              
              return {
                ...sub,
                groupName: groupName,
                memberNames: memberNames
              }
            })
            .sort((a, b) => {
              // 如果有既存的教師排名，按照排名排序
              if (a.teacherRank && b.teacherRank) {
                return a.teacherRank - b.teacherRank
              }
              // 否則按提交時間排序（最新的在前）
              return b.submitTime - a.submitTime
            })
            
          console.log('🎯 [TeacherVoteModal] 最終 rankedSubmissions:', this.rankedSubmissions)
        } else {
          console.error('❌ [TeacherVoteModal] API 失敗或無數據:', submissionsResponse)
        }
        
        // 載入評論數據 - 使用與 ProjectDetail.vue 相同的方法
        const commentsResponse = await this.$apiClient.getProjectContent(
          this.projectId,
          this.stageId,
          'comments',
          true  // excludeTeachers = true for voting
        )
        
        if (commentsResponse.success && commentsResponse.data && commentsResponse.data.comments) {
          console.log('💬 [TeacherVoteModal] 評論數量:', commentsResponse.data.comments.length)
          
          // 獲取當前用戶的email（老師）
          const currentUserEmail = this.getCurrentUserEmail()
          
          // 老師可以排所有第一層評論（replyLevel=0），但不包括自己的評論（避免利益衝突）
          // 並且只包含有mentionedGroups或mentionedUsers的評論
          const validComments = commentsResponse.data.comments
            .filter(comment => {
              const commentAuthor = comment.authorEmail || comment.author
              const isNotCurrentUser = !currentUserEmail || commentAuthor !== currentUserEmail
              const isTopLevel = !comment.replyLevel || comment.replyLevel === 0 // 只包含第一層評論
              
              // 檢查是否有mention（groups或users）
              let hasMentions = false
              try {
                const mentionedGroups = comment.mentionedGroups ? 
                  (typeof comment.mentionedGroups === 'string' ? JSON.parse(comment.mentionedGroups) : comment.mentionedGroups) : []
                const mentionedUsers = comment.mentionedUsers ? 
                  (typeof comment.mentionedUsers === 'string' ? JSON.parse(comment.mentionedUsers) : comment.mentionedUsers) : []
                
                hasMentions = (Array.isArray(mentionedGroups) && mentionedGroups.length > 0) || 
                             (Array.isArray(mentionedUsers) && mentionedUsers.length > 0)
              } catch (e) {
                console.warn('解析mention數據失敗:', e)
                hasMentions = false
              }
              
              console.log(`💬 [TeacherVoteModal] 評論過濾檢查:`, {
                commentId: comment.commentId,
                authorEmail: commentAuthor,
                replyLevel: comment.replyLevel,
                isReply: comment.isReply,
                isNotCurrentUser,
                isTopLevel,
                hasMentions
              })
              
              return isNotCurrentUser && isTopLevel && hasMentions
            })
            .map(comment => {
              // 確保mentionedGroups是數組並轉換為組別名稱
              let mentionedGroups = []
              let mentionedGroupNames = []
              try {
                if (comment.mentionedGroups) {
                  mentionedGroups = typeof comment.mentionedGroups === 'string' 
                    ? JSON.parse(comment.mentionedGroups) 
                    : comment.mentionedGroups
                }
                if (!Array.isArray(mentionedGroups)) {
                  mentionedGroups = []
                }
                
                // 將組別ID轉換為組別名稱
                mentionedGroupNames = mentionedGroups.map(groupId => {
                  // 優先從載入的projectGroups查找
                  const projectGroup = this.projectGroups.find(g => g.groupId === groupId)
                  if (projectGroup) {
                    return projectGroup.groupName || projectGroup.name || groupId
                  }
                  
                  // 備用：從父組件的專案數據查找
                  if (this.$parent && this.$parent.projectData && this.$parent.projectData.groups) {
                    const group = this.$parent.projectData.groups.find(g => g.groupId === groupId)
                    if (group) {
                      return group.groupName || group.name || groupId
                    }
                  }
                  
                  // 再備用：從stageGroups查找
                  const stageGroup = this.stageGroups.find(g => g.groupId === groupId)
                  if (stageGroup) {
                    return stageGroup.groupName || stageGroup.name || groupId
                  }
                  
                  console.warn(`找不到組別名稱 for groupId: ${groupId}`)
                  // 最後：返回原始ID
                  return groupId
                })
              } catch (e) {
                console.warn('解析mentionedGroups失敗:', e)
                mentionedGroups = []
                mentionedGroupNames = []
              }
              
              return {
                ...comment,
                mentionedGroups: mentionedGroupNames // 使用組別名稱而不是ID
              }
            })
            .sort((a, b) => {
              // 如果有既存的教師排名，按照排名排序
              if (a.teacherRank && b.teacherRank) {
                return a.teacherRank - b.teacherRank
              }
              // 否則按創建時間排序（最新的在前）
              return b.createdTime - a.createdTime
            })
          
          // 保存所有有效評論，並初始化排名和排除狀態
          this.allComments = [...validComments]
          this.rankedComments = [...validComments]
          this.excludedComments = []
            
          console.log('💬 [TeacherVoteModal] 最終評論數量:', this.rankedComments.length)
        } else {
          console.log('💬 [TeacherVoteModal] 該階段沒有評論或 API 失敗')
          this.allComments = []
          this.rankedComments = []
          this.excludedComments = []
        }
        
      } catch (error) {
        console.error('❌ [TeacherVoteModal] 載入教師投票數據失敗:', error)
        this.$message.error('載入投票數據失敗')
      } finally {
        console.log('🏁 [TeacherVoteModal] 載入完成, 最終狀態:', {
          rankedSubmissions: this.rankedSubmissions.length,
          rankedComments: this.rankedComments.length
        })
        this.loading = false
      }
    },
    
    // 格式化相關方法
    formatGroupMembers(group) {
      if (!group.memberNames || group.memberNames.length === 0) {
        return '無成員'
      }
      
      const names = group.memberNames.join('、')
      if (names.length > 40) {
        return names.substring(0, 37) + '...'
      }
      return names
    },
    
    formatSubmissionTime(timestamp) {
      if (!timestamp) return ''
      return new Date(timestamp).toLocaleDateString('zh-TW') + ' ' + 
             new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    },
    
    formatTime(timestamp) {
      if (!timestamp) return ''
      return new Date(timestamp).toLocaleDateString('zh-TW') + ' ' + 
             new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    },
    
    truncateContent(content) {
      if (!content) return '無內容'
      if (content.length > 100) {
        return content.substring(0, 97) + '...'
      }
      return content
    },
    
    
    // 排序控制方法 - 成果提交
    moveSubmissionUp(index) {
      if (index > 0) {
        const item = this.rankedSubmissions[index]
        this.rankedSubmissions.splice(index, 1)
        this.rankedSubmissions.splice(index - 1, 0, item)
      }
    },
    
    moveSubmissionDown(index) {
      if (index < this.rankedSubmissions.length - 1) {
        const item = this.rankedSubmissions[index]
        this.rankedSubmissions.splice(index, 1)
        this.rankedSubmissions.splice(index + 1, 0, item)
      }
    },
    
    // 排序控制方法 - 評論
    moveCommentUp(index) {
      if (index > 0) {
        const item = this.rankedComments[index]
        this.rankedComments.splice(index, 1)
        this.rankedComments.splice(index - 1, 0, item)
      }
    },
    
    moveCommentDown(index) {
      if (index < this.rankedComments.length - 1) {
        const item = this.rankedComments[index]
        this.rankedComments.splice(index, 1)
        this.rankedComments.splice(index + 1, 0, item)
      }
    },
    
    // 拖放相關方法 - 成果提交
    handleSubmissionDragStart(index, event) {
      this.draggedSubmissionIndex = index
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/html', event.target.innerHTML)
    },
    
    handleSubmissionDragEnd() {
      this.draggedSubmissionIndex = null
    },
    
    handleSubmissionDrop(dropIndex, event) {
      if (event.stopPropagation) {
        event.stopPropagation()
      }
      
      if (this.draggedSubmissionIndex !== null && this.draggedSubmissionIndex !== dropIndex) {
        const draggedItem = this.rankedSubmissions[this.draggedSubmissionIndex]
        
        // 從原位置移除
        this.rankedSubmissions.splice(this.draggedSubmissionIndex, 1)
        
        // 插入到新位置
        if (dropIndex > this.draggedSubmissionIndex) {
          this.rankedSubmissions.splice(dropIndex - 1, 0, draggedItem)
        } else {
          this.rankedSubmissions.splice(dropIndex, 0, draggedItem)
        }
      }
      
      return false
    },
    
    // 拖放相關方法 - 評論
    handleCommentDragStart(index, event) {
      this.draggedCommentIndex = index
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/html', event.target.innerHTML)
    },
    
    handleCommentDragEnd() {
      this.draggedCommentIndex = null
    },
    
    handleCommentDrop(dropIndex, event) {
      if (event.stopPropagation) {
        event.stopPropagation()
      }
      
      if (this.draggedCommentIndex !== null && this.draggedCommentIndex !== dropIndex) {
        const draggedItem = this.rankedComments[this.draggedCommentIndex]
        
        // 從原位置移除
        this.rankedComments.splice(this.draggedCommentIndex, 1)
        
        // 插入到新位置
        if (dropIndex > this.draggedCommentIndex) {
          this.rankedComments.splice(dropIndex - 1, 0, draggedItem)
        } else {
          this.rankedComments.splice(dropIndex, 0, draggedItem)
        }
      }
      
      return false
    },
    
    // 通用拖放方法
    handleDragOver(event) {
      if (event.preventDefault) {
        event.preventDefault()
      }
      event.dataTransfer.dropEffect = 'move'
      return false
    },
    
    // 提交成果排名
    async submitSubmissionRankings() {
      try {
        this.submittingSubmissions = true
        
        // 準備成果排名數據
        const submissionRankings = this.rankedSubmissions.map((submission, index) => ({
          type: 'submission',
          targetId: submission.submissionId,
          groupId: submission.groupId,
          rank: index + 1
        }))
        
        // 只提交成果排名
        const response = await this.$apiClient.callWithAuth('/rankings/teacher-comprehensive-vote', {
          projectId: this.projectId,
          stageId: this.stageId,
          rankings: {
            submissions: submissionRankings,
            comments: []
          }
        })
        
        if (response.success) {
          this.$message.success('成果排名已成功提交！')
          
          // 設置投票狀態
          this.submissionVoted = true
          this.submissionVoteTime = this.getCurrentTimestamp()
          
          // 通知父組件
          this.$emit('teacher-ranking-submitted', {
            success: true,
            type: 'submissions',
            data: response.data,
            needRefresh: true
          })
        } else {
          throw new Error(response.error?.message || '提交失敗')
        }
      } catch (error) {
        console.error('提交成果排名失敗:', error)
        this.$message.error(`提交失敗: ${error.message}`)
      } finally {
        this.submittingSubmissions = false
      }
    },
    
    // 提交評論排名
    async submitCommentRankings() {
      try {
        this.submittingComments = true
        
        // 檢查是否有評論可以提交
        if (this.rankedComments.length === 0) {
          this.$message.error('請至少選擇一個評論進行排名')
          return
        }
        
        // 只提交前三名評論排名（只有前三名會獲得點數，但可以少於三個）
        const commentRankings = this.rankedComments
          .slice(0, 3) // 只取前三名（可能少於3個）
          .map((comment, index) => ({
            type: 'comment',
            targetId: comment.commentId,
            authorEmail: comment.authorEmail,
            rank: index + 1
          }))
        
        // 注意：前三名重複作者的驗證已在按鈕禁用邏輯中處理
        
        // 只提交評論排名
        const response = await this.$apiClient.callWithAuth('/rankings/teacher-comprehensive-vote', {
          projectId: this.projectId,
          stageId: this.stageId,
          rankings: {
            submissions: [],
            comments: commentRankings
          }
        })
        
        if (response.success) {
          this.$message.success('評論排名已成功提交！')
          
          // 設置投票狀態
          this.commentVoted = true
          this.commentVoteTime = this.getCurrentTimestamp()
          
          // 通知父組件
          this.$emit('teacher-ranking-submitted', {
            success: true,
            type: 'comments',
            data: response.data,
            needRefresh: true
          })
        } else {
          throw new Error(response.error?.message || '提交失敗')
        }
      } catch (error) {
        console.error('提交評論排名失敗:', error)
        this.$message.error(`提交失敗: ${error.message}`)
      } finally {
        this.submittingComments = false
      }
    },
    
    // 檢查指定評論的作者是否已在前三名中
    isAuthorInTopThree(comment) {
      const topThreeComments = this.rankedComments.slice(0, 3)
      const commentAuthor = comment.authorEmail || comment.author
      return topThreeComments.some(topComment => {
        const topAuthor = topComment.authorEmail || topComment.author
        return topAuthor === commentAuthor && topComment.commentId !== comment.commentId
      })
    },
    
    // 將評論移出排名
    excludeCommentFromRanking(index) {
      if (index < 0 || index >= this.rankedComments.length) return
      
      const comment = this.rankedComments[index]
      this.excludedComments.push(comment)
      this.rankedComments.splice(index, 1)
      
      this.$message.info(`已將 ${comment.authorDisplayName || comment.authorEmail} 的評論移出排名`)
    },
    
    // 將評論恢復到排名
    restoreCommentToRanking(index) {
      if (index < 0 || index >= this.excludedComments.length) return
      
      const comment = this.excludedComments[index]
      this.rankedComments.push(comment)
      this.excludedComments.splice(index, 1)
      
      this.$message.success(`已恢復 ${comment.authorDisplayName || comment.authorEmail} 的評論到排名`)
    },
    
    handleClose() {
      if (!this.loading && !this.submittingSubmissions && !this.submittingComments) {
        this.$emit('update:visible', false)
        this.rankedSubmissions = []
        this.rankedComments = []
        this.projectGroups = []
        this.draggedSubmissionIndex = null
        this.draggedCommentIndex = null
        this.activeTab = 'submissions'
        // 重置投票狀態
        this.submissionVoted = false
        this.commentVoted = false
        this.submissionVoteTime = null
        this.commentVoteTime = null
      }
    },
    
    getCurrentUserEmail() {
      // 嘗試從父組件獲取用戶信息
      if (this.$parent && this.$parent.user && this.$parent.user.userEmail) {
        return this.$parent.user.userEmail
      }
      
      // 嘗試從sessionStorage獲取
      const sessionId = localStorage.getItem('sessionId')
      if (sessionId) {
        // 可以從API獲取當前用戶信息，但這裡暫時使用簡單的方法
        // 或者從全局狀態管理器獲取
      }
      
      return ''
    },
    
    getCurrentTimestamp() {
      return Date.now()
    }
  }
}
</script>

<style scoped>
.teacher-vote-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-out;
}

.modal-content {
  background: white;
  width: 100%;
  height: 100%;
  border-radius: 0;
  overflow-y: auto;
  animation: slideUp 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    transform: translateY(100%);
    opacity: 0;
  }
  to { 
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  background: #1e3a8a; /* Navy背景 */
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 0;
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
  background: rgba(255, 255, 255, 0.1);
}

.breadcrumb-section {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.info-banner {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border: 1px solid #93c5fd;
  border-radius: 0;
  padding: 20px 25px;
  margin: 0;
  color: #1e40af;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #e1e8ed;
}

.info-banner i {
  font-size: 20px;
  color: #3b82f6;
}

.vote-tabs {
  margin: 24px 25px;
}

.vote-status-alert {
  margin-bottom: 20px;
  border-radius: 8px;
}

:deep(.vote-tabs .el-tabs__header) {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 20px;
}

:deep(.vote-tabs .el-tabs__nav) {
  border: none;
}

:deep(.vote-tabs .el-tabs__item) {
  height: 40px;
  line-height: 40px;
  border-radius: 6px;
  margin-right: 8px;
  padding: 0 20px;
  border: none;
  color: #64748b;
  font-weight: 500;
}

:deep(.vote-tabs .el-tabs__item.is-active) {
  background: white;
  color: #1e40af;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.vote-section {
  padding: 0 25px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-title i {
  color: #3b82f6;
  font-size: 20px;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ranking-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 12px;
  cursor: grab;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.ranking-item:active {
  cursor: grabbing;
}

.ranking-item:hover {
  background: #e2e8f0;
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.ranking-item.is-dragging {
  opacity: 0.6;
  background: #e2e8f0;
  border-color: #3b82f6;
  transform: rotate(2deg);
}

.rank-number {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.group-info, .comment-info {
  flex: 1;
  min-width: 0;
}

.group-header, .comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.group-name, .comment-author {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.submission-time, .comment-time {
  font-size: 12px;
  color: #6b7280;
}

.group-members {
  font-size: 14px;
  color: #4b5563;
  margin-bottom: 8px;
}

.submission-preview, .comment-content {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  background: white;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.comment-mentions {
  font-size: 12px;
  color: #6366f1;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.drag-handle {
  color: #9ca3af;
  font-size: 20px;
  padding: 0 8px;
  cursor: grab;
  display: flex;
  align-items: center;
}

.drag-handle:active {
  cursor: grabbing;
}

.ranking-hint {
  text-align: center;
  padding: 12px 20px;
  margin: 16px 0;
  background: #f0f9ff;
  border-radius: 8px;
  color: #0369a1;
  font-size: 13px;
  border-left: 4px solid #3b82f6;
}

.ranking-hint i {
  margin-right: 8px;
  color: #3b82f6;
}

.section-submit-actions {
  margin-top: 30px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  text-align: center;
}

.section-submit-actions .el-button {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  margin-bottom: 8px;
}

.submit-hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
}

.no-items {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
  font-size: 16px;
}

.no-items i {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.5;
}

.action-buttons {
  position: sticky;
  bottom: 0;
  background: white;
  padding: 20px 25px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
}

/* 響應式設計 */
@media (max-width: 768px) {
  .modal-content {
    padding: 16px;
  }
  
  .ranking-item {
    padding: 16px;
  }
  
  .rank-number {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
  
  .group-name, .comment-author {
    font-size: 14px;
  }
  
  .group-header, .comment-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

/* 前三名特殊樣式 */
.ranking-item.top-three {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #f59e0b;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.rank-number.top-rank {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

/* 重複作者警告樣式 */
.ranking-item.duplicate-author-warning {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border: 2px solid #ef4444;
  opacity: 0.8;
}

.duplicate-warning {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.duplicate-warning i {
  color: #ef4444;
}

/* 前三名分割線 */
.top-three-divider {
  position: relative;
  margin: 20px 0;
  text-align: center;
}

.divider-line {
  height: 3px;
  background: linear-gradient(90deg, transparent 0%, #ef4444 20%, #ef4444 80%, transparent 100%);
  border-radius: 2px;
  margin-bottom: 8px;
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
}

.divider-text {
  background: white;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border: 1px solid #ef4444;
  border-radius: 12px;
  display: inline-block;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 移出排名按鈕樣式 */
.exclude-btn {
  color: #dc2626 !important;
}

.exclude-btn:hover {
  background: #fee2e2 !important;
  color: #b91c1c !important;
}

/* 被排除評論區域樣式 */
.excluded-section {
  margin-top: 30px;
  padding: 20px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.excluded-title {
  color: #6b7280;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 15px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.excluded-title i {
  color: #9ca3af;
}

.excluded-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.excluded-item {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.excluded-item:hover {
  opacity: 1;
}

/* 提交按鈕錯誤提示樣式 */
.submit-hint .error-hint {
  color: #dc2626;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.submit-hint .error-hint i {
  color: #ef4444;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>