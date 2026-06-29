<template>
  <div class="project-card">
    <div class="project-top-row">
      <el-tooltip
        :content="project.projectName"
        placement="top"
        :show-after="300"
      >
        <div class="project-title">{{ project.projectName }}</div>
      </el-tooltip>
      <div class="project-status">
        <div class="status-dot" :class="timeRemaining.colorClass"></div>
        <span class="status-text" :class="timeRemaining.colorClass">{{ statusDisplayText }}</span>
      </div>
    </div>

    <MdPreviewWrapper :content="project.description || ''" class="project-description" />

    <!-- 階段進度顯示：流程圖 or 甘特圖 -->
    <div class="stage-display-container">
      <!-- 流程圖模式（原有）+ LED 指示燈開車：行經之處的階段看板逐一彈起 -->
      <div
        v-if="stageDisplayMode === 'linear'"
        ref="stageProgressRef"
        class="stage-progress"
      >
        <template v-for="(node, i) in progressNodes" :key="node.key">
          <!-- 階段看板 -->
          <div
            v-if="node.type === 'chip'"
            :ref="(el) => setNodeRef(el, i)"
            class="stage-item"
            :class="{
              active: isStageActive(node.stage),
              completed: isStageCompleted(node.stage),
              pending: isStagePending(node.stage),
              voting: isStageVoting(node.stage),
              'multiple-active': stageDisplay.hasMultipleActiveStages && isStageActive(node.stage)
            }"
            :style="{ '--bounce': boardBounceY(node.bodyIndex) + 'px' }"
          >
            <!-- 當前階段：跳起後在上方以灰字標註到期時間 -->
            <span
              v-if="node.isCurrent && dueShown && formatDue(node.stage)"
              class="stage-due"
            >{{ formatDue(node.stage) }}</span>
            {{ node.stage.stageName || node.stage.stageTitle || `階段${node.stage.stageOrder || node.chipIndex + 1}` }}
          </div>
          <!-- 開始標記 -->
          <div
            v-else-if="node.type === 'start-marker'"
            :ref="(el) => setNodeRef(el, i)"
            class="stage-marker start-marker"
            :style="{ '--bounce': boardBounceY(node.bodyIndex) + 'px' }"
          >開始</div>
          <!-- 結束標記 -->
          <div
            v-else-if="node.type === 'end-marker'"
            :ref="(el) => setNodeRef(el, i)"
            class="stage-marker end-marker"
            :style="{ '--bounce': boardBounceY(node.bodyIndex) + 'px' }"
          >結束</div>
          <!-- 連接箭頭 -->
          <i
            v-else
            :ref="(el) => setNodeRef(el, i)"
            class="fas fa-chevron-right stage-arrow"
          ></i>
        </template>

        <!-- LED 指示燈（車）：底部軌道開車，不與看板重疊 -->
        <div
          v-if="ledVisible"
          class="stage-led-car"
          :style="{ left: ledLeft }"
        ></div>
      </div>

      <!-- 甘特圖模式（新增） -->
      <div v-else class="stage-gantt-wrapper">
        <StageGanttChart
          :stages="ganttStages"
          :milestones="ganttMilestones"
          :enable-drag="false"
          :show-minimap="false"
          :fixed-stage-count="3"
          :height="200"
          :compact="true"
          @stage-click="handleStageClick"
        />
      </div>
    </div>

    <div class="project-actions">
      <div v-if="currentGroupMembers.length > 0" class="members-section">
        <span class="members-label">貴組成員</span>
        <AvatarGroup
          :group-members="currentGroupMembers"
          class="group-avatars"
        />
      </div>

      <div class="action-buttons">
        <!-- 1. 進入專案（主要） -->
        <button
          v-if="project.permissions?.canEnter"
          class="enter-project-btn"
          @click="$emit('enter-project', project)"
        >
          <i class="fas fa-sign-in-alt btn-icon"></i>
          <span class="btn-text">進入專案</span>
        </button>
        <!-- 2. 組長功能（主要） -->
        <button
          v-if="project.permissions?.isGroupLeader"
          class="manage-members-btn"
          @click="$emit('manage-group-members', project)"
          title="管理專案分組"
        >
          <i class="fas fa-users-cog btn-icon"></i>
          <span class="btn-text">組長功能</span>
        </button>
        <!-- 3. 專案錢包（次要） -->
        <button
          v-if="project.permissions?.canEnter"
          class="wallet-btn"
          @click="openWalletForUser(project)"
          title="查看專案錢包"
        >
          <i class="fas fa-wallet btn-icon"></i>
          <span class="btn-text">專案錢包</span>
        </button>
        <!-- 4. 事件日誌（次要） -->
        <button
          v-if="project.permissions?.canViewLogs"
          class="event-log-btn"
          @click="$emit('view-event-logs', project)"
          title="查看事件日誌"
        >
          <i class="fas fa-history btn-icon"></i>
          <span class="btn-text">事件日誌</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, onBeforeUpdate, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { getProjectStageDisplay, getStageTimeRemaining } from '@/utils/stageStatus'
import { getUserPreferences } from '@/utils/userPreferences'
import { useCurrentUser } from '@/composables/useAuth'
import AvatarGroup from './common/AvatarGroup.vue'
import StageGanttChart from './charts/StageGanttChart.vue'
import MdPreviewWrapper from '@/components/MdPreviewWrapper.vue'
import { useInViewport } from '@/composables/useInViewport'
import { useStageBounce } from '@/composables/useStageBounce'

export default {
  name: 'ProjectCard',
  components: {
    AvatarGroup,
    StageGanttChart,
    MdPreviewWrapper
  },
  props: {
    project: {
      type: Object,
      required: true
    },
    user: {
      type: Object,
      default: null
    }
  },
  emits: ['enter-project', 'manage-group-members', 'view-event-logs'],
  setup(props) {
    const router = useRouter()
    const { data: currentUser } = useCurrentUser()

    // Stage display mode
    const stageDisplayMode = ref('linear')

    // Load display mode from user preferences
    const loadStageDisplayMode = () => {
      if (!currentUser.value?.userId) {
        stageDisplayMode.value = 'linear'
        return
      }

      const prefs = getUserPreferences(currentUser.value.userId)
      stageDisplayMode.value = prefs.stageDisplayMode || 'linear'
    }

    // Handle display mode change
    const handleStageDisplayModeChange = () => {
      loadStageDisplayMode()
    }

    // Handle preferences change (cross-tab sync)
    const handlePreferencesChange = () => {
      loadStageDisplayMode()
    }

    // Convert project stages to Gantt format
    const ganttStages = computed(() => {
      if (!props.project.stages) return []

      return props.project.stages.map(stage => {
        const status = stage.status
        return {
          stageName: stage.stageName || stage.stageTitle || '未命名階段',
          startTime: stage.startTime,
          endTime: stage.endTime,
          status: status,
          extraTime: status === 'completed' ? (stage.settledTime || undefined) : Infinity,
          extraTimeText: status === 'completed' ? '投票階段' : '投票階段將由老師手動關閉結算'
        }
      })
    })

    // Convert milestones (if exists)
    const ganttMilestones = computed(() => {
      if (props.project.milestones) {
        return props.project.milestones.map(m => ({
          eventName: m.name || m.eventName,
          eventTick: m.time || m.eventTick
        }))
      }
      return []
    })

    // Handle stage click
    const handleStageClick = (stage) => {
      console.log('Stage clicked:', stage)
    }

    // Lifecycle
    onMounted(() => {
      loadStageDisplayMode()
      window.addEventListener('stageDisplayModeChanged', handleStageDisplayModeChange)
      window.addEventListener('userPreferencesChanged', handlePreferencesChange)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('stageDisplayModeChanged', handleStageDisplayModeChange)
      window.removeEventListener('userPreferencesChanged', handlePreferencesChange)
      clearBounceTimers()
    })

    // 獲取專案階段顯示資訊
    const stageDisplay = computed(() => {
      return getProjectStageDisplay(props.project.stages || [])
    })

    // 顯示的階段列表（前一個、當前、下一個）
    const displayStages = computed(() => {
      return stageDisplay.value.displayStages
    })

    // ===== LED 指示燈「開車」+ 看板波浪跳動（matter.js）=====
    // LED 從起點逐幀開到「當前階段」並停下；車頭經過哪張看板，那張就「跳起來」一下 → 波浪。
    // LED 走不到「下一階段」，所以下一階段在 LED 到站後自己跳。LED 在底部軌道，不與看板重疊。
    const LED_SLIDE_MS = 1600          // LED 開到當前階段的時間（rAF 逐幀驅動）
    const NEXT_BOUNCE_DELAY_MS = 1400  // LED 到站後，走不到的看板隔多久開始依序跳
    const LIFT_MAX = 22                // 看板被 LED 抬到最高的位移（px）
    const HUMP_HALF = 26               // LED 影響看板的左右半徑（px，決定「進入/離開」範圍）

    const stageProgressRef = ref(null)
    const ledLeft = ref('0px')
    const ledVisible = computed(
      () => stageDisplayMode.value === 'linear' && displayStages.value.length > 0
    )

    const bounce = useStageBounce()

    // 當前階段在 displayStages 中的索引
    const currentDisplayIndex = computed(() => {
      const cur = stageDisplay.value.currentStage
      if (!cur) return -1
      return displayStages.value.findIndex(s => s.stageId === cur.stageId)
    })

    // 進度節點（依序）：開始標記 →（箭頭）→ 各階段看板 →（箭頭）→ 結束標記
    // 看板類（chip / marker）配一個 matter.js body index 供彈起；箭頭只淡入
    const progressNodes = computed(() => {
      const nodes = []
      const stages = displayStages.value
      let bodyIdx = 0
      if (shouldShowStartMarker.value) {
        nodes.push({ type: 'start-marker', key: 'start', bodyIndex: bodyIdx++ })
        nodes.push({ type: 'arrow', key: 'arrow-start' })
      }
      const currentId = stageDisplay.value.currentStage?.stageId
      stages.forEach((stage, index) => {
        nodes.push({
          type: 'chip',
          key: stage.stageId || `chip-${index}`,
          stage,
          chipIndex: index,
          bodyIndex: bodyIdx++,
          isCurrent: !!currentId && stage.stageId === currentId
        })
        if (index < stages.length - 1 || shouldShowEndMarker.value) {
          nodes.push({ type: 'arrow', key: `arrow-${index}` })
        }
      })
      if (shouldShowEndMarker.value) {
        nodes.push({ type: 'end-marker', key: 'end', bodyIndex: bodyIdx++ })
      }
      return nodes
    })
    const boardCount = computed(
      () => progressNodes.value.filter(n => n.bodyIndex !== undefined).length
    )

    const nodeEls = ref([])
    const dueShown = ref(false) // 當前階段跳起後才顯示到期時間
    onBeforeUpdate(() => { nodeEls.value = [] })
    const setNodeRef = (el, i) => { if (el) nodeEls.value[i] = el }
    const boardBounceY = (bodyIndex) => bounce.bounceY(bodyIndex)

    // 當前階段的到期時間（灰字寫在卡片上方），格式：~ 2026/02/01 13:56
    const formatDue = (stage) => {
      const t = stage?.endTime
      if (t === null || t === undefined) return ''
      const d = typeof t === 'number' ? new Date(t) : new Date(t)
      if (isNaN(d.getTime())) return ''
      const p = (n) => String(n).padStart(2, '0')
      return `~ ${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    let bounceTimers = []
    let ledRaf = null
    const clearBounceTimers = () => {
      bounceTimers.forEach(t => clearTimeout(t))
      bounceTimers = []
      if (ledRaf !== null) cancelAnimationFrame(ledRaf)
      ledRaf = null
    }

    const runIndicator = async () => {
      if (stageDisplayMode.value !== 'linear') return
      const nodes = progressNodes.value
      if (!nodes.length) return

      bounce.ensure(boardCount.value)
      dueShown.value = false
      clearBounceTimers()
      ledLeft.value = '0px'
      await nextTick()

      if (!stageProgressRef.value) return
      const centerOf = (i) => {
        const el = nodeEls.value[i]
        return el ? el.offsetLeft + el.offsetWidth / 2 : 0
      }
      const halfOf = (i) => {
        const el = nodeEls.value[i]
        return el ? el.offsetWidth / 2 : HUMP_HALF
      }

      // LED 停靠點 = 當前階段（無當前階段 → 開到最後）
      const ci = currentDisplayIndex.value
      let stopNodeIdx = nodes.findIndex(n => n.type === 'chip' && n.chipIndex === ci)
      if (stopNodeIdx < 0) stopNodeIdx = nodes.length - 1
      const stopX = centerOf(stopNodeIdx)

      // 各「看板」節點：中心 x、左右半徑（LED 進入～離開的範圍）
      const boardNodes = nodes
        .map((node, i) => ({ node, i, x: centerOf(i), half: halfOf(i), plucked: false }))
        .filter(o => o.node.bodyIndex !== undefined)
      const reachable = boardNodes.filter(o => o.x <= stopX + 0.5)
      const beyond = boardNodes.filter(o => o.x > stopX + 0.5)

      // 量不到位置（極少數）：LED 直接停在當前階段、顯示到期時間
      if (stopX <= 0) {
        ledLeft.value = Math.max(0, stopX) + 'px'
        dueShown.value = true
        return
      }

      // LED 與看板震動「同一個 rAF 迴圈」→ 完全同步：
      // LED 進入看板（到左緣）→ 開始抬升；到中央 → 最高；離開 → 錨點歸位、弦回彈震盪。
      const startTs = performance.now()
      let arrivalTs = null
      const sweep = (now) => {
        const t = Math.min(1, (now - startTs) / LED_SLIDE_MS)
        const ledX = stopX * t
        ledLeft.value = ledX + 'px'

        // 由 LED 位置驅動每張「走得到」的看板抬升量（半正弦駝峰，中央最高）
        // 到站後（t>=1）全部釋放（lift=0）→ 錨點歸位，當前看板回彈震盪不會卡在高點
        reachable.forEach(o => {
          let lift = 0
          if (t < 1) {
            const left = o.x - o.half
            const right = o.x + o.half
            if (ledX >= left && ledX <= right) {
              const p = (ledX - left) / (right - left) // 0→1
              lift = LIFT_MAX * Math.sin(Math.PI * p)  // 中央 p=0.5 → 最高
            }
          }
          bounce.setLift(o.node.bodyIndex, lift)
        })

        // 到站：顯示當前階段到期時間，並讓 LED 走不到的看板依序撥動（自己震）
        if (t >= 1) {
          if (arrivalTs === null) {
            arrivalTs = now
            dueShown.value = true
          }
          const since = now - arrivalTs
          beyond.forEach((o, k) => {
            if (!o.plucked && since >= NEXT_BOUNCE_DELAY_MS + k * 220) {
              o.plucked = true
              bounce.pluck(o.node.bodyIndex)
            }
          })
        }

        bounce.step()

        const allBeyondDone = beyond.every(o => o.plucked)
        if (t < 1 || !allBeyondDone || !bounce.isSettled()) {
          ledRaf = requestAnimationFrame(sweep)
        } else {
          ledRaf = null
        }
      }
      ledRaf = requestAnimationFrame(sweep)
    }

    // 進場才啟動（Dashboard 多卡效能）
    const { hasEntered } = useInViewport(stageProgressRef, { once: true })
    watch(hasEntered, (entered) => { if (entered) runIndicator() })
    // 階段推進 / 資料變更 → 重新開車與彈跳
    watch(
      [currentDisplayIndex, () => displayStages.value.length],
      () => { if (hasEntered.value) runIndicator() }
    )
    
    // 當前階段的剩餘時間
    const timeRemaining = computed(() => {
      const activeStages = stageDisplay.value.activeStages
      
      if (activeStages.length === 0) {
        return { text: '尚未開始', timeLeft: 0, percentage: 100, colorClass: 'info' }
      }
      
      if (activeStages.length === 1) {
        // 單個進行中階段
        return getStageTimeRemaining(activeStages[0])
      } else {
        // 多個進行中階段，使用最緊急的時間
        const timeRemainingList = activeStages.map(stage => getStageTimeRemaining(stage))
        
        // 找到最緊急的（剩餘時間最少的）
        const mostUrgent = timeRemainingList.reduce((min, current) => 
          current.timeLeft < min.timeLeft ? current : min
        )
        
        return mostUrgent
      }
    })
    
    // 計算投票中的階段
    const votingStages = computed(() => {
      if (!props.project.stages) return []
      return props.project.stages.filter(stage => stage.status === 'voting')
    })
    
    // 狀態顯示文字
    const statusDisplayText = computed(() => {
      const activeStages = stageDisplay.value.activeStages
      const votingStagesCount = votingStages.value.length
      
      // 優先顯示投票中階段信息
      if (votingStagesCount > 0) {
        const stageText = votingStagesCount === 1 ? '階段' : '階段'
        return `有${votingStagesCount}個${stageText}開始投票`
      }
      
      if (activeStages.length === 0) {
        return '尚未開始'
      }
      
      if (activeStages.length === 1) {
        // 只有一個進行中階段
        const currentStage = activeStages[0]
        const stageName = currentStage.stageName || currentStage.stageTitle || `階段${currentStage.stageOrder || 1}`
        if (timeRemaining.value.timeLeft <= 0) {
          return `${stageName} 已截止`
        }
        return `${stageName} 剩餘${timeRemaining.value.text}`
      } else {
        // 多個進行中階段
        const stageNames = activeStages.map(stage => 
          stage.stageName || stage.stageTitle || `階段${stage.stageOrder || 1}`
        )
        const stageRange = stageNames.length > 1 
          ? `${stageNames[0]}等${stageNames.length}個階段`
          : stageNames[0]
        
        // 使用最緊急的截止時間
        const earliestEndTime = Math.min(...activeStages.map(stage => {
          const endTime = typeof stage.endTime === 'string'
            ? new Date(stage.endTime).getTime()
            : stage.endTime
          return endTime
        }))
        
        const now = Date.now()
        const timeLeft = earliestEndTime - now
        
        if (timeLeft <= 0) {
          return `${stageRange} 已截止`
        }
        
        // 計算最緊急的剩餘時間
        const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000))
        const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
        
        let timeText = ''
        if (days > 0) {
          timeText = `${days}天${hours}小時`
        } else if (hours > 0) {
          timeText = `${hours}小時${minutes}分鐘`
        } else {
          timeText = `${minutes}分鐘`
        }
        
        return `${stageRange} 剩餘${timeText}`
      }
    })
    
    // 判斷階段是否正在進行中
    const isStageActive = (stage) => {
      return stageDisplay.value.activeStages.some(activeStage => 
        activeStage.stageId === stage.stageId
      )
    }
    
    // 判斷階段是否已完成
    const isStageCompleted = (stage) => {
      return stage.status === 'completed' || stage.status === 'archived'
    }

    // 判斷階段是否尚未開始
    const isStagePending = (stage) => {
      return stage.status === 'pending'
    }

    // 判斷階段是否正在投票中
    const isStageVoting = (stage) => {
      return stage.status === 'voting'
    }
    
    // 判斷是否顯示開始標記（只針對當前階段）
    const shouldShowStartMarker = computed(() => {
      if (!props.project.stages || stageDisplay.value.activeStages.length === 0) return false
      
      // 取得所有階段按順序排列
      const allStages = [...props.project.stages].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
      if (allStages.length === 0) return false
      
      // 檢查當前階段是否是專案的第一個階段
      const currentStage = stageDisplay.value.currentStage
      const firstProjectStage = allStages[0]
      
      return currentStage && currentStage.stageId === firstProjectStage.stageId
    })
    
    // 判斷是否顯示結束標記
    const shouldShowEndMarker = computed(() => {
      if (!props.project.stages) return false
      
      // 取得所有階段按順序排列
      const allStages = [...props.project.stages].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
      if (allStages.length === 0) return false
      
      const lastProjectStage = allStages[allStages.length - 1]
      const displayStagesList = stageDisplay.value.displayStages || []
      
      // 檢查顯示的階段列表中是否包含專案的最後一個階段
      // 如果包含，就應該顯示結束標記
      return displayStagesList.some(stage => stage.stageId === lastProjectStage.stageId)
    })
    
    // Note: canManageMembers has been removed and replaced with
    // project.permissions from Dashboard's projectsWithPermissions computed property

    // Compute current group members for avatar display
    const currentGroupMembers = computed(() => {
      // Find the first group that the user belongs to (from userGroups)
      const userGroup = props.project.userGroups?.[0]
      if (!userGroup || !props.project.groupMembers) {
        return []
      }

      // Filter members from the same group, including avatar data
      const groupMembers = props.project.groupMembers.filter(
        member => member.groupId === userGroup.groupId
      )

      return groupMembers
    })

    // Navigate to wallet with permission-based routing
    const openWalletForUser = (project) => {
      const level = project.permissions?.permissionLevel

      if (level === 'member_in_group' || level === 'group_leader') {
        // Personal wallet view for group members and leaders
        router.push({
          name: 'wallets',
          params: {
            projectId: project.projectId,
            userEmail: props.user?.userEmail
          }
        })
      } else {
        // Project-wide wallet view for observer/teacher/admin
        router.push({
          name: 'wallets',
          params: { projectId: project.projectId }
        })
      }
    }

    return {
      stageDisplay,
      displayStages,
      timeRemaining,
      statusDisplayText,
      votingStages,
      isStageActive,
      isStageCompleted,
      isStagePending,
      isStageVoting,
      shouldShowStartMarker,
      shouldShowEndMarker,
      currentGroupMembers,
      stageDisplayMode,
      stageProgressRef,
      progressNodes,
      setNodeRef,
      dueShown,
      boardBounceY,
      formatDue,
      ledLeft,
      ledVisible,
      ganttStages,
      ganttMilestones,
      handleStageClick,
      openWalletForUser
    }
  }
}
</script>

<style scoped>
.project-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.project-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.project-title {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
  text-align: left;
}

.project-description {
  color: #7f8c8d;
  line-height: 1.5;
  margin-bottom: 20px;
}

/* Markdown rendering styles */
.project-description :deep(strong) {
  font-weight: 600;
  color: #2c3e50;
}

.project-description :deep(em) {
  font-style: italic;
}

.project-description :deep(u) {
  text-decoration: underline;
}

.project-description :deep(ul),
.project-description :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.project-description :deep(li) {
  margin: 4px 0;
}

.project-description :deep(a) {
  color: #3498db;
  text-decoration: none;
}

.project-description :deep(a:hover) {
  text-decoration: underline;
}

.project-description :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 8px 0;
  border-radius: 4px;
}

.project-description :deep(p) {
  margin: 0;
}

.project-description :deep(br) {
  line-height: 1.5;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #67c23a; /* 預設綠色 */
}

.status-text {
  color: #67c23a; /* 預設綠色 */
  font-size: 14px;
  font-weight: 500;
}

/* 根據剩餘時間變化的顏色 - 直接應用到元素 */
.status-dot.success {
  background: #67c23a; /* 綠色 - 充足時間 */
}

.status-text.success {
  color: #67c23a;
}

.status-dot.warning {
  background: #e6a23c; /* 橙色 - 時間緊迫 */
}

.status-text.warning {
  color: #e6a23c;
}

.status-dot.danger {
  background: #f56c6c; /* 紅色 - 非常緊迫或已截止 */
}

.status-text.danger {
  color: #f56c6c;
}

.status-dot.info {
  background: #909399; /* 灰色 - 尚未開始 */
}

.status-text.info {
  color: #909399;
}

.stage-display-container {
  margin-bottom: 20px;
}

.stage-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  position: relative;
  padding-top: 32px;     /* 看板向上「彈起」+ 到期時間灰字的空間 */
  padding-bottom: 16px;  /* 底部 LED 軌道的車道（與看板分離，不重疊） */
}

/* LED 指示燈（車）：在底部軌道上「開車」到當前階段（位置由 JS 逐幀驅動） */
.stage-led-car {
  position: absolute;
  bottom: 2px;
  left: 0;
  width: 22px;
  height: 8px;
  margin-left: -11px;
  border-radius: 4px;
  background: linear-gradient(90deg, #157347, var(--stage-active-bg));
  box-shadow:
    0 0 10px color-mix(in srgb, var(--stage-active-bg) 75%, transparent),
    0 0 3px rgba(255, 255, 255, 0.9);
  z-index: 3;
  pointer-events: none;
}
/* LED 行駛軌道 */
.stage-progress::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 5px;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.1) 0,
    rgba(0, 0, 0, 0.1) 5px,
    transparent 5px,
    transparent 10px
  );
  border-radius: 1px;
  pointer-events: none;
}

.stage-gantt-wrapper {
  width: 100%;
  overflow: hidden;
}

.stage-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #e1e8ed;
  border-radius: 4px;
  background: #f8f9fa;
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
  position: relative;
  transform: translateY(var(--bounce, 0px));
  will-change: transform;
}

/* 當前階段到期時間（灰字，卡片上方） */
.stage-due {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 500;
  color: #909399;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  animation: stage-due-in 0.4s ease 0.3s forwards;
}

@keyframes stage-due-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.stage-item.pending {
  background: var(--stage-pending-bg);
  border-color: var(--stage-pending-bg);
  color: var(--stage-pending-text);
  font-weight: bold;
}

.stage-item.active {
  background: var(--stage-active-bg);
  border-color: var(--stage-active-bg);
  color: var(--stage-active-text);
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(25, 135, 84, 0.3);
  transform: translateY(var(--bounce, 0px)) scale(1.05);
}

.stage-item.voting {
  background: var(--stage-voting-bg);
  border-color: var(--stage-voting-bg);
  color: var(--stage-voting-text);
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(200, 35, 51, 0.3);
  transform: translateY(var(--bounce, 0px)) scale(1.05);
}

.stage-item.completed {
  background: var(--stage-completed-bg);
  border-color: var(--stage-completed-bg);
  color: var(--stage-completed-text);
  font-weight: bold;
}

/* 多個進行中階段的特殊樣式 */
.stage-item.multiple-active {
  background: linear-gradient(45deg, var(--stage-active-bg), #218838);
  border-color: #218838;
  color: var(--stage-active-text);
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(25, 135, 84, 0.4);
  position: relative;
}

.stage-item.multiple-active::before {
  content: "●";
  position: absolute;
  top: -2px;
  right: -2px;
  background: #e74c3c;
  color: white;
  border-radius: 50%;
  width: 8px;
  height: 8px;
  font-size: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-arrow {
  color: #3498db;
  font-size: 16px;
}

.stage-marker {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 2px solid #bdc3c7;
  border-radius: 4px;
  background: #ffffff;
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
  font-weight: 500;
  transform: translateY(var(--bounce, 0px));
  will-change: transform;
}

.stage-marker.start-marker {
  background: #f8f9fa;
  border-color: #dee2e6;
  color: #6c757d;
}

.stage-marker.end-marker {
  background: #f8f9fa;
  border-color: #dee2e6;
  color: #6c757d;
}

.project-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.members-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.members-label {
  color: #333;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.group-avatars {
  display: flex;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
}

/* === 進入專案（主要-綠色 success） === */
.enter-project-btn {
  background: #198754;
  color: #ffffff;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.enter-project-btn:hover {
  background: #157347;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(25, 135, 84, 0.3);
}

/* === 組長功能（主要-橙色 warning） === */
.manage-members-btn {
  background: #f39c12;
  color: #000000;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.manage-members-btn:hover {
  background: #e67e22;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
}

/* === 專案錢包（次要-深灰 info） === */
.wallet-btn {
  background: #5a6268;
  color: #ffffff;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.wallet-btn:hover {
  background: #4a5158;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(90, 98, 104, 0.3);
}

/* === 事件日誌（次要-灰色 neutral） === */
.event-log-btn {
  background: #6c757d;
  color: #ffffff;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-log-btn:hover {
  background: #5c636a;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
}

/* 按鈕圖示與文字共用樣式 */
.btn-icon {
  font-size: 14px;
}

.btn-text {
  white-space: nowrap;
}

/* === 直屏模式 (portrait)：簡化顯示 === */
@media screen and (orientation: portrait) and (max-width: 768px) {
  /* 卡片整體 */
  .project-card {
    padding: 15px;
  }

  /* 頂部：標題與剩餘時間保持同一行，左右分散 */
  .project-top-row {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .project-title {
    font-size: 15px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-status {
    font-size: 12px;
    flex-shrink: 0;
  }

  /* 描述區域 */
  .project-description {
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 15px;
  }

  /* 階段進度 */
  .stage-progress {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    gap: 6px;
    padding-bottom: 8px;
    flex-wrap: nowrap;
  }

  .stage-item {
    font-size: 12px;
    padding: 6px 10px;
    min-width: max-content;
  }

  .stage-arrow {
    font-size: 14px;
    flex-shrink: 0;
  }

  .stage-marker {
    font-size: 12px;
    padding: 6px 10px;
    min-width: max-content;
  }

  /* 底部：成員與按鈕 */
  .project-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }

  .members-section {
    width: 100%;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  }

  /* 按鈕區：四按鈕一列 */
  .action-buttons {
    flex-direction: row;
    flex-wrap: nowrap;
    width: 100%;
    margin-left: 0;
    gap: 6px;
  }

  /* 進入專案、組長功能：純文字（隱藏圖示） */
  .enter-project-btn .btn-icon,
  .manage-members-btn .btn-icon {
    display: none;
  }

  /* 專案錢包、事件日誌：純圖示（隱藏文字） */
  .wallet-btn .btn-text,
  .event-log-btn .btn-text {
    display: none;
  }

  /* 按鈕平均分配空間 */
  .enter-project-btn,
  .manage-members-btn,
  .wallet-btn,
  .event-log-btn {
    flex: 1;
    justify-content: center;
    padding: 10px 8px;
    font-size: 13px;
  }
}

/* === 橫屏模式 + 桌面：圖示+文字完整顯示 === */
@media screen and (orientation: landscape),
       screen and (min-width: 769px) {
  .btn-icon,
  .btn-text {
    display: inline;
  }
}
</style>