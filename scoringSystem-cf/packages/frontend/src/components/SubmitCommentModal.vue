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
          <i class="fas fa-comment"></i>
          張貼評論
        </el-breadcrumb-item>
      </el-breadcrumb>
    </template>
    <div class="drawer-body">
      <!-- DrawerAlertZone - 統一的 Alert 區域 -->
      <DrawerAlertZone />

      <!-- 獎金顯示 -->
      <div class="reward-info">
        <label class="reward-label">階段評論獎金</label>
        <div class="reward-amount">{{ commentReward || 500 }}</div>
      </div>

      <!-- Markdown 編輯區 -->
      <div class="editor-section">
        <!-- 編輯區域 - 使用 MdEditorWrapper -->
        <div class="editor-content">
          <MdEditorWrapper
            ref="editorRef"
            v-model="content"
            :placeholder="placeholder"
            :enable-mention="true"
            @mention-trigger="handleMentionTrigger"
            @mention-close="hideMentionDropdown"
            @keydown="handleKeydown"
          />

          <!-- @mention 下拉選單 -->
          <div
            v-if="showMentionDropdown"
            class="mention-dropdown"
            :style="mentionDropdownStyle"
          >
            <!-- Empty state - 無可 mention 的用戶 -->
            <EmptyState
              v-if="filteredUsers.length === 0"
              parent-icon="fa-at"
              title="目前沒有任何組有繳交階段成果，因此無法@任何人"
              compact
              :enable-animation="false"
            />

            <!-- User/Group list -->
            <template v-else>
              <div
                v-for="(option, index) in filteredUsers"
                :key="option.isGroup ? `group-${option.groupId}` : `user-${option.userEmail}`"
                class="mention-item"
                :class="{
                  active: index === selectedMentionIndex,
                  'is-group': option.isGroup
                }"
                @click="selectMention(option)"
              >
                <span
                  class="mention-name"
                  :style="option.isGroup ? {color: 'maroon'} : {}"
                >
                  {{ option.isGroup ? option.name : `${option.name} (${option.userEmail})` }}
                  <span v-if="option.groupInfo && !option.isGroup" class="group-badge">{{ option.groupInfo.groupName }}</span>
                </span>
                <span v-if="!option.isGroup" class="mention-group">{{ option.groupNames.join('、') }}</span>
                <span v-if="!option.isGroup && option.groupInfo" class="voting-tip">@用戶將自動標記所屬群組</span>
                <span v-if="option.isGroup" class="group-mention-hint">
                  點選將 @全組 {{ option.participantEmails.length }} 位成員
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 假設性點數預覽：如果這個評論獲得排名 -->
      <div v-if="canShowPreview" class="hypothetical-preview-section">
        <div class="preview-title">
          <i class="fas fa-crystal-ball"></i>
          假設您的評論進入前{{ dynamicMaxCommentSelections }}名
        </div>

        <!-- 分段控制器 -->
        <div class="rank-segmented-wrapper">
          <el-segmented
            v-model="previewScenario"
            :options="rankOptions"
            size="large"
          />
        </div>

        <!-- 單一圖表組件 -->
        <AllGroupsChart
          :selected-members="currentAuthorMembers"
          :simulated-rank="previewScenario"
          :simulated-group-count="dynamicMaxCommentSelections"
          :report-reward="commentReward"
          :all-groups="hypotheticalGroups"
          :current-group-id="currentUser.userEmail"
          :total-project-groups="dynamicMaxCommentSelections"
        />

        <div class="preview-hint">
          <i class="fas fa-lightbulb"></i> 這是預估點數，實際排名由其他同學投票決定
        </div>
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

        <!-- 如果没有 mention，打开确认抽屉 -->
        <el-button
          v-if="mentionCount === 0"
          type="primary"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="showNoMentionConfirmDrawer = true"
        >
          <i v-if="!submitting" class="fas fa-paper-plane"></i>
          送出
        </el-button>

        <!-- 如果有 mention，直接显示普通按钮 -->
        <el-button
          v-else
          type="primary"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="submitComment"
        >
          <i v-if="!submitting" class="fas fa-paper-plane"></i>
          送出
        </el-button>

        <el-button type="warning" @click="clearContent">
          <i class="fas fa-eraser"></i>
          清除重填
        </el-button>
      </div>
    </div>

    <!-- Stage Description Drawer -->
    <StageDescriptionDrawer
      v-model:visible="showStageDescriptionDrawer"
      :stage-name="stageTitle"
      :stage-description="props.stageDescription || ''"
      :report-reward="props.reportReward"
      :comment-reward="props.commentReward"
    />

    <!-- 無標記確認抽屜 -->
    <el-drawer
      v-model="showNoMentionConfirmDrawer"
      title="確認送出無標記評論"
      direction="ttb"
      size="100%"
      class="drawer-maroon"
      :append-to-body="true"
    >
      <template #header>
        <el-breadcrumb separator=">">
          <el-breadcrumb-item>
            <i class="fas fa-comment"></i>
            張貼評論
          </el-breadcrumb-item>
          <el-breadcrumb-item>
            <i class="fas fa-exclamation-triangle"></i>
            確認送出無標記評論
          </el-breadcrumb-item>
        </el-breadcrumb>
      </template>
      <div class="drawer-body">
        <div class="form-section warning-section">
          <h4><i class="fas fa-exclamation-triangle"></i> 重要警告</h4>
          <p class="warning-text">
            你的評論沒有標記任何其他組，這樣會讓你和這份評論都<strong>無法參與評論排名分獎金</strong>！
          </p>
          <p class="warning-text">
            如果您確定要送出這則無標記的評論，請在下方輸入 <code>COMMENT</code> 確認。
          </p>

          <div class="form-group">
            <label>請輸入 <strong>COMMENT</strong> 確認送出：</label>
            <el-input
              v-model="confirmationInput"
              placeholder="輸入 COMMENT"
              size="large"
              @keyup.enter="confirmAndSubmit"
            />
          </div>
        </div>

        <div class="drawer-actions">
          <el-button
            type="danger"
            :disabled="!canConfirmNoMention"
            :loading="submitting"
            @click="confirmAndSubmit"
          >
            <i class="fas fa-paper-plane"></i>
            確認送出
          </el-button>
          <el-button @click="closeNoMentionDrawer">
            <i class="fas fa-times"></i>
            取消
          </el-button>
        </div>
      </div>
    </el-drawer>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import AllGroupsChart from './shared/ContributionChart/AllGroupsChart.vue'
import DrawerAlertZone from './common/DrawerAlertZone.vue'
import StageDescriptionDrawer from './shared/StageDescriptionDrawer.vue'
import EmptyState from './shared/EmptyState.vue'
import MdEditorWrapper from './MdEditorWrapper.vue'
import { useDrawerAlerts } from '@/composables/useDrawerAlerts'
import { rpcClient } from '@/utils/rpc-client'
import { useDrawerBreadcrumb } from '@/composables/useDrawerBreadcrumb'

// Drawer Breadcrumb
const { currentPageName, currentPageIcon } = useDrawerBreadcrumb()

// Props
export interface Props {
  visible: boolean
  projectId: string
  stageId: string
  maxCommentSelections: number  // 必需 - 評論選擇數量上限（從專案配置獲取）
  commentRewardPercentile: number  // 必需 - 評論獎勵百分比（0 = 使用固定 TOP N，>0 = 使用百分比）
  totalValidCommentAuthors?: number  // 當前有效評論作者總數（用於百分比模式顯示）
  commentReward?: number
  reportReward?: number
  projectTitle?: string
  stageTitle?: string
  availableGroups?: any[]
  availableUsers?: any[]
  userGroups?: any[]
  currentUser?: any
  stageSubmissions?: any[]
  userEmailToDisplayName?: Record<string, string>
  stageDescription?: string
  prefillMentionGroup?: {
    groupId: string
    groupName: string
    participants: string[]
  } | null
}

const props = withDefaults(defineProps<Props>(), {
  totalValidCommentAuthors: 0,
  commentReward: 500,
  projectTitle: '',
  stageTitle: '',
  availableGroups: () => [],
  availableUsers: () => [],
  userGroups: () => [],
  currentUser: () => ({}),
  stageSubmissions: () => [],
  userEmailToDisplayName: () => ({}),
  stageDescription: '',
  prefillMentionGroup: null
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'submit': [data: { success: boolean; commentId?: string; content: string }]
}>()

// DrawerAlerts composable
const { warning, addAlert, removeAlert, clearAlerts } = useDrawerAlerts()

// Debounce variables for mention validation alert
let mentionAlertId: string | null = null
let mentionDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Refs
const editorRef = ref<InstanceType<typeof MdEditorWrapper> | null>(null)
const content = ref('')
const submitting = ref(false)
const mentionCount = ref(0)
const groupMentions = ref<Array<{
  groupId: string
  groupName: string
  participants: string[]
  mentionText: string
}>>([])
const previewScenario = ref(1)
const showMentionDropdown = ref(false)
const mentionQuery = ref('')
const selectedMentionIndex = ref(0)
const mentionDropdownStyle = ref<Record<string, string>>({})

// No-mention confirmation drawer state
const showNoMentionConfirmDrawer = ref(false)
const confirmationInput = ref('')
const showStageDescriptionDrawer = ref(false)
const canConfirmNoMention = computed(() => confirmationInput.value === 'COMMENT')

// Constants
const placeholder = '我覺得做得很讚的就是@第一組，他們的成果和 [Google](www.google.com) 上能找到的一模一樣！\n\n💡 提示：必須在評論中@提及至少一組才能參與投票！'

// 動態計算可選評論數量（根據模式）
const dynamicMaxCommentSelections = computed((): number => {
  if (props.commentRewardPercentile === 0) {
    // 固定 TopN 模式：直接使用 props.maxCommentSelections
    return props.maxCommentSelections
  } else {
    // 百分比模式：根據有效評論作者數量計算
    // 如果還沒載入評論，使用 props.maxCommentSelections 作為 fallback
    if (props.totalValidCommentAuthors === 0) {
      return props.maxCommentSelections
    }
    return Math.ceil(props.totalValidCommentAuthors * props.commentRewardPercentile / 100)
  }
})

// 計算排名規則 alert 標題（響應式更新）
const rankingAlertTitle = computed((): string => {
  if (props.commentRewardPercentile === 0) {
    return `📊 本專案採用固定排名模式：有效評論排名前 ${props.maxCommentSelections} 名可獲得獎金`
  } else {
    const totalAuthors = props.totalValidCommentAuthors
    const qualifiedCount = Math.ceil(totalAuthors * props.commentRewardPercentile / 100)
    return `📊 本專案採用百分比模式：前 ${props.commentRewardPercentile}% 的有效評論作者（也就是 ${totalAuthors} × ${props.commentRewardPercentile}% = ${qualifiedCount} 人）可獲得獎金`
  }
})

// 排名選項（用於 el-segmented）- 動態生成
const rankOptions = computed(() => {
  const medals = ['🥇', '🥈', '🥉']
  return Array.from({ length: dynamicMaxCommentSelections.value }, (_, i) => ({
    label: `${medals[i] || '🏅'} 第${i + 1}名`,
    value: i + 1
  }))
})

// Computed - localVisible v-model wrapper
const localVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val)
})

// Computed - canSubmit
const canSubmit = computed(() => {
  return content.value.trim().length > 0 && !submitting.value
})

// Computed - canShowPreview
const canShowPreview = computed(() => {
  return content.value.trim().length > 0 && mentionCount.value > 0
})

// Computed - currentAuthorMembers
const currentAuthorMembers = computed(() => {
  if (!props.currentUser?.userEmail) return []

  return [{
    email: props.currentUser.userEmail,
    displayName: props.currentUser.displayName || props.currentUser.userEmail,
    contribution: 100  // 單人組固定 100%
  }]
})

// Computed - hypotheticalGroups
const hypotheticalGroups = computed(() => {
  const groups: any[] = []

  // 當前作者
  if (props.currentUser?.userEmail) {
    groups.push({
      groupId: props.currentUser.userEmail,
      groupName: props.currentUser.displayName || props.currentUser.userEmail,
      status: 'active',
      memberCount: 1,
      members: [props.currentUser.userEmail]
    })
  }

  // 假設的其他作者 A 和 B
  groups.push({
    groupId: 'hypothetical_author_1',
    groupName: '其他作者A',
    status: 'active',
    memberCount: 1,
    members: ['hypothetical_1']
  })

  groups.push({
    groupId: 'hypothetical_author_2',
    groupName: '其他作者B',
    status: 'active',
    memberCount: 1,
    members: ['hypothetical_2']
  })

  return groups
})

// Computed - filteredUsers (complex logic for mention dropdown)
const filteredUsers = computed(() => {
  const options: any[] = []

  // 獲取當前用戶的email和所屬群組
  const currentUserEmail = props.currentUser?.userEmail
  const currentUserGroupInfo = currentUserEmail ? getUserGroupInfo(currentUserEmail) : null
  const currentUserGroupId = currentUserGroupInfo?.groupId

  // 建立群組參與者映射表 {groupId: [userEmails]}
  const groupParticipantsMap = new Map<string, string[]>()

  props.stageSubmissions.forEach(submission => {
    if (submission.groupId && submission.participants && Array.isArray(submission.participants)) {
      // 過濾掉當前用戶的組
      if (currentUserGroupId && submission.groupId === currentUserGroupId) {
        return
      }

      const existingParticipants = groupParticipantsMap.get(submission.groupId) || []
      const mergedParticipants = new Set([...existingParticipants, ...submission.participants])
      groupParticipantsMap.set(submission.groupId, Array.from(mergedParticipants))
    }
  })

  // 1. 添加群組所有人選項（優先顯示）
  groupParticipantsMap.forEach((participants, groupId) => {
    const groupInfo = props.availableGroups.find(g => g.groupId === groupId)
    if (groupInfo && participants.length > 0) {
      const groupName = groupInfo.groupName || groupInfo.name || '未命名組'
      options.push({
        name: `${groupName} 所有人`,
        displayName: `${groupName} 所有人`,
        userEmail: null,
        groupId: groupId,
        groupInfo: {
          groupId: groupId,
          groupName: groupName
        },
        groupNames: [groupName],
        isGroup: true,
        participantEmails: participants
      })
    }
  })

  // 2. 添加個別用戶選項
  const allParticipants = new Set<string>()
  props.stageSubmissions.forEach(submission => {
    if (submission.participants && Array.isArray(submission.participants)) {
      submission.participants.forEach((email: string) => allParticipants.add(email))
    }
  })

  allParticipants.forEach(email => {
    // 過濾掉當前用戶自己
    if (email === currentUserEmail) {
      return
    }

    // 獲取用戶所屬的群組資訊
    const userGroupInfo = getUserGroupInfo(email)

    // 過濾掉同組成員
    if (currentUserGroupId && userGroupInfo?.groupId === currentUserGroupId) {
      return
    }

    // 如果用戶沒有群組資訊，跳過（不應該發生，但安全起見）
    if (!userGroupInfo) {
      return
    }

    // 從 availableUsers 中找到對應的用戶資料
    const userFromAvailable = props.availableUsers.find(u =>
      (u.userEmail || u.email) === email
    )

    if (userFromAvailable) {
      options.push({
        name: userFromAvailable.displayName || email.split('@')[0],
        displayName: userFromAvailable.displayName,
        userEmail: email,
        groupInfo: userGroupInfo,
        groupNames: userGroupInfo ? [userGroupInfo.groupName] : [],
        isGroup: false
      })
    } else {
      // 如果在 availableUsers 中找不到，使用 email 前綴作為顯示名稱
      const fallbackDisplayName = email.split('@')[0]
      options.push({
        name: fallbackDisplayName,
        displayName: fallbackDisplayName,
        userEmail: email,
        groupInfo: userGroupInfo,
        groupNames: userGroupInfo ? [userGroupInfo.groupName] : [],
        isGroup: false
      })
    }
  })

  // 應用搜尋過濾
  if (!mentionQuery.value) return options.slice(0, 10)
  return options
    .filter(option => {
      const name = option.name || option.displayName || ''
      return name.toLowerCase().includes(mentionQuery.value.toLowerCase())
    })
    .slice(0, 10)
})

// Watch - visible
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // Drawer opened - clear alerts and show ranking info
    clearAlerts()

    // 使用 computed 變量設置 alert（會自動響應 props 變化）
    addAlert({
      type: 'info',
      title: rankingAlertTitle.value,
      message: '評論須得到起碼一個被您提到的用戶的支持才算有效評論',
      closable: false,
      autoClose: 0
    })
  } else {
    // Drawer closed - cleanup
    content.value = ''
    submitting.value = false
    mentionCount.value = 0
    groupMentions.value = []
    hideMentionDropdown()
    clearAlerts()
    // Clean up confirmation drawer state
    showNoMentionConfirmDrawer.value = false
    confirmationInput.value = ''
    // Clean up debounce timer
    if (mentionDebounceTimer) {
      clearTimeout(mentionDebounceTimer)
      mentionDebounceTimer = null
    }
    mentionAlertId = null
  }
})

// Watch - prefillMentionGroup（從組別報告按鈕觸發的自動 mention）
watch(
  () => props.prefillMentionGroup,
  (group) => {
    if (group && props.visible) {
      nextTick(() => {
        // 建立群組 mention 文字
        const mentionText = `${group.groupName}所有人`

        // 記錄到 groupMentions（提交時展開為個別 email）
        groupMentions.value.push({
          groupId: group.groupId,
          groupName: group.groupName,
          participants: group.participants,
          mentionText
        })

        // 插入到編輯器
        content.value = `@${mentionText} `

        // 更新 mention 計數
        updateMentionCount(content.value)
      })
    }
  },
  { immediate: true }
)

// 監聽排名規則變化並更新 alert（當 props.totalValidCommentAuthors 異步加載完成時）
watch(rankingAlertTitle, (newTitle) => {
  if (props.visible) {
    clearAlerts()
    addAlert({
      type: 'info',
      title: newTitle,
      message: '評論須得到起碼一個被您提到的用戶的支持才算有效評論',
      closable: false,
      autoClose: 0
    })
  }
})

// Watch - content (update mention count and validation alerts with debounce)
watch(content, (newVal) => {
  updateMentionCount(newVal)

  // Clear old alert immediately
  if (mentionAlertId) {
    removeAlert(mentionAlertId)
    mentionAlertId = null
  }

  // Clear existing debounce timer
  if (mentionDebounceTimer) {
    clearTimeout(mentionDebounceTimer)
    mentionDebounceTimer = null
  }

  // Debounce 500ms to avoid flickering during typing
  mentionDebounceTimer = setTimeout(() => {
    if (newVal.trim().length > 0 && mentionCount.value === 0) {
      mentionAlertId = warning(
        '您的評論沒有標記任何其他組，無法參與評論排名分獎金',
        '提示'
      )
    }
  }, 500)
})

// Methods
function handleClose() {
  emit('update:visible', false)
}

// Handle mention trigger from MdEditorWrapper
function handleMentionTrigger(payload: { query: string; cursorPosition: number; screenPosition?: { x: number; y: number } }) {
  mentionQuery.value = payload.query
  selectedMentionIndex.value = 0
  showMentionDropdown.value = true

  // Position dropdown based on device and cursor position
  const isMobile = window.innerWidth < 768
  if (isMobile) {
    // Mobile: position at bottom of editor container
    mentionDropdownStyle.value = {
      position: 'absolute',
      top: '100%',
      left: '0',
      right: '0',
      marginTop: '4px'
    }
  } else if (payload.screenPosition) {
    // Desktop: follow cursor with fixed positioning
    mentionDropdownStyle.value = {
      position: 'fixed',
      top: `${payload.screenPosition.y + 4}px`,
      left: `${payload.screenPosition.x}px`,
      marginTop: '0'
    }
  } else {
    // Fallback: position below editor
    mentionDropdownStyle.value = {
      position: 'absolute',
      top: '100%',
      left: '0',
      marginTop: '4px'
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  // 處理 @mention 下拉選單導航
  if (showMentionDropdown.value) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        selectedMentionIndex.value = Math.min(
          selectedMentionIndex.value + 1,
          filteredUsers.value.length - 1
        )
        break
      case 'ArrowUp':
        event.preventDefault()
        selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
        break
      case 'Enter':
      case 'Tab':
        event.preventDefault()
        if (filteredUsers.value[selectedMentionIndex.value]) {
          selectMention(filteredUsers.value[selectedMentionIndex.value])
        }
        break
      case 'Escape':
        event.preventDefault()
        hideMentionDropdown()
        break
    }
  }
}

function selectMention(user: any) {
  if (!editorRef.value) return

  // 檢查是否為自己或同組成員
  const currentUserEmail = props.currentUser?.userEmail
  const currentUserGroupInfo = currentUserEmail ? getUserGroupInfo(currentUserEmail) : null
  const currentUserGroupId = currentUserGroupInfo?.groupId

  let mentionText: string

  if (user.isGroup) {
    // 群組 mention：插入 "@GroupName所有人"
    mentionText = `${user.groupInfo.groupName}所有人`

    // 儲存群組 mention 元數據供提交時展開
    groupMentions.value.push({
      groupId: user.groupId,
      groupName: user.groupInfo.groupName,
      participants: user.participantEmails,
      mentionText: mentionText // 用於匹配文本中的 mention
    })

    console.log('群組 mention 已添加:', {
      groupName: user.groupInfo.groupName,
      participantCount: user.participantEmails.length
    })
  } else {
    // 個別用戶 mention
    // 防止@自己
    if (user.userEmail === currentUserEmail) {
      mentionText = '禁止自肥'
    }
    // 防止@同組成員
    else if (currentUserGroupId && user.groupInfo?.groupId === currentUserGroupId) {
      mentionText = '禁止自肥'
    }
    // 正常情況
    else {
      mentionText = user.userEmail
    }
  }

  // Use MdEditorWrapper's insertMention method
  editorRef.value.insertMention(mentionText)
  hideMentionDropdown()
}

function hideMentionDropdown() {
  showMentionDropdown.value = false
  mentionQuery.value = ''
  selectedMentionIndex.value = 0
}

// No-mention confirmation drawer handlers
function closeNoMentionDrawer() {
  showNoMentionConfirmDrawer.value = false
  confirmationInput.value = ''
}

async function confirmAndSubmit() {
  if (canConfirmNoMention.value) {
    closeNoMentionDrawer()
    await submitComment()
  }
}

async function submitComment() {
  if (!canSubmit.value) return

  submitting.value = true
  try {
    if (!props.projectId) {
      ElMessage.error('缺少專案ID')
      return
    }

    // 處理內容：展開群組 mention 為個別 email mentions
    let processedContent = content.value

    // 展開每個群組 mention
    if (groupMentions.value.length > 0) {
      console.log('展開群組 mentions:', groupMentions.value.length)

      groupMentions.value.forEach(groupMention => {
        // 找到 "@GroupName所有人" 的位置
        const pattern = `@${groupMention.mentionText}`
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')

        // 替換為所有參與者的 email mentions
        const individualMentions = groupMention.participants
          .map(email => `@${email}`)
          .join(' ')

        processedContent = processedContent.replace(regex, individualMentions)

        console.log(`展開 ${groupMention.groupName}:`, {
          原始: pattern,
          展開為: individualMentions,
          參與者數量: groupMention.participants.length
        })
      })
    }

    console.log('提交評論內容:', {
      原始: content.value,
      處理後: processedContent,
      群組Mentions: groupMentions.value.length
    })

    const httpResponse = await rpcClient.comments.create.$post({
      json: {
        projectId: props.projectId,
        commentData: {
          stageId: props.stageId,
          content: processedContent
        }
      }
    })
    const response = await httpResponse.json()

    if (response.success) {
      // 成功後通知父組件並關閉彈窗
      emit('submit', {
        success: true,
        commentId: response.data.commentId,
        content: content.value
      })
      ElMessage.success('評論提交成功')
      handleClose()
    } else {
      ElMessage.error(`評論提交失敗：${response.error?.message || '未知錯誤'}`)
    }
  } catch (error) {
    console.error('提交評論錯誤:', error)
    ElMessage.error('網路錯誤，請重試')
  } finally {
    submitting.value = false
  }
}

function getUserGroupInfo(userEmail: string) {
  // 獲取用戶所屬的群組完整資訊
  if (!userEmail || !props.userGroups || !props.availableGroups) {
    return null
  }

  // 從 userGroups 中找到用戶的群組記錄
  const userGroupRecord = props.userGroups.find(ug =>
    ug.userEmail === userEmail && ug.isActive
  )

  if (!userGroupRecord) return null

  // 從 availableGroups 中找到對應的群組資訊
  const group = props.availableGroups.find(g =>
    g.groupId === userGroupRecord.groupId && g.status === 'active'
  )

  if (!group) return null

  return {
    groupId: group.groupId,
    groupName: group.groupName || group.name
  }
}

function clearContent() {
  content.value = ''
  mentionCount.value = 0
  groupMentions.value = []
  hideMentionDropdown()
  clearAlerts()
}

function updateMentionCount(contentValue: string) {
  if (!contentValue) {
    mentionCount.value = 0
    return
  }

  // 同步清理 groupMentions：移除已被用戶刪除的群組 mention
  groupMentions.value = groupMentions.value.filter(gm => {
    const pattern = `@${gm.mentionText}`
    return contentValue.includes(pattern)
  })

  let count = 0

  // 1. 群組 mentions：直接使用 groupMentions 元數據計數
  //    因為 selectMention() 已經正確追蹤所有群組 mention
  //    這樣可以正確處理含空白的群組名稱
  groupMentions.value.forEach(groupMention => {
    const pattern = `@${groupMention.mentionText}`
    if (contentValue.includes(pattern)) {
      count++
    }
  })

  // 2. 個別用戶 mentions（@email）- 維持原有邏輯
  const emailPattern = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const emailMatches = contentValue.match(emailPattern) || []
  emailMatches.forEach(match => {
    const email = match.substring(1) // 去掉 @
    // 檢查是否存在於 filteredUsers 中（isGroup: false 的項目）
    const isValid = filteredUsers.value.some(u =>
      !u.isGroup && u.userEmail === email
    )
    if (isValid) count++
  })

  mentionCount.value = count
  console.log(`當前有效 mention 數量: ${mentionCount.value} (群組: ${groupMentions.value.length}, 個人: ${emailMatches.length})`)
}
</script>

<style scoped>
/* Drawer body styles inherited from drawer-unified.scss */

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

.editor-section {
  padding: 0 25px 20px;
}

.editor-content {
  position: relative;
}

.mention-dropdown {
  position: fixed;
  background: white;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1001;
  min-width: 200px;
  max-height: 200px;
  overflow-y: auto;
}

.mention-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f1f2f6;
  transition: background-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.mention-item:last-child {
  border-bottom: none;
}

.mention-item:hover,
.mention-item.active {
  background: #f8f9fa;
}

.mention-item.is-group {
  background: linear-gradient(135deg, #fff0f0, #fff);
  border-left: 3px solid maroon;
}

.mention-item.is-group:hover,
.mention-item.is-group.active {
  background: linear-gradient(135deg, #ffe0e0, #f8f9fa);
}

.mention-name {
  font-weight: 600;
  color: #3498db;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-badge {
  background: #f39c12;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.mention-group {
  font-size: 12px;
  color: #7f8c8d;
}

.voting-tip {
  font-size: 11px;
  color: #e67e22;
  font-weight: 500;
  margin-top: 2px;
}

.group-mention-hint {
  font-size: 11px;
  color: maroon;
  font-weight: 500;
  margin-top: 2px;
}

.target-group-section {
  padding: 20px 25px;
  border-top: 1px solid #e1e8ed;
}

.section-label {
  display: block;
  background: #6c757d;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 15px;
  width: fit-content;
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

/* 操作按鈕區域 - 固定在底部 */
.drawer-actions {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 25px;
  display: flex;
  gap: 12px;
  justify-content: center;
  background: white;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
  margin-top: auto;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  min-width: 100px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}

.btn-secondary {
  background: #dc3545;
  color: white;
}

.btn-secondary:hover {
  background: #c82333;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}

/* 假設性預覽區塊 */
.hypothetical-preview-section {
  margin: 25px;
  padding: 25px;
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border-radius: 12px;
  border: 2px solid #81c784;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  color: #2e7d32;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-title i {
  font-size: 20px;
  color: #4caf50;
}

.rank-segmented-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 25px;
  padding: 15px 0;
}

.rank-segmented-wrapper :deep(.el-segmented) {
  background: rgba(255, 255, 255, 0.8);
  padding: 4px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.rank-segmented-wrapper :deep(.el-segmented__item) {
  color: #2e7d32;
  font-weight: 500;
  font-size: 15px;
  padding: 8px 20px;
  transition: all 0.3s;
}

.rank-segmented-wrapper :deep(.el-segmented__item.is-selected) {
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(76, 175, 80, 0.4);
}

.rank-segmented-wrapper :deep(.el-segmented__item:hover:not(.is-selected)) {
  background: rgba(76, 175, 80, 0.1);
}

.preview-hint {
  margin-top: 20px;
  padding: 12px 20px;
  background: #fff9c4;
  border: 1px solid #fff59d;
  border-radius: 8px;
  color: #f57f17;
  font-size: 14px;
  text-align: center;
  font-weight: 500;
}

/* 無標記確認抽屜樣式 */
.warning-section {
  background: linear-gradient(135deg, #fff5f5 0%, #ffe0e0 100%);
  border: 2px solid #e74c3c;
  border-radius: 12px;
  padding: 30px;
  margin: 20px;
}

.warning-section h4 {
  color: #c0392b;
  font-size: 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.warning-section h4 i {
  color: #e74c3c;
  font-size: 24px;
}

.warning-text {
  color: #2c3e50;
  font-size: 16px;
  line-height: 1.8;
  margin-bottom: 15px;
}

.warning-text strong {
  color: #c0392b;
}

.warning-text code {
  background: #2c3e50;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: 600;
}

.warning-section .form-group {
  margin-top: 25px;
}

.warning-section .form-group label {
  display: block;
  margin-bottom: 12px;
  font-size: 16px;
  color: #2c3e50;
}

.warning-section .form-group label strong {
  color: #c0392b;
  font-family: 'Courier New', monospace;
}

@media (max-width: 768px) {
  .modal-content {
    width: 100%;
    max-height: 90vh;
  }

  .editor-toolbar {
    flex-wrap: wrap;
  }

  .drawer-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }

  .reward-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .mention-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
  }
}
</style>
