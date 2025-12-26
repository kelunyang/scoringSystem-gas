<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    title="評論計票過程分析"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    :z-index="2000"
  >
    <template #header>
      <h3>
        <i class="fas fa-chart-bar"></i> 
        {{ isSettled ? '評論獎金分配結果' : '評論計票過程分析' }}
        <span v-if="isSettled" class="settled-badge">已結算</span>
      </h3>
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
            <p>評論排名採用加權計分機制：</p>
            <ul>
              <li><strong>學生評論投票權重：70%</strong> - 學生投票結果的加權分數</li>
              <li><strong>教師評論投票權重：30%</strong> - 教師投票結果的加權分數</li>
              <li><strong>排名轉分數：</strong>第1名=4分，第2名=3分，第3名=2分</li>
              <li><strong>最終計算：</strong>總分 = 學生平均分×70% + 教師分×30%</li>
              <li><strong>同分處理：</strong>相同加權總分的評論獲得相同排名</li>
              <li><strong>獎金範圍：</strong>僅前三名獲得獎金（第1名：50%，第2名：30%，第3名：20%）</li>
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
        
        <!-- 評論投票結果表格 -->
        <div class="table-container">
          <table class="voting-table">
            <thead>
              <tr>
                <th class="voter-header">投票者 \\ 候選評論</th>
                <th v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="{ background: getRankColor(comment.finalRank), color: 'white' }">
                  {{ comment.authorEmail }}
                  <span class="candidate-rank">第{{ comment.finalRank }}名</span>
                  <div class="comment-preview-header">{{ comment.contentPreview }}</div>
                </th>
                <th class="stats-header">統計</th>
              </tr>
            </thead>
            <tbody>
              <!-- 投票結果行 -->
              <tr v-for="(voter, index) in votersList" :key="voter.authorEmail">
                <td class="voter-name">投票{{ index + 1 }}</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="getRankCellStyle(getVoteRank(voter.authorEmail, comment.commentId))">
                  {{ getVoteRank(voter.authorEmail, comment.commentId) || '-' }}
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 教師投票行 -->
              <tr v-for="(teacher, index) in teacherVotes" :key="'teacher-' + index" class="teacher-vote-row">
                <td class="voter-name">教師{{ index + 1 }}</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="getRankCellStyle(getTeacherVoteRank(teacher, comment.commentId))">
                  {{ getTeacherVoteRank(teacher, comment.commentId) || '-' }}
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 學生分數行 -->
              <tr class="stats-row">
                <td class="stats-label">學生分數 (70%)</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.studentScore, 'student'), color: 'white' }">
                  <div class="score-amount">{{ comment.studentScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 教師分數行 -->
              <tr class="stats-row">
                <td class="stats-label">教師分數 (30%)</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.teacherScore, 'teacher'), color: 'white' }">
                  <div class="score-amount">{{ comment.teacherScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 加權總分行 -->
              <tr class="stats-row">
                <td class="stats-label">加權總分</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.totalScore, 'total'), color: 'white' }">
                  <div class="score-amount">{{ comment.totalScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 獲得獎金行 -->
              <tr class="stats-row">
                <td class="stats-label">獲得獎金</td>
                <td v-for="comment in candidateComments" 
                    :key="comment.commentId"
                    :style="{ background: getScoreColor(comment.allocatedScore), color: 'white' }">
                  <div class="score-amount">🏆 {{ comment.allocatedScore || 0 }} 點</div>
                </td>
                <td class="stats-cell total-cell">總計: {{ totalAllocatedScore }}點</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 獎金分配視覺化圖表 -->
        <div v-if="hasRewardsToDisplay" class="chart-container">
          <div class="chart-title">🏆 獎金分配結果</div>
          <div ref="stackedBarChart" class="stacked-chart"></div>
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
      <div v-if="!loading && candidateComments.length === 0" class="empty-state">
        <el-empty description="暫無評論計票數據">
          <template #image>
            <i class="fas fa-comments" style="font-size: 64px; color: #ddd;"></i>
          </template>
        </el-empty>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import * as d3 from 'd3'
import { ref, watch, nextTick, getCurrentInstance, computed } from 'vue'

export default {
  name: 'CommentVotingAnalysisModal',
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
    stageTitle: {
      type: String,
      default: ''
    },
    isSettled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:visible'],
  setup(props, { emit }) {
    const instance = getCurrentInstance()
    const apiClient = instance.appContext.config.globalProperties.$apiClient
    
    const loading = ref(false)
    const candidateComments = ref([])
    const votersList = ref([])
    const teacherVotes = ref([])
    const commentRewardPool = ref(0)
    const voteData = ref([])
    const stackedBarChart = ref(null)

    // 監聽器
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        loadCommentAnalysis()
      }
    })

    const loadCommentAnalysis = async () => {
      loading.value = true
      try {
        console.log('📊 載入評論計票分析...', { 
          projectId: props.projectId, 
          stageId: props.stageId, 
          isSettled: props.isSettled 
        })
        
        if (props.isSettled) {
          // 結算後模式：載入結算結果數據
          const [stageResponse, settlementResponse, commentVotingResponse] = await Promise.all([
            apiClient.callWithAuth('/stages/get', {
              projectId: props.projectId,
              stageId: props.stageId
            }),
            apiClient.callWithAuth('/scoring/settlement/comment-rankings', {
              projectId: props.projectId,
              stageId: props.stageId
            }),
            apiClient.callWithAuth('/scoring/comment-voting-data', {
              stageId: props.stageId
            })
          ])
          
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
            
            // 建立候選評論和投票者列表
            buildCandidateComments(commentInfo)
            buildVotersList()
            
            // 套用結算結果的排名和分數
            applyCommentSettlementRankings(settlementResponse.data.rankings)
            
            // 渲染圖表 - 延遲確保DOM元素已掛載
            nextTick(() => {
              setTimeout(() => {
                renderStackedBarChart()
              }, 100)
            })
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
          const [commentVotingResponse, stageResponse] = await Promise.all([
            apiClient.callWithAuth('/scoring/comment-voting-data', {
              stageId: props.stageId
            }),
            apiClient.callWithAuth('/stages/get', {
              projectId: props.projectId,
              stageId: props.stageId
            })
          ])
          
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
            
            // 渲染圖表 - 延遲確保DOM元素已掛載
            nextTick(() => {
              setTimeout(() => {
                renderStackedBarChart()
              }, 100)
            })
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
    
    // 重置數據
    const resetData = () => {
      candidateComments.value = []
      votersList.value = []
      teacherVotes.value = []
      voteData.value = []
      commentRewardPool.value = 0
    }
    
    // 建立候選評論列表
    const buildCandidateComments = (commentInfo) => {
      const comments = []
      if (commentInfo && Array.isArray(commentInfo)) {
        commentInfo.forEach(comment => {
          comments.push({
            commentId: comment.commentId,
            authorEmail: comment.authorEmail,
            contentPreview: comment.content ? comment.content.substring(0, 20) + '...' : '無內容',
            finalRank: null,
            allocatedScore: 0,
            rankDistribution: {},
            winningRankLevel: 1,
            winningVotes: 0
          })
        })
      }
      candidateComments.value = comments
    }
    
    // 建立投票者列表
    const buildVotersList = () => {
      const voters = []
      const voterSet = new Set()
      
      voteData.value.forEach(vote => {
        if (!voterSet.has(vote.authorEmail)) {
          voterSet.add(vote.authorEmail)
          voters.push({ authorEmail: vote.authorEmail })
        }
      })
      
      votersList.value = voters
    }
    
    // 計算評論排名和獎金分配 - 使用與submission相同的加權計分邏輯
    const calculateCommentRankingsAndScores = () => {
      if (!candidateComments.value.length) return
      
      const teacherWeight = 0.3
      const studentWeight = 0.7
      
      // 計算每個候選評論的加權分數（與後端 comments_api.js calculateCommentRankings 一致）
      const commentScores = {}
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
        
        const rankDistribution = {}
        for (let rank = 1; rank <= 3; rank++) {
          const count = commentVotes.filter(v => {
            const ranking = v.rankingData.find(r => r.commentId === comment.commentId)
            return ranking && ranking.rank === rank
          }).length
          rankDistribution[rank] = count
        }
        
        comment.rankDistribution = rankDistribution
        commentScores[comment.commentId].rankDistribution = rankDistribution
      })
      
      // 學生投票分數計算（與後端邏輯一致）
      const studentVoteWeight = voteData.value.length > 0 ? studentWeight / voteData.value.length : 0
      voteData.value.forEach(vote => {
        if (vote.rankingData) {
          vote.rankingData.forEach(ranking => {
            // 排名越高分數越高 (第1名=4分, 第2名=3分, 第3名=2分)
            const rankScore = Math.max(0, 5 - ranking.rank)
            if (commentScores[ranking.commentId]) {
              commentScores[ranking.commentId].studentScore += rankScore * studentVoteWeight
            }
          })
        }
      })
      
      // 教師投票分數計算（與後端邏輯一致）
      teacherVotes.value.forEach(teacherVote => {
        if (teacherVote.rankingData) {
          teacherVote.rankingData.forEach(ranking => {
            const rankScore = Math.max(0, 5 - ranking.rank)
            if (commentScores[ranking.commentId]) {
              commentScores[ranking.commentId].teacherScore = rankScore * teacherWeight
            }
          })
        }
      })
      
      // 計算總分和最終排名（與後端邏輯一致）
      Object.values(commentScores).forEach(score => {
        score.totalScore = score.studentScore + score.teacherScore
      })
      
      // 按總分排序並處理同分情況（與後端邏輯一致）
      const sortedScores = Object.values(commentScores)
        .sort((a, b) => b.totalScore - a.totalScore)
      
      // 處理同分的排名邏輯（與後端邏輯一致）
      let currentRank = 1
      for (let i = 0; i < sortedScores.length; i++) {
        const score = sortedScores[i]
        
        // 如果不是第一個且與前一個分數相同，使用相同排名
        if (i > 0 && Math.abs(sortedScores[i-1].totalScore - score.totalScore) < 0.001) {
          score.finalRank = sortedScores[i-1].finalRank
        } else {
          score.finalRank = currentRank
        }
        
        currentRank = i + 2 // 下一個不同分數的排名
      }
      
      // 更新候選評論的最終排名和分數資訊
      candidateComments.value.forEach(comment => {
        const scoreInfo = commentScores[comment.commentId]
        if (scoreInfo) {
          comment.finalRank = scoreInfo.finalRank
          comment.studentScore = scoreInfo.studentScore
          comment.teacherScore = scoreInfo.teacherScore
          comment.totalScore = scoreInfo.totalScore
          
          // 找出主要得票來源（用於顯示）
          let winningRankLevel = 1
          let maxVotesAtRank = 0
          for (let rank = 1; rank <= 3; rank++) {
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
      candidateComments.value.sort((a, b) => a.finalRank - b.finalRank)
      
      // 計算獎金分配（前三名獲獎）
      calculateCommentRewardDistribution()
    }
    
    // 計算評論獎金分配
    const calculateCommentRewardDistribution = () => {
      const distribution = { 1: 0.5, 2: 0.3, 3: 0.2 }
      
      candidateComments.value.forEach(comment => {
        if (comment.finalRank <= 3 && commentRewardPool.value > 0) {
          comment.allocatedScore = Math.round(commentRewardPool.value * distribution[comment.finalRank] * 100) / 100
        } else {
          comment.allocatedScore = 0
        }
      })
    }
    
    // 套用結算結果的排名和分數
    const applyCommentSettlementRankings = (rankings) => {
      try {
        console.log('🔍 套用評論結算結果:', rankings)
        
        // 將結算結果套用到候選評論
        candidateComments.value.forEach(comment => {
          const settlement = rankings[comment.commentId]
          if (settlement) {
            comment.finalRank = settlement.finalRank
            comment.allocatedScore = settlement.allocatedPoints || 0
            comment.studentScore = settlement.studentScore || 0
            comment.teacherScore = settlement.teacherScore || 0
            comment.totalScore = settlement.totalScore || 0
          }
        })
        
        // 按最終排名排序
        candidateComments.value.sort((a, b) => a.finalRank - b.finalRank)
        
        // 同時計算排名分布（從投票數據中）
        candidateComments.value.forEach(comment => {
          const commentVotes = voteData.value.filter(v => 
            v.rankingData && v.rankingData.find(r => r.commentId === comment.commentId)
          )
          
          const rankDistribution = {}
          for (let rank = 1; rank <= 3; rank++) {
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
    
    // 渲染獎金分配圖表
    const renderStackedBarChart = (retryCount = 0) => {
      console.log('🎉 [Comment] renderStackedBarChart 開始執行', {
        hasElement: !!stackedBarChart.value,
        candidateCommentsLength: candidateComments.value.length,
        commentRewardPool: commentRewardPool.value,
        rewardedComments: candidateComments.value.filter(c => c.allocatedScore > 0),
        allocatedScores: candidateComments.value.map(c => ({ commentId: c.commentId, allocatedScore: c.allocatedScore })),
        hasRewardsToDisplay: hasRewardsToDisplay.value,
        retryCount: retryCount
      })
      
      // 如果DOM元素還沒準備好，等待一下再試
      if (!stackedBarChart.value && retryCount < 3) {
        console.log('⏳ [Comment] DOM元素還未準備，等待重試...', { retryCount })
        setTimeout(() => {
          renderStackedBarChart(retryCount + 1)
        }, 200)
        return
      }
      
      if (!stackedBarChart.value || !candidateComments.value.length || !hasRewardsToDisplay.value) {
        console.error('❌ [Comment] 無法渲染圖表', {
          hasElement: !!stackedBarChart.value,
          candidateCommentsLength: candidateComments.value.length,
          hasRewardsToDisplay: hasRewardsToDisplay.value,
          commentRewardPool: commentRewardPool.value,
          retryCount: retryCount
        })
        return
      }
      
      d3.select(stackedBarChart.value).selectAll('*').remove()

      // Get container width for responsive design
      const containerWidth = stackedBarChart.value.offsetWidth || 800
      const margin = { top: 20, right: 40, bottom: 60, left: 60 }
      const width = containerWidth - margin.left - margin.right
      const height = 250 - margin.top - margin.bottom

      const svg = d3.select(stackedBarChart.value)
        .append('svg')
        .attr('width', '100%')
        .attr('height', height + margin.top + margin.bottom)
        .attr('viewBox', `0 0 ${containerWidth} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)
      
      // 只顯示有獎金的評論（前三名）
      const rewardedComments = candidateComments.value.filter(c => c.allocatedScore > 0)
      
      console.log('📊 [Comment] 獎金分配情況:', {
        totalComments: candidateComments.value.length,
        rewardedComments: rewardedComments.length,
        details: candidateComments.value.map(c => ({ 
          commentId: c.commentId, 
          finalRank: c.finalRank, 
          allocatedScore: c.allocatedScore 
        }))
      })
      
      if (!rewardedComments.length) {
        console.warn('⚠️ [Comment] 沒有評論獲得獎金')
        // 顯示空狀態訊息
        const emptyMessage = d3.select(stackedBarChart.value)
          .append('div')
          .style('text-align', 'center')
          .style('padding', '40px')
          .style('color', '#999')
          .html('📊 沒有評論獲得獎金分配')
        return
      }
      
      // 準備 stacked 數據
      let cumulativeX = 0
      const stackedData = rewardedComments.map(comment => {
        const data = {
          ...comment,
          x0: cumulativeX,
          x1: cumulativeX + comment.allocatedScore
        }
        cumulativeX += comment.allocatedScore
        return data
      })
      
      // X軸比例尺
      const x = d3.scaleLinear()
        .domain([0, commentRewardPool.value])
        .range([0, width])
      
      // 顏色比例尺
      const getColor = (rank) => {
        if (rank === 1) return '#ffd700'
        if (rank === 2) return '#ffeaa7'
        if (rank === 3) return '#fff4cc'
        return '#e8f4ff'
      }
      
      const barHeight = 80
      const barY = (height - barHeight) / 2
      
      // 繪製 stacked segments
      svg.selectAll('.segment')
        .data(stackedData)
        .enter()
        .append('rect')
        .attr('class', 'segment')
        .attr('x', d => x(d.x0))
        .attr('y', barY)
        .attr('width', d => Math.max(x(d.x1) - x(d.x0), 1))
        .attr('height', barHeight)
        .attr('fill', d => getColor(d.finalRank))
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('opacity', 0.9)
      
      // 在每個區塊內顯示資訊
      svg.selectAll('.segment-label')
        .data(stackedData.filter(d => (x(d.x1) - x(d.x0)) > 40))
        .enter()
        .append('g')
        .attr('class', 'segment-label')
        .each(function(d) {
          const g = d3.select(this)
          const centerX = x((d.x0 + d.x1) / 2)
          
          g.append('text')
            .attr('x', centerX)
            .attr('y', barY + barHeight / 2 - 12)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text(d.authorEmail)
          
          g.append('text')
            .attr('x', centerX)
            .attr('y', barY + barHeight / 2 + 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', '16px')
            .attr('font-weight', 'bold')
            .attr('fill', '#c7254e')
            .text(`${d.allocatedScore}`)
          
          g.append('text')
            .attr('x', centerX)
            .attr('y', barY + barHeight / 2 + 24)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .text(`#${d.finalRank}`)
        })
      
      // X軸
      svg.append('g')
        .attr('transform', `translate(0,${height - 20})`)
        .call(d3.axisBottom(x).ticks(10))
      
      // X軸標籤
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 40)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(`獎金分數（總獎金池: ${commentRewardPool.value}點）`)
    }
    
    // 輔助函數
    const getVoteRank = (voterEmail, commentId) => {
      const vote = voteData.value.find(v => v.authorEmail === voterEmail)
      if (!vote || !vote.rankingData) return null
      
      const ranking = vote.rankingData.find(r => r.commentId === commentId)
      return ranking ? ranking.rank : null
    }
    
    const getTeacherVoteRank = (teacher, commentId) => {
      if (!teacher.rankingData) return null
      
      const ranking = teacher.rankingData.find(r => r.commentId === commentId)
      return ranking ? ranking.rank : null
    }
    
    const getRankColor = (rank) => {
      return d3.scaleSequential()
        .domain([candidateComments.value.length, 1])
        .interpolator(d3.interpolateBlues)(rank)
    }
    
    const getRankCellStyle = (rank) => {
      if (!rank) return {}
      
      if (rank === 1) {
        return { background: '#ffd700', fontWeight: 'bold', color: '#c7254e' }
      } else if (rank === 2) {
        return { background: '#ffeaa7', fontWeight: 'bold' }
      } else if (rank === 3) {
        return { background: '#fff4cc', fontWeight: 'bold' }
      } else {
        const maxRank = 3
        const colorIntensity = 1 - ((rank - 1) / maxRank)
        const bgColor = d3.interpolateRgb('#fff', '#e0e0e0')(colorIntensity)
        return { background: bgColor }
      }
    }
    
    const getVoteCountColor = (votes) => {
      const maxVotes = Math.max(...candidateComments.value.map(c => c.winningVotes))
      return d3.scaleSequential()
        .domain([0, maxVotes])
        .interpolator(d3.interpolateReds)(votes)
    }
    
    const getScoreColor = (score, type = 'total') => {
      if (score === undefined || score === null) return '#f0f0f0'
      
      let maxScore, minScore, interpolator
      
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
    
    const totalAllocatedScore = computed(() => {
      return Math.round(candidateComments.value.reduce((sum, c) => sum + c.allocatedScore, 0) * 100) / 100
    })
    
    const hasRewardsToDisplay = computed(() => {
      return commentRewardPool.value > 0 && candidateComments.value.some(c => c.allocatedScore > 0)
    })
    
    const handleVisibleChange = (newValue) => {
      emit('update:visible', newValue)
    }
    
    const handleClose = () => {
      emit('update:visible', false)
    }
    
    return {
      loading,
      candidateComments,
      votersList,
      teacherVotes,
      commentRewardPool,
      stackedBarChart,
      totalAllocatedScore,
      hasRewardsToDisplay,
      getVoteRank,
      getTeacherVoteRank,
      getRankColor,
      getRankCellStyle,
      getVoteCountColor,
      getScoreColor,
      handleVisibleChange,
      handleClose
    }
  }
}
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

/* 響應式設計 */
@media (max-width: 768px) {
  .analysis-content {
    padding: 15px;
  }
  
  .chart-container {
    padding: 15px;
  }
}
</style>