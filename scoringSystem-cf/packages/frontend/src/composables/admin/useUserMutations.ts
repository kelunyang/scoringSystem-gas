/**
 * Admin User Mutations using TanStack Query
 *
 * Provides mutation hooks for user management operations:
 * - useUpdateUserStatus() - Update single user status
 * - useBatchUpdateUserStatus() - Batch update user status
 * - useResetPassword() - Reset user password
 * - useUnlockUser() - Unlock user account
 * - useUpdateUserProfile() - Update user profile
 *
 * All mutations automatically invalidate the admin users query cache.
 *
 * Note: The types defined here match the actual backend API parameters,
 * which may differ from @repo/shared types that are out of sync.
 */

import type { UseMutationReturnType } from '@tanstack/vue-query'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { fetchWithAuth, type ApiResponse } from '@/utils/api-helpers'

// ============================================================================
// Types - Match actual backend API parameters
// ============================================================================

interface UpdateUserStatusParams {
  targetEmail: string
  status: 'active' | 'disabled'
}

interface BatchUpdateStatusParams {
  targetEmails: string[]
  status: 'active' | 'disabled'
}

interface BatchUpdateStatusResult {
  successCount: number
  failureCount: number
  results: Array<{ success: boolean; userEmail: string }>
}

interface ResetPasswordParams {
  targetEmail: string
}

interface UnlockUserParams {
  targetEmail: string
  unlockReason: string
  resetLockCount?: boolean
}

interface UpdateUserProfileParams {
  userEmail: string
  displayName?: string
  status?: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string | Record<string, unknown>
}

// ============================================================================
// useUpdateUserStatus - Single user status update
// ============================================================================

/**
 * Update a single user's status (active/disabled)
 *
 * @returns Mutation object
 *
 * @example
 * ```typescript
 * const updateStatus = useUpdateUserStatus()
 *
 * await updateStatus.mutateAsync({
 *   targetEmail: 'user@example.com',
 *   status: 'active'
 * })
 * ```
 */
export function useUpdateUserStatus(): UseMutationReturnType<
  void,
  Error,
  UpdateUserStatusParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetEmail, status }: UpdateUserStatusParams): Promise<void> => {
      const response = await fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/update-status',
        { method: 'POST', body: { targetEmail, status } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '更新使用者狀態失敗')
      }
    },
    onSuccess: (_data, variables) => {
      const statusText = variables.status === 'active' ? '啟用' : '停用'
      ElMessage.success(`用戶狀態已${statusText}`)

      // Invalidate users list to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`操作失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useBatchUpdateUserStatus - Batch user status update
// ============================================================================

/**
 * Batch update multiple users' status
 *
 * @returns Mutation object
 *
 * @example
 * ```typescript
 * const batchUpdate = useBatchUpdateUserStatus()
 *
 * await batchUpdate.mutateAsync({
 *   targetEmails: ['user1@example.com', 'user2@example.com'],
 *   status: 'active'
 * })
 * ```
 */
export function useBatchUpdateUserStatus(): UseMutationReturnType<
  BatchUpdateStatusResult,
  Error,
  BatchUpdateStatusParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      targetEmails,
      status
    }: BatchUpdateStatusParams): Promise<BatchUpdateStatusResult> => {
      const response = await fetchWithAuth<ApiResponse<BatchUpdateStatusResult>>(
        '/api/admin/users/batch-update-status',
        { method: 'POST', body: { targetEmails, status } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '批量更新使用者狀態失敗')
      }

      return response.data as BatchUpdateStatusResult
    },
    onSuccess: (data) => {
      if (data.failureCount === 0) {
        ElMessage.success(`成功更新 ${data.successCount} 位使用者狀態`)
      } else {
        ElMessage.warning(`成功: ${data.successCount}, 失敗: ${data.failureCount}`)
      }

      // Invalidate users list to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`批量操作失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useResetPassword - Reset user password
// ============================================================================

/**
 * Reset a user's password (new password sent via email)
 *
 * @returns Mutation object
 *
 * @example
 * ```typescript
 * const resetPassword = useResetPassword()
 *
 * await resetPassword.mutateAsync({
 *   targetEmail: 'user@example.com'
 * })
 * ```
 */
export function useResetPassword(): UseMutationReturnType<void, Error, ResetPasswordParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ targetEmail }: ResetPasswordParams): Promise<void> => {
      const response = await fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/reset-password',
        { method: 'POST', body: { userEmail: targetEmail } }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '密碼重設失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('密碼重設成功，新密碼已發送至使用者信箱')

      // Invalidate users list to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`密碼重設失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useUnlockUser - Unlock user account
// ============================================================================

/**
 * Unlock a locked user account
 *
 * @returns Mutation object
 *
 * @example
 * ```typescript
 * const unlockUser = useUnlockUser()
 *
 * await unlockUser.mutateAsync({
 *   targetEmail: 'user@example.com',
 *   unlockReason: 'User confirmed identity via support ticket',
 *   resetLockCount: true
 * })
 * ```
 */
export function useUnlockUser(): UseMutationReturnType<void, Error, UnlockUserParams, unknown> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      targetEmail,
      unlockReason,
      resetLockCount
    }: UnlockUserParams): Promise<void> => {
      const response = await fetchWithAuth<ApiResponse<void>>(
        '/api/admin/users/unlock',
        { method: 'POST', body: { targetEmail, unlockReason, resetLockCount } }
      )

      if (!response.success) {
        // Handle specific error codes
        if (response.error?.code === 'USER_NOT_LOCKED') {
          throw new Error('該使用者帳戶目前並未被鎖定')
        } else if (response.error?.code === 'USER_NOT_FOUND') {
          throw new Error('找不到該使用者')
        }
        throw new Error(response.error?.message || '解鎖失敗')
      }
    },
    onSuccess: (_data, variables) => {
      ElMessage.success(`帳戶已解鎖：${variables.targetEmail}`)

      // Invalidate users list to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`解鎖失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// useUpdateUserProfile - Update user profile
// ============================================================================

/**
 * Update a user's profile (display name, avatar, etc.)
 *
 * @returns Mutation object
 *
 * @example
 * ```typescript
 * const updateProfile = useUpdateUserProfile()
 *
 * await updateProfile.mutateAsync({
 *   userEmail: 'user@example.com',
 *   displayName: 'New Name',
 *   avatarStyle: 'avataaars'
 * })
 * ```
 */
export function useUpdateUserProfile(): UseMutationReturnType<
  void,
  Error,
  UpdateUserProfileParams,
  unknown
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateUserProfileParams): Promise<void> => {
      const response = await fetchWithAuth<ApiResponse<void>>(
        '/api/admin/user-profile',
        {
          method: 'POST',
          body: {
            userEmail: params.userEmail,
            displayName: params.displayName,
            status: params.status
          }
        }
      )

      if (!response.success) {
        throw new Error(response.error?.message || '更新用戶資料失敗')
      }
    },
    onSuccess: () => {
      ElMessage.success('用戶資料已更新')

      // Invalidate users list to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => {
      ElMessage.error(`保存失敗: ${error.message}`)
    }
  })
}

// ============================================================================
// Re-export types for consumer convenience
// ============================================================================

export type {
  UpdateUserStatusParams,
  BatchUpdateStatusParams,
  BatchUpdateStatusResult,
  ResetPasswordParams,
  UnlockUserParams,
  UpdateUserProfileParams
}
