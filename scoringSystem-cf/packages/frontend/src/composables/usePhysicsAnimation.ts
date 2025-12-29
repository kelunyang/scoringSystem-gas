/**
 * @fileoverview Matter.js 物理動畫 Composable
 *
 * 從 AvatarGroup.vue 抽取的共用物理引擎邏輯
 * 支援水平滑入碰撞、垂直墜落堆疊等效果
 *
 * 使用範例:
 * ```typescript
 * const physics = usePhysicsAnimation({
 *   gravity: { x: 0, y: 0 }  // 水平移動
 * })
 *
 * physics.initEngine()
 * physics.addWall(-10, centerY, 20, 100)
 * physics.addBody({ id: 'avatar-1', x: 100, y: 50, radius: 16, velocity: { x: -8, y: 0 } })
 * physics.start()
 * ```
 */

import { ref, onUnmounted } from 'vue'
import Matter from 'matter-js'

/** 物理引擎配置選項 */
export interface PhysicsOptions {
  /** 重力向量 { x, y }，x=0,y=0 為無重力，y=1 為垂直向下 */
  gravity: { x: number; y: number }
  /** 彈性係數（預設 0.7），值越高彈跳越強 */
  restitution?: number
  /** 摩擦力（預設 0.05） */
  friction?: number
  /** 空氣阻力（預設 0.02） */
  frictionAir?: number
  /** 速度閾值，低於此值視為靜止（預設 0.1） */
  velocityThreshold?: number
  /** 穩定後延遲停止時間（毫秒，預設 100） */
  settleDelay?: number
}

/** 碰撞過濾器配置 */
export interface CollisionFilterConfig {
  /** 碰撞群組（負數群組的物體不會互相碰撞） */
  group?: number
  /** 碰撞類別（bit field） */
  category?: number
  /** 碰撞遮罩（決定與哪些類別碰撞） */
  mask?: number
}

/** 物體配置 */
export interface BodyConfig {
  /** 唯一識別符 */
  id: string
  /** 初始 X 座標 */
  x: number
  /** 初始 Y 座標 */
  y: number
  /** 圓形半徑 */
  radius: number
  /** 初始速度向量（可選） */
  velocity?: { x: number; y: number }
  /** 初始角速度（可選） */
  angularVelocity?: number
  /** 自訂彈性係數（可選，覆蓋全局設定） */
  restitution?: number
  /** 自訂摩擦力（可選） */
  friction?: number
  /** 自訂空氣阻力（可選） */
  frictionAir?: number
  /** 碰撞過濾器（可選，用於控制物體間的碰撞行為） */
  collisionFilter?: CollisionFilterConfig
}

/** 順序發射配置 */
export interface SequentialLaunchConfig {
  /** 發射冷卻時間（毫秒） */
  cooldownMs?: number
  /** 判斷是否可發射下一個的條件（速度閾值） */
  launchSpeedThreshold?: number
  /** 判斷是否在地板上的 Y 座標閾值 */
  floorY?: number
  /** 發射完成後的回調 */
  onAllLaunched?: () => void
}

/** 位置資訊 */
export interface Position {
  x: number
  y: number
  angle: number
}

/**
 * Matter.js 物理動畫 Composable
 *
 * @param options - 物理引擎配置
 * @returns 物理引擎控制方法和狀態
 */
export function usePhysicsAnimation(options: PhysicsOptions) {
  // 預設值
  const defaultRestitution = options.restitution ?? 0.7
  const defaultFriction = options.friction ?? 0.05
  const defaultFrictionAir = options.frictionAir ?? 0.02
  const velocityThreshold = options.velocityThreshold ?? 0.1
  const settleDelay = options.settleDelay ?? 100

  // 狀態
  const isStarted = ref(false)
  const isSettled = ref(false)
  const positions = ref<Map<string, Position>>(new Map())

  // Matter.js 實例（非響應式，避免 Proxy 問題）
  let engine: Matter.Engine | null = null
  let runner: Matter.Runner | null = null
  const bodies = new Map<string, Matter.Body>()
  const walls: Matter.Body[] = []

  // 回調函數
  let onSettledCallback: (() => void) | null = null
  let onUpdateCallback: ((bodies: Map<string, Matter.Body>) => void) | null = null

  // 順序發射狀態
  let sequentialQueue: BodyConfig[] = []
  let currentLaunchIndex = 0
  let lastLaunchTime = 0
  let sequentialConfig: SequentialLaunchConfig = {}

  /**
   * 初始化物理引擎
   */
  function initEngine() {
    const { Engine, Runner, Events } = Matter

    engine = Engine.create({
      gravity: options.gravity
    })

    runner = Runner.create()

    // 每幀更新位置
    Events.on(engine, 'afterUpdate', updatePositions)
  }

  /**
   * 添加靜態牆壁/地板
   *
   * @param x - 中心 X 座標
   * @param y - 中心 Y 座標
   * @param width - 寬度
   * @param height - 高度
   * @param wallRestitution - 牆壁彈性（可選）
   * @returns Matter.Body 實例
   */
  function addWall(
    x: number,
    y: number,
    width: number,
    height: number,
    wallRestitution?: number
  ): Matter.Body {
    if (!engine) {
      throw new Error('Engine not initialized. Call initEngine() first.')
    }

    const { Bodies, Composite } = Matter
    const wall = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      restitution: wallRestitution ?? defaultRestitution * 0.8 // 牆壁彈性稍低
    })

    Composite.add(engine.world, wall)
    walls.push(wall)
    return wall
  }

  /**
   * 添加動態圓形物體
   *
   * @param config - 物體配置
   * @returns Matter.Body 實例
   */
  function addBody(config: BodyConfig): Matter.Body {
    if (!engine) {
      throw new Error('Engine not initialized. Call initEngine() first.')
    }

    const { Bodies, Body, Composite } = Matter

    const bodyOptions: Matter.IBodyDefinition = {
      restitution: config.restitution ?? defaultRestitution,
      friction: config.friction ?? defaultFriction,
      frictionAir: config.frictionAir ?? defaultFrictionAir,
      label: config.id
    }

    // 添加碰撞過濾器（如有設定）
    if (config.collisionFilter) {
      bodyOptions.collisionFilter = {
        group: config.collisionFilter.group ?? 0,
        category: config.collisionFilter.category ?? 0x0001,
        mask: config.collisionFilter.mask ?? 0xFFFFFFFF
      }
    }

    const body = Bodies.circle(config.x, config.y, config.radius, bodyOptions)

    if (config.velocity) {
      Body.setVelocity(body, config.velocity)
    }
    if (config.angularVelocity !== undefined) {
      Body.setAngularVelocity(body, config.angularVelocity)
    }

    bodies.set(config.id, body)
    Composite.add(engine.world, body)
    return body
  }

  /**
   * 批量添加多個物體（用於延遲添加）
   *
   * @param configs - 物體配置陣列
   * @param delayMs - 每個物體之間的延遲（毫秒）
   * @returns Promise，所有物體添加完成後 resolve
   */
  function addBodiesWithDelay(configs: BodyConfig[], delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      configs.forEach((config, index) => {
        setTimeout(() => {
          addBody(config)
          if (index === configs.length - 1) {
            resolve()
          }
        }, index * delayMs)
      })

      // 如果沒有物體，立即 resolve
      if (configs.length === 0) {
        resolve()
      }
    })
  }

  /**
   * 設定順序發射佇列
   * 物體會在前一個穩定後才發射下一個
   *
   * @param configs - 物體配置陣列
   * @param config - 順序發射配置
   */
  function setupSequentialLaunch(configs: BodyConfig[], config?: SequentialLaunchConfig) {
    sequentialQueue = [...configs]
    currentLaunchIndex = 0
    lastLaunchTime = 0
    sequentialConfig = config || {}

    // 發射第一個
    if (sequentialQueue.length > 0) {
      addBody(sequentialQueue[0])
      currentLaunchIndex = 1
      lastLaunchTime = Date.now()
    }
  }

  /**
   * 檢查並發射下一個（在 afterUpdate 中調用）
   */
  function checkAndLaunchNext() {
    if (currentLaunchIndex >= sequentialQueue.length) return

    const now = Date.now()
    const cooldown = sequentialConfig.cooldownMs ?? 50
    const speedThreshold = sequentialConfig.launchSpeedThreshold ?? 2
    const floorY = sequentialConfig.floorY

    if (now - lastLaunchTime < cooldown) return

    // 檢查上一個物體是否已穩定
    const lastConfig = sequentialQueue[currentLaunchIndex - 1]
    const lastBody = bodies.get(lastConfig.id)

    if (lastBody) {
      const speed = Math.sqrt(lastBody.velocity.x ** 2 + lastBody.velocity.y ** 2)
      const isSlowEnough = speed < speedThreshold

      // 如果有 floorY，還要檢查是否在地板上
      const isOnFloor = floorY === undefined ||
        lastBody.position.y > floorY - lastConfig.radius - 10

      if (isSlowEnough && isOnFloor) {
        // 發射下一個
        addBody(sequentialQueue[currentLaunchIndex])
        currentLaunchIndex++
        lastLaunchTime = now

        // 檢查是否全部發射完成
        if (currentLaunchIndex >= sequentialQueue.length && sequentialConfig.onAllLaunched) {
          sequentialConfig.onAllLaunched()
        }
      }
    }
  }

  /**
   * 檢查順序發射是否完成
   */
  function isSequentialLaunchComplete(): boolean {
    return sequentialQueue.length === 0 || currentLaunchIndex >= sequentialQueue.length
  }

  /**
   * 更新所有物體位置（每幀調用）
   */
  function updatePositions() {
    const newPositions = new Map<string, Position>()
    let allSettled = true

    bodies.forEach((body, key) => {
      newPositions.set(key, {
        x: body.position.x,
        y: body.position.y,
        angle: body.angle
      })

      // 檢查是否仍在移動
      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
      if (speed > velocityThreshold) {
        allSettled = false
      }
    })

    positions.value = newPositions

    // 調用外部更新回調（用於自定義物理邏輯，如目標位置吸附）
    if (onUpdateCallback) {
      onUpdateCallback(bodies)
    }

    // 檢查順序發射
    checkAndLaunchNext()

    // 只有當順序發射完成且所有物體靜止後才停止物理引擎
    const launchComplete = isSequentialLaunchComplete()
    if (launchComplete && allSettled && bodies.size > 0 && !isSettled.value) {
      setTimeout(() => {
        if (runner) {
          Matter.Runner.stop(runner)
        }
        isSettled.value = true

        // 觸發回調
        if (onSettledCallback) {
          onSettledCallback()
        }
      }, settleDelay)
    }
  }

  /**
   * 啟動物理模擬
   */
  function start() {
    if (!engine || !runner) {
      console.warn('Engine not initialized. Call initEngine() first.')
      return
    }
    isStarted.value = true
    isSettled.value = false
    Matter.Runner.run(runner, engine)
  }

  /**
   * 停止物理模擬
   */
  function stop() {
    if (runner) {
      Matter.Runner.stop(runner)
    }
  }

  /**
   * 清理所有資源
   */
  function cleanup() {
    stop()

    if (engine) {
      // 移除事件監聯
      Matter.Events.off(engine, 'afterUpdate', updatePositions)
      Matter.Engine.clear(engine)
      engine = null
    }

    runner = null
    bodies.clear()
    walls.length = 0
    positions.value = new Map()
    isStarted.value = false
    isSettled.value = false

    // 重置順序發射狀態
    sequentialQueue = []
    currentLaunchIndex = 0
    lastLaunchTime = 0
    sequentialConfig = {}
  }

  /**
   * 重置物理引擎（資料變更時使用）
   */
  function reset() {
    cleanup()
    initEngine()
  }

  /**
   * 取得指定 ID 的物體
   *
   * @param id - 物體 ID
   * @returns Matter.Body 或 undefined
   */
  function getBody(id: string): Matter.Body | undefined {
    return bodies.get(id)
  }

  /**
   * 取得指定 ID 的位置
   *
   * @param id - 物體 ID
   * @returns Position 或 undefined
   */
  function getPosition(id: string): Position | undefined {
    return positions.value.get(id)
  }

  /**
   * 設定穩定後的回調函數
   *
   * @param callback - 回調函數
   */
  function onSettled(callback: () => void) {
    onSettledCallback = callback
  }

  /**
   * 設定每幀更新回調函數
   * 用於實現自定義物理邏輯，如目標位置吸附
   *
   * @param callback - 回調函數，接收所有 body 的 Map
   */
  function onUpdate(callback: (bodies: Map<string, Matter.Body>) => void) {
    onUpdateCallback = callback
  }

  /**
   * 取得物體數量
   */
  function getBodyCount(): number {
    return bodies.size
  }

  // 組件卸載時自動清理
  onUnmounted(cleanup)

  return {
    // 狀態（響應式）
    isStarted,
    isSettled,
    positions,

    // 初始化
    initEngine,

    // 物體管理
    addWall,
    addBody,
    addBodiesWithDelay,
    setupSequentialLaunch,
    isSequentialLaunchComplete,
    getBody,
    getPosition,
    getBodyCount,

    // 控制
    start,
    stop,
    reset,
    cleanup,

    // 事件
    onSettled,
    onUpdate
  }
}
