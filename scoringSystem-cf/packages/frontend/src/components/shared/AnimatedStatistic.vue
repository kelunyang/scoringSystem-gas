<template>
  <div class="animated-statistic">
    <div class="stat-title">{{ title }}</div>
    <div class="stat-value-wrapper">
      <StatNumberContent
        :value="value"
        :loading="loading"
        :enable-animation="true"
        size="medium"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import StatNumberContent from './StatNumberContent.vue'

defineProps<{
  title: string
  value: number | string
  loading?: boolean
}>()
</script>

<style scoped>
.animated-statistic {
  text-align: center;
}

.stat-title {
  font-size: 14px;
  color: var(--el-text-color-regular, #909399);
  line-height: 22px;
  margin-bottom: 4px;
}

.stat-value-wrapper {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary, #303133);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 32px;
  /* 確保 3D 翻轉動畫時背景色正確繼承 */
  background-color: var(--el-bg-color, #fff);
}
</style>
