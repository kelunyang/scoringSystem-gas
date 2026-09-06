/**
 * Admin Projects Composable using TanStack Query
 *
 * Provides:
 * - useAdminProjects() - Get all projects for admin management with pagination support
 *
 * This composable is specifically for the admin ProjectManagement component
 * and waits for authentication to complete before fetching data.
 */

import type { UseQueryReturnType } from '@tanstack/vue-query'
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import type { ComputedRef } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { apiErrorMessage, errorOf } from '@/utils/api-types'
import type { ApiData } from '@/utils/api-types'
import { useAuth } from './useAuth'

/** /projects/list 回的一個專案（依呼叫者身分有兩種形狀） */
export type AdminProject = ApiData<typeof rpcClient.api.projects.list.$post>['projects'][number]

interface AdminProjectsResult {
  projects: AdminProject[]
  totalCount: number
}

interface UseAdminProjectsOptions {
  limit?: Ref<number> | number
  offset?: Ref<number> | number
  search?: Ref<string | undefined> | string
  status?: Ref<string | undefined> | string
}

function getValue<T>(refOrValue: Ref<T> | T): T {
  return (refOrValue && typeof refOrValue === 'object' && 'value' in refOrValue)
    ? (refOrValue as Ref<T>).value
    : refOrValue as T
}

/**
 * Get all projects for admin management
 *
 * Depends on: auth
 *
 * @param options - Optional pagination and filter options
 * @returns Query result with projects array and metadata
 */
export function useAdminProjects(options?: UseAdminProjectsOptions): UseQueryReturnType<AdminProjectsResult, Error> {
  // Vue 3 Best Practice: Use unified useAuth() composable
  const { user, token, isAuthenticated } = useAuth()

  // Create enabled computed ref that watches auth state
  const isEnabled: ComputedRef<boolean> = computed(() => {
    const enabled = isAuthenticated.value && !!user.value && !!token.value
    console.log('🔍 useAdminProjects enabled check:', {
      isAuthenticated: isAuthenticated.value,
      hasUser: !!user.value,
      hasToken: !!token.value,
      enabled
    })
    return enabled
  })

  return useQuery<AdminProjectsResult, Error>({
    queryKey: computed(() => [
      'admin',
      'projects',
      getValue(options?.limit),
      getValue(options?.offset),
      getValue(options?.search),
      getValue(options?.status)
    ]),
    queryFn: async (): Promise<AdminProjectsResult> => {
      console.log('🔍 useAdminProjects queryFn executing')

      const queryParams: Record<string, unknown> = {}
      if (options?.limit !== undefined) {
        queryParams.limit = getValue(options.limit)
      }
      if (options?.offset !== undefined) {
        queryParams.offset = getValue(options.offset)
      }
      if (options?.search !== undefined) {
        const searchVal = getValue(options.search)
        if (searchVal) queryParams.search = searchVal
      }
      if (options?.status !== undefined) {
        const statusVal = getValue(options.status)
        if (statusVal) queryParams.status = statusVal
      }

      const httpResponse = await rpcClient.api.projects.list.$post({ json: queryParams })
      const response = await httpResponse.json()

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '載入專案列表失敗')
      }

      // 端點固定回 { projects, totalCount, ... }（handlers/projects/list.ts:244）
      return {
        projects: response.data.projects,
        totalCount: response.data.totalCount ?? response.data.projects.length
      }
    },
    // Only fetch when user auth is successful
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2, // 2 minutes cache
    refetchOnMount: true // Always refetch on mount to ensure fresh data
  })
}
