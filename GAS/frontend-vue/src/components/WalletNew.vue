<template>
  <div class="wallet-container">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="dropdown-container">
        <!-- Project Dropdown -->
        <el-select
          v-model="selectedProjectId"
          placeholder="選擇專案"
          filterable
          clearable
          @change="onProjectChange"
          class="project-select"
        >
          <el-option
            v-for="project in userProjects"
            :key="project.projectId"
            :label="project.projectName"
            :value="project.projectId"
          >
          </el-option>
        </el-select>
        
        <!-- User Dropdown (only for teacher_privilege) -->
        <el-select
          v-if="hasTeacherPrivilege && selectedProjectId"
          v-model="selectedUserEmail"
          placeholder="選擇使用者"
          filterable
          clearable
          @change="onUserChange"
          class="user-select"
          v-loading="loadingUsers"
          element-loading-text="載入參與者..."
        >
          <el-option
            v-for="user in projectUsers"
            :key="user.userEmail"
            :label="user.displayName || user.username || user.userEmail"
            :value="user.userEmail"
          >
          </el-option>
        </el-select>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="$emit('user-command', $event)"
      />
    </div>

    <!-- Content -->
    <div class="content-wrapper" v-loading="loading || loadingProjects" element-loading-text="載入專案資料中...">
      <!-- Main Content Card -->
      <div v-if="selectedProjectId" class="main-content-card">
        <!-- Header Section -->
        <div class="card-header">
          <div class="left-section">
            <!-- Project Title -->
            <div class="project-title">{{ selectedProjectName || '專案標題' }}</div>
            <!-- Project Description -->
            <div class="project-description">{{ projectDescription }}</div>
            
            <!-- Stage Progress Buttons -->
            <div class="stage-progress-buttons">
              <template v-for="(stageInfo, index) in allStagesWithEarnings" :key="stageInfo.stageId">
                <button class="stage-btn" :class="getStageClass(stageInfo)">
                  [{{ stageInfo.stageOrder }}/{{ projectStages.length }}] 階段(+{{ stageInfo.points }})
                </button>
                <i v-if="index < allStagesWithEarnings.length - 1" class="fas fa-chevron-right stage-arrow"></i>
              </template>
            </div>
          </div>
          

        </div>

        <!-- Transactions Section -->
        <div class="transactions-section">
          <!-- Filters with Points and Buttons -->
          <div class="wallet-filters">
            <!-- Left: Filter Controls -->
            <div class="filters-left">
              <div class="filter-row">
                <div class="filter-item">
                  <label>顯示數量</label>
                  <input
                    type="range"
                    v-model="displayLimit"
                    min="10"
                    max="200"
                    step="10"
                    class="display-slider"
                  >
                  <span class="limit-text">{{ displayLimit }} 筆</span>
                </div>
              </div>

              <div class="filter-row">
                <input
                  type="number"
                  v-model.number="pointsFilter"
                  placeholder="過濾點數"
                  class="filter-input"
                >
                <input
                  type="text"
                  v-model="descriptionFilter"
                  placeholder="搜尋說明內容"
                  class="filter-input"
                >
              </div>
            </div>

            <!-- Right: Total Points and Action Buttons -->
            <div class="filters-right">
              <!-- Total Points Box -->
              <div class="total-points-box">
                <span class="points-label">共</span>
                <span class="points-value">{{ walletSummary.totalEarned }}</span>
                <span class="points-unit">點</span>
              </div>

              <!-- Action Buttons -->
              <div class="action-buttons">
                <button class="action-btn ranking-btn" @click="openWalletLadder">專案點數天梯</button>
                <button class="action-btn export-btn" @click="exportWalletCSV">輸出錢包CSV</button>
                <button
                  v-if="hasTeacherPrivilege"
                  class="action-btn export-project-btn"
                  @click="exportProjectWalletSummary"
                  :disabled="loadingExportProject"
                >
                  <i v-if="loadingExportProject" class="fas fa-spinner fa-spin"></i>
                  <span v-if="!loadingExportProject">輸出專案總點數</span>
                  <span v-else>處理中...</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="transactions-container" v-loading="loading" element-loading-text="載入交易記錄中...">
          <table class="transactions-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>金額</th>
                <th>類型</th>
                <th>說明</th>
                <th>階段</th>
                <th>關聯內容</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="transaction in filteredTransactions" :key="transaction.id">
                <!-- Main Transaction Row -->
                <tr class="transaction-row" :class="{ 'expanded': expandedTransactions.has(transaction.id) }" @click="toggleTransactionExpansion(transaction)">
                  <td>{{ formatTime(transaction.timestamp) }}</td>
                  <td class="points" :class="{ positive: transaction.points > 0, negative: transaction.points < 0 }">
                    {{ transaction.points > 0 ? '+' : '' }}{{ transaction.points }}
                  </td>
                  <td>
                    <span class="transaction-type" :class="transaction.transactionType">
                      {{ getTransactionTypeText(transaction.transactionType) }}
                    </span>
                  </td>
                  <td class="source-text">{{ transaction.description }}</td>
                  <td>{{ transaction.stageName || '階段' + transaction.stage }}</td>
                  <td class="actions" @click.stop>
                    <button
                      v-if="transaction.relatedSubmissionId || transaction.relatedCommentId"
                      class="btn-sm btn-secondary"
                      @click="toggleTransactionExpansion(transaction)"
                    >
                      <i class="fas" :class="expandedTransactions.has(transaction.id) ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                      {{ expandedTransactions.has(transaction.id) ? '收起' : '點擊查看' }}
                    </button>
                    <button
                      v-if="hasTeacherPrivilege && !isTransactionReversed(transaction)"
                      class="btn-sm btn-danger"
                      :disabled="reversingTransactions.has(transaction.transactionId)"
                      @click="promptReverseTransaction(transaction)"
                    >
                      <i :class="reversingTransactions.has(transaction.transactionId) ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
                      {{ reversingTransactions.has(transaction.transactionId) ? '撤銷中...' : '撤銷' }}
                    </button>
                  </td>
                </tr>
                
                <!-- Expanded Details Row -->
                <tr v-if="expandedTransactions.has(transaction.id)" class="transaction-details">
                  <td colspan="6">
                    <div class="details-container" v-loading="loadingTransactionDetails.has(transaction.id)" element-loading-text="載入詳情中...">
                      <!-- Related Submission -->
                      <div v-if="transaction.relatedSubmissionId" class="detail-section">
                        <h4><i class="fas fa-file-alt"></i> 相關成果</h4>
                        <div v-if="transactionDetailsMap.get(transaction.id)?.submission" class="detail-content">
                          <div class="submission-content" v-html="transactionDetailsMap.get(transaction.id).submission.contentMarkdown || transactionDetailsMap.get(transaction.id).submission.content"></div>
                          <div class="detail-meta">
                            <span v-if="transactionDetailsMap.get(transaction.id).submission.submitTime" class="meta-time">
                              <i class="fas fa-clock"></i>
                              提交時間: {{ formatTime(transactionDetailsMap.get(transaction.id).submission.submitTime) }}
                            </span>
                            <span v-if="transactionDetailsMap.get(transaction.id).submission.submitterEmail" class="meta-author">
                              <i class="fas fa-user"></i>
                              提交者: {{ transactionDetailsMap.get(transaction.id).submission.submitterEmail }}
                            </span>
                          </div>
                        </div>
                        <div v-else-if="transactionDetailsMap.get(transaction.id)?.submissionError" class="detail-error">
                          無法載入成果內容：{{ transactionDetailsMap.get(transaction.id).submissionError }}
                        </div>
                        <div v-else class="detail-loading">
                          正在載入成果內容...
                        </div>
                      </div>
                      
                      <!-- Related Comment -->
                      <div v-if="transaction.relatedCommentId" class="detail-section">
                        <h4><i class="fas fa-comment"></i> 相關評論</h4>
                        <div v-if="transactionDetailsMap.get(transaction.id)?.comment" class="detail-content">
                          <div class="comment-content" v-html="transactionDetailsMap.get(transaction.id).comment.content"></div>
                          <div class="detail-meta">
                            <span v-if="transactionDetailsMap.get(transaction.id).comment.createdTime" class="meta-time">
                              <i class="fas fa-clock"></i>
                              發布時間: {{ formatTime(transactionDetailsMap.get(transaction.id).comment.createdTime) }}
                            </span>
                            <span v-if="transactionDetailsMap.get(transaction.id).comment.authorEmail" class="meta-author">
                              <i class="fas fa-user"></i>
                              作者: {{ transactionDetailsMap.get(transaction.id).comment.authorEmail }}
                            </span>
                          </div>
                        </div>
                        <div v-else-if="transactionDetailsMap.get(transaction.id)?.commentError" class="detail-error">
                          無法載入評論內容：{{ transactionDetailsMap.get(transaction.id).commentError }}
                        </div>
                        <div v-else class="detail-loading">
                          正在載入評論內容...
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          
            <div v-if="filteredTransactions.length === 0" class="no-transactions">
              <i class="fas fa-coins"></i>
              <p>沒有找到符合條件的交易記錄</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Project Selected Message -->
      <div v-else class="no-project-selected">
        <i class="fas fa-project-diagram"></i>
        <h3>請選擇一個專案來查看錢包記錄</h3>
        <p>使用上方的專案下拉選單選擇您要查看的專案</p>
      </div>
    </div>

    <!-- Wallet Ladder Drawer -->
    <el-drawer
      v-model="walletLadderVisible"
      title="專案點數天梯圖"
      size="100%"
      direction="btt"
      :before-close="handleCloseWalletLadder"
    >
      <div class="wallet-ladder-content" v-loading="loadingWalletLadder" element-loading-text="載入天梯數據中...">
        <div v-if="walletLadderError" class="error-section">
          <div class="error-message">{{ walletLadderError }}</div>
          <button class="retry-btn" @click="loadWalletLadder">重試</button>
        </div>
        <div v-else-if="walletLadderData" class="ladder-chart-container">
          <!-- 權限提示 -->
          <div class="ladder-info-bar">
            <div class="access-info">
              <span v-if="walletLadderData.hasFullAccess" class="full-access-badge">
                <i class="fas fa-eye"></i> 完整權限：顯示所有參與者 ({{ walletLadderData.walletData.length }} 人)
              </span>
              <span v-else class="limited-access-badge">
                <i class="fas fa-eye-slash"></i> 限制檢視：僅顯示最高、最低和您的排名
              </span>
            </div>
          </div>
          <div id="ladderChart" class="ladder-chart"></div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import TopBarUserControls from './TopBarUserControls.vue'
import { calculateStageStatus } from '@/utils/stageStatus.js'

export default {
  name: 'WalletNew',
  components: {
    TopBarUserControls
  },
  props: {
    user: {
      type: Object,
      default: null
    },
    sessionPercentage: {
      type: Number,
      default: 100
    },
    remainingTime: {
      type: Number,
      default: 0
    }
  },
  emits: ['user-command'],
  data() {
    return {
      selectedProjectId: null,
      selectedUserEmail: null,
      selectedProjectName: '',
      selectedProjectDescription: '',
      displayLimit: 50,
      pointsFilter: null,
      descriptionFilter: '',
      loading: false,
      loadingProjects: false,
      loadingUsers: false,
      
      projectTransactions: [],
      userProjects: [], // Projects that user participates in
      projectUsers: [], // Users in selected project
      projectStages: [], // Stages in selected project
      expandedTransactions: new Set(),
      transactionDetailsMap: new Map(),
      loadingTransactionDetails: new Set(),
      reversingTransactions: new Set(), // Track transactions being reversed
      
      // 專案錢包統計相關
      projectStatsVisible: false,
      selectedStatsProject: null,
      loadingProjectStats: false,
      projectStatsData: null,
      projectStatsError: null,
      
      // 仿射變換設定
      scoreRangeMin: 65,
      scoreRangeMax: 95,
      
      // 用戶查詢
      queryUserEmail: '',
      queryUserResult: null,
      highlightedUser: null,
      
      // 天梯圖相關
      walletLadderVisible: false,
      loadingWalletLadder: false,
      walletLadderData: null,
      walletLadderError: null,
      
      // 匯出專案總點數相關
      loadingExportProject: false
      
      // COMMENTED OUT FOR PRODUCTION - Mock data for development only
      /*
      projects: [
        {
          id: 'proj_001',
          title: '智慧城市數據分析專案',
          description: '利用大數據技術分析城市交通流量和空氣品質，提供智慧城市解決方案的研究專案',
          currentStage: 3,
          totalPoints: 500,
          stages: [...]
        }
      ],
      
      allTransactions: [
        {
          id: 1, projectId: 'proj_001', points: 200, stage: 3,
          description: '報告獲獎金500，該組排名3',
          timestamp: 1738386000000, type: 'reward'
        }
      ]
      */
    }
  },
  
  computed: {
    // 檢查當前用戶是否有教師權限
    hasTeacherPrivilege() {
      console.log('=== WalletNew hasTeacherPrivilege Debug Fixed ===')
      console.log('this.user:', this.user)
      
      if (!this.user) {
        console.log('❌ No user object found')
        return false
      }
      
      console.log('this.user.permissions:', this.user.permissions)
      console.log('this.user.globalPermissions:', this.user.globalPermissions)
      
      // 正確的權限來源是 this.user.permissions，不是 globalPermissions
      const userPermissions = this.user.permissions || []
      console.log('Using permissions array:', userPermissions)
      
      const result = userPermissions.includes('teacher_privilege')
      
      console.log('🎯 teacher_privilege check result:', result)
      console.log('=== WalletNew hasTeacherPrivilege Debug Fixed End ===')
      
      return result
    },
    
    filteredTransactions() {
      if (!this.selectedProjectId) return []
      
      let transactions = this.projectTransactions || []
      
      // 確保transactions是陣列
      if (!Array.isArray(transactions)) {
        console.warn('Transactions is not an array:', transactions)
        return []
      }
      
      // 點數過濾
      if (this.pointsFilter !== null && this.pointsFilter !== undefined) {
        transactions = transactions.filter(t => t.points === this.pointsFilter)
      }
      
      // 說明過濾
      if (this.descriptionFilter && this.descriptionFilter.trim()) {
        const searchText = this.descriptionFilter.trim().toLowerCase()
        transactions = transactions.filter(t => 
          t.description && t.description.toLowerCase().includes(searchText)
        )
      }
      
      const result = transactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.displayLimit)
        
      return result
    },
    
    // 錢包摘要 - 只計算總收入和總入帳次數
    walletSummary() {
      if (!this.selectedProjectId) return { totalEarned: 0, transactionCount: 0 }
      
      const transactions = this.projectTransactions || []
      let totalEarned = 0
      
      transactions.forEach(transaction => {
        if (transaction.points > 0) {
          totalEarned += transaction.points
        }
      })
      
      return {
        totalEarned: totalEarned,
        transactionCount: transactions.length
      }
    },
    
    // 所有階段與收入資訊（按順序排列）
    allStagesWithEarnings() {
      if (!this.projectStages.length) return []
      
      // 先計算每個階段的收入
      const stageEarningsMap = new Map()
      
      if (this.projectTransactions.length > 0) {
        this.projectTransactions.forEach(transaction => {
          if (transaction.points > 0) {
            const stageOrder = transaction.stage || 1
            const currentPoints = stageEarningsMap.get(stageOrder) || 0
            stageEarningsMap.set(stageOrder, currentPoints + transaction.points)
          }
        })
      }
      
      // 結合階段資訊與收入資訊
      return this.projectStages
        .sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
        .map(stage => ({
          stageId: stage.stageId,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName || stage.stageTitle || `階段${stage.stageOrder}`,
          points: stageEarningsMap.get(stage.stageOrder) || 0,
          // 保留原始階段資訊供狀態計算
          ...stage
        }))
    },
    
    // 專案描述（擷取50字）
    projectDescription() {
      const description = this.selectedProjectDescription || ''
      return description.length > 50 ? description.substring(0, 50) + '...' : description
    }
  },
  
  methods: {
    // 當專案選擇改變時
    async onProjectChange() {
      this.selectedUserEmail = null
      this.projectUsers = []
      this.projectStages = []
      
      // 更新專案名稱和描述
      const selectedProject = this.userProjects.find(p => p.projectId === this.selectedProjectId)
      this.selectedProjectName = selectedProject ? selectedProject.projectName : ''
      this.selectedProjectDescription = selectedProject ? selectedProject.description : ''
      
      // 並行載入資料以提高效能
      const loadPromises = [
        this.loadProjectTransactions(),
        this.loadProjectStages()
      ]
      
      if (this.hasTeacherPrivilege && this.selectedProjectId) {
        loadPromises.push(this.loadProjectUsers())
      }
      
      await Promise.all(loadPromises)
    },
    
    // 當使用者選擇改變時
    async onUserChange() {
      await this.loadProjectTransactions()
    },
    
    // 切換交易展開狀態
    toggleTransactionExpansion(transaction) {
      if (this.expandedTransactions.has(transaction.id)) {
        this.expandedTransactions.delete(transaction.id)
      } else {
        this.expandedTransactions.add(transaction.id)
        this.loadTransactionDetails(transaction)
      }
    },
    
    // 載入交易詳情
    async loadTransactionDetails(transaction) {
      if (this.transactionDetailsMap.has(transaction.id)) return
      
      this.loadingTransactionDetails.add(transaction.id)
      
      try {
        // 載入相關成果
        if (transaction.relatedSubmissionId) {
          const submissionResponse = await this.$apiClient.callWithAuth('/submissions/details', {
            projectId: this.selectedProjectId,
            submissionId: transaction.relatedSubmissionId
          })
          
          if (submissionResponse.success) {
            this.transactionDetailsMap.set(transaction.id, {
              ...this.transactionDetailsMap.get(transaction.id),
              submission: submissionResponse.data
            })
          } else {
            this.transactionDetailsMap.set(transaction.id, {
              ...this.transactionDetailsMap.get(transaction.id),
              submissionError: submissionResponse.error?.message || '載入失敗'
            })
          }
        }
        
        // 載入相關評論
        if (transaction.relatedCommentId) {
          const commentResponse = await this.$apiClient.callWithAuth('/comments/details', {
            projectId: this.selectedProjectId,
            commentId: transaction.relatedCommentId
          })
          
          if (commentResponse.success) {
            this.transactionDetailsMap.set(transaction.id, {
              ...this.transactionDetailsMap.get(transaction.id),
              comment: commentResponse.data
            })
          } else {
            this.transactionDetailsMap.set(transaction.id, {
              ...this.transactionDetailsMap.get(transaction.id),
              commentError: commentResponse.error?.message || '載入失敗'
            })
            console.warn('Comment loading failed:', commentResponse.error)
          }
        }
      } catch (error) {
        console.error('Error loading transaction details:', error)
      } finally {
        this.loadingTransactionDetails.delete(transaction.id)
      }
    },
    
    formatTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return ''
      return date.getFullYear() + '/' + 
             String(date.getMonth() + 1).padStart(2, '0') + '/' + 
             String(date.getDate()).padStart(2, '0') + ' ' +
             String(date.getHours()).padStart(2, '0') + ':' +
             String(date.getMinutes()).padStart(2, '0') + ':' +
             String(date.getSeconds()).padStart(2, '0')
    },
    
    // 取得交易類型文字（不翻譯，保持原樣）
    getTransactionTypeText(type) {
      const typeMap = {
        'submission_reward': '提交獎勵',
        'comment_reward': '評論獎勵',
        'vote_reward': '投票獎勵',
        'bonus_award': '額外獎勵',
        'penalty': '扣分處罰',
        'stage_completion': '階段完成',
        'settlement_reversal': '撤銷結算',
        'comment_settlement': '評論結算',
        'excellence_award': '優秀表現',
        'reversal': '撤銷點數'
      }
      return typeMap[type] || type
    },
    
    // 載入使用者的專案列表
    async loadUserProjects() {
      this.loadingProjects = true
      try {
        const response = await this.$apiClient.getProjectsListWithStages()
        if (response.success && response.data) {
          this.userProjects = response.data.map(p => ({
            projectId: p.projectId,
            projectName: p.projectName,
            description: p.description
          }))
        }
      } catch (error) {
        console.error('Error loading user projects:', error)
        this.$message.error('載入專案列表失敗')
      } finally {
        this.loadingProjects = false
      }
    },
    
    // 載入專案的使用者列表 (只有teacher_privilege的用戶可以使用)
    async loadProjectUsers() {
      if (!this.selectedProjectId || !this.hasTeacherPrivilege) return
      
      this.loadingUsers = true
      try {
        // 使用與ProjectDetail.vue相同的API
        const response = await this.$apiClient.getProjectCore(this.selectedProjectId)
        if (response.success && response.data) {
          // 提取所有參與者
          this.projectUsers = response.data.users || []
        } else {
          this.$message.error('無法載入專案參與者')
        }
      } catch (error) {
        console.error('Error loading project users:', error)
        this.$message.error('載入專案參與者失敗')
      } finally {
        this.loadingUsers = false
      }
    },
    
    // 載入專案階段資訊
    async loadProjectStages() {
      if (!this.selectedProjectId) return
      
      try {
        const response = await this.$apiClient.callWithAuth('/projects/get', {
          projectId: this.selectedProjectId
        })
        if (response.success && response.data && response.data.stages) {
          this.projectStages = response.data.stages.sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
        }
      } catch (error) {
        console.error('Error loading project stages:', error)
      }
    },
    
    // 載入專案的交易記錄
    async loadProjectTransactions() {
      if (!this.selectedProjectId) {
        this.projectTransactions = []
        return
      }
      
      this.loading = true
      try {
        // 如果選擇了特定使用者，只取得該使用者的交易
        const targetUser = this.selectedUserEmail || null
        
        const response = await this.$apiClient.callWithAuth('/wallets/user-transactions', {
          projectId: this.selectedProjectId,
          targetUserEmail: targetUser,
          limit: 1000
        })
        
        if (response.success && response.data) {
          this.projectTransactions = response.data.map(t => ({
            id: t.transactionId,
            points: t.amount,
            description: t.source,
            stage: t.stageOrder || 1,
            stageName: t.stageName,
            timestamp: t.timestamp,
            transactionType: t.transactionType,
            relatedSubmissionId: t.relatedSubmissionId,
            relatedCommentId: t.relatedCommentId
          }))
        }
      } catch (error) {
        console.error('Error loading project transactions:', error)
        this.$message.error('載入交易記錄失敗')
      } finally {
        this.loading = false
      }
    },
    
    // 取得當前顯示的用戶
    getCurrentUserDisplay() {
      if (this.hasTeacherPrivilege && this.selectedUserEmail) {
        const user = this.projectUsers.find(u => u.userEmail === this.selectedUserEmail)
        return user ? user.displayName : this.selectedUserEmail
      }
      return this.user?.displayName || this.user?.userEmail || '當前用戶'
    },
    
    // 取得階段樣式（根據階段狀態）
    getStageClass(stageInfo) {
      // stageInfo 本身就包含了完整的階段資訊
      const status = calculateStageStatus(stageInfo)
      switch(status) {
        case 'completed':
        case 'archived':
          return 'stage-completed'
        case 'active':
          return 'stage-active'
        case 'voting':
          return 'stage-voting'
        case 'pending':
        default:
          return 'stage-pending'
      }
    },
    
    // 取得階段點數
    getStagePoints(stageId) {
      const stageTransactions = this.projectTransactions.filter(t => t.stageId === stageId)
      return stageTransactions.reduce((sum, t) => sum + (t.points > 0 ? t.points : 0), 0)
    },
    
    // 輸出錢包CSV
    exportWalletCSV() {
      if (!this.selectedProjectId || !this.projectTransactions.length) {
        this.$message.warning('沒有可匯出的交易記錄')
        return
      }
      
      try {
        // CSV標題行
        const headers = ['時間', '金額', '類型', '說明', '階段', '階段名稱', '交易ID']
        
        // 轉換交易記錄為CSV格式
        const csvData = this.projectTransactions.map(transaction => [
          this.formatTime(transaction.timestamp),
          transaction.points,
          transaction.transactionType || '',
          (transaction.description || '').replace(/"/g, '""'), // 處理CSV中的引號
          transaction.stage,
          (transaction.stageName || '').replace(/"/g, '""'),
          transaction.id
        ])
        
        // 組合CSV內容
        const csvContent = [headers, ...csvData]
          .map(row => row.map(field => `"${field}"`).join(','))
          .join('\n')
        
        // 添加BOM以支持中文字符
        const BOM = '\uFEFF'
        const csvWithBOM = BOM + csvContent
        
        // 創建下載鏈接
        const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        
        if (link.download !== undefined) {
          const url = URL.createObjectURL(blob)
          link.setAttribute('href', url)
          
          // 生成檔案名稱
          const projectName = this.selectedProjectName || '專案'
          const userDisplay = this.getCurrentUserDisplay()
          const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
          const fileName = `錢包記錄_${projectName}_${userDisplay}_${timestamp}.csv`
          
          link.setAttribute('download', fileName)
          link.style.visibility = 'hidden'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          
          this.$message.success('CSV檔案已成功匯出')
        }
      } catch (error) {
        console.error('Error exporting CSV:', error)
        this.$message.error('匯出CSV檔案失敗')
      }
    },
    
    // 打開天梯圖
    async openWalletLadder() {
      if (!this.selectedProjectId) {
        this.$message.warning('請先選擇一個專案')
        return
      }
      
      this.walletLadderVisible = true
      await this.loadWalletLadder()
    },
    
    // 載入天梯圖數據
    async loadWalletLadder() {
      if (!this.selectedProjectId) return
      
      this.loadingWalletLadder = true
      this.walletLadderError = null
      
      try {
        const response = await this.$apiClient.callWithAuth('/wallets/project-ladder', {
          projectId: this.selectedProjectId
        })
        
        if (response.success) {
          this.walletLadderData = response.data
          this.$nextTick(() => {
            this.renderLadderChart()
          })
        } else {
          this.walletLadderError = response.error?.message || '載入天梯數據失敗'
        }
      } catch (error) {
        console.error('Error loading wallet ladder:', error)
        this.walletLadderError = '載入天梯數據時發生錯誤'
      } finally {
        this.loadingWalletLadder = false
      }
    },
    
    // 渲染天梯圖
    renderLadderChart() {
      if (!this.walletLadderData || !this.walletLadderData.walletData) return
      
      // 清除舊圖表
      const chartContainer = document.getElementById('ladderChart')
      if (!chartContainer) return
      
      chartContainer.innerHTML = ''
      
      // 動態引入D3並渲染圖表
      this.loadD3AndRender(chartContainer)
    },
    
    // 載入D3並渲染圖表
    async loadD3AndRender(container) {
      try {
        // 檢查D3是否已載入
        if (typeof d3 === 'undefined') {
          // 動態載入D3
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js'
          script.onload = () => {
            this.createLadderChart(container)
          }
          document.head.appendChild(script)
        } else {
          this.createLadderChart(container)
        }
      } catch (error) {
        console.error('Error loading D3:', error)
        this.walletLadderError = '載入圖表庫失敗'
      }
    },
    
    // 創建天梯圖
    createLadderChart(container) {
      const data = this.walletLadderData.walletData
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="no-data">沒有可顯示的天梯數據</div>'
        return
      }
      
      // 設置圖表尺寸
      const margin = { top: 40, right: 200, bottom: 60, left: 80 }
      const containerWidth = container.clientWidth || 800
      const width = containerWidth - margin.left - margin.right
      const height = Math.max(400, Math.min(600, data.length * 60)) - margin.top - margin.bottom
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', height + margin.top + margin.bottom)
        .attr('viewBox', `0 0 ${containerWidth} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
      
      const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)
      
      // 處理數據
      const sortedData = [...data].sort((a, b) => b.currentBalance - a.currentBalance)
      const minWealth = d3.min(sortedData, d => d.currentBalance) || 0
      const maxWealth = d3.max(sortedData, d => d.currentBalance) || 100
      
      // 建立比例尺
      const xScale = d3.scaleLinear()
        .domain([0, maxWealth * 1.1])
        .range([0, width])
      
      const yScale = d3.scaleLinear()
        .domain([minWealth, maxWealth])
        .range([height, 0])
      
      // 繪製X軸
      const xAxis = d3.axisBottom(xScale)
        .ticks(8)
        .tickFormat(d => this.formatPoints(d))
      
      g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-30)')
      
      // X軸標籤
      g.append('text')
        .attr('class', 'axis-label')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + 55)
        .text('錢包點數')
      
      // 繪製左側天梯主軸
      g.append('line')
        .attr('class', 'ladder-line')
        .attr('x1', 0)
        .attr('y1', yScale(minWealth))
        .attr('x2', 0)
        .attr('y2', yScale(maxWealth))
        .style('stroke', '#2196F3')
        .style('stroke-width', 3)
        .style('stroke-dasharray', '5,5')
      
      // 標記百分制分數範圍
      if (sortedData.length > 0) {
        // 獲取專案分數範圍
        const scoreMin = this.walletLadderData.scoreRangeMin || 65
        const scoreMax = this.walletLadderData.scoreRangeMax || 95
        
        // 最高分標記
        g.append('circle')
          .attr('class', 'extreme-marker')
          .attr('cx', 0)
          .attr('cy', yScale(maxWealth))
          .attr('r', 8)
          .style('fill', '#4CAF50')
          .style('stroke', 'white')
          .style('stroke-width', 2)
        
        g.append('text')
          .attr('class', 'extreme-label')
          .attr('x', -15)
          .attr('y', yScale(maxWealth) + 5)
          .attr('text-anchor', 'end')
          .style('fill', '#4CAF50')
          .style('font-weight', 'bold')
          .text(`${scoreMax}分`)
        
        // 最低分標記
        g.append('circle')
          .attr('class', 'extreme-marker')
          .attr('cx', 0)
          .attr('cy', yScale(minWealth))
          .attr('r', 8)
          .style('fill', '#FF9800')
          .style('stroke', 'white')
          .style('stroke-width', 2)
        
        g.append('text')
          .attr('class', 'extreme-label')
          .attr('x', -15)
          .attr('y', yScale(minWealth) + 5)
          .attr('text-anchor', 'end')
          .style('fill', '#FF9800')
          .style('font-weight', 'bold')
          .text(`${scoreMin}分`)
      }
      
      // 繪製每個用戶的連接線和標記
      sortedData.forEach((person, i) => {
        const y = yScale(person.currentBalance)
        const x = xScale(person.currentBalance)
        const avatarSize = 32
        
        // 橫向連接線
        g.append('line')
          .attr('class', 'connector-line')
          .attr('x1', 0)
          .attr('y1', y)
          .attr('x2', x)
          .attr('y2', y)
          .style('stroke', '#90CAF9')
          .style('stroke-width', 2)
          .style('opacity', 0)
          .transition()
          .duration(500)
          .delay(i * 50)
          .style('opacity', 1)
        
        // 檢查是否為當前用戶
        const isCurrentUser = person.userEmail === this.walletLadderData.currentUserEmail
        
        // 用戶頭像標記
        const avatarGroup = g.append('g')
          .attr('transform', `translate(${x},${y})`)
        
        // 如果是當前用戶，添加紅色邊框
        if (isCurrentUser) {
          avatarGroup.append('circle')
            .attr('r', avatarSize / 2 + 6)
            .attr('fill', 'none')
            .attr('stroke', '#F44336')
            .attr('stroke-width', 3)
            .attr('stroke-dasharray', '4,2')
            .attr('opacity', 0)
            .transition()
            .duration(300)
            .delay(i * 50 + 200)
            .attr('opacity', 1)
          
          // 添加"這是你"標籤
          avatarGroup.append('text')
            .attr('x', 0)
            .attr('y', -avatarSize / 2 - 10)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('fill', '#F44336')
            .style('opacity', 0)
            .text('這是你')
            .transition()
            .duration(300)
            .delay(i * 50 + 400)
            .style('opacity', 1)
        }
        
        // 背景圓
        avatarGroup.append('circle')
          .attr('r', avatarSize / 2 + 2)
          .attr('fill', 'white')
          .attr('opacity', 0)
          .transition()
          .duration(300)
          .delay(i * 50 + 200)
          .attr('opacity', 1)
        
        // 頭像圓
        const avatarUrl = this.generateAvatarUrl(person)
        
        // 先創建頭像圖片pattern
        const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs')
        const patternId = `avatar-${i}`
        
        const pattern = defs.append('pattern')
          .attr('id', patternId)
          .attr('width', 1)
          .attr('height', 1)
          .attr('patternContentUnits', 'objectBoundingBox')
        
        pattern.append('image')
          .attr('href', avatarUrl)
          .attr('width', 1)
          .attr('height', 1)
          .attr('preserveAspectRatio', 'xMidYMid slice')
        
        avatarGroup.append('circle')
          .attr('r', 0)
          .attr('fill', `url(#${patternId})`)
          .attr('stroke', isCurrentUser ? '#F44336' : 'white')
          .attr('stroke-width', isCurrentUser ? 3 : 2)
          .style('cursor', 'pointer')
          .transition()
          .duration(300)
          .delay(i * 50 + 200)
          .attr('r', avatarSize / 2)
        
        // 姓名標籤
        g.append('text')
          .attr('class', 'person-label')
          .attr('x', x + avatarSize / 2 + 8)
          .attr('y', y + 4)
          .style('opacity', 0)
          .style('font-size', '13px')
          .style('fill', '#333')
          .text(person.displayName || person.username || person.userEmail)
          .transition()
          .duration(300)
          .delay(i * 50 + 300)
          .style('opacity', 1)
        
        // 點數標籤
        g.append('text')
          .attr('class', 'wealth-label')
          .attr('x', x + avatarSize / 2 + 8)
          .attr('y', y + 18)
          .style('opacity', 0)
          .style('font-size', '11px')
          .style('fill', '#666')
          .text(this.formatPoints(person.currentBalance))
          .transition()
          .duration(300)
          .delay(i * 50 + 300)
          .style('opacity', 1)
        
        // 計算並顯示預估百分制分數
        const scoreRangeMin = this.walletLadderData.scoreRangeMin || 65
        const scoreRangeMax = this.walletLadderData.scoreRangeMax || 95
        let estimatedScore = scoreRangeMax
        
        if (maxWealth !== minWealth) {
          // 仿射變換公式
          estimatedScore = scoreRangeMin + (person.currentBalance - minWealth) / (maxWealth - minWealth) * (scoreRangeMax - scoreRangeMin)
          estimatedScore = Math.round(estimatedScore * 10) / 10 // 保留一位小數
        }
        
        // 預估分數標籤
        g.append('text')
          .attr('class', 'estimated-score-label')
          .attr('x', x + avatarSize / 2 + 8)
          .attr('y', y + 32)
          .style('opacity', 0)
          .style('font-size', '10px')
          .style('fill', '#4CAF50')
          .style('font-weight', 'bold')
          .text(`預估為${estimatedScore}分`)
          .transition()
          .duration(300)
          .delay(i * 50 + 350)
          .style('opacity', 1)
      })
    },
    
    // 生成頭像URL
    generateAvatarUrl(person) {
      if (person.avatarSeed && person.avatarStyle) {
        const style = person.avatarStyle || 'avataaars'
        let seed = person.avatarSeed
        
        // 如果有avatarOptions，添加到URL參數中
        if (person.avatarOptions) {
          const options = typeof person.avatarOptions === 'string' 
            ? JSON.parse(person.avatarOptions) 
            : person.avatarOptions
          
          const params = new URLSearchParams()
          Object.entries(options).forEach(([key, value]) => {
            params.append(key, value)
          })
          
          const optionsQuery = params.toString()
          return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&${optionsQuery}`
        }
        
        return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`
      }
      
      // 使用用戶名或郵箱作為種子
      const seed = person.username || person.userEmail || 'default'
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
    },
    
    // 格式化點數
    formatPoints(value) {
      if (value >= 10000) {
        return `${(value / 10000).toFixed(1)}萬`
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}k`
      } else {
        return value.toString()
      }
    },
    
    // 關閉天梯圖drawer
    handleCloseWalletLadder(done) {
      this.walletLadderData = null
      this.walletLadderError = null
      done()
    },
    
    // 輸出專案總點數CSV
    async exportProjectWalletSummary() {
      if (!this.selectedProjectId) {
        this.$message.warning('請先選擇一個專案')
        return
      }
      
      if (this.loadingExportProject) {
        return // 防止重複點擊
      }
      
      this.loadingExportProject = true
      
      try {
        const response = await this.$apiClient.callWithAuth('/wallets/export-project-summary', {
          projectId: this.selectedProjectId
        })
        
        if (response.success) {
          // 創建下載鏈接
          const blob = new Blob([response.data.csvContent], { type: 'text/csv;charset=utf-8;' })
          const link = document.createElement('a')
          
          if (link.download !== undefined) {
            const url = URL.createObjectURL(blob)
            link.setAttribute('href', url)
            link.setAttribute('download', response.data.fileName)
            link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            
            this.$message.success(`已成功匯出 ${response.data.participantCount} 位參與者的專案總點數`)
          }
        } else {
          this.$message.error(response.error?.message || '匯出專案總點數失敗')
          console.error('Export API error:', response.error)
        }
      } catch (error) {
        console.error('Error exporting project wallet summary:', error)
        this.$message.error('匯出專案總點數時發生錯誤')
      } finally {
        this.loadingExportProject = false
      }
    },

    // 檢查交易是否已被撤銷
    isTransactionReversed(transaction) {
      // 檢查是否已經是撤銷交易
      if (transaction.transactionType === 'reversal') {
        return true
      }

      // 檢查是否有對應的撤銷記錄
      return this.projectTransactions.some(t =>
        t.transactionType === 'reversal' &&
        t.relatedTransactionId === transaction.transactionId
      )
    },

    // 提示撤銷交易（彈出輸入框要求填寫理由）
    async promptReverseTransaction(transaction) {
      try {
        const { value: reason } = await this.$prompt('請輸入撤銷理由', '撤銷交易確認', {
          confirmButtonText: '確定撤銷',
          cancelButtonText: '取消',
          inputPattern: /.+/,
          inputErrorMessage: '撤銷理由不能為空',
          inputPlaceholder: '請輸入撤銷此交易的理由...'
        })

        if (reason && reason.trim()) {
          await this.reverseTransaction(transaction, reason.trim())
        }
      } catch (error) {
        // 用戶取消或關閉對話框
        console.log('User cancelled transaction reversal')
      }
    },

    // 撤銷交易
    async reverseTransaction(transaction, reason) {
      if (!this.selectedProjectId) {
        this.$message.error('請先選擇專案')
        return
      }

      this.reversingTransactions.add(transaction.transactionId)

      try {
        console.log('Reversing transaction:', transaction.transactionId)
        const response = await this.$apiClient.callWithAuth('/wallets/reverse-transaction', {
          projectId: this.selectedProjectId,
          transactionId: transaction.transactionId,
          reason: reason
        })

        if (response.success) {
          this.$message.success('交易已成功撤銷')
          // 重新載入交易記錄
          await this.loadProjectTransactions()
        } else {
          this.$message.error(response.error?.message || '撤銷交易失敗')
          console.error('Reverse transaction error:', response.error)
        }
      } catch (error) {
        console.error('Error reversing transaction:', error)
        this.$message.error('撤銷交易時發生錯誤')
      } finally {
        this.reversingTransactions.delete(transaction.transactionId)
      }
    }

  },
  
  async mounted() {
    await this.loadUserProjects()
  }
}
</script>

<style scoped>
.wallet-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.top-bar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.dropdown-container {
  display: flex;
  gap: 15px;
  align-items: center;
  flex: 1;
  max-width: 600px;
  margin-right: 20px;
}

.project-select,
.user-select {
  min-width: 200px;
}

.project-select .el-input__wrapper,
.user-select .el-input__wrapper {
  border: 2px solid #e1e8ed;
  border-radius: 6px;
}

.project-select .el-input__wrapper:hover,
.user-select .el-input__wrapper:hover {
  border-color: #409eff;
}

.project-select .el-input__wrapper.is-focus,
.user-select .el-input__wrapper.is-focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.content-wrapper {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.section-title {
  font-size: 24px;
  color: #2c3e50;
  margin-bottom: 20px;
}

.projects-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.transactions-section {
  padding: 20px;
}

.no-project-selected {
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;
}

.no-project-selected i {
  font-size: 48px;
  margin-bottom: 20px;
  color: #bdc3c7;
}

.no-project-selected h3 {
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.no-project-selected p {
  margin: 0;
}

/* Wallet filters */
.wallet-filters {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 30px;
}

.filters-left {
  flex: 1;
}

.filters-right {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 15px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-item label {
  font-weight: 500;
  color: #2c3e50;
  white-space: nowrap;
}

.display-slider {
  width: 200px;
}

.limit-text {
  font-size: 14px;
  color: #7f8c8d;
  min-width: 60px;
}

.filter-input {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  width: 200px;
}

.filter-input:focus {
  outline: none;
  border-color: #409eff;
}

/* Transactions container */
.transactions-container {
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

/* Transactions table */
.transactions-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.transactions-table th,
.transactions-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e1e8ed;
}

.transactions-table th {
  background: #000;
  font-weight: 600;
  color: white;
}

.transaction-row {
  cursor: pointer;
  transition: background-color 0.2s;
}

.transaction-row:hover {
  background: #f8f9fa;
}

.transaction-row.expanded {
  background: #e8f4fd;
}

.points.positive {
  color: #67c23a;
  font-weight: bold;
}

.points.negative {
  color: #f56c6c;
  font-weight: bold;
}

.transaction-type {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #e9ecef;
  color: #495057;
}

.source-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  white-space: nowrap;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  margin-right: 5px;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.transaction-details {
  background: #f8f9fa;
}

.transaction-details td {
  padding: 0;
}

.details-container {
  padding: 20px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section h4 {
  margin: 0 0 10px 0;
  color: #2c3e50;
  font-size: 16px;
}

.detail-content {
  background: white;
  border-radius: 4px;
  padding: 15px;
  border-left: 4px solid #409eff;
}

.submission-content,
.comment-content {
  line-height: 1.6;
  margin-bottom: 10px;
}

.detail-meta {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #666;
}

.meta-time,
.meta-author {
  display: flex;
  align-items: center;
  gap: 5px;
}

.detail-loading {
  color: #666;
  font-style: italic;
}

.detail-error {
  color: #f56c6c;
  font-style: italic;
  background: #fef0f0;
  padding: 10px;
  border-radius: 4px;
  border-left: 4px solid #f56c6c;
}

.no-transactions {
  text-align: center;
  padding: 40px 20px;
  color: #7f8c8d;
}

.no-transactions i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #bdc3c7;
}

.no-transactions p {
  margin: 0;
  font-size: 16px;
}





.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-group label {
  font-weight: 500;
  color: #2c3e50;
  font-size: 14px;
  min-width: auto;
  white-space: nowrap;
}

.custom-slider {
  position: relative;
  width: 200px;
  height: 20px;
  margin: 0 15px;
}

.slider-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}

.slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 4px;
  background: #e1e8ed;
  border-radius: 2px;
  transform: translateY(-50%);
}

.slider-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #2c3e50;
  border-radius: 2px;
  transition: width 0.2s ease;
}

.slider-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: #2c3e50;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  transition: left 0.2s ease;
}

.slider-thumb:hover {
  transform: translate(-50%, -50%) scale(1.2);
}

.slider-tooltip {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: #2c3e50;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.slider-thumb:hover .slider-tooltip,
.custom-slider:hover .slider-tooltip {
  opacity: 1;
}

.limit-text {
  font-size: 14px;
  color: #7f8c8d;
  min-width: 60px;
}

.no-transactions {
  text-align: center;
  padding: 40px 20px;
  color: #7f8c8d;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  margin-top: 20px;
}

.no-transactions p {
  margin: 0;
  font-size: 16px;
}

.simple-table {
  margin-top: 15px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  overflow: hidden;
}

.transaction-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.transaction-table th,
.transaction-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e1e8ed;
}

.transaction-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

.transaction-table tbody tr:hover {
  background: #f8f9fa;
}

.transaction-table .positive-points {
  color: #67c23a;
  font-weight: bold;
}

.transaction-table .negative-points {
  color: #f56c6c;
  font-weight: bold;
}

.transactions-table {
  background: white;
  border-radius: 8px;
  overflow: visible;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.transactions-table :deep(.el-table) {
  background: white;
}

.transactions-table :deep(.el-table__body-wrapper) {
  border: 1px solid #ebeef5;
}

.table-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  background: #f8f9fa;
}

.table-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
}

.positive-points {
  color: #67c23a;
  font-weight: bold;
}

.negative-points {
  color: #f56c6c;
  font-weight: bold;
}

.description-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.description-text {
  line-height: 1.4;
}

.timestamp {
  font-family: monospace;
  font-size: 13px;
}

.transaction-detail .full-description {
  line-height: 1.6;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
  border-left: 4px solid #409eff;
}

@media (max-width: 768px) {
  .projects-grid {
    grid-template-columns: 1fr;
  }
  
  .project-wallet-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
  
  .wallet-action {
    margin-left: 0;
    align-self: stretch;
  }
  
  .controls-section {
    flex-direction: column;
    gap: 15px;
  }
  
  .control-group {
    flex-direction: column;
    gap: 10px;
  }
  
  .custom-slider {
    width: 100%;
  }
}

/* 專案標題區域 */
.project-header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: white;
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.project-title-container {
  flex: 1;
}

.project-title {
  font-size: 20px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0 0 10px 0;
  text-align: left;
}

.project-description {
  color: #7f8c8d;
  font-size: 14px;
  margin: 0;
  line-height: 1.4;
}

.total-points-display {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 8px;
  padding: 15px 20px;
  min-width: 120px;
  justify-content: center;
}

.points-label {
  font-size: 16px;
  color: #856404;
  font-weight: 500;
}

.points-value {
  font-size: 32px;
  font-weight: bold;
  color: #856404;
}

.points-unit {
  font-size: 16px;
  color: #856404;
  font-weight: 500;
}


/* 主要內容卡片 */
.main-content-card {
  background: white;
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}

/* 卡片標題區域 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  border-bottom: 1px solid #e1e8ed;
}

.left-section {
  flex: 1;
}

.right-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 15px;
}

/* 專案標題 */
.project-title {
  font-size: 20px;
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
}

/* 專案描述 */
.project-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
  line-height: 1.4;
}

/* 階段進度按鈕 */
.stage-progress-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.stage-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.stage-btn.stage-completed {
  background: #6c757d;
  border-color: #6c757d;
  color: white;
  font-weight: bold;
}

.stage-btn.stage-active {
  background: #28a745;
  border-color: #28a745;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.stage-btn.stage-voting {
  background: #dc3545;
  border-color: #dc3545;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

.stage-btn.stage-pending {
  background: #ffc107;
  border-color: #ffc107;
  color: white;
  font-weight: bold;
}

.stage-arrow {
  color: #6c757d;
  font-size: 12px;
}

/* 總點數方塊 */
.total-points-box {
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 6px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.points-label {
  font-size: 14px;
  color: #856404;
  font-weight: 500;
}

.points-value {
  font-size: 24px;
  font-weight: bold;
  color: #856404;
}

.points-unit {
  font-size: 14px;
  color: #856404;
  font-weight: 500;
}

/* 動作按鈕 */
.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.ranking-btn {
  background: #28a745;
  color: white;
}

.ranking-btn:hover {
  background: #218838;
}

.export-btn {
  background: #28a745;
  color: white;
}

.export-btn:hover {
  background: #218838;
}

.export-project-btn {
  background: #dc3545;
  color: white;
}

.export-project-btn:hover {
  background: #c82333;
}

.export-project-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.8;
}

.export-project-btn:disabled:hover {
  background: #6c757d;
}

/* 響應式調整 */
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .wallet-filters {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }

  .filters-left,
  .filters-right {
    width: 100%;
  }

  .filters-right {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .total-points-box {
    justify-content: center;
  }

  .action-buttons {
    width: 100%;
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }

  .stage-progress-buttons {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .stage-btn {
    width: 100%;
  }

  .stage-arrow {
    transform: rotate(90deg);
  }
}

/* 專案錢包統計抽屜樣式 */
.project-wallet-drawer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.drawer-header {
  background: #2c3e50;
  color: white;
  padding: 20px 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: -20px -20px 0 -20px;
}

.drawer-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.3s;
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.loading-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #2c3e50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.project-stats-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.score-range-config {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.score-range-config h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 16px;
}

.range-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

.range-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-input-group label {
  font-weight: 500;
  color: #555;
  min-width: 60px;
}

.transformation-visualization {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.transformation-visualization h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 16px;
}

.transformation-chart {
  width: 100%;
  height: 400px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
}

.user-query-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-query-section h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 16px;
}

.query-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.query-result {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 15px;
  border-left: 4px solid #ff0000;
}

.user-score-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-email {
  font-weight: 600;
  color: #2c3e50;
}

.original-score {
  color: #666;
}

.transformed-score {
  color: #ff0000;
  font-weight: 600;
}

.percentile {
  color: #27ae60;
  font-weight: 600;
}

.error-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #f56c6c;
}

.error-message {
  font-size: 16px;
  margin-bottom: 20px;
  text-align: center;
}

.retry-btn {
  background: #f56c6c;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.retry-btn:hover {
  background: #f45454;
}

/* 響應式調整 */
@media (max-width: 768px) {
  .drawer-header {
    padding: 15px 20px;
  }
  
  .drawer-title {
    font-size: 18px;
  }
  
  .range-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .query-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .user-score-info {
    gap: 5px;
  }
}

/* 天梯圖樣式 */
.wallet-ladder-content {
  height: 100%;
  padding: 20px;
}

.ladder-chart-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ladder-info-bar {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
  border-left: 4px solid #007bff;
}

.access-info {
  display: flex;
  align-items: center;
  justify-content: center;
}

.full-access-badge {
  color: #28a745;
  font-weight: 600;
  font-size: 14px;
}

.full-access-badge i {
  margin-right: 8px;
}

.limited-access-badge {
  color: #ffc107;
  font-weight: 600;
  font-size: 14px;
}

.limited-access-badge i {
  margin-right: 8px;
}

.ladder-chart {
  flex: 1;
  min-height: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 16px;
}

/* D3圖表樣式 */
.ladder-chart :deep(.axis-label) {
  font-size: 14px;
  fill: #666;
}

.ladder-chart :deep(.tick text) {
  font-size: 12px;
}

.ladder-chart :deep(.ladder-line) {
  stroke: #2196F3;
  stroke-width: 3;
  fill: none;
}

.ladder-chart :deep(.connector-line) {
  stroke: #90CAF9;
  stroke-width: 2;
}

.ladder-chart :deep(.person-circle) {
  fill: #FF9800;
  stroke: white;
  stroke-width: 2;
}

.ladder-chart :deep(.person-label) {
  font-size: 13px;
  fill: #333;
}

.ladder-chart :deep(.wealth-label) {
  font-size: 11px;
  fill: #666;
}

.ladder-chart :deep(.extreme-marker) {
  fill: #F44336;
  stroke: white;
  stroke-width: 2;
}

.ladder-chart :deep(.extreme-label) {
  font-size: 12px;
  fill: #F44336;
  font-weight: bold;
}
</style>