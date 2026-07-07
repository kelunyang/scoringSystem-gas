<template>
  <el-drawer
    :model-value="visible"
    title="複製專案"
    direction="btt"
    size="100%"
    class="drawer-navy"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="cloning" class="drawer-body">
      <!-- 原始專案資訊 -->
      <div class="form-section">
        <h4><i class="fas fa-info-circle"></i> 原始專案資訊</h4>
        <div v-if="sourceProject" class="detail-row">
          <label>專案名稱:</label>
          <span>{{ sourceProject.projectName }}</span>
        </div>
      </div>

      <!-- 新專案設定 -->
      <div class="form-section">
        <h4><i class="fas fa-edit"></i> 新專案設定</h4>
        <div class="form-group">
          <label>新專案名稱 *</label>
          <el-input
            v-model="newProjectName"
            placeholder="請輸入新專案名稱"
            clearable
          />
        </div>
        <div class="form-group" style="margin-top: 16px;">
          <el-switch
            v-model="copyViewers"
            active-text="一併複製參與者"
            inactive-text=""
          />
          <div class="field-hint" style="margin-top: 4px;">
            開啟後會將原專案的存取者（教師、觀察者、成員）一併複製到新專案。帳號已不存在的使用者會自動跳過。
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
          @confirm="executeCloneProject"
        />
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          :disabled="!isCloneFormValid || cloning"
          @click="executeCloneProject"
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
import { ElMessage, ElMessageBox } from 'element-plus'
import ConfirmationInput from '@/components/common/ConfirmationInput.vue'
import { useCloneProject } from '@/composables/admin/useProjects'

const props = defineProps<{
  visible: boolean
  sourceProject: { projectId: string; projectName: string } | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:cloning', value: boolean): void
}>()

const cloneProjectMutation = useCloneProject()

const newProjectName = ref('')
const confirmText = ref('')
const copyViewers = ref(false)
const cloning = ref(false)

const isCloneFormValid = computed(() => {
  return newProjectName.value.trim() !== '' &&
         confirmText.value.toUpperCase() === 'CLONE'
})

function closeDrawer() {
  emit('update:visible', false)
}

async function executeCloneProject() {
  if (!isCloneFormValid.value) {
    ElMessage.warning('請填寫完整資料並輸入 CLONE 確認')
    return
  }

  cloning.value = true
  ElMessage.info('開始複製專案，請稍候...')

  try {
    const data = await cloneProjectMutation.mutateAsync({
      projectId: props.sourceProject!.projectId,
      newProjectName: newProjectName.value.trim(),
      copyViewers: copyViewers.value
    })

    let message = `專案「${newProjectName.value}」複製成功！`

    // Show viewer copy results if applicable
    if (data?.viewerCopyResult) {
      const { copied, skipped, total } = data.viewerCopyResult
      if (total > 0) {
        message += `\n參與者複製：共 ${total} 人，成功 ${copied} 人`
        if (skipped.length > 0) {
          message += `，跳過 ${skipped.length} 人（帳號已不存在）`
        }
      } else {
        message += '\n原專案無參與者需要複製。'
      }

      // If there are skipped viewers, show a detailed warning
      if (skipped.length > 0) {
        ElMessageBox.alert(
          `以下帳號因已不存在而被跳過：\n${skipped.join('\n')}`,
          '部分參與者未複製',
          { type: 'warning', confirmButtonText: '了解' }
        )
      }
    }

    ElMessage.success(message)
    closeDrawer()
  } catch (error) {
    console.error('Error cloning project:', error)
    // Error message already shown by mutation onError handler
  } finally {
    cloning.value = false
  }
}

// 開啟時重置表單
watch(() => props.visible, (open) => {
  if (open) {
    newProjectName.value = ''
    confirmText.value = ''
    copyViewers.value = false
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
