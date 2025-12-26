import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Notification } from './useNotificationFilters'

/**
 * Manages notification selection state using a Set
 * Prevents memory leaks by not mutating notification objects directly
 */
export function useNotificationSelection(
  displayedNotifications: ComputedRef<Notification[]>
) {
  // Use Set for O(1) lookup performance
  const selections = ref(new Set<string>())

  /**
   * Get all selected notifications from the full list
   */
  const selectedNotifications = computed(() => {
    // Defensive check to prevent undefined errors during initial render
    if (!displayedNotifications.value) return []
    return displayedNotifications.value.filter(n =>
      selections.value.has(n.notificationId)
    )
  })

  /**
   * Check if a notification is selected
   */
  const isSelected = (notificationId: string) => {
    return selections.value.has(notificationId)
  }

  /**
   * Toggle selection state for a single notification
   */
  const toggleSelection = (notificationId: string) => {
    if (selections.value.has(notificationId)) {
      selections.value.delete(notificationId)
    } else {
      selections.value.add(notificationId)
    }
  }

  /**
   * Select all displayed notifications
   */
  const selectAllDisplayed = () => {
    if (!displayedNotifications.value) return
    displayedNotifications.value.forEach(n => {
      selections.value.add(n.notificationId)
    })
  }

  /**
   * Deselect all displayed notifications
   */
  const deselectAllDisplayed = () => {
    if (!displayedNotifications.value) return
    displayedNotifications.value.forEach(n => {
      selections.value.delete(n.notificationId)
    })
  }

  /**
   * Clear all selections
   */
  const clearSelections = () => {
    selections.value.clear()
  }

  /**
   * Computed property for "select all" checkbox
   * Returns true if all displayed notifications are selected
   */
  const selectAll = computed({
    get: () => {
      const displayed = displayedNotifications.value
      if (!displayed || displayed.length === 0) return false
      return displayed.every(n => selections.value.has(n.notificationId))
    },
    set: (value: boolean) => {
      if (value) {
        selectAllDisplayed()
      } else {
        deselectAllDisplayed()
      }
    }
  })

  /**
   * Indeterminate state for "select all" checkbox
   * True when some (but not all) displayed notifications are selected
   */
  const isIndeterminate = computed(() => {
    const displayed = displayedNotifications.value
    if (!displayed || displayed.length === 0) return false

    const selectedCount = displayed.filter(n =>
      selections.value.has(n.notificationId)
    ).length

    return selectedCount > 0 && selectedCount < displayed.length
  })

  return {
    // State
    selections,

    // Computed
    selectedNotifications,
    selectAll,
    isIndeterminate,

    // Methods
    isSelected,
    toggleSelection,
    selectAllDisplayed,
    deselectAllDisplayed,
    clearSelections
  }
}
