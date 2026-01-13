/**
 * @fileoverview JSON Preview Utility
 *
 * 將 JSON 資料轉換成 Markdown code block 格式
 * 用於在 MdPreview 中顯示帶有 syntax highlighting 的 JSON
 */

/**
 * 將 JSON 資料轉換成 Markdown code block 格式
 *
 * @param data - 任何可序列化的資料
 * @param options - 格式化選項
 * @returns Markdown 格式的 JSON code block
 *
 * @example
 * jsonToMarkdown({ key: "value", count: 42 })
 * // Returns:
 * // ```json
 * // {
 * //   "key": "value",
 * //   "count": 42
 * // }
 * // ```
 */
export function jsonToMarkdown(
  data: unknown,
  options: {
    /** 縮排空格數，預設 2 */
    indent?: number
    /** 是否在錯誤時返回錯誤訊息而非拋出例外 */
    safeMode?: boolean
  } = {}
): string {
  const { indent = 2, safeMode = true } = options

  try {
    // 處理 null 和 undefined
    if (data === null) {
      return '```json\nnull\n```'
    }
    if (data === undefined) {
      return '```json\nundefined\n```'
    }

    // 如果已經是字串，嘗試解析後重新格式化
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        const formatted = JSON.stringify(parsed, null, indent)
        return '```json\n' + formatted + '\n```'
      } catch {
        // 不是有效的 JSON 字串，直接返回
        return '```json\n' + data + '\n```'
      }
    }

    const jsonString = JSON.stringify(data, null, indent)
    return '```json\n' + jsonString + '\n```'
  } catch (error) {
    if (safeMode) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return '```\n[JSON 序列化錯誤: ' + errorMessage + ']\n```'
    }
    throw error
  }
}

/**
 * 安全地格式化 JSON 字串
 * 用於已經是字串格式的 JSON 資料
 *
 * @param jsonString - JSON 字串
 * @param indent - 縮排空格數
 * @returns 格式化後的 Markdown code block
 */
export function formatJsonString(jsonString: string | null | undefined, indent = 2): string {
  if (!jsonString) {
    return '```json\nnull\n```'
  }

  try {
    const parsed = JSON.parse(jsonString)
    const formatted = JSON.stringify(parsed, null, indent)
    return '```json\n' + formatted + '\n```'
  } catch {
    // 解析失敗，返回原始字串
    return '```json\n' + jsonString + '\n```'
  }
}
