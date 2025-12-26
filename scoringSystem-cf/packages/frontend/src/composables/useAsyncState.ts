import { ref, type Ref } from 'vue'

/**
 * Unified async state management composable
 *
 * Provides a standardized way to manage async operations with loading and error states
 *
 * @example
 * const { execute, loading, error } = useAsyncState(async () => {
 *   return await api.fetchData()
 * })
 *
 * await execute()
 */
export function useAsyncState<T = void>(
  asyncFn: (...args: any[]) => Promise<T>
) {
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const data = ref<T | null>(null) as Ref<T | null>

  const execute = async (...args: any[]): Promise<T | null> => {
    loading.value = true
    error.value = null

    try {
      const result = await asyncFn(...args)
      data.value = result
      return result
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      return null
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    loading.value = false
    error.value = null
    data.value = null
  }

  return {
    execute,
    loading,
    error,
    data,
    reset
  }
}

/**
 * Async state management for operations without return values
 * Simpler version for actions like delete, update, etc.
 *
 * @example
 * const { execute: deleteItem, loading: deleting } = useAsyncAction(async (id) => {
 *   await api.deleteItem(id)
 * })
 */
export function useAsyncAction(
  asyncFn: (...args: any[]) => Promise<void>
) {
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const execute = async (...args: any[]): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      await asyncFn(...args)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      return false
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    loading.value = false
    error.value = null
  }

  return {
    execute,
    loading,
    error,
    reset
  }
}
