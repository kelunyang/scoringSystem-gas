/**
 * useRouteDrawer.ts
 *
 * Composable for managing ProjectDetail drawer routing
 * Handles URL-based drawer opening with deep linking support
 */

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { Project, Stage } from '@/types'
import type { PermissionFlags } from './useProjectPermissions'

/**
 * Drawer action types
 * Maps URL action parameter to drawer name
 */
export type DrawerAction =
  | 'vote-result'      // 投票drawer
  | 'submit-report'    // 發成果drawer
  | 'submit-comment'   // 發評論drawer
  | 'approval'         // 共識drawer
  | 'comment-vote'     // 評論投票
  | 'teacher-vote'     // 教師投票
  | 'analysis'         // 獎金分配
  | 'award'            // 發放獎金
  | 'reply'            // 回復評論 (需要 commentId)
  | 'description'      // 專案介紹

/**
 * Drawer configuration for validation
 */
interface DrawerConfig {
  requiresStage: boolean          // 是否需要 stageId
  requiresExtraParam: boolean     // 是否需要額外參數
  extraParamName?: string         // 額外參數的名稱
  permissionCheck?: (permissions: PermissionFlags, stage?: Stage) => boolean  // 權限檢查函數
}

/**
 * Drawer configuration map
 */
const DRAWER_CONFIGS: Record<DrawerAction, DrawerConfig> = {
  'vote-result': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions, stage) => {
      // 階段必須是 voting 或 completed
      return stage?.status === 'voting' || stage?.status === 'completed'
    }
  },
  'submit-report': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions) => permissions.canSubmit
  },
  'submit-comment': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions) => permissions.canComment
  },
  'approval': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions, stage) => {
      return permissions.canVote && stage?.status === 'active'
    }
  },
  'comment-vote': {
    requiresStage: true,
    requiresExtraParam: true,
    extraParamName: 'submissionId',
    permissionCheck: (permissions, stage) => {
      return permissions.canVote && stage?.status === 'voting'
    }
  },
  'teacher-vote': {
    requiresStage: true,
    requiresExtraParam: true,
    extraParamName: 'submissionId',
    permissionCheck: (permissions) => permissions.canTeacherVote
  },
  'analysis': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: () => true  // 所有人都可以查看
  },
  'award': {
    requiresStage: true,
    requiresExtraParam: false,
    permissionCheck: (permissions) => {
      return permissions.permissionLevel === 'admin' ||
             permissions.permissionLevel === 'teacher'
    }
  },
  'reply': {
    requiresStage: true,
    requiresExtraParam: true,
    extraParamName: 'commentId',
    permissionCheck: (permissions) => permissions.canComment
  },
  'description': {
    requiresStage: false,
    requiresExtraParam: false,
    permissionCheck: () => true  // 所有人都可以查看
  }
}

/**
 * useRouteDrawer Composable
 */
export function useRouteDrawer() {
  const route = useRoute()
  const router = useRouter()

  // ========================================
  // Computed Properties - URL Parameters
  // ========================================

  /**
   * Current drawer action from URL
   * For stage routes: /projects/:projectId/stage/:stageId/:action?/:extraParam?
   */
  const currentAction = computed<DrawerAction | undefined>(() => {
    if (route.name === 'projects-stage') {
      return route.params.action as DrawerAction | undefined
    }
    return undefined
  })

  /**
   * Current stage ID from URL
   */
  const currentStageId = computed<string | undefined>(() => {
    if (route.name === 'projects-stage') {
      return route.params.stageId as string | undefined
    }
    return undefined
  })

  /**
   * Extra parameter (commentId, submissionId, etc.)
   */
  const currentExtraParam = computed<string | undefined>(() => {
    if (route.name === 'projects-stage') {
      return route.params.extraParam as string | undefined
    }
    return undefined
  })

  /**
   * Current global action from URL
   * For global routes: /projects/:projectId/:globalAction?
   */
  const currentGlobalAction = computed<DrawerAction | undefined>(() => {
    if (route.name === 'projects-view') {
      return route.params.globalAction as DrawerAction | undefined
    }
    return undefined
  })

  // ========================================
  // Navigation Functions
  // ========================================

  /**
   * Navigate to stage action (open drawer)
   * @param projectId Project ID
   * @param stageId Stage ID
   * @param action Drawer action (optional, clears if not provided)
   * @param extraParam Extra parameter (commentId, submissionId, etc.)
   */
  const navigateToStageAction = (
    projectId: string,
    stageId: string,
    action?: DrawerAction,
    extraParam?: string
  ) => {
    const params: Record<string, string> = {
      projectId,
      stageId
    }

    if (action) {
      params.action = action
      if (extraParam) {
        params.extraParam = extraParam
      }
    }

    router.replace({
      name: 'projects-stage',
      params
    })
  }

  /**
   * Navigate to global action (project-level drawer)
   * @param projectId Project ID
   * @param action Drawer action (optional, clears if not provided)
   */
  const navigateToGlobalAction = (
    projectId: string,
    action?: DrawerAction
  ) => {
    const params: Record<string, string> = {
      projectId
    }

    if (action) {
      params.globalAction = action
    }

    router.replace({
      name: 'projects-view',
      params
    })
  }

  /**
   * Clear action parameter (close drawer)
   * Preserves current route (stage or global)
   */
  const clearAction = () => {
    const projectId = route.params.projectId as string

    if (route.name === 'projects-stage') {
      const stageId = route.params.stageId as string
      navigateToStageAction(projectId, stageId)
    } else if (route.name === 'projects-view') {
      navigateToGlobalAction(projectId)
    }
  }

  // ========================================
  // Drawer Processing from URL
  // ========================================

  /**
   * Process drawer opening from URL parameters
   * Validates permissions and opens the appropriate drawer
   *
   * @param permissions User permissions for this project
   * @param stages Project stages
   * @returns Drawer configuration to open (or undefined if invalid)
   */
  const processDrawerFromUrl = (
    permissions: PermissionFlags,
    stages: Stage[]
  ): {
    action: DrawerAction
    stageId?: string
    extraParam?: string
    errorMessage?: string
  } | undefined => {
    // Check for stage action
    if (currentAction.value && currentStageId.value) {
      const action = currentAction.value
      const stageId = currentStageId.value
      const extraParam = currentExtraParam.value

      // Validate action
      const config = DRAWER_CONFIGS[action]
      if (!config) {
        ElMessage.error(`未知的 drawer 類型: ${action}`)
        clearAction()
        return undefined
      }

      // Find stage
      const stage = stages.find(s => s.stageId === stageId)
      if (!stage) {
        ElMessage.error(`找不到階段: ${stageId}`)
        clearAction()
        return undefined
      }

      // Check if extra param is required
      if (config.requiresExtraParam && !extraParam) {
        ElMessage.error(`${action} 需要額外參數: ${config.extraParamName}`)
        clearAction()
        return undefined
      }

      // Check permissions
      if (config.permissionCheck && !config.permissionCheck(permissions, stage)) {
        ElMessage.warning('您沒有權限執行此操作')
        clearAction()
        return undefined
      }

      // All checks passed
      return {
        action,
        stageId,
        extraParam
      }
    }

    // Check for global action
    if (currentGlobalAction.value) {
      const action = currentGlobalAction.value

      // Validate action
      const config = DRAWER_CONFIGS[action]
      if (!config) {
        ElMessage.error(`未知的 drawer 類型: ${action}`)
        clearAction()
        return undefined
      }

      // Check if this is a global action (doesn't require stage)
      if (config.requiresStage) {
        ElMessage.error(`${action} 需要指定階段`)
        clearAction()
        return undefined
      }

      // Check permissions
      if (config.permissionCheck && !config.permissionCheck(permissions)) {
        ElMessage.warning('您沒有權限執行此操作')
        clearAction()
        return undefined
      }

      // All checks passed
      return {
        action
      }
    }

    return undefined
  }

  // ========================================
  // Return API
  // ========================================

  return {
    // Computed properties
    currentAction,
    currentStageId,
    currentExtraParam,
    currentGlobalAction,

    // Navigation functions
    navigateToStageAction,
    navigateToGlobalAction,
    clearAction,

    // URL processing
    processDrawerFromUrl,

    // Config for reference
    DRAWER_CONFIGS
  }
}
