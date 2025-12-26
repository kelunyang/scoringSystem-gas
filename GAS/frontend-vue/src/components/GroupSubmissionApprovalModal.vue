<template>
  <div class="group-submission-approval-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop v-loading="loading" element-loading-text="載入投票資料中...">
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">本組報告投票確認</h2>
        <button class="close-btn" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Breadcrumb導航 -->
      <div class="breadcrumb-section">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>{{ projectTitle || '專案' }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ stageTitle || `階段${stageId}` }}</el-breadcrumb-item>
          <el-breadcrumb-item>本組報告投票</el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- 共識警告 -->
      <el-alert
        title="共識提醒"
        type="warning"
        description="如果在截止時間前貴組沒有達到集體共識，系統將沒收你們這階段的獎金"
        show-icon
        :closable="false"
        class="consensus-warning"
      />

      <!-- 版本選擇器 -->
      <div class="version-selector-section">
        <!-- 標題區域 -->
        <div class="section-header">
          <h3>階段成果版本</h3>
        </div>
        
        <!-- 選擇器區域 -->
        <div class="selector-container">
          <el-select 
            v-model="selectedVersion" 
            class="version-selector"
            placeholder="選擇版本"
            @change="handleVersionChange"
          >
            <el-option
              v-for="version in allVersions"
              :key="version.submissionId"
              :label="`${formatVersionTime(version.submittedTime)} - ${getSubmitterName(version.submitter)}`"
              :value="version.submissionId"
            >
              <span :style="{ color: version.status === 'withdrawn' ? '#999' : '#333' }">
                {{ formatVersionTime(version.submittedTime) }} - {{ getSubmitterName(version.submitter) }}
                <span v-if="version.status === 'withdrawn'" class="version-tag">(已撤回)</span>
                <span v-if="version.submissionId === currentVersionId" class="version-tag current">(當前版本)</span>
              </span>
            </el-option>
          </el-select>
        </div>
      </div>

      <!-- 階段成果提交內容 -->
      <div class="submission-content-section">
        <div class="section-header">
          <h3>階段成果提交內容</h3>
          <div class="submission-meta">
            <span>提交者: {{ getSubmitterName(currentVersionData?.submitter) }}</span>
            <span>提交時間: {{ formatDateTime(currentVersionData?.submittedTime) }}</span>
          </div>
        </div>
        <div class="submission-content" v-html="renderedSubmissionContent"></div>
      </div>

      <!-- 本階段點數分配預覽 -->
      <div class="participation-distribution-section">
        <div class="section-header">
          <h3>本階段點數分配</h3>
          <div class="section-subtitle">基於提交的參與度比例計算</div>
          <div class="rank-simulation">
            <label>模擬排名:</label>
            <el-select v-model="simulatedRank" class="rank-selector" size="small">
              <el-option 
                v-for="rank in totalActiveGroups" 
                :key="rank" 
                :label="`第${rank}名`"
                :value="rank"
              />
            </el-select>
          </div>
        </div>
        
        <!-- 組內個人分配圖 -->
        <div class="chart-section">
          <h4 class="chart-title">
            <i class="fas fa-users"></i> 我們組內個人點數分配
          </h4>
          <div class="contribution-chart">
            <div id="participationChart" ref="participationChartContainer" class="chart-container"></div>
          </div>
        </div>
        
        <!-- 各組總點數競爭比較 -->
        <div class="chart-section">
          <h4 class="chart-title">
            <i class="fas fa-trophy"></i> 各組總點數競爭比較
          </h4>
          <div class="contribution-chart">
            <div id="allGroupsChart" ref="allGroupsChartContainer" class="chart-container"></div>
          </div>
        </div>
      </div>

      <!-- 投票狀態卡片 -->
      <div class="voting-status-section">
        <div class="status-card">
          <div class="status-header">
            <h3>投票狀態</h3>
            <div class="status-badge" :class="getStatusClass()">
              {{ getStatusText() }}
            </div>
          </div>
          
          <div class="voting-stats">
            <div class="stat-item">
              <span class="stat-label">贊成票</span>
              <span class="stat-value agree">{{ votingData.agreeVotes || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">總投票</span>
              <span class="stat-value">{{ votingData.totalVotes || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">總成員</span>
              <span class="stat-value">{{ votingData.totalMembers || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">共識需求</span>
              <span class="stat-value consensus">{{ votingData.totalMembers || 0 }} / {{ votingData.totalMembers || 0 }}</span>
            </div>
          </div>

          <!-- 投票進度條 -->
          <div class="progress-section">
            <div class="progress-label">
              共識進度 {{ votingData.agreeVotes || 0 }} / {{ votingData.totalMembers || 0 }} (全員同意制)
            </div>
            <el-progress 
              :percentage="getConsensusPercentage()" 
              :color="getProgressColor()"
              :show-text="false"
            />
          </div>
        </div>
      </div>

      <!-- 投票趨勢圖表 -->
      <div class="chart-section">
        <div class="chart-header">
          <h3>投票趨勢</h3>
          <div class="chart-legend">
            <span class="legend-item agree">
              <span class="legend-dot"></span>
              累積同意票增長
            </span>
          </div>
        </div>
        <div id="votingTrendChart" ref="chartContainer" class="chart-container"></div>
      </div>

      <!-- 投票詳情列表 -->
      <div class="votes-list-section">
        <h3>投票詳情</h3>
        <div class="votes-list">
          <div 
            v-for="vote in sortedVotes" 
            :key="vote.voteId"
            class="vote-item"
            :class="{ agree: vote.agree, disagree: !vote.agree }"
          >
            <div class="vote-info">
              <div class="voter-name">{{ getUserDisplayName(vote.voterEmail) }}</div>
              <div class="vote-time">{{ formatDateTime(vote.createdTime) }}</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge" :class="{ agree: vote.agree, disagree: !vote.agree }">
                {{ vote.agree ? '贊成' : '反對' }}
              </span>
            </div>
          </div>
          
          <!-- 未投票成員 -->
          <div 
            v-for="member in pendingMembers" 
            :key="member.userEmail"
            class="vote-item pending"
          >
            <div class="vote-info">
              <div class="voter-name">{{ getUserDisplayName(member.userEmail) }}</div>
              <div class="vote-time">尚未投票</div>
            </div>
            <div class="vote-result">
              <span class="vote-badge pending">待投票</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕區域 -->
      <div class="modal-actions">
        <!-- 舊版本時顯示恢復按鈕 -->
        <template v-if="isViewingOldVersion">
          <button class="btn btn-warning" @click="showRestoreConfirmation">
            <i class="fas fa-history"></i>
            恢復回舊版本
          </button>
        </template>
        
        <!-- 當前版本時顯示正常投票按鈕 -->
        <template v-else>
          <template v-if="!votingData.hasUserVoted && !votingData.isApproved">
            <button class="btn btn-success" @click="submitVote(true)" :disabled="submitting">
              <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
              {{ submitting ? '投票中...' : '同意本組報告' }}
            </button>
            <button class="btn btn-danger" @click="showDeleteConfirmation" :disabled="submitting">
              <i class="fas fa-trash"></i>
              刪除報告重發
            </button>
          </template>
          
          <template v-else-if="votingData.hasUserVoted">
            <div class="user-vote-status">
              <i class="fas fa-check-circle"></i>
              您已投票：{{ getUserVoteStatus() }}
            </div>
            <button class="btn btn-danger" disabled title="已投票，無法刪除報告">
              <i class="fas fa-trash"></i>
              刪除報告重發
            </button>
          </template>
          
          <template v-else-if="votingData.isApproved">
            <div class="approved-status">
              <i class="fas fa-check-circle"></i>
              本組報告已獲得通過
            </div>
          </template>
        </template>
        
        <button class="btn btn-secondary" @click="handleClose">
          關閉
        </button>
      </div>
    </div>
  </div>

  <!-- 刪除確認對話框 -->
  <el-dialog
    v-model="showDeleteDialog"
    title="確認刪除報告"
    width="500px"
    center
  >
    <div class="delete-confirmation">
      <div class="warning-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <p>確定要刪除本組在「{{ stageTitle }}」階段的報告嗎？</p>
      <p class="warning-text">此操作無法撤銷，刪除後需要重新提交報告。</p>
      <el-input
        v-model="deleteConfirmText"
        placeholder="請輸入 DELETE 確認刪除"
        class="confirm-input"
      />
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="showDeleteDialog = false">取消</el-button>
        <el-button 
          type="danger" 
          @click="confirmDelete"
          :disabled="deleteConfirmText !== 'DELETE' || deleting"
          :loading="deleting"
        >
          確認刪除
        </el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 恢復舊版本確認對話框 -->
  <el-dialog
    v-model="showRestoreDialog"
    title="確認恢復舊版本"
    width="500px"
    center
  >
    <div class="restore-confirmation">
      <div class="warning-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <p>確定要恢復到此舊版本嗎？</p>
      <p class="warning-text">恢復舊版本無法恢復舊版本的投票結果，請把握時間盡速完成投票，否則會沒收全組本階段點數。</p>
      <el-input
        v-model="restoreConfirmText"
        placeholder="請輸入 RESTORE 確認恢復"
        class="confirm-input"
      />
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="showRestoreDialog = false">取消</el-button>
        <el-button 
          type="warning" 
          @click="confirmRestore"
          :disabled="restoreConfirmText !== 'RESTORE' || restoring"
          :loading="restoring"
        >
          確認恢復
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
import * as d3 from 'd3'

export default {
  name: 'GroupSubmissionApprovalModal',
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
    submissionId: {
      type: String,
      required: true
    },
    projectTitle: {
      type: String,
      default: ''
    },
    stageTitle: {
      type: String,
      default: ''
    },
    groupMembers: {
      type: Array,
      default: () => []
    },
    submissionData: {
      type: Object,
      default: () => ({})
    },
    stageReward: {
      type: Number,
      default: 1000
    }
  },
  data() {
    return {
      votingData: {
        votes: [],
        agreeVotes: 0,
        totalVotes: 0,
        totalMembers: 0,
        isApproved: false,
        hasUserVoted: false
      },
      submitting: false,
      loading: false,
      showDeleteDialog: false,
      deleteConfirmText: '',
      deleting: false,
      simulatedRank: 1, // 預設模擬第1名
      totalActiveGroups: 4, // 預設4組，會在mounted時更新
      
      // 版本相關
      allVersions: [], // 所有版本列表
      selectedVersion: '', // 當前選中的版本ID
      currentVersionId: '', // 當前活躍版本ID
      currentVersionData: null, // 當前版本詳細資料
      currentVersionVotingData: null, // 當前選中版本的投票數據
      allVersionsVotingHistory: null, // 所有版本的投票歷史（用於投票趨勢圖）
      showRestoreDialog: false,
      restoreConfirmText: '',
      restoring: false
    }
  },
  computed: {
    sortedVotes() {
      return [...this.votingData.votes].sort((a, b) => a.createdTime - b.createdTime)
    },
    
    pendingMembers() {
      const votedEmails = new Set(this.votingData.votes.map(v => v.voterEmail))
      return this.groupMembers.filter(member => !votedEmails.has(member.userEmail || member.email))
    },
    
    isViewingOldVersion() {
      return this.selectedVersion && this.selectedVersion !== this.currentVersionId
    },
    
    renderedSubmissionContent() {
      if (!this.currentVersionData?.content) return '<p class="no-content">暫無內容</p>'
      return this.parseMarkdown(this.currentVersionData.content)
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        console.log('🔄 GroupSubmissionApprovalModal visible changed to true, loading data...')
        // 清除之前的數據，強制重新載入
        this.resetData()
        
        // 先載入版本資料，確保 currentVersionData 被設定
        this.loadAllVersions().then(() => {
          // 載入其他數據並渲染圖表
          this.loadVotingData()
          this.loadVotingHistory()
          this.$nextTick(() => {
            this.renderChart()
            this.renderParticipationChart()
            this.renderAllGroupsChart()
          })
        })
      } else {
        this.resetData()
      }
    },
    
    // 監聽submissionId變化，確保數據更新
    submissionId(newVal, oldVal) {
      if (newVal && newVal !== oldVal && this.visible) {
        this.loadAllVersions()
        this.loadVotingData()
      }
    },
    
    // 監聽模擬排名變化
    simulatedRank() {
      this.$nextTick(() => {
        this.renderParticipationChart()
        this.renderAllGroupsChart()
      })
    }
  },
  
  mounted() {
    // 計算活躍組數
    if (this.$parent && this.$parent.allGroups) {
      const activeGroups = this.$parent.allGroups.filter(g => g.status === 'active').length
      this.totalActiveGroups = Math.max(2, activeGroups) // 至少2組
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },
    
    resetData() {
      this.votingData = {
        votes: [],
        agreeVotes: 0,
        totalVotes: 0,
        totalMembers: 0,
        isApproved: false,
        hasUserVoted: false
      }
      this.submitting = false
      this.showDeleteDialog = false
      this.deleteConfirmText = ''
      this.deleting = false
    },
    
    async loadVotingData() {
      try {
        this.loading = true
        const response = await this.$apiClient.getGroupSubmissionApprovalVotes(
          this.projectId,
          this.stageId,
          this.submissionId
        )
        
        if (response.success) {
          this.votingData = response.data
          this.$nextTick(() => {
            this.renderChart()
            this.renderParticipationChart()
          })
        } else {
          this.$message.error('無法載入投票數據：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('載入投票數據失敗:', error)
        this.$message.error('載入投票數據失敗')
      } finally {
        this.loading = false
      }
    },
    
    async loadVotingHistory() {
      try {
        // 載入該組在這個階段的所有版本投票歷史
        const response = await this.$apiClient.getGroupStageVotingHistory(
          this.projectId,
          this.stageId
          // groupId 不傳，讓後端自動判斷
        )
        
        if (response.success) {
          this.allVersionsVotingHistory = response.data
          // 投票趨勢圖會使用這個數據
        } else {
          console.log('無法載入投票歷史：', response.error?.message)
        }
      } catch (error) {
        console.error('載入投票歷史失敗:', error)
      }
    },
    
    async submitVote(agree) {
      try {
        this.submitting = true
        const response = await this.$apiClient.voteApproveGroupSubmission(
          this.projectId,
          this.stageId,
          this.submissionId,
          agree
        )
        
        if (response.success) {
          const { votingSummary } = response.data
          
          if (votingSummary.isApproved) {
            this.$message.success('投票成功！本組報告已獲得通過')
          } else {
            this.$message.success('投票成功！')
          }
          
          // 重新載入投票數據
          await this.loadVotingData()
          
          // 重新載入投票歷史以更新投票趨勢圖表
          await this.loadVotingHistory()
          
          // 通知父組件刷新
          this.$emit('vote-submitted', response.data)
        } else {
          this.$message.error('投票失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('投票失敗:', error)
        this.$message.error('投票失敗')
      } finally {
        this.submitting = false
      }
    },
    
    showDeleteConfirmation() {
      this.showDeleteDialog = true
      this.deleteConfirmText = ''
    },
    
    async confirmDelete() {
      if (this.deleteConfirmText !== 'DELETE') return
      
      try {
        this.deleting = true
        const response = await this.$apiClient.deleteSubmission(this.projectId, this.submissionId)
        
        if (response.success) {
          this.$message.success('報告已刪除，可以重新提交')
          this.showDeleteDialog = false
          this.handleClose()
          this.$emit('submission-deleted')
        } else {
          this.$message.error('刪除報告失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('刪除報告失敗:', error)
        this.$message.error('刪除報告失敗')
      } finally {
        this.deleting = false
      }
    },
    
    getStatusClass() {
      if (this.votingData.isApproved) return 'approved'
      if (this.votingData.totalVotes === this.votingData.totalMembers) {
        // All members voted but not approved means consensus not reached
        return this.votingData.agreeVotes === this.votingData.totalMembers ? 'approved' : 'rejected'
      }
      return 'in-progress'
    },
    
    getStatusText() {
      if (this.votingData.isApproved) return '已通過'
      if (this.votingData.totalVotes === this.votingData.totalMembers) {
        // All members voted - check if consensus reached
        return this.votingData.agreeVotes === this.votingData.totalMembers ? '共識達成' : '共識未達成'
      }
      return '投票中'
    },
    
    getConsensusPercentage() {
      if (this.votingData.totalMembers === 0) return 0
      return Math.min(100, (this.votingData.agreeVotes / this.votingData.totalMembers) * 100)
    },
    
    getProgressColor() {
      const percentage = this.getConsensusPercentage()
      if (percentage >= 100) return '#67c23a'
      if (percentage >= 70) return '#e6a23c'
      return '#f56c6c'
    },
    
    getUserDisplayName(email) {
      // 先從groupMembers中查找
      const member = this.groupMembers.find(m => (m.userEmail || m.email) === email)
      if (member) {
        // 優先顯示displayName（使用者名稱），其次是username
        return member.displayName || member.username || email.split('@')[0]
      }
      
      // 如果groupMembers中找不到，嘗試從父組件的projectData查找
      if (this.$parent && this.$parent.projectData && this.$parent.projectData.users) {
        const user = this.$parent.projectData.users.find(u => u.userEmail === email)
        if (user) {
          // 優先顯示displayName（使用者名稱）
          return user.displayName || user.username || email.split('@')[0]
        }
      }
      
      // 最後fallback到email前綴
      return email.split('@')[0]
    },
    
    getUserVoteStatus() {
      const userVote = this.votingData.votes.find(v => v.voterEmail === this.$parent?.user?.userEmail)
      return userVote ? (userVote.agree ? '贊成' : '反對') : '未投票'
    },
    
    formatDateTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return date.toLocaleString('zh-TW', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    
    formatVersionTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return date.toLocaleDateString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    
    getSubmitterName(email) {
      if (!email) return ''
      return this.getUserDisplayName(email)
    },
    
    async loadAllVersions() {
      try {
        // 使用新的專用API獲取該組的所有版本（包括活躍和撤回的）
        // 不傳遞groupId，讓後端根據用戶session自動判斷用戶所屬組
        console.log('🔍 GroupSubmissionApprovalModal 載入版本:', {
          projectId: this.projectId,
          stageId: this.stageId,
          message: '不傳遞groupId，讓後端根據 session 自動判斷'
        })
        
        const response = await this.$apiClient.getSubmissionVersions(
          this.projectId,
          this.stageId,
          {
            // 不傳遞groupId，讓後端根據用戶session自動築選該用戶所屬組的版本
            includeWithdrawn: true,
            includeActive: true  // 需要所有版本進行投票
          }
        )
        
        if (response.success) {
          // 新API返回的結構：{ versions: [...], metadata: {...} }
          this.allVersions = response.data?.versions || []
          // 找出當前活躍版本（未撤回的版本）
          const activeVersion = this.allVersions.find(v => v.status !== 'withdrawn')
          if (activeVersion) {
            this.currentVersionId = activeVersion.submissionId
            this.selectedVersion = activeVersion.submissionId
            this.currentVersionData = activeVersion
          }
        } else {
          this.$message.error('無法載入版本資料：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('載入版本資料失敗:', error)
        this.$message.error('載入版本資料失敗')
      }
    },
    
    async handleVersionChange(versionId) {
      const version = this.allVersions.find(v => v.submissionId === versionId)
      if (version) {
        this.currentVersionData = version
        
        // 載入選定版本的投票數據
        await this.loadVersionVotingData(versionId)
        
        // 重新渲染點數分配相關圖表（這些會根據currentVersionData變化）
        this.$nextTick(() => {
          this.renderParticipationChart()
          this.renderAllGroupsChart()
        })
      }
    },
    
    async loadVersionVotingData(versionId) {
      try {
        this.loading = true
        const response = await this.$apiClient.getGroupSubmissionApprovalVotes(
          this.projectId,
          this.stageId,
          versionId
        )
        
        if (response.success) {
          // 保存當前版本的投票數據
          this.currentVersionVotingData = response.data
          
          // 更新投票狀態顯示
          this.updateVotingStatus(versionId)
        } else {
          // 沒有投票數據的版本（如撤回版本）- 這是正常情況
          this.handleNoVotingData(versionId)
        }
      } catch (error) {
        console.error('載入版本投票數據:', error)
        // 撤回版本沒有投票數據是正常的，不顯示錯誤
        this.handleNoVotingData(versionId)
      } finally {
        this.loading = false
      }
    },
    
    handleNoVotingData(versionId) {
      this.currentVersionVotingData = {
        votes: [],
        agreeVotes: 0,
        totalVotes: 0,
        totalMembers: this.votingData.totalMembers || 0,
        isApproved: false,
        hasUserVoted: false
      }
      this.updateVotingStatus(versionId)
    },
    
    updateVotingStatus(versionId) {
      // 只有當前活躍版本才顯示真實投票狀態
      if (versionId === this.currentVersionId) {
        this.votingData = this.currentVersionVotingData
      } else {
        // 歷史版本顯示為查看模式
        this.votingData = {
          ...this.currentVersionVotingData,
          hasUserVoted: true  // 防止顯示投票按鈕
        }
      }
    },
    
    showRestoreConfirmation() {
      this.showRestoreDialog = true
      this.restoreConfirmText = ''
    },
    
    async confirmRestore() {
      if (this.restoreConfirmText !== 'RESTORE') return
      
      try {
        this.restoring = true
        const response = await this.$apiClient.restoreSubmissionVersion(
          this.projectId, 
          this.stageId,
          this.selectedVersion
        )
        
        if (response.success) {
          this.$message.success('版本已恢復，可以重新開始投票')
          this.showRestoreDialog = false
          // 重新載入所有版本和投票數據
          await this.loadAllVersions()
          await this.loadVotingData()
          this.$emit('submission-restored')
        } else {
          this.$message.error('恢復版本失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('恢復版本失敗:', error)
        this.$message.error('恢復版本失敗')
      } finally {
        this.restoring = false
      }
    },
    
    parseMarkdown(text) {
      if (!text) return ''
      
      let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        
        // Bold
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/__(.*?)__/gim, '<strong>$1</strong>')
        
        // Italic
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/_(.*?)_/gim, '<em>$1</em>')
        
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
        
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>')
        
        // Line breaks
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>')
      
      return '<p>' + html + '</p>'
    },
    
    renderChart() {
      if (!this.$refs.chartContainer) return
      
      // 清空現有圖表
      const container = this.$refs.chartContainer
      container.innerHTML = ''
      
      // 如果沒有版本資料，顯示無資料狀態
      if (this.allVersions.length === 0) {
        container.innerHTML = '<div class="no-data">載入版本資料中...</div>'
        return
      }
      
      // 構建多版本支持度變化數據
      const versionData = this.buildMultiVersionVotingData()
      if (versionData.chartPoints.length === 0) {
        container.innerHTML = '<div class="no-data">暫無投票資料</div>'
        return
      }
      
      // 設置圖表尺寸
      const margin = { top: 30, right: 40, bottom: 60, left: 50 }
      const width = container.offsetWidth - margin.left - margin.right
      const height = 250 - margin.top - margin.bottom
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      
      const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)
      
      // 準備 bar chart 數據
      const barData = this.prepareBarChartData(versionData.chartPoints)
      
      // 設置比例尺 - 每個 bar 佔用固定位置，不重疊
      const xScale = d3.scaleBand()
        .domain(barData.map((_, i) => i)) // 使用索引作為 domain
        .range([0, width])
        .padding(0.1) // bar 之間的間距
      
      // Y軸範圍就是0到組員總數
      const yScale = d3.scaleLinear()
        .domain([0, this.votingData.totalMembers || 0])
        .range([height, 0])
      
      // 為每一天的投票生成不同顏色
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
      
      // 繪製 bar chart
      g.selectAll('.vote-bar')
        .data(barData)
        .enter().append('rect')
        .attr('class', 'vote-bar')
        .attr('x', (_, i) => xScale(i)) // 使用索引定位，不重疊
        .attr('y', d => yScale(d.cumulativeCount))
        .attr('width', xScale.bandwidth()) // 使用 band scale 的寬度
        .attr('height', d => height - yScale(d.cumulativeCount))
        .attr('fill', d => {
          if (d.isVersionStart) return '#e6a23c' // 新版本歸零用特殊顏色
          return colorScale(d.dateString) // 同一天用相同顏色
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .append('title')
        .text(d => {
          if (d.isVersionStart) {
            return `${d.dateString}: 新版本開始 (${d.cumulativeCount} 票)`
          }
          return `${d.dateString} 第${d.dayVoteIndex}次投票: ${d.cumulativeCount} 票`
        })
      
      // 添加版本分隔線（垂直虛線）
      versionData.versionMarkers.forEach(marker => {
        // 找到版本開始點在 barData 中的索引
        const versionStartIndex = barData.findIndex(d => 
          d.versionId === marker.versionId && d.isVersionStart
        )
        
        if (versionStartIndex >= 0) {
          const x = xScale(versionStartIndex) + xScale.bandwidth() / 2 // 置中於 bar
          
          // 版本分隔線
          g.append('line')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', '#f56c6c')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
          
          // 版本標籤
          g.append('text')
            .attr('x', x)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#f56c6c')
            .text(`V${marker.version}`)
        }
      })
      
      // 添加共識線
      if (this.votingData.totalMembers > 0) {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', yScale(this.votingData.totalMembers))
          .attr('y2', yScale(this.votingData.totalMembers))
          .attr('stroke', '#e6a23c')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')
        
        g.append('text')
          .attr('x', width - 5)
          .attr('y', yScale(this.votingData.totalMembers) - 5)
          .attr('text-anchor', 'end')
          .attr('font-size', '12px')
          .attr('fill', '#e6a23c')
          .text(`共識門檻 (${this.votingData.totalMembers})`)
      }
      
      // 添加X軸 - 顯示日期
      // 篩選出每天的第一個投票作為刻度
      const uniqueDates = []
      const seenDates = new Set()
      barData.forEach((d, i) => {
        if (!seenDates.has(d.dateString)) {
          seenDates.add(d.dateString)
          uniqueDates.push({ index: i, dateString: d.dateString })
        }
      })
      
      const xAxis = g.append('g')
        .attr('transform', `translate(0,${height})`)
      
      // 手動添加刻度
      uniqueDates.forEach(({ index, dateString }) => {
        const x = xScale(index) + xScale.bandwidth() / 2
        
        // 刻度線
        xAxis.append('line')
          .attr('x1', x)
          .attr('x2', x)
          .attr('y1', 0)
          .attr('y2', 6)
          .attr('stroke', '#000')
        
        // 刻度標籤
        xAxis.append('text')
          .attr('x', x)
          .attr('y', 20)
          .attr('text-anchor', 'middle')
          .style('font-size', '11px')
          .text(dateString)
      })
      
      // 添加Y軸 - 最大值就是組員總數
      const totalMembers = this.votingData.totalMembers || 0
      // 根據組員總數決定刻度間隔
      let tickInterval = 1
      if (totalMembers > 10) tickInterval = 2
      if (totalMembers > 20) tickInterval = 5
      
      const yAxis = d3.axisLeft(yScale)
        .tickValues(d3.range(0, totalMembers + 1, tickInterval)) // 從0到組員總數的整數刻度
        .tickFormat(d3.format('d'))
      
      g.append('g')
        .call(yAxis)
        .selectAll('text')
        .style('font-size', '11px')
      
      // 添加圖表標題
      svg.append('text')
        .attr('x', (width + margin.left + margin.right) / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text('各版本支持度變化趨勢')
    },
    
    buildMultiVersionVotingData() {
      // 構建多版本投票趨勢數據
      const chartPoints = []
      const versionMarkers = []
      
      // 使用所有版本的投票歷史數據
      if (!this.allVersionsVotingHistory || !this.allVersionsVotingHistory.versions) {
        return { chartPoints: [], versionMarkers: [] }
      }
      
      const { versions } = this.allVersionsVotingHistory
      
      // 對每個版本構建其投票歷程
      versions.forEach((versionData, versionIndex) => {
        const versionStartTime = new Date(versionData.submittedTime)
        
        // 添加版本標記
        versionMarkers.push({
          date: versionStartTime,
          version: versionIndex + 1,
          versionId: versionData.submissionId,
          submitter: versionData.submitter
        })
        
        // 該版本的同意投票記錄
        const agreeVotes = versionData.votes.filter(vote => vote.agree)
          .sort((a, b) => a.createdTime - b.createdTime)
        
        // 添加版本開始點（支持度重置為0）
        // 確保新版本的歸零點在版本提交時間的幾秒後，讓視覺上更明顯
        chartPoints.push({
          date: new Date(versionStartTime.getTime() + 30000), // 版本提交後30秒歸零
          cumulativeCount: 0,
          versionId: versionData.submissionId,
          isVersionStart: true
        })
        
        // 處理該版本的投票增長
        if (agreeVotes.length > 0) {
          let cumulativeCount = 0
          
          agreeVotes.forEach(vote => {
            cumulativeCount++
            chartPoints.push({
              date: new Date(vote.createdTime),
              cumulativeCount: cumulativeCount,
              versionId: versionData.submissionId,
              voteId: vote.voteId
            })
          })
        }
        
        // 如果這不是最後一個版本，添加版本結束點
        if (versionIndex < versions.length - 1) {
          const nextVersionTime = new Date(versions[versionIndex + 1].submittedTime)
          
          // 找出這個版本的最後得票數
          const versionPoints = chartPoints.filter(p => p.versionId === versionData.submissionId)
          const lastCount = versionPoints.length > 0 
            ? versionPoints[versionPoints.length - 1].cumulativeCount 
            : 0
          
          // 在下一個版本開始前1分鐘，維持當前支持度
          chartPoints.push({
            date: new Date(nextVersionTime.getTime() - 60000), // 提前1分鐘
            cumulativeCount: lastCount,
            versionId: versionData.submissionId,
            isVersionEnd: true
          })
        }
      })
      
      // 確保至少有起始點和當前點
      if (chartPoints.length === 0 && versions.length > 0) {
        const firstVersion = versions[0]
        chartPoints.push({
          date: new Date(firstVersion.submittedTime),
          cumulativeCount: 0,
          versionId: firstVersion.submissionId,
          isVersionStart: true
        })
      }
      
      return { chartPoints, versionMarkers }
    },
    
    prepareBarChartData(chartPoints) {
      // 為每個投票點添加日期字串和同一天的投票序號
      const dailyVoteCounts = {} // 記錄每一天的投票次數
      
      return chartPoints.map(point => {
        const dateString = point.date.toLocaleDateString('zh-TW', {
          month: '2-digit',
          day: '2-digit'
        })
        
        // 計算這是當天第幾次投票
        if (!dailyVoteCounts[dateString]) {
          dailyVoteCounts[dateString] = 0
        }
        dailyVoteCounts[dateString]++
        
        return {
          ...point,
          dateString: dateString,
          dayVoteIndex: dailyVoteCounts[dateString]
        }
      })
    },

    renderParticipationChart() {
      if (!this.$refs.participationChartContainer) return
      
      // 清空現有圖表
      const container = this.$refs.participationChartContainer
      container.innerHTML = ''
      
      // 檢查是否有提交數據和參與度分配
      // 優先使用 votingData 中的 participationProposal（從 API 返回）
      const participationSource = this.votingData?.participationProposal || 
                                  this.submissionData?.participationProposal || 
                                  this.submissionData?.participationPercentages
                                  
      if (!participationSource) {
        container.innerHTML = '<div class="no-data">暫無參與度分配數據</div>'
        return
      }
      
      // 解析參與度數據
      let participationData = []
      try {
        const participationProposal = typeof participationSource === 'string' 
          ? JSON.parse(participationSource)
          : participationSource
        
        // 動態計算排名權重：第1名=N，第2名=N-1，...最後一名=1（N=總組數）
        const rankWeights = {}
        for (let i = 1; i <= this.totalActiveGroups; i++) {
          rankWeights[i] = this.totalActiveGroups - i + 1
        }
        
        participationData = Object.entries(participationProposal).map(([email, percentage]) => {
          const member = this.groupMembers.find(m => m.userEmail === email || m.email === email)
          const participationRatio = percentage * 100 // Convert from decimal to percentage
          const baseWeightUnits = participationRatio / 5 // 假設最小單位為5%
          const rankMultiplier = rankWeights[this.simulatedRank] // 使用選擇的排名
          const finalWeight = baseWeightUnits * rankMultiplier
          
          // 計算總權重來分配點數
          const allMembers = Object.values(participationProposal)
          const totalWeight = allMembers.reduce((sum, p) => {
            return sum + ((p * 100) / 5 * rankMultiplier)
          }, 0)
          const pointsPerWeight = this.stageReward / totalWeight
          
          return {
            email,
            displayName: member?.displayName || member?.username || email.split('@')[0],
            participationRatio: participationRatio,
            baseWeightUnits: baseWeightUnits,
            rankMultiplier: rankMultiplier,
            finalWeight: finalWeight,
            points: finalWeight * pointsPerWeight
          }
        })
      } catch (error) {
        console.error('解析參與度數據失敗:', error)
        container.innerHTML = '<div class="no-data">參與度數據格式錯誤</div>'
        return
      }
      
      if (participationData.length === 0) {
        container.innerHTML = '<div class="no-data">暫無參與度分配數據</div>'
        return
      }
      
      // 創建tooltip - 先移除舊的tooltip
      d3.select('.chart-tooltip').remove()
      const tooltip = d3.select('body').append('div')
        .attr('class', 'chart-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '8px 12px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '10000')
      
      // 設置圖表尺寸
      const width = container.offsetWidth || 600
      const height = 150
      const margin = { top: 20, right: 40, bottom: 60, left: 40 }
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
      
      // 創建權重方塊
      const blocks = []
      let blockPos = 0
      
      participationData.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        for (let i = 0; i < numBlocks; i++) {
          blocks.push({ 
            person: person, 
            position: blockPos++, 
            blockIndex: i, 
            totalBlocks: numBlocks 
          })
        }
      })
      
      if (blocks.length === 0) {
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', '#666')
          .text('暫無數據')
        return
      }
      
      // RWD占滿100%寬度 - 每個block動態調整大小
      const availableWidth = width - margin.left - margin.right
      const blockSize = availableWidth / blocks.length
      const startX = margin.left
      const blockHeight = 40
      const startY = (height - blockHeight) / 2
      
      // 使用統一的組色
      const groupColor = '#e6a23c' // 橘色作為我們組的顏色
      
      // 繪製權重方塊
      svg.selectAll('.weight-block')
        .data(blocks)
        .enter()
        .append('rect')
        .attr('class', 'weight-block')
        .attr('x', d => startX + d.position * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', groupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('rx', 2)
        .on('mouseover', function(event, d) {
          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.person.displayName}</strong><br/>
                   參與比例: ${d.person.participationRatio.toFixed(0)}%<br/>
                   基礎權重: ${d.person.baseWeightUnits.toFixed(1)}<br/>
                   排名倍率: ${d.person.rankMultiplier}x<br/>
                   最終權重: ${d.person.finalWeight.toFixed(1)}<br/>
                   預期得分: ${d.person.points.toFixed(2)}點`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', () => tooltip.style('opacity', 0))
      
      // 繪製每個人的黑色虛線邊框
      let personPos = 0
      participationData.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        if (numBlocks > 0) {
          // 個人邊框（黑色虛線）
          svg.append('rect')
            .attr('x', startX + personPos * blockSize - 1)
            .attr('y', startY - 2)
            .attr('width', numBlocks * blockSize + 1)
            .attr('height', blockHeight + 4)
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,2')
            .attr('rx', 2)
          
          // 個人標籤（上方）
          svg.append('text')
            .attr('x', startX + personPos * blockSize + (numBlocks * blockSize) / 2)
            .attr('y', startY - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text(`${person.displayName}(${numBlocks})`)
          
          // 個人點數（下方）
          svg.append('text')
            .attr('x', startX + personPos * blockSize + (numBlocks * blockSize) / 2)
            .attr('y', startY + blockHeight + 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#666')
            .text(`${Math.round(person.points)}點`)
          
          personPos += numBlocks
        }
      })
      
      // 添加總計信息
      const totalPoints = participationData.reduce((sum, p) => sum + p.points, 0)
      const totalWeight = participationData.reduce((sum, p) => sum + p.finalWeight, 0)
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text(`我們組第${this.simulatedRank}名預期: ${Math.round(totalPoints)}點 | 總權重: ${Math.round(totalWeight)}`)
    },
    
    renderAllGroupsChart() {
      if (!this.$refs.allGroupsChartContainer) return
      
      // 清空現有圖表
      const container = this.$refs.allGroupsChartContainer
      container.innerHTML = ''
      
      // 檢查是否有提交數據和參與度分配
      const participationSource = this.votingData?.participationProposal || 
                                  this.submissionData?.participationProposal || 
                                  this.submissionData?.participationPercentages
                                  
      if (!participationSource) return
      
      // 解析參與度數據
      let ourGroupMembers = []
      try {
        const participationProposal = typeof participationSource === 'string' 
          ? JSON.parse(participationSource)
          : participationSource
        
        // 動態計算排名權重
        const rankWeights = {}
        for (let i = 1; i <= this.totalActiveGroups; i++) {
          rankWeights[i] = this.totalActiveGroups - i + 1
        }
        
        ourGroupMembers = Object.entries(participationProposal).map(([email, percentage]) => {
          const member = this.groupMembers.find(m => m.userEmail === email || m.email === email)
          return {
            email,
            displayName: member?.displayName || member?.username || email.split('@')[0],
            contribution: percentage * 100
          }
        })
      } catch (error) {
        console.error('解析參與度數據失敗:', error)
        return
      }
      
      // 計算所有組的數據
      const allGroupsData = this.calculateAllGroupsScoring(ourGroupMembers)
      
      // 設置圖表尺寸
      const width = container.offsetWidth || 800
      const height = 300
      const margin = { top: 50, right: 40, bottom: 60, left: 40 }
      
      // 創建 tooltip
      d3.select('.chart-tooltip').remove()
      const tooltip = d3.select('body').append('div')
        .attr('class', 'chart-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '8px 12px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '10000')
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
      
      // 創建所有權重塊數據
      const allPeople = []
      allGroupsData.forEach(group => {
        group.members.forEach(member => {
          allPeople.push({
            ...member,
            rank: group.rank,
            isCurrentGroup: group.isCurrentGroup,
            groupColor: this.getRankColor(group.rank)
          })
        })
      })
      
      // 按排名排序
      allPeople.sort((a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName))
      
      // 創建權重塊
      const blocks = []
      let globalPos = 0
      
      allPeople.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        for (let i = 0; i < numBlocks; i++) {
          blocks.push({
            person: person,
            globalPosition: globalPos++,
            blockIndex: i,
            totalBlocks: numBlocks
          })
        }
      })
      
      if (blocks.length === 0) {
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', '#666')
          .text('暫無數據')
        return
      }
      
      // 計算塊大小和位置
      const blockSize = Math.min(12, (width - margin.left - margin.right) / blocks.length)
      const blockHeight = 40
      const startX = margin.left + (width - margin.left - margin.right - blocks.length * blockSize) / 2
      const startY = (height - blockHeight) / 2
      
      // 繪製權重塊
      svg.selectAll('.weight-block')
        .data(blocks)
        .enter()
        .append('rect')
        .attr('class', 'weight-block')
        .attr('x', d => startX + d.globalPosition * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', d => d.person.groupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('opacity', d => d.person.isCurrentGroup ? 1 : 0.8)
        .on('mouseover', function(event, d) {
          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.person.displayName}</strong><br/>
                   第${d.person.rank}名組${d.person.isCurrentGroup ? ' (我們組)' : ''}<br/>
                   權重: ${d.person.finalWeight.toFixed(1)}<br/>
                   得分: ${d.person.points.toFixed(2)}點`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', () => tooltip.style('opacity', 0))
      
      // 不顯示個人邊框，只保留顏色區分
      
      // 組別分隔線
      let sepPos = 0
      for (let rank = 1; rank <= this.totalActiveGroups; rank++) {
        const rankPeople = allPeople.filter(p => p.rank === rank)
        if (rankPeople.length > 0) {
          const rankBlocks = rankPeople.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
          sepPos += rankBlocks
          
          if (rank < this.totalActiveGroups) {
            svg.append('line')
              .attr('x1', startX + sepPos * blockSize - 1)
              .attr('x2', startX + sepPos * blockSize - 1)
              .attr('y1', startY - 20)
              .attr('y2', startY + blockHeight + 20)
              .attr('stroke', '#000')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '4,2')
          }
        }
      }
      
      // 組別標籤（下方）
      let labelPos = 0
      for (let rank = 1; rank <= this.totalActiveGroups; rank++) {
        const rankPeople = allPeople.filter(p => p.rank === rank)
        if (rankPeople.length > 0) {
          const rankBlocks = rankPeople.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
          const centerPos = labelPos + rankBlocks / 2
          const isCurrentGroup = rankPeople.some(p => p.isCurrentGroup)
          const groupColor = this.getRankColor(rank)
          
          svg.append('text')
            .attr('x', startX + centerPos * blockSize)
            .attr('y', startY + blockHeight + 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', isCurrentGroup ? 'bold' : 'normal')
            .attr('fill', groupColor)
            .text(`第${rank}名組${isCurrentGroup ? ' (我們)' : ''}`)
          
          // 組總點數
          const groupTotalPoints = rankPeople.reduce((sum, p) => sum + p.points, 0)
          svg.append('text')
            .attr('x', startX + centerPos * blockSize)
            .attr('y', startY + blockHeight + 35)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .text(`${Math.round(groupTotalPoints)}點`)
          
          labelPos += rankBlocks
        }
      }
      
      // 添加總體說明
      const totalPoints = allPeople.reduce((sum, p) => sum + p.points, 0)
      const totalWeight = allPeople.reduce((sum, p) => sum + p.finalWeight, 0)
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text(`各組權重分配 | 總點數: ${Math.round(totalPoints)}點 | 總權重: ${Math.round(totalWeight)}`)
    },
    
    calculateAllGroupsScoring(selectedMembers) {
      const targetRank = parseInt(this.simulatedRank)
      const totalStagePoints = this.stageReward || 100
      
      // 動態計算排名權重
      const rankWeights = {}
      for (let i = 1; i <= this.totalActiveGroups; i++) {
        rankWeights[i] = this.totalActiveGroups - i + 1
      }
      
      // 構建所有組的數據
      const allGroupsData = []
      
      // 1. 添加我們組（在指定排名）
      const ourGroupMembers = selectedMembers.map(member => {
        const participationRatio = member.contribution
        const baseWeightUnits = participationRatio / 5 // 統一使用5%作為基準
        const finalWeight = baseWeightUnits * rankWeights[targetRank]
        
        return {
          email: member.email,
          displayName: member.displayName,
          participationRatio: participationRatio,
          baseWeightUnits: baseWeightUnits,
          rankMultiplier: rankWeights[targetRank],
          finalWeight: finalWeight,
          points: 0 // 稍後計算
        }
      })
      
      allGroupsData.push({
        rank: targetRank,
        isCurrentGroup: true,
        members: ourGroupMembers
      })
      
      // 2. 添加其他組（假設均分）
      let addedGroups = 1
      
      // 基於實際的 allGroups 數據添加其他組
      if (this.$parent && this.$parent.allGroups) {
        this.$parent.allGroups.forEach(group => {
          if (group.groupId !== this.$parent.currentGroup?.groupId && group.status === 'active' && addedGroups < this.totalActiveGroups) {
            // 找一個還沒被佔用的排名
            let rank = 1
            while (rank === targetRank || allGroupsData.some(g => g.rank === rank)) {
              rank++
            }
            
            if (rank <= this.totalActiveGroups) {
              const memberCount = group.memberCount || group.members?.length || 3
              const members = []
              
              // 計算均分（必須是5%的倍數）
              const basePercentage = Math.floor(100 / memberCount / 5) * 5
              const remainder = 100 - (basePercentage * memberCount)
              
              for (let i = 0; i < memberCount; i++) {
                let contribution = basePercentage
                if (i < remainder / 5) contribution += 5
                
                const baseWeightUnits = contribution / 5
                const finalWeight = baseWeightUnits * rankWeights[rank]
                
                members.push({
                  email: `team${rank}_member${i + 1}`,
                  displayName: `${group.groupName || '第' + rank + '名組'}成員${i + 1}`,
                  participationRatio: contribution,
                  baseWeightUnits: baseWeightUnits,
                  rankMultiplier: rankWeights[rank],
                  finalWeight: finalWeight,
                  points: 0
                })
              }
              
              allGroupsData.push({
                rank: rank,
                isCurrentGroup: false,
                members: members
              })
              
              addedGroups++
            }
          }
        })
      }
      
      // 如果還有空位，用預設組填補
      while (addedGroups < this.totalActiveGroups) {
        let rank = 1
        while (allGroupsData.some(g => g.rank === rank)) {
          rank++
        }
        
        if (rank <= this.totalActiveGroups) {
          const members = []
          // 預設3人組，均分
          const contributions = [35, 35, 30] // 總和100%，都是5%的倍數
          
          contributions.forEach((contribution, i) => {
            const baseWeightUnits = contribution / 5
            const finalWeight = baseWeightUnits * rankWeights[rank]
            
            members.push({
              email: `team${rank}_member${i + 1}`,
              displayName: `第${rank}名組成員${i + 1}`,
              participationRatio: contribution,
              baseWeightUnits: baseWeightUnits,
              rankMultiplier: rankWeights[rank],
              finalWeight: finalWeight,
              points: 0
            })
          })
          
          allGroupsData.push({
            rank: rank,
            isCurrentGroup: false,
            members: members
          })
          
          addedGroups++
        }
      }
      
      // 計算總權重和分配點數
      let totalWeight = 0
      allGroupsData.forEach(group => {
        group.members.forEach(member => {
          totalWeight += member.finalWeight
        })
      })
      
      const pointsPerWeight = totalStagePoints / totalWeight
      
      // 分配點數
      allGroupsData.forEach(group => {
        group.members.forEach(member => {
          member.points = member.finalWeight * pointsPerWeight
        })
      })
      
      // 按排名排序
      allGroupsData.sort((a, b) => a.rank - b.rank)
      
      return allGroupsData
    },
    
    getRankColor(rank) {
      const baseColors = ['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#3F51B5', '#009688', '#795548']
      const colorIndex = (rank - 1) % baseColors.length
      return baseColors[colorIndex]
    }
  }
}
</script>

<style scoped>
.group-submission-approval-modal {
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
}

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

.breadcrumb-section {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

/* 共識警告樣式 */
.consensus-warning {
  margin: 20px 25px;
}

/* 參與度分配區塊樣式 */
.participation-distribution-section {
  padding: 20px 25px;
  background: #fefefe;
  border-bottom: 1px solid #e1e8ed;
}

.section-header {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.section-header h3 {
  margin: 0 0 5px 0;
  color: #2c3e50;
  font-size: 18px;
  font-weight: 600;
}

.section-subtitle {
  color: #6c757d;
  font-size: 14px;
  margin: 0;
  flex: 1;
}

.rank-simulation {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333;
}

.rank-simulation label {
  font-weight: 500;
}

.rank-selector {
  width: 120px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-title i {
  color: #6c757d;
}

.version-selector-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

/* 版本選擇器區域特定樣式 */
.version-selector-section .section-header {
  margin-bottom: 15px;
  display: block; /* 不使用 flex 排版 */
}

.version-selector-section .section-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

/* 選擇器容器 - 使用垂直流式排版 */
.selector-container {
  width: 100%;
}

.version-selector {
  width: 100%;
  max-width: 500px;
}

.version-selector :deep(.el-select__wrapper) {
  border: 2px solid #d0d7de;
  border-radius: 8px;
  transition: border-color 0.2s;
}

.version-selector :deep(.el-select__wrapper:hover) {
  border-color: #8b949e;
}

.version-selector :deep(.el-select__wrapper.is-focused) {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.12);
}

.version-tag {
  font-size: 11px;
  color: #666;
  font-weight: normal;
}

.version-tag.current {
  color: #67c23a;
  font-weight: 500;
}

.submission-content-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
}

.submission-content-section .section-header {
  margin-bottom: 15px;
  display: block;
}

.submission-content-section .section-header h3 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
}

.submission-meta {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #666;
}

.submission-content {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.6;
}

.submission-content h1,
.submission-content h2,
.submission-content h3 {
  color: #2c3e50;
  margin-top: 0;
  margin-bottom: 12px;
}

.submission-content p {
  margin: 0 0 12px 0;
  color: #555;
}

.submission-content pre {
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
}

.submission-content code {
  background: #f4f4f4;
  padding: 2px 4px;
  border-radius: 2px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
}

.submission-content a {
  color: #409eff;
  text-decoration: none;
}

.submission-content a:hover {
  text-decoration: underline;
}

.no-content {
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 40px 20px;
}

.restore-confirmation {
  text-align: center;
  padding: 20px 0;
}

.restore-confirmation .warning-icon {
  font-size: 48px;
  color: #e6a23c;
  margin-bottom: 20px;
}

.restore-confirmation p {
  margin: 10px 0;
  color: #333;
}

.restore-confirmation .warning-text {
  color: #e6a23c;
  font-weight: 500;
  background: #fdf6ec;
  padding: 10px;
  border-radius: 6px;
  border-left: 4px solid #e6a23c;
}

.confirm-input {
  margin-top: 20px;
  max-width: 300px;
}

.contribution-chart {
  margin-top: 15px;
}

.chart-container {
  width: 100%;
  min-height: 170px;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  padding: 10px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: #6c757d;
  font-style: italic;
  background: #f8f9fa;
  border-radius: 6px;
}

.voting-status-section {
  padding: 25px;
}

.status-card {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-header h3 {
  margin: 0;
  color: #2c3e50;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.status-badge.approved {
  background: #d4edda;
  color: #155724;
}

.status-badge.completed {
  background: #cce7ff;
  color: #004085;
}

.status-badge.in-progress {
  background: #fff3cd;
  color: #856404;
}

.status-badge.rejected {
  background: #f8d7da;
  color: #721c24;
}

.voting-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
}

.stat-value.agree {
  color: #67c23a;
}

.stat-value.consensus {
  color: #e6a23c;
}

.progress-section {
  margin-top: 15px;
}

.progress-label {
  margin-bottom: 8px;
  font-size: 14px;
  color: #666;
}

.chart-section {
  padding: 0 25px 25px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.chart-header h3 {
  margin: 0;
  color: #2c3e50;
}

.chart-legend {
  display: flex;
  gap: 15px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-item.agree .legend-dot {
  background: #67c23a;
}

/* 移除反對票圖例樣式 - 只顯示同意票增長 */

.chart-container {
  width: 100%;
  height: 200px;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
}

.votes-list-section {
  padding: 0 25px 25px;
}

.votes-list-section h3 {
  margin: 0 0 15px 0;
  color: #2c3e50;
}

.votes-list {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  overflow: hidden;
}

.vote-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
}

.vote-item:last-child {
  border-bottom: none;
}

.vote-item:hover {
  background: #f8f9fa;
}

.vote-info {
  flex: 1;
}

.voter-name {
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 2px;
}

.vote-time {
  font-size: 12px;
  color: #666;
}

.vote-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.vote-badge.agree {
  background: #d4edda;
  color: #155724;
}

.vote-badge.disagree {
  background: #f8d7da;
  color: #721c24;
}

.vote-badge.pending {
  background: #e2e3e5;
  color: #6c757d;
}

.modal-actions {
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  border-top: 1px solid #e1e8ed;
  flex-wrap: wrap;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-success {
  background: #67c23a;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #5a9e34;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.3);
}

.btn-danger {
  background: #f56c6c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #f04141;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 108, 108, 0.3);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
}

.user-vote-status,
.approved-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #d4edda;
  color: #155724;
  border-radius: 6px;
  font-weight: 500;
}

.delete-confirmation {
  text-align: center;
  padding: 20px 0;
}

.warning-icon {
  font-size: 48px;
  color: #f56c6c;
  margin-bottom: 15px;
}

.warning-text {
  color: #f56c6c;
  font-size: 14px;
  margin-top: 10px;
}

.confirm-input {
  margin-top: 15px;
  max-width: 200px;
}

/* D3.js tooltip 樣式 */
:global(.chart-tooltip) {
  position: absolute;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10000;
  opacity: 0;
  transition: opacity 0.2s;
}

@media (max-width: 768px) {
  .modal-content {
    width: 100%;
    max-height: 90vh;
  }
  
  .voting-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
}
</style>