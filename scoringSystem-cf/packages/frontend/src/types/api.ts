/**
 * @fileoverview API 回應型別。
 *
 * 這個檔案曾有 339 行、20 個請求/回應型別（LoginRequest、CreateProjectRequest、
 * StatsResponse、ProjectCoreResponse…），全庫零引用，而且欄位早已和後端脫節
 * ——看起來像 API 契約，其實沒有任何東西驗證它。看似有人用的
 * ResetPasswordRequest 也是誤會：實際使用處是從 @repo/shared/types/admin 匯入的
 * 同名型別。已於 2026-09-05 移除。
 *
 * 真正的契約在 @repo/shared/types/api-responses，由 backend 的
 * successResponse()/errorResponse() 產生、前端在這裡讀回來。
 */

export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginatedResponse
} from '@repo/shared/types/api-responses'
