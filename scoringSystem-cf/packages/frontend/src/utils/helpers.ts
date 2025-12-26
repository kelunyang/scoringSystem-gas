/**
 * Format timestamp to localized string
 * @param timestamp - ISO timestamp string
 * @returns Formatted date string in zh-TW locale
 */
export function formatTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-TW')
}

/**
 * Truncate text to maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '-'
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}
