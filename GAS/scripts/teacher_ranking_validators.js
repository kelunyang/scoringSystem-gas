/**
 * @fileoverview Validators for teacher ranking operations
 * @module TeacherRankingValidators
 */

/**
 * Validate submission rankings format and rules
 * @param {Array} submissions - Submission rankings
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateSubmissionRankings(submissions) {
  if (!Array.isArray(submissions)) {
    return { valid: false, error: 'Submissions must be an array' };
  }

  for (const ranking of submissions) {
    if (!ranking.targetId || typeof ranking.rank !== 'number' || ranking.rank < 1) {
      return { valid: false, error: 'Invalid submission ranking format' };
    }
  }

  return { valid: true };
}

/**
 * Validate comment rankings format and rules
 * @param {Array} comments - Comment rankings
 * @param {string} teacherEmail - Teacher's email
 * @param {Array} stageComments - All comments for the stage
 * @returns {Object} { valid: boolean, error?: string, errorCode?: string }
 */
function validateCommentRankings(comments, teacherEmail, stageComments) {
  if (!Array.isArray(comments)) {
    return { valid: false, error: 'Comments must be an array' };
  }

  // Basic format validation
  for (const ranking of comments) {
    if (!ranking.targetId || typeof ranking.rank !== 'number' || ranking.rank < 1) {
      return { valid: false, error: 'Invalid comment ranking format', errorCode: 'INVALID_INPUT' };
    }
  }

  // Cannot be empty
  if (comments.length === 0) {
    return { valid: false, error: 'At least one comment must be ranked', errorCode: 'NO_COMMENTS' };
  }

  // Maximum 3 comments
  if (comments.length > 3) {
    return { valid: false, error: 'Teachers can only rank up to 3 comments', errorCode: 'TOO_MANY_COMMENTS' };
  }

  // All rankings must be within top 3
  for (const ranking of comments) {
    if (ranking.rank > 3) {
      return { valid: false, error: 'All submitted comment rankings must be within top 3', errorCode: 'INVALID_RANK' };
    }
  }

  // Create comment map to avoid N+1 queries (O(n) instead of O(n²))
  const commentMap = new Map(stageComments.map(c => [c.commentId, c]));

  // Check self-voting
  for (const ranking of comments) {
    const commentBeingRanked = commentMap.get(ranking.targetId);
    if (commentBeingRanked && commentBeingRanked.authorEmail === teacherEmail) {
      return { valid: false, error: 'Teachers cannot vote for their own comments', errorCode: 'SELF_VOTING_NOT_ALLOWED' };
    }
  }

  // Check unique authors in top 3
  const topThreeAuthorEmails = new Set();
  
  for (const ranking of comments) {
    if (ranking.rank <= 3) {
      const commentBeingRanked = commentMap.get(ranking.targetId);
      if (commentBeingRanked) {
        const authorEmail = commentBeingRanked.authorEmail;
        
        if (topThreeAuthorEmails.has(authorEmail)) {
          return { 
            valid: false, 
            error: `Cannot have multiple comments from the same author (${authorEmail}) in top 3 rankings`, 
            errorCode: 'DUPLICATE_AUTHOR_TOP_THREE' 
          };
        }
        
        topThreeAuthorEmails.add(authorEmail);
      }
    }
  }

  return { valid: true };
}

/**
 * Process and persist submission rankings
 * @param {Array} submissions - Validated submission rankings
 * @param {Object} context - Context containing projectId, stageId, teacherEmail, timestamp
 * @returns {Array} Created ranking records
 */
function persistSubmissionRankings(submissions, context) {
  const { projectId, stageId, teacherEmail, timestamp } = context;
  const results = [];

  // Ensure table exists
  ensureTableExists(projectId, 'TeacherSubmissionRankings', [
    'teacherRankingId', 'stageId', 'projectId', 'teacherEmail', 'submissionId',
    'groupId', 'rank', 'createdTime'
  ]);

  for (const ranking of submissions) {
    const teacherRankingId = generateIdWithType('teacher_sub_ranking');
    
    const submissionRanking = {
      teacherRankingId: teacherRankingId,
      stageId: stageId,
      projectId: projectId,
      teacherEmail: teacherEmail,
      submissionId: ranking.targetId,
      groupId: ranking.groupId,
      rank: ranking.rank,
      createdTime: timestamp
    };

    addRowToSheet(projectId, 'TeacherSubmissionRankings', submissionRanking);
    results.push(submissionRanking);
  }

  return results;
}

/**
 * Process and persist comment rankings
 * @param {Array} comments - Validated comment rankings
 * @param {Object} context - Context containing projectId, stageId, teacherEmail, timestamp
 * @returns {Array} Created ranking records
 */
function persistCommentRankings(comments, context) {
  const { projectId, stageId, teacherEmail, timestamp } = context;
  const results = [];

  // Ensure table exists
  ensureTableExists(projectId, 'TeacherCommentRankings', [
    'teacherRankingId', 'stageId', 'projectId', 'teacherEmail', 'commentId',
    'authorEmail', 'rank', 'createdTime'
  ]);

  for (const ranking of comments) {
    const teacherRankingId = generateIdWithType('teacher_comment_ranking');
    
    const commentRanking = {
      teacherRankingId: teacherRankingId,
      stageId: stageId,
      projectId: projectId,
      teacherEmail: teacherEmail,
      commentId: ranking.targetId,
      authorEmail: ranking.authorEmail,
      rank: ranking.rank,
      createdTime: timestamp
    };

    addRowToSheet(projectId, 'TeacherCommentRankings', commentRanking);
    results.push(commentRanking);
  }

  return results;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateSubmissionRankings,
    validateCommentRankings,
    persistSubmissionRankings,
    persistCommentRankings
  };
}