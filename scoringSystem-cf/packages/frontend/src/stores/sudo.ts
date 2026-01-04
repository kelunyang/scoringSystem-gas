import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Target user info for sudo mode
 */
export interface SudoTargetUser {
  userId: string
  userEmail: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
  groupName?: string
  role?: 'leader' | 'member'
}

/**
 * Pinia Store for managing Sudo mode state
 *
 * Sudo mode allows Observer/Teacher to view the system
 * as if they were a student (Level 3-5).
 */
export const useSudoStore = defineStore('sudo', () => {
  // Core state
  const isActive = ref(false)
  const targetUser = ref<SudoTargetUser | null>(null)
  const projectId = ref<string | null>(null)

  // Session storage keys
  const STORAGE_KEY_ACTIVE = 'sudo_active'
  const STORAGE_KEY_TARGET = 'sudo_target'
  const STORAGE_KEY_PROJECT = 'sudo_project'

  /**
   * Initialize from session storage
   * Called on app mount to restore sudo state
   */
  const initFromStorage = () => {
    try {
      const storedActive = sessionStorage.getItem(STORAGE_KEY_ACTIVE)
      const storedTarget = sessionStorage.getItem(STORAGE_KEY_TARGET)
      const storedProject = sessionStorage.getItem(STORAGE_KEY_PROJECT)

      if (storedActive === 'true' && storedTarget && storedProject) {
        isActive.value = true
        targetUser.value = JSON.parse(storedTarget)
        projectId.value = storedProject
        console.log('🕵️ Sudo mode restored from session:', targetUser.value?.displayName)
      }
    } catch (error) {
      console.error('Failed to restore sudo state:', error)
      clearStorage()
    }
  }

  /**
   * Clear storage
   */
  const clearStorage = () => {
    sessionStorage.removeItem(STORAGE_KEY_ACTIVE)
    sessionStorage.removeItem(STORAGE_KEY_TARGET)
    sessionStorage.removeItem(STORAGE_KEY_PROJECT)
  }

  /**
   * Save to storage
   */
  const saveToStorage = () => {
    if (isActive.value && targetUser.value && projectId.value) {
      sessionStorage.setItem(STORAGE_KEY_ACTIVE, 'true')
      sessionStorage.setItem(STORAGE_KEY_TARGET, JSON.stringify(targetUser.value))
      sessionStorage.setItem(STORAGE_KEY_PROJECT, projectId.value)
    } else {
      clearStorage()
    }
  }

  /**
   * Enter sudo mode
   * @param target - The user to impersonate
   * @param pid - The project ID (sudo is limited to this project)
   */
  const enterSudo = (target: SudoTargetUser, pid: string) => {
    isActive.value = true
    targetUser.value = target
    projectId.value = pid
    saveToStorage()
    console.log('🕵️ Entered sudo mode as:', target.displayName)
  }

  /**
   * Exit sudo mode
   */
  const exitSudo = () => {
    console.log('🕵️ Exiting sudo mode')
    isActive.value = false
    targetUser.value = null
    projectId.value = null
    clearStorage()
  }

  /**
   * Check if sudo is active for a specific project
   */
  const isActiveForProject = (pid: string): boolean => {
    return isActive.value && projectId.value === pid
  }

  /**
   * Get sudo headers for API requests
   * Returns empty object if not in sudo mode
   */
  const getSudoHeaders = computed(() => {
    if (!isActive.value || !targetUser.value || !projectId.value) {
      return {}
    }
    return {
      'X-Sudo-As': targetUser.value.userEmail,
      'X-Sudo-Project': projectId.value
    }
  })

  /**
   * Display name for UI
   */
  const displayInfo = computed(() => {
    if (!isActive.value || !targetUser.value) {
      return null
    }
    return {
      name: targetUser.value.displayName,
      email: targetUser.value.userEmail,
      group: targetUser.value.groupName,
      role: targetUser.value.role === 'leader' ? '組長' : '組員',
      avatarSeed: targetUser.value.avatarSeed,
      avatarStyle: targetUser.value.avatarStyle
    }
  })

  return {
    // State
    isActive,
    targetUser,
    projectId,

    // Computed
    getSudoHeaders,
    displayInfo,

    // Actions
    initFromStorage,
    enterSudo,
    exitSudo,
    isActiveForProject
  }
})
