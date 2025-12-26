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
    </el-button-group>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'GlobalGroupBatchActions'
})

defineProps<{
  selectedCount: number
}>()

defineEmits<{
  'batch-deactivate': []
  'batch-activate': []
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
