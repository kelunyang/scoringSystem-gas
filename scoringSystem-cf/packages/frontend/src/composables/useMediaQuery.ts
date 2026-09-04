import { ref, onMounted, onUnmounted } from 'vue'

const PORTRAIT_QUERY = '(orientation: portrait)'

const canMatchMedia = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

const matchPortrait = (): boolean =>
  canMatchMedia() ? window.matchMedia(PORTRAIT_QUERY).matches : false

/**
 * 響應式媒體查詢 composable
 * 用於偵測螢幕方向（橫屏/豎屏）
 *
 * 注意：初始值在 setup 階段就取得，onMounted 之前讀 isPortrait 也是正確的。
 */
export function useMediaQuery() {
  const isPortrait = ref(matchPortrait())
  let mediaQuery: MediaQueryList | null = null

  const updateOrientation = (e: MediaQueryListEvent | MediaQueryList) => {
    isPortrait.value = e.matches
  }

  onMounted(() => {
    if (!canMatchMedia()) return
    mediaQuery = window.matchMedia(PORTRAIT_QUERY)
    isPortrait.value = mediaQuery.matches
    mediaQuery.addEventListener('change', updateOrientation)
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', updateOrientation)
  })

  return { isPortrait }
}
