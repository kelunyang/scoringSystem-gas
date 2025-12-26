<template>
  <div class="comment-vote-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop v-loading="loading" element-loading-text="載入評論資料中...">
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">評論投票</h2>
        <button class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- 說明文字 -->
      <div class="info-banner">
        請選出你覺得最適合當作優良評論的前{{ maxSelections }}名。您可以多次投票，系統會採用您最新的投票結果。
      </div>
      
      <!-- 同作者限制提示 -->
      <el-alert
        v-if="showAuthorLimitAlert"
        title="同作者的評論只能選一個送入排序"
        type="warning"
        :closable="true"
        @close="showAuthorLimitAlert = false"
        style="margin: 15px 25px;"
      />

      <!-- 投票資格檢查 -->
      <div v-if="loadingEligibility" class="eligibility-banner loading">
        <div class="loading-spinner"></div>
        正在檢查投票資格...
      </div>
      
      <div v-else-if="votingEligibility && !votingEligibility.canVote" class="eligibility-banner error">
        <div class="error-icon">🚫</div>
        <div class="error-content">
          <div class="error-title">無法投票</div>
          <div class="error-message">{{ votingEligibility.message }}</div>
          <div v-if="!votingEligibility.hasMentionedGroup" class="error-hint">
            💡 在評論中使用 @第一組、@第二組 等方式提及組別即可獲得投票資格
          </div>
        </div>
      </div>
      
      <div v-else-if="votingEligibility && votingEligibility.canVote" class="eligibility-banner success">
        <div class="success-icon">✅</div>
        <div class="success-content">
          <div class="success-title">您有投票資格</div>
          <div class="success-message">已在評論中提及 {{ votingEligibility.groupMentionCount }} 個組別</div>
          <div v-if="votingEligibility.hasVoted" class="vote-history">
            💡 您已經於 {{ formatVoteTime(votingEligibility.lastVoteTime) }} 投過票了 (共 {{ votingEligibility.voteCount }} 次)
          </div>
        </div>
      </div>

      <!-- Transfer 風格的選擇和排序區域 -->
      <div class="transfer-container">
        <!-- 左側：可選評論列表 -->
        <div class="transfer-panel left-panel">
          <div class="panel-header">
            <h3>可選評論 ({{ availableComments.length }})</h3>
          </div>
          <el-alert
            v-if="hasDisabledComments"
            title="為了公平起見，如果一個用戶有多個評論，你只能從中挑選一個"
            type="info"
            :closable="false"
            style="margin: 10px 10px 0 10px; font-size: 12px;"
          />
          <div class="panel-body">
            <div 
              v-for="comment in availableComments" 
              :key="comment.id"
              class="comment-item"
              :class="{ 'disabled': isAuthorAlreadySelected(comment) }"
              @click="moveToSelected(comment)"
            >
              <div class="comment-content">
                <div class="comment-preview">{{ comment.content }}</div>
                <div class="comment-meta">
                  來自 {{ comment.author }} · {{ formatTime(comment.timestamp) }}
                </div>
              </div>
              <div class="move-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
            <div v-if="availableComments.length === 0" class="empty-state">
              所有評論都已選擇
            </div>
          </div>
        </div>

        <!-- 中間：操作按鈕 -->
        <div class="transfer-actions">
          <button 
            class="action-btn"
            @click="moveAllToSelected"
            :disabled="availableComments.length === 0 || selectedComments.length >= maxSelections"
            title="全部移到右邊"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 17L18 12L13 7M6 17L11 12L6 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button 
            class="action-btn"
            @click="moveAllToAvailable"
            :disabled="selectedComments.length === 0"
            title="全部移到左邊"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M11 17L6 12L11 7M18 17L13 12L18 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- 右側：已選評論列表（可排序） -->
        <div class="transfer-panel right-panel">
          <div class="panel-header">
            <h3>已選評論排序 ({{ selectedComments.length }}/{{ maxSelections }})</h3>
            <span class="ranking-hint">拖拽排序，第1名在最上方</span>
          </div>
          <div class="panel-body">
            <div 
              v-for="(comment, index) in selectedComments" 
              :key="comment.id"
              class="comment-item selected-item"
              :class="{ dragging: draggedIndex === index }"
              draggable="true"
              @dragstart="handleDragStart(index, $event)"
              @dragover.prevent="handleDragOver(index)"
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
            >
              <div class="ranking-number">{{ index + 1 }}</div>
              <div class="comment-content">
                <div class="comment-preview">{{ comment.content }}</div>
                <div class="comment-meta">
                  來自 {{ comment.author }} · {{ formatTime(comment.timestamp) }}
                </div>
              </div>
              <div class="item-actions">
                <button 
                  class="action-btn small"
                  @click="moveUp(index)"
                  :disabled="index === 0"
                  title="上移"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 15L12 9L6 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button 
                  class="action-btn small"
                  @click="moveDown(index)"
                  :disabled="index === selectedComments.length - 1"
                  title="下移"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button 
                  class="action-btn small remove"
                  @click="moveToAvailable(comment)"
                  title="移除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="selectedComments.length === 0" class="empty-state">
              請從左邊選擇評論
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="modal-actions">
        <button 
          class="btn btn-primary" 
          @click="submitVote" 
          :disabled="!canSubmit"
        >
          <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
          {{ submitting ? '送出中...' : '送出投票' }}
        </button>
        <button class="btn btn-secondary" @click="clearAll">
          清除重選
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CommentVoteModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    projectId: {
      type: String,
      required: true
    },
    stageId: {
      type: String,
      required: true
    },
    maxSelections: {
      type: Number,
      default: 3
    },
    comments: {
      type: Array,
      default: () => [
        {
          id: 'comment1',
          content: '這是評論摘錄20字...這是一個非常棒的專案成果，展現了團隊的創新思維和執行能力。',
          author: '張同學',
          timestamp: '2025/02/01 08:09 AM',
          fullContent: '這是一個非常棒的專案成果，展現了團隊的創新思維和執行能力。他們在技術實現上有很多亮點。'
        },
        {
          id: 'comment2', 
          content: '這是評論摘錄20字...我認為這個方案在實用性方面還有提升空間，建議可以增加更多用戶反饋機制。',
          author: '李同學',
          timestamp: '2025/02/01 09:15 AM',
          fullContent: '我認為這個方案在實用性方面還有提升空間，建議可以增加更多用戶反饋機制，讓產品更貼近使用者需求。'
        },
        {
          id: 'comment3',
          content: '這是評論摘錄20字...整體設計很有創意，但在技術細節的處理上可以更加細緻。',
          author: '王同學', 
          timestamp: '2025/02/01 10:30 AM',
          fullContent: '整體設計很有創意，但在技術細節的處理上可以更加細緻，特別是在用戶界面的優化方面。'
        },
        {
          id: 'comment4',
          content: '這是評論摘錄20字...專案的創新點很突出，執行過程也很專業，值得學習。',
          author: '陳同學',
          timestamp: '2025/02/01 11:45 AM', 
          fullContent: '專案的創新點很突出，執行過程也很專業，值得學習。團隊合作的默契度很高。'
        },
        {
          id: 'comment5',
          content: '這是評論摘錄20字...建議在未來版本中加入更多的功能擴展，提升整體的實用價值。',
          author: '劉同學',
          timestamp: '2025/02/01 12:20 PM',
          fullContent: '建議在未來版本中加入更多的功能擴展，提升整體的實用價值，讓產品更具競爭力。'
        }
      ]
    }
  },
  data() {
    return {
      loading: false,
      submitting: false,
      availableComments: [],
      selectedComments: [],
      draggedIndex: null,
      dragOverIndex: null,
      votingEligibility: null,
      loadingEligibility: false,
      showAuthorLimitAlert: false
    }
  },
  computed: {
    canSubmit() {
      return this.selectedComments.length > 0 && 
             this.votingEligibility && 
             this.votingEligibility.canVote &&
             !this.submitting
    },
    
    isEligibleToVote() {
      return this.votingEligibility && this.votingEligibility.canVote
    },
    
    hasDisabledComments() {
      // 檢查是否有任何評論因為同作者限制而被禁用
      return this.availableComments.some(comment => this.isAuthorAlreadySelected(comment))
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.loadStageComments()
        this.checkVotingEligibility()
      }
    },
    comments: {
      handler() {
        this.initializeComments()
        // 如果modal是開啟的，重新檢查投票資格
        if (this.visible) {
          this.checkVotingEligibility()
        }
      },
      immediate: true
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },
    
    async checkVotingEligibility() {
      this.loadingEligibility = true
      try {
        if (!this.projectId) {
          this.votingEligibility = { canVote: false, message: '缺少專案ID' }
          return
        }
        
        const response = await this.$apiClient.checkUserVotingEligibility(this.projectId, this.stageId)
        
        if (response.success && response.data) {
          this.votingEligibility = response.data
        } else {
          this.votingEligibility = { 
            canVote: false, 
            message: response.error?.message || '檢查投票資格失敗' 
          }
        }
      } catch (error) {
        console.error('檢查投票資格錯誤:', error)
        this.votingEligibility = { canVote: false, message: '網路錯誤，請重試' }
      } finally {
        this.loadingEligibility = false
      }
    },
    
    async loadStageComments() {
      try {
        if (!this.projectId) return
        
        this.loading = true
        
        const response = await this.$apiClient.getStageComments(this.projectId, this.stageId, true)
        
        if (response.success && response.data) {
          // 轉換為投票需要的格式
          const comments = response.data
            .filter(comment => comment.mentionedGroups && 
                   (typeof comment.mentionedGroups === 'string' ? 
                    JSON.parse(comment.mentionedGroups).length > 0 : 
                    comment.mentionedGroups.length > 0))
            .map(comment => ({
              id: comment.commentId,
              content: comment.content.substring(0, 50) + (comment.content.length > 50 ? '...' : ''),
              fullContent: comment.content,
              author: comment.authorName || comment.authorEmail,
              authorEmail: comment.authorEmail,
              timestamp: new Date(comment.createdTime).toLocaleString('zh-TW')
            }))
          
          this.initializeComments(comments)
        }
      } catch (error) {
        console.error('載入評論失敗:', error)
        this.$message.error('載入評論資料失敗')
        this.initializeComments([])
      } finally {
        this.loading = false
      }
    },
    
    initializeComments(commentsData = null) {
      // 重置狀態
      const comments = commentsData || this.comments
      
      // 過濾掉自己的評論 - 不允許自投
      const currentUserEmail = this.getCurrentUserEmail()
      const filteredComments = comments.filter(comment => {
        // 檢查評論作者是否為當前用戶
        const commentAuthor = comment.authorEmail || comment.author
        return commentAuthor !== currentUserEmail
      })
      
      this.availableComments = [...filteredComments]
      this.selectedComments = []
    },
    
    moveToSelected(comment) {
      if (this.selectedComments.length >= this.maxSelections) return
      
      // 檢查是否已經選擇了同作者的評論
      if (this.isAuthorAlreadySelected(comment)) {
        this.showAuthorLimitAlert = true
        return
      }
      
      // 從可選列表移到已選列表
      this.availableComments = this.availableComments.filter(c => c.id !== comment.id)
      this.selectedComments.push(comment)
    },
    
    moveToAvailable(comment) {
      // 從已選列表移回可選列表
      this.selectedComments = this.selectedComments.filter(c => c.id !== comment.id)
      this.availableComments.push(comment)
    },
    
    moveAllToSelected() {
      const canMove = Math.min(this.availableComments.length, this.maxSelections - this.selectedComments.length)
      const toMove = this.availableComments.splice(0, canMove)
      this.selectedComments.push(...toMove)
    },
    
    moveAllToAvailable() {
      this.availableComments.push(...this.selectedComments)
      this.selectedComments = []
    },
    
    moveUp(index) {
      if (index <= 0) return
      const item = this.selectedComments.splice(index, 1)[0]
      this.selectedComments.splice(index - 1, 0, item)
    },
    
    moveDown(index) {
      if (index >= this.selectedComments.length - 1) return
      const item = this.selectedComments.splice(index, 1)[0]
      this.selectedComments.splice(index + 1, 0, item)
    },
    
    // 拖拽排序功能
    handleDragStart(index, event) {
      this.draggedIndex = index
      event.dataTransfer.effectAllowed = 'move'
    },
    
    handleDragOver(index) {
      this.dragOverIndex = index
    },
    
    handleDrop(index) {
      if (this.draggedIndex === null) return
      
      const draggedItem = this.selectedComments[this.draggedIndex]
      
      // 移除拖拽的項目
      this.selectedComments.splice(this.draggedIndex, 1)
      
      // 插入到新位置
      if (index > this.draggedIndex) {
        this.selectedComments.splice(index - 1, 0, draggedItem)
      } else {
        this.selectedComments.splice(index, 0, draggedItem)
      }
      
      this.draggedIndex = null
      this.dragOverIndex = null
    },
    
    handleDragEnd() {
      this.draggedIndex = null
      this.dragOverIndex = null
    },
    
    formatTime(timestamp) {
      return timestamp
    },
    
    formatVoteTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
    },
    
    async submitVote() {
      if (!this.canSubmit) return
      
      this.submitting = true
      
      try {
        const sessionId = localStorage.getItem('sessionId')
        if (!sessionId) {
          alert('Session 已過期，請重新登入')
          return
        }
        
        if (!this.projectId) {
          alert('缺少專案ID')
          return
        }
        
        const rankingData = this.selectedComments.map((comment, index) => ({
          commentId: comment.id,
          rank: index + 1,
          content: comment.content.substring(0, 100) // For reference
        }))
        
        const voteData = {
          sessionId,
          projectId: this.projectId,
          stageId: this.stageId,
          rankingData: rankingData
        }
        
        const response = await this.$apiClient.submitCommentRanking(
          this.projectId,
          this.stageId,
          rankingData
        )
        
        if (response.success) {
          // 成功後通知父組件並關閉彈窗
          this.$emit('vote-submitted', { 
            success: true, 
            data: response.data,
            rankedComments: this.selectedComments 
          })
          this.handleClose()
        } else {
          alert(`投票失敗：${response.error?.message || '未知錯誤'}`)
        }
      } catch (error) {
        console.error('投票錯誤:', error)
        alert('網路錯誤，請重試')
      } finally {
        this.submitting = false
      }
    },
    
    clearAll() {
      this.initializeComments()
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
      
      return null
    },
    
    isAuthorAlreadySelected(comment) {
      // 檢查已選擇的評論中是否有同作者的評論
      const commentAuthor = comment.authorEmail || comment.author
      return this.selectedComments.some(selected => {
        const selectedAuthor = selected.authorEmail || selected.author
        return selectedAuthor === commentAuthor
      })
    }
  }
}
</script>

<style scoped>
.comment-vote-modal {
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
  display: flex;
  flex-direction: column;
}

/* 桌面端也使用100%全屏 */

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
  background: #2c3e50;
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px 12px 0 0;
  flex-shrink: 0;
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

.info-banner {
  background: #fff3cd;
  color: #856404;
  padding: 15px 20px;
  margin: 20px 25px;
  border-radius: 6px;
  border: 1px solid #ffeaa7;
  line-height: 1.5;
  font-size: 14px;
  flex-shrink: 0;
}

.eligibility-banner {
  margin: 20px 25px;
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  animation: fadeIn 0.3s ease-out;
  flex-shrink: 0;
}

.eligibility-banner.loading {
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
}

.eligibility-banner.error {
  background: linear-gradient(135deg, #ffebee, #ffcdd2);
  border: 1px solid #f48fb1;
  color: #c62828;
}

.eligibility-banner.success {
  background: linear-gradient(135deg, #e8f5e8, #c8e6c9);
  border: 1px solid #81c784;
  color: #2e7d32;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top: 2px solid #666;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.error-icon, .success-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.error-content, .success-content {
  flex: 1;
}

.error-title, .success-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.error-message, .success-message {
  font-size: 13px;
  margin-bottom: 6px;
}

.error-hint {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #ff9800;
}

.vote-history {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.5);
  padding: 8px;
  margin-top: 8px;
  border-radius: 4px;
  border-left: 3px solid #4caf50;
  color: #1976d2;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.transfer-container {
  display: flex;
  gap: 20px;
  padding: 0 25px;
  flex: 1;
  min-height: 0;
}

.transfer-panel {
  flex: 1;
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.panel-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.ranking-hint {
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 4px;
  display: block;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.comment-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  margin-bottom: 8px;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  background: white;
}

.comment-item:hover:not(.selected-item):not(.disabled) {
  border-color: #3498db;
  background: #f0f8ff;
  transform: translateX(2px);
}

.comment-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
}

.comment-item.disabled:hover {
  border-color: #e1e8ed;
  transform: none;
}

.selected-item {
  border-color: #28a745;
  background: #f8fff9;
  cursor: grab;
}

.selected-item:active {
  cursor: grabbing;
}

.selected-item.dragging {
  opacity: 0.5;
  transform: rotate(2deg);
}

.comment-content {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.comment-preview {
  font-size: 14px;
  line-height: 1.4;
  color: #2c3e50;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.comment-meta {
  font-size: 11px;
  color: #7f8c8d;
}

.move-btn {
  color: #666;
  padding: 4px;
}

.ranking-number {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  margin-right: 12px;
  flex-shrink: 0;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transfer-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 20px 0;
}

.action-btn {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #2c3e50;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.small {
  padding: 4px;
  min-width: 24px;
  height: 24px;
}

.action-btn.remove {
  color: #dc3545;
}

.action-btn.remove:hover:not(:disabled) {
  background: #f8d7da;
  border-color: #dc3545;
}

.empty-state {
  text-align: center;
  color: #7f8c8d;
  padding: 40px 20px;
  font-style: italic;
}

.modal-actions {
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  border-top: 1px solid #e1e8ed;
  flex-shrink: 0;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 120px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}

.btn-secondary {
  background: #dc3545;
  color: white;
}

.btn-secondary:hover {
  background: #c82333;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .transfer-container {
    flex-direction: column;
    gap: 15px;
  }
  
  .transfer-actions {
    flex-direction: row;
    justify-content: center;
  }
  
  .comment-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .item-actions {
    flex-direction: row;
    width: 100%;
    justify-content: flex-end;
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
}
</style>