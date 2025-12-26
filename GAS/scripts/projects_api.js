/**
 * @fileoverview Project management API endpoints
 * @module ProjectsAPI
 */

// Import shared utilities
// Note: In GAS environment, all scripts share the same global scope
// These functions are available from unified_permissions.js

/**
 * Create a new project
 */
function createProject(sessionId, projectData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user has permission to create projects (must be Global PM)
    if (!isGlobalPM(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only Global PM can create projects');
    }
    
    // Validate required fields
    const requiredFields = ['projectName', 'description'];
    const missingFields = validateRequiredFields(projectData, requiredFields);
    if (missingFields.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Missing required fields: ' + missingFields.join(', '));
    }
    
    // Sanitize input
    projectData.projectName = sanitizeString(projectData.projectName, 100);
    projectData.description = sanitizeString(projectData.description, 1000);
    
    // Validate and set score range
    const scoreRangeMin = projectData.scoreRangeMin !== undefined ? Number(projectData.scoreRangeMin) : 65;
    const scoreRangeMax = projectData.scoreRangeMax !== undefined ? Number(projectData.scoreRangeMax) : 95;
    
    if (scoreRangeMin < 0 || scoreRangeMin > 100 || scoreRangeMax < 0 || scoreRangeMax > 100) {
      return createErrorResponse('INVALID_INPUT', 'Score range must be between 0 and 100');
    }
    
    if (scoreRangeMin >= scoreRangeMax) {
      return createErrorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
    }
    
    // Validate project name length
    const maxProjectNameLength = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_PROJECT_NAME_LENGTH') || '100');
    if (projectData.projectName.length > maxProjectNameLength) {
      return createErrorResponse('INVALID_INPUT', `Project name too long (max ${maxProjectNameLength} characters)`);
    }
    
    // Check concurrent projects limit
    const globalData = readGlobalData();
    const userActiveProjects = globalData.projects.filter(p => 
      p.createdBy === sessionResult.userEmail && p.status === 'active'
    );
    const maxConcurrentProjects = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_CONCURRENT_PROJECTS') || '5');
    
    if (userActiveProjects.length >= maxConcurrentProjects) {
      return createErrorResponse('LIMIT_EXCEEDED', `Maximum concurrent projects limit (${maxConcurrentProjects}) reached`);
    }
    
    // Generate project ID
    const projectId = generateIdWithType('project');
    const timestamp = getCurrentTimestamp();
    
    // Create project workbook
    const workbookResult = createProjectWorkbook(projectId, projectData.projectName);
    
    // Create project record in global database
    const projectRecord = {
      projectId: projectId,
      projectName: projectData.projectName,
      description: projectData.description,
      scoreRangeMin: scoreRangeMin,
      scoreRangeMax: scoreRangeMax,
      totalStages: 0,
      currentStage: 0,
      status: 'active',
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      lastModified: timestamp,
      workbookId: workbookResult.workbookId
    };
    
    // Add to global Projects sheet
    addRowToSheet(null, 'Projects', projectRecord);

    // Log project creation event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'project_created',
      'project',
      projectId,
      { projectName: projectData.projectName }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      projectId: projectId,
      projectName: projectData.projectName,
      description: projectData.description,
      scoreRangeMin: scoreRangeMin,
      scoreRangeMax: scoreRangeMax,
      status: 'active',
      createdTime: timestamp,
      workbookId: workbookResult.workbookId
    }, 'Project created successfully');
    
  } catch (error) {
    logErr('Create project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create project');
  }
}

/**
 * Get project details
 */
function getProject(sessionId, projectId) {
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
    
    // Get project from global data
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }
    
    // Get project data
    const projectData = readProjectData(projectId);
    const projectInfo = projectData.projectinfo[0]; // Should be only one record
    
    // Check if user is system admin or has global permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.includes('system_admin') || globalPermissions.includes('manage_users');
    
    // Check if user is an active member of this project
    const isProjectMember = projectData.usergroups.some(ug => 
      ug.userEmail === sessionResult.userEmail && ug.isActive
    );
    
    // Get user permissions
    const permissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    // Debug logging for permission checking
    logInfo('Project access check', {
      projectId: projectId,
      userEmail: sessionResult.userEmail,
      isAdmin: isAdmin,
      hasGlobalAccess: hasGlobalAccess,
      isProjectMember: isProjectMember,
      permissions: permissions,
      isCreator: project.createdBy === sessionResult.userEmail,
      userGroupsCount: projectData.usergroups.filter(ug => ug.userEmail === sessionResult.userEmail).length
    });
    
    // Check if user has access to this project
    // Allow access if: admin, has global access, is project creator, is active project member, or has view permissions
    const isCreator = project.createdBy === sessionResult.userEmail;
    const hasViewPermission = permissions.includes('view');
    
    if (!isAdmin && !hasGlobalAccess && !isCreator && !isProjectMember && !hasViewPermission) {
      return createErrorResponse('ACCESS_DENIED', `User ${sessionResult.userEmail} has no access to project ${projectId}. Admin: ${isAdmin}, Global: ${hasGlobalAccess}, Creator: ${isCreator}, Member: ${isProjectMember}, View: ${hasViewPermission}`);
    }
    
    return createSuccessResponseWithSession(sessionId, {
      projectId: project.projectId,
      projectName: project.projectName,
      description: projectInfo ? projectInfo.description : project.description,
      totalStages: project.totalStages,
      currentStage: project.currentStage,
      status: project.status,
      createdBy: project.createdBy,
      createdTime: project.createdTime,
      lastModified: project.lastModified,
      userPermissions: permissions,
      groupCount: projectData.groups.length,
      memberCount: projectData.usergroups.filter(ug => ug.isActive).length
    });
    
  } catch (error) {
    logErr('Get project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project');
  }
}

/**
 * Update project details
 */
function updateProject(sessionId, projectId, updates) {
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
    
    // Get project
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    
    // Check if user is system admin or has global permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalAccess = globalPermissions.includes('system_admin') || globalPermissions.includes('manage_users');
    
    if (!isAdmin && !hasGlobalAccess && project.createdBy !== sessionResult.userEmail) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to update this project');
      }
    }
    
    // Validate and sanitize updates
    const allowedFields = ['projectName', 'description', 'status', 'scoreRangeMin', 'scoreRangeMax'];
    const projectUpdates = {};
    const projectInfoUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        let value = updates[field];
        
        if (field === 'projectName' || field === 'description') {
          value = sanitizeString(value, field === 'projectName' ? 100 : 1000);
          projectUpdates[field] = value;
          projectInfoUpdates[field] = value;
        } else if (field === 'status') {
          if (['active', 'completed', 'archived'].includes(value)) {
            projectUpdates[field] = value;
            projectInfoUpdates[field] = value;
          }
        } else if (field === 'scoreRangeMin' || field === 'scoreRangeMax') {
          value = Number(value);
          if (!isNaN(value) && value >= 0 && value <= 100) {
            projectUpdates[field] = value;
            projectInfoUpdates[field] = value;
          }
        }
      }
    });
    
    // Validate score range if both are being updated
    if (updates.hasOwnProperty('scoreRangeMin') && updates.hasOwnProperty('scoreRangeMax')) {
      if (Number(updates.scoreRangeMin) >= Number(updates.scoreRangeMax)) {
        return createErrorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
      }
    } else if (updates.hasOwnProperty('scoreRangeMin') && project.scoreRangeMax !== undefined) {
      if (Number(updates.scoreRangeMin) >= project.scoreRangeMax) {
        return createErrorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
      }
    } else if (updates.hasOwnProperty('scoreRangeMax') && project.scoreRangeMin !== undefined) {
      if (project.scoreRangeMin >= Number(updates.scoreRangeMax)) {
        return createErrorResponse('INVALID_INPUT', 'Minimum score must be less than maximum score');
      }
    }
    
    if (Object.keys(projectUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Update timestamps
    projectUpdates.lastModified = getCurrentTimestamp();
    projectInfoUpdates.lastModified = getCurrentTimestamp();
    
    // Update global Projects sheet
    updateSheetRow(null, 'Projects', 'projectId', projectId, projectUpdates);
    
    // Update project ProjectInfo sheet
    if (projectData.projectinfo.length > 0) {
      updateSheetRow(projectId, 'ProjectInfo', 'projectId', projectId, projectInfoUpdates);
    }

    // Log project update event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'project_updated',
      'project',
      projectId,
      { updates: Object.keys(projectUpdates) }
    );
    
    // Send notifications to all project participants about project changes
    sendProjectUpdatedNotifications(projectId, Object.keys(projectUpdates), sessionResult.userEmail);
    
    return createSuccessResponseWithSession(sessionId, null, 'Project updated successfully');
    
  } catch (error) {
    logErr('Update project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update project');
  }
}

/**
 * List projects for user
 * @param {string} sessionId - User session ID
 * @param {Object} filters - Filter options
 * @param {string} filters.status - Filter by project status
 * @param {string} filters.createdBy - Filter by creator ('me' for current user)
 * @param {string} filters.tagId - Filter by tag ID
 * @param {boolean} filters.includeStages - Include detailed stage data for each project
 * @returns {Object} Response with list of projects (with optional stage data)
 */
function listUserProjects(sessionId, filters = {}) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Admin users see all projects without tag scope filtering
    if (isSystemAdmin(sessionResult.userEmail)) {
      return listAllProjectsForAdmin(sessionResult, globalData, filters);
    }
    
    // Phase 1: Tag scope filtering (fast, no shard DB access)
    const userTags = getUserTagIds(sessionResult.userEmail);
    const globalDb = getGlobalWorkbook();
    const projectTags = readFullSheet(globalDb, 'ProjectTags') || [];
    
    // Get projects that pass tag scope filtering
    const tagScopeProjects = [];
    
    for (const project of globalData.projects) {
      // Skip deleted projects (but keep archived projects visible)
      if (project.status === 'deleted') {
        continue;
      }

      // Check tag scope - project must have exactly the same tag set as user
      const projectTagIds = projectTags
        .filter(pt => pt.projectId === project.projectId && pt.isActive)
        .map(pt => pt.tagId);
      
      const hasTagScope = arraysEqual(userTags.sort(), projectTagIds.sort());
      
      if (hasTagScope) {
        tagScopeProjects.push(project);
      }
    }
    
    // Phase 2: Member access verification (slower, requires shard DB access)
    const userProjects = [];
    
    for (const project of tagScopeProjects) {
      let hasAccess = false;
      let userGroupInfo = [];
      let isLeader = false;
      
      // Check if user is creator (no shard DB access needed)
      if (project.createdBy === sessionResult.userEmail) {
        hasAccess = true;
      } else {
        // Check if user is member of any group in the project (requires shard DB access)
        try {
          const projectData = readProjectData(project.projectId);
          const userGroups = projectData.usergroups.filter(ug => 
            ug.userEmail === sessionResult.userEmail && ug.isActive
          );
          
          if (userGroups.length > 0) {
            hasAccess = true;
            
            // Build user group info for this project
            for (const ug of userGroups) {
              const group = projectData.groups.find(g => g.groupId === ug.groupId && g.status === 'active');
              if (group) {
                userGroupInfo.push({
                  groupId: group.groupId,
                  groupName: group.groupName,
                  role: ug.role,
                  allowChange: group.allowChange !== false
                });
                
                if (ug.role === 'leader') {
                  isLeader = true;
                }
              }
            }
          }
        } catch (error) {
          // Skip project if can't access project data
          logWrn('Cannot access project data for member verification', { 
            projectId: project.projectId, 
            userEmail: sessionResult.userEmail,
            error: error.message 
          });
          continue;
        }
      }
      
      // Only include projects where user has verified access
      if (hasAccess) {
        // Get project's tags for display
        const tags = getProjectTagsForDisplay(project.projectId);
        
        // Optionally include stage data if requested
        let stageData = null;
        if (filters.includeStages) {
          try {
            const projectStageData = readProjectData(project.projectId);
            stageData = projectStageData.stages
              .filter(stage => stage.status !== 'deleted')
              .map(stage => ({
                stageId: stage.stageId,
                stageName: stage.stageName,
                stageOrder: stage.stageOrder,
                startDate: stage.startDate,
                endDate: stage.endDate,
                consensusDeadline: stage.consensusDeadline,
                status: stage.status,
                description: stage.description,
                reportRewardPool: stage.reportRewardPool || 0,
                commentRewardPool: stage.commentRewardPool || 0
              }))
              .sort((a, b) => a.stageOrder - b.stageOrder);
          } catch (error) {
            // If we can't load stage data, just continue without it
            logWrn('Failed to load stage data for project', { projectId: project.projectId, error: error.message });
          }
        }

        userProjects.push({
          projectId: project.projectId,
          projectName: project.projectName,
          description: project.description,
          status: project.status,
          totalStages: project.totalStages,
          currentStage: project.currentStage,
          createdBy: project.createdBy,
          createdTime: project.createdTime,
          lastModified: project.lastModified,
          isCreator: project.createdBy === sessionResult.userEmail,
          isLeader: isLeader,
          userGroups: userGroupInfo,
          tags: tags,
          stages: stageData // Include stages if requested
        });
      }
    }
    
    // Apply filters
    let filteredProjects = userProjects;
    
    if (filters.status) {
      filteredProjects = filteredProjects.filter(p => p.status === filters.status);
    }
    
    if (filters.createdBy && filters.createdBy === 'me') {
      filteredProjects = filteredProjects.filter(p => p.isCreator);
    }
    
    if (filters.tagId) {
      filteredProjects = filteredProjects.filter(p => 
        p.tags && p.tags.some(tag => tag.tagId === filters.tagId)
      );
    }
    
    // Sort by last modified (most recent first)
    filteredProjects.sort((a, b) => b.lastModified - a.lastModified);
    
    return createSuccessResponseWithSession(sessionId, filteredProjects);
    
  } catch (error) {
    logErr('List user projects error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to list projects');
  }
}

/**
 * Delete project (only by creator)
 */
function deleteProject(sessionId, projectId) {
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
    
    // Get project
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }
    
    // Only creator can delete project
    if (project.createdBy !== sessionResult.userEmail) {
      return createErrorResponse('ACCESS_DENIED', 'Only project creator can delete the project');
    }
    
    // Mark as archived instead of physical deletion for data integrity
    updateSheetRow(null, 'Projects', 'projectId', projectId, {
      status: 'archived',
      lastModified: getCurrentTimestamp()
    });
    
    // Update project info
    try {
      updateSheetRow(projectId, 'ProjectInfo', 'projectId', projectId, {
        status: 'archived',
        lastModified: getCurrentTimestamp()
      });
    } catch (error) {
      logWrn('Failed to update project info status', { error: error.message });
    }
    
    // Log project archive event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'project_archived',
      'project',
      projectId,
      { reason: 'deleted_by_creator' }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'Project archived successfully');
    
  } catch (error) {
    logErr('Delete project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete project');
  }
}

/**
 * Get project core data (project info + stages)
 * This is the primary data package that contains project structure
 */
function getProjectCore(sessionId, projectId) {
  try {
    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData } = accessResult;
    
    // Get project basic info from global data
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }
    
    // Re-read project data with auto-synced stage statuses
    const syncedProjectData = readProjectDataWithSyncedStages(projectId);
    const userEmails = [...new Set(syncedProjectData.usergroups.map(ug => ug.userEmail))];
    const users = globalData.users.filter(u => userEmails.includes(u.userEmail))
      .map(u => ({
        userId: u.userId,
        userEmail: u.userEmail,
        username: u.username,  // 帳號名稱
        displayName: u.displayName
      }));
    
    return createSuccessResponseWithSession(sessionId, {
      project: project,
      groups: syncedProjectData.groups,
      userGroups: syncedProjectData.usergroups,
      projectGroups: syncedProjectData.projectgroups,
      stages: syncedProjectData.stages,
      users: users  // 包含username的用戶資料
    });
    
  } catch (error) {
    logErr('Get project core error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project core data');
  }
}

/**
 * Get project content data (submissions + comments for specific stage or all)
 * This is the secondary data package loaded on demand
 */
function getProjectContent(sessionId, projectId, stageId = null, contentType = 'all', excludeTeachers = false) {
  try {
    // Use unified project access validation
    const accessResult = validateProjectAccess(sessionId, projectId, 'view');
    if (!accessResult.valid) {
      return createErrorResponse(accessResult.errorCode, accessResult.error);
    }
    const { sessionResult, projectData: validatedProjectData } = accessResult;
    
    // Re-read project data with auto-synced stage statuses
    const projectData = readProjectDataWithSyncedStages(projectId);
    
    
    let submissions = projectData.submissions || [];
    let comments = projectData.comments || [];
    
    // Filter by stage if specified
    if (stageId) {
      submissions = submissions.filter(s => s.stageId === stageId);
      comments = comments.filter(c => c.stageId === stageId);
    }
    
    // Filter by content type
    const result = {};
    
    if (contentType === 'all' || contentType === 'submissions') {
      // 加入組別資訊和組員名稱，與 getStageSubmissions 保持一致
      const globalData = readGlobalData();
      
      // 獲取當前用戶所屬的組別 ID
      const currentUserGroupIds = projectData.usergroups
        .filter(ug => ug.userEmail === sessionResult.userEmail && ug.isActive)
        .map(ug => ug.groupId);
      
      result.submissions = submissions.map(submission => {
        const group = projectData.groups.find(g => g.groupId === submission.groupId);
        
        // 獲取組員資訊
        const groupMembers = projectData.usergroups
          .filter(ug => ug.groupId === submission.groupId && ug.isActive)
          .map(ug => {
            const globalUser = globalData.users.find(u => u.userEmail === ug.userEmail);
            return globalUser ? globalUser.displayName || globalUser.username : ug.userEmail;
          });
        
        // 排名數據將通過獨立的 API 載入，這裡先設為預設值
        const voteRank = '-';
        const teacherRank = '-';
        
        return {
          ...submission,
          groupName: group ? group.groupName : 'Unknown Group',
          memberNames: groupMembers,
          voteRank: voteRank,
          teacherRank: teacherRank
        };
      });
    }
    
    if (contentType === 'all' || contentType === 'comments') {
      // Filter out teacher comments if requested
      if (excludeTeachers) {
        const teacherEmails = getTeacherPrivilegeUsers();
        comments = comments.filter(c => !teacherEmails.includes(c.authorEmail));
      }
      
      // Add teacher comment flag for all comments
      const allTeacherEmails = getTeacherPrivilegeUsers();
      result.comments = comments.map(comment => ({
        ...comment,
        isTeacherComment: allTeacherEmails.includes(comment.authorEmail)
      }));
    }
    
    // Add metadata
    result.metadata = {
      projectId: projectId,
      stageId: stageId,
      contentType: contentType,
      totalSubmissions: submissions.length,
      totalComments: comments.length,
      loadedAt: getCurrentTimestamp()
    };
    
    return createSuccessResponseWithSession(sessionId, result);
    
  } catch (error) {
    logErr('Get project content error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get project content data');
  }
}

/**
 * DEPRECATED: Get complete project data (for admin/detailed view)
 * Use getProjectCore() and getProjectContent() instead for better performance
 */
function getCompleteProjectData(sessionId, projectId) {
  try {
    // This is now a convenience function that combines both calls
    const coreResult = getProjectCore(sessionId, projectId);
    if (!coreResult.success) {
      return coreResult;
    }
    
    const contentResult = getProjectContent(sessionId, projectId);
    if (!contentResult.success) {
      // Still return core data even if content fails
      logWrn('Failed to load project content, returning core data only', {});
      return coreResult;
    }
    
    // Combine results for backward compatibility
    return createSuccessResponseWithSession(sessionId, {
      ...coreResult.data,
      ...contentResult.data
    });
    
  } catch (error) {
    logErr('Get complete project data error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get complete project data');
  }
}

/**
 * Export project data
 */
function exportProject(sessionId, projectId, format = 'json') {
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
    
    // Get project
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    
    if (!project) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    if (!permissions.includes('manage') && project.createdBy !== sessionResult.userEmail) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to export this project');
    }
    
    // Get complete project data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportedBy: sessionResult.userEmail,
      version: '1.0',
      projectId: projectId,
      project: project,
      data: projectData
    };
    
    if (format === 'json') {
      return createSuccessResponseWithSession(sessionId, {
        format: 'json',
        data: exportData
      });
    }
    
    // Other formats could be added here (CSV, etc.)
    return createErrorResponse('INVALID_INPUT', 'Unsupported export format');
    
  } catch (error) {
    logErr('Export project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to export project');
  }
}

/**
 * Helper function to get user's tag IDs for scope filtering
 */
function getUserTagIds(userEmail) {
  try {
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    return userTags
      .filter(ut => ut.userEmail === userEmail && ut.isActive)
      .map(ut => ut.tagId);
  } catch (error) {
    logWrn('Failed to get user tags', { error: error.message });
    return [];
  }
}

/**
 * Helper function to get project tags for display
 */
function getProjectTagsForDisplay(projectId) {
  try {
    const globalDb = getGlobalWorkbook();
    const projectTags = readFullSheet(globalDb, 'ProjectTags') || [];
    const tags = readFullSheet(globalDb, 'Tags') || [];
    
    return projectTags
      .filter(pt => pt.projectId === projectId && pt.isActive)
      .map(pt => {
        const tag = tags.find(t => t.tagId === pt.tagId && t.isActive);
        return tag ? {
          tagId: tag.tagId,
          tagName: tag.tagName,
          tagColor: tag.tagColor,
        } : null;
      })
      .filter(tag => tag !== null);
  } catch (error) {
    logWrn('Failed to get project tags', { error: error.message });
    return [];
  }
}

/**
 * List all projects for admin users (bypasses tag scope filtering)
 */
function listAllProjectsForAdmin(sessionResult, globalData, filters = {}) {
  try {
    const userProjects = [];
    
    for (const project of globalData.projects) {
      // Skip deleted projects (but keep archived projects visible for admin)
      if (project.status === 'deleted') {
        continue;
      }

      // Get project's tags for display
      const tags = getProjectTagsForDisplay(project.projectId);
      
      // For admin users, we don't need to check member access, but we can still show group info if available
      let isLeader = false;
      let userGroupInfo = [];
      
      try {
        const projectData = readProjectData(project.projectId);
        const userGroups = projectData.usergroups.filter(ug => 
          ug.userEmail === sessionResult.userEmail && ug.isActive
        );
        
        for (const ug of userGroups) {
          const group = projectData.groups.find(g => g.groupId === ug.groupId && g.status === 'active');
          if (group) {
            userGroupInfo.push({
              groupId: group.groupId,
              groupName: group.groupName,
              role: ug.role,
              allowChange: group.allowChange !== false
            });
            
            if (ug.role === 'leader') {
              isLeader = true;
            }
          }
        }
      } catch (error) {
        // Continue without group info if error (admin can still see the project)
        logWrn('Cannot load group info for admin project view', { 
          projectId: project.projectId, 
          error: error.message 
        });
      }
      
      // Optionally include stage data if requested
      let stageData = null;
      if (filters.includeStages) {
        try {
          const projectStageData = readProjectData(project.projectId);
          stageData = projectStageData.stages
            .filter(stage => stage.status !== 'deleted')
            .map(stage => ({
              stageId: stage.stageId,
              stageName: stage.stageName,
              stageOrder: stage.stageOrder,
              startDate: stage.startDate,
              endDate: stage.endDate,
              consensusDeadline: stage.consensusDeadline,
              status: stage.status,
              description: stage.description,
              reportRewardPool: stage.reportRewardPool || 0,
              commentRewardPool: stage.commentRewardPool || 0
            }))
            .sort((a, b) => a.stageOrder - b.stageOrder);
        } catch (error) {
          logWrn('Failed to load stage data for admin project view', { 
            projectId: project.projectId, 
            error: error.message 
          });
        }
      }

      userProjects.push({
        projectId: project.projectId,
        projectName: project.projectName,
        description: project.description,
        status: project.status,
        totalStages: project.totalStages,
        currentStage: project.currentStage,
        createdBy: project.createdBy,
        createdTime: project.createdTime,
        lastModified: project.lastModified,
        isCreator: project.createdBy === sessionResult.userEmail,
        isLeader: isLeader,
        userGroups: userGroupInfo,
        tags: tags,
        stages: stageData
      });
    }
    
    // Apply filters
    let filteredProjects = userProjects;
    
    if (filters.status) {
      filteredProjects = filteredProjects.filter(p => p.status === filters.status);
    }
    
    if (filters.createdBy && filters.createdBy === 'me') {
      filteredProjects = filteredProjects.filter(p => p.isCreator);
    }
    
    if (filters.tagId) {
      filteredProjects = filteredProjects.filter(p => 
        p.tags && p.tags.some(tag => tag.tagId === filters.tagId)
      );
    }
    
    // Sort by last modified (most recent first)
    filteredProjects.sort((a, b) => b.lastModified - a.lastModified);
    
    return createSuccessResponseWithSession(sessionResult.sessionId, filteredProjects);
    
  } catch (error) {
    logErr('List all projects for admin error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to list projects for admin');
  }
}

/**
 * Get projects list with stage data included
 * This is a convenience function for the frontend when stage data is needed
 */
function getProjectListWithStages(sessionId, filters = {}) {
  // Force include stages in the filters
  const filtersWithStages = { ...filters, includeStages: true };
  return listUserProjects(sessionId, filtersWithStages);
}

/**
 * Wrapper functions for frontend compatibility
 */
function getProjectList(params) {
  return listUserProjects(params.sessionId, params.filters);
}

function getProjectDetails(params) {
  return getProject(params.sessionId, params.projectId);
}

/**
 * Send notifications when a project is updated
 */
function sendProjectUpdatedNotifications(projectId, updatedFields, updaterEmail) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get all project participants except the updater
    const participants = getAllProjectParticipants(projectId);
    
    // Generate appropriate notification content based on updated fields
    let content = `${projectName} 專案資訊已更新`;
    if (updatedFields.includes('projectName')) {
      content += '，專案名稱已變更';
    }
    if (updatedFields.includes('description')) {
      content += '，專案描述已更新';
    }
    if (updatedFields.includes('status')) {
      content += '，專案狀態已變更';
    }
    
    participants.forEach(participant => {
      // Skip the updater
      if (participant.userEmail === updaterEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'project_updated',
        title: '專案資訊更新',
        content: content,
        projectId: projectId,
        metadata: {
          projectName: projectName,
          updatedFields: updatedFields,
          updaterEmail: updaterEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send project updated notifications error', error);
  }
}

/**
 * Clone an existing project (copy project settings but not groups)
 */
function cloneProject(sessionId, projectId, newProjectName) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user has permission to create projects (must be Global PM)
    if (!isGlobalPM(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Only Global PM can clone projects');
    }
    
    // Validate inputs
    if (!validateProjectId(projectId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project ID format');
    }
    
    if (!newProjectName || !newProjectName.trim()) {
      return createErrorResponse('INVALID_INPUT', 'New project name is required');
    }
    
    // Get original project
    const globalData = readGlobalData();
    const originalProject = globalData.projects.find(p => p.projectId === projectId);
    if (!originalProject) {
      return createErrorResponse('PROJECT_NOT_FOUND', 'Original project not found');
    }
    
    // Sanitize new project name
    const sanitizedName = sanitizeString(newProjectName.trim(), 100);
    
    // Check project name length
    const maxProjectNameLength = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_PROJECT_NAME_LENGTH') || '100');
    if (sanitizedName.length > maxProjectNameLength) {
      return createErrorResponse('INVALID_INPUT', `Project name too long (max ${maxProjectNameLength} characters)`);
    }
    
    // Check concurrent projects limit
    const userActiveProjects = globalData.projects.filter(p => 
      p.createdBy === sessionResult.userEmail && p.status === 'active'
    );
    const maxConcurrentProjects = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_CONCURRENT_PROJECTS') || '5');
    
    if (userActiveProjects.length >= maxConcurrentProjects) {
      return createErrorResponse('LIMIT_EXCEEDED', `Maximum concurrent projects limit (${maxConcurrentProjects}) reached`);
    }
    
    // Generate new project ID
    const newProjectId = generateIdWithType('project');
    const timestamp = getCurrentTimestamp();
    
    // Create new project workbook
    const workbookResult = createProjectWorkbook(newProjectId, sanitizedName);
    
    // Create cloned project record
    const clonedProject = {
      projectId: newProjectId,
      projectName: sanitizedName,
      description: `${originalProject.description} (複製自: ${originalProject.projectName})`,
      scoreRangeMin: originalProject.scoreRangeMin,
      scoreRangeMax: originalProject.scoreRangeMax,
      totalStages: 0, // Start with no stages
      currentStage: 0,
      status: 'active',
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      lastModified: timestamp,
      workbookId: workbookResult.workbookId
    };
    
    // Add to global Projects sheet
    addRowToSheet(null, 'Projects', clonedProject);
    
    // Copy project tags if any
    const originalProjectTags = globalData.projectTags?.filter(pt => pt.projectId === projectId) || [];
    originalProjectTags.forEach(tag => {
      const newTagRecord = {
        assignmentId: generateIdWithType('assignment'),
        projectId: newProjectId,
        tagId: tag.tagId,
        assignedTime: timestamp
      };
      addRowToSheet(null, 'ProjectTags', newTagRecord);
    });
    
    // Copy all stages from the original project
    const originalProjectData = readProjectData(projectId);
    const originalStages = originalProjectData.stages?.filter(s => s.status !== 'deleted') || [];
    let stageCount = 0;
    
    // Clone each stage with adjusted dates
    const currentTime = new Date();
    originalStages.forEach((stage, index) => {
      const stageOffset = index * 7 * 24 * 60 * 60 * 1000; // 7 days apart for each stage
      const newStartDate = new Date(currentTime.getTime() + stageOffset + 7 * 24 * 60 * 60 * 1000); // Start 1 week from now
      const newEndDate = new Date(currentTime.getTime() + stageOffset + 14 * 24 * 60 * 60 * 1000); // End 2 weeks from now
      
      const newStageId = generateIdWithType('stage');
      const clonedStage = {
        stageId: newStageId,
        stageName: stage.stageName,
        description: stage.description || '',
        stageOrder: stage.stageOrder,
        startDate: newStartDate.getTime(),
        endDate: newEndDate.getTime(),
        reportRewardPool: stage.reportRewardPool || 0,
        commentRewardPool: stage.commentRewardPool || 0,
        status: 'pending',
        createdBy: sessionResult.userEmail,
        createdTime: timestamp,
        lastModified: timestamp
      };
      
      addRowToSheet(newProjectId, 'Stages', clonedStage);
      stageCount++;
      
      // Also copy stage configuration if exists
      const originalStageConfig = originalProjectData.stageconfigs?.find(sc => sc.stageId === stage.stageId);
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
        
        addRowToSheet(newProjectId, 'StageConfigs', clonedStageConfig);
      }
    });
    
    // Update the total stages count
    if (stageCount > 0) {
      updateSheetRow(null, 'Projects', 'projectId', newProjectId, {
        totalStages: stageCount
      });
    }
    
    // Log project clone event
    logOperation(
      newProjectId,
      sessionResult.userEmail,
      'project_cloned',
      'project',
      newProjectId,
      {
        originalProjectId: projectId,
        originalProjectName: originalProject.projectName,
        newProjectName: sanitizedName
      }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      projectId: newProjectId,
      projectName: sanitizedName,
      description: clonedProject.description,
      scoreRangeMin: clonedProject.scoreRangeMin,
      scoreRangeMax: clonedProject.scoreRangeMax,
      status: clonedProject.status,
      createdTime: timestamp,
      workbookId: workbookResult.workbookId
    }, 'Project cloned successfully');
    
  } catch (error) {
    logErr('Clone project error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to clone project');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createProject,
    getProject,
    updateProject,
    listUserProjects,
    getProjectListWithStages,
    deleteProject,
    getProjectCore,
    getProjectContent,
    getCompleteProjectData,
    exportProject,
    getProjectList,
    getProjectDetails,
    cloneProject
  };
}