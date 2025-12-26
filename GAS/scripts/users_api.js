/**
 * @fileoverview User management API endpoints
 * @module UsersAPI
 */

/**
 * Register a new user with invitation code
 */
function registerUser(invitationCode, userData) {
  try {
    // Validate required fields first
    const requiredFields = ['username', 'password', 'userEmail', 'displayName'];
    const missingFields = validateRequiredFields(userData, requiredFields);
    if (missingFields.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Missing required fields: ' + missingFields.join(', '));
    }
    
    // Validate email format
    if (!validateEmail(userData.userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    // Validate invitation code for this specific email
    const invitationResult = validateInvitationCodeForEmail(invitationCode, userData.userEmail);
    if (!invitationResult.success) {
      return invitationResult;
    }
    
    // Sanitize input
    userData.username = sanitizeString(userData.username, 50).toLowerCase();
    userData.userEmail = sanitizeString(userData.userEmail, 100).toLowerCase();
    userData.displayName = sanitizeString(userData.displayName, 100);
    
    // Validate username (alphanumeric and underscore only)
    if (!/^[a-z0-9_]+$/.test(userData.username)) {
      return createErrorResponse('INVALID_INPUT', 'Username can only contain lowercase letters, numbers, and underscores');
    }
    
    if (userData.username.length < 3) {
      return createErrorResponse('INVALID_INPUT', 'Username must be at least 3 characters');
    }
    
    // Validate password strength
    const passwordValidation = validatePasswordStrength(userData.password);
    if (!passwordValidation.isValid) {
      return createErrorResponse('INVALID_INPUT', passwordValidation.errors.join(', '));
    }
    
    // Check if username already exists
    const globalData = readGlobalData();
    const existingUser = globalData.users.find(u => 
      u.username === userData.username || u.userEmail === userData.userEmail
    );
    
    if (existingUser) {
      if (existingUser.username === userData.username) {
        return createErrorResponse('USER_EXISTS', 'Username already taken');
      } else {
        return createErrorResponse('USER_EXISTS', 'Email already registered');
      }
    }
    
    // Hash password
    const hashedPassword = hashPassword(userData.password);
    
    // Create user record
    const userId = generateIdWithType('user');
    const timestamp = getCurrentTimestamp();
    
    const userRecord = {
      userId: userId,
      username: userData.username,
      password: hashedPassword,
      userEmail: userData.userEmail,
      displayName: userData.displayName,
      registrationTime: timestamp,
      lastLoginTime: null,
      status: 'active',
      preferences: safeJsonStringify({
        theme: 'light',
        lang: 'zh-TW',
        notifications: true
      }),
      avatarSeed: userData.avatarSeed || generateAvatarSeed(userData.userEmail),
      avatarStyle: userData.avatarStyle || 'avataaars',
      avatarOptions: safeJsonStringify(userData.avatarOptions || {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      })
    };
    
    // Add user to database
    addRowToSheet(null, 'Users', userRecord);
    
    // Mark invitation as used
    try {
      updateSheetRow(null, 'InvitationCodes', 'invitationCode', hashInvitationToken(invitationCode), {
        status: 'used',
        usedTime: getCurrentTimestamp()
      });
      logInfo('Marked invitation as used', { userEmail: userData.userEmail });
    } catch (markUsedError) {
      logWrn('Failed to mark invitation as used', { error: markUsedError.message });
    }
    
    const useInvitationResult = invitationResult; // Use the same result from validation
    
    // Automatically assign default tags from invitation
    if (useInvitationResult.success && useInvitationResult.data.defaultTags && useInvitationResult.data.defaultTags.length > 0) {
      try {
        let defaultTags = useInvitationResult.data.defaultTags;
        
        // Ensure defaultTags is an array, not a string
        if (typeof defaultTags === 'string') {
          try {
            defaultTags = JSON.parse(defaultTags);
          } catch (parseError) {
            logWrn('Failed to parse defaultTags JSON string', { 
              userEmail: userData.userEmail,
              defaultTags: defaultTags,
              error: parseError.message 
            });
            defaultTags = [];
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(defaultTags)) {
          logWrn('defaultTags is not an array, converting', { 
            userEmail: userData.userEmail,
            defaultTags: defaultTags,
            type: typeof defaultTags
          });
          defaultTags = [];
        }
        
        for (const tagId of defaultTags) {
          // Skip invalid tagIds (like individual characters)
          if (!tagId || typeof tagId !== 'string' || tagId.length < 3) {
            logWrn('Skipping invalid tagId in defaultTags', { 
              userEmail: userData.userEmail,
              tagId: tagId,
              tagIdType: typeof tagId
            });
            continue;
          }
          
          // Assign each default tag to the new user
          const tagAssignResult = assignTagToUser(null, userData.userEmail, tagId, true); // true = skip session validation for system operation
          if (tagAssignResult && !tagAssignResult.success) {
            logWrn('Failed to assign default tag to new user', { 
              userEmail: userData.userEmail, 
              tagId: tagId,
              error: tagAssignResult.error 
            });
          }
        }
        logInfo('Auto-assigned default tags to new user', { 
          userEmail: userData.userEmail, 
          tagCount: defaultTags.length,
          tagIds: defaultTags
        });
      } catch (error) {
        logWrn('Failed to process default tags for new user', { 
          userEmail: userData.userEmail, 
          error: error.message 
        });
      }
    }
    
    // Automatically assign default global groups from invitation
    if (useInvitationResult.success && useInvitationResult.data.defaultGlobalGroups && useInvitationResult.data.defaultGlobalGroups.length > 0) {
      try {
        let defaultGlobalGroups = useInvitationResult.data.defaultGlobalGroups;
        
        // Ensure defaultGlobalGroups is an array, not a string
        if (typeof defaultGlobalGroups === 'string') {
          try {
            defaultGlobalGroups = JSON.parse(defaultGlobalGroups);
          } catch (parseError) {
            logWrn('Failed to parse defaultGlobalGroups JSON string', { 
              userEmail: userData.userEmail,
              defaultGlobalGroups: defaultGlobalGroups,
              error: parseError.message 
            });
            defaultGlobalGroups = [];
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(defaultGlobalGroups)) {
          logWrn('defaultGlobalGroups is not an array, converting', { 
            userEmail: userData.userEmail,
            defaultGlobalGroups: defaultGlobalGroups,
            type: typeof defaultGlobalGroups
          });
          defaultGlobalGroups = [];
        }
        
        for (const groupId of defaultGlobalGroups) {
          // Skip invalid groupIds (like individual characters)
          if (!groupId || typeof groupId !== 'string' || groupId.length < 3) {
            logWrn('Skipping invalid groupId in defaultGlobalGroups', { 
              userEmail: userData.userEmail,
              groupId: groupId,
              groupIdType: typeof groupId
            });
            continue;
          }
          
          // Add user to each default global group (skip session validation for system operation)
          const groupAssignResult = addUserToGlobalGroup(null, groupId, userData.userEmail, true);
          if (groupAssignResult && !groupAssignResult.success) {
            logWrn('Failed to assign user to default global group', { 
              userEmail: userData.userEmail, 
              groupId: groupId,
              error: groupAssignResult.error 
            });
          }
        }
        logInfo('Auto-assigned user to default global groups', { 
          userEmail: userData.userEmail, 
          groupCount: defaultGlobalGroups.length,
          groupIds: defaultGlobalGroups
        });
      } catch (error) {
        logWrn('Failed to process default global groups for new user', { 
          userEmail: userData.userEmail, 
          error: error.message 
        });
      }
    }
    
    // Log user registration
    const logEntry = logOperation(
      userData.userEmail,
      'user_registered',
      'user',
      userId,
      { 
        username: userData.username,
        invitationCreatedBy: invitationResult.data.createdBy
      }
    );
    
    // Create welcome notification for the new user
    try {
      const welcomeNotification = createNotification({
        targetUserEmail: userData.userEmail,
        type: 'welcome',
        title: '歡迎加入評分系統！',
        content: `親愛的 ${userData.displayName}，歡迎您加入評分系統！我們將透過電子郵件向您發送重要的系統通知。如有任何問題，請隨時聯繫系統管理員。`,
        metadata: {
          registrationTimestamp: timestamp,
          invitationCreatedBy: invitationResult.data.createdBy,
          userId: userId
        }
      });
      log('Created welcome notification for new user', { 
        userEmail: userData.userEmail, 
        notificationId: welcomeNotification.notificationId 
      });
    } catch (notificationError) {
      logWrn('Failed to create welcome notification for new user', { 
        userEmail: userData.userEmail, 
        error: notificationError.message 
      });
      // Don't fail registration if notification creation fails
    }
    
    return createSuccessResponse({
      userId: userId,
      username: userData.username,
      userEmail: userData.userEmail,
      displayName: userData.displayName,
      status: 'active',
      registrationTime: timestamp
    }, 'User registered successfully');
    
  } catch (error) {
    logErr('Register user error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to register user');
  }
}

/**
 * Get user profile
 */
function getUserProfile(sessionId, targetUserId = null) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponseWithSession(sessionId, 'SESSION_INVALID', 'Session expired or invalid');
    }
    
    // If no targetUserId provided, return current user's profile
    const userId = targetUserId || sessionResult.userId;
    
    // Get user data
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userId === userId);
    
    if (!user) {
      return createErrorResponseWithSession(sessionId, 'USER_NOT_FOUND', 'User not found');
    }
    
    // Check permissions if requesting another user's profile
    if (targetUserId && targetUserId !== sessionResult.userId) {
      // For now, allow viewing other users' basic profiles
      // Could add privacy settings later
    }
    
    const profileData = {
      userId: user.userId,
      username: user.username,
      userEmail: user.userEmail,
      displayName: user.displayName,
      status: user.status,
      registrationTime: user.registrationTime,
      lastLoginTime: user.lastLoginTime,
      preferences: safeJsonParse(user.preferences, {}),
      avatarSeed: user.avatarSeed || generateAvatarSeed(user.userEmail),
      avatarStyle: user.avatarStyle || 'avataaars',
      avatarOptions: safeJsonParse(user.avatarOptions, {
        backgroundColor: 'b6e3f4',
        clothesColor: '3c4858',
        skinColor: 'ae5d29'
      }),
      badges: getUserBadges(user.userEmail)
    };
    
    // Add sensitive information only for own profile
    if (userId === sessionResult.userId) {
      // Could add more sensitive data here if needed
    }
    
    return createSuccessResponseWithSession(sessionId, profileData);
    
  } catch (error) {
    logErr('Get user profile error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user profile');
  }
}

/**
 * Update user profile
 */
function updateUserProfile(sessionId, updates) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Get current user
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userId === sessionResult.userId);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Validate and sanitize updates
    const allowedFields = ['displayName', 'preferences'];
    const userUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        if (field === 'displayName') {
          userUpdates[field] = sanitizeString(updates[field], 100);
        } else if (field === 'preferences') {
          // Validate JSON
          if (typeof updates[field] === 'object') {
            userUpdates[field] = safeJsonStringify(updates[field]);
          } else if (validateJsonString(updates[field])) {
            userUpdates[field] = updates[field];
          }
        }
      }
    });
    
    if (Object.keys(userUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Update user record
    updateSheetRow(null, 'Users', 'userId', sessionResult.userId, userUpdates);
    
    // Log profile update
    const logEntry = logOperation(
      sessionResult.userEmail,
      'profile_updated',
      'user',
      sessionResult.userId,
      { updatedFields: Object.keys(userUpdates) }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'Profile updated successfully');
    
  } catch (error) {
    logErr('Update user profile error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update user profile');
  }
}

/**
 * Search users (for mentions, adding to groups, etc.)
 * Returns users that share tags with current user (for team member selection)
 */
function searchUsers(sessionId, query, limit = 10) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    if (!query || query.length < 2) {
      return createErrorResponse('INVALID_INPUT', 'Search query must be at least 2 characters');
    }
    
    // Sanitize query
    query = sanitizeString(query, 50).toLowerCase();
    
    // Get current user's tags for scope filtering
    const currentUserTags = getUserTagIdsForUser(sessionResult.userEmail);
    
    // Get users
    const globalData = readGlobalData();
    let activeUsers = globalData.users.filter(u => u.status === 'active');
    
    // Apply tag scope filtering (users must have exactly the same tag set)
    if (!isSystemAdmin(sessionResult.userEmail)) {
      const globalDb = getGlobalWorkbook();
      const userTags = readFullSheet(globalDb, 'UserTags') || [];
      const filteredUsers = [];
      
      for (const user of activeUsers) {
        const userTagIds = userTags
          .filter(ut => ut.userEmail === user.userEmail && ut.isActive)
          .map(ut => ut.tagId);
        
        // Include user if they have exactly the same tag set as current user
        if (arraysEqual(currentUserTags.sort(), userTagIds.sort())) {
          filteredUsers.push(user);
        }
      }
      
      activeUsers = filteredUsers;
    }
    
    // Search by username, email, or display name
    const matchingUsers = activeUsers
      .filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.userEmail.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
      )
      .map(user => {
        // Get user's tags for display
        const tags = getUserTagsForDisplay(user.userEmail);
        
        return {
          userId: user.userId,
          username: user.username,
          userEmail: user.userEmail,
          displayName: user.displayName,
          tags: tags,
          avatarSeed: user.avatarSeed || generateAvatarSeed(user.userEmail),
          avatarStyle: user.avatarStyle || 'avataaars',
          avatarOptions: safeJsonParse(user.avatarOptions, {
            backgroundColor: 'b6e3f4',
            clothesColor: '3c4858',
            skinColor: 'ae5d29'
          }),
          badges: getUserBadges(user.userEmail)
        };
      })
      .slice(0, limit);
    
    return createSuccessResponse(matchingUsers);
    
  } catch (error) {
    logErr('Search users error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to search users');
  }
}

/**
 * Get users by shared tags (for team member selection)
 * Returns all users that share at least one tag with current user
 */
function getUsersBySharedTags(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Get current user's tags for scope filtering
    const currentUserTags = getUserTagIdsForUser(sessionResult.userEmail);
    
    // Get users
    const globalData = readGlobalData();
    let activeUsers = globalData.users.filter(u => u.status === 'active');
    
    // Apply tag scope filtering (users must have exactly the same tag set)
    if (!isSystemAdmin(sessionResult.userEmail)) {
      const globalDb = getGlobalWorkbook();
      const userTags = readFullSheet(globalDb, 'UserTags') || [];
      const filteredUsers = [];
      
      for (const user of activeUsers) {
        // Skip current user
        if (user.userEmail === sessionResult.userEmail) {
          continue;
        }
        
        const userTagIds = userTags
          .filter(ut => ut.userEmail === user.userEmail && ut.isActive)
          .map(ut => ut.tagId);
        
        // Include user if they have exactly the same tag set as current user
        if (arraysEqual(currentUserTags.sort(), userTagIds.sort())) {
          filteredUsers.push(user);
        }
      }
      
      activeUsers = filteredUsers;
    }
    
    // Return team members with shared tags
    const teamMembers = activeUsers
      .map(user => {
        // Get user's tags for display
        const tags = getUserTagsForDisplay(user.userEmail);
        
        return {
          userId: user.userId,
          username: user.username,
          userEmail: user.userEmail,
          displayName: user.displayName,
          tags: tags,
          avatarSeed: user.avatarSeed || generateAvatarSeed(user.userEmail),
          avatarStyle: user.avatarStyle || 'avataaars',
          avatarOptions: safeJsonParse(user.avatarOptions, {
            backgroundColor: 'b6e3f4',
            clothesColor: '3c4858',
            skinColor: 'ae5d29'
          }),
          badges: getUserBadges(user.userEmail)
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    return createSuccessResponse(teamMembers);
    
  } catch (error) {
    logErr('Get users by shared tags error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get team members');
  }
}

/**
 * Get user's project memberships
 */
function getUserProjects(sessionId, targetUserId = null) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Determine target user
    const userId = targetUserId || sessionResult.userId;
    const targetUserEmail = userId === sessionResult.userId ? 
      sessionResult.userEmail : 
      getUserEmailById(userId);
    
    if (!targetUserEmail) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Get all projects where user is a member or creator
    const globalData = readGlobalData();
    const userProjectMemberships = [];
    
    for (const project of globalData.projects) {
      let membershipInfo = null;
      
      // Check if user is creator
      if (project.createdBy === targetUserEmail) {
        membershipInfo = {
          projectId: project.projectId,
          projectName: project.projectName,
          description: project.description,
          status: project.status,
          role: 'creator',
          joinTime: project.createdTime,
          isActive: true,
          groups: []
        };
      } else {
        // Check if user is member through groups
        try {
          const projectData = readProjectData(project.projectId);
          const userGroups = projectData.usergroups.filter(ug => 
            ug.userEmail === targetUserEmail && ug.isActive
          );
          
          if (userGroups.length > 0) {
            const groups = userGroups.map(ug => {
              const group = projectData.groups.find(g => g.groupId === ug.groupId);
              const projectGroup = projectData.projectgroups.find(pg => pg.groupId === ug.groupId);
              
              return {
                groupId: ug.groupId,
                groupName: group ? group.groupName : 'Unknown Group',
                role: ug.role,
                groupRole: projectGroup ? projectGroup.groupRole : 'member',
                permissions: projectGroup ? safeJsonParse(projectGroup.permissions, []) : []
              };
            });
            
            membershipInfo = {
              projectId: project.projectId,
              projectName: project.projectName,
              description: project.description,
              status: project.status,
              role: 'member',
              joinTime: Math.min(...userGroups.map(ug => ug.joinTime)),
              isActive: true,
              groups: groups
            };
          }
        } catch (error) {
          // Skip project if can't access project data
          logWrn('Cannot access project data', { projectId: project.projectId, error: error.message });
        }
      }
      
      if (membershipInfo) {
        userProjectMemberships.push(membershipInfo);
      }
    }
    
    // Sort by join time (most recent first)
    userProjectMemberships.sort((a, b) => b.joinTime - a.joinTime);
    
    return createSuccessResponse(userProjectMemberships);
    
  } catch (error) {
    logErr('Get user projects error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user projects');
  }
}

/**
 * Deactivate user account
 */
function deactivateUser(sessionId, reason = 'user_request') {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Update user status
    updateSheetRow(null, 'Users', 'userId', sessionResult.userId, {
      status: 'inactive',
      lastModified: getCurrentTimestamp()
    });
    
    // Log deactivation
    const logEntry = logOperation(
      sessionResult.userEmail,
      'user_deactivated',
      'user',
      sessionResult.userId,
      { reason: reason }
    );
    
    // Invalidate session
    invalidateSession(sessionResult.sessionId);
    
    return createSuccessResponse(null, 'User account deactivated successfully');
    
  } catch (error) {
    logErr('Deactivate user error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to deactivate user account');
  }
}

/**
 * Helper function to get user email by ID
 */
function getUserEmailById(userId) {
  try {
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userId === userId);
    return user ? user.userEmail : null;
  } catch (error) {
    logWrn('Get user email by ID error', { error: error.message });
    return null;
  }
}

/**
 * Update user avatar settings
 */
function updateUserAvatar(sessionId, avatarData) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Validate avatar data
    const allowedFields = ['avatarSeed', 'avatarStyle', 'avatarOptions'];
    const avatarUpdates = {};
    
    allowedFields.forEach(field => {
      if (avatarData.hasOwnProperty(field)) {
        if (field === 'avatarSeed') {
          avatarUpdates[field] = sanitizeString(avatarData[field], 50);
        } else if (field === 'avatarStyle') {
          const validStyles = ['avataaars', 'bottts', 'identicon', 'initials', 'personas'];
          if (validStyles.includes(avatarData[field])) {
            avatarUpdates[field] = avatarData[field];
          }
        } else if (field === 'avatarOptions') {
          if (typeof avatarData[field] === 'object') {
            avatarUpdates[field] = safeJsonStringify(avatarData[field]);
          }
        }
      }
    });

    if (Object.keys(avatarUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid avatar updates provided');
    }

    // Update user record
    updateSheetRow(null, 'Users', 'userId', sessionResult.userId, avatarUpdates);

    // Log avatar update
    logOperation(
      sessionResult.userEmail,
      'avatar_updated',
      'user',
      sessionResult.userId,
      { updatedFields: Object.keys(avatarUpdates) }
    );

    return createSuccessResponseWithSession(sessionId, null, 'Avatar updated successfully');

  } catch (error) {
    logErr('Update user avatar error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update avatar');
  }
}

/**
 * Generate random avatar seed
 */
function generateAvatarSeed(userEmail) {
  const timestamp = Date.now().toString();
  const emailHash = userEmail.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${Math.abs(emailHash)}_${timestamp.slice(-6)}`;
}

/**
 * Regenerate user avatar seed
 */
function regenerateAvatarSeed(sessionId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }

    // Generate new seed
    const newSeed = generateAvatarSeed(sessionResult.userEmail);

    // Update user record
    updateSheetRow(null, 'Users', 'userId', sessionResult.userId, {
      avatarSeed: newSeed
    });

    // Log operation
    logOperation(
      sessionResult.userEmail,
      'avatar_regenerated',
      'user',
      sessionResult.userId,
      { newSeed: newSeed }
    );

    return createSuccessResponseWithSession(sessionId, { avatarSeed: newSeed }, 'Avatar seed regenerated successfully');

  } catch (error) {
    logErr('Regenerate avatar seed error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to regenerate avatar seed');
  }
}

/**
 * Get user badges based on their roles
 */
function getUserBadges(userEmail) {
  try {
    const badges = [];

    // Check if user is system admin
    if (isSystemAdmin(userEmail)) {
      badges.push({
        type: 'admin',
        label: '系統管理員',
        color: '#e74c3c',
        icon: 'fas fa-crown'
      });
    }

    // Check if user is global PM
    if (isGlobalPM(userEmail)) {
      badges.push({
        type: 'pm',
        label: '總PM',
        color: '#f39c12',
        icon: 'fas fa-star'
      });
    }

    // Check if user is leader in any active projects
    const globalData = readGlobalData();
    let isLeader = false;

    for (const project of globalData.projects) {
      if (project.status === 'active') {
        try {
          const projectData = readProjectData(project.projectId);
          const userGroups = projectData.usergroups.filter(ug => 
            ug.userEmail === userEmail && ug.isActive && ug.role === 'leader'
          );
          
          if (userGroups.length > 0) {
            isLeader = true;
            break;
          }
        } catch (error) {
          // Skip project if can't access
          continue;
        }
      }
    }

    if (isLeader) {
      badges.push({
        type: 'leader',
        label: '組長',
        color: '#3498db',
        icon: 'fas fa-users'
      });
    }

    return badges;

  } catch (error) {
    logWrn('Get user badges error', { error: error.message });
    return [];
  }
}

/**
 * Helper function to get user's tag IDs for scope filtering
 */
function getUserTagIdsForUser(userEmail) {
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
 * Helper function to get user tags for display
 */
function getUserTagsForDisplay(userEmail) {
  try {
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    const tags = readFullSheet(globalDb, 'Tags') || [];
    
    return userTags
      .filter(ut => ut.userEmail === userEmail && ut.isActive)
      .map(ut => {
        const tag = tags.find(t => t.tagId === ut.tagId && t.isActive);
        return tag ? {
          tagId: tag.tagId,
          tagName: tag.tagName,
          tagColor: tag.tagColor,
        } : null;
      })
      .filter(tag => tag !== null);
  } catch (error) {
    logWrn('Failed to get user tags for display', { error: error.message });
    return [];
  }
}

/**
 * Handle getUserStats request from frontend (wrapper function)
 */
function handleGetUserStats(params) {
  try {
    const sessionId = params.sessionId;
    const targetUserId = params.targetUserId || null;
    return getUserStats(sessionId, targetUserId);
  } catch (error) {
    logErr('Handle get user stats error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user stats');
  }
}

/**
 * Get user statistics
 */
function getUserStats(sessionId, targetUserId = null) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    const userId = targetUserId || sessionResult.userId;
    const targetUserEmail = userId === sessionResult.userId ? 
      sessionResult.userEmail : 
      getUserEmailById(userId);
    
    if (!targetUserEmail) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Get user's project memberships
    const projectMembershipsResult = getUserProjects(sessionId, userId);
    if (!projectMembershipsResult.success) {
      return projectMembershipsResult;
    }
    
    const projectMemberships = projectMembershipsResult.data;
    
    // Calculate statistics
    const stats = {
      totalProjects: projectMemberships.length,
      activeProjects: projectMemberships.filter(p => p.status === 'active').length,
      completedProjects: projectMemberships.filter(p => p.status === 'completed').length,
      createdProjects: projectMemberships.filter(p => p.role === 'creator').length,
      memberProjects: projectMemberships.filter(p => p.role === 'member').length,
      totalGroups: projectMemberships.reduce((sum, p) => sum + p.groups.length, 0),
      totalSubmissions: 0 // This would require querying submissions across all projects
    };
    
    return createSuccessResponse(stats);
    
  } catch (error) {
    logErr('Get user stats error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user statistics');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registerUser,
    getUserProfile,
    updateUserProfile,
    searchUsers,
    getUsersBySharedTags,
    getUserProjects,
    deactivateUser,
    getUserStats,
    handleGetUserStats,
    getUserEmailById,
    updateUserAvatar,
    regenerateAvatarSeed,
    generateAvatarSeed,
    getUserBadges
  };
}