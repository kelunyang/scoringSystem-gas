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
          <i class="fas fa-edit"></i>
          {{ isEditing ? '編輯公告' : '新增公告' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 基本資訊 -->
      <div class="form-section">
        <h4><i class="fas fa-bullhorn"></i> 公告資訊</h4>

        <div class="form-group">
          <label>公告標題 *</label>
          <el-input
            v-model="form.title"
            placeholder="請輸入公告標題"
            maxlength="200"
            show-word-limit
          />
        </div>

        <div class="form-group">
          <label>公告類型 *</label>
          <el-select v-model="form.type" style="width: 100%;">
            <el-option label="一般訊息" value="info">
              <i class="fas fa-info-circle" style="color: #409EFF; margin-right: 8px;"></i>
              一般訊息
            </el-option>
            <el-option label="警告" value="warning">
              <i class="fas fa-exclamation-triangle" style="color: #E6A23C; margin-right: 8px;"></i>
              警告
            </el-option>
            <el-option label="成功" value="success">
              <i class="fas fa-check-circle" style="color: #67C23A; margin-right: 8px;"></i>
              成功
            </el-option>
            <el-option label="錯誤" value="error">
              <i class="fas fa-times-circle" style="color: #F56C6C; margin-right: 8px;"></i>
              錯誤
            </el-option>
          </el-select>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label>開始時間 *</label>
            <el-date-picker
              v-model="form.startTime"
              type="datetime"
              placeholder="選擇開始時間"
              format="YYYY-MM-DD HH:mm"
              value-format="x"
              style="width: 100%;"
            />
          </div>

          <div class="form-group half">
            <label>結束時間 *</label>
            <el-date-picker
              v-model="form.endTime"
              type="datetime"
              placeholder="選擇結束時間"
              format="YYYY-MM-DD HH:mm"
              value-format="x"
              style="width: 100%;"
            />
          </div>
        </div>

        <div class="form-group">
          <label>公告內容 * <span class="hint">（支援 Markdown 格式）</span></label>
          <MarkdownEditor
            v-model="form.content"
            placeholder="請輸入公告內容..."
          />
        </div>
      </div>

      <!-- 預覽區塊 -->
      <div class="form-section" v-if="form.content">
        <h4><i class="fas fa-eye"></i> 內容預覽</h4>
        <div class="preview-container" :class="`preview-${form.type}`">
          <div class="preview-header">
            <i :class="typeIconClass"></i>
            <span class="preview-title">{{ form.title || '（未輸入標題）' }}</span>
          </div>
          <div class="preview-content">
            <MdPreviewWrapper :content="form.content" />
          </div>
        </div>
      </div>

      <!-- Drawer Footer -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          @click="handleSave"
          :loading="saving"
          :disabled="!isFormValid"
        >
          <i :class="isEditing ? 'fas fa-save' : 'fas fa-plus'"></i>
          {{ saving ? '儲存中...' : (isEditing ? '儲存變更' : '創建公告') }}
        </el-button>
        <el-button @click="handleClose" :disabled="saving">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import {
  useCreateAnnouncement,
  useUpdateAnnouncement,
  type AdminAnnouncement
} from '@/composables/useAnnouncements'
import type { AnnouncementType } from '@repo/shared'

// ===== Props & Emits =====

export interface Props {
  visible?: boolean
  announcement?: AdminAnnouncement | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  announcement: null
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'saved': []
}>()

// ===== Composables =====

const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
const { addAlert, clearAlerts } = useDrawerAlerts()
const { mutateAsync: createAnnouncement, isPending: isCreating } = useCreateAnnouncement()
const { mutateAsync: updateAnnouncement, isPending: isUpdating } = useUpdateAnnouncement()

// ===== State =====

const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const isEditing = computed(() => !!props.announcement?.announcementId)
const saving = computed(() => isCreating.value || isUpdating.value)

// Form state
const form = ref<{
  title: string
  content: string
  type: AnnouncementType
  startTime: number | null
  endTime: number | null
}>({
  title: '',
  content: '',
  type: 'info',
  startTime: null,
  endTime: null
})

// Form validation
const isFormValid = computed(() => {
  return (
    form.value.title.trim() !== '' &&
    form.value.content.trim() !== '' &&
    form.value.startTime !== null &&
    form.value.endTime !== null &&
    form.value.endTime > form.value.startTime
  )
})

// Type icon class
const typeIconClass = computed(() => {
  const icons: Record<AnnouncementType, string> = {
    info: 'fas fa-info-circle',
    warning: 'fas fa-exclamation-triangle',
    success: 'fas fa-check-circle',
    error: 'fas fa-times-circle'
  }
  return icons[form.value.type] || 'fas fa-info-circle'
})

// ===== Watchers =====

// Initialize form when announcement changes
watch(() => props.announcement, (newVal) => {
  if (newVal) {
    form.value = {
      title: newVal.title,
      content: newVal.content,
      type: newVal.type,
      startTime: newVal.startTime,
      endTime: newVal.endTime
    }
  } else {
    // Reset form for new announcement
    const now = Date.now()
    const oneWeekLater = now + 7 * 24 * 60 * 60 * 1000
    form.value = {
      title: '',
      content: '',
      type: 'info',
      startTime: now,
      endTime: oneWeekLater
    }
  }
}, { immediate: true })

// Clear alerts and reset form when drawer opens
watch(() => props.visible, (visible) => {
  if (visible) {
    clearAlerts()
    // Reset form when opening for new announcement
    // This handles the case when props.announcement is already null
    // and the watch on props.announcement doesn't trigger
    if (!props.announcement) {
      const now = Date.now()
      const oneWeekLater = now + 7 * 24 * 60 * 60 * 1000
      form.value = {
        title: '',
        content: '',
        type: 'info',
        startTime: now,
        endTime: oneWeekLater
      }
    }
  }
})

// ===== Methods =====

const handleSave = async () => {
  if (!isFormValid.value) {
    addAlert({
      type: 'warning',
      message: '請填寫所有必填欄位，並確保結束時間晚於開始時間'
    })
    return
  }

  try {
    if (isEditing.value && props.announcement) {
      await updateAnnouncement({
        announcementId: props.announcement.announcementId,
        title: form.value.title,
        content: form.value.content,
        type: form.value.type,
        startTime: form.value.startTime!,
        endTime: form.value.endTime!
      })
    } else {
      await createAnnouncement({
        title: form.value.title,
        content: form.value.content,
        type: form.value.type,
        startTime: form.value.startTime!,
        endTime: form.value.endTime!
      })
    }

    emit('saved')
  } catch (error) {
    // Error handling is done in the composable
    console.error('Save announcement error:', error)
  }
}

const handleClose = () => {
  localVisible.value = false
}
</script>

<style scoped>
.drawer-body {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.form-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-section h4 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.form-section h4 i {
  margin-right: 10px;
  color: #409EFF;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #606266;
  font-weight: 500;
}

.form-group label .hint {
  font-weight: normal;
  color: #909399;
  font-size: 12px;
}

.form-row {
  display: flex;
  gap: 20px;
}

.form-group.half {
  flex: 1;
}

/* Preview */
.preview-container {
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.preview-header i {
  font-size: 18px;
}

.preview-title {
  flex: 1;
}

.preview-content {
  padding: 16px;
  background: #f5f7fa;
}

/* Preview types */
.preview-info .preview-header {
  background: #ecf5ff;
  color: #409EFF;
}

.preview-warning .preview-header {
  background: #fdf6ec;
  color: #E6A23C;
}

.preview-success .preview-header {
  background: #f0f9eb;
  color: #67C23A;
}

.preview-error .preview-header {
  background: #fef0f0;
  color: #F56C6C;
}

/* Drawer actions */
.drawer-actions {
  position: sticky;
  bottom: 0;
  background: white;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin: 0 -20px -20px -20px;
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .form-group.half {
    width: 100%;
  }
}
</style>
