<template>
  <div class="settings-section">
    <div class="section-header-with-actions">
      <h3><i class="fas fa-chart-bar"></i> 系統統計</h3>
      <el-button
        type="primary"
        size="small"
        @click="handleRefresh"
        :loading="loading"
        icon="Refresh"
      >
        刷新統計
      </el-button>
    </div>

    <div
      v-loading="loading"
      element-loading-text="載入統計資料中..."
      class="stats-container"
    >
      <el-row :gutter="20">
        <!-- 用戶統計 -->
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="總用戶數" :value="systemStats?.totalUsers || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="活躍用戶" :value="systemStats?.activeUsers || 0" />
          </el-card>
        </el-col>

        <!-- 專案統計 -->
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="總專案數" :value="systemStats?.totalProjects || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="進行中專案" :value="systemStats?.activeProjects || 0" />
          </el-card>
        </el-col>

        <!-- 群組統計 -->
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="總群組數" :value="systemStats?.totalGroups || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="活躍群組" :value="systemStats?.activeGroups || 0" />
          </el-card>
        </el-col>

        <!-- 邀請碼統計 -->
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="邀請碼總數" :value="invitationStats?.total || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="有效邀請碼" :value="invitationStats?.active || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="已用邀請碼" :value="invitationStats?.used || 0" />
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <el-card class="stat-card" shadow="hover">
            <AnimatedStatistic title="過期邀請碼" :value="invitationStats?.expired || 0" />
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SystemStats, InvitationStats } from '@/types/admin-stats'
import AnimatedStatistic from '@/components/shared/AnimatedStatistic.vue'

/**
 * Props
 */
export interface Props {
  /** 系統統計數據 */
  systemStats?: SystemStats
  /** 邀請碼統計數據 */
  invitationStats?: InvitationStats
  /** 是否正在載入 */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  systemStats: undefined,
  invitationStats: undefined,
  loading: false
})

/**
 * Emits
 */
interface Emits {
  /** 刷新統計數據 */
  (e: 'refresh'): void
}

const emit = defineEmits<Emits>()

/**
 * 刷新統計數據
 */
const handleRefresh = (): void => {
  emit('refresh')
}
</script>

<style scoped>
.settings-section {
  background: white;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow: hidden;
}

.section-header-with-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  padding: 20px 20px 0 20px;
}

.section-header-with-actions h3 {
  margin: 0;
  color: #2c5aa0;
  font-size: 18px;
}

.section-header-with-actions h3 i {
  margin-right: 10px;
}

.stats-container {
  padding: 20px;
}

.stat-card {
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

</style>
