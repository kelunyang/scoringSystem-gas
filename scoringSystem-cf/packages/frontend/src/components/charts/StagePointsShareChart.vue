<template>
  <div class="stage-points-share">
    <template v-if="segments.length > 0">
      <!-- 總點數（hero number） -->
      <div class="share-head">
        <div class="share-hero">
          <span class="hero-value">{{ totalPoints.toLocaleString('zh-TW') }}</span>
          <span class="hero-unit">點</span>
        </div>
        <div class="share-caption">
          {{ stageCount }} 個階段的報告獎金＋評論獎金總和
        </div>
      </div>

      <!-- 100% 堆疊長條 -->
      <div
        ref="barEl"
        class="share-bar"
        role="img"
        :aria-label="ariaLabel"
      >
        <el-tooltip
          v-for="(seg, index) in segments"
          :key="seg.key"
          placement="top"
          :show-after="80"
        >
          <template #content>
            <div class="seg-tip">
              <div class="seg-tip-title">{{ seg.name }}</div>
              <div v-if="seg.folded" class="seg-tip-row">
                <span>合併 {{ seg.foldedCount }} 個階段</span>
              </div>
              <div class="seg-tip-row">
                <span>報告獎金</span><span>{{ seg.reportReward.toLocaleString('zh-TW') }} 點</span>
              </div>
              <div class="seg-tip-row">
                <span>評論獎金</span><span>{{ seg.commentReward.toLocaleString('zh-TW') }} 點</span>
              </div>
              <div class="seg-tip-row seg-tip-total">
                <span>階段合計</span><span>{{ seg.points.toLocaleString('zh-TW') }} 點</span>
              </div>
              <div class="seg-tip-row">
                <span>占專案</span><span>{{ formatPercent(seg.share) }}</span>
              </div>
            </div>
          </template>
          <div
            class="share-seg"
            :class="{
              'is-last': index === segments.length - 1,
              'is-dimmed': activeKey !== null && activeKey !== seg.key
            }"
            :style="{ flexGrow: seg.share, background: seg.color }"
            @mouseenter="activeKey = seg.key"
            @mouseleave="activeKey = null"
          >
            <span
              v-if="seg.pixelWidth >= LABEL_MIN_WIDTH"
              class="seg-label"
              :style="{ color: seg.ink }"
            >{{ Math.round(seg.share * 100) }}%</span>
          </div>
        </el-tooltip>
      </div>

      <!-- 圖例＝表格檢視：每個階段的點數與占比都看得到 -->
      <ul class="share-legend">
        <li
          v-for="seg in segments"
          :key="seg.key"
          class="legend-row"
          :class="{ 'is-dimmed': activeKey !== null && activeKey !== seg.key }"
          @mouseenter="activeKey = seg.key"
          @mouseleave="activeKey = null"
        >
          <span class="legend-swatch" :style="{ background: seg.color }"></span>
          <span class="legend-name" :title="seg.name">{{ seg.name }}</span>
          <span class="legend-points">{{ seg.points.toLocaleString('zh-TW') }} 點</span>
          <span class="legend-share">{{ formatPercent(seg.share) }}</span>
        </li>
      </ul>
    </template>

    <EmptyState
      v-else
      :icons="['fa-coins']"
      parent-icon="fa-chart-simple"
      title="目前沒有可統計的階段點數"
      description="所有階段的報告獎金與評論獎金都是 0"
      :compact="true"
      :enable-animation="false"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview 階段點數占比圖（100% 堆疊長條）
 *
 * 把每個階段的「報告獎金 + 評論獎金」加總成專案總點數，
 * 再用一條 100% 堆疊長條顯示每個階段占專案的比例。
 *
 * 配色使用 dataviz 驗證過的 8 色類別調色盤（白底、light mode，
 * 相鄰色差 CVD ΔE 9.1 / 一般視覺 ΔE 19.6，全數通過）。
 * 其中 aqua / yellow / magenta 對白底對比度低於 3:1，
 * 因此圖例固定顯示名稱、點數與百分比作為 relief（表格檢視）。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import EmptyState from '@/components/shared/EmptyState.vue'

/** 圖表需要的階段欄位 */
export interface StagePointsInput {
  id: string
  title: string
  reportReward?: number | null
  commentReward?: number | null
}

const props = withDefaults(defineProps<{
  stages?: StagePointsInput[]
}>(), {
  stages: () => []
})

/**
 * 驗證過的類別調色盤（固定順序，永不循環使用）
 * @see dataviz/references/palette.md
 */
const SERIES_COLORS = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948'  // 8 red
] as const

/** 最多用幾個色塊；超過就把尾端階段折成「其他」 */
const MAX_SLOTS = SERIES_COLORS.length
/** 區段寬度至少這麼寬才在裡面放百分比標籤（避免文字被切掉） */
const LABEL_MIN_WIDTH = 42
/** 區段之間的白色間隙寬度（px），與 CSS 的 gap 一致 */
const SEG_GAP = 2

const barEl = ref<HTMLElement | null>(null)
const barWidth = ref(0)
const activeKey = ref<string | null>(null)
let resizeObserver: ResizeObserver | null = null

/** 只留下有點數的階段（0 點的階段畫不出來，也不列在圖例） */
const scoredStages = computed(() => {
  return props.stages
    .map(stage => ({
      id: stage.id,
      title: stage.title || '未命名階段',
      reportReward: Math.max(0, stage.reportReward ?? 0),
      commentReward: Math.max(0, stage.commentReward ?? 0)
    }))
    .map(stage => ({ ...stage, points: stage.reportReward + stage.commentReward }))
    .filter(stage => stage.points > 0)
})

const totalPoints = computed(() =>
  scoredStages.value.reduce((sum, stage) => sum + stage.points, 0)
)

const stageCount = computed(() => scoredStages.value.length)

/**
 * 依 WCAG 相對亮度挑選標籤文字色，確保寫在色塊裡的百分比讀得到
 */
function pickInk(hex: string): string {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  const contrastWithWhite = 1.05 / (luminance + 0.05)
  const contrastWithBlack = (luminance + 0.05) / 0.05
  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#0b0b0b'
}

function formatPercent(share: number): string {
  if (share > 0 && share < 0.001) return '<0.1%'
  return `${(share * 100).toFixed(1)}%`
}

interface Segment {
  key: string
  name: string
  reportReward: number
  commentReward: number
  points: number
  share: number
  color: string
  ink: string
  folded: boolean
  foldedCount: number
  pixelWidth: number
}

const segments = computed<Segment[]>(() => {
  const list = scoredStages.value
  const total = totalPoints.value
  if (list.length === 0 || total <= 0) return []

  // 超過色盤容量就把尾端階段折成「其他」，不循環用色
  const needsFold = list.length > MAX_SLOTS
  const head = needsFold ? list.slice(0, MAX_SLOTS - 1) : list
  const tail = needsFold ? list.slice(MAX_SLOTS - 1) : []

  const raw = head.map((stage, index) => ({
    key: stage.id,
    name: stage.title,
    reportReward: stage.reportReward,
    commentReward: stage.commentReward,
    points: stage.points,
    color: SERIES_COLORS[index],
    folded: false,
    foldedCount: 0
  }))

  if (tail.length > 0) {
    raw.push({
      key: '__other__',
      name: `其他 ${tail.length} 個階段`,
      reportReward: tail.reduce((sum, stage) => sum + stage.reportReward, 0),
      commentReward: tail.reduce((sum, stage) => sum + stage.commentReward, 0),
      points: tail.reduce((sum, stage) => sum + stage.points, 0),
      color: SERIES_COLORS[MAX_SLOTS - 1],
      folded: true,
      foldedCount: tail.length
    })
  }

  // 扣掉間隙後才是色塊實際可分配的寬度
  const usableWidth = Math.max(0, barWidth.value - SEG_GAP * (raw.length - 1))

  return raw.map(seg => {
    const share = seg.points / total
    return {
      ...seg,
      share,
      ink: pickInk(seg.color),
      pixelWidth: usableWidth * share
    }
  })
})

const ariaLabel = computed(() => {
  const parts = segments.value.map(seg => `${seg.name} ${formatPercent(seg.share)}`)
  return `階段點數占比，總計 ${totalPoints.value} 點：${parts.join('、')}`
})

onMounted(() => {
  if (!barEl.value) return
  barWidth.value = barEl.value.clientWidth
  resizeObserver = new ResizeObserver(entries => {
    barWidth.value = entries[0]?.contentRect.width ?? 0
  })
  resizeObserver.observe(barEl.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.stage-points-share {
  width: 100%;
}

/* === 總點數 === */
.share-head {
  margin-bottom: 12px;
}

.share-hero {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.hero-value {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
  color: #303133;
  /* hero 數字用比例字寬，不用 tabular-nums */
}

.hero-unit {
  font-size: 14px;
  color: #909399;
}

.share-caption {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

/* === 堆疊長條 === */
.share-bar {
  display: flex;
  align-items: stretch;
  gap: 2px; /* 用白色間隙分隔色塊，不畫框線 */
  width: 100%;
  height: 24px;
}

.share-seg {
  flex-basis: 0;
  min-width: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease;
}

/* 資料端（右側）圓角，基線端（左側）維持方角 */
.share-seg.is-last {
  border-radius: 0 4px 4px 0;
}

.share-seg.is-dimmed {
  opacity: 0.3;
}

.seg-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

/* === 圖例／表格檢視 === */
.share-legend {
  list-style: none;
  margin: 12px 0 0 0;
  padding: 0;
}

.legend-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto 56px;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  transition: opacity 0.15s ease;
}

.legend-row.is-dimmed {
  opacity: 0.35;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-name {
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-points,
.legend-share {
  color: #303133;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.legend-share {
  color: #909399;
}

/* === Tooltip === */
.seg-tip-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.seg-tip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  line-height: 1.6;
}

.seg-tip-total {
  border-top: 1px solid rgba(255, 255, 255, 0.25);
  margin-top: 2px;
  padding-top: 2px;
}

@media (max-width: 768px) {
  .hero-value {
    font-size: 24px;
  }

  .legend-row {
    grid-template-columns: 10px minmax(0, 1fr) auto 48px;
  }
}
</style>
