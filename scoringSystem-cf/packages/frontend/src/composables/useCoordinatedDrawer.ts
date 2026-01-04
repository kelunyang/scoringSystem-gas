import { ref, computed, onMounted, onUnmounted, type ComputedRef, type Ref, type WritableComputedRef } from 'vue'
import { useDrawerCoordinationStore, type DrawerState } from '@/stores/drawerCoordination'
import { storeToRefs } from 'pinia'

/**
 * Options for creating a coordinated drawer
 */
export interface CoordinatedDrawerOptions {
  /** Unique drawer identifier */
  id: string
  /** Display name for the drawer */
  drawerName: string
  /** Theme color for styling */
  themeColor: string
  /** Initial open state (default: false) */
  initialOpen?: boolean
}

/**
 * Return type of useCoordinatedDrawer
 */
export interface CoordinatedDrawerReturn {
  // Reactive state
  drawerState: ComputedRef<DrawerState>
  isExpanded: ComputedRef<boolean>
  isCollapsed: ComputedRef<boolean>
  isMinimized: ComputedRef<boolean>
  isHovering: Ref<boolean>
  hasExpandedDrawer: ComputedRef<boolean>

  // v-model compatible
  modelValue: WritableComputedRef<boolean>

  // Actions
  expand: () => void
  collapse: () => void
  toggle: () => void
  handleMouseEnter: () => void
  handleMouseLeave: () => void
}

/**
 * Composable for managing a coordinated drawer
 *
 * Provides integration with the drawer coordination store, handling:
 * - Registration/unregistration on mount/unmount
 * - State transitions (expanded, collapsed, minimized)
 * - Hover behavior for minimized state
 * - v-model compatibility for PhysicsDrawerContainer
 *
 * @example
 * ```vue
 * <script setup>
 * const ganttDrawer = useCoordinatedDrawer({
 *   id: 'projectDetail-gantt',
 *   drawerName: '階段時間軸',
 *   themeColor: '#1ABC9C'
 * })
 * </script>
 *
 * <template>
 *   <PhysicsDrawerContainer
 *     v-model="ganttDrawer.modelValue.value"
 *     :is-minimized="ganttDrawer.isMinimized.value"
 *     @mouseenter="ganttDrawer.handleMouseEnter"
 *     @mouseleave="ganttDrawer.handleMouseLeave"
 *     ...
 *   />
 * </template>
 * ```
 */
export function useCoordinatedDrawer(options: CoordinatedDrawerOptions): CoordinatedDrawerReturn {
  const store = useDrawerCoordinationStore()
  const { hasExpandedDrawer } = storeToRefs(store)

  // Local hover tracking
  const isHovering = ref(false)

  // Register drawer on mount
  onMounted(() => {
    store.registerDrawer(options.id, {
      drawerName: options.drawerName,
      themeColor: options.themeColor
    })

    // Handle initial open state
    if (options.initialOpen) {
      store.expandDrawer(options.id)
    }
  })

  // Unregister drawer on unmount
  onUnmounted(() => {
    store.unregisterDrawer(options.id)
  })

  // Computed state from store
  const drawerState = computed(() => store.getDrawerState(options.id))

  const isExpanded = computed(() => drawerState.value === 'expanded')
  const isCollapsed = computed(() => drawerState.value === 'collapsed')
  const isMinimized = computed(() => drawerState.value === 'minimized')

  // v-model compatible computed
  // Maps boolean open/close to three-state system
  const modelValue = computed({
    get: () => isExpanded.value,
    set: (value: boolean) => {
      if (value) {
        store.expandDrawer(options.id)
      } else {
        store.collapseDrawer(options.id)
      }
    }
  })

  // Event handlers
  function handleMouseEnter() {
    if (isMinimized.value) {
      isHovering.value = true
      store.hoverMinimizedDrawer(options.id)
    }
  }

  function handleMouseLeave() {
    if (isHovering.value) {
      isHovering.value = false
      store.unhoverDrawer(options.id)
    }
  }

  function expand() {
    store.expandDrawer(options.id)
  }

  function collapse() {
    store.collapseDrawer(options.id)
  }

  function toggle() {
    if (isExpanded.value) {
      collapse()
    } else {
      expand()
    }
  }

  return {
    // State
    drawerState,
    isExpanded,
    isCollapsed,
    isMinimized,
    isHovering,
    hasExpandedDrawer,

    // v-model
    modelValue,

    // Actions
    expand,
    collapse,
    toggle,
    handleMouseEnter,
    handleMouseLeave
  }
}
