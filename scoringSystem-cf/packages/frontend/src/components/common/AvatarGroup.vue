<template>
  <div
    ref="containerRef"
    class="avatar-group"
    :class="{ 'flash-settle': isSettled && !useOriginalLayout }"
    :style="{ minWidth: `${containerWidth}px`, height: `${containerHeight}px` }"
  >
    <!-- Physics-controlled avatars (during animation) -->
    <template v-if="isPhysicsStarted && !useOriginalLayout">
      <!-- Leader avatar -->
      <div
        v-if="leader && avatarPositions.get('leader')"
        class="avatar-wrapper physics-avatar"
        :style="getAvatarStyle('leader')"
        @click="toggleExpand(leader.userEmail)"
      >
        <el-badge class="leader-badge">
          <template #content>
            <i class="fas fa-star"></i>
          </template>
          <img
            :src="getAvatarUrl(leader)"
            :alt="leader.displayName || leader.userEmail"
            class="avatar leader"
            :style="{ width: size, height: size }"
          />
        </el-badge>
        <transition name="slide-name">
          <div v-if="isExpanded(leader.userEmail)" class="name-card">
            {{ leader.displayName || leader.userEmail.split('@')[0] }} ({{ leader.userEmail }})
          </div>
        </transition>
      </div>

      <!-- Separator -->
      <span
        v-if="leader && members.length > 0 && isSettled"
        class="separator"
        :style="{ left: `${separatorX}px` }"
      >|</span>

      <!-- Member avatars -->
      <div
        v-for="(member, idx) in members"
        :key="(member as any).userEmail"
        class="avatar-wrapper physics-avatar"
        :style="getAvatarStyle(`member-${idx}`)"
        @click="toggleExpand((member as any).userEmail)"
      >
        <img
          :src="getAvatarUrl(member)"
          :alt="(member as any).displayName || (member as any).userEmail"
          class="avatar member"
          :style="{ width: size, height: size }"
        />
        <transition name="slide-name">
          <div v-if="isExpanded((member as any).userEmail)" class="name-card">
            {{ (member as any).displayName || (member as any).userEmail.split('@')[0] }} ({{ (member as any).userEmail }})
          </div>
        </transition>
      </div>
    </template>

    <!-- Static layout (initial state + after animation completes) -->
    <template v-else>
      <!-- Leader avatar -->
      <div
        v-if="leader"
        class="avatar-wrapper static-avatar"
        @click="toggleExpand(leader.userEmail)"
      >
        <el-badge class="leader-badge">
          <template #content>
            <i class="fas fa-star"></i>
          </template>
          <img
            :src="getAvatarUrl(leader)"
            :alt="leader.displayName || leader.userEmail"
            class="avatar leader"
            :style="{ width: size, height: size }"
          />
        </el-badge>
        <transition name="slide-name">
          <div v-if="isExpanded(leader.userEmail)" class="name-card">
            {{ leader.displayName || leader.userEmail.split('@')[0] }} ({{ leader.userEmail }})
          </div>
        </transition>
      </div>

      <!-- Separator -->
      <span v-if="leader && members.length > 0" class="separator-static">|</span>

      <!-- Member avatars -->
      <div
        v-for="member in members"
        :key="(member as any).userEmail"
        class="avatar-wrapper static-avatar"
        @click="toggleExpand((member as any).userEmail)"
      >
        <img
          :src="getAvatarUrl(member)"
          :alt="(member as any).displayName || (member as any).userEmail"
          class="avatar member"
          :style="{ width: size, height: size }"
        />
        <transition name="slide-name">
          <div v-if="isExpanded((member as any).userEmail)" class="name-card">
            {{ (member as any).displayName || (member as any).userEmail.split('@')[0] }} ({{ (member as any).userEmail }})
          </div>
        </transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import Matter from 'matter-js'
import { usePhysicsAnimation, type BodyConfig } from '@/composables/usePhysicsAnimation'
import { useInViewport } from '@/composables/useInViewport'
import { generateAvatarUrl } from '@/utils/walletHelpers'
import type { Member } from '@/types'

const props = defineProps({
  groupMembers: {
    type: Array,
    required: true,
    default: () => []
  },
  size: {
    type: String,
    default: '40px'
  },
  autoHideDelay: {
    type: Number,
    default: 3000
  }
})

// Parse size to number
const avatarSize = computed(() => parseInt(props.size) || 40)
const avatarRadius = computed(() => avatarSize.value / 2)

// Container ref and dimensions
const containerRef = ref<HTMLElement | null>(null)

// 視域偵測（進入視域時才啟動動畫）
const { hasEntered } = useInViewport(containerRef, { once: true })

const containerWidth = computed(() => {
  const total = (leader.value ? 1 : 0) + members.value.length
  // Account for overlapping (-10px per avatar after first)
  return total * avatarSize.value - (total > 1 ? (total - 1) * 10 : 0) + 20
})

// Container height - keep original size, animation overflows
const containerHeight = computed(() => avatarSize.value + 10)

// Map to store userEmail -> timeout ID for name expansion
const expandedAvatars = ref(new Map())

const leader = computed(() => {
  return (props.groupMembers as any[]).find((m: any) => m.role === 'leader')
})

const members = computed(() => {
  return (props.groupMembers as any[]).filter((m: any) => m.role === 'member')
})

// 使用 composable 管理物理動畫
const physics = usePhysicsAnimation({
  gravity: { x: 0, y: 1 },  // 垂直重力（籃球彈跳效果）
  restitution: 0.6,
  friction: 0.1,
  frictionAir: 0.02,
  velocityThreshold: 0.3,
  settleDelay: 100
})

// 額外狀態（動畫完成後切換到靜態佈局）
const useOriginalLayout = ref(false)

// 從 composable 取得狀態（保持與 template 兼容的命名）
const isPhysicsStarted = physics.isStarted
const isSettled = physics.isSettled
const avatarPositions = physics.positions

// Separator position (after leader settles)
const separatorX = computed(() => {
  if (!leader.value) return 0
  const leaderPos = physics.getPosition('leader')
  return leaderPos ? leaderPos.x + avatarRadius.value + 8 : 0
})

const initPhysics = () => {
  const radius = avatarRadius.value
  const floorY = containerHeight.value - 5
  const containerW = containerWidth.value
  const avatarCount = (leader.value ? 1 : 0) + members.value.length

  // === 解決方案 A：根據 avatar 數量優化拋射邏輯 ===
  const isSingleAvatar = avatarCount === 1

  // 單一 avatar 使用更溫和的參數，避免在小容器內失控
  const initialVelocityX = isSingleAvatar ? -3 : -8
  const startX = isSingleAvatar
    ? radius + 10  // 單一 avatar 從左側開始（短距離滑入）
    : containerW - radius - 5  // 多 avatar 從右邊開始

  // 初始化物理引擎
  physics.initEngine()

  // 創建底部地板
  physics.addWall(containerW / 2, floorY, containerW * 2, 10)

  // 創建左邊界牆（阻止頭像飛出左側）
  physics.addWall(-5, floorY / 2, 10, containerHeight.value * 2)

  // 創建右邊界牆（阻止頭像飛出右側）
  physics.addWall(containerW + 5, floorY / 2, 10, containerHeight.value * 2)

  // 建立頭像配置列表
  const avatarConfigs: BodyConfig[] = []

  // 碰撞過濾器：group: -1 表示同群組物體不會互相碰撞
  // 這樣 avatar 可以互相穿透堆疊，但仍會與牆壁碰撞
  const avatarCollisionFilter = { group: -1 }

  if (leader.value) {
    avatarConfigs.push({
      id: 'leader',
      x: startX,
      y: -radius * 2,
      radius,
      velocity: { x: initialVelocityX, y: 2 },
      angularVelocity: (Math.random() - 0.5) * 0.2,
      collisionFilter: avatarCollisionFilter
    })
  }

  members.value.forEach((_, idx) => {
    avatarConfigs.push({
      id: `member-${idx}`,
      x: startX,
      y: -radius * 2 - (idx + 1) * 5,
      radius,
      velocity: { x: initialVelocityX, y: 2 },
      angularVelocity: (Math.random() - 0.5) * 0.2,
      collisionFilter: avatarCollisionFilter
    })
  })

  // 設定順序發射（等前一個穩定後才發射下一個）
  physics.setupSequentialLaunch(avatarConfigs, {
    cooldownMs: 50,
    launchSpeedThreshold: 2,
    floorY
  })

  // 穩定後切換到靜態佈局
  physics.onSettled(() => {
    setTimeout(() => {
      useOriginalLayout.value = true
    }, 450)  // 等待閃爍動畫完成
  })

  // 計算每個 avatar 的目標 X 位置（堆疊佈局）
  // Leader 在最左，每個後續 avatar 往右重疊前一個的一半寬度
  const targetPositions = new Map<string, number>()
  const overlap = avatarSize.value * 0.5  // 重疊一半寬度
  const maxTargetX = containerW - radius - 5  // 最大 X 位置（不超出右邊界）
  let currentTargetX = radius + 5  // Leader 貼左邊界

  if (leader.value) {
    targetPositions.set('leader', currentTargetX)
    currentTargetX = Math.min(maxTargetX, currentTargetX + overlap)
  }

  members.value.forEach((_, idx) => {
    targetPositions.set(`member-${idx}`, currentTargetX)
    currentTargetX = Math.min(maxTargetX, currentTargetX + overlap)
  })

  // 每幀更新：將已著陸的 avatar 吸引到目標位置
  physics.onUpdate((bodies) => {
    const floorContactY = floorY - radius - 2  // 更精確的地板接觸判定（只留 2px 容差）
    const landingThreshold = floorY - radius - 5  // 用於判斷「接近地板」
    const speedThreshold = 1.5  // 速度低於此值才開始吸引
    const attractForce = 0.001  // 吸引力強度
    const maxForce = 0.005  // 最大力限制

    bodies.forEach((body, id) => {
      const targetX = targetPositions.get(id)
      if (targetX === undefined) return

      // 檢查是否真正接觸地板（更嚴格）
      const isTouchingFloor = body.position.y >= floorContactY
      // 檢查是否接近地板區域
      const isNearFloor = body.position.y > landingThreshold

      if (isNearFloor) {
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
        const distanceToTarget = targetX - body.position.x

        // 速度低時，施加向目標位置的力（限制最大力）
        if (speed < speedThreshold && Math.abs(distanceToTarget) > 2) {
          let forceX = distanceToTarget * attractForce
          forceX = Math.max(-maxForce, Math.min(maxForce, forceX))
          Matter.Body.applyForce(body, body.position, { x: forceX, y: 0 })
        }

        // 只有真正接觸地板 + 接近目標 + 幾乎靜止時，才固定位置
        // 關鍵修改：同時歸零 X 和 Y 速度，並固定在精確的地板位置
        if (isTouchingFloor && Math.abs(distanceToTarget) < 3 && speed < 0.3) {
          Matter.Body.setPosition(body, { x: targetX, y: floorY - radius })
          Matter.Body.setVelocity(body, { x: 0, y: 0 })
        }
      }
    })
  })

  // 啟動物理模擬
  physics.start()

  // === 解決方案 B：動態超時安全機制 ===
  // 根據 avatar 數量動態計算超時時間
  const dynamicTimeout = 1500 + (avatarCount * 800) + 500

  setTimeout(() => {
    if (!physics.isSettled.value && !useOriginalLayout.value) {
      console.warn(`[AvatarGroup] Animation timeout after ${dynamicTimeout}ms, forcing layout switch`)
      useOriginalLayout.value = true
    }
  }, dynamicTimeout)
}

// Get style for physics-controlled avatar
const getAvatarStyle = (key: string) => {
  const pos = avatarPositions.value.get(key)
  if (!pos) return { opacity: 0 }

  return {
    position: 'absolute' as const,
    left: `${pos.x - avatarRadius.value}px`,
    top: `${pos.y - avatarRadius.value}px`,
    transform: `rotate(${pos.angle}rad)`,
    zIndex: key === 'leader' ? 10 : 5
  }
}

const toggleExpand = (userEmail: string) => {
  if (expandedAvatars.value.has(userEmail)) {
    clearTimeout(expandedAvatars.value.get(userEmail))
    expandedAvatars.value.delete(userEmail)
  } else {
    const timeoutId = setTimeout(() => {
      expandedAvatars.value.delete(userEmail)
      expandedAvatars.value = new Map(expandedAvatars.value)
    }, props.autoHideDelay)

    expandedAvatars.value.set(userEmail, timeoutId)
  }
  expandedAvatars.value = new Map(expandedAvatars.value)
}

const isExpanded = (userEmail: string) => {
  return expandedAvatars.value.has(userEmail)
}

const getAvatarUrl = (member: Member) => {
  if (member.avatarSeed || member.avatarStyle) {
    return generateAvatarUrl(member)
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.userEmail)}`
}

// 進入視域時才啟動物理動畫（只播一次）
watch(hasEntered, (entered) => {
  if (entered && !physics.isStarted.value) {
    const randomDelay = Math.random() * 500
    setTimeout(() => {
      initPhysics()
    }, randomDelay)
  }
}, { immediate: true })

// 清理 expandedAvatars 的 timeout（composable 會自動清理物理引擎）
onUnmounted(() => {
  expandedAvatars.value.forEach(timeoutId => clearTimeout(timeoutId))
})

// Note: Animation only plays once on mount, no re-init on data changes
</script>

<style scoped>
/* Flash-settle animation (Tetris line clear effect) */
@keyframes flash-settle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.flash-settle {
  animation: flash-settle 0.4s ease-in-out;
}

.avatar-group {
  position: relative;
  display: flex;
  align-items: flex-end; /* Align to bottom for static layout */
  overflow: visible; /* Allow avatars to be visible during animation */
  isolation: isolate; /* Create stacking context to isolate z-index from other instances */
}

.physics-avatar {
  position: absolute;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.name-card {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  background: white;
  padding: 6px 12px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
  font-size: 13px;
  color: #2c3e50;
  border: 1px solid #e1e8ed;
  margin-left: 8px;
  z-index: 100;
}

.slide-name-enter-active,
.slide-name-leave-active {
  transition: all 0.3s ease;
}

.slide-name-enter-from,
.slide-name-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-10px);
}

.slide-name-enter-to,
.slide-name-leave-from {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #e1e8ed;
  background: white;
  object-fit: cover;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.avatar:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.avatar.leader {
  border-color: #000;
  border-width: 2px;
}

/* Leader 星星徽章樣式 */
.leader-badge :deep(.el-badge__content) {
  background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
  color: white;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  font-size: 10px;
  padding: 2px 4px;
  top: -4px;
  right: -4px;
}

.leader-badge :deep(.el-badge__content) i {
  font-size: 10px;
}

.separator {
  position: absolute;
  color: #bdc3c7;
  font-size: 18px;
  user-select: none;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

/* Static layout (after animation) */
.static-avatar {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  margin-left: -10px;
}

.static-avatar:first-child {
  margin-left: 0;
}

.separator-static {
  color: #bdc3c7;
  font-size: 18px;
  user-select: none;
  margin: 0 4px;
}
</style>
