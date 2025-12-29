/**
 * @fileoverview 充能動畫 Composable (CSS 版)
 *
 * 使用 requestAnimationFrame + CSS 動畫實現充能效果
 * 支援左到右順序填充、視口觸發、CSS 彈跳等功能
 *
 * 使用範例:
 * ```typescript
 * const charging = useChargingAnimation()
 *
 * // 在 D3 渲染完成後配置
 * charging.configure(chargingUnits, startY, blockHeight, svgElement, startX, blockSize)
 * charging.setupViewportTrigger(chartContainer)
 * ```
 */

import { ref, onBeforeUnmount, type Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

/** 充能單位配置 */
export interface ChargingUnit {
  /** 唯一識別符 */
  id: string
  /** 該單位包含的 DOM 元素 (充能層) */
  elements: SVGRectElement[]
  /** 該單位的右邊界 X 座標 */
  endX: number
}

/** 充能動畫選項 */
export interface ChargingAnimationOptions {
  /** 總動畫時間，毫秒 (預設 1500) */
  duration?: number
  /** 充能完成時的 transition 時間，毫秒 (預設 150) */
  transitionDuration?: number
  /** 視口觸發閾值 (預設 0.3) */
  viewportThreshold?: number
  /** 是否啟用彈跳效果 (預設 true) */
  enableBounce?: boolean
  /** 是否顯示可見的充能方塊 (預設 true) */
  showChargingBlock?: boolean
  /** 充能方塊顏色 (預設 '#FFD700' 金色) */
  chargingBlockColor?: string
}

/**
 * 充能動畫 Composable (CSS 版)
 *
 * @param options - 動畫配置選項
 * @returns 動畫控制方法和狀態
 */
export function useChargingAnimation(options: ChargingAnimationOptions = {}) {
  const {
    duration = 1500,
    transitionDuration = 150,
    viewportThreshold = 0.3,
    enableBounce = true,
    showChargingBlock = true,
    chargingBlockColor = '#FFD700'
  } = options

  // 狀態
  const animationPhase = ref<'idle' | 'charging' | 'completed'>('idle')
  const animationTriggered = ref(false)

  // 內部變數
  let animationFrameId: number | null = null
  let units: ChargingUnit[] = []
  let chargedUnits = new Set<string>()
  let intersectionStop: (() => void) | null = null

  // 配置變數
  let configuredStartY = 0
  let configuredBlockHeight = 40
  let configuredBlockSize = 0
  let configuredStartX = 0
  let totalWidth = 0
  let startTime: number | null = null

  // 可見充能方塊
  let chargingBlockElement: SVGRectElement | null = null
  let svgContainer: SVGSVGElement | null = null

  /**
   * 設置視口觸發
   * 當容器進入視口時自動啟動動畫
   *
   * @param container - 要監聽的容器元素 ref
   */
  function setupViewportTrigger(container: Ref<HTMLElement | null>) {
    const { stop } = useIntersectionObserver(
      container,
      ([{ isIntersecting }]) => {
        if (isIntersecting && !animationTriggered.value && units.length > 0) {
          animationTriggered.value = true
          start()
        }
      },
      { threshold: viewportThreshold }
    )
    intersectionStop = stop
  }

  /**
   * 配置充能單位
   * 設置要動畫的單位及其對應的 DOM 元素
   *
   * @param chargingUnits - 充能單位配置陣列
   * @param startY - 充能方塊的 Y 座標
   * @param blockHeight - 權重塊高度
   * @param svg - SVG 容器元素（用於創建充能方塊）
   * @param startX - 起始 X 座標
   * @param blockSize - 方塊寬度
   */
  function configure(
    chargingUnits: ChargingUnit[],
    startY: number,
    blockHeight: number,
    svg?: SVGSVGElement,
    startX?: number,
    blockSize?: number
  ) {
    units = chargingUnits
    chargedUnits.clear()
    configuredStartY = startY
    configuredBlockHeight = blockHeight
    configuredStartX = startX ?? 0
    configuredBlockSize = blockSize ?? 12
    startTime = null

    // 儲存 SVG 容器
    if (svg) {
      svgContainer = svg
    }

    // 計算總寬度
    if (units.length > 0) {
      const lastEndX = units[units.length - 1].endX
      totalWidth = lastEndX - configuredStartX
    }
  }

  /**
   * 創建可見的充能方塊
   */
  function createChargingBlock() {
    if (!showChargingBlock || !svgContainer) return

    chargingBlockElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    chargingBlockElement.setAttribute('class', 'charging-block')
    chargingBlockElement.setAttribute('x', String(configuredStartX - configuredBlockSize))
    chargingBlockElement.setAttribute('y', String(configuredStartY - configuredBlockHeight / 2))
    chargingBlockElement.setAttribute('width', String(configuredBlockSize - 1))
    chargingBlockElement.setAttribute('height', String(configuredBlockHeight))
    chargingBlockElement.setAttribute('fill', chargingBlockColor)
    chargingBlockElement.setAttribute('rx', '2')
    chargingBlockElement.style.opacity = '1'
    chargingBlockElement.style.filter = 'drop-shadow(0 0 6px rgba(255, 215, 0, 0.8))'
    svgContainer.appendChild(chargingBlockElement)
  }

  /**
   * 移除充能方塊
   */
  function removeChargingBlock() {
    if (chargingBlockElement) {
      chargingBlockElement.remove()
      chargingBlockElement = null
    }
  }

  /**
   * 啟動充能動畫
   */
  function start() {
    if (units.length === 0) return
    animationPhase.value = 'charging'
    startTime = null

    // 創建可見的充能方塊
    createChargingBlock()

    // 開始動畫循環
    animationFrameId = requestAnimationFrame(animationLoop)
  }

  /**
   * 動畫循環
   * 使用時間進度計算位置，點亮經過的方塊
   */
  function animationLoop(timestamp: number) {
    if (animationPhase.value !== 'charging') return

    // 初始化開始時間
    if (!startTime) startTime = timestamp

    // 計算進度 (0 到 1)
    const elapsed = timestamp - startTime
    const progress = Math.min(elapsed / duration, 1)

    // 線性計算當前 X 位置
    const currentX = configuredStartX + progress * totalWidth

    // 更新充能方塊位置
    if (chargingBlockElement) {
      chargingBlockElement.setAttribute('x', String(currentX - configuredBlockSize / 2))
    }

    // 點亮經過的方塊
    units.forEach(unit => {
      if (chargedUnits.has(unit.id)) return

      // 當充能方塊經過這個單位時，點亮它
      if (currentX >= unit.endX - configuredBlockSize) {
        chargedUnits.add(unit.id)
        unit.elements.forEach(el => {
          el.style.transition = `opacity ${transitionDuration}ms ease-out`
          el.style.opacity = '1'

          // CSS 彈跳動畫
          if (enableBounce) {
            el.style.animation = 'charging-bounce 0.3s ease-out'
          }
        })
      }
    })

    // 檢查是否完成
    if (progress >= 1) {
      complete()
      return
    }

    // 繼續下一幀
    animationFrameId = requestAnimationFrame(animationLoop)
  }

  /**
   * 動畫完成
   */
  function complete() {
    removeChargingBlock()
    animationPhase.value = 'completed'
    stopAnimationLoop()
  }

  /**
   * 停止動畫循環
   */
  function stopAnimationLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  /**
   * 重置動畫狀態
   * 用於數據變更後重新開始
   */
  function reset() {
    stopAnimationLoop()
    removeChargingBlock()
    animationPhase.value = 'idle'
    animationTriggered.value = false
    chargedUnits.clear()
    units = []
    svgContainer = null
    startTime = null
  }

  /**
   * 清理所有資源
   */
  function cleanup() {
    stopAnimationLoop()
    removeChargingBlock()
    intersectionStop?.()
    svgContainer = null
  }

  /**
   * 立即完成動畫（跳過動畫直接顯示最終狀態）
   */
  function skipToEnd() {
    stopAnimationLoop()
    removeChargingBlock()
    // 點亮所有單位
    units.forEach(unit => {
      chargedUnits.add(unit.id)
      unit.elements.forEach(el => {
        el.style.opacity = '1'
      })
    })
    animationPhase.value = 'completed'
  }

  // 組件卸載時自動清理
  onBeforeUnmount(cleanup)

  return {
    // 狀態（響應式）
    animationPhase,
    animationTriggered,

    // 配置
    setupViewportTrigger,
    configure,

    // 控制
    start,
    reset,
    cleanup,
    skipToEnd
  }
}
