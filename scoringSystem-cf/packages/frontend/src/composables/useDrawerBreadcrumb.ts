import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 為 Drawer 提供當前頁面名稱的 composable
 * 用於生成 breadcrumb 導航：[當前頁面] > [Drawer功能]
 */
export function useDrawerBreadcrumb() {
  const route = useRoute()

  const currentPageName = computed(() => {
    switch (route.name) {
      case 'dashboard':
        return '首頁'
      case 'projects-view':
      case 'projects-stage':
        return '專案詳情'
      case 'wallets':
        return '錢包'
      case 'event-logs':
        return '事件日誌'
      case 'user-settings':
        return '個人設定'
      case 'admin-projects':
      case 'admin-projects-detail':
        return '專案管理'
      case 'admin-users':
      case 'admin-users-invitation':
      case 'admin-users-detail':
        return '使用者管理'
      case 'admin-groups':
      case 'admin-groups-global':
      case 'admin-groups-global-detail':
      case 'admin-groups-project':
      case 'admin-groups-project-detail':
      case 'admin-groups-project-group-detail':
        return '群組管理'
      case 'admin-settings':
        return '系統設定'
      case 'admin-logs':
      case 'admin-logs-detail':
      case 'admin-logs-login-user':
        return '系統日誌'
      case 'admin-email-logs':
      case 'admin-email-logs-detail':
        return '郵件紀錄'
      case 'admin-notifications':
        return '系統通知'
      default:
        return '首頁'
    }
  })

  const currentPageIcon = computed(() => {
    switch (route.name) {
      case 'dashboard':
        return 'fas fa-home'
      case 'projects-view':
      case 'projects-stage':
        return 'fas fa-project-diagram'
      case 'wallets':
        return 'fas fa-wallet'
      case 'event-logs':
        return 'fas fa-history'
      case 'user-settings':
        return 'fas fa-user-cog'
      case 'admin-projects':
      case 'admin-projects-detail':
        return 'fas fa-folder'
      case 'admin-users':
      case 'admin-users-invitation':
      case 'admin-users-detail':
        return 'fas fa-users'
      case 'admin-groups':
      case 'admin-groups-global':
      case 'admin-groups-global-detail':
      case 'admin-groups-project':
      case 'admin-groups-project-detail':
      case 'admin-groups-project-group-detail':
        return 'fas fa-users-cog'
      case 'admin-settings':
        return 'fas fa-cog'
      case 'admin-logs':
      case 'admin-logs-detail':
      case 'admin-logs-login-user':
        return 'fas fa-file-alt'
      case 'admin-email-logs':
      case 'admin-email-logs-detail':
        return 'fas fa-envelope'
      case 'admin-notifications':
        return 'fas fa-bell'
      default:
        return 'fas fa-home'
    }
  })

  return {
    currentPageName,
    currentPageIcon
  }
}
