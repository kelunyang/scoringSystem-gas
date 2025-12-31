import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Pinia Store for managing the global Notification Center state
 *
 * This store controls the visibility of the notification center drawer,
 * which exists in both TopBarUserControls (landscape) and MainLayout sidebar (portrait).
 * Using a global store ensures that both instances can be controlled from anywhere.
 */
export const useNotificationCenterStore = defineStore('notificationCenter', () => {
  // Drawer visibility state
  const isOpen = ref(false)

  /**
   * Open the notification center drawer
   */
  const open = () => {
    isOpen.value = true
  }

  /**
   * Close the notification center drawer
   */
  const close = () => {
    isOpen.value = false
  }

  /**
   * Toggle the notification center drawer
   */
  const toggle = () => {
    isOpen.value = !isOpen.value
  }

  return {
    // State
    isOpen,

    // Actions
    open,
    close,
    toggle
  }
})
