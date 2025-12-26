import { computed, watch, unref, type Ref, type ComputedRef } from 'vue'
import type { Group } from '@/types'
import type { PermissionLevel } from './useProjectPermissions'
import { useRoleSelectionStore } from '@/stores/roleSelection'

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

/**
 * 角色配置常量
 */
const ROLE_CONFIG = {
  admin: {
    label: '管理員',
    icon: 'fas fa-crown',
    color: '#f56c6c',
    permissions: ['管理專案', '管理階段', '管理群組', '查看所有資料', '管理錢包']
  },
  teacher: {
    label: '教師',
    icon: 'fas fa-chalkboard-teacher',
    color: '#409eff',
    permissions: ['管理階段', '管理群組', '查看所有資料', '發表評論', '教師投票']
  },
  observer: {
    label: '觀察者',
    icon: 'fas fa-eye',
    color: '#909399',
    permissions: ['查看所有資料']
  },
  group_leader: {
    label: '組長',
    icon: 'fas fa-user-tie',
    color: '#e6a23c',
    permissions: ['提交作品', '管理組員', '投票', '發表評論', '查看資料']
  },
  member_in_group: {
    label: '組員',
    icon: 'fas fa-user',
    color: '#67c23a',
    permissions: ['提交作品', '投票', '發表評論', '查看資料']
  },
  member: {
    label: '成員',
    icon: 'fas fa-user-slash',
    color: '#c0c4cc',
    permissions: []
  }
}

/**
 * 检测用户在项目中拥有的所有角色
 * @param {Object} projectData - 项目数据
 * @param {Object} userData - 用户数据
 * @returns {Array} 角色数组，如 ['admin', 'teacher']
 */
function detectUserRoles(projectData: any, userData: any) {
  if (!projectData || !userData) {
    return []
  }

  const roles = []
  const userEmail = userData.userEmail || userData.email

  // 检查全局管理员权限
  const globalPermissions = userData.permissions || []
  const hasGlobalAdmin = globalPermissions.includes('system_admin') ||
                         globalPermissions.includes('create_project')

  if (hasGlobalAdmin) {
    roles.push('admin')
  }

  // 检查项目创建者
  // Note: createdBy stores userId, not email, so we need to look up the creator's email
  const creatorUser = projectData.users?.find(
    (u: any) => u.userId === projectData.project?.createdBy
  )
  if (creatorUser && creatorUser.userEmail === userEmail) {
    if (!roles.includes('admin')) {
      roles.push('admin')
    }
  }

  // 检查 projectViewers 角色
  if (projectData.viewerRole) {
    if (projectData.viewerRole === 'teacher' && !roles.includes('teacher')) {
      roles.push('teacher')
    }
    if (projectData.viewerRole === 'observer' && !roles.includes('observer')) {
      roles.push('observer')
    }
  }

  // 检查 userGroups 角色
  if (projectData.userGroups && Array.isArray(projectData.userGroups)) {
    const userGroupRecords = projectData.userGroups.filter(
      (ug: any) => ug.userEmail === userEmail && ug.isActive === 1
    )

    const isLeader = userGroupRecords.some((g: Group) => g.role === 'leader')
    const isMember = userGroupRecords.some((g: Group) => g.role === 'member')

    if (isLeader && !roles.includes('group_leader')) {
      roles.push('group_leader')
    } else if (isMember && !roles.includes('member_in_group')) {
      roles.push('member_in_group')
    }
  }

  // 如果 viewerRole 是 member 但没有组，标记为 member
  if (projectData.viewerRole === 'member' &&
      !roles.includes('group_leader') &&
      !roles.includes('member_in_group')) {
    roles.push('member')
  }

  return roles
}

/**
 * 角色切换 Composable
 * Uses Pinia store for cross-component reactivity
 * @param {MaybeRef<string>} projectIdInput - 项目 ID (支持响应式)
 * @param {Ref} projectData - 项目数据（响应式）
 * @param {Ref} userData - 用户数据（响应式）
 */
export function useRoleSwitch(projectIdInput: MaybeRef<string | null>, projectData: any, userData: any) {
  // Use Pinia store for shared role state
  const roleStore = useRoleSelectionStore()

  // Create reactive projectId accessor
  const getProjectId = () => unref(projectIdInput) || ''

  // Initialize from sessionStorage on first use and when projectId changes
  const initStorage = () => {
    const pid = getProjectId()
    if (pid) {
      roleStore.initFromStorage(pid)
    }
  }
  initStorage()

  // Watch projectId changes to re-initialize storage
  watch(() => unref(projectIdInput), () => {
    initStorage()
  })

  // 检测所有可用角色
  const availableRoles = computed(() => {
    return detectUserRoles(projectData?.value, userData?.value)
  })

  // Get default role based on priority
  const getDefaultRole = (available: string[]): PermissionLevel | null => {
    if (available.length === 0) return null
    const priority: PermissionLevel[] = ['admin', 'teacher', 'observer', 'group_leader', 'member_in_group', 'member']
    for (const role of priority) {
      if (available.includes(role)) {
        return role
      }
    }
    return null
  }

  // 当前选择的角色 - now reads from store (reactive across components)
  const currentRole = computed<PermissionLevel | null>(() => {
    const pid = getProjectId()
    if (!pid) return null
    const available = availableRoles.value
    if (available.length === 0) return null

    const storedRole = roleStore.getRole(pid)
    // If stored role is still available, use it
    if (storedRole && available.includes(storedRole)) {
      return storedRole as PermissionLevel
    }
    // Otherwise return default
    return getDefaultRole(available)
  })

  // 监听可用角色变化，确保初始化存储
  watch([availableRoles, () => unref(projectIdInput)], ([available]) => {
    const pid = getProjectId()
    if (!pid || available.length === 0) return

    // If no role in store yet, set the default
    const storedRole = roleStore.getRole(pid)
    if (!storedRole || !available.includes(storedRole)) {
      const defaultRole = getDefaultRole(available)
      if (defaultRole) {
        roleStore.setRole(pid, defaultRole)
      }
    }
  }, { immediate: true })

  // 切换角色 - now uses store
  const switchRole = (newRole: any) => {
    const pid = getProjectId()
    if (!pid) return

    if (!availableRoles.value.includes(newRole)) {
      console.warn(`Role "${newRole}" is not available for this user`)
      return
    }

    roleStore.setRole(pid, newRole)
  }

  // 获取角色配置
  const getRoleConfig = (role: any) => {
    return (ROLE_CONFIG as any)[role] || {
      label: role,
      icon: 'fas fa-question',
      color: '#909399',
      permissions: []
    }
  }

  // 获取角色标签
  const getRoleLabel = (role: any) => {
    return getRoleConfig(role).label
  }

  // 获取角色图标
  const getRoleIcon = (role: any) => {
    return getRoleConfig(role).icon
  }

  // 获取角色颜色
  const getRoleColor = (role: any) => {
    return getRoleConfig(role).color
  }

  // 获取角色权限列表
  const getRolePermissions = (role: any) => {
    return getRoleConfig(role).permissions
  }

  // 当前角色的权限列表
  const currentRolePermissions = computed(() => {
    if (!currentRole.value) return []
    return getRolePermissions(currentRole.value)
  })

  // 是否有多个角色
  const hasMultipleRoles = computed(() => {
    return availableRoles.value.length > 1
  })

  return {
    // 状态
    availableRoles,
    currentRole,
    hasMultipleRoles,
    currentRolePermissions,

    // 方法
    switchRole,
    getRoleConfig,
    getRoleLabel,
    getRoleIcon,
    getRoleColor,
    getRolePermissions
  }
}
