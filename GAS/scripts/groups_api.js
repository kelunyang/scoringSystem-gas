/**
 * @fileoverview Group management API endpoints
 * @module GroupsAPI
 */

/**
 * Create a new group in a project
 */
function createGroup(sessionId, projectId, groupData) {
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
    
    // Validate required fields
    const requiredFields = ['groupName'];
    const missingFields = validateRequiredFields(groupData, requiredFields);
    if (missingFields.length > 0) {
      return createErrorResponse('INVALID_INPUT', 'Missing required fields: ' + missingFields.join(', '));
    }
    
    // Check project access
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    if (!permissions.includes('manage')) {
      // Check if user is project creator
      const globalData = readGlobalData();
      const project = globalData.projects.find(p => p.projectId === projectId);
      
      if (!project || project.createdBy !== sessionResult.userEmail) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to create groups');
      }
    }
    
    // Sanitize input
    groupData.groupName = sanitizeString(groupData.groupName, 50);
    groupData.description = sanitizeString(groupData.description || '', 200);
    
    // Validate group name length
    const maxGroupNameLength = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_GROUP_NAME_LENGTH') || '50');
    if (groupData.groupName.length > maxGroupNameLength) {
      return createErrorResponse('INVALID_INPUT', `Group name too long (max ${maxGroupNameLength} characters)`);
    }
    
    // Check if group name already exists in project
    const existingGroup = projectData.groups.find(g => 
      g.groupName.toLowerCase() === groupData.groupName.toLowerCase() && g.status === 'active'
    );
    
    if (existingGroup) {
      return createErrorResponse('GROUP_EXISTS', 'Group name already exists in this project');
    }
    
    // Check group limit per project
    const maxGroupsPerProject = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_GROUPS_PER_PROJECT') || '20');
    const activeGroups = projectData.groups.filter(g => g.status === 'active');
    
    if (activeGroups.length >= maxGroupsPerProject) {
      return createErrorResponse('LIMIT_EXCEEDED', `Maximum groups per project limit (${maxGroupsPerProject}) reached`);
    }
    
    // Create group record
    const groupId = generateIdWithType('group');
    const timestamp = getCurrentTimestamp();
    
    const groupRecord = {
      groupId: groupId,
      groupName: groupData.groupName,
      description: groupData.description,
      createdBy: sessionResult.userEmail,
      createdTime: timestamp,
      status: 'active',
      allowChange: groupData.allowChange !== false // Default to true
    };
    
    // Add group to project database
    addRowToSheet(projectId, 'Groups', groupRecord);

    // Log group creation event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'group_created',
      'group',
      groupId,
      { groupName: groupData.groupName }
    );
    
    // Send notifications to all project participants about new group
    sendGroupCreatedNotifications(projectId, groupId, groupData.groupName, sessionResult.userEmail);
    
    return createSuccessResponse({
      groupId: groupId,
      groupName: groupData.groupName,
      description: groupData.description,
      createdTime: timestamp,
      status: 'active',
      allowChange: groupRecord.allowChange
    }, 'Group created successfully');
    
  } catch (error) {
    logErr('Create group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to create group');
  }
}

/**
 * Get group details
 */
function getGroup(sessionId, projectId, groupId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    // Check project access
    const projectData = readProjectData(projectId);
    
    // Check if user is system admin or has global group management permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalGroupManage = globalPermissions.includes('manage_groups');
    
    if (!isAdmin && !hasGlobalGroupManage) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      // Check if user is a member (including leader) of this specific group
      const isGroupMember = projectData.usergroups.some(ug => 
        ug.groupId === groupId && 
        ug.userEmail === sessionResult.userEmail && 
        ug.isActive
      );
      
      if (!permissions.includes('view') && !isGroupMember) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view groups');
      }
    }
    
    // Get group
    const group = projectData.groups.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Group not found');
    }
    
    // Get group members
    const members = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive)
      .map(ug => ({
        membershipId: ug.membershipId,
        userEmail: ug.userEmail,
        role: ug.role,
        joinTime: ug.joinTime
      }));
    
    // Get group project role and permissions
    const projectGroup = projectData.projectgroups.find(pg => pg.groupId === groupId);
    
    return createSuccessResponse({
      groupId: group.groupId,
      groupName: group.groupName,
      description: group.description,
      status: group.status,
      allowChange: group.allowChange,
      createdBy: group.createdBy,
      createdTime: group.createdTime,
      memberCount: members.length,
      members: members,
      projectRole: projectGroup ? projectGroup.groupRole : null,
      permissions: projectGroup ? safeJsonParse(projectGroup.permissions, []) : []
    });
    
  } catch (error) {
    logErr('Get group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get group');
  }
}

/**
 * Update group details
 */
function updateGroup(sessionId, projectId, groupId, updates) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    
    // Check if user is system admin or has global group management permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalGroupManage = globalPermissions.includes('manage_groups');
    
    if (!isAdmin && !hasGlobalGroupManage) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to update groups');
      }
    }
    
    // Get group
    const group = projectData.groups.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Group not found');
    }
    
    // Validate and sanitize updates
    const allowedFields = ['groupName', 'description', 'allowChange'];
    const groupUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates.hasOwnProperty(field)) {
        if (field === 'groupName') {
          const newName = sanitizeString(updates[field], 50);
          // Check if new name conflicts with existing groups
          const existingGroup = projectData.groups.find(g => 
            g.groupId !== groupId &&
            g.groupName.toLowerCase() === newName.toLowerCase() && 
            g.status === 'active'
          );
          if (existingGroup) {
            return createErrorResponse('GROUP_EXISTS', 'Group name already exists in this project');
          }
          groupUpdates[field] = newName;
        } else if (field === 'description') {
          groupUpdates[field] = sanitizeString(updates[field], 200);
        } else if (field === 'allowChange') {
          groupUpdates[field] = Boolean(updates[field]);
        }
      }
    });
    
    if (Object.keys(groupUpdates).length === 0) {
      return createErrorResponse('INVALID_INPUT', 'No valid updates provided');
    }
    
    // Update group
    updateSheetRow(projectId, 'Groups', 'groupId', groupId, groupUpdates);
    
    // Log update
    const logEntry = logOperation(
      sessionResult.userEmail,
      'group_updated',
      'group',
      groupId,
      { 
        projectId: projectId,
        updatedFields: Object.keys(groupUpdates)
      }
    );
    
    // Send notifications to all project participants about group updates
    sendGroupUpdatedNotifications(projectId, groupId, group.groupName, Object.keys(groupUpdates), sessionResult.userEmail);
    
    return createSuccessResponse(null, 'Group updated successfully');
    
  } catch (error) {
    logErr('Update group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to update group');
  }
}

/**
 * Delete group (mark as inactive)
 */
function deleteGroup(sessionId, projectId, groupId) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate IDs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    const permissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    if (!permissions.includes('manage')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to delete groups');
    }
    
    // Get group
    const group = projectData.groups.find(g => g.groupId === groupId);
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Group not found');
    }
    
    // Check if group has active members
    const activeMembers = projectData.usergroups.filter(ug => 
      ug.groupId === groupId && ug.isActive
    );
    
    if (activeMembers.length > 0) {
      return createErrorResponse('GROUP_NOT_EMPTY', 'Cannot delete group with active members');
    }
    
    // Check if group has submissions or other dependencies
    const groupSubmissions = projectData.submissions.filter(s => s.groupId === groupId);
    if (groupSubmissions.length > 0) {
      return createErrorResponse('GROUP_HAS_DATA', 'Cannot delete group with existing submissions');
    }
    
    // Mark group as inactive instead of deleting
    updateSheetRow(projectId, 'Groups', 'groupId', groupId, {
      status: 'inactive'
    });

    // Log group deletion event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'group_deleted',
      'group',
      groupId,
      { groupName: group.groupName }
    );
    
    return createSuccessResponse(null, 'Group deleted successfully');
    
  } catch (error) {
    logErr('Delete group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to delete group');
  }
}

/**
 * Add user to group
 */
function addUserToGroup(sessionId, projectId, groupId, userEmail, role = 'member') {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate inputs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    if (!validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    if (!['member', 'leader'].includes(role)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid role. Must be "member" or "leader"');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    
    // Check if user is system admin or has global group management permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalGroupManage = globalPermissions.includes('manage_groups');
    
    if (!isAdmin && !hasGlobalGroupManage) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      if (!permissions.includes('manage')) {
        // Allow group leaders to add members to their own group
        const isGroupLeader = projectData.usergroups.some(ug => 
          ug.groupId === groupId && 
          ug.userEmail === sessionResult.userEmail && 
          ug.role === 'leader' && 
          ug.isActive
        );
        
        if (!isGroupLeader) {
          return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to add users to groups');
        }
      }
    }
    
    // Get group
    const group = projectData.groups.find(g => g.groupId === groupId && g.status === 'active');
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }
    
    // Check if group allows changes
    if (!group.allowChange) {
      return createErrorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }
    
    // Check if user exists
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === userEmail && u.status === 'active');
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'Active user not found');
    }
    
    // Check tag scope - user must have exactly the same tag set as current user (or be admin)
    if (!isSystemAdmin(sessionResult.userEmail)) {
      const currentUserTags = getUserTagIdsFromGroups(sessionResult.userEmail);
      const targetUserTags = getUserTagIdsFromGroups(userEmail);
      
      // Check if users have exactly the same tag set
      const hasSameTagSet = arraysEqual(currentUserTags.sort(), targetUserTags.sort());
      
      if (!hasSameTagSet) {
        return createErrorResponse('ACCESS_DENIED', 'Cannot add user from different tag scope');
      }
    }
    
    // Check if user is already in the group
    const existingMembership = projectData.usergroups.find(ug => 
      ug.groupId === groupId && ug.userEmail === userEmail && ug.isActive
    );
    
    if (existingMembership) {
      return createErrorResponse('USER_ALREADY_IN_GROUP', 'User is already a member of this group');
    }
    
    // Check if user is already in any other group in this project
    const existingInOtherGroup = projectData.usergroups.find(ug => 
      ug.groupId !== groupId && ug.userEmail === userEmail && ug.isActive
    );
    
    if (existingInOtherGroup) {
      // Get the other group name for a better error message
      const otherGroup = projectData.groups.find(g => g.groupId === existingInOtherGroup.groupId);
      const otherGroupName = otherGroup ? otherGroup.groupName : 'another group';
      return createErrorResponse('USER_ALREADY_IN_PROJECT_GROUP', `User is already a member of ${otherGroupName} in this project`);
    }
    
    // Check group member limit
    const maxMembersPerGroup = parseInt(PropertiesService.getScriptProperties().getProperty('MAX_MEMBERS_PER_GROUP') || '10');
    const currentMembers = projectData.usergroups.filter(ug => 
      ug.groupId === groupId && ug.isActive
    );
    
    if (currentMembers.length >= maxMembersPerGroup) {
      return createErrorResponse('LIMIT_EXCEEDED', `Maximum members per group limit (${maxMembersPerGroup}) reached`);
    }
    
    // Create membership record
    const membershipId = generateIdWithType('member');
    const timestamp = getCurrentTimestamp();
    
    const membershipRecord = {
      membershipId: membershipId,
      groupId: groupId,
      userEmail: userEmail,
      role: role,
      joinTime: timestamp,
      isActive: true
    };
    
    // Add membership
    addRowToSheet(projectId, 'UserGroups', membershipRecord);

    // Log member addition event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'member_added',
      'group',
      groupId,
      {
        memberEmail: userEmail,
        role: role,
        groupName: group.groupName
      }
    );

    // If adding a leader, log an additional event for leader assignment by admin
    if (role === 'leader') {
      logOperation(
        projectId,
        sessionResult.userEmail,
        'leader_assigned_by_admin',
        'group',
        groupId,
        {
          leaderEmail: userEmail,
          groupName: group.groupName
        }
      );
    }

    return createSuccessResponse({
      membershipId: membershipId,
      groupId: groupId,
      userEmail: userEmail,
      role: role,
      joinTime: timestamp
    }, 'User added to group successfully');
    
  } catch (error) {
    logErr('Add user to group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to add user to group');
  }
}

/**
 * Remove user from group
 */
function removeUserFromGroup(sessionId, projectId, groupId, userEmail) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate inputs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    if (!validateEmail(userEmail)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid email format');
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    
    // Check if user is system admin or has global group management permissions
    const isAdmin = isSystemAdmin(sessionResult.userEmail);
    const globalPermissions = getUserGlobalPermissions(sessionResult.userEmail);
    const hasGlobalGroupManage = globalPermissions.includes('manage_groups');
    
    let canManage = false;
    let isGroupLeader = false;
    
    if (isAdmin || hasGlobalGroupManage) {
      canManage = true;
    } else {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      canManage = permissions.includes('manage');
      isGroupLeader = projectData.usergroups.some(ug => 
        ug.groupId === groupId && 
        ug.userEmail === sessionResult.userEmail && 
        ug.role === 'leader' && 
        ug.isActive
      );
    }
    
    const isSelfRemoval = userEmail === sessionResult.userEmail;
    
    if (!canManage && !isGroupLeader && !isSelfRemoval) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to remove users from groups');
    }
    
    // Get group
    const group = projectData.groups.find(g => g.groupId === groupId && g.status === 'active');
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }
    
    // Check if group allows changes (except for self-removal)
    if (!group.allowChange && !isSelfRemoval) {
      return createErrorResponse('GROUP_LOCKED', 'Group membership changes are not allowed');
    }
    
    // Find membership
    const membership = projectData.usergroups.find(ug => 
      ug.groupId === groupId && ug.userEmail === userEmail && ug.isActive
    );
    
    if (!membership) {
      return createErrorResponse('USER_NOT_IN_GROUP', 'User is not a member of this group');
    }
    
    // Mark membership as inactive
    updateSheetRow(projectId, 'UserGroups', 'membershipId', membership.membershipId, {
      isActive: false
    });

    // Log member removal event
    logOperation(
      projectId,
      sessionResult.userEmail,
      'member_removed',
      'group',
      groupId,
      {
        memberEmail: userEmail,
        removalType: isSelfRemoval ? 'self' : 'by_manager',
        groupName: group.groupName
      }
    );
    
    return createSuccessResponseWithSession(sessionId, null, 'User removed from group successfully');
    
  } catch (error) {
    logErr('Remove user from group error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove user from group');
  }
}

/**
 * List groups in project
 */
function listProjectGroups(sessionId, projectId, includeInactive = false) {
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
    
    // Check permissions - system admin, global PM, or project member can view groups
    const projectData = readProjectData(projectId);
    const isAdmin = isSystemAdmin(sessionResult.userEmail) || isGlobalPM(sessionResult.userEmail);
    
    if (!isAdmin) {
      const permissions = getUserPermissions(
        sessionResult.userEmail,
        projectData.projectgroups,
        projectData.usergroups
      );
      
      // Check if user is a member of any group in this project
      const isProjectMember = projectData.usergroups.some(ug => 
        ug.userEmail === sessionResult.userEmail && ug.isActive
      );
      
      if (!permissions.includes('view') && !isProjectMember) {
        return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to view groups');
      }
    }
    
    // Get groups
    let groups = projectData.groups;
    if (!includeInactive) {
      groups = groups.filter(g => g.status === 'active');
    }
    
    // Add member counts and project roles
    const groupsWithDetails = groups.map(group => {
      const members = projectData.usergroups.filter(ug => 
        ug.groupId === group.groupId && ug.isActive
      );
      
      const projectGroup = projectData.projectgroups.find(pg => pg.groupId === group.groupId);
      
      // Check if current user is a leader of this group or has admin permissions
      const isGroupLeader = members.some(m => 
        m.userEmail === sessionResult.userEmail && m.role === 'leader'
      );
      const isAdmin = isSystemAdmin(sessionResult.userEmail) || isGlobalPM(sessionResult.userEmail);
      
      // Include member details if user is group leader or admin
      const memberDetails = (isGroupLeader || isAdmin) ? members.map(ug => ({
        membershipId: ug.membershipId,
        userEmail: ug.userEmail,
        role: ug.role,
        joinTime: ug.joinTime
      })) : [];
      
      return {
        groupId: group.groupId,
        groupName: group.groupName,
        description: group.description,
        status: group.status,
        allowChange: group.allowChange,
        createdBy: group.createdBy,
        createdTime: group.createdTime,
        memberCount: members.length,
        members: memberDetails, // Include member details for leaders/admins
        projectRole: projectGroup ? projectGroup.groupRole : null,
        permissions: projectGroup ? safeJsonParse(projectGroup.permissions, []) : []
      };
    });
    
    // Sort by creation time
    groupsWithDetails.sort((a, b) => a.createdTime - b.createdTime);
    
    return createSuccessResponse(groupsWithDetails);
    
  } catch (error) {
    logErr('List project groups error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to list project groups');
  }
}

/**
 * Set group project role and permissions
 */
function setGroupRole(sessionId, projectId, groupId, groupRole, permissions = []) {
  try {
    // Validate session
    const sessionResult = validateSession(sessionId);
    if (!sessionResult) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate inputs
    if (!validateProjectId(projectId) || !validateGroupId(groupId)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid project or group ID format');
    }
    
    const validRoles = ['pm', 'deliverable_team', 'reviewer', 'observer'];
    if (!validRoles.includes(groupRole)) {
      return createErrorResponse('INVALID_INPUT', 'Invalid group role. Must be one of: ' + validRoles.join(', '));
    }
    
    const validPermissions = ['submit', 'vote', 'rank', 'comment', 'manage', 'view'];
    if (!Array.isArray(permissions) || !permissions.every(p => validPermissions.includes(p))) {
      return createErrorResponse('INVALID_INPUT', 'Invalid permissions. Must be array of: ' + validPermissions.join(', '));
    }
    
    // Check permissions
    const projectData = readProjectData(projectId);
    const userPermissions = getUserPermissions(
      sessionResult.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    if (!userPermissions.includes('manage')) {
      return createErrorResponse('ACCESS_DENIED', 'Insufficient permissions to set group roles');
    }
    
    // Check if group exists
    const group = projectData.groups.find(g => g.groupId === groupId && g.status === 'active');
    if (!group) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Active group not found');
    }
    
    // Check if project group mapping exists
    const existingMapping = projectData.projectgroups.find(pg => pg.groupId === groupId);
    const timestamp = getCurrentTimestamp();
    
    if (existingMapping) {
      // Update existing mapping
      updateSheetRow(projectId, 'ProjectGroups', 'mappingId', existingMapping.mappingId, {
        groupRole: groupRole,
        permissions: safeJsonStringify(permissions),
        assignedTime: timestamp
      });
    } else {
      // Create new mapping
      const mappingId = generateIdWithType('mapping');
      const mappingRecord = {
        mappingId: mappingId,
        groupId: groupId,
        groupRole: groupRole,
        permissions: safeJsonStringify(permissions),
        assignedTime: timestamp
      };
      
      addRowToSheet(projectId, 'ProjectGroups', mappingRecord);
    }
    
    // Log role assignment
    const logEntry = logOperation(
      sessionResult.userEmail,
      'group_role_set',
      'group',
      groupId,
      { 
        projectId: projectId,
        groupRole: groupRole,
        permissions: permissions
      }
    );
    
    return createSuccessResponse({
      groupId: groupId,
      groupRole: groupRole,
      permissions: permissions,
      assignedTime: timestamp
    }, 'Group role set successfully');
    
  } catch (error) {
    logErr('Set group role error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to set group role');
  }
}

/**
 * Helper function to get user's tag IDs for scope filtering in groups
 */
function getUserTagIdsFromGroups(userEmail) {
  try {
    const globalDb = getGlobalWorkbook();
    const userTags = readFullSheet(globalDb, 'UserTags') || [];
    return userTags
      .filter(ut => ut.userEmail === userEmail && ut.isActive)
      .map(ut => ut.tagId);
  } catch (error) {
    logWrn('Failed to get user tags for groups', { error: error.message });
    return [];
  }
}

/**
 * Send notifications when a new group is created
 */
function sendGroupCreatedNotifications(projectId, groupId, groupName, creatorEmail) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get all project participants except the creator
    const participants = getAllProjectParticipants(projectId);
    
    participants.forEach(participant => {
      // Skip the creator
      if (participant.userEmail === creatorEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'group_created',
        title: '新群組建立',
        content: `${projectName} 專案建立了新群組「${groupName}」`,
        projectId: projectId,
        relatedEntityId: groupId,
        metadata: {
          projectName: projectName,
          groupName: groupName,
          creatorEmail: creatorEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send group created notifications error', error);
  }
}

/**
 * Send notifications when a group is updated
 */
function sendGroupUpdatedNotifications(projectId, groupId, groupName, updatedFields, updaterEmail) {
  try {
    const globalData = readGlobalData();
    
    // Get project name
    const project = globalData.projects.find(p => p.projectId === projectId);
    const projectName = project ? project.projectName : '未知專案';
    
    // Get all project participants except the updater
    const participants = getAllProjectParticipants(projectId);
    
    // Generate appropriate notification content based on updated fields
    let content = `${projectName} 專案的群組「${groupName}」資訊已更新`;
    if (updatedFields.includes('groupName')) {
      content += '，群組名稱已變更';
    }
    if (updatedFields.includes('description')) {
      content += '，群組描述已更新';
    }
    if (updatedFields.includes('allowChange')) {
      content += '，群組設定已變更';
    }
    
    participants.forEach(participant => {
      // Skip the updater
      if (participant.userEmail === updaterEmail) return;
      
      createNotification({
        targetUserEmail: participant.userEmail,
        type: 'group_updated',
        title: '群組資訊更新',
        content: content,
        projectId: projectId,
        relatedEntityId: groupId,
        metadata: {
          projectName: projectName,
          groupName: groupName,
          updatedFields: updatedFields,
          updaterEmail: updaterEmail
        }
      });
    });
    
  } catch (error) {
    logErr('Send group updated notifications error', error);
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createGroup,
    getGroup,
    updateGroup,
    deleteGroup,
    addUserToGroup,
    removeUserFromGroup,
    listProjectGroups,
    setGroupRole,
    getUserTagIdsFromGroups
  };
}