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
import { computed, ref, type Ref } from 'vue'
import type { ComputedRef } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { useAuth } from './useAuth'

interface Project {
  projectId: string
  projectName: string
  createdBy: string
  createdTime: number
  status: string
  [key: string]: any
}

interface AdminProjectsResponse {
  success: boolean
  data?: Project[] | { projects: Project[]; totalCount: number; limit?: number; offset?: number }
  error?: {
    message: string
    code?: string
  }
}

interface AdminProjectsResult {
  projects: Project[]
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

      const httpResponse = await rpcClient.projects.list.$post({ json: queryParams })
      const response = await httpResponse.json() as AdminProjectsResponse

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案列表失敗')
      }

      // Backend returns either:
      // - Old format: data is directly an array
      // - New format: data is { projects: [...], totalCount: n, ... }
      if (Array.isArray(response.data)) {
        return { projects: response.data, totalCount: response.data.length }
      } else if (response.data && Array.isArray((response.data as any).projects)) {
        return {
          projects: (response.data as any).projects,
          totalCount: (response.data as any).totalCount || (response.data as any).projects.length
        }
      } else {
        return { projects: [], totalCount: 0 }
      }
    },
    // Only fetch when user auth is successful
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2, // 2 minutes cache
    refetchOnMount: true // Always refetch on mount to ensure fresh data
  })
}
