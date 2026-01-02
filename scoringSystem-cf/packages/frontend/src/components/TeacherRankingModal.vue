<template>
  <el-drawer
    v-model="isDrawerVisible"
    direction="btt"
    size="100%"
    :close-on-click-modal="true"
    :show-close="true"
    :before-close="handleClose"
    class="teacher-ranking-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-chalkboard-teacher"></i>
          教師排名投票
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body" v-loading="loading" element-loading-text="載入教師排名資料中...">
      <!-- DrawerAlertZone for unified alerts -->
      <DrawerAlertZone />

      <!-- 版本時間軸 -->
      <VersionTimeline
        v-if="rankingVersions.length > 0"
        :versions="rankingVersions"
        :current-version-id="selectedVersionId"
        :format-title-fn="formatVersionTitle"
        :format-description-fn="formatVersionDescription"
        @version-change="handleVersionChange"
      />

      <!-- 教師排名區域 -->
      <div class="ranking-section">
        <!-- 單列顯示（最新版本或編輯模式） -->
        <div v-if="!isViewingOldVersion">
          <h3>請為各組排名</h3>
          <div class="ranking-description">
            拖拽下方組別來調整排名順序,或使用上下箭頭調整。第1名為最佳表現組別。
          </div>

          <!-- 使用 DraggableRankingList 組件 -->
          <DraggableRankingList
            :items="teacherRankings"
            item-key="groupId"
            item-label="groupName"
            :disabled="submitting"
            :show-actions="true"
            @update:items="updateRankings"
          >
            <template #default="{ item, index }: { item: any; index: number }">
              <div class="group-info">
                <div class="group-name">{{ item.groupName }}</div>
                <div class="group-description">{{ item.description || '無描述' }}</div>
              </div>
            </template>
          </DraggableRankingList>
        </div>

        <!-- 雙列對比顯示（歷史版本對比） -->
        <div v-else>
          <h3>版本對比</h3>
          <div class="ranking-description">
            對比最新版本與選定的歷史版本
          </div>

          <RankingComparison
            left-title="最新版本"
            right-title="歷史版本"
            :left-items="latestRankings"
            :right-items="selectedVersionRankings"
            item-key="groupId"
            item-label="groupName"
          />
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          v-if="!isViewingOldVersion"
          type="primary"
          @click="submitTeacherRanking"
          :disabled="teacherRankings.length === 0"
          :loading="submitting"
        >
          <i v-if="!submitting" class="fas fa-save"></i>
          提交教師排名
        </el-button>
        <el-button
          v-if="isViewingOldVersion"
          type="info"
          @click="backToLatest"
        >
          <i class="fas fa-arrow-left"></i>
          返回最新版本
        </el-button>
        <el-button @click="() => handleClose()" :disabled="submitting">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import VersionTimeline from './common/VersionTimeline.vue'
import RankingComparison from './common/RankingComparison.vue'
import DraggableRankingList from './common/DraggableRankingList.vue'
import DrawerAlertZone from './common/DrawerAlertZone.vue'
import { rpcClient } from '@/utils/rpc-client'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// Drawer Alerts
const { info, clearAlerts } = useDrawerAlerts()

// ==================== 接口定義 ====================

interface StageGroup {
  groupId?: string
  id?: string
  groupName?: string
  name?: string
  description?: string
}

interface RankingItem {
  groupId: string
  groupName: string
  description: string
  rank: number
}

interface RankingData {
  groupId: string
  rank: number
}

interface Version {
  versionId: string
  rankings: RankingData[]
  createdTime: number
  teacherDisplayName?: string
  teacherEmail?: string
}

// ==================== Props & Emits ====================

interface Props {
  visible: boolean
  projectId: string
  stageId: string
  projectTitle?: string
  stageTitle?: string
  stageGroups?: StageGroup[]
}

const props = withDefaults(defineProps<Props>(), {
  projectTitle: '',
  stageTitle: '',
  stageGroups: () => []
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'ranking-submitted': [data: any]
}>()

// ==================== 狀態管理 ====================

const loading = ref<boolean>(false)
const submitting = ref<boolean>(false)
const teacherRankings = ref<RankingItem[]>([])
const rankingVersions = ref<Version[]>([])
const selectedVersionId = ref<string>('')
const latestRankings = ref<RankingItem[]>([])
const draggedIndex = ref<number | null>(null)

// ==================== 計算屬性 ====================

const isDrawerVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

// 是否正在查看歷史版本
const isViewingOldVersion = computed<boolean>(() => {
  if (rankingVersions.value.length === 0) return false
  if (!selectedVersionId.value) return false

  // 最新版本是數組的最後一個元素
  const latestVersion = rankingVersions.value[rankingVersions.value.length - 1]
  return selectedVersionId.value !== latestVersion.versionId
})

// 當前選中版本的排名
const selectedVersionRankings = computed<RankingItem[]>(() => {
  if (!selectedVersionId.value || rankingVersions.value.length === 0) {
    return []
  }

  const version = rankingVersions.value.find(v => v.versionId === selectedVersionId.value)
  if (!version) return []

  // 將排名數據轉換為帶組別信息的格式
  return version.rankings.map(ranking => {
    const group = props.stageGroups.find(g => (g.groupId || g.id) === ranking.groupId)
    return {
      groupId: ranking.groupId,
      groupName: group ? (group.groupName || group.name || `組別${ranking.groupId}`) : `組別${ranking.groupId}`,
      description: group ? (group.description || '') : '',
      rank: ranking.rank
    }
  })
})

// 當前步驟索引（用於時間軸高亮）
const currentStepIndex = computed<number>(() => {
  if (!selectedVersionId.value || rankingVersions.value.length === 0) {
    return 0
  }
  const index = rankingVersions.value.findIndex(v => v.versionId === selectedVersionId.value)
  return index >= 0 ? index : 0
})

// ==================== 方法定義 ====================

const handleClose = (done?: () => void): void => {
  if (!submitting.value) {
    resetData()

    if (typeof done === 'function') {
      done()
    } else {
      emit('update:visible', false)
    }
  }
}

const resetData = (): void => {
  teacherRankings.value = []
  rankingVersions.value = []
  selectedVersionId.value = ''
  latestRankings.value = []
  draggedIndex.value = null
  submitting.value = false
}

const initializeRankings = (): void => {
  // 初始化排名：將所有組別按照原始順序排列
  teacherRankings.value = props.stageGroups.map((group, index) => ({
    groupId: group.groupId || group.id || '',
    groupName: group.groupName || group.name || '',
    description: group.description || '',
    rank: index + 1
  }))
}

const loadVersionHistory = async (): Promise<void> => {
  try {
    loading.value = true
    const httpResponse = await (rpcClient.api.rankings as any)['teacher-vote-history'].$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankingType: 'submission' // 排名類型：submission
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      rankingVersions.value = response.data.versions || []

      // 如果有版本,設置為最新版本
      if (rankingVersions.value.length > 0) {
        const latestVersion = rankingVersions.value[rankingVersions.value.length - 1]
        selectedVersionId.value = latestVersion.versionId

        // 載入最新版本的排名數據到編輯區域
        loadVersionRankings(latestVersion)

        // 保存最新版本的排名用於對比
        latestRankings.value = [...teacherRankings.value]
      }
    } else {
      console.error('載入版本歷史失敗:', response.error?.message)
    }
  } catch (error) {
    console.error('載入版本歷史失敗:', error)
    ElMessage.error('載入版本歷史失敗')
  } finally {
    loading.value = false
  }
}

const loadVersionRankings = (version: Version): void => {
  // 將版本中的排名數據轉換為可編輯的格式
  teacherRankings.value = version.rankings.map(ranking => {
    const group = props.stageGroups.find(g => (g.groupId || g.id) === ranking.groupId)
    return {
      groupId: ranking.groupId,
      groupName: group ? (group.groupName || group.name || `組別${ranking.groupId}`) : `組別${ranking.groupId}`,
      description: group ? (group.description || '') : '',
      rank: ranking.rank
    }
  })
}

const handleVersionChange = (versionId: string): void => {
  selectedVersionId.value = versionId

  // 如果選擇的是最新版本,返回編輯模式
  if (!isViewingOldVersion.value) {
    const latestVersion = rankingVersions.value[rankingVersions.value.length - 1]
    loadVersionRankings(latestVersion)
  }
}

const backToLatest = (): void => {
  if (rankingVersions.value.length > 0) {
    const latestVersion = rankingVersions.value[rankingVersions.value.length - 1]
    selectedVersionId.value = latestVersion.versionId
    loadVersionRankings(latestVersion)
  }
}

const submitTeacherRanking = async (): Promise<void> => {
  try {
    submitting.value = true

    // 準備排名資料
    const rankings = teacherRankings.value.map((group, index) => ({
      groupId: group.groupId,
      rank: index + 1
    }))

    const httpResponse = await (rpcClient.api.rankings as any).submit.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        rankings: rankings
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('教師排名提交成功！')

      // 重新載入版本歷史
      await loadVersionHistory()

      // 通知父組件
      emit('ranking-submitted', response.data)

      // 關閉彈窗
      handleClose()
    } else {
      ElMessage.error('提交失敗：' + (response.error?.message || '未知錯誤'))
    }
  } catch (error) {
    console.error('提交教師排名失敗:', error)
    ElMessage.error('提交失敗')
  } finally {
    submitting.value = false
  }
}

const updateRankings = (newRankings: RankingItem[]): void => {
  teacherRankings.value = newRankings
}

const formatVersionTitle = (version: Version, index: number): string => {
  // 最後一個版本顯示「最新版本」
  if (index === rankingVersions.value.length - 1) {
    return '最新版本'
  }

  // 其他版本顯示日期時間
  const date = new Date(version.createdTime)
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatVersionDescription = (version: Version): string => {
  return `提交者：${version.teacherDisplayName || version.teacherEmail || '未知'}`
}

const formatDateTime = (timestamp: number | string): string => {
  if (!timestamp) return ''
  const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp))
  return date.toLocaleString('zh-TW')
}

// ==================== 監聽器 ====================

watch(() => props.visible, (newVal) => {
  if (newVal) {
    clearAlerts()
    info('您具有總PM權限，可以為此階段的各組提交教師排名，此排名將作為最終評分的重要依據', '教師權限')
    initializeRankings()
    loadVersionHistory()
  } else {
    clearAlerts()
    resetData()
  }
})
</script>

<style scoped>
/* Drawer 自定義樣式 */
.teacher-ranking-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 0;
}

.drawer-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 24px;
  width: 100%;
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.drawer-body {
  height: 100%;
  overflow-y: auto;
  padding: 0;
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

/* 排名項目樣式（用於對比視圖） */
.ranking-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  transition: all 0.2s;
  margin-bottom: 10px;
}

.ranking-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.rank-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
}

.group-info {
  flex: 1;
}

.group-name {
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 4px;
  font-size: 14px;
}

.group-description {
  color: #718096;
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e0e6ed;
  background-color: #f8fafc;
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

.btn-info {
  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
  color: white;
}

.btn-info:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.4);
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

/* 響應式設計 */
@media (max-width: 768px) {
  .ranking-section {
    padding: 16px;
  }

  .breadcrumb-section {
    padding: 12px 16px;
  }

  .pm-info {
    margin: 16px;
  }

  .modal-actions {
    padding: 16px;
  }
}
</style>
