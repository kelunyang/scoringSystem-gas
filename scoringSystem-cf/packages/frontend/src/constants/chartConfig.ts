/**
 * Chart configuration constants for activity heatmap
 */

export const CHART_CONFIG = {
  // Cell sizing
  MIN_CELL_SIZE: 12,
  MAX_CELL_SIZE: 30,
  IDEAL_CELL_SIZE: 18,
  MIN_CELL_SIZE_COMPACT: 12,
  MAX_CELL_SIZE_COMPACT: 22,

  // Padding
  CELL_PADDING_COMPACT: 3,
  CELL_PADDING_FULL: 2,

  // Label heights
  WEEKDAY_LABEL_HEIGHT: 20,
  MONTH_LABEL_HEIGHT: 30,

  // Animation
  ANIMATION_DURATION: 500,
  ANIMATION_DELAY_PER_CELL: 15,
  ANIMATION_BADGE_DELAY: 200,
  TRANSITION_DURATION: 150,

  // Layout
  CONTAINER_PADDING: 40,
  MONTH_SPACING: 20,
  MAX_WEEKS_PER_MONTH: 6,

  // Data fetching
  COMPACT_MODE_FETCH_DAYS: 60, // Fetch extra days for responsive display

  // Colors
  COLORS: {
    NO_DATA: '#ffffff',
    LOW_ACTIVITY: '#c6e48b',
    MEDIUM_ACTIVITY: '#7bc96f',
    HIGH_ACTIVITY: '#239a3b',
    VERY_HIGH_ACTIVITY: '#196127',
    SOME_ACTIVITY: '#ebedf0',
    LOGIN_FAILED_LIGHT: '#ffcccb',
    LOGIN_FAILED_MEDIUM: '#ff9999',
    LOGIN_FAILED_HIGH: '#ff6666',
    LOGIN_FAILED_CRITICAL: '#d73a49',
    BADGE: '#ffd700',
    BADGE_BORDER: '#fff'
  },

  // Login thresholds
  LOGIN_THRESHOLDS: {
    VERY_HIGH: 10,
    HIGH: 6,
    MEDIUM: 3,
    LOW: 1
  },

  // Login failure thresholds
  FAILURE_THRESHOLDS: {
    CRITICAL: 6,
    HIGH: 4,
    MEDIUM: 2,
    LOW: 1
  }
} as const

export type ChartConfig = typeof CHART_CONFIG
