<template>
  <div class="turnstile-widget">
    <div :id="widgetId" class="cf-turnstile"></div>
    <div v-if="error" class="turnstile-error">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { rpcClient } from '@/utils/rpc-client'

interface Props {
  /** 是否自動渲染 */
  autoRender?: boolean
  /** 主題 */
  theme?: 'light' | 'dark' | 'auto'
  /** 大小 */
  size?: 'normal' | 'compact'
}

const props = withDefaults(defineProps<Props>(), {
  autoRender: true,
  theme: 'light',
  size: 'normal'
})

const emit = defineEmits<{
  success: [token: string]
  error: [err: unknown]
  expired: []
}>()

const widgetId = ref(`turnstile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const turnstileInstance = ref<string | null>(null)
const error = ref<string | null>(null)
const siteKey = ref<string | null>(null)
const isEnabled = ref(false)
const isLoading = ref(true)

// 獲取 Turnstile 配置
const loadTurnstileConfig = async () => {
  try {
    console.log('TurnstileWidget: Loading config from /api/system/turnstile-config')
    const response = await rpcClient.api.system['turnstile-config'].$post()
    const config = await response.json()
    console.log('TurnstileWidget: Config loaded:', config)

    if (config.success) {
      isEnabled.value = config.data.enabled
      siteKey.value = config.data.siteKey

      if (!isEnabled.value) {
        console.warn('Turnstile is disabled')
        emit('success', 'BYPASS') // 未啟用時發送 bypass token
      }

      if (isEnabled.value && !siteKey.value) {
        error.value = 'Turnstile Site Key 未設定'
        emit('error', new Error('Missing site key'))
      }
    } else {
      error.value = '無法載入驗證配置'
      emit('error', new Error('Failed to load config'))
    }
  } catch (err) {
    console.error('Failed to load Turnstile config:', err)
    error.value = '載入驗證配置失敗'
    emit('error', err)
  } finally {
    isLoading.value = false
  }
}

// 渲染 Turnstile widget
const renderWidget = () => {
  if (!isEnabled.value || !siteKey.value) {
    return
  }

  // 確保 Turnstile API 已載入
  if (typeof window.turnstile === 'undefined') {
    console.error('Turnstile API not loaded')
    error.value = 'Turnstile API 未載入，請重新整理頁面'
    emit('error', new Error('Turnstile API not loaded'))
    return
  }

  try {
    // 渲染 Turnstile widget
    turnstileInstance.value = window.turnstile.render(`#${widgetId.value}`, {
      sitekey: siteKey.value,
      theme: props.theme,
      size: props.size,
      callback: (token: string) => {
        error.value = null
        emit('success', token)
      },
      'error-callback': () => {
        error.value = '驗證失敗，請重新嘗試'
        emit('error', new Error('Turnstile verification failed'))
      },
      'expired-callback': () => {
        error.value = '驗證已過期，請重新驗證'
        emit('expired')
      }
    })
  } catch (err) {
    console.error('Failed to render Turnstile:', err)
    error.value = '無法載入驗證組件'
    emit('error', err)
  }
}

// 重置 widget
const reset = () => {
  if (turnstileInstance.value !== null && typeof window.turnstile !== 'undefined') {
    try {
      window.turnstile.reset(turnstileInstance.value)
      error.value = null
    } catch (err) {
      console.error('Failed to reset Turnstile:', err)
    }
  }
}

// 手動渲染（用於延遲渲染場景）
const render = () => {
  renderWidget()
}

// 組件掛載
onMounted(async () => {
  await loadTurnstileConfig()

  if (props.autoRender && isEnabled.value && siteKey.value) {
    console.log('TurnstileWidget: Waiting for Turnstile API to load...')

    // 等待 Turnstile API 載入
    let checkCount = 0
    const maxChecks = 300 // 30 秒 (300 * 100ms)

    const checkTurnstile = setInterval(() => {
      checkCount++

      const turnstileReady = typeof window.turnstile !== 'undefined' &&
                             typeof window.turnstile.render === 'function'

      if (turnstileReady) {
        console.log('TurnstileWidget: Turnstile API loaded and ready')
        clearInterval(checkTurnstile)
        renderWidget()
      } else if (checkCount >= maxChecks) {
        clearInterval(checkTurnstile)
        console.error('TurnstileWidget: Turnstile API timeout after 30 seconds')
        console.error('window.turnstile:', typeof window.turnstile)
        console.error('turnstile.render:', window.turnstile?.render)
        console.error('Script tag:', document.querySelector('script[src*="turnstile"]'))

        // 嘗試手動載入
        if (!document.querySelector('script[src*="turnstile"]')) {
          console.warn('Turnstile script not found, attempting manual load...')
          const script = document.createElement('script')
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
          script.async = true
          script.onload = () => {
            console.log('Turnstile manually loaded')
            renderWidget()
          }
          document.head.appendChild(script)
        } else {
          error.value = 'Turnstile API 載入超時，請重新整理頁面'
          emit('error', new Error('Turnstile API timeout'))
        }
      } else if (checkCount % 50 === 0) {
        console.log(`TurnstileWidget: Still waiting... (${checkCount * 100}ms)`)
      }
    }, 100)
  }
})

// 組件卸載時清理
onUnmounted(() => {
  if (turnstileInstance.value !== null && typeof window.turnstile !== 'undefined') {
    try {
      window.turnstile.remove(turnstileInstance.value)
    } catch (err) {
      console.error('Failed to remove Turnstile:', err)
    }
  }
})

// 監聽主題變化
watch(() => props.theme, () => {
  // Turnstile 不支援動態切換主題，需要重新渲染
  if (turnstileInstance.value !== null && typeof window.turnstile !== 'undefined') {
    try {
      window.turnstile.remove(turnstileInstance.value)
      renderWidget()
    } catch (err) {
      console.error('Failed to re-render Turnstile:', err)
    }
  }
})

defineExpose({ reset, render })
</script>

<style scoped>
.turnstile-widget {
  margin: 16px 0;
}

.turnstile-error {
  margin-top: 12px;
}

.cf-turnstile {
  display: flex;
  justify-content: center;
}
</style>
