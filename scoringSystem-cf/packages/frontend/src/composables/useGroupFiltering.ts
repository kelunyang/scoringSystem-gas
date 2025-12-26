/**
 * Composable for filtering groups by search text, status, and inactive visibility
 *
 * Supports both ProjectGroup and GlobalGroup with different status representations:
 * - ProjectGroup uses `status: 'active' | 'inactive'`
 * - GlobalGroup uses `isActive: boolean`
 */

import { computed, unref, type ComputedRef, type Ref } from 'vue'

interface GroupWithStatus {
  groupName: string
  status?: 'active' | 'inactive'
  isActive?: boolean
}

export function useGroupFiltering<T extends GroupWithStatus>(
  groups: ComputedRef<T[]> | Ref<T[]>,
  searchText: ComputedRef<string> | Ref<string>,
  statusFilter: ComputedRef<string> | Ref<string>,
  showInactive?: ComputedRef<boolean> | Ref<boolean>
) {
  const filteredGroups = computed(() => {
    let result = unref(groups)

    // Hide inactive groups if showInactive is false (default behavior)
    // This filter is applied BEFORE statusFilter to hide inactive groups by default
    if (showInactive !== undefined && !unref(showInactive)) {
      result = result.filter(group => {
        // ProjectGroup uses 'status' field
        if ('status' in group && group.status !== undefined) {
          return group.status !== 'inactive'
        }
        // GlobalGroup uses 'isActive' field
        else if ('isActive' in group && group.isActive !== undefined) {
          return group.isActive === true
        }
        return true
      })
    }

    // Filter by search text
    if (unref(searchText)) {
      const searchLower = unref(searchText).toLowerCase()
      result = result.filter(group => {
        // Cache toLowerCase result to avoid repeated calls
        const groupNameLower = group.groupName.toLowerCase()
        return groupNameLower.includes(searchLower)
      })
    }

    // Filter by status (handle both ProjectGroup and GlobalGroup)
    // This allows further refinement when statusFilter is set (e.g., show only inactive if showInactive is true)
    if (unref(statusFilter)) {
      const filterValue = unref(statusFilter)
      result = result.filter(group => {
        // ProjectGroup uses 'status' field
        if ('status' in group && group.status !== undefined) {
          return group.status === filterValue
        }
        // GlobalGroup uses 'isActive' field
        else if ('isActive' in group && group.isActive !== undefined) {
          return group.isActive === (filterValue === 'active')
        }
        return true
      })
    }

    return result
  })

  return {
    filteredGroups
  }
}
