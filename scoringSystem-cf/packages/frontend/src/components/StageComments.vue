<template>
  <div v-loading="loading" class="stage-comments" element-loading-text="載入評論中...">
    <EmptyState
      v-if="comments.length === 0 && !loading"
      parent-icon="fa-comments"
      :icons="['fa-comment']"
      title="目前沒有評論"
      :compact="true"
      :enable-animation="false"
    />
    
    <!-- 評論列表 -->
    <div
      v-for="comment in comments"
      :key="comment.id"
      class="comment-item"
      :class="{ 'not-pinned': pinnedAuthorEmail && comment.author !== pinnedAuthorEmail }"
    >
      <!-- 評論排名狀態指示區 -->
      <div v-if="!comment.isTeacherComment" class="comment-status-bar">
        <!-- Active 階段：顯示資格狀態（三種狀態） -->
        <div v-if="stageStatus === 'active'" class="ranking-badges">
          <div
class="eligibility-postit" :class="{
            'confirmed': comment.canBeVoted,
            'pending': !comment.canBeVoted && commentHasMentions(comment),
            'not-eligible': !comment.canBeVoted && !commentHasMentions(comment)
          }">
            <!-- 狀態 1：符合所有條件，確認納入排名 (綠色區塊) -->
            <div v-if="comment.canBeVoted" class="status-indicator-postit confirmed">
              <i class="fas fa-check-circle"></i>
            </div>

            <!-- 狀態 2：有 mentions 但還沒符合所有條件，等待認可 (橙色區塊) -->
            <div v-else-if="commentHasMentions(comment)" class="status-indicator-postit pending">
              <i class="fas fa-clock"></i>
            </div>

            <!-- 狀態 3：完全不符合 (灰色區塊) -->
            <div v-else class="status-indicator-postit not-eligible">
              <i class="fas fa-times-circle"></i>
            </div>

            <!-- 文字說明 -->
            <div class="status-text-postit">
              <span v-if="comment.canBeVoted">已納入評論排名</span>
              <span v-else-if="commentHasMentions(comment)">只要被@的人認可就會納入評論排名</span>
              <span v-else>不具有評論排名資格</span>
            </div>
          </div>
        </div>

        <!-- Voting 階段：只對有資格的評論顯示排名 -->
        <div v-if="stageStatus === 'voting' && comment.canBeVoted" class="ranking-badges">
          <!-- 學生看到自己的投票 -->
          <div v-if="numericPermissionLevel !== 1" class="status-badge user-vote">
            你投第
            <StatNumberContent
              :value="comment.userVoteRank || '-'"
              :loading="loadingRankings"
              size="small"
            />
            名
          </div>
          <!-- 所有人都能看到老師的投票 -->
          <div class="status-badge teacher-vote">
            老師投第
            <StatNumberContent
              :value="comment.teacherVoteRank || '-'"
              :loading="loadingRankings"
              size="small"
            />
            名
          </div>

          <!-- Reaction 統計 -->
          <div class="status-badge reaction-stat helpful">
            <i class="fas fa-thumbs-up"></i>
            <StatNumberContent
              :value="getReactionCount(comment, 'helpful')"
              :loading="false"
              size="small"
            />
          </div>
          <div class="status-badge reaction-stat disagreed">
            <i class="fas fa-thumbs-down"></i>
            <StatNumberContent
              :value="getReactionCount(comment, 'disagreed')"
              :loading="false"
              size="small"
            />
          </div>
        </div>

        <!-- Completed 階段：所有人看到完整結果 -->
        <div v-if="stageStatus === 'completed' && comment.canBeVoted" class="ranking-badges">
          <div class="status-badge final-rank">
            結算第
            <StatNumberContent
              :value="comment.finalRank || '-'"
              :loading="loadingRankings"
              size="small"
            />
            名
          </div>
          <!-- 學生看到自己的投票 -->
          <div v-if="numericPermissionLevel !== 1" class="status-badge user-vote">
            你投第
            <StatNumberContent
              :value="comment.userVoteRank || '-'"
              :loading="loadingRankings"
              size="small"
            />
            名
          </div>
          <!-- 所有人看到老師的投票 -->
          <div class="status-badge teacher-vote">
            老師投第
            <StatNumberContent
              :value="comment.teacherVoteRank || '-'"
              :loading="loadingRankings"
              size="small"
            />
            名
          </div>
          <div class="status-badge allocated-points">
            獲得了
            <StatNumberContent
              :value="comment.allocatedPoints || '-'"
              :loading="loadingRankings"
              size="small"
            />
            點
          </div>

          <!-- Reaction 統計 -->
          <div class="status-badge reaction-stat helpful">
            <i class="fas fa-thumbs-up"></i>
            <StatNumberContent
              :value="getReactionCount(comment, 'helpful')"
              :loading="false"
              size="small"
            />
          </div>
          <div class="status-badge reaction-stat disagreed">
            <i class="fas fa-thumbs-down"></i>
            <StatNumberContent
              :value="getReactionCount(comment, 'disagreed')"
              :loading="false"
              size="small"
            />
          </div>
        </div>

        <!-- 右側：合併的綠色按鈕組 -->
        <div class="action-buttons">
          <!-- 釘選作者按鈕 -->
          <el-tooltip content="只看這個人在這個階段的評論" placement="top">
            <button
              class="action-btn pin-btn"
              :class="{ 'active': pinnedAuthorEmail === comment.author }"
              @click="togglePinAuthor(comment.author)"
            >
              <i class="fas fa-thumbtack"></i>
            </button>
          </el-tooltip>

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
      <div v-if="comment.isTeacherComment" class="comment-status-bar teacher-comment">
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
        <MdPreviewWrapper
          :content="comment.content"
          :pre-process="getMentionProcessor()"
        />
      </div>
      
      <!-- 被提及的用戶（使用 AvatarGroup 頭像顯示） -->
      <div v-if="comment.replyUsers && comment.replyUsers.length > 0" class="mentions">
        <span class="mentions-label">被提及：</span>
        <AvatarGroup
          :group-members="comment.replyUsers"
          size="28px"
        />
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
            <MdPreviewWrapper
              :content="reply.content"
              :pre-process="getMentionProcessor()"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 載入更多評論按鈕 -->
    <div v-if="hasMore" class="load-more-section">
      <el-tooltip content="想一次看更多評論？可以到「使用者設定」調整" placement="bottom">
        <el-badge :value="remainingCount" :max="99" class="load-more-badge">
          <el-button
            type="primary"
            :loading="loadingMore"
            class="load-more-btn"
            @click="loadMoreComments"
          >
            再載入 {{ commentPageSize }} 條評論
          </el-button>
        </el-badge>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue'
import { ElMessage } from 'element-plus'
import StatNumberContent from '@/components/shared/StatNumberContent.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import AvatarGroup from '@/components/common/AvatarGroup.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { processMentions } from '@/utils/mention-processor'
import { getNumericPermissionLevel, type PermissionLevel } from '@/composables/useProjectPermissions'
import { useInfiniteStageComments, flattenInfiniteComments, getInfiniteCommentsTotal, getInfiniteVotingEligible } from '@/composables/useProjectDetail'
import { rpcClient } from '@/utils/rpc-client'
import { generateAvatarUrl } from '@/utils/walletHelpers'
import type { Comment } from '@/types'

/** Reaction 統計項 */
interface ReactionStat {
  type: string
  count: number
  users?: string[]
}

/** 可回覆/被提及的使用者（AvatarGroup 也吃這個形狀） */
interface ReplyUser {
  userEmail: string
  [key: string]: unknown
}

/** 後端回覆原始資料 */
interface RawReply {
  commentId?: string
  id?: string
  content: string
  createdTime?: string | number
  authorEmail?: string
  author?: string
  authorName?: string
  displayName?: string
  authorAvatarSeed?: string
  authorAvatarStyle?: string
  authorAvatarOptions?: string | Record<string, unknown>
  mentionedUsers?: string[]
  mentionedGroups?: string[]
}

/**
 * 階段評論的後端原始資料。
 * shared 的 Comment 實體缺少本組件用到的擴充欄位（authorRole、reactions、
 * replyUsers…），且 mentionedUsers/Groups 可能是 JSON 字串，故以 Omit + 交集擴充。
 */
type RawStageComment = Omit<Comment, 'mentionedUsers' | 'mentionedGroups'> & {
  authorRole?: string | null
  authorName?: string
  authorAvatarSeed?: string
  authorAvatarStyle?: string
  authorAvatarOptions?: string | Record<string, unknown>
  mentionedUsers?: string | string[]
  mentionedGroups?: string | string[]
  replies?: RawReply[]
  voteCount?: number
  hasVoted?: boolean
  rank?: number | null
  settlementRank?: number | null
  userVoteRank?: number | null
  teacherVoteRank?: number | null
  finalRank?: number | null
  allocatedPoints?: number | null
  reactions?: ReactionStat[]
  userReaction?: string | null
  reactionUsers?: string[]
  replyUsers?: ReplyUser[]
  canBeVoted?: boolean
}

/** 處理後的回覆 */
interface ProcessedReply {
  id: string
  content: string
  timestamp: string
  author: string
  authorName: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
  mentionedUsers: string[]
  mentionedGroups: string[]
}

/** 處理後供模板渲染的評論 */
interface ProcessedComment {
  id: string
  commentId: string
  content: string
  timestamp: string
  author: string
  authorName: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
  authorRole: string | null
  mentionedUsers: string[]
  mentionedGroups: string[]
  rawMentionedUsers: string[]
  rawMentionedGroups: string[]
  replies: ProcessedReply[]
  voteCount: number
  hasVoted: boolean
  rank: number | null
  isTeacherComment: boolean
  settlementRank: number | null
  userVoteRank: number | null
  teacherVoteRank: number | null
  finalRank: number | null
  allocatedPoints: number | null
  reactions: ReactionStat[]
  userReaction: string | null
  reactionUsers: string[]
  replyUsers: ReplyUser[]
  canBeVoted: boolean
}

/** 單筆評論的排名資料 */
interface CommentRankingData {
  settlementRank?: number | null
  userVoteRank?: number | null
  teacherVoteRank?: number | null
  finalRank?: number | null
  allocatedPoints?: number | null
}

interface ProjectGroupOption {
  groupId: string
  groupName?: string
  name?: string
}

const props = withDefaults(defineProps<{
  stageId: string
  projectId: string
  userEmailToDisplayName?: Record<string, string>
  currentUserEmail?: string
  currentUserGroupId?: string
  stageStatus?: string
  permissionLevel?: number | string | null
  projectGroups?: ProjectGroupOption[]
  /** 從父組件傳入的排名資料 */
  initialRankings?: Record<string, CommentRankingData> | null
  /** 用戶評論分頁設定 */
  commentPageSize?: number
}>(), {
  userEmailToDisplayName: () => ({}),
  currentUserEmail: '',
  currentUserGroupId: '',
  stageStatus: '',
  permissionLevel: null,
  projectGroups: () => [],
  initialRankings: null,
  commentPageSize: 3
})

const emit = defineEmits<{
  'reply-comment': [payload: {
    commentId: string
    authorName: string
    content: string
    mentionedGroups: string[]
    mentionedUsers: string[]
  }]
  'total-updated': [total: number]
}>()

// Convert permission level to numeric format for backward compatibility
const numericPermissionLevel = computed(() => {
  if (typeof props.permissionLevel === 'number') {
    return props.permissionLevel
  }
  if (typeof props.permissionLevel === 'string') {
    return getNumericPermissionLevel(props.permissionLevel as PermissionLevel)
  }
  return null
})

// 使用 TanStack Query Infinite Query 載入評論
const commentsQuery = useInfiniteStageComments(
  toRef(props, 'projectId'),
  toRef(props, 'stageId'),
  toRef(props, 'commentPageSize'),
  false // excludeTeachers
)

// 從 query 結果提取的 computed 屬性
const rawComments = computed(() => flattenInfiniteComments(commentsQuery.data.value))
const totalComments = computed(() => getInfiniteCommentsTotal(commentsQuery.data.value))
const votingEligible = computed(() => getInfiniteVotingEligible(commentsQuery.data.value))
const hasMore = computed(() => commentsQuery.hasNextPage?.value ?? false)
const loading = computed(() => commentsQuery.isLoading?.value ?? false)
const loadingMore = computed(() => commentsQuery.isFetchingNextPage?.value ?? false)

// 計算剩餘未載入的評論數量
const remainingCount = computed(() => {
  return Math.max(0, totalComments.value - rawComments.value.length)
})

// 監聽 totalComments 變化，emit 給父組件 (Option B)
watch(totalComments, (newTotal) => {
  emit('total-updated', newTotal)
}, { immediate: true })

// 載入更多評論
async function loadMoreComments() {
  if (commentsQuery.hasNextPage?.value && !commentsQuery.isFetchingNextPage?.value) {
    await commentsQuery.fetchNextPage()
  }
}

// 處理後的評論（TanStack Query 的 rawComments 經 processCommentsData 轉換）
const processedComments = ref<ProcessedComment[]>([])
const commentRankings = ref<Record<string, CommentRankingData>>({})
const loadingRankings = ref(false)
// 用於篩選特定作者的評論
const pinnedAuthorEmail = ref<string | null>(null)

// 模板使用的評論列表
const comments = computed(() => processedComments.value)

function formatTime(timestamp?: string | number) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-TW')
}

function convertGroupIdsToNames(groupIds: string[]) {
  if (!Array.isArray(groupIds)) return []

  return groupIds.map((groupId: string) => {
    // 從 prop 中獲取群組名稱
    const group = props.projectGroups.find((g) => g.groupId === groupId)
    if (group) {
      return group.groupName || group.name || groupId
    }

    // 如果找不到，返回原始的 groupId
    return groupId
  })
}

function processCommentsData(raw: RawStageComment[]): ProcessedComment[] {
  if (!raw || !Array.isArray(raw)) {
    return []
  }

  // 將後端返回的評論數據轉換為前端需要的格式
  // 這裡返回的是評論列表，不是按組分組的數據
  return raw.map(comment => {
    // 解析mentionedGroups和mentionedUsers（可能是JSON字串）
    let mentionedUsers: string[] = []
    let mentionedGroups: string[] = []

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
    let replies: ProcessedReply[] = []
    if (comment.replies && Array.isArray(comment.replies)) {
      replies = comment.replies.map((reply): ProcessedReply => ({
        id: reply.commentId || reply.id || '',
        content: reply.content,
        timestamp: formatTime(reply.createdTime),
        author: reply.authorEmail || reply.author || '',
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
      id: comment.commentId || comment.id || '',
      commentId: comment.commentId || comment.id || '', // 確保有commentId供回復使用
      content: comment.content,
      timestamp: formatTime(comment.createdTime),
      author: comment.authorEmail || comment.author || '',
      authorName: comment.authorName || comment.authorEmail || comment.author || '',
      avatarSeed: comment.authorAvatarSeed,
      avatarStyle: comment.authorAvatarStyle,
      avatarOptions: comment.authorAvatarOptions,
      authorRole: comment.authorRole || null, // 保存完整的 role 資訊
      mentionedUsers: mentionedUsers.map((email: string) => {
        const displayName = props.userEmailToDisplayName[email] || email.split('@')[0]
        return `${displayName}(${email})`
      }),
      mentionedGroups: convertGroupIdsToNames(mentionedGroups),
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
      reactionUsers: comment.reactionUsers || [],  // 可以投 reaction 的用戶列表
      replyUsers: comment.replyUsers || [],  // 可以回覆的用戶列表
      // 投票資格
      canBeVoted: comment.canBeVoted || false  // 是否符合評論排名投票資格
    }
  }).sort((a, b) => {
    // 按時間排序，最新的在前
    const timeA = new Date(a.timestamp).getTime()
    const timeB = new Date(b.timestamp).getTime()
    return timeB - timeA
  })
}

/**
 * 取得 mention 前處理函數
 * 用於 MdPreviewWrapper 的 preProcess prop
 */
function getMentionProcessor() {
  return (content: string) => processMentions(content, props.userEmailToDisplayName)
}

function handleReplyClick(comment: ProcessedComment) {
  // 發送回復評論的事件給父組件
  emit('reply-comment', {
    commentId: comment.id,
    authorName: comment.authorName,
    content: comment.content,
    mentionedGroups: comment.mentionedGroups,
    mentionedUsers: comment.mentionedUsers
  })
}

function canReplyToComment(comment: ProcessedComment) {
  if (!props.currentUserEmail) {
    return false
  }

  // Level 1 (Teacher) can always reply
  // Note: Level 0 (Global Admin) does NOT participate in project interactions
  if (numericPermissionLevel.value === 1) {
    return true
  }

  // Level 3 (Student) permission check: can only reply when stage.status = 'active'
  if (props.stageStatus !== 'active') {
    return false
  }

  // If comment author, can reply to own comment (but still needs stage to be active)
  if (comment.author === props.currentUserEmail) {
    return true
  }

  // Check if user is in replyUsers list (mentionedUsers + expanded mentionedGroups)
  // Note: replyUsers is now an array of objects with userEmail property
  return comment.replyUsers?.some((u) => u.userEmail === props.currentUserEmail) || false
}

function getReplyButtonText(comment: ProcessedComment) {
  if (!props.currentUserEmail) {
    return '回覆'
  }

  // Level 1 (Teacher)
  if (numericPermissionLevel.value === 1) {
    return '教師回復'
  }

  // If comment author
  if (comment.author === props.currentUserEmail) {
    return '回復自己的評論'
  }

  // If mentioned
  return '被@到‧回覆'
}

// 檢查評論是否有 mentions（被 @ 了組別或用戶）
function commentHasMentions(comment: ProcessedComment) {
  const hasGroups = Array.isArray(comment.rawMentionedGroups) && comment.rawMentionedGroups.length > 0
  const hasUsers = Array.isArray(comment.rawMentionedUsers) && comment.rawMentionedUsers.length > 0
  return hasGroups || hasUsers
}

async function loadCommentRankings() {
  try {
    console.log('=== StageComments.loadCommentRankings 開始 ===')
    console.log(`ProjectId: ${props.projectId}, StageId: ${props.stageId}`)

    loadingRankings.value = true
    const projectId = props.projectId

    console.log('開始調用 API 獲取排名...')
    // 先嘗試載入舊的評論排名 API (投票期間使用)
    const httpResponse = await rpcClient.comments['stage-rankings'].$post({
      json: {
        projectId: projectId,
        stageId: props.stageId
      }
    })
    const response = await httpResponse.json()

    console.log('投票排名 API 響應:', response)

    if (response.success && response.data) {
      console.log('收到投票排名數據:', response.data)
      commentRankings.value = response.data

      // 更新評論的排名信息
      console.log('開始更新評論的投票排名信息...')
      console.log(`當前評論數: ${processedComments.value.length}`)

      processedComments.value = processedComments.value.map(comment => {
        const rankings = commentRankings.value[comment.commentId] || {}
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
    if (props.stageStatus === 'completed') {
      try {
        console.log('開始調用結算排名 API...')
        const settlementHttpResponse = await rpcClient.settlement['comment-rankings'].$post({
          json: {
            projectId: projectId,
            stageId: props.stageId
          }
        })
        const settlementResponse = await settlementHttpResponse.json()

        console.log('結算排名 API 響應:', settlementResponse)

        if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
          const settlementRankings = settlementResponse.data.rankings
          console.log('收到結算排名數據:', settlementRankings)

          // 更新評論的結算排名和獲得點數
          processedComments.value = processedComments.value.map(comment => {
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

    console.log('最終更新後的評論:', processedComments.value)
  } catch (error) {
    console.error('Error loading comment rankings:', error)
  } finally {
    loadingRankings.value = false
    console.log('=== StageComments.loadCommentRankings 結束 ===')
  }
}

// 檢查用戶是否可以對此評論投 reaction
function canReactToComment(comment: ProcessedComment) {
  console.log('[canReactToComment] 檢查權限:', {
    commentId: comment.commentId,
    currentUserEmail: props.currentUserEmail,
    reactionUsers: comment.reactionUsers,
    isTeacherComment: comment.isTeacherComment
  })

  if (!props.currentUserEmail) {
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

  const canReact = comment.reactionUsers.includes(props.currentUserEmail)
  console.log(`[canReactToComment] 結果: ${canReact ? '✅ 可以' : '❌ 不可以'} react`)
  return canReact
}

// 獲取某個 reaction 類型的數量
function getReactionCount(comment: ProcessedComment, reactionType: string) {
  if (!comment.reactions || !Array.isArray(comment.reactions)) {
    return 0
  }

  const reaction = comment.reactions.find((r) => r.type === reactionType)
  return reaction ? reaction.count : 0
}

// 獲取當前用戶對此評論的 reaction
function getCommentUserReaction(comment: ProcessedComment) {
  return comment.userReaction || null
}

// 處理 reaction 點擊
async function handleReaction(comment: ProcessedComment, reactionType: string) {
  try {
    const currentReaction = getCommentUserReaction(comment)

    // 如果點擊的是當前已選的 reaction，則移除
    if (currentReaction === reactionType) {
      await removeReaction(comment)
    } else {
      // 否則添加/切換到新的 reaction
      await addReaction(comment, reactionType)
    }
  } catch (error) {
    console.error('處理 reaction 失敗:', error)
    ElMessage.error('操作失敗，請稍後再試')
  }
}

// 添加 reaction
async function addReaction(comment: ProcessedComment, reactionType: string) {
  try {
    const httpResponse = await rpcClient.comments.reactions.add.$post({
      json: {
        projectId: props.projectId,
        commentId: comment.commentId,
        reactionType: reactionType
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data?.reactions) {
      // 使用後端返回的真實數據更新
      comment.reactions = response.data.reactions
      comment.userReaction = response.data.userReaction
      // 更新 canBeVoted 狀態（用於評論排名資格判斷）
      if (response.data.canBeVoted !== undefined) {
        comment.canBeVoted = response.data.canBeVoted
      }
      ElMessage.success(reactionType === 'helpful' ? '已標記為有幫助' : '已標記為不實用')
    } else {
      ElMessage.error(response.error || '操作失敗：後端未返回 reaction 統計數據')
    }
  } catch (error) {
    console.error('添加 reaction 失敗:', error)
    ElMessage.error('操作失敗，請稍後再試')
  }
}

// 移除 reaction
async function removeReaction(comment: ProcessedComment) {
  try {
    const httpResponse = await rpcClient.comments.reactions.remove.$post({
      json: {
        projectId: props.projectId,
        commentId: comment.commentId
      }
    })
    const response = await httpResponse.json()

    if (response.success && response.data?.reactions !== undefined) {
      // 使用後端返回的真實數據更新
      comment.reactions = response.data.reactions
      comment.userReaction = response.data.userReaction
      // 更新 canBeVoted 狀態（用於評論排名資格判斷）
      if (response.data.canBeVoted !== undefined) {
        comment.canBeVoted = response.data.canBeVoted
      }
      ElMessage.success('已取消標記')
    } else {
      ElMessage.error(response.error || '操作失敗：後端未返回 reaction 統計數據')
    }
  } catch (error) {
    console.error('移除 reaction 失敗:', error)
    ElMessage.error('操作失敗，請稍後再試')
  }
}

// 獲取作者 Avatar URL
function getAuthorAvatarUrl(author: {
  author?: string
  authorEmail?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
}) {
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
}

// 供父組件調用的刷新方法 (使用 TanStack Query refetch)
async function refreshComments() {
  await commentsQuery.refetch()
}

// 應用排名資料到評論（用於從父組件接收排名資料時）
function applyRankingsToComments(rankings: Record<string, CommentRankingData>) {
  if (!rankings || !processedComments.value.length) return

  commentRankings.value = rankings
  processedComments.value = processedComments.value.map(comment => {
    const rankingData = rankings[comment.commentId] || {}
    return {
      ...comment,
      settlementRank: rankingData.settlementRank || null,
      userVoteRank: rankingData.userVoteRank || null,
      teacherVoteRank: rankingData.teacherVoteRank || null,
      finalRank: rankingData.finalRank || null,
      allocatedPoints: rankingData.allocatedPoints || null
    }
  })
}

// 切換釘選作者（用於篩選顯示特定作者的評論）
function togglePinAuthor(authorEmail: string) {
  if (pinnedAuthorEmail.value === authorEmail) {
    pinnedAuthorEmail.value = null  // 取消釘選
  } else {
    pinnedAuthorEmail.value = authorEmail  // 釘選此作者
  }
}

// 監聽 rawComments 變化，處理評論並載入排名
watch(rawComments, async (newComments) => {
  if (newComments && newComments.length > 0) {
    processedComments.value = processCommentsData(newComments as RawStageComment[])
    // 載入排名資料
    await loadCommentRankings()
  } else if (newComments && newComments.length === 0) {
    processedComments.value = []
  }
}, { immediate: true, deep: true })

// 監聽父組件傳入的排名資料變化 (如果有的話)
watch(() => props.initialRankings, (newRankings) => {
  if (newRankings !== null && newRankings !== undefined) {
    applyRankingsToComments(newRankings)
  }
}, { deep: true })

defineExpose({ refreshComments, votingEligible })
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
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mentions-label {
  font-size: 12px;
  color: #7f8c8d;
  font-weight: 500;
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

/* @mention 高亮樣式 - 同時支援 <mention> tag 和 .mention class */
.comment-content :deep(mention),
.comment-content :deep(.mention),
.reply-content :deep(mention),
.reply-content :deep(.mention) {
  background: #e8f5e8;
  color: #2e7d2e;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  display: inline;
}

/* MdPreviewWrapper 已處理大部分 markdown 樣式，這裡只保留必要的覆寫 */
.comment-content :deep(.md-preview-wrapper),
.reply-content :deep(.md-preview-wrapper) {
  /* 移除 MdPreviewWrapper 預設的 padding */
}

.reply-content :deep(code) {
  font-size: 12px;
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

/* 非鎖定評論淡化 (與 StageGroupSubmissions 一致) */
.comment-item.not-pinned {
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.comment-item.not-pinned:hover {
  opacity: 0.8;
}

/* Pin 按鈕樣式 */
.action-btn.pin-btn {
  min-width: 40px;
}

/* ===== 載入更多評論區塊 ===== */
.load-more-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  margin-top: 10px;
}

.load-more-btn {
  min-width: 180px;
}

.load-more-badge :deep(.el-badge__content) {
  background-color: var(--el-color-danger);
}

.load-more-hint {
  color: #909399;
  font-size: 14px;
  cursor: help;
  display: flex;
  align-items: center;
  gap: 4px;
}

.load-more-hint i {
  font-size: 14px;
}

.load-more-hint:hover {
  color: #606266;
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