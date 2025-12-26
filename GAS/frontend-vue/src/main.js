import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import apiClient from './utils/api.js'
import errorHandler, { handleError, showSuccess } from './utils/errorHandler.js'
import { syncConsoleSettings, forceLog, forceError } from './utils/logSync.js'

// 異步初始化應用
async function initializeApp() {
  try {
    // 先同步console設定
    await syncConsoleSettings()
    
    // 創建Vue應用
    const app = createApp(App)
    
    // 註冊 Element Plus
    app.use(ElementPlus)
    
    // 全局配置API客戶端和錯誤處理
    app.config.globalProperties.$apiClient = apiClient
    app.config.globalProperties.$errorHandler = errorHandler
    app.config.globalProperties.$handleError = handleError
    app.config.globalProperties.$showSuccess = showSuccess
    
    // 全局錯誤處理
    app.config.errorHandler = (err, vm, info) => {
      handleError(err, {
        title: '應用程式錯誤',
        action: info,
        type: 'error',
        showNotification: true
      })
    }
    
    // 現在console.log會根據後端LOG_CONSOLE設定決定是否輸出
    console.log('🚀 Vue應用啟動中...')
    console.log('📊 Console輸出已與後端LOG_CONSOLE設定同步')
    
    // 掛載到 DOM
    app.mount('#app')
    
    console.log('✅ Vue應用啟動完成')
    
  } catch (error) {
    // 使用forceError確保錯誤能被看到（不受LOG_CONSOLE影響）
    forceError('❌ 應用初始化失敗:', error)
  }
}

// 啟動應用
initializeApp()