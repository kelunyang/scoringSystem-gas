import type { Env } from '../types';
/**
 * Wallet Management Router - Pure Ledger Architecture
 * Migrated from GAS scripts/wallets_api.js
 *
 * Endpoints:
 * - POST /wallets/get - Get user wallet (all transactions)
 * - POST /wallets/transactions - Get user transaction history
 * - POST /wallets/transactions/all - Get all project transactions
 * - POST /wallets/award - Award points to user
 * - POST /wallets/reverse - Reverse a transaction
 * - POST /wallets/leaderboard - Get wallet leaderboard
 * - POST /wallets/ladder - Get project wallet ladder (by groups)
 * - POST /wallets/project-ladder - Get project wallet ladder (user-based, GAS-compatible)
 * - POST /wallets/group-stats - Get group wealth statistics
 * - POST /wallets/export - Export wallet summary
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkProjectPermission, checkIsTeacherOrAbove } from '../middleware/permissions';
import {
  getUserWallet,
  getUserTransactions,
  awardPoints,
  reverseTransaction,
  getAllProjectTransactions
} from '../handlers/wallets/transactions';
import {
  getWalletLeaderboard,
  getProjectWalletLadder,
  getGroupWealthStats,
  exportProjectWalletSummary,
  getStageGrowthData
} from '../handlers/wallets/leaderboard';
import {
  GetUserTransactionsRequestSchema,
  AwardPointsRequestSchema,
  ReverseTransactionRequestSchema,
  GetProjectWalletLadderRequestSchema,
  ExportWalletSummaryRequestSchema,
  GetStageGrowthDataRequestSchema
} from '@repo/shared/schemas/wallets';


const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// Apply authentication middleware to all routes
app.use('*', authMiddleware);


/**
 * Get user transaction history
 * Body: { sessionId, projectId, targetUserEmail?, limit?, offset?, transactionTypes?, dateStart?, dateEnd?, searchDescription?, searchUser? }
 */
app.post(
  '/transactions',
  zValidator('json', GetUserTransactionsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const {
      projectId,
      targetUserEmail,
      limit = 50,
      offset = 0,
      stageId,
      settlementId,
      relatedSubmissionId,
      groupId,
      transactionTypes,
      dateStart,
      dateEnd,
      searchDescription,
      searchUser
    } = body;

    // Determine actual target email for query
    // For teachers: if targetUserEmail is not provided, default to viewing ALL transactions ('*')
    // For students: if targetUserEmail is not provided, default to current user (view own transactions)
    let actualTargetEmail = targetUserEmail;

    // Check if user is teacher or above FIRST to determine default behavior
    const isTeacherOrAbove = await checkIsTeacherOrAbove(c.env.DB, user.userEmail, projectId);

    if (!targetUserEmail) {
      // Default behavior based on permission level
      if (isTeacherOrAbove) {
        // Teachers default to viewing all transactions when none specified
        actualTargetEmail = '*';
      } else {
        // Students default to viewing their own transactions
        // Log warning: frontend should send userEmail explicitly for students
        console.warn('[WALLET] Low-permission user sent null targetUserEmail, auto-correcting to own email:', {
          userEmail: user.userEmail,
          projectId
        });
        actualTargetEmail = user.userEmail;
      }
    }

    // Enhanced permission check: Prevent low-permission users from viewing others' transactions
    if (!isTeacherOrAbove) {
      // Low-permission users can ONLY view their own transactions
      if (actualTargetEmail !== user.userEmail) {
        console.error('[WALLET] Access denied: Low-permission user attempted to view other user transactions:', {
          requester: user.userEmail,
          targetUser: actualTargetEmail,
          projectId
        });
        return c.json({
          success: false,
          error: '您沒有權限查看其他使用者的交易記錄',
          errorCode: 'ACCESS_DENIED'
        }, 403);
      }
    } else {
      // High-permission users viewing specific other user or all users
      if (actualTargetEmail === '*') {
        // Viewing all transactions - already verified isTeacherOrAbove
        console.log('[WALLET] Teacher viewing all project transactions:', {
          userEmail: user.userEmail,
          projectId
        });
      } else if (actualTargetEmail !== user.userEmail) {
        // Viewing specific other user's transactions
        console.log('[WALLET] Teacher viewing specific user transactions:', {
          requester: user.userEmail,
          targetUser: actualTargetEmail,
          projectId
        });
      }
    }

    // If actualTargetEmail is '*', it means view ALL transactions (teacher+ only)
    // Pass undefined to handler to skip userEmail filter
    // Convert null to undefined for handler compatibility
    const queryEmail = (actualTargetEmail === '*' || !actualTargetEmail) ? undefined : actualTargetEmail;

    const response = await getUserTransactions(
      c.env,
      user.userEmail,
      projectId,
      queryEmail,
      limit,
      stageId,
      settlementId,
      relatedSubmissionId,
      groupId,
      offset,
      transactionTypes,
      dateStart,
      dateEnd,
      searchDescription,
      searchUser
    );

    return response;
  }
);


/**
 * Award points to user
 * Body: { sessionId, projectId, targetUserEmail, amount, transactionType, source, relatedId?, settlementId?, stageId? }
 */
app.post(
  '/award',
  zValidator('json', AwardPointsRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const {
      projectId,
      targetUserEmail,
      amount,
      transactionType,
      source,
      relatedId,
      settlementId,
      stageId
    } = body;

    // Need manage permission to award points
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to award points',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await awardPoints(
      c.env,
      user.userEmail,
      projectId,
      targetUserEmail,
      amount,
      transactionType,
      source,
      relatedId,
      settlementId,
      stageId
    );

    return response;
  }
);

/**
 * Reverse transaction
 * Body: { sessionId, projectId, transactionId, reason }
 */
app.post(
  '/reverse',
  zValidator('json', ReverseTransactionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, transactionId, reason } = body;

    // Need manage permission to reverse transactions
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to reverse transaction',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await reverseTransaction(
      c.env,
      user.userEmail,
      projectId,
      transactionId,
      reason
    );

    return response;
  }
);

/**
 * Get project wallet ladder (GAS-compatible endpoint)
 * User-based ladder with permission masking for visualization
 * Body: { sessionId, projectId, zeroScoreThreshold? }
 */
app.post(
  '/project-ladder',
  zValidator('json', GetProjectWalletLadderRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, zeroScoreThreshold = 0 } = body;

    // Need at least view permission
    // Note: getProjectWalletLadder has built-in permission masking for students
    // Students see: highest, self, lowest (with masked names)
    // Teachers see: all users with full data
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view wallet ladder',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getProjectWalletLadder(
      c.env,
      user.userEmail,
      projectId,
      zeroScoreThreshold
    );

    return response;
  }
);


/**
 * Export project wallet summary
 * Body: { sessionId, projectId, zeroScoreThreshold? }
 */
app.post(
  '/export',
  zValidator('json', ExportWalletSummaryRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, zeroScoreThreshold = 0 } = body;

    // Need manage permission to export
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'manage');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to export wallet summary',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await exportProjectWalletSummary(
      c.env,
      user.userEmail,
      projectId,
      zeroScoreThreshold
    );

    return response;
  }
);

/**
 * Get stage growth data for visualization
 * Body: { sessionId, projectId, targetUserEmail? }
 */
app.post(
  '/stage-growth',
  zValidator('json', GetStageGrowthDataRequestSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const { projectId, targetUserEmail } = body;

    // Need at least view permission
    const hasPermission = await checkProjectPermission(c.env, user.userEmail, projectId, 'view');
    if (!hasPermission) {
      return c.json({
        success: false,
        error: 'Insufficient permissions to view stage growth data',
        errorCode: 'ACCESS_DENIED'
      }, 403);
    }

    const response = await getStageGrowthData(
      c.env,
      user.userEmail,
      projectId,
      targetUserEmail ?? undefined
    );

    return response;
  }
);

export default app;
