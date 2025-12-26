/**
 * @fileoverview Scoring and ranking API endpoints
 * @module ScoringAPI
 */

// Import shared utilities
// Note: In GAS environment, all scripts share the same global scope
// These functions are available from shared_ranking_utils.js

// ============ SHARED UTILITIES ============
// The following functions are imported from shared_ranking_utils.js:
// - getLatestTeacherRankings
// - getTableData
// - getCommentRankingKey
// - getSubmissionRankingKey
// - findProjectByStage

/**
 * 提交組別排名投票
 */
function submitRankingVote(sessionId, projectId, stageId, rankings) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if stage is in voting status
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    if (stage.status !== 'voting') {
      return createErrorResponse('INVALID_STAGE_STATUS', 'Stage is not in voting phase');
    }
    
    // Check if user has permission to vote
    // Teachers can always vote regardless of project permissions
    const hasTeacherPrivilegeUser = hasTeacherPrivilege(sessionResult.userEmail);
    
    if (!hasTeacherPrivilegeUser) {
      const userPermissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!userPermissions.includes('vote')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to vote');
      }
    }
    
    // Validate rankings format
    if (!rankings || typeof rankings !== 'object') {
      return createErrorResponse('INVALID_INPUT', 'Rankings must be an object');
    }
    
    // Check if user already voted
    const existingVote = projectData.rankingproposals.find(rp => 
      rp.stageId === stageId && rp.proposerEmail === sessionResult.userEmail
    );
    
    const proposalId = existingVote ? existingVote.proposalId : generateIdWithType('proposal');
    const timestamp = getCurrentTimestamp();
    
    // Determine vote status - Teacher votes are marked as teacher votes
    const voteStatus = hasTeacherPrivilegeUser ? 'teacher_vote' : 'submitted';
    
    const rankingData = {
      proposalId: proposalId,
      stageId: stageId,
      groupId: null, // Individual vote, not group-specific
      proposerEmail: sessionResult.userEmail,
      rankingData: safeJsonStringify(rankings),
      status: voteStatus,
      createdTime: timestamp,
      lastModified: timestamp
    };
    
    if (existingVote) {
      // Update existing vote
      updateSheetRow(projectId, 'RankingProposals', 'proposalId', proposalId, {
        rankingData: rankingData.rankingData,
        status: voteStatus,
        lastModified: timestamp
      });
    } else {
      // Create new vote
      addRowToSheet(projectId, 'RankingProposals', rankingData);
    }
    
    // Log ranking vote event (different action based on stage status)
    const voteAction = stage.status === 'active' ? 'consensus_vote_submitted' : 'ranking_vote_submitted';
    logOperation(
      projectId,
      sessionResult.userEmail,
      voteAction,
      'vote',
      proposalId,
      {
        stageId: stageId,
        voteType: stage.status === 'active' ? 'submission_consensus' : 'submission_ranking',
        groupCount: Object.keys(rankings).length
      }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      proposalId: proposalId,
      isUpdate: !!existingVote
    }, existingVote ? 'Vote updated successfully' : 'Vote submitted successfully');
    
  } catch (error) {
    logErr('Submit ranking vote error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to submit vote');
  }
}

/**
 * 獲取階段投票狀況
 */
function getStageVotingStatus(sessionId, projectId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Get all votes for this stage
    const votes = projectData.rankingproposals.filter(rp => 
      rp.stageId === stageId && rp.status === 'submitted'
    );
    
    // Get all eligible voters
    const eligibleVoters = projectData.usergroups
      .filter(ug => ug.isActive)
      .map(ug => ug.userEmail);
    
    // Check current user's vote
    const currentUserVote = votes.find(v => v.proposerEmail === sessionResult.userEmail);
    
    const votingStatus = {
      stageId: stageId,
      stageName: stage.stageName,
      status: stage.status,
      totalEligibleVoters: eligibleVoters.length,
      submittedVotes: votes.length,
      votingProgress: votes.length / eligibleVoters.length,
      currentUserVoted: !!currentUserVote,
      currentUserVote: currentUserVote ? JSON.parse(currentUserVote.rankingData || '{}') : null,
      votes: votes.map(v => ({
        proposalId: v.proposalId,
        voterEmail: v.proposerEmail,
        submittedTime: v.createdTime,
        lastModified: v.lastModified
      }))
    };
    
    return createSuccessResponseWithSession(sessionId, votingStatus);
    
  } catch (error) {
    logErr('Get stage voting status error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get voting status');
  }
}

/**
 * 計算階段分數預覽 (不實際結算)
 */
function previewStageScores(sessionId, projectId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is PM
    const projectData = readProjectData(projectId);
    const userPermissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    if (!userPermissions.includes('manage')) {
      return createErrorResponse('ACCESS_DENIED', 'Only PMs can preview scores');
    }
    
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Get voting results
    const studentVotes = projectData.rankingproposals
      .filter(rp => rp.stageId === stageId && rp.status === 'submitted')
      .map(rp => ({
        voterEmail: rp.proposerEmail,
        rankings: JSON.parse(rp.rankingData || '{}')
      }));
    
    const teacherVote = projectData.rankingproposals
      .find(rp => rp.stageId === stageId && rp.status === 'teacher_vote');
    
    // Calculate voting results
    const votingResults = calculateVotingResults(
      studentVotes,
      teacherVote ? { rankings: JSON.parse(teacherVote.rankingData || '{}') } : null
    );
    
    if (!votingResults.success) {
      return createErrorResponse('CALCULATION_ERROR', 'Failed to calculate voting results: ' + votingResults.error);
    }
    
    // Get participation proposals
    const participationProposals = {};
    const approvedSubmissions = projectData.submissions.filter(s => 
      s.stageId === stageId && s.status === 'approved'
    );
    
    approvedSubmissions.forEach(submission => {
      participationProposals[submission.groupId] = JSON.parse(submission.participationProposal || '{}');
    });
    
    // Calculate scores
    const scoringResults = calculateStageScores(
      votingResults.rankingMap,
      participationProposals,
      stage.totalPoints || 100
    );
    
    if (!scoringResults.success) {
      return createErrorResponse('CALCULATION_ERROR', 'Failed to calculate scores: ' + scoringResults.error);
    }
    
    // Generate visualization data
    const visualizationData = generateVisualizationData(scoringResults);
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      stageName: stage.stageName,
      votingResults: votingResults,
      scoringResults: scoringResults,
      visualizationData: visualizationData,
      previewOnly: true
    });
    
  } catch (error) {
    logErr('Preview stage scores error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to preview scores');
  }
}

/**
 * 結算階段 (限總PM使用)
 */
function settleStageAPI(sessionId, projectId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is Global PM or System Admin
    if (!isGlobalPM(sessionResult.userEmail) && !isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only Global PM or System Admin can settle stages');
    }
    
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    if (stage.status !== 'voting') {
      return createErrorResponse('INVALID_STAGE_STATUS', 'Stage must be in voting status to settle');
    }
    
    // Use scoring engine to settle
    const settlementResult = settleStage(projectId, stageId);
    
    if (!settlementResult.success) {
      return createErrorResponse('SETTLEMENT_ERROR', 'Failed to settle stage: ' + settlementResult.error);
    }
    
    // Generate visualization data for completed stage
    const visualizationData = generateVisualizationData(settlementResult.scoringResults);
    
    // Log the settlement
    logOperation(
      sessionResult.userEmail,
      'stage_settled',
      'stage',
      stageId,
      {
        projectId: projectId,
        finalRankings: settlementResult.votingResults.rankingMap,
        totalPointsDistributed: settlementResult.scoringResults.totalPoints
      }
    );
    
    // Send notifications to all participants about settlement
    sendStageSettlementNotifications(projectId, stageId, sessionResult.userEmail);
    
    return createSuccessResponseWithSession(sessionId, {
      ...settlementResult,
      visualizationData: visualizationData
    }, 'Stage settled successfully');
    
  } catch (error) {
    logErr('Settle stage API error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to settle stage');
  }
}

/**
 * 獲取已結算階段的計分結果
 */
function getSettledStageResults(sessionId, projectId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    if (stage.status !== 'completed' || !stage.scoringResults) {
      return createErrorResponse('STAGE_NOT_SETTLED', 'Stage has not been settled yet');
    }
    
    const scoringResults = JSON.parse(stage.scoringResults);
    const finalRankings = JSON.parse(stage.finalRankings || '{}');
    const visualizationData = generateVisualizationData(scoringResults);
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      stageName: stage.stageName,
      settledTime: stage.settledTime,
      finalRankings: finalRankings,
      scoringResults: scoringResults,
      visualizationData: visualizationData
    });
    
  } catch (error) {
    logErr('Get settled stage results error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get stage results');
  }
}

/**
 * 發送階段結算完成通知
 */
function sendStageSettledNotifications(projectId, stageId, stageName, settlerEmail) {
  try {
    const globalData = readGlobalData();
    const projectData = readProjectData(projectId);
    
    const project = globalData.projects.find(p => p.projectId === projectId);
    if (!project) return;
    
    // Get all project participants
    const participants = projectData.usergroups
      .filter(ug => ug.isActive)
      .map(ug => ug.userEmail);
    
    // Create notifications for each participant
    participants.forEach(userEmail => {
      createNotification({
        targetUserEmail: userEmail,
        type: 'stage_settled',
        title: `階段已結算 - ${stageName}`,
        content: `階段「${stageName}」已完成投票並結算，點數已分配完成。請查看您的錢包和專案詳情。`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: stageId
      });
    });
    
    logInfo('Sent stage settled notifications', {
      projectId: projectId,
      stageId: stageId,
      participantCount: participants.length
    });
    
  } catch (error) {
    logErr('Send stage settled notifications error', error);
  }
}

/**
 * Get voting analysis for completed stage
 */
function getVotingAnalysis(sessionId, projectId, stageId) {
  try {
    // Validate session
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
      return createErrorResponse('INVALID_STAGE_STATUS', 'Stage must be completed to view voting analysis');
    }
    
    // 檢查權限 - 只有項目參與者可以查看
    const isProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const isGlobalPM = hasTeacherPrivilege(sessionResult.userEmail);
    
    if (!isProjectMember && !isAdmin && !isGlobalPM) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view voting analysis');
    }
    
    // 獲取已結算的排名數據
    let finalRankings, votingResults;
    
    if (stage.finalRankings && stage.scoringResults) {
      try {
        finalRankings = JSON.parse(stage.finalRankings);
        votingResults = JSON.parse(stage.scoringResults);
      } catch (error) {
        return createErrorResponse('DATA_ERROR', 'Failed to parse stage results');
      }
    } else {
      return createErrorResponse('NO_DATA', 'No voting analysis data available');
    }
    
    // 獲取學生和教師投票數據
    const studentVotes = projectData.rankingproposals
      .filter(rp => rp.stageId === stageId && rp.status === 'submitted')
      .map(rp => ({
        voterEmail: rp.proposerEmail,
        rankings: JSON.parse(rp.rankingData || '{}')
      }));
      
    const teacherVote = projectData.rankingproposals
      .find(rp => rp.stageId === stageId && rp.status === 'teacher_vote');
      
    // 構建詳細的計票分析數據
    const rankingDetails = [];
    
    // 獲取群組資訊
    const groups = projectData.groups || [];
    
    Object.entries(finalRankings).forEach(([groupId, rank]) => {
      const group = groups.find(g => g.groupId === groupId);
      const groupName = group ? group.groupName : `群組 ${groupId}`;
      
      // 計算學生投票詳情
      let studentVoteCount = 0;
      let studentTotalScore = 0;
      
      studentVotes.forEach(vote => {
        if (vote.rankings[groupId]) {
          studentVoteCount++;
          const rankScore = Math.max(0, 5 - vote.rankings[groupId]);
          studentTotalScore += rankScore;
        }
      });
      
      const studentScore = studentVoteCount > 0 ? (studentTotalScore / studentVoteCount) * 0.7 : 0;
      
      // 計算教師投票詳情
      let teacherVoteCount = 0;
      let teacherScore = 0;
      
      if (teacherVote && teacherVote.rankings) {
        const teacherRankings = JSON.parse(teacherVote.rankings);
        if (teacherRankings[groupId]) {
          teacherVoteCount = 1;
          const rankScore = Math.max(0, 5 - teacherRankings[groupId]);
          teacherScore = rankScore * 0.3;
        }
      }
      
      const totalScore = studentScore + teacherScore;
      
      rankingDetails.push({
        groupId,
        groupName,
        rank: parseInt(rank),
        studentScore,
        teacherScore,
        totalScore,
        studentVoteCount,
        teacherVoteCount
      });
    });
    
    // 按排名排序
    rankingDetails.sort((a, b) => a.rank - b.rank);
    
    return createSuccessResponseWithSession(sessionId, {
      rankingDetails,
      voteStatistics: {
        totalStudentVotes: studentVotes.length,
        hasTeacherVote: !!teacherVote,
        totalGroups: rankingDetails.length
      },
      stageInfo: {
        stageId,
        stageName: stage.stageName,
        settledTime: stage.settledTime
      }
    }, 'Voting analysis retrieved successfully');
    
  } catch (error) {
    logErr('Get voting analysis error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get voting analysis');
  }
}

/**
 * 獲取階段成果投票數據（用於VotingAnalysisModal）
 */
function getVotingData(sessionId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Find project containing this stage using unified utility
    const projectInfo = findProjectByStage(stageId);
    if (!projectInfo) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    const { projectData, projectId } = projectInfo;
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    // Get student voting data (RankingProposals with status=active) - DO NOT CHANGE status filter
    const studentVotes = getTableData(projectData, 'RankingProposals')
      .filter(rp => rp.stageId === stageId && rp.status === 'active')
      .map(rp => ({
        proposalId: rp.proposalId,
        stageId: rp.stageId,
        groupId: rp.groupId,
        proposerEmail: rp.proposerEmail,
        rankingData: safeJsonParse(rp.rankingData) || []
      }));
    
    // Get latest teacher submission voting data using unified utility
    const allTeacherVotes = getTableData(projectData, 'TeacherSubmissionRankings')
      .filter(tsr => tsr.stageId === stageId && tsr.projectId === projectId);
    
    const latestTeacherVotes = getLatestTeacherRankings(allTeacherVotes, getSubmissionRankingKey);
    
    // Convert teacher votes to ranking format by teacher
    const teacherRankingData = convertTeacherSubmissionVotesToRankingFormat(latestTeacherVotes);
    
    // Get group information
    const groupInfo = (projectData.groups || []).map(group => ({
      groupId: group.groupId,
      groupName: group.groupName
    }));
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      stageName: stage.stageName,
      studentVotes: studentVotes,
      teacherVotes: teacherRankingData,
      groupInfo: groupInfo
    });
    
  } catch (error) {
    logErr('Get voting data error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get voting data');
  }
}

/**
 * Helper: Convert teacher submission votes to ranking format grouped by teacher
 */
function convertTeacherSubmissionVotesToRankingFormat(teacherVotes) {
  const teacherEmailGroups = {};
  
  teacherVotes.forEach(tv => {
    if (!teacherEmailGroups[tv.teacherEmail]) {
      teacherEmailGroups[tv.teacherEmail] = [];
    }
    teacherEmailGroups[tv.teacherEmail].push({
      groupId: tv.groupId,
      submissionId: tv.submissionId,
      rank: tv.rank
    });
  });
  
  return Object.keys(teacherEmailGroups).map(teacherEmail => ({
    teacherEmail,
    rankingData: teacherEmailGroups[teacherEmail]
      .sort((a, b) => a.rank - b.rank)
      .map((item, index) => ({
        rank: index + 1, // Ensure consecutive ranks
        groupId: item.groupId,
        submissionId: item.submissionId
      }))
  }));
}

/**
 * 獲取評論投票數據（用於CommentVotingAnalysisModal）
 */
function getCommentVotingData(sessionId, stageId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Find project containing this stage using unified utility
    const projectInfo = findProjectByStage(stageId);
    if (!projectInfo) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    const { projectData, projectId } = projectInfo;
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    // Get student comment voting data using unified table access
    const studentVotes = getTableData(projectData, 'CommentRankingProposals')
      .filter(crp => crp.stageId === stageId)
      .map(crp => ({
        stageId: crp.stageId,
        authorEmail: crp.authorEmail,
        rankingData: safeJsonParse(crp.rankingData) || []
      }));
    
    // Get latest teacher comment voting data using unified utility
    const allTeacherVotes = getTableData(projectData, 'TeacherCommentRankings')
      .filter(tcr => tcr.stageId === stageId && tcr.projectId === projectId);
    
    const latestTeacherVotes = getLatestTeacherRankings(allTeacherVotes, getCommentRankingKey);
    
    // Convert teacher votes to ranking format by teacher
    const teacherRankingData = convertTeacherCommentVotesToRankingFormat(latestTeacherVotes);
    
    // Get comment information for all voted comments
    const allCommentIds = collectCommentIds(studentVotes, teacherRankingData);
    const commentInfo = getCommentDetails(projectData, stageId, allCommentIds);
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      stageName: stage.stageName,
      studentVotes: studentVotes,
      teacherVotes: teacherRankingData,
      commentInfo: commentInfo
    });
    
  } catch (error) {
    logErr('Get comment voting data error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get comment voting data');
  }
}

/**
 * Helper: Convert teacher votes to ranking format grouped by teacher
 */
function convertTeacherCommentVotesToRankingFormat(teacherVotes) {
  const teacherEmailGroups = {};
  
  teacherVotes.forEach(tv => {
    if (!teacherEmailGroups[tv.teacherEmail]) {
      teacherEmailGroups[tv.teacherEmail] = [];
    }
    teacherEmailGroups[tv.teacherEmail].push({
      commentId: tv.commentId,
      authorEmail: tv.authorEmail,
      rank: tv.rank
    });
  });
  
  return Object.keys(teacherEmailGroups).map(teacherEmail => ({
    teacherEmail,
    rankingData: teacherEmailGroups[teacherEmail]
      .sort((a, b) => a.rank - b.rank)
      .map((item, index) => ({
        rank: index + 1, // Ensure consecutive ranks
        commentId: item.commentId,
        authorEmail: item.authorEmail
      }))
  }));
}

/**
 * Helper: Collect all comment IDs from voting data
 */
function collectCommentIds(studentVotes, teacherRankingData) {
  const allCommentIds = new Set();
  
  // From student votes
  studentVotes.forEach(vote => {
    vote.rankingData.forEach(ranking => {
      if (ranking.commentId) {
        allCommentIds.add(ranking.commentId);
      }
    });
  });
  
  // From teacher votes
  teacherRankingData.forEach(vote => {
    vote.rankingData.forEach(ranking => {
      if (ranking.commentId) {
        allCommentIds.add(ranking.commentId);
      }
    });
  });
  
  return allCommentIds;
}

/**
 * Helper: Get comment details for specific comment IDs
 */
function getCommentDetails(projectData, stageId, commentIds) {
  return (projectData.comments || [])
    .filter(comment => 
      comment.stageId === stageId && 
      commentIds.has(comment.commentId)
    )
    .map(comment => ({
      commentId: comment.commentId,
      stageId: comment.stageId,
      authorEmail: comment.authorEmail,
      content: comment.content
    }));
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    submitRankingVote,
    getStageVotingStatus,
    previewStageScores,
    settleStageAPI,
    getSettledStageResults,
    getVotingAnalysis,
    sendStageSettledNotifications,
    getVotingData,
    getCommentVotingData
  };
}