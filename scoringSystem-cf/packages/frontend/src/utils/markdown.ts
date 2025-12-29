/**
 * @fileoverview Markdown 解析工具
 *
 * 使用 marked 進行 Markdown 到 HTML 轉換
 * 支援 GitHub Flavored Markdown (GFM)：
 * - Headers, Bold, Italic, Strikethrough
 * - Links (包含自動連結 URL)
 * - Code blocks & inline code
 * - Tables, Task lists
 * - 並使用 DOMPurify 進行 XSS 防護
 */

import { marked } from 'marked'
import { sanitizeHtml } from './sanitize'

// 設定 marked 使用 GFM
marked.setOptions({
  gfm: true,       // GitHub Flavored Markdown
  breaks: true     // 換行轉 <br>
})

/**
 * 將 Markdown 文本轉換為安全的 HTML
 * @param text - Markdown 文本
 * @returns 經過 sanitize 的 HTML 字符串
 */
export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return ''

  const html = marked(text) as string
  return sanitizeHtml(html)
}

/**
 * 將 Markdown 文本轉換為 HTML（舊版相容，建議使用 renderMarkdown）
 * @deprecated 請使用 renderMarkdown
 */
export function parseMarkdown(text: string | null | undefined): string {
  return renderMarkdown(text)
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
