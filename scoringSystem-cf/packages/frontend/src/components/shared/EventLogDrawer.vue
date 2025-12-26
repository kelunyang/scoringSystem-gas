<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    direction="btt"
    size="100%"
    class="event-log-drawer drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-history"></i>
          {{ '事件日誌' + (project ? ' - ' + project.projectName : '') }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <!-- EventLogViewer Component -->
    <EventLogViewer
      v-if="modelValue && project"
      :project-id="project.projectId"
      :user-mode="userMode"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import EventLogViewer from '../EventLogViewer.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import type { Project } from '@/types'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

interface Props {
  modelValue: boolean
  project: Project | null
  userMode?: boolean
}

withDefaults(defineProps<Props>(), {
  modelValue: false,
  project: null,
  userMode: false
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
/* Navy Gradient Header */
.drawer-header-navy {
  background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
  padding: 16px 24px;
  margin: -20px -20px 20px -20px;
  border-radius: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header-navy h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-header-navy h3 i {
  color: #60a5fa;
}

.drawer-close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.drawer-close-btn:active {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0.95);
}
</style>
