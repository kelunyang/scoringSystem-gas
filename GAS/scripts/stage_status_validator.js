/**
 * @fileoverview Backend stage status validation - Security layer
 * @module StageStatusValidator
 */

/**
 * Calculate stage status based on current time and stage dates
 * This is the backend equivalent of frontend calculateStageStatus()
 * CRITICAL: Must match frontend logic exactly for security
 */
function calculateStageStatus(stage) {
  if (!stage) return 'pending';
  
  const now = Date.now();
  
  // Handle different time formats (timestamp or ISO string)
  let startDate = stage.startDate;
  let endDate = stage.endDate;
  
  if (typeof startDate === 'string') {
    startDate = new Date(startDate).getTime();
  } else if (typeof startDate === 'number') {
    startDate = parseInt(startDate);
  }
  
  if (typeof endDate === 'string') {
    endDate = new Date(endDate).getTime();
  } else if (typeof endDate === 'number') {
    endDate = parseInt(endDate);
  }
  
  // Validate that we have valid dates
  if (!startDate || !endDate || isNaN(startDate) || isNaN(endDate)) {
    Logger.warn('Invalid stage dates', { 
      stageId: stage.stageId, 
      startDate: stage.startDate, 
      endDate: stage.endDate 
    });
    return 'pending';
  }
  
  // If manually set to completed or archived status, preserve original status
  // This allows manual overrides by administrators
  if (stage.status === 'completed' || stage.status === 'archived') {
    return stage.status;
  }
  
  // If manually set to voting status, preserve voting status
  // This allows manual override for emergency voting periods
  if (stage.status === 'voting') {
    return 'voting';
  }
  
  // Determine status based on time
  if (now < startDate) {
    return 'pending'; // Not started yet
  } else if (now >= startDate && now < endDate) {
    return 'active'; // In progress
  } else if (now >= endDate) {
    return 'voting'; // Should enter voting phase
  }
  
  // If time data is problematic, return reasonable default
  return 'pending';
}

/**
 * Validate that an action is allowed based on calculated stage status
 * This function should be called before any stage-dependent operation
 */
function validateStageAction(stage, requiredStatus, operation) {
  const calculatedStatus = calculateStageStatus(stage);
  const storedStatus = stage.status;
  
  // Log any discrepancies for security monitoring
  if (calculatedStatus !== storedStatus) {
    Logger.warn('Stage status discrepancy detected', {
      stageId: stage.stageId,
      calculatedStatus: calculatedStatus,
      storedStatus: storedStatus,
      operation: operation,
      timestamp: new Date().toISOString()
    });
  }
  
  // Use calculated status for validation (more secure)
  if (calculatedStatus !== requiredStatus) {
    return {
      valid: false,
      error: `Operation '${operation}' requires stage status '${requiredStatus}' but current status is '${calculatedStatus}'`,
      calculatedStatus: calculatedStatus,
      storedStatus: storedStatus
    };
  }
  
  return {
    valid: true,
    calculatedStatus: calculatedStatus,
    storedStatus: storedStatus
  };
}

/**
 * Validate submission operation (requires 'active' status)
 */
function validateSubmissionAction(stage, operation) {
  return validateStageAction(stage, 'active', operation);
}

/**
 * Validate voting operation (requires 'voting' status)
 */
function validateVotingAction(stage, operation) {
  return validateStageAction(stage, 'voting', operation);
}

/**
 * Get multiple stages with calculated status
 * Useful for API endpoints that return stage lists
 */
function enrichStagesWithCalculatedStatus(stages) {
  if (!Array.isArray(stages)) return [];
  
  return stages.map(stage => {
    const calculatedStatus = calculateStageStatus(stage);
    
    return {
      ...stage,
      calculatedStatus: calculatedStatus,
      statusConsistent: calculatedStatus === stage.status
    };
  });
}

/**
 * Security validation for stage-dependent API calls
 * Call this at the beginning of any stage operation
 */
function secureStageValidation(sessionId, projectId, stageId, requiredStatus, operation) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return { valid: false, error: 'SESSION_INVALID' };
    }
    
    // Load stage data
    const stageData = getStageById(projectId, stageId);
    if (!stageData) {
      return { valid: false, error: 'STAGE_NOT_FOUND' };
    }
    
    // Validate stage status
    const statusValidation = validateStageAction(stageData, requiredStatus, operation);
    if (!statusValidation.valid) {
      return { valid: false, error: statusValidation.error };
    }
    
    return {
      valid: true,
      stage: stageData,
      calculatedStatus: statusValidation.calculatedStatus,
      user: sessionResult
    };
    
  } catch (error) {
    Logger.error('Stage validation error', { 
      error: error.message, 
      operation: operation, 
      stageId: stageId 
    });
    return { valid: false, error: 'VALIDATION_FAILED' };
  }
}

/**
 * Batch update stored status to match calculated status
 * Should be called periodically or when discrepancies are detected
 */
function syncStoredStageStatuses(projectId) {
  try {
    const projectData = readProjectData(projectId);
    if (!projectData || !projectData.stages) {
      return { success: false, error: 'Project or stages not found' };
    }
    
    let updatedCount = 0;
    const updates = [];
    
    projectData.stages.forEach(stage => {
      const calculatedStatus = calculateStageStatus(stage);
      if (calculatedStatus !== stage.status) {
        stage.status = calculatedStatus;
        updates.push({
          stageId: stage.stageId,
          oldStatus: stage.status,
          newStatus: calculatedStatus
        });
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      writeProjectData(projectId, projectData);
      Logger.info('Stage status sync completed', {
        projectId: projectId,
        updatedCount: updatedCount,
        updates: updates
      });
    }
    
    return {
      success: true,
      updatedCount: updatedCount,
      updates: updates
    };
    
  } catch (error) {
    Logger.error('Stage status sync failed', { 
      projectId: projectId, 
      error: error.message 
    });
    return { success: false, error: error.message };
  }
}