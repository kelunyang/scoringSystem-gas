<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="結算階段獎金"
    direction="ttb"
    size="100%"
    :close-on-click-modal="false"
    class="drawer-maroon"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i class="fas fa-project-diagram"></i>
          專案管理
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-calculator"></i>
          結算獎金
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body" v-loading="settling">
      <!-- CRITICAL: DrawerAlertZone 必須是第一個元素 -->
      <DrawerAlertZone />

      <!-- 階段資訊 -->
      <div class="form-section" v-if="stage">
        <h4><i class="fas fa-info-circle"></i> 階段資訊</h4>
        <div class="detail-row">
          <label>階段名稱:</label>
          <span>{{ stage.stageName }}</span>
        </div>
        <div class="detail-row">
          <label>階段ID:</label>
          <span class="mono">{{ stage.stageId }}</span>
        </div>
        <div class="detail-row">
          <label>當前狀態:</label>
          <span class="status-badge">
            <i class="fas fa-check-circle"></i>
            投票中
          </span>
        </div>
        <div class="detail-row">
          <label>報告獎金池:</label>
          <span class="reward-amount">{{ stage.reportRewardPool || 0 }} 點</span>
        </div>
        <div class="detail-row">
          <label>評論獎金池:</label>
          <span class="reward-amount">{{ stage.commentRewardPool || 0 }} 點</span>
        </div>
        <div class="detail-row">
          <label>總獎金:</label>
          <span class="reward-amount total">{{ totalRewardPool }} 點</span>
        </div>
      </div>

      <!-- 結算影響說明 -->
      <div class="form-section">
        <h4><i class="fas fa-exclamation-triangle"></i> 結算影響</h4>
        <ul class="impact-list">
          <li>✅ 系統將根據排名規則分配報告獎金給各組成員</li>
          <li>✅ 系統將根據評論排名分配評論獎金給作者</li>
          <li>✅ 所有參與者的錢包將收到相應的積分獎勵</li>
          <li>✅ 階段狀態將更新為「已完成」</li>
          <li>⚠️ 此操作無法撤銷（可以通過「撤銷結算」功能回滾）</li>
        </ul>
      </div>

      <!-- 安全確認輸入 -->
      <div class="form-section">
        <h4><i class="fas fa-shield-alt"></i> 安全確認</h4>
        <div class="form-group">
          <label>確認結算 *</label>
          <el-input
            v-model="confirmText"
            placeholder="請輸入 SETTLE 以確認"
            clearable
            class="confirmation-code-input"
            @input="confirmText = String($event).toUpperCase()"
            @keyup.enter="handleConfirm"
          />
          <div class="field-hint">
            請輸入 <strong>SETTLE</strong>（全大寫）以確認結算操作
          </div>
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          type="danger"
          @click="handleConfirm"
          :disabled="!isConfirmed || settling"
        >
          <i :class="settling ? 'fas fa-spinner fa-spin' : 'fas fa-calculator'"></i>
          {{ settling ? '結算中...' : '確定結算' }}
        </el-button>
        <el-button @click="handleClose" :disabled="settling">取消</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'

interface Stage {
  stageId: string
  stageName: string
  reportRewardPool?: number
  commentRewardPool?: number
  [key: string]: any
}

interface Props {
  modelValue: boolean
  stage: Stage | null
  projectId: string
  settling?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  settling: false
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'settlement-confirmed': [stage: Stage, projectId: string]
}>()

const { warning, clearAlerts } = useDrawerAlerts()

// 確認文本
const confirmText = ref('')

// 計算總獎金池
const totalRewardPool = computed(() => {
  if (!props.stage) return 0
  return (props.stage.reportRewardPool || 0) + (props.stage.commentRewardPool || 0)
})

// 驗證確認文本
const isConfirmed = computed(() => {
  return confirmText.value.toUpperCase() === 'SETTLE'
})

// 監聽 drawer 開關，顯示警告
watch(() => props.modelValue, (newVal) => {
  if (newVal && props.stage) {
    clearAlerts()

    // 構建警告訊息
    const warningMessage =
      `• 報告獎金池：${props.stage.reportRewardPool || 0} 點\n` +
      `• 評論獎金池：${props.stage.commentRewardPool || 0} 點\n` +
      `• 總獎金：${totalRewardPool.value} 點\n\n` +
      `將按照排名規則分別分配獎金給參與者。\n` +
      `此操作無法撤銷（可通過撤銷結算功能回滾）。`

    warning(warningMessage, '⚠️ 重要警告')

    // 重置確認文本
    confirmText.value = ''
  } else {
    clearAlerts()
  }
})

// 確認結算
const handleConfirm = () => {
  if (!isConfirmed.value || !props.stage || props.settling) return
  emit('settlement-confirmed', props.stage, props.projectId)
}

// 關閉 drawer
const handleClose = () => {
  if (!props.settling) {
    emit('update:modelValue', false)
  }
}
</script>

<style scoped>
.detail-row {
  display: flex;
  margin-bottom: 12px;
  align-items: center;
}

.detail-row label {
  min-width: 120px;
  font-weight: 500;
  color: #606266;
}

.mono {
  font-family: 'Courier New', monospace;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.9em;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #e8f4fd;
  border-radius: 4px;
  color: #409eff;
  font-size: 0.9em;
}

.reward-amount {
  font-size: 1.1em;
  font-weight: 600;
  color: #67c23a;
}

.reward-amount.total {
  font-size: 1.3em;
  color: #e6a23c;
}

.impact-list {
  margin: 0;
  padding-left: 24px;
  line-height: 2;
}

.impact-list li {
  margin-bottom: 8px;
}
</style>
