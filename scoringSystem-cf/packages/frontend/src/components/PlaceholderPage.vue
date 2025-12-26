<template>
  <div class="placeholder-page">
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="page-title">
        <h2>{{ title }}</h2>
      </div>
      <TopBarUserControls
        :user="user"
        :session-percentage="sessionPercentage"
        :remaining-time="remainingTime"
        @user-command="$emit('user-command', $event)"
      />
    </div>

    <!-- Content -->
    <div class="content-area">
      <div class="placeholder-content">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TopBarUserControls from './TopBarUserControls.vue'

interface User {
  [key: string]: any
}

interface Props {
  title: string
  description: string
  user?: User | null
  sessionPercentage?: number
  remainingTime?: number
}

withDefaults(defineProps<Props>(), {
  user: null,
  sessionPercentage: 100,
  remainingTime: 0
})

defineEmits<{
  'user-command': [event: any]
}>()
</script>

<style scoped>
.placeholder-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.top-bar {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 100;
}

.page-title h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
}

.content-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.placeholder-content {
  text-align: center;
  color: #7f8c8d;
}

.placeholder-content h3 {
  margin-bottom: 20px;
  color: #2c3e50;
  font-size: 24px;
}

.placeholder-content p {
  font-size: 16px;
  line-height: 1.6;
}
</style>