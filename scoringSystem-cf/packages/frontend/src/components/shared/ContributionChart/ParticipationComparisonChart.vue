<template>
  <div class="participation-comparison-chart-container">
    <h4 class="chart-title">
      <i class="fas fa-code-compare"></i> 參與度分配變化視覺化
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
import { useAvatar } from '@/composables/useAvatar'
import EmptyState from '@/components/shared/EmptyState.vue'

interface ParticipationChange {
  email: string
  displayName: string
  oldPercent: number
  newPercent: number
  diff: number
}

interface GroupMember {
  userEmail?: string
  email?: string
  [key: string]: any
}

interface Props {
  participationChanges: ParticipationChange[]
  groupMembers?: GroupMember[]
}

const props = withDefaults(defineProps<Props>(), {
  participationChanges: () => [],
  groupMembers: () => []
})

const { createTooltip, clearContainer, getContainerSize, debouncedRender } = useD3Chart()
const { generateMemberAvatarUrl } = useAvatar()

const chartContainer: Ref<HTMLElement | null> = ref(null)

// Watch for prop changes
watch(() => props.participationChanges, () => {
  debouncedRender(() => renderChart())
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    renderChart()
  })
})

function getMemberInfo(email: string): GroupMember {
  const member = props.groupMembers.find(m => (m.userEmail || m.email) === email)
  return member || { email }
}

// 調色盤生成：為每個成員分配獨特顏色
function getMemberColor(index: number, total: number): string {
      const colors = [
        '#409eff', // 藍色
        '#67c23a', // 綠色
        '#e6a23c', // 橙色
        '#f56c6c', // 紅色
        '#909399', // 灰色
        '#c71585', // 紫紅
        '#20b2aa', // 青綠
        '#ff6347'  // 番茄紅
      ]
      return colors[index % colors.length]
    }

// 根據變化調整顏色亮度
function adjustColorBrightness(color: string, diff: number): string {
  if (diff > 0) {
    // 增加：變亮
    return d3.color(color)!.brighter(0.3).toString()
  } else if (diff < 0) {
    // 減少：變暗
    return d3.color(color)!.darker(0.3).toString()
  }
  // 不變：原色
  return color
}

function renderChart(): void {
  if (!chartContainer.value) return

  // 清空現有圖表
  clearContainer(chartContainer.value)

  // 驗證數據
  if (!props.participationChanges || props.participationChanges.length === 0) {
    clearContainer(chartContainer.value)
    const emptyState = document.createElement('div')
    emptyState.innerHTML = `
      <div class="empty-state compact type-info">
        <div class="empty-state-icon"><i class="fas fa-code-compare"></i></div>
        <p class="empty-state-title compact-title">沒有參與度變化數據</p>
      </div>
    `
    chartContainer.value.appendChild(emptyState)
    return
  }

  // 設置圖表尺寸
  const { width } = getContainerSize(chartContainer.value, 800, 350)
  const height = 350
  const margin = { top: 60, right: 40, bottom: 80, left: 100 }

  // 創建 tooltip
  const tooltip = createTooltip()

  // 創建SVG
  const svg = d3.select(chartContainer.value)
        .append('svg')
        .attr('width', width)
        .attr('height', height)

      const chartWidth = width - margin.left - margin.right
      const chartHeight = height - margin.top - margin.bottom

      // 創建主圖表組
      const chart = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // 數據處理：按 oldPercent 排序保持視覺順序一致
      const data = props.participationChanges.slice().sort((a, b) => b.oldPercent - a.oldPercent)

      // 為每個成員分配顏色
      const memberColors: Record<string, string> = {}
      data.forEach((d, i) => {
        memberColors[d.email] = getMemberColor(i, data.length)
      })

      // 構建堆疊數據結構
      const oldStackData: Array<any> = []
      const newStackData: Array<any> = []
      let oldX = 0
      let newX = 0

      data.forEach(d => {
        oldStackData.push({
          ...d,
          x0: oldX,
          x1: oldX + d.oldPercent,
          percent: d.oldPercent,
          version: 'old'
        })
        oldX += d.oldPercent

        newStackData.push({
          ...d,
          x0: newX,
          x1: newX + d.newPercent,
          percent: d.newPercent,
          version: 'new'
        })
        newX += d.newPercent
      })

      // X軸比例尺（0-100%）
      const xScale = d3.scaleLinear()
        .domain([0, 100])
        .range([0, chartWidth])

      // 條形圖高度
      const barHeight = 50
      const barGap = 60

      // 繪製舊版本堆疊條形圖
      const oldBars = chart.selectAll('.bar-old-segment')
        .data(oldStackData)
        .enter()
        .append('rect')
        .attr('class', 'bar-old-segment')
        .attr('x', d => xScale(d.x0))
        .attr('y', 0)
        .attr('width', d => xScale(d.x1) - xScale(d.x0))
        .attr('height', barHeight)
        .attr('fill', d => {
          const color = d3.color(memberColors[d.email])
          return color ? color.copy({opacity: 0.5}).toString() : '#cccccc'
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .on('mouseover', (event, d) => {
          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.displayName}</strong><br/>
                   舊版本: ${d.percent}%`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', () => tooltip.style('opacity', 0))

      // 繪製新版本堆疊條形圖（根據變化調整顏色亮度）
      const newBars = chart.selectAll('.bar-new-segment')
        .data(newStackData)
        .enter()
        .append('rect')
        .attr('class', 'bar-new-segment')
        .attr('x', d => xScale(d.x0))
        .attr('y', barGap)
        .attr('width', d => xScale(d.x1) - xScale(d.x0))
        .attr('height', barHeight)
        .attr('fill', d => adjustColorBrightness(memberColors[d.email], d.diff))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .on('mouseover', (event, d) => {
          const changeText = d.diff > 0 ? `↑ +${d.diff}%` : d.diff < 0 ? `↓ ${d.diff}%` : '持平'
          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.displayName}</strong><br/>
                   新版本: ${d.percent}%<br/>
                   變化: <strong>${changeText}</strong>`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', () => tooltip.style('opacity', 0))

      // 舊版本區塊標籤（頭像 + 名字 + 百分比）
      oldStackData.forEach(d => {
        const segmentWidth = xScale(d.x1) - xScale(d.x0)
        const centerX = xScale(d.x0) + segmentWidth / 2

        if (segmentWidth > 30) { // 只在寬度足夠時顯示
          const member = getMemberInfo(d.email)

          // 頭像
          if (segmentWidth > 60) {
            const avatarSize = 28
            const foreignObj = chart.append('foreignObject')
              .attr('x', centerX - avatarSize / 2)
              .attr('y', 11)
              .attr('width', avatarSize)
              .attr('height', avatarSize)

            foreignObj.append('xhtml:div')
              .style('width', '100%')
              .style('height', '100%')
              .html(`
                <img src="${generateMemberAvatarUrl(member as any)}"
                     alt="${d.displayName}"
                     style="width: 100%; height: 100%; border-radius: 4px; border: 2px solid white; object-fit: cover;">
              `)
          }

          // 百分比文字
          chart.append('text')
            .attr('x', centerX)
            .attr('y', barHeight / 2 + 3)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#fff')
            .attr('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
            .text(`${d.percent}%`)
        }
      })

      // 新版本區塊標籤（頭像 + 名字 + 百分比 + 變化標記）
      newStackData.forEach(d => {
        const segmentWidth = xScale(d.x1) - xScale(d.x0)
        const centerX = xScale(d.x0) + segmentWidth / 2

        if (segmentWidth > 30) {
          const member = getMemberInfo(d.email)

          // 頭像
          if (segmentWidth > 60) {
            const avatarSize = 28
            const foreignObj = chart.append('foreignObject')
              .attr('x', centerX - avatarSize / 2)
              .attr('y', barGap + 11)
              .attr('width', avatarSize)
              .attr('height', avatarSize)

            foreignObj.append('xhtml:div')
              .style('width', '100%')
              .style('height', '100%')
              .html(`
                <img src="${generateMemberAvatarUrl(member as any)}"
                     alt="${d.displayName}"
                     style="width: 100%; height: 100%; border-radius: 4px; border: 2px solid white; object-fit: cover;">
              `)
          }

          // 百分比 + 變化
          const changeIcon = d.diff > 0 ? '↑' : d.diff < 0 ? '↓' : ''
          chart.append('text')
            .attr('x', centerX)
            .attr('y', barGap + barHeight / 2 + 3)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#fff')
            .attr('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
            .text(`${changeIcon} ${d.percent}%`)
        }
      })

      // 添加版本標籤
      chart.append('text')
        .attr('x', -10)
        .attr('y', barHeight / 2)
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#606266')
        .text('舊版本')

      chart.append('text')
        .attr('x', -10)
        .attr('y', barGap + barHeight / 2)
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#606266')
        .text('新版本')

      // 添加變化箭頭指示
      data.forEach((d, i) => {
        const oldX = xScale(oldStackData[i].x0 + oldStackData[i].percent / 2)
        const newX = xScale(newStackData[i].x0 + newStackData[i].percent / 2)

        if (Math.abs(d.diff) > 2) { // 只在變化超過2%時顯示箭頭
          const arrowColor = d.diff > 0 ? '#67c23a' : '#f56c6c'
          const arrowPath = d.diff > 0
            ? `M ${oldX},${barHeight + 5} L ${newX},${barGap - 5} M ${newX - 5},${barGap - 10} L ${newX},${barGap - 5} L ${newX + 5},${barGap - 10}`
            : `M ${oldX},${barHeight + 5} L ${newX},${barGap - 5} M ${newX - 5},${barGap} L ${newX},${barGap - 5} L ${newX + 5},${barGap}`

          chart.append('path')
            .attr('d', arrowPath)
            .attr('stroke', arrowColor)
            .attr('stroke-width', 1.5)
            .attr('fill', 'none')
            .attr('opacity', 0.6)
        }
      })

      // 添加圖例（成員顏色）
      const legend = svg.append('g')
        .attr('transform', `translate(${margin.left}, ${height - margin.bottom + 20})`)

      data.forEach((d, i) => {
        const legendX = (i % 4) * 160
        const legendY = Math.floor(i / 4) * 25

        const g = legend.append('g')
          .attr('transform', `translate(${legendX}, ${legendY})`)

        // 顏色塊
        g.append('rect')
          .attr('width', 16)
          .attr('height', 16)
          .attr('fill', memberColors[d.email])
          .attr('rx', 3)

        // 成員名稱
        g.append('text')
          .attr('x', 22)
          .attr('y', 12)
          .attr('font-size', '12px')
          .attr('fill', '#606266')
          .text(d.displayName)

        // 變化標記
        if (d.diff !== 0) {
          const changeText = d.diff > 0 ? `+${d.diff}%` : `${d.diff}%`
          const changeColor = d.diff > 0 ? '#67c23a' : '#f56c6c'
          g.append('text')
            .attr('x', 22 + d.displayName.length * 8)
            .attr('y', 12)
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .attr('fill', changeColor)
            .text(` (${changeText})`)
        }
      })
    }
</script>

<style scoped>
.participation-comparison-chart-container {
  margin-top: 15px;
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
  color: #e6a23c;
}

.chart-canvas {
  min-height: 350px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  background: #fafafa;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 350px;
  color: #999;
  font-size: 14px;
}
</style>
