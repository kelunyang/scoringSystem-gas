<template>
  <div class="project-card">
    <div class="project-top-row">
      <div class="project-title">{{ project.title }}</div>
      <div class="project-status">
        <div class="status-dot" :class="timeRemaining.colorClass"></div>
        <span class="status-text" :class="timeRemaining.colorClass">{{ statusDisplayText }}</span>
      </div>
    </div>

    <div class="project-description" v-html="renderedDescription"></div>

    <!-- 階段進度顯示：前一個、當前（反白）、下一個 -->
    <div class="stage-progress">
      <!-- 開始標記：當第一個顯示的階段是專案第一個階段時 -->
      <template v-if="shouldShowStartMarker">
        <div class="stage-marker start-marker">開始</div>
        <i class="fas fa-chevron-right stage-arrow"></i>
      </template>
      
      <template v-for="(stage, index) in displayStages" :key="stage.stageId || index">
        <div 
          class="stage-item"
          :class="{ 
            active: isStageActive(stage),
            completed: isStageCompleted(stage),
            pending: isStagePending(stage),
            voting: isStageVoting(stage),
            'multiple-active': stageDisplay.hasMultipleActiveStages && isStageActive(stage)
          }"
        >
          {{ stage.stageName || stage.stageTitle || `階段${stage.stageOrder || index + 1}` }}
        </div>
        <i 
          v-if="index < displayStages.length - 1 || shouldShowEndMarker"
          class="fas fa-chevron-right stage-arrow"
        ></i>
      </template>
      
      <!-- 結束標記：當最後一個顯示的階段是專案最後一個階段時 -->
      <template v-if="shouldShowEndMarker">
        <div class="stage-marker end-marker">結束</div>
      </template>
    </div>

    <div class="project-actions">
      <button class="enter-project-btn" @click="$emit('enter-project', project)">
        進入本專案
      </button>
      <button
        class="event-log-btn"
        @click="$emit('view-event-logs', project)"
        title="查看事件日誌"
      >
        <i class="fas fa-history"></i> 事件日誌
      </button>
      <button
        v-if="project.isLeader && canManageMembers"
        class="manage-members-btn"
        @click="$emit('manage-group-members', project)"
        title="管理群組成員"
      >
        <i class="fas fa-users-cog"></i> 管理成員
      </button>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { calculateStageStatus, getProjectStageDisplay, getStageTimeRemaining } from '@/utils/stageStatus.js'

export default {
  name: 'ProjectCard',
  props: {
    project: {
      type: Object,
      required: true
    }
  },
  emits: ['enter-project', 'manage-group-members', 'view-event-logs'],
  setup(props) {
    // Parse markdown function (same as MarkdownEditor)
    const parseMarkdown = (text) => {
      if (!text) return ''

      // 安全的markdown解析，只支援特定標籤
      let html = text
        // 底線 (必須在斜體之前處理)
        .replace(/<u>(.*?)<\/u>/gim, '<u>$1</u>')

        // 粗體
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')

        // 斜體
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')

        // 連結
        .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>')

        // 圖片
        .replace(/!\[([^\]]*)\]\(([^\)]*)\)/gim, '<img src="$2" alt="$1" style="max-width: 100%;">')

        // 無序列表
        .replace(/^\* (.+)$/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

        // 有序列表
        .replace(/^\d+\. (.+)$/gim, '<li>$1</li>')

        // 段落
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>')

      return `<p>${html}</p>`
    }

    // 獲取專案階段顯示資訊
    const stageDisplay = computed(() => {
      return getProjectStageDisplay(props.project.stages || [])
    })

    // Rendered markdown description
    const renderedDescription = computed(() => {
      return parseMarkdown(props.project.description || '')
    })
    
    // 顯示的階段列表（前一個、當前、下一個）
    const displayStages = computed(() => {
      return stageDisplay.value.displayStages
    })
    
    // 當前階段的剩餘時間
    const timeRemaining = computed(() => {
      const activeStages = stageDisplay.value.activeStages
      
      if (activeStages.length === 0) {
        return { text: '尚未開始', timeLeft: 0, percentage: 100, colorClass: 'info' }
      }
      
      if (activeStages.length === 1) {
        // 單個進行中階段
        return getStageTimeRemaining(activeStages[0])
      } else {
        // 多個進行中階段，使用最緊急的時間
        const timeRemainingList = activeStages.map(stage => getStageTimeRemaining(stage))
        
        // 找到最緊急的（剩餘時間最少的）
        const mostUrgent = timeRemainingList.reduce((min, current) => 
          current.timeLeft < min.timeLeft ? current : min
        )
        
        return mostUrgent
      }
    })
    
    // 計算投票中的階段
    const votingStages = computed(() => {
      if (!props.project.stages) return []
      return props.project.stages.filter(stage => {
        const status = calculateStageStatus(stage)
        return status === 'voting'
      })
    })
    
    // 狀態顯示文字
    const statusDisplayText = computed(() => {
      const activeStages = stageDisplay.value.activeStages
      const votingStagesCount = votingStages.value.length
      
      // 優先顯示投票中階段信息
      if (votingStagesCount > 0) {
        const stageText = votingStagesCount === 1 ? '階段' : '階段'
        return `有${votingStagesCount}個${stageText}開始投票`
      }
      
      if (activeStages.length === 0) {
        return '尚未開始'
      }
      
      if (activeStages.length === 1) {
        // 只有一個進行中階段
        const currentStage = activeStages[0]
        const stageName = currentStage.stageName || currentStage.stageTitle || `階段${currentStage.stageOrder || 1}`
        if (timeRemaining.value.timeLeft <= 0) {
          return `${stageName} 已截止`
        }
        return `${stageName} 剩餘${timeRemaining.value.text}`
      } else {
        // 多個進行中階段
        const stageNames = activeStages.map(stage => 
          stage.stageName || stage.stageTitle || `階段${stage.stageOrder || 1}`
        )
        const stageRange = stageNames.length > 1 
          ? `${stageNames[0]}等${stageNames.length}個階段`
          : stageNames[0]
        
        // 使用最緊急的截止時間
        const earliestEndTime = Math.min(...activeStages.map(stage => {
          const endDate = typeof stage.endDate === 'string' 
            ? new Date(stage.endDate).getTime() 
            : stage.endDate
          return endDate
        }))
        
        const now = Date.now()
        const timeLeft = earliestEndTime - now
        
        if (timeLeft <= 0) {
          return `${stageRange} 已截止`
        }
        
        // 計算最緊急的剩餘時間
        const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000))
        const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
        
        let timeText = ''
        if (days > 0) {
          timeText = `${days}天${hours}小時`
        } else if (hours > 0) {
          timeText = `${hours}小時${minutes}分鐘`
        } else {
          timeText = `${minutes}分鐘`
        }
        
        return `${stageRange} 剩餘${timeText}`
      }
    })
    
    // 判斷階段是否正在進行中
    const isStageActive = (stage) => {
      return stageDisplay.value.activeStages.some(activeStage => 
        activeStage.stageId === stage.stageId
      )
    }
    
    // 判斷階段是否已完成
    const isStageCompleted = (stage) => {
      const status = calculateStageStatus(stage)
      return status === 'completed' || status === 'archived'
    }
    
    // 判斷階段是否尚未開始
    const isStagePending = (stage) => {
      const status = calculateStageStatus(stage)
      return status === 'pending'
    }
    
    // 判斷階段是否正在投票中
    const isStageVoting = (stage) => {
      const status = calculateStageStatus(stage)
      return status === 'voting'
    }
    
    // 判斷是否顯示開始標記（只針對當前階段）
    const shouldShowStartMarker = computed(() => {
      if (!props.project.stages || stageDisplay.value.activeStages.length === 0) return false
      
      // 取得所有階段按順序排列
      const allStages = [...props.project.stages].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
      if (allStages.length === 0) return false
      
      // 檢查當前階段是否是專案的第一個階段
      const currentStage = stageDisplay.value.currentStage
      const firstProjectStage = allStages[0]
      
      return currentStage && currentStage.stageId === firstProjectStage.stageId
    })
    
    // 判斷是否顯示結束標記
    const shouldShowEndMarker = computed(() => {
      if (!props.project.stages) return false
      
      // 取得所有階段按順序排列
      const allStages = [...props.project.stages].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
      if (allStages.length === 0) return false
      
      const lastProjectStage = allStages[allStages.length - 1]
      const displayStagesList = stageDisplay.value.displayStages || []
      
      // 檢查顯示的階段列表中是否包含專案的最後一個階段
      // 如果包含，就應該顯示結束標記
      return displayStagesList.some(stage => stage.stageId === lastProjectStage.stageId)
    })
    
    // 檢查是否可以管理成員（基於群組的allowChange設置）
    const canManageMembers = computed(() => {
      if (!props.project.isLeader) return false
      
      // 找到用戶為組長的群組
      const leaderGroup = props.project.userGroups?.find(g => g.role === 'leader')
      if (!leaderGroup) return false
      
      // 檢查群組的allowChange設置（如果沒有設置則默認為true）
      return leaderGroup.allowChange !== false
    })
    
    return {
      stageDisplay,
      displayStages,
      timeRemaining,
      statusDisplayText,
      votingStages,
      renderedDescription,
      isStageActive,
      isStageCompleted,
      isStagePending,
      isStageVoting,
      shouldShowStartMarker,
      shouldShowEndMarker,
      canManageMembers
    }
  }
}
</script>

<style scoped>
.project-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.project-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.project-title {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
  text-align: left;
}

.project-description {
  color: #7f8c8d;
  line-height: 1.5;
  margin-bottom: 20px;
}

/* Markdown rendering styles */
.project-description :deep(strong) {
  font-weight: 600;
  color: #2c3e50;
}

.project-description :deep(em) {
  font-style: italic;
}

.project-description :deep(u) {
  text-decoration: underline;
}

.project-description :deep(ul),
.project-description :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.project-description :deep(li) {
  margin: 4px 0;
}

.project-description :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.project-description :deep(a:hover) {
  text-decoration: underline;
}

.project-description :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border-radius: 4px;
}

.project-description :deep(p) {
  margin: 0;
}

.project-description :deep(br) {
  line-height: 1.5;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #67c23a; /* 預設綠色 */
}

.status-text {
  color: #67c23a; /* 預設綠色 */
  font-size: 14px;
  font-weight: 500;
}

/* 根據剩餘時間變化的顏色 - 直接應用到元素 */
.status-dot.success {
  background: #67c23a; /* 綠色 - 充足時間 */
}

.status-text.success {
  color: #67c23a;
}

.status-dot.warning {
  background: #e6a23c; /* 橙色 - 時間緊迫 */
}

.status-text.warning {
  color: #e6a23c;
}

.status-dot.danger {
  background: #f56c6c; /* 紅色 - 非常緊迫或已截止 */
}

.status-text.danger {
  color: #f56c6c;
}

.status-dot.info {
  background: #909399; /* 灰色 - 尚未開始 */
}

.status-text.info {
  color: #909399;
}

.stage-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.stage-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #e1e8ed;
  border-radius: 4px;
  background: #f8f9fa;
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
}

.stage-item.pending {
  background: #ffc107;
  border-color: #ffc107;
  color: white;
  font-weight: bold;
}

.stage-item.active {
  background: #28a745;
  border-color: #28a745;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
  transform: scale(1.05);
}

.stage-item.voting {
  background: #dc3545;
  border-color: #dc3545;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
  transform: scale(1.05);
}

.stage-item.completed {
  background: #6c757d;
  border-color: #6c757d;
  color: white;
  font-weight: bold;
}

/* 多個進行中階段的特殊樣式 */
.stage-item.multiple-active {
  background: linear-gradient(45deg, #28a745, #218838);
  border-color: #218838;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.4);
  position: relative;
}

.stage-item.multiple-active::before {
  content: "●";
  position: absolute;
  top: -2px;
  right: -2px;
  background: #e74c3c;
  color: white;
  border-radius: 50%;
  width: 8px;
  height: 8px;
  font-size: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-arrow {
  color: #3498db;
  font-size: 16px;
}

.stage-marker {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #bdc3c7;
  border-radius: 4px;
  background: #ffffff;
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
  font-weight: 500;
}

.stage-marker.start-marker {
  background: #f8f9fa;
  border-color: #dee2e6;
  color: #6c757d;
}

.stage-marker.end-marker {
  background: #f8f9fa;
  border-color: #dee2e6;
  color: #6c757d;
}

.project-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.enter-project-btn {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: background-color 0.3s;
}

.enter-project-btn:hover {
  background: #34495e;
}

.event-log-btn {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-log-btn:hover {
  background: #138496;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(23, 162, 184, 0.3);
}

.event-log-btn i {
  font-size: 14px;
}

.manage-members-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.manage-members-btn:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.manage-members-btn i {
  font-size: 14px;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .stage-progress {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .stage-item {
    margin-bottom: 5px;
  }
  
  .stage-arrow {
    transform: rotate(90deg);
  }
}
</style>