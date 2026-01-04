import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Drawer state types
 * - expanded: Drawer is fully open showing content
 * - collapsed: Drawer is closed showing trigger bar (~50px)
 * - minimized: Drawer is minimized to 5px with grip-dots icon
 */
export type DrawerState = 'expanded' | 'collapsed' | 'minimized'

/**
 * Drawer information stored in the registry
 */
interface DrawerInfo {
  id: string
  state: DrawerState
  themeColor: string
  drawerName: string
}

/**
 * Pinia Store for managing drawer coordination across components
 *
 * Rules:
 * 1. Only one drawer can be expanded at a time
 * 2. When a drawer expands, all others become minimized
 * 3. Hovering a minimized drawer temporarily restores it to collapsed
 * 4. When the expanded drawer collapses, all minimized drawers restore to collapsed
 */
export const useDrawerCoordinationStore = defineStore('drawerCoordination', () => {
  // Registry of all coordinated drawers
  const drawers = ref<Map<string, DrawerInfo>>(new Map())

  // Currently expanded drawer ID (null if none)
  const expandedDrawerId = ref<string | null>(null)

  // Computed: check if any drawer is expanded
  const hasExpandedDrawer = computed(() => expandedDrawerId.value !== null)

  // Computed: get all drawer IDs
  const drawerIds = computed(() => Array.from(drawers.value.keys()))

  /**
   * Register a drawer in the coordination system
   * @param id - Unique drawer identifier
   * @param info - Drawer information (name, color)
   */
  function registerDrawer(id: string, info: Omit<DrawerInfo, 'id' | 'state'>) {
    drawers.value.set(id, {
      id,
      state: 'collapsed',
      ...info
    })
  }

  /**
   * Unregister a drawer (cleanup on unmount)
   * @param id - Drawer ID to unregister
   */
  function unregisterDrawer(id: string) {
    drawers.value.delete(id)
    if (expandedDrawerId.value === id) {
      expandedDrawerId.value = null
      // Restore all remaining drawers to collapsed
      drawers.value.forEach((drawer) => {
        if (drawer.state === 'minimized') {
          drawer.state = 'collapsed'
        }
      })
    }
  }

  /**
   * Expand a drawer (triggers auto-minimize of others)
   * @param id - Drawer ID to expand
   */
  function expandDrawer(id: string) {
    const drawer = drawers.value.get(id)
    if (!drawer) return

    // Minimize all other drawers
    drawers.value.forEach((d, key) => {
      if (key !== id) {
        d.state = 'minimized'
      }
    })

    drawer.state = 'expanded'
    expandedDrawerId.value = id
  }

  /**
   * Collapse a drawer
   * @param id - Drawer ID to collapse
   */
  function collapseDrawer(id: string) {
    const drawer = drawers.value.get(id)
    if (!drawer) return

    drawer.state = 'collapsed'

    // If this was the expanded drawer, restore others to collapsed
    if (expandedDrawerId.value === id) {
      expandedDrawerId.value = null

      // Restore all minimized drawers to collapsed
      drawers.value.forEach((d) => {
        if (d.state === 'minimized') {
          d.state = 'collapsed'
        }
      })
    }
  }

  /**
   * Handle hover on minimized drawer (temporary restore to collapsed)
   * @param id - Drawer ID being hovered
   */
  function hoverMinimizedDrawer(id: string) {
    const drawer = drawers.value.get(id)
    if (drawer && drawer.state === 'minimized') {
      drawer.state = 'collapsed'
    }
  }

  /**
   * Handle hover end on drawer (return to minimized if needed)
   * @param id - Drawer ID that mouse left
   */
  function unhoverDrawer(id: string) {
    const drawer = drawers.value.get(id)
    if (!drawer) return

    // If another drawer is expanded and this one is collapsed, minimize it
    if (drawer.state === 'collapsed' && hasExpandedDrawer.value) {
      if (expandedDrawerId.value !== id) {
        drawer.state = 'minimized'
      }
    }
  }

  /**
   * Get drawer state by ID
   * @param id - Drawer ID
   * @returns Current drawer state or 'collapsed' if not found
   */
  function getDrawerState(id: string): DrawerState {
    return drawers.value.get(id)?.state ?? 'collapsed'
  }

  /**
   * Get drawer info by ID
   * @param id - Drawer ID
   * @returns Drawer info or undefined if not found
   */
  function getDrawerInfo(id: string): DrawerInfo | undefined {
    return drawers.value.get(id)
  }

  /**
   * Check if a specific drawer is expanded
   * @param id - Drawer ID
   */
  function isDrawerExpanded(id: string): boolean {
    return expandedDrawerId.value === id
  }

  return {
    // State
    drawers,
    expandedDrawerId,
    hasExpandedDrawer,
    drawerIds,

    // Actions
    registerDrawer,
    unregisterDrawer,
    expandDrawer,
    collapseDrawer,
    hoverMinimizedDrawer,
    unhoverDrawer,
    getDrawerState,
    getDrawerInfo,
    isDrawerExpanded
  }
})
