/**
 * @fileoverview Scoring engine for project stages
 * @module ScoringEngine
 */

// ============ SHARED UTILITIES (from comments_api.js) ============

/**
 * Get latest teacher rankings by selecting most recent createdTime for each unique key
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
 * Generate submission ranking key for grouping
 */
function getSubmissionRankingKey(ranking) {
  return `${ranking.teacherEmail}_${ranking.submissionId}`;
}

/**
 * Unified table data access with case-insensitive lookup
 */
function getTableData(projectData, tableName) {
  if (!projectData || !tableName) return [];
  
  const lowerName = tableName.toLowerCase();
  if (projectData[lowerName]) return projectData[lowerName];
  if (projectData[tableName]) return projectData[tableName];
  
  return [];
}

/**
 * Helper: Get latest teacher submission vote for a stage
 * @param {Object} projectData - Project data
 * @param {string} projectId - Project ID  
 * @param {string} stageId - Stage ID
 * @returns {Object|null} Teacher vote in format {rankings: {groupId: rank}} or null
 */
function getLatestTeacherSubmissionVote(projectData, projectId, stageId) {
  const allTeacherRankings = getTableData(projectData, 'TeacherSubmissionRankings')
    .filter(tr => tr.stageId === stageId && tr.projectId === projectId);
  
  if (allTeacherRankings.length === 0) {
    return null;
  }
  
  // Use unified utility to get latest rankings
  const latestRankings = getLatestTeacherRankings(allTeacherRankings, getSubmissionRankingKey);
  
  // Convert to voting format {groupId: rank}
  const rankings = {};
  latestRankings.forEach(ranking => {
    rankings[ranking.groupId] = ranking.rank;
  });
  
  console.log(`使用 ${latestRankings.length} 筆最新的教師排名`);
  return { rankings: rankings };
}

/**
 * 基準權重分配算法（參考 point_distribution_visualization.html）
 * @param {Object} teamRankings 各組排名 {groupId: rank}
 * @param {Object} participationProposals 各組參與度提案 {groupId: {memberEmail: ratio}}
 * @param {number} totalPoints 總分數
 * @returns {Object} 計分結果
 */
function calculateStageScores(teamRankings, participationProposals, totalPoints = 100) {
  try {
    // 動態計算排名權重：第1名=N，第2名=N-1，...最後一名=1（N=總組數）
    const totalGroups = Object.keys(teamRankings).length;
    const rankWeights = {};
    for (let i = 1; i <= totalGroups; i++) {
      rankWeights[i] = totalGroups - i + 1;
    }
    
    // 收集所有參與度比例，找到最小值（5%刻度）
    const allRatios = [];
    Object.values(participationProposals).forEach(proposal => {
      Object.values(proposal).forEach(ratio => {
        if (ratio > 0) allRatios.push(ratio);
      });
    });
    
    if (allRatios.length === 0) {
      throw new Error('No participation data found');
    }
    
    const minRatio = Math.min(...allRatios);
    
    // 計算每個人的權重和得分
    const individualScores = [];
    let totalWeight = 0;
    
    Object.entries(teamRankings).forEach(([groupId, rank]) => {
      const participation = participationProposals[groupId] || {};
      
      Object.entries(participation).forEach(([memberEmail, ratio]) => {
        if (ratio > 0) {
          // 基礎權重單位 = 參與度比例 / 全域最小比例（5%刻度系統）
          const baseWeightUnits = ratio / minRatio;
          // 最終權重 = 基礎權重 × 排名匯率倍數
          const finalWeight = rankWeights[rank] * baseWeightUnits;
          
          individualScores.push({
            groupId: groupId,
            memberEmail: memberEmail,
            rank: rank,
            participationRatio: ratio,
            baseWeightUnits: baseWeightUnits,
            rankMultiplier: rankWeights[rank],
            finalWeight: finalWeight,
            individualPoints: 0 // 稍後計算
          });
          
          totalWeight += finalWeight;
        }
      });
    });
    
    // 計算每個人的實際得分（無條件進位）
    const pointsPerWeight = totalPoints / totalWeight;
    individualScores.forEach(score => {
      score.individualPoints = Math.ceil(score.finalWeight * pointsPerWeight);
    });
    
    // 計算各組總分
    const teamScores = {};
    individualScores.forEach(score => {
      if (!teamScores[score.groupId]) {
        teamScores[score.groupId] = {
          groupId: score.groupId,
          rank: score.rank,
          totalPoints: 0,
          memberScores: []
        };
      }
      teamScores[score.groupId].totalPoints += score.individualPoints;
      teamScores[score.groupId].memberScores.push(score);
    });
    
    return {
      success: true,
      individualScores: individualScores,
      teamScores: teamScores,
      totalPoints: totalPoints,
      totalWeight: totalWeight,
      calculation: {
        rankWeights: rankWeights,
        minRatio: minRatio,
        pointsPerWeight: pointsPerWeight
      }
    };
    
  } catch (error) {
    logErr('Calculate stage scores error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 計算投票結果排名
 * @param {Array} studentVotes 學生投票 [{voterEmail, rankings: {groupId: rank}}]
 * @param {Object} teacherVote 老師投票 {rankings: {groupId: rank}}
 * @param {number} teacherWeight 老師權重 (預設0.3)
 * @returns {Object} 投票結果
 */
function calculateVotingResults(studentVotes, teacherVote, teacherWeight = 0.3) {
  try {
    const studentWeight = 1 - teacherWeight;
    
    // 收集所有參與的組別
    const allGroups = new Set();
    studentVotes.forEach(vote => {
      Object.keys(vote.rankings).forEach(groupId => allGroups.add(groupId));
    });
    if (teacherVote && teacherVote.rankings) {
      Object.keys(teacherVote.rankings).forEach(groupId => allGroups.add(groupId));
    }
    
    // 計算每個組別的加權分數
    const groupScores = {};
    allGroups.forEach(groupId => {
      groupScores[groupId] = { groupId, studentScore: 0, teacherScore: 0, totalScore: 0 };
    });
    
    // 學生投票分數計算 (每個投票者權重相等)
    const studentVoteWeight = studentWeight / studentVotes.length;
    studentVotes.forEach(vote => {
      Object.entries(vote.rankings).forEach(([groupId, rank]) => {
        // 排名越高分數越高 (第1名=4分, 第2名=3分, 第3名=2分, 第4名=1分)
        const rankScore = Math.max(0, 5 - rank);
        groupScores[groupId].studentScore += rankScore * studentVoteWeight;
      });
    });
    
    // 老師投票分數計算
    if (teacherVote && teacherVote.rankings) {
      Object.entries(teacherVote.rankings).forEach(([groupId, rank]) => {
        const rankScore = Math.max(0, 5 - rank);
        groupScores[groupId].teacherScore = rankScore * teacherWeight;
      });
    }
    
    // 計算總分和最終排名
    Object.values(groupScores).forEach(score => {
      score.totalScore = score.studentScore + score.teacherScore;
    });
    
    // 按總分排序並處理同分情況
    const sortedScores = Object.values(groupScores)
      .sort((a, b) => b.totalScore - a.totalScore);
    
    // 處理同分的排名邏輯
    const finalRankings = [];
    let currentRank = 1;
    
    for (let i = 0; i < sortedScores.length; i++) {
      const score = sortedScores[i];
      
      // 如果不是第一個且與前一個分數相同，使用相同排名
      if (i > 0 && Math.abs(sortedScores[i-1].totalScore - score.totalScore) < 0.001) {
        score.finalRank = finalRankings[i-1].finalRank;
      } else {
        score.finalRank = currentRank;
      }
      
      finalRankings.push(score);
      currentRank = i + 2; // 下一個不同分數的排名
    }
    
    // 轉換為 {groupId: rank} 格式
    const rankingMap = {};
    finalRankings.forEach(result => {
      rankingMap[result.groupId] = result.finalRank;
    });
    
    return {
      success: true,
      finalRankings: finalRankings,
      rankingMap: rankingMap,
      voteDetails: {
        studentVotes: studentVotes.length,
        hasTeacherVote: !!(teacherVote && teacherVote.rankings),
        teacherWeight: teacherWeight,
        studentWeight: studentWeight
      }
    };
    
  } catch (error) {
    logErr('Calculate voting results error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 生成可視化數據（用於前端D3.js圖表）
 * @param {Object} scoringResult calculateStageScores的結果
 * @returns {Object} D3.js可用的數據格式
 */
function generateVisualizationData(scoringResult) {
  try {
    if (!scoringResult.success) {
      throw new Error('Invalid scoring result');
    }
    
    const { individualScores, calculation } = scoringResult;
    
    // 轉換為可視化格式
    const visualData = {
      people: individualScores.map(score => ({
        groupId: score.groupId,
        memberEmail: score.memberEmail,
        rank: score.rank,
        name: score.memberEmail.split('@')[0], // 簡化顯示名稱
        roleRatio: score.participationRatio,
        finalWeight: score.finalWeight,
        individualPoints: score.individualPoints,
        displayName: `第${score.rank}名-${score.memberEmail.split('@')[0]}`
      })),
      calculation: calculation,
      colors: { 1: '#4CAF50', 2: '#2196F3', 3: '#FF9800', 4: '#F44336' }
    };
    
    return {
      success: true,
      data: visualData
    };
    
  } catch (error) {
    logErr('Generate visualization data error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 結算階段 - 完整的計分流程
 * @param {string} projectId 專案ID
 * @param {string} stageId 階段ID
 * @returns {Object} 結算結果
 */
function settleStage(projectId, stageId) {
  try {
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      throw new Error('Stage not found');
    }
    
    if (stage.status !== 'voting') {
      throw new Error('Stage must be in voting status to settle');
    }
    
    // 獲取該階段的所有投票
    const studentVotes = projectData.rankingproposals
      .filter(rp => rp.stageId === stageId && rp.status === 'submitted')
      .map(rp => ({
        voterEmail: rp.proposerEmail,
        rankings: JSON.parse(rp.rankingData || '{}')
      }));
    
    // Get latest teacher submission rankings using unified utility
    const teacherVote = getLatestTeacherSubmissionVote(projectData, projectId, stageId);
    
    // 計算投票結果
    const votingResults = calculateVotingResults(
      studentVotes,
      teacherVote
    );
    
    if (!votingResults.success) {
      throw new Error('Failed to calculate voting results: ' + votingResults.error);
    }
    
    // 獲取各組的參與度提案 (已提交的提交，排除withdrawn)
    const participationProposals = {};
    const groupSubmissionMap = {}; // 新增：groupId 到 submissionId 的映射
    const validSubmissions = projectData.submissions.filter(s => 
      s.stageId === stageId && s.status === 'submitted'
    );
    
    console.log(`階段 ${stageId} 的有效提交數量: ${validSubmissions.length}`);
    console.log('有效提交詳情:', validSubmissions.map(s => ({
      submissionId: s.submissionId,
      groupId: s.groupId,
      status: s.status,
      hasParticipationProposal: !!s.participationProposal
    })));
    
    validSubmissions.forEach(submission => {
      const proposal = JSON.parse(submission.participationProposal || '{}');
      participationProposals[submission.groupId] = proposal;
      groupSubmissionMap[submission.groupId] = submission.submissionId; // 記錄映射
      console.log(`組別 ${submission.groupId} 的參與度提案:`, proposal);
    });
    
    console.log('所有參與度提案:', participationProposals);
    
    // 計算分數
    const scoringResults = calculateStageScores(
      votingResults.rankingMap,
      participationProposals,
      stage.reportRewardPool || 100
    );
    
    if (!scoringResults.success) {
      throw new Error('Failed to calculate scores: ' + scoringResults.error);
    }
    
    // 生成結算ID
    const settlementId = generateIdWithType('settlement');
    const settlementTime = getCurrentTimestamp();
    
    // 更新階段狀態為completed
    updateSheetRow(projectId, 'Stages', 'stageId', stageId, {
      status: 'completed',
      settledTime: settlementTime,
      finalRankings: safeJsonStringify(votingResults.rankingMap),
      scoringResults: safeJsonStringify(scoringResults)
    });
    
    // 記錄結算歷史
    const settlementHistory = {
      settlementId: settlementId,
      stageId: stageId,
      settlementType: 'stage',
      settlementTime: settlementTime,
      operatorEmail: 'system', // 系統自動結算
      totalRewardDistributed: stage.reportRewardPool || 0,
      participantCount: Object.values(scoringResults.teamScores).reduce((count, team) => count + team.memberScores.length, 0),
      status: 'active',
      reversedTime: null,
      reversedBy: null,
      reversedReason: null,
      settlementData: safeJsonStringify(scoringResults)
    };
    
    addRowToSheet(projectId, 'SettlementHistory', settlementHistory);
    
    // 記錄階段結算詳情
    Object.values(scoringResults.teamScores).forEach(teamScore => {
      const stageSettlement = {
        settlementId: settlementId,
        stageId: stageId,
        groupId: teamScore.groupId,
        finalRank: teamScore.rank,
        studentScore: 0, // 需要從原始計算數據獲取
        teacherScore: 0, // 需要從原始計算數據獲取
        totalScore: teamScore.totalPoints,
        allocatedPoints: teamScore.totalPoints,
        memberEmails: safeJsonStringify(teamScore.memberScores.map(m => m.memberEmail)),
        memberPointsDistribution: safeJsonStringify(teamScore.memberScores)
      };
      
      addRowToSheet(projectId, 'StageSettlements', stageSettlement);
    });
    
    // 記錄錢包交易 (分數轉換為點數)
    console.log(`settleStage debug: stageId=${stageId}, projectId=${projectId}`);
    Object.values(scoringResults.teamScores).forEach(teamScore => {
      const submissionId = groupSubmissionMap[teamScore.groupId]; // 獲取該組的 submissionId
      console.log(`Processing team ${teamScore.groupId}, submissionId=${submissionId}`);
      teamScore.memberScores.forEach(memberScore => {
        console.log(`Awarding ${memberScore.individualPoints} points to ${memberScore.memberEmail} for stage ${stageId}`);
        awardPoints(
          null, // 系統操作，無session
          projectId,
          memberScore.memberEmail,
          memberScore.individualPoints,
          'stage_completion',
          `階段「${stage.stageName}」完成獎勵`,
          submissionId, // 傳入 submissionId 作為 relatedId
          settlementId, // 添加結算ID
          stageId // 傳入 stageId
        );
      });
    });
    
    // 結算評論 (同時進行，使用相同的settlementId)
    let commentSettlementResult = null;
    try {
      commentSettlementResult = settleStageComments(projectId, stageId, settlementId);
      if (commentSettlementResult.success) {
        logInfo('Comment settlement', `Successfully settled comments for stage ${stageId}`, {
          projectId: projectId,
          stageId: stageId,
          settlementId: settlementId,
          totalComments: commentSettlementResult.rankings?.length || 0
        });
      } else {
        logWarn('Comment settlement failed', commentSettlementResult.error);
      }
    } catch (error) {
      logErr('Comment settlement error during stage settlement', error);
    }
    
    // Calculate total points distributed
    let totalPoints = 0;
    Object.values(scoringResults.teamScores).forEach(teamScore => {
      teamScore.memberScores.forEach(memberScore => {
        totalPoints += memberScore.individualPoints;
      });
    });

    // Log stage settlement event
    logOperation(
      projectId,
      'system',
      'stage_settled',
      'settlement',
      settlementId,
      {
        stageId: stageId,
        stageName: stage.stageName,
        totalPoints: totalPoints,
        groupCount: Object.keys(scoringResults.teamScores).length,
        commentSettled: !!commentSettlementResult?.success
      }
    );

    return {
      success: true,
      stageId: stageId,
      votingResults: votingResults,
      scoringResults: scoringResults,
      commentSettlement: commentSettlementResult,
      settledTime: getCurrentTimestamp()
    };
    
  } catch (error) {
    logErr('Settle stage error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateStageScores,
    calculateVotingResults,
    generateVisualizationData,
    settleStage
  };
}