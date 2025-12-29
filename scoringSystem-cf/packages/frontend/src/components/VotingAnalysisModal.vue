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
          <i class="fas fa-chart-bar"></i>
          互評計票過程分析
        </el-breadcrumb-item>
      </el-breadcrumb>
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
            <p>提交排名採用平均排名加權法，按「佔用位置法」分配獎金：</p>
            <ul>
              <li><strong>步驟1 - 計算平均排名：</strong>每個組別分別計算學生投票和教師投票的平均排名</li>
              <li><strong>步驟2 - 加權計分：</strong>加權分數 = 學生平均排名×70% + 教師平均排名×30%</li>
              <li><strong>步驟3 - 決定排名：</strong>加權分數越低，排名越前（採用Standard Ranking，並列者共享排名，下一名自動跳號）</li>
              <li><strong>步驟4 - 分配獎金（佔用位置法）：</strong>
                <ul style="margin-top: 8px;">
                  <li>每個排名位置有對應權重：第1位權重=N，第2位=N-1，...，第N位=1（N為總組數）</li>
                  <li>並列者佔用連續位置，平分這些位置的總權重</li>
                  <li>例：4組競賽，第2名2組並列 → 佔用位置2和3 → 每組權重=(3+2)/2=2.5</li>
                  <li>最後按權重比例分配獎金池</li>
                </ul>
              </li>
              <li><strong>重要特性：</strong>
                <span style="color: #E6A23C;">並列者獲得相同獎勵；排名越前獎勵越高，即使並列也比後面排名多</span>
              </li>
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

        <!-- 投票結果表格 (XY 軸對調) -->
        <div class="table-container">
          <table class="voting-table">
            <thead>
              <tr>
                <th class="candidate-header-label">投票者 \\ 候選組別</th>
                <!-- Candidate groups as columns -->
                <th v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="{ background: getCandidateHeaderColor(candidate.groupId), color: 'white' }">
                  <div>{{ candidate.groupName }}</div>
                  <div v-if="candidate.finalRank" class="candidate-rank">第{{ candidate.finalRank }}名</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Each student voter as a row -->
              <tr v-for="(voter, index) in votersList" :key="voter.groupId">
                <td class="voter-name"
                    :style="{ background: getVoterHeaderColor(voter.groupId), color: '#000' }">
                  {{ voter.proposerDisplayName || '學生' + (index + 1) }}({{ voter.proposerEmail || voter.groupId }})
                </td>
                <!-- This voter's ranking for each candidate -->
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="getRankCellStyle(getVoteRank(voter.groupId, candidate.groupId))">
                  {{ getVoteRank(voter.groupId, candidate.groupId) || '-' }}
                </td>
              </tr>

              <!-- Each teacher voter as a row -->
              <tr v-for="(teacher, index) in teacherVotes" :key="'teacher-' + index">
                <td class="voter-name"
                    :style="{ background: getVoterHeaderColor(`teacher-${index}`), color: '#000' }">
                  {{ teacher.teacherDisplayName || '教師' + (index + 1) }}({{ teacher.teacherEmail }})
                </td>
                <!-- This teacher's ranking for each candidate -->
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="getRankCellStyle(getTeacherVoteRank(teacher, candidate.groupId))">
                  {{ getTeacherVoteRank(teacher, candidate.groupId) || '-' }}
                </td>
              </tr>

              <!-- Score rows at the bottom (transposed) -->
              <tr class="stats-row">
                <td class="stats-label">學生分數 (70%)</td>
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.studentScore, 'student'), color: 'white' }">
                  <div class="score-amount">{{ candidate.studentScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">教師分數 (30%)</td>
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.teacherScore, 'teacher'), color: 'white' }">
                  <div class="score-amount">{{ candidate.teacherScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">加權總分</td>
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.totalScore, 'total'), color: 'white' }">
                  <div class="score-amount">{{ candidate.totalScore?.toFixed(2) || '0.00' }}</div>
                </td>
              </tr>

              <tr class="stats-row">
                <td class="stats-label">獲得獎金</td>
                <td v-for="candidate in candidateGroups"
                    :key="candidate.groupId"
                    :style="{ background: getScoreColor(candidate.allocatedScore), color: 'white' }">
                  <div class="score-amount">🏆 {{ candidate.allocatedScore }} 點</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 獎金分配視覺化圖表 -->
        <div v-if="hasRewardsToDisplay" class="chart-container">
          <el-divider content-position="left">🏆 獎金分配視覺化</el-divider>
          <AllGroupsChart
            :selected-members="[]"
            :simulated-rank="1"
            :simulated-group-count="candidateGroups.length"
            :report-reward="stageRewardPool"
            :all-groups="allGroupsChartData as any"
            :current-group-id="null"
            :total-project-groups="candidateGroups.length"
            :current-group-label="''"
            :group-by-rank="false"
            :clickable="true"
            @group-click="handleGroupClick"
          />
          <div class="chart-hint">
            <i class="fas fa-lightbulb"></i> 點擊任一組別可查看該組成員的實際點數分配（如有結算記錄）
          </div>
        </div>

        <!-- Selected Group Detail (if clicked) -->
        <div v-if="selectedGroup" class="selected-group-detail">
          <el-divider content-position="left">
            {{ selectedGroup.groupName }} - 組內點數分配詳情
            <el-button
              size="small"
              @click="selectedGroup = null"
              style="margin-left: 10px;"
            >
              <i class="fas fa-times"></i> 關閉
            </el-button>
          </el-divider>

          <el-button
            type="primary"
            style="margin-bottom: 15px;"
            @click="showScoringExplanation = true"
          >
            <i class="fas fa-calculator"></i> 點數計算說明
          </el-button>

          <OurGroupChart
            :members="(selectedGroup.members || []) as any"
            :group-name="selectedGroup.groupName"
            :rank="selectedGroup.finalRank"
            :total-points="selectedGroup.allocatedScore"
          />
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
      <EmptyState
        v-if="!loading && rankingDetails.length === 0"
        :icons="['fa-vote-yea']"
        title="暫無計票數據"
        parent-icon="fa-chart-bar"
      />
    </div>

    <!-- Scoring Explanation Drawer -->
    <ScoringExplanationDrawer
      v-if="selectedGroup"
      v-model:visible="showScoringExplanation"
      :group-data="{
        groupName: selectedGroup.groupName,
        finalRank: selectedGroup.finalRank,
        totalGroups: candidateGroups.length,
        allocatedPoints: selectedGroup.allocatedScore,
        studentScore: candidateGroups.find(g => g.groupId === selectedGroup?.groupId)?.studentScore,
        teacherScore: candidateGroups.find(g => g.groupId === selectedGroup?.groupId)?.teacherScore,
        totalScore: candidateGroups.find(g => g.groupId === selectedGroup?.groupId)?.totalScore,
        members: selectedGroup.members
      }"
      :project-config="{
        studentWeight: 0.7,
        teacherWeight: 0.3,
        rewardPool: stageRewardPool
      }"
      mode="report"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, computed, type CSSProperties } from 'vue'
import * as d3 from 'd3'
import EmptyState from '@/components/shared/EmptyState.vue'
import randomColor from 'randomcolor'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import OurGroupChart from './shared/ContributionChart/OurGroupChart.vue'
import ScoringExplanationDrawer from './shared/ScoringExplanationDrawer.vue'
import { rpcClient } from '@/utils/rpc-client'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import type { GroupClickData } from '@/types/components'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// TypeScript interfaces
export interface RankingData {
  groupId: string
  rank: number
}

export interface VoteData {
  groupId: string
  proposerEmail: string
  proposerDisplayName: string
  rankingData?: RankingData[]
}

export interface TeacherVote {
  teacherEmail: string
  teacherDisplayName?: string
  rankingData?: RankingData[]
}

export interface CandidateGroup {
  groupId: string
  groupName: string
  finalRank: number | null
  allocatedScore: number
  studentScore: number
  teacherScore: number
  totalScore: number
  rankDistribution: Record<number, number>
  winningRankLevel: number
  winningVotes: number
}

export interface VoterInfo {
  groupId: string
  proposerEmail: string
  proposerDisplayName: string
}

export interface SelectedGroupMember {
  email: string
  displayName: string
  points: number
  contribution: number
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string
}

export interface SelectedGroup {
  groupId: string
  groupName: string
  finalRank: number
  allocatedScore: number
  members: SelectedGroupMember[]
}

export interface GroupInfo {
  groupId: string
  groupName: string
  finalRank?: number
  allocatedPoints?: number
  studentScore?: number
  teacherScore?: number
  totalScore?: number
}

export interface SettlementRanking {
  finalRank: number
  allocatedPoints: number
}

export interface Transaction {
  userEmail: string
  displayName?: string
  amount: number
  metadata?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string
}

export interface AllGroupsChartDataItem {
  rank: number
  groupId: string
  groupName: string
  score: number
  weightedScore: number
  members: Array<{
    displayName: string
    totalPoints: number
    participationPercentage: number
    finalWeight: number
    points: number
    groupId: string
    groupName: string
    rank: number
    isCurrentGroup: boolean
  }>
}

// Props
export interface Props {
  visible: boolean
  projectId: string
  stageId: string
  stageTitle?: string
  isSettled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  projectId: '',
  stageId: '',
  stageTitle: '',
  isSettled: false
})

// Emits
interface Emits {
  (e: 'update:visible', value: boolean): void
}

const emit = defineEmits<Emits>()

// State
const loading = ref<boolean>(false)
const rankingDetails = ref<any[]>([])
const candidateGroups = ref<CandidateGroup[]>([])
const votersList = ref<VoterInfo[]>([])
const teacherVotes = ref<TeacherVote[]>([])
const stageRewardPool = ref<number>(0)
const voteData = ref<VoteData[]>([])
const d3Chart = ref<HTMLElement | null>(null)
const stackedBarChart = ref<HTMLElement | null>(null)
const selectedGroup = ref<SelectedGroup | null>(null)
const groupColorMap = ref<Map<string, string>>(new Map())
const voterColorMap = ref<Map<string, string>>(new Map())
const settlementId = ref<string | null>(null)
const showScoringExplanation = ref<boolean>(false)

// Computed
const hasRewardsToDisplay = computed<boolean>(() => {
  return stageRewardPool.value > 0 && candidateGroups.value.some(c => c.allocatedScore > 0)
})

const allGroupsChartData = computed<AllGroupsChartDataItem[]>(() => {
  console.log('📊 [allGroupsChartData] Computing chart data:', {
    totalCandidates: candidateGroups.value.length,
    candidatesWithScore: candidateGroups.value.filter(c => c.allocatedScore > 0).length,
    allCandidates: candidateGroups.value.map(c => ({
      groupId: c.groupId,
      allocatedScore: c.allocatedScore,
      finalRank: c.finalRank
    }))
  })

  const result = candidateGroups.value
    .filter(c => c.allocatedScore > 0)
    .map(candidate => ({
      rank: candidate.finalRank || 999,
      groupId: candidate.groupId,
      groupName: candidate.groupName,
      score: candidate.allocatedScore,
      weightedScore: candidate.totalScore,
      members: [{
        displayName: candidate.groupName,
        totalPoints: candidate.allocatedScore,
        participationPercentage: 1,
        finalWeight: candidate.allocatedScore,
        points: candidate.allocatedScore,
        groupId: candidate.groupId,
        groupName: candidate.groupName,
        rank: candidate.finalRank || 999,
        isCurrentGroup: true
      }]
    }))
    .sort((a, b) => a.rank - b.rank)

  console.log('📊 [allGroupsChartData] Result:', result)
  return result
})

// Watch
watch(() => props.visible, (newVal) => {
  console.log('🔍 [VotingAnalysisModal] visible changed:', {
    newVal,
    projectId: props.projectId,
    stageId: props.stageId,
    isSettled: props.isSettled,
    stageTitle: props.stageTitle
  })
  if (newVal) {
    loadVotingAnalysis()
  }
})

// Methods
const loadVotingAnalysis = async (): Promise<void> => {
  console.log('🔍 [VotingAnalysisModal] loadVotingAnalysis called with props:', {
    projectId: props.projectId,
    stageId: props.stageId,
    isSettled: props.isSettled,
    stageTitle: props.stageTitle
  })

  if (!props.projectId || !props.stageId) {
    console.error('❌ [VotingAnalysisModal] 缺少必要的 projectId 或 stageId', {
      projectId: props.projectId,
      stageId: props.stageId
    })
    return
  }

  loading.value = true
  try {
    console.log('📊 載入互評計票分析...', {
      projectId: props.projectId,
      stageId: props.stageId,
      isSettled: props.isSettled
    })

    if (props.isSettled) {
      // 結算後模式：載入結算結果數據
      const [stageHttpResponse, settlementResponse] = await Promise.all([
        rpcClient.stages.get.$post({
          json: {
            projectId: props.projectId,
            stageId: props.stageId
          }
        }),
        (rpcClient.settlement as any)['stage-rankings'].$post({
          json: {
            projectId: props.projectId,
            stageId: props.stageId
          }
        })
      ])
      const stageResponse = await stageHttpResponse.json()
      const settlementData = await settlementResponse.json()

      console.log('📊 階段API響應:', stageResponse)
      console.log('📊 結算API響應:', settlementData)

      if (stageResponse.success && settlementData.success && settlementData.data.settled) {
        settlementId.value = settlementData.data.settlementId || null
        console.log('📊 Stored settlementId:', settlementId.value)

        stageRewardPool.value = stageResponse.data.reportRewardPool || 0

        const votingHttpResponse = await (rpcClient.scoring as any)['submission-voting-data'].$post({
          json: {
            stageId: props.stageId
          }
        })
        const votingResponse = await votingHttpResponse.json()

        console.log('📊 投票API完整響應:', votingResponse)

        if (votingResponse.success) {
          const { studentVotes, teacherVotes: teachers, groupInfo } = votingResponse.data

          console.log('📊 解構後的資料:', {
            studentVotesLength: studentVotes?.length,
            teacherVotesLength: teachers?.length,
            groupInfoLength: groupInfo?.length,
            groupInfo: groupInfo
          })

          voteData.value = studentVotes || []
          teacherVotes.value = teachers || []

          buildCandidateGroups(groupInfo)

          console.log('📊 buildCandidateGroups 執行後 (含後端分數):', {
            candidateGroupsLength: candidateGroups.value.length,
            candidateGroups: candidateGroups.value.map(c => ({
              groupId: c.groupId,
              groupName: c.groupName,
              finalRank: c.finalRank,
              allocatedScore: c.allocatedScore,
              studentScore: c.studentScore,
              teacherScore: c.teacherScore,
              totalScore: c.totalScore
            }))
          })

          buildVotersList()

          applySettlementRankings(settlementData.data.rankings)
        } else {
          console.error('無法載入投票數據')
          resetData()
        }
      } else {
        console.error('階段尚未結算或數據不完整', {
          stageSuccess: stageResponse.success,
          settlementSuccess: settlementData.success,
          settled: settlementData.data?.settled,
          stageError: stageResponse.error,
          settlementError: settlementData.error
        })
        resetData()
      }
    } else {
      // 實時計算模式：載入投票數據並即時計算
      const [votingHttpResponse, stageHttpResponse] = await Promise.all([
        (rpcClient.scoring as any)['submission-voting-data'].$post({
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
      const votingResponse = await votingHttpResponse.json()
      const stageResponse = await stageHttpResponse.json()

      console.log('📊 投票數據響應:', votingResponse)
      console.log('📊 階段數據響應:', stageResponse)

      if (votingResponse.success && stageResponse.success) {
        stageRewardPool.value = stageResponse.data.reportRewardPool || 0

        const { studentVotes, teacherVotes: teachers, groupInfo } = votingResponse.data

        console.log('📊 實時模式 - 解構後的資料:', {
          studentVotesLength: studentVotes?.length,
          teacherVotesLength: teachers?.length,
          groupInfoLength: groupInfo?.length,
          groupInfo: groupInfo
        })

        voteData.value = studentVotes || []
        teacherVotes.value = teachers || []

        buildCandidateGroups(groupInfo)

        console.log('📊 實時模式 - buildCandidateGroups 執行後:', {
          candidateGroupsLength: candidateGroups.value.length,
          candidateGroups: candidateGroups.value.map(c => ({
            groupId: c.groupId,
            groupName: c.groupName
          }))
        })

        buildVotersList()

        calculateRankingsAndScores()
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

const resetData = (): void => {
  candidateGroups.value = []
  votersList.value = []
  teacherVotes.value = []
  voteData.value = []
  stageRewardPool.value = 0
}

const buildCandidateGroups = (groupInfo: GroupInfo[]): void => {
  const groups: CandidateGroup[] = []
  if (groupInfo && Array.isArray(groupInfo)) {
    groupInfo.forEach(group => {
      groups.push({
        groupId: group.groupId,
        groupName: group.groupName,
        finalRank: group.finalRank || null,
        allocatedScore: group.allocatedPoints || 0,
        studentScore: group.studentScore || 0,
        teacherScore: group.teacherScore || 0,
        totalScore: group.totalScore || 0,
        rankDistribution: {},
        winningRankLevel: 1,
        winningVotes: 0
      })
    })
  }

  candidateGroups.value = groups.sort((a, b) => {
    if (a.finalRank && b.finalRank) return a.finalRank - b.finalRank
    if (a.finalRank) return -1
    if (b.finalRank) return 1
    return 0
  })

  generateCandidateColors()
}

const buildVotersList = (): void => {
  const voters: VoterInfo[] = []
  const voterSet = new Set<string>()

  voteData.value.forEach(vote => {
    if (!voterSet.has(vote.groupId)) {
      voterSet.add(vote.groupId)
      voters.push({
        groupId: vote.groupId,
        proposerEmail: vote.proposerEmail,
        proposerDisplayName: vote.proposerDisplayName
      })
    }
  })

  votersList.value = voters
  generateVoterColors()
}

const generateCandidateColors = (): void => {
  groupColorMap.value.clear()
  candidateGroups.value.forEach(candidate => {
    const color = randomColor({
      luminosity: 'dark',
      format: 'hex'
    })
    groupColorMap.value.set(candidate.groupId, color)
  })
}

const generateVoterColors = (): void => {
  voterColorMap.value.clear()
  votersList.value.forEach(voter => {
    const color = randomColor({
      luminosity: 'bright',
      format: 'hex'
    })
    voterColorMap.value.set(voter.groupId, color)
  })
  teacherVotes.value.forEach((teacher, index) => {
    const color = randomColor({
      luminosity: 'bright',
      format: 'hex'
    })
    voterColorMap.value.set(`teacher-${index}`, color)
  })
}

const getCandidateHeaderColor = (groupId: string): string => {
  return groupColorMap.value.get(groupId) || '#333333'
}

const getVoterHeaderColor = (voterId: string): string => {
  return voterColorMap.value.get(voterId) || '#e0e0e0'
}

const applySettlementRankings = (rankings: Record<string, SettlementRanking>): void => {
  try {
    console.log('🔍 套用結算結果:', rankings)

    candidateGroups.value.forEach(candidate => {
      const settlement = rankings[candidate.groupId]
      if (settlement) {
        candidate.finalRank = settlement.finalRank
        candidate.allocatedScore = settlement.allocatedPoints || 0
      }
    })

    candidateGroups.value.forEach(candidate => {
      const rankDistribution: Record<number, number> = {}
      for (let rank = 1; rank <= candidateGroups.value.length; rank++) {
        rankDistribution[rank] = voteData.value.filter(v =>
          v.rankingData?.find(r => r.groupId === candidate.groupId && r.rank === rank)
        ).length
      }
      candidate.rankDistribution = rankDistribution
    })

    candidateGroups.value.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999))

    console.log('✅ 結算結果套用完成:', candidateGroups.value.map(c => ({
      groupId: c.groupId,
      groupName: c.groupName,
      finalRank: c.finalRank,
      allocatedScore: c.allocatedScore,
      studentScore: c.studentScore,
      teacherScore: c.teacherScore,
      totalScore: c.totalScore
    })))
  } catch (error) {
    console.error('❌ 套用結算結果失敗:', error)
    resetData()
  }
}

const calculateRankingsAndScores = (): void => {
  if (!candidateGroups.value.length) return

  const teacherWeight = 0.3
  const studentWeight = 0.7

  const groupScores: Record<string, {
    groupId: string
    studentScore: number
    teacherScore: number
    totalScore: number
    finalRank?: number
    rankDistribution: Record<number, number>
  }> = {}

  candidateGroups.value.forEach(candidate => {
    groupScores[candidate.groupId] = {
      groupId: candidate.groupId,
      studentScore: 0,
      teacherScore: 0,
      totalScore: 0,
      rankDistribution: {}
    }
  })

  const rankDistributionMap: Record<string, Record<number, number>> = {}
  candidateGroups.value.forEach(candidate => {
    rankDistributionMap[candidate.groupId] = {}
    for (let rank = 1; rank <= candidateGroups.value.length; rank++) {
      rankDistributionMap[candidate.groupId][rank] = 0
    }
  })

  voteData.value.forEach(vote => {
    if (vote.rankingData) {
      vote.rankingData.forEach(ranking => {
        const { groupId, rank } = ranking
        if (rankDistributionMap[groupId] && rankDistributionMap[groupId][rank] !== undefined) {
          rankDistributionMap[groupId][rank] += 1
        }
      })
    }
  })

  candidateGroups.value.forEach(candidate => {
    candidate.rankDistribution = rankDistributionMap[candidate.groupId]
    groupScores[candidate.groupId].rankDistribution = rankDistributionMap[candidate.groupId]
  })

  candidateGroups.value.forEach(candidate => {
    const ranks: number[] = []
    voteData.value.forEach(vote => {
      if (vote.rankingData) {
        const ranking = vote.rankingData.find(r => r.groupId === candidate.groupId)
        if (ranking) {
          ranks.push(ranking.rank)
        }
      }
    })
    const avgRank = ranks.length > 0
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : 999
    groupScores[candidate.groupId].studentScore = avgRank
  })

  candidateGroups.value.forEach(candidate => {
    const ranks: number[] = []
    teacherVotes.value.forEach(teacherVote => {
      if (teacherVote.rankingData) {
        const ranking = teacherVote.rankingData.find(r => r.groupId === candidate.groupId)
        if (ranking) {
          ranks.push(ranking.rank)
        }
      }
    })
    const avgRank = ranks.length > 0
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : 999
    groupScores[candidate.groupId].teacherScore = avgRank
  })

  Object.values(groupScores).forEach(score => {
    score.totalScore = score.studentScore * studentWeight + score.teacherScore * teacherWeight
  })

  const sortedScores = Object.values(groupScores)
    .sort((a, b) => a.totalScore - b.totalScore)

  for (let i = 0; i < sortedScores.length; i++) {
    const score = sortedScores[i]
    if (i > 0 && Math.abs(sortedScores[i-1].totalScore - score.totalScore) < 0.001) {
      score.finalRank = sortedScores[i-1].finalRank
    } else {
      score.finalRank = i + 1
    }
  }

  candidateGroups.value.forEach(candidate => {
    const scoreInfo = groupScores[candidate.groupId]
    if (scoreInfo) {
      candidate.finalRank = scoreInfo.finalRank || null
      candidate.studentScore = scoreInfo.studentScore
      candidate.teacherScore = scoreInfo.teacherScore
      candidate.totalScore = scoreInfo.totalScore

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

  candidateGroups.value.sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999))

  calculateRewardDistribution()
}

const calculateRewardDistribution = (): void => {
  const totalParticipants = candidateGroups.value.length

  const rankGroups: Record<number, CandidateGroup[]> = {}
  candidateGroups.value.forEach(candidate => {
    if (candidate.finalRank !== null) {
      if (!rankGroups[candidate.finalRank]) {
        rankGroups[candidate.finalRank] = []
      }
      rankGroups[candidate.finalRank].push(candidate)
    }
  })

  const uniqueRanks = Object.keys(rankGroups).map(Number).sort((a, b) => a - b)
  let assignedPosition = 0
  let totalWeight = 0
  const rankWeights: Record<number, number> = {}

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

  uniqueRanks.forEach(rank => {
    const group = rankGroups[rank]
    const weightPerPerson = rankWeights[rank]
    const scorePerPerson = (weightPerPerson / totalWeight) * stageRewardPool.value

    group.forEach(candidate => {
      candidate.allocatedScore = Math.round(scorePerPerson * 100) / 100
    })
  })

  const actualTotal = candidateGroups.value.reduce((sum, c) => sum + c.allocatedScore, 0)
  const diff = stageRewardPool.value - actualTotal
  if (Math.abs(diff) > 0.01 && candidateGroups.value.length > 0) {
    candidateGroups.value[0].allocatedScore = Math.round((candidateGroups.value[0].allocatedScore + diff) * 100) / 100
  }
}

const handleVisibleChange = (newValue: boolean): void => {
  emit('update:visible', newValue)
}

const handleClose = (): void => {
  emit('update:visible', false)
}

const getVoteRank = (voterGroupId: string, candidateGroupId: string): number | null => {
  const vote = voteData.value.find(v => v.groupId === voterGroupId)
  if (!vote || !vote.rankingData) return null

  const ranking = vote.rankingData.find(r => r.groupId === candidateGroupId)
  return ranking ? ranking.rank : null
}

const getTeacherVoteRank = (teacher: TeacherVote, candidateGroupId: string): number | null => {
  if (!teacher.rankingData) return null

  const ranking = teacher.rankingData.find(r => r.groupId === candidateGroupId)
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
    const bgColor = randomColor({
      luminosity: 'bright',
      format: 'hex',
      seed: rank
    })
    return { background: bgColor, color: '#000' }
  }
}

const getScoreColor = (score: number | undefined, type: string = 'total'): string => {
  if (score === undefined || score === null) return '#f0f0f0'

  let maxScore: number, minScore: number
  let interpolator: (t: number) => string

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

const handleGroupClick = async (groupData: GroupClickData): Promise<void> => {
  console.log('📊 Group clicked:', groupData)

  if (!props.isSettled || !settlementId.value) {
    console.log('⚠️ Stage not settled or no settlementId, cannot fetch transactions')
    selectedGroup.value = {
      groupId: groupData.groupId,
      groupName: groupData.groupName,
      finalRank: groupData.rank,
      allocatedScore: groupData.points,
      members: []
    }
    return
  }

  try {
    console.log('📊 Fetching transactions for group:', {
      projectId: props.projectId,
      stageId: props.stageId,
      settlementId: settlementId.value,
      groupId: groupData.groupId
    })

    const httpResponse = await rpcClient.wallets.transactions.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        settlementId: settlementId.value,
        groupId: groupData.groupId
      }
    })
    const response = await httpResponse.json()

    console.log('📊 Transaction API response:', response)

    if (response.success && response.data.transactions) {
      const members: SelectedGroupMember[] = response.data.transactions.map((tx: Transaction) => {
        let metadata: any = {}
        try {
          metadata = JSON.parse(tx.metadata || '{}')
        } catch (err) {
          console.error('Failed to parse transaction metadata:', err)
        }

        return {
          email: tx.userEmail,
          displayName: tx.displayName || tx.userEmail,
          points: tx.amount,
          contribution: (metadata?.participationPercentage || 0) * 100,
          avatarSeed: tx.avatarSeed,
          avatarStyle: tx.avatarStyle,
          avatarOptions: tx.avatarOptions
        }
      })

      console.log('📊 Built members from transactions:', members)

      selectedGroup.value = {
        groupId: groupData.groupId,
        groupName: groupData.groupName,
        finalRank: groupData.rank,
        allocatedScore: groupData.points,
        members
      }
    } else {
      console.error('Failed to fetch transactions:', response.error)
      selectedGroup.value = {
        groupId: groupData.groupId,
        groupName: groupData.groupName,
        finalRank: groupData.rank,
        allocatedScore: groupData.points,
        members: []
      }
    }
  } catch (error) {
    console.error('Error fetching transactions:', error)
    selectedGroup.value = {
      groupId: groupData.groupId,
      groupName: groupData.groupName,
      finalRank: groupData.rank,
      allocatedScore: groupData.points,
      members: []
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

  .details-table {
    padding: 15px;
  }
}

.chart-hint {
  margin-top: 15px;
  padding: 10px;
  background: #f0f9ff;
  border-left: 4px solid #3498db;
  color: #2c3e50;
  font-size: 13px;
}
</style>
