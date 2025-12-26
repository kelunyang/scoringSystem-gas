/**
 * @fileoverview Unified permission checking utilities
 * @module UnifiedPermissions
 */

// ============ PERMISSION VALIDATION ============

/**
 * Unified permission validation with consistent error handling
 * @param {string} userEmail - User email to check
 * @param {string} requiredPermission - Permission name required
 * @param {Object} context - Additional context (projectId, etc.)
 * @returns {Object} { valid: boolean, error?: string, errorCode?: string }
 */
function validatePermission(userEmail, requiredPermission, context = {}) {
  if (!userEmail) {
    return { 
      valid: false, 
      error: 'User email is required', 
      errorCode: 'INVALID_USER' 
    };
  }

  switch (requiredPermission) {
    case 'teacher_privilege':
      if (!hasTeacherPrivilege(userEmail)) {
        return { 
          valid: false, 
          error: 'Teacher privilege required', 
          errorCode: 'TEACHER_PRIVILEGE_REQUIRED' 
        };
      }
      break;

    case 'system_admin':
      if (!isSystemAdmin(userEmail)) {
        return { 
          valid: false, 
          error: 'System admin permission required', 
          errorCode: 'ADMIN_REQUIRED' 
        };
      }
      break;

    case 'global_pm':
      if (!isGlobalPM(userEmail)) {
        return { 
          valid: false, 
          error: 'Global PM permission required', 
          errorCode: 'GLOBAL_PM_REQUIRED' 
        };
      }
      break;

    case 'project_member':
      if (!context.projectData || !isProjectMember(userEmail, context.projectData)) {
        return { 
          valid: false, 
          error: 'Project member permission required', 
          errorCode: 'PROJECT_MEMBER_REQUIRED' 
        };
      }
      break;

    default:
      return { 
        valid: false, 
        error: `Unknown permission: ${requiredPermission}`, 
        errorCode: 'UNKNOWN_PERMISSION' 
      };
  }

  return { valid: true };
}

/**
 * Check if user is a project member
 * @param {string} userEmail - User email
 * @param {Object} projectData - Project data containing usergroups
 * @returns {boolean} True if user is active project member
 */
function isProjectMember(userEmail, projectData) {
  if (!projectData || !projectData.usergroups) {
    return false;
  }
  
  return projectData.usergroups.some(ug => 
    ug.userEmail === userEmail && ug.isActive
  );
}

/**
 * Check if user has access to view project
 * @param {string} userEmail - User email
 * @param {Object} projectData - Project data
 * @returns {boolean} True if user can view project
 */
function hasProjectViewAccess(userEmail, projectData) {
  // Check if user is an active project member
  if (isProjectMember(userEmail, projectData)) {
    return true;
  }
  
  // Check if user has system-wide permissions
  if (isSystemAdmin(userEmail) || isGlobalPM(userEmail)) {
    return true;
  }
  
  // Check global permissions
  const globalPermissions = getUserGlobalPermissions(userEmail);
  if (globalPermissions.some(p => ['create_project', 'manage_all_projects'].includes(p))) {
    return true;
  }
  
  // Check project-specific permissions
  const projectPermissions = getUserPermissions(
    userEmail, 
    projectData.projectgroups, 
    projectData.usergroups
  );
  
  return projectPermissions.includes('view');
}

/**
 * Validate project access with specific permission
 * @param {string} sessionId - Session ID
 * @param {string} projectId - Project ID
 * @param {string} requiredPermission - Required permission (view, manage, submit, etc.)
 * @returns {Object} { valid: boolean, sessionResult?, projectData?, error?, errorCode? }
 */
function validateProjectAccess(sessionId, projectId, requiredPermission = 'view') {
  // First validate session
  const sessionResult = validateSession(sessionId);
  if (!sessionResult) {
    return { 
      valid: false, 
      error: 'Session expired or invalid', 
      errorCode: 'SESSION_INVALID' 
    };
  }
  
  // Validate project ID format
  if (!projectId || typeof projectId !== 'string' || !projectId.startsWith('proj_')) {
    return { 
      valid: false, 
      error: 'Invalid project ID format', 
      errorCode: 'INVALID_PROJECT_ID' 
    };
  }
  
  try {
    // Load project data
    const projectData = readProjectData(projectId);
    
    // Check global data to see if project exists
    const globalData = readGlobalData();
    const projectExists = globalData.projects?.some(p => p.projectId === projectId);
    if (!projectExists) {
      return { 
        valid: false, 
        error: 'Project not found', 
        errorCode: 'PROJECT_NOT_FOUND' 
      };
    }
    
    // Check access based on required permission
    const userEmail = sessionResult.userEmail;
    let hasAccess = false;
    
    switch (requiredPermission) {
      case 'view':
        hasAccess = hasProjectViewAccess(userEmail, projectData);
        break;
        
      case 'manage':
        hasAccess = getUserPermissions(userEmail, projectData.projectgroups, projectData.usergroups).includes('manage') ||
                   isSystemAdmin(userEmail) || 
                   isGlobalPM(userEmail);
        break;
        
      case 'submit':
        hasAccess = getUserPermissions(userEmail, projectData.projectgroups, projectData.usergroups).includes('submit') ||
                   isProjectMember(userEmail, projectData) ||
                   hasTeacherPrivilege(userEmail);
        break;
        
      default:
        // For any other permission, check project permissions array
        hasAccess = getUserPermissions(userEmail, projectData.projectgroups, projectData.usergroups).includes(requiredPermission) ||
                   isSystemAdmin(userEmail) || 
                   isGlobalPM(userEmail);
    }
    
    if (!hasAccess) {
      return { 
        valid: false, 
        error: `${requiredPermission} permission required`, 
        errorCode: 'ACCESS_DENIED' 
      };
    }
    
    return { valid: true, sessionResult, projectData };
    
  } catch (error) {
    console.error('Error validating project access:', error);
    return { 
      valid: false, 
      error: 'Failed to validate project access', 
      errorCode: 'VALIDATION_ERROR' 
    };
  }
}

/**
 * Validate session and required permission in one call
 * @param {string} sessionId - Session ID
 * @param {string} requiredPermission - Required permission
 * @param {Object} context - Additional context
 * @returns {Object} { valid: boolean, sessionResult?, error?, errorCode? }
 */
function validateSessionWithPermission(sessionId, requiredPermission, context = {}) {
  // First validate session
  const sessionResult = validateSession(sessionId);
  if (!sessionResult) {
    return { 
      valid: false, 
      error: 'Session expired or invalid', 
      errorCode: 'SESSION_INVALID' 
    };
  }

  // Then validate permission
  const permissionResult = validatePermission(
    sessionResult.userEmail, 
    requiredPermission, 
    context
  );
  
  if (!permissionResult.valid) {
    return permissionResult;
  }

  return { valid: true, sessionResult };
}

/**
 * Get user's permissions for a project
 * @param {string} userEmail - User email
 * @param {Array} projectGroups - Project groups
 * @param {Array} userGroups - User group memberships
 * @returns {Array} Array of permission strings
 */
function getProjectUserPermissions(userEmail, projectGroups, userGroups) {
  const userGroup = userGroups.find(ug => 
    ug.userEmail === userEmail && ug.isActive
  );
  
  if (!userGroup) {
    return [];
  }

  const group = projectGroups.find(g => 
    g.groupId === userGroup.groupId && g.status === 'active'
  );
  
  if (!group || !group.permissions) {
    return [];
  }

  try {
    const permissions = typeof group.permissions === 'string' 
      ? JSON.parse(group.permissions) 
      : group.permissions;
    
    return Array.isArray(permissions) ? permissions : [];
  } catch (e) {
    console.warn('Failed to parse group permissions:', e);
    return [];
  }
}

/**
 * Check multiple permissions at once
 * @param {string} userEmail - User email
 * @param {Array} requiredPermissions - Array of required permissions
 * @param {Object} context - Additional context
 * @returns {Object} { valid: boolean, missingPermissions?: Array, error?: string }
 */
function validateMultiplePermissions(userEmail, requiredPermissions, context = {}) {
  const missingPermissions = [];
  
  for (const permission of requiredPermissions) {
    const result = validatePermission(userEmail, permission, context);
    if (!result.valid) {
      missingPermissions.push(permission);
    }
  }
  
  if (missingPermissions.length > 0) {
    return { 
      valid: false, 
      missingPermissions,
      error: `Missing permissions: ${missingPermissions.join(', ')}`,
      errorCode: 'MISSING_PERMISSIONS'
    };
  }
  
  return { valid: true };
}

// ============ PERMISSION DECORATORS ============

/**
 * Create a permission-protected version of a function
 * @param {Function} fn - Function to protect
 * @param {string} requiredPermission - Required permission
 * @returns {Function} Protected function
 */
function requiresPermission(fn, requiredPermission) {
  return function(sessionId, ...args) {
    const validationResult = validateSessionWithPermission(sessionId, requiredPermission);
    if (!validationResult.valid) {
      return createErrorResponse(validationResult.errorCode, validationResult.error);
    }
    
    // Call original function with session result
    return fn.call(this, sessionId, validationResult.sessionResult, ...args);
  };
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validatePermission,
    isProjectMember,
    hasProjectViewAccess,
    validateProjectAccess,
    validateSessionWithPermission,
    getProjectUserPermissions,
    validateMultiplePermissions,
    requiresPermission
  };
}