<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    class="drawer-navy"
    @close="handleClose"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-calculator"></i>
          點數計算說明
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body">
      <!-- Algorithm Section -->
      <div class="algorithm-section">
        <h3 class="algorithm-title">
          <i class="fas fa-function"></i>
          評分與點數分配算法
        </h3>

        <!-- Parameter List (above formulas) -->
        <div v-if="props.groupData" class="parameter-list">
          <h4><i class="fas fa-list-ul"></i> 當前參數</h4>

          <!-- Statistics Row -->
          <el-row :gutter="12" class="stats-row">
            <el-col :xs="12" :sm="8" :md="6" v-if="props.groupData.finalRank || props.groupData.rank">
              <AnimatedStatistic title="排名 (r)" :value="(props.groupData.finalRank || props.groupData.rank)!" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.groupData.totalGroups">
              <AnimatedStatistic title="總組數 (N)" :value="props.groupData.totalGroups" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.groupData.allocatedPoints !== undefined">
              <AnimatedStatistic title="組別獲得點數(點)" :value="props.groupData.allocatedPoints" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.projectConfig?.rewardPool">
              <AnimatedStatistic title="總獎金池(點)" :value="props.projectConfig.rewardPool" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.projectConfig?.studentWeight !== undefined">
              <AnimatedStatistic
                title="學生權重(%)"
                :value="Math.round(props.projectConfig.studentWeight * 100)"
              />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.projectConfig?.teacherWeight !== undefined">
              <AnimatedStatistic
                title="教師權重(%)"
                :value="Math.round(props.projectConfig.teacherWeight * 100)"
              />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.groupData.studentScore !== undefined">
              <!-- 小數值保留 el-statistic -->
              <el-statistic
                title="學生評分"
                :value="props.groupData.studentScore"
                :precision="2"
              />
            </el-col>
            <el-col :xs="12" :sm="8" :md="6" v-if="props.groupData.teacherScore !== undefined">
              <!-- 小數值保留 el-statistic -->
              <el-statistic
                title="教師評分"
                :value="props.groupData.teacherScore"
                :precision="2"
              />
            </el-col>
          </el-row>

          <!-- Toggle Actual Values Button -->
          <button class="toggle-values-btn" @click="showActualValues = !showActualValues">
            <i class="fas" :class="showActualValues ? 'fa-undo' : 'fa-arrow-down'"></i>
            <span>{{ showActualValues ? '恢復抽象公式' : '帶入目前的評分參數' }}</span>
          </button>
        </div>

        <!-- Formula 1: Weighted Score -->
        <div class="formula-section">
          <h4><i class="fas fa-balance-scale"></i> 加權評分計算</h4>
          <div class="formula-box" v-html="renderLatex(weightedScoreFormula)"></div>
          <p class="formula-description">
            最終評分由學生評分（70%）和教師評分（30%）加權平均而成
          </p>
        </div>

        <!-- Formula 2: Occupied Weight Method -->
        <div class="formula-section">
          <h4><i class="fas fa-ranking-star"></i> 佔位權重法</h4>
          <div class="formula-box" v-html="renderLatex(occupiedWeightFormula)"></div>
          <p class="formula-description">
            組別獎金依據「佔位權重」分配。若排名為 r，則佔據從 r 到最後一名（N）的所有位置，權重為這些位置的總和。
            <br><strong>處理並列</strong>：若多組並列同一名次，它們共享所佔位置的總權重。
          </p>
        </div>

        <!-- Formula 3: Reward Distribution -->
        <div class="formula-section">
          <h4><i class="fas fa-coins"></i> 獎金分配公式</h4>
          <div class="formula-box" v-html="renderLatex(rewardDistributionFormula)"></div>
          <p class="formula-description">
            每組獲得的點數 = 總獎金池 × (該組權重 / 所有組權重總和)
          </p>
        </div>

        <!-- Formula 4: Within-Group Distribution -->
        <div class="formula-section">
          <h4><i class="fas fa-user-friends"></i> 組內分配公式</h4>

          <!-- Member Selector -->
          <div v-if="props.groupData?.members && props.groupData.members.length > 0" class="member-selector">
            <div class="selector-label">
              <i class="fas fa-user"></i>
              <span>選擇成員查看點數計算：</span>
            </div>
            <el-segmented
              v-model="selectedMemberIndex"
              :options="memberOptions"
              size="default"
            />
          </div>

          <div class="formula-box" v-html="renderLatex(withinGroupFormula)"></div>
          <p class="formula-description">
            組內成員依據貢獻度百分比分配組別獲得的總點數
            <span v-if="!props.groupData?.members || props.groupData.members.length === 0">
              <br><strong>註：</strong>若無成員數據，假設組內均分
            </span>
          </p>
        </div>

        <!-- Statistics Background -->
        <div class="algorithm-note statistics-note">
          <i class="fas fa-landmark"></i>
          <span>
            <strong>統計學背景：</strong>本系統採用的「佔位權重法」與「比例分配」在統計學中廣泛應用。最著名的案例是<strong>美國國會眾議員席次分配</strong>：各州依人口比例獲得席次，人口越多的州「佔據」越多席位，再按比例分配給各州。本系統將此概念應用於競賽排名——名次越前的組別「佔據」越多權重位置，最終依權重比例分配獎金池。
          </span>
        </div>

        <!-- Algorithm Note -->
        <div class="algorithm-note">
          <i class="fas fa-info-circle"></i>
          <span>
            此算法確保公平性：名次越前的組別獲得越多點數，同時處理並列情況，組內成員按貢獻度分配。
          </span>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AnimatedStatistic from './AnimatedStatistic.vue'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// KaTeX 從 CDN 載入，使用全域變數
declare const katex: {
  renderToString(tex: string, options?: { throwOnError?: boolean; displayMode?: boolean }): string
}

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

interface MemberData {
  email: string
  displayName: string
  contribution: number  // 0-100
  points: number
}

interface GroupData {
  groupName: string
  rank?: number
  finalRank?: number
  totalGroups?: number
  allocatedPoints?: number
  studentScore?: number
  teacherScore?: number
  totalScore?: number
  members?: MemberData[]
}

interface Props {
  visible: boolean
  groupData?: GroupData
  projectConfig?: {
    scoreRangeMin?: number
    scoreRangeMax?: number
    studentWeight?: number
    teacherWeight?: number
    rewardPool?: number
  }
  mode?: 'report' | 'comment'
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  mode: 'report'
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

// Local state
const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const showActualValues = ref(false)
const selectedMemberIndex = ref(0)  // Default to first member

/**
 * Member options for el-segmented
 */
const memberOptions = computed(() => {
  if (!props.groupData?.members || props.groupData.members.length === 0) {
    return []
  }

  return props.groupData.members.map((member, index) => ({
    label: `${member.displayName || member.email.split('@')[0]}[${member.contribution.toFixed(0)}%]`,
    value: index
  }))
})

/**
 * 渲染 LaTeX 公式
 */
function renderLatex(latex: string) {
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
 * Calculate occupied weight: sum from rank to total
 */
function calculateOccupiedWeight(rank: number, total: number): number {
  // Sum of arithmetic sequence: (first + last) * count / 2
  return ((rank + total) * (total - rank + 1)) / 2
}

/**
 * Calculate sum of all weights (for denominator)
 */
function calculateTotalWeights(totalGroups: number): number {
  // Sum of 1+2+3+...+N = N*(N+1)/2
  return (totalGroups * (totalGroups + 1)) / 2
}

/**
 * LaTeX Formulas - Abstract or Concrete based on showActualValues
 */
const weightedScoreFormula = computed(() => {
  const studentWeight = props.projectConfig?.studentWeight || 0.7
  const teacherWeight = props.projectConfig?.teacherWeight || 0.3

  if (!showActualValues.value || !props.groupData?.studentScore || !props.groupData?.teacherScore) {
    // Abstract formula
    return `\\text{總分} = \\text{學生評分} \\times ${studentWeight} + \\text{教師評分} \\times ${teacherWeight}`
  }

  // Concrete formula with actual values and result
  const studentScore = props.groupData.studentScore
  const teacherScore = props.groupData.teacherScore
  const totalScore = studentScore * studentWeight + teacherScore * teacherWeight

  return `\\text{總分} = ${studentScore.toFixed(2)} \\times ${studentWeight} + ${teacherScore.toFixed(2)} \\times ${teacherWeight} = ${totalScore.toFixed(2)}`
})

const occupiedWeightFormula = computed(() => {
  if (!showActualValues.value || !props.groupData?.finalRank || !props.groupData?.totalGroups) {
    // Abstract formula
    return `W_r = \\sum_{i=r}^{N} i`
  }

  // Concrete formula with actual values and result
  const rank = props.groupData.finalRank || props.groupData.rank || 1
  const total = props.groupData.totalGroups
  const weight = calculateOccupiedWeight(rank, total)

  return `W_{${rank}} = \\sum_{i=${rank}}^{${total}} i = ${weight}`
})

const rewardDistributionFormula = computed(() => {
  if (!showActualValues.value || !props.groupData?.finalRank || !props.groupData?.totalGroups || !props.projectConfig?.rewardPool) {
    // Abstract formula
    return `P_r = P_{\\text{總}} \\times \\frac{W_r}{\\sum_{j=1}^{N} W_j}`
  }

  // Concrete formula with actual values and result
  const rank = props.groupData.finalRank || props.groupData.rank || 1
  const total = props.groupData.totalGroups
  const rewardPool = props.projectConfig.rewardPool

  const currentWeight = calculateOccupiedWeight(rank, total)
  const totalWeights = calculateTotalWeights(total)
  const allocatedPoints = (rewardPool * currentWeight) / totalWeights

  return `P_{${rank}} = ${rewardPool} \\times \\frac{${currentWeight}}{${totalWeights}} = ${allocatedPoints.toFixed(2)}`
})

const withinGroupFormula = computed(() => {
  if (!showActualValues.value || !props.groupData?.allocatedPoints) {
    // Abstract formula
    return `P_{\\text{個人}} = P_{\\text{組}} \\times \\frac{C_{\\text{個人}}}{100}`
  }

  // Concrete formula
  const groupPoints = props.groupData.allocatedPoints

  // If we have member data, show selected member's calculation
  if (props.groupData.members && props.groupData.members.length > 0) {
    const selectedMember = props.groupData.members[selectedMemberIndex.value]
    if (selectedMember) {
      const contribution = selectedMember.contribution
      const memberPoints = (groupPoints * contribution) / 100

      return `P_{\\text{個人}} = ${groupPoints} \\times \\frac{${contribution.toFixed(1)}}{100} = ${memberPoints.toFixed(2)}`
    }
  }

  // Otherwise, assume equal distribution
  const memberCount = props.groupData.members?.length || 4  // Default assumption
  const equalShare = 100 / memberCount
  const memberPoints = (groupPoints * equalShare) / 100

  return `P_{\\text{個人}} = ${groupPoints} \\times \\frac{${equalShare.toFixed(1)}}{100} = ${memberPoints.toFixed(2)} \\text{ (假設均分)}`
})

/**
 * Handle drawer close
 */
function handleClose() {
  localVisible.value = false
  showActualValues.value = false  // Reset on close
  selectedMemberIndex.value = 0   // Reset to first member
}
</script>

<style scoped>
/* Drawer Body */
.drawer-body {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100%;
}

/* Algorithm Section */
.algorithm-section {
  margin-bottom: 25px;
}

.algorithm-title {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.algorithm-title i {
  color: #667eea;
}

/* Parameter List */
.parameter-list {
  background: #fff9e6;
  border: 2px solid #ffe08a;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
}

.parameter-list h4 {
  font-size: 16px;
  font-weight: 600;
  color: #34495e;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.parameter-list h4 i {
  color: #f39c12;
}

/* Statistics Row */
.stats-row {
  margin-bottom: 15px;
}

/* 統一 el-statistic 和 AnimatedStatistic 的樣式 */
.stats-row :deep(.el-statistic),
.stats-row :deep(.animated-statistic) {
  text-align: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.stats-row :deep(.el-statistic__head),
.stats-row :deep(.stat-title) {
  font-size: 13px;
  color: #6c757d;
  font-weight: 500;
  margin-bottom: 8px;
}

.stats-row :deep(.el-statistic__content),
.stats-row :deep(.stat-value-wrapper) {
  font-size: 18px;
  color: #2c3e50;
  font-weight: 700;
  background: transparent;
}

/* Toggle Values Button */
.toggle-values-btn {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s ease;
  margin-top: 15px;
}

.toggle-values-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
}

.toggle-values-btn:active {
  transform: translateY(0);
}

/* Formula Section */
.formula-section {
  margin-bottom: 25px;
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.formula-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #34495e;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.formula-section h4 i {
  color: #667eea;
}

/* Member Selector */
.member-selector {
  margin-bottom: 15px;
}

.selector-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #34495e;
  margin-bottom: 10px;
}

.selector-label i {
  color: #667eea;
}

.member-selector :deep(.el-segmented) {
  width: 100%;
}

.member-selector :deep(.el-segmented__item-label) {
  font-size: 13px;
  padding: 8px 12px;
}

.formula-box {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 20px;
  overflow-x: auto;
  text-align: center;
  margin-bottom: 10px;
}

.formula-box :deep(.katex) {
  font-size: 1.2em;
}

.formula-description {
  font-size: 14px;
  color: #5a6c7d;
  line-height: 1.6;
  margin: 0;
}

/* Algorithm Note */
.algorithm-note {
  background: #e8f4fd;
  border: 1px solid #b3d9f2;
  border-radius: 6px;
  padding: 12px 15px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 20px;
}

.algorithm-note i {
  color: #3498db;
  margin-top: 2px;
}

.algorithm-note span {
  font-size: 14px;
  color: #2c3e50;
  line-height: 1.6;
  flex: 1;
}

/* Responsive */
@media (max-width: 768px) {
  .drawer-body {
    padding: 15px;
  }

  .member-selector :deep(.el-segmented__item-label) {
    font-size: 12px;
    padding: 6px 8px;
  }
}
</style>
