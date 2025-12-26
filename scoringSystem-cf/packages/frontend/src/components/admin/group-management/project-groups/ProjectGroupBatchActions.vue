<template>
  <div v-if="selectedCount > 0" class="batch-actions">
    <el-button-group>
      <el-badge :value="selectedCount" :hidden="selectedCount === 0">
        <el-button type="danger" size="default" @click="$emit('batch-deactivate')">
          <i class="fas fa-times-circle"></i>
          整批停用
        </el-button>
      </el-badge>
      <el-badge :value="selectedCount" :hidden="selectedCount === 0">
        <el-button type="success" size="default" @click="$emit('batch-activate')">
          <i class="fas fa-check-circle"></i>
          整批啟用
        </el-button>
      </el-badge>
      <el-badge :value="selectedCount" :hidden="selectedCount === 0">
        <el-button type="warning" size="default" @click="$emit('batch-lock')">
          <i class="fas fa-lock"></i>
          整批鎖定
        </el-button>
      </el-badge>
      <el-badge :value="selectedCount" :hidden="selectedCount === 0">
        <el-button type="primary" size="default" @click="$emit('batch-unlock')">
          <i class="fas fa-unlock"></i>
          整批解鎖
        </el-button>
      </el-badge>
    </el-button-group>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ProjectGroupBatchActions'
})

defineProps<{
  selectedCount: number
}>()

defineEmits<{
  'batch-deactivate': []
  'batch-activate': []
  'batch-lock': []
  'batch-unlock': []
}>()
</script>

<style scoped>
.batch-actions {
  margin-top: 16px;
  padding: 12px;
  background-color: #fff7ed;
  border-radius: 6px;
  border: 1px solid #fed7aa;
}
</style>
