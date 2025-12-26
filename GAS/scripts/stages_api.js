/**
 * @fileoverview Stage management API endpoints
 * @module StagesAPI
 */

/**
 * Create a new stage in a project
 */
function createStage(sessionId, projectId, stageData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate project ID
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }
    
    // Check permissions - system admin or global PM can create stages
    // Otherwise check project-specific permissions
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to create stages');
      }
    }
    
    const projectData = readProjectData(projectId);
    
    // Validate required fields
    const requiredFields = ['stageName', 'startDate', 'endDate'];
    const missingFields = validateRequiredFields(stageData, requiredFields);
    if (missingFields.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Missing required fields: ' + missingFields.join(', '));
    }
    
    // Sanitize input
    stageData.stageName = sanitizeString(stageData.stageName, 100);
    stageData.description = sanitizeMarkdown(stageData.description || '');
    
    // Validate dates
    const startDate = parseInt(stageData.startDate);
    const endDate = parseInt(stageData.endDate);
    const consensusDeadline = stageData.consensusDeadline ? parseInt(stageData.consensusDeadline) : null;
    
    if (isNaN(startDate) || isNaN(endDate)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid date format');
    }
    
    if (endDate <= startDate) {
      return createErrorResponse('INVALID_INPUT', 'End date must be after start date');
    }
    
    if (consensusDeadline && (consensusDeadline <= startDate || consensusDeadline >= endDate)) {
      return createErrorResponse('INVALID_INPUT', 'Consensus deadline must be between start and end date');
    }
    
    // Check maximum stage duration
    const maxStageDays = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_STAGE_DURATION_DAYS') || '30');
    const stageDurationDays = (endDate - startDate) / (24 * 60 * 60 * 1000);
    
    if (stageDurationDays > maxStageDays) {
      return createErrorResponse('INVALID_INPUT', `Stage duration cannot exceed ${maxStageDays} days`);
    }
    
    // Get next stage order
    const existingStages = projectData.stages;
    const nextOrder = existingStages.length > 0 ? Math.max(...existingStages.map(s => s.stageOrder)) + 1 : 1;
    
    // Create stage record
    const stageId = generateIdWithType('stage');
    const timestamp = getCurrentTimestamp();

    const stageRecord = {
      stageId: stageId,
      stageName: stageData.stageName,
      stageOrder: nextOrder,
      startDate: startDate,
      endDate: endDate,
      consensusDeadline: consensusDeadline || null,
      status: 'pending',
      description: stageData.description,
      createdTime: timestamp,
      reportRewardPool: parseInt(stageData.reportRewardPool) || 0,
      commentRewardPool: parseInt(stageData.commentRewardPool) || 0
    };

    logInfo('Creating stage record', {
      projectId: projectId,
      stageRecord: stageRecord
    });

    // Add stage to project database
    addRowToSheet(projectId, 'Stages', stageRecord);

    logInfo('Stage added to sheet', {
      stageId: stageId,
      projectId: projectId
    });
    
    // Create stage configuration with default values
    const stageConfig = createDefaultStageConfig(stageId);
    addRowToSheet(projectId, 'StageConfigs', stageConfig);
    
    // Update project total stages count
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    if (project) {
      updateSheetRow(null, 'Projects', 'projectId', projectId, {
        totalStages: nextOrder,
        lastModified: timestamp
      });
    }
    
    // Log stage creation event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'stage_created',
      'stage',
      stageId,
      {
        stageName: stageData.stageName,
        stageOrder: nextOrder
      }
    );
    
    // Send notifications to all project participants about new stage
    sendStageCreatedNotifications(projectId, stageId, stageData.stageName, sessionResult.userEmail);
    
    return createSuccessResponse({
      stageId: stageId,
      stageName: stageData.stageName,
      stageOrder: nextOrder,
      startDate: startDate,
      endDate: endDate,
      consensusDeadline: consensusDeadline,
      status: 'pending',
      description: stageData.description,
      createdTime: timestamp
    }, 'Stage created successfully');
    
  } catch (error) {
    logErr('Create stage error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create stage');
  }
}

/**
 * Get stage details
 */
function getStage(sessionId, projectId, stageId) {
  try {
    logInfo('getStage called', {
      sessionId: sessionId,
      projectId: projectId,
      stageId: stageId
    });
    
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      logError('getStage: Session validation failed', { sessionId });
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    const projectIdValid = validateProjectId(projectId);
    const stageIdValid = validateStageId(stageId);
    
    logInfo('getStage: ID validation', {
      projectId: projectId,
      stageId: stageId,
      projectIdValid: projectIdValid,
      stageIdValid: stageIdValid
    });
    
    if (!projectIdValid || !stageIdValid) {
      logError('getStage: Invalid ID format', {
        projectId: projectId,
        stageId: stageId,
        projectIdValid: projectIdValid,
        stageIdValid: stageIdValid
      });
      return createErrorResponse('INVALID_INPUT', 'Invalid project or stage ID format');
    }
    
    // Check permissions - system admin or global PM can view stage details
    // Otherwise check project-specific permissions
    const projectData = readProjectDataWithSyncedStages(projectId);
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('view')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view stages');
      }
    }
    
    // Get stage
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Get stage configuration
    const stageConfig = projectData.stageconfigs.find(c => c.stageId === stageId);
    
    // Get stage statistics
    const submissions = projectData.submissions.filter(s => s.stageId === stageId);
    const comments = projectData.comments.filter(c => c.stageId === stageId);
    
    return createSuccessResponse({
      stageId: stage.stageId,
      stageName: stage.stageName,
      stageOrder: stage.stageOrder,
      startDate: stage.startDate,
      endDate: stage.endDate,
      consensusDeadline: stage.consensusDeadline,
      status: stage.status,
      description: stage.description,
      createdTime: stage.createdTime,
      reportRewardPool: stage.reportRewardPool || 0,
      commentRewardPool: stage.commentRewardPool || 0,
      config: stageConfig || null,
      statistics: {
        submissionCount: submissions.length,
        commentCount: comments.length
      }
    });
    
  } catch (error) {
    logErr('Get stage error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get stage');
  }
}

/**
 * Update stage details
 */
function updateStage(sessionId, projectId, stageId, updates) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    if (!validateProjectId(projectId) || !validateStageId(stageId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or stage ID format');
    }
    
    // Check permissions - system admin or global PM can update stages
    // Otherwise check project-specific permissions
    const projectData = readProjectData(projectId);
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to update stages');
      }
    }
    
    // Get stage
    const stage = projectData.stages.find(s => s.stageId === stageId);
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Validate updates
    const allowedFields = ['stageName', 'description', 'startDate', 'endDate', 'consensusDeadline', 'status', 'stageOrder', 'reportRewardPool', 'commentRewardPool'];
    const stageUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        if (field === 'stageName') {
          stageUpdates[field] = sanitizeString(updates[field], 100);
        } else if (field === 'description') {
          stageUpdates[field] = sanitizeMarkdown(updates[field]);
        } else if (field.includes('Date') || field.includes('Deadline')) {
          const dateValue = parseInt(updates[field]);
          if (!isNaN(dateValue)) {
            stageUpdates[field] = dateValue;
          }
        } else if (field === 'status') {
          if (['pending', 'active', 'voting', 'completed', 'archived'].includes(updates[field])) {
            stageUpdates[field] = updates[field];
          }
        } else if (field === 'stageOrder') {
          const orderValue = parseInt(updates[field]);
          if (!isNaN(orderValue) && orderValue > 0) {
            stageUpdates[field] = orderValue;
          }
        } else if (field === 'reportRewardPool' || field === 'commentRewardPool') {
          const poolValue = parseInt(updates[field]);
          if (!isNaN(poolValue) && poolValue >= 0) {
            stageUpdates[field] = poolValue;
          }
        }
      }
    });
    
    // Validate date consistency if dates are being updated
    if (stageUpdates.startDate || stageUpdates.endDate || stageUpdates.consensusDeadline) {
      const newStartDate = stageUpdates.startDate || stage.startDate;
      const newEndDate = stageUpdates.endDate || stage.endDate;
      const newConsensusDeadline = stageUpdates.consensusDeadline || stage.consensusDeadline;
      
      if (newEndDate <= newStartDate) {
        return createErrorResponse('INVALID_INPUT', 'End date must be after start date');
      }
      
      if (newConsensusDeadline && (newConsensusDeadline <= newStartDate || newConsensusDeadline >= newEndDate)) {
        return createErrorResponse('INVALID_INPUT', 'Consensus deadline must be between start and end date');
      }
    }
    
    if (Object.keys(stageUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Update stage
    updateSheetRow(projectId, 'Stages', 'stageId', stageId, stageUpdates);

    // Track status change for event logging
    const statusChanged = stageUpdates.status && stageUpdates.status !== stage.status;

    // If stage status is being set to active, update project current stage
    if (stageUpdates.status === 'active' && stage.status !== 'active') {
      updateSheetRow(null, 'Projects', 'projectId', projectId, {
        currentStage: stage.stageOrder,
        lastModified: getCurrentTimestamp()
      });

      // Send stage status change notifications
      sendStageStatusChangeNotifications(projectId, stageId, stage.status, 'active', sessionResult.userEmail);

      // Log status change to active
      logOperation(
        projectId,
        sessionResult.userEmail,
        'stage_status_changed',
        'stage',
        stageId,
        { from: stage.status, to: 'active', stageName: stage.stageName }
      );
    }

    // If stage is entering voting phase
    if (stageUpdates.status === 'voting' && stage.status !== 'voting') {
      // Send stage status change notifications
      sendStageStatusChangeNotifications(projectId, stageId, stage.status, 'voting', sessionResult.userEmail);

      // Log status change to voting
      logOperation(
        projectId,
        sessionResult.userEmail,
        'stage_status_changed',
        'stage',
        stageId,
        { from: stage.status, to: 'voting', stageName: stage.stageName }
      );
    }

    // If stage is being completed
    if (stageUpdates.status === 'completed' && stage.status !== 'completed') {
      // Send stage status change notifications
      sendStageStatusChangeNotifications(projectId, stageId, stage.status, 'completed', sessionResult.userEmail);

      // Log status change to completed
      logOperation(
        projectId,
        sessionResult.userEmail,
        'stage_status_changed',
        'stage',
        stageId,
        { from: stage.status, to: 'completed', stageName: stage.stageName }
      );
    }

    // Handle other status changes (paused, closed, settled, etc.)
    if (statusChanged && !['active', 'voting', 'completed'].includes(stageUpdates.status)) {
      sendStageStatusChangeNotifications(projectId, stageId, stage.status, stageUpdates.status, sessionResult.userEmail);
    }

    // Log general stage update (if not a status change, or if other fields were also updated)
    if (!statusChanged || Object.keys(stageUpdates).length > 1) {
      logOperation(
        projectId,
        sessionResult.userEmail,
        'stage_updated',
        'stage',
        stageId,
        { updatedFields: Object.keys(stageUpdates).filter(f => f !== 'status') }
      );
    }
    
    return createSuccessResponse(null, 'Stage updated successfully');
    
  } catch (error) {
    logErr('Update stage error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update stage');
  }
}

/**
 * List project stages
 */
function listProjectStages(sessionId, projectId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate project ID
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }
    
    // Check permissions - system admin or global PM can view all project stages
    // Otherwise check project-specific permissions
    const projectData = readProjectDataWithSyncedStages(projectId);
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('view')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view stages');
      }
    }
    
    // Get stages with statistics
    const stagesWithStats = projectData.stages
      .map(stage => {
        const submissions = projectData.submissions.filter(s => s.stageId === stage.stageId);
        const comments = projectData.comments.filter(c => c.stageId === stage.stageId);
        
        return {
          stageId: stage.stageId,
          stageName: stage.stageName,
          stageOrder: stage.stageOrder,
          startDate: stage.startDate,
          endDate: stage.endDate,
          consensusDeadline: stage.consensusDeadline,
          status: stage.status,
          description: stage.description,
          createdTime: stage.createdTime,
          reportRewardPool: stage.reportRewardPool || 0,
          commentRewardPool: stage.commentRewardPool || 0,
          statistics: {
            submissionCount: submissions.length,
            commentCount: comments.length
          }
        };
      })
      .sort((a, b) => a.stageOrder - b.stageOrder);
    
    return createSuccessResponse(stagesWithStats);
    
  } catch (error) {
    logErr('List project stages error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to list project stages');
  }
}

/**
 * Update stage configuration
 */
function updateStageConfig(sessionId, projectId, stageId, configUpdates) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    if (!validateProjectId(projectId) || !validateStageId(stageId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or stage ID format');
    }
    
    // Check permissions - system admin or global PM can update stage config
    // Otherwise check project-specific permissions
    const projectData = readProjectData(projectId);
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to update stage configuration');
      }
    }
    
    // Get stage config
    const stageConfig = projectData.stageconfigs.find(c => c.stageId === stageId);
    if (!stageConfig) {
      return createErrorResponse('CONFIG_NOT_FOUND', 'Stage configuration not found');
    }
    
    // Validate config updates
    const allowedFields = [
      'rank1Reward', 'rank2Reward', 'rank3Reward',
      'comment1stReward', 'comment2ndReward', 'comment3rdReward',
      'approvalThreshold', 'maxResubmissions', 'evaluationThreshold', 'pmWeight'
    ];
    
    const validUpdates = {};
    
    allowedFields.forEach(field => {
      if (configUpdates.hasOwnProperty(field)) {
        const value = parseFloat(configUpdates[field]);
        if (!isNaN(value) && value >= 0) {
          validUpdates[field] = value;
        }
      }
    });
    
    if (configUpdates.criteria && typeof configUpdates.criteria === 'object') {
      validUpdates.criteria = safeJsonStringify(configUpdates.criteria);
    }
    
    if (Object.keys(validUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid configuration updates provided');
    }
    
    // Update stage configuration
    updateSheetRow(projectId, 'StageConfigs', 'configId', stageConfig.configId, validUpdates);
    
    // Log config update
    const logEntry = logOperation(
      sessionResult.userEmail,
      'stage_config_updated',
      'stage',
      stageId,
      { 
        projectId: projectId,
        updatedFields: Object.keys(validUpdates)
      }
    );
    
    return createSuccessResponse(null, 'Stage configuration updated successfully');
    
  } catch (error) {
    logErr('Update stage config error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update stage configuration');
  }
}

/**
 * Create default stage configuration
 */
function createDefaultStageConfig(stageId) {
  return {
    configId: generateIdWithType('config'),
    stageId: stageId,
    rank1Reward: 100,
    rank2Reward: 60,
    rank3Reward: 30,
    comment1stReward: 20,
    comment2ndReward: 15,
    comment3rdReward: 10,
    reportRewardPool: 0,
    commentRewardPool: 0,
    approvalThreshold: 0.67,
    maxResubmissions: 3,
    evaluationThreshold: 0.5,
    pmWeight: 0.3,
    criteria: safeJsonStringify({
      quality: 0.4,
      innovation: 0.3,
      presentation: 0.3
    })
  };
}

/**
 * Wrapper functions for frontend compatibility
 */
function getStageList(params) {
  return listProjectStages(params.sessionId, params.projectId);
}

function getStageDetails(params) {
  return getStage(params.sessionId, params.projectId, params.stageId);
}

/**
 * Send notifications when a new stage is created
 */
function sendStageCreatedNotifications(projectId, stageId, stageName, creatorEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get all project participants
    const participants = getAllProjectParticipants(projectId);
    
    participants.forEach(participant => {
      // Skip the creator
      if (participant.userEmail === creatorEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'stage_created',
        title: '新階段已建立',
        content: `${projectName} 專案新增了階段「${stageName}」`,
        projectId: projectId,
        stageId: stageId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          creatorEmail: creatorEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send stage created notifications error', error);
  }
}

/**
 * Send notifications when a stage starts
 */
function sendStageStartNotifications(projectId, stageId, stageName, activatorEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get stage details
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const endDate = stage ? new Date(stage.endDate).toLocaleDateString('zh-TW') : '';
    
    // Get all project participants
    const participants = getAllProjectParticipants(projectId);
    
    // Create notifications with rate limiting protection
    participants.forEach((participant, index) => {
      // Add small delay between notification creations to avoid database overload
      if (index > 0) {
        Utilities.sleep(150); // 0.15 second delay between notifications
      }
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'stage_start',
        title: '階段已開始',
        content: `${projectName} 專案的「${stageName}」階段已經開始，請準備提交成果。截止日期：${endDate}`,
        projectId: projectId,
        stageId: stageId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          endDate: stage ? stage.endDate : null,
          consensusDeadline: stage ? stage.consensusDeadline : null
        }
      });
    });
    
  } catch (error) {
    logErr('Send stage start notifications error', error);
  }
}

/**
 * Send notifications when a stage is completed
 */
function sendStageCompletedNotifications(projectId, stageId, stageName, completerEmail) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get all project participants
    const participants = getAllProjectParticipants(projectId);
    
    // Create notifications with rate limiting protection
    participants.forEach((participant, index) => {
      // Add small delay between notification creations to avoid database overload
      if (index > 0) {
        Utilities.sleep(150); // 0.15 second delay between notifications
      }
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'stage_completed',
        title: '階段已完成',
        content: `${projectName} 專案的「${stageName}」階段已經結束`,
        projectId: projectId,
        stageId: stageId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          completerEmail: completerEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send stage completed notifications error', error);
  }
}

/**
 * Send notifications when a stage enters voting phase
 */
function sendStageVotingNotifications(projectId, stageId, stageName, activatorEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get stage details
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const consensusDeadline = stage && stage.consensusDeadline ? 
      new Date(stage.consensusDeadline).toLocaleDateString('zh-TW') : '未設定';
    
    // Get all project participants
    const participants = getAllProjectParticipants(projectId);
    
    // Create notifications with rate limiting protection
    participants.forEach((participant, index) => {
      // Add small delay between notification creations to avoid database overload
      if (index > 0) {
        Utilities.sleep(150); // 0.15 second delay between notifications
      }
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'stage_voting',
        title: '階段進入投票期',
        content: `${projectName} 專案的「${stageName}」階段已進入投票期，請完成排名和評論投票。投票截止：${consensusDeadline}`,
        projectId: projectId,
        stageId: stageId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          consensusDeadline: stage ? stage.consensusDeadline : null
        }
      });
    });
    
  } catch (error) {
    logErr('Send stage voting notifications error', error);
  }
}

/**
 * Get all participants in a project
 */
function getAllProjectParticipants(projectId) {
  try {
    const projectData = readProjectDataWithSyncedStages(projectId);
    const participants = new Set();
    
    // Add all active group members
    projectData.usergroups.forEach(ug => {
      if (ug.isActive) {
        participants.add(ug.userEmail);
      }
    });
    
    return Array.from(participants).map(email => ({ userEmail: email }));
    
  } catch (error) {
    logErr('Get all project participants error', error);
    return [];
  }
}

/**
 * Clone an existing stage (copy stage settings but not submissions)
 */
function cloneStage(sessionId, projectId, stageId, newStageName) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate inputs
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }
    
    if (!validateStageId(stageId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid stage ID format');
    }
    
    if (!newStageName || !newStageName.trim()) {
      return createErrorResponse('INVALID_INPUT', 'New stage name is required');
    }
    
    // Check permissions - system admin or global PM can clone stages
    // Otherwise check project-specific permissions
    if (!isSystemAdmin(sessionResult.userEmail) && !isGlobalPM(sessionResult.userEmail)) {
      const projectData = readProjectData(projectId);
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to clone stages');
      }
    }
    
    const projectData = readProjectData(projectId);
    
    // Get original stage
    const originalStage = projectData.stages.find(s => s.stageId === stageId);
    if (!originalStage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Original stage not found');
    }
    
    // Sanitize new stage name
    const sanitizedName = sanitizeString(newStageName.trim(), 100);
    
    // Check if stage name already exists
    const existingStage = projectData.stages.find(s => 
      s.stageName.toLowerCase() === sanitizedName.toLowerCase() && s.status !== 'deleted'
    );
    
    if (existingStage) {
      return createErrorResponse('STAGE_EXISTS', 'Stage name already exists in this project');
    }
    
    // Generate new stage ID and timestamps
    const newStageId = generateIdWithType('stage');
    const timestamp = getCurrentTimestamp();
    
    // Calculate new stage order (add to end)
    const activeStages = projectData.stages.filter(s => s.status !== 'deleted');
    const newStageOrder = activeStages.length > 0 ? Math.max(...activeStages.map(s => s.stageOrder || 0)) + 1 : 1;
    
    // Create cloned stage record (copy settings but set new dates to future)
    const currentTime = new Date();
    const oneWeekLater = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twoWeeksLater = new Date(currentTime.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const clonedStage = {
      stageId: newStageId,
      stageName: sanitizedName,
      description: `${originalStage.description || ''} (複製自: ${originalStage.stageName})`,
      stageOrder: newStageOrder,
      startDate: oneWeekLater.getTime(),
      endDate: twoWeeksLater.getTime(),
      reportRewardPool: originalStage.reportRewardPool || 0,
      commentRewardPool: originalStage.commentRewardPool || 0,
      status: 'pending',
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      lastModified: timestamp
    };
    
    // Add cloned stage to project database
    addRowToSheet(projectId, 'Stages', clonedStage);
    
    // Update total stages count in global project record
    const globalData = readGlobalData();
    const projectIndex = globalData.projects.findIndex(p => p.projectId === projectId);
    if (projectIndex !== -1) {
      const updatedTotalStages = (globalData.projects[projectIndex].totalStages || 0) + 1;
      updateSheetRow(null, 'Projects', 'projectId', projectId, {
        totalStages: updatedTotalStages,
        lastModified: timestamp
      });
    }
    
    // Copy stage configuration if it exists
    const originalStageConfig = projectData.stageconfigs?.find(sc => sc.stageId === stageId);
    if (originalStageConfig) {
      const clonedStageConfig = {
        configId: generateIdWithType('config'),
        stageId: newStageId,
        allowMultipleSubmissions: originalStageConfig.allowMultipleSubmissions,
        requireApproval: originalStageConfig.requireApproval,
        allowComments: originalStageConfig.allowComments,
        allowVoting: originalStageConfig.allowVoting,
        votingCriteria: originalStageConfig.votingCriteria,
        maxSubmissionSize: originalStageConfig.maxSubmissionSize,
        allowedFileTypes: originalStageConfig.allowedFileTypes,
        customSettings: originalStageConfig.customSettings,
        createdTime: timestamp
      };
      
      addRowToSheet(projectId, 'StageConfigs', clonedStageConfig);
    }
    
    // Log stage cloning
    const logEntry = logOperation(
      sessionResult.userEmail,
      'stage_cloned',
      'stage',
      newStageId,
      { 
        projectId: projectId,
        originalStageId: stageId,
        originalStageName: originalStage.stageName,
        newStageName: sanitizedName
      }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      stageId: newStageId,
      stageName: sanitizedName,
      description: clonedStage.description,
      stageOrder: newStageOrder,
      startDate: clonedStage.startDate,
      endDate: clonedStage.endDate,
      reportRewardPool: clonedStage.reportRewardPool,
      commentRewardPool: clonedStage.commentRewardPool,
      status: clonedStage.status,
      createdTime: timestamp
    }, 'Stage cloned successfully');
    
  } catch (error) {
    logErr('Clone stage error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to clone stage');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createStage,
    getStage,
    updateStage,
    listProjectStages,
    updateStageConfig,
    createDefaultStageConfig,
    getStageList,
    getStageDetails,
    cloneStage
  };
}