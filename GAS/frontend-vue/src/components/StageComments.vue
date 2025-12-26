<template>
  <div class="stage-comments" v-loading="loading" element-loading-text="載入評論中...">
    <div v-if="comments.length === 0 && !loading" class="no-comments">
      目前沒有評論
    </div>
    
    <!-- 評論列表 -->
    <div v-for="comment in comments" :key="comment.id" class="comment-item">
      <!-- 評論排名狀態指示區 -->
      <div class="comment-status-bar" v-if="!comment.isTeacherComment">
        <div class="ranking-badges">
          <div class="status-badge settlement">
            結算第
            <i v-if="loadingRankings" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ comment.settlementRank || '-' }}</span>
            名
          </div>
          <div class="status-badge user-vote">
            你投第
            <i v-if="loadingRankings" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ comment.userVoteRank || '-' }}</span>
            名
          </div>
          <div class="status-badge teacher-vote">
            老師投第
            <i v-if="loadingRankings" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ comment.teacherVoteRank || '-' }}</span>
            名
          </div>
        </div>
        <button 
          v-if="canReplyToComment(comment)"
          class="reply-button" 
          @click="handleReplyClick(comment)"
        >
          <i class="fas fa-reply"></i>
          {{ getReplyButtonText(comment) }}
        </button>
      </div>
      
      <!-- 教師評論標記 -->
      <div class="comment-status-bar teacher-comment" v-if="comment.isTeacherComment">
        <div class="ranking-badges">
          <div class="status-badge teacher-label">
            老師的評論
          </div>
        </div>
      </div>
      
      <div class="comment-header">
        <span class="comment-author">{{ comment.authorName }}</span>
        <span class="comment-time">{{ comment.timestamp }}</span>
      </div>
      
      <div class="comment-content">
        <span v-html="parseCommentContent(comment.content)"></span>
      </div>
      
      <!-- 提及的群組/用戶顯示 -->
      <div v-if="comment.mentionedGroups.length > 0 || comment.mentionedUsers.length > 0" class="mentions">
        <span v-for="group in comment.mentionedGroups" :key="group" class="mentioned-group">
          @{{ group }}
        </span>
        <span v-for="user in comment.mentionedUsers" :key="user" class="mentioned-user">
          @{{ user }}
        </span>
      </div>
      
      <!-- 回復區域 -->
      <div v-if="comment.replies && comment.replies.length > 0" class="replies">
        <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
          <div class="reply-header">
            <span class="reply-author">{{ reply.authorName || reply.author }}</span>
            <span class="reply-time">{{ reply.timestamp }}</span>
          </div>
          <div class="reply-content">
            <span v-html="parseCommentContent(reply.content)"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'StageComments',
  props: {
    stageId: {
      type: String,
      required: true
    },
    projectId: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      comments: [],
      loading: true,
      commentRankings: {},
      loadingRankings: true
    }
  },
  async mounted() {
    await this.loadStageComments()
  },
  watch: {
    stageId: {
      handler(newStageId) {
        if (newStageId) {
          this.loadStageComments()
        }
      },
      immediate: true
    }
  },
  methods: {
    async loadStageComments() {
      try {
        console.log('=== StageComments.loadStageComments 開始 ===')
        console.log(`ProjectId: ${this.projectId}, StageId: ${this.stageId}`)
        
        this.loading = true
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.warn('沒有找到 sessionId')
          return
        }
        
        // 從props獲取projectId
        const projectId = this.projectId
        
        console.log('開始調用 API 獲取評論...')
        const response = await this.$apiClient.getStageComments(
          projectId,
          this.stageId
        )
        
        console.log('評論 API 響應:', response)
        
        if (response.success && response.data) {
          console.log(`獲取到 ${response.data.length} 條評論`)
          this.comments = this.processCommentsData(response.data)
          console.log('評論處理完成，開始載入排名...')
          // 載入評論排名
          await this.loadCommentRankings()
          console.log('排名載入完成')
        } else {
          console.error('評論載入失敗:', response)
          this.$handleError('無法載入評論列表', {
            action: '載入評論'
          })
        }
      } catch (error) {
        console.error('Error loading comments:', error)
      } finally {
        this.loading = false
        console.log('=== StageComments.loadStageComments 結束 ===')
      }
    },
    
    processCommentsData(rawComments) {
      if (!rawComments || !Array.isArray(rawComments)) {
        return []
      }
      
      // 將後端返回的評論數據轉換為前端需要的格式
      // 這裡返回的是評論列表，不是按組分組的數據
      return rawComments.map(comment => {
        // 解析mentionedGroups和mentionedUsers（可能是JSON字串）
        let mentionedUsers = []
        let mentionedGroups = []
        
        try {
          mentionedUsers = comment.mentionedUsers ? 
            (typeof comment.mentionedUsers === 'string' ? 
              JSON.parse(comment.mentionedUsers) : comment.mentionedUsers
            ) : []
        } catch (e) {
          console.warn('解析mentionedUsers失敗:', e)
        }
        
        try {
          mentionedGroups = comment.mentionedGroups ? 
            (typeof comment.mentionedGroups === 'string' ? 
              JSON.parse(comment.mentionedGroups) : comment.mentionedGroups
            ) : []
        } catch (e) {
          console.warn('解析mentionedGroups失敗:', e)
        }
        
        // 處理回復評論
        let replies = []
        if (comment.replies && Array.isArray(comment.replies)) {
          replies = comment.replies.map(reply => ({
            id: reply.commentId || reply.id,
            content: reply.content,
            timestamp: this.formatTime(reply.createdTime),
            author: reply.authorEmail || reply.author,
            mentionedUsers: reply.mentionedUsers || [],
            mentionedGroups: reply.mentionedGroups || []
          }))
        }
        
        // 檢查是否為教師評論 (Global PM)
        const isTeacherComment = this.isGlobalPMComment(comment.authorEmail || comment.author)
        
        return {
          id: comment.commentId || comment.id,
          commentId: comment.commentId || comment.id, // 確保有commentId供回復使用
          content: comment.content,
          timestamp: this.formatTime(comment.createdTime),
          author: comment.authorEmail || comment.author,
          authorName: comment.authorName || comment.authorEmail || comment.author,
          mentionedUsers: this.convertUserEmailsToUsernames(mentionedUsers),
          mentionedGroups: this.convertGroupIdsToNames(mentionedGroups),
          // 保留原始的ID/email供權限檢查使用
          rawMentionedUsers: mentionedUsers, // 原始的email陣列
          rawMentionedGroups: mentionedGroups, // 原始的groupId陣列
          replies: replies,
          voteCount: comment.voteCount || 0,
          hasVoted: comment.hasVoted || false,
          rank: comment.rank || null,
          isTeacherComment: isTeacherComment,
          // 排名相關數據
          settlementRank: comment.settlementRank || null,
          userVoteRank: comment.userVoteRank || null,
          teacherVoteRank: comment.teacherVoteRank || null
        }
      }).sort((a, b) => {
        // 按時間排序，最新的在前
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return timeB - timeA
      })
    },
    
    parseCommentContent(content) {
      if (!content) return ''
      
      // 先進行markdown解析
      let html = content
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        
        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/__(.*?)__/gim, '<strong>$1</strong>')
        
        // Italic
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/_(.*?)_/gim, '<em>$1</em>')
        
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/`([^`]*)`/gim, '<code>$1</code>')
        
        // Links
        .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank">$1</a>')
        
        // Line breaks
        .replace(/\n/gim, '<br>')
      
      // 然後解析 @email 標記，顯示為友好的用戶名稱
      html = html.replace(/@([^\s@]+@[^\s@]+)/g, (match, email) => {
        // 嘗試從項目數據中找到用戶的顯示名稱
        const friendlyName = this.getEmailDisplayName(email)
        return `<span class="mention" title="${email}">@${friendlyName}</span>`
      })
      
      return html
    },
    
    getEmailDisplayName(email) {
      // 嘗試從父組件的項目數據中獲取用戶的友好名稱
      if (this.$parent && this.$parent.projectData && this.$parent.projectData.users) {
        const user = this.$parent.projectData.users.find(u => u.userEmail === email)
        if (user) {
          return user.displayName || user.username || email.split('@')[0]
        }
      }
      
      // 如果找不到，返回 email 前綴
      return email.split('@')[0]
    },
    
    convertUserEmailsToUsernames(userEmails) {
      if (!Array.isArray(userEmails)) return []
      
      return userEmails.map(email => {
        // 嘗試從父組件的項目數據中獲取用戶的帳號
        if (this.$parent && this.$parent.projectData && this.$parent.projectData.users) {
          const user = this.$parent.projectData.users.find(u => u.userEmail === email)
          if (user) {
            return user.username || user.displayName || email.split('@')[0]
          }
        }
        
        // 如果找不到，返回 email 前綴
        return email.split('@')[0]
      })
    },
    
    convertGroupIdsToNames(groupIds) {
      if (!Array.isArray(groupIds)) return []
      
      return groupIds.map(groupId => {
        // 嘗試從父組件的項目數據中獲取群組名稱
        if (this.$parent && this.$parent.projectData && this.$parent.projectData.groups) {
          const group = this.$parent.projectData.groups.find(g => g.groupId === groupId)
          if (group) {
            return group.groupName || group.name || groupId
          }
        }
        
        // 如果找不到，返回原始的 groupId
        return groupId
      })
    },
    
    formatTime(timestamp) {
      if (!timestamp) return ''
      return new Date(timestamp).toLocaleString('zh-TW')
    },
    
    // 檢查是否為Global PM的評論
    isGlobalPMComment(authorEmail) {
      // 嘗試從父組件獲取用戶權限信息
      if (this.$parent && this.$parent.user && this.$parent.projectData) {
        // 檢查作者是否為Global PM
        const authorUser = this.$parent.projectData.users?.find(u => u.userEmail === authorEmail)
        if (authorUser && authorUser.permissions) {
          return authorUser.permissions.includes('create_project')
        }
      }
      return false
    },
    
    handleReply(groupId) {
      console.log('回復組別:', groupId)
      // 這裡會觸發回復評論的功能
      this.$emit('reply', groupId)
    },
    
    handleReplyClick(comment) {
      // 發送回復評論的事件給父組件
      this.$emit('reply-comment', {
        commentId: comment.id,
        authorName: comment.authorName,
        mentionedGroups: comment.mentionedGroups,
        mentionedUsers: comment.mentionedUsers
      })
    },
    
    canReplyToComment(comment) {
      // 獲取當前用戶信息
      const currentUser = this.$parent?.user
      if (!currentUser || !currentUser.userEmail) {
        return false
      }
      
      const currentUserEmail = currentUser.userEmail
      
      // 如果具有teacher_privilege權限（總PM/老師），總是可以回覆
      if (this.hasTeacherPrivilege()) {
        return true
      }
      
      // 學生權限檢查：只能在 stage.status = 'active' 時回覆
      const currentStage = this.getCurrentStage()
      if (!currentStage || currentStage.status !== 'active') {
        return false
      }
      
      // 如果是評論作者，可以回覆自己的評論（但仍需要 stage 為 active）
      if (comment.author === currentUserEmail) {
        return true
      }
      
      // 如果不是作者，檢查是否有@任何人或組
      if (!comment.rawMentionedGroups?.length && !comment.rawMentionedUsers?.length) {
        return false
      }
      
      // 檢查是否直接被@到（用戶level）- 使用原始的email陣列
      if (comment.rawMentionedUsers?.length > 0) {
        if (comment.rawMentionedUsers.includes(currentUserEmail)) {
          return true
        }
      }
      
      // 檢查是否通過群組被@到（群組level）- 使用原始的groupId陣列
      if (comment.rawMentionedGroups?.length > 0) {
        const currentUserGroupId = this.getCurrentUserGroupId()
        if (currentUserGroupId && comment.rawMentionedGroups.includes(currentUserGroupId)) {
          return true
        }
      }
      
      return false
    },
    
    getReplyButtonText(comment) {
      // 獲取當前用戶信息
      const currentUser = this.$parent?.user
      if (!currentUser || !currentUser.userEmail) {
        return '回覆'
      }
      
      const currentUserEmail = currentUser.userEmail
      
      // 檢查是否具有teacher_privilege權限
      if (this.hasTeacherPrivilege()) {
        return '教師回復'
      }
      
      // 如果是評論作者
      if (comment.author === currentUserEmail) {
        return '回復自己的評論'
      }
      
      // 如果被@到
      return '被@到‧回覆'
    },
    
    getCurrentUserGroupId() {
      // 獲取當前用戶的群組ID
      const currentUser = this.$parent?.user
      if (!currentUser || !currentUser.userEmail) {
        return null
      }
      
      const projectData = this.$parent?.projectData
      if (!projectData || !projectData.userGroups) {
        return null
      }
      
      const userGroupRecord = projectData.userGroups.find(ug => 
        ug.userEmail === currentUser.userEmail && ug.isActive
      )
      
      return userGroupRecord ? userGroupRecord.groupId : null
    },
    
    hasTeacherPrivilege() {
      // 檢查當前用戶是否具有teacher_privilege權限
      const currentUser = this.$parent?.user
      if (!currentUser || !currentUser.userEmail) {
        return false
      }
      
      // 檢查全域權限
      if (currentUser.globalPermissions && currentUser.globalPermissions.includes('teacher_privilege')) {
        return true
      }
      
      // 檢查專案權限
      const projectData = this.$parent?.projectData
      if (projectData && projectData.userGroups) {
        const userGroupRecord = projectData.userGroups.find(ug => 
          ug.userEmail === currentUser.userEmail && ug.isActive
        )
        
        if (userGroupRecord && projectData.groups) {
          const group = projectData.groups.find(g => 
            g.groupId === userGroupRecord.groupId && g.status === 'active'
          )
          
          if (group && group.permissions) {
            try {
              const permissions = typeof group.permissions === 'string' 
                ? JSON.parse(group.permissions) 
                : group.permissions
              return Array.isArray(permissions) && permissions.includes('teacher_privilege')
            } catch (e) {
              console.warn('解析群組權限失敗:', e)
            }
          }
        }
      }
      
      return false
    },
    
    getCurrentStage() {
      // 從父組件獲取當前 stage 信息
      const projectData = this.$parent?.projectData
      if (projectData && projectData.stages) {
        return projectData.stages.find(stage => stage.stageId === this.stageId)
      }
      return null
    },
    
    
    async loadCommentRankings() {
      try {
        console.log('=== StageComments.loadCommentRankings 開始 ===')
        console.log(`ProjectId: ${this.projectId}, StageId: ${this.stageId}`)
        
        this.loadingRankings = true
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          console.warn('沒有找到 sessionId，無法載入排名')
          return
        }
        
        const projectId = this.projectId
        
        console.log('開始調用 API 獲取排名...')
        // 先嘗試載入舊的評論排名 API (投票期間使用)
        const response = await this.$apiClient.getStageCommentRankings(
          projectId,
          this.stageId
        )
        
        console.log('投票排名 API 響應:', response)
        
        if (response.success && response.data) {
          console.log('收到投票排名數據:', response.data)
          this.commentRankings = response.data
          
          // 更新評論的排名信息
          console.log('開始更新評論的投票排名信息...')
          console.log(`當前評論數: ${this.comments.length}`)
          
          this.comments = this.comments.map(comment => {
            const rankings = this.commentRankings[comment.commentId] || {}
            console.log(`評論 ${comment.commentId} 的投票排名:`, rankings)
            
            return {
              ...comment,
              settlementRank: rankings.settlementRank || null,
              userVoteRank: rankings.userVoteRank || null,
              teacherVoteRank: rankings.teacherVoteRank || null
            }
          })
          
          console.log('投票排名更新完成')
        } else {
          console.error('投票排名載入失敗:', response)
        }
        
        // 如果階段已結算，載入結算排名數據
        if (this.stageStatus === 'completed') {
          try {
            console.log('開始調用結算排名 API...')
            const settlementResponse = await this.$apiClient.callWithAuth('/scoring/settlement/comment-rankings', {
              projectId: projectId,
              stageId: this.stageId
            })
            
            console.log('結算排名 API 響應:', settlementResponse)
            
            if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
              const settlementRankings = settlementResponse.data.rankings
              console.log('收到結算排名數據:', settlementRankings)
              
              // 更新評論的結算排名
              this.comments = this.comments.map(comment => {
                const settlementData = settlementRankings[comment.commentId]
                if (settlementData) {
                  console.log(`評論 ${comment.commentId} 的結算排名: ${settlementData.finalRank}`)
                  return {
                    ...comment,
                    settlementRank: settlementData.finalRank
                  }
                }
                return comment
              })
              
              console.log('結算排名更新完成')
            } else {
              console.log('階段尚未結算或無結算排名數據:', settlementResponse)
            }
          } catch (settlementError) {
            console.error('載入結算排名失敗:', settlementError)
          }
        }
        
        console.log('最終更新後的評論:', this.comments)
      } catch (error) {
        console.error('Error loading comment rankings:', error)
      } finally {
        this.loadingRankings = false
        console.log('=== StageComments.loadCommentRankings 結束 ===')
      }
    },
    
    // 供父組件調用的刷新方法
    async refreshComments() {
      await this.loadStageComments()
    },
    
    // 移除重複的apiCall方法，統一使用$apiClient
  }
}
</script>

<style scoped>
.stage-comments {
  margin-top: 20px;
  min-height: 150px; /* 與報告列表保持一致的最小高度 */
}

.no-comments {
  text-align: center;
  color: #999;
  padding: 40px;
  font-style: italic;
}

.comment-item {
  background: #fff;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  margin-bottom: 15px;
  padding: 0;
  overflow: hidden;
}

/* 評論狀態指示條 */
.comment-status-bar {
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.comment-status-bar.teacher-comment {
  background: #e8f5e8;
  border-bottom-color: #d4edda;
}

/* 排名標籤組 - 類似Element Plus radio group風格 */
.ranking-badges {
  display: inline-flex;
  align-items: center;
  gap: 0;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 1px;
  overflow: hidden;
}

/* 狀態指示標籤 - radio button style */
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  border: none;
  border-radius: 0;
  transition: all 0.2s;
  min-width: 90px;
  position: relative;
  cursor: default;
}

.status-badge:first-child {
  border-radius: 5px 0 0 5px;
}

.status-badge:last-child {
  border-radius: 0 5px 5px 0;
}

.status-badge:only-child {
  border-radius: 5px;
}

.status-badge.settlement {
  background-color: #111;
  color: white;
}

.status-badge.user-vote {
  background-color: #333;
  color: white;
}

.status-badge.teacher-vote {
  background-color: #333;
  color: white;
}

/* 老師評論的特殊標籤樣式 */
.status-badge.teacher-label {
  background-color: #059669;
  color: #ecfdf5;
  font-weight: 600;
}

/* 回覆按鈕 - 與排名指示牌統一高度 */
.reply-button {
  background-color: #047857;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 0;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 90px;
  height: 32px; /* 與status-badge相同高度 */
  border-radius: 5px;
}

.reply-button:hover {
  background-color: #065f46;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(4, 120, 87, 0.3);
}

.reply-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(4, 120, 87, 0.2);
}

.reply-button i {
  font-size: 12px;
}

/* 已移除舊的 teacher-label el-tag 樣式，改用 status-badge 樣式 */

/* 更新評論頭部和內容的padding */
.comment-header {
  padding: 15px 20px 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.comment-content {
  padding: 0 20px 10px 20px;
  line-height: 1.5;
  margin-bottom: 10px;
}

.mentions {
  padding: 0 20px 15px 20px;
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.replies {
  margin: 15px 20px 15px 20px;
  border-top: 1px solid #f0f0f0;
  padding-top: 15px;
}

.comment-author {
  font-weight: 600;
  color: #2c3e50;
}

.comment-time {
  font-size: 12px;
  color: #7f8c8d;
}


.mentioned-group, .mentioned-user {
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.replies {
  margin-top: 15px;
  border-top: 1px solid #f0f0f0;
  padding-top: 15px;
}

.reply-item {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 10px 15px;
  margin-bottom: 10px;
}

.reply-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.reply-author {
  font-weight: 500;
  color: #495057;
  font-size: 14px;
}

.reply-time {
  font-size: 11px;
  color: #999;
}

.reply-content {
  font-size: 14px;
  line-height: 1.4;
}

/* @mention 高亮樣式 */
.comment-content :deep(.mention) {
  background: #e8f5e8;
  color: #2e7d2e;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

/* Markdown 元素樣式 */
.comment-content :deep(h1),
.comment-content :deep(h2),
.comment-content :deep(h3) {
  margin: 16px 0 8px 0;
  color: #2c3e50;
}

.comment-content :deep(h1) {
  font-size: 20px;
  border-bottom: 2px solid #e1e8ed;
  padding-bottom: 6px;
}

.comment-content :deep(h2) {
  font-size: 18px;
  border-bottom: 1px solid #e1e8ed;
  padding-bottom: 4px;
}

.comment-content :deep(h3) {
  font-size: 16px;
}

.comment-content :deep(strong) {
  font-weight: 600;
}

.comment-content :deep(em) {
  font-style: italic;
}

.comment-content :deep(code) {
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.comment-content :deep(pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 12px 0;
}

.comment-content :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
}

.comment-content :deep(a) {
  color: #007bff;
  text-decoration: none;
}

.comment-content :deep(a:hover) {
  text-decoration: underline;
}

/* Reply content markdown styles */
.reply-content :deep(.mention) {
  background: #e8f5e8;
  color: #2e7d2e;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.reply-content :deep(strong) {
  font-weight: 600;
}

.reply-content :deep(em) {
  font-style: italic;
}

.reply-content :deep(code) {
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.reply-content :deep(a) {
  color: #007bff;
  text-decoration: none;
}

.reply-content :deep(a:hover) {
  text-decoration: underline;
}
</style>