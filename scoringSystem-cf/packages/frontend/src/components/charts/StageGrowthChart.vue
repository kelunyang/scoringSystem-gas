<template>
  <div class="stage-growth-chart-container">
    <!-- 用戶資訊 -->
    <div v-if="topUserData || targetUserData" class="chart-info-bar">
      <div v-if="topUserData" class="user-badge top-user">
        <i class="fas fa-trophy"></i>
        <span class="user-label">第一名：</span>
        <span class="user-name">{{ topUserData.displayName }}</span>
        <span class="user-points">({{ topUserData.totalPoints }} 點)</span>
      </div>
      <div v-if="targetUserData" class="user-badge target-user">
        <i class="fas fa-user"></i>
        <span class="user-label">當前用戶：</span>
        <span class="user-name">{{ targetUserData.displayName }}</span>
        <span class="user-points">({{ targetUserData.totalPoints }} 點)</span>
      </div>
    </div>

    <!-- D3 圖表容器 -->
    <div ref="chartContainer" class="growth-chart"></div>

    <!-- 無資料提示 -->
    <EmptyState
      v-if="!topUserData && !targetUserData"
      :icons="['fa-chart-line']"
      title="沒有可顯示的階段成長數據"
      parent-icon="fa-chart-area"
      :compact="true"
      :enable-animation="false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'
import EmptyState from '@/components/shared/EmptyState.vue'

const props = defineProps({
  // 第一名用戶數據
  topUserData: {
    type: Object,
    default: null
  },
  // 當前查詢用戶數據
  targetUserData: {
    type: Object,
    default: null
  },
  // 從甘特圖同步的時間範圍 [startDate, endDate]
  xScaleDomain: {
    type: Array,
    default: null
  },
  // 階段信息（用於繪製分隔線）
  stages: {
    type: Array,
    default: () => []
  },
  // 圖表寬度
  width: {
    type: Number,
    default: null
  }
})

const chartContainer = ref(null)
let resizeObserver: ResizeObserver | null = null

/**
 * 渲染折線圖
 */
function renderLineChart() {
  if (!chartContainer.value) return

  // 檢查數據
  const hasTopUser = props.topUserData?.stageGrowth && props.topUserData.stageGrowth.length > 0
  const hasTargetUser = props.targetUserData?.stageGrowth && props.targetUserData.stageGrowth.length > 0

  if (!hasTopUser && !hasTargetUser) {
    console.warn('[StageGrowthChart] No data to render')
    return
  }

  // 清除舊圖表
  d3.select(chartContainer.value).selectAll('*').remove()

  // 設置尺寸
  const margin = { top: 30, right: 120, bottom: 50, left: 70 }
  const containerWidth = props.width || (chartContainer.value as HTMLElement).clientWidth
  const width = containerWidth - margin.left - margin.right
  const height = 300 - margin.top - margin.bottom

  // 創建 SVG
  const svg = d3.select(chartContainer.value)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', 300)

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // 定義裁切路徑 (確保超出viewport的內容被隱藏)
  const defs = svg.append('defs')
  defs.append('clipPath')
    .attr('id', 'growth-chart-clip')
    .append('rect')
    .attr('x', 0)
    .attr('y', -10) // 稍微擴大裁切區域以容納數據點
    .attr('width', width)
    .attr('height', height + 20)

  // 創建裁切容器
  const clippedGroup = g.append('g')
    .attr('clip-path', 'url(#growth-chart-clip)')

  // 合併兩組數據以確定 Y 軸範圍
  let allPoints: number[] = []
  if (hasTopUser) {
    allPoints = allPoints.concat(props.topUserData.stageGrowth.map((d: any) => d.cumulativePoints))
  }
  if (hasTargetUser) {
    allPoints = allPoints.concat(props.targetUserData.stageGrowth.map((d: any) => d.cumulativePoints))
  }

  // X 軸比例尺（時間）
  let xScaleDomain: any
  if (props.xScaleDomain && props.xScaleDomain.length === 2) {
    // 使用甘特圖同步的 domain
    xScaleDomain = props.xScaleDomain
  } else {
    // 使用數據的時間範圍
    const dataToUse = hasTopUser ? props.topUserData.stageGrowth : props.targetUserData.stageGrowth
    xScaleDomain = [
      new Date(dataToUse[0].endTime),
      new Date(dataToUse[dataToUse.length - 1].endTime)
    ]
  }

  const xScale = d3.scaleTime()
    .domain(xScaleDomain as [Date, Date])
    .range([0, width])

  // Y 軸比例尺（累計點數）
  const maxPoints = d3.max(allPoints) || 100
  const yScale = d3.scaleLinear()
    .domain([0, maxPoints * 1.1])
    .range([height, 0])

  // 繪製 X 軸
  const xAxis = d3.axisBottom(xScale)
    .ticks(6)
    .tickFormat(d3.timeFormat('%m/%d') as any)

  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis as any)
    .selectAll('text')
    .style('font-size', '11px')

  // 繪製 Y 軸
  const yAxis = d3.axisLeft(yScale)
    .ticks(5)
    .tickFormat((d) => Math.round(d as number).toString())

  g.append('g')
    .attr('class', 'y-axis')
    .call(yAxis)
    .selectAll('text')
    .style('font-size', '11px')

  // Y 軸標籤
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 15)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('fill', '#666')
    .text('累計點數')

  // 繪製階段垂直虛線 (使用裁切容器)
  if (props.stages && props.stages.length > 0) {
    props.stages.forEach((stage: any) => {
      if (!stage.endTime) return

      const stageEndTime = new Date(stage.endTime)
      const xPos = xScale(stageEndTime)

      // 繪製所有線，由clip-path處理可見性
      clippedGroup.append('line')
        .attr('class', 'stage-separator')
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#e74c3c')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6)
    })
  }

  // 折線生成器
  const line = d3.line()
    .x((d: any) => xScale(new Date(d.endTime)))
    .y((d: any) => yScale(d.cumulativePoints))
    .curve(d3.curveMonotoneX)

  // 繪製第一名折線 (使用裁切容器)
  if (hasTopUser) {
    clippedGroup.append('path')
      .datum(props.topUserData.stageGrowth)
      .attr('class', 'line-top-user')
      .attr('fill', 'none')
      .attr('stroke', '#409eff')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // 繪製第一名數據點
    clippedGroup.selectAll('.dot-top')
      .data(props.topUserData.stageGrowth)
      .enter()
      .append('circle')
      .attr('class', 'dot-top')
      .attr('cx', (d: any) => xScale(new Date(d.endTime)))
      .attr('cy', (d: any) => yScale(d.cumulativePoints))
      .attr('r', 5)
      .attr('fill', '#409eff')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)

    // 繪製第一名數據標籤
    clippedGroup.selectAll('.label-top')
      .data(props.topUserData.stageGrowth)
      .enter()
      .append('text')
      .attr('class', 'label-top')
      .attr('x', (d: any) => xScale(new Date(d.endTime)))
      .attr('y', (d: any) => yScale(d.cumulativePoints) - 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#409eff')
      .text((d: any) => Math.round(d.cumulativePoints))
  }

  // 繪製當前用戶折線 (使用裁切容器)
  if (hasTargetUser) {
    clippedGroup.append('path')
      .datum(props.targetUserData.stageGrowth)
      .attr('class', 'line-target-user')
      .attr('fill', 'none')
      .attr('stroke', '#f56c6c')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // 繪製當前用戶數據點
    clippedGroup.selectAll('.dot-target')
      .data(props.targetUserData.stageGrowth)
      .enter()
      .append('circle')
      .attr('class', 'dot-target')
      .attr('cx', (d: any) => xScale(new Date(d.endTime)))
      .attr('cy', (d: any) => yScale(d.cumulativePoints))
      .attr('r', 5)
      .attr('fill', '#f56c6c')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)

    // 繪製當前用戶數據標籤
    clippedGroup.selectAll('.label-target')
      .data(props.targetUserData.stageGrowth)
      .enter()
      .append('text')
      .attr('class', 'label-target')
      .attr('x', (d: any) => xScale(new Date(d.endTime)))
      .attr('y', (d: any) => yScale(d.cumulativePoints) + 18)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#f56c6c')
      .text((d: any) => Math.round(d.cumulativePoints))
  }

  // 繪製圖例（右側）
  const legend = g.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width + 10}, 10)`)

  if (hasTopUser) {
    const topLegend = legend.append('g')
      .attr('transform', 'translate(0, 0)')

    topLegend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#409eff')
      .attr('stroke-width', 2.5)

    topLegend.append('text')
      .attr('x', 25)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .text('第一名')
  }

  if (hasTargetUser) {
    const targetLegend = legend.append('g')
      .attr('transform', 'translate(0, 20)')

    targetLegend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#f56c6c')
      .attr('stroke-width', 2.5)

    targetLegend.append('text')
      .attr('x', 25)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .text('當前用戶')
  }
}

// 監聽數據和 xScaleDomain 變化
watch(() => [props.topUserData, props.targetUserData, props.xScaleDomain, props.stages], async () => {
  await nextTick()
  renderLineChart()
}, { deep: true })

// 監聽容器寬度變化
onMounted(async () => {
  await nextTick()
  renderLineChart()

  // 設置 ResizeObserver 監聽容器大小變化
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      renderLineChart()
    })
    resizeObserver.observe(chartContainer.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.stage-growth-chart-container {
  width: 100%;
  background: white;
  border-radius: 8px;
  padding: 15px;
}

.chart-info-bar {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.user-badge.top-user {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  color: #1976d2;
  border: 2px solid #409eff;
}

.user-badge.target-user {
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  color: #c62828;
  border: 2px solid #f56c6c;
}

.user-badge i {
  font-size: 14px;
}

.user-label {
  font-weight: 600;
}

.user-name {
  font-weight: 700;
}

.user-points {
  color: #666;
  font-weight: 600;
}

.growth-chart {
  width: 100%;
  min-height: 300px;
}

.no-data {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.no-data i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #dcdfe6;
}

.no-data p {
  margin: 0;
  font-size: 14px;
}

/* D3 元素樣式 */
.growth-chart :deep(.x-axis) path,
.growth-chart :deep(.y-axis) path,
.growth-chart :deep(.x-axis) line,
.growth-chart :deep(.y-axis) line {
  stroke: #e1e8ed;
}

.growth-chart :deep(.x-axis) text,
.growth-chart :deep(.y-axis) text {
  fill: #606266;
}

/* 數據點和標籤動畫 */
.growth-chart :deep(.dot-top),
.growth-chart :deep(.dot-target) {
  cursor: pointer;
  transition: r 0.2s ease;
}

.growth-chart :deep(.dot-top:hover),
.growth-chart :deep(.dot-target:hover) {
  r: 7;
}

/* 響應式調整 */
@media (max-width: 768px) {
  .chart-info-bar {
    flex-direction: column;
    gap: 10px;
  }

  .user-badge {
    justify-content: center;
  }

  .growth-chart {
    min-height: 250px;
  }
}
</style>
