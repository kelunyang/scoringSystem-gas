/**
 * @fileoverview Stage status patrol functions - 階段狀態巡邏機器人
 * @module StagePatrol
 */

/**
 * Main patrol function to check and update stage statuses
 * This function should be triggered daily by a scheduled task
 */
function patrolStageStatuses() {
  try {
    logInfo('Stage patrol started');
    
    const globalData = readGlobalData();
    const currentTime = Date.now();
    let updatedStagesCount = 0;
    let notificationsSent = 0;
    
    // Get all active projects
    const activeProjects = globalData.projects.filter(p => p.status === 'active');
    
    for (const project of activeProjects) {
      try {
        const projectData = readProjectData(project.projectId);
        
        // Check each stage in the project
        for (const stage of projectData.stages) {
          // Skip if stage is already completed
          if (stage.status === 'completed') continue;
          
          // Check if stage should transition from pending to active
          if (stage.status === 'pending' && currentTime >= stage.startDate) {
            // Update stage status to active
            updateSheetRow(project.projectId, 'Stages', 'stageId', stage.stageId, {
              status: 'active'
            });
            
            // Send stage start notifications
            sendStageStartNotifications(project.projectId, stage.stageId, stage.stageName, 'system');
            
            logInfo('Stage transitioned from pending to active', {
              projectId: project.projectId,
              stageId: stage.stageId,
              stageName: stage.stageName,
              startDate: new Date(stage.startDate).toISOString()
            });
            
            updatedStagesCount++;
            continue; // Move to next stage
          }
          
          // Check if stage should transition from active to voting
          if (stage.status === 'active' && currentTime >= stage.endDate) {
            // Check submissions for this stage
            const stageSubmissions = projectData.submissions.filter(s => s.stageId === stage.stageId);
            const submittedGroups = new Set(stageSubmissions.map(s => s.groupId));
            
            // Get all groups in this project
            const projectGroups = projectData.groups.filter(g => g.isActive);
            
            // Process groups based on submission status
            for (const group of projectGroups) {
              if (submittedGroups.has(group.groupId)) {
                // Group has submitted - auto-approve their submission
                const groupSubmission = stageSubmissions.find(s => s.groupId === group.groupId);
                updateSheetRow(project.projectId, 'Submissions', 'submissionId', groupSubmission.submissionId, {
                  status: 'approved'
                });
                
                // Send notification to group members about auto-approval
                sendGroupSubmissionApprovedNotification(project.projectId, stage.stageId, group.groupId, 'system');
                
                logInfo('Group submission auto-approved', {
                  projectId: project.projectId,
                  stageId: stage.stageId,
                  groupId: group.groupId,
                  submissionId: groupSubmission.submissionId
                });
              } else {
                // Group has not submitted - send missed deadline notification
                sendGroupMissedDeadlineNotification(project.projectId, stage.stageId, group.groupId);
                
                logInfo('Group missed submission deadline', {
                  projectId: project.projectId,
                  stageId: stage.stageId,
                  groupId: group.groupId
                });
              }
            }
            
            // Update stage status to voting
            updateSheetRow(project.projectId, 'Stages', 'stageId', stage.stageId, {
              status: 'voting'
            });
            
            // Send voting phase notifications
            sendStageVotingNotifications(project.projectId, stage.stageId, stage.stageName, 'system');
            
            logInfo('Stage transitioned to voting with submission processing', {
              projectId: project.projectId,
              projectName: project.projectName,
              stageId: stage.stageId,
              stageName: stage.stageName,
              submittedGroups: submittedGroups.size,
              totalGroups: projectGroups.length
            });
            
            updatedStagesCount++;
          }
          
          // Check if stage should transition from voting to completed (if consensusDeadline is set)
          if (stage.status === 'voting' && stage.consensusDeadline && currentTime >= stage.consensusDeadline) {
            // Update stage status to completed
            updateSheetRow(project.projectId, 'Stages', 'stageId', stage.stageId, {
              status: 'completed'
            });
            
            // Send stage completion notifications
            sendStageCompletedNotifications(project.projectId, stage.stageId, stage.stageName, 'system');
            
            logInfo('Stage transitioned to completed', {
              projectId: project.projectId,
              projectName: project.projectName,
              stageId: stage.stageId,
              stageName: stage.stageName
            });
            
            updatedStagesCount++;
          }
          
          // Check for stages nearing deadline (1 day before end)
          if (stage.status === 'active') {
            const oneDayBefore = stage.endDate - (24 * 60 * 60 * 1000);
            
            if (currentTime >= oneDayBefore && currentTime < stage.endDate) {
              // Check if we already sent reminder today
              const reminderKey = `stage_reminder_${stage.stageId}_${new Date().toDateString()}`;
              const reminderSent = PropertiesService.getScriptProperties().getProperty(reminderKey);
              
              if (!reminderSent) {
                // Send deadline reminder notifications
                sendStageDeadlineReminder(project.projectId, stage.stageId, stage.stageName, stage.endDate);
                
                // Mark reminder as sent for today
                PropertiesService.getScriptProperties().setProperty(reminderKey, 'true');
                
                notificationsSent++;
              }
            }
          }
        }
        
      } catch (projectError) {
        logErr('Error processing project in patrol', {
          projectId: project.projectId,
          error: projectError.message
        });
      }
    }
    
    logInfo('Stage patrol completed', {
      projectsChecked: activeProjects.length,
      stagesUpdated: updatedStagesCount,
      reminderssSent: notificationsSent
    });
    
    return {
      success: true,
      projectsChecked: activeProjects.length,
      stagesUpdated: updatedStagesCount,
      remindersSent: notificationsSent
    };
    
  } catch (error) {
    logErr('Stage patrol error', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send deadline reminder notifications
 */
function sendStageDeadlineReminder(projectId, stageId, stageName, endDate) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Format deadline
    const deadline = new Date(endDate).toLocaleString('zh-TW');
    
    // Get all project participants
    const participants = getAllProjectParticipants(projectId);
    
    participants.forEach(participant => {
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'stage_deadline_reminder',
        title: '階段即將結束提醒',
        content: `${projectName} 專案的「${stageName}」階段將於 ${deadline} 結束，請盡快完成提交和評論`,
        projectId: projectId,
        stageId: stageId,
        metadata: {
          projectName: projectName,
          stageName: stageName,
          endDate: endDate
        }
      });
    });
    
    logInfo('Stage deadline reminders sent', {
      projectId: projectId,
      stageId: stageId,
      participantCount: participants.length
    });
    
  } catch (error) {
    logErr('Send stage deadline reminder error', error);
  }
}

/**
 * Force transition stage status (for PM use)
 */
function forceStageTransition(sessionId, projectId, stageId, newStatus) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is Global PM
    if (!isGlobalPM(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only Global PM can force stage transitions');
    }
    
    // Validate new status
    const validStatuses = ['active', 'voting', 'completed'];
    if (!validStatuses.includes(newStatus)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid status. Must be: active, voting, or completed');
    }
    
    // Get stage
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      return createErrorResponse('STAGE_NOT_FOUND', 'Stage not found');
    }
    
    // Check valid transitions
    const validTransitions = {
      'pending': ['active'],
      'active': ['voting', 'completed'],
      'voting': ['completed'],
      'completed': [] // Cannot transition from completed
    };
    
    if (!validTransitions[stage.status].includes(newStatus)) {
      return createErrorResponse('INVALID_TRANSITION', 
        `Cannot transition from ${stage.status} to ${newStatus}`);
    }
    
    // Update stage status
    updateSheetRow(projectId, 'Stages', 'stageId', stageId, {
      status: newStatus,
      forceTransitionBy: sessionResult.userEmail,
      forceTransitionTime: getCurrentTimestamp()
    });
    
    // Send appropriate notifications
    if (newStatus === 'active') {
      sendStageStartNotifications(projectId, stageId, stage.stageName, sessionResult.userEmail);
    } else if (newStatus === 'voting') {
      sendStageVotingNotifications(projectId, stageId, stage.stageName, sessionResult.userEmail);
    } else if (newStatus === 'completed') {
      sendStageCompletedNotifications(projectId, stageId, stage.stageName, sessionResult.userEmail);
    }
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'stage_force_transition',
      'stage',
      stageId,
      {
        projectId: projectId,
        fromStatus: stage.status,
        toStatus: newStatus
      }
    );
    
    return createSuccessResponse({
      stageId: stageId,
      previousStatus: stage.status,
      newStatus: newStatus
    }, 'Stage status updated successfully');
    
  } catch (error) {
    logErr('Force stage transition error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to transition stage');
  }
}

/**
 * Setup scheduled trigger for daily patrol
 * This should be called once during system initialization
 */
function setupStagePatrolTrigger() {
  try {
    // Remove any existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'patrolStageStatuses') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create new daily trigger at 9:00 AM
    ScriptApp.newTrigger('patrolStageStatuses')
      .timeBased()
      .everyDays(1)
      .atHour(9)
      .create();
    
    logInfo('Stage patrol trigger created successfully');
    return { success: true, message: 'Stage patrol trigger created' };
    
  } catch (error) {
    logErr('Setup stage patrol trigger error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Manual trigger for testing
 */
function testStagePatrol() {
  return patrolStageStatuses();
}

/**
 * Send notification to group members when their submission is auto-approved
 */
function sendGroupSubmissionApprovedNotification(projectId, stageId, groupId, approvedBy) {
  try {
    const globalData = readGlobalData();
    const projectData = readProjectData(projectId);
    
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);
    
    if (!project || !stage || !group) {
      logErr('Missing data for submission approved notification', {
        projectId, stageId, groupId,
        hasProject: !!project, hasStage: !!stage, hasGroup: !!group
      });
      return;
    }
    
    // Get group members
    const groupMembers = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive)
      .map(ug => ug.userEmail);
    
    // Create notifications for each group member
    for (const userEmail of groupMembers) {
      const notificationId = generateIdWithType('notification');
      const notification = {
        notificationId: notificationId,
        userEmail: userEmail,
        type: 'submission_auto_approved',
        title: `成果已自動核准 - ${stage.stageName}`,
        message: `階段「${stage.stageName}」時間結束，您的群組「${group.groupName}」提交的成果已自動核准，無需組內投票。`,
        isRead: false,
        createdTime: getCurrentTimestamp(),
        relatedEntityType: 'submission',
        relatedEntityId: stageId,
        projectId: projectId,
        priority: 'normal'
      };
      
      addRowToSheet(null, 'Notifications', notification);
    }
    
    logInfo('Sent submission auto-approved notifications', {
      projectId: projectId,
      stageId: stageId,
      groupId: groupId,
      memberCount: groupMembers.length
    });
    
  } catch (error) {
    logErr('Send group submission approved notification error', error);
  }
}

/**
 * Send notification to group members when they missed the submission deadline
 */
function sendGroupMissedDeadlineNotification(projectId, stageId, groupId) {
  try {
    const globalData = readGlobalData();
    const projectData = readProjectData(projectId);
    
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);
    
    if (!project || !stage || !group) {
      logErr('Missing data for missed deadline notification', {
        projectId, stageId, groupId,
        hasProject: !!project, hasStage: !!stage, hasGroup: !!group
      });
      return;
    }
    
    // Get group members
    const groupMembers = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive)
      .map(ug => ug.userEmail);
    
    // Create notifications for each group member
    for (const userEmail of groupMembers) {
      const notificationId = generateIdWithType('notification');
      const notification = {
        notificationId: notificationId,
        userEmail: userEmail,
        type: 'submission_deadline_missed',
        title: `錯過提交期限 - ${stage.stageName}`,
        message: `階段「${stage.stageName}」已結束，您的群組「${group.groupName}」未在期限內提交成果。本階段將不獲得分數。`,
        isRead: false,
        createdTime: getCurrentTimestamp(),
        relatedEntityType: 'stage',
        relatedEntityId: stageId,
        projectId: projectId,
        priority: 'high'
      };
      
      addRowToSheet(null, 'Notifications', notification);
    }
    
    logInfo('Sent missed deadline notifications', {
      projectId: projectId,
      stageId: stageId,
      groupId: groupId,
      memberCount: groupMembers.length
    });
    
  } catch (error) {
    logErr('Send group missed deadline notification error', error);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    patrolStageStatuses,
    forceStageTransition,
    setupStagePatrolTrigger,
    testStagePatrol,
    sendGroupSubmissionApprovedNotification,
    sendGroupMissedDeadlineNotification
  };
}