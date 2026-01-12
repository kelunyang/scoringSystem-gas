/**
 * 評論投票系統 - 共享工具函數
 * 用於教師投票和學生投票共用的驗證邏輯
 */


/**
 * 檢查用戶是否為專案的 Group Leader 或 Member
 */
export async function checkUserGroupMembership(
  db: D1Database,
  projectId: string,
  userEmail: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT COUNT(*) as count
    FROM usergroups
    WHERE projectId = ?
      AND userEmail = ?
      AND (role = 'leader' OR role = 'member')
      AND isActive = 1
  `).bind(projectId, userEmail).first<{ count: number }>();

  return (result?.count ?? 0) > 0;
}

/**
 * 計算可以對此評論給予反應的學生列表
 *
 * @param db - D1 Database instance
 * @param projectId - Project ID
 * @param mentionedGroups - 被提及的群組 ID 列表（JSON string）
 * @param mentionedUsers - 被提及的使用者 email 列表（JSON string）
 * @param authorEmail - 評論作者（需排除）
 * @returns 學生 email 列表（已去重、已過濾老師、已排除作者）
 */
export async function calculateReactionUsers(
  db: D1Database,
  projectId: string,
  mentionedGroups: string | null,
  mentionedUsers: string | null,
  authorEmail: string
): Promise<string[]> {
  const reactionUsers = new Set<string>();

  console.log('[calculateReactionUsers] 開始計算 reactionUsers:', {
    projectId,
    mentionedGroups,
    mentionedUsers,
    authorEmail
  });

  // 1. 處理 mentionedUsers（過濾出學生）
  if (mentionedUsers) {
    try {
      const users = JSON.parse(mentionedUsers);
      if (Array.isArray(users)) {
        for (const email of users) {
          // 跳過作者
          if (email === authorEmail) {
            console.log(`[calculateReactionUsers] 跳過作者: ${email}`);
            continue;
          }

          // 檢查是否為學生：
          // 1. 在 usergroups 中存在（學生）
          // 2. 不在 projectviewers 中以 teacher/observer 角色存在
          const isStudent = await db.prepare(`
            SELECT COUNT(*) as count
            FROM usergroups ug
            WHERE ug.projectId = ?
              AND ug.userEmail = ?
              AND ug.isActive = 1
              AND NOT EXISTS (
                SELECT 1 FROM projectviewers pv
                WHERE pv.projectId = ug.projectId
                  AND pv.userEmail = ug.userEmail
                  AND pv.role IN ('teacher', 'observer')
                  AND pv.isActive = 1
              )
          `).bind(projectId, email).first<{ count: number }>();

          if (isStudent && isStudent.count > 0) {
            reactionUsers.add(email);
            console.log(`[calculateReactionUsers] ✅ 加入學生: ${email}`);
          } else {
            console.log(`[calculateReactionUsers] ❌ 非學生或不在項目中: ${email}`);
          }
        }
      }
    } catch (e) {
      // JSON parse error, skip
      console.warn('[calculateReactionUsers] Failed to parse mentionedUsers:', e);
    }
  }

  // 2. 處理 mentionedGroups（展開為學生成員列表）
  if (mentionedGroups) {
    try {
      const groups = JSON.parse(mentionedGroups);

      if (Array.isArray(groups) && groups.length > 0) {
        // 批次查詢所有群組的學生成員（排除 teacher/observer）
        const placeholders = groups.map(() => '?').join(',');
        const members = await db.prepare(`
          SELECT DISTINCT ug.userEmail
          FROM usergroups ug
          WHERE ug.projectId = ?
            AND ug.groupId IN (${placeholders})
            AND ug.isActive = 1
            AND NOT EXISTS (
              SELECT 1 FROM projectviewers pv
              WHERE pv.projectId = ug.projectId
                AND pv.userEmail = ug.userEmail
                AND pv.role IN ('teacher', 'observer')
                AND pv.isActive = 1
            )
        `).bind(projectId, ...groups).all<{ userEmail: string }>();

        console.log(`[calculateReactionUsers] 從群組 ${groups.join(', ')} 找到 ${members.results?.length || 0} 個學生成員`);

        for (const member of members.results || []) {
          if (member.userEmail !== authorEmail) {
            reactionUsers.add(member.userEmail);
            console.log(`[calculateReactionUsers] ✅ 從群組加入學生: ${member.userEmail}`);
          } else {
            console.log(`[calculateReactionUsers] 跳過作者（來自群組）: ${member.userEmail}`);
          }
        }
      }
    } catch (e) {
      // JSON parse error, skip
      console.warn('[calculateReactionUsers] Failed to parse mentionedGroups:', e);
    }
  }

  const result = Array.from(reactionUsers);
  console.log(`[calculateReactionUsers] 最終結果: ${result.length} 個學生可以 react:`, result);
  return result;
}

/**
 * 回覆用戶資訊結構
 * 用於前端 AvatarGroup 組件顯示
 */
export interface ReplyUserInfo {
  userEmail: string;
  displayName: string;
  avatarSeed: string | null;
  avatarStyle: string | null;
  avatarOptions: string | null;
  role: 'member';  // mentions 沒有 leader 概念，全部是 member
}

/**
 * 計算可以回覆此評論的用戶列表（返回完整用戶資訊）
 * 與 calculateReactionUsers 不同：
 * - 不過濾教師（教師也可以被 mention）
 * - 不排除作者（作者可以回覆自己）
 * - 返回完整用戶對象（包含頭像資訊），供前端 AvatarGroup 使用
 *
 * @param db - D1 Database instance
 * @param projectId - Project ID
 * @param mentionedGroups - 被提及的群組 ID 列表（JSON string）
 * @param mentionedUsers - 被提及的使用者 email 列表（JSON string）
 * @returns 用戶資訊列表（已去重，包含頭像資訊）
 */
export async function calculateReplyUsers(
  db: D1Database,
  projectId: string,
  mentionedGroups: string | null,
  mentionedUsers: string | null
): Promise<ReplyUserInfo[]> {
  const replyUsersMap = new Map<string, ReplyUserInfo>();

  // 1. 處理 mentionedUsers（查詢完整用戶資訊）
  if (mentionedUsers) {
    try {
      const users = JSON.parse(mentionedUsers);
      if (Array.isArray(users) && users.length > 0) {
        const placeholders = users.map(() => '?').join(',');
        const userInfos = await db.prepare(`
          SELECT userEmail, displayName, avatarSeed, avatarStyle, avatarOptions
          FROM users
          WHERE userEmail IN (${placeholders})
        `).bind(...users).all<{
          userEmail: string;
          displayName: string | null;
          avatarSeed: string | null;
          avatarStyle: string | null;
          avatarOptions: string | null;
        }>();

        for (const u of userInfos.results || []) {
          replyUsersMap.set(u.userEmail, {
            userEmail: u.userEmail,
            displayName: u.displayName || u.userEmail.split('@')[0],
            avatarSeed: u.avatarSeed,
            avatarStyle: u.avatarStyle,
            avatarOptions: u.avatarOptions,
            role: 'member'
          });
        }
      }
    } catch (e) {
      // JSON parse error, skip
      console.warn('[calculateReplyUsers] Failed to parse mentionedUsers:', e);
    }
  }

  // 2. 處理 mentionedGroups（展開為成員列表，查詢完整用戶資訊）
  if (mentionedGroups) {
    try {
      const groups = JSON.parse(mentionedGroups);

      if (Array.isArray(groups) && groups.length > 0) {
        // 批次查詢所有群組的成員（JOIN users 表獲取頭像資訊）
        const placeholders = groups.map(() => '?').join(',');
        const members = await db.prepare(`
          SELECT DISTINCT u.userEmail, u.displayName, u.avatarSeed, u.avatarStyle, u.avatarOptions
          FROM usergroups ug
          JOIN users u ON u.userEmail = ug.userEmail
          WHERE ug.projectId = ?
            AND ug.groupId IN (${placeholders})
            AND ug.isActive = 1
        `).bind(projectId, ...groups).all<{
          userEmail: string;
          displayName: string | null;
          avatarSeed: string | null;
          avatarStyle: string | null;
          avatarOptions: string | null;
        }>();

        for (const m of members.results || []) {
          // 只加入尚未存在的用戶（避免重複）
          if (!replyUsersMap.has(m.userEmail)) {
            replyUsersMap.set(m.userEmail, {
              userEmail: m.userEmail,
              displayName: m.displayName || m.userEmail.split('@')[0],
              avatarSeed: m.avatarSeed,
              avatarStyle: m.avatarStyle,
              avatarOptions: m.avatarOptions,
              role: 'member'
            });
          }
        }
      }
    } catch (e) {
      // JSON parse error, skip
      console.warn('[calculateReplyUsers] Failed to parse mentionedGroups:', e);
    }
  }

  return Array.from(replyUsersMap.values());
}

/**
 * 檢查使用者是否可以對評論給予反應
 * 規則：必須是被 mention 的學生（非老師），且不是作者本人
 */
export async function checkUserCanReactToComment(
  db: D1Database,
  userEmail: string,
  projectId: string,
  commentId: string
): Promise<{ canReact: boolean; reason?: string }> {
  // 1. 取得評論資訊
  const comment = await db.prepare(`
    SELECT authorEmail, mentionedGroups, mentionedUsers
    FROM comments WHERE commentId = ?
  `).bind(commentId).first<{
    authorEmail: string;
    mentionedGroups: string | null;
    mentionedUsers: string | null;
  }>();

  if (!comment) {
    return { canReact: false, reason: 'COMMENT_NOT_FOUND' };
  }

  // 2. 計算 reactionUsers（複用工具函數）
  const reactionUsers = await calculateReactionUsers(
    db,
    projectId,
    comment.mentionedGroups,
    comment.mentionedUsers,
    comment.authorEmail
  );

  // 3. 檢查是否在列表中
  if (reactionUsers.includes(userEmail)) {
    return { canReact: true };
  }

  // 4. 返回具體原因
  if (comment.authorEmail === userEmail) {
    return { canReact: false, reason: 'CANNOT_REACT_OWN_COMMENT' };
  }

  return { canReact: false, reason: 'NOT_IN_REACTION_USERS' };
}

/**
 * 檢查評論是否有至少一個「有幫助」反應
 * 這是質量門檻的關鍵檢查
 */
export async function checkCommentHasHelpfulReaction(
  db: D1Database,
  commentId: string
): Promise<boolean> {
  // Append-only architecture: Only count latest reactions per user
  const result = await db.prepare(`
    WITH latest_reactions AS (
      SELECT
        userEmail,
        reactionType,
        ROW_NUMBER() OVER (
          PARTITION BY userEmail
          ORDER BY createdAt DESC
        ) as rn
      FROM reactions
      WHERE targetType = 'comment' AND targetId = ?
    )
    SELECT COUNT(*) as count
    FROM latest_reactions
    WHERE rn = 1 AND reactionType = 'helpful'
  `).bind(commentId).first<{ count: number }>();

  return (result?.count ?? 0) > 0;
}

/**
 * 批次檢查多個評論是否有「有幫助」反應
 * 優化版：一次查詢返回所有結果，避免 N+1 問題
 * 使用分批處理避免 SQLite 變數數量限制
 * @returns Set of commentIds that have at least 1 helpful reaction
 */
export async function batchCheckCommentsHaveHelpfulReaction(
  db: D1Database,
  commentIds: string[]
): Promise<Set<string>> {
  if (commentIds.length === 0) {
    return new Set();
  }

  const MAX_IN_PARAMS = 100; // 保守設定，確保不超過 SQLite 999 限制
  const result = new Set<string>();

  // 分批處理 commentIds
  for (let i = 0; i < commentIds.length; i += MAX_IN_PARAMS) {
    const batch = commentIds.slice(i, i + MAX_IN_PARAMS);
    const placeholders = batch.map(() => '?').join(',');

    // Append-only architecture: Only count latest reactions per user per comment
    const batchResult = await db.prepare(`
      WITH latest_reactions AS (
        SELECT
          targetId as commentId,
          userEmail,
          reactionType,
          ROW_NUMBER() OVER (
            PARTITION BY targetId, userEmail
            ORDER BY createdAt DESC
          ) as rn
        FROM reactions
        WHERE targetType = 'comment' AND targetId IN (${placeholders})
      )
      SELECT commentId
      FROM latest_reactions
      WHERE rn = 1 AND reactionType = 'helpful'
      GROUP BY commentId
      HAVING COUNT(*) > 0
    `).bind(...batch).all();

    // 合併結果
    for (const r of batchResult.results || []) {
      result.add(r.commentId as string);
    }
  }

  return result;
}

/**
 * 驗證評論是否符合投票資格
 */
export async function validateCommentEligibility(
  db: D1Database,
  projectId: string,
  commentId: string,
  excludeAuthorEmail?: string
): Promise<{
  valid: boolean;
  error?: string;
  comment?: any;
}> {
  // 1. 獲取評論資料
  const comment = await db.prepare(`
    SELECT
      commentId,
      authorEmail,
      isReply,
      replyLevel,
      mentionedGroups,
      mentionedUsers
    FROM comments
    WHERE commentId = ? AND projectId = ?
  `).bind(commentId, projectId).first();

  if (!comment) {
    return { valid: false, error: '評論不存在' };
  }

  // 2. 不能是回覆評論
  if (comment.isReply || ((comment.replyLevel as number | undefined) && (comment.replyLevel as number) > 0)) {
    return { valid: false, error: '不能投票給回覆評論' };
  }

  // 3. 必須有 mentions
  let mentionedGroups: string[] = [];
  let mentionedUsers: string[] = [];

  try {
    if (comment.mentionedGroups) {
      mentionedGroups = typeof comment.mentionedGroups === 'string'
        ? JSON.parse(comment.mentionedGroups)
        : comment.mentionedGroups;
    }
    if (comment.mentionedUsers) {
      mentionedUsers = typeof comment.mentionedUsers === 'string'
        ? JSON.parse(comment.mentionedUsers)
        : comment.mentionedUsers;
    }
  } catch (e) {
    console.error('Failed to parse mentions:', e);
  }

  const hasMentions = (Array.isArray(mentionedGroups) && mentionedGroups.length > 0) ||
                     (Array.isArray(mentionedUsers) && mentionedUsers.length > 0);

  if (!hasMentions) {
    return { valid: false, error: '只能投票給有提及組別或用戶的評論' };
  }

  // 4. 作者必須是 Group Leader 或 Member
  const isGroupMember = await checkUserGroupMembership(db, projectId, comment.authorEmail as string);
  if (!isGroupMember) {
    return {
      valid: false,
      error: '評論作者不是專案的 Group Leader 或 Member'
    };
  }

  // 5. 排除指定作者（通常是投票者自己）
  if (excludeAuthorEmail && comment.authorEmail === excludeAuthorEmail) {
    return { valid: false, error: '不能投票給自己的評論' };
  }

  // 6. 必須有至少一個「有幫助」反應（質量門檻）
  const hasHelpful = await checkCommentHasHelpfulReaction(db, commentId);
  if (!hasHelpful) {
    return {
      valid: false,
      error: '此評論尚未獲得足夠的「有幫助」反應（需要至少 1 個）'
    };
  }

  return { valid: true, comment };
}

/**
 * 獲取可投票的評論列表（優化版：使用 JOIN 過濾）
 * 只返回有至少一個 "helpful" 反應的頂級評論
 */
export async function getRankableComments(
  db: D1Database,
  projectId: string,
  stageId: string,
  excludeAuthorEmail?: string
): Promise<any[]> {
  // Append-only architecture: Use CTE to get latest helpful reactions only
  // 使用 CTE 獲取每個評論的最新有效 helpful 反應
  const comments = await db.prepare(`
    WITH latest_helpful_reactions AS (
      SELECT
        targetId as commentId,
        reactionType,
        ROW_NUMBER() OVER (
          PARTITION BY targetId, userEmail
          ORDER BY createdAt DESC
        ) as rn
      FROM reactions
      WHERE targetType = 'comment'
    )
    SELECT DISTINCT
      c.commentId,
      c.authorEmail,
      c.content,
      c.mentionedGroups,
      c.mentionedUsers,
      c.createdTime,
      u.displayName as authorDisplayName
    FROM comments c
    LEFT JOIN users u ON u.userEmail = c.authorEmail
    INNER JOIN latest_helpful_reactions lhr
      ON lhr.commentId = c.commentId
      AND lhr.rn = 1
      AND lhr.reactionType = 'helpful'
    INNER JOIN usergroups ug ON ug.userEmail = c.authorEmail
      AND ug.projectId = c.projectId
      AND ug.isActive = 1
      AND (ug.role = 'leader' OR ug.role = 'member')
    WHERE c.projectId = ?
      AND c.stageId = ?
      AND (c.isReply = 0 OR c.isReply IS NULL)
      AND (c.replyLevel = 0 OR c.replyLevel IS NULL)
    ORDER BY c.createdTime DESC
  `).bind(projectId, stageId).all();

  if (!comments.results || comments.results.length === 0) {
    return [];
  }

  // 進一步過濾：檢查 mentions 和排除作者
  const validComments = [];

  for (const comment of comments.results) {
    // 檢查 mentions
    let mentionedGroups: string[] = [];
    let mentionedUsers: string[] = [];

    try {
      if (comment.mentionedGroups) {
        mentionedGroups = JSON.parse(comment.mentionedGroups as string);
      }
      if (comment.mentionedUsers) {
        mentionedUsers = JSON.parse(comment.mentionedUsers as string);
      }
    } catch (e) {
      console.warn('Failed to parse mentions:', e);
      continue;
    }

    const hasMentions = mentionedGroups.length > 0 || mentionedUsers.length > 0;
    if (!hasMentions) {
      continue;
    }

    // 排除指定作者
    if (excludeAuthorEmail && comment.authorEmail === excludeAuthorEmail) {
      continue;
    }

    validComments.push(comment);
  }

  return validComments;
}

/**
 * 驗證評論排名數據的完整性
 * @param rankingData - 排名數據陣列
 * @param maxRankings - 最大可排名數量（支援百分比模式動態計算），默認 3
 */
export function validateRankingData(
  rankingData: Array<{ commentId: string; rank: number }>,
  maxRankings: number = 3
): { valid: boolean; error?: string } {
  // 1. 檢查是否為空
  if (!rankingData || rankingData.length === 0) {
    return { valid: false, error: '排名數據不能為空' };
  }

  // 2. 檢查數量限制（根據 maxRankings 動態限制）
  if (rankingData.length > maxRankings) {
    return { valid: false, error: `評論排名最多只能提交前${maxRankings}名` };
  }

  // 3. 檢查 rank 範圍（根據 maxRankings 動態限制）
  for (const item of rankingData) {
    if (!item.commentId || !item.rank) {
      return { valid: false, error: '排名數據格式錯誤' };
    }
    if (item.rank < 1 || item.rank > maxRankings) {
      return { valid: false, error: `rank 必須在 1-${maxRankings} 之間` };
    }
  }

  // 4. 檢查重複的 commentId
  const commentIds = rankingData.map(r => r.commentId);
  const uniqueIds = new Set(commentIds);
  if (commentIds.length !== uniqueIds.size) {
    return { valid: false, error: '不能對同一評論投票多次' };
  }

  // 5. 檢查重複的 rank
  const ranks = rankingData.map(r => r.rank);
  const uniqueRanks = new Set(ranks);
  if (ranks.length !== uniqueRanks.size) {
    return { valid: false, error: 'rank 不能重複' };
  }

  // 6. 檢查 rank 連續性（不允許跳號）
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  for (let i = 0; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== i + 1) {
      return { valid: false, error: `排名必須連續，不能跳號（期望 rank ${i + 1}，實際為 ${sortedRanks[i]}）` };
    }
  }

  return { valid: true };
}

/**
 * 評論資訊結構（用於批量計算）
 */
export interface CommentForBatch {
  commentId: string;
  authorEmail: string;
  mentionedGroups: string | null;
  mentionedUsers: string | null;
}

/**
 * 批量計算多個評論的 reactionUsers
 * 優化版：一次查詢返回所有結果，避免 N+1 問題
 *
 * @param db - D1 Database instance
 * @param projectId - Project ID
 * @param comments - 評論列表
 * @returns Map<commentId, string[]> 每個評論的 reactionUsers
 */
export async function batchCalculateReactionUsers(
  db: D1Database,
  projectId: string,
  comments: CommentForBatch[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  if (comments.length === 0) {
    return result;
  }

  // 收集所有唯一的 mentionedUsers 和 mentionedGroups
  const allMentionedUsers = new Set<string>();
  const allMentionedGroups = new Set<string>();
  const authorEmails = new Set<string>();

  for (const comment of comments) {
    authorEmails.add(comment.authorEmail);

    if (comment.mentionedUsers) {
      try {
        const users = JSON.parse(comment.mentionedUsers);
        if (Array.isArray(users)) {
          users.forEach(u => allMentionedUsers.add(u));
        }
      } catch (e) { /* ignore */ }
    }

    if (comment.mentionedGroups) {
      try {
        const groups = JSON.parse(comment.mentionedGroups);
        if (Array.isArray(groups)) {
          groups.forEach(g => allMentionedGroups.add(g));
        }
      } catch (e) { /* ignore */ }
    }
  }

  // SQLite 變數限制：最多 999 個，保守設為 100 避免超限
  const MAX_IN_PARAMS = 100;

  // 批量查詢：哪些 mentionedUsers 是學生（分批處理避免 SQLite 變數限制）
  const studentUserEmails = new Set<string>();
  if (allMentionedUsers.size > 0) {
    const usersArray = Array.from(allMentionedUsers);

    // 分批處理
    for (let i = 0; i < usersArray.length; i += MAX_IN_PARAMS) {
      const batch = usersArray.slice(i, i + MAX_IN_PARAMS);
      const userPlaceholders = batch.map(() => '?').join(',');

      const studentsResult = await db.prepare(`
        SELECT DISTINCT ug.userEmail
        FROM usergroups ug
        WHERE ug.projectId = ?
          AND ug.userEmail IN (${userPlaceholders})
          AND ug.isActive = 1
          AND NOT EXISTS (
            SELECT 1 FROM projectviewers pv
            WHERE pv.projectId = ug.projectId
              AND pv.userEmail = ug.userEmail
              AND pv.role IN ('teacher', 'observer')
              AND pv.isActive = 1
          )
      `).bind(projectId, ...batch).all<{ userEmail: string }>();

      for (const row of studentsResult.results || []) {
        studentUserEmails.add(row.userEmail);
      }
    }
  }

  // 批量查詢：哪些群組的成員是學生（分批處理避免 SQLite 變數限制）
  const groupMembersMap = new Map<string, string[]>();
  if (allMentionedGroups.size > 0) {
    const groupsArray = Array.from(allMentionedGroups);

    // 分批處理
    for (let i = 0; i < groupsArray.length; i += MAX_IN_PARAMS) {
      const batch = groupsArray.slice(i, i + MAX_IN_PARAMS);
      const groupPlaceholders = batch.map(() => '?').join(',');

      const membersResult = await db.prepare(`
        SELECT ug.groupId, ug.userEmail
        FROM usergroups ug
        WHERE ug.projectId = ?
          AND ug.groupId IN (${groupPlaceholders})
          AND ug.isActive = 1
          AND NOT EXISTS (
            SELECT 1 FROM projectviewers pv
            WHERE pv.projectId = ug.projectId
              AND pv.userEmail = ug.userEmail
              AND pv.role IN ('teacher', 'observer')
              AND pv.isActive = 1
          )
      `).bind(projectId, ...batch).all<{ groupId: string; userEmail: string }>();

      for (const row of membersResult.results || []) {
        if (!groupMembersMap.has(row.groupId)) {
          groupMembersMap.set(row.groupId, []);
        }
        groupMembersMap.get(row.groupId)!.push(row.userEmail);
      }
    }
  }

  // 為每個評論組裝結果
  for (const comment of comments) {
    const reactionUsers = new Set<string>();

    // 處理 mentionedUsers
    if (comment.mentionedUsers) {
      try {
        const users = JSON.parse(comment.mentionedUsers);
        if (Array.isArray(users)) {
          for (const email of users) {
            if (email !== comment.authorEmail && studentUserEmails.has(email)) {
              reactionUsers.add(email);
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    // 處理 mentionedGroups
    if (comment.mentionedGroups) {
      try {
        const groups = JSON.parse(comment.mentionedGroups);
        if (Array.isArray(groups)) {
          for (const groupId of groups) {
            const members = groupMembersMap.get(groupId) || [];
            for (const email of members) {
              if (email !== comment.authorEmail) {
                reactionUsers.add(email);
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    result.set(comment.commentId, Array.from(reactionUsers));
  }

  return result;
}

/**
 * 批量計算多個評論的 replyUsers
 * 優化版：一次查詢返回所有結果，避免 N+1 問題
 *
 * @param db - D1 Database instance
 * @param projectId - Project ID
 * @param comments - 評論列表
 * @returns Map<commentId, ReplyUserInfo[]> 每個評論的 replyUsers
 */
export async function batchCalculateReplyUsers(
  db: D1Database,
  projectId: string,
  comments: CommentForBatch[]
): Promise<Map<string, ReplyUserInfo[]>> {
  const result = new Map<string, ReplyUserInfo[]>();

  if (comments.length === 0) {
    return result;
  }

  // 收集所有唯一的 mentionedUsers 和 mentionedGroups
  const allMentionedUsers = new Set<string>();
  const allMentionedGroups = new Set<string>();

  for (const comment of comments) {
    if (comment.mentionedUsers) {
      try {
        const users = JSON.parse(comment.mentionedUsers);
        if (Array.isArray(users)) {
          users.forEach(u => allMentionedUsers.add(u));
        }
      } catch (e) { /* ignore */ }
    }

    if (comment.mentionedGroups) {
      try {
        const groups = JSON.parse(comment.mentionedGroups);
        if (Array.isArray(groups)) {
          groups.forEach(g => allMentionedGroups.add(g));
        }
      } catch (e) { /* ignore */ }
    }
  }

  // SQLite 變數限制：最多 999 個，保守設為 100 避免超限
  const MAX_IN_PARAMS = 100;

  // 批量查詢：mentionedUsers 的完整用戶資訊（分批處理避免 SQLite 變數限制）
  const userInfoMap = new Map<string, ReplyUserInfo>();
  if (allMentionedUsers.size > 0) {
    const usersArray = Array.from(allMentionedUsers);

    // 分批處理
    for (let i = 0; i < usersArray.length; i += MAX_IN_PARAMS) {
      const batch = usersArray.slice(i, i + MAX_IN_PARAMS);
      const userPlaceholders = batch.map(() => '?').join(',');

      const usersResult = await db.prepare(`
        SELECT userEmail, displayName, avatarSeed, avatarStyle, avatarOptions
        FROM users
        WHERE userEmail IN (${userPlaceholders})
      `).bind(...batch).all<{
        userEmail: string;
        displayName: string | null;
        avatarSeed: string | null;
        avatarStyle: string | null;
        avatarOptions: string | null;
      }>();

      for (const u of usersResult.results || []) {
        userInfoMap.set(u.userEmail, {
          userEmail: u.userEmail,
          displayName: u.displayName || u.userEmail.split('@')[0],
          avatarSeed: u.avatarSeed,
          avatarStyle: u.avatarStyle,
          avatarOptions: u.avatarOptions,
          role: 'member'
        });
      }
    }
  }

  // 批量查詢：群組成員的完整用戶資訊（分批處理避免 SQLite 變數限制）
  const groupMembersInfoMap = new Map<string, ReplyUserInfo[]>();
  if (allMentionedGroups.size > 0) {
    const groupsArray = Array.from(allMentionedGroups);

    // 分批處理
    for (let i = 0; i < groupsArray.length; i += MAX_IN_PARAMS) {
      const batch = groupsArray.slice(i, i + MAX_IN_PARAMS);
      const groupPlaceholders = batch.map(() => '?').join(',');

      const membersResult = await db.prepare(`
        SELECT ug.groupId, u.userEmail, u.displayName, u.avatarSeed, u.avatarStyle, u.avatarOptions
        FROM usergroups ug
        JOIN users u ON u.userEmail = ug.userEmail
        WHERE ug.projectId = ?
          AND ug.groupId IN (${groupPlaceholders})
          AND ug.isActive = 1
      `).bind(projectId, ...batch).all<{
        groupId: string;
        userEmail: string;
        displayName: string | null;
        avatarSeed: string | null;
        avatarStyle: string | null;
        avatarOptions: string | null;
      }>();

      for (const m of membersResult.results || []) {
        if (!groupMembersInfoMap.has(m.groupId)) {
          groupMembersInfoMap.set(m.groupId, []);
        }
        groupMembersInfoMap.get(m.groupId)!.push({
          userEmail: m.userEmail,
          displayName: m.displayName || m.userEmail.split('@')[0],
          avatarSeed: m.avatarSeed,
          avatarStyle: m.avatarStyle,
          avatarOptions: m.avatarOptions,
          role: 'member'
        });
      }
    }
  }

  // 為每個評論組裝結果
  for (const comment of comments) {
    const replyUsersMap = new Map<string, ReplyUserInfo>();

    // 處理 mentionedUsers
    if (comment.mentionedUsers) {
      try {
        const users = JSON.parse(comment.mentionedUsers);
        if (Array.isArray(users)) {
          for (const email of users) {
            const info = userInfoMap.get(email);
            if (info && !replyUsersMap.has(email)) {
              replyUsersMap.set(email, info);
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    // 處理 mentionedGroups
    if (comment.mentionedGroups) {
      try {
        const groups = JSON.parse(comment.mentionedGroups);
        if (Array.isArray(groups)) {
          for (const groupId of groups) {
            const members = groupMembersInfoMap.get(groupId) || [];
            for (const member of members) {
              if (!replyUsersMap.has(member.userEmail)) {
                replyUsersMap.set(member.userEmail, member);
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    result.set(comment.commentId, Array.from(replyUsersMap.values()));
  }

  return result;
}
