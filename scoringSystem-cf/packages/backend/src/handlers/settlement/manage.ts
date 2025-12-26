/**
 * Settlement Management Handlers
 * Migrated from GAS scripts/settlement_api.js
 */

import type { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { checkProjectPermission } from '../../middleware/permissions';

/**
 * Reverse a settlement
 * Creates reverse transactions for all transactions in the settlement
 */
export async function reverseSettlement(
  env: Env,
  userEmail: string,
  projectId: string,
  settlementId: string,
  reason: string
): Promise<Response> {
  try {
    // Check if user has manage permissions (must be Global PM or Project Teacher)
    const { canManageSettlements } = await import('@utils/permissions');
    const hasPermission = await canManageSettlements(env.DB, userEmail, projectId);

    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to reverse settlements');
    }

    // Check if settlement exists and is active
    const settlement = await env.DB.prepare(`
      SELECT * FROM settlementhistory WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).first();

    if (!settlement) {
      return errorResponse('SETTLEMENT_NOT_FOUND', 'Settlement not found');
    }

    if (settlement.status === 'reversed') {
      return errorResponse('ALREADY_REVERSED', 'Settlement has already been reversed');
    }

    // Get all transactions for this settlement
    const transactionsResult = await env.DB.prepare(`
      SELECT * FROM transactions WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).all();

    const settlementTransactions = transactionsResult.results || [];

    if (settlementTransactions.length === 0) {
      return errorResponse('NO_TRANSACTIONS', 'No transactions found for this settlement');
    }

    const reversalTime = Date.now();
    const reversalId = generateId('reversal_');

    // Prepare reversal transactions (don't insert yet - will use batch)
    const reversalTransactions = [];
    const transactionStatements = [];

    for (const originalTx of settlementTransactions) {
      const reversalTransaction = {
        transactionId: generateId('txn'),
        projectId: projectId,
        userEmail: originalTx.userEmail,
        stageId: originalTx.stageId,
        settlementId: reversalId,
        transactionType: 'settlement_reversal',
        amount: -Number(originalTx.amount),
        source: `撤銷結算: ${originalTx.source} (原因: ${reason})`,
        timestamp: reversalTime,
        relatedSubmissionId: originalTx.relatedSubmissionId || null,
        relatedCommentId: originalTx.relatedCommentId || null,
        metadata: JSON.stringify({
          reversedTransactionId: originalTx.transactionId,
          originalSettlementId: settlementId,
          reversedBy: userEmail,
          reason: reason
        })
      };

      transactionStatements.push(
        env.DB.prepare(`
          INSERT INTO transactions (
            transactionId, projectId, userEmail, stageId, settlementId,
            transactionType, amount, source, timestamp, relatedSubmissionId,
            relatedCommentId, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          reversalTransaction.transactionId,
          reversalTransaction.projectId,
          reversalTransaction.userEmail,
          reversalTransaction.stageId,
          reversalTransaction.settlementId,
          reversalTransaction.transactionType,
          reversalTransaction.amount,
          reversalTransaction.source,
          reversalTransaction.timestamp,
          reversalTransaction.relatedSubmissionId,
          reversalTransaction.relatedCommentId,
          reversalTransaction.metadata
        )
      );

      reversalTransactions.push(reversalTransaction);
    }

    // Prepare settlement update statement with CAS
    const updateSettlementStmt = env.DB.prepare(`
      UPDATE settlementhistory
      SET status = 'reversed',
          reversedTime = ?,
          reversedBy = ?,
          reversedReason = ?
      WHERE settlementId = ? AND projectId = ? AND status = 'active'
    `).bind(reversalTime, userEmail, reason, settlementId, projectId);

    // Prepare reversal settlement record
    const reversalSettlement = {
      settlementId: reversalId,
      projectId: projectId,
      stageId: settlement.stageId,
      settlementType: 'reversal',
      settlementTime: reversalTime,
      operatorEmail: userEmail,
      totalRewardDistributed: -Number(settlement.totalRewardDistributed),
      participantCount: settlement.participantCount,
      status: 'active',
      reversedTime: null,
      reversedBy: null,
      reversedReason: null,
      settlementData: JSON.stringify({
        originalSettlementId: settlementId,
        reason: reason,
        reversedTransactions: reversalTransactions.length
      })
    };

    const insertReversalStmt = env.DB.prepare(`
      INSERT INTO settlementhistory (
        settlementId, projectId, stageId, settlementType, settlementTime,
        operatorEmail, totalRewardDistributed, participantCount, status,
        reversedTime, reversedBy, reversedReason, settlementData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reversalSettlement.settlementId,
      reversalSettlement.projectId,
      reversalSettlement.stageId,
      reversalSettlement.settlementType,
      reversalSettlement.settlementTime,
      reversalSettlement.operatorEmail,
      reversalSettlement.totalRewardDistributed,
      reversalSettlement.participantCount,
      reversalSettlement.status,
      reversalSettlement.reversedTime,
      reversalSettlement.reversedBy,
      reversalSettlement.reversedReason,
      reversalSettlement.settlementData
    );

    // Prepare stage status update if needed
    // Clear settlement timestamps to revert status (timestamp-driven architecture)
    let stageUpdateStmt = null;
    if (settlement.settlementType === 'stage') {
      stageUpdateStmt = env.DB.prepare(`
        UPDATE stages
        SET settlingTime = NULL,
            settledTime = NULL,
            finalRankings = NULL,
            scoringResults = NULL,
            updatedAt = ?
        WHERE stageId = ? AND projectId = ?
      `).bind(Date.now(), settlement.stageId, projectId);
    }

    // Execute all statements as atomic batch
    const batchStatements = [
      updateSettlementStmt,
      insertReversalStmt,
      ...transactionStatements
    ];

    if (stageUpdateStmt) {
      batchStatements.push(stageUpdateStmt);
    }

    const results = await env.DB.batch(batchStatements);

    // Check if settlement update succeeded (CAS check)
    if (results[0].meta.changes === 0) {
      return errorResponse('ALREADY_REVERSED', 'Settlement was already reversed or modified concurrently');
    }

    // Check if stage update succeeded (if applicable)
    if (stageUpdateStmt && results[results.length - 1].meta.changes === 0) {
      // Note: This shouldn't fail if stageId/projectId are correct, but log it anyway
      console.error('[Settlement Reversal] Stage timestamp reset failed - stage may not exist');
    }

    // Log the settlement reversal operation
    const { logProjectOperation } = await import('@utils/logging');

    // Get stage name for better logging
    const stage = await env.DB.prepare(`
      SELECT stageName FROM stages WHERE stageId = ? AND projectId = ?
    `).bind(settlement.stageId, projectId).first();

    await logProjectOperation(
      env,
      userEmail,
      projectId,
      'settlement_reversed',
      'settlement',
      settlementId,
      {
        reversalId,
        transactionsReversed: reversalTransactions.length,
        totalAmountReversed: Math.abs(Number(settlement.totalRewardDistributed)),
        reason,
        originalSettlementType: settlement.settlementType,
        stageId: settlement.stageId,
        stageName: stage?.stageName || 'Unknown Stage'
      },
      {
        level: 'warning',  // Use warning level for destructive operations
        relatedEntities: {
          reversal: reversalId,
          stage: settlement.stageId as string
        }
      }
    );

    return successResponse({
      reversalId: reversalId,
      originalSettlementId: settlementId,
      transactionsReversed: reversalTransactions.length,
      totalAmountReversed: Math.abs(Number(settlement.totalRewardDistributed)),
      reversalTime: reversalTime
    });

  } catch (error) {
    console.error('Reverse settlement error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to reverse settlement: ${message}`);
  }
}

/**
 * Get reverse settlement preview
 * Shows detailed information about what will be reversed
 */
export async function getReversePreview(
  env: Env,
  userEmail: string,
  projectId: string,
  settlementId: string
): Promise<Response> {
  try {
    // Check if user has manage permissions (must be Global PM or Project Teacher)
    const { canManageSettlements } = await import('@utils/permissions');
    const hasPermission = await canManageSettlements(env.DB, userEmail, projectId);

    if (!hasPermission) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view reverse preview');
    }

    // Check if settlement exists
    const settlement = await env.DB.prepare(`
      SELECT * FROM settlementhistory WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).first();

    if (!settlement) {
      return errorResponse('SETTLEMENT_NOT_FOUND', 'Settlement not found');
    }

    if (settlement.status === 'reversed') {
      return errorResponse('ALREADY_REVERSED', 'Settlement has already been reversed');
    }

    // Get all transactions for this settlement
    const transactionsResult = await env.DB.prepare(`
      SELECT t.*, u.displayName
      FROM transactions t
      LEFT JOIN users u ON t.userEmail = u.userEmail
      WHERE t.settlementId = ? AND t.projectId = ?
      ORDER BY t.timestamp DESC
    `).bind(settlementId, projectId).all();

    const transactions = transactionsResult.results || [];

    if (transactions.length === 0) {
      return errorResponse('NO_TRANSACTIONS', 'No transactions found for this settlement');
    }

    // Calculate statistics
    const uniqueUsers = new Map();
    let totalAmount = 0;

    transactions.forEach((tx: any) => {
      const userEmail = tx.userEmail;
      const amount = Number(tx.amount);
      totalAmount += amount;

      if (!uniqueUsers.has(userEmail)) {
        uniqueUsers.set(userEmail, {
          userEmail: userEmail,
          displayName: tx.displayName || userEmail,
          transactionCount: 0,
          totalAmount: 0
        });
      }

      const userData = uniqueUsers.get(userEmail);
      userData.transactionCount += 1;
      userData.totalAmount += amount;
    });

    // Convert map to array
    const participantsList = Array.from(uniqueUsers.values());

    // Get stage info
    const stage = await env.DB.prepare(`
      SELECT stageName FROM stages WHERE stageId = ? AND projectId = ?
    `).bind(settlement.stageId, projectId).first();

    return successResponse({
      settlementId: settlementId,
      stageName: stage?.stageName || 'Unknown Stage',
      settlementType: settlement.settlementType,
      settlementTime: settlement.settlementTime,
      totalReward: Math.abs(totalAmount),
      transactionCount: transactions.length,
      uniqueUserCount: uniqueUsers.size,
      participants: participantsList,
      status: settlement.status
    });

  } catch (error) {
    console.error('Get reverse preview error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get reverse preview: ${message}`);
  }
}

/**
 * Get settlement history for a project
 */
export async function getSettlementHistory(
  env: Env,
  userEmail: string,
  projectId: string,
  filters: {
    stageId?: string;
    settlementType?: string;
    status?: string;
  } = {}
): Promise<Response> {
  try {
    // Check if user is Global PM (only Global PMs can view settlement history)
    const globalPMCheck = await env.DB.prepare(`
      SELECT gu.globalUserGroupId
      FROM globalusergroups gu
      JOIN globalgroups g ON gu.globalGroupId = g.globalGroupId
      WHERE gu.userEmail = ? AND g.globalPermissions LIKE '%create_project%'
    `).bind(userEmail).first();

    if (!globalPMCheck) {
      return errorResponse('ACCESS_DENIED', 'Only Global PM can view settlement history');
    }

    // Build query with filters
    let query = 'SELECT * FROM settlementhistory WHERE projectId = ?';
    const params = [projectId];

    if (filters.stageId) {
      query += ' AND stageId = ?';
      params.push(filters.stageId);
    }

    if (filters.settlementType) {
      query += ' AND settlementType = ?';
      params.push(filters.settlementType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY settlementTime DESC';

    const result = await env.DB.prepare(query).bind(...params).all();
    const settlements = result.results || [];

    return successResponse({
      settlements: settlements,
      totalCount: settlements.length
    });

  } catch (error) {
    console.error('Get settlement history error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get settlement history: ${message}`);
  }
}

/**
 * Get detailed settlement information
 */
export async function getSettlementDetails(
  env: Env,
  userEmail: string,
  projectId: string,
  settlementId: string
): Promise<Response> {
  try {
    // Check project access
    const projectAccess = await env.DB.prepare(`
      SELECT ug.membershipId
      FROM usergroups ug
      WHERE ug.userEmail = ? AND ug.projectId = ? AND ug.isActive = 1
    `).bind(userEmail, projectId).first();

    if (!projectAccess) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view settlement details');
    }

    // Get settlement
    const settlement = await env.DB.prepare(`
      SELECT * FROM settlementhistory WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).first();

    if (!settlement) {
      return errorResponse('SETTLEMENT_NOT_FOUND', 'Settlement not found');
    }

    // Get related transactions
    const transactionsResult = await env.DB.prepare(`
      SELECT * FROM transactions WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).all();

    const settlementTransactions = transactionsResult.results || [];

    // Get stage/comment settlement details
    let settlementDetails: any[] = [];
    if (settlement.settlementType === 'stage') {
      const stageSettlementsResult = await env.DB.prepare(`
        SELECT * FROM stagesettlements WHERE settlementId = ? AND projectId = ?
      `).bind(settlementId, projectId).all();
      settlementDetails = stageSettlementsResult.results || [];
    } else if (settlement.settlementType === 'comment') {
      const commentSettlementsResult = await env.DB.prepare(`
        SELECT * FROM commentsettlements WHERE settlementId = ? AND projectId = ?
      `).bind(settlementId, projectId).all();
      settlementDetails = commentSettlementsResult.results || [];
    }

    // Calculate summary
    const totalAmount = settlementTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const participantEmails = [...new Set(settlementTransactions.map(t => t.userEmail))];

    return successResponse({
      settlement: settlement,
      transactions: settlementTransactions,
      details: settlementDetails,
      summary: {
        transactionCount: settlementTransactions.length,
        totalAmount: totalAmount,
        participantEmails: participantEmails
      }
    });

  } catch (error) {
    console.error('Get settlement details error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get settlement details: ${message}`);
  }
}

/**
 * Get transactions by settlement ID
 */
export async function getSettlementTransactions(
  env: Env,
  userEmail: string,
  projectId: string,
  settlementId: string
): Promise<Response> {
  try {
    // Check project access
    const projectAccess = await env.DB.prepare(`
      SELECT ug.membershipId
      FROM usergroups ug
      WHERE ug.userEmail = ? AND ug.projectId = ? AND ug.isActive = 1
    `).bind(userEmail, projectId).first();

    if (!projectAccess) {
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view transactions');
    }

    // Get transactions for this settlement
    const transactionsResult = await env.DB.prepare(`
      SELECT * FROM transactions WHERE settlementId = ? AND projectId = ?
    `).bind(settlementId, projectId).all();

    const settlementTransactions = transactionsResult.results || [];
    const totalAmount = settlementTransactions.reduce((sum, t) => sum + Number(t.amount), 0);

    return successResponse({
      transactions: settlementTransactions,
      totalCount: settlementTransactions.length,
      totalAmount: totalAmount
    });

  } catch (error) {
    console.error('Get settlement transactions error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get settlement transactions: ${message}`);
  }
}

/**
 * Get stage settlement rankings for a specific stage
 */
export async function getStageSettlementRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  console.log('[getStageSettlementRankings] Called with:', { userEmail, projectId, stageId });

  try {
    console.log('[getStageSettlementRankings] Checking view permission (Level 0-3+: All project participants)...');
    // Check view permission (Level 0-3+: Admin/Creator, Teacher, Observer, Students)
    // Settlement rankings are read-only historical data that all participants should see
    const hasViewPermission = await checkProjectPermission(
      env,
      userEmail,
      projectId,
      'view'
    );

    console.log('[getStageSettlementRankings] View permission result:', hasViewPermission);

    if (!hasViewPermission) {
      console.log('[getStageSettlementRankings] Access denied - requires project membership');
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view settlement rankings');
    }

    console.log('[getStageSettlementRankings] Checking stage status...');
    // Check if stage is settled (needs VIEW for status)
    const stage = await env.DB.prepare(`
      SELECT * FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    console.log('[getStageSettlementRankings] Stage result:', stage);

    if (!stage || stage.status !== 'completed') {
      console.log('[getStageSettlementRankings] Stage not settled, returning empty rankings');
      return successResponse({
        settled: false,
        rankings: {},
        message: 'Stage not yet settled'
      });
    }

    console.log('[getStageSettlementRankings] Fetching settlements...');
    // Get stage settlements for this stage
    const settlementsResult = await env.DB.prepare(`
      SELECT * FROM stagesettlements WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).all();

    const settlements = settlementsResult.results || [];

    console.log('[getStageSettlementRankings] Found settlements:', settlements.length);

    // Create ranking map: groupId -> finalRank
    const rankingMap: Record<string, any> = {};
    settlements.forEach((settlement: any) => {
      rankingMap[settlement.groupId] = {
        groupId: settlement.groupId,
        finalRank: settlement.finalRank,
        allocatedPoints: settlement.allocatedPoints,
        memberEmails: settlement.memberEmails ? JSON.parse(settlement.memberEmails) : [],
        memberPointsDistribution: settlement.memberPointsDistribution ? JSON.parse(settlement.memberPointsDistribution) : []
      };
    });

    console.log('[getStageSettlementRankings] Successfully prepared response with', settlements.length, 'settlements');

    return successResponse({
      settled: true,
      rankings: rankingMap,
      stageId: stageId,
      settlementId: settlements.length > 0 ? settlements[0].settlementId : null,
      settlementCount: settlements.length
    });

  } catch (error) {
    console.error('Get stage settlement rankings error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error details:', {
      projectId,
      stageId,
      errorType: typeof error,
      errorString: errorMessage
    });
    return errorResponse('INTERNAL_ERROR', `Failed to get stage settlement rankings: ${errorMessage}`);
  }
}

/**
 * Get comment settlement rankings for a specific stage
 */
export async function getCommentSettlementRankings(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  console.log('[getCommentSettlementRankings] Called with:', { userEmail, projectId, stageId });

  try {
    console.log('[getCommentSettlementRankings] Checking view permission (Level 0-3+: All project participants)...');
    // Check view permission (Level 0-3+: Admin/Creator, Teacher, Observer, Students)
    // Comment settlement rankings are read-only historical data that all participants should see
    const hasViewPermission = await checkProjectPermission(
      env,
      userEmail,
      projectId,
      'view'
    );

    console.log('[getCommentSettlementRankings] View permission result:', hasViewPermission);

    if (!hasViewPermission) {
      console.log('[getCommentSettlementRankings] Access denied - requires project membership');
      return errorResponse('ACCESS_DENIED', 'Insufficient permissions to view settlement rankings');
    }

    // Check if stage is settled (needs VIEW for status)
    const stage = await env.DB.prepare(`
      SELECT * FROM stages_with_status WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).first();

    if (!stage || stage.status !== 'completed') {
      return successResponse({
        settled: false,
        rankings: {},
        message: 'Stage not yet settled'
      });
    }

    // Get comment settlements for this stage
    const settlementsResult = await env.DB.prepare(`
      SELECT * FROM commentsettlements WHERE stageId = ? AND projectId = ?
    `).bind(stageId, projectId).all();

    const settlements = settlementsResult.results || [];

    // Create ranking map: commentId -> finalRank
    const rankingMap: Record<string, any> = {};
    settlements.forEach((settlement: any) => {
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

    return successResponse({
      settled: true,
      rankings: rankingMap,
      stageId: stageId,
      settlementCount: settlements.length
    });

  } catch (error) {
    console.error('Get comment settlement rankings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('INTERNAL_ERROR', `Failed to get comment settlement rankings: ${message}`);
  }
}
