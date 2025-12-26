/**
 * @fileoverview Submission and ranking API endpoints
 * @module SubmissionsAPI
 */

// Import shared utilities
// Note: In GAS environment, all scripts share the same global scope
// These functions are available from shared_ranking_utils.js
// Validators are available from teacher_ranking_validators.js
// Permission utilities are available from unified_permissions.js

// ============ SHARED UTILITIES ============
// The following functions are imported from shared_ranking_utils.js:
// - getTableData
// - validateTeacherPermission
// - getTeacherRankingHistory
// - checkStageIsActive

/**
 * Submit a deliverable for a stage
 */
function submitDeliverable(sessionId, projectId, stageId, submissionData) {
  try {
    // Validate session and permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user has submit permission or is an active project member
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    
    // Check if user is an active project member (should have submit rights)
    const isActiveProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is system admin or has global access
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
    
    if (!permissions.includes('submit') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to submit');
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Check for previous submissions by this group for this stage
    const previousSubmissions = projectData.submissions.filter(s => 
      s.groupId === userGroup.groupId && 
      s.stageId === stageId &&
      s.status !== 'withdrawn'
    );
    
    // Determine version number
    const latestVersion = previousSubmissions.reduce((maxV, sub) => {
      const vNum = parseInt(sub.version?.replace('v', '') || '0');
      return vNum > maxV ? vNum : maxV;
    }, 0);
    
    const newVersion = `v${latestVersion + 1}`;
    
    // Create submission
    const submissionId = generateIdWithType('submission');
    const timestamp = getCurrentTimestamp();

    const submission = {
      submissionId: submissionId,
      stageId: stageId,
      groupId: userGroup.groupId,
      contentMarkdown: submissionData.content,
      actualAuthors: safeJsonStringify(submissionData.authors || [sessionResult.userEmail]),
      participationProposal: safeJsonStringify(submissionData.participationProposal || {}),
      version: newVersion,
      submitTime: timestamp,
      submitterEmail: sessionResult.userEmail,
      status: 'submitted'
    };

    addRowToSheet(projectId, 'Submissions', submission);

    // Log submission creation event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'submission_created',
      'submission',
      submissionId,
      { stageId: stageId, groupId: submission.groupId, version: 1 }
    );

    // Send notifications to all project participants about new submission
    sendSubmissionCreatedNotifications(projectId, stageId, submission.groupId, submissionId, sessionResult.userEmail);

    return createSuccessResponse(submission, 'Submission created successfully');

  } catch (error) {
    logErr('Submit deliverable error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to submit deliverable');
  }
}

/**
 * Submit group ranking proposal
 */
function submitGroupRanking(sessionId, projectId, stageId, rankingData) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate inputs
    if (!projectId || !stageId || !rankingData) {
      return createErrorResponse('INVALID_INPUT', 'Missing required parameters');
    }

    const projectData = readProjectDataWithSyncedStages(projectId);
    
    // Check if stage is in an active phase (pending or voting)
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Allow ranking submissions in both pending (active) and voting phases
    if (stage.status !== 'pending' && stage.status !== 'voting') {
      return createErrorResponse('STAGE_NOT_ACTIVE', 'Stage is not in an active phase for ranking submissions. Current status: ' + stage.status);
    }
    
    // Security: Verify user is in an active group in this project
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );

    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Security: Only allow group members to submit ranking proposals for their own group
    const hasGroupPermission = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && 
      ug.groupId === userGroup.groupId && 
      ug.isActive
    );

    if (!hasGroupPermission) {
      return createErrorResponse('ACCESS_DENIED', 'User can only submit proposals for their own group');
    }

    // Validate that ranking data doesn't include the proposer's own group
    if (Array.isArray(rankingData)) {
      const includesOwnGroup = rankingData.some(item => item.groupId === userGroup.groupId);
      if (includesOwnGroup) {
        return createErrorResponse('INVALID_RANKING', 'Cannot include your own group in the ranking');
      }
    } else if (typeof rankingData === 'object' && rankingData !== null) {
      // Handle object format {groupId: rank}
      if (rankingData.hasOwnProperty(userGroup.groupId)) {
        return createErrorResponse('INVALID_RANKING', 'Cannot include your own group in the ranking');
      }
    }

    // Get existing proposals from this group for this stage to determine version
    const existingProposals = projectData.rankingproposals.filter(p => 
      p.stageId === stageId && 
      p.groupId === userGroup.groupId &&
      p.status !== 'withdrawn'
    );

    // Calculate version number
    const latestVersion = existingProposals.reduce((maxV, proposal) => {
      const vNum = parseInt(proposal.version?.replace('v', '') || '0');
      return vNum > maxV ? vNum : maxV;
    }, 0);
    
    const newVersion = `v${latestVersion + 1}`;

    const proposalId = generateIdWithType('proposal');
    const timestamp = getCurrentTimestamp();

    const proposal = {
      proposalId: proposalId,
      stageId: stageId,
      groupId: userGroup.groupId,
      proposerEmail: sessionResult.userEmail,
      proposer: sessionResult.displayName || sessionResult.userEmail,
      rankingData: safeJsonStringify(rankingData),
      version: newVersion,
      status: 'active',
      createdTime: timestamp,
      supportCount: 0,
      opposeCount: 0
    };

    // Mark previous proposals from this group as superseded
    existingProposals.forEach(existingProposal => {
      if (existingProposal.status === 'active') {
        updateSheetRow(projectId, 'RankingProposals', 
          'proposalId', existingProposal.proposalId, 
          { status: 'superseded' }
        );
      }
    });

    addRowToSheet(projectId, 'RankingProposals', proposal);
    
    // Log the proposal submission
    logOperation(
      sessionResult.userEmail,
      'ranking_proposal_submitted',
      'proposal',
      proposalId,
      { 
        projectId: projectId,
        stageId: stageId,
        groupId: userGroup.groupId,
        version: newVersion
      }
    );
    
    // Send notifications to all group members about new ranking proposal
    sendVotingProposalNotifications(projectId, stageId, proposalId, userGroup.groupId, sessionResult.userEmail);
    
    return createSuccessResponse(proposal, 'Ranking proposal submitted');

  } catch (error) {
    logErr('Submit ranking error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to submit ranking');
  }
}

/**
 * Vote on ranking proposal
 */
function voteOnRankingProposal(sessionId, projectId, proposalId, agree, comment = '') {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate inputs
    if (!projectId || !proposalId || typeof agree !== 'boolean') {
      return createErrorResponse('INVALID_INPUT', 'Missing or invalid required parameters');
    }

    const projectData = readProjectDataWithSyncedStages(projectId);
    
    // Get proposal to find stage
    const proposal = projectData.rankingproposals.find(p => p.proposalId === proposalId);
    if (!proposal) {
      return createErrorResponse('PROPOSAL_NOT_FOUND', 'Ranking proposal not found');
    }

    // Check if proposal is active
    if (proposal.status !== 'active') {
      return createErrorResponse('PROPOSAL_NOT_ACTIVE', 'Can only vote on active proposals');
    }
    
    // Check if stage is in an active phase (pending or voting)
    const stage = projectData.stages.find(s => s.stageId === proposal.stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Allow voting on ranking proposals in both pending (active) and voting phases
    if (stage.status !== 'pending' && stage.status !== 'voting') {
      return createErrorResponse('STAGE_NOT_ACTIVE', 'Stage is not in an active phase for voting. Current status: ' + stage.status);
    }
    
    // Security: Verify user is in an active group in this project
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );

    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Security: Only allow group members to vote on proposals from their own group
    if (userGroup.groupId !== proposal.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'Users can only vote on proposals from their own group');
    }

    // Security: Check if user has already voted on this proposal
    const existingVote = projectData.proposalvotes.find(v => 
      v.proposalId === proposalId && 
      v.voterEmail === sessionResult.userEmail
    );

    if (existingVote) {
      return createErrorResponse('ALREADY_VOTED', 'User has already voted on this proposal');
    }

    // Note: Allow users to vote on their own proposals (similar to UN voting rules)

    const voteId = generateIdWithType('vote');
    const timestamp = getCurrentTimestamp();

    const vote = {
      voteId: voteId,
      proposalId: proposalId,
      voterEmail: sessionResult.userEmail,
      voter: sessionResult.displayName || sessionResult.userEmail,
      groupId: userGroup.groupId,
      agree: Boolean(agree),
      timestamp: timestamp,
      comment: sanitizeString(comment, 500)
    };

    addRowToSheet(projectId, 'ProposalVotes', vote);

    // Update proposal vote counts
    const allVotes = projectData.proposalvotes.filter(v => v.proposalId === proposalId);
    allVotes.push(vote); // Include the new vote
    
    const supportCount = allVotes.filter(v => v.agree === true).length;
    const opposeCount = allVotes.filter(v => v.agree === false).length;

    updateSheetRow(projectId, 'RankingProposals', 
      'proposalId', proposalId, 
      { 
        supportCount: supportCount,
        opposeCount: opposeCount,
        lastVoteTime: timestamp
      }
    );

    // Log the vote
    logOperation(
      sessionResult.userEmail,
      'ranking_proposal_voted',
      'vote',
      voteId,
      {
        projectId: projectId,
        proposalId: proposalId,
        stageId: proposal.stageId,
        groupId: userGroup.groupId,
        agree: agree
      }
    );

    // Send notification to proposal creator about the vote
    if (agree) {
      sendProposalVoteNotifications(
        projectId,
        proposal.stageId,
        proposalId,
        userGroup.groupId,
        sessionResult.userEmail,
        proposal.proposerEmail
      );
    }

    return createSuccessResponse({
      vote: vote,
      updatedCounts: { supportCount, opposeCount }
    }, 'Vote recorded successfully');

  } catch (error) {
    logErr('Vote on proposal error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to record vote');
  }
}

/**
 * Get stage submissions with details
 */
function getStageSubmissions(sessionId, projectId, stageId) {
  try {
    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;

    const submissions = projectData.submissions
      .filter(s => s.stageId === stageId)
      .map(submission => {
        const group = projectData.groups.find(g => g.groupId === submission.groupId);
        
        // 獲取組員資訊
        const globalData = readGlobalData();
        const groupMembers = projectData.usergroups
          .filter(ug => ug.groupId === submission.groupId && ug.isActive)
          .map(ug => {
            const globalUser = globalData.users.find(u => u.userEmail === ug.userEmail);
            return globalUser ? globalUser.displayName || globalUser.username : ug.userEmail;
          });
        
        return {
          ...submission,
          groupName: group ? group.groupName : 'Unknown Group',
          memberNames: groupMembers
        };
      })
      .sort((a, b) => b.submitTime - a.submitTime);
    
    return createSuccessResponse(submissions);

  } catch (error) {
    logErr('Get submissions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get submissions');
  }
}

/**
 * Get submission versions for specific use cases (version selectors)
 * @param {string} sessionId - Session ID for authentication
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {Object} options - Query options
 * @param {string} options.groupId - Filter by specific group (optional)
 * @param {boolean} options.includeWithdrawn - Include withdrawn versions (default: true)
 * @param {boolean} options.includeActive - Include active versions (default: true)
 * @param {string} options.sortBy - Sort field (default: 'submitTime')
 * @param {string} options.sortOrder - Sort order 'asc' or 'desc' (default: 'desc')
 */
function getSubmissionVersions(sessionId, projectId, stageId, options = {}) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // 資安檢查：驗證必要參數
    if (!projectId || !stageId) {
      return createErrorResponse('INVALID_PARAMETERS', 'ProjectId and stageId are required');
    }

    // Parse options with defaults
    const {
      groupId = null,
      includeWithdrawn = true,
      includeActive = true,
      sortBy = 'submitTime',
      sortOrder = 'desc'
    } = options;
    
    // 資安檢查：如果指定groupId，需要驗證用戶是否屬於該組
    if (groupId) {
      const projectData = readProjectData(projectId);
      const userGroup = projectData.usergroups.find(ug => 
        ug.userEmail === sessionResult.userEmail && 
        ug.groupId === groupId && 
        ug.isActive
      );
      
      if (!userGroup) {
        // 用戶不屬於該組，檢查是否為管理員
        const isAdmin = isSystemAdmin(sessionResult.userEmail);
        const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
        const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
        
        if (!isAdmin && !hasGlobalAccess) {
          return createErrorResponse('ACCESS_DENIED', 'User does not belong to the specified group');
        }
      }
    }

    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    
    // Find user's active group in this project
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is system admin or has global access
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
    
    if (!permissions.includes('view') && !userGroup && !isAdmin && !hasGlobalAccess) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view submission versions');
    }
    
    // 如果沒有指定groupId，使用當前用戶所屬的群組（除非是管理員）
    let targetGroupId = groupId;
    if (!targetGroupId && userGroup) {
      targetGroupId = userGroup.groupId;
      console.log(`ℹ️ 自動使用用戶所屬群組: ${targetGroupId} (${sessionResult.userEmail})`);
    }

    // Filter submissions by stage
    let submissions = projectData.submissions.filter(s => s.stageId === stageId);

    // Filter by group (use targetGroupId which could be auto-determined)
    if (targetGroupId) {
      submissions = submissions.filter(s => s.groupId === targetGroupId);
    }

    // Filter by status based on options
    if (!includeWithdrawn && !includeActive) {
      // If both are false, return empty (edge case)
      submissions = [];
    } else if (!includeWithdrawn) {
      submissions = submissions.filter(s => s.status !== 'withdrawn');
    } else if (!includeActive) {
      submissions = submissions.filter(s => s.status === 'withdrawn');
    }
    // If both are true, include all (no additional filtering needed)

    // Add group information and format data
    const versions = submissions.map(submission => {
      const group = projectData.groups.find(g => g.groupId === submission.groupId);
      return {
        submissionId: submission.submissionId,
        stageId: submission.stageId,
        groupId: submission.groupId,
        groupName: group ? group.groupName : 'Unknown Group',
        content: submission.contentMarkdown || submission.content || '',
        submitter: submission.submitterEmail,
        submittedTime: submission.submitTime,
        status: submission.status,
        version: submission.version || 'v1',
        actualAuthors: submission.actualAuthors || [],
        participationProposal: submission.participationProposal || {}
      };
    });

    // Sort versions
    versions.sort((a, b) => {
      const fieldA = a[sortBy];
      const fieldB = b[sortBy];
      
      let comparison = 0;
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else {
        comparison = fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Create metadata
    const metadata = {
      totalVersions: versions.length,
      withdrawnCount: versions.filter(v => v.status === 'withdrawn').length,
      activeCount: versions.filter(v => v.status !== 'withdrawn').length,
      groupId: targetGroupId,  // 使用實際的groupId（可能是自動判斷的）
      stageId: stageId
    };

    return createSuccessResponse({
      versions: versions,
      metadata: metadata
    });

  } catch (error) {
    logErr('Get submission versions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get submission versions');
  }
}

/**
 * Get submission details by ID
 */
function getSubmissionDetails(sessionId, projectId, submissionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate submission ID
    if (!validateSubmissionId(submissionId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid submission ID format');
    }

    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(sessionResult.userEmail, projectData.projectgroups, projectData.usergroups);
    
    // Check if user is an active project member (should have view rights)
    const isActiveProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Check if user is system admin or has global access
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
    
    if (!permissions.includes('view') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view submission details');
    }

    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Get related data
    const group = projectData.groups.find(g => g.groupId === submission.groupId);
    const stage = projectData.stages.find(s => s.stageId === submission.stageId);
    const comments = projectData.comments.filter(c => c.submissionId === submissionId);
    
    return createSuccessResponse({
      ...submission,
      groupName: group ? group.groupName : 'Unknown Group',
      stageName: stage ? stage.stageName : 'Unknown Stage',
      comments: comments
    });

  } catch (error) {
    logErr('Get submission details error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get submission details');
  }
}

/**
 * Update submission (resubmission)
 */
function updateSubmission(sessionId, projectId, submissionId, updates) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate inputs
    if (!validateSubmissionId(submissionId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid submission ID format');
    }

    const projectData = readProjectData(projectId);
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Check if user can update this submission
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && 
      ug.groupId === submission.groupId && 
      ug.isActive
    );

    if (!userGroup && submission.submitterEmail !== sessionResult.userEmail) {
      return createErrorResponse('ACCESS_DENIED', 'Can only update your own group\'s submissions');
    }

    // Validate allowed updates
    const allowedFields = ['contentMarkdown', 'actualAuthors', 'participationProposal'];
    const submissionUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        if (field === 'contentMarkdown') {
          submissionUpdates[field] = sanitizeString(updates[field], 10000);
        } else if (field === 'actualAuthors' || field === 'participationProposal') {
          submissionUpdates[field] = safeJsonStringify(updates[field]);
        }
      }
    });

    if (Object.keys(submissionUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Update submission
    submissionUpdates.version = 'v' + (parseInt(submission.version.replace('v', '')) + 1);
    submissionUpdates.lastModified = getCurrentTimestamp();

    updateSheetRow(projectId, 'Submissions', 'submissionId', submissionId, submissionUpdates);

    // Log submission update event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'submission_updated',
      'submission',
      submissionId,
      {
        stageId: submission.stageId,
        groupId: submission.groupId,
        version: submissionUpdates.version
      }
    );

    return createSuccessResponse(null, 'Submission updated successfully');

  } catch (error) {
    logErr('Update submission error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update submission');
  }
}

/**
 * Get ranking proposals for a stage
 */
function getStageRankingProposals(sessionId, projectId, stageId, options = {}) {
  try {
    // Validate inputs
    if (!stageId) {
      return createErrorResponse('INVALID_INPUT', 'Missing required parameters');
    }

    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;

    const { groupId = null, includeVersionHistory = true } = options;

    // Security: Find user's group for filtering
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );

    // Security: If groupId specified, validate user belongs to that group (unless admin)
    let targetGroupId = groupId;
    if (groupId && !isAdmin && !hasGlobalAccess) {
      if (!userGroup || userGroup.groupId !== groupId) {
        return createErrorResponse('ACCESS_DENIED', 'User can only view proposals from their own group');
      }
    }

    // If no groupId specified and user is not admin, show only their group's proposals
    if (!targetGroupId && userGroup && !isAdmin && !hasGlobalAccess) {
      targetGroupId = userGroup.groupId;
    }

    // Filter proposals by stage and status, optionally by group
    let proposals = projectData.rankingproposals.filter(p => 
      p.stageId === stageId && (p.status === 'active' || !p.status) // Include proposals without status for backward compatibility
    );
    
    if (targetGroupId) {
      proposals = proposals.filter(p => p.groupId === targetGroupId);
    }

    // Process proposals with vote data and group information
    const processedProposals = proposals.map(proposal => {
      const group = projectData.groups.find(g => g.groupId === proposal.groupId);
      const votes = projectData.proposalvotes.filter(v => v.proposalId === proposal.proposalId);
      
      // Get group members for calculating voting statistics
      const groupMembers = projectData.usergroups.filter(ug => 
        ug.groupId === proposal.groupId && ug.isActive
      );

      const agreeVotes = votes.filter(v => v.agree === true);
      const disagreeVotes = votes.filter(v => v.agree === false);

      return {
        proposalId: proposal.proposalId,
        stageId: proposal.stageId,
        groupId: proposal.groupId,
        groupName: group ? group.groupName : 'Unknown Group',
        proposer: proposal.proposer || proposal.proposerEmail,
        proposerEmail: proposal.proposerEmail,
        rankingData: proposal.rankingData,
        version: proposal.version || 'v1',
        status: proposal.status || 'active',
        createdTime: proposal.createdTime,
        supportCount: proposal.supportCount || agreeVotes.length,
        opposeCount: proposal.opposeCount || disagreeVotes.length,
        totalGroupMembers: groupMembers.length,
        votes: votes.map(vote => ({
          voteId: vote.voteId,
          voter: vote.voter || vote.voterEmail,
          voterEmail: vote.voterEmail,
          agree: vote.agree,
          timestamp: vote.timestamp,
          comment: vote.comment
        })),
        hasUserVoted: votes.some(v => v.voterEmail === sessionResult.userEmail),
        userVote: votes.find(v => v.voterEmail === sessionResult.userEmail)?.agree
      };
    });

    // Sort by version and creation time (latest first)
    processedProposals.sort((a, b) => {
      // First sort by group
      if (a.groupId !== b.groupId) {
        return a.groupId.localeCompare(b.groupId);
      }
      // Then by version (latest first)
      const aVersion = parseInt(a.version.replace('v', '')) || 0;
      const bVersion = parseInt(b.version.replace('v', '')) || 0;
      if (aVersion !== bVersion) {
        return bVersion - aVersion;
      }
      // Finally by creation time (latest first)
      return b.createdTime - a.createdTime;
    });

    // Group proposals by groupId for version history if requested
    let proposalsByGroup = {};
    if (includeVersionHistory) {
      processedProposals.forEach(proposal => {
        if (!proposalsByGroup[proposal.groupId]) {
          proposalsByGroup[proposal.groupId] = [];
        }
        proposalsByGroup[proposal.groupId].push(proposal);
      });
    }

    return createSuccessResponse({
      proposals: processedProposals,
      proposalsByGroup: includeVersionHistory ? proposalsByGroup : null,
      metadata: {
        totalProposals: processedProposals.length,
        activeProposals: processedProposals.filter(p => p.status === 'active').length,
        userGroupId: userGroup?.groupId || null,
        filteredByGroup: targetGroupId
      }
    });

  } catch (error) {
    logErr('Get ranking proposals error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get ranking proposals');
  }
}

/**
 * Add comment to submission
 */
function addSubmissionComment(sessionId, projectId, submissionId, commentData) {
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
    
    if (!permissions.includes('comment') && !isActiveProjectMember && !isAdmin && !hasGlobalAccess) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to comment');
    }

    // Validate submission exists
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Create comment
    const commentId = generateIdWithType('comment');
    const timestamp = getCurrentTimestamp();

    const comment = {
      commentId: commentId,
      submissionId: submissionId,
      stageId: submission.stageId,
      commenterEmail: sessionResult.userEmail,
      commentText: sanitizeString(commentData.content, 2000),
      commentTime: timestamp,
      isPublic: Boolean(commentData.isPublic)
    };

    addRowToSheet(projectId, 'Comments', comment);

    // Log comment
    const logEntry = logOperation(
      sessionResult.userEmail,
      'comment_added',
      'submission',
      submissionId,
      { 
        projectId: projectId,
        stageId: submission.stageId,
        commentLength: comment.commentText.length
      }
    );

    return createSuccessResponse(comment, 'Comment added successfully');

  } catch (error) {
    logErr('Add comment error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to add comment');
  }
}

/**
 * Send notifications when a submission is created
 */
function sendSubmissionCreatedNotifications(projectId, stageId, groupId, submissionId, submitterEmail) {
  try {
    const projectData = readProjectDataWithSyncedStages(projectId);
    const globalData = readGlobalData();
    
    // Get project and stage names
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    const group = projectData.groups.find(g => g.groupId === groupId);
    const groupName = group ? group.groupName : '未知群組';
    
    // Get all project participants except the submitter
    const participants = getAllProjectParticipants(projectId);
    
    participants.forEach(participant => {
      // Skip the submitter
      if (participant.userEmail === submitterEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'submission_created',
        title: '新成果提交',
        content: `${projectName} 專案的「${stageName}」階段中，${groupName} 群組提交了新的成果`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: submissionId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          groupName: groupName,
          submitterEmail: submitterEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send submission created notifications error', error);
  }
}

/**
 * Send notifications when a ranking proposal is created
 */
function sendRankingProposalNotifications(projectId, stageId, groupId, proposalId, proposerEmail) {
  try {
    const projectData = readProjectDataWithSyncedStages(projectId);
    const globalData = readGlobalData();
    
    // Get project and stage names
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    const group = projectData.groups.find(g => g.groupId === groupId);
    const groupName = group ? group.groupName : '未知群組';
    
    // Get all project participants except the proposer
    const participants = getAllProjectParticipants(projectId);
    
    participants.forEach(participant => {
      // Skip the proposer
      if (participant.userEmail === proposerEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'ranking_proposal',
        title: '新排名提案',
        content: `${projectName} 專案的「${stageName}」階段中，${groupName} 群組提交了新的排名提案`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: proposalId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          groupName: groupName,
          proposerEmail: proposerEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send ranking proposal notifications error', error);
  }
}

/**
 * Vote on participation proposal for group's submission (only group members can vote)
 * This is a simple agree/disagree vote on the entire proposal
 */
function voteParticipationProposal(sessionId, projectId, stageId, submissionId, agree, comment = '') {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate inputs
    if (!validateSubmissionId(submissionId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid submission ID format');
    }

    const projectData = readProjectData(projectId);
    
    // Find the submission
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }
    
    // Check if submission is withdrawn
    if (submission.status === 'withdrawn') {
      return createErrorResponse('SUBMISSION_WITHDRAWN', 'Cannot vote on withdrawn submission');
    }
    
    // Check if stage is active and allows voting
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageCheck = checkStageIsActive(stage);
    if (!stageCheck.isActive) {
      return createErrorResponse('STAGE_INACTIVE', stageCheck.reason);
    }
    
    // Check if submission belongs to the specified stage
    if (submission.stageId !== stageId) {
      return createErrorResponse('INVALID_INPUT', 'Submission does not belong to the specified stage');
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // CRITICAL: Only allow group members to vote on their own group's submission
    if (userGroup.groupId !== submission.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'You can only vote on your own group\'s submissions');
    }

    // Parse the participation proposal to ensure user is a participant
    let proposedParticipation = {};
    try {
      proposedParticipation = typeof submission.participationProposal === 'string' 
        ? JSON.parse(submission.participationProposal) 
        : submission.participationProposal || {};
    } catch (e) {
      logErr('Failed to parse participation proposal', e);
      proposedParticipation = {};
    }

    // Check if user has participation percentage in the proposal
    const userParticipation = proposedParticipation[sessionResult.userEmail];
    if (userParticipation === undefined || userParticipation <= 0) {
      return createErrorResponse('NOT_PARTICIPANT', 'You are not listed as a participant in this submission');
    }

    // Check if user has already voted on this submission
    const existingVote = projectData.submissionapprovalvotes?.find(v => 
      v.submissionId === submissionId && v.voterEmail === sessionResult.userEmail
    );
    
    if (existingVote) {
      return createErrorResponse('ALREADY_VOTED', 'You have already voted on this submission');
    }

    const voteId = generateIdWithType('vote');
    const timestamp = getCurrentTimestamp();

    const vote = {
      voteId: voteId,
      submissionId: submissionId,
      stageId: stageId,
      groupId: userGroup.groupId,
      voterEmail: sessionResult.userEmail,
      agree: Boolean(agree),
      comment: sanitizeString(comment, 500),
      createdTime: timestamp
    };

    // Create the table if it doesn't exist
    ensureTableExists(projectId, 'SubmissionApprovalVotes', [
      'voteId', 'submissionId', 'stageId', 'groupId', 'voterEmail', 
      'agree', 'comment', 'createdTime'
    ]);

    addRowToSheet(projectId, 'SubmissionApprovalVotes', vote);
    
    // Re-read project data to get latest votes including the one just added
    const updatedProjectData = readProjectData(projectId);
    
    // Get all votes for this submission (including the newly added one)
    const allVotes = updatedProjectData.submissionapprovalvotes?.filter(v => 
      v.submissionId === submissionId
    ) || [];
    
    // Get all proposed participants (who should vote)
    const proposedParticipants = Object.keys(proposedParticipation).filter(email => 
      proposedParticipation[email] > 0
    );
    
    const agreeVotes = allVotes.filter(v => v.agree).length;
    const totalVotes = allVotes.length;
    const totalParticipants = proposedParticipants.length;
    
    // Get all group members for voting status (use updated data)
    const allGroupMembers = updatedProjectData.usergroups.filter(ug => 
      ug.groupId === userGroup.groupId && ug.isActive
    );
    
    // 不再自動批准，等待consensusDeadline
    // 只有全組共識（所有參與者都同意）才能在consensusDeadline時獲得獎勵
    
    return createSuccessResponse({
      vote: vote,
      votingSummary: {
        votes: allVotes,
        agreeVotes: agreeVotes,
        totalVotes: totalVotes,
        totalMembers: allGroupMembers.length,
        isApproved: false, // Never auto-approve
        hasUserVoted: true,
        allParticipantsAgreed: agreeVotes === totalParticipants,
        participationProposal: proposedParticipation
      }
    }, 'Vote recorded successfully');

  } catch (error) {
    logErr('Vote participation proposal error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to record vote');
  }
}

/**
 * Vote to approve group's own submission
 * Redirects to voteParticipationProposal for consistency
 */
function voteApproveGroupSubmission(sessionId, projectId, stageId, submissionId, agree, comment = '') {
  return voteParticipationProposal(sessionId, projectId, stageId, submissionId, agree, comment);
}

/**
 * Get submission approval votes (updated to match new voting system)
 */
function getParticipationConfirmations(sessionId, projectId, stageId, submissionId) {
  try {
    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;
    
    // Find the submission
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Only allow group members to view their own group's confirmations
    if (userGroup.groupId !== submission.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'You can only view your own group\'s participation status');
    }

    // Get all votes for this submission
    const votes = projectData.submissionapprovalvotes?.filter(v => 
      v.submissionId === submissionId
    ) || [];
    
    // Get all group members
    const allGroupMembers = projectData.usergroups.filter(ug => 
      ug.groupId === userGroup.groupId && ug.isActive
    );
    
    // Parse participation proposal
    let proposedParticipation = {};
    try {
      proposedParticipation = typeof submission.participationProposal === 'string' 
        ? JSON.parse(submission.participationProposal) 
        : submission.participationProposal || {};
    } catch (e) {
      proposedParticipation = {};
    }
    
    const agreeVotes = votes.filter(v => v.agree).length;
    const totalVotes = votes.length;
    
    const votingSummary = {
      votes: votes,
      agreeVotes: agreeVotes,
      totalVotes: totalVotes,
      totalMembers: allGroupMembers.length,
      isApproved: false, // Never auto-approve, wait for consensusDeadline
      hasUserVoted: votes.some(v => v.voterEmail === sessionResult.userEmail),
      participationProposal: proposedParticipation
    };
    
    return createSuccessResponse(votingSummary);

  } catch (error) {
    logErr('Get participation confirmations error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get participation confirmations');
  }
}

/**
 * Get group submission approval votes (kept for backward compatibility)
 * @deprecated Use getParticipationConfirmations instead
 */
function getGroupSubmissionApprovalVotes(sessionId, projectId, stageId, submissionId) {
  return getParticipationConfirmations(sessionId, projectId, stageId, submissionId);
}

/**
 * Get group submission approval votes (original implementation for reference)
 * @deprecated
 */
function getGroupSubmissionApprovalVotesOld(sessionId, projectId, stageId, submissionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    
    // Find the submission
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Only allow group members to view their own group's votes
    if (userGroup.groupId !== submission.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'You can only view your own group\'s voting status');
    }

    const votes = projectData.submissionapprovalvotes?.filter(v => 
      v.submissionId === submissionId
    ) || [];
    
    const allGroupMembers = projectData.usergroups.filter(ug => 
      ug.groupId === userGroup.groupId && ug.isActive
    );

    const votingSummary = {
      votes: votes,
      agreeVotes: votes.filter(v => v.agree).length,
      totalVotes: votes.length,
      totalMembers: allGroupMembers.length,
      isApproved: submission.status === 'approved',
      hasUserVoted: votes.some(v => v.voterEmail === sessionResult.userEmail)
    };
    
    return createSuccessResponse(votingSummary);

  } catch (error) {
    logErr('Get group submission approval votes error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get approval votes');
  }
}

/**
 * Mark a submission as withdrawn (following spec's append-only design)
 */
function withdrawSubmission(sessionId, projectId, submissionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate submission ID
    if (!validateSubmissionId(submissionId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid submission ID format');
    }

    const projectData = readProjectData(projectId);
    
    // Find the submission
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Check if stage is active and allows withdrawing
    const stage = projectData.stages.find(s => s.stageId === submission.stageId);
    const stageCheck = checkStageIsActive(stage);
    if (!stageCheck.isActive) {
      return createErrorResponse('STAGE_INACTIVE', stageCheck.reason);
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // Only allow group members to withdraw their own group's submission
    if (userGroup.groupId !== submission.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'You can only withdraw your own group\'s submissions');
    }

    // Check if already withdrawn
    if (submission.status === 'withdrawn') {
      return createErrorResponse('ALREADY_WITHDRAWN', 'This submission is already withdrawn');
    }

    // Check if anyone has voted on this submission
    const existingVotes = projectData.submissionapprovalvotes?.filter(v => 
      v.submissionId === submissionId
    ) || [];
    
    if (existingVotes.length > 0) {
      return createErrorResponse('VOTES_EXIST', 'Cannot withdraw submission after votes have been cast');
    }

    // Mark as withdrawn (not delete, following append-only design)
    updateSheetRow(projectId, 'Submissions', 'submissionId', submissionId, {
      status: 'withdrawn',
      withdrawnTime: getCurrentTimestamp(),
      withdrawnBy: sessionResult.userEmail
    });

    // Log submission withdrawal event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'submission_deleted',
      'submission',
      submissionId,
      {
        stageId: submission.stageId,
        groupId: submission.groupId,
        reason: 'user_withdrawal'
      }
    );

    // Send notifications to all group members about submission withdrawal
    sendSubmissionWithdrawnNotifications(projectId, submission.stageId, submission.groupId, submissionId, sessionResult.userEmail);

    return createSuccessResponse(null, 'Submission withdrawn successfully');

  } catch (error) {
    logErr('Withdraw submission error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to withdraw submission');
  }
}

/**
 * PM/Teacher voting on stage submissions - creates teacher rankings
 * Only Global PMs can use this function - their votes become "teacher rankings"
 */
function voteTeacherRanking(sessionId, projectId, stageId, rankings) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user has teacher privilege
    if (!hasTeacherPrivilege(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only users with teacher privilege can submit teacher rankings');
    }

    // Validate inputs
    if (!projectId || !stageId || !rankings || !Array.isArray(rankings)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid ranking data provided');
    }

    // Validate ranking format
    for (const ranking of rankings) {
      if (!ranking.groupId || typeof ranking.rank !== 'number' || ranking.rank < 1) {
        return createErrorResponse('INVALID_INPUT', 'Invalid ranking format: each ranking must have groupId and rank (starting from 1)');
      }
    }

    const projectData = readProjectData(projectId);
    
    // Check if stage exists
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    // Create teacher ranking record
    const teacherRankingId = generateIdWithType('teacher_ranking');
    const timestamp = getCurrentTimestamp();

    const teacherRanking = {
      teacherRankingId: teacherRankingId,
      stageId: stageId,
      projectId: projectId,
      teacherEmail: sessionResult.userEmail,
      rankings: safeJsonStringify(rankings),
      createdTime: timestamp,
      lastModified: timestamp
    };

    // Create the table if it doesn't exist
    ensureTableExists(projectId, 'TeacherRankings', [
      'teacherRankingId', 'stageId', 'projectId', 'teacherEmail', 
      'rankings', 'createdTime', 'lastModified'
    ]);

    // Check if teacher already has ranking for this stage
    const existingRanking = projectData.teacherrankings?.find(tr => 
      tr.stageId === stageId && tr.teacherEmail === sessionResult.userEmail
    );

    if (existingRanking) {
      // Update existing ranking
      updateSheetRow(projectId, 'TeacherRankings', 'teacherRankingId', existingRanking.teacherRankingId, {
        rankings: safeJsonStringify(rankings),
        lastModified: timestamp
      });
      
      return createSuccessResponse({
        action: 'updated',
        teacherRankingId: existingRanking.teacherRankingId,
        rankings: rankings
      }, 'Teacher ranking updated successfully');
    } else {
      // Create new ranking
      addRowToSheet(projectId, 'TeacherRankings', teacherRanking);
      
      return createSuccessResponse({
        action: 'created',
        teacherRankingId: teacherRankingId,
        rankings: rankings
      }, 'Teacher ranking submitted successfully');
    }

  } catch (error) {
    logErr('Vote teacher ranking error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to submit teacher ranking');
  }
}

/**
 * Submit comprehensive teacher vote (both submissions and comments)
 */
/**
 * Submit teacher comprehensive vote for submissions and comments
 * Refactored to use smaller, focused functions and unified permissions
 */
function submitTeacherComprehensiveVote(sessionId, projectId, stageId, rankings) {
  try {
    // Step 1: Validate session and permissions using unified permission check
    const validationResult = validateSessionWithPermission(sessionId, 'teacher_privilege');
    if (!validationResult.valid) {
      return createErrorResponse(validationResult.errorCode, validationResult.error);
    }
    const { sessionResult } = validationResult;

    // Step 2: Validate basic inputs
    if (!projectId || !stageId || !rankings || typeof rankings !== 'object') {
      return createErrorResponse('INVALID_INPUT', 'Invalid ranking data provided');
    }

    // Step 3: Load project data and validate stage
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }

    const { submissions = [], comments = [] } = rankings;
    const timestamp = getCurrentTimestamp();
    const context = {
      projectId,
      stageId,
      teacherEmail: sessionResult.userEmail,
      timestamp
    };

    // Step 4: Process submission rankings
    let submissionResults = [];
    if (submissions.length > 0) {
      const submissionValidation = validateSubmissionRankings(submissions);
      if (!submissionValidation.valid) {
        return createErrorResponse('INVALID_INPUT', submissionValidation.error);
      }
      submissionResults = persistSubmissionRankings(submissions, context);
    }

    // Step 5: Process comment rankings
    let commentResults = [];
    if (comments.length > 0) {
      const stageComments = projectData.comments.filter(c => c.stageId === stageId);
      const commentValidation = validateCommentRankings(comments, sessionResult.userEmail, stageComments);
      if (!commentValidation.valid) {
        return createErrorResponse(commentValidation.errorCode || 'INVALID_INPUT', commentValidation.error);
      }
      commentResults = persistCommentRankings(comments, context);
    }

    // Step 6: Log teacher ranking events
    if (submissions.length > 0) {
      logOperation(
        projectId,
        sessionResult.userEmail,
        'teacher_submission_ranking',
        'vote',
        generateIdWithType('teachervote'),
        {
          stageId: stageId,
          submissionCount: submissions.length
        }
      );
    }

    if (comments.length > 0) {
      logOperation(
        projectId,
        sessionResult.userEmail,
        'teacher_comment_ranking',
        'vote',
        generateIdWithType('teachervote'),
        {
          stageId: stageId,
          commentCount: comments.length
        }
      );
    }

    // Step 7: Return success response
    return createSuccessResponse({
      action: 'comprehensive_vote_submitted',
      submissionRankings: submissionResults,
      commentRankings: commentResults,
      totalSubmissions: submissions.length,
      totalComments: comments.length
    }, 'Teacher comprehensive vote submitted successfully');

  } catch (error) {
    const errorContext = { projectId, stageId, userEmail: sessionId };
    logErr('Submit teacher comprehensive vote error', error, errorContext);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to submit teacher comprehensive vote');
  }
}

// validateTeacherSession function is now replaced by validateSessionWithPermission from unified_permissions.js

/**
 * Get teacher vote history for current user
 */
function getTeacherVoteHistory(sessionId, projectId, stageId) {
  try {
    // Use unified permission validation
    const validationResult = validateSessionWithPermission(sessionId, 'teacher_privilege');
    if (!validationResult.valid) {
      return createErrorResponse(validationResult.errorCode, validationResult.error);
    }
    const { sessionResult } = validationResult;

    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Get user's display name
    const user = globalData.users.find(u => u.userEmail === sessionResult.userEmail);
    const displayName = user?.displayName || user?.username || sessionResult.userEmail;
    
    // Get submission and comment rankings history using unified utilities
    const latestSubmissionRanking = getTeacherRankingHistory(projectData, 'TeacherSubmissionRankings', stageId, sessionResult.userEmail);
    const latestCommentRanking = getTeacherRankingHistory(projectData, 'TeacherCommentRankings', stageId, sessionResult.userEmail);
    
    return createSuccessResponseWithSession(sessionId, {
      teacherEmail: sessionResult.userEmail,
      displayName: displayName,
      submissionRanking: latestSubmissionRanking,
      commentRanking: latestCommentRanking
    });
    
  } catch (error) {
    const context = { 
      operation: 'getTeacherVoteHistory',
      projectId, 
      stageId, 
      userEmail: sessionId 
    };
    return createErrorResponseFromException(error, context);
  }
}

/**
 * Get teacher rankings for a stage
 */
function getTeacherRankings(sessionId, projectId, stageId) {
  try {
    // First validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    
    // Check multiple permissions - project member OR admin OR global PM
    const permissionResult = validateMultiplePermissions(
      sessionResult.userEmail, 
      ['project_member', 'system_admin', 'global_pm'],
      { projectData }
    );
    
    // If user doesn't have at least one of these permissions, deny access
    if (!permissionResult.valid) {
      // Check if user has any of the required permissions
      const hasAnyPermission = isProjectMember(sessionResult.userEmail, projectData) ||
                               isSystemAdmin(sessionResult.userEmail) ||
                               isGlobalPM(sessionResult.userEmail);
      
      if (!hasAnyPermission) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view teacher rankings');
      }
    }

    // Get teacher rankings for this stage
    const teacherRankings = projectData.teacherrankings?.filter(tr => 
      tr.stageId === stageId
    ).map(ranking => {
      let parsedRankings = [];
      try {
        parsedRankings = typeof ranking.rankings === 'string' 
          ? JSON.parse(ranking.rankings) 
          : ranking.rankings || [];
      } catch (e) {
        parsedRankings = [];
      }

      return {
        teacherRankingId: ranking.teacherRankingId,
        teacherEmail: ranking.teacherEmail,
        rankings: parsedRankings,
        createdTime: ranking.createdTime,
        lastModified: ranking.lastModified
      };
    }) || [];

    return createSuccessResponse(teacherRankings);

  } catch (error) {
    logErr('Get teacher rankings error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get teacher rankings');
  }
}

/**
 * Delete a submission - renamed to withdrawSubmission for clarity
 * @deprecated Use withdrawSubmission instead
 */
function deleteSubmission(sessionId, projectId, submissionId) {
  return withdrawSubmission(sessionId, projectId, submissionId);
}

/**
 * Get all voting history for a group in a stage (across all versions)
 * @param {string} sessionId - User session ID
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {string} groupId - Group ID (optional, auto-determined from session if not provided)
 * @returns {Object} All submissions and their voting data for the group in this stage
 */
function getGroupStageVotingHistory(sessionId, projectId, stageId, groupId = null) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    const projectData = readProjectData(projectId);
    
    // Find user's group if groupId not provided
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    const targetGroupId = groupId || (userGroup ? userGroup.groupId : null);
    
    if (!targetGroupId) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group and no group specified');
    }
    
    // Verify user has access to this group
    if (targetGroupId !== userGroup?.groupId) {
      const isAdmin = isSystemAdmin(sessionResult.userEmail);
      const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
      const hasGlobalAccess = globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p));
      
      if (!isAdmin && !hasGlobalAccess) {
        return createErrorResponse('ACCESS_DENIED', 'Cannot access other group\'s data');
      }
    }
    
    // Get all submissions for this group in this stage
    const groupSubmissions = projectData.submissions.filter(s => 
      s.stageId === stageId && s.groupId === targetGroupId
    ).sort((a, b) => a.submitTime - b.submitTime);
    
    // Get all votes for these submissions
    const submissionIds = groupSubmissions.map(s => s.submissionId);
    const allVotes = projectData.submissionapprovalvotes?.filter(v => 
      submissionIds.includes(v.submissionId)
    ) || [];
    
    // Get group member count for context
    const groupMembers = projectData.usergroups.filter(ug => 
      ug.groupId === targetGroupId && ug.isActive
    );
    
    // Build response with all version data and their votes
    const versionsWithVotes = groupSubmissions.map(submission => {
      const submissionVotes = allVotes.filter(v => v.submissionId === submission.submissionId);
      return {
        submissionId: submission.submissionId,
        version: submission.version || 'v1',
        status: submission.status,
        submittedTime: submission.submitTime,
        submitter: submission.submitterEmail,
        votes: submissionVotes.map(v => ({
          voteId: v.voteId,
          voterEmail: v.voterEmail,
          agree: v.agree,
          createdTime: v.createdTime
        })),
        votesSummary: {
          totalVotes: submissionVotes.length,
          agreeVotes: submissionVotes.filter(v => v.agree).length,
          disagreeVotes: submissionVotes.filter(v => !v.agree).length
        }
      };
    });
    
    return createSuccessResponse({
      groupId: targetGroupId,
      stageId: stageId,
      totalMembers: groupMembers.length,
      versions: versionsWithVotes,
      currentActiveVersion: groupSubmissions.find(s => s.status !== 'withdrawn')?.submissionId || null
    });
    
  } catch (error) {
    logErr('Get group stage voting history error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get voting history');
  }
}

/**
 * Restore a withdrawn submission version to active status
 * @param {string} sessionId - User session ID
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID  
 * @param {string} submissionId - Submission ID to restore
 * @returns {Object} API response
 */
function restoreSubmissionVersion(sessionId, projectId, stageId, submissionId) {
  try {
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate submission ID
    if (!validateSubmissionId(submissionId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid submission ID format');
    }

    const projectData = readProjectData(projectId);
    
    // Check if stage is still active before allowing restore
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageCheck = checkStageIsActive(stage);
    if (!stageCheck.isActive) {
      return createErrorResponse('STAGE_INACTIVE', stageCheck.reason);
    }
    
    // Find the submission to restore
    const submission = projectData.submissions.find(s => s.submissionId === submissionId);
    if (!submission) {
      return createErrorResponse('SUBMISSION_NOT_FOUND', 'Submission not found');
    }

    // Verify stage matches
    if (submission.stageId !== stageId) {
      return createErrorResponse('STAGE_MISMATCH', 'Submission does not belong to the specified stage');
    }

    // Find user's group
    const userGroup = projectData.usergroups.find(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    if (!userGroup) {
      return createErrorResponse('NOT_IN_GROUP', 'User is not in any active group');
    }

    // CRITICAL: Only allow group members to restore their own group's submission
    if (userGroup.groupId !== submission.groupId) {
      return createErrorResponse('ACCESS_DENIED', 'You can only restore your own group\'s submissions');
    }

    // Check if submission is actually withdrawn
    if (submission.status !== 'withdrawn') {
      return createErrorResponse('NOT_WITHDRAWN', 'Only withdrawn submissions can be restored');
    }

    // 恢復版本：撤回現在的版本，用舊數據重建新版本

    // Step 1: Withdraw any current active submissions for this stage/group
    const activeSubmissions = projectData.submissions.filter(s => 
      s.stageId === stageId && 
      s.groupId === userGroup.groupId && 
      s.status !== 'withdrawn'
    );
    
    activeSubmissions.forEach(activeSub => {
      updateSheetRow(projectId, 'Submissions', 'submissionId', activeSub.submissionId, {
        status: 'withdrawn',
        withdrawnTime: getCurrentTimestamp(),
        withdrawnBy: sessionResult.userEmail,
        withdrawnReason: 'replaced_by_restoration'
      });
    });

    // Step 2: Create new submission using old version's data
    const newSubmissionId = generateIdWithType('submission');
    const timestamp = getCurrentTimestamp();
    
    // Determine new version number
    const allGroupSubmissions = projectData.submissions.filter(s => 
      s.groupId === userGroup.groupId && s.stageId === stageId
    );
    const latestVersion = allGroupSubmissions.reduce((maxV, sub) => {
      const vNum = parseInt(sub.version?.replace('v', '') || '0');
      return vNum > maxV ? vNum : maxV;
    }, 0);
    const newVersion = `v${latestVersion + 1}`;

    const newSubmission = {
      submissionId: newSubmissionId,
      stageId: stageId,
      groupId: userGroup.groupId,
      contentMarkdown: submission.contentMarkdown, // Copy from old version
      actualAuthors: submission.actualAuthors, // Copy from old version
      participationProposal: submission.participationProposal, // Copy from old version
      version: newVersion,
      submitTime: timestamp,
      submitterEmail: sessionResult.userEmail,
      status: 'submitted',
      restoredFromSubmissionId: submissionId, // Track what this was restored from
      restoredBy: sessionResult.userEmail,
      restoredTime: timestamp
    };

    addRowToSheet(projectId, 'Submissions', newSubmission);

    // Log the restoration
    logOperation(
      sessionResult.userEmail,
      'submission_restored',
      'submission',
      newSubmissionId,
      { 
        projectId: projectId,
        stageId: stageId,
        groupId: submission.groupId,
        originalSubmissionId: submissionId,
        restoredFromVersion: submission.version
      }
    );

    // Send notifications to group members about restoration
    sendSubmissionRestoredNotifications(projectId, stageId, submission.groupId, newSubmissionId, sessionResult.userEmail);

    return createSuccessResponse({
      newSubmissionId: newSubmissionId,
      originalSubmissionId: submissionId,
      version: newVersion,
      withdrawnSubmissions: activeSubmissions.map(s => s.submissionId)
    }, 'Version restored successfully - new submission created');

  } catch (error) {
    logErr('Restore submission error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to restore submission');
  }
}

/**
 * Send notifications to all group members about submission withdrawal
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {string} groupId - Group ID
 * @param {string} submissionId - Submission ID
 * @param {string} withdrawerEmail - Email of user who withdrew the submission
 */
function sendSubmissionWithdrawnNotifications(projectId, stageId, groupId, submissionId, withdrawerEmail) {
  try {
    const projectData = readProjectDataWithSyncedStages(projectId);
    const globalData = readGlobalData();
    
    // Get project and stage names
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    const group = projectData.groups.find(g => g.groupId === groupId);
    const groupName = group ? group.groupName : '未知群組';
    
    // Get withdrawer's display name
    const withdrawerUser = globalData.users.find(u => u.userEmail === withdrawerEmail);
    const withdrawerName = withdrawerUser ? (withdrawerUser.displayName || withdrawerUser.username || withdrawerEmail) : withdrawerEmail;
    
    // Get all group members
    const groupMembers = projectData.usergroups.filter(ug => 
      ug.groupId === groupId && ug.isActive
    );
    
    groupMembers.forEach(member => {
      createNotification({
        targetUserEmail: member.userEmail,
        type: 'submission_withdrawn',
        title: '⚠️ 報告已刪除重發',
        content: `${projectName} 專案的「${stageName}」階段中，${groupName} 群組的報告已被 ${withdrawerName} 刪除。請盡快重新提交新版本。`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: submissionId,
        metadata: {
          groupId: groupId,
          groupName: groupName,
          withdrawerEmail: withdrawerEmail,
          withdrawerName: withdrawerName,
          action: 'submission_withdrawn'
        },
        priority: 'high',
        category: 'submission'
      });
    });
    
    logInfo(`Sent submission withdrawal notifications to ${groupMembers.length} group members`);
    
  } catch (error) {
    logErr('Failed to send submission withdrawal notifications', error);
  }
}

/**
 * Send notifications to all group members about submission restoration
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {string} groupId - Group ID
 * @param {string} submissionId - Submission ID
 * @param {string} restorerEmail - Email of user who restored the submission
 */
function sendSubmissionRestoredNotifications(projectId, stageId, groupId, submissionId, restorerEmail) {
  try {
    const projectData = readProjectDataWithSyncedStages(projectId);
    const globalData = readGlobalData();
    
    // Get project and stage names
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';
    
    const group = projectData.groups.find(g => g.groupId === groupId);
    const groupName = group ? group.groupName : '未知群組';
    
    // Get restorer's display name
    const restorerUser = globalData.users.find(u => u.userEmail === restorerEmail);
    const restorerName = restorerUser ? (restorerUser.displayName || restorerUser.username || restorerEmail) : restorerEmail;
    
    // Get all group members
    const groupMembers = projectData.usergroups.filter(ug => 
      ug.groupId === groupId && ug.isActive
    );
    
    groupMembers.forEach(member => {
      createNotification({
        targetUserEmail: member.userEmail,
        type: 'submission_restored',
        title: '🔄 報告版本已重建',
        content: `${projectName} 專案的「${stageName}」階段中，${groupName} 群組的報告版本已被 ${restorerName} 使用舊版本資料重新發布。請盡速確認新版本內容。`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: submissionId,
        metadata: {
          groupId: groupId,
          groupName: groupName,
          restorerEmail: restorerEmail,
          restorerName: restorerName,
          action: 'submission_restored'
        },
        priority: 'high',
        category: 'submission'
      });
    });
    
    logInfo(`Sent submission restoration notifications to ${groupMembers.length} group members`);
    
  } catch (error) {
    logErr('Failed to send submission restoration notifications', error);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    submitDeliverable,
    submitGroupRanking,
    voteOnRankingProposal,
    getStageSubmissions,
    getSubmissionDetails,
    updateSubmission,
    getStageRankingProposals,
    addSubmissionComment,
    voteApproveGroupSubmission,
    getGroupSubmissionApprovalVotes,
    deleteSubmission,
    withdrawSubmission,
    voteParticipationProposal,
    getParticipationConfirmations,
    voteTeacherRanking,
    getTeacherRankings,
    getTeacherVoteHistory,
    submitTeacherComprehensiveVote,
    getSubmissionVersions,
    getGroupStageVotingHistory,
    restoreSubmissionVersion,
    getStageRankings
  };
}

/**
 * Get stage rankings data (voteRank and teacherRank for all groups)
 */
function getStageRankings(sessionId, projectId, stageId) {
  try {
    console.log(`🚀 [getStageRankings] 函數開始執行: projectId=${projectId}, stageId=${stageId}`);
    
    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      console.log(`❌ [getStageRankings] 專案存取權限檢查失敗`);
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;

    console.log(`✅ [getStageRankings] 權限檢查通過，開始讀取專案數據`);
    
    console.log(`🔍 [getStageRankings] 當前用戶 email: ${sessionResult.userEmail}`);
    console.log(`🔍 [getStageRankings] 專案中所有 usergroups 數量: ${(projectData.usergroups || []).length}`);
    
    // Get current user's group IDs
    const currentUserGroupIds = projectData.usergroups
      .filter(ug => ug.userEmail === sessionResult.userEmail && ug.isActive)
      .map(ug => ug.groupId);

    console.log(`🔍 [getStageRankings] 當前用戶組: ${currentUserGroupIds}`);
    console.log(`🔍 [getStageRankings] RankingProposals 數量: ${(projectData.rankingproposals || []).length}`);

    const rankings = {};

    // 1. 取得所有組別的 teacherRank (從 TeacherSubmissionRankings)
    // 直接從 sheet 讀取，因為這個表格不在 PROJECT_WORKBOOK_TEMPLATES 中
    let teacherRankings = [];
    try {
      const projectWorkbook = getProjectWorkbook(projectId);
      const teacherSheet = projectWorkbook.getSheetByName('TeacherSubmissionRankings');
      if (teacherSheet) {
        teacherRankings = readFullSheet(projectWorkbook, 'TeacherSubmissionRankings');
        console.log(`🔍 [getStageRankings] 直接讀取 TeacherSubmissionRankings 數量: ${teacherRankings.length}`);
      } else {
        console.log(`⚠️ [getStageRankings] TeacherSubmissionRankings 表格不存在`);
      }
    } catch (error) {
      console.log(`❌ [getStageRankings] 讀取 TeacherSubmissionRankings 失敗: ${error.message}`);
    }
    
    if (teacherRankings && teacherRankings.length > 0) {
      teacherRankings
        .filter(tsr => tsr.stageId === stageId)
        .forEach(tsr => {
          if (!rankings[tsr.groupId]) {
            rankings[tsr.groupId] = {};
          }
          rankings[tsr.groupId].teacherRank = tsr.rank;
        });
    }

    // 2. 取得當前用戶組的 voteRank (從 RankingProposals)
    if (currentUserGroupIds.length > 0 && projectData.rankingproposals) {
      // 找到當前用戶組的最新排名提案
      const userGroupRankingProposals = projectData.rankingproposals
        .filter(rp => {
          const isCorrectStage = rp.stageId === stageId;
          const isSubmitted = rp.status === 'active'; // 修正狀態過濾
          
          // 檢查提案者是否屬於當前用戶的組別
          const proposerUserGroups = projectData.usergroups
            .filter(ug => ug.userEmail === rp.proposerEmail && ug.isActive)
            .map(ug => ug.groupId);
          const belongsToUserGroup = proposerUserGroups.some(gid => currentUserGroupIds.includes(gid));
          
          return isCorrectStage && isSubmitted && belongsToUserGroup;
        })
        .sort((a, b) => b.lastModified - a.lastModified);

      console.log(`🔍 [getStageRankings] 找到 ${userGroupRankingProposals.length} 個用戶組排名提案`);
      
      // 顯示過濾詳情
      const stageProposals = projectData.rankingproposals.filter(rp => rp.stageId === stageId);
      console.log(`🔍 [getStageRankings] 該階段總提案數: ${stageProposals.length}`);
      stageProposals.forEach(rp => {
        console.log(`🔍 [getStageRankings] 提案詳情:`, {
          proposalId: rp.proposalId,
          proposerEmail: rp.proposerEmail,
          status: rp.status,
          currentUserEmail: sessionResult.userEmail
        });
      });

      if (userGroupRankingProposals.length > 0) {
        const latestProposal = userGroupRankingProposals[0];
        console.log(`🔍 [getStageRankings] 使用提案: ${latestProposal.proposalId}`);
        
        try {
          const rankingData = JSON.parse(latestProposal.rankingData || '[]');
          
          // 處理數組格式的排名數據 [{rank: 1, groupId: "grp_xxx"}]
          if (Array.isArray(rankingData)) {
            rankingData.forEach(item => {
              if (item.groupId && item.rank) {
                if (!rankings[item.groupId]) {
                  rankings[item.groupId] = {};
                }
                rankings[item.groupId].voteRank = item.rank;
              }
            });
          } else if (typeof rankingData === 'object') {
            // 處理對象格式的排名數據 {groupId: rank}
            Object.keys(rankingData).forEach(groupId => {
              if (!rankings[groupId]) {
                rankings[groupId] = {};
              }
              rankings[groupId].voteRank = rankingData[groupId];
            });
          }
          
          console.log(`🔍 [getStageRankings] 解析到的排名數據:`, rankingData);
        } catch (error) {
          console.error('Failed to parse ranking data:', error);
        }
      }
    }

    console.log(`🔍 [getStageRankings] 最終排名結果:`, rankings);
    console.log(`🎉 [getStageRankings] 函數執行完成，準備回傳結果`);

    const result = createSuccessResponseWithSession(sessionId, {
      stageId: stageId,
      rankings: rankings,
      userGroups: currentUserGroupIds,
      loadedAt: getCurrentTimestamp(),
      // 臨時debug資訊
      debug: {
        currentUserEmail: sessionResult.userEmail,
        userGroupsCount: (projectData.usergroups || []).length,
        teacherSubmissionRankingsCount: teacherRankings.length,
        rankingProposalsCount: (projectData.rankingproposals || []).length,
        availableTables: Object.keys(projectData).sort(),
        sampleUserGroup: projectData.usergroups?.[0] || null,
        sampleRankingProposal: projectData.rankingproposals?.[0] || null
      }
    });
    
    console.log(`📤 [getStageRankings] 回傳結果:`, result);
    return result;

  } catch (error) {
    console.error(`❌ [getStageRankings] 發生錯誤:`, error);
    logErr('Get stage rankings error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get stage rankings');
  }
}