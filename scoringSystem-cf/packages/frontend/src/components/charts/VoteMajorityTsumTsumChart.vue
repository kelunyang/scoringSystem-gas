<template>
  <div class="vote-majority-tsumtsum-chart">
    <EmptyState
      v-if="!hasData"
      :icons="['fas fa-vote-yea', 'fas fa-inbox']"
      title="暫無投票資料"
      parent-icon="fa-chart-column"
      :compact="true"
      :enable-animation="false"
    />
    <div v-else ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import * as d3 from 'd3'
import { useAvatar } from '@/composables/useAvatar'
import { usePhysicsAnimation, type BodyConfig } from '@/composables/usePhysicsAnimation'
import { useInViewport } from '@/composables/useInViewport'
import EmptyState from '@/components/shared/EmptyState.vue'
import type { RankingProposalStatus, VotingResult } from '@repo/shared/types/entities'

interface Voter {
  voterEmail: string
  voterDisplayName?: string
  voterAvatarSeed?: string
  voterAvatarStyle?: string
  voterAvatarOptions?: string | Record<string, any>
  timestamp?: number
  [key: string]: any
}

interface VoteDataEntry {
  support: Voter[]
  oppose?: Voter[]
}

type VoteData = Record<string, VoteDataEntry>

export interface Props {
  voteData: VoteData
  versionLabels: string[]
  versionStatuses: RankingProposalStatus[]
  versionVotingResults: VotingResult[]
  groupMemberCount?: number
  currentUserEmail?: string
  chartTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  groupMemberCount: 0,
  currentUserEmail: '',
  chartTitle: '各版本投票分佈（多數決）'
})

const { getVoterAvatarUrl } = useAvatar()

const chartContainer: Ref<HTMLElement | null> = ref(null)

// 視域偵測（進入視域時才啟動動畫）
const { hasEntered } = useInViewport(chartContainer, { once: true })
const svg: Ref<any> = ref(null)
const g: Ref<any> = ref(null)
const xScale: Ref<any> = ref(null)
const yScale: Ref<any> = ref(null)
const currentTooltip: Ref<any> = ref(null)

const hasData: ComputedRef<boolean> = computed(() => {
  return Object.keys(props.voteData).length > 0
})

const hasOpposeVotes: ComputedRef<boolean> = computed(() => {
  return Object.values(props.voteData).some(v => v.oppose && v.oppose.length > 0)
})

// 物理動畫狀態
const physics = usePhysicsAnimation({
  gravity: { x: 0, y: 0 },  // 水平移動，無重力
  restitution: 0.6,
  friction: 0.1,
  frictionAir: 0.05,
  velocityThreshold: 0.3,
  settleDelay: 100
})

// 追蹤動畫進度
const animationPhase = ref<'idle' | 'animating' | 'settled'>('idle')
const avatarElements = ref<Map<string, any>>(new Map())  // 存儲 D3 avatar 元素
let animationFrameId: number | null = null
let chartDimensions: { margin: any, width: number, height: number, centerX: number, avatarSize: number, rowHeight: number } | null = null

// 版本順序（用於動畫排序：從舊到新）
const versionOrderForAnimation = computed(() => {
  return Object.keys(props.voteData)  // 原始順序：舊到新
})

// 資料變更時（僅當已進入視域後才重新渲染）
watch(() => props.voteData, () => {
  if (hasData.value && hasEntered.value) {
    nextTick(() => {
      stopAnimation()
      physics.cleanup()
      avatarElements.value.clear()
      animationPhase.value = 'idle'
      renderChart()
      // 短延遲後開始動畫
      setTimeout(() => {
        startPhysicsAnimation()
      }, 100)
    })
  }
}, { deep: true })

// 進入視域時才啟動渲染和動畫（只播一次）
watch(hasEntered, (entered) => {
  if (entered && hasData.value && animationPhase.value === 'idle') {
    nextTick(() => {
      renderChart()
      // 短延遲後開始動畫
      setTimeout(() => {
        startPhysicsAnimation()
      }, 100)
    })
  }
}, { immediate: true })

onBeforeUnmount(() => {
  stopAnimation()
  physics.cleanup()
  cleanupTooltips()
})

function renderChart(): void {
  if (!chartContainer.value) return

  const container = chartContainer.value
  container.innerHTML = ''

  // 設置圖表尺寸
  const margin = { top: 40, right: 100, bottom: 60, left: 120 }
  const rowHeight = 32 // 固定行高（與頭像尺寸一致）
  const avatarSize = 32

  const versionKeys = Object.keys(props.voteData)
  const versionCount = versionKeys.length

  // 計算 X 軸範圍（決定圖表的橫向寬度）
  let maxVotes = 0

  // 優先使用 groupMemberCount（組員總人數）
  if (props.groupMemberCount && props.groupMemberCount > 0) {
    maxVotes = props.groupMemberCount
    console.log('📊 使用組員總人數作為 X 軸範圍:', maxVotes)
  } else {
    // Fallback: 使用實際票數（當 groupMemberCount 不可用時）
    versionKeys.forEach(key => {
      const { support, oppose } = props.voteData[key]
      maxVotes = Math.max(maxVotes, support.length, oppose?.length || 0)
    })
    console.warn('⚠️ groupMemberCount 不可用，使用實際票數:', maxVotes)
  }

  // 至少顯示 5 票的範圍（避免圖表太窄）
  maxVotes = Math.max(maxVotes, 5)

  // 圖表高度根據版本數量動態計算
  const chartHeight = versionCount * rowHeight
  const width = container.offsetWidth - margin.left - margin.right
  const height = chartHeight

  // 存儲圖表尺寸（供物理動畫使用）
  // centerX 會在 xScale 創建後更新
  chartDimensions = { margin, width, height, centerX: width / 2, avatarSize, rowHeight }

  // 創建SVG
  svg.value = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)

  g.value = svg.value.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // X軸：票數（中心為0，左負右正）
  xScale.value = d3.scaleLinear()
    .domain([-maxVotes, maxVotes])
    .range([0, width])

  // 更新 centerX（使用 xScale）
  chartDimensions!.centerX = xScale.value(0)

  // Y軸：版本（倒序，最新在上）
  const versionKeysReversed = [...versionKeys].reverse()
  yScale.value = d3.scaleBand()
    .domain(versionKeysReversed)
    .range([0, height])
    .padding(0.1)

  // 繪製X軸
  const xAxis = d3.axisBottom(xScale.value)
    .tickValues(d3.range(-maxVotes, maxVotes + 1, 1))
    .tickFormat((d) => Math.abs(d as number).toString())

  g.value.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .selectAll('text')
    .style('font-size', '11px')

  // X軸標籤
  g.value.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 10)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('fill', '#666')
    .text('票數')

  // 繪製Y軸（版本標籤）
  versionKeysReversed.forEach((versionKey) => {
    const originalIndex = versionKeys.indexOf(versionKey)
    const label = props.versionLabels[originalIndex]
    const { support, oppose } = props.voteData[versionKey]
    const yPos = (yScale.value(versionKey) || 0) + rowHeight / 2

    // 版本標籤
    g.value.append('text')
      .attr('x', -10)
      .attr('y', yPos)
      .attr('text-anchor', 'end')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .text(label)

    // 票數統計
    const voteCountText = `${support.length}支持 / ${oppose?.length || 0}反對`
    g.value.append('text')
      .attr('x', -10)
      .attr('y', yPos + 12)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .attr('fill', '#909399')
      .text(voteCountText)
  })

  // 繪製0軸線（粗黑虛線）
  const centerX = xScale.value(0)
  g.value.append('line')
    .attr('x1', centerX)
    .attr('x2', centerX)
    .attr('y1', 0)
    .attr('y2', height)
    .attr('stroke', '#000')
    .attr('stroke-width', 3)
    .attr('stroke-dasharray', '5,5')

  // 繪製每個版本的橫條
  versionKeysReversed.forEach((versionKey) => {
    const { support, oppose } = props.voteData[versionKey]
    const yPos = (yScale.value(versionKey) || 0)

    // 繪製投票結果方塊
    const netVotes = support.length - (oppose?.length || 0)
    const resultColor = netVotes > 0 ? '#67c23a' : netVotes < 0 ? '#800000' : '#909399'
    const resultText = netVotes > 0 ? `+${netVotes}` : `${netVotes}`

    // 背景方塊（實心，矮一點讓0軸線可見）
    const boxHeight = 20 // 減少高度（原本 32px）
    const boxYOffset = (rowHeight - boxHeight) / 2 // 垂直居中
    g.value.append('rect')
      .attr('x', centerX - 20)
      .attr('y', yPos + boxYOffset)
      .attr('width', 40)
      .attr('height', boxHeight)
      .attr('fill', resultColor)
      .attr('stroke', resultColor)
      .attr('stroke-width', 2)
      .attr('rx', 4)

    // 結果文字
    g.value.append('text')
      .attr('x', centerX)
      .attr('y', yPos + rowHeight / 2 + 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .text(resultText)

    // 繪製支持票（向右）
    if (support && support.length > 0) {
      drawHorizontalBar(support, xScale.value, yPos, avatarSize, 'support', 'right', versionKey)
    }

    // 繪製反對票（向左）
    if (oppose && oppose.length > 0) {
      drawHorizontalBar(oppose, xScale.value, yPos, avatarSize, 'oppose', 'left', versionKey)
    }
  })

  // 繪製圖例（如果有反對票）
  if (hasOpposeVotes.value) {
    renderLegend(width, height, margin)
  }

  // 添加圖表標題
  svg.value.append('text')
    .attr('x', (width + margin.left + margin.right) / 2)
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .attr('fill', '#2c3e50')
    .text(props.chartTitle)
}

/**
 * 初始化並啟動物理動畫
 * 從舊版本到新版本依序發射頭像
 */
function startPhysicsAnimation(): void {
  if (!chartDimensions || avatarElements.value.size === 0) return

  animationPhase.value = 'animating'

  // 初始化物理引擎
  physics.initEngine()

  const { centerX, avatarSize, rowHeight } = chartDimensions
  const avatarRadius = avatarSize / 2

  // 為每個版本行創建中軸牆壁（阻擋碰撞）
  const versionKeys = Object.keys(props.voteData)
  const versionKeysReversed = [...versionKeys].reverse()

  // 不需要左右邊界牆，avatar 從屏幕外滑入後會撞到中軸牆停下來

  versionKeysReversed.forEach((versionKey) => {
    const yPos = (yScale.value(versionKey) || 0) + rowHeight / 2
    // 中軸牆壁（細長條形，高度等於行高）
    physics.addWall(centerX, yPos, 30, rowHeight * 0.8, 0.5)
  })

  // 收集所有物體配置，按版本順序組織
  const bodiesByVersion: Map<string, BodyConfig[]> = new Map()

  avatarElements.value.forEach((data, bodyId) => {
    // 使用 :: 分隔符解析 bodyId（格式：type::versionKey::index）
    const [type, versionKey, indexStr] = bodyId.split('::')
    const index = parseInt(indexStr)

    if (!bodiesByVersion.has(versionKey)) {
      bodiesByVersion.set(versionKey, [])
    }

    const direction = type === 'support' ? 'right' : 'left'
    const startX = direction === 'right'
      ? chartDimensions!.width + chartDimensions!.margin.right + 50 + index * 40
      : -chartDimensions!.margin.left - 50 - index * 40

    bodiesByVersion.get(versionKey)!.push({
      id: bodyId,
      x: startX,
      y: data.targetY,
      radius: avatarRadius,
      velocity: { x: direction === 'right' ? -10 : 10, y: 0 }
      // 不設定 collisionFilter，讓頭像互相碰撞以產生堆疊效果
    })
  })

  // 依照版本順序（從舊到新）添加物體
  const versions = versionOrderForAnimation.value
  let delayAccumulator = 0
  const versionDelay = 300  // 每個版本間隔 300ms

  versions.forEach((versionKey, versionIndex) => {
    const bodies = bodiesByVersion.get(versionKey) || []

    setTimeout(() => {
      // 添加該版本的所有物體
      bodies.forEach((config) => {
        physics.addBody(config)

        // 顯示對應的 D3 元素
        const avatarData = avatarElements.value.get(config.id)
        if (avatarData) {
          avatarData.element
            .transition()
            .duration(100)
            .style('opacity', 1)
        }
      })

      // 最後一個版本添加完成後，設置穩定回調
      if (versionIndex === versions.length - 1) {
        physics.onSettled(() => {
          animationPhase.value = 'settled'
          stopAnimation()

          // 恢復靜態排版
          restoreStaticLayout()

          // 檢查是否需要觸發煙火
          triggerFireworksForLatestVersion()
        })
      }
    }, delayAccumulator)

    delayAccumulator += versionDelay
  })

  // 啟動物理引擎
  physics.start()

  // 啟動動畫循環
  startAnimationLoop()

  // === 動態超時安全機制 ===
  // 計算總投票數和版本數
  const versionCount = Object.keys(props.voteData).length
  const totalVotes = Object.values(props.voteData).reduce((sum, v) => {
    return sum + (v.support?.length || 0) + (v.oppose?.length || 0)
  }, 0)

  // 動態超時：基礎 2000ms + 每票 300ms + 每版本 500ms
  const dynamicTimeout = 2000 + (totalVotes * 300) + (versionCount * 500)

  setTimeout(() => {
    if (animationPhase.value === 'animating') {
      console.warn(`[VoteMajorityTsumTsumChart] Animation timeout after ${dynamicTimeout}ms, forcing settle`)
      animationPhase.value = 'settled'
      stopAnimation()
      restoreStaticLayout()
    }
  }, dynamicTimeout)
}

/**
 * 動畫循環：更新 D3 元素位置
 */
function startAnimationLoop(): void {
  const updateFrame = () => {
    if (animationPhase.value !== 'animating') return

    const avatarRadius = (chartDimensions?.avatarSize || 32) / 2

    // 更新每個 D3 元素的位置
    avatarElements.value.forEach((data, bodyId) => {
      const pos = physics.getPosition(bodyId)
      if (pos) {
        data.element.attr('transform', `translate(${pos.x - avatarRadius}, ${pos.y - avatarRadius})`)
      }
    })

    animationFrameId = requestAnimationFrame(updateFrame)
  }

  animationFrameId = requestAnimationFrame(updateFrame)
}

/**
 * 停止動畫循環
 */
function stopAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

/**
 * 恢復靜態排版：將所有 avatar 平滑移動到目標位置
 */
function restoreStaticLayout(): void {
  if (!chartDimensions) return

  const avatarRadius = chartDimensions.avatarSize / 2

  avatarElements.value.forEach((data) => {
    data.element
      .transition()
      .duration(300)
      .ease(d3.easeCubicOut)
      .attr('transform', `translate(${data.targetX - avatarRadius}, ${data.targetY - avatarRadius})`)
  })
}

/**
 * 最新版本投票通過時觸發煙火
 */
function triggerFireworksForLatestVersion(): void {
  if (!chartDimensions) return

  const versionKeys = Object.keys(props.voteData)
  const latestVersionIndex = versionKeys.length - 1
  const latestVersionKey = versionKeys[latestVersionIndex]

  // 檢查最新版本是否通過（votingResult === 'agree'）
  const votingResult = props.versionVotingResults[latestVersionIndex]

  if (votingResult === 'agree') {
    const { centerX, rowHeight } = chartDimensions
    const yPos = (yScale.value(latestVersionKey) || 0) + rowHeight / 2

    launchFireworks(centerX, yPos)
  }
}

function drawHorizontalBar(
  voters: Voter[],
  xScaleFunc: any,
  yPos: number,
  avatarSize: number,
  type: string,
  direction: 'left' | 'right',
  versionKey: string
): void {
  const borderColor = type === 'support' ? '#67c23a' : '#800000'
  const avatarRadius = avatarSize / 2

  voters.forEach((voter, index) => {
    // 計算最終目標 X 坐標（對齊刻度）
    let targetX: number
    if (direction === 'right') {
      // 支持票：第1票在刻度1，第2票在刻度2...
      targetX = xScaleFunc(index + 1)
    } else {
      // 反對票：第1票在刻度-1，第2票在刻度-2...
      targetX = xScaleFunc(-(index + 1))
    }

    // 計算起始位置（螢幕外）
    const startX = direction === 'right'
      ? chartDimensions!.width + chartDimensions!.margin.right + 50 + index * 40
      : -chartDimensions!.margin.left - 50 - index * 40

    const y = yPos + avatarRadius  // 垂直居中

    // 創建 avatar 元素（初始位置在螢幕外）
    const avatarGroup = g.value.append('g')
      .attr('class', 'vote-avatar-group physics-avatar')
      .attr('data-id', `${type}::${versionKey}::${index}`)
      .attr('transform', `translate(${startX - avatarRadius}, ${y - avatarRadius})`)
      .style('cursor', 'pointer')
      .style('opacity', 0)

    // Avatar 圓形背景
    avatarGroup.append('circle')
      .attr('cx', avatarRadius)
      .attr('cy', avatarRadius)
      .attr('r', avatarRadius)
      .attr('fill', '#fff')
      .attr('stroke', borderColor)
      .attr('stroke-width', 2)

    // Avatar 圖片
    const avatarUrl = getVoterAvatarUrl(voter)
    avatarGroup.append('image')
      .attr('xlink:href', avatarUrl)
      .attr('x', 2)
      .attr('y', 2)
      .attr('width', avatarSize - 4)
      .attr('height', avatarSize - 4)
      .attr('clip-path', `circle(${avatarRadius - 2}px at 50% 50%)`)

    // 存儲元素引用和目標位置
    // 使用 :: 作為分隔符，避免與 UUID 中的 - 衝突
    const bodyId = `${type}::${versionKey}::${index}`
    avatarElements.value.set(bodyId, {
      element: avatarGroup,
      targetX,
      targetY: y,
      voter,
      type
    })

    // Hover 效果（在動畫穩定後啟用）
    avatarGroup
      .on('mouseenter', (event: MouseEvent) => {
        if (animationPhase.value !== 'settled') return
        const currentTransform = avatarGroup.attr('transform')
        avatarGroup
          .transition().duration(200)
          .attr('transform', currentTransform + ' scale(1.15)')
        showTooltip(event, voter, type)
      })
      .on('mouseleave', () => {
        if (animationPhase.value !== 'settled') return
        // 使用存儲的目標位置而非物理引擎位置（因為 restoreStaticLayout 已移到目標位置）
        avatarGroup
          .transition().duration(200)
          .attr('transform', `translate(${targetX - avatarRadius}, ${y - avatarRadius})`)
        hideTooltip()
      })
  })
}

function launchFireworks(centerX: number, centerY: number): void {
  // Emoji 煙火動畫（從0軸中心炸開）
  const emojis = ['🎉', '✨', '🎊', '⭐', '💫', '🌟', '🎆', '🎇']
  const numFireworks = 8

  // 隨機選擇 emoji
  const selectedEmojis = Array.from({ length: numFireworks }, () =>
    emojis[Math.floor(Math.random() * emojis.length)]
  )

  selectedEmojis.forEach((emoji, i) => {
    // 計算飛散方向（360度均勻分布）
    const angle = (i / numFireworks) * 2 * Math.PI
    const distance = 50 + Math.random() * 30
    const endX = centerX + Math.cos(angle) * distance
    const endY = centerY + Math.sin(angle) * distance

    // 創建 emoji text element
    const firework = g.value.append('text')
      .attr('x', centerX)
      .attr('y', centerY)
      .attr('text-anchor', 'middle')
      .attr('font-size', '0px')
      .text(emoji)
      .style('opacity', 1)
      .style('pointer-events', 'none')

    // 動畫：位置移動 + 大小變化 + 透明度變化
    firework
      .transition()
      .duration(300)
      .attr('font-size', '24px')
      .attr('x', endX)
      .attr('y', endY)
      .transition()
      .duration(500)
      .attr('font-size', '32px')
      .style('opacity', 0.8)
      .transition()
      .duration(700)
      .attr('font-size', '16px')
      .style('opacity', 0)
      .remove()
  })

  // 背景高亮（圓形脈衝）
  g.value.insert('circle', ':first-child')
    .attr('cx', centerX)
    .attr('cy', centerY)
    .attr('r', 20)
    .attr('fill', '#67c23a')
    .attr('opacity', 0)
    .transition()
    .duration(300)
    .attr('r', 40)
    .attr('opacity', 0.3)
    .transition()
    .duration(1500)
    .attr('r', 60)
    .attr('opacity', 0)
    .remove()
}

function renderLegend(width: number, height: number, margin: any): void {
  const legendY = height + margin.bottom - 20
  const legendX = width / 2 - 60

  // 反對圖例（左側）
  svg.value.append('circle')
    .attr('cx', legendX + margin.left)
    .attr('cy', legendY + margin.top)
    .attr('r', 6)
    .attr('fill', 'none')
    .attr('stroke', '#800000')
    .attr('stroke-width', 2)

  svg.value.append('text')
    .attr('x', legendX + margin.left + 12)
    .attr('y', legendY + margin.top + 4)
    .text('反對')
    .attr('font-size', '12px')

  // 支持圖例（右側）
  svg.value.append('circle')
    .attr('cx', legendX + margin.left + 60)
    .attr('cy', legendY + margin.top)
    .attr('r', 6)
    .attr('fill', 'none')
    .attr('stroke', '#67c23a')
    .attr('stroke-width', 2)

  svg.value.append('text')
    .attr('x', legendX + margin.left + 72)
    .attr('y', legendY + margin.top + 4)
    .text('支持')
    .attr('font-size', '12px')
}

function showTooltip(event: any, voter: Voter, type: string): void {
  cleanupTooltips()

  const container = chartContainer.value
  const voteTypeText = type === 'support' ? '✓ 贊成' : '✗ 反對'
  const voteTypeColor = type === 'support' ? '#67c23a' : '#800000'

  // 創建 tooltip selection（不包含 transition）
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'vote-tooltip')
    .style('position', 'fixed')
    .style('background', 'rgba(0, 0, 0, 0.85)')
    .style('color', 'white')
    .style('padding', '8px 12px')
    .style('border-radius', '6px')
    .style('font-size', '13px')
    .style('pointer-events', 'none')
    .style('z-index', '10000')
    .html(`
      <div style="font-weight: bold; margin-bottom: 4px;">
        ${voter.voterDisplayName || voter.voterEmail?.split('@')[0] || '未知用戶'}
      </div>
      <div style="color: ${voteTypeColor};">${voteTypeText}</div>
      <div style="font-size: 11px; color: #ccc; margin-top: 4px;">
        ${formatDateTime(voter.timestamp)}
      </div>
    `)
    .style('left', (event.pageX + 10) + 'px')
    .style('top', (event.pageY - 10) + 'px')
    .style('opacity', 0)

  // 保存 selection（不是 transition）
  currentTooltip.value = tooltip

  // 單獨執行 transition
  tooltip
    .transition()
    .duration(200)
    .style('opacity', 1)
}

function hideTooltip(): void {
  if (currentTooltip.value) {
    try {
      const tooltipNode = currentTooltip.value.node()

      // 檢查DOM節點是否存在
      if (tooltipNode && tooltipNode.parentNode) {
        // 停止任何正在進行的 transition
        currentTooltip.value.interrupt()

        // 開始新的 fade out transition
        currentTooltip.value
          .transition()
          .duration(200)
          .style('opacity', 0)
          .remove()
      }
    } catch {
      // 如果出錯，直接清理
      d3.selectAll('.vote-tooltip').remove()
    }

    currentTooltip.value = null
  }
}

function cleanupTooltips(): void {
  d3.selectAll('.vote-tooltip').remove()
  currentTooltip.value = null
}

function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.vote-majority-tsumtsum-chart {
  width: 100%;
  min-height: 300px;
}

.chart-container {
  width: 100%;
  isolation: isolate; /* 建立獨立 stacking context，隔離 z-index */
}

/* X軸樣式 */
:deep(.x-axis) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

:deep(.x-axis path),
:deep(.x-axis line) {
  stroke: #666;
}
</style>
