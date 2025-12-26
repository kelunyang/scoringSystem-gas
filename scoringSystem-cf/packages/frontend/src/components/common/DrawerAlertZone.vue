<template>
  <div
    v-if="alerts.length > 0"
    class="drawer-alert-zone"
    role="alert"
    aria-live="polite"
    aria-label="Drawer notifications"
  >
    <!-- Alert 列表 -->
    <transition-group name="alert-list" tag="div" class="alert-list">
      <!-- 預設只顯示最新一個，展開後顯示所有（最多 10 個） -->
      <div
        v-for="(alert, index) in displayedAlerts"
        :key="alert.id"
        class="drawer-alert-item"
        :class="`drawer-alert-item--${alert.type}`"
      >
        <!-- Alert Icon -->
        <div v-if="alert.showIcon" class="drawer-alert-icon">
          <i :class="ALERT_ICONS[alert.type]"></i>
        </div>

        <!-- Alert Content -->
        <div class="drawer-alert-content">
          <div v-if="alert.title" class="drawer-alert-title">
            {{ alert.title }}
          </div>
          <div class="drawer-alert-message">
            {{ alert.message }}
          </div>
        </div>

        <!-- Close Button -->
        <button
          v-if="alert.closable"
          class="drawer-alert-close"
          @click="removeAlert(alert.id)"
          type="button"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
    </transition-group>

    <!-- 展開/收合按鈕 (僅當有多個 alerts 時顯示) -->
    <div v-if="alerts.length > 1" class="drawer-alert-toggle">
      <el-badge :value="alerts.length" :max="99" :hidden="alerts.length <= 1">
        <el-button
          :icon="expanded ? ArrowUp : ArrowDown"
          circle
          size="small"
          @click="toggleExpanded"
          type="info"
        />
      </el-badge>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useDrawerAlerts, ALERT_ICONS, type AlertType } from '@/composables/useDrawerAlerts'

/**
 * Alert 優先級（數字越小越優先）
 * - error/warning 有驚嘆號圖示，應優先顯示
 */
const ALERT_PRIORITY: Record<AlertType, number> = {
  error: 0,    // 最高優先
  warning: 1,  // 次高優先
  info: 2,
  success: 3   // 最低優先
}

/**
 * DrawerAlertZone - 統一的 Drawer Alert 區域組件
 *
 * 功能：
 * - Sticky 定位在 drawer header 下方
 * - 預設顯示最新一個 alert
 * - 可展開顯示所有 alerts（最多 10 個）
 * - 支持自動關閉和手動關閉
 * - 平滑的展開/收合動畫
 *
 * 使用方式：
 * 1. 在 drawer-body 最頂部放置此組件
 * 2. 在 <script setup> 中使用 useDrawerAlerts() 添加 alerts
 *
 * @example
 * Template:
 * ```vue
 * <div class="drawer-body">
 *   <DrawerAlertZone />
 *   <!-- 其他內容 -->
 * </div>
 * ```
 *
 * Script:
 * ```typescript
 * import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
 * const { addAlert } = useDrawerAlerts()
 *
 * // 添加警告
 * addAlert({
 *   type: 'warning',
 *   title: '操作警告',
 *   message: '此操作無法復原'
 * })
 * ```
 */

// 使用 drawer alerts composable
const { alerts, removeAlert } = useDrawerAlerts()

// 展開狀態
const expanded = ref(false)

// 最多顯示數量
const MAX_DISPLAY = 10

/**
 * 排序後的 alerts
 * - error/warning 優先顯示（有驚嘆號圖示）
 * - 同優先級內按時間戳排序（新的在前）
 */
const sortedAlerts = computed(() => {
  return [...alerts.value].sort((a, b) => {
    // 1. 先按優先級排序（error/warning 在前）
    const priorityDiff = ALERT_PRIORITY[a.type] - ALERT_PRIORITY[b.type]
    if (priorityDiff !== 0) return priorityDiff

    // 2. 同優先級按時間戳排序（新的在前）
    return b.timestamp - a.timestamp
  })
})

/**
 * 顯示的 alerts
 * - 未展開：只顯示優先級最高的一個
 * - 展開：顯示所有（最多 10 個）
 */
const displayedAlerts = computed(() => {
  if (expanded.value) {
    return sortedAlerts.value.slice(0, MAX_DISPLAY)
  }
  return sortedAlerts.value.slice(0, 1)
})

/**
 * 切換展開/收合狀態
 */
function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<style scoped lang="scss">
/**
 * DrawerAlertZone Styles
 * 統一的 Drawer Alert 區域樣式
 */

.drawer-alert-zone {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 15; // Higher than drawer-body content, positioned below drawer header
  background: white;
  border-bottom: 1px solid #e1e8ed;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0;
}

/**
 * Alert 列表容器
 */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/**
 * 單個 Alert Item
 */
.drawer-alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid #f0f2f5;
  position: relative;
  transition: background-color 0.3s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #fafbfc;
  }
}

/**
 * Alert Icon
 */
.drawer-alert-icon {
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1.5;
  margin-top: 2px;
}

/**
 * Alert Content
 */
.drawer-alert-content {
  flex: 1;
  min-width: 0; // 防止內容溢出
}

.drawer-alert-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  line-height: 1.5;
}

.drawer-alert-message {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
  word-wrap: break-word;
}

/**
 * Alert Close Button
 */
.drawer-alert-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: #909399;
  font-size: 14px;
  padding: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.3s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #606266;
  }

  &:active {
    transform: scale(0.9);
  }
}

/**
 * Alert 類型顏色
 */
.drawer-alert-item--success {
  .drawer-alert-icon {
    color: #67c23a;
  }
  .drawer-alert-title {
    color: #529b2e;
  }
}

.drawer-alert-item--warning {
  .drawer-alert-icon {
    color: #e6a23c;
  }
  .drawer-alert-title {
    color: #b88230;
  }
}

.drawer-alert-item--error {
  .drawer-alert-icon {
    color: #f56c6c;
  }
  .drawer-alert-title {
    color: #c45656;
  }
}

.drawer-alert-item--info {
  .drawer-alert-icon {
    color: #909399;
  }
  .drawer-alert-title {
    color: #73767a;
  }
}

/**
 * 展開/收合按鈕區
 */
.drawer-alert-toggle {
  padding: 8px 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: #fafbfc;
  border-top: 1px solid #e1e8ed;
}

/**
 * Alert List 動畫
 */
.alert-list-enter-active,
.alert-list-leave-active {
  transition: all 0.3s ease;
}

.alert-list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.alert-list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.alert-list-move {
  transition: transform 0.3s ease;
}

/**
 * 手機版響應式調整
 */
@media (max-width: 768px) {
  .drawer-alert-item {
    padding: 10px 16px;
    gap: 10px;
  }

  .drawer-alert-icon {
    font-size: 16px;
  }

  .drawer-alert-title {
    font-size: 13px;
  }

  .drawer-alert-message {
    font-size: 12px;
  }

  .drawer-alert-toggle {
    padding: 6px 16px;
  }
}
</style>
