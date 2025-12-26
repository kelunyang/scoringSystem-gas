/**
 * Admin Projects Composable using TanStack Query
 *
 * Provides:
 * - useAdminProjects() - Get all projects for admin management
 *
 * This composable is specifically for the admin ProjectManagement component
 * and waits for authentication to complete before fetching data.
 */

import type { UseQueryReturnType } from '@tanstack/vue-query'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
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
  data?: Project[]
  error?: {
    message: string
    code?: string
  }
}

/**
 * Get all projects for admin management
 *
 * Depends on: auth
 *
 * @returns Query result with projects array
 */
export function useAdminProjects(): UseQueryReturnType<Project[], Error> {
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

  return useQuery<Project[], Error>({
    queryKey: ['admin', 'projects'],
    queryFn: async (): Promise<Project[]> => {
      console.log('🔍 useAdminProjects queryFn executing')
      const httpResponse = await rpcClient.projects.list.$post({ json: {} })
      const response = await httpResponse.json() as AdminProjectsResponse

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案列表失敗')
      }

      // Return the projects data
      return response.data || []
    },
    // Only fetch when user auth is successful
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2, // 2 minutes cache
    refetchOnMount: true // Always refetch on mount to ensure fresh data
  })
}
