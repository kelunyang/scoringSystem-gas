/**
 * @fileoverview Authentication system for username/password based login
 * @module Auth
 */

// Session cache for performance
const sessionCache = new Map();

/**
 * Get session cache timeout from PropertiesService
 */
function getSessionCacheTimeout() {
  try {
    const propValue = PropertiesService.getScriptProperties().getProperty('SESSION_CACHE_TIMEOUT');
    const finalValue = parseInt(propValue || '3600000'); // Default 1 hour
    log('getSessionCacheTimeout: Final parsed value', { finalValue: finalValue });
    return finalValue;
  } catch (error) {
    log('getSessionCacheTimeout: Error', { error: error.message });
    return 3600000; // Default 1 hour
  }
}

/**
 * Get session timeout from system configuration
 */
function getSessionTimeout() {
  try {
    // Try to get from SystemConfigs first
    const systemConfig = getSystemConfig('session_timeout');
    log('getSessionTimeout: SystemConfig value', { systemConfig: systemConfig, type: typeof systemConfig });
    // Only use systemConfig if it's a valid number or string that can be parsed
    if (systemConfig && typeof systemConfig === 'string' && !isNaN(parseInt(systemConfig))) {
      const parsed = parseInt(systemConfig);
      log('getSessionTimeout: Parsed SystemConfig', { parsed: parsed });
      return parsed;
    } else if (systemConfig && typeof systemConfig === 'number' && !isNaN(systemConfig)) {
      log('getSessionTimeout: SystemConfig is number', { value: systemConfig });
      return systemConfig;
    } else {
      log('getSessionTimeout: SystemConfig invalid, falling back to PropertiesService');
    }
  } catch (error) {
    log('getSessionTimeout: SystemConfig error', { error: error.message });
  }
  
  // Fallback to PropertiesService or default value
  const propValue = PropertiesService.getScriptProperties().getProperty('SESSION_TIMEOUT');
  log('getSessionTimeout: PropertiesService value', { propValue: propValue });
  const finalValue = parseInt(propValue || '86400000');
  log('getSessionTimeout: Final parsed value', { finalValue: finalValue });
  return finalValue;
}

/**
 * Create a new session
 */
function createSession(userEmail, userId) {
  const sessionId = generateIdWithType('session');
  const timestamp = getCurrentTimestamp();
  const sessionTimeout = getSessionTimeout();
  
  const sessionData = {
    sessionId: sessionId,
    userEmail: userEmail,
    userId: userId,
    createdTime: timestamp,
    lastAccessTime: timestamp,
    expiryTime: timestamp + sessionTimeout,
    isActive: true
  };
  
  // Store in CacheService for fast access
  const cacheTimeoutSeconds = Math.floor(sessionTimeout / 1000);
  log('createSession: Storing session', {
    sessionId: sessionId,
    sessionTimeout: sessionTimeout,
    cacheTimeoutSeconds: cacheTimeoutSeconds,
    expiryTime: sessionData.expiryTime
  });
  
  try {
    CacheService.getScriptCache().put(sessionId, JSON.stringify(sessionData), cacheTimeoutSeconds);
    log('createSession: Successfully stored in CacheService');
  } catch (error) {
    logWrn('Failed to store session in CacheService', { error: error.message });
    
    // Fallback to PropertiesService
    try {
      log('createSession: Attempting PropertiesService fallback');
      PropertiesService.getScriptProperties().setProperty(sessionId, JSON.stringify(sessionData));
      log('createSession: Successfully stored in PropertiesService as fallback');
    } catch (propError) {
      logErr('Failed to store session in PropertiesService fallback', { error: propError.message });
    }
  }
  
  // Also store in memory cache
  sessionCache.set(sessionId, {
    data: sessionData,
    timestamp: Date.now()
  });
  log('createSession: Successfully stored in memory cache');
  
  // Log session creation
  logSessionEvent(userEmail, 'session_created', sessionId);
  
  return sessionData;
}

/**
 * Validate session
 */
function validateSession(sessionId) {
  if (!sessionId) {
    log('validateSession: No sessionId provided');
    return null;
  }
  
  log('validateSession: Starting validation', {
    sessionId: sessionId,
    hasMemoryCache: sessionCache.has(sessionId)
  });
  
  // Try memory cache first
  if (sessionCache.has(sessionId)) {
    const cached = sessionCache.get(sessionId);
    const sessionCacheTimeout = getSessionCacheTimeout();
    if (Date.now() - cached.timestamp < sessionCacheTimeout) {
      const sessionData = cached.data;
      
      // Check if session is expired
      const currentTime = getCurrentTimestamp();
      if (sessionData.expiryTime < currentTime) {
        log('Session expired (memory cache)', {
          sessionId: sessionId,
          expiryTime: sessionData.expiryTime,
          currentTime: currentTime,
          expired: true
        });
        invalidateSession(sessionId);
        return null;
      }
      
      // Update last access time and extend session expiry
      const sessionTimeout = getSessionTimeout();
      
      log('Session validation successful (memory cache)', {
        sessionId: sessionId,
        currentTime: currentTime,
        oldExpiryTime: sessionData.expiryTime,
        sessionTimeout: sessionTimeout,
        newExpiryTime: currentTime + sessionTimeout
      });
      
      sessionData.lastAccessTime = currentTime;
      sessionData.expiryTime = currentTime + sessionTimeout; // 延長設定的 SESSION_TIMEOUT 時間
      
      updateSessionCache(sessionId, sessionData);
      
      return sessionData;
    } else {
      log('validateSession: Memory cache expired', {
        sessionId: sessionId,
        cacheAge: Date.now() - cached.timestamp,
        timeout: sessionCacheTimeout
      });
    }
  } else {
    log('validateSession: Not found in memory cache', { sessionId: sessionId });
  }
  
  // Try CacheService
  try {
    const cachedSession = CacheService.getScriptCache().get(sessionId);
    if (cachedSession) {
      const sessionData = JSON.parse(cachedSession);
      
      // Check if session is expired
      const currentTime = getCurrentTimestamp();
      if (sessionData.expiryTime < currentTime) {
        log('Session expired (cache service)', {
          sessionId: sessionId,
          expiryTime: sessionData.expiryTime,
          currentTime: currentTime,
          expired: true
        });
        invalidateSession(sessionId);
        return null;
      }
      
      // Update last access time and extend session expiry
      const sessionTimeout = getSessionTimeout();
      
      log('Session validation successful (cache service)', {
        sessionId: sessionId,
        currentTime: currentTime,
        oldExpiryTime: sessionData.expiryTime,
        sessionTimeout: sessionTimeout,
        newExpiryTime: currentTime + sessionTimeout
      });
      
      sessionData.lastAccessTime = currentTime;
      sessionData.expiryTime = currentTime + sessionTimeout; // 延長設定的 SESSION_TIMEOUT 時間
      
      updateSessionCache(sessionId, sessionData);
      
      return sessionData;
    } else {
      log('validateSession: Not found in CacheService', { sessionId: sessionId });
    }
  } catch (error) {
    logWrn('Failed to retrieve session from cache', { error: error.message });
  }
  
  // Try PropertiesService as fallback
  log('validateSession: Trying PropertiesService fallback');
  try {
    const propSession = PropertiesService.getScriptProperties().getProperty(sessionId);
    if (propSession) {
      const sessionData = JSON.parse(propSession);
      
      // Check if session is expired
      const currentTime = getCurrentTimestamp();
      if (sessionData.expiryTime < currentTime) {
        log('Session expired (PropertiesService)', {
          sessionId: sessionId,
          expiryTime: sessionData.expiryTime,
          currentTime: currentTime,
          expired: true
        });
        invalidateSession(sessionId);
        return null;
      }
      
      // Update last access time and extend session expiry
      const sessionTimeout = getSessionTimeout();
      
      log('Session validation successful (PropertiesService)', {
        sessionId: sessionId,
        currentTime: currentTime,
        oldExpiryTime: sessionData.expiryTime,
        sessionTimeout: sessionTimeout,
        newExpiryTime: currentTime + sessionTimeout
      });
      
      sessionData.lastAccessTime = currentTime;
      sessionData.expiryTime = currentTime + sessionTimeout;
      
      updateSessionCache(sessionId, sessionData);
      
      return sessionData;
    } else {
      log('validateSession: Not found in PropertiesService', { sessionId: sessionId });
    }
  } catch (error) {
    logWrn('Failed to retrieve session from PropertiesService', { error: error.message });
  }
  
  log('validateSession: Session not found anywhere', { sessionId: sessionId });
  return null;
}

/**
 * Update session cache
 */
function updateSessionCache(sessionId, sessionData) {
  // Update memory cache
  sessionCache.set(sessionId, {
    data: sessionData,
    timestamp: Date.now()
  });
  
  // Update CacheService
  try {
    const remainingTime = Math.floor((sessionData.expiryTime - Date.now()) / 1000);
    if (remainingTime > 0) {
      CacheService.getScriptCache().put(sessionId, JSON.stringify(sessionData), remainingTime);
    }
  } catch (error) {
    logWrn('Failed to update session in cache', { error: error.message });
  }
}

/**
 * Invalidate session
 */
function invalidateSession(sessionId) {
  if (!sessionId) {
    return;
  }
  
  log('invalidateSession: Called', {
    sessionId: sessionId,
    stackTrace: new Error().stack
  });
  
  // Get session data for logging
  const sessionData = validateSession(sessionId);
  
  // Remove from memory cache
  sessionCache.delete(sessionId);
  
  // Remove from CacheService
  try {
    CacheService.getScriptCache().remove(sessionId);
  } catch (error) {
    logWrn('Failed to remove session from cache', { error: error.message });
  }
  
  // Remove from PropertiesService
  try {
    PropertiesService.getScriptProperties().deleteProperty(sessionId);
  } catch (error) {
    logWrn('Failed to remove session from PropertiesService', { error: error.message });
  }
  
  // Log session invalidation
  if (sessionData) {
    logSessionEvent(sessionData.userEmail, 'session_invalidated', sessionId);
  }
}

/**
 * Authenticate user with email and password
 */
function authenticateUser(userEmail, password, clientIP = 'unknown') {
  try {
    // Trim whitespace from inputs to avoid copy-paste issues
    userEmail = (userEmail || '').trim();
    password = (password || '').trim();

    // Validate input
    if (!userEmail || !password) {
      return createErrorResponse('INVALID_INPUT', '請輸入帳號密碼');
    }

    // Sanitize email
    userEmail = sanitizeString(userEmail, 100);

    // Get user from database - only email lookup
    const globalData = readGlobalData();
    const user = globalData.users.find(u =>
      u.userEmail === userEmail && u.status === 'active'
    );

    if (!user) {
      // Log failed attempt with IP
      logAuthEvent(userEmail, 'login_failed', 'user_not_found', clientIP);
      return createErrorResponse('AUTHENTICATION_FAILED', '帳號或密碼錯誤，你忘記密碼了？');
    }

    // Verify password
    if (!verifyPassword(password, user.password)) {
      // Log failed attempt with IP
      logAuthEvent(userEmail, 'login_failed', 'invalid_password', clientIP);
      return createErrorResponse('AUTHENTICATION_FAILED', '帳號或密碼錯誤，你忘記密碼了？');
    }

    // Update last login time
    updateUserLastLogin(user.userId, user.userEmail);

    // Create session
    log('authenticateUser: About to create session', {
      userEmail: user.userEmail,
      userId: user.userId,
      clientIP: clientIP
    });
    const sessionData = createSession(user.userEmail, user.userId);
    log('authenticateUser: Session created', {
      sessionId: sessionData.sessionId,
      expiryTime: sessionData.expiryTime
    });

    // Log successful login with IP
    logAuthEvent(userEmail, 'login_success', sessionData.sessionId, clientIP);
    
    // Auto-migrate database if needed (for backwards compatibility)
    autoMigrateIfNeeded();
    
    // Get user's global permissions
    const userPermissions = getUserGlobalPermissions(user.userEmail);
    
    // Get user badges
    const badges = getUserBadges(user.userEmail);
    
    // Get session timeout configuration
    const sessionTimeout = getSessionTimeout();
    
    return createSuccessResponseWithSession(sessionData.sessionId, {
      sessionId: sessionData.sessionId,
      user: {
        userId: user.userId,
        username: user.username,
        userEmail: user.userEmail,
        displayName: user.displayName,
        status: user.status,
        preferences: safeJsonParse(user.preferences, {}),
        permissions: userPermissions,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
        avatarOptions: safeJsonParse(user.avatarOptions, {}),
        badges: badges
      },
      session: {
        sessionId: sessionData.sessionId,
        createdTime: sessionData.createdTime,
        lastAccessTime: sessionData.lastAccessTime,
        expiryTime: sessionData.expiryTime,
        sessionTimeout: sessionTimeout
      }
    });
    
  } catch (error) {
    logErr('Authentication error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Authentication system error');
  }
}

/**
 * Get current user from session
 */
function getCurrentUser(sessionId) {
  try {
    const sessionData = validateSession(sessionId);
    if (!sessionData) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Get user details
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === sessionData.userEmail);
    
    if (!user) {
      invalidateSession(sessionId);
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    if (user.status !== 'active') {
      invalidateSession(sessionId);
      return createErrorResponse('USER_INACTIVE', 'User account is inactive');
    }
    
    // Get user's global permissions
    const userPermissions = getUserGlobalPermissions(user.userEmail);
    
    // Get user badges
    const badges = getUserBadges(user.userEmail);
    
    return createSuccessResponseWithSession(sessionId, {
      user: {
        userId: user.userId,
        username: user.username,
        userEmail: user.userEmail,
        displayName: user.displayName,
        status: user.status,
        preferences: safeJsonParse(user.preferences, {}),
        lastLoginTime: user.lastLoginTime,
        permissions: userPermissions,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
        avatarOptions: safeJsonParse(user.avatarOptions, {}),
        badges: badges
      },
      session: {
        sessionId: sessionData.sessionId,
        createdTime: sessionData.createdTime,
        lastAccessTime: sessionData.lastAccessTime,
        expiryTime: sessionData.expiryTime
      }
    });
    
  } catch (error) {
    logErr('Get current user error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get current user');
  }
}

/**
 * Logout user
 */
function logoutUser(sessionId) {
  try {
    const sessionData = validateSession(sessionId);
    
    if (sessionData) {
      // Log logout
      logSessionEvent(sessionData.userEmail, 'logout', sessionId);
    }
    
    // Invalidate session
    invalidateSession(sessionId);
    
    return createSuccessResponse(null, 'Logged out successfully');
    
  } catch (error) {
    logErr('Logout error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Logout failed');
  }
}

/**
 * Change user password
 */
function changePassword(sessionId, oldPassword, newPassword) {
  try {
    // Validate session
    const sessionData = validateSession(sessionId);
    if (!sessionData) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Validate input
    if (!oldPassword || !newPassword) {
      return createErrorResponse('INVALID_INPUT', 'Old and new passwords are required');
    }
    
    if (newPassword.length < 6) {
      return createErrorResponse('INVALID_INPUT', 'Password must be at least 6 characters');
    }
    
    // Get user
    const globalData = readGlobalData();
    const user = globalData.users.find(u => u.userEmail === sessionData.userEmail);
    
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', 'User not found');
    }
    
    // Verify old password
    if (!verifyPassword(oldPassword, user.password)) {
      logAuthEvent(user.username, 'password_change_failed', 'invalid_old_password');
      return createErrorResponse('AUTHENTICATION_FAILED', 'Invalid old password');
    }
    
    // Hash new password
    const hashedPassword = hashPassword(newPassword);
    
    // Update password in database
    updateSheetRow(null, 'Users', 'userId', user.userId, {
      password: hashedPassword,
      lastModified: getCurrentTimestamp()
    });
    
    // Log password change
    logAuthEvent(user.username, 'password_changed', sessionData.sessionId);
    
    return createSuccessResponseWithSession(sessionId, null, 'Password changed successfully');
    
  } catch (error) {
    logErr('Change password error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to change password');
  }
}

/**
 * Update user last login time
 */
function updateUserLastLogin(userId, userEmail) {
  try {
    updateSheetRow(null, 'Users', 'userId', userId, {
      lastLoginTime: getCurrentTimestamp()
    });
  } catch (error) {
    logWrn('Failed to update last login time', { error: error.message });
  }
}

/**
 * Get user permissions for a project
 */
function getUserProjectPermissions(sessionId, projectId) {
  try {
    // Validate session
    const sessionData = validateSession(sessionId);
    if (!sessionData) {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
    // Get project data
    const projectData = readProjectData(projectId);
    
    // Get user permissions
    const permissions = getUserPermissions(
      sessionData.userEmail,
      projectData.projectgroups,
      projectData.usergroups
    );
    
    return createSuccessResponse({
      userEmail: sessionData.userEmail,
      projectId: projectId,
      permissions: permissions
    });
    
  } catch (error) {
    logErr('Get user permissions error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to get user permissions');
  }
}

/**
 * Check if user has specific permission
 */
function checkUserPermission(sessionId, projectId, requiredPermission) {
  try {
    const permissionsResult = getUserProjectPermissions(sessionId, projectId);
    
    if (!permissionsResult.success) {
      return permissionsResult;
    }
    
    const hasPerms = hasPermission(permissionsResult.data.permissions, requiredPermission);
    
    return createSuccessResponse({
      hasPermission: hasPerms,
      permission: requiredPermission
    });
    
  } catch (error) {
    logErr('Check permission error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Failed to check permission');
  }
}

/**
 * Log authentication events to LOG_SPREADSHEET
 * Uses logSecurityEvent to ensure logging regardless of LOG_LEVEL
 */
function logAuthEvent(username, action, details, clientIP = 'unknown') {
  try {
    // Use logSecurityEvent which bypasses LOG_LEVEL filtering
    // This ensures all authentication attempts are logged for security auditing
    const message = action === 'login_failed' ? 'Authentication failed' : 'Authentication event';

    logSecurityEvent(message, {
      username: username,
      action: action,
      clientIP: clientIP,
      timestamp: new Date().toISOString(),
      details: details,
      responseStatus: action === 'login_failed' ? 'failed' : 'success'
    });

  } catch (error) {
    console.error('Failed to log auth event:', error.message);
  }
}

/**
 * Log session events
 */
function logSessionEvent(userEmail, action, sessionId) {
  try {
    const logEntry = logOperation(userEmail, action, 'session', sessionId, {});
    
    // This would typically be logged to EventLogs sheet
    log('Session Event', logEntry);
    
  } catch (error) {
    logWrn('Failed to log session event', { error: error.message });
  }
}

/**
 * Clean up expired sessions (maintenance function)
 */
function cleanupExpiredSessions() {
  try {
    const currentTime = getCurrentTimestamp();
    let cleanupCount = 0;
    
    // Clean up memory cache
    for (const [sessionId, cached] of sessionCache.entries()) {
      if (cached.data.expiryTime < currentTime) {
        sessionCache.delete(sessionId);
        cleanupCount++;
      }
    }
    
    log('Session cleanup completed', { cleanupCount });
    
    // CacheService automatically handles expiration, but we can clear manually if needed
    
  } catch (error) {
    logErr('Session cleanup error', error);
  }
}

/**
 * Handle login request from frontend (wrapper for authenticateUser)
 */
function handleLogin(params) {
  try {
    // Extract email, password, and IP from params
    const userEmail = params.userEmail || params.email || params.credentials?.userEmail || params.credentials?.email;
    const password = params.password || params.credentials?.password;
    const clientIP = params.clientIP || 'unknown';

    // Call authenticateUser with IP
    return authenticateUser(userEmail, password, clientIP);

  } catch (error) {
    logErr('Handle login error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Login system error');
  }
}

/**
 * Handle logout request from frontend (wrapper for logoutUser)
 */
function handleLogout(params) {
  try {
    const sessionId = params.sessionId || params.sessionData?.sessionId;
    return logoutUser(sessionId);
    
  } catch (error) {
    logErr('Handle logout error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Logout system error');
  }
}

/**
 * Handle session validation from frontend (wrapper for validateSession)
 */
function handleValidateSession(params) {
  try {
    const sessionId = params.sessionId;
    const sessionData = validateSession(sessionId);
    
    if (sessionData) {
      return createSuccessResponse({
        valid: true,
        sessionId: sessionData.sessionId,
        userEmail: sessionData.userEmail,
        userId: sessionData.userId,
        expiryTime: sessionData.expiryTime
      });
    } else {
      return createErrorResponse('SESSION_INVALID', 'Session expired or invalid');
    }
    
  } catch (error) {
    logErr('Handle validate session error', error);
    return createErrorResponse('SYSTEM_ERROR', 'Session validation error');
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSession,
    validateSession,
    invalidateSession,
    authenticateUser,
    getCurrentUser,
    logoutUser,
    changePassword,
    getUserProjectPermissions,
    checkUserPermission,
    cleanupExpiredSessions,
    handleLogin,
    handleLogout,
    handleValidateSession
  };
}