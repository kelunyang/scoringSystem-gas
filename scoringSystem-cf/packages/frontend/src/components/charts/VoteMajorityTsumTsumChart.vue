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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import * as d3 from 'd3'
import { useAvatar } from '@/composables/useAvatar'
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

interface Props {
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

watch(() => props.voteData, () => {
  if (hasData.value) {
    nextTick(() => {
      renderChart()
    })
  }
}, { deep: true })

onMounted(() => {
  if (hasData.value) {
    nextTick(() => {
      renderChart()
    })
  }
})

onBeforeUnmount(() => {
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
  versionKeysReversed.forEach((versionKey, reversedIndex) => {
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
  versionKeysReversed.forEach((versionKey, reversedIndex) => {
    const originalIndex = versionKeys.indexOf(versionKey)
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
      drawHorizontalBar(support, xScale.value, yPos, avatarSize, 'support', 'right')
    }

    // 繪製反對票（向左）
    if (oppose && oppose.length > 0) {
      drawHorizontalBar(oppose, xScale.value, yPos, avatarSize, 'oppose', 'left')
    }

    // 檢查是否需要煙火（僅在最新版本）
    if (reversedIndex === 0) { // 最新版本在最上方
      checkAndLaunchFireworks(support, oppose || [], centerX, yPos + rowHeight / 2, originalIndex)
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

function drawHorizontalBar(
  voters: Voter[],
  xScaleFunc: any,
  yPos: number,
  avatarSize: number,
  type: string,
  direction: 'left' | 'right'
): void {
  const borderColor = type === 'support' ? '#67c23a' : '#800000'

  voters.forEach((voter, index) => {
    // 計算X坐標（對齊刻度）
    let x: number
    if (direction === 'right') {
      // 支持票：第1票在刻度1，第2票在刻度2...
      x = xScaleFunc(index + 1) - avatarSize / 2
    } else {
      // 反對票：第1票在刻度-1，第2票在刻度-2...
      x = xScaleFunc(-(index + 1)) - avatarSize / 2
    }

    const y = yPos + avatarSize / 2 // 垂直居中

    const avatarGroup = g.value.append('g')
      .attr('class', 'vote-avatar-group')
      .attr('transform', `translate(${x}, ${y - avatarSize / 2})`)
      .style('cursor', 'pointer')

    // Avatar 圓形背景
    avatarGroup.append('circle')
      .attr('cx', avatarSize / 2)
      .attr('cy', avatarSize / 2)
      .attr('r', avatarSize / 2)
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
      .attr('clip-path', 'circle(14px at 50% 50%)')

    // Hover 效果
    avatarGroup
      .on('mouseenter', (event: any) => {
        d3.select(event.currentTarget)
          .transition().duration(200)
          .attr('transform', `translate(${x}, ${y - avatarSize / 2}) scale(1.15)`)

        showTooltip(event, voter, type)
      })
      .on('mouseleave', (event: any) => {
        d3.select(event.currentTarget)
          .transition().duration(200)
          .attr('transform', `translate(${x}, ${y - avatarSize / 2}) scale(1)`)

        hideTooltip()
      })
  })
}

function checkAndLaunchFireworks(
  support: Voter[],
  oppose: Voter[],
  centerX: number,
  centerY: number,
  versionIndex: number
): void {
  // 條件: 最新版本 + 多數決通過 (votingResult === 'agree')
  const votingResult = props.versionVotingResults[versionIndex]

  if (votingResult === 'agree') {
    launchFireworks(centerX, centerY)
  }
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
.vote-majority-tsumtsum-chart {
  width: 100%;
  min-height: 300px;
}

.chart-container {
  width: 100%;
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
