import { onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * Global handler that turns single-ESC-to-close into double-ESC-to-close for
 * every open `<el-drawer>`.
 *
 * Motivation: Element Plus drawers close on a single ESC by default, so users
 * typing mid-form (comments, reports, editors) can hit ESC and lose everything.
 *
 * How it works: Element Plus registers ONE bubble-phase `keydown` listener on
 * `document` (via its `useEscapeKeydown` hook) that closes the topmost drawer.
 * We register a CAPTURE-phase listener that runs first:
 *  - the first ESC is swallowed (`stopImmediatePropagation`) and a toast hints
 *    that a second ESC will close the drawer;
 *  - a second ESC within {@link ARM_WINDOW_MS} is allowed to propagate so
 *    Element Plus's own handler closes the drawer natively.
 *
 * The X (close) button and modal-overlay click are untouched — they don't go
 * through ESC.
 *
 * @example
 * // In App.vue <script setup>
 * useDoubleEscToClose()
 */

/** How long a first ESC stays "armed" before requiring a fresh first press. */
const ARM_WINDOW_MS = 2000

/**
 * ESC-closable popper selectors. These are teleported into the DOM only while
 * open, so their presence means ESC should close the popper (not the drawer).
 */
const OPEN_POPPER_SELECTORS = [
  '.el-select-dropdown',
  '.el-picker__popper',
  '.el-cascader__dropdown',
  '.el-autocomplete-suggestion',
  '.el-dropdown__popper',
  '.el-color-dropdown',
].join(',')

/**
 * Installs the global double-ESC-to-close behavior for the lifetime of the
 * calling component. Intended to be called once, from App.vue.
 */
export function useDoubleEscToClose(): void {
  let armed = false
  let armTimer: ReturnType<typeof setTimeout> | null = null

  const disarm = (): void => {
    armed = false
    if (armTimer !== null) {
      clearTimeout(armTimer)
      armTimer = null
    }
  }

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return

    // Gate: only intervene when a drawer is actually open.
    if (!document.querySelector('.el-drawer')) {
      disarm()
      return
    }

    // Don't hijack ESC when an inner popper (select, date-picker, …) is open;
    // let ESC close that first.
    if (document.querySelector(OPEN_POPPER_SELECTORS)) return

    // Ignore key-repeat so holding ESC can't blow through to a close.
    if (event.repeat) {
      event.stopImmediatePropagation()
      event.preventDefault()
      return
    }

    if (armed) {
      // Second ESC: let it propagate to Element Plus's native close handler.
      disarm()
      return
    }

    // First ESC: swallow it and hint that a second press will close.
    event.stopImmediatePropagation()
    event.preventDefault()
    armed = true
    ElMessage.info({
      message: '再次按下 ESC 關閉視窗',
      duration: ARM_WINDOW_MS,
      grouping: true,
    })
    armTimer = setTimeout(disarm, ARM_WINDOW_MS)
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown, { capture: true })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown, { capture: true })
    disarm()
  })
}
