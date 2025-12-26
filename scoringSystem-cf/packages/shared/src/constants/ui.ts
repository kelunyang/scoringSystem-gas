/**
 * UI Constants
 * Centralized UI-related constants for consistent behavior across the application
 */

export const UI_CONSTANTS = {
  /**
   * Display limits for list views
   */
  DISPLAY_LIMITS: {
    DEFAULT: 100,
    MAX: 500,
    MIN: 10,
    STEP: 10,
    INCREMENTAL_LOAD: 50
  },

  /**
   * Batch operation settings
   */
  BATCH_OPERATIONS: {
    SIZE: 50,
    PROGRESS_DELAY_MS: 2000,
    MAX_ERROR_PREVIEW: 5
  },

  /**
   * Debounce delays (in milliseconds)
   */
  DEBOUNCE: {
    SEARCH_MS: 300,
    KEYWORD_MS: 500,
    AUTOSAVE_MS: 1000
  },

  /**
   * Pagination
   */
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100]
  },

  /**
   * Message durations (in milliseconds)
   */
  MESSAGE_DURATION: {
    SUCCESS_MS: 3000,
    ERROR_MS: 5000,
    WARNING_MS: 4000,
    INFO_MS: 3000
  }
} as const

export type UIConstants = typeof UI_CONSTANTS
