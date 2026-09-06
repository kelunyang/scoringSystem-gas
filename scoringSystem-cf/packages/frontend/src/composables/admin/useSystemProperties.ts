/**
 * System Properties Composable using TanStack Query
 *
 * Provides:
 * - useSystemProperties() - Get all system properties configuration
 * - useUpdateProperties() - Update system properties
 * - useResetProperties() - Reset system properties to defaults
 * - useTestSmtpConnection() - Test SMTP connection
 *
 * This composable is for the admin SystemSettings component.
 */

import type { UseQueryReturnType, UseMutationReturnType } from '@tanstack/vue-query'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useCurrentUser } from '@/composables/useAuth'
import type { PropertiesConfig } from '@/types/admin-properties'
import { apiErrorCode, apiErrorMessage, errorOf } from '@/utils/api-types'

// ============================================================================
// Types
// ============================================================================

interface UpdatePropertiesParams {
  properties: Partial<PropertiesConfig>
}

interface UpdatePropertiesResult {
  changes?: Array<{ key: string; oldValue: unknown; newValue: unknown }>
}

interface SmtpTestConfig {
  host: string
  port: number
  username: string
  password: string
  fromName?: string
  fromEmail: string
}

interface SmtpTestParams {
  config: SmtpTestConfig
}

// ============================================================================
// useSystemProperties - Query for System Properties
// ============================================================================

/**
 * Get all system properties configuration
 *
 * @returns Query result with properties configuration
 */
export function useSystemProperties(): UseQueryReturnType<PropertiesConfig, Error> {
  const userQuery = useCurrentUser()

  const isEnabled = computed(() => {
    return userQuery.isSuccess.value && !!userQuery.data.value
  })

  return useQuery({
    queryKey: ['admin', 'system-properties'],
    queryFn: async (): Promise<PropertiesConfig> => {
      const response = await adminApi.properties.getAll()

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '載入系統配置失敗')
      }

      return response.data as unknown as PropertiesConfig
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  })
}

// ============================================================================
// useUpdateProperties - Mutation for Updating Properties
// ============================================================================

/**
 * Update system properties
 *
 * @returns Mutation object for updating properties
 */
export function useUpdateProperties(): UseMutationReturnType<
  UpdatePropertiesResult,
  Error,
  UpdatePropertiesParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ properties }: UpdatePropertiesParams) => {
      const response = await adminApi.properties.update({
        properties
      })

      if (!response.success) {
        // Handle specific error codes
        if (apiErrorCode(errorOf(response)) === 'NO_CHANGES') {
          throw new Error('沒有可更新的欄位')
        }
        throw new Error(apiErrorMessage(errorOf(response)) || '儲存配置失敗')
      }

      return response.data as unknown as UpdatePropertiesResult
    },
    onSuccess: (data) => {
      const changesCount = data?.changes?.length || 0
      ElMessage.success(`配置已儲存 (${changesCount} 個欄位已更新)`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'system-properties'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`儲存失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useResetProperties - Mutation for Resetting Properties
// ============================================================================

/**
 * Reset system properties to default values
 *
 * @returns Mutation object for resetting properties
 */
export function useResetProperties(): UseMutationReturnType<void, Error, void, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await adminApi.properties.reset()

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || '重設配置失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('配置已重設為預設值')
      queryClient.invalidateQueries({ queryKey: ['admin', 'system-properties'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`重設失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useTestSmtpConnection - Mutation for Testing SMTP Connection
// ============================================================================

/**
 * Test SMTP connection with provided configuration
 *
 * @returns Mutation object for testing SMTP
 */
export function useTestSmtpConnection(): UseMutationReturnType<void, Error, SmtpTestParams, unknown> {
  return useMutation({
    mutationFn: async ({ config }: SmtpTestParams) => {
      const response = await adminApi.smtp.testConnection({ config })

      if (!response.success) {
        throw new Error(apiErrorMessage(errorOf(response)) || 'SMTP 連接測試失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('SMTP 連接測試成功！')
    },
    onError: (error: Error) => {
      ElMessage.error(`SMTP 連接測試失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useTestCloudflareEmail - Mutation for Testing Cloudflare Email Service
// ============================================================================

interface CloudflareEmailTestResult {
  message: string
  messageId?: string
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  UpdatePropertiesParams,
  UpdatePropertiesResult,
  SmtpTestConfig,
  SmtpTestParams,
  CloudflareEmailTestResult
}
