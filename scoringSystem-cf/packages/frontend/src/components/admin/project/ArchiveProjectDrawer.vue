<template>
  <el-drawer
    :model-value="visible"
    title="封存專案"
    direction="ttb"
    size="100%"
    class="drawer-maroon"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="archiving" class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 原始專案資訊 -->
      <div class="form-section">
        <h4><i class="fas fa-info-circle"></i> 專案資訊</h4>
        <div v-if="project">
          <div class="detail-row">
            <label>專案名稱:</label>
            <span>{{ project.projectName }}</span>
          </div>
          <div class="detail-row">
            <label>專案ID:</label>
            <span class="mono">{{ project.projectId }}</span>
          </div>
          <div class="detail-row">
            <label>創建者:</label>
            <span>{{ project.createdBy }}</span>
          </div>
          <div class="detail-row">
            <label>當前狀態:</label>
            <span class="status-badge" :class="project.status">
              <i :class="getProjectStatusIcon(project.status)"></i>
              {{ getProjectStatusText(project.status) }}
            </span>
          </div>
          <div class="detail-row">
            <label>描述:</label>
            <span>{{ project.description || '無' }}</span>
          </div>
        </div>
      </div>

      <!-- 確認輸入 -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
        <ConfirmationInput
          v-model="confirmText"
          keyword="ARCHIVE"
          hint-action="封存"
          @confirm="executeArchiveProject"
        />
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          :disabled="!isArchiveFormValid || archiving"
          @click="executeArchiveProject"
        >
          <i :class="archiving ? 'fas fa-spinner fa-spin' : 'fas fa-archive'"></i>
          {{ archiving ? '封存中...' : '確定封存' }}
        </el-button>
        <el-button :disabled="archiving" @click="closeDrawer">取消</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { getProjectStatusIcon, getProjectStatusText } from '@/utils/projectStatus'

const props = defineProps<{
  visible: boolean
  project: {
    projectId: string
    projectName: string
    createdBy?: string
    status: string
    description?: string | null
  } | null
  archiving: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
}>()

const { clearAlerts, warning } = useDrawerAlerts()

const confirmText = ref('')

const isArchiveFormValid = computed(() => {
  return confirmText.value.toUpperCase() === 'ARCHIVE'
})

function closeDrawer() {
  emit('update:visible', false)
}

// mutation 留在父層執行（archivingProjects Set 與列表按鈕共用）
function executeArchiveProject() {
  if (!props.project) return
  emit('confirm')
}

// 開啟時重置表單並顯示警告
watch(() => props.visible, (open) => {
  if (open) {
    confirmText.value = ''
    clearAlerts()
    warning(
      '封存後專案將從主列表中隱藏（除非開啟「顯示封存專案」開關），所有成員將無法訪問或修改專案內容；階段、提交、評論等所有數據將被保留但不可編輯。此操作不會刪除任何數據，您可以隨時解除封存以恢復專案。',
      '⚠️ 重要警告'
    )
  } else {
    clearAlerts()
  }
})
</script>

<style scoped>
.drawer-body {
  padding: 20px;
}

.form-section {
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.detail-row {
  display: flex;
  gap: 15px;
}

.detail-row label {
  font-weight: 600;
  min-width: 120px;
  color: #333;
}

.detail-row span {
  flex: 1;
  color: #666;
}

.mono {
  font-family: monospace;
  background: #f8f9fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d1ecf1;
  color: #0c5460;
}

.status-badge.completed {
  background: #d4edda;
  color: #155724;
}

.status-badge.archived {
  background: #f8d7da;
  color: #721c24;
}

.status-badge i {
  margin-right: 4px;
}

.drawer-actions {
  position: sticky;
  bottom: 0;
  background: white;
  padding: 20px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin: 0 -20px -20px -20px;
}
</style>
