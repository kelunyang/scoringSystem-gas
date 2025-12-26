<template>
  <div class="register-view">
    <RegisterForm @register-success="handleRegisterSuccess" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import RegisterForm from '@/components/auth/RegisterForm.vue'

const router = useRouter()

function handleRegisterSuccess() {
  ElMessage.success('註冊成功！請登入')

  // 註冊成功後跳轉到登入頁（保留 redirect 參數）
  router.push({
    name: 'auth-login',
    query: router.currentRoute.value.query
  })
}
</script>

<style scoped>
.register-view {
  width: 100%;
}
</style>
