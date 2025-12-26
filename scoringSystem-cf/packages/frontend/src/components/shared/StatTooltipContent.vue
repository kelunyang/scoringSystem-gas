<template>
  <div class="tooltip-content">
    <div v-if="proposer" class="tooltip-row">
      <strong>{{ proposerLabel }}:</strong> {{ proposer }}
    </div>
    <div v-if="status" class="tooltip-row">
      <strong>狀態:</strong> {{ status }}
    </div>
    <div v-if="time" class="tooltip-row">
      <strong>時間:</strong> {{ time }}
    </div>
    <div v-if="customMessage" class="tooltip-row">
      {{ customMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  proposer: {
    type: String,
    default: null
  },
  proposerLabel: {
    type: String,
    default: '提議者'
  },
  status: {
    type: String,
    default: null
  },
  time: {
    type: String,
    default: null
  },
  customMessage: {
    type: String,
    default: null
  }
})
</script>

<style scoped>
.tooltip-content {
  line-height: 1.6;
}

.tooltip-row {
  margin-bottom: 2px;
}

.tooltip-row:last-child {
  margin-bottom: 0;
}
</style>
