import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * Server-side pagination options
 */
export interface ServerPaginationOptions<T, F = Record<string, unknown>> {
  /** Page size for each request */
  pageSize?: number
  /** Initial page size (defaults to pageSize) */
  initialSize?: number
  /** Debounce time for search in ms */
  searchDebounceMs?: number
  /** Function to fetch data from server */
  fetchFn: (params: FetchParams<F>) => Promise<FetchResult<T>>
  /** Function to filter items locally (for smart search) */
  localFilterFn?: (items: T[], searchKeyword: string, filters: F) => T[]
  /** Key extractor for deduplication */
  getItemKey?: (item: T) => string
}

/**
 * Parameters passed to fetch function
 */
export interface FetchParams<F = Record<string, unknown>> {
  limit: number
  offset: number
  search?: string
  filters?: F
}

/**
 * Result from fetch function
 */
export interface FetchResult<T> {
  items: T[]
  totalCount: number
}

/**
 * Type helper for creating typed fetch functions
 */
export type ServerPaginationFetchFn<T, F = Record<string, unknown>> =
  (params: FetchParams<F>) => Promise<FetchResult<T>>
