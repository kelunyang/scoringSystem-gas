/**
 * @fileoverview Markdown 解析工具
 *
 * 提供簡單的 Markdown 到 HTML 轉換功能
 * 支援常見的 Markdown 語法：
 * - Headers (h1, h2, h3)
 * - Bold & Italic
 * - Links
 * - Code blocks & inline code
 * - Line breaks
 */

/**
 * 將 Markdown 文本轉換為 HTML
 * @param text - Markdown 文本
 * @returns HTML 字符串
 */
export function parseMarkdown(text: string | null | undefined): string {
  if (!text) return ''

  let html = text
    // Headers (必須在 Bold/Italic 之前處理，避免衝突)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')

    // Bold (使用非貪婪匹配 *? 避免跨行問題)
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/__(.*?)__/gim, '<strong>$1</strong>')

    // Italic (使用非貪婪匹配)
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/_(.*?)_/gim, '<em>$1</em>')

    // Code blocks (必須在 inline code 之前處理)
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')

    // Inline code
    .replace(/`([^`]+)`/gim, '<code>$1</code>')

    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')

    // Line breaks
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>')

  return `<p>${html}</p>`
}

/**
 * 清理 HTML 標籤（用於預覽或搜尋）
 * @param html - HTML 字符串
 * @returns 純文本
 */
export function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '')
}

/**
 * 計算 Markdown 文本的字數（排除標記符號）
 * @param text - Markdown 文本
 * @returns 字數
 */
export function countMarkdownWords(text: string | null | undefined): number {
  if (!text) return 0

  // 移除 Markdown 標記
  const plainText = text
    .replace(/[#*_`\[\]()]/g, '') // 移除標記符號
    .replace(/\n+/g, ' ') // 換行轉空格
    .trim()

  // 計算字數（中文按字元，英文按單詞）
  const chineseChars = plainText.match(/[\u4e00-\u9fa5]/g) || []
  const englishWords = plainText.match(/[a-zA-Z]+/g) || []

  return chineseChars.length + englishWords.length
}

/**
 * 截取 Markdown 文本摘要
 * @param text - Markdown 文本
 * @param maxLength - 最大長度
 * @returns 摘要文本
 */
export function getMarkdownSummary(text: string | null | undefined, maxLength: number = 100): string {
  if (!text) return ''

  // 移除標記符號並轉為純文本
  const plainText = text
    .replace(/[#*_`\[\]()]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (plainText.length <= maxLength) {
    return plainText
  }

  return plainText.substring(0, maxLength) + '...'
}
