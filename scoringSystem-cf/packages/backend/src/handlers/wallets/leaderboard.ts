/**
 * Wallet Leaderboard Handlers
 * Migrated from GAS scripts/wallets_api.js
 *
 * Calculates rankings from transaction ledger (no stored balances)
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';

/**
 * Get wallet leaderboard (top users by balance)
 * Balance calculated from all transactions in real-time
 */
export async function getWalletLeaderboard(
  env: Env,
  userEmail: string,
  projectId: string,
  limit: number = 10
): Promise<Response> {
  try {
    // Calculate balance for each user from transactions
    const userBalances = await env.DB.prepare(`
      SELECT
        u.userId, u.userEmail, u.displayName,
        SUM(t.amount) as balance,
        COUNT(t.transactionId) as transactionCount
      FROM transactions t
      JOIN users u ON t.userEmail = u.userEmail
      WHERE t.projectId = ?
      GROUP BY u.userId, u.userEmail, u.displayName
      ORDER BY balance DESC
      LIMIT ?
    `).bind(projectId, limit).all();

    const leaderboard = userBalances.results.map((user, index) => ({
      rank: index + 1,
      userId: user.userId,
      userEmail: user.userEmail,
      displayName: user.displayName,
      balance: user.balance || 0,
      transactionCount: user.transactionCount || 0
    }));

    return successResponse({
      leaderboard,
      total: leaderboard.length
    });

  } catch (error) {
    console.error('Get wallet leaderboard error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get wallet leaderboard');
  }
}

/**
 * Get project wallet ladder (user-based with permission masking)
 * GAS-compatible implementation for WalletLadderChart visualization
 *
 * Permission-based data masking:
 * - Teachers/Admins (Level 0-1): See all users' data
 * - Students (Level 3): See only highest, lowest, and their own data (with masked names)
 */
export async function getProjectWalletLadder(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Get project score range settings
    const project = await env.DB.prepare(`
      SELECT scoreRangeMin, scoreRangeMax
      FROM projects
      WHERE projectId = ?
    `).bind(projectId).first();

    const scoreRangeMin = (project?.scoreRangeMin as number) || 65;
    const scoreRangeMax = (project?.scoreRangeMax as number) || 95;

    // Check if user has teacher/admin/observer privilege (full access)
    // Import the permission check utilities
    const { checkIsAdminTeacherOrObserver } = await import('../../utils/permissions');
    const hasFullAccess = await checkIsAdminTeacherOrObserver(env.DB, userEmail, projectId);

    // Get all project members with their balances and avatar data
    const userBalances = await env.DB.prepare(`
      SELECT
        u.userId, u.userEmail, u.displayName,
        u.avatarSeed, u.avatarStyle, u.avatarOptions,
        COALESCE(SUM(t.amount), 0) as currentBalance
      FROM usergroups ug
      JOIN users u ON ug.userEmail = u.userEmail
      LEFT JOIN transactions t ON u.userEmail = t.userEmail AND t.projectId = ?
      WHERE ug.projectId = ? AND ug.isActive = 1
      GROUP BY u.userId, u.userEmail, u.displayName, u.avatarSeed, u.avatarStyle, u.avatarOptions
      ORDER BY currentBalance DESC
    `).bind(projectId, projectId).all();

    // Calculate global min/max BEFORE permission filtering
    // This ensures students see correct score range for accurate grade estimation
    const allBalances = userBalances.results.map(u => (u.currentBalance as number) || 0);
    const globalMinBalance = allBalances.length > 0 ? Math.min(...allBalances) : 0;
    const globalMaxBalance = allBalances.length > 0 ? Math.max(...allBalances) : 0;

    if (!userBalances.results || userBalances.results.length === 0) {
      return successResponse({
        hasFullAccess,
        walletData: [],
        globalMinBalance: 0,
        globalMaxBalance: 0,
        currentUserEmail: userEmail,
        scoreRangeMin,
        scoreRangeMax
      });
    }

    let walletData: any[] = [];

    if (hasFullAccess) {
      // Teacher/Admin/Observer (Level 0-2): Return all users with full data
      walletData = userBalances.results.map(user => ({
        userEmail: user.userEmail as string,
        currentBalance: (user.currentBalance as number) || 0,
        userId: user.userId as string,
        username: user.userEmail as string, // username field for compatibility
        displayName: user.displayName as string,
        avatarSeed: user.avatarSeed as string,
        avatarStyle: (user.avatarStyle as string) || 'avataaars',
        avatarOptions: parseJSON(user.avatarOptions as string, {}) || {}
      }));
    } else {
      // Group Leader/Member (Level 3-4): Return top user + all group members (deduplicated)
      if (userBalances.results.length === 0) {
        walletData = [];
      } else {
        // Get user's group
        const userGroup = await env.DB.prepare(`
          SELECT groupId FROM usergroups
          WHERE userEmail = ? AND projectId = ? AND isActive = 1
        `).bind(userEmail, projectId).first();

        if (!userGroup) {
          return errorResponse('ACCESS_DENIED', 'User not in any group');
        }

        const userGroupId = userGroup.groupId as string;

        // Get all users with their groupId for filtering
        const usersWithGroups = await env.DB.prepare(`
          SELECT
            u.userId, u.userEmail, u.displayName,
            u.avatarSeed, u.avatarStyle, u.avatarOptions,
            ug.groupId,
            COALESCE(SUM(t.amount), 0) as currentBalance
          FROM usergroups ug
          JOIN users u ON ug.userEmail = u.userEmail
          LEFT JOIN transactions t ON u.userEmail = t.userEmail AND t.projectId = ?
          WHERE ug.projectId = ? AND ug.isActive = 1
          GROUP BY u.userId, u.userEmail, u.displayName, u.avatarSeed, u.avatarStyle, u.avatarOptions, ug.groupId
          ORDER BY currentBalance DESC
        `).bind(projectId, projectId).all();

        // Use Map for deduplication (key = userEmail)
        const uniqueUsers = new Map();

        // Add top user (highest balance)
        if (usersWithGroups.results.length > 0) {
          const topUser = usersWithGroups.results[0];
          uniqueUsers.set(topUser.userEmail as string, {
            userEmail: topUser.userEmail as string,
            currentBalance: (topUser.currentBalance as number) || 0,
            userId: topUser.userId as string,
            username: topUser.userEmail as string,
            displayName: topUser.displayName as string,
            avatarSeed: topUser.avatarSeed as string,
            avatarStyle: (topUser.avatarStyle as string) || 'avataaars',
            avatarOptions: parseJSON(topUser.avatarOptions as string, {}) || {}
          });
        }

        // Add all group members
        usersWithGroups.results.forEach(user => {
          if (user.groupId === userGroupId) {
            uniqueUsers.set(user.userEmail as string, {
              userEmail: user.userEmail as string,
              currentBalance: (user.currentBalance as number) || 0,
              userId: user.userId as string,
              username: user.userEmail as string,
              displayName: user.displayName as string,
              avatarSeed: user.avatarSeed as string,
              avatarStyle: (user.avatarStyle as string) || 'avataaars',
              avatarOptions: parseJSON(user.avatarOptions as string, {}) || {}
            });
          }
        });

        // Convert Map to array
        walletData = Array.from(uniqueUsers.values());
      }
    }

    return successResponse({
      hasFullAccess,
      walletData,
      globalMinBalance,
      globalMaxBalance,
      currentUserEmail: userEmail,
      scoreRangeMin,
      scoreRangeMax
    });

  } catch (error) {
    console.error('Get project wallet ladder error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get project wallet ladder');
  }
}

/**
 * Get group wealth statistics
 * Calculate total balance per group
 */
export async function getGroupWealthStats(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    const groupStats = await env.DB.prepare(`
      SELECT
        pg.groupId, pg.groupName,
        COUNT(DISTINCT pug.userEmail) as memberCount,
        COALESCE(SUM(t.amount), 0) as totalBalance,
        COALESCE(AVG(t.amount), 0) as avgBalancePerMember
      FROM groups pg
      JOIN usergroups pug ON pg.groupId = pug.groupId
      LEFT JOIN users u ON pug.userEmail = u.userEmail
      LEFT JOIN transactions t ON u.userEmail = t.userEmail AND t.projectId = ?
      WHERE pg.projectId = ?
      GROUP BY pg.groupId, pg.groupName
      ORDER BY totalBalance DESC
    `).bind(projectId, projectId).all();

    const stats = groupStats.results.map((group, index) => ({
      rank: index + 1,
      groupId: group.groupId,
      groupName: group.groupName,
      memberCount: group.memberCount || 0,
      totalBalance: group.totalBalance || 0,
      avgBalance: group.avgBalancePerMember || 0
    }));

    return successResponse({
      stats,
      totalGroups: stats.length
    });

  } catch (error) {
    console.error('Get group wealth stats error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get group wealth statistics');
  }
}

/**
 * Export project wallet summary (all users and transactions)
 */
export async function exportProjectWalletSummary(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Get all user balances
    const userBalances = await env.DB.prepare(`
      SELECT
        u.userId, u.userEmail, u.displayName,
        COALESCE(SUM(t.amount), 0) as balance,
        COUNT(t.transactionId) as transactionCount
      FROM users u
      LEFT JOIN transactions t ON u.userEmail = t.userEmail AND t.projectId = ?
      WHERE u.userEmail IN (
        SELECT userEmail FROM usergroups WHERE projectId = ?
      )
      GROUP BY u.userId, u.userEmail, u.displayName
      ORDER BY balance DESC
    `).bind(projectId, projectId).all();

    // Get project info including score range
    const project = await env.DB.prepare(`
      SELECT projectId, projectName, createdAt, scoreRangeMin, scoreRangeMax
      FROM projects
      WHERE projectId = ?
    `).bind(projectId).first();

    // Extract score range with defaults
    const scoreRangeMin = (project?.scoreRangeMin as number) || 65;
    const scoreRangeMax = (project?.scoreRangeMax as number) || 95;

    // Calculate min and max points for affine transformation
    let maxPoints = 0;
    let minPoints = Number.MAX_VALUE;

    userBalances.results.forEach(user => {
      const balance = (user.balance as number) || 0;
      if (balance > maxPoints) maxPoints = balance;
      if (balance < minPoints) minPoints = balance;
    });

    // Handle edge case: all users have same points
    if (maxPoints === minPoints) {
      minPoints = 0;
    }

    // Calculate grades using affine transformation
    const usersWithGrades = userBalances.results.map(user => {
      const totalPoints = (user.balance as number) || 0;
      let grade: number;

      if (maxPoints === minPoints) {
        // All users have same points, give max score
        grade = scoreRangeMax;
      } else {
        // Affine transformation: map points to grade range
        grade = scoreRangeMin +
          (totalPoints - minPoints) / (maxPoints - minPoints) *
          (scoreRangeMax - scoreRangeMin);
      }

      return {
        userId: user.userId,
        userEmail: user.userEmail,
        displayName: user.displayName,
        totalPoints: totalPoints,
        grade: parseFloat(grade.toFixed(2)), // Round to 2 decimal places
        transactionCount: user.transactionCount || 0
      };
    });

    const summary = {
      project: {
        projectId: project?.projectId,
        projectName: project?.projectName,
        createdAt: project?.createdAt
      },
      scoreRange: {
        min: scoreRangeMin,
        max: scoreRangeMax
      },
      exportTime: Date.now(),
      users: usersWithGrades,
      totalUsers: usersWithGrades.length,
      statistics: {
        maxPoints: maxPoints,
        minPoints: minPoints === Number.MAX_VALUE ? 0 : minPoints,
        avgPoints: usersWithGrades.reduce((sum, user) => sum + user.totalPoints, 0) / usersWithGrades.length
      }
    };

    return successResponse(summary);

  } catch (error) {
    console.error('Export wallet summary error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to export wallet summary');
  }
}

/**
 * Get stage growth data for wallet visualization
 * Returns cumulative points at each stage end for top user and target user
 *
 * @param env - Environment bindings
 * @param userEmail - Current user email
 * @param projectId - Project ID
 * @param targetUserEmail - Optional target user email (defaults to current user)
 */
export async function getStageGrowthData(
  env: Env,
  userEmail: string,
  projectId: string,
  targetUserEmail?: string
): Promise<Response> {
  try {
    // Get all project stages
    const stages = await env.DB.prepare(`
      SELECT stageId, stageName, stageOrder, endTime
      FROM stages
      WHERE projectId = ?
      ORDER BY stageOrder ASC
    `).bind(projectId).all();

    if (!stages.results || stages.results.length === 0) {
      return successResponse({
        topUser: null,
        targetUser: null,
        message: 'No stages found for this project'
      });
    }

    // Find top user (highest total balance)
    const topUserQuery = await env.DB.prepare(`
      SELECT
        u.userId,
        u.userEmail,
        u.displayName,
        SUM(t.amount) as totalPoints
      FROM transactions t
      JOIN users u ON t.userEmail = u.userEmail
      WHERE t.projectId = ?
      GROUP BY u.userId, u.userEmail, u.displayName
      ORDER BY totalPoints DESC
      LIMIT 1
    `).bind(projectId).first();

    if (!topUserQuery) {
      return successResponse({
        topUser: null,
        targetUser: null,
        message: 'No transaction data found'
      });
    }

    const topUserEmail = topUserQuery.userEmail as string;
    const target = targetUserEmail || userEmail;

    // Helper function to calculate cumulative points for a user
    const calculateUserGrowth = async (email: string) => {
      const user = await env.DB.prepare(`
        SELECT userId, userEmail, displayName
        FROM users
        WHERE userEmail = ?
      `).bind(email).first();

      if (!user) {
        return null;
      }

      // Fetch all transaction points grouped by stage in a SINGLE query (fixes N+1)
      const stagePoints = await env.DB.prepare(`
        SELECT
          s.stageId,
          s.stageOrder,
          COALESCE(SUM(t.amount), 0) as stageTotal
        FROM stages s
        LEFT JOIN transactions t ON t.stageId = s.stageId
          AND t.projectId = ?
          AND t.userEmail = ?
        WHERE s.projectId = ?
        GROUP BY s.stageId, s.stageOrder
        ORDER BY s.stageOrder ASC
      `).bind(projectId, user.userEmail, projectId).all();

      // Build a map of stageOrder -> points for quick lookup
      const pointsByStageOrder = new Map<number, number>();
      for (const row of stagePoints.results) {
        pointsByStageOrder.set(row.stageOrder as number, (row.stageTotal as number) || 0);
      }

      // Calculate cumulative points by iterating through stages in order
      const stageGrowth = [];
      let cumulativePoints = 0;

      for (const stage of stages.results) {
        const stageOrder = stage.stageOrder as number;
        const pointsAtStage = pointsByStageOrder.get(stageOrder) || 0;
        cumulativePoints += pointsAtStage;

        stageGrowth.push({
          stageId: stage.stageId,
          stageName: stage.stageName,
          stageOrder: stageOrder,
          endTime: stage.endTime,
          cumulativePoints: cumulativePoints
        });
      }

      // Total points is the final cumulative value
      const totalPoints = cumulativePoints;

      return {
        userId: user.userId,
        userEmail: user.userEmail,
        displayName: user.displayName,
        stageGrowth: stageGrowth,
        totalPoints: totalPoints
      };
    };

    // Calculate growth for both users
    const topUserData = await calculateUserGrowth(topUserEmail);
    const targetUserData = await calculateUserGrowth(target);

    return successResponse({
      topUser: topUserData,
      targetUser: targetUserData
    });

  } catch (error) {
    console.error('Get stage growth data error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get stage growth data');
  }
}
