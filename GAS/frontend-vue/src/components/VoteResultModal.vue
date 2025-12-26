<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="handleVisibleChange"
    title="階段成果投票"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    :z-index="2000"
  >
    <template #header>
      <h3><i class="fas fa-vote-yea"></i> 階段成果投票</h3>
    </template>

    <div class="vote-drawer-content" v-loading="loading" element-loading-text="載入投票資料中...">
      
      <!-- 已投票提醒 -->
      <el-alert
        v-if="userHasVoted"
        title="您已投過票"
        type="info"
        :closable="false"
        show-icon
        class="voted-alert"
      >
        <template #default>
          您已對當前提案投過票，只能查看投票結果。如需重新提案，請聯絡專案管理員。
        </template>
      </el-alert>

      <!-- 說明橫幅 -->
      <div class="info-banner">
        <div class="banner-content">
          <i class="fas fa-info-circle"></i>
          <div class="banner-text">
            <template v-if="hasExistingProposal">
              本排名結果由 <strong>{{ currentProposal.proposer || '匿名用戶' }}</strong> 提供，您可以選擇支持、反對或重新提案。
              若此排名在專案結算前獲得多數支持，將成為本階段最終排名依據。
            </template>
            <template v-else>
              目前尚無排名提案，您可以成為第一個提供排名的人！
            </template>
          </div>
        </div>
      </div>

      <!-- 版本選擇器 -->
      <div v-if="proposalVersions.length > 0" class="version-selector-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-history"></i>
            提案版本
          </label>
        </div>
        
        <div class="version-selector">
          <el-select
            v-model="selectedVersionId"
            placeholder="選擇提案版本"
            @change="onVersionChange"
            :disabled="isSubmittingVote"
            style="width: 100%"
          >
            <el-option
              v-for="version in proposalVersions"
              :key="version.proposalId"
              :label="`版本 ${version.version} - ${version.proposer} (${formatTime(version.createdTime)})`"
              :value="version.proposalId"
            >
              <div class="version-option">
                <div class="version-info">
                  <span class="version-number">版本 {{ version.version }}</span>
                  <span class="version-proposer">{{ version.proposer }}</span>
                </div>
                <div class="version-stats">
                  <span class="support-count">支持: {{ version.supportCount || 0 }}</span>
                  <span class="oppose-count">反對: {{ version.opposeCount || 0 }}</span>
                </div>
              </div>
            </el-option>
          </el-select>
        </div>
      </div>

      <!-- 排名結果區域 -->
      <div class="ranking-section">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-trophy"></i>
            排名結果
          </h3>
        </div>

        <!-- 排名列表 -->
        <div class="ranking-list-container">
          <div class="ranking-list" :class="{ disabled: hasExistingProposal && !isResubmitting }">
            <div 
              v-for="(group, index) in displayRankings" 
              :key="group.groupId"
              class="ranking-item"
              :class="{ 
                draggable: !hasExistingProposal || isResubmitting,
                dragging: draggedIndex === index
              }"
              :draggable="!hasExistingProposal || isResubmitting"
              @dragstart="handleDragStart(index, $event)"
              @dragover.prevent="handleDragOver(index)"
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
            >
              <div class="rank-number">{{ group.rank || (index + 1) }}</div>
              
              <div class="group-info">
                <div class="group-name">{{ group.groupName }}</div>
                <div class="group-members" v-if="group.memberNames && group.memberNames.length > 0">
                  成員：{{ group.memberNames.join('、') }}
                </div>
              </div>
              
              <!-- 排序控制按鈕 -->
              <div class="item-actions" v-if="!hasExistingProposal || isResubmitting">
                <el-button 
                  type="text"
                  size="small"
                  @click="moveUp(index)"
                  :disabled="index === 0"
                  title="上移"
                >
                  <i class="fas fa-chevron-up"></i>
                </el-button>
                <el-button 
                  type="text"
                  size="small"
                  @click="moveDown(index)"
                  :disabled="index === displayRankings.length - 1"
                  title="下移"
                >
                  <i class="fas fa-chevron-down"></i>
                </el-button>
              </div>
            </div>
          </div>
          
          <div class="ranking-hint" v-if="isResubmitting">
            <i class="fas fa-lightbulb"></i>
            拖曳或使用箭頭按鈕調整排名順序
          </div>
          
          <div class="ranking-info" v-if="!hasExistingProposal || isResubmitting">
            <i class="fas fa-info-circle"></i>
            注意：排名列表已排除您所屬的組別，以確保投票公正性
          </div>
          
          <!-- 提交排名提案按鈕 (在列表下方) -->
          <div v-if="showSubmitProposalButton" class="submit-proposal-section">
            <el-button
              type="primary"
              size="large"
              @click="submitNewProposal"
              :loading="isSubmittingNewProposal"
              :disabled="!hasValidRanking || isSubmittingNewProposal"
              class="submit-proposal-btn"
            >
              <i v-if="!isSubmittingNewProposal" class="fas fa-save"></i>
              提交排名提案
            </el-button>
          </div>
        </div>
      </div>

      <!-- 投票趨勢圖表 -->
      <div class="vote-visualization">
        <div class="section-header">
          <h3 class="section-title">
            <i class="fas fa-chart-bar"></i>
            投票趨勢
          </h3>
        </div>
        
        <div class="chart-container">
          <div ref="d3Chart" class="d3-chart-container"></div>
          <div class="chart-legend">
            <div class="legend-item">
              <div class="legend-color support"></div>
              <span>支持票數</span>
            </div>
            <div class="legend-item">
              <div class="legend-color oppose"></div>
              <span>反對票數</span>
            </div>
          </div>
        </div>
        
        <!-- 投票說明 -->
        <el-alert
          title="投票機制說明"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            小組投票採用<strong>多數決原則</strong>，最終投票結果以截止日期當下的投票結果為準。
            您可以隨時變更投票，但每次變更都會記錄在投票趨勢中。
          </template>
        </el-alert>
      </div>

      <!-- 投票和提案按鈕區域 -->
      <div class="action-buttons-container">
        <!-- 初次提案按鈕 -->
        <div class="initial-proposal-actions" v-if="showInitialProposalButton">
          <el-button 
            type="primary"
            size="large"
            @click="startInitialProposal"
            :disabled="hasStartedProposal || isSubmittingNewProposal"
            class="initial-proposal-btn"
          >
            <i v-if="!hasStartedProposal" class="fas fa-plus"></i>
            <i v-else class="fas fa-spinner fa-spin"></i>
            提出排名提案
          </el-button>
        </div>
        
        <!-- 投票按鈕區域 -->
        <div class="vote-actions" v-if="showVoteButtons">
          <el-button 
            type="success"
            size="large"
            @click="vote('support')"
            :loading="isSubmittingVote && voteType === 'support'"
            :disabled="isSubmittingVote"
            :class="{ voted: userVote === 'support' }"
          >
            <i v-if="!isSubmittingVote || voteType !== 'support'" class="fas fa-thumbs-up"></i>
            同意
            <span v-if="userVote === 'support'" class="vote-indicator">✓</span>
          </el-button>
          
          <el-button 
            type="danger"
            size="large"
            @click="vote('oppose')"
            :loading="isSubmittingVote && voteType === 'oppose'"
            :disabled="isSubmittingVote"
            :class="{ voted: userVote === 'oppose' }"
          >
            <i v-if="!isSubmittingVote || voteType !== 'oppose'" class="fas fa-thumbs-down"></i>
            不同意
            <span v-if="userVote === 'oppose'" class="vote-indicator">✓</span>
          </el-button>
          
          <el-button 
            type="primary"
            size="large"
            @click="startResubmit"
            :disabled="isSubmittingVote"
          >
            <i class="fas fa-edit"></i>
            重新提出排名提案
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import { ref, reactive, computed, onMounted, watch, nextTick, getCurrentInstance } from 'vue'

export default {
  name: 'VoteResultModal',
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
    voteData: {
      type: Object,
      default: () => ({})
    },
    user: {
      type: Object,
      required: true
    }
  },
  emits: ['update:visible', 'vote', 'resubmit'],
  setup(props, { emit }) {
    // 獲取組件實例以訪問全局屬性
    const instance = getCurrentInstance()
    const apiClient = instance.appContext.config.globalProperties.$apiClient
    
    // 響應式數據
    const loading = ref(false)
    const isSubmittingVote = ref(false)
    const isSubmittingNewProposal = ref(false)
    const voteType = ref('')
    const isResubmitting = ref(false)
    const hasStartedProposal = ref(false)
    
    // 排名數據
    const currentRankings = ref([])
    const originalRankings = ref([])
    const draggedIndex = ref(null)
    const submittedGroups = ref([])
    
    // 提案版本數據
    const proposalVersions = ref([])
    const selectedVersionId = ref('')
    const currentProposal = ref({})
    
    // 用戶投票狀態
    const userVote = ref(null)
    const voteHistory = ref([])
    
    // 圖表數據
    const chartData = ref([])
    
    // 計算屬性
    const hasExistingProposal = computed(() => {
      return proposalVersions.value.length > 0 && selectedVersionId.value
    })
    
    const displayRankings = computed(() => {
      console.log('🔄 計算 displayRankings...', {
        hasExistingProposal: hasExistingProposal.value,
        currentRankingsLength: currentRankings.value.length,
        submittedGroupsLength: submittedGroups.value.length
      })
      
      // 如果有提案，顯示提案的排名；如果沒有提案，顯示待排序的組別
      if (hasExistingProposal.value) {
        console.log('📋 使用 currentRankings:', currentRankings.value)
        // 確保 currentRankings 中的每個項目都有正確的格式
        const result = currentRankings.value.filter(item => item && typeof item === 'object').map((item, index) => ({
          groupId: item.groupId || '',
          groupName: item.groupName || `群組 ${index + 1}`,
          memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
          rank: item.rank || (index + 1),
          submissionId: item.submissionId || ''
        }))
        console.log('✅ displayRankings (有提案):', result)
        return result
      } else {
        console.log('📋 使用 submittedGroups:', submittedGroups.value)
        // 確保 submittedGroups 中的每個項目都有正確的格式
        const result = submittedGroups.value.filter(item => item && typeof item === 'object').map((item, index) => ({
          groupId: item.groupId || '',
          groupName: item.groupName || `群組 ${index + 1}`,
          memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
          rank: item.rank || (index + 1),
          submissionId: item.submissionId || ''
        }))
        console.log('✅ displayRankings (無提案):', result)
        return result
      }
    })
    
    const hasValidRanking = computed(() => {
      if (hasExistingProposal.value) {
        return currentRankings.value.length > 0
      } else {
        return submittedGroups.value.length > 0
      }
    })
    
    // 新增：複雜按鈕狀態管理
    const userHasVoted = computed(() => {
      return userVote.value !== null && userVote.value !== undefined
    })
    
    const showInitialProposalButton = computed(() => {
      // 不顯示初次提案按鈕，因為沒有提案時就直接是編輯模式
      return false
    })
    
    const showSubmitProposalButton = computed(() => {
      // 顯示提交提案按鈕：
      // 1. 沒有提案時（預設編輯模式），或
      // 2. 正在重新提案
      return !hasExistingProposal.value || isResubmitting.value
    })
    
    const showVoteButtons = computed(() => {
      // 顯示投票按鈕：有提案且沒有投過票且不在重新提案模式
      return hasExistingProposal.value && !userHasVoted.value && !isResubmitting.value
    })
    
    // 監聽器
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        initializeData()
      } else {
        resetState()
      }
    })
    
    watch(chartData, () => {
      if (props.visible) {
        nextTick(() => {
          renderStackedBarChart()
        })
      }
    }, { deep: true })
    
    // 方法
    const initializeData = async () => {
      loading.value = true
      try {
        // 先載入群組資料，再載入提案資料（提案資料需要依賴群組資料）
        await loadSubmittedGroups()
        await loadProposalVersions()
        await loadUserVoteStatus()
      } catch (error) {
        console.error('Initialize data error:', error)
      } finally {
        loading.value = false
      }
    }
    
    const loadSubmittedGroups = async () => {
      try {
        console.log('🔄 開始載入已提交的組別...')
        // 使用與 ProjectDetail.vue 相同的 API 來獲取階段內容
        const response = await apiClient.callWithAuth('/projects/content', {
          projectId: props.projectId,
          stageId: props.stageId,
          contentType: 'submissions'
        })
        
        console.log('📡 API 響應:', response)
        
        if (response.success && response.data && response.data.submissions) {
          console.log('✅ 成功獲取 submissions:', response.data.submissions.length, '個提交')
          // 處理 submissions 數據，按 groupId 分組並過濾掉已撤回的提交
          const groupMap = new Map()
          
          response.data.submissions.forEach((submission, index) => {
            console.log(`處理第 ${index + 1} 個 submission:`, {
              submissionId: submission.submissionId,
              groupId: submission.groupId,
              status: submission.status,
              groupName: submission.groupName,
              memberNames: submission.memberNames
            })
            
            // 過濾掉 withdrawn 狀態的提交
            if (submission.status === 'withdrawn') {
              console.log('⏭️ 跳過已撤回的提交:', submission.submissionId)
              return
            }
            
            const groupId = submission.groupId
            if (groupId && !groupMap.has(groupId)) {
              const groupData = {
                groupId: groupId,
                groupName: submission.groupName || `群組 ${groupId}`,
                memberNames: submission.memberNames || [],
                submissionId: submission.submissionId,
                submitTime: submission.submitTime || submission.submittedAt || 0,
                rank: 0 // 預設排名，稍後會重新分配
              }
              console.log('✅ 創建群組資料:', groupData)
              groupMap.set(groupId, groupData)
            } else if (groupId) {
              console.log('⏭️ 群組已存在，跳過:', groupId)
            } else {
              console.log('❌ submission 沒有 groupId:', submission)
            }
          })
          
          console.log('📊 groupMap 最終內容:', Array.from(groupMap.entries()))
          
          // 轉換為陣列並按提交時間排序，然後分配排名
          let groups = Array.from(groupMap.values())
            .sort((a, b) => (b.submitTime || 0) - (a.submitTime || 0))
          
          console.log('🔍 過濾前的組別數量:', groups.length)
          
          // 過濾掉自己的組別 - 獲取當前用戶的組別
          try {
            console.log('🔍 開始過濾用戶組別...')
            const userResponse = await apiClient.callWithAuth('/projects/core', {
              projectId: props.projectId
            })
            
            console.log('📡 /projects/core 響應:', userResponse)
            
            if (userResponse.success && userResponse.data) {
              console.log('📋 userResponse.data 內容:', userResponse.data)
              
              if (userResponse.data.userGroups) {
                const allUserGroups = userResponse.data.userGroups
                console.log('👥 所有用戶組別資料:', allUserGroups)
                
                // 找出當前用戶的組別
                const currentUserEmail = props.user?.email || props.user?.userEmail || 'unknown'
                console.log('👤 當前用戶郵箱:', currentUserEmail)
                
                const userGroupRecords = allUserGroups.filter(ug => 
                  ug.userEmail === currentUserEmail && ug.isActive
                )
                console.log('👤 當前用戶的組別記錄:', userGroupRecords)
                
                const userGroupIds = userGroupRecords.map(ug => ug.groupId)
                console.log('👤 用戶所屬的組別 IDs:', userGroupIds)
                
                console.log('🔍 過濾前 - groups:', groups.map(g => ({ groupId: g.groupId, groupName: g.groupName })))
                
                // 排除用戶所屬的組別
                const beforeFilterCount = groups.length
                groups = groups.filter(group => {
                  const shouldKeep = !userGroupIds.includes(group.groupId)
                  console.log(`🔍 組別 ${group.groupId} (${group.groupName}) 是否保留:`, shouldKeep)
                  return shouldKeep
                })
                
                console.log(`🔍 過濾結果: ${beforeFilterCount} -> ${groups.length}`)
                console.log('🔍 過濾後的組別數量:', groups.length)
              } else {
                console.warn('❌ userResponse.data.userGroups 不存在')
              }
            } else {
              console.warn('❌ userResponse 失敗或無效')
            }
          } catch (error) {
            console.error('❌ Failed to filter user groups:', error)
          }
          
          // 重新分配排名
          groups = groups.map((group, index) => ({
            ...group,
            rank: index + 1
          }))
          
          console.log('✅ 最終的 submittedGroups:', groups)
          
          // 存儲載入的組別數據，供沒有提案時使用
          submittedGroups.value = groups
        } else {
          console.warn('❌ API 響應無效或沒有 submissions 數據')
        }
      } catch (error) {
        console.error('❌ Load submitted groups error:', error)
      }
    }
    
    const loadProposalVersions = async () => {
      try {
        const response = await apiClient.callWithAuth('/rankings/proposals', {
          projectId: props.projectId,
          stageId: props.stageId
        })
        
        if (response.success && response.data && response.data.proposals) {
          proposalVersions.value = response.data.proposals.map((proposal) => ({
            ...proposal,
            supportCount: proposal.supportCount || 0,
            opposeCount: proposal.opposeCount || 0
          }))
          
          // 選擇最新版本（後端已按最新版本優先排序）
          if (proposalVersions.value.length > 0) {
            const latestProposal = proposalVersions.value[0]  // 第一個就是最新版本
            selectedVersionId.value = latestProposal.proposalId
            await loadProposalData(latestProposal.proposalId)
          }
        } else {
          // 沒有提案時初始化空數組
          proposalVersions.value = []
        }
      } catch (error) {
        console.error('Load proposal versions error:', error)
      }
    }
    
    const loadProposalData = async (proposalId) => {
      try {
        console.log('🔄 開始載入提案資料:', proposalId)
        const response = await apiClient.callWithAuth('/rankings/proposals', {
          projectId: props.projectId,
          stageId: props.stageId
        })
        
        console.log('📡 /rankings/proposals 響應:', response)
        
        if (response.success && response.data && response.data.proposals) {
          // 從提案列表中找到對應的提案
          const proposal = response.data.proposals.find(p => p.proposalId === proposalId)
          console.log('🔍 找到的提案:', proposal)
          
          if (proposal) {
            currentProposal.value = proposal
            // 解析排名數據
            try {
              const rankingData = typeof proposal.rankingData === 'string' 
                ? JSON.parse(proposal.rankingData) 
                : proposal.rankingData
              
              // 除錯輸出
              console.log('📊 Raw rankingData:', rankingData)
              console.log('📋 submittedGroups:', submittedGroups.value)
              
              if (Array.isArray(rankingData)) {
                // 如果是陣列格式（包含 groupId, rank, submissionId）
                console.log('🔄 處理陣列格式的 rankingData')
                currentRankings.value = rankingData
                  .map((item) => {
                    // 從 submittedGroups 中找到對應的群組資料
                    const groupInfo = submittedGroups.value.find(g => g.groupId === item.groupId)
                    const result = {
                      groupId: item.groupId,
                      rank: item.rank,
                      submissionId: item.submissionId,
                      groupName: groupInfo?.groupName || `群組 ${item.groupId.slice(-4)}`,
                      memberNames: groupInfo?.memberNames || []
                    }
                    console.log('✅ 處理的排名項目:', result)
                    return result
                  })
                  .filter(item => {
                    // 只保留在 submittedGroups 中的組別（已經排除了自己組）
                    const shouldKeep = submittedGroups.value.some(g => g.groupId === item.groupId)
                    console.log(`🔍 保留組別 ${item.groupId}?`, shouldKeep)
                    return shouldKeep
                  })
                  .sort((a, b) => a.rank - b.rank)
              } else {
                // 如果是對象格式 {groupId: rank}
                console.log('🔄 處理對象格式的 rankingData')
                currentRankings.value = Object.entries(rankingData || {})
                  .map(([groupId, rank]) => {
                    const groupInfo = submittedGroups.value.find(g => g.groupId === groupId)
                    const result = {
                      groupId,
                      rank: typeof rank === 'number' ? rank : parseInt(rank),
                      groupName: groupInfo?.groupName || `群組 ${groupId.slice(-4)}`,
                      memberNames: groupInfo?.memberNames || []
                    }
                    console.log('✅ 處理的排名項目:', result)
                    return result
                  })
                  .filter(item => {
                    // 只保留在 submittedGroups 中的組別（已經排除了自己組）
                    const shouldKeep = submittedGroups.value.some(g => g.groupId === item.groupId)
                    console.log(`🔍 保留組別 ${item.groupId}?`, shouldKeep)
                    return shouldKeep
                  })
                  .sort((a, b) => a.rank - b.rank)
              }
              
              console.log('✅ 最終的 currentRankings:', currentRankings.value)
            } catch (e) {
              console.warn('❌ Failed to parse ranking data:', e)
              currentRankings.value = []
            }
          } else {
            console.warn('❌ 找不到指定的提案:', proposalId)
          }
          originalRankings.value = [...currentRankings.value]
          
          // 載入投票歷史和圖表數據
          await loadVoteHistory(proposalId)
        } else {
          console.warn('❌ API 響應無效或沒有 proposals 數據')
        }
      } catch (error) {
        console.error('❌ Load proposal data error:', error)
      }
    }
    
    const loadUserVoteStatus = async () => {
      try {
        if (!selectedVersionId.value) return
        
        const response = await apiClient.callWithAuth('/rankings/proposals', {
          projectId: props.projectId,
          stageId: props.stageId
        })
        
        if (response.success && response.data && response.data.proposals) {
          // 從提案列表中找到對應的提案和用戶投票
          const proposal = response.data.proposals.find(p => p.proposalId === selectedVersionId.value)
          if (proposal && proposal.userVote !== undefined) {
            userVote.value = proposal.userVote ? 'support' : 'oppose'
          } else {
            userVote.value = null
          }
        }
      } catch (error) {
        console.error('Load user vote status error:', error)
      }
    }
    
    const loadVoteHistory = async (proposalId) => {
      try {
        const response = await apiClient.callWithAuth('/rankings/proposals', {
          projectId: props.projectId,
          stageId: props.stageId
        })
        
        if (response.success && response.data && response.data.proposals) {
          // 從提案列表中找到對應的提案和投票歷史
          const proposal = response.data.proposals.find(p => p.proposalId === proposalId)
          if (proposal && proposal.votes) {
            voteHistory.value = proposal.votes
            generateChartData()
          } else {
            voteHistory.value = []
          }
        }
      } catch (error) {
        console.error('Load vote history error:', error)
      }
    }
    
    const generateChartData = () => {
      // 將投票歷史轉換為圖表數據
      const dataByDate = {}
      
      voteHistory.value.forEach(vote => {
        // 處理時間戳，支援多種格式
        let timestamp = vote.createdTime || vote.timestamp || Date.now()
        
        // 如果是字串且是數字，轉換為數字
        if (typeof timestamp === 'string' && !isNaN(timestamp)) {
          timestamp = parseInt(timestamp)
        }
        
        const dateObj = new Date(timestamp)
        // 檢查日期是否有效
        if (isNaN(dateObj.getTime())) {
          console.warn('Invalid timestamp:', timestamp, 'from vote:', vote)
          return
        }
        
        const date = dateObj.toLocaleDateString('zh-TW')
        if (!dataByDate[date]) {
          dataByDate[date] = { date, support: 0, oppose: 0, rawDate: dateObj }
        }
        
        if (vote.isApproved || vote.agree === true) {
          dataByDate[date].support++
        } else {
          dataByDate[date].oppose++
        }
      })
      
      chartData.value = Object.values(dataByDate).sort((a, b) => a.rawDate - b.rawDate)
    }
    
    const onVersionChange = async (proposalId) => {
      if (proposalId) {
        await loadProposalData(proposalId)
        await loadUserVoteStatus()
      }
    }
    
    const vote = async (type) => {
      if (isSubmittingVote.value) return
      
      isSubmittingVote.value = true
      voteType.value = type
      
      try {
        const response = await apiClient.callWithAuth('/rankings/vote', {
          projectId: props.projectId,
          proposalId: selectedVersionId.value,
          agree: type === 'support',
          comment: ''
        })
        
        if (response.success) {
          userVote.value = type
          const { ElMessage } = await import('element-plus')
          ElMessage.success(`已投${type === 'support' ? '支持' : '反對'}票`)
          
          // 重新載入投票歷史和狀態
          await loadVoteHistory(selectedVersionId.value)
          await loadProposalVersions() // 更新票數統計
          
          emit('vote', { 
            success: true,
            type: type,
            proposalId: selectedVersionId.value 
          })
        }
      } catch (error) {
        console.error('Vote error:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('投票失敗，請重試')
      } finally {
        isSubmittingVote.value = false
        voteType.value = ''
      }
    }
    
    const startResubmit = () => {
      isResubmitting.value = true
    }
    
    const startInitialProposal = () => {
      // 不再需要這個函數，因為沒有提案時就直接是編輯模式
      // 保留為空函數以避免模板錯誤
    }
    
    const submitNewProposal = async () => {
      if (isSubmittingNewProposal.value || !hasValidRanking.value) return
      
      isSubmittingNewProposal.value = true
      
      try {
        // 使用當前顯示的排名數據（可能是現有提案或新建的排名）
        const targetArray = hasExistingProposal.value ? currentRankings.value : submittedGroups.value
        const rankingData = targetArray.map((group, index) => ({
          groupId: group.groupId,
          rank: index + 1,
          submissionId: group.submissionId
        }))
        
        const response = await apiClient.callWithAuth('/rankings/submit', {
          projectId: props.projectId,
          stageId: props.stageId,
          rankingData: rankingData
        })
        
        if (response.success) {
          const { ElMessage } = await import('element-plus')
          ElMessage.success('新排名提案已提交')
          isResubmitting.value = false
          hasStartedProposal.value = false
          
          // 重新載入提案版本列表，這會自動選擇最新版本並載入其數據
          await loadProposalVersions()
          
          // 確保 UI 狀態正確更新
          console.log('✅ 新提案已提交，當前選中版本:', selectedVersionId.value)
          
          emit('resubmit', {
            success: true,
            proposalId: response.data.proposalId || selectedVersionId.value,
            rankings: currentRankings.value
          })
        }
      } catch (error) {
        console.error('Submit new proposal error:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('提交提案失敗，請重試')
      } finally {
        isSubmittingNewProposal.value = false
      }
    }
    
    // 排序功能
    const moveUp = (index) => {
      if (index <= 0) return
      const targetArray = hasExistingProposal.value ? currentRankings.value : submittedGroups.value
      const item = targetArray.splice(index, 1)[0]
      targetArray.splice(index - 1, 0, item)
      // 更新排名
      targetArray.forEach((group, idx) => {
        group.rank = idx + 1
      })
    }
    
    const moveDown = (index) => {
      const targetArray = hasExistingProposal.value ? currentRankings.value : submittedGroups.value
      if (index >= targetArray.length - 1) return
      const item = targetArray.splice(index, 1)[0]
      targetArray.splice(index + 1, 0, item)
      // 更新排名
      targetArray.forEach((group, idx) => {
        group.rank = idx + 1
      })
    }
    
    // 拖拽功能
    const handleDragStart = (index, event) => {
      if (hasExistingProposal.value && !isResubmitting.value) return
      draggedIndex.value = index
      event.dataTransfer.effectAllowed = 'move'
    }
    
    const handleDragOver = (index) => {
      if (hasExistingProposal.value && !isResubmitting.value) return
    }
    
    const handleDrop = (index) => {
      if ((hasExistingProposal.value && !isResubmitting.value) || draggedIndex.value === null) return
      
      const targetArray = hasExistingProposal.value ? currentRankings.value : submittedGroups.value
      const draggedItem = targetArray[draggedIndex.value]
      targetArray.splice(draggedIndex.value, 1)
      
      if (index > draggedIndex.value) {
        targetArray.splice(index - 1, 0, draggedItem)
      } else {
        targetArray.splice(index, 0, draggedItem)
      }
      
      // 更新排名
      targetArray.forEach((group, idx) => {
        group.rank = idx + 1
      })
      
      draggedIndex.value = null
    }
    
    const handleDragEnd = () => {
      draggedIndex.value = null
    }
    
    // 圖表渲染
    const renderStackedBarChart = () => {
      const container = document.querySelector('.d3-chart-container')
      if (!container || !chartData.value.length) return
      
      container.innerHTML = ''
      
      if (typeof d3 === 'undefined') {
        renderFallbackChart()
        return
      }
      
      const margin = { top: 20, right: 30, bottom: 40, left: 40 }
      const width = container.clientWidth - margin.left - margin.right
      const height = 200 - margin.top - margin.bottom
      
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      
      const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)
      
      // X軸比例尺
      const x = d3.scaleBand()
        .domain(chartData.value.map(d => d.date))
        .range([0, width])
        .padding(0.1)
      
      // Y軸比例尺 - 找出最大總票數
      const maxTotal = d3.max(chartData.value, d => d.support + d.oppose)
      const y = d3.scaleLinear()
        .domain([0, maxTotal || 10])
        .nice()
        .range([height, 0])
      
      // 繪製支持票數條
      g.selectAll('.bar-support')
        .data(chartData.value)
        .enter().append('rect')
        .attr('class', 'bar-support')
        .attr('x', d => x(d.date))
        .attr('y', d => y(d.support + d.oppose))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.support))
        .attr('fill', '#28a745')
        .style('opacity', 0)
        .transition()
        .duration(800)
        .style('opacity', 0.8)
      
      // 繪製反對票數條
      g.selectAll('.bar-oppose')
        .data(chartData.value)
        .enter().append('rect')
        .attr('class', 'bar-oppose')
        .attr('x', d => x(d.date))
        .attr('y', d => y(d.oppose))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.oppose))
        .attr('fill', '#dc3545')
        .style('opacity', 0)
        .transition()
        .duration(800)
        .delay(200)
        .style('opacity', 0.8)
      
      // 添加分版本的虛線
      proposalVersions.value.forEach((version, index) => {
        if (index > 0) {
          // 安全處理版本時間戳
          let timestamp = version.createdTime || Date.now()
          if (typeof timestamp === 'string' && !isNaN(timestamp)) {
            timestamp = parseInt(timestamp)
          }
          const versionDate = new Date(timestamp).toLocaleDateString('zh-TW')
          const xPos = x(versionDate) || x.range()[1] * (index / proposalVersions.value.length)
          
          g.append('line')
            .attr('x1', xPos)
            .attr('x2', xPos)
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', '#6c757d')
            .attr('stroke-dasharray', '3,3')
            .attr('stroke-width', 1)
            .style('opacity', 0.6)
        }
      })
      
      // 添加軸
      g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
      
      g.append('g')
        .call(d3.axisLeft(y).ticks(5))
    }
    
    const renderFallbackChart = () => {
      const container = document.querySelector('.d3-chart-container')
      const totalSupport = chartData.value.reduce((sum, d) => sum + d.support, 0)
      const totalOppose = chartData.value.reduce((sum, d) => sum + d.oppose, 0)
      
      container.innerHTML = `
        <div class="fallback-chart">
          <div class="current-stats">
            <div class="stat-item">
              <span class="stat-label">總支持票</span>
              <span class="stat-value support">${totalSupport}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">總反對票</span>
              <span class="stat-value oppose">${totalOppose}</span>
            </div>
          </div>
        </div>
      `
    }
    
    const resetState = () => {
      isResubmitting.value = false
      isSubmittingVote.value = false
      isSubmittingNewProposal.value = false
      voteType.value = ''
      draggedIndex.value = null
      userVote.value = null
      hasStartedProposal.value = false
    }
    
    const handleClose = () => {
      emit('update:visible', false)
    }

    const handleVisibleChange = (newValue) => {
      emit('update:visible', newValue)
    }
    
    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleString('zh-TW')
    }
    
    return {
      loading,
      isSubmittingVote,
      isSubmittingNewProposal,
      voteType,
      isResubmitting,
      currentRankings,
      originalRankings,
      draggedIndex,
      proposalVersions,
      selectedVersionId,
      currentProposal,
      userVote,
      voteHistory,
      chartData,
      hasExistingProposal,
      hasValidRanking,
      displayRankings,
      submittedGroups,
      hasStartedProposal,
      userHasVoted,
      showInitialProposalButton,
      showSubmitProposalButton,
      showVoteButtons,
      vote,
      startResubmit,
      startInitialProposal,
      submitNewProposal,
      moveUp,
      moveDown,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
      onVersionChange,
      handleClose,
      handleVisibleChange,
      formatTime
    }
  }
}
</script>

<style scoped>
.drawer-header-custom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
}

.drawer-header-custom h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
  font-weight: 600;
}

.drawer-header-custom h3 i {
  margin-right: 10px;
  color: #3498db;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: #7f8c8d;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s;
}

.drawer-close-btn:hover {
  background: #ecf0f1;
  color: #2c3e50;
}

.vote-drawer-content {
  padding: 20px;
  min-height: 100%;
}

/* 說明橫幅 */
.info-banner {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 25px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.banner-content {
  display: flex;
  align-items: flex-start;
  gap: 15px;
}

.banner-content i {
  font-size: 20px;
  margin-top: 2px;
  opacity: 0.9;
}

.banner-text {
  flex: 1;
  line-height: 1.6;
  font-size: 15px;
}

/* 版本選擇器 */
.version-selector-section {
  margin-bottom: 25px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.section-label {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.version-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.version-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.version-number {
  font-weight: 600;
  color: #2c3e50;
}

.version-proposer {
  font-size: 12px;
  color: #7f8c8d;
}

.version-stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
}

.support-count {
  color: #28a745;
}

.oppose-count {
  color: #dc3545;
}

/* 排名區域 */
.ranking-section {
  margin-bottom: 25px;
}

.ranking-list-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e9ecef;
}

.ranking-list.disabled {
  opacity: 0.7;
}

.ranking-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  margin-bottom: 12px;
  border: 2px solid #e9ecef;
  border-radius: 10px;
  background: white;
  transition: all 0.3s;
  position: relative;
}

.ranking-item.draggable {
  cursor: grab;
}

.ranking-item.draggable:hover {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(52, 152, 219, 0.15);
}

.ranking-item.draggable:active {
  cursor: grabbing;
}

.ranking-item.dragging {
  opacity: 0.6;
  transform: rotate(2deg);
  z-index: 1000;
}

.rank-number {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  width: 45px;
  height: 45px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  margin-right: 20px;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.3);
}

.group-info {
  flex: 1;
}

.group-name {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 5px;
}

.group-members {
  font-size: 14px;
  color: #7f8c8d;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ranking-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7f8c8d;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  background: #f1f3f4;
  border-radius: 8px;
}

.ranking-hint i {
  color: #f39c12;
}

/* 投票趨勢圖表 */
.vote-visualization {
  margin-bottom: 25px;
}

.chart-container {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e9ecef;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.d3-chart-container {
  min-height: 250px;
  width: 100%;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e9ecef;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #2c3e50;
  font-weight: 500;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.legend-color.support {
  background: #28a745;
}

.legend-color.oppose {
  background: #dc3545;
}

/* 備用圖表 */
.fallback-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.current-stats {
  display: flex;
  gap: 50px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.stat-label {
  font-size: 14px;
  color: #7f8c8d;
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
}

.stat-value.support {
  color: #28a745;
}

.stat-value.oppose {
  color: #dc3545;
}

/* 投票按鈕 */
.vote-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
  padding: 20px 0;
}

.vote-actions .el-button {
  min-width: 120px;
  height: 50px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 25px;
  position: relative;
  transition: all 0.3s;
}

.vote-actions .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.vote-actions .el-button.voted {
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.3);
}

.vote-indicator {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #28a745;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.initial-proposal-actions {
  display: flex;
  justify-content: center;
  padding: 30px 0;
}

.initial-proposal-actions .el-button {
  min-width: 200px;
  height: 50px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 25px;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .vote-drawer-content {
    padding: 15px;
  }
  
  .ranking-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .rank-number {
    align-self: flex-start;
  }
  
  .item-actions {
    flex-direction: row;
    align-self: flex-end;
  }
  
  .vote-actions {
    flex-direction: column;
  }
  
  .vote-actions .el-button {
    width: 100%;
  }
  
  .current-stats {
    flex-direction: column;
    gap: 20px;
  }
}

/* 新增的按鈕狀態樣式 */
.voted-alert {
  margin-bottom: 20px;
}

.submit-proposal-section {
  margin-top: 20px;
  text-align: center;
}

.submit-proposal-btn {
  width: 80%;
  max-width: 300px;
}

.action-buttons-container {
  margin-top: 30px;
}

.initial-proposal-actions {
  text-align: center;
  margin-bottom: 20px;
}

.initial-proposal-btn {
  width: 80%;
  max-width: 300px;
}

/* 排名資訊提示 */
.ranking-info {
  margin-top: 10px;
  padding: 8px 12px;
  background: #e6f3ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ranking-info i {
  color: #1890ff;
}

@media (max-width: 768px) {
  .submit-proposal-btn,
  .initial-proposal-btn {
    width: 100%;
  }
}
</style>