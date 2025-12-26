import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw, RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { isTokenExpired } from '@/utils/jwt'

// ==================== TypeScript 類型擴充 ====================
// 擴充 vue-router 的 RouteMeta 接口，提供類型安全的 meta 屬性
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    requiresAdmin?: boolean
    requiresGuest?: boolean
    backgroundRoute?: boolean
    groupType?: 'global' | 'project'
    logMode?: 'standard' | 'login' | 'email'  // SystemLogs 模式
    requiredPermissions?: string[]
  }
}

// Lazy-load layouts
const MainLayout = () => import('@/layouts/MainLayout.vue')
const AuthLayout = () => import('@/layouts/AuthLayout.vue')

// Lazy-load components for better performance
const Dashboard = () => import('@/components/Dashboard.vue')
const ProjectDetail = () => import('@/components/ProjectDetail-New.vue')
const Wallet = () => import('@/components/WalletNew.vue')
const UserSettings = () => import('@/components/UserSettings.vue')
const SystemAdmin = () => import('@/components/SystemAdmin.vue')

// Lazy-load admin sub-components
const UserManagement = () => import('@/components/admin/UserManagement.vue')
const ProjectManagement = () => import('@/components/admin/ProjectManagement.vue')
const GroupManagement = () => import('@/components/admin/GroupManagement.vue')
const NotificationManagement = () => import('@/components/admin/NotificationManagement.vue')
const EmailLogsManagement = () => import('@/components/admin/EmailLogsManagement.vue')
const SystemSettings = () => import('@/components/admin/SystemSettings.vue')
const SystemLogs = () => import('@/components/admin/SystemLogs.vue')

// Lazy-load auth views
const LoginView = () => import('@/views/auth/LoginView.vue')
const RegisterView = () => import('@/views/auth/RegisterView.vue')
const ForgotPasswordView = () => import('@/views/auth/ForgotPasswordView.vue')

const routes: RouteRecordRaw[] = [
  // 主應用路由（使用 MainLayout）
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: Dashboard,
        meta: {
          title: '首页',
          requiresAuth: true
        }
      },
      {
        path: 'logs/:projectId(proj_[a-zA-Z0-9-]+)',
        name: 'event-logs',
        component: Dashboard,
        props: true,
        meta: {
          title: '事件日誌',
          requiresAuth: true
        }
      },
      // 项目详情路由（阶段路由必须在前面，优先匹配）
      {
        path: 'project-detail/:projectId(proj_[a-zA-Z0-9-]+)/stage/:stageId(stg_[a-zA-Z0-9-]+)/:action?/:extraParam?',
        name: 'projects-stage',
        component: ProjectDetail,
        props: true,
        meta: {
          title: '项目详情',
          requiresAuth: true
        }
      },
      {
        path: 'project-detail/:projectId(proj_[a-zA-Z0-9-]+)/:globalAction?',
        name: 'projects-view',
        component: ProjectDetail,
        props: true,
        meta: {
          title: '项目详情',
          requiresAuth: true
        }
      },
      {
        path: 'wallet/:projectId?/:userEmail?',
        name: 'wallets',
        component: Wallet,
        props: true,
        meta: {
          title: '钱包',
          requiresAuth: true
        }
      },
      {
        path: 'settings',
        name: 'user-settings',
        component: UserSettings,
        meta: {
          title: '使用者设定',
          requiresAuth: true
        }
      },
      {
        path: 'admin',
        name: 'admin',
        component: SystemAdmin,
        meta: {
          title: '系统管理',
          requiresAuth: true,
          requiresAdmin: true
        },
        redirect: '/admin/users',
        children: [
      {
        path: 'users',
        name: 'admin-users',
        component: UserManagement,
        meta: {
          title: '使用者管理',
          requiresAuth: true,
          requiresAdmin: true
        },
        children: [
          {
            path: 'invitation',
            name: 'admin-users-invitation',
            component: UserManagement,
            meta: {
              title: '邀請碼管理',
              requiresAuth: true,
              requiresAdmin: true,
              requiredPermissions: ['generate_invites']
            }
          },
          {
            path: ':userEmail',
            name: 'admin-users-detail',
            component: UserManagement,
            props: true,
            meta: {
              title: '使用者活动统计',
              requiresAuth: true,
              requiresAdmin: true
            }
          }
        ]
      },
      {
        path: 'projects',
        name: 'admin-projects',
        component: ProjectManagement,
        meta: {
          title: '专案管理',
          requiresAuth: true,
          requiresAdmin: true
        },
        children: [
          {
            path: ':projectId',
            name: 'admin-projects-detail',
            component: ProjectManagement,
            props: true,
            meta: {
              title: '专案详情',
              requiresAuth: true,
              requiresAdmin: true
            }
          }
        ]
      },
      {
        path: 'groups',
        name: 'admin-groups',
        component: GroupManagement,
        meta: {
          title: '群组管理',
          requiresAuth: true,
          requiresAdmin: true
        },
        redirect: '/admin/groups/global', // Default to global groups
        children: [
          {
            path: 'global',
            name: 'admin-groups-global',
            component: GroupManagement,
            meta: {
              title: '全域群组',
              requiresAuth: true,
              requiresAdmin: true,
              groupType: 'global'
            }
          },
          {
            path: 'global/:groupId',
            name: 'admin-groups-global-detail',
            component: GroupManagement,
            props: true,
            meta: {
              title: '全域群组详情',
              requiresAuth: true,
              requiresAdmin: true,
              groupType: 'global'
            }
          },
          {
            path: 'project',
            name: 'admin-groups-project',
            component: GroupManagement,
            meta: {
              title: '专案群组',
              requiresAuth: true,
              requiresAdmin: true,
              groupType: 'project'
            }
          },
          {
            path: 'project/:projectId',
            name: 'admin-groups-project-detail',
            component: GroupManagement,
            props: true,
            meta: {
              title: '专案群组列表',
              requiresAuth: true,
              requiresAdmin: true,
              groupType: 'project'
            }
          },
          {
            path: 'project/:projectId/:groupId',
            name: 'admin-groups-project-group-detail',
            component: GroupManagement,
            props: true,
            meta: {
              title: '专案群组详情',
              requiresAuth: true,
              requiresAdmin: true,
              groupType: 'project'
            }
          }
        ]
      },
      {
        path: 'notifications',
        name: 'admin-notifications',
        component: NotificationManagement,
        meta: {
          title: '通知管理',
          requiresAuth: true,
          requiresAdmin: true
        }
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: SystemSettings,
        meta: {
          title: '系统设定',
          requiresAuth: true,
          requiresAdmin: true
        }
      },
      {
        path: 'logs',
        name: 'admin-logs',
        component: SystemLogs,
        meta: {
          title: '系统日志',
          requiresAuth: true,
          requiresAdmin: true
        },
        children: [
          {
            path: ':logId',
            name: 'admin-logs-detail',
            component: SystemLogs,
            props: true,
            meta: {
              title: '日志详情',
              requiresAuth: true,
              requiresAdmin: true
            }
          },
          {
            path: 'login/:userId',
            name: 'admin-logs-login-user',
            component: SystemLogs,
            props: true,
            meta: {
              title: '使用者登入記錄',
              requiresAuth: true,
              requiresAdmin: true,
              logMode: 'login'  // Indicates this route should show login logs mode
            }
          }
        ]
      },
      {
        path: 'email-logs',
        name: 'admin-email-logs',
        component: EmailLogsManagement,
        meta: {
          title: '郵件紀錄',
          requiresAuth: true,
          requiresAdmin: true
        },
        children: [
          {
            path: ':emailId',
            name: 'admin-email-logs-detail',
            component: EmailLogsManagement,
            props: true,
            meta: {
              title: '郵件詳情',
              requiresAuth: true,
              requiresAdmin: true
            }
          }
        ]
      }
        ]
      }
    ]
  },
  // 認證路由（使用 AuthLayout）
  {
    path: '/auth',
    component: AuthLayout,
    meta: { requiresGuest: true },
    children: [
      {
        path: 'login',
        name: 'auth-login',
        component: LoginView,
        meta: { title: '登入', backgroundRoute: true }
      },
      {
        path: 'register',
        name: 'auth-register',
        component: RegisterView,
        meta: { title: '註冊', backgroundRoute: true }
      },
      {
        path: 'forgot-password',
        name: 'auth-forgot-password',
        component: ForgotPasswordView,
        meta: { title: '忘記密碼', backgroundRoute: true }
      }
    ]
  },
  {
    // Catch-all redirect to dashboard
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    // Restore scroll position when using browser back/forward
    if (savedPosition) {
      return savedPosition
    }
    // Scroll to top for new pages
    return { top: 0 }
  }
})

// Navigation guards
router.beforeEach((to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
  // Update document title
  if (to.meta.title) {
    document.title = `${to.meta.title} - 评分系统`
  }

  // Check authentication status
  const token = sessionStorage.getItem('sessionId')
  const isAuthenticated = token && !isTokenExpired(token)
  const isAuthRoute = to.path.startsWith('/auth')

  // 未登入且訪問需認證的頁面 → 重定向到 /auth/login?redirect=原頁面
  if (!isAuthenticated && to.meta.requiresAuth) {
    next({
      name: 'auth-login',
      query: { redirect: to.fullPath }
    })
    return
  }

  // 已登入且訪問認證頁面 → 重定向到首頁（或 redirect 參數）
  if (isAuthenticated && (isAuthRoute || to.meta.requiresGuest)) {
    const redirect = to.query.redirect as string
    next(redirect || { name: 'dashboard' })
    return
  }

  next()
})

export default router
