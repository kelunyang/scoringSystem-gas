import { ElMessage } from 'element-plus'
import type { ApiResponse } from './api-helpers'

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return '未知錯誤'
}

/**
 * Unified API error handler
 * Displays error message using ElMessage
 */
export function handleApiError(
  response: ApiResponse<any>,
  defaultMessage: string
): void {
  const message = response.error?.message || defaultMessage
  ElMessage.error(message)
}

