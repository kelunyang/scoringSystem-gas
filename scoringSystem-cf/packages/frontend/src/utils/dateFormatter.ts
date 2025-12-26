/**
 * 日期格式化工具函數
 */
import dayjs from 'dayjs'

/**
 * 格式化日期字符串為標準格式
 * @param dateString - 日期字符串
 * @param format - 格式模板，默認為 'YYYY/MM/DD HH:mm:ss'
 * @returns 格式化後的日期字符串，如果輸入為空則返回 '-'
 */
export const formatDate = (
  dateString: string | number | Date | null | undefined,
  format: string = 'YYYY/MM/DD HH:mm:ss'
): string => {
  if (!dateString) return '-'
  return dayjs(dateString).format(format)
}

/**
 * 格式化為短日期格式
 * @param dateString - 日期字符串
 * @returns 格式化後的短日期（YYYY/MM/DD）
 */
export const formatShortDate = (
  dateString: string | number | Date | null | undefined
): string => {
  return formatDate(dateString, 'YYYY/MM/DD')
}

/**
 * 格式化為時間格式
 * @param dateString - 日期字符串
 * @returns 格式化後的時間（HH:mm:ss）
 */
export const formatTime = (
  dateString: string | number | Date | null | undefined
): string => {
  return formatDate(dateString, 'HH:mm:ss')
}
