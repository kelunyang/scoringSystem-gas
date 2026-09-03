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

