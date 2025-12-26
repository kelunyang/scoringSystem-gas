import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Pinia Store for managing the global Permissions Drawer state
 *
 * This store controls the visibility and context of the permissions drawer,
 * which can be triggered from multiple places (TopBar, Sidebar, etc.)
 */
export const usePermissionsDrawerStore = defineStore('permissionsDrawer', () => {
  // Drawer visibility state
  const isOpen = ref(false)

  // Current project ID (null when not in a project context)
  const projectId = ref<string | null>(null)

  /**
   * Open the permissions drawer
   * @param pid - Optional project ID for project-specific permissions
   */
  const open = (pid?: string | null) => {
    projectId.value = pid || null
    isOpen.value = true
  }

  /**
   * Close the permissions drawer
   */
  const close = () => {
    isOpen.value = false
  }

  return {
    // State
    isOpen,
    projectId,

    // Actions
    open,
    close
  }
})
