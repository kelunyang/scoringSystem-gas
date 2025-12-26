<template>
  <!-- Render content only if user has required permissions -->
  <slot v-if="hasAccess === true" />

  <!-- Optional fallback content when no permission -->
  <slot v-else-if="hasAccess === false && $slots.fallback" name="fallback" />

  <!-- Loading state (optional) -->
  <slot v-else-if="hasAccess === null && $slots.loading" name="loading" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePermissions } from '@/composables/usePermissions'

/**
 * PermissionGate Component
 *
 * Declarative permission checking for conditional rendering
 *
 * @example Basic usage (single permission)
 * <PermissionGate permission="system_admin">
 *   <el-button>Admin Only Button</el-button>
 * </PermissionGate>
 *
 * @example Multiple permissions (OR logic)
 * <PermissionGate :permissions="['manage_users', 'system_admin']">
 *   <el-button>User Management</el-button>
 * </PermissionGate>
 *
 * @example Multiple permissions (AND logic)
 * <PermissionGate :permissions="['manage_users', 'system_admin']" logic="AND">
 *   <el-button>Requires Both Permissions</el-button>
 * </PermissionGate>
 *
 * @example With fallback content
 * <PermissionGate permission="system_admin">
 *   <el-button type="primary">Admin Action</el-button>
 *   <template #fallback>
 *     <el-button disabled>No Permission</el-button>
 *   </template>
 * </PermissionGate>
 *
 * @example With loading state
 * <PermissionGate permission="system_admin">
 *   <el-button>Admin Action</el-button>
 *   <template #loading>
 *     <el-skeleton :rows="1" animated />
 *   </template>
 * </PermissionGate>
 */

const props = defineProps({
  /**
   * Single permission to check
   * Use this OR the permissions array, not both
   */
  permission: {
    type: String,
    default: null
  },

  /**
   * Array of permissions to check
   * Use this OR the single permission, not both
   */
  permissions: {
    type: Array as () => string[],
    default: null
  },

  /**
   * Logic for multiple permissions
   * 'OR' - user needs ANY of the permissions (default)
   * 'AND' - user needs ALL of the permissions
   */
  logic: {
    type: String,
    default: 'OR',
    validator: (value: string) => ['OR', 'AND'].includes(value)
  },

  /**
   * Invert the logic (show content when user DOESN'T have permission)
   * Useful for "upgrade to premium" prompts
   */
  invert: {
    type: Boolean,
    default: false
  }
})

const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions()

/**
 * Compute whether user has access
 * Returns: null (loading/error) | true | false
 */
const hasAccess = computed(() => {
  let result

  // Handle single permission
  if (props.permission) {
    result = hasPermission(props.permission as string)
  }
  // Handle multiple permissions
  else if (props.permissions && props.permissions.length > 0) {
    if (props.logic === 'OR') {
      result = hasAnyPermission(props.permissions as string[])
    } else {
      result = hasAllPermissions(props.permissions as string[])
    }
  }
  // No permissions specified - always show (useful for debugging)
  else {
    result = true
  }

  // Apply invert logic
  if (props.invert && result !== null) {
    return !result
  }

  return result
})
</script>
