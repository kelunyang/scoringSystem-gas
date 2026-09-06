/**
 * @fileoverview 從 API 契約推導前端型別
 *
 * 2026-09-06 把 backend 的路由改成串接式之後，`rpcClient` 的每個端點都帶著
 * 真實的回應型別（見 plan/issue.md #011）。在那之前，前端到處手寫「我猜這個
 * 端點回什麼」的介面——那些介面編譯得過、看起來合理，然後跟後端悄悄漂走。
 *
 * 新的做法：不要手寫，用這裡的工具從端點推導。後端改了欄位，前端會編譯失敗。
 *
 * @example
 * import type { ApiData } from '@/utils/api-types'
 * import { rpcClient } from '@/utils/rpc-client'
 *
 * // 這個端點成功時 data 的形狀
 * type ProjectGroup = ApiData<typeof rpcClient.api.groups.list.$post>[number]
 */

import type { InferRequestType, InferResponseType } from 'hono/client'

/** 端點的 JSON 請求 body 型別 */
export type ApiInput<T extends (...args: never[]) => unknown> =
  InferRequestType<T> extends { json: infer J } ? J : never

/** 端點成功回應（success: true）裡 `data` 的型別 */
export type ApiData<T extends (...args: never[]) => unknown> =
  Extract<InferResponseType<T>, { success: true }> extends { data: infer D } ? D : never

/** 端點失敗回應（success: false）裡 `error` 的型別 */
export type ApiError<T extends (...args: never[]) => unknown> =
  Extract<InferResponseType<T>, { success: false }> extends { error: infer E } ? E : never

/**
 * 從錯誤回應的 `error` 取出錯誤碼。
 *
 * 端點的失敗回應是聯集：我們自己的 `{ code, message }`，加上
 * `zValidator` 驗證失敗時 Zod 丟回來的形狀（沒有 `code`）。
 * 呼叫端多半只在意自己的錯誤碼，這裡收一次。
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

/** 從錯誤回應的 `error` 取出可顯示的訊息；取不到就回 undefined。 */
export function apiErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return undefined
}

/**
 * 從回應本身取出 `error`（成功回應沒有這個欄位，回 undefined）。
 *
 * 用在診斷訊息：那些地方只想把錯誤內容印出來，不想為此把整段
 * console.log 搬進 `if (!r.success)` 分支。要對錯誤做判斷時，
 * 請用 `if (r.success)` 收窄，或搭配 `apiErrorCode()`。
 */
export function errorOf(response: { success: boolean }): unknown {
  return 'error' in response ? (response as { error: unknown }).error : undefined
}
