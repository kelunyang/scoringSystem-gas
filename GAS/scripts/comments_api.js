/**
 * @fileoverview Comment system API endpoints
 * @module CommentsAPI
 */

// Import shared utilities
// Note: In GAS environment, all scripts share the same global scope
// These functions are available from shared_ranking_utils.js
// Error handling utilities are available from error_handling.js

// ============ SHARED UTILITIES ============
// The following functions are imported from shared_ranking_utils.js:
// - getLatestTeacherRankings
// - getTableData
// - validateTeacherPermission
// - getCommentRankingKey
// - getSubmissionRankingKey

/**
 * Get all users with teacher_privilege
 * @returns {Array<string>} Array of email addresses
 */
function getTeacherPrivilegeUsers() {
  try {
    const globalData = readGlobalData();
    
    // Find the group(s) with teacher_privilege permission
    const teacherGroups = (globalData.globalgroups || [])
      .filter(g => {
        const permissions = safeJsonParse(g.globalPermissions, []);
        return permissions.includes('teacher_privilege');
      })
      .map(g => g.groupId);
    
    // Get all users in these groups
    const teacherEmails = (globalData.globalusergroups || [])
      .filter(ug => teacherGroups.includes(ug.groupId) && ug.isActive)
      .map(ug => ug.userEmail);
    
    return [...new Set(teacherEmails)]; // Remove duplicates
  } catch (error) {
    console.error('Error getting teacher privilege users:', error);
    return [];
  }
}

/**
 * Create a comment
 */
function createComment(sessionId, projectId, stageId, commentData) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    
    // Check if user is an active project member (should have comment rights)
    const isActiveProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is system admin or has global access
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
    
    // Global PM can always comment regardless of project permissions or stage status
    const isGlobalPMUser = isGlobalPM(sessionResult.userEmail);
    
    if (!permissions.includes('comment') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess && !isGlobalPMUser) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to comment');
    }

    // 如果是回復評論，需要驗證父評論
    if (commentData.parentCommentId) {
      const parentComment = projectData.comments.find(c => 
        c.commentId === commentData.parentCommentId && c.stageId === stageId
      );
      
      if (!parentComment) {
        return createErrorResponse('PARENT_NOT_FOUND', '被回復的評論不存在');
      }
      
      // 防止對回復進行回復（只允許單層回復）
      if (parentComment.isReply) {
        return createErrorResponse('NESTED_REPLY_NOT_ALLOWED', '不允許對回復進行回復');
      }
      
      // 檢查回覆權限：作者可以回覆自己的評論，或者被@到的用戶/組可以回覆
      let canReply = false;
      
      // 1. 如果是原評論作者，允許回覆自己的評論
      if (parentComment.authorEmail === sessionResult.userEmail) {
        canReply = true;
      }
      
      // 2. Global PM總是可以回復
      if (isGlobalPMUser) {
        canReply = true;
      }
      
      // 3. 檢查是否被@到（只有非作者需要檢查）
      if (!canReply) {
        const mentionedGroups = safeJsonParse(parentComment.mentionedGroups) || [];
        const mentionedUsers = safeJsonParse(parentComment.mentionedUsers) || [];
        
        // 檢查是否為被提及的用戶
        if (mentionedUsers.includes(sessionResult.userEmail)) {
          canReply = true;
        }
        
        // 檢查是否為被提及組別的成員
        if (!canReply && mentionedGroups.length > 0) {
          const userGroup = projectData.usergroups.find(ug => 
            ug.userEmail === sessionResult.userEmail && ug.isActive
          );
          if (userGroup && mentionedGroups.includes(userGroup.groupId)) {
            canReply = true;
          }
        }
      }
      
      // 4. 如果沒有權限，替換回覆內容
      if (!canReply) {
        commentData.content = '人家沒@你，你不可以回復';
      }
    }

    const commentId = generateIdWithType('comment');
    const timestamp = getCurrentTimestamp();

    // 處理評論內容，替換不當的 mention
    let processedContent;
    
    // 如果是回復評論，需要更嚴格的內容過濾
    if (commentData.parentCommentId) {
      // 回復評論不允許使用 @mention，移除所有 @ 標記
      processedContent = sanitizeReplyContent(commentData.content);
    } else {
      // 一般評論使用標準過濾
      processedContent = sanitizeCommentContent(commentData.content, projectData.usergroups || [], sessionResult.userEmail, projectId, stageId);
    }
    
    // Parse mentioned groups and users from processed content (防止自肥)
    // 注意：回復評論不會處理 mention，因此不會有 mentionedGroups 和 mentionedUsers
    let mentionedGroups = [];
    let mentionedUsers = [];
    
    if (!commentData.parentCommentId) {
      // 只有一般評論才處理 mention
      console.log('Processing mentions for user:', sessionResult.userEmail);
      console.log('Project data available:', {
        hasGroups: Array.isArray(projectData.groups),
        groupsCount: projectData.groups?.length || 0,
        hasUserGroups: Array.isArray(projectData.usergroups),
        userGroupsCount: projectData.usergroups?.length || 0
      });
      
      mentionedGroups = extractMentionedGroups(processedContent, projectData.groups || [], projectData.usergroups || [], sessionResult.userEmail, projectId, stageId);
      mentionedUsers = extractMentionedUsers(processedContent, projectData.usergroups || [], sessionResult.userEmail, projectId, stageId);
      
      console.log('Extracted mentions:', { mentionedGroups, mentionedUsers });
    }

    const comment = {
      commentId: commentId,
      stageId: stageId,
      authorEmail: sessionResult.userEmail,
      content: sanitizeString(processedContent, 5000),
      mentionedGroups: safeJsonStringify(mentionedGroups),
      mentionedUsers: safeJsonStringify(mentionedUsers),
      parentCommentId: commentData.parentCommentId || null,
      isReply: Boolean(commentData.parentCommentId),
      replyLevel: commentData.parentCommentId ? 1 : 0,
      isAwarded: false,
      awardRank: null,
      createdTime: timestamp
    };

    addRowToSheet(projectId, 'Comments', comment);

    // Log comment creation event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'comment_created',
      'comment',
      commentId,
      {
        stageId: stageId,
        isReply: !!parentCommentId,
        mentionedGroups: mentionedGroups.length,
        mentionedUsers: mentionedUsers.length
      }
    );

    // Send notifications for comment creation (mentions, replies, etc.)
    sendCommentCreatedNotifications(
      projectId,
      stageId,
      commentId,
      comment.content,
      sessionResult.userEmail,
      mentionedUsers,
      mentionedGroups,
      commentData.parentCommentId || null
    );

    return createSuccessResponse(comment, 'Comment created successfully');

  } catch (error) {
    logErr('Create comment error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create comment');
  }
}

/**
 * Get stage comments with voting eligibility information and organized by hierarchy
 * @param {boolean} params.excludeTeachers - Whether to exclude teacher comments (for voting scenarios)
 */
function getStageComments(sessionId, projectId, stageId, params) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    
    // Get all teacher emails if we need to filter them out
    const excludeTeachers = params && params.excludeTeachers === true;
    const teacherEmails = excludeTeachers ? getTeacherPrivilegeUsers() : [];
    
    const allComments = projectData.comments
      .filter(c => {
        if (c.stageId !== stageId) return false;
        if (excludeTeachers && teacherEmails.includes(c.authorEmail)) return false;
        return true;
      })
      .sort((a, b) => a.createdTime - b.createdTime);
    
    // 分離主評論和回復
    const mainComments = allComments.filter(c => !c.isReply && (c.replyLevel === 0 || c.replyLevel === undefined));
    const replies = allComments.filter(c => c.isReply);
    
    // Get all teacher emails for marking teacher comments
    const allTeacherEmails = getTeacherPrivilegeUsers();
    
    // 組織評論層級結構
    const organizedComments = mainComments.map(comment => {
      const mentionedGroups = safeJsonParse(comment.mentionedGroups) || [];
      const isTeacherComment = allTeacherEmails.includes(comment.authorEmail);
      
      // 找到這個評論的所有回復
      const commentReplies = replies
        .filter(r => r.parentCommentId === comment.commentId)
        .map(reply => ({
          ...reply,
          mentionedGroups: safeJsonParse(reply.mentionedGroups) || [],
          mentionedUsers: safeJsonParse(reply.mentionedUsers) || [],
          isTeacherComment: allTeacherEmails.includes(reply.authorEmail)
        }));
      
      return {
        ...comment,
        mentionedGroups: mentionedGroups,
        mentionedUsers: safeJsonParse(comment.mentionedUsers) || [],
        canBeVoted: mentionedGroups.length > 0 && !isTeacherComment, // Teacher comments cannot be voted on
        votingEligible: mentionedGroups.length > 0 && !isTeacherComment, // Same as canBeVoted for clarity
        isTeacherComment: isTeacherComment,
        replies: commentReplies
      };
    });
    
    return createSuccessResponse(organizedComments);

  } catch (error) {
    logErr('Get comments error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get comments');
  }
}

/**
 * Submit comment ranking proposal
 * Users can only vote if they mentioned at least one group in their comments
 */
function submitCommentRanking(sessionId, projectId, stageId, rankingData) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate inputs
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }

    if (!stageId || typeof stageId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'Invalid stage ID');
    }

    if (!Array.isArray(rankingData) || rankingData.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'Invalid ranking data');
    }

    const projectData = readProjectData(projectId);
    
    // Validate stage exists and is in voting phase
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Check if stage is in voting phase
    if (stage.status !== 'voting') {
      return createErrorResponse('NOT_IN_VOTING_PHASE', 'Stage is not in voting phase. Current status: ' + stage.status);
    }
    
    // Check if user has commented in this stage (excluding reply comments)
    const userComments = projectData.comments.filter(c => 
      c.stageId === stageId && 
      c.authorEmail === sessionResult.userEmail && 
      !c.isReply // 排除回復評論，只計算主評論
    );

    if (userComments.length === 0) {
      return createErrorResponse('NO_COMMENT', 'Must have commented to rank comments');
    }

    // Check if user mentioned at least one group in their comments (voting eligibility)
    let hasMentionedGroup = false;
    for (const comment of userComments) {
      const mentionedGroups = safeJsonParse(comment.mentionedGroups) || [];
      if (mentionedGroups.length > 0) {
        hasMentionedGroup = true;
        break;
      }
    }

    if (!hasMentionedGroup) {
      return createErrorResponse('NO_GROUP_MENTION', 'Must mention at least one group (@group) in comments to participate in voting');
    }

    // Validate that user is not voting for their own comments and not voting for reply comments
    const stageComments = projectData.comments.filter(c => c.stageId === stageId);
    const authorEmailsInRanking = new Set(); // 用於檢查作者唯一性
    
    for (const ranking of rankingData) {
      const commentBeingRanked = stageComments.find(c => c.commentId === ranking.commentId);
      
      if (!commentBeingRanked) {
        return createErrorResponse('COMMENT_NOT_FOUND', 'Comment being ranked not found');
      }
      
      // 不能對自己的評論投票
      if (commentBeingRanked.authorEmail === sessionResult.userEmail) {
        return createErrorResponse('SELF_VOTING_NOT_ALLOWED', 'Cannot vote for your own comments');
      }
      
      // 不能對回復評論投票
      if (commentBeingRanked.isReply) {
        return createErrorResponse('REPLY_VOTING_NOT_ALLOWED', 'Cannot vote for reply comments');
      }
      
      // 只能對 replyLevel = 0 的評論投票
      if (commentBeingRanked.replyLevel !== 0 && commentBeingRanked.replyLevel !== undefined) {
        return createErrorResponse('INVALID_COMMENT_LEVEL', 'Can only vote for main level comments (replyLevel=0)');
      }
      
      // 評論必須要有 mentionedGroups 或 mentionedUsers（防止API攻擊）
      const mentionedGroups = safeJsonParse(commentBeingRanked.mentionedGroups) || [];
      const mentionedUsers = safeJsonParse(commentBeingRanked.mentionedUsers) || [];
      
      if (mentionedGroups.length === 0 && mentionedUsers.length === 0) {
        return createErrorResponse('NO_MENTIONS_REQUIRED', 'Can only vote for comments that mention groups or users');
      }
      
      // 檢查作者唯一性 - 同一作者只能有一篇評論被選入排序
      if (authorEmailsInRanking.has(commentBeingRanked.authorEmail)) {
        return createErrorResponse('DUPLICATE_AUTHOR', 'Cannot vote for multiple comments from the same author. Each author can only have one comment in the ranking.');
      }
      authorEmailsInRanking.add(commentBeingRanked.authorEmail);
      
      // 額外驗證：確保排名在合理範圍內（雖然前端通常會限制，但後端也要防禦）
      if (ranking.rank < 1 || ranking.rank > 10) {
        return createErrorResponse('INVALID_RANK', 'Comment rank must be between 1 and 10.');
      }
    }

    const proposalId = generateIdWithType('commentranking');
    const timestamp = getCurrentTimestamp();

    const proposal = {
      proposalId: proposalId,
      stageId: stageId,
      authorEmail: sessionResult.userEmail,
      rankingData: safeJsonStringify(rankingData),
      createdTime: timestamp,
      metadata: safeJsonStringify({ hasGroupMention: true })
    };

    addRowToSheet(projectId, 'CommentRankingProposals', proposal);

    // Log comment vote event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'comment_vote_submitted',
      'vote',
      proposalId,
      {
        stageId: stageId,
        voteType: 'comment_ranking',
        commentCount: rankingData.length
      }
    );

    return createSuccessResponse(proposal, 'Comment ranking submitted');

  } catch (error) {
    const context = { 
      operation: 'submitCommentRanking',
      projectId, 
      stageId, 
      userEmail: sessionResult?.userEmail 
    };
    return createErrorResponseFromException(error, context);
  }
}

/**
 * Helper function to extract mentioned groups from content
 * Supports format: @email - finds user by email then gets their group
 * Only includes groups that have submitted valid submissions for the current stage
 */
function extractMentionedGroups(content, groups, usergroups, currentUserEmail, projectId, stageId) {
  // 安全檢查
  if (!content || !currentUserEmail) {
    return [];
  }
  
  // 確保 groups 和 usergroups 是陣列
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeUserGroups = Array.isArray(usergroups) ? usergroups : [];
  
  // 獲取有效的群組ID列表（有提交submission且status為submitted的群組）
  let validGroupIds = [];
  if (projectId && stageId) {
    try {
      const projectData = readProjectData(projectId);
      validGroupIds = projectData.submissions
        .filter(s => s.stageId === stageId && s.status === 'submitted')
        .map(s => s.groupId);
    } catch (error) {
      console.log('Error reading submissions for group validation:', error);
      // 如果無法讀取submissions，則允許所有群組（向後兼容）
      validGroupIds = safeGroups.map(g => g.groupId);
    }
  } else {
    // 如果沒有提供projectId或stageId，則允許所有群組（向後兼容）
    validGroupIds = safeGroups.map(g => g.groupId);
  }
  
  // Match @email pattern
  const mentionMatches = content.match(/@([^\s@]+@[^\s@]+)/g) || [];
  const mentions = [];
  
  // 獲取當前用戶的群組ID（防止自肥）
  let currentUserGroupId = null;
  try {
    const currentUserGroupRecord = safeUserGroups.find(ug => 
      ug && ug.userEmail === currentUserEmail && ug.isActive
    );
    currentUserGroupId = currentUserGroupRecord?.groupId;
  } catch (error) {
    console.log('Error finding current user group:', error);
  }
  
  // 獲取所有專案參與者的 email 列表
  const projectUserEmails = safeUserGroups
    .filter(ug => ug && ug.isActive && ug.userEmail)
    .map(ug => ug.userEmail);
  
  // 獲取同組成員的 email 列表
  const sameGroupEmails = currentUserGroupId ? 
    safeUserGroups
      .filter(ug => ug && ug.isActive && ug.groupId === currentUserGroupId)
      .map(ug => ug.userEmail) : [];
  
  for (const match of mentionMatches) {
    const userEmail = match.slice(1); // Remove @ prefix
    
    // 跳過特殊文字
    if (userEmail === '禁止自肥' || userEmail === '這誰啊' || userEmail === '該組沒交成果啊') {
      continue;
    }
    
    // 跳過自己和同組成員
    if (userEmail === currentUserEmail || sameGroupEmails.includes(userEmail)) {
      continue;
    }
    
    // 檢查是否為專案參與者
    if (!projectUserEmails.includes(userEmail)) {
      continue;
    }
    
    // Find user's group through usergroups table
    try {
      const userGroupRecord = safeUserGroups.find(ug => 
        ug && ug.userEmail === userEmail && ug.isActive
      );
      
      if (userGroupRecord) {
        const group = safeGroups.find(g => g && g.groupId === userGroupRecord.groupId);
        
        // 檢查群組是否有有效的submission
        if (group && validGroupIds.includes(group.groupId) && !mentions.includes(group.groupId)) {
          mentions.push(group.groupId);
        }
      }
    } catch (error) {
      console.log('Error processing mention:', userEmail, error);
    }
  }
  
  return mentions;
}

/**
 * Sanitize comment content by replacing inappropriate mentions
 * @param {string} content - Original comment content
 * @param {Array} usergroups - User groups data
 * @param {string} currentUserEmail - Current user's email
 * @param {string} projectId - Project ID for submission validation
 * @param {string} stageId - Stage ID for submission validation
 * @returns {string} Processed content with replaced mentions
 */
function sanitizeCommentContent(content, usergroups, currentUserEmail, projectId, stageId) {
  if (!content || !currentUserEmail) {
    return content;
  }
  
  // 確保 usergroups 是陣列
  const safeUserGroups = Array.isArray(usergroups) ? usergroups : [];
  
  // 獲取有效的群組ID列表（有提交submission且status為submitted的群組）
  let validGroupIds = [];
  if (projectId && stageId) {
    try {
      const projectData = readProjectData(projectId);
      validGroupIds = projectData.submissions
        .filter(s => s.stageId === stageId && s.status === 'submitted')
        .map(s => s.groupId);
    } catch (error) {
      console.log('Error reading submissions for content sanitization:', error);
      // 如果無法讀取submissions，則不進行submission過濾（向後兼容）
      validGroupIds = null;
    }
  }
  
  // 獲取當前用戶的群組ID
  let currentUserGroupId = null;
  try {
    const currentUserGroupRecord = safeUserGroups.find(ug => 
      ug && ug.userEmail === currentUserEmail && ug.isActive
    );
    currentUserGroupId = currentUserGroupRecord?.groupId;
  } catch (error) {
    console.log('Error finding current user group:', error);
  }
  
  // 獲取所有專案參與者的 email 列表
  const projectUserEmails = safeUserGroups
    .filter(ug => ug && ug.isActive && ug.userEmail)
    .map(ug => ug.userEmail);
  
  // 獲取同組成員的 email 列表
  const sameGroupEmails = currentUserGroupId ? 
    safeUserGroups
      .filter(ug => ug && ug.isActive && ug.groupId === currentUserGroupId)
      .map(ug => ug.userEmail) : [];
  
  // 替換不當的 mentions
  return content.replace(/@([^\s@]+@[^\s@]+)/g, (match, email) => {
    // 如果是自己
    if (email === currentUserEmail) {
      return '@禁止自肥';
    }
    
    // 如果是同組成員
    if (sameGroupEmails.includes(email)) {
      return '@禁止自肥';
    }
    
    // 如果不是專案參與者
    if (!projectUserEmails.includes(email)) {
      return '@這誰啊';
    }
    
    // 檢查用戶所屬群組是否有提交有效submission
    if (validGroupIds !== null) {
      try {
        const userGroupRecord = safeUserGroups.find(ug => 
          ug && ug.userEmail === email && ug.isActive
        );
        
        if (userGroupRecord && !validGroupIds.includes(userGroupRecord.groupId)) {
          return '@該組沒交成果啊';
        }
      } catch (error) {
        console.log('Error checking user group submission status:', error);
      }
    }
    
    // 正常情況，保持原樣
    return match;
  });
}

/**
 * Sanitize reply comment content - removes all @ mentions and disallowed markdown
 * Reply comments should be simple text with only basic formatting (B, I, links, images)
 */
function sanitizeReplyContent(content) {
  if (!content) {
    return content;
  }
  
  // Remove all @ mentions from reply content
  let sanitized = content.replace(/@([^\s@]+@[^\s@]+)/g, '');
  
  // Remove disallowed markdown elements while keeping basic ones
  // Keep: **bold**, *italic*, [links](url), ![images](url)
  // Remove: ###headers, lists, quotes, code blocks, horizontal rules
  
  // Remove headers (###, ##, #)
  sanitized = sanitized.replace(/^#{1,6}\s+.*$/gm, '');
  
  // Remove unordered lists (- item, * item)
  sanitized = sanitized.replace(/^[\s]*[-*]\s+.*$/gm, '');
  
  // Remove ordered lists (1. item)
  sanitized = sanitized.replace(/^[\s]*\d+\.\s+.*$/gm, '');
  
  // Remove blockquotes (> text)
  sanitized = sanitized.replace(/^>\s+.*$/gm, '');
  
  // Remove code blocks (``` code ```)
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code (`code`) - but this might be too aggressive
  sanitized = sanitized.replace(/`([^`]+)`/g, '$1');
  
  // Remove horizontal rules (---, ***, ___)
  sanitized = sanitized.replace(/^[-*_]{3,}$/gm, '');
  
  // Clean up multiple consecutive newlines
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Extract mentioned users from comment content
 * Supports format: @email
 * Only includes users from groups that have submitted valid submissions for the current stage
 */
function extractMentionedUsers(content, usergroups, currentUserEmail, projectId, stageId) {
  // 安全檢查
  if (!content || !currentUserEmail) {
    return [];
  }
  
  // 確保 usergroups 是陣列
  const safeUserGroups = Array.isArray(usergroups) ? usergroups : [];
  
  // 獲取有效的群組ID列表（有提交submission且status為submitted的群組）
  let validGroupIds = [];
  if (projectId && stageId) {
    try {
      const projectData = readProjectData(projectId);
      validGroupIds = projectData.submissions
        .filter(s => s.stageId === stageId && s.status === 'submitted')
        .map(s => s.groupId);
    } catch (error) {
      console.log('Error reading submissions for user validation:', error);
      // 如果無法讀取submissions，則允許所有用戶（向後兼容）
      validGroupIds = null;
    }
  } else {
    // 如果沒有提供projectId或stageId，則允許所有用戶（向後兼容）
    validGroupIds = null;
  }
  
  // Match @email pattern
  const mentionMatches = content.match(/@([^\s@]+@[^\s@]+)/g) || [];
  const mentions = [];
  
  // 獲取當前用戶的群組ID（防止自肥）
  let currentUserGroupId = null;
  try {
    const currentUserGroupRecord = safeUserGroups.find(ug => 
      ug && ug.userEmail === currentUserEmail && ug.isActive
    );
    currentUserGroupId = currentUserGroupRecord?.groupId;
  } catch (error) {
    console.log('Error finding current user group:', error);
  }
  
  // 獲取所有專案參與者的 email 列表
  const projectUserEmails = safeUserGroups
    .filter(ug => ug && ug.isActive && ug.userEmail)
    .map(ug => ug.userEmail);
  
  // 獲取同組成員的 email 列表
  const sameGroupEmails = currentUserGroupId ? 
    safeUserGroups
      .filter(ug => ug && ug.isActive && ug.groupId === currentUserGroupId)
      .map(ug => ug.userEmail) : [];
  
  for (const match of mentionMatches) {
    const userEmail = match.slice(1); // Remove @ prefix
    
    // 跳過特殊文字
    if (userEmail === '禁止自肥' || userEmail === '這誰啊' || userEmail === '該組沒交成果啊') {
      continue;
    }
    
    // 跳過自己和同組成員
    if (userEmail === currentUserEmail || sameGroupEmails.includes(userEmail)) {
      continue;
    }
    
    // 檢查是否為專案參與者
    if (!projectUserEmails.includes(userEmail)) {
      continue;
    }
    
    // 檢查用戶所屬群組是否有有效的submission
    if (validGroupIds !== null) {
      try {
        const userGroupRecord = safeUserGroups.find(ug => 
          ug && ug.userEmail === userEmail && ug.isActive
        );
        
        if (!userGroupRecord || !validGroupIds.includes(userGroupRecord.groupId)) {
          continue; // 跳過沒有有效submission的組的用戶
        }
      } catch (error) {
        console.log('Error checking user group submission status:', error);
        continue;
      }
    }
    
    // 通過所有檢查，記錄被提及的用戶
    if (!mentions.includes(userEmail)) {
      mentions.push(userEmail);
    }
  }
  
  return mentions;
}


/**
 * Check user's voting eligibility in a stage
 * Users can vote only if they mentioned at least one group in their comments
 */
function checkUserVotingEligibility(sessionId, projectId, stageId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    
    // Get user's comments in this stage (excluding reply comments)
    const userComments = projectData.comments.filter(c => 
      c.stageId === stageId && 
      c.authorEmail === sessionResult.userEmail && 
      !c.isReply // 排除回復評論，只計算主評論
    );

    const eligibilityInfo = {
      canVote: false,
      hasCommented: userComments.length > 0,
      hasMentionedGroup: false,
      commentsCount: userComments.length,
      groupMentionCount: 0,
      message: ''
    };

    // Check if user has commented
    if (userComments.length === 0) {
      eligibilityInfo.message = '必須先發表評論才能投票';
      return createSuccessResponse(eligibilityInfo);
    }

    // Check if user mentioned at least one group
    for (const comment of userComments) {
      const mentionedGroups = safeJsonParse(comment.mentionedGroups) || [];
      eligibilityInfo.groupMentionCount += mentionedGroups.length;
      
      if (mentionedGroups.length > 0) {
        eligibilityInfo.hasMentionedGroup = true;
      }
    }

    if (eligibilityInfo.hasMentionedGroup) {
      eligibilityInfo.canVote = true;
      eligibilityInfo.message = '您有投票資格';
    } else {
      eligibilityInfo.message = '必須在評論中@提及至少一組才能投票';
    }

    // Check voting history (取最新的投票記錄)
    const userVotingHistory = projectData.commentrankingproposals
      ? projectData.commentrankingproposals.filter(p => 
          p.stageId === stageId && p.authorEmail === sessionResult.userEmail
        ).sort((a, b) => (b.createdTime || 0) - (a.createdTime || 0))
      : [];
    
    if (userVotingHistory.length > 0) {
      const latestVote = userVotingHistory[0];
      eligibilityInfo.hasVoted = true;
      eligibilityInfo.lastVoteTime = latestVote.createdTime;
      eligibilityInfo.voteCount = userVotingHistory.length;
    } else {
      eligibilityInfo.hasVoted = false;
      eligibilityInfo.lastVoteTime = null;
      eligibilityInfo.voteCount = 0;
    }

    return createSuccessResponse(eligibilityInfo);

  } catch (error) {
    logErr('Check voting eligibility error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to check voting eligibility');
  }
}

/**
 * Create notifications in the notification system for mentioned groups
 */
function createMentionNotificationsInSystem(projectId, stageId, commentId, mentionedGroupIds, authorEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get stage name
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    // Get author name
    const author = globalData.users.find(u => u.userEmail === authorEmail);
    const authorName = author ? (author.displayName || author.username) : authorEmail;

    mentionedGroupIds.forEach(groupId => {
      // Find group members
      const groupMembers = projectData.usergroups.filter(ug => 
        ug.groupId === groupId && ug.isActive
      );
      
      // Get group name
      const group = projectData.groups.find(g => g.groupId === groupId);
      const groupName = group ? group.groupName : '未知群組';

      // Create notification for each group member (with rate limiting protection)
      groupMembers.forEach((member, index) => {
        // Add small delay between notification creations to avoid database overload
        if (index > 0) {
          Utilities.sleep(100); // 0.1 second delay between notifications
        }
        
        createNotification({
          targetUserEmail: member.userEmail,
          type: 'group_mention',
          title: `您的群組被提及`,
          content: `${authorName} 在 ${projectName} - ${stageName} 的評論中提及了 ${groupName}`,
          projectId: projectId,
          stageId: stageId,
          commentId: commentId,
          relatedEntityId: groupId,
          metadata: {
            authorEmail: authorEmail,
            authorName: authorName,
            groupId: groupId,
            groupName: groupName,
            projectName: projectName,
            stageName: stageName
          }
        });
      });
    });

  } catch (error) {
    logErr('Create mention notifications in system error', error);
  }
}

/**
 * Get comment rankings for current user and teacher
 */
function getCommentRankings(sessionId, projectId, stageId, commentId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    const result = {
      userVoteRank: null,
      teacherVoteRank: null,
      settlementRank: null
    };

    // 1. 查詢當前用戶對該評論的排名（從CommentRankingProposals）
    const userProposal = projectData.commentrankingproposals?.find(proposal => 
      proposal.stageId === stageId && proposal.authorEmail === sessionResult.userEmail
    );
    
    if (userProposal && userProposal.rankingData) {
      try {
        const rankingData = typeof userProposal.rankingData === 'string' 
          ? JSON.parse(userProposal.rankingData) 
          : userProposal.rankingData;
        
        const commentRanking = rankingData.find(ranking => ranking.commentId === commentId);
        if (commentRanking) {
          result.userVoteRank = commentRanking.rank;
        }
      } catch (e) {
        console.warn('解析用戶排名數據失敗:', e);
      }
    }

    // 2. 查詢老師對該評論的排名（從TeacherCommentRankings）
    const teacherRanking = projectData.teachercommentrankings?.find(ranking => 
      ranking.stageId === stageId && ranking.commentId === commentId
    );
    
    if (teacherRanking) {
      result.teacherVoteRank = teacherRanking.rank;
    }

    // 3. 結算排名（這裡可以根據業務邏輯計算，暫時使用老師排名）
    result.settlementRank = result.teacherVoteRank;

    return createSuccessResponse(result);

  } catch (error) {
    logErr('Get comment rankings error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get comment rankings');
  }
}

/**
 * Get comment rankings for a stage (batch query for multiple comments)
 */
function getStageCommentRankings(sessionId, projectId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    const rankings = {};

    // Get non-teacher comments for this stage
    const teacherEmails = getTeacherPrivilegeUsers();
    const stageComments = (projectData.comments || []).filter(c => 
      c.stageId === stageId && !teacherEmails.includes(c.authorEmail)
    );
    
    // Get user's latest comment ranking proposal
    const userRankings = getUserCommentRankings(projectData, stageId, sessionResult.userEmail);
    
    // Get latest teacher comment rankings using unified utility
    const teacherRankings = getLatestTeacherCommentRankings(projectData, stageId);

    // Assemble ranking info for each comment
    stageComments.forEach(comment => {
      const commentId = comment.commentId;
      rankings[commentId] = {
        userVoteRank: userRankings[commentId] || null,
        teacherVoteRank: teacherRankings[commentId] || null,
        settlementRank: teacherRankings[commentId] || null // Use teacher ranking as settlement ranking
      };
    });

    return createSuccessResponse(rankings);

  } catch (error) {
    logErr('Get stage comment rankings error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get stage comment rankings');
  }
}

/**
 * Helper: Get user's comment rankings for a stage
 * @param {Object} projectData - Project data
 * @param {string} stageId - Stage ID
 * @param {string} userEmail - User email
 * @returns {Object} Comment ID to rank mapping
 */
function getUserCommentRankings(projectData, stageId, userEmail) {
  const proposals = getTableData(projectData, 'CommentRankingProposals')
    .filter(p => p.stageId === stageId && p.authorEmail === userEmail);
  
  if (proposals.length === 0) return {};
  
  // Get latest proposal
  proposals.sort((a, b) => (b.createdTime || 0) - (a.createdTime || 0));
  const latestProposal = proposals[0];
  
  if (!latestProposal.rankingData) return {};
  
  try {
    const rankingData = safeJsonParse(latestProposal.rankingData) || [];
    const rankings = {};
    rankingData.forEach(ranking => {
      if (ranking.commentId && ranking.rank) {
        rankings[ranking.commentId] = ranking.rank;
      }
    });
    return rankings;
  } catch (error) {
    console.warn('Failed to parse user comment ranking data:', error);
    return {};
  }
}

/**
 * Helper: Get latest teacher comment rankings for a stage
 * @param {Object} projectData - Project data  
 * @param {string} stageId - Stage ID
 * @returns {Object} Comment ID to rank mapping
 */
function getLatestTeacherCommentRankings(projectData, stageId) {
  const allRankings = getTableData(projectData, 'TeacherCommentRankings')
    .filter(r => r.stageId === stageId);
  
  if (allRankings.length === 0) return {};
  
  // Use unified utility to get latest rankings
  const latestRankings = getLatestTeacherRankings(allRankings, getCommentRankingKey);
  
  const rankingMap = {};
  latestRankings.forEach(ranking => {
    if (ranking.commentId && ranking.rank) {
      rankingMap[ranking.commentId] = ranking.rank;
    }
  });
  
  return rankingMap;
}

/**
 * Helper: Get latest student comment votes for a stage
 * @param {Object} projectData - Project data
 * @param {string} stageId - Stage ID
 * @returns {Array} Latest student votes
 */
function getLatestStudentCommentVotes(projectData, stageId) {
  const allProposals = getTableData(projectData, 'CommentRankingProposals')
    .filter(proposal => proposal.stageId === stageId);
  
  // Group by author and select latest
  const latestProposals = {};
  allProposals.forEach(proposal => {
    const authorEmail = proposal.authorEmail;
    if (!latestProposals[authorEmail] || 
        (proposal.createdTime || 0) > (latestProposals[authorEmail].createdTime || 0)) {
      latestProposals[authorEmail] = proposal;
    }
  });
  
  // Convert to voting format
  return Object.values(latestProposals).map(proposal => ({
    authorEmail: proposal.authorEmail,
    rankingData: safeJsonParse(proposal.rankingData) || []
  }));
}

/**
 * Helper: Get latest teacher comment votes for a stage
 * @param {Object} projectData - Project data
 * @param {string} stageId - Stage ID
 * @returns {Array} Latest teacher votes
 */
function getLatestTeacherCommentVotes(projectData, stageId) {
  const allRankings = getTableData(projectData, 'TeacherCommentRankings')
    .filter(ranking => ranking.stageId === stageId);
  
  // Use unified utility to get latest rankings
  const latestRankings = getLatestTeacherRankings(allRankings, getCommentRankingKey);
  
  // Group by teacher and convert to voting format
  const teacherGroups = {};
  latestRankings.forEach(ranking => {
    const teacherEmail = ranking.teacherEmail;
    if (!teacherGroups[teacherEmail]) {
      teacherGroups[teacherEmail] = {
        teacherEmail: teacherEmail,
        rankingData: []
      };
    }
    
    teacherGroups[teacherEmail].rankingData.push({
      commentId: ranking.commentId,
      rank: ranking.rank
    });
  });
  
  return Object.values(teacherGroups);
}

/**
 * Helper: Award points to top 3 comments
 * @param {Object} projectData - Project data
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {number} commentReward - Total reward pool
 * @param {Array} rankings - Comment rankings
 * @param {string} settlementId - Settlement ID for transaction tracking
 */
function awardCommentRewards(projectData, projectId, stageId, commentReward, rankings, settlementId) {
  if (commentReward <= 0) return;
  
  const top3Comments = rankings.filter(comment => comment.rank <= 3);
  
  // Award distribution: 1st: 50%, 2nd: 30%, 3rd: 20%
  const awardDistribution = { 1: 0.5, 2: 0.3, 3: 0.2 };
  
  top3Comments.forEach(comment => {
    const commentRecord = (projectData.comments || []).find(c => c.commentId === comment.commentId);
    if (commentRecord?.authorEmail) {
      const awardAmount = Math.ceil(commentReward * awardDistribution[comment.rank]);
      
      try {
        awardPoints(
          null, // System operation
          projectId,
          commentRecord.authorEmail,
          awardAmount,
          'comment_settlement',
          `階段評論第${comment.rank}名獎金`,
          comment.commentId,
          settlementId,
          stageId // 添加 stageId 參數
        );
        
        logInfo('Comment award', `Awarded ${awardAmount} points to ${commentRecord.authorEmail} for rank ${comment.rank} comment`, {
          projectId: projectId,
          stageId: stageId,
          commentId: comment.commentId,
          rank: comment.rank,
          amount: awardAmount
        });
      } catch (error) {
        logErr('Comment award error', error);
      }
    }
  });
}

/**
 * Create notifications in the notification system for mentioned users
 */
function createUserMentionNotificationsInSystem(projectId, stageId, commentId, mentionedUserEmails, authorEmail) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get stage data
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    // Get author name
    const author = globalData.users.find(u => u.userEmail === authorEmail);
    const authorName = author ? (author.displayName || author.username) : authorEmail;

    mentionedUserEmails.forEach(userEmail => {
      // Skip if user is mentioning themselves
      if (userEmail === authorEmail) return;
      
      // Get mentioned user name
      const mentionedUser = globalData.users.find(u => u.userEmail === userEmail);
      const mentionedUserName = mentionedUser ? (mentionedUser.displayName || mentionedUser.username) : userEmail;

      createNotification({
        targetUserEmail: userEmail,
        type: 'user_mention',
        title: `您被提及`,
        content: `${authorName} 在 ${projectName} - ${stageName} 的評論中提及了您`,
        projectId: projectId,
        stageId: stageId,
        commentId: commentId,
        relatedEntityId: userEmail,
        metadata: {
          authorEmail: authorEmail,
          authorName: authorName,
          mentionedUserName: mentionedUserName,
          projectName: projectName,
          stageName: stageName
        }
      });
    });

  } catch (error) {
    logErr('Create user mention notifications in system error', error);
  }
}

/**
 * Calculate comment rankings based on votes
 * Uses same weighted scoring logic as submission ranking for consistency
 */
function calculateCommentRankings(studentVotes, teacherVotes) {
  try {
    const teacherWeight = 0.3;
    const studentWeight = 0.7;
    
    // Collect all comment IDs that received votes
    const allCommentIds = new Set();
    
    studentVotes.forEach(vote => {
      if (vote.rankingData && Array.isArray(vote.rankingData)) {
        vote.rankingData.forEach(item => {
          if (item.commentId) {
            allCommentIds.add(item.commentId);
          }
        });
      }
    });
    
    teacherVotes.forEach(vote => {
      if (vote.rankingData && Array.isArray(vote.rankingData)) {
        vote.rankingData.forEach(item => {
          if (item.commentId) {
            allCommentIds.add(item.commentId);
          }
        });
      }
    });
    
    // Calculate weighted scores for each comment (same as submission logic)
    const commentScores = {};
    allCommentIds.forEach(commentId => {
      commentScores[commentId] = {
        commentId: commentId,
        studentScore: 0,
        teacherScore: 0,
        totalScore: 0,
        voterEmails: []
      };
    });
    
    // Student votes scoring (each voter gets equal weight within student group)
    const studentVoteWeight = studentVotes.length > 0 ? studentWeight / studentVotes.length : 0;
    studentVotes.forEach(vote => {
      if (vote.rankingData && Array.isArray(vote.rankingData)) {
        vote.rankingData.forEach(item => {
          if (item.commentId && commentScores[item.commentId]) {
            const rank = parseInt(item.rank);
            // Rank to score conversion: 1st=4pts, 2nd=3pts, 3rd=2pts (same as submission)
            const rankScore = Math.max(0, 5 - rank);
            commentScores[item.commentId].studentScore += rankScore * studentVoteWeight;
            commentScores[item.commentId].voterEmails.push(vote.authorEmail);
          }
        });
      }
    });
    
    // Teacher votes scoring (30% weight total, distributed among all teachers)
    teacherVotes.forEach(vote => {
      if (vote.rankingData && Array.isArray(vote.rankingData)) {
        vote.rankingData.forEach(item => {
          if (item.commentId && commentScores[item.commentId]) {
            const rank = parseInt(item.rank);
            // Same rank to score conversion as submissions
            const rankScore = Math.max(0, 5 - rank);
            commentScores[item.commentId].teacherScore = rankScore * teacherWeight;
            commentScores[item.commentId].voterEmails.push(vote.teacherEmail || vote.authorEmail);
          }
        });
      }
    });
    
    // Calculate total scores and final ranking (same as submission logic)
    Object.values(commentScores).forEach(score => {
      score.totalScore = score.studentScore + score.teacherScore;
    });
    
    // Sort by total score and handle ties (same as submission logic)
    const sortedScores = Object.values(commentScores)
      .sort((a, b) => b.totalScore - a.totalScore);
    
    // Handle tied rankings (same logic as submission)
    let currentRank = 1;
    for (let i = 0; i < sortedScores.length; i++) {
      const score = sortedScores[i];
      
      // If not first and same score as previous, use same rank
      if (i > 0 && Math.abs(sortedScores[i-1].totalScore - score.totalScore) < 0.001) {
        score.rank = sortedScores[i-1].rank;
      } else {
        score.rank = currentRank;
      }
      
      currentRank = i + 2; // Next different score rank
    }
    
    return {
      success: true,
      rankings: sortedScores,
      totalComments: allCommentIds.size
    };
    
  } catch (error) {
    logErr('Calculate comment rankings error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Settle comments for a stage (award points to top 3)
 */
function settleStageComments(projectId, stageId, settlementId = null) {
  try {
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      throw new Error('Stage not found');
    }
    
    // Get latest student comment votes using unified utility
    const studentVotes = getLatestStudentCommentVotes(projectData, stageId);
    
    // Get latest teacher comment votes using unified utility
    const teacherVotes = getLatestTeacherCommentVotes(projectData, stageId);
    
    console.log(`結算評論：使用 ${studentVotes.length} 筆最新的學生投票，${teacherVotes.length} 位教師投票`);
    
    // Calculate comment rankings
    const rankingResults = calculateCommentRankings(studentVotes, teacherVotes);
    
    if (!rankingResults.success) {
      throw new Error('Failed to calculate comment rankings: ' + rankingResults.error);
    }
    
    // 使用提供的settlementId或生成新的（向後兼容）
    const finalSettlementId = settlementId || generateIdWithType('comment_settlement');
    const settlementTime = getCurrentTimestamp();
    
    // 記錄評論結算歷史（如果這是獨立的評論結算）
    if (!settlementId) {
      const commentSettlementHistory = {
        settlementId: finalSettlementId,
        stageId: stageId,
        settlementType: 'comment',
        settlementTime: settlementTime,
        operatorEmail: 'system',
        totalRewardDistributed: stage.commentReward || 0,
        participantCount: rankingResults.rankings.length,
        status: 'active',
        reversedTime: null,
        reversedBy: null,
        reversedReason: null,
        settlementData: safeJsonStringify(rankingResults)
      };
      
      addRowToSheet(projectId, 'SettlementHistory', commentSettlementHistory);
    }
    
    // 記錄評論結算詳情
    rankingResults.rankings.forEach(comment => {
      const commentSettlement = {
        settlementId: finalSettlementId,
        stageId: stageId,
        commentId: comment.commentId,
        authorEmail: comment.voterEmails?.[0] || 'unknown', // 第一個投票者作為作者
        finalRank: comment.rank,
        studentScore: comment.studentScore || 0,
        teacherScore: comment.teacherScore || 0,
        totalScore: comment.totalScore || 0,
        allocatedPoints: comment.rank <= 3 ? getCommentRewardByRank(comment.rank, stage.commentRewardPool || 0) : 0,
        rewardPercentage: comment.rank <= 3 ? getCommentRewardPercentage(comment.rank) : 0
      };
      
      addRowToSheet(projectId, 'CommentSettlements', commentSettlement);
    });
    
    // Helper functions for comment reward calculation
    function getCommentRewardByRank(rank, totalReward) {
      const distribution = { 1: 0.5, 2: 0.3, 3: 0.2 };
      return Math.round(totalReward * (distribution[rank] || 0) * 100) / 100;
    }
    
    function getCommentRewardPercentage(rank) {
      const distribution = { 1: 50, 2: 30, 3: 20 };
      return distribution[rank] || 0;
    }
    
    // Award points to top 3 comments if reward pool exists
    awardCommentRewards(projectData, projectId, stageId, stage.commentRewardPool || 0, rankingResults.rankings, finalSettlementId);
    
    // Return settlement results
    const settlementData = {
      settlementId: finalSettlementId,
      projectId: projectId,
      stageId: stageId,
      rankings: rankingResults.rankings,
      settledTime: settlementTime,
      totalComments: rankingResults.totalComments,
      totalRewardDistributed: stage.commentRewardPool || 0
    };
    
    return {
      success: true,
      rankings: rankingResults.rankings,
      settlementData: settlementData
    };
    
  } catch (error) {
    logErr('Settle stage comments error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a single comment by ID
 */
function getSingleCommentDetails(sessionId, projectId, commentId) {
  try {
    console.log('=== getCommentDetails Debug ===');
    console.log('sessionId:', sessionId);
    console.log('projectId:', projectId);
    console.log('commentId:', commentId);
    console.log('Arguments length:', arguments.length);
    console.log('All arguments:', Array.from(arguments));
    
    // 檢查必要的函數是否存在
    console.log('validateSession function exists:', typeof validateSession);
    console.log('readProjectData function exists:', typeof readProjectData);
    console.log('getUserPermissions function exists:', typeof getUserPermissions);
    console.log('createErrorResponse function exists:', typeof createErrorResponse);
    console.log('createSuccessResponse function exists:', typeof createSuccessResponse);
    
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      console.log('Session validation failed');
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    console.log('Session valid for user:', sessionResult.userEmail);

    const projectData = readProjectData(projectId);
    console.log('Project data loaded, comments count:', projectData.comments?.length || 0);
    
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    console.log('User permissions:', permissions);
    
    // Check if user is an active project member
    const isActiveProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is system admin or has global access
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
    
    // Check if user has teacher privilege
    const teacherEmails = getTeacherPrivilegeUsers();
    const hasTeacherPrivilege = teacherEmails.includes(sessionResult.userEmail);
    
    // Global PM can always access comment details
    const isGlobalPMUser = isGlobalPM(sessionResult.userEmail);
    
    console.log('Access check - isAdmin:', isAdmin, 'hasGlobalAccess:', hasGlobalAccess, 'hasViewPermission:', permissions.includes('view'), 'isActiveProjectMember:', isActiveProjectMember, 'hasTeacherPrivilege:', hasTeacherPrivilege, 'isGlobalPM:', isGlobalPMUser);
    
    if (!permissions.includes('view') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess && !hasTeacherPrivilege && !isGlobalPMUser) {
      console.log('Access denied for user');
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view comment details');
    }

    const comment = projectData.comments.find(c => c.commentId === commentId);
    console.log('Comment search result:', comment ? 'Found' : 'Not found');
    if (comment) {
      console.log('Comment content preview:', comment.content ? comment.content.substring(0, 100) + '...' : 'No content');
    } else {
      console.log('Available comment IDs:', projectData.comments.map(c => c.commentId));
    }
    
    if (!comment) {
      return createErrorResponse('COMMENT_NOT_FOUND', 'Comment not found');
    }

    console.log('Returning success response with comment');
    return createSuccessResponse(comment);

  } catch (error) {
    console.error('=== getCommentDetails Exception ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', error);
    
    logErr('Get comment details error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get comment details: ' + error.message);
  }
}

/**
 * Get comment settlement results for analysis
 */
function getCommentSettlementAnalysis(sessionId, projectId, stageId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    if (stage.status !== 'completed') {
      return createErrorResponse('STAGE_NOT_COMPLETED', 'Stage must be completed to view comment settlement analysis');
    }
    
    // Get comment ranking data by recalculating from current data
    const rankingResult = getStageCommentRankings(sessionId, projectId, stageId);
    
    if (!rankingResult.success) {
      return createErrorResponse('RANKING_ERROR', 'Failed to get comment rankings: ' + rankingResult.error);
    }
    
    const rankings = rankingResult.data?.rankings || [];
    
    // Get all teacher emails to filter them out
    const teacherEmails = getTeacherPrivilegeUsers();
    
    // Get comment details for visualization (excluding teacher comments)
    const comments = projectData.comments.filter(c => 
      c.stageId === stageId && !teacherEmails.includes(c.authorEmail)
    );
    const enrichedRankings = rankings
      .filter(ranking => {
        const comment = comments.find(c => c.commentId === ranking.commentId);
        return comment !== undefined; // Only include rankings for non-teacher comments
      })
      .map(ranking => {
        const comment = comments.find(c => c.commentId === ranking.commentId);
        const author = projectData.users?.find(u => u.userEmail === comment?.authorEmail);
      
      return {
        ...ranking,
        authorEmail: comment?.authorEmail,
        authorName: author?.displayName || author?.username || comment?.authorEmail,
        commentPreview: comment?.content ? comment.content.substring(0, 5) : '',
        commentContent: comment?.content || ''
      };
    });
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      settlement: settlement,
      rankings: enrichedRankings,
      totalComments: settlement.totalComments,
      commentReward: stage.commentRewardPool || 0
    });
    
  } catch (error) {
    logErr('Get comment settlement analysis error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get comment settlement analysis');
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createComment,
    getStageComments,
    submitCommentRanking,
    checkUserVotingEligibility,
    getCommentRankings,
    getStageCommentRankings,
    calculateCommentRankings,
    settleStageComments,
    getSingleCommentDetails,
    getCommentSettlementAnalysis
  };
}