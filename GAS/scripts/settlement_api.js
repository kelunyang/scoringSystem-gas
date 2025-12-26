/**
 * @fileoverview Settlement management API endpoints
 * @module SettlementAPI
 */

/**
 * Reverse a settlement (撤銷結算)
 * Creates reverse transactions for all transactions in the settlement
 */
function reverseSettlement(sessionId, projectId, settlementId, reason) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check permissions (must be Global PM or Project PM)
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    if (!permissions.includes('manage') && !isGlobalPM(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to reverse settlements');
    }
    
    // Validate input
    if (!settlementId || !reason) {
      return createErrorResponse('INVALID_INPUT', 'Settlement ID and reason are required');
    }
    
    // Check if settlement exists and is active
    const settlementHistory = projectData.settlementhistory || [];
    const settlement = settlementHistory.find(s => s.settlementId === settlementId);
    
    if (!settlement) {
      return createErrorResponse('SETTLEMENT_NOT_FOUND', 'Settlement not found');
    }
    
    if (settlement.status === 'reversed') {
      return createErrorResponse('ALREADY_REVERSED', 'Settlement has already been reversed');
    }
    
    // Get all transactions for this settlement
    const transactions = projectData.transactions || [];
    const settlementTransactions = transactions.filter(t => t.settlementId === settlementId);
    
    if (settlementTransactions.length === 0) {
      return createErrorResponse('NO_TRANSACTIONS', 'No transactions found for this settlement');
    }
    
    const reversalTime = getCurrentTimestamp();
    const reversalId = generateIdWithType('reversal');
    
    // Create reverse transactions for each original transaction
    const reversalTransactions = [];
    settlementTransactions.forEach(originalTx => {
      const reversalTransaction = {
        transactionId: generateIdWithType('transaction'),
        userEmail: originalTx.userEmail,
        stageId: originalTx.stageId,
        settlementId: reversalId, // Use new reversal ID
        transactionType: 'settlement_reversal',
        amount: -originalTx.amount, // Negative amount to reverse
        source: `撤銷結算: ${originalTx.source} (原因: ${reason})`,
        timestamp: reversalTime,
        relatedSubmissionId: originalTx.relatedSubmissionId,
        relatedCommentId: originalTx.relatedCommentId,
        metadata: safeJsonStringify({ 
          reversedTransactionId: originalTx.transactionId,
          originalSettlementId: settlementId,
          reversedBy: sessionResult.userEmail,
          reason: reason
        })
      };
      
      reversalTransactions.push(reversalTransaction);
      addRowToSheet(projectId, 'Transactions', reversalTransaction);
    });
    
    // Update original settlement status
    updateSheetRow(projectId, 'SettlementHistory', 'settlementId', settlementId, {
      status: 'reversed',
      reversedTime: reversalTime,
      reversedBy: sessionResult.userEmail,
      reversedReason: reason
    });
    
    // Create reversal settlement record
    const reversalSettlement = {
      settlementId: reversalId,
      stageId: settlement.stageId,
      settlementType: 'reversal',
      settlementTime: reversalTime,
      operatorEmail: sessionResult.userEmail,
      totalRewardDistributed: -settlement.totalRewardDistributed,
      participantCount: settlement.participantCount,
      status: 'active',
      reversedTime: null,
      reversedBy: null,
      reversedReason: null,
      settlementData: safeJsonStringify({
        originalSettlementId: settlementId,
        reason: reason,
        reversedTransactions: reversalTransactions.length
      })
    };
    
    addRowToSheet(projectId, 'SettlementHistory', reversalSettlement);
    
    // Update stage status back to 'voting' if it was a stage settlement
    if (settlement.settlementType === 'stage') {
      updateSheetRow(projectId, 'Stages', 'stageId', settlement.stageId, {
        status: 'voting',
        settledTime: null,
        finalRankings: null,
        scoringResults: null
      });
    }
    
    logInfo('Settlement reversal', `Settlement ${settlementId} reversed by ${sessionResult.userEmail}`, {
      projectId: projectId,
      settlementId: settlementId,
      reversalId: reversalId,
      reason: reason,
      transactionsReversed: reversalTransactions.length
    });
    
    return createSuccessResponse({
      reversalId: reversalId,
      originalSettlementId: settlementId,
      transactionsReversed: reversalTransactions.length,
      totalAmountReversed: Math.abs(settlement.totalRewardDistributed),
      reversalTime: reversalTime
    });
    
  } catch (error) {
    logError('Reverse settlement error', error.message, {
      projectId: projectId,
      settlementId: settlementId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to reverse settlement: ' + error.message);
  }
}

/**
 * Get settlement history for a project
 */
function getSettlementHistory(sessionId, projectId, filters = {}) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is Global PM (only Global PMs can view settlement history)
    if (!isGlobalPM(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only Global PM can view settlement history');
    }
    
    const projectData = readProjectData(projectId);
    let settlements = projectData.settlementhistory || [];
    
    // Apply filters
    if (filters.stageId) {
      settlements = settlements.filter(s => s.stageId === filters.stageId);
    }
    
    if (filters.settlementType) {
      settlements = settlements.filter(s => s.settlementType === filters.settlementType);
    }
    
    if (filters.status) {
      settlements = settlements.filter(s => s.status === filters.status);
    }
    
    // Sort by settlement time (newest first)
    settlements.sort((a, b) => new Date(b.settlementTime) - new Date(a.settlementTime));
    
    return createSuccessResponse({
      settlements: settlements,
      totalCount: settlements.length
    });
    
  } catch (error) {
    logError('Get settlement history error', error.message, {
      projectId: projectId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to get settlement history: ' + error.message);
  }
}

/**
 * Get detailed settlement information
 */
function getSettlementDetails(sessionId, projectId, settlementId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    if (!permissions.includes('view')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view settlement details');
    }
    
    // Get settlement
    const settlementHistory = projectData.settlementhistory || [];
    const settlement = settlementHistory.find(s => s.settlementId === settlementId);
    
    if (!settlement) {
      return createErrorResponse('SETTLEMENT_NOT_FOUND', 'Settlement not found');
    }
    
    // Get related transactions
    const transactions = projectData.transactions || [];
    const settlementTransactions = transactions.filter(t => t.settlementId === settlementId);
    
    // Get stage/comment settlement details
    let settlementDetails = null;
    if (settlement.settlementType === 'stage') {
      const stageSettlements = projectData.stagesettlements || [];
      settlementDetails = stageSettlements.filter(s => s.settlementId === settlementId);
    } else if (settlement.settlementType === 'comment') {
      const commentSettlements = projectData.commentsettlements || [];
      settlementDetails = commentSettlements.filter(s => s.settlementId === settlementId);
    }
    
    return createSuccessResponse({
      settlement: settlement,
      transactions: settlementTransactions,
      details: settlementDetails || [],
      summary: {
        transactionCount: settlementTransactions.length,
        totalAmount: settlementTransactions.reduce((sum, t) => sum + t.amount, 0),
        participantEmails: [...new Set(settlementTransactions.map(t => t.userEmail))]
      }
    });
    
  } catch (error) {
    logError('Get settlement details error', error.message, {
      projectId: projectId,
      settlementId: settlementId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to get settlement details: ' + error.message);
  }
}

/**
 * Get transactions by settlement ID (for analysis)
 */
function getSettlementTransactions(sessionId, projectId, settlementId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    if (!permissions.includes('view')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view transactions');
    }
    
    // Get transactions for this settlement
    const transactions = projectData.transactions || [];
    const settlementTransactions = transactions.filter(t => t.settlementId === settlementId);
    
    return createSuccessResponse({
      transactions: settlementTransactions,
      totalCount: settlementTransactions.length,
      totalAmount: settlementTransactions.reduce((sum, t) => sum + t.amount, 0)
    });
    
  } catch (error) {
    logError('Get settlement transactions error', error.message, {
      projectId: projectId,
      settlementId: settlementId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to get settlement transactions: ' + error.message);
  }
}

/**
 * Get stage settlement rankings for a specific stage
 */
function getStageSettlementRankings(sessionId, projectId, stageId) {
  try {
    logInfo('getStageSettlementRankings called', {
      sessionId: sessionId,
      projectId: projectId,
      stageId: stageId
    });
    
    // Use unified project access validation (same as getStageRankings)
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      logError('getStageSettlementRankings: Project access validation failed', {
        errorCode: accessResult.errorCode,
        error: accessResult.error
      });
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;
    
    logInfo('getStageSettlementRankings: Project access validated', {
      userEmail: sessionResult.userEmail
    });
    
    // Get stage settlements for this stage
    const stageSettlements = projectData.stagesettlements || [];
    const settlements = stageSettlements.filter(s => s.stageId === stageId);
    
    // Check if stage is settled
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage || stage.status !== 'completed') {
      return createSuccessResponse({
        settled: false,
        rankings: [],
        message: 'Stage not yet settled'
      });
    }
    
    // Create ranking map: groupId -> finalRank
    const rankingMap = {};
    settlements.forEach(settlement => {
      rankingMap[settlement.groupId] = {
        groupId: settlement.groupId,
        finalRank: settlement.finalRank,
        allocatedPoints: settlement.allocatedPoints,
        memberEmails: settlement.memberEmails ? JSON.parse(settlement.memberEmails) : [],
        memberPointsDistribution: settlement.memberPointsDistribution ? JSON.parse(settlement.memberPointsDistribution) : []
      };
    });
    
    return createSuccessResponse({
      settled: true,
      rankings: rankingMap,
      stageId: stageId,
      settlementCount: settlements.length
    });
    
  } catch (error) {
    logError('Get stage settlement rankings error', error.message, {
      projectId: projectId,
      stageId: stageId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to get stage settlement rankings: ' + error.message);
  }
}

/**
 * Get comment settlement rankings for a specific stage
 */
function getCommentSettlementRankings(sessionId, projectId, stageId) {
  try {
    logInfo('getCommentSettlementRankings called', {
      sessionId: sessionId,
      projectId: projectId,
      stageId: stageId
    });
    
    // Use unified project access validation (same as getStageRankings)
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      logError('getCommentSettlementRankings: Project access validation failed', {
        errorCode: accessResult.errorCode,
        error: accessResult.error
      });
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;
    
    logInfo('getCommentSettlementRankings: Project access validated', {
      userEmail: sessionResult.userEmail
    });
    
    // Get comment settlements for this stage
    const commentSettlements = projectData.commentsettlements || [];
    const settlements = commentSettlements.filter(s => s.stageId === stageId);
    
    // Check if stage is settled
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage || stage.status !== 'completed') {
      return createSuccessResponse({
        settled: false,
        rankings: {},
        message: 'Stage not yet settled'
      });
    }
    
    // Create ranking map: commentId -> finalRank
    const rankingMap = {};
    settlements.forEach(settlement => {
      rankingMap[settlement.commentId] = {
        commentId: settlement.commentId,
        authorEmail: settlement.authorEmail,
        finalRank: settlement.finalRank,
        allocatedPoints: settlement.allocatedPoints,
        studentScore: settlement.studentScore,
        teacherScore: settlement.teacherScore,
        totalScore: settlement.totalScore,
        rewardPercentage: settlement.rewardPercentage
      };
    });
    
    return createSuccessResponse({
      settled: true,
      rankings: rankingMap,
      stageId: stageId,
      settlementCount: settlements.length
    });
    
  } catch (error) {
    logError('Get comment settlement rankings error', error.message, {
      projectId: projectId,
      stageId: stageId,
      sessionId: sessionId
    });
    
    return createErrorResponse('INTERNAL_ERROR', 'Failed to get comment settlement rankings: ' + error.message);
  }
}