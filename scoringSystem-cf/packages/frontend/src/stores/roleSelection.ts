import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Pinia Store for managing role selection across components
 *
 * This store provides a shared, reactive state for role selection that
 * syncs between PermissionsDrawer and ProjectDetail automatically.
 */
export const useRoleSelectionStore = defineStore('roleSelection', () => {
  // Map of projectId -> selected role
  const selectedRoles = ref<Record<string, string>>({})

  /**
   * Get the selected role for a project
   * @param projectId - The project ID
   * @returns The selected role or null if not set
   */
  const getRole = (projectId: string): string | null => {
    return selectedRoles.value[projectId] || null
  }

  /**
   * Set the selected role for a project
   * @param projectId - The project ID
   * @param role - The role to set
   */
  const setRole = (projectId: string, role: string) => {
    selectedRoles.value[projectId] = role
    // Persist to localStorage for cross-session persistence
    localStorage.setItem(`activeRole_${projectId}`, role)
  }

  /**
   * Initialize role from localStorage if not already in store
   * @param projectId - The project ID
   */
  const initFromStorage = (projectId: string) => {
    const stored = localStorage.getItem(`activeRole_${projectId}`)
    if (stored && !selectedRoles.value[projectId]) {
      selectedRoles.value[projectId] = stored
    }
  }

  /**
   * Clear the selected role for a project
   * @param projectId - The project ID
   */
  const clearRole = (projectId: string) => {
    delete selectedRoles.value[projectId]
    localStorage.removeItem(`activeRole_${projectId}`)
  }

  return {
    // State
    selectedRoles,

    // Actions
    getRole,
    setRole,
    initFromStorage,
    clearRole
  }
})
