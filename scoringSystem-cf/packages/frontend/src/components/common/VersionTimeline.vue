<!--
  VersionTimeline Component - Reusable version timeline display

  Props:
  - versions: Array of version objects (required)
  - currentVersionId: ID of currently selected version (default: '')
  - formatTitleFn: Custom title formatter function (optional)
  - formatDescriptionFn: Custom description formatter function (optional)
  - versionIdKey: Key name for version ID (default: 'versionId')
  - createdTimeKey: Key name for creation time (default: 'createdTime')
  - displayNameKey: Key name for display name (default: 'teacherDisplayName')
  - statusKey: Key name for status field (default: 'status')
  - customStepClass: Additional CSS class for steps (default: '')

  Events:
  - version-change(versionId): Emitted when user clicks on a version

  Slots:
  - description: Scoped slot for custom description content
    Props: { version, index }
  - version-description: Legacy slot name (backward compatible)

  Usage Examples:

  Basic:
  <VersionTimeline
    :versions="versions"
    :currentVersionId="currentId"
    @version-change="handleChange"
  />

  With custom keys:
  <VersionTimeline
    :versions="proposals"
    :currentVersionId="selectedId"
    versionIdKey="proposalId"
    createdTimeKey="createdTime"
    displayNameKey="proposerDisplayName"
    @version-change="handleChange"
  />

  With custom description:
  <VersionTimeline :versions="versions">
    <template #description="{ version, index }">
      <div>提交者：{{ version.author }}</div>
      <div>狀態：{{ version.status }}</div>
    </template>
  </VersionTimeline>
-->
<template>
  <div class="version-timeline-container">
    <el-steps
      :active="currentStepIndex"
      process-status="process"
      align-center
      class="version-steps"
    >
      <el-step
        v-for="(version, index) in versions"
        :key="String(readField(version, versionIdKey))"
        :status="getStepStatus(version, index)"
        class="version-step clickable-step"
      >
        <template #title>
          <div class="version-step-title" @click="handleVersionClick(version)">
            {{ formatTitle(version, index) }}
          </div>
        </template>

        <template #description>
          <div class="version-step-description" @click="handleVersionClick(version)">
            <!-- Scoped slot for full customization -->
            <slot name="description" :version="version" :index="index">
              <!-- Fallback to legacy slot name for backward compatibility -->
              <slot name="version-description" :version="version" :index="index">
                {{ formatDescription(version) }}
              </slot>
            </slot>
          </div>
        </template>
      </el-step>
    </el-steps>

    <el-alert
      v-if="versions.length > 1"
      type="info"
      :closable="false"
      show-icon
      class="version-hint-alert"
    >
      <template #title>
        <i class="fas fa-lightbulb"></i> 提示：點擊上方時間軸可查看與最新版本的差異比較
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts" generic="T extends object">
import { computed } from 'vue'

/**
 * 這個元件不認識版本的內容：欄位名由 `versionIdKey`／`createdTimeKey`／
 * `displayNameKey`／`statusKey` 指定，元素型別由呼叫端決定（泛型 T）。
 */

/** 依 props 指定的欄位名動態取值 */
function readField(version: T, key: string): unknown {
  return (version as Record<string, unknown>)[key]
}

const props = withDefaults(defineProps<{
  versions: T[]
  currentVersionId?: string
  formatTitleFn?: ((version: T, index: number) => string) | null
  formatDescriptionFn?: ((version: T) => string) | null
  versionIdKey?: string
  createdTimeKey?: string
  displayNameKey?: string
  statusKey?: string
  customStepClass?: string
}>(), {
  currentVersionId: '',
  formatTitleFn: null,
  formatDescriptionFn: null,
  versionIdKey: 'versionId',
  createdTimeKey: 'createdTime',
  displayNameKey: 'teacherDisplayName',
  statusKey: 'status',
  customStepClass: ''
})

const emit = defineEmits(['version-change'])

// 當前步驟索引
const currentStepIndex = computed(() => {
  if (!props.currentVersionId || props.versions.length === 0) {
    return 0
  }
  const index = props.versions.findIndex(v => readField(v, props.versionIdKey) === props.currentVersionId)
  return index >= 0 ? index : 0
})

// 格式化標題
function formatTitle(version: T, index: number) {
  if (props.formatTitleFn) {
    return props.formatTitleFn(version, index)
  }

  // 默認格式：最後一個顯示"最終版本"，其他顯示時間
  if (index === props.versions.length - 1) {
    return '最終版本'
  }

  const date = new Date(readField(version, props.createdTimeKey) as string | number)
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化描述
function formatDescription(version: T) {
  if (props.formatDescriptionFn) {
    return props.formatDescriptionFn(version)
  }

  return `提交者：${readField(version, props.displayNameKey) || '未知'}`
}

// 獲取步驟狀態
function getStepStatus(version: T, index: number) {
  // 最新版本顯示為 process（藍色高亮）
  if (index === props.versions.length - 1) {
    return 'process'
  }
  // 已完成的版本
  return 'finish'
}

// 處理版本點擊
function handleVersionClick(version: T) {
  emit('version-change', readField(version, props.versionIdKey))
}
</script>

<style scoped>
.version-timeline-container {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid #e9ecef;
}

.version-steps {
  margin-bottom: 20px;
}

.version-step {
  cursor: pointer;
  transition: all 0.3s ease;
}

.version-step:hover {
  opacity: 0.8;
}

.version-step-title {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.version-step-title:hover {
  opacity: 0.7;
  transform: scale(1.05);
}

.clickable-step :deep(.el-step__head),
.clickable-step :deep(.el-step__icon) {
  cursor: pointer;
}

.version-step-description {
  font-size: 12px;
  color: #7f8c8d;
  line-height: 1.6;
  cursor: pointer;
}

.version-hint-alert {
  margin-top: 15px;
  border-radius: 8px;
}

.version-hint-alert :deep(.el-alert__title) {
  font-size: 13px;
  line-height: 1.5;
}
</style>
