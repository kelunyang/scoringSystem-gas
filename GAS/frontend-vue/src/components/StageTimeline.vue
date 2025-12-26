<template>
  <div class="stage-timeline">
    <div class="timeline-track">
      <!-- 時間軸線段 - 按階段狀態分段顯示 -->
      <div class="timeline-segments">
        <div 
          v-for="(segment, index) in (timelineSegments || [])" 
          :key="'segment-' + index"
          v-show="segment && segment.height > 0"
          class="timeline-segment"
          :class="`segment-${segment.status || 'pending'}`"
          :style="{ 
            height: Math.max(segment.height || 0, 5) + '%',
            top: (segment.top || 0) + '%'
          }"
          :data-segment-info="`${segment.status}: ${segment.height}% @ ${segment.top}%`"
        ></div>
      </div>
      
      <!-- 滾動位置指示器 -->
      <div 
        class="scroll-indicator"
        :style="{ top: scrollProgress + '%' }"
        :title="`滾動進度: ${Math.round(scrollProgress)}%`"
      >
        <!-- 顯示滾動百分比的小標籤 -->
        <div class="scroll-percentage">{{ Math.round(scrollProgress) }}%</div>
      </div>
      
      <!-- 起始標記 -->
      <div 
        class="timeline-marker timeline-start"
        :style="{ top: '0%' }"
        title="專案開始"
      >
        <div class="marker-dot">
          <i class="fas fa-flag"></i>
        </div>
      </div>
      
      <!-- 階段節點 -->
      <div 
        v-for="(stage, index) in (stages || [])" 
        :key="stage.id || index"
        v-show="stage && stage.id"
        class="timeline-stage"
        :class="{ 
          'active': activeStageId === stage.id,
          [`status-${stage.originalStatus || 'pending'}`]: true
        }"
        :style="{ top: getStagePosition(index) + '%' }"
        :data-stage-id="stage.id"
        @click="handleStageClick(stage.id)"
        @mouseenter="handleStageHover(stage.id, true)"
        @mouseleave="handleStageHover(stage.id, false)"
        :title="getStageTooltip(stage)"
      >
        <!-- 階段圓點 -->
        <div class="stage-dot">
          <i v-if="stage.originalStatus === 'completed' || stage.originalStatus === 'archived'" class="fas fa-check"></i>
          <i v-else-if="stage.originalStatus === 'voting'" class="fas fa-vote-yea"></i>
          <i v-else-if="stage.originalStatus === 'active'" class="fas fa-play"></i>
          <i v-else class="fas fa-clock"></i>
        </div>
        
        <!-- 階段標籤 (滑鼠懸停或滾動碰撞時顯示) -->
        <div 
          v-show="stage.id === hoveredStageId || stage.id === activeTooltipStageId" 
          class="stage-label"
          :class="{
            'tooltip-hover': stage.id === hoveredStageId,
            'tooltip-collision': stage.id === activeTooltipStageId
          }"
          :data-tooltip-trigger="stage.id === hoveredStageId ? 'hover' : 'collision'"
          :data-stage-id="stage.id"
        >
          {{ stage.shortTitle || stage.title || 'Unknown Stage' }}
          <div class="stage-status">{{ getStatusText(stage.originalStatus) }}</div>
          <!-- 碰撞指示器 -->
          <div v-if="stage.id === activeTooltipStageId" class="collision-indicator">📍</div>
        </div>
      </div>
      
      <!-- 結束標記 -->
      <div 
        class="timeline-marker timeline-end"
        :style="{ top: '100%' }"
        title="專案結束"
      >
        <div class="marker-dot">
          <i class="fas fa-flag-checkered"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useActiveScroll } from 'vue-use-active-scroll'

export default {
  name: 'StageTimeline',
  props: {
    stages: {
      type: Array,
      required: true
    },
    currentStageId: {
      type: String,
      default: null
    }
  },
  setup(props) {
    // 檢查 stages 是否存在且為陣列
    if (!props.stages || !Array.isArray(props.stages) || props.stages.length === 0) {
      return {
        setActive: () => {},
        activeStageId: null
      }
    }
    
    // 使用 vue-use-active-scroll 來追蹤活動階段
    const stageIds = props.stages.map(stage => stage.id)
    const { setActive, activeId } = useActiveScroll(stageIds, {
      offset: 100, // 偏移量，讓檢測更準確
      alwaysTrack: true // 總是追蹤滾動
    })
    
    return {
      setActive,
      activeStageId: activeId
    }
  },
  data() {
    return {
      hoveredStageId: null,
      scrollProgress: 0, // 滾動進度百分比
      scrollRafId: null,
      scrollContainer: null, // 實際的滾動容器
      activeTooltipStageId: null, // 因為滾動位置觸發的 tooltip
      lastLoggedProgress: -1 // 記錄上次日誌的進度，避免重複輸出
    }
  },
  computed: {
    // 計算時間軸線段
    timelineSegments() {
      if (!this.stages || !Array.isArray(this.stages) || this.stages.length === 0) {
        console.log('❌ No stages for timeline segments')
        return []
      }
      
      console.log('🔍 Computing timeline segments from stages:', this.stages)
      
      const segments = []
      const stageCount = this.stages.length
      let currentGroup = null
      
      for (let i = 0; i < stageCount; i++) {
        const stage = this.stages[i]
        if (!stage || !stage.originalStatus) {
          console.log(`⚠️ Stage ${i} missing or no originalStatus`)
          continue
        }
        
        const status = stage.originalStatus
        
        if (!currentGroup || currentGroup.status !== status) {
          // 開始新的狀態群組
          if (currentGroup) {
            segments.push(currentGroup)
          }
          
          currentGroup = {
            status: status,
            startIndex: i,
            endIndex: i,
            stageCount: 1
          }
        } else {
          // 延續當前狀態群組
          currentGroup.endIndex = i
          currentGroup.stageCount++
        }
      }
      
      // 添加最後一個群組
      if (currentGroup) {
        segments.push(currentGroup)
      }
      
      // 計算每個群組的位置和高度
      const calculatedSegments = segments.map(group => {
        const height = (group.stageCount * 100) / stageCount
        const top = (group.startIndex * 100) / stageCount
        
        const segment = {
          status: group.status,
          height: height,
          top: top,
          stageCount: group.stageCount
        }
        
        console.log(`📊 Segment: ${group.status}, top: ${top}%, height: ${height}%`)
        return segment
      })
      
      console.log('✅ Timeline segments calculated:', calculatedSegments)
      return calculatedSegments
    }
  },
  watch: {
    // 監聽活動階段變化
    activeStageId(newStageId) {
      if (newStageId) {
        this.$emit('stage-changed', newStageId)
      }
    }
  },
  mounted() {
    this.setupScrollListener()
    
    // 初始化滾動位置
    this.updateScrollProgress()
    
    // 如果有當前階段，設置為活動階段
    if (this.currentStageId) {
      this.setActive(this.currentStageId)
    }
    
    // Debug: 檢查階段數據
    console.log('🎯 階段時間軸載入:', {
      stagesCount: this.stages ? this.stages.length : 0,
      stages: this.stages,
      timelineSegments: this.timelineSegments
    })
    
    // Debug: 檢查每個階段
    if (this.stages && this.stages.length > 0) {
      console.log('📊 階段詳細信息:')
      this.stages.forEach((stage, index) => {
        console.log(`🔵 階段 ${index + 1}:`, {
          id: stage.id,
          title: stage.title || stage.shortTitle,
          originalStatus: stage.originalStatus,
          mappedStatus: stage.status,
          position: `${this.getStagePosition(index).toFixed(1)}%`,
          cssClass: `status-${stage.originalStatus || 'pending'}`,
          hasValidId: !!stage.id
        })
      })
      
      // Debug: 檢查 DOM 元素
      this.$nextTick(() => {
        const stageElements = document.querySelectorAll('.timeline-stage')
        console.log(`🔍 實際渲染的階段元素數量: ${stageElements.length}`)
        stageElements.forEach((el, index) => {
          const rect = el.getBoundingClientRect()
          console.log(`📍 階段元素 ${index}:`, {
            visible: rect.width > 0 && rect.height > 0,
            position: el.style.top,
            classes: Array.from(el.classList),
            zIndex: getComputedStyle(el).zIndex
          })
        })
      })
    } else {
      console.log('❌ 沒有階段數據！')
    }
    
    // 移除定時器，只依賴事件監聽
  },
  beforeUnmount() {
    // 清理所有事件監聽器
    window.removeEventListener('scroll', this.handleScroll)
    document.removeEventListener('scroll', this.handleScroll)
    window.removeEventListener('resize', this.handleScroll)
    
    // 清理滾動容器的監聽器
    const containers = [
      document.querySelector('.content-area'),
      document.querySelector('.main-content'),
      document.querySelector('.project-detail')
    ]
    
    containers.forEach(container => {
      if (container) {
        container.removeEventListener('scroll', this.handleScroll)
      }
    })
    
    // 定時器已移除
  },
  methods: {
    getStagePosition(index) {
      if (!this.stages || !Array.isArray(this.stages) || this.stages.length === 0) {
        return 50
      }
      
      const stageCount = this.stages.length
      if (stageCount === 1) return 50
      
      // 將階段放置在對應線段的中心
      const segmentHeight = 100 / stageCount
      const position = (index * segmentHeight) + (segmentHeight / 2)
      
      // Debug: 輸出階段位置 (減少頻率)
      if (!this._positionLogged || !this._positionLogged[index]) {
        this._positionLogged = this._positionLogged || {}
        this._positionLogged[index] = true
        console.log(`📍 階段 ${index} 位置: ${position.toFixed(1)}%`)
      }
      
      return position
    },
    
    getStatusText(status) {
      const statusMap = {
        'pending': '未開始',
        'active': '進行中',
        'voting': '投票中', 
        'completed': '已結束',
        'archived': '已歸檔'
      }
      return statusMap[status] || status
    },
    
    getStageTooltip(stage) {
      if (!stage) return ''
      const title = stage.shortTitle || stage.title || 'Unknown'
      const status = stage.originalStatus || 'unknown'
      return `${title} - ${this.getStatusText(status)}`
    },
    
    handleStageClick(stageId) {
      // 使用 vue-use-active-scroll 的 setActive 方法
      this.setActive(stageId)
      
      // 滾動到目標階段
      const targetElement = document.getElementById(`stage-${stageId}`)
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
      
      this.$emit('stage-clicked', stageId)
    },
    
    setupScrollListener() {
      // 找到實際的滾動容器
      this.handleScroll = () => {
        this.updateScrollProgress()
      }
      
      // 尋找可滾動的容器
      this.$nextTick(() => {
        // 嘗試找到 content-area 或 main-content 容器
        const contentArea = document.querySelector('.content-area')
        const mainContent = document.querySelector('.main-content')
        const projectDetail = document.querySelector('.project-detail')
        
        // 監聽所有可能的滾動容器
        if (contentArea) {
          contentArea.addEventListener('scroll', this.handleScroll, { passive: true })
          this.scrollContainer = contentArea
          console.log('監聽 content-area 滾動')
        }
        if (mainContent) {
          mainContent.addEventListener('scroll', this.handleScroll, { passive: true })
          console.log('監聽 main-content 滾動')
        }
        if (projectDetail) {
          projectDetail.addEventListener('scroll', this.handleScroll, { passive: true })
          console.log('監聽 project-detail 滾動')
        }
        
        // 也監聽 window 作為備用
        window.addEventListener('scroll', this.handleScroll, { passive: true })
        document.addEventListener('scroll', this.handleScroll, { passive: true })
        
        // 頁面大小變化
        window.addEventListener('resize', this.handleScroll, { passive: true })
      })
    },
    
    updateScrollProgress() {
      // 嘗試從實際的滾動容器計算
      let scrollTop = 0
      let scrollHeight = 0
      let clientHeight = 0
      
      // 優先使用儲存的滾動容器
      if (this.scrollContainer) {
        scrollTop = this.scrollContainer.scrollTop
        scrollHeight = this.scrollContainer.scrollHeight
        clientHeight = this.scrollContainer.clientHeight
      } else {
        // 嘗試找到滾動容器
        const containers = [
          document.querySelector('.content-area'),
          document.querySelector('.main-content'),
          document.querySelector('.project-detail'),
          document.documentElement
        ]
        
        for (const container of containers) {
          if (container && container.scrollHeight > container.clientHeight) {
            scrollTop = container.scrollTop || 0
            scrollHeight = container.scrollHeight
            clientHeight = container.clientHeight
            this.scrollContainer = container // 儲存找到的容器
            break
          }
        }
        
        // 如果都沒有，使用 window
        if (!scrollHeight) {
          scrollTop = window.pageYOffset || document.documentElement.scrollTop
          scrollHeight = document.documentElement.scrollHeight
          clientHeight = window.innerHeight
        }
      }
      
      // 計算滾動百分比 (0-100)
      let scrollPercentage = 0
      if (scrollHeight > clientHeight) {
        scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100
      }
      
      // 更新滾動進度，確保在 0-100 範圍內
      this.scrollProgress = Math.min(100, Math.max(0, scrollPercentage))
      
      // 檢測碰撞：紅點和階段點的距離
      this.checkScrollIndicatorCollision()
      
      // Debug: 顯示滾動資訊 (減少頻率) - 只在必要時輸出
      if (Math.floor(this.scrollProgress) !== this.lastLoggedProgress && this.scrollProgress % 10 === 0) {
        console.log(`🔄 滾動進度: ${this.scrollProgress.toFixed(1)}% (${scrollTop.toFixed(0)}/${scrollHeight - clientHeight}px)`)
        this.lastLoggedProgress = Math.floor(this.scrollProgress)
      }
    },
    
    checkScrollIndicatorCollision() {
      if (!this.stages || this.stages.length === 0) return
      
      const indicatorPosition = this.scrollProgress // 滾動指示器位置 (0-100%)
      const tolerance = 8 // 容忍範圍 ±8% (更寬鬆的碰撞檢測)
      
      // 檢查每個階段點的位置
      let closestStage = null
      let minDistance = Infinity
      
      this.stages.forEach((stage, index) => {
        const stagePosition = this.getStagePosition(index) // 階段點位置 (0-100%)
        const distance = Math.abs(indicatorPosition - stagePosition)
        
        // 找到最接近的階段
        if (distance < minDistance) {
          minDistance = distance
          closestStage = stage
        }
      })
      
      // 如果最接近的階段在容忍範圍內，顯示 tooltip
      if (closestStage && minDistance <= tolerance) {
        if (this.activeTooltipStageId !== closestStage.id) {
          console.log('🎯 碰撞檢測觸發 tooltip:', {
            stageId: closestStage.id,
            title: closestStage.shortTitle || closestStage.title,
            distance: minDistance.toFixed(1),
            indicatorPos: indicatorPosition.toFixed(1)
          })
        }
        this.activeTooltipStageId = closestStage.id
      } else {
        if (this.activeTooltipStageId) {
          console.log('🚫 碰撞檢測隱藏 tooltip')
        }
        this.activeTooltipStageId = null
      }
    },
    
    handleStageHover(stageId, isEntering) {
      console.log(`🖱️ 滑鼠${isEntering ? '進入' : '離開'}階段:`, stageId, {
        currentHovered: this.hoveredStageId,
        currentCollision: this.activeTooltipStageId,
        shouldShowTooltip: isEntering
      })
      
      if (isEntering) {
        this.hoveredStageId = stageId
      } else {
        this.hoveredStageId = null
      }
      
      // Debug: 檢查 tooltip 元素是否實際存在
      this.$nextTick(() => {
        const tooltipElements = document.querySelectorAll('.stage-label')
        console.log(`💬 目前可見的 tooltip 數量: ${tooltipElements.length}`)
        tooltipElements.forEach((el, index) => {
          const rect = el.getBoundingClientRect()
          console.log(`Tooltip ${index}:`, {
            visible: rect.width > 0 && rect.height > 0,
            trigger: el.dataset.tooltipTrigger,
            stageId: el.dataset.stageId,
            classes: Array.from(el.classList)
          })
        })
      })
    }
  }
}
</script>

<style scoped>
.stage-timeline {
  position: fixed;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  height: 60vh;
  max-height: 500px;
  min-height: 300px;
}

.timeline-track {
  position: relative;
  height: 100%;
  width: 60px;
}

.timeline-segments {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 6px; /* 加寬線條 */
  transform: translateX(-50%);
  border-radius: 3px;
  background: rgba(156, 163, 175, 0.2); /* 淺灰色背景 */
  z-index: 1; /* 線段在最底層 */
}


/* 線段顏色 - 與ProjectDetail.vue保持一致 */
.segment-pending {
  background: #ffc107; /* 黃底 - 未開始 */
  opacity: 0.8;
}

.segment-active {
  background: #28a745; /* 綠底 - 進行中 */
  box-shadow: 0 0 8px rgba(40, 167, 69, 0.5);
  opacity: 1;
}

.segment-voting {
  background: #dc3545; /* 紅底 - 投票中 */
  box-shadow: 0 0 8px rgba(220, 53, 69, 0.5);
  opacity: 1;
}

.segment-completed, .segment-archived {
  background: #6c757d; /* 灰底 - 已完成 */
  opacity: 0.9;
}

/* 確保線段可見 */
.timeline-segment {
  position: absolute;
  width: 100%;
  transition: all 0.3s ease;
  /* 加強邊框以提高可見性 */
  border: 1px solid rgba(255, 255, 255, 0.2);
  /* 最小高度確保可見 */
  min-height: 20px;
}

/* 滾動位置指示器 */
.scroll-indicator {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  background: #ef4444;
  border-radius: 50%;
  transform: translateX(-50%);
  transition: all 0.05s ease;
  z-index: 20; /* 滾動指示器在最上層 */
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.6);
}

.scroll-percentage {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(239, 68, 68, 0.9);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.timeline-stage {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  z-index: 10; /* 確保階段容器在線段之上 */
}

.timeline-stage:hover {
  transform: translateX(-50%) scale(1.1);
  z-index: 15; /* 懸停時提升層級 */
}

.stage-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  transition: all 0.3s ease;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  position: relative;
  z-index: 10; /* 階段點在線段之上 */
}

/* 階段圓點顏色 - 與ProjectDetail.vue保持一致 */
.status-pending .stage-dot {
  background: #ffc107; /* 黃底 */
  border-color: #fff;
  color: white;
  border-width: 2px;
}

.status-active .stage-dot {
  background: #28a745; /* 綠底 */
  border-color: #fff;
  color: white;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.4);
  border-width: 3px;
}

.status-voting .stage-dot {
  background: #dc3545; /* 紅底 */
  border-color: #fff;
  color: white;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.4);
  border-width: 3px;
}

.status-completed .stage-dot,
.status-archived .stage-dot {
  background: #6c757d; /* 灰底 */
  border-color: #fff;
  color: white;
  border-width: 2px;
}

/* 強化階段點的可見性 */
.timeline-stage {
  /* 確保點擊區域足夠大 */
  min-width: 26px;
  min-height: 26px;
}

.timeline-stage .stage-dot {
  /* 確保圓點在容器中居中且可見 */
  margin: auto;
  opacity: 1;
  visibility: visible;
}

/* 當前選中的階段 */
.timeline-stage.active .stage-dot {
  width: 26px;
  height: 26px;
  border-width: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.timeline-stage.active.status-active .stage-dot {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.6);
}

.timeline-stage.active.status-voting .stage-dot {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.6);
}

.stage-label {
  position: absolute;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(30, 41, 59, 0.95);
  color: white;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1);
  animation: fadeInRight 0.3s ease;
  transition: all 0.3s ease;
}

/* 懸停觸發的 tooltip */
.stage-label.tooltip-hover {
  background: rgba(59, 130, 246, 0.95);
  border-color: rgba(147, 197, 253, 0.3);
}

/* 碰撞觸發的 tooltip */
.stage-label.tooltip-collision {
  background: rgba(239, 68, 68, 0.95);
  border-color: rgba(248, 113, 113, 0.3);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.collision-indicator {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translateY(-50%) scale(1); }
  50% { transform: translateY(-50%) scale(1.2); }
}

.stage-status {
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  margin-top: 2px;
}

.stage-label::after {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 8px 8px 8px 0;
  border-color: transparent rgba(30, 41, 59, 0.95) transparent transparent;
  transition: all 0.3s ease;
}

.stage-label.tooltip-hover::after {
  border-color: transparent rgba(59, 130, 246, 0.95) transparent transparent;
}

.stage-label.tooltip-collision::after {
  border-color: transparent rgba(239, 68, 68, 0.95) transparent transparent;
}

/* 懸停效果 */
.timeline-stage:hover .stage-dot {
  transform: scale(1.2);
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

/* 響應式設計 */
@media (max-width: 1024px) {
  .stage-timeline {
    right: 20px;
    width: 50px;
  }
  
  .timeline-track {
    width: 50px;
  }
  
  .stage-label {
    right: 35px;
    font-size: 11px;
    padding: 6px 10px;
  }
}

@media (max-width: 768px) {
  .stage-timeline {
    right: 15px;
    height: 50vh;
    width: 40px;
  }
  
  .timeline-track {
    width: 40px;
  }
  
  .stage-dot {
    width: 16px;
    height: 16px;
    font-size: 8px;
  }
  
  .timeline-stage.active .stage-dot {
    width: 20px;
    height: 20px;
  }
  
  .stage-label {
    font-size: 10px;
    padding: 4px 8px;
    right: 25px;
  }
}

/* 時間軸標記樣式 */
.timeline-marker {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8; /* 在線段之上，階段點之下 */
}

.timeline-start {
  transform: translateX(-50%) translateY(-10px); /* 稍微往上偏移 */
}

.timeline-end {
  transform: translateX(-50%) translateY(-10px); /* 稍微往上偏移 */
}

.marker-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: white;
  background: #6b7280; /* 中性灰色 */
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  transition: all 0.3s ease;
}

.timeline-start .marker-dot {
  background: #10b981; /* 綠色 - 開始 */
  border-color: #d1fae5;
}

.timeline-end .marker-dot {
  background: #374151; /* 深灰色 - 結束 */
  border-color: #f3f4f6;
}

.timeline-marker:hover .marker-dot {
  transform: scale(1.1);
  box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}

/* 在小屏幕上簡化顯示 */
@media (max-width: 576px) {
  .stage-timeline {
    width: 30px;
  }
  
  .timeline-track {
    width: 30px;
  }
  
  .stage-label {
    display: none;
  }
  
  .stage-dot {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }
  
  .timeline-stage.active .stage-dot {
    width: 18px;
    height: 18px;
    border-width: 3px;
  }
  
  .marker-dot {
    width: 14px;
    height: 14px;
    font-size: 7px;
    border-width: 1px;
  }
}
</style>