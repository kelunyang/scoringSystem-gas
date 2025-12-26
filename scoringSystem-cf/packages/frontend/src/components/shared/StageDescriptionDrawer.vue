<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-info-circle"></i>
          階段說明
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body">
      <DrawerAlertZone />

      <!-- Stage Title Section -->
      <div class="stage-title-section">
        <h2 class="stage-name">{{ stageName }}</h2>
        <span v-if="stageStatus" class="status-badge" :class="`status-${stageStatus}`">
          {{ statusText }}
        </span>
      </div>

      <!-- Stage Rewards Section -->
      <div v-if="reportReward !== undefined || commentReward !== undefined" class="stage-rewards-section">
        <div class="reward-item" v-if="reportReward !== undefined">
          <span class="reward-label">
            <i class="fas fa-file-alt"></i> 報告獎金
          </span>
          <span class="reward-value">{{ reportReward }}</span>
        </div>
        <div class="reward-item" v-if="commentReward !== undefined">
          <span class="reward-label">
            <i class="fas fa-comment-dots"></i> 評論獎金
          </span>
          <span class="reward-value">{{ commentReward }}</span>
        </div>
      </div>

      <!-- Stage Description Content -->
      <div v-if="stageDescription" class="stage-description-content">
        <MarkdownViewer :content="stageDescription" />
      </div>

      <EmptyState
        v-else
        :icons="['fa-file-alt']"
        parent-icon="fa-info-circle"
        title="此階段尚無說明內容"
        description="階段說明尚未設定"
      />

      <!-- Action Buttons -->
      <div class="drawer-actions">
        <el-button @click="localVisible = false">
          <i class="fas fa-times"></i> 關閉
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownViewer from '@/components/MarkdownViewer.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// Props
interface Props {
  visible: boolean
  stageName: string
  stageDescription?: string
  stageStatus?: string
  reportReward?: number
  commentReward?: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  stageName: '',
  stageDescription: '',
  stageStatus: ''
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// Computed
const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const statusText = computed(() => {
  const statusMap: Record<string, string> = {
    'pending': '尚未開始',
    'active': '進行中',
    'voting': '投票中',
    'settling': '結算中',
    'completed': '已完成',
    'archived': '已封存'
  }
  return statusMap[props.stageStatus] || props.stageStatus
})
</script>

<style scoped>
.stage-title-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

/* Stage Rewards Section */
.stage-rewards-section {
  display: flex;
  gap: 20px;
  padding: 16px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.stage-rewards-section .reward-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 120px;
  padding: 12px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.stage-rewards-section .reward-label {
  font-size: 13px;
  color: #7f8c8d;
  margin-bottom: 6px;
}

.stage-rewards-section .reward-label i {
  margin-right: 4px;
}

.stage-rewards-section .reward-value {
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
}

@media (max-width: 480px) {
  .stage-rewards-section {
    flex-direction: column;
    gap: 12px;
  }

  .stage-rewards-section .reward-item {
    min-width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }

  .stage-rewards-section .reward-label {
    margin-bottom: 0;
  }
}

.stage-name {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.status-badge.status-pending {
  background: #f39c12;
  color: white;
}

.status-badge.status-active {
  background: #198754;
  color: white;
}

.status-badge.status-voting {
  background: #c82333;
  color: white;
}

.status-badge.status-settling {
  background: #6c757d;
  color: white;
}

.status-badge.status-completed {
  background: #5a6268;
  color: white;
}

.status-badge.status-archived {
  background: #343a40;
  color: white;
}

.stage-description-content {
  padding: 25px;
  flex: 1;
  overflow-y: auto;
}

.stage-description-content :deep(.markdown-content) {
  line-height: 1.8;
  color: #2c3e50;
}

.stage-description-content :deep(h1),
.stage-description-content :deep(h2),
.stage-description-content :deep(h3) {
  margin: 20px 0 12px 0;
  color: #2c3e50;
  font-weight: 600;
}

.stage-description-content :deep(h1) {
  font-size: 22px;
  border-bottom: 2px solid #e1e8ed;
  padding-bottom: 10px;
}

.stage-description-content :deep(h2) {
  font-size: 18px;
  border-bottom: 1px solid #e1e8ed;
  padding-bottom: 8px;
}

.stage-description-content :deep(h3) {
  font-size: 16px;
}

.stage-description-content :deep(p) {
  margin: 12px 0;
}

.stage-description-content :deep(ul),
.stage-description-content :deep(ol) {
  margin: 12px 0;
  padding-left: 24px;
}

.stage-description-content :deep(li) {
  margin: 6px 0;
}

.stage-description-content :deep(code) {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
}

.stage-description-content :deep(pre) {
  background: #2c3e50;
  color: #fff;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 16px 0;
}

.stage-description-content :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.stage-description-content :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 20px;
  border-left: 4px solid #3498db;
  background: #f8f9fa;
  color: #666;
}

.stage-description-content :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.stage-description-content :deep(a:hover) {
  text-decoration: underline;
}
</style>
