/**
 * Comment Reactions Handlers
 * Migrated from GAS scripts/comments_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { generateId } from '@utils/id-generator';
import { stringifyJSON } from '@utils/json';
import { logProjectOperation } from '@utils/logging';
import { queueSingleNotification } from '../../queues/notification-producer';

/**
 * Add reaction to comment
 */
export async function addReaction(
  env: Env,
  userEmail: string,
  projectId: string,
  commentId: string,
  reactionType: string
): Promise<Response> {
  try {
    // Validate reaction type
    const validReactions = ['helpful', 'disagreed'];
    if (!validReactions.includes(reactionType)) {
      return errorResponse('INVALID_INPUT', 'Invalid reaction type');
    }

    // Verify user exists
    const user = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Verify comment exists and get author
    const comment = await env.DB.prepare(`
      SELECT commentId, authorEmail, stageId FROM comments
      WHERE commentId = ? AND projectId = ?
    `).bind(commentId, projectId).first();

    if (!comment) {
      return errorResponse('COMMENT_NOT_FOUND', 'Comment not found');
    }

    // Append-only architecture: Check user's latest reaction to avoid duplicate inserts
    const latestReaction = await env.DB.prepare(`
      SELECT reactionType
      FROM reactions
      WHERE targetId = ? AND userEmail = ? AND targetType = 'comment'
      ORDER BY createdAt DESC
      LIMIT 1
    `).bind(commentId, userEmail).first();

    // If latest reaction is same type, no need to insert again
    // But still return current stats for consistency
    if (latestReaction && latestReaction.reactionType === reactionType) {
      const stats = await getReactionStatsForComment(env, commentId, userEmail);
      return successResponse({
        reactionType,
        reactions: stats.reactions,
        userReaction: stats.userReaction,
        totalReactions: stats.totalReactions
      }, 'Reaction already exists');
    }

    // Always insert new reaction (append-only, never UPDATE)
    const reactionId = generateId('rxn');
    await env.DB.prepare(`
      INSERT INTO reactions (
        reactionId, projectId, targetType, targetId, userEmail, reactionType, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reactionId,
      projectId,
      'comment',
      commentId,
      userEmail,
      reactionType,
      Date.now()
    ).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'reaction_added', 'comment', commentId, {
      reactionType
    });

    // 通知評論作者（如果不是自己）
    try {
      const authorEmail = comment.authorEmail as string;
      if (authorEmail !== userEmail) {
        const reactionText = {
          helpful: '有幫助',
          disagreed: '不實用'
        }[reactionType] || reactionType;

        await queueSingleNotification(env, {
          targetUserEmail: authorEmail,
          type: 'comment_replied',
          title: '您的評論收到反應',
          content: `${userEmail} 對您的評論表示${reactionText}`,
          projectId,
          stageId: comment.stageId as string,
          commentId
        });
      }
    } catch (error) {
      console.error('[addReaction] Failed to send notification:', error);
    }

    // Get updated reaction statistics
    const stats = await getReactionStatsForComment(env, commentId, userEmail);

    return successResponse({
      reactionId,
      reactionType,
      reactions: stats.reactions,
      userReaction: stats.userReaction,
      totalReactions: stats.totalReactions
    }, 'Reaction added successfully');

  } catch (error) {
    console.error('Add reaction error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to add reaction');
  }
}

/**
 * Internal helper: Get reaction statistics for a comment
 * Used by addReaction and removeReaction to return updated stats
 */
async function getReactionStatsForComment(
  env: Env,
  commentId: string,
  userEmail: string
): Promise<{
  reactions: Array<{ type: string; count: number; users: string[] }>;
  userReaction: string | null;
  totalReactions: number;
}> {
  // Get latest reactions using window function (append-only architecture)
  const reactions = await env.DB.prepare(`
    WITH latest_reactions AS (
      SELECT
        r.userEmail,
        r.reactionType,
        ROW_NUMBER() OVER (
          PARTITION BY r.userEmail
          ORDER BY r.createdAt DESC
        ) as rn
      FROM reactions r
      WHERE r.targetId = ? AND r.targetType = 'comment'
    )
    SELECT
      lr.reactionType,
      COUNT(*) as count,
      GROUP_CONCAT(u.displayName) as users
    FROM latest_reactions lr
    JOIN users u ON lr.userEmail = u.userEmail
    WHERE lr.rn = 1 AND lr.reactionType IS NOT NULL
    GROUP BY lr.reactionType
  `).bind(commentId).all();

  // Get user's latest reaction
  const userReactionResult = await env.DB.prepare(`
    SELECT reactionType
    FROM reactions
    WHERE targetId = ? AND userEmail = ? AND targetType = 'comment'
    ORDER BY createdAt DESC
    LIMIT 1
  `).bind(commentId, userEmail).first();

  const userReaction = (userReactionResult?.reactionType !== null)
    ? userReactionResult?.reactionType as string
    : null;

  const reactionStats = reactions.results.map(r => ({
    type: r.reactionType as string,
    count: r.count as number,
    users: (r.users as string)?.split(',') || []
  }));

  return {
    reactions: reactionStats,
    userReaction,
    totalReactions: reactionStats.reduce((sum, r) => sum + r.count, 0)
  };
}

/**
 * Remove reaction from comment
 */
export async function removeReaction(
  env: Env,
  userEmail: string,
  projectId: string,
  commentId: string
): Promise<Response> {
  try {
    // Verify user exists
    const user = await env.DB.prepare(`
      SELECT userEmail FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Append-only architecture: Insert NULL reaction instead of DELETE
    // First check if user has an active reaction
    const latestReaction = await env.DB.prepare(`
      SELECT reactionType
      FROM reactions
      WHERE targetId = ? AND userEmail = ? AND targetType = 'comment'
      ORDER BY createdAt DESC
      LIMIT 1
    `).bind(commentId, userEmail).first();

    if (!latestReaction || latestReaction.reactionType === null) {
      return errorResponse('REACTION_NOT_FOUND', 'No reaction found to remove');
    }

    // Insert a NULL reaction to mark removal (preserves audit trail)
    const reactionId = generateId('rxn');
    await env.DB.prepare(`
      INSERT INTO reactions (
        reactionId, projectId, targetType, targetId, userEmail, reactionType, createdAt
      ) VALUES (?, ?, ?, ?, ?, NULL, ?)
    `).bind(
      reactionId,
      projectId,
      'comment',
      commentId,
      userEmail,
      Date.now()
    ).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'reaction_removed', 'comment', commentId, {});

    // Get updated reaction statistics
    const stats = await getReactionStatsForComment(env, commentId, userEmail);

    return successResponse({
      reactions: stats.reactions,
      userReaction: stats.userReaction,
      totalReactions: stats.totalReactions
    }, 'Reaction removed successfully');

  } catch (error) {
    console.error('Remove reaction error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to remove reaction');
  }
}

/**
 * Get reaction statistics for a comment
 */
export async function getCommentReactions(
  env: Env,
  userEmail: string,
  projectId: string,
  commentId: string
): Promise<Response> {
  try {
    // Append-only architecture: Get latest reactions using window function
    // Only count non-NULL reactions (NULL = removed)
    const reactions = await env.DB.prepare(`
      WITH latest_reactions AS (
        SELECT
          r.userEmail,
          r.reactionType,
          ROW_NUMBER() OVER (
            PARTITION BY r.userEmail
            ORDER BY r.createdAt DESC
          ) as rn
        FROM reactions r
        WHERE r.targetId = ? AND r.targetType = 'comment'
      )
      SELECT
        lr.reactionType,
        COUNT(*) as count,
        GROUP_CONCAT(u.displayName) as users
      FROM latest_reactions lr
      JOIN users u ON lr.userEmail = u.userEmail
      WHERE lr.rn = 1 AND lr.reactionType IS NOT NULL
      GROUP BY lr.reactionType
    `).bind(commentId).all();

    // Get user's latest reaction
    let userReaction = null;
    const userReactionResult = await env.DB.prepare(`
      SELECT reactionType
      FROM reactions
      WHERE targetId = ? AND userEmail = ? AND targetType = 'comment'
      ORDER BY createdAt DESC
      LIMIT 1
    `).bind(commentId, userEmail).first();

    userReaction = (userReactionResult?.reactionType !== null) ? userReactionResult?.reactionType : null;

    const reactionStats = reactions.results.map(r => ({
      type: r.reactionType,
      count: r.count,
      users: (r.users as string)?.split(',') || []
    }));

    return successResponse({
      commentId,
      reactions: reactionStats,
      userReaction,
      totalReactions: reactionStats.reduce((sum, r) => sum + (r.count as number), 0)
    });

  } catch (error) {
    console.error('Get comment reactions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get comment reactions');
  }
}

/**
 * Get all reactions for multiple comments (batch)
 */
export async function getBatchCommentReactions(
  env: Env,
  userEmail: string,
  projectId: string,
  commentIds: string[]
): Promise<Response> {
  try {
    if (!commentIds || commentIds.length === 0) {
      return successResponse({ reactions: {} });
    }

    // Build placeholders for IN clause
    const placeholders = commentIds.map(() => '?').join(',');

    // Append-only architecture: Get latest reactions using window function
    // Only include non-NULL reactions (NULL = removed)
    const reactions = await env.DB.prepare(`
      WITH latest_reactions AS (
        SELECT
          r.targetId,
          r.reactionType,
          r.userEmail,
          ROW_NUMBER() OVER (
            PARTITION BY r.targetId, r.userEmail
            ORDER BY r.createdAt DESC
          ) as rn
        FROM reactions r
        WHERE r.targetId IN (${placeholders}) AND r.targetType = 'comment'
      )
      SELECT
        lr.targetId,
        lr.reactionType,
        lr.userEmail,
        u.displayName
      FROM latest_reactions lr
      JOIN users u ON lr.userEmail = u.userEmail
      WHERE lr.rn = 1 AND lr.reactionType IS NOT NULL
    `).bind(...commentIds).all();

    // Organize by comment ID
    const reactionsByComment: Record<string, any> = {};

    for (const commentId of commentIds) {
      const commentReactions = reactions.results.filter(r => r.targetId === commentId);

      // Group by type
      const byType: Record<string, any> = {};
      for (const reaction of commentReactions) {
        const type = reaction.reactionType as string;
        if (!byType[type]) {
          byType[type] = {
            type,
            count: 0,
            users: []
          };
        }
        byType[type].count++;
        byType[type].users.push(reaction.displayName);
      }

      // Check user's reaction
      const userReaction = commentReactions.find(r => r.userEmail === userEmail)?.reactionType || null;

      reactionsByComment[commentId] = {
        reactions: Object.values(byType),
        userReaction,
        totalReactions: commentReactions.length
      };
    }

    return successResponse({ reactions: reactionsByComment });

  } catch (error) {
    console.error('Get batch comment reactions error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get batch reactions');
  }
}

// Logging is now handled by centralized utils/logging module
