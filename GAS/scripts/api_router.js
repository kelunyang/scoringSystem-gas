/**
 * @fileoverview 重構後的API路由器 - 模組化且安全
 * @module APIRouter
 */

/**
 * Handle API requests with automatic logging and improved security
 */
function handleAPIRequest(method, path, params) {
  const startTime = Date.now();
  
  // Add CORS headers
  const response = {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  };
  
  // Extract session info for logging
  const sessionId = params.sessionId || null;
  const userId = sessionId ? extractUserFromSession(sessionId) : null;
  
  // Debug log for userId extraction
  log('API Router: User ID extraction', {
    sessionId: sessionId,
    extractedUserId: userId,
    typeOfUserId: typeof userId
  });
  
  // Log API request start
  logInfo('handleAPIRequest', `${method} ${path}`, {
    requestData: JSON.stringify({
      path: path,
      method: method,
      sessionId: sessionId,
      hasParams: Object.keys(params).length > 0
    }),
    userId: userId,
    sessionId: sessionId
  });
  
  try {
    let result;
    
    // 使用模組化路由處理器
    const pathPrefix = '/' + path.split('/')[1]; // 取得路由前綴 (e.g., /auth, /users)
    
    // 根據路由前綴分發到相應的處理器
    switch (pathPrefix) {
      case '/auth':
        result = handleAuthRoutes(path, params);
        break;
        
      case '/users':
        result = handleUserRoutes(path, method, params);
        break;
        
      case '/projects':
        result = handleProjectRoutes(path, params);
        break;
        
      case '/groups':
        result = handleGroupRoutes(path, params);
        break;
        
      case '/stages':
        result = handleStageRoutes(path, params);
        break;
        
      case '/submissions':
      case '/rankings':
        result = handleSubmissionRoutes(path, params);
        break;
        
      case '/scoring':
        result = handleScoringRoutes(path, params);
        break;
        
      case '/comments':
        result = handleCommentRoutes(path, params);
        break;
        
      case '/wallets':
        result = handleWalletRoutes(path, params);
        break;
        
      case '/notifications':
        result = handleNotificationRoutes(path, params);
        break;

      case '/eventlogs':
        result = handleEventLogRoutes(path, params);
        break;

      case '/invitations':
        result = handleInvitationRoutes(path, params, params.sessionId);
        break;
        
      case '/tags':
        result = handleTagRoutes(path, params);
        break;
        
      case '/system':
        result = handleSystemRoutes(path, method, params);
        break;
        
      case '/admin':
        result = handleAdminRoutes(path, method, params);
        break;
        
      case '/test':
        result = handleTestRoutes(path, method, params);
        break;
        
      default:
        result = createErrorResponse('NOT_FOUND', 'API endpoint not found: ' + path);
    }
    
    // 如果路由處理器返回null，說明路由不存在
    if (!result) {
      result = createErrorResponse('NOT_FOUND', 'API endpoint not found: ' + path);
    }
    
    // Log API response
    const executionTime = Date.now() - startTime;
    
    // Get detailed error information
    let details = result.success ? '請求成功' : '請求失敗';
    if (result.message) {
      details = result.message;
    } else if (!result.success && result.error) {
      details = `${result.error.code}: ${result.error.message}`;
    }
    
    const logFunction = result.success ? logInfo : logError;
    logFunction('handleAPIRequest', `${method} ${path} - ${result.success ? '成功' : '失敗'}`, {
      responseStatus: result && result.success ? 'success' : 'error',
      executionTime: executionTime,
      userId: userId,
      sessionId: sessionId,
      details: details,
      errorCode: !result.success && result.error ? result.error.code : null
    });
    
    response.body = JSON.stringify(result);
    
  } catch (error) {
    // Log error with full context
    const executionTime = Date.now() - startTime;
    logError('handleAPIRequest', `${method} ${path} - 失敗`, {
      responseStatus: 'error',
      executionTime: executionTime,
      userId: userId,
      sessionId: sessionId,
      details: error.stack || error.toString()
    });
    
    response.body = JSON.stringify(createErrorResponse('SYSTEM_ERROR', 'Internal server error'));
  }
  
  return createJSONResponse(response.body);
}

/**
 * Create JSON response for GAS
 */
function createJSONResponse(jsonString) {
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper function to get current user email from session
 */
function getCurrentUserEmail(sessionId) {
  try {
    const sessionResult = validateSession(sessionId);
    return sessionResult ? sessionResult.userEmail : null;
  } catch (error) {
    return null;
  }
}

/**
 * Handle CORS preflight requests
 * Note: GAS automatically handles CORS when deployed as "Anyone" can access
 */
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Test function to verify API is working
 */
function testAPI() {
  const testParams = {
    path: '/system/health',
    method: 'GET'
  };
  
  const result = handleAPIRequest('GET', '/system/health', {});
  log('API Test Result', result);
  return result;
}

/**
 * Frontend-friendly API handler that returns JavaScript objects
 * This is specifically for google.script.run calls from Vue frontend
 */
function handleAPIRequestForFrontend(method, path, params) {
  try {
    const startTime = Date.now();
    
    // Extract session info for logging
    const sessionId = params.sessionId || null;
    const userId = sessionId ? extractUserFromSession(sessionId) : null;
    
    // Debug log for userId extraction
    log('API Router Frontend: User ID extraction', {
      sessionId: sessionId,
      extractedUserId: userId,
      typeOfUserId: typeof userId
    });
    
    // Log API request start
    logInfo('handleAPIRequestForFrontend', `${method} ${path}`, {
      requestData: JSON.stringify({
        path: path,
        method: method,
        sessionId: sessionId,
        hasParams: Object.keys(params).length > 0
      }),
      userId: userId,
      sessionId: sessionId
    });
    
    let result;
    
    // 使用模組化路由處理器
    const pathPrefix = '/' + path.split('/')[1]; // 取得路由前綴 (e.g., /auth, /users)
    
    // 根據路由前綴分發到相應的處理器
    switch (pathPrefix) {
      case '/auth':
        result = handleAuthRoutes(path, params);
        break;
        
      case '/users':
        result = handleUserRoutes(path, method, params);
        break;
        
      case '/projects':
        result = handleProjectRoutes(path, params);
        break;
        
      case '/groups':
        result = handleGroupRoutes(path, params);
        break;
        
      case '/stages':
        result = handleStageRoutes(path, params);
        break;
        
      case '/submissions':
      case '/rankings':
        result = handleSubmissionRoutes(path, params);
        break;
        
      case '/scoring':
        result = handleScoringRoutes(path, params);
        break;
        
      case '/comments':
        result = handleCommentRoutes(path, params);
        break;
        
      case '/wallets':
        result = handleWalletRoutes(path, params);
        break;
        
      case '/notifications':
        result = handleNotificationRoutes(path, params);
        break;

      case '/eventlogs':
        result = handleEventLogRoutes(path, params);
        break;

      case '/invitations':
        result = handleInvitationRoutes(path, params, params.sessionId);
        break;
        
      case '/tags':
        result = handleTagRoutes(path, params);
        break;
        
      case '/system':
        result = handleSystemRoutes(path, method, params);
        break;
        
      case '/admin':
        result = handleAdminRoutes(path, method, params);
        break;
        
      case '/test':
        result = handleTestRoutes(path, method, params);
        break;
        
      default:
        result = createErrorResponse('NOT_FOUND', 'API endpoint not found: ' + path);
    }
    
    // 如果路由處理器返回null，說明路由不存在
    if (!result) {
      result = createErrorResponse('NOT_FOUND', 'API endpoint not found: ' + path);
    }
    
    // Log response
    const executionTime = Date.now() - startTime;
    
    // Get detailed error information
    let details = result.success ? '請求成功' : '請求失敗';
    if (result.message) {
      details = result.message;
    } else if (!result.success && result.error) {
      details = `${result.error.code}: ${result.error.message}`;
    }
    
    const logFunction = result.success ? logInfo : logError;
    logFunction('handleAPIRequestForFrontend', `${method} ${path} - ${result.success ? '成功' : '失敗'}`, {
      responseStatus: result && result.success ? 'success' : 'error',
      executionTime: executionTime,
      userId: userId,
      sessionId: sessionId,
      details: details,
      errorCode: !result.success && result.error ? result.error.code : null
    });
    
    // Return the result object directly (not wrapped in ContentService)
    return result;
    
  } catch (error) {
    // Log error
    logError('handleAPIRequestForFrontend', `${method} ${path} - 異常`, {
      details: error.stack || error.toString()
    });
    
    // Return error response object
    return createErrorResponse('SYSTEM_ERROR', 'Internal server error: ' + error.message);
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    doPost,
    doOptions,
    handleAPIRequest,
    handleAPIRequestForFrontend,
    createJSONResponse,
    testAPI
  };
}