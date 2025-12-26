/**
 * Development Debug Utilities
 *
 * Provides conditional logging that only runs in development mode.
 * All logs are stripped from production builds.
 */

/**
 * Check if we're in development mode
 */
const isDev = import.meta.env.DEV

/**
 * Debug logger - only logs in development mode
 *
 * @param message - Log message
 * @param data - Optional data to log
 */
export function debugLog(message: string, data?: any) {
  if (isDev) {
    if (data !== undefined) {
      console.log(message, data)
    } else {
      console.log(message)
    }
  }
}

/**
 * Debug error logger - only logs in development mode
 *
 * @param message - Error message
 * @param error - Optional error object or data
 */
export function debugError(message: string, error?: any) {
  if (isDev) {
    if (error !== undefined) {
      console.error(message, error)
    } else {
      console.error(message)
    }
  }
}

/**
 * Debug warning logger - only logs in development mode
 *
 * @param message - Warning message
 * @param data - Optional data to log
 */
export function debugWarn(message: string, data?: any) {
  if (isDev) {
    if (data !== undefined) {
      console.warn(message, data)
    } else {
      console.warn(message)
    }
  }
}

/**
 * Debug group - creates a collapsible log group in development mode
 *
 * @param label - Group label
 * @param fn - Function to execute within the group
 */
export function debugGroup(label: string, fn: () => void) {
  if (isDev) {
    console.group(label)
    try {
      fn()
    } finally {
      console.groupEnd()
    }
  }
}

/**
 * Debug table - logs data as a table in development mode
 *
 * @param data - Data to display as table
 * @param columns - Optional columns to display
 */
export function debugTable(data: any, columns?: string[]) {
  if (isDev) {
    if (columns) {
      console.table(data, columns)
    } else {
      console.table(data)
    }
  }
}

/**
 * Debug time - measures execution time in development mode
 *
 * @param label - Timer label
 * @returns Object with start() and end() methods
 */
export function debugTime(label: string) {
  if (isDev) {
    return {
      start: () => console.time(label),
      end: () => console.timeEnd(label)
    }
  }
  return {
    start: () => {},
    end: () => {}
  }
}

/**
 * Conditional debug logger with custom condition
 *
 * @param condition - Condition to check
 * @param message - Log message
 * @param data - Optional data to log
 */
export function debugIf(condition: boolean, message: string, data?: any) {
  if (isDev && condition) {
    if (data !== undefined) {
      console.log(message, data)
    } else {
      console.log(message)
    }
  }
}
