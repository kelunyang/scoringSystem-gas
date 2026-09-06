/**
 * Configuration-driven Permission System
 *
 * This composable reads permission configuration from JSON
 * and provides utilities to check UI visibility based on user permissions.
 */

import { computed } from 'vue'
import { usePermissions } from './usePermissions'
import permissionConfig from '@/config/permissionConfig.json'

/** 一條權限規則：需要哪些權限、用 AND 還是 OR */
export interface PermissionRule {
  required?: string[]
  logic?: string
  customCheck?: boolean
}

/** 分頁（tab）設定 */
export interface TabConfig {
  order?: number
  permissions?: PermissionRule
  [key: string]: unknown
}

/** 一個區塊（section）的設定 */
export interface SectionConfig {
  tabs?: Record<string, TabConfig>
  accessPermissions?: PermissionRule
  features?: Record<string, { permissions: PermissionRule }>
}

/**
 * permissionConfig.json 的形狀。
 *
 * JSON 匯入推導出來的是每個字面值的精確型別，無法用變數當索引，
 * 所以在這裡宣告一次它的實際結構，其餘程式碼都走這個具型別的視圖。
 */
interface PermissionConfigFile {
  navigation: { items: Record<string, { permissions?: PermissionRule }> }
  [section: string]: unknown
}

const typedConfig = permissionConfig as PermissionConfigFile

/** 取出某個區塊的設定 */
function getSection(section: string): SectionConfig | undefined {
  const value = typedConfig[section]
  return value && typeof value === 'object' ? (value as SectionConfig) : undefined
}

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
  const { hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()

  /**
   * Check if a component/feature should be visible based on config
   *
   * @param {Object} config - Permission config object with { required: [], logic: 'AND'|'OR' }
   * @returns {null | boolean} Tri-state: null (loading), true (visible), false (hidden)
   */
  function checkPermissionConfig(rule: PermissionRule | undefined) {
    if (!rule || !rule.required) return true

    const { required, logic = 'OR' } = rule

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
  function canShowNav(navKey: string) {
    const navItem = typedConfig.navigation.items[navKey]
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
  function getVisibleTabs(section: string): TabConfig[] {
    if (isLoading.value) return []

    const sectionConfig = getSection(section)
    if (!sectionConfig || !sectionConfig.tabs) return []

    return Object.values(sectionConfig.tabs)
      .filter(tab => checkPermissionConfig(tab.permissions) === true)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
  function canAccessSection(section: string) {
    const sectionConfig = getSection(section)
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
  function canShowFeature(section: string, featureKey: string) {
    const sectionConfig = getSection(section)
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
 * Get visible tabs for a section as computed ref
 *
 * @param {string} section - Section key
 * @returns {ComputedRef<Array>}
 *
 * @example
 * const adminTabs = useVisibleTabs('systemAdmin')
 */
export function useVisibleTabs(section: string) {
  const { getVisibleTabs } = usePermissionConfig()
  return computed(() => getVisibleTabs(section))
}

