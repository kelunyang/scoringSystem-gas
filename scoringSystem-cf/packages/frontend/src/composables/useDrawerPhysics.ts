/**
 * @fileoverview Drawer Physics Composable
 *
 * 提供基於彈簧物理的抽屜動畫控制，支援：
 * - 彈簧回彈效果（spring bounce）
 * - 手勢拖曳（gesture drag）
 * - 重力下墜感（gravity drop）
 *
 * 使用自定義彈簧物理引擎 + @vueuse/gesture 的 useDrag
 */

import { ref, computed, onBeforeUnmount, type Ref, type ComputedRef } from 'vue'
import { useDrag } from '@vueuse/gesture'

/** 抽屜物理配置選項 */
export interface DrawerPhysicsOptions {
  /** 抽屜最大高度（像素） */
  maxHeight: number
  /** 彈簧剛度（預設 120，越高越快） */
  stiffness?: number
  /** 阻尼係數（預設 14，越低越彈） */
  damping?: number
  /** 彈跳係數 0-1（預設 0.25，越高越彈） */
  bounce?: number
  /** 啟用重力下墜效果（預設 true） */
  enableGravity?: boolean
  /** 拖曳阻力係數 0-1（預設 0.3，越高越難拖） */
  dragResistance?: number
  /** Fling 速度閾值（像素/秒，預設 300） */
  velocityThreshold?: number
  /** 抽屜方向：'up' 向上展開，'down' 向下展開（預設 'up'） */
  direction?: 'up' | 'down'
}

/** useDrawerPhysics 回傳的介面 */
export interface DrawerPhysicsReturn {
  /** 抽屜是否開啟 */
  isOpen: Ref<boolean>
  /** 是否正在拖曳 */
  isDragging: Ref<boolean>
  /** 當前高度值（響應式） */
  currentHeight: ComputedRef<number>
  /** 抽屜樣式物件（用於 :style 綁定） */
  drawerStyle: ComputedRef<Record<string, string>>
  /** 打開抽屜 */
  open: () => void
  /** 關閉抽屜 */
  close: () => void
  /** 切換抽屜狀態 */
  toggle: () => void
  /** 設置拖曳處理器 */
  setupDragHandler: (handleEl: Ref<HTMLElement | null>) => void
  /** 停止當前動畫 */
  stop: () => void
}

/**
 * 彈簧物理模擬器
 * 使用阻尼諧振動方程式
 */
class SpringAnimation {
  private animationId: number | null = null
  private currentValue: number
  private targetValue: number
  private velocity: number = 0
  private stiffness: number
  private damping: number
  private onUpdate: (value: number) => void
  private onComplete?: () => void

  constructor(
    initialValue: number,
    stiffness: number,
    damping: number,
    onUpdate: (value: number) => void
  ) {
    this.currentValue = initialValue
    this.targetValue = initialValue
    this.stiffness = stiffness
    this.damping = damping
    this.onUpdate = onUpdate
  }

  /**
   * 動畫到目標值
   */
  animateTo(target: number, initialVelocity: number = 0, onComplete?: () => void) {
    this.targetValue = target
    this.velocity = initialVelocity
    this.onComplete = onComplete
    this.startAnimation()
  }

  /**
   * 立即設置值（無動畫）
   */
  setValue(value: number) {
    this.stop()
    this.currentValue = value
    this.targetValue = value
    this.velocity = 0
    this.onUpdate(value)
  }

  /**
   * 停止動畫
   */
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * 獲取當前值
   */
  getValue(): number {
    return this.currentValue
  }

  private startAnimation() {
    this.stop()
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.064) // 限制最大 dt
      lastTime = currentTime

      // 彈簧力 = -k * (x - target)
      const displacement = this.currentValue - this.targetValue
      const springForce = -this.stiffness * displacement

      // 阻尼力 = -c * velocity
      const dampingForce = -this.damping * this.velocity

      // 加速度 = 力 / 質量（假設質量為 1）
      const acceleration = springForce + dampingForce

      // 更新速度和位置
      this.velocity += acceleration * deltaTime
      this.currentValue += this.velocity * deltaTime

      // 更新回調
      this.onUpdate(this.currentValue)

      // 檢查是否收斂
      const isSettled =
        Math.abs(displacement) < 0.5 && Math.abs(this.velocity) < 0.5

      if (isSettled) {
        this.currentValue = this.targetValue
        this.velocity = 0
        this.onUpdate(this.currentValue)
        this.animationId = null
        this.onComplete?.()
      } else {
        this.animationId = requestAnimationFrame(animate)
      }
    }

    this.animationId = requestAnimationFrame(animate)
  }
}

/**
 * 抽屜物理動畫 Composable
 *
 * @param options - 物理配置選項
 * @returns 抽屜控制方法和狀態
 */
export function useDrawerPhysics(options: DrawerPhysicsOptions): DrawerPhysicsReturn {
  const {
    maxHeight,
    stiffness = 120,
    damping = 14,
    bounce = 0.25,
    enableGravity = true,
    dragResistance = 0.3,
    velocityThreshold = 300,
    direction = 'up'
  } = options

  // 根據 bounce 調整阻尼（bounce 越高，阻尼越低）
  const effectiveDamping = damping * (1 - bounce * 0.5)
  // 關閉時降低阻尼增加重力感
  const gravityDamping = enableGravity ? effectiveDamping * 0.7 : effectiveDamping

  // === 狀態 ===
  const isOpen = ref(false)
  const isDragging = ref(false)
  const heightValue = ref(0)
  const dragStartHeight = ref(0)
  const lastVelocity = ref(0)

  // === 彈簧動畫實例 ===
  let spring: SpringAnimation | null = null

  // 初始化彈簧
  const initSpring = () => {
    if (!spring) {
      spring = new SpringAnimation(
        heightValue.value,
        stiffness,
        effectiveDamping,
        (value) => {
          heightValue.value = Math.max(0, Math.min(maxHeight, value))
        }
      )
    }
  }

  // === 計算屬性 ===
  const currentHeight = computed(() => heightValue.value)

  const drawerStyle = computed(() => ({
    height: `${heightValue.value}px`,
    overflow: 'hidden',
    willChange: isDragging.value ? 'height' : 'auto',
    // GPU 加速
    transform: 'translateZ(0)',
    contain: 'layout style'
  }))

  // === 方法 ===

  /**
   * 打開抽屜（帶彈簧動畫）
   */
  function open() {
    isOpen.value = true
    initSpring()
    spring!.animateTo(maxHeight)
  }

  /**
   * 關閉抽屜（帶重力/彈簧動畫）
   */
  function close() {
    isOpen.value = false
    initSpring()
    // 關閉時使用較低阻尼產生重力感
    if (enableGravity) {
      spring = new SpringAnimation(
        heightValue.value,
        stiffness,
        gravityDamping,
        (value) => {
          heightValue.value = Math.max(0, value)
        }
      )
    }
    spring!.animateTo(0)
  }

  /**
   * 切換抽屜狀態
   */
  function toggle() {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  /**
   * 停止當前動畫
   */
  function stop() {
    spring?.stop()
  }

  /**
   * 設置拖曳處理器
   */
  function setupDragHandler(handleEl: Ref<HTMLElement | null>) {
    let lastTime = 0
    let lastY = 0

    useDrag(
      ({ movement: [, my], dragging, tap }: { movement: [number, number]; dragging: boolean; tap: boolean }) => {
        // 如果是點擊（tap），不處理拖曳
        if (tap) return

        const now = performance.now()

        if (dragging) {
          if (!isDragging.value) {
            // 開始拖曳
            isDragging.value = true
            initSpring()
            dragStartHeight.value = heightValue.value
            stop() // 停止正在進行的動畫
            lastTime = now
            lastY = my
          }

          // 計算速度（用於 fling 判斷）
          const dt = now - lastTime
          if (dt > 0) {
            lastVelocity.value = ((my - lastY) / dt) * 1000 // 轉換為 px/s
          }
          lastTime = now
          lastY = my

          // 根據拖曳方向計算新高度
          const dragMultiplier = direction === 'up' ? -1 : 1
          const resistedMovement = my * (1 - dragResistance) * dragMultiplier

          let newHeight = dragStartHeight.value + resistedMovement

          // 過度拖曳時添加彈性阻力（橡皮筋效果）
          if (newHeight > maxHeight) {
            const overDrag = newHeight - maxHeight
            newHeight = maxHeight + overDrag * 0.2
          } else if (newHeight < 0) {
            const overDrag = Math.abs(newHeight)
            newHeight = -overDrag * 0.2
          }

          // 直接更新高度
          heightValue.value = Math.max(0, Math.min(maxHeight * 1.2, newHeight))
        } else {
          // 拖曳結束
          isDragging.value = false

          const currentH = heightValue.value
          const velocity = lastVelocity.value

          // 判斷最終狀態
          let shouldOpen: boolean

          if (Math.abs(velocity) > velocityThreshold) {
            shouldOpen = direction === 'up' ? velocity < 0 : velocity > 0
          } else {
            shouldOpen = currentH > maxHeight / 2
          }

          // 使用當前速度作為初始速度進行彈簧動畫
          initSpring()
          const targetHeight = shouldOpen ? maxHeight : 0
          const initialVelocity = velocity * (direction === 'up' ? -1 : 1) * 0.5

          spring = new SpringAnimation(
            currentH,
            stiffness,
            shouldOpen ? effectiveDamping : gravityDamping,
            (value) => {
              heightValue.value = Math.max(0, Math.min(maxHeight, value))
            }
          )
          spring.animateTo(targetHeight, initialVelocity, () => {
            isOpen.value = shouldOpen
          })
        }
      },
      {
        domTarget: handleEl,
        filterTaps: true,
        preventWindowScrollY: true
      }
    )
  }

  // === 清理 ===
  onBeforeUnmount(() => {
    stop()
  })

  return {
    isOpen,
    isDragging,
    currentHeight,
    drawerStyle,
    open,
    close,
    toggle,
    setupDragHandler,
    stop
  }
}
