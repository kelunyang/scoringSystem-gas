<template>
  <div class="expandable-row">
    <!-- Trigger row with built-in chevron -->
    <div
      class="expandable-row__trigger"
      @click="handleToggle"
      :class="{ 'is-expanded': isExpanded, 'is-loading': isLoading }"
    >
      <!-- Built-in expand/collapse icon -->
      <i
        v-if="!hideChevron"
        class="fas chevron-icon"
        :class="isExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"
      ></i>

      <!-- Trigger content slot -->
      <div class="expandable-row__trigger-content">
        <slot name="trigger" :isExpanded="isExpanded" :isLoading="isLoading"></slot>
      </div>
    </div>

    <!-- Expanded content with transition -->
    <Transition name="expand">
      <div v-if="isExpanded" class="expandable-row__content">
        <!-- Loading state -->
        <div v-if="isLoading" class="expandable-row__loading">
          <slot name="loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span class="loading-text">載入中...</span>
          </slot>
        </div>

        <!-- Actual content -->
        <div v-else class="expandable-row__content-inner">
          <slot name="content"></slot>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** 是否已展開 */
  isExpanded?: boolean
  /** 是否載入中 */
  isLoading?: boolean
  /** 隱藏 chevron icon */
  hideChevron?: boolean
}

interface Emits {
  /** 切換展開狀態時觸發 */
  (e: 'toggle'): void
}

withDefaults(defineProps<Props>(), {
  isExpanded: false,
  isLoading: false,
  hideChevron: false,
})

const emit = defineEmits<Emits>()

const handleToggle = () => {
  emit('toggle')
}
</script>

<style scoped>
.expandable-row {
  width: 100%;
}

.expandable-row__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  user-select: none;
}

.expandable-row__trigger:hover {
  background-color: var(--el-fill-color-light);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.expandable-row__trigger.is-expanded {
  background-color: var(--el-fill-color);
}

.chevron-icon {
  flex-shrink: 0;
  width: 16px;
  color: var(--el-text-color-secondary);
  transition: transform 0.3s ease, color 0.2s ease;
  margin-right: 6px;
}

.expandable-row__trigger:hover .chevron-icon {
  color: var(--el-text-color-primary);
  transform: rotate(180deg);
}

.expandable-row__trigger.is-expanded .chevron-icon {
  color: var(--el-color-primary);
}

.expandable-row__trigger.is-expanded:hover .chevron-icon {
  transform: rotate(180deg);
}

.expandable-row__trigger-content {
  flex: 1;
  min-width: 0; /* Allow text truncation */
}

.expandable-row__content {
  overflow: hidden;
}

.expandable-row__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.loading-text {
  margin-left: 4px;
}

.expandable-row__content-inner {
  padding: 12px 0;
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px; /* Adjust based on content */
  transform: translateY(0);
}
</style>
