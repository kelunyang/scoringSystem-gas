/**
 * @fileoverview D3 圖表渲染與管理 Composable
 *
 * 提供：
 * 1. Tooltip 創建與清理（防止內存洩漏）
 * 2. 防抖渲染（提升性能）
 * 3. 生命週期管理
 */

import { ref, onBeforeUnmount } from 'vue'
import * as d3 from 'd3'

/**
 * D3 Chart options
 */
interface D3ChartOptions {
  debounceDelay?: number
}

/**
 * D3 圖表管理 Composable
 * @param {D3ChartOptions} options - 配置選項
 * @param {Number} options.debounceDelay - 防抖延遲（毫秒）
 * @returns {Object} D3 圖表管理方法
 */
export function useD3Chart(options: D3ChartOptions = {}) {
  const { debounceDelay = 150 } = options

  // 防抖計時器
  const chartRenderDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  // 當前活躍的 tooltip 引用
  const currentTooltip = ref<d3.Selection<HTMLDivElement, unknown, HTMLElement, any> | null>(null)

  /**
   * 創建 D3 Tooltip
   * @returns {Object} D3 selection (tooltip)
   */
  function createTooltip() {
    // 先清除現有的 tooltip
    d3.select('.chart-tooltip').remove()

    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '10000')

    currentTooltip.value = tooltip

    return tooltip
  }

  /**
   * 清理所有 D3 Tooltips
   * 防止組件銷毀時殘留在 DOM 中導致內存洩漏
   */
  function cleanupTooltips() {
    // 清理追蹤的 tooltip
    if (currentTooltip.value) {
      currentTooltip.value.remove()
      currentTooltip.value = null
    }

    // 清理所有可能殘留的 tooltips
    d3.selectAll('.chart-tooltip').remove()
    d3.selectAll('.vote-tooltip').remove()
  }

  /**
   * 防抖渲染函數
   * @param {Function} renderFn - 渲染函數
   * @param {Number} delay - 延遲時間（毫秒），默認使用配置的 debounceDelay
   */
  function debouncedRender(renderFn: any, delay = debounceDelay) {
    // 清除之前的計時器
    if (chartRenderDebounceTimer.value) {
      clearTimeout(chartRenderDebounceTimer.value)
    }

    // 設置新的計時器
    chartRenderDebounceTimer.value = setTimeout(() => {
      if (typeof renderFn === 'function') {
        renderFn()
      }
      chartRenderDebounceTimer.value = null
    }, delay)
  }

  /**
   * 清除防抖計時器
   */
  function clearDebounceTimer() {
    if (chartRenderDebounceTimer.value) {
      clearTimeout(chartRenderDebounceTimer.value)
      chartRenderDebounceTimer.value = null
    }
  }

  /**
   * 清空容器內容
   * @param {HTMLElement|Ref} container - 容器元素或 ref
   */
  function clearContainer(container: any) {
    const element = container?.value || container
    if (element) {
      element.innerHTML = ''
    }
  }

  /**
   * 創建 SVG 元素
   * @param {HTMLElement} container - 容器元素
   * @param {Number} width - 寬度
   * @param {Number} height - 高度
   * @returns {Object} D3 SVG selection
   */
  function createSvg(container: any, width: any, height: any) {
    return d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
  }

  /**
   * 取得容器尺寸
   * @param {HTMLElement|Ref} container - 容器元素或 ref
   * @param {Number} defaultWidth - 預設寬度
   * @param {Number} defaultHeight - 預設高度
   * @returns {Object} { width, height }
   */
  function getContainerSize(container: any, defaultWidth = 600, defaultHeight = 300) {
    const element = container?.value || container
    if (!element) {
      return { width: defaultWidth, height: defaultHeight }
    }

    return {
      width: element.offsetWidth || defaultWidth,
      height: element.offsetHeight || defaultHeight
    }
  }

  /**
   * 在組件銷毀前清理資源
   */
  onBeforeUnmount(() => {
    cleanupTooltips()
    clearDebounceTimer()
  })

  return {
    // Tooltip 管理
    createTooltip,
    cleanupTooltips,
    currentTooltip,

    // 防抖渲染
    debouncedRender,
    clearDebounceTimer,
    chartRenderDebounceTimer,

    // 容器管理
    clearContainer,
    createSvg,
    getContainerSize
  }
}
