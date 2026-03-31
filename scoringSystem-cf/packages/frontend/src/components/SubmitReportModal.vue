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
          <i :class="readOnly ? 'fas fa-history' : 'fas fa-paper-plane'"></i>
          {{ readOnly ? '成果版本檢視' : '發送報告' }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body">
      <!-- Alert Zone -->
      <DrawerAlertZone />

      <!-- 獎金顯示（readOnly 模式下隱藏） -->
      <div v-if="!readOnly" class="reward-info">
        <label class="reward-label">階段報告獎金</label>
        <div class="reward-amount">{{ reportReward }}</div>
      </div>

      <!-- 歷史版本區域 -->
      <div v-if="loadingHistoricalVersions || historicalVersions.length > 0" class="version-selector-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-history"></i>
            {{ readOnly ? '成果提交版本' : '參考歷史版本' }}
          </label>
        </div>

        <!-- 載入中狀態 -->
        <div v-if="loadingHistoricalVersions" class="version-loading" v-loading="true" element-loading-text="載入歷史版本中...">
          <div class="loading-placeholder">載入歷史版本中...</div>
        </div>

        <!-- 有歷史版本 -->
        <div v-else-if="historicalVersions.length > 0" class="version-content">
          <el-select
            v-model="selectedHistoricalVersion"
            class="version-selector"
            :placeholder="readOnly ? '選擇版本檢視內容' : '選擇歷史版本以快速填入內容'"
            @change="handleHistoricalVersionChange"
            :clearable="!readOnly"
          >
            <el-option
              v-for="version in historicalVersions"
              :key="version.submissionId"
              :label="`${formatVersionTime(version.submittedTime)} - ${getSubmitterName(version.submitter)}`"
              :value="version.submissionId"
            >
              <span class="version-option">
                {{ formatVersionTime(version.submittedTime) }} - {{ getSubmitterName(version.submitter) }}
                <span class="version-tag withdrawn">(已撤回)</span>
              </span>
            </el-option>
          </el-select>

          <div v-if="selectedHistoricalVersion && !readOnly" class="version-info">
            <i class="fas fa-info-circle"></i>
            選擇歷史版本後會自動填入該版本的報告內容和點數分配，您可以在此基礎上進行修改
          </div>
        </div>

        <!-- 無歷史版本（隱藏整個區域） -->
      </div>

      <!-- readOnly 模式無版本時顯示空狀態 -->
      <div v-if="readOnly && !loadingHistoricalVersions && historicalVersions.length === 0" style="text-align: center; padding: 40px 20px; color: #909399;">
        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
        <div>此階段尚無成果提交紀錄</div>
      </div>

      <!-- Markdown 編輯區 -->
      <div v-if="!readOnly" class="editor-section">
        <MdEditorWrapper
          v-model="content"
          :placeholder="placeholder"
        />
      </div>

      <!-- readOnly 模式：顯示報告內容預覽 -->
      <div v-if="readOnly && content" class="editor-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-file-alt"></i>
            報告內容
          </label>
        </div>
        <MdPreviewWrapper :content="content" />
      </div>

      <!-- 參與者選擇區域 -->
      <div class="participants-section">
        <div class="section-header">
          <label class="section-label">
            <i class="fas fa-users"></i> 參與者貢獻度分配
          </label>
          <div v-if="!readOnly" class="header-actions">
            <button class="btn-equal-split" @click="equalSplit">
              <i class="fas fa-balance-scale"></i> 均分
            </button>
            <SimulationControls
              :simulatedRank="simulatedRank"
              @update:simulatedRank="simulatedRank = $event"
              :simulatedGroupCount="simulatedGroupCount"
              @update:simulatedGroupCount="simulatedGroupCount = $event"
              :totalActiveGroups="totalActiveGroups"
              :totalProjectGroups="totalProjectGroups"
              :totalPercentage="totalPercentage"
              :showTotalPercentage="true"
            />
          </div>
        </div>

        <!-- 參與者列表 -->
        <div class="participants-list">
          <div v-for="member in groupMembers" :key="member.email" class="participant-item">
            <div class="participant-info">
              <el-avatar
                :src="generateMemberAvatarUrl(member)"
                :alt="`${member.displayName}的頭像`"
                shape="square"
                :size="32"
                class="member-avatar"
                @error="handleAvatarError(member.email)"
              >
                {{ generateMemberInitials(member) }}
              </el-avatar>

              <el-checkbox
                v-model="member.selected"
                :label="member.displayName"
                :disabled="readOnly || member.isSubmitter"
                class="member-checkbox"
              />
              <span v-if="member.isSubmitter" class="submitter-tag">(提交者)</span>
            </div>

            <div class="contribution-controls">
              <el-slider
                v-model="member.contribution"
                :key="`slider-${member.email}`"
                :min="1"
                :max="100"
                :step="1"
                :disabled="readOnly || !member.selected"
                :show-tooltip="true"
                :format-tooltip="(val: number) => `${val}%`"
                @input="updateContributions"
              />
              <el-input-number
                v-model="member.contribution"
                :key="`input-${member.email}`"
                :min="1"
                :max="100"
                :step="1"
                :disabled="readOnly || !member.selected"
                size="small"
                controls-position="right"
                @change="updateContributions"
              />
              <span class="percentage-sign">%</span>
            </div>
          </div>
        </div>

        <!-- 權重分配預覽 -->
        <div class="contribution-chart">
          <div class="chart-description">
            <i class="fas fa-trophy" :style="{ color: getRankColor(simulatedRank) }"></i>
            <span>全組競爭權重分配視覺化 (包含其他組的均分假設，每方塊=1權重)</span>
          </div>
          <div class="chart-note">
            <i class="fas fa-lightbulb"></i> <strong>說明：</strong>上圖顯示組內個人分配，下圖顯示與其他組的競爭比較
          </div>

          <el-button
            type="primary"
            style="margin-bottom: 15px;"
            @click="showScoringExplanation = true"
          >
            <i class="fas fa-calculator"></i> 點數計算說明
          </el-button>

          <!-- 使用共享組件 -->
          <OurGroupChart
            :members="membersWithPoints as any"
            :simulatedRank="simulatedRank"
            :simulatedGroupCount="simulatedGroupCount"
            :reportReward="reportReward"
            :allGroups="allGroups"
            :currentGroupId="currentGroup?.groupId"
            :totalPercentage="totalPercentage"
          />

          <AllGroupsChart
            :selectedMembers="membersWithPoints"
            :simulatedRank="simulatedRank"
            :simulatedGroupCount="simulatedGroupCount"
            :reportReward="reportReward"
            :allGroups="allGroupsDataCalculated"
            :currentGroupId="currentGroup?.groupId"
            :totalProjectGroups="totalProjectGroups"
          />

        </div>
      </div>

      <!-- 確認發布區域（readOnly 模式下隱藏） -->
      <div v-if="!readOnly" class="confirmation-section">
        <ConfirmationInput
          v-model="confirmationText"
          keyword="SUBMIT"
          hint-action="發布"
        >
          <template #hint>
            輸入 <strong>SUBMIT</strong> 發布 ｜ 貴組組員共 {{ totalMembersCount }} 人，你勾選了 {{ selectedParticipantsCount }} 名參與者（包括你自己）
          </template>
        </ConfirmationInput>
      </div>

      <!-- 操作按鈕 -->
      <div class="drawer-actions">
        <el-button
          v-if="props.stageDescription"
          type="info"
          @click="showStageDescriptionDrawer = true"
        >
          <i class="fas fa-info-circle"></i> 階段描述
        </el-button>
        <el-button v-if="!readOnly" type="primary" @click="submitReport" :disabled="!canSubmit" :loading="submitting">
          <i v-if="!submitting" class="fas fa-paper-plane"></i>
          {{ submitting ? '提交中...' : '送出' }}
        </el-button>
        <el-button v-if="!readOnly" type="warning" @click="clearContent">
          <i class="fas fa-eraser"></i> 清除重填
        </el-button>
      </div>
    </div>

    <!-- Scoring Explanation Drawer -->
    <ScoringExplanationDrawer
      v-if="membersWithPoints.length > 0"
      v-model:visible="showScoringExplanation"
      :group-data="{
        groupName: availableGroups?.find(g => g.groupId === selectedGroup)?.groupName || '我們組',
        finalRank: simulatedRank,
        totalGroups: simulatedGroupCount,
        allocatedPoints: membersWithPoints.reduce((sum: number, m: any) => sum + (m.points || 0), 0),
        members: membersWithPoints.map((m: any) => ({
          email: m.email,
          displayName: m.displayName,
          contribution: m.contribution,
          points: m.points || 0
        }))
      }"
      :project-config="{
        studentWeight: 0.7,
        teacherWeight: 0.3,
        rewardPool: reportReward
      }"
      mode="report"
    />

    <!-- Stage Description Drawer -->
    <StageDescriptionDrawer
      v-model:visible="showStageDescriptionDrawer"
      :stage-name="stageTitle"
      :stage-description="props.stageDescription || ''"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, type Ref, type ComponentPublicInstance } from 'vue'
import SimulationControls from './shared/ContributionChart/SimulationControls.vue'
import OurGroupChart from './shared/ContributionChart/OurGroupChart.vue'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import ScoringExplanationDrawer from './shared/ScoringExplanationDrawer.vue'
import StageDescriptionDrawer from './shared/StageDescriptionDrawer.vue'
import DrawerAlertZone from './common/DrawerAlertZone.vue'
import ConfirmationInput from './common/ConfirmationInput.vue'
import MdEditorWrapper from './MdEditorWrapper.vue'
import MdPreviewWrapper from './MdPreviewWrapper.vue'
import { usePointCalculation } from '@/composables/usePointCalculation'
import { useAvatar } from '@/composables/useAvatar'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'
import { useSudoStore } from '@/stores/sudo'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()
import { rpcClient } from '@/utils/rpc-client'
import { ElMessage } from 'element-plus'

// TypeScript interfaces
interface GroupMember {
  email: string
  displayName: string
  avatarSeed?: string
  avatarStyle?: string
  avatarOptions?: string
  selected: boolean
  isSubmitter: boolean
  contribution: number
  points?: number        // Calculated points for this member
  finalWeight?: number   // Final calculated weight for scoring
}

interface HistoricalVersion {
  submissionId: string
  content: string
  submitter: string
  submittedTime: string
  participationProposal?: Record<string, number>
  actualAuthors?: string[]
  status?: string
  groupId?: string
}

interface CurrentGroup {
  groupId: string
  members: Array<{
    email?: string
    userEmail?: string
    displayName?: string
    avatarSeed?: string
    avatarStyle?: string
    avatarOptions?: string
  }>
}

// Props
export interface Props {
  visible: boolean
  stageId: string
  projectTitle?: string
  stageTitle?: string
  reportReward?: number
  availableGroups?: any[]
  currentUserEmail?: string
  currentGroup?: CurrentGroup
  allGroups?: any[]
  projectId: string
  totalActiveGroups: number
  totalProjectGroups: number
  stageDescription?: string
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  stageId: '',
  projectTitle: '',
  stageTitle: '',
  reportReward: 1000,
  availableGroups: () => [],
  currentUserEmail: '',
  currentGroup: () => ({ groupId: '', members: [] }),
  allGroups: () => [],
  projectId: '',
  totalActiveGroups: 4,
  totalProjectGroups: 4,
  stageDescription: '',
  readOnly: false
})

// Emits
interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'submit', data: { success: boolean; submissionId?: string; [key: string]: any }): void
}

const emit = defineEmits<Emits>()

// Composables
const {
  generateMemberAvatarUrl,
  generateMemberInitials,
  handleMemberAvatarError: handleAvatarError
} = useAvatar()

const {
  getRankColor,
  calculateScoring,
  calculateAllGroupsScoring
} = usePointCalculation()

const {
  addAlert,
  warning,
  removeAlert,
  clearAlerts
} = useDrawerAlerts()

// Sudo Mode
const sudoStore = useSudoStore()

// State
const content = ref<string>('')
const selectedGroup = ref<string>('')
const groupMembers = ref<GroupMember[]>([])
const simulatedRank = ref<number>(1)
const simulatedGroupCount = ref<number>(4)
const submitting = ref<boolean>(false)
const placeholder = ref<string>('我覺得做得很讚的就是@A，他們的成果和 [Google](www.google.com) 上能找到的一模一樣！')
const historicalVersions = ref<HistoricalVersion[]>([])
const selectedHistoricalVersion = ref<string>('')
const loadingHistoricalVersions = ref<boolean>(false)
const showScoringExplanation = ref<boolean>(false)
const showStageDescriptionDrawer = ref<boolean>(false)
const confirmationText = ref<string>('')
let validationAlertId: string | null = null
let validationDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Computed
const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const canSubmit = computed<boolean>(() => {
  return content.value.trim().length > 0
    && totalPercentage.value === 100
    && !submitting.value
    && confirmationText.value === 'SUBMIT'
})

const totalPercentage = computed<number>(() => {
  return groupMembers.value
    .filter(m => m.selected)
    .reduce((sum, m) => sum + m.contribution, 0)
})

const selectedAuthors = computed<string[]>(() => {
  return groupMembers.value
    .filter(m => m.selected)
    .map(m => m.email)
})

const selectedParticipantsCount = computed<number>(() => {
  return groupMembers.value.filter(m => m.selected).length
})

const totalMembersCount = computed<number>(() => {
  return groupMembers.value.length
})

const participationProposal = computed<Record<string, number>>(() => {
  const proposal: Record<string, number> = {}
  groupMembers.value
    .filter(m => m.selected && m.contribution > 0)
    .forEach(m => {
      proposal[m.email] = m.contribution / 100
    })
  return proposal
})

// Calculate points for our group members (for OurGroupChart)
const membersWithPoints = computed(() => {
  const selectedMembers = groupMembers.value.filter(
    m => m.selected && m.contribution > 0
  )

  // Only calculate if we have members and total percentage is 100%
  if (selectedMembers.length === 0 || totalPercentage.value !== 100) {
    return selectedMembers
  }

  // Calculate points using the scoring algorithm
  const result = calculateScoring(
    selectedMembers,
    simulatedRank.value,
    props.reportReward,
    simulatedGroupCount.value,
    (props.allGroups || []) as any,
    (props.currentGroup?.groupId || null) as any
  )

  return result
})

// Calculate all groups data for competition visualization (for AllGroupsChart)
const allGroupsDataCalculated = computed(() => {
  // Only calculate if we have members with points
  if (membersWithPoints.value.length === 0) {
    return props.allGroups || []
  }

  const result = calculateAllGroupsScoring(
    membersWithPoints.value,
    simulatedRank.value,
    props.reportReward,
    simulatedGroupCount.value,
    (props.allGroups || []) as any,
    (props.currentGroup?.groupId || null) as any
  )

  return result
})

const safeSliderMin = computed<number>(() => {
  const min = Math.max(1, props.totalActiveGroups)
  const max = props.totalProjectGroups

  if (min > max) {
    console.error('🚨 [SubmitReportModal] Slider 參數異常！', {
      totalActiveGroups: props.totalActiveGroups,
      totalProjectGroups: props.totalProjectGroups,
      calculatedMin: min,
      calculatedMax: max,
      issue: '已提交組數 > 專案總組數（不應該發生）'
    })
    return Math.min(min, max)
  }

  return min
})

// Watch
watch(() => props.visible, (newVal) => {
  if (newVal) {
    console.log('🚀 [SubmitReportModal] Drawer opened with props:', {
      projectId: props.projectId,
      stageId: props.stageId,
      groupId: props.currentGroup?.groupId,
      hasProjectId: !!props.projectId,
      hasStageId: !!props.stageId,
      hasGroupId: !!props.currentGroup?.groupId,
      readOnly: props.readOnly
    })

    // readOnly 模式（SUDO）：顯示唯讀提示
    if (props.readOnly && sudoStore.isActive) {
      addAlert({
        type: 'info',
        title: '唯讀模式',
        message: `您正在以 SUDO 模式查看 ${sudoStore.targetUser?.displayName || '學生'} 的成果提交版本紀錄。`,
        closable: false,
        autoClose: 0
      })
    }

    initializeGroupMembers()
    loadHistoricalVersions()
  } else {
    content.value = ''
    submitting.value = false
    confirmationText.value = ''
    resetParticipants()
    resetHistoricalVersions()
    clearAlerts()
    validationAlertId = null
    // Clear debounce timer on drawer close
    if (validationDebounceTimer) {
      clearTimeout(validationDebounceTimer)
      validationDebounceTimer = null
    }
  }
})

watch(() => props.totalActiveGroups, (newVal, oldVal) => {
  console.log(`totalActiveGroups 更新: ${oldVal} → ${newVal}`)

  // 確保 simulatedGroupCount 至少為 1（即使沒有其他組提交，至少有當前組）
  const safeGroupCount = Math.max(1, newVal)

  if (!simulatedGroupCount.value || simulatedGroupCount.value < safeGroupCount) {
    simulatedGroupCount.value = safeGroupCount
  }

  if (simulatedRank.value > safeGroupCount) {
    console.warn(`當前排名 ${simulatedRank.value} 超過組數 ${safeGroupCount}，重置為 1`)
    simulatedRank.value = 1
  }
})

watch(() => simulatedGroupCount.value, (newVal) => {
  console.log(`simulatedGroupCount 更新: ${newVal}`)
  if (simulatedRank.value > newVal) {
    console.warn(`當前排名 ${simulatedRank.value} 超過組數 ${newVal}，重置為 1`)
    simulatedRank.value = 1
  }
})

// Watch validation state and show alert dynamically (debounced to avoid flickering during slider drag)
watch([() => canSubmit.value, () => content.value, () => totalPercentage.value], () => {
  // Clear old validation alert immediately
  if (validationAlertId) {
    removeAlert(validationAlertId)
    validationAlertId = null
  }

  // Clear existing debounce timer
  if (validationDebounceTimer) {
    clearTimeout(validationDebounceTimer)
    validationDebounceTimer = null
  }

  // Debounce validation alert by 500ms to avoid flickering during slider drag
  validationDebounceTimer = setTimeout(() => {
    if (!canSubmit.value && (content.value.length > 0 || totalPercentage.value > 0)) {
      const message = getValidationMessage()
      if (message) {
        validationAlertId = warning(message, '驗證提示')
      }
    }
  }, 500)
})

// Methods
const submitReport = async (): Promise<void> => {
  if (!canSubmit.value) return

  submitting.value = true
  try {
    if (!props.projectId) {
      ElMessage.error('缺少專案ID')
      return
    }

    const submissionData = {
      content: content.value,
      type: 'report',
      authors: selectedAuthors.value,
      participationProposal: participationProposal.value,
      metadata: {
        wordCount: content.value.length,
        submittedAt: new Date().toISOString()
      }
    }

    const httpResponse = await rpcClient.submissions.submit.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        submissionData: submissionData
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      ElMessage.success('報告提交成功！')

      emit('submit', {
        success: true,
        submissionId: response.data.submissionId,
        ...submissionData
      })

      localVisible.value = false
    } else {
      ElMessage.error(response.error?.message || '提交報告失敗')
    }
  } catch (error) {
    console.error('提交報告錯誤:', error)
    ElMessage.error('提交報告時發生錯誤')
  } finally {
    submitting.value = false
  }
}

const clearContent = (): void => {
  content.value = ''
  resetParticipants()
}

const initializeGroupMembers = (): void => {
  console.log('SubmitReportModal initializeGroupMembers 調試:', {
    currentGroup: props.currentGroup,
    currentUserEmail: props.currentUserEmail,
    hasCurrentGroup: !!props.currentGroup,
    hasMembers: !!(props.currentGroup && props.currentGroup.members),
    membersCount: props.currentGroup?.members?.length || 0
  })

  if (props.currentGroup && props.currentGroup.members) {
    console.log('原始成員資料:', props.currentGroup.members)

    groupMembers.value = props.currentGroup.members.map(member => {
      const memberEmail = member.email || member.userEmail

      const displayName = member.displayName || (memberEmail ? memberEmail.split('@')[0] : '用戶')

      return {
        email: memberEmail || '',
        displayName: displayName,
        avatarSeed: member.avatarSeed,
        avatarStyle: member.avatarStyle,
        avatarOptions: member.avatarOptions,
        selected: memberEmail === props.currentUserEmail,
        isSubmitter: memberEmail === props.currentUserEmail,
        contribution: memberEmail === props.currentUserEmail ? 100 : 0
      }
    })

    console.log('處理後的 groupMembers:', groupMembers.value)
  } else {
    console.log('沒有群組資料，使用當前用戶作為唯一成員')
    groupMembers.value = [{
      email: props.currentUserEmail || '',
      displayName: '我',
      selected: true,
      isSubmitter: true,
      contribution: 100
    }]
  }
}

const resetParticipants = (): void => {
  groupMembers.value.forEach(member => {
    member.selected = member.isSubmitter
    member.contribution = member.isSubmitter ? 100 : 0
  })
}

const equalSplit = (): void => {
  groupMembers.value.forEach(member => {
    member.selected = true
  })

  const memberCount = groupMembers.value.length
  const basePercentage = Math.floor(100 / memberCount)
  const remainder = 100 - (basePercentage * memberCount)

  groupMembers.value.forEach((member, index) => {
    member.contribution = basePercentage
    if (index < remainder) {
      member.contribution += 1
    }
  })
}

const updateContributions = (): void => {
  const selectedMembers = groupMembers.value.filter(m => m.selected)
  if (selectedMembers.length === 0) return

  selectedMembers.forEach(member => {
    if (member.contribution < 1) {
      member.contribution = 1
    }
  })
}

const getValidationMessage = (): string => {
  if (content.value.trim().length === 0) {
    return '請填寫報告內容'
  }

  if (totalPercentage.value < 100) {
    return `組員工作點數分配低於100% (目前: ${totalPercentage.value}%)`
  }

  if (totalPercentage.value > 100) {
    return `組員工作點數分配超過100% (目前: ${totalPercentage.value}%)`
  }

  return ''
}

const loadHistoricalVersions = async (): Promise<void> => {
  console.log('🔍 [loadHistoricalVersions] Function called', {
    projectId: props.projectId,
    stageId: props.stageId,
    groupId: props.currentGroup?.groupId,
    hasProjectId: !!props.projectId,
    hasStageId: !!props.stageId
  })

  if (!props.projectId || !props.stageId) {
    console.warn('⚠️ [loadHistoricalVersions] Missing required props - skipping', {
      projectId: props.projectId,
      stageId: props.stageId
    })
    return
  }

  console.log('⏳ [loadHistoricalVersions] Setting loading state to true')
  loadingHistoricalVersions.value = true
  try {
    console.log('📡 [loadHistoricalVersions] Calling API...', {
      endpoint: '/submissions/versions',
      params: {
        projectId: props.projectId,
        stageId: props.stageId,
        groupId: props.currentGroup?.groupId,
        includeWithdrawn: true,
        includeActive: false
      }
    })

    const httpResponse = await rpcClient.submissions.versions.$post({
      json: {
        projectId: props.projectId,
        stageId: props.stageId,
        groupId: props.currentGroup?.groupId
      }
    })

    console.log('📥 [loadHistoricalVersions] API response received', {
      status: httpResponse.status,
      ok: httpResponse.ok,
      headers: Object.fromEntries(httpResponse.headers.entries())
    })

    const response = await httpResponse.json()

    console.log('📦 [loadHistoricalVersions] Response data:', {
      success: response.success,
      hasData: !!response.data,
      hasVersions: !!response.data?.versions,
      versionsCount: response.data?.versions?.length || 0,
      error: response.error
    })

    if (response.success) {
      console.log('✅ [loadHistoricalVersions] API call successful', {
        versionsCount: response.data?.versions?.length || 0,
        metadata: response.data?.metadata,
        currentGroupId: props.currentGroup?.groupId
      })

      historicalVersions.value = response.data?.versions || []

      console.log('📊 [loadHistoricalVersions] Versions details:', historicalVersions.value.map(v => ({
        submissionId: v.submissionId,
        status: v.status,
        groupId: v.groupId,
        submitter: v.submitter,
        submittedTime: v.submittedTime
      })))

      console.log(`🎯 [loadHistoricalVersions] Final result: ${historicalVersions.value.length} versions loaded (group: ${props.currentGroup?.groupId})`)

      // readOnly 模式：自動選擇最新版本
      if (props.readOnly && historicalVersions.value.length > 0) {
        const latestVersion = historicalVersions.value[historicalVersions.value.length - 1]
        selectedHistoricalVersion.value = latestVersion.submissionId
        await handleHistoricalVersionChange(latestVersion.submissionId)
      }
    } else {
      console.error('❌ [loadHistoricalVersions] API returned error:', response.error)
      historicalVersions.value = []
    }
  } catch (error) {
    console.error('💥 [loadHistoricalVersions] Exception occurred:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    })
    historicalVersions.value = []
  } finally {
    console.log('🏁 [loadHistoricalVersions] Setting loading state to false', {
      loadingHistoricalVersions: loadingHistoricalVersions.value,
      historicalVersionsLength: historicalVersions.value.length
    })
    loadingHistoricalVersions.value = false
  }
}

const handleHistoricalVersionChange = async (versionId: string): Promise<void> => {
  if (!versionId) {
    console.log('清除歷史版本選擇')
    return
  }

  try {
    console.log('選擇歷史版本:', versionId)

    const selectedVersion = historicalVersions.value.find(v => v.submissionId === versionId)
    if (!selectedVersion) {
      console.error('找不到選中的歷史版本:', versionId)
      return
    }

    content.value = selectedVersion.content || ''
    console.log('填入歷史版本內容，長度:', content.value.length)

    console.log('🔍 完整歷史版本數據:', {
      submissionId: selectedVersion.submissionId,
      content: selectedVersion.content?.substring(0, 50) + '...',
      participationProposal: selectedVersion.participationProposal,
      actualAuthors: selectedVersion.actualAuthors,
      groupMembers: groupMembers.value.map(m => ({ email: m.email, displayName: m.displayName }))
    })

    if (selectedVersion.participationProposal && Object.keys(selectedVersion.participationProposal).length > 0) {
      console.log('填入歷史版本的參與度分配:', selectedVersion.participationProposal)

      groupMembers.value.forEach(member => {
        member.selected = false
        member.contribution = 0
      })

      Object.entries(selectedVersion.participationProposal).forEach(([email, ratio]) => {
        const member = groupMembers.value.find(m => m.email === email)
        if (member) {
          member.selected = true
          member.contribution = Math.round(ratio * 100)
          console.log(`設定成員 ${member.displayName}: ${member.contribution}%`)
        }
      })
    }

    ElMessage.success(`已載入 ${getSubmitterName(selectedVersion.submitter)} 在 ${formatVersionTime(selectedVersion.submittedTime)} 的版本內容`)

  } catch (error) {
    console.error('載入歷史版本時發生錯誤:', error)
    ElMessage.error('載入歷史版本失敗')
  }
}

const resetHistoricalVersions = (): void => {
  historicalVersions.value = []
  selectedHistoricalVersion.value = ''
  loadingHistoricalVersions.value = false
}

const formatVersionTime = (timestamp: string): string => {
  if (!timestamp) return '未知時間'
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

const getSubmitterName = (submitterEmail: string): string => {
  if (!submitterEmail) return '未知用戶'

  const member = groupMembers.value.find(m => m.email === submitterEmail)
  if (member) {
    return member.displayName
  }

  return submitterEmail.includes('@') ? submitterEmail.split('@')[0] : submitterEmail
}
</script>

<style scoped>
/* Breadcrumb Navigation */
.breadcrumb-section {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e8ed;
}

.breadcrumb-section :deep(.el-breadcrumb) {
  font-size: 14px;
}

.breadcrumb-section :deep(.el-breadcrumb__item) {
  color: #7f8c8d;
}

.breadcrumb-section :deep(.el-breadcrumb__item:last-child) {
  color: #2c3e50;
  font-weight: 500;
}

.reward-info {
  padding: 20px 25px;
  display: flex;
  align-items: center;
  gap: 15px;
  border-bottom: 1px solid #e1e8ed;
}

.reward-label {
  background: #2c3e50;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
}

.reward-amount {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

/* 參考歷史版本區域 */
.version-selector-section {
  padding: 20px 25px;
  border-bottom: 1px solid #e1e8ed;
  background: #fafbfc;
}

.version-selector-section .section-header {
  margin-bottom: 15px;
}

.version-selector-section .section-label {
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.version-loading {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #d0d7de;
  border-radius: 8px;
  background: #f6f8fa;
}

.loading-placeholder {
  color: #656d76;
  font-size: 14px;
}

.version-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-selector {
  width: 100%;
}

.version-selector :deep(.el-select__wrapper) {
  border: 2px solid #d0d7de;
  border-radius: 8px;
  padding: 8px 12px;
  transition: border-color 0.2s;
}

.version-selector :deep(.el-select__wrapper:hover) {
  border-color: #8b949e;
}

.version-selector :deep(.el-select__wrapper.is-focused) {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.12);
}

.version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.version-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.version-tag.withdrawn {
  background: #fff1f0;
  color: #d73a49;
  border: 1px solid #fdb8c0;
}

.version-info {
  background: #e7f3ff;
  border: 1px solid #b6e3ff;
  border-radius: 8px;
  padding: 12px;
  color: #0969da;
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.5;
}

.version-info i {
  margin-top: 2px;
  flex-shrink: 0;
}

.editor-section {
  padding: 0 25px 20px;
}

.editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 15px 0;
  border-bottom: 1px solid #e1e8ed;
  margin-bottom: 15px;
}

.tool-btn {
  background: #f8f9fa;
  border: 1px solid #e1e8ed;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
  transition: all 0.2s;
  min-width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover {
  background: #e9ecef;
  border-color: #999;
  transform: translateY(-1px);
}

.tool-btn:active {
  transform: translateY(0);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e1e8ed;
  margin: 0 8px;
}

.preview-btn.active {
  background: #3498db;
  color: white;
  border-color: #3498db;
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-preview {
  flex: 1;
  padding: 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  background: #f8f9fa;
  overflow-y: auto;
  min-height: 200px;
}

.preview-content {
  line-height: 1.6;
  color: #2c3e50;
}

.preview-content :deep(h1),
.preview-content :deep(h2),
.preview-content :deep(h3) {
  margin: 20px 0 10px 0;
  font-weight: 600;
}

.preview-content :deep(h1) {
  font-size: 24px;
  color: #2c3e50;
}

.preview-content :deep(h2) {
  font-size: 20px;
  color: #34495e;
}

.preview-content :deep(h3) {
  font-size: 16px;
  color: #34495e;
}

.preview-content :deep(p) {
  margin: 10px 0;
}

.preview-content :deep(code) {
  background: #f1f2f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.preview-content :deep(pre) {
  background: #2c3e50;
  color: #fff;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 15px 0;
}

.preview-content :deep(pre code) {
  background: none;
  padding: 0;
  color: #fff;
}

.preview-content :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(strong) {
  font-weight: 600;
  color: #2c3e50;
}

.preview-content :deep(em) {
  font-style: italic;
  color: #7f8c8d;
}

.markdown-editor {
  width: 100%;
  min-height: 200px;
  padding: 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.3s;
}

.markdown-editor:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.markdown-editor::placeholder {
  color: #7f8c8d;
}

.target-group-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.participants-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.btn-equal-split {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
}

.btn-equal-split:hover {
  background: #138496;
  transform: translateY(-1px);
}

.rank-simulation {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rank-simulation label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
}

.rank-selector {
  width: 100px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  background: white;
  color: #2c3e50;
  cursor: pointer;
}

.rank-selector:focus {
  outline: none;
  border-color: #3498db;
}

.group-count-simulation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}

.group-count-simulation label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.group-count-slider {
  width: 100%;
}

.section-label {
  display: flex;
  align-items: center;
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  width: fit-content;
}

.section-label i {
  margin-right: 8px;
}

.total-percentage {
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.total-percentage.valid {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.total-percentage.invalid {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.participants-list {
  margin-bottom: 20px;
}

.participant-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  margin-bottom: 10px;
  background: white;
}

.participant-info {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12px;
}

.member-avatar {
  flex-shrink: 0;
  border: 2px solid #e1e8ed;
  transition: all 0.2s;
}

.member-avatar:hover {
  border-color: #3498db;
  transform: scale(1.05);
}

.member-checkbox {
  flex: 1;
}

.participant-info .el-checkbox {
  margin-right: 10px;
}

.submitter-tag {
  background: #3498db;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 10px;
}

.contribution-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 300px;
}

.contribution-controls .el-slider {
  flex: 1;
}

.contribution-controls .el-input-number {
  width: 80px;
}

.percentage-sign {
  color: #666;
  font-weight: 500;
}

.contribution-chart {
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 15px;
  margin-top: 15px;
}

.contribution-chart svg {
  width: 100%;
  height: auto;
}

.chart-description {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border-left: 4px solid #f39c12;
}

.chart-description span {
  font-size: 13px;
  color: #2c3e50;
  font-weight: 500;
}

.chart-note {
  margin-bottom: 10px;
  padding: 8px 12px;
  background: #e3f2fd;
  border-radius: 4px;
  font-size: 12px;
  color: #1976d2;
  border-left: 3px solid #2196f3;
}

.group-selector {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e1e8ed;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2c3e50;
  transition: border-color 0.3s;
}

.group-selector:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

/* Action Buttons - Using unified .drawer-actions from drawer-unified.scss */

/* 確認發布區域 */
.confirmation-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}
</style>
