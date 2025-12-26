/**
 * Date utilities for parsing and formatting dates
 * Avoids timezone issues by working with local date strings
 */

export interface ParsedDate {
  year: number
  month: number
  day: number
}

/**
 * Parse YYYY-MM-DD date string into components
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Parsed date components or null if invalid
 */
export function parseDateString(dateStr: string): ParsedDate | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }

  const parts = dateStr.split('-')
  if (parts.length !== 3) {
    return null
  }

  const [year, month, day] = parts.map(Number)

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  return { year, month, day }
}

/**
 * Format date string to Chinese format (YYYY年MM月DD日)
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string
 */
export function formatDateChinese(dateStr: string): string {
  const parsed = parseDateString(dateStr)

  if (!parsed) {
    console.warn('formatDateChinese received invalid date:', dateStr)
    return '日期格式錯誤'
  }

  return `${parsed.year}年${parsed.month}月${parsed.day}日`
}

/**
 * Format timestamp to HH:MM:SS
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string
 */
export function formatTime(timestamp: number | undefined | null): string {
  if (!timestamp || typeof timestamp !== 'number') {
    return 'N/A'
  }

  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

/**
 * Format date range for display
 * @param start - Start date string (YYYY-MM-DD)
 * @param end - End date string (YYYY-MM-DD)
 * @returns Formatted date range string
 */
export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return ''

  const startParsed = parseDateString(start)
  const endParsed = parseDateString(end)

  if (!startParsed || !endParsed) return ''

  return `${startParsed.year}/${startParsed.month}/${startParsed.day} - ${endParsed.year}/${endParsed.month}/${endParsed.day}`
}

/**
 * Create a date string from components
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day
 * @returns Date string in YYYY-MM-DD format
 */
export function createDateString(year: number, month: number, day: number): string {
  const yearStr = String(year)
  const monthStr = String(month).padStart(2, '0')
  const dayStr = String(day).padStart(2, '0')
  return `${yearStr}-${monthStr}-${dayStr}`
}
