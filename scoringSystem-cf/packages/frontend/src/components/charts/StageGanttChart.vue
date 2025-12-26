<template>
  <div class="stage-gantt-chart">
    <!-- 空狀態 -->
    <div v-if="!stages || stages.length === 0" class="gantt-empty-state">
      <span>無階段</span>
    </div>

    <template v-else>
      <!-- Mini-map 時間感知條 (3px) -->
      <div v-if="showMinimap && enableDrag" class="gantt-minimap">
        <div class="minimap-bar" ref="minimapBar">
          <div class="minimap-track"></div>
          <div class="minimap-viewport" :style="minimapStyle"></div>
        </div>
      </div>

      <!-- 主甘特圖區域 -->
      <div ref="chartContainer" class="gantt-main" :class="{ 'drag-mode': enableDrag }"></div>

      <!-- 操作提示（拖曳模式） -->
      <div v-if="enableDrag" class="gantt-hint">
        左右拖曳可以看到完整的專案階段,滑鼠滾動改變可視範圍
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import * as d3 from 'd3'
import { getStageColor } from '@repo/shared'
import dayjs from 'dayjs'
import minMax from 'dayjs/plugin/minMax'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import { useD3Chart } from '@/composables/useD3Chart'
import randomColor from 'randomcolor'

dayjs.extend(minMax)
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)

export default {
  name: 'StageGanttChart',

  props: {
    /**
     * 階段數據陣列
     * @type {Array<{stageName: string, startTime: Date|string|number, endTime: Date|string|number, status: string, extraTime?: number|Infinity, extraTimeText?: string}>}
     * @required
     *
     * 每個階段物件需包含：
     * - stageName: 階段名稱（字串）
     * - startTime: 開始時間（Date 物件、ISO 字串或 timestamp）
     * - endTime: 結束時間（Date 物件、ISO 字串或 timestamp）
     * - status: 階段狀態，可選值：'pending' | 'active' | 'voting' | 'completed'
     * - extraTime: (可選) 延長時間，undefined | timestamp | Infinity
     * - extraTimeText: (可選) 延長段顯示文字，預設 ""
     *
     * 範例：
     * [{
     *   stageName: "階段一",
     *   startTime: "2024-10-01",
     *   endTime: "2024-10-15",
     *   status: "completed",
     *   extraTime: Infinity,
     *   extraTimeText: "投票階段將由老師手動關閉結算"
     * }]
     */
    stages: {
      type: Array,
      required: true
    },

    /**
     * 里程碑數據陣列
     * @type {Array<{eventName: string, eventTick: Date|string|number, eventType: string}>}
     * @default []
     *
     * 每個里程碑物件需包含：
     * - eventName: 事件名稱（字串）
     * - eventTick: 事件時間點（Date 物件、ISO 字串或 timestamp）
     * - eventType: 事件類型（字串，用於分類和顏色生成）
     *
     * 範例：
     * [{
     *   eventName: "中期審查",
     *   eventTick: "2024-10-20",
     *   eventType: "review"
     * }]
     */
    milestones: {
      type: Array,
      default: () => []
    },

    /**
     * 是否啟用拖曳功能
     * - true: 支持橫向拖曳 + 慣性滾動 + 滾輪縮放
     * - false: 固定視圖，僅顯示指定數量的階段
     */
    enableDrag: {
      type: Boolean,
      default: true
    },

    /**
     * 是否顯示 Mini-map 時間感知條
     * 僅在 enableDrag=true 時有效
     */
    showMinimap: {
      type: Boolean,
      default: true
    },

    /**
     * 固定模式下顯示的階段數量
     * 僅在 enableDrag=false 時生效
     */
    fixedStageCount: {
      type: Number,
      default: 3
    },

    /**
     * 圖表基礎高度（像素）
     * - 固定模式：使用此高度
     * - 動態模式：根據階段數量自動計算高度
     */
    height: {
      type: Number,
      default: 200
    },

    /**
     * 緊湊模式
     * 用於卡片等空間受限的場景
     */
    compact: {
      type: Boolean,
      default: false
    },

    /**
     * 初始置中時間點
     * - undefined: 自動判定（現在時間或最後階段）
     * - 有值: 使用指定時間為中心
     * @type {Number|Date|String|undefined}
     */
    centerTime: {
      type: [Number, Date, String],
      default: undefined
    }
  },

  emits: ['stage-click', 'viewport-change'],

  setup(props, { emit }) {
    const { createTooltip, clearContainer } = useD3Chart()

    // Refs
    const chartContainer = ref(null)

    // 完整時間範圍
    const fullTimeRange = ref({
      start: null,
      end: null
    })

    // 當前可視窗口
    const viewport = ref({
      start: null,
      end: null
    })

    // 可視窗口天數
    const viewportDays = ref(60)

    // 可見階段列表
    const visibleStages = ref([])

    // 拖曳狀態
    const isDragging = ref(false)
    const dragStartX = ref(0)
    const dragStartViewport = ref(null)

    // 慣性滾動
    const velocity = ref(0)
    const lastDragTime = ref(0)
    const lastDragX = ref(0)
    const momentumAnimationId = ref(null)

    // 渲染節流
    const lastRenderTime = ref(0)
    const RENDER_INTERVAL = 16 // ~60fps

    // D3 比例尺和軸
    const xScale = ref(null)
    const yScale = ref(null)
    const svg = ref(null)
    const g = ref(null)

    // Minimap
    const minimapBar = ref(null)

    // Tooltip
    const tooltip = ref(null)

    // Pattern 定義標記（避免重複創建）
    let patternDefined = false

    // Event type 顏色映射（使用 Map 緩存）
    const eventTypeColors = ref(new Map())

    /**
     * 獲取事件類型對應的顏色
     * 使用 randomColor 生成深色系顏色（排除紅色）
     * 使用 eventType 作為 seed 確保顏色一致性
     */
    const getEventTypeColor = (eventType) => {
      if (!eventTypeColors.value.has(eventType)) {
        const color = randomColor({
          luminosity: 'dark',
          hue: 'random',
          seed: eventType,
          format: 'hex'
        })

        // 排除紅色系（#e74c3c 附近的顏色）
        // 檢查生成的顏色是否為紅色系，如果是則重新生成
        const r = parseInt(color.slice(1, 3), 16)
        const g = parseInt(color.slice(3, 5), 16)
        const b = parseInt(color.slice(5, 7), 16)

        // 如果 R 值明顯高於 G 和 B，則認為是紅色系
        if (r > 200 && r > g + 50 && r > b + 50) {
          // 使用備選顏色策略：基於 eventType 字串生成非紅色的深色
          const hues = ['blue', 'green', 'purple', 'orange', 'yellow', 'pink', 'monochrome']
          const hueIndex = eventType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % hues.length
          const alternativeColor = randomColor({
            luminosity: 'dark',
            hue: hues[hueIndex],
            seed: eventType,
            format: 'hex'
          })
          eventTypeColors.value.set(eventType, alternativeColor)
        } else {
          eventTypeColors.value.set(eventType, color)
        }
      }
      return eventTypeColors.value.get(eventType)
    }

    // Mini-map 樣式
    const minimapStyle = computed(() => {
      if (!fullTimeRange.value.start || !viewport.value.start) return {}

      // 使用 Day.js 計算時間差
      const fullDuration = dayjs(fullTimeRange.value.end).diff(dayjs(fullTimeRange.value.start))
      const viewportStartOffset = dayjs(viewport.value.start).diff(dayjs(fullTimeRange.value.start))
      const viewportDuration = dayjs(viewport.value.end).diff(dayjs(viewport.value.start))

      const left = (viewportStartOffset / fullDuration) * 100
      const width = (viewportDuration / fullDuration) * 100

      return {
        left: `${Math.max(0, left)}%`,
        width: `${Math.min(100 - left, width)}%`
      }
    })

    // ==================== 時間軸計算 ====================

    /**
     * 預處理階段數據：處理 undefined 的 startTime/endTime
     * 1. 過濾掉兩者都是 undefined 的階段
     * 2. 如果只有一個是 undefined，用所有有效階段的最早/最晚時間填充
     * 3. 標記哪個時間被自動填充，用於後續特殊渲染
     */
    const preprocessStages = () => {
      if (!props.stages || props.stages.length === 0) return []

      // 1. 先過濾掉兩者都是 undefined 的階段
      const validStages = props.stages.filter(stage => {
        const hasStart = stage.startTime !== undefined && stage.startTime !== null
        const hasEnd = stage.endTime !== undefined && stage.endTime !== null
        return hasStart || hasEnd // 至少有一個時間值
      })

      if (validStages.length === 0) return []

      // 2. 收集所有有效的時間值（使用 Day.js）
      const validStartTimes = validStages
        .filter(s => s.startTime !== undefined && s.startTime !== null)
        .map(s => dayjs(s.startTime))
        .filter(d => d.isValid())

      const validEndTimes = validStages
        .filter(s => s.endTime !== undefined && s.endTime !== null)
        .map(s => dayjs(s.endTime))
        .filter(d => d.isValid())

      // 使用 Day.js minMax plugin，並處理空數組情況
      const earliestStart = validStartTimes.length > 0
        ? dayjs.min(validStartTimes)
        : dayjs() // 後備值：當前時間

      const latestEnd = validEndTimes.length > 0
        ? dayjs.max(validEndTimes)
        : dayjs().add(30, 'day') // 後備值：當前時間 + 30 天

      // 3. 處理每個階段，自動填充缺失的時間
      return validStages.map(stage => {
        const hasStart = stage.startTime !== undefined && stage.startTime !== null
        const hasEnd = stage.endTime !== undefined && stage.endTime !== null

        return {
          ...stage,
          startTime: hasStart ? stage.startTime : earliestStart.toDate(),
          endTime: hasEnd ? stage.endTime : latestEnd.toDate(),
          missingStart: !hasStart, // 標記開始時間是否被自動填充
          missingEnd: !hasEnd      // 標記結束時間是否被自動填充
        }
      })
    }

    // 預處理後的階段數據
    const processedStages = ref([])

    const calculateFullTimeRange = () => {
      if (!processedStages.value || processedStages.value.length === 0) return

      const allDates = []

      processedStages.value.forEach(stage => {
        allDates.push(dayjs(stage.startTime))

        // 如果有 extraTime 且為有限數字，計入時間範圍
        if (stage.extraTime !== undefined &&
            stage.extraTime !== Infinity &&
            !isNaN(stage.extraTime)) {
          allDates.push(dayjs(stage.extraTime))
        } else {
          allDates.push(dayjs(stage.endTime))
        }
      })

      const validDates = allDates.filter(d => d.isValid())
      if (validDates.length === 0) return

      fullTimeRange.value = {
        start: dayjs.min(validDates).toDate(),
        end: dayjs.max(validDates).toDate()
      }
    }

    const calculateDynamicViewportDays = () => {
      if (!fullTimeRange.value.start || !fullTimeRange.value.end) return 60

      const totalMs = fullTimeRange.value.end - fullTimeRange.value.start
      const totalDays = totalMs / (24 * 60 * 60 * 1000)

      // 基準：半年專案（180天）顯示 60 天視窗
      const baseProjectDays = 180
      const baseViewportDays = 60
      const ratio = baseViewportDays / baseProjectDays

      let calculatedDays = totalDays * ratio

      // 限制範圍：最少 7 天，最多 180 天
      return Math.max(7, Math.min(180, Math.round(calculatedDays)))
    }

    const centerViewportOnDefaultPosition = () => {
      const halfRangeDays = viewportDays.value / 2

      // 優先使用 props.centerTime
      if (props.centerTime !== undefined) {
        const center = dayjs(props.centerTime)
        if (center.isValid()) {
          viewport.value = {
            start: center.subtract(halfRangeDays, 'day').toDate(),
            end: center.add(halfRangeDays, 'day').toDate()
          }
          return
        }
      }

      // 否則使用原有邏輯
      const now = dayjs()

      // 檢查當前時間 ±30 天內是否有階段（使用標準區間重疊公式）
      const hasStagesNearNow = processedStages.value.some(stage => {
        const stageStartTime = new Date(stage.startTime).getTime()
        const stageEndTime = new Date(stage.endTime).getTime()
        const thirtyDaysAgo = now.subtract(30, 'day').valueOf()
        const thirtyDaysLater = now.add(30, 'day').valueOf()

        // 標準區間重疊：end > start2 && start < end2（使用時間戳比較）
        return stageEndTime > thirtyDaysAgo && stageStartTime < thirtyDaysLater
      })

      if (hasStagesNearNow) {
        // 情況 A：以「現在」為中心
        viewport.value = {
          start: now.subtract(halfRangeDays, 'day').toDate(),
          end: now.add(halfRangeDays, 'day').toDate()
        }
      } else {
        // 情況 B：以最後一個階段的結束時間為中心
        const sortedByEnd = [...processedStages.value].sort((a, b) =>
          dayjs(b.endTime).diff(dayjs(a.endTime))
        )
        const lastStageEnd = dayjs(sortedByEnd[0].endTime)

        viewport.value = {
          start: lastStageEnd.subtract(halfRangeDays, 'day').toDate(),
          end: lastStageEnd.add(halfRangeDays, 'day').toDate()
        }
      }
    }

    const initializeTimeline = () => {
      if (!props.stages || props.stages.length === 0) return

      // 0. 預處理階段數據（處理 undefined 時間）
      processedStages.value = preprocessStages()

      if (processedStages.value.length === 0) return

      // 1. 計算完整時間範圍
      calculateFullTimeRange()

      // 2. 計算動態視窗範圍
      viewportDays.value = calculateDynamicViewportDays()

      // 3. 設置初始視窗位置
      centerViewportOnDefaultPosition()
    }

    // ==================== 階段處理 ====================

    const getFixedVisibleStages = () => {
      // 保持父組件傳入的原始順序，不做排序
      const stages = processedStages.value

      // 找第一個 active 階段
      const activeIndex = stages.findIndex(s => s.status === 'active')
      const centerIndex = activeIndex >= 0 ? activeIndex : Math.floor(stages.length / 2)

      // 以中心為基準，上下各取階段
      const halfCount = Math.floor(props.fixedStageCount / 2)
      const startIndex = Math.max(0, centerIndex - halfCount)
      const endIndex = Math.min(stages.length, startIndex + props.fixedStageCount)

      return stages.slice(startIndex, endIndex)
    }

    const getDynamicVisibleStages = () => {
      if (!viewport.value.start || !viewport.value.end) return []

      // 使用原生時間戳比較，避免 Day.js 日期級別比較的精度問題
      const viewportStartTime = viewport.value.start.getTime()
      const viewportEndTime = viewport.value.end.getTime()

      // 過濾出與可視窗口有時間交集的階段（使用標準區間重疊公式）
      // 保持父組件傳入的原始順序，不做排序
      const filtered = processedStages.value.filter(stage => {
        const stageStartTime = new Date(stage.startTime).getTime()
        const stageEndTime = new Date(stage.endTime).getTime()

        // 標準區間重疊：end >= start2 && start <= end2
        return stageEndTime >= viewportStartTime && stageStartTime <= viewportEndTime
      })

      return filtered
    }

    const determineVisibleStages = () => {
      if (!props.enableDrag) {
        return getFixedVisibleStages()
      } else {
        return getDynamicVisibleStages()
      }
    }

    // ==================== 配色 ====================

    const getStatusColor = (status) => {
      const color = getStageColor(status)
      return { fill: color, stroke: color }
    }

    // ==================== D3 渲染 ====================

    /**
     * 定義斜線 pattern 用於標示缺失時間的階段
     * 使用 patternDefined 標記避免重複創建
     */
    const defineDiagonalPattern = () => {
      if (!svg.value || patternDefined) return

      const defs = svg.value.append('defs')

      const pattern = defs.append('pattern')
        .attr('id', 'diagonal-stripe')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 8)
        .attr('height', 8)

      // 移除底色矩形，只保留斜線
      pattern.append('path')
        .attr('d', 'M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4')
        .attr('stroke', '#DDD')
        .attr('stroke-width', 1)

      patternDefined = true
    }

    /**
     * 定義彩色斜線 pattern 用於 extraTime 延長段
     * 為每個 status 創建對應顏色的斜線 pattern（純斜線，無底色）
     */
    const defineColoredDiagonalPatterns = () => {
      if (!svg.value) return  // 只檢查 svg 存在，不檢查 patternDefined

      const defs = svg.value.select('defs')
      const statuses = ['pending', 'active', 'voting', 'completed']

      statuses.forEach(status => {
        const color = getStatusColor(status)

        const pattern = defs.append('pattern')
          .attr('id', `diagonal-stripe-${status}`)
          .attr('patternUnits', 'userSpaceOnUse')
          .attr('width', 8)
          .attr('height', 8)

        // 移除底色矩形，只保留彩色斜線
        pattern.append('path')
          .attr('d', 'M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4')
          .attr('stroke', color.fill)
          .attr('stroke-width', 1.5)
      })
    }

    const renderChart = () => {
      if (!chartContainer.value) return
      if (!viewport.value.start || !viewport.value.end) return

      // 清空容器
      clearContainer(chartContainer.value)

      // 重置 pattern 定義標記
      patternDefined = false

      // 確定可見階段
      visibleStages.value = determineVisibleStages()

      if (visibleStages.value.length === 0) {
        return
      }

      // 設置尺寸
      const margin = { top: 40, right: 40, bottom: 50, left: 150 }
      const width = chartContainer.value.clientWidth - margin.left - margin.right
      const chartHeight = props.enableDrag
        ? Math.max(150, visibleStages.value.length * 50)
        : props.height - margin.top - margin.bottom

      // 創建 SVG，添加 clip-path 防止內容溢出覆蓋 Y 軸
      svg.value = d3.select(chartContainer.value)
        .append('svg')
        .attr('width', chartContainer.value.clientWidth)
        .attr('height', chartHeight + margin.top + margin.bottom)

      // 定義斜線 pattern
      defineDiagonalPattern()
      defineColoredDiagonalPatterns()

      // 定義裁剪路徑，防止 stage bar 溢出到 Y 軸左側
      svg.value.append('defs')
        .append('clipPath')
        .attr('id', 'chart-clip')
        .append('rect')
        .attr('x', 0)
        .attr('y', -margin.top)
        .attr('width', width)
        .attr('height', chartHeight + margin.top + margin.bottom)

      g.value = svg.value.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // X 軸比例尺（時間）
      xScale.value = d3.scaleTime()
        .domain([viewport.value.start, viewport.value.end])
        .range([0, width])

      // Y 軸比例尺（階段）
      yScale.value = d3.scaleBand()
        .domain(visibleStages.value.map((_, i) => i))
        .range([0, chartHeight])
        .padding(0.2)

      // 渲染 X 軸
      renderXAxis(width, chartHeight)

      // 渲染 Y 軸
      renderYAxis()

      // 渲染輔助線（現在紅線 + 里程碑灰線）
      renderReferenceLines(chartHeight)

      // 渲染圖例（右上角）
      renderLegend(width)

      // 渲染階段 bar
      renderStageBars()

      // 設置拖曳和縮放（如果啟用）
      if (props.enableDrag) {
        setupDragBehavior()
        setupWheelZoom()
      }
    }

    const renderXAxis = (width, height) => {
      // 固定使用 1 天間隔
      const xAxis = d3.axisBottom(xScale.value)
        .ticks(d3.timeDay.every(1))
        .tickFormat(d3.timeFormat('%m/%d'))

      g.value.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)

      // 添加 viewport 時間資訊
      const viewportDuration = viewport.value.end - viewport.value.start
      const daysInViewport = Math.round(viewportDuration / (24 * 60 * 60 * 1000))
      const centerDate = new Date((viewport.value.start.getTime() + viewport.value.end.getTime()) / 2)
      const centerDateStr = dayjs(centerDate).format('YYYY/MM/DD')

      g.value.append('text')
        .attr('class', 'viewport-info')
        .attr('x', width / 2)
        .attr('y', height + 40)
        .attr('text-anchor', 'middle')
        .attr('fill', '#333')
        .attr('font-size', '11px')
        .text(`檢視時間為 ${centerDateStr} ± ${Math.floor(daysInViewport / 2)} 天`)
    }

    const renderYAxis = () => {
      const yAxis = d3.axisLeft(yScale.value)
        .tickFormat((i) => {
          const stage = visibleStages.value[i]
          if (!stage) return '未命名階段'

          // 警告標籤前綴
          let prefix = ''
          if (stage.missingStart) prefix += '[開始] '
          if (stage.missingEnd) prefix += '[結束] '

          return prefix + (stage.stageName || '未命名階段')
        })

      g.value.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', (i) => {
          const stage = visibleStages.value[i]
          // 有缺失時間的階段，名稱用紅色顯示
          return (stage?.missingStart || stage?.missingEnd) ? '#d32f2f' : '#606266'
        })
    }

    const renderReferenceLines = (height) => {
      const nowTime = Date.now()
      const viewportStartTime = viewport.value.start.getTime()
      const viewportEndTime = viewport.value.end.getTime()

      // 1. 渲染「現在」紅色實線（使用時間戳比較）
      if (nowTime >= viewportStartTime && nowTime <= viewportEndTime) {
        const nowX = xScale.value(new Date(nowTime))

        // 紅色實線
        g.value.append('line')
          .attr('class', 'now-line')
          .attr('x1', nowX)
          .attr('x2', nowX)
          .attr('y1', 0)
          .attr('y2', height)
          .attr('stroke', '#e74c3c')
          .attr('stroke-width', 2)

        // 頂部文字標籤
        g.value.append('text')
          .attr('class', 'now-label')
          .attr('x', nowX)
          .attr('y', -10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#e74c3c')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .text('現在')
      }

      // 2. 渲染里程碑虛線（使用時間戳比較，根據 eventType 動態配色）
      if (props.milestones && props.milestones.length > 0) {
        props.milestones.forEach(milestone => {
          const milestoneTime = new Date(milestone.eventTick).getTime()

          if (milestoneTime >= viewportStartTime && milestoneTime <= viewportEndTime) {
            const milestoneX = xScale.value(new Date(milestoneTime))
            // 根據 eventType 獲取顏色
            const milestoneColor = getEventTypeColor(milestone.eventType || 'default')

            // 彩色虛線
            g.value.append('line')
              .attr('class', 'milestone-line')
              .attr('x1', milestoneX)
              .attr('x2', milestoneX)
              .attr('y1', 0)
              .attr('y2', height)
              .attr('stroke', milestoneColor)
              .attr('stroke-width', 1)
              .attr('stroke-dasharray', '2,2')

            // 頂部文字標籤（使用相同顏色）
            g.value.append('text')
              .attr('class', 'milestone-label')
              .attr('x', milestoneX)
              .attr('y', -10)
              .attr('text-anchor', 'middle')
              .attr('fill', milestoneColor)
              .attr('font-size', '11px')
              .attr('font-weight', '500')
              .text(milestone.eventName)
          }
        })
      }
    }

    /**
     * 渲染圖例（右上角）
     * 顯示所有 milestone eventType 的顏色對應
     */
    const renderLegend = (width) => {
      if (!props.milestones || props.milestones.length === 0) return

      // 提取所有唯一的 eventType
      const eventTypes = new Set()
      props.milestones.forEach(m => {
        if (m.eventType) eventTypes.add(m.eventType)
      })

      if (eventTypes.size === 0) return

      // eventType 中文映射
      const eventTypeLabels = {
        'stage-timing': '階段時間點',
        'submission': '提交成果',
        'comment': '評論'
      }

      // 圖例容器位置（右上角）
      const legendX = width - 20
      const legendY = 10
      const lineHeight = 20

      const legendGroup = g.value.append('g')
        .attr('class', 'milestone-legend')
        .attr('transform', `translate(${legendX}, ${legendY})`)

      // 為每個 eventType 渲染圖例項目
      Array.from(eventTypes).forEach((eventType, index) => {
        const itemGroup = legendGroup.append('g')
          .attr('transform', `translate(0, ${index * lineHeight})`)

        const color = getEventTypeColor(eventType)
        const label = eventTypeLabels[eventType] || eventType

        // 色塊（小矩形）
        itemGroup.append('rect')
          .attr('x', -80)
          .attr('y', -8)
          .attr('width', 12)
          .attr('height', 12)
          .attr('fill', color)
          .attr('stroke', color)
          .attr('stroke-width', 1)

        // 文字標籤
        itemGroup.append('text')
          .attr('x', -65)
          .attr('y', 2)
          .attr('font-size', '11px')
          .attr('fill', '#333')
          .text(label)
      })
    }

    const renderStageBars = () => {
      // 1. 準備所有需要渲染的 bar 數據（實心段 + 延長段）
      const barsData = []

      visibleStages.value.forEach((stage, index) => {
        const startDate = new Date(stage.startTime)
        const endDate = new Date(stage.endTime)
        const color = getStatusColor(stage.status)

        // 實心段（原有時間範圍）
        barsData.push({
          type: 'solid',
          stage: stage,
          index: index,
          startDate: startDate,
          endDate: endDate,
          label: stage.stageName || '未命名階段',
          color: color,
          hasMissingTime: stage.missingStart || stage.missingEnd
        })

        // 延長段（如果有 extraTime）
        if (stage.extraTime !== undefined) {
          let extraEndDate
          if (stage.extraTime === Infinity) {
            extraEndDate = viewport.value.end
          } else {
            extraEndDate = new Date(stage.extraTime)
          }

          barsData.push({
            type: 'extra',
            stage: stage,
            index: index,
            startDate: endDate,  // 延長段從原 endTime 開始
            endDate: extraEndDate,
            label: stage.extraTimeText || '',
            color: color,
            isInfinite: stage.extraTime === Infinity
          })
        }
      })

      // 2. 渲染所有 bar rectangles
      renderBarRectangles(barsData)

      // 3. 渲染所有 bar labels
      renderBarLabels(barsData)
    }

    const renderBarRectangles = (barsData) => {
      g.value.selectAll('.stage-bar, .stage-bar-extra')
        .data(barsData)
        .enter()
        .append('rect')
        .attr('class', d => d.type === 'solid' ? 'stage-bar' : 'stage-bar-extra')
        .attr('clip-path', 'url(#chart-clip)')
        .attr('x', d => xScale.value(d.startDate))
        .attr('y', d => yScale.value(d.index))
        .attr('width', d => Math.max(0, xScale.value(d.endDate) - xScale.value(d.startDate)))
        .attr('height', yScale.value.bandwidth())
        .attr('fill', d => {
          if (d.type === 'extra') {
            // 延長段：使用彩色斜線 pattern
            return `url(#diagonal-stripe-${d.stage.status})`
          } else if (d.hasMissingTime) {
            // 缺失時間：使用灰色斜線
            return 'url(#diagonal-stripe)'
          } else {
            // 正常實心段
            return d.color.fill
          }
        })
        .attr('stroke', d => {
          if (d.hasMissingTime && d.type === 'solid') {
            return '#AAA'
          }
          return d.color.stroke
        })
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', d => {
          if (d.hasMissingTime && d.type === 'solid') {
            return '4,4'
          }
          return 'none'
        })
        .style('filter', d => {
          if (d.stage.status === 'active' || d.stage.status === 'voting') {
            return 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
          }
          return 'none'
        })
        .style('opacity', d => {
          if (d.type === 'extra' || d.hasMissingTime) {
            return 0.4
          }
          return 1
        })
        .style('cursor', props.enableDrag ? null : 'pointer')
        .on('mouseenter', (event, d) => showTooltip(event, d.stage, d.type))
        .on('mouseleave', () => hideTooltip())
        .on('click', (event, d) => {
          if (!props.enableDrag) {
            emit('stage-click', d.stage)
          }
        })
    }

    const renderBarLabels = (barsData) => {
      // 過濾掉沒有 label 的 bar（extraTimeText 為空字串時）
      const labelsData = barsData.filter(d => d.label && d.label.trim() !== '')

      g.value.selectAll('.stage-label, .stage-label-extra')
        .data(labelsData)
        .enter()
        .append('text')
        .attr('class', d => d.type === 'solid' ? 'stage-label' : 'stage-label-extra')
        .attr('x', d => {
          const barStartX = xScale.value(d.startDate)
          const barEndX = xScale.value(d.endDate)
          const barWidth = Math.max(0, barEndX - barStartX)
          const viewportWidth = xScale.value.range()[1] - xScale.value.range()[0]

          // 檢查 bar 是否溢出左邊或右邊
          const overflowsLeft = barStartX < 0
          const overflowsRight = barEndX > viewportWidth

          if (overflowsLeft && !overflowsRight) {
            // 溢出左邊，文字靠右（距離右邊緣 10px）
            return Math.min(barEndX - 10, viewportWidth - 10)
          } else if (overflowsRight && !overflowsLeft) {
            // 溢出右邊，文字靠左（距離左邊緣 10px）
            return Math.max(barStartX + 10, 10)
          } else if (overflowsLeft && overflowsRight) {
            // 兩邊都溢出，文字居中
            return viewportWidth / 2
          } else {
            // 完全在 viewport 內，文字居中於 bar
            return barStartX + barWidth / 2
          }
        })
        .attr('y', d => yScale.value(d.index) + yScale.value.bandwidth() / 2)
        .attr('text-anchor', d => {
          const barStartX = xScale.value(d.startDate)
          const barEndX = xScale.value(d.endDate)
          const viewportWidth = xScale.value.range()[1] - xScale.value.range()[0]

          const overflowsLeft = barStartX < 0
          const overflowsRight = barEndX > viewportWidth

          if (overflowsLeft && !overflowsRight) {
            return 'end' // 溢出左邊，文字右對齊
          } else if (overflowsRight && !overflowsLeft) {
            return 'start' // 溢出右邊，文字左對齊
          } else {
            return 'middle' // 其他情況，文字居中
          }
        })
        .attr('dominant-baseline', 'middle')
        .attr('fill', d => d.type === 'extra' ? '#333' : 'white')
        .attr('font-size', '13px')
        .attr('font-weight', '500')
        .style('pointer-events', 'none')
        .text(d => d.label)
    }

    // ==================== Tooltip ====================

    const showTooltip = (event, stage, barType = 'solid') => {
      // 拖曳模式下不顯示 tooltip
      if (props.enableDrag) return

      if (!tooltip.value) {
        tooltip.value = createTooltip()
      }

      const startDate = dayjs(stage.startTime).format('YYYY-MM-DD HH:mm:ss')
      const endDate = dayjs(stage.endTime).format('YYYY-MM-DD HH:mm:ss')

      const statusText = {
        pending: '尚未開始',
        active: '進行中',
        voting: '投票中',
        completed: '已完成'
      }[stage.status] || stage.status

      // 構建警告訊息（缺失時間）
      let warningHtml = ''
      if (stage.missingStart || stage.missingEnd) {
        const warnings = []
        if (stage.missingStart) warnings.push('開始時間已自動填充')
        if (stage.missingEnd) warnings.push('結束時間已自動填充')

        warningHtml = `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffebee; font-size: 11px; color: #d32f2f;">
            <div style="font-weight: 500; margin-bottom: 2px;"><i class="fas fa-exclamation-triangle"></i> 警告</div>
            ${warnings.map(w => `<div>• ${w}</div>`).join('')}
          </div>
        `
      }

      // 構建 extraTime 訊息
      let extraTimeHtml = ''
      if (stage.extraTime !== undefined) {
        let extraEndStr
        if (stage.extraTime === Infinity) {
          extraEndStr = '手動關閉'
        } else {
          extraEndStr = dayjs(stage.extraTime).format('YYYY-MM-DD HH:mm:ss')
        }

        const extraLabel = stage.extraTimeText || '延長階段'

        extraTimeHtml = `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e1e8ed;">
            <div style="font-weight: 500; margin-bottom: 2px; color: #409eff;">${extraLabel}</div>
            <div style="font-size: 12px; color: #666;">延長至：${extraEndStr}</div>
          </div>
        `
      }

      tooltip.value
        .style('opacity', 1)
        .html(`
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${stage.stageName}</div>
            <div style="font-size: 12px; color: #666;">
              <div>開始：${startDate}${stage.missingStart ? ' <span style="color: #d32f2f;">*</span>' : ''}</div>
              <div>結束：${endDate}${stage.missingEnd ? ' <span style="color: #d32f2f;">*</span>' : ''}</div>
              <div>狀態：<span style="color: ${getStatusColor(stage.status).fill}; font-weight: 500;">${statusText}</span></div>
            </div>
            ${extraTimeHtml}
            ${warningHtml}
          </div>
        `)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 10}px`)
    }

    const hideTooltip = () => {
      if (tooltip.value) {
        tooltip.value.style('opacity', 0)
      }
    }

    // ==================== Viewport 變化事件 ====================

    /**
     * 發射 viewport 變化事件給父組件
     * 包含當前視窗範圍和完整時間範圍資訊
     */
    const emitViewportChange = () => {
      emit('viewport-change', {
        viewport: {
          start: viewport.value.start,
          end: viewport.value.end
        },
        fullTimeRange: {
          start: fullTimeRange.value.start,
          end: fullTimeRange.value.end
        },
        xScale: {
          domain: [viewport.value.start, viewport.value.end]
        }
      })
    }

    // ==================== 拖曳交互 ====================

    const setupDragBehavior = () => {
      if (!svg.value) return

      const drag = d3.drag()
        .touchable(true)  // 明確啟用觸屏支援
        .on('start', onDragStart)
        .on('drag', onDrag)
        .on('end', onDragEnd)

      svg.value.call(drag)
    }

    const onDragStart = (event) => {
      isDragging.value = true
      dragStartX.value = event.x
      dragStartViewport.value = {
        start: dayjs(viewport.value.start).toDate(),
        end: dayjs(viewport.value.end).toDate()
      }

      velocity.value = 0
      lastDragTime.value = Date.now()
      lastDragX.value = event.x

      // 添加 dragging class
      if (chartContainer.value) {
        chartContainer.value.classList.add('dragging')
      }

      // 停止之前的慣性動畫
      if (momentumAnimationId.value) {
        cancelAnimationFrame(momentumAnimationId.value)
      }
    }

    const onDrag = (event) => {
      const deltaX = event.x - dragStartX.value
      const now = Date.now()
      const deltaTime = now - lastDragTime.value

      // 計算速度（像素/毫秒）- 針對觸摸設備優化
      if (deltaTime > 0) {
        const currentVelocity = (event.x - lastDragX.value) / deltaTime
        // 對於觸摸設備（時間間隔較大時），使用加權平均平滑速度
        if (deltaTime > 50) {
          velocity.value = velocity.value * 0.3 + currentVelocity * 0.7
        } else {
          velocity.value = currentVelocity
        }
      }

      lastDragTime.value = now
      lastDragX.value = event.x

      // 計算時間偏移（毫秒）- 使用實際 xScale 範圍和靈敏度系數
      const xScaleRange = xScale.value ? xScale.value.range() : [0, chartContainer.value.clientWidth - 190]
      const containerWidth = xScaleRange[1] - xScaleRange[0]
      const viewportDuration = dayjs(dragStartViewport.value.end).diff(dayjs(dragStartViewport.value.start))
      const sensitivityFactor = 1.5 // 提高靈敏度 50%
      const timeOffset = -(deltaX / containerWidth) * viewportDuration * sensitivityFactor

      let newStart = dayjs(dragStartViewport.value.start).add(timeOffset, 'millisecond')
      let newEnd = dayjs(dragStartViewport.value.end).add(timeOffset, 'millisecond')

      // 彈性邊界檢查（使用時間戳比較）
      const fullStartTime = fullTimeRange.value.start.getTime()
      const fullEndTime = fullTimeRange.value.end.getTime()

      // 實現彈性邊界行為
      if (newStart.valueOf() < fullStartTime) {
        const overshoot = fullStartTime - newStart.valueOf()
        newStart = dayjs(fullStartTime)
        newEnd = dayjs(newStart.valueOf() + viewportDuration)
        velocity.value *= 0.5 // 邊界阻尼
      } else if (newEnd.valueOf() > fullEndTime) {
        const overshoot = newEnd.valueOf() - fullEndTime
        newEnd = dayjs(fullEndTime)
        newStart = dayjs(newEnd.valueOf() - viewportDuration)
        velocity.value *= 0.5 // 邊界阻尼
      }

      // 立即更新視口狀態
      viewport.value.start = newStart.toDate()
      viewport.value.end = newEnd.toDate()

      // 節流渲染：限制 60fps
      if (now - lastRenderTime.value > RENDER_INTERVAL) {
        renderChart()
        emitViewportChange()
        lastRenderTime.value = now
      }
    }

    const onDragEnd = () => {
      isDragging.value = false

      // 移除 dragging class
      if (chartContainer.value) {
        chartContainer.value.classList.remove('dragging')
      }

      // 確保最終狀態被渲染（如果最後一次 drag 被節流跳過）
      renderChart()
      emitViewportChange()

      // 速度足夠大時啟動慣性滾動
      if (Math.abs(velocity.value) > 0.1) {
        startMomentumScroll()
      }
    }

    const startMomentumScroll = () => {
      const friction = 0.95
      const minVelocity = 0.01

      const animate = () => {
        velocity.value *= friction

        if (Math.abs(velocity.value) < minVelocity) {
          momentumAnimationId.value = null
          // 確保最終狀態被渲染
          renderChart()
          emitViewportChange()
          return
        }

        // 使用與 onDrag 相同的計算方式（包含靈敏度系數）
        const xScaleRange = xScale.value ? xScale.value.range() : [0, chartContainer.value.clientWidth - 190]
        const containerWidth = xScaleRange[1] - xScaleRange[0]
        const viewportDuration = dayjs(viewport.value.end).diff(dayjs(viewport.value.start))
        const sensitivityFactor = 1.5
        const pixelOffset = velocity.value * 16 // 60fps, 每幀 16ms
        const timeOffset = -(pixelOffset / containerWidth) * viewportDuration * sensitivityFactor

        let newStart = dayjs(viewport.value.start).add(timeOffset, 'millisecond')
        let newEnd = dayjs(viewport.value.end).add(timeOffset, 'millisecond')

        const fullStartTime = fullTimeRange.value.start.getTime()
        const fullEndTime = fullTimeRange.value.end.getTime()

        // 彈性邊界處理（與 onDrag 一致）
        if (newStart.valueOf() < fullStartTime) {
          newStart = dayjs(fullStartTime)
          newEnd = dayjs(newStart.valueOf() + viewportDuration)
          velocity.value *= 0.3 // 更強的邊界阻尼（慣性滾動）
        } else if (newEnd.valueOf() > fullEndTime) {
          newEnd = dayjs(fullEndTime)
          newStart = dayjs(newEnd.valueOf() - viewportDuration)
          velocity.value *= 0.3
        }

        viewport.value.start = newStart.toDate()
        viewport.value.end = newEnd.toDate()

        // 慣性滾動也應用渲染節流
        const now = Date.now()
        if (now - lastRenderTime.value > RENDER_INTERVAL) {
          renderChart()
          emitViewportChange()
          lastRenderTime.value = now
        }

        momentumAnimationId.value = requestAnimationFrame(animate)
      }

      momentumAnimationId.value = requestAnimationFrame(animate)
    }

    // ==================== 滾輪縮放 ====================

    const setupWheelZoom = () => {
      if (!chartContainer.value) return

      const handleWheel = (event) => {
        event.preventDefault()

        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9
        let newViewportDays = viewportDays.value * zoomFactor

        // 限制範圍
        newViewportDays = Math.max(7, Math.min(180, newViewportDays))

        if (newViewportDays !== viewportDays.value) {
          viewportDays.value = newViewportDays

          // 以當前視窗中心為縮放中心（使用 Day.js 簡化計算）
          const viewportStart = dayjs(viewport.value.start)
          const viewportEnd = dayjs(viewport.value.end)
          const viewportDuration = viewportEnd.diff(viewportStart)
          const viewportCenter = viewportStart.add(viewportDuration / 2, 'millisecond')
          const halfRangeDays = newViewportDays / 2

          viewport.value.start = viewportCenter.subtract(halfRangeDays, 'day').toDate()
          viewport.value.end = viewportCenter.add(halfRangeDays, 'day').toDate()

          renderChart()
          emitViewportChange()
        }
      }

      chartContainer.value.addEventListener('wheel', handleWheel, { passive: false })
    }

    // ==================== Minimap 拖曳 ====================

    const setupMinimapDrag = () => {
      if (!minimapBar.value) return

      let isDraggingMinimap = false
      let startX = 0

      const onMinimapMouseDown = (event) => {
        isDraggingMinimap = true
        startX = event.clientX

        // 添加全局 mousemove 和 mouseup 監聽
        document.addEventListener('mousemove', onMinimapMouseMove)
        document.addEventListener('mouseup', onMinimapMouseUp)

        // 改變 cursor
        minimapBar.value.style.cursor = 'grabbing'
        event.preventDefault()
      }

      const onMinimapMouseMove = (event) => {
        if (!isDraggingMinimap) return

        const deltaX = event.clientX - startX
        startX = event.clientX

        // 計算 minimap 寬度和時間範圍
        const minimapWidth = minimapBar.value.clientWidth
        const fullDuration = dayjs(fullTimeRange.value.end).diff(dayjs(fullTimeRange.value.start))

        // 將像素偏移轉換為時間偏移
        const timeOffset = (deltaX / minimapWidth) * fullDuration

        // 更新視窗位置
        const newStart = dayjs(viewport.value.start).add(timeOffset, 'millisecond')
        const newEnd = dayjs(viewport.value.end).add(timeOffset, 'millisecond')

        // 邊界檢查
        const fullStartTime = fullTimeRange.value.start.getTime()
        const fullEndTime = fullTimeRange.value.end.getTime()

        if (newStart.valueOf() >= fullStartTime && newEnd.valueOf() <= fullEndTime) {
          viewport.value.start = newStart.toDate()
          viewport.value.end = newEnd.toDate()
          renderChart()
          emitViewportChange()
        }
      }

      const onMinimapMouseUp = () => {
        isDraggingMinimap = false
        minimapBar.value.style.cursor = 'grab'

        // 移除全局監聽
        document.removeEventListener('mousemove', onMinimapMouseMove)
        document.removeEventListener('mouseup', onMinimapMouseUp)
      }

      // 綁定 mousedown 事件
      minimapBar.value.addEventListener('mousedown', onMinimapMouseDown)
    }

    // ==================== Lifecycle ====================

    onMounted(() => {
      initializeTimeline()
      renderChart()

      // 設置 minimap 拖曳（如果啟用）
      if (props.enableDrag && props.showMinimap) {
        setupMinimapDrag()
      }
    })

    onBeforeUnmount(() => {
      // 清理慣性動畫
      if (momentumAnimationId.value) {
        cancelAnimationFrame(momentumAnimationId.value)
      }

      // 清理 tooltip
      if (tooltip.value) {
        tooltip.value.remove()
      }
    })

    // Watch props 變化
    watch(() => props.stages, () => {
      initializeTimeline()
      renderChart()
    }, { deep: true })

    // Watch centerTime 變化
    watch(() => props.centerTime, (newVal) => {
      if (newVal !== undefined) {
        centerViewportOnDefaultPosition()
        renderChart()
      }
    })

    return {
      chartContainer,
      minimapStyle,
      minimapBar
    }
  }
}
</script>

<style scoped>
.stage-gantt-chart {
  width: 100%;
}

/* 空狀態 */
.gantt-empty-state {
  padding: 40px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
}

/* Mini-map (3px 高度) */
.gantt-minimap {
  padding: 8px 10px;
  background: #f8f9fa;
  border-radius: 6px 6px 0 0;
  border: 1px solid #e1e8ed;
  border-bottom: none;
}

.minimap-bar {
  position: relative;
  width: 100%;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  cursor: grab;
  padding: 3px 0;
}

.minimap-bar:active {
  cursor: grabbing;
}

.minimap-track {
  width: 100%;
  height: 100%;
  background: #dcdfe6;
}

.minimap-viewport {
  position: absolute;
  top: 0;
  height: 100%;
  background: #409eff;
  transition: all 0.3s ease;
}

/* 主圖表區域 */
.gantt-main {
  width: 100%;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 0 0 6px 6px;
  overflow: hidden;
  min-height: 150px;
}

/* 觸屏支援 - 防止默認觸屏行為干擾拖曳 */
.gantt-main :deep(svg) {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.gantt-minimap + .gantt-main {
  border-radius: 0;
}

/* 操作提示 */
.gantt-hint {
  padding: 8px;
  text-align: center;
  color: #333;
  font-size: 12px;
  background: #f0f2f5;
  border: 1px solid #e1e8ed;
  border-top: none;
  border-radius: 0 0 6px 6px;
  margin-top: -1px;
}

/* D3 元素樣式 */
.gantt-main :deep(.x-axis) text,
.gantt-main :deep(.y-axis) text {
  font-size: 12px;
  fill: #606266;
}

.gantt-main :deep(.x-axis) line,
.gantt-main :deep(.y-axis) line,
.gantt-main :deep(.x-axis) path,
.gantt-main :deep(.y-axis) path {
  stroke: #dcdfe6;
}

.gantt-main :deep(.now-line),
.gantt-main :deep(.milestone-line) {
  pointer-events: none;
}

.gantt-main :deep(.stage-bar) {
  transition: opacity 0.2s;
}

.gantt-main :deep(.stage-bar:hover) {
  opacity: 0.8;
}

/* 拖曳模式下的 cursor 樣式 */
.gantt-main.drag-mode :deep(.stage-bar) {
  cursor: grab;
}

.gantt-main.drag-mode.dragging :deep(.stage-bar) {
  cursor: grabbing;
}

.gantt-main.drag-mode :deep(svg) {
  cursor: grab;
}

.gantt-main.drag-mode.dragging :deep(svg) {
  cursor: grabbing;
}
</style>
