/**
 * @fileoverview Stage content management composable
 * 階段內容管理 composable
 *
 * 從 ProjectDetail.vue 提取的階段內容加載與刷新邏輯
 * 負責階段報告、評論的加載與更新
 */

import { computed } from 'vue'
import { handleError, getErrorMessage } from '@/utils/errorHandler'
import { rpcClient } from '@/utils/rpc-client'
import { dedupRequest } from '@/utils/request-dedup'
import type { Stage, Group, Submission } from '@/types'

/**
 * Extended Stage type for frontend use with additional UI state
 * Using intersection type to avoid property type conflicts
 */
export type ExtendedStage = Omit<Stage, 'viewMode'> & {
  id: string
  title: string
  reportReward: number
  commentReward: number
  deadline: number | undefined
  viewMode?: boolean
  contentLoaded?: boolean
  showFullDescription?: boolean
  loadingReports?: boolean
  loadingComments?: boolean
  refreshing?: boolean
  commentsRefreshKey?: number
  votingEligible?: boolean  // Whether current user has any valid comment (canBeVoted) in this stage
}

/**
 * 階段內容管理 composable
 * @param {Ref<Object>} projectData - 專案數據 ref
 * @param {Ref<Object>} userData - 用戶數據 ref
 * @returns {Object} 階段內容管理函數
 */
export function useStageContentManagement(projectData: any, userData: any) {
  console.log('🔧 [useStageContentManagement] composable 初始化')

  /**
   * 當前用戶的組別列表（響應式計算屬性）
   * 自動過濾出當前登入用戶所屬的 active 組別
   */
  const currentUserGroups = computed(() => {
    // 如果沒有 projectData 或 userGroups，返回 null（數據尚未準備好）
    if (!projectData.value || !projectData.value.userGroups) {
      console.log('🔍 [currentUserGroups] 沒有 projectData 或 userGroups')
      return null
    }

    // 如果沒有 userData，返回 null（等待用戶數據載入）
    if (!userData.value) {
      console.log('🔍 [currentUserGroups] 沒有 userData，等待載入')
      return null
    }

    // 獲取當前登入用戶的 email（從 JWT token）
    const currentUserEmail = userData.value.email || userData.value.userEmail
    if (!currentUserEmail) {
      console.log('🔍 [currentUserGroups] 無法獲取當前用戶 email')
      return null
    }

    // 只返回當前登入用戶的 active 組別
    const groups = projectData.value.userGroups.filter((ug: any) =>
      ug.isActive && ug.userEmail === currentUserEmail
    )

    console.log('🎯 [currentUserGroups] 計算結果:', {
      currentUserEmail,
      groupCount: groups.length,
      groups
    })

    return groups
  })

  /**
   * 載入階段內容數據（報告 + 評論）
   * @param {string} projectId - 專案 ID
   * @param {string} stageId - 階段 ID
   * @param {string} contentType - 內容類型 ('all' | 'submissions' | 'comments')
   * @returns {Promise<Object>} 階段內容數據
   */
  async function loadStageContent(projectId: string, stageId: string, contentType = 'all') {
    try {
      // Vue 3 Best Practice: rpcClient automatically handles authentication
      console.log(`📡 調用 API: getProjectContent(${projectId}, ${stageId}, ${contentType}, includeSubmitted: true)`)

      const httpResponse = await rpcClient.projects.content.$post({
        json: {
          projectId,
          stageId,
          contentType,
          excludeTeachers: false,
          includeSubmitted: true,  // includeSubmitted: true for ProjectDetail to show both approved and submitted
          excludeUserGroups: false  // excludeUserGroups: false - show all groups for ProjectDetail
        }
      })
      const response = await httpResponse.json()

      console.log(`📡 API 響應:`, response)

      // Validate response structure
      if (!response) {
        console.error('❌ loadStageContent: 空響應')
        return null
      }

      if (!response.success) {
        console.error('❌ loadStageContent: API 錯誤', response.error)
        return null
      }

      if (!response.data) {
        console.warn('⚠️ loadStageContent: 響應成功但無數據')
        return { submissions: [], comments: [] }
      }

      if (response.success && response.data) {
        console.log(`✅ 載入成功:`, response.data)

        // 詳細檢查submissions中的排名數據
        if (response.data.submissions) {
          console.log(`🔍 [useStageContentManagement] 階段 ${stageId} 的submissions排名數據分析:`)
          response.data.submissions.forEach((submission: Submission, index: number) => {
            console.log(`  📋 Submission ${index + 1}:`, {
              submissionId: submission.submissionId,
              groupId: submission.groupId,
              groupName: submission.groupName,
              voteRank: submission.voteRank,
              teacherRank: submission.teacherRank,
              settlementRank: submission.settlementRank,
              status: submission.status
            })
          })
        }

        return response.data
      }
    } catch (error) {
      console.error('❌ loadStageContent: 網絡或系統錯誤', error)
      return null
    }
  }

  /**
   * 刷新階段評論
   * 使用 /api/comments/stage API 獲取完整評論數據（包含 reactions 和 canBeVoted）
   * @param {Object} stage - 階段對象
   * @param {string} projectId - 專案 ID
   */
  async function refreshStageComments(stage: ExtendedStage, projectId: string) {
    try {
      console.log('=== refreshStageComments 開始 ===')
      console.log(`階段 ID: ${stage.id}`)

      stage.loadingComments = true
      stage.refreshing = true

      const stageId = stage.id || stage.stageId
      const dedupKey = `comments:${projectId}:${stageId}`

      // 使用 /api/comments/stage 獲取完整評論數據（包含 reactions 和 canBeVoted）
      // 使用 dedupRequest 防止重複請求
      const response = await dedupRequest(dedupKey, async () => {
        const httpResponse = await (rpcClient.comments as any).stage.$post({
          json: {
            projectId,
            stageId,
            excludeTeachers: false
          }
        })
        return httpResponse.json()
      })

      if (response.success && response.data?.comments) {
        // 更新階段的評論數據
        stage.comments = response.data.comments
        console.log(`✅ 已刷新階段 ${stage.title} 的評論，共 ${response.data.comments.length} 條（含 canBeVoted 標誌）`)
      } else {
        console.log(`⚠️ 階段 ${stage.title} 沒有評論內容`)
        stage.comments = []
      }

      // 強制組件重新掛載以顯示巢狀評論
      stage.commentsRefreshKey = (stage.commentsRefreshKey || 0) + 1
      console.log(`🔄 更新 commentsRefreshKey: ${stage.commentsRefreshKey}，強制組件重新掛載`)

      console.log('=== refreshStageComments 結束 ===')
    } catch (error) {
      console.error('刷新評論失敗:', error)
      handleError(error instanceof Error ? error : String(error), { action: '刷新評論' })
    } finally {
      stage.loadingComments = false
      stage.refreshing = false
    }
  }

  /**
   * 載入群組投票數據
   * @param {string} projectId - 專案 ID
   * @param {string} stageId - 階段 ID
   * @param {Object} groupData - 群組數據
   */
  async function loadGroupVotingData(projectId: string, stageId: string, groupData: any) {
    if (!groupData.submissionId) {
      console.log(`⏭️ 群組 ${groupData.groupId} 沒有 submissionId，跳過載入投票數據`)
      return
    }

    try {
      console.log(`📊 載入群組 ${groupData.groupId} 的投票數據...`)
      console.log(`🚀 [loadGroupVotingData] 準備調用 API，參數:`, {
        projectId: projectId,
        stageId: stageId,
        submissionId: groupData.submissionId,
        groupId: groupData.groupId
      })

      const httpResponse = await (rpcClient.submissions as any)['participation-status'].$post({
        json: {
          projectId,
          stageId,
          submissionId: groupData.submissionId
        }
      })
      const response = await httpResponse.json()

      console.log(`📥 [loadGroupVotingData] API 響應:`, response)

      if (response.success && response.data) {
        groupData.votingData = response.data
        console.log(`✅ 群組 ${groupData.groupId} 投票數據載入成功:`, response.data)
        console.log(`🔍 [DEBUG] groupData 現在有 votingData:`, {
          groupId: groupData.groupId,
          hasVotingData: !!groupData.votingData,
          votingData: groupData.votingData,
          votes: groupData.votingData?.votes
        })
      } else {
        // Enhanced error logging
        console.warn(`⚠️ 群組 ${groupData.groupId} 投票數據載入失敗:`, response.error)
        console.warn(`⚠️ [loadGroupVotingData] 錯誤詳情:`, {
          errorCode: response.error?.code || response.errorCode,
          errorMessage: response.error?.message || response.error,
          fullError: response.error,
          fullResponse: response
        })

        // Set votingData to null to indicate failed load
        groupData.votingData = null

        // Show user-friendly error message if it's a critical error
        if (response.errorCode === 'SYSTEM_ERROR' || response.error?.code === 'SYSTEM_ERROR') {
          handleError(
            new Error(response.error?.message || response.error || 'Unknown error'),
            {
              action: '載入投票數據',
              type: 'error'
            }
          )
        }
      }
    } catch (error) {
      console.error(`❌ 載入群組 ${groupData.groupId} 投票數據異常:`, error)
      console.error(`❌ [loadGroupVotingData] Error details:`, getErrorMessage(error))

      // Set votingData to null to indicate failed load
      groupData.votingData = null

      // Show error to user
      handleError(error instanceof Error ? error : String(error), {
        action: `載入群組 ${groupData.groupId} 投票數據`,
        type: 'error'
      })
    }
  }

  /**
   * 刷新階段報告
   * @param {Object} stage - 階段對象
   * @param {string} projectId - 專案 ID
   */
  async function refreshStageReports(stage: ExtendedStage, projectId: string) {
    try {
      stage.loadingReports = true
      stage.refreshing = true

      // 重新載入階段內容
      const content = await loadStageContent(projectId, stage.id || stage.stageId, 'submissions')
      if (content && content.submissions) {
        // 處理報告數據並更新階段
        stage.groups = processSubmissionsToGroups(content.submissions)

        // 只載入當前用戶所屬組的投票數據（使用響應式 computed 屬性）
        // 權限檢查：只有組內成員（leader/member）才能查詢投票數據
        console.log('🔍 [refreshStageReports] 開始檢查是否載入 votingData')
        console.log('👥 [refreshStageReports] currentUserGroups:', currentUserGroups.value)

        // ✅ Early return guard: 如果 currentUserGroups 為 null，表示數據尚未準備好
        if (currentUserGroups.value === null) {
          console.log('⏸️ [refreshStageReports] currentUserGroups 尚未準備好，跳過 votingData 載入')
          // 不 return，繼續載入排名數據
        } else {
          // 遍歷當前用戶的所有組別
          for (const currentUserGroup of currentUserGroups.value) {
            console.log('🔑 [refreshStageReports] 檢查組別:', {
              groupId: currentUserGroup.groupId,
              role: currentUserGroup.role,
              userEmail: currentUserGroup.userEmail
            })

            // ✅ 檢查角色：只有 leader 或 member 才載入 votingData
            if (currentUserGroup.role === 'leader' || currentUserGroup.role === 'member') {
              console.log('✅ [refreshStageReports] 角色檢查通過，準備載入 votingData')

              // 檢查這個階段是否有該組的 submission
              const userGroupData = stage.groups.find((g: Group) => g.groupId === currentUserGroup.groupId)
              console.log('📋 [refreshStageReports] userGroupData:', userGroupData)
              console.log('🔍 [refreshStageReports] 比對 groupId - userGroupData.groupId:', userGroupData?.groupId, 'vs currentUserGroup.groupId:', currentUserGroup.groupId)

              // 必須確認這個 group 確實屬於當前用戶，且有 submission
              if (userGroupData && userGroupData.submissionId && userGroupData.groupId === currentUserGroup.groupId) {
                console.log(`🚀 [refreshStageReports] GroupId 驗證通過，開始載入 votingData for group ${userGroupData.groupId}`)
                await loadGroupVotingData(projectId, stage.id, userGroupData)
              } else {
                if (!userGroupData) {
                  console.log(`ℹ️ [refreshStageReports] 組 ${currentUserGroup.groupId} 在此階段無 submission，跳過 votingData 載入`)
                } else if (!userGroupData.submissionId) {
                  console.log(`ℹ️ [refreshStageReports] 組 ${currentUserGroup.groupId} 的 userGroupData 沒有 submissionId，跳過 votingData 載入`)
                } else if (userGroupData.groupId !== currentUserGroup.groupId) {
                  console.warn('⚠️ [refreshStageReports] GroupId 不匹配，跳過載入', {
                    userGroupDataGroupId: userGroupData.groupId,
                    currentUserGroupId: currentUserGroup.groupId
                  })
                }
              }
            } else {
              console.log(`⏭️ [refreshStageReports] 組 ${currentUserGroup.groupId} 的角色 "${currentUserGroup.role}" 不是組內成員（期望 "leader" 或 "member"），跳過 votingData 載入`)
            }
          }
        }

        // 載入排名數據
        await loadStageRankings(stage as ExtendedStage, projectId)

        // ✅ 強制觸發響應式更新：用展開運算符重新賦值 groups
        // 這確保 Vue 會偵測到變化並重新渲染子組件
        if (stage.groups) {
          stage.groups = [...stage.groups]
        }

        stage.contentLoaded = true
      }

      console.log(`已刷新階段 ${stage.title} 的報告`)
    } catch (error) {
      console.error('刷新報告失敗:', error)
      handleError(error instanceof Error ? error : String(error), { action: '刷新報告' })
    } finally {
      stage.loadingReports = false
      stage.refreshing = false
    }
  }

  /**
   * 刷新階段內容（統一入口）
   * @param {Object} stage - 階段對象
   * @param {string} projectId - 專案 ID
   */
  async function refreshStageContent(stage: ExtendedStage, projectId: string) {
    if (stage.viewMode) {
      // 當前是評論模式，刷新評論
      await refreshStageComments(stage, projectId)
    } else {
      // 當前是報告模式，刷新報告
      await refreshStageReports(stage, projectId)
    }
  }

  /**
   * 批次載入所有階段的排名數據（優化版）
   * 使用 /rankings/all-stages-rankings API 一次載入所有階段的排名
   * @param {Array} stages - 階段陣列
   * @param {string} projectId - 專案 ID
   */
  async function loadAllStagesRankings(stages: ExtendedStage[], projectId: string) {
    const stageIds = stages.map(s => s.id || s.stageId).filter(Boolean)
    if (stageIds.length === 0) {
      console.log('⚠️ [loadAllStagesRankings] 沒有階段需要載入排名')
      return
    }

    console.log(`📊 [loadAllStagesRankings] 批次載入 ${stageIds.length} 個階段的排名數據`)

    // 設置所有組別的載入狀態
    stages.forEach(stage => {
      if (stage.groups && stage.groups.length > 0) {
        stage.groups.forEach((group: Group) => {
          if ((String(group.voteRank) === '-' || !group.voteRank) && (String(group.teacherRank) === '-' || !group.teacherRank)) {
            group.rankingsLoading = true
          }
        })
      }
    })

    try {
      // 使用批次 API
      const httpResponse = await (rpcClient.api.rankings as any)['all-stages-rankings'].$post({
        json: {
          projectId: projectId,
          stageIds: stageIds
        }
      })
      const response = await httpResponse.json()

      console.log(`📊 [loadAllStagesRankings] 批次排名API回應:`, response)

      if (response.success && response.data && response.data.stageRankings) {
        const allRankings = response.data.stageRankings

        // 更新每個階段的排名數據
        stages.forEach(stage => {
          const stageId = stage.id || stage.stageId
          const rankings = allRankings[stageId]

          if (rankings && stage.groups && stage.groups.length > 0) {
            stage.groups.forEach((group: Group) => {
              const groupRankings = rankings[group.groupId]
              if (groupRankings) {
                // Store complete ranking objects with metadata
                if (groupRankings.voteRank) {
                  if (typeof groupRankings.voteRank === 'object') {
                    group.voteRankData = groupRankings.voteRank
                    group.voteRank = groupRankings.voteRank.rank
                  } else {
                    group.voteRank = groupRankings.voteRank
                    group.voteRankData = null
                  }
                }
                if (groupRankings.teacherRank) {
                  if (typeof groupRankings.teacherRank === 'object') {
                    group.teacherRankData = groupRankings.teacherRank
                    group.teacherRank = groupRankings.teacherRank.rank
                  } else {
                    group.teacherRank = groupRankings.teacherRank
                    group.teacherRankData = null
                  }
                }
                if (groupRankings.proposalStats) {
                  group.proposalStats = groupRankings.proposalStats
                }
              }
              group.rankingsLoading = false
            })
          } else if (stage.groups) {
            // 沒有排名數據，清除載入狀態
            stage.groups.forEach((group: Group) => {
              group.rankingsLoading = false
            })
          }
        })

        // ✅ 強制觸發響應式更新：用展開運算符重新賦值所有階段的 groups
        stages.forEach(stage => {
          if (stage.groups) {
            stage.groups = [...stage.groups]
          }
        })

        console.log(`✅ [loadAllStagesRankings] 批次排名載入完成`)
      } else {
        console.warn(`⚠️ [loadAllStagesRankings] 批次排名API返回無效數據`)
        // 清除所有載入狀態
        stages.forEach(stage => {
          if (stage.groups) {
            stage.groups.forEach((group: Group) => {
              group.rankingsLoading = false
            })
          }
        })
      }
    } catch (error) {
      console.error(`❌ [loadAllStagesRankings] 批次載入排名失敗:`, error)
      // 清除所有載入狀態
      stages.forEach(stage => {
        if (stage.groups) {
          stage.groups.forEach((group: Group) => {
            group.rankingsLoading = false
          })
        }
      })
    }

    // 批次載入結算排名（只對 completed 階段）
    const completedStages = stages.filter(s => s.status === 'completed')
    if (completedStages.length > 0) {
      await loadAllStagesSettlementRankings(completedStages, projectId)
    }
  }

  /**
   * 批次載入所有已完成階段的結算排名
   * @param {Array} stages - 已完成的階段陣列
   * @param {string} projectId - 專案 ID
   */
  async function loadAllStagesSettlementRankings(stages: ExtendedStage[], projectId: string) {
    // 目前 settlement API 沒有批次版本，所以並行載入
    console.log(`📊 [loadAllStagesSettlementRankings] 並行載入 ${stages.length} 個已完成階段的結算排名`)

    const loadPromises = stages.map(async (stage) => {
      try {
        const httpResponse = await rpcClient.settlement['stage-rankings'].$post({
          json: {
            projectId: projectId,
            stageId: stage.id || stage.stageId
          }
        })
        const settlementResponse = await httpResponse.json()

        if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
          const settlementRankings = settlementResponse.data.rankings

          if (stage.groups && stage.groups.length > 0) {
            stage.groups.forEach((group: Group) => {
              const settlementData = settlementRankings[group.groupId]
              if (settlementData) {
                group.settlementRank = settlementData.finalRank
                group.finalSettlementRank = settlementData.finalRank
                group.earnedPoints = settlementData.allocatedPoints
              }
            })
          }
        }
      } catch (error) {
        console.error(`❌ [loadAllStagesSettlementRankings] 載入階段 ${stage.title} 結算排名失敗:`, error)
      }
    })

    await Promise.all(loadPromises)

    // ✅ 強制觸發響應式更新：用展開運算符重新賦值所有階段的 groups
    stages.forEach(stage => {
      if (stage.groups) {
        stage.groups = [...stage.groups]
      }
    })

    console.log(`✅ [loadAllStagesSettlementRankings] 結算排名載入完成`)
  }

  /**
   * 載入階段排名數據（單一階段版本，用於刷新）
   * @param {Object} stage - 階段對象
   * @param {string} projectId - 專案 ID
   */
  async function loadStageRankings(stage: ExtendedStage, projectId: string) {
    try {
      console.log(`📊 [loadStageRankings] 開始載入階段 ${stage.title} 的排名數據`)
      console.log(`📊 [loadStageRankings] stage.groups 數量:`, stage.groups?.length || 0)
      console.log(`📊 [loadStageRankings] projectId:`, projectId)

      // 設置所有組別的載入狀態
      if (stage.groups && stage.groups.length > 0) {
        stage.groups.forEach((group: Group) => {
          if ((String(group.voteRank) === '-' || !group.voteRank) && (String(group.teacherRank) === '-' || !group.teacherRank)) {
            group.rankingsLoading = true
          }
        })
      } else {
        console.warn(`⚠️ [loadStageRankings] 階段 ${stage.title} 沒有 groups 或 groups 為空`)
      }

      // Vue 3 Best Practice: rpcClient automatically handles authentication
      console.log(`📊 [loadStageRankings] 調用排名API: /rankings/stage-rankings`, {
        projectId: projectId,
        stageId: stage.id
      })

      const httpResponse = await (rpcClient.api.rankings as any)['stage-rankings'].$post({
        json: {
          projectId: projectId,
          stageId: stage.id
        }
      })
      const response = await httpResponse.json()

      console.log(`📊 [loadStageRankings] 排名API完整回應:`, response)
      console.log(`📊 [loadStageRankings] rankings 資料:`, response?.data?.rankings)

      if (response.success && response.data && response.data.rankings) {
        const rankings = response.data.rankings
        console.log(`📊 [loadStageRankings] 階段 ${stage.title} 排名數據:`, rankings)
        console.log(`📊 [loadStageRankings] rankings 的 keys:`, Object.keys(rankings))

        // 更新 stage.groups 中的排名資訊
        if (stage.groups && stage.groups.length > 0) {
          console.log(`📊 [loadStageRankings] 開始更新 ${stage.groups?.length ?? 0} 個 groups 的排名`)
          stage.groups?.forEach((group: Group, index: number) => {
            const groupRankings = rankings[group.groupId]
            console.log(`📊 [loadStageRankings] Group ${index + 1}/${stage.groups?.length ?? 0} - groupId: ${group.groupId}, 找到 rankings: ${!!groupRankings}`)
            if (groupRankings) {
              console.log(`📊 [loadStageRankings] groupRankings 內容:`, groupRankings)
              // Store complete ranking objects with metadata
              if (groupRankings.voteRank) {
                // voteRank is now an object with {rank, status, createdTime, proposerEmail, proposerDisplayName, proposalId}
                if (typeof groupRankings.voteRank === 'object') {
                  group.voteRankData = groupRankings.voteRank
                  group.voteRank = groupRankings.voteRank.rank // Backward compatibility
                } else {
                  // Fallback for old response format (just a number)
                  group.voteRank = groupRankings.voteRank
                  group.voteRankData = null
                }
              }
              if (groupRankings.teacherRank) {
                // teacherRank is now an object with {rank, createdTime, teacherEmail, teacherDisplayName, teacherRankingId}
                if (typeof groupRankings.teacherRank === 'object') {
                  group.teacherRankData = groupRankings.teacherRank
                  group.teacherRank = groupRankings.teacherRank.rank // Backward compatibility
                } else {
                  // Fallback for old response format (just a number)
                  group.teacherRank = groupRankings.teacherRank
                  group.teacherRankData = null
                }
              }

              // 新增：映射 proposalStats（教師/觀察者視圖）
              if (groupRankings.proposalStats) {
                group.proposalStats = groupRankings.proposalStats
              }

              console.log(`✅ [loadStageRankings] 組別 ${group.groupId} 排名已更新:`, {
                voteRank: group.voteRank,
                voteRankData: group.voteRankData,
                teacherRank: group.teacherRank,
                teacherRankData: group.teacherRankData,
                proposalStats: group.proposalStats
              })
            } else {
              console.log(`ℹ️ [loadStageRankings] 組別 ${group.groupId} 沒有找到 rankings 資料`)
            }

            // 完成載入，清除載入狀態
            group.rankingsLoading = false
            console.log(`🔄 [loadStageRankings] 組別 ${group.groupId} rankingsLoading 設為 false`)
          })
        }

        console.log(`✅ [loadStageRankings] 階段 ${stage.title} 排名數據載入完成`)
        console.log(`✅ [loadStageRankings] 最終 groups 狀態:`, stage.groups?.map((g: Group) => ({
          groupId: g.groupId,
          voteRank: g.voteRank,
          teacherRank: g.teacherRank,
          settlementRank: g.settlementRank,
          rankingsLoading: g.rankingsLoading
        })))
      } else {
        console.log(`⚠️ 階段 ${stage.title} 沒有排名數據:`, response)
        // 沒有數據時也要清除載入狀態
        if (stage.groups && stage.groups.length > 0) {
          stage.groups.forEach((group: Group) => {
            group.rankingsLoading = false
          })
        }
      }
    } catch (error) {
      console.error(`❌ 載入階段 ${stage.title} 排名數據失敗:`, error)
      // 錯誤時也要清除載入狀態
      if (stage.groups && stage.groups.length > 0) {
        stage.groups.forEach((group: Group) => {
          group.rankingsLoading = false
        })
      }
    }

    // 載入結算排名數據 (如果階段已結算)
    if (stage.status === 'completed') {
      try {
        console.log(`📊 [DEBUG] ===== 開始載入結算排名 =====`)
        console.log(`📊 [DEBUG] 階段狀態: ${stage.status}`)
        console.log(`📊 [DEBUG] 階段 ID: ${stage.id}`)
        console.log(`📊 [DEBUG] 階段標題: ${stage.title}`)
        console.log(`📊 [DEBUG] 當前 groups 數量: ${stage.groups?.length || 0}`)
        console.log(`📊 [DEBUG] Groups 資料:`, stage.groups?.map((g: Group) => ({ groupId: g.groupId, groupName: g.groupName })))

        console.log(`📊 [DEBUG] 調用結算排名API: /settlement/stage-rankings`)

        const httpResponse = await rpcClient.settlement['stage-rankings'].$post({
          json: {
            projectId: projectId,
            stageId: stage.id
          }
        })
        const settlementResponse = await httpResponse.json()

        console.log(`📊 [DEBUG] ===== API 回應 =====`)
        console.log(`📊 [DEBUG] API success:`, settlementResponse.success)
        console.log(`📊 [DEBUG] API data:`, settlementResponse.data)
        console.log(`📊 [DEBUG] API settled:`, settlementResponse.data?.settled)
        console.log(`📊 [DEBUG] API rankings keys:`, settlementResponse.data?.rankings ? Object.keys(settlementResponse.data.rankings) : [])
        console.log(`📊 [DEBUG] API 完整 rankings 物件:`, settlementResponse.data?.rankings)

        if (settlementResponse.success && settlementResponse.data && settlementResponse.data.settled) {
          const settlementRankings = settlementResponse.data.rankings
          console.log(`📊 [DEBUG] 階段 ${stage.title} 結算排名數據:`, settlementRankings)

          // 更新結算排名
          if (stage.groups && stage.groups.length > 0) {
            console.log(`📊 [DEBUG] ===== 開始更新 groups 排名 =====`)
            stage.groups.forEach((group: Group, index: number) => {
              console.log(`📊 [DEBUG] --- Group ${index + 1}/${stage.groups?.length ?? 0} ---`)
              console.log(`📊 [DEBUG] Group ID: ${group.groupId}`)
              console.log(`📊 [DEBUG] Group Name: ${group.groupName}`)

              const settlementData = settlementRankings[group.groupId]
              console.log(`📊 [DEBUG] 找到的 settlementData:`, settlementData)

              if (settlementData) {
                console.log(`📊 [DEBUG] 設置前 - settlementRank: ${group.settlementRank}, finalSettlementRank: ${group.finalSettlementRank}, earnedPoints: ${group.earnedPoints}`)

                // 同時設置兩個屬性以支持不同階段的顯示
                group.settlementRank = settlementData.finalRank
                group.finalSettlementRank = settlementData.finalRank
                group.earnedPoints = settlementData.allocatedPoints

                console.log(`📊 [DEBUG] 設置後 - settlementRank: ${group.settlementRank}, finalSettlementRank: ${group.finalSettlementRank}, earnedPoints: ${group.earnedPoints}`)
                console.log(`📊 [DEBUG] ✅ 成功更新組別 ${group.groupId} 結算排名: ${settlementData.finalRank}, 獲得點數: ${settlementData.allocatedPoints}`)
              } else {
                console.log(`📊 [DEBUG] ⚠️ 組別 ${group.groupId} 沒有對應的結算數據`)
              }
            })

            console.log(`📊 [DEBUG] ===== 所有 groups 最終狀態 =====`)
            stage.groups.forEach((g: Group) => {
              console.log(`📊 [DEBUG] ${g.groupName} (${g.groupId}):`, {
                settlementRank: g.settlementRank,
                finalSettlementRank: g.finalSettlementRank,
                earnedPoints: g.earnedPoints,
                hasSettlement: !!settlementRankings[g.groupId]
              })
            })
          } else {
            console.log(`📊 [DEBUG] ⚠️ 沒有 groups 資料可以更新`)
          }

          console.log(`✅ [DEBUG] 階段 ${stage.title} 結算排名數據載入完成`)
        } else {
          console.log(`⚠️ [DEBUG] 階段 ${stage.title} 尚未結算或無結算排名數據`)
          console.log(`⚠️ [DEBUG] Response structure:`, settlementResponse)
        }
      } catch (settlementError) {
        console.error(`❌ [DEBUG] 載入階段 ${stage.title} 結算排名失敗:`, settlementError)
        console.error(`❌ [DEBUG] Error details:`, getErrorMessage(settlementError))
      }
    } else {
      console.log(`📊 [DEBUG] 階段 ${stage.title} 狀態為 ${stage.status}，跳過結算排名載入`)
    }
  }

  /**
   * 載入所有階段的報告內容
   * @param {Array} stages - 階段陣列
   * @param {string} projectId - 專案 ID
   */
  async function loadAllStageReports(stages: ExtendedStage[], projectId: string) {
    console.log('開始載入所有階段的報告內容...', stages.map((s: ExtendedStage) => ({ id: s.id, title: s.title })))

    // 並行載入所有階段的報告
    const loadPromises = stages.map(async (stage: ExtendedStage) => {
      try {
        // 設置載入狀態
        stage.loadingReports = true
        console.log(`開始載入階段 ${stage.title} (ID: ${stage.id}) 的報告...`)

        const content = await loadStageContent(projectId, stage.id || stage.stageId, 'submissions')
        console.log(`階段 ${stage.title} API 響應:`, content)

        if (content && content.submissions) {
          console.log(`✅ 階段 ${stage.title} 有 submissions 資料，開始處理...`)
          stage.groups = processSubmissionsToGroups(content.submissions)

          // 只載入當前用戶所屬組的投票數據（使用響應式 computed 屬性）
          // 權限檢查：只有組內成員（leader/member）才能查詢投票數據
          console.log('🔍 [loadAllStageReports] 開始檢查是否載入 votingData')
          console.log('👥 [loadAllStageReports] currentUserGroups:', currentUserGroups.value)

          // ✅ Early return guard: 如果 currentUserGroups 為 null，表示數據尚未準備好
          if (currentUserGroups.value === null) {
            console.log('⏸️ [loadAllStageReports] currentUserGroups 尚未準備好，跳過 votingData 載入')
            // 不 return，繼續載入排名數據
          } else {
            // 遍歷當前用戶的所有組別
            for (const currentUserGroup of currentUserGroups.value) {
              console.log('🔑 [loadAllStageReports] 檢查組別:', {
                groupId: currentUserGroup.groupId,
                role: currentUserGroup.role,
                userEmail: currentUserGroup.userEmail
              })

              // ✅ 檢查角色：只有 leader 或 member 才載入 votingData
              if (currentUserGroup.role === 'leader' || currentUserGroup.role === 'member') {
                console.log('✅ [loadAllStageReports] 角色檢查通過，準備載入 votingData')

                // 檢查這個階段是否有該組的 submission
                const userGroupData = stage.groups.find((g: Group) => g.groupId === currentUserGroup.groupId)
                console.log('📋 [loadAllStageReports] userGroupData:', userGroupData)
                console.log('🔍 [loadAllStageReports] 比對 groupId - userGroupData.groupId:', userGroupData?.groupId, 'vs currentUserGroup.groupId:', currentUserGroup.groupId)

                // 必須確認這個 group 確實屬於當前用戶，且有 submission
                if (userGroupData && userGroupData.submissionId && userGroupData.groupId === currentUserGroup.groupId) {
                  console.log(`🚀 [loadAllStageReports] GroupId 驗證通過，開始載入 votingData for group ${userGroupData.groupId}`)
                  await loadGroupVotingData(projectId, stage.id, userGroupData)
                } else {
                  if (!userGroupData) {
                    console.log(`ℹ️ [loadAllStageReports] 組 ${currentUserGroup.groupId} 在此階段無 submission，跳過 votingData 載入`)
                  } else if (!userGroupData.submissionId) {
                    console.log(`ℹ️ [loadAllStageReports] 組 ${currentUserGroup.groupId} 的 userGroupData 沒有 submissionId，跳過 votingData 載入`)
                  } else if (userGroupData.groupId !== currentUserGroup.groupId) {
                    console.warn('⚠️ [loadAllStageReports] GroupId 不匹配，跳過載入', {
                      userGroupDataGroupId: userGroupData.groupId,
                      currentUserGroupId: currentUserGroup.groupId
                    })
                  }
                }
              } else {
                console.log(`⏭️ [loadAllStageReports] 組 ${currentUserGroup.groupId} 的角色 "${currentUserGroup.role}" 不是組內成員（期望 "leader" 或 "member"），跳過 votingData 載入`)
              }
            }
          }

          // 排名數據將在所有報告載入完成後批次載入
          stage.contentLoaded = true
          console.log(`✅ 階段 ${stage.title} 的報告已載入，共 ${stage.groups.length} 個群組:`, stage.groups)
        } else {
          console.log(`⚠️ 階段 ${stage.title} 沒有報告內容或沒有 submissions，API 響應:`, content)
          console.log(`⚠️ content 存在: ${!!content}, content.submissions 存在: ${!!(content && content.submissions)}`)
          stage.groups = []
          stage.contentLoaded = true
        }
      } catch (error) {
        console.error(`❌ 載入階段 ${stage.title} 報告失敗:`, error)
        console.error(`❌ 錯誤詳情:`, getErrorMessage(error))
        stage.groups = []
        stage.contentLoaded = true
      } finally {
        // 清除載入狀態
        stage.loadingReports = false
        console.log(`階段 ${stage.title} 載入狀態已清除，loadingReports: ${stage.loadingReports}`)
      }
    })

    await Promise.all(loadPromises)
    console.log('🎉 所有階段報告載入完成，最終狀態:', stages.map((s: ExtendedStage) => ({
      title: s.title,
      groupsCount: s.groups?.length || 0,
      loadingReports: s.loadingReports,
      contentLoaded: s.contentLoaded
    })))

    // 批次載入所有階段的排名數據（優化：使用單一 API 呼叫）
    console.log('🎯 [loadAllStageReports] 開始批次載入所有階段的排名數據...')
    await loadAllStagesRankings(stages, projectId)
    console.log('🎯 [loadAllStageReports] 所有階段的排名數據載入完成')
  }

  /**
   * 將提交數據轉換為前端需要的組別格式
   * @param {Array} submissions - 提交記錄陣列
   * @returns {Array} 群組陣列
   */
  function processSubmissionsToGroups(submissions: any) {
    if (!submissions || !Array.isArray(submissions)) {
      console.log('❌ processSubmissionsToGroups: 無效的 submissions 數據', submissions)
      return []
    }

    console.log('🔄 處理 submissions 數據:', submissions)

    // 按groupId分組報告（加入防禦性代碼：處理同組多次提交）
    const groupMap = new Map()

    submissions.forEach((submission, index) => {
      console.log(`🔄 處理第 ${index + 1} 個 submission:`, submission)

      // 過濾掉withdrawn狀態的提交（雙重保險）
      if (submission.status === 'withdrawn') {
        console.log(`⏭️ 跳過已撤回的 submission:`, submission.submissionId)
        return
      }

      const groupId = submission.groupId
      if (!groupId) return

      // 防禦性邏輯：如果組別不存在，或當前提交時間更新，則更新
      if (!groupMap.has(groupId)) {
        // 從專案數據中獲取群組資訊
        const groupInfo = getGroupInfo(groupId)

        const groupData = {
          id: groupId,
          groupId: groupId,
          groupName: submission.groupName || groupInfo.groupName || '未命名組別',  // ✅ 從後端獲取
          memberNames: groupInfo.memberNames || [],
          participationProposal: submission.participationProposal || {},  // ✅ 保留此字段，確保有預設值
          submissionStatus: getSubmissionStatus(submission),
          status: submission.status,  // ✅ 從 submissions_with_status VIEW 獲取的狀態
          reportContent: submission.contentMarkdown || submission.content || '',
          showReport: false,
          settlementRank: submission.settlementRank || '-',
          voteRank: submission.voteRank || '-',
          teacherRank: submission.teacherRank || '-',
          submissionId: submission.submissionId,
          submittedAt: submission.submitTime || submission.submittedAt || 0,
          submitTime: submission.submitTime || submission.submittedAt || 0,
          rankingsLoading: !submission.voteRank && !submission.teacherRank,
          votingData: null as any // Will be loaded later if user is a group member
        }

        console.log(`✅ 創建群組數據:`, groupData)
        console.log(`🔍 [useStageContentManagement] 組別 ${groupInfo.groupName || groupId} 排名數據詳情:`, {
          voteRank: submission.voteRank,
          teacherRank: submission.teacherRank,
          settlementRank: submission.settlementRank,
          原始submission數據: {
            submissionId: submission.submissionId,
            groupId: submission.groupId,
            status: submission.status
          }
        })
        console.log(`🔍 [DEBUG] 初始創建的 groupData 有 votingData 嗎？`, {
          groupId: groupData.groupId,
          hasVotingData: !!groupData.votingData,
          groupData: groupData
        })
        groupMap.set(groupId, groupData)
      } else {
        // ✅ 防禦性代碼：如果已存在，比較時間，保留最新的
        const existing = groupMap.get(groupId)
        const currentTime = submission.submitTime || submission.submittedAt || 0
        const existingTime = existing.submitTime || 0

        if (currentTime > existingTime) {
          console.log(`🔄 更新群組 ${groupId} 為更新的提交（${currentTime} > ${existingTime}）`)
          const groupInfo = getGroupInfo(groupId)

          const groupData = {
            id: groupId,
            groupId: groupId,
            groupName: submission.groupName || groupInfo.groupName || '未命名組別',
            memberNames: groupInfo.memberNames || [],
            participationProposal: submission.participationProposal || {},
            submissionStatus: getSubmissionStatus(submission),
            status: submission.status,  // ✅ 從 submissions_with_status VIEW 獲取的狀態
            reportContent: submission.contentMarkdown || submission.content || '',
            showReport: false,
            settlementRank: submission.settlementRank || '-',
            voteRank: submission.voteRank || '-',
            teacherRank: submission.teacherRank || '-',
            submissionId: submission.submissionId,
            submittedAt: currentTime,
            submitTime: currentTime,
            rankingsLoading: !submission.voteRank && !submission.teacherRank
          }

          groupMap.set(groupId, groupData)
        }
      }
    })

    const result = Array.from(groupMap.values())
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))

    console.log('✅ processSubmissionsToGroups 結果:', result)
    return result
  }

  /**
   * 從專案數據中獲取群組資訊
   * @param {string} groupId - 群組 ID
   * @returns {Object} 群組信息
   */
  function getGroupInfo(groupId: string) {
    if (!projectData.value || !projectData.value.groups || !projectData.value.userGroups) {
      console.warn('⚠️ getGroupInfo: 缺少專案數據', { projectData: projectData.value })
      return { memberNames: [] }
    }

    // 找到群組資訊
    const group = projectData.value.groups.find((g: Group) => g.groupId === groupId)
    if (!group) {
      console.warn('⚠️ getGroupInfo: 找不到群組', {
        groupId,
        availableGroups: projectData.value.groups.map((g: Group) => g.groupId)
      })
      return { memberNames: [] }
    }

    // 找到群組成員
    const members = projectData.value.userGroups
      .filter((ug: any) => ug.groupId === groupId && ug.isActive)
      .map((ug: any) => {
        // 從 users 資料中找到對應的使用者，取得 displayName
        const user = projectData.value.users?.find((u: any) => u.userEmail === ug.userEmail)
        return user?.displayName || ug.userEmail.split('@')[0]
      })

    console.log(`ℹ️ 群組 ${groupId} 成員:`, members)

    return {
      memberNames: members,
      groupName: group.groupName || group.name
    }
  }

  /**
   * 判斷提交狀態
   * @param {Object} submission - 提交記錄
   * @returns {Object} 狀態對象
   */
  function getSubmissionStatus(submission: Submission) {
    const submittedTime = submission.submitTime || submission.submissionTime
    if (!submittedTime) {
      return { type: 'not-submitted', text: '未提交' }
    }

    const submittedDate = new Date(submittedTime)
    const deadline = new Date(submission.deadline || Date.now())

    if (submittedDate <= deadline) {
      const timeDiff = deadline.getTime() - submittedDate.getTime()
      const hoursDiff = timeDiff / (1000 * 60 * 60)

      if (hoursDiff > 24) {
        return { type: 'early', text: '提前提交' }
      } else {
        return { type: 'on-time', text: '準時提交' }
      }
    } else {
      return { type: 'late', text: '遲交' }
    }
  }

  /**
   * 處理階段數據，為前端添加必要的字段
   * @param {Array} stages - 原始階段陣列
   * @returns {Array} 處理後的階段陣列
   */
  function processStagesData(stages: Stage[]): ExtendedStage[] {
    return stages
      .filter((stage: Stage) => stage.status !== 'archived') // 過濾已歸檔階段
      .map((stage: Stage): ExtendedStage => {
        const reportRewardValue = (stage as any).reportRewardPool ?? (stage as any).reportReward ?? 0
        const commentRewardValue = (stage as any).commentRewardPool ?? (stage as any).commentReward ?? 0

        const processedStage: ExtendedStage = {
          ...stage,
          id: stage.stageId,
          title: stage.stageName || (stage as any).stageTitle || (stage as any).title || '',
          description: stage.description || '',
          reportReward: reportRewardValue,
          commentReward: commentRewardValue,
          deadline: stage.endTime ?? (stage as any).deadline,
          startTime: stage.startTime,
          endTime: stage.endTime,
          settledTime: stage.settledTime,
          status: stage.status, // 使用後端提供的狀態值
          viewMode: false, // false = 查看報告, true = 查看評論
          groups: [], // 將按需載入
          contentLoaded: false,
          showFullDescription: false, // 控制是否顯示完整描述
          // 新增載入狀態
          loadingReports: false,
          loadingComments: false,
          refreshing: false,
          commentsRefreshKey: 0 // 用於強制 StageComments 組件重新掛載
        }
        return processedStage
      })
  }

  return {
    // 主要函數
    loadStageContent,
    refreshStageComments,
    refreshStageReports,
    refreshStageContent,
    loadAllStageReports,
    loadAllStagesRankings, // 批次載入排名 API

    // 輔助函數
    processSubmissionsToGroups,
    processStagesData,
    getSubmissionStatus
  }
}
