/**
 * AI Providers Composable using TanStack Query
 *
 * Provides:
 * - useAIProviders() - Get all AI providers
 * - useCreateAIProvider() - Create a new AI provider
 * - useUpdateAIProvider() - Update an AI provider
 * - useDeleteAIProvider() - Delete an AI provider
 * - useTestAIProvider() - Test AI provider connection
 * - useAIPrompts() - Get AI prompt configuration
 * - useUpdateAIPrompts() - Update AI prompt configuration
 *
 * This composable is for the admin AIProvidersSettings component.
 */

import type { UseMutationReturnType, UseQueryReturnType } from '@tanstack/vue-query'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { rpcClient } from '@/utils/rpc-client'
import { useCurrentUser } from '@/composables/useAuth'
import type { AIProviderPublic } from '@repo/shared'

// ============================================================================
// Types
// ============================================================================

interface AIProvidersResponse {
  providers: AIProviderPublic[]
}

interface CreateAIProviderParams {
  name: string
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
}

interface UpdateAIProviderParams {
  providerId: string
  name?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  enabled?: boolean
}

interface DeleteAIProviderParams {
  providerId: string
}

interface TestAIProviderParams {
  providerId: string
}

interface TestAIProviderResult {
  responseTimeMs: number
}

interface AIPromptsConfig {
  submissionPrompt: string
  commentPrompt: string
  defaults?: {
    submissionPrompt: string
    commentPrompt: string
  }
}

interface UpdateAIPromptsParams {
  submissionPrompt: string
  commentPrompt: string
}

// ============================================================================
// useAIProviders - Query for AI Providers List
// ============================================================================

/**
 * Get all AI providers
 *
 * @returns Query result with AI providers list
 */
export function useAIProviders(): UseQueryReturnType<AIProvidersResponse, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'ai-providers'],
    queryFn: async (): Promise<AIProvidersResponse> => {
      const httpResponse = await rpcClient.api.system['ai-providers'].list.$post({
        json: {}
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入 AI 服務列表失敗')
      }

      return response.data as AIProvidersResponse
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  })
}

// ============================================================================
// useCreateAIProvider - Mutation for Creating AI Provider
// ============================================================================

/**
 * Create a new AI provider
 *
 * @returns Mutation object for creating AI provider
 */
export function useCreateAIProvider(): UseMutationReturnType<
  AIProviderPublic,
  Error,
  CreateAIProviderParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateAIProviderParams) => {
      const httpResponse = await rpcClient.api.system['ai-providers'].create.$post({
        json: params
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '新增 AI 服務失敗')
      }

      return response.data as AIProviderPublic
    },
    onSuccess: () => {
      ElMessage.success('AI 服務已新增')
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-providers'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`新增失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useUpdateAIProvider - Mutation for Updating AI Provider
// ============================================================================

/**
 * Update an AI provider
 *
 * @returns Mutation object for updating AI provider
 */
export function useUpdateAIProvider(): UseMutationReturnType<
  AIProviderPublic,
  Error,
  UpdateAIProviderParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateAIProviderParams) => {
      const httpResponse = await rpcClient.api.system['ai-providers'].update.$post({
        json: params
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新 AI 服務失敗')
      }

      return response.data as AIProviderPublic
    },
    onSuccess: (_data, variables) => {
      // Only show message for non-toggle updates
      if (variables.name !== undefined || variables.baseUrl !== undefined || variables.model !== undefined) {
        ElMessage.success('AI 服務已更新')
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-providers'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`更新失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useToggleAIProvider - Mutation for Toggling AI Provider Enabled Status
// ============================================================================

/**
 * Toggle AI provider enabled status (with custom success message)
 *
 * @returns Mutation object for toggling AI provider
 */
export function useToggleAIProvider(): UseMutationReturnType<
  AIProviderPublic,
  Error,
  { providerId: string; enabled: boolean },
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { providerId: string; enabled: boolean }) => {
      const httpResponse = await rpcClient.api.system['ai-providers'].update.$post({
        json: params
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '更新 AI 服務狀態失敗')
      }

      return response.data as AIProviderPublic
    },
    onSuccess: (_data, variables) => {
      ElMessage.success(`AI 服務已${variables.enabled ? '啟用' : '停用'}`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-providers'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`操作失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useDeleteAIProvider - Mutation for Deleting AI Provider
// ============================================================================

/**
 * Delete an AI provider
 *
 * @returns Mutation object for deleting AI provider
 */
export function useDeleteAIProvider(): UseMutationReturnType<
  void,
  Error,
  DeleteAIProviderParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ providerId }: DeleteAIProviderParams) => {
      const httpResponse = await rpcClient.api.system['ai-providers'].delete.$post({
        json: { providerId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '刪除 AI 服務失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('AI 服務已刪除')
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-providers'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`刪除失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useTestAIProvider - Mutation for Testing AI Provider Connection
// ============================================================================

/**
 * Test AI provider connection
 *
 * @returns Mutation object for testing AI provider
 */
export function useTestAIProvider(): UseMutationReturnType<
  TestAIProviderResult,
  Error,
  TestAIProviderParams,
  unknown
> {
  return useMutation({
    mutationFn: async ({ providerId }: TestAIProviderParams) => {
      const httpResponse = await rpcClient.api.system['ai-providers'].test.$post({
        json: { providerId }
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '連線測試失敗')
      }

      return response.data as TestAIProviderResult
    }
    // Note: Success/error messages handled by the component for custom formatting
  })
}

// ============================================================================
// useAIPrompts - Query for AI Prompts Configuration
// ============================================================================

/**
 * Get AI prompts configuration
 *
 * @returns Query result with AI prompts config
 */
export function useAIPrompts(): UseQueryReturnType<AIPromptsConfig, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'ai-prompts'],
    queryFn: async (): Promise<AIPromptsConfig> => {
      const httpResponse = await rpcClient.api.system['ai-prompts'].get.$post({
        json: {}
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '載入 AI 評分標準失敗')
      }

      return response.data as AIPromptsConfig
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  })
}

// ============================================================================
// useUpdateAIPrompts - Mutation for Updating AI Prompts
// ============================================================================

/**
 * Update AI prompts configuration
 *
 * @returns Mutation object for updating AI prompts
 */
export function useUpdateAIPrompts(): UseMutationReturnType<
  void,
  Error,
  UpdateAIPromptsParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateAIPromptsParams) => {
      const httpResponse = await rpcClient.api.system['ai-prompts'].update.$post({
        json: params
      })
      const response = await httpResponse.json() as any

      if (!response.success) {
        throw new Error(response.error?.message || '儲存 AI 評分標準失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('AI 評分標準已儲存')
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-prompts'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`儲存失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  AIProvidersResponse,
  CreateAIProviderParams,
  UpdateAIProviderParams,
  DeleteAIProviderParams,
  TestAIProviderParams,
  TestAIProviderResult,
  AIPromptsConfig,
  UpdateAIPromptsParams
}
