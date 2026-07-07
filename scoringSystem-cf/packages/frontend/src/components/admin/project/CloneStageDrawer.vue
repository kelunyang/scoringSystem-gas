<template>
  <el-drawer
    :model-value="visible"
    title="複製階段"
    direction="btt"
    size="100%"
    class="drawer-navy"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="cloning" class="drawer-body">
      <!-- 原始階段資訊 -->
      <div class="form-section">
        <h4><i class="fas fa-info-circle"></i> 原始階段資訊</h4>
        <div v-if="sourceStage" class="detail-row">
          <label>階段名稱:</label>
          <span>{{ sourceStage.stageName }}</span>
        </div>
      </div>

      <!-- 新階段設定 -->
      <div class="form-section">
        <h4><i class="fas fa-edit"></i> 新階段設定</h4>
        <div class="form-group">
          <label>新階段名稱 *</label>
          <el-input
            v-model="newStageName"
            placeholder="請輸入新階段名稱"
            clearable
          />
        </div>
      </div>

      <!-- 複製目標選擇 -->
      <div class="form-section">
        <h4><i class="fas fa-copy"></i> 複製目標專案</h4>
        <div class="form-group">
          <label>選擇目標專案 *</label>
          <el-select
            v-model="targetProjectIds"
            multiple
            filterable
            placeholder="搜尋並選擇專案..."
            style="width: 100%"
          >
            <el-option
              v-for="project in manageableProjects"
              :key="project.projectId"
              :label="project.projectName"
              :value="project.projectId"
            >
              <span>{{ project.projectName }}</span>
              <span v-if="project.isCurrent" style="color: var(--el-color-info); margin-left: 8px; font-size: 12px;">
                （目前專案）
              </span>
            </el-option>
          </el-select>
          <div class="field-hint">
            已選擇 {{ targetProjectIds.length }} 個專案（預設為目前專案，可新增其他專案）
          </div>
        </div>
      </div>

      <!-- 確認輸入 -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
        <ConfirmationInput
          v-model="confirmText"
          keyword="CLONE"
          hint-action="複製"
          @confirm="executeCloneStage"
        />
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          :disabled="!isCloneStageFormValid || cloning"
          @click="executeCloneStage"
        >
          <i :class="cloning ? 'fas fa-spinner fa-spin' : 'fas fa-copy'"></i>
          {{ cloning ? '複製中...' : '確定複製' }}
        </el-button>
        <el-button :disabled="cloning" @click="closeDrawer">取消</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import { useCloneStageToProjects } from '@/composables/admin/useProjects'

const props = defineProps<{
  visible: boolean
  sourceStage: { stageId: string; stageName: string; projectId: string } | null
  projects: { projectId: string; projectName: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:cloning', value: boolean): void
  (e: 'cloned', targetProjectIds: string[]): void
}>()

const cloneStageToProjectsMutation = useCloneStageToProjects()

const newStageName = ref('')
const confirmText = ref('')
const targetProjectIds = ref<string[]>([])
const cloning = ref(false)

const isCloneStageFormValid = computed(() => {
  return newStageName.value.trim() !== '' &&
         confirmText.value.toUpperCase() === 'CLONE' &&
         targetProjectIds.value.length > 0
})

// 可選目標專案（admin 可見專案即可管理）
const manageableProjects = computed(() => {
  return props.projects.map(project => ({
    projectId: project.projectId,
    projectName: project.projectName,
    isCurrent: project.projectId === props.sourceStage?.projectId
  }))
})

function closeDrawer() {
  emit('update:visible', false)
}

async function executeCloneStage() {
  if (!isCloneStageFormValid.value) {
    ElMessage.warning('請填寫完整資料並輸入 CLONE 確認')
    return
  }

  cloning.value = true

  try {
    const clonedTargetIds = [...targetProjectIds.value]
    ElMessage.info(`開始複製階段到 ${clonedTargetIds.length} 個專案，請稍候...`)

    await cloneStageToProjectsMutation.mutateAsync({
      sourceProjectId: props.sourceStage!.projectId,
      stageId: props.sourceStage!.stageId,
      newStageName: newStageName.value.trim(),
      targetProjectIds: clonedTargetIds
    })

    // 父層據此刷新已展開目標專案的階段列表
    emit('cloned', clonedTargetIds)
    closeDrawer()
  } catch (error) {
    console.error('Error cloning stage:', error)
    // Error message already shown by mutation onError handler
  } finally {
    cloning.value = false
  }
}

// 開啟時重置表單，目標預設選中來源專案
watch(() => props.visible, (open) => {
  if (open) {
    newStageName.value = ''
    confirmText.value = ''
    targetProjectIds.value = props.sourceStage ? [props.sourceStage.projectId] : []
  }
})

// 複製中狀態回寫父層（列表按鈕的 disabled/spinner 依賴它）
watch(cloning, value => emit('update:cloning', value))
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

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
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

.field-hint {
  font-size: 12px;
  color: #666;
  margin-top: 8px;
  line-height: 1.4;
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
