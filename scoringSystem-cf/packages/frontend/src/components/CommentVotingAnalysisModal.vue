<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    :z-index="2000"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-comment"></i>
          評論計票過程分析
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="analysis-content" v-loading="loading" element-loading-text="載入計票數據中...">

      <!-- 計票說明 -->
      <div class="info-section">
        <el-alert
          title="評論計票方式說明"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>評論排名採用與提交相同的平均排名加權法，前三名按「佔用位置法」分配獎金：</p>
            <ul>
              <li><strong>步驟1 - 計算平均排名：</strong>每個評論分別計算學生投票和教師投票的平均排名</li>
              <li><strong>步驟2 - 加權計分：</strong>加權分數 = 學生平均排名×70% + 教師平均排名×30%</li>
              <li><strong>步驟3 - 決定排名：</strong>加權分數越低，排名越前（採用Standard Ranking）</li>
              <li><strong>步驟4 - TOP 3獎勵：</strong>只有排名前三名的評論獲得獎金</li>
              <li><strong>步驟5 - 分配獎金（佔用位置法）：</strong>
                <ul style="margin-top: 8px;">
                  <li>前3位的權重：第1位=3，第2位=2，第3位=1</li>
                  <li>若出現並列（例如2人並列第1名），則佔用位置1和2，每人權重=(3+2)/2=2.5</li>
                  <li>最後按權重比例分配評論獎金池</li>
                </ul>
              </li>
              <li><strong>重要特性：</strong>
                <span style="color: #E6A23C;">並列者獲得相同獎勵；排名越前獎勵越高，即使並列也比後面排名多</span>
              </li>
            </ul>
          </template>
        </el-alert>
      </div>

      <!-- 評論計票結果分析 -->
      <div class="chart-section" v-if="!loading">
        <div class="section-header">
          <h3><i class="fas fa-trophy"></i> 評論投票結果表格</h3>
        </div>

        <!-- 圖例說明 -->
        <div class="legend">
          <div class="legend-item">
            <div class="legend-color rank-1"></div>
            <span>第 1 名投票</span>
          </div>
          <div class="legend-item">
            <div class="legend-color rank-2"></div>
            <span>第 2 名投票</span>
          </div>
          <div class="legend-item">
            <div class="legend-color rank-3"></div>
            <span>第 3 名投票</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(to right, #4169e1, #87ceeb);"></div>
            <span>表頭：排名顏色（越深=越前面）</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(to right, #1f4e79, #7cb9e8);"></div>
            <span>學生分數：藍色（越深=分數越高）</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(to right, #cc5500, #ffa366);"></div>
            <span>教師分數：橘色（越深=分數越高）</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(to right, #4b0082, #9370db);"></div>
            <span>加權總分：紫色（越深=總分越高）</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: linear-gradient(to right, #228b22, #90ee90);"></div>
            <span>獎金：綠色（越深=獎金越多）</span>
          </div>
        </div>

        <!-- 評論投票結果表格 (XY 軸對調) -->
        <div class="table-container">
          <table class="voting-table">
            <thead>
              <tr>
                <th class="candidate-header-label">投票者 \\ 候選評論</th>
                <!-- Candidate comments as columns -->
                <th v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="{ background: getCommentHeaderColor(comment.commentId), color: 'white' }">
                  <div>{{ comment.authorDisplayName || comment.authorEmail }}({{ comment.authorEmail }})</div>
                  <div class="comment-preview">{{ comment.contentPreview }}</div>
                  <div v-if="comment.finalRank" class="candidate-rank">第{{ comment.finalRank }}名</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Each student voter as a row -->
              <tr v-for="(voter, index) in votersList" :key="voter.authorEmail">
                <td class="voter-name"
                    :style="{ background: getVoterHeaderColor(voter.authorEmail), color: '#000' }">
                  {{ voter.proposerDisplayName || '學生' + (index + 1) }}({{ voter.authorEmail }})
                </td>
                <!-- This voter's ranking for each comment -->
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="getRankCellStyle(getVoteRank(voter.authorEmail, comment.commentId))">
                  {{ getVoteRank(voter.authorEmail, comment.commentId) || '-' }}
                </td>
              </tr>

              <!-- Each teacher voter as a row -->
              <tr v-for="(teacher, index) in teacherVotes" :key="'teacher-' + index">
                <td class="voter-name"
                    :style="{ background: getVoterHeaderColor(`teacher-${index}`), color: '#000' }">
                  {{ teacher.teacherDisplayName || '教師' + (index + 1) }}({{ teacher.teacherEmail }})
                </td>
                <!-- This teacher's ranking for each comment -->
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="getRankCellStyle(getTeacherVoteRank(teacher, comment.commentId))">
                  {{ getTeacherVoteRank(teacher, comment.commentId) || '-' }}
                </td>
              </tr>

              <!-- Score rows at the bottom (transposed) -->
              <tr class="stats-row">
                <td class="stats-label">學生分數 (70%)</td>
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.studentScore, 'student'), color: 'white' }">
                  <div class="score-amount">{{ comment.studentScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">教師分數 (30%)</td>
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.teacherScore, 'teacher'), color: 'white' }">
                  <div class="score-amount">{{ comment.teacherScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">加權總分</td>
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.totalScore, 'total'), color: 'white' }">
                  <div class="score-amount">{{ comment.totalScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">獲得獎金</td>
                <td v-for="comment in candidateComments"
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.allocatedScore), color: 'white' }">
                  <div class="score-amount">🏆 {{ comment.allocatedScore || 0 }} 點</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 獎金分配視覺化圖表 -->
        <div v-if="hasRewardsToDisplay" class="chart-container">
          <el-divider content-position="left">🏆 評論獎金分配視覺化</el-divider>
          <AllGroupsChart
            :selected-members="[]"
            :simulated-rank="1"
            :simulated-group-count="candidateComments.length"
            :report-reward="commentRewardPool"
            :all-groups="allCommentsChartData as any"
            :current-group-id="null"
            :total-project-groups="candidateComments.length"
            :current-group-label="''"
            :group-by-rank="false"
          />
          <div class="chart-hint">
            <i class="fas fa-lightbulb"></i> 評論獎金直接發送給評論作者，無需點擊查看詳情
          </div>
        </div>

        <!-- 無獎金分配時的狀態 -->
        <div v-if="!hasRewardsToDisplay && candidateComments.length > 0" class="empty-rewards-state">
          <el-alert
            title="暫無獎金分配"
            type="info"
            description="本階段評論尚未設定獎金池或所有評論獎金為0，無法顯示分配圖表。"
            :closable="false"
            show-icon
          />
        </div>
      </div>

      <!-- 空狀態 -->
      <EmptyState
        v-if="!loading && candidateComments.length === 0"
        :icons="['fa-comments']"
        title="暫無評論計票數據"
        parent-icon="fa-chart-pie"
      />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import * as d3 from 'd3'
import { ref, watch, computed, type CSSProperties } from 'vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import randomColor from 'randomcolor'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import { rpcClient } from '@/utils/rpc-client'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ================== Interfaces ==================

interface CommentRanking {
  commentId: string
  rank: number
}

interface StudentVote {
  authorEmail: string
  proposerDisplayName?: string
  rankingData: CommentRanking[]
}

interface TeacherVote {
  teacherEmail: string
  teacherDisplayName?: string
  rankingData: CommentRanking[]
}

interface CommentInfo {
  commentId: string
  authorEmail: string
  authorDisplayName?: string
  content: string
  finalRank?: number | null
  allocatedPoints?: number
  studentScore?: number
  teacherScore?: number
  totalScore?: number
}

interface CandidateComment {
  commentId: string
  authorEmail: string
  authorDisplayName?: string
  contentPreview: string
  finalRank: number | null
  allocatedScore: number
  studentScore: number
  teacherScore: number
  totalScore: number
  rankDistribution: Record<number, number>
  winningRankLevel: number
  winningVotes: number
}

interface Voter {
  authorEmail: string
  proposerDisplayName?: string
}

interface CommentScore {
  commentId: string
  studentScore: number
  teacherScore: number
  totalScore: number
  finalRank?: number
  rankDistribution: Record<number, number>
}

interface SettlementRanking {
  finalRank: number
  allocatedPoints: number
}

interface AllGroupsChartData {
  rank: number
  groupId: string
  groupName: string
  score: number
  weightedScore: number
  members: {
    displayName: string
    totalPoints: number
    participationPercentage: number
    finalWeight: number
    points: number
    groupId: string
    groupName: string
    rank: number
    isCurrentGroup: boolean
  }[]
}

// ================== Props & Emits ==================

interface Props {
  visible: boolean
  projectId: string
  stageId: string
  maxCommentSelections: number  // 必需 - 評論選擇數量上限（從專案配置獲取）
  commentRewardPercentile?: number  // 評論獎勵百分比模式（0 = 固定排名模式）
  stageTitle?: string
  isSettled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  projectId: '',
  stageId: '',
  commentRewardPercentile: 0,
  stageTitle: '',
  isSettled: false
})

interface Emits {
  (e: 'update:visible', value: boolean): void
}

const emit = defineEmits<Emits>()

// ================== State ==================

const loading = ref<boolean>(false)
const candidateComments = ref<CandidateComment[]>([])
const votersList = ref<Voter[]>([])
const teacherVotes = ref<TeacherVote[]>([])
const commentRewardPool = ref<number>(0)
const voteData = ref<StudentVote[]>([])
const stackedBarChart = ref<HTMLElement | null>(null)
const commentColorMap = ref<Map<string, string>>(new Map())
const voterColorMap = ref<Map<string, string>>(new Map())

// ================== Constants ==================

const TEACHER_WEIGHT = 0.3
const STUDENT_WEIGHT = 0.7
const FLOAT_EPSILON = 0.001

// ================== Computed ==================

// 計算有效評論作者數量
const getUniqueAuthorCount = (): number => {
  const uniqueAuthors = new Set(candidateComments.value.map(c => c.authorEmail))
  return uniqueAuthors.size
}

// 動態計算可選評論數量（根據模式）
const dynamicMaxCommentSelections = computed((): number => {
  if (props.commentRewardPercentile === 0) {
    // 固定 TopN 模式：直接使用 props.maxCommentSelections
    return props.maxCommentSelections
  } else {
    // 百分比模式：根據有效評論作者數量計算
    const totalAuthors = getUniqueAuthorCount()
    return Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
  }
})

// ================== Watchers ==================

watch(() => props.visible, (newVal: boolean) => {
  console.log('🔍 [CommentVotingAnalysisModal] visible changed:', {
    newVal,
    projectId: props.projectId,
    stageId: props.stageId,
    isSettled: props.isSettled,
    stageTitle: props.stageTitle
  })
  if (newVal) {
    loadCommentAnalysis()
  }
})

// ================== Methods ==================

const loadCommentAnalysis = async (): Promise<void> => {
  console.log('🔍 [CommentVotingAnalysisModal] loadCommentAnalysis called with props:', {
    projectId: props.projectId,
    stageId: props.stageId,
    isSettled: props.isSettled,
    stageTitle: props.stageTitle
  })

  // 驗證必要的 props
  if (!props.projectId || !props.stageId) {
    console.error('❌ [CommentVotingAnalysisModal] 缺少必要的 projectId 或 stageId', {
      projectId: props.projectId,
      stageId: props.stageId
    })
    return
  }

  loading.value = true
  try {
    console.log('📊 載入評論計票分析...', {
      projectId: props.projectId,
      stageId: props.stageId,
      isSettled: props.isSettled
    })

    if (props.isSettled) {
      // 結算後模式：載入結算結果數據
      const [stageHttpResponse, settlementHttpResponse, commentVotingHttpResponse] = await Promise.all([
        rpcClient.stages.get.$post({
          json: {
            projectId: props.projectId,
            stageId: props.stageId
          }
        }),
        rpcClient.settlement['comment-rankings'].$post({
          json: {
            projectId: props.projectId,
            stageId: props.stageId
          }
        }),
        (rpcClient.scoring as any)['comment-voting-data'].$post({
          json: {
            stageId: props.stageId
          }
        })
      ])
      const stageResponse = await stageHttpResponse.json()
      const settlementResponse = await settlementHttpResponse.json()
      const commentVotingResponse = await commentVotingHttpResponse.json()

      console.log('📊 階段API響應:', stageResponse)
      console.log('📊 評論結算API響應:', settlementResponse)
      console.log('📊 評論投票API響應:', commentVotingResponse)

      if (stageResponse.success && settlementResponse.success && settlementResponse.data.settled && commentVotingResponse.success) {
        // 設定階段評論獎金池
        commentRewardPool.value = stageResponse.data.commentRewardPool || 0

        // 處理評論投票數據
        const { studentVotes, teacherVotes: teachers, commentInfo } = commentVotingResponse.data
        voteData.value = studentVotes || []
        teacherVotes.value = teachers || []

        // 建立候選評論和投票者列表（使用後端提供的結算分數）
        buildCandidateComments(commentInfo)

        console.log('📊 buildCandidateComments 執行後 (含後端分數):', {
          candidateCommentsLength: candidateComments.value.length,
          candidateComments: candidateComments.value.map(c => ({
            commentId: c.commentId,
            authorEmail: c.authorEmail,
            studentScore: c.studentScore,
            teacherScore: c.teacherScore,
            totalScore: c.totalScore
          }))
        })

        buildVotersList()

        // 套用結算結果的排名和分數（僅更新排名和獎金，保留後端計算的分數）
        applyCommentSettlementRankings(settlementResponse.data.rankings)
      } else {
        console.error('階段尚未結算或評論數據不完整', {
          stageSuccess: stageResponse.success,
          settlementSuccess: settlementResponse.success,
          commentVotingSuccess: commentVotingResponse.success,
          settled: settlementResponse.data?.settled,
          stageError: stageResponse.error,
          settlementError: settlementResponse.error,
          commentVotingError: commentVotingResponse.error
        })
        resetData()
      }
    } else {
      // 實時計算模式：載入評論投票數據並即時計算
      const [commentVotingHttpResponse, stageHttpResponse] = await Promise.all([
        (rpcClient.scoring as any)['comment-voting-data'].$post({
          json: {
            stageId: props.stageId
          }
        }),
        rpcClient.stages.get.$post({
          json: {
            projectId: props.projectId,
            stageId: props.stageId
          }
        })
      ])
      const commentVotingResponse = await commentVotingHttpResponse.json()
      const stageResponse = await stageHttpResponse.json()

      console.log('📊 評論投票數據響應:', commentVotingResponse)
      console.log('📊 階段數據響應:', stageResponse)

      if (commentVotingResponse.success && stageResponse.success) {
        // 設定階段評論獎金池
        commentRewardPool.value = stageResponse.data.commentRewardPool || 0

        // 處理評論投票數據
        const { studentVotes, teacherVotes: teachers, commentInfo } = commentVotingResponse.data
        voteData.value = studentVotes || []
        teacherVotes.value = teachers || []

        // 建立候選評論和投票者列表
        buildCandidateComments(commentInfo)
        buildVotersList()

        // 計算排名和獎金分配
        calculateCommentRankingsAndScores()
      } else {
        console.error('載入評論計票分析失敗:', commentVotingResponse.error || stageResponse.error)
        resetData()
      }
    }
  } catch (error) {
    console.error('載入評論計票分析錯誤:', error)
    resetData()
  } finally {
    loading.value = false
  }
}

const resetData = (): void => {
  candidateComments.value = []
  votersList.value = []
  teacherVotes.value = []
  voteData.value = []
  commentRewardPool.value = 0
}

const buildCandidateComments = (commentInfo: CommentInfo[]): void => {
  const comments: CandidateComment[] = []
  if (commentInfo && Array.isArray(commentInfo)) {
    commentInfo.forEach(comment => {
      comments.push({
        commentId: comment.commentId,
        authorEmail: comment.authorEmail,
        authorDisplayName: comment.authorDisplayName,
        contentPreview: comment.content ? comment.content.substring(0, 20) + '...' : '無內容',
        finalRank: comment.finalRank || null,
        allocatedScore: comment.allocatedPoints || 0,
        studentScore: comment.studentScore || 0,
        teacherScore: comment.teacherScore || 0,
        totalScore: comment.totalScore || 0,
        rankDistribution: {},
        winningRankLevel: 1,
        winningVotes: 0
      })
    })
  }
  // Sort by finalRank (top 3 first) - comments with rank will float to top
  candidateComments.value = comments.sort((a, b) => {
    if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank
    if (a.finalRank) return -1
    if (b.finalRank) return 1
    return 0
  })

  // Generate colors for comment candidates
  generateCommentColors()
}

const buildVotersList = (): void => {
  const voters: Voter[] = []
  const voterSet = new Set<string>()

  voteData.value.forEach(vote => {
    if (!voterSet.has(vote.authorEmail)) {
      voterSet.add(vote.authorEmail)
      voters.push({
        authorEmail: vote.authorEmail,
        proposerDisplayName: vote.proposerDisplayName
      })
    }
  })

  votersList.value = voters

  // Generate colors for voters (light colors for headers)
  generateVoterColors()
}

const generateCommentColors = (): void => {
  commentColorMap.value.clear()
  candidateComments.value.forEach(comment => {
    const color = randomColor({
      luminosity: 'dark',
      format: 'hex'
    })
    commentColorMap.value.set(comment.commentId, color)
  })
}

const generateVoterColors = (): void => {
  voterColorMap.value.clear()
  // Student voters
  votersList.value.forEach(voter => {
    const color = randomColor({
      luminosity: 'bright',
      format: 'hex'
    })
    voterColorMap.value.set(voter.authorEmail, color)
  })
  // Teacher voters
  teacherVotes.value.forEach((teacher, index) => {
    const color = randomColor({
      luminosity: 'bright',
      format: 'hex'
    })
    voterColorMap.value.set(`teacher-${index}`, color)
  })
}

const getCommentHeaderColor = (commentId: string): string => {
  return commentColorMap.value.get(commentId) || '#333333'
}

const getVoterHeaderColor = (voterId: string): string => {
  return voterColorMap.value.get(voterId) || '#e0e0e0'
}

const calculateCommentRankingsAndScores = (): void => {
  if (!candidateComments.value.length) return

  // 計算每個候選評論的加權分數（與後端 comments_api.js calculateCommentRankings 一致）
  const commentScores: Record<string, CommentScore> = {}
  candidateComments.value.forEach(comment => {
    commentScores[comment.commentId] = {
      commentId: comment.commentId,
      studentScore: 0,
      teacherScore: 0,
      totalScore: 0,
      rankDistribution: {}
    }
  })

  // 計算排名分布（用於顯示）
  candidateComments.value.forEach(comment => {
    const commentVotes = voteData.value.filter(v =>
      v.rankingData && v.rankingData.find(r => r.commentId === comment.commentId)
    )

    const rankDistribution: Record<number, number> = {}
    for (let rank = 1; rank <= dynamicMaxCommentSelections.value; rank++) {
      const count = commentVotes.filter(v => {
        const ranking = v.rankingData.find(r => r.commentId === comment.commentId)
        return ranking && ranking.rank === rank
      }).length
      rankDistribution[rank] = count
    }

    comment.rankDistribution = rankDistribution
    commentScores[comment.commentId].rankDistribution = rankDistribution
  })

  // 學生投票平均排名計算（與後端邏輯一致）
  candidateComments.value.forEach(comment => {
    const ranks: number[] = []
    voteData.value.forEach(vote => {
      if (vote.rankingData) {
        const ranking = vote.rankingData.find(r => r.commentId === comment.commentId)
        if (ranking) {
          ranks.push(ranking.rank)
        }
      }
    })
    // 計算學生平均排名，無投票則為999（最差）
    const avgRank = ranks.length > 0
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : 999
    commentScores[comment.commentId].studentScore = avgRank
  })

  // 教師投票平均排名計算（與後端邏輯一致）
  candidateComments.value.forEach(comment => {
    const ranks: number[] = []
    teacherVotes.value.forEach(teacherVote => {
      if (teacherVote.rankingData) {
        const ranking = teacherVote.rankingData.find(r => r.commentId === comment.commentId)
        if (ranking) {
          ranks.push(ranking.rank)
        }
      }
    })
    // 計算教師平均排名，無投票則為999（最差）
    const avgRank = ranks.length > 0
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : 999
    commentScores[comment.commentId].teacherScore = avgRank
  })

  // 計算加權分數：學生平均排名×70% + 教師平均排名×30%（與後端邏輯一致）
  // 加權分數越低，排名越前
  Object.values(commentScores).forEach(score => {
    score.totalScore = score.studentScore * STUDENT_WEIGHT + score.teacherScore * TEACHER_WEIGHT
  })

  // 按加權分數排序（分數越低排名越前）
  const sortedScores = Object.values(commentScores)
    .sort((a, b) => a.totalScore - b.totalScore)

  // 處理同分的排名邏輯（Standard Ranking，與後端一致）
  for (let i = 0; i < sortedScores.length; i++) {
    const score = sortedScores[i]

    // 浮點數比較容差值（FLOAT_EPSILON）：判斷是否同分
    if (i > 0 && Math.abs(sortedScores[i-1].totalScore - score.totalScore) < FLOAT_EPSILON) {
      score.finalRank = sortedScores[i-1].finalRank
    } else {
      // Standard Ranking: use index + 1 (auto-skips for ties)
      score.finalRank = i + 1
    }
  }

  // 更新候選評論的最終排名和分數資訊
  candidateComments.value.forEach(comment => {
    const scoreInfo = commentScores[comment.commentId]
    if (scoreInfo) {
      comment.finalRank = scoreInfo.finalRank || null
      comment.studentScore = scoreInfo.studentScore
      comment.teacherScore = scoreInfo.teacherScore
      comment.totalScore = scoreInfo.totalScore

      // 找出主要得票來源（用於顯示）
      let winningRankLevel = 1
      let maxVotesAtRank = 0
      for (let rank = 1; rank <= dynamicMaxCommentSelections.value; rank++) {
        const votes = comment.rankDistribution[rank] || 0
        if (votes > maxVotesAtRank) {
          maxVotesAtRank = votes
          winningRankLevel = rank
        }
      }
      comment.winningRankLevel = winningRankLevel
      comment.winningVotes = maxVotesAtRank
    }
  })

  // 按最終排名排序
  candidateComments.value.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999))

  // 計算獎金分配（前三名獲獎）
  calculateCommentRewardDistribution()
}

const calculateCommentRewardDistribution = (): void => {
  if (commentRewardPool.value <= 0) {
    candidateComments.value.forEach(comment => {
      comment.allocatedScore = 0
    })
    return
  }

  // 只選取前 N 名評論（N = dynamicMaxCommentSelections）
  const topComments = candidateComments.value.filter(c => c.finalRank && c.finalRank <= dynamicMaxCommentSelections.value)

  if (topComments.length === 0) {
    candidateComments.value.forEach(comment => {
      comment.allocatedScore = 0
    })
    return
  }

  // 使用佔用位置法計算權重（Occupied Rank Method，與後端一致）
  const topRankGroups: Record<number, CandidateComment[]> = {}
  topComments.forEach(comment => {
    const rank = comment.finalRank!
    if (!topRankGroups[rank]) {
      topRankGroups[rank] = []
    }
    topRankGroups[rank].push(comment)
  })

  // Calculate weight for each comment
  const totalTopComments = topComments.length
  let assignedPosition = 0
  let totalWeight = 0
  const commentWeights: Record<string, number> = {}

  const uniqueRanks = Object.keys(topRankGroups).map(Number).sort((a, b) => a - b)
  uniqueRanks.forEach(rank => {
    const tiedComments = topRankGroups[rank]
    const tiedCount = tiedComments.length

    // Calculate total weight for all positions occupied by this rank
    let groupTotalWeight = 0
    for (let i = 0; i < tiedCount; i++) {
      const occupiedPosition = assignedPosition + i
      groupTotalWeight += (totalTopComments - occupiedPosition)
    }

    // Divide equally among tied comments
    const weightPerComment = groupTotalWeight / tiedCount
    tiedComments.forEach(comment => {
      commentWeights[comment.commentId] = weightPerComment
    })

    totalWeight += groupTotalWeight
    assignedPosition += tiedCount
  })

  // Distribute points proportionally to weights
  if (totalWeight > 0) {
    let distributedTotal = 0
    topComments.forEach((comment, index) => {
      if (index < topComments.length - 1) {
        const allocatedScore = Math.round((commentRewardPool.value * commentWeights[comment.commentId]) / totalWeight)
        comment.allocatedScore = allocatedScore
        distributedTotal += allocatedScore
      } else {
        // Last comment gets remaining points to ensure exact total
        comment.allocatedScore = commentRewardPool.value - distributedTotal
      }
    })
  } else {
    // Fallback: equal distribution with last-item adjustment
    let distributedTotal = 0
    const pointsPerComment = Math.round(commentRewardPool.value / topComments.length)
    topComments.forEach((comment, index) => {
      if (index < topComments.length - 1) {
        comment.allocatedScore = pointsPerComment
        distributedTotal += pointsPerComment
      } else {
        comment.allocatedScore = commentRewardPool.value - distributedTotal
      }
    })
  }

  // 非前三名的評論獎金為 0
  candidateComments.value.forEach(comment => {
    if (comment.finalRank && comment.finalRank > 3) {
      comment.allocatedScore = 0
    }
  })
}

const applyCommentSettlementRankings = (rankings: Record<string, SettlementRanking>): void => {
  try {
    console.log('🔍 套用評論結算結果:', rankings)

    // 僅更新排名和獎金分配，保留已從 /scoring/comment-voting-data 載入的分數
    candidateComments.value.forEach(comment => {
      const settlement = rankings[comment.commentId]
      if (settlement) {
        comment.finalRank = settlement.finalRank
        comment.allocatedScore = settlement.allocatedPoints || 0
      }
    })

    // 按最終排名排序 (有名次的排前面，沒名次的排後面)
    candidateComments.value.sort((a, b) => {
      if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank
      if (a.finalRank) return -1
      if (b.finalRank) return 1
      return 0
    })

    // 同時計算排名分布（從投票數據中）
    candidateComments.value.forEach(comment => {
      const commentVotes = voteData.value.filter(v =>
        v.rankingData && v.rankingData.find(r => r.commentId === comment.commentId)
      )

      const rankDistribution: Record<number, number> = {}
      for (let rank = 1; rank <= dynamicMaxCommentSelections.value; rank++) {
        const count = commentVotes.filter(v => {
          const ranking = v.rankingData.find(r => r.commentId === comment.commentId)
          return ranking && ranking.rank === rank
        }).length
        rankDistribution[rank] = count
      }

      comment.rankDistribution = rankDistribution
    })

    console.log('✅ 評論結算結果套用完成:', candidateComments.value)
  } catch (error) {
    console.error('❌ 套用評論結算結果失敗:', error)
    resetData()
  }
}

// ================== Helper Functions ==================

const getVoteRank = (voterEmail: string, commentId: string): number | null => {
  const vote = voteData.value.find(v => v.authorEmail === voterEmail)
  if (!vote || !vote.rankingData) return null

  const ranking = vote.rankingData.find(r => r.commentId === commentId)
  return ranking ? ranking.rank : null
}

const getTeacherVoteRank = (teacher: TeacherVote, commentId: string): number | null => {
  if (!teacher.rankingData) return null

  const ranking = teacher.rankingData.find(r => r.commentId === commentId)
  return ranking ? ranking.rank : null
}

const getRankCellStyle = (rank: number | null): CSSProperties => {
  if (!rank) return {}

  if (rank === 1) {
    return { background: '#ffd700', fontWeight: 'bold', color: '#c7254e' }
  } else if (rank === 2) {
    return { background: '#ffeaa7', fontWeight: 'bold', color: '#000' }
  } else if (rank === 3) {
    return { background: '#fff4cc', fontWeight: 'bold', color: '#000' }
  } else {
    // Use bright random color with black text for ranks 4+
    const bgColor = randomColor({
      luminosity: 'bright',
      format: 'hex',
      seed: rank
    })
    return { background: bgColor, color: '#000' }
  }
}

const getScoreColor = (score: number | undefined, type: 'student' | 'teacher' | 'total' | 'reward' = 'total'): string => {
  if (score === undefined || score === null) return '#f0f0f0'

  let maxScore: number, minScore: number, interpolator: (t: number) => string

  if (type === 'student') {
    const scores = candidateComments.value.map(c => c.studentScore || 0)
    maxScore = Math.max(...scores)
    minScore = Math.min(...scores)
    interpolator = d3.interpolateBlues
  } else if (type === 'teacher') {
    const scores = candidateComments.value.map(c => c.teacherScore || 0)
    maxScore = Math.max(...scores)
    minScore = Math.min(...scores)
    interpolator = d3.interpolateOranges
  } else if (type === 'total') {
    const scores = candidateComments.value.map(c => c.totalScore || 0)
    maxScore = Math.max(...scores)
    minScore = Math.min(...scores)
    interpolator = d3.interpolatePurples
  } else {
    // For allocatedScore (reward)
    const scores = candidateComments.value.map(c => c.allocatedScore || 0)
    maxScore = Math.max(...scores)
    minScore = Math.min(...scores)
    interpolator = d3.interpolateGreens
  }

  if (maxScore === minScore) return interpolator(0.5)

  return d3.scaleSequential()
    .domain([minScore, maxScore])
    .interpolator(interpolator)(score)
}

const handleVisibleChange = (newValue: boolean): void => {
  emit('update:visible', newValue)
}

const handleClose = (): void => {
  emit('update:visible', false)
}

// ================== Computed Properties ==================

const totalAllocatedScore = computed<number>(() => {
  return Math.round(candidateComments.value.reduce((sum, c) => sum + c.allocatedScore, 0) * 100) / 100
})

const hasRewardsToDisplay = computed<boolean>(() => {
  return commentRewardPool.value > 0 && candidateComments.value.some(c => c.allocatedScore > 0)
})

const allCommentsChartData = computed<AllGroupsChartData[]>(() => {
  return candidateComments.value
    .filter(c => c.allocatedScore > 0)
    .map(comment => ({
      rank: comment.finalRank || 999,
      groupId: comment.commentId,
      groupName: comment.authorEmail,
      score: comment.allocatedScore,
      weightedScore: comment.totalScore,
      members: [{
        displayName: comment.authorEmail,
        totalPoints: comment.allocatedScore,
        participationPercentage: 1,
        finalWeight: comment.allocatedScore,
        points: comment.allocatedScore,
        groupId: comment.commentId,
        groupName: comment.authorEmail,
        rank: comment.finalRank || 999,
        isCurrentGroup: true
      }]
    }))
    .sort((a, b) => a.rank - b.rank)
})
</script>

<style scoped>
.analysis-content {
  padding: 20px;
  min-height: 60vh;
}

.info-section {
  margin-bottom: 30px;
}

.info-section ul {
  margin: 10px 0;
  padding-left: 20px;
}

.info-section li {
  margin: 5px 0;
}

/* 圖例樣式 */
.legend {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin: 20px 0;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: white;
  border-radius: 5px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  font-size: 12px;
}

.legend-color {
  width: 30px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.legend-color.rank-1 { background: #ffd700; }
.legend-color.rank-2 { background: #ffeaa7; }
.legend-color.rank-3 { background: #fff4cc; }

/* 表格樣式 */
.table-container {
  overflow-x: auto;
  margin: 20px 0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.voting-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  font-size: 14px;
}

.voting-table th,
.voting-table td {
  padding: 12px;
  text-align: center;
  border: 1px solid #e0e0e0;
}

.voting-table th {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
  position: sticky;
  top: 0;
  z-index: 10;
}

.voting-table th.voter-header {
  background: #409eff;
  min-width: 100px;
}

.voting-table th.stats-header {
  background: #67c23a;
}

.voting-table tr:nth-child(even) {
  background: #f9f9f9;
}

.voting-table tr:hover {
  background: #e8f4ff;
}

.voter-name {
  font-weight: bold;
  background: #e3f2fd !important;
}

.teacher-vote-row {
  background: #fff3e0 !important;
}

.teacher-vote-row:hover {
  background: #ffe0b2 !important;
}

.stats-row {
  font-weight: bold;
}

.stats-label {
  background: #67c23a;
  color: white;
}

.stats-cell {
  background: #f0f9ff;
  font-weight: bold;
}

.total-cell {
  background: #fff9e6 !important;
  font-size: 18px;
  color: #c7254e;
}

.candidate-rank {
  display: inline-block;
  background: rgba(255,255,255,0.3);
  color: white;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: 5px;
}

.comment-preview-header {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 4px;
  font-weight: normal;
}

.vote-count {
  font-size: 18px;
}

.score-amount {
  font-size: 20px;
}

.chart-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.section-header {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.section-header h3 {
  margin: 0;
  color: #2c3e50;
}

/* 圖表容器樣式 */
.chart-container {
  background: white;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e9ecef;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  margin-top: 30px;
}

.chart-title {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 20px;
  color: #333;
}

.stacked-chart {
  width: 100%;
  min-height: 250px;
}

.chart-hint {
  text-align: center;
  color: #666;
  font-size: 14px;
  margin-top: 15px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-rewards-state {
  margin-top: 30px;
  text-align: center;
}

/* 已結算標籤樣式 */
.settled-badge {
  background: #67c23a;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: normal;
  margin-left: 10px;
}

/* el-drawer header 樣式 */
:deep(.el-drawer__header) {
  background: #2c3e50 !important;
  color: white !important;
  padding: 20px 30px !important;
  margin-bottom: 0 !important;
  border-bottom: 1px solid #34495e !important;
}

:deep(.el-drawer__title) {
  color: white !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}

:deep(.el-drawer__close-btn) {
  color: white !important;
}

:deep(.el-drawer__close-btn:hover) {
  color: #ecf0f1 !important;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .analysis-content {
    padding: 15px;
  }

  .chart-container {
    padding: 15px;
  }
}

.comment-preview {
  font-size: 11px;
  color: rgba(255,255,255,0.9);
  margin-top: 4px;
  font-weight: normal;
}
</style>
