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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import * as d3 from 'd3'
import { useAvatar } from '@/composables/useAvatar'
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

        // 繪製支持柱
        drawBar(support, supportX, avatarSize, 'support')

        // 繪製反對柱（如果有）
        if (hasOppose && oppose) {
          drawBar(oppose, opposeX ?? 0, avatarSize, 'oppose')
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

        // 檢查是否需要煙火（僅在最新版本的支持柱頂部發射）
        const isLatestVersion = (vIndex === versionKeys.length - 1)
        if (isLatestVersion) {
          checkAndLaunchFireworks(support, oppose || [], supportX, vIndex)
        }
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

function drawBar(voters: Voter[], centerX: number, avatarSize: number, type: string): void {
      const borderColor = type === 'support' ? '#67c23a' : '#800000'

      voters.forEach((voter, index) => {
        const y = yScale.value(index + 0.5) // 從下往上堆疊

        const avatarGroup = g.value.append('g')
          .attr('class', 'vote-avatar-group')
          .attr('transform', `translate(${centerX - avatarSize / 2}, ${y - avatarSize / 2})`)
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
              .attr('transform', `translate(${centerX - avatarSize / 2}, ${y - avatarSize / 2}) scale(1.15)`)

            showTooltip(event, voter, type)
          })
          .on('mouseleave', (event: any) => {
            d3.select(event.currentTarget)
              .transition().duration(200)
              .attr('transform', `translate(${centerX - avatarSize / 2}, ${y - avatarSize / 2}) scale(1)`)

            hideTooltip()
          })
      })
    }

function checkAndLaunchFireworks(support: Voter[], oppose: Voter[], centerX: number, versionIndex: number): void {
  // 完全依賴後端返回的 status，只有 approved 才放煙火
  if (props.versionStatuses && props.versionStatuses[versionIndex] === 'approved') {
    const topY = yScale.value(support.length) // 柱頂位置
    launchFireworks(centerX, topY)
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
