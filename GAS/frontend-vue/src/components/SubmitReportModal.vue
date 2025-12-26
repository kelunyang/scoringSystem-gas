<template>
  <div class="submit-report-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop>
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">發送報告</h2>
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
          <el-breadcrumb-item>發送報告</el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- 驗證提示 -->
      <el-alert
        v-if="!canSubmit && (content.length > 0 || totalPercentage > 0)"
        :title="getValidationMessage()"
        type="warning"
        show-icon
        :closable="false"
        class="validation-alert"
      />

      <!-- 獎金顯示 -->
      <div class="reward-info">
        <label class="reward-label">階段報告獎金</label>
        <div class="reward-amount">{{ reportReward || 1000 }}</div>
      </div>

      <!-- 參考歷史版本區域（只在載入中或有歷史版本時顯示） -->
      <div v-if="loadingHistoricalVersions || historicalVersions.length > 0" class="version-selector-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-history"></i>
            參考歷史版本
          </label>
        </div>
        
        <!-- 載入中狀態 -->
        <div v-if="loadingHistoricalVersions" class="version-loading" v-loading="true" element-loading-text="載入歷史版本中...">
          <div class="loading-placeholder">載入歷史版本中...</div>
        </div>
        
        <!-- 有歷史版本 -->
        <div v-else-if="historicalVersions.length > 0" class="version-content">
          <el-select 
            v-model="selectedHistoricalVersion" 
            class="version-selector"
            placeholder="選擇歷史版本以快速填入內容"
            @change="handleHistoricalVersionChange"
            clearable
          >
            <el-option
              v-for="version in historicalVersions"
              :key="version.submissionId"
              :label="`${formatVersionTime(version.submittedTime)} - ${getSubmitterName(version.submitter)}`"
              :value="version.submissionId"
            >
              <span class="version-option">
                {{ formatVersionTime(version.submittedTime) }} - {{ getSubmitterName(version.submitter) }}
                <span class="version-tag withdrawn">(已撤回)</span>
              </span>
            </el-option>
          </el-select>
          
          <div v-if="selectedHistoricalVersion" class="version-info">
            <i class="fas fa-info-circle"></i>
            選擇歷史版本後會自動填入該版本的報告內容和點數分配，您可以在此基礎上進行修改
          </div>
        </div>
        
        <!-- 無歷史版本（隱藏整個區域） -->
      </div>

      <!-- Markdown 編輯區 -->
      <div class="editor-section">
        <!-- 工具列 -->
        <div class="editor-toolbar">
          <button 
            v-for="tool in markdownTools" 
            :key="tool.name"
            class="tool-btn"
            :title="tool.title"
            @click="insertMarkdown(tool)"
          >
            <span v-if="tool.icon" v-html="tool.icon"></span>
            <span v-else>{{ tool.name }}</span>
          </button>
          <div class="toolbar-divider"></div>
          <button 
            class="tool-btn preview-btn"
            :class="{ active: showPreview }"
            @click="togglePreview"
            title="預覽Markdown"
          >
            <i class="fas fa-eye"></i> 預覽
          </button>
        </div>

        <!-- 編輯/預覽區域 -->
        <div class="editor-content" :class="{ preview: showPreview }">
          <textarea
            v-if="!showPreview"
            ref="editor"
            v-model="content"
            class="markdown-editor"
            :placeholder="placeholder"
            @keydown="handleKeydown"
          ></textarea>
          
          <div v-if="showPreview" class="markdown-preview">
            <div v-html="renderedMarkdown" class="preview-content"></div>
          </div>
        </div>
      </div>
      
      <!-- 參與者選擇區域 -->
      <div class="participants-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-users"></i> 參與者貢獻度分配
          </label>
          <div class="header-actions">
            <button class="btn-equal-split" @click="equalSplit">
              <i class="fas fa-balance-scale"></i> 均分
            </button>
            <div class="rank-simulation">
              <label>模擬排名:</label>
              <select v-model="simulatedRank" class="rank-selector">
                <option v-for="rank in totalActiveGroups" :key="rank" :value="rank">
                  第{{ rank }}名
                </option>
              </select>
            </div>
            <div class="total-percentage" :class="{ valid: totalPercentage === 100, invalid: totalPercentage !== 100 }">
              總計: {{ totalPercentage }}%
            </div>
          </div>
        </div>
        
        <!-- 參與者列表 -->
        <div class="participants-list">
          <div v-for="member in groupMembers" :key="member.email" class="participant-item">
            <div class="participant-info">
              <el-checkbox 
                v-model="member.selected" 
                :label="member.displayName"
                :disabled="member.isSubmitter"
              />
              <span v-if="member.isSubmitter" class="submitter-tag">(提交者)</span>
            </div>
            
            <div class="contribution-controls">
              <el-slider 
                v-model="member.contribution"
                :key="`slider-${member.email}`"
                :min="5"
                :max="100"
                :step="5"
                :disabled="!member.selected"
                :show-tooltip="true"
                :format-tooltip="(val) => `${val}%`"
                @input="updateContributions"
              />
              <el-input-number 
                v-model="member.contribution"
                :key="`input-${member.email}`"
                :min="5"
                :max="100"
                :step="5"
                :disabled="!member.selected"
                size="small"
                controls-position="right"
                @change="updateContributions"
              />
              <span class="percentage-sign">%</span>
            </div>
          </div>
        </div>
        
        <!-- 權重分配預覽 -->
        <div class="contribution-chart">
          <div class="chart-description">
            <i class="fas fa-trophy" :style="{ color: getRankColor(simulatedRank) }"></i>
            <span>全組競爭權重分配視覺化 (包含其他組的均分假設，每方塊=1權重)</span>
          </div>
          <div class="chart-note">
            💡 <strong>說明：</strong>上圖顯示組內個人分配，下圖顯示與其他組的競爭比較
          </div>
          
          <!-- 組內個人分配圖 -->
          <div class="chart-section">
            <h4 style="margin: 10px 0; color: #2c3e50; font-size: 14px;">
              <i class="fas fa-users"></i> 我們組內個人點數分配
            </h4>
            <div id="ourGroupChart" ref="ourGroupChartContainer" style="min-height: 180px; border: 1px solid #e1e8ed; border-radius: 4px; background: #fafafa;"></div>
          </div>
          
          <!-- 各組總點數比較圖 -->
          <div class="chart-section" style="margin-top: 20px;">
            <h4 style="margin: 10px 0; color: #2c3e50; font-size: 14px;">
              <i class="fas fa-trophy"></i> 各組總點數競爭比較
            </h4>
            <div id="allGroupsChart" ref="allGroupsChartContainer" style="min-height: 120px; border: 1px solid #e1e8ed; border-radius: 4px; background: #fafafa;"></div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="modal-actions">
        <button class="btn btn-primary" @click="submitReport" :disabled="!canSubmit">
          <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
          {{ submitting ? '提交中...' : '送出' }}
        </button>
        <button class="btn btn-secondary" @click="clearContent">
          清除重填
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import * as d3 from 'd3'

export default {
  name: 'SubmitReportModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    stageId: {
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
    reportReward: {
      type: Number,
      default: 1000
    },
    availableGroups: {
      type: Array,
      default: () => []
    },
    currentUserEmail: {
      type: String,
      default: ''
    },
    currentGroup: {
      type: Object,
      default: () => ({
        members: []
      })
    },
    allGroups: {
      type: Array,
      default: () => []
    },
    projectId: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      content: '',
      selectedGroup: '',
      groupMembers: [],
      simulatedRank: 1, // 預設模擬第1名
      submitting: false, // 提交中狀態
      placeholder: '這是我們**這組的成果**，大家可以參考這個網址：  [Google](www.google.com) ！',
      markdownTools: [
        {
          name: 'B',
          title: '粗體文字',
          icon: '<i class="fas fa-bold"></i>',
          prefix: '**',
          suffix: '**',
          placeholder: '粗體文字'
        },
        {
          name: 'I',
          title: '斜體文字',
          icon: '<i class="fas fa-italic"></i>',
          prefix: '*',
          suffix: '*',
          placeholder: '斜體文字'
        },
        {
          name: '🔗',
          title: '插入連結',
          icon: '<i class="fas fa-link"></i>',
          prefix: '[',
          suffix: '](url)',
          placeholder: '連結文字'
        },
        {
          name: 'CODE',
          title: '程式碼區塊',
          icon: '<i class="fas fa-code"></i>',
          prefix: '```\n',
          suffix: '\n```',
          placeholder: '程式碼'
        }
      ],
      showPreview: false,
      
      // 版本相關
      historicalVersions: [], // 歷史版本列表（只包含withdrawn的版本）
      selectedHistoricalVersion: '', // 選中的歷史版本ID
      loadingHistoricalVersions: false
    }
  },
  computed: {
    canSubmit() {
      return this.content.trim().length > 0 && this.totalPercentage === 100 && !this.submitting
    },
    
    renderedMarkdown() {
      return this.parseMarkdown(this.content)
    },
    
    totalPercentage() {
      return this.groupMembers
        .filter(m => m.selected)
        .reduce((sum, m) => sum + m.contribution, 0)
    },
    
    selectedAuthors() {
      return this.groupMembers
        .filter(m => m.selected)
        .map(m => m.email)
    },
    
    participationProposal() {
      const proposal = {}
      this.groupMembers
        .filter(m => m.selected && m.contribution > 0)
        .forEach(m => {
          proposal[m.email] = m.contribution / 100
        })
      return proposal
    },
    
    totalActiveGroups() {
      // 計算專案中的活躍組數（包含當前組）
      const activeGroups = this.allGroups.filter(g => g.status === 'active').length
      return Math.max(2, activeGroups) // 至少2組
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.initializeGroupMembers()
        this.loadHistoricalVersions() // 載入歷史版本
        this.$nextTick(() => {
          if (this.$refs.editor) {
            this.$refs.editor.focus()
          }
          this.renderChart()
        })
      } else {
        // 清空內容當關閉時
        this.content = ''
        this.showPreview = false
        this.submitting = false
        this.resetParticipants()
        this.resetHistoricalVersions()
      }
    },
    
    groupMembers: {
      handler() {
        this.$nextTick(() => {
          this.renderChart()
        })
      },
      deep: true
    },
    
    simulatedRank() {
      this.$nextTick(() => {
        this.renderChart()
      })
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },
    
    insertMarkdown(tool) {
      const editor = this.$refs.editor
      if (!editor) return
      
      const start = editor.selectionStart
      const end = editor.selectionEnd
      const selectedText = this.content.substring(start, end)
      
      let newText = ''
      
      if (tool.name === '🔗') {
        // 連結功能
        if (selectedText) {
          newText = `[${selectedText}](url)`
        } else {
          newText = `[${tool.placeholder}](url)`
        }
      } else {
        // 一般 markdown 標記
        if (selectedText) {
          newText = `${tool.prefix}${selectedText}${tool.suffix}`
        } else {
          newText = `${tool.prefix}${tool.placeholder}${tool.suffix}`
        }
      }
      
      // 替換選中的文字
      const beforeText = this.content.substring(0, start)
      const afterText = this.content.substring(end)
      this.content = beforeText + newText + afterText
      
      // 重新設定游標位置
      this.$nextTick(() => {
        const newPosition = start + newText.length
        editor.setSelectionRange(newPosition, newPosition)
        editor.focus()
      })
    },
    
    handleKeydown(event) {
      // Ctrl/Cmd + B for bold
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault()
        this.insertMarkdown(this.markdownTools[0])
      }
      
      // Tab 縮排
      if (event.key === 'Tab') {
        event.preventDefault()
        const start = event.target.selectionStart
        const end = event.target.selectionEnd
        
        const beforeText = this.content.substring(0, start)
        const afterText = this.content.substring(end)
        this.content = beforeText + '  ' + afterText
        
        this.$nextTick(() => {
          event.target.setSelectionRange(start + 2, start + 2)
        })
      }
    },
    
    togglePreview() {
      this.showPreview = !this.showPreview
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
        
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/`([^`]*)`/gim, '<code>$1</code>')
        
        // Links
        .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank">$1</a>')
        
        // Line breaks
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>')
      
      return `<p>${html}</p>`
    },
    
    async submitReport() {
      if (!this.canSubmit) return
      
      this.submitting = true
      try {
        if (!this.projectId) {
          const { ElMessage } = await import('element-plus')
          ElMessage.error('缺少專案ID')
          return
        }
        
        const submissionData = {
          content: this.content,
          type: 'report',
          authors: this.selectedAuthors,
          participationProposal: this.participationProposal,
          metadata: {
            wordCount: this.content.length,
            hasPreview: this.showPreview,
            submittedAt: new Date().toISOString()
          }
        }
        
        const response = await this.$apiClient.submitReport(
          this.projectId,
          this.stageId,
          submissionData
        )
        
        if (response.success) {
          const { ElMessage } = await import('element-plus')
          ElMessage.success('報告提交成功！')
          
          // 成功後通知父組件
          this.$emit('submit', { 
            success: true, 
            submissionId: response.data.submissionId,
            ...submissionData
          })
          
          this.handleClose()
        } else {
          const { ElMessage } = await import('element-plus')
          ElMessage.error(response.error?.message || '提交報告失敗')
        }
      } catch (error) {
        console.error('提交報告錯誤:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('提交報告時發生錯誤')
      } finally {
        this.submitting = false
      }
    },
    
    clearContent() {
      this.content = ''
      this.showPreview = false
      this.resetParticipants()
      if (this.$refs.editor) {
        this.$refs.editor.focus()
      }
    },
    
    initializeGroupMembers() {
      console.log('SubmitReportModal initializeGroupMembers 調試:', {
        currentGroup: this.currentGroup,
        currentUserEmail: this.currentUserEmail,
        hasCurrentGroup: !!this.currentGroup,
        hasMembers: !!(this.currentGroup && this.currentGroup.members),
        membersCount: this.currentGroup?.members?.length || 0,
        hasParentProjectData: !!(this.$parent && this.$parent.projectData),
        hasUsers: !!(this.$parent && this.$parent.projectData && this.$parent.projectData.users),
        usersCount: this.$parent?.projectData?.users?.length || 0
      })
      
      if (this.currentGroup && this.currentGroup.members) {
        console.log('原始成員資料:', this.currentGroup.members)
        
        this.groupMembers = this.currentGroup.members.map(member => {
          const memberEmail = member.email || member.userEmail
          
          // 現在 currentGroup.members 應該已經包含正確的 displayName
          const displayName = member.displayName || member.username || (memberEmail ? memberEmail.split('@')[0] : '用戶')
          
          return {
            email: memberEmail,
            displayName: displayName,
            selected: memberEmail === this.currentUserEmail,
            isSubmitter: memberEmail === this.currentUserEmail,
            contribution: memberEmail === this.currentUserEmail ? 100 : 0
          }
        })
        
        console.log('處理後的 groupMembers:', this.groupMembers)
      } else {
        console.log('沒有群組資料，使用當前用戶作為唯一成員')
        // 如果沒有群組資料，至少包含當前使用者
        // 嘗試從父組件獲取當前用戶的 displayName
        let currentDisplayName = '我'
        if (this.$parent && this.$parent.user) {
          currentDisplayName = this.$parent.user.displayName || this.$parent.user.username || 
                              (this.currentUserEmail ? this.currentUserEmail.split('@')[0] : '我')
        }
        this.groupMembers = [{
          email: this.currentUserEmail,
          displayName: currentDisplayName,
          selected: true,
          isSubmitter: true,
          contribution: 100
        }]
      }
    },
    
    resetParticipants() {
      this.groupMembers.forEach(member => {
        member.selected = member.isSubmitter
        member.contribution = member.isSubmitter ? 100 : 0
      })
    },
    
    equalSplit() {
      // 全選所有成員
      this.groupMembers.forEach(member => {
        member.selected = true
      })
      
      // 計算均分比例（必須是5%的倍數）
      const memberCount = this.groupMembers.length
      const basePercentage = Math.floor(100 / memberCount / 5) * 5 // 向下取整到5%倍數
      const remainder = 100 - (basePercentage * memberCount)
      
      // 分配基礎比例
      this.groupMembers.forEach((member, index) => {
        member.contribution = basePercentage
        // 將餘數分配給前幾個成員
        if (index < remainder / 5) {
          member.contribution += 5
        }
      })
      
      this.$nextTick(() => {
        this.renderChart()
      })
    },
    
    updateContributions() {
      // 只確保貢獻度符合5%的倍數，不自動調整總和
      const selectedMembers = this.groupMembers.filter(m => m.selected)
      if (selectedMembers.length === 0) return
      
      // 確保每個成員的貢獻度都是5%的倍數且至少為5%
      selectedMembers.forEach(member => {
        if (member.contribution < 5) {
          member.contribution = 5
        } else {
          // 四捨五入到最近的5%倍數
          member.contribution = Math.round(member.contribution / 5) * 5
        }
      })
      
      // 重新渲染圖表
      this.$nextTick(() => {
        this.renderChart()
      })
    },
    
    renderChart() {
      // 如果沒有選中的成員，不渲染圖表
      const selectedMembers = this.groupMembers.filter(m => m.selected && m.contribution > 0)
      if (selectedMembers.length === 0) {
        // 清空兩個圖表
        if (this.$refs.ourGroupChartContainer) this.$refs.ourGroupChartContainer.innerHTML = ''
        if (this.$refs.allGroupsChartContainer) this.$refs.allGroupsChartContainer.innerHTML = ''
        return
      }
      
      // 渲染兩個分離的圖表
      this.renderOurGroupChart(selectedMembers)
      this.renderAllGroupsChart(selectedMembers)
    },
    
    renderOurGroupChart(selectedMembers) {
      if (!this.$refs.ourGroupChartContainer) return
      
      // 清空現有圖表
      const container = this.$refs.ourGroupChartContainer
      container.innerHTML = ''
      
      // 計算我們組的數據
      const ourGroupData = this.calculateFirstPlaceScoring(selectedMembers)
      
      // 設置圖表尺寸
      const width = container.offsetWidth || 600
      const height = 150
      const margin = { top: 20, right: 40, bottom: 60, left: 40 }
      
      // 創建 tooltip
      const tooltip = this.createTooltip()
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
      
      // 創建個人權重方塊 (stack bar)
      const blocks = []
      let blockPos = 0
      
      ourGroupData.forEach(person => {
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
      
      const totalBlocks = blocks.length
      // RWD占滿100%寬度 - 每個block動態調整大小
      const availableWidth = width - margin.left - margin.right
      const blockSize = availableWidth / totalBlocks
      const startX = margin.left
      const blockHeight = 40
      const startY = 50
      
      // 使用我們組的顏色
      const ourGroupColor = this.getRankColor(this.simulatedRank)
      
      // 繪製權重方塊
      const blockElements = svg.selectAll('.weight-block')
        .data(blocks)
        .enter()
        .append('g')
        .attr('class', 'weight-block')
      
      blockElements.append('rect')
        .attr('x', d => startX + d.position * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', ourGroupColor)
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
      ourGroupData.forEach(person => {
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
      const totalPoints = ourGroupData.reduce((sum, p) => sum + p.points, 0)
      const totalWeight = ourGroupData.reduce((sum, p) => sum + p.finalWeight, 0)
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text(`我們組第${this.simulatedRank}名預期: ${Math.round(totalPoints)}點 | 總權重: ${Math.round(totalWeight)}`)
    },
    
    renderAllGroupsChart(selectedMembers) {
      if (!this.$refs.allGroupsChartContainer) return
      
      // 清空現有圖表
      const container = this.$refs.allGroupsChartContainer
      container.innerHTML = ''
      
      // 計算所有組的數據
      const allGroupsData = this.calculateAllGroupsScoring(selectedMembers)
      
      // 設置圖表尺寸
      const width = container.offsetWidth || 800
      const height = 300
      const margin = { top: 50, right: 40, bottom: 60, left: 40 }
      
      // 創建 tooltip
      const tooltip = this.createTooltip()
      
      // 創建SVG
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
      
      // 創建所有權重塊數據（參考 point_distribution_visualization.html）
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
    
    createTooltip() {
      // 移除現有的 tooltip
      d3.select('.chart-tooltip').remove()
      
      return d3.select('body').append('div')
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
    },
    
    calculateScoring(selectedMembers, targetRank = 1) {
      // 假設階段總點數
      const totalStagePoints = this.reportReward || 100
      
      // 動態計算排名權重：第1名=N，第2名=N-1，...最後一名=1（N=總組數）
      const rankWeights = {}
      for (let i = 1; i <= this.totalActiveGroups; i++) {
        rankWeights[i] = this.totalActiveGroups - i + 1
      }
      
      // 構建所有組的數據（包括我們組和其他組）
      const allTeamRoles = {}
      
      // 1. 我們組 - 放在指定排名位置，使用實際貢獻度分配
      allTeamRoles[targetRank] = selectedMembers.map(member => ({
        name: member.displayName,
        ratio: member.contribution,
        isCurrentUser: true
      }))
      
      // 2. 其他組（假設均分） - 基於實際的 allGroups 數據
      const otherRanks = []
      for (let i = 1; i <= this.totalActiveGroups; i++) {
        if (i !== targetRank) otherRanks.push(i)
      }
      let rankIndex = 0
      
      this.allGroups.forEach(group => {
        if (group.groupId !== this.currentGroup?.groupId && group.status === 'active' && rankIndex < otherRanks.length) {
          const rank = otherRanks[rankIndex]
          const memberCount = group.memberCount || group.members?.length || 3 // 預設3人
          const basePercentage = Math.floor(100 / memberCount / 5) * 5
          const remainder = 100 - (basePercentage * memberCount)
          
          allTeamRoles[rank] = []
          for (let i = 0; i < memberCount; i++) {
            let contribution = basePercentage
            if (i < remainder / 5) contribution += 5
            
            allTeamRoles[rank].push({
              name: `第${rank}名組員${i + 1}`,
              ratio: contribution,
              isCurrentUser: false
            })
          }
          rankIndex++
        }
      })
      
      // 如果其他組不足，用預設組補足
      while (rankIndex < otherRanks.length) {
        const rank = otherRanks[rankIndex]
        allTeamRoles[rank] = [
          { name: `第${rank}名組員1`, ratio: 35, isCurrentUser: false },
          { name: `第${rank}名組員2`, ratio: 35, isCurrentUser: false },
          { name: `第${rank}名組員3`, ratio: 30, isCurrentUser: false }
        ]
        rankIndex++
      }
      
      // 收集所有比例，找到全域最小值（參考 point_distribution_visualization.html line 283-294）
      // 重要：要包含所有組的所有成員來計算全域最小比例
      const allRatios = []
      for (let rankKey in allTeamRoles) {
        if (allTeamRoles[rankKey] && allTeamRoles[rankKey].length > 0) {
          allTeamRoles[rankKey].forEach(role => {
            if (role.ratio > 0) allRatios.push(role.ratio)
          })
        }
      }
      
      if (allRatios.length === 0) return []
      
      // 系統統一使用5%作為基準單位（參考 point_distribution_visualization.html）
      // 這確保了權重計算的一致性，無論用戶如何分配比例
      const globalMinRatio = 5
      
      // 計算我們組的數據
      const scoringData = selectedMembers.map(member => {
        const participationRatio = member.contribution
        
        // 基礎權重單位 = 個人比例 / 全域最小比例
        const baseWeightUnits = participationRatio / globalMinRatio
        
        // 實際權重 = 基礎權重 × 排名匯率
        const finalWeight = baseWeightUnits * rankWeights[targetRank]
        
        return {
          email: member.email,
          displayName: member.displayName,
          participationRatio: participationRatio,
          baseWeightUnits: baseWeightUnits,
          rankMultiplier: rankWeights[targetRank],
          finalWeight: finalWeight,
          globalMinRatio: globalMinRatio,
          targetRank: targetRank,
          points: 0 // 稍後計算
        }
      })
      
      // 計算所有組的總權重來分配點數
      const allPeople = []
      for (let rankKey in allTeamRoles) {
        const rankWeight = rankWeights[rankKey]
        allTeamRoles[rankKey].forEach(role => {
          const baseWeightUnits = role.ratio / globalMinRatio
          const finalWeight = baseWeightUnits * rankWeight
          allPeople.push({ finalWeight })
        })
      }
      
      const totalWeight = allPeople.reduce((sum, person) => sum + person.finalWeight, 0)
      const pointsPerWeight = totalStagePoints / totalWeight
      
      // 分配我們組的實際點數
      scoringData.forEach(item => {
        item.points = item.finalWeight * pointsPerWeight
      })
      
      // 按得分降序排序並返回
      return scoringData.sort((a, b) => b.points - a.points)
    },
    
    // 保持原來的函數名以維持兼容性
    calculateFirstPlaceScoring(selectedMembers) {
      return this.calculateScoring(selectedMembers, parseInt(this.simulatedRank))
    },
    
    // 計算所有組的點數分配以顯示完整視覺化
    calculateAllGroupsScoring(selectedMembers) {
      const targetRank = parseInt(this.simulatedRank)
      const totalStagePoints = this.reportReward || 100
      
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
      this.allGroups.forEach(group => {
        if (group.groupId !== this.currentGroup?.groupId && group.status === 'active' && addedGroups < this.totalActiveGroups) {
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
    },
    
    getValidationMessage() {
      if (this.content.trim().length === 0) {
        return '請填寫報告內容'
      }
      
      if (this.totalPercentage < 100) {
        return `組員工作點數分配低於100% (目前: ${this.totalPercentage}%)`
      }
      
      if (this.totalPercentage > 100) {
        return `組員工作點數分配超過100% (目前: ${this.totalPercentage}%)`
      }
      
      return ''
    },
    
    // 歷史版本相關方法
    async loadHistoricalVersions() {
      if (!this.projectId || !this.stageId) {
        console.log('缺少 projectId 或 stageId，跳過載入歷史版本')
        return
      }
      
      this.loadingHistoricalVersions = true
      try {
        console.log('載入歷史版本...', { projectId: this.projectId, stageId: this.stageId })
        
        // 使用新的專用API獲取歷史版本（只要withdrawn狀態，且只要我們組的）
        const response = await this.$apiClient.getSubmissionVersions(
          this.projectId,
          this.stageId,
          {
            groupId: this.currentGroup?.groupId,
            includeWithdrawn: true,
            includeActive: false  // 只要已撤回的版本
          }
        )
        
        if (response.success) {
          // 新API返回的結構：{ versions: [...], metadata: {...} }
          console.log('🔍 SubmitReportModal getSubmissionVersions API 響應:', {
            success: response.success,
            versionsCount: response.data?.versions?.length || 0,
            metadata: response.data?.metadata,
            currentGroupId: this.currentGroup?.groupId
          })
          
          // 新API已經過濾，直接使用返回的versions
          this.historicalVersions = response.data?.versions || []
          
          console.log('📊 歷史版本資料:', this.historicalVersions.map(v => ({
            submissionId: v.submissionId,
            status: v.status,
            groupId: v.groupId,
            submitter: v.submitter,
            submittedTime: v.submittedTime
          })))
          
          // 新API已經過濾並排序，不需要额外的築選和排序
          
          console.log('✅ 載入到的歷史版本:', this.historicalVersions.length, '個',
                     `（組: ${this.currentGroup?.groupId}, withdrawn版本）`)
        } else {
          console.error('❌ 載入歷史版本失敗:', response.error)
          this.historicalVersions = []
        }
      } catch (error) {
        console.error('載入歷史版本時發生錯誤:', error)
        this.historicalVersions = []
      } finally {
        this.loadingHistoricalVersions = false
      }
    },
    
    async handleHistoricalVersionChange(versionId) {
      if (!versionId) {
        console.log('清除歷史版本選擇')
        return
      }
      
      try {
        console.log('選擇歷史版本:', versionId)
        
        // 從歷史版本列表中找到選中的版本
        const selectedVersion = this.historicalVersions.find(v => v.submissionId === versionId)
        if (!selectedVersion) {
          console.error('找不到選中的歷史版本:', versionId)
          return
        }
        
        // 填入歷史版本的內容
        this.content = selectedVersion.content || ''
        console.log('填入歷史版本內容，長度:', this.content.length)
        
        // Debug: 檢查歷史版本的完整數據
        console.log('🔍 完整歷史版本數據:', {
          submissionId: selectedVersion.submissionId,
          content: selectedVersion.content?.substring(0, 50) + '...',
          participationProposal: selectedVersion.participationProposal,
          actualAuthors: selectedVersion.actualAuthors,
          groupMembers: this.groupMembers.map(m => ({ email: m.email, displayName: m.displayName }))
        })
        
        // 填入歷史版本的參與度分配數據
        if (selectedVersion.participationProposal && Object.keys(selectedVersion.participationProposal).length > 0) {
          console.log('填入歷史版本的參與度分配:', selectedVersion.participationProposal)
          
          // 重置所有成員的選中狀態和貢獻度
          this.groupMembers.forEach(member => {
            member.selected = false
            member.contribution = 0
          })
          
          // 根據歷史版本的參與度設定成員狀態
          Object.entries(selectedVersion.participationProposal).forEach(([email, ratio]) => {
            const member = this.groupMembers.find(m => m.email === email)
            if (member) {
              member.selected = true
              member.contribution = Math.round(ratio * 100)
              console.log(`設定成員 ${member.displayName}: ${member.contribution}%`)
            }
          })
          
          // 重新渲染圖表
          this.$nextTick(() => {
            this.renderChart()
          })
        }
        
        // 顯示成功提示
        const { ElMessage } = await import('element-plus')
        ElMessage.success(`已載入 ${this.getSubmitterName(selectedVersion.submitter)} 在 ${this.formatVersionTime(selectedVersion.submittedTime)} 的版本內容`)
        
      } catch (error) {
        console.error('載入歷史版本時發生錯誤:', error)
        const { ElMessage } = await import('element-plus')
        ElMessage.error('載入歷史版本失敗')
      }
    },
    
    resetHistoricalVersions() {
      this.historicalVersions = []
      this.selectedHistoricalVersion = ''
      this.loadingHistoricalVersions = false
    },
    
    formatVersionTime(timestamp) {
      if (!timestamp) return '未知時間'
      const date = new Date(timestamp)
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    },
    
    getSubmitterName(submitterEmail) {
      if (!submitterEmail) return '未知用戶'
      
      // 嘗試從群組成員中找到對應的用戶
      const member = this.groupMembers.find(m => m.email === submitterEmail)
      if (member) {
        return member.displayName
      }
      
      // 如果沒找到，返回email的前綴
      return submitterEmail.includes('@') ? submitterEmail.split('@')[0] : submitterEmail
    }
  }
}
</script>

<style scoped>
.submit-report-modal {
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

.breadcrumb-section :deep(.el-breadcrumb) {
  font-size: 14px;
}

.breadcrumb-section :deep(.el-breadcrumb__item) {
  color: #7f8c8d;
}

.breadcrumb-section :deep(.el-breadcrumb__item:last-child) {
  color: #2c3e50;
  font-weight: 500;
}

.validation-alert {
  margin: 15px 25px;
}

.validation-alert :deep(.el-alert__content) {
  font-size: 14px;
}

.reward-info {
  padding: 20px 25px;
  display: flex;
  align-items: center;
  gap: 15px;
  border-bottom: 1px solid #e1e8ed;
}

.reward-label {
  background: #2c3e50;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.reward-amount {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

/* 參考歷史版本區域 */
.version-selector-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  background: #fafbfc;
}

.version-selector-section .section-header {
  margin-bottom: 15px;
}

.version-selector-section .section-label {
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.version-loading {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #d0d7de;
  border-radius: 8px;
  background: #f6f8fa;
}

.loading-placeholder {
  color: #656d76;
  font-size: 14px;
}

.version-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-selector {
  width: 100%;
}

.version-selector :deep(.el-select__wrapper) {
  border: 2px solid #d0d7de;
  border-radius: 8px;
  padding: 8px 12px;
  transition: border-color 0.2s;
}

.version-selector :deep(.el-select__wrapper:hover) {
  border-color: #8b949e;
}

.version-selector :deep(.el-select__wrapper.is-focused) {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.12);
}

.version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.version-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.version-tag.withdrawn {
  background: #fff1f0;
  color: #d73a49;
  border: 1px solid #fdb8c0;
}

.version-info {
  background: #e7f3ff;
  border: 1px solid #b6e3ff;
  border-radius: 8px;
  padding: 12px;
  color: #0969da;
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.5;
}

.version-info i {
  margin-top: 2px;
  flex-shrink: 0;
}

.editor-section {
  padding: 0 25px 20px;
}

.editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 15px 0;
  border-bottom: 1px solid #e1e8ed;
  margin-bottom: 15px;
}

.tool-btn {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
  transition: all 0.2s;
  min-width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.tool-btn:active {
  transform: translateY(0);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e1e8ed;
  margin: 0 8px;
}

.preview-btn.active {
  background: #3498db;
  color: white;
  border-color: #3498db;
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-preview {
  flex: 1;
  padding: 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  background: #f8f9fa;
  overflow-y: auto;
  min-height: 200px;
}

.preview-content {
  line-height: 1.6;
  color: #2c3e50;
}

.preview-content :deep(h1),
.preview-content :deep(h2),
.preview-content :deep(h3) {
  margin: 20px 0 10px 0;
  font-weight: 600;
}

.preview-content :deep(h1) {
  font-size: 24px;
  color: #2c3e50;
}

.preview-content :deep(h2) {
  font-size: 20px;
  color: #34495e;
}

.preview-content :deep(h3) {
  font-size: 16px;
  color: #34495e;
}

.preview-content :deep(p) {
  margin: 10px 0;
}

.preview-content :deep(code) {
  background: #f1f2f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.preview-content :deep(pre) {
  background: #2c3e50;
  color: #fff;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 15px 0;
}

.preview-content :deep(pre code) {
  background: none;
  padding: 0;
  color: #fff;
}

.preview-content :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(strong) {
  font-weight: 600;
  color: #2c3e50;
}

.preview-content :deep(em) {
  font-style: italic;
  color: #7f8c8d;
}

.markdown-editor {
  width: 100%;
  min-height: 200px;
  padding: 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.3s;
}

.markdown-editor:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.markdown-editor::placeholder {
  color: #7f8c8d;
}

.target-group-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.participants-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.btn-equal-split {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
}

.btn-equal-split:hover {
  background: #138496;
  transform: translateY(-1px);
}

.rank-simulation {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-simulation label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
}

.rank-selector {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  background: white;
  color: #2c3e50;
  cursor: pointer;
}

.rank-selector:focus {
  outline: none;
  border-color: #3498db;
}

.section-label {
  display: flex;
  align-items: center;
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  width: fit-content;
}

.section-label i {
  margin-right: 8px;
}

.total-percentage {
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.total-percentage.valid {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.total-percentage.invalid {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.participants-list {
  margin-bottom: 20px;
}

.participant-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  margin-bottom: 10px;
  background: white;
}

.participant-info {
  display: flex;
  align-items: center;
  flex: 1;
}

.participant-info .el-checkbox {
  margin-right: 10px;
}

.submitter-tag {
  background: #3498db;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 10px;
}

.contribution-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 300px;
}

.contribution-controls .el-slider {
  flex: 1;
}

.contribution-controls .el-input-number {
  width: 80px;
}

.percentage-sign {
  color: #666;
  font-weight: 500;
}

.contribution-chart {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 15px;
  margin-top: 15px;
}

.contribution-chart svg {
  width: 100%;
  height: auto;
}

.chart-description {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border-left: 4px solid #f39c12;
}

.chart-description span {
  font-size: 13px;
  color: #2c3e50;
  font-weight: 500;
}

.chart-note {
  margin-bottom: 10px;
  padding: 8px 12px;
  background: #e3f2fd;
  border-radius: 4px;
  font-size: 12px;
  color: #1976d2;
  border-left: 3px solid #2196f3;
}

.group-selector {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2c3e50;
  transition: border-color 0.3s;
}

.group-selector:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.modal-actions {
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  border-top: 1px solid #e1e8ed;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 100px;
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
  .modal-content {
    width: 100%;
    max-height: 90vh;
  }
  
  .editor-toolbar {
    flex-wrap: wrap;
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .reward-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
</style>