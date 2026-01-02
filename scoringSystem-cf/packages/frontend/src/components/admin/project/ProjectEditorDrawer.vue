<template>
  <el-drawer
    v-model="localVisible"
    direction="btt"
    size="100%"
    class="drawer-navy"
  >
    <template #header>
      <el-breadcrumb separator=">">
        <el-breadcrumb-item>
          <i :class="currentPageIcon"></i>
          {{ currentPageName }}
        </el-breadcrumb-item>
        <el-breadcrumb-item>
          <i class="fas fa-edit"></i>
          {{ editForm.projectId ? '編輯專案' : '新增專案' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>

    <div class="drawer-body">
      <!-- DrawerAlertZone 統一管理 Alerts -->
      <DrawerAlertZone />

      <!-- 基本資訊 -->
      <div class="form-section">
        <h4><i class="fas fa-project-diagram"></i> 基本資訊</h4>
        <div class="form-group">
          <label>專案名稱 *</label>
          <input type="text" v-model="editForm.projectName" class="form-input">
        </div>

        <div class="form-group">
          <label>專案描述 *</label>
          <MarkdownEditor v-model="editForm.description" placeholder="請輸入專案描述（支援Markdown格式）" />
        </div>
      </div>

      <!-- 評分系統配置 -->
      <div class="form-section scoring-config-section">
        <div class="section-header" @click="showScoringConfig = !showScoringConfig">
          <h4>
            <i :class="showScoringConfig ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
            <i class="fas fa-trophy"></i>
            評分系統配置
          </h4>
          <span class="section-hint">（可選，留空則使用系統預設值）</span>
        </div>

        <div v-show="showScoringConfig" class="scoring-config-content">
          <!-- Score Range Configuration -->
          <div class="config-item">
            <label class="config-label">百分制分數區間設定</label>
            <div class="range-slider-container">
              <div class="range-slider-header">
                <span class="range-value">最低分: <strong>{{ editForm.scoreRangeMin }}</strong></span>
                <span class="range-value">最高分: <strong>{{ editForm.scoreRangeMax }}</strong></span>
              </div>
              <el-slider
                v-model="scoreRange"
                range
                :min="0"
                :max="100"
                :step="1"
                :marks="{ 0: '0', 25: '25', 50: '50', 75: '75', 100: '100' }"
                :show-tooltip="true"
                :format-tooltip="(val: number) => `${val} 分`"
              />
            </div>
            <div class="field-hint">拖動滑桿設定專案成績轉換為百分制的範圍 ({{ editForm.scoreRangeMin }} - {{ editForm.scoreRangeMax }})</div>
          </div>

          <!-- Weight Configuration (Dual Slider) -->
          <div class="config-item">
            <label class="config-label">學生/教師評分權重</label>
            <div class="dual-slider-container">
              <!-- Student Weight Slider -->
              <div class="dual-slider-item">
                <div class="slider-header">
                  <span class="slider-label">學生評分權重</span>
                  <span class="slider-value" style="color: #409EFF">
                    {{ formatPercentage(editForm.studentRankingWeight) }}
                  </span>
                </div>
                <el-slider
                  v-model="editForm.studentRankingWeight"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :marks="{ 0: '0%', 0.3: '30%', 0.5: '50%', 0.7: '70%', 1: '100%' }"
                  :show-tooltip="true"
                  :format-tooltip="(val: number) => `${Math.round(val * 100)}%`"
                  @change="(val) => handleStudentWeightChange(val as number)"
                />
              </div>

              <!-- Teacher Weight Slider -->
              <div class="dual-slider-item">
                <div class="slider-header">
                  <span class="slider-label">教師評分權重</span>
                  <span class="slider-value" style="color: #67C23A">
                    {{ formatPercentage(editForm.teacherRankingWeight) }}
                  </span>
                </div>
                <el-slider
                  v-model="editForm.teacherRankingWeight"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :marks="{ 0: '0%', 0.3: '30%', 0.5: '50%', 0.7: '70%', 1: '100%' }"
                  :show-tooltip="true"
                  :format-tooltip="(val: number) => `${Math.round(val * 100)}%`"
                  @change="(val) => handleTeacherWeightChange(val as number)"
                />
              </div>

              <!-- Sum Validation Indicator -->
              <div class="dual-slider-sum" :class="{ 'sum-valid': isWeightSumValid }">
                <i :class="isWeightSumValid ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'"></i>
                總和: {{ formatPercentage(weightSum) }}
                ({{ isWeightSumValid ? '正確' : '應為 100%' }})
              </div>
            </div>
          </div>

          <!-- Comment Reward Percentile (主控制器) -->
          <div class="config-item">
            <label class="config-label">評論獎勵模式</label>
            <el-slider
              v-model="editForm.commentRewardPercentile"
              :min="0"
              :max="50"
              :step="5"
              :marks="{ 0: '固定TOP N', 10: '前10%', 20: '前20%', 30: '前30%', 50: '前50%' }"
              :show-tooltip="true"
              :format-tooltip="(val) => val === 0 ? '固定 TOP N 模式' : `前 ${val}% 獲獎勵`"
            />
            <div class="field-hint">
              <strong>0 = 固定 TOP N 模式</strong>，由下方「教師最多排名數」決定<br>
              <strong>非 0 = 百分位數模式</strong>，根據評論作者總數動態計算獎勵人數
            </div>
          </div>

          <!-- Max Comment Selections (被百分位控制) -->
          <div class="config-item">
            <label class="config-label">
              教師最多可排名評論數
              <span v-if="editForm.commentRewardPercentile > 0" class="disabled-hint">
                （當前已禁用）
              </span>
            </label>
            <el-slider
              v-model="editForm.maxCommentSelections"
              :min="1"
              :max="10"
              :step="1"
              :marks="{ 1: '1', 3: '3', 5: '5', 10: '10' }"
              :show-tooltip="true"
              :format-tooltip="(val) => `${val} 個評論`"
              :disabled="editForm.commentRewardPercentile > 0"
            />
            <div class="field-hint">
              教師在單一階段最多可以排名幾個評論
              <span v-if="editForm.commentRewardPercentile === 0">
                （固定 TOP N 模式下，獎勵前 {{ editForm.maxCommentSelections }} 名評論作者）
              </span>
            </div>
          </div>

          <!-- Max Vote Reset Count -->
          <div class="config-item">
            <label class="config-label">組長重置投票次數上限</label>
            <div class="slider-with-value">
              <el-slider
                v-model="editForm.maxVoteResetCount"
                :min="1"
                :max="5"
                :step="1"
                :show-stops="true"
                :marks="{ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }"
              />
              <span class="slider-value">{{ editForm.maxVoteResetCount }} 次</span>
            </div>
            <div class="field-hint">
              每個小組在每個階段最多可重置投票的次數（預設：1 次）<br>
              當投票結果為平手或反對票多時，組長可重置投票讓組員重新投票
            </div>
          </div>

          <!-- Reset to Defaults Button -->
          <div class="config-actions">
            <button class="btn-reset" @click="loadSystemDefaults" :disabled="loadingDefaults">
              <i :class="loadingDefaults ? 'fas fa-spinner fa-spin' : 'fas fa-undo'"></i>
              {{ loadingDefaults ? '載入中...' : '恢復系統預設值' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Drawer Footer (浮動按鈕區塊) -->
      <div class="drawer-actions">
        <el-button
          type="primary"
          @click="handleSave"
          :loading="updating"
          :disabled="!editForm.projectName.trim() || !editForm.description.trim()"
        >
          <i :class="editForm.projectId ? 'fas fa-save' : 'fas fa-plus'"></i>
          {{ updating ? (editForm.projectId ? '保存中...' : '創建中...') : (editForm.projectId ? '保存變更' : '創建專案') }}
        </el-button>
        <el-button @click="handleClose" :disabled="updating">
          <i class="fas fa-times"></i>
          取消
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, watch, ref, onMounted } from 'vue'
import type { Ref, WritableComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import DrawerAlertZone from '@/components/common/DrawerAlertZone.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { rpcClient } from '@/utils/rpc-client'

// ===== Drawer Breadcrumb =====
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// ===== Drawer Alerts =====
const { addAlert, removeAlert, clearAlerts } = useDrawerAlerts()

export interface ProjectForm {
  projectId: string | null
  projectName: string
  description: string
  scoreRangeMin: number
  scoreRangeMax: number
  // Scoring configuration (will be loaded from system defaults or project config)
  maxCommentSelections: number
  studentRankingWeight: number
  teacherRankingWeight: number
  commentRewardPercentile: number
  maxVoteResetCount: number
}

export interface Props {
  visible?: boolean
  form?: ProjectForm
  updating?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  form: () => ({
    projectId: null,
    projectName: '',
    description: '',
    scoreRangeMin: 0,
    scoreRangeMax: 100,
    // Default scoring config (will be replaced by system defaults on load)
    maxCommentSelections: 3,
    studentRankingWeight: 0.7,
    teacherRankingWeight: 0.3,
    commentRewardPercentile: 0,
    maxVoteResetCount: 1
  }),
  updating: false
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': [form: ProjectForm]
  'close': []
}>()

// ============================================================================
// State
// ============================================================================

// Two-way binding for visibility
const localVisible: WritableComputedRef<boolean> = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// Local copy of form for editing
const editForm: Ref<ProjectForm> = ref({ ...props.form })

// UI state
const showScoringConfig = ref(false)
const loadingDefaults = ref(false)

// ============================================================================
// Computed Properties
// ============================================================================

// Two-way binding for score range slider
const scoreRange = computed({
  get: () => [editForm.value.scoreRangeMin, editForm.value.scoreRangeMax] as [number, number],
  set: (val: [number, number]) => {
    editForm.value.scoreRangeMin = val[0]
    editForm.value.scoreRangeMax = val[1]
  }
})

const weightSum = computed(() => {
  const student = editForm.value.studentRankingWeight ?? 0
  const teacher = editForm.value.teacherRankingWeight ?? 0
  return Math.round((student + teacher) * 1000) / 1000 // Avoid floating-point precision issues
})

const isWeightSumValid = computed(() => {
  return Math.abs(weightSum.value - 1.0) < 0.001
})

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // Load system defaults when creating new project
  if (!editForm.value.projectId) {
    await loadSystemDefaults()
  }
})

// Watch for form prop changes
watch(() => props.form, (newForm) => {
  editForm.value = { ...newForm }

  // If editing existing project, load its scoring config
  if (newForm.projectId) {
    loadProjectScoringConfig(newForm.projectId)
  }
}, { deep: true })

// Watch for visibility changes
watch(() => props.visible, async (visible) => {
  if (visible) {
    // If creating new project, load system defaults
    if (!editForm.value.projectId) {
      await loadSystemDefaults()
    }
    // If editing existing project, load its scoring config
    else {
      await loadProjectScoringConfig(editForm.value.projectId)
    }
  }
})

// ============================================================================
// Methods
// ============================================================================

/**
 * Load system default scoring configuration
 */
async function loadSystemDefaults(): Promise<void> {
  try {
    loadingDefaults.value = true
    const httpResponse = await rpcClient.projects.system['scoring-defaults'].$get()
    const response = await httpResponse.json()

    if (response.success && response.data) {
      editForm.value.maxCommentSelections = response.data.maxCommentSelections
      editForm.value.studentRankingWeight = response.data.studentRankingWeight
      editForm.value.teacherRankingWeight = response.data.teacherRankingWeight
      editForm.value.commentRewardPercentile = response.data.commentRewardPercentile
      editForm.value.maxVoteResetCount = response.data.maxVoteResetCount
    }
  } catch (error) {
    console.error('Failed to load system scoring defaults:', error)
    ElMessage.error('載入系統預設值失敗')
  } finally {
    loadingDefaults.value = false
  }
}

/**
 * Load project-specific scoring configuration
 */
async function loadProjectScoringConfig(projectId: string): Promise<void> {
  try {
    const httpResponse = await rpcClient.projects[':projectId']['scoring-config'].$get({
      param: { projectId }
    })
    const response = await httpResponse.json()

    if (response.success && response.data) {
      editForm.value.maxCommentSelections = response.data.maxCommentSelections
      editForm.value.studentRankingWeight = response.data.studentRankingWeight
      editForm.value.teacherRankingWeight = response.data.teacherRankingWeight
      editForm.value.commentRewardPercentile = response.data.commentRewardPercentile
      editForm.value.maxVoteResetCount = response.data.maxVoteResetCount
    }
  } catch (error) {
    console.error('Failed to load project scoring config:', error)
    ElMessage.error('載入專案評分配置失敗')
  }
}

/**
 * Handle student weight slider change (auto-adjust teacher weight)
 */
function handleStudentWeightChange(value: number): void {
  const teacherWeight = 1.0 - value
  editForm.value.teacherRankingWeight = Math.max(0, Math.min(1, teacherWeight))
}

/**
 * Handle teacher weight slider change (auto-adjust student weight)
 */
function handleTeacherWeightChange(value: number): void {
  const studentWeight = 1.0 - value
  editForm.value.studentRankingWeight = Math.max(0, Math.min(1, studentWeight))
}

/**
 * Format number as percentage
 */
function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * Handle drawer close
 */
function handleClose(): void {
  localVisible.value = false
  emit('close')
}

/**
 * Handle save (validate and emit)
 */
function handleSave(): void {
  // Validate weight sum if both weights are set
  if (
    editForm.value.studentRankingWeight !== null &&
    editForm.value.teacherRankingWeight !== null &&
    !isWeightSumValid.value
  ) {
    ElMessage.warning('學生評分權重與教師評分權重總和必須為 100%')
    return
  }

  emit('save', editForm.value)
}

// ============================================================================
// Alert Management
// ============================================================================

// Track the percentile mode alert ID
let percentileModeAlertId: string | null = null

/**
 * Watch commentRewardPercentile to show/hide mode switch alert
 */
watch(() => editForm.value.commentRewardPercentile, (newVal) => {
  if (newVal > 0) {
    // Remove old alert if exists
    if (percentileModeAlertId) {
      removeAlert(percentileModeAlertId)
    }

    // Add new alert with updated percentile value
    percentileModeAlertId = addAlert({
      type: 'warning',
      title: '當前使用百分位數模式',
      message: `評論獎勵將根據評論作者總數的 ${newVal}% 動態計算\n\n如需切換回固定 TOP N 模式，請將上方滑塊拉回 0`,
      closable: false
    })
  } else {
    // Remove alert when switched back to TOP N mode
    if (percentileModeAlertId) {
      removeAlert(percentileModeAlertId)
      percentileModeAlertId = null
    }
  }
})

/**
 * Clear alerts when drawer closes
 */
watch(() => props.visible, (newVal) => {
  if (!newVal) {
    clearAlerts()
    percentileModeAlertId = null
  }
})
</script>

<style scoped>
.drawer-header-navy {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 20px 30px;
  background: #2c3e50;
  color: white;
}

.drawer-header-navy h3 {
  margin: 0;
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-close-btn {
  background: transparent;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 5px 10px;
  transition: opacity 0.2s;
}

.drawer-close-btn:hover {
  opacity: 0.7;
}

.drawer-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #606266;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #409eff;
}

.score-range-inputs {
  display: flex;
  gap: 20px;
  align-items: center;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-input label {
  margin: 0;
  font-size: 14px;
}

.form-input-small {
  width: 100px;
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}

.form-input-small:focus {
  outline: none;
  border-color: #409eff;
}

.field-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

/* drawer-actions 樣式由 drawer-unified.scss 統一管理 */

/* Scoring Configuration Section */
.scoring-config-section {
  position: relative;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
  margin-bottom: 16px;
}

.section-header:hover {
  color: #409eff;
}

.section-header h4 {
  cursor: pointer;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 16px;
}

.section-header i {
  font-size: 14px;
  transition: transform 0.2s;
}

.section-hint {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.scoring-config-content {
  margin-top: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.config-item {
  margin-bottom: 24px;
}

.config-item:last-child {
  margin-bottom: 0;
}

.config-label {
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
  color: #606266;
  font-size: 14px;
}

/* Range Slider Styles */
.range-slider-container {
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.range-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.range-value {
  font-size: 13px;
  color: #606266;
}

.range-value strong {
  font-size: 16px;
  color: #409eff;
  margin-left: 4px;
}

/* Dual Slider Styles */
.dual-slider-container {
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.dual-slider-item {
  margin-bottom: 20px;
}

.dual-slider-item:last-of-type {
  margin-bottom: 16px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.slider-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.slider-value {
  font-size: 14px;
  font-weight: 600;
}

.dual-slider-sum {
  padding: 10px 12px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 6px;
  color: #f56c6c;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.dual-slider-sum.sum-valid {
  background: #f0f9ff;
  border-color: #b3d8ff;
  color: #409eff;
}

.dual-slider-sum i {
  font-size: 14px;
}

/* Config Actions */
.config-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  justify-content: flex-end;
}

.btn-reset {
  padding: 8px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: white;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-reset:hover:not(:disabled) {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}

.btn-reset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Disabled Hint */
.disabled-hint {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
  margin-left: 8px;
}

/* Enhanced disabled state for Slider */
.config-item :deep(.el-slider.is-disabled) {
  opacity: 0.4;
}

.config-item :deep(.el-slider.is-disabled .el-slider__bar) {
  background-color: #c0c4cc;
}
</style>
