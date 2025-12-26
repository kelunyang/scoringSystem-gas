/**
 * Composable for calculating date ranges in compact and full modes
 */

import { createDateString, type ParsedDate } from '@/utils/date'

export interface DateRange {
  start: string
  end: string
}

/**
 * Calculate compact mode date range (N days around a base date)
 * Centers the base date, showing days/2 before and after
 *
 * @param baseDate - Center date
 * @param days - Total number of days to show
 * @returns Date range object
 */
export function calculateCompactDateRange(baseDate: Date, days: number): DateRange {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const halfDays = Math.floor(days / 2)
  const center = new Date(baseDate)

  // If baseDate is in the future, use today as center
  if (center > today) {
    center.setTime(today.getTime())
  }

  const start = new Date(center)
  start.setDate(start.getDate() - halfDays)

  const end = new Date(center)
  end.setDate(end.getDate() + halfDays)

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
}

/**
 * Calculate full mode date range (complete months)
 * Shows totalMonths complete months centered around the base date's month
 *
 * @param baseDate - Date within the center month
 * @param totalMonths - Total number of months to show
 * @returns Date range object
 */
export function calculateFullDateRange(baseDate: Date, totalMonths: number): DateRange {
  const today = new Date(baseDate)
  const baseYear = today.getFullYear()
  const baseMonth = today.getMonth() // 0-11

  // Calculate distribution of months before and after
  const beforeMonths = Math.floor((totalMonths - 1) / 2)
  const afterMonths = totalMonths - 1 - beforeMonths

  // Calculate first month
  let firstYear = baseYear
  let firstMonth = baseMonth - beforeMonths

  // Handle negative months (cross-year backwards)
  while (firstMonth < 0) {
    firstMonth += 12
    firstYear -= 1
  }

  // Calculate last month
  let lastYear = baseYear
  let lastMonth = baseMonth + afterMonths

  // Handle months > 11 (cross-year forwards)
  while (lastMonth > 11) {
    lastMonth -= 12
    lastYear += 1
  }

  // Create start date (1st day of first month)
  const start = createDateString(firstYear, firstMonth + 1, 1)

  // Calculate end date (last day of last month)
  let endYear = lastYear
  let endMonth = lastMonth + 1
  if (endMonth > 11) {
    endMonth = 0
    endYear += 1
  }

  const endDate = new Date(endYear, endMonth, 0) // Day 0 = last day of previous month
  const endDay = endDate.getDate()
  const end = createDateString(lastYear, lastMonth + 1, endDay)

  return { start, end }
}

/**
 * Get all months in a date range
 *
 * @param start - Start date
 * @param end - End date
 * @returns Array of month info objects
 */
export function getMonthsInRange(start: Date, end: Date): Array<{
  year: number
  month: number
  label: string
}> {
  const months: Array<{ year: number; month: number; label: string }> = []
  const current = new Date(start)
  current.setDate(1)

  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth(),
      label: `${current.getFullYear()}/${current.getMonth() + 1}`
    })
    current.setMonth(current.getMonth() + 1)
  }

  return months
}

/**
 * Check if a navigation base date is in the current period
 *
 * @param navDate - Navigation base date
 * @param endDate - End date string (YYYY-MM-DD)
 * @param mode - Display mode
 * @returns True if in current period
 */
export function isCurrentPeriod(navDate: Date, endDate: string, mode: 'compact' | 'full'): boolean {
  const today = new Date()

  if (mode === 'compact') {
    const todayStr = today.toISOString().split('T')[0]
    return endDate >= todayStr
  } else {
    return (
      navDate.getFullYear() === today.getFullYear() &&
      navDate.getMonth() === today.getMonth()
    )
  }
}
