/**
 * 請求去重工具
 *
 * 當多個相同的請求同時發起時，只會實際執行一次 API 調用，
 * 其他請求會共享同一個 Promise 結果。
 *
 * 使用場景：
 * - 前端組件初始化時可能重複載入相同資料
 * - 並發渲染多個相同組件時的重複請求
 */

/** 進行中的請求 Map */
const pendingRequests = new Map<string, Promise<any>>()

/**
 * 對進行中的相同請求做去重
 *
 * @param key - 請求的唯一標識符（例如：`comments:${projectId}:${stageId}`）
 * @param requestFn - 實際執行請求的函數
 * @returns 請求結果的 Promise
 *
 * @example
 * ```typescript
 * // 相同的 key 在請求進行中時只會執行一次
 * const result = await dedupRequest(
 *   `comments:${projectId}:${stageId}`,
 *   () => rpcClient.comments.stage.$post({ json: { projectId, stageId } })
 * )
 * ```
 */
export async function dedupRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // 如果已有相同請求進行中，直接返回該 Promise
  if (pendingRequests.has(key)) {
    console.log(`[dedupRequest] ♻️ 重用進行中的請求: ${key}`)
    return pendingRequests.get(key)!
  }

  console.log(`[dedupRequest] 🚀 發起新請求: ${key}`)

  // 創建新請求並存入 Map
  const promise = requestFn().finally(() => {
    // 請求完成後從 Map 中移除
    pendingRequests.delete(key)
    console.log(`[dedupRequest] ✅ 請求完成並清理: ${key}`)
  })

  pendingRequests.set(key, promise)
  return promise
}

