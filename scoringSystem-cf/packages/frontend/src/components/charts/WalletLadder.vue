<template>
  <div class="wallet-ladder-container">
    <!-- 權限提示 -->
    <div class="ladder-info-bar">
      <div class="access-info">
        <span v-if="ladderData?.hasFullAccess" class="full-access-badge">
          <i class="fas fa-eye"></i> 完整權限：顯示所有參與者 ({{ ladderData.walletData.length }} 人)
        </span>
        <span v-else class="limited-access-badge">
          <i class="fas fa-eye-slash"></i> 限制檢視：僅顯示第一名和您組內成員的排名
        </span>
      </div>
    </div>

    <!-- D3 圖表容器 -->
    <div id="walletLadderChart" class="ladder-chart"></div>

    <!-- 無資料提示 -->
    <EmptyState
      v-if="!ladderData || !ladderData.walletData || ladderData.walletData.length === 0"
      parent-icon="fa-ranking-star"
      :icons="['fa-coins']"
      title="沒有可顯示的天梯數據"
      :enable-animation="false"
    />

    <!-- 算法說明按鈕 -->
    <div v-if="ladderData && ladderData.walletData && ladderData.walletData.length > 0" class="algorithm-section">
      <button class="algorithm-toggle-btn" @click="showAlgorithmDrawer = true">
        <i class="fas fa-calculator"></i>
        <span>查看分數計算說明</span>
        <i class="fas fa-arrow-right"></i>
      </button>
    </div>

    <!-- 算法說明 Drawer (嵌套在點數天梯 drawer 內，使用 append-to-body 脫離父層 stacking context) -->
    <el-drawer
      v-model="showAlgorithmDrawer"
      direction="btt"
      size="100%"
      :z-index="2100"
      :append-to-body="true"
      class="drawer-navy"
      @close="handleDrawerClose"
    >
      <template #header>
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-ranking-star"></i>
            點數天梯
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-calculator"></i>
            分數計算說明
          </el-breadcrumb-item>
        </el-breadcrumb>
      </template>

      <div class="drawer-body" v-if="ladderStats">
        <!-- 你的預估分數 -->
        <div v-if="queriedUserData" class="form-section user-score-section">
          <h4><i class="fas fa-user-graduate"></i> 你的預估分數</h4>
          <div class="user-score-card">
            <div class="user-info-row">
              <span class="user-name">{{ queriedUserData.displayName }}</span>
              <span class="user-rank">第 {{ queriedUserData.rank }} 名</span>
            </div>
            <div class="score-display">
              <div class="score-item">
                <span class="score-label">目前餘額</span>
                <span class="score-value balance">{{ queriedUserData.balance }} <small>點</small></span>
              </div>
              <div class="score-arrow">
                <i class="fas fa-arrow-right"></i>
              </div>
              <div class="score-item">
                <span class="score-label">預估分數</span>
                <span class="score-value predicted">{{ queriedUserData.predictedScore }} <small>分</small></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 參數列表 -->
        <div class="form-section">
          <h4><i class="fas fa-list-ul"></i> 當前天梯參數</h4>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">最低餘額</span>
              <span class="stat-value">{{ ladderStats.minBalance }} 點</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最高餘額</span>
              <span class="stat-value">{{ ladderStats.maxBalance }} 點</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最低分數</span>
              <span class="stat-value">{{ ladderStats.scoreMin }} 分</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最高分數</span>
              <span class="stat-value">{{ ladderStats.scoreMax }} 分</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">參與人數</span>
              <span class="stat-value">{{ ladderStats.totalParticipants }} 人</span>
            </div>
          </div>

          <!-- 切換按鈕 -->
          <button class="toggle-values-btn" @click="showActualValues = !showActualValues">
            <i class="fas" :class="showActualValues ? 'fa-undo' : 'fa-arrow-down'"></i>
            <span>{{ showActualValues ? '恢復抽象公式' : '帶入目前的天梯參數' }}</span>
          </button>
        </div>

        <!-- 公式展示 -->
        <div class="form-section">
          <h4><i class="fas fa-function"></i> {{ showActualValues ? '帶入參數後的公式' : '仿射變換公式（線性映射）' }}</h4>
          <div class="formula-box" v-html="renderLatex(affineFormulaLatex)"></div>
        </div>

        <!-- 計算示例 -->
        <div class="form-section">
          <h4><i class="fas fa-lightbulb"></i> 計算示例</h4>
          <div class="example-box">
            <p><strong>假設你的錢包餘額為：</strong></p>
            <div class="example-calculations">
              <div
                v-for="balance in [
                  ladderStats.minBalance,
                  Math.round((ladderStats.minBalance + ladderStats.maxBalance) / 2),
                  ladderStats.maxBalance
                ]"
                :key="balance"
                class="example-item"
              >
                <div class="example-balance">餘額 = <strong>{{ balance }}</strong> 點</div>
                <div class="example-arrow">→</div>
                <div class="example-score">預估分數 = <strong>{{ calculateExampleScore(balance) }}</strong> 分</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 說明注釋 -->
        <div class="algorithm-note">
          <i class="fas fa-info-circle"></i>
          <span>
            此公式在數學上稱為「仿射變換」，最常見的例子是<strong>攝氏轉華氏溫度</strong>（°F = °C × 1.8 + 32）——將一個範圍的數值等比例映射到另一個範圍，同時保持數值間的相對差異。本系統用此公式將錢包餘額映射到分數區間，確保最低餘額對應最低分、最高餘額對應最高分。
          </span>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Wallet Ladder D3.js Chart Component
 * 錢包天梯圖表組件（純渲染組件）
 *
 * 從 WalletLadderChart.vue 提取的核心 D3 渲染邏輯
 * 父組件負責數據載入和狀態管理
 */

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import katex from 'katex'
import EmptyState from '@/components/shared/EmptyState.vue'
import 'katex/dist/katex.min.css'

// Props
const props = defineProps({
  ladderData: {
    type: Object,
    default: null
  },
  scoreRangeMin: {
    type: Number,
    default: 65
  },
  scoreRangeMax: {
    type: Number,
    default: 95
  },
  currentUserEmail: {
    type: String,
    default: null
  },
  queriedUserEmail: {
    type: String,
    default: null
  }
})

// D3 library check
let d3Loaded = false

// Algorithm explanation drawer state
const showAlgorithmDrawer = ref(false)
const showActualValues = ref(false)

/**
 * Handle drawer close - reset state
 */
function handleDrawerClose() {
  showActualValues.value = false
}

/**
 * 計算當前天梯數據的統計信息
 */
const ladderStats = computed(() => {
  if (!props.ladderData?.walletData || props.ladderData.walletData.length === 0) {
    return null
  }

  const data = props.ladderData.walletData
  const balances = data.map((d: any) => d.currentBalance).filter((b: any) => b != null)

  // Use global min/max from backend (ensures correct score calculation for students)
  // Falls back to local calculation if backend doesn't provide global values
  const minBalance = props.ladderData.globalMinBalance ?? Math.min(...balances)
  const maxBalance = props.ladderData.globalMaxBalance ?? Math.max(...balances)
  const scoreMin = props.ladderData.scoreRangeMin || props.scoreRangeMin
  const scoreMax = props.ladderData.scoreRangeMax || props.scoreRangeMax

  return {
    minBalance,
    maxBalance,
    scoreMin,
    scoreMax,
    totalParticipants: data.length
  }
})

/**
 * 查詢用戶的錢包數據（根據 queriedUserEmail 或 currentUserEmail）
 */
const queriedUserData = computed(() => {
  if (!props.ladderData?.walletData || props.ladderData.walletData.length === 0) {
    return null
  }

  // 優先使用 queriedUserEmail，否則使用 currentUserEmail
  const targetEmail = props.queriedUserEmail || props.currentUserEmail
  if (!targetEmail) return null

  // 按餘額排序以計算排名
  const sortedData = [...props.ladderData.walletData].sort(
    (a: any, b: any) => (b.currentBalance || 0) - (a.currentBalance || 0)
  )

  // 找到用戶在排序後數據中的位置（即排名）
  const userIndex = sortedData.findIndex((d: any) => d.userEmail === targetEmail)
  if (userIndex === -1) return null

  const userData = sortedData[userIndex]

  // 計算預估分數
  const stats = ladderStats.value
  if (!stats) return null

  const { scoreMin, scoreMax, minBalance, maxBalance } = stats
  let predictedScore: number

  if (maxBalance === minBalance) {
    predictedScore = scoreMax
  } else {
    predictedScore = scoreMin + (userData.currentBalance - minBalance) / (maxBalance - minBalance) * (scoreMax - scoreMin)
    predictedScore = Math.round(predictedScore * 10) / 10
  }

  return {
    userEmail: userData.userEmail,
    displayName: userData.displayName,
    balance: userData.currentBalance,
    rank: userIndex + 1, // 排名從 1 開始
    predictedScore
  }
})

/**
 * 確保 D3 已載入
 */
async function ensureD3Loaded() {
  if (window.d3) {
    d3Loaded = true
    return true
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js'
    script.onload = () => {
      d3Loaded = true
      resolve(true)
    }
    script.onerror = () => {
      reject(new Error('Failed to load D3'))
    }
    document.head.appendChild(script)
  })
}

/**
 * 渲染圖表
 */
async function renderChart() {
  if (!props.ladderData?.walletData) return

  const container = document.getElementById('walletLadderChart')
  if (!container) return

  // 清除舊圖表
  container.innerHTML = ''

  try {
    // 確保 D3 已載入
    await ensureD3Loaded()

    // 創建圖表
    createLadderChart(container)
  } catch (err) {
    console.error('Error rendering ladder chart:', err)
  }
}

/**
 * 創建 D3 天梯圖
 */
function createLadderChart(container: any) {
  const data = props.ladderData.walletData
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="no-data"><i class="fas fa-coins"></i><p>沒有可顯示的天梯數據</p></div>'
    return
  }

  // 設置圖表尺寸
  const margin = { top: 40, right: 200, bottom: 60, left: 80 }
  const containerWidth = container.clientWidth || 800
  const width = containerWidth - margin.left - margin.right
  const height = Math.max(400, Math.min(600, data.length * 60)) - margin.top - margin.bottom

  // 創建 SVG
  const svg = (window as any).d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', height + margin.top + margin.bottom)
    .attr('viewBox', `0 0 ${containerWidth} ${height + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // 處理數據
  const sortedData = [...data].sort((a, b) => b.currentBalance - a.currentBalance)
  // Use global min/max for Y-axis scale (ensures consistent view for students)
  const minWealth = props.ladderData?.globalMinBalance ?? (window as any).d3.min(sortedData, (d: any) => d.currentBalance) ?? 0
  const maxWealth = props.ladderData?.globalMaxBalance ?? (window as any).d3.max(sortedData, (d: any) => d.currentBalance) ?? 100

  // 建立比例尺
  const xScale = (window as any).d3.scaleLinear()
    .domain([0, maxWealth * 1.1])
    .range([0, width])

  const yScale = (window as any).d3.scaleLinear()
    .domain([minWealth, maxWealth])
    .range([height, 0])

  // 繪製 X 軸
  const xAxis = (window as any).d3.axisBottom(xScale)
    .ticks(8)
    .tickFormat((d: any) => formatPoints(d))

  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')
    .attr('transform', 'rotate(-30)')

  // X 軸標籤
  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('x', width / 2)
    .attr('y', height + 55)
    .text('錢包點數')

  // 繪製左側天梯主軸
  g.append('line')
    .attr('class', 'ladder-line')
    .attr('x1', 0)
    .attr('y1', yScale(minWealth))
    .attr('x2', 0)
    .attr('y2', yScale(maxWealth))
    .style('stroke', '#2196F3')
    .style('stroke-width', 3)
    .style('stroke-dasharray', '5,5')

  // 標記百分制分數範圍
  if (sortedData.length > 0) {
    const scoreMin = props.ladderData.scoreRangeMin || props.scoreRangeMin
    const scoreMax = props.ladderData.scoreRangeMax || props.scoreRangeMax

    // 最高分標記
    g.append('circle')
      .attr('class', 'extreme-marker')
      .attr('cx', 0)
      .attr('cy', yScale(maxWealth))
      .attr('r', 8)
      .style('fill', '#4CAF50')
      .style('stroke', 'white')
      .style('stroke-width', 2)

    g.append('text')
      .attr('class', 'extreme-label')
      .attr('x', -15)
      .attr('y', yScale(maxWealth) + 5)
      .attr('text-anchor', 'end')
      .style('fill', '#4CAF50')
      .style('font-weight', 'bold')
      .text(`${scoreMax}分`)

    // 最低分標記
    g.append('circle')
      .attr('class', 'extreme-marker')
      .attr('cx', 0)
      .attr('cy', yScale(minWealth))
      .attr('r', 8)
      .style('fill', '#FF9800')
      .style('stroke', 'white')
      .style('stroke-width', 2)

    g.append('text')
      .attr('class', 'extreme-label')
      .attr('x', -15)
      .attr('y', yScale(minWealth) + 5)
      .attr('text-anchor', 'end')
      .style('fill', '#FF9800')
      .style('font-weight', 'bold')
      .text(`${scoreMin}分`)
  }

  // 繪製每個用戶的連接線和標記
  sortedData.forEach((person, i) => {
    const y = yScale(person.currentBalance)
    const x = xScale(person.currentBalance)
    const avatarSize = 32

    // 橫向連接線
    g.append('line')
      .attr('class', 'connector-line')
      .attr('x1', 0)
      .attr('y1', y)
      .attr('x2', x)
      .attr('y2', y)
      .style('stroke', '#90CAF9')
      .style('stroke-width', 2)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay(i * 50)
      .style('opacity', 1)

    // 檢查是否為當前用戶或正在查詢的用戶
    const isCurrentUser = person.userEmail === props.currentUserEmail
    const isQueriedUser = props.queriedUserEmail && person.userEmail === props.queriedUserEmail

    // 用戶頭像標記
    const avatarGroup = g.append('g')
      .attr('transform', `translate(${x},${y})`)

    // 如果是當前用戶或正在查詢的用戶，添加紅色邊框
    if (isCurrentUser || isQueriedUser) {
      avatarGroup.append('circle')
        .attr('r', avatarSize / 2 + 6)
        .attr('fill', 'none')
        .attr('stroke', '#F44336')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '4,2')
        .attr('opacity', 0)
        .transition()
        .duration(300)
        .delay(i * 50 + 200)
        .attr('opacity', 1)

      // 添加標籤
      let labelText = ''
      if (isQueriedUser && !isCurrentUser) {
        labelText = '正在查詢者'
      } else if (isCurrentUser && !isQueriedUser) {
        labelText = '這是你'
      } else if (isCurrentUser && isQueriedUser) {
        labelText = '這是你（正在查詢）'
      }

      if (labelText) {
        avatarGroup.append('text')
          .attr('x', 0)
          .attr('y', -avatarSize / 2 - 10)
          .attr('text-anchor', 'middle')
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .style('fill', '#F44336')
          .style('opacity', 0)
          .text(labelText)
          .transition()
          .duration(300)
          .delay(i * 50 + 400)
          .style('opacity', 1)
      }
    }

    // 背景圓
    avatarGroup.append('circle')
      .attr('r', avatarSize / 2 + 2)
      .attr('fill', 'white')
      .attr('opacity', 0)
      .transition()
      .duration(300)
      .delay(i * 50 + 200)
      .attr('opacity', 1)

    // 頭像圓
    const avatarUrl = generateAvatarUrl(person)

    // 創建頭像圖片 pattern
    const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs')
    const patternId = `avatar-${i}`

    const pattern = defs.append('pattern')
      .attr('id', patternId)
      .attr('width', 1)
      .attr('height', 1)
      .attr('patternContentUnits', 'objectBoundingBox')

    pattern.append('image')
      .attr('href', avatarUrl)
      .attr('width', 1)
      .attr('height', 1)
      .attr('preserveAspectRatio', 'xMidYMid slice')

    avatarGroup.append('circle')
      .attr('r', 0)
      .attr('fill', `url(#${patternId})`)
      .attr('stroke', (isCurrentUser || isQueriedUser) ? '#F44336' : 'white')
      .attr('stroke-width', (isCurrentUser || isQueriedUser) ? 3 : 2)
      .style('cursor', 'pointer')
      .transition()
      .duration(300)
      .delay(i * 50 + 200)
      .attr('r', avatarSize / 2)

    // 姓名標籤
    g.append('text')
      .attr('class', 'person-label')
      .attr('x', x + avatarSize / 2 + 8)
      .attr('y', y + 4)
      .style('opacity', 0)
      .style('font-size', '13px')
      .style('fill', '#333')
      .text(person.displayName || person.userEmail)
      .transition()
      .duration(300)
      .delay(i * 50 + 300)
      .style('opacity', 1)

    // 點數標籤
    g.append('text')
      .attr('class', 'wealth-label')
      .attr('x', x + avatarSize / 2 + 8)
      .attr('y', y + 18)
      .style('opacity', 0)
      .style('font-size', '11px')
      .style('fill', '#666')
      .text(formatPoints(person.currentBalance)+'點')
      .transition()
      .duration(300)
      .delay(i * 50 + 300)
      .style('opacity', 1)

    // 計算並顯示預估百分制分數
    const scoreRangeMin = props.ladderData.scoreRangeMin || props.scoreRangeMin
    const scoreRangeMax = props.ladderData.scoreRangeMax || props.scoreRangeMax
    let estimatedScore = scoreRangeMax

    if (maxWealth !== minWealth) {
      // 仿射變換公式
      estimatedScore = scoreRangeMin + (person.currentBalance - minWealth) / (maxWealth - minWealth) * (scoreRangeMax - scoreRangeMin)
      estimatedScore = Math.round(estimatedScore * 10) / 10 // 保留一位小數
    }

    // 預估分數標籤
    g.append('text')
      .attr('class', 'estimated-score-label')
      .attr('x', x + avatarSize / 2 + 8)
      .attr('y', y + 32)
      .style('opacity', 0)
      .style('font-size', '10px')
      .style('fill', '#4CAF50')
      .style('font-weight', 'bold')
      .text(`預估為${estimatedScore}分`)
      .transition()
      .duration(300)
      .delay(i * 50 + 350)
      .style('opacity', 1)
  })
}

/**
 * 生成頭像 URL
 */
function generateAvatarUrl(person: any) {
  if (person.avatarSeed && person.avatarStyle) {
    const style = person.avatarStyle || 'avataaars'
    const seed = person.avatarSeed

    if (person.avatarOptions) {
      const options = typeof person.avatarOptions === 'string'
        ? JSON.parse(person.avatarOptions)
        : person.avatarOptions

      const params = new URLSearchParams()
      Object.entries(options).forEach(([key, value]) => {
        params.append(key, String(value))
      })

      return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&${params.toString()}`
    }

    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`
  }

  // 使用郵箱作為種子
  const seed = person.userEmail || 'default'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

/**
 * 格式化點數
 */
function formatPoints(value: any) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}萬`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return value.toString()
}

/**
 * 渲染 LaTeX 公式
 */
function renderLatex(latex: any) {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true
    })
  } catch (err) {
    console.error('LaTeX rendering error:', err)
    return latex
  }
}

/**
 * 生成仿射變換公式的 LaTeX
 * 根據 showActualValues 顯示抽象公式或帶入參數的公式
 */
const affineFormulaLatex = computed(() => {
  if (!ladderStats.value) return ''

  if (showActualValues.value) {
    // 帶入實際參數
    const { scoreMin, scoreMax, minBalance, maxBalance } = ladderStats.value
    const scoreRange = scoreMax - scoreMin

    // 如果有查詢用戶數據，帶入用戶的實際餘額
    if (queriedUserData.value) {
      const userBalance = queriedUserData.value.balance
      const predictedScore = queriedUserData.value.predictedScore

      return `\\text{預估分數} = \\underbrace{${scoreMin}}_{\\text{最低分}} + \\underbrace{\\frac{${userBalance} - ${minBalance}}{${maxBalance} - ${minBalance}}}_{\\text{餘額比例}} \\times \\underbrace{${scoreRange}}_{\\text{分數範圍}} = \\boxed{${predictedScore}}`
    }

    // 沒有用戶數據時，顯示「你的餘額」佔位符
    return `\\text{預估分數} = \\underbrace{${scoreMin}}_{\\text{${scoreMin}分}} + \\underbrace{\\frac{\\text{你的餘額} - ${minBalance}}{${maxBalance} - ${minBalance}}}_{\\text{餘額比例}} \\times \\underbrace{${scoreRange}}_{\\text{${scoreRange}分}}`
  }

  // 抽象公式
  return `\\text{預估分數} = \\underbrace{\\text{最低分}}_{\\text{分數下限}} + \\underbrace{\\frac{\\text{你的餘額} - \\text{最低餘額}}{\\text{最高餘額} - \\text{最低餘額}}}_{\\text{餘額比例}} \\times \\underbrace{(\\text{最高分} - \\text{最低分})}_{\\text{分數範圍}}`
})

/**
 * 計算示例分數
 */
function calculateExampleScore(balance: any) {
  if (!ladderStats.value) return null

  const { scoreMin, scoreMax, minBalance, maxBalance } = ladderStats.value

  if (maxBalance === minBalance) {
    return scoreMax
  }

  const score = scoreMin + (balance - minBalance) / (maxBalance - minBalance) * (scoreMax - scoreMin)
  return Math.round(score * 10) / 10
}

// Watch for data changes
watch(() => props.ladderData, async () => {
  await nextTick()
  renderChart()
}, { deep: true })

// Initial render
onMounted(async () => {
  await nextTick()
  renderChart()
})

// Cleanup on unmount
onUnmounted(() => {
  const container = document.getElementById('walletLadderChart')
  if (container) {
    container.innerHTML = ''
  }
})
</script>

<style scoped>
.wallet-ladder-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ladder-info-bar {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
  border-left: 4px solid #007bff;
}

.access-info {
  display: flex;
  align-items: center;
  justify-content: center;
}

.full-access-badge {
  color: #28a745;
  font-weight: 600;
  font-size: 14px;
}

.full-access-badge i {
  margin-right: 8px;
}

.limited-access-badge {
  color: #ffc107;
  font-weight: 600;
  font-size: 14px;
}

.limited-access-badge i {
  margin-right: 8px;
}

.ladder-chart {
  flex: 1;
  min-height: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: #666;
  font-size: 16px;
}

.no-data i {
  font-size: 48px;
  margin-bottom: 15px;
  color: #bdc3c7;
}

.no-data p {
  margin: 0;
}

/* D3 圖表樣式 */
.ladder-chart :deep(.axis-label) {
  font-size: 14px;
  fill: #666;
}

.ladder-chart :deep(.tick text) {
  font-size: 12px;
}

.ladder-chart :deep(.ladder-line) {
  stroke: #2196F3;
  stroke-width: 3;
  fill: none;
}

.ladder-chart :deep(.connector-line) {
  stroke: #90CAF9;
  stroke-width: 2;
}

.ladder-chart :deep(.person-label) {
  font-size: 13px;
  fill: #333;
}

.ladder-chart :deep(.wealth-label) {
  font-size: 11px;
  fill: #666;
}

.ladder-chart :deep(.extreme-marker) {
  fill: #F44336;
  stroke: white;
  stroke-width: 2;
}

.ladder-chart :deep(.extreme-label) {
  font-size: 12px;
  fill: #F44336;
  font-weight: bold;
}

/* 算法說明區域 */
.algorithm-section {
  margin-top: 20px;
}

.algorithm-toggle-btn {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.algorithm-toggle-btn:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.algorithm-toggle-btn i {
  font-size: 16px;
}

/* Drawer Body */
.drawer-body {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Form Section (drawer 內的區塊) */
.form-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.form-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #34495e;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-section h4 i {
  color: #667eea;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 15px;
}

.stat-item {
  background: white;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
  border: 1px solid #e9ecef;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #6c757d;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #2c3e50;
}

/* 用戶預估分數區塊 */
.user-score-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
  color: white;
}

.user-score-section h4 {
  color: white;
  margin-bottom: 15px;
}

.user-score-section h4 i {
  color: rgba(255, 255, 255, 0.9);
}

.user-score-card {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 15px 20px;
  backdrop-filter: blur(10px);
}

.user-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.user-name {
  font-size: 18px;
  font-weight: 600;
}

.user-rank {
  background: rgba(255, 255, 255, 0.25);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.score-display {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 15px;
}

.score-item {
  text-align: center;
  flex: 1;
}

.score-label {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.score-value small {
  font-size: 14px;
  font-weight: 500;
  opacity: 0.85;
}

.score-value.balance {
  color: #ffeaa7;
}

.score-value.predicted {
  color: #81ecec;
}

.score-arrow {
  font-size: 24px;
  opacity: 0.7;
  flex-shrink: 0;
}

/* 切換按鈕 */
.toggle-values-btn {
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
}

.toggle-values-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(243, 156, 18, 0.4);
}

.toggle-values-btn:active {
  transform: translateY(0);
}

.formula-section {
  margin-bottom: 25px;
}

.formula-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.formula-box {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 20px;
  overflow-x: auto;
  text-align: center;
}

/* KaTeX 樣式調整 */
.formula-box :deep(.katex) {
  font-size: 1.2em;
}

.formula-box :deep(.katex-display) {
  margin: 0;
}

/* 公式說明文字 */
.formula-note {
  margin-top: 12px;
  padding: 10px 15px;
  background: #e7f3ff;
  border-left: 3px solid #2196F3;
  border-radius: 4px;
  font-size: 13px;
  color: #555;
  line-height: 1.6;
}

.formula-note strong {
  color: #667eea;
  font-weight: 700;
}

.example-section {
  margin-bottom: 25px;
}

.example-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.example-section h4 i {
  color: #ffc107;
}

.example-box {
  background: #fff9e6;
  border: 1px solid #ffe08a;
  border-radius: 6px;
  padding: 20px;
}

.example-box p {
  margin: 0 0 15px 0;
  color: #666;
  font-size: 14px;
}

.example-calculations {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.example-item {
  display: flex;
  align-items: center;
  gap: 15px;
  background: white;
  padding: 12px 15px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.example-balance,
.example-score {
  flex: 1;
  font-size: 14px;
  color: #555;
}

.example-balance strong,
.example-score strong {
  color: #667eea;
  font-weight: 700;
  font-size: 16px;
}

.example-arrow {
  color: #667eea;
  font-weight: bold;
  font-size: 18px;
}

.algorithm-note {
  background: #e7f3ff;
  border-left: 4px solid #2196F3;
  padding: 15px;
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 20px;
}

.algorithm-note i {
  color: #2196F3;
  font-size: 18px;
  margin-top: 2px;
}

.algorithm-note span {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .drawer-body {
    padding: 15px;
  }

  .form-section {
    padding: 15px;
  }

  .formula-box :deep(.katex) {
    font-size: 1em;
  }

  .example-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .example-arrow {
    transform: rotate(90deg);
    align-self: center;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
