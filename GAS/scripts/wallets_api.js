/**
 * @fileoverview Wallet and transaction API endpoints
 * @module WalletsAPI
 */

/**
 * Get user wallet information - 純帳本模式，只返回交易記錄
 */
function getUserWallet(sessionId, projectId, targetUserEmail = null) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const userEmail = targetUserEmail || sessionResult.userEmail;
    
    // Check permissions if viewing another user's wallet
    if (targetUserEmail && targetUserEmail !== sessionResult.userEmail) {
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
      
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
      
      // Global PM can always access wallets
      const isGlobalPMUser = isGlobalPM(sessionResult.userEmail);
      
      if (!permissions.includes('manage') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess && !hasTeacherPrivilege && !isGlobalPMUser) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view other wallets');
      }
    }

    const projectData = readProjectData(projectId);
    
    // 獲取所有交易記錄，前端自行計算餘額（區塊鏈概念）
    const transactions = projectData.transactions
      .filter(t => t.userEmail === userEmail)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(t => ({
        // Frontend expected fields
        id: t.transactionId,
        points: t.amount,
        description: t.source,
        stage: getStageNumberFromId(projectData.stages, t.stageId),
        timestamp: t.timestamp,
        
        // Additional metadata
        transactionType: t.transactionType,
        stageName: getStageNameFromId(projectData.stages, t.stageId),
        
        // Keep original fields for backward compatibility
        ...t
      }));

    // 最近 10 筆交易用於顯示
    const recentTransactions = transactions.slice(0, 10);

    return createSuccessResponse({
      userEmail: userEmail,
      transactions: transactions,           // 所有交易記錄供前端計算餘額
      recentTransactions: recentTransactions  // 近期交易記錄供顯示
    });

  } catch (error) {
    logErr('Get wallet error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get wallet');
  }
}

/**
 * Get user transaction history
 */
function getUserTransactions(sessionId, projectId, targetUserEmail = null, limit = 50) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const userEmail = targetUserEmail || sessionResult.userEmail;
    
    // Check permissions if viewing another user's transactions
    if (targetUserEmail && targetUserEmail !== sessionResult.userEmail) {
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view other transactions');
      }
    }

    const projectData = readProjectData(projectId);
    const transactions = projectData.transactions
      .filter(t => t.userEmail === userEmail)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(t => ({
        // Frontend expected fields
        id: t.transactionId,
        points: t.amount,
        description: t.source,
        stage: getStageNumberFromId(projectData.stages, t.stageId),
        timestamp: t.timestamp,
        
        // Additional metadata
        transactionType: t.transactionType,
        stageName: getStageNameFromId(projectData.stages, t.stageId),
        
        // Keep original fields for backward compatibility
        ...t
      }));

    return createSuccessResponse(transactions);

  } catch (error) {
    logErr('Get transactions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get transactions');
  }
}

/**
 * Get user transactions for a specific project (for wallet view)
 * Supports teacher privilege to view other users' transactions
 */
function getUserProjectTransactions(sessionId, projectId, targetUserEmail = null, limit = 1000) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    let userEmail = sessionResult.userEmail;
    
    // Check if requesting another user's transactions
    if (targetUserEmail && targetUserEmail !== sessionResult.userEmail) {
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
      
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
      
      // Global PM can always access transactions
      const isGlobalPMUser = isGlobalPM(sessionResult.userEmail);
      
      if (!permissions.includes('manage') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess && !hasTeacherPrivilege && !isGlobalPMUser) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view other users transactions');
      }
      
      userEmail = targetUserEmail;
    }

    const projectData = readProjectData(projectId);
    
    // Get users data for display names
    const usersMap = {};
    try {
      const globalWorkbook = getGlobalWorkbook();
      const usersSheet = globalWorkbook.getSheetByName('Users');
      if (usersSheet && usersSheet.getLastRow() > 1) {
        const usersRange = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn());
        const usersData = usersRange.getValues();
        const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
        
        usersData.forEach(row => {
          const user = {};
          headers.forEach((header, index) => {
            user[header] = row[index];
          });
          
          if (user.userEmail) {
            usersMap[user.userEmail] = {
              displayName: user.displayName || user.userEmail,
              username: user.username || user.userEmail
            };
          }
        });
      }
    } catch (error) {
      console.error('Error loading users data:', error);
    }

    // Get stages data for stage names
    const stagesMap = {};
    if (projectData.stages && projectData.stages.length > 0) {
      projectData.stages.forEach(stage => {
        stagesMap[stage.stageId] = {
          stageName: stage.stageName,
          stageOrder: stage.stageOrder
        };
      });
    }

    // Filter and format transactions
    const transactions = projectData.transactions
      .filter(t => t.userEmail === userEmail)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(t => {
        const userData = usersMap[t.userEmail] || {};
        const stageData = stagesMap[t.stageId] || {};
        
        return {
          // Frontend expected fields
          transactionId: t.transactionId,
          amount: t.amount,
          source: t.source,
          stageOrder: stageData.stageOrder || 1,
          stageName: stageData.stageName || '',
          timestamp: t.timestamp,
          transactionType: t.transactionType,
          
          // Additional fields
          userEmail: t.userEmail,
          displayName: userData.displayName || t.userEmail,
          username: userData.username || t.userEmail,
          stageId: t.stageId,
          settlementId: t.settlementId,
          relatedSubmissionId: t.relatedSubmissionId,
          relatedCommentId: t.relatedCommentId,
          metadata: t.metadata
        };
      });

    return createSuccessResponse(transactions);

  } catch (error) {
    logErr('Get user project transactions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user project transactions');
  }
}

/**
 * Get project users (for teacher privilege dropdown)
 */
function getProjectUsers(sessionId, projectId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user has teacher_privilege
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === sessionResult.userEmail);
    
    if (!user || !user.globalPermissions || !user.globalPermissions.includes('teacher_privilege')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view project users');
    }

    const projectData = readProjectData(projectId);
    
    // Get all users who are in any group in this project
    const projectUserEmails = new Set();
    
    // Add users from project groups
    if (projectData.usergroups) {
      projectData.usergroups.forEach(ug => {
        if (ug.isActive) {
          projectUserEmails.add(ug.userEmail);
        }
      });
    }
    
    // Add project creator
    const project = globalData.projects.find(p => p.projectId === projectId);
    if (project && project.createdBy) {
      projectUserEmails.add(project.createdBy);
    }

    // Get user details from global users table
    const projectUsers = [];
    globalData.users.forEach(u => {
      if (projectUserEmails.has(u.userEmail)) {
        projectUsers.push({
          userEmail: u.userEmail,
          displayName: u.displayName || u.userEmail,
          username: u.username || u.userEmail
        });
      }
    });

    // Sort by display name
    projectUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return createSuccessResponse(projectUsers);

  } catch (error) {
    logErr('Get project users error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project users');
  }
}

/**
 * Get user transactions across all projects they participate in
 * This is what frontend /wallets/transactions endpoint expects
 */
function getAllUserTransactions(sessionId, limit = 100) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const userEmail = sessionResult.userEmail;
    let allTransactions = [];
    
    // Get all projects that the user has access to
    const globalData = readGlobalData();
    const userProjects = [];
    
    for (const project of globalData.projects) {
      if (project.status !== 'active') continue;
      
      try {
        const projectData = readProjectData(project.projectId);
        
        // Check if user is member of any group in this project
        const userGroups = projectData.usergroups.filter(ug => 
          ug.userEmail === userEmail && ug.isActive
        );
        
        if (userGroups.length > 0 || project.createdBy === userEmail) {
          userProjects.push(project);
          
          // Get transactions for this project
          const projectTransactions = projectData.transactions
            .filter(t => t.userEmail === userEmail)
            .map(t => ({
              // Frontend expected fields
              id: t.transactionId,
              points: t.amount,
              description: t.source,
              stage: getStageNumberFromId(projectData.stages, t.stageId),
              timestamp: t.timestamp,
              
              // Additional metadata for frontend
              projectId: project.projectId,
              projectName: project.projectName,
              transactionType: t.transactionType,
              
              // Keep original fields for backward compatibility
              ...t,
              stageName: getStageNameFromId(projectData.stages, t.stageId)
            }));
            
          allTransactions = allTransactions.concat(projectTransactions);
        }
      } catch (error) {
        logWrn('Cannot access project', { projectId: project.projectId, error: error.message });
        continue;
      }
    }
    
    // Sort all transactions by timestamp (newest first)
    allTransactions.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    if (limit > 0) {
      allTransactions = allTransactions.slice(0, limit);
    }
    
    return createSuccessResponse({
      transactions: allTransactions,
      totalCount: allTransactions.length,
      userProjects: userProjects.map(p => ({
        projectId: p.projectId,
        projectName: p.projectName,
        status: p.status
      }))
    });
    
  } catch (error) {
    logErr('Get all user transactions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user transactions');
  }
}

/**
 * Helper function to get stage name from stage ID
 */
function getStageNameFromId(stages, stageId) {
  if (!stageId || !stages) return '';
  const stage = stages.find(s => s.stageId === stageId);
  return stage ? stage.stageName : '';
}

/**
 * Helper function to get stage number from stage ID
 */
function getStageNumberFromId(stages, stageId) {
  if (!stageId || !stages || !Array.isArray(stages)) return 1;
  const stage = stages.find(s => s.stageId === stageId);
  return stage ? (stage.stageOrder || 1) : 1;
}

/**
 * Award points to user (admin function) - 純帳本模式
 */
function awardPoints(sessionId, projectId, userEmail, amount, transactionType, source, relatedId = null, settlementId = null, stageId = null) {
  try {
    // 允許系統操作（sessionId = null）或有效的session
    let awardedBy = 'system';
    
    if (sessionId !== null) {
      const sessionResult = validateSession(sessionId);
      if (!sessionResult) {
        return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
      }

      // Check permissions for user operations
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to award points');
      }
      
      awardedBy = sessionResult.userEmail;
    }

    if (amount <= 0) {
      return createErrorResponse('INVALID_INPUT', 'Award amount must be positive');
    }

    // 無條件進位，確保不留小數
    amount = Math.ceil(amount);

    const timestamp = getCurrentTimestamp();

    // 只創建交易記錄，不維護錢包餘額（區塊鏈帳本概念）
    const transactionId = generateIdWithType('transaction');
    const finalStageId = stageId || getStageIdFromRelated(relatedId);
    
    // Debug log
    console.log(`awardPoints debug: transactionType=${transactionType}, stageId=${stageId}, relatedId=${relatedId}, finalStageId=${finalStageId}`);
    
    const transaction = {
      transactionId: transactionId,
      userEmail: userEmail,
      stageId: finalStageId,
      settlementId: settlementId,
      transactionType: transactionType,
      amount: amount,
      source: source,
      timestamp: timestamp,
      relatedSubmissionId: (transactionType.includes('submission') || transactionType === 'stage_completion') ? relatedId : null,
      relatedCommentId: transactionType.includes('comment') ? relatedId : null,
      metadata: safeJsonStringify({ awardedBy: awardedBy })
    };

    addRowToSheet(projectId, 'Transactions', transaction);
    
    // Send notification to the user who received the points (只在非系統操作時發送)
    if (sessionId !== null && awardedBy !== 'system') {
      sendPointsAwardedNotifications(projectId, finalStageId, userEmail, amount, source, awardedBy);
    }

    // 前端將根據交易記錄計算餘額
    return createSuccessResponse({
      transaction: transaction
    }, 'Points awarded successfully');

  } catch (error) {
    logErr('Award points error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to award points');
  }
}

/**
 * Get all transactions for a project (admin function)
 */
function getAllProjectTransactions(sessionId, projectId, limit = 200) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check permissions - must be system admin or project manager
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    
    if (!permissions.includes('manage') && !isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view all project transactions');
    }

    // Get users data for JOIN
    const usersMap = {};
    try {
      const globalWorkbook = getGlobalWorkbook();
      const usersSheet = globalWorkbook.getSheetByName('Users');
      if (usersSheet && usersSheet.getLastRow() > 1) {
        const usersRange = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn());
        const usersData = usersRange.getValues();
        const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
        
        usersData.forEach(row => {
          const user = {};
          headers.forEach((header, index) => {
            user[header] = row[index];
          });
          
          if (user.userEmail) {
            usersMap[user.userEmail] = {
              displayName: user.displayName || user.userEmail,
              username: user.username || user.userEmail
            };
          }
        });
      }
    } catch (error) {
      console.error('Error loading users data:', error);
      // Continue without user data - will use email as fallback
    }

    // Get stages data for JOIN
    const stagesMap = {};
    if (projectData.stages && projectData.stages.length > 0) {
      projectData.stages.forEach(stage => {
        stagesMap[stage.stageId] = {
          stageName: stage.stageName,
          stageOrder: stage.stageOrder
        };
      });
    }

    // Process transactions with JOIN data
    const transactions = projectData.transactions
      .map(transaction => {
        const userData = usersMap[transaction.userEmail] || {};
        const stageData = stagesMap[transaction.stageId] || {};
        
        return {
          ...transaction,
          displayName: userData.displayName || transaction.userEmail,
          username: userData.username || transaction.userEmail,
          stageName: stageData.stageName || '',
          stageOrder: stageData.stageOrder || 0
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return createSuccessResponse(transactions);

  } catch (error) {
    logErr('Get all project transactions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project transactions');
  }
}

/**
 * Reverse/cancel a transaction (admin function)
 */
function reverseTransaction(sessionId, projectId, transactionId, reason) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check permissions - must have teacher_privilege or be project manager
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);

    // Check for teacher_privilege
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasTeacherPrivilege = globalPermissions.includes('teacher_privilege');

    if (!permissions.includes('manage') && !hasTeacherPrivilege && !isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to reverse transactions');
    }

    // Validate reason
    if (!reason || !reason.trim()) {
      return createErrorResponse('INVALID_INPUT', 'Reversal reason is required');
    }

    // Find the original transaction
    const originalTransaction = projectData.transactions.find(t => t.transactionId === transactionId);
    if (!originalTransaction) {
      return createErrorResponse('TRANSACTION_NOT_FOUND', 'Original transaction not found');
    }

    // Check if transaction was already reversed
    const existingReversal = projectData.transactions.find(t =>
      t.relatedTransactionId === transactionId && t.transactionType === 'reversal'
    );
    if (existingReversal) {
      return createErrorResponse('ALREADY_REVERSED', 'Transaction has already been reversed');
    }

    const timestamp = getCurrentTimestamp();

    // Create reversal transaction (opposite amount)
    const reversalId = generateIdWithType('transaction');
    const reversalTransaction = {
      transactionId: reversalId,
      userEmail: originalTransaction.userEmail,
      stageId: originalTransaction.stageId,
      transactionType: 'reversal',
      amount: -originalTransaction.amount, // Opposite amount
      source: `撤銷：${originalTransaction.source}（理由：${reason.trim()}）`,
      timestamp: timestamp,
      relatedTransactionId: transactionId, // Link to original transaction
      metadata: safeJsonStringify({
        reversedBy: sessionResult.userEmail,
        originalTransactionId: transactionId,
        reason: reason.trim()
      })
    };

    // Add reversal transaction - 純帳本模式，不更新錢包餘額
    addRowToSheet(projectId, 'Transactions', reversalTransaction);

    // Log the reversal action
    logOperation(
      sessionResult.userEmail,
      'transaction_reversed',
      'transaction',
      transactionId,
      {
        projectId: projectId,
        affectedUser: originalTransaction.userEmail,
        originalAmount: originalTransaction.amount,
        reversalTransactionId: reversalId,
        reason: reason.trim()
      }
    );

    // Send notification about transaction reversal
    sendPointsAwardedNotifications(
      projectId,
      originalTransaction.stageId,
      originalTransaction.userEmail,
      -originalTransaction.amount,
      `撤銷：${originalTransaction.source}（理由：${reason.trim()}）`,
      sessionResult.userEmail
    );

    return createSuccessResponse({
      reversalTransaction: reversalTransaction,
      affectedUser: originalTransaction.userEmail,
      amountReversed: originalTransaction.amount
    }, 'Transaction reversed successfully');

  } catch (error) {
    logErr('Reverse transaction error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to reverse transaction');
  }
}

/**
 * Get project wallet leaderboard - 純帳本模式：從交易記錄計算排行榜
 */
function getWalletLeaderboard(sessionId, projectId, limit = 10) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    if (!permissions.includes('view')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view leaderboard');
    }

    // 從交易記錄計算每個用戶的餘額（區塊鏈帳本概念）
    const userBalances = {};
    
    projectData.transactions.forEach(transaction => {
      const userEmail = transaction.userEmail;
      if (!userBalances[userEmail]) {
        userBalances[userEmail] = {
          userEmail: userEmail,
          currentBalance: 0,
          totalEarned: 0,
          totalSpent: 0,
          transactionCount: 0
        };
      }
      
      const balance = userBalances[userEmail];
      balance.currentBalance += transaction.amount;
      balance.transactionCount += 1;
      
      if (transaction.amount > 0) {
        balance.totalEarned += transaction.amount;
      } else if (transaction.amount < 0) {
        balance.totalSpent += Math.abs(transaction.amount);
      }
    });

    // 轉換為陣列並排序
    const wallets = Object.values(userBalances)
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, limit)
      .map((wallet, index) => ({
        rank: index + 1,
        userEmail: wallet.userEmail,
        currentBalance: wallet.currentBalance,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
        transactionCount: wallet.transactionCount
      }));

    return createSuccessResponse(wallets);

  } catch (error) {
    logErr('Get leaderboard error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get leaderboard');
  }
}

/**
 * Get project wallet ladder for visualization
 * Returns different data based on user permissions
 */
function getProjectWalletLadder(sessionId, projectId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Get project and global data
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Check if user has teacher privilege using the proper method
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasTeacherPrivilege = globalPermissions.includes('teacher_privilege');

    // Check if user is project participant
    const isProjectParticipant = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is project creator
    const project = globalData.projects.find(p => p.projectId === projectId);
    const isProjectCreator = project && project.createdBy === sessionResult.userEmail;
    
    if (!isProjectParticipant && !isProjectCreator && !hasTeacherPrivilege) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view wallet ladder');
    }

    // 從交易記錄統計各用戶錢包總值
    const userBalances = {};
    
    projectData.transactions.forEach(transaction => {
      const userEmail = transaction.userEmail;
      if (!userBalances[userEmail]) {
        userBalances[userEmail] = 0;
      }
      userBalances[userEmail] += transaction.amount;
    });

    // 獲取用戶詳細資料
    const usersMap = {};
    try {
      globalData.users.forEach(u => {
        if (u.userEmail) {
          usersMap[u.userEmail] = {
            userId: u.userId,
            username: u.username,
            displayName: u.displayName || u.userEmail,
            avatarSeed: u.avatarSeed,
            avatarStyle: u.avatarStyle || 'avataaars',
            avatarOptions: safeJsonParse(u.avatarOptions, {
              backgroundColor: 'b6e3f4',
              clothesColor: '3c4858',
              skinColor: 'ae5d29'
            })
          };
        }
      });
    } catch (error) {
      logErr('Error loading users data', error);
    }

    // 處理數據並加入用戶資訊
    const walletData = Object.entries(userBalances)
      .map(([userEmail, balance]) => ({
        userEmail: userEmail,
        currentBalance: balance,
        ...usersMap[userEmail]
      }))
      .sort((a, b) => b.currentBalance - a.currentBalance);

    // 獲取專案分數範圍設定
    const scoreRangeMin = project?.scoreRangeMin || 65;
    const scoreRangeMax = project?.scoreRangeMax || 95;

    // 根據權限返回不同的數據
    if (hasTeacherPrivilege) {
      // 有teacher_privilege權限，返回所有用戶數據
      return createSuccessResponse({
        hasFullAccess: true,
        walletData: walletData,
        currentUserEmail: sessionResult.userEmail,
        scoreRangeMin: scoreRangeMin,
        scoreRangeMax: scoreRangeMax
      });
    } else {
      // 沒有teacher_privilege權限，只返回最高、最低和該用戶自己的數據
      const currentUserData = walletData.find(w => w.userEmail === sessionResult.userEmail);
      const highestWallet = walletData[0]; // 最高
      const lowestWallet = walletData[walletData.length - 1]; // 最低

      const limitedData = [];

      // 添加最高（遮罩displayName，除非是用戶自己）
      if (highestWallet) {
        const maskedHighest = Object.assign({}, highestWallet);
        if (highestWallet.userEmail !== sessionResult.userEmail) {
          maskedHighest.displayName = '最高分';
          maskedHighest.username = '最高分';
        }
        limitedData.push(maskedHighest);
      }

      // 添加用戶自己（如果不是最高或最低）
      if (currentUserData &&
          currentUserData.userEmail !== highestWallet?.userEmail &&
          currentUserData.userEmail !== lowestWallet?.userEmail) {
        limitedData.push(currentUserData);
      }

      // 添加最低（如果與最高不同，遮罩displayName，除非是用戶自己）
      if (lowestWallet && lowestWallet.userEmail !== highestWallet?.userEmail) {
        const maskedLowest = Object.assign({}, lowestWallet);
        if (lowestWallet.userEmail !== sessionResult.userEmail) {
          maskedLowest.displayName = '最低分';
          maskedLowest.username = '最低分';
        }
        limitedData.push(maskedLowest);
      }

      return createSuccessResponse({
        hasFullAccess: false,
        walletData: limitedData,
        currentUserEmail: sessionResult.userEmail,
        scoreRangeMin: scoreRangeMin,
        scoreRangeMax: scoreRangeMax
      });
    }

  } catch (error) {
    logErr('Get project wallet ladder error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project wallet ladder');
  }
}

/**
 * Helper function to extract stage ID from related entity ID
 */
function getStageIdFromRelated(relatedId) {
  // This is a simplified implementation
  // In a real system, you'd look up the related entity to get the stage ID
  return null;
}

/**
 * Send notification when a user receives wallet points
 */
function sendWalletRewardNotification(projectId, recipientEmail, amount, transactionType, source, awardedBy) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Skip notification if the awarder is the same as recipient (self-reward)
    if (awardedBy === recipientEmail) return;
    
    // Determine the appropriate title and message based on transaction type
    let title = '獲得點數獎勵';
    let content = `您在 ${projectName} 專案中獲得了 ${amount} 點獎勵`;
    
    // Customize message based on transaction type
    if (transactionType.includes('submission')) {
      title = '成果提交獎勵';
      content = `您的成果提交獲得了 ${amount} 點獎勵：${source}`;
    } else if (transactionType.includes('comment')) {
      title = '評論獎勵';
      content = `您的評論獲得了 ${amount} 點獎勵：${source}`;
    } else if (transactionType.includes('ranking')) {
      title = '排名獎勵';
      content = `您獲得了排名獎勵 ${amount} 點：${source}`;
    }
    
    createNotification({
      targetUserEmail: recipientEmail,
      type: 'wallet_reward',
      title: title,
      content: content,
      projectId: projectId,
      metadata: {
        projectName: projectName,
        amount: amount,
        transactionType: transactionType,
        source: source,
        awardedBy: awardedBy
      }
    });
    
  } catch (error) {
    logErr('Send wallet reward notification error', error);
  }
}

/**
 * Export project wallet summary for all participants
 * Returns CSV data with participant names and total points
 */
function exportProjectWalletSummary(sessionId, projectId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user has teacher privilege using the proper method
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasTeacherPrivilege = globalPermissions.includes('teacher_privilege');
    
    // Debug logging
    console.log('Export CSV Debug (Fixed):', {
      userEmail: sessionResult.userEmail,
      globalPermissions: globalPermissions,
      hasTeacherPrivilege: hasTeacherPrivilege
    });

    if (!hasTeacherPrivilege) {
      return createErrorResponse('ACCESS_DENIED', 'Only users with teacher_privilege can export project wallet summary');
    }

    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // 統計各用戶錢包總值
    const userBalances = {};
    
    projectData.transactions.forEach(transaction => {
      const userEmail = transaction.userEmail;
      if (!userBalances[userEmail]) {
        userBalances[userEmail] = 0;
      }
      userBalances[userEmail] += transaction.amount;
    });

    // 獲取所有專案參與者（包括創建者）
    const participantEmails = new Set();
    
    // 添加專案創建者
    if (project.createdBy) {
      participantEmails.add(project.createdBy);
    }
    
    // 添加所有活躍的群組成員
    projectData.usergroups.forEach(ug => {
      if (ug.isActive) {
        participantEmails.add(ug.userEmail);
      }
    });

    // 建立參與者資料對照表
    const usersMap = {};
    globalData.users.forEach(u => {
      if (u.userEmail) {
        usersMap[u.userEmail] = {
          userId: u.userId,
          username: u.username,
          displayName: u.displayName || u.userEmail,
          userEmail: u.userEmail
        };
      }
    });

    // 整理輸出資料
    const exportData = [];
    participantEmails.forEach(userEmail => {
      const userInfo = usersMap[userEmail] || {
        userId: '',
        username: userEmail,
        displayName: userEmail,
        userEmail: userEmail
      };
      
      const totalPoints = userBalances[userEmail] || 0;
      
      exportData.push({
        userId: userInfo.userId,
        username: userInfo.username,
        displayName: userInfo.displayName,
        userEmail: userInfo.userEmail,
        totalPoints: totalPoints
      });
    });

    // 按總點數排序（由高到低）
    exportData.sort((a, b) => b.totalPoints - a.totalPoints);

    // 計算百分制轉換分數（仿射變換）
    const allPoints = exportData.map(d => d.totalPoints);
    const minPoints = Math.min(...allPoints);
    const maxPoints = Math.max(...allPoints);
    
    // 使用專案設定的分數範圍，預設為65-95
    const scoreRangeMin = project.scoreRangeMin || 65;
    const scoreRangeMax = project.scoreRangeMax || 95;
    
    // 為每個參與者計算百分制分數
    exportData.forEach(participant => {
      if (maxPoints === minPoints) {
        // 如果所有人點數相同，給予最高分
        participant.percentileScore = scoreRangeMax;
      } else {
        // 仿射變換公式
        participant.percentileScore = Math.round(
          (scoreRangeMin + (participant.totalPoints - minPoints) / (maxPoints - minPoints) * (scoreRangeMax - scoreRangeMin)) * 10
        ) / 10;
      }
    });

    // 生成CSV內容
    const headers = ['用戶ID', '用戶名', '顯示名稱', '電子郵件', '總點數', '百分制分數'];
    const csvRows = [headers];
    
    exportData.forEach(participant => {
      csvRows.push([
        participant.userId,
        participant.username,
        participant.displayName,
        participant.userEmail,
        participant.totalPoints.toString(),
        participant.percentileScore.toString()
      ]);
    });

    // 轉換為CSV字串
    const csvContent = csvRows
      .map(row => row.map(field => `"${(field || '').toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // 添加BOM
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;

    // 生成檔案名稱
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const projectName = project.projectName || '專案';
    const fileName = `專案總點數_${projectName}_${timestamp}.csv`;

    return createSuccessResponse({
      csvContent: csvWithBOM,
      fileName: fileName,
      projectName: project.projectName,
      participantCount: exportData.length,
      exportTime: getCurrentTimestamp()
    }, 'Project wallet summary exported successfully');

  } catch (error) {
    logErr('Export project wallet summary error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to export project wallet summary');
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getUserWallet,
    getUserTransactions,
    getUserProjectTransactions,
    getProjectUsers,
    getAllUserTransactions,
    awardPoints,
    getAllProjectTransactions,
    reverseTransaction,
    getWalletLeaderboard,
    getProjectWalletLadder,
    exportProjectWalletSummary
  };
}