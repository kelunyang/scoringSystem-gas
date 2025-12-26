/**
 * Logging Utility
 * Provides leveled logging with environment-aware output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogOptions {
  module?: string
  data?: any
}

const isDev = import.meta.env.DEV

/**
 * Format log message with optional module name
 */
function formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
  const module = options?.module ? `[${options.module}]` : ''
  const levelTag = `[${level.toUpperCase()}]`

  return `${timestamp} ${levelTag} ${module} ${message}`.trim()
}

/**
 * Leveled logger
 */
export const logger = {
  /**
   * Debug logging (development only)
   */
  debug: (message: string, options?: LogOptions) => {
    if (!isDev) return
    console.log(formatMessage('debug', message, options), options?.data || '')
  },

  /**
   * Info logging (development only)
   */
  info: (message: string, options?: LogOptions) => {
    if (!isDev) return
    console.info(formatMessage('info', message, options), options?.data || '')
  },

  /**
   * Warning logging (always shown)
   */
  warn: (message: string, options?: LogOptions) => {
    console.warn(formatMessage('warn', message, options), options?.data || '')
  },

  /**
   * Error logging (always shown)
   */
  error: (message: string, options?: LogOptions) => {
    console.error(formatMessage('error', message, options), options?.data || '')
  }
}

/**
 * Create a scoped logger for a specific module
 */
export function createLogger(moduleName: string) {
  return {
    debug: (message: string, data?: any) => logger.debug(message, { module: moduleName, data }),
    info: (message: string, data?: any) => logger.info(message, { module: moduleName, data }),
    warn: (message: string, data?: any) => logger.warn(message, { module: moduleName, data }),
    error: (message: string, data?: any) => logger.error(message, { module: moduleName, data })
  }
}
