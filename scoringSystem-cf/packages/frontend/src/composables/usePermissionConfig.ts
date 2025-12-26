/**
 * Configuration-driven Permission System
 *
 * This composable reads permission configuration from JSON
 * and provides utilities to check UI visibility based on user permissions.
 */

import { computed } from 'vue'
import { usePermissions } from './usePermissions'
import permissionConfig from '@/config/permissionConfig.json'

/**
 * Main permission configuration composable
 *
 * @returns {Object} Configuration-based permission utilities
 *
 * @example
 * const { canShowNav, getVisibleTabs } = usePermissionConfig()
 * const showAdmin = canShowNav('admin')
 * const visibleTabs = getVisibleTabs('systemAdmin')
 */
export function usePermissionConfig() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()

  /**
   * Check if a component/feature should be visible based on config
   *
   * @param {Object} config - Permission config object with { required: [], logic: 'AND'|'OR' }
   * @returns {null | boolean} Tri-state: null (loading), true (visible), false (hidden)
   */
  function checkPermissionConfig(config: any) {
    if (!config || !config.required) return true

    const { required, logic = 'OR' } = config

    // No permissions required
    if (required.length === 0) return true

    if (logic === 'OR') {
      return hasAnyPermission(required)
    } else {
      return hasAllPermissions(required)
    }
  }

  /**
   * Check if a navigation item should be visible
   *
   * @param {string} navKey - Navigation item key (e.g., 'admin', 'dashboard')
   * @returns {null | boolean}
   *
   * @example
   * const showAdmin = canShowNav('admin')
   * // Use in template: v-if="showAdmin === true"
   */
  function canShowNav(navKey: any) {
    const navItem = (permissionConfig.navigation.items as any)[navKey]
    if (!navItem) return false

    return checkPermissionConfig(navItem.permissions)
  }

  /**
   * Get all visible navigation items
   *
   * @returns {Array} Array of navigation items user can see
   *
   * @example
   * const visibleNavItems = getVisibleNavItems()
   */
  function getVisibleNavItems() {
    if (isLoading.value) return []

    return Object.values(permissionConfig.navigation.items)
      .filter(item => checkPermissionConfig(item.permissions) === true)
      .sort((a, b) => a.order - b.order)
  }

  /**
   * Get visible tabs for a section (e.g., systemAdmin)
   *
   * @param {string} section - Section key (e.g., 'systemAdmin')
   * @returns {Array} Array of tabs user can see
   *
   * @example
   * const adminTabs = getVisibleTabs('systemAdmin')
   */
  function getVisibleTabs(section: any) {
    if (isLoading.value) return []

    const sectionConfig = (permissionConfig as any)[section]
    if (!sectionConfig || !sectionConfig.tabs) return []

    return Object.values(sectionConfig.tabs)
      .filter(tab => checkPermissionConfig((tab as any).permissions) === true)
      .sort((a: any, b: any) => a.order - b.order)
  }

  /**
   * Check if user can access a specific section
   *
   * @param {string} section - Section key (e.g., 'systemAdmin')
   * @returns {null | boolean}
   *
   * @example
   * const canAccessAdmin = canAccessSection('systemAdmin')
   */
  function canAccessSection(section: any) {
    const sectionConfig = (permissionConfig as any)[section]
    if (!sectionConfig) return false

    // Check if section has access permissions defined
    if (sectionConfig.accessPermissions) {
      return checkPermissionConfig(sectionConfig.accessPermissions)
    }

    // If no access permissions defined, check if user can see any tabs
    const visibleTabs = getVisibleTabs(section)
    return visibleTabs.length > 0
  }

  /**
   * Check if a specific feature should be visible
   *
   * @param {string} section - Section key (e.g., 'projectDetail', 'dashboard')
   * @param {string} featureKey - Feature key
   * @returns {null | boolean}
   *
   * @example
   * const canManageStages = canShowFeature('projectDetail', 'manageStages')
   */
  function canShowFeature(section: any, featureKey: any) {
    const sectionConfig = (permissionConfig as any)[section]
    if (!sectionConfig || !sectionConfig.features) return false

    const feature = sectionConfig.features[featureKey]
    if (!feature) return false

    // Handle custom checks
    if (feature.permissions.customCheck) {
      // Custom check logic would be implemented elsewhere
      return null
    }

    return checkPermissionConfig(feature.permissions)
  }

  /**
   * Get the full permission config (for debugging)
   */
  const config = computed(() => permissionConfig)

  return {
    // Config access
    config,

    // Navigation checks
    canShowNav,
    getVisibleNavItems,

    // Section checks
    canAccessSection,
    getVisibleTabs,

    // Feature checks
    canShowFeature,

    // Low-level check function
    checkPermissionConfig
  }
}

/**
 * Get visible navigation items as computed ref
 *
 * @returns {ComputedRef<Array>}
 *
 * @example
 * const navItems = useVisibleNavItems()
 * // In template: v-for="item in navItems"
 */
export function useVisibleNavItems() {
  const { getVisibleNavItems } = usePermissionConfig()
  return computed(() => getVisibleNavItems())
}

/**
 * Get visible tabs for a section as computed ref
 *
 * @param {string} section - Section key
 * @returns {ComputedRef<Array>}
 *
 * @example
 * const adminTabs = useVisibleTabs('systemAdmin')
 */
export function useVisibleTabs(section: any) {
  const { getVisibleTabs } = usePermissionConfig()
  return computed(() => getVisibleTabs(section))
}

/**
 * Check if navigation item should be visible (computed)
 *
 * @param {string} navKey - Navigation item key
 * @returns {ComputedRef<null | boolean>}
 *
 * @example
 * const showAdmin = useCanShowNav('admin')
 */
export function useCanShowNav(navKey: any) {
  const { canShowNav } = usePermissionConfig()
  return computed(() => canShowNav(navKey))
}

/**
 * Check if a feature should be visible (computed)
 *
 * @param {string} section - Section key (e.g., 'systemAdmin')
 * @param {string} tab - Tab key (e.g., 'settings')
 * @param {string} featureKey - Feature key (e.g., 'systemLogs')
 * @returns {ComputedRef<null | boolean>}
 *
 * @example
 * const canViewLogs = useFeaturePermission('systemAdmin', 'settings', 'systemLogs')
 */
export function useFeaturePermission(section: any, tab: any, featureKey: any) {
  const { canShowFeature } = usePermissionConfig()
  return computed(() => canShowFeature(section, featureKey))
}
