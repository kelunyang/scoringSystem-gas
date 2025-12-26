/**
 * Group Selection Composable
 *
 * Provides multi-select functionality for group management.
 * Handles checkbox selection state and batch operations.
 *
 * DRY principle: Replaces duplicate selection code in ProjectGroups and GlobalGroups
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface UseGroupSelectionReturn {
  selectedIds: Ref<Set<string>>
  selectedCount: ComputedRef<number>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  toggleAll: (ids: string[]) => void
  clear: () => void
  isAllSelected: (ids: string[]) => boolean
  hasPartialSelection: (ids: string[]) => boolean
}

/**
 * Group selection state management
 *
 * @returns {UseGroupSelectionReturn} Selection state and methods
 *
 * @example
 * ```ts
 * const { selectedIds, toggle, toggleAll, clear } = useGroupSelection()
 *
 * // Toggle single group
 * toggle('grp_001')
 *
 * // Toggle all groups
 * toggleAll(groupIds)
 *
 * // Clear all selections
 * clear()
 * ```
 */
export function useGroupSelection(): UseGroupSelectionReturn {
  // Use reactive() would be better, but ref() with manual update works too
  const selectedIds = ref(new Set<string>())

  const selectedCount = computed(() => selectedIds.value.size)

  const isSelected = (id: string): boolean => {
    return selectedIds.value.has(id)
  }

  const toggle = (id: string): void => {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet // Trigger reactivity
  }

  const toggleAll = (ids: string[]): void => {
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.value.has(id))

    if (allSelected) {
      // Deselect all
      selectedIds.value = new Set()
    } else {
      // Select all
      selectedIds.value = new Set(ids)
    }
  }

  const clear = (): void => {
    selectedIds.value = new Set()
  }

  const isAllSelected = (ids: string[]): boolean => {
    return ids.length > 0 && ids.every(id => selectedIds.value.has(id))
  }

  const hasPartialSelection = (ids: string[]): boolean => {
    return selectedIds.value.size > 0 && !isAllSelected(ids)
  }

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggle,
    toggleAll,
    clear,
    isAllSelected,
    hasPartialSelection
  }
}
