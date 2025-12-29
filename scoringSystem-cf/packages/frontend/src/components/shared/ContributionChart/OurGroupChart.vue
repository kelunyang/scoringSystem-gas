<template>
  <div class="our-group-chart-container">
    <h4 class="chart-title">
      <i class="fas fa-users"></i> {{ groupName }} - 組內個人點數分配
    </h4>
    <div
      ref="chartContainer"
      class="chart-canvas"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { Ref } from 'vue'
import * as d3 from 'd3'
import { useD3Chart } from '@/composables/useD3Chart'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useAvatar } from '@/composables/useAvatar'
import { useChargingAnimation, type ChargingUnit } from '@/composables/useChargingAnimation'
import EmptyState from '@/components/shared/EmptyState.vue'

export interface Member {
  email: string
  displayName?: string
  points: number
  contribution: number  // Percentage (0-100)
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: Record<string, any>
}

export interface Props {
  members: Member[]
  groupName?: string
  totalPoints?: number | null
  rank?: number | null
  totalPercentage?: number
}

const props = withDefaults(defineProps<Props>(), {
  groupName: '我們組',
  totalPoints: null,
  rank: null,
  totalPercentage: 0
})

const { createTooltip, clearContainer, getContainerSize, debouncedRender } = useD3Chart()
const { getRankColor } = usePointCalculation()
const { generateMemberAvatarUrl } = useAvatar()
const charging = useChargingAnimation()

const chartContainer: Ref<HTMLElement | null> = ref(null)

// 存儲充能層元素引用（按位置索引，每個方塊一個）
let chargedElements: SVGRectElement[] = []

// Watch for prop changes - reset charging animation on data change
watch(() => props.members, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
}, { deep: true })

watch(() => props.rank, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
})

onMounted(() => {
  nextTick(() => {
    renderChart()
    // 設置視口觸發
    charging.setupViewportTrigger(chartContainer)
  })
})

function renderChart(): void {
      if (!chartContainer.value) return

      // 清空現有圖表
      clearContainer(chartContainer.value)

      // 驗證數據
      if (!props.members || props.members.length === 0) {
        clearContainer(chartContainer.value)
        const emptyState = document.createElement('div')
        emptyState.innerHTML = `
          <div class="empty-state compact type-info">
            <div class="empty-state-icon"><i class="fas fa-users-slash"></i></div>
            <p class="empty-state-title compact-title">沒有選中的成員</p>
          </div>
        `
        chartContainer.value.appendChild(emptyState)
        return
      }

      // Use pre-calculated member data directly (no calculation needed)
      const ourGroupData = props.members.map(member => ({
        email: member.email,
        displayName: member.displayName || member.email,
        points: member.points || 0,
        participationRatio: member.contribution || 0,  // Percentage (0-100)
        finalWeight: (member.contribution || 0) / 5,  // Convert to weight units (divide by 5% base)
        avatarSeed: member.avatarSeed,
        avatarStyle: member.avatarStyle,
        avatarOptions: member.avatarOptions
      }))

      if (ourGroupData.length === 0) {
        clearContainer(chartContainer.value)
        const emptyState = document.createElement('div')
        emptyState.innerHTML = `
          <div class="empty-state compact type-info">
            <div class="empty-state-icon"><i class="fas fa-chart-pie"></i></div>
            <p class="empty-state-title compact-title">無法顯示點數分配</p>
          </div>
        `
        chartContainer.value.appendChild(emptyState)
        return
      }

      // 設置圖表尺寸
      const { width } = getContainerSize(chartContainer.value, 600, 150)
      const height = 150
      const margin = { top: 20, right: 40, bottom: 60, left: 40 }

      // 創建 tooltip
      const tooltip = createTooltip()

      // 創建SVG
      const svg = d3.select(chartContainer.value)
        .append('svg')
        .attr('width', width)
        .attr('height', height)

      // 創建個人權重方塊 (stack bar)
      const blocks: Array<{ person: any; position: number; blockIndex: number; totalBlocks: number }> = []
      let blockPos = 0

      ourGroupData.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        for (let i = 0; i < numBlocks; i++) {
          blocks.push({
            person: person,
            position: blockPos++,
            blockIndex: i,
            totalBlocks: numBlocks
          })
        }
      })

      const totalBlocks = blocks.length
      const availableWidth = width - margin.left - margin.right
      const blockSize = availableWidth / totalBlocks
      const startX = margin.left
      const blockHeight = 40
      const startY = 50

      // 優先使用從父組件傳遞的 totalPercentage
      // 如果沒有傳遞，則從成員數據計算
      const calculatedTotalPercentage = props.totalPercentage > 0
        ? props.totalPercentage
        : ourGroupData.reduce((sum, p) => sum + p.participationRatio, 0)

      // 檢查分工比例是否正確（必須正好等於100%）
      const isInvalid = Math.abs(calculatedTotalPercentage - 100) > 0.01  // Allow 0.01 tolerance for floating point

      // 使用組的顏色，如果分工比例不是100%則使用紅色
      const ourGroupColor = isInvalid ? '#f56c6c' : (props.rank ? getRankColor(props.rank) : '#8FD460')

      // 如果分工比例不是100%，添加警告文字
      if (isInvalid) {
        const warningText = calculatedTotalPercentage > 100
          ? `⚠️ 超過100% (${calculatedTotalPercentage.toFixed(1)}%)，請更正分工比例`
          : `⚠️ 分工比例低於100% (${calculatedTotalPercentage.toFixed(1)}%)，請修正`

        svg.append('text')
          .attr('x', width / 2)
          .attr('y', startY - 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('font-weight', 'bold')
          .attr('fill', '#f56c6c')
          .text(warningText)
      }

      // 清空充能元素引用
      chargedElements = []

      // 1. 繪製底座層（淡色，始終可見）
      svg.selectAll('.weight-block-base')
        .data(blocks)
        .enter()
        .append('rect')
        .attr('class', 'weight-block-base')
        .attr('x', d => startX + d.position * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', ourGroupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('rx', 2)
        .style('opacity', 0.5)

      // 2. 繪製充能層（初始不可見，動畫時逐個人點亮）
      const blockElements = svg.selectAll('.weight-block')
        .data(blocks)
        .enter()
        .append('g')
        .attr('class', 'weight-block')

      blockElements.append('rect')
        .attr('x', d => startX + d.position * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', ourGroupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('rx', 2)
        .style('opacity', 0)  // 初始不可見，由充能動畫控制
        .each(function() {
          // 收集每個方塊的充能層元素（按位置順序）
          chargedElements.push(this as SVGRectElement)
        })
        .on('mouseover', (event, d) => {
          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.person.displayName}</strong><br/>
                   參與比例: ${d.person.participationRatio.toFixed(0)}%<br/>
                   最終權重: ${d.person.finalWeight.toFixed(1)}<br/>
                   預期得分: ${d.person.points.toFixed(2)}點`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', () => tooltip.style('opacity', 0))

      // 繪製每個人的黑色虛線邊框
      let personPos = 0
      ourGroupData.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        if (numBlocks > 0) {
          // 個人邊框（黑色虛線）
          svg.append('rect')
            .attr('x', startX + personPos * blockSize - 1)
            .attr('y', startY - 2)
            .attr('width', numBlocks * blockSize + 1)
            .attr('height', blockHeight + 4)
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3,2')
            .attr('rx', 2)

          // 個人 Avatar + Badge（上方）
          const centerX = startX + personPos * blockSize + (numBlocks * blockSize) / 2
          const avatarSize = 36
          const avatarUrl = generateMemberAvatarUrl(person)

          const foreignObj = svg.append('foreignObject')
            .attr('x', centerX - avatarSize / 2)
            .attr('y', startY - avatarSize - 12)
            .attr('width', avatarSize)
            .attr('height', avatarSize)

          foreignObj.append('xhtml:div')
            .style('position', 'relative')
            .style('width', '100%')
            .style('height', '100%')
            .html(`
              <div style="position: relative; width: 100%; height: 100%;">
                <img src="${avatarUrl}"
                     alt="${person.displayName}"
                     style="width: 100%; height: 100%; border-radius: 4px; border: 2px solid #333; object-fit: cover;">
                <span style="position: absolute; bottom: -4px; right: -4px;
                             background: #f56c6c; color: white;
                             font-size: 10px; font-weight: bold;
                             padding: 2px 5px; border-radius: 10px;
                             border: 2px solid white;
                             box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                  ${Math.round(person.points)}
                </span>
              </div>
            `)

          personPos += numBlocks
        }
      })

      // 添加總計信息
      const totalPoints = ourGroupData.reduce((sum, p) => sum + p.points, 0)
      const totalWeight = ourGroupData.reduce((sum, p) => sum + p.finalWeight, 0)
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text(`${props.groupName}: ${Math.round(totalPoints)}點 | 總權重: ${Math.round(totalWeight)}`)

      // 配置充能動畫（按個人充能）
      setupChargingAnimation(ourGroupData, startX, startY, blockSize, blockHeight)
    }

/**
 * 設置充能動畫
 * 每個方塊作為一個充能單位，從左到右逐一點亮
 */
function setupChargingAnimation(
  ourGroupData: Array<{ finalWeight: number }>,
  startX: number,
  startY: number,
  blockSize: number,
  blockHeight: number
) {
  // 每個方塊作為一個充能單位
  const chargingUnits: ChargingUnit[] = chargedElements.map((element, index) => ({
    id: `block-${index}`,
    elements: [element],
    endX: startX + (index + 1) * blockSize
  }))

  // 獲取 SVG 元素
  const svgElement = chartContainer.value?.querySelector('svg') as SVGSVGElement | null

  // 配置充能動畫
  if (chargingUnits.length > 0 && svgElement) {
    charging.configure(
      chargingUnits,
      startY + blockHeight / 2,
      blockHeight,
      svgElement,
      startX,
      blockSize
    )
  }
}
</script>

<style scoped>
.our-group-chart-container {
  margin-bottom: 20px;
}

.chart-title {
  margin: 10px 0;
  color: #2c3e50;
  font-size: 14px;
  font-weight: 600;
}

.chart-title i {
  margin-right: 8px;
  color: #409eff;
}

.chart-canvas {
  min-height: 180px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  background: #fafafa;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 180px;
  color: #999;
  font-size: 14px;
}
</style>

<style>
/* 充能彈跳動畫 - 全局樣式（SVG 元素需要） */
@keyframes charging-bounce {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
  50% { transform: translateY(-4px); }
  70% { transform: translateY(-2px); }
}
</style>
