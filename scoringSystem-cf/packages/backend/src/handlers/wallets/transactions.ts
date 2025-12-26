/**
 * Wallet Transaction Handlers - Hybrid Ledger Architecture
 * Migrated from GAS scripts/wallets_api.js
 *
 * IMPORTANT: This is a PURE LEDGER system - NO balance storage!
 * Architecture benefits:
 * - Backend only creates transaction records (append-only, immutable)
 * - Balance calculated on-demand using SQL SUM() - efficient database aggregation
 * - Reversals create opposite-amount transactions (blockchain-inspired)
 * - Running balance calculated using SQL window functions (OVER clause)
 * - Frontend receives pre-calculated balances, no client-side computation needed
 *
 * Best of both worlds:
 * - Data integrity: No stored balances that can become inconsistent
 * - Performance: SQL aggregation is much faster than client-side calculation
 * - Auditability: Complete transaction history with running balance trail
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { parseJSON, stringifyJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Get user wallet (all transactions + calculated balance)
 * Uses SQL SUM() for efficient balance calculation
 */
export async function getUserWallet(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail?: string
): Promise<Response> {
  try {
    const queryEmail = targetUserEmail || userEmail;

    // Get user ID
    const user = await env.DB.prepare(`
      SELECT userId FROM users WHERE userEmail = ?
    `).bind(queryEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Calculate balance using SQL SUM() - much more efficient!
    const balanceResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as balance
      FROM transactions
      WHERE projectId = ? AND userEmail = ?
    `).bind(projectId, queryEmail).first();

    const currentBalance = (balanceResult?.balance as number) || 0;

    // Get all transactions for this user in this project
    const transactions = await env.DB.prepare(`
      SELECT
        t.transactionId, t.amount, t.transactionType,
        t.source, t.timestamp,
        t.stageId, t.settlementId,
        t.relatedSubmissionId, t.relatedCommentId,
        t.userEmail,
        u.displayName,
        s.stageName, s.stageOrder
      FROM transactions t
      LEFT JOIN users u ON t.userEmail = u.userEmail
      LEFT JOIN stages s ON t.stageId = s.stageId
      WHERE t.projectId = ? AND t.userEmail = ?
      ORDER BY t.timestamp DESC
    `).bind(projectId, queryEmail).all();

    const transactionList = transactions.results.map(t => ({
      // Frontend expected fields
      id: t.transactionId,
      points: t.amount, // Can be positive or negative
      description: t.source,
      stage: t.stageOrder || null,
      timestamp: t.timestamp,

      // Additional metadata
      transactionType: t.transactionType,
      stageName: t.stageName || null,
      stageId: t.stageId,
      settlementId: t.settlementId,
      relatedSubmissionId: t.relatedSubmissionId,
      relatedCommentId: t.relatedCommentId,

      // Original fields
      transactionId: t.transactionId,
      userEmail: t.userEmail,
      displayName: t.displayName,
      amount: t.amount,
      source: t.source
    }));

    // Recent 10 transactions for display
    const recentTransactions = transactionList.slice(0, 10);

    return successResponse({
      userEmail: queryEmail,
      balance: currentBalance,              // Calculated balance from SQL SUM()
      transactions: transactionList,        // All transactions for history
      recentTransactions: recentTransactions // Recent transactions for display
    });

  } catch (error) {
    console.error('Get user wallet error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user wallet');
  }
}

/**
 * Get user transaction history with pagination and running balance
 */
export async function getUserTransactions(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail?: string,
  limit: number = 50,
  stageId?: string,
  settlementId?: string,
  relatedSubmissionId?: string,
  groupId?: string
): Promise<Response> {
  try {
    const queryEmail = targetUserEmail; // Don't fallback to userEmail

    // Get user ID (only if querying specific user)
    if (queryEmail) {
      const user = await env.DB.prepare(`
        SELECT userId FROM users WHERE userEmail = ?
      `).bind(queryEmail).first();

      if (!user) {
        return errorResponse('USER_NOT_FOUND', 'User not found');
      }
    }

    // Build WHERE conditions using safe parameterized queries
    // All conditions are added via placeholders, never string concatenation
    interface QueryBuilder {
      conditions: string[];
      params: any[];
    }

    const query: QueryBuilder = {
      conditions: ['t.projectId = ?'],
      params: [projectId]
    };

    // Add userEmail filter if specified (skip if groupId is provided)
    if (queryEmail && !groupId) {
      query.conditions.push('t.userEmail = ?');
      query.params.push(queryEmail);
    }

    // Add optional filters - all use parameterized placeholders
    if (stageId) {
      query.conditions.push('t.stageId = ?');
      query.params.push(stageId);
    }

    if (settlementId) {
      query.conditions.push('t.settlementId = ?');
      query.params.push(settlementId);
    }

    if (relatedSubmissionId) {
      query.conditions.push('t.relatedSubmissionId = ?');
      query.params.push(relatedSubmissionId);
    }

    // Add groupId filter - query JSON metadata (still parameterized)
    if (groupId) {
      query.conditions.push("json_extract(t.metadata, '$.groupId') = ?");
      query.params.push(groupId);
    }

    const whereClause = query.conditions.join(' AND ');

    // Calculate current balance using SQL SUM() with same filters
    const balanceQuery = `
      SELECT COALESCE(SUM(amount), 0) as balance
      FROM transactions t
      WHERE ${whereClause}
    `;
    const balanceResult = await env.DB.prepare(balanceQuery).bind(...query.params).first();
    const currentBalance = (balanceResult?.balance as number) || 0;

    // Get transactions with running balance calculation using window function
    // SQLite supports window functions for calculating running totals
    const transactionsQuery = `
      SELECT
        t.transactionId, t.amount, t.transactionType, t.source,
        t.timestamp, t.stageId, t.settlementId,
        t.relatedSubmissionId, t.relatedCommentId, t.metadata,
        t.userEmail,
        u.displayName,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions,
        s.stageName, s.stageOrder,
        SUM(t.amount) OVER (ORDER BY t.timestamp DESC) as runningBalance
      FROM transactions t
      LEFT JOIN users u ON t.userEmail = u.userEmail
      LEFT JOIN stages s ON t.stageId = s.stageId
      WHERE ${whereClause}
      ORDER BY t.timestamp DESC
      LIMIT ?
    `;

    const transactions = await env.DB.prepare(transactionsQuery)
      .bind(...query.params, limit)
      .all();

    const transactionList = transactions.results.map(t => ({
      transactionId: t.transactionId,
      amount: t.amount,
      type: t.transactionType,
      transactionType: t.transactionType,
      description: t.source,
      source: t.source,
      timestamp: t.timestamp,
      stageId: t.stageId,
      stageName: t.stageName,
      stageOrder: t.stageOrder,
      userEmail: t.userEmail,
      displayName: t.displayName,
      avatarSeed: t.avatarSeed,
      avatarStyle: t.avatarStyle,
      avatarOptions: t.avatarOptions,
      settlementId: t.settlementId,
      relatedSubmissionId: t.relatedSubmissionId,
      relatedCommentId: t.relatedCommentId,
      metadata: t.metadata, // Include metadata for participationPercentage and other details
      runningBalance: t.runningBalance // Balance after this transaction
    }));

    return successResponse({
      currentBalance,                // Overall current balance
      transactions: transactionList, // Transactions with running balance
      total: transactionList.length
    });

  } catch (error) {
    console.error('Get user transactions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get user transactions');
  }
}

/**
 * Award points to user (create transaction record only)
 */
export async function awardPoints(
  env: Env,
  awardedBy: string,
  projectId: string,
  targetUserEmail: string,
  amount: number,
  transactionType: string,
  source: string,
  relatedId?: string,
  settlementId?: string,
  stageId?: string
): Promise<Response> {
  try {
    // Strengthen number validation (fix Linus HIGH #3)
    if (typeof amount !== 'number' || !isFinite(amount) || amount === 0) {
      return errorResponse('INVALID_INPUT', 'Amount must be a finite non-zero number');
    }

    // Sanity check: prevent absurdly large point awards (e.g., > 1 million)
    const MAX_POINTS = 1000000;
    if (Math.abs(amount) > MAX_POINTS) {
      return errorResponse('INVALID_INPUT', `Amount exceeds maximum allowed (${MAX_POINTS})`);
    }

    // Verify target user exists
    const targetUser = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail = ?
    `).bind(targetUserEmail).first();

    if (!targetUser) {
      return errorResponse('USER_NOT_FOUND', 'Target user not found');
    }

    // Create transaction record (append-only)
    const transactionId = generateId('txn');
    const timestamp = Date.now();

    // Build metadata with awarder info
    const metadata = {
      awardedBy: awardedBy,
      awardedAt: timestamp
    };

    // Prepare transaction statement
    const transactionStmt = env.DB.prepare(`
      INSERT INTO transactions (
        transactionId, projectId, userEmail, amount, transactionType,
        source, timestamp, stageId, settlementId,
        relatedSubmissionId, relatedCommentId, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transactionId,
      projectId,
      targetUserEmail,
      amount, // Can be positive or negative
      transactionType,
      source,
      timestamp,
      stageId || null,
      settlementId || null,
      transactionType.includes('submission') || transactionType === 'stage_completion' ? relatedId : null,
      transactionType.includes('comment') ? relatedId : null,
      JSON.stringify(metadata)
    );

    // Execute transaction insertion
    await transactionStmt.run();

    // Log the points award using centralized logging (separate transaction for logging)
    try {
      await logProjectOperation(
        env,
        awardedBy,
        projectId,
        'points_awarded',
        'transaction',
        transactionId,
        {
          targetUserEmail,
          amount,
          transactionType,
          source,
          stageId
        },
        { level: 'info' }
      );
    } catch (logError) {
      console.error('[awardPoints] Failed to log transaction:', logError);
      // Don't fail the transaction if logging fails
    }

    // Send notification to user about transaction
    try {
      await queueSingleNotification(env, {
        targetUserEmail,
        type: 'settlement_failed',
        title: amount > 0 ? '收到積分獎勵' : '積分已扣除',
        content: `${source}: ${amount > 0 ? '+' : ''}${amount} 積分`,
        projectId,
        transactionId,
        stageId: stageId || undefined,
        metadata: {
          amount,
          transactionType,
          awardedBy
        }
      });
    } catch (notifError) {
      console.error('[awardPoints] Failed to create notification:', notifError);
      // Don't fail the transaction if notification fails
    }

    return successResponse({
      transactionId,
      amount,
      timestamp,
      targetUserEmail
    }, 'Points awarded successfully');

  } catch (error) {
    console.error('Award points error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to award points');
  }
}

/**
 * Reverse a transaction (create opposite transaction)
 * Blockchain-inspired: never modify original records
 */
export async function reverseTransaction(
  env: Env,
  userEmail: string,
  projectId: string,
  transactionId: string,
  reason: string
): Promise<Response> {
  try {
    // Get original transaction
    const originalTxn = await env.DB.prepare(`
      SELECT
        t.transactionId, t.userEmail, t.amount, t.transactionType, t.source,
        t.stageId, t.settlementId, t.relatedSubmissionId, t.relatedCommentId
      FROM transactions t
      WHERE t.transactionId = ? AND t.projectId = ?
    `).bind(transactionId, projectId).first();

    if (!originalTxn) {
      return errorResponse('TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    // Check if already reversed
    // Look for reversal in metadata using json_extract
    const existingReversal = await env.DB.prepare(`
      SELECT transactionId FROM transactions
      WHERE projectId = ?
        AND transactionType = 'reversal'
        AND json_extract(metadata, '$.originalTransactionId') = ?
    `).bind(projectId, transactionId).first();

    if (existingReversal) {
      return errorResponse('ALREADY_REVERSED', 'Transaction already reversed');
    }

    // Create reversal transaction (opposite amount)
    const reversalId = generateId('txn');
    const timestamp = Date.now();
    const reversalAmount = -(originalTxn.amount as number); // Opposite sign

    // Build metadata with reversal info
    const metadata = {
      reversedBy: userEmail,
      originalTransactionId: transactionId,
      reason: reason.trim()
    };

    // Use batch transaction for atomicity (defense in depth with UNIQUE constraint)
    // This prevents race conditions where two reversals could be created simultaneously
    const reversalStmt = env.DB.prepare(`
      INSERT INTO transactions (
        transactionId, projectId, userEmail, amount, transactionType,
        source, timestamp, stageId, settlementId,
        relatedSubmissionId, relatedCommentId, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reversalId,
      projectId,
      originalTxn.userEmail,
      reversalAmount,
      'reversal',
      `撤銷：${originalTxn.source}（理由：${reason.trim()}）`,
      timestamp,
      originalTxn.stageId,
      originalTxn.settlementId,
      originalTxn.relatedSubmissionId,
      originalTxn.relatedCommentId,
      JSON.stringify(metadata)
    );

    // Execute reversal transaction insertion
    await reversalStmt.run();

    // Log the transaction reversal using centralized logging (separate transaction for logging)
    try {
      await logProjectOperation(
        env,
        userEmail,
        projectId,
        'transaction_reversed',
        'transaction',
        reversalId,
        {
          originalTransactionId: transactionId,
          originalAmount: originalTxn.amount,
          reversalAmount,
          reason,
          targetUserEmail: originalTxn.userEmail
        },
        { level: 'warning' }
      );
    } catch (logError) {
      console.error('[reverseTransaction] Failed to log reversal:', logError);
      // Don't fail the reversal if logging fails
    }

    // Send notification to user about reversal
    try {
      await queueSingleNotification(env, {
        targetUserEmail: originalTxn.userEmail as string,
        type: 'settlement_failed',
        title: '交易已撤銷',
        content: `原交易「${originalTxn.source}」已被撤銷，${reversalAmount > 0 ? '+' : ''}${reversalAmount} 積分。原因：${reason}`,
        projectId,
        transactionId: reversalId,
        stageId: originalTxn.stageId as string | undefined,
        metadata: {
          originalTransactionId: transactionId,
          originalAmount: originalTxn.amount,
          reversalAmount,
          reason,
          reversedBy: userEmail
        }
      });
    } catch (notifError) {
      console.error('[reverseTransaction] Failed to create notification:', notifError);
      // Don't fail the reversal if notification fails
    }

    return successResponse({
      reversalId,
      originalTransactionId: transactionId,
      originalAmount: originalTxn.amount,
      reversalAmount,
      timestamp
    }, 'Transaction reversed successfully');

  } catch (error) {
    console.error('Reverse transaction error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to reverse transaction');
  }
}

/**
 * Get all transactions for a project
 */
export async function getAllProjectTransactions(
  env: Env,
  userEmail: string,
  projectId: string,
  limit: number = 200
): Promise<Response> {
  try {
    const transactions = await env.DB.prepare(`
      SELECT
        t.transactionId, t.amount, t.transactionType, t.source,
        t.timestamp, t.stageId, t.settlementId,
        t.relatedSubmissionId, t.relatedCommentId, t.metadata,
        t.userEmail,
        u.displayName,
        s.stageName, s.stageOrder
      FROM transactions t
      LEFT JOIN users u ON t.userEmail = u.userEmail
      LEFT JOIN stages s ON t.stageId = s.stageId
      WHERE t.projectId = ?
      ORDER BY t.timestamp DESC
      LIMIT ?
    `).bind(projectId, limit).all();

    const transactionList = transactions.results.map(t => ({
      transactionId: t.transactionId,
      amount: t.amount,
      type: t.transactionType,
      transactionType: t.transactionType,
      description: t.source,
      source: t.source,
      timestamp: t.timestamp,
      stageId: t.stageId,
      stageName: t.stageName,
      stageOrder: t.stageOrder,
      userEmail: t.userEmail,
      displayName: t.displayName,
      settlementId: t.settlementId,
      relatedSubmissionId: t.relatedSubmissionId,
      relatedCommentId: t.relatedCommentId,
      metadata: t.metadata
    }));

    return successResponse({
      transactions: transactionList,
      total: transactionList.length
    });

  } catch (error) {
    console.error('Get all project transactions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get project transactions');
  }
}

// Logging is now handled by centralized utils/logging module
