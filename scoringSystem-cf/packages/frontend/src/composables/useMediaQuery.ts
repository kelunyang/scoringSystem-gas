import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 響應式媒體查詢 composable
 * 用於偵測螢幕方向（橫屏/豎屏）
 */
export function useMediaQuery() {
  const isPortrait = ref(false)
  let mediaQuery: MediaQueryList | null = null

  const updateOrientation = (e: MediaQueryListEvent | MediaQueryList) => {
    isPortrait.value = e.matches
  }

  onMounted(() => {
    mediaQuery = window.matchMedia('(orientation: portrait)')
    isPortrait.value = mediaQuery.matches
    mediaQuery.addEventListener('change', updateOrientation)
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', updateOrientation)
  })

  return { isPortrait }
}
