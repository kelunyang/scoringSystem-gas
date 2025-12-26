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

/**
 * Handle batch operation errors
 * Shows summary and detailed error list
 */
export function handleBatchErrors(
  errors: string[],
  successCount: number,
  totalCount: number
): void {
  if (errors.length === 0) {
    ElMessage.success(`成功處理 ${successCount} 項`)
    return
  }

  if (errors.length === totalCount) {
    ElMessage.error(`全部失敗：${errors[0]}`)
    return
  }

  const preview = errors.slice(0, 3).join('\n')
  const remaining = errors.length > 3 ? `\n... 還有 ${errors.length - 3} 個錯誤` : ''

  ElMessage.warning({
    message: `成功 ${successCount} 項，失敗 ${errors.length} 項：\n${preview}${remaining}`,
    duration: 5000,
    showClose: true
  })
}
