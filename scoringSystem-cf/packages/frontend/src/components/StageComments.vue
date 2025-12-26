<template>
  <div class="stage-comments" v-loading="loading" element-loading-text="載入評論中...">
    <EmptyState
      v-if="comments.length === 0 && !loading"
      parent-icon="fa-comments"
      :icons="['fa-comment']"
      title="目前沒有評論"
      :compact="true"
      :enable-animation="false"
    />
    
    <!-- 評論列表 -->
    <div v-for="comment in comments" :key="comment.id" class="comment-item">
      <!-- 評論排名狀態指示區 -->
      <div class="comment-status-bar" v-if="!comment.isTeacherComment">
        <!-- Active 階段：顯示資格狀態（三種狀態） -->
        <div v-if="stageStatus === 'active'" class="ranking-badges">
          <div class="eligibility-postit" :class="{
            'confirmed': commentHasHelpfulReaction(comment),
            'pending': commentHasMentions(comment),
            'not-eligible': !commentHasHelpfulReaction(comment) && !commentHasMentions(comment)
          }">
            <!-- 狀態 1：已獲得 helpful reaction，確認納入排名 (綠色區塊) -->
            <div v-if="commentHasHelpfulReaction(comment)" class="status-indicator-postit confirmed">
              <i class="fas fa-check-circle"></i>
            </div>

            <!-- 狀態 2：有 mentions 但還沒 helpful，等待認可 (橙色區塊) -->
            <div v-else-if="commentHasMentions(comment)" class="status-indicator-postit pending">
              <i class="fas fa-clock"></i>
            </div>

            <!-- 狀態 3：完全不符合 (灰色區塊) -->
            <div v-else class="status-indicator-postit not-eligible">
              <i class="fas fa-times-circle"></i>
            </div>

            <!-- 文字說明 -->
            <div class="status-text-postit">
              <span v-if="commentHasHelpfulReaction(comment)">已納入評論排名</span>
              <span v-else-if="commentHasMentions(comment)">只要被@的人認可就會納入評論排名</span>
              <span v-else>不具有評論排名資格</span>
            </div>
          </div>
        </div>

        <!-- Voting 階段：只對有資格的評論顯示排名 -->
        <div v-if="stageStatus === 'voting' && commentHasHelpfulReaction(comment)" class="ranking-badges">
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

          <!-- Reaction 統計 -->
          <div class="status-badge reaction-stat helpful">
            <i class="fas fa-thumbs-up"></i>
            {{ getReactionCount(comment, 'helpful') }}
          </div>
          <div class="status-badge reaction-stat disagreed">
            <i class="fas fa-thumbs-down"></i>
            {{ getReactionCount(comment, 'disagreed') }}
          </div>
        </div>

        <!-- Completed 階段：只對有資格的評論顯示最終結果 -->
        <div v-if="stageStatus === 'completed' && commentHasHelpfulReaction(comment)" class="ranking-badges">
          <div class="status-badge final-rank">
            最終排名第
            <i v-if="loadingRankings" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ comment.finalRank || '-' }}</span>
            名
          </div>
          <div class="status-badge allocated-points">
            獲得了
            <i v-if="loadingRankings" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ comment.allocatedPoints || '-' }}</span>
            點
          </div>

          <!-- Reaction 統計 -->
          <div class="status-badge reaction-stat helpful">
            <i class="fas fa-thumbs-up"></i>
            {{ getReactionCount(comment, 'helpful') }}
          </div>
          <div class="status-badge reaction-stat disagreed">
            <i class="fas fa-thumbs-down"></i>
            {{ getReactionCount(comment, 'disagreed') }}
          </div>
        </div>

        <!-- 右側：合併的綠色按鈕組 -->
        <div class="action-buttons">
          <!-- 回覆按鈕 -->
          <button
            v-if="canReplyToComment(comment)"
            class="action-btn reply-btn"
            @click="handleReplyClick(comment)"
          >
            <i class="fas fa-reply"></i>
            <span class="btn-text">{{ getReplyButtonText(comment) }}</span>
          </button>

          <!-- Reaction 按鈕：有幫助 (僅在 active 階段顯示) -->
          <button
            v-if="stageStatus === 'active' && canReactToComment(comment)"
            class="action-btn reaction-btn"
            :class="{ 'active': getCommentUserReaction(comment) === 'helpful' }"
            @click="handleReaction(comment, 'helpful')"
          >
            <el-badge
              :value="getReactionCount(comment, 'helpful')"
              :hidden="getReactionCount(comment, 'helpful') === 0"
              :max="99"
            >
              <i class="fas fa-thumbs-up"></i>
              <span>說得好！</span>
            </el-badge>
          </button>

          <!-- Reaction 按鈕：不實用 (僅在 active 階段顯示) -->
          <button
            v-if="stageStatus === 'active' && canReactToComment(comment)"
            class="action-btn reaction-btn"
            :class="{ 'active': getCommentUserReaction(comment) === 'disagreed' }"
            @click="handleReaction(comment, 'disagreed')"
          >
            <el-badge
              :value="getReactionCount(comment, 'disagreed')"
              :hidden="getReactionCount(comment, 'disagreed') === 0"
              :max="99"
            >
              <i class="fas fa-thumbs-down"></i>
              <span>別亂講！</span>
            </el-badge>
          </button>
        </div>
      </div>
      
      <!-- 教師評論標記 -->
      <div class="comment-status-bar teacher-comment" v-if="comment.isTeacherComment">
        <div class="ranking-badges">
          <div class="status-badge teacher-label">
            老師的評論
          </div>
        </div>
        <div class="action-buttons">
          <button
            v-if="canReplyToComment(comment)"
            class="action-btn reply-btn"
            @click="handleReplyClick(comment)"
          >
            <i class="fas fa-reply"></i>
            <span class="btn-text">{{ getReplyButtonText(comment) }}</span>
          </button>
        </div>
      </div>

      <div class="comment-header">
        <div class="comment-author-info">
          <img :src="getAuthorAvatarUrl(comment)" class="author-avatar" :alt="comment.authorName" />
          <span class="comment-author">{{ comment.authorName }}({{ comment.author }})</span>
        </div>
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
            <div class="reply-author-info">
              <img :src="getAuthorAvatarUrl(reply)" class="reply-avatar" :alt="reply.authorName" />
              <span class="reply-author">{{ reply.authorName || reply.author }}</span>
            </div>
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
import { computed } from 'vue'
import { ElBadge, ElMessage } from 'element-plus'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useProjectRole } from '@/composables/useProjectRole'
import { getNumericPermissionLevel } from '@/composables/useProjectPermissions'
import { rpcClient } from '@/utils/rpc-client'
import { generateAvatarUrl } from '@/utils/walletHelpers'

export default {
  name: 'StageComments',
  components: {
    EmptyState
  },
  props: {
    stageId: {
      type: String,
      required: true
    },
    projectId: {
      type: String,
      required: true
    },
    userEmailToDisplayName: {
      type: Object,
      default: () => ({})
    },
    currentUserEmail: {
      type: String,
      default: ''
    },
    currentUserGroupId: {
      type: String,
      default: ''
    },
    stageStatus: {
      type: String,
      default: ''
    },
    permissionLevel: {
      type: [Number, String], // Accept both number and string
      default: null
    },
    projectGroups: {
      type: Array,
      default: () => []
    }
  },
  setup(props) {
    // Convert permission level to numeric format for backward compatibility
    const numericPermissionLevel = computed(() => {
      if (typeof props.permissionLevel === 'number') {
        return props.permissionLevel
      }
      if (typeof props.permissionLevel === 'string') {
        return getNumericPermissionLevel(props.permissionLevel)
      }
      return null
    })

    return {
      numericPermissionLevel
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
        // Vue 3 Best Practice: rpcClient automatically handles authentication

        // 從props獲取projectId
        const projectId = this.projectId

        console.log('開始調用 API 獲取評論...')
        const httpResponse = await rpcClient.comments.stage.$post({
          json: {
            projectId: projectId,
            stageId: this.stageId,
            excludeTeachers: false
          }
        })
        const response = await httpResponse.json()

        console.log('評論 API 響應:', response)

        if (response.success && response.data) {
          // Extract comments from nested response structure
          const comments = response.data.comments || []
          console.log(`獲取到 ${comments.length} 條評論`)
          this.comments = this.processCommentsData(comments)
          // Store metadata
          this.totalComments = response.data.total || 0
          this.votingEligible = response.data.votingEligible || false
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
            authorName: reply.authorName || reply.displayName || (reply.authorEmail || reply.author || '').split('@')[0],
            avatarSeed: reply.authorAvatarSeed,
            avatarStyle: reply.authorAvatarStyle,
            avatarOptions: reply.authorAvatarOptions,
            mentionedUsers: reply.mentionedUsers || [],
            mentionedGroups: reply.mentionedGroups || []
          }))
        }
        
        // 檢查是否為教師評論 (使用後端回傳的 authorRole)
        const isTeacherComment = comment.authorRole === 'teacher'

        return {
          id: comment.commentId || comment.id,
          commentId: comment.commentId || comment.id, // 確保有commentId供回復使用
          content: comment.content,
          timestamp: this.formatTime(comment.createdTime),
          author: comment.authorEmail || comment.author,
          authorName: comment.authorName || comment.authorEmail || comment.author,
          avatarSeed: comment.authorAvatarSeed,
          avatarStyle: comment.authorAvatarStyle,
          avatarOptions: comment.authorAvatarOptions,
          authorRole: comment.authorRole || null, // 保存完整的 role 資訊
          mentionedUsers: mentionedUsers.map(email => {
            const displayName = this.userEmailToDisplayName[email] || email.split('@')[0]
            return `${displayName}(${email})`
          }),
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
          teacherVoteRank: comment.teacherVoteRank || null,
          // 結算相關數據
          finalRank: comment.finalRank || null,
          allocatedPoints: comment.allocatedPoints || null,
          // Reaction 相關數據
          reactions: comment.reactions || [],  // [{type, count, users[]}]
          userReaction: comment.userReaction || null,  // 'helpful' | 'disagreed' | null
          reactionUsers: comment.reactionUsers || []  // 可以投 reaction 的用戶列表
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
        const emailPrefix = email.split('@')[0]

        // 如果找到 displayName 且不同於 email 前綴，顯示完整格式
        if (friendlyName !== emailPrefix) {
          return `<span class="mention">@${friendlyName}(${email})</span>`
        } else {
          // 否則只顯示 email
          return `<span class="mention">@${email}</span>`
        }
      })
      
      return html
    },
    
    getEmailDisplayName(email) {
      return this.userEmailToDisplayName[email] || email.split('@')[0]
    },

    convertGroupIdsToNames(groupIds) {
      if (!Array.isArray(groupIds)) return []

      return groupIds.map(groupId => {
        // 從 prop 中獲取群組名稱
        const group = this.projectGroups.find(g => g.groupId === groupId)
        if (group) {
          return group.groupName || group.name || groupId
        }

        // 如果找不到，返回原始的 groupId
        return groupId
      })
    },
    
    formatTime(timestamp) {
      if (!timestamp) return ''
      return new Date(timestamp).toLocaleString('zh-TW')
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
        content: comment.content,
        mentionedGroups: comment.mentionedGroups,
        mentionedUsers: comment.mentionedUsers
      })
    },
    
    canReplyToComment(comment) {
      if (!this.currentUserEmail) {
        return false
      }

      // Level 1 (Teacher) can always reply
      // Note: Level 0 (Global Admin) does NOT participate in project interactions
      if (this.numericPermissionLevel === 1) {
        return true
      }

      // Level 3 (Student) permission check: can only reply when stage.status = 'active'
      if (this.stageStatus !== 'active') {
        return false
      }

      // If comment author, can reply to own comment (but still needs stage to be active)
      if (comment.author === this.currentUserEmail) {
        return true
      }

      // If not author, check if mentioned (@) - only check direct user mentions
      const isMentionedDirectly = comment.rawMentionedUsers?.includes(this.currentUserEmail)

      return isMentionedDirectly
    },
    
    getReplyButtonText(comment) {
      if (!this.currentUserEmail) {
        return '回覆'
      }

      // Level 1 (Teacher)
      if (this.numericPermissionLevel === 1) {
        return '教師回復'
      }

      // If comment author
      if (comment.author === this.currentUserEmail) {
        return '回復自己的評論'
      }

      // If mentioned
      return '被@到‧回覆'
    },

    isCommentEligible(comment) {
      // 檢查 mentionedGroups
      let hasGroups = false
      if (comment.rawMentionedGroups) {
        hasGroups = Array.isArray(comment.rawMentionedGroups) && comment.rawMentionedGroups.length > 0
      } else if (comment.mentionedGroups) {
        try {
          const groups = typeof comment.mentionedGroups === 'string'
            ? JSON.parse(comment.mentionedGroups)
            : comment.mentionedGroups
          hasGroups = Array.isArray(groups) && groups.length > 0
        } catch (e) {
          hasGroups = false
        }
      }

      // 檢查 mentionedUsers
      let hasUsers = false
      if (comment.rawMentionedUsers) {
        hasUsers = Array.isArray(comment.rawMentionedUsers) && comment.rawMentionedUsers.length > 0
      } else if (comment.mentionedUsers) {
        try {
          const users = typeof comment.mentionedUsers === 'string'
            ? JSON.parse(comment.mentionedUsers)
            : comment.mentionedUsers
          hasUsers = Array.isArray(users) && users.length > 0
        } catch (e) {
          hasUsers = false
        }
      }

      // 至少要有一個不為空
      return hasGroups || hasUsers
    },

    // 檢查評論是否有 mentions（被 @ 了組別或用戶）
    commentHasMentions(comment) {
      // 檢查 mentionedGroups
      let hasGroups = false
      if (comment.rawMentionedGroups) {
        hasGroups = Array.isArray(comment.rawMentionedGroups) && comment.rawMentionedGroups.length > 0
      } else if (comment.mentionedGroups) {
        try {
          const groups = typeof comment.mentionedGroups === 'string'
            ? JSON.parse(comment.mentionedGroups)
            : comment.mentionedGroups
          hasGroups = Array.isArray(groups) && groups.length > 0
        } catch (e) {
          hasGroups = false
        }
      }

      // 檢查 mentionedUsers
      let hasUsers = false
      if (comment.rawMentionedUsers) {
        hasUsers = Array.isArray(comment.rawMentionedUsers) && comment.rawMentionedUsers.length > 0
      } else if (comment.mentionedUsers) {
        try {
          const users = typeof comment.mentionedUsers === 'string'
            ? JSON.parse(comment.mentionedUsers)
            : comment.mentionedUsers
          hasUsers = Array.isArray(users) && users.length > 0
        } catch (e) {
          hasUsers = false
        }
      }

      return hasGroups || hasUsers
    },

    // 檢查評論是否有至少 1 個「有幫助」reaction
    commentHasHelpfulReaction(comment) {
      if (!comment.reactions || !Array.isArray(comment.reactions)) {
        return false
      }

      const helpfulReaction = comment.reactions.find(r => r.type === 'helpful')
      return helpfulReaction && helpfulReaction.count > 0
    },

    async loadCommentRankings() {
      try {
        console.log('=== StageComments.loadCommentRankings 開始 ===')
        console.log(`ProjectId: ${this.projectId}, StageId: ${this.stageId}`)
        
        this.loadingRankings = true
        // Vue 3 Best Practice: rpcClient automatically handles authentication
        const projectId = this.projectId

        console.log('開始調用 API 獲取排名...')
        // 先嘗試載入舊的評論排名 API (投票期間使用)
        const httpResponse = await rpcClient.comments['stage-rankings'].$post({
          json: {
            projectId: projectId,
            stageId: this.stageId
          }
        })
        const response = await httpResponse.json()

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
            const settlementHttpResponse = await rpcClient.settlement['comment-rankings'].$post({
              json: {
                projectId: projectId,
                stageId: this.stageId
              }
            })
            const settlementResponse = await settlementHttpResponse.json()

            console.log('結算排名 API 響應:', settlementResponse)
            
            if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
              const settlementRankings = settlementResponse.data.rankings
              console.log('收到結算排名數據:', settlementRankings)

              // 更新評論的結算排名和獲得點數
              this.comments = this.comments.map(comment => {
                const settlementData = settlementRankings[comment.commentId]
                if (settlementData) {
                  console.log(`評論 ${comment.commentId} 的結算數據:`, settlementData)
                  return {
                    ...comment,
                    finalRank: settlementData.finalRank,
                    allocatedPoints: settlementData.allocatedPoints
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

    // 檢查用戶是否可以對此評論投 reaction
    canReactToComment(comment) {
      console.log('[canReactToComment] 檢查權限:', {
        commentId: comment.commentId,
        currentUserEmail: this.currentUserEmail,
        reactionUsers: comment.reactionUsers,
        isTeacherComment: comment.isTeacherComment
      })

      if (!this.currentUserEmail) {
        console.log('[canReactToComment] ❌ 沒有登入用戶')
        return false
      }

      // 教師評論不能投 reaction
      if (comment.isTeacherComment) {
        console.log('[canReactToComment] ❌ 這是教師評論')
        return false
      }

      // 檢查用戶是否在 reactionUsers 列表中（即被 mention 的學生）
      if (!comment.reactionUsers || !Array.isArray(comment.reactionUsers)) {
        console.log('[canReactToComment] ❌ reactionUsers 不存在或不是陣列')
        return false
      }

      const canReact = comment.reactionUsers.includes(this.currentUserEmail)
      console.log(`[canReactToComment] 結果: ${canReact ? '✅ 可以' : '❌ 不可以'} react`)
      return canReact
    },

    // 獲取某個 reaction 類型的數量
    getReactionCount(comment, reactionType) {
      if (!comment.reactions || !Array.isArray(comment.reactions)) {
        return 0
      }

      const reaction = comment.reactions.find(r => r.type === reactionType)
      return reaction ? reaction.count : 0
    },

    // 獲取當前用戶對此評論的 reaction
    getCommentUserReaction(comment) {
      return comment.userReaction || null
    },

    // 處理 reaction 點擊
    async handleReaction(comment, reactionType) {
      try {
        const currentReaction = this.getCommentUserReaction(comment)

        // 如果點擊的是當前已選的 reaction，則移除
        if (currentReaction === reactionType) {
          await this.removeReaction(comment)
        } else {
          // 否則添加/切換到新的 reaction
          await this.addReaction(comment, reactionType)
        }
      } catch (error) {
        console.error('處理 reaction 失敗:', error)
        ElMessage.error('操作失敗，請稍後再試')
      }
    },

    // 添加 reaction
    async addReaction(comment, reactionType) {
      try {
        const httpResponse = await rpcClient.comments.reactions.add.$post({
          json: {
            projectId: this.projectId,
            commentId: comment.commentId,
            reactionType: reactionType
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data?.reactions) {
          // 使用後端返回的真實數據更新
          comment.reactions = response.data.reactions
          comment.userReaction = response.data.userReaction
          ElMessage.success(reactionType === 'helpful' ? '已標記為有幫助' : '已標記為不實用')
        } else {
          ElMessage.error(response.error || '操作失敗：後端未返回 reaction 統計數據')
        }
      } catch (error) {
        console.error('添加 reaction 失敗:', error)
        ElMessage.error('操作失敗，請稍後再試')
      }
    },

    // 移除 reaction
    async removeReaction(comment) {
      try {
        const httpResponse = await rpcClient.comments.reactions.remove.$post({
          json: {
            projectId: this.projectId,
            commentId: comment.commentId
          }
        })
        const response = await httpResponse.json()

        if (response.success && response.data?.reactions !== undefined) {
          // 使用後端返回的真實數據更新
          comment.reactions = response.data.reactions
          comment.userReaction = response.data.userReaction
          ElMessage.success('已取消標記')
        } else {
          ElMessage.error(response.error || '操作失敗：後端未返回 reaction 統計數據')
        }
      } catch (error) {
        console.error('移除 reaction 失敗:', error)
        ElMessage.error('操作失敗，請稍後再試')
      }
    },

    // 獲取作者 Avatar URL
    getAuthorAvatarUrl(author) {
      if (author.avatarSeed && author.avatarStyle) {
        return generateAvatarUrl({
          userEmail: author.author || author.authorEmail,
          avatarSeed: author.avatarSeed,
          avatarStyle: author.avatarStyle,
          avatarOptions: author.avatarOptions
        })
      }

      // Fallback: 基於 email 生成
      const email = author.author || author.authorEmail || 'unknown@example.com'
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`
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

/* Active 階段：評論資格狀態（Post-it 便籤風格） */
.eligibility-postit {
  display: inline-flex;
  align-items: stretch;  /* 讓左側彩色區塊佔滿高度 */
  overflow: hidden;
  border-radius: 6px;
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  cursor: default;
  min-width: 220px;
}

.eligibility-postit:hover {
  transform: translateY(-2px);
  box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.3);
}

/* 左側彩色區塊（完全佔據高度，類似「本組」標記） */
.status-indicator-postit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
  min-width: 50px;
}

/* 狀態 1：已確認納入排名 (翠綠色區塊) */
.status-indicator-postit.confirmed {
  background: #10b981;  /* 翠綠色 */
}

.eligibility-postit.confirmed:hover .status-indicator-postit {
  background: #059669;  /* Hover 時深綠色 */
}

/* 狀態 2：等待認可 (橙色區塊) */
.status-indicator-postit.pending {
  background: #f59e0b;  /* 橙色 */
}

.eligibility-postit.pending:hover .status-indicator-postit {
  background: #d97706;  /* Hover 時深橙色 */
}

/* 狀態 3：不符合資格 (灰色區塊) */
.status-indicator-postit.not-eligible {
  background: #6b7280;  /* 灰色 */
}

.eligibility-postit.not-eligible:hover .status-indicator-postit {
  background: #4b5563;  /* Hover 時深灰色 */
}

.status-indicator-postit i {
  font-size: 14px;
}

/* 右側深色文字區域（與 voting 階段風格一致） */
.status-text-postit {
  flex: 1;
  background: #333;  /* 深色背景 */
  color: white;      /* 白色文字 */
  padding: 8px 16px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

/* Completed 階段：最終結算 */
.status-badge.final-rank {
  background-color: #111;  /* 深黑色（與 settlement 一致） */
  color: white;
}

.status-badge.allocated-points {
  background-color: #333;  /* 淺黑色（與 user-vote/teacher-vote 一致） */
  color: white;
  font-weight: 600;
}

/* Voting/Completed 階段：Reaction 統計顯示 */
.status-badge.reaction-stat {
  background-color: #444;  /* 中灰色 */
  color: white;
  min-width: 60px;
  padding: 8px 16px;  /* 與其他排名區塊統一高度 */
  gap: 6px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.status-badge.reaction-stat.helpful {
  background-color: #047857;  /* 深綠色（與 helpful 按鈕一致） */
}

.status-badge.reaction-stat.disagreed {
  background-color: #6b7280;  /* 灰色 */
}

.status-badge.reaction-stat i {
  font-size: 12px;  /* 與其他 status-badge 統一 */
  margin-right: 4px;
}

/* 右側綠色按鈕組容器 - 統一的 segmented button 樣式 */
.action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 0;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 1px;
  overflow: visible; /* Allow badges to overflow */
  position: relative;
  z-index: 1;
}

/* 統一的按鈕樣式 */
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background-color: #059669; /* Default: 淺綠色 */
  border: none;
  border-radius: 0;
  transition: all 0.2s;
  min-width: 90px;
  height: 32px;
  cursor: pointer;
  position: relative;
  overflow: visible; /* Allow badges to overflow */
  gap: 6px;
}

.action-btn:first-child {
  border-radius: 5px 0 0 5px;
}

.action-btn:last-child {
  border-radius: 0 5px 5px 0;
}

.action-btn:only-child {
  border-radius: 5px;
}

.action-btn:hover {
  background-color: #065f46;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(4, 120, 87, 0.3);
}

.action-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(4, 120, 87, 0.2);
}

.action-btn.active {
  background-color: #047857; /* Active state: 深綠色 */
  font-weight: 600;
}

.action-btn i {
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

/* 評論作者頭像樣式 */
.comment-author-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.author-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid #e1e8ed;
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

/* 回復作者頭像樣式 */
.reply-author-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reply-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid #e1e8ed;
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

/* Badge 樣式 */
.action-btn span {
  white-space: nowrap;
}

/* Allow el-badge to overflow button bounds */
.action-btn :deep(.el-badge) {
  display: inline-flex;
  align-items: center;
  overflow: visible !important;
}

/* Badge number styling */
.action-btn :deep(.el-badge__content.is-fixed) {
  position: absolute !important;
  top: -10px !important;
  right: -10px !important;
  transform: none !important;
  background-color: var(--el-color-danger) !important;
  border-radius: 10px !important;
  color: #fff !important;
  justify-content: center !important;
  align-items: center !important;
  font-size: 12px !important;
  height: 18px !important;
  padding: 0 6px !important;
  white-space: nowrap !important;
  border: 2px solid #fff !important;
  z-index: 10 !important;
}

/* ===== 小螢幕按鈕文字隱藏 (< 768px) ===== */
@media (max-width: 767px) {
  /* 隱藏所有按鈕文字 */
  .action-btn .btn-text,
  .action-btn.reaction-btn span {
    display: none;
  }

  /* 縮小按鈕寬度 */
  .action-btn {
    min-width: 40px;
    padding: 8px 10px;
  }
}
</style>