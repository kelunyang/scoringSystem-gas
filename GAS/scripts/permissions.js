/**
 * @fileoverview Permission management system
 * @module Permissions
 */

/**
 * Check if user has a specific global permission
 */
function hasGlobalPermission(userEmail, permission) {
  try {
    const globalData = readGlobalData();
    
    // Check if user is in any global group that has the required global permission
    const userGroups = globalData.globalusergroups?.filter(ug => 
      ug.userEmail === userEmail && ug.isActive
    ) || [];
    
    for (const userGroup of userGroups) {
      const group = globalData.globalgroups?.find(g => g.groupId === userGroup.groupId);
      if (group && group.globalPermissions) {
        const permissions = safeJsonParse(group.globalPermissions, []);
        if (permissions.includes(permission)) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Check global permission error:', error.message);
    return false;
  }
}

/**
 * Check if user is a Global PM (has create_project permission)
 * @deprecated Use hasTeacherPrivilege() for teacher voting functionality
 */
function isGlobalPM(userEmail) {
  // Changed to check teacher_privilege instead of create_project
  // This prevents system admins from automatically getting teacher voting rights
  return hasGlobalPermission(userEmail, 'teacher_privilege');
}

/**
 * Check if user has teacher privilege (can perform teacher voting)
 */
function hasTeacherPrivilege(userEmail) {
  return hasGlobalPermission(userEmail, 'teacher_privilege');
}

/**
 * Check if user is a System Admin (has admin permissions)
 */
function isSystemAdmin(userEmail) {
  return hasGlobalPermission(userEmail, 'system_admin');
}

/**
 * Get user's global permissions
 */
function getUserGlobalPermissions(userEmail) {
  try {
    log('🔍 獲取用戶全局權限調試信息', { userEmail: userEmail });
    
    const globalData = readGlobalData();
    const allPermissions = new Set();
    
    // Get all global groups user belongs to
    const userGroups = globalData.globalusergroups?.filter(ug => 
      ug.userEmail === userEmail && ug.isActive
    ) || [];
    
    log('用戶所屬全局組', { userGroups: userGroups });
    
    // Collect all permissions from all groups
    for (const userGroup of userGroups) {
      const group = globalData.globalgroups?.find(g => g.groupId === userGroup.groupId);
      if (group && group.globalPermissions) {
        const permissions = safeJsonParse(group.globalPermissions, []);
        log('組權限詳情', { 
          groupId: group.groupId, 
          groupName: group.groupName,
          permissions: permissions 
        });
        permissions.forEach(perm => allPermissions.add(perm));
      }
    }
    
    const finalPermissions = Array.from(allPermissions);
    log('最終用戶權限', { 
      userEmail: userEmail,
      permissions: finalPermissions,
      isSystemAdmin: finalPermissions.includes('system_admin')
    });
    
    return finalPermissions;
  } catch (error) {
    logErr('Get user global permissions error', error);
    return [];
  }
}

/**
 * Create default Global PM group if it doesn't exist
 */
function ensureGlobalPMGroup() {
  try {
    const globalData = readGlobalData();
    
    // Check if Global PM group already exists
    const existingGroup = globalData.globalgroups?.find(g => 
      g.groupName === '總PM群組' || g.groupId.startsWith('grp_global_pm')
    );
    
    if (existingGroup) {
      return existingGroup.groupId;
    }
    
    // Create Global PM group
    const groupId = generateIdWithType('group');
    const timestamp = getCurrentTimestamp();
    
    const pmGroup = {
      groupId: groupId,
      groupName: '總PM群組',
      groupDescription: '系統總PM群組，擁有建立專案和系統管理權限',
      isActive: true,
      allowJoin: false,
      createdBy: 'system',
      createdTime: timestamp,
      globalPermissions: safeJsonStringify([
        'create_project',
        'system_admin',
        'manage_users',
        'manage_groups',
        'generate_invites',
        'teacher_privilege'
      ])
    };
    
    // Add to global GlobalGroups sheet
    addRowToSheet(null, 'GlobalGroups', pmGroup);
    
    console.log('Created Global PM group: ' + groupId);
    return groupId;
    
  } catch (error) {
    console.error('Ensure Global PM group error:', error.message);
    throw error;
  }
}

/**
 * Add user to Global PM group
 */
function addUserToGlobalPMGroup(userEmail, addedBy) {
  try {
    // Ensure Global PM group exists
    const pmGroupId = ensureGlobalPMGroup();
    
    // Check if user is already in the group
    const globalData = readGlobalData();
    const existingMembership = globalData.globalusergroups?.find(ug =>
      ug.userEmail === userEmail && ug.groupId === pmGroupId && ug.isActive
    );
    
    if (existingMembership) {
      return createSuccessResponse(null, 'User is already in Global PM group');
    }
    
    // Add user to group
    const membershipId = generateIdWithType('membership');
    const timestamp = getCurrentTimestamp();
    
    const membership = {
      membershipId: membershipId,
      groupId: pmGroupId,
      userEmail: userEmail,
      role: 'admin',
      isActive: true,
      joinTime: timestamp,
      addedBy: addedBy
    };
    
    // Add to global GlobalUserGroups sheet
    addRowToSheet(null, 'GlobalUserGroups', membership);
    
    // Log the action
    logOperation(
      addedBy,
      'user_added_to_global_pm',
      'user',
      userEmail,
      { groupId: pmGroupId }
    );
    
    return createSuccessResponse(null, 'User added to Global PM group successfully');
    
  } catch (error) {
    console.error('Add user to Global PM group error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to add user to Global PM group');
  }
}

/**
 * Remove user from Global PM group
 */
function removeUserFromGlobalPMGroup(userEmail, removedBy) {
  try {
    const globalData = readGlobalData();
    
    // Find Global PM group
    const pmGroup = globalData.globalgroups?.find(g => 
      g.groupName === '總PM群組' || g.groupId.startsWith('grp_global_pm')
    );
    
    if (!pmGroup) {
      return createErrorResponse('GROUP_NOT_FOUND', 'Global PM group not found');
    }
    
    // Find user's membership
    const membership = globalData.globalusergroups?.find(ug =>
      ug.userEmail === userEmail && ug.groupId === pmGroup.groupId && ug.isActive
    );
    
    if (!membership) {
      return createErrorResponse('MEMBERSHIP_NOT_FOUND', 'User is not in Global PM group');
    }
    
    // Deactivate membership
    updateSheetRow(null, 'GlobalUserGroups', 'membershipId', membership.membershipId, {
      isActive: false,
      removedBy: removedBy,
      removedTime: getCurrentTimestamp()
    });
    
    // Log the action
    logOperation(
      removedBy,
      'user_removed_from_global_pm',
      'user',
      userEmail,
      { groupId: pmGroup.groupId }
    );
    
    return createSuccessResponse(null, 'User removed from Global PM group successfully');
    
  } catch (error) {
    console.error('Remove user from Global PM group error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to remove user from Global PM group');
  }
}

/**
 * List all Global PMs
 */
function getGlobalPMs() {
  try {
    const globalData = readGlobalData();
    
    // Find Global PM group
    const pmGroup = globalData.globalgroups?.find(g => 
      g.groupName === '總PM群組' || g.groupId.startsWith('grp_global_pm')
    );
    
    if (!pmGroup) {
      return createSuccessResponse([]);
    }
    
    // Get all active members of the PM group
    const pmMembers = globalData.globalusergroups?.filter(ug =>
      ug.groupId === pmGroup.groupId && ug.isActive
    ) || [];
    
    // Get user details
    const pmUsers = pmMembers.map(membership => {
      const user = globalData.users.find(u => u.userEmail === membership.userEmail);
      return {
        userEmail: membership.userEmail,
        username: user ? user.username : null,
        displayName: user ? user.displayName : null,
        joinTime: membership.joinTime,
        role: membership.role
      };
    });
    
    return createSuccessResponse(pmUsers);
    
  } catch (error) {
    console.error('Get Global PMs error:', error.message);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get Global PMs');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasGlobalPermission,
    isGlobalPM,
    hasTeacherPrivilege,
    isSystemAdmin,
    getUserGlobalPermissions,
    ensureGlobalPMGroup,
    addUserToGlobalPMGroup,
    removeUserFromGlobalPMGroup,
    getGlobalPMs
  };
}