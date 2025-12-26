<template>
  <el-dialog
    v-model="dialogVisible"
    title="專案詳情"
    width="70%"
    :close-on-click-modal="true"
    @closed="handleClosed"
  >
    <div v-if="projectName" class="project-info-section">
      <h2 class="project-name">{{ projectName }}</h2>
    </div>

    <div v-if="projectDescription" class="project-description-section">
      <h3 class="section-title">專案描述</h3>
      <MarkdownViewer :content="projectDescription" />
    </div>

    <EmptyState
      v-if="!projectDescription"
      :icons="['fa-file-alt']"
      title="此專案尚無描述內容"
      parent-icon="fa-file-lines"
      :compact="true"
      :enable-animation="false"
    />

    <template #footer>
      <el-button @click="dialogVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownViewer from '../MarkdownViewer.vue'
import EmptyState from './EmptyState.vue'

/**
 * 專案描述彈窗組件
 * 用於顯示專案的詳細資訊和完整描述
 */

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    default: ''
  },
  projectDescription: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

function handleClosed() {
  emit('update:visible', false)
}
</script>

<style scoped>
.project-info-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e1e8ed;
}

.project-name {
  font-size: 24px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0;
}

.project-description-section {
  margin-top: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 15px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #e1e8ed;
}

.no-description {
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;
}

.no-description i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #bdc3c7;
}

.no-description p {
  margin: 0;
  font-size: 16px;
}
</style>
