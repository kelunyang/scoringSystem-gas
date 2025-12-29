<template>
  <div class="all-groups-chart-container">
    <h4 class="chart-title">
      <i class="fas fa-trophy"></i> 各組總點數競爭比較
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
import { useChargingAnimation, type ChargingUnit } from '@/composables/useChargingAnimation'
import type { GroupClickData } from '@/types/components'
import EmptyState from '@/components/shared/EmptyState.vue'

export interface Member {
  email: string
  displayName?: string
  points: number
  finalWeight: number
  [key: string]: any
}

export interface Group {
  groupId: string
  groupName: string
  rank: number
  isCurrentGroup?: boolean
  members: Member[]
}

export interface Props {
  selectedMembers: any[]
  simulatedRank: number
  simulatedGroupCount: number
  reportReward?: number
  allGroups?: Group[]
  currentGroupId?: string | null
  totalProjectGroups: number
  currentGroupLabel?: string
  groupByRank?: boolean  // 是否按 rank 分組顯示（預設 true 保持相容）
  clickable?: boolean  // 是否啟用點擊互動（預設 false）
}

const props = withDefaults(defineProps<Props>(), {
  reportReward: 1000,
  allGroups: () => [],
  currentGroupId: null,
  currentGroupLabel: '我們',
  groupByRank: true,
  clickable: false
})

const emit = defineEmits<{
  'group-click': [data: GroupClickData]
}>()

const { createTooltip, clearContainer, getContainerSize, debouncedRender } = useD3Chart()
const { calculateAllGroupsScoring, getRankColor } = usePointCalculation()
const charging = useChargingAnimation()

const chartContainer: Ref<HTMLElement | null> = ref(null)
const selectedGroupRank: Ref<number | null> = ref(null)

// 存儲充能層元素引用（按位置索引，每個方塊一個）
let chargedElements: SVGRectElement[] = []

// Watch for prop changes - reset charging animation on data change
watch(() => props.selectedMembers, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
}, { deep: true })

watch(() => props.simulatedRank, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
})

watch(() => props.simulatedGroupCount, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
})

watch(() => props.allGroups, () => {
  charging.reset()
  chargedElements = []
  debouncedRender(() => renderChart())
}, { deep: true })

/**
 * 截断文本并在超出长度时添加省略号
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

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

      // Determine mode: Settlement (use allGroups directly) or Simulation (calculate scoring)
      let allGroupsData: Group[]

      if (!props.selectedMembers || props.selectedMembers.length === 0) {
        // Settlement mode: use allGroups data directly (pre-calculated from backend)
        if (!props.allGroups || props.allGroups.length === 0) {
          clearContainer(chartContainer.value)
          const emptyState = document.createElement('div')
          emptyState.innerHTML = `
            <div class="empty-state compact type-info">
              <div class="empty-state-icon"><i class="fas fa-chart-bar"></i></div>
              <p class="empty-state-title compact-title">無資料可顯示</p>
            </div>
          `
          chartContainer.value.appendChild(emptyState)
          return
        }
        allGroupsData = props.allGroups as Group[]  // Use pre-calculated settlement data
      } else {
        // Simulation mode: calculate scoring from selectedMembers
        allGroupsData = calculateAllGroupsScoring(
          props.selectedMembers,
          props.simulatedRank,
          props.reportReward,
          props.simulatedGroupCount,
          props.allGroups as any,
          props.currentGroupId ?? null
        )

        if (allGroupsData.length === 0) {
          clearContainer(chartContainer.value)
          const emptyState = document.createElement('div')
          emptyState.innerHTML = `
            <div class="empty-state compact type-info">
              <div class="empty-state-icon"><i class="fas fa-calculator"></i></div>
              <p class="empty-state-title compact-title">無法計算點數分配</p>
            </div>
          `
          chartContainer.value.appendChild(emptyState)
          return
        }
      }

      // 設置圖表尺寸
      const { width } = getContainerSize(chartContainer.value, 800, 300)
      const height = 300
      const margin = { top: 50, right: 40, bottom: 60, left: 40 }

      // 創建 tooltip
      const tooltip = createTooltip()

      // 創建SVG
      const svg = d3.select(chartContainer.value)
        .append('svg')
        .attr('width', width)
        .attr('height', height)

      // 創建所有權重塊數據
      const allPeople: Array<Member & { groupId: string; groupName: string; rank: number; isCurrentGroup?: boolean; groupColor: string }> = []
      allGroupsData.forEach(group => {
        group.members.forEach((member: Member) => {
          allPeople.push({
            ...member,
            groupId: group.groupId,
            groupName: group.groupName,
            rank: group.rank,
            isCurrentGroup: group.isCurrentGroup,
            groupColor: getRankColor(group.rank)
          })
        })
      })

      // 按排名排序
      allPeople.sort((a, b) => a.rank - b.rank || (a.displayName ?? '').localeCompare(b.displayName ?? ''))

      // 創建權重塊
      const blocks: Array<{ person: typeof allPeople[0]; globalPosition: number; blockIndex: number; totalBlocks: number }> = []
      let globalPos = 0

      allPeople.forEach(person => {
        const numBlocks = Math.round(person.finalWeight)
        for (let i = 0; i < numBlocks; i++) {
          blocks.push({
            person: person,
            globalPosition: globalPos++,
            blockIndex: i,
            totalBlocks: numBlocks
          })
        }
      })

      if (blocks.length === 0) {
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', '#666')
          .text('暫無數據')
        return
      }

      // 計算塊大小和位置
      const blockSize = Math.min(12, (width - margin.left - margin.right) / blocks.length)
      const blockHeight = 40
      const startX = margin.left + (width - margin.left - margin.right - blocks.length * blockSize) / 2
      const startY = (height - blockHeight) / 2

      // 清空充能元素引用
      chargedElements = []

      // 1. 繪製底座層（淡色，始終可見）
      svg.selectAll('.weight-block-base')
        .data(blocks)
        .enter()
        .append('rect')
        .attr('class', 'weight-block-base')
        .attr('data-rank', d => d.person.rank)
        .attr('x', d => startX + d.globalPosition * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', d => d.person.groupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('opacity', 0.5)

      // 2. 繪製充能層（初始不可見，動畫時逐組點亮）
      const weightBlocks = svg.selectAll('.weight-block')
        .data(blocks)
        .enter()
        .append('rect')
        .attr('class', 'weight-block')
        .attr('data-rank', d => d.person.rank)
        .attr('x', d => startX + d.globalPosition * blockSize)
        .attr('y', startY)
        .attr('width', blockSize - 1)
        .attr('height', blockHeight)
        .attr('fill', d => d.person.groupColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('opacity', 0)  // 初始不可見，由充能動畫控制
        .style('cursor', props.clickable ? 'pointer' : 'default')
        .each(function() {
          // 收集每個方塊的充能層元素（按位置順序）
          chargedElements.push(this as SVGRectElement)
        })
        .on('mouseover', (event, d: any) => {
          // Highlight all blocks of the same rank
          const sameRankBlocks = svg.selectAll('.weight-block')
            .filter((block: any) => block.person.rank === d.person.rank)

          sameRankBlocks.style('opacity', (block: any) => {
              const baseOpacity = block.person.isCurrentGroup ? 1 : 0.8
              return selectedGroupRank.value === block.person.rank ? baseOpacity * 0.7 : Math.min(baseOpacity + 0.1, 1)
            })

          // 可點擊時套用 grow 效果
          if (props.clickable) {
            sameRankBlocks
              .transition()
              .duration(150)
              .attr('transform', function(this: Element) {
                const rect = this as SVGRectElement
                const y = parseFloat(rect.getAttribute('y') || '0')
                const height = parseFloat(rect.getAttribute('height') || '0')
                return `translate(0, ${-height * 0.1}) scale(1, 1.2)`
              } as any)
              .style('filter', 'brightness(1.1)')
          }

          tooltip.style('opacity', 0.9)
            .html(`<strong>${d.person.displayName}</strong><br/>
                   <span style="color: ${d.person.groupColor}; font-weight: bold;">
                     ${truncateText(d.person.groupName, 10)}
                   </span><br/>
                   第${d.person.rank}名組${d.person.isCurrentGroup ? ' (我們組)' : ''}<br/>
                   權重: ${d.person.finalWeight.toFixed(1)}<br/>
                   得分: ${d.person.points.toFixed(2)}點${props.clickable ? '<br/><span style="color: #409eff; font-size: 11px;">點擊查看組內詳情</span>' : ''}`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
        })
        .on('mouseout', (event, d: any) => {
          // Restore original opacity for all blocks of the same rank
          const sameRankBlocks = svg.selectAll('.weight-block')
            .filter((block: any) => block.person.rank === d.person.rank)

          sameRankBlocks.style('opacity', (block: any) => {
              const baseOpacity = block.person.isCurrentGroup ? 1 : 0.8
              return selectedGroupRank.value === block.person.rank ? baseOpacity * 0.7 : baseOpacity
            })

          // 可點擊時恢復原狀
          if (props.clickable) {
            sameRankBlocks
              .transition()
              .duration(150)
              .attr('transform', '')
              .style('filter', '')
          }

          tooltip.style('opacity', 0)
        })
        .on('click', (event, d: any) => {
          // Set selected group rank for visual feedback
          selectedGroupRank.value = d.person.rank

          // Update all blocks opacity
          svg.selectAll('.weight-block')
            .style('opacity', (block: any) => {
              const baseOpacity = block.person.isCurrentGroup ? 1 : 0.8
              return selectedGroupRank.value === block.person.rank ? baseOpacity * 0.7 : baseOpacity
            })

          // Find all members of this group
          const groupMembers = allPeople.filter(p => p.rank === d.person.rank)
          const groupData = props.allGroups.find(g => g.groupId === d.person.groupId)

          emit('group-click', {
            groupId: d.person.groupId,
            groupName: d.person.groupName,
            rank: d.person.rank,
            points: d.person.points,
            members: (groupData?.members || []) as any,
            allGroupMembers: groupMembers as any
          })
        })

      // 組別分隔線和標籤
      if (props.groupByRank) {
        // 原有邏輯：按 rank 分組（同名次合併）
        let sepPos = 0
        for (let rank = 1; rank <= props.simulatedGroupCount; rank++) {
          const rankPeople = allPeople.filter(p => p.rank === rank)
          if (rankPeople.length > 0) {
            const rankBlocks = rankPeople.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
            sepPos += rankBlocks

            if (rank < props.simulatedGroupCount) {
              svg.append('line')
                .attr('x1', startX + sepPos * blockSize - 1)
                .attr('x2', startX + sepPos * blockSize - 1)
                .attr('y1', startY - 20)
                .attr('y2', startY + blockHeight + 20)
                .attr('stroke', '#000')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '4,2')
            }
          }
        }

        // 組別標籤（下方）- 按 rank 分組
        let labelPos = 0
        for (let rank = 1; rank <= props.simulatedGroupCount; rank++) {
          const rankPeople = allPeople.filter(p => p.rank === rank)
          if (rankPeople.length > 0) {
            const rankBlocks = rankPeople.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
            const centerPos = labelPos + rankBlocks / 2
            const isCurrentGroup = rankPeople.some(p => p.isCurrentGroup)
            const groupColor = getRankColor(rank)

            // Get actual group name from rankPeople
            const groupName = rankPeople[0]?.groupName || `第${rank}名組`
            const displayName = truncateText(groupName, 10)
            const labelText = isCurrentGroup && props.currentGroupLabel
              ? `${displayName} (${props.currentGroupLabel})`
              : displayName

            svg.append('text')
              .attr('x', startX + centerPos * blockSize)
              .attr('y', startY + blockHeight + 20)
              .attr('text-anchor', 'middle')
              .attr('font-size', '11px')
              .attr('font-weight', isCurrentGroup ? 'bold' : 'normal')
              .attr('fill', groupColor)
              .style('cursor', 'pointer')
              .text(labelText)
              .append('title')  // Add tooltip for full group name
              .text(groupName)
              .on('click', () => {
                // Get the first person from this rank to extract group info
                const firstPerson = rankPeople[0]
                const groupData = props.allGroups.find(g => g.groupId === firstPerson.groupId)

                emit('group-click', {
                  groupId: firstPerson.groupId,
                  groupName: firstPerson.groupName,
                  rank: rank,
                  points: rankPeople.reduce((sum, p) => sum + p.points, 0),
                  members: (groupData?.members || []) as any,
                  allGroupMembers: rankPeople as any
                })
              })

            // 組總點數
            const groupTotalPoints = rankPeople.reduce((sum, p) => sum + p.points, 0)
            svg.append('text')
              .attr('x', startX + centerPos * blockSize)
              .attr('y', startY + blockHeight + 35)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10px')
              .attr('fill', '#666')
              .text(`${Math.round(groupTotalPoints)}點`)

            labelPos += rankBlocks
          }
        }
      } else {
        // 新邏輯：按 groupId 獨立顯示（同名次不合併）
        // 獲取唯一的 group 列表（保持排序順序）
        const uniqueGroups: Array<{ groupId: string; groupName: string; rank: number; isCurrentGroup?: boolean; people: typeof allPeople }> = []
        const seenGroupIds = new Set<string>()

        allPeople.forEach(person => {
          if (!seenGroupIds.has(person.groupId)) {
            seenGroupIds.add(person.groupId)
            uniqueGroups.push({
              groupId: person.groupId,
              groupName: person.groupName,
              rank: person.rank,
              isCurrentGroup: person.isCurrentGroup,
              people: allPeople.filter(p => p.groupId === person.groupId)
            })
          }
        })

        // 繪製分隔線 - 按 groupId 分隔
        let sepPos = 0
        uniqueGroups.forEach((group, index) => {
          const groupBlocks = group.people.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
          sepPos += groupBlocks

          if (index < uniqueGroups.length - 1) {
            svg.append('line')
              .attr('x1', startX + sepPos * blockSize - 1)
              .attr('x2', startX + sepPos * blockSize - 1)
              .attr('y1', startY - 20)
              .attr('y2', startY + blockHeight + 20)
              .attr('stroke', '#000')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '4,2')
          }
        })

        // 組別標籤（下方）- 按 groupId 獨立顯示
        let labelPos = 0
        uniqueGroups.forEach(group => {
          const groupBlocks = group.people.reduce((sum, p) => sum + Math.round(p.finalWeight), 0)
          const centerPos = labelPos + groupBlocks / 2
          const groupColor = getRankColor(group.rank)

          const displayName = truncateText(group.groupName, 10)
          const labelText = group.isCurrentGroup && props.currentGroupLabel
            ? `${displayName} (${props.currentGroupLabel})`
            : displayName

          svg.append('text')
            .attr('x', startX + centerPos * blockSize)
            .attr('y', startY + blockHeight + 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('font-weight', group.isCurrentGroup ? 'bold' : 'normal')
            .attr('fill', groupColor)
            .style('cursor', 'pointer')
            .text(labelText)
            .append('title')
            .text(group.groupName)
            .on('click', () => {
              const groupData = props.allGroups.find(g => g.groupId === group.groupId)

              emit('group-click', {
                groupId: group.groupId,
                groupName: group.groupName,
                rank: group.rank,
                points: group.people.reduce((sum, p) => sum + p.points, 0),
                members: (groupData?.members || []) as any,
                allGroupMembers: group.people as any
              })
            })

          // 該 group 的點數（不合併）
          const groupTotalPoints = group.people.reduce((sum, p) => sum + p.points, 0)
          svg.append('text')
            .attr('x', startX + centerPos * blockSize)
            .attr('y', startY + blockHeight + 35)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .text(`${Math.round(groupTotalPoints)}點`)

          labelPos += groupBlocks
        })
      }

      // 添加總體說明
      const totalPoints = allPeople.reduce((sum, p) => sum + p.points, 0)
      const totalWeight = allPeople.reduce((sum, p) => sum + p.finalWeight, 0)
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#2c3e50')
        .text(`各組權重分配 | 總點數: ${Math.round(totalPoints)}點 | 總權重: ${Math.round(totalWeight)}`)

      // 配置充能動畫（按組充能）
      setupChargingAnimation(allPeople, startX, startY, blockSize, blockHeight)
    }

/**
 * 設置充能動畫
 * 每個方塊作為一個充能單位，從左到右逐一點亮
 */
function setupChargingAnimation(
  allPeople: Array<{ rank: number; finalWeight: number }>,
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
.all-groups-chart-container {
  margin-top: 20px;
}

.chart-title {
  margin: 10px 0;
  color: #2c3e50;
  font-size: 14px;
  font-weight: 600;
}

.chart-title i {
  margin-right: 8px;
  color: #f39c12;
}

.chart-canvas {
  min-height: 120px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  background: #fafafa;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
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
