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
        <!-- 總用戶數 -->
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <el-statistic title="總用戶數" :value="systemStats?.totalUsers || 0">
              <template #suffix>
                <div class="stat-suffix">
                  活躍 {{ systemStats?.activeUsers || 0 }} | 停用
                  {{ (systemStats?.totalUsers || 0) - (systemStats?.activeUsers || 0) }}
                </div>
              </template>
            </el-statistic>
          </el-card>
        </el-col>

        <!-- 總專案數 -->
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <el-statistic title="總專案數" :value="systemStats?.totalProjects || 0">
              <template #suffix>
                <div class="stat-suffix">
                  進行中 {{ systemStats?.activeProjects || 0 }} | 已完成
                  {{ (systemStats?.totalProjects || 0) - (systemStats?.activeProjects || 0) }}
                </div>
              </template>
            </el-statistic>
          </el-card>
        </el-col>

        <!-- 總群組數 -->
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <el-statistic title="總群組數" :value="systemStats?.totalGroups || 0">
              <template #suffix>
                <div class="stat-suffix">
                  活躍 {{ systemStats?.activeGroups || 0 }}
                </div>
              </template>
            </el-statistic>
          </el-card>
        </el-col>

        <!-- 邀請碼總數 -->
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <el-statistic title="邀請碼總數" :value="invitationStats?.total || 0">
              <template #suffix>
                <div class="stat-suffix">
                  有效 {{ invitationStats?.active || 0 }} | 已用
                  {{ invitationStats?.used || 0 }} | 過期
                  {{ invitationStats?.expired || 0 }}
                </div>
              </template>
            </el-statistic>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SystemStats, InvitationStats } from '@/types/admin-stats'
import type { Ref } from 'vue'

/**
 * Props
 */
interface Props {
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

.stat-suffix {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  line-height: 1.4;
}
</style>
