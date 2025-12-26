<template>
  <div class="forgot-password-view">
    <ForgotPasswordForm @reset-success="handleResetSuccess" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm.vue'

const router = useRouter()

function handleResetSuccess() {
  ElMessage.success('密碼已重設！請使用新密碼登入')
  router.push({ name: 'auth-login' })
}
</script>

<style scoped>
.forgot-password-view {
  width: 100%;
}
</style>
