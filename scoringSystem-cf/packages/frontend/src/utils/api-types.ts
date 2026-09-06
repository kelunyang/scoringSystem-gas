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

import type { InferResponseType } from 'hono/client'

/** 端點成功回應（success: true）裡 `data` 的型別 */
export type ApiData<T extends (...args: never[]) => unknown> =
  Extract<InferResponseType<T>, { success: true }> extends { data: infer D } ? D : never

/** 端點失敗回應（success: false）裡 `error` 的型別 */
export type ApiError<T extends (...args: never[]) => unknown> =
  Extract<InferResponseType<T>, { success: false }> extends { error: infer E } ? E : never
