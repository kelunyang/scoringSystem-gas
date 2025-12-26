<template>
  <div class="group-stats">
    <span class="stat-item">
      <i class="fas fa-check-circle"></i>
      活躍群組: {{ stats?.activeGroups ?? 0 }}
    </span>
    <span class="stat-item">
      <i class="fas fa-times-circle"></i>
      停用群組: {{ stats?.inactiveGroups ?? 0 }}
    </span>
    <span class="stat-item">
      <i class="fas fa-layer-group"></i>
      總群組: {{ stats?.totalGroups ?? 0 }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'GroupStatsBar'
})

interface GroupStats {
  totalGroups: number
  activeGroups: number
  inactiveGroups: number
}

defineProps<{
  stats?: GroupStats
}>()
</script>

<style scoped>
.group-stats {
  display: flex;
  gap: 20px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 14px;
}

.stat-item i {
  font-size: 16px;
}

.stat-item i.fa-check-circle {
  color: #67c23a;
}

.stat-item i.fa-times-circle {
  color: #f56c6c;
}

.stat-item i.fa-layer-group {
  color: #409eff;
}
</style>
