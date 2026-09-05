import { createApp } from 'vue'
import type { App as VueApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/_theme-generated.scss' // 自動生成的主題變量（必須在其他樣式之前）
import './styles/_stage-gradients.scss' // Stage 糖果漸層配色（邊緣融合版）
import './styles/_buttons.scss' // 全局按鈕樣式（語義化配色）
import './styles/drawer-unified.scss' // 統一 Drawer 樣式
import './styles/_countdown-button.scss' // CountdownButton 共用樣式
import { VueQueryPlugin } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { createPinia } from 'pinia'
import apiClient from './utils/api'
import errorHandler, { handleError, showSuccess } from './utils/errorHandler'

// Global notification log management (user-isolated)
import { addNotificationGlobally, clearNotificationLogGlobally } from '@/composables/useNotificationLog'

/**
 * Add notification to global log (user-isolated)
 * @param message - Notification message
 * @param level - Notification level
 * @param context - Additional context
 * @param stack - Error stack trace
 */
export function addToNotificationLog(
  message: string,
  level: 'error' | 'warning' | 'success' | 'info' = 'error',
  context: Record<string, any> = {},
  stack: string | null = null
): void {
  addNotificationGlobally({
    timestamp: new Date(),
    message,
    level,
    type: context.type || level,
    context,
    stack
  })
}

/**
 * Clear all notifications (user-isolated)
 */
export function clearNotificationLog(): void {
  clearNotificationLogGlobally()
}

/**
 * Legacy function for backward compatibility
 * @param error - Error object or string
 * @param context - Additional context
 */
export function addToErrorLog(error: Error | string, context: Record<string, any> = {}): void {
  addToNotificationLog(
    typeof error === 'string' ? error : error.message || String(error),
    'error',
    context,
    typeof error === 'string' ? null : error.stack
  )
}

// Wrap all ElMessage methods to capture notifications globally
const originalElMessage = {
  error: ElMessage.error,
  success: ElMessage.success,
  warning: ElMessage.warning,
  info: ElMessage.info
}

type MessageOptions = string | {
  message?: string
  [key: string]: any
}

// @ts-expect-error - Overriding ElMessage methods for logging
ElMessage.error = ((options: MessageOptions) => {
  const message = typeof options === 'string' ? options : options?.message || 'Unknown error'
  addToNotificationLog(
    message,
    'error',
    {
      source: 'ElMessage',
      type: 'user-facing-error',
      options: typeof options === 'object' ? options : { message: options }
    },
    new Error().stack
  )
  return originalElMessage.error(options)
})

// @ts-expect-error - Overriding ElMessage methods for logging
ElMessage.success = ((options: MessageOptions) => {
  const message = typeof options === 'string' ? options : options?.message || 'Success'
  addToNotificationLog(
    message,
    'success',
    {
      source: 'ElMessage',
      type: 'user-facing-success',
      options: typeof options === 'object' ? options : { message: options }
    }
  )
  return originalElMessage.success(options)
})

// @ts-expect-error - Overriding ElMessage methods for logging
ElMessage.warning = ((options: MessageOptions) => {
  const message = typeof options === 'string' ? options : options?.message || 'Warning'
  addToNotificationLog(
    message,
    'warning',
    {
      source: 'ElMessage',
      type: 'user-facing-warning',
      options: typeof options === 'object' ? options : { message: options }
    }
  )
  return originalElMessage.warning(options)
})

// @ts-expect-error - Overriding ElMessage methods for logging
ElMessage.info = ((options: MessageOptions) => {
  const message = typeof options === 'string' ? options : options?.message || 'Info'
  addToNotificationLog(
    message,
    'info',
    {
      source: 'ElMessage',
      type: 'user-facing-info',
      options: typeof options === 'object' ? options : { message: options }
    }
  )
  return originalElMessage.info(options)
})

// 异步初始化应用
async function initializeApp(): Promise<void> {
  try {
    // 创建Vue应用
    const app: VueApp = createApp(App)

    // 注册 Pinia
    const pinia = createPinia()
    app.use(pinia)

    // 注册 Element Plus
    app.use(ElementPlus)

    // 注册 Vue Router
    app.use(router)

    // 注册 Vue Query
    app.use(VueQueryPlugin, {
      queryClientConfig: {
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 10, // 10分钟，与JWT有效期对齐
            retry: (failureCount: number, error: any) => {
              // 认证错误不重试
              const authErrors = ['NO_SESSION', 'TOKEN_EXPIRED', 'UNAUTHORIZED', 'FORBIDDEN']
              if (authErrors.includes(error.message)) {
                return false
              }
              return failureCount < 1
            },
            refetchOnWindowFocus: false, // 视窗 focus 不自动刷新
            refetchOnReconnect: true // 网络重连时刷新
          },
          mutations: {
            retry: 1
          }
        }
      }
    })

    // 全局配置API客户端和错误处理
    app.config.globalProperties.$apiClient = apiClient
    app.config.globalProperties.$errorHandler = errorHandler
    app.config.globalProperties.$handleError = handleError
    app.config.globalProperties.$showSuccess = showSuccess
    app.config.globalProperties.$message = ElMessage

    // 全局挂载 ElMessage，让所有组件可以使用 this.$message
    // 这样就不需要在每个组件单独导入了

    // 全局错误处理
    app.config.errorHandler = (err: any, vm: any, info: string) => {
      // 记录到全域错误日志
      addToErrorLog(err, {
        source: 'Vue Global',
        type: 'render-error',
        component: vm?.$options?.name || 'Unknown',
        info: info
      })

      // 调用原有的错误处理
      handleError(err, {
        title: '应用程序错误',
        action: info,
        type: 'error',
        showNotification: true
      })

      // 同时在 console 输出完整错误信息
      console.error('Vue Error:', err)
      console.error('Component:', vm)
      console.error('Info:', info)
    }

    // 现在console.log会根据后端LOG_CONSOLE设定决定是否输出
    console.log('🚀 Vue应用启动中...')
    console.log('📊 Console输出已与后端LOG_CONSOLE设定同步')

    // 挂载到 DOM
    app.mount('#app')

    console.log('✅ Vue应用启动完成')

    // 隐藏初始载入画面
    const win = window as any
    if (win.hideInitialLoading) {
      win.hideInitialLoading()
    }

  } catch (error) {
    // 使用forceError确保错误能被看到（不受LOG_CONSOLE影响）
    console.error('❌ 应用初始化失败:', error)
  }
}

// 启动应用
initializeApp()
