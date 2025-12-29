<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-users-cog"></i>
          {{ form.groupId ? '編輯全域群組' : '新增全域群組' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <div class="form-section">
        <h4><i class="fas fa-layer-group"></i> 群組基本資訊</h4>

        <div class="form-group">
          <label>群組名稱 <span class="required">*</span></label>
          <el-input
            v-model="form.groupName"
            placeholder="輸入群組名稱"
            clearable
          />
        </div>

        <div class="form-group">
          <label>描述</label>
          <el-input
            type="textarea"
            v-model="form.description"
            placeholder="輸入群組描述（可選）"
            :rows="3"
          />
        </div>
      </div>

      <div class="form-section">
        <h4><i class="fas fa-key"></i> 全域權限設定</h4>
        <p class="section-hint">為此群組授予系統級權限（可選，一般用戶群組可不設定）</p>

        <el-transfer
          v-model="form.globalPermissions"
          :data="availablePermissions"
          :titles="['可用權限', '已授權']"
          :button-texts="['移除', '添加']"
          :props="{
            key: 'key',
            label: 'label'
          }"
          filterable
          filter-placeholder="搜尋權限"
          style="text-align: left;"
        />
      </div>

      <div class="drawer-actions">
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="saving">
          <i class="fas fa-save"></i>
          {{ saving ? '保存中...' : '保存' }}
        </el-button>
        <el-button @click="handleClose">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WritableComputedRef } from 'vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

interface GroupForm {
  groupId: string
  groupName: string
  description: string
  globalPermissions: string[]
}

export interface PermissionOption {
  key: string
  label: string
}

export interface Props {
  visible?: boolean
  form: GroupForm
  availablePermissions?: PermissionOption[]
  saving?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  availablePermissions: () => [],
  saving: false
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': []
  'close': []
}>()

// Two-way binding for visibility
const localVisible: WritableComputedRef<boolean> = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// Methods
function handleClose(): void {
  localVisible.value = false
  emit('close')
}

function handleSave(): void {
  emit('save')
}
</script>

<style scoped>
.drawer-body {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

.form-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-section h4 {
  margin: 0 0 16px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-hint {
  margin: 0 0 16px 0;
  color: #909399;
  font-size: 13px;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #606266;
  font-size: 14px;
}

.required {
  color: #f56c6c;
  margin-left: 2px;
}


/* Override element-plus drawer header style */
:deep(.el-drawer__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-bottom: 0;
  padding: 20px;
}

:deep(.el-drawer__body) {
  padding: 0;
}

/* Transfer component styling */
:deep(.el-transfer) {
  display: flex;
  justify-content: center;
}

:deep(.el-transfer-panel) {
  width: 280px;
}
</style>
