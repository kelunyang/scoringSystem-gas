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

