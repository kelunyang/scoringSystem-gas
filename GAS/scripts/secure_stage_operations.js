/**
 * @fileoverview Secure stage operation wrappers
 * 這個文件包含安全的階段操作包裝器，確保前後端狀態判斷一致
 * @module SecureStageOperations
 */

/**
 * 安全的投票提交 - 替換原有的 submitRankingVote
 */
function secureSubmitRankingVote(sessionId, projectId, stageId, rankings) {
  try {
    // 使用安全的階段驗證
    const validation = secureStageValidation(sessionId, projectId, stageId, 'voting', 'submit_ranking_vote');
    if (!validation.valid) {
      return createErrorResponse('VALIDATION_FAILED', validation.error);
    }
    
    const { stage, user } = validation;
    
    // Check if user has permission to vote
    const projectData = readProjectData(projectId);
    const isGlobalPMUser = isGlobalPM(user.userEmail);
    
    if (!isGlobalPMUser) {
      const userPermissions = getUserPermissions(
        user.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!userPermissions.includes('vote')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to vote');
      }
    }
    
    // 記錄安全事件
    Logger.info('Secure voting operation', {
      operation: 'submit_ranking_vote',
      stageId: stageId,
      calculatedStatus: validation.calculatedStatus,
      userEmail: user.userEmail,
      timestamp: new Date().toISOString()
    });
    
    // 繼續原有的投票邏輯...
    return submitRankingVote_Internal(user, projectData, stage, rankings);
    
  } catch (error) {
    Logger.error('Secure voting operation failed', {
      operation: 'submit_ranking_vote',
      stageId: stageId,
      error: error.message
    });
    return createErrorResponse('OPERATION_FAILED', 'Voting operation failed');
  }
}

/**
 * 安全的報告提交 - 需要 'active' 狀態
 */
function secureSubmitDeliverable(sessionId, projectId, stageId, submissionData) {
  try {
    // 使用安全的階段驗證
    const validation = secureStageValidation(sessionId, projectId, stageId, 'active', 'submit_deliverable');
    if (!validation.valid) {
      return createErrorResponse('VALIDATION_FAILED', validation.error);
    }
    
    const { stage, user } = validation;
    
    // 檢查提交權限
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(user.userEmail, projectData.projectgroups, projectData.usergroups);
    if (!permissions.includes('submit')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to submit');
    }
    
    // 記錄安全事件
    Logger.info('Secure submission operation', {
      operation: 'submit_deliverable',
      stageId: stageId,
      calculatedStatus: validation.calculatedStatus,
      userEmail: user.userEmail,
      timestamp: new Date().toISOString()
    });
    
    // 繼續原有的提交邏輯...
    return submitDeliverable_Internal(user, projectData, stage, submissionData);
    
  } catch (error) {
    Logger.error('Secure submission operation failed', {
      operation: 'submit_deliverable',
      stageId: stageId,
      error: error.message
    });
    return createErrorResponse('OPERATION_FAILED', 'Submission operation failed');
  }
}

/**
 * 安全的評論提交 - 需要 'active' 狀態
 */
function secureSubmitComment(sessionId, projectId, stageId, commentData) {
  try {
    // 使用安全的階段驗證
    const validation = secureStageValidation(sessionId, projectId, stageId, 'active', 'submit_comment');
    if (!validation.valid) {
      return createErrorResponse('VALIDATION_FAILED', validation.error);
    }
    
    const { stage, user } = validation;
    
    // 記錄安全事件
    Logger.info('Secure comment operation', {
      operation: 'submit_comment',
      stageId: stageId,
      calculatedStatus: validation.calculatedStatus,
      userEmail: user.userEmail,
      timestamp: new Date().toISOString()
    });
    
    // 繼續原有的評論邏輯...
    return submitComment_Internal(user, projectData, stage, commentData);
    
  } catch (error) {
    Logger.error('Secure comment operation failed', {
      operation: 'submit_comment',
      stageId: stageId,
      error: error.message
    });
    return createErrorResponse('OPERATION_FAILED', 'Comment operation failed');
  }
}

/**
 * 獲取階段數據時自動計算並返回狀態
 */
function getStageWithCalculatedStatus(projectId, stageId) {
  try {
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return null;
    }
    
    const calculatedStatus = calculateStageStatus(stage);
    
    return {
      ...stage,
      calculatedStatus: calculatedStatus,
      statusConsistent: calculatedStatus === stage.status
    };
    
  } catch (error) {
    Logger.error('Failed to get stage with calculated status', {
      projectId: projectId,
      stageId: stageId,
      error: error.message
    });
    return null;
  }
}

/**
 * 批量檢查並修復狀態不一致的問題
 */
function auditAndFixStageStatuses(projectId) {
  try {
    const projectData = readProjectData(projectId);
    if (!projectData || !projectData.stages) {
      return { success: false, error: 'Project or stages not found' };
    }
    
    const issues = [];
    const fixes = [];
    
    projectData.stages.forEach(stage => {
      const calculatedStatus = calculateStageStatus(stage);
      const storedStatus = stage.status;
      
      if (calculatedStatus !== storedStatus) {
        issues.push({
          stageId: stage.stageId,
          stageName: stage.stageName,
          stored: storedStatus,
          calculated: calculatedStatus,
          startDate: stage.startDate,
          endDate: stage.endDate
        });
        
        // 自動修復 (可選)
        stage.status = calculatedStatus;
        fixes.push({
          stageId: stage.stageId,
          oldStatus: storedStatus,
          newStatus: calculatedStatus
        });
      }
    });
    
    if (fixes.length > 0) {
      writeProjectData(projectId, projectData);
      
      Logger.warn('Stage status inconsistencies detected and fixed', {
        projectId: projectId,
        issuesCount: issues.length,
        issues: issues,
        fixes: fixes
      });
    }
    
    return {
      success: true,
      issuesFound: issues.length,
      issues: issues,
      fixesApplied: fixes.length,
      fixes: fixes
    };
    
  } catch (error) {
    Logger.error('Stage status audit failed', {
      projectId: projectId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * 定期檢查系統中所有專案的階段狀態一致性
 */
function systemWideStageAudit() {
  try {
    const allProjects = getAllProjectIds(); // 需要實現此函數
    const auditResults = [];
    
    allProjects.forEach(projectId => {
      const result = auditAndFixStageStatuses(projectId);
      if (result.issuesFound > 0) {
        auditResults.push({
          projectId: projectId,
          ...result
        });
      }
    });
    
    if (auditResults.length > 0) {
      Logger.warn('System-wide stage status audit completed', {
        projectsWithIssues: auditResults.length,
        totalIssues: auditResults.reduce((sum, r) => sum + r.issuesFound, 0),
        results: auditResults
      });
    }
    
    return {
      success: true,
      projectsAudited: allProjects.length,
      projectsWithIssues: auditResults.length,
      results: auditResults
    };
    
  } catch (error) {
    Logger.error('System-wide stage audit failed', {
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * 將原有的不安全函數標記為廢棄
 */
function submitRankingVote_DEPRECATED(sessionId, projectId, stageId, rankings) {
  Logger.warn('SECURITY WARNING: Using deprecated submitRankingVote function', {
    operation: 'submitRankingVote_DEPRECATED',
    stageId: stageId,
    message: 'Please migrate to secureSubmitRankingVote'
  });
  
  return secureSubmitRankingVote(sessionId, projectId, stageId, rankings);
}