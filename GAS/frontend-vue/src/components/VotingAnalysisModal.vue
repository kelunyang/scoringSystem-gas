<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    title="互評計票過程分析"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    :z-index="2000"
  >
    <template #header>
      <h3>
        <i class="fas fa-chart-bar"></i> 
        {{ isSettled ? '互評獎金分配結果' : '互評計票過程分析' }}
        <span v-if="isSettled" class="settled-badge">已結算</span>
      </h3>
    </template>

    <div class="analysis-content" v-loading="loading" element-loading-text="載入計票數據中...">
      
      <!-- 計票說明 -->
      <div class="info-section">
        <el-alert
          title="計票方式說明"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>本系統採用加權計分機制：</p>
            <ul>
              <li><strong>學生互評權重：70%</strong> - 各組同儕評分結果的加權分數</li>
              <li><strong>教師評分權重：30%</strong> - 教師專業評分結果的加權分數</li>
              <li><strong>排名轉分數：</strong>第1名=4分，第2名=3分，第3名=2分，第4名=1分</li>
              <li><strong>最終計算：</strong>總分 = 學生平均分×70% + 教師分×30%</li>
              <li><strong>同分處理：</strong>相同加權總分的組別獲得相同排名</li>
            </ul>
          </template>
        </el-alert>
      </div>

      <!-- 計票結果分析 -->
      <div class="chart-section" v-if="!loading">
        <div class="section-header">
          <h3><i class="fas fa-trophy"></i> 投票結果表格</h3>
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
        
        <!-- 投票結果表格 -->
        <div class="table-container">
          <table class="voting-table">
            <thead>
              <tr>
                <th class="voter-header">投票者 \\ 候選組別</th>
                <th v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="{ background: getRankColor(candidate.finalRank), color: 'white' }">
                  {{ candidate.groupName }}
                  <span class="candidate-rank">第{{ candidate.finalRank }}名</span>
                </th>
                <th class="stats-header">統計</th>
              </tr>
            </thead>
            <tbody>
              <!-- 投票結果行 -->
              <tr v-for="(voter, index) in votersList" :key="voter.groupId">
                <td class="voter-name">投票{{ index + 1 }}</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="getRankCellStyle(getVoteRank(voter.groupId, candidate.groupId))">
                  {{ getVoteRank(voter.groupId, candidate.groupId) || '-' }}
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 教師投票行 -->
              <tr v-for="(teacher, index) in teacherVotes" :key="'teacher-' + index" class="teacher-vote-row">
                <td class="voter-name">教師{{ index + 1 }}</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="getRankCellStyle(getTeacherVoteRank(teacher, candidate.groupId))">
                  {{ getTeacherVoteRank(teacher, candidate.groupId) || '-' }}
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 學生分數行 -->
              <tr class="stats-row">
                <td class="stats-label">學生分數 (70%)</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.studentScore, 'student'), color: 'white' }">
                  <div class="score-amount">{{ candidate.studentScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 教師分數行 -->
              <tr class="stats-row">
                <td class="stats-label">教師分數 (30%)</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.teacherScore, 'teacher'), color: 'white' }">
                  <div class="score-amount">{{ candidate.teacherScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 加權總分行 -->
              <tr class="stats-row">
                <td class="stats-label">加權總分</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.totalScore, 'total'), color: 'white' }">
                  <div class="score-amount">{{ candidate.totalScore?.toFixed(2) || '0.00' }}</div>
                </td>
                <td class="stats-cell">-</td>
              </tr>
              
              <!-- 獲得獎金行 -->
              <tr class="stats-row">
                <td class="stats-label">獲得獎金</td>
                <td v-for="candidate in candidateGroups" 
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.allocatedScore), color: 'white' }">
                  <div class="score-amount">🏆 {{ candidate.allocatedScore }} 點</div>
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
        <div v-if="!hasRewardsToDisplay && candidateGroups.length > 0" class="empty-rewards-state">
          <el-alert
            title="暫無獎金分配"
            type="info"
            description="本階段尚未設定獎金池或所有組別獎金為0，無法顯示分配圖表。"
            :closable="false"
            show-icon
          />
        </div>
      </div>
      
      <!-- 空狀態 -->
      <div v-if="!loading && rankingDetails.length === 0" class="empty-state">
        <el-empty description="暫無計票數據">
          <template #image>
            <i class="fas fa-vote-yea" style="font-size: 64px; color: #ddd;"></i>
          </template>
        </el-empty>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import { ref, watch, nextTick, getCurrentInstance, computed } from 'vue'
import * as d3 from 'd3'

export default {
  name: 'VotingAnalysisModal',
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
    const rankingDetails = ref([])
    const candidateGroups = ref([])
    const votersList = ref([])
    const teacherVotes = ref([])
    const stageRewardPool = ref(0)
    const voteData = ref([])
    const d3Chart = ref(null)
    const stackedBarChart = ref(null)
    
    // 監聽器
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        loadVotingAnalysis()
      }
    })
    
    const loadVotingAnalysis = async () => {
      loading.value = true
      try {
        console.log('📊 載入互評計票分析...', { 
          projectId: props.projectId, 
          stageId: props.stageId, 
          isSettled: props.isSettled 
        })
        
        if (props.isSettled) {
          // 結算後模式：載入結算結果數據
          const [stageResponse, settlementResponse] = await Promise.all([
            apiClient.callWithAuth('/stages/get', {
              projectId: props.projectId,
              stageId: props.stageId
            }),
            apiClient.callWithAuth('/scoring/settlement/stage-rankings', {
              projectId: props.projectId,
              stageId: props.stageId
            })
          ])
          
          console.log('📊 階段API響應:', stageResponse)
          console.log('📊 結算API響應:', settlementResponse)
          
          if (stageResponse.success && settlementResponse.success && settlementResponse.data.settled) {
            // 設定階段獎金池
            stageRewardPool.value = stageResponse.data.reportRewardPool || 0
            
            // 載入投票數據以顯示詳細分析
            const votingResponse = await apiClient.callWithAuth('/scoring/voting-data', {
              stageId: props.stageId
            })
            
            if (votingResponse.success) {
              const { studentVotes, teacherVotes: teachers, groupInfo } = votingResponse.data
              voteData.value = studentVotes || []
              teacherVotes.value = teachers || []
              
              // 建立候選組別和投票者列表
              buildCandidateGroups(groupInfo)
              buildVotersList()
              
              // 套用結算結果的排名和分數
              applySettlementRankings(settlementResponse.data.rankings)
              
              // 渲染圖表 - 延遲確保DOM元素已掛載
              nextTick(() => {
                setTimeout(() => {
                  renderStackedBarChart()
                }, 100)
              })
            } else {
              console.error('無法載入投票數據')
              resetData()
            }
          } else {
            console.error('階段尚未結算或數據不完整', {
              stageSuccess: stageResponse.success,
              settlementSuccess: settlementResponse.success,
              settled: settlementResponse.data?.settled,
              stageError: stageResponse.error,
              settlementError: settlementResponse.error
            })
            resetData()
          }
        } else {
          // 實時計算模式：載入投票數據並即時計算
          const [votingResponse, stageResponse] = await Promise.all([
            apiClient.callWithAuth('/scoring/voting-data', {
              stageId: props.stageId
            }),
            apiClient.callWithAuth('/stages/get', {
              projectId: props.projectId,
              stageId: props.stageId
            })
          ])
          
          console.log('📊 投票數據響應:', votingResponse)
          console.log('📊 階段數據響應:', stageResponse)
          
          if (votingResponse.success && stageResponse.success) {
            // 設定階段獎金池
            stageRewardPool.value = stageResponse.data.reportRewardPool || 0
            
            // 處理投票數據
            const { studentVotes, teacherVotes: teachers, groupInfo } = votingResponse.data
            voteData.value = studentVotes || []
            teacherVotes.value = teachers || []
            
            // 建立候選組別和投票者列表
            buildCandidateGroups(groupInfo)
            buildVotersList()
            
            // 計算排名和獎金分配
            calculateRankingsAndScores()
            
            // 渲染圖表 - 延遲確保DOM元素已掛載
            nextTick(() => {
              setTimeout(() => {
                renderStackedBarChart()
              }, 100)
            })
          } else {
            console.error('載入計票分析失敗:', votingResponse.error || stageResponse.error)
            resetData()
          }
        }
      } catch (error) {
        console.error('載入計票分析錯誤:', error)
        resetData()
      } finally {
        loading.value = false
      }
    }
    
    // 重置數據
    const resetData = () => {
      candidateGroups.value = []
      votersList.value = []
      teacherVotes.value = []
      voteData.value = []
      stageRewardPool.value = 0
    }
    
    // 建立候選組別列表
    const buildCandidateGroups = (groupInfo) => {
      const groups = []
      if (groupInfo && Array.isArray(groupInfo)) {
        groupInfo.forEach(group => {
          groups.push({
            groupId: group.groupId,
            groupName: group.groupName,
            finalRank: null,
            allocatedScore: 0,
            rankDistribution: {},
            winningRankLevel: 1,
            winningVotes: 0
          })
        })
      }
      candidateGroups.value = groups
    }
    
    // 建立投票者列表
    const buildVotersList = () => {
      const voters = []
      const voterSet = new Set()
      
      voteData.value.forEach(vote => {
        if (!voterSet.has(vote.groupId)) {
          voterSet.add(vote.groupId)
          voters.push({ groupId: vote.groupId })
        }
      })
      
      votersList.value = voters
    }
    
    // 套用結算結果的排名和分數
    const applySettlementRankings = (rankings) => {
      try {
        console.log('🔍 套用結算結果:', rankings)
        
        // 將結算結果套用到候選組別
        candidateGroups.value.forEach(candidate => {
          const settlement = rankings[candidate.groupId]
          if (settlement) {
            candidate.finalRank = settlement.finalRank
            candidate.allocatedScore = settlement.allocatedPoints || 0
            
            // 計算每個組別的成員總分配
            if (settlement.memberPointsDistribution && settlement.memberPointsDistribution.length > 0) {
              const totalMemberPoints = settlement.memberPointsDistribution.reduce((sum, member) => sum + (member.individualPoints || 0), 0)
              candidate.allocatedScore = Math.round(totalMemberPoints * 100) / 100
            }
          }
        })
        
        // 按最終排名排序
        candidateGroups.value.sort((a, b) => a.finalRank - b.finalRank)
        
        console.log('💰 結算後的 allocatedScore:', candidateGroups.value.map(c => ({
          groupId: c.groupId,
          finalRank: c.finalRank,
          allocatedScore: c.allocatedScore
        })))
        
        // 同時計算分數（從投票數據中） - 但不覆蓋 allocatedScore
        const originalAllocatedScores = candidateGroups.value.map(c => ({ groupId: c.groupId, allocatedScore: c.allocatedScore }))
        calculateRankingsAndScores()
        
        // 恢復結算的 allocatedScore
        originalAllocatedScores.forEach(original => {
          const candidate = candidateGroups.value.find(c => c.groupId === original.groupId)
          if (candidate) {
            candidate.allocatedScore = original.allocatedScore
          }
        })
        
        console.log('✅ 結算結果套用完成:', candidateGroups.value)
      } catch (error) {
        console.error('❌ 套用結算結果失敗:', error)
        resetData()
      }
    }
    
    // 計算排名和獎金分配 - 使用後端相同的加權計分邏輯
    const calculateRankingsAndScores = () => {
      if (!candidateGroups.value.length) return
      
      const teacherWeight = 0.3
      const studentWeight = 0.7
      
      // 計算每個候選組別的加權分數（與後端 scoring_engine.js calculateVotingResults 一致）
      const groupScores = {}
      candidateGroups.value.forEach(candidate => {
        groupScores[candidate.groupId] = {
          groupId: candidate.groupId,
          studentScore: 0,
          teacherScore: 0,
          totalScore: 0,
          rankDistribution: {}
        }
      })
      
      // 計算排名分布（用於顯示）
      candidateGroups.value.forEach(candidate => {
        const candidateVotes = voteData.value.filter(v => 
          v.rankingData && v.rankingData.find(r => r.groupId === candidate.groupId)
        )
        
        const rankDistribution = {}
        for (let rank = 1; rank <= candidateGroups.value.length; rank++) {
          const count = candidateVotes.filter(v => {
            const ranking = v.rankingData.find(r => r.groupId === candidate.groupId)
            return ranking && ranking.rank === rank
          }).length
          rankDistribution[rank] = count
        }
        
        candidate.rankDistribution = rankDistribution
        groupScores[candidate.groupId].rankDistribution = rankDistribution
      })
      
      // 學生投票分數計算（與後端邏輯一致）
      const studentVoteWeight = voteData.value.length > 0 ? studentWeight / voteData.value.length : 0
      voteData.value.forEach(vote => {
        if (vote.rankingData) {
          vote.rankingData.forEach(ranking => {
            // 排名越高分數越高 (第1名=4分, 第2名=3分, 第3名=2分, 第4名=1分)
            const rankScore = Math.max(0, 5 - ranking.rank)
            if (groupScores[ranking.groupId]) {
              groupScores[ranking.groupId].studentScore += rankScore * studentVoteWeight
            }
          })
        }
      })
      
      // 教師投票分數計算（與後端邏輯一致）
      teacherVotes.value.forEach(teacherVote => {
        if (teacherVote.rankingData) {
          teacherVote.rankingData.forEach(ranking => {
            const rankScore = Math.max(0, 5 - ranking.rank)
            if (groupScores[ranking.groupId]) {
              groupScores[ranking.groupId].teacherScore = rankScore * teacherWeight
            }
          })
        }
      })
      
      // 計算總分和最終排名（與後端邏輯一致）
      Object.values(groupScores).forEach(score => {
        score.totalScore = score.studentScore + score.teacherScore
      })
      
      // 按總分排序並處理同分情況（與後端邏輯一致）
      const sortedScores = Object.values(groupScores)
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
      
      // 更新候選組別的最終排名和分數資訊
      candidateGroups.value.forEach(candidate => {
        const scoreInfo = groupScores[candidate.groupId]
        if (scoreInfo) {
          candidate.finalRank = scoreInfo.finalRank
          candidate.studentScore = scoreInfo.studentScore
          candidate.teacherScore = scoreInfo.teacherScore
          candidate.totalScore = scoreInfo.totalScore
          
          // 找出主要得票來源（用於顯示）
          let winningRankLevel = 1
          let maxVotesAtRank = 0
          for (let rank = 1; rank <= candidateGroups.value.length; rank++) {
            const votes = candidate.rankDistribution[rank] || 0
            if (votes > maxVotesAtRank) {
              maxVotesAtRank = votes
              winningRankLevel = rank
            }
          }
          candidate.winningRankLevel = winningRankLevel
          candidate.winningVotes = maxVotesAtRank
        }
      })
      
      // 按最終排名排序
      candidateGroups.value.sort((a, b) => a.finalRank - b.finalRank)
      
      // 計算獎金分配（線性權重分配）
      calculateRewardDistribution()
    }
    
    // 計算獎金分配
    const calculateRewardDistribution = () => {
      const totalParticipants = candidateGroups.value.length
      
      // 處理並列名次
      const rankGroups = {}
      candidateGroups.value.forEach(candidate => {
        if (!rankGroups[candidate.finalRank]) {
          rankGroups[candidate.finalRank] = []
        }
        rankGroups[candidate.finalRank].push(candidate)
      })
      
      // 計算每個位置的權重
      const uniqueRanks = Object.keys(rankGroups).map(Number).sort((a, b) => a - b)
      let assignedPosition = 0
      let totalWeight = 0
      const rankWeights = {}
      
      uniqueRanks.forEach(rank => {
        const group = rankGroups[rank]
        const groupSize = group.length
        
        let groupTotalWeight = 0
        for (let i = 0; i < groupSize; i++) {
          groupTotalWeight += (totalParticipants - assignedPosition - i)
        }
        
        rankWeights[rank] = groupTotalWeight / groupSize
        totalWeight += groupTotalWeight
        assignedPosition += groupSize
      })
      
      // 按權重分配獎金
      uniqueRanks.forEach(rank => {
        const group = rankGroups[rank]
        const weightPerPerson = rankWeights[rank]
        const scorePerPerson = (weightPerPerson / totalWeight) * stageRewardPool.value
        
        group.forEach(candidate => {
          candidate.allocatedScore = Math.round(scorePerPerson * 100) / 100
        })
      })
      
      // 微調以確保總和等於獎金池
      const actualTotal = candidateGroups.value.reduce((sum, c) => sum + c.allocatedScore, 0)
      const diff = stageRewardPool.value - actualTotal
      if (Math.abs(diff) > 0.01 && candidateGroups.value.length > 0) {
        candidateGroups.value[0].allocatedScore = Math.round((candidateGroups.value[0].allocatedScore + diff) * 100) / 100
      }
    }
    
    // 渲染獎金分配圖表
    const renderStackedBarChart = (retryCount = 0) => {
      console.log('🎉 renderStackedBarChart 開始執行', {
        hasElement: !!stackedBarChart.value,
        candidateGroupsLength: candidateGroups.value.length,
        stageRewardPool: stageRewardPool.value,
        allocatedScores: candidateGroups.value.map(c => ({ groupId: c.groupId, allocatedScore: c.allocatedScore })),
        hasRewardsToDisplay: hasRewardsToDisplay.value,
        retryCount: retryCount
      })
      
      // 如果DOM元素還沒準備好，等待一下再試
      if (!stackedBarChart.value && retryCount < 3) {
        console.log('⏳ DOM元素還未準備，等待重試...', { retryCount })
        setTimeout(() => {
          renderStackedBarChart(retryCount + 1)
        }, 200)
        return
      }
      
      if (!stackedBarChart.value || !candidateGroups.value.length || !hasRewardsToDisplay.value) {
        console.error('❌ 無法渲染圖表', {
          hasElement: !!stackedBarChart.value,
          candidateGroupsLength: candidateGroups.value.length,
          hasRewardsToDisplay: hasRewardsToDisplay.value,
          stageRewardPool: stageRewardPool.value,
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
      
      // 準備 stacked 數據
      let cumulativeX = 0
      const stackedData = candidateGroups.value.map(candidate => {
        const data = {
          ...candidate,
          x0: cumulativeX,
          x1: cumulativeX + candidate.allocatedScore
        }
        cumulativeX += candidate.allocatedScore
        return data
      })
      
      // X軸比例尺
      const x = d3.scaleLinear()
        .domain([0, stageRewardPool.value])
        .range([0, width])
      
      // 顏色比例尺
      const getColor = (rank) => {
        if (rank === 1) return '#ffd700'
        if (rank === 2) return '#ffeaa7'
        if (rank === 3) return '#fff4cc'
        if (rank === 4) return '#e8f4ff'
        return d3.interpolateRgb('#d4e6f1', '#e0e0e0')((rank - 5) / Math.max(candidateGroups.value.length - 5, 1))
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
            .text(d.groupName)
          
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
        .text(`獎金分數（總獎金池: ${stageRewardPool.value}點）`)
    }
    
    const getRankTagType = (rank) => {
      switch (rank) {
        case 1: return 'warning' // 金色
        case 2: return 'info'    // 銀色
        case 3: return 'danger'  // 銅色
        default: return 'primary'
      }
    }
    
    const handleVisibleChange = (newValue) => {
      emit('update:visible', newValue)
    }
    
    const handleClose = () => {
      emit('update:visible', false)
    }
    
    // 輔助函數
    const getVoteRank = (voterGroupId, candidateGroupId) => {
      const vote = voteData.value.find(v => v.groupId === voterGroupId)
      if (!vote || !vote.rankingData) return null
      
      const ranking = vote.rankingData.find(r => r.groupId === candidateGroupId)
      return ranking ? ranking.rank : null
    }
    
    const getTeacherVoteRank = (teacher, candidateGroupId) => {
      if (!teacher.rankingData) return null
      
      const ranking = teacher.rankingData.find(r => r.groupId === candidateGroupId)
      return ranking ? ranking.rank : null
    }
    
    const getRankColor = (rank) => {
      return d3.scaleSequential()
        .domain([candidateGroups.value.length, 1])
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
        const maxRank = candidateGroups.value.length
        const colorIntensity = 1 - ((rank - 1) / maxRank)
        const bgColor = d3.interpolateRgb('#fff', '#e0e0e0')(colorIntensity)
        return { background: bgColor }
      }
    }
    
    const getVoteCountColor = (votes) => {
      const maxVotes = Math.max(...candidateGroups.value.map(c => c.winningVotes))
      return d3.scaleSequential()
        .domain([0, maxVotes])
        .interpolator(d3.interpolateReds)(votes)
    }
    
    const getScoreColor = (score, type = 'total') => {
      if (score === undefined || score === null) return '#f0f0f0'
      
      let maxScore, minScore, interpolator
      
      if (type === 'student') {
        const scores = candidateGroups.value.map(c => c.studentScore || 0)
        maxScore = Math.max(...scores)
        minScore = Math.min(...scores)
        interpolator = d3.interpolateBlues
      } else if (type === 'teacher') {
        const scores = candidateGroups.value.map(c => c.teacherScore || 0)
        maxScore = Math.max(...scores)
        minScore = Math.min(...scores)
        interpolator = d3.interpolateOranges
      } else if (type === 'total') {
        const scores = candidateGroups.value.map(c => c.totalScore || 0)
        maxScore = Math.max(...scores)
        minScore = Math.min(...scores)
        interpolator = d3.interpolatePurples
      } else {
        // For allocatedScore (reward)
        const scores = candidateGroups.value.map(c => c.allocatedScore || 0)
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
      return Math.round(candidateGroups.value.reduce((sum, c) => sum + c.allocatedScore, 0) * 100) / 100
    })
    
    const hasRewardsToDisplay = computed(() => {
      return stageRewardPool.value > 0 && candidateGroups.value.some(c => c.allocatedScore > 0)
    })
    
    return {
      loading,
      rankingDetails,
      candidateGroups,
      votersList,
      teacherVotes,
      stageRewardPool,
      d3Chart,
      stackedBarChart,
      totalAllocatedScore,
      hasRewardsToDisplay,
      getVoteRank,
      getTeacherVoteRank,
      getRankColor,
      getRankCellStyle,
      getVoteCountColor,
      getScoreColor,
      getRankTagType,
      handleVisibleChange,
      handleClose
    }
  }
}
</script>

<style scoped>
.analysis-content {
  padding: 20px;
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

.chart-section {
  margin-bottom: 30px;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h3 {
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
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

.vote-count {
  font-size: 18px;
}

.score-amount {
  font-size: 20px;
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
  
  .details-table {
    padding: 15px;
  }
}
</style>