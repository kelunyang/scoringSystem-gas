/**
 * @fileoverview Route handlers for API router - 模組化路由處理器
 * @module RouteHandlers
 */

/**
 * 處理認證相關路由
 */
function handleAuthRoutes(path, params) {
  switch (path) {
    case '/auth/login':
      return authenticateUser(params.userEmail, params.password);
      
    case '/auth/login-verify-password':
      // Verify Turnstile token first
      const loginVerifyResult = verifyTurnstileToken(params.turnstileToken);
      if (!loginVerifyResult.success && !loginVerifyResult.bypassed) {
        return loginVerifyResult;
      }
      return verifyPasswordAndSend2FA(params.userEmail, params.password);
      
    case '/auth/login-verify-2fa':
      return completeTwoFactorLogin(params.userEmail, params.verificationCode);
      
    case '/auth/resend-2fa':
      return resendVerificationCode(params.userEmail);
      
    case '/auth/logout':
      return logoutUser(params.sessionId);
      
    case '/auth/register':
      return handleRegister(params);
      
    case '/auth/change-password':
      return changePassword(params.sessionId, params.oldPassword, params.newPassword);
      
    case '/auth/current-user':
      return getCurrentUser(params.sessionId);
      
    case '/auth/verify-email-for-reset':
      return verifyEmailForReset(params);

    case '/auth/reset-password':
      // Verify Turnstile token first
      const resetVerifyResult = verifyTurnstileToken(params.turnstileToken);
      if (!resetVerifyResult.success && !resetVerifyResult.bypassed) {
        return resetVerifyResult;
      }
      return handleResetPassword(params);
      
    case '/auth/check-username':
      return checkUsernameAvailability(params.username);
      
    case '/auth/check-email':
      return checkEmailAvailability(params.userEmail);
      
    default:
      return null;
  }
}

/**
 * 處理用戶相關路由
 */
function handleUserRoutes(path, method, params) {
  switch (path) {
    case '/users/profile':
      if (method === 'GET') {
        return getUserProfile(params.sessionId, params.userId);
      } else {
        return updateUserProfile(params.sessionId, params.updates || params);
      }
      
    case '/users/search':
      return searchUsers(params.sessionId, params.query, params.limit);
      
    case '/users/shared-tags':
      return getUsersBySharedTags(params.sessionId);
      
    case '/users/projects':
      return getUserProjects(params.sessionId, params.userId);
      
    case '/users/stats':
      return getUserStats(params.sessionId, params.userId);
      
    case '/users/avatar/update':
      return updateUserAvatar(params.sessionId, params.avatarData || params);
      
    case '/users/avatar/regenerate':
      return regenerateAvatarSeed(params.sessionId);
      
    default:
      return null;
  }
}

/**
 * 處理專案相關路由
 */
function handleProjectRoutes(path, params) {
  switch (path) {
    case '/projects/create':
      return createProject(params.sessionId, params.projectData || params);
      
    case '/projects/list':
      return listUserProjects(params.sessionId, params.filters);
      
    case '/projects/list-with-stages':
      return getProjectListWithStages(params.sessionId, params.filters);
      
    case '/projects/get':
      return getProject(params.sessionId, params.projectId);
      
    case '/projects/update':
      return updateProject(params.sessionId, params.projectId, params.updates || params);
      
    case '/projects/delete':
      return deleteProject(params.sessionId, params.projectId);
      
    case '/projects/clone':
      return cloneProject(params.sessionId, params.projectId, params.newProjectName);
      
    case '/projects/core':
      return getProjectCore(params.sessionId, params.projectId);
      
    case '/projects/content':
      return getProjectContent(params.sessionId, params.projectId, params.stageId, params.contentType, params.excludeTeachers);
      
    case '/projects/users':
      return getProjectUsers(params.sessionId, params.projectId);
      
    // case '/projects/complete-data':
    //   return getCompleteProjectData(params.sessionId, params.projectId);
      
    // case '/projects/export':
    //   return exportProject(params.sessionId, params.projectId, params.format);
      
    default:
      return null;
  }
}

/**
 * 處理群組相關路由
 */
function handleGroupRoutes(path, params) {
  switch (path) {
    case '/groups/create':
      return createGroup(params.sessionId, params.projectId, params.groupData || params);
      
    case '/groups/list':
      return listProjectGroups(params.sessionId, params.projectId, params.includeInactive);
      
    case '/groups/get':
    case '/groups/details':
      return getGroup(params.sessionId, params.projectId, params.groupId);
      
    case '/groups/update':
      return updateGroup(params.sessionId, params.projectId, params.groupId, params.updates || params);
      
    case '/groups/delete':
      return deleteGroup(params.sessionId, params.projectId, params.groupId);
      
    case '/groups/add-member':
    case '/groups/add-user':
      return addUserToGroup(params.sessionId, params.projectId, params.groupId, params.userEmail, params.role);
      
    case '/groups/remove-member':
    case '/groups/remove-user':
      return removeUserFromGroup(params.sessionId, params.projectId, params.groupId, params.userEmail);
      
    case '/groups/set-role':
      return setGroupRole(params.sessionId, params.projectId, params.groupId, params.groupRole, params.permissions);
      
    default:
      return null;
  }
}

/**
 * 處理階段相關路由
 */
function handleStageRoutes(path, params) {
  switch (path) {
    case '/stages/create':
      return createStage(params.sessionId, params.projectId, params.stageData || params);
      
    case '/stages/list':
      return listProjectStages(params.sessionId, params.projectId);
      
    case '/stages/get':
      return getStage(params.sessionId, params.projectId, params.stageId);
      
    case '/stages/update':
      return updateStage(params.sessionId, params.projectId, params.stageId, params.updates || params);
      
    case '/stages/clone':
      return cloneStage(params.sessionId, params.projectId, params.stageId, params.newStageName);
      
    case '/stages/config':
      return updateStageConfig(params.sessionId, params.projectId, params.stageId, params.configUpdates || params);
      
    case '/stages/force-transition':
      return forceStageTransition(params.sessionId, params.projectId, params.stageId, params.newStatus);
      
    default:
      return null;
  }
}

/**
 * 處理提交和排名相關路由
 */
function handleSubmissionRoutes(path, params) {
  switch (path) {
    case '/submissions/submit':
      return submitDeliverable(params.sessionId, params.projectId, params.stageId, params.submissionData || params);
      
    case '/submissions/list':
      return getStageSubmissions(params.sessionId, params.projectId, params.stageId);
      
    case '/submissions/versions':
      return getSubmissionVersions(params.sessionId, params.projectId, params.stageId, params.options || {});
      
    case '/submissions/voting-history':
      return getGroupStageVotingHistory(params.sessionId, params.projectId, params.stageId, params.groupId);
      
    case '/submissions/approve-vote':
      return voteApproveGroupSubmission(params.sessionId, params.projectId, params.stageId, params.submissionId, params.agree, params.comment);
      
    case '/submissions/approval-votes':
      return getGroupSubmissionApprovalVotes(params.sessionId, params.projectId, params.stageId, params.submissionId);
      
    case '/submissions/delete':
      return deleteSubmission(params.sessionId, params.projectId, params.submissionId);
      
    case '/submissions/withdraw':
      return withdrawSubmission(params.sessionId, params.projectId, params.submissionId);
      
    case '/submissions/confirm-participation':
      return voteParticipationProposal(params.sessionId, params.projectId, params.stageId, params.submissionId, params.agree);
      
    case '/submissions/participation-status':
      return getParticipationConfirmations(params.sessionId, params.projectId, params.stageId, params.submissionId);
      
    case '/submissions/restore':
      return restoreSubmissionVersion(params.sessionId, params.projectId, params.stageId, params.submissionId);
      
    case '/submissions/details':
      return getSubmissionDetails(params.sessionId, params.projectId, params.submissionId);
      
    case '/rankings/submit':
      return submitGroupRanking(params.sessionId, params.projectId, params.stageId, params.rankingData || params);
      
    case '/rankings/vote':
      return voteOnRankingProposal(params.sessionId, params.projectId, params.proposalId, params.agree, params.comment);
      
    case '/rankings/stage-vote':
      return submitRankingVote(params.sessionId, params.projectId, params.stageId, params.rankings);
      
    case '/rankings/voting-status':
      return getStageVotingStatus(params.sessionId, params.projectId, params.stageId);
      
    case '/rankings/teacher-vote':
      return voteTeacherRanking(params.sessionId, params.projectId, params.stageId, params.rankings);
      
    case '/rankings/teacher-rankings':
      return getTeacherRankings(params.sessionId, params.projectId, params.stageId);
      
    case '/rankings/teacher-comprehensive-vote':
      return submitTeacherComprehensiveVote(params.sessionId, params.projectId, params.stageId, params.rankings);
      
    case '/rankings/teacher-vote-history':
      return getTeacherVoteHistory(params.sessionId, params.projectId, params.stageId);
      
    case '/rankings/stage-rankings':
      return getStageRankings(params.sessionId, params.projectId, params.stageId);
      
    case '/rankings/proposals':
      const options = {
        groupId: params.groupId || null,
        includeVersionHistory: params.includeVersionHistory !== false
      };
      return getStageRankingProposals(params.sessionId, params.projectId, params.stageId, options);
      
    default:
      return null;
  }
}

/**
 * 處理計分相關路由
 */
function handleScoringRoutes(path, params) {
  switch (path) {
    case '/scoring/preview':
      return previewStageScores(params.sessionId, params.projectId, params.stageId);
      
    case '/scoring/settle':
      return settleStageAPI(params.sessionId, params.projectId, params.stageId);
      
    case '/scoring/results':
      return getSettledStageResults(params.sessionId, params.projectId, params.stageId);
      
    case '/scoring/voting-analysis':
      return getVotingAnalysis(params.sessionId, params.projectId, params.stageId);
      
    case '/scoring/voting-data':
      return getVotingData(params.sessionId, params.stageId);
      
    case '/scoring/comment-voting-data':
      return getCommentVotingData(params.sessionId, params.stageId);
      
    // Settlement management routes
    case '/scoring/settlement/reverse':
      return reverseSettlement(params.sessionId, params.projectId, params.settlementId, params.reason);
      
    case '/scoring/settlement/history':
      return getSettlementHistory(params.sessionId, params.projectId, params.filters || {});
      
    case '/scoring/settlement/details':
      return getSettlementDetails(params.sessionId, params.projectId, params.settlementId);
      
    case '/scoring/settlement/transactions':
      return getSettlementTransactions(params.sessionId, params.projectId, params.settlementId);
      
    case '/scoring/settlement/stage-rankings':
      return getStageSettlementRankings(params.sessionId, params.projectId, params.stageId);
      
    case '/scoring/settlement/comment-rankings':
      return getCommentSettlementRankings(params.sessionId, params.projectId, params.stageId);
      
    default:
      return null;
  }
}

/**
 * 處理評論相關路由
 */
function handleCommentRoutes(path, params) {
  console.log('=== handleCommentRoutes ===');
  console.log('Path:', path);
  console.log('Params keys:', Object.keys(params));
  
  switch (path) {
    case '/comments/create':
      return createComment(params.sessionId, params.projectId, params.stageId, params.commentData || params);
      
    case '/comments/list':
    case '/comments/stage':
      return getStageComments(params.sessionId, params.projectId, params.stageId, params);
      
    case '/comments/ranking':
      return submitCommentRanking(params.sessionId, params.projectId, params.stageId, params.rankingData || params);
      
    case '/comments/rankings':
      return getCommentRankings(params.sessionId, params.projectId, params.stageId, params.commentId);
      
    case '/comments/stage-rankings':
      return getStageCommentRankings(params.sessionId, params.projectId, params.stageId);
      
    case '/comments/settlement-analysis':
      return getCommentSettlementAnalysis(params.sessionId, params.projectId, params.stageId);
      
    case '/comments/voting-eligibility':
      return checkUserVotingEligibility(params.sessionId, params.projectId, params.stageId);
      
    case '/comments/details':
      console.log('=== Comments Details Route ===');
      console.log('Route params:', params);
      console.log('sessionId:', params.sessionId);
      console.log('projectId:', params.projectId);
      console.log('commentId:', params.commentId);
      console.log('getSingleCommentDetails function type:', typeof getSingleCommentDetails);
      console.log('getSingleCommentDetails function exists in global scope:', typeof globalThis.getSingleCommentDetails);
      
      if (typeof getSingleCommentDetails !== 'function') {
        console.error('getSingleCommentDetails function is not available!');
        return createErrorResponse('FUNCTION_NOT_FOUND', 'getSingleCommentDetails function is not available');
      }
      
      console.log('About to call getSingleCommentDetails...');
      const result = getSingleCommentDetails(params.sessionId, params.projectId, params.commentId);
      console.log('getSingleCommentDetails result:', result);
      return result;
      
    default:
      return null;
  }
}

/**
 * 處理錢包相關路由
 */
function handleWalletRoutes(path, params) {
  switch (path) {
    // case '/wallets/get':
    //   return getUserWallet(params.sessionId, params.projectId, params.userEmail);
      
    case '/wallets/transactions':
      return getAllUserTransactions(params.sessionId, params.limit);
      
    case '/wallets/user-transactions':
      return getUserProjectTransactions(params.sessionId, params.projectId, params.targetUserEmail, params.limit);
      
    case '/wallets/project-transactions':
      return getAllProjectTransactions(params.sessionId, params.projectId, params.limit);
      
    case '/wallets/reverse-transaction':
      return reverseTransaction(params.sessionId, params.projectId, params.transactionId);
      
    case '/wallets/leaderboard':
      return getWalletLeaderboard(params.sessionId, params.projectId, params.limit);
      
    case '/wallets/award':
      return awardPoints(params.sessionId, params.projectId, params.userEmail, params.amount, params.transactionType, params.source, params.relatedId, params.settlementId, params.stageId);
      
    case '/wallets/project-ladder':
      return getProjectWalletLadder(params.sessionId, params.projectId);
      
    case '/wallets/export-project-summary':
      return exportProjectWalletSummary(params.sessionId, params.projectId);
      
    default:
      return null;
  }
}

/**
 * 處理通知相關路由
 */
function handleNotificationRoutes(path, params) {
  switch (path) {
    case '/notifications/count':
      return getUserNotificationCount(params.sessionId);
      
    case '/notifications/list':
      return getUserNotifications(params.sessionId, params);
      
    case '/notifications/mark-read':
      return markNotificationAsRead(params.sessionId, params.notificationId);
      
    case '/notifications/mark-all-read':
      return markAllNotificationsAsRead(params.sessionId);
      
    case '/notifications/delete':
      return deleteNotification(params.sessionId, params.notificationId);
      
    default:
      return null;
  }
}

/**
 * 處理邀請碼相關路由
 */
function handleInvitationRoutes(path, params, sessionId) {
  switch (path) {
    case '/invitations/generate':
      const creatorEmail = getCurrentUserEmail(sessionId);
      if (!creatorEmail) {
        return createErrorResponse('SESSION_INVALID', 'Invalid session');
      }
      
      // Check permissions - user must have generate_invites permission
      const userPermissions = getUserGlobalPermissions(creatorEmail);
      if (!userPermissions.includes('generate_invites')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to generate invitation codes');
      }
      
      return generateInvitationCode(creatorEmail, params.targetEmail, params.validDays, params.defaultTags, params.defaultGlobalGroups);
      
    case '/invitations/generate-batch':
      const batchCreatorEmail = getCurrentUserEmail(sessionId);
      if (!batchCreatorEmail) {
        return createErrorResponse('SESSION_INVALID', 'Invalid session');
      }
      
      // Check permissions - user must have generate_invites permission
      const batchUserPermissions = getUserGlobalPermissions(batchCreatorEmail);
      if (!batchUserPermissions.includes('generate_invites')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to generate invitation codes');
      }
      
      return generateBatchInvitationCodes(batchCreatorEmail, params.targetEmails, params.validDays, params.defaultTags, params.defaultGlobalGroups);
      
    case '/invitations/validate':
      return validateInvitationCode(params.invitationCode);
      
    case '/invitations/verify':
      // Verify Turnstile token first
      const inviteVerifyResult = verifyTurnstileToken(params.turnstileToken);
      if (!inviteVerifyResult.success && !inviteVerifyResult.bypassed) {
        return inviteVerifyResult;
      }
      return handleVerifyInvitationCode(params);
      
    case '/invitations/list':
      const listUserEmail = getCurrentUserEmail(sessionId);
      if (!listUserEmail) {
        return createErrorResponse('SESSION_INVALID', 'Invalid session');
      }
      
      // Check if user has admin permissions
      const listUserPermissions = getUserGlobalPermissions(listUserEmail);
      if (listUserPermissions.includes('system_admin') || listUserPermissions.includes('manage_users')) {
        // Admin can see all invitations
        return getAllInvitations();
      } else {
        // Regular user can only see their own invitations
        return getUserInvitations(listUserEmail);
      }
      
    case '/invitations/deactivate':
      const currentUserEmail = getCurrentUserEmail(sessionId);
      return currentUserEmail ? deactivateInvitation(params.invitationId, currentUserEmail) : createErrorResponse('SESSION_INVALID', 'Invalid session');
      
    case '/invitations/delete':
      const deleteUserEmail = getCurrentUserEmail(sessionId);
      return deleteUserEmail ? deleteInvitation(params.invitationId, deleteUserEmail) : createErrorResponse('SESSION_INVALID', 'Invalid session');
      
    default:
      return null;
  }
}

/**
 * 處理標籤相關路由
 */
function handleTagRoutes(path, params) {
  switch (path) {
    case '/tags/create':
      return createTag(params.sessionId, params.tagData || params);
      
    case '/tags/list':
      return getTags(params.sessionId, params.filters || {});
      
    case '/tags/update':
      return updateTag(params.sessionId, params.tagId, params.updates || params);
      
    case '/tags/delete':
      return deleteTag(params.sessionId, params.tagId);
      
    case '/tags/assign/project':
      return assignTagToProject(params.sessionId, params.projectId, params.tagId);
      
    case '/tags/assign/user':
      return assignTagToUser(params.sessionId, params.userEmail, params.tagId);
      
    case '/tags/remove/project':
      return removeTagFromProject(params.sessionId, params.projectId, params.tagId);
      
    case '/tags/remove/user':
      return removeTagFromUser(params.sessionId, params.userEmail, params.tagId);
      
    case '/tags/project':
      return getProjectTags(params.sessionId, params.projectId);
      
    case '/tags/user':
      return getUserTags(params.sessionId, params.userEmail);
      
    case '/tags/assignments/users':
      // Get all user tag assignments for admin view
      return getAllUserTagAssignments(params.sessionId);
      
    case '/tags/assignments/projects':
      // Get all project tag assignments for admin view
      return getAllProjectTagAssignments(params.sessionId);
      
    case '/tags/batch/user':
      return batchUpdateUserTags(params.sessionId, params.userEmail, params.tagOperations || params.operations);
      
    case '/tags/batch/project':
      return batchUpdateProjectTags(params.sessionId, params.projectId, params.tagOperations || params.operations);
      
    default:
      return null;
  }
}

/**
 * 處理系統相關路由
 */
function handleSystemRoutes(path, method, params) {
  switch (path) {
    case '/system/initialize':
      if (method === 'POST') {
        initializeDatabase();
        return createSuccessResponse(null, 'Database initialized');
      } else {
        return createErrorResponse('METHOD_NOT_ALLOWED', 'POST method required');
      }
      
    case '/system/health':
      return createSuccessResponse({
        status: 'healthy',
        timestamp: getCurrentTimestamp(),
        version: '1.0.0'
      });
      
    case '/system/logs':
      return getSystemLogsWithAuth(params.sessionId, params);
      
    case '/system/logs/stats':
      return getLogStatisticsWithAuth(params.sessionId);
      
    case '/system/logs/archive':
      return archiveLogsWithAuth(params.sessionId, params.maxRows || 50000);
      
    case '/system/console-logging/status':
      return createSuccessResponse({
        enabled: getConsoleLoggingStatus(),
        currentSetting: getConsoleLoggingStatus() ? 'enabled' : 'disabled',
        description: getConsoleLoggingStatus() 
          ? 'Console output enabled for both frontend and backend'
          : 'Console output disabled for both frontend and backend'
      });
      
    case '/system/stage-patrol/setup':
      if (method === 'POST') {
        return setupStagePatrolTrigger();
      } else {
        return createErrorResponse('METHOD_NOT_ALLOWED', 'POST method required');
      }
      
    case '/system/stage-patrol/test':
      if (method === 'POST') {
        return testStagePatrol();
      } else {
        return createErrorResponse('METHOD_NOT_ALLOWED', 'POST method required');
      }

    case '/system/turnstile-config':
      // 公開 API，不需要認證
      return getTurnstileConfig();

    default:
      return null;
  }
}

/**
 * 處理管理員相關路由
 */
function handleAdminRoutes(path, method, params) {
  switch (path) {
    case '/admin/users/list':
      return getAllUsers(params.sessionId);
      
    case '/admin/users/list-all':
      return getAllUsersWithTags(params.sessionId);
      
    case '/admin/users/update-status':
      return updateUserStatus(params.sessionId, params.userEmail, params.status);
      
    case '/admin/users/reset-password':
      return resetUserPassword(params.sessionId, params.userEmail, params.newPassword);
      
    case '/admin/system/stats':
      return getSystemStats(params.sessionId);
      
    case '/admin/system/logs':
      return getSystemLogsWithAuth(params.sessionId, { limit: params.limit });
      
    case '/admin/global-groups':
    case '/admin/global-groups/list':
      return getGlobalGroups(params.sessionId);
      
    case '/admin/create-global-group':
      return createGlobalGroup(params.sessionId, params);
      
    case '/admin/update-global-group':
      return updateGlobalGroup(params.sessionId, params.groupId, params);
      
    case '/admin/deactivate-global-group':
      return deactivateGlobalGroup(params.sessionId, params.groupId);
      
    case '/admin/activate-global-group':
      return activateGlobalGroup(params.sessionId, params.groupId);
      
    case '/admin/user-profile':
      return updateUserProfile(params.sessionId, params);
      
    case '/admin/user-global-groups':
    case '/admin/users/global-groups':
      return getUserGlobalGroups(params.sessionId, params.userEmail);
      
    case '/admin/user-project-groups':
      return getUserProjectGroups(params.sessionId, params.userEmail);
      
    case '/admin/add-user-to-global-group':
    case '/admin/global-groups/add-user':
      return addUserToGlobalGroup(params.sessionId, params.groupId, params.userEmail);
      
    case '/admin/remove-user-from-global-group':
    case '/admin/global-groups/remove-user':
      return removeUserFromGlobalGroup(params.sessionId, params.groupId, params.userEmail);
      
    case '/admin/global-groups/members':
      return getGlobalGroupMembers(params.sessionId, params.groupId);
      
    case '/admin/global-groups/batch-add-users':
      return batchAddUsersToGlobalGroup(params.sessionId, params.groupId, params.userEmails);
      
    case '/admin/global-groups/batch-remove-users':
      return batchRemoveUsersFromGlobalGroup(params.sessionId, params.groupId, params.userEmails);
      
    case '/admin/notifications/list':
      return listAllNotifications(params.sessionId);
      
    case '/admin/notifications/send-single':
      return sendSingleNotification(params.sessionId, params.notificationId);
      
    case '/admin/notifications/send-batch':
      return sendBatchNotifications(params.sessionId, params.notificationIds);
      
    case '/admin/notifications/delete':
      return deleteNotificationAdmin(params.sessionId, params.notificationId);
      
    case '/admin/update-user-permission':
      return updateUserPermission(params.sessionId, params.userEmail, params.permissionCode, params.granted);

    // PropertiesService Configuration
    case '/admin/properties/get-all':
      return getAllProperties(params.sessionId);

    case '/admin/properties/update':
      return updateProperties(params.sessionId, params.properties);

    case '/admin/properties/reset':
      return resetPropertiesToDefaultsWithAuth(params.sessionId);

    case '/admin/properties/validate-spreadsheet':
      return validateSpreadsheetAccess(params.sessionId, params.spreadsheetId);

    // Robot Control
    case '/admin/robots/status':
      return getRobotStatus(params.sessionId);

    case '/admin/robots/cleanup':
      return executeCleanupRobot(params.sessionId);

    case '/admin/robots/notification-patrol':
      return executeNotificationPatrol(params.sessionId);

    case '/admin/robots/log-archive':
      return executeLogArchive(params.sessionId);

    // Security
    case '/admin/security/suspicious-logins':
      return getSuspiciousLogins(params.sessionId);

    default:
      return null;
  }
}

/**
 * 處理測試相關路由（生產環境應移除）
 */
function handleTestRoutes(path, method, params) {
  switch (path) {
    // case '/test/password-performance':
    //   if (method === 'GET') {
    //     return testPasswordHashingPerformance();
    //   } else {
    //     return createErrorResponse('METHOD_NOT_ALLOWED', 'GET method required');
    //   }
      
    default:
      return null;
  }
}

/**
 * 處理事件日誌相關路由
 */
function handleEventLogRoutes(path, params) {
  switch (path) {
    case '/eventlogs/project':
      return getProjectEventLogs(params.sessionId, params.projectId, params.filters || {});

    case '/eventlogs/user':
      return getUserProjectEventLogs(params.sessionId, params.projectId, params.filters || {});

    case '/eventlogs/resource':
      return getEventResourceDetails(params.sessionId, params.projectId, params.resourceType, params.resourceId);

    default:
      return null;
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleAuthRoutes,
    handleUserRoutes,
    handleProjectRoutes,
    handleGroupRoutes,
    handleStageRoutes,
    handleSubmissionRoutes,
    handleScoringRoutes,
    handleCommentRoutes,
    handleWalletRoutes,
    handleNotificationRoutes,
    handleInvitationRoutes,
    handleTagRoutes,
    handleSystemRoutes,
    handleAdminRoutes,
    handleTestRoutes,
    handleEventLogRoutes
  };
}