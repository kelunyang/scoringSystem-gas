<template>
  <div class="login-view">
    <LoginForm @login-success="handleLoginSuccess" />
  </div>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import LoginForm from '@/components/auth/LoginForm.vue'

const router = useRouter()
const route = useRoute()

async function handleLoginSuccess() {
  // 獲取 redirect 參數
  const redirect = route.query.redirect as string

  // 跳轉到目標頁面（或首頁）
  await router.push(redirect || { name: 'dashboard' })
}
</script>

<style scoped>
.login-view {
  width: 100%;
}
</style>
