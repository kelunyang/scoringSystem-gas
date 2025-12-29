/**
 * @fileoverview Viewport Detection Composable
 *
 * 使用 Intersection Observer API 偵測元素是否進入視域
 * 用於延遲渲染和動畫觸發，提升頁面效能
 *
 * 使用範例:
 * ```typescript
 * const containerRef = ref<HTMLElement | null>(null)
 * const { hasEntered } = useInViewport(containerRef, { once: true })
 *
 * watch(hasEntered, (entered) => {
 *   if (entered) {
 *     startAnimation()
 *   }
 * })
 * ```
 */

import { ref, watch, onUnmounted, type Ref } from 'vue'

/** Viewport 偵測選項 */
export interface UseInViewportOptions {
  /** 只觸發一次（預設 true，適合動畫只播放一次的場景） */
  once?: boolean
  /** 可見度閾值，0-1 之間（預設 0.1，即 10% 可見時觸發） */
  threshold?: number | number[]
  /** 根元素邊距（預設 '0px'） */
  rootMargin?: string
}

/**
 * Viewport 偵測 Composable
 *
 * @param target - 要觀察的 HTML 元素 ref
 * @param options - 偵測選項
 * @returns isInViewport（目前是否在視域內）和 hasEntered（是否曾進入視域）
 */
export function useInViewport(
  target: Ref<HTMLElement | null>,
  options: UseInViewportOptions = {}
) {
  const { once = true, threshold = 0.1, rootMargin = '0px' } = options

  /** 目前是否在視域內 */
  const isInViewport = ref(false)
  /** 是否曾經進入過視域（用於 once 模式） */
  const hasEntered = ref(false)

  let observer: IntersectionObserver | null = null

  /**
   * 開始觀察目標元素
   */
  const startObserving = () => {
    // 如果目標不存在或已經進入過（once 模式），則不觀察
    if (!target.value || (once && hasEntered.value)) return

    // 如果已有 observer，先清理
    if (observer) {
      observer.disconnect()
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isInViewport.value = true
            hasEntered.value = true

            // 如果只觸發一次，停止觀察
            if (once && observer) {
              observer.disconnect()
              observer = null
            }
          } else if (!once) {
            // 非 once 模式時，離開視域要更新狀態
            isInViewport.value = false
          }
        })
      },
      { threshold, rootMargin }
    )

    observer.observe(target.value)
  }

  /**
   * 停止觀察
   */
  const stopObserving = () => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  // 監聽 target 變化，當 target 有值時開始觀察
  watch(
    target,
    (newTarget) => {
      if (newTarget) {
        startObserving()
      } else {
        stopObserving()
      }
    },
    { immediate: true }
  )

  // 組件卸載時清理
  onUnmounted(() => {
    stopObserving()
  })

  return {
    /** 目前是否在視域內 */
    isInViewport,
    /** 是否曾經進入過視域 */
    hasEntered,
    /** 手動開始觀察 */
    startObserving,
    /** 手動停止觀察 */
    stopObserving
  }
}
