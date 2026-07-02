<template>
  <el-drawer
    v-model="localVisible"
    title="批量建立專案群組"
    direction="btt"
    size="100%"
    :before-close="handleClose"
    class="drawer-navy"
  >
    <div v-loading="creating" class="drawer-body" element-loading-text="批量建立中...">
      <div class="form-section">
        <h4><i class="fas fa-layer-group"></i> 批量建立設定</h4>

        <div class="form-group">
          <label>建立數量 <span class="required">*</span></label>
          <el-slider
            v-model="groupCount"
            :min="1"
            :max="20"
            show-input
            :format-tooltip="(val: number) => `${val} 個分組`"
            :disabled="creating"
          />
          <p class="field-hint">
            <i class="fas fa-info-circle"></i>
            將會建立 {{ groupCount }} 個群組（系統自動命名為 "分組xxxxx"）
          </p>
        </div>

        <div class="form-group">
          <el-switch
            v-model="allowChange"
            active-text="允許成員自由加入/離開"
            inactive-text="僅管理員可調整成員"
            :disabled="creating"
          />
          <p class="field-hint">
            <i class="fas fa-info-circle"></i>
            啟用後，專案成員可以自行選擇加入或離開群組；關閉後，僅管理員可以調整群組成員
          </p>
        </div>
      </div>

      <div class="drawer-actions">
        <el-button type="primary" :disabled="creating" @click="handleCreate">
          <i :class="creating ? 'fas fa-spinner fa-spin' : 'fas fa-plus'"></i>
          {{ creating ? '建立中...' : `建立 ${groupCount} 個群組` }}
        </el-button>
        <el-button :disabled="creating" @click="handleClose">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WritableComputedRef } from 'vue'

export interface Props {
  visible?: boolean
  creating?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  creating: false
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'create': [payload: { groupCount: number; allowChange: boolean }]
  'close': []
}>()

// Form state
const groupCount = ref(5)
const allowChange = ref(true)

// Two-way binding for visibility
const localVisible: WritableComputedRef<boolean> = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

function handleCreate(): void {
  const payload = {
    groupCount: groupCount.value,
    allowChange: allowChange.value
  }

  console.log('🎯 [BatchCreateGroupsDrawer] handleCreate - Payload:', payload)
  console.log('  - groupCount:', groupCount.value, typeof groupCount.value)
  console.log('  - allowChange:', allowChange.value, typeof allowChange.value)

  emit('create', payload)
}

function handleClose(): void {
  localVisible.value = false
  emit('close')
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
