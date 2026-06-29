/**
 * @fileoverview 階段看板「彈簧弦」震動 Composable（matter.js Constraint，錨點由 LED 驅動）
 *
 * 用於 ProjectCard 線性流程：看板掛在彈性弦上。LED 指示燈經過時，外部每幀用 setLift(i, 抬升量)
 * 把該看板的彈簧錨點往上移 → body 跟著往上（與 LED 位置同步：進入時開始升、到中央最高），
 * LED 離開後錨點歸位 → body 過衝並阻尼震盪收斂（弦振動）。
 *
 * LED 走不到的看板用 pluck(i) 給一個向上初速自己震一下。
 *
 * 物理步進 step() 由外部 rAF 迴圈呼叫（與 LED 位移同一迴圈 → 完全同步）。
 */

import Matter from 'matter-js'
import { ref, onUnmounted } from 'vue'

const RADIUS = 8
const STIFFNESS = 0.4       // 彈簧剛度（越大越貼著錨點走＝越同步，越小越鬆）
const DAMPING = 0.12        // 彈簧阻尼
const FRICTION_AIR = 0.02   // 空氣阻力（收斂）
const PLUCK_V = 11          // LED 走不到的看板：撥動初速
const MAX_UP = 26           // 視覺最大「往上」位移（px）
const MAX_DOWN = 8          // 視覺最大「往下」位移（px，壓低避免碰底部 LED 軌道）

export function useStageBounce() {
  /** bodyIndex -> translateY（負＝往上，正＝往下） */
  const offsets = ref<Map<number, number>>(new Map())

  let engine: Matter.Engine | null = null
  let bodies = new Map<number, Matter.Body>()
  let springs = new Map<number, Matter.Constraint>()

  function syncOffsets() {
    const m = new Map<number, number>()
    bodies.forEach((b, i) => {
      m.set(i, Math.max(-MAX_UP, Math.min(MAX_DOWN, b.position.y)))
    })
    offsets.value = m
  }

  /** 建立 n 個看板：每個 body 用彈簧 constraint 拴在原位（y=0），錨點可被 setLift 移動 */
  function ensure(n: number) {
    if (engine && bodies.size === n) return
    teardown()
    engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } })
    const add: (Matter.Body | Matter.Constraint)[] = []
    for (let i = 0; i < n; i++) {
      const x = i * 40 + 20
      const body = Matter.Bodies.circle(x, 0, RADIUS, {
        frictionAir: FRICTION_AIR,
        collisionFilter: { group: -1 }
      })
      const spring = Matter.Constraint.create({
        pointA: { x, y: 0 }, // 可變錨點：setLift 會改 pointA.y
        bodyB: body,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: STIFFNESS,
        damping: DAMPING
      })
      bodies.set(i, body)
      springs.set(i, spring)
      add.push(body, spring)
    }
    Matter.Composite.add(engine.world, add)
    syncOffsets()
  }

  /** 設定第 i 個看板的抬升量（>0 往上）；把彈簧錨點往上移，body 會跟上去 */
  function setLift(i: number, lift: number) {
    const s = springs.get(i)
    if (s) s.pointA.y = -lift
  }

  /** 撥動第 i 個看板（給向上初速，用於 LED 走不到的看板） */
  function pluck(i: number) {
    const b = bodies.get(i)
    if (b) Matter.Body.setVelocity(b, { x: 0, y: -PLUCK_V })
  }

  /** 步進一幀物理（由外部 rAF 迴圈呼叫，與 LED 位移同步） */
  function step() {
    if (!engine) return
    Matter.Engine.update(engine, 1000 / 60)
    syncOffsets()
  }

  /** 是否所有 body 都已貼回各自錨點且靜止 */
  function isSettled(): boolean {
    let moving = false
    bodies.forEach((b, i) => {
      const anchorY = springs.get(i)?.pointA.y ?? 0
      if (Math.abs(b.velocity.y) > 0.05 || Math.abs(b.position.y - anchorY) > 0.4) moving = true
    })
    return !moving
  }

  /** 取得第 i 個看板的垂直位移（綁定 translateY） */
  function bounceY(i: number): number {
    return offsets.value.get(i) ?? 0
  }

  function teardown() {
    if (engine) {
      Matter.Engine.clear(engine)
      engine = null
    }
    bodies = new Map()
    springs = new Map()
    offsets.value = new Map()
  }

  onUnmounted(teardown)

  return { ensure, setLift, pluck, step, isSettled, bounceY, cleanup: teardown }
}
