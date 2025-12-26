<template>
  <div class="teacher-ranking-modal" v-if="visible" @click="handleClose">
    <div class="modal-content" @click.stop v-loading="loading" element-loading-text="載入教師排名資料中...">
      <!-- 標題欄 -->
      <div class="modal-header">
        <h2 class="modal-title">教師排名投票</h2>
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
          <el-breadcrumb-item>教師排名投票</el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- PM身份提示 -->
      <el-alert
        title="教師權限"
        type="info"
        description="您具有總PM權限，可以為此階段的各組提交教師排名，此排名將作為最終評分的重要依據"
        show-icon
        :closable="false"
        class="pm-info"
      />

      <!-- 教師排名區域 -->
      <div class="ranking-section">
        <h3>請為各組排名</h3>
        <div class="ranking-description">
          拖拽下方組別來調整排名順序，或使用上下箭頭調整。第1名為最佳表現組別。
        </div>
        
        <!-- 排名列表 -->
        <div class="ranking-list-container">
          <div class="ranking-list">
            <div 
              v-for="(group, index) in teacherRankings" 
              :key="group.groupId"
              class="ranking-item"
              :class="{ 
                dragging: draggedIndex === index
              }"
              :draggable="!submitting"
              @dragstart="handleDragStart(index, $event)"
              @dragover.prevent="handleDragOver(index)"
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
            >
              <div class="rank-number">{{ index + 1 }}</div>
              <div class="group-info">
                <div class="group-name">{{ group.groupName }}</div>
                <div class="group-description">{{ group.description || '無描述' }}</div>
              </div>
              
              <!-- 排序控制按鈕 -->
              <div class="item-actions" v-if="!submitting">
                <button 
                  class="action-btn small"
                  @click="moveUp(index)"
                  :disabled="index === 0"
                  title="上移"
                >
                  <i class="fas fa-chevron-up"></i>
                </button>
                <button 
                  class="action-btn small"
                  @click="moveDown(index)"
                  :disabled="index === teacherRankings.length - 1"
                  title="下移"
                >
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 現有教師排名顯示 -->
      <div class="existing-rankings" v-if="existingTeacherRankings.length > 0">
        <h3>現有教師排名</h3>
        <div 
          v-for="ranking in existingTeacherRankings" 
          :key="ranking.teacherRankingId"
          class="existing-ranking-item"
        >
          <div class="teacher-info">
            <div class="teacher-name">教師：{{ ranking.teacherEmail }}</div>
            <div class="ranking-time">
              {{ formatDateTime(ranking.lastModified) }}
            </div>
          </div>
          <div class="ranking-content">
            <div 
              v-for="(groupRank, index) in ranking.rankings" 
              :key="groupRank.groupId"
              class="rank-display"
            >
              第{{ index + 1 }}名：{{ getGroupName(groupRank.groupId) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="modal-actions">
        <button 
          class="btn btn-primary" 
          @click="submitTeacherRanking" 
          :disabled="submitting || teacherRankings.length === 0"
        >
          <i v-if="submitting" class="fas fa-spinner fa-spin"></i>
          {{ submitting ? '提交中...' : '提交教師排名' }}
        </button>
        <button class="btn btn-secondary" @click="handleClose" :disabled="submitting">
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TeacherRankingModal',
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
    projectTitle: {
      type: String,
      default: ''
    },
    stageTitle: {
      type: String,
      default: ''
    },
    stageGroups: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      loading: false,
      submitting: false,
      teacherRankings: [], // 當前編輯的排名
      existingTeacherRankings: [], // 現有的教師排名
      draggedIndex: null
    }
  },
  watch: {
    visible(newVal) {
      if (newVal) {
        this.initializeRankings()
        this.loadExistingRankings()
      } else {
        this.resetData()
      }
    }
  },
  methods: {
    handleClose() {
      this.$emit('update:visible', false)
    },

    resetData() {
      this.teacherRankings = []
      this.existingTeacherRankings = []
      this.draggedIndex = null
      this.submitting = false
    },

    initializeRankings() {
      // 初始化排名：將所有組別按照原始順序排列
      this.teacherRankings = this.stageGroups.map((group, index) => ({
        groupId: group.groupId || group.id,
        groupName: group.groupName || group.name,
        description: group.description || '',
        rank: index + 1
      }))
    },

    async loadExistingRankings() {
      try {
        this.loading = true
        const response = await this.$apiClient.getTeacherRankings(this.projectId, this.stageId)
        
        if (response.success) {
          this.existingTeacherRankings = response.data
        } else {
          console.error('載入教師排名失敗:', response.error?.message)
        }
      } catch (error) {
        console.error('載入教師排名失敗:', error)
        this.$message.error('載入教師排名失敗')
      } finally {
        this.loading = false
      }
    },

    async submitTeacherRanking() {
      try {
        this.submitting = true
        
        // 準備排名資料
        const rankings = this.teacherRankings.map((group, index) => ({
          groupId: group.groupId,
          rank: index + 1
        }))

        const response = await this.$apiClient.submitTeacherRanking(
          this.projectId, 
          this.stageId, 
          rankings
        )
        
        if (response.success) {
          this.$message.success('教師排名提交成功！')
          
          // 重新載入現有排名
          await this.loadExistingRankings()
          
          // 通知父組件
          this.$emit('ranking-submitted', response.data)
          
          // 關閉彈窗
          this.handleClose()
        } else {
          this.$message.error('提交失敗：' + (response.error?.message || '未知錯誤'))
        }
      } catch (error) {
        console.error('提交教師排名失敗:', error)
        this.$message.error('提交失敗')
      } finally {
        this.submitting = false
      }
    },

    // 拖拽相關方法
    handleDragStart(index, event) {
      this.draggedIndex = index
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/html', event.target)
    },

    handleDragOver(index) {
      if (this.draggedIndex !== null && this.draggedIndex !== index) {
        // 重新排序
        const draggedItem = this.teacherRankings[this.draggedIndex]
        this.teacherRankings.splice(this.draggedIndex, 1)
        this.teacherRankings.splice(index, 0, draggedItem)
        this.draggedIndex = index
      }
    },

    handleDrop(index) {
      // 拖拽完成，無需額外操作
    },

    handleDragEnd() {
      this.draggedIndex = null
    },

    // 按鈕控制排序
    moveUp(index) {
      if (index > 0) {
        const item = this.teacherRankings[index]
        this.teacherRankings.splice(index, 1)
        this.teacherRankings.splice(index - 1, 0, item)
      }
    },

    moveDown(index) {
      if (index < this.teacherRankings.length - 1) {
        const item = this.teacherRankings[index]
        this.teacherRankings.splice(index, 1)
        this.teacherRankings.splice(index + 1, 0, item)
      }
    },

    getGroupName(groupId) {
      const group = this.stageGroups.find(g => (g.groupId || g.id) === groupId)
      return group ? (group.groupName || group.name) : `組別${groupId}`
    },

    formatDateTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp))
      return date.toLocaleString('zh-TW')
    }
  }
}
</script>

<style scoped>
.teacher-ranking-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e6ed;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.breadcrumb-section {
  padding: 16px 24px;
  background-color: #f8fafc;
  border-bottom: 1px solid #e0e6ed;
}

.pm-info {
  margin: 20px 24px;
}

.ranking-section {
  padding: 20px 24px;
}

.ranking-section h3 {
  margin: 0 0 8px 0;
  color: #2d3748;
  font-size: 16px;
  font-weight: 600;
}

.ranking-description {
  color: #718096;
  margin-bottom: 20px;
  font-size: 14px;
}

.ranking-list-container {
  background: #f7fafc;
  border-radius: 8px;
  padding: 16px;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ranking-item {
  display: flex;
  align-items: center;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
  cursor: move;
}

.ranking-item:hover {
  border-color: #cbd5e0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.ranking-item.dragging {
  opacity: 0.6;
  transform: rotate(2deg);
}

.rank-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 18px;
  margin-right: 16px;
  flex-shrink: 0;
}

.group-info {
  flex: 1;
}

.group-name {
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 4px;
}

.group-description {
  color: #718096;
  font-size: 14px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  background: white;
  color: #718096;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
  background: #f7fafc;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.existing-rankings {
  padding: 20px 24px;
  border-top: 1px solid #e0e6ed;
  background-color: #f8fafc;
}

.existing-rankings h3 {
  margin: 0 0 16px 0;
  color: #2d3748;
  font-size: 16px;
  font-weight: 600;
}

.existing-ranking-item {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.teacher-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.teacher-name {
  font-weight: 600;
  color: #2d3748;
}

.ranking-time {
  color: #718096;
  font-size: 14px;
}

.ranking-content {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.rank-display {
  background: #edf2f7;
  color: #4a5568;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e0e6ed;
  background-color: #f8fafc;
  border-radius: 0 0 12px 12px;
}

.btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f7fafc;
  color: #4a5568;
  border: 1px solid #e2e8f0;
}

.btn-secondary:hover:not(:disabled) {
  background: #edf2f7;
  border-color: #cbd5e0;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>