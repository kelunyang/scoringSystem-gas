<template>
  <el-drawer
    v-model="localVisible"
    :title="form.groupId ? '編輯專案群組' : '新增專案群組'"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >

    <div class="drawer-body">
      <div class="form-section">
        <h4><i class="fas fa-layer-group"></i> 群組基本資訊</h4>

        <div class="form-group">
          <label>群組名稱 <span class="required">*</span></label>
          <el-input
            v-model="form.groupName"
            placeholder="輸入群組名稱"
            clearable
            maxlength="200"
            show-word-limit
          />
        </div>

        <div class="form-group">
          <label>描述</label>
          <el-input
            type="textarea"
            v-model="form.description"
            placeholder="輸入群組描述（可選）"
            :rows="3"
            maxlength="200"
            show-word-limit
          />
        </div>
      </div>

      <div class="form-section">
        <h4><i class="fas fa-cog"></i> 群組設定</h4>

        <div class="form-group">
          <el-checkbox v-model="form.allowChange">
            允許群組成員自由加入/離開
          </el-checkbox>
          <p class="field-hint">
            <i class="fas fa-info-circle"></i>
            啟用後，專案成員可以自行選擇加入或離開此群組；關閉後，僅管理員可以調整群組成員
          </p>
        </div>
      </div>

      <div class="drawer-actions">
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="saving || !canSave">
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

interface GroupForm {
  groupId?: string
  groupName: string
  description: string
  allowChange: boolean
}

interface Props {
  visible?: boolean
  form: GroupForm
  saving?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
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

// Validation: groupName must not be empty
const canSave = computed(() => {
  return props.form.groupName.trim().length > 0
})

// Methods
function handleClose(): void {
  localVisible.value = false
  emit('close')
}

function handleSave(): void {
  if (canSave.value) {
    emit('save')
  }
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

.field-hint {
  margin: 8px 0 0 0;
  color: #909399;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.field-hint i {
  margin-top: 2px;
  flex-shrink: 0;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */
</style>
