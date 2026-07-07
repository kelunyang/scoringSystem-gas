/**
 * 專案狀態顯示工具
 *
 * ProjectManagement 主列表與 ArchiveProjectDrawer 共用
 */

/**
 * 取得專案狀態對應的 FontAwesome icon class
 *
 * @param status - 專案狀態
 * @returns icon class 字串
 */
export function getProjectStatusIcon(status: string): string {
  switch (status) {
    case 'active': return 'fas fa-play-circle'
    case 'completed': return 'fas fa-check-circle'
    case 'archived': return 'fas fa-archive'
    default: return 'fas fa-question-circle'
  }
}

/**
 * 取得專案狀態的中文顯示文字
 *
 * @param status - 專案狀態
 * @returns 狀態中文名稱
 */
export function getProjectStatusText(status: string): string {
  switch (status) {
    case 'active': return '進行中'
    case 'completed': return '已完成'
    case 'archived': return '已封存'
    default: return '進行中' // 預設為進行中，避免未知狀態
  }
}
