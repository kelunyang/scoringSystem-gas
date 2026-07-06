<template>
  <div id="app">
    <router-view />
    <!-- Global Permissions Drawer -->
    <PermissionsDrawer />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useWebSocketStore } from './stores/websocket'
import { useSudoStore } from './stores/sudo'
import { useAuth } from './composables/useAuth'
import { useBreadcrumb } from './composables/useBreadcrumb'
import { useDoubleEscToClose } from './composables/useDoubleEscToClose'
import { setCurrentUserId } from './utils/errorHandler'
import { setGlobalCurrentUserId } from './composables/useNotificationLog'
import { updateFavicon } from './utils/favicon'
import PermissionsDrawer from './components/common/PermissionsDrawer.vue'

// 🕵️ 在最早期同步初始化 sudo store（從 sessionStorage 恢復）
// 必須在 script setup 頂層執行，不能放在 onMounted，
// 確保在子元件的 composables 執行前就已經初始化
const sudoStore = useSudoStore()
sudoStore.initFromStorage()

const websocket = useWebSocketStore()
// Vue 3 Best Practice: Use unified useAuth() composable
const { token, userId } = useAuth()
const { brandingIcon, fetchSystemTitle } = useBreadcrumb()

// 雙擊 ESC 才關閉 el-drawer，避免打字中誤按 ESC 遺失內容
useDoubleEscToClose()

// 監聽 userId 變化，設置全局 userId（用於日誌隔離）
watch(userId, (newUserId) => {
  setCurrentUserId(newUserId || null)
  setGlobalCurrentUserId(newUserId || null)
}, { immediate: true })

// 監聽 brandingIcon 變化，動態更新 favicon
watch(brandingIcon, async (newIcon) => {
  if (newIcon) {
    await updateFavicon(newIcon)
  }
}, { immediate: true })

onMounted(async () => {
  // 取得系統資訊（包含 brandingIcon）
  await fetchSystemTitle()

  // Setup WebSocket（僅在已登入時連接）
  if (token.value) {
    websocket.connect()
  }
})

onBeforeUnmount(() => {
  websocket.disconnect()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: 'Huninn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f7fa;
}

#app {
  height: 100vh;
}
</style>
