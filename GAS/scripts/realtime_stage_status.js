/**
 * @fileoverview Real-time stage status management system
 * @module RealtimeStageStatus
 * 
 * This module provides immediate stage status updates without relying on scheduled patrol.
 * It automatically calculates and updates stage statuses based on current time and dates.
 */

/**
 * Calculate what the stage status should be based on current time and stage dates
 * @param {Object} stage - Stage object with startDate, endDate, consensusDeadline
 * @returns {string} - Calculated status: 'pending', 'active', 'voting', or current status if manually set
 */
function calculateRealtimeStageStatus(stage) {
  if (!stage) return 'pending';
  
  const currentTime = Date.now();
  const startDate = stage.startDate || 0;
  const endDate = stage.endDate || 0;
  const consensusDeadline = stage.consensusDeadline || 0;
  
  // If stage was manually set to completed or archived, preserve that
  if (stage.status === 'completed' || stage.status === 'archived') {
    return stage.status;
  }
  
  // Calculate status based on current time
  if (consensusDeadline && currentTime >= consensusDeadline) {
    return 'completed';
  } else if (endDate && currentTime >= endDate) {
    return 'voting';
  } else if (startDate && currentTime >= startDate) {
    return 'active';
  } else {
    return 'pending';
  }
}

/**
 * Check if stage status needs updating and update it if necessary
 * @param {string} projectId - Project ID
 * @param {Object} stage - Stage object
 * @returns {Object} - { updated: boolean, oldStatus: string, newStatus: string }
 */
function syncStageStatusIfNeeded(projectId, stage) {
  const calculatedStatus = calculateRealtimeStageStatus(stage);
  const currentStatus = stage.status;
  
  // If status needs updating
  if (calculatedStatus !== currentStatus) {
    // Update the stage status in database
    updateSheetRow(projectId, 'Stages', 'stageId', stage.stageId, {
      status: calculatedStatus,
      lastStatusSync: getCurrentTimestamp(),
      autoUpdatedBy: 'realtime_sync'
    });
    
    // Log the status change
    logInfo('Stage status auto-updated', {
      projectId: projectId,
      stageId: stage.stageId,
      stageName: stage.stageName,
      oldStatus: currentStatus,
      newStatus: calculatedStatus,
      updateTime: new Date().toISOString()
    });
    
    // Send notifications for status changes
    sendStageStatusChangeNotifications(projectId, stage.stageId, stage.stageName, currentStatus, calculatedStatus);
    
    return {
      updated: true,
      oldStatus: currentStatus,
      newStatus: calculatedStatus
    };
  }
  
  return {
    updated: false,
    oldStatus: currentStatus,
    newStatus: currentStatus
  };
}

/**
 * Sync all stages in a project to their correct real-time status
 * @param {string} projectId - Project ID
 * @returns {Object} - Summary of updates made
 */
function syncProjectStageStatuses(projectId) {
  try {
    const projectData = readProjectData(projectId);
    const updates = [];
    
    for (const stage of projectData.stages) {
      const result = syncStageStatusIfNeeded(projectId, stage);
      if (result.updated) {
        updates.push({
          stageId: stage.stageId,
          stageName: stage.stageName,
          oldStatus: result.oldStatus,
          newStatus: result.newStatus
        });
      }
    }
    
    return {
      success: true,
      projectId: projectId,
      updatesCount: updates.length,
      updates: updates
    };
    
  } catch (error) {
    logError('Error syncing project stage statuses', {
      projectId: projectId,
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get stage with real-time calculated status (without updating database)
 * @param {Object} stage - Stage object
 * @returns {Object} - Stage object with calculated real-time status
 */
function getStageWithRealtimeStatus(stage) {
  if (!stage) return null;
  
  return {
    ...stage,
    calculatedStatus: calculateRealtimeStageStatus(stage),
    statusNeedsSync: calculateRealtimeStageStatus(stage) !== stage.status
  };
}

/**
 * Ensure stage is in correct status before performing an operation
 * This function should be called before any stage-dependent operation
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @returns {Object} - Stage object with updated status
 */
function ensureStageStatusCurrent(projectId, stageId) {
  try {
    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    
    if (!stage) {
      throw new Error('Stage not found');
    }
    
    // Sync status if needed
    const syncResult = syncStageStatusIfNeeded(projectId, stage);
    
    // Return stage with current status
    return {
      ...stage,
      status: syncResult.newStatus,
      wasUpdated: syncResult.updated
    };
    
  } catch (error) {
    logError('Error ensuring stage status is current', {
      projectId: projectId,
      stageId: stageId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Send notifications when stage status changes automatically
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 * @param {string} stageName - Stage name
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 */
function sendStageStatusChangeNotifications(projectId, stageId, stageName, oldStatus, newStatus) {
  try {
    switch (newStatus) {
      case 'active':
        if (oldStatus === 'pending') {
          sendStageStartNotifications(projectId, stageId, stageName, 'system');
        }
        break;
      case 'voting':
        if (oldStatus === 'active') {
          sendStageVotingNotifications(projectId, stageId, stageName, 'system');
          // Also process submissions for auto-approval
          processStageSubmissionsForVoting(projectId, stageId);
        }
        break;
      case 'completed':
        if (oldStatus === 'voting') {
          sendStageCompletedNotifications(projectId, stageId, stageName, 'system');
        }
        break;
    }
  } catch (error) {
    logError('Error sending stage status change notifications', {
      projectId: projectId,
      stageId: stageId,
      error: error.message
    });
  }
}

/**
 * Process submissions when stage transitions to voting
 * Auto-approve submissions from groups that submitted on time
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID
 */
function processStageSubmissionsForVoting(projectId, stageId) {
  try {
    const projectData = readProjectData(projectId);
    const stageSubmissions = projectData.submissions.filter(s => s.stageId === stageId);
    const submittedGroups = new Set(stageSubmissions.map(s => s.groupId));
    const projectGroups = projectData.groups.filter(g => g.isActive);
    
    // Process each group
    for (const group of projectGroups) {
      if (submittedGroups.has(group.groupId)) {
        // Group has submitted - auto-approve their submission
        const groupSubmission = stageSubmissions.find(s => s.groupId === group.groupId);
        updateSheetRow(projectId, 'Submissions', 'submissionId', groupSubmission.submissionId, {
          status: 'approved',
          autoApprovedBy: 'realtime_sync',
          autoApprovedTime: getCurrentTimestamp()
        });
        
        // Send notification to group members about auto-approval
        sendGroupSubmissionApprovedNotification(projectId, stageId, group.groupId, 'system');
        
        logInfo('Group submission auto-approved during realtime sync', {
          projectId: projectId,
          stageId: stageId,
          groupId: group.groupId,
          submissionId: groupSubmission.submissionId
        });
      } else {
        // Group has not submitted - send missed deadline notification
        sendGroupMissedDeadlineNotification(projectId, stageId, group.groupId);
        
        logInfo('Group missed submission deadline (realtime sync)', {
          projectId: projectId,
          stageId: stageId,
          groupId: group.groupId
        });
      }
    }
  } catch (error) {
    logError('Error processing stage submissions for voting', {
      projectId: projectId,
      stageId: stageId,
      error: error.message
    });
  }
}

/**
 * Middleware function to be called before any stage-dependent API operation
 * @param {string} projectId - Project ID
 * @param {string} stageId - Stage ID (optional, will sync all stages if not provided)
 * @returns {Object} - Sync result
 */
function stageStatusMiddleware(projectId, stageId = null) {
  if (stageId) {
    // Sync specific stage
    const stage = ensureStageStatusCurrent(projectId, stageId);
    return {
      success: true,
      stage: stage,
      wasUpdated: stage.wasUpdated
    };
  } else {
    // Sync all stages in project
    return syncProjectStageStatuses(projectId);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateRealtimeStageStatus,
    syncStageStatusIfNeeded,
    syncProjectStageStatuses,
    getStageWithRealtimeStatus,
    ensureStageStatusCurrent,
    stageStatusMiddleware,
    sendStageStatusChangeNotifications,
    processStageSubmissionsForVoting
  };
}