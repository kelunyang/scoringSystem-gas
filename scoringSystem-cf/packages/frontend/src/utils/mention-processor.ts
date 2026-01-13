/**
 * @fileoverview Mention Processor Utility
 *
 * 處理 Markdown 內容中的 @mention 標記
 * 在 MdPreview 渲染前進行前處理
 */

/**
 * 處理 @mention 標記
 * 將 @email@domain.com 轉換成 <mention> 標籤格式
 *
 * @param content - 原始 Markdown 內容
 * @param emailToDisplayName - email 對應 displayName 的映射表
 * @returns 處理後的內容，@email 會被轉換成 <mention title="email">@DisplayName</mention>
 *
 * @example
 * const content = "Hello @john@example.com, please review"
 * const mapping = { "john@example.com": "John Doe" }
 * processMentions(content, mapping)
 * // Returns: "Hello <mention title=\"john@example.com\">@John Doe</mention>, please review"
 */
export function processMentions(
  content: string,
  emailToDisplayName: Record<string, string>
): string {
  if (!content) return ''

  // 匹配 @email@domain.com 格式
  // 確保 @ 後面跟著有效的 email 格式
  return content.replace(/@([^\s@]+@[^\s@]+\.[^\s@]+)/g, (_match, email: string) => {
    const displayName = emailToDisplayName[email] || email.split('@')[0]
    // 使用 title 屬性顯示 email（hover 時顯示），只顯示 displayName
    return `<mention title="${email}">@${displayName}</mention>`
  })
}

/**
 * 建立 mention 前處理函數
 * 用於傳入 MdPreviewWrapper 的 preProcess prop
 *
 * @param emailToDisplayName - email 對應 displayName 的映射表
 * @returns 前處理函數
 *
 * @example
 * const preProcess = createMentionProcessor({ "john@example.com": "John Doe" })
 * <MdPreviewWrapper :content="content" :preProcess="preProcess" />
 */
export function createMentionProcessor(
  emailToDisplayName: Record<string, string>
): (content: string) => string {
  return (content: string) => processMentions(content, emailToDisplayName)
}
