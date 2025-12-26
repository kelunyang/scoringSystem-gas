/**
 * @fileoverview Shared utilities for ranking operations across APIs
 * @module SharedRankingUtils
 */

// ============ SHARED DATA ACCESS ============

/**
 * Unified table data access with case-insensitive lookup
 * @param {Object} projectData - Project data object
 * @param {string} tableName - Table name (case-insensitive)
 * @returns {Array} Table data or empty array
 */
function getTableData(projectData, tableName) {
  if (!projectData || !tableName) return [];
  
  const lowerName = tableName.toLowerCase();
  if (projectData[lowerName]) return projectData[lowerName];
  if (projectData[tableName]) return projectData[tableName];
  
  return [];
}

// ============ PERMISSION VALIDATION ============

/**
 * Unified teacher permission validation
 * @param {string} userEmail - User email to check
 * @returns {boolean} Whether user has teacher privilege
 */
function validateTeacherPermission(userEmail) {
  if (!userEmail) return false;
  return hasTeacherPrivilege(userEmail);
}

// ============ RANKING UTILITIES ============

/**
 * Get latest teacher rankings by selecting most recent createdTime for each unique key
 * @param {Array} rankings - All teacher ranking records
 * @param {Function} keyFunction - Function to generate unique key for grouping
 * @returns {Array} Latest ranking records
 */
function getLatestTeacherRankings(rankings, keyFunction) {
  if (!rankings || !Array.isArray(rankings) || rankings.length === 0) {
    return [];
  }
  
  const latestMap = {};
  rankings.forEach(ranking => {
    const key = keyFunction(ranking);
    if (!latestMap[key] || (ranking.createdTime || 0) > (latestMap[key].createdTime || 0)) {
      latestMap[key] = ranking;
    }
  });
  
  return Object.values(latestMap);
}

/**
 * Generate comment ranking key for grouping
 * @param {Object} ranking - Comment ranking record
 * @returns {string} Unique key
 */
function getCommentRankingKey(ranking) {
  return `${ranking.teacherEmail}_${ranking.commentId}`;
}

/**
 * Generate submission ranking key for grouping
 * @param {Object} ranking - Submission ranking record
 * @returns {string} Unique key
 */
function getSubmissionRankingKey(ranking) {
  return `${ranking.teacherEmail}_${ranking.submissionId}`;
}

// ============ TEACHER RANKING HISTORY ============

/**
 * Helper: Get teacher ranking history for a specific table and stage
 * @param {Object} projectData - Project data
 * @param {string} tableName - Table name (TeacherSubmissionRankings or TeacherCommentRankings)
 * @param {string} stageId - Stage ID
 * @param {string} teacherEmail - Teacher email
 * @returns {Object|null} Ranking history or null
 */
function getTeacherRankingHistory(projectData, tableName, stageId, teacherEmail) {
  const rankings = getTableData(projectData, tableName)
    .filter(tr => tr.stageId === stageId && tr.teacherEmail === teacherEmail);
  
  if (rankings.length === 0) {
    return null;
  }
  
  // Get unique timestamps (each timestamp represents one voting session)
  const uniqueTimestamps = [...new Set(rankings.map(r => r.createdTime))].sort((a, b) => b - a);
  const latestTimestamp = uniqueTimestamps[0];
  
  // Count items in the latest voting session
  const latestSessionCount = rankings.filter(r => r.createdTime === latestTimestamp).length;
  
  return {
    createdTime: latestTimestamp,
    totalVersions: uniqueTimestamps.length,
    latestRankingCount: latestSessionCount,
    totalRecords: rankings.length
  };
}

// ============ STAGE VALIDATION ============

/**
 * Check if stage is active and allows modifications
 * @param {Object} stage - Stage object
 * @returns {Object} { isActive: boolean, reason?: string }
 */
function checkStageIsActive(stage) {
  if (!stage) {
    return { isActive: false, reason: 'Stage not found' };
  }
  
  // Check if stage status is pending
  if (stage.status !== 'pending') {
    return { isActive: false, reason: `Stage is not active. Current status: ${stage.status}` };
  }
  
  // Check if stage end date is in the future
  const currentTime = getCurrentTimestamp();
  if (stage.endDate && stage.endDate <= currentTime) {
    return { isActive: false, reason: 'Stage has ended' };
  }
  
  return { isActive: true };
}

// ============ FIND PROJECT BY STAGE ============

/**
 * Find project containing a specific stage
 * @param {string} stageId - Stage ID to find
 * @returns {Object|null} {projectData, projectId} or null
 */
function findProjectByStage(stageId) {
  const globalData = readGlobalData();
  if (!globalData?.projects) return null;
  
  for (const project of globalData.projects) {
    try {
      const projectData = readProjectData(project.projectId);
      const stage = projectData.stages?.find(s => s.stageId === stageId);
      if (stage) {
        return { projectData, projectId: project.projectId };
      }
    } catch (error) {
      continue; // Skip projects that can't be read
    }
  }
  
  return null;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTableData,
    validateTeacherPermission,
    getLatestTeacherRankings,
    getCommentRankingKey,
    getSubmissionRankingKey,
    getTeacherRankingHistory,
    checkStageIsActive,
    findProjectByStage
  };
}