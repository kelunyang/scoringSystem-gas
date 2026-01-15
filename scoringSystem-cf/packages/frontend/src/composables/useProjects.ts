/**
 * Projects Composables using TanStack Query
 *
 * Provides:
 * - useProjects() - Get all projects user participates in
 * - useProjectsWithStages() - Get projects with detailed stage info
 * - useCreateProject() - Create new project mutation
 * - useUpdateProject() - Update project mutation
 * - useDeleteProject() - Delete project mutation
 */

import { useQuery, useMutation, useQueryClient, type UseQueryReturnType } from '@tanstack/vue-query'
import { computed, type ComputedRef } from 'vue'
import { rpcClient } from '@/utils/rpc-client'
import { ElMessage } from 'element-plus'
import { useCurrentUser } from './useAuth'
import type { Project, Stage } from '@/types'
import type { ApiResponse } from '@/types'

/**
 * Project with stages (extended type)
 */
export interface ProjectWithStages extends Project {
  stages?: Stage[]
}

/**
 * Create project data
 */
export interface CreateProjectData {
  projectName: string
  description: string
  scoreRangeMin: number
  scoreRangeMax: number
}

/**
 * Update project data
 */
export interface UpdateProjectData {
  projectName?: string
  description?: string
  scoreRangeMin?: number
  scoreRangeMax?: number
  status?: 'active' | 'archived' | 'deleted'
}

/**
 * Get all projects (simple list)
 *
 * Depends on: auth
 *
 * @returns {Object} Query result with projects array
 */
export function useProjects(): UseQueryReturnType<Project[], Error> {
  // Use the reactive auth query to trigger enabled updates
  const { data: userData, isSuccess: isAuthSuccess } = useCurrentUser()

  // Create enabled computed ref that watches auth state
  const isEnabled: ComputedRef<boolean> = computed(() => {
    const enabled = isAuthSuccess.value && !!userData.value
    console.log('🔍 useProjects enabled check:', {
      isAuthSuccess: isAuthSuccess.value,
      hasUserData: !!userData.value,
      enabled
    })
    return enabled
  })

  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<Project[]> => {
      console.log('🔍 useProjects queryFn executing')
      const httpResponse = await rpcClient.projects.list.$post({
        json: { filters: {} }
      })
      const response = await httpResponse.json() as ApiResponse<{ projects: Project[] }>

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案列表失敗')
      }

      return response.data.projects || []
    },
    // Only fetch when user auth is successful
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

/**
 * Get all projects with detailed stage information
 *
 * This is the main query used by Dashboard component.
 * Depends on: auth
 *
 * @returns {Object} Query result with projects array (including stages)
 */
export function useProjectsWithStages(): UseQueryReturnType<ProjectWithStages[], Error> {
  // Use the reactive auth query to trigger enabled updates
  const { data: userData, isSuccess: isAuthSuccess } = useCurrentUser()

  // Create enabled computed ref that watches auth state
  const isEnabled: ComputedRef<boolean> = computed(() => {
    const enabled = isAuthSuccess.value && !!userData.value
    console.log('🔍 useProjectsWithStages enabled check:', {
      isAuthSuccess: isAuthSuccess.value,
      hasUserData: !!userData.value,
      enabled
    })
    return enabled
  })

  return useQuery({
    queryKey: ['projects', 'withStages'],
    queryFn: async (): Promise<ProjectWithStages[]> => {
      console.log('🔍 useProjectsWithStages queryFn executing')
      const httpResponse = await (rpcClient.projects as any)['list-with-stages'].$post({
        json: { filters: {} }
      })
      const response = await httpResponse.json() as ApiResponse<ProjectWithStages[] | { projects: ProjectWithStages[] }>

      if (!response.success) {
        throw new Error(response.error?.message || '載入專案列表失敗')
      }

      // Backend returns either:
      // - Old format: { success: true, data: ProjectWithStages[] }
      // - New format: { success: true, data: { projects: ProjectWithStages[], totalCount: n, ... } }
      let projects: ProjectWithStages[]
      if (Array.isArray(response.data)) {
        // Old format: data is directly an array
        projects = response.data
      } else if (response.data && Array.isArray((response.data as any).projects)) {
        // New format: data is an object with projects array
        projects = (response.data as any).projects
      } else {
        projects = []
      }

      console.log('🔍 useProjectsWithStages queryFn result:', { projects, count: projects.length })

      return projects
    },
    // Only fetch when user auth is successful
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2 // 2 minutes cache
  })
}

/**
 * Create new project mutation
 *
 * @returns {Object} Mutation object
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectData: CreateProjectData): Promise<Project> => {
      const httpResponse = await rpcClient.projects.create.$post({
        json: { projectData }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (!response.success) {
        throw new Error(response.error?.message || '建立專案失敗')
      }

      return response.data
    },
    onSuccess: () => {
      // Invalidate projects queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['projects'] })

      ElMessage.success('專案建立成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '建立專案失敗')
    }
  })
}

/**
 * Update project mutation
 *
 * @returns {Object} Mutation object
 */
export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, updates }: { projectId: string; updates: UpdateProjectData }): Promise<Project> => {
      const httpResponse = await rpcClient.projects.update.$post({
        json: { projectId, updates }
      })
      const response = await httpResponse.json() as ApiResponse<Project>

      if (!response.success) {
        throw new Error(response.error?.message || '更新專案失敗')
      }

      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate projects queries
      queryClient.invalidateQueries({ queryKey: ['projects'] })

      // Also invalidate the specific project detail
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })

      ElMessage.success('專案更新成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '更新專案失敗')
    }
  })
}

/**
 * Delete project mutation
 *
 * @returns {Object} Mutation object
 */
export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string): Promise<{ success: boolean }> => {
      const httpResponse = await rpcClient.projects.delete.$post({
        json: { projectId }
      })
      const response = await httpResponse.json() as ApiResponse<{ success: boolean }>

      if (!response.success) {
        throw new Error(response.error?.message || '刪除專案失敗')
      }

      return response.data
    },
    onSuccess: (data, projectId) => {
      // Invalidate projects queries
      queryClient.invalidateQueries({ queryKey: ['projects'] })

      // Remove the specific project from cache
      queryClient.removeQueries({ queryKey: ['project', projectId] })

      ElMessage.success('專案刪除成功')
    },
    onError: (error: Error) => {
      ElMessage.error(error.message || '刪除專案失敗')
    }
  })
}

/**
 * Helper to check if a project is archived
 *
 * @param {Object} project
 * @returns {boolean}
 */
export function isProjectArchived(project: Project | null | undefined): boolean {
  return project?.status === 'archived'
}

/**
 * Helper to get active projects only
 *
 * @param {Array} projects
 * @returns {Array}
 */
export function getActiveProjects(projects: Project[] | null | undefined): Project[] {
  return projects?.filter(p => !isProjectArchived(p)) || []
}
