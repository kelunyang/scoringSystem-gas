<template>
  <div class="vote-trend-tsumtsum-chart">
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

interface Props {
  voteData: VoteData
  versionLabels: string[]
  versionStatuses?: string[]
  consensusThreshold?: number
  currentUserEmail?: string
  chartTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  versionStatuses: () => [],
  consensusThreshold: 0,
  currentUserEmail: '',
  chartTitle: '投票趨勢'
})

const { getVoterAvatarUrl } = useAvatar()

const chartContainer: Ref<HTMLElement | null> = ref(null)

// 視域偵測（進入視域時才啟動動畫）
const { hasEntered } = useInViewport(chartContainer, { once: true })

const svg: Ref<any> = ref(null)
const g: Ref<any> = ref(null)
const yScale: Ref<any> = ref(null)
const currentTooltip: Ref<any> = ref(null)

const hasData: ComputedRef<boolean> = computed(() => {
  return Object.keys(props.voteData).length > 0
})

const hasOpposeVotes: ComputedRef<boolean> = computed(() => {
  return Object.values(props.voteData).some(v => v.oppose && v.oppose.length > 0)
})

// 物理動畫狀態（俄羅斯方塊墜落效果）
const physics = usePhysicsAnimation({
  gravity: { x: 0, y: 1 },  // 垂直重力（向下墜落）
  restitution: 0.4,  // 較低彈性，快速穩定
  friction: 0.3,
  frictionAir: 0.05,
  velocityThreshold: 0.3,
  settleDelay: 100
})

// 追蹤動畫進度
const animationPhase = ref<'idle' | 'animating' | 'settled'>('idle')
const avatarElements = ref<Map<string, any>>(new Map())  // 存儲 D3 avatar 元素
let animationFrameId: number | null = null
let chartDimensions: {
  margin: any
  width: number
  height: number
  avatarSize: number
  columnCenters: Map<string, { supportX: number; opposeX: number | null }>
} | null = null

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
      // 延遲等待 DOM 更新穩定
      setTimeout(() => {
        if (chartContainer.value && chartContainer.value.offsetWidth > 0) {
          renderChart()
          setTimeout(() => {
            startPhysicsAnimation()
          }, 150)
        }
      }, 200)
    })
  }
}, { deep: true })

// 進入視域時才啟動渲染和動畫（只播一次）
// 注意：當元素被 v-if 掛載時，可能立即觸發 hasEntered
// 需要等待 DOM 穩定後再初始化，避免容器尺寸為 0
watch(hasEntered, (entered) => {
  if (entered && hasData.value && animationPhase.value === 'idle') {
    nextTick(() => {
      // 延遲等待容器尺寸穩定（v-if 切換時需要更長時間）
      setTimeout(() => {
        // 確認容器有有效尺寸才渲染
        if (chartContainer.value && chartContainer.value.offsetWidth > 0) {
          renderChart()
          // 再延遲後開始物理動畫
          setTimeout(() => {
            startPhysicsAnimation()
          }, 150)
        } else {
          console.warn('[VoteTrendTsumTsumChart] Container not ready, skipping animation')
        }
      }, 200)
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
      const margin = { top: 40, right: 80, bottom: 80, left: 50 }
      const width = container.offsetWidth - margin.left - margin.right
      const height = 300 - margin.top - margin.bottom

      // 創建SVG
      svg.value = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)

      g.value = svg.value.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // 計算版本數和最大高度
      const versionKeys = Object.keys(props.voteData)
      let maxVotes = props.consensusThreshold > 0 ? props.consensusThreshold : 0

      versionKeys.forEach(key => {
        const { support, oppose } = props.voteData[key]
        maxVotes = Math.max(maxVotes, support.length, oppose?.length || 0)
      })

      // X軸：按版本數分配（每個版本一個band）
      const xScale = d3.scaleBand()
        .domain(d3.range(versionKeys.length).map(String))
        .range([0, width])
        .padding(0.4) // 版本之間的間距

      // Y軸：從下往上
      yScale.value = d3.scaleLinear()
        .domain([0, maxVotes + 1])
        .range([height, 0])

      const avatarSize = 32

      // 初始化 chartDimensions（稍後存儲每個版本的柱子中心位置）
      chartDimensions = {
        margin,
        width,
        height,
        avatarSize,
        columnCenters: new Map()
      }

      // 繪製Y軸
      const yAxis = d3.axisLeft(yScale.value)
        .tickValues(d3.range(0, maxVotes + 1, 1))
        .tickFormat((d) => d3.format('d')(d as number))

      g.value.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('font-size', '11px')

      // Y軸標籤
      g.value.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 10)
        .attr('x', -height / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#666')
        .text('投票數')

      // 繪製X軸線（底部）
      g.value.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', height)
        .attr('y2', height)
        .attr('stroke', '#666')
        .attr('stroke-width', 2)

      // 繪製柱子
      versionKeys.forEach((versionKey, vIndex) => {
        const { support, oppose } = props.voteData[versionKey]
        const label = props.versionLabels[vIndex]

        // 取得此版本的 band 位置和寬度
        const versionBandStart = xScale(String(vIndex)) ?? 0
        const versionBandwidth = xScale.bandwidth()
        const versionCenter = versionBandStart + versionBandwidth / 2

        // 計算支持和反對柱的位置（在版本band內分組）
        let supportX, opposeX
        const hasOppose = oppose && oppose.length > 0

        if (hasOppose) {
          // 有反對票：兩根bar緊靠在一起，整體在版本區域內置中
          const barWidth = avatarSize // 每根bar的寬度等於頭像大小
          const barGap = 8 // 兩根bar之間的小間隙（固定8px）
          const totalWidth = barWidth * 2 + barGap // 兩根bar的總寬度

          // 將兩根bar作為整體置中
          const groupStart = versionCenter - totalWidth / 2
          supportX = groupStart + barWidth / 2 // 支持柱中心
          opposeX = groupStart + barWidth + barGap + barWidth / 2 // 反對柱中心
        } else {
          // 只有支持票：柱子置中
          supportX = versionCenter
          opposeX = null
        }

        // 存儲柱子中心位置（供物理動畫使用）
        chartDimensions!.columnCenters.set(versionKey, { supportX, opposeX })

        // 繪製支持柱
        drawBar(support, supportX, avatarSize, 'support', versionKey)

        // 繪製反對柱（如果有）
        if (hasOppose && oppose) {
          drawBar(oppose, opposeX ?? 0, avatarSize, 'oppose', versionKey)
        }

        // 版本標籤居中顯示（在版本band的中心）
        const labelX = versionCenter

        g.value.append('text')
          .attr('x', labelX)
          .attr('y', height + 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .attr('fill', '#333')
          .text(label)

        // 票數統計
        const voteCountText = hasOppose
          ? `${support.length}支持 / ${oppose.length}反對`
          : `${support.length}票`

        g.value.append('text')
          .attr('x', labelX)
          .attr('y', height + 38)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('fill', '#909399')
          .text(voteCountText)

        // 煙火效果將在動畫穩定後觸發（見 triggerFireworksForLatestVersion）
      })

      // 繪製共識線（如果需要）
      if (props.consensusThreshold > 0) {
        const consensusY = yScale.value(props.consensusThreshold)

        g.value.append('line')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', consensusY)
          .attr('y2', consensusY)
          .attr('stroke', '#e6a23c')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5')

        g.value.append('text')
          .attr('x', width + 5)
          .attr('y', consensusY - 5)
          .attr('font-size', '12px')
          .attr('fill', '#e6a23c')
          .attr('font-weight', 'bold')
          .text(`共識門檻 ${props.consensusThreshold}票`)
      }

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

function drawBar(voters: Voter[], centerX: number, avatarSize: number, type: string, versionKey: string): void {
  const borderColor = type === 'support' ? '#67c23a' : '#800000'
  const avatarRadius = avatarSize / 2

  voters.forEach((voter, index) => {
    // 計算最終目標位置（堆疊後的位置）
    const targetY = yScale.value(index + 0.5)

    // 初始位置：從圖表上方開始（螢幕外）
    const startY = -(chartDimensions?.margin.top || 40) - (index * 20) - 50

    const avatarGroup = g.value.append('g')
      .attr('class', 'vote-avatar-group physics-avatar')
      .attr('data-id', `${type}::${versionKey}::${index}`)
      .attr('transform', `translate(${centerX - avatarRadius}, ${startY - avatarRadius})`)
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
      targetX: centerX,
      targetY,
      stackIndex: index,
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
          .attr('transform', `translate(${centerX - avatarRadius}, ${targetY - avatarRadius})`)
        hideTooltip()
      })
  })
}

/**
 * 初始化並啟動物理動畫
 * 俄羅斯方塊式墜落效果：從舊版本到新版本依序墜落
 */
function startPhysicsAnimation(): void {
  if (!chartDimensions || avatarElements.value.size === 0) return

  animationPhase.value = 'animating'

  // 初始化物理引擎
  physics.initEngine()

  const { height, avatarSize } = chartDimensions
  const avatarRadius = avatarSize / 2

  // 為每個柱子創建底部地板（不需要左右邊界牆，avatar 直接垂直墜落）
  chartDimensions.columnCenters.forEach(({ supportX, opposeX }) => {
    // 支持柱地板
    physics.addWall(supportX, height + 5, avatarSize + 20, 10, 0.3)

    // 反對柱地板（如果存在）
    if (opposeX !== null) {
      physics.addWall(opposeX, height + 5, avatarSize + 20, 10, 0.3)
    }
  })

  // 收集所有物體配置，按版本順序組織
  const bodiesByVersion: Map<string, BodyConfig[]> = new Map()

  avatarElements.value.forEach((data, bodyId) => {
    // 使用 :: 分隔符解析 bodyId（格式：type::versionKey::index）
    const [, versionKey, indexStr] = bodyId.split('::')
    const index = parseInt(indexStr)

    if (!bodiesByVersion.has(versionKey)) {
      bodiesByVersion.set(versionKey, [])
    }

    // 從上方不同高度開始墜落（錯開避免重疊）
    const startY = -(chartDimensions!.margin.top) - 50 - index * 25

    bodiesByVersion.get(versionKey)!.push({
      id: bodyId,
      x: data.targetX,
      y: startY,
      radius: avatarRadius,
      // 給予初始向下速度，避免物理引擎誤判為已穩定而提前停止
      velocity: { x: 0, y: 2 }
      // 不設定 collisionFilter，讓頭像互相碰撞以產生俄羅斯方塊堆疊效果
    })
  })

  // 依照版本順序（從舊到新）添加物體
  const versions = versionOrderForAnimation.value
  let delayAccumulator = 0
  const versionDelay = 400  // 每個版本間隔 400ms（較長以看清墜落效果）

  versions.forEach((versionKey, versionIndex) => {
    const bodies = bodiesByVersion.get(versionKey) || []

    setTimeout(() => {
      // 添加該版本的所有物體（依序稍微錯開）
      bodies.forEach((config, bodyIndex) => {
        setTimeout(() => {
          physics.addBody(config)

          // 顯示對應的 D3 元素
          const avatarData = avatarElements.value.get(config.id)
          if (avatarData) {
            avatarData.element
              .transition()
              .duration(100)
              .style('opacity', 1)
          }
        }, bodyIndex * 80)  // 每個頭像間隔 80ms 墜落
      })

      // 最後一個版本添加完成後，設置穩定回調
      if (versionIndex === versions.length - 1) {
        // 延遲足夠時間讓所有物體都被添加
        setTimeout(() => {
          physics.onSettled(() => {
            animationPhase.value = 'settled'
            stopAnimation()

            // 恢復靜態排版
            restoreStaticLayout()

            // 檢查是否需要觸發煙火
            triggerFireworksForLatestVersion()
          })
        }, bodies.length * 80 + 100)
      }
    }, delayAccumulator)

    delayAccumulator += versionDelay
  })

  // 啟動物理引擎
  physics.start()

  // 啟動動畫循環
  startAnimationLoop()

  // === 動態超時安全機制 ===
  // 計算版本數和最大投票數
  const versionCount = Object.keys(props.voteData).length
  const maxVotesPerVersion = Math.max(
    ...Object.values(props.voteData).map(v =>
      (v.support?.length || 0) + (v.oppose?.length || 0)
    ),
    1  // 避免空陣列時 Math.max 返回 -Infinity
  )

  // 動態超時：基礎 2000ms + 每版本 600ms + 每票 200ms
  const dynamicTimeout = 2000 + (versionCount * 600) + (maxVotesPerVersion * 200)

  setTimeout(() => {
    if (animationPhase.value === 'animating') {
      console.warn(`[VoteTrendTsumTsumChart] Animation timeout after ${dynamicTimeout}ms, forcing settle`)
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
 * 最新版本通過時觸發煙火
 */
function triggerFireworksForLatestVersion(): void {
  if (!chartDimensions) return

  const versionKeys = Object.keys(props.voteData)
  const latestVersionIndex = versionKeys.length - 1
  const latestVersionKey = versionKeys[latestVersionIndex]

  // 檢查最新版本是否通過（status === 'approved'）
  if (props.versionStatuses && props.versionStatuses[latestVersionIndex] === 'approved') {
    const columnCenter = chartDimensions.columnCenters.get(latestVersionKey)
    if (columnCenter) {
      const { support } = props.voteData[latestVersionKey]
      const topY = yScale.value(support.length)
      launchFireworks(columnCenter.supportX, topY)
    }
  }
}

function launchFireworks(centerX: number, startY: number): void {
      // Emoji 煙火動畫
      const emojis = ['🎉', '✨', '🎊', '⭐', '💫', '🌟', '🎆', '🎇']
      const numFireworks = 6

      // 隨機選擇 emoji
      const selectedEmojis = Array.from({ length: numFireworks }, () =>
        emojis[Math.floor(Math.random() * emojis.length)]
      )

      selectedEmojis.forEach((emoji, i) => {
        // 計算飛散方向（360度均勻分布）
        const angle = (i / numFireworks) * 2 * Math.PI
        const distance = 40 + Math.random() * 20
        const endX = centerX + Math.cos(angle) * distance
        const endY = startY + Math.sin(angle) * distance

        // 創建 emoji text element
        const firework = g.value.append('text')
          .attr('x', centerX)
          .attr('y', startY - 30)
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

      // 背景高亮
      g.value.insert('rect', ':first-child')
        .attr('x', centerX - 25)
        .attr('y', startY - 40)
        .attr('width', 50)
        .attr('height', 60)
        .attr('fill', '#67c23a')
        .attr('opacity', 0)
        .attr('rx', 8)
        .transition()
        .duration(300)
        .attr('opacity', 0.2)
        .transition()
        .duration(1500)
        .attr('opacity', 0)
        .remove()
    }

function renderLegend(width: number, height: number, margin: any): void {
      const legendY = height + margin.bottom - 20
      const legendX = width / 2 - 60

      // 支持圖例
      svg.value.append('circle')
        .attr('cx', legendX + margin.left)
        .attr('cy', legendY + margin.top)
        .attr('r', 6)
        .attr('fill', 'none')
        .attr('stroke', '#67c23a')
        .attr('stroke-width', 2)

      svg.value.append('text')
        .attr('x', legendX + margin.left + 12)
        .attr('y', legendY + margin.top + 4)
        .text('支持')
        .attr('font-size', '12px')

      // 反對圖例
      svg.value.append('circle')
        .attr('cx', legendX + margin.left + 60)
        .attr('cy', legendY + margin.top)
        .attr('r', 6)
        .attr('fill', 'none')
        .attr('stroke', '#800000')
        .attr('stroke-width', 2)

      svg.value.append('text')
        .attr('x', legendX + margin.left + 72)
        .attr('y', legendY + margin.top + 4)
        .text('反對')
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
        } catch (e) {
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
.vote-trend-tsumtsum-chart {
  width: 100%;
  min-height: 300px;
}

.chart-container {
  width: 100%;
  isolation: isolate; /* 建立獨立 stacking context，隔離 z-index */
}

.no-data {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 14px;
}

/* Y軸樣式 */
:deep(.y-axis) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

:deep(.y-axis path),
:deep(.y-axis line) {
  stroke: #666;
}
</style>
