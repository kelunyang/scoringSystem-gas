/**
 * @fileoverview Lightweight stage status synchronization
 * @module StageStatusSync
 * 
 * Automatically syncs stage status based on current time whenever stages are read
 */

/**
 * Calculate correct stage status based on current time
 * @param {Object} stage - Stage object
 * @returns {string} - Correct status
 */
function calculateCorrectStageStatus(stage) {
  if (!stage) return 'pending';
  
  const currentTime = Date.now();
  
  // Preserve manually set completed/archived status
  if (stage.status === 'completed' || stage.status === 'archived') {
    return stage.status;
  }
  
  // Calculate based on dates
  if (stage.consensusDeadline && currentTime >= stage.consensusDeadline) {
    return 'completed';
  } else if (stage.endDate && currentTime >= stage.endDate) {
    return 'voting';
  } else if (stage.startDate && currentTime >= stage.startDate) {
    return 'active';
  } else {
    return 'pending';
  }
}

/**
 * Sync stage status if needed - lightweight version
 * @param {string} projectId - Project ID
 * @param {Object} stage - Stage object
 * @returns {Object} - Updated stage object
 */
function syncStageStatus(projectId, stage) {
  const correctStatus = calculateCorrectStageStatus(stage);

  if (correctStatus !== stage.status) {
    const oldStatus = stage.status;

    // Update in database
    updateSheetRow(projectId, 'Stages', 'stageId', stage.stageId, {
      status: correctStatus,
      lastAutoSync: getCurrentTimestamp()
    });

    // Update local object
    stage.status = correctStatus;

    // Log the change
    logInfo('Stage status auto-synced', {
      projectId: projectId,
      stageId: stage.stageId,
      newStatus: correctStatus
    });

    // Log event for auto status change
    logOperation(
      projectId,
      'system',
      'stage_status_changed',
      'stage',
      stage.stageId,
      { from: oldStatus, to: correctStatus, auto: true, stageName: stage.stageName }
    );
  }

  return stage;
}

/**
 * Sync all stages in project data - call this in any API that reads stages
 * @param {string} projectId - Project ID
 * @param {Array} stages - Array of stage objects
 * @returns {Array} - Updated stages array
 */
function syncAllStageStatuses(projectId, stages) {
  if (!stages || !Array.isArray(stages)) return stages;
  
  return stages.map(stage => syncStageStatus(projectId, stage));
}

/**
 * Enhanced readProjectData that automatically syncs stage statuses
 * @param {string} projectId - Project ID
 * @returns {Object} - Project data with synced stage statuses
 */
function readProjectDataWithSyncedStages(projectId) {
  const projectData = readProjectData(projectId);
  
  if (projectData && projectData.stages) {
    projectData.stages = syncAllStageStatuses(projectId, projectData.stages);
  }
  
  return projectData;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateCorrectStageStatus,
    syncStageStatus,
    syncAllStageStatuses,
    readProjectDataWithSyncedStages
  };
}