/**
 * 共用API客戶端
 * 消除重複代碼並提供一致的錯誤處理
 */

import { handleApiError } from './errorHandler'
import { getCachedClientIP } from './ip'

class APIClient {
  constructor() {
    this.baseURL = window.GAS_URL || ''
  }

  /**
   * 處理後端返回的 session 資訊
   */
  handleSessionInfo(sessionInfo) {
    if (!sessionInfo.isValid) {
      // Session 無效，清除本地存儲
      localStorage.removeItem('sessionId')
      console.warn('⚠️ Session 無效：', sessionInfo.message)
      
      // 重定向到登入頁面或顯示登入提示
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login'
      }
      return
    }

    // Session 有效，更新本地資訊
    const remainingMinutes = Math.floor(sessionInfo.remainingTime / (1000 * 60))
    const remainingHours = Math.floor(remainingMinutes / 60)
    
    // 如果剩餘時間小於 5 分鐘，顯示警告
    if (remainingMinutes < 5 && remainingMinutes > 0) {
      console.warn(`⚠️ Session 將在 ${remainingMinutes} 分鐘後過期`)
      
      // 可以在這裡觸發全域事件，讓 UI 顯示續期提示
      if (typeof window.showSessionWarning === 'function') {
        window.showSessionWarning(remainingMinutes)
      }
    }
    
    // 更新本地存儲的過期時間資訊
    localStorage.setItem('sessionExpiryTime', sessionInfo.expiryTime.toString())
    
    // 儲存 session timeout 配置（如果有提供）
    if (sessionInfo.sessionTimeout) {
      localStorage.setItem('sessionTimeout', sessionInfo.sessionTimeout.toString())
    }
    
    // 更新全局App的session时间 (如果App实例可用)
    if (window.vueApp && window.vueApp.$data) {
      window.vueApp.$data.sessionExpiryTime = sessionInfo.expiryTime
      
      // 更新 session timeout 配置
      if (sessionInfo.sessionTimeout) {
        window.vueApp.$data.sessionTimeout = sessionInfo.sessionTimeout
      }
      
      // 每次都重新計算 sessionStartTime (sliding window)
      // sessionStartTime = 當前時間 - (timeout - remainingTime)
      const timeout = sessionInfo.sessionTimeout || parseInt(localStorage.getItem('sessionTimeout')) || 86400000
      window.vueApp.$data.sessionStartTime = Date.now() - (timeout - sessionInfo.remainingTime)
    }
    
    // 顯示更詳細的時間資訊
    if (remainingHours > 0) {
      console.log(`✅ Session 已延長，剩餘時間：${remainingHours} 小時 ${remainingMinutes % 60} 分鐘`)
    } else {
      console.log(`✅ Session 已延長，剩餘時間：${remainingMinutes} 分鐘`)
    }
  }

  async call(endpoint, data = {}, method = 'POST', options = {}) {
    const { silent = false } = options

    // Get client IP for auth-related operations
    const needsIP = endpoint.includes('/auth/') || endpoint.includes('login') || endpoint.includes('register');
    if (needsIP && !data.clientIP) {
      try {
        data.clientIP = await getCachedClientIP();
      } catch (error) {
        console.warn('Failed to get client IP:', error);
        data.clientIP = 'unknown';
      }
    }

    try {
      const response = await new Promise((resolve, reject) => {
        if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.handleAPIRequestForFrontend === 'function') {
          google.script.run
            .withSuccessHandler((result) => {
              // 新的handleAPIRequestForFrontend函數直接返回JavaScript對象
              if (result === null || result === undefined) {
                resolve({
                  success: false,
                  error: {
                    code: 'BACKEND_ERROR',
                    message: '後端處理失敗，請稍後再試'
                  }
                })
              } else {
                resolve(result)
              }
            })
            .withFailureHandler((error) => {
              // GAS 調用失敗
              reject(new Error(`GAS call failed: ${error.message || error.toString()}`))
            })
            .handleAPIRequestForFrontend(method, endpoint, data)
        } else {
          reject(new Error('Google Apps Script not available'))
        }
      })
      
      // 檢查響應格式
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from backend')
      }
      
      // 處理 session 資訊
      if (response.session) {
        this.handleSessionInfo(response.session)
      }
      
      // 處理API錯誤響應
      if (!response.success && !silent) {
        const action = this.getActionDescription(endpoint, method)
        handleApiError(response, action)
      }
      
      return response
    } catch (error) {
      // 網路或系統錯誤
      if (!silent) {
        const action = this.getActionDescription(endpoint, method)
        handleApiError({ 
          success: false, 
          error: { 
            code: 'NETWORK_ERROR',
            message: error.message || '網路連線錯誤' 
          }
        }, action)
      }
      
      return { 
        success: false, 
        error: { 
          code: 'NETWORK_ERROR',
          message: error.message || '網路錯誤，請重試' 
        } 
      }
    }
  }

  // 帶session驗證的API調用
  async callWithAuth(endpoint, data = {}, method = 'POST', options = {}) {
    const sessionId = localStorage.getItem('sessionId')
    if (!sessionId) {
      const errorResponse = { 
        success: false, 
        error: { 
          code: 'NO_SESSION',
          message: '尚未登入，請先登入' 
        } 
      }
      
      // 對於「沒有session」的情況，不顯示錯誤訊息
      // 因為這是正常的初始狀態，不是錯誤
      // if (!options.silent) {
      //   handleApiError(errorResponse, this.getActionDescription(endpoint, method))
      // }
      
      return errorResponse
    }

    return this.call(endpoint, { ...data, sessionId }, method, options)
  }
  
  /**
   * 根據端點獲取操作描述
   */
  getActionDescription(endpoint, method) {
    const actionMap = {
      '/auth/login': '登入',
      '/auth/logout': '登出',
      '/auth/register': '註冊',
      '/auth/change-password': '修改密碼',
      '/users/profile': method === 'GET' ? '獲取個人資料' : '更新個人資料',
      '/users/avatar/update': '更新頭像',
      '/projects/create': '建立專案',
      '/projects/update': '更新專案',
      '/projects/delete': '刪除專案',
      '/projects/core': '載入專案資料',
      '/submissions/submit': '提交報告',
      '/rankings/submit': '提交排名',
      '/comments/create': '發表評論',
      '/comments/ranking': '評論投票',
      '/comments/rankings': '獲取評論排名',
      '/comments/stage-rankings': '獲取階段評論排名',
      '/comments/settlement-analysis': '獲取評論計票分析',
      '/wallets/transactions': '載入交易記錄',
      '/groups/create': '建立群組',
      '/groups/update': '更新群組',
      '/stages/create': '建立階段',
      '/stages/update': '更新階段',
      '/tags/create': '建立標籤',
      '/tags/update': '更新標籤',
      '/invitations/generate': '生成邀請碼',
      '/projects/list': '載入專案列表',
      '/projects/list-with-stages': '載入專案列表',
      '/groups/details': '載入群組詳情',
      '/groups/add-member': '新增群組成員',
      '/groups/remove-member': '移除群組成員',
      '/system/logs': '獲取系統日誌',
      '/system/logs/stats': '獲取日誌統計',
      '/system/logs/archive': '日誌歸檔'
    }
    
    return actionMap[endpoint] || '操作'
  }

  // 評論相關API
  async createComment(projectId, stageId, content, parentCommentId = null) {
    return this.callWithAuth('/comments/create', {
      projectId,
      stageId,
      commentData: { 
        content,
        parentCommentId 
      }
    })
  }
  
  async createReply(projectId, stageId, content, parentCommentId) {
    return this.createComment(projectId, stageId, content, parentCommentId)
  }

  async getStageComments(projectId, stageId, excludeTeachers = false) {
    return this.callWithAuth('/comments/stage', {
      projectId,
      stageId,
      excludeTeachers
    })
  }

  async submitCommentRanking(projectId, stageId, rankingData) {
    return this.callWithAuth('/comments/ranking', {
      projectId,
      stageId,
      rankingData
    })
  }
  
  async getStageComments(projectId, stageId, excludeTeachers = false) {
    return this.callWithAuth('/comments/stage', {
      projectId,
      stageId,
      excludeTeachers
    })
  }

  async getCommentRankings(projectId, stageId, commentId) {
    return this.callWithAuth('/comments/rankings', {
      projectId,
      stageId,
      commentId
    })
  }

  async getStageCommentRankings(projectId, stageId) {
    return this.callWithAuth('/comments/stage-rankings', {
      projectId,
      stageId
    })
  }

  async getCommentSettlementAnalysis(projectId, stageId) {
    return this.callWithAuth('/comments/settlement-analysis', {
      projectId,
      stageId
    })
  }

  async checkVotingEligibility(projectId, stageId) {
    return this.callWithAuth('/comments/voting-eligibility', {
      projectId,
      stageId
    })
  }

  // 用戶相關API
  async getUsersBySharedTags() {
    return this.callWithAuth('/users/shared-tags')
  }

  // 專案相關API
  async getProjectCore(projectId) {
    return this.callWithAuth('/projects/core', { projectId })
  }

  async getProjectContent(projectId, stageId = null, contentType = 'all', excludeTeachers = false) {
    return this.callWithAuth('/projects/content', {
      projectId,
      stageId,
      contentType,
      excludeTeachers
    })
  }
  
  // 報告提交相關API
  async submitReport(projectId, stageId, submissionData) {
    return this.callWithAuth('/submissions/submit', {
      projectId,
      stageId,
      submissionData
    })
  }

  async voteApproveGroupSubmission(projectId, stageId, submissionId, agree, comment = '') {
    return this.callWithAuth('/submissions/confirm-participation', {
      projectId,
      stageId,
      submissionId,
      agree,
      comment
    })
  }

  async getGroupSubmissionApprovalVotes(projectId, stageId, submissionId) {
    return this.callWithAuth('/submissions/participation-status', {
      projectId,
      stageId,
      submissionId
    })
  }

  async deleteSubmission(projectId, submissionId) {
    return this.callWithAuth('/submissions/delete', {
      projectId,
      submissionId
    })
  }
  
  async getStageSubmissions(projectId, stageId) {
    return this.callWithAuth('/submissions/list', {
      projectId,
      stageId
    })
  }
  
  // 新的專用版本API
  async getSubmissionVersions(projectId, stageId, options = {}) {
    return this.callWithAuth('/submissions/versions', {
      projectId,
      stageId,
      options
    })
  }
  
  // 獲取組在階段的所有版本投票歷史
  async getGroupStageVotingHistory(projectId, stageId, groupId = null) {
    return this.callWithAuth('/submissions/voting-history', {
      projectId,
      stageId,
      groupId
    })
  }
  
  // 恢復撤回的提交版本
  async restoreSubmissionVersion(projectId, stageId, submissionId) {
    return this.callWithAuth('/submissions/restore', {
      projectId,
      stageId,
      submissionId
    })
  }
  
  // 排名投票相關API
  async submitGroupRanking(projectId, stageId, rankingData) {
    return this.callWithAuth('/rankings/submit', {
      projectId,
      stageId,
      rankingData
    })
  }
  
  async voteOnRankingProposal(projectId, proposalId, agree, comment) {
    return this.callWithAuth('/rankings/vote', {
      projectId,
      proposalId,
      agree,
      comment
    })
  }
  
  async checkUserVotingEligibility(projectId, stageId) {
    return this.callWithAuth('/comments/voting-eligibility', {
      projectId,
      stageId
    })
  }

  async submitRankingVote(projectId, stageId, rankings) {
    return this.callWithAuth('/rankings/stage-vote', {
      projectId,
      stageId,
      rankings
    })
  }

  async getStageVotingStatus(projectId, stageId) {
    return this.callWithAuth('/rankings/voting-status', {
      projectId,
      stageId
    })
  }

  // Teacher ranking APIs (for Global PMs)
  async submitTeacherRanking(projectId, stageId, rankings) {
    return this.callWithAuth('/rankings/teacher-vote', {
      projectId,
      stageId,
      rankings
    })
  }

  async getTeacherRankings(projectId, stageId) {
    return this.callWithAuth('/rankings/teacher-rankings', {
      projectId,
      stageId
    })
  }

  async submitTeacherComprehensiveVote(projectId, stageId, rankings) {
    return this.callWithAuth('/rankings/teacher-comprehensive-vote', {
      projectId,
      stageId,
      rankings
    })
  }

  async getStageRankingProposals(projectId, stageId) {
    return this.callWithAuth('/rankings/proposals', {
      projectId,
      stageId
    })
  }
  
  // 群組管理API
  async getProjectGroups(projectId, includeInactive = false) {
    return this.callWithAuth('/groups/list', {
      projectId,
      includeInactive
    })
  }
  
  async createGroup(projectId, groupData) {
    return this.callWithAuth('/groups/create', {
      projectId,
      groupData
    })
  }
  
  async updateGroup(projectId, groupId, updates) {
    return this.callWithAuth('/groups/update', {
      projectId,
      groupId,
      updates
    })
  }
  
  async deleteGroup(projectId, groupId) {
    return this.callWithAuth('/groups/delete', {
      projectId,
      groupId
    })
  }
  
  // 專案列表API
  async getProjectsList() {
    return this.callWithAuth('/projects/list')
  }
  
  // 專案列表API（包含階段數據）
  async getProjectsListWithStages() {
    return this.callWithAuth('/projects/list-with-stages')
  }
  
  // 群組詳情API
  async getGroupDetails(projectId, groupId) {
    return this.callWithAuth('/groups/details', {
      projectId,
      groupId
    })
  }
  
  // 群組成員管理API
  async addGroupMember(projectId, groupId, userEmail, role = 'member') {
    return this.callWithAuth('/groups/add-member', {
      projectId,
      groupId,
      userEmail,
      role
    })
  }
  
  async removeGroupMember(projectId, groupId, userEmail) {
    return this.callWithAuth('/groups/remove-member', {
      projectId,
      groupId,
      userEmail
    })
  }
  
  async setGroupRole(projectId, groupId, groupRole, permissions = []) {
    return this.callWithAuth('/groups/set-role', {
      projectId,
      groupId,
      groupRole,
      permissions
    })
  }
  
  // 階段管理API
  async createStage(projectId, stageData) {
    return this.callWithAuth('/stages/create', {
      projectId,
      stageData
    })
  }
  
  async getProjectStages(projectId) {
    return this.callWithAuth('/stages/list', {
      projectId
    })
  }
  
  async getStage(projectId, stageId) {
    return this.callWithAuth('/stages/get', {
      projectId,
      stageId
    })
  }
  
  async updateStage(projectId, stageId, updates) {
    return this.callWithAuth('/stages/update', {
      projectId,
      stageId,
      updates
    })
  }
  
  async updateStageConfig(projectId, stageId, configUpdates) {
    return this.callWithAuth('/stages/config', {
      projectId,
      stageId,
      configUpdates
    })
  }
  
  // 系統日誌相關API
  async getSystemLogs(options = {}) {
    return this.callWithAuth('/system/logs', options)
  }
  
  async getLogStatistics() {
    return this.callWithAuth('/system/logs/stats')
  }
  
  async archiveLogs(maxRows = 50000) {
    return this.callWithAuth('/system/logs/archive', { maxRows })
  }
}

// 導出單例實例
export const apiClient = new APIClient()
export default apiClient