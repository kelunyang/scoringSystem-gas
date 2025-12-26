/**
 * @fileoverview System administration API endpoints
 * @module SystemAdminAPI
 */

/**
 * Get all users (for admin use)
 */
function getAllUsers(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Get all users
    const globalData = readGlobalData();
    
    // Get user tags and global groups for all users from global database
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    const tags = readFullSheet(globalDb, 'Tags') || [];
    const globalUserGroups = readFullSheet(globalDb, 'GlobalUserGroups') || [];
    const globalGroups = readFullSheet(globalDb, 'GlobalGroups') || [];
    
    const usersData = globalData.users.map(user => {
      // Get user's active tags
      const userTagData = userTags
        .filter(ut => ut.userEmail === user.userEmail && ut.isActive)
        .map(ut => {
          const tag = tags.find(t => t.tagId === ut.tagId && t.isActive);
          return tag ? {
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor
          } : null;
        })
        .filter(tag => tag !== null);
      
      // Get user's global groups
      const userGlobalGroupData = globalUserGroups
        .filter(ug => ug.userEmail === user.userEmail && ug.isActive)
        .map(ug => {
          const group = globalGroups.find(g => g.groupId === ug.groupId && g.isActive);
          return group ? {
            groupId: group.groupId,
            groupName: group.groupName,
            description: group.description,
            globalPermissions: group.globalPermissions
          } : null;
        })
        .filter(group => group !== null);
      
      return {
        userId: user.userId,
        username: user.username,
        userEmail: user.userEmail,
        displayName: user.displayName,
        status: user.status,
        registrationTime: user.registrationTime,
        lastLoginTime: user.lastLoginTime,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
        avatarOptions: user.avatarOptions,
        tags: userTagData,
        globalGroups: userGlobalGroupData
      };
    });
    
    return createSuccessResponseWithSession(sessionId, usersData);
    
  } catch (error) {
    logErr('Get all users error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get users');
  }
}

/**
 * Get all users with tags and groups (alias for getAllUsers)
 */
function getAllUsersWithTags(sessionId) {
  return getAllUsers(sessionId);
}

/**
 * Update user status (activate/deactivate)
 */
function updateUserStatus(sessionId, userEmail, status) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid status value');
    }
    
    // Get user
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === userEmail);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Update user status
    updateSheetRow(null, 'Users', 'userEmail', userEmail, {
      status: status,
      lastModified: getCurrentTimestamp()
    });
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'user_status_updated',
      'user',
      userEmail,
      { status, previousStatus: user.status }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User status updated to ' + status);
    
  } catch (error) {
    logErr('Update user status error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update user status');
  }
}

/**
 * Update user profile (admin function) - comprehensive user data update
 */
function updateUserProfile(sessionId, userData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate required userEmail
    if (!userData.userEmail) {
      return createErrorResponse('INVALID_INPUT', 'userEmail is required');
    }
    
    // Get user
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === userData.userEmail);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Prepare update object with allowed fields
    const allowedFields = [
      'displayName', 'status', 'avatarSeed', 'avatarStyle', 'avatarOptions'
    ];
    const updates = {};
    
    allowedFields.forEach(field => {
      if (userData.hasOwnProperty(field)) {
        if (field === 'displayName') {
          updates[field] = sanitizeString(userData[field], 100);
        } else if (field === 'status') {
          if (['active', 'inactive'].includes(userData[field])) {
            updates[field] = userData[field];
          }
        } else if (field === 'avatarSeed') {
          updates[field] = sanitizeString(userData[field], 50);
        } else if (field === 'avatarStyle') {
          const validStyles = ['avataaars', 'bottts', 'identicon', 'initials', 'personas', 'pixel-art'];
          if (validStyles.includes(userData[field])) {
            updates[field] = userData[field];
          }
        } else if (field === 'avatarOptions') {
          if (typeof userData[field] === 'object') {
            updates[field] = safeJsonStringify(userData[field]);
          } else if (typeof userData[field] === 'string') {
            // Validate JSON string
            try {
              JSON.parse(userData[field]);
              updates[field] = userData[field];
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Add timestamp
    updates.lastModified = getCurrentTimestamp();
    
    // Update user record
    updateSheetRow(null, 'Users', 'userEmail', userData.userEmail, updates);
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'user_profile_updated_by_admin',
      'user',
      userData.userEmail,
      { updatedFields: Object.keys(updates) }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User profile updated successfully');
    
  } catch (error) {
    logErr('Update user profile error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update user profile');
  }
}

/**
 * Reset user password (admin function)
 */
function resetUserPassword(sessionId, userEmail, newPassword) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return createErrorResponse('INVALID_INPUT', 'Password must be at least 6 characters');
    }
    
    // Get user
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === userEmail);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Hash new password
    const hashedPassword = hashPassword(newPassword);
    
    // Update password
    updateSheetRow(null, 'Users', 'userEmail', userEmail, {
      password: hashedPassword,
      lastModified: getCurrentTimestamp()
    });
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'password_reset_by_admin',
      'user',
      userEmail,
      {}
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User password reset successfully');
    
  } catch (error) {
    logErr('Reset user password error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to reset user password');
  }
}

/**
 * Get system statistics
 */
function getSystemStats(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Calculate statistics
    const stats = {
      totalUsers: globalData.users?.length || 0,
      activeUsers: globalData.users?.filter(u => u.status === 'active').length || 0,
      inactiveUsers: globalData.users?.filter(u => u.status === 'inactive').length || 0,
      totalProjects: globalData.projects?.length || 0,
      activeProjects: globalData.projects?.filter(p => p.status === 'active').length || 0,
      completedProjects: globalData.projects?.filter(p => p.status === 'completed').length || 0,
      totalGroups: globalData.globalgroups?.length || 0,
      activeGroups: globalData.globalgroups?.filter(g => g.isActive).length || 0,
      // Count invitations from SystemConfigs with category 'invitations'
      totalInvitations: globalData.systemConfigs?.filter(c => c.category === 'invitations').length || 0,
      activeInvitations: globalData.systemConfigs?.filter(c => c.category === 'invitations').map(c => {
        try {
          const inviteData = JSON.parse(c.configValue);
          return inviteData.status === 'active' ? 1 : 0;
        } catch (e) {
          return 0;
        }
      }).reduce((sum, count) => sum + count, 0) || 0
    };
    
    return createSuccessResponseWithSession(sessionId, stats);
    
  } catch (error) {
    logErr('Get system stats error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get system statistics');
  }
}

/**
 * Get system event logs (recent activities)
 */
function getSystemEventLogs(sessionId, limit = 100) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Get recent logs (if EventLogs exists)
    let logs = [];
    if (globalData.eventlogs && globalData.eventlogs.length > 0) {
      logs = globalData.eventlogs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    }
    
    return createSuccessResponseWithSession(sessionId, logs);
    
  } catch (error) {
    logErr('Get system logs error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get system logs');
  }
}

/**
 * Get all global groups (admin function)
 */
function getGlobalGroups(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Get all global groups
    const globalData = readGlobalData();
    const groups = globalData.globalgroups || [];
    
    // Add member count for each group
    const groupsWithMemberCount = groups.map(group => {
      const memberCount = globalData.globalusergroups?.filter(ug => 
        ug.groupId === group.groupId && ug.isActive
      ).length || 0;
      
      return {
        ...group,
        memberCount: memberCount
      };
    });
    
    return createSuccessResponseWithSession(sessionId, groupsWithMemberCount);
    
  } catch (error) {
    logErr('Get global groups error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get global groups');
  }
}

/**
 * Get user's global groups (admin function)
 */
function getUserGlobalGroups(sessionId, userEmail) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Get user's global group memberships
    const userGroups = globalData.globalusergroups?.filter(ug => 
      ug.userEmail === userEmail && ug.isActive
    ) || [];
    
    // Get group details
    const userGroupDetails = userGroups.map(ug => {
      const group = globalData.globalgroups?.find(g => g.groupId === ug.groupId);
      return group ? {
        groupId: group.groupId,
        groupName: group.groupName,
        globalPermissions: group.globalPermissions,
        role: ug.role,
        joinTime: ug.joinTime
      } : null;
    }).filter(g => g !== null);
    
    return createSuccessResponseWithSession(sessionId, userGroupDetails);
    
  } catch (error) {
    logErr('Get user global groups error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user global groups');
  }
}

/**
 * Get user's project groups with allowChange settings (admin function)
 */
function getUserProjectGroups(sessionId, userEmail) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Admin privileges required');
    }
    
    // Validate userEmail
    if (!userEmail) {
      return createErrorResponse('INVALID_INPUT', 'userEmail is required');
    }
    
    // Get global data to find all projects
    const globalData = readGlobalData();
    const userProjectGroups = [];
    
    // Iterate through all projects to find user's memberships
    for (const project of globalData.projects) {
      if (project.status === 'archived' || project.status === 'deleted') {
        continue;
      }
      
      try {
        // Read project data to check user groups
        const projectData = readProjectData(project.projectId);
        
        // Find user's group memberships in this project
        const userGroups = projectData.usergroups?.filter(ug => 
          ug.userEmail === userEmail && ug.isActive
        ) || [];
        
        // For each group membership, get group details
        for (const userGroup of userGroups) {
          const group = projectData.groups?.find(g => 
            g.groupId === userGroup.groupId && g.status === 'active'
          );
          
          if (group) {
            userProjectGroups.push({
              projectId: project.projectId,
              projectName: project.projectName,
              groupId: group.groupId,
              groupName: group.groupName,
              role: userGroup.role,
              allowChange: group.allowChange !== false, // Default to true if not specified
              joinTime: userGroup.joinTime,
              lastModified: userGroup.lastModified
            });
          }
        }
      } catch (error) {
        // Skip projects that can't be accessed (continue to next project)
        logWrn('Cannot access project data for user project groups query', { 
          projectId: project.projectId, 
          userEmail: userEmail,
          error: error.message 
        });
      }
    }
    
    // Sort by project name, then by group name
    userProjectGroups.sort((a, b) => {
      const projectCompare = a.projectName.localeCompare(b.projectName);
      if (projectCompare !== 0) return projectCompare;
      return a.groupName.localeCompare(b.groupName);
    });
    
    return createSuccessResponseWithSession(sessionId, userProjectGroups);
    
  } catch (error) {
    logErr('Get user project groups error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user project groups');
  }
}

/**
 * Add user to global group (admin function)
 */
function addUserToGlobalGroup(sessionId, groupId, userEmail, skipSessionValidation = false) {
  try {
    let currentUserEmail = 'system'; // Default for system operations
    
    // Validate session (unless this is a system operation)
    if (!skipSessionValidation) {
      const sessionResult = validateSession(sessionId);
      if (!sessionResult) {
        return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
      }
      
      // Check if user is system admin
      if (!isSystemAdmin(sessionResult.userEmail)) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
      }
      
      currentUserEmail = sessionResult.userEmail;
    }
    
    // Validate inputs
    if (!groupId || !userEmail) {
      return createErrorResponse('INVALID_INPUT', 'groupId and userEmail are required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Check if group exists
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    // Check if user exists
    const user = globalData.users?.find(u => u.userEmail === userEmail);
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Check if user is already in the group
    const existingMembership = globalData.globalusergroups?.find(ug =>
      ug.userEmail === userEmail && ug.groupId === groupId && ug.isActive
    );
    
    if (existingMembership) {
      return createErrorResponse('USER_ALREADY_IN_GROUP', 'User is already in this global group');
    }
    
    // Add user to group
    const membershipId = generateIdWithType('membership');
    const timestamp = getCurrentTimestamp();
    
    const membership = {
      membershipId: membershipId,
      groupId: groupId,
      userEmail: userEmail,
      role: 'member', // Default role
      isActive: true,
      joinTime: timestamp,
      addedBy: currentUserEmail
    };
    
    // Add to GlobalUserGroups sheet
    addRowToSheet(null, 'GlobalUserGroups', membership);
    
    // Log the action
    logOperation(
      currentUserEmail,
      'user_added_to_global_group',
      'group',
      groupId,
      { addedUser: userEmail, groupName: group.groupName }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User added to global group successfully');
    
  } catch (error) {
    logErr('Add user to global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to add user to global group');
  }
}

/**
 * Remove user from global group (admin function)
 */
function removeUserFromGlobalGroup(sessionId, groupId, userEmail) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId || !userEmail) {
      return createErrorResponse('INVALID_INPUT', 'groupId and userEmail are required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Find the membership
    const membership = globalData.globalusergroups?.find(ug =>
      ug.userEmail === userEmail && ug.groupId === groupId && ug.isActive
    );
    
    if (!membership) {
      return createErrorResponse('MEMBERSHIP_NOT_FOUND', 'User is not in this global group');
    }
    
    // Get group name for logging
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    const groupName = group ? group.groupName : 'Unknown Group';
    
    // Mark membership as inactive
    updateSheetRow(null, 'GlobalUserGroups', 'membershipId', membership.membershipId, {
      isActive: false,
      removedTime: getCurrentTimestamp(),
      removedBy: sessionResult.userEmail
    });
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'user_removed_from_global_group',
      'group',
      groupId,
      { removedUser: userEmail, groupName: groupName }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User removed from global group successfully');
    
  } catch (error) {
    logErr('Remove user from global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove user from global group');
  }
}

/**
 * Create a new global group (admin function)
 */
function createGlobalGroup(sessionId, groupData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate required fields
    if (!groupData.groupName) {
      return createErrorResponse('INVALID_INPUT', 'groupName is required');
    }
    
    // Sanitize input
    groupData.groupName = sanitizeString(groupData.groupName, 50);
    groupData.description = sanitizeString(groupData.description || '', 200);
    
    // Validate global permissions
    const validPermissions = ['create_project', 'system_admin', 'manage_users', 'generate_invites', 'view_system_logs', 'manage_global_groups', 'manage_tags'];
    const permissions = Array.isArray(groupData.globalPermissions) ? groupData.globalPermissions : [];
    
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Invalid permissions: ' + invalidPermissions.join(', '));
    }
    
    // Check if group name already exists
    const globalData = readGlobalData();
    const existingGroup = globalData.globalgroups?.find(g => 
      g.groupName.toLowerCase() === groupData.groupName.toLowerCase() && g.isActive
    );
    
    if (existingGroup) {
      return createErrorResponse('GROUP_EXISTS', 'Global group name already exists');
    }
    
    // Create group record
    const groupId = generateIdWithType('globalgroup');
    const timestamp = getCurrentTimestamp();
    
    const groupRecord = {
      groupId: groupId,
      groupName: groupData.groupName,
      description: groupData.description,
      globalPermissions: safeJsonStringify(permissions),
      isActive: true,
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      memberCount: 0
    };
    
    // Add to GlobalGroups sheet
    addRowToSheet(null, 'GlobalGroups', groupRecord);
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'global_group_created',
      'group',
      groupId,
      { groupName: groupData.groupName, permissions: permissions }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      groupId: groupId,
      groupName: groupData.groupName,
      description: groupData.description,
      globalPermissions: permissions,
      isActive: true,
      createdTime: timestamp
    }, 'Global group created successfully');
    
  } catch (error) {
    logErr('Create global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create global group');
  }
}

/**
 * Get system logs with admin authentication
 */
function getSystemLogsWithAuth(sessionId, options = {}) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view system logs');
    }
    
    // Call the logging function from logging.js
    const logsResult = getSystemLogs(options);
    
    if (logsResult.success) {
      return createSuccessResponseWithSession(sessionId, logsResult.data);
    } else {
      return createErrorResponseWithSession(sessionId, logsResult.error.code, logsResult.error.message);
    }
    
  } catch (error) {
    logErr('Get system logs with auth error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get system logs');
  }
}

/**
 * Get log statistics with admin authentication
 */
function getLogStatisticsWithAuth(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view log statistics');
    }
    
    // Call the logging function from logging.js
    const statsResult = getLogStatistics();
    
    if (statsResult.success) {
      return createSuccessResponseWithSession(sessionId, statsResult.data);
    } else {
      return createErrorResponseWithSession(sessionId, statsResult.error.code, statsResult.error.message);
    }
    
  } catch (error) {
    logErr('Get log statistics with auth error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get log statistics');
  }
}

/**
 * Archive logs with admin authentication
 */
function archiveLogsWithAuth(sessionId, maxRows = 50000) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to archive logs');
    }
    
    // Call the logging function from logging.js
    const archiveResult = archiveOldLogs(maxRows);
    
    if (archiveResult.success) {
      return createSuccessResponseWithSession(sessionId, archiveResult.data);
    } else {
      return createErrorResponseWithSession(sessionId, archiveResult.error.code, archiveResult.error.message);
    }
    
  } catch (error) {
    logErr('Archive logs with auth error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to archive logs');
  }
}

/**
 * Update a global group (admin function)
 */
function updateGlobalGroup(sessionId, groupId, groupData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId) {
      return createErrorResponse('INVALID_INPUT', 'groupId is required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Find the group
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    // Prepare updates
    const updates = {};
    const allowedFields = ['groupName', 'description', 'globalPermissions'];
    
    allowedFields.forEach(field => {
      if (groupData.hasOwnProperty(field)) {
        if (field === 'groupName') {
          const newName = sanitizeString(groupData[field], 50);
          // Check if new name conflicts with existing groups
          const existingGroup = globalData.globalgroups?.find(g => 
            g.groupId !== groupId &&
            g.groupName.toLowerCase() === newName.toLowerCase() && 
            g.isActive
          );
          if (existingGroup) {
            return createErrorResponse('GROUP_EXISTS', 'Global group name already exists');
          }
          updates[field] = newName;
        } else if (field === 'description') {
          updates[field] = sanitizeString(groupData[field], 200);
        } else if (field === 'globalPermissions') {
          // Validate permissions
          const validPermissions = ['create_project', 'system_admin', 'manage_users', 'generate_invites', 'view_system_logs', 'manage_global_groups', 'manage_tags'];
          const permissions = Array.isArray(groupData[field]) ? groupData[field] : [];
          
          const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
          if (invalidPermissions.length > 0) {
            return createErrorResponse('INVALID_INPUT', 'Invalid permissions: ' + invalidPermissions.join(', '));
          }
          
          updates[field] = safeJsonStringify(permissions);
        }
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Add timestamp
    updates.lastModified = getCurrentTimestamp();
    
    // Update group
    updateSheetRow(null, 'GlobalGroups', 'groupId', groupId, updates);
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'global_group_updated',
      'group',
      groupId,
      { updatedFields: Object.keys(updates) }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'Global group updated successfully');
    
  } catch (error) {
    logErr('Update global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update global group');
  }
}

/**
 * Deactivate a global group (admin function)
 */
function deactivateGlobalGroup(sessionId, groupId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId) {
      return createErrorResponse('INVALID_INPUT', 'groupId is required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Find the group
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    // Update group status
    updateSheetRow(null, 'GlobalGroups', 'groupId', groupId, {
      isActive: false,
      deactivatedTime: getCurrentTimestamp(),
      deactivatedBy: sessionResult.userEmail
    });
    
    // Deactivate all user memberships in this group
    const userGroups = globalData.globalusergroups?.filter(ug => ug.groupId === groupId && ug.isActive) || [];
    userGroups.forEach(ug => {
      updateSheetRow(null, 'GlobalUserGroups', 'membershipId', ug.membershipId, {
        isActive: false,
        removedTime: getCurrentTimestamp(),
        removedBy: sessionResult.userEmail
      });
    });
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'global_group_deactivated',
      'group',
      groupId,
      { groupName: group.groupName, membersAffected: userGroups.length }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'Global group deactivated successfully');
    
  } catch (error) {
    logErr('Deactivate global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to deactivate global group');
  }
}

/**
 * Activate a global group (admin function)
 */
function activateGlobalGroup(sessionId, groupId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId) {
      return createErrorResponse('INVALID_INPUT', 'groupId is required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Find the group
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    // Update group status
    updateSheetRow(null, 'GlobalGroups', 'groupId', groupId, {
      isActive: true,
      reactivatedTime: getCurrentTimestamp(),
      reactivatedBy: sessionResult.userEmail
    });
    
    // Log the action
    logOperation(
      sessionResult.userEmail,
      'global_group_activated',
      'group',
      groupId,
      { groupName: group.groupName }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'Global group activated successfully');
    
  } catch (error) {
    logErr('Activate global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to activate global group');
  }
}

/**
 * Get global group members (admin function)
 */
function getGlobalGroupMembers(sessionId, groupId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId) {
      return createErrorResponse('INVALID_INPUT', 'groupId is required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Check if group exists
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    // Get group members
    const groupMemberships = globalData.globalusergroups?.filter(ug => 
      ug.groupId === groupId && ug.isActive
    ) || [];
    
    // Get member details
    const members = groupMemberships.map(membership => {
      const user = globalData.users?.find(u => u.userEmail === membership.userEmail);
      return {
        membershipId: membership.membershipId,
        userEmail: membership.userEmail,
        displayName: user?.displayName || membership.userEmail,
        username: user?.username || membership.userEmail,
        role: membership.role || 'member',
        joinTime: membership.joinTime,
        addedBy: membership.addedBy
      };
    });
    
    return createSuccessResponseWithSession(sessionId, {
      groupId: group.groupId,
      groupName: group.groupName,
      memberCount: members.length,
      members: members
    });
    
  } catch (error) {
    logErr('Get global group members error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get global group members');
  }
}

/**
 * Batch add users to global group (admin function)
 */
function batchAddUsersToGlobalGroup(sessionId, groupId, userEmails) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId || !Array.isArray(userEmails) || userEmails.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'groupId and userEmails array are required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Check if group exists
    const group = globalData.globalgroups?.find(g => g.groupId === groupId && g.isActive);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Active global group not found');
    }
    
    const results = [];
    const timestamp = getCurrentTimestamp();
    
    for (const userEmail of userEmails) {
      try {
        // Validate email
        if (!validateEmail(userEmail)) {
          results.push({ userEmail, success: false, error: 'Invalid email format' });
          continue;
        }
        
        // Check if user exists
        const user = globalData.users?.find(u => u.userEmail === userEmail && u.status === 'active');
        if (!user) {
          results.push({ userEmail, success: false, error: 'User not found or inactive' });
          continue;
        }
        
        // Check if user is already in the group
        const existingMembership = globalData.globalusergroups?.find(ug =>
          ug.userEmail === userEmail && ug.groupId === groupId && ug.isActive
        );
        
        if (existingMembership) {
          results.push({ userEmail, success: false, error: 'User already in group' });
          continue;
        }
        
        // Add user to group
        const membershipId = generateIdWithType('membership');
        const membership = {
          membershipId: membershipId,
          groupId: groupId,
          userEmail: userEmail,
          role: 'member',
          isActive: true,
          joinTime: timestamp,
          addedBy: sessionResult.userEmail
        };
        
        addRowToSheet(null, 'GlobalUserGroups', membership);
        results.push({ userEmail, success: true, membershipId });
        
      } catch (error) {
        results.push({ userEmail, success: false, error: error.message });
      }
    }
    
    // Log the batch operation
    logOperation(
      sessionResult.userEmail,
      'batch_add_users_to_global_group',
      'group',
      groupId,
      { 
        groupName: group.groupName,
        userCount: userEmails.length,
        successCount: results.filter(r => r.success).length
      }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      groupId: groupId,
      groupName: group.groupName,
      results: results,
      totalRequested: userEmails.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });
    
  } catch (error) {
    logErr('Batch add users to global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to batch add users to global group');
  }
}

/**
 * Batch remove users from global group (admin function)
 */
function batchRemoveUsersFromGlobalGroup(sessionId, groupId, userEmails) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!groupId || !Array.isArray(userEmails) || userEmails.length === 0) {
      return createErrorResponse('INVALID_INPUT', 'groupId and userEmails array are required');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Check if group exists
    const group = globalData.globalgroups?.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global group not found');
    }
    
    const results = [];
    const timestamp = getCurrentTimestamp();
    
    for (const userEmail of userEmails) {
      try {
        // Find the membership
        const membership = globalData.globalusergroups?.find(ug =>
          ug.userEmail === userEmail && ug.groupId === groupId && ug.isActive
        );
        
        if (!membership) {
          results.push({ userEmail, success: false, error: 'User not in group' });
          continue;
        }
        
        // Mark membership as inactive
        updateSheetRow(null, 'GlobalUserGroups', 'membershipId', membership.membershipId, {
          isActive: false,
          removedTime: timestamp,
          removedBy: sessionResult.userEmail
        });
        
        results.push({ userEmail, success: true });
        
      } catch (error) {
        results.push({ userEmail, success: false, error: error.message });
      }
    }
    
    // Log the batch operation
    logOperation(
      sessionResult.userEmail,
      'batch_remove_users_from_global_group',
      'group',
      groupId,
      { 
        groupName: group.groupName,
        userCount: userEmails.length,
        successCount: results.filter(r => r.success).length
      }
    );
    
    return createSuccessResponseWithSession(sessionId, {
      groupId: groupId,
      groupName: group.groupName,
      results: results,
      totalRequested: userEmails.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    });
    
  } catch (error) {
    logErr('Batch remove users from global group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to batch remove users from global group');
  }
}

/**
 * Wrapper functions for permissions API
 */
function handleAddUserToGlobalPMGroup(params) {
  try {
    const sessionResult = validateSession(params.sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    return addUserToGlobalPMGroup(params.userEmail, sessionResult.userEmail);
  } catch (error) {
    logErr('Handle add user to global PM group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to add user to Global PM group');
  }
}

function handleRemoveUserFromGlobalPMGroup(params) {
  try {
    const sessionResult = validateSession(params.sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    return removeUserFromGlobalPMGroup(params.userEmail, sessionResult.userEmail);
  } catch (error) {
    logErr('Handle remove user from global PM group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove user from Global PM group');
  }
}

function handleGetGlobalPMs(params) {
  try {
    const sessionResult = validateSession(params.sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    return getGlobalPMs();
  } catch (error) {
    logErr('Handle get global PMs error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get Global PMs');
  }
}

/**
 * Update user permission by managing global group membership
 */
function updateUserPermission(sessionId, userEmail, permissionCode, granted) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Check if user is system admin
    if (!isSystemAdmin(sessionResult.userEmail)) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions');
    }
    
    // Validate inputs
    if (!userEmail) {
      return createErrorResponse('INVALID_INPUT', 'userEmail is required');
    }
    
    if (!permissionCode) {
      return createErrorResponse('INVALID_INPUT', 'permissionCode is required');
    }
    
    if (typeof granted !== 'boolean') {
      return createErrorResponse('INVALID_INPUT', 'granted must be a boolean');
    }
    
    // Get global data
    const globalData = readGlobalData();
    
    // Check if user exists
    const user = globalData.users?.find(u => u.userEmail === userEmail);
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Find or create a dedicated group for this permission
    let permissionGroup = globalData.globalgroups?.find(g => 
      g.isActive && g.globalPermissions && 
      (typeof g.globalPermissions === 'string' ? 
        JSON.parse(g.globalPermissions) : g.globalPermissions
      ).includes(permissionCode)
    );
    
    // If permission group doesn't exist, create it
    if (!permissionGroup) {
      const groupId = generateIdWithType('group');
      const timestamp = getCurrentTimestamp();
      
      // Define permission group names
      const permissionNames = {
        'create_project': '專案建立者',
        'system_admin': '系統管理員',
        'manage_users': '使用者管理員',
        'generate_invites': '邀請碼管理員',
        'view_system_logs': '日誌查看員',
        'manage_global_groups': '群組管理員',
        'manage_tags': '標籤管理員',
        'teacher_privilege': '教師群組'
      };
      
      permissionGroup = {
        groupId: groupId,
        groupName: permissionNames[permissionCode] || `${permissionCode}群組`,
        groupDescription: `具有${permissionCode}權限的群組`,
        isActive: true,
        allowJoin: false,
        createdBy: sessionResult.userEmail,
        createdTime: timestamp,
        globalPermissions: safeJsonStringify([permissionCode])
      };
      
      // Add to GlobalGroups sheet
      addRowToSheet(null, 'GlobalGroups', permissionGroup);
      console.log('Created permission group: ' + groupId + ' for permission: ' + permissionCode);
    }
    
    // Check current membership
    const currentMembership = globalData.globalusergroups?.find(ug =>
      ug.userEmail === userEmail && ug.groupId === permissionGroup.groupId && ug.isActive
    );
    
    const timestamp = getCurrentTimestamp();
    
    if (granted) {
      // Grant permission by adding to permission group
      if (currentMembership) {
        return createErrorResponse('ALREADY_HAS_PERMISSION', 'User already has this permission');
      }
      
      // Add user to permission group
      const membershipId = generateIdWithType('membership');
      const membership = {
        membershipId: membershipId,
        groupId: permissionGroup.groupId,
        userEmail: userEmail,
        role: 'member',
        isActive: true,
        joinTime: timestamp,
        addedBy: sessionResult.userEmail
      };
      
      addRowToSheet(null, 'GlobalUserGroups', membership);
      
      // Log the action
      logOperation(
        sessionResult.userEmail,
        'permission_granted',
        'user',
        userEmail,
        { permissionCode: permissionCode, groupId: permissionGroup.groupId }
      );
      
      return createSuccessResponseWithSession(sessionId, null, `Permission ${permissionCode} granted successfully`);
      
    } else {
      // Remove permission by removing from permission group
      if (!currentMembership) {
        return createErrorResponse('NO_PERMISSION', 'User does not have this permission');
      }
      
      // Mark membership as inactive
      updateSheetRow(null, 'GlobalUserGroups', 'membershipId', currentMembership.membershipId, {
        isActive: false,
        removedTime: timestamp,
        removedBy: sessionResult.userEmail
      });
      
      // Log the action
      logOperation(
        sessionResult.userEmail,
        'permission_revoked',
        'user',
        userEmail,
        { permissionCode: permissionCode, groupId: permissionGroup.groupId }
      );
      
      return createSuccessResponseWithSession(sessionId, null, `Permission ${permissionCode} revoked successfully`);
    }
    
  } catch (error) {
    logErr('Update user permission error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update user permission');
  }
}


// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllUsers,
    getAllUsersWithTags,
    updateUserStatus,
    updateUserProfile,
    resetUserPassword,
    getSystemStats,
    getSystemLogs,
    getGlobalGroups,
    getUserGlobalGroups,
    getUserProjectGroups,
    addUserToGlobalGroup,
    removeUserFromGlobalGroup,
    createGlobalGroup,
    updateGlobalGroup,
    deactivateGlobalGroup,
    activateGlobalGroup,
    getGlobalGroupMembers,
    batchAddUsersToGlobalGroup,
    batchRemoveUsersFromGlobalGroup,
    handleAddUserToGlobalPMGroup,
    handleRemoveUserFromGlobalPMGroup,
    handleGetGlobalPMs,
    updateUserPermission
  };
}