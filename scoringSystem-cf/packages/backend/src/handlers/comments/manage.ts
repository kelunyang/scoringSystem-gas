/**
 * Comment Management Handlers
 * Migrated from GAS scripts/comments_api.js
 */

import type { Env } from '@/types';
import { successResponse, errorResponse } from '@utils/response';
import { stringifyJSON } from '@utils/json';
import { generateId } from '@utils/id-generator';
import { logProjectOperation } from '@utils/logging';
import { queueBatchNotifications } from '../../queues/notification-producer';
import {
  calculateReactionUsers,
  batchCheckCommentsHaveHelpfulReaction,
  batchCalculateReactionUsers,
  batchCalculateReplyUsers,
  type CommentForBatch,
  type ReplyUserInfo
} from '@utils/commentVotingUtils';
import { isSudoWriteBlocked } from '@utils/sudo-db-proxy';

/**
 * Check if user has permission to reply to a comment
 * Permission rules:
 * - Level 1 (Teacher): Can always reply
 * - Level 3 (Student): Can only reply when stage is 'active' AND one of:
 *   - Is the comment author
 *   - Is directly mentioned in mentionedUsers
 *   - Is mentioned via their group in mentionedGroups
 * Note: Level 0 (Global Admin) does NOT participate in project interactions
 */
/** 一則 reaction 的聚合結果（同一種類型合併計數）。 */
interface ReactionSummary {
  type: string;
  count: number;
  users: Array<string | null>;
}

/** 某則評論的 reaction 統計，加上「當前使用者按了什麼」。 */
interface ReactionAggregate {
  reactions: ReactionSummary[];
  userReaction: string | null;
  totalReactions: number;
}

/** reaction 批次查詢回來的一列。注意沒有 userId——比對使用者要用 userEmail。 */
interface ReactionRow {
  commentId: string;
  reactionType: string;
  userEmail: string;
  displayName: string | null;
}

/** 評論列表查詢回來的一列（root 與 reply 共用同一組欄位）。 */
interface CommentRow {
  commentId: string;
  stageId: string;
  content: string;
  authorEmail: string;
  mentionedGroups: string | null;
  mentionedUsers: string | null;
  parentCommentId: string | null;
  isReply: number;
  replyLevel: number;
  isAwarded: number;
  awardRank: number | null;
  createdTime: number;
  displayName: string | null;
  avatarSeed: string | null;
  avatarStyle: string | null;
  avatarOptions: string | null;
  /** projectviewers 的角色：teacher / observer / member，或 null。 */
  authorRole: string | null;
  /** usergroups 的角色：leader / member，或 null（代表不是組員）。 */
  groupRole: string | null;
  reactionCount: number;
}

/**
 * 組成樹狀結構後回給前端的評論。
 * 由 CommentRow 加上批次查詢的結果拼出來，replies 遞迴掛在同型別上。
 */
interface ThreadedComment {
  commentId: string;
  stageId: string;
  content: string;
  authorEmail: string;
  authorName: string;
  authorAvatarSeed: string | null;
  authorAvatarStyle: string | null;
  authorAvatarOptions: string | null;
  authorRole: string | null;
  isGroupMember: boolean;
  mentionedUsers: string[];
  mentionedGroups: string[];
  reactionUsers: string[];
  replyUsers: ReplyUserInfo[];
  parentCommentId: string | null;
  isReply: boolean;
  replyLevel: number;
  isAwarded: boolean;
  awardRank: number | null;
  createdTime: number;
  reactionCount: number;
  reactions: ReactionSummary[];
  userReaction: string | null;
  canBeVoted: boolean;
  replies: ThreadedComment[];
}

/** getAllStagesComments 針對單一階段回傳的區塊。 */
interface StageCommentsResult {
  comments: ThreadedComment[];
  total: number;
  totalWithReplies: number;
  votingEligible: boolean;
  stageStatus: string;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** checkReplyPermission 會讀到的父評論欄位。 */
interface ParentCommentForPermission {
  authorEmail: string;
  parentCommentId: string | null;
  mentionedGroups: string | null;
  mentionedUsers: string | null;
}

async function checkReplyPermission(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  parentComment: ParentCommentForPermission
): Promise<boolean> {
  try {
    // Get user's permission level via projectviewers
    const viewer = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).first();

    // Level 1 (Teacher) can always reply
    if (viewer && viewer.role === 'teacher') {
      return true;
    }

    // Level 0 (Global Admin) does NOT participate in project interactions
    // No global permission check here

    // For students (Level 3), check stage status from VIEW (auto-calculated)
    const stage = await env.DB.prepare(`
      SELECT status FROM stages_with_status
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    if (!stage || stage.status !== 'active') {
      return false;
    }

    // Check if user is the comment author
    if (parentComment.authorEmail === userEmail) {
      return true;
    }

    // Check if user is directly mentioned in mentionedUsers
    let mentionedUsers: string[] = [];
    if (parentComment.mentionedUsers) {
      try {
        mentionedUsers = JSON.parse(parentComment.mentionedUsers as string);
        if (mentionedUsers.includes(userEmail)) {
          return true;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check if user is in one of the mentionedGroups
    let mentionedGroups: string[] = [];
    if (parentComment.mentionedGroups) {
      try {
        mentionedGroups = JSON.parse(parentComment.mentionedGroups as string);
        if (mentionedGroups.length > 0) {
          // Check if user belongs to any of the mentioned groups
          const placeholders = mentionedGroups.map(() => '?').join(',');
          const userInGroup = await env.DB.prepare(`
            SELECT COUNT(*) as count
            FROM usergroups
            WHERE projectId = ?
              AND userEmail = ?
              AND groupId IN (${placeholders})
              AND isActive = 1
          `).bind(projectId, userEmail, ...mentionedGroups).first();

          if (userInGroup && (userInGroup.count as number) > 0) {
            return true;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // No permission to reply
    return false;

  } catch (error) {
    console.error('Check reply permission error:', error);
    return false;
  }
}

/**
 * Extract mentioned user emails from comment content
 * Matches patterns like @user@example.com or @user.name@domain.com
 */
function extractMentionedUsers(content: string): string[] {
  const emailPattern = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = content.matchAll(emailPattern);
  const emails = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      emails.add(match[1]);
    }
  }

  return Array.from(emails);
}

/**
 * Extract mentioned group IDs from comment content
 * Fetches group names from database and matches against content
 * Uses string search instead of regex to prevent ReDoS attacks
 */
async function extractMentionedGroups(env: Env, content: string, projectId: string): Promise<string[]> {
  try {
    // Get all active groups for this project
    const groups = await env.DB.prepare(`
      SELECT groupId, groupName FROM groups
      WHERE projectId = ? AND status = 'active'
    `).bind(projectId).all<{ groupId: string; groupName: string }>();

    const mentionedGroupIds: string[] = [];
    const contentLower = content.toLowerCase();

    // Check if any group name is mentioned with @ prefix
    for (const group of groups.results) {
      const groupName = group.groupName;
      const groupId = group.groupId;

      // Use indexOf instead of regex to prevent ReDoS
      const searchPattern = `@${groupName.toLowerCase()}`;
      let idx = contentLower.indexOf(searchPattern);

      while (idx !== -1) {
        // Check if followed by word boundary (not alphanumeric, dot, @, or dash)
        const nextIdx = idx + searchPattern.length;
        const nextChar = contentLower[nextIdx];

        if (!nextChar || !/[a-zA-Z0-9.@-]/.test(nextChar)) {
          mentionedGroupIds.push(groupId);
          break; // Found match, no need to continue searching
        }

        // Search for next occurrence
        idx = contentLower.indexOf(searchPattern, idx + 1);
      }
    }

    return mentionedGroupIds;
  } catch (error) {
    console.error('Extract mentioned groups error:', error);
    return [];
  }
}

/**
 * Validate that all mentioned users have active group membership
 * Returns validation result with list of invalid users
 */
async function validateMentionedUsers(
  env: Env,
  projectId: string,
  mentionedUsers: string[]
): Promise<{ valid: boolean; invalidUsers: string[] }> {
  if (!mentionedUsers || mentionedUsers.length === 0) {
    return { valid: true, invalidUsers: [] };
  }

  try {
    // Query usergroups for all mentioned users
    const placeholders = mentionedUsers.map(() => '?').join(',');
    const query = `
      SELECT ug.userEmail, ug.isActive, g.status as groupStatus
      FROM usergroups ug
      INNER JOIN groups g ON ug.groupId = g.groupId
      WHERE ug.userEmail IN (${placeholders})
        AND ug.projectId = ?
        AND ug.isActive = 1
        AND g.status = 'active'
    `;

    const params = [...mentionedUsers, projectId];
    const result = await env.DB.prepare(query).bind(...params).all<{ userEmail: string }>();

    // Check which users are missing from results (no active group membership)
    const validUsers = new Set(result.results?.map(row => row.userEmail) || []);
    const invalidUsers = mentionedUsers.filter(email => !validUsers.has(email));

    return {
      valid: invalidUsers.length === 0,
      invalidUsers
    };
  } catch (error) {
    console.error('Validate mentioned users error:', error);
    // On error, consider all users invalid for safety
    return { valid: false, invalidUsers: mentionedUsers };
  }
}

/**
 * Validate that all mentioned groups are active
 * Returns validation result with list of invalid group IDs
 */
async function validateMentionedGroups(
  env: Env,
  projectId: string,
  mentionedGroupIds: string[]
): Promise<{ valid: boolean; invalidGroups: string[] }> {
  if (!mentionedGroupIds || mentionedGroupIds.length === 0) {
    return { valid: true, invalidGroups: [] };
  }

  try {
    // Query groups table to verify all mentioned groups are active
    const placeholders = mentionedGroupIds.map(() => '?').join(',');
    const query = `
      SELECT groupId, groupName, status
      FROM groups
      WHERE groupId IN (${placeholders})
        AND projectId = ?
        AND status = 'active'
    `;

    const params = [...mentionedGroupIds, projectId];
    const result = await env.DB.prepare(query).bind(...params).all<{ groupId: string }>();

    // Check which groups are missing or inactive
    const validGroups = new Set(result.results?.map(row => row.groupId) || []);
    const invalidGroups = mentionedGroupIds.filter(id => !validGroups.has(id));

    return {
      valid: invalidGroups.length === 0,
      invalidGroups
    };
  } catch (error) {
    console.error('Validate mentioned groups error:', error);
    // On error, consider all groups invalid for safety
    return { valid: false, invalidGroups: mentionedGroupIds };
  }
}

/**
 * Create a comment
 */
export async function createComment(
  env: Env,
  userEmail: string,
  projectId: string,
  commentData: {
    stageId: string;
    content: string;
    parentCommentId?: string; // For replies
  }
): Promise<Response> {
  try {
    // Validate required fields
    if (!commentData.stageId || !commentData.content) {
      return errorResponse('INVALID_INPUT', 'Stage ID and content are required');
    }

    // Get user
    const user = await env.DB.prepare(`
      SELECT displayName FROM users WHERE userEmail = ?
    `).bind(userEmail).first();

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User not found');
    }

    // If replying to a comment, validate parent and check reply permission
    let parentComment: ParentCommentForPermission | null = null;
    if (commentData.parentCommentId) {
      parentComment = await env.DB.prepare(`
        SELECT commentId, parentCommentId, authorEmail, mentionedUsers, mentionedGroups
        FROM comments
        WHERE commentId = ? AND projectId = ?
      `).bind(commentData.parentCommentId, projectId).first();

      if (!parentComment) {
        return errorResponse('PARENT_NOT_FOUND', 'Parent comment not found');
      }

      // Prevent nested replies (only allow single-level replies)
      if (parentComment.parentCommentId) {
        return errorResponse('NESTED_REPLY_NOT_ALLOWED', 'Cannot reply to a reply');
      }

      // Check reply permission
      const canReply = await checkReplyPermission(
        env,
        userEmail,
        projectId,
        commentData.stageId,
        parentComment
      );

      if (!canReply) {
        return errorResponse(
          'REPLY_NOT_ALLOWED',
          'You can only reply to comments where you are the author or have been mentioned'
        );
      }
    }

    // Extract mentions from content
    const mentionedUsers = extractMentionedUsers(commentData.content);
    const directMentionedGroups = await extractMentionedGroups(env, commentData.content, projectId);

    // Validate mentioned users (must have active group membership)
    const userValidation = await validateMentionedUsers(env, projectId, mentionedUsers);
    if (!userValidation.valid) {
      const invalidUsersList = userValidation.invalidUsers.join(', ');
      return errorResponse(
        'INVALID_MENTION',
        `您提及的用戶未加入任何活躍群組: ${invalidUsersList}`
      );
    }

    // Validate mentioned groups (must be active)
    const groupValidation = await validateMentionedGroups(env, projectId, directMentionedGroups);
    if (!groupValidation.valid) {
      return errorResponse(
        'INVALID_MENTION',
        '您提及的群組已停用或不存在'
      );
    }

    // Use only directly mentioned groups (no automatic derivation from users)
    // This ensures clear user intent: @user = only that user, @group = whole group
    const allMentionedGroups = directMentionedGroups;

    // Create comment
    const commentId = generateId('cmt');
    const timestamp = Date.now();

    await env.DB.prepare(`
      INSERT INTO comments (
        commentId, projectId, stageId,
        content, authorEmail, parentCommentId,
        mentionedUsers, mentionedGroups, isReply, replyLevel, createdTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      commentId,
      projectId,
      commentData.stageId,
      commentData.content,
      userEmail,
      commentData.parentCommentId || null,
      stringifyJSON(mentionedUsers),
      stringifyJSON(allMentionedGroups),
      commentData.parentCommentId ? 1 : 0,
      commentData.parentCommentId ? 1 : 0,
      timestamp
    ).run();

    // Log operation
    await logProjectOperation(env, userEmail, projectId, 'comment_created', 'comment', commentId, {
      isReply: !!commentData.parentCommentId,
      contentLength: commentData.content.length,
      contentPreview: commentData.content.substring(0, 200),
      mentionedUsersCount: mentionedUsers.length,
      mentionedGroupsCount: allMentionedGroups.length,
      mentionedUsers: mentionedUsers,
      mentionedGroups: allMentionedGroups
    }, {
      relatedEntities: {
        stage: commentData.stageId,
        ...(commentData.parentCommentId && { parentComment: commentData.parentCommentId })
      }
    });

    // 發送通知
    try {
      const notifications = [];

      // 1. 如果是回覆評論，通知原評論作者
      if (commentData.parentCommentId && parentComment) {
        const parentAuthorEmail = parentComment.authorEmail as string;
        if (parentAuthorEmail !== userEmail) {
          notifications.push({
            targetUserEmail: parentAuthorEmail,
            type: 'comment_replied' as const,
            title: '您的評論收到回覆',
            content: `${user.displayName || userEmail} 回覆了您的評論`,
            projectId,
            stageId: commentData.stageId,
            commentId,
            metadata: { parentCommentId: commentData.parentCommentId }
          });
        }
      }

      // 2. 通知所有被 @ 提及的用戶（排除作者自己）
      if (mentionedUsers.length > 0) {
        for (const mentionedEmail of mentionedUsers) {
          if (mentionedEmail !== userEmail) {
            notifications.push({
              targetUserEmail: mentionedEmail,
              type: 'comment_mentioned' as const,
              title: '有人在評論中提到您',
              content: `${user.displayName || userEmail} 在評論中提到了您`,
              projectId,
              stageId: commentData.stageId,
              commentId
            });
          }
        }
      }

      // 批量發送通知 (via Queue for WebSocket push)
      if (notifications.length > 0) {
        await queueBatchNotifications(env, notifications);
      }
    } catch (error) {
      console.error('[createComment] Failed to send notifications:', error);
      // 通知失敗不應影響評論創建
    }

    return successResponse({
      commentId,
      content: commentData.content,
      authorEmail: userEmail,
      authorName: user.displayName,
      timestamp,
      parentCommentId: commentData.parentCommentId || null
    }, 'Comment created successfully');

  } catch (error) {
    // Re-throw SudoWriteBlockedError to let global handler return proper message
    // Check both instanceof and error properties for robustness across module boundaries
    if (isSudoWriteBlocked(error)) {
      throw error;
    }
    console.error('Create comment error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to create comment');
  }
}

/**
 * Get stage comments (GAS-compatible implementation)
 * Uses actual DB schema: stageId, authorEmail, mentionedGroups
 * Supports pagination for root comments (replies are loaded with their parent)
 */
export async function getStageComments(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  options?: { excludeTeachers?: boolean; forVoting?: boolean; limit?: number; offset?: number }
): Promise<Response> {
  const _startTime = Date.now();
  console.log(`📊 [getStageComments] START: stageId=${stageId}`);

  try {
    const excludeTeachers = options?.excludeTeachers || false;
    const forVoting = options?.forVoting || false;
    // forVoting 模式需要所有評論（投票候選人列表不能分頁），否則使用默認分頁
    const limit = forVoting ? 999999 : (options?.limit ?? 3);  // forVoting: 返回所有評論
    const offset = forVoting ? 0 : (options?.offset ?? 0);

    // Query stage status to conditionally skip unnecessary calculations
    // reactionUsers and replyUsers are only needed in 'active' stage
    const stageInfo = await env.DB.prepare(`
      SELECT status FROM stages_with_status
      WHERE projectId = ? AND stageId = ?
    `).bind(projectId, stageId).first();

    const stageStatus = (stageInfo?.status as string) || 'pending';
    const isActiveStage = stageStatus === 'active';

    // ============ TWO-STEP PAGINATION: Root comments first, then replies ============

    // Step 1: Get total count of root comments (for pagination info)
    let countQuery = `
      SELECT COUNT(*) as totalRootComments
      FROM comments c
      LEFT JOIN projectviewers pv
        ON pv.userEmail = c.authorEmail
        AND pv.projectId = c.projectId
        AND pv.isActive = 1
      WHERE c.projectId = ? AND c.stageId = ? AND c.isReply = 0
    `;
    if (excludeTeachers) {
      countQuery += ` AND (pv.role IS NULL OR pv.role != 'teacher')`;
    }
    const countResult = await env.DB.prepare(countQuery).bind(projectId, stageId).first();
    const totalRootComments = (countResult?.totalRootComments as number) || 0;

    // Step 2: Get paginated root comments (sorted by createdTime DESC - newest first)
    let rootQuery = `
      SELECT
        c.commentId, c.stageId, c.content,
        c.authorEmail, c.mentionedGroups, c.mentionedUsers,
        c.parentCommentId, c.isReply, c.replyLevel,
        c.isAwarded, c.awardRank, c.createdTime,
        u.displayName,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions,
        pv.role as authorRole,
        ug.role as groupRole,
        (
          SELECT COUNT(*)
          FROM (
            SELECT
              userEmail,
              ROW_NUMBER() OVER (PARTITION BY userEmail ORDER BY createdAt DESC) as rn,
              reactionType
            FROM reactions r
            WHERE r.targetId = c.commentId AND r.targetType = 'comment'
          ) latest
          WHERE rn = 1 AND reactionType IS NOT NULL
        ) as reactionCount
      FROM comments c
      LEFT JOIN users u ON u.userEmail = c.authorEmail
      LEFT JOIN projectviewers pv
        ON pv.userEmail = c.authorEmail
        AND pv.projectId = c.projectId
        AND pv.isActive = 1
      LEFT JOIN usergroups ug
        ON ug.userEmail = c.authorEmail
        AND ug.projectId = c.projectId
        AND ug.isActive = 1
        AND (ug.role = 'leader' OR ug.role = 'member')
      WHERE c.projectId = ? AND c.stageId = ? AND c.isReply = 0
    `;

    if (excludeTeachers) {
      rootQuery += ` AND (pv.role IS NULL OR pv.role != 'teacher')`;
    }

    // Sort by createdTime DESC (newest first) with pagination
    rootQuery += ` ORDER BY c.createdTime DESC LIMIT ? OFFSET ?`;

    const rootComments = await env.DB.prepare(rootQuery).bind(projectId, stageId, limit, offset).all<CommentRow>();

    if (!rootComments.results || rootComments.results.length === 0) {
      return successResponse({
        comments: [],
        total: totalRootComments,
        totalWithReplies: 0,
        limit,
        offset,
        hasMore: offset < totalRootComments,
        votingEligible: false
      });
    }

    // Step 3: Get all replies for these root comments (no pagination on replies)
    const rootCommentIds = rootComments.results.map(c => c.commentId as string);
    let repliesResult: { results: CommentRow[] } = { results: [] };

    if (rootCommentIds.length > 0) {
      const placeholders = rootCommentIds.map(() => '?').join(',');
      const repliesQuery = `
        SELECT
          c.commentId, c.stageId, c.content,
          c.authorEmail, c.mentionedGroups, c.mentionedUsers,
          c.parentCommentId, c.isReply, c.replyLevel,
          c.isAwarded, c.awardRank, c.createdTime,
          u.displayName,
          u.avatarSeed,
          u.avatarStyle,
          u.avatarOptions,
          pv.role as authorRole,
          ug.role as groupRole,
          (
            SELECT COUNT(*)
            FROM (
              SELECT
                userEmail,
                ROW_NUMBER() OVER (PARTITION BY userEmail ORDER BY createdAt DESC) as rn,
                reactionType
              FROM reactions r
              WHERE r.targetId = c.commentId AND r.targetType = 'comment'
            ) latest
            WHERE rn = 1 AND reactionType IS NOT NULL
          ) as reactionCount
        FROM comments c
        LEFT JOIN users u ON u.userEmail = c.authorEmail
        LEFT JOIN projectviewers pv
          ON pv.userEmail = c.authorEmail
          AND pv.projectId = c.projectId
          AND pv.isActive = 1
        LEFT JOIN usergroups ug
          ON ug.userEmail = c.authorEmail
          AND ug.projectId = c.projectId
          AND ug.isActive = 1
          AND (ug.role = 'leader' OR ug.role = 'member')
        WHERE c.projectId = ? AND c.parentCommentId IN (${placeholders})
        ORDER BY c.createdTime ASC
      `;

      repliesResult = await env.DB.prepare(repliesQuery).bind(projectId, ...rootCommentIds).all<CommentRow>();
    }

    // Combine root comments and replies for processing
    const comments = {
      results: [...rootComments.results, ...(repliesResult.results || [])]
    };

    // Batch query all reactions for these comments (分批處理避免 SQLite 變數限制)
    const commentIds = comments.results.map(c => c.commentId as string);
    const reactionsByComment: Record<string, ReactionAggregate> = {};

    if (commentIds.length > 0) {
      const MAX_IN_PARAMS = 100; // 保守設定，確保不超過 SQLite 999 限制
      const allReactionsResults: ReactionRow[] = [];

      // 分批查詢 reactions
      for (let i = 0; i < commentIds.length; i += MAX_IN_PARAMS) {
        const batch = commentIds.slice(i, i + MAX_IN_PARAMS);
        const placeholders = batch.map(() => '?').join(',');
        // Append-only architecture: Get latest reactions only
        const batchResult = await env.DB.prepare(`
          WITH latest_reactions AS (
            SELECT
              r.targetId as commentId,
              r.reactionType,
              r.userEmail,
              ROW_NUMBER() OVER (
                PARTITION BY r.targetId, r.userEmail
                ORDER BY r.createdAt DESC
              ) as rn
            FROM reactions r
            WHERE r.targetId IN (${placeholders})
              AND r.targetType = 'comment'
          )
          SELECT
            lr.commentId,
            lr.reactionType,
            lr.userEmail,
            u.displayName
          FROM latest_reactions lr
          JOIN users u ON lr.userEmail = u.userEmail
          WHERE lr.rn = 1 AND lr.reactionType IS NOT NULL
        `).bind(...batch).all<ReactionRow>();

        allReactionsResults.push(...(batchResult.results || []));
      }

      // Organize reactions by comment ID
      for (const commentId of commentIds) {
        const commentReactions = allReactionsResults.filter(r => r.commentId === commentId);

        // Group by type
        const byType: Record<string, ReactionSummary> = {};
        for (const reaction of commentReactions) {
          const type = reaction.reactionType;
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

        // Check user's reaction.
        // 比對 userEmail：上面的 SELECT 只回 commentId / reactionType /
        // userEmail / displayName，沒有 userId。舊版比對 r.userId，永遠是
        // undefined，所以 userReaction 對任何人都是 null。
        const userReaction =
          commentReactions.find(r => r.userEmail === userEmail)?.reactionType || null;

        reactionsByComment[commentId] = {
          reactions: Object.values(byType),
          userReaction,
          totalReactions: commentReactions.length
        };
      }
    }

    // Batch query for helpful reactions (optimization: avoids N+1 queries in the loop)
    const commentsWithHelpfulReaction = commentIds.length > 0
      ? await batchCheckCommentsHaveHelpfulReaction(env.DB, commentIds)
      : new Set<string>();

    // ============ BATCH QUERIES FOR REACTION/REPLY USERS (Optimization: fixes N+1 problem) ============
    // Prepare comments for batch processing
    const commentsForBatch: CommentForBatch[] = (comments.results || []).map(c => ({
      commentId: c.commentId as string,
      authorEmail: c.authorEmail as string,
      mentionedGroups: c.mentionedGroups as string | null,
      mentionedUsers: c.mentionedUsers as string | null
    }));

    // Batch calculate reactionUsers and replyUsers (only for active stages)
    const batchReactionUsersMap = isActiveStage
      ? await batchCalculateReactionUsers(env.DB, projectId, commentsForBatch)
      : new Map<string, string[]>();

    const batchReplyUsersMap = isActiveStage
      ? await batchCalculateReplyUsers(env.DB, projectId, commentsForBatch)
      : new Map<string, ReplyUserInfo[]>();


    // Organize comments into threads
    const commentMap: Record<string, ThreadedComment> = {};
    const rootCommentsArray: ThreadedComment[] = [];

    // First pass: create comment objects with voting metadata
    for (const c of comments.results) {
      // Parse mentionedUsers
      let mentionedUsers: string[] = [];
      if (c.mentionedUsers) {
        try {
          mentionedUsers = JSON.parse(c.mentionedUsers as string);
        } catch (e) {
          console.warn('Failed to parse mentionedUsers:', e);
        }
      }

      // Parse mentionedGroups
      let mentionedGroups: string[] = [];
      if (c.mentionedGroups) {
        try {
          mentionedGroups = JSON.parse(c.mentionedGroups as string);
        } catch (e) {
          console.warn('Failed to parse mentionedGroups:', e);
        }
      }

      // Check if author is a group member (leader or member)
      const isGroupMember = !!(c.groupRole);  // groupRole will be 'leader' or 'member' if user is in usergroups

      // Check if this comment can be voted on (must have mentions AND author is group member AND has helpful reaction)
      const hasMentions = mentionedGroups.length > 0 || mentionedUsers.length > 0;

      // Quality gate: Check if comment has at least 1 helpful reaction (using batch query result - O(1) lookup)
      const hasHelpfulReaction = commentsWithHelpfulReaction.has(c.commentId as string);

      const canBeVoted = !c.isReply && hasMentions && isGroupMember && hasHelpfulReaction;

      // Get reactionUsers and replyUsers from batch query result (O(1) lookup, fixes N+1 problem)
      const commentId = c.commentId as string;
      const reactionUsers = batchReactionUsersMap.get(commentId) || [];
      const replyUsers = batchReplyUsersMap.get(commentId) || [];

      // Get reaction data from batch query
      const reactionData = reactionsByComment[commentId] || {
        reactions: [],
        userReaction: null,
        totalReactions: 0
      };

      const comment = {
        commentId: c.commentId,
        stageId: c.stageId,
        content: c.content,
        authorEmail: c.authorEmail,
        authorName: c.displayName || (c.authorEmail as string).split('@')[0],
        authorAvatarSeed: c.avatarSeed,
        authorAvatarStyle: c.avatarStyle,
        authorAvatarOptions: c.avatarOptions,
        authorRole: c.authorRole || null,  // Role from projectviewers (teacher, observer, member, or null)
        isGroupMember,  // NEW: Whether author is a group leader or member
        mentionedUsers,
        mentionedGroups,
        reactionUsers,  // Students who can give reactions (filtered, excluding teachers and author)
        replyUsers,     // Users who can reply (mentionedUsers + expanded mentionedGroups)
        parentCommentId: c.parentCommentId,
        isReply: !!c.isReply,
        replyLevel: c.replyLevel || 0,
        isAwarded: !!c.isAwarded,
        awardRank: c.awardRank,
        createdTime: c.createdTime,
        reactionCount: reactionData.totalReactions,  // From batch query
        reactions: reactionData.reactions,  // NEW: Array of {type, count, users[]}
        userReaction: reactionData.userReaction,  // NEW: Current user's reaction type or null
        canBeVoted,  // Voting eligibility flag (now includes group membership check)
        replies: []
      };

      commentMap[c.commentId as string] = comment;

      if (!c.isReply && !c.parentCommentId) {
        rootCommentsArray.push(comment);
      }
    }

    // Second pass: organize replies
    for (const comment of Object.values(commentMap)) {
      if (comment.parentCommentId && commentMap[comment.parentCommentId]) {
        commentMap[comment.parentCommentId].replies.push(comment);
      }
    }

    // Check if current user is eligible to vote
    let votingEligible = false;
    const userCommentsResult = await env.DB.prepare(`
      SELECT commentId, mentionedGroups
      FROM comments
      WHERE projectId = ? AND stageId = ? AND authorEmail = ? AND isReply = 0
    `).bind(projectId, stageId, userEmail).all();

    if (userCommentsResult.results && userCommentsResult.results.length > 0) {
      // Check if user has mentioned at least one group
      for (const userComment of userCommentsResult.results) {
        if (userComment.mentionedGroups) {
          try {
            const groups = JSON.parse(userComment.mentionedGroups as string);
            if (Array.isArray(groups) && groups.length > 0) {
              votingEligible = true;
              break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // 当 forVoting=true 时，按作者去重：每位作者只保留一篇代表评论
    // 规则：helpful reaction 最多 > createdTime 最早
    if (forVoting) {
      const uniqueByAuthor = new Map<string, typeof rootCommentsArray[0]>();

      for (const comment of rootCommentsArray) {
        if (!comment.canBeVoted) continue;

        const existing = uniqueByAuthor.get(comment.authorEmail);
        if (!existing) {
          uniqueByAuthor.set(comment.authorEmail, comment);
        } else {
          // 比较 helpful reaction 数量
          const existingHelpful = existing.reactions?.find(r => r.type === 'helpful')?.count || 0;
          const currentHelpful = comment.reactions?.find(r => r.type === 'helpful')?.count || 0;

          if (currentHelpful > existingHelpful ||
              (currentHelpful === existingHelpful && comment.createdTime < existing.createdTime)) {
            uniqueByAuthor.set(comment.authorEmail, comment);
          }
        }
      }

      // 将未被选中的评论标记为 canBeVoted = false
      const selectedCommentIds = new Set([...uniqueByAuthor.values()].map(c => c.commentId));
      for (const comment of rootCommentsArray) {
        if (comment.canBeVoted && !selectedCommentIds.has(comment.commentId)) {
          comment.canBeVoted = false;
        }
      }
    }

    // Calculate hasMore based on pagination
    const loadedRootCount = offset + rootCommentsArray.length;
    const hasMore = loadedRootCount < totalRootComments;

    console.log(`📊 [getStageComments] DONE: stageId=${stageId}, totalTime=${Date.now() - _startTime}ms, rootComments=${rootCommentsArray.length}, total=${totalRootComments}, hasMore=${hasMore}`);

    return successResponse({
      comments: rootCommentsArray,
      total: totalRootComments,  // Total root comments (for pagination)
      totalWithReplies: comments.results.length,  // All comments including replies in this batch
      votingEligible,  // Add voting eligibility for current user
      limit,
      offset,
      hasMore
    });

  } catch (error) {
    console.error('Get stage comments error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('SYSTEM_ERROR', `Failed to get stage comments: ${errorMessage}`);
  }
}

/**
 * Get single comment details
 */
export async function getCommentDetails(
  env: Env,
  userEmail: string,
  projectId: string,
  commentId: string
): Promise<Response> {
  try {
    const comment = await env.DB.prepare(`
      SELECT
        c.commentId, c.stageId, c.content,
        c.parentCommentId, c.createdTime,
        c.authorEmail, c.mentionedGroups, c.mentionedUsers,
        u.displayName,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions
      FROM comments c
      LEFT JOIN users u ON c.authorEmail = u.userEmail
      WHERE c.commentId = ? AND c.projectId = ?
    `).bind(commentId, projectId).first();

    if (!comment) {
      return errorResponse('COMMENT_NOT_FOUND', 'Comment not found');
    }

    // Calculate reactionUsers (students who can react to this comment)
    const reactionUsers = await calculateReactionUsers(
      env.DB,
      projectId,
      comment.mentionedGroups as string | null,
      comment.mentionedUsers as string | null,
      comment.authorEmail as string
    );

    // Get reactions
    const reactions = await env.DB.prepare(`
      SELECT
        r.reactionType,
        u.userEmail, u.displayName
      FROM reactions r
      JOIN users u ON r.userEmail = u.userEmail
      WHERE r.targetType = 'comment' AND r.targetId = ?
    `).bind(commentId).all();

    // Get replies
    const replies = await env.DB.prepare(`
      SELECT
        c.commentId, c.content, c.createdTime,
        c.authorEmail, u.displayName,
        u.avatarSeed,
        u.avatarStyle,
        u.avatarOptions
      FROM comments c
      LEFT JOIN users u ON c.authorEmail = u.userEmail
      WHERE c.parentCommentId = ? AND c.projectId = ?
      ORDER BY c.createdTime ASC
    `).bind(commentId, projectId).all();

    const commentData = {
      commentId: comment.commentId,
      stageId: comment.stageId,
      content: comment.content,
      authorEmail: comment.authorEmail,
      authorName: comment.displayName,
      authorAvatarSeed: comment.avatarSeed,
      authorAvatarStyle: comment.avatarStyle,
      authorAvatarOptions: comment.avatarOptions,
      createdTime: comment.createdTime,
      parentCommentId: comment.parentCommentId,
      reactionUsers,  // NEW: Students who can give reactions
      reactions: reactions.results?.map(r => ({
        type: r.reactionType,
        userEmail: r.userEmail,
        displayName: r.displayName
      })) || [],
      replies: replies.results?.map(r => ({
        commentId: r.commentId,
        content: r.content,
        authorEmail: r.authorEmail,
        authorName: r.displayName,
        authorAvatarSeed: r.avatarSeed,
        authorAvatarStyle: r.avatarStyle,
        authorAvatarOptions: r.avatarOptions,
        createdTime: r.createdTime
      })) || []
    };

    return successResponse(commentData);

  } catch (error) {
    console.error('Get comment details error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get comment details');
  }
}

// Logging is now handled by centralized utils/logging module

/**
 * Get comments for all stages in a single request (batch API)
 * Optimizes N API calls to 1, with shared permission checks
 * Supports pagination for root comments (same limit/offset applied to all stages)
 *
 * @param env - Environment bindings
 * @param userEmail - Current user's email
 * @param projectId - Project ID
 * @param stageIds - Array of stage IDs to fetch comments for
 * @param options - Optional: excludeTeachers, forVoting, limit, offset flags
 * @returns Response with comments grouped by stageId
 */
export async function getAllStagesComments(
  env: Env,
  userEmail: string,
  projectId: string,
  stageIds: string[],
  options?: { excludeTeachers?: boolean; forVoting?: boolean; limit?: number; offset?: number }
): Promise<Response> {
  const _startTime = Date.now();
  const _metrics: Record<string, number> = {};

  try {
    const excludeTeachers = options?.excludeTeachers || false;
    const forVoting = options?.forVoting || false;
    const limit = options?.limit ?? 3;  // Default: 3 root comments per stage
    const offset = options?.offset ?? 0;

    console.log(`📊 [getAllStagesComments] START: stageCount=${stageIds.length}, excludeTeachers=${excludeTeachers}, forVoting=${forVoting}, limit=${limit}, offset=${offset}`);

    // Batch query: Get all stages' status in one query
    let _t0 = Date.now();
    _t0 = Date.now();
    const stageIdsPlaceholders = stageIds.map(() => '?').join(',');
    const stagesStatusResult = await env.DB.prepare(`
      SELECT stageId, status FROM stages_with_status
      WHERE projectId = ? AND stageId IN (${stageIdsPlaceholders})
    `).bind(projectId, ...stageIds).all();
    _metrics['2_getStagesStatus'] = Date.now() - _t0;

    const stageStatusMap: Record<string, string> = {};
    for (const stage of stagesStatusResult.results || []) {
      stageStatusMap[stage.stageId as string] = stage.status as string;
    }

    // ============ TWO-STEP PAGINATION PER STAGE ============

    // Step 1: Get total count of root comments per stage
    _t0 = Date.now();
    let countQuery = `
      SELECT c.stageId, COUNT(*) as totalRootComments
      FROM comments c
      LEFT JOIN projectviewers pv
        ON pv.userEmail = c.authorEmail
        AND pv.projectId = c.projectId
        AND pv.isActive = 1
      WHERE c.projectId = ? AND c.stageId IN (${stageIdsPlaceholders}) AND c.isReply = 0
    `;
    if (excludeTeachers) {
      countQuery += ` AND (pv.role IS NULL OR pv.role != 'teacher')`;
    }
    countQuery += ` GROUP BY c.stageId`;

    const countsResult = await env.DB.prepare(countQuery).bind(projectId, ...stageIds).all();
    const totalRootCommentsByStage: Record<string, number> = {};
    for (const row of countsResult.results || []) {
      totalRootCommentsByStage[row.stageId as string] = row.totalRootComments as number;
    }
    _metrics['2b_getRootCounts'] = Date.now() - _t0;

    // Step 2c: Check user's voting eligibility per stage (independent of pagination)
    // This query checks if the current user has ANY valid comment (canBeVoted) in each stage
    // canBeVoted conditions: !isReply && hasMentions && isGroupMember && hasHelpfulReaction
    _t0 = Date.now();
    const userVotingEligibilityResult = await env.DB.prepare(`
      SELECT DISTINCT c.stageId
      FROM comments c
      -- Check if author is a group member (leader or member)
      INNER JOIN usergroups ug
        ON ug.projectId = c.projectId
        AND ug.userEmail = c.authorEmail
        AND ug.isActive = 1
        AND (ug.role = 'leader' OR ug.role = 'member')
      -- Check if comment has helpful reaction
      INNER JOIN (
        SELECT DISTINCT targetId as commentId
        FROM reactions
        WHERE targetType = 'comment' AND reactionType = 'helpful'
      ) helpful ON helpful.commentId = c.commentId
      WHERE c.projectId = ?
        AND c.stageId IN (${stageIdsPlaceholders})
        AND c.authorEmail = ?
        AND c.isReply = 0
        -- Check has mentions (mentionedGroups or mentionedUsers not empty)
        AND (
          (c.mentionedGroups IS NOT NULL AND c.mentionedGroups != '' AND c.mentionedGroups != '[]')
          OR (c.mentionedUsers IS NOT NULL AND c.mentionedUsers != '' AND c.mentionedUsers != '[]')
        )
    `).bind(projectId, ...stageIds, userEmail).all();

    const userVotingEligibleStages = new Set<string>(
      (userVotingEligibilityResult.results || []).map(r => r.stageId as string)
    );
    _metrics['2c_checkVotingEligibility'] = Date.now() - _t0;
    console.log(`📊 [getAllStagesComments] User voting eligible in stages: [${[...userVotingEligibleStages].join(', ')}]`);

    // Step 2: Get paginated root comments for all stages using ROW_NUMBER()
    // This approach gets the N-th through M-th root comments per stage in a single query
    _t0 = Date.now();
    let rootCommentsQuery = `
      WITH ranked_root_comments AS (
        SELECT
          c.commentId, c.stageId, c.content,
          c.authorEmail, c.mentionedGroups, c.mentionedUsers,
          c.parentCommentId, c.isReply, c.replyLevel,
          c.isAwarded, c.awardRank, c.createdTime,
          u.displayName,
          u.avatarSeed,
          u.avatarStyle,
          u.avatarOptions,
          pv.role as authorRole,
          ug.role as groupRole,
          ROW_NUMBER() OVER (PARTITION BY c.stageId ORDER BY c.createdTime DESC) as rn,
          (
            SELECT COUNT(*)
            FROM (
              SELECT
                userEmail,
                ROW_NUMBER() OVER (PARTITION BY userEmail ORDER BY createdAt DESC) as rn2,
                reactionType
              FROM reactions r
              WHERE r.targetId = c.commentId AND r.targetType = 'comment'
            ) latest
            WHERE rn2 = 1 AND reactionType IS NOT NULL
          ) as reactionCount
        FROM comments c
        LEFT JOIN users u ON u.userEmail = c.authorEmail
        LEFT JOIN projectviewers pv
          ON pv.userEmail = c.authorEmail
          AND pv.projectId = c.projectId
          AND pv.isActive = 1
        LEFT JOIN usergroups ug
          ON ug.userEmail = c.authorEmail
          AND ug.projectId = c.projectId
          AND ug.isActive = 1
          AND (ug.role = 'leader' OR ug.role = 'member')
        WHERE c.projectId = ? AND c.stageId IN (${stageIdsPlaceholders}) AND c.isReply = 0
    `;

    if (excludeTeachers) {
      rootCommentsQuery += ` AND (pv.role IS NULL OR pv.role != 'teacher')`;
    }

    rootCommentsQuery += `
      )
      SELECT * FROM ranked_root_comments
      WHERE rn > ? AND rn <= ?
      ORDER BY stageId, createdTime DESC
    `;

    // offset+1 to limit+offset for ROW_NUMBER (1-based)
    const rootCommentsResult = await env.DB.prepare(rootCommentsQuery)
      .bind(projectId, ...stageIds, offset, offset + limit)
      .all<CommentRow>();

    // Step 3: Get all replies for these root comments
    const paginatedRootCommentIds = (rootCommentsResult.results || []).map(c => c.commentId as string);
    let repliesResult: { results: CommentRow[] } = { results: [] };

    if (paginatedRootCommentIds.length > 0) {
      const replyPlaceholders = paginatedRootCommentIds.map(() => '?').join(',');
      const repliesQuery = `
        SELECT
          c.commentId, c.stageId, c.content,
          c.authorEmail, c.mentionedGroups, c.mentionedUsers,
          c.parentCommentId, c.isReply, c.replyLevel,
          c.isAwarded, c.awardRank, c.createdTime,
          u.displayName,
          u.avatarSeed,
          u.avatarStyle,
          u.avatarOptions,
          pv.role as authorRole,
          ug.role as groupRole,
          (
            SELECT COUNT(*)
            FROM (
              SELECT
                userEmail,
                ROW_NUMBER() OVER (PARTITION BY userEmail ORDER BY createdAt DESC) as rn,
                reactionType
              FROM reactions r
              WHERE r.targetId = c.commentId AND r.targetType = 'comment'
            ) latest
            WHERE rn = 1 AND reactionType IS NOT NULL
          ) as reactionCount
        FROM comments c
        LEFT JOIN users u ON u.userEmail = c.authorEmail
        LEFT JOIN projectviewers pv
          ON pv.userEmail = c.authorEmail
          AND pv.projectId = c.projectId
          AND pv.isActive = 1
        LEFT JOIN usergroups ug
          ON ug.userEmail = c.authorEmail
          AND ug.projectId = c.projectId
          AND ug.isActive = 1
          AND (ug.role = 'leader' OR ug.role = 'member')
        WHERE c.projectId = ? AND c.parentCommentId IN (${replyPlaceholders})
        ORDER BY c.createdTime ASC
      `;
      repliesResult = await env.DB.prepare(repliesQuery).bind(projectId, ...paginatedRootCommentIds).all<CommentRow>();
    }

    // Combine root comments and replies
    const allComments = {
      results: [...(rootCommentsResult.results || []), ...(repliesResult.results || [])]
    };
    _metrics['3_getAllComments'] = Date.now() - _t0;
    console.log(`📊 [getAllStagesComments] Comments fetched: root=${paginatedRootCommentIds.length}, replies=${repliesResult.results?.length || 0}`);

    // Collect all comment IDs for batch reactions query
    const allCommentIds = (allComments.results || []).map(c => c.commentId as string);

    // Batch query: Get all reactions for all comments (分批處理避免 SQLite 變數限制)
    _t0 = Date.now();
    const reactionsByComment: Record<string, ReactionAggregate> = {};
    if (allCommentIds.length > 0) {
      const MAX_IN_PARAMS = 100; // 保守設定，確保不超過 SQLite 999 限制
      const allReactionsResults: ReactionRow[] = [];

      // 分批查詢 reactions
      for (let i = 0; i < allCommentIds.length; i += MAX_IN_PARAMS) {
        const batch = allCommentIds.slice(i, i + MAX_IN_PARAMS);
        const commentIdsPlaceholders = batch.map(() => '?').join(',');
        const batchResult = await env.DB.prepare(`
          WITH latest_reactions AS (
            SELECT
              r.targetId as commentId,
              r.reactionType,
              r.userEmail,
              ROW_NUMBER() OVER (
                PARTITION BY r.targetId, r.userEmail
                ORDER BY r.createdAt DESC
              ) as rn
            FROM reactions r
            WHERE r.targetId IN (${commentIdsPlaceholders})
              AND r.targetType = 'comment'
          )
          SELECT
            lr.commentId,
            lr.reactionType,
            lr.userEmail,
            u.displayName
          FROM latest_reactions lr
          JOIN users u ON lr.userEmail = u.userEmail
          WHERE lr.rn = 1 AND lr.reactionType IS NOT NULL
        `).bind(...batch).all<ReactionRow>();

        allReactionsResults.push(...(batchResult.results || []));
      }

      // Organize reactions by comment ID
      for (const commentId of allCommentIds) {
        const commentReactions = allReactionsResults.filter(r => r.commentId === commentId);

        // Group by type
        const byType: Record<string, ReactionSummary> = {};
        for (const reaction of commentReactions) {
          const type = reaction.reactionType;
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
        const userReaction =
          commentReactions.find(r => r.userEmail === userEmail)?.reactionType || null;

        reactionsByComment[commentId] = {
          reactions: Object.values(byType),
          userReaction,
          totalReactions: commentReactions.length
        };
      }
    }
    _metrics['4_getReactions'] = Date.now() - _t0;

    // Batch query for helpful reactions (optimization: avoids N+1 queries in the loop)
    const commentsWithHelpfulReaction = allCommentIds.length > 0
      ? await batchCheckCommentsHaveHelpfulReaction(env.DB, allCommentIds)
      : new Set<string>();

    // Group comments by stageId and process each stage
    _t0 = Date.now();
    const resultsByStage: Record<string, StageCommentsResult> = {};

    // Initialize all stages (even empty ones) with pagination info
    for (const stageId of stageIds) {
      const totalRoot = totalRootCommentsByStage[stageId] || 0;
      resultsByStage[stageId] = {
        comments: [],
        total: totalRoot,
        totalWithReplies: 0,
        votingEligible: false,
        stageStatus: stageStatusMap[stageId] || 'pending',
        limit,
        offset,
        hasMore: (offset + limit) < totalRoot
      };
    }

    // Group raw comments by stageId
    const commentsByStage: Record<string, CommentRow[]> = {};
    for (const comment of allComments.results || []) {
      const stageId = comment.stageId as string;
      if (!commentsByStage[stageId]) {
        commentsByStage[stageId] = [];
      }
      commentsByStage[stageId].push(comment);
    }

    // ============ BATCH QUERIES FOR REACTION/REPLY USERS (Optimization: fixes N+1 problem) ============
    // Prepare ALL comments for batch processing (across all stages)
    const allCommentsForBatch: CommentForBatch[] = (allComments.results || []).map(c => ({
      commentId: c.commentId as string,
      authorEmail: c.authorEmail as string,
      mentionedGroups: c.mentionedGroups as string | null,
      mentionedUsers: c.mentionedUsers as string | null
    }));

    // Batch calculate reactionUsers and replyUsers for ALL comments at once
    // This converts N*M queries (N stages * M comments per stage) into just 2 queries
    const batchReactionUsersMap = await batchCalculateReactionUsers(env.DB, projectId, allCommentsForBatch);
    const batchReplyUsersMap = await batchCalculateReplyUsers(env.DB, projectId, allCommentsForBatch);


    // Process each stage's comments
    for (const stageId of stageIds) {
      const stageComments = commentsByStage[stageId] || [];
      const stageStatus = stageStatusMap[stageId] || 'pending';
      const isActiveStage = stageStatus === 'active';

      const commentMap: Record<string, ThreadedComment> = {};
      const rootComments: ThreadedComment[] = [];

      // First pass: create comment objects
      for (const c of stageComments) {
        // Parse mentionedUsers
        let mentionedUsers: string[] = [];
        if (c.mentionedUsers) {
          try {
            mentionedUsers = JSON.parse(c.mentionedUsers as string);
          } catch (e) {
            console.warn('Failed to parse mentionedUsers:', e);
          }
        }

        // Parse mentionedGroups
        let mentionedGroups: string[] = [];
        if (c.mentionedGroups) {
          try {
            mentionedGroups = JSON.parse(c.mentionedGroups as string);
          } catch (e) {
            console.warn('Failed to parse mentionedGroups:', e);
          }
        }

        // Check if author is a group member
        const isGroupMember = !!(c.groupRole);

        // Check if this comment can be voted on
        const hasMentions = mentionedGroups.length > 0 || mentionedUsers.length > 0;
        // Quality gate: Check if comment has at least 1 helpful reaction (using batch query result - O(1) lookup)
        const hasHelpfulReaction = commentsWithHelpfulReaction.has(c.commentId as string);
        const canBeVoted = !c.isReply && hasMentions && isGroupMember && hasHelpfulReaction;

        // Get reactionUsers and replyUsers from batch query result (O(1) lookup, fixes N+1 problem)
        // Only use batch results for active stages (non-active stages return empty arrays)
        const commentId = c.commentId as string;
        const reactionUsers = isActiveStage
          ? (batchReactionUsersMap.get(commentId) || [])
          : [];
        const replyUsers = isActiveStage
          ? (batchReplyUsersMap.get(commentId) || [])
          : [];

        // Get reaction data from batch query
        const reactionData = reactionsByComment[commentId] || {
          reactions: [],
          userReaction: null,
          totalReactions: 0
        };

        const comment = {
          commentId: c.commentId,
          stageId: c.stageId,
          content: c.content,
          authorEmail: c.authorEmail,
          authorName: c.displayName || (c.authorEmail as string).split('@')[0],
          authorAvatarSeed: c.avatarSeed,
          authorAvatarStyle: c.avatarStyle,
          authorAvatarOptions: c.avatarOptions,
          authorRole: c.authorRole || null,
          isGroupMember,
          mentionedUsers,
          mentionedGroups,
          reactionUsers,
          replyUsers,
          parentCommentId: c.parentCommentId,
          isReply: !!c.isReply,
          replyLevel: c.replyLevel || 0,
          isAwarded: !!c.isAwarded,
          awardRank: c.awardRank,
          createdTime: c.createdTime,
          reactionCount: reactionData.totalReactions,
          reactions: reactionData.reactions,
          userReaction: reactionData.userReaction,
          canBeVoted,
          replies: []
        };

        commentMap[c.commentId as string] = comment;

        if (!c.isReply && !c.parentCommentId) {
          rootComments.push(comment);
        }
      }

      // Second pass: organize replies
      for (const comment of Object.values(commentMap)) {
        if (comment.parentCommentId && commentMap[comment.parentCommentId]) {
          commentMap[comment.parentCommentId].replies.push(comment);
        }
      }

      // Use pre-calculated voting eligibility (from Step 2c query, not affected by pagination)
      // This checks if user has ANY comment with canBeVoted === true in this stage
      const votingEligible = userVotingEligibleStages.has(stageId);

      // Apply forVoting deduplication if needed
      if (forVoting) {
        const uniqueByAuthor = new Map<string, typeof rootComments[0]>();

        for (const comment of rootComments) {
          if (!comment.canBeVoted) continue;

          const existing = uniqueByAuthor.get(comment.authorEmail);
          if (!existing) {
            uniqueByAuthor.set(comment.authorEmail, comment);
          } else {
            const existingHelpful = existing.reactions?.find(r => r.type === 'helpful')?.count || 0;
            const currentHelpful = comment.reactions?.find(r => r.type === 'helpful')?.count || 0;

            if (currentHelpful > existingHelpful ||
                (currentHelpful === existingHelpful && comment.createdTime < existing.createdTime)) {
              uniqueByAuthor.set(comment.authorEmail, comment);
            }
          }
        }

        const selectedCommentIds = new Set([...uniqueByAuthor.values()].map(c => c.commentId));
        for (const comment of rootComments) {
          if (comment.canBeVoted && !selectedCommentIds.has(comment.commentId)) {
            comment.canBeVoted = false;
          }
        }
      }

      // Calculate hasMore for this stage
      const totalRoot = totalRootCommentsByStage[stageId] || 0;
      const loadedRootCount = offset + rootComments.length;
      const hasMore = loadedRootCount < totalRoot;

      resultsByStage[stageId] = {
        comments: rootComments,
        total: totalRoot,  // Total root comments in this stage
        totalWithReplies: stageComments.length,  // Comments + replies in this batch
        votingEligible,
        stageStatus,
        limit,
        offset,
        hasMore
      };
    }
    _metrics['5_processComments'] = Date.now() - _t0;
    _metrics['TOTAL'] = Date.now() - _startTime;

    // Log timing metrics
    console.log(`📊 [getAllStagesComments] METRICS:`, JSON.stringify(_metrics));
    console.log(`📊 [getAllStagesComments] DONE: totalTime=${_metrics['TOTAL']}ms, stages=${stageIds.length}, comments=${allCommentIds.length}`);

    return successResponse({
      stageComments: resultsByStage,
      limit,
      offset
    });

  } catch (error) {
    console.error('Get all stages comments error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorResponse('SYSTEM_ERROR', `Failed to get all stages comments: ${errorMessage}`);
  }
}
