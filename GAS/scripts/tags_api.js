/**
 * @fileoverview Tag management API endpoints
 * @module TagsAPI
 */

/**
 * Helper function to read global sheet data
 */
function readGlobalSheet(sheetName) {
  const globalDb = getGlobalWorkbook();
  return readFullSheet(globalDb, sheetName) || [];
}

/**
 * Helper function to add row to global sheet
 */
function addRowToGlobalSheet(sheetName, data) {
  const globalDb = getGlobalWorkbook();
  const sheet = globalDb.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found in global database`);
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = headers.map(header => data[header] || '');
  sheet.appendRow(rowData);
}

/**
 * Helper function to update row in global sheet
 */
function updateGlobalSheetRow(sheetName, keyColumn, keyValue, updates) {
  const globalDb = getGlobalWorkbook();
  const sheet = globalDb.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found in global database`);
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyColumnIndex = headers.indexOf(keyColumn);
  
  if (keyColumnIndex === -1) {
    throw new Error(`Column ${keyColumn} not found in sheet ${sheetName}`);
  }
  
  // Find the row to update
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyColumnIndex] === keyValue) {
      // Update the row
      Object.keys(updates).forEach(field => {
        const fieldIndex = headers.indexOf(field);
        if (fieldIndex !== -1) {
          sheet.getRange(i + 1, fieldIndex + 1).setValue(updates[field]);
        }
      });
      
      // Clear cache if dataCache exists (defined in database.js)
      const cacheKey = 'global';
      if (typeof dataCache !== 'undefined' && dataCache && dataCache.has(cacheKey)) {
        dataCache.delete(cacheKey);
      }
      
      return;
    }
  }
  
  throw new Error(`Row with ${keyColumn}=${keyValue} not found in sheet ${sheetName}`);
}

/**
 * Create a new tag
 */
function createTag(sessionId, tagData) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user is admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Validate input
    if (!tagData || !tagData.tagName) {
      return createErrorResponse('INVALID_INPUT', 'Tag name is required');
    }

    // Validate tag name length and format
    const tagName = sanitizeString(tagData.tagName, 50);
    if (tagName.length < 2) {
      return createErrorResponse('INVALID_INPUT', 'Tag name must be at least 2 characters');
    }

    // Check if tag name already exists
    const existingTags = readGlobalSheet('Tags');
    if (existingTags.find(t => t.tagName.toLowerCase() === tagName.toLowerCase() && t.isActive)) {
      return createErrorResponse('TAG_EXISTS', 'Tag name already exists');
    }

    // Create tag
    const tagId = generateIdWithType('tag');
    const timestamp = getCurrentTimestamp();

    const tag = {
      tagId: tagId,
      tagName: tagName,
      tagColor: sanitizeString(tagData.tagColor || '#3498db', 20),
      description: sanitizeString(tagData.description || '', 200),
      isActive: true,
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      lastModified: timestamp
    };

    addRowToGlobalSheet('Tags', tag);

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'tag_created',
      'tag',
      tagId,
      {
        tagName: tagName
      }
    );

    return createSuccessResponseWithSession(sessionId, tag, 'Tag created successfully');

  } catch (error) {
    logErr('Create tag error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create tag');
  }
}

/**
 * Get all tags with optional filtering
 */
function getTags(sessionId, filters = {}) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Get all tags
    let tags = readGlobalSheet('Tags');

    // Apply filters
    if (filters.isActive !== undefined) {
      tags = tags.filter(tag => tag.isActive === Boolean(filters.isActive));
    }


    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      tags = tags.filter(tag => 
        tag.tagName.toLowerCase().includes(searchTerm) ||
        (tag.description && tag.description.toLowerCase().includes(searchTerm))
      );
    }

    // Sort by creation time (newest first)
    tags.sort((a, b) => b.createdTime - a.createdTime);

    return createSuccessResponseWithSession(sessionId, tags);

  } catch (error) {
    logErr('Get tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get tags');
  }
}

/**
 * Update tag
 */
function updateTag(sessionId, tagId, updates) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Validate tag ID
    if (!validateTagId(tagId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid tag ID format');
    }

    // Get existing tag
    const tags = readGlobalSheet('Tags');
    const existingTag = tags.find(t => t.tagId === tagId);
    if (!existingTag) {
      return createErrorResponse('TAG_NOT_FOUND', 'Tag not found');
    }

    // Validate allowed updates
    const allowedFields = ['tagName', 'tagColor', 'description', 'isActive'];
    const tagUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        switch (field) {
          case 'tagName':
            const newName = sanitizeString(updates[field], 50);
            if (newName.length < 2) {
              throw new Error('Tag name must be at least 2 characters');
            }
            // Check for duplicate names (excluding current tag)
            if (tags.find(t => t.tagId !== tagId && t.tagName.toLowerCase() === newName.toLowerCase() && t.isActive)) {
              throw new Error('Tag name already exists');
            }
            tagUpdates[field] = newName;
            break;
          case 'tagColor':
            tagUpdates[field] = sanitizeString(updates[field], 20);
            break;
          case 'description':
            tagUpdates[field] = sanitizeString(updates[field], 200);
            break;
          case 'isActive':
            tagUpdates[field] = Boolean(updates[field]);
            break;
        }
      }
    });

    if (Object.keys(tagUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }

    // Add modification tracking
    tagUpdates.lastModified = getCurrentTimestamp();

    // Update tag
    updateGlobalSheetRow('Tags', 'tagId', tagId, tagUpdates);

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'tag_updated',
      'tag',
      tagId,
      {
        updatedFields: Object.keys(tagUpdates)
      }
    );

    return createSuccessResponseWithSession(sessionId, null, 'Tag updated successfully');

  } catch (error) {
    logErr('Update tag error', error);
    return createErrorResponse('SYSTEM_ERROR', error.message || 'Failed to update tag');
  }
}

/**
 * Delete tag (soft delete by setting isActive to false)
 */
function deleteTag(sessionId, tagId) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Validate tag ID
    if (!validateTagId(tagId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid tag ID format');
    }

    // Check if tag exists
    const tags = readGlobalSheet('Tags');
    const existingTag = tags.find(t => t.tagId === tagId);
    if (!existingTag) {
      return createErrorResponse('TAG_NOT_FOUND', 'Tag not found');
    }

    // Soft delete by setting isActive to false
    const updates = {
      isActive: false,
      lastModified: getCurrentTimestamp()
    };

    updateGlobalSheetRow('Tags', 'tagId', tagId, updates);

    // Also deactivate all tag assignments
    deactivateTagAssignments(tagId);

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'tag_deleted',
      'tag',
      tagId,
      {
        tagName: existingTag.tagName
      }
    );

    return createSuccessResponseWithSession(sessionId, null, 'Tag deleted successfully');

  } catch (error) {
    logErr('Delete tag error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete tag');
  }
}

/**
 * Assign tag to project
 */
function assignTagToProject(sessionId, projectId, tagId) {
  try {
    // Validate session and permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Check if user has permission to manage this project
    if (!canManageProject(sessionResult.userEmail, projectId)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to manage this project');
    }

    // Validate IDs
    if (!validateProjectId(projectId) || !validateTagId(tagId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID or tag ID format');
    }

    // Check if project and tag exist
    const projects = readGlobalSheet('Projects');
    if (!projects.find(p => p.projectId === projectId)) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    const tags = readGlobalSheet('Tags');
    const tag = tags.find(t => t.tagId === tagId);
    if (!tag) {
      return createErrorResponse('TAG_NOT_FOUND', 'Tag not found');
    }

    // IMPORTANT: Check if tag is active (not archived)
    if (!tag.isActive) {
      return createErrorResponse('TAG_INACTIVE', 'Cannot assign archived/inactive tag');
    }

    // Check if assignment already exists and is active
    const existingAssignments = readGlobalSheet('ProjectTags');
    const existingAssignment = existingAssignments.find(pt => 
      pt.projectId === projectId && pt.tagId === tagId && pt.isActive
    );

    if (existingAssignment) {
      return createErrorResponse('ASSIGNMENT_EXISTS', 'Tag is already assigned to this project');
    }

    // Create assignment
    const assignmentId = generateIdWithType('assignment');
    const timestamp = getCurrentTimestamp();

    const assignment = {
      assignmentId: assignmentId,
      projectId: projectId,
      tagId: tagId,
      assignedBy: sessionResult.userEmail,
      assignedTime: timestamp,
      isActive: true
    };

    addRowToGlobalSheet('ProjectTags', assignment);

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'tag_assigned_to_project',
      'project',
      projectId,
      {
        tagId: tagId,
        tagName: tag.tagName
      }
    );

    return createSuccessResponseWithSession(sessionId, assignment, 'Tag assigned to project successfully');

  } catch (error) {
    logErr('Assign tag to project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to assign tag to project');
  }
}

/**
 * Assign tag to user
 */
function assignTagToUser(sessionId, userEmail, tagId, skipSessionValidation = false) {
  try {
    let sessionResult = null;
    let assignerEmail = 'system';
    
    if (!skipSessionValidation) {
      // Validate session and admin permissions for normal operations
      sessionResult = validateSession(sessionId);
      if (!sessionResult) {
        return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
      }

      if (!isSystemAdmin(sessionResult.userEmail)) {
        return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
      }
      
      assignerEmail = sessionResult.userEmail;
    }

    // Validate inputs
    if (!validateEmail(userEmail) || !validateTagId(tagId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid user email or tag ID format');
    }

    // Check if user and tag exist
    const users = readGlobalSheet('Users');
    if (!users.find(u => u.userEmail === userEmail)) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }

    const tags = readGlobalSheet('Tags');
    const tag = tags.find(t => t.tagId === tagId);
    if (!tag) {
      return createErrorResponse('TAG_NOT_FOUND', 'Tag not found');
    }

    // IMPORTANT: Check if tag is active (not archived)
    if (!tag.isActive) {
      return createErrorResponse('TAG_INACTIVE', 'Cannot assign archived/inactive tag');
    }

    // Check if assignment already exists and is active
    const existingAssignments = readGlobalSheet('UserTags');
    const existingAssignment = existingAssignments.find(ut => 
      ut.userEmail === userEmail && ut.tagId === tagId && ut.isActive
    );

    if (existingAssignment) {
      return createErrorResponse('ASSIGNMENT_EXISTS', 'Tag is already assigned to this user');
    }

    // Create assignment
    const assignmentId = generateIdWithType('assignment');
    const timestamp = getCurrentTimestamp();

    const assignment = {
      assignmentId: assignmentId,
      userEmail: userEmail,
      tagId: tagId,
      assignedBy: assignerEmail,
      assignedTime: timestamp,
      isActive: true
    };

    addRowToGlobalSheet('UserTags', assignment);

    // Log operation
    logOperation(
      assignerEmail,
      'tag_assigned_to_user',
      'user',
      userEmail,
      {
        tagId: tagId,
        tagName: tag.tagName
      }
    );

    return createSuccessResponseWithSession(sessionId, assignment, 'Tag assigned to user successfully');

  } catch (error) {
    logErr('Assign tag to user error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to assign tag to user');
  }
}

/**
 * Remove tag from project
 */
function removeTagFromProject(sessionId, projectId, tagId) {
  try {
    // Validate session and permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!canManageProject(sessionResult.userEmail, projectId)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to manage this project');
    }

    // Find and deactivate assignment
    const assignments = readGlobalSheet('ProjectTags');
    const assignment = assignments.find(pt => 
      pt.projectId === projectId && pt.tagId === tagId && pt.isActive
    );

    if (!assignment) {
      return createErrorResponse('ASSIGNMENT_NOT_FOUND', 'Tag assignment not found');
    }

    // Deactivate assignment
    updateGlobalSheetRow('ProjectTags', 'assignmentId', assignment.assignmentId, {
      isActive: false
    });

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'tag_removed_from_project',
      'project',
      projectId,
      {
        tagId: tagId
      }
    );

    return createSuccessResponseWithSession(sessionId, null, 'Tag removed from project successfully');

  } catch (error) {
    logErr('Remove tag from project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove tag from project');
  }
}

/**
 * Remove tag from user
 */
function removeTagFromUser(sessionId, userEmail, tagId, skipSessionValidation = false) {
  try {
    let sessionResult = null;
    let removerEmail = 'system';
    
    if (!skipSessionValidation) {
      // Validate session and admin permissions for normal operations
      sessionResult = validateSession(sessionId);
      if (!sessionResult) {
        return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
      }

      if (!isSystemAdmin(sessionResult.userEmail)) {
        return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
      }
      
      removerEmail = sessionResult.userEmail;
    }

    // Find and deactivate assignment
    const assignments = readGlobalSheet('UserTags');
    const assignment = assignments.find(ut => 
      ut.userEmail === userEmail && ut.tagId === tagId && ut.isActive
    );

    if (!assignment) {
      return createErrorResponse('ASSIGNMENT_NOT_FOUND', 'Tag assignment not found');
    }

    // Deactivate assignment
    updateGlobalSheetRow('UserTags', 'assignmentId', assignment.assignmentId, {
      isActive: false
    });

    // Log operation
    logOperation(
      removerEmail,
      'tag_removed_from_user',
      'user',
      userEmail,
      {
        tagId: tagId
      }
    );

    return createSuccessResponseWithSession(sessionId, null, 'Tag removed from user successfully');

  } catch (error) {
    logErr('Remove tag from user error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove tag from user');
  }
}

/**
 * Get tags for a specific project
 */
function getProjectTags(sessionId, projectId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Get project tag assignments
    const assignments = readGlobalSheet('ProjectTags');
    const projectAssignments = assignments.filter(pt => 
      pt.projectId === projectId && pt.isActive
    );

    // Get tag details
    const allTags = readGlobalSheet('Tags');
    const projectTags = projectAssignments.map(assignment => {
      const tag = allTags.find(t => t.tagId === assignment.tagId);
      return {
        ...tag,
        assignmentId: assignment.assignmentId,
        assignedBy: assignment.assignedBy,
        assignedTime: assignment.assignedTime
      };
    }).filter(tag => tag && tag.isActive);

    return createSuccessResponseWithSession(sessionId, projectTags);

  } catch (error) {
    logErr('Get project tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project tags');
  }
}

/**
 * Get tags for a specific user
 */
function getUserTags(sessionId, userEmail) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Get user tag assignments
    const assignments = readGlobalSheet('UserTags');
    const userAssignments = assignments.filter(ut => 
      ut.userEmail === userEmail && ut.isActive
    );

    // Get tag details
    const allTags = readGlobalSheet('Tags');
    const userTags = userAssignments.map(assignment => {
      const tag = allTags.find(t => t.tagId === assignment.tagId);
      return {
        ...tag,
        assignmentId: assignment.assignmentId,
        assignedBy: assignment.assignedBy,
        assignedTime: assignment.assignedTime
      };
    }).filter(tag => tag && tag.isActive);

    return createSuccessResponseWithSession(sessionId, userTags);

  } catch (error) {
    logErr('Get user tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user tags');
  }
}

/**
 * Batch update user tags - handle multiple tag operations in one request
 */
function batchUpdateUserTags(sessionId, userEmail, tagOperations) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Validate user email
    if (!validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid user email format');
    }

    // Validate tag operations
    if (!Array.isArray(tagOperations) || tagOperations.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'Tag operations must be a non-empty array');
    }

    // Check if user exists
    const users = readGlobalSheet('Users');
    if (!users.find(u => u.userEmail === userEmail)) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }

    // Load all necessary data once
    const allTags = readGlobalSheet('Tags');
    const existingAssignments = readGlobalSheet('UserTags');
    
    const results = [];
    const timestamp = getCurrentTimestamp();
    const newAssignments = [];
    const deactivateAssignments = [];

    // Process each operation
    for (const operation of tagOperations) {
      try {
        const { tagId, action } = operation;

        // Validate operation
        if (!tagId || !action || !['add', 'remove'].includes(action)) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Invalid operation format. Must have tagId and action (add/remove)'
          });
          continue;
        }

        if (!validateTagId(tagId)) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Invalid tag ID format'
          });
          continue;
        }

        // Check if tag exists and is active
        const tag = allTags.find(t => t.tagId === tagId);
        if (!tag) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Tag not found'
          });
          continue;
        }

        // IMPORTANT: Check if tag is active (not archived)
        if (!tag.isActive) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Cannot assign archived/inactive tag'
          });
          continue;
        }

        // Find existing assignment
        const existingAssignment = existingAssignments.find(ut => 
          ut.userEmail === userEmail && ut.tagId === tagId && ut.isActive
        );

        if (action === 'add') {
          // Check if already assigned
          if (existingAssignment) {
            results.push({
              tagId: tagId,
              action: action,
              success: false,
              error: 'Tag is already assigned to this user'
            });
            continue;
          }

          // Prepare new assignment
          const assignmentId = generateIdWithType('assignment');
          const assignment = {
            assignmentId: assignmentId,
            userEmail: userEmail,
            tagId: tagId,
            assignedBy: sessionResult.userEmail,
            assignedTime: timestamp,
            isActive: true
          };

          newAssignments.push(assignment);
          results.push({
            tagId: tagId,
            action: action,
            success: true,
            data: assignment
          });

        } else if (action === 'remove') {
          // Check if assignment exists
          if (!existingAssignment) {
            results.push({
              tagId: tagId,
              action: action,
              success: false,
              error: 'Tag assignment not found'
            });
            continue;
          }

          // Prepare deactivation
          deactivateAssignments.push(existingAssignment.assignmentId);
          results.push({
            tagId: tagId,
            action: action,
            success: true,
            data: { assignmentId: existingAssignment.assignmentId }
          });
        }

      } catch (error) {
        results.push({
          tagId: operation.tagId,
          action: operation.action,
          success: false,
          error: error.message
        });
      }
    }

    // Execute batch operations
    try {
      // Add new assignments
      for (const assignment of newAssignments) {
        addRowToGlobalSheet('UserTags', assignment);
      }

      // Deactivate removed assignments
      for (const assignmentId of deactivateAssignments) {
        updateGlobalSheetRow('UserTags', 'assignmentId', assignmentId, {
          isActive: false
        });
      }

      // Log batch operation
      logOperation(
        sessionResult.userEmail,
        'batch_update_user_tags',
        'user',
        userEmail,
        {
          totalOperations: tagOperations.length,
          successfulOperations: results.filter(r => r.success).length,
          failedOperations: results.filter(r => !r.success).length
        }
      );

    } catch (error) {
      logErr('Batch update execution error', error);
      return createErrorResponse('SYSTEM_ERROR', 'Failed to execute batch tag operations');
    }

    return createSuccessResponseWithSession(sessionId, {
      userEmail: userEmail,
      results: results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    }, 'Batch tag operations completed');

  } catch (error) {
    logErr('Batch update user tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to batch update user tags');
  }
}

/**
 * Batch update project tags - handle multiple tag operations for projects
 */
function batchUpdateProjectTags(sessionId, projectId, tagOperations) {
  try {
    // Validate session and permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!canManageProject(sessionResult.userEmail, projectId)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to manage this project');
    }

    // Validate project ID
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }

    // Validate tag operations
    if (!Array.isArray(tagOperations) || tagOperations.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'Tag operations must be a non-empty array');
    }

    // Check if project exists
    const projects = readGlobalSheet('Projects');
    if (!projects.find(p => p.projectId === projectId)) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Load all necessary data once
    const allTags = readGlobalSheet('Tags');
    const existingAssignments = readGlobalSheet('ProjectTags');
    
    const results = [];
    const timestamp = getCurrentTimestamp();
    const newAssignments = [];
    const deactivateAssignments = [];

    // Process each operation (similar logic to user tags)
    for (const operation of tagOperations) {
      try {
        const { tagId, action } = operation;

        // Validate operation
        if (!tagId || !action || !['add', 'remove'].includes(action)) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Invalid operation format. Must have tagId and action (add/remove)'
          });
          continue;
        }

        if (!validateTagId(tagId)) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: 'Invalid tag ID format'
          });
          continue;
        }

        // Check if tag exists and is active
        const tag = allTags.find(t => t.tagId === tagId);
        if (!tag || !tag.isActive) {
          results.push({
            tagId: tagId,
            action: action,
            success: false,
            error: !tag ? 'Tag not found' : 'Cannot assign archived/inactive tag'
          });
          continue;
        }

        // Find existing assignment
        const existingAssignment = existingAssignments.find(pt => 
          pt.projectId === projectId && pt.tagId === tagId && pt.isActive
        );

        if (action === 'add') {
          if (existingAssignment) {
            results.push({
              tagId: tagId,
              action: action,
              success: false,
              error: 'Tag is already assigned to this project'
            });
            continue;
          }

          const assignmentId = generateIdWithType('assignment');
          const assignment = {
            assignmentId: assignmentId,
            projectId: projectId,
            tagId: tagId,
            assignedBy: sessionResult.userEmail,
            assignedTime: timestamp,
            isActive: true
          };

          newAssignments.push(assignment);
          results.push({
            tagId: tagId,
            action: action,
            success: true,
            data: assignment
          });

        } else if (action === 'remove') {
          if (!existingAssignment) {
            results.push({
              tagId: tagId,
              action: action,
              success: false,
              error: 'Tag assignment not found'
            });
            continue;
          }

          deactivateAssignments.push(existingAssignment.assignmentId);
          results.push({
            tagId: tagId,
            action: action,
            success: true,
            data: { assignmentId: existingAssignment.assignmentId }
          });
        }

      } catch (error) {
        results.push({
          tagId: operation.tagId,
          action: operation.action,
          success: false,
          error: error.message
        });
      }
    }

    // Execute batch operations
    try {
      // Add new assignments
      for (const assignment of newAssignments) {
        addRowToGlobalSheet('ProjectTags', assignment);
      }

      // Deactivate removed assignments
      for (const assignmentId of deactivateAssignments) {
        updateGlobalSheetRow('ProjectTags', 'assignmentId', assignmentId, {
          isActive: false
        });
      }

      // Log batch operation
      logOperation(
        sessionResult.userEmail,
        'batch_update_project_tags',
        'project',
        projectId,
        {
          totalOperations: tagOperations.length,
          successfulOperations: results.filter(r => r.success).length,
          failedOperations: results.filter(r => !r.success).length
        }
      );

    } catch (error) {
      logErr('Batch project update execution error', error);
      return createErrorResponse('SYSTEM_ERROR', 'Failed to execute batch project tag operations');
    }

    return createSuccessResponseWithSession(sessionId, {
      projectId: projectId,
      results: results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    }, 'Batch project tag operations completed');

  } catch (error) {
    logErr('Batch update project tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to batch update project tags');
  }
}

/**
 * Helper function to deactivate all assignments for a tag
 */
function deactivateTagAssignments(tagId) {
  try {
    // Deactivate project tag assignments
    const projectAssignments = readGlobalSheet('ProjectTags');
    projectAssignments
      .filter(pt => pt.tagId === tagId && pt.isActive)
      .forEach(assignment => {
        updateGlobalSheetRow('ProjectTags', 'assignmentId', assignment.assignmentId, {
          isActive: false
        });
      });

    // Deactivate user tag assignments
    const userAssignments = readGlobalSheet('UserTags');
    userAssignments
      .filter(ut => ut.tagId === tagId && ut.isActive)
      .forEach(assignment => {
        updateGlobalSheetRow('UserTags', 'assignmentId', assignment.assignmentId, {
          isActive: false
        });
      });

  } catch (error) {
    logErr('Deactivate tag assignments error', error);
  }
}

/**
 * Validate tag ID format
 */
function validateTagId(tagId) {
  return tagId && typeof tagId === 'string' && tagId.startsWith('tag_');
}

/**
 * Check if user can manage a specific project
 */
function canManageProject(userEmail, projectId) {
  try {
    // Check if user is system admin
    if (isSystemAdmin(userEmail)) {
      return true;
    }

    // Check if user is project creator
    const projects = readGlobalSheet('Projects');
    const project = projects.find(p => p.projectId === projectId);
    if (project && project.createdBy === userEmail) {
      return true;
    }

    // Check if user has management permissions in the project
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(userEmail, projectData.projectgroups, projectData.usergroups);
    return permissions.includes('manage');

  } catch (error) {
    logErr('Can manage project check error', error);
    return false;
  }
}

/**
 * Get all user tag assignments (admin only)
 */
function getAllUserTagAssignments(sessionId) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Get all user tag assignments
    const assignments = readGlobalSheet('UserTags');
    
    return createSuccessResponseWithSession(sessionId, assignments);

  } catch (error) {
    logErr('Get all user tag assignments error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user tag assignments');
  }
}

/**
 * Get all project tag assignments (admin only)
 */
function getAllProjectTagAssignments(sessionId) {
  try {
    // Validate session and admin permissions
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }

    // Get all project tag assignments
    const assignments = readGlobalSheet('ProjectTags');
    
    return createSuccessResponseWithSession(sessionId, assignments);

  } catch (error) {
    logErr('Get all project tag assignments error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project tag assignments');
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createTag,
    getTags,
    updateTag,
    deleteTag,
    assignTagToProject,
    assignTagToUser,
    removeTagFromProject,
    removeTagFromUser,
    getProjectTags,
    getUserTags,
    batchUpdateUserTags,
    batchUpdateProjectTags,
    validateTagId,
    getAllUserTagAssignments,
    getAllProjectTagAssignments
  };
}