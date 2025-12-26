/**
 * @fileoverview Breadcrumb and page title management composable
 * Centralized state management for breadcrumb navigation and document title
 */

import type { Ref, ComputedRef } from 'vue'
import { ref, computed, watchEffect } from 'vue'
import { rpcClient } from '@/utils/rpc-client'

// Module-level state (shared across all components)
const systemTitle = ref('評分系統')
const brandingIcon = ref('fa-star')
const pageTitle = ref('專案')
const projectTitle = ref('')

interface BreadcrumbReturn {
  systemTitle: ComputedRef<string>
  brandingIcon: ComputedRef<string>
  pageTitle: ComputedRef<string>
  projectTitle: ComputedRef<string>
  breadcrumbItems: ComputedRef<string[]>
  setSystemTitle: (title: string) => void
  setBrandingIcon: (icon: string) => void
  setPageTitle: (title: string) => void
  setProjectTitle: (title: string) => void
  clearProjectTitle: () => void
  fetchSystemTitle: () => Promise<void>
}

/**
 * Breadcrumb management composable
 * Provides centralized state and methods for managing page titles and breadcrumb navigation
 *
 * @returns Breadcrumb state and methods
 *
 * @example
 * // In Dashboard.vue
 * import { useBreadcrumb } from '@/composables/useBreadcrumb'
 * const { setPageTitle } = useBreadcrumb()
 * onMounted(() => {
 *   setPageTitle('首頁')
 * })
 */
export function useBreadcrumb(): BreadcrumbReturn {
  // Computed breadcrumb items array
  const breadcrumbItems = computed(() => {
    const items = ['首頁']
    if (pageTitle.value) items.push(pageTitle.value)
    if (projectTitle.value) items.push(projectTitle.value)
    return items
  })

  // Auto-update document.title whenever breadcrumb items change
  watchEffect(() => {
    document.title = breadcrumbItems.value.join(' > ')
  })

  /**
   * Fetch system title and branding icon from API
   * Called once when App.vue mounts
   */
  const fetchSystemTitle = async (): Promise<void> => {
    try {
      const response = await rpcClient.system.info.$get()
      const data = await response.json() as any
      if (data.success && data.data) {
        if (data.data.systemTitle) {
          systemTitle.value = data.data.systemTitle
        }
        if (data.data.brandingIcon) {
          brandingIcon.value = data.data.brandingIcon
        }
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error)
      // Keep default values on error - graceful degradation
    }
  }

  /**
   * Set system title
   * @param title - System title
   */
  const setSystemTitle = (title: string): void => {
    systemTitle.value = title
  }

  /**
   * Set branding icon
   * @param icon - FontAwesome icon class (e.g., 'fa-star')
   */
  const setBrandingIcon = (icon: string): void => {
    brandingIcon.value = icon
  }

  /**
   * Set page title
   * @param title - Page title (e.g., '首頁', '錢包')
   */
  const setPageTitle = (title: string): void => {
    pageTitle.value = title
  }

  /**
   * Set project title
   * @param title - Project title
   */
  const setProjectTitle = (title: string): void => {
    projectTitle.value = title
  }

  /**
   * Clear project title
   * Called when navigating back to dashboard
   */
  const clearProjectTitle = (): void => {
    projectTitle.value = ''
  }

  return {
    // Readonly computed state
    systemTitle: computed(() => systemTitle.value),
    brandingIcon: computed(() => brandingIcon.value),
    pageTitle: computed(() => pageTitle.value),
    projectTitle: computed(() => projectTitle.value),
    breadcrumbItems,

    // Methods
    setSystemTitle,
    setBrandingIcon,
    setPageTitle,
    setProjectTitle,
    clearProjectTitle,
    fetchSystemTitle
  }
}
