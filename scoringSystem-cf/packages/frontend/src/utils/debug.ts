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

