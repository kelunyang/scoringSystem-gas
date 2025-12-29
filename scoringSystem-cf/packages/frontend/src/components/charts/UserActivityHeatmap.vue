<template>
  <div class="user-activity-heatmap" ref="containerRef">
    <div v-if="isLoading" class="loading-state">
      <i class="fas fa-spinner fa-spin"></i>
      載入活動資料中...
    </div>

    <div v-else-if="error" class="error-state">
      <i class="fas fa-exclamation-triangle"></i>
      <p>{{ error.message || '載入活動資料時發生錯誤' }}</p>
      <button class="btn-secondary btn-sm" @click="refetch">
        <i class="fas fa-redo"></i>
        重試
      </button>
    </div>

    <div v-else class="heatmap-wrapper">
      <!-- Navigation Header -->
      <div class="heatmap-header">
        <button
          class="nav-btn"
          @click="navigatePrevious"
          :disabled="isLoading"
        >
          <i class="fas fa-angle-left"></i>
          <span class="nav-text">{{ navigationPreviousText }}</span>
        </button>

        <div class="date-range-display">
          {{ dateRangeDisplay }}
          <button
            v-if="!isCurrent"
            class="today-btn"
            @click="navigateToToday"
            :disabled="isLoading"
            title="回到今天"
          >
            <i class="fas fa-calendar-day"></i>
            <span class="today-text">今天</span>
          </button>
        </div>

        <button
          class="nav-btn"
          @click="navigateNext"
          :disabled="isLoading || isCurrent"
        >
          <span class="nav-text">{{ navigationNextText }}</span>
          <i class="fas fa-angle-right"></i>
        </button>
      </div>

      <!-- Heatmap Canvas -->
      <div class="heatmap-canvas" ref="chartContainerRef"></div>

      <!-- Legend -->
      <div class="heatmap-legend">
        <span class="legend-label">活動強度：</span>
        <div class="legend-colors">
          <div class="legend-item">
            <div class="legend-color legend-color-no-data"></div>
            <span>無資料</span>
          </div>
          <div class="legend-item">
            <div class="legend-color legend-color-low"></div>
            <span>低</span>
          </div>
          <div class="legend-item">
            <div class="legend-color legend-color-medium"></div>
            <span>中</span>
          </div>
          <div class="legend-item">
            <div class="legend-color legend-color-high"></div>
            <span>高</span>
          </div>
          <div class="legend-item">
            <div class="legend-color legend-color-very-high"></div>
            <span>極高</span>
          </div>
        </div>
        <div class="legend-colors legend-colors-secondary">
          <div class="legend-item">
            <div class="legend-color legend-color-failed"></div>
            <span>登入失敗</span>
          </div>
          <div class="legend-item">
            <div class="legend-badge"></div>
            <span>有活動</span>
          </div>
          <div class="legend-item legend-item-security">
            <i class="fas fa-skull legend-skull-icon"></i>
            <span>安全事件</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef, nextTick, markRaw } from 'vue'
import type { Ref, ComputedRef, ShallowRef } from 'vue'
import * as d3 from 'd3'
import { useD3Chart } from '@/composables/useD3Chart'
import { useActivityData } from '@/composables/useActivityData'
import type { ActivityData, ActivityStats } from '@/composables/useActivityData'
import {
  calculateCompactDateRange,
  calculateFullDateRange,
  getMonthsInRange,
  isCurrentPeriod as checkIsCurrentPeriod,
  type DateRange
} from '@/composables/useDateRange'
import { formatDateRange as formatRange } from '@/utils/date'
import { CHART_CONFIG } from '@/constants/chartConfig'
import EmptyState from '@/components/shared/EmptyState.vue'

export interface Props {
  userEmail: string
  displayMode?: 'compact' | 'full'
  compactDays?: number
  fullModeMonths?: number
  initialDate?: string
  height?: string
  allowNavigation?: boolean
  enableAnimation?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  displayMode: 'compact',
  compactDays: 10,
  fullModeMonths: 2,
  initialDate: () => new Date().toISOString().split('T')[0],
  height: 'auto',
  allowNavigation: true,
  enableAnimation: true
})

export interface DayClickPayload {
  date: string
  stats: ActivityStats
  events: any[]
}

export interface DateChangePayload {
  startDate: string
  endDate: string
}

const emit = defineEmits<{
  'day-click': [payload: DayClickPayload]
  'date-change': [payload: DateChangePayload]
  'error': [payload: { type: string; error: unknown }]
}>()

// Refs
const containerRef: Ref<HTMLDivElement | null> = ref(null)
const chartContainerRef: Ref<HTMLDivElement | null> = ref(null)

// Use shallowRef for DOM/D3 objects (no deep reactivity needed)
const tooltip: ShallowRef<d3.Selection<HTMLDivElement, unknown, null, undefined> | null> = shallowRef(null)
const svg: ShallowRef<d3.Selection<SVGSVGElement, unknown, HTMLDivElement, undefined> | null> = shallowRef(null)
const resizeObserver: ShallowRef<ResizeObserver | null> = shallowRef(null)
const resizeTimeoutId: ShallowRef<ReturnType<typeof setTimeout> | null> = shallowRef(null)

// State
const currentStartDate = ref('')
const currentEndDate = ref('')
const navigationBaseDate = ref(new Date()) // Track navigation position
const actualVisibleDays = ref(10) // Track actual visible days in compact mode
const isInitialized = ref(false) // Prevent query execution before initialization

// Initialize date range
const initializeDateRange = () => {
  const baseDate = new Date(props.initialDate)
  navigationBaseDate.value = baseDate

  let range: DateRange

  if (props.displayMode === 'compact') {
    range = calculateCompactDateRange(baseDate, CHART_CONFIG.COMPACT_MODE_FETCH_DAYS)
  } else {
    const maxMonths = calculateMaxMonthsInFullMode()
    range = calculateFullDateRange(baseDate, maxMonths)
  }

  currentStartDate.value = range.start
  currentEndDate.value = range.end
  isInitialized.value = true // Enable query after dates are set
}

// Initialize IMMEDIATELY during setup, before registering the query
initializeDateRange()

// Fetch activity data using TanStack Query
// At this point, dates are already initialized
const { data: activityData, isLoading, error, refetch } = useActivityData({
  userEmail: computed(() => props.userEmail),
  startDate: currentStartDate,
  endDate: currentEndDate,
  enabled: isInitialized // Already true after initializeDateRange()
})

// Setup ResizeObserver on mount
onMounted(() => {
  setupResizeObserver()
})

// Computed properties
const isCurrent = computed(() =>
  checkIsCurrentPeriod(navigationBaseDate.value, currentEndDate.value, props.displayMode)
)

const dateRangeDisplay = computed(() =>
  formatRange(currentStartDate.value, currentEndDate.value)
)

const navigationPreviousText = computed(() =>
  props.displayMode === 'compact' ? `前 ${actualVisibleDays.value} 天` : '上一個月'
)

const navigationNextText = computed(() =>
  props.displayMode === 'compact' ? `後 ${actualVisibleDays.value} 天` : '下一個月'
)

/**
 * Calculate maximum months that can fit in full mode based on container width
 */
function calculateMaxMonthsInFullMode(): number {
  if (!chartContainerRef.value) return props.fullModeMonths

  const containerWidth = chartContainerRef.value.clientWidth
  const containerHeight = chartContainerRef.value.clientHeight || 400

  const cellPadding = CHART_CONFIG.CELL_PADDING_FULL
  const availableHeight = containerHeight - CHART_CONFIG.WEEKDAY_LABEL_HEIGHT - CHART_CONFIG.MONTH_LABEL_HEIGHT - 40

  const maxWeeks = CHART_CONFIG.MAX_WEEKS_PER_MONTH
  let cellSize = Math.floor(availableHeight / maxWeeks) - cellPadding
  cellSize = Math.max(CHART_CONFIG.MIN_CELL_SIZE, Math.min(cellSize, CHART_CONFIG.MAX_CELL_SIZE))

  const totalCellSize = cellSize + cellPadding
  const monthWidth = 7 * totalCellSize + CHART_CONFIG.MONTH_SPACING
  const availableWidth = containerWidth - CHART_CONFIG.CONTAINER_PADDING

  const maxMonths = Math.floor(availableWidth / monthWidth)
  return Math.max(1, maxMonths)
}

/**
 * Navigate to previous period
 */
function navigatePrevious() {
  if (isLoading.value) return

  let newStart: string, newEnd: string

  if (props.displayMode === 'compact') {
    const end = new Date(currentStartDate.value)
    end.setDate(end.getDate() - 1)
    const range = calculateCompactDateRange(end, actualVisibleDays.value)
    newStart = range.start
    newEnd = range.end
  } else {
    const newBaseDate = new Date(navigationBaseDate.value)
    newBaseDate.setMonth(newBaseDate.getMonth() - 1)
    navigationBaseDate.value = newBaseDate

    const maxMonths = calculateMaxMonthsInFullMode()
    const range = calculateFullDateRange(newBaseDate, maxMonths)
    newStart = range.start
    newEnd = range.end
  }

  currentStartDate.value = newStart
  currentEndDate.value = newEnd
  emit('date-change', { startDate: newStart, endDate: newEnd })
}

/**
 * Navigate to next period
 */
function navigateNext() {
  if (isLoading.value || isCurrent.value) return

  let newStart: string, newEnd: string

  if (props.displayMode === 'compact') {
    const end = new Date(currentEndDate.value)
    end.setDate(end.getDate() + actualVisibleDays.value)
    const range = calculateCompactDateRange(end, actualVisibleDays.value)
    newStart = range.start
    newEnd = range.end
  } else {
    const newBaseDate = new Date(navigationBaseDate.value)
    newBaseDate.setMonth(newBaseDate.getMonth() + 1)

    const today = new Date()
    if (
      newBaseDate.getFullYear() > today.getFullYear() ||
      (newBaseDate.getFullYear() === today.getFullYear() && newBaseDate.getMonth() > today.getMonth())
    ) {
      newBaseDate.setFullYear(today.getFullYear())
      newBaseDate.setMonth(today.getMonth())
    }

    navigationBaseDate.value = newBaseDate

    const maxMonths = calculateMaxMonthsInFullMode()
    const range = calculateFullDateRange(newBaseDate, maxMonths)
    newStart = range.start
    newEnd = range.end
  }

  currentStartDate.value = newStart
  currentEndDate.value = newEnd
  emit('date-change', { startDate: newStart, endDate: newEnd })
}

/**
 * Navigate to today
 */
function navigateToToday() {
  if (isLoading.value) return

  const today = new Date()
  navigationBaseDate.value = today

  let newStart: string, newEnd: string

  if (props.displayMode === 'compact') {
    const range = calculateCompactDateRange(today, actualVisibleDays.value)
    newStart = range.start
    newEnd = range.end
  } else {
    const maxMonths = calculateMaxMonthsInFullMode()
    const range = calculateFullDateRange(today, maxMonths)
    newStart = range.start
    newEnd = range.end
  }

  currentStartDate.value = newStart
  currentEndDate.value = newEnd
  emit('date-change', { startDate: newStart, endDate: newEnd })
}

/**
 * Render the chart
 */
function renderChart() {
  if (!chartContainerRef.value || !activityData.value) return

  const { createTooltip, clearContainer } = useD3Chart()

  // Clean up existing elements
  if (svg.value) {
    svg.value.remove()
    svg.value = null
  }
  if (tooltip.value) {
    tooltip.value.remove()
    tooltip.value = null
  }

  clearContainer(chartContainerRef.value)

  const { dailyStats } = activityData.value

  // Full mode: Check if we need to recalculate months based on container width
  if (props.displayMode === 'full') {
    const currentMaxMonths = calculateMaxMonthsInFullMode()
    const range = calculateFullDateRange(navigationBaseDate.value, currentMaxMonths)

    if (range.start !== currentStartDate.value || range.end !== currentEndDate.value) {
      currentStartDate.value = range.start
      currentEndDate.value = range.end
      // Will trigger refetch via watch
      return
    }
  }

  // Generate complete date range
  const allDates = generateDateRange(currentStartDate.value, currentEndDate.value, dailyStats)

  if (allDates.length === 0) {
    const emptyState = document.createElement('div')
    emptyState.innerHTML = `
      <div class="empty-state compact type-info">
        <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
        <p class="empty-state-title compact-title">此時段無活動記錄</p>
      </div>
    `
    chartContainerRef.value.innerHTML = ''
    chartContainerRef.value.appendChild(emptyState)
    return
  }

  // Calculate layout
  const containerWidth = chartContainerRef.value.clientWidth
  const containerHeight = chartContainerRef.value.clientHeight || 400

  const { cellSize, cellPadding, datesToRender } = calculateCellSize(
    allDates,
    containerWidth,
    containerHeight
  )

  const layout = calculateLayout(datesToRender, containerWidth, cellSize, cellPadding)

  // Create SVG
  svg.value = d3.select(chartContainerRef.value)
    .append<SVGSVGElement>('svg')
    .attr('width', layout.totalWidth)
    .attr('height', layout.totalHeight)
    .attr('class', 'heatmap-svg') as any

  // Create tooltip
  tooltip.value = markRaw(createTooltip()) as any

  // Render chart elements
  if (svg.value) {
    renderCalendarCells(d3, svg.value, datesToRender, dailyStats, layout, cellSize, cellPadding)
    renderMonthLabels(d3, svg.value, datesToRender, layout, cellSize, cellPadding)
    renderWeekdayLabels(d3, svg.value, datesToRender, layout, cellSize, cellPadding)
  }
}

/**
 * Generate complete date range with empty stats for missing dates
 */
function generateDateRange(
  startDateStr: string,
  endDateStr: string,
  dailyStats: Record<string, ActivityStats>
): string[] {
  const allDates: string[] = []

  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number)
  const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number)

  const start = new Date(startYear, startMonth - 1, startDay)
  const end = new Date(endYear, endMonth - 1, endDay)
  const current = new Date(start)

  while (current <= end) {
    const year = current.getFullYear()
    const month = String(current.getMonth() + 1).padStart(2, '0')
    const day = String(current.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    allDates.push(dateStr)

    // Fill in missing stats
    if (!dailyStats[dateStr]) {
      dailyStats[dateStr] = {
        loginSuccess: 0,
        loginFailed: 0,
        failureReasons: [],
        hasSecurityEvent: false,
        activities: {
          hasSubmission: false,
          hasComment: false,
          hasVote: false,
          hasGroupApproval: false
        }
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return allDates
}

/**
 * Calculate cell size based on display mode and container dimensions
 */
function calculateCellSize(
  dates: string[],
  containerWidth: number,
  containerHeight: number
): { cellSize: number; cellPadding: number; datesToRender: string[] } {
  let cellSize: number
  let cellPadding: number
  let datesToRender = dates

  if (props.displayMode === 'compact') {
    const availableWidth = containerWidth - CHART_CONFIG.CONTAINER_PADDING
    cellPadding = CHART_CONFIG.CELL_PADDING_COMPACT

    const idealCellSize = CHART_CONFIG.IDEAL_CELL_SIZE
    const minCellSize = CHART_CONFIG.MIN_CELL_SIZE_COMPACT
    const maxCellSize = CHART_CONFIG.MAX_CELL_SIZE_COMPACT

    const idealCells = Math.floor(availableWidth / (idealCellSize + cellPadding))
    const targetCells = Math.min(idealCells, dates.length)

    cellSize = Math.floor(availableWidth / targetCells) - cellPadding
    cellSize = Math.max(minCellSize, Math.min(cellSize, maxCellSize))
  } else {
    cellPadding = CHART_CONFIG.CELL_PADDING_FULL
    const availableHeight = containerHeight - CHART_CONFIG.WEEKDAY_LABEL_HEIGHT - CHART_CONFIG.MONTH_LABEL_HEIGHT - 40

    const maxWeeks = CHART_CONFIG.MAX_WEEKS_PER_MONTH
    cellSize = Math.floor(availableHeight / maxWeeks) - cellPadding
    cellSize = Math.max(CHART_CONFIG.MIN_CELL_SIZE, Math.min(cellSize, CHART_CONFIG.MAX_CELL_SIZE))
  }

  return { cellSize, cellPadding, datesToRender }
}

/**
 * Calculate chart layout
 */
function calculateLayout(
  dates: string[],
  containerWidth: number,
  cellSize: number,
  cellPadding: number
): {
  totalWidth: number
  totalHeight: number
  isHorizontal: boolean
  monthLabelHeight: number
  weekdayLabelHeight: number
  cellSize: number
  cellPadding: number
  visibleDays: number
} {
  const startDate = new Date(dates[0])
  const endDate = new Date(dates[dates.length - 1])
  const totalCellSize = cellSize + cellPadding

  let totalWidth: number, totalHeight: number, isHorizontal: boolean, visibleDays: number

  if (props.displayMode === 'compact') {
    const availableWidth = containerWidth - CHART_CONFIG.CONTAINER_PADDING
    const maxCellsCanFit = Math.floor(availableWidth / totalCellSize)

    visibleDays = Math.min(maxCellsCanFit, dates.length)
    actualVisibleDays.value = visibleDays

    isHorizontal = true
    totalWidth = visibleDays * totalCellSize + CHART_CONFIG.CONTAINER_PADDING
    totalHeight = 15 + totalCellSize + 25
  } else {
    visibleDays = dates.length
    const months = getMonthsInRange(startDate, endDate)
    const monthCount = months.length
    const monthWidth = 7 * totalCellSize + CHART_CONFIG.MONTH_SPACING

    isHorizontal = false
    totalWidth = monthCount * monthWidth + CHART_CONFIG.CONTAINER_PADDING
    totalHeight = CHART_CONFIG.MONTH_LABEL_HEIGHT + CHART_CONFIG.WEEKDAY_LABEL_HEIGHT + 6 * totalCellSize + 20
  }

  return {
    totalWidth,
    totalHeight,
    isHorizontal,
    monthLabelHeight: CHART_CONFIG.MONTH_LABEL_HEIGHT,
    weekdayLabelHeight: CHART_CONFIG.WEEKDAY_LABEL_HEIGHT,
    cellSize,
    cellPadding,
    visibleDays
  }
}

/**
 * Render calendar cells
 */
function renderCalendarCells(
  d3: any,
  svgElement: d3.Selection<SVGSVGElement, unknown, HTMLDivElement, undefined>,
  dates: string[],
  dailyStats: Record<string, ActivityStats>,
  layout: any,
  cellSize: number,
  cellPadding: number
) {
  const totalCellSize = cellSize + cellPadding
  const datesToRender = props.displayMode === 'compact' && layout.visibleDays
    ? dates.slice(-layout.visibleDays)
    : dates

  datesToRender.forEach((dateStr, index) => {
    const date = new Date(dateStr)
    const stats = dailyStats[dateStr]

    // Calculate position
    let x: number, y: number
    if (props.displayMode === 'compact') {
      x = 20 + index * totalCellSize
      y = 15
    } else {
      const year = date.getFullYear()
      const month = date.getMonth()
      const day = date.getDate()
      const dayOfWeek = date.getDay()

      const startDate = new Date(datesToRender[0])
      const startYear = startDate.getFullYear()
      const startMonth = startDate.getMonth()
      const monthIndex = (year - startYear) * 12 + (month - startMonth)

      const firstDayOfMonth = new Date(year, month, 1)
      const firstDayOfWeek = firstDayOfMonth.getDay()

      const dayIndexInMonth = day - 1
      const weekIndexInMonth = Math.floor((dayIndexInMonth + firstDayOfWeek) / 7)

      const monthWidth = 7 * totalCellSize + CHART_CONFIG.MONTH_SPACING

      x = 20 + monthIndex * monthWidth + dayOfWeek * totalCellSize
      y = layout.monthLabelHeight + layout.weekdayLabelHeight + 10 + weekIndexInMonth * totalCellSize
    }

    // Create cell group
    const cellGroup = svgElement.append('g')
      .attr('class', 'calendar-cell')
      .attr('data-date', dateStr)
      .style('cursor', 'pointer')

    // 🔥 PRIORITY: Security event (show skull icon instead of coloring)
    if (stats.hasSecurityEvent) {
      // Draw background rectangle (light gray)
      cellGroup.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', cellSize)
        .attr('height', cellSize)
        .attr('rx', 2)
        .attr('fill', '#f5f5f5')
        .attr('stroke', '#dc3545')
        .attr('stroke-width', 2)
        .on('mouseover', function(event: MouseEvent) {
          d3.select(this)
            .transition()
            .duration(CHART_CONFIG.TRANSITION_DURATION)
            .style('opacity', 0.7)

          showTooltip(event, dateStr, stats)
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(CHART_CONFIG.TRANSITION_DURATION)
            .style('opacity', 1)

          hideTooltip()
        })
        .on('click', () => {
          handleCellClick(dateStr, stats)
        })

      // Draw red skull icon (FontAwesome fa-skull)
      const skullIcon = cellGroup.append('text')
        .attr('x', x + cellSize / 2)
        .attr('y', y + cellSize / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-family', 'Font Awesome 6 Free')
        .attr('font-weight', '900')
        .attr('font-size', `${cellSize * 0.6}px`)
        .attr('fill', '#dc3545')
        .text('\uf54c') // Unicode for fa-skull
        .style('pointer-events', 'none')

      if (props.enableAnimation) {
        skullIcon
          .attr('opacity', 0)
          .transition()
          .duration(CHART_CONFIG.ANIMATION_DURATION)
          .delay(index * CHART_CONFIG.ANIMATION_DELAY_PER_CELL)
          .ease(d3.easeCubicOut)
          .attr('opacity', 1)
      }

      return // Skip normal rendering
    }

    // Normal rendering (no security event)
    const color = getCellColor(stats)

    const hasAnyActivity = stats.loginSuccess > 0 || stats.loginFailed > 0 || hasActivity(stats)
    const strokeColor = stats.loginFailed > 0 ? CHART_CONFIG.COLORS.LOGIN_FAILED_CRITICAL : (hasAnyActivity ? '#e1e4e8' : '#333')
    const strokeWidth = stats.loginFailed > 0 ? 2 : (hasAnyActivity ? 1 : 1.5)

    // Draw rectangle
    const rect = cellGroup.append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 2)
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth)
      .on('mouseover', function(event: MouseEvent) {
        d3.select(this)
          .transition()
          .duration(CHART_CONFIG.TRANSITION_DURATION)
          .style('opacity', 0.7)

        showTooltip(event, dateStr, stats)
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(CHART_CONFIG.TRANSITION_DURATION)
          .style('opacity', 1)

        hideTooltip()
      })
      .on('click', () => {
        handleCellClick(dateStr, stats)
      })

    // Animation
    if (props.enableAnimation) {
      rect
        .attr('fill', CHART_CONFIG.COLORS.NO_DATA)
        .attr('opacity', 0)
        .transition()
        .duration(CHART_CONFIG.ANIMATION_DURATION)
        .delay(index * CHART_CONFIG.ANIMATION_DELAY_PER_CELL)
        .ease(d3.easeCubicOut)
        .attr('fill', color)
        .attr('opacity', 1)
    } else {
      rect
        .attr('fill', color)
        .attr('opacity', 1)
    }

    // Badge for project activity
    if (hasActivity(stats)) {
      const badge = cellGroup.append('circle')
        .attr('cx', x + cellSize - 3)
        .attr('cy', y + 3)
        .attr('r', 3)
        .attr('fill', CHART_CONFIG.COLORS.BADGE)
        .attr('stroke', CHART_CONFIG.COLORS.BADGE_BORDER)
        .attr('stroke-width', 1)
        .style('pointer-events', 'none')

      if (props.enableAnimation) {
        badge
          .attr('opacity', 0)
          .transition()
          .duration(300)
          .delay(index * CHART_CONFIG.ANIMATION_DELAY_PER_CELL + CHART_CONFIG.ANIMATION_BADGE_DELAY)
          .ease(d3.easeCubicOut)
          .attr('opacity', 1)
      }
    }
  })
}

/**
 * Get cell color based on stats
 */
function getCellColor(stats: ActivityStats): string {
  if (!stats) return CHART_CONFIG.COLORS.NO_DATA

  // Login failures take priority
  if (stats.loginFailed > 0) {
    if (stats.loginFailed >= CHART_CONFIG.FAILURE_THRESHOLDS.CRITICAL) return CHART_CONFIG.COLORS.LOGIN_FAILED_CRITICAL
    if (stats.loginFailed >= CHART_CONFIG.FAILURE_THRESHOLDS.HIGH) return CHART_CONFIG.COLORS.LOGIN_FAILED_HIGH
    if (stats.loginFailed >= CHART_CONFIG.FAILURE_THRESHOLDS.MEDIUM) return CHART_CONFIG.COLORS.LOGIN_FAILED_MEDIUM
    return CHART_CONFIG.COLORS.LOGIN_FAILED_LIGHT
  }

  // Login success colors
  if (stats.loginSuccess >= CHART_CONFIG.LOGIN_THRESHOLDS.VERY_HIGH) return CHART_CONFIG.COLORS.VERY_HIGH_ACTIVITY
  if (stats.loginSuccess >= CHART_CONFIG.LOGIN_THRESHOLDS.HIGH) return CHART_CONFIG.COLORS.HIGH_ACTIVITY
  if (stats.loginSuccess >= CHART_CONFIG.LOGIN_THRESHOLDS.MEDIUM) return CHART_CONFIG.COLORS.MEDIUM_ACTIVITY
  if (stats.loginSuccess >= CHART_CONFIG.LOGIN_THRESHOLDS.LOW) return CHART_CONFIG.COLORS.LOW_ACTIVITY

  // Project activity without login
  if (hasActivity(stats)) return CHART_CONFIG.COLORS.SOME_ACTIVITY

  return CHART_CONFIG.COLORS.NO_DATA
}

/**
 * Check if there's project activity
 */
function hasActivity(stats: ActivityStats): boolean {
  if (!stats || !stats.activities) return false
  return stats.activities.hasSubmission ||
         stats.activities.hasComment ||
         stats.activities.hasVote ||
         stats.activities.hasGroupApproval
}

/**
 * Render month labels (full mode only)
 */
function renderMonthLabels(
  d3: any,
  svgElement: d3.Selection<SVGSVGElement, unknown, HTMLDivElement, undefined>,
  dates: string[],
  layout: any,
  cellSize: number,
  cellPadding: number
) {
  if (props.displayMode === 'compact') return

  const totalCellSize = cellSize + cellPadding
  const months = getMonthsInRange(new Date(dates[0]), new Date(dates[dates.length - 1]))
  const monthWidth = 7 * totalCellSize + CHART_CONFIG.MONTH_SPACING

  months.forEach((month, index) => {
    const monthX = 20 + index * monthWidth + (monthWidth - CHART_CONFIG.MONTH_SPACING) / 2

    svgElement.append('text')
      .attr('x', monthX)
      .attr('y', layout.monthLabelHeight - 5)
      .attr('class', 'month-label')
      .attr('text-anchor', 'middle')
      .text(month.label)
      .style('font-size', '13px')
      .style('fill', '#333')
      .style('font-weight', '600')
  })
}

/**
 * Render weekday labels
 */
function renderWeekdayLabels(
  d3: any,
  svgElement: d3.Selection<SVGSVGElement, unknown, HTMLDivElement, undefined>,
  dates: string[],
  layout: any,
  cellSize: number,
  cellPadding: number
) {
  const totalCellSize = cellSize + cellPadding
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']

  if (props.displayMode === 'compact') {
    const datesToRender = layout.visibleDays ? dates.slice(-layout.visibleDays) : dates

    datesToRender.forEach((dateStr, index) => {
      const date = new Date(dateStr)
      const dayLabel = weekdays[date.getDay()]

      svgElement.append('text')
        .attr('x', 20 + index * totalCellSize + cellSize / 2)
        .attr('y', 8)
        .attr('text-anchor', 'middle')
        .attr('class', 'weekday-label-compact')
        .text(dayLabel)
        .style('font-size', '10px')
        .style('fill', '#999')
        .style('font-weight', '400')
    })
  } else {
    const months = getMonthsInRange(new Date(dates[0]), new Date(dates[dates.length - 1]))
    const monthWidth = 7 * totalCellSize + CHART_CONFIG.MONTH_SPACING

    months.forEach((month, monthIndex) => {
      weekdays.forEach((day, dayIndex) => {
        svgElement.append('text')
          .attr('x', 20 + monthIndex * monthWidth + dayIndex * totalCellSize + cellSize / 2)
          .attr('y', layout.monthLabelHeight + 15)
          .attr('text-anchor', 'middle')
          .attr('class', 'weekday-label')
          .text(day)
          .style('font-size', '11px')
          .style('fill', '#666')
          .style('font-weight', '500')
      })
    })
  }
}

/**
 * Show tooltip
 */
function showTooltip(event: MouseEvent, dateStr: string, stats: ActivityStats) {
  if (!tooltip.value) return

  const date = new Date(dateStr)
  const dateDisplay = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`

  let content = `<strong>${dateDisplay}</strong><br>`

  // 🔥 PRIORITY: Security event warning
  if (stats.hasSecurityEvent) {
    content += `<span style="color: #dc3545; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> 帳號安全事件</span><br>`
    content += `<small style="color: #dc3545;">此日期發生帳號鎖定或安全警報</small><br>`
    content += `<small style="color: #999;">點擊查看詳細資訊</small>`
  } else {
    // Normal activity display
    if (stats.loginSuccess > 0) {
      content += `<span style="color: #28a745">✓ 登入成功: ${stats.loginSuccess} 次</span><br>`
    }

    if (stats.loginFailed > 0) {
      content += `<span style="color: #dc3545">✗ 登入失敗: ${stats.loginFailed} 次</span><br>`
      if (stats.failureReasons.length > 0) {
        content += `<small>原因: ${stats.failureReasons.join(', ')}</small><br>`
      }
    }

    if (hasActivity(stats)) {
      content += '<span style="color: #ffc107"><i class="fas fa-bolt"></i> 有專案活動</span>'
    }

    if (!stats.loginSuccess && !stats.loginFailed && !hasActivity(stats)) {
      content += '<span style="color: #999">無活動記錄</span>'
    }
  }

  tooltip.value.html(content)
    .style('left', (event.pageX + 10) + 'px')
    .style('top', (event.pageY - 10) + 'px')
    .style('opacity', 1)
}

/**
 * Hide tooltip
 */
function hideTooltip() {
  if (tooltip.value) {
    tooltip.value.style('opacity', 0)
  }
}

/**
 * Handle cell click
 */
function handleCellClick(dateStr: string, stats: ActivityStats) {
  if (!activityData.value) return

  const events = activityData.value.events.filter((e: any) => e.date === dateStr)
  emit('day-click', { date: dateStr, stats, events })
}

/**
 * Setup resize observer with debounce
 */
function setupResizeObserver() {
  if (!containerRef.value) return

  resizeObserver.value = new ResizeObserver(() => {
    if (resizeTimeoutId.value) {
      clearTimeout(resizeTimeoutId.value)
    }
    resizeTimeoutId.value = setTimeout(() => {
      if (activityData.value) {
        renderChart()
      }
    }, 150) // Debounce by 150ms
  })

  resizeObserver.value.observe(containerRef.value)
}

// Watch for data changes
watch(activityData, (newData) => {
  if (newData) {
    nextTick(() => {
      renderChart()
    })
  }
})

// Watch for userEmail changes
watch(() => props.userEmail, () => {
  initializeDateRange()
})

// Lifecycle hooks
onMounted(() => {
  setupResizeObserver()
})

onUnmounted(() => {
  // Clear resize timeout to prevent race condition
  if (resizeTimeoutId.value) {
    clearTimeout(resizeTimeoutId.value)
    resizeTimeoutId.value = null
  }

  if (resizeObserver.value) {
    resizeObserver.value.disconnect()
    resizeObserver.value = null
  }
  if (tooltip.value) {
    tooltip.value.remove()
    tooltip.value = null
  }
  if (svg.value) {
    svg.value.remove()
    svg.value = null
  }
})
</script>

<style scoped>
.user-activity-heatmap {
  width: 100%;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
}

.loading-state i {
  font-size: 24px;
  margin-bottom: 10px;
  color: #409eff;
}

.error-state i {
  font-size: 32px;
  margin-bottom: 15px;
  color: #f56c6c;
}

.error-state p {
  margin-bottom: 15px;
}

.heatmap-wrapper {
  width: 100%;
}

.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  gap: 15px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-text {
  font-size: 14px;
}

.nav-btn:hover:not(:disabled) {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.date-range-display {
  font-weight: 500;
  color: #303133;
  min-width: 200px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.today-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #303133;
}

.today-btn:hover:not(:disabled) {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.today-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.today-btn i {
  font-size: 13px;
}

.heatmap-canvas {
  width: 100%;
  overflow-x: auto;
  margin-bottom: 15px;
}

.heatmap-svg {
  display: block;
}

.calendar-cell rect {
  transition: all 0.2s;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #606266;
}

.legend-label {
  font-weight: 500;
  margin-right: 10px;
}

.legend-colors {
  display: flex;
  gap: 8px;
}

.legend-colors-secondary {
  margin-left: 20px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid #e1e4e8;
}

.legend-color-no-data {
  background: #ffffff;
  border: 1.5px solid #333;
}

.legend-color-low {
  background: #c6e48b;
}

.legend-color-medium {
  background: #7bc96f;
}

.legend-color-high {
  background: #239a3b;
}

.legend-color-very-high {
  background: #196127;
}

.legend-color-failed {
  background: #d73a49;
}

.legend-badge {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd700;
  border: 1px solid #fff;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
}

.legend-skull-icon {
  color: #dc3545;
  font-size: 14px;
}

.legend-item-security {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  color: #dc3545;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #909399;
}

.no-data i {
  font-size: 48px;
  margin-bottom: 15px;
  opacity: 0.5;
}

.no-data p {
  font-size: 14px;
}

/* RWD */
@media (max-width: 768px) {
  .user-activity-heatmap {
    padding: 15px;
  }

  .heatmap-header {
    font-size: 14px;
    flex-wrap: wrap;
  }

  .nav-btn {
    padding: 6px 10px;
    font-size: 12px;
  }

  .nav-text {
    font-size: 12px;
  }

  .date-range-display {
    min-width: 150px;
    font-size: 13px;
    order: -1;
    width: 100%;
    margin-bottom: 10px;
  }

  .legend-label {
    width: 100%;
    margin-bottom: 5px;
  }

  .legend-colors {
    flex-wrap: wrap;
  }

  .heatmap-svg {
    overflow-x: auto;
  }
}

@media (max-width: 480px) {
  .nav-btn {
    padding: 4px 8px;
  }

  .nav-btn i {
    font-size: 16px;
  }

  .nav-text {
    display: none;
  }
}
</style>
