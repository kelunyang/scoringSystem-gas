/// <reference types="vite/client" />

// Vue 模块声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 环境变量类型定义
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
  readonly VITE_APP_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 全局类型声明
declare global {
  interface Window {
    // Cloudflare API URL (injected by build)
    CLOUDFLARE_API_URL?: string

    // Session warning function
    showSessionWarning?: (remainingMinutes: number) => void

    // Turnstile widget API
    turnstile?: {
      reset: (widgetId?: string) => void
      render: (element: HTMLElement, options: {
        sitekey: string
        callback?: (token: string) => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      remove: (widgetId: string) => void
    }

    // D3.js library (loaded dynamically)
    d3?: typeof import('d3')

    // Vue DevTools instance reference
    __VUE_INSTANCE__?: any
  }
}

// 第三方模块声明（如果需要）
declare module 'randomcolor' {
  interface RandomColorOptions {
    hue?: string | number
    luminosity?: 'bright' | 'light' | 'dark' | 'random'
    count?: number
    seed?: number | string
    format?: 'rgb' | 'rgba' | 'rgbArray' | 'hsl' | 'hsla' | 'hslArray' | 'hex'
    alpha?: number
  }

  function randomColor(options?: RandomColorOptions): string
  function randomColor(options: RandomColorOptions & { count: number }): string[]

  export = randomColor
}

declare module 'vue-use-active-scroll' {
  import { DirectiveBinding } from 'vue'
  export const vActiveScroll: {
    mounted(el: HTMLElement, binding: DirectiveBinding): void
    updated(el: HTMLElement, binding: DirectiveBinding): void
    unmounted(el: HTMLElement): void
  }
}

export {}
